//! Drives the real binary against a fake nodejs.org served through file://, in throwaway folders, never touching the real
//! home folder, /usr/local or any administrator prompt. Unix only: the Windows path installs an .msi, covered on a real guest.
#![cfg(unix)]

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};

const VERSION: &str = "26.99.0";

fn suffix() -> String {
    let arch = if std::env::consts::ARCH == "aarch64" { "arm64" } else { "x64" };
    if cfg!(target_os = "macos") {
        format!("darwin-{arch}.tar.gz")
    } else {
        format!("linux-{arch}.tar.gz")
    }
}

fn sha256(path: &Path) -> String {
    let out = if cfg!(target_os = "macos") {
        Command::new("shasum").args(["-a", "256"]).arg(path).output()
    } else {
        Command::new("sha256sum").arg(path).output()
    }
    .unwrap();
    String::from_utf8_lossy(&out.stdout).split_whitespace().next().unwrap().to_string()
}

struct Fixture {
    dir: PathBuf,
    dist: PathBuf,
    root: PathBuf,
    bin: PathBuf,
    state: PathBuf,
    home: PathBuf,
}

impl Fixture {
    fn new(tamper: bool) -> Fixture {
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "toolkit-setup-it-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let f = Fixture {
            dist: dir.join("dist"),
            root: dir.join("opt/nodejs"),
            bin: dir.join("bin"),
            state: dir.join("state"),
            home: dir.join("home"),
            dir,
        };
        for d in [&f.dist.join("latest-v26.x"), &f.bin, &f.home] {
            fs::create_dir_all(d).unwrap();
        }
        let tag = format!(
            "node-v{VERSION}-{}",
            suffix().trim_end_matches(".tar.gz").trim_end_matches(".tar.xz")
        );
        let stage = f.dir.join("stage");
        fs::create_dir_all(stage.join(&tag).join("bin")).unwrap();
        for name in ["node", "npm", "npx"] {
            let file = stage.join(&tag).join("bin").join(name);
            fs::write(&file, format!("#!/bin/sh\necho v{VERSION}\n")).unwrap();
            Command::new("chmod").arg("+x").arg(&file).status().unwrap();
        }
        let archive = f
            .dist
            .join("latest-v26.x")
            .join(format!("{tag}.{}", suffix().split_once('.').map(|(_, e)| e).unwrap_or("tar.xz")));
        let flag = if suffix().ends_with(".tar.gz") { "-czf" } else { "-cJf" };
        assert!(
            Command::new("tar")
                .args([flag, archive.to_str().unwrap(), "-C", stage.to_str().unwrap(), &tag])
                .status()
                .unwrap()
                .success()
        );
        let sha = if tamper { "0".repeat(64) } else { sha256(&archive) };
        fs::write(
            f.dist.join("latest-v26.x/SHASUMS256.txt"),
            format!("{sha}  {}\n", archive.file_name().unwrap().to_string_lossy()),
        )
        .unwrap();
        f
    }

    fn run(&self, args: &[&str]) -> Output {
        self.run_with(args, &[])
    }

    /// Like `run`, with extra environment. `TOOLKIT_SETUP_ELEVATE_WITH=none` also lifts the no-elevation guard so the REAL worker
    /// subprocess is launched, as the same user and in a debug build only, never as root.
    fn run_with(&self, args: &[&str], extra: &[(&str, &str)]) -> Output {
        let toolkit = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        Command::new(env!("CARGO_BIN_EXE_toolkit-setup"))
            .args(args)
            .env_clear()
            .env("PATH", format!("{}:/usr/bin:/bin", self.bin.display()))
            .env("HOME", &self.home)
            .env("TOOLKIT_SETUP_TOOLKIT_ROOT", toolkit)
            .env("TOOLKIT_SETUP_TEST_MODE", "1")
            .env("TOOLKIT_SETUP_DIST_BASE", format!("file://{}", self.dist.display()))
            .env("TOOLKIT_SETUP_NODE_ROOT", &self.root)
            .env("TOOLKIT_SETUP_BIN_DIR", &self.bin)
            .env("TOOLKIT_SETUP_STATE_DIR", &self.state)
            .env("TOOLKIT_SETUP_NO_ELEVATE", "1")
            .envs(extra.iter().copied())
            .env_remove(if extra.iter().any(|(k, _)| *k == "TOOLKIT_SETUP_ELEVATE_WITH") {
                "TOOLKIT_SETUP_NO_ELEVATE"
            } else {
                "TOOLKIT_SETUP_UNUSED"
            })
            .current_dir(&self.home)
            .output()
            .unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn json(out: &Output) -> Value {
    serde_json::from_slice(&out.stdout).unwrap_or_else(|e| panic!("not JSON ({e}): {}", String::from_utf8_lossy(&out.stdout)))
}

fn node_row(plan: &Value) -> &Value {
    plan["items"].as_array().unwrap().iter().find(|r| r["id"] == "node").unwrap()
}

#[test]
fn plan_reads_the_latest_release_from_the_checksum_file_and_needs_no_admin_for_a_writable_root() {
    let f = Fixture::new(false);
    let out = f.run(&["plan", "--json"]);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let plan = json(&out);
    let node = node_row(&plan);
    assert_eq!(node["target"], VERSION);
    assert_eq!(
        node["needsAdmin"], false,
        "the install folders are writable, so no approval is needed"
    );
    assert_eq!(plan["items"].as_array().unwrap().len(), 7);
}

#[test]
fn install_node_downloads_verifies_extracts_links_and_records_state() {
    let f = Fixture::new(false);
    let out = f.run(&["install", "node", "--json"]);
    assert!(
        out.status.success(),
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let installed = fs::read_link(f.bin.join("node")).expect("node is symlinked into the bin folder");
    assert!(installed.starts_with(&f.root), "{}", installed.display());
    assert!(
        f.root
            .join(format!(
                "node-v{VERSION}-{}",
                suffix().trim_end_matches(".tar.gz").trim_end_matches(".tar.xz")
            ))
            .join("bin/node")
            .is_file()
    );
    let summary = String::from_utf8_lossy(&out.stdout)
        .lines()
        .last()
        .map(|l| serde_json::from_str::<Value>(l).unwrap())
        .unwrap();
    assert_eq!(summary["ok"], true);
    let status = json(&f.run(&["status", "--json"]));
    assert_eq!(status["state"]["items"]["node"]["status"], "installed");
    assert_eq!(status["state"]["status"], "finished");
    let events = f.run(&["events", "--last", "20"]);
    assert!(String::from_utf8_lossy(&events.stdout).contains("Checksum verified"));
    // A second run sees it as current and does nothing.
    let again = f.run(&["install", "node", "--json"]);
    assert!(String::from_utf8_lossy(&again.stdout).contains("already current"));
}

#[test]
fn a_download_that_fails_its_checksum_is_never_installed() {
    let f = Fixture::new(true);
    let out = f.run(&["install", "node"]);
    assert_eq!(out.status.code(), Some(2), "{}", String::from_utf8_lossy(&out.stdout));
    assert!(String::from_utf8_lossy(&out.stdout).contains("checksum mismatch"));
    assert!(!f.bin.join("node").exists(), "nothing is linked");
    assert!(
        !f.root.exists() || fs::read_dir(&f.root).unwrap().next().is_none(),
        "nothing is extracted"
    );
    assert_eq!(json(&f.run(&["status", "--json"]))["state"]["items"]["node"]["status"], "failed");
}

#[test]
fn needing_administrator_approval_that_cannot_be_asked_for_exits_3_not_2() {
    let f = Fixture::new(false);
    fs::create_dir_all(&f.root).unwrap();
    Command::new("chmod").args(["555"]).arg(&f.root).status().unwrap();
    let out = f.run(&["install", "node"]);
    Command::new("chmod").args(["755"]).arg(&f.root).status().unwrap();
    if unsafe_root() {
        return; // running as root: the folder is writable regardless, so there is nothing to ask for
    }
    assert_eq!(
        out.status.code(),
        Some(3),
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let status = json(&f.run(&["status", "--json"]));
    assert_eq!(status["state"]["items"]["node"]["status"], "needs_authorization");
}

fn unsafe_root() -> bool {
    String::from_utf8_lossy(&Command::new("id").arg("-u").output().unwrap().stdout).trim() == "0"
}

#[test]
fn unknown_items_are_a_usage_error() {
    let f = Fixture::new(false);
    let out = f.run(&["install", "emacs"]);
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown item"));
}

#[test]
fn dependents_are_skipped_when_a_dependency_cannot_install() {
    // A fixture toolkit whose Enchi installer does not exist: hermetic, no network, nothing real is installed.
    let f = Fixture::new(false);
    let toolkit = f.dir.join("toolkit");
    fs::create_dir_all(toolkit.join("Setup_agent_environment/config")).unwrap();
    fs::write(
        toolkit.join("Setup_agent_environment/config/host-bootstrap.manifest.json"),
        r#"{"tool.enchi.posix.install_url":"file:///nonexistent/install.sh","tool.enchi.minimum_version":"0.8.0","tool.node.major":"26"}"#,
    )
    .unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_toolkit-setup"))
        .args(["install", "playwright", "--json"])
        .env_clear()
        .env("PATH", format!("{}:/usr/bin:/bin", f.bin.display()))
        .env("HOME", &f.home)
        .env("TOOLKIT_SETUP_TOOLKIT_ROOT", &toolkit)
        .env("TOOLKIT_SETUP_STATE_DIR", &f.state)
        .env("TOOLKIT_SETUP_NO_ELEVATE", "1")
        .current_dir(&f.home)
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2), "{}", String::from_utf8_lossy(&out.stdout));
    let items = &json(&f.run(&["status", "--json"]))["state"]["items"];
    assert_eq!(items["enchi"]["status"], "failed", "{items}");
    assert_eq!(items["python"]["status"], "skipped", "{items}");
    assert_eq!(items["playwright"]["status"], "skipped", "{items}");
    assert!(items["python"]["message"].as_str().unwrap().contains("depends on enchi"));
}

#[test]
fn a_second_install_is_refused_while_another_run_holds_the_lock() {
    let f = Fixture::new(false);
    fs::create_dir_all(&f.state).unwrap();
    let mut other = Command::new("sleep").arg("30").spawn().unwrap();
    fs::write(f.state.join("run.lock"), format!("{}\n", other.id())).unwrap();
    let out = f.run(&["install", "node"]);
    let _ = other.kill();
    let _ = other.wait();
    assert_eq!(out.status.code(), Some(1), "{}", String::from_utf8_lossy(&out.stdout));
    assert!(String::from_utf8_lossy(&out.stderr).contains("another setup run is in progress"));
    assert!(!f.bin.join("node").exists(), "nothing was installed by the refused run");
}

#[test]
fn the_state_folder_is_private_to_the_user() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new(false);
    assert!(f.run(&["install", "node"]).status.success());
    let mode = fs::metadata(&f.state).unwrap().permissions().mode() & 0o777;
    assert_eq!(
        mode, 0o700,
        "the folder that holds the session token must not be readable by other users (got {mode:o})"
    );
}

#[test]
fn the_real_worker_subprocess_starts_on_the_chosen_port_answers_and_stops() {
    let f = Fixture::new(false);
    let none = [("TOOLKIT_SETUP_ELEVATE_WITH", "none")];
    let started = f.run_with(&["session", "start", "--minutes", "1"], &none);
    assert!(
        started.status.success(),
        "{}{}",
        String::from_utf8_lossy(&started.stdout),
        String::from_utf8_lossy(&started.stderr)
    );
    let status: Value = serde_json::from_slice(&f.run(&["session", "status"]).stdout).unwrap();
    assert_eq!(status["active"], true, "{status}");
    assert!(status["port"].as_u64().unwrap() > 1024);
    assert_eq!(status["method"], "no elevation (test)");
    let again = f.run_with(&["session", "start"], &none);
    assert!(again.status.success(), "starting again reuses the live session");
    let stopped = f.run(&["session", "stop"]);
    assert!(String::from_utf8_lossy(&stopped.stdout).contains("closed"));
    let after: Value = serde_json::from_slice(&f.run(&["session", "status"]).stdout).unwrap();
    assert_eq!(after["active"], false, "{after}");
    assert!(
        !f.state.join("session.token").exists(),
        "the token is removed when the session ends"
    );
    let events = String::from_utf8_lossy(&f.run(&["events", "--last", "20"]).stdout).into_owned();
    assert!(
        events.contains("awaiting_authorization") && events.contains("authorized"),
        "{events}"
    );
}

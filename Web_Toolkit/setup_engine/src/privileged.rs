//! The only operations that ever run with administrator rights, and the only ones the elevated worker accepts.
//! Each is a closed, named operation with validated parameters: there is no "run this command" request.
//!
//! Hardening, because this code runs as root or Administrator on behalf of a user:
//! - the worker ignores the whole environment (`enter_worker_mode`): no `TOOLKIT_SETUP_*` variable can redirect an install, and
//!   in a release build those overrides do not exist at all;
//! - downloads and extraction happen in a fresh directory that only administrators can write, created exclusively;
//! - every tool is run by absolute path from the OS's own folders, never found through PATH;
//! - archive ownership is not restored, and the result is handed to root;
//! - the Node major must be at least the one this binary was built for.

use crate::manifest::embedded_node_major;
use crate::node::{self, DEFAULT_DIST_BASE};
use crate::util::*;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

static WORKER_MODE: AtomicBool = AtomicBool::new(false);

/// Called first thing in the elevated worker. From here on the environment cannot influence an install, and PATH is replaced by
/// the OS's own folders for anything that still resolves a program by name.
pub fn enter_worker_mode() {
    WORKER_MODE.store(true, Ordering::SeqCst);
    let path = if cfg!(windows) {
        let root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        format!("{root}\\System32;{root};{root}\\System32\\Wbem")
    } else {
        "/usr/bin:/bin:/usr/sbin:/sbin".to_string()
    };
    // SAFETY: called at the start of the worker process, before it starts any thread.
    unsafe { env::set_var("PATH", path) };
}

/// Where Node installs. The defaults are fixed. They can be redirected only in a debug build (tests), only outside the worker,
/// and only with `TOOLKIT_SETUP_TEST_MODE=1`.
pub struct Opts {
    pub dist_base: String,
    pub node_root: PathBuf,
    pub bin_dir: PathBuf,
}

impl Opts {
    pub fn from_env() -> Opts {
        let allow =
            cfg!(debug_assertions) && !WORKER_MODE.load(Ordering::SeqCst) && env::var("TOOLKIT_SETUP_TEST_MODE").is_ok_and(|v| v == "1");
        Opts::resolve(allow, |name| env::var(name).ok())
    }

    pub fn resolve(allow_overrides: bool, get: impl Fn(&str) -> Option<String>) -> Opts {
        let pick = |name: &str, default: &str| {
            if allow_overrides {
                get(name).unwrap_or_else(|| default.to_string())
            } else {
                default.to_string()
            }
        };
        Opts {
            dist_base: pick("TOOLKIT_SETUP_DIST_BASE", DEFAULT_DIST_BASE),
            node_root: PathBuf::from(pick("TOOLKIT_SETUP_NODE_ROOT", "/usr/local/lib/nodejs")),
            bin_dir: PathBuf::from(pick("TOOLKIT_SETUP_BIN_DIR", "/usr/local/bin")),
        }
    }
}

pub const ALLOWED_OPS: &[&str] = &["node.install", "git.install", "python.build_deps"];

/// Validates the `major` parameter of `node.install`: digits only, and not below what this binary was built to install.
pub fn check_major(major: &str, floor: u64) -> Res<u64> {
    if major.is_empty() || major.len() > 3 || !major.chars().all(|c| c.is_ascii_digit()) {
        return Err("node.install needs a numeric major".into());
    }
    let value: u64 = major.parse().map_err(|_| "node.install needs a numeric major".to_string())?;
    if value < floor {
        return Err(format!(
            "node.install refuses Node {value}: this setup installs Node {floor} or newer"
        ));
    }
    Ok(value)
}

pub fn run_op(op: &str, params: &HashMap<String, String>, emit: &mut dyn FnMut(&str)) -> Res<String> {
    let opts = Opts::from_env();
    match op {
        "node.install" => {
            let major = params.get("major").map(String::as_str).unwrap_or("");
            check_major(major, embedded_node_major())?;
            node_install(major, &opts, emit)
        }
        "git.install" => git_install(emit),
        "python.build_deps" => build_deps_install(emit),
        other => Err(format!("operation not allowed: {other}")),
    }
}

/// A fresh directory for downloads, under a parent only administrators can write, created exclusively (it fails if anything
/// already exists at that name) so nobody can pre-create it, plant a symlink in it, or swap a file after it is verified.
fn private_workdir(parent: &Path) -> Res<PathBuf> {
    fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    let dir = parent.join(format!(".toolkit-setup-{}", &crate::worker::new_token()[..16]));
    fs::create_dir(&dir).map_err(|e| format!("cannot create a private work folder {}: {e}", dir.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
    }
    Ok(dir)
}

fn download_parent(opts: &Opts) -> PathBuf {
    if cfg!(windows) {
        // Created by the elevated process, so only administrators can change what is inside; the user's %TEMP% is not used.
        PathBuf::from(env::var_os("ProgramData").unwrap_or_else(|| "C:\\ProgramData".into())).join("toolkit-setup")
    } else {
        opts.node_root.clone()
    }
}

fn node_install(major: &str, opts: &Opts, emit: &mut dyn FnMut(&str)) -> Res<String> {
    let latest = node::resolve_latest(&opts.dist_base, major)?;
    emit(&format!("Downloading {} from nodejs.org", latest.file));
    let tmp = private_workdir(&download_parent(opts))?;
    let archive = tmp.join(&latest.file);
    let result = (|| -> Res<String> {
        curl_file(&latest.url, &archive)?;
        let actual = sha256_file(&archive)?;
        if actual != latest.sha256 {
            return Err(format!(
                "checksum mismatch for {} (expected {}, got {actual}); not installing it",
                latest.file, latest.sha256
            ));
        }
        emit("Checksum verified");
        if cfg!(windows) {
            install_msi(&archive, emit)
        } else {
            install_tarball(&archive, &latest, opts, emit)
        }
    })();
    let _ = fs::remove_dir_all(&tmp);
    result.map(|_| format!("Installed Node {}", latest.version))
}

/// Node's Windows installer is signed with the OpenJS Foundation's code-signing certificate. The signer is a constant here, not
/// read from any file or environment, because this runs with administrator rights.
const NODE_MSI_SIGNER_CN: &str = "OpenJS Foundation";

/// The signer's common name from a certificate subject such as `CN=OpenJS Foundation, O=OpenJS Foundation, L=San Francisco`.
/// Only a whole `CN=` component counts, so the name appearing inside another field or as a prefix of a longer name does not.
pub fn signer_is_openjs(subject: &str) -> bool {
    subject
        .split(',')
        .map(str::trim)
        .any(|part| part.strip_prefix("CN=").is_some_and(|cn| cn == NODE_MSI_SIGNER_CN))
}

/// Reads the `STATUS=` and `SUBJECT=` lines our PowerShell snippet prints.
pub fn parse_signature_report(stdout: &str) -> (String, String) {
    let field = |key: &str| {
        stdout
            .lines()
            .find_map(|l| l.trim().strip_prefix(key))
            .unwrap_or("")
            .trim()
            .to_string()
    };
    (field("STATUS="), field("SUBJECT="))
}

/// Accepts only a valid signature by the OpenJS Foundation. Checked in addition to the SHA-256: the checksum comes from the same
/// site as the file, the signature comes from the publisher's certificate.
pub fn check_signature(status: &str, subject: &str) -> Res<()> {
    if status != "Valid" {
        return Err(format!(
            "the Node installer's publisher signature is not valid (status: {}); not installing it",
            if status.is_empty() { "unknown" } else { status }
        ));
    }
    if !signer_is_openjs(subject) {
        return Err(format!(
            "the Node installer is signed by `{subject}`, not by the OpenJS Foundation; not installing it"
        ));
    }
    Ok(())
}

/// Windows PowerShell, from System32 and not from PATH, with a hard timeout so a stalled certificate lookup cannot hang an
/// elevated install. Verified on a real guest: a genuine Node MSI is `Valid` in about 3 seconds, a one-byte change is
/// `HashMismatch`, and a non-MSI file is `UnknownError`.
fn verify_msi_signature(msi: &Path) -> Res<()> {
    let root = env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\Windows"));
    let powershell = root.join("System32").join("WindowsPowerShell").join("v1.0").join("powershell.exe");
    let path = crate::elevate::ps_path(msi)?;
    let script = format!(
        "$s = Get-AuthenticodeSignature -LiteralPath '{path}'; Write-Output ('STATUS=' + $s.Status); Write-Output ('SUBJECT=' + $s.SignerCertificate.Subject)"
    );
    let mut child = std::process::Command::new(powershell)
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("cannot start PowerShell to check the installer's signature: {e}"))?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => std::thread::sleep(std::time::Duration::from_millis(200)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("checking the Node installer's publisher signature did not finish within 90 seconds; not installing it".into());
            }
        }
    }
    let mut text = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = std::io::Read::read_to_string(&mut out, &mut text);
    }
    let (status, subject) = parse_signature_report(&text);
    check_signature(&status, &subject)
}

fn install_msi(msi: &Path, emit: &mut dyn FnMut(&str)) -> Res<String> {
    verify_msi_signature(msi)?;
    emit("Publisher signature verified (OpenJS Foundation)");
    emit("Running the Node installer (msiexec)");
    let status = std::process::Command::new(system_tool("msiexec.exe"))
        .arg("/i")
        .arg(msi)
        .args(["/qn", "/norestart"])
        .status()
        .map_err(|e| format!("cannot start msiexec: {e}"))?;
    match status.code() {
        Some(0) | Some(3010) => Ok(String::new()),
        other => Err(format!("msiexec exited with code {other:?}")),
    }
}

fn running_as_root() -> bool {
    run(system_tool("id"), &["-u"], None).text().trim() == "0"
}

fn install_tarball(archive: &Path, latest: &node::Latest, opts: &Opts, emit: &mut dyn FnMut(&str)) -> Res<String> {
    let tag = latest.file.trim_end_matches(".tar.xz").trim_end_matches(".tar.gz");
    let target = opts.node_root.join(tag);
    fs::create_dir_all(&opts.node_root).map_err(|e| format!("cannot create {}: {e}", opts.node_root.display()))?;
    let _ = fs::remove_dir_all(&target);
    let compression = if latest.file.ends_with(".tar.xz") { "-J" } else { "-z" };
    emit(&format!("Extracting into {}", opts.node_root.display()));
    // `-o` (do not restore owner) in both GNU tar and bsdtar: the release builder's uid and gid must not become the owner of a
    // system-wide Node that runs as root.
    let out = run(
        system_tool("tar"),
        &[
            "-x",
            compression,
            "-o",
            "-f",
            &archive.to_string_lossy(),
            "-C",
            &opts.node_root.to_string_lossy(),
        ],
        None,
    );
    if !out.ok {
        return Err(format!("tar failed: {}", out.stderr.trim()));
    }
    if !target.join("bin/node").is_file() {
        return Err(format!("the archive did not contain {}/bin/node", target.display()));
    }
    if running_as_root() {
        let owner = run(system_tool("chown"), &["-R", "0:0", &target.to_string_lossy()], None);
        if !owner.ok {
            return Err(format!("could not hand the install to root: {}", owner.stderr.trim()));
        }
    }
    let _ = run(system_tool("chmod"), &["-R", "go-w", &target.to_string_lossy()], None);
    if let Err(problem) = ensure_node_runs(&target, emit) {
        let _ = fs::remove_dir_all(&target);
        return Err(problem);
    }
    fs::create_dir_all(&opts.bin_dir).map_err(|e| format!("cannot create {}: {e}", opts.bin_dir.display()))?;
    for name in ["node", "npm", "npx", "corepack"] {
        let source = target.join("bin").join(name);
        if source.exists() {
            link(&source, &opts.bin_dir.join(name))?;
        }
    }
    emit(&format!("Linked node, npm and npx into {}", opts.bin_dir.display()));
    Ok(String::new())
}

#[cfg(unix)]
fn link(source: &Path, dest: &Path) -> Res<()> {
    let _ = fs::remove_file(dest);
    std::os::unix::fs::symlink(source, dest).map_err(|e| format!("cannot link {}: {e}", dest.display()))
}

#[cfg(not(unix))]
fn link(_source: &Path, _dest: &Path) -> Res<()> {
    Err("symlinks are not used on Windows".into())
}

/// winget lives in a per-user alias folder that the user (and so any same-user process) can write, so the elevated worker
/// uses the administrator-owned copy under Program Files instead.
fn winget_path() -> Option<PathBuf> {
    let apps = PathBuf::from(env::var_os("ProgramFiles")?).join("WindowsApps");
    let mut found: Vec<PathBuf> = fs::read_dir(apps)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with("Microsoft.DesktopAppInstaller_"))
                && p.join("winget.exe").is_file()
        })
        .collect();
    found.sort();
    found.pop().map(|p| p.join("winget.exe"))
}

/// Package names per Linux package manager (they differ: Debian's `libatomic1` is Fedora's `libatomic` and Arch's `gcc-libs`).
pub struct PmPackages {
    pub apt: &'static [&'static str],
    pub dnf: &'static [&'static str],
    pub pacman: &'static [&'static str],
    pub zypper: &'static [&'static str],
}

const GIT_PACKAGES: PmPackages = PmPackages {
    apt: &["git"],
    dnf: &["git"],
    pacman: &["git"],
    zypper: &["git"],
};
/// Node's official Linux build links libatomic, which a minimal image or container often lacks.
const ATOMIC_PACKAGES: PmPackages = PmPackages {
    apt: &["libatomic1"],
    dnf: &["libatomic"],
    pacman: &["gcc-libs"],
    zypper: &["libatomic1"],
};
/// Enchi compiles CPython from source on Linux: a compiler, make, pkg-config and the development headers of the libraries Python's
/// standard modules need (OpenSSL for pip's HTTPS, zlib, bzip2, lzma, readline, sqlite, libffi, ncurses).
const BUILD_PACKAGES: PmPackages = PmPackages {
    apt: &[
        "build-essential",
        "pkg-config",
        "libssl-dev",
        "zlib1g-dev",
        "libbz2-dev",
        "liblzma-dev",
        "libreadline-dev",
        "libsqlite3-dev",
        "libffi-dev",
        "libncurses-dev",
    ],
    dnf: &[
        "gcc",
        "make",
        "pkgconf-pkg-config",
        "openssl-devel",
        "zlib-devel",
        "bzip2-devel",
        "xz-devel",
        "readline-devel",
        "sqlite-devel",
        "libffi-devel",
        "ncurses-devel",
    ],
    pacman: &[
        "base-devel",
        "openssl",
        "zlib",
        "bzip2",
        "xz",
        "readline",
        "sqlite",
        "libffi",
        "ncurses",
    ],
    zypper: &[
        "gcc",
        "make",
        "pkg-config",
        "libopenssl-devel",
        "zlib-devel",
        "libbz2-devel",
        "xz-devel",
        "readline-devel",
        "sqlite3-devel",
        "libffi-devel",
        "ncurses-devel",
    ],
};

type Steps = Vec<(PathBuf, Vec<String>)>;

/// The commands that install `packages` with whichever package manager this machine has. Pure (the lookup is injected) so the
/// package-name mapping is unit tested without a package manager.
pub fn pm_steps(packages: &PmPackages, find: &dyn Fn(&str) -> Option<PathBuf>) -> Option<Steps> {
    let strs = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let with = |head: &[&str], pkgs: &[&str]| strs(&[head, pkgs].concat());
    if let Some(apt) = find("apt-get") {
        return Some(vec![
            (apt.clone(), strs(&["update"])),
            (apt, with(&["install", "-y"], packages.apt)),
        ]);
    }
    for dnf_like in ["dnf", "yum"] {
        if let Some(dnf) = find(dnf_like) {
            return Some(vec![(dnf, with(&["install", "-y"], packages.dnf))]);
        }
    }
    if let Some(pacman) = find("pacman") {
        return Some(vec![(pacman, with(&["-Sy", "--noconfirm"], packages.pacman))]);
    }
    find("zypper").map(|zypper| vec![(zypper, with(&["install", "-y"], packages.zypper))])
}

/// True on Linux when a CPython source build would fail for want of tools or headers. Mirrors what Enchi's own preflight
/// checks (`make`, a compiler, `pkg-config`) plus the OpenSSL and zlib headers pip depends on. Never true on other systems.
pub fn linux_build_deps_missing() -> bool {
    if !cfg!(target_os = "linux") {
        return false;
    }
    let any = |names: &[&str]| names.iter().any(|n| which(n).is_some());
    if !any(&["make", "gmake"]) || !any(&["cc", "gcc", "clang"]) || which("pkg-config").is_none() {
        return true;
    }
    !run("pkg-config", &["--exists", "openssl", "zlib"], None).ok
}

fn build_deps_install(emit: &mut dyn FnMut(&str)) -> Res<String> {
    if !cfg!(target_os = "linux") {
        return Err("python.build_deps applies to Linux only".into());
    }
    let steps = pm_steps(&BUILD_PACKAGES, &trusted_tool).ok_or("no supported package manager found; install a C compiler, make, pkg-config and the OpenSSL, zlib, readline, sqlite and libffi development packages by hand")?;
    emit("Installing the build tools and libraries Python is compiled with");
    run_steps(steps, emit)?;
    Ok("Installed the Python build prerequisites".into())
}

fn run_steps(steps: Steps, emit: &mut dyn FnMut(&str)) -> Res<()> {
    for (program, args) in steps {
        emit(&format!(
            "{} {}",
            program.file_name().unwrap_or_default().to_string_lossy(),
            args.join(" ")
        ));
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = run(&program, &arg_refs, None);
        // winget: 0x8A15002B (no applicable update) and 0x8A150061 (already installed) mean the package is there, which is the goal.
        let already_there = matches!(out.code, Some(-1978335189) | Some(-1978335135));
        if !out.ok && !already_there {
            // The last few lines, not just the last: a package manager's final line is often only "log is available at ...".
            let text = out.text();
            let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
            let tail = lines[lines.len().saturating_sub(3)..].join(" | ");
            let name = program.file_name().unwrap_or_default().to_string_lossy().into_owned();
            return Err(format!("{name} failed (exit {:?}): {tail}", out.code));
        }
    }
    Ok(())
}

/// Runs the freshly extracted Node before it is linked into place, so a Node that cannot start never replaces a working one. On a
/// minimal Linux the usual cause is a missing libatomic: install it and try again.
fn ensure_node_runs(target: &Path, emit: &mut dyn FnMut(&str)) -> Res<()> {
    let node = target.join("bin/node");
    let first = run(&node, &["--version"], None);
    if first.ok {
        return Ok(());
    }
    let why = first.text();
    if cfg!(target_os = "linux") && why.contains("libatomic") {
        emit("Node needs the libatomic library, which this machine lacks; installing it");
        let steps = pm_steps(&ATOMIC_PACKAGES, &trusted_tool)
            .ok_or("Node needs libatomic and no supported package manager was found; install libatomic by hand")?;
        run_steps(steps, emit)?;
        let again = run(&node, &["--version"], None);
        if again.ok {
            return Ok(());
        }
        return Err(format!("Node still does not start after installing libatomic: {}", again.text()));
    }
    Err(format!("the installed Node does not start: {why}"))
}

fn git_install(emit: &mut dyn FnMut(&str)) -> Res<String> {
    if cfg!(target_os = "macos") {
        return Err("Git on macOS comes with the Xcode Command Line Tools, which need no administrator step here".into());
    }
    let steps: Steps = if cfg!(windows) {
        let winget = winget_path().ok_or("winget (App Installer) was not found under Program Files; install Git for Windows by hand")?;
        let args = [
            "install",
            "--id",
            "Git.Git",
            "--exact",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--silent",
        ];
        vec![(winget, args.iter().map(|s| s.to_string()).collect())]
    } else {
        pm_steps(&GIT_PACKAGES, &trusted_tool).ok_or("no supported package manager found; install Git by hand")?
    };
    run_steps(steps, emit)?;
    Ok("Installed Git".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_closed_named_operations_are_allowed() {
        let mut sink = |_: &str| {};
        assert!(run_op("rm.everything", &HashMap::new(), &mut sink).is_err());
        assert!(run_op("shell", &HashMap::new(), &mut sink).is_err());
        for bad in ["", "26; rm -rf /", "../..", "12345", "x"] {
            let params = HashMap::from([("major".to_string(), bad.to_string())]);
            assert!(
                run_op("node.install", &params, &mut sink).is_err(),
                "{bad:?} must be rejected before any network or disk work"
            );
        }
        assert_eq!(ALLOWED_OPS, &["node.install", "git.install", "python.build_deps"]);
    }

    #[test]
    fn the_node_major_cannot_be_used_to_downgrade() {
        assert_eq!(check_major("26", 26).unwrap(), 26);
        assert_eq!(check_major("30", 26).unwrap(), 30);
        assert!(check_major("18", 26).unwrap_err().contains("26 or newer"));
        assert!(check_major("0", 26).is_err());
        assert!(check_major("2x", 26).is_err());
        assert!(
            embedded_node_major() >= 22,
            "the binary carries a real floor taken from the manifest it was built with"
        );
    }

    #[test]
    fn the_environment_cannot_redirect_an_install_unless_overrides_are_explicitly_allowed() {
        let evil = |name: &str| match name {
            "TOOLKIT_SETUP_DIST_BASE" => Some("https://evil.example/dist".to_string()),
            "TOOLKIT_SETUP_NODE_ROOT" => Some("/tmp/evil".to_string()),
            "TOOLKIT_SETUP_BIN_DIR" => Some("/tmp/evil/bin".to_string()),
            _ => None,
        };
        let locked = Opts::resolve(false, evil);
        assert_eq!(locked.dist_base, DEFAULT_DIST_BASE);
        assert_eq!(locked.node_root, PathBuf::from("/usr/local/lib/nodejs"));
        assert_eq!(locked.bin_dir, PathBuf::from("/usr/local/bin"));
        assert_eq!(Opts::resolve(true, evil).dist_base, "https://evil.example/dist");
    }

    #[test]
    fn a_private_workdir_is_exclusive_and_unix_private() {
        let parent = temp_dir("privwork-test").unwrap();
        let a = private_workdir(&parent).unwrap();
        let b = private_workdir(&parent).unwrap();
        assert_ne!(a, b, "names are unpredictable and never reused");
        assert!(fs::create_dir(&a).is_err(), "an existing work folder can never be adopted");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(&a).unwrap().permissions().mode() & 0o777, 0o700);
        }
        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn package_names_follow_each_package_manager() {
        let only = |name: &'static str| move |n: &str| (n == name).then(|| PathBuf::from(format!("/usr/bin/{n}")));
        let args = |steps: Steps| {
            steps
                .into_iter()
                .map(|(p, a)| format!("{} {}", p.file_name().unwrap().to_string_lossy(), a.join(" ")))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            args(pm_steps(&ATOMIC_PACKAGES, &only("apt-get")).unwrap()),
            vec!["apt-get update", "apt-get install -y libatomic1"]
        );
        assert_eq!(
            args(pm_steps(&ATOMIC_PACKAGES, &only("dnf")).unwrap()),
            vec!["dnf install -y libatomic"]
        );
        assert_eq!(
            args(pm_steps(&ATOMIC_PACKAGES, &only("yum")).unwrap()),
            vec!["yum install -y libatomic"]
        );
        assert_eq!(
            args(pm_steps(&ATOMIC_PACKAGES, &only("pacman")).unwrap()),
            vec!["pacman -Sy --noconfirm gcc-libs"]
        );
        assert_eq!(
            args(pm_steps(&ATOMIC_PACKAGES, &only("zypper")).unwrap()),
            vec!["zypper install -y libatomic1"]
        );
        assert_eq!(
            args(pm_steps(&GIT_PACKAGES, &only("apt-get")).unwrap()),
            vec!["apt-get update", "apt-get install -y git"]
        );
        assert!(
            pm_steps(&GIT_PACKAGES, &|_| None).is_none(),
            "no package manager: the caller explains it"
        );
    }

    #[test]
    fn every_package_manager_gets_a_compiler_make_and_the_openssl_headers_for_a_python_build() {
        let sets: [(&str, &[&str]); 4] = [
            ("apt", BUILD_PACKAGES.apt),
            ("dnf", BUILD_PACKAGES.dnf),
            ("pacman", BUILD_PACKAGES.pacman),
            ("zypper", BUILD_PACKAGES.zypper),
        ];
        for (pm, pkgs) in sets {
            let has = |needle: &str| pkgs.iter().any(|p| p.contains(needle));
            assert!(has("gcc") || has("build-essential") || has("base-devel"), "{pm}: a compiler");
            assert!(has("make") || has("build-essential") || has("base-devel"), "{pm}: make");
            assert!(has("ssl"), "{pm}: OpenSSL headers (without them Python builds without pip's HTTPS)");
            assert!(has("zlib") && has("sqlite") && has("ffi"), "{pm}: zlib, sqlite and libffi");
        }
        let steps = pm_steps(&BUILD_PACKAGES, &|n| (n == "apt-get").then(|| PathBuf::from("/usr/bin/apt-get"))).unwrap();
        assert_eq!(
            steps[1].1[..2],
            ["install".to_string(), "-y".to_string()],
            "all packages go in one install command"
        );
        assert!(steps[1].1.contains(&"build-essential".to_string()) && steps[1].1.contains(&"libssl-dev".to_string()));
    }

    #[test]
    fn only_a_valid_signature_by_the_openjs_foundation_is_accepted() {
        let real = "CN=OpenJS Foundation, O=OpenJS Foundation, L=San Francisco, S=California, C=US";
        assert!(signer_is_openjs(real));
        assert!(check_signature("Valid", real).is_ok());
        // A valid signature by someone else, or the name only inside another field, is not the publisher.
        assert!(!signer_is_openjs("CN=Evil Corp, O=OpenJS Foundation"));
        assert!(!signer_is_openjs("CN=Evil Corp, OU=OpenJS Foundation, O=Evil"));
        assert!(!signer_is_openjs("CN=OpenJS Foundation Fake, O=Evil"));
        assert!(!signer_is_openjs("CN=The OpenJS Foundation"));
        assert!(!signer_is_openjs(""));
        assert!(
            check_signature("Valid", "CN=Evil Corp, O=Evil")
                .unwrap_err()
                .contains("not by the OpenJS Foundation")
        );
        // The statuses seen on a real guest for a modified file and a non-installer, plus the usual failures.
        for bad in ["HashMismatch", "UnknownError", "NotSigned", "NotTrusted", "Incompatible", ""] {
            assert!(check_signature(bad, real).is_err(), "{bad:?} must never install");
        }
    }

    #[test]
    fn the_signature_report_is_parsed_from_the_powershell_output() {
        let out = "STATUS=Valid\r\nSUBJECT=CN=OpenJS Foundation, O=OpenJS Foundation, L=San Francisco, S=California, C=US\r\n";
        let (status, subject) = parse_signature_report(out);
        assert_eq!(status, "Valid");
        assert!(signer_is_openjs(&subject), "{subject}");
        assert_eq!(parse_signature_report("garbage"), (String::new(), String::new()));
    }

    #[test]
    fn a_node_that_cannot_start_is_reported_and_never_linked() {
        let dir = temp_dir("node-broken").unwrap();
        fs::create_dir_all(dir.join("bin")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::write(
                dir.join("bin/node"),
                "#!/bin/sh\necho \"node: error while loading shared libraries: libfoo.so.9\" >&2\nexit 127\n",
            )
            .unwrap();
            fs::set_permissions(dir.join("bin/node"), fs::Permissions::from_mode(0o755)).unwrap();
            let mut sink = |_: &str| {};
            let err = ensure_node_runs(&dir, &mut sink).unwrap_err();
            assert!(err.contains("does not start") && err.contains("libfoo"), "{err}");
        }
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn trusted_tools_come_from_system_folders_only() {
        if cfg!(unix) {
            let tar = trusted_tool("tar").expect("tar is in a system folder");
            assert!(
                ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].iter().any(|d| tar.starts_with(d)),
                "{}",
                tar.display()
            );
        }
        assert!(trusted_tool("definitely-not-a-real-tool-xyz").is_none());
        assert_eq!(
            system_tool("definitely-not-a-real-tool-xyz"),
            PathBuf::from("definitely-not-a-real-tool-xyz")
        );
    }
}

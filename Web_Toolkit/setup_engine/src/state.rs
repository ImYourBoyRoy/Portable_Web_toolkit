//! Run state and the event log. Both live in a folder the user owns (`.runtime/setup/`), written only by the unprivileged
//! engine process (the elevated worker streams its output back over the socket), so a user can always read and remove them.
//! A model or a GUI follows a run by reading `state.json` and tailing `events.jsonl`.

use crate::util::{Res, now_iso};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct ItemState {
    pub status: String,
    pub message: String,
    #[serde(default)]
    pub installed: String,
    #[serde(default)]
    pub target: String,
    #[serde(default, rename = "finishedAt")]
    pub finished_at: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct RunState {
    #[serde(rename = "runId")]
    pub run_id: String,
    pub status: String,
    #[serde(rename = "startedAt")]
    pub started_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub items: BTreeMap<String, ItemState>,
    #[serde(default)]
    pub note: String,
}

/// Creates the setup folder (and parents) if needed. A folder created here is private to the user (0700 on Unix) because it
/// holds the session token; one that already exists keeps the mode its owner gave it.
pub fn ensure_private_dir(dir: &Path) -> Res<()> {
    let existed = dir.exists();
    fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    #[cfg(unix)]
    if !existed {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
    }
    Ok(())
}

pub struct Store {
    dir: PathBuf,
    pub json_events: bool,
    pub state: RunState,
}

impl Store {
    pub fn open(dir: &Path, json_events: bool) -> Res<Store> {
        ensure_private_dir(dir)?;
        let state = fs::read_to_string(dir.join("state.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Ok(Store {
            dir: dir.to_path_buf(),
            json_events,
            state,
        })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn begin_run(&mut self) {
        let now = now_iso();
        self.state = RunState {
            run_id: format!("run-{}", crate::util::now_secs()),
            status: "running".into(),
            started_at: now.clone(),
            updated_at: now,
            ..Default::default()
        };
        self.save();
    }

    pub fn set_status(&mut self, status: &str, note: &str) {
        self.state.status = status.into();
        self.state.note = note.into();
        self.save();
    }

    pub fn set_item(&mut self, id: &str, status: &str, message: &str, installed: &str, target: &str) {
        let finished = if matches!(status, "installed" | "current" | "failed" | "skipped") {
            now_iso()
        } else {
            String::new()
        };
        self.state.items.insert(
            id.into(),
            ItemState {
                status: status.into(),
                message: message.into(),
                installed: installed.into(),
                target: target.into(),
                finished_at: finished,
            },
        );
        self.save();
    }

    /// Appends one event to `events.jsonl` and, for people, prints a readable line (or the JSON line with `--json`).
    pub fn event(&mut self, kind: &str, item: &str, message: &str) {
        let line = json!({ "ts": now_iso(), "type": kind, "item": item, "message": message });
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(self.dir.join("events.jsonl")) {
            let _ = writeln!(file, "{line}");
        }
        if self.json_events {
            println!("{line}");
        } else if item.is_empty() {
            println!("[setup] {message}");
        } else {
            println!("[setup] {item}: {message}");
        }
    }

    fn save(&mut self) {
        self.state.updated_at = now_iso();
        let Ok(text) = serde_json::to_string_pretty(&self.state) else {
            return;
        };
        let tmp = self.dir.join("state.json.tmp");
        if fs::write(&tmp, format!("{text}\n")).is_ok() {
            let _ = fs::rename(&tmp, self.dir.join("state.json"));
        }
    }

    pub fn recent_events(&self, last: usize) -> Vec<Value> {
        let text = fs::read_to_string(self.dir.join("events.jsonl")).unwrap_or_default();
        let lines: Vec<&str> = text.lines().collect();
        lines[lines.len().saturating_sub(last)..]
            .iter()
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect()
    }
}

/// One install run at a time: a model and a GUI starting installs together would interleave `state.json` and could run two
/// installers at once. The lock file holds the owner's pid; one left by a dead process is taken over.
pub struct RunLock {
    path: PathBuf,
}

impl Drop for RunLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn pid_alive(pid: u32) -> bool {
    if cfg!(windows) {
        crate::util::run("tasklist", &["/FI", &format!("PID eq {pid}"), "/NH"], None)
            .stdout
            .split_whitespace()
            .any(|w| w == pid.to_string())
    } else {
        crate::util::run("kill", &["-0", &pid.to_string()], None).ok
    }
}

pub fn acquire_lock(dir: &Path) -> Res<RunLock> {
    ensure_private_dir(dir)?;
    let path = dir.join("run.lock");
    for _ in 0..2 {
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                let _ = writeln!(file, "{}", std::process::id());
                return Ok(RunLock { path });
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                let owner = fs::read_to_string(&path).ok().and_then(|t| t.trim().parse::<u32>().ok());
                if let Some(pid) = owner.filter(|p| *p != std::process::id() && pid_alive(*p)) {
                    return Err(format!(
                        "another setup run is in progress (pid {pid}); wait for it, or read `toolkit-setup status`"
                    ));
                }
                let _ = fs::remove_file(&path);
            }
            Err(e) => return Err(format!("cannot take the run lock: {e}")),
        }
    }
    Err("could not take the run lock".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_run_at_a_time_and_a_dead_owner_is_taken_over() {
        let dir = std::env::temp_dir().join(format!("setup-lock-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let first = acquire_lock(&dir).unwrap();
        // The lock records a pid that is alive (this test process's parent shell is not guaranteed, so use a child).
        let mut child = std::process::Command::new(if cfg!(windows) { "ping" } else { "sleep" })
            .args(if cfg!(windows) { vec!["-n", "30", "127.0.0.1"] } else { vec!["30"] })
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        fs::write(dir.join("run.lock"), format!("{}\n", child.id())).unwrap();
        let busy = acquire_lock(&dir).err().expect("a live owner blocks a second run");
        assert!(busy.contains("another setup run is in progress"), "{busy}");
        let _ = child.kill();
        let _ = child.wait();
        fs::write(dir.join("run.lock"), "999999999\n").unwrap();
        let taken = acquire_lock(&dir).expect("a lock left by a dead process is taken over");
        drop(taken);
        assert!(!dir.join("run.lock").exists(), "the lock is released when the run ends");
        drop(first);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn state_and_events_round_trip_in_a_user_owned_folder() {
        let dir = std::env::temp_dir().join(format!("setup-state-test-{}", std::process::id()));
        let mut store = Store::open(&dir, false).unwrap();
        store.begin_run();
        store.set_item("node", "installed", "ok", "26.5.0", "26.13.1");
        store.event("item_finished", "node", "done");
        let reopened = Store::open(&dir, false).unwrap();
        assert_eq!(reopened.state.items["node"].target, "26.13.1");
        assert_eq!(reopened.recent_events(5).len(), 1);
        assert!(reopened.state.run_id.starts_with("run-"));
        let _ = fs::remove_dir_all(&dir);
    }
}

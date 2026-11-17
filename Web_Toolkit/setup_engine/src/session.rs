//! The authorization window from the client side: start it (one OS approval), reuse it while it is alive, stop it.
//! `session.json` (the port and how it was approved) and `session.token` live in the user-owned setup folder. The elevated
//! worker never writes there: the client picks the port and hands it over on the command line.

use crate::elevate::{self, Launched};
use crate::state::Store;
use crate::util::*;
use crate::worker::{self, Pulse};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub struct Session {
    pub port: u16,
    pub token: String,
}

fn token_file(dir: &Path) -> PathBuf {
    dir.join("session.token")
}
fn info_file(dir: &Path) -> PathBuf {
    dir.join("session.json")
}

/// A worker never lives longer than this (see `worker::MAX_LIFETIME`); session files older than it are stale, so a stranger who
/// later took the same port is never mistaken for it.
const MAX_SESSION_AGE_SECS: u64 = 60 * 60 + 120;

fn read_session(dir: &Path) -> Option<Session> {
    let info: serde_json::Value = serde_json::from_str(&fs::read_to_string(info_file(dir)).ok()?).ok()?;
    if now_secs().saturating_sub(info["startedEpoch"].as_u64()?) > MAX_SESSION_AGE_SECS {
        let _ = fs::remove_file(info_file(dir));
        return None;
    }
    let port = u16::try_from(info["port"].as_u64()?).ok()?;
    let token = fs::read_to_string(token_file(dir)).ok()?.trim().to_string();
    (!token.is_empty()).then_some(Session { port, token })
}

/// A live worker (idle or busy with an install), or none. Stale files from a worker that has gone are removed.
pub fn alive(dir: &Path) -> Option<Session> {
    let session = read_session(dir)?;
    match worker::pulse(session.port, &session.token) {
        Pulse::Alive | Pulse::Busy => Some(session),
        Pulse::Dead => {
            let _ = fs::remove_file(info_file(dir));
            None
        }
    }
}

#[cfg(unix)]
fn write_private(path: &Path, text: &str) -> Res<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn write_private(path: &Path, text: &str) -> Res<()> {
    fs::write(path, text).map_err(|e| e.to_string())?;
    // Windows has no 0600: drop the inherited permissions and keep only the current user (an elevated copy of the same account
    // can still read it). Best effort; the setup folder's own ACL applies if this fails.
    if let Ok(user) = std::env::var("USERNAME") {
        let _ = run(
            "icacls",
            &[&path.to_string_lossy(), "/inheritance:r", "/grant:r", &format!("{user}:F")],
            None,
        );
    }
    Ok(())
}

/// Starts the window (or reuses a live one). Errors that mean "the person did not approve" start with `authorization:`.
pub fn start(exe: &Path, store: &mut Store, idle_secs: u64, wait_secs: u64) -> Res<Session> {
    let dir = store.dir().to_path_buf();
    if let Some(session) = alive(&dir) {
        return Ok(session);
    }
    let token = worker::new_token();
    // A fresh token file each time, never a symlink someone else left behind.
    let _ = fs::remove_file(token_file(&dir));
    write_private(&token_file(&dir), &token)?;
    let port = worker::pick_port()?;
    // A bad path is not a refusal to approve: only "nobody can be asked" and "declined" are `authorization:` errors.
    let Launched { method, mut child } = elevate::launch_worker(exe, port, &token_file(&dir), idle_secs)
        .map_err(|e| if e.starts_with("path:") { e } else { format!("authorization: {e}") })?;
    let info =
        json!({"port": port, "method": method.label(), "startedAt": now_iso(), "startedEpoch": now_secs(), "idleSeconds": idle_secs});
    let _ = fs::write(info_file(&dir), format!("{info}\n"));
    store.set_status(
        "awaiting_authorization",
        &format!("Waiting for approval through {}", method.label()),
    );
    store.event(
        "awaiting_authorization",
        "",
        &format!("Waiting for administrator approval through {}", method.label()),
    );
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(wait_secs) {
        if worker::pulse(port, &token) != Pulse::Dead {
            store.set_status("running", "");
            store.event(
                "authorized",
                "",
                &format!("Administrator session open for {} minutes of inactivity", idle_secs / 60),
            );
            return Ok(Session { port, token });
        }
        if let Some(c) = child.as_mut()
            && let Ok(Some(status)) = c.try_wait()
            && !status.success()
        {
            let _ = fs::remove_file(token_file(&dir));
            let _ = fs::remove_file(info_file(&dir));
            return Err(format!("authorization: the request was declined or failed ({status})"));
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    let _ = fs::remove_file(token_file(&dir));
    let _ = fs::remove_file(info_file(&dir));
    Err(format!("authorization: no approval within {wait_secs} seconds"))
}

pub fn stop(dir: &Path) -> bool {
    let stopped = alive(dir).is_some_and(|s| {
        let mut sink = |_: &str| {};
        worker::call(s.port, &s.token, "shutdown", &[], &mut sink).is_ok()
    });
    for f in [token_file(dir), info_file(dir)] {
        let _ = fs::remove_file(f);
    }
    stopped
}

pub fn status(dir: &Path) -> serde_json::Value {
    match alive(dir) {
        Some(s) => {
            let info: serde_json::Value = fs::read_to_string(info_file(dir))
                .ok()
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or(json!({}));
            json!({"active": true, "port": s.port, "method": info["method"], "startedAt": info["startedAt"], "idleSeconds": info["idleSeconds"]})
        }
        None => json!({"active": false}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_session_older_than_any_worker_can_live_is_stale_even_if_something_listens_on_its_port() {
        let dir = temp_dir("session-stale").unwrap();
        // A stranger holding the port: accepts connections and never answers, which would otherwise look like a busy worker.
        let stranger = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = stranger.local_addr().unwrap().port();
        fs::write(token_file(&dir), "t".repeat(64)).unwrap();
        let old = now_secs() - MAX_SESSION_AGE_SECS - 10;
        fs::write(info_file(&dir), format!("{{\"port\":{port},\"startedEpoch\":{old}}}")).unwrap();
        assert!(alive(&dir).is_none(), "an expired session is never trusted");
        assert!(!info_file(&dir).exists(), "and its file is cleaned up");
        let _ = fs::remove_dir_all(dir);
    }
}

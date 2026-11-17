//! The authorization window. One elevated worker listens on 127.0.0.1 and answers only requests that carry the session token
//! (a 0600 file in the user's setup folder) and name one of the closed operations in `privileged.rs`. It stays alive for a
//! short idle period so several installs, and a retry of a failed one, need one approval instead of one each.

use crate::privileged::{ALLOWED_OPS, run_op};
use crate::util::*;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::time::{Duration, Instant};

const MAX_REQUEST_BYTES: u64 = 8 * 1024;
const MAX_LIFETIME: Duration = Duration::from_secs(60 * 60);

#[derive(Deserialize)]
struct Request {
    token: String,
    op: String,
    #[serde(default)]
    params: HashMap<String, String>,
}

pub fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut diff = (a.len() ^ b.len()) as u8;
    for i in 0..a.len().max(b.len()) {
        diff |= a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0);
    }
    diff == 0
}

pub fn new_token() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut bytes = Vec::with_capacity(32);
    #[cfg(unix)]
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        let mut buf = [0u8; 32];
        if f.read_exact(&mut buf).is_ok() {
            bytes.extend_from_slice(&buf);
        }
    }
    while bytes.len() < 32 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(now_secs());
        bytes.extend_from_slice(&h.finish().to_le_bytes());
    }
    bytes.iter().take(32).map(|b| format!("{b:02x}")).collect()
}

fn send(stream: &mut TcpStream, value: serde_json::Value) {
    let _ = writeln!(stream, "{value}");
    let _ = stream.flush();
}

enum Control {
    Continue,
    Stop,
}

/// Reads one request line with a hard overall deadline: a client that sends a byte at a time cannot hold the worker.
fn read_request(stream: &mut TcpStream) -> Option<String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    let (mut buf, mut byte) = (Vec::new(), [0u8; 1]);
    loop {
        let left = deadline.checked_duration_since(Instant::now())?;
        if buf.len() as u64 >= MAX_REQUEST_BYTES {
            return None;
        }
        stream.set_read_timeout(Some(left)).ok()?;
        match stream.read(&mut byte) {
            Ok(0) | Err(_) => return None,
            Ok(_) if byte[0] == b'\n' => break,
            Ok(_) => buf.push(byte[0]),
        }
    }
    String::from_utf8(buf).ok()
}

fn handle(mut stream: TcpStream, token: &str) -> Control {
    let _ = stream.set_nonblocking(false);
    let Some(line) = read_request(&mut stream) else {
        return Control::Continue;
    };
    let Ok(request) = serde_json::from_str::<Request>(&line) else {
        send(&mut stream, json!({"type":"error","message":"malformed request"}));
        return Control::Continue;
    };
    if !ct_eq(&request.token, token) {
        send(&mut stream, json!({"type":"error","message":"unauthorized"}));
        return Control::Continue;
    }
    match request.op.as_str() {
        "ping" => {
            send(&mut stream, json!({"type":"result","ok":true,"message":"pong"}));
            Control::Continue
        }
        "shutdown" => {
            send(&mut stream, json!({"type":"result","ok":true,"message":"stopping"}));
            Control::Stop
        }
        op if ALLOWED_OPS.contains(&op) => {
            let mut writer = stream.try_clone().expect("socket clone");
            let mut emit = |text: &str| send(&mut writer, json!({"type":"log","line":text}));
            match run_op(op, &request.params, &mut emit) {
                Ok(message) => send(&mut stream, json!({"type":"result","ok":true,"message":message})),
                Err(message) => send(&mut stream, json!({"type":"result","ok":false,"message":message})),
            }
            Control::Continue
        }
        other => {
            send(
                &mut stream,
                json!({"type":"error","message":format!("operation not allowed: {other}")}),
            );
            Control::Continue
        }
    }
}

/// Runs inside the elevated process on the port the client chose. It writes no files (a root process must not write into a
/// folder the user controls, where a planted symlink could redirect the write) and reads only the token file, refusing a
/// symlink. Serves until idle for `idle_secs`, then exits.
pub fn serve(port: u16, token_file: &Path, idle_secs: u64) -> Res<()> {
    let meta = fs::symlink_metadata(token_file).map_err(|e| format!("cannot read the session token: {e}"))?;
    if !meta.file_type().is_file() {
        return Err("the session token must be a regular file, not a link".into());
    }
    let token = fs::read_to_string(token_file)
        .map_err(|e| format!("cannot read the session token: {e}"))?
        .trim()
        .to_string();
    if token.len() < 32 {
        return Err("the session token is too short".into());
    }
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port))
        .map_err(|e| format!("cannot listen on port {port}: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let (started, idle) = (Instant::now(), Duration::from_secs(idle_secs));
    let mut last = Instant::now();
    loop {
        match listener.accept() {
            Ok((stream, peer)) => {
                if !peer.ip().is_loopback() {
                    continue;
                }
                if let Control::Stop = handle(stream, &token) {
                    break;
                }
                last = Instant::now();
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => break,
        }
        if last.elapsed() > idle || started.elapsed() > MAX_LIFETIME {
            break;
        }
    }
    Ok(())
}

/// A free loopback port for the worker. There is a tiny window before the worker binds it; if another process wins it, the
/// worker fails to start and the client reports that instead of talking to the wrong listener.
pub fn pick_port() -> Res<u16> {
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0)).map_err(|e| e.to_string())?;
    listener.local_addr().map(|a| a.port()).map_err(|e| e.to_string())
}

#[derive(Debug, PartialEq)]
pub enum Pulse {
    Alive,
    /// Accepting connections but busy with a long install, so it did not answer in time.
    Busy,
    Dead,
}

/// Liveness without waiting for an install to finish: a refused connection is dead, a silent one is busy.
pub fn pulse(port: u16, token: &str) -> Pulse {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else {
        return Pulse::Dead;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    if writeln!(stream, "{}", json!({"token": token, "op": "ping", "params": {}})).is_err() {
        return Pulse::Dead;
    }
    let mut line = String::new();
    match BufReader::new(&stream).read_line(&mut line) {
        Ok(n) if n > 0 && line.contains("pong") => Pulse::Alive,
        Ok(_) => Pulse::Dead,
        Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => Pulse::Busy,
        Err(_) => Pulse::Dead,
    }
}

/// Sends one request to a worker and streams its log lines to `on_log`.
pub fn call(port: u16, token: &str, op: &str, params: &[(&str, String)], on_log: &mut dyn FnMut(&str)) -> Res<String> {
    let mut stream = TcpStream::connect_timeout(&SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port), Duration::from_secs(5))
        .map_err(|e| format!("cannot reach the setup session: {e}"))?;
    let map: HashMap<&str, &String> = params.iter().map(|(k, v)| (*k, v)).collect();
    // An install can take minutes, so the wait is generous, but never unlimited: a silent stranger on the port must not hang us.
    stream
        .set_read_timeout(Some(Duration::from_secs(30 * 60)))
        .map_err(|e| e.to_string())?;
    writeln!(stream, "{}", json!({"token": token, "op": op, "params": map})).map_err(|e| e.to_string())?;
    for line in BufReader::new(&stream).lines() {
        let line = line.map_err(|e| format!("the setup session closed unexpectedly: {e}"))?;
        let value: serde_json::Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        match value["type"].as_str() {
            Some("log") => on_log(value["line"].as_str().unwrap_or("")),
            Some("result") => {
                let message = value["message"].as_str().unwrap_or("").to_string();
                return if value["ok"].as_bool() == Some(true) {
                    Ok(message)
                } else {
                    Err(message)
                };
            }
            Some("error") => return Err(value["message"].as_str().unwrap_or("error").to_string()),
            _ => {}
        }
    }
    Err("the setup session ended without an answer".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn constant_time_compare_is_exact() {
        assert!(ct_eq("abc", "abc"));
        assert!(!ct_eq("abc", "abd"));
        assert!(!ct_eq("abc", "abcd"));
        assert!(!ct_eq("", "x"));
    }

    #[test]
    fn tokens_are_long_and_different_each_time() {
        let (a, b) = (new_token(), new_token());
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }

    fn start_worker(idle: u64) -> (u16, String, thread::JoinHandle<()>, std::path::PathBuf) {
        let dir = temp_dir("worker-test").unwrap();
        let token_file = dir.join("session.token");
        let token = new_token();
        fs::write(&token_file, &token).unwrap();
        let port = pick_port().unwrap();
        let handle = thread::spawn(move || serve(port, &token_file, idle).unwrap());
        for _ in 0..100 {
            if pulse(port, &token) == Pulse::Alive {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        (port, token, handle, dir)
    }

    #[test]
    fn the_worker_answers_only_with_the_token_and_only_for_allowed_operations() {
        let (port, token, handle, dir) = start_worker(30);
        let mut sink = |_: &str| {};
        assert_eq!(call(port, &token, "ping", &[], &mut sink).unwrap(), "pong");
        assert_eq!(call(port, "wrong-token", "ping", &[], &mut sink).unwrap_err(), "unauthorized");
        assert!(
            call(port, &token, "rm.everything", &[], &mut sink)
                .unwrap_err()
                .contains("not allowed")
        );
        assert!(
            call(port, &token, "shell", &[("cmd", "id".into())], &mut sink)
                .unwrap_err()
                .contains("not allowed")
        );
        assert!(
            call(port, &token, "node.install", &[("major", "26; id".into())], &mut sink)
                .unwrap_err()
                .contains("numeric major")
        );
        call(port, &token, "shutdown", &[], &mut sink).unwrap();
        handle.join().unwrap();
        assert_eq!(pulse(port, &token), Pulse::Dead, "nothing listens after shutdown");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn the_worker_stops_by_itself_when_idle() {
        let (port, token, handle, dir) = start_worker(1);
        handle.join().unwrap();
        assert_eq!(pulse(port, &token), Pulse::Dead);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn the_root_worker_writes_nothing_into_the_session_folder() {
        let (port, token, handle, dir) = start_worker(30);
        let mut sink = |_: &str| {};
        call(port, &token, "shutdown", &[], &mut sink).unwrap();
        handle.join().unwrap();
        let mut names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec!["session.token"],
            "a root process must not create files where the user can plant symlinks"
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_token_file_that_is_a_symlink_is_refused() {
        let dir = temp_dir("worker-link").unwrap();
        let real = dir.join("real.token");
        fs::write(&real, new_token()).unwrap();
        let link = dir.join("session.token");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let err = serve(pick_port().unwrap(), &link, 1).unwrap_err();
        assert!(err.contains("regular file"), "{err}");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_busy_worker_is_reported_busy_not_dead() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // Accepts the connection (the OS does) but never answers, like a worker in the middle of an install.
        assert_eq!(pulse(port, "x"), Pulse::Busy);
        drop(listener);
        assert_eq!(pulse(port, "x"), Pulse::Dead);
    }
}

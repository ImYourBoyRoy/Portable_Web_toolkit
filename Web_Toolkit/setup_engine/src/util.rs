//! Small shared helpers: process running, downloads through curl, SHA-256, version comparison, timestamps.

use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

pub type Res<T> = Result<T, String>;

pub fn os_name() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

pub fn arch_name() -> &'static str {
    env::consts::ARCH
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// UTC ISO-8601 without a date crate (civil-from-days algorithm).
pub fn now_iso() -> String {
    iso_from_secs(now_secs())
}

pub fn iso_from_secs(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3_600, rem % 3_600 / 60, rem % 60)
}

pub struct Out {
    pub ok: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl Out {
    pub fn text(&self) -> String {
        let mut s = self.stdout.trim().to_string();
        if s.is_empty() {
            s = self.stderr.trim().to_string();
        }
        s
    }
}

/// Runs a program to completion and captures its output. A program that cannot start is `ok: false`, never a panic.
pub fn run(program: impl AsRef<std::ffi::OsStr>, args: &[&str], cwd: Option<&Path>) -> Out {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    match cmd.output() {
        Ok(o) => Out {
            ok: o.status.success(),
            code: o.status.code(),
            stdout: String::from_utf8_lossy(&o.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&o.stderr).into_owned(),
        },
        Err(e) => Out {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: e.to_string(),
        },
    }
}

/// Like `run`, but each output line (stdout and stderr, interleaved as they arrive) goes to `on_line` while the program runs, so a
/// long install (a Python source build takes minutes) shows progress instead of staying silent until it ends.
pub fn run_stream(program: impl AsRef<std::ffi::OsStr>, args: &[&str], cwd: Option<&Path>, on_line: &mut dyn FnMut(&str)) -> Out {
    use std::io::{BufRead, BufReader};
    use std::sync::mpsc;
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            return Out {
                ok: false,
                code: None,
                stdout: String::new(),
                stderr: e.to_string(),
            };
        }
    };
    let (tx, rx) = mpsc::channel::<(bool, String)>();
    let mut readers = Vec::new();
    if let Some(out) = child.stdout.take() {
        let tx = tx.clone();
        readers.push(std::thread::spawn(move || {
            BufReader::new(out)
                .lines()
                .map_while(Result::ok)
                .for_each(|l| drop(tx.send((false, l))))
        }));
    }
    if let Some(err) = child.stderr.take() {
        let tx = tx.clone();
        readers.push(std::thread::spawn(move || {
            BufReader::new(err)
                .lines()
                .map_while(Result::ok)
                .for_each(|l| drop(tx.send((true, l))))
        }));
    }
    drop(tx);
    let (mut stdout, mut stderr) = (String::new(), String::new());
    for (is_err, line) in rx {
        if !line.trim().is_empty() {
            on_line(line.trim());
        }
        let buf = if is_err { &mut stderr } else { &mut stdout };
        buf.push_str(&line);
        buf.push('\n');
    }
    for reader in readers {
        let _ = reader.join();
    }
    match child.wait() {
        Ok(status) => Out {
            ok: status.success(),
            code: status.code(),
            stdout,
            stderr,
        },
        Err(e) => Out {
            ok: false,
            code: None,
            stdout,
            stderr: e.to_string(),
        },
    }
}

/// First `x.y.z` (or `x.y`) in a version line, preferring the number right after the tool name:
/// `pip 26.3 from /…/3.15.2/…` is 26.3, not the 3.15.2 inside the path.
pub fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let line = text.lines().next().unwrap_or("").trim();
    let mut words = line.split_whitespace();
    if let (Some(first), Some(second)) = (words.next(), words.next())
        && first.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
        && let Some(v) = leading_version(second)
    {
        return Some(v);
    }
    line.split(|c: char| !(c.is_ascii_digit() || c == '.'))
        .find_map(leading_version_strict)
}

fn leading_version(token: &str) -> Option<(u64, u64, u64)> {
    let token = token.trim_start_matches('v');
    leading_version_strict(token)
}

fn leading_version_strict(token: &str) -> Option<(u64, u64, u64)> {
    let mut parts = token.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next().and_then(|p| p.parse::<u64>().ok())?;
    let patch = parts.next().and_then(|p| p.parse::<u64>().ok()).unwrap_or(0);
    Some((major, minor, patch))
}

pub fn version_ge(actual: &str, floor: &str) -> bool {
    match (parse_version(actual), parse_version(floor)) {
        (Some(a), Some(f)) => a >= f,
        _ => false,
    }
}

pub fn home_dir() -> PathBuf {
    env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_default()
}

pub fn path_prepend(dir: &Path) {
    if !dir.is_dir() {
        return;
    }
    let current = env::var_os("PATH").unwrap_or_default();
    let mut entries: Vec<PathBuf> = env::split_paths(&current).collect();
    if entries.iter().any(|e| e == dir) {
        return;
    }
    entries.insert(0, dir.to_path_buf());
    if let Ok(joined) = env::join_paths(entries) {
        // SAFETY: set at startup of a single-threaded step, before any worker thread reads PATH.
        unsafe { env::set_var("PATH", joined) };
    }
}

/// Expands `%NAME%` references the way the registry's expandable PATH values use them; unknown names stay as written.
pub fn expand_percent_vars_with(text: &str, lookup: impl Fn(&str) -> Option<String>) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) if end > 0 && after[..end].chars().all(|c| c.is_alphanumeric() || c == '_') => {
                out.push_str(&lookup(&after[..end]).unwrap_or_else(|| format!("%{}%", &after[..end])));
                rest = &after[end + 1..];
            }
            _ => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

pub fn expand_percent_vars(text: &str) -> String {
    expand_percent_vars_with(text, |name| env::var(name).ok())
}

/// Windows: an installer updates the registry PATH, but this process keeps the PATH it started with, so a tool that was just
/// installed would look missing. Merges the machine and user PATH from the registry into this process's PATH.
pub fn refresh_path_from_registry() {
    if !cfg!(windows) {
        return;
    }
    let script = "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";
    let out = run("powershell.exe", &["-NoProfile", "-NonInteractive", "-Command", script], None);
    if !out.ok {
        return;
    }
    let mut entries: Vec<PathBuf> = out
        .stdout
        .trim()
        .split(';')
        .filter(|e| !e.is_empty())
        .map(|e| PathBuf::from(expand_percent_vars(e)))
        .collect();
    entries.reverse();
    for entry in entries {
        path_prepend(&entry);
    }
    if let Some(files) = env::var_os("ProgramFiles") {
        path_prepend(&PathBuf::from(files).join("Git").join("cmd"));
    }
}

/// `which`: PATH lookup, with PATHEXT on Windows.
pub fn which(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    let exts: Vec<String> = if cfg!(windows) {
        env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into())
            .split(';')
            .map(|e| e.to_ascii_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };
    for dir in env::split_paths(&path) {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

pub fn sha256_file(path: &Path) -> Res<String> {
    let mut file = fs::File::open(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// A system tool by absolute path from the OS's own folders only (`/usr/bin`, `%SystemRoot%\System32`), never from PATH. The
/// elevated worker uses this so a program planted earlier on a user's PATH (or beside the executable) cannot run as root.
/// `/usr/local/bin` is deliberately excluded: Homebrew makes it user-writable on Intel Macs.
pub fn trusted_tool(name: &str) -> Option<PathBuf> {
    let dirs: Vec<PathBuf> = if cfg!(windows) {
        let root = env::var_os("SystemRoot")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("C:\\Windows"));
        vec![root.join("System32")]
    } else {
        ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].iter().map(PathBuf::from).collect()
    };
    dirs.into_iter().map(|d| d.join(name)).find(|p| p.is_file())
}

/// The trusted path when there is one, else the bare name (found on PATH by the OS), so an unusual machine still works.
pub fn system_tool(name: &str) -> PathBuf {
    trusted_tool(name).unwrap_or_else(|| PathBuf::from(name))
}

fn curl_program() -> PathBuf {
    system_tool(if cfg!(windows) { "curl.exe" } else { "curl" })
}

/// `curl` could not even start (code is None): say so, instead of a bare "No such file or directory".
fn download_error(url: &str, out: &Out) -> String {
    if out.code.is_none() {
        format!(
            "curl is required to download {url} but could not be started ({}); install curl with your package manager and retry",
            out.stderr.trim()
        )
    } else {
        format!("could not download {url}: {}", out.stderr.trim())
    }
}

pub fn curl_text(url: &str) -> Res<String> {
    let out = run(curl_program(), &["-fsSL", "--max-time", "30", url], None);
    if out.ok { Ok(out.stdout) } else { Err(download_error(url, &out)) }
}

pub fn curl_file(url: &str, dest: &Path) -> Res<()> {
    let dest_str = dest.to_string_lossy();
    let out = run(
        curl_program(),
        &["-fsSL", "--retry", "2", "--max-time", "900", "-o", &dest_str, url],
        None,
    );
    if out.ok { Ok(()) } else { Err(download_error(url, &out)) }
}

pub fn temp_dir(prefix: &str) -> Res<PathBuf> {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dir = env::temp_dir().join(format!("{prefix}-{}-{}-{n}", std::process::id(), now_secs()));
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_reads_the_number_after_the_tool_name_not_a_path() {
        assert_eq!(
            parse_version("pip 26.3 from /home/me/.enchi/versions/3.15.2/lib/python3.15/site-packages/pip (python 3.15)"),
            Some((26, 3, 0))
        );
        assert_eq!(parse_version("enchi 0.8.0"), Some((0, 8, 0)));
        assert_eq!(parse_version("Python 3.15.2"), Some((3, 15, 2)));
        assert_eq!(parse_version("git version 2.53.0"), Some((2, 53, 0)));
        assert_eq!(parse_version("v26.13.1"), Some((26, 13, 1)));
        assert_eq!(parse_version("no digits here"), None);
    }

    #[test]
    fn version_ge_compares_numerically_not_lexically() {
        assert!(version_ge("26.13.1", "26.9.0"));
        assert!(!version_ge("26.5.0", "26.13.1"));
        assert!(version_ge("0.8.0", "0.8.0"));
        assert!(!version_ge("", "1.0.0"));
    }

    #[test]
    fn percent_variables_in_registry_paths_are_expanded() {
        let lookup = |name: &str| (name == "SystemRoot").then(|| "C:\\Windows".to_string());
        assert_eq!(expand_percent_vars_with("%SystemRoot%\\System32", lookup), "C:\\Windows\\System32");
        assert_eq!(expand_percent_vars_with("100%", lookup), "100%");
        assert_eq!(
            expand_percent_vars_with("%NOT_SET%\\x", lookup),
            "%NOT_SET%\\x",
            "unknown names stay as written"
        );
        assert_eq!(expand_percent_vars_with("a%%b", lookup), "a%%b");
    }

    #[test]
    fn streamed_output_arrives_line_by_line_and_the_exit_status_is_kept() {
        if cfg!(windows) {
            return;
        }
        let mut seen: Vec<String> = Vec::new();
        let out = run_stream("sh", &["-c", "echo one; echo two >&2; echo three; exit 3"], None, &mut |l| {
            seen.push(l.to_string())
        });
        assert!(!out.ok && out.code == Some(3));
        seen.sort();
        assert_eq!(seen, vec!["one", "three", "two"]);
        assert!(out.stdout.contains("one") && out.stderr.contains("two"));
        assert!(!run_stream("definitely-not-a-real-program-xyz", &[], None, &mut |_| {}).ok);
    }

    #[test]
    fn a_missing_curl_is_explained_not_reported_as_a_bare_os_error() {
        let missing = Out {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: "No such file or directory (os error 2)".into(),
        };
        assert!(download_error("https://x/y", &missing).contains("curl is required"));
        let refused = Out {
            ok: false,
            code: Some(22),
            stdout: String::new(),
            stderr: "404".into(),
        };
        assert!(download_error("https://x/y", &refused).starts_with("could not download https://x/y"));
    }

    #[test]
    fn iso_timestamps_are_correct_utc() {
        assert_eq!(iso_from_secs(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_from_secs(1_794_000_000), "2026-11-06T21:20:00Z");
        assert_eq!(iso_from_secs(951_782_400), "2000-02-29T00:00:00Z");
    }
}

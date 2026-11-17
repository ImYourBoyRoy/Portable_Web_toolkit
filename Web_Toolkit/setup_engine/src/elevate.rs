//! Asking the operating system for administrator rights, once. The engine never sees a password: the OS shows its own prompt
//! (UAC, the macOS authorization dialog, polkit) or `sudo` reads it from the user's terminal. What it starts is this same
//! binary in `worker` mode, which then serves only the closed operations in `privileged.rs`.
//!
//! Trust boundary: the approval authorizes the binary at the path shown and a short window. Other processes of the same user are
//! inside that boundary (as they are for a `sudo` timestamp): they could swap a user-writable binary or use the session token.
//! Everything the worker then does is limited by `privileged.rs`.

use crate::util::*;
use std::env;
use std::io::IsTerminal;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

pub fn is_elevated() -> bool {
    if cfg!(windows) {
        // A High mandatory level token (S-1-16-12288) means an elevated administrator. `net session` is not used: it fails
        // when the Server service is stopped, even for an elevated admin.
        let groups = run("whoami", &["/groups"], None);
        if groups.ok {
            groups.stdout.contains("S-1-16-12288")
        } else {
            run("net", &["session"], None).ok
        }
    } else {
        run("id", &["-u"], None).text().trim() == "0"
    }
}

/// True when this process runs as root because a user used sudo or pkexec. Running the user-scope installs (pnpm, Enchi, the
/// Python venv) from there would leave root-owned files in that user's home folder.
pub fn on_behalf_of_user(elevated: bool, sudo_user: Option<&str>, pkexec_uid: Option<&str>) -> bool {
    elevated && (sudo_user.is_some_and(|u| !u.is_empty() && u != "root") || pkexec_uid.is_some_and(|u| !u.is_empty() && u != "0"))
}

pub fn elevated_for_a_user() -> bool {
    !cfg!(windows)
        && on_behalf_of_user(
            is_elevated(),
            env::var("SUDO_USER").ok().as_deref(),
            env::var("PKEXEC_UID").ok().as_deref(),
        )
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Method {
    PasswordlessSudo,
    MacosDialog,
    Pkexec,
    TerminalSudo,
    WindowsUac,
    /// Debug builds only: start the worker as the same user, so tests can exercise the real subprocess path.
    TestNoElevation,
}

impl Method {
    pub fn label(self) -> &'static str {
        match self {
            Method::PasswordlessSudo => "passwordless sudo",
            Method::MacosDialog => "the macOS administrator dialog",
            Method::Pkexec => "the polkit authorization dialog",
            Method::TerminalSudo => "sudo in the terminal",
            Method::WindowsUac => "the Windows UAC prompt",
            Method::TestNoElevation => "no elevation (test)",
        }
    }
}

pub struct Launched {
    pub method: Method,
    pub child: Option<Child>,
}

/// An absolute path, so a worker that starts in another directory (pkexec uses /root, osascript uses /) still finds it. Symlinks
/// are resolved on Unix; on Windows `canonicalize` would add a `\\?\` prefix, so the path is only made absolute.
fn absolute(path: &Path) -> Res<PathBuf> {
    let made = if cfg!(windows) {
        std::path::absolute(path)
    } else {
        path.canonicalize()
    };
    made.map_err(|e| format!("path: cannot resolve {}: {e}", path.display()))
}

fn has_control(text: &str) -> bool {
    text.chars().any(|c| c.is_control())
}

/// For a PowerShell single-quoted string: a single quote is doubled, a double quote cannot be represented here (the worker's
/// token path is wrapped in double quotes for its own argument parsing), control characters are refused.
pub fn ps_path(path: &Path) -> Res<String> {
    let text = path.to_string_lossy().into_owned();
    if text.contains('"') || has_control(&text) {
        return Err(format!(
            "path: this path cannot be passed through the Windows prompt (quote or control character): {text}"
        ));
    }
    Ok(text.replace('\'', "''"))
}

/// For the AppleScript string that wraps a shell command with single-quoted arguments: only a quote, a backslash or a control
/// character could break out.
fn osascript_path(path: &Path) -> Res<String> {
    let text = path.to_string_lossy().into_owned();
    if text.contains(['\'', '"', '\\']) || has_control(&text) {
        return Err(format!(
            "path: this path cannot be passed through the macOS dialog (quote, backslash or control character): {text}"
        ));
    }
    Ok(text)
}

fn has_gui_session() -> bool {
    if cfg!(target_os = "macos") {
        env::var_os("SSH_CONNECTION").is_none() && env::var_os("CI").is_none() && which("osascript").is_some()
    } else {
        (env::var_os("DISPLAY").is_some() || env::var_os("WAYLAND_DISPLAY").is_some()) && which("pkexec").is_some()
    }
}

/// The PowerShell command that asks Windows for UAC approval and starts the worker. A function of its own so a test can parse it
/// with a real PowerShell, since the approval itself cannot be exercised without a desktop.
pub fn uac_command(exe: &Path, port: u16, token_file: &Path, idle_secs: u64) -> Res<String> {
    Ok(format!(
        "Start-Process -FilePath '{}' -ArgumentList 'worker','--port','{port}','--token-file','\"{}\"','--idle-secs','{idle_secs}' -Verb RunAs -WindowStyle Hidden",
        ps_path(exe)?,
        ps_path(token_file)?
    ))
}

/// Starts the elevated worker on `port`. Returns as soon as the request was made (not when the user approved): the caller waits
/// for the worker to answer on that port. Errors that mean "nobody can be asked" are plain; a bad path starts with `path:`.
pub fn launch_worker(exe: &Path, port: u16, token_file: &Path, idle_secs: u64) -> Res<Launched> {
    // Test hook: the integration tests must never raise a dialog or run sudo, even on a machine with passwordless sudo.
    if env::var("TOOLKIT_SETUP_NO_ELEVATE").is_ok_and(|v| v == "1") {
        return Err("administrator elevation is disabled by TOOLKIT_SETUP_NO_ELEVATE".into());
    }
    let (exe, token_file) = (absolute(exe)?, absolute(token_file)?);
    let idle = idle_secs.to_string();
    let port_s = port.to_string();
    let quiet = |mut c: Command| -> Res<Child> {
        c.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("cannot start the elevated worker: {e}"))
    };
    if cfg!(windows) {
        let command = uac_command(&exe, port, &token_file, idle_secs)?;
        let mut c = Command::new("powershell.exe");
        c.args(["-NoProfile", "-NonInteractive", "-Command", &command]);
        return Ok(Launched {
            method: Method::WindowsUac,
            child: Some(quiet(c)?),
        });
    }
    let worker_args = ["worker", "--port", port_s.as_str(), "--token-file"];
    let token_s = token_file.to_string_lossy().into_owned();
    let exe_s = exe.to_string_lossy().into_owned();
    if cfg!(debug_assertions) && env::var("TOOLKIT_SETUP_ELEVATE_WITH").is_ok_and(|v| v == "none") {
        let mut c = Command::new(&exe);
        c.args(worker_args).arg(&token_s).args(["--idle-secs", &idle]);
        return Ok(Launched {
            method: Method::TestNoElevation,
            child: Some(quiet(c)?),
        });
    }
    if which("sudo").is_some() && run("sudo", &["-n", "true"], None).ok {
        let mut c = Command::new("sudo");
        c.arg("-n").arg(&exe).args(worker_args).arg(&token_s).args(["--idle-secs", &idle]);
        return Ok(Launched {
            method: Method::PasswordlessSudo,
            child: Some(quiet(c)?),
        });
    }
    if cfg!(target_os = "macos") && has_gui_session() {
        let (e, t) = (osascript_path(&exe)?, osascript_path(&token_file)?);
        let shell = format!("'{e}' worker --port {port} --token-file '{t}' --idle-secs {idle} >/dev/null 2>&1 &");
        let script = format!(
            "do shell script \"{shell}\" with administrator privileges with prompt \"Portable Web Toolkit setup needs administrator access to install Node.js and Git.\""
        );
        let mut c = Command::new("osascript");
        c.args(["-e", &script]);
        return Ok(Launched {
            method: Method::MacosDialog,
            child: Some(quiet(c)?),
        });
    }
    if cfg!(target_os = "linux") && has_gui_session() {
        let mut c = Command::new("pkexec");
        c.arg(&exe).args(worker_args).arg(&token_s).args(["--idle-secs", &idle]);
        return Ok(Launched {
            method: Method::Pkexec,
            child: Some(quiet(c)?),
        });
    }
    if std::io::stdin().is_terminal() && which("sudo").is_some() {
        let child = Command::new("sudo")
            .arg(&exe_s)
            .args(worker_args)
            .arg(&token_s)
            .args(["--idle-secs", &idle])
            .spawn()
            .map_err(|e| format!("cannot start sudo: {e}"))?;
        return Ok(Launched {
            method: Method::TerminalSudo,
            child: Some(child),
        });
    }
    Err("there is no way to ask for administrator approval from here (no desktop session and no terminal). Run `toolkit-setup session start` in a terminal, or run `sudo -v` first".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legitimate_paths_with_odd_characters_pass_their_own_launch_method() {
        // sudo and pkexec take arguments directly, so there is nothing to escape; only the two string-wrapping methods check.
        for ok in ["/srv/apps/O'Brien/x", "/srv/Tom&Jerry/[client] site/$HOME/!x/session.token"] {
            assert!(ps_path(Path::new(ok)).is_ok() || ok.contains('"'), "{ok}");
        }
        assert_eq!(ps_path(Path::new("D:\\work\\O'Brien\\x")).unwrap(), "D:\\work\\O''Brien\\x");
        assert!(osascript_path(Path::new("/srv/Tom&Jerry/[client] site/$x/session.token")).is_ok());
    }

    #[test]
    fn paths_that_could_break_out_of_a_wrapping_string_are_refused() {
        assert!(ps_path(Path::new("C:\\a\"b")).is_err());
        assert!(ps_path(Path::new("C:\\a\nb")).is_err());
        for bad in ["/tmp/a'b", "/tmp/a\"b", "/tmp/a\\b", "/tmp/a\nb"] {
            let err = osascript_path(Path::new(bad)).unwrap_err();
            assert!(err.starts_with("path:"), "{bad}: a bad path is not an authorization failure");
        }
    }

    #[test]
    fn relative_paths_are_made_absolute_for_a_worker_that_starts_elsewhere() {
        assert!(absolute(Path::new(".")).unwrap().is_absolute());
        if cfg!(windows) {
            // `std::path::absolute` does not touch the disk, so even a missing path is made absolute.
            assert!(absolute(Path::new("relative\\x")).unwrap().is_absolute());
        } else {
            // On Unix symlinks are resolved, so a path that does not exist is a `path:` error, not an authorization failure.
            assert!(absolute(Path::new("/definitely/not/here")).unwrap_err().starts_with("path:"));
        }
    }

    #[test]
    fn root_by_sudo_is_a_user_on_whose_behalf_we_run_but_plain_root_is_not() {
        assert!(on_behalf_of_user(true, Some("alice"), None));
        assert!(on_behalf_of_user(true, None, Some("1000")));
        assert!(!on_behalf_of_user(true, Some("root"), None), "sudo from root");
        assert!(!on_behalf_of_user(true, None, None), "a real root session or container");
        assert!(!on_behalf_of_user(false, Some("alice"), None), "not elevated at all");
    }

    #[test]
    fn every_method_has_a_label_the_user_can_read() {
        for m in [
            Method::PasswordlessSudo,
            Method::MacosDialog,
            Method::Pkexec,
            Method::TerminalSudo,
            Method::WindowsUac,
            Method::TestNoElevation,
        ] {
            assert!(m.label().len() > 5);
        }
    }

    /// The UAC command must be valid PowerShell with the exact quoting it will have at run time. Parsed (never run) by whichever
    /// PowerShell this machine has; skipped when there is none.
    #[test]
    fn the_uac_command_parses_as_powershell() {
        let command = uac_command(
            Path::new("C:\\PROGRA~1\\Tool (x86)\\toolkit-setup.exe"),
            49152,
            Path::new("C:\\work dir\\O'Brien\\.runtime\\setup\\session.token"),
            900,
        )
        .unwrap();
        assert!(command.contains("-Verb RunAs") && command.contains("'--port','49152'"), "{command}");
        assert!(
            command.contains("'\"C:\\work dir\\O''Brien\\.runtime\\setup\\session.token\"'"),
            "a path with a space and a quote is quoted for the worker: {command}"
        );
        for shell in ["pwsh", "powershell"] {
            if which(shell).is_none() {
                continue;
            }
            let parse = "$null = [scriptblock]::Create([Console]::In.ReadToEnd()); 'parsed'";
            let mut child = Command::new(shell)
                .args(["-NoProfile", "-NonInteractive", "-Command", parse])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            std::io::Write::write_all(child.stdin.as_mut().unwrap(), command.as_bytes()).unwrap();
            let out = child.wait_with_output().unwrap();
            assert!(
                String::from_utf8_lossy(&out.stdout).contains("parsed"),
                "{shell}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            return;
        }
    }
}

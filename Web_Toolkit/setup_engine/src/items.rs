//! The tools the setup manages: how each is detected and installed. Detection is read-only. Installs that need administrator
//! rights go through `Runner::privileged` (the elevated worker, or in-process when already elevated); everything else runs
//! as the user, so files in the home folder never end up root-owned.

use crate::manifest::Manifest;
use crate::node;
use crate::privileged::Opts;
use crate::util::*;
use std::fs;
use std::path::{Path, PathBuf};

pub struct Ctx {
    pub toolkit_root: Option<PathBuf>,
    pub manifest: Manifest,
    pub workspace: PathBuf,
    pub opts: Opts,
    pub offline: bool,
}

pub trait Runner {
    fn log(&mut self, item: &str, line: &str);
    fn privileged(&mut self, item: &str, op: &str, params: &[(&str, String)]) -> Res<String>;
}

pub const ITEMS: &[(&str, &str)] = &[
    ("git", "Git"),
    ("node", "Node.js"),
    ("pnpm", "pnpm"),
    ("enchi", "Enchi"),
    ("enchi-gui", "Enchi GUI"),
    ("python", "Python (via Enchi)"),
    ("playwright", "Python Playwright"),
];

/// Items that must exist first.
/// Items that need administrator rights to install; every other item installs into the user's own folders.
pub fn needs_admin_item(id: &str) -> bool {
    matches!(id, "git" | "node")
}

pub fn depends_on(id: &str) -> &'static [&'static str] {
    match id {
        "enchi-gui" | "python" => &["enchi"],
        "playwright" => &["python"],
        _ => &[],
    }
}

pub struct Detect {
    pub status: &'static str, // current | missing | outdated
    pub installed: String,
    pub target: String,
    pub note: String,
    pub needs_admin: bool,
}

fn done(installed: &str, note: &str) -> Detect {
    Detect {
        status: "current",
        installed: installed.into(),
        target: String::new(),
        note: note.into(),
        needs_admin: false,
    }
}

fn todo(status: &'static str, installed: &str, target: &str, note: &str, needs_admin: bool) -> Detect {
    Detect {
        status,
        installed: installed.into(),
        target: target.into(),
        note: note.into(),
        needs_admin,
    }
}

pub fn can_write(path: &Path) -> bool {
    let mut dir = path.to_path_buf();
    while !dir.exists() {
        if !dir.pop() {
            return false;
        }
    }
    let probe = dir.join(format!(".toolkit-setup-probe-{}", std::process::id()));
    let ok = fs::write(&probe, b"").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

pub fn node_needs_admin(opts: &Opts) -> bool {
    if cfg!(windows) {
        true
    } else {
        !(can_write(&opts.node_root) && can_write(&opts.bin_dir))
    }
}

// ---------------------------------------------------------------- Enchi (formerly pyenv-native)

fn enchi_roots() -> Vec<PathBuf> {
    vec![home_dir().join(".enchi"), home_dir().join(".pyenv")]
}

pub fn add_enchi_path() {
    for root in enchi_roots() {
        for sub in ["bin", "shims"] {
            path_prepend(&root.join(sub));
        }
    }
}

/// `enchi` first, the legacy `pyenv` second (a machine that has not upgraded yet), in PATH then in both roots.
pub fn resolve_enchi() -> Option<PathBuf> {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    for name in ["enchi", "pyenv"] {
        if let Some(path) = which(name) {
            return Some(path);
        }
    }
    for name in ["enchi", "pyenv"] {
        for root in enchi_roots() {
            for rel in [format!("bin/{name}{ext}"), format!("{name}{ext}")] {
                let candidate = root.join(rel);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn enchi_version() -> Option<String> {
    let path = resolve_enchi()?;
    let out = run(&path, &["--version"], None);
    out.ok.then(|| out.text()).filter(|t| parse_version(t).is_some())
}

fn enchi(args: &[&str], cwd: Option<&Path>) -> Res<Out> {
    let path = resolve_enchi().ok_or("Enchi is not installed")?;
    add_enchi_path();
    Ok(run(&path, args, cwd))
}

/// A redrawn progress line: a bar made of block characters, or a byte counter like `downloaded 3127663/31234628 bytes (10%)`.
fn is_progress_noise(line: &str) -> bool {
    line.contains('\u{25A0}') || line.contains('\u{2501}') || (line.contains(" bytes (") && line.contains("downloaded"))
}

/// Runs Enchi with its output streamed into the event log as it arrives (a Python source build takes minutes).
fn enchi_stream(item: &str, args: &[&str], cwd: Option<&Path>, run: &mut dyn Runner) -> Res<Out> {
    let path = resolve_enchi().ok_or("Enchi is not installed")?;
    add_enchi_path();
    run.log(item, &format!("enchi {}", args.join(" ")));
    // Progress bars and per-chunk download counters are redrawn dozens of times; they would bury the log, so only real lines pass.
    Ok(crate::util::run_stream(&path, args, cwd, &mut |line| {
        if !is_progress_noise(line) {
            run.log(item, line)
        }
    }))
}

fn enchi_gui_path() -> Option<PathBuf> {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    for name in ["enchi-gui", "pyenv-gui"] {
        for root in enchi_roots() {
            for rel in [format!("bin/{name}{ext}"), format!("{name}{ext}")] {
                let candidate = root.join(rel);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
        if let Some(path) = which(name) {
            return Some(path);
        }
    }
    None
}

fn enchi_gui_available() -> bool {
    enchi_gui_path().is_some() || enchi(&["gui", "--help"], None).is_ok_and(|o| o.ok)
}

// ---------------------------------------------------------------------------------- pnpm

fn pnpm_home() -> PathBuf {
    if let Some(home) = std::env::var_os("PNPM_HOME") {
        return PathBuf::from(home);
    }
    match os_name() {
        "windows" => PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("pnpm"),
        "macos" => home_dir().join("Library/pnpm"),
        _ => std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".local/share"))
            .join("pnpm"),
    }
}

fn add_pnpm_path() {
    // pnpm 11 and later install the binary into `$PNPM_HOME/bin`; earlier standalone installs put it in `$PNPM_HOME` itself.
    path_prepend(&pnpm_home().join("bin"));
    path_prepend(&pnpm_home());
    if cfg!(windows) {
        path_prepend(&PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("Microsoft/WinGet/Links"));
    }
}

fn pnpm_version() -> Option<String> {
    add_pnpm_path();
    let path = which("pnpm")?;
    let out = run(path, &["--version"], None);
    out.ok.then(|| out.text()).filter(|t| parse_version(t).is_some())
}

// ------------------------------------------------------------------------------ detection

fn venv_name(workspace: &Path) -> String {
    let raw = workspace
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mut out = String::new();
    for c in raw.chars() {
        let c = if c.is_ascii_alphanumeric() { c } else { '-' };
        if c == '-' && (out.is_empty() || out.ends_with('-')) {
            continue;
        }
        out.push(c);
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "workspace".into() } else { out }
}

pub fn detect(id: &str, ctx: &Ctx) -> Detect {
    match id {
        // On a Mac without the Command Line Tools, running `git` starts Apple's installer prompt, and `plan` must change nothing:
        // look for the tools first and treat the /usr/bin/git shim as missing.
        "git"
            if cfg!(target_os = "macos")
                && !run("xcode-select", &["-p"], None).ok
                && which("git").is_none_or(|p| p == std::path::Path::new("/usr/bin/git")) =>
        {
            todo(
                "missing",
                "",
                "",
                "Installs with the Xcode Command Line Tools (an Apple dialog, no admin step)",
                false,
            )
        }
        "git" => match run("git", &["--version"], None) {
            o if o.ok => done(&o.text(), "Git available"),
            _ if cfg!(target_os = "macos") => todo(
                "missing",
                "",
                "",
                "Installs with the Xcode Command Line Tools (an Apple dialog, no admin step)",
                false,
            ),
            _ => todo("missing", "", "", "Git is not installed", true),
        },
        "node" => {
            let major = node::required_major(ctx.toolkit_root.as_deref(), &ctx.manifest);
            let installed = run("node", &["--version"], None);
            let installed = installed.ok.then(|| installed.text().trim_start_matches('v').to_string());
            let latest = (!ctx.offline)
                .then(|| node::resolve_latest(&ctx.opts.dist_base, &major).ok())
                .flatten();
            let admin = node_needs_admin(&ctx.opts);
            let target = latest.as_ref().map(|l| l.version.clone()).unwrap_or_default();
            if node::needs_install(installed.as_deref(), &major, latest.as_ref().map(|l| l.version.as_str())) {
                let have = installed.clone().unwrap_or_default();
                let status = if installed.is_some() { "outdated" } else { "missing" };
                let note = if have.is_empty() {
                    format!("Latest Node {major}.x will be installed")
                } else {
                    format!("Installed {have}; latest {major}.x is {target}")
                };
                todo(status, &have, &target, &note, admin)
            } else {
                done(installed.as_deref().unwrap_or(""), &format!("On the Node {major} line"))
            }
        }
        "pnpm" => {
            let floor = ctx.manifest.get("tool.pnpm.minimum_version", "10.0.0");
            match pnpm_version() {
                Some(v) if version_ge(&v, &floor) => done(&v, "pnpm is the toolkit package manager"),
                Some(v) => todo("outdated", &v, "", &format!("Requires >= {floor}"), false),
                None => todo("missing", "", "", "The toolkit package manager; installs in user scope", false),
            }
        }
        "enchi" => {
            add_enchi_path();
            let floor = ctx.manifest.get("tool.enchi.minimum_version", "0.8.0");
            match enchi_version() {
                Some(v) if version_ge(&v, &floor) => done(&v, "Enchi (formerly pyenv-native)"),
                Some(v) => todo("outdated", &v, &floor, "An older pyenv-native or Enchi is upgraded in place", false),
                None => todo("missing", "", &floor, "Python manager; installs in user scope", false),
            }
        }
        "enchi-gui" => {
            add_enchi_path();
            if enchi_gui_available() {
                done("present", "Launch with `enchi gui`")
            } else {
                todo("missing", "", "", "Enchi GUI dashboard", false)
            }
        }
        "python" => {
            add_enchi_path();
            if enchi_version().is_none() {
                return todo(
                    "missing",
                    "",
                    "",
                    "Needs Enchi first",
                    crate::privileged::linux_build_deps_missing(),
                );
            }
            let floor = ctx.manifest.get("tool.python.minimum_version", "3.13.0");
            let venv = venv_name(&ctx.workspace);
            let python = enchi(&["exec", "python", "--version"], Some(&ctx.workspace))
                .ok()
                .filter(|o| o.ok)
                .map(|o| o.text());
            let versions = enchi(&["versions"], Some(&ctx.workspace))
                .ok()
                .map(|o| o.stdout)
                .unwrap_or_default();
            match python {
                Some(v) if version_ge(&v, &floor) && versions.contains(&format!("envs/{venv}")) => {
                    done(&v, &format!("Workspace venv `{venv}`"))
                }
                Some(v) => todo("outdated", &v, "", &format!("Workspace venv `{venv}` is not set up"), false),
                None => todo(
                    "missing",
                    "",
                    "",
                    &format!(
                        "Python and the workspace venv `{venv}` will be set up{}",
                        if crate::privileged::linux_build_deps_missing() {
                            " (Linux compiles Python: build tools are installed first)"
                        } else {
                            ""
                        }
                    ),
                    crate::privileged::linux_build_deps_missing(),
                ),
            }
        }
        "playwright" => {
            add_enchi_path();
            let probe = enchi(&["exec", "python", "-m", "playwright", "--version"], Some(&ctx.workspace))
                .ok()
                .filter(|o| o.ok)
                .map(|o| o.text());
            match probe {
                Some(v) => done(&v, "Python Playwright is in the workspace venv"),
                None => todo("missing", "", "", "Playwright and Chromium for agent browser tools", false),
            }
        }
        _ => todo("missing", "", "", "unknown item", false),
    }
}

// ------------------------------------------------------------------------------- installs

pub fn install(id: &str, ctx: &Ctx, run: &mut dyn Runner) -> Res<String> {
    match id {
        "git" => install_git(run),
        "node" => {
            let major = node::required_major(ctx.toolkit_root.as_deref(), &ctx.manifest);
            run.privileged("node", "node.install", &[("major", major)])
        }
        "pnpm" => install_pnpm(ctx, run),
        "enchi" => install_enchi(ctx, run),
        "enchi-gui" => install_enchi_gui(ctx, run),
        "python" => install_python(ctx, run),
        "playwright" => install_playwright(ctx, run),
        other => Err(format!("unknown item: {other}")),
    }
}

/// The last few non-empty output lines, joined, for an error message (a lone last line is often a useless stack frame).
fn tail(out: &Out) -> String {
    let text = out.text();
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    lines[lines.len().saturating_sub(3)..].join(" | ")
}

fn logged(run: &mut dyn Runner, item: &str, out: &Out) {
    for line in out.text().lines().rev().take(3).collect::<Vec<_>>().into_iter().rev() {
        run.log(item, line.trim());
    }
}

fn install_git(run: &mut dyn Runner) -> Res<String> {
    if !cfg!(target_os = "macos") {
        return run.privileged("git", "git.install", &[]);
    }
    run.log("git", "Starting the Xcode Command Line Tools installer; finish the Apple dialog");
    let _ = crate::util::run("xcode-select", &["--install"], None);
    for waited in (0..600).step_by(5) {
        if crate::util::run("xcode-select", &["-p"], None).ok && crate::util::run("git", &["--version"], None).ok {
            return Ok("Git is available through the Xcode Command Line Tools".into());
        }
        std::thread::sleep(std::time::Duration::from_secs(5));
        if waited % 60 == 55 {
            run.log("git", "Still waiting for the Command Line Tools installer");
        }
    }
    Err("the Command Line Tools did not finish installing within 10 minutes".into())
}

fn script_url(ctx: &Ctx, key: &str, default: &str) -> String {
    ctx.manifest.get(key, default)
}

fn install_pnpm(ctx: &Ctx, run: &mut dyn Runner) -> Res<String> {
    let floor = ctx.manifest.get("tool.pnpm.minimum_version", "10.0.0");
    let ok = |v: Option<String>| v.is_some_and(|v| version_ge(&v, &floor));
    if pnpm_version().is_some() {
        run.log("pnpm", "Updating pnpm (pnpm self-update)");
        if let Some(path) = which("pnpm") {
            logged(run, "pnpm", &crate::util::run(path, &["self-update"], None));
        }
    }
    if cfg!(windows) && !ok(pnpm_version()) {
        let id = ctx.manifest.get("tool.pnpm.windows.package_id", "pnpm.pnpm");
        run.log("pnpm", "Installing with winget");
        logged(
            run,
            "pnpm",
            &crate::util::run(
                "winget",
                &[
                    "install",
                    "--id",
                    &id,
                    "--exact",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                    "--silent",
                ],
                None,
            ),
        );
    }
    if !cfg!(windows) && !ok(pnpm_version()) {
        let tmp = temp_dir("toolkit-setup-pnpm")?;
        let script = tmp.join("install.sh");
        curl_file(
            &script_url(ctx, "tool.pnpm.posix.install_url", "https://get.pnpm.io/install.sh"),
            &script,
        )?;
        run.log("pnpm", "Running the official pnpm installer (user scope)");
        logged(run, "pnpm", &crate::util::run("sh", &[&script.to_string_lossy()], None));
        let _ = fs::remove_dir_all(&tmp);
    }
    if !ok(pnpm_version()) && which("npm").is_some() {
        run.log("pnpm", "Falling back to npm into ~/.local");
        let prefix = home_dir().join(".local");
        logged(
            run,
            "pnpm",
            &crate::util::run(
                which("npm").unwrap(),
                &["install", "--global", "--prefix", &prefix.to_string_lossy(), "pnpm"],
                None,
            ),
        );
        path_prepend(&prefix.join("bin"));
    }
    match pnpm_version() {
        Some(v) if version_ge(&v, &floor) => Ok(format!("pnpm {v} ready; open a new terminal if `pnpm` is not found")),
        _ => Err("pnpm could not be installed; run `npm install --global pnpm` and retry".into()),
    }
}

fn install_enchi(ctx: &Ctx, run: &mut dyn Runner) -> Res<String> {
    let floor = ctx.manifest.get("tool.enchi.minimum_version", "0.8.0");
    add_enchi_path();
    let ok = || enchi_version().is_some_and(|v| version_ge(&v, &floor));
    if enchi_version().is_some() {
        run.log("enchi", "Updating in place (self-update)");
        if let Ok(out) = enchi(&["self-update"], None) {
            logged(run, "enchi", &out);
        }
        add_enchi_path();
    }
    if !ok() {
        let tmp = temp_dir("toolkit-setup-enchi")?;
        run.log("enchi", "Running the Enchi release installer");
        if cfg!(windows) {
            let script = tmp.join("install.ps1");
            curl_file(
                &script_url(
                    ctx,
                    "tool.enchi.windows.install_url",
                    "https://github.com/imyourboyroy/pyenv-native/releases/latest/download/install.ps1",
                ),
                &script,
            )?;
            logged(
                run,
                "enchi",
                &crate::util::run(
                    "powershell.exe",
                    &["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &script.to_string_lossy()],
                    None,
                ),
            );
        } else {
            let script = tmp.join("install.sh");
            curl_file(
                &script_url(
                    ctx,
                    "tool.enchi.posix.install_url",
                    "https://github.com/imyourboyroy/pyenv-native/releases/latest/download/install.sh",
                ),
                &script,
            )?;
            logged(run, "enchi", &crate::util::run("sh", &[&script.to_string_lossy(), "--yes"], None));
        }
        let _ = fs::remove_dir_all(&tmp);
        add_enchi_path();
    }
    match enchi_version() {
        Some(v) if ok() => Ok(format!("Enchi {v} ready; use `enchi` and `enchi gui`")),
        v => Err(format!(
            "Enchi did not reach {floor} (found {}); install it from the latest imyourboyroy/pyenv-native release",
            v.unwrap_or_else(|| "none".into())
        )),
    }
}

fn install_enchi_gui(ctx: &Ctx, run: &mut dyn Runner) -> Res<String> {
    add_enchi_path();
    if enchi_gui_available() {
        return Ok("Enchi GUI already available".into());
    }
    let base = ctx.manifest.get(
        "tool.enchi.release_base",
        "https://github.com/imyourboyroy/pyenv-native/releases/latest/download",
    );
    let arch = match arch_name() {
        "aarch64" | "arm64" => "arm64",
        _ => "x64",
    };
    if os_name() != "macos" && arch == "arm64" {
        return Err(format!("there is no Enchi GUI build for {} on ARM yet", os_name()));
    }
    let os = os_name();
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let url = format!("{base}/enchi-gui-{os}-{arch}{ext}");
    let dir = resolve_enchi()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| home_dir().join(".enchi/bin"));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(format!("enchi-gui{ext}"));
    let part = dir.join(format!("enchi-gui{ext}.part"));
    run.log("enchi-gui", &format!("Downloading {url}"));
    curl_file(&url, &part)?;
    let expected = curl_text(&format!("{url}.sha256"))?
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();
    let actual = sha256_file(&part)?;
    if expected.len() != 64 || expected != actual {
        let _ = fs::remove_file(&part);
        return Err("the Enchi GUI download did not match its published checksum".into());
    }
    fs::rename(&part, &target).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&target, fs::Permissions::from_mode(0o755));
    }
    Ok(format!("Enchi GUI installed at {}", target.display()))
}

/// `enchi versions` exits non-zero ("no Python detected") on a machine that has none yet, which is exactly when Python is being
/// installed: take its output whatever the exit status, and treat failure to run as empty.
fn enchi_versions(run: &mut dyn Runner, cwd: Option<&Path>) -> String {
    run.log("python", "enchi versions");
    enchi(&["versions"], cwd).map(|o| o.stdout).unwrap_or_default()
}

fn install_python(ctx: &Ctx, run: &mut dyn Runner) -> Res<String> {
    add_enchi_path();
    if !ctx.workspace.is_dir() {
        return Err(format!("workspace folder not found: {}", ctx.workspace.display()));
    }
    let prefix = ctx.manifest.get("tool.python.desired_prefix", "3.14");
    let fallback = ctx.manifest.get("tool.python.fallback_version", "3.14.6");
    let cwd = Some(ctx.workspace.as_path());
    let step = |run: &mut dyn Runner, args: &[&str]| -> Res<Out> {
        run.log("python", &format!("enchi {}", args.join(" ")));
        let out = enchi(args, cwd)?;
        if out.ok {
            Ok(out)
        } else {
            Err(format!("`enchi {}` failed: {}", args.join(" "), tail(&out)))
        }
    };
    let desired = enchi(&["latest", &prefix], cwd)
        .ok()
        .filter(|o| o.ok)
        .map(|o| o.text().lines().next().unwrap_or("").trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or(fallback);
    let versions = enchi_versions(run, cwd);
    if !versions.contains(&desired) {
        if crate::privileged::linux_build_deps_missing() {
            run.log("python", "Linux compiles Python from source: installing the build tools and libraries first (one administrator approval covers this session)");
            run.privileged("python", "python.build_deps", &[])?;
        }
        run.log("python", "Installing Python; a source build can take several minutes");
        let out = enchi_stream("python", &["install", &desired], cwd, run)?;
        if !out.ok {
            return Err(format!("`enchi install {desired}` failed: {}", tail(&out)));
        }
    }
    let _ = step(run, &["global", &desired]);
    let venv = venv_name(&ctx.workspace);
    let spec = format!("{desired}/envs/{venv}");
    let versions = enchi_versions(run, cwd);
    if !versions.contains(&format!("envs/{venv}")) {
        step(run, &["venv", "create", &desired, &venv])?;
    }
    step(run, &["local", &spec])?;
    step(run, &["exec", "python", "-m", "pip", "install", "--upgrade", "pip"])?;
    let version = step(run, &["exec", "python", "--version"])?.text();
    Ok(format!("{version} in workspace venv {spec}"))
}

fn install_playwright(ctx: &Ctx, run: &mut dyn Runner) -> Res<String> {
    add_enchi_path();
    let package = ctx.manifest.get("tool.python_playwright.package", "playwright");
    let browser = ctx.manifest.get("tool.python_playwright.browser", "chromium");
    let cwd = Some(ctx.workspace.as_path());
    for args in [
        vec!["exec", "python", "-m", "pip", "install", package.as_str()],
        vec!["exec", "python", "-m", "playwright", "install", browser.as_str()],
    ] {
        let out = enchi_stream("playwright", &args, cwd, run)?;
        if !out.ok {
            return Err(format!("`enchi {}` failed: {}", args.join(" "), tail(&out)));
        }
    }
    let version = enchi(&["exec", "python", "-m", "playwright", "--version"], cwd)?.text();
    Ok(format!("{version} with {browser}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_bars_are_filtered_from_the_log_but_real_lines_are_kept() {
        assert!(is_progress_noise("|\u{25A0}\u{25A0}\u{25A0}\u{25A0}   |  40% of 199.3 MiB"));
        assert!(is_progress_noise("\u{2501}\u{2501}\u{2501} 53.5/53.5 MB 5.0 MB/s"));
        assert!(is_progress_noise(
            "download: downloaded 3127663/31234628 bytes (10%) for Python-3.14.6.tgz"
        ));
        assert!(!is_progress_noise("Successfully installed greenlet-3.5.6 playwright-1.65.2"));
        assert!(!is_progress_noise("Installed 3.14.6 -> 3.14.6"));
    }

    #[test]
    fn workspace_names_become_safe_venv_names() {
        assert_eq!(venv_name(Path::new("/x/My Site_2")), "my-site-2");
        assert_eq!(venv_name(Path::new("/x/--odd--")), "odd");
        assert_eq!(venv_name(Path::new("/")), "workspace");
    }

    #[test]
    fn dependencies_install_in_order() {
        assert_eq!(depends_on("playwright"), &["python"]);
        assert_eq!(depends_on("python"), &["enchi"]);
        assert!(depends_on("node").is_empty());
    }

    #[test]
    fn writability_probe_sees_a_temp_dir_and_a_root_owned_one() {
        assert!(can_write(&std::env::temp_dir().join("a/b/c")));
        if cfg!(unix) && std::env::var("USER").is_ok_and(|u| u != "root") {
            assert!(!can_write(Path::new("/proc/definitely/not/writable")));
        }
    }
}

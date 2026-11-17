//! toolkit-setup: plan and install the host tools the Portable Web Toolkit needs (Git, Node, pnpm, Enchi, Python, Playwright)
//! on Windows, macOS and Linux. One OS approval opens a short administrator session; the model can then install or retry
//! a single item by name. Progress is a state file plus an event log that a person, a model or a GUI can all read.

mod elevate;
mod items;
mod manifest;
mod node;
mod privileged;
mod session;
mod state;
mod util;
mod worker;

use clap::{Parser, Subcommand};
use items::{Ctx, Runner};
use serde_json::{Value, json};
use state::Store;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::ExitCode;
use util::*;

const AFTER_HELP: &str = "\
EXAMPLES:
  toolkit-setup plan --json                 What is missing or outdated, and what needs administrator approval
  toolkit-setup install                     Install everything that is missing or outdated
  toolkit-setup install node pnpm           Install or retry just these items
  toolkit-setup status --json               Where the last run stands (read by a model or a GUI)
  toolkit-setup session start               Ask for administrator approval once, ahead of installs

SIDE EFFECTS AND SAFETY:
  plan, status, events and session status change nothing. install changes the machine. Administrator rights come only
  from the OS prompt (UAC, macOS dialog, polkit) or from sudo in your own terminal; this program never reads a password.
  The elevated session accepts only these named operations: node.install, git.install, python.build_deps.
  Node is the latest release of the .node-version major from nodejs.org, SHA-256 verified. Nothing is pinned.

EXIT CODES:
  0 success   1 usage or internal error   2 an item failed   3 administrator approval is needed but was not given";

#[derive(Parser)]
#[command(name = "toolkit-setup", version, about = "Plan and install the Portable Web Toolkit host tools", after_help = AFTER_HELP)]
struct Cli {
    /// Folder that holds Setup_agent_environment/ (default: found from the executable or the working directory)
    #[arg(long, global = true)]
    toolkit_root: Option<PathBuf>,
    /// Workspace for the Python venv and Playwright (default: the working directory)
    #[arg(long, global = true)]
    workspace: Option<PathBuf>,
    /// Machine-readable output
    #[arg(long, global = true)]
    json: bool,
    /// Do not ask nodejs.org for the latest Node release
    #[arg(long, global = true)]
    offline: bool,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Show what is current, missing or outdated (read-only)
    Plan,
    /// Install or update items (all that need it, or the named ones)
    Install {
        /// Items: git node pnpm enchi enchi-gui python playwright
        items: Vec<String>,
        /// Reinstall even when an item looks current
        #[arg(long)]
        force: bool,
        /// Minutes of inactivity before the administrator session closes
        #[arg(long, default_value_t = 15)]
        session_minutes: u64,
    },
    /// Show the last run's state and the administrator session
    Status,
    /// Show the most recent events
    Events {
        #[arg(long, default_value_t = 50)]
        last: usize,
    },
    /// Manage the administrator session
    Session {
        #[command(subcommand)]
        action: SessionCmd,
    },
    #[command(hide = true)]
    Worker {
        #[arg(long)]
        port: u16,
        #[arg(long)]
        token_file: PathBuf,
        #[arg(long, default_value_t = 900)]
        idle_secs: u64,
    },
}

#[derive(Subcommand)]
enum SessionCmd {
    /// Ask the OS for administrator approval once (reuses a live session)
    Start {
        #[arg(long, default_value_t = 15)]
        minutes: u64,
    },
    Status,
    Stop,
}

struct Engine {
    store: Store,
    exe: PathBuf,
    elevated: bool,
    /// Node's install folders are not writable by this user, so installing it needs the administrator session.
    node_needs_admin: bool,
    idle_secs: u64,
}

impl Runner for Engine {
    fn log(&mut self, item: &str, line: &str) {
        self.store.event("log", item, line);
    }

    fn privileged(&mut self, item: &str, op: &str, params: &[(&str, String)]) -> Res<String> {
        let direct = self.elevated || (op == "node.install" && !self.node_needs_admin);
        if direct {
            let map: HashMap<String, String> = params.iter().map(|(k, v)| (k.to_string(), v.clone())).collect();
            let store = &mut self.store;
            let mut emit = |line: &str| store.event("log", item, line);
            return privileged::run_op(op, &map, &mut emit);
        }
        let session = session::start(&self.exe, &mut self.store, self.idle_secs, 300)?;
        let store = &mut self.store;
        worker::call(session.port, &session.token, op, params, &mut |line| store.event("log", item, line))
    }
}

fn state_dir(root: &Option<PathBuf>) -> PathBuf {
    let dir = match std::env::var_os("TOOLKIT_SETUP_STATE_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => root
            .clone()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
            .join(".runtime/setup"),
    };
    // Absolute, so the elevated worker (which starts in another directory) can find the token file.
    std::path::absolute(&dir).unwrap_or(dir)
}

fn build_ctx(cli: &Cli) -> Res<(Ctx, PathBuf)> {
    let toolkit_root = manifest::find_toolkit_root(cli.toolkit_root.as_deref());
    let manifest = manifest::Manifest::load(toolkit_root.as_deref())?;
    let workspace = cli
        .workspace
        .clone()
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|e| e.to_string())?;
    let offline = cli.offline || std::env::var("TOOLKIT_SETUP_OFFLINE").is_ok_and(|v| v == "1");
    let dir = state_dir(&toolkit_root);
    Ok((
        Ctx {
            toolkit_root,
            manifest,
            workspace,
            opts: privileged::Opts::from_env(),
            offline,
        },
        dir,
    ))
}

fn plan_json(ctx: &Ctx, dir: &std::path::Path) -> Value {
    // Already running as an administrator: nothing needs approval, whatever the item.
    let elevated = elevate::is_elevated();
    let rows: Vec<Value> = items::ITEMS
        .iter()
        .map(|(id, label)| {
            let d = items::detect(id, ctx);
            json!({"id": id, "label": label, "status": d.status, "installed": d.installed, "target": d.target, "note": d.note, "needsAdmin": !elevated && d.needs_admin && d.status != "current", "dependsOn": items::depends_on(id)})
        })
        .collect();
    let admin: Vec<&str> = rows
        .iter()
        .filter(|r| r["needsAdmin"] == true)
        .filter_map(|r| r["id"].as_str())
        .collect();
    json!({"engine": format!("toolkit-setup {}", env!("CARGO_PKG_VERSION")), "platform": os_name(), "arch": arch_name(), "generatedAt": now_iso(), "elevated": elevated, "needsAdmin": !admin.is_empty(), "adminItems": admin, "session": session::status(dir), "items": rows})
}

fn cmd_plan(cli: &Cli) -> Res<ExitCode> {
    let (ctx, dir) = build_ctx(cli)?;
    let plan = plan_json(&ctx, &dir);
    if cli.json {
        println!("{}", serde_json::to_string_pretty(&plan).map_err(|e| e.to_string())?);
        return Ok(ExitCode::SUCCESS);
    }
    println!("Portable Web Toolkit setup plan ({} {})", os_name(), arch_name());
    for row in plan["items"].as_array().into_iter().flatten() {
        let (have, want) = (row["installed"].as_str().unwrap_or(""), row["target"].as_str().unwrap_or(""));
        let versions = match (have.is_empty(), want.is_empty()) {
            (false, false) => format!("{have} -> {want}"),
            (false, true) => have.to_string(),
            (true, false) => format!("-> {want}"),
            _ => String::new(),
        };
        let admin = if row["needsAdmin"] == true {
            "  [needs administrator approval]"
        } else {
            ""
        };
        println!(
            "  {:<11} {:<9} {}{}",
            row["id"].as_str().unwrap_or(""),
            row["status"].as_str().unwrap_or(""),
            versions,
            admin
        );
    }
    match plan["adminItems"].as_array().filter(|a| !a.is_empty()) {
        Some(items) => println!(
            "Administrator approval is needed once for: {}",
            items.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", ")
        ),
        None => println!("No administrator approval is needed."),
    }
    Ok(ExitCode::SUCCESS)
}

fn with_dependencies(wanted: &[String]) -> Res<Vec<&'static str>> {
    for id in wanted {
        if !items::ITEMS.iter().any(|(i, _)| i == id) {
            return Err(format!(
                "unknown item `{id}`; choose from: {}",
                items::ITEMS.iter().map(|(i, _)| *i).collect::<Vec<_>>().join(" ")
            ));
        }
    }
    let mut chosen: Vec<&'static str> = Vec::new();
    fn add(id: &'static str, chosen: &mut Vec<&'static str>) {
        for dep in items::depends_on(id) {
            add(dep, chosen);
        }
        if !chosen.contains(&id) {
            chosen.push(id);
        }
    }
    for (id, _) in items::ITEMS {
        if wanted.is_empty() || wanted.iter().any(|w| w == id) {
            add(id, &mut chosen);
        }
    }
    chosen.sort_by_key(|id| items::ITEMS.iter().position(|(i, _)| i == id));
    Ok(chosen)
}

/// After an install, put the folder it linked into at the front of this process's PATH so the re-check sees the NEW tool, not
/// an older one that happens to sit earlier on PATH (on a Mac, Homebrew's node in /usr/local/bin).
/// Close the administrator session at the end of a run only when this run opened it and nothing failed.
fn should_close_session(had_session_before: bool, everything_succeeded: bool) -> bool {
    !had_session_before && everything_succeeded
}

fn refresh_path_after(id: &str, opts: &privileged::Opts) {
    if id == "node" {
        if cfg!(windows) {
            let program_files = std::env::var_os("ProgramFiles")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("C:\\Program Files"));
            path_prepend(&program_files.join("nodejs"));
        } else {
            path_prepend(&opts.bin_dir);
        }
    }
}

fn cmd_install(cli: &Cli, wanted: &[String], force: bool, minutes: u64) -> Res<ExitCode> {
    let (ctx, dir) = build_ctx(cli)?;
    let chosen = with_dependencies(wanted)?;
    let _run_lock = state::acquire_lock(&dir)?;
    let mut store = Store::open(&dir, cli.json)?;
    store.begin_run();
    store.event("run_started", "", &format!("Setup started for: {}", chosen.join(", ")));
    // An administrator session that was already open (a person or model started it, or an earlier run left it) is not ours to close.
    let had_session = session::alive(&dir).is_some();
    let mut engine = Engine {
        node_needs_admin: items::node_needs_admin(&ctx.opts),
        store,
        exe: std::env::current_exe().map_err(|e| e.to_string())?,
        elevated: elevate::is_elevated(),
        idle_secs: minutes.max(1) * 60,
    };
    let (mut failed, mut needs_auth) = (Vec::new(), false);
    let mut broken: Vec<&str> = Vec::new();
    // Under `sudo toolkit-setup install` the user-scope tools would be installed as root into the invoking user's home.
    let root_for_a_user = elevate::elevated_for_a_user();
    if root_for_a_user {
        engine.store.event(
            "log",
            "",
            "Running as root through sudo: only Git and Node are installed here. Run `toolkit-setup install` again WITHOUT sudo for the rest, so nothing in your home folder becomes root-owned.",
        );
    }
    for id in chosen {
        if root_for_a_user && !items::needs_admin_item(id) {
            engine
                .store
                .set_item(id, "skipped", "run without sudo: this tool installs into your home folder", "", "");
            engine
                .store
                .event("item_finished", id, "skipped: run `toolkit-setup install` without sudo");
            broken.push(id);
            continue;
        }
        if let Some(dep) = items::depends_on(id).iter().find(|d| broken.contains(d)) {
            engine
                .store
                .set_item(id, "skipped", &format!("depends on {dep}, which did not install"), "", "");
            engine.store.event("item_finished", id, &format!("skipped: depends on {dep}"));
            broken.push(id);
            continue;
        }
        let before = items::detect(id, &ctx);
        if before.status == "current" && !force {
            engine.store.set_item(id, "current", &before.note, &before.installed, "");
            engine
                .store
                .event("item_finished", id, &format!("already current ({})", before.installed));
            continue;
        }
        engine
            .store
            .set_item(id, "running", &before.note, &before.installed, &before.target);
        engine.store.event("item_started", id, &before.note);
        let outcome = items::install(id, &ctx, &mut engine);
        refresh_path_after(id, &ctx.opts);
        refresh_path_from_registry();
        match outcome {
            Ok(message) => {
                let after = items::detect(id, &ctx);
                if after.status == "current" {
                    engine.store.set_item(id, "installed", &message, &after.installed, &after.target);
                    engine.store.event("item_finished", id, &format!("installed: {message}"));
                } else {
                    // Say why: a Node that was installed but does not run (a missing library) is a different problem from PATH.
                    let probe = if id == "node" {
                        Some(util::run("node", &["--version"], None))
                    } else {
                        None
                    };
                    let cause = match probe {
                        Some(p) if !p.ok => format!("`node --version` says: {}", p.text().lines().next().unwrap_or("it did not run")),
                        _ => after.note.clone(),
                    };
                    let why = format!("{message}; still not detected ({cause}). Open a new terminal and run `toolkit-setup plan`");
                    engine.store.set_item(id, "failed", &why, &after.installed, &after.target);
                    engine.store.event("item_finished", id, &format!("failed: {why}"));
                    failed.push(id);
                    broken.push(id);
                }
            }
            Err(error) => {
                let auth = error.starts_with("authorization:");
                needs_auth |= auth;
                engine.store.set_item(
                    id,
                    if auth { "needs_authorization" } else { "failed" },
                    &error,
                    &before.installed,
                    &before.target,
                );
                engine.store.event(
                    "item_finished",
                    id,
                    &format!("{}: {error}", if auth { "needs authorization" } else { "failed" }),
                );
                failed.push(id);
                broken.push(id);
            }
        }
    }
    let summary = if failed.is_empty() {
        "finished".to_string()
    } else {
        format!("finished with problems: {}", failed.join(", "))
    };
    engine
        .store
        .set_status(if failed.is_empty() { "finished" } else { "finished_with_problems" }, &summary);
    engine.store.event("run_finished", "", &summary);
    // Least privilege: a session this run opened is closed once everything succeeded. After a failure it stays open (until it idles
    // out) so the failed item can be retried by name without another approval.
    if should_close_session(had_session, failed.is_empty()) && session::stop(&dir) {
        engine
            .store
            .event("session_closed", "", "Administrator session closed (everything installed)");
    }
    if cli.json {
        println!(
            "{}",
            json!({"type": "summary", "ok": failed.is_empty(), "failed": failed, "needsAuthorization": needs_auth, "state": engine.store.state})
        );
    }
    Ok(if needs_auth {
        ExitCode::from(3)
    } else if failed.is_empty() {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(2)
    })
}

fn cmd_status(cli: &Cli) -> Res<ExitCode> {
    let (_, dir) = build_ctx(cli)?;
    let store = Store::open(&dir, false)?;
    let session = session::status(&dir);
    if cli.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"state": store.state, "session": session})).map_err(|e| e.to_string())?
        );
        return Ok(ExitCode::SUCCESS);
    }
    if store.state.run_id.is_empty() {
        println!("No setup run yet. Try `toolkit-setup plan`.");
    } else {
        println!("Run {}: {} {}", store.state.run_id, store.state.status, store.state.note);
        for (id, item) in &store.state.items {
            println!("  {:<11} {:<19} {}", id, item.status, item.message);
        }
    }
    println!(
        "Administrator session: {}",
        if session["active"] == true { "active" } else { "not active" }
    );
    Ok(ExitCode::SUCCESS)
}

fn run(cli: Cli) -> Res<ExitCode> {
    match &cli.cmd {
        Cmd::Plan => cmd_plan(&cli),
        Cmd::Install {
            items,
            force,
            session_minutes,
        } => cmd_install(&cli, items, *force, *session_minutes),
        Cmd::Status => cmd_status(&cli),
        Cmd::Events { last } => {
            let (_, dir) = build_ctx(&cli)?;
            for event in Store::open(&dir, false)?.recent_events(*last) {
                println!("{event}");
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Session { action } => {
            let (_, dir) = build_ctx(&cli)?;
            match action {
                SessionCmd::Start { minutes } => {
                    let mut store = Store::open(&dir, cli.json)?;
                    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
                    if elevate::is_elevated() {
                        println!("Already running with administrator rights; no session is needed.");
                        return Ok(ExitCode::SUCCESS);
                    }
                    match session::start(&exe, &mut store, minutes.max(&1) * 60, 300) {
                        Ok(_) => Ok(ExitCode::SUCCESS),
                        Err(e) if e.starts_with("authorization:") => {
                            eprintln!("{e}");
                            Ok(ExitCode::from(3))
                        }
                        Err(e) => Err(e),
                    }
                }
                SessionCmd::Status => {
                    println!("{}", session::status(&dir));
                    Ok(ExitCode::SUCCESS)
                }
                SessionCmd::Stop => {
                    println!(
                        "{}",
                        if session::stop(&dir) {
                            "Administrator session closed."
                        } else {
                            "No administrator session was active."
                        }
                    );
                    Ok(ExitCode::SUCCESS)
                }
            }
        }
        Cmd::Worker {
            port,
            token_file,
            idle_secs,
        } => {
            privileged::enter_worker_mode();
            worker::serve(*port, token_file, *idle_secs).map(|_| ExitCode::SUCCESS)
        }
    }
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(code) => code,
        Err(message) => {
            eprintln!("toolkit-setup: {message}");
            ExitCode::from(1)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_session_is_closed_only_when_this_run_opened_it_and_everything_worked() {
        assert!(should_close_session(false, true), "opened here, all good: close it");
        assert!(
            !should_close_session(false, false),
            "something failed: keep it so a retry needs no new approval"
        );
        assert!(!should_close_session(true, true), "someone else's session is not ours to close");
        assert!(!should_close_session(true, false));
    }
}

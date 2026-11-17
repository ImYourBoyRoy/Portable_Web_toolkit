# toolkit-setup (setup engine)

Rust engine that plans and installs the host tools the Portable Web Toolkit needs: **Git, Node.js, pnpm, Enchi, Enchi GUI, Python
(workspace venv via Enchi) and Python Playwright**, on Windows, macOS and Linux. It replaces the drifting bash and PowerShell
installers with one tested codebase; the launchers use it when present and fall back to the scripts otherwise.

```bash
toolkit-setup plan --json              # read-only: what is current, missing or outdated, and what needs administrator approval
toolkit-setup install                  # install everything that needs it
toolkit-setup install node pnpm        # install or retry just these (dependencies are added: python needs enchi)
toolkit-setup status --json            # last run: per-item status and message (a model or a GUI reads this)
toolkit-setup events --last 50         # the event log (JSON lines)
toolkit-setup session start            # ask for administrator approval once, ahead of installs
```

Exit codes: `0` success, `1` usage or internal error, `2` an item failed, `3` administrator approval was needed but not given.

## One approval, several installs

Only Node (system-wide: `/usr/local/lib/nodejs` or the MSI), Git on Linux and Windows, and on Linux the tools Python is compiled with need administrator rights. When one
does, the engine asks the OS **once** and keeps a short administrator session open (15 minutes of inactivity by default):

| OS | How approval is asked | Notes |
|----|----------------------|-------|
| Windows | UAC (`Start-Process -Verb RunAs`) | The user clicks the real UAC prompt |
| macOS | The standard administrator dialog (`osascript`) | Over SSH, passwordless or terminal `sudo` |
| Linux | polkit (`pkexec`) with a desktop session, otherwise `sudo` | Passwordless sudo needs no prompt at all |

The engine **never reads a password**. The session is an elevated copy of this binary that serves only the closed operations in
`src/privileged.rs` (`node.install`, `git.install`, `python.build_deps`), over `127.0.0.1`, to callers that hold the session token. During the window a
failed item can be retried by name with no new prompt. Items that install into the user's folders (pnpm, Enchi, Python, Playwright)
run as the user, so nothing in the home folder becomes root-owned; if the engine itself is started with `sudo`, it installs only
Git and Node and tells you to run the rest without `sudo`.

What the elevated worker does and does not trust:

- **Environment:** none. The worker ignores every `TOOLKIT_SETUP_*` variable (the test overrides do not exist in a release build) and
  replaces PATH with the OS's own folders. Tools (`curl`, `tar`, `msiexec`, the package managers) run by absolute path from there.
- **Downloads:** into a fresh directory created exclusively under a location only administrators can write (inside the Node install
  folder on macOS and Linux, `%ProgramData%\toolkit-setup` on Windows), verified against nodejs.org's SHA-256 and extracted from that
  same file. The archive's owners are not restored and the result is handed to root.
- **Node installers:** the Windows MSI must carry a valid Authenticode signature whose signer is exactly `CN=OpenJS Foundation`
  (checked by the system PowerShell with a 90 s limit, in addition to the SHA-256; on a real guest a genuine MSI is `Valid` in about
  3 s and a one-byte change is `HashMismatch`). Linux uses the `.tar.gz` build so no `xz` is needed, and if the extracted Node cannot
  start (a missing `libatomic` on a minimal image) the library is installed and Node is run *before* it replaces anything.
- **Node major:** at least the one this binary was built for, so the session cannot be used to downgrade Node.
- **Files:** the worker writes none in the user's setup folder (the client chooses the port) and refuses a symlinked token file.
- **Token:** a file in `.runtime/setup/` (a folder created `0700`; the file is `0600` on Unix and restricted to the current user with
  `icacls` on Windows). **Trust boundary:** other processes of the same user are inside the approval, as with a `sudo` timestamp.
  They can read the token and use the session until it idles out, and they could swap a user-writable binary before it is approved.
  The approval shows the binary's path; running a binary from a root-owned location (a packaged install) removes that last gap.

## Linux builds Python from source

Enchi compiles CPython on Linux (its `preflight` lists the requirements). The engine therefore installs the build prerequisites
(a compiler, `make`, `pkg-config` and the OpenSSL, zlib, bzip2, lzma, readline, sqlite, libffi and ncurses headers, with the right
package names for apt, dnf/yum, pacman and zypper) through the same administrator session, then runs `enchi install`. The build takes
several minutes; its output is streamed into the event log (progress bars are filtered). macOS and Windows use no such step.

Verified on a bare `ubuntu:24.04` container with only `curl`: Git (apt), Node, pnpm, Enchi, Python 3.14.6 with its workspace venv
(pip over HTTPS works), Playwright and Chromium all install, and a second run changes nothing.

## What a model or a GUI reads

`Web_Toolkit/.runtime/setup/` (owned by the user, written only by the unprivileged process):

- `state.json`: `status` (`running`, `awaiting_authorization`, `finished`, `finished_with_problems`) and per-item `status`
  (`running`, `installed`, `current`, `failed`, `skipped`, `needs_authorization`) with `message`, `installed`, `target`.
- `events.jsonl`: `run_started`, `item_started`, `log`, `awaiting_authorization`, `authorized`, `item_finished`, `run_finished`.

With `--json`, `install` prints those events as JSON lines, then one `{"type":"summary", ...}` object.

## No pins

Node is the latest release of the major in the repo-root `.node-version` (a bare major), resolved from
`nodejs.org/dist/latest-v<major>.x/SHASUMS256.txt` and SHA-256 verified. pnpm and Enchi come from their own latest-release
installers; the Enchi GUI asset is checked against its published checksum. Dependencies in `Cargo.toml` are ranges.

## Build and test

```bash
cargo test            # unit tests plus integration tests against a fake nodejs.org (file://), no network, no elevation
cargo build --release
```

In a debug build only, `TOOLKIT_SETUP_TEST_MODE=1` redirects the Node install folders and download base, and
`TOOLKIT_SETUP_ELEVATE_WITH=none` starts the worker as the same user (so tests can run the real subprocess path). Neither exists in a
release build, and the worker ignores them. `TOOLKIT_SETUP_NO_ELEVATE=1` makes the engine refuse to elevate. Releases attach `toolkit-setup-<os>-<arch>` plus a `.sha256` to the
version tag (`.github/workflows/engine.yml`); Linux builds are static and the Windows exe links the C runtime statically. The
launchers download the one for the toolkit's `VERSION`, record that version beside it and refuse a stale or non-starting engine.
The checksum comes from the same release as the binary, so it guards the download, not a compromised release; there is no signature
yet, and Windows SmartScreen and macOS Gatekeeper can warn on a downloaded copy.

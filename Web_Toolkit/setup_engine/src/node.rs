//! Node: the required major comes from the repo-root `.node-version` (a bare major), the release is the latest of that major
//! on nodejs.org, read from its own checksum file. Nothing here names a Node version.

use crate::manifest::Manifest;
use crate::util::{Res, arch_name, curl_text, os_name, parse_version};
use std::fs;
use std::path::Path;

pub const DEFAULT_DIST_BASE: &str = "https://nodejs.org/dist";

#[derive(Debug, Clone, PartialEq)]
pub struct Latest {
    pub version: String,
    pub file: String,
    pub sha256: String,
    pub url: String,
}

/// The major named by `.node-version` one level above the toolkit root, else the manifest's fallback.
pub fn required_major(toolkit_root: Option<&Path>, manifest: &Manifest) -> String {
    let from_pin = toolkit_root
        .and_then(|root| fs::read_to_string(root.join("..").join(".node-version")).ok())
        .map(|t| t.trim().trim_start_matches('v').split('.').next().unwrap_or("").to_string())
        .filter(|m| !m.is_empty() && m.chars().all(|c| c.is_ascii_digit()));
    from_pin.unwrap_or_else(|| manifest.get("tool.node.major", "26"))
}

/// The archive suffix nodejs.org publishes for this platform: `darwin-arm64.tar.gz`, `linux-x64.tar.gz`, `x64.msi`. Linux uses
/// the `.tar.gz` (not the smaller `.tar.xz`) so a minimal machine does not need `xz` installed.
pub fn artifact_suffix() -> Res<String> {
    let arch = match arch_name() {
        "aarch64" | "arm64" => "arm64",
        "x86_64" | "amd64" => "x64",
        other => return Err(format!("unsupported architecture: {other}")),
    };
    Ok(match os_name() {
        "windows" => format!("{arch}.msi"),
        "macos" => format!("darwin-{arch}.tar.gz"),
        _ => format!("linux-{arch}.tar.gz"),
    })
}

/// Picks this platform's artifact out of a `SHASUMS256.txt` body. Pure, so it is unit tested.
pub fn parse_shasums(text: &str, suffix: &str, base_for_major: &str) -> Option<Latest> {
    let want = format!("-{suffix}");
    text.lines().find_map(|line| {
        let mut cols = line.split_whitespace();
        let (sha, file) = (cols.next()?, cols.next()?);
        let version = file.strip_prefix("node-v")?.strip_suffix(want.as_str())?;
        let looks_like_version =
            version.split('.').count() == 3 && version.split('.').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
        (looks_like_version && sha.len() == 64).then(|| Latest {
            version: version.to_string(),
            file: file.to_string(),
            sha256: sha.to_lowercase(),
            url: format!("{base_for_major}/{file}"),
        })
    })
}

pub fn resolve_latest(dist_base: &str, major: &str) -> Res<Latest> {
    let base = format!("{}/latest-v{major}.x", dist_base.trim_end_matches('/'));
    let sums = curl_text(&format!("{base}/SHASUMS256.txt"))?;
    parse_shasums(&sums, &artifact_suffix()?, &base)
        .ok_or_else(|| format!("no Node {major}.x build for this platform in {base}/SHASUMS256.txt"))
}

/// Policy: at least the required major, and when the latest release is known, not a patch behind it. A newer major than
/// required is accepted, and not knowing the latest (offline) never forces an update.
pub fn needs_install(installed: Option<&str>, major: &str, latest: Option<&str>) -> bool {
    let Some(have) = installed.and_then(parse_version) else {
        return true;
    };
    let want: u64 = major.parse().unwrap_or(0);
    if have.0 < want {
        return true;
    }
    if have.0 != want {
        return false;
    }
    latest.and_then(parse_version).is_some_and(|l| have < l)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SUMS: &str = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  node-v26.99.0-darwin-arm64.tar.gz\n\
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  node-v26.99.0-linux-x64.tar.gz\n\
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee  node-v26.99.0-linux-x64.tar.xz\n\
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  node-v26.99.0-x64.msi\n\
dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd  node-v26.99.0-win-x64.zip\n";

    #[test]
    fn picks_the_platform_artifact_and_never_a_lookalike() {
        let linux = parse_shasums(SUMS, "linux-x64.tar.gz", "https://x/latest-v26.x").unwrap();
        assert_eq!((linux.version.as_str(), linux.sha256.starts_with("bbbb")), ("26.99.0", true));
        assert_eq!(linux.url, "https://x/latest-v26.x/node-v26.99.0-linux-x64.tar.gz");
        let msi = parse_shasums(SUMS, "x64.msi", "https://x").unwrap();
        assert!(msi.file.ends_with("-x64.msi") && !msi.file.contains("win"));
        assert!(parse_shasums(SUMS, "linux-arm64.tar.gz", "https://x").is_none());
    }

    #[test]
    fn policy_matches_the_scripts() {
        assert!(needs_install(None, "26", Some("26.13.1")), "missing");
        assert!(needs_install(Some("v25.9.0"), "26", Some("26.13.1")), "below the major");
        assert!(needs_install(Some("v26.5.0"), "26", Some("26.13.1")), "behind the latest patch");
        assert!(!needs_install(Some("v26.13.1"), "26", Some("26.13.1")), "current");
        assert!(!needs_install(Some("v27.0.0"), "26", Some("26.13.1")), "a newer major is accepted");
        assert!(!needs_install(Some("v26.5.0"), "26", None), "offline never forces an update");
    }
}

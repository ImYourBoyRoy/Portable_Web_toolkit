//! The host-bootstrap manifest: a flat JSON map shared with the legacy scripts. The binary carries a copy as a fallback.

use crate::util::Res;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const EMBEDDED: &str = include_str!("../../Setup_agent_environment/config/host-bootstrap.manifest.json");
const MANIFEST_REL: &str = "Setup_agent_environment/config/host-bootstrap.manifest.json";

pub struct Manifest(HashMap<String, String>);

impl Manifest {
    pub fn load(toolkit_root: Option<&Path>) -> Res<Manifest> {
        let text = toolkit_root
            .map(|root| root.join(MANIFEST_REL))
            .and_then(|path| fs::read_to_string(path).ok())
            .unwrap_or_else(|| EMBEDDED.to_string());
        Manifest::parse(&text)
    }

    pub fn parse(text: &str) -> Res<Manifest> {
        let value: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("manifest is not valid JSON: {e}"))?;
        let object = value.as_object().ok_or("manifest must be a JSON object")?;
        let map = object
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())))
            .collect();
        Ok(Manifest(map))
    }

    pub fn get(&self, key: &str, default: &str) -> String {
        self.0.get(key).cloned().unwrap_or_else(|| default.to_string())
    }
}

/// The Node major this binary was built to install, from the manifest copy compiled into it. The elevated worker refuses to
/// install anything older, so a same-user caller cannot use the session to downgrade Node.
pub fn embedded_node_major() -> u64 {
    Manifest::parse(EMBEDDED)
        .ok()
        .and_then(|m| m.get("tool.node.major", "0").parse().ok())
        .unwrap_or(0)
}

/// The toolkit root is the folder that holds `Setup_agent_environment/config/host-bootstrap.manifest.json`
/// (`Web_Toolkit/`), found from an explicit path, the environment, then upward from the executable and the working directory.
pub fn find_toolkit_root(explicit: Option<&Path>) -> Option<PathBuf> {
    let has_manifest = |dir: &Path| dir.join(MANIFEST_REL).is_file();
    let mut starts: Vec<PathBuf> = Vec::new();
    if let Some(path) = explicit {
        starts.push(path.to_path_buf());
    }
    if let Some(path) = std::env::var_os("TOOLKIT_SETUP_TOOLKIT_ROOT") {
        starts.push(PathBuf::from(path));
    }
    if let Ok(exe) = std::env::current_exe()
        && let Some(parent) = exe.parent()
    {
        starts.push(parent.to_path_buf());
    }
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd);
    }
    for start in starts {
        for dir in start.ancestors() {
            if has_manifest(dir) {
                return Some(dir.to_path_buf());
            }
            let nested = dir.join("Web_Toolkit");
            if has_manifest(&nested) {
                return Some(nested);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_manifest_parses_and_names_no_node_version() {
        let m = Manifest::parse(EMBEDDED).unwrap();
        assert_eq!(m.get("tool.node.dist_base", ""), "https://nodejs.org/dist");
        assert!(m.get("tool.node.major", "").chars().all(|c| c.is_ascii_digit()));
        assert!(!EMBEDDED.contains("nodejs.org/dist/v"), "a version-specific Node URL is a pin");
        assert_eq!(m.get("missing.key", "fallback"), "fallback");
    }
}

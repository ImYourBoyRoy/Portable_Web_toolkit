#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./browser_diagnostics/bin/browser-diagnostics.mjs" "$@"

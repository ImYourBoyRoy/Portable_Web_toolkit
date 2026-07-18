#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./performance_fixes/bin/performance-fixes.mjs" "$@"

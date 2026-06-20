#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node scripts/export-portable-toolkit.mjs --zip "$@"

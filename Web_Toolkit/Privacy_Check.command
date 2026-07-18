#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node privacy_check/bin/privacy-check.mjs scan "$@"

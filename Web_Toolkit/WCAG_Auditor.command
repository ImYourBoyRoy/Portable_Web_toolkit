#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./wcag_auditor/bin/wcag-auditor.mjs" "$@"

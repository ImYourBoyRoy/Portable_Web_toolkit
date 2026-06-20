#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs" "$@"

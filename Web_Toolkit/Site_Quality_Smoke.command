#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./site_quality_smoke/bin/site-quality-smoke.mjs" "$@"

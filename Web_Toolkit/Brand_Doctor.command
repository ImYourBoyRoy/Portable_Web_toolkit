#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./brand_doctor/bin/brand-doctor.mjs" "$@"

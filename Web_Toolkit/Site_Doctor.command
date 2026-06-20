#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./site_doctor/bin/site-doctor.mjs" "$@"

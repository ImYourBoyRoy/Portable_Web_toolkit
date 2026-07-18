#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./integration_doctor/bin/integration-doctor.mjs" "$@"

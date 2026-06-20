#!/bin/bash
# ./Web_Toolkit/Setup_Agent_Environment.sh
# Launcher for the host bootstrap flow on Linux/macOS.
set -euo pipefail
cd "$(dirname "$0")"
bash ./scripts/bootstrap.sh prepare-host "$@"

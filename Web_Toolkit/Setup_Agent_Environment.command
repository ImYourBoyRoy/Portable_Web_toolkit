#!/bin/bash
# ./Web_Toolkit/Setup_Agent_Environment.command
# Launcher for the host environment bootstrap on macOS/Linux.
set -euo pipefail
cd "$(dirname "$0")"
bash ./Setup_Agent_Environment.sh "$@"

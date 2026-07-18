#!/usr/bin/env bash
# ./Web_Toolkit/Setup_Agent_Environment.command
# Launcher for the host environment bootstrap on macOS/Linux.
# Does NOT require Node.js — Setup_Agent_Environment.sh runs a Bash wizard that can install Node.
set -euo pipefail
cd "$(dirname "$0")"
exec bash ./Setup_Agent_Environment.sh "$@"

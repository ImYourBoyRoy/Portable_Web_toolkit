#!/usr/bin/env bash
# ./Setup_Agent_Environment.command
# Double-click launcher for macOS (repo root).
# Does NOT require Node.js — Setup_Agent_Environment.sh runs a Bash wizard that can install Node.

DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/Setup_Agent_Environment.sh" "$@"

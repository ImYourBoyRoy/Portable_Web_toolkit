#!/usr/bin/env bash
# ./Setup_Agent_Environment.command
# Double-click launcher for macOS (repo root).

DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/Setup_Agent_Environment.sh" "$@"

#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/project_init/bin/project-init.mjs" "$@"

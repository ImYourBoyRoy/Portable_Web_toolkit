#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
node "$DIR/package_updater/bin/package-updater.mjs" "$@"

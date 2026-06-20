#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
node "$DIR/toolkit_purge/bin/toolkit-purge.mjs" "$@"

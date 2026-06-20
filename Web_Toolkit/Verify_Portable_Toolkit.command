#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
node "$DIR/toolkit_verify/bin/toolkit-verify.mjs" "$@"

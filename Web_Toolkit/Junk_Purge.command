#!/bin/bash
cd "$(dirname "$0")"
node junk_purge/bin/junk-purge.mjs "$@"

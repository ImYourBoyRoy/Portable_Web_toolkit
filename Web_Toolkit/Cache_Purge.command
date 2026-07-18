#!/bin/bash
cd "$(dirname "$0")"
node cache_purge/bin/cache-purge.mjs "$@"

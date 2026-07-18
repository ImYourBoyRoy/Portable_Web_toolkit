#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node Setup_astro_environment/bin/astro-env-setup.mjs preview "$@"

#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node init_site_profile/bin/init-site-profile.mjs "$@"

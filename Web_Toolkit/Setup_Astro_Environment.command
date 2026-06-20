#!/bin/bash
cd "$(dirname "$0")"
node Setup_astro_environment/bin/astro-env-setup.mjs prepare-project "$@"

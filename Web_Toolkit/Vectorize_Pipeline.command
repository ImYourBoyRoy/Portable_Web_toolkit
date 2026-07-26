#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./vectorize_pipeline/bin/vectorize-pipeline.mjs" "$@"

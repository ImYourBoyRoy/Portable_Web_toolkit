#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node "./image_pipeline/bin/image-pipeline.mjs" "$@"

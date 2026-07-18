#!/bin/bash
cd "$(dirname "$0")"
node registrar/registrar.mjs "$@"

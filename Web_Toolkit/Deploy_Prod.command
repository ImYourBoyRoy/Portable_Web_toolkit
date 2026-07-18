#!/bin/bash
cd "$(dirname "$0")"
node cloudflare-agent-toolkit/bin/cf-agent.mjs deploy prod "$@"

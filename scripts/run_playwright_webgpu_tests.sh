#!/usr/bin/env bash
set -euo pipefail

CHROMIUM_CHANNEL=${1:-chrome}
HEADFUL=${2:-0}

if [ "$HEADFUL" = "1" ]; then
  export PF_WEBGPU_HEADFUL=1
fi
export PF_RUN_WEBGPU_PLAYWRIGHT=1
if [ -z "${PF_WEBGPU_CHROMIUM_CHANNEL:-}" ]; then
  export PF_WEBGPU_CHROMIUM_CHANNEL=$CHROMIUM_CHANNEL
fi
export PYTHONPATH='.'

echo "Running Playwright WebGPU tests"
echo "PF_WEBGPU_HEADFUL=${PF_WEBGPU_HEADFUL:-}" 
echo "PF_WEBGPU_CHROMIUM_CHANNEL=${PF_WEBGPU_CHROMIUM_CHANNEL:-}" 

pytest -q tests/test_webgpu_playwright.py -s

#!/bin/bash
set -e

echo "Running PrivateVoice Test Suite"
echo "=================================="

echo ""
echo "Type checking..."
pnpm check

echo ""
echo "Running unit tests..."
pnpm test:run

echo ""
echo "Running E2E tests..."
pnpm test:e2e

echo ""
echo "Running backend syntax smoke test..."
python3 -m py_compile \
  python/tts_server/main.py \
  python/tts_server/translation.py \
  src-tauri/resources/tts_server/main.py \
  src-tauri/resources/tts_server/translation.py

echo ""
echo "All tests passed!"

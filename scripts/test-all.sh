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
echo "All tests passed!"

#!/bin/bash
# Full release build for Qwen3-TTS Desktop
# This script builds the sidecar and then the Tauri app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  Qwen3-TTS Desktop Release Build"
echo "=============================================="
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Build the Python sidecar
echo "=== Step 1/3: Building Python Sidecar ==="
echo ""
./python/build_sidecar.sh

# Verify sidecar was built
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TARGET_TRIPLE="aarch64-apple-darwin"
else
    TARGET_TRIPLE="x86_64-apple-darwin"
fi

SIDECAR_PATH="src-tauri/binaries/tts-server-$TARGET_TRIPLE"
if [ ! -f "$SIDECAR_PATH" ]; then
    echo "ERROR: Sidecar binary not found at $SIDECAR_PATH"
    exit 1
fi
echo ""
echo "Sidecar ready: $SIDECAR_PATH"
echo ""

# Step 2: Install frontend dependencies
echo "=== Step 2/3: Installing Frontend Dependencies ==="
echo ""
pnpm install
echo ""

# Step 3: Build Tauri app
echo "=== Step 3/3: Building Tauri Application ==="
echo ""
pnpm tauri build

echo ""
echo "=============================================="
echo "  Build Complete!"
echo "=============================================="
echo ""

# Find the built app
APP_PATH=$(find src-tauri/target/release/bundle -name "*.app" -type d 2>/dev/null | head -1)
DMG_PATH=$(find src-tauri/target/release/bundle -name "*.dmg" -type f 2>/dev/null | head -1)

if [ -n "$APP_PATH" ]; then
    echo "App bundle: $APP_PATH"
    echo "Size: $(du -sh "$APP_PATH" | cut -f1)"
fi

if [ -n "$DMG_PATH" ]; then
    echo ""
    echo "DMG installer: $DMG_PATH"
    echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
fi

echo ""
echo "To test the app:"
echo "  open \"$APP_PATH\""
echo ""

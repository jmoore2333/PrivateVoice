#!/bin/bash
# Full release build for PrivateVoice
# This script builds the sidecar and then the Tauri app
# Supports macOS, Linux, and Windows (Git Bash/MSYS2)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  PrivateVoice Release Build"
echo "=============================================="
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"

# Detect platform (same logic as build_sidecar.sh)
ARCH=$(uname -m)
OS=$(uname -s)
EXE_SUFFIX=""

case "$OS" in
    Darwin)
        if [ "$ARCH" = "arm64" ]; then
            TARGET_TRIPLE="aarch64-apple-darwin"
        else
            TARGET_TRIPLE="x86_64-apple-darwin"
        fi
        ;;
    Linux)
        if [ "$ARCH" = "aarch64" ]; then
            TARGET_TRIPLE="aarch64-unknown-linux-gnu"
        else
            TARGET_TRIPLE="x86_64-unknown-linux-gnu"
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        TARGET_TRIPLE="x86_64-pc-windows-msvc"
        EXE_SUFFIX=".exe"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

echo "Detected platform: $TARGET_TRIPLE"
echo ""

# Step 1: Build the Python sidecar
echo "=== Step 1/3: Building Python Sidecar ==="
echo ""
./python/build_sidecar.sh

# Verify sidecar was built
case "$OS" in
    Darwin)
        # macOS: --onefile single binary for externalBin
        SIDECAR_PATH="src-tauri/binaries/tts-server-$TARGET_TRIPLE"
        if [ ! -f "$SIDECAR_PATH" ]; then
            echo "ERROR: Sidecar binary not found at $SIDECAR_PATH"
            exit 1
        fi
        echo "Sidecar ready: $SIDECAR_PATH"
        ;;
    *)
        # Windows/Linux: --onedir directory for Tauri resources
        SIDECAR_DIR="src-tauri/sidecar/tts-server"
        SIDECAR_EXE="$SIDECAR_DIR/tts-server$EXE_SUFFIX"
        if [ ! -d "$SIDECAR_DIR" ]; then
            echo "ERROR: Sidecar directory not found at $SIDECAR_DIR"
            exit 1
        fi
        if [ ! -f "$SIDECAR_EXE" ]; then
            echo "ERROR: Sidecar executable not found at $SIDECAR_EXE"
            exit 1
        fi
        echo "Sidecar ready: $SIDECAR_DIR ($(ls "$SIDECAR_DIR" | wc -l) items)"
        ;;
esac
echo ""

# Step 2: Install frontend dependencies
echo "=== Step 2/3: Installing Frontend Dependencies ==="
echo ""
pnpm install
echo ""

# Step 3: Build Tauri app
echo "=== Step 3/3: Building Tauri Application ==="
echo ""
# macOS: externalBin config loaded from tauri.macos.conf.json automatically
# Windows/Linux: inject resources config at build time (not in base config to keep cargo check clean)
RESOURCES_CONFIG='{"bundle":{"resources":["sidecar/tts-server/**/*"]}}'

case "$OS" in
    Darwin)
        pnpm tauri build
        ;;
    MINGW*|MSYS*|CYGWIN*)
        pnpm tauri build --bundles nsis --config "$RESOURCES_CONFIG"
        ;;
    Linux)
        pnpm tauri build --config "$RESOURCES_CONFIG"
        ;;
esac

echo ""
echo "=============================================="
echo "  Build Complete!"
echo "=============================================="
echo ""

# Find and display the built artifacts
case "$OS" in
    Darwin)
        APP_PATH=$(find src-tauri/target/release/bundle -name "*.app" -type d 2>/dev/null | head -1)
        DMG_PATH=$(find src-tauri/target/release/bundle -name "*.dmg" -type f 2>/dev/null | head -1)
        if [ -n "$APP_PATH" ]; then
            echo "App bundle: $APP_PATH"
            echo "Size: $(du -sh "$APP_PATH" | cut -f1)"
        fi
        if [ -n "$DMG_PATH" ]; then
            echo "DMG installer: $DMG_PATH"
            echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
        fi
        echo ""
        echo "To test the app:"
        echo "  open \"$APP_PATH\""
        ;;
    Linux)
        DEB_PATH=$(find src-tauri/target/release/bundle -name "*.deb" -type f 2>/dev/null | head -1)
        APPIMAGE_PATH=$(find src-tauri/target/release/bundle -name "*.AppImage" -type f 2>/dev/null | head -1)
        if [ -n "$DEB_PATH" ]; then
            echo "Deb package: $DEB_PATH"
            echo "Size: $(du -h "$DEB_PATH" | cut -f1)"
        fi
        if [ -n "$APPIMAGE_PATH" ]; then
            echo "AppImage: $APPIMAGE_PATH"
            echo "Size: $(du -h "$APPIMAGE_PATH" | cut -f1)"
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        NSIS_PATH=$(find src-tauri/target/release/bundle -name "*.exe" -type f 2>/dev/null | head -1)
        MSI_PATH=$(find src-tauri/target/release/bundle -name "*.msi" -type f 2>/dev/null | head -1)
        if [ -n "$NSIS_PATH" ]; then
            echo "NSIS installer: $NSIS_PATH"
            echo "Size: $(du -h "$NSIS_PATH" | cut -f1)"
        fi
        if [ -n "$MSI_PATH" ]; then
            echo "MSI installer: $MSI_PATH"
            echo "Size: $(du -h "$MSI_PATH" | cut -f1)"
        fi
        ;;
esac

echo ""

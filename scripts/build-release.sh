#!/bin/bash
# Full release build for PrivateVoice — deferred dependency installer
#
# No longer builds a PyInstaller sidecar. Instead, bundles:
#   - uv binary (Python package manager)
#   - tts_server/ Python source
#   - requirements.txt
#
# On first launch, the app uses uv to install Python + dependencies
# into the user's app data directory (no admin required).
#
# Supports macOS, Linux, and Windows (Git Bash/MSYS2)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  PrivateVoice Release Build"
echo "  (Deferred Dependency Installer)"
echo "=============================================="
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"

# Detect platform
OS=$(uname -s)
echo "Detected OS: $OS"
echo ""

# Step 1: Download uv binary for this platform
echo "=== Step 1/4: Downloading uv Package Manager ==="
echo ""
bash "$SCRIPT_DIR/download-uv.sh"
echo ""

# Step 2: Copy Python source to resources
echo "=== Step 2/4: Staging Python Source ==="
echo ""

RESOURCES_DIR="src-tauri/resources"
mkdir -p "$RESOURCES_DIR"

# Copy tts_server source
if [ -d "python/tts_server" ]; then
    rm -rf "$RESOURCES_DIR/tts_server"
    cp -r "python/tts_server" "$RESOURCES_DIR/tts_server"
    FILE_COUNT=$(find "$RESOURCES_DIR/tts_server" -type f | wc -l | tr -d ' ')
    echo "Copied tts_server/ ($FILE_COUNT files)"
else
    echo "ERROR: python/tts_server/ not found"
    exit 1
fi

# Copy requirements.txt
if [ -f "python/requirements.txt" ]; then
    cp "python/requirements.txt" "$RESOURCES_DIR/requirements.txt"
    echo "Copied requirements.txt"
else
    echo "ERROR: python/requirements.txt not found"
    exit 1
fi

# Verify staged dependency manifest hash
echo "Verifying dependency hash..."
bash "$SCRIPT_DIR/verify-dependency-hash.sh"
echo ""

echo ""

# Step 3: Install frontend dependencies
echo "=== Step 3/4: Installing Frontend Dependencies ==="
echo ""
pnpm install
echo ""

# Step 4: Build Tauri app
echo "=== Step 4/4: Building Tauri Application ==="
echo ""
# Resources are configured in tauri.conf.json — no extra config needed

case "$OS" in
    Darwin)
        pnpm tauri build
        ;;
    MINGW*|MSYS*|CYGWIN*)
        pnpm tauri build --bundles nsis
        ;;
    Linux)
        pnpm tauri build
        ;;
esac

echo ""
echo "=============================================="
echo "  Build Complete!"
echo "=============================================="
echo ""

# Show resource sizes
UV_SIZE=$(du -h "$RESOURCES_DIR"/uv* 2>/dev/null | head -1 | cut -f1 || echo "?")
SRC_SIZE=$(du -sh "$RESOURCES_DIR/tts_server" 2>/dev/null | cut -f1 || echo "?")
echo "Bundled resources:"
echo "  uv binary:     $UV_SIZE"
echo "  tts_server/:   $SRC_SIZE"
echo "  requirements:  $(wc -l < "$RESOURCES_DIR/requirements.txt") lines"
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
        if [ -n "$NSIS_PATH" ]; then
            echo "NSIS installer: $NSIS_PATH"
            echo "Size: $(du -h "$NSIS_PATH" | cut -f1)"
        fi
        ;;
esac

echo ""
echo "The installer is lightweight (~15-30 MB). On first launch,"
echo "the app will download and install Python + dependencies"
echo "into the user's app data directory."
echo ""

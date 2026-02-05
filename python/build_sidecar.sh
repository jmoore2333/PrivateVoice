#!/bin/bash
# Build the TTS server as a sidecar binary for Tauri
# This script creates a standalone executable using PyInstaller

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/src-tauri"
BINARIES_DIR="$OUTPUT_DIR/binaries"

echo "=== Building TTS Server Sidecar ==="
echo "Script dir: $SCRIPT_DIR"
echo "Project root: $PROJECT_ROOT"
echo "Output dir: $BINARIES_DIR"

cd "$SCRIPT_DIR"

# Create Tauri binaries directory (where externalBin expects sidecars)
mkdir -p "$BINARIES_DIR"

# Check for virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment (cross-platform)
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
else
    echo "Error: Could not find virtual environment activation script"
    exit 1
fi

# Install/upgrade dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build/ dist/

# Run PyInstaller
echo "Running PyInstaller..."
pyinstaller tts_server.spec

# Get the target triple for Tauri sidecar naming
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

# Copy binary to Tauri locations with correct naming
SIDECAR_NAME="tts-server-$TARGET_TRIPLE$EXE_SUFFIX"
BUILT_BINARY="dist/tts-server$EXE_SUFFIX"
echo "Copying binary as $SIDECAR_NAME..."
cp "$BUILT_BINARY" "$BINARIES_DIR/$SIDECAR_NAME"
cp "$BUILT_BINARY" "$OUTPUT_DIR/$SIDECAR_NAME"

# Make executable (no-op on Windows)
if [ -z "$EXE_SUFFIX" ]; then
    chmod +x "$BINARIES_DIR/$SIDECAR_NAME"
fi

echo ""
echo "=== Build Complete ==="
echo "Sidecar binary: $BINARIES_DIR/$SIDECAR_NAME"
echo "Size: $(du -h "$BINARIES_DIR/$SIDECAR_NAME" | cut -f1)"
echo ""
echo "Next steps:"
echo "  1. Test the binary: $BINARIES_DIR/$SIDECAR_NAME"
echo "  2. Build Tauri app: pnpm tauri build"

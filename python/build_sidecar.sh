#!/bin/bash
# Build the TTS server as a sidecar binary for Tauri
# This script creates a standalone executable using PyInstaller

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/src-tauri"

echo "=== Building TTS Server Sidecar ==="
echo "Script dir: $SCRIPT_DIR"
echo "Project root: $PROJECT_ROOT"
echo "Output dir: $OUTPUT_DIR"

cd "$SCRIPT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check for virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

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
# On Apple Silicon: aarch64-apple-darwin
# On Intel Mac: x86_64-apple-darwin
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TARGET_TRIPLE="aarch64-apple-darwin"
else
    TARGET_TRIPLE="x86_64-apple-darwin"
fi

# Copy binary to Tauri binaries directory with correct naming
SIDECAR_NAME="tts-server-$TARGET_TRIPLE"
echo "Copying binary as $SIDECAR_NAME..."
cp dist/tts-server "$OUTPUT_DIR/$SIDECAR_NAME"

# Make executable
chmod +x "$OUTPUT_DIR/$SIDECAR_NAME"

echo ""
echo "=== Build Complete ==="
echo "Sidecar binary: $OUTPUT_DIR/$SIDECAR_NAME"
echo "Size: $(du -h "$OUTPUT_DIR/$SIDECAR_NAME" | cut -f1)"
echo ""
echo "Next steps:"
echo "  1. Test the binary: $OUTPUT_DIR/$SIDECAR_NAME"
echo "  2. Build Tauri app: pnpm tauri build"

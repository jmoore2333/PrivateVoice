#!/usr/bin/env bash
set -euo pipefail

# Download the correct uv binary for the current build platform.
# Places it at src-tauri/resources/uv (or uv.exe on Windows/MSYS).
# Pin a specific version for reproducible builds.

UV_VERSION="0.6.6"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$PROJECT_ROOT/src-tauri/resources"
CHECKSUM_MANIFEST="$SCRIPT_DIR/uv-checksums.txt"

mkdir -p "$RESOURCES_DIR"

# Detect platform and architecture
detect_platform() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Darwin)
            case "$arch" in
                arm64|aarch64) echo "aarch64-apple-darwin" ;;
                x86_64)        echo "x86_64-apple-darwin" ;;
                *) echo "ERROR: Unsupported macOS architecture: $arch" >&2; exit 1 ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64)        echo "x86_64-unknown-linux-gnu" ;;
                aarch64)       echo "aarch64-unknown-linux-gnu" ;;
                *) echo "ERROR: Unsupported Linux architecture: $arch" >&2; exit 1 ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "x86_64-pc-windows-msvc"
            ;;
        *)
            echo "ERROR: Unsupported OS: $os" >&2
            exit 1
            ;;
    esac
}

PLATFORM=$(detect_platform)
echo "==> Detected platform: $PLATFORM"
echo "==> Downloading uv $UV_VERSION for $PLATFORM..."

# Determine filename and extension
if [[ "$PLATFORM" == *"windows"* ]]; then
    ARCHIVE_NAME="uv-$PLATFORM.zip"
    UV_BINARY="uv.exe"
else
    ARCHIVE_NAME="uv-$PLATFORM.tar.gz"
    UV_BINARY="uv"
fi

DOWNLOAD_URL="https://github.com/astral-sh/uv/releases/download/$UV_VERSION/$ARCHIVE_NAME"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "==> Download URL: $DOWNLOAD_URL"

# Download with retries
for attempt in 1 2 3 4; do
    if curl -fSL --retry 3 --retry-delay 2 -o "$TEMP_DIR/$ARCHIVE_NAME" "$DOWNLOAD_URL"; then
        echo "==> Download successful"
        break
    fi
    if [ "$attempt" -eq 4 ]; then
        echo "ERROR: Failed to download uv after 4 attempts" >&2
        exit 1
    fi
    delay=$((2 ** attempt))
    echo "==> Retry $attempt, waiting ${delay}s..."
    sleep "$delay"
done

# Verify archive checksum before extraction
if [ ! -f "$CHECKSUM_MANIFEST" ]; then
    echo "ERROR: Checksum manifest not found: $CHECKSUM_MANIFEST" >&2
    exit 1
fi

EXPECTED_SHA256=$(awk -v version="$UV_VERSION" -v archive="$ARCHIVE_NAME" '
    $1 == version && $2 == archive { print $3; exit }
' "$CHECKSUM_MANIFEST")

if [ -z "$EXPECTED_SHA256" ]; then
    echo "ERROR: No checksum entry for uv $UV_VERSION archive $ARCHIVE_NAME in $CHECKSUM_MANIFEST" >&2
    exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(sha256sum "$TEMP_DIR/$ARCHIVE_NAME" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(shasum -a 256 "$TEMP_DIR/$ARCHIVE_NAME" | awk '{print $1}')
else
    echo "ERROR: No SHA-256 tool found (expected sha256sum or shasum)" >&2
    exit 1
fi

if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "ERROR: Checksum mismatch for $ARCHIVE_NAME" >&2
    echo "Expected: $EXPECTED_SHA256" >&2
    echo "Actual:   $ACTUAL_SHA256" >&2
    exit 1
fi
echo "==> Checksum verified ($ACTUAL_SHA256)"

# Extract
echo "==> Extracting..."
if [[ "$ARCHIVE_NAME" == *.tar.gz ]]; then
    tar -xzf "$TEMP_DIR/$ARCHIVE_NAME" -C "$TEMP_DIR"
    # uv archives extract to uv-<platform>/uv
    EXTRACTED_UV=$(find "$TEMP_DIR" -name "uv" -type f ! -name "*.tar.gz" | head -1)
else
    unzip -o "$TEMP_DIR/$ARCHIVE_NAME" -d "$TEMP_DIR"
    EXTRACTED_UV=$(find "$TEMP_DIR" -name "uv.exe" -type f | head -1)
fi

if [ -z "$EXTRACTED_UV" ]; then
    echo "ERROR: Could not find uv binary in extracted archive" >&2
    exit 1
fi

# Copy to resources
cp "$EXTRACTED_UV" "$RESOURCES_DIR/$UV_BINARY"
chmod +x "$RESOURCES_DIR/$UV_BINARY"

# Verify
echo "==> Verifying uv binary..."
"$RESOURCES_DIR/$UV_BINARY" --version

echo "==> uv $UV_VERSION installed to $RESOURCES_DIR/$UV_BINARY"
echo "==> Size: $(du -h "$RESOURCES_DIR/$UV_BINARY" | cut -f1)"

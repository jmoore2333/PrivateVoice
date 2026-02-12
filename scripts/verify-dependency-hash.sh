#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

SOURCE_REQ="$PROJECT_ROOT/python/requirements.txt"
EXPECTED_HASH_FILE="$PROJECT_ROOT/python/requirements.sha256"
STAGED_REQ="$PROJECT_ROOT/src-tauri/resources/requirements.txt"

if [[ ! -f "$SOURCE_REQ" ]]; then
  echo "ERROR: Missing $SOURCE_REQ"
  exit 1
fi

if [[ ! -f "$EXPECTED_HASH_FILE" ]]; then
  echo "ERROR: Missing $EXPECTED_HASH_FILE"
  echo "Run: ./scripts/update-requirements-hash.sh"
  exit 1
fi

if [[ ! -f "$STAGED_REQ" ]]; then
  echo "ERROR: Missing staged requirements at $STAGED_REQ"
  echo "Run the resource staging step first."
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  SOURCE_HASH="$(shasum -a 256 "$SOURCE_REQ" | awk '{print $1}')"
  STAGED_HASH="$(shasum -a 256 "$STAGED_REQ" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  SOURCE_HASH="$(sha256sum "$SOURCE_REQ" | awk '{print $1}')"
  STAGED_HASH="$(sha256sum "$STAGED_REQ" | awk '{print $1}')"
else
  echo "ERROR: sha256 tool not found (requires shasum or sha256sum)"
  exit 1
fi

EXPECTED_HASH="$(awk '{
  for (i = 1; i <= NF; i++) {
    if ($i ~ /^[0-9a-fA-F]{64}$/) {
      print tolower($i);
      exit
    }
  }
}' "$EXPECTED_HASH_FILE")"

if [[ -z "$EXPECTED_HASH" ]]; then
  echo "ERROR: $EXPECTED_HASH_FILE does not contain a valid SHA-256 hash"
  exit 1
fi

if [[ "$SOURCE_HASH" != "$EXPECTED_HASH" ]]; then
  echo "ERROR: python/requirements.txt hash mismatch"
  echo "Expected: $EXPECTED_HASH"
  echo "Actual:   $SOURCE_HASH"
  echo "Run: ./scripts/update-requirements-hash.sh"
  exit 1
fi

if [[ "$STAGED_HASH" != "$SOURCE_HASH" ]]; then
  echo "ERROR: staged requirements hash mismatch"
  echo "Source: $SOURCE_HASH"
  echo "Staged: $STAGED_HASH"
  echo "Re-run staging: ./scripts/build-release.sh"
  exit 1
fi

echo "Dependency hash check passed: $SOURCE_HASH"

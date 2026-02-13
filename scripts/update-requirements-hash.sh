#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

REQ_FILE="$PROJECT_ROOT/python/requirements.txt"
HASH_FILE="$PROJECT_ROOT/python/requirements.sha256"

if [[ ! -f "$REQ_FILE" ]]; then
  echo "ERROR: Missing $REQ_FILE"
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  HASH="$(shasum -a 256 "$REQ_FILE" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  HASH="$(sha256sum "$REQ_FILE" | awk '{print $1}')"
else
  echo "ERROR: sha256 tool not found (requires shasum or sha256sum)"
  exit 1
fi

echo "$HASH" > "$HASH_FILE"
echo "Updated $HASH_FILE"
echo "requirements.txt sha256: $HASH"

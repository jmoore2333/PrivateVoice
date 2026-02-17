#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

MANIFESTS=(
  "requirements.txt"
  "requirements.lock.txt"
  "requirements.base.txt"
  "requirements.base.lock.txt"
  "requirements.qwen.txt"
  "requirements.qwen.lock.txt"
  "requirements.chatterbox.txt"
  "requirements.chatterbox.lock.txt"
)

HASH_FILE="$PROJECT_ROOT/python/requirements.sha256"

if command -v shasum >/dev/null 2>&1; then
  hash_file() {
    local file="$1"
    tr -d '\r' < "$file" | shasum -a 256 | awk '{print $1}'
  }
elif command -v sha256sum >/dev/null 2>&1; then
  hash_file() {
    local file="$1"
    tr -d '\r' < "$file" | sha256sum | awk '{print $1}'
  }
else
  echo "ERROR: sha256 tool not found (requires shasum or sha256sum)"
  exit 1
fi

tmp_file="$(mktemp)"
{
  echo "# filename sha256 (CRLF-normalized)"
  for manifest in "${MANIFESTS[@]}"; do
    path="$PROJECT_ROOT/python/$manifest"
    if [[ ! -f "$path" ]]; then
      echo "ERROR: Missing $path" >&2
      rm -f "$tmp_file"
      exit 1
    fi
    hash="$(hash_file "$path")"
    printf "%s %s\n" "$manifest" "$hash"
  done
} > "$tmp_file"

mv "$tmp_file" "$HASH_FILE"
echo "Updated $HASH_FILE"
echo "Manifest hashes:"
cat "$HASH_FILE"

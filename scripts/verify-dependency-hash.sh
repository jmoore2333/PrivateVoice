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

EXPECTED_HASH_FILE="$PROJECT_ROOT/python/requirements.sha256"

if [[ ! -f "$EXPECTED_HASH_FILE" ]]; then
  echo "ERROR: Missing $EXPECTED_HASH_FILE"
  echo "Run: ./scripts/update-requirements-hash.sh"
  exit 1
fi

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

get_expected_hash() {
  local manifest="$1"
  awk -v target="$manifest" '
    $0 !~ /^[[:space:]]*#/ && $1 == target {
      print tolower($2);
      exit
    }
  ' "$EXPECTED_HASH_FILE"
}

for manifest in "${MANIFESTS[@]}"; do
  source_file="$PROJECT_ROOT/python/$manifest"
  staged_file="$PROJECT_ROOT/src-tauri/resources/$manifest"

  if [[ ! -f "$source_file" ]]; then
    echo "ERROR: Missing $source_file"
    exit 1
  fi
  if [[ ! -f "$staged_file" ]]; then
    echo "ERROR: Missing staged manifest at $staged_file"
    echo "Run the resource staging step first."
    exit 1
  fi

  expected_hash="$(get_expected_hash "$manifest")"
  if [[ -z "$expected_hash" ]]; then
    echo "ERROR: No expected hash found for $manifest in $EXPECTED_HASH_FILE"
    exit 1
  fi

  source_hash="$(hash_file "$source_file")"
  staged_hash="$(hash_file "$staged_file")"

  if [[ "$source_hash" != "$expected_hash" ]]; then
    echo "ERROR: python/$manifest hash mismatch"
    echo "Expected: $expected_hash"
    echo "Actual:   $source_hash"
    echo "Run: ./scripts/update-requirements-hash.sh"
    exit 1
  fi

  if [[ "$staged_hash" != "$source_hash" ]]; then
    echo "ERROR: staged $manifest hash mismatch"
    echo "Source: $source_hash"
    echo "Staged: $staged_hash"
    echo "Re-run staging: ./scripts/build-release.sh"
    exit 1
  fi
done

echo "Dependency hash check passed for all manifests."

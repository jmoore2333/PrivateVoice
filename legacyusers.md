# Legacy User Cleanup Guide

This guide is for users who installed PrivateVoice before runtime/model caches were fully scoped under app-managed storage.

Goal: remove leftover legacy files (especially old Hugging Face cache data) and keep only current app-managed data.

Important: old Hugging Face cache folders can be shared with other ML apps. Only delete legacy cache paths if you are sure no other app needs them.

## Windows

### 1. Close PrivateVoice

- Exit the app completely before cleanup.

### 2. Check current app-managed locations

Current installs use these locations:

- `%APPDATA%\\com.privatevoice.desktop\\`
- `%LOCALAPPDATA%\\com.privatevoice.desktop\\`

In PowerShell:

```powershell
$paths = @(
  "$env:APPDATA\\com.privatevoice.desktop",
  "$env:LOCALAPPDATA\\com.privatevoice.desktop"
)
$paths | ForEach-Object {
  Write-Host "`n$_"
  if (Test-Path $_) {
    Get-ChildItem $_ -Force | Select-Object Name, Length
  } else {
    Write-Host "(missing)"
  }
}
```

### 3. Check legacy cache location

Legacy Hugging Face cache may exist here:

- `$env:USERPROFILE\\.cache\\huggingface\\`

Size check:

```powershell
$legacy = "$env:USERPROFILE\\.cache\\huggingface"
if (Test-Path $legacy) {
  $bytes = (Get-ChildItem $legacy -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  "Legacy cache size (GB): {0:N2}" -f ($bytes / 1GB)
} else {
  "Legacy cache not found"
}
```

### 4. Remove legacy cache (optional)

Only run this if no other app depends on that cache:

```powershell
$legacy = "$env:USERPROFILE\\.cache\\huggingface"
if (Test-Path $legacy) {
  Remove-Item $legacy -Recurse -Force
  "Removed: $legacy"
} else {
  "Nothing to remove"
}
```

### 5. Full reset (optional)

This removes all PrivateVoice data and forces redownload/re-setup on next launch:

```powershell
$targets = @(
  "$env:APPDATA\\com.privatevoice.desktop",
  "$env:LOCALAPPDATA\\com.privatevoice.desktop"
)
$targets | ForEach-Object {
  if (Test-Path $_) {
    Remove-Item $_ -Recurse -Force
    "Removed: $_"
  }
}
```

### 6. Verify

- Launch PrivateVoice.
- Confirm app recreates `%APPDATA%\\com.privatevoice.desktop\\`.
- Confirm models download into app-managed storage (not `~\\.cache\\huggingface`).

## macOS

### 1. Close PrivateVoice

- Quit the app fully.

### 2. Check current app-managed location

- `~/Library/Application Support/com.privatevoice.desktop/`

```bash
ls -la ~/Library/Application\ Support/com.privatevoice.desktop 2>/dev/null || echo "(missing)"
```

### 3. Check legacy cache location

- `~/.cache/huggingface/`

```bash
du -sh ~/.cache/huggingface 2>/dev/null || echo "Legacy cache not found"
```

### 4. Remove legacy cache (optional)

Only if no other app uses it:

```bash
rm -rf ~/.cache/huggingface
```

### 5. Full reset (optional)

```bash
rm -rf ~/Library/Application\ Support/com.privatevoice.desktop
```

### 6. Verify

- Launch PrivateVoice.
- Confirm app data folder is recreated.
- Confirm new model downloads are app-scoped.

## Linux

### 1. Close PrivateVoice

- Exit AppImage/package instance fully.

### 2. Check current app-managed location

- `~/.local/share/com.privatevoice.desktop/`

```bash
ls -la ~/.local/share/com.privatevoice.desktop 2>/dev/null || echo "(missing)"
```

### 3. Check legacy cache location

- `~/.cache/huggingface/`

```bash
du -sh ~/.cache/huggingface 2>/dev/null || echo "Legacy cache not found"
```

### 4. Remove legacy cache (optional)

Only if no other app uses it:

```bash
rm -rf ~/.cache/huggingface
```

### 5. Full reset (optional)

```bash
rm -rf ~/.local/share/com.privatevoice.desktop
```

### 6. Verify

- Launch PrivateVoice.
- Confirm app data folder is recreated.
- Confirm model files are under app-managed storage.

## Notes for Support / Troubleshooting

- If users report disk usage unexpectedly high after update, first check legacy HF cache (`.cache/huggingface`) and current app data side by side.
- If users rely on other local AI tools, do not remove shared legacy cache unless they confirm it is safe.
- After a full reset, first startup can take longer due to Python environment rebuild and model redownload.

# Cross-Platform Build Status & Tracking

Last updated: 2025-02-11 (commit context: after `dc51378` --onedir architecture)

## Platform Status

| Platform | Status | Installer | Sidecar Mode | GPU |
|----------|--------|-----------|-------------|-----|
| macOS (Apple Silicon) | **Production-ready** | DMG (`externalBin`) | `--onefile` | MPS |
| Windows 11 x64 | **In Progress** | NSIS (`resources`) | `--onedir` | CPU-only (CUDA deferred) |
| Linux | Not started | — | `--onedir` (planned) | — |

---

## Changes from macOS Baseline

The following changes were made on the `main` branch during Windows bring-up. All are backward-compatible with the macOS build.

### 1. `python/tts_server.spec` — Reduced torch excludes

**Commits**: `dc51378`, current session

The macOS build excluded several torch submodules for size savings:
```python
# Previously excluded (macOS baseline):
'torch._dynamo', 'torch._inductor', 'torch.compiler', 'torch.distributed',
'torch.testing', 'torch.profiler', 'torch.onnx', 'triton'
```

On Windows, `torch.utils.data.dataloader` imports `torch.distributed`, and `torch.autograd.gradcheck` imports `torch.testing`. These deep cross-imports mean most torch submodules **cannot** be safely excluded.

**Current excludes** (all platforms):
```python
'torch.utils.tensorboard',  # Requires external tensorboard package
'triton',                    # Linux-only compiler, not needed at runtime
```

**Impact on macOS**: Sidecar binary will be slightly larger (~10-20 MB). No functional change — these modules were unused but not harmful to include.

### 2. `src-tauri/tauri.conf.json` — NSIS per-user install config

**Current session only**

Added Windows NSIS configuration for per-user install (no admin required):
```json
"bundle": {
  "windows": {
    "nsis": {
      "installMode": "currentUser"
    }
  }
}
```

**Impact on macOS**: None. This config section is only used by the NSIS bundler on Windows.

### 3. `scripts/build-release.ps1` — New Windows build script

**Current session**

PowerShell equivalent of `scripts/build-release.sh` with Windows-specific lessons learned:
- Auto-detects Python from common install locations
- Handles CUDA/CPU torch installation ordering (torch installed AFTER `requirements.txt` to avoid PyPI overwriting CUDA variant)
- Writes resources config to temp file (PowerShell strips quotes from inline JSON)
- Uses nested `Join-Path` calls (PS 5.1 only accepts 2 arguments)
- Size warnings for NSIS (>1.5 GB) and both bundlers (>3 GB)

**Impact on macOS**: None. PowerShell script is Windows-only.

### 4. Architecture changes (from commit `dc51378`)

These were already documented in `start-here.md` but are noted here for completeness:
- `src-tauri/src/lib.rs` — `SidecarProcess` enum, 3 spawn paths (dev / macOS-release / Windows-release)
- `src-tauri/tauri.macos.conf.json` — macOS-specific `externalBin` config (split from base)
- `python/build_sidecar.sh` / `python/build_sidecar.ps1` — OS-aware sidecar copy
- `.gitignore` — Added `src-tauri/sidecar/`

---

## Current Windows Issues

### Issue 1: Log flooding in startup console (ACTIVE)

**Symptom**: After install and launch, the startup console floods with repeated `/logs?count=200` and `/system-info` GET requests, multiple times per second. The server IS running (responds 200 OK) but the frontend appears stuck in a rapid polling loop.

**Likely cause**: The frontend's startup detection or log polling interval is too aggressive, or the "server ready" signal isn't being recognized properly, keeping the app in startup mode indefinitely.

**Where to investigate**:
- `src/lib/stores/serverStatus.svelte.ts` — Server health check / startup detection
- `src/lib/api/ttsClient.ts` — Log polling endpoint and interval
- `src-tauri/src/lib.rs` — `sidecar-startup` event emission in Windows release path
- The sidecar may not be emitting the expected startup-complete message that the frontend watches for

### Issue 2: CUDA sidecar too large for installers (DEFERRED)

**Symptom**: CUDA torch (cu124) produces a 4.08 GB sidecar with 5,600+ files. Both NSIS (~2 GB PE limit) and WiX/MSI (~2 GB embedded CAB limit) fail.

**Current workaround**: Ship CPU-only installer (241.7 MB NSIS). CPU inference works but is slower.

**Long-term solution**: See `docs/plans/deferred-dependency-install.md` — ship a ~50-60 MB installer with `uv` + Python source, download PyTorch (CUDA or CPU) on first launch. This matches industry practice (LM Studio, Ollama, ComfyUI all download GPU runtimes at install/first-launch time).

**Interim options** (if needed before deferred-install is ready):
- Portable `.7z` distribution for CUDA users (no installer, extract and run)
- InnoSetup with disk spanning (not integrated with Tauri)

### Issue 3: `requirements.txt` overwrites CUDA torch (RESOLVED)

**Symptom**: `pip install -r requirements.txt` with `torch>=2.1.0` pulls CPU-only torch from PyPI, replacing a previously installed CUDA variant.

**Fix**: In `scripts/build-release.ps1`, torch is installed AFTER `requirements.txt` so the correct variant always wins. The `-CudaVersion cu124` or `-CpuOnly` flag force-reinstalls from the correct index as the final step.

---

## Build Quick Reference (Windows)

```powershell
# CPU-only build (recommended for initial testing)
.\scripts\build-release.ps1 -CpuOnly

# CUDA build (produces >2 GB sidecar — no working installer yet)
.\scripts\build-release.ps1 -CudaVersion cu124

# Skip sidecar rebuild (use existing)
.\scripts\build-release.ps1 -CpuOnly -SkipSidecar

# Use MSI instead of NSIS (admin required, no install mode choice)
.\scripts\build-release.ps1 -CpuOnly -Bundle msi
```

Output: `src-tauri\target\release\bundle\nsis\PrivateVoice_1.0.0_x64-setup.exe`

---

## File Map

| File | Role | Changed from macOS baseline? |
|------|------|------------------------------|
| `python/tts_server.spec` | PyInstaller spec | Yes — reduced excludes, platform-conditional --onefile/--onedir |
| `src-tauri/tauri.conf.json` | Base Tauri config | Yes — added NSIS installMode, removed externalBin |
| `src-tauri/tauri.macos.conf.json` | macOS override | New — holds externalBin (split from base) |
| `src-tauri/src/lib.rs` | Sidecar lifecycle | Yes — SidecarProcess enum, 3 spawn paths |
| `scripts/build-release.ps1` | Windows build script | New |
| `scripts/build-release.sh` | Cross-platform build script | Yes — platform-aware verification, --config injection |
| `python/build_sidecar.sh` | Sidecar build (bash) | Yes — OS-aware copy |
| `python/build_sidecar.ps1` | Sidecar build (PS) | Yes — directory copy |
| `.gitignore` | Git ignores | Yes — added src-tauri/sidecar/ |
| `docs/plans/deferred-dependency-install.md` | Long-term bundling plan | New |
| `docs/crossplatform.md` | This file | New |

# Cross-Platform Build Status & Tracking

Last updated: 2026-02-11 (branch: `claude/fix-crossplatform-setup-AAIjb`)

## Architecture: Deferred Dependency Installer

The app ships a **lightweight stub installer** (~14 MB) containing:
- Tauri app binary
- `uv` binary (Astral's fast Python package manager)
- Python source code (`tts_server/`)
- `requirements.txt`

On **first launch**, the app detects GPU hardware, downloads Python 3.11 via `uv`, creates a virtual environment, and installs all dependencies with GPU-appropriate PyTorch wheels. Subsequent launches validate a `.setup-complete` marker in ~10ms and skip setup entirely.

**Single code path** for all platforms in `lib.rs`. No `#[cfg(target_os)]` branching in the launch logic except `CREATE_NO_WINDOW` on Windows. `tauri-plugin-shell` has been fully removed.

---

## Platform Status

| Platform | Status | Installer | GPU | Tested |
|----------|--------|-----------|-----|--------|
| Windows 11 x64 | **Working** | NSIS (~14 MB) | CUDA (RTX 3090 validated) | 2026-02-11 |
| macOS (Apple Silicon) | Untested on new arch | DMG | MPS | Pending |
| Linux x64 | Not started | .deb / .AppImage | CUDA / ROCm / XPU | Pending |

---

## Windows Testing Results (2026-02-11)

### Environment
- Windows 11 Pro (10.0.26200), x64
- NVIDIA GeForce RTX 3090 (compute capability 8.6)
- CUDA 12.4 detected via `nvidia-smi`

### What Works
- **NSIS installer**: ~14 MB, per-user install (`currentUser`), no admin required
- **First-run setup**: GPU detection → Python 3.11 install → venv → CUDA 12.4 dependencies (~5.3 GB env). Completes in ~2-5 minutes depending on network.
- **Second-run fast path**: Marker validated in milliseconds, server starts in ~5 seconds
- **Re-setup after uninstall**: 6 seconds with cached packages (uv cache persists across installs)
- **Model loading**: 0.6b CustomVoice model loads on CUDA with SDPA attention
- **Voice generation**: Voice Design mode produces valid audio output
- **Server health**: Python FastAPI server starts, responds to all endpoints

### Issues Found and Fixed

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | `uv binary not found` after install | `resource_dir()` returns install root; Tauri preserves `resources/` subdirectory from glob patterns | Added `bundled_resources_dir()` helper in `paths.rs` |
| 2 | Wrong `python.exe` found during venv creation | Recursive `walkdir` found `Lib/venv/scripts/nt/python.exe` (stdlib template) before real interpreter | Replaced with targeted `cpython-*` directory lookup in `setup.rs` |
| 3 | Frontend stuck on LoadingScreen | `isStartupComplete` only accepted `"ready"` phase, but Tauri event reliably fires `"checking-models"` before HTTP polling completes | `isStartupComplete` now accepts both `"ready"` and `"checking-models"` |
| 4 | Uvicorn startup not detected | `process_stderr_line()` in `lib.rs` didn't do phase detection — only `process_stdout_line()` did, but uvicorn outputs to stderr | Added phase detection to `process_stderr_line()` |
| 5 | `OPTIONS /load-model` returns 400 | CORS preflight rejected — WebView Origin didn't match explicit allow list | Changed to `allow_origins=["*"]` (safe: server is localhost-only) |
| 6 | FlashAttention2 error on model load | `device.py` unconditionally set `flash_attention_2` for Ampere+ GPUs, but `flash_attn` package not installed | Added runtime `import flash_attn` check, falls back to SDPA |
| 7 | Noisy error tracebacks in logs | Python logging `StreamHandler.emit()` fails with `OSError: [Errno 22]` when writing from background threads on Windows piped streams | `logging.raiseExceptions = False` in production |

### Remaining Non-Critical Items

| Item | Status | Notes |
|------|--------|-------|
| SoX "not found" stderr messages | Cosmetic | `sox` Python package checks for SoX binary at import time. Not needed for core TTS. |
| HuggingFace symlink warning | Cosmetic | Windows requires Developer Mode for symlinks. Downloads work, just use more disk space. |
| `flash-attn not installed` warning | Cosmetic | Appears at import time from `qwen-tts` internals. Suppressed via `warnings.filterwarnings`. |

---

## GPU Optimization: Deferred Package Installation

Since the deferred installer runs `uv pip install` at first launch, we can dynamically source GPU-specific optimization packages based on detected hardware. This is a key advantage over the old PyInstaller approach.

### Current GPU Support

| GPU Vendor | Detection Method | PyTorch Backend | Attention | Status |
|------------|-----------------|-----------------|-----------|--------|
| NVIDIA (Ampere+, compute ≥8.0) | `nvidia-smi` | CUDA 12.4 | SDPA (flash_attn if available) | **Working** |
| NVIDIA (older, compute <8.0) | `nvidia-smi` | CUDA 12.4 | SDPA | Untested |
| AMD (Linux only) | `rocm-smi` / `lspci` | ROCm | SDPA | Untested |
| Intel (Arc/Xe) | `xpu-smi` / `sycl-ls` | Intel XPU | SDPA | Untested |
| Apple Silicon | platform detection | MPS | SDPA | Untested on new arch |
| CPU-only | Fallback | CPU | Eager | Untested on new arch |

### Planned: GPU-Specific Acceleration Packages

The stub installer approach opens the door to installing optimal acceleration packages at setup time. These packages require specific builds per GPU architecture and cannot be bundled universally.

**NVIDIA — flash_attn**
- `flash_attn` provides FlashAttention2, significantly faster for long sequences on Ampere+ GPUs
- Requires pre-built wheels matching the CUDA version and compute capability
- Can be installed via: `uv pip install flash-attn --no-build-isolation`
- Or from pre-built wheels: `pip install flash-attn` (if wheels exist for the CUDA/Python combo)
- **Action**: During setup, after detecting NVIDIA GPU with compute ≥8.0, attempt `flash_attn` install. If it fails (no wheel available), fall back gracefully to SDPA.

**NVIDIA — xformers**
- Alternative to flash_attn with broader GPU support
- `pip install xformers` — has pre-built wheels for common CUDA versions
- Provides `memory_efficient_attention` and other optimizations

**AMD — ROCm torch**
- Already handled: `--extra-index-url https://download.pytorch.org/whl/rocm6.2`
- ROCm wheels are Linux-only

**Intel — XPU torch**
- Already handled: `--extra-index-url https://pytorch-extension.intel.com/release-whl/stable/xpu/us/`
- Intel Extension for PyTorch provides XPU acceleration

**CPU — Intel MKL / OpenBLAS**
- Default PyTorch CPU includes Intel MKL on x86_64
- Consider: `intel-extension-for-pytorch` for additional CPU optimizations on Intel processors

### Implementation Notes

The setup flow in `setup.rs` → `install_dependencies()` is the right place to add GPU-specific packages. After the base `requirements.txt` install succeeds:

```
1. Base install: uv pip install -r requirements.txt [+ torch index URL]
2. GPU extras (NEW): attempt flash_attn/xformers install based on detected GPU
3. Verify: import torch; check GPU availability
4. Write marker
```

Step 2 should be best-effort — if extra packages fail to install, the app still works with SDPA attention. The marker should record what was installed so the Settings panel can show optimization status.

---

## Build Quick Reference

### Windows (PowerShell)

```powershell
# Ensure resources are staged
.\scripts\download-uv.ps1
Copy-Item -Recurse python\tts_server src-tauri\resources\tts_server -Force
Copy-Item python\requirements.txt src-tauri\resources\requirements.txt -Force

# Build NSIS installer
pnpm tauri build
# Output: src-tauri\target\release\bundle\nsis\PrivateVoice_1.0.0_x64-setup.exe
```

### macOS / Linux (bash)

```bash
./scripts/build-release.sh
# Output: src-tauri/target/release/bundle/{dmg,deb,appimage}/...
```

---

## Key Files

| File | Role |
|------|------|
| `src-tauri/src/env_manager/` | Rust: GPU detection, setup orchestration, validation |
| `src-tauri/src/lib.rs` | Rust: sidecar lifecycle, Tauri commands |
| `python/tts_server/device.py` | Python: runtime GPU/dtype/attention config |
| `python/tts_server/main.py` | Python: FastAPI server, CORS, startup phases |
| `scripts/download-uv.ps1` / `.sh` | Download platform-specific uv binary |
| `scripts/build-release.ps1` / `.sh` | Full release build scripts |
| `src-tauri/resources/` | Staged build resources (gitignored except .gitkeep) |
| `agent-handover-deferred-installer.md` | Full architecture handover document |

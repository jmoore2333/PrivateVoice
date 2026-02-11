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
| Windows 11 x64 | **Working** | NSIS (~13 MB) | CUDA (RTX 3090) | 2026-02-11 |
| macOS (Apple Silicon) | Untested on new arch | DMG | MPS | Pending |
| Linux x64 (Ubuntu) | **Next** | .deb / .AppImage | CUDA / ROCm / XPU | Planned |

---

## Windows Testing Results (2026-02-11)

### Environment
- Windows 11 Pro (10.0.26200), x64
- NVIDIA GeForce RTX 3090 (compute capability 8.6)
- CUDA 12.4 detected via `nvidia-smi`

### What Works
- **NSIS installer**: ~13 MB, per-user install (`currentUser`), no admin required
- **First-run setup**: GPU detection → Python 3.11 install → venv → CUDA 12.4 dependencies (~5.3 GB env). Completes in ~2-5 minutes depending on network.
- **Second-run fast path**: Marker validated in milliseconds, server starts in ~5 seconds
- **Re-setup after uninstall**: 6 seconds with cached packages (uv cache persists across installs)
- **Model loading**: 0.6b CustomVoice model loads on CUDA with SDPA attention
- **Custom Voice generation**: Produces valid audio output
- **Voice Design generation**: Produces valid audio output
- **Microphone recording**: Auto-granted via WebView2 COM API (no browser permission prompt)
- **Auto-transcription**: Whisper model loads and transcribes reference audio
- **Model switching**: Mode tabs detect compatibility, banner auto-clears after load
- **Server health**: Python FastAPI server starts, responds to all endpoints
- **Voice Clone generation**: Produces valid audio output (1.7B Base model)
- **Debug panel**: Full server logs visible in-app
- **Clean reinstall**: Full setup completes after "remove all application data" uninstall

### Issues Found and Fixed

| # | Issue | Root Cause | Fix | Commit |
|---|-------|------------|-----|--------|
| 1 | `uv binary not found` after install | `resource_dir()` returns install root; Tauri preserves `resources/` subdirectory | Added `bundled_resources_dir()` helper in `paths.rs` | `ae99aed` |
| 2 | Wrong `python.exe` found during venv creation | Recursive `walkdir` found stdlib template before real interpreter | Targeted `cpython-*` directory lookup in `setup.rs` | `ae99aed` |
| 3 | Frontend stuck on LoadingScreen | `isStartupComplete` only accepted `"ready"` phase | Accepts both `"ready"` and `"checking-models"` | `ae99aed` |
| 4 | Uvicorn startup not detected | `process_stderr_line()` didn't do phase detection | Added phase detection to `process_stderr_line()` | `a5f9a4c` |
| 5 | `OPTIONS /load-model` returns 400 | CORS preflight rejected — WebView origin mismatch | Changed to `allow_origins=["*"]` (localhost-only server) | `a5f9a4c` |
| 6 | FlashAttention2 error on model load | `device.py` unconditionally set `flash_attention_2` | Added runtime `import flash_attn` check, falls back to SDPA | `a5f9a4c` |
| 7 | Noisy error tracebacks in logs | `StreamHandler.emit()` fails with `OSError` on piped streams | `logging.raiseExceptions = False` in production | `a5f9a4c` |
| 8 | Model-switch banner persists | `modelSwitchPrompt` only cleared by banner's own buttons | Added `$effect` + template guard `!modelSupportsMode(...)` | `06e6062` |
| 9 | Mic permission denied permanently | WebView2 caches denial, `PermissionRequested` stops firing | Auto-grant mic/camera via WebView2 COM API in `setup()` hook | `373752d` |
| 10 | Cached mic denial survives reinstall | WebView2 Preferences file persists across installs | Startup cleanup clears cached denials + `reset_mic_permissions` command | `60db0e9` |
| 11 | Voice clone WebM format mismatch | MediaRecorder records `audio/webm`, model expects WAV | Client-side WebM-to-WAV conversion via Web Audio API | `93093ec` |
| 12 | Voice clone `[Errno 22]` from temp files | Windows `NamedTemporaryFile` file handle locking | In-memory audio loading via `soundfile.read(BytesIO(...))` | `35e5b2e` |
| 13 | Voice clone `[Errno 22]` from print() | qwen_tts `mel_spectrogram()` uses bare `print()` to piped stdout | `SafeWriter` wrapper on `sys.stdout/stderr` catches `OSError` | `ad4c6f2` |
| 14 | HuggingFace symlink warnings | Windows requires Developer Mode for symlinks | `HF_HUB_DISABLE_SYMLINKS_WARNING=1` env var | `35e5b2e` |
| 15 | Voice clone blocked event loop | `async def` endpoint called sync inference directly | `asyncio.to_thread()` + traceback in error detail | (this commit) |
| 16 | Clean install fails (`uv python install` exit 2) | `python_env/python/` dir not pre-created on clean install | `create_dir_all(&python_dir)` before `uv python install` | (this commit) |

### Remaining Non-Critical Items

| Item | Status | Notes |
|------|--------|-------|
| SoX "not found" stderr messages | Cosmetic | `sox` Python package checks for SoX binary at import time. Not needed for core TTS. |

---

## Linux Build Plan (Ubuntu)

### Prerequisites
- Ubuntu 22.04+ (or equivalent)
- Rust toolchain (`rustup`)
- Node.js + pnpm
- System libraries for Tauri: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, etc.
- GPU drivers (NVIDIA CUDA, AMD ROCm, or CPU-only)

### Expected Work
1. **Build script**: `scripts/build-release.sh` — adapt from Windows `.ps1` (stage resources, build Tauri)
2. **Bundle format**: `.deb` and/or `.AppImage`
3. **GPU detection**: `env_manager/gpu.rs` already handles `nvidia-smi`, `rocm-smi`, `lspci` for Linux
4. **Python venv**: `uv` supports Linux natively; venv path uses `python_env_dir()` which respects `app_data_dir()`
5. **No `CREATE_NO_WINDOW`**: The `#[cfg(target_os = "windows")]` guard already skips it on Linux
6. **No WebView2 issues**: Linux uses WebKitGTK, not WebView2 — no mic permission caching problems
7. **No SafeWriter needed**: POSIX pipes handle `SIGPIPE` gracefully (already have `signal.signal(SIGPIPE, SIG_IGN)`)

### Potential Linux-Specific Issues
- WebKitGTK mic permissions may need `gstreamer` plugins
- `.deb` package might need to declare system dependencies
- ROCm PyTorch wheels are Linux-only (good — this is where they'll be tested)
- AppImage sandboxing may affect `uv` binary execution

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

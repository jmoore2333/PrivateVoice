# Start Here: Windows Desktop Build

## Context

This is the continuation of the PrivateVoice v1.0 cross-platform effort. The macOS build is complete and shipping. The goal now is to get a working Windows build, starting on a Windows 11 desktop with WSL 2.

## Current State

- **macOS**: Production-ready. All 13 GAP_ANALYSIS items resolved, Save-to-Library fixed, 216 unit + 78 backend + 90 E2E tests passing.
- **Branch**: `claude/cross-platform-build-setup-Yd9FO` — contains two research handover docs and this file.
- **Main branch**: Up to date with all v1.0 fixes (commits through `6d0eccf`).

## Handover Documents

Read these first:

1. **`agent-handover-windows.md`** — Complete Windows 11 build guide, code changes, known issues, PowerShell scripts
2. **`agent-handover-linux.md`** — Linux guide (relevant because WSL 2 is Ubuntu-based)

## What Needs to Happen

### Phase 1: Code Fixes (apply to main, all platforms benefit)

These are small, backward-compatible changes. Do them first:

1. **Guard `signal.SIGPIPE`** — crashes on Windows at import time
   - `python/tts_server/inference.py` line 17
   - `python/tts_server/main.py` line 12
   - Fix: `if hasattr(signal, 'SIGPIPE'): signal.signal(signal.SIGPIPE, signal.SIG_IGN)`

2. **Add `multiprocessing.freeze_support()`** to `python/tts_server_entry.py`
   - Without this, PyInstaller on Windows causes infinite subprocess spawn loops
   - Must be the very first call in `__main__`

3. **Update description strings**
   - `python/tts_server.spec` line 6: change "macOS arm64" to "current platform"
   - `src-tauri/Cargo.toml` line 4: change "Apple Silicon" to "Local text-to-speech desktop app"

4. **Make `scripts/build-release.sh` cross-platform**
   - Currently hard-coded to `apple-darwin` targets and `open *.app`
   - Add OS detection (the sidecar build script `python/build_sidecar.sh` already has this pattern to copy from)

### Phase 2: Windows Build (the main goal)

Follow `agent-handover-windows.md` sections 4-6:

1. **Set up dev environment** — Visual Studio Build Tools 2022, Rust, Node.js, Python 3.11+, pnpm
2. **Build Python sidecar** — CPU-only first (`pip install torch --index-url https://download.pytorch.org/whl/cpu`)
3. **Build Tauri app** — `pnpm tauri build --bundles nsis`
4. **Test** — Run the NSIS installer, verify app launches, test generation with a model

### Phase 3: CI/CD (after build works)

The existing CI has gaps beyond just being macOS-only:
- No Python backend tests (78 pytest tests never run in CI)
- `build` job only runs `pnpm build` (Vite), not `pnpm tauri build` (Rust)

Fix these first on `ubuntu-latest`, then expand to the multi-OS matrix. See `agent-handover-linux.md` section 11 for details.

## WSL 2 Notes

The Windows workstation has WSL 2 available. This is useful for:
- Running the existing bash build scripts (`build_sidecar.sh`) if preferred over PowerShell
- Testing the Linux build path in parallel with the native Windows build
- Running pytest and other Python tooling in a familiar environment

However, the **Tauri Windows build must be done natively** (not in WSL), because:
- Tauri needs MSVC and WebView2, which are Windows-native
- The sidecar binary must be a native `.exe` (PyInstaller can't cross-compile)
- WSL builds produce Linux ELF binaries, not Windows PE executables

**Recommended workflow**:
- Use WSL 2 for git operations, code editing, running tests
- Use native PowerShell for `build_sidecar.ps1` and `pnpm tauri build`

## Key Files to Know

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Full project architecture and conventions |
| `GAP_ANALYSIS.md` | All 13 v1.0 items (resolved) |
| `python/tts_server/device.py` | Device detection — already has CUDA fallback |
| `python/tts_server/inference.py:17` | SIGPIPE line that crashes on Windows |
| `python/tts_server/main.py:12` | Same SIGPIPE issue |
| `python/tts_server_entry.py` | Needs `freeze_support()` for Windows |
| `src-tauri/src/lib.rs` | Sidecar management — already has Windows branches |
| `src-tauri/capabilities/default.json` | FS permissions — just fixed for recursive AppData |
| `.github/workflows/ci.yml` | CI — needs Python tests + Tauri build + multi-OS |

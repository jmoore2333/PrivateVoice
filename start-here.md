# Start Here: Windows Desktop Build

## Context

This is the continuation of the PrivateVoice v1.0 cross-platform effort. The macOS build is complete and shipping. The goal now is to get a working Windows build on a Windows 11 desktop.

## Current State

- **macOS**: Production-ready. All 13 GAP_ANALYSIS items resolved, 216 unit + 78 backend + 90 E2E tests passing.
- **Main branch**: Up to date through commit `dc51378` — includes all cross-platform code fixes and --onedir sidecar architecture.
- **Phase 1 (Code Fixes)**: COMPLETE — all 4 items done, merged to main.
- **Phase 2 (Windows Build)**: READY TO BUILD — architecture in place, dev environment set up.

## What's Already Done

### Phase 1: Code Fixes (all complete)

1. ~~**Guard `signal.SIGPIPE`**~~ — Done. `hasattr(signal, 'SIGPIPE')` guard in `inference.py` and `main.py`.
2. ~~**`multiprocessing.freeze_support()`**~~ — Done. First call in `tts_server_entry.py`.
3. ~~**Update description strings**~~ — Done. Generic descriptions in spec and Cargo.toml.
4. ~~**Cross-platform build scripts**~~ — Done. `build-release.sh` and `build_sidecar.sh` detect OS/arch dynamically.

### --onedir Sidecar Architecture (commit `dc51378`)

The PyInstaller build now uses platform-conditional modes:

| Platform | PyInstaller Mode | Tauri Integration | Startup |
|----------|-----------------|-------------------|---------|
| macOS | `--onefile` | `externalBin` (shell plugin) | ~2-5s |
| Windows/Linux | `--onedir` | `resources` (Command::new) | Instant |

Why: On Windows with CUDA, `--onefile` produces a 3-5 GB binary that self-extracts to temp on every launch (30-60s), hits 260-char path limits, and risks multiprocessing spawn loops. `--onedir` keeps libraries on disk.

Key files changed:
- `python/tts_server.spec` — platform-conditional EXE vs EXE+COLLECT
- `python/build_sidecar.ps1` — copies `dist/tts-server/` dir to `src-tauri/sidecar/tts-server/`
- `src-tauri/src/lib.rs` — `SidecarProcess` enum, 3 spawn paths (dev/macOS-release/win-release)
- `src-tauri/tauri.conf.json` — no externalBin (moved to `tauri.macos.conf.json`)
- `scripts/build-release.sh` — injects `--config` with resources glob for non-macOS

## What Needs to Happen Now

### Phase 2: Windows Production Build

#### Prerequisites (verify these are installed)

- Visual Studio Build Tools 2022 (with "Desktop development with C++" workload)
- Rust (via rustup)
- Node.js 18+ and pnpm
- Python 3.11+ with venv
- WebView2 Runtime (usually pre-installed on Windows 11)

#### Step 1: Build the Python sidecar

```powershell
cd python
.\build_sidecar.ps1
```

This will:
1. Create/activate `.venv`
2. Install dependencies from `requirements.txt`
3. Run `pyinstaller tts_server.spec` (produces `dist/tts-server/` directory)
4. Copy the `--onedir` output to `src-tauri/sidecar/tts-server/`

**CPU-only first run**: If you don't have CUDA torch installed, that's fine — the sidecar will work with CPU inference. For CUDA support, install torch with CUDA index before building:
```powershell
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

#### Step 2: Build the Tauri app

```powershell
cd <project_root>
pnpm install
pnpm tauri build --bundles nsis --config '{"bundle":{"resources":["sidecar/tts-server/**/*"]}}'
```

The `--config` flag injects the resources configuration to bundle the `--onedir` sidecar output. Without it, the sidecar won't be included in the installer.

Or use the full build script (from Git Bash/MSYS2):
```bash
./scripts/build-release.sh
```

#### Step 3: Test

1. Run the NSIS installer from `src-tauri/target/release/bundle/nsis/`
2. Launch the app
3. Verify sidecar starts (check /health endpoint at localhost:8765)
4. Test TTS generation with a model

#### What to Watch For

- **Console window**: The Rust code uses `CREATE_NO_WINDOW` flag — no console should appear
- **Sidecar path**: In release mode, sidecar resolves to `<resource_dir>/sidecar/tts-server/tts-server.exe`
- **CUDA detection**: `device.py` auto-detects CUDA if available, falls back to CPU
- **Model download**: First run downloads models from HuggingFace (~1.2-3.4 GB)

### Phase 3: CI/CD (after build works)

The existing CI has gaps:
- No Python backend tests (78 pytest tests never run in CI)
- `build` job only runs `pnpm build` (Vite), not `pnpm tauri build` (Rust)

Fix these on `ubuntu-latest` first, then expand to multi-OS matrix.

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Full project architecture and conventions |
| `python/tts_server.spec` | PyInstaller spec — platform-conditional --onefile/--onedir |
| `python/build_sidecar.ps1` | Windows sidecar build script |
| `python/tts_server/device.py` | Device detection (CUDA/MPS/CPU) |
| `src-tauri/src/lib.rs` | Sidecar spawn — SidecarProcess enum, 3 code paths |
| `src-tauri/tauri.conf.json` | Base config (no externalBin, no resources) |
| `src-tauri/tauri.macos.conf.json` | macOS override (adds externalBin) |
| `scripts/build-release.sh` | Full release build (injects --config for resources) |
| `src-tauri/capabilities/default.json` | FS + shell permissions |

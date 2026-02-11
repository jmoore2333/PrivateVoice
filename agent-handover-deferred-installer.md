# Agent Handover: Deferred Dependency Installer (February 2026)

This document hands over the deferred dependency installer implementation on branch `claude/fix-crossplatform-setup-AAIjb`. It covers what was built, the audit results, known issues to fix, and step-by-step instructions for testing builds on Windows, Linux, and macOS.

---

## Table of Contents

1. [What Changed — Architecture Overview](#1-what-changed--architecture-overview)
2. [Audit Report Summary](#2-audit-report-summary)
3. [Known Issues and Required Fixes](#3-known-issues-and-required-fixes)
4. [Next Steps: Testing on Windows](#4-next-steps-testing-on-windows)
5. [Next Steps: Testing on Linux](#5-next-steps-testing-on-linux)
6. [Next Steps: Testing on macOS](#6-next-steps-testing-on-macos)
7. [Manual Test Procedure (All Platforms)](#7-manual-test-procedure-all-platforms)
8. [Files Changed](#8-files-changed)
9. [Superseded Documents](#9-superseded-documents)

---

## 1. What Changed — Architecture Overview

### Before (PyInstaller sidecar)

The app shipped a 1.5–5 GB PyInstaller-bundled binary containing Python, PyTorch, and all ML dependencies. Three different launch paths existed:
- **macOS**: `--onefile` via `tauri-plugin-shell` + `externalBin`
- **Windows**: `--onedir` via `std::process::Command` + `resources`
- **Linux**: `--onedir` (planned, never tested)

This approach hit a **fundamental limitation**: CUDA PyTorch (~4 GB) exceeds both NSIS (~2 GB PE limit) and MSI (~2 GB CAB limit) installer size caps. CPU-only builds worked but were slow and the startup log flooding issue was never resolved.

### After (Deferred dependency installer)

The app ships a **~50–60 MB installer** containing:
- The Tauri app (~15–20 MB)
- The `uv` binary (~30–35 MB) — Astral's fast Python package manager
- Python source code (`tts_server/`) (~100 KB)
- `requirements.txt` (~10 KB)

On **first launch**, the app:
1. Detects GPU hardware (NVIDIA, AMD, Intel, Apple Silicon, CPU fallback)
2. Checks disk space (2 GB CPU / 5 GB GPU minimum)
3. Copies Python source from bundle to `{appData}/PrivateVoice/python_env/`
4. Installs standalone Python 3.11 via `uv python install` (~40 MB download)
5. Creates a virtual environment via `uv venv`
6. Installs all dependencies via `uv pip install -r requirements.txt` with GPU-appropriate PyTorch wheels (~1–3 GB download depending on GPU)
7. Verifies the installation (imports torch, checks GPU availability)
8. Writes a `.setup-complete` marker with version, GPU target, and requirements hash

On **subsequent launches**, the marker is validated in ~10ms and setup is skipped entirely.

### Single code path for all platforms

There is now **one release-mode code path** in `lib.rs`. No `#[cfg(target_os = "macos")]` branching in the launch logic. The only platform-specific code is `CREATE_NO_WINDOW` on Windows (required to suppress console) and GPU detection methods.

`tauri-plugin-shell` has been fully removed — all process spawning uses `std::process::Command`.

---

## 2. Audit Report Summary

An automated audit compared the implementation against the original plan (`docs/plans/deferred-dependency-install.md`) and user requirements.

### Fully Covered

| Area | Notes |
|------|-------|
| Phase 1: `paths.rs` | All path functions, platform-aware (Scripts/python.exe vs bin/python) |
| Phase 1: `gpu.rs` | MPS, CUDA, ROCm, Intel XPU, CPU — exceeds plan (plan only had MPS/CUDA/CPU) |
| Phase 1: `setup.rs` | All 6 planned steps + disk space check (7 total) |
| Phase 1: `validate.rs` | All 4 states (Ready, NeedsSetup, NeedsUpdate, Corrupted), marker parsing, hash check |
| Phase 1: `lib.rs` integration | Unified release path, 3 new Tauri commands |
| Phase 1: Cargo deps | sha2 added, tauri-plugin-shell removed |
| Phase 2: appStore phases | All setup phases + 2 extras (setup-checking-disk, setup-copying-source) |
| Phase 2: StartupProgress | Labels, icons, amber accent for setup phases |
| Phase 2: SettingsPanel | Full Environment section with status, GPU, disk, repair buttons |
| Phase 3: PyInstaller removal | All 5 files deleted |
| Phase 3: Build scripts | Both .sh and .ps1 for uv download and release build |
| Phase 3: tauri.conf.json | Resources configured, no externalBin |
| Phase 3: Capabilities | Shell permissions removed |
| Phase 4: Unified launch | Single path, all platforms |
| Phase 4: Shell plugin removal | Fully removed from all layers |
| User: All platforms unified | Single code path |
| User: No admin required | User app data dir, NSIS currentUser |
| User: AMD/Intel GPU | ROCm + XPU detection implemented |
| User: Disk space checks | Pre-install check with clear errors |
| User: uv update management | Version check + UI display in Settings |

### Partial Coverage

| Area | What's Missing |
|------|---------------|
| LoadingScreen first-run | Shows generic "one-time setup" message but doesn't prominently display detected hardware (e.g., "NVIDIA RTX 4090") as a separate line |
| E2E tests | All 4 spec files mock the 3 new commands, but no tests exercise setup-phase-specific UI (amber colors, wrench icons, setup progress) |
| Offline/zip packaging | Not implemented — user explicitly marked this as secondary |

### Issues Found

See [Section 3](#3-known-issues-and-required-fixes) for full details and recommended fixes.

---

## 3. Known Issues and Required Fixes

### 3.1 DOCUMENTATION — Stale references to old architecture (HIGH PRIORITY)

Four documentation files still describe the PyInstaller/shell-plugin architecture:

| File | Issue |
|------|-------|
| `CLAUDE.md` | References `tauri-plugin-shell`, PyInstaller, `externalBin`. Missing mention of `env_manager` and `uv`. |
| `start-here.md` | Describes `--onefile`/`--onedir` sidecar modes, references deleted `tauri.macos.conf.json` |
| `docs/crossplatform.md` | Entire document describes old dual-mode architecture |
| `agent-handover-windows.md` | Describes PyInstaller approach, SIGPIPE fixes, `--onedir` — all obsolete |

**Recommended action**: Update `CLAUDE.md` to reflect the new architecture. Mark `start-here.md`, `crossplatform.md`, and `agent-handover-windows.md` as superseded by this document, or delete them.

### 3.2 CODE — Stale test mock (LOW PRIORITY)

`src/lib/test-utils.ts` lines 28-32 still mock `@tauri-apps/plugin-shell`:
```typescript
vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { sidecar: vi.fn() },
}));
```
The package is no longer a dependency. This won't break tests but is misleading.

**Fix**: Remove the mock block.

### 3.3 CODE — Stale .gitignore entries (LOW PRIORITY)

Old PyInstaller patterns still present:
- `python/dist/` and `python/build/` (PyInstaller output dirs)
- `src-tauri/tts-server-*` (old sidecar binary pattern)
- `src-tauri/sidecar/` (old `--onedir` sidecar)

**Fix**: Remove these lines from `.gitignore`.

### 3.4 CODE — `wmic` disk space path parsing (LOW PRIORITY)

In `setup.rs` line ~144, the code does `&path_str[..2]` to extract the Windows drive letter (e.g., "C:"). This could panic on UNC paths (`\\server\share`) or strings shorter than 2 characters. In practice, `app_data_dir()` always returns a drive-letter path, so this is very low risk. The PowerShell fallback at line ~191 has the same assumption.

**Fix**: Add a bounds check: `if path_str.len() >= 2 && path_str.as_bytes()[1] == b':'`.

### 3.5 CODE — `wmic` deprecation on Windows 11 (LOW PRIORITY)

`wmic` is deprecated and may be removed in future Windows versions. The code correctly falls back to PowerShell for disk space, but AMD/Intel GPU detection on Windows also uses `wmic`. If `wmic` is absent, GPU detection silently falls through to CPU — acceptable degradation but worth noting.

### 3.6 CODE — Intel XPU double index URL (COSMETIC)

In `setup.rs` `install_dependencies()`, the `--extra-index-url` from `torch_extra_index_url()` is added, and then a second identical URL is added specifically for `IntelXpu`. The URL gets passed twice. uv deduplicates, so no functional impact.

**Fix**: Remove the redundant `if matches!(gpu, GpuTarget::IntelXpu)` block.

### 3.7 CODE — `stream_output` thread join (COSMETIC)

`stream_output()` spawns threads for stderr/stdout streaming but never joins them. When `child.wait()` returns, the threads get EOF and terminate naturally, but the last few log lines might appear after the function has moved to the next step. Cosmetic only.

---

## 4. Next Steps: Testing on Windows

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Visual Studio Build Tools 2022 | Latest | [Download](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — select "Desktop development with C++" |
| Rust | Stable | `winget install Rustlang.Rustup` then `rustup default stable-x86_64-pc-windows-msvc` |
| Node.js | 18+ LTS | `winget install OpenJS.NodeJS.LTS` |
| pnpm | 8+ | `corepack enable` |
| Git | Latest | `winget install Git.Git` |

**Note**: Python is NOT required on the build machine for users. The deferred installer uses `uv` to install a standalone Python. For development (`pnpm tauri dev`), you still need Python 3.11+ with a local venv.

### Build Steps (PowerShell)

```powershell
# 1. Clone and switch to branch
git clone <repo-url> PrivateVoice
cd PrivateVoice
git checkout claude/fix-crossplatform-setup-AAIjb

# 2. Run the release build
.\scripts\build-release.ps1

# This does 4 things:
#   a. Downloads uv v0.6.6 for Windows x64 → src-tauri/resources/uv.exe
#   b. Copies python/tts_server/ → src-tauri/resources/tts_server/
#   c. Copies python/requirements.txt → src-tauri/resources/requirements.txt
#   d. Runs pnpm install && pnpm tauri build --bundles nsis
```

### Build Steps (Git Bash)

```bash
# Alternative: use the bash script from Git Bash / MSYS2
./scripts/build-release.sh
```

### Expected Output

```
src-tauri\target\release\bundle\nsis\PrivateVoice_1.0.0_x64-setup.exe
```

Expected installer size: **~50–60 MB** (vs. 241 MB CPU-only or 4+ GB CUDA with old approach).

### First Launch Test

1. Run the NSIS installer — should install to `%LOCALAPPDATA%\PrivateVoice` (no admin prompt)
2. Launch the app
3. **First-run setup** should show:
   - Amber-colored progress bar with wrench icon
   - "One-time setup" info panel
   - Progress through: Detecting hardware → Checking disk → Copying source → Installing Python → Creating venv → Installing deps → Verifying → Complete
   - The "Installing dependencies" step will take 1–5 minutes (downloads ~1–3 GB depending on GPU)
4. After setup completes, server starts normally
5. **Second launch** — should skip setup entirely and start in ~5 seconds

### What to Watch For

- Does GPU detection correctly identify your hardware? (Check Settings → Environment)
- Does the NSIS installer work without admin elevation?
- Does the app launch without a visible console window?
- Does `%LOCALAPPDATA%\com.privatevoice.app\python_env\` contain the venv?
- Can you generate audio after setup completes?

### If Something Fails

- Check the expanding log panel on the loading screen for error details
- The Settings → Environment section shows the environment state and has Repair/Rebuild buttons
- To force a full re-setup: delete `%LOCALAPPDATA%\com.privatevoice.app\python_env\`
- For build issues: check that `src-tauri/resources/uv.exe` exists after step 2a

---

## 5. Next Steps: Testing on Linux

### Prerequisites

| Tool | Install (Ubuntu 22.04+) |
|------|------------------------|
| System libraries | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev` |
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js 18+ | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash - && sudo apt install nodejs` |
| pnpm | `corepack enable` |

### Build Steps

```bash
git clone <repo-url> PrivateVoice
cd PrivateVoice
git checkout claude/fix-crossplatform-setup-AAIjb

# Run the release build
./scripts/build-release.sh

# Output: .deb and .AppImage in src-tauri/target/release/bundle/
```

### Expected Output

```
src-tauri/target/release/bundle/deb/private-voice_1.0.0_amd64.deb
src-tauri/target/release/bundle/appimage/private-voice_1.0.0_amd64.AppImage
```

### Linux-Specific Notes

- GPU detection checks: `nvidia-smi` (NVIDIA), `rocm-smi` / `/opt/rocm` / `lspci` (AMD), `xpu-smi` / `sycl-ls` / `/opt/intel/oneapi` (Intel)
- AMD ROCm wheels are **Linux-only** — this is the only platform where AMD GPU acceleration works with PyTorch
- The `.AppImage` format is recommended for distribution (runs on most distros without admin)
- `.deb` is available for Debian/Ubuntu systems
- First-run data goes to `~/.local/share/com.privatevoice.app/python_env/`

---

## 6. Next Steps: Testing on macOS

### Prerequisites

| Tool | Install |
|------|---------|
| Xcode Command Line Tools | `xcode-select --install` |
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js 18+ | `brew install node` or download from nodejs.org |
| pnpm | `corepack enable` |

### Build Steps

```bash
git clone <repo-url> PrivateVoice
cd PrivateVoice
git checkout claude/fix-crossplatform-setup-AAIjb

# Run the release build
./scripts/build-release.sh

# Output: .dmg in src-tauri/target/release/bundle/
```

### macOS-Specific Notes

- Apple Silicon is auto-detected at compile time (`cfg!(target_arch = "aarch64")`) → MPS GPU target
- Intel Macs fall back to CPU
- Default PyPI torch includes MPS support — no `--extra-index-url` needed
- First-run data goes to `~/Library/Application Support/com.privatevoice.app/python_env/`
- The existing macOS DMG build worked before this change. This is a **regression test** — verify that the new unified code path works as well as the old shell-plugin path

### Key Regression to Check

The old macOS build used `tauri-plugin-shell` with `externalBin` to manage the sidecar. The new build uses `std::process::Command` with the venv Python. Verify:
- Server starts and responds to health checks
- Audio generation works end-to-end
- Sidecar process is killed on app close
- No orphaned Python processes after quit

---

## 7. Manual Test Procedure (All Platforms)

Run these tests on each platform after a successful build:

### First-Run Setup

| # | Test | Expected |
|---|------|----------|
| 1 | Install and launch app (fresh, no prior data) | Setup wizard appears with amber progress |
| 2 | Observe GPU detection | Correct hardware shown (MPS on Mac, CUDA on NVIDIA, etc.) |
| 3 | Wait for setup to complete | All 7 steps complete, server starts |
| 4 | Open Settings → Environment | Shows: Ready status, correct GPU, venv path, disk usage |
| 5 | Close and relaunch | Setup skipped, server starts in ~5 seconds |

### Environment Management

| # | Test | Expected |
|---|------|----------|
| 6 | Click "Repair (re-verify)" in Settings | Marker deleted, setup re-runs on next launch |
| 7 | Click "Full rebuild" in Settings | Marker + venv deleted, full setup on next launch |
| 8 | Delete `.setup-complete` marker manually | App detects NeedsSetup, runs setup |
| 9 | Edit `requirements.txt` to change hash | App detects NeedsUpdate, runs dependency install |

### Generation (Post-Setup)

| # | Test | Expected |
|---|------|----------|
| 10 | Load 0.6b model | Model loads successfully |
| 11 | Generate "Hello from [platform]" | Audio produced, playable |
| 12 | Export as WAV | File saves correctly |
| 13 | Export as MP3 | File saves correctly |

### Error Recovery

| # | Test | Expected |
|---|------|----------|
| 14 | Disconnect internet during setup | Clear error message, Retry button works |
| 15 | Fill disk during setup | Disk space check catches it before install |
| 16 | Kill app during setup, relaunch | Setup restarts from beginning (no marker = NeedsSetup) |

---

## 8. Files Changed

### New Files (7)

| File | Purpose |
|------|---------|
| `src-tauri/src/env_manager/mod.rs` | Module root, re-exports submodules |
| `src-tauri/src/env_manager/paths.rs` | Path resolution for venv, uv, source, markers |
| `src-tauri/src/env_manager/gpu.rs` | GPU detection (NVIDIA, AMD, Intel, Apple Silicon, CPU) |
| `src-tauri/src/env_manager/setup.rs` | First-run setup orchestration via uv (7 steps) |
| `src-tauri/src/env_manager/validate.rs` | Environment validation on each launch |
| `scripts/download-uv.sh` | Download platform-specific uv binary (bash) |
| `scripts/download-uv.ps1` | Download platform-specific uv binary (PowerShell) |

### Modified Files (16)

| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Integrated env_manager, unified sidecar launch, 3 new commands, removed shell plugin |
| `src-tauri/Cargo.toml` | Added sha2, removed tauri-plugin-shell |
| `src-tauri/Cargo.lock` | Dependency tree updated |
| `src-tauri/tauri.conf.json` | Added bundle resources (uv, tts_server, requirements.txt) |
| `src-tauri/capabilities/default.json` | Removed shell:allow-* permissions |
| `src/lib/stores/appStore.svelte.ts` | Added 9 setup phases, updated progress ranges |
| `src/lib/stores/appStore.test.ts` | Updated expected progress values |
| `src/lib/components/startup/StartupProgress.svelte` | Setup phase labels, icons, amber accent |
| `src/lib/components/startup/LoadingScreen.svelte` | First-run info panel |
| `src/lib/components/settings/SettingsPanel.svelte` | Environment section with repair buttons |
| `scripts/build-release.sh` | Rewritten: download uv → stage source → tauri build |
| `scripts/build-release.ps1` | Rewritten: same 4-step process for Windows |
| `package.json` | Removed @tauri-apps/plugin-shell, updated description |
| `pnpm-lock.yaml` | Updated lockfile |
| `.gitignore` | Added build-time resources (uv, staged source) |
| `e2e/*.spec.ts` (4 files) | Added mocks for get_environment_status, repair_environment, detect_gpu |

### Deleted Files (5)

| File | Reason |
|------|--------|
| `python/tts_server.spec` | PyInstaller no longer used |
| `python/tts_server_entry.py` | PyInstaller entry point no longer needed |
| `python/build_sidecar.sh` | Replaced by new build-release.sh |
| `python/build_sidecar.ps1` | Replaced by new build-release.ps1 |
| `src-tauri/tauri.macos.conf.json` | externalBin config no longer needed |

---

## 9. Superseded Documents

The following documents describe the **old PyInstaller-based architecture** and are now largely obsolete:

| Document | Status |
|----------|--------|
| `agent-handover-windows.md` | **Superseded** — describes PyInstaller sidecar, SIGPIPE fixes, --onedir mode |
| `agent-handover-linux.md` | **Superseded** — describes PyInstaller sidecar for Linux |
| `start-here.md` | **Superseded** — describes --onefile/--onedir sidecar modes |
| `docs/crossplatform.md` | **Superseded** — describes old dual-mode architecture |
| `docs/plans/deferred-dependency-install.md` | **Implemented** — this plan is now the reality. Keep as historical reference. |

These should be updated or removed once the deferred installer is validated on all platforms.

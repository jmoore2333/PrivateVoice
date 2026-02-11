# Plan: Rearchitect Bundling — Minimal Installer with Deferred Dependency Download

## Context

PrivateVoice currently ships a 1.5–2.5 GB PyInstaller sidecar containing PyTorch, transformers, and all ML dependencies baked in. This plan replaces that with a ~50–60 MB installer that bundles only `uv` (Astral's fast Python package manager) and the Python source code. On first launch, `uv` installs a standalone Python + the correct PyTorch variant into a self-contained venv inside `{appData}/PrivateVoice/`. No system Python, no elevated permissions, no installs outside the app's data directory. Internet is already required for first launch (model downloads), so this adds no new constraint.

---

## Phase 1: Rust Environment Manager Module

Create `src-tauri/src/env_manager/` with four submodules:

### 1a. `paths.rs` — Centralized path resolution

All paths under `{appData}/PrivateVoice/python_env/`:

| Path | Purpose |
|------|---------|
| `python_env/venv/` | uv-created virtual environment |
| `python_env/tts_server/` | Python source (copied from bundle) |
| `python_env/requirements.txt` | Copied from bundle |
| `python_env/.setup-complete` | JSON marker: version, gpu_target, requirements_hash, timestamp |

Functions: `app_data_dir()`, `venv_dir()`, `venv_python()` (platform-aware: `venv/Scripts/python.exe` on Windows, `venv/bin/python` on Unix), `uv_binary()` (from Tauri resource dir), `setup_marker_path()`, `tts_source_dir()`, `bundled_source_dir()`, `requirements_txt()`.

### 1b. `gpu.rs` — Hardware detection in pure Rust (before Python exists)

```rust
pub enum GpuTarget {
    Mps,              // macOS Apple Silicon — default PyPI torch (includes MPS)
    Cuda(String),     // NVIDIA — e.g. "cu124", uses download.pytorch.org/whl/cu124
    Cpu,              // Fallback — uses download.pytorch.org/whl/cpu
}
```

Detection logic:
- **macOS**: `cfg!(target_os = "macos") && cfg!(target_arch = "aarch64")` → `Mps`. Intel Mac → `Cpu`.
- **Windows/Linux**: Run `nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader`. Parse output. If found → `Cuda("cu124")`. If nvidia-smi fails → `Cpu`.
- Each variant exposes `torch_index_url() -> Option<&str>` for pip install.

### 1c. `setup.rs` — First-run setup orchestration

Runs `uv` to bootstrap the entire Python environment. Each step emits `sidecar-startup` events (reusing existing event channel) with new setup phase names.

**Step 1 — Copy source** (0–5%): Recursive copy `resources/tts_server/` and `resources/requirements.txt` to `python_env/`.

**Step 2 — Install Python** (5–15%): `{uv} python install 3.11 --install-dir {python_env}/python`. uv downloads a standalone CPython from python-build-standalone (~40 MB). No system install.

**Step 3 — Create venv** (15–20%): `{uv} venv {python_env}/venv --python {python_env}/python/...`

**Step 4 — Install dependencies** (20–90%): `{uv} pip install -r requirements.txt --python {venv_python} [--extra-index-url {torch_index}]`. Stream stderr for progress (uv outputs download/install lines). This is the longest step (~1–2 GB download).

**Step 5 — Verify** (90–95%): Run `{venv_python} -c "import torch; import tts_server"` to confirm installation is functional. Check torch GPU availability matches expected target.

**Step 6 — Write marker** (95–100%): Write `.setup-complete` JSON with version, gpu_target, requirements SHA-256 hash, timestamp.

### 1d. `validate.rs` — Environment validation (every launch)

```rust
pub enum SetupState {
    Ready,                     // Marker valid, venv exists, hashes match
    NeedsSetup,               // No marker or no venv
    NeedsUpdate(String),      // Marker exists but requirements hash changed (app update)
    Corrupted(String),        // Marker exists but venv Python missing/broken
}
```

Quick check on every launch (~10ms): marker file exists → parse JSON → verify venv python binary exists → compare requirements hash. No Python execution needed for validation.

### 1e. Modify `lib.rs` — Integrate setup before server launch

In `start_tts_server()`, add setup check before spawning the server (release mode only):

```
start_tts_server called
  → kill_process_on_port(8765)          [existing]
  → emit "initializing"                 [existing]
  → validate::check_environment()       [NEW]
  → if NeedsSetup/NeedsUpdate/Corrupted:
      → gpu::detect_gpu()               [NEW]
      → setup::run_setup(app, gpu)      [NEW — emits setup-* phases]
  → spawn venv_python -u -m tts_server.main  [MODIFIED — venv path instead of bundled binary]
  → spawn_std_child_streaming()         [existing, unchanged]
```

**Simplify SidecarProcess**: Remove the `Shell(CommandChild)` variant entirely. All platforms (dev + release) now use `std::process::Child`. Remove `#[cfg(all(not(debug_assertions), target_os = "macos"))]` conditionals throughout.

**New commands**:
- `get_environment_status` → returns `{ setup_complete, gpu_target, python_version, venv_path, disk_usage_mb }`
- `repair_environment` → deletes `.setup-complete` marker (and optionally venv), re-runs setup on next launch

### 1f. New Cargo dependency

Add `sha2 = "0.10"` for requirements.txt hash computation. Remove `tauri-plugin-shell` if no other features use it (the shell permissions in `default.json` are for the Tauri shell plugin sidecar which is being replaced).

---

## Phase 2: Frontend Setup Wizard

### 2a. Extend `appStore.svelte.ts` — New startup phases

```typescript
export type StartupPhase =
  | "initializing"
  | "setup-detecting-hardware"    // NEW
  | "setup-installing-python"     // NEW
  | "setup-creating-venv"         // NEW
  | "setup-installing-deps"       // NEW
  | "setup-verifying"             // NEW
  | "setup-complete"              // NEW
  | "starting-server"
  | "checking-models"
  | "downloading"
  | "loading-model"
  | "ready"
  | "error";
```

Update `PHASE_PROGRESS` mapping — setup phases occupy 0–70% on first run, server phases 70–100%. On subsequent runs, setup phases are never emitted and existing mapping applies as-is (the Rust side skips straight to "starting-server").

Update `PHASE_MESSAGES` with user-friendly descriptions for each setup step.

### 2b. Extend `StartupProgress.svelte` — Setup phase labels and icons

Add labels, icons, and accent colors for setup phases. Use amber accent for setup phases to distinguish from the cyan used for normal server startup. Add a download/wrench icon for setup steps.

### 2c. Extend `LoadingScreen.svelte` — First-run info panel

During setup phases, display:
- Detected hardware ("Apple Silicon (MPS)" / "NVIDIA RTX 4090 (CUDA)" / "CPU")
- Which PyTorch variant is being installed
- "One-time setup — subsequent launches will be instant" reassurance text
- Streaming log of uv output during `setup-installing-deps` (reuses existing expandable logs panel)
- Setup-specific error recovery: "Setup failed. [Retry] [Show Logs]" calling `repair_environment`

### 2d. Extend `SettingsPanel.svelte` — Environment section

New "Environment" section showing:
- Status: Ready / Needs Setup
- GPU target: detected hardware
- Python version, venv path, disk usage
- [Repair Environment] button → calls `repair_environment` command
- [Reinstall Dependencies] button → deletes marker + venv, triggers fresh setup on next launch

### 2e. `+page.svelte` — No structural changes needed

The existing `listen("sidecar-startup", ...)` handler already passes any phase string to `appStore.setStartupPhase()`. The new setup phases emitted by Rust will flow through automatically. Health polling starts after `invoke("start_tts_server")` resolves, which won't happen until setup completes (the async command blocks during setup).

---

## Phase 3: Build System Changes

### 3a. Remove (PyInstaller artifacts)

| File | Action |
|------|--------|
| `python/tts_server.spec` | Delete |
| `python/tts_server_entry.py` | Delete |
| `python/build_sidecar.sh` | Delete |
| `python/build_sidecar.ps1` | Delete |
| `src-tauri/tauri.macos.conf.json` | Delete |

### 3b. Add — New build scripts

**`scripts/download-uv.sh`** (+ `.ps1`): Downloads the correct `uv` binary for the build platform from GitHub releases. Pins a specific version. Places it at `src-tauri/resources/uv` (or `uv.exe`).

| Platform | uv binary | ~Size |
|----------|-----------|-------|
| macOS ARM64 | `uv-aarch64-apple-darwin` | 30 MB |
| Windows x64 | `uv-x86_64-pc-windows-msvc.exe` | 35 MB |
| Linux x64 | `uv-x86_64-unknown-linux-gnu` | 30 MB |

**`scripts/build-release.sh`** (rewritten):
1. `./scripts/download-uv.sh` — fetch uv binary
2. Copy `python/tts_server/` → `src-tauri/resources/tts_server/`
3. Copy `python/requirements.txt` → `src-tauri/resources/requirements.txt`
4. `pnpm install`
5. `pnpm tauri build`

### 3c. Tauri config changes

**`tauri.conf.json`** — Add bundle resources:
```json
"bundle": {
  "resources": [
    "resources/uv*",
    "resources/tts_server/**/*",
    "resources/requirements.txt"
  ]
}
```

No `externalBin` anywhere. Delete `tauri.macos.conf.json`.

### 3d. Capabilities — Review shell permissions

The shell permissions (`shell:allow-spawn`, etc.) in `default.json` were for the Tauri shell plugin sidecar. Since we now use `std::process::Command` directly (which doesn't require Tauri shell permissions), these can be removed. Keep `fs:allow-appdata-*` permissions (already present) for the venv directory.

### 3e. Installer size budget

| Component | Size |
|-----------|------|
| Tauri app (Rust + Svelte frontend) | ~15–20 MB |
| uv binary | ~30–35 MB |
| Python source (tts_server/) | ~100 KB |
| Requirements + lock files | ~10 KB |
| Icons, assets | ~2 MB |
| **Total installer** | **~50–60 MB** |

---

## Phase 4: Sidecar Launch Refactoring

### 4a. Release mode — Unified across all platforms

Replace the three release launch paths (macOS Shell plugin, Windows std, Linux std) with one:

```rust
let venv_python = env_manager::paths::venv_python(&app)?;
let source_parent = env_manager::paths::python_env_dir(&app)?;

let mut cmd = Command::new(venv_python);
cmd.args(["-u", "-m", "tts_server.main"])
    .current_dir(&source_parent)
    .env("PYTHONUNBUFFERED", "1")
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

#[cfg(target_os = "windows")]
{ cmd.creation_flags(CREATE_NO_WINDOW); }
```

### 4b. What stays the same

- `process_stdout_line` / `process_stderr_line` — unchanged
- `spawn_std_child_streaming` — unchanged
- `LogBuffer`, `LogEntry`, `StartupEvent` structs — unchanged
- `kill_process_on_port(8765)` — unchanged
- `stop_tts_server`, `get_server_status`, `get_sidecar_logs` commands — unchanged
- `on_window_event` close handler — unchanged
- **Dev mode** — completely unchanged (still uses `python/.venv/` locally)

### 4c. Shell plugin removal

- Remove `tauri-plugin-shell = "2"` from `Cargo.toml`
- Remove `@tauri-apps/plugin-shell` from `package.json` (verify no frontend imports first)
- Remove `builder.plugin(tauri_plugin_shell::init())` from lib.rs
- Remove `shell:allow-*` from `default.json` capabilities
- Remove all `#[cfg(all(not(debug_assertions), target_os = "macos"))]` blocks

---

## Phase 5: Testing & Verification

### Manual test procedure

1. Delete `{appData}/PrivateVoice/python_env/` entirely → launch app → verify full setup wizard runs
2. Verify correct PyTorch variant installed (check `torch.cuda.is_available()` / `torch.backends.mps.is_available()`)
3. Close and relaunch → verify setup is skipped (near-instant server start)
4. Delete only `.setup-complete` marker → relaunch → verify re-setup triggers
5. Test "Repair Environment" button in settings
6. Test with no internet → verify clear error message during setup

### Automated tests

- Extend E2E tests with setup phase mocks (new `sidecar-startup` events with setup phase names)
- Add screenshots for setup phases at each resolution
- Unit test GPU detection with mocked `nvidia-smi` output
- Integration test: validate `check_environment()` returns correct states for marker present/absent/hash-mismatch

### CI considerations

- Build artifact size monitoring (target: <100 MB)
- Cache uv download in CI
- Platform matrix: macOS ARM64, Windows x64, Linux x64

---

## Implementation Order

1. **Phase 3** (build system) — Set up resource bundling. Can be done without changing runtime behavior.
2. **Phase 1** (Rust env manager) — Implement `env_manager/` modules. Test alongside old PyInstaller path.
3. **Phase 2** (frontend) — Extend UI with setup phases. Can overlap with Phase 1.
4. **Phase 4** (launch refactoring) — Cut over release mode from PyInstaller to venv. This is the switchover commit.
5. **Phase 5** (testing) — Full verification pass.
6. **Cleanup** — Delete PyInstaller artifacts (Phase 3a removals).

---

## Files to Create

| File | Description |
|------|-------------|
| `src-tauri/src/env_manager/mod.rs` | Module root, re-exports submodules |
| `src-tauri/src/env_manager/paths.rs` | Path resolution for venv, uv, source, markers |
| `src-tauri/src/env_manager/gpu.rs` | Hardware detection (MPS/CUDA/CPU) |
| `src-tauri/src/env_manager/setup.rs` | First-run setup orchestration via uv |
| `src-tauri/src/env_manager/validate.rs` | Environment validation on each launch |
| `scripts/download-uv.sh` | Download platform-specific uv binary |
| `scripts/download-uv.ps1` | Windows variant |

## Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Add env_manager integration to start_tts_server, simplify SidecarProcess, remove Shell variant, add new commands |
| `src-tauri/Cargo.toml` | Add sha2, remove tauri-plugin-shell |
| `src-tauri/tauri.conf.json` | Add bundle.resources for uv + source + requirements |
| `src-tauri/capabilities/default.json` | Remove shell:allow-* permissions |
| `src/lib/stores/appStore.svelte.ts` | Add setup-* phases, update PHASE_PROGRESS and PHASE_MESSAGES |
| `src/lib/components/startup/StartupProgress.svelte` | Add labels/icons for setup phases |
| `src/lib/components/startup/LoadingScreen.svelte` | Add first-run info panel with hardware + "one-time setup" text |
| `src/lib/components/settings/SettingsPanel.svelte` | Add Environment section with repair button |
| `scripts/build-release.sh` | Rewrite: download uv → copy source → pnpm tauri build |
| `python/requirements.txt` | Potentially split torch into separate line for --extra-index-url handling |
| `package.json` | Remove @tauri-apps/plugin-shell dependency |

## Files to Delete

| File | Reason |
|------|--------|
| `python/tts_server.spec` | PyInstaller no longer used |
| `python/tts_server_entry.py` | PyInstaller entry point no longer needed |
| `python/build_sidecar.sh` | Replaced by new build-release.sh |
| `python/build_sidecar.ps1` | Replaced by new build-release.ps1 |
| `src-tauri/tauri.macos.conf.json` | externalBin config no longer needed |

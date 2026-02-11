# Plan: Offline Portable Zip Distribution

## Goal

Build a script that produces self-contained `.zip` (or `.tar.gz`) archives for each platform+GPU combination. Each archive contains everything needed to run PrivateVoice without an internet connection — the app binary, uv, a pre-downloaded Python standalone, all Python wheels, and optionally pre-downloaded Qwen3-TTS models. The user extracts the zip and runs a launcher; the first-launch setup installs from local files instead of downloading.

This builds on top of the deferred dependency installer (branch `claude/fix-crossplatform-setup-AAIjb`). The existing `setup.rs` flow is modified to support a `--find-links` offline mode when a wheelhouse directory is present.

---

## Architecture

### What the zip contains

```
PrivateVoice-portable/
├── app/                           # Platform-specific app files
│   ├── PrivateVoice.app/          # macOS: the .app bundle
│   ├── PrivateVoice.exe           # Windows: raw executable
│   ├── PrivateVoice               # Linux: AppImage or raw binary
│   └── _up_/                      # Windows/Linux: Tauri resource dir
├── offline/
│   ├── python/                    # Pre-downloaded python-build-standalone tarball
│   │   └── cpython-3.11.x-{platform}.tar.gz
│   ├── wheelhouse/                # Pre-downloaded .whl files for all deps
│   │   ├── torch-2.x.x-cp311-cp311-{platform}.whl
│   │   ├── transformers-4.x.x-py3-none-any.whl
│   │   └── ... (all wheels)
│   └── uv                        # uv binary (same as bundled, backup copy)
├── models/                        # Optional: pre-downloaded HuggingFace models
│   ├── Qwen3-TTS-12Hz-0.6B-CustomVoice/
│   └── ... (whichever models were selected)
├── launch.sh                      # macOS/Linux launcher
├── launch.bat                     # Windows launcher
└── README.txt                     # Quick-start instructions
```

### How first launch works (offline mode)

The existing `setup.rs` `run_setup()` flow gains offline awareness:

1. **Check for `offline/` directory** adjacent to the app binary or in resources
2. If present, extract Python from `offline/python/` tarball instead of `uv python install`
3. Install wheels with `uv pip install --no-index --find-links=offline/wheelhouse/ -r requirements.txt`
4. If `models/` directory exists, symlink or copy models into the HuggingFace cache
5. Everything else (venv creation, verification, marker) stays the same

If `offline/` is not present, the app falls back to the existing online flow.

---

## Build Matrix

The script supports these platform profiles, selectable by parameter:

| Profile ID | OS | Arch | GPU | torch Index | Approx Wheel Size |
|------------|----|------|-----|-------------|-------------------|
| `macos-arm64` | macOS | ARM64 | MPS | Default PyPI | ~80 MB |
| `macos-x64` | macOS | x86_64 | CPU | Default PyPI | ~80 MB |
| `linux-x64-cpu` | Linux | x86_64 | CPU | `whl/cpu` | ~200–300 MB |
| `linux-x64-cuda` | Linux | x86_64 | CUDA 12.4 | `whl/cu124` | ~800 MB + ~1 GB nvidia pkgs |
| `linux-x64-rocm` | Linux | x86_64 | ROCm 6.2 | `whl/rocm6.2` | ~225 MB + ~660 MB rocm pkgs |
| `windows-x64-cpu` | Windows | x86_64 | CPU | `whl/cpu` | ~200–590 MB |
| `windows-x64-cuda` | Windows | x86_64 | CUDA 12.4 | `whl/cu124` | ~2.5–3.3 GB |

Default profiles when none specified:
- **macOS**: `macos-arm64`
- **Windows**: `windows-x64-cuda` and `windows-x64-cpu`
- **Linux**: `linux-x64-cuda` and `linux-x64-cpu`

### Estimated Total Zip Sizes

| Configuration | No Models | + 0.6B Model | + 1.7B Model | + All 5 Models |
|---------------|-----------|-------------|-------------|----------------|
| macOS ARM64 (MPS) | ~400 MB | ~1.6 GB | ~3.8 GB | ~14 GB |
| Linux x64 CPU | ~500 MB | ~1.7 GB | ~3.9 GB | ~14 GB |
| Linux x64 CUDA | ~2.2 GB | ~3.4 GB | ~5.6 GB | ~16 GB |
| Windows x64 CPU | ~600 MB | ~1.8 GB | ~4.0 GB | ~14 GB |
| Windows x64 CUDA | ~3.2 GB | ~4.4 GB | ~6.6 GB | ~17 GB |

---

## The Build Script

### Interface

```bash
# Bash (macOS/Linux, or Git Bash on Windows)
./scripts/build-portable.sh [OPTIONS]

# PowerShell (Windows)
.\scripts\build-portable.ps1 [OPTIONS]
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--profile <id>` | Auto-detect current OS | Platform+GPU profile (see matrix) |
| `--profiles <id,id,...>` | — | Build multiple profiles |
| `--models <id,id,...>` | none | Model variants to bundle: `0.6b`, `0.6b-base`, `1.7b`, `1.7b-base`, `1.7b-design`, `all` |
| `--output-dir <path>` | `./dist/portable/` | Where to write the zip files |
| `--python-version <ver>` | `3.11` | Python version for standalone download |
| `--uv-version <ver>` | `0.6.6` | uv version (matches `EXPECTED_UV_VERSION` in `setup.rs`) |
| `--skip-app-build` | false | Use existing Tauri build output instead of rebuilding |
| `--skip-wheels` | false | Use existing wheelhouse instead of re-downloading |
| `--no-compress` | false | Output an uncompressed directory instead of .zip/.tar.gz |

### Examples

```bash
# Default: builds for current platform with auto-detected GPU, no models
./scripts/build-portable.sh

# macOS with the small model bundled
./scripts/build-portable.sh --profile macos-arm64 --models 0.6b

# Windows: both CPU and CUDA zips with 0.6B model
.\scripts\build-portable.ps1 --profiles windows-x64-cpu,windows-x64-cuda --models 0.6b

# Linux: full distribution with all models
./scripts/build-portable.sh --profile linux-x64-cuda --models all

# Just rebuild wheels for a different GPU target (reuse app build)
./scripts/build-portable.sh --profile linux-x64-rocm --skip-app-build
```

---

## Script Execution Flow

### Phase 1: Build the Tauri app (unless `--skip-app-build`)

```
1a. Run ./scripts/download-uv.sh for the target platform
1b. Stage Python source: python/tts_server/ → src-tauri/resources/tts_server/
1c. Stage requirements.txt → src-tauri/resources/requirements.txt
1d. pnpm install
1e. pnpm tauri build [--target <triple>]
    → Produces app binary + resource dir in src-tauri/target/release/
```

For cross-platform builds (e.g., building a Windows zip from macOS), this step requires cross-compilation tooling or must be run on the target platform. The script should detect this and error clearly.

### Phase 2: Download Python standalone

```
2a. Determine python-build-standalone release URL for target:
    https://github.com/astral-sh/python-build-standalone/releases
    File pattern: cpython-3.11.{latest}+{date}-{target}-install_only.tar.gz

    Target mapping:
    - macos-arm64:     aarch64-apple-darwin
    - macos-x64:       x86_64-apple-darwin
    - linux-x64-*:     x86_64-unknown-linux-gnu
    - windows-x64-*:   x86_64-pc-windows-msvc

2b. Download to offline/python/
2c. Verify SHA-256 checksum
```

This tarball is ~18–30 MB and is what `uv python install` would download.

### Phase 3: Download Python wheels

This is the core of the offline packaging. We need a temporary venv to run `uv pip wheel`.

```
3a. Create a temporary build venv (using system Python or uv)
3b. Run uv pip wheel to download all wheels:

    uv pip wheel \
      -r python/requirements.txt \
      --wheel-dir offline/wheelhouse/ \
      --python-version 3.11 \
      --python-platform {platform_tag} \
      [--extra-index-url {torch_index}]

    Platform tags:
    - macos-arm64:     macosx_14_0_arm64
    - macos-x64:       macosx_13_0_x86_64
    - linux-x64:       manylinux_2_17_x86_64
    - windows-x64:     win_amd64

3c. Verify all wheels downloaded (check wheel count, expected packages)
3d. Report total wheelhouse size
```

**Important**: `uv pip wheel` resolves dependencies for a specific platform. If building on macOS for a Windows target, you need `--python-platform win_amd64` to get Windows wheels.

### Phase 4: Download models (if `--models` specified)

```
4a. For each model ID:
    - Map to HuggingFace repo (using MODEL_IDS from inference.py)
    - Use huggingface-cli download or Python script:
      huggingface-cli download Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice \
        --local-dir models/Qwen3-TTS-12Hz-0.6B-CustomVoice
4b. Report total model size
```

Model files go into `models/{repo_name}/` preserving the directory structure that HuggingFace Hub expects.

### Phase 5: Assemble the portable directory

```
5a. Create output directory: dist/portable/PrivateVoice-{profile}/
5b. Copy app files:
    - macOS: copy PrivateVoice.app bundle
    - Windows: copy PrivateVoice.exe + _up_/ resource dir
    - Linux: copy AppImage (or binary + resource dir)
5c. Copy offline/ directory (python tarball + wheelhouse)
5d. Copy models/ directory (if any)
5e. Generate launch.sh / launch.bat
5f. Generate README.txt with quick-start instructions
```

### Phase 6: Compress

```
6a. macOS/Linux: tar -czf PrivateVoice-{profile}.tar.gz PrivateVoice-{profile}/
    Windows: Compress-Archive or zip
6b. Report final archive size
6c. Generate SHA-256 checksum file
```

---

## Launchers

### `launch.sh` (macOS/Linux)

```bash
#!/bin/bash
# PrivateVoice Portable Launcher
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Set environment variable so the app knows offline files are available
export PRIVATEVOICE_OFFLINE_DIR="$SCRIPT_DIR/offline"
export PRIVATEVOICE_MODELS_DIR="$SCRIPT_DIR/models"

# macOS
if [[ -d "$SCRIPT_DIR/app/PrivateVoice.app" ]]; then
    open "$SCRIPT_DIR/app/PrivateVoice.app" --args \
        --offline-dir "$SCRIPT_DIR/offline" \
        --models-dir "$SCRIPT_DIR/models"
# Linux AppImage
elif [[ -f "$SCRIPT_DIR/app/PrivateVoice.AppImage" ]]; then
    chmod +x "$SCRIPT_DIR/app/PrivateVoice.AppImage"
    "$SCRIPT_DIR/app/PrivateVoice.AppImage" \
        --offline-dir "$SCRIPT_DIR/offline" \
        --models-dir "$SCRIPT_DIR/models"
# Linux raw binary
elif [[ -f "$SCRIPT_DIR/app/PrivateVoice" ]]; then
    "$SCRIPT_DIR/app/PrivateVoice" \
        --offline-dir "$SCRIPT_DIR/offline" \
        --models-dir "$SCRIPT_DIR/models"
fi
```

### `launch.bat` (Windows)

```batch
@echo off
set PRIVATEVOICE_OFFLINE_DIR=%~dp0offline
set PRIVATEVOICE_MODELS_DIR=%~dp0models
start "" "%~dp0app\PrivateVoice.exe"
```

---

## Rust Changes Required

### `setup.rs` — Offline-aware installation

The `run_setup()` function needs to detect and use offline resources:

```rust
// New: Check for offline resources
fn find_offline_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    // Check 1: Environment variable (set by launcher)
    if let Ok(dir) = std::env::var("PRIVATEVOICE_OFFLINE_DIR") {
        let path = PathBuf::from(dir);
        if path.join("wheelhouse").exists() {
            return Some(path);
        }
    }

    // Check 2: Adjacent to the resource directory
    if let Ok(resource_dir) = app.path().resource_dir() {
        let offline = resource_dir.join("offline");
        if offline.join("wheelhouse").exists() {
            return Some(offline);
        }
    }

    None // Fall back to online install
}
```

**Modified `install_python()`**: If `offline/python/cpython-*.tar.gz` exists, extract it instead of running `uv python install`:

```rust
fn install_python(app: &AppHandle, uv: &Path, offline: Option<&Path>) -> Result<(), String> {
    let python_dir = paths::standalone_python_dir(app)?;

    if let Some(offline_dir) = offline {
        // Find the Python tarball in offline/python/
        let tarball = find_python_tarball(&offline_dir.join("python"))?;
        extract_python_tarball(&tarball, &python_dir)?;
    } else {
        // Online: use uv python install (existing code)
        let mut cmd = Command::new(uv);
        cmd.args(["python", "install", "3.11", "--install-dir"])
            .arg(&python_dir)
            // ... existing code
    }
    Ok(())
}
```

**Modified `install_dependencies()`**: If `offline/wheelhouse/` exists, use `--no-index --find-links`:

```rust
fn install_dependencies(app: &AppHandle, uv: &Path, gpu: &GpuTarget, offline: Option<&Path>) -> Result<(), String> {
    let mut cmd = Command::new(uv);
    cmd.args(["pip", "install", "-r"])
        .arg(&requirements)
        .args(["--python"])
        .arg(&venv_python);

    if let Some(offline_dir) = offline {
        // Offline mode: install from local wheelhouse
        let wheelhouse = offline_dir.join("wheelhouse");
        cmd.args(["--no-index", "--find-links"])
            .arg(&wheelhouse);
    } else {
        // Online mode: use PyTorch index URL (existing code)
        if let Some(index_url) = gpu.torch_extra_index_url() {
            cmd.args(["--extra-index-url", &index_url]);
        }
    }
    // ... rest unchanged
}
```

### `setup.rs` — Model pre-population

If `PRIVATEVOICE_MODELS_DIR` is set and contains model directories, copy or symlink them to the HuggingFace cache:

```rust
fn prepopulate_models(app: &AppHandle) -> Result<(), String> {
    let models_dir = match std::env::var("PRIVATEVOICE_MODELS_DIR") {
        Ok(dir) => PathBuf::from(dir),
        Err(_) => return Ok(()), // No models to prepopulate
    };

    if !models_dir.exists() {
        return Ok(());
    }

    // HuggingFace cache: ~/.cache/huggingface/hub/models--Qwen--{name}/snapshots/{hash}/
    let hf_cache = dirs::cache_dir()
        .ok_or("Cannot determine cache directory")?
        .join("huggingface")
        .join("hub");

    for entry in std::fs::read_dir(&models_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            let model_name = entry.file_name().to_string_lossy().to_string();
            let cache_key = format!("models--Qwen--{}", model_name);
            let target = hf_cache.join(&cache_key).join("snapshots").join("offline");

            if !target.exists() {
                std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
                copy_dir_recursive(&entry.path(), &target)?;
                // Write a refs/main pointer so HuggingFace Hub finds it
                let refs_dir = hf_cache.join(&cache_key).join("refs");
                std::fs::create_dir_all(&refs_dir).map_err(|e| e.to_string())?;
                std::fs::write(refs_dir.join("main"), "offline").map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
```

### `validate.rs` — Marker includes offline flag

The `.setup-complete` marker should record whether setup used offline resources:

```json
{
    "version": "1.0.0",
    "gpu_target": "mps",
    "requirements_hash": "abc123...",
    "offline": true,
    "uv_version": "0.6.6",
    "timestamp": "2026-02-11T..."
}
```

---

## Model Bundling Details

### Model IDs and Sizes

| Short ID | HuggingFace Repo | Download Size | Supports |
|----------|-----------------|---------------|----------|
| `0.6b` | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` | ~2.5 GB (repo) / ~1.2 GB (weights) | Custom Voice |
| `0.6b-base` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` | ~2.5 GB (repo) / ~1.2 GB (weights) | Voice Clone |
| `1.7b` | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | ~4.5 GB (repo) / ~3.4 GB (weights) | Custom Voice |
| `1.7b-base` | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | ~4.5 GB (repo) / ~3.4 GB (weights) | Voice Clone |
| `1.7b-design` | `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | ~4.5 GB (repo) / ~3.4 GB (weights) | Voice Design |

### Sensible Defaults

- **0.6b** is the smallest and most commonly used. Good default for "include a model."
- For "all features" offline, include `0.6b` + `0.6b-base` + `1.7b-design` (one per mode, ~7.5 GB).
- `all` bundles all 5 variants (~17.5 GB of model data).

Models are platform-independent — the same weights work on macOS, Windows, and Linux.

---

## File Changes Summary

### New Files

| File | Description |
|------|-------------|
| `scripts/build-portable.sh` | Main portable zip build script (bash) |
| `scripts/build-portable.ps1` | Windows PowerShell equivalent |
| `scripts/download-python-standalone.sh` | Helper: downloads python-build-standalone tarball |

### Modified Files

| File | Changes |
|------|---------|
| `src-tauri/src/env_manager/setup.rs` | Add `find_offline_dir()`, modify `install_python()` and `install_dependencies()` for offline mode, add `prepopulate_models()` |
| `src-tauri/src/env_manager/validate.rs` | Add `offline` field to marker JSON |
| `src-tauri/src/lib.rs` | Pass offline dir to `run_setup()`, call `prepopulate_models()` after setup |

### No New Rust Dependencies

Tarball extraction can use `tar` (Unix) or PowerShell `Expand-Archive` (Windows) via `Command`, avoiding new crate dependencies. If native extraction is preferred later, `flate2` + `tar` crates can be added.

---

## Key Design Decisions

### 1. Wheelhouse approach (not pre-built venv)

**Why not just zip a pre-built venv?**
- Venvs contain hardcoded absolute paths in `pyvenv.cfg` and shebang lines
- Moving a venv to a different machine/path breaks it
- uv's `--find-links` offline install is clean and handles path resolution correctly

**Why not use `uv-pack`?**
- Still alpha-quality (v0.x)
- Adds a third-party build dependency
- The `uv pip wheel` + `--find-links` approach is supported by uv directly

### 2. Python tarball (not pre-installed Python)

**Why bundle the tarball instead of a pre-extracted Python?**
- Tarballs compress better (~20 MB vs ~100 MB extracted)
- `uv` knows how to find/use `python-build-standalone` installations
- Extraction is fast (<5 seconds)
- The tarball filename encodes platform info for validation

### 3. Environment variables for offline path

**Why env vars instead of CLI args?**
- Tauri apps don't straightforwardly pass CLI args to the Rust backend
- Environment variables are set by the launcher script before the app starts
- Also supports auto-detection (check adjacent `offline/` directory) as a fallback
- No Tauri config changes needed

### 4. Models in HuggingFace cache format

**Why copy to HuggingFace cache instead of a custom location?**
- The Python code uses `snapshot_download()` which checks the HF cache first
- If the model is already in cache, no code changes needed on the Python side
- Avoids forking the model loading path

---

## Implementation Order

1. **Build scripts first** (`build-portable.sh` / `.ps1`) — these are standalone and don't touch the app code. Can be tested immediately by running on each platform.
2. **Rust offline detection** — modify `setup.rs` to check for offline dir and use `--find-links`.
3. **Python tarball extraction** — modify `install_python()` to extract from local tarball.
4. **Model pre-population** — add `prepopulate_models()` to Rust, test with bundled models.
5. **Launchers** — generate `launch.sh` / `launch.bat` in the build script.
6. **Testing** — build portable zips on each platform, verify offline first-launch works.

---

## Open Questions

1. **Cross-platform wheel download**: Can `uv pip wheel --python-platform win_amd64` download Windows wheels while running on macOS? If not, each platform's wheelhouse must be built on that platform (or in a Docker container for Linux).

2. **Python standalone tarball versioning**: The `python-build-standalone` release URLs change with each CPython patch version (3.11.9, 3.11.10, etc.). Should we pin an exact release, or find the latest 3.11.x?

3. **Compression format**: `.tar.gz` for macOS/Linux, `.zip` for Windows? Or `.zip` everywhere for simplicity? `.tar.gz` compresses ~10-15% better but Windows users expect `.zip`.

4. **Model partial bundling**: Should we support bundling only the safetensors weights (not config/tokenizer)? The tokenizer files are small (~5 MB) and required, so probably bundle the full repo snapshot.

5. **Faster-whisper models**: Voice Clone mode uses faster-whisper for transcription, which downloads its own CTranslate2 model. Should this also be bundled for full offline support?

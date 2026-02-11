# Agent Handover: Linux Build & Runtime

This document provides everything needed to build and run PrivateVoice on Linux with CPU and NVIDIA GPU (CUDA) support. It covers code changes required, step-by-step build instructions, and known issues.

---

## Table of Contents

1. [Cross-Platform Readiness Summary](#1-cross-platform-readiness-summary)
2. [Required Code Changes](#2-required-code-changes)
3. [Build Strategy: CPU vs CUDA](#3-build-strategy-cpu-vs-cuda)
4. [Development Environment Setup (Ubuntu 22.04+)](#4-development-environment-setup-ubuntu-2204)
5. [Building the Python Sidecar](#5-building-the-python-sidecar)
6. [Building the Tauri Application](#6-building-the-tauri-application)
7. [Production Testing on Linux](#7-production-testing-on-linux)
8. [Known Issues & Workarounds](#8-known-issues--workarounds)
9. [Distribution Formats](#9-distribution-formats)
10. [AMD/Intel GPU Notes](#10-amdintel-gpu-notes)

---

## 1. Cross-Platform Readiness Summary

The codebase is already substantially cross-platform. Here is the current state:

| Component | Status | Notes |
|-----------|--------|-------|
| `python/build_sidecar.sh` | Ready | Detects Linux, generates `x86_64-unknown-linux-gnu` target triple |
| `src-tauri/src/lib.rs` | Ready | Has `cfg!(target_os = "windows")` branches for process management |
| `python/tts_server/device.py` | Ready | CUDA detection via `torch.cuda.is_available()` already works |
| `python/tts_server/transcription.py` | Ready | `_get_device()` returns `"cuda"` when available |
| `python/tts_server.spec` | Ready | Arch detection handles `x86_64` and `aarch64` |
| `src-tauri/tauri.conf.json` | Ready | `"targets": "all"` builds Linux formats; icon PNGs included |
| `python/tts_server/inference.py` | **BROKEN on Linux** | `signal.SIGPIPE` line works but see CUDA-specific issues |
| `python/tts_server/main.py` | **BROKEN on Windows** | `signal.SIGPIPE` crashes; also `SIGTERM` shutdown differs |
| `scripts/build-release.sh` | **macOS only** | Hardcoded to `aarch64-apple-darwin` / `x86_64-apple-darwin` |

---

## 2. Required Code Changes

### 2.1 CRITICAL: Guard `signal.SIGPIPE` for Portability

`SIGPIPE` exists on Linux (this is fine for Linux) but does NOT exist on Windows. Both files set it at module level. Since we're making the codebase cross-platform, this fix is needed now even though it only breaks on Windows.

**File: `python/tts_server/inference.py` line 17**
```python
# BEFORE (crashes on Windows):
signal.signal(signal.SIGPIPE, signal.SIG_IGN)

# AFTER:
if hasattr(signal, 'SIGPIPE'):
    signal.signal(signal.SIGPIPE, signal.SIG_IGN)
```

**File: `python/tts_server/main.py` line 12**
```python
# BEFORE:
signal.signal(signal.SIGPIPE, signal.SIG_IGN)

# AFTER:
if hasattr(signal, 'SIGPIPE'):
    signal.signal(signal.SIGPIPE, signal.SIG_IGN)
```

### 2.2 CRITICAL: Fix shutdown endpoint for cross-platform

**File: `python/tts_server/main.py` line 675**
```python
# BEFORE:
os.kill(os.getpid(), signal.SIGTERM)

# AFTER (cross-platform):
if hasattr(signal, 'SIGTERM'):
    os.kill(os.getpid(), signal.SIGTERM)
else:
    # Windows: SIGTERM is available but os.kill behavior differs
    import sys
    sys.exit(0)
```

Note: `signal.SIGTERM` does exist on both Linux and Windows in Python, but `os.kill()` on Windows only supports `SIGTERM` (mapped to `TerminateProcess`). The current code should work on Linux as-is, but the pattern above is more defensive.

### 2.3 IMPORTANT: Add `multiprocessing.freeze_support()` for PyInstaller

**File: `python/tts_server_entry.py`** — add before any other code:
```python
#!/usr/bin/env python3
import multiprocessing
import sys
import os

if __name__ == "__main__":
    multiprocessing.freeze_support()  # Required on Windows, harmless on Linux

    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))

    from tts_server.main import main
    main()
```

### 2.4 IMPORTANT: Update `scripts/build-release.sh` for Linux

**File: `scripts/build-release.sh` lines 25-30 and 59-76**

Replace the target-triple detection block:
```bash
# Detect platform
ARCH=$(uname -m)
OS=$(uname -s)
EXE_SUFFIX=""

case "$OS" in
    Darwin)
        if [ "$ARCH" = "arm64" ]; then
            TARGET_TRIPLE="aarch64-apple-darwin"
        else
            TARGET_TRIPLE="x86_64-apple-darwin"
        fi
        ;;
    Linux)
        if [ "$ARCH" = "aarch64" ]; then
            TARGET_TRIPLE="aarch64-unknown-linux-gnu"
        else
            TARGET_TRIPLE="x86_64-unknown-linux-gnu"
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        TARGET_TRIPLE="x86_64-pc-windows-msvc"
        EXE_SUFFIX=".exe"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac
```

Replace the app-finding section at the end:
```bash
# Find the built artifacts
case "$OS" in
    Darwin)
        APP_PATH=$(find src-tauri/target/release/bundle -name "*.app" -type d 2>/dev/null | head -1)
        DMG_PATH=$(find src-tauri/target/release/bundle -name "*.dmg" -type f 2>/dev/null | head -1)
        [ -n "$APP_PATH" ] && echo "App bundle: $APP_PATH" && echo "Size: $(du -sh "$APP_PATH" | cut -f1)"
        [ -n "$DMG_PATH" ] && echo "DMG installer: $DMG_PATH" && echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
        echo "To test: open \"$APP_PATH\""
        ;;
    Linux)
        DEB_PATH=$(find src-tauri/target/release/bundle -name "*.deb" -type f 2>/dev/null | head -1)
        APPIMAGE_PATH=$(find src-tauri/target/release/bundle -name "*.AppImage" -type f 2>/dev/null | head -1)
        RPM_PATH=$(find src-tauri/target/release/bundle -name "*.rpm" -type f 2>/dev/null | head -1)
        [ -n "$DEB_PATH" ] && echo "Debian package: $DEB_PATH" && echo "Size: $(du -h "$DEB_PATH" | cut -f1)"
        [ -n "$RPM_PATH" ] && echo "RPM package: $RPM_PATH" && echo "Size: $(du -h "$RPM_PATH" | cut -f1)"
        [ -n "$APPIMAGE_PATH" ] && echo "AppImage: $APPIMAGE_PATH" && echo "Size: $(du -h "$APPIMAGE_PATH" | cut -f1)"
        echo "To test: chmod +x \"$APPIMAGE_PATH\" && \"$APPIMAGE_PATH\""
        ;;
esac
```

### 2.5 NICE-TO-HAVE: Update PyInstaller spec for CUDA awareness

**File: `python/tts_server.spec`** — add CUDA hidden imports and size optimizations:
```python
# Add after existing hiddenimports list:
import torch as _torch

# CUDA-specific hidden imports (only when building with CUDA torch)
if _torch.cuda.is_available() or '+cu' in _torch.__version__:
    hiddenimports += [
        'torch.backends.cuda',
        'torch.backends.cudnn',
    ]

# Size optimization: exclude unused torch subsystems
excludes += [
    'torch._dynamo',
    'torch._inductor',
    'torch.compiler',
    'triton',
    'torch.distributed',
    'torch.testing',
    'torch.utils.tensorboard',
    'torch.profiler',
    'torch.onnx',
]
```

### 2.6 NICE-TO-HAVE: Update descriptions

- `python/tts_server.spec` line 6: Change `"single executable for macOS arm64"` to `"single executable for the current platform"`
- `src-tauri/Cargo.toml` line 4: Change `"Local text-to-speech for Apple Silicon"` to `"PrivateVoice - Local text-to-speech desktop app"`

### 2.7 NVIDIA WebKit workaround in Tauri

When running on Linux with NVIDIA proprietary drivers, the WebKit DMA-BUF renderer can cause black/blank screens. This is not a code change but an environment variable that must be set at launch:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./PrivateVoice
```

Consider adding this to a wrapper `.desktop` file or launcher script for the Linux distribution.

---

## 3. Build Strategy: CPU vs CUDA

### Recommendation: Build Two Separate Sidecar Variants

| Variant | PyTorch Install | Sidecar Size | Target Users |
|---------|----------------|--------------|--------------|
| CPU-only | `pip install torch --index-url https://download.pytorch.org/whl/cpu` | ~300-600 MB | Everyone (universal fallback) |
| CUDA | `pip install torch --index-url https://download.pytorch.org/whl/cu121` | ~3-5 GB | NVIDIA GPU users |

The Tauri app shell itself is identical for both. The only difference is which Python sidecar binary is bundled.

### CUDA Version Selection

- **CUDA 12.1** (`cu121`): Broadest driver compatibility (requires NVIDIA driver >= 530)
- **CUDA 12.4** (`cu124`): Newer, requires driver >= 550
- **CUDA 11.8** (`cu118`): Maximum backward compatibility, requires driver >= 520

Recommendation: **CUDA 12.1** for initial builds.

### User's System Requirement

Users do NOT need the full CUDA Toolkit installed. They only need:
- An NVIDIA GPU with the appropriate driver version
- The driver can be checked with `nvidia-smi`

PyTorch bundles its own CUDA runtime libraries.

---

## 4. Development Environment Setup (Ubuntu 22.04+)

### System Dependencies

```bash
# Tauri 2 build dependencies
sudo apt update
sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    pkg-config

# Python build dependencies
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv

# Audio library dependencies (for soundfile/lameenc)
sudo apt install -y \
    libsndfile1-dev \
    libasound2-dev
```

### For Fedora/RHEL 9+

```bash
sudo dnf group install "C Development Tools and Libraries"
sudo dnf install -y \
    webkit2gtk4.1-devel \
    openssl-devel \
    curl wget file \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    python3 python3-pip python3-devel \
    libsndfile-devel \
    alsa-lib-devel
```

### Rust Toolchain

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
rustup update
```

### Node.js + pnpm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc  # or ~/.zshrc
nvm install --lts
nvm use --lts
corepack enable
```

### NVIDIA CUDA Drivers (for GPU builds)

Only the NVIDIA driver is needed, not the full CUDA Toolkit:

```bash
# Ubuntu: install NVIDIA driver
sudo apt install -y nvidia-driver-535  # or latest available

# Verify
nvidia-smi
```

For specific CUDA toolkit (only if building PyTorch from source):
```bash
# Not typically needed — PyTorch pip wheels include CUDA runtime
# Only install if you specifically need nvcc for custom CUDA kernels
```

### Clone and Setup

```bash
git clone <repo-url> PrivateVoice
cd PrivateVoice
pnpm install
```

### Python Backend Setup

```bash
cd python

# Create venv
python3 -m venv .venv
source .venv/bin/activate

# For CPU-only development:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

# OR for CUDA development:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

cd ..
```

### Run in Development Mode

```bash
pnpm tauri dev
```

The Rust code will detect `debug_assertions` and spawn Python directly from the venv rather than the bundled sidecar.

---

## 5. Building the Python Sidecar

### CPU-Only Sidecar

```bash
cd python

# Fresh venv for clean build
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate

# Install CPU-only PyTorch
pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
pip install pyinstaller

# Build
pyinstaller tts_server.spec

# The build script handles naming and copying:
# Or manually:
# cp dist/tts-server ../src-tauri/binaries/tts-server-x86_64-unknown-linux-gnu
# chmod +x ../src-tauri/binaries/tts-server-x86_64-unknown-linux-gnu
```

Or use the existing build script:
```bash
./build_sidecar.sh
```

### CUDA Sidecar

```bash
cd python

# Fresh venv for CUDA build
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate

# Install CUDA-enabled PyTorch
pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
pip install pyinstaller

# Build
pyinstaller tts_server.spec
```

### Expected Build Output

```
dist/tts-server                              # The sidecar binary
→ copied to src-tauri/binaries/tts-server-x86_64-unknown-linux-gnu
```

### Expected Sizes

| Build | Approximate Size |
|-------|-----------------|
| CPU-only | 300-600 MB |
| CUDA 12.1 | 3-5 GB |

### Verification

```bash
# Test the sidecar binary directly
./src-tauri/binaries/tts-server-x86_64-unknown-linux-gnu

# Should start FastAPI server on port 8765
# Check: curl http://localhost:8765/health
# Check: curl http://localhost:8765/system-info
```

The `/system-info` endpoint will report which device was detected (cpu or cuda).

---

## 6. Building the Tauri Application

### Prerequisites Complete Checklist

- [ ] Rust toolchain installed (`rustc --version`)
- [ ] Node.js LTS installed (`node --version`)
- [ ] pnpm available (`pnpm --version`)
- [ ] System dependencies installed (libwebkit2gtk-4.1-dev, etc.)
- [ ] Sidecar binary built and in `src-tauri/binaries/`

### Build

```bash
cd /path/to/PrivateVoice
pnpm install
pnpm tauri build
```

### Output

Build artifacts appear in `src-tauri/target/release/bundle/`:

```
src-tauri/target/release/bundle/
├── deb/
│   └── private-voice_1.0.0_amd64.deb
├── rpm/
│   └── private-voice-1.0.0-1.x86_64.rpm
└── appimage/
    └── private-voice_1.0.0_amd64.AppImage
```

### Build Specific Formats Only

```bash
pnpm tauri build --bundles deb      # Debian package only
pnpm tauri build --bundles rpm      # RPM only
pnpm tauri build --bundles appimage # AppImage only
```

### Full Release Build (after fixing `scripts/build-release.sh`)

```bash
./scripts/build-release.sh
```

---

## 7. Production Testing on Linux

### Test the Sidecar Binary Standalone

```bash
# Start the server directly
./src-tauri/binaries/tts-server-x86_64-unknown-linux-gnu

# In another terminal:
curl http://localhost:8765/health
# → {"status":"ok","version":"1.0.0"}

curl http://localhost:8765/system-info
# → shows device: "cpu" or "cuda", memory info, etc.
```

### Test Model Loading

```bash
# Load a model (this downloads from HuggingFace on first run)
curl -X POST http://localhost:8765/load-model \
  -H "Content-Type: application/json" \
  -d '{"model_id": "0.6b"}'

# Check status
curl http://localhost:8765/model-status
```

### Test Generation

```bash
# Generate speech
curl -X POST http://localhost:8765/generate/custom-voice \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Linux", "speaker": "serena"}' \
  --output test.wav

# Play it
aplay test.wav  # or: mpv test.wav
```

### Test the Packaged App

```bash
# .deb
sudo dpkg -i src-tauri/target/release/bundle/deb/private-voice_1.0.0_amd64.deb
privatevoice  # or find in application menu

# AppImage
chmod +x src-tauri/target/release/bundle/appimage/private-voice_1.0.0_amd64.AppImage
./private-voice_1.0.0_amd64.AppImage

# With NVIDIA workaround if needed:
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./private-voice_1.0.0_amd64.AppImage
```

---

## 8. Known Issues & Workarounds

### 8.1 NVIDIA Black Screen in WebKit

**Symptom**: App window is blank/black on NVIDIA GPUs with proprietary drivers.

**Cause**: WebKitGTK's DMA-BUF renderer is unreliable with NVIDIA proprietary drivers.

**Fix**: Set environment variable before launching:
```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./PrivateVoice
# Additional options if needed:
# WEBKIT_DISABLE_COMPOSITING_MODE=1
# __NV_DISABLE_EXPLICIT_SYNC=1
```

For packaged apps, this should be set in the `.desktop` file's `Exec` line.

### 8.2 AppImage Build Failures

**Symptom**: `linuxdeploy` crashes during AppImage creation with `std::logic_error` or exit code 127.

**Workaround**: Build `.deb` and `.rpm` instead — these are more reliable:
```bash
pnpm tauri build --bundles deb,rpm
```

### 8.3 glibc Forward Compatibility

**Symptom**: Binary built on Ubuntu 24.04 won't run on Ubuntu 22.04.

**Fix**: Build on the oldest target distro (Ubuntu 22.04 is the practical minimum for Tauri 2).

### 8.4 Strip Errors on Arch Linux

**Symptom**: `Strip call failed` during build.

**Fix**:
```bash
NO_STRIP=true pnpm tauri build
```

### 8.5 Slow WebKit Rendering

**Symptom**: UI is sluggish with WebKitGTK 2.40+.

**Status**: Upstream WebKitGTK issue. No reliable workaround other than downgrading WebKitGTK (impractical).

### 8.6 `lsof` Dependency for Port Cleanup

The Rust code uses `lsof` to kill processes on port 8765. Verify it's installed:
```bash
sudo apt install -y lsof  # Usually pre-installed
```

### 8.7 Large Sidecar + AppImage Size

A CUDA sidecar is 3-5 GB. Combined with the AppImage bundling WebKit libraries, the total AppImage could be 3.5-6 GB. Consider shipping CPU-only for AppImage and providing CUDA sidecar as a separate download.

---

## 9. Distribution Formats

### Debian Package (.deb)

- Auto-declares dependencies on `libwebkit2gtk-4.1-0`, `libgtk-3-0`
- Installs to `/usr/bin/` and `/usr/share/`
- Best for Ubuntu/Debian users
- Most reliable build format

Optional `tauri.conf.json` additions:
```json
{
  "bundle": {
    "linux": {
      "deb": {
        "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"],
        "section": "sound"
      }
    }
  }
}
```

### RPM Package (.rpm)

- For Fedora, openSUSE, RHEL
- Requires `webkit2gtk4.1` package on target system

Optional `tauri.conf.json` additions:
```json
{
  "bundle": {
    "linux": {
      "rpm": {
        "depends": ["webkit2gtk4.1"]
      }
    }
  }
}
```

### AppImage (.AppImage)

- Self-contained, runs on most distros
- Bundles WebKit libraries (~70+ MB overhead)
- Must be built on the oldest target glibc (Ubuntu 22.04)
- Build reliability is lower than .deb/.rpm

### Recommendation

For initial testing: focus on `.deb` packages. They are the most reliable to build and the easiest to test. AppImage can be added later once the core build is validated.

---

## 10. AMD/Intel GPU Notes

This section covers future GPU support beyond NVIDIA CUDA. These are NOT required for the initial Linux build but are documented for planning purposes.

### AMD ROCm

AMD GPUs are supported via ROCm, which presents itself through the `torch.cuda` API. The existing `device.py` code works with ROCm with zero code changes, because ROCm uses `torch.cuda.is_available()`.

**To distinguish ROCm from CUDA** (for attention implementation selection):
```python
# ROCm sets torch.version.hip instead of torch.version.cuda
if torch.cuda.is_available():
    if torch.version.hip:
        # AMD ROCm — use SDPA (safer for consumer RDNA GPUs)
        attn = "sdpa"
    elif torch.version.cuda:
        # NVIDIA CUDA
        capability = torch.cuda.get_device_capability()
        attn = "flash_attention_2" if capability[0] >= 8 else "sdpa"
```

**Supported AMD GPUs for ROCm:**
- Data center: MI100, MI200, MI300 series (fully supported, production-grade)
- Consumer RDNA3: RX 7900 XTX/XT/GRE, RX 7800 XT, RX 7700 XT
- Consumer RDNA4: RX 9070 XT, RX 9070, RX 9060 XT

**Installation:**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm6.4
```

**Known quirks:**
- Some newer GPU architectures need `HSA_OVERRIDE_GFX_VERSION=11.0.0` environment variable
- Flash Attention only reliable on CDNA (data center) GPUs; use SDPA for consumer
- Qwen3-TTS 1.7B has been confirmed working on AMD Strix Halo and RX 7900 XTX

**PyInstaller impact:** Requires a separate ROCm sidecar build from a ROCm venv. Cannot be combined with CUDA build.

### Intel XPU

Intel Arc GPUs are supported via the native `torch.xpu` backend (upstreamed into PyTorch 2.5+).

**Device detection addition for `device.py`:**
```python
# Add after CUDA check, before CPU fallback:
if hasattr(torch, 'xpu') and torch.xpu.is_available():
    return DeviceConfig(
        device="xpu",
        dtype=torch.float16,
        attn_implementation="sdpa",
        device_map="xpu"
    )
```

**Also need in `device.py`:**
```python
def synchronize_device(device: str) -> None:
    if device == "mps":
        torch.mps.synchronize()
    elif device == "cuda":
        torch.cuda.synchronize()
    elif device == "xpu":
        torch.xpu.synchronize()

def clear_cache(device: str) -> None:
    if device == "mps":
        torch.mps.empty_cache()
    elif device == "cuda":
        torch.cuda.empty_cache()
    elif device == "xpu":
        torch.xpu.empty_cache()
```

**Supported Intel GPUs:** Arc A770, A750, A580, A380, B580; Core Ultra integrated Arc graphics.

**Installation:**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/xpu
```

**Status:** Beta/early production. The 0.6B model (8GB) fits on Arc B580 (12GB) and A770 (16GB). The 1.7B model (12GB) is tight on B580 but feasible on A770.

**Intel Extension for PyTorch (IPEX):** Being deprecated in favor of native XPU support. End of maintenance: March 2026.

**PyInstaller impact:** Requires a separate XPU sidecar build. Not yet well-tested with PyInstaller.

---

## 11. Existing CI/CD Gaps

> **Important context**: The current CI (`.github/workflows/ci.yml`) has gaps beyond just being single-OS. These should be addressed in the same pass as adding multi-platform builds.

### Current State of `ci.yml`

The workflow has 4 jobs, all on `ubuntu-latest`:

| Job | What It Does | What's Missing |
|-----|-------------|----------------|
| `lint-and-typecheck` | `pnpm check` | Nothing — this is fine |
| `unit-tests` | `pnpm test:coverage` (216 Vitest tests) | Nothing — this is fine |
| `e2e-tests` | Playwright E2E (90 tests) | Nothing — this is fine |
| `build` | **`pnpm build` only** | Only builds the Vite frontend. Does NOT run `pnpm tauri build` — no Rust compilation is validated in CI |

### Gap 1: No Python Backend Tests in CI

The 78 pytest tests (`python/tests/`) never run in CI. Any backend regression (endpoint changes, inference bugs, API contract breaks) goes undetected until manual testing.

**Fix**: Add a `python-tests` job:
```yaml
python-tests:
  name: Python Backend Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: |
        cd python
        python -m venv .venv
        source .venv/bin/activate
        pip install -r requirements.txt
        pip install pytest
    - name: Run tests
      run: |
        cd python
        source .venv/bin/activate
        python -m pytest tests/ -v
```

### Gap 2: No Tauri/Rust Build Validation

The `build` job runs `pnpm build` (Vite/SvelteKit) but not `pnpm tauri build`. This means Rust compilation errors, Cargo.toml dependency issues, and plugin configuration problems are never caught in CI.

**Fix**: Replace or supplement the `build` job with a Tauri build that installs Linux system dependencies and compiles the Rust layer. This will require `libwebkit2gtk-4.1-dev` and other system packages on the runner. The sidecar binary can be stubbed for CI (touch an empty file with the right name) since the actual PyInstaller build is too slow/large for CI unless you need release artifacts.

### Impact When Expanding to Multi-Platform

These gaps compound when adding Windows and macOS runners:
- Without Python tests, a SIGPIPE fix could regress on one platform silently
- Without Tauri build validation, a Cargo.toml change could break Windows/Linux compilation without anyone knowing until release time

**Recommendation**: Fix both gaps on the existing `ubuntu-latest` runner first, then expand to the multi-OS matrix.

---

## Quick Reference: Complete Build from Scratch

```bash
# 1. System deps (Ubuntu 22.04+)
sudo apt update && sudo apt install -y \
    libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
    pkg-config python3 python3-pip python3-venv libsndfile1-dev lsof

# 2. Rust
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"

# 3. Node.js + pnpm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc && nvm install --lts && corepack enable

# 4. Clone
git clone <repo-url> PrivateVoice && cd PrivateVoice
pnpm install

# 5. Python sidecar (CPU)
cd python
python3 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt && pip install pyinstaller
./build_sidecar.sh
cd ..

# 6. Build Tauri app
pnpm tauri build --bundles deb

# 7. Test
sudo dpkg -i src-tauri/target/release/bundle/deb/*.deb
```

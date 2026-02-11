# Agent Handover: Windows 11 Build & Runtime

This document provides everything needed to build and run PrivateVoice on Windows 11 with CPU and NVIDIA GPU (CUDA) support. It covers code changes required, step-by-step build instructions, and known issues.

---

## Table of Contents

1. [Cross-Platform Readiness Summary](#1-cross-platform-readiness-summary)
2. [Required Code Changes](#2-required-code-changes)
3. [Build Strategy: CPU vs CUDA](#3-build-strategy-cpu-vs-cuda)
4. [Development Environment Setup (Windows 11)](#4-development-environment-setup-windows-11)
5. [Building the Python Sidecar](#5-building-the-python-sidecar)
6. [Building the Tauri Application](#6-building-the-tauri-application)
7. [Production Testing on Windows](#7-production-testing-on-windows)
8. [Known Issues & Workarounds](#8-known-issues--workarounds)
9. [Distribution Formats & Code Signing](#9-distribution-formats--code-signing)
10. [AMD/Intel GPU Notes](#10-amdintel-gpu-notes)

---

## 1. Cross-Platform Readiness Summary

| Component | Status | Notes |
|-----------|--------|-------|
| `python/build_sidecar.sh` | Ready | Handles `MINGW*|MSYS*|CYGWIN*` → `x86_64-pc-windows-msvc` + `.exe` |
| `src-tauri/src/lib.rs` | Ready | `cfg!(target_os = "windows")` for venv path (`.venv\Scripts\python.exe`), `netstat`/`taskkill` for port cleanup |
| `src-tauri/src/main.rs` | Ready | `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` prevents console window |
| `python/tts_server/device.py` | Ready | CUDA detection works on Windows |
| `python/tts_server/transcription.py` | Ready | CUDA device detection works on Windows |
| `python/tts_server.spec` | Ready | Arch detection handles `amd64`; `target_arch` safely ignored on Windows |
| `src-tauri/tauri.conf.json` | Ready | `icon.ico` included; `"targets": "all"` builds NSIS + MSI |
| `python/tts_server/inference.py` | **BROKEN** | `signal.SIGPIPE` does not exist on Windows — crashes on import |
| `python/tts_server/main.py` | **BROKEN** | Same `signal.SIGPIPE` crash; also `SIGTERM` shutdown needs care |
| `python/tts_server_entry.py` | **NEEDS FIX** | Missing `multiprocessing.freeze_support()` — causes infinite spawn loops on Windows |
| `scripts/build-release.sh` | **macOS only** | Bash script needs PowerShell equivalent for native Windows builds |

---

## 2. Required Code Changes

### 2.1 CRITICAL: Guard `signal.SIGPIPE` (crashes on Windows)

Windows does not have `SIGPIPE`. The current code crashes on import.

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

### 2.2 CRITICAL: Add `multiprocessing.freeze_support()` (prevents infinite loops)

On Windows, PyInstaller + multiprocessing causes infinite subprocess spawning if `freeze_support()` is not called before any other imports.

**File: `python/tts_server_entry.py`** — must be the very first thing:
```python
#!/usr/bin/env python3
"""Entry point script for PyInstaller bundle."""

import multiprocessing
import sys
import os

if __name__ == "__main__":
    multiprocessing.freeze_support()  # MUST be first — prevents spawn loops on Windows

    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))

    from tts_server.main import main
    main()
```

### 2.3 IMPORTANT: Fix shutdown endpoint for Windows

**File: `python/tts_server/main.py` — shutdown function (line ~675)**

`os.kill()` on Windows only supports `SIGTERM` (mapped to `TerminateProcess`) and the semantics differ from Unix. The current code works but consider this more robust approach:

```python
@app.post("/shutdown")
async def shutdown():
    """Graceful shutdown."""
    model = get_model()
    if model.is_loaded:
        model.unload()
    whisper = get_whisper_model()
    if whisper.is_loaded:
        whisper.unload()

    logger.info("Shutdown requested")
    # Cross-platform shutdown
    if sys.platform == 'win32':
        os.kill(os.getpid(), signal.SIGTERM)
    else:
        os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting down"}
```

Note: The current code actually works on Windows since Python maps `signal.SIGTERM` to `TerminateProcess`. No code change strictly needed here, but the SIGPIPE fix is mandatory.

### 2.4 IMPORTANT: Create `build_sidecar.ps1` for Native Windows Builds

The existing `build_sidecar.sh` can run under Git Bash, but a native PowerShell script is better for Windows developers:

**New file: `python/build_sidecar.ps1`**
```powershell
# Build the TTS server as a sidecar binary for Tauri (Windows)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BinariesDir = Join-Path $ProjectRoot "src-tauri" "binaries"

Write-Host "=== Building TTS Server Sidecar (Windows) ==="
Write-Host "Script dir: $ScriptDir"
Write-Host "Project root: $ProjectRoot"
Write-Host "Output dir: $BinariesDir"

Set-Location $ScriptDir

# Create binaries directory
New-Item -ItemType Directory -Force -Path $BinariesDir | Out-Null

# Create virtual environment if needed
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv .venv
}

# Activate virtual environment
& .venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

# Clean previous builds
Write-Host "Cleaning previous builds..."
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }

# Run PyInstaller
Write-Host "Running PyInstaller..."
pyinstaller tts_server.spec

# Determine target triple
$TargetTriple = "x86_64-pc-windows-msvc"
$SidecarName = "tts-server-$TargetTriple.exe"
$BuiltBinary = "dist\tts-server.exe"

Write-Host "Copying binary as $SidecarName..."
Copy-Item $BuiltBinary (Join-Path $BinariesDir $SidecarName)
Copy-Item $BuiltBinary (Join-Path $ProjectRoot "src-tauri" $SidecarName)

$Size = (Get-Item (Join-Path $BinariesDir $SidecarName)).Length / 1MB
Write-Host ""
Write-Host "=== Build Complete ==="
Write-Host "Sidecar binary: $BinariesDir\$SidecarName"
Write-Host "Size: $([math]::Round($Size, 1)) MB"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Test the binary: $BinariesDir\$SidecarName"
Write-Host "  2. Build Tauri app: pnpm tauri build"
```

### 2.5 NICE-TO-HAVE: Update `scripts/build-release.sh` for Windows

The shell script approach works via Git Bash. If you want Windows-native, create `scripts/build-release.ps1`:

```powershell
# Full release build for PrivateVoice (Windows)
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=============================================="
Write-Host "  PrivateVoice Release Build (Windows)"
Write-Host "=============================================="
Write-Host "Project root: $ProjectRoot"

Set-Location $ProjectRoot

# Step 1: Build Python sidecar
Write-Host "`n=== Step 1/3: Building Python Sidecar ==="
& python\build_sidecar.ps1

# Verify sidecar
$SidecarPath = "src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $SidecarPath)) {
    Write-Error "Sidecar binary not found at $SidecarPath"
    exit 1
}

# Step 2: Frontend dependencies
Write-Host "`n=== Step 2/3: Installing Frontend Dependencies ==="
pnpm install

# Step 3: Build Tauri app
Write-Host "`n=== Step 3/3: Building Tauri Application ==="
pnpm tauri build

Write-Host "`n=============================================="
Write-Host "  Build Complete!"
Write-Host "=============================================="

# Find outputs
$NsisPath = Get-ChildItem "src-tauri\target\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$MsiPath = Get-ChildItem "src-tauri\target\release\bundle\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($NsisPath) {
    $Size = [math]::Round($NsisPath.Length / 1MB, 1)
    Write-Host "NSIS installer: $($NsisPath.FullName) ($Size MB)"
}
if ($MsiPath) {
    $Size = [math]::Round($MsiPath.Length / 1MB, 1)
    Write-Host "MSI installer: $($MsiPath.FullName) ($Size MB)"
}
```

### 2.6 NICE-TO-HAVE: Update PyInstaller spec for CUDA + Windows

**File: `python/tts_server.spec`** — same changes as Linux handover:
```python
# Add CUDA hidden imports and Windows multiprocessing
import platform as _platform

if _platform.system() == 'Windows':
    hiddenimports += [
        'multiprocessing.popen_spawn_win32',
    ]

# CUDA-specific (if building with CUDA torch)
import torch as _torch
if _torch.cuda.is_available() or '+cu' in _torch.__version__:
    hiddenimports += [
        'torch.backends.cuda',
        'torch.backends.cudnn',
    ]

# Size optimization excludes
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

### 2.7 NICE-TO-HAVE: Update descriptions

- `python/tts_server.spec` line 6: Change `"single executable for macOS arm64"` to `"single executable for the current platform"`
- `src-tauri/Cargo.toml` line 4: Change `"Local text-to-speech for Apple Silicon"` to `"PrivateVoice - Local text-to-speech desktop app"`

---

## 3. Build Strategy: CPU vs CUDA

### Recommendation: Two Separate Sidecar Variants

| Variant | PyTorch Install | Sidecar Size | Target Users |
|---------|----------------|--------------|--------------|
| CPU-only | `pip install torch --index-url https://download.pytorch.org/whl/cpu` | ~300-600 MB | Everyone |
| CUDA | `pip install torch --index-url https://download.pytorch.org/whl/cu121` | ~3-5 GB | NVIDIA GPU users |

### CUDA Version Selection

- **CUDA 12.1** (`cu121`): Recommended — broadest driver compatibility (requires NVIDIA driver >= 530)
- **CUDA 12.4** (`cu124`): Newer, requires driver >= 550
- **CUDA 11.8** (`cu118`): Maximum backward compatibility, requires driver >= 520

### Important: `--onefile` vs `--onedir` on Windows

The current PyInstaller spec builds a single-file executable (`--onefile` mode). On Windows with CUDA:

- **`--onefile` + multiprocessing** can cause recursive spawn loops
- **`--onefile` with CUDA** means 3-5 GB extracted to a temp directory on every launch (30+ second startup)
- **`--onedir` is strongly recommended** for CUDA builds on Windows

To switch to `--onedir`, modify the spec file's `EXE()` section to not include `a.binaries`, `a.zipfiles`, `a.datas` in EXE, and instead use a `COLLECT()`:

```python
# For --onedir mode:
exe = EXE(
    pyz, a.scripts, [],
    name='tts-server',
    debug=False,
    strip=False,
    upx=False,
    console=True,
)
coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    name='tts-server',
)
```

For `--onedir` with Tauri, you would bundle the entire output directory and adjust the sidecar reference. However, this adds complexity. For initial testing, `--onefile` with CPU-only builds works fine. Address `--onedir` when CUDA support is prioritized.

### User System Requirements

Users do NOT need the CUDA Toolkit. They only need:
- NVIDIA GPU with compatible driver (`nvidia-smi` to verify)
- Windows 11 (WebView2 pre-installed)

---

## 4. Development Environment Setup (Windows 11)

### Step 1: Install Visual Studio Build Tools 2022

1. Download from https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Run the installer
3. Select **"Desktop development with C++"** workload
4. Ensure **MSVC v143** and **Windows 10/11 SDK** are checked
5. Install

### Step 2: Install Rust

```powershell
# Download and run rustup-init.exe from https://rustup.rs
# During installation, ensure default target is x86_64-pc-windows-msvc

# After installation, verify:
rustup default stable-x86_64-pc-windows-msvc
rustup update
rustc --version
cargo --version
```

### Step 3: Install Node.js LTS

```powershell
# Option A: Download from https://nodejs.org (recommended)
# Option B: winget
winget install OpenJS.NodeJS.LTS
```

### Step 4: Enable pnpm

```powershell
corepack enable
# Verify:
pnpm --version
```

### Step 5: Install Python 3.11+

```powershell
# Option A: Download from https://www.python.org
# IMPORTANT: Check "Add Python to PATH" during installation

# Option B: winget
winget install Python.Python.3.12

# Verify:
python --version
```

### Step 6: Install Git (includes Git Bash)

```powershell
winget install Git.Git
```

### Step 7: NVIDIA GPU Driver (for CUDA builds)

1. Download latest Game Ready or Studio driver from https://www.nvidia.com/drivers
2. Install
3. Verify: `nvidia-smi` in PowerShell

### Step 8: Clone and Setup

```powershell
git clone <repo-url> PrivateVoice
cd PrivateVoice
pnpm install
```

### Step 9: Python Backend Setup

```powershell
cd python

# Create venv
python -m venv .venv
.venv\Scripts\Activate.ps1

# For CPU-only development:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

# OR for CUDA development:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

cd ..
```

### Step 10: Run in Development Mode

```powershell
pnpm tauri dev
```

The Rust code detects `debug_assertions` and uses `.venv\Scripts\python.exe` on Windows (line 192 of `lib.rs`) with fallback to system `python` (not `python3`, which doesn't exist on Windows — line 196).

---

## 5. Building the Python Sidecar

### Using PowerShell (Native Windows)

After creating `python/build_sidecar.ps1` (see section 2.4):

```powershell
cd python
.\build_sidecar.ps1
```

### Using Git Bash (Existing Script)

```bash
# In Git Bash:
cd python
./build_sidecar.sh
```

### Manual Build

```powershell
cd python
.venv\Scripts\Activate.ps1

# Clean
Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue

# Build
pyinstaller tts_server.spec

# Copy with correct name
Copy-Item dist\tts-server.exe ..\src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe
```

### CPU-Only Build (Clean Venv)

```powershell
cd python
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
python -m venv .venv
.venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
pip install pyinstaller

pyinstaller tts_server.spec
Copy-Item dist\tts-server.exe ..\src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe
```

### CUDA Build (Clean Venv)

```powershell
cd python
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
python -m venv .venv
.venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
pip install pyinstaller

pyinstaller tts_server.spec
Copy-Item dist\tts-server.exe ..\src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe
```

### Expected Sizes

| Build | Approximate Size |
|-------|-----------------|
| CPU-only | 300-600 MB |
| CUDA 12.1 | 3-5 GB |

### Verification

```powershell
# Test the sidecar directly
& src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe

# In another terminal:
Invoke-RestMethod http://localhost:8765/health
# → @{status=ok; version=1.0.0}

Invoke-RestMethod http://localhost:8765/system-info
# → Shows device (cpu or cuda), memory info, etc.
```

---

## 6. Building the Tauri Application

### Prerequisites Checklist

- [ ] Visual Studio Build Tools 2022 with C++ workload
- [ ] Rust toolchain (`rustc --version` — target `x86_64-pc-windows-msvc`)
- [ ] Node.js LTS (`node --version`)
- [ ] pnpm (`pnpm --version`)
- [ ] Sidecar binary in `src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe`

### Build

```powershell
cd PrivateVoice
pnpm install
pnpm tauri build
```

### Output

Build artifacts appear in `src-tauri\target\release\bundle\`:

```
src-tauri\target\release\bundle\
├── nsis\
│   └── PrivateVoice_1.0.0_x64-setup.exe
└── msi\
    └── PrivateVoice_1.0.0_x64_en-US.msi
```

### Build Specific Format

```powershell
pnpm tauri build --bundles nsis   # NSIS installer only (recommended)
pnpm tauri build --bundles msi    # MSI only
```

### Full Release Build (PowerShell)

After creating `scripts/build-release.ps1`:
```powershell
.\scripts\build-release.ps1
```

---

## 7. Production Testing on Windows

### Test Sidecar Standalone

```powershell
# Start server
& src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe

# In another terminal:
Invoke-RestMethod http://localhost:8765/health
Invoke-RestMethod http://localhost:8765/system-info
```

### Test Model Loading

```powershell
$body = @{ model_id = "0.6b" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri http://localhost:8765/load-model `
    -ContentType "application/json" -Body $body

Invoke-RestMethod http://localhost:8765/model-status
```

### Test Generation

```powershell
$body = @{
    text = "Hello from Windows"
    speaker = "serena"
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri http://localhost:8765/generate/custom-voice `
    -ContentType "application/json" -Body $body `
    -OutFile test.wav

# Play it
Start-Process test.wav
```

### Test Installed App

```powershell
# Run the NSIS installer
& src-tauri\target\release\bundle\nsis\PrivateVoice_1.0.0_x64-setup.exe

# App should appear in Start Menu as "PrivateVoice"
```

---

## 8. Known Issues & Workarounds

### 8.1 SmartScreen Warning (No Code Signing)

**Symptom**: "Windows protected your PC" dialog when running the installer or app.

**Cause**: App is not code-signed.

**User workaround**: Click "More info" → "Run anyway"

**Proper fix**: Sign with an OV or EV code signing certificate (see section 9).

### 8.2 PyInstaller `--onefile` Slow Startup with CUDA

**Symptom**: 30-60 second delay on first launch of the sidecar binary.

**Cause**: `--onefile` extracts the entire bundle (3-5 GB for CUDA) to a temp directory on each launch.

**Fix**: Switch to `--onedir` mode for CUDA builds (see section 3).

**Partial fix**: Set `runtime_tmpdir` in the spec to avoid re-extraction:
```python
exe = EXE(
    ...
    runtime_tmpdir=os.path.join(os.environ.get('LOCALAPPDATA', ''), 'PrivateVoice', 'sidecar'),
)
```

### 8.3 Multiprocessing Spawn Loops

**Symptom**: Running the sidecar spawns infinite copies of itself.

**Cause**: Missing `multiprocessing.freeze_support()` in `tts_server_entry.py`.

**Fix**: Add `multiprocessing.freeze_support()` as the first call in `__main__` (see section 2.2).

### 8.4 Port 8765 Already in Use

**Symptom**: "Address already in use" error on startup.

**Cause**: Previous instance didn't clean up.

**The Rust code handles this**: `kill_process_on_port()` in `lib.rs` uses `netstat -ano` + `taskkill /F /PID` on Windows (lines 97-117).

**Manual fix**:
```powershell
netstat -ano | findstr :8765
taskkill /F /PID <pid>
```

### 8.5 WebView2 Issues

WebView2 is pre-installed on Windows 11 and should work without issues. If the app shows a blank window:

1. Verify WebView2 is installed: Settings → Apps → Installed Apps → search "WebView2"
2. Try setting: `$env:WEBVIEW2_USER_DATA_FOLDER = "$env:LOCALAPPDATA\PrivateVoice\WebView2"`

### 8.6 Path Length Limit (260 chars)

**Symptom**: Errors like "The filename or extension is too long" during PyInstaller extraction.

**Fix**: Either enable long paths in Windows:
```powershell
# Run as Administrator:
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
```

Or set a short `runtime_tmpdir` in the spec file.

### 8.7 Windows Defender False Positives

**Symptom**: Windows Defender flags the PyInstaller-bundled exe as malware.

**Cause**: PyInstaller bundles are commonly flagged due to their extraction behavior.

**Fix**: Code signing largely eliminates this. As a workaround, add exclusion:
```powershell
Add-MpExclusion -Path "C:\path\to\PrivateVoice"
```

### 8.8 `lameenc` Build Issues

**Symptom**: `pip install lameenc` fails with build errors.

**Fix**: `lameenc` provides pre-built Windows wheels. Ensure pip is up to date:
```powershell
pip install --upgrade pip
pip install lameenc
```

If wheels are unavailable, install the LAME development libraries or use a different MP3 encoder.

### 8.9 `faster-whisper` / CTranslate2 on Windows

CTranslate2 provides Windows wheels. If issues arise:
```powershell
pip install ctranslate2 --force-reinstall
pip install faster-whisper
```

---

## 9. Distribution Formats & Code Signing

### NSIS Installer (.exe) — Recommended

NSIS produces a modern `PrivateVoice_1.0.0_x64-setup.exe`. It is the recommended format.

Optional `tauri.conf.json` additions:
```json
{
  "bundle": {
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "languages": ["English"],
        "displayLanguageSelector": false,
        "startMenuFolder": "PrivateVoice"
      }
    }
  }
}
```

Install modes:
- `"currentUser"`: Installs to `%LOCALAPPDATA%`, no admin required
- `"perMachine"`: Installs to `Program Files`, requires admin
- `"both"`: User chooses at install time (always shows UAC prompt)

### MSI Installer (.msi)

Enterprise-friendly format for Group Policy deployment.

Requirements:
- VBSCRIPT Windows feature must be enabled (usually is by default)
- Can only be built on Windows (WiX is Windows-only)
- Does NOT support ARM64

```json
{
  "bundle": {
    "windows": {
      "wix": {
        "language": ["en-US"]
      }
    }
  }
}
```

### Code Signing

Without code signing, SmartScreen blocks downloads and Windows Defender may flag the app.

| Certificate Type | SmartScreen Behavior | Cost |
|-----------------|---------------------|------|
| None | Warning every time | Free |
| OV (Organization Validation) | Warning initially, builds reputation | ~$70-200/year |
| EV (Extended Validation) | Immediate trust | ~$400+/year |

**Since June 2023**: All new code signing certs require hardware-based key storage (HSM). PFX-file signing is legacy only.

**Recommended approach for initial builds**: Skip code signing. Users can bypass SmartScreen. Add signing when preparing for public distribution.

**Signing methods in Tauri 2**:
```json
{
  "bundle": {
    "windows": {
      "signCommand": "AzureSignTool sign -kvu <vault-url> -kvi <client-id> %1"
    }
  }
}
```

Options: Azure Trusted Signing (~$10/month), SSL.com CodeSignTool, DigiCert SmartSign.

---

## 10. AMD/Intel GPU Notes

### AMD GPUs on Windows

**ROCm on Windows**: AMD has released ROCm-enabled PyTorch wheels for Windows, but it is a **preview release** (not production-grade as of early 2026).

- Supports: Radeon RX 7000 and 9000 series, Ryzen AI 300/AI Max APUs
- Requires: AMD graphics driver 26.1.1+, Python 3.12
- Status: Performance still improving, not recommended for production distribution

**DirectML**: Microsoft's DirectML (`pip install torch-directml`) works on any DirectX 12 GPU but is now in **maintenance mode** — no new features planned. Not recommended for new projects.

**Current recommendation for AMD on Windows**: CPU fallback. ROCm Windows support is not mature enough for bundled distribution.

### Intel GPUs on Windows

**Intel XPU backend**: Native PyTorch XPU support (PyTorch 2.5+) works on Windows with Intel Arc GPUs.

- Requires: Intel GPU drivers and oneAPI dependencies
- Works with: Arc A770, A750, B580, Core Ultra integrated graphics
- Performance: Arc B580 achieves 15-20 tokens/sec on 7B models

**Installation:**
```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/xpu
```

**IPEX (Intel Extension for PyTorch)**: Being deprecated. End of maintenance: March 2026. Use native XPU instead.

**Device detection addition for `device.py`:**
```python
# After CUDA check, before CPU fallback:
if hasattr(torch, 'xpu') and torch.xpu.is_available():
    return DeviceConfig(
        device="xpu",
        dtype=torch.float16,
        attn_implementation="sdpa",
        device_map="xpu"
    )
```

Also add to `synchronize_device()` and `clear_cache()`:
```python
elif device == "xpu":
    torch.xpu.synchronize()  # in synchronize_device
    torch.xpu.empty_cache()  # in clear_cache
```

**Current recommendation for Intel on Windows**: Experimental only. CPU fallback is safer for distribution.

### Summary: GPU Priority for Windows

1. **NVIDIA CUDA** — Production-ready, primary target
2. **CPU** — Universal fallback, always works
3. **AMD ROCm** — Future support, preview-quality on Windows
4. **Intel XPU** — Future support, beta-quality
5. **DirectML** — Deprecated, avoid for new work

---

## Quick Reference: Complete Build from Scratch (PowerShell)

```powershell
# 1. Install prerequisites (manual steps):
#    - Visual Studio Build Tools 2022 (Desktop C++ workload)
#    - Rust via https://rustup.rs
#    - Node.js LTS via https://nodejs.org
#    - Python 3.12 via https://www.python.org
#    - Git via https://git-scm.com

# 2. Setup tooling
corepack enable

# 3. Clone
git clone <repo-url> PrivateVoice
cd PrivateVoice
pnpm install

# 4. Python sidecar (CPU)
cd python
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
pip install pyinstaller
pyinstaller tts_server.spec
Copy-Item dist\tts-server.exe ..\src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe
cd ..

# 5. Build Tauri app
pnpm tauri build --bundles nsis

# 6. Test
& src-tauri\target\release\bundle\nsis\PrivateVoice_1.0.0_x64-setup.exe
```

---

## Appendix: Build on This Machine vs Target Machine

### Option A: Build on Target Windows Machine

**Pros**: Simplest approach; no cross-compilation needed; can test immediately.
**Cons**: Requires full dev environment on Windows; slower iteration.

**Recommended for**: Initial bring-up and testing.

### Option B: Build Sidecar on Target, Ship to Build Machine

Build the Python sidecar on Windows (since PyInstaller can't cross-compile), then transfer the `.exe` to a CI/build machine for the Tauri build.

**Workflow**:
1. On Windows: Build `tts-server-x86_64-pc-windows-msvc.exe`
2. Transfer to CI/build system
3. Place in `src-tauri/binaries/`
4. Build Tauri app (on Windows — Tauri also can't cross-compile the Rust portion for Windows)

**Note**: The Tauri Rust build must also be done on Windows (you can't cross-compile a Windows Tauri app from Linux/macOS due to MSVC/WebView2 dependencies).

### Option C: GitHub Actions CI

Use a Windows runner for automated builds:

```yaml
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - uses: dtolnay/rust-toolchain@stable
      - run: corepack enable && pnpm install
      - run: |
          cd python
          python -m venv .venv
          .venv\Scripts\Activate.ps1
          pip install torch --index-url https://download.pytorch.org/whl/cpu
          pip install -r requirements.txt
          pip install pyinstaller
          pyinstaller tts_server.spec
          Copy-Item dist\tts-server.exe ..\src-tauri\binaries\tts-server-x86_64-pc-windows-msvc.exe
      - run: pnpm tauri build --bundles nsis
      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: src-tauri/target/release/bundle/nsis/*.exe
```

**Recommended approach**: Start with Option A (build directly on the Windows test machine) for initial validation, then set up CI (Option C) once the build is working.

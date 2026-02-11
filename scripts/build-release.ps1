# Full release build for PrivateVoice on Windows
# This script builds the sidecar and then the Tauri app
#
# Usage:
#   .\scripts\build-release.ps1                    # Build with whatever torch is installed
#   .\scripts\build-release.ps1 -CudaVersion cu124 # Reinstall torch with CUDA 12.4 first
#   .\scripts\build-release.ps1 -CpuOnly           # Reinstall torch CPU-only first
#   .\scripts\build-release.ps1 -SkipSidecar       # Skip sidecar build (if already built)
#   .\scripts\build-release.ps1 -Bundle msi          # Use MSI instead of NSIS (admin-only, no install mode choice)

param(
    [string]$CudaVersion = "",    # e.g. "cu124", "cu121" — installs torch from CUDA index
    [switch]$CpuOnly,             # Install CPU-only torch
    [switch]$SkipSidecar,         # Skip sidecar build step
    [string]$Bundle = "nsis",      # Installer format: "nsis" (default, per-user/per-machine choice) or "msi"
    [string]$PythonPath = ""      # Custom Python path (auto-detected if empty)
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PythonDir = Join-Path $ProjectRoot "python"
$SidecarDir = Join-Path (Join-Path (Join-Path $ProjectRoot "src-tauri") "sidecar") "tts-server"
$VenvDir = Join-Path $PythonDir ".venv"
$VenvPython = Join-Path (Join-Path $VenvDir "Scripts") "python.exe"
$VenvPip = Join-Path (Join-Path $VenvDir "Scripts") "pip.exe"

Write-Host "=============================================="
Write-Host "  PrivateVoice Release Build (Windows)"
Write-Host "=============================================="
Write-Host ""
Write-Host "Project root: $ProjectRoot"
Write-Host "Bundle format: $Bundle"
Write-Host ""

# -------------------------------------------------------
# Step 0: Find Python
# -------------------------------------------------------
if ($PythonPath -and (Test-Path $PythonPath)) {
    $Python = $PythonPath
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $Python = "python"
} else {
    # Common install locations
    $SearchPaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe"
    )
    $Python = $SearchPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $Python) {
        Write-Error "Python not found. Install Python 3.10+ or pass -PythonPath"
        exit 1
    }
}
Write-Host "Using Python: $Python"
& $Python --version

# -------------------------------------------------------
# Step 1: Build Python sidecar (unless -SkipSidecar)
# -------------------------------------------------------
if (-not $SkipSidecar) {
    Write-Host ""
    Write-Host "=== Step 1/3: Building Python Sidecar ==="
    Write-Host ""

    Set-Location $PythonDir

    # Create venv if needed
    if (-not (Test-Path $VenvDir)) {
        Write-Host "Creating virtual environment..."
        & $Python -m venv $VenvDir
    }

    # Upgrade pip (must use python -m pip, not pip.exe directly)
    Write-Host "Upgrading pip..."
    & $VenvPython -m pip install --upgrade pip 2>&1 | Out-Null

    # Install all dependencies from requirements.txt first
    # (This may install CPU-only torch from default PyPI — that's OK, we override below)
    Write-Host "Installing dependencies from requirements.txt..."
    & $VenvPython -m pip install -r requirements.txt 2>&1 | Out-Null
    & $VenvPython -m pip install pyinstaller 2>&1 | Out-Null

    # Override torch AFTER requirements.txt to ensure the correct variant wins.
    # requirements.txt has torch>=2.1.0 which pulls CPU-only from PyPI — we must
    # force-reinstall from the correct index to get CUDA or explicitly CPU builds.
    if ($CpuOnly) {
        Write-Host "Installing CPU-only torch (from pytorch.org)..."
        & $VenvPython -m pip install --force-reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    } elseif ($CudaVersion) {
        Write-Host "Installing torch with CUDA $CudaVersion..."
        & $VenvPython -m pip install --force-reinstall torch torchaudio --index-url "https://download.pytorch.org/whl/$CudaVersion"
    }

    # Verify torch installation
    $TorchInfo = & $VenvPython -c "import torch; print(f'torch {torch.__version__}, CUDA: {torch.cuda.is_available()}')" 2>&1
    Write-Host "Torch: $TorchInfo"

    # Clean previous PyInstaller builds
    Write-Host "Cleaning previous builds..."
    if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
    if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }

    # Run PyInstaller
    Write-Host "Running PyInstaller (this takes several minutes)..."
    & "$VenvDir\Scripts\pyinstaller.exe" tts_server.spec
    if ($LASTEXITCODE -ne 0) {
        Write-Error "PyInstaller build failed"
        exit 1
    }

    # Copy --onedir output to Tauri staging directory
    $BuiltDir = Join-Path (Join-Path $PythonDir "dist") "tts-server"
    $BuiltExe = Join-Path $BuiltDir "tts-server.exe"

    if (-not (Test-Path $BuiltExe)) {
        Write-Error "Build failed: $BuiltExe not found"
        exit 1
    }

    Write-Host "Copying --onedir output to $SidecarDir..."
    if (Test-Path $SidecarDir) { Remove-Item -Recurse -Force $SidecarDir }
    New-Item -ItemType Directory -Force -Path (Split-Path $SidecarDir) | Out-Null
    Copy-Item -Recurse $BuiltDir $SidecarDir

    $FileCount = (Get-ChildItem $SidecarDir -Recurse -File).Count
    $SizeGB = [math]::Round((Get-ChildItem $SidecarDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1GB, 2)
    Write-Host "Sidecar: $FileCount files, $SizeGB GB"

    # Warn about installer size limits
    if ($SizeGB -gt 1.5) {
        Write-Host ""
        if ($Bundle -eq "nsis") {
            Write-Host "WARNING: Sidecar is $SizeGB GB. NSIS fails for bundles > ~2 GB." -ForegroundColor Yellow
            Write-Host "Consider using -Bundle msi instead." -ForegroundColor Yellow
        }
        if ($SizeGB -gt 3.0) {
            Write-Host "WARNING: Sidecar is $SizeGB GB. Both NSIS and MSI may fail with >3 GB payloads." -ForegroundColor Yellow
            Write-Host "Consider building with -CpuOnly for a smaller (~1 GB) installer." -ForegroundColor Yellow
        }
        Write-Host ""
    }
} else {
    Write-Host ""
    Write-Host "=== Step 1/3: Skipping sidecar build (-SkipSidecar) ==="
    if (-not (Test-Path (Join-Path $SidecarDir "tts-server.exe"))) {
        Write-Error "Sidecar not found at $SidecarDir. Run without -SkipSidecar first."
        exit 1
    }
    Write-Host "Using existing sidecar at $SidecarDir"
}

# -------------------------------------------------------
# Step 2: Install frontend dependencies
# -------------------------------------------------------
Write-Host ""
Write-Host "=== Step 2/3: Installing Frontend Dependencies ==="
Write-Host ""
Set-Location $ProjectRoot
pnpm install

# -------------------------------------------------------
# Step 3: Build Tauri app
# -------------------------------------------------------
Write-Host ""
Write-Host "=== Step 3/3: Building Tauri Application ==="
Write-Host ""

# Resources config must be injected at build time (not in base tauri.conf.json,
# which would break cargo check when sidecar dir doesn't exist).
# Write to a temp file to avoid PowerShell quote-stripping issues with JSON on CLI.
$TempConfig = Join-Path (Join-Path $ProjectRoot "src-tauri") ".build-resources.json"
Set-Content -Path $TempConfig -Value '{"bundle":{"resources":["sidecar/tts-server/**/*"]}}'

pnpm tauri build --bundles $Bundle --config $TempConfig

# Clean up temp config
Remove-Item -Path $TempConfig -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed"
    exit 1
}

# -------------------------------------------------------
# Done — show results
# -------------------------------------------------------
Write-Host ""
Write-Host "=============================================="
Write-Host "  Build Complete!"
Write-Host "=============================================="
Write-Host ""

$BundleDir = Join-Path (Join-Path (Join-Path (Join-Path $ProjectRoot "src-tauri") "target") "release") "bundle"

if ($Bundle -eq "nsis") {
    $Installer = Get-ChildItem -Path (Join-Path $BundleDir "nsis") -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Installer) {
        $SizeMB = [math]::Round($Installer.Length / 1MB, 1)
        Write-Host "NSIS installer: $($Installer.FullName)"
        Write-Host "Size: $SizeMB MB"
    }
} else {
    $Installer = Get-ChildItem -Path (Join-Path $BundleDir "msi") -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Installer) {
        $SizeMB = [math]::Round($Installer.Length / 1MB, 1)
        Write-Host "MSI installer: $($Installer.FullName)"
        Write-Host "Size: $SizeMB MB"
    }
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run the installer"
Write-Host "  2. Launch PrivateVoice"
Write-Host "  3. Verify sidecar starts (check localhost:8765/health)"
Write-Host "  4. Test TTS generation"

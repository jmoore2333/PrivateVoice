# Full release build for PrivateVoice — deferred dependency installer
#
# No longer builds a PyInstaller sidecar. Instead, bundles:
#   - uv binary (Python package manager)
#   - tts_server/ Python source
#   - requirements.txt
#
# On first launch, the app uses uv to install Python + dependencies
# into the user's app data directory (no admin required).
#
# Usage:
#   .\scripts\build-release.ps1                  # Default NSIS build
#   .\scripts\build-release.ps1 -Bundle msi      # MSI instead of NSIS

param(
    [string]$Bundle = "nsis"     # Installer format: "nsis" (default) or "msi"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ResourcesDir = Join-Path (Join-Path $ProjectRoot "src-tauri") "resources"

Write-Host "=============================================="
Write-Host "  PrivateVoice Release Build (Windows)"
Write-Host "  (Deferred Dependency Installer)"
Write-Host "=============================================="
Write-Host ""
Write-Host "Project root: $ProjectRoot"
Write-Host "Bundle format: $Bundle"
Write-Host ""

# -------------------------------------------------------
# Step 1: Download uv binary
# -------------------------------------------------------
Write-Host "=== Step 1/4: Downloading uv Package Manager ==="
Write-Host ""
& "$ScriptDir\download-uv.ps1"
Write-Host ""

# -------------------------------------------------------
# Step 2: Stage Python source in resources
# -------------------------------------------------------
Write-Host "=== Step 2/4: Staging Python Source ==="
Write-Host ""

if (-not (Test-Path $ResourcesDir)) {
    New-Item -ItemType Directory -Path $ResourcesDir -Force | Out-Null
}

# Copy tts_server source
$TtsServerSrc = Join-Path $ProjectRoot "python" | Join-Path -ChildPath "tts_server"
$TtsServerDst = Join-Path $ResourcesDir "tts_server"

if (Test-Path $TtsServerSrc) {
    if (Test-Path $TtsServerDst) { Remove-Item -Recurse -Force $TtsServerDst }
    Copy-Item -Recurse $TtsServerSrc $TtsServerDst
    $FileCount = (Get-ChildItem $TtsServerDst -Recurse -File).Count
    Write-Host "Copied tts_server/ ($FileCount files)"
} else {
    Write-Error "python/tts_server/ not found"
    exit 1
}

# Copy requirements.txt
$ReqSrc = Join-Path $ProjectRoot "python" | Join-Path -ChildPath "requirements.txt"
$ReqDst = Join-Path $ResourcesDir "requirements.txt"

if (Test-Path $ReqSrc) {
    Copy-Item $ReqSrc $ReqDst
    Write-Host "Copied requirements.txt"
} else {
    Write-Error "python/requirements.txt not found"
    exit 1
}

Write-Host ""

# -------------------------------------------------------
# Step 3: Install frontend dependencies
# -------------------------------------------------------
Write-Host "=== Step 3/4: Installing Frontend Dependencies ==="
Write-Host ""
Set-Location $ProjectRoot
pnpm install
Write-Host ""

# -------------------------------------------------------
# Step 4: Build Tauri app
# -------------------------------------------------------
Write-Host "=== Step 4/4: Building Tauri Application ==="
Write-Host ""

# Resources are configured in tauri.conf.json — no extra config needed
pnpm tauri build --bundles $Bundle

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

# Show resource sizes
$UvExe = Join-Path $ResourcesDir "uv.exe"
if (Test-Path $UvExe) {
    $UvSizeMB = [math]::Round((Get-Item $UvExe).Length / 1MB, 1)
    Write-Host "Bundled resources:"
    Write-Host "  uv binary:     $UvSizeMB MB"
}
$TtsSrcSize = [math]::Round((Get-ChildItem $TtsServerDst -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "  tts_server/:   $TtsSrcSize MB"
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
Write-Host "The installer is lightweight (~15-30 MB). On first launch,"
Write-Host "the app will download and install Python + dependencies"
Write-Host "into the user's app data directory."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run the installer"
Write-Host "  2. Launch PrivateVoice"
Write-Host "  3. First launch will set up the Python environment (~5 min)"
Write-Host "  4. Test TTS generation"

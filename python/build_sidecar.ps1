# Build the TTS server as a sidecar binary for Tauri (Windows)
# This script creates a standalone executable using PyInstaller

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

# Install/upgrade dependencies
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

# Windows: --onedir produces a directory → copy to src-tauri/sidecar/tts-server/
$BuiltDir = "dist\tts-server"
$SidecarDir = Join-Path $ProjectRoot "src-tauri" "sidecar" "tts-server"

if (-not (Test-Path $BuiltDir)) {
    Write-Error "Build failed: Expected --onedir output at $BuiltDir but not found"
    exit 1
}

# Verify the exe exists inside the directory
$BuiltExe = Join-Path $BuiltDir "tts-server.exe"
if (-not (Test-Path $BuiltExe)) {
    Write-Error "Build failed: $BuiltExe not found inside --onedir output"
    exit 1
}

Write-Host "Copying --onedir output to $SidecarDir..."
if (Test-Path $SidecarDir) { Remove-Item -Recurse -Force $SidecarDir }
New-Item -ItemType Directory -Force -Path (Split-Path $SidecarDir) | Out-Null
Copy-Item -Recurse $BuiltDir $SidecarDir

$ItemCount = (Get-ChildItem $SidecarDir -Recurse -File).Count
$SizeMB = [math]::Round((Get-ChildItem $SidecarDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)

Write-Host ""
Write-Host "=== Build Complete ==="
Write-Host "Sidecar directory: $SidecarDir"
Write-Host "Contents: $ItemCount files"
Write-Host "Total size: $SizeMB MB"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Test the sidecar: $BuiltExe"
Write-Host "  2. Build Tauri app: pnpm tauri build"

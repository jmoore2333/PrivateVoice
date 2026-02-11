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

# Determine target triple and copy binary
$TargetTriple = "x86_64-pc-windows-msvc"
$SidecarName = "tts-server-$TargetTriple.exe"
$BuiltBinary = "dist\tts-server.exe"

if (-not (Test-Path $BuiltBinary)) {
    Write-Error "Build failed: $BuiltBinary not found"
    exit 1
}

Write-Host "Copying binary as $SidecarName..."
Copy-Item $BuiltBinary (Join-Path $BinariesDir $SidecarName)
Copy-Item $BuiltBinary (Join-Path $ProjectRoot "src-tauri" $SidecarName)

$Size = [math]::Round((Get-Item (Join-Path $BinariesDir $SidecarName)).Length / 1MB, 1)
Write-Host ""
Write-Host "=== Build Complete ==="
Write-Host "Sidecar binary: $BinariesDir\$SidecarName"
Write-Host "Size: $Size MB"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Test the binary: $BinariesDir\$SidecarName"
Write-Host "  2. Build Tauri app: pnpm tauri build"

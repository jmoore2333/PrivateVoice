$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

$SourceReq = Join-Path $ProjectRoot "python\requirements.txt"
$ExpectedHashFile = Join-Path $ProjectRoot "python\requirements.sha256"
$StagedReq = Join-Path $ProjectRoot "src-tauri\resources\requirements.txt"

if (-not (Test-Path $SourceReq)) {
    Write-Error "Missing $SourceReq"
    exit 1
}
if (-not (Test-Path $ExpectedHashFile)) {
    Write-Error "Missing $ExpectedHashFile. Run .\scripts\update-requirements-hash.sh"
    exit 1
}
if (-not (Test-Path $StagedReq)) {
    Write-Error "Missing staged requirements at $StagedReq"
    exit 1
}

$SourceHash = (Get-FileHash -Path $SourceReq -Algorithm SHA256).Hash.ToLowerInvariant()
$StagedHash = (Get-FileHash -Path $StagedReq -Algorithm SHA256).Hash.ToLowerInvariant()

$ExpectedRaw = Get-Content $ExpectedHashFile -Raw
$Match = [regex]::Match($ExpectedRaw, "\b[0-9a-fA-F]{64}\b")
if (-not $Match.Success) {
    Write-Error "$ExpectedHashFile does not contain a valid SHA-256 hash"
    exit 1
}
$ExpectedHash = $Match.Value.ToLowerInvariant()

if ($SourceHash -ne $ExpectedHash) {
    Write-Error @"
python/requirements.txt hash mismatch
Expected: $ExpectedHash
Actual:   $SourceHash
Run: .\scripts\update-requirements-hash.sh
"@
    exit 1
}

if ($StagedHash -ne $SourceHash) {
    Write-Error @"
staged requirements hash mismatch
Source: $SourceHash
Staged: $StagedHash
Re-run staging: .\scripts\build-release.ps1
"@
    exit 1
}

Write-Host "Dependency hash check passed: $SourceHash"

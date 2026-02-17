$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ExpectedHashFile = Join-Path $ProjectRoot "python\requirements.sha256"

$Manifests = @(
    "requirements.txt",
    "requirements.lock.txt",
    "requirements.base.txt",
    "requirements.base.lock.txt",
    "requirements.qwen.txt",
    "requirements.qwen.lock.txt",
    "requirements.chatterbox.txt",
    "requirements.chatterbox.lock.txt"
)

if (-not (Test-Path $ExpectedHashFile)) {
    throw "Missing $ExpectedHashFile. Run .\scripts\update-requirements-hash.sh"
}

function Get-NormalizedFileHash {
    param([string]$Path)
    $text = [System.IO.File]::ReadAllText($Path)
    $normalized = $text.Replace("`r`n", "`n")
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha.ComputeHash($bytes)
    $sha.Dispose()
    return [BitConverter]::ToString($hashBytes).Replace("-", "").ToLowerInvariant()
}

$hashMap = @{}
Get-Content $ExpectedHashFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line -split "\s+"
    if ($parts.Length -lt 2) { return }
    $hashMap[$parts[0]] = $parts[1].ToLowerInvariant()
}

foreach ($manifest in $Manifests) {
    $sourceFile = Join-Path $ProjectRoot ("python\" + $manifest)
    $stagedFile = Join-Path $ProjectRoot ("src-tauri\resources\" + $manifest)

    if (-not (Test-Path $sourceFile)) {
        throw "Missing $sourceFile"
    }
    if (-not (Test-Path $stagedFile)) {
        throw "Missing staged manifest at $stagedFile"
    }
    if (-not $hashMap.ContainsKey($manifest)) {
        throw "No expected hash found for $manifest in $ExpectedHashFile"
    }

    $expectedHash = $hashMap[$manifest]
    $sourceHash = Get-NormalizedFileHash $sourceFile
    $stagedHash = Get-NormalizedFileHash $stagedFile

    if ($sourceHash -ne $expectedHash) {
        throw @"
python/$manifest hash mismatch
Expected: $expectedHash
Actual:   $sourceHash
Run: .\scripts\update-requirements-hash.sh
"@
    }

    if ($stagedHash -ne $sourceHash) {
        throw @"
staged $manifest hash mismatch
Source: $sourceHash
Staged: $stagedHash
Re-run staging: .\scripts\build-release.ps1
"@
    }
}

Write-Host "Dependency hash check passed for all manifests."

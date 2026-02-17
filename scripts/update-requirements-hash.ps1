$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$HashFile = Join-Path $ProjectRoot "python\requirements.sha256"

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

$lines = @("# filename sha256 (CRLF-normalized)")

foreach ($manifest in $Manifests) {
    $path = Join-Path $ProjectRoot ("python\" + $manifest)
    if (-not (Test-Path $path)) {
        throw "Missing $path"
    }
    $hash = Get-NormalizedFileHash $path
    $lines += "$manifest $hash"
}

[System.IO.File]::WriteAllLines($HashFile, $lines)

Write-Host "Updated $HashFile"
Write-Host "Manifest hashes:"
Get-Content $HashFile | ForEach-Object { Write-Host $_ }

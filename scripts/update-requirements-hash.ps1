$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

$ReqFile = Join-Path $ProjectRoot "python\requirements.txt"
$HashFile = Join-Path $ProjectRoot "python\requirements.sha256"

if (-not (Test-Path $ReqFile)) {
    Write-Error "Missing $ReqFile"
    exit 1
}

# Normalize CRLF → LF before hashing so the hash matches macOS/Linux (git stores LF)
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

$Hash = Get-NormalizedFileHash $ReqFile
Set-Content -Path $HashFile -Value $Hash -NoNewline

Write-Host "Updated $HashFile"
Write-Host "requirements.txt sha256: $Hash"

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

$ReqFile = Join-Path $ProjectRoot "python\requirements.txt"
$HashFile = Join-Path $ProjectRoot "python\requirements.sha256"

if (-not (Test-Path $ReqFile)) {
    Write-Error "Missing $ReqFile"
    exit 1
}

$Hash = (Get-FileHash -Path $ReqFile -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -Path $HashFile -Value $Hash -NoNewline

Write-Host "Updated $HashFile"
Write-Host "requirements.txt sha256: $Hash"

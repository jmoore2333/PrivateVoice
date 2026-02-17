# Download the correct uv binary for Windows.
# Places it at src-tauri/resources/uv.exe.
# Pin a specific version for reproducible builds.

param(
    [string]$UvVersion = "0.6.6"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ResourcesDir = Join-Path $ProjectRoot "src-tauri" | Join-Path -ChildPath "resources"
$ChecksumManifest = Join-Path $ScriptDir "uv-checksums.txt"

if (-not (Test-Path $ResourcesDir)) {
    New-Item -ItemType Directory -Path $ResourcesDir -Force | Out-Null
}

# Detect architecture
$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
switch ($Arch) {
    "X64"   { $Platform = "x86_64-pc-windows-msvc" }
    "Arm64" { $Platform = "aarch64-pc-windows-msvc" }
    default {
        Write-Error "Unsupported architecture: $Arch"
        exit 1
    }
}

Write-Host "==> Detected platform: $Platform"
Write-Host "==> Downloading uv $UvVersion for $Platform..."

$ArchiveName = "uv-$Platform.zip"
$DownloadUrl = "https://github.com/astral-sh/uv/releases/download/$UvVersion/$ArchiveName"
$TempDir = Join-Path $env:TEMP "uv-download-$(Get-Random)"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    $ArchivePath = Join-Path $TempDir $ArchiveName

    Write-Host "==> Download URL: $DownloadUrl"

    # Download with retries
    $MaxAttempts = 4
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath -UseBasicParsing
            Write-Host "==> Download successful"
            break
        }
        catch {
            if ($attempt -eq $MaxAttempts) {
                Write-Error "Failed to download uv after $MaxAttempts attempts: $_"
                exit 1
            }
            $delay = [math]::Pow(2, $attempt)
            Write-Host "==> Retry $attempt, waiting ${delay}s..."
            Start-Sleep -Seconds $delay
        }
    }

    if (-not (Test-Path $ChecksumManifest)) {
        Write-Error "Checksum manifest not found: $ChecksumManifest"
        exit 1
    }

    $ExpectedHash = $null
    foreach ($line in Get-Content $ChecksumManifest) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }
        $parts = $trimmed -split "\s+"
        if ($parts.Length -lt 3) {
            continue
        }
        if ($parts[0] -eq $UvVersion -and $parts[1] -eq $ArchiveName) {
            $ExpectedHash = $parts[2].ToLower()
            break
        }
    }

    if (-not $ExpectedHash) {
        Write-Error "No checksum entry for uv $UvVersion archive $ArchiveName in $ChecksumManifest"
        exit 1
    }

    $ActualHash = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
    if ($ActualHash -ne $ExpectedHash) {
        Write-Error "Checksum mismatch for $ArchiveName. Expected $ExpectedHash, got $ActualHash"
        exit 1
    }
    Write-Host "==> Checksum verified ($ActualHash)"

    # Extract
    Write-Host "==> Extracting..."
    $ExtractDir = Join-Path $TempDir "extracted"
    Expand-Archive -Path $ArchivePath -DestinationPath $ExtractDir -Force

    # Find uv.exe in extracted files
    $UvExe = Get-ChildItem -Path $ExtractDir -Filter "uv.exe" -Recurse | Select-Object -First 1
    if (-not $UvExe) {
        Write-Error "Could not find uv.exe in extracted archive"
        exit 1
    }

    # Copy to resources
    $DestPath = Join-Path $ResourcesDir "uv.exe"
    Copy-Item -Path $UvExe.FullName -Destination $DestPath -Force

    # Verify
    Write-Host "==> Verifying uv binary..."
    & $DestPath --version

    $Size = (Get-Item $DestPath).Length / 1MB
    Write-Host "==> uv $UvVersion installed to $DestPath"
    Write-Host ("==> Size: {0:N1} MB" -f $Size)
}
finally {
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}

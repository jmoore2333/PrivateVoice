use std::process::Command;

/// Represents the detected GPU target for PyTorch installation.
#[derive(Clone, Debug, serde::Serialize)]
pub enum GpuTarget {
    /// macOS Apple Silicon — default PyPI torch includes MPS support.
    Mps,
    /// NVIDIA GPU — uses download.pytorch.org/whl/cu<version>.
    Cuda(String),
    /// AMD GPU (ROCm) — uses download.pytorch.org/whl/rocm<version>.
    Rocm(String),
    /// Intel GPU (XPU via Intel Extension for PyTorch) — uses Intel's pip index.
    IntelXpu,
    /// CPU fallback — uses download.pytorch.org/whl/cpu.
    Cpu,
}

impl GpuTarget {
    /// Returns the `--extra-index-url` for pip/uv install, if any.
    /// Returns `None` for MPS (default PyPI torch) and Intel XPU (uses --index-url).
    pub fn torch_extra_index_url(&self) -> Option<String> {
        match self {
            GpuTarget::Mps => None, // Default PyPI torch includes MPS
            GpuTarget::Cuda(version) => Some(format!(
                "https://download.pytorch.org/whl/{}",
                version
            )),
            GpuTarget::Rocm(version) => Some(format!(
                "https://download.pytorch.org/whl/{}",
                version
            )),
            GpuTarget::IntelXpu => {
                Some("https://pytorch-extension.intel.com/release-whl/stable/xpu/us/".to_string())
            }
            GpuTarget::Cpu => {
                Some("https://download.pytorch.org/whl/cpu".to_string())
            }
        }
    }

    /// Human-readable description of the detected GPU.
    pub fn display_name(&self) -> String {
        match self {
            GpuTarget::Mps => "Apple Silicon (MPS)".to_string(),
            GpuTarget::Cuda(v) => format!("NVIDIA GPU (CUDA {})", v),
            GpuTarget::Rocm(v) => format!("AMD GPU (ROCm {})", v),
            GpuTarget::IntelXpu => "Intel GPU (XPU)".to_string(),
            GpuTarget::Cpu => "CPU (no GPU acceleration)".to_string(),
        }
    }

    /// Short identifier for the marker file.
    pub fn id(&self) -> String {
        match self {
            GpuTarget::Mps => "mps".to_string(),
            GpuTarget::Cuda(v) => format!("cuda-{}", v),
            GpuTarget::Rocm(v) => format!("rocm-{}", v),
            GpuTarget::IntelXpu => "intel-xpu".to_string(),
            GpuTarget::Cpu => "cpu".to_string(),
        }
    }
}

/// Detect the best available GPU target for PyTorch.
///
/// Detection order:
/// 1. macOS Apple Silicon → MPS
/// 2. NVIDIA GPU (nvidia-smi) → CUDA
/// 3. AMD GPU (rocm-smi or /opt/rocm check) → ROCm
/// 4. Intel GPU (xpu-smi or sycl-ls check) → Intel XPU
/// 5. Fallback → CPU
pub fn detect_gpu() -> GpuTarget {
    // macOS: Check for Apple Silicon
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            println!("[env_manager::gpu] Detected Apple Silicon (MPS)");
            return GpuTarget::Mps;
        } else {
            println!("[env_manager::gpu] Intel Mac detected, using CPU");
            return GpuTarget::Cpu;
        }
    }

    // Windows/Linux: Try NVIDIA first
    if let Some(cuda) = detect_nvidia() {
        return cuda;
    }

    // Try AMD ROCm (Linux primarily, experimental Windows support)
    if let Some(rocm) = detect_amd() {
        return rocm;
    }

    // Try Intel XPU
    if let Some(xpu) = detect_intel() {
        return xpu;
    }

    println!("[env_manager::gpu] No GPU detected, falling back to CPU");
    GpuTarget::Cpu
}

/// Detect NVIDIA GPU via nvidia-smi.
/// Returns CUDA target with appropriate version.
fn detect_nvidia() -> Option<GpuTarget> {
    let nvidia_smi = if cfg!(target_os = "windows") {
        // nvidia-smi is typically at a fixed path on Windows
        let program_files = std::env::var("ProgramFiles")
            .unwrap_or_else(|_| "C:\\Program Files".to_string());
        let path = format!(
            "{}\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
            program_files
        );
        if std::path::Path::new(&path).exists() {
            path
        } else {
            "nvidia-smi".to_string() // Try PATH
        }
    } else {
        "nvidia-smi".to_string()
    };

    match Command::new(&nvidia_smi)
        .args(["--query-gpu=name,compute_cap,driver_version", "--format=csv,noheader"])
        .output()
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let first_line = stdout.lines().next().unwrap_or("");
            println!("[env_manager::gpu] nvidia-smi output: {}", first_line);

            // Parse compute capability to determine CUDA version
            let parts: Vec<&str> = first_line.split(',').map(|s| s.trim()).collect();
            let cuda_version = if parts.len() >= 2 {
                let compute_cap = parts[1];
                select_cuda_version(compute_cap)
            } else {
                "cu124".to_string() // Default to CUDA 12.4
            };

            let gpu_name = parts.first().unwrap_or(&"NVIDIA GPU");
            println!(
                "[env_manager::gpu] Detected NVIDIA: {} → {}",
                gpu_name, cuda_version
            );
            Some(GpuTarget::Cuda(cuda_version))
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[env_manager::gpu] nvidia-smi failed: {}", stderr.trim());
            None
        }
        Err(e) => {
            println!("[env_manager::gpu] nvidia-smi not found: {}", e);
            None
        }
    }
}

/// Select the appropriate CUDA wheel version based on compute capability.
fn select_cuda_version(compute_cap: &str) -> String {
    // Parse compute capability (e.g., "8.9" → 89)
    let cap_numeric: f32 = compute_cap.parse().unwrap_or(0.0);

    if cap_numeric >= 9.0 {
        // Hopper+ (H100, etc.) — CUDA 12.4
        "cu124".to_string()
    } else if cap_numeric >= 7.0 {
        // Volta+ (V100, RTX 20xx, 30xx, 40xx) — CUDA 12.4
        "cu124".to_string()
    } else if cap_numeric >= 6.0 {
        // Pascal (GTX 10xx) — CUDA 12.1 (last supported)
        "cu121".to_string()
    } else {
        // Very old GPU — CPU may be better
        "cu121".to_string()
    }
}

/// Detect AMD GPU via rocm-smi or ROCm installation check.
fn detect_amd() -> Option<GpuTarget> {
    // Method 1: Try rocm-smi
    if let Ok(output) = Command::new("rocm-smi").args(["--showproductname"]).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            println!("[env_manager::gpu] rocm-smi detected: {}", stdout.trim());
            // Determine ROCm version from rocm-smi or default to 6.2
            let rocm_version = detect_rocm_version().unwrap_or_else(|| "rocm6.2".to_string());
            return Some(GpuTarget::Rocm(rocm_version));
        }
    }

    // Method 2: Check for ROCm installation directory (Linux)
    if cfg!(target_os = "linux") {
        let rocm_path = std::path::Path::new("/opt/rocm");
        if rocm_path.exists() {
            println!("[env_manager::gpu] ROCm installation found at /opt/rocm");
            let rocm_version = detect_rocm_version().unwrap_or_else(|| "rocm6.2".to_string());
            return Some(GpuTarget::Rocm(rocm_version));
        }
    }

    // Method 3: Check for AMD GPU via lspci (Linux)
    if cfg!(target_os = "linux") {
        if let Ok(output) = Command::new("lspci").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if stdout.contains("amd") && (stdout.contains("vga") || stdout.contains("display")) {
                    // AMD GPU present but ROCm may not be installed
                    // We'll try ROCm — worst case it fails during pip install
                    // and user can fall back to CPU
                    println!("[env_manager::gpu] AMD GPU detected via lspci (ROCm may need manual install)");
                    return Some(GpuTarget::Rocm("rocm6.2".to_string()));
                }
            }
        }
    }

    // Method 4: Windows — check for AMD GPU via WMIC or DirectX
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("wmic")
            .args(["path", "win32_VideoController", "get", "name"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if stdout.contains("radeon") || stdout.contains("amd") {
                    // Note: ROCm on Windows is limited; this is a best-effort detection
                    println!("[env_manager::gpu] AMD GPU detected on Windows (ROCm support is experimental)");
                    // Don't return ROCm for Windows — PyTorch ROCm wheels are Linux-only
                    // Fall through to Intel/CPU detection
                }
            }
        }
    }

    None
}

/// Try to determine the installed ROCm version.
fn detect_rocm_version() -> Option<String> {
    // Check /opt/rocm/.info/version
    if let Ok(version) = std::fs::read_to_string("/opt/rocm/.info/version") {
        let v = version.trim();
        // Parse major.minor (e.g., "6.2.0" → "rocm6.2")
        let parts: Vec<&str> = v.split('.').collect();
        if parts.len() >= 2 {
            return Some(format!("rocm{}.{}", parts[0], parts[1]));
        }
    }

    // Try rocm-smi --version or rocminfo
    if let Ok(output) = Command::new("rocminfo").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("HSA Runtime Version") {
                    // Extract version number
                    if let Some(version_part) = line.split(':').nth(1) {
                        let v = version_part.trim();
                        let parts: Vec<&str> = v.split('.').collect();
                        if parts.len() >= 2 {
                            return Some(format!("rocm{}.{}", parts[0], parts[1]));
                        }
                    }
                }
            }
        }
    }

    None
}

/// Detect Intel GPU via xpu-smi, sycl-ls, or oneAPI installation.
fn detect_intel() -> Option<GpuTarget> {
    // Method 1: Try xpu-smi (Intel GPU monitoring tool)
    if let Ok(output) = Command::new("xpu-smi").args(["discovery"]).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            println!("[env_manager::gpu] xpu-smi detected: {}", stdout.lines().next().unwrap_or(""));
            return Some(GpuTarget::IntelXpu);
        }
    }

    // Method 2: Try sycl-ls (oneAPI SYCL device lister)
    if let Ok(output) = Command::new("sycl-ls").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if stdout.contains("intel") && (stdout.contains("gpu") || stdout.contains("level_zero")) {
                println!("[env_manager::gpu] Intel GPU detected via sycl-ls");
                return Some(GpuTarget::IntelXpu);
            }
        }
    }

    // Method 3: Check for oneAPI installation
    if cfg!(target_os = "linux") {
        let oneapi_path = std::path::Path::new("/opt/intel/oneapi");
        if oneapi_path.exists() {
            println!("[env_manager::gpu] Intel oneAPI installation found");
            return Some(GpuTarget::IntelXpu);
        }
    }

    // Method 4: Windows — check via WMIC for Intel Arc/Xe GPUs
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("wmic")
            .args(["path", "win32_VideoController", "get", "name"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if stdout.contains("intel") && (stdout.contains("arc") || stdout.contains("xe")) {
                    // Check if IPEX is likely available (needs oneAPI runtime)
                    println!("[env_manager::gpu] Intel discrete GPU detected on Windows");
                    return Some(GpuTarget::IntelXpu);
                }
            }
        }
    }

    None
}

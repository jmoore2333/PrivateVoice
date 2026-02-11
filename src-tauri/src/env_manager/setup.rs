use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::Emitter;

use super::gpu::GpuTarget;
use super::paths;

/// Minimum disk space required (in bytes) for the Python environment setup.
/// Base Python + venv: ~200 MB
/// PyTorch CPU: ~800 MB
/// PyTorch CUDA: ~3 GB
/// Other dependencies: ~500 MB
/// Buffer: 500 MB
const MIN_DISK_SPACE_CPU_BYTES: u64 = 2_000_000_000; // 2 GB
const MIN_DISK_SPACE_GPU_BYTES: u64 = 5_000_000_000; // 5 GB

/// UV version expected — used for update checks.
pub const EXPECTED_UV_VERSION: &str = "0.6.6";

/// Startup event payload (reuses the same Tauri event channel).
#[derive(Clone, serde::Serialize)]
struct SetupEvent {
    phase: String,
    message: String,
    progress: u8,
}

/// Run the full first-time setup or update process.
///
/// This function:
/// 1. Checks disk space
/// 2. Copies bundled source code to the python_env directory
/// 3. Installs a standalone Python via uv
/// 4. Creates a virtual environment
/// 5. Installs all dependencies (including the correct PyTorch variant)
/// 6. Verifies the installation
/// 7. Writes a completion marker
///
/// Each step emits `sidecar-startup` events so the frontend can show progress.
pub fn run_setup(app: &tauri::AppHandle, gpu: &GpuTarget) -> Result<(), String> {
    let env_dir = paths::python_env_dir(app)?;
    let uv = paths::uv_binary(app)?;

    // Ensure the environment directory exists
    std::fs::create_dir_all(&env_dir)
        .map_err(|e| format!("Failed to create python_env directory: {}", e))?;

    // Step 0: Check disk space
    emit_setup_event(app, "setup-checking-disk", "Checking available disk space...", 1);
    check_disk_space(&env_dir, gpu)?;

    // Step 1: Copy source (0-5%)
    emit_setup_event(app, "setup-copying-source", "Copying Python source files...", 3);
    copy_bundled_source(app)?;

    // Step 2: Install Python (5-15%)
    emit_setup_event(
        app,
        "setup-installing-python",
        "Installing Python 3.11 (standalone)...",
        7,
    );
    install_python(app, &uv)?;

    // Step 3: Create venv (15-20%)
    emit_setup_event(
        app,
        "setup-creating-venv",
        "Creating virtual environment...",
        17,
    );
    create_venv(app, &uv)?;

    // Step 4: Install dependencies (20-85%)
    emit_setup_event(
        app,
        "setup-installing-deps",
        &format!("Installing dependencies ({})...", gpu.display_name()),
        22,
    );
    install_dependencies(app, &uv, gpu)?;

    // Step 5: Verify (85-95%)
    emit_setup_event(
        app,
        "setup-verifying",
        "Verifying Python environment...",
        88,
    );
    verify_installation(app, gpu)?;

    // Step 6: Write marker (95-100%)
    emit_setup_event(app, "setup-complete", "Setup complete!", 97);
    write_setup_marker(app, gpu)?;

    emit_setup_event(app, "starting-server", "Starting TTS server...", 100);
    Ok(())
}

/// Check available disk space at the target directory.
fn check_disk_space(target_dir: &Path, gpu: &GpuTarget) -> Result<(), String> {
    let required = match gpu {
        GpuTarget::Cpu => MIN_DISK_SPACE_CPU_BYTES,
        _ => MIN_DISK_SPACE_GPU_BYTES,
    };

    let available = get_available_disk_space(target_dir)?;

    if available < required {
        let required_gb = required as f64 / 1_000_000_000.0;
        let available_gb = available as f64 / 1_000_000_000.0;
        return Err(format!(
            "Insufficient disk space. Required: {:.1} GB, Available: {:.1} GB. \
             Free up disk space and try again.",
            required_gb, available_gb
        ));
    }

    let available_gb = available as f64 / 1_000_000_000.0;
    println!(
        "[env_manager::setup] Disk space check passed: {:.1} GB available",
        available_gb
    );
    Ok(())
}

/// Get available disk space in bytes for the filesystem containing `path`.
fn get_available_disk_space(path: &Path) -> Result<u64, String> {
    // Ensure the path exists (create if needed for the check)
    if !path.exists() {
        std::fs::create_dir_all(path)
            .map_err(|e| format!("Failed to create directory for disk check: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;

        // Use GetDiskFreeSpaceExW via command
        let path_str = path.to_string_lossy();
        match Command::new("wmic")
            .args(["logicaldisk", "where", &format!("DeviceID='{}'", &path_str[..2]), "get", "FreeSpace", "/value"])
            .output()
        {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if line.starts_with("FreeSpace=") {
                        if let Ok(bytes) = line.trim_start_matches("FreeSpace=").trim().parse::<u64>() {
                            return Ok(bytes);
                        }
                    }
                }
                // Fallback: use PowerShell
                get_disk_space_powershell(path)
            }
            _ => get_disk_space_powershell(path),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix: use df
        match Command::new("df")
            .args(["-k", &path.to_string_lossy()])
            .output()
        {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // df -k output: second line, 4th column is available KB
                if let Some(line) = stdout.lines().nth(1) {
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 4 {
                        if let Ok(kb) = fields[3].parse::<u64>() {
                            return Ok(kb * 1024);
                        }
                    }
                }
                // Conservative fallback: assume 10 GB available
                Ok(10_000_000_000)
            }
            _ => Ok(10_000_000_000), // Can't check, assume enough
        }
    }
}

#[cfg(target_os = "windows")]
fn get_disk_space_powershell(path: &Path) -> Result<u64, String> {
    let drive = &path.to_string_lossy()[..2];
    match Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "(Get-PSDrive {}).Free",
                drive.trim_end_matches(':')
            ),
        ])
        .output()
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout
                .trim()
                .parse::<u64>()
                .map_err(|_| "Failed to parse disk space from PowerShell".to_string())
        }
        _ => Ok(10_000_000_000), // Can't check, assume enough
    }
}

/// Copy bundled source files from resources to python_env.
fn copy_bundled_source(app: &tauri::AppHandle) -> Result<(), String> {
    let src = paths::bundled_source_dir(app)?;
    let dst = paths::tts_source_dir(app)?;
    let req_src = paths::bundled_requirements_txt(app)?;
    let req_dst = paths::requirements_txt(app)?;

    // Copy tts_server directory
    if src.exists() {
        copy_dir_recursive(&src, &dst)?;
        println!("[env_manager::setup] Copied tts_server source to {:?}", dst);
    } else {
        return Err(format!(
            "Bundled source not found at {:?}. Build may be incomplete.",
            src
        ));
    }

    // Copy requirements.txt
    if req_src.exists() {
        std::fs::copy(&req_src, &req_dst)
            .map_err(|e| format!("Failed to copy requirements.txt: {}", e))?;
        println!(
            "[env_manager::setup] Copied requirements.txt to {:?}",
            req_dst
        );
    } else {
        return Err(format!(
            "Bundled requirements.txt not found at {:?}. Build may be incomplete.",
            req_src
        ));
    }

    Ok(())
}

/// Recursively copy a directory.
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        std::fs::remove_dir_all(dst)
            .map_err(|e| format!("Failed to clean existing dir {:?}: {}", dst, e))?;
    }
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create dir {:?}: {}", dst, e))?;

    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read dir {:?}: {}", src, e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {:?} → {:?}: {}", src_path, dst_path, e))?;
        }
    }
    Ok(())
}

/// Install a standalone Python via uv.
fn install_python(app: &tauri::AppHandle, uv: &Path) -> Result<(), String> {
    let python_dir = paths::standalone_python_dir(app)?;

    let mut cmd = Command::new(uv);
    cmd.args(["python", "install", "3.11", "--install-dir"])
        .arg(&python_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    suppress_console_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run uv python install: {}", e))?;

    stream_output(app, &mut child, "setup-installing-python", 7, 15);

    let status = child
        .wait()
        .map_err(|e| format!("uv python install failed to complete: {}", e))?;

    if !status.success() {
        return Err(format!(
            "uv python install failed with exit code: {:?}",
            status.code()
        ));
    }

    println!("[env_manager::setup] Python 3.11 installed to {:?}", python_dir);
    Ok(())
}

/// Create a virtual environment using uv.
fn create_venv(app: &tauri::AppHandle, uv: &Path) -> Result<(), String> {
    let venv_dir = paths::venv_dir(app)?;
    let python_dir = paths::standalone_python_dir(app)?;

    // Find the installed Python binary
    let python_bin = find_python_in_dir(&python_dir)?;

    let mut cmd = Command::new(uv);
    cmd.args(["venv"])
        .arg(&venv_dir)
        .args(["--python"])
        .arg(&python_bin)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    suppress_console_window(&mut cmd);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run uv venv: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("uv venv creation failed: {}", stderr));
    }

    println!("[env_manager::setup] Virtual environment created at {:?}", venv_dir);
    Ok(())
}

/// Find the Python binary inside a uv-managed Python installation directory.
fn find_python_in_dir(python_dir: &Path) -> Result<std::path::PathBuf, String> {
    // uv installs Python to a versioned subdirectory, e.g.,
    // python/cpython-3.11.9-macos-aarch64-none/bin/python3
    // python/cpython-3.11.9-windows-x86_64-none/python.exe

    if !python_dir.exists() {
        return Err(format!("Python directory not found: {:?}", python_dir));
    }

    // Look for python3 or python.exe recursively
    let binary_name = if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python3"
    };

    for entry in walkdir(python_dir)? {
        if entry.file_name().map(|n| n == binary_name).unwrap_or(false) {
            if entry.is_file() {
                return Ok(entry);
            }
        }
    }

    // Fallback: try python3.11 on Unix
    if !cfg!(target_os = "windows") {
        for entry in walkdir(python_dir)? {
            if entry
                .file_name()
                .map(|n| n.to_string_lossy().starts_with("python3."))
                .unwrap_or(false)
            {
                if entry.is_file() {
                    return Ok(entry);
                }
            }
        }
    }

    Err(format!(
        "Could not find Python binary in {:?}. Installation may have failed.",
        python_dir
    ))
}

/// Simple recursive directory walk (no external crate needed).
fn walkdir(dir: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut results = Vec::new();

    if !dir.is_dir() {
        return Ok(results);
    }

    for entry in std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read {:?}: {}", dir, e))?
    {
        let entry = entry.map_err(|e| format!("Dir entry error: {}", e))?;
        let path = entry.path();

        results.push(path.clone());

        if path.is_dir() {
            results.extend(walkdir(&path)?);
        }
    }

    Ok(results)
}

/// Install all Python dependencies via uv pip.
fn install_dependencies(
    app: &tauri::AppHandle,
    uv: &Path,
    gpu: &GpuTarget,
) -> Result<(), String> {
    let venv_python = paths::venv_python(app)?;
    let requirements = paths::requirements_txt(app)?;

    if !requirements.exists() {
        return Err("requirements.txt not found in python_env".to_string());
    }

    // Build the uv pip install command
    let mut cmd = Command::new(uv);
    cmd.args(["pip", "install", "-r"])
        .arg(&requirements)
        .args(["--python"])
        .arg(&venv_python);

    // Add the appropriate PyTorch index URL
    if let Some(index_url) = gpu.torch_extra_index_url() {
        cmd.args(["--extra-index-url", &index_url]);
    }

    // For Intel XPU, we also need intel-extension-for-pytorch
    if matches!(gpu, GpuTarget::IntelXpu) {
        cmd.args(["--extra-index-url", "https://pytorch-extension.intel.com/release-whl/stable/xpu/us/"]);
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    suppress_console_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run uv pip install: {}", e))?;

    // Stream output — this is the longest step
    stream_output(app, &mut child, "setup-installing-deps", 22, 85);

    let status = child
        .wait()
        .map_err(|e| format!("uv pip install failed to complete: {}", e))?;

    if !status.success() {
        return Err("Dependency installation failed. Check the logs for details.".to_string());
    }

    println!("[env_manager::setup] Dependencies installed successfully");
    Ok(())
}

/// Verify the Python environment is functional.
fn verify_installation(app: &tauri::AppHandle, gpu: &GpuTarget) -> Result<(), String> {
    let venv_python = paths::venv_python(app)?;
    let env_dir = paths::python_env_dir(app)?;

    // Verify Python can import core modules
    let verify_script = format!(
        r#"
import sys
sys.path.insert(0, '{}')
import torch
import tts_server
print(f'Python: {{sys.version}}')
print(f'PyTorch: {{torch.__version__}}')
print(f'CUDA available: {{torch.cuda.is_available()}}')
print(f'MPS available: {{torch.backends.mps.is_available()}}')
print('VERIFICATION_OK')
"#,
        env_dir.to_string_lossy().replace('\\', "\\\\")
    );

    let mut cmd = Command::new(&venv_python);
    cmd.args(["-c", &verify_script])
        .env("PYTHONPATH", env_dir.to_string_lossy().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    suppress_console_window(&mut cmd);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run verification: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    println!("[env_manager::setup] Verification stdout: {}", stdout.trim());
    if !stderr.is_empty() {
        println!("[env_manager::setup] Verification stderr: {}", stderr.trim());
    }

    if !stdout.contains("VERIFICATION_OK") {
        return Err(format!(
            "Environment verification failed. Python could not import required modules.\n\
             stdout: {}\nstderr: {}",
            stdout.trim(),
            stderr.trim()
        ));
    }

    // Validate GPU target matches
    match gpu {
        GpuTarget::Cuda(_) => {
            if !stdout.contains("CUDA available: True") {
                println!(
                    "[env_manager::setup] WARNING: CUDA GPU detected but torch.cuda.is_available() is False. \
                     PyTorch may need CUDA drivers installed separately."
                );
            }
        }
        GpuTarget::Mps => {
            if !stdout.contains("MPS available: True") {
                println!(
                    "[env_manager::setup] WARNING: MPS expected but not available in torch."
                );
            }
        }
        _ => {}
    }

    Ok(())
}

/// Write the `.setup-complete` JSON marker file.
fn write_setup_marker(app: &tauri::AppHandle, gpu: &GpuTarget) -> Result<(), String> {
    let marker_path = paths::setup_marker_path(app)?;
    let requirements = paths::requirements_txt(app)?;

    // Compute SHA-256 of requirements.txt
    let req_hash = compute_file_sha256(&requirements)?;

    let marker = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "gpu_target": gpu.id(),
        "gpu_display": gpu.display_name(),
        "requirements_hash": req_hash,
        "uv_version": EXPECTED_UV_VERSION,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    let json =
        serde_json::to_string_pretty(&marker).map_err(|e| format!("Failed to serialize marker: {}", e))?;

    std::fs::write(&marker_path, json)
        .map_err(|e| format!("Failed to write setup marker: {}", e))?;

    println!("[env_manager::setup] Setup marker written to {:?}", marker_path);
    Ok(())
}

/// Compute SHA-256 hash of a file.
pub fn compute_file_sha256(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let data = std::fs::read(path).map_err(|e| format!("Failed to read {:?}: {}", path, e))?;

    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();

    Ok(format!("{:x}", result))
}

/// Emit a setup phase event via the sidecar-startup channel.
fn emit_setup_event(app: &tauri::AppHandle, phase: &str, message: &str, progress: u8) {
    println!("[env_manager::setup] {} — {}", phase, message);
    let _ = app.emit(
        "sidecar-startup",
        SetupEvent {
            phase: phase.to_string(),
            message: message.to_string(),
            progress,
        },
    );
}

/// Stream stdout/stderr from a child process, emitting log events.
fn stream_output(
    app: &tauri::AppHandle,
    child: &mut std::process::Child,
    phase: &str,
    progress_start: u8,
    progress_end: u8,
) {
    // Stream stderr (uv outputs progress to stderr)
    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        let phase = phase.to_string();
        let range = progress_end - progress_start;

        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let mut line_count = 0u32;

            for line in reader.lines().map_while(Result::ok) {
                line_count += 1;
                println!("[uv] {}", line);

                // Emit as sidecar-log for the debug console
                let _ = app_handle.emit(
                    "sidecar-log",
                    serde_json::json!({
                        "level": "INFO",
                        "message": format!("[setup] {}", line),
                        "timestamp": chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string(),
                    }),
                );

                // Approximate progress based on line count
                // uv typically outputs ~50-200 lines during install
                let estimated_progress = progress_start
                    + ((line_count.min(200) as f32 / 200.0) * range as f32) as u8;

                let _ = app_handle.emit(
                    "sidecar-startup",
                    SetupEvent {
                        phase: phase.clone(),
                        message: line.clone(),
                        progress: estimated_progress.min(progress_end),
                    },
                );
            }
        });
    }

    // Also stream stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                println!("[uv:stdout] {}", line);
                let _ = app_handle.emit(
                    "sidecar-log",
                    serde_json::json!({
                        "level": "INFO",
                        "message": format!("[setup] {}", line),
                        "timestamp": chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string(),
                    }),
                );
            }
        });
    }
}

/// Suppress the console window on Windows when spawning child processes.
fn suppress_console_window(cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    // No-op on other platforms
    let _ = cmd;
}

/// Check if uv needs an update and report the status.
pub fn check_uv_version(uv: &Path) -> Result<(String, bool), String> {
    let mut cmd = Command::new(uv);
    cmd.args(["--version"]).stdout(Stdio::piped()).stderr(Stdio::piped());
    suppress_console_window(&mut cmd);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to check uv version: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get uv version".to_string());
    }

    let version_output = String::from_utf8_lossy(&output.stdout);
    // Output is like "uv 0.6.6 (abcdef 2025-01-15)"
    let current_version = version_output
        .split_whitespace()
        .nth(1)
        .unwrap_or("unknown")
        .to_string();

    let needs_update = current_version != EXPECTED_UV_VERSION;
    Ok((current_version, needs_update))
}

/// Get the total size of a directory in bytes.
pub fn dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }

    let mut size = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                size += dir_size(&path);
            } else if let Ok(metadata) = path.metadata() {
                size += metadata.len();
            }
        }
    }
    size
}

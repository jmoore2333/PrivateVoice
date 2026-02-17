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
    emit_setup_event(
        app,
        "setup-checking-disk",
        "Checking available disk space...",
        1,
    );
    check_disk_space(&env_dir, gpu)?;

    // Step 1: Copy source (0-5%)
    emit_setup_event(
        app,
        "setup-copying-source",
        "Copying Python source files...",
        3,
    );
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
        get_disk_space_powershell(path)
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
            &format!("(Get-PSDrive {}).Free", drive.trim_end_matches(':')),
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
    let manifests = [
        (paths::bundled_requirements_txt(app)?, paths::requirements_txt(app)?),
        (
            paths::bundled_requirements_lock_txt(app)?,
            paths::requirements_lock_txt(app)?,
        ),
        (
            paths::bundled_requirements_base_txt(app)?,
            paths::requirements_base_txt(app)?,
        ),
        (
            paths::bundled_requirements_base_lock_txt(app)?,
            paths::requirements_base_lock_txt(app)?,
        ),
        (
            paths::bundled_requirements_qwen_txt(app)?,
            paths::requirements_qwen_txt(app)?,
        ),
        (
            paths::bundled_requirements_qwen_lock_txt(app)?,
            paths::requirements_qwen_lock_txt(app)?,
        ),
        (
            paths::bundled_requirements_chatterbox_txt(app)?,
            paths::requirements_chatterbox_txt(app)?,
        ),
        (
            paths::bundled_requirements_chatterbox_lock_txt(app)?,
            paths::requirements_chatterbox_lock_txt(app)?,
        ),
    ];

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

    // Copy requirement manifests
    for (req_src, req_dst) in manifests {
        if req_src.exists() {
            std::fs::copy(&req_src, &req_dst)
                .map_err(|e| format!("Failed to copy {:?}: {}", req_src, e))?;
            println!("[env_manager::setup] Copied {:?} to {:?}", req_src, req_dst);
        } else {
            return Err(format!(
                "Bundled requirement manifest not found at {:?}. Build may be incomplete.",
                req_src
            ));
        }
    }

    Ok(())
}

/// Recursively copy a directory.
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        std::fs::remove_dir_all(dst)
            .map_err(|e| format!("Failed to clean existing dir {:?}: {}", dst, e))?;
    }
    std::fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir {:?}: {}", dst, e))?;

    for entry in
        std::fs::read_dir(src).map_err(|e| format!("Failed to read dir {:?}: {}", src, e))?
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

    // Ensure the install directory exists — uv doesn't create it on Windows
    std::fs::create_dir_all(&python_dir)
        .map_err(|e| format!("Failed to create python install directory: {}", e))?;

    let mut cmd = Command::new(uv);
    cmd.args(["python", "install", "3.11", "--install-dir"])
        .arg(&python_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_uv_cache_env(app, &mut cmd)?;
    clean_appimage_env(&mut cmd);
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

    println!(
        "[env_manager::setup] Python 3.11 installed to {:?}",
        python_dir
    );
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
    apply_uv_cache_env(app, &mut cmd)?;
    clean_appimage_env(&mut cmd);
    suppress_console_window(&mut cmd);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run uv venv: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("uv venv creation failed: {}", stderr));
    }

    println!(
        "[env_manager::setup] Virtual environment created at {:?}",
        venv_dir
    );
    Ok(())
}

/// Find the Python binary inside a uv-managed Python installation directory.
///
/// uv installs Python to a versioned subdirectory like:
///   python/cpython-3.11.11-windows-x86_64-none/python.exe
///   python/cpython-3.11.11-macos-aarch64-none/bin/python3
///
/// We search the known layout (one `cpython-*` subdirectory) rather than
/// recursing the entire tree, because the stdlib includes template copies
/// of `python.exe` under `Lib/venv/scripts/nt/` that are NOT real interpreters.
fn find_python_in_dir(python_dir: &Path) -> Result<std::path::PathBuf, String> {
    if !python_dir.exists() {
        return Err(format!("Python directory not found: {:?}", python_dir));
    }

    // Find the cpython-* subdirectory (uv always creates exactly one)
    let cpython_dir = std::fs::read_dir(python_dir)
        .map_err(|e| format!("Failed to read {:?}: {}", python_dir, e))?
        .filter_map(|e| e.ok())
        .find(|e| e.file_name().to_string_lossy().starts_with("cpython-") && e.path().is_dir())
        .map(|e| e.path())
        .ok_or_else(|| {
            format!(
                "No cpython-* directory found in {:?}. uv python install may have failed.",
                python_dir
            )
        })?;

    // On Windows: python.exe is at the root of the cpython dir
    // On Unix: python3 is in the bin/ subdirectory
    let candidates = if cfg!(target_os = "windows") {
        vec![cpython_dir.join("python.exe")]
    } else {
        vec![
            cpython_dir.join("bin").join("python3"),
            cpython_dir.join("bin").join("python"),
        ]
    };

    for candidate in &candidates {
        if candidate.is_file() {
            println!("[env_manager::setup] Found Python binary: {:?}", candidate);
            return Ok(candidate.clone());
        }
    }

    Err(format!(
        "Could not find Python binary in {:?}. Checked: {:?}",
        cpython_dir, candidates
    ))
}

/// Install all Python dependencies via uv pip.
fn install_dependencies(app: &tauri::AppHandle, uv: &Path, gpu: &GpuTarget) -> Result<(), String> {
    let venv_python = paths::venv_python(app)?;
    let requirements_base = paths::requirements_base_lock_txt(app)?;
    let requirements_qwen = paths::requirements_qwen_lock_txt(app)?;

    if !requirements_base.exists() {
        return Err(
            "requirements.base.lock.txt not found in python_env. Rebuild/reinstall app resources."
                .to_string(),
        );
    }
    if !requirements_qwen.exists() {
        return Err(
            "requirements.qwen.lock.txt not found in python_env. Rebuild/reinstall app resources."
                .to_string(),
        );
    }

    // Install base deps first, then qwen provider deps from hash-locked manifests.
    install_requirements_manifest(
        app,
        uv,
        &venv_python,
        &requirements_base,
        gpu,
        true,
        "setup-installing-deps",
        22,
        55,
    )?;
    install_requirements_manifest(
        app,
        uv,
        &venv_python,
        &requirements_qwen,
        gpu,
        true,
        "setup-installing-deps",
        55,
        85,
    )?;

    println!("[env_manager::setup] Dependencies installed successfully");
    Ok(())
}

fn install_requirements_manifest(
    app: &tauri::AppHandle,
    uv: &Path,
    venv_python: &Path,
    requirements: &Path,
    gpu: &GpuTarget,
    require_hashes: bool,
    phase: &str,
    progress_start: u8,
    progress_end: u8,
) -> Result<(), String> {
    let mut cmd = Command::new(uv);
    cmd.args(["pip", "install", "-r"])
        .arg(requirements)
        .args(["--python"])
        .arg(venv_python);
    if require_hashes {
        cmd.arg("--require-hashes");
    }

    // Add the appropriate PyTorch index URL
    if let Some(index_url) = gpu.torch_extra_index_url() {
        cmd.args(["--extra-index-url", &index_url]);
    }

    // For Intel XPU, we also need intel-extension-for-pytorch
    if matches!(gpu, GpuTarget::IntelXpu) {
        cmd.args([
            "--extra-index-url",
            "https://pytorch-extension.intel.com/release-whl/stable/xpu/us/",
        ]);
    }

    apply_uv_cache_env(app, &mut cmd)?;
    clean_appimage_env(&mut cmd);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    suppress_console_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run uv pip install for {:?}: {}", requirements, e))?;

    stream_output(app, &mut child, phase, progress_start, progress_end);

    let status = child
        .wait()
        .map_err(|e| format!("uv pip install failed to complete for {:?}: {}", requirements, e))?;

    if !status.success() {
        return Err(format!(
            "Dependency installation failed for {:?}. Check setup logs for details.",
            requirements.file_name().unwrap_or_default()
        ));
    }

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
    clean_appimage_env(&mut cmd);
    suppress_console_window(&mut cmd);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run verification: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    println!(
        "[env_manager::setup] Verification stdout: {}",
        stdout.trim()
    );
    if !stderr.is_empty() {
        println!(
            "[env_manager::setup] Verification stderr: {}",
            stderr.trim()
        );
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
                println!("[env_manager::setup] WARNING: MPS expected but not available in torch.");
            }
        }
        _ => {}
    }

    Ok(())
}

/// Write the `.setup-complete` JSON marker file.
fn write_setup_marker(app: &tauri::AppHandle, gpu: &GpuTarget) -> Result<(), String> {
    let marker_path = paths::setup_marker_path(app)?;
    let requirements = paths::requirements_lock_txt(app)?;
    let requirements_base = paths::requirements_base_lock_txt(app)?;
    let requirements_qwen = paths::requirements_qwen_lock_txt(app)?;
    let requirements_chatterbox = paths::requirements_chatterbox_lock_txt(app)?;
    let bundled_source = paths::bundled_source_dir(app)?;

    // Compute SHA-256 hash over bootstrap lock manifests.
    let req_hash = compute_manifest_set_sha256(&[
        requirements.clone(),
        requirements_base.clone(),
        requirements_qwen.clone(),
    ])?;
    let qwen_hash = compute_file_sha256(&requirements_qwen)?;
    let chatterbox_hash = if requirements_chatterbox.exists() {
        Some(compute_file_sha256(&requirements_chatterbox)?)
    } else {
        None
    };
    // Compute SHA-256 of bundled backend source directory
    let source_hash = compute_dir_sha256(&bundled_source)?;

    let marker = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "gpu_target": gpu.id(),
        "gpu_display": gpu.display_name(),
        "requirements_hash": req_hash,
        "source_hash": source_hash,
        "provider_hashes": {
            "qwen3": qwen_hash,
            "chatterbox": serde_json::Value::Null,
        },
        "available_provider_hashes": {
            "qwen3": qwen_hash,
            "chatterbox": chatterbox_hash,
        },
        "uv_version": EXPECTED_UV_VERSION,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    let json = serde_json::to_string_pretty(&marker)
        .map_err(|e| format!("Failed to serialize marker: {}", e))?;

    std::fs::write(&marker_path, json)
        .map_err(|e| format!("Failed to write setup marker: {}", e))?;

    println!(
        "[env_manager::setup] Setup marker written to {:?}",
        marker_path
    );
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

/// Compute a deterministic hash over multiple manifest files.
pub fn compute_manifest_set_sha256(paths: &[std::path::PathBuf]) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let mut normalized = paths.to_vec();
    normalized.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));

    let mut hasher = Sha256::new();
    for path in normalized {
        let file_name = path
            .file_name()
            .map(|v| v.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());
        hasher.update(file_name.as_bytes());
        hasher.update([0]);
        let data = std::fs::read(&path)
            .map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
        hasher.update(data);
        hasher.update([0xff]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Compute SHA-256 hash of a directory tree (deterministic order).
///
/// Hash includes relative file paths and file contents.
pub fn compute_dir_sha256(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::path::{Path, PathBuf};

    fn collect_files(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
        let entries = std::fs::read_dir(current)
            .map_err(|e| format!("Failed to read {:?}: {}", current, e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                collect_files(root, &entry_path, out)?;
            } else if entry_path.is_file() {
                let rel = entry_path
                    .strip_prefix(root)
                    .map_err(|e| format!("Failed to strip prefix for {:?}: {}", entry_path, e))?;
                out.push(rel.to_path_buf());
            }
        }
        Ok(())
    }

    if !path.exists() {
        return Err(format!("Directory not found: {:?}", path));
    }

    let mut files = Vec::<PathBuf>::new();
    collect_files(path, path, &mut files)?;

    files.sort_by(|a, b| {
        a.to_string_lossy()
            .replace('\\', "/")
            .cmp(&b.to_string_lossy().replace('\\', "/"))
    });

    let mut hasher = Sha256::new();
    for rel in files {
        let rel_norm = rel.to_string_lossy().replace('\\', "/");
        hasher.update(rel_norm.as_bytes());
        hasher.update([0]);

        let file_path = path.join(&rel);
        let data = std::fs::read(&file_path)
            .map_err(|e| format!("Failed to read {:?}: {}", file_path, e))?;
        hasher.update(&data);
        hasher.update([0xff]);
    }

    Ok(format!("{:x}", hasher.finalize()))
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
                let estimated_progress =
                    progress_start + ((line_count.min(200) as f32 / 200.0) * range as f32) as u8;

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

/// Remove environment variables injected by the Linux AppImage wrapper.
///
/// AppImages bundle libraries and set `LD_LIBRARY_PATH`, `PYTHONHOME`,
/// `PYTHONPATH`, etc. to point at the mounted SquashFS image.  These leak
/// into every subprocess we spawn and cause two classes of failure:
///
///   1. `PYTHONHOME` makes the standalone Python 3.11 look for its stdlib
///      inside the AppImage instead of its own prefix → immediate crash.
///   2. `LD_LIBRARY_PATH` can make uv or Python pick up incompatible
///      bundled copies of glibc/libstdc++ → segfaults or subtle errors.
///
/// On macOS and Windows this is a no-op because AppImage is Linux-only.
fn clean_appimage_env(cmd: &mut Command) {
    #[cfg(target_os = "linux")]
    {
        // Remove variables that break Python/uv when inherited from AppImage.
        cmd.env_remove("PYTHONHOME");
        cmd.env_remove("PYTHONDONTWRITEBYTECODE");

        // Only strip LD_LIBRARY_PATH if we're actually inside an AppImage
        // (APPIMAGE or APPDIR is set by the AppRun wrapper).
        if std::env::var_os("APPIMAGE").is_some() || std::env::var_os("APPDIR").is_some() {
            cmd.env_remove("LD_LIBRARY_PATH");
            // GI_TYPELIB_PATH can also leak and confuse gobject-introspection
            cmd.env_remove("GI_TYPELIB_PATH");
        }
    }
    let _ = cmd;
}

/// Keep uv/pip caches inside app-managed storage so uninstall cleanup can
/// remove all setup artifacts.
fn apply_uv_cache_env(app: &tauri::AppHandle, cmd: &mut Command) -> Result<(), String> {
    let uv_cache_dir = paths::uv_cache_dir(app)?;
    let pip_cache_dir = uv_cache_dir.join("pip");

    std::fs::create_dir_all(&pip_cache_dir)
        .map_err(|e| format!("Failed to create uv cache directory: {}", e))?;

    cmd.env("UV_CACHE_DIR", &uv_cache_dir)
        .env("PIP_CACHE_DIR", &pip_cache_dir);
    Ok(())
}

/// Check if uv needs an update and report the status.
pub fn check_uv_version(uv: &Path) -> Result<(String, bool), String> {
    let mut cmd = Command::new(uv);
    cmd.args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    clean_appimage_env(&mut cmd);
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

#[derive(Clone, Debug, serde::Serialize)]
pub struct EnsureProviderRuntimeResult {
    pub provider: String,
    pub installed: bool,
    pub restart_required: bool,
    pub message: String,
}

/// Ensure provider-specific runtime dependencies are installed.
pub fn ensure_provider_runtime(
    app: &tauri::AppHandle,
    provider: &str,
    gpu: &GpuTarget,
) -> Result<EnsureProviderRuntimeResult, String> {
    if provider == "qwen3" {
        return Ok(EnsureProviderRuntimeResult {
            provider: provider.to_string(),
            installed: false,
            restart_required: false,
            message: "Qwen runtime is installed during initial setup.".to_string(),
        });
    }

    if provider != "chatterbox" {
        return Err(format!("Unsupported provider runtime request: {}", provider));
    }

    let marker_path = paths::setup_marker_path(app)?;
    if !marker_path.exists() {
        return Err(
            "Python environment is not initialized yet. Complete first-run setup before installing provider runtimes."
                .to_string(),
        );
    }

    let requirements = paths::requirements_chatterbox_lock_txt(app)?;
    if !requirements.exists() {
        return Err(format!(
            "Missing provider manifest at {:?}. Rebuild/reinstall the app resources.",
            requirements
        ));
    }

    let target_hash = compute_file_sha256(&requirements)?;

    let mut marker: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&marker_path)
            .map_err(|e| format!("Failed to read setup marker: {}", e))?,
    )
    .map_err(|e| format!("Failed to parse setup marker: {}", e))?;

    let current_hash = marker
        .get("provider_hashes")
        .and_then(|v| v.get(provider))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    if current_hash.as_deref() == Some(target_hash.as_str()) {
        return Ok(EnsureProviderRuntimeResult {
            provider: provider.to_string(),
            installed: false,
            restart_required: false,
            message: "Provider runtime is already installed.".to_string(),
        });
    }

    let uv = paths::uv_binary(app)?;
    let venv_python = paths::venv_python(app)?;
    if !venv_python.exists() {
        return Err("Virtual environment is missing. Run Environment repair first.".to_string());
    }

    install_requirements_manifest(
        app,
        &uv,
        &venv_python,
        &requirements,
        gpu,
        true,
        "setup-installing-deps",
        86,
        96,
    )?;

    if marker.get("provider_hashes").and_then(|v| v.as_object()).is_none() {
        marker["provider_hashes"] = serde_json::json!({});
    }
    marker["provider_hashes"][provider] = serde_json::Value::String(target_hash.clone());

    if marker
        .get("available_provider_hashes")
        .and_then(|v| v.as_object())
        .is_none()
    {
        marker["available_provider_hashes"] = serde_json::json!({});
    }
    marker["available_provider_hashes"][provider] = serde_json::Value::String(target_hash);

    let marker_json = serde_json::to_string_pretty(&marker)
        .map_err(|e| format!("Failed to serialize setup marker: {}", e))?;
    std::fs::write(&marker_path, marker_json)
        .map_err(|e| format!("Failed to write setup marker: {}", e))?;

    Ok(EnsureProviderRuntimeResult {
        provider: provider.to_string(),
        installed: true,
        restart_required: true,
        message: "Provider runtime installed. Backend restart required before use.".to_string(),
    })
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

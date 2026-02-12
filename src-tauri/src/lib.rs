mod env_manager;

use rand::{distributions::Alphanumeric, Rng};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use tauri::{Emitter, Manager};

const MAX_LOG_ENTRIES: usize = 500;
const TTS_SERVER_PORT: u16 = 8765;

#[derive(Clone, serde::Serialize)]
struct LogEntry {
    level: String,
    message: String,
    timestamp: String,
}

#[derive(Clone, serde::Serialize)]
struct StartupEvent {
    phase: String,
    message: String,
    progress: u8,
}

struct SidecarState {
    child: Option<std::process::Child>,
}

struct TtsServerAuthState {
    access_token: String,
}

struct LogBuffer {
    entries: VecDeque<LogEntry>,
}

impl LogBuffer {
    fn new() -> Self {
        Self {
            entries: VecDeque::with_capacity(MAX_LOG_ENTRIES),
        }
    }

    fn add(&mut self, entry: LogEntry) {
        if self.entries.len() >= MAX_LOG_ENTRIES {
            self.entries.pop_front();
        }
        self.entries.push_back(entry);
    }

    fn get_recent(&self, count: usize) -> Vec<LogEntry> {
        self.entries
            .iter()
            .rev()
            .take(count)
            .rev()
            .cloned()
            .collect()
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
        }
    }
}

fn parse_log_level(line: &str) -> String {
    if line.contains("ERROR") || line.contains("error") {
        "ERROR".to_string()
    } else if line.contains("WARNING") || line.contains("warning") || line.contains("WARN") {
        "WARNING".to_string()
    } else if line.contains("DEBUG") || line.contains("debug") {
        "DEBUG".to_string()
    } else {
        "INFO".to_string()
    }
}

fn get_timestamp() -> String {
    chrono::Local::now()
        .format("%Y-%m-%dT%H:%M:%S%.3f")
        .to_string()
}

fn generate_access_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect()
}

/// Ensure the TTS server port is available, reclaiming it from an orphaned
/// sidecar if necessary.
///
/// 1. Try to bind the port — if it succeeds the port is free.
/// 2. If occupied, identify the process via platform tools.
/// 3. If the process is an orphaned `tts_server.main` under our app data
///    directory, kill it (SIGTERM → wait → SIGKILL fallback).
/// 4. If it belongs to something else, return an error.
fn ensure_port_available(port: u16, app: &tauri::AppHandle) -> Result<(), String> {
    if TcpListener::bind(("127.0.0.1", port)).is_ok() {
        return Ok(());
    }

    println!(
        "[sidecar] Port {} in use — checking for orphaned sidecar...",
        port
    );

    let pids = get_pids_on_port(port);
    if pids.is_empty() {
        return Err(format!(
            "Port {} is already in use but the owning process could not be identified. \
             Close it manually and retry.",
            port
        ));
    }

    // Resolve our app-data directory to match against the process command.
    let app_data_prefix = app
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    for pid in &pids {
        let cmd_line = get_process_command(*pid);
        let is_our_sidecar = cmd_line.contains("tts_server")
            && (!app_data_prefix.is_empty() && cmd_line.contains(&app_data_prefix));

        if !is_our_sidecar {
            return Err(format!(
                "Port {} is in use by another process (PID {}: {}). \
                 Close that process and retry.",
                port,
                pid,
                truncate_str(&cmd_line, 120)
            ));
        }

        println!(
            "[sidecar] Reclaiming port {} from orphaned sidecar PID {}",
            port, pid
        );
        kill_process_gracefully(*pid);
    }

    // Wait briefly and verify the port is now free.
    std::thread::sleep(std::time::Duration::from_millis(300));

    TcpListener::bind(("127.0.0.1", port)).map(drop).map_err(|_| {
        format!(
            "Port {} is still in use after reclaiming orphaned sidecar. \
             Close the process manually and retry.",
            port
        )
    })
}

/// Return PIDs listening on the given TCP port.
#[cfg(not(target_os = "windows"))]
fn get_pids_on_port(port: u16) -> Vec<u32> {
    let output = Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .lines()
            .filter_map(|l| l.trim().parse::<u32>().ok())
            .collect(),
        Err(_) => vec![],
    }
}

#[cfg(target_os = "windows")]
fn get_pids_on_port(port: u16) -> Vec<u32> {
    let output = Command::new("netstat")
        .args(["-ano", "-p", "TCP"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    let port_str = format!(":{}", port);
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .lines()
            .filter(|l| l.contains(&port_str) && l.contains("LISTENING"))
            .filter_map(|l| l.split_whitespace().last()?.parse::<u32>().ok())
            .collect(),
        Err(_) => vec![],
    }
}

/// Get the full command line of a process by PID.
#[cfg(not(target_os = "windows"))]
fn get_process_command(pid: u32) -> String {
    Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn get_process_command(pid: u32) -> String {
    Command::new("wmic")
        .args(["process", "where", &format!("ProcessId={}", pid), "get", "CommandLine", "/value"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .find(|l| l.starts_with("CommandLine="))
                .map(|l| l.trim_start_matches("CommandLine=").trim().to_string())
                .unwrap_or_default()
        })
        .unwrap_or_default()
}

/// Send SIGTERM, wait up to 2 seconds, then SIGKILL if still alive.
#[cfg(not(target_os = "windows"))]
fn kill_process_gracefully(pid: u32) {
    use std::time::{Duration, Instant};

    // SIGTERM
    let _ = Command::new("kill")
        .args(["-15", &pid.to_string()])
        .output();

    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(100));
        // Check if process still exists (kill -0)
        if Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stderr(Stdio::null())
            .status()
            .map(|s| !s.success())
            .unwrap_or(true)
        {
            println!("[sidecar] Orphaned PID {} exited after SIGTERM", pid);
            return;
        }
    }

    // Still alive — SIGKILL
    println!(
        "[sidecar] PID {} did not exit after SIGTERM, sending SIGKILL",
        pid
    );
    let _ = Command::new("kill")
        .args(["-9", &pid.to_string()])
        .output();
}

#[cfg(target_os = "windows")]
fn kill_process_gracefully(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .output();
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

/// Process a stdout line: emit log event, buffer it, and detect startup phases.
fn process_stdout_line(app: &tauri::AppHandle, line: &str) {
    let entry = LogEntry {
        level: parse_log_level(line),
        message: line.to_string(),
        timestamp: get_timestamp(),
    };

    let _ = app.emit("sidecar-log", entry.clone());

    if let Some(buffer) = app.try_state::<Mutex<LogBuffer>>() {
        if let Ok(mut buf) = buffer.lock() {
            buf.add(entry);
        }
    }

    // Detect startup phases from server output
    if line.contains("Starting TTS server") {
        let _ = app.emit(
            "sidecar-startup",
            StartupEvent {
                phase: "starting-server".to_string(),
                message: "TTS server starting...".to_string(),
                progress: 10,
            },
        );
    } else if line.contains("Uvicorn running") || line.contains("Application startup complete") {
        let _ = app.emit(
            "sidecar-startup",
            StartupEvent {
                phase: "checking-models".to_string(),
                message: "Server ready, checking models...".to_string(),
                progress: 20,
            },
        );
    } else if line.contains("Downloading") || line.contains("downloading") {
        let _ = app.emit(
            "sidecar-startup",
            StartupEvent {
                phase: "downloading".to_string(),
                message: "Downloading model files...".to_string(),
                progress: 40,
            },
        );
    } else if line.contains("Loading model") || line.contains("loading-model") {
        let _ = app.emit(
            "sidecar-startup",
            StartupEvent {
                phase: "loading-model".to_string(),
                message: "Loading model into memory...".to_string(),
                progress: 70,
            },
        );
    } else if line.contains("Model loaded successfully") {
        let _ = app.emit(
            "sidecar-startup",
            StartupEvent {
                phase: "ready".to_string(),
                message: "Model loaded and ready".to_string(),
                progress: 100,
            },
        );
    }
}

/// Process a stderr line: emit log event, buffer it, and detect startup phases.
/// Uvicorn and FastAPI print startup messages to stderr, so phase detection
/// must run here too (not just on stdout).
fn process_stderr_line(app: &tauri::AppHandle, line: &str) {
    let entry = LogEntry {
        level: "ERROR".to_string(),
        message: line.to_string(),
        timestamp: get_timestamp(),
    };

    let _ = app.emit("sidecar-log", entry.clone());

    if let Some(buffer) = app.try_state::<Mutex<LogBuffer>>() {
        if let Ok(mut buf) = buffer.lock() {
            buf.add(entry);
        }
    }

    // Detect startup phases from stderr (uvicorn outputs here)
    if line.contains("Uvicorn running") || line.contains("Application startup complete") {
        let _ = app.emit(
            "sidecar-startup",
            StartupEvent {
                phase: "checking-models".to_string(),
                message: "Server ready, checking models...".to_string(),
                progress: 20,
            },
        );
    }
}

/// Set up thread-based stdout/stderr streaming for a std::process::Child.
fn spawn_std_child_streaming(app: &tauri::AppHandle, child: &mut std::process::Child) {
    if let Some(stdout) = child.stdout.take() {
        let app_handle = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                process_stdout_line(&app_handle, &line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                process_stderr_line(&app_handle, &line);
            }
        });
    }
}

#[tauri::command]
async fn start_tts_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<SidecarState>>,
    auth_state: tauri::State<'_, TtsServerAuthState>,
) -> Result<String, String> {
    let mut state_guard = state.lock().map_err(|e| e.to_string())?;

    // Stop only the child process we own.
    if let Some(ref mut child) = state_guard.child {
        let _ = child.kill();
        let _ = child.wait();
    }
    state_guard.child = None;

    // Small delay to let port be released
    std::thread::sleep(std::time::Duration::from_millis(100));

    ensure_port_available(TTS_SERVER_PORT, &app)?;

    // Keep all Hugging Face artifacts inside app-managed storage.
    let hf_home = env_manager::paths::huggingface_home_dir(&app)?;
    let hf_hub_cache = env_manager::paths::huggingface_hub_cache_dir(&app)?;
    std::fs::create_dir_all(&hf_hub_cache)
        .map_err(|e| format!("Failed to create Hugging Face cache directory: {}", e))?;

    // Emit startup event
    let _ = app.emit(
        "sidecar-startup",
        StartupEvent {
            phase: "initializing".to_string(),
            message: "Starting Python environment...".to_string(),
            progress: 0,
        },
    );

    // Development mode: run Python directly from local venv (all platforms)
    #[cfg(debug_assertions)]
    {
        let python_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?
            .parent()
            .ok_or("No parent dir")?
            .parent()
            .ok_or("No grandparent dir")?
            .parent()
            .ok_or("No great-grandparent dir")?
            .join("python");

        println!("Dev mode: Python dir: {:?}", python_dir);

        // Use the virtual environment's Python (platform-aware path)
        let venv_python = if cfg!(target_os = "windows") {
            python_dir.join(".venv").join("Scripts").join("python.exe")
        } else {
            python_dir.join(".venv").join("bin").join("python")
        };
        let system_python = if cfg!(target_os = "windows") {
            "python"
        } else {
            "python3"
        };
        let python_cmd = if venv_python.exists() {
            println!("Using venv Python: {:?}", venv_python);
            venv_python.to_string_lossy().to_string()
        } else {
            println!("Warning: venv not found, using system {}", system_python);
            system_python.to_string()
        };

        let mut child = Command::new(&python_cmd)
            .args(["-u", "-m", "tts_server.main"]) // -u for unbuffered output
            .current_dir(&python_dir)
            .env("PYTHONUNBUFFERED", "1")
            .env("TTS_SERVER_DEV", "true")
            .env("TTS_SERVER_PORT", TTS_SERVER_PORT.to_string())
            .env("TTS_ACCESS_TOKEN", &auth_state.access_token)
            .env("HF_HOME", &hf_home)
            .env("HF_HUB_CACHE", &hf_hub_cache)
            .env("TRANSFORMERS_CACHE", &hf_hub_cache)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn Python server: {}", e))?;

        spawn_std_child_streaming(&app, &mut child);
        state_guard.child = Some(child);
    }

    // Release mode: unified deferred dependency installer for ALL platforms
    #[cfg(not(debug_assertions))]
    {
        // Step 1: Validate or set up the Python environment
        let _ = app.emit(
            "sidecar-startup",
            StartupEvent {
                phase: "setup-detecting-hardware".to_string(),
                message: "Detecting hardware...".to_string(),
                progress: 1,
            },
        );

        let setup_state = env_manager::validate::check_environment(&app)?;

        match setup_state {
            env_manager::SetupState::Ready {
                gpu_target,
                gpu_display,
            } => {
                println!("Environment ready: {} ({})", gpu_display, gpu_target);
            }
            env_manager::SetupState::NeedsSetup => {
                println!("First-time setup required — running installer...");
                let gpu = env_manager::gpu::detect_gpu();
                let _ = app.emit(
                    "sidecar-startup",
                    StartupEvent {
                        phase: "setup-detecting-hardware".to_string(),
                        message: format!("Detected: {}", gpu.display_name()),
                        progress: 3,
                    },
                );
                env_manager::run_setup(&app, &gpu)?;
            }
            env_manager::SetupState::NeedsUpdate { reason } => {
                println!("Environment update required: {}", reason);
                let _ = app.emit(
                    "sidecar-startup",
                    StartupEvent {
                        phase: "setup-detecting-hardware".to_string(),
                        message: "Updating Python environment...".to_string(),
                        progress: 2,
                    },
                );
                let gpu = env_manager::gpu::detect_gpu();
                env_manager::run_setup(&app, &gpu)?;
            }
            env_manager::SetupState::Corrupted { reason } => {
                println!("Environment corrupted: {} — running repair...", reason);
                let _ = app.emit(
                    "sidecar-startup",
                    StartupEvent {
                        phase: "setup-detecting-hardware".to_string(),
                        message: "Repairing Python environment...".to_string(),
                        progress: 2,
                    },
                );
                // Delete marker + venv and re-setup
                env_manager::validate::repair_environment(&app, true)?;
                let gpu = env_manager::gpu::detect_gpu();
                env_manager::run_setup(&app, &gpu)?;
            }
        }

        // Step 2: Spawn the TTS server from the venv
        let venv_python = env_manager::paths::venv_python(&app)?;
        let env_dir = env_manager::paths::python_env_dir(&app)?;

        println!("Release mode: spawning TTS server from {:?}", venv_python);

        if !venv_python.exists() {
            return Err(format!(
                "Python interpreter not found at {:?}. Environment setup may have failed.",
                venv_python
            ));
        }

        let mut cmd = Command::new(&venv_python);
        cmd.args(["-u", "-m", "tts_server.main"])
            .current_dir(&env_dir)
            .env("PYTHONUNBUFFERED", "1")
            .env("TTS_SERVER_PORT", TTS_SERVER_PORT.to_string())
            .env("TTS_ACCESS_TOKEN", &auth_state.access_token)
            .env("HF_HOME", &hf_home)
            .env("HF_HUB_CACHE", &hf_hub_cache)
            .env("TRANSFORMERS_CACHE", &hf_hub_cache)
            .env("PYTHONPATH", env_dir.to_string_lossy().to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Remove AppImage-injected env vars that break Python/uv on Linux.
        #[cfg(target_os = "linux")]
        {
            cmd.env_remove("PYTHONHOME");
            cmd.env_remove("PYTHONDONTWRITEBYTECODE");
            if std::env::var_os("APPIMAGE").is_some()
                || std::env::var_os("APPDIR").is_some()
            {
                cmd.env_remove("LD_LIBRARY_PATH");
                cmd.env_remove("GI_TYPELIB_PATH");
            }
        }

        // Suppress console window on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn TTS server: {}", e))?;

        spawn_std_child_streaming(&app, &mut child);
        state_guard.child = Some(child);
    }

    // Emit starting event
    let _ = app.emit(
        "sidecar-startup",
        StartupEvent {
            phase: "starting-server".to_string(),
            message: "Python server spawned, waiting for startup...".to_string(),
            progress: 5,
        },
    );

    Ok("Server started".to_string())
}

#[tauri::command]
async fn stop_tts_server(state: tauri::State<'_, Mutex<SidecarState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = state.child {
        child
            .kill()
            .map_err(|e| format!("Failed to kill server: {}", e))?;
        state.child = None;
        Ok("Server stopped".to_string())
    } else {
        Ok("Server not running".to_string())
    }
}

#[tauri::command]
fn get_server_status(state: tauri::State<'_, Mutex<SidecarState>>) -> Result<bool, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.child.is_some())
}

#[tauri::command]
fn get_tts_access_token(
    auth_state: tauri::State<'_, TtsServerAuthState>,
) -> Result<String, String> {
    Ok(auth_state.access_token.clone())
}

#[tauri::command]
fn get_sidecar_logs(
    state: tauri::State<'_, Mutex<LogBuffer>>,
    count: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    let buffer = state.lock().map_err(|e| e.to_string())?;
    Ok(buffer.get_recent(count.unwrap_or(100)))
}

/// Get the current environment status (for frontend settings panel).
#[tauri::command]
fn get_environment_status(
    app: tauri::AppHandle,
) -> Result<env_manager::validate::EnvironmentStatus, String> {
    env_manager::validate::get_environment_status(&app)
}

/// Repair the environment — deletes marker and optionally the venv.
/// The next launch will trigger a fresh setup.
#[tauri::command]
async fn repair_environment(
    app: tauri::AppHandle,
    delete_venv: Option<bool>,
) -> Result<String, String> {
    env_manager::validate::repair_environment(&app, delete_venv.unwrap_or(false))?;
    Ok("Environment marked for repair. Restart the app to re-run setup.".to_string())
}

/// Reset cached WebView2 mic/camera permissions (Windows only).
/// Called from the UI when the user is stuck with a denied microphone.
/// Returns true if something was cleared and a restart is needed.
#[tauri::command]
fn reset_mic_permissions() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::path::PathBuf;

        let local_app_data =
            std::env::var("LOCALAPPDATA").map_err(|_| "Could not find LOCALAPPDATA")?;
        let prefs_path = PathBuf::from(&local_app_data)
            .join("com.privatevoice.desktop")
            .join("EBWebView")
            .join("Default")
            .join("Preferences");

        if !prefs_path.exists() {
            return Ok(false); // No Preferences file = nothing to clear
        }

        let contents = std::fs::read_to_string(&prefs_path)
            .map_err(|e| format!("Failed to read Preferences: {}", e))?;

        let mut prefs: serde_json::Value = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse Preferences: {}", e))?;

        let mut modified = false;
        if let Some(profile) = prefs.get_mut("profile") {
            if let Some(content_settings) = profile.get_mut("content_settings") {
                if let Some(exceptions) = content_settings.get_mut("exceptions") {
                    for key in &["media_stream_mic", "media_stream_camera"] {
                        if exceptions.get(*key).is_some() {
                            exceptions.as_object_mut().map(|obj| obj.remove(*key));
                            modified = true;
                        }
                    }
                }
            }
        }

        if modified {
            let json_str = serde_json::to_string(&prefs)
                .map_err(|e| format!("Failed to serialize Preferences: {}", e))?;
            std::fs::write(&prefs_path, json_str)
                .map_err(|e| format!("Failed to write Preferences: {}", e))?;
        }

        Ok(modified)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false) // No-op on non-Windows
    }
}

/// Detect the current GPU target (for frontend display).
#[tauri::command]
fn detect_gpu() -> Result<String, String> {
    let gpu = env_manager::gpu::detect_gpu();
    serde_json::to_string(&serde_json::json!({
        "target": gpu.id(),
        "display": gpu.display_name(),
    }))
    .map_err(|e| e.to_string())
}

/// Clear cached microphone/camera permission denials from the WebView2 Preferences file.
///
/// Must run BEFORE WebView2 initializes (before `tauri::Builder::run()`). If a user
/// previously denied mic/camera access, WebView2 caches the denial and never fires the
/// `PermissionRequested` event again, so our auto-grant handler can't help. This clears
/// those cached denials so the event fires again on next request.
#[cfg(target_os = "windows")]
fn clear_cached_webview2_denials() {
    use std::path::PathBuf;

    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(val) => PathBuf::from(val),
        Err(_) => return,
    };

    let prefs_path = local_app_data
        .join("com.privatevoice.desktop")
        .join("EBWebView")
        .join("Default")
        .join("Preferences");

    if !prefs_path.exists() {
        return;
    }

    let contents = match std::fs::read_to_string(&prefs_path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let mut prefs: serde_json::Value = match serde_json::from_str(&contents) {
        Ok(v) => v,
        Err(_) => return,
    };

    // WebView2 stores permission states under:
    // profile.content_settings.exceptions.media_stream_mic
    // profile.content_settings.exceptions.media_stream_camera
    let mut modified = false;
    if let Some(profile) = prefs.get_mut("profile") {
        if let Some(content_settings) = profile.get_mut("content_settings") {
            if let Some(exceptions) = content_settings.get_mut("exceptions") {
                for key in &["media_stream_mic", "media_stream_camera"] {
                    if exceptions.get(*key).is_some() {
                        exceptions.as_object_mut().map(|obj| obj.remove(*key));
                        modified = true;
                        println!("WebView2: cleared cached {} permission denial", key);
                    }
                }
            }
        }
    }

    if modified {
        if let Ok(json_str) = serde_json::to_string(&prefs) {
            let _ = std::fs::write(&prefs_path, json_str);
            println!("WebView2: wrote cleaned Preferences file");
        }
    }
}

/// Auto-grant microphone and camera permissions in WebView2 on Windows.
///
/// Desktop apps should not require a second browser-level permission prompt after the user
/// has already chosen to install the application. This registers a `PermissionRequested`
/// handler that auto-grants microphone and camera access while leaving all other permissions
/// at their default behavior.
#[cfg(target_os = "windows")]
fn setup_webview2_permissions(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| {
        unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use webview2_com::PermissionRequestedEventHandler;

            let core = webview.controller().CoreWebView2().unwrap();

            let mut token: i64 = 0;
            let _ = core.add_PermissionRequested(
                &PermissionRequestedEventHandler::create(Box::new(move |_webview, args| {
                    if let Some(args) = args {
                        let mut kind = COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION;
                        let _ = args.PermissionKind(&mut kind);

                        match kind {
                            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                            | COREWEBVIEW2_PERMISSION_KIND_CAMERA => {
                                let _ = args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
                                println!("WebView2: auto-granted {:?} permission", kind);
                            }
                            _ => {
                                // Default behavior for other permissions
                            }
                        }
                    }
                    Ok(())
                })),
                &mut token,
            );
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Clear any cached WebView2 permission denials BEFORE the webview initializes.
    // This must run before tauri::Builder so the Preferences file isn't locked.
    #[cfg(target_os = "windows")]
    clear_cached_webview2_denials();

    let access_token = generate_access_token();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    // Add MCP bridge plugin for AI-driven testing (feature-gated)
    #[cfg(feature = "mcp-bridge")]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Set window icon explicitly so the taskbar always shows the correct icon
                // (Windows caches the old icon from previous installs)
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
                    .expect("failed to load app icon");
                let _ = window.set_icon(icon);

                // Auto-grant microphone/camera permissions on Windows
                #[cfg(target_os = "windows")]
                setup_webview2_permissions(&window);
            }
            Ok(())
        })
        .manage(Mutex::new(SidecarState { child: None }))
        .manage(Mutex::new(LogBuffer::new()))
        .manage(TtsServerAuthState { access_token })
        .invoke_handler(tauri::generate_handler![
            start_tts_server,
            stop_tts_server,
            get_server_status,
            get_tts_access_token,
            get_sidecar_logs,
            get_environment_status,
            repair_environment,
            detect_gpu,
            reset_mic_permissions
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Stop the server when the window is closed
                if let Some(state) = window.try_state::<Mutex<SidecarState>>() {
                    if let Ok(mut state) = state.lock() {
                        if let Some(ref mut child) = state.child {
                            let _ = child.kill();
                        }
                        state.child = None;
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

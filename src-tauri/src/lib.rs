use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use tauri::{Emitter, Manager};

#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

const MAX_LOG_ENTRIES: usize = 500;

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
    #[cfg(debug_assertions)]
    child: Option<Child>,
    #[cfg(not(debug_assertions))]
    child: Option<tauri_plugin_shell::process::CommandChild>,
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
        self.entries.iter().rev().take(count).rev().cloned().collect()
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
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
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

/// Kill any process listening on the given port (macOS only)
fn kill_process_on_port(port: u16) {
    // Use lsof to find and kill any process on the port
    if let Ok(output) = Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for pid in pids.lines() {
            if let Ok(pid_num) = pid.trim().parse::<i32>() {
                println!("Killing existing process {} on port {}", pid_num, port);
                let _ = Command::new("kill").args(["-9", &pid_num.to_string()]).output();
            }
        }
    }
}

#[tauri::command]
async fn start_tts_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<SidecarState>>,
) -> Result<String, String> {
    let mut state_guard = state.lock().map_err(|e| e.to_string())?;

    // Kill any existing server on our port first
    kill_process_on_port(8765);

    if state_guard.child.is_some() {
        // Also kill our tracked child if it exists
        if let Some(mut child) = state_guard.child.take() {
            let _ = child.kill();
        }
    }

    // Small delay to let port be released
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Emit startup event
    let _ = app.emit(
        "sidecar-startup",
        StartupEvent {
            phase: "initializing".to_string(),
            message: "Starting Python environment...".to_string(),
            progress: 0,
        },
    );

    // Development mode: run Python directly with output streaming
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

        // Use the virtual environment's Python
        let venv_python = python_dir.join(".venv").join("bin").join("python");
        let python_cmd = if venv_python.exists() {
            println!("Using venv Python: {:?}", venv_python);
            venv_python.to_string_lossy().to_string()
        } else {
            println!("Warning: venv not found, using system python3");
            "python3".to_string()
        };

        let mut child = Command::new(&python_cmd)
            .args(["-u", "-m", "tts_server.main"])  // -u for unbuffered output
            .current_dir(&python_dir)
            .env("PYTHONUNBUFFERED", "1")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn Python server: {}", e))?;

        // Capture stdout in a separate thread
        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    let entry = LogEntry {
                        level: parse_log_level(&line),
                        message: line.clone(),
                        timestamp: get_timestamp(),
                    };

                    // Emit log event
                    let _ = app_handle.emit("sidecar-log", entry.clone());

                    // Also add to buffer
                    if let Some(buffer) = app_handle.try_state::<Mutex<LogBuffer>>() {
                        if let Ok(mut buf) = buffer.lock() {
                            buf.add(entry);
                        }
                    }

                    // Check for startup phases in output
                    if line.contains("Starting TTS server") {
                        let _ = app_handle.emit(
                            "sidecar-startup",
                            StartupEvent {
                                phase: "starting-server".to_string(),
                                message: "TTS server starting...".to_string(),
                                progress: 10,
                            },
                        );
                    } else if line.contains("Uvicorn running") || line.contains("Application startup complete") {
                        let _ = app_handle.emit(
                            "sidecar-startup",
                            StartupEvent {
                                phase: "checking-models".to_string(),
                                message: "Server ready, checking models...".to_string(),
                                progress: 20,
                            },
                        );
                    }
                }
            });
        }

        // Capture stderr in a separate thread
        if let Some(stderr) = child.stderr.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().map_while(Result::ok) {
                    let entry = LogEntry {
                        level: "ERROR".to_string(),
                        message: line.clone(),
                        timestamp: get_timestamp(),
                    };

                    let _ = app_handle.emit("sidecar-log", entry.clone());

                    if let Some(buffer) = app_handle.try_state::<Mutex<LogBuffer>>() {
                        if let Ok(mut buf) = buffer.lock() {
                            buf.add(entry);
                        }
                    }
                }
            });
        }

        state_guard.child = Some(child);
    }

    // Release mode: use bundled sidecar via shell plugin
    #[cfg(not(debug_assertions))]
    {
        println!("Release mode: spawning tts-server sidecar");

        let sidecar = app
            .shell()
            .sidecar("tts-server")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

        let (mut rx, child) = sidecar
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        // Stream sidecar output via events
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            use tauri_plugin_shell::process::CommandEvent;

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line).to_string();
                        let entry = LogEntry {
                            level: parse_log_level(&line_str),
                            message: line_str.clone(),
                            timestamp: get_timestamp(),
                        };

                        let _ = app_handle.emit("sidecar-log", entry.clone());

                        if let Some(buffer) = app_handle.try_state::<Mutex<LogBuffer>>() {
                            if let Ok(mut buf) = buffer.lock() {
                                buf.add(entry);
                            }
                        }

                        // Check for startup phases
                        if line_str.contains("Starting TTS server") {
                            let _ = app_handle.emit(
                                "sidecar-startup",
                                StartupEvent {
                                    phase: "starting-server".to_string(),
                                    message: "TTS server starting...".to_string(),
                                    progress: 10,
                                },
                            );
                        } else if line_str.contains("Uvicorn running") || line_str.contains("Application startup complete") {
                            let _ = app_handle.emit(
                                "sidecar-startup",
                                StartupEvent {
                                    phase: "checking-models".to_string(),
                                    message: "Server ready, checking models...".to_string(),
                                    progress: 20,
                                },
                            );
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        let line_str = String::from_utf8_lossy(&line).to_string();
                        let entry = LogEntry {
                            level: "ERROR".to_string(),
                            message: line_str,
                            timestamp: get_timestamp(),
                        };

                        let _ = app_handle.emit("sidecar-log", entry.clone());

                        if let Some(buffer) = app_handle.try_state::<Mutex<LogBuffer>>() {
                            if let Ok(mut buf) = buffer.lock() {
                                buf.add(entry);
                            }
                        }
                    }
                    CommandEvent::Error(err) => {
                        let _ = app_handle.emit(
                            "sidecar-startup",
                            StartupEvent {
                                phase: "error".to_string(),
                                message: err,
                                progress: 0,
                            },
                        );
                    }
                    CommandEvent::Terminated(_) => {
                        break;
                    }
                    _ => {}
                }
            }
        });

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

    if let Some(mut child) = state.child.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill server: {}", e))?;
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
fn get_sidecar_logs(
    state: tauri::State<'_, Mutex<LogBuffer>>,
    count: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    let buffer = state.lock().map_err(|e| e.to_string())?;
    Ok(buffer.get_recent(count.unwrap_or(100)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init());

    // Add shell plugin for release mode sidecar support
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_shell::init());
    }

    builder
        .manage(Mutex::new(SidecarState { child: None }))
        .manage(Mutex::new(LogBuffer::new()))
        .invoke_handler(tauri::generate_handler![
            start_tts_server,
            stop_tts_server,
            get_server_status,
            get_sidecar_logs
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Stop the server when the window is closed
                if let Some(state) = window.try_state::<Mutex<SidecarState>>() {
                    if let Ok(mut state) = state.lock() {
                        if let Some(mut child) = state.child.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

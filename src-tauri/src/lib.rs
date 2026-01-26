use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

struct SidecarState {
    // For dev mode: std::process::Child
    #[cfg(debug_assertions)]
    child: Option<Child>,
    // For release mode: tauri_plugin_shell::process::CommandChild
    #[cfg(not(debug_assertions))]
    child: Option<tauri_plugin_shell::process::CommandChild>,
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
async fn start_tts_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<SidecarState>>,
) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if state.child.is_some() {
        return Ok("Server already running".to_string());
    }

    // Development mode: run Python directly
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

        let child = Command::new("python3")
            .args(["-m", "tts_server.main"])
            .current_dir(&python_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn Python server: {}", e))?;

        state.child = Some(child);
    }

    // Release mode: use bundled sidecar via shell plugin
    #[cfg(not(debug_assertions))]
    {
        println!("Release mode: spawning tts-server sidecar");

        let sidecar = app
            .shell()
            .sidecar("binaries/tts-server")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

        let (mut _rx, child) = sidecar
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        state.child = Some(child);
    }

    Ok("Server started".to_string())
}

#[tauri::command]
async fn stop_tts_server(state: tauri::State<'_, Mutex<SidecarState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = state.child.take() {
        child.kill().map_err(|e| format!("Failed to kill server: {}", e))?;
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
        .invoke_handler(tauri::generate_handler![
            start_tts_server,
            stop_tts_server,
            get_server_status
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

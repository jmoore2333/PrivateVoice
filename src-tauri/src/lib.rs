use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

struct SidecarState {
    child: Option<Child>,
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

    // Get the path to the Python server
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

    println!("Python dir: {:?}", python_dir);

    // In development mode, run Python directly
    // In production, we'd use the bundled sidecar
    #[cfg(debug_assertions)]
    let child = Command::new("python3")
        .args(["-m", "tts_server.main"])
        .current_dir(&python_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Python server: {}", e))?;

    #[cfg(not(debug_assertions))]
    let child = {
        // In release mode, use the bundled sidecar
        let sidecar_path = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?
            .join("tts-server");

        Command::new(&sidecar_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?
    };

    state.child = Some(child);
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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

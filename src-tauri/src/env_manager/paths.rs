use std::path::PathBuf;
use tauri::Manager;

/// All paths live under `{appData}/PrivateVoice/python_env/`.
/// This keeps the entire Python environment self-contained and removable.

/// Root of the python environment directory.
pub fn python_env_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(app_data.join("python_env"))
}

/// The uv-created virtual environment directory.
pub fn venv_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("venv"))
}

/// Path to the Python interpreter inside the venv (platform-aware).
pub fn venv_python(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let venv = venv_dir(app)?;
    if cfg!(target_os = "windows") {
        Ok(venv.join("Scripts").join("python.exe"))
    } else {
        Ok(venv.join("bin").join("python"))
    }
}

/// Path to the uv binary in the Tauri resource directory.
pub fn uv_binary(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let uv_name = if cfg!(target_os = "windows") {
        "uv.exe"
    } else {
        "uv"
    };

    let path = resource_dir.join(uv_name);
    if !path.exists() {
        return Err(format!(
            "uv binary not found at {:?}. Ensure the build bundled it correctly.",
            path
        ));
    }
    Ok(path)
}

/// Path to the `.setup-complete` JSON marker file.
pub fn setup_marker_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join(".setup-complete"))
}

/// Path to the TTS server source inside the python_env.
pub fn tts_source_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("tts_server"))
}

/// Path to the bundled TTS server source in resources.
pub fn bundled_source_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;
    Ok(resource_dir.join("tts_server"))
}

/// Path to the requirements.txt inside the python_env.
pub fn requirements_txt(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("requirements.txt"))
}

/// Path to the bundled requirements.txt in resources.
pub fn bundled_requirements_txt(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;
    Ok(resource_dir.join("requirements.txt"))
}

/// Path to the uv-managed standalone Python installation.
pub fn standalone_python_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("python"))
}

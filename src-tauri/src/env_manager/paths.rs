use std::path::PathBuf;
use tauri::Manager;

/// All paths live under `{appData}/PrivateVoice/python_env/`.
/// This keeps the entire Python environment self-contained and removable.

/// Resolve the bundled resources subdirectory.
///
/// Tauri's `resource_dir()` returns the bundle root, but our `tauri.conf.json`
/// uses glob patterns like `"resources/uv*"` (relative to `src-tauri/`). Tauri
/// preserves the relative directory structure, so bundled files end up at
/// `{resource_dir}/resources/...` on all platforms.
fn bundled_resources_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;
    Ok(resource_dir.join("resources"))
}

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
    let resources = bundled_resources_dir(app)?;

    let uv_name = if cfg!(target_os = "windows") {
        "uv.exe"
    } else {
        "uv"
    };

    let path = resources.join(uv_name);
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
    Ok(bundled_resources_dir(app)?.join("tts_server"))
}

/// Path to the requirements.txt inside the python_env.
pub fn requirements_txt(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("requirements.txt"))
}

/// Path to the bundled requirements.txt in resources.
pub fn bundled_requirements_txt(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(bundled_resources_dir(app)?.join("requirements.txt"))
}

/// Path to the uv-managed standalone Python installation.
pub fn standalone_python_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("python"))
}

/// Root Hugging Face cache home for this app.
///
/// The Python sidecar sets HF_HOME to this path so all Hub/model artifacts stay
/// inside the app-managed data directory.
pub fn huggingface_home_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("huggingface"))
}

/// Hugging Face Hub cache directory (`{HF_HOME}/hub`).
pub fn huggingface_hub_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(huggingface_home_dir(app)?.join("hub"))
}

/// uv cache directory for Python/bootstrap artifacts.
pub fn uv_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(python_env_dir(app)?.join("uv-cache"))
}

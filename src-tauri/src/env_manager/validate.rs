use super::paths;
use super::setup;
use std::path::{Path, PathBuf};

/// Represents the current state of the Python environment.
#[derive(Clone, Debug, serde::Serialize)]
pub enum SetupState {
    /// Environment is ready to use — marker valid, venv exists, hashes match.
    Ready {
        gpu_target: String,
        gpu_display: String,
    },
    /// No marker or no venv — full setup required.
    NeedsSetup,
    /// Marker exists but requirements hash changed (app update) — update required.
    NeedsUpdate { reason: String },
    /// Marker exists but venv Python is missing/broken — repair required.
    Corrupted { reason: String },
}

/// Marker file structure (JSON).
#[derive(serde::Deserialize, Debug)]
struct SetupMarker {
    version: String,
    gpu_target: String,
    #[serde(default)]
    gpu_display: Option<String>,
    requirements_hash: String,
    #[serde(default)]
    provider_hashes: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(default)]
    source_hash: Option<String>,
    #[serde(default)]
    uv_version: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
}

fn normalize_package_name(name: &str) -> String {
    name.to_ascii_lowercase().replace('_', "-").replace('.', "-")
}

fn lockfile_package_version(lock_path: &Path, package: &str) -> Option<String> {
    let content = std::fs::read_to_string(lock_path).ok()?;
    let prefix = format!("{}==", package);
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if let Some(rest) = line.strip_prefix(&prefix) {
            let version = rest.split_whitespace().next()?;
            if !version.is_empty() {
                return Some(version.to_string());
            }
        }
    }
    None
}

fn site_packages_dirs(venv_dir: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    let windows_path = venv_dir.join("Lib").join("site-packages");
    if windows_path.exists() {
        dirs.push(windows_path);
    }

    let unix_lib_dir = venv_dir.join("lib");
    if let Ok(entries) = std::fs::read_dir(unix_lib_dir) {
        for entry in entries.flatten() {
            let p = entry.path().join("site-packages");
            if p.exists() {
                dirs.push(p);
            }
        }
    }

    dirs
}

fn installed_package_version(venv_dir: &Path, package: &str) -> Option<String> {
    let normalized_target = normalize_package_name(package);

    for site_packages in site_packages_dirs(venv_dir) {
        let Ok(entries) = std::fs::read_dir(site_packages) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) else {
                continue;
            };
            let Some(stem) = name.strip_suffix(".dist-info") else {
                continue;
            };
            let Some((dist_name, version)) = stem.rsplit_once('-') else {
                continue;
            };

            if normalize_package_name(dist_name) == normalized_target && !version.is_empty() {
                return Some(version.to_string());
            }
        }
    }

    None
}

/// Quick validation check on every launch (~10ms).
///
/// 1. Check if marker file exists
/// 2. Parse marker JSON
/// 3. Verify venv Python binary exists
/// 4. Compare requirements.txt hash
///
/// No Python execution needed — this is pure filesystem checks.
pub fn check_environment(app: &tauri::AppHandle) -> Result<SetupState, String> {
    let marker_path = paths::setup_marker_path(app)?;
    let venv_python = paths::venv_python(app)?;
    let requirements_lock = paths::requirements_lock_txt(app)?;
    let requirements = paths::requirements_txt(app)?;
    let bundled_requirements_lock = paths::bundled_requirements_lock_txt(app)?;
    let bundled_requirements = paths::bundled_requirements_txt(app)?;
    let requirements_base_lock = paths::requirements_base_lock_txt(app)?;
    let requirements_base = paths::requirements_base_txt(app)?;
    let requirements_qwen_lock = paths::requirements_qwen_lock_txt(app)?;
    let requirements_qwen = paths::requirements_qwen_txt(app)?;
    let bundled_requirements_base_lock = paths::bundled_requirements_base_lock_txt(app)?;
    let bundled_requirements_base = paths::bundled_requirements_base_txt(app)?;
    let bundled_requirements_qwen_lock = paths::bundled_requirements_qwen_lock_txt(app)?;
    let bundled_requirements_qwen = paths::bundled_requirements_qwen_txt(app)?;
    let tts_source = paths::tts_source_dir(app)?;
    let bundled_source = paths::bundled_source_dir(app)?;

    // Check 1: Does the marker file exist?
    if !marker_path.exists() {
        println!("[env_manager::validate] No setup marker found — needs setup");
        return Ok(SetupState::NeedsSetup);
    }

    // Check 2: Can we parse the marker?
    let marker_json = std::fs::read_to_string(&marker_path)
        .map_err(|e| format!("Failed to read setup marker: {}", e))?;

    let marker: SetupMarker = serde_json::from_str(&marker_json).map_err(|e| {
        println!(
            "[env_manager::validate] Failed to parse setup marker: {} — needs setup",
            e
        );
        format!("Invalid setup marker: {}", e)
    })?;

    println!(
        "[env_manager::validate] Marker found: version={}, gpu={}, hash={}",
        marker.version,
        marker.gpu_target,
        &marker.requirements_hash[..8]
    );

    // Check 3: Does the venv Python binary exist?
    if !venv_python.exists() {
        return Ok(SetupState::Corrupted {
            reason: format!(
                "Virtual environment Python not found at {:?}. Environment may be corrupted.",
                venv_python
            ),
        });
    }
    let venv_dir = paths::venv_dir(app)?;

    // Check 4: Has requirement manifest set changed? (indicates app update)
    let current_manifest_set = if bundled_requirements_lock.exists()
        && bundled_requirements_base_lock.exists()
        && bundled_requirements_qwen_lock.exists()
    {
        vec![
            bundled_requirements_lock.clone(),
            bundled_requirements_base_lock.clone(),
            bundled_requirements_qwen_lock.clone(),
        ]
    } else if requirements_lock.exists()
        && requirements_base_lock.exists()
        && requirements_qwen_lock.exists()
    {
        vec![
            requirements_lock.clone(),
            requirements_base_lock.clone(),
            requirements_qwen_lock.clone(),
        ]
    } else if bundled_requirements.exists()
        && bundled_requirements_base.exists()
        && bundled_requirements_qwen.exists()
    {
        vec![
            bundled_requirements.clone(),
            bundled_requirements_base.clone(),
            bundled_requirements_qwen.clone(),
        ]
    } else if requirements.exists() && requirements_base.exists() && requirements_qwen.exists() {
        vec![
            requirements.clone(),
            requirements_base.clone(),
            requirements_qwen.clone(),
        ]
    } else if bundled_requirements.exists() {
        vec![bundled_requirements.clone()]
    } else if requirements.exists() {
        vec![requirements.clone()]
    } else {
        // Can't verify — assume OK
        return Ok(SetupState::Ready {
            gpu_target: marker.gpu_target,
            gpu_display: marker.gpu_display.unwrap_or_else(|| "Unknown".to_string()),
        });
    };

    let current_hash = setup::compute_manifest_set_sha256(&current_manifest_set)?;

    if current_hash != marker.requirements_hash {
        println!(
            "[env_manager::validate] Requirements hash mismatch: marker={}, current={}",
            &marker.requirements_hash[..8],
            &current_hash[..8]
        );
        return Ok(SetupState::NeedsUpdate {
            reason: "Application was updated — dependencies need to be reinstalled.".to_string(),
        });
    }

    // Check 5: Has backend source changed? (indicates API/code update)
    // Compare bundled source hash against the marker's source hash.
    let current_source_path = if bundled_source.exists() {
        &bundled_source
    } else if tts_source.exists() {
        &tts_source
    } else {
        return Ok(SetupState::NeedsUpdate {
            reason: "Python backend source is missing — reinitializing environment.".to_string(),
        });
    };

    let current_source_hash = setup::compute_dir_sha256(current_source_path)?;
    match marker.source_hash.as_deref() {
        Some(marker_source_hash) if marker_source_hash == current_source_hash => {}
        Some(marker_source_hash) => {
            println!(
                "[env_manager::validate] Source hash mismatch: marker={}, current={}",
                &marker_source_hash[..8],
                &current_source_hash[..8]
            );
            return Ok(SetupState::NeedsUpdate {
                reason: "Application backend source changed — syncing Python server code."
                    .to_string(),
            });
        }
        None => {
            println!(
                "[env_manager::validate] Source hash missing in marker — forcing one-time source sync"
            );
            return Ok(SetupState::NeedsUpdate {
                reason: "App update requires a one-time backend source refresh.".to_string(),
            });
        }
    }

    // Check 6: Version check (app version changed means potential update needed)
    let current_version = env!("CARGO_PKG_VERSION");
    if marker.version != current_version {
        println!(
            "[env_manager::validate] Version mismatch: marker={}, current={}",
            marker.version, current_version
        );
        // Version changed but requirements didn't — this might be fine,
        // but let's do a safe re-setup to ensure consistency
        return Ok(SetupState::NeedsUpdate {
            reason: format!(
                "App version changed ({} → {}). Re-verifying dependencies.",
                marker.version, current_version
            ),
        });
    }

    // Check 7: Ensure baseline Qwen runtime package is present.
    if installed_package_version(&venv_dir, "qwen-tts").is_none() {
        return Ok(SetupState::NeedsUpdate {
            reason: "Qwen runtime package is missing. Reinstalling dependencies.".to_string(),
        });
    }

    // Check 8: If chatterbox runtime has been installed, ensure shared
    // dependency versions still match the Qwen lock baseline.
    let chatterbox_installed = marker
        .provider_hashes
        .as_ref()
        .and_then(|hashes| hashes.get("chatterbox"))
        .and_then(|v| v.as_str())
        .is_some();
    if chatterbox_installed {
        let qwen_lock_for_check = if requirements_qwen_lock.exists() {
            requirements_qwen_lock.clone()
        } else {
            bundled_requirements_qwen_lock.clone()
        };

        if qwen_lock_for_check.exists() {
            if let Some(expected_transformers) =
                lockfile_package_version(&qwen_lock_for_check, "transformers")
            {
                let installed_transformers = installed_package_version(&venv_dir, "transformers");
                if installed_transformers.as_deref() != Some(expected_transformers.as_str()) {
                    return Ok(SetupState::NeedsUpdate {
                        reason: format!(
                            "Runtime dependency drift detected (transformers {:?} != locked {}). Re-applying dependencies.",
                            installed_transformers, expected_transformers
                        ),
                    });
                }
            }
        }
    }

    println!("[env_manager::validate] Environment validation passed");
    Ok(SetupState::Ready {
        gpu_target: marker.gpu_target,
        gpu_display: marker.gpu_display.unwrap_or_else(|| "Unknown".to_string()),
    })
}

/// Get environment status information for the frontend.
#[derive(serde::Serialize)]
pub struct EnvironmentStatus {
    pub setup_complete: bool,
    pub gpu_target: Option<String>,
    pub gpu_display: Option<String>,
    pub python_path: Option<String>,
    pub venv_path: Option<String>,
    pub disk_usage_mb: Option<f64>,
    pub uv_version: Option<String>,
    pub uv_needs_update: bool,
    pub state: String,
    pub state_detail: Option<String>,
}

/// Get detailed environment status for the settings panel.
pub fn get_environment_status(app: &tauri::AppHandle) -> Result<EnvironmentStatus, String> {
    let state = check_environment(app)?;
    let venv_path = paths::venv_dir(app).ok();
    let python_path = paths::venv_python(app).ok();
    let env_dir = paths::python_env_dir(app).ok();

    // Compute disk usage
    let disk_usage_mb = env_dir
        .as_ref()
        .map(|d| setup::dir_size(d) as f64 / 1_048_576.0);

    // Check uv version
    let (uv_version, uv_needs_update) = paths::uv_binary(app)
        .ok()
        .and_then(|uv| setup::check_uv_version(&uv).ok())
        .unwrap_or(("unknown".to_string(), false));

    let (setup_complete, gpu_target, gpu_display, state_str, state_detail) = match &state {
        SetupState::Ready {
            gpu_target,
            gpu_display,
        } => (
            true,
            Some(gpu_target.clone()),
            Some(gpu_display.clone()),
            "ready".to_string(),
            None,
        ),
        SetupState::NeedsSetup => (false, None, None, "needs_setup".to_string(), None),
        SetupState::NeedsUpdate { reason } => (
            false,
            None,
            None,
            "needs_update".to_string(),
            Some(reason.clone()),
        ),
        SetupState::Corrupted { reason } => (
            false,
            None,
            None,
            "corrupted".to_string(),
            Some(reason.clone()),
        ),
    };

    Ok(EnvironmentStatus {
        setup_complete,
        gpu_target,
        gpu_display,
        python_path: python_path.map(|p| p.to_string_lossy().to_string()),
        venv_path: venv_path.map(|p| p.to_string_lossy().to_string()),
        disk_usage_mb,
        uv_version: Some(uv_version),
        uv_needs_update,
        state: state_str,
        state_detail,
    })
}

/// Delete the setup marker (and optionally the entire python_env tree)
/// to force a fresh setup.
pub fn repair_environment(app: &tauri::AppHandle, delete_venv: bool) -> Result<(), String> {
    let marker = paths::setup_marker_path(app)?;
    if marker.exists() {
        std::fs::remove_file(&marker)
            .map_err(|e| format!("Failed to delete setup marker: {}", e))?;
        println!("[env_manager::validate] Deleted setup marker");
    }

    if delete_venv {
        let env_dir = paths::python_env_dir(app)?;
        if env_dir.exists() {
            std::fs::remove_dir_all(&env_dir)
                .map_err(|e| format!("Failed to delete python_env directory: {}", e))?;
            println!(
                "[env_manager::validate] Deleted full python_env at {:?}",
                env_dir
            );
        }
    }

    Ok(())
}

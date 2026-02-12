use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

fn main() {
    println!("cargo:rerun-if-changed=../python/requirements.txt");
    println!("cargo:rerun-if-changed=../python/requirements.sha256");
    println!("cargo:rerun-if-changed=resources/requirements.txt");

    verify_requirements_integrity();
    tauri_build::build()
}

fn verify_requirements_integrity() {
    let profile = std::env::var("PROFILE").unwrap_or_default();
    if profile != "release" {
        return;
    }

    let manifest_dir = PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is not set"),
    );
    let project_root = manifest_dir
        .parent()
        .expect("Failed to resolve project root from CARGO_MANIFEST_DIR");

    let source_requirements = project_root.join("python").join("requirements.txt");
    let expected_hash_file = project_root.join("python").join("requirements.sha256");
    let staged_requirements = manifest_dir.join("resources").join("requirements.txt");

    if !source_requirements.exists() {
        panic!(
            "Missing {}",
            source_requirements.display()
        );
    }
    if !expected_hash_file.exists() {
        panic!(
            "Missing {}. Run ./scripts/update-requirements-hash.sh after dependency updates.",
            expected_hash_file.display()
        );
    }
    if !staged_requirements.exists() {
        panic!(
            "Missing {}. Stage resources before release builds (./scripts/build-release.sh or .\\scripts\\build-release.ps1).",
            staged_requirements.display()
        );
    }

    let source_hash = file_sha256(&source_requirements);
    let expected_hash = parse_expected_hash(&expected_hash_file);
    if source_hash != expected_hash {
        panic!(
            "requirements.txt hash mismatch. Expected {}, got {}. Run ./scripts/update-requirements-hash.sh and re-stage resources.",
            expected_hash, source_hash
        );
    }

    let staged_hash = file_sha256(&staged_requirements);
    if staged_hash != source_hash {
        panic!(
            "Staged requirements.txt hash mismatch. Source {}, staged {}. Re-run resource staging.",
            source_hash, staged_hash
        );
    }
}

fn file_sha256(path: &Path) -> String {
    let bytes = std::fs::read(path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", path.display(), e));
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    format!("{:x}", hasher.finalize())
}

fn parse_expected_hash(path: &Path) -> String {
    let raw = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", path.display(), e));
    let hash = raw
        .split_whitespace()
        .find(|token| token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit()))
        .unwrap_or_else(|| {
            panic!(
                "Invalid hash format in {} (expected SHA-256 hex digest)",
                path.display()
            )
        });
    hash.to_ascii_lowercase()
}

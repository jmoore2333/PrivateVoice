use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const REQUIREMENT_MANIFESTS: &[&str] = &[
    "requirements.txt",
    "requirements.lock.txt",
    "requirements.base.txt",
    "requirements.base.lock.txt",
    "requirements.qwen.txt",
    "requirements.qwen.lock.txt",
    "requirements.chatterbox.txt",
    "requirements.chatterbox.lock.txt",
];

fn main() {
    for name in REQUIREMENT_MANIFESTS {
        println!("cargo:rerun-if-changed=../python/{name}");
        println!("cargo:rerun-if-changed=resources/{name}");
    }
    println!("cargo:rerun-if-changed=../python/requirements.sha256");

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

    let expected_hash_file = project_root.join("python").join("requirements.sha256");
    if !expected_hash_file.exists() {
        panic!(
            "Missing {}. Run ./scripts/update-requirements-hash.sh after dependency updates.",
            expected_hash_file.display()
        );
    }

    let expected_hashes = parse_expected_hashes(&expected_hash_file);

    for name in REQUIREMENT_MANIFESTS {
        let source_manifest = project_root.join("python").join(name);
        let staged_manifest = manifest_dir.join("resources").join(name);

        if !source_manifest.exists() {
            panic!("Missing {}", source_manifest.display());
        }
        if !staged_manifest.exists() {
            panic!(
                "Missing {}. Stage resources before release builds (./scripts/build-release.sh or .\\scripts\\build-release.ps1).",
                staged_manifest.display()
            );
        }

        let expected_hash = expected_hashes.get(*name).unwrap_or_else(|| {
            panic!(
                "No expected hash entry for {} in {}",
                name,
                expected_hash_file.display()
            )
        });
        let source_hash = file_sha256(&source_manifest);
        if &source_hash != expected_hash {
            panic!(
                "{} hash mismatch. Expected {}, got {}. Run ./scripts/update-requirements-hash.sh and re-stage resources.",
                name, expected_hash, source_hash
            );
        }

        let staged_hash = file_sha256(&staged_manifest);
        if staged_hash != source_hash {
            panic!(
                "Staged {} hash mismatch. Source {}, staged {}. Re-run resource staging.",
                name, source_hash, staged_hash
            );
        }
    }
}

fn file_sha256(path: &Path) -> String {
    let bytes =
        std::fs::read(path).unwrap_or_else(|e| panic!("Failed to read {}: {}", path.display(), e));
    // Strip \r so CRLF (Windows) and LF (macOS/Linux) produce the same hash.
    let normalized: Vec<u8> = bytes.into_iter().filter(|&b| b != b'\r').collect();
    let mut hasher = Sha256::new();
    hasher.update(&normalized);
    format!("{:x}", hasher.finalize())
}

fn parse_expected_hashes(path: &Path) -> HashMap<String, String> {
    let raw = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", path.display(), e));

    let mut hashes: HashMap<String, String> = HashMap::new();
    for (line_no, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let mut parts = trimmed.split_whitespace();
        let name = parts
            .next()
            .unwrap_or_else(|| panic!("Invalid hash entry at line {}", line_no + 1));
        let hash = parts
            .next()
            .unwrap_or_else(|| panic!("Invalid hash entry at line {}", line_no + 1));

        if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            panic!(
                "Invalid hash value for {} at line {} in {}",
                name,
                line_no + 1,
                path.display()
            );
        }
        hashes.insert(name.to_string(), hash.to_ascii_lowercase());
    }

    hashes
}

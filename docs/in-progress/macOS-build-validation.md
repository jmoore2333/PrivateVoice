# PrivateVoice macOS Build + Deferred-Setup Validation (In Progress)

Last updated: 2026-02-11  
Branch target: `claude/fix-crossplatform-setup-AAIjb`  
Reference commit: `3936679` (docs) on top of `b1d50bb` (latest runtime fix set)

## Goal

Build and validate the **new deferred dependency installer flow** on macOS, then capture pass/fail notes for merge readiness.

Important: `pnpm tauri dev` uses the debug path and does **not** validate deferred first-run setup.  
Use a **release build** and run the built `.app`/`.dmg`.

---

## 1. Prerequisites (macOS)

Run these once on the machine:

```bash
xcode-select -p
rustc --version
cargo --version
node --version
pnpm --version
```

If anything is missing:

```bash
# Xcode Command Line Tools
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node + pnpm (example with Homebrew)
brew install node pnpm
```

Recommended hardware/runtime for this test:
- Apple Silicon Mac preferred (expects MPS path)
- Stable internet
- At least 10 GB free disk before first launch

---

## 2. Sync to Test Branch

From repo root:

```bash
git checkout claude/fix-crossplatform-setup-AAIjb
git pull
git log --oneline -n 3
```

Confirm the branch includes commit `b1d50bb` (runtime fixes) and docs commit `3936679`.

---

## 3. Optional: Clean Previous Build Artifacts

Use this if you want a clean build output:

```bash
rm -rf build .svelte-kit src-tauri/target
```

---

## 4. Build Release Artifact (New Installer Model)

Run the build script (this stages uv + Python source + requirements, then builds Tauri):

```bash
./scripts/build-release.sh
```

What this script does:
1. Downloads pinned `uv` binary (`0.6.6`) for your mac architecture
2. Copies `python/tts_server` -> `src-tauri/resources/tts_server`
3. Copies `python/requirements.txt` -> `src-tauri/resources/requirements.txt`
4. Runs `pnpm install`
5. Runs `pnpm tauri build`

Expected output locations:

```bash
find src-tauri/target/release/bundle -name "*.app" -type d
find src-tauri/target/release/bundle -name "*.dmg" -type f
```

---

## 5. Install + Run the Built App

Preferred path:
1. Open the generated `.dmg`
2. Drag `PrivateVoice.app` to `Applications`
3. Launch from `Applications`

Alternative quick launch:

```bash
APP_PATH="$(find src-tauri/target/release/bundle -name '*.app' -type d | head -1)"
open "$APP_PATH"
```

---

## 6. Validate First-Run Deferred Setup

On first launch, verify startup progress goes through setup phases (wording may vary slightly):
- Detecting hardware
- Checking disk space
- Copying Python source
- Installing Python 3.11
- Creating virtual environment
- Installing dependencies
- Verifying environment
- Starting server

Expected behavior on Apple Silicon:
- GPU target should resolve to **Apple Silicon (MPS)**
- Torch should run without CUDA requirements

Expected behavior on Intel Mac:
- GPU target should resolve to **CPU**

---

## 7. Verify Environment Was Created

Check for setup marker and environment directory:

```bash
ls -la ~/Library/Application\ Support/com.privatevoice.desktop/python_env
cat ~/Library/Application\ Support/com.privatevoice.desktop/python_env/.setup-complete
```

In `.setup-complete`, verify fields like:
- `"version": "1.0.0"`
- `"gpu_target": "mps"` (Apple Silicon) or `"cpu"` (Intel Mac)
- `"uv_version": "0.6.6"`

---

## 8. Smoke Test Runtime Features

Inside the running app:
1. Load a compatible model for each mode:
   - Custom Voice: `0.6b` or `1.7b`
   - Voice Clone: `0.6b-base` or `1.7b-base`
   - Voice Design: `1.7b-design`
2. Generate one short sample per mode
3. Save to Library
4. Export WAV
5. Confirm no startup loop or repeated setup on relaunch

Close app and relaunch once:
- Second launch should skip setup and start faster

---

## 9. Regression Checks Specific to New Architecture

Pass criteria:
- Installer artifact builds successfully on macOS
- First launch completes setup end-to-end
- `.setup-complete` marker created
- Relaunch does not reinstall dependencies
- At least one generation succeeds

Fail examples to record:
- `uv binary not found`
- Setup stuck during dependency install
- Marker not created
- Repeated setup on every launch
- Server fails to start on relaunch

---

## 10. Force Re-Test (Repair/Rebuild)

If you need to re-run first-time setup:

UI path:
- `Settings -> Environment -> Full rebuild`

Manual path (app closed):

```bash
rm -rf ~/Library/Application\ Support/com.privatevoice.desktop/python_env
```

Then relaunch app and re-run section 6.

---

## 11. What to Share Back

Capture and report:
1. mac model/chip (Apple Silicon vs Intel)
2. Build command result (`./scripts/build-release.sh`)
3. First-launch setup duration
4. `.setup-complete` contents (`gpu_target`, `uv_version`)
5. Whether second launch skipped setup
6. Any errors/log snippets and exact phase where they occurred

This will be enough to decide whether to merge this branch into `main`.

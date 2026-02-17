# 0217 MCP Round-Trip Test Report

Date: 2026-02-17 (local)
Repo: `/Users/jmoore/Documents/Github/PrivateVoice`
Branch: `codex/chatterbox-provider-modular-integration`

## 1) Clean Release Build (macOS Apple Silicon)

Command:

```bash
cd /Users/jmoore/Documents/Github/PrivateVoice/src-tauri
cargo clean
cd /Users/jmoore/Documents/Github/PrivateVoice
./scripts/build-release.sh
```

Result: success (`exit 0`)

Key outputs:
- App bundle: `/Users/jmoore/Documents/Github/PrivateVoice/src-tauri/target/release/bundle/macos/PrivateVoice.app`
- DMG: `/Users/jmoore/Documents/Github/PrivateVoice/src-tauri/target/release/bundle/dmg/PrivateVoice_1.0.1_aarch64.dmg`
- Bundle size (reported by script): `42M`
- DMG size (reported by script): `19M`

Warnings during compile:
- `unused import: gpu::GpuTarget` (`src/env_manager/mod.rs`)
- dead-code warning on `SetupMarker` fields in `src/env_manager/validate.rs`

No build errors.

## 2) Release App Startup Check

Command:

```bash
open "/Users/jmoore/Documents/Github/PrivateVoice/src-tauri/target/release/bundle/macos/PrivateVoice.app"
```

Observed process startup:
- App binary running: `.../PrivateVoice.app/Contents/MacOS/privatevoice`
- Embedded backend running: `/Users/jmoore/Library/Application Support/com.privatevoice.desktop/python_env/venv/bin/python -u -m tts_server.main`

Health check result (without API key):

```http
GET http://127.0.0.1:8765/health
HTTP/1.1 401 Unauthorized
{"detail":"Unauthorized"}
```

Interpretation:
- Release app starts successfully.
- Production backend auth is active (expected).

## 3) MCP Test Setup

To run full MCP tool round-trip with real generation, backend was started in dev mode (auth bypass for local MCP HTTP client):

```bash
cd /Users/jmoore/Documents/Github/PrivateVoice/python
TTS_SERVER_DEV=true /Users/jmoore/Documents/Github/PrivateVoice/python/.venv/bin/python -u -m tts_server.main
```

MCP server command used by client scripts:

```bash
uv run --directory /Users/jmoore/Documents/Github/PrivateVoice/privatevoice-control/mcp-server privatevoice-mcp
```

## 4) MCP Round-Trip Run A (catalog/load/generate wrappers)

Raw output: `/tmp/0217_mcp_raw.json`

Sequence and results:
1. `list_tools` -> success (9 tools)
2. `app_launch_and_verify` -> success (`already_running`)
3. `app_get_status` -> success
4. `app_get_model_catalog` -> success
- Catalog includes Qwen (`0.6b`, `1.7b`, `0.6b-base`, `1.7b-base`, `1.7b-design`) and Chatterbox (`turbo`, `original`, `multilingual`)
5. `app_trigger_action(load_model, {model_id:"0.6b"})` -> success
6. `app_get_model_status` -> success (`provider=qwen3`, `model_key=0.6b`, loaded)
7. `app_trigger_action(generate_speech, provider-aware)` -> returned compatibility error
- Error code surfaced by backend: `incompatible_model_mode`
- Cause: requested `model_key=qwen3-0.6b` while active was `0.6b`
8. `app_trigger_action(generate_custom_voice, legacy wrapper)` -> success
- Generated file: `/tmp/pv_generated_6ti8j3di.wav`
- Size: `225494` bytes

## 5) MCP Round-Trip Run B (normalized generate_speech success)

Raw output: `/tmp/0217_mcp_raw_fix.json`

Sequence and results:
1. `app_trigger_action(generate_speech)` with corrected `model_key=0.6b` -> success
- Generated file: `/tmp/pv_generated_asknxvrh.wav`
- Size: `325334` bytes
2. Initial verify call included unsupported arg `min_similarity` -> MCP schema validation error
3. `app_get_model_status` -> success (model still loaded)

## 6) MCP Speech Verification (correct schema)

Raw output: `/tmp/0217_mcp_verify.json`

Tool call:
- `verify_speech_accuracy(audio_path, expected_text, model="tiny", language="en")`

Result:
- Audio path: `/tmp/pv_generated_asknxvrh.wav`
- Transcription: `Second, MCP generations through generate speech and point for verification.`
- WER: `0.625`
- Passed: `false` (tool threshold `0.15`)
- Model used: `mlx-community/whisper-tiny`

Notes:
- This was a functional end-to-end verification run, but quality threshold failed with tiny Whisper.

## 7) MCP Chatterbox Provider Attempt

Raw output: `/tmp/0217_mcp_chatterbox_attempt.json`

Sequence and results:
1. `app_trigger_action(load_provider_model, {provider:"chatterbox", model_key:"turbo"})`
- Returned backend structured error:
  - `code`: `provider_runtime_missing`
  - message: `Chatterbox runtime is not available. Install provider dependencies from Settings, then retry.`
  - detail: `No module named 'chatterbox'`
2. `app_get_model_status` -> not loaded
3. `app_trigger_action(generate_speech, provider=chatterbox)`
- Returned incompatibility error because active provider not loaded

Interpretation:
- Provider-aware runtime-missing error handling is working.
- Chatterbox runtime installation path must be completed before generation succeeds.

## 8) Generated Audio Artifacts

Generated during this MCP run:
- `/tmp/pv_generated_6ti8j3di.wav` (legacy wrapper generation)
- `/tmp/pv_generated_asknxvrh.wav` (normalized `generate_speech` generation)

## 9) Git State

Before tests: working tree clean and branch synced with remote.

After creating this report: one new tracked file:
- `/Users/jmoore/Documents/Github/PrivateVoice/0217-mcptest.md`


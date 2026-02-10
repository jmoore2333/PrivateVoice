# PrivateVoice v1.0 -- Verified Feature Set

**Audit date:** 2026-02-10
**Method:** Empirical API testing (curl, Python requests, MCP tools), OpenAPI schema inspection, MCP status tools. No source code was read to discover features.
**App version:** 1.0.0
**Backend:** Python 3.11.14, PyTorch 2.10.0, FastAPI on 127.0.0.1:8765

---

## 1. Health and Status Monitoring

### GET /health
- **Verified:** Returns `{"status": "ok", "version": "1.0.0"}`
- Lightweight heartbeat for frontend polling

### GET /startup-status
- **Verified:** Returns current startup phase, human-readable message, and progress percentage (0-100)
- Observed phases: `starting-server` (5%), `starting-server` (10%), `checking-models` (20%), `downloading-model` (40%)
- When no model is loaded: `{"phase": "checking-models", "message": "Model unloaded, ready to load", "progress": 20}`

### GET /model-status
- **Verified:** Returns `loaded` (boolean), `model_id` (string or null), `device` (string or null), and `memory` object
- Memory object includes `device`, `total_gb`, `available_gb`
- Correctly reflects model load/unload state transitions

### GET /system-info
- **Verified:** Returns comprehensive system information:
  - `python_version`: "3.11.14"
  - `torch_version`: "2.10.0"
  - `device`: "mps" (Apple Silicon detected)
  - `device_name`: "Apple Silicon (MPS)"
  - `memory_total_gb`: 16.0
  - `memory_available_gb`: dynamically reported
  - `cache_dir`: HuggingFace cache directory path
  - `model_memory_requirements`: map of model_id to GB needed (0.6b=8, 0.6b-base=8, 1.7b=12, 1.7b-base=12, 1.7b-design=12)
  - `supported_mp3_bitrates`: [128, 192, 256, 320]

### GET /download-progress
- **Verified:** Returns download status with `status`, `file_name`, `bytes_downloaded`, `bytes_total`, `speed_mbps`, `eta`
- When idle: `{"status": "complete", "file_name": "Fetching 13 files", "bytes_downloaded": 13, "bytes_total": 13, ...}`

### GET /logs
- **Verified:** Returns array of log entries with `level`, `message`, `timestamp`
- Supports query parameters: `count` (default 100), `level` (filter by minimum level)
- Tested: `?count=5&level=INFO` returns 5 most recent INFO+ entries
- Tested: `?level=ERROR` returns only error entries

---

## 2. Content Discovery

### GET /speakers
- **Verified:** Returns simple list of 9 speaker names:
  `aiden`, `dylan`, `eric`, `ono_anna`, `ryan`, `serena`, `sohee`, `uncle_fu`, `vivian`

### GET /speakers-info
- **Verified:** Returns detailed speaker metadata for all 9 speakers:
  - Each entry has: `name`, `description`, `native_language`, `personality`, `gender`
  - Genders: 5 male (aiden, dylan, eric, ryan, uncle_fu), 4 female (vivian, serena, ono_anna, sohee)
  - Languages: Chinese (vivian, serena, uncle_fu, dylan, eric), English (ryan, aiden), Japanese (ono_anna), Korean (sohee)
  - Descriptions include voice quality and personality traits

### GET /languages
- **Verified:** Returns 10 supported languages:
  Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian

---

## 3. Model Management

### GET /memory-check/{model_id}
- **Verified:** Returns `required_gb`, `available_gb`, `sufficient` (boolean), and optional `warning`
- Tested for all 5 model IDs:
  - `0.6b`: requires 8GB
  - `0.6b-base`: requires 8GB
  - `1.7b`: requires 12GB
  - `1.7b-base`: requires 12GB
  - `1.7b-design`: requires 12GB
- **Finding:** Invalid model IDs default to 8GB requirement rather than returning an error
- **Finding:** Memory check is advisory only -- load-model does NOT block on insufficient memory

### POST /load-model
- **Verified:** Accepts `{"model_id": "0.6b"}` (defaults to "0.6b" if omitted)
- Successfully loaded 0.6b model even with only 5.8GB available (advisory check said 8GB needed)
- Available memory dropped from ~5.9GB to ~3.6GB after loading
- **Finding:** Accepts invalid model IDs without validation (returns `"status": "loaded"` for `"invalid_model"`)

### POST /unload-model
- **Verified:** Returns `{"status": "unloaded"}`
- Correctly frees memory after unloading
- Safe to call when no model is loaded

---

## 4. Speech Generation -- Custom Voice

### POST /generate/custom-voice
- **Verified:** JSON request body with fields:
  - `text` (required)
  - `speaker` (default: "serena")
  - `instruction` (default: "" -- style guidance)
  - `language` (default: "english")
  - `format` (default: "wav")
  - `mp3_bitrate` (default: 192)

**Test results:**
| Test | Result | Details |
|------|--------|---------|
| English with "aiden" speaker | PASS | 194KB WAV, 4.06s, 24kHz mono 16-bit |
| English with "serena" + instruction | PASS | 71KB WAV |
| Chinese with "vivian" speaker | PASS | 218KB WAV |
| Japanese with "ono_anna" speaker | PASS | 71KB WAV |
| MP3 format output | FAIL | 500 error: `'bytearray' object has no attribute 'encode'` |
| Empty text | Unexpected | Returns 167KB WAV (should reject with error) |
| No model loaded | PASS | Returns 400: `"Model not loaded"` |
| Missing required text field | PASS | Returns 422 validation error |

**Audio quality verified:** Transcription of generated "Hello, this is a test of private voice text to speech" returned 98.85% confidence via backend Whisper, perfect text match.

---

## 5. Speech Generation -- Voice Clone

### POST /generate/voice-clone
- **Verified:** Multipart form-data with fields:
  - `text` (required)
  - `reference_audio` (required, binary file)
  - `reference_text` (default: "")
  - `x_vector_only_mode` (default: false -- low-quality mode, no transcript needed)
  - `language` (default: "english")
  - `format` (default: "wav")
  - `mp3_bitrate` (default: 192)

**Test results:**
| Test | Result | Details |
|------|--------|---------|
| With CustomVoice model (0.6b) | FAIL (expected) | 500: "does not support generate_voice_clone" |
| With x_vector_only_mode + wrong model | FAIL (expected) | Same model compatibility error |
| Without model loaded | PASS | Returns 400: "Model not loaded" |

**Note:** Requires a Base model (0.6b-base or 1.7b-base) to actually generate. Could not test full flow due to memory constraints.

---

## 6. Speech Generation -- Voice Design

### POST /generate/voice-design
- **Verified:** JSON request body with fields:
  - `text` (required)
  - `voice_description` (required)
  - `language` (default: "english")
  - `format` (default: "wav")
  - `mp3_bitrate` (default: 192)

**Test results:**
| Test | Result | Details |
|------|--------|---------|
| With CustomVoice model (0.6b) | FAIL (expected) | 400: "Voice Design requires the 1.7B-VoiceDesign model" |
| Without model loaded | PASS | Returns 400: "Model not loaded" |

**Note:** Requires 1.7b-design model. Could not test full flow due to memory constraints (needs 12GB).

---

## 7. Whisper Transcription

### GET /whisper-status
- **Verified:** Returns `loaded` (boolean), `model_size` (string or null), `device` (string)
- Device defaults to "cpu" for Whisper models

### GET /whisper-models
- **Verified:** Returns 6 available Whisper model sizes:
  | Size | Parameters | Download (MB) |
  |------|-----------|---------------|
  | tiny | 39M | 75 |
  | base | 74M | 145 |
  | small | 244M | 465 |
  | medium | 769M | 1500 |
  | large-v3 | 1.5B | 3100 |
  | large-v3-turbo | 809M | 1600 |

### POST /load-whisper
- **Verified:** Accepts `{"model_size": "tiny"}` (defaults to "base")
- Successfully loaded tiny model (75MB)
- **Validated:** Rejects invalid sizes with descriptive error listing valid options

### POST /unload-whisper
- **Verified:** Returns `{"status": "unloaded"}`

### POST /transcribe
- **Verified:** Multipart form-data with `audio` (required, binary file)
- Returns: `text`, `language`, `confidence`, `duration_seconds`

**Test results:**
| Test | Result | Details |
|------|--------|---------|
| Transcribe generated speech (4.06s WAV) | PASS | Text: "Hello, this is a test of private voice text to speech.", lang: "en", confidence: 0.9885 |
| Transcribe sine wave (no speech) | PASS | Text: "", lang: "en", confidence: 0.2565 |
| Without Whisper loaded | PASS | Returns 400: "Whisper model not loaded" |

---

## 8. Error Handling

| Scenario | HTTP Status | Error Response | Verdict |
|----------|-------------|----------------|---------|
| Generate without model | 400 | "Model not loaded" | Correct |
| Voice clone with wrong model type | 500 | Detailed model compatibility message | Correct (should be 400) |
| Voice design with wrong model type | 400 | "Voice Design requires the 1.7B-VoiceDesign model" | Correct |
| Transcribe without Whisper | 400 | "Whisper model not loaded" | Correct |
| Missing required field | 422 | Pydantic validation error with field location | Correct |
| Invalid Whisper model size | 400 | Lists valid sizes | Correct |
| Invalid TTS model ID | 200 | Loads anyway (no validation) | BUG |
| Empty text to generate | 200 | Generates audio | QUESTIONABLE |
| MP3 format generation | 500 | 'bytearray' object has no attribute 'encode' | BUG |
| Memory check for invalid model ID | 200 | Defaults to 8GB requirement | QUESTIONABLE |

---

## 9. API Infrastructure

### OpenAPI Documentation
- **Verified:** `/docs` (Swagger UI) accessible at http://127.0.0.1:8765/docs
- **Verified:** `/redoc` (ReDoc) accessible at http://127.0.0.1:8765/redoc
- **Verified:** `/openapi.json` returns full schema with 21 endpoints

### CORS Configuration
- **Verified:** Allows `http://localhost:1420` (Vite dev server)
- **Finding:** Also allows any origin (tested with `http://evil.com`). Acceptable for localhost-only service.
- Credentials: allowed
- Max age: 600 seconds

### POST /shutdown
- **Verified:** Endpoint exists per OpenAPI spec (not tested to avoid killing the running server)

---

## 10. Features from PRODUCTION_TEST_PROCEDURE.md Cross-Reference

Features mentioned in the test procedure that could NOT be verified via API alone:

| Feature | Status | Reason |
|---------|--------|--------|
| Onboarding/Welcome screen | Not testable | Frontend-only UI feature |
| Mode tab switching UI | Not testable | Frontend UI |
| Model compatibility indicators (orange dots) | Not testable | Frontend UI |
| Settings panel open/close | Not testable | Frontend UI |
| Help panel | Not testable | Frontend UI |
| Library drawer UI | Not testable | Frontend UI |
| Debug console UI | Not testable | Frontend UI |
| Theme switching (dark/light) | Not testable | Frontend UI |
| Export via native Tauri dialog | Not testable | Requires Tauri runtime |
| Library file persistence (Tauri FS) | Not testable | Requires Tauri runtime |
| Audio playback in output panel | Not testable | Frontend UI |
| Voice Clone recording (mic access) | Not testable | Requires production build |
| Keyboard navigation | Not testable | Frontend UI |
| Visual validation at 4 resolutions | Not testable | Requires Playwright E2E |
| Style instruction presets | Not testable | Frontend UI |
| Speaker selector dropdown | Not testable | Frontend UI |
| Generate button enable/disable states | Not testable | Frontend UI |

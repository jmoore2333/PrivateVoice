# Python Backend API Reference

Base URL: `http://127.0.0.1:8765`

## Health & Status

| Endpoint | Method | Response | Used By |
|---|---|---|---|
| `/health` | GET | `{status, version}` | Startup polling |
| `/startup-status` | GET | `{phase, message, progress}` | StartupScreen |
| `/download-progress` | GET | `{status, file_name, bytes_downloaded, bytes_total, speed_mbps, eta}` | DownloadProgress.svelte |
| `/model-status` | GET | `{loaded, model_id, device, memory}` | Model status polling |
| `/memory-check/{model_id}` | GET | `{required_gb, available_gb, sufficient, warning}` | Pre-load memory check |

`/memory-check/{model_id}` validates model IDs and returns HTTP 400 for unknown IDs.

## System Info

| Endpoint | Method | Response | Used By |
|---|---|---|---|
| `/system-info` | GET | `{python_version, torch_version, device, device_name, memory_total_gb, memory_available_gb, cache_dir, model_memory_requirements, supported_mp3_bitrates}` | HelpSystem/Settings |
| `/logs` | GET | `[{level, message, timestamp}]` | Debug panel |

## Speakers & Languages

| Endpoint | Method | Response | Used By |
|---|---|---|---|
| `/speakers` | GET | `{speakers: string[]}` | Speaker dropdown |
| `/speakers-info` | GET | `[{name, description, native_language, personality, gender}]` | Speaker cards |
| `/languages` | GET | `{languages: string[]}` | Language dropdown |

## Model Management

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/load-model` | POST | `{model_id}` | `{status, model_id}` | Runs in background thread (asyncio.to_thread). Validates model ID — returns 400 for unknown IDs. |
| `/unload-model` | POST | — | `{status}` | Frees GPU memory |

## Generation

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/generate/custom-voice` | POST | JSON `{text, speaker, instruction, language, format, mp3_bitrate}` | audio bytes | CustomVoice mode |
| `/generate/voice-clone` | POST | multipart `{text, reference_text, reference_audio, x_vector_only_mode, language, format, mp3_bitrate}` | audio bytes | Base model required |
| `/generate/voice-design` | POST | JSON `{text, voice_description, language, format, mp3_bitrate}` | audio bytes | VoiceDesign model required |

All generation endpoints support `mp3_bitrate` parameter (default 192, validated against [128, 192, 256, 320]).

**Text validation:** All generation endpoints reject empty or whitespace-only text with HTTP 400. Maximum text length is 2000 characters.

**Error codes:**
- **400** — Client error: empty text, text exceeds 2000 chars, incompatible model type, invalid model ID
- **499** — Generation was cancelled via `/cancel-generation`
- **500** — Server error: inference failure, model not loaded

## Generation Control

| Endpoint | Method | Response | Notes |
|---|---|---|---|
| `/cancel-generation` | POST | `{status: "cancelled"}` | Cooperative cancellation — sets a flag checked between generation steps |

## Whisper Transcription

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/whisper-status` | GET | — | `{loaded, model_size, device}` | Whisper model state |
| `/whisper-models` | GET | — | `[{size, parameters, download_size_mb}]` | 6 available sizes: tiny, base, small, medium, large-v3, large-v3-turbo |
| `/load-whisper` | POST | `{model_size}` | `{status, model_size}` | Loads via faster-whisper (CTranslate2), runs on CPU |
| `/unload-whisper` | POST | — | `{status}` | Frees whisper model memory |
| `/transcribe` | POST | multipart `{audio}` | `{text, language, confidence, duration_seconds}` | Requires Whisper model loaded |

Whisper is used in the UI for auto-transcription in Voice Clone mode. Enable it in Settings > Optional Features.

## Lifecycle

| Endpoint | Method | Notes |
|---|---|---|
| `/shutdown` | POST | Graceful shutdown, sends SIGTERM |

## Notes

**CORS:** The server only accepts requests from known origins: `http://localhost:1420`, `http://127.0.0.1:1420`, `tauri://localhost`, and `https://tauri.localhost`.

**API documentation:** Interactive Swagger UI (`/docs`) and ReDoc (`/redoc`) are disabled in production. Set the environment variable `TTS_SERVER_DEV=true` to enable them during development.

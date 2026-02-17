# Python Backend API Reference

Base URL: `http://127.0.0.1:8765`

Authentication: In production, requests require `X-API-Key` (the app injects this automatically). In dev mode (`TTS_SERVER_DEV=true`) auth may be disabled if no token is configured.

## Health & Status

| Endpoint | Method | Response | Used By |
|---|---|---|---|
| `/health` | GET | `{status, version}` | Startup polling |
| `/startup-status` | GET | `{phase, message, progress}` | StartupScreen |
| `/download-progress` | GET | `{status, file_name, bytes_downloaded, bytes_total, speed_mbps, eta}` | DownloadProgress.svelte |
| `/model-status` | GET | `{loaded, model_id, device, memory, provider?, model_key?, capabilities?, languages?, display_name?}` | Model status polling |
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
| `/model-catalog` | GET | — | `[{provider, model_key, legacy_model_id?, display_name, capabilities[], languages[], description?, advanced_controls[], size_gb?}]` | Provider/model capability metadata |
| `/load-model` | POST | Legacy: `{model_id}` or provider-aware: `{provider, model_key}` | `{status, provider, model_key, model_id, display_name}` | Runs in background thread (asyncio.to_thread). Validates selection and compatibility. |
| `/unload-model` | POST | — | `{status}` | Frees GPU memory |

## Generation

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/generate/speech` | POST | JSON `{mode, text, provider?, model_key?, format?, mp3_bitrate?, seed?, sample_rate?, bit_depth?, params?, reference_audio_base64?, advanced?}` | audio bytes | Normalized provider-aware generation route |
| `/generate/custom-voice` | POST | JSON `{text, speaker, instruction, language, format, mp3_bitrate, stable_lead_in, seed?, sample_rate?, bit_depth?}` | audio bytes | CustomVoice mode |
| `/generate/voice-clone` | POST | multipart `{text, reference_text, reference_audio, x_vector_only_mode, language, format, mp3_bitrate, seed?, sample_rate?, bit_depth?}` | audio bytes | Base model required |
| `/generate/voice-design` | POST | JSON `{text, voice_description, language, format, mp3_bitrate, stable_lead_in, seed?, sample_rate?, bit_depth?}` | audio bytes | VoiceDesign model required |
| `/generate/batch` | POST | JSON `{mode, language, format, mp3_bitrate, seed?, sample_rate?, bit_depth?, speaker?, instruction?, voice_description?, stable_lead_in?, reference_text?, reference_audio_base64?, x_vector_only_mode?, items[]}` | ZIP bytes | Batch generation across `custom-voice` / `voice-clone` / `voice-design` |

All generation endpoints support `mp3_bitrate` parameter (default 192, validated against [128, 192, 256, 320]).
All generation endpoints support `format` (`wav` or `mp3`).
When format is WAV, `sample_rate` is optional (allowed: 8000, 16000, 22050, 24000, 44100, 48000) and `bit_depth` is supported (allowed: 16, 24, 32).
`seed` is optional and enables reproducible sampling behavior when reusing the same model/runtime context.
`stable_lead_in` is optional for Custom Voice and Voice Design (default `true`), and reduces front-loaded filler/disfluency by using a more stable generation path.

**Text validation:** Generation endpoints reject empty or whitespace-only text with HTTP 400. Maximum text length is 2000 characters (for batch, this is validated per item).

**Error codes:**
- **400** — Client error: empty text, text exceeds 2000 chars, unsupported sample rate/bit depth, incompatible model type, invalid mode/model/input
- **499** — Generation was cancelled via `/cancel-generation`
- **500** — Server error: inference failure, model not loaded

Provider-aware errors may return structured `detail` payloads with machine-readable codes:
- `incompatible_model_mode`
- `provider_runtime_missing`
- `provider_feature_unsupported`
- `invalid_provider_params`

## Generation Control

| Endpoint | Method | Response | Notes |
|---|---|---|---|
| `/batch-progress` | GET | `{total, completed, current_item, status}` | Current batch job progress state |
| `/cancel-generation` | POST | `{status: "cancelled"}` | Cooperative cancellation — sets a flag checked between generation steps |

## Whisper Transcription

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/whisper-status` | GET | — | `{loaded, model_size, device}` | Whisper model state |
| `/whisper-models` | GET | — | `[{size, parameters, download_size_mb}]` | 6 available sizes: tiny, base, small, medium, large-v3, large-v3-turbo |
| `/load-whisper` | POST | `{model_size}` | `{status, model_size}` | Loads via faster-whisper (CTranslate2), runs on CPU |
| `/unload-whisper` | POST | — | `{status}` | Frees whisper model memory |
| `/transcribe` | POST | multipart `{audio, task?}` | `{text, language, confidence, duration_seconds}` | `task` can be `transcribe` (default) or `translate` (English translation); requires Whisper model loaded |

Whisper is used in the UI for auto-transcription in Voice Clone mode. Enable it in Settings > Optional Features.

## Local Text Translation

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/translation-status` | GET | — | `{loaded, model_key, model_id, device}` | Translation model load state. |
| `/translation-models` | GET | — | `[{key, label, model_id, parameters, download_size_mb}]` | Available local translation model options and estimated sizes. |
| `/load-translation` | POST | `{model_key}` | `{status, model_key}` | Downloads/loads selected translation model. |
| `/unload-translation` | POST | — | `{status}` | Unloads translation model from memory. |
| `/translate-text` | POST | `{text, target_language, source_language?}` | `{text, source_language, target_language}` | Local translation for text inputs. Requires translation model loaded. `source_language` defaults to `auto` detection. |

`/translate-text` validation and behavior:
- Returns HTTP 400 if text is empty
- Returns HTTP 400 if text exceeds 2000 chars
- Returns HTTP 400 if translation model is not loaded
- Returns HTTP 400 for unsupported languages
- Returns original text unchanged when source and target resolve to the same language

## Lifecycle

| Endpoint | Method | Notes |
|---|---|---|
| `/shutdown` | POST | Graceful shutdown, sends SIGTERM |

## Notes

**CORS:** The server is localhost-only and allows specific local origins:
- `tauri://localhost`
- `https://tauri.localhost`
- `http://tauri.localhost`
- `http://localhost`
- `http://127.0.0.1`
- plus dev origins (`http://localhost:1420`, `http://127.0.0.1:1420`) when `TTS_SERVER_DEV=true`.

**API documentation:** Interactive Swagger UI (`/docs`) and ReDoc (`/redoc`) are disabled in production. Set the environment variable `TTS_SERVER_DEV=true` to enable them during development.

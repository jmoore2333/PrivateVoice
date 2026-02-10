# Python Backend API Reference

## Health & Status

| Endpoint | Method | Response | Used By |
|---|---|---|---|
| `/health` | GET | `{status, version}` | Startup polling |
| `/startup-status` | GET | `{phase, message, progress}` | StartupScreen |
| `/download-progress` | GET | `{status, file_name, bytes_downloaded, bytes_total, speed_mbps, eta}` | DownloadProgress.svelte |
| `/model-status` | GET | `{loaded, model_id, device, memory}` | Model status polling |
| `/memory-check/{model_id}` | GET | `{required_gb, available_gb, sufficient, warning}` | Pre-load memory check |

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
| `/load-model` | POST | `{model_id}` | `{status, model_id}` | Runs in background thread (asyncio.to_thread) |
| `/unload-model` | POST | — | `{status}` | Frees GPU memory |

## Generation

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/generate/custom-voice` | POST | JSON `{text, speaker, instruction, language, format, mp3_bitrate}` | audio bytes | CustomVoice mode |
| `/generate/voice-clone` | POST | multipart `{text, reference_text, reference_audio, x_vector_only_mode, language, format, mp3_bitrate}` | audio bytes | Base model required |
| `/generate/voice-design` | POST | JSON `{text, voice_description, language, format, mp3_bitrate}` | audio bytes | VoiceDesign model required |

All generation endpoints support `mp3_bitrate` parameter (default 192, validated against [128, 192, 256, 320]).

## Lifecycle

| Endpoint | Method | Notes |
|---|---|---|
| `/shutdown` | POST | Graceful shutdown, sends SIGTERM |

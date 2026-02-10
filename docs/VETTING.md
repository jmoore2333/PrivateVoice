# Vetting Checklist

Date: 2026-02-03 (initial), updated 2026-02-05
Branch: codex/vetting-2026-02-03
Version: 1.0.0

**Scope**
- Validate production macOS build behavior and UX.
- Validate voice clone recording in production build.
- Validate feature parity between 0.6B and 1.7B.
- Defer automated testing until after manual checkpoint.

## Initial Manual Vetting (2026-02-03)

| ID | Check | Expected | Result | Notes |
| --- | --- | --- | --- | --- |
| 1 | Production build launch | App opens, sidecar starts, loading screen clears | Partial | Launches; startup details view added, but logs don't appear during startup. |
| 2 | First-run onboarding | Welcome shown once, model selection triggers download |  | Not observed in this run. |
| 3 | Model download progress | Status shows progress and completes | Partial | Downloads happen but user-facing progress is unclear. |
| 4 | Model switching | 0.6B <-> 1.7B switches cleanly | Partial | Switching works; long waits with minimal feedback. |
| 5 | Voice Design gating | Warning appears without 1.7B-Design | Pass | Warning + load required model works. |
| 6 | Custom Voice (0.6B) | Generates audio, waveform renders, playback works | Pass | Works. |
| 7 | Custom Voice (1.7B) | Generates audio, waveform renders, playback works |  | Not re-tested. |
| 8 | Voice Clone Import (0.6B) | Import + transcript generates audio | Pass | Works with 0.6B Base model. |
| 9 | Voice Clone Import (1.7B) | Import + transcript generates audio | Pass | Works with 1.7B Base model. |
| 10 | Voice Clone Record (prod) | Mic prompt appears, live waveform, generate works | Pass | Recording works; playback added; generate works. |
| 11 | Voice Clone error handling | Denied mic shows helpful error |  | Not tested. |
| 12 | Voice Design (1.7B-Design) | Generates and plays audio | Pass | Generates expected audio. |
| 13 | Export | WAV/MP3 saved with correct filename format |  | Needs production build test. |
| 14 | Library | Save/recents persist and play after relaunch |  | Needs production build test. |
| 15 | Settings persistence | Theme, defaults, auto-load persist |  | Needs production build test. |
| 16 | Debug console | Logs and system info visible | Partial | Logs visible. |
| 17 | Keyboard shortcuts | Cmd+Enter, Cmd+S, Cmd+1/2/3, Space work |  | Needs testing. |
| 18 | Offline after download | Works without network once models cached |  | Needs testing. |

## Fixes Applied (2026-02-05)

| Issue | Fix | Phase |
|-------|-----|-------|
| Voice Clone low-quality mode crashed (missing `x_vector_only_mode` param) | Added param to `inference.py:generate_voice_clone()` | 1.1 |
| `[object Object]` error display | `ttsClient.ts:readErrorMessage()` handles all FastAPI error shapes | 1.2 |
| Language selector not wired to backend | Threaded language through UI → store → client → API → inference | 1.3 |
| Mode switch preserved stale audio | `setMode()` revokes URL, clears blob/error | 1.4 |
| Startup logs overwritten by empty API response | Changed `fetchLogs` to `replace: false` during startup | 2.1 |
| `pad_token_id` warning noise | Set `pad_token_id = eos_token_id` after model load | 2.3 |
| Space bar play/pause not wired | Added `playPause()` export to WaveformPlayer, wired via OutputPanel | 3.1 |
| "Use Voice" from library not implemented | Implemented full metadata restore on library item use | 3.2 |
| Export used browser download hack | Native Tauri save dialog with browser fallback | 4.1 |
| Library lost audio on restart (localStorage) | File-based persistence via Tauri FS plugin | 4.2 |
| Export folder setting was display-only | Browse button with native directory picker | 4.3 |
| No MP3 export | lameenc-based MP3 encoding, format param through full stack | MP3 |
| No input validation | Text max 2000 chars, audio max 50MB | 5.1 |
| No generation cancel | AbortController + 5-min timeout, Cancel button | 5.2 |
| Hardcoded system info in Settings | Reactive values from `debugStore.state.systemInfo` | 5.3 |
| No CUDA detection | MPS > CUDA > CPU priority in device.py | 7.1 |
| Platform-specific code hardcoded for macOS | Abstracted paths and process management in lib.rs | 7.2 |
| Build scripts macOS-only | OS detection in build_sidecar.sh, dynamic arch in .spec | 7.3 |
| Whisper/Translation toggles appeared functional but did nothing | Replaced with disabled "Coming Soon" state | UI cleanup |

## Known Limitations (v1.0.0)

- **Whisper auto-transcription**: Settings toggle exists but disabled (coming in future release)
- **Translation support**: Settings toggle exists but disabled (coming in future release)
- **Cross-platform**: Device detection and build scripts support CUDA/Windows/Linux but not yet tested on those platforms
- **MP3 quality**: Now configurable (128/192/256/320 kbps) via API; frontend bitrate selector in Settings is a future enhancement
- **Library in dev mode**: Falls back to localStorage (metadata only, no audio persistence)
- **Streaming generation**: Models support streaming but app uses non-streaming with elapsed time display

## v1.0-release Sprint Fixes

| Issue | Resolution |
|-------|------------|
| Model/mode incompatibility shows cryptic error | Orange dot indicators + one-click model switch banner |
| No download progress for HuggingFace models | Two-phase loading with snapshot_download + progress tracking |
| No generation progress feedback | Elapsed time spinner on all generate buttons + cancel |
| UI is themed stubs, not production layout | Multi-column macOS layout with information hierarchy |
| No help system | 6 troubleshooting guides, speaker gallery, keyboard shortcuts |
| Voice Design/Clone panels lack guidance | Description templates, step-flow indicators, character counter |
| MP3 bitrate not configurable | Configurable 128-320 kbps via API parameter |
| No memory check before model load | `/memory-check/{model_id}` endpoint with RAM validation |
| Library writeAudioFile has no error handling | Added try/catch with re-throw to prevent orphaned metadata |
| Non-atomic library save can desync | Audio write failure now aborts before index update |
| Missing audio files silently dropped | Logged with warnings including item name/id |
| App unusable at many resolutions | Responsive layout with md breakpoint stacking, tested at 4 sizes |
| Only 1 E2E test | 93 E2E tests (56 functional + 37 visual validation) |

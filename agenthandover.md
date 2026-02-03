# Agent Handover Document

**Last Updated:** January 30, 2026
**Project:** PrivateVoice (Qwen3-TTS Desktop)
**Status:** Active Development - Core Features Complete

---

## Quick Context

PrivateVoice is a macOS desktop app for local text-to-speech using Qwen3-TTS. It runs entirely on-device using Apple Silicon (MPS) acceleration. The app has three TTS modes: Custom Voice (preset speakers), Voice Clone (from audio samples), and Voice Design (from text descriptions).

**Tech Stack:**
- Frontend: Svelte 5 (with runes), Tailwind CSS 4, TypeScript
- Desktop: Tauri 2 (Rust)
- Backend: Python FastAPI sidecar with Qwen3-TTS
- Testing: Vitest (unit), Playwright (E2E)

---

## Current Development State

### What's Working

| Feature | Status | Notes |
|---------|--------|-------|
| Custom Voice Mode | ✅ Working | 9 preset speakers + style instructions |
| Voice Design Mode | ✅ Working | Generate voices from text descriptions |
| Voice Clone Mode | ⚠️ Partial | Import audio works; recording needs production build |
| Model Loading | ✅ Working | Auto-loads on startup, can switch models |
| Model Selector | ✅ Working | Dropdown in header to switch between 0.6B/1.7B/1.7B-Design |
| Audio Playback | ✅ Working | WaveSurfer.js with waveform visualization |
| Audio Export | ✅ Working | Downloads as `PrivateVoice_{Mode}_{Date}_{Time}.wav` |
| Settings Panel | ✅ Working | Persists to localStorage |
| Debug Console | ✅ Working | Logs, system info tabs |
| Onboarding | ✅ Working | First-launch model selection |
| Unit Tests | ✅ Passing | 41 tests across 8 files |
| E2E Tests | ✅ Passing | 7 tests (1 skipped for server-dependent) |
| CI Pipeline | ✅ Working | GitHub Actions runs lint, typecheck, tests, build |

### Known Limitations

1. **Microphone Recording in Dev Mode**
   - `navigator.mediaDevices` is not available in Tauri's WebView during development
   - Workaround: Use Import button to upload audio files
   - Solution: Test with production build (`pnpm tauri build`)
   - Info.plist with `NSMicrophoneUsageDescription` has been added

2. **Export Format**
   - Only WAV export currently works
   - MP3 option commented out in settings (backend only produces WAV)
   - MP3 would require audio encoding in Python backend

3. **Model Download**
   - First model load downloads 1.2-3.4GB from HuggingFace
   - No progress indicator during download (shows "Loading...")

---

## Recent Session Changes (January 30, 2026)

### 1. Export Functionality Fixed
**Files changed:**
- `src/lib/stores/ttsStore.svelte.ts` - Updated `downloadAudio()` function

**What was done:**
- Filenames now follow pattern: `PrivateVoice_CustomVoice_2026-01-30_143019.wav`
- Reads `exportFormat` from settings (but only WAV works currently)
- Added import of `settingsStore` to access settings

### 2. Voice Clone Recording Improvements
**Files changed:**
- `src/lib/components/input/AudioRecorder.svelte`
- `src-tauri/Info.plist` (new file)

**What was done:**
- Added detection for missing `navigator.mediaDevices` API
- Shows helpful message when recording isn't available
- Disables Record button with tooltip explaining to use Import
- Added `scrollingWaveform: true` for live visualization (when supported)
- Added `record-progress` event for accurate timing
- Added error handling with specific messages for permission denied/no microphone
- Created Info.plist with `NSMicrophoneUsageDescription` for production builds

### 3. README Updated
**Files changed:**
- `README.md`

**What was done:**
- Added "Building for Local Testing" section with production build instructions
- Updated Project Status table with current feature completion
- Added Known Limitations section
- Expanded Troubleshooting with recording issues

---

## Key Files Reference

### Frontend (Svelte)
```
src/
├── routes/
│   └── +page.svelte          # Main app page, orchestrates all components
├── lib/
│   ├── stores/
│   │   ├── ttsStore.svelte.ts      # TTS state, generation, model loading
│   │   ├── settingsStore.svelte.ts # Persistent settings
│   │   ├── debugStore.svelte.ts    # Debug console state
│   │   └── libraryStore.svelte.ts  # Audio library (recent/saved)
│   ├── components/
│   │   ├── layout/
│   │   │   └── Header.svelte       # Mode selector, model dropdown, status
│   │   ├── input/
│   │   │   ├── CustomVoicePanel.svelte  # Speaker + instruction mode
│   │   │   ├── VoiceClonePanel.svelte   # Reference audio + transcript
│   │   │   ├── VoiceDesignPanel.svelte  # Voice description input
│   │   │   ├── AudioRecorder.svelte     # Record/import reference audio
│   │   │   └── TextInput.svelte         # Main text input
│   │   ├── output/
│   │   │   └── OutputPanel.svelte       # Playback, waveform, export
│   │   ├── settings/
│   │   │   └── SettingsPanel.svelte     # Settings slide-out panel
│   │   ├── debug/
│   │   │   └── DebugConsole.svelte      # Debug panel
│   │   └── onboarding/
│   │       └── Welcome.svelte           # First-launch onboarding
│   └── api/
│       └── ttsClient.ts         # HTTP client for Python backend
```

### Backend (Tauri + Python)
```
src-tauri/
├── tauri.conf.json      # Tauri configuration (window, bundle, security)
├── Info.plist           # macOS permissions (microphone)
├── capabilities/
│   └── default.json     # Tauri permissions for shell, etc.
└── src/
    └── lib.rs           # Rust backend (minimal, mostly shell spawning)

tts-server/
└── server.py            # Python FastAPI server with Qwen3-TTS
```

### Tests
```
src/lib/stores/*.test.ts           # Store unit tests
src/lib/components/**/*.test.ts    # Component tests
e2e/example.spec.ts                # Playwright E2E tests (with CI mocks)
```

---

## Commands Reference

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start Vite dev server (frontend only)
pnpm tauri dev            # Start full Tauri app in dev mode

# Testing
pnpm test                 # Run unit tests
pnpm test:coverage        # Run with coverage report
pnpm test:e2e             # Run Playwright E2E tests
pnpm check                # TypeScript/Svelte type checking

# Building
pnpm build                # Build frontend
pnpm tauri build          # Build production Tauri app

# Python server (separate terminal)
cd tts-server && python server.py
```

---

## Immediate Next Steps

1. **Test Voice Clone Recording in Production Build**
   ```bash
   pnpm tauri build
   open src-tauri/target/release/bundle/macos/PrivateVoice.app
   ```
   - Verify microphone permission prompt appears
   - Test recording with live waveform
   - Verify recorded audio works with voice cloning

2. **If Recording Works:**
   - Test full voice clone flow end-to-end
   - Verify the cloned voice sounds correct
   - Test with different audio lengths (5s, 10s, 15s)

3. **If Recording Doesn't Work:**
   - Check Console.app for permission errors
   - Verify Info.plist is included in bundle
   - May need code signing for microphone access

---

## Architecture Notes

### Model Compatibility Matrix
```typescript
const MODEL_CAPABILITIES: Record<string, TTSMode[]> = {
  "0.6b": ["custom-voice", "voice-clone"],
  "1.7b": ["custom-voice", "voice-clone"],
  "1.7b-design": ["voice-design"],
};
```

### Settings Persistence
Settings are stored in `localStorage` under key `qwen3-tts-settings`. Key settings:
- `defaultModel`: Which model to auto-load
- `autoLoadModel`: Whether to load model on startup
- `exportFormat`: "wav" (mp3 not yet supported)
- `hasCompletedOnboarding`: Skip welcome screen

### API Endpoints (Python Backend)
- `GET /health` - Health check
- `GET /model-status` - Current loaded model info
- `GET /speakers` - List of preset speakers
- `POST /load-model` - Load a model by ID
- `POST /generate/custom-voice` - Generate with preset speaker
- `POST /generate/voice-clone` - Clone from reference audio
- `POST /generate/voice-design` - Generate from description

---

## Gotchas & Tips

1. **Svelte 5 Runes**: This project uses Svelte 5 with runes (`$state`, `$derived`, `$effect`, `$props`). Don't use Svelte 4 syntax.

2. **CI E2E Tests**: E2E tests mock the API in CI mode (`isCI = !!process.env.CI`). Real server tests are skipped in CI.

3. **WaveSurfer RecordPlugin**: The `scrollingWaveform` option shows live visualization during recording, but only works when `navigator.mediaDevices` is available.

4. **Model Loading**: The `ttsStore.loadModel()` function is async. The UI shows "Loading..." status during load. Model info comes from `/model-status` endpoint.

5. **Tauri WebView Limitations**: Some Web APIs (like `navigator.mediaDevices`) may not work in development mode on macOS. Test with production builds for full functionality.

---

## Files Modified This Session

| File | Change |
|------|--------|
| `src/lib/stores/ttsStore.svelte.ts` | Export filename format, import settingsStore |
| `src/lib/components/input/AudioRecorder.svelte` | Microphone detection, error handling, UI improvements |
| `src/lib/components/settings/SettingsPanel.svelte` | Commented out MP3 option |
| `src-tauri/Info.plist` | New file - microphone permission |
| `README.md` | Project status, build instructions, troubleshooting |
| `agenthandover.md` | This file |

---

## Contact & Resources

- **Repo:** Local at `/Users/jmoore/Documents/Github/Qwen3-TTS`
- **Qwen3-TTS Model:** https://github.com/QwenLM/Qwen3-TTS
- **Tauri Docs:** https://tauri.app/
- **Svelte 5 Docs:** https://svelte.dev/docs/svelte/

---

*End of handover document*

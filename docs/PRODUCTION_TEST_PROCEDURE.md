# Production Build Test Procedure

Version: 1.0.0
Platform: macOS (Apple Silicon)

## Prerequisites

1. Build the sidecar: `./python/build_sidecar.sh`
2. Build the app: `pnpm tauri build`
3. Install the DMG or run from `src-tauri/target/release/bundle/`
4. Ensure network access for first-run model download
5. Have a reference WAV audio file ready for Voice Clone tests

---

## A. Build Verification

| # | Check | How to verify | Pass |
|---|-------|---------------|------|
| A1 | Sidecar binary exists | `ls src-tauri/binaries/tts-server-aarch64-apple-darwin` | |
| A2 | App bundle contains sidecar | Inspect `.app/Contents/MacOS/` or Resources for `tts-server` | |
| A3 | lameenc bundled in sidecar | Run sidecar standalone: `./tts-server` then `curl localhost:8765/health` | |
| A4 | App launches without crash | Double-click the built .app | |
| A5 | No unsigned binary warnings | macOS doesn't block launch (or signs correctly) | |

## B. Startup & Sidecar Lifecycle

| # | Check | Expected | Pass |
|---|-------|----------|------|
| B1 | Loading screen appears | Progress bar visible, phase messages update | |
| B2 | Sidecar starts automatically | Logs show "Starting TTS server" within 10s | |
| B3 | Server health responds | Progress advances past "starting-server" | |
| B4 | First-run model download | If no cached model: download progress shown, completes | |
| B5 | Model loads successfully | Progress reaches 100%, main UI appears | |
| B6 | Debug console shows startup logs | Cmd+D opens console, startup entries visible | |
| B7 | App close kills sidecar | Close app, verify no `tts-server` process: `ps aux \| grep tts-server` | |

## C. Custom Voice Mode

| # | Check | Expected | Pass |
|---|-------|----------|------|
| C1 | Default mode is Custom Voice | Panel shows speaker selector + text input | |
| C2 | Speaker selector works | Can select each of the 9 preset speakers | |
| C3 | Language selector affects output | Select non-English language, generate, verify language in logs | |
| C4 | Generate with 0.6B model | Enter text, Cmd+Enter or click Generate, audio plays | |
| C5 | Waveform renders | Visual waveform appears after generation | |
| C6 | Space bar play/pause | Press Space to toggle playback | |
| C7 | Generate with 1.7B model | Switch to 1.7B Custom via header dropdown, generate | |
| C8 | Text limit enforced | Paste >2000 chars, verify truncation or error | |
| C9 | Empty text shows error | Click Generate with empty text, error banner appears | |
| C10 | Wrong model shows error | Load Base model, try Custom Voice, see model mismatch error | |

## D. Voice Clone Mode

| # | Check | Expected | Pass |
|---|-------|----------|------|
| D1 | Switch to Voice Clone | Cmd+2 or click tab, panel shows upload + transcript | |
| D2 | Mode switch clears output | Previous audio/waveform disappears | |
| D3 | Import reference audio | Click upload, select WAV, file name appears | |
| D4 | Generate with transcript | Enter transcript + text, generate, audio plays | |
| D5 | Low-quality mode (no transcript) | Toggle low-quality, leave transcript blank, generate works | |
| D6 | Missing audio file error | Try generate without uploading, error shown | |
| D7 | Missing transcript error | Normal mode, leave transcript blank, error shown | |
| D8 | Record audio (prod only) | Click record, grant mic, record, stop, use as reference | |
| D9 | Audio file size limit | Try uploading >50MB file, error shown | |

## E. Voice Design Mode

| # | Check | Expected | Pass |
|---|-------|----------|------|
| E1 | Switch to Voice Design | Cmd+3 or click tab, panel shows description input | |
| E2 | Model gating | If wrong model loaded, warning + "Load 1.7B Design" button | |
| E3 | Generate with description | Enter voice description + text, generate, audio plays | |
| E4 | Empty description error | Leave description blank, try generate, error shown | |

## F. Export & Audio Format

| # | Check | Expected | Pass |
|---|-------|----------|------|
| F1 | Export WAV (default) | Cmd+S opens native save dialog, default .wav extension | |
| F2 | Saved WAV plays externally | Open saved file in QuickTime/VLC, audio plays correctly | |
| F3 | Switch format to MP3 | Settings > Audio > Default Format > MP3 | |
| F4 | Generate produces MP3 | Generate audio, verify blob is smaller than equivalent WAV | |
| F5 | Export MP3 | Cmd+S opens save dialog with .mp3 extension | |
| F6 | Saved MP3 plays externally | Open saved file in QuickTime/VLC, audio plays correctly | |
| F7 | Export folder setting | Settings > Browse, select folder, next export defaults there | |
| F8 | Filename format correct | File named `PrivateVoice_{Mode}_{date}_{time}.{ext}` | |
| F9 | Switch back to WAV | Settings > WAV, generate, export, verify WAV output | |

## G. Voice Library

| # | Check | Expected | Pass |
|---|-------|----------|------|
| G1 | Recent items appear | Generate audio, open library, "Recent" tab shows item | |
| G2 | Save to library | Click save (Cmd+S on output), item appears in Saved tab | |
| G3 | Library survives restart | Close app, reopen, library items still present with audio | |
| G4 | Play from library | Click play on a saved item, audio plays | |
| G5 | "Use Voice" restores settings | Click "Use" on library item, mode/speaker/settings restored | |
| G6 | Delete from library | Delete an item, confirm it's gone | |
| G7 | Search filters items | Type in search, results filter correctly | |
| G8 | Recent cache rotates | Generate >10 items, oldest drops from Recent | |

## H. Settings Persistence

| # | Check | Expected | Pass |
|---|-------|----------|------|
| H1 | Theme persists | Change theme to Light, restart, still Light | |
| H2 | Export format persists | Set to MP3, restart, still MP3 | |
| H3 | Export folder persists | Set custom folder, restart, still shows that folder | |
| H4 | Default model persists | Change default model, restart, still set | |
| H5 | Reset to defaults works | Click Reset, all settings revert | |
| H6 | System info is accurate | GPU shows "Apple Silicon (MPS)", memory matches actual | |
| H7 | Whisper/Translation show "Coming Soon" | Toggles are visually disabled, say "coming in a future update" | |

## I. Keyboard Shortcuts

| # | Check | Expected | Pass |
|---|-------|----------|------|
| I1 | Cmd+Enter | Generates audio | |
| I2 | Cmd+S | Opens save dialog (when audio present) | |
| I3 | Cmd+1 | Switch to Custom Voice | |
| I4 | Cmd+2 | Switch to Voice Clone | |
| I5 | Cmd+3 | Switch to Voice Design | |
| I6 | Space | Play/pause audio (when not in text input) | |
| I7 | Escape | Close open panel (settings/library/help) | |
| I8 | Cmd+D | Toggle debug console | |

## J. Error Handling & Edge Cases

| # | Check | Expected | Pass |
|---|-------|----------|------|
| J1 | Readable error messages | All errors display as plain text, never `[object Object]` | |
| J2 | Cancel during generation | Click Cancel or press Escape, generation stops, no error shown | |
| J3 | Generation timeout | (Hard to test) After 5 min, generation aborts with timeout error | |
| J4 | Model switch during generation | Should queue or show warning | |
| J5 | Offline after model cached | Disconnect network, generate, works normally | |
| J6 | Port conflict recovery | Start another process on 8765, launch app, app kills it and starts | |

## K. Automated Tests

| # | Check | Command | Pass |
|---|-------|---------|------|
| K1 | TypeScript type check | `pnpm check` — 0 errors | |
| K2 | Frontend unit tests | `pnpm test:run` — all pass | |
| K3 | Python backend tests | `cd python && pytest tests/` — all pass | |
| K4 | Python syntax check | `python3 -c "import ast; ..."` for all .py files | |

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Tester | | | |
| Developer | | | |

All sections A-K must pass before v1.0.0 release.

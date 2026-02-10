# Known Issues & Improvements

Tracking issues discovered during development for future work.

---

## High Priority

### Model/Mode Compatibility UX
**Status:** Resolved (v1.0-release)

Mode tabs now show orange dot indicators when incompatible with current model. Clicking an incompatible mode shows a banner with one-click "Load compatible model" action. ModeSelector cards also have compatibility awareness.

---

### Download Progress Monitoring
**Status:** Resolved (v1.0-release)

Implemented two-phase model loading: `snapshot_download()` with custom tqdm class for real progress tracking, then `from_pretrained(local_path)`. Download tracker integrated with `/download-progress` endpoint. Model loading runs in background thread via `asyncio.to_thread()` to keep event loop responsive for polling.

---

### Generation Progress Indicator
**Status:** Resolved (v1.0-release)

Implemented indeterminate spinner with elapsed time display. Header status badge shows "Generating... (12.3s)". Generate buttons in all three input panels show elapsed time. OutputPanel has spinner + elapsed time + cancel button.

---

## Medium Priority

### UI Redesign Needed
**Status:** Resolved (v1.0-release)

Redesigned to multi-column macOS layout: fixed-width input panel (380px, 320-440px range) with output panel filling remaining space. Responsive stacking below 768px breakpoint. Proper flex overflow handling. Tighter header padding with responsive controls. All overlay panels (Library, Settings, Help) use fixed positioning for resolution independence.

---

### Waveform Visualization
**Status:** Deferred
**Found:** Phase 3D

wavesurfer.js integration prepared but not bundled due to npm issues.

**Options:**
1. Bundle wavesurfer.js manually from release
2. Use simpler canvas-based waveform
3. Wait for UI redesign to determine if needed

---

## Resolved (Previously Deferred)

### Voice Library (Phase 3G)
**Status:** Resolved (v1.0-release)

Two-tier storage implemented: in-memory recent cache + file-based persistence via Tauri FS plugin ({appData}/library/{id}.wav + index.json). Error handling improved: audio write failures abort before updating index, missing audio files logged with warnings. Library drawer with tabs (Recent/Audio/Voices), search, and filtering.

### Help Panel (Phase 3H)
**Status:** Resolved (v1.0-release)

Expanded with 6 troubleshooting guides (model loading, audio output, voice clone recording, generation speed, wrong model for mode, slow first launch). Context-sensitive help links from panels. Keyboard shortcuts reference. Speaker gallery.

## Future Phases

### Cross-Platform Support
**Status:** Planned (after UI redesign)
**Priority:** High for project goals

Currently targeting Apple Silicon (MPS). Need to support:

| Platform | GPU | Backend | Notes |
|----------|-----|---------|-------|
| macOS Apple Silicon | MPS | ✅ Current | bfloat16, SDPA |
| macOS Intel | CPU | Planned | float32 fallback |
| Linux NVIDIA | CUDA | Planned | Flash Attention 2 possible |
| Linux no GPU | CPU | Planned | Slower but functional |
| Windows NVIDIA | CUDA | Planned | Flash Attention 2 possible |
| Windows no GPU | CPU | Planned | Slower but functional |

**Requirements:**
- Hardware detection on startup (GPU type, VRAM, CUDA version)
- Clear user guidance when optimal setup not detected
- Link to Help Panel with setup instructions per platform
- Graceful degradation (CUDA → CPU fallback)
- Platform-specific PyInstaller builds

**Device detection flow:**
```
Startup → Detect Hardware →
  ├─ Apple Silicon → MPS (bfloat16, SDPA)
  ├─ NVIDIA GPU → CUDA (float16, Flash Attention 2 if available)
  ├─ Intel Mac → CPU (float32, warn about speed)
  └─ No GPU → CPU (float32, warn about speed)
```

**Help Panel integration:**
- "Your system" section showing detected hardware
- Platform-specific optimization tips
- CUDA installation guide for NVIDIA users
- Memory requirements per configuration

---

## Low Priority

---

## Resolved

### Broken Pipe During Model Loading
**Fixed:** Commit `35353ba`
Suppressed stdout during HuggingFace loading, added SIGPIPE handler.

### Port Already In Use
**Fixed:** Commit `35353ba`
Added `kill_process_on_port()` before starting server.

### Default Speaker Chinese
**Fixed:** Commit `33214da`
Changed default from "serena" (Chinese) to "aiden" (English).

### Speaker Name Case Mismatch
**Fixed:** Commit `33214da`
Fixed lowercase key lookups and added `formatSpeakerName()`.

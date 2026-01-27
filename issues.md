# Known Issues & Improvements

Tracking issues discovered during development for future work.

---

## High Priority

### Model/Mode Compatibility UX
**Status:** Open
**Found:** Phase 3 testing

When user has Voice Design model (1.7b-design) loaded and switches to Custom Voice mode, they get error:
```
model with tokenizer_type: qwen3_tts_tokenizer_12hz tts_model_size: 1b7 tts_model_type: voice_design does not support generate_custom_voice
```

**Expected behavior:** Either:
- Auto-load compatible model when switching modes
- Disable incompatible modes for current model
- Show clear warning with "Load compatible model?" prompt

**Model compatibility matrix:**
| Model | Custom Voice | Voice Clone | Voice Design |
|-------|--------------|-------------|--------------|
| 0.6B | ✓ | ✓ | ✗ |
| 1.7B | ✓ | ✓ | ✗ |
| 1.7B-Design | ✗ | ✗ | ✓ |

---

### Download Progress Monitoring
**Status:** Open
**Found:** Phase 3 testing

HuggingFace model downloads show no progress. The `download_tracker.py` was created but not fully integrated.

**Requirements:**
- Poll `/download-progress` endpoint during model loading
- Show in debug console: filename, bytes downloaded, speed, ETA
- Show in UI: progress bar with percentage

**Backend:** `DownloadTracker` class exists but needs HuggingFace callback integration.

---

### Generation Progress Indicator
**Status:** Open
**Found:** Phase 3 testing

No visual feedback while audio is "baking" (generating). User sees frozen UI.

**Requirements:**
- Investigate if qwen_tts exposes generation progress callbacks
- If yes: stream progress to frontend
- If no: show indeterminate spinner with "Generating..." state
- Show elapsed time during generation

---

## Medium Priority

### UI Redesign Needed
**Status:** Open
**Found:** Phase 3 review

Current UI is just themed stubs - needs comprehensive redesign:
- Layout composition (not just single column form)
- Information hierarchy
- Visual rhythm and spacing
- Unique character/identity

**Approach:** Wireframe/sketch before components, not style-first.

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

## Low Priority

### Voice Library (Phase 3G)
**Status:** Planned
Save and manage custom voice clones for reuse.

### Help Panel (Phase 3H)
**Status:** Planned
In-app documentation and troubleshooting.

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

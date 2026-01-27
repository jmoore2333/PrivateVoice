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
**Status:** Open (Research Complete)
**Found:** Phase 3 testing

HuggingFace model downloads show no progress. The `download_tracker.py` was created but not fully integrated.

**Research Findings:**
- `huggingface_hub` supports `tqdm_class` parameter for custom progress tracking
- Can use `dry_run=True` to get file sizes before downloading
- Best approach: `snapshot_download()` with custom tqdm, then `from_pretrained(local_path)`

**Implementation Plan:**
```python
from huggingface_hub import snapshot_download
from tqdm.auto import tqdm as base_tqdm

class ProgressCallback(base_tqdm):
    callback = None
    def update(self, n=1):
        super().update(n)
        if self.callback and self.total:
            self.callback(current=self.n, total=self.total, filename=self.desc)

# Use: snapshot_download(repo_id, tqdm_class=ProgressCallback)
```

**Requirements:**
- Modify `inference.py` to use `snapshot_download` with progress callback
- Poll `/download-progress` endpoint during model loading
- Show in debug console and UI

---

### Generation Progress Indicator
**Status:** Open (Research Complete)
**Found:** Phase 3 testing

No visual feedback while audio is "baking" (generating). User sees frozen UI.

**Research Findings:**
- qwen_tts does NOT expose progress callbacks, streaming, or generator patterns
- Methods return complete `(wavs, sample_rate)` tuples
- The `non_streaming_mode` parameter only affects internal generation, not output format
- vLLM-Omni has streaming but requires separate deployment

**Workaround Options:**
1. **Time-based estimation** - Measure avg time per character, estimate progress
2. **Text chunking** - For long texts, split into sentences, show per-sentence progress
3. **Indeterminate spinner** - Show elapsed time with "Generating..." state

**Recommended approach for now:** Indeterminate spinner with elapsed time display

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

## Deferred to UI Redesign

### Voice Library (Phase 3G)
**Status:** Deferred
**Reason:** Requires proper gallery/card UI - would be another stub if built now

**Requirements:**
- Save voice clone configurations (reference audio + text + settings)
- Gallery view of saved voices with preview/play
- Import/export voice profiles
- Organize into folders/tags

**Backend needed:**
- `voiceLibraryStore.svelte.ts` - State management
- File storage via Tauri fs plugin
- Voice metadata schema

### Help Panel (Phase 3H)
**Status:** Deferred
**Reason:** Content should match final UI design

**Requirements:**
- Getting started guide
- Mode explanations (Custom Voice vs Clone vs Design)
- Speaker guide with audio samples
- Troubleshooting section
- Keyboard shortcuts

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

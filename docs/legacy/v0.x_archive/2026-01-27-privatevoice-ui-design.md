# PrivateVoice UI/UX Design Document

**Date:** 2026-01-27
**Status:** Approved for implementation
**Repo:** https://github.com/jmoore2333/PrivateVoice (reserved)

---

## 1. Product Identity

**PrivateVoice** is a personal voice studio - a self-contained, privacy-first desktop application for creating, cloning, and generating voices locally.

### Core Promise

> "Your voices, your machine, forever free."

### Target Users

- **Content creators** (YouTubers, podcasters) who need voiceovers without subscriptions
- **Creative experimenters** who want to explore voice cloning and design
- **Privacy-conscious users** who don't want personal audio uploaded to cloud services

### Emotional Tone

Professional yet approachable. Serious capability delivered with moments of delight. The "wow" comes from the experience (hearing your cloned voice), not visual gimmicks.

### Differentiation from Web TTS Tools

1. **Free and permanent** - No subscription, no rug-pull, works offline forever
2. **Privacy for personal audio** - Voice is intimate; local = safe to experiment
3. **Unlimited experimentation** - No cost-per-token anxiety, just explore
4. **Transparency** - Open source (MIT), see what's happening, trust it

### Hero Moment

Hearing your cloned voice say words you never said. The realization that this is all running locally, privately, on your own machine.

---

## 2. Technical Foundation

### Three Modes

| Mode | Purpose | Model Required | Outputs |
|------|---------|----------------|---------|
| **Custom Voice** | Generate with preset or saved voices | 0.6B or 1.7B | Audio |
| **Voice Clone** | Clone from audio sample | 0.6B or 1.7B | Audio + saveable voice profile |
| **Voice Design** | Create voices from descriptions | 1.7B-Design only | Audio + saveable template |

### Model Compatibility Matrix

| Model | Custom Voice | Voice Clone | Voice Design |
|-------|--------------|-------------|--------------|
| 0.6B (~1.2GB) | ✓ | ✓ | ✗ |
| 1.7B (~3.4GB) | ✓ | ✓ | ✗ |
| 1.7B-Design (~3.4GB) | ✗ | ✗ | ✓ |

### Supported Languages

Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian (10 total)

### Preset Speakers

| Speaker | Voice Description | Native Language/Accent |
|---------|-------------------|------------------------|
| Vivian | Bright, slightly edgy young female | Chinese |
| Serena | Warm, gentle young female | Chinese |
| Uncle_Fu | Seasoned male, low mellow timbre | Chinese |
| Dylan | Youthful Beijing male, clear natural | Chinese (Beijing) |
| Eric | Lively Chengdu male, husky brightness | Chinese (Sichuan) |
| Ryan | Dynamic male, strong rhythmic drive | English |
| Aiden | Sunny American male, clear midrange | English |
| Ono_Anna | Playful Japanese female, light nimble | Japanese |
| Sohee | Warm Korean female, rich emotion | Korean |

**Note:** Voices have accent/personality, not language restrictions. A "Chinese" voice speaks with a Chinese accent but can speak any supported language.

---

## 3. Information Architecture

### Unified Workspace

One workspace with mode selector - not three separate tabbed apps. Layout stays consistent; controls adapt to active mode.

### Primary Layout Zones

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Mode selector | Model indicator | Status | Settings│
├───────────────────────────┬─────────────────────────────────┤
│                           │                                 │
│   INPUT ZONE              │   OUTPUT ZONE                   │
│   - Text input            │   - Waveform player             │
│   - Mode-specific         │   - Generation status           │
│     controls              │   - Quick actions               │
│   - Voice selector        │     (save/export/iterate)       │
│                           │                                 │
├───────────────────────────┴─────────────────────────────────┤
│  Voice Library drawer (collapsed by default, ~60-70% height)│
├─────────────────────────────────────────────────────────────┤
│  Debug Console (optional, toggled in settings)              │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

- **Left = Input, Right = Output** - Natural LTR flow
- **Mode selector prominent** - Always visible, one click to switch
- **Model auto-switching** - Selecting Voice Design loads required model automatically
- **Library as drawer** - Slides up, spans full width, ~60-70% height
- **Progressive disclosure** - Power features in settings, not cluttering main UI

---

## 4. Header Zone

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Custom Voice ▾] [Voice Clone] [Voice Design]               │
│                                                             │
│                    [Model: 1.7B ▾]    ● Ready        [?][⚙]│
└─────────────────────────────────────────────────────────────┘
```

### Components

**Mode Selector:**
- Three buttons/tabs, active mode highlighted
- Voice Design shows subtle indicator: "(1.7B-Design required)"

**Model Indicator:**
- Shows currently loaded model
- Dropdown to switch models
- Triggers download if model not cached

**Status Badge:**
- **● Ready** - Idle, model loaded
- **● Generating... (12.3s)** - With elapsed time
- **● Downloading... (42%)** - Model download progress
- **● Loading model...** - Model switching
- **● Queued (3)** - Batch items waiting
- **● Ready (CPU)** - When running without GPU

Click status badge to expand details (queue contents, download progress).

**Help Button (?):**
- Opens Help panel/drawer

**Settings Button (⚙):**
- Opens Settings modal

---

## 5. Input Zone (Left Panel)

### Shared Elements (All Modes)

```
┌─────────────────────────────┐
│ Text to generate            │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │ Enter text here...      │ │
│ │                         │ │
│ └─────────────────────────┘ │
│ 0 characters                │
│                             │
│ Language: [English ▾]       │
│                             │
│ [Generate]                  │
└─────────────────────────────┘
```

- **Text area** - Generous size, character count
- **Language selector** - 10 supported languages
- **Generate button** - Primary action, prominent, disabled during generation

### Custom Voice Mode

```
│ Voice: [Aiden ▾]                        │
│   ○ Preset  ● Saved                     │
│                                         │
│ Style instructions (optional): (?)      │
│ ┌─────────────────────────┐             │
│ │ Speak warmly, slower... │             │
│ └─────────────────────────┘             │
```

- Voice selector shows presets AND saved clone profiles
- Toggle between preset/saved voice lists
- Style instructions with help tooltip
- Help (?) icon links to examples of effective instructions

### Voice Clone Mode

```
│ Reference Audio:                        │
│ ┌─────────────────────────┐             │
│ │ [🎤 Record] [📁 Import] │             │
│ │                         │             │
│ │ ▸ ──────●────── 0:03    │  (waveform) │
│ └─────────────────────────┘             │
│                                         │
│ Transcript of reference: (?)            │
│ ┌─────────────────────────┐             │
│ │ "Hello, this is my..."  │             │
│ └─────────────────────────┘             │
│ [Auto-transcribe]  (if Whisper enabled) │
│                                         │
│ ☐ Low-quality mode (no transcript)      │
```

- **Record button** - Opens mic recording with live waveform (wavesurfer.js record plugin)
- **Import button** - File picker for audio files
- **Mini waveform** - Shows recorded/imported audio, playable
- **Transcript field** - Required for best quality
- **Auto-transcribe** - Appears if Whisper is downloaded
- **Low-quality checkbox** - X-vector only mode, no transcript needed

### Voice Design Mode

```
│ Voice description: (?)                  │
│ ┌─────────────────────────┐             │
│ │ Warm baritone, slight   │             │
│ │ British accent, calm... │             │
│ └─────────────────────────┘             │
│                                         │
│ ⚠️ Requires 1.7B-Design model           │
│    Loading... 34%                       │
```

- **Description field** - Natural language voice specification
- **Help (?)** - Examples of effective descriptions
- **Model warning** - Shows loading progress if model not ready
- **Generate disabled** until model loaded

---

## 6. Output Zone (Right Panel)

### Empty State

```
┌─────────────────────────────────────┐
│                                     │
│      [Waveform placeholder]         │
│      "Generate audio to preview"    │
│                                     │
└─────────────────────────────────────┘
```

### Generating State

```
┌─────────────────────────────────────┐
│                                     │
│         ◐ Generating...             │
│           12.3s elapsed             │
│                                     │
│   "Hello world, this is..."         │
│   (showing input text as context)   │
│                                     │
└─────────────────────────────────────┘
```

### Playback State

```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█│ │
│ └─────────────────────────────────┘ │
│                                     │
│   ▶ ──────●────────────── 0:04      │
│                                     │
│ [↻ Regenerate] [Save ▾] [Export ▾]  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 💡 Save as clonable voice?      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Waveform Player

- Clean waveform visualization (wavesurfer.js basic)
- Click/drag to scrub
- Spacebar for play/pause

### Quick Actions

- **Regenerate** - Same inputs, new variation
- **Save dropdown:**
  - "Save audio to library"
  - "Save voice profile" (Voice Clone mode)
  - "Save voice template" (Voice Design mode)
- **Export dropdown:**
  - WAV
  - MP3
  - Uses configured export folder

### Contextual Suggestions

Inline, dismissible prompts after generation:
- After Voice Design: "Save as clonable voice?"
- After Voice Clone: "Add to voice library?"
- After long generation: "Save to library to keep?"

### History/Comparison (Optional)

```
│ Recent generations:                 │
│ ┌───┐ ┌───┐ ┌───┐                  │
│ │ ▸ │ │ ▸ │ │ ▸ │                  │
│ └───┘ └───┘ └───┘                  │
│ Current  -1   -2                    │
```

- Enabled via Settings
- Shows last 2-3 generations as mini thumbnails
- Quick A/B comparison

---

## 7. Voice Library

### Two-Tier Storage Model

| Tier | Contents | Retention | User Action |
|------|----------|-----------|-------------|
| **Recent (temp cache)** | Last N generations | Auto-rotates (default 10) | Export or "Save to Library" |
| **Library (persistent)** | Explicitly saved items | Until user deletes | Full management |

### Library Drawer

Triggered by "Voice Library" button. Slides up ~60-70% of window height, full width.

```
┌─────────────────────────────────────────────────────────────┐
│ Voice Library                                    [✕ Close]  │
├─────────────────────────────────────────────────────────────┤
│ [Recent] [Saved Voices] [Generated Audio]         [Search]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ▸ ▁▂▃▅▆▇█▇▆▅▃▂▁  My Speaking Voice    Clone   Jan 27   │ │
│ │                   "Great for podcasts"          [⋯]    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ▸ ▁▂▃▅▆▇█▇▆▅▃▂▁  Narrator v2          Design  Jan 26   │ │
│ │                   Warm baritone...              [⋯]    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Library Tabs

- **Recent** - Temp cache, last N generations (configurable)
- **Saved Voices** - Clone profiles and design templates
- **Generated Audio** - Saved output clips

### Item Display (SoundCloud-style)

Based on wavesurfer.js soundcloud example:
- Mini waveform with inline play button
- Name (editable)
- Type badge (Clone / Design / Audio)
- Date created
- User comment/description (editable)
- Tags (optional, as pills)

### Item Actions (overflow menu)

- Edit name/description
- Add/edit tags
- Export (WAV/MP3)
- Use in Custom Voice (for voice profiles)
- Delete

### Library Item Types

| Type | What's Stored | Can Be Used For |
|------|---------------|-----------------|
| Clone Profile | Reference audio + transcript + settings | Custom Voice mode, regenerating |
| Design Template | Voice description + language + settings | Regenerating, reference for cloning |
| Audio Clip | Generated .wav file | Playback, export only |

---

## 8. Settings Panel

Modal or slide-over panel from header gear icon.

### Appearance

```
│ APPEARANCE                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Theme              [System ▾] (System / Dark / Light)   │ │
│ └─────────────────────────────────────────────────────────┘ │
```

### Audio

```
│ AUDIO                                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Microphone         [System Default ▾]                   │ │
│ │ Speaker output     [System Default ▾]                   │ │
│ │ Export folder      [~/Documents/PrivateVoice] [Change]  │ │
│ │ Default format     [WAV ▾] (WAV / MP3)                  │ │
│ └─────────────────────────────────────────────────────────┘ │
```

### Library

```
│ LIBRARY                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Recent cache size  [10 ▾] generations                   │ │
│ │ Show comparison    [Off ▾] (Off / Last 2 / Last 3)      │ │
│ └─────────────────────────────────────────────────────────┘ │
```

### System

```
│ SYSTEM                                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Compute device     MPS (Apple M4)           [Auto ▾]    │ │
│ │ Memory available   24 GB unified                        │ │
│ │                                                         │ │
│ │ ⚠️ Running in CPU mode - generation will be slower      │ │
│ │   [Learn more]                                          │ │
│ └─────────────────────────────────────────────────────────┘ │
```

- Shows detected GPU and memory
- Dropdown: Auto / MPS / CUDA / CPU
- Warning when CPU-only

### Optional Features

```
│ OPTIONAL FEATURES                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☐ Auto-transcription (Whisper)                          │ │
│ │   Downloads ~1.5GB model for automatic transcripts      │ │
│ │                                                         │ │
│ │ ☐ Translation support                                   │ │
│ │   Downloads ~500MB model for input translation          │ │
│ └─────────────────────────────────────────────────────────┘ │
```

Downloads happen in background; user can continue working.

### Advanced

```
│ ADVANCED                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☐ Show debug console                                    │ │
│ │ Model cache location  [~/.cache/huggingface] [Open]     │ │
│ └─────────────────────────────────────────────────────────┘ │
```

### About

```
│ ABOUT                                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ PrivateVoice v0.1.0                                     │ │
│ │ Open source (MIT)                                       │ │
│ │                                                         │ │
│ │ Powered by Qwen3-TTS                                    │ │
│ │                                                         │ │
│ │ [GitHub] [Report Issue] [Buy Me A Coffee ☕]            │ │
│ └─────────────────────────────────────────────────────────┘ │
```

Links:
- GitHub: https://github.com/jmoore2333/PrivateVoice
- Report Issue: https://github.com/jmoore2333/PrivateVoice/issues
- Buy Me A Coffee: https://buymeacoffee.com/jmoore2333

---

## 9. Help System

### Entry Points

1. **(?) icons** next to complex fields - opens tooltips/popovers
2. **Help button in header** - opens Help panel

### Help Panel Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Help                                              [✕]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ GETTING STARTED                                             │
│ ├─ What is PrivateVoice?                                    │
│ ├─ Your first generation                                    │
│ └─ Understanding the three modes                            │
│                                                             │
│ VOICE GUIDES                                                │
│ ├─ Custom Voice: Using preset speakers                      │
│ │   └─ Speaker gallery with audio samples                   │
│ ├─ Voice Clone: Recording tips & transcript guide           │
│ └─ Voice Design: Writing effective descriptions             │
│                                                             │
│ SYSTEM REQUIREMENTS                                         │
│ ├─ Supported hardware                                       │
│ │   └─ Apple Silicon (M1/M2/M3/M4) - Recommended           │
│ │   └─ NVIDIA GPU (CUDA) - Linux/Windows                   │
│ │   └─ CPU-only - Works but slower                         │
│ ├─ Memory requirements                                      │
│ │   └─ 0.6B model: ~8GB RAM                                │
│ │   └─ 1.7B model: ~12GB RAM                               │
│ ├─ Why is CPU mode slow?                                    │
│ └─ Optimizing performance                                   │
│                                                             │
│ TIPS & TRICKS                                               │
│ ├─ Design → Clone workflow                                  │
│ ├─ Style instructions that work                             │
│ └─ Getting the best quality                                 │
│                                                             │
│ TROUBLESHOOTING                                             │
│ ├─ Model won't load                                         │
│ ├─ Generation is slow                                       │
│ ├─ Audio sounds wrong                                       │
│ └─ Debug console explained                                  │
│                                                             │
│ KEYBOARD SHORTCUTS                                          │
│ ├─ Space: Play/pause                                        │
│ ├─ ⌘/Ctrl+Enter: Generate                                   │
│ └─ ⌘/Ctrl+S: Save to library                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Speaker Gallery

Within Help, shows all 9 preset voices:
- Name, description, native language/accent
- **Playable audio sample** for each
- Helps users understand voice characteristics before selecting

---

## 10. Hardware Detection & Cross-Platform

### Compute Backends

| Platform | GPU | Backend | Precision | Notes |
|----------|-----|---------|-----------|-------|
| macOS Apple Silicon | MPS | `device_map="mps"` | bfloat16 | SDPA attention |
| Linux/Windows NVIDIA | CUDA | `device_map="cuda"` | float16 | Flash Attention 2 if available |
| macOS Intel | None | `device_map="cpu"` | float32 | Slow, show warning |
| Linux/Windows no GPU | None | `device_map="cpu"` | float32 | Slow, show warning |

### Auto-Detection Flow

```
App Launch → Backend scans hardware →
  ├─ Apple Silicon → MPS (bfloat16, SDPA)
  ├─ NVIDIA GPU → CUDA (float16, FA2 if available)
  └─ No GPU → CPU (float32) + show warning
```

### CPU Mode UX

- Non-blocking warning on first launch when no GPU detected
- Status indicator shows "● Ready (CPU)"
- Help section explains performance implications
- Settings shows detected hardware with option to override

---

## 11. Status & Progress Handling

### Status States

| State | Display | Behavior |
|-------|---------|----------|
| Ready | ● Ready | Idle, can generate |
| Ready (CPU) | ● Ready (CPU) | CPU mode indicator |
| Generating | ● Generating... (12.3s) | Elapsed time, indeterminate |
| Downloading | ● Downloading... (42% of 1.2GB) | Progress bar |
| Loading model | ● Loading model... | During model switch |
| Queued | ● Queued (3) | Batch items waiting |

### Blocking Behavior

- Generate button disabled during: generation, model loading, model download
- Mode switch during generation: queued or confirm dialog
- Model download: non-blocking, user can continue with current model

---

## 12. Responsive Behavior

### Window Sizes

| Size | Behavior |
|------|----------|
| Optimal (1200x800+) | Full two-column layout |
| Compact (900x600) | Narrower columns, still functional |
| Minimum (~800x500) | Graceful degradation, scrollable |

Desktop-optimized, not mobile.

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No model loaded | Prompt to download on first action |
| Model download fails | Clear error, retry, help link |
| Generation fails | Error with reason, inputs preserved |
| Mic permission denied | Clear prompt, link to system settings |
| Disk full | Warning, prompt to clear cache |
| Long text input | Character count, threshold warning |
| Offline | Works (local), downloads need connection |

### First-Run Experience

1. Launch → Brief splash with PrivateVoice logo
2. No model → "Welcome! Let's download your first model"
3. Model selector with size/capability info
4. Download progress (can cancel)
5. Ready → Lands in Custom Voice with Aiden (English) selected

---

## 13. Visual Design

### Color System

| Element | Dark Mode | Light Mode |
|---------|-----------|------------|
| Background | #0d0d0d | #fafafa |
| Surface | #1a1a1a | #ffffff |
| Border | #2a2a2a | #e0e0e0 |
| Text primary | #ffffff | #1a1a1a |
| Text secondary | #888888 | #666666 |
| Accent | #4a9eff | #4a9eff |
| Success | #4ade80 | #4ade80 |
| Warning | #fbbf24 | #fbbf24 |
| Error | #f87171 | #f87171 |

### Typography

- System font stack (SF Pro / Segoe / system default)
- Clear hierarchy: headings, body, labels, captions
- Monospace for debug console

### Waveforms

- Single accent color, clean rendering
- Not multicolor or flashy
- Subtle highlight on playhead
- Use wavesurfer.js with these examples:
  - Basic playback: https://wavesurfer.xyz/examples/?basic.js
  - Recording: https://wavesurfer.xyz/examples/?record.js
  - Library view: https://wavesurfer.xyz/examples/?soundcloud.js

### Interactions

- Subtle hover states (opacity, slight color shift)
- Smooth transitions (150-200ms)
- Loading states feel responsive

### Design Philosophy

> "The futurism is in what you're doing, not in the chrome."

- Dark mode optimized, light mode available
- Professional like Ableton/Final Cut, approachable like Figma
- Not "AI slop" or fake futuristic
- Cool comes from the experience, not visual effects

---

## 14. Technical Implementation Notes

### Key Libraries

- **Frontend:** Svelte 5 with runes
- **Desktop:** Tauri (Rust)
- **Waveforms:** wavesurfer.js
- **Backend:** Python sidecar (FastAPI)
- **TTS:** qwen_tts library

### Wavesurfer.js Integration

```javascript
// Basic playback
import WaveSurfer from 'wavesurfer.js'

// Recording with live waveform
import RecordPlugin from 'wavesurfer.js/dist/plugins/record'

// SoundCloud-style for library
// Custom styling to match app theme
```

### File Storage

- **Temp cache:** `~/.cache/privatevoice/recent/`
- **Library:** `~/.privatevoice/library/`
- **Exports:** User-configured (default `~/Documents/PrivateVoice/`)
- **Models:** `~/.cache/huggingface/` (standard HF cache)

### Settings Persistence

Tauri store plugin for:
- Theme preference
- Audio devices
- Export settings
- Optional feature toggles
- Debug mode state

---

## 15. Implementation Phases

### Phase 1: Core Workspace
- [ ] Header with mode selector and status
- [ ] Input zone with all three mode variants
- [ ] Output zone with waveform playback
- [ ] Basic generate → playback flow

### Phase 2: Library
- [ ] Temp cache (recent generations)
- [ ] Persistent library storage
- [ ] Library drawer UI
- [ ] SoundCloud-style item display

### Phase 3: Polish
- [ ] Settings panel
- [ ] Help system
- [ ] Contextual suggestions
- [ ] Keyboard shortcuts
- [ ] History/comparison view

### Phase 4: Optional Features
- [ ] Whisper integration
- [ ] Translation support
- [ ] Batch/queue system

---

## Appendix: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space | Play/pause audio |
| ⌘/Ctrl + Enter | Generate |
| ⌘/Ctrl + S | Save to library |
| ⌘/Ctrl + E | Export |
| ⌘/Ctrl + 1/2/3 | Switch modes |
| ⌘/Ctrl + , | Open settings |
| ? | Open help |
| Esc | Close drawer/modal |

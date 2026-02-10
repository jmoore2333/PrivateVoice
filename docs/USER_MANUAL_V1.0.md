# PrivateVoice v1.0 User Manual

Local, private text-to-speech for Apple Silicon.

---

## Getting Started

### Installation

1. Download the `.dmg` from [Releases](https://github.com/jmoore/PrivateVoice/releases)
2. Drag **PrivateVoice** to your Applications folder
3. Double-click to launch

### First Launch

On first launch:

1. **Python environment extraction** (~60 seconds) — a one-time setup. Subsequent launches are faster.
2. **Model selection** — Choose a model to download:
   - **0.6B** (Custom Voice) — ~1.2 GB, faster generation, good for most uses
   - **1.7B** (Custom Voice) — ~3.4 GB, higher quality audio
3. **Model download** — Weights download from HuggingFace. Progress is displayed in the startup screen.
4. **Ready** — The main interface appears once the model is loaded.

### System Requirements

- macOS 12.3+ on Apple Silicon (M1/M2/M3/M4)
- 16 GB RAM recommended (8 GB minimum for 0.6B models)
- 1.2-3.4 GB disk per model
- Internet connection for first model download only

---

## Three TTS Modes

PrivateVoice offers three ways to generate speech. Each mode requires a specific model variant — the app shows visual indicators (orange dots) when you need to switch models.

### Custom Voice

**What it does:** Generate speech using one of 9 preset speaker voices with optional style instructions.

**How to use:**
1. Select a speaker from the dropdown (e.g., Aiden, Serena, Ryan)
2. Optionally add a style instruction (e.g., "speak slowly and softly", "excited and upbeat")
3. Enter your text (up to 2000 characters)
4. Press **Cmd+Enter** or click **Generate**

**Requires:** CustomVoice model (0.6B or 1.7B)

**Available speakers:** Serena, Uncle Fu, Vivian, Aiden, Ryan, Ono Anna, Sohee, Dylan, Eric

### Voice Clone

**What it does:** Clone any voice from a short audio sample (5-15 seconds).

**How to use:**
1. Provide reference audio:
   - **Import** a WAV file (works in dev and production)
   - **Record** directly (production build only — macOS WebView security)
2. Enter the transcript of the reference audio (what the speaker says in the sample)
   - Or use the **Auto-transcribe** button if Whisper is enabled (see [Whisper section](#whisper-auto-transcription))
3. Enter the text you want spoken in the cloned voice
4. Press **Cmd+Enter** or click **Generate**

**Low-quality mode:** Toggle this to skip the transcript and use x-vector only. Faster but lower speaker similarity.

**Requires:** Base model (0.6B-base or 1.7B-base)

### Voice Design

**What it does:** Create an entirely new voice from a text description.

**How to use:**
1. Write a voice description (e.g., "A warm, elderly British gentleman with a measured pace")
2. Enter the text you want spoken
3. Press **Cmd+Enter** or click **Generate**

**Requires:** VoiceDesign model (1.7B-design only)

### Model Compatibility Quick Reference

| Model | Custom Voice | Voice Clone | Voice Design |
|-------|:---:|:---:|:---:|
| 0.6B / 1.7B | Yes | — | — |
| 0.6B-base / 1.7B-base | — | Yes | — |
| 1.7B-design | — | — | Yes |

When you switch to a mode that needs a different model, a banner appears with a one-click button to load the compatible model.

---

## Whisper Auto-Transcription

Whisper is an optional feature that automatically transcribes reference audio in Voice Clone mode.

### Enabling Whisper

1. Open **Settings** (gear icon)
2. Scroll to **Optional Features**
3. Toggle **Auto-transcription** on
4. Select a Whisper model size:
   - **tiny** (75 MB) — fastest, lower accuracy
   - **base** (145 MB) — good balance (recommended)
   - **small** (483 MB) — better accuracy
   - **medium** (1.5 GB), **large-v3** (3.1 GB), **large-v3-turbo** (1.6 GB) — highest accuracy
5. Click **Load** — the model downloads on first use

### Using Auto-Transcribe

1. In Voice Clone mode, import or record reference audio
2. Click the **Auto-transcribe** button next to the transcript field
3. The transcript is filled in automatically
4. Review and edit the transcript if needed, then generate

Whisper runs on CPU to avoid competing with the TTS model for GPU memory.

---

## Audio Export

### Formats

- **WAV** (default) — Lossless, larger files
- **MP3** — Compressed, configurable bitrate (128/192/256/320 kbps, default 192)

### Changing the Format

1. Open **Settings** > **Audio**
2. Select **Default Format**: WAV or MP3
3. If MP3, choose the **Bitrate**
4. All subsequent generations use the selected format

### Exporting

- Press **Cmd+S** or click the export button
- A native macOS save dialog opens with the correct file extension
- Default filename: `PrivateVoice_{Mode}_{date}_{time}.{ext}`
- Optionally set a default export folder in Settings

### Playback

Generated audio plays immediately in the output panel with:
- Waveform visualization (wavesurfer.js)
- Play/pause with **Space** bar
- Seek by clicking the waveform

---

## Voice Library

Save and organize your generated audio.

### Recent Items

Every generation automatically appears in the **Recent** tab. Recent items are session-only (in-memory blob URLs) and rotate after ~10 items.

### Saved Items

- Click the save icon or press **Cmd+S** on a generation to save it permanently
- Saved items persist across app restarts (stored as WAV files in `{appData}/library/`)
- Each saved item stores: audio, text, mode, speaker, settings

### Library Features

- **Search** — Filter items by text content
- **Play** — Click play to listen to any saved item
- **Use Voice** — Restore the mode, speaker, and settings from a library item
- **Delete** — Remove items you no longer need

---

## Settings Reference

Open Settings via the gear icon in the header.

| Setting | Description | Default |
|---------|-------------|---------|
| **Theme** | Light or Dark mode | Dark |
| **Default Format** | WAV or MP3 | WAV |
| **MP3 Bitrate** | 128, 192, 256, or 320 kbps | 192 |
| **Export Folder** | Default save location | System default |
| **Default Model** | Model to load on startup | 0.6B |
| **Auto-transcription** | Enable Whisper for Voice Clone | Off |
| **Whisper Model** | Whisper model size | base |
| **Reset to Defaults** | Restore all settings | — |

Settings persist across app restarts via localStorage.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Generate audio |
| `Cmd+S` | Save/export audio |
| `Cmd+1` | Switch to Custom Voice |
| `Cmd+2` | Switch to Voice Clone |
| `Cmd+3` | Switch to Voice Design |
| `Space` | Play/pause audio (when not in a text field) |
| `Escape` | Close open panel (Settings, Library, Help) |

On Windows/Linux, use `Ctrl` instead of `Cmd`.

---

## Troubleshooting

### Voice Clone recording not working

Microphone recording requires a production build due to macOS WebView security. In development mode, use the **Import** button to upload pre-recorded audio files.

### Slow first launch

Normal — PyInstaller extracts the bundled Python environment (~60 seconds). Subsequent launches are much faster.

### Out of memory

Try the smaller 0.6B model. The 1.7B models need approximately 12 GB of RAM. Check memory before loading via the app's built-in memory check.

### Model download stuck

Check your internet connection. Models are 1.2-3.4 GB from HuggingFace Hub. After download, models are cached locally and no internet is needed.

### MPS errors on Intel Mac

PrivateVoice requires Apple Silicon (M1/M2/M3/M4) for MPS acceleration. Intel Macs fall back to slower CPU inference. Ensure macOS 12.3+.

### Export always saves as WAV

Check **Settings > Audio > Default Format**. Change to MP3 if you prefer compressed output.

### Generation seems stuck

Long texts take longer to generate. An elapsed time spinner shows progress. Click **Cancel** or press **Escape** to abort a generation.

### Mode tab shows orange dot

This means the currently loaded model is incompatible with that mode. Click the mode tab to see a banner with a one-click button to load the correct model.

---

For developer documentation, see [docs/DEVELOPMENT.md](DEVELOPMENT.md). For the full API reference, see [docs/API_REFERENCE.md](API_REFERENCE.md).

# PrivateVoice User Manual

**Version:** 1.0.0
**Date:** February 2026
**Platform:** macOS (Apple Silicon)

---

PrivateVoice is a macOS desktop application for generating speech from text using AI models that run entirely on your computer. No audio data ever leaves your machine.

---

## Table of Contents

- [System Requirements](#system-requirements)
- [First Launch](#first-launch)
- [Three Generation Modes](#three-generation-modes)
  - [Custom Voice](#mode-1-custom-voice)
  - [Voice Clone](#mode-2-voice-clone)
  - [Voice Design](#mode-3-voice-design)
- [Switching Models](#switching-models)
- [Exporting Audio](#exporting-audio)
- [Saving to Library](#saving-to-library)
- [Whisper Transcription](#whisper-transcription)
- [Settings](#settings)
- [Debug Console](#debug-console)
- [Help System](#help-system)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [API Reference (Advanced)](#api-reference-advanced)

---

## System Requirements

- **macOS** 12.3 or later
- **Apple Silicon** Mac (M1/M2/M3/M4) recommended. Intel Macs fall back to CPU.
- **RAM:** 16GB+ recommended
  - 0.6B models require approximately 8GB available RAM
  - 1.7B models require approximately 12GB available RAM
- **Disk space:** 1.2-3.4GB per model (downloaded from HuggingFace on first use)

---

## First Launch

1. **Open PrivateVoice.** The app starts a local TTS server on port 8765. The first launch takes approximately 60 seconds while the Python environment initializes.
2. **Welcome screen.** On first launch, an onboarding overlay walks you through the basics.
3. **Choose a model.** Select a default model to start with:
   - **0.6B** -- Smallest, fastest. Good for basic text-to-speech with preset voices.
   - **0.6B-Base** -- Same size, but supports voice cloning.
   - **1.7B** -- Higher quality preset voices. Needs more RAM.
   - **1.7B-Base** -- Higher quality voice cloning.
   - **1.7B-Design** -- Create novel voices from text descriptions.
4. **Model download.** The first time you select a model, it downloads from HuggingFace (1.2-3.4GB depending on the model). A progress bar shows download speed and ETA.
5. **Ready.** Once the model loads, the status changes to "Ready" and you can start generating speech.

---

## Three Generation Modes

PrivateVoice offers three distinct ways to generate speech. Each mode requires a specific model type.

### Mode 1: Custom Voice

**Model required:** 0.6B or 1.7B (CustomVoice variants)

Use a preset speaker voice to read your text aloud.

1. Make sure the **Custom Voice** tab is selected (it is the default).
2. **Enter text** in the input area. The text can be in any of the 10 supported languages: Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, or Italian.
3. **Choose a speaker** from the dropdown. There are 9 preset voices:

   | Speaker | Description | Native Language | Gender |
   |---------|-------------|-----------------|--------|
   | Aiden | Sunny American male, clear midrange | English | Male |
   | Ryan | Dynamic male, strong rhythmic drive | English | Male |
   | Serena | Warm, gentle young female | Chinese | Female |
   | Vivian | Bright, slightly edgy young female | Chinese | Female |
   | Dylan | Youthful Beijing male, clear and natural | Chinese (Beijing) | Male |
   | Eric | Lively Chengdu male, slightly husky | Chinese (Sichuan) | Male |
   | Uncle Fu | Seasoned male, low mellow timbre | Chinese | Male |
   | Ono Anna | Playful Japanese female, light and nimble | Japanese | Female |
   | Sohee | Warm Korean female, rich in emotion | Korean | Female |

4. **(Optional) Add a style instruction.** Type a phrase like "Speak cheerfully" or "Read slowly and calmly" to guide the speaking style. Preset instruction options may also be available in the UI.
5. **Select language** from the dropdown (matches the language of your text).
6. **Click Generate.** Wait for the audio to appear in the output panel.
7. **Play** the generated audio using the built-in player.

### Mode 2: Voice Clone

**Model required:** 0.6B-Base or 1.7B-Base

Clone a real person's voice from a short audio sample.

1. Switch to the **Voice Clone** tab. If a Custom Voice model is loaded, you will see a compatibility warning with a button to load the correct model.
2. **Provide reference audio** (5-15 seconds of speech):
   - **Import** an existing WAV file, or
   - **Record** directly (requires a production build for microphone access)
3. **Enter reference transcript** -- type what is spoken in the reference audio. This improves cloning accuracy.
   - Alternatively, enable **low-quality mode** (x-vector only) to skip the transcript requirement.
4. **Enter the text** you want spoken in the cloned voice.
5. **Click Generate.**

### Mode 3: Voice Design

**Model required:** 1.7B-Design only

Create a completely new voice by describing it in natural language.

1. Switch to the **Voice Design** tab. If the wrong model is loaded, follow the prompt to load the 1.7B-Design model.
2. **Describe the voice** you want. For example:
   - "A warm male voice with a slight British accent"
   - "A cheerful young woman speaking quickly"
   - "A deep, authoritative news anchor voice"
3. **Enter the text** to be spoken.
4. **Click Generate.**

---

## Switching Models

Different modes require different model types. The app shows compatibility indicators:

| Model | Custom Voice | Voice Clone | Voice Design |
|-------|:---:|:---:|:---:|
| 0.6B | Yes | No | No |
| 0.6B-Base | No | Yes | No |
| 1.7B | Yes | No | No |
| 1.7B-Base | No | Yes | No |
| 1.7B-Design | No | No | Yes |

When you switch to a mode that requires a different model, a banner appears with a one-click "Load compatible model" action. Mode tabs may show orange dot indicators when they are incompatible with the currently loaded model.

To manually change models, go to **Settings** and select a different default model, or use the model switch prompt that appears in the mode panel.

---

## Exporting Audio

After generating speech:

1. **Click Export** (or the save/download button in the output panel).
2. A native save dialog opens. Choose where to save the file.
3. The default format is WAV (24kHz, 16-bit, mono).

To change the export format:

1. Open **Settings** (gear icon in the header).
2. Change **Export Format** to MP3.
3. Choose the MP3 bitrate: 128, 192 (default), 256, or 320 kbps.

> **Known Issue (v1.0):** MP3 export has a known issue and may not work correctly in all cases. WAV export is reliable and recommended for v1.0.

---

## Saving to Library

The Library lets you save and organize generated audio clips and cloned voices.

1. After generating audio, click **Save to Library**.
2. The clip appears in the Library drawer under the **Audio** tab.
3. Cloned voice profiles appear under the **Voices** tab.
4. Use the **Search** bar at the top of the Library to find items by name or comments.

### Library Tabs

- **Audio** -- Saved audio clips from any generation mode
- **Voices** -- Saved voice profiles (from Voice Clone)
- **All** -- Combined view

### Persistence

- During a session, audio is stored as in-memory blob URLs (recent cache).
- Saved items persist to disk via the Tauri filesystem plugin at `{appData}/library/`.
- If running in a development/test environment, library metadata falls back to localStorage (audio files are not persisted).

---

## Whisper Transcription

PrivateVoice includes built-in speech-to-text transcription powered by faster-whisper (CTranslate2). This feature can transcribe audio files back to text, which is useful for validating TTS output quality.

> **Note (v1.0):** Whisper transcription is currently accessible via the REST API only. There is no UI for transcription in the desktop app yet, but the feature is fully functional through the API endpoints described below.

### Loading a Whisper Model

The Whisper model must be loaded separately from the TTS model. It runs on CPU and does not compete with GPU memory used by TTS models.

Available Whisper models:

| Model | Parameters | Download Size |
|-------|-----------|---------------|
| tiny | 39M | 75 MB |
| base | 74M | 145 MB |
| small | 244M | 465 MB |
| medium | 769M | 1.5 GB |
| large-v3 | 1.5B | 3.1 GB |
| large-v3-turbo | 809M | 1.6 GB |

Load a model via the API:

```bash
curl -X POST http://127.0.0.1:8765/load-whisper \
  -H "Content-Type: application/json" \
  -d '{"model_size": "base"}'
```

### Transcribing Audio

Send an audio file to the transcription endpoint:

```bash
curl -X POST http://127.0.0.1:8765/transcribe \
  -F "file=@your_audio.wav"
```

The response includes:
- Transcribed text
- Detected language
- Confidence score (0-1)
- Audio duration in seconds

### Whisper API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/whisper-status` | GET | Check if a Whisper model is loaded and which one |
| `/whisper-models` | GET | List available Whisper model sizes and download sizes |
| `/load-whisper` | POST | Load a Whisper model by size |
| `/unload-whisper` | POST | Unload the current Whisper model and free memory |
| `/transcribe` | POST | Transcribe an audio file (multipart form upload) |

---

## Settings

Open Settings by clicking the gear icon in the app header.

Available settings:

- **Default Model** -- Which TTS model to load on startup
- **Auto-load Model** -- Whether to automatically load the default model at startup
- **Export Format** -- WAV or MP3
- **MP3 Bitrate** -- 128, 192, 256, or 320 kbps (only applies when exporting as MP3)
- **Theme** -- Dark or light mode (visual preference)
- **App Version** -- Displayed for reference

To reset all settings to defaults, use the reset option in Settings.

---

## Debug Console

For troubleshooting:

1. Click the debug/terminal icon to open the Debug Console.
2. **Logs tab** -- View real-time server log entries (INFO, ERROR levels).
3. **System tab** -- View device info, memory usage, Python/PyTorch versions, and model status.

The debug console can help diagnose:

- Model loading failures
- Memory issues
- Generation errors
- Network/download problems

---

## Help System

Click the help icon (question mark) in the app header to open the Help panel. It provides in-app documentation about modes, models, and usage tips.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Generate audio |
| `Cmd+S` | Save to library |
| `Space` | Play/pause audio |
| `Cmd+1/2/3` | Switch modes |
| `Escape` | Close panels |

Additional keyboard shortcuts are documented in the Help panel within the app.

---

## Troubleshooting

### "Model not loaded" error

The TTS model needs to be loaded before you can generate speech. Go to Settings and ensure a model is selected, or click "Load Model" in the mode panel.

### Not enough memory

The memory check endpoint reports whether you have enough free RAM for a given model. Close other applications to free memory. The 0.6B models need approximately 8GB free; 1.7B models need approximately 12GB.

### Model download stalls

Check the download progress at `/download-progress`. If the download fails, try again -- models are cached locally after the first successful download in `~/.cache/huggingface/`.

### Voice Clone mode asks to switch models

Voice Clone requires a "Base" model variant. Accept the prompt to automatically load the compatible model.

### Audio export fails

If MP3 export fails, switch to WAV format in Settings. WAV export is more reliable in v1.0.

### App won't start

The Python backend server runs on port 8765. If another process is using that port, the app cannot start. Check with: `lsof -i :8765`

### Slow first launch

This is normal. PyInstaller extracts the bundled Python environment on first launch, which takes approximately 60 seconds. Subsequent launches are faster.

---

## API Reference (Advanced)

For automation and scripting, the full REST API is available at:

- **Swagger UI:** http://127.0.0.1:8765/docs
- **ReDoc:** http://127.0.0.1:8765/redoc
- **OpenAPI JSON:** http://127.0.0.1:8765/openapi.json

The API has 21+ endpoints covering health checks, model management, speech generation, and transcription. The server only accepts connections from localhost.

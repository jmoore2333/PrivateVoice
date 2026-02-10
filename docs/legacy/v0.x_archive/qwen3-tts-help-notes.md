# Qwen3-TTS Help/Advanced Panel Notes

Date: 2026-02-03
Sources:
- Alibaba Cloud Community: "Qwen3-TTS Family is Now Open Sourced: Voice Design, Clone, and Generation!" (Jan 26, 2026) https://www.alibabacloud.com/blog/602826
- QwenLM/Qwen3-TTS README (model list + feature overview) https://github.com/QwenLM/Qwen3-TTS
- Qwen.ai blog (user-provided excerpt, Feb 2026)

## Summary (for UI help copy)
- Qwen3-TTS is a family of open-source TTS models from Qwen/Alibaba Cloud that supports three workflows: Custom Voice (preset voices + instruction control), Voice Clone (from short reference audio), and Voice Design (voice creation from text description). The family uses a 12Hz multi-codebook tokenizer and a dual-track architecture designed for low-latency streaming and non-streaming synthesis.
- The model series includes 0.6B and 1.7B sizes with different variants: CustomVoice, Base, and VoiceDesign. Each variant is specialized to a specific workflow.
- The models cover 10 major languages (Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian) and multiple dialects.
- Reported latency can be very low for streaming scenarios (first audio packet after a single character; public benchmarks claim ~97ms end-to-end latency).

## Model Matrix (Help Panel)
**Custom Voice**
- Models: `0.6B CustomVoice`, `1.7B CustomVoice`
- Uses preset speakers and optional instruction text for style control.
- Intended for predictable, repeatable voices without user-provided reference audio.

**Voice Clone**
- Models: `0.6B Base`, `1.7B Base`
- Clones a voice from short reference audio (as little as a few seconds). Some workflows can run without transcript in low-quality/embedding-only mode.
- Base models are also used as a foundation for fine-tuning.

**Voice Design**
- Model: `1.7B VoiceDesign`
- Creates a new voice from a natural-language description.

## Help Panel: Suggested Sections
1. **Which mode should I use?**
   - Custom Voice: pick a preset voice + add style instructions (tone, pace, emotion).
   - Voice Clone: upload/record a short sample; provide transcript for best quality.
   - Voice Design: describe the voice you want (age, gender, accent, emotion, pacing).

2. **Model Guidance**
   - 0.6B models load faster and work on lower RAM; 1.7B models are higher quality.
   - Base models are required for Voice Clone.
   - VoiceDesign model is required for Voice Design.

3. **Quality Tips**
   - Use clean audio for cloning (low noise, consistent volume).
   - Provide accurate transcripts when possible.
   - Shorter inputs generate faster; long passages may benefit from splitting.

4. **Performance & Latency**
   - Qwen3-TTS is designed for low-latency streaming and fast generation; actual speed depends on hardware and model size.

5. **Language Support**
   - 10 major languages supported (CN, EN, JA, KO, DE, FR, RU, PT, ES, IT).

## Qwen.ai Excerpt (User-Provided)
### Model List
**1.7B**
- `Qwen3-TTS-12Hz-1.7B-VoiceDesign`: Voice design from description; streaming + instruction control.
- `Qwen3-TTS-12Hz-1.7B-CustomVoice`: 9 preset timbres with instruction control; streaming.
- `Qwen3-TTS-12Hz-1.7B-Base`: Base model for 3-second rapid voice clone; streaming.

**0.6B**
- `Qwen3-TTS-12Hz-0.6B-CustomVoice`: 9 preset timbres; streaming.
- `Qwen3-TTS-12Hz-0.6B-Base`: Base model for 3-second rapid voice clone; streaming.

Language support: Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian.

### Key Features (Qwen3-TTS)
- Powerful speech representation via Qwen3-TTS-Tokenizer-12Hz (high-fidelity acoustic compression and semantic modeling).
- Universal end-to-end architecture with discrete multi-codebook LM.
- Dual-track hybrid streaming generation; claims first audio packet after a single character, ~97ms E2E latency.
- Instruction-driven control over timbre, emotion, and prosody.

### Performance Highlights (Reported)
- Voice design: reported to outperform closed-source baselines on InstructTTS-Eval.
- Voice control: reported WER 2.34% with strong style control fidelity.
- Voice clone: reported average WER 1.835 and speaker similarity 0.789 across 10 languages.
- Cross-lingual voice clone reported to surpass prior baselines (MiniMax, SeedTTS, CosyVoice3).

### Tokenizer Performance (Reported)
- PESQ 3.21 (wideband) / 3.68 (narrowband).
- STOI 0.96, UTMOS 4.16, speaker similarity 0.95.

### Example Prompts (Condensed)
- Voice Design: "A relaxed, naturally expressive male voice in his late twenties with a warm, conversational tone."
- Instruction Control: "Speak with a very sad, tearful voice. Keep the pace slow and the volume low."
- Character voice: "Older gentleman, early 60s, confident and authoritative, slightly gravelly texture."

## UI Copy Snippets (Draft)
- "Voice Clone requires a Base model (0.6B Base or 1.7B Base)."
- "Custom Voice uses preset speakers with optional style instructions."
- "Voice Design requires 1.7B VoiceDesign."
- "First generation may take longer while the model downloads and loads."

## Open Questions / UX Decisions
- Should we expose a "Download all models" option on first launch?
- Should we add an "Advanced" subsection for streaming latency claims and tokenizer architecture?
- Should we include a hardware-aware recommendation (GPU vs CPU guidance)?

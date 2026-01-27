"""MPS-compatible Qwen3-TTS inference wrapper."""

import signal
import torch
import numpy as np
from typing import Optional
import soundfile as sf
import io
import logging

from qwen_tts import Qwen3TTSModel

from .device import DeviceConfig, get_device_config, synchronize_device, clear_cache

# Ignore SIGPIPE to prevent broken pipe crashes during stdout writes
signal.signal(signal.SIGPIPE, signal.SIG_IGN)

logger = logging.getLogger("tts_server")


# Available preset speakers for Custom Voice mode
# These are the actual speakers from the Qwen3-TTS model
PRESET_SPEAKERS = [
    "aiden", "dylan", "eric", "ono_anna", "ryan",
    "serena", "sohee", "uncle_fu", "vivian"
]

# Model IDs on HuggingFace
MODEL_IDS = {
    "0.6b": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    "0.6b-base": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    "1.7b": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "1.7b-design": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "1.7b-base": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
}


class TTSModel:
    """Qwen3-TTS model wrapper with MPS compatibility."""

    def __init__(self, model_id: str = "0.6b"):
        self.model_id = model_id
        self.model: Optional[Qwen3TTSModel] = None
        self.config: Optional[DeviceConfig] = None
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self, model_id: Optional[str] = None) -> None:
        """Load the TTS model with MPS-compatible settings."""
        if model_id:
            self.model_id = model_id

        # Unload existing model first
        if self._loaded:
            self.unload()

        self.config = get_device_config()
        hf_model_id = MODEL_IDS.get(self.model_id, MODEL_IDS["0.6b"])

        logger.info(f"Loading model {hf_model_id} on {self.config.device}...")

        # Load model with MPS-compatible settings
        self.model = Qwen3TTSModel.from_pretrained(
            hf_model_id,
            device_map=self.config.device_map,
            dtype=self.config.dtype,
            attn_implementation=self.config.attn_implementation,
        )

        self._loaded = True
        logger.info(f"Model loaded successfully on {self.config.device}")

    def unload(self) -> None:
        """Unload the model and free memory."""
        if self.model is not None:
            del self.model
            self.model = None

        if self.config:
            clear_cache(self.config.device)

        self._loaded = False
        logger.info("Model unloaded")

    def generate_custom_voice(
        self,
        text: str,
        speaker: str = "serena",
        instruction: str = "",
        language: str = "english",
    ) -> bytes:
        """
        Generate speech using a preset speaker voice.

        Args:
            text: The text to synthesize
            speaker: One of the preset speaker names
            instruction: Optional style instruction (e.g., "speaks slowly and calmly")
            language: Language for synthesis

        Returns:
            WAV audio bytes
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call load() first.")

        if speaker not in PRESET_SPEAKERS:
            raise ValueError(f"Unknown speaker: {speaker}. Available: {PRESET_SPEAKERS}")

        # Build speaker with instruction if provided
        if instruction:
            speaker_str = f"{speaker} {instruction}"
        else:
            speaker_str = speaker

        # Generate audio
        with torch.no_grad():
            wavs, sr = self.model.generate_custom_voice(
                text=text,
                language=language,
                speaker=speaker_str,
            )

        synchronize_device(self.config.device)

        # Convert to WAV bytes
        return self._audio_to_wav(wavs[0], sr)

    def generate_voice_clone(
        self,
        text: str,
        reference_audio: bytes,
        reference_text: str,
        language: str = "english",
    ) -> bytes:
        """
        Generate speech by cloning a reference voice.

        Args:
            text: The text to synthesize
            reference_audio: Reference audio bytes (WAV format)
            reference_text: Transcript of the reference audio
            language: Language for synthesis

        Returns:
            WAV audio bytes
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call load() first.")

        # Save reference audio to temp file (qwen-tts expects file path)
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(reference_audio)
            ref_audio_path = f.name

        try:
            with torch.no_grad():
                wavs, sr = self.model.generate_voice_clone(
                    text=text,
                    language=language,
                    ref_audio=ref_audio_path,
                    ref_text=reference_text,
                )

            synchronize_device(self.config.device)
            return self._audio_to_wav(wavs[0], sr)
        finally:
            import os
            os.unlink(ref_audio_path)

    def generate_voice_design(
        self,
        text: str,
        voice_description: str,
        language: str = "english",
    ) -> bytes:
        """
        Generate speech with a novel voice from natural language description.

        Note: Voice Design requires the 1.7B-VoiceDesign model.

        Args:
            text: The text to synthesize
            voice_description: Natural language description of the voice
            language: Language for synthesis

        Returns:
            WAV audio bytes
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call load() first.")

        if "design" not in self.model_id.lower() and "1.7b" not in self.model_id:
            raise RuntimeError("Voice Design requires the 1.7B-VoiceDesign model")

        with torch.no_grad():
            wavs, sr = self.model.generate_voice_design(
                text=text,
                language=language,
                instruct=voice_description,
            )

        synchronize_device(self.config.device)
        return self._audio_to_wav(wavs[0], sr)

    def _audio_to_wav(self, audio, sample_rate: int) -> bytes:
        """Convert audio tensor/array to WAV bytes."""
        # Convert to numpy if tensor
        if isinstance(audio, torch.Tensor):
            audio_np = audio.cpu().numpy()
        else:
            audio_np = np.array(audio)

        # Ensure 1D
        audio_np = audio_np.squeeze()

        # Ensure float32
        if audio_np.dtype != np.float32:
            audio_np = audio_np.astype(np.float32)

        # Normalize if needed
        max_val = np.abs(audio_np).max()
        if max_val > 1.0:
            audio_np = audio_np / max_val

        # Convert to WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio_np, sample_rate, format='WAV')
        buffer.seek(0)
        return buffer.read()


# Global model instance
_model: Optional[TTSModel] = None


def get_model() -> TTSModel:
    """Get or create the global model instance."""
    global _model
    if _model is None:
        _model = TTSModel()
    return _model

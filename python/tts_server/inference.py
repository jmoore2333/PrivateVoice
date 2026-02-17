"""PrivateVoice inference wrapper (Qwen3-TTS on MPS/CUDA/CPU)."""

import signal
import threading
import torch
import numpy as np
from typing import Optional
import soundfile as sf
import io
import logging

from qwen_tts import Qwen3TTSModel

from .device import DeviceConfig, get_device_config, synchronize_device, clear_cache
from .model_registry import (
    QWEN_MODEL_SPECS,
    ensure_required_files,
    verify_snapshot_hashes,
)

# Ignore SIGPIPE to prevent broken pipe crashes during stdout writes
# (SIGPIPE does not exist on Windows)
if hasattr(signal, 'SIGPIPE'):
    signal.signal(signal.SIGPIPE, signal.SIG_IGN)

logger = logging.getLogger("tts_server")


# Available preset speakers for Custom Voice mode
# These are the actual speakers from the Qwen3-TTS model
PRESET_SPEAKERS = [
    "aiden", "dylan", "eric", "ono_anna", "ryan",
    "serena", "sohee", "uncle_fu", "vivian"
]

# Legacy compatibility mapping kept for API and UI references.
MODEL_IDS = {
    model_key: spec.repo_id
    for model_key, spec in QWEN_MODEL_SPECS.items()
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
        """Load the TTS model with MPS-compatible settings.

        Two-phase process:
        1. Download model files via snapshot_download (with progress tracking)
        2. Load model into memory from the local snapshot
        """
        import os
        import sys
        from huggingface_hub import snapshot_download
        from .download_tracker import get_download_tracker, create_hf_tqdm_class

        if model_id:
            self.model_id = model_id

        # Unload existing model first
        if self._loaded:
            self.unload()

        self.config = get_device_config()
        model_spec = QWEN_MODEL_SPECS.get(self.model_id, QWEN_MODEL_SPECS["0.6b"])
        hf_model_id = model_spec.repo_id

        # Phase 1: Download model files with progress tracking
        tracker = get_download_tracker()
        tracker.start_session()

        logger.info(f"Downloading model {hf_model_id}...")
        try:
            local_path = snapshot_download(
                repo_id=hf_model_id,
                revision=model_spec.revision,
                tqdm_class=create_hf_tqdm_class(),
            )
            ensure_required_files(local_path, model_spec.required_files)
            verify_snapshot_hashes(local_path, model_spec.expected_sha256)
            tracker.complete_download()
        except Exception:
            tracker.error(f"Failed to download {hf_model_id}")
            raise

        # Phase 2: Load model from local snapshot
        logger.info(f"Loading model {hf_model_id} on {self.config.device}...")

        # Suppress stdout/stderr during model loading to prevent broken pipe errors
        # HuggingFace/transformers prints a lot of output that can overwhelm the pipe
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        try:
            # Redirect to devnull during heavy loading
            with open(os.devnull, 'w') as devnull:
                sys.stdout = devnull
                sys.stderr = devnull

                # Load model from local path with MPS-compatible settings
                self.model = Qwen3TTSModel.from_pretrained(
                    local_path,
                    device_map=self.config.device_map,
                    dtype=self.config.dtype,
                    attn_implementation=self.config.attn_implementation,
                )
        finally:
            # Restore stdout/stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr

        # Suppress pad_token_id warning by setting it explicitly
        if hasattr(self.model, 'config') and hasattr(self.model.config, 'eos_token_id'):
            self.model.config.pad_token_id = self.model.config.eos_token_id

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

    @staticmethod
    def _load_audio_from_bytes(audio_bytes: bytes) -> tuple[np.ndarray, int]:
        """Decode audio bytes into a numpy array + sample rate.

        Works entirely in-memory (no temp files) to avoid Windows file-locking
        issues with NamedTemporaryFile that cause [Errno 22] Invalid argument.
        """
        buf = io.BytesIO(audio_bytes)

        # Try soundfile first (handles WAV, FLAC, OGG)
        try:
            data, sr = sf.read(buf)
            # Ensure mono float32
            if data.ndim > 1:
                data = data.mean(axis=1)
            logger.info(f"Loaded reference audio via soundfile ({sr}Hz, {len(data)} samples)")
            return data.astype(np.float32), sr
        except Exception as e:
            logger.debug(f"soundfile couldn't read audio: {e}")

        # Fall back to librosa (handles WebM, MP3, etc. via ffmpeg/audioread)
        try:
            import librosa
            buf.seek(0)
            data, sr = librosa.load(buf, sr=None, mono=True)
            logger.info(f"Loaded reference audio via librosa ({sr}Hz, {len(data)} samples)")
            return data.astype(np.float32), sr
        except Exception as e:
            logger.warning(f"librosa couldn't read audio: {e}")

        raise RuntimeError(
            "Could not decode reference audio. Please upload a WAV file."
        )

    @staticmethod
    def _set_seed(seed: int) -> None:
        """Set deterministic RNG state for reproducible sampling."""
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        np.random.seed(seed % (2**32))

    def generate_custom_voice(
        self,
        text: str,
        speaker: str = "serena",
        instruction: str = "",
        language: str = "english",
        output_format: str = "wav",
        mp3_bitrate: int = 192,
        stable_lead_in: bool = True,
        seed: Optional[int] = None,
        sample_rate: Optional[int] = None,
        bit_depth: int = 16,
        channels: int = 1,
    ) -> tuple[bytes, str]:
        """
        Generate speech using a preset speaker voice.

        Args:
            text: The text to synthesize
            speaker: One of the preset speaker names
            instruction: Optional style instruction (e.g., "speaks slowly and calmly")
            language: Language for synthesis
            output_format: Output audio format ("wav" or "mp3")
            mp3_bitrate: MP3 bitrate in kbps (128/192/256/320). Ignored for WAV.

        Returns:
            Tuple of (audio bytes, media type)
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call load() first.")

        if speaker not in PRESET_SPEAKERS:
            raise ValueError(f"Unknown speaker: {speaker}. Available: {PRESET_SPEAKERS}")

        generate_kwargs = {
            "text": text,
            "language": language,
            "speaker": speaker,
            "instruct": instruction if instruction else None,
        }
        if stable_lead_in:
            # Reduce front-loaded disfluency/hallucinated lead-ins.
            generate_kwargs["non_streaming_mode"] = False
            generate_kwargs["subtalker_dosample"] = False

        if seed is not None:
            self._set_seed(seed)

        with torch.no_grad():
            wavs, sr = self.model.generate_custom_voice(**generate_kwargs)

        synchronize_device(self.config.device)
        return self.audio_to_format(
            wavs[0],
            sr,
            output_format,
            mp3_bitrate=mp3_bitrate,
            target_sample_rate=sample_rate,
            bit_depth=bit_depth,
            channels=channels,
        )

    def generate_voice_clone(
        self,
        text: str,
        reference_audio: bytes,
        reference_text: str,
        language: str = "english",
        x_vector_only_mode: bool = False,
        output_format: str = "wav",
        mp3_bitrate: int = 192,
        seed: Optional[int] = None,
        sample_rate: Optional[int] = None,
        bit_depth: int = 16,
        channels: int = 1,
    ) -> tuple[bytes, str]:
        """
        Generate speech by cloning a reference voice.

        Args:
            text: The text to synthesize
            reference_audio: Reference audio bytes (WAV format)
            reference_text: Transcript of the reference audio
            language: Language for synthesis
            x_vector_only_mode: When True, use only the x-vector from reference
                audio (ignores reference_text). Lower quality but doesn't
                require a transcript.
            output_format: Output audio format ("wav" or "mp3")
            mp3_bitrate: MP3 bitrate in kbps (128/192/256/320). Ignored for WAV.

        Returns:
            Tuple of (audio bytes, media type)
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call load() first.")

        effective_ref_text = "" if x_vector_only_mode else reference_text

        # Load audio into memory (avoids Windows temp file locking issues)
        logger.info(f"[vc step 1/5] Loading reference audio ({len(reference_audio)} bytes)...")
        ref_audio_np, ref_sr = self._load_audio_from_bytes(reference_audio)
        logger.info(f"[vc step 2/5] Reference audio loaded: shape={ref_audio_np.shape}, sr={ref_sr}, dtype={ref_audio_np.dtype}")

        logger.info(f"[vc step 3/5] Starting voice clone inference on {self.config.device}...")
        try:
            if seed is not None:
                self._set_seed(seed)
            with torch.no_grad():
                wavs, sr = self.model.generate_voice_clone(
                    text=text,
                    language=language,
                    ref_audio=(ref_audio_np, ref_sr),
                    ref_text=effective_ref_text,
                )
        except OSError as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"[vc step 3/5] OSError during inference: {e}\n{tb}")
            raise
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"[vc step 3/5] Error during inference: {type(e).__name__}: {e}\n{tb}")
            raise

        logger.info(f"[vc step 4/5] Inference complete, got {len(wavs)} wav(s), sr={sr}")
        synchronize_device(self.config.device)
        logger.info("[vc step 5/5] Converting output to audio format...")
        return self.audio_to_format(
            wavs[0],
            sr,
            output_format,
            mp3_bitrate=mp3_bitrate,
            target_sample_rate=sample_rate,
            bit_depth=bit_depth,
            channels=channels,
        )

    def generate_voice_design(
        self,
        text: str,
        voice_description: str,
        language: str = "english",
        output_format: str = "wav",
        mp3_bitrate: int = 192,
        stable_lead_in: bool = True,
        seed: Optional[int] = None,
        sample_rate: Optional[int] = None,
        bit_depth: int = 16,
        channels: int = 1,
    ) -> tuple[bytes, str]:
        """
        Generate speech with a novel voice from natural language description.

        Note: Voice Design requires the 1.7B-VoiceDesign model.

        Args:
            text: The text to synthesize
            voice_description: Natural language description of the voice
            language: Language for synthesis
            output_format: Output audio format ("wav" or "mp3")
            mp3_bitrate: MP3 bitrate in kbps (128/192/256/320). Ignored for WAV.

        Returns:
            Tuple of (audio bytes, media type)
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call load() first.")

        if "design" not in self.model_id.lower() and "1.7b" not in self.model_id:
            raise RuntimeError("Voice Design requires the 1.7B-VoiceDesign model")

        generate_kwargs = {
            "text": text,
            "language": language,
            "instruct": voice_description,
        }
        if stable_lead_in:
            # Match Custom Voice stabilization for short lead-in filler reduction.
            generate_kwargs["non_streaming_mode"] = False
            generate_kwargs["subtalker_dosample"] = False

        if seed is not None:
            self._set_seed(seed)

        with torch.no_grad():
            wavs, sr = self.model.generate_voice_design(**generate_kwargs)

        synchronize_device(self.config.device)
        return self.audio_to_format(
            wavs[0],
            sr,
            output_format,
            mp3_bitrate=mp3_bitrate,
            target_sample_rate=sample_rate,
            bit_depth=bit_depth,
            channels=channels,
        )

    def _prepare_audio(self, audio, sample_rate: int) -> tuple[np.ndarray, int]:
        """Normalize audio tensor/array to float32 numpy."""
        if isinstance(audio, torch.Tensor):
            audio_np = audio.cpu().numpy()
        else:
            audio_np = np.array(audio)

        audio_np = audio_np.squeeze()

        if audio_np.dtype != np.float32:
            audio_np = audio_np.astype(np.float32)

        max_val = np.abs(audio_np).max()
        if max_val > 1.0:
            audio_np = audio_np / max_val

        return audio_np, sample_rate

    def _audio_to_wav(
        self,
        audio,
        sample_rate: int,
        target_sample_rate: Optional[int] = None,
        bit_depth: int = 16,
        channels: int = 1,
    ) -> bytes:
        """Convert audio tensor/array to WAV bytes."""
        audio_np, sr = self._prepare_audio(audio, sample_rate)

        if audio_np.ndim > 1:
            audio_np = audio_np.mean(axis=1)

        if target_sample_rate and target_sample_rate != sr:
            import librosa

            audio_np = librosa.resample(
                audio_np,
                orig_sr=sr,
                target_sr=target_sample_rate,
                res_type="kaiser_best",
            )
            sr = target_sample_rate

        audio_np = np.clip(audio_np, -1.0, 1.0)

        if channels == 2:
            audio_np = np.column_stack((audio_np, audio_np))
        else:
            audio_np = np.squeeze(audio_np)

        subtype_map = {
            16: "PCM_16",
            24: "PCM_24",
            32: "PCM_32",
        }
        subtype = subtype_map.get(bit_depth, "PCM_16")

        buffer = io.BytesIO()
        sf.write(buffer, audio_np, sr, format='WAV', subtype=subtype)
        buffer.seek(0)
        return buffer.read()

    def _audio_to_mp3(self, audio, sample_rate: int, bitrate: int = 192) -> bytes:
        """Convert audio tensor/array to MP3 bytes using lameenc."""
        import lameenc

        audio_np, sr = self._prepare_audio(audio, sample_rate)

        # lameenc expects int16 PCM
        pcm_data = (audio_np * 32767).astype(np.int16).tobytes()

        encoder = lameenc.Encoder()
        encoder.set_bit_rate(bitrate)
        encoder.set_in_sample_rate(sr)
        encoder.set_channels(1)
        encoder.set_quality(2)  # 2 = high quality

        mp3_data = encoder.encode(pcm_data)
        mp3_data += encoder.flush()
        return bytes(mp3_data)

    def audio_to_format(
        self,
        audio,
        sample_rate: int,
        fmt: str = "wav",
        mp3_bitrate: int = 192,
        target_sample_rate: Optional[int] = None,
        bit_depth: int = 16,
        channels: int = 1,
    ) -> tuple[bytes, str]:
        """Convert audio to requested format. Returns (bytes, media_type)."""
        if fmt == "mp3":
            return self._audio_to_mp3(audio, sample_rate, bitrate=mp3_bitrate), "audio/mpeg"
        return self._audio_to_wav(
            audio,
            sample_rate,
            target_sample_rate=target_sample_rate,
            bit_depth=bit_depth,
            channels=channels,
        ), "audio/wav"


# Global model instance
_model: Optional[TTSModel] = None

# Cancellation flag for generation requests
_cancel_event = threading.Event()


def get_model() -> TTSModel:
    """Get or create the global model instance."""
    global _model
    if _model is None:
        _model = TTSModel()
    return _model


def request_cancel() -> None:
    """Signal that the current generation should be cancelled."""
    _cancel_event.set()


def clear_cancel() -> None:
    """Clear the cancellation flag (called before starting generation)."""
    _cancel_event.clear()


def is_cancelled() -> bool:
    """Check whether cancellation has been requested."""
    return _cancel_event.is_set()

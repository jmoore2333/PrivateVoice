"""Whisper-based audio transcription for PrivateVoice (faster-whisper / CTranslate2)."""

import gc
import logging
import os
import platform
import tempfile
from dataclasses import dataclass
from typing import Optional

from .download_tracker import get_download_tracker, create_hf_tqdm_class
from .model_registry import (
    WHISPER_MODEL_SPECS,
    ensure_required_files,
    verify_snapshot_hashes,
)

logger = logging.getLogger("tts_server")

# CTranslate2-converted model repos on HuggingFace
WHISPER_MODEL_REPOS = {
    model_size: spec.repo_id
    for model_size, spec in WHISPER_MODEL_SPECS.items()
}

# Approximate download sizes in MB for each model
WHISPER_MODEL_SIZES = {
    "tiny": {"parameters": "39M", "download_size_mb": 75},
    "base": {"parameters": "74M", "download_size_mb": 145},
    "small": {"parameters": "244M", "download_size_mb": 465},
    "medium": {"parameters": "769M", "download_size_mb": 1500},
    "large-v3": {"parameters": "1.5B", "download_size_mb": 3100},
    "large-v3-turbo": {"parameters": "809M", "download_size_mb": 1600},
}


@dataclass
class TranscriptionResult:
    """Result of a Whisper transcription."""

    text: str
    language: str
    language_probability: float
    duration_seconds: float


VALID_TRANSCRIPTION_TASKS = {"transcribe", "translate"}


def _get_compute_type() -> str:
    """Select the optimal compute type for the current platform."""
    is_apple_silicon = (
        platform.system() == "Darwin" and platform.machine() == "arm64"
    )
    if is_apple_silicon:
        return "int8"

    # Check for CUDA — faster-whisper can use GPU when available
    try:
        import torch
        if torch.cuda.is_available():
            return "float16"
    except ImportError:
        pass

    return "int8"


def _get_device() -> str:
    """Select the device for faster-whisper.

    CTranslate2 does not support MPS, so macOS always uses CPU.
    """
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    return "cpu"


class WhisperModel:
    """Whisper model wrapper using faster-whisper (CTranslate2).

    Follows the same load/unload pattern as TTSModel in inference.py.
    """

    def __init__(self, model_size: str = "base"):
        self.model_size = model_size
        self.model = None  # faster_whisper.WhisperModel instance
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self, model_size: Optional[str] = None) -> None:
        """Load a Whisper model with download progress tracking.

        Two-phase process (mirrors TTSModel.load):
        1. Pre-download model files via snapshot_download with progress
        2. Load the CTranslate2 model from local cache
        """
        from faster_whisper import WhisperModel as FasterWhisperModel
        from huggingface_hub import snapshot_download

        if model_size:
            self.model_size = model_size

        if self.model_size not in WHISPER_MODEL_REPOS:
            raise ValueError(
                f"Unknown model size: {self.model_size}. "
                f"Available: {list(WHISPER_MODEL_REPOS.keys())}"
            )

        # Unload existing model first
        if self._loaded:
            self.unload()

        model_spec = WHISPER_MODEL_SPECS[self.model_size]
        repo_id = model_spec.repo_id
        device = _get_device()
        compute_type = _get_compute_type()

        # Phase 1: Download model files with progress tracking
        tracker = get_download_tracker()
        tracker.start_session()

        logger.info(f"Downloading Whisper model {repo_id}...")
        try:
            local_path = snapshot_download(
                repo_id=repo_id,
                revision=model_spec.revision,
                tqdm_class=create_hf_tqdm_class(),
            )
            ensure_required_files(local_path, model_spec.required_files)
            verify_snapshot_hashes(local_path, model_spec.expected_sha256)
            tracker.complete_download()
        except Exception:
            tracker.error(f"Failed to download Whisper model {repo_id}")
            raise

        # Phase 2: Load the CTranslate2 model from local snapshot
        logger.info(
            f"Loading Whisper {self.model_size} on {device} "
            f"(compute_type={compute_type})..."
        )
        self.model = FasterWhisperModel(
            local_path,
            device=device,
            compute_type=compute_type,
        )
        self._loaded = True
        logger.info(f"Whisper {self.model_size} loaded successfully on {device}")

    def unload(self) -> None:
        """Unload the Whisper model and free memory."""
        if self.model is not None:
            del self.model
            self.model = None

        self._loaded = False
        gc.collect()
        logger.info("Whisper model unloaded")

    def transcribe(
        self,
        audio_bytes: bytes,
        task: str = "transcribe",
    ) -> TranscriptionResult:
        """Transcribe audio bytes to text.

        Args:
            audio_bytes: Raw audio file bytes (WAV, MP3, etc. — ffmpeg-supported).
            task: Whisper task ("transcribe" or "translate").

        Returns:
            TranscriptionResult with text, language, confidence, and duration.
        """
        if not self._loaded:
            raise RuntimeError("Whisper model not loaded. Call load() first.")

        normalized_task = (task or "transcribe").strip().lower()
        if normalized_task not in VALID_TRANSCRIPTION_TASKS:
            raise ValueError(
                f"Invalid task: {task}. "
                f"Available: {sorted(VALID_TRANSCRIPTION_TASKS)}"
            )

        # Write to temp file — faster-whisper expects a file path
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            audio_path = f.name

        try:
            segments, info = self.model.transcribe(
                audio_path,
                beam_size=5,
                vad_filter=True,
                task=normalized_task,
            )

            # Collect all segment texts
            text_parts = []
            for segment in segments:
                text_parts.append(segment.text.strip())

            full_text = " ".join(text_parts)

            return TranscriptionResult(
                text=full_text,
                language=info.language,
                language_probability=round(info.language_probability, 4),
                duration_seconds=round(info.duration, 2),
            )
        finally:
            os.unlink(audio_path)


# ---------------------------------------------------------------------------
# Global singleton (matches inference.py pattern)
# ---------------------------------------------------------------------------

_whisper_model: Optional[WhisperModel] = None


def get_whisper_model() -> WhisperModel:
    """Get or create the global Whisper model instance."""
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel()
    return _whisper_model

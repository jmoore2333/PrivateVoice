"""PrivateVoice TTS server (FastAPI + Qwen3-TTS)."""

import asyncio
import base64
import binascii
import hmac
import io
import logging
import os
import platform
import re
import signal
import sys
import threading
import zipfile

# Ignore SIGPIPE to prevent broken pipe crashes during stdout writes
# This must be done early before any libraries print to stdout
# (SIGPIPE does not exist on Windows)
if hasattr(signal, 'SIGPIPE'):
    signal.signal(signal.SIGPIPE, signal.SIG_IGN)

import warnings
# Suppress expected warnings from optional dependencies on Windows:
# - sox: not needed for core TTS (only used by some audio preprocessing)
# - flash_attn: optional CUDA optimization, falls back to SDPA
# - HuggingFace symlink warning: Windows doesn't support symlinks without
#   Developer Mode, but the degraded cache still works fine
warnings.filterwarnings("ignore", message=".*sox.*", category=UserWarning)
warnings.filterwarnings("ignore", message=".*flash.attn.*", category=UserWarning)
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import torch
from contextlib import asynccontextmanager
from typing import Optional, List

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from .inference import get_model, PRESET_SPEAKERS, MODEL_IDS, request_cancel, clear_cancel, is_cancelled
from .device import (
    get_device_config, get_memory_info, check_memory_for_model,
    MODEL_MEMORY_REQUIREMENTS, SUPPORTED_MP3_BITRATES,
)
from .download_tracker import get_download_tracker, DownloadProgress
from .transcription import (
    get_whisper_model, WHISPER_MODEL_REPOS, WHISPER_MODEL_SIZES,
)
from .translation import (
    get_local_translator,
    TRANSLATION_MODELS,
    DEFAULT_TRANSLATION_MODEL_KEY,
)
from .speaker_data import get_speakers_dict, SUPPORTED_LANGUAGES
from .log_handler import setup_logging, get_log_buffer, get_logger

# Setup structured logging
logger = setup_logging()


# ============================================================================
# Pydantic Models
# ============================================================================

class HealthResponse(BaseModel):
    status: str
    version: str


class ModelStatusResponse(BaseModel):
    loaded: bool
    model_id: Optional[str]
    device: Optional[str]
    memory: dict


class LoadModelRequest(BaseModel):
    model_id: str = "0.6b"


MAX_TEXT_LENGTH = 2000
MAX_AUDIO_SIZE = 50 * 1024 * 1024  # 50 MB
INTERNAL_ERROR_DETAIL = "Internal server error"


SUPPORTED_FORMATS = ("wav", "mp3")
SUPPORTED_SAMPLE_RATES = (8000, 16000, 22050, 24000, 44100, 48000)
SUPPORTED_BIT_DEPTHS = (16, 24, 32)
SUPPORTED_BATCH_MODES = ("custom-voice", "voice-clone", "voice-design")
MODEL_CAPABILITIES: dict[str, tuple[str, ...]] = {
    "0.6b": ("custom-voice",),
    "1.7b": ("custom-voice",),
    "0.6b-base": ("voice-clone",),
    "1.7b-base": ("voice-clone",),
    "1.7b-design": ("voice-design",),
}


class CustomVoiceRequest(BaseModel):
    text: str
    speaker: str = "serena"
    instruction: str = ""
    language: str = "english"
    format: str = "wav"
    mp3_bitrate: int = 192
    stable_lead_in: bool = True
    seed: Optional[int] = None
    sample_rate: Optional[int] = None
    bit_depth: int = 16


class VoiceDesignRequest(BaseModel):
    text: str
    voice_description: str
    language: str = "english"
    format: str = "wav"
    mp3_bitrate: int = 192
    stable_lead_in: bool = True
    seed: Optional[int] = None
    sample_rate: Optional[int] = None
    bit_depth: int = 16


class BatchItem(BaseModel):
    text: str
    output_filename: str


class BatchRequest(BaseModel):
    mode: str
    language: str = "english"
    format: str = "wav"
    mp3_bitrate: int = 192
    seed: Optional[int] = None
    sample_rate: Optional[int] = None
    bit_depth: int = 16
    speaker: str = "serena"
    instruction: str = ""
    voice_description: str = ""
    stable_lead_in: bool = True
    reference_text: str = ""
    reference_audio_base64: Optional[str] = None
    x_vector_only_mode: bool = False
    items: List[BatchItem]


class StartupStatusResponse(BaseModel):
    phase: str
    message: str
    progress: int


class DownloadProgressResponse(BaseModel):
    status: str
    file_name: str
    bytes_downloaded: int
    bytes_total: int
    speed_mbps: float
    eta: float


class BatchProgressResponse(BaseModel):
    total: int
    completed: int
    current_item: str
    status: str


class SystemInfoResponse(BaseModel):
    python_version: str
    torch_version: str
    device: str
    device_name: str
    memory_total_gb: float
    memory_available_gb: float
    cache_dir: str
    model_memory_requirements: dict[str, int]
    supported_mp3_bitrates: list[int]


class LogEntryResponse(BaseModel):
    level: str
    message: str
    timestamp: str


class SpeakerInfoResponse(BaseModel):
    name: str
    description: str
    native_language: str
    personality: str
    gender: str


class WhisperStatusResponse(BaseModel):
    loaded: bool
    model_size: Optional[str]
    device: str


class WhisperModelInfoResponse(BaseModel):
    size: str
    parameters: str
    download_size_mb: int


class LoadWhisperRequest(BaseModel):
    model_size: str = "base"


class TranscriptionResponse(BaseModel):
    text: str
    language: str
    confidence: float
    duration_seconds: float


VALID_TRANSCRIPTION_TASKS = ("transcribe", "translate")


class TranslateTextRequest(BaseModel):
    text: str
    target_language: str
    source_language: str = "auto"


class TranslateTextResponse(BaseModel):
    text: str
    source_language: str
    target_language: str


class TranslationStatusResponse(BaseModel):
    loaded: bool
    model_key: Optional[str]
    model_id: Optional[str]
    device: str


class TranslationModelInfoResponse(BaseModel):
    key: str
    label: str
    model_id: str
    parameters: str
    download_size_mb: int


class LoadTranslationRequest(BaseModel):
    model_key: str = DEFAULT_TRANSLATION_MODEL_KEY


# ============================================================================
# Startup State
# ============================================================================

class StartupState:
    """Track server startup state."""

    def __init__(self):
        self.phase = "initializing"
        self.message = "Starting Python environment..."
        self.progress = 0

    def set_phase(self, phase: str, message: str, progress: int):
        self.phase = phase
        self.message = message
        self.progress = progress
        logger.info(f"Startup: {phase} - {message} ({progress}%)")


_startup_state = StartupState()


def get_startup_state() -> StartupState:
    return _startup_state


class BatchProgressState:
    """Track the progress of the currently running batch job."""

    def __init__(self):
        self._lock = threading.Lock()
        self.total = 0
        self.completed = 0
        self.current_item = ""
        self.status = "idle"

    def start(self, total: int) -> None:
        with self._lock:
            self.total = total
            self.completed = 0
            self.current_item = ""
            self.status = "running"

    def set_current_item(self, item: str) -> None:
        with self._lock:
            self.current_item = item

    def increment_completed(self) -> None:
        with self._lock:
            self.completed += 1

    def set_status(self, status: str) -> None:
        with self._lock:
            self.status = status

    def snapshot(self) -> BatchProgressResponse:
        with self._lock:
            return BatchProgressResponse(
                total=self.total,
                completed=self.completed,
                current_item=self.current_item,
                status=self.status,
            )


_batch_progress = BatchProgressState()


def validate_audio_format_options(sample_rate: Optional[int], bit_depth: int) -> None:
    if sample_rate is not None and sample_rate not in SUPPORTED_SAMPLE_RATES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported sample_rate: {sample_rate}. "
                f"Allowed values: {list(SUPPORTED_SAMPLE_RATES)}"
            ),
        )
    if bit_depth not in SUPPORTED_BIT_DEPTHS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported bit_depth: {bit_depth}. "
                f"Allowed values: {list(SUPPORTED_BIT_DEPTHS)}"
            ),
        )


def validate_model_supports_mode(model_id: str, mode: str) -> None:
    supported = MODEL_CAPABILITIES.get(model_id, ())
    if mode not in supported:
        raise HTTPException(
            status_code=400,
            detail=f"Loaded model '{model_id}' does not support mode '{mode}'",
        )


def sanitize_output_filename(name: str, fallback: str) -> str:
    candidate = os.path.basename((name or "").strip()) or fallback
    candidate = re.sub(r"[^A-Za-z0-9._-]", "_", candidate)
    if candidate in {"", ".", ".."}:
        return fallback
    return candidate


def ensure_extension(filename: str, fmt: str) -> str:
    ext = ".mp3" if fmt == "mp3" else ".wav"
    if filename.lower().endswith(ext):
        return filename
    return f"{filename}{ext}"


def decode_reference_audio(data: Optional[str]) -> bytes:
    if not data:
        raise HTTPException(
            status_code=400,
            detail="reference_audio_base64 is required for voice-clone batch mode",
        )
    try:
        decoded = base64.b64decode(data, validate=True)
    except binascii.Error as e:
        raise HTTPException(status_code=400, detail=f"Invalid reference_audio_base64: {e}") from e
    if len(decoded) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Reference audio exceeds maximum size of {MAX_AUDIO_SIZE // (1024 * 1024)} MB",
        )
    return decoded


# ============================================================================
# FastAPI App
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown."""
    state = get_startup_state()
    state.set_phase("starting-server", "FastAPI server starting...", 10)

    logger.info("TTS Server starting...")
    state.set_phase("checking-models", "Server ready, waiting for model load", 20)

    yield

    # Cleanup on shutdown
    logger.info("TTS Server shutting down...")
    model = get_model()
    if model.is_loaded:
        model.unload()
    whisper = get_whisper_model()
    if whisper.is_loaded:
        whisper.unload()
    translator = get_local_translator()
    if translator.is_loaded:
        translator.unload()


_is_dev = os.environ.get("TTS_SERVER_DEV", "false").lower() == "true"
_access_token = os.environ.get("TTS_ACCESS_TOKEN", "").strip()
_auth_enabled = bool(_access_token)

if not _auth_enabled and not _is_dev:
    raise RuntimeError("Missing TTS_ACCESS_TOKEN. Refusing to start without API authentication.")

app = FastAPI(
    title="PrivateVoice Server",
    description="Local text-to-speech server powered by Qwen3-TTS",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
)

_allowed_origins = [
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
    "http://localhost",
    "http://127.0.0.1",
]
if _is_dev:
    _allowed_origins.extend([
        "http://localhost:1420",
        "http://127.0.0.1:1420",
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)

@app.middleware("http")
async def validate_api_key(request: Request, call_next):
    if not _auth_enabled:
        return await call_next(request)

    # CORS preflight (OPTIONS) never carries custom headers — let it
    # through so the CORSMiddleware can respond with the proper
    # Access-Control-Allow-* headers.
    if request.method == "OPTIONS":
        return await call_next(request)

    provided = request.headers.get("X-API-Key", "")
    if not provided or not hmac.compare_digest(provided, _access_token):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)


# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check server health."""
    return HealthResponse(status="ok", version="1.0.0")


@app.get("/startup-status", response_model=StartupStatusResponse)
async def startup_status():
    """Get current startup phase and progress."""
    state = get_startup_state()
    return StartupStatusResponse(
        phase=state.phase,
        message=state.message,
        progress=state.progress,
    )


@app.get("/download-progress", response_model=DownloadProgressResponse)
async def download_progress():
    """Get current model download progress."""
    tracker = get_download_tracker()
    progress = tracker.get_progress()
    return DownloadProgressResponse(
        status=progress.status,
        file_name=progress.file_name,
        bytes_downloaded=progress.bytes_downloaded,
        bytes_total=progress.bytes_total,
        speed_mbps=progress.speed_mbps,
        eta=progress.eta,
    )


@app.get("/model-status", response_model=ModelStatusResponse)
async def model_status():
    """Get current model status."""
    model = get_model()
    config = get_device_config()

    return ModelStatusResponse(
        loaded=model.is_loaded,
        model_id=model.model_id if model.is_loaded else None,
        device=config.device if model.is_loaded else None,
        memory=get_memory_info(),
    )


# ============================================================================
# Debug & System Info Endpoints
# ============================================================================

@app.get("/system-info", response_model=SystemInfoResponse)
async def system_info():
    """Get system information for debugging."""
    config = get_device_config()
    memory = get_memory_info()

    # Get device name
    device_name = "Unknown"
    if config.device == "mps":
        device_name = "Apple Silicon (MPS)"
    elif config.device == "cuda":
        device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CUDA"
    elif config.device == "cpu":
        device_name = platform.processor() or "CPU"

    # Get HuggingFace cache directory
    cache_dir = os.environ.get(
        "HF_HOME",
        os.path.join(os.path.expanduser("~"), ".cache", "huggingface")
    )

    return SystemInfoResponse(
        python_version=platform.python_version(),
        torch_version=torch.__version__,
        device=config.device,
        device_name=device_name,
        memory_total_gb=memory.get("total_gb", 0),
        memory_available_gb=memory.get("available_gb", 0),
        cache_dir=cache_dir,
        model_memory_requirements=MODEL_MEMORY_REQUIREMENTS,
        supported_mp3_bitrates=SUPPORTED_MP3_BITRATES,
    )


@app.get("/logs", response_model=List[LogEntryResponse])
async def get_logs(count: int = 100, level: Optional[str] = None):
    """Get recent log entries."""
    buffer = get_log_buffer()
    entries = buffer.get_recent(count=count, level_filter=level)
    return [
        LogEntryResponse(
            level=e.level,
            message=e.message,
            timestamp=e.timestamp,
        )
        for e in entries
    ]


# ============================================================================
# Speaker & Voice Info Endpoints
# ============================================================================

@app.get("/speakers")
async def list_speakers():
    """List available preset speakers (simple list)."""
    return {"speakers": PRESET_SPEAKERS}


@app.get("/speakers-info", response_model=List[SpeakerInfoResponse])
async def speakers_info():
    """Get detailed information about all preset speakers."""
    return get_speakers_dict()


@app.get("/languages")
async def list_languages():
    """List supported languages for TTS generation."""
    return {"languages": SUPPORTED_LANGUAGES}


# ============================================================================
# Model Management Endpoints
# ============================================================================

@app.get("/memory-check/{model_id}")
async def memory_check(model_id: str):
    """Check if the system has enough memory for a given model.

    Returns required RAM, available RAM, and a warning if insufficient.
    """
    if model_id not in MODEL_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model ID: {model_id}. "
            f"Available: {list(MODEL_IDS.keys())}",
        )
    return check_memory_for_model(model_id)


@app.post("/load-model")
async def load_model(request: LoadModelRequest):
    """Load or switch the TTS model.

    Runs model download + loading in a background thread so the event loop
    remains free to serve /download-progress polling requests.
    """
    if request.model_id not in MODEL_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model ID: {request.model_id}. "
            f"Available: {list(MODEL_IDS.keys())}",
        )

    model = get_model()
    state = get_startup_state()

    try:
        state.set_phase("downloading-model", f"Downloading {request.model_id} model...", 40)
        await asyncio.to_thread(model.load, request.model_id)
        state.set_phase("ready", "Model loaded and ready", 100)
        return {"status": "loaded", "model_id": request.model_id}
    except Exception:
        state.set_phase("error", "Model load failed", 0)
        logger.exception("Failed to load model")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.post("/unload-model")
async def unload_model():
    """Unload the current model to free memory."""
    model = get_model()
    state = get_startup_state()

    model.unload()
    state.set_phase("checking-models", "Model unloaded, ready to load", 20)
    return {"status": "unloaded"}


# ============================================================================
# Generation Endpoints
# ============================================================================

@app.post("/generate/custom-voice")
async def generate_custom_voice(request: CustomVoiceRequest):
    """Generate speech using a preset speaker voice."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters")

    fmt = request.format if request.format in SUPPORTED_FORMATS else "wav"
    bitrate = request.mp3_bitrate if request.mp3_bitrate in SUPPORTED_MP3_BITRATES else 192
    validate_audio_format_options(request.sample_rate, request.bit_depth)

    try:
        clear_cancel()
        logger.info(f"Generating custom voice: speaker={request.speaker}, lang={request.language}, fmt={fmt}, text={request.text[:50]}...")
        audio_bytes, media_type = model.generate_custom_voice(
            text=request.text,
            speaker=request.speaker,
            instruction=request.instruction,
            language=request.language,
            output_format=fmt,
            mp3_bitrate=bitrate,
            stable_lead_in=request.stable_lead_in,
            seed=request.seed,
            sample_rate=request.sample_rate if fmt == "wav" else None,
            bit_depth=request.bit_depth,
        )
        if is_cancelled():
            return Response(status_code=499)
        return Response(content=audio_bytes, media_type=media_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.post("/generate/voice-clone")
async def generate_voice_clone(
    text: str = Form(...),
    reference_text: str = Form(""),
    reference_audio: UploadFile = File(...),
    x_vector_only_mode: bool = Form(False),
    language: str = Form("english"),
    format: str = Form("wav"),
    mp3_bitrate: int = Form(192),
    seed: Optional[int] = Form(None),
    sample_rate: Optional[int] = Form(None),
    bit_depth: int = Form(16),
):
    """Generate speech by cloning a reference voice."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters")

    fmt = format if format in SUPPORTED_FORMATS else "wav"
    bitrate = mp3_bitrate if mp3_bitrate in SUPPORTED_MP3_BITRATES else 192
    validate_audio_format_options(sample_rate, bit_depth)

    try:
        clear_cancel()
        logger.info(f"Generating voice clone: lang={language}, fmt={fmt}, text={text[:50]}...")
        audio_data = await reference_audio.read()
        if len(audio_data) > MAX_AUDIO_SIZE:
            raise HTTPException(status_code=400, detail=f"Reference audio exceeds maximum size of {MAX_AUDIO_SIZE // (1024*1024)} MB")
        if not x_vector_only_mode and not reference_text:
            raise HTTPException(status_code=400, detail="Reference text is required unless low-quality mode is enabled.")

        # Run inference in a thread so the event loop stays free for /logs polling
        audio_bytes, media_type = await asyncio.to_thread(
            model.generate_voice_clone,
            text=text,
            reference_audio=audio_data,
            reference_text=reference_text,
            language=language,
            x_vector_only_mode=x_vector_only_mode,
            output_format=fmt,
            mp3_bitrate=bitrate,
            seed=seed,
            sample_rate=sample_rate if fmt == "wav" else None,
            bit_depth=bit_depth,
        )
        if is_cancelled():
            return Response(status_code=499)
        return Response(content=audio_bytes, media_type=media_type)
    except HTTPException:
        raise
    except RuntimeError as e:
        error_msg = str(e)
        logger.exception("Voice clone runtime error")
        if "model" in error_msg.lower() or "compatibility" in error_msg.lower():
            raise HTTPException(status_code=400, detail="Voice Clone requires a Base model (0.6B-base or 1.7B-base)")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)
    except Exception:
        logger.exception("Voice clone failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.post("/generate/voice-design")
async def generate_voice_design(request: VoiceDesignRequest):
    """Generate speech with a novel voice from description."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters")

    fmt = request.format if request.format in SUPPORTED_FORMATS else "wav"
    bitrate = request.mp3_bitrate if request.mp3_bitrate in SUPPORTED_MP3_BITRATES else 192
    validate_audio_format_options(request.sample_rate, request.bit_depth)

    try:
        clear_cancel()
        logger.info(f"Generating voice design: lang={request.language}, fmt={fmt}, desc={request.voice_description[:50]}...")
        audio_bytes, media_type = model.generate_voice_design(
            text=request.text,
            voice_description=request.voice_description,
            language=request.language,
            output_format=fmt,
            mp3_bitrate=bitrate,
            stable_lead_in=request.stable_lead_in,
            seed=request.seed,
            sample_rate=request.sample_rate if fmt == "wav" else None,
            bit_depth=request.bit_depth,
        )
        if is_cancelled():
            return Response(status_code=499)
        return Response(content=audio_bytes, media_type=media_type)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Voice design failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.post("/generate/batch")
async def generate_batch(request: BatchRequest):
    """Generate a batch of outputs with shared voice configuration."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    mode = (request.mode or "").strip().lower()
    if mode not in SUPPORTED_BATCH_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported mode: {request.mode}. Allowed values: {list(SUPPORTED_BATCH_MODES)}",
        )

    validate_model_supports_mode(model.model_id, mode)

    if not request.items:
        raise HTTPException(status_code=400, detail="Batch items cannot be empty")

    fmt = request.format if request.format in SUPPORTED_FORMATS else "wav"
    bitrate = request.mp3_bitrate if request.mp3_bitrate in SUPPORTED_MP3_BITRATES else 192
    validate_audio_format_options(request.sample_rate, request.bit_depth)

    reference_audio_data: Optional[bytes] = None
    if mode == "voice-clone":
        reference_audio_data = decode_reference_audio(request.reference_audio_base64)
        if not request.x_vector_only_mode and not request.reference_text.strip():
            raise HTTPException(
                status_code=400,
                detail="reference_text is required unless x_vector_only_mode is enabled",
            )

    for index, item in enumerate(request.items, start=1):
        if not item.text or not item.text.strip():
            raise HTTPException(status_code=400, detail=f"Batch item {index} has empty text")
        if len(item.text) > MAX_TEXT_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Batch item {index} exceeds maximum length of {MAX_TEXT_LENGTH} characters",
            )

    if mode == "voice-design" and not request.voice_description.strip():
        raise HTTPException(status_code=400, detail="voice_description is required for voice-design mode")

    clear_cancel()
    _batch_progress.start(len(request.items))
    logger.info(
        "Starting batch generation: mode=%s, items=%d, fmt=%s",
        mode,
        len(request.items),
        fmt,
    )

    zip_buffer = io.BytesIO()
    try:
        with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for index, item in enumerate(request.items, start=1):
                if is_cancelled():
                    _batch_progress.set_status("cancelled")
                    logger.info("Batch generation cancelled before item %d", index)
                    return Response(status_code=499)

                raw_name = sanitize_output_filename(item.output_filename, f"item_{index}")
                output_filename = ensure_extension(raw_name, fmt)
                _batch_progress.set_current_item(output_filename)

                if mode == "custom-voice":
                    audio_bytes, _ = await asyncio.to_thread(
                        model.generate_custom_voice,
                        text=item.text,
                        speaker=request.speaker,
                        instruction=request.instruction,
                        language=request.language,
                        output_format=fmt,
                        mp3_bitrate=bitrate,
                        stable_lead_in=request.stable_lead_in,
                        seed=request.seed,
                        sample_rate=request.sample_rate if fmt == "wav" else None,
                        bit_depth=request.bit_depth,
                    )
                elif mode == "voice-design":
                    audio_bytes, _ = await asyncio.to_thread(
                        model.generate_voice_design,
                        text=item.text,
                        voice_description=request.voice_description,
                        language=request.language,
                        output_format=fmt,
                        mp3_bitrate=bitrate,
                        stable_lead_in=request.stable_lead_in,
                        seed=request.seed,
                        sample_rate=request.sample_rate if fmt == "wav" else None,
                        bit_depth=request.bit_depth,
                    )
                else:
                    audio_bytes, _ = await asyncio.to_thread(
                        model.generate_voice_clone,
                        text=item.text,
                        reference_audio=reference_audio_data,
                        reference_text=request.reference_text,
                        language=request.language,
                        x_vector_only_mode=request.x_vector_only_mode,
                        output_format=fmt,
                        mp3_bitrate=bitrate,
                        seed=request.seed,
                        sample_rate=request.sample_rate if fmt == "wav" else None,
                        bit_depth=request.bit_depth,
                    )

                if is_cancelled():
                    _batch_progress.set_status("cancelled")
                    logger.info("Batch generation cancelled at item %d", index)
                    return Response(status_code=499)

                archive.writestr(output_filename, audio_bytes)
                _batch_progress.increment_completed()

        _batch_progress.set_current_item("")
        _batch_progress.set_status("completed")
        logger.info("Batch generation complete: %d item(s)", len(request.items))
        zip_buffer.seek(0)
        return Response(
            content=zip_buffer.read(),
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="batch_results.zip"'},
        )
    except HTTPException:
        _batch_progress.set_status("error")
        raise
    except Exception:
        _batch_progress.set_status("error")
        logger.exception("Batch generation failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.get("/batch-progress", response_model=BatchProgressResponse)
async def batch_progress():
    """Get progress for the currently running batch job."""
    return _batch_progress.snapshot()


# ============================================================================
# Generation Control Endpoints
# ============================================================================

@app.post("/cancel-generation")
async def cancel_generation():
    """Cancel the current generation request.

    Sets a cancellation flag that generation checks between steps.
    The actual cancellation depends on model cooperation — the flag is
    checked before/after generation and the result is discarded if set.
    """
    request_cancel()
    snapshot = _batch_progress.snapshot()
    if snapshot.status == "running":
        _batch_progress.set_status("cancelling")
    logger.info("Generation cancellation requested")
    return {"status": "cancelled"}


# ============================================================================
# Whisper Transcription Endpoints
# ============================================================================

@app.get("/whisper-status", response_model=WhisperStatusResponse)
async def whisper_status():
    """Get current Whisper model status."""
    whisper = get_whisper_model()
    return WhisperStatusResponse(
        loaded=whisper.is_loaded,
        model_size=whisper.model_size if whisper.is_loaded else None,
        device="cpu",  # CTranslate2 does not support MPS
    )


@app.get("/whisper-models", response_model=List[WhisperModelInfoResponse])
async def whisper_models():
    """List available Whisper model sizes with download info."""
    return [
        WhisperModelInfoResponse(
            size=size,
            parameters=info["parameters"],
            download_size_mb=info["download_size_mb"],
        )
        for size, info in WHISPER_MODEL_SIZES.items()
    ]


@app.post("/load-whisper")
async def load_whisper(request: LoadWhisperRequest):
    """Load a Whisper model for transcription.

    Runs download + loading in a background thread so the event loop
    remains free to serve /download-progress polling requests.
    """
    if request.model_size not in WHISPER_MODEL_REPOS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model size: {request.model_size}. "
            f"Available: {list(WHISPER_MODEL_REPOS.keys())}",
        )

    whisper = get_whisper_model()

    try:
        logger.info(f"Loading Whisper model: {request.model_size}")
        await asyncio.to_thread(whisper.load, request.model_size)
        return {"status": "loaded", "model_size": request.model_size}
    except Exception:
        logger.exception("Failed to load Whisper model")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.post("/unload-whisper")
async def unload_whisper():
    """Unload the Whisper model to free memory."""
    whisper = get_whisper_model()
    whisper.unload()
    return {"status": "unloaded"}


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    audio: UploadFile = File(...),
    task: str = Form("transcribe"),
):
    """Transcribe an audio file using the loaded Whisper model."""
    whisper = get_whisper_model()

    if not whisper.is_loaded:
        raise HTTPException(status_code=400, detail="Whisper model not loaded")

    normalized_task = (task or "transcribe").strip().lower()
    if normalized_task not in VALID_TRANSCRIPTION_TASKS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid transcribe task: {task}. "
                f"Available: {list(VALID_TRANSCRIPTION_TASKS)}"
            ),
        )

    audio_data = await audio.read()
    if len(audio_data) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Audio file exceeds maximum size of {MAX_AUDIO_SIZE // (1024*1024)} MB",
        )

    try:
        if normalized_task == "translate":
            logger.info("Translating audio with Whisper...")
        else:
            logger.info("Transcribing audio...")

        result = await asyncio.to_thread(whisper.transcribe, audio_data, normalized_task)

        operation = "Translation" if normalized_task == "translate" else "Transcription"
        logger.info(
            f"{operation} complete: lang={result.language}, "
            f"duration={result.duration_seconds}s, "
            f"text={result.text[:80]}..."
        )
        return TranscriptionResponse(
            text=result.text,
            language=result.language,
            confidence=result.language_probability,
            duration_seconds=result.duration_seconds,
        )
    except Exception:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.get("/translation-status", response_model=TranslationStatusResponse)
async def translation_status():
    """Get current local text translation model status."""
    translator = get_local_translator()
    return TranslationStatusResponse(
        loaded=translator.is_loaded,
        model_key=translator.model_key if translator.is_loaded else None,
        model_id=translator.model_id if translator.is_loaded else None,
        device="cpu",
    )


@app.get("/translation-models", response_model=List[TranslationModelInfoResponse])
async def translation_models():
    """List available translation model options with estimated download sizes."""
    return [
        TranslationModelInfoResponse(
            key=key,
            label=info["label"],
            model_id=info["model_id"],
            parameters=info["parameters"],
            download_size_mb=info["download_size_mb"],
        )
        for key, info in TRANSLATION_MODELS.items()
    ]


@app.post("/load-translation")
async def load_translation(request: LoadTranslationRequest):
    """Load a local translation model."""
    if request.model_key not in TRANSLATION_MODELS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown translation model key: {request.model_key}. "
                f"Available: {list(TRANSLATION_MODELS.keys())}"
            ),
        )

    translator = get_local_translator()

    try:
        logger.info("Loading translation model: %s", request.model_key)
        await asyncio.to_thread(translator.load, request.model_key)
        return {"status": "loaded", "model_key": translator.model_key}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Failed to load translation model")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


@app.post("/unload-translation")
async def unload_translation():
    """Unload the local translation model to free memory."""
    translator = get_local_translator()
    translator.unload()
    return {"status": "unloaded"}


@app.post("/translate-text", response_model=TranslateTextResponse)
async def translate_text(request: TranslateTextRequest):
    """Translate input text to a target language locally."""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters",
        )

    translator = get_local_translator()
    if not translator.is_loaded:
        raise HTTPException(status_code=400, detail="Translation model not loaded")

    try:
        result = await asyncio.to_thread(
            translator.translate_text,
            request.text,
            request.target_language,
            request.source_language,
        )
        logger.info(
            "Text translation complete: %s -> %s, text=%s...",
            result.source_language,
            result.target_language,
            result.text[:80],
        )
        return TranslateTextResponse(
            text=result.text,
            source_language=result.source_language,
            target_language=result.target_language,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Text translation failed")
        raise HTTPException(status_code=500, detail=INTERNAL_ERROR_DETAIL)


# ============================================================================
# Lifecycle Endpoints
# ============================================================================

@app.post("/shutdown")
async def shutdown():
    """Graceful shutdown."""
    model = get_model()
    if model.is_loaded:
        model.unload()
    whisper = get_whisper_model()
    if whisper.is_loaded:
        whisper.unload()
    translator = get_local_translator()
    if translator.is_loaded:
        translator.unload()

    logger.info("Shutdown requested")
    # Signal the process to exit
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting down"}


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Run the server."""
    import uvicorn

    port = int(os.environ.get("TTS_SERVER_PORT", "8765"))
    host = os.environ.get("TTS_SERVER_HOST", "127.0.0.1")

    # On Windows, when spawned with CREATE_NO_WINDOW and piped streams,
    # logging writes from background threads can fail with OSError.
    # Suppress the verbose "--- Logging error ---" tracebacks in production.
    if not _is_dev:
        logging.raiseExceptions = False

    # On Windows, replace sys.stdout/stderr with safe wrappers that catch
    # write errors ([Errno 22] Invalid argument). Third-party libraries
    # (e.g., qwen_tts, transformers) use bare print() calls that crash when
    # stdout is a pipe with CREATE_NO_WINDOW flag.
    if platform.system() == "Windows" and not _is_dev:
        class SafeWriter:
            """Wraps a stream to silently handle broken pipe / invalid argument errors."""
            def __init__(self, stream):
                self._stream = stream
            def write(self, data):
                try:
                    if self._stream and not self._stream.closed:
                        return self._stream.write(data)
                except OSError:
                    pass  # [Errno 22] or broken pipe — silently ignore
                return len(data) if data else 0
            def flush(self):
                try:
                    if self._stream and not self._stream.closed:
                        self._stream.flush()
                except OSError:
                    pass
            def __getattr__(self, name):
                return getattr(self._stream, name)

        sys.stdout = SafeWriter(sys.stdout)
        sys.stderr = SafeWriter(sys.stderr)

    state = get_startup_state()
    state.set_phase("starting-server", f"Starting TTS server on {host}:{port}", 5)

    # Suppress noisy polling endpoints from uvicorn access logs
    class SuppressPollingFilter(logging.Filter):
        _suppressed = {
            "/health",
            "/startup-status",
            "/model-status",
            "/download-progress",
            "/whisper-status",
            "/translation-status",
        }

        def filter(self, record: logging.LogRecord) -> bool:
            msg = record.getMessage()
            return not any(ep in msg for ep in self._suppressed)

    logging.getLogger("uvicorn.access").addFilter(SuppressPollingFilter())

    logger.info(f"Starting TTS server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()

"""PrivateVoice TTS server (FastAPI + Qwen3-TTS)."""

import os
import platform
import signal
import sys

# Ignore SIGPIPE to prevent broken pipe crashes during stdout writes
# This must be done early before any libraries print to stdout
signal.signal(signal.SIGPIPE, signal.SIG_IGN)

import torch
from contextlib import asynccontextmanager
from typing import Optional, List

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from .inference import get_model, PRESET_SPEAKERS
from .device import get_device_config, get_memory_info
from .download_tracker import get_download_tracker, DownloadProgress
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


SUPPORTED_FORMATS = ("wav", "mp3")


class CustomVoiceRequest(BaseModel):
    text: str
    speaker: str = "serena"
    instruction: str = ""
    language: str = "english"
    format: str = "wav"


class VoiceDesignRequest(BaseModel):
    text: str
    voice_description: str
    language: str = "english"
    format: str = "wav"


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


class SystemInfoResponse(BaseModel):
    python_version: str
    torch_version: str
    device: str
    device_name: str
    memory_total_gb: float
    memory_available_gb: float
    cache_dir: str


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


app = FastAPI(
    title="PrivateVoice Server",
    description="Local text-to-speech server powered by Qwen3-TTS",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Tauri frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tauri uses custom protocol, allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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

@app.post("/load-model")
async def load_model(request: LoadModelRequest):
    """Load or switch the TTS model."""
    model = get_model()
    state = get_startup_state()

    try:
        state.set_phase("loading-model", f"Loading {request.model_id} model...", 85)
        model.load(request.model_id)
        state.set_phase("ready", "Model loaded and ready", 100)
        return {"status": "loaded", "model_id": request.model_id}
    except Exception as e:
        state.set_phase("error", str(e), 0)
        logger.error(f"Failed to load model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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

    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters")

    fmt = request.format if request.format in SUPPORTED_FORMATS else "wav"

    try:
        logger.info(f"Generating custom voice: speaker={request.speaker}, lang={request.language}, fmt={fmt}, text={request.text[:50]}...")
        audio_bytes, media_type = model.generate_custom_voice(
            text=request.text,
            speaker=request.speaker,
            instruction=request.instruction,
            language=request.language,
            output_format=fmt,
        )
        return Response(content=audio_bytes, media_type=media_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/voice-clone")
async def generate_voice_clone(
    text: str = Form(...),
    reference_text: str = Form(""),
    reference_audio: UploadFile = File(...),
    x_vector_only_mode: bool = Form(False),
    language: str = Form("english"),
    format: str = Form("wav"),
):
    """Generate speech by cloning a reference voice."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters")

    fmt = format if format in SUPPORTED_FORMATS else "wav"

    try:
        logger.info(f"Generating voice clone: lang={language}, fmt={fmt}, text={text[:50]}...")
        audio_data = await reference_audio.read()
        if len(audio_data) > MAX_AUDIO_SIZE:
            raise HTTPException(status_code=400, detail=f"Reference audio exceeds maximum size of {MAX_AUDIO_SIZE // (1024*1024)} MB")
        if not x_vector_only_mode and not reference_text:
            raise HTTPException(status_code=400, detail="Reference text is required unless low-quality mode is enabled.")
        audio_bytes, media_type = model.generate_voice_clone(
            text=text,
            reference_audio=audio_data,
            reference_text=reference_text,
            language=language,
            x_vector_only_mode=x_vector_only_mode,
            output_format=fmt,
        )
        return Response(content=audio_bytes, media_type=media_type)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice clone failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/voice-design")
async def generate_voice_design(request: VoiceDesignRequest):
    """Generate speech with a novel voice from description."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters")

    fmt = request.format if request.format in SUPPORTED_FORMATS else "wav"

    try:
        logger.info(f"Generating voice design: lang={request.language}, fmt={fmt}, desc={request.voice_description[:50]}...")
        audio_bytes, media_type = model.generate_voice_design(
            text=request.text,
            voice_description=request.voice_description,
            language=request.language,
            output_format=fmt,
        )
        return Response(content=audio_bytes, media_type=media_type)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Voice design failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Lifecycle Endpoints
# ============================================================================

@app.post("/shutdown")
async def shutdown():
    """Graceful shutdown."""
    model = get_model()
    if model.is_loaded:
        model.unload()

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

    state = get_startup_state()
    state.set_phase("starting-server", f"Starting TTS server on {host}:{port}", 5)

    logger.info(f"Starting TTS server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()

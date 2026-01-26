"""FastAPI server for Qwen3-TTS."""

import os
import signal
import sys
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from .inference import get_model, PRESET_SPEAKERS
from .device import get_device_config, get_memory_info


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


class CustomVoiceRequest(BaseModel):
    text: str
    speaker: str = "serena"
    instruction: str = ""


class VoiceDesignRequest(BaseModel):
    text: str
    voice_description: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown."""
    print("TTS Server starting...")
    yield
    # Cleanup on shutdown
    print("TTS Server shutting down...")
    model = get_model()
    if model.is_loaded:
        model.unload()


app = FastAPI(
    title="Qwen3-TTS Server",
    description="Text-to-speech server for Apple Silicon",
    version="0.1.0",
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


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check server health."""
    return HealthResponse(status="ok", version="0.1.0")


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


@app.get("/speakers")
async def list_speakers():
    """List available preset speakers."""
    return {"speakers": PRESET_SPEAKERS}


@app.post("/load-model")
async def load_model(request: LoadModelRequest):
    """Load or switch the TTS model."""
    model = get_model()

    try:
        model.load(request.model_id)
        return {"status": "loaded", "model_id": request.model_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/unload-model")
async def unload_model():
    """Unload the current model to free memory."""
    model = get_model()
    model.unload()
    return {"status": "unloaded"}


@app.post("/generate/custom-voice")
async def generate_custom_voice(request: CustomVoiceRequest):
    """Generate speech using a preset speaker voice."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    try:
        audio_bytes = model.generate_custom_voice(
            text=request.text,
            speaker=request.speaker,
            instruction=request.instruction,
        )
        return Response(content=audio_bytes, media_type="audio/wav")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/voice-clone")
async def generate_voice_clone(
    text: str = Form(...),
    reference_text: str = Form(...),
    reference_audio: UploadFile = File(...),
):
    """Generate speech by cloning a reference voice."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    try:
        audio_data = await reference_audio.read()
        audio_bytes = model.generate_voice_clone(
            text=text,
            reference_audio=audio_data,
            reference_text=reference_text,
        )
        return Response(content=audio_bytes, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/voice-design")
async def generate_voice_design(request: VoiceDesignRequest):
    """Generate speech with a novel voice from description."""
    model = get_model()

    if not model.is_loaded:
        raise HTTPException(status_code=400, detail="Model not loaded")

    try:
        audio_bytes = model.generate_voice_design(
            text=request.text,
            voice_description=request.voice_description,
        )
        return Response(content=audio_bytes, media_type="audio/wav")
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/shutdown")
async def shutdown():
    """Graceful shutdown."""
    model = get_model()
    if model.is_loaded:
        model.unload()

    # Signal the process to exit
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting down"}


def main():
    """Run the server."""
    import uvicorn

    port = int(os.environ.get("TTS_SERVER_PORT", "8765"))
    host = os.environ.get("TTS_SERVER_HOST", "127.0.0.1")

    print(f"Starting TTS server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()

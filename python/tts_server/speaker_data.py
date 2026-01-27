"""Speaker metadata for Qwen3-TTS preset voices."""

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class SpeakerInfo:
    """Information about a preset speaker."""

    name: str
    description: str
    native_language: str
    personality: str
    gender: str


# Speaker metadata from HuggingFace model card
SPEAKERS: List[SpeakerInfo] = [
    SpeakerInfo(
        name="vivian",
        description="Bright, slightly edgy young female voice",
        native_language="Chinese",
        personality="Energetic and expressive",
        gender="female",
    ),
    SpeakerInfo(
        name="serena",
        description="Warm, gentle young female voice",
        native_language="Chinese",
        personality="Calm and soothing",
        gender="female",
    ),
    SpeakerInfo(
        name="uncle_fu",
        description="Seasoned male voice with low mellow timbre",
        native_language="Chinese",
        personality="Wise and reassuring",
        gender="male",
    ),
    SpeakerInfo(
        name="dylan",
        description="Youthful Beijing male voice, clear and natural",
        native_language="Chinese (Beijing)",
        personality="Friendly and approachable",
        gender="male",
    ),
    SpeakerInfo(
        name="eric",
        description="Lively Chengdu male voice, slightly husky",
        native_language="Chinese (Sichuan)",
        personality="Warm and energetic",
        gender="male",
    ),
    SpeakerInfo(
        name="ryan",
        description="Dynamic male voice with strong rhythmic drive",
        native_language="English",
        personality="Confident and engaging",
        gender="male",
    ),
    SpeakerInfo(
        name="aiden",
        description="Sunny American male voice, clear midrange",
        native_language="English",
        personality="Cheerful and articulate",
        gender="male",
    ),
    SpeakerInfo(
        name="ono_anna",
        description="Playful Japanese female voice, light and nimble",
        native_language="Japanese",
        personality="Cute and animated",
        gender="female",
    ),
    SpeakerInfo(
        name="sohee",
        description="Warm Korean female voice, rich in emotion",
        native_language="Korean",
        personality="Expressive and heartfelt",
        gender="female",
    ),
]

# Quick lookup by name
SPEAKER_MAP = {s.name: s for s in SPEAKERS}

# Supported languages for TTS generation
SUPPORTED_LANGUAGES = [
    "Chinese",
    "English",
    "Japanese",
    "Korean",
    "German",
    "French",
    "Russian",
    "Portuguese",
    "Spanish",
    "Italian",
]


def get_speaker_info(name: str) -> Optional[SpeakerInfo]:
    """Get speaker info by name."""
    return SPEAKER_MAP.get(name.lower())


def get_all_speakers() -> List[SpeakerInfo]:
    """Get all speaker information."""
    return SPEAKERS


def get_speakers_dict() -> List[dict]:
    """Get all speakers as dictionaries for API response."""
    return [
        {
            "name": s.name,
            "description": s.description,
            "native_language": s.native_language,
            "personality": s.personality,
            "gender": s.gender,
        }
        for s in SPEAKERS
    ]

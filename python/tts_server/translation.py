"""Local text translation for PrivateVoice (transformers/NLLB)."""

from __future__ import annotations

import gc
import logging
import re
import threading
from dataclasses import dataclass
from typing import Any, Optional

import torch

from .model_registry import (
    TRANSLATION_MODEL_SPECS,
    ensure_required_files,
    verify_snapshot_hashes,
)

logger = logging.getLogger("tts_server")


TRANSLATION_MODELS = {
    "nllb-600m": {
        "model_id": TRANSLATION_MODEL_SPECS["nllb-600m"].repo_id,
        "label": "NLLB Distilled 600M",
        "parameters": "600M",
        "download_size_mb": 1300,
    },
}

DEFAULT_TRANSLATION_MODEL_KEY = "nllb-600m"

# UI language names -> NLLB language codes
LANGUAGE_TO_NLLB = {
    "english": "eng_Latn",
    "chinese": "zho_Hans",
    "japanese": "jpn_Jpan",
    "korean": "kor_Hang",
    "german": "deu_Latn",
    "french": "fra_Latn",
    "russian": "rus_Cyrl",
    "portuguese": "por_Latn",
    "spanish": "spa_Latn",
    "italian": "ita_Latn",
}


@dataclass
class TranslationResult:
    text: str
    source_language: str
    target_language: str


def _normalize_language(language: Optional[str]) -> str:
    normalized = (language or "").strip().lower()
    if normalized in ("", "auto", "auto-detect"):
        return "auto"
    if normalized not in LANGUAGE_TO_NLLB:
        raise ValueError(
            f"Unsupported language: {language}. "
            f"Available: {sorted(LANGUAGE_TO_NLLB.keys())}"
        )
    return normalized


def _normalize_model_key(model_key: Optional[str]) -> str:
    normalized = (model_key or "").strip().lower()
    if not normalized:
        return DEFAULT_TRANSLATION_MODEL_KEY
    if normalized not in TRANSLATION_MODELS:
        raise ValueError(
            f"Unsupported translation model: {model_key}. "
            f"Available: {sorted(TRANSLATION_MODELS.keys())}"
        )
    return normalized


def _detect_source_language(text: str) -> str:
    """Simple script-based source detection for local translation."""
    if re.search(r"[\uac00-\ud7af]", text):
        return "korean"
    if re.search(r"[\u3040-\u30ff]", text):
        return "japanese"
    if re.search(r"[\u4e00-\u9fff]", text):
        return "chinese"
    if re.search(r"[\u0400-\u04ff]", text):
        return "russian"
    # Latin script default (common case: English prompt -> selected target language)
    return "english"


def _resolve_bos_token_id(tokenizer: Any, language_code: str) -> int:
    """Resolve BOS token ID across tokenizer variants."""
    mapping = getattr(tokenizer, "lang_code_to_id", None)
    if isinstance(mapping, dict):
        token_id = mapping.get(language_code)
        if token_id is not None and int(token_id) >= 0:
            return int(token_id)

    get_lang_id = getattr(tokenizer, "get_lang_id", None)
    if callable(get_lang_id):
        token_id = get_lang_id(language_code)
        if token_id is not None and int(token_id) >= 0:
            return int(token_id)

    convert_tokens_to_ids = getattr(tokenizer, "convert_tokens_to_ids", None)
    if callable(convert_tokens_to_ids):
        token_id = convert_tokens_to_ids(language_code)
        unk_token_id = getattr(tokenizer, "unk_token_id", None)
        if (
            token_id is not None
            and int(token_id) >= 0
            and (unk_token_id is None or int(token_id) != int(unk_token_id))
        ):
            return int(token_id)

    raise RuntimeError(f"Tokenizer cannot resolve target language token: {language_code}")


class LocalTranslator:
    """Lazy-loaded local translator using a single multilingual NLLB model."""

    def __init__(self, model_key: str = DEFAULT_TRANSLATION_MODEL_KEY):
        resolved_model_key = _normalize_model_key(model_key)
        self.model_key = resolved_model_key
        self.model_id = TRANSLATION_MODELS[resolved_model_key]["model_id"]
        self._model = None
        self._tokenizer = None
        self._loaded = False
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def _release_model(self) -> None:
        if self._model is not None:
            del self._model
        if self._tokenizer is not None:
            del self._tokenizer
        self._model = None
        self._tokenizer = None
        self._loaded = False

    def load(self, model_key: Optional[str] = None) -> None:
        resolved_model_key = _normalize_model_key(model_key or self.model_key)
        model_spec = TRANSLATION_MODEL_SPECS[resolved_model_key]
        resolved_model_id = model_spec.repo_id

        if self._loaded and self.model_id == resolved_model_id:
            return

        with self._lock:
            if self._loaded and self.model_id == resolved_model_id:
                return

            if self._loaded:
                self._release_model()
                gc.collect()

            from huggingface_hub import snapshot_download
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            logger.info("Loading translation model: %s", resolved_model_id)
            local_path = snapshot_download(
                repo_id=resolved_model_id,
                revision=model_spec.revision,
                allow_patterns=list(model_spec.required_files),
            )
            ensure_required_files(local_path, model_spec.required_files)
            verify_snapshot_hashes(local_path, model_spec.expected_sha256)

            self._tokenizer = AutoTokenizer.from_pretrained(local_path)
            self._model = AutoModelForSeq2SeqLM.from_pretrained(local_path)
            self._model.eval()
            self.model_key = resolved_model_key
            self.model_id = resolved_model_id
            self._loaded = True
            logger.info("Translation model loaded")

    def unload(self) -> None:
        with self._lock:
            self._release_model()

        gc.collect()
        logger.info("Translation model unloaded")

    def translate_text(
        self,
        text: str,
        target_language: str,
        source_language: str = "auto",
    ) -> TranslationResult:
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        target = _normalize_language(target_language)
        if target == "auto":
            raise ValueError("Target language cannot be Auto")

        source = _normalize_language(source_language)
        if source == "auto":
            source = _detect_source_language(text)

        if source == target:
            return TranslationResult(
                text=text.strip(),
                source_language=source,
                target_language=target,
            )

        if not self._loaded or self._model is None or self._tokenizer is None:
            raise RuntimeError("Translation model not loaded")

        tokenizer = self._tokenizer
        model = self._model

        tokenizer.src_lang = LANGUAGE_TO_NLLB[source]
        encoded = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
        )

        with torch.no_grad():
            generated = model.generate(
                **encoded,
                forced_bos_token_id=_resolve_bos_token_id(
                    tokenizer,
                    LANGUAGE_TO_NLLB[target],
                ),
                max_new_tokens=512,
            )

        translated = tokenizer.batch_decode(generated, skip_special_tokens=True)[0].strip()
        if not translated:
            translated = text.strip()

        return TranslationResult(
            text=translated,
            source_language=source,
            target_language=target,
        )


_translator: Optional[LocalTranslator] = None


def get_local_translator() -> LocalTranslator:
    global _translator
    if _translator is None:
        _translator = LocalTranslator()
    return _translator

"""Local text translation for PrivateVoice (transformers/NLLB)."""

from __future__ import annotations

import gc
import logging
import re
import threading
from dataclasses import dataclass
from typing import Optional

import torch

logger = logging.getLogger("tts_server")


NLLB_MODEL_ID = "facebook/nllb-200-distilled-600M"

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


class LocalTranslator:
    """Lazy-loaded local translator using a single multilingual NLLB model."""

    def __init__(self, model_id: str = NLLB_MODEL_ID):
        self.model_id = model_id
        self._model = None
        self._tokenizer = None
        self._loaded = False
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        if self._loaded:
            return

        with self._lock:
            if self._loaded:
                return

            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            logger.info("Loading translation model: %s", self.model_id)
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_id)
            self._model = AutoModelForSeq2SeqLM.from_pretrained(self.model_id)
            self._model.eval()
            self._loaded = True
            logger.info("Translation model loaded")

    def unload(self) -> None:
        with self._lock:
            if self._model is not None:
                del self._model
            if self._tokenizer is not None:
                del self._tokenizer
            self._model = None
            self._tokenizer = None
            self._loaded = False

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

        self.load()

        if self._model is None or self._tokenizer is None:
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
                forced_bos_token_id=tokenizer.lang_code_to_id[LANGUAGE_TO_NLLB[target]],
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

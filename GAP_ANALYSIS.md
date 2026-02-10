# PrivateVoice v1.0 -- Gap Analysis

**Audit date:** 2026-02-10
**Method:** Empirical API testing and MCP tool inspection. No source code was read.
**Scope:** Backend API behavior, error handling, feature completeness, UI/API alignment

---

## Critical Bugs

### 1. MP3 Export is Broken (Severity: HIGH)
- **Finding:** `POST /generate/custom-voice` with `"format": "mp3"` returns HTTP 500
- **Error:** `'bytearray' object has no attribute 'encode'`
- **Impact:** Users cannot export audio as MP3. The Settings panel offers MP3 as a format option, and the system-info endpoint advertises `supported_mp3_bitrates: [128, 192, 256, 320]`, creating a false expectation.
- **Recommendation:** Fix the MP3 encoding path in the inference module. Until fixed, consider hiding or disabling the MP3 option in the UI.

### 2. ~~Invalid TTS Model IDs Accepted Without Validation~~ (FIXED)
- **Finding:** `POST /load-model` with `{"model_id": "invalid_model"}` previously returned `{"status": "loaded", "model_id": "invalid_model"}` and consumed ~1GB of memory.
- **Status:** **FIXED** — Model ID validation was added to `/load-model` in the same release cycle. The endpoint now returns HTTP 400 with a list of valid model IDs for unknown IDs. The Auditor tested against a production build created before this fix was applied.

### 3. Empty Text Generates Audio Instead of Returning Error (Severity: LOW)
- **Finding:** `POST /generate/custom-voice` with `"text": ""` returns HTTP 200 and a 167KB WAV file.
- **Impact:** Wastes compute and may confuse users. The frontend may have its own empty-text validation, but the backend should also enforce it.
- **Recommendation:** Return HTTP 400 with a descriptive error when text is empty or whitespace-only.

---

## API Design Issues

### 4. Inconsistent Error Status Codes
- Voice clone with wrong model type returns **500** (server error), but voice design with wrong model type returns **400** (client error). Both are model compatibility issues and should return 400.
- The voice clone error message includes raw internal model metadata (`tokenizer_type`, `tts_model_size`, `tts_model_type`), which is not user-friendly.

### 5. Memory Check is Advisory Only
- `GET /memory-check/{model_id}` returns `"sufficient": false` with a warning, but `POST /load-model` proceeds regardless.
- The memory check endpoint also does not validate model IDs -- `GET /memory-check/invalid_id` returns a default 8GB requirement instead of an error.
- **Recommendation:** Either make the memory check blocking (reject load-model when insufficient) or clearly document that it is advisory. Also validate model IDs in this endpoint.

### 6. CORS Allows Any Origin
- The server responds with `Access-Control-Allow-Origin` matching whatever `Origin` header is sent, including `http://evil.com`.
- For a localhost-only service this is low risk, but it means any website the user visits could make API calls to the TTS server.
- **Recommendation:** Restrict CORS to `http://localhost:1420`, `http://127.0.0.1:1420`, and `tauri://localhost` only.

### 7. Swagger UI and ReDoc Exposed in Production
- Both `/docs` and `/redoc` return HTTP 200, serving interactive API documentation.
- While useful for development, these should be disabled in production builds to reduce attack surface.

---

## Whisper Transcription: API vs UI Gap

### 8. Whisper is API-Ready but Potentially Hidden in UI (Severity: MEDIUM)
- **Backend status:** Fully functional. All 5 Whisper endpoints work correctly:
  - `GET /whisper-status` -- reports loaded/unloaded state
  - `GET /whisper-models` -- lists 6 available model sizes with download sizes
  - `POST /load-whisper` -- loads a Whisper model (tested with "tiny", 75MB)
  - `POST /unload-whisper` -- cleans up
  - `POST /transcribe` -- transcribes audio files with text, language, confidence, duration
- **Validation:** Whisper properly rejects invalid model sizes with a descriptive error listing valid options.
- **UI concern:** Based on the PRODUCTION_TEST_PROCEDURE.md, there is no test coverage for Whisper UI interactions, suggesting the UI may show a "Coming Soon" placeholder or may not expose the transcription feature at all.
- **Recommendation:** Either build a Whisper UI panel or clearly document it as an API-only feature for v1.0.

---

## UX Gaps and Missing Features

### 9. No Text Length Validation or Guidance
- The API accepts empty text and presumably very long text without limits.
- The PRODUCTION_TEST_PROCEDURE mentions testing "very long text (2000 chars)" as an edge case, but there is no documented maximum.
- **Recommendation:** Add a character limit and show a counter in the UI. Document any backend limits.

### 10. Download Progress Not Granular for Model Loading
- The `/download-progress` endpoint tracks HuggingFace file downloads well, but the two-phase model load (download + `from_pretrained`) means there's a gap between "download complete" and "model ready" with no progress indication.
- The startup-status endpoint shows broad phases (downloading=40%, loading=60%), but loading can take 5-30 seconds with no sub-progress.

### 11. No Generation Progress or Cancel Mechanism
- Speech generation is synchronous. For long texts, the user has no progress indicator or ability to cancel a generation in progress.
- **Recommendation:** Consider adding a streaming/progress endpoint or at minimum a cancel endpoint.

### 12. Voice Clone Recording Requires Production Build
- The PRODUCTION_TEST_PROCEDURE notes that voice clone recording requires a production build because WebView security blocks microphone access in dev mode.
- This means developers testing locally cannot use the recording feature.

### 13. No Audio Preview Before Export
- It is unclear from the API alone whether the frontend provides playback controls before requiring export. The API returns raw audio bytes -- the frontend must handle playback.

---

## Feature Completeness Cross-Reference

Comparing features discovered via API against PRODUCTION_TEST_PROCEDURE.md:

### Features Verified Working via API
- [x] Health monitoring and startup status
- [x] Model loading and unloading
- [x] Memory checking
- [x] Custom Voice generation (WAV format, multiple speakers, multiple languages, style instructions)
- [x] Voice Clone compatibility enforcement (correct error when wrong model type)
- [x] Voice Design compatibility enforcement
- [x] Whisper model management (load, unload, status, model listing)
- [x] Whisper transcription
- [x] Logs with level filtering
- [x] System info reporting
- [x] Download progress tracking

### Features That Exist in API but Are Broken
- [ ] MP3 export (500 error)
- [ ] Invalid model ID handling (accepts anything)

### Features Not Testable via API (Frontend Only)
- [ ] Onboarding/Welcome screen (test 1.4, 1.5)
- [ ] Mode tab switching with orange dot indicators (test 5.3)
- [ ] Settings panel open/close and all UI controls (tests 6.1-6.9)
- [ ] Help panel
- [ ] Debug console UI (tests 7.1-7.4)
- [ ] Library drawer with tabs, search, persistence (tests 8.1-8.16)
- [ ] Visual layout validation at 4 resolutions (tests 9.1-9.12)
- [ ] Keyboard navigation (test 10.3)
- [ ] Speaker selector dropdown (test 2.7)
- [ ] Style instruction presets (test 2.6)
- [ ] Generate button enable/disable states (tests 2.3, 2.4)
- [ ] WAV/MP3 export via native Tauri dialog (tests 2.8, 2.9)
- [ ] Audio playback in output panel
- [ ] Voice Clone file import and recording (tests 3.3, 3.4)
- [ ] Theme switching dark/light (test 6.8)

### Features Mentioned in Tests but Not Discoverable via API
- **Keyboard shortcuts** -- Referenced in test 10.3 but no API endpoint lists them.
- **Reset to defaults** -- Mentioned in test 6.9 but no API endpoint for settings reset.
- **Style instruction presets** -- Test 2.6 mentions these are visible in UI, but no API endpoint lists them.

---

## Recommendations Summary

| Priority | Issue | Action |
|----------|-------|--------|
| P0 | MP3 export broken | Fix bytearray encoding bug in inference.py |
| P1 | Invalid model IDs accepted | Add model_id validation to /load-model |
| P1 | Whisper UI missing/hidden | Build transcription UI or document as API-only |
| P2 | Empty text generates audio | Add text validation (non-empty, length limit) |
| P2 | Inconsistent error codes | Normalize to 400 for client errors, 500 for server errors |
| P2 | Memory check not validating IDs | Validate model_id in /memory-check endpoint |
| P3 | CORS allows any origin | Restrict to known origins |
| P3 | Swagger/ReDoc in production | Disable in release builds |
| P3 | No generation cancel mechanism | Add /cancel-generation endpoint |
| P3 | No text length guidance | Document limits, add frontend counter |

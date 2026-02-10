---
description: Run a complete round-trip TTS test — launch PrivateVoice, generate audio, verify speech accuracy, and capture screenshots.
argument-hint: "[text to speak] [--model 0.6b] [--speaker serena] [--skip-audio-capture]"
allowed-tools: ["Bash", "Read", "mcp__plugin_privatevoice-control_privatevoice__app_launch_and_verify", "mcp__plugin_privatevoice-control_privatevoice__app_capture_view", "mcp__plugin_privatevoice-control_privatevoice__app_trigger_action", "mcp__plugin_privatevoice-control_privatevoice__app_get_status", "mcp__plugin_privatevoice-control_privatevoice__app_listen_audio", "mcp__plugin_privatevoice-control_privatevoice__verify_speech_accuracy", "mcp__plugin_privatevoice-control_privatevoice__app_shutdown"]
---

# Round-Trip TTS Test

Run a complete end-to-end test of the PrivateVoice app.

## Parameters

Parse from the user's arguments:
- **text**: The text to speak (default: "Hello, this is a round trip test of Private Voice.")
- **model**: Model ID to load (default: "0.6b")
- **speaker**: Speaker voice (default: "serena")
- **skip-audio-capture**: If set, skip the system audio capture step

## Test Sequence

### Phase 1: Launch
1. Call `app_get_status` to check if app is already running
2. If not running, call `app_launch_and_verify` with the specified model
3. If running but wrong model loaded, call `app_trigger_action(action="load_model", params={"model_id": "<model>"})`

### Phase 2: Baseline Screenshot
4. Call `app_capture_view` — save as baseline screenshot
5. Report the screenshot path and dimensions

### Phase 3: Generate Audio
6. Call `app_trigger_action` with:
   - action: "generate_custom_voice"
   - params: {"text": "<text>", "speaker": "<speaker>"}
7. Note the returned audio file path and size

### Phase 4: Verify Generated Audio
8. Call `verify_speech_accuracy` with:
   - audio_path: the generated audio file
   - expected_text: the input text
9. Report WER and pass/fail

### Phase 5: System Audio Capture (optional)
10. If not skipped, call `app_listen_audio(duration_seconds=5)` to capture any playback
11. If captured, run `verify_speech_accuracy` on the captured audio too

### Phase 6: Post-Generation Screenshot
12. Call `app_capture_view` — save as post-generation screenshot

### Phase 7: Report
13. Print a summary table:

```
Round-Trip Test Results
========================
App Launch:      PASS (23.4s)
Model:           0.6b (loaded)
Screenshot 1:    /tmp/pv_screenshot_001.png (1280x800)
Generation:      PASS (2.3s, 45KB WAV)
Speech Verify:   PASS (WER: 0.00)
Audio Capture:   PASS/SKIP
Screenshot 2:    /tmp/pv_screenshot_002.png
Overall:         PASS
```

Do NOT shut down the app after the test — the user may want to run additional tests.

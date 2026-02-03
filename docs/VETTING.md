# Vetting Checklist

Date: 2026-02-03
Branch: codex/vetting-2026-02-03
Models: 0.6B, 1.7B, 1.7B-Design

**Scope**
- Validate production macOS build behavior and UX.
- Validate voice clone recording in production build.
- Validate feature parity between 0.6B and 1.7B.
- Defer automated testing until after manual checkpoint.

**Checklist**
| ID | Check | Expected | Result | Notes |
| --- | --- | --- | --- | --- |
| 1 | Production build launch | App opens, sidecar starts, loading screen clears |  |  |
| 2 | First-run onboarding | Welcome shown once, model selection triggers download |  |  |
| 3 | Model download progress | Status shows progress and completes |  |  |
| 4 | Model switching | 0.6B <-> 1.7B switches cleanly |  |  |
| 5 | Voice Design gating | Warning appears without 1.7B-Design |  |  |
| 6 | Custom Voice (0.6B) | Generates audio, waveform renders, playback works |  |  |
| 7 | Custom Voice (1.7B) | Generates audio, waveform renders, playback works |  |  |
| 8 | Voice Clone Import (0.6B) | Import + transcript generates audio |  |  |
| 9 | Voice Clone Import (1.7B) | Import + transcript generates audio |  |  |
| 10 | Voice Clone Record (prod) | Mic prompt appears, live waveform, generate works |  |  |
| 11 | Voice Clone error handling | Denied mic shows helpful error |  |  |
| 12 | Voice Design (1.7B-Design) | Generates and plays audio |  |  |
| 13 | Export | WAV saved with correct filename format |  |  |
| 14 | Library | Save/recents persist and play after relaunch |  |  |
| 15 | Settings persistence | Theme, defaults, auto-load persist |  |  |
| 16 | Debug console | Logs and system info visible |  |  |
| 17 | Keyboard shortcuts | Cmd+Enter, Cmd+S, Cmd+1/2/3, Space work |  |  |
| 18 | Offline after download | Works without network once models cached |  |  |

**Known Gaps To Confirm**
- Voice Clone low-quality mode may still require transcript.
- Auto-transcribe toggle is present but Whisper is disabled in UI.
- Language selector may not affect backend generation.
- Export folder setting is display-only for now.

**Follow-ups**
- Update docs to match backend entrypoint and build outputs.
- Add or adjust automated tests based on manual findings.
- Decide on MP3 export approach.

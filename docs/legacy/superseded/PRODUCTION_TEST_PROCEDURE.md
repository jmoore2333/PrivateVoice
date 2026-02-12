# PrivateVoice v1.0 — Production Test Procedure

## Overview

This document describes the automated and manual test procedures for verifying the PrivateVoice v1.0 release. All automated tests use Playwright (E2E) and Vitest (unit) with mocked backend APIs for CI compatibility.

## Test Files

| File | Type | Tests | Scope |
|------|------|-------|-------|
| `src/lib/stores/libraryStore.test.ts` | Unit (Vitest) | 37 | Library persistence (localStorage fallback, Tauri FS mock, edge cases) |
| `src/lib/stores/*.test.ts` | Unit (Vitest) | 216 total | All stores, API client, components |
| `e2e/example.spec.ts` | E2E (Playwright) | 8 | Onboarding, basic app navigation |
| `e2e/library.spec.ts` | E2E (Playwright) | 14 | Library drawer UI, tabs, search, seeded data |
| `e2e/production.spec.ts` | E2E (Playwright) | 34 | Full production test matrix (9 suites) |
| `e2e/visual-validation.spec.ts` | E2E (Playwright) | 37 | Multi-resolution visual validation + screenshots |

## Running Tests

```bash
# Unit tests
pnpm test:run                   # All unit tests (216 tests)
pnpm test:run -- src/lib/stores/libraryStore.test.ts   # Library only

# E2E tests (starts dev server automatically)
pnpm test:e2e                   # All E2E tests

# Full suite
pnpm test:all                   # Type check + unit + E2E
```

## Test Matrix

### 1. App Startup & Health
| # | Test | Automated | File |
|---|------|-----------|------|
| 1.1 | App loads with correct title | Yes | production.spec.ts |
| 1.2 | Main UI becomes interactive after startup | Yes | production.spec.ts |
| 1.3 | Handles server unavailable gracefully | Yes | production.spec.ts |
| 1.4 | Onboarding shows on first launch | Yes | example.spec.ts |
| 1.5 | Onboarding saves model selection | Yes | example.spec.ts |

### 2. Custom Voice Generation
| # | Test | Automated | File |
|---|------|-----------|------|
| 2.1 | Custom Voice mode is default | Yes | production.spec.ts |
| 2.2 | Can enter text | Yes | production.spec.ts |
| 2.3 | Generate disabled when text empty | Yes | production.spec.ts |
| 2.4 | Generate enables with text | Yes | production.spec.ts |
| 2.5 | Full generation flow (text → generate → audio) | Yes | production.spec.ts |
| 2.6 | Style instruction presets visible | Yes | production.spec.ts |
| 2.7 | Speaker selector works | Manual | — |
| 2.8 | WAV export via native dialog | Manual | Requires Tauri runtime |
| 2.9 | MP3 export via native dialog | Manual | Requires Tauri runtime |

### 3. Voice Clone Flow
| # | Test | Automated | File |
|---|------|-----------|------|
| 3.1 | Switch to Voice Clone mode | Yes | production.spec.ts |
| 3.2 | Required fields visible | Yes | production.spec.ts |
| 3.3 | Import reference audio file | Manual | File upload in WebView |
| 3.4 | Record reference audio | Manual | Requires production build (mic access) |
| 3.5 | Generate cloned voice | Manual | Requires real model |
| 3.6 | Low-quality mode toggle | Manual | — |

### 4. Voice Design Flow
| # | Test | Automated | File |
|---|------|-----------|------|
| 4.1 | Switch to Voice Design mode | Yes | production.spec.ts |
| 4.2 | Description textarea visible | Yes | production.spec.ts |
| 4.3 | Generate designed voice | Manual | Requires real model |

### 5. Model/Mode Compatibility
| # | Test | Automated | File |
|---|------|-----------|------|
| 5.1 | Warning when mode doesn't match model | Yes | production.spec.ts |
| 5.2 | Incompatibility for Voice Design + Custom model | Yes | production.spec.ts |
| 5.3 | Incompatibility indicators on mode buttons | Yes | production.spec.ts |
| 5.4 | Model switch prompt with Load button | Yes | production.spec.ts |
| 5.5 | Can switch between all three modes | Yes | production.spec.ts |

### 6. Settings Panel
| # | Test | Automated | File |
|---|------|-----------|------|
| 6.1 | Opens from header button | Yes | production.spec.ts |
| 6.2 | Closes via close button | Yes | production.spec.ts |
| 6.3 | Closes via backdrop | Yes | production.spec.ts |
| 6.4 | Shows Default Model setting | Yes | production.spec.ts |
| 6.5 | Shows export format setting | Yes | production.spec.ts |
| 6.6 | Shows app version | Yes | production.spec.ts |
| 6.7 | Auto-load toggle present | Yes | production.spec.ts |
| 6.8 | Theme switching (dark/light) | Manual | Visual verification |
| 6.9 | Reset to defaults | Manual | — |

### 7. Debug Console
| # | Test | Automated | File |
|---|------|-----------|------|
| 7.1 | Opens via button | Yes | production.spec.ts |
| 7.2 | Logs and System tabs visible | Yes | production.spec.ts |
| 7.3 | Closes properly | Yes | production.spec.ts |
| 7.4 | System tab shows device info | Yes | production.spec.ts |

### 8. Library Persistence
| # | Test | Automated | File |
|---|------|-----------|------|
| 8.1 | Library button accessible | Yes | production.spec.ts |
| 8.2 | Opens library drawer | Yes | production.spec.ts |
| 8.3 | Opens/closes via close button | Yes | library.spec.ts |
| 8.4 | Opens/closes via backdrop | Yes | library.spec.ts |
| 8.5 | Three tabs visible | Yes | library.spec.ts |
| 8.6 | Empty states for all tabs | Yes | library.spec.ts |
| 8.7 | Search input present | Yes | library.spec.ts |
| 8.8 | Search with no results | Yes | library.spec.ts |
| 8.9 | Shows audio items in Audio tab | Yes | library.spec.ts |
| 8.10 | Shows voices in Voices tab | Yes | library.spec.ts |
| 8.11 | Search filters by name | Yes | library.spec.ts |
| 8.12 | Search filters by comment | Yes | library.spec.ts |
| 8.13 | Tab switch preserves search | Yes | library.spec.ts |
| 8.14 | Clear search restores items | Yes | library.spec.ts |
| 8.15 | Save → quit → reopen → persists (Tauri FS) | Manual | Requires Tauri runtime |
| 8.16 | Delete removes audio file + metadata | Unit | libraryStore.test.ts |

### 9. Visual Validation (Multi-Resolution)
| # | Test | Automated | File |
|---|------|-----------|------|
| 9.1 | Core modules visible at 900×650 | Yes | visual-validation.spec.ts |
| 9.2 | Core modules visible at 1280×800 | Yes | visual-validation.spec.ts |
| 9.3 | Core modules visible at 1440×900 | Yes | visual-validation.spec.ts |
| 9.4 | Core modules visible at 1920×1080 | Yes | visual-validation.spec.ts |
| 9.5 | Mode switching at all resolutions | Yes | visual-validation.spec.ts |
| 9.6 | Settings panel at all resolutions | Yes | visual-validation.spec.ts |
| 9.7 | Library drawer at all resolutions | Yes | visual-validation.spec.ts |
| 9.8 | Debug console at all resolutions | Yes | visual-validation.spec.ts |
| 9.9 | Help panel at all resolutions | Yes | visual-validation.spec.ts |
| 9.10 | Generate button not obscured at all resolutions | Yes | visual-validation.spec.ts |
| 9.11 | Input/output panel layout at all resolutions | Yes | visual-validation.spec.ts |
| 9.12 | Full-page screenshots (all modes × all resolutions) | Yes | visual-validation.spec.ts |

### 10. Cross-cutting
| # | Test | Automated | File |
|---|------|-----------|------|
| 10.1 | No console errors on startup | Yes | production.spec.ts |
| 10.2 | No unhandled exceptions | Yes | production.spec.ts |
| 10.3 | Keyboard navigation | Yes | production.spec.ts |

## Manual Test Procedure (Pre-Release)

The following tests require a full Tauri build with real model inference. Run on a Mac with 16GB+ RAM.

### Pre-requisites
1. Build sidecar: `./python/build_sidecar.sh`
2. Build app: `pnpm tauri build`
3. Install the DMG on a clean test machine

### Steps

1. **First Launch**
   - Open app → Verify onboarding screen appears
   - Select 0.6B model → Click "Get Started"
   - Verify model download begins (progress bar)
   - Wait for model to load → Verify "Ready" status

2. **Custom Voice**
   - Type "Hello world, this is a voice test"
   - Select speaker "aiden"
   - Click Generate → Wait for audio
   - Play audio in output panel
   - Click Export → Save as WAV
   - Click Export → Save as MP3 (change format in Settings first)

3. **Voice Clone**
   - Switch to Voice Clone mode
   - Accept model switch prompt → Wait for 0.6B-Base to load
   - Import a reference WAV file (5-15 seconds of speech)
   - Enter reference transcript
   - Type target text → Generate → Verify output sounds like reference

4. **Voice Design**
   - Switch to Voice Design mode
   - Accept model switch prompt → Wait for 1.7B-Design to load
   - Enter: "A warm male voice with a slight British accent"
   - Type target text → Generate → Verify voice matches description

5. **Library Persistence**
   - Generate any audio → Click Save to Library
   - Open Library drawer → Verify item appears
   - Quit app completely → Reopen
   - Open Library → Verify item persists with playable audio

6. **Edge Cases**
   - Generate with empty text → Verify error message
   - Generate with wrong model loaded → Verify compatibility warning
   - Network disconnect during download → Verify error recovery
   - Very long text (2000 chars) → Verify generation completes

## Screenshots

After running `pnpm test:e2e`, visual validation screenshots are saved to `e2e/screenshots/`. Review manually for:
- Layout integrity at all resolutions
- No text truncation or overflow
- Proper panel sizing
- No overlapping UI elements

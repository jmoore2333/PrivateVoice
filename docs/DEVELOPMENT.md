# PrivateVoice Development Guide

Complete guide for testing, running, and releasing PrivateVoice (formerly Qwen3-TTS Desktop).

## Table of Contents

- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Building for Release](#building-for-release)
- [Release Checklist](#release-checklist)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-repo/Qwen3-TTS.git
cd Qwen3-TTS
pnpm install

# Run tests
pnpm test:run

# Start development
pnpm tauri dev
```

---

## Development Setup

### Prerequisites

| Tool | Version | Install Command |
|------|---------|-----------------|
| Node.js | 20+ | `brew install node` |
| pnpm | 8+ | `brew install pnpm` |
| Rust | Latest | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Python | 3.11+ | `brew install python@3.11` |
| Tauri CLI | 2.x | `cargo install tauri-cli` |
| sox | Latest | `brew install sox` |

### Install Dependencies

```bash
# Frontend dependencies
pnpm install

# Python environment (for development only - not needed for release builds)
cd python
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

---

## Running the Application

### Development Mode

**Option 1: Full Tauri Development (Recommended)**

```bash
pnpm tauri dev
```

This starts both the Vite dev server (hot reload) and the Tauri application with the Python sidecar.

**Option 2: Frontend Only**

```bash
pnpm dev
```

Runs just the Svelte frontend at `http://localhost:1420`. Useful for UI development when you don't need the TTS backend.

**Option 3: Manual Python Server**

For debugging the Python backend separately:

```bash
# Terminal 1: Start Python server
cd python
source .venv/bin/activate
python -m tts_server.main

# Terminal 2: Start frontend
pnpm dev

# Terminal 3 (optional): Start Tauri shell
pnpm tauri dev
```

### API Testing

Test the Python server directly:

```bash
# Health check
curl http://127.0.0.1:8765/health

# Load a model
curl -X POST http://127.0.0.1:8765/load-model \
  -H "Content-Type: application/json" \
  -d '{"model_id": "0.6b"}'

# Generate speech
curl -X POST http://127.0.0.1:8765/generate/custom-voice \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "speaker": "serena"}' \
  --output test.wav
```

---

## Testing

### Test Commands

| Command | Description |
|---------|-------------|
| `pnpm test` | Run unit tests in watch mode |
| `pnpm test:run` | Run unit tests once |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm test:e2e:ui` | Run E2E tests with Playwright UI |
| `pnpm test:e2e:headed` | Run E2E tests in headed browser |
| `pnpm test:all` | Run complete test suite (type check + unit + E2E) |
| `pnpm check` | TypeScript/Svelte type checking |

### Running the Full Test Suite

```bash
# Recommended: Run everything
pnpm test:all

# Or manually:
pnpm check          # Type checking
pnpm test:run       # Unit tests (28 tests)
pnpm test:e2e       # E2E tests (requires dev server)
```

### Test Structure

```
src/
├── lib/
│   ├── stores/
│   │   ├── appStore.test.ts
│   │   └── libraryStore.test.ts
│   ├── components/
│   │   ├── layout/Header.test.ts
│   │   ├── input/TextInput.test.ts
│   │   └── output/OutputPanel.test.ts
│   └── audio/
│       └── wavesurfer.test.ts
e2e/
└── example.spec.ts    # Playwright E2E tests
```

### Writing Tests

**Unit Tests (Vitest + Testing Library)**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MyComponent from './MyComponent.svelte';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(MyComponent, { props: { value: 'test' } });
    expect(screen.getByText('test')).toBeInTheDocument();
  });
});
```

**E2E Tests (Playwright)**

```typescript
import { test, expect } from '@playwright/test';

test('user can switch modes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Voice Clone' }).click();
  await expect(page.getByText('Reference Audio')).toBeVisible();
});
```

### Coverage Reports

```bash
# Generate coverage
pnpm test:coverage

# View HTML report
open coverage/index.html
```

Coverage output locations:
- `coverage/` - HTML report
- `coverage/lcov.info` - LCOV format for CI tools

---

## Building for Release

### Full Release Build

The easiest way to build a distributable app:

```bash
./scripts/build-release.sh
```

This script:
1. Builds the Python sidecar using PyInstaller (~243MB binary)
2. Installs frontend dependencies
3. Builds the Tauri application
4. Creates both `.app` bundle and `.dmg` installer

### Step-by-Step Build

If you need more control:

```bash
# Step 1: Build Python sidecar
./python/build_sidecar.sh

# Step 2: Verify sidecar exists
ls -la src-tauri/binaries/tts-server-*

# Step 3: Build Tauri app
pnpm tauri build
```

### Build Outputs

```
src-tauri/target/release/bundle/
├── macos/
│   └── Qwen3-TTS.app        # ~253MB app bundle
└── dmg/
    └── Qwen3-TTS_0.1.0_aarch64.dmg  # ~256MB installer
```

### Testing the Built App

```bash
# Open the app bundle directly
open src-tauri/target/release/bundle/macos/Qwen3-TTS.app

# Or mount and test the DMG
open src-tauri/target/release/bundle/dmg/Qwen3-TTS_*.dmg
```

---

## Release Checklist

### Pre-Release Verification

- [ ] All tests pass: `pnpm test:all`
- [ ] Type checking passes: `pnpm check`
- [ ] App builds successfully: `./scripts/build-release.sh`
- [ ] Test app launch from fresh DMG
- [ ] Verify all three TTS modes work
- [ ] Check first-run experience (onboarding)
- [ ] Test model download flow
- [ ] Verify settings persistence

### Version Bump

1. Update version in `package.json`
2. Update version in `src-tauri/tauri.conf.json`
3. Update version in `src-tauri/Cargo.toml`
4. Commit: `git commit -m "chore: bump version to X.Y.Z"`

### Build Release Artifacts

```bash
# Clean previous builds
rm -rf src-tauri/target/release/bundle

# Full release build
./scripts/build-release.sh

# Note the output paths
```

### Code Signing (macOS)

For distribution outside the App Store:

```bash
# Sign the app (requires Apple Developer certificate)
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAM_ID)" \
  src-tauri/target/release/bundle/macos/Qwen3-TTS.app

# Notarize the app
xcrun notarytool submit \
  src-tauri/target/release/bundle/dmg/Qwen3-TTS_*.dmg \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --password "app-specific-password" \
  --wait

# Staple the notarization
xcrun stapler staple src-tauri/target/release/bundle/macos/Qwen3-TTS.app
```

### Create GitHub Release

1. Tag the release: `git tag v0.1.0 && git push --tags`
2. Create release on GitHub
3. Upload DMG as release asset
4. Write release notes

---

## Troubleshooting

### Common Issues

**"Python server not starting"**

The Python sidecar takes ~60 seconds on first launch while PyInstaller extracts the bundled Python environment. Check the debug console (bottom-right button) for logs.

**"Model download stuck"**

Models are downloaded from HuggingFace Hub on first use:
- 0.6B model: ~1.2GB
- 1.7B model: ~3.4GB

Check your internet connection and disk space. Models are cached in `~/.cache/huggingface/`.

**"MPS device not available"**

Ensure you're on Apple Silicon (M1/M2/M3/M4) with macOS 12.3+. Intel Macs fall back to CPU inference.

**"Tests failing with module errors"**

```bash
# Clean and reinstall
rm -rf node_modules
pnpm install
```

**"E2E tests timing out"**

E2E tests require the dev server running. The Playwright config starts it automatically, but if you're running manually:

```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm test:e2e
```

**"Build fails on sidecar"**

```bash
# Ensure Python venv is set up
cd python
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install pyinstaller
cd ..

# Retry build
./python/build_sidecar.sh
```

### Debug Mode

Enable verbose logging:

1. Click the debug button (bottom-right corner)
2. View real-time sidecar logs
3. Filter by log level if needed

### Memory Issues

The app requires significant memory:
- 0.6B model: ~8GB RAM
- 1.7B model: ~12GB RAM
- Recommended: 16GB+ Mac

If you experience crashes, try the smaller 0.6B model.

---

## Continuous Integration

The project uses GitHub Actions for CI. On every push/PR to main:

1. **lint-and-typecheck**: Runs `pnpm check`
2. **unit-tests**: Runs `pnpm test:coverage`
3. **e2e-tests**: Runs `pnpm test:e2e` with Playwright
4. **build**: Verifies `pnpm build` succeeds

See `.github/workflows/ci.yml` for the full configuration.

### Pre-commit Hooks

Husky runs `svelte-check` on staged `.ts` and `.svelte` files before each commit:

```bash
# Skip hooks if needed (not recommended)
git commit --no-verify -m "message"
```

---

## Project Architecture

```
PrivateVoice
├── Frontend (Svelte 5 + Tailwind CSS 4)
│   ├── Stores (Svelte 5 runes: $state, $derived, $effect)
│   ├── Components (layout, input, output, library)
│   └── API Client (ttsClient.ts)
│
├── Desktop Shell (Tauri 2)
│   ├── Window management
│   ├── Sidecar process control
│   └── Native file access
│
└── TTS Backend (Python + FastAPI)
    ├── Qwen3-TTS inference
    ├── MPS optimization (Apple Silicon)
    └── HuggingFace model management
```

### Key Files

| File | Purpose |
|------|---------|
| `src/routes/+page.svelte` | Main application page |
| `src/lib/stores/ttsStore.svelte.ts` | TTS state management |
| `src/lib/api/ttsClient.ts` | HTTP client for Python backend |
| `python/tts_server/main.py` | FastAPI server |
| `python/tts_server/inference.py` | TTS model wrapper |
| `src-tauri/src/lib.rs` | Sidecar management |

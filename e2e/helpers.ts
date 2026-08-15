import type { Page, Route } from '@playwright/test';

/**
 * Shared Tauri + API mocks for the E2E suite.
 *
 * These used to live in production.spec.ts. They are here because a spec must
 * never import another spec: playwright.config.ts uses testDir './e2e' with the
 * default testMatch, so importing production.spec.ts would execute its
 * test.describe() blocks during collection of the importing file and attribute
 * its tests to the wrong place. helpers.ts does not match testMatch.
 */

export interface MockServerState {
  modelLoaded: boolean;
  modelId: string | null;
  device: string;
  whisperLoaded: boolean;
  translationLoaded: boolean;
  translationModelKey: string | null;
}

export const defaultMockState: MockServerState = {
  modelLoaded: true,
  modelId: '0.6b',
  device: 'mps',
  whisperLoaded: false,
  translationLoaded: false,
  translationModelKey: null,
};

/** Generate a minimal valid WAV file (44-byte header + short silence) */
export function makeWavBytes(): Uint8Array {
  const sampleRate = 24000;
  const numSamples = 2400; // 0.1 seconds (keep it small for tests)
  const dataSize = numSamples * 2; // 16-bit samples
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);
  // Silence (zeros) — ArrayBuffer is zero-initialized

  return bytes;
}

export async function setupMocks(page: Page, mockState: MockServerState = defaultMockState) {
  // Mock Tauri internals — include new env_manager commands
  await page.addInitScript(() => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        // Mock env_manager commands
        if (cmd === 'get_environment_status') {
          return {
            setup_complete: true,
            gpu_target: 'mps',
            gpu_display: 'Apple Silicon (MPS)',
            python_path: '/mock/venv/bin/python',
            venv_path: '/mock/venv',
            disk_usage_mb: 2500,
            uv_version: '0.6.6',
            uv_needs_update: false,
            state: 'ready',
            state_detail: null,
          };
        }
        if (cmd === 'repair_environment') {
          return 'Environment marked for repair. Restart the app to re-run setup.';
        }
        if (cmd === 'detect_gpu') {
          return JSON.stringify({ target: 'mps', display: 'Apple Silicon (MPS)' });
        }
        return Promise.resolve();
      },
      transformCallback: () => 0,
    };
  });

  // Mock all API endpoints
  await page.route('**/127.0.0.1:8765/**', async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    // --- Health & Status ---
    if (url.includes('/health')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: '1.0.0' }),
      });
    }

    if (url.includes('/startup-status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ phase: 'ready', message: 'Ready', progress: 100 }),
      });
    }

    if (url.includes('/model-status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          loaded: mockState.modelLoaded,
          model_id: mockState.modelId,
          device: mockState.device,
          memory: { device: mockState.device, total_gb: 16, available_gb: 8 },
        }),
      });
    }

    if (url.includes('/system-info')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          python_version: '3.11.0',
          torch_version: '2.5.0',
          device: mockState.device,
          device_name: 'Apple Silicon (MPS)',
          memory_total_gb: 16,
          memory_available_gb: 8,
          cache_dir: '~/.cache/huggingface',
        }),
      });
    }

    // --- Speakers ---
    if (url.includes('/speakers-info')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { name: 'aiden', description: 'Warm and friendly', native_language: 'English', personality: 'Conversational', gender: 'Male' },
          { name: 'serena', description: 'Clear and professional', native_language: 'English', personality: 'Professional', gender: 'Female' },
        ]),
      });
    }

    if (url.includes('/speakers')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          speakers: ['aiden', 'dylan', 'eric', 'ono_anna', 'ryan', 'serena', 'sohee', 'uncle_fu', 'vivian'],
        }),
      });
    }

    if (url.includes('/languages')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          languages: ['english', 'chinese', 'japanese', 'korean'],
        }),
      });
    }

    // --- Model Management ---
    if (url.includes('/load-model') && method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      mockState.modelId = body.model_id || '0.6b';
      mockState.modelLoaded = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'loaded', model_id: mockState.modelId }),
      });
    }

    if (url.includes('/unload-model') && method === 'POST') {
      mockState.modelLoaded = false;
      mockState.modelId = null;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unloaded' }),
      });
    }

    // --- Generation Endpoints (return mock WAV) ---
    if (url.includes('/generate/custom-voice') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: makeWavBytes() as any,
      });
    }

    if (url.includes('/generate/voice-clone') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: makeWavBytes() as any,
      });
    }

    if (url.includes('/generate/voice-design') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: makeWavBytes() as any,
      });
    }

    // --- Download Progress ---
    if (url.includes('/download-progress')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'idle',
          file_name: '',
          bytes_downloaded: 0,
          bytes_total: 0,
          speed_mbps: 0,
          eta: 0,
        }),
      });
    }

    // --- Whisper ---
    if (url.includes('/whisper-status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          loaded: mockState.whisperLoaded,
          model_size: mockState.whisperLoaded ? 'base' : null,
          device: 'cpu',
        }),
      });
    }

    if (url.includes('/whisper-models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { size: 'base', parameters: '74M', download_size_mb: 145 },
          { size: 'small', parameters: '244M', download_size_mb: 461 },
        ]),
      });
    }

    if (url.includes('/load-whisper') && method === 'POST') {
      mockState.whisperLoaded = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'loaded', model_size: 'base' }),
      });
    }

    if (url.includes('/unload-whisper') && method === 'POST') {
      mockState.whisperLoaded = false;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unloaded' }),
      });
    }

    // --- Local Translation ---
    if (url.includes('/translation-status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          loaded: mockState.translationLoaded,
          model_key: mockState.translationLoaded ? (mockState.translationModelKey ?? 'nllb-600m') : null,
          model_id: mockState.translationLoaded ? 'facebook/nllb-200-distilled-600M' : null,
          device: 'cpu',
        }),
      });
    }

    if (url.includes('/translation-models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key: 'nllb-600m',
            label: 'NLLB Distilled 600M',
            model_id: 'facebook/nllb-200-distilled-600M',
            parameters: '600M',
            download_size_mb: 1300,
          },
        ]),
      });
    }

    if (url.includes('/load-translation') && method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      mockState.translationLoaded = true;
      mockState.translationModelKey = body.model_key || 'nllb-600m';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'loaded', model_key: mockState.translationModelKey }),
      });
    }

    if (url.includes('/unload-translation') && method === 'POST') {
      mockState.translationLoaded = false;
      mockState.translationModelKey = null;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unloaded' }),
      });
    }

    if (url.includes('/translate-text') && method === 'POST') {
      if (!mockState.translationLoaded) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Translation model not loaded' }),
        });
      }

      const body = JSON.parse(route.request().postData() || '{}');
      const target = (body.target_language || 'english').toString().toLowerCase();
      const translated = target === 'spanish'
        ? 'hola mundo'
        : `${body.text ?? ''}`.toString();

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: translated,
          source_language: 'english',
          target_language: target,
        }),
      });
    }

    // --- Logs ---
    if (url.includes('/logs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    // Default
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

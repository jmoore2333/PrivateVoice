import { test, expect, Page } from '@playwright/test';

/**
 * E2E Tests for Voice Library Drawer
 *
 * Tests library UI: open/close drawer, tabs, search, empty states,
 * and item management. All tests mock the API (CI-compatible).
 */

// =============================================================================
// HELPERS (shared with example.spec.ts patterns)
// =============================================================================

async function setupTauriMocks(page: Page, { failFs = false }: { failFs?: boolean } = {}) {
  await page.addInitScript((opts) => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        // If failFs is true, reject any FS plugin calls so the library store
        // falls back to localStorage (where seeded test data lives).
        if (opts.failFs && cmd.startsWith('plugin:fs|')) {
          throw new Error('Mock: Tauri FS not available in test');
        }
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
        return undefined;
      },
      transformCallback: () => 0,
    };
  }, { failFs });
}

async function setupApiMocks(page: Page) {
  await page.route('**/127.0.0.1:8765/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/health')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: '1.0.0' }),
      });
    } else if (url.includes('/startup-status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ phase: 'ready', message: 'Ready', progress: 100 }),
      });
    } else if (url.includes('/model-status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          loaded: true,
          model_id: '0.6b',
          device: 'mps',
          memory: { device: 'mps', total_gb: 16, available_gb: 8 },
        }),
      });
    } else if (url.includes('/system-info')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          python_version: '3.11.0',
          torch_version: '2.0.0',
          device: 'mps',
          device_name: 'Apple Silicon (MPS)',
          memory_total_gb: 16,
          memory_available_gb: 8,
          cache_dir: '~/.cache/huggingface',
        }),
      });
    } else if (url.includes('/speakers-info')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { name: 'aiden', description: 'Warm and friendly', native_language: 'English', personality: 'Conversational', gender: 'Male' },
          { name: 'serena', description: 'Clear and professional', native_language: 'English', personality: 'Professional', gender: 'Female' },
        ]),
      });
    } else if (url.includes('/speakers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          speakers: ['aiden', 'dylan', 'eric', 'ono_anna', 'ryan', 'serena', 'sohee', 'uncle_fu', 'vivian'],
        }),
      });
    } else if (url.includes('/languages')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ languages: ['english', 'chinese', 'japanese', 'korean'] }),
      });
    } else if (url.includes('/download-progress')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'idle', file_name: '', bytes_downloaded: 0, bytes_total: 0, speed_mbps: 0, eta: 0 }),
      });
    } else if (url.includes('/load-model')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'loaded', model_id: '0.6b' }),
      });
    } else if (url.includes('/logs')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }
  });
}

async function setupBypassOnboarding(page: Page) {
  await page.addInitScript(() => {
    const settings = {
      theme: 'dark',
      defaultModel: '0.6b',
      defaultSpeaker: 'aiden',
      autoLoadModel: true,
      showWaveform: true,
      showDebugOnStartup: false,
      exportFolder: '~/Documents/PrivateVoice',
      exportFormat: 'wav',
      recentCacheSize: 10,
      enableWhisper: false,
      enableTranslation: false,
      hasCompletedOnboarding: true,
    };
    localStorage.setItem('privatevoice-settings', JSON.stringify(settings));
  });
}

/**
 * Seed the library with test items via localStorage.
 * Since Tauri FS isn't available in E2E browser context,
 * the store falls back to localStorage.
 */
async function seedLibrary(page: Page, items: Array<{
  id: string;
  type: 'audio' | 'clone' | 'design';
  name: string;
  createdAt: string;
  comment?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}>) {
  await page.addInitScript((serializedItems) => {
    localStorage.setItem('privatevoice-library', JSON.stringify({
      saved: serializedItems,
    }));
  }, items);
}

async function navigateAndWait(page: Page) {
  await page.goto('/');
  // Wait for app to be ready — use waitForSelector instead of toBeVisible
  // because the library drawer overlay (z-50) can cover the nav,
  // making it appear "hidden" to Playwright visibility checks.
  await page.waitForSelector('nav', { state: 'attached', timeout: 20000 });
  // Also wait for the app to settle (main content rendered)
  await page.waitForLoadState('networkidle');
}

async function openLibraryDrawer(page: Page) {
  // Library button is a floating button with title="Voice Library"
  const libraryButton = page.locator('button[title="Voice Library"]');
  await libraryButton.click();
  // Wait for drawer to appear
  await expect(page.getByRole('heading', { name: 'Voice Library' })).toBeVisible({ timeout: 5000 });
}

// =============================================================================
// LIBRARY DRAWER TESTS
// =============================================================================

test.describe('Voice Library Drawer', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriMocks(page);
    await setupApiMocks(page);
    await setupBypassOnboarding(page);
  });

  test('opens library drawer and shows heading', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await expect(page.getByRole('heading', { name: 'Voice Library' })).toBeVisible();
  });

  test('closes library drawer via close button', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    // Click the close button (X icon in drawer header)
    const closeButton = page.locator('[aria-label="Close drawer"]').last();
    await closeButton.click();

    await expect(page.getByRole('heading', { name: 'Voice Library' })).not.toBeVisible({ timeout: 5000 });
  });

  test('closes library drawer via backdrop click', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    // Click the backdrop overlay
    const backdrop = page.locator('[aria-label="Close drawer"]').first();
    await backdrop.click({ force: true });

    await expect(page.getByRole('heading', { name: 'Voice Library' })).not.toBeVisible({ timeout: 5000 });
  });

  test('shows three tabs: Recent, Saved Voices, Audio', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await expect(page.getByRole('button', { name: 'Recent' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Saved Voices/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Audio/ })).toBeVisible();
  });

  test('shows empty state for Recent tab', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await expect(page.getByText('No recent generations yet')).toBeVisible();
  });

  test('shows empty state for Saved Voices tab', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await page.getByRole('button', { name: /Saved Voices/ }).click();
    await expect(page.getByText('No saved voices yet')).toBeVisible();
  });

  test('shows empty state for Audio tab', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await page.getByRole('button', { name: /Audio/ }).click();
    await expect(page.getByText('No saved audio yet')).toBeVisible();
  });

  test('has search input', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    const searchInput = page.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible();
  });

  test('search with no results shows empty state', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill('nonexistent query');

    await expect(page.getByText('No items match your search')).toBeVisible();
  });
});

// =============================================================================
// LIBRARY WITH SEEDED DATA
// =============================================================================

test.describe('Voice Library with data', () => {
  const testItems = [
    {
      id: 'audio-1',
      type: 'audio' as const,
      name: 'Hello World Audio',
      createdAt: '2025-01-15T10:00:00.000Z',
      comment: 'Test audio generation',
      metadata: { speaker: 'aiden', modelId: '0.6b' },
    },
    {
      id: 'clone-1',
      type: 'clone' as const,
      name: 'My Cloned Voice',
      createdAt: '2025-01-14T09:00:00.000Z',
      tags: ['warm', 'male'],
      metadata: { referenceText: 'Hello test' },
    },
    {
      id: 'design-1',
      type: 'design' as const,
      name: 'Designed Narrator',
      createdAt: '2025-01-13T08:00:00.000Z',
      metadata: { voiceDescription: 'A warm narrator voice' },
    },
    {
      id: 'audio-2',
      type: 'audio' as const,
      name: 'Second Audio Clip',
      createdAt: '2025-01-12T07:00:00.000Z',
    },
  ];

  test.beforeEach(async ({ page }) => {
    // Use failFs: true so the library store falls back to localStorage,
    // where seeded test data lives (Tauri FS mock would bypass localStorage).
    await setupTauriMocks(page, { failFs: true });
    await setupApiMocks(page);
    await setupBypassOnboarding(page);
    await seedLibrary(page, testItems);
  });

  test('shows saved audio items in Audio tab', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await page.getByRole('button', { name: /Audio/ }).click();

    // Should show count in tab
    await expect(page.getByRole('button', { name: /Audio \(2\)/ })).toBeVisible();

    // Should show audio items
    await expect(page.getByText('Hello World Audio')).toBeVisible();
    await expect(page.getByText('Second Audio Clip')).toBeVisible();
  });

  test('shows saved voices in Voices tab', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await page.getByRole('button', { name: /Saved Voices/ }).click();

    // Clone and Design types appear under Voices
    await expect(page.getByRole('button', { name: /Saved Voices \(2\)/ })).toBeVisible();
    await expect(page.getByText('My Cloned Voice')).toBeVisible();
    await expect(page.getByText('Designed Narrator')).toBeVisible();
  });

  test('search filters items by name', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    // Switch to Audio tab first
    await page.getByRole('button', { name: /Audio/ }).click();
    await expect(page.getByText('Hello World Audio')).toBeVisible();

    // Search
    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill('Hello');

    await expect(page.getByText('Hello World Audio')).toBeVisible();
    await expect(page.getByText('Second Audio Clip')).not.toBeVisible();
  });

  test('search filters items by comment', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await page.getByRole('button', { name: /Audio/ }).click();

    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill('Test audio');

    await expect(page.getByText('Hello World Audio')).toBeVisible();
    await expect(page.getByText('Second Audio Clip')).not.toBeVisible();
  });

  test('tab switching preserves search query', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill('Voice');

    // Switch to Voices tab
    await page.getByRole('button', { name: /Saved Voices/ }).click();
    await expect(page.getByText('My Cloned Voice')).toBeVisible();

    // Search query should still be filled
    await expect(searchInput).toHaveValue('Voice');
  });

  test('clearing search shows all items again', async ({ page }) => {
    await navigateAndWait(page);
    await openLibraryDrawer(page);

    await page.getByRole('button', { name: /Audio/ }).click();

    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill('Hello');
    await expect(page.getByText('Second Audio Clip')).not.toBeVisible();

    await searchInput.clear();
    await expect(page.getByText('Hello World Audio')).toBeVisible();
    await expect(page.getByText('Second Audio Clip')).toBeVisible();
  });
});

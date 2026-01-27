import { test, expect, Page } from '@playwright/test';

/**
 * E2E Tests for PrivateVoice
 *
 * Test organization:
 * - CI tests: Mock the API, test frontend-only features
 * - Local tests: Use real server for full integration testing
 *
 * To run locally with server: pnpm test:e2e
 * To run CI-compatible only: CI=true pnpm test:e2e
 */

const isCI = !!process.env.CI;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Mock Tauri API for CI environment.
 * MUST be called before page.goto()
 */
async function setupTauriMocks(page: Page) {
  await page.addInitScript(() => {
    // Mock Tauri API
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        console.log('[Mock Tauri] invoke:', cmd);
        if (cmd === 'start_tts_server') {
          return Promise.resolve();
        }
        return Promise.resolve();
      },
      transformCallback: () => 0,
    };

    // Mock @tauri-apps/api/core
    (window as any).__TAURI__ = {
      invoke: async (cmd: string) => {
        console.log('[Mock Tauri] invoke:', cmd);
        if (cmd === 'start_tts_server') {
          return Promise.resolve();
        }
        return Promise.resolve();
      },
    };
  });
}

/**
 * Set up API mocking for CI environment.
 * MUST be called before page.goto()
 */
async function setupApiMocks(page: Page) {
  // Mock all API endpoints that the app polls during startup
  await page.route('**/127.0.0.1:8765/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/health')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: '0.1.0' }),
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
    } else if (url.includes('/speakers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          speakers: ['aiden', 'dylan', 'eric', 'ono_anna', 'ryan', 'serena', 'sohee', 'uncle_fu', 'vivian'],
        }),
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
      // Default: fulfill with empty success response
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }
  });
}

/**
 * Set up localStorage to bypass onboarding
 */
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
    localStorage.setItem('qwen3-tts-settings', JSON.stringify(settings));
  });
}

/**
 * Clear localStorage to simulate first launch
 */
async function setupFirstLaunch(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
  });
}

// =============================================================================
// ONBOARDING TESTS (CI-compatible)
// =============================================================================

test.describe('Onboarding Flow', () => {
  test('shows welcome screen on first launch', async ({ page }) => {
    await setupFirstLaunch(page);

    await page.goto('/');

    // Wait for welcome modal to appear
    const welcomeModal = page.locator('[class*="fixed inset-0"]').filter({ hasText: 'Welcome to PrivateVoice' });
    await expect(welcomeModal).toBeVisible({ timeout: 10000 });

    // Verify welcome content within the modal
    await expect(welcomeModal.getByText('Your voices, your machine, forever free.')).toBeVisible();

    // Verify model selection section
    await expect(welcomeModal.getByText('Choose Your First Model')).toBeVisible();
    await expect(welcomeModal.getByText('0.6B')).toBeVisible();

    // Verify Get Started button
    await expect(welcomeModal.getByRole('button', { name: 'Get Started' })).toBeVisible();
  });

  test('saves selected model to settings on completion', async ({ page }) => {
    await setupFirstLaunch(page);

    // In CI, mock the API so the app can proceed after onboarding
    if (isCI) {
      await setupApiMocks(page);
    }

    await page.goto('/');

    // Wait for welcome modal
    const welcomeModal = page.locator('[class*="fixed inset-0"]').filter({ hasText: 'Welcome to PrivateVoice' });
    await expect(welcomeModal).toBeVisible({ timeout: 10000 });

    // Select 1.7B model - find button within modal that contains both "1.7B" text and "Quality" description
    const model1_7bButton = welcomeModal.locator('button').filter({ hasText: '1.7B' }).filter({ hasText: 'Quality' });
    await model1_7bButton.click();

    // Click Get Started
    await welcomeModal.getByRole('button', { name: 'Get Started' }).click();

    // Wait for welcome modal to close
    await expect(welcomeModal).not.toBeVisible({ timeout: 10000 });

    // Verify localStorage was updated
    const settings = await page.evaluate(() => {
      const stored = localStorage.getItem('qwen3-tts-settings');
      return stored ? JSON.parse(stored) : null;
    });

    expect(settings).not.toBeNull();
    expect(settings.hasCompletedOnboarding).toBe(true);
    expect(settings.defaultModel).toBe('1.7b');
    expect(settings.autoLoadModel).toBe(true);
  });
});

// =============================================================================
// MAIN APP TESTS (CI uses mocked API)
// =============================================================================

test.describe('PrivateVoice Application', () => {
  test.beforeEach(async ({ page }) => {
    // Set up mocks BEFORE navigation
    if (isCI) {
      await setupTauriMocks(page);
      await setupApiMocks(page);
    }
    await setupBypassOnboarding(page);
  });

  test('loads main page and has correct title', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/privatevoice/i);
  });

  test('shows mode selector with all three modes', async ({ page }) => {
    await page.goto('/');

    // Wait for nav to be visible (means server ready or mocked)
    const nav = page.locator('nav');
    await expect(nav).toBeVisible({ timeout: 20000 });

    // Check mode buttons within nav
    await expect(nav.getByRole('button', { name: 'Custom Voice' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Voice Clone' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Voice Design' })).toBeVisible();
  });

  test('can switch between modes', async ({ page }) => {
    await page.goto('/');

    // Wait for nav
    const nav = page.locator('nav');
    await expect(nav).toBeVisible({ timeout: 20000 });

    // Click Voice Clone mode
    await nav.getByRole('button', { name: 'Voice Clone' }).click();

    // Verify Voice Clone panel appears
    await expect(page.getByText('Reference Audio')).toBeVisible({ timeout: 5000 });

    // Click Voice Design mode
    await nav.getByRole('button', { name: 'Voice Design' }).click();

    // Verify Voice Design panel appears
    await expect(page.getByText('Voice Description')).toBeVisible({ timeout: 5000 });

    // Click Custom Voice mode
    await nav.getByRole('button', { name: 'Custom Voice' }).click();

    // Verify Custom Voice panel appears (has Voice selector)
    await expect(page.getByText('Voice').first()).toBeVisible({ timeout: 5000 });
  });

  test('can open and close settings panel', async ({ page }) => {
    await page.goto('/');

    // Wait for nav
    const nav = page.locator('nav');
    await expect(nav).toBeVisible({ timeout: 20000 });

    // Find and click settings button (last button in header with svg)
    const header = page.locator('header');
    const settingsButton = header.locator('button').last();
    await settingsButton.click();

    // Verify settings panel opens
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Default Model', { exact: true })).toBeVisible();

    // Close settings by clicking the backdrop (the button with class fixed inset-0)
    const backdrop = page.locator('button.fixed.inset-0');
    await backdrop.click({ force: true });

    // Verify settings panel closes
    await expect(page.getByRole('heading', { name: 'Settings' })).not.toBeVisible({ timeout: 5000 });
  });

  test('can open and close debug console', async ({ page }) => {
    await page.goto('/');

    // Wait for nav
    const nav = page.locator('nav');
    await expect(nav).toBeVisible({ timeout: 20000 });

    // Click debug button
    const debugButton = page.locator('button[title="Toggle Debug Console"]');
    await debugButton.click();

    // Verify debug console opens
    await expect(page.getByText('Debug Console')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'System' })).toBeVisible();

    // Close debug console using the X button inside the console header
    const closeButton = page.locator('[aria-label="Close debug console"]');
    await closeButton.click();

    // Verify debug console closes
    await expect(page.getByText('Debug Console')).not.toBeVisible({ timeout: 5000 });
  });
});

// =============================================================================
// SERVER-DEPENDENT TESTS (Local only)
// =============================================================================

test.describe('TTS Generation (requires server)', () => {
  test.skip(isCI, 'Skipped in CI - requires real TTS server');

  test.beforeEach(async ({ page }) => {
    await setupBypassOnboarding(page);
  });

  test('can enter text and see generate button', async ({ page }) => {
    await page.goto('/');

    // Wait for app
    await expect(page.locator('nav')).toBeVisible({ timeout: 30000 });

    // Find text input
    const textInput = page.locator('textarea').first();
    await textInput.fill('Hello, this is a test.');

    // Generate button should be visible
    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible();
  });
});

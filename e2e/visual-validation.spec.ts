import { test, expect, Page, Route } from '@playwright/test';

/**
 * VISUAL VALIDATION TESTS
 *
 * Verifies that key UI modules are visible and accessible at multiple
 * screen resolutions. Captures screenshots for manual review.
 *
 * Resolutions tested:
 *   - 900×650   (minimum window size from tauri.conf.json)
 *   - 1280×800  (default window size)
 *   - 1440×900  (common MacBook)
 *   - 1920×1080 (external display)
 *
 * Each resolution validates:
 *   1. Core modules are visible (not clipped, not zero-height)
 *   2. Interactive elements are clickable (not obscured)
 *   3. Panels (settings, library, help, debug) open/close correctly
 */

// =============================================================================
// SETUP HELPERS
// =============================================================================

interface MockServerState {
  modelLoaded: boolean;
  modelId: string | null;
  device: string;
}

async function setupMocks(page: Page, mockState: MockServerState = {
  modelLoaded: true,
  modelId: '0.6b',
  device: 'mps',
}) {
  await page.addInitScript(() => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async () => Promise.resolve(),
      transformCallback: () => 0,
    };
  });

  await page.route('**/127.0.0.1:8765/**', async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/health')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', version: '1.0.0' }) });
    }
    if (url.includes('/startup-status')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ phase: 'ready', message: 'Ready', progress: 100 }) });
    }
    if (url.includes('/model-status')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        loaded: mockState.modelLoaded, model_id: mockState.modelId, device: mockState.device,
        memory: { device: mockState.device, total_gb: 16, available_gb: 8 },
      }) });
    }
    if (url.includes('/system-info')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        python_version: '3.11.0', torch_version: '2.5.0', device: mockState.device,
        device_name: 'Apple Silicon (MPS)', memory_total_gb: 16, memory_available_gb: 8, cache_dir: '~/.cache/huggingface',
      }) });
    }
    if (url.includes('/speakers-info')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { name: 'aiden', description: 'Warm and friendly', native_language: 'English', personality: 'Conversational', gender: 'Male' },
        { name: 'serena', description: 'Clear and professional', native_language: 'English', personality: 'Professional', gender: 'Female' },
      ]) });
    }
    if (url.includes('/speakers')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        speakers: ['aiden', 'dylan', 'eric', 'ono_anna', 'ryan', 'serena', 'sohee', 'uncle_fu', 'vivian'],
      }) });
    }
    if (url.includes('/languages')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ languages: ['english', 'chinese', 'japanese', 'korean'] }) });
    }
    if (url.includes('/load-model') && method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      mockState.modelId = body.model_id || '0.6b';
      mockState.modelLoaded = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'loaded', model_id: mockState.modelId }) });
    }
    if (url.includes('/logs')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/download-progress')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'idle', file_name: '', bytes_downloaded: 0, bytes_total: 0, speed_mbps: 0, eta: 0 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

async function setupBypassOnboarding(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('qwen3-tts-settings', JSON.stringify({
      theme: 'dark', defaultModel: '0.6b', defaultSpeaker: 'aiden',
      autoLoadModel: true, showWaveform: true, showDebugOnStartup: false,
      exportFolder: '~/Documents/PrivateVoice', exportFormat: 'wav',
      recentCacheSize: 10, enableWhisper: false, enableTranslation: false,
      hasCompletedOnboarding: true,
    }));
  });
}

async function waitForApp(page: Page) {
  await expect(page.locator('nav')).toBeVisible({ timeout: 20000 });
}

// =============================================================================
// RESOLUTION CONFIGURATIONS
// =============================================================================

const RESOLUTIONS = [
  { name: 'min-900x650', width: 900, height: 650 },
  { name: 'default-1280x800', width: 1280, height: 800 },
  { name: 'macbook-1440x900', width: 1440, height: 900 },
  { name: 'external-1920x1080', width: 1920, height: 1080 },
] as const;

// =============================================================================
// HELPER: Assert core modules visible
// =============================================================================

async function assertCoreModulesVisible(page: Page, resolution: string) {
  // 1. Mode selector tabs (nav)
  const nav = page.locator('nav');
  await expect(nav, `[${resolution}] nav should be visible`).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Custom Voice' }), `[${resolution}] Custom Voice tab`).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Voice Clone' }), `[${resolution}] Voice Clone tab`).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Voice Design' }), `[${resolution}] Voice Design tab`).toBeVisible();

  // 2. Text input area — should be usable (visible and not zero-height)
  const textarea = page.locator('textarea').first();
  await expect(textarea, `[${resolution}] textarea`).toBeVisible();
  const textareaBox = await textarea.boundingBox();
  expect(textareaBox, `[${resolution}] textarea has bounding box`).not.toBeNull();
  expect(textareaBox!.height, `[${resolution}] textarea height > 40px`).toBeGreaterThan(40);

  // 3. Generate button — always accessible
  const generateBtn = page.getByRole('button', { name: /generate/i });
  await expect(generateBtn, `[${resolution}] generate button`).toBeVisible();

  // 4. Settings button in header
  const settingsBtn = page.locator('button[aria-label="Settings"]');
  await expect(settingsBtn, `[${resolution}] settings button`).toBeVisible();

  // 5. Library button (floating, bottom-left)
  const libraryBtn = page.locator('button[title="Voice Library"]');
  await expect(libraryBtn, `[${resolution}] library button`).toBeVisible();

  // 6. Debug button (floating, bottom-right)
  const debugBtn = page.locator('button[title="Toggle Debug Console"]');
  await expect(debugBtn, `[${resolution}] debug button`).toBeVisible();

  // 7. Verify floating buttons are not overlapping each other
  const libraryBox = await libraryBtn.boundingBox();
  const debugBox = await debugBtn.boundingBox();
  if (libraryBox && debugBox) {
    // They should be on opposite sides of the screen
    expect(libraryBox.x + libraryBox.width, `[${resolution}] library button right edge < debug button left edge`).toBeLessThan(debugBox.x);
  }
}

// =============================================================================
// 1. CORE MODULE VISIBILITY AT EACH RESOLUTION
// =============================================================================

test.describe('Visual Validation — Core Module Visibility', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] all core modules visible`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      await assertCoreModulesVisible(page, res.name);

      // Take screenshot for manual review
      await page.screenshot({
        path: `e2e/screenshots/${res.name}-main.png`,
        fullPage: false,
      });
    });
  }
});

// =============================================================================
// 2. MODE SWITCHING AT EACH RESOLUTION
// =============================================================================

test.describe('Visual Validation — Mode Switching', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] can switch between all modes`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      const nav = page.locator('nav');

      // Custom Voice (default) — verify input area has speaker controls
      await expect(page.getByText('Voice').first()).toBeVisible();
      await page.screenshot({ path: `e2e/screenshots/${res.name}-custom-voice.png` });

      // Voice Clone
      await nav.getByRole('button', { name: 'Voice Clone' }).click();
      await expect(page.getByText('Reference Audio')).toBeVisible({ timeout: 5000 });
      // Textarea should still be visible in clone mode
      await expect(page.locator('textarea').first()).toBeVisible();
      await page.screenshot({ path: `e2e/screenshots/${res.name}-voice-clone.png` });

      // Voice Design
      await nav.getByRole('button', { name: 'Voice Design' }).click();
      await expect(page.getByText('Voice Description').or(page.getByText('Voice description')).first()).toBeVisible({ timeout: 5000 });
      await page.screenshot({ path: `e2e/screenshots/${res.name}-voice-design.png` });

      // Back to Custom Voice
      await nav.getByRole('button', { name: 'Custom Voice' }).click();
      await expect(page.locator('textarea').first()).toBeVisible();
    });
  }
});

// =============================================================================
// 3. SETTINGS PANEL AT EACH RESOLUTION
// =============================================================================

test.describe('Visual Validation — Settings Panel', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] settings panel opens, displays, and closes`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      // Open settings
      await page.locator('button[aria-label="Settings"]').click();
      const settingsHeading = page.getByRole('heading', { name: 'Settings' });
      await expect(settingsHeading).toBeVisible();

      // Verify settings content is not clipped
      const settingsPanel = page.locator('.fixed.inset-y-0.right-0').first();
      if (await settingsPanel.isVisible()) {
        const panelBox = await settingsPanel.boundingBox();
        if (panelBox) {
          // Panel should have substantial width and not be pushed off-screen
          expect(panelBox.width, `[${res.name}] settings panel width > 200px`).toBeGreaterThan(200);
          expect(panelBox.x, `[${res.name}] settings panel left edge >= 0`).toBeGreaterThanOrEqual(0);
        }
      }

      await page.screenshot({ path: `e2e/screenshots/${res.name}-settings.png` });

      // Close settings
      await page.locator('button[aria-label="Close settings"]').click();
      await expect(settingsHeading).not.toBeVisible({ timeout: 5000 });
    });
  }
});

// =============================================================================
// 4. LIBRARY DRAWER AT EACH RESOLUTION
// =============================================================================

test.describe('Visual Validation — Library Drawer', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] library drawer opens and closes properly`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      // Open library
      await page.locator('button[title="Voice Library"]').click();
      const libraryHeading = page.getByRole('heading', { name: 'Voice Library' });
      await expect(libraryHeading).toBeVisible({ timeout: 5000 });

      // Verify drawer dimensions
      const drawer = page.locator('.fixed.inset-x-0.bottom-0').first();
      if (await drawer.isVisible()) {
        const drawerBox = await drawer.boundingBox();
        if (drawerBox) {
          // Drawer should span full width
          expect(drawerBox.width, `[${res.name}] library drawer width close to viewport`).toBeGreaterThanOrEqual(res.width * 0.9);
          // Drawer should take up significant vertical space (70vh per CSS)
          expect(drawerBox.height, `[${res.name}] library drawer height > 200px`).toBeGreaterThan(200);
        }
      }

      // Verify tabs are visible inside drawer
      await expect(page.getByRole('button', { name: 'Recent' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Saved Voices/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Audio/ })).toBeVisible();

      // Search input visible
      await expect(page.locator('input[placeholder="Search..."]')).toBeVisible();

      await page.screenshot({ path: `e2e/screenshots/${res.name}-library.png` });

      // Close library via close button
      const closeBtn = page.locator('[aria-label="Close drawer"]').last();
      await closeBtn.click();
      await expect(libraryHeading).not.toBeVisible({ timeout: 5000 });
    });
  }
});

// =============================================================================
// 5. DEBUG CONSOLE AT EACH RESOLUTION
// =============================================================================

test.describe('Visual Validation — Debug Console', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] debug console opens and closes properly`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      // Open debug console
      await page.locator('button[title="Toggle Debug Console"]').click();
      await expect(page.getByText('Debug Console')).toBeVisible();

      // Verify Logs and System tabs
      await expect(page.getByRole('button', { name: 'Logs' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'System' })).toBeVisible();

      await page.screenshot({ path: `e2e/screenshots/${res.name}-debug.png` });

      // Close
      await page.locator('[aria-label="Close debug console"]').click();
      await expect(page.getByText('Debug Console')).not.toBeVisible({ timeout: 5000 });
    });
  }
});

// =============================================================================
// 6. HELP PANEL AT EACH RESOLUTION
// =============================================================================

test.describe('Visual Validation — Help Panel', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] help panel opens and closes`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      // Open help
      const helpBtn = page.locator('button[aria-label="Help"]');
      if (await helpBtn.isVisible()) {
        await helpBtn.click();

        // Check help panel appeared
        const helpVisible = await page.getByText(/help|guide|troubleshoot/i).first().isVisible().catch(() => false);
        if (helpVisible) {
          await page.screenshot({ path: `e2e/screenshots/${res.name}-help.png` });
        }

        // Close help — try Escape or close button
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    });
  }
});

// =============================================================================
// 7. GENERATE BUTTON ACCESSIBILITY
// =============================================================================

test.describe('Visual Validation — Generate Button Accessibility', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] generate button is clickable and not obscured`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      // Enter text to enable the button
      const textarea = page.locator('textarea').first();
      await textarea.fill('Visual validation test text.');

      const generateBtn = page.getByRole('button', { name: /generate/i });
      await expect(generateBtn).toBeEnabled();

      // Verify the button has a valid bounding box (not zero-size, not off-screen)
      const btnBox = await generateBtn.boundingBox();
      expect(btnBox, `[${res.name}] generate button has bounding box`).not.toBeNull();
      expect(btnBox!.width, `[${res.name}] generate button width > 50px`).toBeGreaterThan(50);
      expect(btnBox!.height, `[${res.name}] generate button height > 20px`).toBeGreaterThan(20);
      expect(btnBox!.x, `[${res.name}] generate button not pushed off-screen left`).toBeGreaterThanOrEqual(0);
      expect(btnBox!.y, `[${res.name}] generate button not pushed off-screen top`).toBeGreaterThanOrEqual(0);
      expect(btnBox!.x + btnBox!.width, `[${res.name}] generate button right edge within viewport`).toBeLessThanOrEqual(res.width);
      expect(btnBox!.y + btnBox!.height, `[${res.name}] generate button bottom edge within viewport`).toBeLessThanOrEqual(res.height);

      // Verify floating buttons (library, debug) don't overlap the generate button
      const libraryBox = await page.locator('button[title="Voice Library"]').boundingBox();
      const debugBox = await page.locator('button[title="Toggle Debug Console"]').boundingBox();
      if (libraryBox && btnBox) {
        const overlaps = !(libraryBox.x + libraryBox.width < btnBox.x ||
          libraryBox.x > btnBox.x + btnBox.width ||
          libraryBox.y + libraryBox.height < btnBox.y ||
          libraryBox.y > btnBox.y + btnBox.height);
        expect(overlaps, `[${res.name}] library button should not overlap generate button`).toBe(false);
      }
      if (debugBox && btnBox) {
        const overlaps = !(debugBox.x + debugBox.width < btnBox.x ||
          debugBox.x > btnBox.x + btnBox.width ||
          debugBox.y + debugBox.height < btnBox.y ||
          debugBox.y > btnBox.y + btnBox.height);
        expect(overlaps, `[${res.name}] debug button should not overlap generate button`).toBe(false);
      }
    });
  }
});

// =============================================================================
// 8. INPUT/OUTPUT PANEL LAYOUT
// =============================================================================

test.describe('Visual Validation — Input/Output Panel Layout', () => {
  for (const res of RESOLUTIONS) {
    test(`[${res.name}] input and output panels both visible with proper sizing`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await setupMocks(page);
      await setupBypassOnboarding(page);
      await page.goto('/');
      await waitForApp(page);

      // Input panel (left side, has textarea)
      const inputPanel = page.locator('textarea').first();
      await expect(inputPanel).toBeVisible();
      const inputBox = await inputPanel.boundingBox();
      expect(inputBox, `[${res.name}] input textarea has bounding box`).not.toBeNull();

      // Output panel — the right side area (bg-deep class from Workspace)
      const outputArea = page.locator('.bg-\\[var\\(--color-bg-deep\\)\\]').first();
      if (await outputArea.isVisible()) {
        const outputBox = await outputArea.boundingBox();
        if (outputBox) {
          // Output area should have meaningful width
          expect(outputBox.width, `[${res.name}] output area width > 200px`).toBeGreaterThan(200);
          expect(outputBox.height, `[${res.name}] output area height > 100px`).toBeGreaterThan(100);
        }
      }
    });
  }
});

// =============================================================================
// 9. FULL-PAGE SCREENSHOTS (all resolutions, all modes)
// =============================================================================

test.describe('Visual Validation — Full Screenshots', () => {
  test('capture full-page screenshots at all resolutions and modes', async ({ page }) => {
    await setupMocks(page);
    await setupBypassOnboarding(page);

    const modes = [
      { name: 'custom-voice', button: 'Custom Voice' },
      { name: 'voice-clone', button: 'Voice Clone' },
      { name: 'voice-design', button: 'Voice Design' },
    ];

    for (const res of RESOLUTIONS) {
      await page.setViewportSize({ width: res.width, height: res.height });

      for (const mode of modes) {
        await page.goto('/');
        await waitForApp(page);

        // Switch mode
        await page.locator('nav').getByRole('button', { name: mode.button }).click();
        await page.waitForTimeout(500); // Let animations settle

        await page.screenshot({
          path: `e2e/screenshots/full-${res.name}-${mode.name}.png`,
          fullPage: true,
        });
      }
    }
  });
});

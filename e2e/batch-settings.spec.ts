import { test, expect, Page } from '@playwright/test';
import { setupMocks, defaultMockState } from './helpers';

/**
 * Issue #13 regressions.
 *
 * The reporter ran a Voice Clone batch and could neither see nor change the
 * voice settings it would use, then read benign sidecar warnings as failures.
 */

/** Bypass onboarding with batch mode already enabled. */
async function setupWithBatchEnabled(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'privatevoice-settings',
      JSON.stringify({
        theme: 'dark',
        defaultModel: '0.6b',
        defaultSpeaker: 'aiden',
        autoLoadModel: true,
        showWaveform: true,
        showDebugOnStartup: false,
        exportFolder: '~/Documents/PrivateVoice',
        exportFormat: 'wav',
        wavSampleRate: null,
        wavBitDepth: 16,
        recentCacheSize: 10,
        enableWhisper: false,
        enableTranslation: false,
        enableBatchMode: true,
        hasCompletedOnboarding: true,
      })
    );
  });
}

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('nav')).toBeVisible({ timeout: 20000 });
}

async function toggleBatchMode(page: Page) {
  await page.getByRole('switch', { name: 'Toggle batch mode' }).click();
}

test.describe('Batch mode keeps voice settings reachable (issue #13)', () => {
  test('Voice Clone reference audio stays visible with batch mode on', async ({ page }) => {
    await setupMocks(page, { ...defaultMockState, modelId: '0.6b-base' });
    await setupWithBatchEnabled(page);
    await openApp(page);

    await page.locator('nav').getByRole('button', { name: 'Voice Clone' }).click();
    await expect(page.getByText(/reference audio/i).first()).toBeVisible();

    await toggleBatchMode(page);

    // The whole point of the fix: the panel is no longer swapped out, so the
    // reference audio a Voice Clone batch requires is still reachable.
    await expect(page.getByText(/reference audio/i).first()).toBeVisible();
    await expect(page.getByText('Batch Processing')).toBeVisible();
  });

  test('Custom Voice speaker picker stays visible with batch mode on', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await toggleBatchMode(page);

    await expect(page.getByRole('button', { name: 'Preset' })).toBeVisible();
    // Target the picker card specifically: the summary card also names the
    // selected speaker, so a bare getByText('Aiden') matches two elements.
    await expect(page.getByRole('button', { name: /Aiden/ })).toBeVisible();
  });

  test('the effective-configuration card names the model and format', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await toggleBatchMode(page);

    const summary = page.getByText('This batch will use').locator('..');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('0.6B Custom');
    await expect(summary).toContainText('WAV');
    await expect(summary).toContainText('Random');
  });

  test('the per-generation Generate button is hidden in batch mode', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
    await toggleBatchMode(page);

    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Process All' })).toBeVisible();
  });
});

test.describe('Batch file pre-flight (issue #13)', () => {
  test('a file over the character limit is rejected by name', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);
    await toggleBatchMode(page);

    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
      name: 'chapter-one.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('a'.repeat(2001)),
    });

    await expect(page.getByText(/chapter-one\.txt/)).toBeVisible();
    await expect(page.getByText(/2,000 character/i)).toBeVisible();
    await expect(page.getByText('No files queued.')).toBeVisible();
  });

  test('a file within the limit is queued', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);
    await toggleBatchMode(page);

    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
      name: 'fine.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This one is short enough.'),
    });

    await expect(page.getByText('No files queued.')).toHaveCount(0);
    await expect(page.getByText('fine.txt')).toBeVisible();
    // The queue row carries an editable output filename derived from the input.
    await expect(page.locator('input[type="text"]').first()).toHaveValue('fine.wav');
  });
});

test.describe('Help answers the reported questions (issue #13)', () => {
  test('capability section explains the absent sliders and cloned voices', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await page.getByRole('button', { name: /help/i }).first().click();
    await page.getByRole('button', { name: /What You Can Control/i }).click();

    await expect(page.getByText(/no numeric parameters for rate, pitch, emphasis/i)).toBeVisible();
    await expect(page.getByText(/Cloned voices cannot use Custom Voice controls/i)).toBeVisible();
  });

  test('batch section explains which settings a batch uses', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await page.getByRole('button', { name: /help/i }).first().click();
    await page.getByRole('button', { name: 'Batch Mode' }).click();

    await expect(
      page.getByText(/applies your current voice configuration to every queued file/i)
    ).toBeVisible();
    await expect(page.getByText(/informational, not failures/i)).toBeVisible();
  });
});

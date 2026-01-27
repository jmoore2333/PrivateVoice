import { test, expect } from '@playwright/test';

test.describe('PrivateVoice Application', () => {
  test('loads main page and has correct title', async ({ page }) => {
    await page.goto('/');

    // Title should contain either PrivateVoice or Qwen3-TTS (depending on configuration)
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/privatevoice|qwen3|tauri|sveltekit/i);
  });

  test('shows mode selector with all three modes', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('nav');

    // Check that all three mode buttons are present
    const customVoiceButton = page.getByRole('button', { name: 'Custom Voice' });
    const voiceCloneButton = page.getByRole('button', { name: 'Voice Clone' });
    const voiceDesignButton = page.getByRole('button', { name: 'Voice Design' });

    await expect(customVoiceButton).toBeVisible();
    await expect(voiceCloneButton).toBeVisible();
    await expect(voiceDesignButton).toBeVisible();
  });

  test('can switch between modes', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('nav');

    // Click Voice Clone mode
    await page.getByRole('button', { name: 'Voice Clone' }).click();

    // Verify Voice Clone specific content appears (reference audio section)
    // The VoiceClonePanel should show reference audio related content
    await expect(page.getByText(/reference/i)).toBeVisible({ timeout: 5000 });

    // Click Voice Design mode
    await page.getByRole('button', { name: 'Voice Design' }).click();

    // Verify Voice Design specific content appears (voice description section)
    // The VoiceDesignPanel should show voice design related content
    await expect(page.getByText(/voice description|describe.*voice|design/i)).toBeVisible({
      timeout: 5000,
    });

    // Click Custom Voice mode (back to default)
    await page.getByRole('button', { name: 'Custom Voice' }).click();

    // Verify Custom Voice specific content appears (speaker selection)
    // The CustomVoicePanel should show speaker related content
    await expect(page.getByText(/speaker|voice style/i)).toBeVisible({ timeout: 5000 });
  });
});

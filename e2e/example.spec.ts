import { test, expect, Page } from '@playwright/test';

// Helper to complete onboarding if shown
async function completeOnboardingIfShown(page: Page) {
  // Check if onboarding is visible
  const welcomeTitle = page.getByText('Welcome to PrivateVoice');
  const isOnboardingVisible = await welcomeTitle.isVisible({ timeout: 2000 }).catch(() => false);

  if (isOnboardingVisible) {
    // Select default model (0.6B is pre-selected) and click Get Started
    await page.getByRole('button', { name: 'Get Started' }).click();

    // Wait for onboarding to close
    await expect(welcomeTitle).not.toBeVisible({ timeout: 5000 });
  }
}

// Helper to bypass onboarding by setting localStorage directly
async function bypassOnboarding(page: Page) {
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

test.describe('Onboarding Flow', () => {
  test('shows welcome screen on first launch', async ({ page }) => {
    // Clear localStorage to simulate first launch
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/');

    // Verify welcome screen is shown
    await expect(page.getByText('Welcome to PrivateVoice')).toBeVisible();
    await expect(page.getByText('Your voices, your machine, forever free.')).toBeVisible();

    // Verify three modes are explained
    await expect(page.getByText('Custom Voice')).toBeVisible();
    await expect(page.getByText('Voice Clone')).toBeVisible();
    await expect(page.getByText('Voice Design')).toBeVisible();

    // Verify model selection is shown
    await expect(page.getByText('Choose Your First Model')).toBeVisible();
    await expect(page.getByText('0.6B')).toBeVisible();
    await expect(page.getByText('1.7B')).toBeVisible();
    await expect(page.getByText('1.7B Design')).toBeVisible();

    // Verify Get Started button
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
  });

  test('can select a model and complete onboarding', async ({ page }) => {
    // Clear localStorage
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/');

    // Wait for welcome screen
    await expect(page.getByText('Welcome to PrivateVoice')).toBeVisible();

    // Select 1.7B model
    const model1_7b = page.locator('button').filter({ hasText: '1.7B' }).filter({ hasText: 'Quality' });
    await model1_7b.click();

    // Click Get Started
    await page.getByRole('button', { name: 'Get Started' }).click();

    // Welcome screen should close
    await expect(page.getByText('Welcome to PrivateVoice')).not.toBeVisible({ timeout: 5000 });

    // Verify localStorage was updated with selected model
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

test.describe('PrivateVoice Application', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass onboarding for main app tests
    await bypassOnboarding(page);
  });

  test('loads main page and has correct title', async ({ page }) => {
    await page.goto('/');

    // Title should contain PrivateVoice
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/privatevoice/i);
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
    await expect(page.getByText(/reference/i)).toBeVisible({ timeout: 5000 });

    // Click Voice Design mode
    await page.getByRole('button', { name: 'Voice Design' }).click();

    // Verify Voice Design specific content appears (voice description section)
    await expect(page.getByText(/voice description|describe.*voice|design/i)).toBeVisible({
      timeout: 5000,
    });

    // Click Custom Voice mode (back to default)
    await page.getByRole('button', { name: 'Custom Voice' }).click();

    // Verify Custom Voice specific content appears (speaker selection)
    await expect(page.getByText(/speaker|voice style/i)).toBeVisible({ timeout: 5000 });
  });

  test('can open settings panel', async ({ page }) => {
    await page.goto('/');

    // Wait for nav to load
    await page.waitForSelector('nav');

    // Click settings button
    const settingsButton = page.getByRole('button', { name: /settings/i });
    await settingsButton.click();

    // Verify settings panel opens
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Verify Default Model setting is visible
    await expect(page.getByText('Default Model')).toBeVisible();
    await expect(page.getByText('Auto-load model')).toBeVisible();
  });

  test('can open debug console', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForSelector('nav');

    // Click debug button (code icon in bottom right)
    const debugButton = page.locator('button[title="Toggle Debug Console"]');
    await debugButton.click();

    // Verify debug console opens
    await expect(page.getByText('Debug Console')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'System' })).toBeVisible();
  });
});

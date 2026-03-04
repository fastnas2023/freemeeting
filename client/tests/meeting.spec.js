// client/tests/meeting.spec.js
import { test, expect } from '@playwright/test';

test.describe('FreeMeeting App E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load home page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/FreeMeeting/);
    await expect(page.getByText('FreeMeeting')).toBeVisible();
    await expect(page.getByText('Choose your preferred meeting technology')).toBeVisible();
  });

  test('should navigate to Instant Meeting (Jitsi)', async ({ page }) => {
    // Click on Instant Meeting card
    await page.getByText('Instant Meeting').click();
    
    // Verify Jitsi Meeting component is loaded
    await expect(page.getByText('Zero Config Meeting')).toBeVisible();
    await expect(page.getByText('Start New Meeting')).toBeVisible();
    
    // Verify "Back" button works
    await page.getByText('Exit').click();
    await expect(page.getByText('Choose your preferred meeting technology')).toBeVisible();
  });

  test('should navigate to Agora Cloud Meeting', async ({ page }) => {
    // Click on Agora Cloud card
    await page.getByText('Agora Cloud').click();
    
    // Check if we are on the Welcome screen (which means auto-redirect didn't happen or finished)
    const welcomeHeading = page.getByRole('heading', { name: 'Welcome Back' });
    
    // If we are on Welcome screen, we must click Settings to configure
    if (await welcomeHeading.isVisible()) {
        await page.getByRole('button', { name: 'Settings' }).click();
    }
    
    // Verify Agora Meeting component is loaded (Config screen)
    // We look for the specific input to ensure we are in config mode
    await expect(page.getByPlaceholder('Agora App ID')).toBeVisible();
    
    // Verify "Back" button works (Wait for it to be stable)
    await page.getByText('Exit').click();
    await expect(page.getByText('Choose your preferred meeting technology')).toBeVisible();
  });

  test('should navigate to Self-Hosted WebRTC Meeting', async ({ page }) => {
    // Click on Self-Hosted WebRTC card
    await page.getByText('Self-Hosted').click();
    
    // Verify WebRTC Meeting component is loaded
    await expect(page.getByText('Self-Hosted WebRTC Meeting')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. room-123')).toBeVisible();
    
    // Verify "Back" button works
    await page.getByText('Back to Home').click();
    await expect(page.getByText('Choose your preferred meeting technology')).toBeVisible();
  });
});

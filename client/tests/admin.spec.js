import { test, expect } from '@playwright/test';

test.describe('Admin Portal', () => {
  test('should load admin portal and fetch roles successfully', async ({ page }) => {
    // Go to home page
    await page.goto('/');

    // Click on Admin Portal button
    await page.getByRole('button', { name: 'Admin Portal' }).click();

    // Verify we are on the Role Management System page
    await expect(page.getByText('Role Management System')).toBeVisible();

    // Verify roles are loaded (check for "Admin", "Host", "Participant")
    // This confirms the /api/roles request was successful via proxy
    await expect(page.getByText('Admin', { exact: true })).toBeVisible();
    await expect(page.getByText('Host', { exact: true })).toBeVisible();
    await expect(page.getByText('Participant', { exact: true })).toBeVisible();

    // Verify "System Administrator with full access" description is visible in the list
    await expect(page.getByText('System Administrator with full access').first()).toBeVisible();

    // Test switching tabs
    await page.getByText('Audit Logs').click();
    await expect(page.getByText('Operation Audit Log')).toBeVisible();
  });
});

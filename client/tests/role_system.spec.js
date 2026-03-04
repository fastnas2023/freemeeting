import { test, expect } from '@playwright/test';

test.describe('Role Management System', () => {
  let adminPage;
  let participantPage;
  let adminContext;
  let participantContext;

  test.beforeEach(async ({ browser }) => {
    // Create two separate browser contexts for Admin and Participant
    adminContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    participantContext = await browser.newContext({ permissions: ['camera', 'microphone'] });

    adminPage = await adminContext.newPage();
    participantPage = await participantContext.newPage();

    // Add console listeners for debugging
    adminPage.on('console', msg => console.log('ADMIN CONSOLE:', msg.text()));
    participantPage.on('console', msg => console.log('PARTICIPANT CONSOLE:', msg.text()));
  });

  test.afterEach(async () => {
    await adminContext.close();
    await participantContext.close();
  });

  test('Admin can kick participant', async () => {
    const roomId = 'room-' + Date.now();

    // 1. Admin joins the meeting first
    console.log('Admin navigating to home...');
    await adminPage.goto('/', { timeout: 60000 });
    console.log('Admin clicking Self-Hosted...');
    await adminPage.getByText('Self-Hosted').click({ timeout: 30000 });
    console.log('Admin filling Room ID...');
    await adminPage.getByPlaceholder('Enter Room ID').fill(roomId);
    console.log('Admin clicking Continue...');
    await adminPage.getByRole('button', { name: 'Continue' }).click();
    console.log('Admin clicking Join Now...');
    await adminPage.getByRole('button', { name: 'Join Now' }).click({ timeout: 30000 });

    // Verify Admin Role (First user is Creator)
    console.log('Verifying Creator role...');
    await expect(adminPage.getByText('CREATOR', { exact: true })).toBeVisible({ timeout: 30000 });

    // 2. Participant joins the meeting
    console.log('Participant navigating to home...');
    await participantPage.goto('/', { timeout: 60000 });
    console.log('Participant clicking Self-Hosted...');
    await participantPage.getByText('Self-Hosted').click({ timeout: 30000 });
    console.log('Participant filling Room ID...');
    await participantPage.getByPlaceholder('Enter Room ID').fill(roomId);
    console.log('Participant clicking Continue...');
    await participantPage.getByRole('button', { name: 'Continue' }).click();
    console.log('Participant clicking Join Now...');
    await participantPage.getByRole('button', { name: 'Join Now' }).click({ timeout: 30000 });

    // Verify Participant joined
    await expect(participantPage.getByText('You')).toBeVisible();

    // 3. Admin sees Participant
    const participantCard = adminPage.locator('div.relative.bg-gray-900').filter({ hasText: /^User / }).first();
    await expect(participantCard).toBeVisible({ timeout: 15000 });

    // 4. Admin Kicks Participant
    await participantCard.hover();
    
    adminPage.on('dialog', dialog => dialog.accept());

    const kickButton = participantCard.locator('button[title="Kick User"]');
    await expect(kickButton).toBeVisible();
    await kickButton.click();

    // 5. Verify Participant is kicked (redirected to Home)
    await expect(participantPage.getByText('Self-Hosted')).toBeVisible({ timeout: 15000 });
  });

  test('Admin can mute participant audio', async () => {
    const roomId = 'room-' + Date.now() + '-mute';

    // 1. Admin joins first
    console.log('Admin navigating to home...');
    await adminPage.goto('/', { timeout: 60000 });
    console.log('Admin clicking Self-Hosted...');
    await adminPage.getByText('Self-Hosted').click({ timeout: 30000 });
    console.log('Admin filling Room ID...');
    await adminPage.getByPlaceholder('Enter Room ID').fill(roomId);
    console.log('Admin clicking Continue...');
    await adminPage.getByRole('button', { name: 'Continue' }).click();
    console.log('Admin clicking Join Now...');
    await adminPage.getByRole('button', { name: 'Join Now' }).click({ timeout: 30000 });

    console.log('Verifying Creator role...');
    await expect(adminPage.getByText('CREATOR', { exact: true })).toBeVisible({ timeout: 30000 });

    // 2. Participant joins
    console.log('Participant navigating to home...');
    await participantPage.goto('/', { timeout: 60000 });
    console.log('Participant clicking Self-Hosted...');
    await participantPage.getByText('Self-Hosted').click({ timeout: 30000 });
    console.log('Participant filling Room ID...');
    await participantPage.getByPlaceholder('Enter Room ID').fill(roomId);
    console.log('Participant clicking Continue...');
    await participantPage.getByRole('button', { name: 'Continue' }).click();
    console.log('Participant clicking Join Now...');
    await participantPage.getByRole('button', { name: 'Join Now' }).click({ timeout: 30000 });

    await expect(participantPage.getByText('You')).toBeVisible();

    // Ensure Participant Audio is ON initially
    await expect(participantPage.locator('button[title="Mute Microphone"]')).toBeVisible({ timeout: 10000 });

    // 3. Admin sees Participant
    const participantCard = adminPage.locator('div.relative.bg-gray-900').filter({ hasText: /^User / }).first();
    await expect(participantCard).toBeVisible({ timeout: 15000 });

    // 4. Admin Mutes Participant
    await participantCard.hover();
    const muteButton = participantCard.locator('button[title="Mute User Audio"]'); // Updated tooltip text from en.json
    await expect(muteButton).toBeVisible();
    await muteButton.click();

    // 5. Verify Participant is muted
    await expect(participantPage.locator('button[title="Unmute Microphone"]')).toBeVisible({ timeout: 15000 });
  });

  test('Creator role assignment, active room list, and transfer', async () => {
    const roomId = 'room-' + Date.now() + '-creator';

    // 1. User A (Creator) creates room
    console.log('Creator navigating to home...');
    await adminPage.goto('/', { timeout: 60000 });
    await adminPage.getByText('Self-Hosted').click({ timeout: 30000 });
    
    // Check if room list is visible (initially empty or not)
    await expect(adminPage.getByRole('heading', { name: 'Active Rooms' })).toBeVisible();

    await adminPage.getByPlaceholder('Enter Room ID').fill(roomId);
    await adminPage.getByRole('button', { name: 'Continue' }).click();
    await adminPage.getByRole('button', { name: 'Join Now' }).click({ timeout: 30000 });

    // Verify Creator Role
    console.log('Verifying Creator role...');
    await expect(adminPage.getByText('CREATOR', { exact: true })).toBeVisible({ timeout: 30000 });
    
    // Verify Close Room button exists for Creator
    await expect(adminPage.getByText('Close Room')).toBeVisible();

    // 2. User B (Participant) sees the room in list
    console.log('Participant checking active rooms...');
    await participantPage.goto('/', { timeout: 60000 });
    await participantPage.getByText('Self-Hosted').click({ timeout: 30000 });

    // Wait for room to appear in list (auto-refresh is 5s, initial fetch is immediate)
    await expect(participantPage.getByText(roomId)).toBeVisible({ timeout: 20000 });
    
    // Verify Creator Name is displayed (adminPage's username is likely default or not set, so 'Anonymous' or 'Unknown')
    // Since we didn't set username, it might be 'Anonymous'
    // Let's just check the Join button for that room
    const roomCard = participantPage.locator('div.bg-gray-800\\/50').filter({ hasText: roomId });
    await expect(roomCard).toBeVisible();
    
    // Click Join on the card
    const joinButton = roomCard.getByRole('button', { name: 'Join Now' });
    // Button is hidden until hover, but we can force click or hover first
    await roomCard.hover();
    await joinButton.click();

    // Setup page should appear
    await participantPage.getByRole('button', { name: 'Join Now' }).click({ timeout: 30000 });

    // Verify Participant joined
    await expect(participantPage.getByText('You', { exact: true })).toBeVisible({ timeout: 30000 });
    
    // Wait for connection to establish (video elements to appear)
    // There should be 2 videos: Local and Remote
    // But since we are using fake streams, it might take a moment
    // We can check for the remote user's ID or just wait a bit
    // Let's just proceed to disconnect test
    
    // 3. Creator leaves
    console.log('Creator leaving...');
    await adminPage.close(); // Simulates closing tab/disconnect

    // 4. Verify Ownership Transfer (User B becomes Creator)
    // This might take a moment for server to detect disconnect and emit events
    console.log('Verifying ownership transfer...');
    
    // Verify Toast appears
    // The toast message contains "User ... has left"
    // Since we don't know the exact ID of admin easily here (it's random), we can match regex
    await expect(participantPage.getByText(/User .* has left/)).toBeVisible({ timeout: 15000 });

    await expect(participantPage.getByText('CREATOR', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(participantPage.getByText('Close Room')).toBeVisible();
  });
});

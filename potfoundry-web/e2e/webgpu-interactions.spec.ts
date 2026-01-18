/**
 * WebGPU Camera Interaction E2E Tests
 * Tests camera controls (orbit, zoom, pan) work correctly.
 */
import { test, expect } from '@playwright/test';

test.describe('Camera Controls', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(2000);
    });

    test('should orbit camera on left-click drag', async ({ page }) => {
        const canvas = page.locator('canvas').first();
        const before = await canvas.screenshot();

        // Perform drag gesture (orbit)
        const box = await canvas.boundingBox();
        if (box) {
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            await page.mouse.move(centerX, centerY);
            await page.mouse.down();
            await page.mouse.move(centerX + 100, centerY, { steps: 10 });
            await page.mouse.up();

            await page.waitForTimeout(300);
        }

        const after = await canvas.screenshot();

        // View should have changed
        const bufferBefore = Buffer.from(before);
        const bufferAfter = Buffer.from(after);
        expect(bufferBefore.equals(bufferAfter)).toBe(false);
    });

    test('should zoom on mouse wheel', async ({ page }) => {
        const canvas = page.locator('canvas').first();
        const before = await canvas.screenshot();

        const box = await canvas.boundingBox();
        if (box) {
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            await page.mouse.move(centerX, centerY);
            await page.mouse.wheel(0, -300); // Zoom in
            await page.waitForTimeout(300);
        }

        const after = await canvas.screenshot();

        // View should have changed (zoomed)
        const bufferBefore = Buffer.from(before);
        const bufferAfter = Buffer.from(after);
        expect(bufferBefore.equals(bufferAfter)).toBe(false);
    });

    test('should pan on right-click drag', async ({ page }) => {
        const canvas = page.locator('canvas').first();
        const before = await canvas.screenshot();

        const box = await canvas.boundingBox();
        if (box) {
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            await page.mouse.move(centerX, centerY);
            await page.mouse.down({ button: 'right' });
            await page.mouse.move(centerX + 50, centerY + 50, { steps: 10 });
            await page.mouse.up({ button: 'right' });

            await page.waitForTimeout(300);
        }

        const after = await canvas.screenshot();

        // View should have panned
        const bufferBefore = Buffer.from(before);
        const bufferAfter = Buffer.from(after);
        expect(bufferBefore.equals(bufferAfter)).toBe(false);
    });
});

test.describe('Sidebar Toggle', () => {
    test('should toggle sidebar visibility', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.pf-sidebar')).toBeVisible({ timeout: 10000 });

        // Find and click the close button
        const closeBtn = page.locator('.pf-sidebar__header button[aria-label="Close panel"]');
        if (await closeBtn.isVisible()) {
            await closeBtn.click();

            // Sidebar should be hidden
            await expect(page.locator('.pf-sidebar')).not.toBeVisible({ timeout: 5000 });
        }
    });
});

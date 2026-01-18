/**
 * WebGPU Rendering E2E Tests
 * Tests that style and geometry changes are reflected in the render.
 */
import { test, expect } from '@playwright/test';

test.describe('Style Changes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for app load
        await expect(page.locator('.pf-sidebar')).toBeVisible({ timeout: 10000 });

        // Wait for WebGPU ready
        await expect(page.locator('.pf-wgpu-preview')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
        await page.waitForTimeout(1000); // Buffer for frame
    });

    test('should change tabs between Design and Library', async ({ page }) => {
        // Click Library tab
        const libraryTab = page.locator('.pf-sidebar__tab:has-text("Library")');
        await libraryTab.click();
        await expect(libraryTab).toHaveAttribute('aria-selected', 'true');

        // Click Design tab
        const designTab = page.locator('.pf-sidebar__tab:has-text("Design")');
        await designTab.click();
        await expect(designTab).toHaveAttribute('aria-selected', 'true');
    });
});

test.describe('Geometry Changes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.pf-sidebar')).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(2000);
    });

    test('should update render when slider changes', async ({ page }) => {
        const canvas = page.locator('canvas').first();
        const before = await canvas.screenshot();

        // Find a slider number input (wrapper class pf-slider contains an input of type number)
        const numberInput = page.locator('.pf-sidebar .pf-slider input[type="number"]').first();

        if (await numberInput.isVisible()) {
            // Get current value and change it significantly
            const currentValue = await numberInput.evaluate(el => (el as HTMLInputElement).value);
            const newValue = parseInt(currentValue) > 50 ? '30' : '70';

            await numberInput.fill(newValue);
            await numberInput.blur(); // Trigger change
            await page.waitForTimeout(1000); // Allow re-render

            const after = await canvas.screenshot();

            // Buffer comparison
            const bufferBefore = Buffer.from(before);
            const bufferAfter = Buffer.from(after);
            expect(bufferBefore.equals(bufferAfter)).toBe(false);
        }
    });
});

test.describe('Visual Regression', () => {
    test('default view matches snapshot', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(3000); // Wait for full render

        // Take full page screenshot for visual comparison
        await expect(page).toHaveScreenshot('default-view.png', {
            maxDiffPixelRatio: 0.1, // Allow 10% difference for GPU variations
            fullPage: true,
        });
    });
});

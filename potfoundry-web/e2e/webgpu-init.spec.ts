/**
 * WebGPU Initialization E2E Tests
 * Tests that the WebGPU renderer initializes correctly in a real browser.
 */
import { test, expect } from '@playwright/test';

test.describe('WebGPU Initialization', () => {
    test('should load the application', async ({ page }) => {
        await page.goto('/');

        // App should load - check for main container
        await expect(page.locator('.pf-app-ui')).toBeVisible({ timeout: 10000 });
    });

    test('should render the main canvas', async ({ page }) => {
        await page.goto('/');

        // Wait for canvas to be visible
        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Canvas should have dimensions
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(100);
        expect(box!.height).toBeGreaterThan(100);
    });

    test('should show the sidebar with controls', async ({ page }) => {
        await page.goto('/');

        // Sidebar should be visible
        const sidebar = page.locator('.pf-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 10000 });

        // Should have Design tab active by default
        const designTab = page.locator('.pf-sidebar__tab:has-text("Design")');
        await expect(designTab).toHaveAttribute('aria-selected', 'true');
    });

    test('should have sliders in Design tab', async ({ page }) => {
        await page.goto('/');

        // Wait for sidebar
        await expect(page.locator('.pf-sidebar')).toBeVisible({ timeout: 10000 });

        // Should have at least one Radix UI slider thumb or number input
        const sliders = page.locator('.pf-sidebar [role="slider"]');
        const count = await sliders.count();
        expect(count).toBeGreaterThan(0);
    });

    test('should have renderer selector', async ({ page }) => {
        await page.goto('/');

        // Renderer selector in header
        const rendererSelect = page.locator('.pf-sidebar__renderer-header-select');
        await expect(rendererSelect).toBeVisible({ timeout: 10000 });

        // Should have auto, GPU, GL options
        const options = await rendererSelect.locator('option').allTextContents();
        expect(options).toContain('Auto');
        expect(options).toContain('GPU');
        expect(options).toContain('GL');
    });
});

test.describe('Canvas Rendering', () => {
    test('canvas should not be empty', async ({ page }) => {
        // Setup console listener
        let webgpuReady = false;
        page.on('console', msg => {
            if (msg.text().includes('WebGPU initialized successfully') || msg.text().includes('WebGPU • ready')) {
                webgpuReady = true;
            }
        });

        await page.goto('/');

        // Wait for canvas
        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Wait for WebGPU initialization (via data-ready attribute)
        await expect(page.locator('.pf-wgpu-preview')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });

        // Take screenshot and verify it's not trivial (with retries)
        let screenshot: Buffer;
        let attempts = 0;
        while (attempts < 5) {
            await page.waitForTimeout(1000); // 1s wait between attempts
            screenshot = await canvas.screenshot();
            if (screenshot.byteLength > 5000) {
                break;
            }
            console.log(`Screenshot too small (${screenshot.byteLength} bytes), retrying...`);
            attempts++;
        }

        expect(screenshot!.byteLength).toBeGreaterThan(5000);
    });
});

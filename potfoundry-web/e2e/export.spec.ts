/**
 * Export E2E Tests
 * Tests the STL export functionality, including UI controls and file download.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Mesh Export', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');

        // Wait for WebGPU initialization/app ready
        // This ensures the state is settled before we try to interact
        await expect(page.locator('.pf-wgpu-preview')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });

        // Ensure sidebar is visible
        await expect(page.locator('.pf-sidebar')).toBeVisible();
    });

    test('should show export panel with GPU toggle', async ({ page }) => {
        // Open Export section if not already open
        const exportSection = page.getByText('Export', { exact: true });
        await expect(exportSection).toBeVisible();

        // The export panel should be visible
        await expect(page.locator('.export-panel')).toBeVisible();

        // Open Advanced Options
        const advancedToggle = page.getByRole('button', { name: /Advanced Options/i });
        await advancedToggle.click();

        // Wait for panel to expand
        const advancedPanel = page.locator('.export-panel__advanced');
        await expect(advancedPanel).toBeVisible();

        // Check for GPU toggle (use regex to match "Use GPU Acceleration" even if "Unavailable" is present)
        const gpuToggle = page.getByLabel(/Use GPU Acceleration/);
        await expect(gpuToggle).toBeVisible();

        // Check if it's interactable
        // Note: It might be disabled if running in CI without GPU, but the element should be there
        const isEnabled = await gpuToggle.isEnabled();
        // We log it for debugging but don't fail the test if it's disabled in CI
        console.log(`GPU Toggle Enabled: ${isEnabled}`);
    });

    test('should download STL file', async ({ page }) => {
        // Click Download STL button
        const downloadPromise = page.waitForEvent('download');

        // Find the download button
        const downloadBtn = page.getByRole('button', { name: /Download STL/i });

        // Ensure button is enabled
        await expect(downloadBtn).toBeEnabled({ timeout: 5000 });
        await downloadBtn.click();

        const download = await downloadPromise;
        const filename = download.suggestedFilename();
        expect(filename).toContain('.stl');
        console.log(`Downloaded: ${filename}`);

        // Verify file size > 0
        const path = await download.path();
        const stats = await fs.promises.stat(path);

        expect(stats.size).toBeGreaterThan(0);
        console.log(`File size: ${stats.size} bytes`);
    });

    test('should show mesh stats', async ({ page }) => {
        // Click Preview Stats button
        const previewBtn = page.getByRole('button', { name: /Preview Stats/i });
        await expect(previewBtn).toBeVisible();
        await previewBtn.click();

        // Wait for stats to appear
        const statsPanel = page.locator('.export-panel__stats');
        await expect(statsPanel).toBeVisible({ timeout: 10000 });

        // Check for generic stats
        await expect(page.getByText('Triangles')).toBeVisible();
        await expect(page.getByText('Vertices')).toBeVisible();

        // Check valid numbers
        // We expect some non-zero number text below Triangles
        const trianglesValue = page.locator('.export-panel__stat-value').first();
        const valueText = await trianglesValue.innerText();
        expect(valueText).not.toBe('0');
        expect(valueText.length).toBeGreaterThan(0);
    });
});

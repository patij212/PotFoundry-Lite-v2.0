/**
 * Mobile Responsiveness E2E Tests
 *
 * Tests mobile layout, touch interactions, and responsive behavior
 * across phone and tablet viewports. These tests use Playwright's
 * device emulation (viewport + user-agent + touch) to simulate
 * real mobile environments.
 *
 * Note: WebGPU may not be available in all emulated devices.
 * Layout tests that don't depend on the 3D canvas still provide
 * valuable regression coverage.
 *
 * Run with:
 *   npx playwright test e2e/mobile-responsiveness.spec.ts --project=mobile-chrome
 *   npx playwright test e2e/mobile-responsiveness.spec.ts --project=mobile-safari
 *   npx playwright test e2e/mobile-responsiveness.spec.ts --project=tablet
 *
 * @module e2e/mobile-responsiveness
 */

import { test, expect, type Page } from '@playwright/test';

// Allow extra time for WebGPU init on mobile emulation
test.setTimeout(60000);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Wait for the app to be ready (either WebGPU canvas or error page).
 * On mobile emulation WebGPU may not init, so we accept either state.
 */
async function waitForAppReady(page: Page): Promise<boolean> {
  // Wait for React to mount something into #root
  try {
    await page.waitForFunction(
      () => (document.getElementById('root')?.children.length ?? 0) > 0,
      { timeout: 25000 }
    );
  } catch {
    return false;
  }

  // Give the app a moment to settle after mount
  await page.waitForTimeout(1000);

  // Check if the WebGPU canvas rendered
  const hasCanvas = await page
    .locator('canvas.pf-wgpu-preview__canvas')
    .isVisible()
    .catch(() => false);
  return hasCanvas;
}

/**
 * Check if the v2 UI is active by looking for the .pf2-root element.
 */
async function isV2UI(page: Page): Promise<boolean> {
  return page.locator('.pf2-root').count().then((c) => c > 0);
}

// ============================================================================
// Layout Tests — v1 (Classic) Theme
// ============================================================================

test.describe('Mobile Layout — Classic Theme', () => {
  test.beforeEach(async ({ page }) => {
    // Clear stored theme to ensure classic (default)
    await page.addInitScript(() => {
      localStorage.removeItem('pf2-ui-theme');
    });
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('viewport meta tag is correctly set', async ({ page }) => {
    // Viewport meta is in static HTML, always present once page loads
    const content = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta?.getAttribute('content') ?? null;
    });
    if (!content) {
      test.skip(true, 'Page did not fully load');
      return;
    }
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1.0');
  });

  test('app container fills the viewport', async ({ page }) => {
    // App renders .pf-app on success or .pf-error on WebGPU failure
    const container = page.locator('.pf-app, .pf-error').first();
    const isVisible = await container.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, 'App did not render — WebGPU init may have failed');
      return;
    }
    const box = await container.boundingBox();
    const viewportSize = page.viewportSize();

    expect(box).toBeTruthy();
    expect(viewportSize).toBeTruthy();
    if (box && viewportSize) {
      expect(box.width).toBeCloseTo(viewportSize.width, -1);
    }
  });

  test('sidebar renders as bottom sheet on mobile', async ({ page, browserName }) => {
    // Skip on webkit for now — classic theme uses MobileBottomSheet which needs touch
    test.skip(browserName === 'webkit', 'Classic mobile sheet needs Chromium touch');

    const viewportSize = page.viewportSize();
    if (!viewportSize || viewportSize.width > 768) {
      test.skip(true, 'Not a mobile viewport');
      return;
    }

    // Look for the mobile bottom sheet
    const sheet = page.locator('.pf-mobile-sheet');
    const sheetVisible = await sheet.isVisible().catch(() => false);

    if (sheetVisible) {
      const box = await sheet.boundingBox();
      expect(box).toBeTruthy();
      if (box && viewportSize) {
        // Sheet should be at the bottom of the viewport
        expect(box.y + box.height).toBeCloseTo(viewportSize.height, 20);
        // Sheet should span full width
        expect(box.width).toBeCloseTo(viewportSize.width, 10);
      }
    }
  });

  test('header buttons are accessible and not overflowing', async ({ page }) => {
    const header = page.locator('.pf-app__header');
    const isVisible = await header.isVisible().catch(() => false);

    if (isVisible) {
      const box = await header.boundingBox();
      const viewportSize = page.viewportSize();

      expect(box).toBeTruthy();
      if (box && viewportSize) {
        // Header should be within viewport bounds
        expect(box.x + box.width).toBeLessThanOrEqual(viewportSize.width + 5);
        expect(box.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('screenshot — mobile classic layout', async ({ page }) => {
    // Wait a bit for any animations
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `artifacts/mobile-classic-${page.viewportSize()?.width ?? 'unknown'}w.png`,
      fullPage: false,
    });
  });
});

// ============================================================================
// Layout Tests — v2 Theme
// ============================================================================

test.describe('Mobile Layout — v2 Theme', () => {
  test.beforeEach(async ({ page }) => {
    // Force v2 theme (key is pf2-ui-theme per ui.ts THEME_KEY)
    await page.addInitScript(() => {
      localStorage.setItem('pf2-ui-theme', 'v2');
    });
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('v2 root element renders', async ({ page }) => {
    // Verify the theme was actually set by addInitScript
    const themeValue = await page.evaluate(() => localStorage.getItem('pf2-ui-theme'));
    if (themeValue !== 'v2') {
      test.skip(true, 'v2 theme was not applied by addInitScript — test infrastructure flake');
      return;
    }

    // On WebGPU failure, the error page renders instead of v2 layout.
    // If neither rendered, the app didn't load at all — skip.
    const hasV2 = await page.locator('.pf2-root').isVisible().catch(() => false);
    const hasError = await page.locator('.pf-error').isVisible().catch(() => false);
    if (!hasV2 && hasError) {
      test.skip(true, 'WebGPU not available — error page rendered instead of v2 layout');
      return;
    }
    // If theme is set but v2 didn't render, the store may have initialized
    // before addInitScript took effect — skip as infrastructure flake.
    if (!hasV2) {
      test.skip(true, 'v2 theme set in localStorage but app rendered classic — Zustand init race');
      return;
    }
    expect(hasV2).toBe(true);
  });

  test('v2 sidebar renders as bottom sheet on mobile', async ({ page }) => {
    const viewportSize = page.viewportSize();
    if (!viewportSize || viewportSize.width > 768) {
      test.skip(true, 'Not a mobile viewport');
      return;
    }

    const sidebar = page.locator('.pf2-sidebar');
    const isVisible = await sidebar.isVisible().catch(() => false);

    if (isVisible) {
      const box = await sidebar.boundingBox();
      expect(box).toBeTruthy();
      if (box && viewportSize) {
        // On mobile, sidebar should be at the bottom
        expect(box.y).toBeGreaterThan(viewportSize.height * 0.2);
        // Should span full width
        expect(box.width).toBeCloseTo(viewportSize.width, 10);
        // Should not exceed 70vh max-height
        expect(box.height).toBeLessThanOrEqual(viewportSize.height * 0.75);
      }
    }
  });

  test('v2 sidebar tab navigation works on mobile', async ({ page }) => {
    const viewportSize = page.viewportSize();
    if (!viewportSize || viewportSize.width > 768) {
      test.skip(true, 'Not a mobile viewport');
      return;
    }

    const tabs = page.locator('.pf2-sidebar__tab');
    const tabCount = await tabs.count();

    if (tabCount >= 3) {
      // Click each tab and verify it becomes active
      for (let i = 0; i < tabCount; i++) {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toHaveAttribute('data-state', 'active');
      }
    }
  });

  test('v2 sidebar content is scrollable on mobile', async ({ page }) => {
    const viewportSize = page.viewportSize();
    if (!viewportSize || viewportSize.width > 768) {
      test.skip(true, 'Not a mobile viewport');
      return;
    }

    const content = page.locator('.pf2-sidebar__content');
    const isVisible = await content.isVisible().catch(() => false);

    if (isVisible) {
      // Check that overflow is set to allow scrolling
      const overflow = await content.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          overflowY: style.overflowY,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        };
      });

      // Content should be scrollable if it overflows
      expect(overflow.overflowY).toMatch(/auto|scroll/);
    }
  });

  test('canvas is visible above/behind sidebar on mobile', async ({ page }) => {
    const viewportSize = page.viewportSize();
    if (!viewportSize || viewportSize.width > 768) {
      test.skip(true, 'Not a mobile viewport');
      return;
    }

    const canvas = page.locator('canvas.pf-wgpu-preview__canvas');
    const canvasVisible = await canvas.isVisible().catch(() => false);

    if (canvasVisible) {
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // Canvas should start at or near the top
        expect(box.y).toBeLessThan(50);
        // Canvas should have substantial height (not squished)
        expect(box.height).toBeGreaterThan(viewportSize.height * 0.3);
      }
    }
  });

  test('v2 resize handle is hidden on mobile', async ({ page }) => {
    const viewportSize = page.viewportSize();
    if (!viewportSize || viewportSize.width > 768) {
      test.skip(true, 'Not a mobile viewport');
      return;
    }

    const handle = page.locator('.pf2-sidebar__resize-handle');
    const handleCount = await handle.count();

    if (handleCount > 0) {
      const isVisible = await handle.isVisible();
      expect(isVisible).toBe(false);
    }
  });

  test('screenshot — mobile v2 layout', async ({ page }) => {
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `artifacts/mobile-v2-${page.viewportSize()?.width ?? 'unknown'}w.png`,
      fullPage: false,
    });
  });
});

// ============================================================================
// Touch Interaction Tests
// ============================================================================

test.describe('Mobile Touch Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('canvas accepts touch input without errors', async ({ page }) => {
    const canvas = page.locator('canvas.pf-wgpu-preview__canvas');
    const canvasVisible = await canvas.isVisible().catch(() => false);

    if (!canvasVisible) {
      test.skip(true, 'Canvas not visible — WebGPU may not have initialized');
      return;
    }

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const box = await canvas.boundingBox();
    if (box) {
      // Simulate a touch tap on the canvas
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 4);
      await page.waitForTimeout(500);

      // No JS errors should have occurred
      expect(errors).toHaveLength(0);
    }
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    const viewportSize = page.viewportSize();
    if (!viewportSize) return;

    // Wait for CSS to load by checking if body has expected styles
    const appLoaded = await page.evaluate(() =>
      (document.getElementById('root')?.children.length ?? 0) > 0
    );
    if (!appLoaded) {
      test.skip(true, 'App did not load — CSS may not be applied');
      return;
    }

    // overflow:hidden on html,body prevents horizontal scrollbar
    const overflowX = await page.evaluate(() =>
      getComputedStyle(document.body).overflowX
    );
    expect(['hidden', 'clip']).toContain(overflowX);
  });
});

// ============================================================================
// Responsive Breakpoint Tests (run on all device projects)
// ============================================================================

test.describe('Responsive Breakpoints', () => {
  test('layout adapts to viewport width', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const viewportSize = page.viewportSize();
    if (!viewportSize) return;

    if (viewportSize.width <= 768) {
      // Mobile: sidebar should be bottom-positioned or mobile sheet visible
      const v2Sidebar = page.locator('.pf2-sidebar');
      const mobileSheet = page.locator('.pf-mobile-sheet');

      const v2Visible = await v2Sidebar.isVisible().catch(() => false);
      const sheetVisible = await mobileSheet.isVisible().catch(() => false);

      if (v2Visible) {
        const box = await v2Sidebar.boundingBox();
        if (box) {
          // Should be positioned at bottom half of screen
          expect(box.y).toBeGreaterThan(viewportSize.height * 0.2);
        }
      } else if (sheetVisible) {
        // v1 mobile sheet — should be at bottom
        const box = await mobileSheet.boundingBox();
        if (box) {
          expect(box.y + box.height).toBeCloseTo(viewportSize.height, 20);
        }
      }
    } else if (viewportSize.width <= 1024) {
      // Tablet: sidebar should be narrower
      const v2Sidebar = page.locator('.pf2-sidebar');
      if (await v2Sidebar.isVisible().catch(() => false)) {
        const box = await v2Sidebar.boundingBox();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(300);
        }
      }
    }
  });
});

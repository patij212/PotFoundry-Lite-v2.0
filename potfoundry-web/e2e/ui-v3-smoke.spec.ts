/**
 * UI v3 "Studio at Dusk" shell — E2E smoke + critique screenshot gate.
 *
 * Requires a running dev server: npm run dev  (port 3000 per vite.config.ts)
 * Run: npx playwright test e2e/ui-v3-smoke.spec.ts --project=chromium
 *
 * Adaptations vs brief (all recorded):
 *  A1 — persist key corrected: `potfoundry-store` (brief guessed `potfoundry-storage`)
 *  A2 — baseURL overridden to port 3000 (vite default); playwright.config defaults to 3001
 *  A3 — store-call activates v3 post-load for speed; readStoredTheme() now accepts 'v3'
 *       so the initScript localStorage write is sufficient on its own
 *  A4 — pf3-hint-dismissed=1 injected to suppress first-run HintLine overlay
 *  A5 — height test polls via waitForFunction (Zustand persist timing on slow GPU)
 *  A6 — v1/v2 compat test drives theme via setUITheme() without page.reload(),
 *       bypassing the beforeEach initScript ordering conflict
 *  A7 — test.setTimeout(30 000 ms); WebGPU can take ~10 s to initialise
 */

import { test, expect } from '@playwright/test';

test.describe('UI v3 desktop smoke', () => {
  // Dev server port is 3000; playwright.config.ts non-CI default is 3001 (mismatch)
  test.use({ baseURL: 'http://127.0.0.1:3000' });
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Set both keys; store-call below activates v3 for speed (readStoredTheme now accepts 'v3')
      localStorage.setItem('pf2-ui-theme', 'v3');
      localStorage.setItem('pf3-hint-dismissed', '1');
    });
    await page.goto('/');
    // A3: store-call kept for speed; readStoredTheme() now also accepts 'v3'
    await page.evaluate(() => {
      window.__POTFOUNDRY_STORE__?.getState().setUITheme('v3');
    });
    await page.waitForSelector('.pf3-root', { timeout: 15_000 });
  });

  // ── 1. Shell structure ───────────────────────────────────────────────────────

  test('shell renders: panel, three pills, status', async ({ page }) => {
    await expect(page.getByTestId('pf3-panel')).toBeVisible();
    await expect(page.getByTestId('pf3-pill')).toHaveCount(3);
    await expect(page.getByTestId('pf3-status')).toBeVisible();
  });

  // ── 2. Tab switching + DisclosureSeam ────────────────────────────────────────

  test('tabs switch and advanced seam expands', async ({ page }) => {
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByTestId('pf3-style-current')).toBeVisible();

    await page.getByRole('tab', { name: 'Shape' }).click();
    // DisclosureSeam button text: "⌄ advanced — walls, drain & flare"
    await page.getByRole('button', { name: /advanced — walls/ }).click();
    await expect(page.getByText('Wall thickness')).toBeVisible();
  });

  // ── 3. Height slider → Zustand persist → localStorage ────────────────────────

  test('height slider drives the store and status updates', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Height' });
    await slider.focus();

    // Read current persisted H; may be absent before any change → default is 120
    const hBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('potfoundry-store');
      if (!raw) return 120;
      const parsed = JSON.parse(raw);
      return parsed?.state?.geometry?.H ?? 120;
    });

    await page.keyboard.press('ArrowRight');

    // Zustand persist is synchronous; poll up to 5 s to confirm the write
    await page.waitForFunction(
      (initial) => {
        const raw = localStorage.getItem('potfoundry-store');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const h = parsed?.state?.geometry?.H;
        return typeof h === 'number' && h > initial;
      },
      hBefore,
      { timeout: 5_000 },
    );

    const h = await page.evaluate(() => {
      const raw = localStorage.getItem('potfoundry-store');
      if (!raw) return null;
      return JSON.parse(raw)?.state?.geometry?.H ?? null;
    });
    expect(h).toBeGreaterThan(hBefore);
  });

  // ── 4. Backward-compatibility: v1 + v2 shells ────────────────────────────────

  test('v1 and v2 shells still mount', async ({ page }) => {
    // Switch theme via store action — no page.reload() needed (avoids initScript conflict)
    await page.evaluate(() => {
      window.__POTFOUNDRY_STORE__?.getState().setUITheme('classic');
    });
    await expect(page.locator('.pf-app-ui').first()).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      window.__POTFOUNDRY_STORE__?.getState().setUITheme('v2');
    });
    await expect(page.locator('.pf2-root').first()).toBeVisible({ timeout: 15_000 });
  });

  // ── 5. Critique screenshots ──────────────────────────────────────────────────

  test('capture critique screenshots', async ({ page }) => {
    // Shape tab is the default
    await page.screenshot({ path: 'test-results/pf3-shape.png' });

    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByTestId('pf3-style-current')).toBeVisible();
    await page.screenshot({ path: 'test-results/pf3-style.png' });

    await page.getByRole('tab', { name: 'Export' }).click();
    await page.screenshot({ path: 'test-results/pf3-export.png' });
  });
});

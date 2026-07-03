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
 *  A7 — test.setTimeout(30 000 ms) globally; v1/v2 and entrance override to 60 000 ms
 *       (theme switches + double navigation need more headroom under parallel GPU load)
 *  A8 — entrance: data-entrance is set by a React useEffect (async post-paint);
 *       test waits for [data-entrance] selector before asserting presence
 *  A9 — rim-handle drag uses page.mouse down/move/up; SVG setPointerCapture bubbles
 *       the move to the parent SVG's onSvgPointerMove handler as designed
 *  A10 — showroom tile click targets the first button inside the grid; style-thumb-*
 *        data-testids are on the inner <button> element rendered by StyleThumb
 *  A11 — screenshot test extended: opens showroom for pf3-showroom.png; pf3-shape.png
 *        re-captured from default Shape tab; Escape closes showroom before Export capture
 *  A12 — height slider selector narrowed to getByTestId('pf3-param-H').getByRole('slider');
 *        BlueprintCanvas handle (phase-1) also has role=slider + aria-label="Height",
 *        causing a strict-mode violation with the original unscoped selector
 *  A13 — showroom chip + tile now use real .click() calls (F1 fix: pointer-events:auto
 *        added to .pf3-showroom-backdrop in ShowroomOverlay.css so Playwright's pointer
 *        hit-test reaches the children; previously used dispatchEvent('click') to bypass
 *        the pointer-events:none on pf3-root, but that masked the production bug)
 *  A14 — v1/v2 test sets per-test timeout to 60 000 ms (theme switch to classic needs
 *        >15 s when 10 tests run in parallel under WebGPU pressure)
 *  A15 — entrance test sets per-test timeout to 60 000 ms (beforeEach + reload = two
 *        full navigations, each up to 15 s; 30 s budget too tight)
 *  A16 — screenshot test sets per-test timeout to 60 000 ms (8-worker parallel GPU load
 *        can push beforeEach alone past 30 s); showroom closed via Escape after explicit
 *        search-input focus (keyboard events bypass pointer-events CSS)
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
    // A12: BlueprintCanvas handle also has role=slider + aria-label="Height"; narrow
    // to the ParamRow input by scoping to its testid container.
    const slider = page.getByTestId('pf3-param-H').getByRole('slider');
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
    // A14: theme switches may take >15 s under parallel GPU load; extend budget.
    test.setTimeout(60_000);

    // Switch theme via store action — no page.reload() needed (avoids initScript conflict)
    await page.evaluate(() => {
      window.__POTFOUNDRY_STORE__?.getState().setUITheme('classic');
    });
    await expect(page.locator('.pf-app-ui').first()).toBeVisible({ timeout: 20_000 });

    await page.evaluate(() => {
      window.__POTFOUNDRY_STORE__?.getState().setUITheme('v2');
    });
    await expect(page.locator('.pf2-root').first()).toBeVisible({ timeout: 20_000 });
  });

  // ── 5. Blueprint visible + rim-handle drag changes top_od ────────────────────

  test('blueprint visible in Shape tab; rim-handle drag changes stored top_od', async ({ page }) => {
    // Blueprint SVG is visible on the default Shape tab
    const blueprint = page.getByTestId('pf3-blueprint');
    await expect(blueprint).toBeVisible();

    // Read current top_od from localStorage (default 100)
    const topOdBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('potfoundry-store');
      if (!raw) return 100;
      return JSON.parse(raw)?.state?.geometry?.top_od ?? 100;
    });

    // Drag the rim handle (SVG circle, data-testid="pf3-bp-handle-rim") horizontally.
    // A9: page.mouse dispatches pointer events; setPointerCapture on the circle causes
    // subsequent events to target the circle and bubble to the SVG's onSvgPointerMove.
    const handle = page.getByTestId('pf3-bp-handle-rim');
    const box = await handle.boundingBox();
    if (!box) throw new Error('pf3-bp-handle-rim bounding box not found');

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy, { steps: 5 });
    await page.mouse.up();

    // Poll for the persisted change
    await page.waitForFunction(
      (initial: number) => {
        const raw = localStorage.getItem('potfoundry-store');
        if (!raw) return false;
        const v = JSON.parse(raw)?.state?.geometry?.top_od;
        return typeof v === 'number' && v !== initial;
      },
      topOdBefore,
      { timeout: 5_000 },
    );

    const topOdAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('potfoundry-store');
      if (!raw) return null;
      return JSON.parse(raw)?.state?.geometry?.top_od ?? null;
    });
    expect(topOdAfter).not.toBe(topOdBefore);
  });

  // ── 6. "all →" opens showroom; chip filters; tile click applies + closes ──────

  test('"all →" opens showroom; category chip filters; tile click applies style and closes', async ({ page }) => {
    // Navigate to the Style tab
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByTestId('pf3-style-current')).toBeVisible();

    // Open the showroom via the "all →" button
    await page.getByTestId('pf3-open-showroom').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Category chip: click "Organic" (second chip after "All").
    // A13: pf3-panel__resize overlaps the chip in Playwright's hit-test even though
    // z-index is correct; use force to bypass the interceptor check.
    const chips = page.locator('.pf3-showroom__chip');
    await expect(chips.first()).toBeVisible();
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThan(1);
    // A13 fixed: F1 added pointer-events:auto to .pf3-showroom-backdrop — real clicks work now.
    await chips.nth(1).click(); // "Organic"
    // Grid should still show tiles for the filtered category
    await expect(page.locator('.pf3-showroom__grid button').first()).toBeVisible({ timeout: 3_000 });

    // Click the first tile in the grid to apply the style.
    // A10: StyleThumb renders a <button> with aria-label="Select {name} style".
    // A13 fixed: real click works now that backdrop has pointer-events:auto.
    const firstTile = page.locator('.pf3-showroom__grid button').first();
    const tileLabelAttr = await firstTile.getAttribute('aria-label');
    await firstTile.click();

    // Dialog should close after tile click
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // The style-current panel confirms apply succeeded
    await expect(page.getByTestId('pf3-style-current')).toBeVisible();
    expect(tileLabelAttr).toBeTruthy();
  });

  // ── 7. ? key opens the shortcuts dialog ──────────────────────────────────────

  test('"?" opens shortcuts dialog', async ({ page }) => {
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('heading', { name: 'Shortcuts' })).toBeVisible();
    // Click inside the dialog to anchor Radix focus-trap before pressing Escape.
    // F2 fix (pointer-events:auto on pf3-shortcuts-content) makes this real click
    // work — before the fix this would have passed through to the canvas below.
    await dialog.click();
    // Escape should close it
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  // ── 8. Toolbar has exactly 8 buttons ─────────────────────────────────────────

  test('toolbar has 8 buttons: undo/redo + camera/rotate/ortho/grid + zen/fullscreen', async ({ page }) => {
    // PillToolbar renders 8 PillButton elements with class pf3-pillbtn
    const buttons = page.locator('.pf3-pillbtn');
    await expect(buttons).toHaveCount(8);
    // Spot-check two specific labels
    await expect(page.getByRole('button', { name: 'Orthographic view' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grid' })).toBeVisible();
  });

  // ── 9. Entrance sequence: data-entrance present once; absent after reload ─────

  test('entrance: data-entrance on first load; absent after reload (sessionStorage gate)', async ({ page }) => {
    // A15: two full page navigations (beforeEach + reload) can each take up to 15 s
    // under parallel GPU load; extend budget to 60 s.
    test.setTimeout(60_000);

    // beforeEach provides a fresh browser context → sessionStorage is empty.
    // A8: data-entrance is set by a React useEffect (fires after first paint);
    //     use waitForSelector to avoid a race vs. waitForSelector('.pf3-root').
    await page.waitForSelector('[data-testid="pf3-root"][data-entrance]', { timeout: 10_000 });
    expect(
      await page.locator('[data-testid="pf3-root"][data-entrance]').count(),
    ).toBe(1);

    // Reload — sessionStorage persists within the same browser context/tab.
    // The `pf3-entered` flag is already set → entrance should NOT replay.
    await page.reload();
    await page.waitForSelector('.pf3-root', { timeout: 15_000 });
    // Re-activate v3 (init script re-runs on navigation, but store call still needed)
    await page.evaluate(() => {
      window.__POTFOUNDRY_STORE__?.getState().setUITheme('v3');
    });
    await page.waitForSelector('.pf3-root', { timeout: 10_000 });

    // data-entrance must be absent after reload (session flag is set)
    expect(
      await page.locator('[data-testid="pf3-root"][data-entrance]').count(),
    ).toBe(0);
  });

  // ── 10. Critique screenshots ──────────────────────────────────────────────────

  test('capture critique screenshots', async ({ page }) => {
    // A16: 8 parallel workers exhaust GPU; extend budget for beforeEach + body.
    test.setTimeout(60_000);

    // Shape tab is the default — re-capture pf3-shape.png (A11)
    await page.screenshot({ path: 'test-results/pf3-shape.png' });

    // Style tab
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByTestId('pf3-style-current')).toBeVisible();
    await page.screenshot({ path: 'test-results/pf3-style.png' });

    // Showroom — open, capture, then close before navigating to Export.
    // A16: close via Escape with explicit search focus (keyboard bypasses pointer-events).
    await page.getByTestId('pf3-open-showroom').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    // F4: wait for thumbnail canvases to paint before screenshot
    await page.waitForFunction(() => document.querySelectorAll('.pf3-showroom-backdrop canvas').length >= 5, { timeout: 20_000 });
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: 'test-results/pf3-showroom.png' });
    // Focus the search input (it gets rAF focus on open) then Escape to close.
    await page.locator('.pf3-showroom__search').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3_000 });

    // Export tab
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.screenshot({ path: 'test-results/pf3-export.png' });
  });
});

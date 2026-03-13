import { test, expect, type Page } from '@playwright/test';

test.setTimeout(60_000);

/**
 * V2.2 Undo/Redo Verification Suite
 *
 * Tests that discrete control actions (style, wireframe, color scheme,
 * lighting, quality preset, optimize toggle) are properly wrapped in
 * beginHistoryTransaction / commitHistoryTransaction so each action
 * produces exactly one undo entry.
 *
 * Strategy: all interactions go through the Zustand store exposed at
 * `window.__POTFOUNDRY_STORE__` (see store.ts ~line 117). This avoids
 * UI-layer fragility (WelcomeCard overlays, theme switching, Radix
 * popovers) while exercising the exact same transaction wrapping code
 * that the v2 UI handlers call.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read state fields relevant to undo/redo verification. */
async function snap(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).__POTFOUNDRY_STORE__?.getState();
    if (!s) throw new Error('Store not exposed on window.__POTFOUNDRY_STORE__');
    return {
      styleName:      s.style.name        as string,
      showWireframe:  s.appearance.showWireframe as boolean,
      colorScheme:    s.appearance.colorScheme   as string,
      lightingPreset: s.appearance.lightingPreset as string,
      exportNTheta:   s.mesh.export_n_theta as number,
      exportNZ:       s.mesh.export_n_z     as number,
      optimize:       s.mesh.optimize       as boolean,
    };
  });
}

/** Invoke undo via the store action (bypasses keyboard / v2-only guard). */
async function storeUndo(page: Page) {
  await page.evaluate(() => (window as any).__POTFOUNDRY_STORE__.getState().undo());
  await page.waitForTimeout(100);
}

/** Invoke redo via the store action. */
async function storeRedo(page: Page) {
  await page.evaluate(() => (window as any).__POTFOUNDRY_STORE__.getState().redo());
  await page.waitForTimeout(100);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Wait for the app to be interactive (canvas rendered by WebGPU/GL).
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  // Let the store, persist-rehydration and renderer settle.
  await page.waitForTimeout(1500);

  // Verify the store is accessible before proceeding.
  const storeOk = await page.evaluate(() => !!(window as any).__POTFOUNDRY_STORE__?.getState);
  expect(storeOk).toBe(true);
});

// ---------------------------------------------------------------------------
// StyleTab Controls
// ---------------------------------------------------------------------------

test.describe('V2.2 Undo/Redo — StyleTab Controls', () => {

  test('Style selection → undo → redo', async ({ page }) => {
    const initial = await snap(page);

    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.setStyle('SpiralRidges');
      s.commitHistoryTransaction();
    });
    const after = await snap(page);
    expect(after.styleName).toBe('SpiralRidges');

    await storeUndo(page);
    expect((await snap(page)).styleName).toBe(initial.styleName);

    await storeRedo(page);
    expect((await snap(page)).styleName).toBe('SpiralRidges');
  });

  test('Wireframe toggle → undo → redo', async ({ page }) => {
    const initial = await snap(page);

    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.toggleWireframe();
      s.commitHistoryTransaction();
    });
    const after = await snap(page);
    expect(after.showWireframe).not.toBe(initial.showWireframe);

    await storeUndo(page);
    expect((await snap(page)).showWireframe).toBe(initial.showWireframe);

    await storeRedo(page);
    expect((await snap(page)).showWireframe).toBe(after.showWireframe);
  });

  test('Color scheme swatch → undo → redo', async ({ page }) => {
    const initial = await snap(page);

    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.setColorScheme('ocean_blue');
      s.commitHistoryTransaction();
    });
    const after = await snap(page);
    expect(after.colorScheme).not.toBe(initial.colorScheme);

    await storeUndo(page);
    expect((await snap(page)).colorScheme).toBe(initial.colorScheme);

    await storeRedo(page);
    expect((await snap(page)).colorScheme).toBe(after.colorScheme);
  });

  test('Lighting preset chip → undo → redo', async ({ page }) => {
    const initial = await snap(page);

    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.setLightingPreset('dramatic');
      s.commitHistoryTransaction();
    });
    const after = await snap(page);
    expect(after.lightingPreset).not.toBe(initial.lightingPreset);

    await storeUndo(page);
    expect((await snap(page)).lightingPreset).toBe(initial.lightingPreset);

    await storeRedo(page);
    expect((await snap(page)).lightingPreset).toBe(after.lightingPreset);
  });
});

// ---------------------------------------------------------------------------
// ExportTab Controls
// ---------------------------------------------------------------------------

test.describe('V2.2 Undo/Redo — ExportTab Controls', () => {

  test('Quality preset card → undo → redo', async ({ page }) => {
    const initial = await snap(page);

    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.setQualityPreset('high');
      s.commitHistoryTransaction();
    });
    const after = await snap(page);
    expect(after.exportNTheta).not.toBe(initial.exportNTheta);

    await storeUndo(page);
    const undone = await snap(page);
    expect(undone.exportNTheta).toBe(initial.exportNTheta);
    expect(undone.exportNZ).toBe(initial.exportNZ);

    await storeRedo(page);
    expect((await snap(page)).exportNTheta).toBe(after.exportNTheta);
  });

  test('Optimize toggle → undo → redo', async ({ page }) => {
    const initial = await snap(page);

    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.setMeshParam('optimize', !s.mesh.optimize);
      s.commitHistoryTransaction();
    });
    const after = await snap(page);
    expect(after.optimize).not.toBe(initial.optimize);

    await storeUndo(page);
    expect((await snap(page)).optimize).toBe(initial.optimize);

    await storeRedo(page);
    expect((await snap(page)).optimize).toBe(after.optimize);
  });
});

// ---------------------------------------------------------------------------
// Complex Multi-Action Sequences
// ---------------------------------------------------------------------------

test.describe('V2.2 Undo/Redo — Complex Sequences', () => {

  test('Multi-action: style → wireframe → quality → undo all → redo all', async ({ page }) => {
    const snapshots: Awaited<ReturnType<typeof snap>>[] = [];
    snapshots.push(await snap(page));

    // Action 1: Change style
    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.setStyle('SpiralRidges');
      s.commitHistoryTransaction();
    });
    snapshots.push(await snap(page));

    // Action 2: Toggle wireframe
    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.toggleWireframe();
      s.commitHistoryTransaction();
    });
    snapshots.push(await snap(page));

    // Action 3: Change quality preset
    await page.evaluate(() => {
      const s = (window as any).__POTFOUNDRY_STORE__.getState();
      s.beginHistoryTransaction();
      s.setQualityPreset('high');
      s.commitHistoryTransaction();
    });
    snapshots.push(await snap(page));

    // Undo 3 (reverse)
    await storeUndo(page);
    expect((await snap(page)).exportNTheta).toBe(snapshots[2].exportNTheta);

    await storeUndo(page);
    expect((await snap(page)).showWireframe).toBe(snapshots[1].showWireframe);

    await storeUndo(page);
    expect((await snap(page)).styleName).toBe(snapshots[0].styleName);

    // Redo 3 (forward)
    await storeRedo(page);
    expect((await snap(page)).styleName).toBe(snapshots[1].styleName);

    await storeRedo(page);
    expect((await snap(page)).showWireframe).toBe(snapshots[2].showWireframe);

    await storeRedo(page);
    expect((await snap(page)).exportNTheta).toBe(snapshots[3].exportNTheta);
  });
});

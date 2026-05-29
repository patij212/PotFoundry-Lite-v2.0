/**
 * SP0 — 3D Export Fidelity Harness (real WebGPU).
 * Loads the app once, loops every registered style, measures the 3D fidelity
 * matrix via window.__pfFidelity, writes baseline.json, and asserts one pinned
 * invariant per fidelity dimension. Run with the dev server on :3001:
 *   npm run dev -- --port 3001   (separate terminal)
 *   npx playwright test export-fidelity --project=chromium
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  SAG_TOL_MM,
  ASPECT_MAX,
  type FidelityMetrics,
  type FidelityBaseline,
} from '../src/fidelity/types';

/**
 * Public shape of the dev-gated in-page hook (see src/fidelity/windowHook.ts).
 * Declared locally because the e2e tsconfig includes only `e2e/**`, so the
 * hook module's own global augmentation is not in this program.
 */
interface PfFidelityApi {
  listStyles(): string[];
  isReady(): boolean;
  setStyle(styleId: string): Promise<void>;
  measure(opts: {
    targetTriangles: number;
    referenceTriangles: number;
    sagSampleOrder?: number;
  }): Promise<FidelityMetrics>;
}

declare global {
  interface Window {
    __pfFidelity?: PfFidelityApi;
  }
}

const TARGET_TRIANGLES = 500_000; // 'draft'/'standard'-ish for matrix speed
const REFERENCE_TRIANGLES = 8_000_000; // dense R_true reference
const OUT_DIR = path.join(__dirname, 'fidelity');
const OUT_FILE = path.join(OUT_DIR, 'baseline.json');

test.describe.configure({ mode: 'serial' });

test.describe('Export fidelity matrix', () => {
  let styles: string[] = [];
  const rows: FidelityMetrics[] = [];

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/?fidelity=1');
    await expect(page.locator('.pf-wgpu-preview')).toHaveAttribute('data-ready', 'true', {
      timeout: 30000,
    });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', {
      timeout: 30000,
    });
    styles = await page.evaluate(() => window.__pfFidelity!.listStyles());

    for (const styleId of styles) {
      await page.evaluate((s) => window.__pfFidelity!.setStyle(s), styleId);
      const row = await page.evaluate(
        ({ t, r }) => window.__pfFidelity!.measure({ targetTriangles: t, referenceTriangles: r }),
        { t: TARGET_TRIANGLES, r: REFERENCE_TRIANGLES },
      );
      rows.push(row);
      // eslint-disable-next-line no-console
      console.log(
        `${row.styleId}: sag=${row.maxSagMm.toFixed(3)}mm aspect=${row.maxAspect3D.toFixed(0)} ` +
          `bnd=${row.boundaryEdges} nonMan=${row.nonManifoldEdges} orient=${row.orientationMismatches} ` +
          `featDrop=${row.featuresDropped}/${row.featuresExpected}`,
      );
    }

    const baseline: FidelityBaseline = {
      generatedAt: new Date().toISOString(),
      budget: TARGET_TRIANGLES,
      referenceBudget: REFERENCE_TRIANGLES,
      refDimensions: { H: 120, Rt: 70, Rb: 45 },
      rows,
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2));
    await page.close();
  });

  test('produced a matrix row for every registered style', () => {
    expect(rows.length).toBe(styles.length);
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  // ── Pinned invariants (one per dimension). Some use test.fail() because the
  //    pipeline is currently broken; they flip the moment SP1–SP3 fix them. ──

  test('INVARIANT sag: maxSagMm <= SAG_TOL_MM (all styles)', () => {
    test.fail(); // SP1 (tolerance-driven tessellation) target — RED at HEAD.
    for (const r of rows) expect(r.maxSagMm, r.styleId).toBeLessThanOrEqual(SAG_TOL_MM);
  });

  test('INVARIANT quality: maxAspect3D < ASPECT_MAX (all styles)', () => {
    test.fail(); // SP2 (sliver elimination) target — RED at HEAD.
    for (const r of rows) expect(r.maxAspect3D, r.styleId).toBeLessThan(ASPECT_MAX);
  });

  test('INVARIANT watertight: boundaryEdges == 0 (outer-wall mesh) — DOCUMENTED', () => {
    test.fail(); // SP3 (watertight assembly) target; outer wall is open by design at HEAD.
    for (const r of rows) expect(r.boundaryEdges, r.styleId).toBe(0);
  });

  test('INVARIANT orientation: orientationMismatches == 0 (all styles)', () => {
    for (const r of rows) expect(r.orientationMismatches, r.styleId).toBe(0);
  });

  test('INVARIANT features: featuresDropped == 0 (all styles)', () => {
    test.fail(); // F12-style silent chain drops exist at HEAD — RED until fixed.
    for (const r of rows) expect(r.featuresDropped, r.styleId).toBe(0);
  });
});

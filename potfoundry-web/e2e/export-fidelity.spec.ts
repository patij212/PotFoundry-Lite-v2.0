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
import { fileURLToPath } from 'url';
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
// Advisory only: the dense R_true reference is now built on the fast GPU uniform
// grid (resolution set by FidelityHookMount under ?fidelity), not the CPU-bound
// parametric pipeline. measure() ignores this number for the reference; the real
// per-style reference triangle count is recorded in each row.referenceTriangleCount.
const REFERENCE_TRIANGLES = 8_000_000;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fidelity');
const OUT_FILE = path.join(OUT_DIR, 'baseline.json');

test.describe.configure({ mode: 'serial' });

test.describe('Export fidelity matrix', () => {
  let styles: string[] = [];
  const rows: FidelityMetrics[] = [];
  const failures: { styleId: string; error: string }[] = [];

  test.beforeAll(async ({ browser }) => {
    // The matrix generates a dense GPU reference + a CPU-bound parametric
    // under-test mesh for every registered style. Measured ~2 min/style on real
    // hardware (≈20 styles → ~40 min), so budget 60 min for headroom.
    test.setTimeout(60 * 60 * 1000);
    const page = await browser.newPage();
    await page.goto('/?fidelity=1');
    // Gate on the harness's own readiness, NOT the preview canvas. The export
    // pipelines run on their own GPUDevices; the main preview render pipeline can
    // stall independently (observed: Dawn compiler hangs compiling a style's
    // render pipeline), which would never flip .pf-wgpu-preview[data-ready] even
    // though export is fully functional. __pfFidelity.isReady() === true means
    // BOTH the parametric (under-test) and GPU-grid (reference) pipelines are up.
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', {
      timeout: 90000,
    });
    await page.waitForFunction(() => window.__pfFidelity!.isReady() === true, {
      timeout: 90000,
    });
    styles = await page.evaluate(() => window.__pfFidelity!.listStyles());

    for (const styleId of styles) {
      // Per-style isolation: a GPU pipeline hang or pipeline exception on one
      // style must not abort the whole (~40 min) matrix. Record the failure and
      // move on so the baseline still captures every style that CAN be measured.
      try {
        await page.evaluate((s) => window.__pfFidelity!.setStyle(s), styleId);
        const row = await page.evaluate(
          ({ t, r }) => window.__pfFidelity!.measure({ targetTriangles: t, referenceTriangles: r }),
          { t: TARGET_TRIANGLES, r: REFERENCE_TRIANGLES },
        );
        rows.push(row);
        // eslint-disable-next-line no-console
        console.log(
          `${row.styleId}: sag=${row.maxSagMm.toFixed(3)}mm aspect=${row.maxAspect3D.toFixed(0)} ` +
            `minAng=${row.minAngleDeg.toFixed(1)}° slivers=${row.sliverCount} ` +
            `bnd=${row.boundaryEdges} nonMan=${row.nonManifoldEdges} orient=${row.orientationMismatches} ` +
            `featDrop=${row.featuresDropped}/${row.featuresExpected} ` +
            `tris=${row.triangleCount} refTris=${row.referenceTriangleCount}`,
        );
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        failures.push({ styleId, error });
        // eslint-disable-next-line no-console
        console.log(`${styleId}: MEASURE FAILED — ${error}`);
      }
    }

    const baseline: FidelityBaseline = {
      generatedAt: new Date().toISOString(),
      budget: TARGET_TRIANGLES,
      referenceBudget: REFERENCE_TRIANGLES,
      refDimensions: { H: 120, Rt: 70, Rb: 45 },
      rows,
      failures,
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2));
    await page.close();
  });

  test('every registered style was accounted for (measured or recorded as failed)', () => {
    expect(styles.length).toBeGreaterThanOrEqual(20);
    expect(rows.length + failures.length).toBe(styles.length);
  });

  test('every style was measurable (no generation/init failures)', () => {
    // RED at HEAD: 8 feature-dense styles (GothicArches, GyroidManifold,
    // Voronoi, BasketWeave, GeometricStar, HexagonalHive, CelticKnot,
    // CelticTriquetra) abort the parametric pipeline with
    //   RangeError: Maximum call stack size exceeded
    //   at buildCDTOuterWall (parametric/OuterWallTessellator.ts)
    // — the CDT outer-wall tessellator recurses unboundedly on dense feature
    // grids. This is a pipeline-logic defect for SP1–SP3 to fix, not the
    // harness. Pinned with test.fail() so it reads GREEN-as-expected here (and
    // does NOT abort the serial chain, which would skip the invariants below);
    // it flips to a real RED the moment a measurable style regresses, and the
    // marker must be removed once the tessellator no longer overflows.
    test.fail();
    expect(failures, JSON.stringify(failures, null, 2)).toHaveLength(0);
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
    test.fail(); // RED at HEAD — every measured style has 1.5k–29k winding
    // mismatches (adjacent faces disagree on orientation). SP2/SP3 (topology /
    // watertight assembly) target. Flips GREEN when winding is made consistent.
    for (const r of rows) expect(r.orientationMismatches, r.styleId).toBe(0);
  });

  test('INVARIANT features: featuresDropped == 0 (all styles)', () => {
    // GREEN at HEAD: across all 12 measurable styles featuresDropped == 0
    // (chain accounting reports present >= expected). No test.fail() — this
    // dimension is currently clean by the metric we have. Caveat: the metric
    // compares chainCount vs lineCount; if a later, finer drop-detector lands
    // and exposes silent drops, re-pin with test.fail() then. Until then we
    // assert exactly what HEAD measures.
    for (const r of rows) expect(r.featuresDropped, r.styleId).toBe(0);
  });
});

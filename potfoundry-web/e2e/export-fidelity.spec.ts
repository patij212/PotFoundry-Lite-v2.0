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
    sagTriangleSampleLimit?: number;
    qualityTriangleSampleLimit?: number;
    nearestReferenceTriangleSampleLimit?: number;
  }): Promise<FidelityMetrics>;
}

declare global {
  interface Window {
    __pfFidelity?: PfFidelityApi;
  }
}

const TARGET_TRIANGLES = 500_000; // 'draft'/'standard'-ish for matrix speed
const STYLE_TIMEOUT_MS = 15 * 60 * 1000;
const MATRIX_BOOT_TIMEOUT_MS = 5 * 60 * 1000;
const MATRIX_OVERHEAD_MS = 5 * 60 * 1000;
// Advisory only: the dense R_true reference is now built on the fast GPU uniform
// grid (resolution set by FidelityHookMount under ?fidelity), not the CPU-bound
// parametric pipeline. measure() ignores this number for the reference; the real
// per-style reference triangle count is recorded in each row.referenceTriangleCount.
const REFERENCE_TRIANGLES = 8_000_000;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fidelity');
const OUT_FILE = path.join(OUT_DIR, 'baseline.json');

function matrixTimeoutMs(styleCount: number): number {
  return MATRIX_OVERHEAD_MS + Math.max(1, styleCount) * STYLE_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function writeBaseline(rows: FidelityMetrics[], failures: { styleId: string; error: string }[], generatedAt: string): void {
  const baseline: FidelityBaseline = {
    generatedAt,
    budget: TARGET_TRIANGLES,
    referenceBudget: REFERENCE_TRIANGLES,
    refDimensions: { H: 120, Rt: 70, Rb: 45 },
    rows,
    failures,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2));
}

test.describe.configure({ mode: 'serial' });

test.describe('Export fidelity matrix', () => {
  let styles: string[] = [];
  const rows: FidelityMetrics[] = [];
  const failures: { styleId: string; error: string }[] = [];

  test.beforeAll(async ({ browser }) => {
    // The matrix generates a dense GPU reference + a CPU-bound parametric
    // under-test mesh for every registered style. Use a short boot budget until
    // the registry is known, then scale by style count so one per-style timeout
    // cannot consume the whole beforeAll budget.
    test.setTimeout(MATRIX_BOOT_TIMEOUT_MS);
    const runStartedAt = new Date().toISOString();
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
    test.setTimeout(matrixTimeoutMs(styles.length));
    writeBaseline(rows, failures, runStartedAt);

    for (const styleId of styles) {
      // Per-style isolation: a GPU pipeline hang or pipeline exception on one
      // style must not abort the whole matrix. Record each completed row or
      // failure immediately so an abort still leaves useful baseline evidence.
      try {
        await page.evaluate((s) => window.__pfFidelity!.setStyle(s), styleId);
        const row = await withTimeout(
          page.evaluate(
            ({ t, r }) => window.__pfFidelity!.measure({ targetTriangles: t, referenceTriangles: r }),
            { t: TARGET_TRIANGLES, r: REFERENCE_TRIANGLES },
          ),
          STYLE_TIMEOUT_MS,
          `${styleId} fidelity measure`,
        );
        rows.push(row);
        writeBaseline(rows, failures, runStartedAt);
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
        writeBaseline(rows, failures, runStartedAt);
        // eslint-disable-next-line no-console
        console.log(`${styleId}: MEASURE FAILED — ${error}`);
      }
    }
    await page.close();
  });

  test('every registered style was accounted for (measured or recorded as failed)', () => {
    expect(styles.length).toBeGreaterThanOrEqual(20);
    expect(rows.length + failures.length).toBe(styles.length);
  });

  test('every style was measurable (no generation/init failures)', () => {
    // RED at HEAD: GyroidManifold exceeds the per-style fidelity budget, and
    // every style absent from rows must be recorded in failures. This is a
    // pipeline throughput/robustness defect for SP1-SP3 to fix, not a harness
    // reason to drop rows. test.fail() keeps the serial invariant checks visible
    // while still pinning "all styles measurable" as the target.
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
    // GREEN at HEAD: across the currently measurable styles featuresDropped == 0
    // (chain accounting reports present >= expected). No test.fail() — this
    // dimension is currently clean by the metric we have. Caveat: the metric
    // compares chainCount vs lineCount; if a later, finer drop-detector lands
    // and exposes silent drops, re-pin with test.fail() then. Until then we
    // assert exactly what HEAD measures.
    for (const r of rows) expect(r.featuresDropped, r.styleId).toBe(0);
  });
});

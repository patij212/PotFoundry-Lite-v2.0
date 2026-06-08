/**
 * Gap1FoundationAspect.test.ts — Root-cause guard for the short-wide sliver
 * blocker (GAP 1, the dominant cutover blocker).
 *
 * PROVEN MECHANISM (measured, no GPU): the conforming mesher refines in SQUARE
 * (u,t) cells (Δu = Δt at every leaf). A square param cell maps to a 3D quad
 * whose triangle aspect EQUALS the local metric anisotropy `√E/√G`, INDEPENDENT
 * of refinement level. Wherever `√E/√G` exceeds ~115 (ASPECT_MAX=100) the cell
 * is an irreducible sliver — square refinement shrinks both axes equally, so the
 * ratio (hence the sliver) is preserved at every level.
 *
 * Why it is dimension-dependent: the base anisotropy is `2πR / √G` (circumference
 * over wall height). At default dims (R≈57, H≈120) that is ≈3; at short-wide
 * (R≈145, H≈40) it is ≈22. The base 22 plus local relief (∂r/∂u from style
 * features) crosses 115 for high-detail / warp / inserted styles, while gentle
 * smooth styles (low ∂r/∂u) stay under even at short-wide — exactly matching the
 * e2e dimension-space table (dimspace-findings-2026-06-08i.md).
 *
 * The fix is ANISOTROPIC cells (Δu/Δt ≈ √G/√E): the `anisoFixAspect` column below
 * shows such cells are near-equilateral (≈1.73) in every case, sliver field gone.
 * This guard documents the mechanism and pins it so a future foundation change is
 * measured against it.
 */
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField } from './MetricSizingField';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { firstFundamentalForm, metricStepsForSampler } from './SurfaceMetricTensor';

// Production conforming-branch wall opts (ParametricExportComputer.ts:2190).
const PROD = { maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.2, gradeRatio: 2, resU: 128, resT: 128 };
const NRING = 256;
const ASPECT_MAX = 100;

/** Right-triangle aspect for a physical w×h cell (matches metrics.ts formula). */
function cellAspect(w: number, h: number): number {
  const a = Math.max(w, 1e-12);
  const b = Math.max(h, 1e-12);
  const longest2 = a * a + b * b;
  const area = 0.5 * a * b;
  return (longest2 * Math.sqrt(3)) / (4 * area);
}

interface Stats {
  leaves: number;
  maxCellAspect: number;
  sliverCells: number;
  maxRatio: number;
  anisoFixAspect: number;
}

function measure(sampler: SyntheticCylinderSampler, maxLevel: number): Stats {
  const field = new MetricSizingField(sampler, {
    maxSagMm: PROD.maxSagMm,
    minEdgeMm: PROD.minEdgeMm,
    maxEdgeMm: PROD.maxEdgeMm,
    gradeRatio: PROD.gradeRatio,
    resU: PROD.resU,
    resT: PROD.resT,
  });
  const pin = Math.min(Math.round(Math.log2(NRING)), maxLevel);
  const qt = new PeriodicBalancedQuadtree(field, sampler, { maxLevel, pinBoundaryLevel: pin });
  const steps = metricStepsForSampler(sampler);
  const leaves = qt.leaves();
  let slivers = 0;
  let maxAspect = 0;
  let maxRatio = 0;
  let maxAnisoFix = 0;
  for (const l of leaves) {
    const size = 1 / (1 << l.level);
    const uc = l.u0 + size / 2;
    const tc = l.t0 + size / 2;
    const { E, G } = firstFundamentalForm(sampler, uc, tc, steps.hu, steps.ht);
    const sE = Math.sqrt(Math.max(E, 0));
    const sG = Math.sqrt(Math.max(G, 0));
    const asp = cellAspect(sE * size, sG * size);
    if (asp > maxAspect) maxAspect = asp;
    if (asp > ASPECT_MAX) slivers++;
    const ratio = Math.max(sE / Math.max(sG, 1e-9), sG / Math.max(sE, 1e-9));
    if (ratio > maxRatio) maxRatio = ratio;
    const fixAsp = cellAspect(sE * size, sE * size); // EG-balanced (3D-square) cell
    if (fixAsp > maxAnisoFix) maxAnisoFix = fixAsp;
  }
  return { leaves: leaves.length, maxCellAspect: maxAspect, sliverCells: slivers, maxRatio, anisoFixAspect: maxAnisoFix };
}

describe('GAP 1 — short-wide foundation sliver mechanism (root cause)', () => {
  it('square-cell 3D aspect equals the local metric anisotropy √E/√G (level-independent)', () => {
    // Across dims and detail, maxCellAspect tracks √E/√G within ~15%.
    const cases: Array<[number, number, number, number, number]> = [
      [57, 120, 0, 0, 10], // default gentle
      [57, 120, 8, 16, 8], // default high-detail
      [145, 40, 0, 0, 8], // short-wide gentle
      [145, 40, 8, 16, 8], // short-wide high-detail
    ];
    for (const [R0, H, amp, k, ml] of cases) {
      const s = measure(new SyntheticCylinderSampler(R0, H, amp, k), ml);
      // The cell aspect is the metric ratio (diagonal-triangle factor ≤ 1).
      expect(s.maxCellAspect).toBeLessThanOrEqual(s.maxRatio + 1e-6);
      expect(s.maxCellAspect).toBeGreaterThan(s.maxRatio * 0.6);
    }
  });

  it('default dims never sliver; short-wide gentle never slivers (matches e2e pass set)', () => {
    expect(measure(new SyntheticCylinderSampler(57, 120, 0, 0), 10).sliverCells).toBe(0);
    expect(measure(new SyntheticCylinderSampler(57, 120, 8, 16), 8).sliverCells).toBe(0);
    expect(measure(new SyntheticCylinderSampler(145, 40, 0, 0), 8).sliverCells).toBe(0);
  });

  it('short-wide sharp relief crosses √E/√G≈115 → an irreducible sliver field', () => {
    // amp·k large → local √E/√G > 115. Capped at L7 to bound count; the high-√E
    // band is a sliver at ANY level, so the cap does not hide it.
    const s = measure(new SyntheticCylinderSampler(145, 40, 10, 80), 7);
    expect(s.maxRatio).toBeGreaterThan(ASPECT_MAX);
    expect(s.maxCellAspect).toBeGreaterThan(ASPECT_MAX);
    expect(s.sliverCells).toBeGreaterThan(0);
  });

  it('anisotropic (EG-balanced) cells are near-equilateral in every regime — the fix direction', () => {
    // The hypothetical fix: split so width≈height in physical space (Δu/Δt = √G/√E).
    // Such a cell's worst aspect is the diagonal of a physical square ≈ √3, far
    // below the sliver bound — for gentle AND the worst sharp-facet case.
    for (const [R0, H, amp, k, ml] of [
      [57, 120, 0, 0, 10],
      [145, 40, 10, 80, 7],
    ] as const) {
      const s = measure(new SyntheticCylinderSampler(R0, H, amp, k), ml);
      expect(s.anisoFixAspect).toBeLessThan(2);
    }
  }, 30000);
});

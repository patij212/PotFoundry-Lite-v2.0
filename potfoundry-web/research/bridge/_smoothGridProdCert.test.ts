// _smoothGridProdCert.test.ts — PRODUCTION-ENTRY judge cert for the smooth-grid emitter (E-2026-07-22 campaign).
//
// The campaign's `_smoothGridCert.test.ts` proved the smooth-grid APPROACH judge-certifies at production dims via a
// harness-local `buildSmoothGrid`. This closes the honest last gap: the ACTUAL PRODUCTIONIZED entry point that the
// export dispatch now calls — `buildSmoothGridWall` from src (commit 121a7fe1) — feeds the cut-at-gap adapter and the
// exact-dyadic judge (Track A, READ-ONLY) and gets ACCEPTED with a clean flat partition (no wrap, no non-positive
// triangle, no feature straddle) and a small path-A snap δ. Guards against shipped-emitter ↔ harness drift.
//
// Runs by default (small synthetic surface ⇒ ~33k tris, fast). Consumes the judge READ-ONLY; src never imports research.
import { describe, it, expect } from 'vitest';
import { buildSmoothGridWall, deriveSmoothGridDensity } from '../../src/renderers/webgpu/parametric/conforming/tierC/smoothGrid';
import { certifyPeriodicGridMesh } from './certAdapter';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const H = 120;
/** Synthetic C∞ smooth radius (angular ripple + vertical bell) — representative of the smooth-grid class, style-free. */
const smoothRA: AnalyticRadiusFn = (theta: number, z: number): number => {
  const t = z / H;
  return 55 + 3 * Math.sin(6 * theta) + 2 * Math.sin(Math.PI * t);
};

describe('smooth-grid PRODUCTION entry (buildSmoothGridWall) → exact-dyadic judge cert', () => {
  it('the shipped emitter output is ACCEPTED as a clean flat [0,1]² partition (cut at any gap column)', () => {
    // Representative pow2 columns (dyadic ⇒ snap exact) × dyadic rows (nT-1 = 64) so the whole grid snaps clean.
    const nU = 256;
    const nT = 65;
    const wall = buildSmoothGridWall(smoothRA, H, nU, nT);
    // Smooth ⇒ EVERY column is a gap; cut at column 0. bits=20 ⇒ N=2^20, a multiple of nU (columns snap exact).
    const verdict = certifyPeriodicGridMesh(wall.ut, wall.indices, wall.vertices, wall.nU, 0, smoothRA, H, 20, {
      patchId: 'smoothgridprod',
    });
    expect(verdict.accepted).toBe(true);
    expect(verdict.wrapTris).toBe(0); // no triangle spans the flat u=0↔1 seam after the cut
    expect(verdict.nonPosTris).toBe(0); // winding + snap health (CCW preserved)
    expect(verdict.nonGapStraddle).toBe(0); // smooth ⇒ column 0 is a true gap; nothing distorted
    expect(verdict.seamDupCount).toBeGreaterThan(0); // the one straddling grid column closed by u=1 lattice copies
    // Fully dyadic grid (nU=256, nT-1=64) ⇒ every station snaps EXACT; the residual δ is only Float32 storage epsilon
    // on the positions (≈ r·2⁻²³ ≈ 6.5e-6 at r≈55mm), not a partition error.
    expect(verdict.maxDelta).toBeLessThan(1e-5);
  });

  it('certifies at the SAG-DERIVED production density the dispatch actually uses (deriveSmoothGridDensity)', () => {
    // The real production path derives density from the chord tolerance; prove THAT mesh certifies too. Cap it small
    // for test speed (the cut/partition structure is density-invariant — the campaign's density-invariance argument).
    const { nU, nT } = deriveSmoothGridDensity(smoothRA, H, 0.05, { minNU: 128, maxNU: 512, minNT: 16, maxNT: 96 });
    expect(nU & (nU - 1)).toBe(0); // the derived nU is a power of two (dyadic columns)
    const wall = buildSmoothGridWall(smoothRA, H, nU, nT);
    const verdict = certifyPeriodicGridMesh(wall.ut, wall.indices, wall.vertices, wall.nU, 0, smoothRA, H, 20, {
      patchId: 'smoothgridprodderived',
    });
    expect(verdict.accepted).toBe(true);
    expect(verdict.wrapTris).toBe(0);
    expect(verdict.nonPosTris).toBe(0);
    expect(verdict.nonGapStraddle).toBe(0);
    // Rows at t=j/(nT-1) may be non-dyadic ⇒ a small ACCOUNTED path-A snap δ (folds into the geometric bound), still ≪ tol.
    expect(verdict.maxDelta).toBeLessThan(0.002);
  });
});

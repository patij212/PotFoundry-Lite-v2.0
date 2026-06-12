/**
 * snapPlacementAudit.test.ts — TDD guards for the STAGE 2b SNAP/PLACEMENT
 * AUDIT (blueprint faithfulMetricSpec item 4, crest-elimination-blueprint.json).
 *
 * TWO SEPARATE channels, never summed into one number:
 *
 *  (A) EXTRACTION ERROR — the production extractor's polyline vs the ANALYTIC
 *      ridge (Stage 2a truth machinery), in u-units AND mm.
 *  (B) SNAP DISPLACEMENT — the vertices the REAL FeatureConformingTriangulator
 *      ends up with (after snapToCellEdge/snapToAnchor) vs the pre-snap input
 *      polyline, in u-units AND lateral mm.
 *
 * ## The snap rule under test (read from FeatureConformingTriangulator.ts)
 *
 * `cornerSnap` (FCT.ts:261) is the ABSOLUTE per-axis t-threshold; the u
 * threshold is `cornerSnapU = cornerSnap / 2^B` (FCT.ts:285, B = qt.uBias()).
 * Production sets cornerSnap = 0.06 / 2^featureLevel (ConformingWall.ts:539).
 * Two snaps apply to every inserted feature vertex:
 *
 *  1. `snapToCellEdge` (FCT.ts:329-368): a vertex within cornerSnapU of its
 *     containing cell's u-edge (or cornerSnapT of a t-edge) is projected
 *     PERPENDICULAR onto the NEAREST such edge (smallest of the in-range
 *     per-axis distances) — one axis moves, the other is unchanged.
 *  2. `snapToAnchor` (FCT.ts:641-647): a (clipped) segment endpoint within the
 *     anisotropic Chebyshev box (|du| ≤ cornerSnapU AND |dt| ≤ cornerSnapT) of
 *     a cell corner or mid-edge vertex is snapped ONTO that anchor (both axes
 *     move). Interior points may additionally be welded onto a boundary point
 *     within the same box (FCT.ts:849-865).
 *
 * Test 4 constructs a vertex where ONLY rule 1's u-edge branch can fire, so the
 * expected displacement is exactly the u-offset (perpendicular projection).
 *
 * Test 5 is the PUBLISHABLE SFB@1 measurement (numbers logged; the test only
 * pins that the instrument runs and stays in sane bounds — the VALUES go in
 * docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-snap-floor.md).
 */
import { describe, it, expect } from 'vitest';
import {
  measureExtractionError,
  measureSnapDisplacement,
  runSfbSnapFloorAudit,
} from './snapPlacementAudit';
import { solveParamRidgeByBisection } from './crestLateralDeviation';
import type { PositionSampler } from './metrics';
import type { FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';

const TAU = 2 * Math.PI;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Constant-radius cylinder wall (θ = TAU·u, z = t·H) — exact mm conversion. */
class CylinderSampler implements PositionSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
  ) {}

  position(u: number, t: number): readonly [number, number, number] {
    return [this.R0 * Math.cos(TAU * u), this.R0 * Math.sin(TAU * u), t * this.H];
  }
}

/** Uniform 2^level × 2^level quadtree (mirror of the FCT test helper). */
function uniformQuadtree(level: number): QuadtreeLike {
  const span = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < span; it++) {
    for (let iu = 0; iu < span; iu++) {
      leaves.push({ u0: iu / span, t0: it / span, level });
    }
  }
  return { leaves: () => leaves };
}

/** Synthetic ridge field: crest at u = uR(t), valley at uR(t) + 0.5. */
function ridgeField(uR: (t: number) => number): {
  value: (u: number, t: number) => number;
  periodicU: boolean;
} {
  return {
    value: (u: number, t: number): number => 1 + 0.2 * Math.cos(TAU * (u - uR(t))),
    periodicU: true,
  };
}

/** Polyline at u = uOf(t) over mid-row t positions of a level-L grid. */
function midRowLine(uOf: (t: number) => number, level: number, label: string): FeatureLine {
  const rows = 1 << level;
  const points = [];
  for (let k = 0; k < rows; k++) {
    const t = (k + 0.5) / rows;
    points.push({ u: uOf(t), t });
  }
  return { kind: 'general-curve', points, label };
}

// ── (1) Extraction channel — synthetic zero control ──────────────────────────

describe('measureExtractionError — synthetic controls', () => {
  it('S1: a polyline EXACTLY on a (diagonal) synthetic ridge reads ~0', () => {
    const uR = (t: number): number => 0.3 + 0.05 * t;
    const truth = solveParamRidgeByBisection(ridgeField(uR));
    const surface = new CylinderSampler(50, 100);
    const points = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      points.push({ u: uR(t), t });
    }
    const line: FeatureLine = { kind: 'general-curve', points, label: 'on-ridge' };
    const res = measureExtractionError([line], truth, surface);
    expect(res.totalPolylineVertices).toBe(33);
    expect(res.matchedVertexCount).toBe(33);
    expect(res.unmatchedVertexCount).toBe(0);
    // Truth root tolerance is duTol = 1e-6; the on-ridge polyline must read
    // within a few duTol in u and the mm conversion of that in mm.
    expect(res.maxU).toBeLessThan(5e-6);
    expect(res.maxMm).toBeLessThan(2e-3); // 5e-6 · 2π · 50 ≈ 1.6e-3
    expect(res.truthDuTol).toBe(1e-6);
  });

  // ── (2) Known lateral offset is recovered (max ≈ offset, tight tol) ──
  it('S2: a fixed lateral offset from a VERTICAL ridge is recovered in u and mm', () => {
    const duOff = 0.003;
    const uR = (): number => 0.3; // vertical ⇒ slope term 0 ⇒ exact mm expectation
    const truth = solveParamRidgeByBisection(ridgeField(uR));
    const R0 = 50;
    const surface = new CylinderSampler(R0, 100);
    const points = [];
    for (let i = 0; i <= 32; i++) {
      points.push({ u: 0.3 + duOff, t: i / 32 });
    }
    const line: FeatureLine = { kind: 'general-curve', points, label: 'offset' };
    const res = measureExtractionError([line], truth, surface);
    expect(res.matchedVertexCount).toBe(33);
    expect(Math.abs(res.maxU - duOff)).toBeLessThan(5e-5);
    expect(Math.abs(res.rmsU - duOff)).toBeLessThan(5e-5);
    // Vertical ridge on a cylinder: lateral mm = du · (dθ/du = TAU) · R0.
    const expectedMm = duOff * TAU * R0;
    expect(Math.abs(res.maxMm - expectedMm)).toBeLessThan(expectedMm * 0.02);
    expect(Math.abs(res.rmsMm - expectedMm)).toBeLessThan(expectedMm * 0.02);
    // Absolute counts only — no percent fields anywhere in the result.
    for (const k of Object.keys(res)) expect(k.toLowerCase()).not.toContain('percent');
  });
});

// ── (3)+(4) Snap channel — controls against the REAL FCT ────────────────────

describe('measureSnapDisplacement — real FCT insertion controls', () => {
  // Level-3 grid (8×8, B=0): cornerSnap = 0.06/8 = 7.5e-3 (production-law).
  const LEVEL = 3;
  const CORNER_SNAP = 0.06 / (1 << LEVEL);
  const R0 = 50;
  const H = 100;
  const surface = new CylinderSampler(R0, H);
  const config = { featureLevel: LEVEL, uBias: 0, cornerSnap: CORNER_SNAP };

  it('S3: vertices already ON a grid column are NOT displaced (unsnapped = total)', () => {
    const line = midRowLine(() => 0.25, LEVEL, 'on-column');
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(LEVEL), [line], {
      cornerSnap: CORNER_SNAP,
    });
    const res = measureSnapDisplacement(mesh, [line], surface, config);
    expect(res.totalInsertedVertices).toBe(8);
    expect(res.matchedCount).toBe(8);
    expect(res.unmatchedCount).toBe(0);
    expect(res.snappedCount).toBe(0);
    expect(res.unsnappedCount).toBe(8);
    // f32 storage floor only (≤ numericFloor ≈ 2e-6 in u/t).
    expect(res.maxAbsDu).toBeLessThanOrEqual(res.numericFloor);
    expect(res.maxAbsDt).toBeLessThanOrEqual(res.numericFloor);
    expect(res.maxLateralMm).toBeLessThan(1e-3);
  });

  it('S4: a vertex just inside cornerSnapU of a column is displaced by EXACTLY the offset', () => {
    // 0.4·cornerSnap inside the u=0.25 column, at mid-row t: the ONLY in-range
    // snap candidate is the u-edge (t-edges are sizeT/2 = 0.0625 ≫ cornerSnapT
    // away; anchors likewise) ⇒ snapToCellEdge's perpendicular projection
    // moves the vertex by exactly duOff in u and 0 in t (rule documented in
    // the file header, from FCT.ts:329-368 / :641-647).
    const duOff = 0.4 * CORNER_SNAP;
    const line = midRowLine(() => 0.25 + duOff, LEVEL, 'near-column');
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(LEVEL), [line], {
      cornerSnap: CORNER_SNAP,
    });
    const res = measureSnapDisplacement(mesh, [line], surface, config);
    expect(res.totalInsertedVertices).toBe(8);
    expect(res.matchedCount).toBe(8);
    expect(res.snappedCount).toBe(8);
    expect(res.unsnappedCount).toBe(0);
    expect(Math.abs(res.maxAbsDu - duOff)).toBeLessThan(1e-6);
    expect(res.maxAbsDt).toBeLessThan(1e-6);
    // The line is vertical on a cylinder (tangent = ẑ) ⇒ the whole azimuthal
    // displacement is lateral: chord ≈ R0 · TAU · duOff.
    const expectedMm = 2 * R0 * Math.sin(Math.PI * duOff);
    expect(Math.abs(res.maxLateralMm - expectedMm)).toBeLessThan(expectedMm * 0.01);
    // Config echo: the derived thresholds must match the FCT's law.
    expect(res.cornerSnapU).toBeCloseTo(CORNER_SNAP, 12);
    expect(res.cornerSnapT).toBeCloseTo(CORNER_SNAP, 12);
  });

  // ── (6) Channel separation: zero extraction error, nonzero snap ──
  it('S6: a perfectly-extracted ridge that the FCT snaps shows up ONLY in the snap channel', () => {
    const duOff = 0.4 * CORNER_SNAP; // ridge sits just inside cornerSnapU of u=0.25
    const uRidge = 0.25 + duOff;
    const truth = solveParamRidgeByBisection(ridgeField(() => uRidge));
    const line = midRowLine(() => uRidge, LEVEL, 'exact-but-snapped');

    // Channel A: the polyline IS the analytic ridge — extraction error ~0.
    const extraction = measureExtractionError([line], truth, surface);
    expect(extraction.matchedVertexCount).toBe(8);
    expect(extraction.maxU).toBeLessThan(1e-5);

    // Channel B: the REAL insertion snaps every vertex onto the column.
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(LEVEL), [line], {
      cornerSnap: CORNER_SNAP,
    });
    const snap = measureSnapDisplacement(mesh, [line], surface, config);
    expect(snap.snappedCount).toBe(8);
    expect(Math.abs(snap.maxAbsDu - duOff)).toBeLessThan(1e-6);

    // The displacement is visible ONLY in the snap channel (separation).
    expect(extraction.maxU).toBeLessThan(snap.maxAbsDu / 100);
  });
});

// ── (5) The publishable SFB@1 snap-floor measurement ─────────────────────────

describe('runSfbSnapFloorAudit — SFB@1 production-config audit (publishable)', () => {
  it(
    'S5: real extractor + real FCT at featureLevel 7 / B=2 — instrument runs, numbers logged',
    { timeout: 240_000 },
    () => {
      const res = runSfbSnapFloorAudit();

      // Config pins (production law: ConformingWall.ts:539 + WatertightAssembly cap).
      expect(res.config.featureLevel).toBe(7);
      expect(res.config.uBias).toBe(2);
      expect(res.config.cornerSnap).toBeCloseTo(0.06 / 128, 12);
      expect(res.snap.cornerSnapU).toBeCloseTo(0.06 / 128 / 4, 12);
      expect(res.config.insertedLineCount).toBeGreaterThanOrEqual(12);

      // Channel A sanity: nonzero counts, finite, mm bounded (5mm guard).
      expect(res.extraction.totalPolylineVertices).toBeGreaterThan(100);
      expect(res.extraction.matchedVertexCount).toBeGreaterThan(0);
      expect(Number.isFinite(res.extraction.maxU)).toBe(true);
      expect(Number.isFinite(res.extraction.rmsMm)).toBe(true);
      expect(res.extraction.maxMm).toBeGreaterThan(0);
      expect(res.extraction.maxMm).toBeLessThan(5);

      // Channel B sanity: real snapping occurred, finite, mm bounded.
      expect(res.snap.totalInsertedVertices).toBeGreaterThan(100);
      expect(res.snap.matchedCount).toBeGreaterThan(0);
      expect(res.snap.snappedCount).toBeGreaterThan(0);
      expect(Number.isFinite(res.snap.maxLateralMm)).toBe(true);
      expect(res.snap.maxLateralMm).toBeGreaterThan(0);
      expect(res.snap.maxLateralMm).toBeLessThan(5);

      // The implied placement floor (blueprint: gates at max(0.02, floor)).
      expect(res.impliedPlacementFloorMm).toBeGreaterThanOrEqual(0.02);

      // ── Publish: the values go into stage2-snap-floor.md, not assertions ──
      const e = res.extraction;
      const s = res.snap;
      console.log('[Stage2b] SFB@1 snap-floor audit (featureLevel=7, B=2, cornerSnap=4.6875e-4):');
      console.log(
        `[Stage2b] (A) extraction: verts=${e.totalPolylineVertices} matched=${e.matchedVertexCount} ` +
          `unmatched=${e.unmatchedVertexCount} maxU=${e.maxU.toExponential(3)} rmsU=${e.rmsU.toExponential(3)} ` +
          `maxMm=${e.maxMm.toFixed(4)} rmsMm=${e.rmsMm.toFixed(4)} worst=${e.worstBranchLabel} ` +
          `truthDuTol=${e.truthDuTol}`,
      );
      for (const b of e.branches) {
        if (b.matchedVertexCount === 0) continue;
        console.log(
          `[Stage2b]     ${b.label} (${b.kind}): n=${b.matchedVertexCount} ` +
            `maxU=${b.maxU.toExponential(3)} maxMm=${b.maxMm.toFixed(4)} rmsMm=${b.rmsMm.toFixed(4)}`,
        );
      }
      console.log(
        `[Stage2b] (B) snap: inserted=${s.totalInsertedVertices} matched=${s.matchedCount} ` +
          `unmatched=${s.unmatchedCount} snapped=${s.snappedCount} (u:${s.snappedInUCount} ` +
          `t:${s.snappedInTCount}) unsnapped=${s.unsnappedCount} ` +
          `maxDu=${s.maxAbsDu.toExponential(3)} maxDt=${s.maxAbsDt.toExponential(3)} ` +
          `rmsDu=${s.rmsDu.toExponential(3)} maxLatMm=${s.maxLateralMm.toFixed(4)} ` +
          `rmsLatMm=${s.rmsLateralMm.toFixed(4)}`,
      );
      if (s.worst) {
        console.log(
          `[Stage2b]     worst vertex: (u=${s.worst.u.toFixed(6)}, t=${s.worst.t.toFixed(6)}) ` +
            `du=${s.worst.du.toExponential(3)} dt=${s.worst.dt.toExponential(3)} ` +
            `lat=${s.worst.lateralMm.toFixed(4)}mm`,
        );
      }
      console.log(
        `[Stage2b] implied placement floor = max(0.02, ${s.maxLateralMm.toFixed(4)}) = ` +
          `${res.impliedPlacementFloorMm.toFixed(4)} mm`,
      );
    },
  );
});

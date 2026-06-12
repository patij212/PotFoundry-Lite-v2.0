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
 *
 * Tests S7a/S7b pin the house nonFiniteCount loudness pattern (NaN data is
 * REJECTED with an absolute count, never silently matched or vanished); S8/S9
 * cover the periodic u-seam matching path (bucket shift probes + sdU wrap),
 * unmatchedCount > 0, and a non-default searchRadiusScale; S10 pins
 * sharedOutputMatchCount (NN aliasing visibility).
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
      // RE-FREEZE TRIPWIRE — this pins PRE-Stage-4 production behavior on
      // purpose: it WILL fail when Stage-4 exact placement (along-crest slide
      // + analytic crest×grid-line intersections) lands and snapping stops.
      // That failure is the signal to re-run this audit and re-freeze the
      // floor in stage2-snap-floor.md.
      expect(res.snap.snappedCount).toBeGreaterThan(0);
      expect(Number.isFinite(res.snap.maxLateralMm)).toBe(true);
      expect(res.snap.maxLateralMm).toBeGreaterThan(0);
      expect(res.snap.maxLateralMm).toBeLessThan(5);

      // NaN loudness + NN aliasing: a clean production run has zero non-finite
      // rejects on both channels and zero shared-output (aliased) matches.
      expect(res.extraction.nonFiniteCount).toBe(0);
      expect(res.snap.nonFiniteCount).toBe(0);
      expect(res.snap.sharedOutputMatchCount).toBe(0);

      // The implied placement floor is the max of the blueprint 0.02mm minimum
      // and BOTH channels — post-Stage-4 the snap term may collapse below the
      // extraction error, and the floor must not understate it.
      expect(res.impliedPlacementFloorMm).toBe(
        Math.max(0.02, res.extraction.maxMm, res.snap.maxLateralMm),
      );

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
        `[Stage2b] implied placement floor = max(0.02, extraction ${e.maxMm.toFixed(4)}, ` +
          `snap ${s.maxLateralMm.toFixed(4)}) = ${res.impliedPlacementFloorMm.toFixed(4)} mm`,
      );
    },
  );
});

// ── (7) Non-finite loudness — the house nonFiniteCount pattern ───────────────

describe('non-finite loudness — NaN data is rejected LOUDLY, never silently', () => {
  const R0 = 50;
  const H = 100;
  const surface = new CylinderSampler(R0, H);

  it('S7a: NaN polyline vertices are REJECTED with a count, not silently matched (channel A)', () => {
    // Vertical ridge + fixed offset (the S2 setup) so the unpoisoned data has
    // an exact expectation: maxU ≈ rmsU ≈ duOff.
    const duOff = 0.003;
    const truth = solveParamRidgeByBisection(ridgeField(() => 0.3));
    const points = [];
    for (let i = 0; i <= 32; i++) {
      points.push({ u: 0.3 + duOff, t: i / 32 });
    }
    // Poison TWO vertices — one NaN u, one NaN t. Unguarded, a NaN vertex
    // PASSES the branch-domain check (NaN comparisons are false), captures a
    // match, and poisons rms while maxU/maxMm stay silently clean.
    points[7] = { u: Number.NaN, t: points[7].t };
    points[20] = { u: points[20].u, t: Number.NaN };
    const line: FeatureLine = { kind: 'general-curve', points, label: 'poisoned' };
    const res = measureExtractionError([line], truth, surface);
    expect(res.nonFiniteCount).toBe(2);
    expect(Number.isFinite(res.nonFiniteCount)).toBe(true);
    expect(res.totalPolylineVertices).toBe(33);
    expect(res.matchedVertexCount).toBe(31);
    // NaN is a REJECT class, not coverage loss — unmatched stays 0.
    expect(res.unmatchedVertexCount).toBe(0);
    // The unpoisoned data still reads correctly and stays finite.
    expect(Number.isFinite(res.rmsU)).toBe(true);
    expect(Number.isFinite(res.rmsMm)).toBe(true);
    expect(Math.abs(res.maxU - duOff)).toBeLessThan(5e-5);
    expect(Math.abs(res.rmsU - duOff)).toBeLessThan(5e-5);
    const expectedMm = duOff * TAU * R0;
    expect(Math.abs(res.maxMm - expectedMm)).toBeLessThan(expectedMm * 0.02);
  });

  it('S7b: a NaN OUTPUT mesh vertex is COUNTED, not vanished into a NaN bucket (channel B)', () => {
    const LEVEL = 3;
    const CORNER_SNAP = 0.06 / (1 << LEVEL);
    const config = { featureLevel: LEVEL, uBias: 0, cornerSnap: CORNER_SNAP };
    const line = midRowLine(() => 0.25, LEVEL, 'on-column');
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(LEVEL), [line], {
      cornerSnap: CORNER_SNAP,
    });
    // Poison ONE output vertex that is NOT a feature-vertex image (a grid
    // corner near u=0.75, far from the inserted u=0.25 column) so the matching
    // set itself is untouched and S3's expectations still hold exactly.
    const verts = Float32Array.from(mesh.vertices);
    let poisoned = -1;
    for (let i = 0; i < verts.length / 3; i++) {
      if (Math.abs(verts[i * 3] - 0.75) < 1e-6 && Math.abs(verts[i * 3 + 1] - 0.5) < 1e-6) {
        poisoned = i;
        break;
      }
    }
    expect(poisoned).toBeGreaterThanOrEqual(0);
    verts[poisoned * 3] = Number.NaN;
    const res = measureSnapDisplacement({ vertices: verts }, [line], surface, config);
    expect(res.nonFiniteCount).toBe(1);
    expect(Number.isFinite(res.nonFiniteCount)).toBe(true);
    // The unpoisoned data still reads exactly like S3 (on-column, unsnapped).
    expect(res.totalInsertedVertices).toBe(8);
    expect(res.matchedCount).toBe(8);
    expect(res.unmatchedCount).toBe(0);
    expect(res.snappedCount).toBe(0);
    expect(res.maxAbsDu).toBeLessThanOrEqual(res.numericFloor);
    expect(Number.isFinite(res.rmsDu)).toBe(true);
    expect(Number.isFinite(res.maxLateralMm)).toBe(true);
    expect(res.maxLateralMm).toBeLessThan(1e-3);
  });
});

// ── (8) Periodic seam matching, unmatched coverage, search-radius options ────

describe('measureSnapDisplacement — periodic seam + search-box options', () => {
  const R0 = 50;
  const H = 100;
  const surface = new CylinderSampler(R0, H);

  it('S8: a feature line hugging u≈1 on the periodic grid matches across the seam (small du)', () => {
    const LEVEL = 3;
    const CORNER_SNAP = 0.06 / (1 << LEVEL);
    const config = { featureLevel: LEVEL, uBias: 0, cornerSnap: CORNER_SNAP };
    // 0.4·cornerSnap inside the seam column u=1: snapToCellEdge snaps onto the
    // u=1 edge, which the triangulator stores COLLAPSED onto the u=0 column
    // (QuadtreeMesh seam contract) — the matcher must find it across the wrap
    // with |du| = the small offset, never ~1 or unmatched.
    const duOff = 0.4 * CORNER_SNAP;
    const line = midRowLine(() => 1 - duOff, LEVEL, 'seam-hugging');
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(LEVEL), [line], {
      cornerSnap: CORNER_SNAP,
    });
    const res = measureSnapDisplacement(mesh, [line], surface, config);
    expect(res.totalInsertedVertices).toBe(8);
    expect(res.matchedCount).toBe(8);
    expect(res.unmatchedCount).toBe(0);
    expect(res.snappedCount).toBe(8);
    expect(Math.abs(res.maxAbsDu - duOff)).toBeLessThan(1e-6);
    expect(res.maxAbsDt).toBeLessThan(1e-6);
  });

  it('S9: synthetic wrap match at u≈0/1 + an unmatched far vertex + non-default searchRadiusScale', () => {
    const CORNER_SNAP = 0.0075;
    const config = { featureLevel: 3, uBias: 0, cornerSnap: CORNER_SNAP };
    // ONE output vertex just above u=0; input vertex just below u=1 — only the
    // shift∈{−1,+1} bucket probes + sdU wrap can match it (du = 1e-3 across
    // the seam, NOT 0.999). The second input is far from ANY output ⇒ the
    // unmatchedCount>0 path. searchRadiusScale=2 (non-default) must be echoed
    // in the derived box.
    const mesh = { vertices: new Float32Array([0.0005, 0.5, 0]) };
    const line: FeatureLine = {
      kind: 'general-curve',
      points: [
        { u: 0.9995, t: 0.5 },
        { u: 0.5, t: 0.5 },
      ],
      label: 'wrap+far',
    };
    const res = measureSnapDisplacement(mesh, [line], surface, config, { searchRadiusScale: 2 });
    expect(res.searchRadiusU).toBeCloseTo(2 * CORNER_SNAP, 12);
    expect(res.searchRadiusT).toBeCloseTo(2 * CORNER_SNAP, 12);
    expect(res.totalInsertedVertices).toBe(2);
    expect(res.matchedCount).toBe(1);
    expect(res.unmatchedCount).toBe(1);
    expect(res.snappedCount).toBe(1);
    expect(Math.abs(res.maxAbsDu - 0.001)).toBeLessThan(1e-7);
    expect(res.maxAbsDt).toBeLessThan(1e-12);
  });

  it('S10: two inputs claiming one output vertex beyond the floor read as sharedOutputMatchCount', () => {
    const CORNER_SNAP = 0.0075;
    const config = { featureLevel: 3, uBias: 0, cornerSnap: CORNER_SNAP };
    // One output; two inputs inside its box — one exact (a legitimate weld
    // image), one displaced 2e-4 ≫ numericFloor (the CDT-dropped-vertex
    // aliasing shape). The counter must make the aliasing visible.
    const mesh = { vertices: new Float32Array([0.25, 0.5, 0]) };
    const line: FeatureLine = {
      kind: 'general-curve',
      points: [
        { u: 0.25, t: 0.5 },
        { u: 0.2502, t: 0.5 },
      ],
      label: 'aliased',
    };
    const res = measureSnapDisplacement(mesh, [line], surface, config);
    expect(res.matchedCount).toBe(2);
    expect(res.unmatchedCount).toBe(0);
    expect(res.sharedOutputMatchCount).toBe(1);
  });
});

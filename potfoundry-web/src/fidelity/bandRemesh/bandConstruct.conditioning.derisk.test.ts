/**
 * bandConstruct.conditioning.derisk.test.ts — FEASIBILITY probe for the
 * "upstream conditioning fix" direction (chosen after the corner-split gate showed
 * full-width full-coverage is refuted on dense lattices).
 *
 * The gate found genuine sharp corners spaced 1.7–4.0mm apart (< full band width
 * 5mm). The proposed fix: strengthen the featureGraph conditioner so genuine corners
 * become sparse enough for a full-width band — UNDER the hard fidelity constraint
 * (dense-truth recall/precision ≥ 0.9). This probe measures, BEFORE building anything,
 * whether that is feasible:
 *
 *   1. STRONGER SIMPLIFY sweep — conditionGraph at simplifyTolMm ∈ {0.5 … 2.5}, with
 *      recall/precision (fidelity gate) AND paveRidgeCornerSplit FULL-WIDTH coverage.
 *      If coverage rises to ~full WHILE recall/precision ≥ 0.9 → simplify is the lever.
 *   2. RELIEF vs KINK discriminator — per conditioned edge, count curvature corners in
 *      3D metric (relief + kinks; what the offset actually folds on) vs FLAT (u,t)-mm
 *      metric (polyline kinks only). If 3D ≫ flat, the curvature is RELIEF (the ridge
 *      riding over the pot's 3D relief) — re-introduced by densify regardless of
 *      polyline simplification ⇒ conditioning CANNOT fix full-width. If 3D ≈ flat,
 *      it is polyline wiggle ⇒ stronger simplify CAN.
 *
 * ── MEASURED VERDICT (2026-06-26) ────────────────────────────────────────────────
 * The conditioning (simplification) lever is REFUTED for full width. Stronger DP
 * simplification up to the fidelity limit (recall/precision stay ≥0.9 where raw
 * passes) lifts full-width(5mm) coverage only MARGINALLY: Voronoi 43→52%, Gyroid
 * 45→51%, Hex 67→76%. The discriminator explains why: 3D curvature corners
 * (2.6–4.1/edge) ≫ FLAT (u,t)-metric corners (0.5–1.6/edge). Simplify removes the
 * polyline KINKS (flat → ~0.5/edge) but the dominant fold-inducing curvature is 3D
 * RELIEF — the ridge crest bending over the pot's own relief, which `densify`
 * re-introduces from the curved 3D surface no matter how clean the polyline is. ⇒ a
 * 5mm band is wider than the surface's relief curvature radius; NO polyline
 * conditioning can make a full-width offset stop folding on intrinsic 3D relief.
 * The corner-spacing majority is fixable ONLY by a feature-SIZED (smaller) width
 * (relief radius sets the max usable half-width; the width sweep gave 81–88% at
 * 0.6mm). The self-touch-edge split (the topological half of conditioning) remains
 * worthwhile but addresses only the ~15% near-self-touch residual, not the relief.
 * (Gyroid precision 0.61 is a pre-existing RAW detector property, not a simplify
 * regression — its raw is already <gate on precision.)
 *
 * CPU throwaway spike (real detector pipeline + dense truth → heavy). No production
 * code. Skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/bandConstruct.conditioning.derisk.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { conditionGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { ConditionGraphOptions, ConditionedGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import { denseFeatureGroundTruth } from '../../renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import type { FeatureLine } from '../../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { fidelity } from '../../renderers/webgpu/parametric/conforming/featureGraph/fidelityMetric';
import type { UtPoint } from '../../renderers/webgpu/parametric/conforming/featureGraph/fidelityMetric';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { paveRidgeCornerSplit, footprintSelfCrossings, measureSpineCurvatureRadius } from './bandConstruct';
import { densifyRail } from './stitch';
import type { StationPoint } from './stations';

// ── Real-pipeline config (verbatim from the fidelity gate) ──────────────────────

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;
const FINE_RES = 120;
const CAL_TOL = U_TO_MM / FINE_RES; // ≈ 1.83 mm (the fidelity match tolerance)
const TRUTH_RES = 384;
const GATE = 0.9;
const STYLES = ['Voronoi', 'GyroidManifold', 'HexagonalHive'] as const;

const WIDTH_MM = 2.5; // half-width (full band = 5mm) — the spec'd full width
const EDGE_MM = 2.0;
const MIN_LEN_MM = 8;

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40, fineRes: FINE_RES, minStrength: 1.0, minAngleDeg: 28,
  uToMm: U_TO_MM, tToMm: T_TO_MM, creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};
const RELIEF_MEAN_SAMPLES = 256, RELIEF_ALPHA = 0.5, RELIEF_ABS_FLOOR_MM = 1e-3;
function samplerRadius(s: SurfaceSampler, u: number, t: number): number { const [x, y] = s.position(u, t); return Math.hypot(x, y); }
function makeReliefIndicator(s: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t); if (cached !== undefined) return cached;
    let sum = 0; const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const r = samplerRadius(s, i / RELIEF_MEAN_SAMPLES, t); rs[i] = r; sum += r; }
    const mean = sum / RELIEF_MEAN_SAMPLES; let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const d = rs[i] - mean; sq += d * d; }
    const stats = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * Math.sqrt(sq / RELIEF_MEAN_SAMPLES)) };
    rowStats.set(t, stats); return stats;
  };
  return (u, t) => { const { mean, floor } = statsAtT(t); return Math.abs(samplerRadius(s, u, t) - mean) - floor; };
}
function condOpts(simplifyTolMm: number): ConditionGraphOptions {
  return { uToMm: U_TO_MM, tToMm: T_TO_MM, minFeatureMm: 2.5, junctionMergeMm: 2.5, simplifyTolMm, prune: false, simplify: true, mergeJunctions: true };
}

// ── Curvature corner counts: 3D metric vs FLAT (u,t)-mm metric ──────────────────

/** Menger curvature radius (mm) of three points in FLAT (u,t)→mm coordinates. */
function flatCurvatureRadius(spine: StationPoint[]): number[] {
  const xy = spine.map((p) => [p.u * U_TO_MM, p.t * T_TO_MM] as [number, number]);
  const out = new Array<number>(spine.length).fill(Infinity);
  for (let i = 1; i < spine.length - 1; i++) {
    const A = xy[i - 1], B = xy[i], C = xy[i + 1];
    const ab = Math.hypot(A[0] - B[0], A[1] - B[1]);
    const bc = Math.hypot(B[0] - C[0], B[1] - C[1]);
    const ca = Math.hypot(C[0] - A[0], C[1] - A[1]);
    const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
    out[i] = area > 1e-12 ? (ab * bc * ca) / (4 * area) : Infinity;
  }
  return out;
}
function countCornersBelow(radius: number[], thr: number): number {
  let n = 0;
  for (let i = 1; i < radius.length - 1; i++) if (radius[i] < thr && radius[i] <= radius[i - 1] && radius[i] <= radius[i + 1]) n++;
  return n;
}

interface StyleData { sampler: SurfaceSampler; raw: ReturnType<typeof detectFeatures>; truth: FeatureLine[]; }
const data = new Map<string, StyleData>();
function getData(style: string): StyleData {
  let d = data.get(style);
  if (!d) {
    const sampler = styleSampler(style as Parameters<typeof styleSampler>[0], {}, DIMS);
    const raw = detectFeatures(sampler, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) });
    const truth = denseFeatureGroundTruth(sampler, { res: TRUTH_RES, uToMm: U_TO_MM, tToMm: T_TO_MM });
    d = { sampler, raw, truth };
    data.set(style, d);
  }
  return d;
}

function polyLenMm(poly: ReadonlyArray<{ u: number; t: number }>): number {
  let s = 0;
  for (let i = 1; i < poly.length; i++) s += Math.hypot(((poly[i].u - poly[i - 1].u + 0.5) % 1 - 0.5) * U_TO_MM, (poly[i].t - poly[i - 1].t) * T_TO_MM);
  return s;
}
const U_LO = 0.1, U_HI = 0.9, T_LO = 0.1, T_HI = 0.9;
function interiorLongEdges(cond: ConditionedGraph): StationPoint[][] {
  return cond.edges
    .filter((e) => e.kind !== 'loop' && e.polyline.every((p) => p.u >= U_LO && p.u <= U_HI && p.t >= T_LO && p.t <= T_HI) && polyLenMm(e.polyline) >= MIN_LEN_MM)
    .map((e) => e.polyline.map((p) => ({ u: p.u, t: p.t })));
}

const edgePolys = (edges: ReadonlyArray<{ polyline: UtPoint[] }>): UtPoint[][] => edges.map((e) => e.polyline);
const truthPolys = (t: FeatureLine[]): UtPoint[][] => t.map((l) => l.points);

// ── THE PROBE ───────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.PF_DERISK)('CONDITIONING FEASIBILITY — can stronger conditioning rescue full-width coverage?', () => {
  beforeAll(() => { for (const s of STYLES) getData(s); }, 180000);

  for (const style of STYLES) {
    it(`${style}: simplify-tolerance sweep — fidelity (recall/precision) vs full-width coverage`, () => {
      const { sampler, raw, truth } = getData(style);
      /* eslint-disable no-console */
      console.log(`\n[FEAS ${style}] simplifyTol | recall/prec (gate ${GATE}) | fullWidth(${2 * WIDTH_MM}mm) simple/total | corners/edge 3D vs flat`);
      for (const tol of [0.5, 1.0, 1.5, CAL_TOL, 2.5]) {
        const cond = conditionGraph(raw, condOpts(tol));
        const f = fidelity(truthPolys(truth), edgePolys(cond.edges), U_TO_MM, T_TO_MM, CAL_TOL);
        const edges = interiorLongEdges(cond);
        let simple = 0, total = 0, corners3D = 0, cornersFlat = 0, pts = 0;
        const maxSpacingMm = (EDGE_MM / 2) * 0.95;
        for (const spine of edges) {
          total++;
          try {
            const band = paveRidgeCornerSplit(spine, sampler, { widthMm: WIDTH_MM, edgeMm: EDGE_MM });
            if (footprintSelfCrossings(band.mesh, band.vertexUT) === 0) simple++;
          } catch { /* throw counts as not-simple */ }
          const dense = densifyRail(spine, sampler, maxSpacingMm);
          corners3D += countCornersBelow(measureSpineCurvatureRadius(dense, sampler), WIDTH_MM);
          cornersFlat += countCornersBelow(flatCurvatureRadius(dense), WIDTH_MM);
          pts += dense.length;
        }
        const fidFlag = f.recall >= GATE && f.precision >= GATE ? 'ok ' : '<GATE';
        console.log(
          `  tol=${tol.toFixed(2)}mm | ${f.recall.toFixed(3)}/${f.precision.toFixed(3)} ${fidFlag} | ` +
            `${simple}/${total} (${total ? ((100 * simple) / total).toFixed(0) : 0}%) | ` +
            `3D=${(corners3D / Math.max(1, total)).toFixed(1)} flat=${(cornersFlat / Math.max(1, total)).toFixed(1)} per edge`,
        );
      }
      console.log(`  READ: if simple% rises to ~100 while recall/prec stay ≥${GATE} → simplify is the lever. If 3D≫flat → curvature is RELIEF (densify re-introduces it; conditioning can't fix full-width).`);
      /* eslint-enable no-console */
      // VERDICT: at the strongest fidelity-safe simplify, full-width coverage is still
      // well below full AND 3D corners dominate flat — the relief refutation (see header).
      const condMax = conditionGraph(raw, condOpts(CAL_TOL));
      const edgesMax = interiorLongEdges(condMax);
      let simpleMax = 0, c3D = 0, cFlat = 0;
      const maxSpacingMm = (EDGE_MM / 2) * 0.95;
      for (const spine of edgesMax) {
        try { const b = paveRidgeCornerSplit(spine, sampler, { widthMm: WIDTH_MM, edgeMm: EDGE_MM }); if (footprintSelfCrossings(b.mesh, b.vertexUT) === 0) simpleMax++; } catch { /* not simple */ }
        const dense = densifyRail(spine, sampler, maxSpacingMm);
        c3D += countCornersBelow(measureSpineCurvatureRadius(dense, sampler), WIDTH_MM);
        cFlat += countCornersBelow(flatCurvatureRadius(dense), WIDTH_MM);
      }
      expect(simpleMax).toBeLessThan(0.9 * edgesMax.length); // full-width NOT rescued by simplify
      expect(c3D).toBeGreaterThan(cFlat); // relief (3D) dominates polyline kinks (flat)
    }, 120000);
  }
});

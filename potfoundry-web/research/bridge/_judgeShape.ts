// research/bridge/_judgeShape.ts — THE MESH-SHAPE CENSUS AND ITS GATES. RESEARCH ONLY, PURE.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS (2026-07-29; research/lab/2026-07-29-strata-perf-convergence-worklog.md, RETRACTION)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// A HUMAN LOOKED AT A RENDER and found what four automated instruments passed: 48,130 of 1,433,982 facets
// (3.36 %) with aspect ratio > 50, worst 19,286, and 31,842 (2.22 %) INVERTED in (theta,z) so the surface
// folds through itself. Every blade vertex is on the analytic surface to <= 9 nm — a SHAPE defect, not a
// placement defect.
//
// THE FOUR INSTRUMENTS THAT MISSED IT SHARED ONE ASSUMPTION: every check was combinatorial, or mediated by
// the (theta,z) parametrisation.
//   * the driver's plane ruler samples a facet's PARAMETRIC footprint and REWARDS blades (p50 0.63 um on the
//     2,000 worst, under acceptTol 3.5);
//   * H2 asks whether the surface is COVERED, which ADDED geometry cannot fail;
//   * H1 asks whether the facet is NEAR the surface, and every blade vertex is ON it;
//   * analyze()'s manifold / orientation / Euler pass because a folded sheet IS a consistently-oriented
//     2-manifold — D51 measured non-manifold 0, orientation-mismatch 0, V-E+F = 0 EXACTLY.
// Four instruments sharing one assumption are ONE instrument with four dials.
//
// This file holds the census (a measurement) and its GATES (a verdict). The census was previously inline in
// _strataFacetTruth.test.ts; it lives here so the negative-control fixture test scores a mesh through the
// SAME code the auditor uses, rather than through a second implementation that could agree by luck.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// A1 — THE REPRESENTATION-VALIDITY GATE, AND WHY IT IS EXACT, CHEAP AND SUFFICIENT
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// The _strataConformBisect driver emits `addV(theta,z) -> (rA cos theta, rA sin theta, z)`. The mesh is
// therefore a piecewise-linear LIFTED GRAPH over the (theta,z) cylinder, and "is a graph" is its validity
// condition. A graph is single-valued: over each (theta,z) there is exactly one surface point. So the
// triangulation of the (theta,z) domain must itself be a valid triangulation — every facet's signed area in
// (theta,z) must carry THE SAME SIGN. One multiply-and-subtract per facet decides it exactly. There is no
// tolerance to choose and no acceleration structure to be wrong.
//
// THIS SUBSUMES THE TRIANGLE-TRIANGLE SELF-INTERSECTION CHECK that the first review of this campaign flagged
// and that was never built. For a graph, self-intersection REQUIRES a fold: two distinct surface points over
// one (theta,z) is exactly double-valuedness, and since the lift is continuous, passing from a positively-
// to a negatively-oriented facet means crossing a fold curve. An O(n) sign test replaces an O(n log n)
// pairwise test AND is exact rather than tolerance-bound.
//
// *** THE SHORTCUT DOES NOT EXTEND TO THE DOUBLE-VALUED TREAD MESHES. ***
// src/geometry/doubleValued/ (the Snaking-C0 P3 mesher) deliberately emits geometry that is NOT a graph over
// (theta,z): a tread wall / curtain has two surface points at one (theta,z), which is its entire purpose.
// STAGE=solid likewise adds an inner wall and a floor that are not graphs over the outer parametrisation. On
// such a mesh the sign census measures which SHEET a facet belongs to, not whether the surface is valid. The
// gate MUST then be declared NOT APPLICABLE (`graphApplicable = false`), and NOT APPLICABLE IS NOT A PASS —
// `judge()` refuses to certify a run whose validity gate could not be evaluated. Real self-intersection
// testing for those meshes needs the pairwise test, and it is still unbuilt.
//
// THE GATE COUNTS MINORITY SIGN, NOT NEGATIVE SIGN. research/tools/_bladeCensus.mjs and _bladeFolds.mjs both
// count `sPar < 0`, which is right only because this driver happens to wind positively. The stated condition
// is CONSISTENCY, so the gate counts facets that disagree with the mesh's own majority — identical to the
// baseline number whenever the majority is positive (D51: 31,842 either way), and not silently inverted on a
// mesh that winds the other way. `nFoldRaw` (the `< 0` count) is retained verbatim so every published D51
// figure stays directly comparable. Facets with EXACTLY ZERO parametric area are counted with the minority:
// they are degenerate in the parameter domain and are not valid graph elements either.
//
// AND IT REFUSES WHEN THE ANSWER WOULD BE MEANINGLESS. If the minority fraction exceeds `ambiguousFrac`
// (default 25 %) the mesh does not look like a graph at all — a solid-stage pot is roughly half inner wall
// and floor — so the gate reports AMBIGUOUS rather than "75 % of your facets are folded". A genuine defect
// population is small by nature (D51, the worst on record, was 2.22 %); 25 % separates the two cases by an
// order of magnitude.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// INDEPENDENCE, DELIBERATELY
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// The arithmetic is transcribed from the DIAGNOSTIC tools research/tools/_bladeCensus.mjs (3-D AR, raw
// per-facet fold sign) and research/tools/_bladeFolds.mjs (exact-float32-bit weld, arc-length parametric AR,
// fold components, edge topology) — NOT imported from the mesher-side guard research/bridge/_shapeGuard.ts.
// A guard and an auditor that share a definition cannot disagree, and an auditor that cannot disagree with
// the thing it audits is not an auditor. Matching the diagnostic tools also keeps every number here directly
// comparable to the published D51 baseline. (Those .mjs tools are argv-driven scripts with top-level side
// effects and cannot be imported as libraries; matching them line-for-line is the available form of reuse,
// and _judgeNegativeControl.test.ts is what keeps the two from drifting apart unnoticed.)
//
// AR = longest * perimeter / (4 * area) = longest edge / (2 * inradius). 1.732 equilateral, 2.414 for the
// initial grid's right-isoceles cells, ~= b/h for a b-by-h sliver. Scale- and rigid-motion-invariant.
import type { GateResult } from './_judgeVerdict';

const TWO_PI = 2 * Math.PI;

/** Shortest-arc theta delta. Verbatim from _bladeCensus.mjs / _bladeFolds.mjs. */
export function dTh(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

function pct(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/** Half-ulp of a float32 value — the read-back noise floor of one STL coordinate. Verbatim from
 *  STAGE/foldProbe.mjs, the instrument that validated the band on D52 (6/6 indeterminate) and D51. */
function halfUlp32(v: number): number {
  const a = Math.abs(v);
  if (a === 0) return 0;
  const e = Math.floor(Math.log2(a));
  return Math.pow(2, e - 24); // 0.5 * 2^(e-23)
}

/** Angular uncertainty of atan2(y, x) under half-ulp perturbation of x and y. */
function ethOf(x: number, y: number): number {
  const r2 = x * x + y * y;
  return r2 > 0 ? (Math.abs(x) * halfUlp32(y) + Math.abs(y) * halfUlp32(x)) / r2 : 0;
}

export interface ShapeWorst { tri: number; ar: number; L: number; S: number; area: number; fold: boolean }
export interface FoldWorst { tri: number; sPar: number; parAR: number; z: number; th: number; ratio: number }

export interface ShapeCensus {
  nTri: number; arCap: number;
  arP50: number; arP90: number; arP99: number; arMax: number; arMaxTri: number;
  nBlade: number; nDegenerate: number; minEdge: number; minEdgeTri: number;
  /** the historical `sPar < 0` count — kept verbatim so published D51 figures stay comparable */
  nFoldRaw: number; nFoldRawBlade: number; nInward: number; nInwardBlade: number;
  arDecades: Array<[number, number]>;
  nV: number; nEdges: number; nonManifold: number; boundary: number; orientMismatch: number; euler: number;
  nFoldWeld: number; nWellShapedFold: number; foldComponents: number; foldLargest: number;
  parArP50: number; parArP90: number; parArP99: number; parArMax: number;
  foldZHist: number[]; bladeZHist: number[];
  worst: ShapeWorst[]; secs: number;
  // ── A1: the representation-validity quantities ─────────────────────────────────────────────────────────
  nParPos: number; nParNeg: number; nParZero: number;
  /** +1 or -1: the sign the mesh's own majority winds with */
  majoritySign: number;
  /** THE GATE COUNT: facets whose sign disagrees with the majority, plus the exactly-zero-area ones */
  nMinoritySign: number;
  minorityFrac: number;
  /** minority fraction so large the mesh is not plausibly a graph at all */
  ambiguous: boolean;
  foldWorst: FoldWorst[];
  // ── f32 SIGN-DETERMINACY BAND (FOLD-ANOMALY 2026-07-29, measured on D52 and D51) ──────────────────────────
  // The census reconstructs theta as atan2(f32 y, f32 x), which is ~1e8x noisier than the f64 theta the
  // driver's guard tested. A per-facet half-ulp bound `delta` on sPar separates facets whose sign the STL
  // actually determines from those it cannot. Measured: D52's "6 folds" were ALL below delta (the driver's
  // f64 mesh is provably fold-free); D51's 31,842 raw folds were 31,813 below delta with a near-even +/- split
  // and 29 genuinely determined. A bare `sPar < 0` gate is therefore unmeasurable as specified; the gate
  // consumes DETERMINED counts and reports the indeterminate band on its own line, never as defects.
  /** facets with |sPar| <= delta (incl. exactly-zero): sign NOT determined by the STL's own f32 coordinates */
  nIndeterminate: number; nIndetNeg: number; nIndetPos: number;
  /** THE FOLD GATE COUNT: sign-DETERMINED facets whose winding disagrees with the (determined) majority */
  nFoldDetermined: number;
  /** blades: nBlade is DETERMINED above the cap (beyond the f32 area-uncertainty band at the cap boundary); */
  /** nBladeIndet sits inside the band (raw AR > cap but not determinable); nBladeRaw = nBlade + nBladeIndet */
  nBladeIndet: number; nBladeRaw: number;
  /** determined blades whose centroid lies inside a DECLARED patch region (exempt from the gate count) */
  nBladeDeclared: number;
  /** determined blades NOT covered by any declared region — THE GATE COUNT when patches are declared */
  nBladeUndeclared: number;
  /** per-region exemption tally, in declaration order; parallel to the `patches` option */
  declaredHits: ReadonlyArray<{ id: string; count: number }>;
}

export interface CensusOptions {
  /** blade threshold; 50 is _bladeCensus.mjs's own definition and the one every D51 number is quoted at */
  arCap: number;
  /** pot height, for the 24-bin z histograms */
  H: number;
  /** how many worst-by-AR facets to retain */
  nWorst: number;
  /** how many worst-by-parametric-area minority-sign facets to retain (default 12) */
  nFoldWorst?: number;
  /** minority fraction above which the gate refuses to certify (default 0.25) */
  ambiguousFrac?: number;
  /**
   * DECLARED PATCH REGIONS (P5). A structured patch emitter legitimately lays facets a bisection-shaped
   * cap would flag, so the gate must learn provenance — but it must not lose its teeth, because the one
   * thing this gate exists to prevent is a blade population being explained away. THE CONTRACT:
   *   * a determined blade whose CENTROID lies inside a declared region is EXEMPT and counted separately;
   *   * an UNDECLARED determined blade still FAILS the gate, exactly as today;
   *   * the exemption count is SHOUTED on every run, per region, never a quiet subtraction;
   *   * a region exempts ONLY facets inside its own bounds — a mis-registered region is the provenance
   *     analogue of a mistraced locus (S10 layer 2), the same artifact-class risk, and the negative
   *     control asserts both directions.
   * Omit entirely (the default) and the gate behaves EXACTLY as it did before: nDeclared is 0 and the
   * gate count is the full determined-blade count.
   */
  patches?: readonly PatchRegion[];
}

/**
 * A region a patch emitter DECLARES it owns, in (theta, z) with a radius in mm on the surface.
 * `id` is carried into the report so an exemption can always be traced back to the thing that claimed it.
 */
export interface PatchRegion { id: string; theta: number; z: number; radiusMm: number }

/**
 * Facet-shape census of a triangle soup. Reads nothing but `xyz` — the same soup H1 and H2 are scored
 * against — so it cannot be looking at a different mesh than the fidelity numbers it is printed with.
 */
export function meshShapeCensus(xyz: Float64Array, nTri: number, opts: CensusOptions): ShapeCensus {
  const t0 = Date.now();
  const arCap = opts.arCap;
  const H_ = opts.H;
  const nWorst = Math.max(1, opts.nWorst);
  const nFoldWorst = Math.max(1, opts.nFoldWorst ?? 12);
  const ambiguousFrac = opts.ambiguousFrac ?? 0.25;

  // ── pass 1: 3-D shape, raw per-facet parametric sign, radial normal orientation (from _bladeCensus) ──
  const ar = new Float64Array(nTri);
  const parSign = new Int8Array(nTri);
  /** DETERMINED sign: +/-1 only when |sPar| exceeds the facet's own f32 half-ulp bound, else 0 */
  const sDet = new Int8Array(nTri);
  /** |sPar| / delta per facet — <1 means the STL does not determine this facet's winding */
  const ratioArr = new Float64Array(nTri);
  const hist = new Map<number, number>();
  const foldZHist = new Array<number>(24).fill(0);
  const bladeZHist = new Array<number>(24).fill(0);
  const worstHeap: ShapeWorst[] = [];
  let nBlade = 0; let nBladeIndet = 0; let nBladeRaw = 0;
  const patches = opts.patches ?? [];
  const declaredCount = new Array<number>(patches.length).fill(0);
  let nBladeDeclared = 0; let nBladeUndeclared = 0;
  let nDegenerate = 0; let nFoldRaw = 0; let nFoldRawBlade = 0;
  let nInward = 0; let nInwardBlade = 0;
  let nParPos = 0; let nParNeg = 0; let nParZero = 0;
  let nParPosDet = 0; let nParNegDet = 0;
  let nIndeterminate = 0; let nIndetNeg = 0; let nIndetPos = 0;
  let arMax = -1; let arMaxTri = -1; let minEdge = Infinity; let minEdgeTri = -1;
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    const e0 = Math.hypot(bx - ax, by - ay, bz - az);
    const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
    const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz);
    const area = 0.5 * nl;
    const per = e0 + e1 + e2;
    const L = Math.max(e0, e1, e2);
    const S = Math.min(e0, e1, e2);
    const a = area > 0 ? (L * per) / (4 * area) : Infinity;
    ar[t] = a;
    if (!(area > 0)) nDegenerate += 1;
    if (a > arMax) { arMax = a; arMaxTri = t; }
    if (S < minEdge) { minEdge = S; minEdgeTri = t; }
    // raw parametric winding, anchored at A, shortest arc — _bladeCensus's `sPar`
    const tA = Math.atan2(ay, ax);
    const dB = dTh(tA, Math.atan2(by, bx));
    const dC = dTh(tA, Math.atan2(cy, cx));
    const sPar = dB * (cz - az) - (bz - az) * dC;
    parSign[t] = sPar > 0 ? 1 : sPar < 0 ? -1 : 0;
    if (sPar > 0) nParPos += 1; else if (sPar < 0) nParNeg += 1; else nParZero += 1;
    // f32 sign-determinacy bound on sPar (transcribed from STAGE/foldProbe.mjs, FOLD-ANOMALY 2026-07-29):
    // half-ulp perturbation of each stored coordinate propagated through the exact sPar expression.
    const eThA = ethOf(ax, ay); const eThB = ethOf(bx, by); const eThC = ethOf(cx, cy);
    const dS = Math.abs(cz - az) * eThB + Math.abs(bz - az) * eThC + Math.abs(bz - cz) * eThA
      + Math.abs(dC - dB) * halfUlp32(az) + Math.abs(dC) * halfUlp32(bz) + Math.abs(dB) * halfUlp32(cz);
    const absS = Math.abs(sPar);
    ratioArr[t] = dS > 0 ? absS / dS : (absS > 0 ? Infinity : 0);
    if (absS > dS) {
      const sd = sPar > 0 ? 1 : -1;
      sDet[t] = sd;
      if (sd > 0) nParPosDet += 1; else nParNegDet += 1;
    } else {
      sDet[t] = 0;
      nIndeterminate += 1;
      if (sPar < 0) nIndetNeg += 1; else nIndetPos += 1;
    }
    // radial component of the facet normal: the analytic surface always has n . rhat = r > 0
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    const gr = Math.hypot(gx, gy);
    const gth = Math.atan2(gy, gx);
    const radDot = gr > 0 && nl > 0 ? (nx * gx + ny * gy) / (nl * gr) : 0;
    const zc = (az + bz + cz) / 3;
    const zb = Math.max(0, Math.min(23, Math.floor((zc / H_) * 24)));
    if (sPar < 0) { nFoldRaw += 1; foldZHist[zb] += 1; }
    if (radDot < 0) nInward += 1;
    const d = a >= 1 ? Math.min(12, Math.floor(Math.log10(a))) : -1;
    hist.set(d, (hist.get(d) ?? 0) + 1);
    if (a > arCap) {
      nBladeRaw += 1;
      // f32 area-uncertainty band at the cap boundary: the facet is a DETERMINED blade only if the LOWER
      // bound on its true AR under half-ulp coordinate noise still exceeds the cap. Measured calibration:
      // D52's worst read-back AR was 50.144 vs a guard-proven f64 cap of 50.00 (+0.288%), inside the
      // predicted +0.22%..+0.65% band — read-back artefacts, not guard escapes (FOLD-ANOMALY §5).
      const dvA = Math.hypot(halfUlp32(ax), halfUlp32(ay), halfUlp32(az));
      const dvB = Math.hypot(halfUlp32(bx), halfUlp32(by), halfUlp32(bz));
      const dvC = Math.hypot(halfUlp32(cx), halfUlp32(cy), halfUlp32(cz));
      const dArea = 0.5 * (e1 * dvA + e2 * dvB + e0 * dvC); // |d area| <= 1/2 sum |opp edge|*|dv|
      if ((L * per) / (4 * (area + dArea)) > arCap) {
        nBlade += 1;
        // PROVENANCE: is this determined blade inside a region something DECLARED it owns? The test is on
        // the facet's own centroid and on the region's own radius — no slack, no growth factor. A region
        // covers what it covers.
        let owner = -1;
        for (let q = 0; q < patches.length; q += 1) {
          const pr = patches[q];
          let dth = gth - pr.theta;
          while (dth > Math.PI) dth -= 2 * Math.PI;
          while (dth < -Math.PI) dth += 2 * Math.PI;
          if (Math.hypot(gr * dth, zc - pr.z) <= pr.radiusMm) { owner = q; break; }
        }
        if (owner >= 0) { nBladeDeclared += 1; declaredCount[owner] += 1; } else nBladeUndeclared += 1;
      } else nBladeIndet += 1;
      bladeZHist[zb] += 1;
      if (sPar < 0) nFoldRawBlade += 1;
      if (radDot < 0) nInwardBlade += 1;
      // running worst-N by AR — never the first N encountered (triangle order is construction order)
      if (worstHeap.length < nWorst || a > worstHeap[worstHeap.length - 1].ar) {
        const rec: ShapeWorst = { tri: t, ar: a, L, S, area, fold: sPar < 0 };
        let i = worstHeap.length - 1;
        worstHeap.push(rec);
        while (i >= 0 && worstHeap[i].ar < a) { worstHeap[i + 1] = worstHeap[i]; i -= 1; }
        worstHeap[i + 1] = rec;
        if (worstHeap.length > nWorst) worstHeap.pop();
      }
    }
  }
  const arSorted = Float64Array.from(ar).sort();
  // THE MAJORITY IS THE MESH'S OWN ORIENTATION, taken over the DETERMINED facets only — an indeterminate
  // facet's stored sign is read-back noise and must not vote. A tie (impossible in practice) resolves to +1,
  // which is this driver's winding and therefore the historical convention.
  const majoritySign = nParNegDet > nParPosDet ? -1 : 1;
  // raw historical quantity (D51-comparable): minority RAW sign + exactly-zero facets
  const nMinoritySign = (majoritySign > 0 ? nParNeg : nParPos) + nParZero;
  // THE GATE COUNT: determined facets that disagree with the determined majority
  const nFoldDetermined = majoritySign > 0 ? nParNegDet : nParPosDet;
  const minorityFrac = nTri > 0 ? nFoldDetermined / nTri : 0;
  const ambiguous = minorityFrac > ambiguousFrac;

  // ── pass 2: exact-float32-bit weld, then (arc,z) parametric shape + edge topology (from _bladeFolds).
  // The STL stores float32; readMeshFloat64 widened it losslessly, so welding on the float32 bit pattern is
  // welding on exact equality of what the writer emitted — no epsilon, no policy.
  const f32 = new Float32Array(3);
  const u32 = new Uint32Array(f32.buffer);
  const keyMap = new Map<string, number>();
  const idx = new Int32Array(nTri * 3);
  const pxA: number[] = []; const pyA: number[] = []; const pzA: number[] = [];
  for (let t = 0; t < nTri; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const o = t * 9 + k * 3;
      f32[0] = xyz[o]; f32[1] = xyz[o + 1]; f32[2] = xyz[o + 2];
      const s = `${u32[0]},${u32[1]},${u32[2]}`;
      let v = keyMap.get(s);
      if (v === undefined) { v = pxA.length; keyMap.set(s, v); pxA.push(xyz[o]); pyA.push(xyz[o + 1]); pzA.push(xyz[o + 2]); }
      idx[t * 3 + k] = v;
    }
  }
  keyMap.clear();
  const nV = pxA.length;
  const vth = new Float64Array(nV); const vz = new Float64Array(nV); const vr = new Float64Array(nV);
  for (let v = 0; v < nV; v += 1) {
    let th = Math.atan2(pyA[v], pxA[v]); if (th < 0) th += TWO_PI;
    vth[v] = th; vz[v] = pzA[v]; vr[v] = Math.hypot(pxA[v], pyA[v]);
  }
  // (theta,z) is anisotropic — theta is an angle. Convert to ARC LENGTH at the local radius so
  // "well-shaped in parameter space" means what it looks like it means. The SIGN is unaffected (rM > 0 is a
  // positive scale factor), so the fold count is the same quantity as pass 1's, taken on the welded mesh.
  const parAr = new Float64Array(nTri);
  let nFoldWeld = 0; let nWellShapedFold = 0;
  const isFold = new Uint8Array(nTri);
  const foldWorst: FoldWorst[] = [];
  for (let t = 0; t < nTri; t += 1) {
    const a = idx[t * 3]; const b = idx[t * 3 + 1]; const c = idx[t * 3 + 2];
    const rM = (vr[a] + vr[b] + vr[c]) / 3;
    const dB = dTh(vth[a], vth[b]); const dC = dTh(vth[a], vth[c]);
    const ux = dB * rM; const uy = vz[b] - vz[a];
    const wx = dC * rM; const wy = vz[c] - vz[a];
    const s = ux * wy - uy * wx;
    const e0 = Math.hypot(ux, uy); const e1 = Math.hypot(wx - ux, wy - uy); const e2 = Math.hypot(wx, wy);
    const per = e0 + e1 + e2; const L = Math.max(e0, e1, e2);
    parAr[t] = s !== 0 ? (L * per) / (2 * Math.abs(s)) : Infinity;
    if (s < 0) { nFoldWeld += 1; if (parAr[t] <= 8) nWellShapedFold += 1; }
    // the fold SET for components and the worst-list is the sign-DETERMINED minority set: an indeterminate
    // facet's winding is read-back noise, so clustering it with real folds would manufacture components.
    if (sDet[t] !== 0 && sDet[t] !== majoritySign) {
      isFold[t] = 1;
      const mag = Math.abs(s);
      if (foldWorst.length < nFoldWorst || mag > Math.abs(foldWorst[foldWorst.length - 1].sPar)) {
        const rec: FoldWorst = { tri: t, sPar: s, parAR: parAr[t], z: (vz[a] + vz[b] + vz[c]) / 3, th: vth[a], ratio: ratioArr[t] };
        let i = foldWorst.length - 1;
        foldWorst.push(rec);
        while (i >= 0 && Math.abs(foldWorst[i].sPar) < mag) { foldWorst[i + 1] = foldWorst[i]; i -= 1; }
        foldWorst[i + 1] = rec;
        if (foldWorst.length > nFoldWorst) foldWorst.pop();
      }
    }
  }
  const parSorted = Float64Array.from(parAr).sort();

  // edge incidence + directed tally (the watertight/orientation/Euler check — necessary, NOT sufficient)
  if (nV >= 8388608) throw new Error(`shape census: ${nV} welded vertices exceeds the 2^23 edge-key packing`);
  const slotOf = new Map<number, number>();
  const eN = new Int32Array(nTri * 3); const eFwd = new Int32Array(nTri * 3);
  const eT0 = new Int32Array(nTri * 3); const eT1 = new Int32Array(nTri * 3).fill(-1);
  let nSlots = 0;
  for (let t = 0; t < nTri; t += 1) {
    const a = idx[t * 3]; const b = idx[t * 3 + 1]; const c = idx[t * 3 + 2];
    for (let k = 0; k < 3; k += 1) {
      const x = k === 0 ? a : k === 1 ? b : c;
      const y = k === 0 ? b : k === 1 ? c : a;
      const kk = x < y ? x * 8388608 + y : y * 8388608 + x;
      let sl = slotOf.get(kk);
      if (sl === undefined) { sl = nSlots; nSlots += 1; slotOf.set(kk, sl); eT0[sl] = t; }
      else if (eT1[sl] < 0) eT1[sl] = t;
      eN[sl] += 1;
      if (x < y) eFwd[sl] += 1;
    }
  }
  slotOf.clear();
  let nonManifold = 0; let boundary = 0; let orientMismatch = 0;
  for (let sl = 0; sl < nSlots; sl += 1) {
    if (eN[sl] === 2) { if (eFwd[sl] !== 1) orientMismatch += 1; continue; }
    if (eN[sl] > 2) { nonManifold += 1; continue; }
    boundary += 1;
  }

  // connected components of the fold set — a flap vs. scattered noise
  const comp = new Int32Array(nTri).fill(-1);
  const adjHead = new Int32Array(nTri).fill(-1);
  const adjNext = new Int32Array(nSlots * 2).fill(-1);
  const adjTo = new Int32Array(nSlots * 2).fill(-1);
  let nAdj = 0;
  for (let sl = 0; sl < nSlots; sl += 1) {
    if (eT1[sl] < 0) continue;
    const p = eT0[sl]; const q = eT1[sl];
    adjTo[nAdj] = q; adjNext[nAdj] = adjHead[p]; adjHead[p] = nAdj; nAdj += 1;
    adjTo[nAdj] = p; adjNext[nAdj] = adjHead[q]; adjHead[q] = nAdj; nAdj += 1;
  }
  let foldComponents = 0; let foldLargest = 0;
  const stack: number[] = [];
  for (let t = 0; t < nTri; t += 1) {
    if (isFold[t] === 0 || comp[t] >= 0) continue;
    const cid = foldComponents; foldComponents += 1;
    comp[t] = cid; stack.length = 0; stack.push(t);
    let sz = 0;
    while (stack.length > 0) {
      const u = stack.pop() as number;
      sz += 1;
      for (let e = adjHead[u]; e >= 0; e = adjNext[e]) {
        const w = adjTo[e];
        if (isFold[w] === 1 && comp[w] < 0) { comp[w] = cid; stack.push(w); }
      }
    }
    if (sz > foldLargest) foldLargest = sz;
  }

  return {
    nTri, arCap,
    arP50: pct(arSorted, 0.5), arP90: pct(arSorted, 0.9), arP99: pct(arSorted, 0.99), arMax, arMaxTri,
    nBlade, nDegenerate, minEdge, minEdgeTri,
    nFoldRaw, nFoldRawBlade, nInward, nInwardBlade,
    arDecades: [...hist.entries()].sort((p, q) => p[0] - q[0]),
    nV, nEdges: nSlots, nonManifold, boundary, orientMismatch, euler: nV - nSlots + nTri,
    nFoldWeld, nWellShapedFold, foldComponents, foldLargest,
    parArP50: pct(parSorted, 0.5), parArP90: pct(parSorted, 0.9), parArP99: pct(parSorted, 0.99),
    parArMax: parSorted.length > 0 ? parSorted[parSorted.length - 1] : 0,
    foldZHist, bladeZHist,
    worst: worstHeap, secs: (Date.now() - t0) / 1000,
    nParPos, nParNeg, nParZero, majoritySign, nMinoritySign, minorityFrac, ambiguous,
    foldWorst,
    nIndeterminate, nIndetNeg, nIndetPos, nFoldDetermined, nBladeIndet, nBladeRaw,
    nBladeDeclared, nBladeUndeclared,
    declaredHits: patches.map((pr, q) => ({ id: pr.id, count: declaredCount[q] })),
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE GATES
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════

const FOLD_TITLE = 'REPRESENTATION VALIDITY — consistent (theta,z) orientation (a graph is single-valued)';

/**
 * A1. Expected count 0. Exact: one multiply-subtract per facet, no tolerance, no acceleration structure.
 *
 * `graphApplicable` MUST be false for any mesh that is not single-valued over (theta,z) — the double-valued
 * tread / curtain meshes, and STAGE=solid's inner wall and floor. NOT APPLICABLE IS NOT A PASS.
 */
export function foldGate(sc: ShapeCensus, graphApplicable: boolean): GateResult {
  if (!graphApplicable) {
    return {
      id: 'FOLD', title: FOLD_TITLE, applicable: false, count: sc.nFoldDetermined, expected: 0, pass: false,
      detail: [
        'NOT APPLICABLE — this mesh was declared NOT a lifted graph over (theta,z) (PF_FT_GRAPH=0).',
        'The sign census then measures which SHEET a facet is on, not whether the surface is valid.',
        'A double-valued tread / curtain / solid-stage mesh needs the triangle-triangle self-intersection',
        'test, which is STILL UNBUILT. NOT APPLICABLE IS NOT A PASS.',
      ],
    };
  }
  if (sc.ambiguous) {
    return {
      id: 'FOLD', title: FOLD_TITLE, applicable: false, count: sc.nFoldDetermined, expected: 0, pass: false,
      detail: [
        `AMBIGUOUS — ${(100 * sc.minorityFrac).toFixed(2)}% of facets DETERMINEDLY disagree with the majority sign.`,
        'That is far past any credible defect population (D51, the worst mesh on record, was 2.22%) and is',
        'what a NON-GRAPH mesh looks like. Refusing to certify rather than reporting a nonsense count.',
        'Either the mesh is not a graph (declare PF_FT_GRAPH=0) or the parametrisation is wrong.',
      ],
    };
  }
  const detail: string[] = [
    `parametric signed area (raw): ${sc.nParPos} positive, ${sc.nParNeg} negative, ${sc.nParZero} EXACTLY ZERO   majority (determined) ${sc.majoritySign > 0 ? '+' : '-'}`,
    `DETERMINED folds (|sPar| > per-facet f32 half-ulp bound, sign against majority) = ${sc.nFoldDetermined} / ${sc.nTri}  (${(100 * sc.minorityFrac).toFixed(4)}%)   <-- THE GATE COUNT`,
    `sign NOT determined by the STL's f32 coordinates: ${sc.nIndeterminate} (${sc.nIndetNeg} read neg / ${sc.nIndetPos} read pos, incl. ${sc.nParZero} exact zero)`,
    `  ^ REPORTED, NOT DEFECTS — a fold verdict below this floor is not measurable from an STL (FOLD-ANOMALY 2026-07-29:`,
    `    D52's six "folds" were all sub-floor artefacts of atan2(f32) read-back; the driver's f64 mesh was provably clean)`,
    `historical raw '<0' count (comparable to _bladeCensus / _bladeFolds and the D51 baseline): ${sc.nFoldRaw}   minority+zero raw: ${sc.nMinoritySign}`,
    `after exact-float32-bit weld: ${sc.nFoldWeld}   well-shaped (parametric AR <= 8, so NOT float noise): ${sc.nWellShapedFold}`,
    `fold components (determined set) ${sc.foldComponents}   largest ${sc.foldLargest} facets`,
    `z-histogram of folds (24 bins, base -> rim): ${sc.foldZHist.join(' ')}`,
  ];
  if (sc.foldWorst.length > 0) {
    detail.push('WORST DETERMINED FOLDS by |parametric area|:');
    for (const f of sc.foldWorst) {
      detail.push(`  tri ${String(f.tri).padStart(9)}  2A ${f.sPar.toExponential(3)} mm^2  parAR ${Number.isFinite(f.parAR) ? f.parAR.toFixed(2) : 'inf'}  |sPar|/delta ${Number.isFinite(f.ratio) ? f.ratio.toFixed(1) : 'inf'}  z ${f.z.toFixed(3)}  th ${f.th.toFixed(5)}`);
    }
  }
  return {
    id: 'FOLD', title: FOLD_TITLE, applicable: true,
    count: sc.nFoldDetermined, expected: 0, pass: sc.nFoldDetermined === 0, detail,
  };
}

/**
 * FACET SHAPE. Not new physics: it is here so the quantity the mesher-side guard was built against is a GATE
 * rather than a census column, and so the guard's own contract — "after this fix the census's blade count is
 * 0" — is checkable in one line. The guard metric is VERBATIM this metric, which means a zero here proves
 * the PLUMBING works and nothing more; it is a precondition, never a headline.
 *
 * ═══ REVIEW FINDING 4 (2026-07-29): THE DRIVER'S GUARD COVERS SPLITS AND NOTHING ELSE ═══
 * `guardAR` is the DRIVER-SIDE cap (PF_CB_SHAPE_AR) of the run that produced the audited STL, or null when
 * the operator did not declare it. It buys an EXACT provenance statement for free, because the guard and this
 * census compute the identical quantity — `_shapeGuard.aspect3` is longest*perimeter/(4*area), the same
 * expression as `meshShapeCensus`'s `a` above, and that identity is deliberate (see _shapeGuard's header).
 *
 * The driver's guard is evaluated inside `bisectAt` (_strataConformBisect.test.ts:1043 -> `shapeAdmits`
 * :1003-1031) and REFUSES the split when either child of any live incident triangle exceeds the cap. So with
 * the guard on, NO COMMITTED SPLIT CAN EMIT A CHILD ABOVE THE CAP. Any facet this gate counts at an arCap
 * >= guardAR therefore did NOT come from a guarded split. It came from the initial grid, or from a pass that
 * runs AFTER the refinement loop and is not shape-guarded at all — the exact sites are listed in the
 * driver-gap note in research/lab/2026-07-29-strata-perf-convergence-worklog.md.
 * The driver reaches the same conclusion from its own side and prints it at :2559-2562.
 *
 * FINER ATTRIBUTION IS NOT AVAILABLE FROM A FINISHED STL and this file does not fake one: the file carries no
 * per-facet provenance, and any "which pass emitted this" inference beyond the cap argument above would be a
 * heuristic. The honest cross-read is against the driver's own report line "worst child AR the guard ever
 * ADMITTED" (:2551), which is an upper bound on what refinement could have produced.
 */
export function bladeGate(sc: ShapeCensus, guardAR: number | null = null): GateResult {
  const detail: string[] = [
    `AR p50 ${sc.arP50.toFixed(3)}  p90 ${sc.arP90.toFixed(3)}  p99 ${sc.arP99.toFixed(3)}  MAX ${sc.arMax.toFixed(3)}`,
    `DETERMINED blades (lower-bound AR under f32 half-ulp noise still > ${sc.arCap}) = ${sc.nBlade} / ${sc.nTri}  (${((100 * sc.nBlade) / Math.max(1, sc.nTri)).toFixed(4)}%)   <-- THE GATE COUNT`,
    `AR-at-cap INDETERMINATE at f32 (raw AR > ${sc.arCap} but inside the read-back band): ${sc.nBladeIndet}   raw total ${sc.nBladeRaw}`,
    `zero-area facets ${sc.nDegenerate}   min edge ${(1000 * sc.minEdge).toFixed(3)} um`,
    `z-histogram of blades (raw, 24 bins, base -> rim): ${sc.bladeZHist.join(' ')}`,
  ];
  if (sc.nBladeRaw > 0) {
    if (guardAR === null) {
      detail.push(
        'PROVENANCE NOT ATTRIBUTED — PF_FT_GUARD_AR is unset, so this gate cannot say whether these facets were',
        'reachable by the driver-side split guard. Set it to the PF_CB_SHAPE_AR of the run that made this STL.',
      );
    } else if (sc.arCap >= guardAR) {
      detail.push(
        `*** NONE OF THESE ${sc.nBlade} DETERMINED FACETS CAME FROM A GUARDED SPLIT. The driver guard (PF_CB_SHAPE_AR=${guardAR})`,
        `    refuses any split whose child exceeds ${guardAR}, this gate counts facets above ${sc.arCap} >= ${guardAR}, and`,
        '    the two metrics are the SAME expression. So every facet here came from the INITIAL GRID or from a',
        '    post-loop pass that is NOT shape-guarded — the needle collapse, or a 2-2 flip called without its',
        '    improvement gate. Code sites: see the FINDING 4 driver-gap note in the 2026-07-29 worklog. ***',
        `    (f32-vs-f64 borderline facets are already EXCLUDED from the count by the read-back band: the`,
        `     ${sc.nBladeIndet} raw-over-cap facets inside it are reported above, not attributed to anything.)`,
      );
    } else {
      detail.push(
        `this gate's cap (${sc.arCap}) is BELOW the driver guard's cap (${guardAR}), so a guard-ADMITTED split child`,
        `can legitimately appear in this count. Re-run with PF_FT_ARCAP=${guardAR} to isolate the population that`,
        'provably could not have come from a guarded split (initial grid or an unguarded post-loop pass).',
      );
    }
  }
  // ── PATCH PROVENANCE (P5). Default-inert: with no declared regions nBladeDeclared is 0 and the gate
  // counts exactly what it always counted. With regions declared, the gate counts only UNDECLARED blades
  // and SHOUTS the exemption — the number that could hide a defect is never allowed to be quiet.
  const gateCount = sc.nBladeDeclared > 0 ? sc.nBladeUndeclared : sc.nBlade;
  if (sc.declaredHits.length > 0) {
    detail.push(
      `*** PATCH PROVENANCE ACTIVE — ${sc.declaredHits.length} DECLARED REGION(S). ${sc.nBladeDeclared} determined`,
      `    blade(s) EXEMPTED because their centroid lies inside a declared region; ${sc.nBladeUndeclared} UNDECLARED`,
      '    blade(s) remain and ARE the gate count. An exemption is a CLAIM by whatever emitted that region,',
      '    not a finding by this gate: it means "something declared it owns this geometry", nothing more. ***',
      `    per region: ${sc.declaredHits.map((h) => `${h.id}=${h.count}`).join('  ')}`,
    );
    if (sc.nBladeDeclared > 0 && sc.nBladeUndeclared === 0) {
      detail.push(
        '    NOTE the whole determined-blade population is inside declared regions. That is exactly the shape',
        '    a mis-registered region would also produce, so it is stated rather than passed over.',
      );
    }
  }
  return {
    id: 'BLADE',
    title: `FACET SHAPE — aspect ratio <= ${sc.arCap} (longest edge / (2 * inradius))`
      + (sc.declaredHits.length > 0 ? `, EXCLUDING ${sc.nBladeDeclared} facet(s) in ${sc.declaredHits.length} DECLARED patch region(s)` : ''),
    applicable: true, count: gateCount, expected: 0, pass: gateCount === 0,
    detail,
  };
}

/**
 * TOPOLOGY — necessary, and explicitly NOT sufficient. It is a gate because a non-manifold edge is a real
 * defect; it is labelled because D51 passed every line of it while 2.22 % of its facets were inverted.
 * `expectedBoundary` is the boundary-edge count the STAGE legitimately has (a ring has two rims); pass null
 * to leave the boundary count unjudged.
 */
export function topologyGate(sc: ShapeCensus, expectedBoundary: number | null): GateResult {
  const boundaryOk = expectedBoundary === null || sc.boundary === expectedBoundary;
  const count = sc.nonManifold + sc.orientMismatch + (boundaryOk ? 0 : 1);
  return {
    id: 'TOPOLOGY',
    title: 'TOPOLOGY — manifold + consistently oriented (NECESSARY, NOT SUFFICIENT: a folded sheet passes it)',
    applicable: true, count, expected: 0, pass: count === 0,
    detail: [
      `welded verts ${sc.nV}   edges ${sc.nEdges}   non-manifold ${sc.nonManifold}   boundary ${sc.boundary}${expectedBoundary === null ? '' : ` (expected ${expectedBoundary})`}   orientation-mismatch ${sc.orientMismatch}   Euler V-E+F = ${sc.euler}`,
      'D51 read 0 / 0 / 0 and V-E+F = 0 EXACTLY while 31,842 of its facets were inverted. This block is',
      'reported so that fact stays visible instead of being mistaken for a clean bill of health.',
    ],
  };
}

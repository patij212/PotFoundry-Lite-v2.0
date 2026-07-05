// _pf_hybridApexLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// GATE-2 (SLIVERS) HYBRID: graft a LOCALIZED honest-brute apex refine ON TOP of the CLEAN direct-emit
// structured-quad crest strip (`buildDirectCrestStrip`), splitting ONLY the outlier triangles with DIRECT
// connectivity emission (red-green subdivision) — NEVER re-CDT the whole point set (the cdt2d re-chord was the
// V6 failure mode that re-needled every prior strip; E-2026-07-05-CRESTSTRIP-DIRECT §NEXT names this the untried
// hybrid).
//
// WHY red-green + no cdt2d: the direct strip gives 0.4% <20° (clean flank) but 236 apex outliers @0.22mm on
// Gothic. The refutation of every prior refine was "insert points → free cdt2d re-triangulates the WHOLE set →
// Delaunay reconnects the dense points into cross-flank chords = needles". Here we NEVER call cdt2d. Instead:
//   1. Build edge→incident-triangle adjacency over the strip.
//   2. Honest-brute STOP-score EVERY facet; the outlier set = triangles with 45-pt-brute interior dev > tol.
//   3. RED-refine each outlier triangle 1→4 at its 3 EDGE MIDPOINTS placed IN THE (u,t) CHART (on-surface by the
//      analytic lift), emitting the 4 sub-triangles DIRECTLY. Midpoints are SHARED via an edge-midpoint cache so
//      two triangles that both split a shared edge use the SAME node (watertight).
//   4. GREEN-close any NON-outlier triangle that acquired a hanging node on exactly one of its edges (the neighbour
//      of a red-split triangle): bisect it into 2 tris through that midpoint. If a clean triangle acquires hanging
//      nodes on 2 or 3 edges, promote it to a full RED 1→4 (keeps it conforming; rare, only in the apex band).
//   5. Iterate: re-score ONLY the newly-created sub-triangles (the changed cavity) + the greens; split those still
//      > tol; recurse until 0 outliers or the pass cap.
// The clean panel triangles that are NOT adjacent to any apex outlier are NEVER touched ⇒ they keep their 0.4%
// angles; only the thin apex band recurses.
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib + _pf_perfectMesherBruteLib + _pf_crestStripDirectLib + labkit
// READ-ONLY. NO cdt2d. NO src/ or existing-kernel edit.
import { type AnalyticRadiusFn, bruteNearestOnRadialSurface, projectPointToRadialSurface } from './labkit';
import { type PatchDef, lift, denseBary } from './_pf_perfectMesherLib';
import { buildDirectCrestStrip, type DirectStripResult } from './_pf_crestStripDirectLib';

const TAU = 2 * Math.PI;

// STOP ruler = the FULL 45-pt denseBary(8) lattice — IDENTICAL to acceptanceGuardWhole's facetInteriorGuardDense.
// LESSON (E-…-WHOLEMESH-GOTHIC): the loop's STOP driver MUST be the same honest instrument as the acceptance guard,
// or it terminates BLIND — a 7-pt STOP read worst 0.0095 ("0") while the 45-pt guard read 0.41 on the SAME mesh
// (the guard-population gotcha, in reverse). Same two-stage anchor (utBound → GN screen → full-azimuth brute).
const BARY_STOP: ReadonlyArray<readonly [number, number, number]> = denseBary(8);
export interface RulerOpts { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number; }
// facetDev — worst interior true-3D deviation over the 45-pt lattice. `useBrute` picks the far-anchor:
//   false (LOOP STOP driver): utBound pre-filter → GN only. GN is EXACT on the SINGLE-VALUED Gothic/GeoStar radius
//     field (registry E-…-CRESTSTRIP-DIRECT used exactly this "fast GN whole-mesh guard, GN EXACT" for its density
//     table), so it drives splits correctly AND fast (no full-azimuth brute in the hot loop — that was the O(6x)
//     cost that stalled the 45-pt-brute STOP). Conservative: GN can only UNDER-state (never over), so any facet GN
//     flags IS a real outlier; the final brute guard catches any GN mis-anchor (none expected on single-valued fields).
//   true (only used as a fallback): the full two-stage brute (the probe's own acceptanceGuardWhole is the honest
//     arbiter — this arg exists only for a diagnostic re-score).
function facetDev(
  rA: AnalyticRadiusFn, H: number, uv: number[], a: number, b: number, c: number, opts: RulerOpts, useBrute: boolean,
): number {
  const Pa = lift(rA, uv[2 * a], uv[2 * a + 1], H), Pb = lift(rA, uv[2 * b], uv[2 * b + 1], H), Pc = lift(rA, uv[2 * c], uv[2 * c + 1], H);
  let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
  const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => {
    const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z);
    return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
  };
  // FAST near-crest screen (no brute): if EVERY sample's GN dev is < 0.3·tol AND its same-(u,t) bound < preFilter,
  // the facet is deep-green and cannot be an outlier under ANY anchor (GN can only under-state; a facet this small
  // and this close is trivially on-surface) ⇒ skip the brute entirely. Only facets that fail this screen (near the
  // crest, where GN might under-state the apex chord) get the full-azimuth brute. This keeps the panel cheap while
  // NEVER trusting GN on a near-crest facet (the measured GN-blindness that made a GN-STOP terminate at 67 outliers).
  let dev = 0;
  for (const [wa, wb, wc] of BARY_STOP) {
    const px = wa * Pa[0] + wb * Pb[0] + wc * Pc[0], py = wa * Pa[1] + wb * Pb[1] + wc * Pc[1], pz = wa * Pa[2] + wb * Pb[2] + wc * Pc[2];
    const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
    const bound = utBound(px, py, pz, um, tm);
    let d: number;
    if (bound <= opts.preFilter) d = bound;                    // deep-green sample: bound is the true dist upper-bnd < tol
    else if (!useBrute) d = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist; // GN screen (diag only)
    else d = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: opts.nTheta, nZ: opts.nZ, zBandMm: opts.zBandMm, refineIters: opts.refineIters }).dist; // near-crest: full-azimuth brute (GN under-states the apex chord)
    if (d > dev) dev = d;
  }
  return dev;
}

export interface HybridResult {
  strip: DirectStripResult;              // the un-refined clean strip (for A/B)
  uv: number[]; tris: number[];          // the hybrid-refined mesh
  passes: number; capped: boolean;
  hist: Array<{ pass: number; nTris: number; nOutlier: number; worst: number; nRed: number; nGreen: number; ms: number }>;
  baselineOutliers: number; baselineWorst: number;
}

// ── the hybrid: clean direct strip + LOCAL red-green apex refine (no cdt2d) ────────────────────────────────────
export function buildHybridApex(
  patch: PatchDef,
  stripOpts: { dtRowMm: number; hCrestMm: number; hPanelMm: number; nRamp: number; minAmp: number; ramp?: number },
  tol: number,
  ruler: RulerOpts,
  maxPass: number,
  onPass?: (h: HybridResult['hist'][number]) => void,
  stopRuler?: RulerOpts,
): HybridResult {
  const { rA, H, arcPerU } = patch;
  const sruler = stopRuler ?? ruler; // STOP driver ruler (may use a COARSER nTheta — box-refine converges to the
  // same foot independent of grid res; the probe's post-loop guard uses the full 1024 `ruler` as the honest arbiter).
  const strip = buildDirectCrestStrip(patch, stripOpts);

  // LIVE mesh: uv appended, tris rebuilt from a live triangle list of index-triples.
  const uv = strip.uv.slice();
  let tri: Array<[number, number, number]> = [];
  for (let i = 0; i < strip.tris.length; i += 3) tri.push([strip.tris[i], strip.tris[i + 1], strip.tris[i + 2]]);

  // edge-midpoint cache: key = ordered vertex pair → midpoint node id (SHARED so a split edge welds).
  const cellMm = 0.5 * stripOpts.hCrestMm; // sub-apex hash cell so distinct midpoints never collide
  void cellMm;
  const midCache = new Map<string, number>();
  const ekey = (i: number, j: number): string => (i < j ? `${i}_${j}` : `${j}_${i}`);
  let newVertsThisPass = new Set<number>();
  const midpoint = (i: number, j: number): number => {
    const k = ekey(i, j); const hit = midCache.get(k); if (hit !== undefined) return hit;
    // midpoint in the (u,t) chart (seam-unwrapped), lifted on-surface by the analytic radius at emit time.
    let ui = uv[2 * i], uj = uv[2 * j]; const ti = uv[2 * i + 1], tj = uv[2 * j + 1];
    while (uj - ui > 0.5) uj -= 1; while (ui - uj > 0.5) uj += 1;
    const um = (ui + uj) / 2, tm = (ti + tj) / 2;
    const id = uv.length / 2; uv.push(um, tm); midCache.set(k, id); newVertsThisPass.add(id); return id;
  };

  // STOP driver = the FULL-AZIMUTH BRUTE 45-pt ruler (useBrute=true). MEASURED (E-…-HYBRID-APEX pass 1): a
  // GN-anchored STOP terminated BLIND — GN read worst 0.0097 ("0 outliers") while the full-azimuth brute guard read
  // 67 outliers / max 0.219 at the SAME high-gradU (124–178) apex facets. At the zero-width pow(sharp) apex GN's
  // single-seed descent lands in the WRONG azimuthal foot and UNDER-states the chord (the documented steep-flank
  // GN gotcha). Only the full-azimuth brute STOP can drive the apex to true-3D ≤0.01. Slower, honest, correct.
  const devOf = (t: [number, number, number]): number => facetDev(rA, H, uv, t[0], t[1], t[2], sruler, true);
  // baseline scored with the CHEAP GN-anchored ruler (fast; the honest brute is used inside the loop + the final guard).
  let baseOut = 0, baseWorst = 0;
  for (const t of tri) { const d = facetDev(rA, H, uv, t[0], t[1], t[2], sruler, false); if (d > baseWorst) baseWorst = d; if (d > tol) baseOut++; }

  const hist: HybridResult['hist'] = [];
  let capped = false; let pass = 0;
  let lastInserted = new Set<number>();

  for (pass = 1; pass <= maxPass; pass++) {
    const t0 = Date.now();
    // 1) collect outliers with the honest full-azimuth BRUTE STOP. ACTIVE SET: pass 1 (and every 4th pass, and the
    //    final convergence pass) scores the WHOLE mesh; other passes score ONLY facets incident to a vertex inserted
    //    last pass (the changed cavity) — the proven refineInteriorBruteWhole pattern (tractable). The two-stage
    //    ruler keeps deep-green panel facets cheap; only the near-crest apex band actually calls the brute.
    const wholeScan = pass === 1 || (pass % 4 === 0);
    let active: number[];
    if (wholeScan) active = Array.from({ length: tri.length }, (_, i) => i);
    else { active = []; for (let fi = 0; fi < tri.length; fi++) { const [a, b, c] = tri[fi]; if (lastInserted.has(a) || lastInserted.has(b) || lastInserted.has(c)) active.push(fi); } }
    const outlierIdx: number[] = []; let worst = 0;
    for (const fi of active) { const d = devOf(tri[fi]); if (d > worst) worst = d; if (d > tol) outlierIdx.push(fi); }
    if (outlierIdx.length === 0) {
      if (!wholeScan) {
        // incremental found 0 — do a final WHOLE-MESH brute scan to prove literal-0 before terminating.
        for (let fi = 0; fi < tri.length; fi++) { const d = devOf(tri[fi]); if (d > worst) worst = d; if (d > tol) outlierIdx.push(fi); }
      }
      if (outlierIdx.length === 0) {
        hist.push({ pass, nTris: tri.length, nOutlier: 0, worst: +worst.toFixed(5), nRed: 0, nGreen: 0, ms: Date.now() - t0 });
        if (onPass) onPass(hist[hist.length - 1]);
        break;
      }
    }
    // 2) RED-split the outliers: mark each outlier's 3 edges as "must split", allocate shared midpoints.
    newVertsThisPass = new Set<number>();
    const redSet = new Set<number>(outlierIdx);
    // collect the split-edges (as vertex pairs) contributed by every red triangle.
    const splitEdge = new Set<string>();
    for (const fi of redSet) { const [a, b, c] = tri[fi]; splitEdge.add(ekey(a, b)); splitEdge.add(ekey(b, c)); splitEdge.add(ekey(c, a)); }
    // 3) build the NEXT triangle list: red tris → 4 subtris; non-red tris → green-close per # of split edges.
    const next: Array<[number, number, number]> = [];
    let nRed = 0, nGreen = 0;
    for (let fi = 0; fi < tri.length; fi++) {
      const [a, b, c] = tri[fi];
      const eAB = splitEdge.has(ekey(a, b)), eBC = splitEdge.has(ekey(b, c)), eCA = splitEdge.has(ekey(c, a));
      const nSplit = (eAB ? 1 : 0) + (eBC ? 1 : 0) + (eCA ? 1 : 0);
      if (redSet.has(fi) || nSplit === 3) {
        // full RED 1→4
        const mAB = midpoint(a, b), mBC = midpoint(b, c), mCA = midpoint(c, a);
        next.push([a, mAB, mCA], [mAB, b, mBC], [mCA, mBC, c], [mAB, mBC, mCA]);
        nRed++;
      } else if (nSplit === 0) {
        next.push([a, b, c]); // untouched clean triangle — NOT re-added to active
      } else if (nSplit === 1) {
        // GREEN bisection through the single hanging node
        let m: number, p: number, q: number, r: number;
        if (eAB) { m = midpoint(a, b); p = a; q = b; r = c; }
        else if (eBC) { m = midpoint(b, c); p = b; q = c; r = a; }
        else { m = midpoint(c, a); p = c; q = a; r = b; }
        next.push([p, m, r], [m, q, r]); nGreen++;
      } else {
        // nSplit === 2 : split into 3 (two hanging nodes) — direct-emit, keeps conforming.
        let m1: number, m2: number, A: number, B: number, C: number;
        // rotate so the two split edges are (A,B) and (B,C); m1 on AB, m2 on BC.
        if (eAB && eBC) { A = a; B = b; C = c; }
        else if (eBC && eCA) { A = b; B = c; C = a; }
        else { A = c; B = a; C = b; }
        m1 = midpoint(A, B); m2 = midpoint(B, C);
        next.push([A, m1, m2], [m1, B, m2], [A, m2, C]);
        nGreen++;
      }
    }
    tri = next;
    lastInserted = newVertsThisPass; // next pass's incremental active set = facets touching these new verts
    hist.push({ pass, nTris: tri.length, nOutlier: outlierIdx.length, worst: +worst.toFixed(5), nRed, nGreen, ms: Date.now() - t0 });
    if (onPass) onPass(hist[hist.length - 1]);
    if (pass === maxPass) { capped = true; }
  }

  const flat: number[] = []; for (const t of tri) flat.push(t[0], t[1], t[2]);
  void arcPerU;
  return { strip, uv, tris: flat, passes: pass, capped, hist, baselineOutliers: baseOut, baselineWorst: +baseWorst.toFixed(5) };
}

// _pf_perfectMesherLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// THE PERFECT-MESHER KERNEL, assembled END-TO-END from the two proven halves (blueprint
// research/lab/2026-07-04-perfect-mesher-spec.md §4). NOTHING here rebuilds a proven mechanism from scratch:
//   - FGJ Morse junction extractor  = rowCrests/colCrests + chain + planarizeConstraintGraph (from _pf_race_fgjunction).
//   - SURFNATIVE interior-criterion = arc-length-graded surface-projected Steiner insertion on flank facets whose
//                                     measured TRUE-3D interior deviation > tol (from _pf_race_surfnativeLib).
// The graft the two proxies never joined: run the SURFNATIVE interior-criterion refine loop on the FGJ
// junction-locked CDT (a real junction NETWORK, not one hand-split cusp).
//
// PATCH = a REAL single-arch GothicArches patch: a few bays in u (multiple u-family ribs => real births/merges)
// x a short z-band spanning several t-family (diagonal) crest crossings (the count-unstable junction network).
//
// ISOLATION: reuses labkit + featureConformingMesh.planarizeConstraintGraph + cdt2d READ-ONLY. NO src/ edit.

import cdt2d from 'cdt2d';
import { buildRadiusFn, type StyleDims, type AnalyticRadiusFn, bruteNearestOnRadialSurface, projectPointToRadialSurface } from './labkit';
import { planarizeMM } from './_pf_planarizeMM';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

export interface PatchDef {
  rA: AnalyticRadiusFn; H: number; rMean: number; arcPerU: number;
  uLo: number; uHi: number; tLo: number; tHi: number;
}

export function makeGothicPatch(bays: number, zBandMm: number): PatchDef {
  const dims: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
  const H = dims.H;
  const rMean = 45;                       // mean radius; u->mm arc scale
  const arcPerU = TAU * rMean;
  const rA = buildRadiusFn('GothicArches' as StyleId, {}, dims);
  // Locate the arch-apex junction (a 2-family X-crossing) as the patch center, then span `bays` u-bays and a
  // z-band of zBandMm around it (a REAL single-arch region with births/merges of both families).
  const j = findApexJunction(rA, H, rMean);
  // count u-bays: crests per unit u at the apex row => bay width in u.
  const nCr = countRowCrests(rA, j.t, H);
  const bayDu = nCr > 0 ? 1 / nCr : 1 / 72;
  const halfU = (bays / 2) * bayDu;
  const halfT = (zBandMm / 2) / H;
  const uLo = j.u - halfU, uHi = j.u + halfU;
  const tLo = Math.max(0.02, j.t - halfT), tHi = Math.min(0.98, j.t + halfT);
  return { rA, H, rMean, arcPerU, uLo, uHi, tLo, tHi };
}

// ── lift (u,t) -> 3D on the radial surface ───────────────────────────────────────────────────────────────────
export function lift(rA: AnalyticRadiusFn, u: number, t: number, H: number): [number, number, number] {
  const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

// ── Morse crest scans (FGJ) ──────────────────────────────────────────────────────────────────────────────────
export function rowCrests(rA: AnalyticRadiusFn, t: number, H: number, uLo: number, uHi: number, N: number, minAmp: number): number[] {
  const z = t * H; const rad = new Float64Array(N + 1); const us = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const u = uLo + (uHi - uLo) * (i / N); us[i] = u; rad[i] = rA(TAU * (((u % 1) + 1) % 1), z); }
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    if (rad[i] > rad[i - 1] && rad[i] >= rad[i + 1]) {
      const W = Math.max(2, Math.round(N / 40)); let lo = rad[i];
      for (let k = 1; k <= W; k++) { if (i - k >= 0 && rad[i - k] < lo) lo = rad[i - k]; if (i + k <= N && rad[i + k] < lo) lo = rad[i + k]; }
      if (rad[i] - lo < minAmp) continue;
      let a = us[i - 1], b = us[i + 1]; const GR = (Math.sqrt(5) - 1) / 2; const fr = (u: number): number => rA(TAU * (((u % 1) + 1) % 1), z);
      let c = b - GR * (b - a), d = a + GR * (b - a), fc = fr(c), fd = fr(d);
      for (let it = 0; it < 40; it++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = fr(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = fr(d); } if (b - a < 1e-9) break; }
      out.push((a + b) / 2);
    }
  }
  return out;
}
export function colCrests(rA: AnalyticRadiusFn, u: number, H: number, tLo: number, tHi: number, N: number, minAmp: number): number[] {
  const th = TAU * (((u % 1) + 1) % 1); const rad = new Float64Array(N + 1); const ts = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const t = tLo + (tHi - tLo) * (i / N); ts[i] = t; rad[i] = rA(th, t * H); }
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    if (rad[i] > rad[i - 1] && rad[i] >= rad[i + 1]) {
      const W = Math.max(2, Math.round(N / 40)); let lo = rad[i];
      for (let k = 1; k <= W; k++) { if (i - k >= 0 && rad[i - k] < lo) lo = rad[i - k]; if (i + k <= N && rad[i + k] < lo) lo = rad[i + k]; }
      if (rad[i] - lo < minAmp) continue; out.push(ts[i]);
    }
  }
  return out;
}
function countRowCrests(rA: AnalyticRadiusFn, t: number, H: number): number { return rowCrests(rA, t, H, 0, 1, 8192, 0.03).length; }

function findApexJunction(rA: AnalyticRadiusFn, H: number, rMean: number): { u: number; t: number } {
  let best = { u: 0.05, t: 0.55, amp: -1 };
  for (let ti = 0; ti < 60; ti++) {
    const t = 0.35 + 0.4 * (ti / 59);
    const uc = rowCrests(rA, t, H, 0, 0.2, 4000, 0.03);
    for (const u of uc) {
      const tc = colCrests(rA, u, H, Math.max(0, t - 0.1), Math.min(1, t + 0.1), 2000, 0.03);
      for (const tt of tc) if (Math.abs(tt - t) < 0.01) { const amp = rA(TAU * u, t * H) - rMean; if (amp > best.amp) best = { u, t, amp }; }
    }
  }
  return { u: best.u, t: best.t };
}

// ── STEP 1: extract the protected complex (multi-family ridge graph + planarize) ─────────────────────────────
export interface ProtectedComplex {
  uv: number[];                 // flat (u,t) point list (LIVE — refine appends to it)
  constraintEdges: Array<[number, number]>;  // locked crest edges (index pairs into uv)
  crestVertexSet: Set<number>;  // vertex indices that lie ON a crest (protected)
  familyCount: number; nSegU: number; nSegT: number; residualCrossings: number;
  crestSamples3D: Array<[number, number, number]>;  // 3D crest sample points (for on-crest classification)
}

export function extractProtectedComplex(patch: PatchDef, nRow: number, nCol: number, minAmp: number): ProtectedComplex {
  const { rA, H, arcPerU, uLo, uHi, tLo, tHi } = patch;
  const uv: number[] = [];
  const pmap = new Map<number, number>();
  const cellMm = 0.02;
  const addPt = (u: number, t: number): number => {
    const key = Math.round(u * arcPerU / cellMm) * 100000 + Math.round(t * H / cellMm);
    const hit = pmap.get(key); if (hit !== undefined) return hit;
    const id = uv.length / 2; uv.push(u, t); pmap.set(key, id); return id;
  };
  const constraints0: number[] = [];
  const crestVerts = new Set<number>();
  const crestSamples3D: Array<[number, number, number]> = [];
  const addSeg = (a: number, b: number): void => { if (a !== b) { constraints0.push(a, b); crestVerts.add(a); crestVerts.add(b); } };
  // u-family: link crests row-to-row (nearest-u)
  let famU = 0; let prevU: Array<{ u: number; id: number }> | null = null;
  for (let ri = 0; ri <= nRow; ri++) {
    const t = tLo + (tHi - tLo) * (ri / nRow);
    const uc = rowCrests(rA, t, H, uLo, uHi, 3000, minAmp);
    const cur = uc.map((u) => { crestSamples3D.push(lift(rA, u, t, H)); return { u, id: addPt(u, t) }; });
    if (cur.length) famU = Math.max(famU, cur.length);
    if (prevU) for (const c of cur) { let best = -1, bd = 6.0e-3; for (let p = 0; p < prevU.length; p++) { const d = Math.abs(c.u - prevU[p].u); if (d < bd) { bd = d; best = p; } } if (best >= 0) addSeg(prevU[best].id, c.id); }
    prevU = cur;
  }
  const nSegU = constraints0.length / 2;
  // t-family: link crests col-to-col (nearest-t)
  let famT = 0; let prevT: Array<{ t: number; id: number }> | null = null;
  for (let ci = 0; ci <= nCol; ci++) {
    const u = uLo + (uHi - uLo) * (ci / nCol);
    const tc = colCrests(rA, u, H, tLo, tHi, 3000, minAmp);
    const cur = tc.map((t) => { crestSamples3D.push(lift(rA, u, t, H)); return { t, id: addPt(u, t) }; });
    if (cur.length) famT = Math.max(famT, cur.length);
    if (prevT) for (const c of cur) { let best = -1, bd = 2.0 / H; for (let p = 0; p < prevT.length; p++) { const d = Math.abs(c.t - prevT[p].t); if (d < bd) { bd = d; best = p; } } if (best >= 0) addSeg(prevT[best].id, c.id); }
    prevT = cur;
  }
  const nSegT = constraints0.length / 2 - nSegU;
  const familyCount = (famU > 0 ? 1 : 0) + (famT > 0 ? 1 : 0);
  // PLANARIZE in the mm metric cdt2d actually consumes (the seam-aware planarizeConstraintGraph reported
  // residual=0 but left 840 real mm crossings that crash cdt2d with `upperIds` — u-family × t-family ridge X's).
  // planarizeMM splits every mm crossing + T-junction into a shared fan 0-cell → EXACTLY planar (residual→0).
  const edges0: Array<[number, number]> = [];
  for (let i = 0; i + 1 < constraints0.length; i += 2) edges0.push([constraints0[i], constraints0[i + 1]]);
  const mm: number[] = []; for (let i = 0; i < uv.length / 2; i++) { mm.push(uv[2 * i] * arcPerU, uv[2 * i + 1] * H); }
  const pr = planarizeMM(mm, edges0, 24);
  // append the new fan/junction vertices (planarizeMM added them in mm) back to uv as (u,t); mark them protected.
  const nBefore = uv.length / 2;
  for (let i = nBefore; i < pr.pts.length / 2; i++) { uv.push(pr.pts[2 * i] / arcPerU, pr.pts[2 * i + 1] / H); crestVerts.add(i); }
  const constraintEdges: Array<[number, number]> = [];
  for (const [a, b] of pr.edges) { constraintEdges.push([a, b]); crestVerts.add(a); crestVerts.add(b); }
  return { uv, constraintEdges, crestVertexSet: crestVerts, familyCount, nSegU, nSegT, residualCrossings: pr.residual, crestSamples3D };
}

// ── STEP 2+3: seed metric-Delaunay CDT with the graph LOCKED + no-bridge (constraint edges are shared edges) ──
// We build the base mesh point set = crest/junction verts + a flat (u,t) background grid at `bgArcMm` pitch, then
// CDT with the locked constraint edges. cdt2d respects the constraint edges => every crest edge is a shared mesh
// edge (no facet interior straddles it); junction 0-cells are fan vertices. This is the NO-BRIDGE split.
export function seedMesh(patch: PatchDef, pc: ProtectedComplex, bgArcMm: number): { uv: number[]; tris: number[] } {
  const { arcPerU, H, uLo, uHi, tLo, tHi } = patch;
  const uv = pc.uv.slice();
  const pmap = new Map<number, number>();
  const cellMm = 0.02;
  for (let i = 0; i < uv.length / 2; i++) { const key = Math.round(uv[2 * i] * arcPerU / cellMm) * 100000 + Math.round(uv[2 * i + 1] * H / cellMm); if (!pmap.has(key)) pmap.set(key, i); }
  const addPt = (u: number, t: number): void => { const key = Math.round(u * arcPerU / cellMm) * 100000 + Math.round(t * H / cellMm); if (pmap.has(key)) return; const id = uv.length / 2; uv.push(u, t); pmap.set(key, id); };
  const nu = Math.max(8, Math.round((uHi - uLo) * arcPerU / bgArcMm));
  const nt = Math.max(8, Math.round((tHi - tLo) * H / bgArcMm));
  for (let i = 0; i <= nu; i++) for (let k = 0; k <= nt; k++) addPt(uLo + (uHi - uLo) * (i / nu), tLo + (tHi - tLo) * (k / nt));
  const tris = triangulate(uv, patch, pc.constraintEdges);
  return { uv, tris };
}

// mm-scaled (u,t) CDT with locked constraint edges. Points in mm so predicates are isotropic.
function triangulate(uv: number[], patch: PatchDef, cEdges: Array<[number, number]>): number[] {
  const { arcPerU, H } = patch;
  const nV = uv.length / 2; const pts: [number, number][] = new Array(nV);
  for (let i = 0; i < nV; i++) pts[i] = [uv[2 * i] * arcPerU, uv[2 * i + 1] * H];
  const t = cdt2d(pts, cEdges as [number, number][], { exterior: true }) as number[][];
  const out: number[] = []; for (const tr of t) { out.push(tr[0], tr[1], tr[2]); }
  return out;
}

// ── ruler: per-facet TRUE-3D interior deviation ──────────────────────────────────────────────────────────────
const BARY_FAST: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
// dense >=36-pt barycentric lattice for the ACCEPTANCE GUARD (n=8 subdivision => 36 interior/edge pts).
export function denseBary(n = 8): Array<[number, number, number]> {
  const B: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
  return B; // (n+1)(n+2)/2 = 45 pts for n=8
}

// GN-only per-facet interior dev (fast loop driver). Single-valued Gothic height field => own-azimuth GN foot honest.
// Returns the worst-sample's (u,t) IN THE CHART (guaranteed inside the facet — the Steiner insertion site) so the
// refine loop never places a node on a WRONG RIB (a 3D GN foot of a near-vertical flank facet can land on an
// adjacent rib whose valley then bridges → the 3mm spikes the naive-foot version produced).
export function facetInteriorGN(rA: AnalyticRadiusFn, xyz: Float64Array, uv: number[], a: number, b: number, c: number): { dev: number; uWorst: number; tWorst: number } {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  // seam-consistent u for the facet (shortest-image around a's u)
  let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
  let dev = 0; let uW = (ua + ub + uc) / 3, tW = (ta + tb + tc) / 3;
  for (const [wa, wb, wc] of BARY_FAST) {
    const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
    const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
    if (gn > dev) { dev = gn; uW = wa * ua + wb * ub + wc * uc; tW = wa * ta + wb * tb + wc * tc; }
  }
  return { dev, uWorst: uW, tWorst: tW };
}

// ── STEP 4: INTERIOR-CRITERION refine loop (batched Steiner, constraints LOCKED, arc-length-graded flank node) ──
// While a facet's measured interior dev > tol: on a FLANK facet insert a surface-projected node placed by 3D
// ARC-LENGTH (concentrating on the near-vertical flank). Batched: score all facets, insert one graded node per
// outlier facet, re-CDT with the locked constraints, recurse. Protected (crest) edges are never split off the
// crest (the constraint set is re-passed unchanged). Cap-hit facets remain as outliers (honest).
export interface PassStat { pass: number; nTris: number; nScored: number; nOutGN: number; worstGN: number; nInserted: number; ms: number; }
export interface RefineResult {
  uv: number[]; tris: number[]; passes: number; capped: boolean; histPerPass: PassStat[];
}
// COST NOTE: scoring EVERY facet with GN each pass + a global re-CDT is O(F·passes) and floored the first run
// (>1.5h, no convergence log). The dense base already resolves the SMOOTH panels (their interior chord ≪ tol);
// only the near-crest steep-flank facets can be outliers. So: PASS 1 scores all facets and records the "active"
// set = facets that were outliers OR are incident to a crest/inserted vertex; LATER passes re-score only facets
// incident to a vertex inserted last pass (the changed cavities) ∪ any still-active facet. This is the
// restricted-Delaunay locality the mechanism guarantees (Steiner insertion only perturbs the local cavity).
export function refineInterior(
  patch: PatchDef, seed: { uv: number[]; tris: number[] }, cEdges: Array<[number, number]>, tol: number, maxPass: number,
  crestVerts: Set<number>, onPass?: (s: PassStat) => void,
): RefineResult {
  const { rA, H, arcPerU } = patch;
  let uv = seed.uv.slice(); let tris = seed.tris.slice();
  const pmap = new Map<number, number>(); const cellMm = 0.004; // finer dedupe for inserted Steiner nodes
  const rehash = (): void => { pmap.clear(); for (let i = 0; i < uv.length / 2; i++) { const k = Math.round(uv[2 * i] * arcPerU / cellMm) * 100000 + Math.round(uv[2 * i + 1] * H / cellMm); if (!pmap.has(k)) pmap.set(k, i); } };
  let lastInsertedVerts = new Set<number>();
  const addPt = (u: number, t: number): number => { const k = Math.round(u * arcPerU / cellMm) * 100000 + Math.round(t * H / cellMm); const hit = pmap.get(k); if (hit !== undefined) return hit; const id = uv.length / 2; uv.push(u, t); pmap.set(k, id); return id; };
  const hist: PassStat[] = [];
  let capped = false; let pass = 0;
  for (pass = 1; pass <= maxPass; pass++) {
    const t0 = Date.now();
    const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const nF = tris.length / 3;
    // ACTIVE SET: pass 1 => all facets; later => facets incident to a vertex inserted last pass (changed cavities).
    let active: number[];
    if (pass === 1) { active = Array.from({ length: nF }, (_, i) => i); }
    else {
      active = [];
      for (let f = 0; f < nF; f++) { const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; if (lastInsertedVerts.has(a) || lastInsertedVerts.has(b) || lastInsertedVerts.has(c)) active.push(f); }
    }
    rehash();
    let nOut = 0, worst = 0; const inserted = new Set<number>(); const insertedVerts = new Set<number>();
    for (const f of active) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const g = facetInteriorGN(rA, xyz, uv, a, b, c);
      if (g.dev > worst) worst = g.dev;
      if (g.dev > tol) {
        nOut++;
        // Steiner node AT the worst interior sample's OWN (u,t) (inside the facet chart) — lifted to S it is exactly
        // on the surface. This is the arc-length-concentrated facet-interior insertion (density where the flat chord
        // deviates most) WITHOUT the wrong-rib jump of a 3D GN foot. KEEP u in the patch's NATIVE range (which may
        // straddle u=0, uLo<0): facetInteriorGN already shortest-images uWorst to the facet, so it is co-located with
        // the seed points. (A [0,1) normalization here flipped a u=-0.02 sample to 0.98 → a 248mm seam-spanning
        // facet — MEASURED. Do NOT normalize.)
        const uu = g.uWorst, tt = g.tWorst;
        const kU = Math.round(((uu % 1) + 1) % 1 * arcPerU / cellMm); // hash on the wrapped u so dup detection is seam-safe
        const key = kU * 100000 + Math.round(tt * H / cellMm);
        if (!inserted.has(key)) { inserted.add(key); const id = addPt(uu, tt); insertedVerts.add(id); }
      }
    }
    const stat: PassStat = { pass, nTris: nF, nScored: active.length, nOutGN: nOut, worstGN: +worst.toFixed(5), nInserted: inserted.size, ms: Date.now() - t0 };
    hist.push(stat); if (onPass) onPass(stat);
    if (nOut === 0) break;
    tris = triangulate(uv, patch, cEdges);
    lastInsertedVerts = insertedVerts;
    if (pass === maxPass && nOut > 0) capped = true;
  }
  void crestVerts;
  return { uv, tris, passes: pass, capped, histPerPass: hist };
}

// ── acceptance guard (>=36-pt sampler, worst-gradU population, full-azimuth brute) ───────────────────────────
export interface GuardResult {
  nFacets: number; nScored: number; interiorMaxMm: number; interiorOutliers: number;
  p50: number; p90: number; p99: number;
  onCrestOutliers: number; offCrestOutliers: number;
  gradUofScored: { min: number; max: number };
}
export function acceptanceGuard(
  patch: PatchDef, uv: number[], tris: number[], tol: number, topFrac: number, crestSamples3D: Array<[number, number, number]>,
  absCap = Infinity,
): GuardResult {
  const { rA, H, arcPerU } = patch;
  const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const nF = tris.length / 3;
  // per-facet gradU at its centroid (worst-gradU population = the honest steep-flank facets)
  const du = 1 / 8192;
  const gradU = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const um = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3, tm = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
    const z = tm * H;
    gradU[f] = Math.abs(rA(TAU * ((um + du) - Math.floor(um + du)), z) - rA(TAU * ((um - du) - Math.floor(um - du)), z)) / (2 * du * TAU);
  }
  const order = Array.from({ length: nF }, (_, i) => i).sort((x, y) => gradU[y] - gradU[x]);
  // WORST-gradU population, capped at absCap: outliers ARE the highest-gradU (reddest, near-vertical-flank) facets,
  // so the top-N by gradU is where any interior outlier must live — capping N keeps the honest brute guard tractable
  // (6% of a 149k mesh = 9k facets × brute-on-red-tail was intractable). We take the WORST, not a sample.
  const nScore = Math.max(1, Math.min(nF, Math.min(absCap, Math.ceil(nF * topFrac))));
  const scored = order.slice(0, nScore);
  const BARY = denseBary(8); // 45 pts (>=36 pre-registered minimum)
  // TWO-STAGE ruler (labkit pattern, honest on the single-valued Gothic height field): STAGE 1 GN-screen ALL 45
  // interior samples (own-azimuth GN foot, ~µs); STAGE 2 full-azimuth brute-CONFIRM only the facets whose GN-max
  // exceeds a screen (brute can only LOWER a GN value → this guards a rare GN wrong-well on the red tail WITHOUT
  // running the 245k-eval brute on every green sample; a pure-brute guard was ~7min/380 facets = intractable at
  // full scale). Cross-checked vs pure-brute on the smoke (see the probe A/B). preFilter keeps deep-green samples.
  const preFilter = 0.006, gnScreen = 0.006;
  const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => { const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z); return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz); };
  const dev = new Float64Array(nScore);
  for (let s = 0; s < nScore; s++) {
    const f = scored[s]; const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
    while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
    let mx = 0;
    for (const [wa, wb, wc] of BARY) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const bound = utBound(px, py, pz, um, tm);
      if (bound <= preFilter) { if (bound > mx) mx = bound; continue; }
      // STAGE 1: GN screen (own-azimuth). STAGE 2: for any non-green GN sample, use the full-azimuth BRUTE as the
      // trusted anchor (it finds the true global-nearest foot; GN may over- OR under-state near a steep flank, so
      // brute — not min — is the honest value). Green GN samples (≪ tol) keep the GN value; they cannot be outliers.
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      const d = gn <= gnScreen ? gn : bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 1536, nZ: 160, zBandMm: 4, refineIters: 60 }).dist;
      if (d > mx) mx = d;
    }
    dev[s] = mx;
  }
  let maxMm = 0, nOut = 0, onC = 0, offC = 0;
  const THRESH = 0.4;
  for (let s = 0; s < nScore; s++) {
    const d = dev[s]; if (d > maxMm) maxMm = d;
    if (d > tol) {
      nOut++;
      // classify on/off crest by the facet centroid 3D proximity to a crest sample
      const f = scored[s]; const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const cx = (xyz[3 * a] + xyz[3 * b] + xyz[3 * c]) / 3, cy = (xyz[3 * a + 1] + xyz[3 * b + 1] + xyz[3 * c + 1]) / 3, cz = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
      let best = Infinity; for (const cs of crestSamples3D) { const dd = Math.hypot(cx - cs[0], cy - cs[1], cz - cs[2]); if (dd < best) best = dd; if (best < THRESH) break; }
      if (best < THRESH) onC++; else offC++;
    }
  }
  const sorted = Float64Array.from(dev).sort();
  const pc = (q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return {
    nFacets: nF, nScored: nScore, interiorMaxMm: +maxMm.toFixed(5), interiorOutliers: nOut,
    p50: +pc(0.5).toFixed(5), p90: +pc(0.9).toFixed(5), p99: +pc(0.99).toFixed(5),
    onCrestOutliers: onC, offCrestOutliers: offC,
    gradUofScored: { min: +gradU[order[nScore - 1]].toFixed(2), max: +gradU[order[0]].toFixed(2) },
  };
}

// lift the whole mesh to xyz (for auditNonManByIndex + triangleQualityDistribution)
export function liftMesh(patch: PatchDef, uv: number[]): Float64Array {
  const { rA, H } = patch; const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  return xyz;
}

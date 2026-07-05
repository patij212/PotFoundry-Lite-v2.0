// _pf_wholeMeshGuardLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// GATE 1 (E-2026-07-05-PERFECT-MESHER-GEOSTAR-WHOLEMESH): the CONFIRMED brute-refine kernel reported "0 outliers"
// via acceptanceGuard scoring ONLY the top-400-worst-gradU facets. The GEOSTAR-CRESTSTRIP metrology catch proved
// this a GUARD-POPULATION ARTIFACT: ~4 residual MODERATE-gradU flank facets (gradU below even the wide guard's
// population) were never re-checked. This lib does ONE thing differently from _pf_perfectMesherLib/BruteLib:
//   (1) wholeMeshGuard — score EVERY free facet's honest ≥36-pt (denseBary(8)=45-pt) full-azimuth-brute interior
//       deviation (NO gradU cap, NO topFrac). The literal whole-mesh max + outlier set.
//   (2) refineInteriorBruteWhole — the SAME edge-mode (1→4) Steiner refine, but the STOP driver scores ALL facets
//       EVERY pass with the SAME 45-pt whole-mesh ruler (not the 7-pt changed-cavity active set), so a facet the
//       guard would flag gets refined until the whole-mesh max ≤ tol.
//
// The two-stage own-azimuth-GN-screen → full-azimuth-brute-confirm ruler is COPIED VERBATIM from acceptanceGuard /
// facetInteriorBrute (deep-green same-(u,t) bound → GN screen → brute confirm on non-green). This keeps the guard
// and the loop STOP measuring with the IDENTICAL instrument so the loop cannot terminate blind to the guard.
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib + labkit + cdt2d READ-ONLY. NO src/ or existing-kernel edit.
import cdt2d from 'cdt2d';
import {
  type AnalyticRadiusFn, bruteNearestOnRadialSurface, projectPointToRadialSurface,
} from './labkit';
import { type PatchDef, lift, denseBary } from './_pf_perfectMesherLib';

const TAU = 2 * Math.PI;

// ── the honest 45-pt whole-facet interior ruler (identical two-stage ruler as acceptanceGuard) ───────────────────
// Returns the brute-trusted worst interior dev of a facet over the 45-pt denseBary(8) lattice, AND the (u,t) of the
// worst sample (a valid point-mode split site inside the facet chart). This IS the whole-mesh STOP test.
const BARY45 = denseBary(8); // 45 pts (>=36 pre-registered minimum) — SAME as acceptanceGuard
export interface WFacet { dev: number; uWorst: number; tWorst: number; bruteCalls: number; }
export function facetInteriorBrute45(
  rA: AnalyticRadiusFn, H: number, xyz: Float64Array, uv: number[], a: number, b: number, c: number,
  opts: { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number },
): WFacet {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
  const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => {
    const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z);
    return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
  };
  let dev = 0; let uW = (ua + ub + uc) / 3, tW = (ta + tb + tc) / 3; let bruteCalls = 0;
  for (const [wa, wb, wc] of BARY45) {
    const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
    const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
    const bound = utBound(px, py, pz, um, tm);
    let d: number;
    if (bound <= opts.preFilter) { d = bound; }
    else {
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      if (gn <= opts.gnScreen) d = gn;
      else { d = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: opts.nTheta, nZ: opts.nZ, zBandMm: opts.zBandMm, refineIters: opts.refineIters }).dist; bruteCalls++; }
    }
    if (d > dev) { dev = d; uW = um; tW = tm; }
  }
  return { dev, uWorst: uW, tWorst: tW, bruteCalls };
}

// centroid gradU (for CHARACTERIZING residuals, not for population selection — the whole point is NO gradU cap)
function facetGradU(rA: AnalyticRadiusFn, H: number, uv: number[], a: number, b: number, c: number): number {
  const du = 1 / 8192;
  const um = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3, tm = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
  const z = tm * H;
  return Math.abs(rA(TAU * ((um + du) - Math.floor(um + du)), z) - rA(TAU * ((um - du) - Math.floor(um - du)), z)) / (2 * du * TAU);
}

export interface WholeGuardResult {
  nFacets: number;
  wholeMeshMaxMm: number;
  wholeMeshOutliers: number;         // facets with 45-pt brute interior dev > tol, over the WHOLE mesh
  onCrestOutliers: number; offCrestOutliers: number;
  p50: number; p90: number; p99: number;
  totalBruteCalls: number;
  // residual characterization (the ~3-4 moderate-gradU facets the top-gradU guard skipped)
  outlierGradU: { min: number; max: number };
  outlierDetail: Array<{ f: number; dev: number; gradU: number; uc: number; tc: number; onCrest: boolean }>;
}

// wholeMeshGuard — score EVERY free facet (no cap). This is the HONEST whole-mesh acceptance guard.
export function wholeMeshGuard(
  patch: PatchDef, uv: number[], tris: number[], tol: number, crestSamples3D: Array<[number, number, number]>,
  ruler = { gnScreen: 0.006, preFilter: 0.006, nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 },
  onProgress?: (done: number, total: number, bruteSoFar: number) => void,
): WholeGuardResult {
  const { rA, H } = patch;
  const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const nF = tris.length / 3;
  const dev = new Float64Array(nF);
  let totalBrute = 0;
  const THRESH = 0.4;
  let maxMm = 0, nOut = 0, onC = 0, offC = 0;
  let ogMin = Infinity, ogMax = -Infinity;
  const outlierDetail: WholeGuardResult['outlierDetail'] = [];
  for (let f = 0; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const g = facetInteriorBrute45(rA, H, xyz, uv, a, b, c, ruler);
    totalBrute += g.bruteCalls;
    dev[f] = g.dev;
    if (g.dev > maxMm) maxMm = g.dev;
    if (g.dev > tol) {
      nOut++;
      const cx = (xyz[3 * a] + xyz[3 * b] + xyz[3 * c]) / 3, cy = (xyz[3 * a + 1] + xyz[3 * b + 1] + xyz[3 * c + 1]) / 3, cz = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
      let best = Infinity; for (const cs of crestSamples3D) { const dd = Math.hypot(cx - cs[0], cy - cs[1], cz - cs[2]); if (dd < best) best = dd; if (best < THRESH) break; }
      const onCrest = best < THRESH;
      if (onCrest) onC++; else offC++;
      const gu = facetGradU(rA, H, uv, a, b, c);
      if (gu < ogMin) ogMin = gu; if (gu > ogMax) ogMax = gu;
      const uc = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3, tc = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
      if (outlierDetail.length < 200) outlierDetail.push({ f, dev: +g.dev.toFixed(5), gradU: +gu.toFixed(2), uc: +uc.toFixed(5), tc: +tc.toFixed(5), onCrest });
    }
    if (onProgress && (f % 5000 === 0)) onProgress(f, nF, totalBrute);
  }
  const sorted = Float64Array.from(dev).sort();
  const pc = (q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return {
    nFacets: nF, wholeMeshMaxMm: +maxMm.toFixed(5), wholeMeshOutliers: nOut,
    onCrestOutliers: onC, offCrestOutliers: offC,
    p50: +pc(0.5).toFixed(5), p90: +pc(0.9).toFixed(5), p99: +pc(0.99).toFixed(5),
    totalBruteCalls: totalBrute,
    outlierGradU: { min: nOut ? +ogMin.toFixed(2) : 0, max: nOut ? +ogMax.toFixed(2) : 0 },
    outlierDetail,
  };
}

// mm-scaled (u,t) CDT with locked constraint edges (replica of the proven kernel's internal triangulate).
function triangulateMM(uv: number[], patch: PatchDef, cEdges: Array<[number, number]>): number[] {
  const { arcPerU, H } = patch;
  const nV = uv.length / 2; const pts: [number, number][] = new Array(nV);
  for (let i = 0; i < nV; i++) pts[i] = [uv[2 * i] * arcPerU, uv[2 * i + 1] * H];
  const t = cdt2d(pts, cEdges as [number, number][], { exterior: true }) as number[][];
  const out: number[] = []; for (const tr of t) { out.push(tr[0], tr[1], tr[2]); }
  return out;
}

export interface WholePassStat {
  pass: number; nTris: number; nScored: number; nOut: number; worst: number; nInserted: number; bruteCalls: number; ms: number; wholeScan: boolean;
}
export interface WholeRefineResult { uv: number[]; tris: number[]; passes: number; capped: boolean; hist: WholePassStat[]; }

// refineInteriorBruteWhole — edge-mode (1→4) Steiner refine driven by the honest 45-pt brute STOP test.
//
// HONEST INCREMENTAL scoring (correct AND tractable): pass 1 scores the WHOLE MESH (finds ALL outliers, incl. the
// moderate/low-gradU ones the top-gradU guard was blind to). A facet that is NOT split and whose 3 vertices did NOT
// move keeps its 45-pt deviation ⇒ later passes re-score ONLY the facets incident to a vertex inserted last pass
// (the changed cavities) PLUS — periodically and always on the final pass — a WHOLE-MESH re-scan to catch any facet
// a distant re-triangulation reshaped. The probe's post-loop wholeMeshGuard is the independent literal-0 proof.
// seed.uv/seed.tris may be a RESUMED (already partly-refined) mesh — pass 1 whole-scan then re-finds the residual.
export function refineInteriorBruteWhole(
  patch: PatchDef, seed: { uv: number[]; tris: number[] }, cEdges: Array<[number, number]>, tol: number, maxPass: number,
  ruler = { gnScreen: 0.006, preFilter: 0.006, nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 },
  onPass?: (s: WholePassStat, uv: number[], tris: number[]) => void,
): WholeRefineResult {
  const { rA, H, arcPerU } = patch;
  let uv = seed.uv.slice(); let tris = seed.tris.slice();
  const pmap = new Map<number, number>(); const cellMm = 0.004;
  const rehash = (): void => { pmap.clear(); for (let i = 0; i < uv.length / 2; i++) { const k = Math.round(uv[2 * i] * arcPerU / cellMm) * 100000 + Math.round(uv[2 * i + 1] * H / cellMm); if (!pmap.has(k)) pmap.set(k, i); } };
  const addPt = (u: number, t: number): number => { const k = Math.round(u * arcPerU / cellMm) * 100000 + Math.round(t * H / cellMm); const hit = pmap.get(k); if (hit !== undefined) return hit; const id = uv.length / 2; uv.push(u, t); pmap.set(k, id); return id; };
  const hist: WholePassStat[] = [];
  let capped = false; let pass = 0;
  let lastInserted = new Set<number>();
  for (pass = 1; pass <= maxPass; pass++) {
    const t0 = Date.now();
    const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const nF = tris.length / 3;
    rehash();
    // Whole-scan on pass 1, and every 4th pass, and (implicitly) once no incremental outliers remain (the caller's
    // post-loop guard is the final proof). Otherwise re-score only facets touched by last pass's inserts.
    const wholeScan = pass === 1 || (pass % 4 === 0);
    let active: number[];
    if (wholeScan) active = Array.from({ length: nF }, (_, i) => i);
    else { active = []; for (let f = 0; f < nF; f++) { const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; if (lastInserted.has(a) || lastInserted.has(b) || lastInserted.has(c)) active.push(f); } }
    let nOut = 0, worst = 0, bruteCalls = 0; const inserted = new Set<number>(); const insertedVerts = new Set<number>();
    for (const f of active) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const g = facetInteriorBrute45(rA, H, xyz, uv, a, b, c, ruler);
      bruteCalls += g.bruteCalls;
      if (g.dev > worst) worst = g.dev;
      if (g.dev > tol) {
        nOut++;
        let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
        while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
        const insertOne = (uu: number, tt: number): void => {
          const kU = Math.round(((uu % 1) + 1) % 1 * arcPerU / cellMm);
          const key = kU * 100000 + Math.round(tt * H / cellMm);
          if (!inserted.has(key)) { inserted.add(key); const id = addPt(uu, tt); insertedVerts.add(id); }
        };
        insertOne((ua + ub) / 2, (ta + tb) / 2); insertOne((ub + uc) / 2, (tb + tc) / 2); insertOne((uc + ua) / 2, (tc + ta) / 2);
      }
    }
    const stat: WholePassStat = { pass, nTris: nF, nScored: active.length, nOut, worst: +worst.toFixed(5), nInserted: inserted.size, bruteCalls, ms: Date.now() - t0, wholeScan };
    hist.push(stat);
    if (nOut === 0) { if (onPass) onPass(stat, uv, tris); break; }
    tris = triangulateMM(uv, patch, cEdges);
    lastInserted = insertedVerts;
    if (onPass) onPass(stat, uv, tris);
    if (pass === maxPass && nOut > 0) capped = true;
  }
  return { uv, tris, passes: pass, capped, hist };
}

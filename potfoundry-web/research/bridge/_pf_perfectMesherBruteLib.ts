// _pf_perfectMesherBruteLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// THE CRUX EXPERIMENT (E-2026-07-04-PERFECT-MESHER-GOTHIC recommendation (i)):
//   The end-to-end kernel REFUTED because its refine-loop TERMINATION was driven by the GN ruler, which UNDERSTATES
//   true-3D on near-vertical Gothic flanks (gradU 230-253) — it stopped at worstGN 0.0085 while the honest
//   full-azimuth brute reveals a 0.133mm on-crest floor. So the loop never ran to HONEST convergence.
//
// This lib keeps the PROVEN topology pipeline (makeGothicPatch / extractProtectedComplex / seedMesh / acceptanceGuard
// / liftMesh — imported READ-ONLY from _pf_perfectMesherLib) and changes ONE thing:
//   refineInteriorBrute drives the STOP test by the HONEST full-azimuth BRUTE interior deviation (two-stage
//   GN-screen -> brute-confirm on non-green samples, the SAME honest ruler acceptanceGuard uses), NOT bare GN.
//   GN may still PROPOSE the split site cheaply (uWorst/tWorst inside the facet chart), but a facet is an OUTLIER —
//   and thus keeps refining — iff its brute-confirmed interior dev > tol.
//
// STEP 2 (only if flat-P1-brute still floors >0.01 at the sharpest apex): swap ONLY the last-1-2-ring near-apex leaf
//   triangles for a ONE-SIDED Vlachos PN curved element (the E-RACE-CRESTRIBBON graft, scoped to the apex leaf) and
//   re-measure under the SAME honest brute. applyApexPN returns the corrected interior dev for those leaves.
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib + labkit + cdt2d READ-ONLY. NO src/ or existing-kernel edit.
import cdt2d from 'cdt2d';
import {
  type AnalyticRadiusFn, bruteNearestOnRadialSurface, projectPointToRadialSurface,
} from './labkit';
import { type PatchDef, lift, denseBary } from './_pf_perfectMesherLib';

const TAU = 2 * Math.PI;

// ── honest two-stage interior ruler (own-azimuth GN screen -> full-azimuth brute confirm on non-green) ───────────
// Returns the HONEST (brute-trusted) worst interior dev of a facet AND the GN-proposed split site (uWorst,tWorst in
// the facet chart, guaranteed inside the facet — never a wrong-rib 3D foot). This IS the honest stop test.
const BARY_STOP: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3],
  [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3], // 7 interior/edge pts — dense enough to catch the near-crest apex chord
];
export interface HonestFacet { dev: number; uWorst: number; tWorst: number; bruteCalls: number; }
export function facetInteriorBrute(
  rA: AnalyticRadiusFn, H: number, xyz: Float64Array, uv: number[], a: number, b: number, c: number,
  opts: { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number },
): HonestFacet {
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
  for (const [wa, wb, wc] of BARY_STOP) {
    const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
    const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
    const bound = utBound(px, py, pz, um, tm); // same-(u,t) upper bound — cannot be < true nearest
    let d: number;
    if (bound <= opts.preFilter) { d = bound; } // deep-green: true dist <= bound <= preFilter <= tol, cannot be an outlier
    else {
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      if (gn <= opts.gnScreen) d = gn; // green GN => cannot be an outlier; keep the cheap value
      else { d = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: opts.nTheta, nZ: opts.nZ, zBandMm: opts.zBandMm, refineIters: opts.refineIters }).dist; bruteCalls++; }
    }
    if (d > dev) { dev = d; uW = um; tW = tm; }
  }
  return { dev, uWorst: uW, tWorst: tW, bruteCalls };
}

// mm-scaled (u,t) CDT with locked constraint edges (replica of the proven lib's internal `triangulate`).
function triangulateMM(uv: number[], patch: PatchDef, cEdges: Array<[number, number]>): number[] {
  const { arcPerU, H } = patch;
  const nV = uv.length / 2; const pts: [number, number][] = new Array(nV);
  for (let i = 0; i < nV; i++) pts[i] = [uv[2 * i] * arcPerU, uv[2 * i + 1] * H];
  const t = cdt2d(pts, cEdges as [number, number][], { exterior: true }) as number[][];
  const out: number[] = []; for (const tr of t) { out.push(tr[0], tr[1], tr[2]); }
  return out;
}

// ── STEP 1: BRUTE-DRIVEN interior-criterion refine loop ──────────────────────────────────────────────────────
// Same batched Steiner mechanism as refineInterior, but the STOP test is the honest brute (facetInteriorBrute).
// A facet keeps refining while its brute-confirmed interior dev > tol. Cap-hit facets remain outliers (honest).
export interface BrutePassStat {
  pass: number; nTris: number; nScored: number; nOutBrute: number; worstBrute: number; nInserted: number;
  bruteCalls: number; ms: number;
}
export interface BruteRefineResult {
  uv: number[]; tris: number[]; passes: number; capped: boolean; histPerPass: BrutePassStat[];
}
// mode='point' (default): insert ONE node at the worst interior sample (u,t) of each outlier facet — the original
//   arc-length-graded mechanism. Slow at a persistent apex (the worst sample can sit near a vertex, barely shrinking
//   the facet), so it can hit the pass cap with a few residual apex facets.
// mode='edge': RED-refine each outlier facet at all 3 EDGE MIDPOINTS (1->4 split) — halves every edge each pass, so
//   a persistent apex facet converges geometrically (Boissonnat-Oudot). Places midpoints in the (u,t) chart (lifted
//   on-surface); constraint edges are re-passed so crest edges stay shared (the midpoint of a crest edge is ITSELF
//   on the crest). This is the density the point-mode loop under-delivered at the zero-width apex.
export function refineInteriorBrute(
  patch: PatchDef, seed: { uv: number[]; tris: number[] }, cEdges: Array<[number, number]>, tol: number, maxPass: number,
  ruler: { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number },
  onPass?: (s: BrutePassStat) => void, mode: 'point' | 'edge' = 'point',
): BruteRefineResult {
  const { rA, H, arcPerU } = patch;
  let uv = seed.uv.slice(); let tris = seed.tris.slice();
  const pmap = new Map<number, number>(); const cellMm = 0.004;
  const rehash = (): void => { pmap.clear(); for (let i = 0; i < uv.length / 2; i++) { const k = Math.round(uv[2 * i] * arcPerU / cellMm) * 100000 + Math.round(uv[2 * i + 1] * H / cellMm); if (!pmap.has(k)) pmap.set(k, i); } };
  const addPt = (u: number, t: number): number => { const k = Math.round(u * arcPerU / cellMm) * 100000 + Math.round(t * H / cellMm); const hit = pmap.get(k); if (hit !== undefined) return hit; const id = uv.length / 2; uv.push(u, t); pmap.set(k, id); return id; };
  let lastInsertedVerts = new Set<number>();
  const hist: BrutePassStat[] = [];
  let capped = false; let pass = 0;
  for (pass = 1; pass <= maxPass; pass++) {
    const t0 = Date.now();
    const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const nF = tris.length / 3;
    // ACTIVE SET: pass 1 => all facets; later => facets incident to a vertex inserted last pass (changed cavities).
    // NOTE: the two-stage ruler makes pass-1 all-facet scoring cheap — deep-green (smooth panel) facets never reach
    // the brute stage (bounded < preFilter or GN < gnScreen), so brute fires only on the near-crest steep tail.
    let active: number[];
    if (pass === 1) active = Array.from({ length: nF }, (_, i) => i);
    else { active = []; for (let f = 0; f < nF; f++) { const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; if (lastInsertedVerts.has(a) || lastInsertedVerts.has(b) || lastInsertedVerts.has(c)) active.push(f); } }
    rehash();
    let nOut = 0, worst = 0, bruteCalls = 0; const inserted = new Set<number>(); const insertedVerts = new Set<number>();
    for (const f of active) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const g = facetInteriorBrute(rA, H, xyz, uv, a, b, c, ruler);
      bruteCalls += g.bruteCalls;
      if (g.dev > worst) worst = g.dev;
      if (g.dev > tol) {
        nOut++;
        const insertOne = (uu: number, tt: number): void => {
          const kU = Math.round(((uu % 1) + 1) % 1 * arcPerU / cellMm);
          const key = kU * 100000 + Math.round(tt * H / cellMm);
          if (!inserted.has(key)) { inserted.add(key); const id = addPt(uu, tt); insertedVerts.add(id); }
        };
        if (mode === 'edge') {
          // seam-consistent u for the 3 corners (so the midpoint is not a seam-spanning average)
          let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
          while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
          insertOne((ua + ub) / 2, (ta + tb) / 2); insertOne((ub + uc) / 2, (tb + tc) / 2); insertOne((uc + ua) / 2, (tc + ta) / 2);
        } else {
          insertOne(g.uWorst, g.tWorst);
        }
      }
    }
    const stat: BrutePassStat = { pass, nTris: nF, nScored: active.length, nOutBrute: nOut, worstBrute: +worst.toFixed(5), nInserted: inserted.size, bruteCalls, ms: Date.now() - t0 };
    hist.push(stat); if (onPass) onPass(stat);
    if (nOut === 0) break;
    tris = triangulateMM(uv, patch, cEdges);
    lastInsertedVerts = insertedVerts;
    if (pass === maxPass && nOut > 0) capped = true;
  }
  return { uv, tris, passes: pass, capped, histPerPass: hist };
}

// ── STEP 2: scoped near-apex one-sided PN (Vlachos) element, ONLY on the last-ring leaves at each cusp apex ───────
// For a leaf triangle that still floors > tol under the brute after Step-1 refine AND is on-crest (apex-adjacent),
// replace the FLAT interior with a one-sided Vlachos PN cubic bezier patch built from the 3 corner positions +
// surface normals, then measure the SAME dense interior samples against the true surface. This rides ONE smooth
// flank instead of chording across the ridge. Returns the corrected worst interior dev for the leaf.
//
// Vlachos PN triangle: control net from P_i and normals N_i. Interior point at barycentric (u,v,w):
//   b(u,v,w) = sum over the 10 cubic Bezier control points b_ijk * (3!/(i!j!k!)) u^i v^j w^k.
// Corner controls = P_i; edge controls b_ijk = (2 P_i + P_j - ((P_j-P_i)·N_i) N_i)/3 (tangent-plane projection);
// center b111 = 3/2 * (average of the 6 edge controls) - 1/2 * (average of the 3 corners) (Vlachos eq.).
function surfaceNormal(rA: AnalyticRadiusFn, u: number, t: number, H: number): [number, number, number] {
  const du = 1 / 8192, dt = 0.5 / H;
  const p0 = lift(rA, u, t, H);
  const pu = lift(rA, u + du, t, H); const pt = lift(rA, u, t + dt, H);
  const tu: [number, number, number] = [pu[0] - p0[0], pu[1] - p0[1], pu[2] - p0[2]];
  const tt: [number, number, number] = [pt[0] - p0[0], pt[1] - p0[1], pt[2] - p0[2]];
  let nx = tu[1] * tt[2] - tu[2] * tt[1], ny = tu[2] * tt[0] - tu[0] * tt[2], nz = tu[0] * tt[1] - tu[1] * tt[0];
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  // outward-orient (radial +)
  const th = TAU * (u - Math.floor(u)); const rx = Math.cos(th), ry = Math.sin(th);
  if (nx * rx + ny * ry < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return [nx, ny, nz];
}
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// edge control from P_i toward P_j given N_i (Vlachos w_ij projection)
function edgeCtrl(Pi: V3, Pj: V3, Ni: V3): V3 {
  const w = dot(sub(Pj, Pi), Ni);
  return [(2 * Pi[0] + Pj[0] - w * Ni[0]) / 3, (2 * Pi[1] + Pj[1] - w * Ni[1]) / 3, (2 * Pi[2] + Pj[2] - w * Ni[2]) / 3];
}
export interface ApexPNResult { devFlat: number; devPN: number; }
export function apexLeafPN(
  rA: AnalyticRadiusFn, H: number, P0: V3, P1: V3, P2: V3, uv0: V3, uv1: V3, uv2: V3,
  ruler: { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number },
): ApexPNResult {
  // uv0/uv1/uv2 = (u,t,_) of the 3 corners (only u,t used) — for the true-surface sample locations.
  const N0 = surfaceNormal(rA, uv0[0], uv0[1], H), N1 = surfaceNormal(rA, uv1[0], uv1[1], H), N2 = surfaceNormal(rA, uv2[0], uv2[1], H);
  // 6 edge + center controls
  const b210 = edgeCtrl(P0, P1, N0), b120 = edgeCtrl(P1, P0, N1);
  const b021 = edgeCtrl(P1, P2, N1), b012 = edgeCtrl(P2, P1, N2);
  const b102 = edgeCtrl(P2, P0, N2), b201 = edgeCtrl(P0, P2, N0);
  const E: V3 = [(b210[0] + b120[0] + b021[0] + b012[0] + b102[0] + b201[0]) / 6, (b210[1] + b120[1] + b021[1] + b012[1] + b102[1] + b201[1]) / 6, (b210[2] + b120[2] + b021[2] + b012[2] + b102[2] + b201[2]) / 6];
  const Vc: V3 = [(P0[0] + P1[0] + P2[0]) / 3, (P0[1] + P1[1] + P2[1]) / 3, (P0[2] + P1[2] + P2[2]) / 3];
  const b111: V3 = [E[0] + (E[0] - Vc[0]) / 2, E[1] + (E[1] - Vc[1]) / 2, E[2] + (E[2] - Vc[2]) / 2];
  // evaluate PN at barycentric (w0,w1,w2) with w0+w1+w2=1 (i on P0, etc.)
  const pn = (w0: number, w1: number, w2: number): V3 => {
    const u = w0, v = w1, w = w2;
    const t3 = (P: V3, c: number): V3 => [P[0] * c, P[1] * c, P[2] * c];
    const terms: Array<[V3, number]> = [
      [P0, u * u * u], [P1, v * v * v], [P2, w * w * w],
      [b210, 3 * u * u * v], [b120, 3 * u * v * v], [b021, 3 * v * v * w],
      [b012, 3 * v * w * w], [b102, 3 * u * w * w], [b201, 3 * u * u * w],
      [b111, 6 * u * v * w],
    ];
    const out: V3 = [0, 0, 0];
    for (const [P, c] of terms) { const s = t3(P, c); out[0] += s[0]; out[1] += s[1]; out[2] += s[2]; }
    return out;
  };
  // measure flat AND PN interior dev at the same dense barycentric lattice (denseBary(8) = 45 pts)
  const BARY = denseBary(8);
  const measure = (evalP: (w0: number, w1: number, w2: number) => V3): number => {
    let mx = 0;
    for (const [w0, w1, w2] of BARY) {
      const P = evalP(w0, w1, w2);
      const gn = projectPointToRadialSurface(P[0], P[1], P[2], rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      const d = gn <= ruler.gnScreen ? gn : bruteNearestOnRadialSurface(P[0], P[1], P[2], rA, H, { nTheta: ruler.nTheta, nZ: ruler.nZ, zBandMm: ruler.zBandMm, refineIters: ruler.refineIters }).dist;
      if (d > mx) mx = d;
    }
    return mx;
  };
  const flatEval = (w0: number, w1: number, w2: number): V3 => [w0 * P0[0] + w1 * P1[0] + w2 * P2[0], w0 * P0[1] + w1 * P1[1] + w2 * P2[1], w0 * P0[2] + w1 * P1[2] + w2 * P2[2]];
  return { devFlat: measure(flatEval), devPN: measure(pn) };
}


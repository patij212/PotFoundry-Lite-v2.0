// frontierRefine.ts — DOES THE ORIENTATION CHORD CONVERGE UNDER REFINEMENT, AND WHAT DOES THE BAR COST?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CONTRADICTION THIS EXISTS TO RESOLVE. §0e.2 of the state-of-the-campaign doc lists
// "**density x0.9968**" among the operators that are "measured dead" for orientation. But the campaign's
// orientation bar is a CHORD — `2 sin(theta/2) * diam`, an ANGLE times a LENGTH — and `orientRuler.ts`'s
// own docstring attributes that 0.9968 to S61 H2 as *"the angle is density-INVARIANT on a turn"*. Those
// are two different quantities:
//
//     smooth patch:  theta ~ kappa*d  and  diam ~ d   =>  chord ~ kappa*d^2   (QUADRATIC in d)
//     C0 crease   :  theta ~ dihedral (INVARIANT)     =>  chord ~ dihedral*d  (LINEAR in d)
//
// So on a crease the ANGLE is exactly density-invariant — 0.9968 is the correct answer to that question —
// while the CHORD, which is the quantity the 10 um bar is applied to, must still fall like d. If the
// campaign has been reading an angle result as a refutation of density for a chord bar, then "orientation
// has no known lever" is false and the lever is the oldest one there is.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED HYPOTHESIS AND KILL LINE  (written before the first run)
//
//   H-D: exact 1->4 red refinement, with the three edge midpoints taken in the (theta, z) parameter plane
//        and LIFTED ONTO THE SURFACE (r = rA(theta_m, z_m) — the mesher's own `addV` contract, so every
//        child vertex is on the surface by construction and nothing here needs a representation change),
//        reduces the over-bar orientation CHORD area by >= 2x per level.
//   *** KILL: if one level moves the over-bar chord area by less than 1.18x (i.e. ratio > 0.85), density
//        is genuinely dead for the chord bar too and §0e.2 stands as written. ***
//
//   H-E (the price): running that refinement ADAPTIVELY — split only children still over the bar — the
//        area-weighted leaf multiplier is the honest triangle cost of the orientation bar. Reported next
//        to the same multiplier for a 10 um POSITION bar on the same facets, because the whole question of
//        whether the orientation bar is worth paying is the RATIO of those two numbers.
//
// CONTROLS
//   * the parent facet is scored from its OWN STL coordinates, unmodified; only children are synthesised.
//   * `vertex-on-surface` residual is printed for the sampled parents' vertices. If the mesh's vertices
//     are not on the analytic surface, every child here is being lifted onto a different surface than the
//     parent lives on and the comparison is void.
//   * the level-0 column must reproduce the taxonomy census's over-bar area on the same sample. Non-vacuity.
//   * every chord here is the SAME covering ruler (k=8, inset 0.02, sup over an order-k barycentric
//     lattice) used everywhere else. No centroid samples.
//   * a NULL arm (PF_FD_NULL=1) re-scores each parent as 4 copies of ITSELF at 1/4 area — a "refinement"
//     that adds triangles without shrinking footprints. If the real arm beats the null the win is the
//     geometry, not the bookkeeping.
//
// Usage: bash research/tools/run-frontier-refine.sh
//   env: PF_FD_STYLE PF_FD_STL PF_FD_TAG PF_FD_N(2000) PF_FD_K(8) PF_FD_INSET(0.02) PF_FD_BAR_UM(10)
//        PF_FD_MAXLEV(6) PF_FD_H/RB/RT PF_FD_NULL
import { mkdirSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_FD_STYLE ?? 'GothicArches';
const STL = process.env.PF_FD_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_FD_TAG ?? 'S39CTL';
const NSAMP = Math.round(envF('PF_FD_N', 2000));
const K = Math.round(envF('PF_FD_K', 8));
const INSET = envF('PF_FD_INSET', 0.02);
const BAR_UM = envF('PF_FD_BAR_UM', 10);
const MAXLEV = Math.round(envF('PF_FD_MAXLEV', 8));
/** the UNIFORM sweep is 4^L triangles per parent — it is the expensive one and only needs to show a RATE. */
const UNILEV = Math.round(envF('PF_FD_UNILEV', 3));
const NULLARM = process.env.PF_FD_NULL === '1';
const DIMS: StyleDims = { H: envF('PF_FD_H', 120), Rb: envF('PF_FD_RB', 40), Rt: envF('PF_FD_RT', 50), expn: 1 };
const H = DIMS.H;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

const T0 = Date.now();
mkdirSync('research/exchange/_strataConformBisect/frontier', { recursive: true });
log('===== FRONTIER REFINE — DOES THE ORIENTATION CHORD CONVERGE, AND WHAT DOES THE BAR COST? =====');
log(`style ${STYLE}  tag ${TAG}  bar ${BAR_UM} um  covering k=${K} inset=${INSET}  uniformLevels ${UNILEV}  adaptiveMax ${MAXLEV}${NULLARM ? '  *** NULL ARM ***' : ''}`);
log(`STL ${STL}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`mesh ${nTri} facets  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}
const idx = goldenIdx(nTri, NSAMP);
const NS = idx.length;
log(`sample ${NS} parents (${((100 * NS) / nTri).toFixed(3)}%), golden stride`);

const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const sc = INSET / 3;
  let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + sc; const b = sh * (j / K) + sc;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}
const HARC = 2e-4; const HZ = 2e-4;

/** lift a parameter point onto the surface. THIS IS THE MESHER'S OWN `addV` CONTRACT. */
function lift(th: number, z: number): [number, number, number] {
  const r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

interface Score { chordUm: number; area: number; dPerpUm: number; angDeg: number; }
/** covering chord + position proxy for one triangle given 3D coords AND unwrapped params. */
function score(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
  ath: number, bth: number, cth: number,
): Score {
  const eA = Math.hypot(bx - cx, by - cy, bz - cz);
  const eB = Math.hypot(ax - cx, ay - cy, az - cz);
  const eC = Math.hypot(ax - bx, ay - by, az - bz);
  const diam = Math.max(eA, eB, eC);
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const area = 0.5 * fl;
  if (!(fl > 0)) return { chordUm: 0, area: 0, dPerpUm: 0, angDeg: 0 };
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  let best = -1; let dPerpMax = 0;
  for (let p = 0; p < LP; p += 1) {
    const th = wA[p] * ath + wB[p] * bth + wC[p] * cth;
    const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const r0 = rA(th, zz);
    const hTh = HARC / Math.max(1e-9, Math.abs(r0));
    let zLo = zz - HZ; let zHi = zz + HZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
    const rt = (rA(th + hTh, zz) - rA(th - hTh, zz)) / (2 * hTh);
    const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
    const c = Math.cos(th); const s = Math.sin(th);
    let vx = rt * s + r0 * c; let vy = r0 * s - rt * c; let vz = -r0 * rz;
    const L = Math.hypot(vx, vy, vz) || 1; vx /= L; vy /= L; vz /= L;
    let d = fx * vx + fy * vy + fz * vz; d = d > 1 ? 1 : d < -1 ? -1 : d;
    const a = Math.acos(d);
    if (a > best) best = a;
    const px = wA[p] * ax + wB[p] * bx + wC[p] * cx;
    const py = wA[p] * ay + wB[p] * by + wC[p] * cy;
    const pz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const dp = Math.abs((px - r0 * c) * vx + (py - r0 * s) * vy + (pz - zz) * vz);
    if (dp > dPerpMax) dPerpMax = dp;
  }
  return { chordUm: 2 * Math.sin(0.5 * best) * diam * 1000, area, dPerpUm: dPerpMax * 1000, angDeg: (best * 180) / Math.PI };
}

// ── level-by-level UNIFORM refinement (H-D) and ADAPTIVE refinement (H-E), one pass ──
const LEVAREA = new Float64Array(UNILEV + 1);       // total leaf area at each uniform level
const LEVOVER = new Float64Array(UNILEV + 1);       // over-bar leaf area at each uniform level
const LEVCHORD = new Float64Array(UNILEV + 1);      // area-weighted mean chord
const LEVMAX = new Float64Array(UNILEV + 1);
const LEVOVERP = new Float64Array(UNILEV + 1);      // over-bar-by-POSITION-proxy leaf area
// *** THE INVARIANT COLUMN. A coplanar 1->4 split leaves the mesh geometrically IDENTICAL yet halves
// `2 sin(theta/2)*diam` because `diam` halves — so the CHORD can be driven down by pure bookkeeping and is
// not by itself evidence of a better surface. The sup ANGLE is invariant under that operation. Both are
// reported at every level, and the NULL arm prices the bookkeeping component directly. ***
const LEVANG = new Float64Array(UNILEV + 1);       // area-weighted mean sup ANGLE, deg
const LEVANGMAX = new Float64Array(UNILEV + 1);
let adaptTrisOrient = 0; let adaptTrisPos = 0; let adaptUncleared = 0; let adaptUnclearedPos = 0;
const ANGBARS = [10, 5, 1, 0.5];
let leppTris = 0; let leppUnc = 0; let leppAngSum = 0; let leppAngMin = 180;
let turnTris = 0; let turnUnc = 0; let turnAngSum = 0; let turnAngMin = 180;
/** unit surface normal at a parameter point, 5 rA evals — used by the 'turn' bisection key. */
function surfNormal(th: number, z: number): [number, number, number] {
  const r0 = rA(th, z);
  const hT = HARC / Math.max(1e-9, Math.abs(r0));
  let zl = z - HZ; let zh = z + HZ;
  if (zl < 0) { zl = 0; zh = Math.min(H, 2 * HZ); }
  if (zh > H) { zh = H; zl = Math.max(0, H - 2 * HZ); }
  const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
  const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
  const c = Math.cos(th); const s2 = Math.sin(th);
  let ax = rt * s2 + r0 * c; let ay = r0 * s2 - rt * c; let az = -r0 * rz;
  const L = Math.hypot(ax, ay, az) || 1;
  return [ax / L, ay / L, az / L];
}
const adaptTrisAng = new Float64Array(ANGBARS.length);
const adaptUnclearedAng = new Float64Array(ANGBARS.length);
let parentArea = 0; let vertResidMax = 0;
let nParents = 0;

interface Tri { x: number[]; y: number[]; z: number[]; th: number[]; }
function children(t: Tri): Tri[] {
  const mid = (i: number, j: number): { x: number; y: number; z: number; th: number } => {
    const th = 0.5 * (t.th[i] + t.th[j]); const zz = 0.5 * (t.z[i] + t.z[j]);
    if (NULLARM) {
      // the null: keep the PARENT's plane, just report a quarter of it. Midpoint NOT lifted.
      return { x: 0.5 * (t.x[i] + t.x[j]), y: 0.5 * (t.y[i] + t.y[j]), z: zz, th };
    }
    const [X, Y, Z] = lift(th, zz);
    return { x: X, y: Y, z: Z, th };
  };
  const m01 = mid(0, 1); const m12 = mid(1, 2); const m20 = mid(2, 0);
  const mk = (a: { x: number; y: number; z: number; th: number },
    b: { x: number; y: number; z: number; th: number },
    c: { x: number; y: number; z: number; th: number }): Tri =>
    ({ x: [a.x, b.x, c.x], y: [a.y, b.y, c.y], z: [a.z, b.z, c.z], th: [a.th, b.th, c.th] });
  const V = (i: number): { x: number; y: number; z: number; th: number } =>
    ({ x: t.x[i], y: t.y[i], z: t.z[i], th: t.th[i] });
  return [mk(V(0), m01, m20), mk(m01, V(1), m12), mk(m20, m12, V(2)), mk(m01, m12, m20)];
}
const sc = (t: Tri): Score => score(t.x[0], t.y[0], t.z[0], t.x[1], t.y[1], t.z[1], t.x[2], t.y[2], t.z[2],
  t.th[0], t.th[1], t.th[2]);

for (let q = 0; q < NS; q += 1) {
  const o = idx[q] * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  // vertex-on-surface control
  for (const [vx2, vy2, vz2, tv] of [[ax, ay, az, thA], [bx, by, bz, thB], [cx, cy, cz, thC]] as const) {
    const d = Math.abs(Math.hypot(vx2, vy2) - rA(tv, vz2));
    if (d > vertResidMax) vertResidMax = d;
  }
  const root: Tri = { x: [ax, bx, cx], y: [ay, by, cy], z: [az, bz, cz], th: [thA, thB, thC] };
  const s0 = sc(root);
  if (!(s0.area > 0)) continue;
  nParents += 1; parentArea += s0.area;

  // uniform levels
  let cur: Tri[] = [root];
  for (let lev = 0; lev <= UNILEV; lev += 1) {
    if (lev > 0) { const nx: Tri[] = []; for (const t of cur) nx.push(...children(t)); cur = nx; }
    let aTot = 0; let aOver = 0; let cWeighted = 0; let mx = 0; let aOverP = 0;
    let angW = 0; let angMx = 0;
    for (const t of cur) {
      const s = sc(t);
      aTot += s.area; cWeighted += s.chordUm * s.area; angW += s.angDeg * s.area;
      if (s.chordUm > BAR_UM) aOver += s.area;
      if (s.dPerpUm > BAR_UM) aOverP += s.area;
      if (s.chordUm > mx) mx = s.chordUm;
      if (s.angDeg > angMx) angMx = s.angDeg;
    }
    LEVAREA[lev] += aTot; LEVOVER[lev] += aOver; LEVCHORD[lev] += cWeighted;
    LEVOVERP[lev] += aOverP; LEVANG[lev] += angW;
    if (mx > LEVMAX[lev]) LEVMAX[lev] = mx;
    if (angMx > LEVANGMAX[lev]) LEVANGMAX[lev] = angMx;
  }

  // adaptive: split only what is still over bar. Two independent runs, one per bar.
  const adapt = (bar: (s: Score) => boolean): { tris: number; uncleared: number } => {
    let tris = 0; let uncleared = 0;
    const stack: Array<[Tri, number]> = [[root, 0]];
    while (stack.length > 0) {
      const [t, lev] = stack.pop() as [Tri, number];
      const s = sc(t);
      if (!bar(s) || lev >= MAXLEV) { tris += 1; if (bar(s)) uncleared += 1; continue; }
      for (const ch of children(t)) stack.push([ch, lev + 1]);
    }
    return { tris, uncleared };
  };
  const ao = adapt((s) => s.chordUm > BAR_UM);
  const ap = adapt((s) => s.dPerpUm > BAR_UM);
  adaptTrisOrient += ao.tris; adaptUncleared += ao.uncleared;
  adaptTrisPos += ap.tris; adaptUnclearedPos += ap.uncleared;
  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // *** THE FRONTIER ARM: IS THE 10x PRICE THE RIGHT PRICE? ***
  // Q1 found the defect is the surface TURNING across a footprint that is too big, and the taxonomy
  // measured the CURVATURE ANISOTROPY of that turning (III = dN^T dN) at an area-weighted p50 of ~50:1 —
  // the normal turns ~50x faster across a ridge than along it. Isotropic 1->4 refinement pays the price
  // in BOTH directions. A refinement that bisects the edge across which the NORMAL TURNS MOST pays it
  // only across the ridge. Three refinement operators are run to the SAME bar on the SAME parents:
  //     'red'   1->4 uniform      (what the uniform sweep above measures)
  //     'lepp'  longest EDGE      (bisection in the EUCLIDEAN metric — what the mesher does today)
  //     'turn'  longest TURN      (bisection in the GAUSS-MAP metric — the anisotropic proposal)
  // CONFORMITY IS IGNORED FOR ALL THREE EQUALLY (no hanging-node propagation, no 2:1 balance), so every
  // count here is a LOWER bound on a real mesher's, and only the RATIO between them is being claimed.
  // The price of 'turn' is SHAPE: its leaf minAngle distribution is reported next to its count, because
  // an anisotropic win paid for in slivers is not a win in this project.
  const bisect = (t: Tri, mode: 'lepp' | 'turn'): Tri[] => {
    let bi = 0; let bv = -1;
    for (let u = 0; u < 3; u += 1) {
      const v = (u + 1) % 3;
      let m: number;
      if (mode === 'lepp') {
        m = Math.hypot(t.x[v] - t.x[u], t.y[v] - t.y[u], t.z[v] - t.z[u]);
      } else {
        const n0 = surfNormal(t.th[u], t.z[u]); const n1 = surfNormal(t.th[v], t.z[v]);
        let d = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
        d = d > 1 ? 1 : d < -1 ? -1 : d;
        m = Math.acos(d);
      }
      if (m > bv) { bv = m; bi = u; }
    }
    const u = bi; const v = (bi + 1) % 3; const w = (bi + 2) % 3;
    const thm = 0.5 * (t.th[u] + t.th[v]); const zm = 0.5 * (t.z[u] + t.z[v]);
    const [mx, my, mz] = NULLARM
      ? [0.5 * (t.x[u] + t.x[v]), 0.5 * (t.y[u] + t.y[v]), zm] : lift(thm, zm);
    return [
      { x: [t.x[u], mx, t.x[w]], y: [t.y[u], my, t.y[w]], z: [t.z[u], zm, t.z[w]], th: [t.th[u], thm, t.th[w]] },
      { x: [mx, t.x[v], t.x[w]], y: [my, t.y[v], t.y[w]], z: [zm, t.z[v], t.z[w]], th: [thm, t.th[v], t.th[w]] },
    ];
  };
  const adaptBisect = (mode: 'lepp' | 'turn'): { tris: number; unc: number; minAngSum: number; minAngMin: number } => {
    let tris = 0; let unc = 0; let minAngSum = 0; let minAngMin = 180;
    const stack: Array<[Tri, number]> = [[root, 0]];
    while (stack.length > 0) {
      const [t, lev] = stack.pop() as [Tri, number];
      const s = sc(t);
      if (!(s.chordUm > BAR_UM) || lev >= 2 * MAXLEV) {
        tris += 1; if (s.chordUm > BAR_UM) unc += 1;
        const e0 = Math.hypot(t.x[1] - t.x[2], t.y[1] - t.y[2], t.z[1] - t.z[2]);
        const e1 = Math.hypot(t.x[0] - t.x[2], t.y[0] - t.y[2], t.z[0] - t.z[2]);
        const e2 = Math.hypot(t.x[0] - t.x[1], t.y[0] - t.y[1], t.z[0] - t.z[1]);
        const lo = Math.min(e0, e1, e2); const hi = Math.max(e0, e1, e2); const mi = e0 + e1 + e2 - lo - hi;
        const cm = (mi * mi + hi * hi - lo * lo) / Math.max(1e-300, 2 * mi * hi);
        const ma = (Math.acos(Math.max(-1, Math.min(1, cm))) * 180) / Math.PI;
        minAngSum += ma; if (ma < minAngMin) minAngMin = ma;
        continue;
      }
      for (const ch of bisect(t, mode)) stack.push([ch, lev + 1]);
    }
    return { tris, unc, minAngSum, minAngMin };
  };
  const bl = adaptBisect('lepp'); const bt = adaptBisect('turn');
  leppTris += bl.tris; leppUnc += bl.unc; leppAngSum += bl.minAngSum; if (bl.minAngMin < leppAngMin) leppAngMin = bl.minAngMin;
  turnTris += bt.tris; turnUnc += bt.unc; turnAngSum += bt.minAngSum; if (bt.minAngMin < turnAngMin) turnAngMin = bt.minAngMin;

  // *** THE INVARIANT BARS. The chord bar is partly satisfiable by BOOKKEEPING (the NULL arm measures
  // how much), so the honest orientation requirement is an ANGLE — which is also the currency every CAD
  // package states its "angular deviation" export tolerance in (SOLIDWORKS default 10 deg, Stratasys
  // 5-10 deg, premium-surface guidance <= 1 deg). Priced here next to the position bar. ***
  for (let b = 0; b < ANGBARS.length; b += 1) {
    const r = adapt((s) => s.angDeg > ANGBARS[b]);
    adaptTrisAng[b] += r.tris; adaptUnclearedAng[b] += r.uncleared;
  }

  if ((q + 1) % 250 === 0) log(`  ${q + 1}/${NS}  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

log('');
log(`CONTROL — max |r_vertex - rA(theta,z)| over ${nParents * 3} sampled parent vertices: ${(vertResidMax * 1000).toExponential(3)} um`);
log('  (if this is not tiny, the children are being lifted onto a different surface than the parents live on)');
log('');
log('══ H-D  UNIFORM 1->4 REFINEMENT, exact surface-lifted midpoints ══');
log('  lev  leaves/par   over-bar AREA %    ratio    mean chord um   ratio   maxChord   || mean ANGLE deg  ratio   maxAng   posOver%');
log('       (chord = 2 sin(theta/2)*diam: falls under a COPLANAR split too. ANGLE is the invariant.)');
for (let lev = 0; lev <= UNILEV; lev += 1) {
  if (!(LEVAREA[lev] > 0)) continue;
  const ov = (100 * LEVOVER[lev]) / LEVAREA[lev];
  const ovp = (100 * LEVOVERP[lev]) / LEVAREA[lev];
  const mc = LEVCHORD[lev] / LEVAREA[lev];
  const pv = lev > 0 && LEVAREA[lev - 1] > 0 ? (100 * LEVOVER[lev - 1]) / LEVAREA[lev - 1] : NaN;
  const pmc = lev > 0 && LEVAREA[lev - 1] > 0 ? LEVCHORD[lev - 1] / LEVAREA[lev - 1] : NaN;
  const ma = LEVANG[lev] / LEVAREA[lev];
  const pma = lev > 0 && LEVAREA[lev - 1] > 0 ? LEVANG[lev - 1] / LEVAREA[lev - 1] : NaN;
  log(`  ${String(lev).padStart(3)}  ${String(4 ** lev).padStart(9)}   ${ov.toFixed(3).padStart(14)}  ${Number.isFinite(pv) ? (ov / Math.max(1e-12, pv)).toFixed(4).padStart(7) : '      -'}   ${mc.toFixed(4).padStart(13)}  ${Number.isFinite(pmc) ? (mc / Math.max(1e-12, pmc)).toFixed(4).padStart(6) : '     -'}   ${LEVMAX[lev].toFixed(1).padStart(8)}   || ${ma.toFixed(4).padStart(13)}  ${Number.isFinite(pma) ? (ma / Math.max(1e-12, pma)).toFixed(4).padStart(6) : '     -'}  ${LEVANGMAX[lev].toFixed(2).padStart(7)}  ${ovp.toFixed(3).padStart(8)}`);
}
log('');
log('══ H-E  ADAPTIVE COST — split only what is still over bar, cap at maxLevel ══');
log(`  ORIENTATION bar ${BAR_UM} um:  ${adaptTrisOrient} leaves for ${nParents} parents = ${(adaptTrisOrient / Math.max(1, nParents)).toFixed(2)}x triangles   (uncleared at maxLevel: ${adaptUncleared} = ${((100 * adaptUncleared) / Math.max(1, adaptTrisOrient)).toFixed(3)}%)`);
log(`  POSITION    bar ${BAR_UM} um:  ${adaptTrisPos} leaves for ${nParents} parents = ${(adaptTrisPos / Math.max(1, nParents)).toFixed(2)}x triangles   (uncleared: ${adaptUnclearedPos} = ${((100 * adaptUnclearedPos) / Math.max(1, adaptTrisPos)).toFixed(3)}%)`);
log(`  *** RATIO orientation/position triangle cost: ${(adaptTrisOrient / Math.max(1, adaptTrisPos)).toFixed(2)}x ***`);
log('');
log('  *** THE FRONTIER ARM — three refinement OPERATORS to the same 10 um chord bar, same parents ***');
log('  (conformity ignored for all three equally, so each count is a lower bound; the RATIO is the claim)');
log(`    red  1->4 uniform-adaptive :  ${String(adaptTrisOrient).padStart(8)} leaves = ${(adaptTrisOrient / Math.max(1, nParents)).toFixed(2).padStart(7)}x   (uncleared ${((100 * adaptUncleared) / Math.max(1, adaptTrisOrient)).toFixed(2)}%)`);
log(`    lepp longest EDGE bisect   :  ${String(leppTris).padStart(8)} leaves = ${(leppTris / Math.max(1, nParents)).toFixed(2).padStart(7)}x   (uncleared ${((100 * leppUnc) / Math.max(1, leppTris)).toFixed(2)}%)  mean leaf minAngle ${(leppAngSum / Math.max(1, leppTris)).toFixed(1)} deg, worst ${leppAngMin.toFixed(2)}`);
log(`    turn longest TURN bisect   :  ${String(turnTris).padStart(8)} leaves = ${(turnTris / Math.max(1, nParents)).toFixed(2).padStart(7)}x   (uncleared ${((100 * turnUnc) / Math.max(1, turnTris)).toFixed(2)}%)  mean leaf minAngle ${(turnAngSum / Math.max(1, turnTris)).toFixed(1)} deg, worst ${turnAngMin.toFixed(2)}`);
log(`    *** turn / lepp = ${(turnTris / Math.max(1, leppTris)).toFixed(3)}x     turn / red = ${(turnTris / Math.max(1, adaptTrisOrient)).toFixed(3)}x ***`);
log('');
log('  THE INVARIANT (ANGLE) BARS — the currency CAD packages state angular deviation in:');
for (let b = 0; b < ANGBARS.length; b += 1) {
  log(`    angle <= ${String(ANGBARS[b]).padStart(4)} deg :  ${String(adaptTrisAng[b]).padStart(8)} leaves = ${(adaptTrisAng[b] / Math.max(1, nParents)).toFixed(3).padStart(8)}x triangles   (uncleared ${((100 * adaptUnclearedAng[b]) / Math.max(1, adaptTrisAng[b])).toFixed(3)}%)`);
}
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

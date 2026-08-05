// s94ConeRefine.ts — THE MEASURED CONE-DRIVEN SIZING FIELD, HEAD-TO-HEAD WITH LEPP ON THE SAME PARENTS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS AND WHY IT IS THE VERDICT
//
// `s94ConeField.ts` prices an IDEAL cone-driven field from the S93 census with a MODEL (chord ~ d^2,
// angle ~ d). `frontierTaxonomy.ts` says in its own output: *"the isotropic column is a MODEL;
// frontierRefine.ts measures the same quantity by actually refining and re-scoring — compare the two
// before quoting either."*  The model FAILED its own calibration control at level 2 (predicted 0.376%
// over-bar area, measured 1.012% = 66% off), so it is not quotable as a verdict. THIS FILE MEASURES.
//
// Four refinement operators are run to the SAME bar, on the SAME golden-stride parents, scored by the
// SAME covering ruler (k=8, inset 0.02, sup over an order-k barycentric lattice — no centroid samples):
//
//   red        adaptive 1->4                            — S93 measured 9.09x (N=1500) / 9.72x (N=2000). REPRODUCTION CONTROL.
//   lepp       adaptive longest-EDGE bisection          — S93 measured 6.67x but ONLY AT N=150. THE ANCHOR, RE-MEASURED AT HONEST N.
//   cone       adaptive k-WAY split, k from coneUB      — THE ARM. The size target is named from the surface's own
//                                                         per-footprint normal cone BEFORE splitting, then verified by re-scoring.
//   coneOracle adaptive k-WAY split, k from the node's own MEASURED chord — isolates the price of the cone
//                                                         being a MODEL of the achieved angle (census nd/coneUB p50 1.142, p75 1.420).
//
// *** WHY THIS IS NOT S93'S REFUTED ANISOTROPIC BISECTION. *** That arm chose WHICH EDGE to cut by a greedy
// per-step key and degenerated into needles (leaf minAngle 2.9 deg, worst 0.00, 41.5% uncleared, 2.76x
// WORSE than LEPP). This arm never chooses an edge: it names a TARGET SIZE and splits the footprint
// UNIFORMLY (k-way barycentric) to reach it, so every child is SIMILAR to its parent and leaf shape is
// invariant by construction. Leaf minAngle is reported for every operator precisely so that claim is
// checked and not asserted.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED KILL LINES (written before the first run; identical to s94ConeField.ts)
//   H1  cone beats plain LEPP on the 10 um CHORD bar.  *** KILL: cone leaves/parent >= lepp leaves/parent
//       measured on the SAME parents. (The 6.67x literal is an N=150 number and is re-measured here.) ***
//   H2  the field brings over-1-degree AREA below 5% at <= 12x the flag-OFF triangle count.
//       *** KILL: > 12x, or the 5% area target is not reached. ***
//   SHAPE GUARD: if the cone arm's leaf minAngle is worse than LEPP's, the win is being paid for in
//       slivers and does not count in this project.
//
// CONTROLS
//   * vertex-on-surface residual over the sampled parents (children are lifted onto the analytic surface;
//     if the parents are not on it the comparison is void). S93 measured 2.074e-2 um.
//   * level-0 over-bar area must reproduce the census on the same sample (non-vacuity).
//   * `red` must reproduce S93's 9.09-9.72x (reproduction control across two independently written tools).
//   * CONFORMITY IS IGNORED FOR ALL OPERATORS EQUALLY (no hanging-node propagation, no 2:1 balance), so
//     every count is a LOWER bound and only the RATIO between operators is claimed. This is FAIR TO LEPP:
//     LEPP's real conforming closure PROPAGATES into neighbours, a sizing field's does not (it is a remesh),
//     so the honest real-mesher gap is at least as large as the one measured here.
//
// Usage: bash research/tools/run-s94-cone-refine.sh
//   env: PF_S94R_MODE(chord|angle) PF_S94R_N(2000) PF_S94R_BAR_UM(10) PF_S94R_ANGBAR(1)
//        PF_S94R_STOPS("8,5,3,2,1.5,1") PF_S94R_MAXLEAF(300000) PF_S94R_STYLE PF_S94R_STL PF_S94R_TAG
import { mkdirSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S94R_STYLE ?? 'GothicArches';
const STL = process.env.PF_S94R_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S94R_TAG ?? 'S39CTL';
const MODE = process.env.PF_S94R_MODE === 'angle' ? 'angle' : 'chord';
const NSAMP = Math.round(envF('PF_S94R_N', 2000));
const K = Math.round(envF('PF_S94R_K', 8));
const INSET = envF('PF_S94R_INSET', 0.02);
const BAR_UM = envF('PF_S94R_BAR_UM', 10);
const ANGBAR = envF('PF_S94R_ANGBAR', 1);
const MAXLEAF = Math.round(envF('PF_S94R_MAXLEAF', 300000));
const MAXDEPTH = Math.round(envF('PF_S94R_MAXDEPTH', 12));
const KCAP = Math.round(envF('PF_S94R_KCAP', 16));
/**
 * THE MEASURED EXPONENT. S93's uniform sweep measured the area-weighted mean chord falling 0.2953 /
 * 0.3063 / 0.3108 per 1->4 level (the MODEL says 0.2500), i.e. chord ~ d^1.717 not d^2. Used ONLY by the
 * SLACK column, which converts a leaf's under-shoot into the free-placement triangle count. Quoting the
 * model's 2.0 there would over-state the prize by ~1.2x, so the measurement is used instead.
 */
const PCH = envF('PF_S94R_PCH', Math.log2(1 / 0.3041));
/** SCOPE: exclude already-back-facing parents (level-0 sup angle > 90 deg). Default OFF. */
const SKIPFOLD = process.env.PF_S94R_SKIPFOLD === '1';
/** SCOPE: exclude parents whose chart slope hypot(r_theta/r, r_z) exceeds this. Default Infinity = OFF. */
const MAXSLOPE = envF('PF_S94R_MAXSLOPE', Infinity);
let nSkipFold = 0; let nSkipSlope = 0;
const BASETRIS = envF('PF_S94R_BASETRIS', 1142166);
const STOPS = (process.env.PF_S94R_STOPS ?? '8,5,3,2,1.5,1').split(',').map(Number).filter((x) => x > 0);
const DIMS: StyleDims = { H: envF('PF_S94R_H', 120), Rb: envF('PF_S94R_RB', 40), Rt: envF('PF_S94R_RT', 50), expn: 1 };
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
log('===== S94 CONE REFINE — A CONE-DRIVEN SIZING FIELD vs LEPP, MEASURED ON THE SAME PARENTS =====');
log(`style ${STYLE}  tag ${TAG}  mode ${MODE}  chord bar ${BAR_UM} um  angle bar ${ANGBAR} deg`);
log(`covering ruler k=${K} inset=${INSET} (${((K + 1) * (K + 2)) / 2} pts/facet), sup over an order-k barycentric lattice. NO centroid samples.`);
log(`sample ${NSAMP} golden-stride parents   kCap ${KCAP}  maxDepth ${MAXDEPTH}  maxLeaf/parent ${MAXLEAF}  flag-OFF tris ${BASETRIS}`);
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

// ── the covering lattice, IDENTICAL construction to frontierRefine/frontierTaxonomy ──
const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const scl = INSET / 3;
  let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + scl; const b = sh * (j / K) + scl;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}
const HARC = 2e-4; const HZ = 2e-4;

function lift(th: number, z: number): [number, number, number] {
  const r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

interface Tri { x: number[]; y: number[]; z: number[]; th: number[] }
interface Score { chordUm: number; angDeg: number; area: number; diam: number; coneUBdeg: number; minAng: number }

const NXa = new Float64Array(LP); const NYa = new Float64Array(LP); const NZa = new Float64Array(LP);

/**
 * ONE covering evaluation of a triangle: sup facet-vs-surface ANGLE, its CHORD, area, diam, leaf minAngle,
 * AND the smallest-enclosing-cone aperture of the surface normals over the same footprint (Badoiu-Clarkson,
 * seeded at the mean normal — the SOUND UPPER bound `coneUB` the S93 census computes). The cone costs only
 * the BC iteration on top of the normals the ruler already needs, so `cone` and `lepp` pay the SAME per-node
 * rA budget here and the triangle comparison is not confounded by evaluation cost.
 */
function score(t: Tri): Score {
  const ax = t.x[0]; const ay = t.y[0]; const az = t.z[0];
  const bx = t.x[1]; const by = t.y[1]; const bz = t.z[1];
  const cx = t.x[2]; const cy = t.y[2]; const cz = t.z[2];
  const eA = Math.hypot(bx - cx, by - cy, bz - cz);
  const eB = Math.hypot(ax - cx, ay - cy, az - cz);
  const eC = Math.hypot(ax - bx, ay - by, az - bz);
  const diam = Math.max(eA, eB, eC);
  const lo = Math.min(eA, eB, eC); const mi = eA + eB + eC - lo - diam;
  const cm = (mi * mi + diam * diam - lo * lo) / Math.max(1e-300, 2 * mi * diam);
  const minAng = (Math.acos(Math.max(-1, Math.min(1, cm))) * 180) / Math.PI;
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const area = 0.5 * fl;
  if (!(fl > 0)) return { chordUm: 0, angDeg: 0, area: 0, diam, coneUBdeg: 0, minAng: 0 };
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  let best = -1;
  let sxa = 0; let sya = 0; let sza = 0;
  for (let p = 0; p < LP; p += 1) {
    const th = wA[p] * t.th[0] + wB[p] * t.th[1] + wC[p] * t.th[2];
    const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const r0 = rA(th, zz);
    const hTh = HARC / Math.max(1e-9, Math.abs(r0));
    let zLo = zz - HZ; let zHi = zz + HZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
    const rt = (rA(th + hTh, zz) - rA(th - hTh, zz)) / (2 * hTh);
    const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
    const cs = Math.cos(th); const sn = Math.sin(th);
    let vx = rt * sn + r0 * cs; let vy = r0 * sn - rt * cs; let vz = -r0 * rz;
    const L = Math.hypot(vx, vy, vz) || 1; vx /= L; vy /= L; vz /= L;
    NXa[p] = vx; NYa[p] = vy; NZa[p] = vz;
    sxa += vx; sya += vy; sza += vz;
    let d = fx * vx + fy * vy + fz * vz; d = d > 1 ? 1 : d < -1 ? -1 : d;
    const a = Math.acos(d);
    if (a > best) best = a;
  }
  // coneUB: Badoiu-Clarkson core-set iteration from the mean normal (the census construction).
  let ux = sxa; let uy = sya; let uz = sza;
  {
    const L = Math.hypot(ux, uy, uz) || 1; ux /= L; uy /= L; uz /= L;
    for (let it = 1; it <= 60; it += 1) {
      let wi = 0; let wd = 2;
      for (let p = 0; p < LP; p += 1) {
        const dd = NXa[p] * ux + NYa[p] * uy + NZa[p] * uz;
        if (dd < wd) { wd = dd; wi = p; }
      }
      const g = 1 / (it + 1);
      ux += g * (NXa[wi] - ux); uy += g * (NYa[wi] - uy); uz += g * (NZa[wi] - uz);
      const L2 = Math.hypot(ux, uy, uz) || 1; ux /= L2; uy /= L2; uz /= L2;
    }
  }
  let cd = 1;
  for (let p = 0; p < LP; p += 1) {
    const dd = NXa[p] * ux + NYa[p] * uy + NZa[p] * uz;
    if (dd < cd) cd = dd;
  }
  const coneUB = Math.acos(Math.max(-1, Math.min(1, cd)));
  return {
    chordUm: 2 * Math.sin(0.5 * best) * diam * 1000, angDeg: (best * 180) / Math.PI, area, diam,
    coneUBdeg: (coneUB * 180) / Math.PI, minAng,
  };
}

/** k-WAY barycentric subdivision of a footprint, every new point LIFTED onto the surface (`addV` contract). */
function splitK(t: Tri, k: number): Tri[] {
  const nP = ((k + 1) * (k + 2)) / 2;
  const PX = new Float64Array(nP); const PY = new Float64Array(nP); const PZ = new Float64Array(nP);
  const PT = new Float64Array(nP);
  const at = (i: number, j: number): number => {
    // rows i = 0..k, within row i the index j = 0..k-i
    let base = 0;
    for (let q = 0; q < i; q += 1) base += k - q + 1;
    return base + j;
  };
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const a = i / k; const b = j / k; const c = 1 - a - b;
      const th = a * t.th[0] + b * t.th[1] + c * t.th[2];
      const zz = a * t.z[0] + b * t.z[1] + c * t.z[2];
      const p = at(i, j);
      // corners keep the PARENT's exact coordinates so leaves tile the parent footprint exactly
      if (i === k) { PX[p] = t.x[0]; PY[p] = t.y[0]; PZ[p] = t.z[0]; PT[p] = t.th[0]; continue; }
      if (j === k) { PX[p] = t.x[1]; PY[p] = t.y[1]; PZ[p] = t.z[1]; PT[p] = t.th[1]; continue; }
      if (i === 0 && j === 0) { PX[p] = t.x[2]; PY[p] = t.y[2]; PZ[p] = t.z[2]; PT[p] = t.th[2]; continue; }
      const [X, Y, Z] = lift(th, zz);
      PX[p] = X; PY[p] = Y; PZ[p] = Z; PT[p] = th;
    }
  }
  const out: Tri[] = [];
  const mk = (p: number, q: number, r: number): void => {
    out.push({ x: [PX[p], PX[q], PX[r]], y: [PY[p], PY[q], PY[r]], z: [PZ[p], PZ[q], PZ[r]], th: [PT[p], PT[q], PT[r]] });
  };
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; i + j < k; j += 1) {
      mk(at(i, j), at(i + 1, j), at(i, j + 1));
      if (i + j + 2 <= k) mk(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return out;
}

/** longest-edge bisection, midpoint lifted. Identical construction to frontierRefine.ts's `bisect('lepp')`. */
function bisectLepp(t: Tri): Tri[] {
  let bi = 0; let bv = -1;
  for (let u = 0; u < 3; u += 1) {
    const v = (u + 1) % 3;
    const m = Math.hypot(t.x[v] - t.x[u], t.y[v] - t.y[u], t.z[v] - t.z[u]);
    if (m > bv) { bv = m; bi = u; }
  }
  const u = bi; const v = (bi + 1) % 3; const w = (bi + 2) % 3;
  const thm = 0.5 * (t.th[u] + t.th[v]); const zm = 0.5 * (t.z[u] + t.z[v]);
  const [mx, my, mz] = lift(thm, zm);
  return [
    { x: [t.x[u], mx, t.x[w]], y: [t.y[u], my, t.y[w]], z: [t.z[u], mz, t.z[w]], th: [t.th[u], thm, t.th[w]] },
    { x: [mx, t.x[v], t.x[w]], y: [my, t.y[v], t.y[w]], z: [mz, t.z[v], t.z[w]], th: [thm, t.th[v], t.th[w]] },
  ];
}

type OpName = 'red' | 'lepp' | 'cone' | 'coneOracle' | 'coneFloor' | 'leppCone';
interface Res {
  tris: number; unc: number; overArea: number; leafArea: number; angOverArea: number;
  minAngSum: number; minAngMin: number; nodes: number; slack: number;
}

/**
 * ONE adaptive refinement of one parent to `bar`, with the operator's own split rule.
 *  - `red`  : 1->4 (k=2) while over bar.
 *  - `lepp` : 1->2 longest edge while over bar.
 *  - `cone` : k = ceil(sqrt(floorChordUB/bar))  [chord mode]  or  ceil(coneUB/stop)  [angle mode].
 *             floorChordUB = 2 sin(coneUB/2)*diam is what the footprint's own normal cone ALLOWS; the
 *             target size is named from it BEFORE splitting and then VERIFIED by re-scoring the children,
 *             so the operator is sound even where the cone under-predicts the achieved angle.
 *  - `coneOracle` : same k-way rule driven by the node's own MEASURED chord/angle instead of the cone.
 * `stopDeg` is the ANGLE the operator refines TO (angle mode); scoring is always against ANGBAR.
 */
function refine(root: Tri, op: OpName, stopDeg: number): Res {
  let tris = 0; let unc = 0; let overArea = 0; let leafArea = 0; let angOverArea = 0;
  let minAngSum = 0; let minAngMin = 180; let nodes = 0; let slack = 0;
  // *** DEPTH BUDGET MUST BE OPERATOR-EQUIVALENT. *** A bisection step is HALF a 1->4 step, so a shared
  // level cap silently truncates lepp: at MAXDEPTH=12 the first smoke run read lepp 4.700x/23.8% uncleared
  // against its published 6.67x/0.00%. `frontierRefine.ts` uses `2*MAXLEV` for its bisection arms for
  // exactly this reason. A cap that binds on ONE arm is a fabricated win for the others.
  const depthCap = (op === 'lepp' || op === 'leppCone') ? 2 * MAXDEPTH : MAXDEPTH;
  const stack: Array<[Tri, number]> = [[root, 0]];
  while (stack.length > 0) {
    const [t, lev] = stack.pop() as [Tri, number];
    const s = score(t); nodes += 1;
    /** the node's own cone-PREDICTED chord — what a driver that has only the surface (no mesh) can know. */
    const coneChordUm = 2 * Math.sin((0.5 * s.coneUBdeg * Math.PI) / 180) * s.diam * 1000;
    const drive = op === 'leppCone' ? coneChordUm : s.chordUm;
    const driveAng = op === 'leppCone' ? s.coneUBdeg : s.angDeg;
    const over = MODE === 'chord' ? drive > BAR_UM : driveAng > stopDeg;
    if (!over || lev >= depthCap || tris + stack.length > MAXLEAF) {
      tris += 1; leafArea += s.area;
      if (MODE === 'chord' ? s.chordUm > BAR_UM : s.angDeg > stopDeg) unc += 1;
      if (s.chordUm > BAR_UM) overArea += s.area;
      if (s.angDeg > ANGBAR) angOverArea += s.area;
      minAngSum += s.minAng * s.area; if (s.minAng < minAngMin) minAngMin = s.minAng;
      // *** THE SLACK COLUMN — how far this leaf is UNDER the bar, priced in triangles. ***
      // A subdivision operator can only halve; a MESH GENERATOR can place an element at exactly the
      // admissible size. Scaling this leaf up by s makes its chord c*s^p (p = the MEASURED exponent 1.717,
      // not the model's 2), so the largest admissible element covering it is s = (bar/c)^(1/p) times its
      // linear size and covers 1/s^2 = (c/bar)^(2/p) leaves' worth of area. Summing that over the leaves
      // is the count a FREE-PLACEMENT mesher would have used to certify the SAME refined geometry.
      // It is a MODEL, but applied per LEAF (small, locally smooth) rather than per parent.
      slack += Math.min(1, Math.max(1e-12, s.chordUm / BAR_UM) ** (2 / PCH));
      continue;
    }
    let kids: Tri[];
    if (op === 'lepp' || op === 'leppCone') kids = bisectLepp(t);
    else if (op === 'red') kids = splitK(t, 2);
    else {
      let k: number;
      if (MODE === 'chord') {
        const cu = op === 'coneOracle' ? s.chordUm : coneChordUm;
        const kx = Math.sqrt(Math.max(1, cu / BAR_UM));
        k = op === 'coneFloor' ? Math.floor(kx) : Math.ceil(kx);
      } else {
        const au = op === 'coneOracle' ? s.angDeg : s.coneUBdeg;
        const kx = Math.max(1, au / stopDeg);
        k = op === 'coneFloor' ? Math.floor(kx) : Math.ceil(kx);
      }
      if (!(k >= 2)) k = 2;
      if (k > KCAP) k = KCAP;
      kids = splitK(t, k);
    }
    for (const c of kids) stack.push([c, lev + 1]);
  }
  return { tris, unc, overArea, leafArea, angOverArea, minAngSum, minAngMin, nodes, slack };
}

// ── run ──
const OPS: OpName[] = (process.env.PF_S94R_OPS ?? 'red,lepp,cone,coneOracle,coneFloor,leppCone').split(',') as OpName[];
const acc: Record<string, Res> = {};
const key = (op: string, st: number): string => `${op}@${st}`;
const stopList = MODE === 'chord' ? [BAR_UM] : STOPS;
for (const op of OPS) for (const st of stopList) acc[key(op, st)] = { tris: 0, unc: 0, overArea: 0, leafArea: 0, angOverArea: 0, minAngSum: 0, minAngMin: 180, nodes: 0, slack: 0 };

/**
 * *** PER-PARENT LEAF COUNTS — because a MEAN over an operator with a heavy tail is not a measurement. ***
 * The published 6.67x LEPP anchor was taken at N=150; at N=2000 the same construction reads 116.889x with
 * 32.2% uncleared. Either the tail is real and the anchor never sampled it, or one parent dominates the
 * mean. Only the DISTRIBUTION distinguishes those, so it is recorded per parent per operator.
 */
const PERPAR: Record<string, number[]> = {};
for (const op0 of (process.env.PF_S94R_OPS ?? 'red,lepp,cone,coneOracle,coneFloor,leppCone').split(',')) PERPAR[op0] = [];
interface P0Row { chordUm: number; angDeg: number; diam: number; minAng: number; slope: number }
const P0: P0Row[] = [];
let nParents = 0; let parentArea = 0; let parentOverArea = 0; let parentAngOverArea = 0; let vertResidMax = 0;
for (let q = 0; q < NS; q += 1) {
  const o = idx[q] * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  for (const [vx2, vy2, vz2, tv] of [[ax, ay, az, thA], [bx, by, bz, thB], [cx, cy, cz, thC]] as const) {
    const d = Math.abs(Math.hypot(vx2, vy2) - rA(tv, vz2));
    if (d > vertResidMax) vertResidMax = d;
  }
  const root: Tri = { x: [ax, bx, cx], y: [ay, by, cy], z: [az, bz, cz], th: [thA, thB, thC] };
  const s0 = score(root);
  if (!(s0.area > 0)) continue;
  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // *** SCOPE FILTER — SMOOTH-RELIEF CLASS ONLY. *** S93 §0f.5 split the catalogue into SMOOTH-RELIEF
  // (the (theta,z) chart is a good chart; density solves it) and NEAR-VERTICAL-WALL (the chart is nearly
  // singular; a lifted midpoint FOLDS the child and refinement is ill-posed). This arm is scoped to the
  // first. GothicArches is the smooth-relief EXEMPLAR but its mesh still contains a near-vertical
  // sub-population, and the tail diagnostic below shows that sub-population is 100% of the operators'
  // blow-up: the 12 worst `lepp` parents all have slope 2.28-7.74 against an all-parent median of ~0.11,
  // and 9 of 12 are already back-facing (level-0 angle > 90 deg). Both filters are DEFAULT OFF so the
  // unscoped number is always printed too; neither may be used without printing how much it removed.
  {
    const th0 = (thA + thB + thC) / 3; const zz0 = (az + bz + cz) / 3;
    const r00 = rA(th0, zz0); const hT0 = HARC / Math.max(1e-9, Math.abs(r00));
    let zl0 = zz0 - HZ; let zh0 = zz0 + HZ;
    if (zl0 < 0) { zl0 = 0; zh0 = Math.min(H, 2 * HZ); }
    if (zh0 > H) { zh0 = H; zl0 = Math.max(0, H - 2 * HZ); }
    const rt0 = (rA(th0 + hT0, zz0) - rA(th0 - hT0, zz0)) / (2 * hT0);
    const rz0 = zh0 > zl0 ? (rA(th0, zh0) - rA(th0, zl0)) / (zh0 - zl0) : 0;
    const sl0 = Math.hypot(rt0 / Math.max(1e-9, r00), rz0);
    if (SKIPFOLD && s0.angDeg > 90) { nSkipFold += 1; continue; }
    if (sl0 > MAXSLOPE) { nSkipSlope += 1; continue; }
  }
  nParents += 1; parentArea += s0.area;
  if (s0.chordUm > BAR_UM) parentOverArea += s0.area;
  if (s0.angDeg > ANGBAR) parentAngOverArea += s0.area;
  {
    // slope = hypot(r_theta/r, r_z) at the centroid — S93's chart covariate, so the tail can be tested
    // against the "steep chart" hypothesis without a second tool.
    const th = (thA + thB + thC) / 3; const zz = (az + bz + cz) / 3;
    const r0 = rA(th, zz); const hT = HARC / Math.max(1e-9, Math.abs(r0));
    let zl = zz - HZ; let zh = zz + HZ;
    if (zl < 0) { zl = 0; zh = Math.min(H, 2 * HZ); }
    if (zh > H) { zh = H; zl = Math.max(0, H - 2 * HZ); }
    const rt = (rA(th + hT, zz) - rA(th - hT, zz)) / (2 * hT);
    const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
    P0.push({ chordUm: s0.chordUm, angDeg: s0.angDeg, diam: s0.diam, minAng: s0.minAng, slope: Math.hypot(rt / Math.max(1e-9, r0), rz) });
  }
  for (const op of OPS) {
    for (const st of stopList) {
      const r = refine(root, op, st); const a = acc[key(op, st)];
      a.tris += r.tris; a.unc += r.unc; a.overArea += r.overArea; a.leafArea += r.leafArea;
      a.angOverArea += r.angOverArea; a.minAngSum += r.minAngSum; a.nodes += r.nodes; a.slack += r.slack;
      if (r.minAngMin < a.minAngMin) a.minAngMin = r.minAngMin;
      if (st === stopList[stopList.length - 1]) PERPAR[op].push(r.tris);
    }
  }
  if ((q + 1) % 250 === 0) log(`  ${q + 1}/${NS}  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

log('');
log(`SCOPE — excluded ${nSkipFold} back-facing parents (PF_S94R_SKIPFOLD=${SKIPFOLD ? 1 : 0}) and ${nSkipSlope} parents with slope > ${MAXSLOPE} (PF_S94R_MAXSLOPE); ${nParents} of ${NS} retained = ${((100 * nParents) / Math.max(1, NS)).toFixed(2)}%`);
log(`CONTROL — max |r_vertex - rA(theta,z)| over ${nParents * 3} sampled parent vertices: ${(vertResidMax * 1000).toExponential(3)} um`);
log(`CONTROL — level-0 over-bar CHORD AREA ${((100 * parentOverArea) / parentArea).toFixed(3)}%  (census 43.220%, frontierRefine N=2000 42.912%)`);
log(`CONTROL — level-0 over-${ANGBAR}deg ANGLE AREA ${((100 * parentAngOverArea) / parentArea).toFixed(3)}%  (census 29.676% at 1 deg)`);
log('');
log(`══ ${MODE === 'chord' ? `CHORD BAR ${BAR_UM} um` : `ANGLE STOP SWEEP, scored against ${ANGBAR} deg`} — ${nParents} parents, conformity ignored for ALL operators equally ══`);
log('  op          stop     leaves/par   x flagOFF     uncleared%   over-chordAREA%   over-angAREA%   leaf minAngle mean/worst   nodes/par   SLACK-ideal/par');
for (const st of stopList) {
  for (const op of OPS) {
    const a = acc[key(op, st)];
    const lp = a.tris / Math.max(1, nParents);
    log(`  ${op.padEnd(11)} ${st.toFixed(2).padStart(5)}   ${lp.toFixed(3).padStart(10)}   ${lp.toFixed(2).padStart(8)}x   ${((100 * a.unc) / Math.max(1, a.tris)).toFixed(3).padStart(10)}   ${((100 * a.overArea) / Math.max(1e-30, a.leafArea)).toFixed(4).padStart(15)}   ${((100 * a.angOverArea) / Math.max(1e-30, a.leafArea)).toFixed(4).padStart(13)}   ${(a.minAngSum / Math.max(1e-30, a.leafArea)).toFixed(1).padStart(11)} / ${a.minAngMin.toFixed(2).padStart(6)}   ${(a.nodes / Math.max(1, nParents)).toFixed(1).padStart(9)}   ${(a.slack / Math.max(1, nParents)).toFixed(3).padStart(15)}`);
  }
  if (stopList.length > 1) log('');
}
log('');
// *** WHICH PARENTS BLOW UP, AND WHAT ARE THEY? *** The mean is dominated by a tail; the tail must be
// NAMED. For the worst parents of each operator, print the level-0 geometry so the mechanism is printed
// rather than inferred.
if (P0.length > 0) {
  const showOp = process.env.PF_S94R_TAILOP ?? 'lepp';
  const v = PERPAR[showOp];
  if (v !== undefined && v.length === P0.length) {
    const ord = v.map((t, i) => [t, i] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, 12);
    log('');
    log(`── THE TAIL, NAMED: the 12 parents with the most \`${showOp}\` leaves ──`);
    log('   leaves(op)  leaves(cone)   lev0 chord um   lev0 angle deg   lev0 diam mm   lev0 minAngle   slope   over-bar?');
    for (const [t, i] of ord) {
      const p = P0[i];
      const cl = PERPAR.cone !== undefined && PERPAR.cone.length === P0.length ? PERPAR.cone[i] : -1;
      log(`   ${String(t).padStart(10)}  ${String(cl).padStart(12)}   ${p.chordUm.toFixed(2).padStart(13)}   ${p.angDeg.toFixed(3).padStart(14)}   ${p.diam.toFixed(4).padStart(12)}   ${p.minAng.toFixed(2).padStart(13)}   ${p.slope.toFixed(3).padStart(5)}   ${p.chordUm > BAR_UM ? 'yes' : 'no'}`);
    }
    // correlation of blow-up with level-0 minAngle, the shape hypothesis
    const lo = ord.map(([, i]) => P0[i].minAng);
    log(`   worst-12 lev0 minAngle: min ${Math.min(...lo).toFixed(2)}  median ${lo.slice().sort((a, b) => a - b)[6].toFixed(2)}   ALL parents median ${P0.map((p) => p.minAng).sort((a, b) => a - b)[Math.floor(P0.length / 2)].toFixed(2)}`);
  }
}
log('');
log('── PER-PARENT LEAF DISTRIBUTION (a MEAN over a heavy tail is not a measurement) ──');
log('  op            p50      p90      p99      max     mean    share of ALL leaves held by the WORST 1% of parents');
for (const op of OPS) {
  const v = (PERPAR[op] ?? []).slice().sort((a, b) => a - b);
  if (v.length === 0) continue;
  const qq = (p: number): number => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const tot = v.reduce((s, x) => s + x, 0);
  const n1 = Math.max(1, Math.round(0.01 * v.length));
  const top = v.slice(v.length - n1).reduce((s, x) => s + x, 0);
  log(`  ${op.padEnd(11)} ${String(qq(0.5)).padStart(6)}  ${String(qq(0.9)).padStart(7)}  ${String(qq(0.99)).padStart(7)}  ${String(v[v.length - 1]).padStart(7)}  ${(tot / v.length).toFixed(2).padStart(7)}   ${((100 * top) / Math.max(1, tot)).toFixed(2).padStart(6)}%`);
}
log('');
log('  SLACK-ideal/par = the triangle count a FREE-PLACEMENT mesher would need to certify the SAME geometry');
log('  this operator produced. The gap (leaves/par ÷ SLACK) is the GRANULARITY WASTE of subdividing rather');
log('  than generating: it is the part of the prize that is unreachable by ANY refinement operator.');
log('');
{
  const g = (o: string): Res => acc[key(o, stopList[0])] ?? { tris: 0, unc: 0, overArea: 0, leafArea: 0, angOverArea: 0, minAngSum: 0, minAngMin: 0, nodes: 0, slack: 0 };
  const l = g('lepp'); const c = g('cone'); const co = g('coneOracle'); const r = g('red');
  const cf = g('coneFloor'); const lc = g('leppCone');
  if (l.tris > 0) {
    log(`  *** vs the ANCHOR (lepp): cone ${(c.tris / l.tris).toFixed(3)}x   coneOracle ${(co.tris / l.tris).toFixed(3)}x   coneFloor ${(cf.tris / l.tris).toFixed(3)}x   leppCone ${(lc.tris / l.tris).toFixed(3)}x   red ${(r.tris / l.tris).toFixed(3)}x ***`);
    log(`  *** GRANULARITY WASTE (leaves ÷ slack-ideal): lepp ${(l.tris / Math.max(1e-9, l.slack)).toFixed(2)}x   cone ${(c.tris / Math.max(1e-9, c.slack)).toFixed(2)}x   red ${(r.tris / Math.max(1e-9, r.slack)).toFixed(2)}x ***`);
    log(`  *** abs triangles: lepp ${((l.tris / Math.max(1, nParents)) * BASETRIS / 1e6).toFixed(2)}M   cone ${((c.tris / Math.max(1, nParents)) * BASETRIS / 1e6).toFixed(2)}M   free-placement ideal ${((l.slack / Math.max(1, nParents)) * BASETRIS / 1e6).toFixed(2)}M ***`);
  }
}
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

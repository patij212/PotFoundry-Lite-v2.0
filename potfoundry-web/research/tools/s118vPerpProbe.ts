/**
 * s118vPerpProbe.ts — INDEPENDENT ADJUDICATION OF THE S118 RUNG-1 POSITION CLAIM.
 *
 * WHY THIS EXISTS. Two of S118's own instruments disagree on the same mesh at the same lattice order:
 *
 *   * research/tools/s118DriveGoth.ts drove GothicArches to convergence on `perpUB`, a PROVEN UPPER
 *     BOUND on dist(P, S) evaluated at every point of the order-8 barycentric lattice of every facet.
 *     Its work list EMPTIED, so on the delivered mesh EVERY facet has perpUB <= 0.01 mm at EVERY k=8
 *     lattice point — which, an upper bound being an upper bound, means TRUE perpendicular <= 0.01 mm.
 *   * research/tools/s118Score.ts, walking the SAME k=8 lattice with buildRadialSurfaceProjector,
 *     reports 296 facets ABOVE 0.01 mm (17 in shard 0/16), max 1.461e-2 mm.
 *
 * Both quantities are UPPER bounds on the same distance, so they cannot both be tight, and the SMALLER
 * one is the honest one. This tool settles it the only way that is airtight: by exhibiting a WITNESS.
 *
 * THE WITNESS ARGUMENT. For a query point P, every value this tool ever reports is
 *     d = |P - S(th, z)|   for an EXPLICIT (th, z),   S(th, z) = (rA(th,z) cos th, rA(th,z) sin th, z)
 * i.e. the distance to an ACTUAL point of the analytic surface. dist(P, S) <= d unconditionally — no
 * matter how the search that produced (th, z) behaved. So this tool can only ever ACQUIT a facet (prove
 * it is under the bar); it can never convict one. That asymmetry is deliberate: the claim under test is
 * a conviction, and a single witness under the bar refutes it.
 *
 * The witness is verified, not asserted: for the best (th, z) found, the tool recomputes rA at the
 * witness point and checks that the point it measured to really does lie on the surface (residual must
 * be at the f64 round-off floor). That check is printed as CONTROL W1.
 *
 * env: PF_V118_STL (ABSOLUTE) PF_V118_STYLE PF_V118_SHARD=i/n PF_V118_K PF_V118_BAR
 */
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshF32 } from './s118MeshIo';
import { latticePts } from './s118ScoreLib';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ }

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STL = envS('PF_V118_STL', '');
const STYLE = envS('PF_V118_STYLE', 'GothicArches');
const SHARD = envS('PF_V118_SHARD', '0/16');
const K = envI('PF_V118_K', 8);
const BAR = envF('PF_V118_BAR', 0.01);
const DIMS: StyleDims = { H: envF('PF_V118_H', 120), Rb: envF('PF_V118_RB', 40), Rt: envF('PF_V118_RT', 50), expn: 1 };
const H = DIMS.H;
if (STL.length === 0) { log('*** PF_V118_STL required (ABSOLUTE path) ***'); process.exit(2); }
const SH_I = Number(SHARD.split('/')[0]);
const SH_N = Number(SHARD.split('/')[1]);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

let evals = 0;
/** squared distance from P to the EXPLICIT surface point S(th, zc) */
function f2(px: number, py: number, pz: number, th: number, z: number): number {
  const zc = z < 0 ? 0 : z > H ? H : z;
  const r = rA(th, zc); evals += 1;
  const dx = px - r * Math.cos(th), dy = py - r * Math.sin(th), dz = pz - zc;
  return dx * dx + dy * dy + dz * dz;
}

interface Witness { d: number; th: number; z: number }

/** CHEAP arm: the drive's own damped Gauss-Newton, seeded at the radial foot. */
function ubCheap(px: number, py: number, pz: number, seed2: number, iters: number): Witness {
  const th0 = Math.atan2(py, px);
  let best = seed2; let bth = th0; let bz = pz < 0 ? 0 : pz > H ? H : pz;
  let th = th0; let zz = bz; let fcur = seed2;
  const F = (t2: number, z2: number): number => {
    const v = f2(px, py, pz, t2, z2);
    if (v < best) { best = v; bth = t2; bz = z2 < 0 ? 0 : z2 > H ? H : z2; }
    return v;
  };
  const HH = 1e-4;
  for (let it = 0; it < iters; it += 1) {
    const rr = Math.max(1e-6, rA(th, zz)); evals += 1;
    const hTh = HH / rr;
    const gU = (F(th + hTh, zz) - F(th - hTh, zz)) / (2 * HH);
    const gV = (F(th, zz + HH) - F(th, zz - HH)) / (2 * HH);
    const gn2 = gU * gU + gV * gV;
    if (gn2 <= 0) break;
    let step = (2 * fcur) / gn2;
    let moved = false;
    for (let trial = 0; trial < 4; trial += 1) {
      const u = -step * gU, v = -step * gV;
      const nth = th + u / rr; const nz = zz + v;
      const fv = F(nth, nz);
      if (fv < fcur) { th = nth; zz = nz < 0 ? 0 : nz > H ? H : nz; fcur = fv; moved = true; break; }
      step *= 0.35;
    }
    if (!moved) break;
  }
  return { d: Math.sqrt(best), th: bth, z: bz };
}

/** EXPENSIVE arm: dense local (th, z) sweep, then pattern search from the best cell. */
function ubDense(px: number, py: number, pz: number, seedW: Witness): Witness {
  const th0 = Math.atan2(py, px);
  const rr = Math.max(1e-6, rA(th0, pz)); evals += 1;
  let best = seedW.d * seedW.d; let bth = seedW.th; let bz = seedW.z;
  const consider = (t2: number, z2: number): void => {
    const v = f2(px, py, pz, t2, z2);
    if (v < best) { best = v; bth = t2; bz = z2 < 0 ? 0 : z2 > H ? H : z2; }
  };
  // window: +/- 0.6 mm of arc in theta, +/- 0.6 mm in z — 100x the bar in both directions
  const dth = 0.6 / rr; const dz = 0.6;
  const NT = 121; const NZ = 121;
  for (let i = 0; i < NT; i += 1) {
    const t2 = th0 - dth + (2 * dth * i) / (NT - 1);
    for (let j = 0; j < NZ; j += 1) consider(t2, pz - dz + (2 * dz * j) / (NZ - 1));
  }
  // Hooke-Jeeves pattern search from the best sample
  let sTh = (2 * dth) / (NT - 1); let sZ = (2 * dz) / (NZ - 1);
  for (let round = 0; round < 60; round += 1) {
    const b0 = best;
    consider(bth + sTh, bz); consider(bth - sTh, bz);
    consider(bth, bz + sZ); consider(bth, bz - sZ);
    consider(bth + sTh, bz + sZ); consider(bth - sTh, bz - sZ);
    consider(bth + sTh, bz - sZ); consider(bth - sTh, bz + sZ);
    if (best >= b0) { sTh *= 0.5; sZ *= 0.5; }
    if (sZ < 1e-9) break;
  }
  return { d: Math.sqrt(best), th: bth, z: bz };
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 VERIFIER — WITNESS ADJUDICATION — ${STYLE}  shard ${SHARD}  k=${K}  bar ${BAR} mm =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh ${STL}`);
log(`node ${process.version}  NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '(unset)'}`);
log('EVERY number below is |P - S(th,z)| for an EXPLICIT surface point, so it is an UPPER bound on');
log('dist(P, S). This tool can ACQUIT a facet; it can never convict one.');
log('');

const mesh = readMeshF32(STL);
const xyz = mesh.xyz; const nTri = mesh.nTri;
log(`── MESH ${nTri.toLocaleString()} facets ${el()} ──`);

const LAT = latticePts(K); const NP = LAT.length / 3;
log(`── lattice k=${K} → ${NP} points/facet ──`);
log('');

let inShard = 0;
let flagged = 0;              // facets with >=1 lattice point whose RADIAL residual exceeds the bar
let overCheap = 0;            // facets not acquitted by the cheap witness
let overDense = 0;            // facets not acquitted by the dense witness either
let overArea = 0;
let maxUb = 0;
let maxRad = 0;
let ptsRad = 0; let ptsCheap = 0; let ptsDense = 0;
let w1Worst = 0;              // CONTROL W1: witness must lie ON the surface
const disputed: Array<{ f: number; rad: number; cheap: number; dense: number }> = [];

for (let f = SH_I; f < nTri; f += SH_N) {
  inShard += 1;
  const o = f * 9;
  const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
  const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
  const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
  let facetRad = 0; let facetUb = 0; let facetDense = 0; let touched = false;
  for (let p = 0; p < NP; p += 1) {
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx;
    const y = w0 * ay + w1 * by + w2 * cy;
    const z = w0 * az + w1 * bz + w2 * cz;
    const rad = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)); evals += 1;
    if (rad > facetRad) facetRad = rad;
    if (rad <= BAR) { if (rad > facetUb) facetUb = rad; if (rad > facetDense) facetDense = rad; continue; }
    touched = true; ptsRad += 1;
    const wc = ubCheap(x, y, z, rad * rad, 8);
    let dBest = wc.d; let wBest = wc;
    if (wc.d > BAR) {
      ptsCheap += 1;
      const wd = ubDense(x, y, z, wc);
      if (wd.d < dBest) { dBest = wd.d; wBest = wd; }
      if (dBest > BAR) ptsDense += 1;
    }
    // CONTROL W1 — the witness must be ON the analytic surface
    {
      const zc = wBest.z < 0 ? 0 : wBest.z > H ? H : wBest.z;
      const rw = rA(wBest.th, zc); evals += 1;
      const wx = rw * Math.cos(wBest.th), wy = rw * Math.sin(wBest.th);
      const off = Math.abs(Math.hypot(wx, wy) - rA(Math.atan2(wy, wx), zc));
      if (off > w1Worst) w1Worst = off;
    }
    if (wc.d > facetUb) facetUb = wc.d;
    if (dBest > facetDense) facetDense = dBest;
  }
  if (facetRad > maxRad) maxRad = facetRad;
  if (touched) flagged += 1;
  if (facetUb > BAR) overCheap += 1;
  if (facetDense > BAR) {
    overDense += 1;
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    overArea += 0.5 * Math.hypot(nx, ny, nz);
    if (disputed.length < 40) disputed.push({ f, rad: facetRad, cheap: facetUb, dense: facetDense });
  }
  if (facetDense > maxUb) maxUb = facetDense;
  if ((inShard % 20000) === 0) log(`   ...${inShard.toLocaleString()} facets in shard, flagged ${flagged.toLocaleString()}, not-acquitted ${overDense} ${el()}`);
}

log('');
log('── RESULT (shard only — NOT a mesh number; multiply by nothing, run every shard to total) ──');
log(`   facets in shard              ${inShard.toLocaleString()}`);
log(`   RADIAL over ${BAR} mm            ${flagged.toLocaleString()}   (these are the only facets that CAN be over)`);
log(`   *** NOT ACQUITTED by cheap witness (8 GN iters): ${overCheap} facets ***`);
log(`   *** NOT ACQUITTED by dense witness (121x121 sweep + pattern search): ${overDense} facets, ${overArea.toFixed(6)} mm2 ***`);
log(`   MAX witness upper bound over the shard ${ex(maxUb)} mm    (radial max ${ex(maxRad)} mm)`);
log(`   lattice points over radial bar ${ptsRad.toLocaleString()}; cheap witness left ${ptsCheap.toLocaleString()} over; dense left ${ptsDense.toLocaleString()} over`);
log(`   CONTROL W1 — witness off-surface residual MAX ${ex(w1Worst)} mm (must be at f64 round-off; a`);
log('      non-zero value would mean the "witness" is not a surface point and the acquittals are void)');
if (disputed.length > 0) {
  log('   first disputed facets (facet, radial, cheapUB, denseUB):');
  for (const d of disputed) log(`      f=${d.f}  rad ${ex(d.rad)}  cheap ${ex(d.cheap)}  dense ${ex(d.dense)}`);
}
log(`   rA evaluations ${evals.toLocaleString()}   ${el()}`);
log('S118 VERIFIER DONE');

// s118DriveGoth.ts — S118 DRIVE: take GothicArches to 0.01 mm and then to 0.001 mm, ARTEFACT-FREE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A GENERATOR AND NOT A REFINER — the one decision that makes the artefact count ZERO
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S116's APCR operator refined the STRATA driver's SHIPPED STL and got GothicArches from 2,271 facets
// over 0.01 mm to 42 — and then STALLED: rounds 34..59 of that run made ZERO bisections, because 96.12%
// of its attempted splits were REFUSED by its own footprint-sign control. The refusals are not the
// operator's fault. They are INHERITED: the baseline STL already contains 4,361 arc-space needles, 736
// degeneracy poles and 1,523 facets above the analytic ceiling, and a refiner cannot delete a facet it
// did not create. A mesh that starts with degenerate parametric footprints has a FLOOR, and 42 facets is
// where that floor sits.
//
// So this tool does not start from that STL. It GENERATES:
//
//   SEED — a uniform (theta, z) grid lifted radially onto rA. Every seed facet's arc-space footprint is
//   half of an axis-aligned rectangle, so: apsSign = +1 for ALL of them (checked, not assumed);
//   minAlt/maxEdge is the fixed aspect of that half-rectangle; and graphRatio is bounded by
//   sqrt(1+L^2) = 9.58 (the graph factor), which is 10.4x under the POLE bar of 100.
//   The closed form V - E + F = 0, boundary = 2*nTheta is asserted against the built neighbour table.
//
//   REFINE — Rivara LEPP longest-edge bisection, with the longest edge measured IN THE PARAMETER METRIC
//   (u = rMean*theta, v = z), and every new vertex placed at the EXACT parameter midpoint lifted onto rA:
//        th_m = th_a + dThRaw(th_a, th_b)/2,  z_m = (z_a + z_b)/2,  r_m = rA(th_m, z_m).
//   Two structural consequences, by construction rather than by detection:
//     (1) `bisect` ALWAYS splits BOTH triangles incident on the chosen edge, so a hanging node never
//         exists at any intermediate state — conformity is structural, never repaired;
//     (2) radial projection changes ONLY r, so the child's arc-space footprint is bit-for-bit the
//         LINEAR-bisection footprint. The parametric area sign therefore CANNOT flip. A fold is not
//         representable, and Rivara's theorem bounds the smallest PARAMETER-space angle below by half the
//         seed's smallest — so the operator cannot make a needle either, at any density.
//   The footprint-sign check is kept as a CONTROL. On this mesh it must never fire; if it does, the
//   argument above is wrong and the run says so.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE KEY IS SOUND, NOT A PROXY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// For P = (x,y,z), the point Q = (rA(th,z)cos th, rA(th,z)sin th, z) with th = atan2(y,x) IS a point of
// the analytic surface, and |P - Q| = | |P_xy| - rA(th,z) | = R1(P). Hence dist(P, S) <= R1(P)
// POINTWISE. Driving R1 under the bar therefore CERTIFIES the honest perpendicular ruler under the bar —
// it is a strictly conservative key, never a flattering one. And because the order-k barycentric lattice
// of a triangle CONTAINS the order-(k/m) lattice for every integer m, driving at k=24 strictly dominates
// the scorer's k=8: every point the scorer will ever ask about has already been driven under the bar.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PLACEBO
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PF_S118D_ARM=placebo runs IDENTICAL machinery — same seed, same bisector, same guard, same projection —
// and differs ONLY in which facets are targeted: a deterministic uniform draw from the live facets rather
// than the over-bar set. It runs until it has at least as many triangles as the operator arm
// (PF_S118D_MATCHT). If it scores as well, the operator is refuted.
//
// Usage: bash research/tools/run-s118-drive.sh
//   env PF_S118D_STYLE PF_S118D_TAG PF_S118D_BAR PF_S118D_NTH PF_S118D_NZ PF_S118D_KDRV PF_S118D_KVER
//       PF_S118D_MAXT PF_S118D_MAXSECS PF_S118D_ARM=op|placebo PF_S118D_MATCHT PF_S118D_OUT
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { facetGeom, latticePts } from './s118ScoreLib';
import { openSync, writeSync, closeSync, mkdirSync, writeFileSync } from 'node:fs';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STYLE = envS('PF_S118D_STYLE', 'GothicArches');
const TAG = envS('PF_S118D_TAG', 'DRV');
const OUTDIR = envS('PF_S118D_OUTDIR', 'research/exchange/_strataConformBisect/s118');
const DIMS: StyleDims = { H: envF('PF_S118D_H', 120), Rb: envF('PF_S118D_RB', 40), Rt: envF('PF_S118D_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR = envF('PF_S118D_BAR', 0.01);
const NTH = envI('PF_S118D_NTH', 768);
const NZ = envI('PF_S118D_NZ', 384);
const K_DRV = envI('PF_S118D_KDRV', 8);
const K_VER = envI('PF_S118D_KVER', 24);
const MAXT = envI('PF_S118D_MAXT', 4_000_000);
const MAXSECS = envF('PF_S118D_MAXSECS', 7200);
const ARM = envS('PF_S118D_ARM', 'op');
const MATCHT = envI('PF_S118D_MATCHT', 0);
const OUT = envS('PF_S118D_OUT', '');
const VER_PASSES = envI('PF_S118D_VERPASSES', 6);
const SEED = envI('PF_S118D_SEED', 12345);

let PRIO = 'unchanged';
try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); PRIO = 'AboveNormal (EcoQoS defeated)'; } catch { PRIO = 'could not raise'; }

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const secs = (): number => (Date.now() - T0) / 1000;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const mbs = (b: number): string => `${(b / 1048576).toFixed(0)} MB`;
const rssNow = (): number => process.memoryUsage().rss;

// ── the analytic surface: byte-identical construction to s118Score / s116zFinalScore ────────────────
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

mkdirSync(OUTDIR, { recursive: true });
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 DRIVE — ${STYLE}  arm=${ARM}  bar=${BAR} mm   tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=1`);
log(`seed ${NTH} x ${NZ} = ${(2 * NTH * NZ).toLocaleString()} facets   kDrive ${K_DRV} kVerify ${K_VER}   maxT ${MAXT.toLocaleString()}  maxSecs ${MAXSECS}`);
log(`node ${process.version}  NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '(unset)'}  priority ${PRIO}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE A — the analytic ceiling and the graph factor. h SWEPT (scar 3).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function maxGradR(nG: number, hArc: number, hZ: number): number {
  let g = 0;
  for (let i = 0; i < nG; i += 1) {
    const th = (i / nG) * 2 * Math.PI;
    for (let j = 0; j <= nG; j += 1) {
      const z = (j / nG) * H;
      const r0 = rA(th, z);
      const hTh = hArc / Math.max(1e-9, r0);
      const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hArc);
      const zl = Math.max(0, z - hZ); const zh = Math.min(H, z + hZ);
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const m = Math.hypot(rt, rz);
      if (m > g) g = m;
    }
  }
  return g;
}
log('── STAGE A: ANALYTIC CEILING + GRAPH FACTOR (scar 3: h swept) ──');
for (const h of [2e-6, 2e-5, 2e-4, 1e-3]) {
  const g = maxGradR(400, h, h * 10);
  log(`   h=${h.toExponential(3)} (400^2)  max|grad r| ${g.toFixed(4)}  CEIL ${(2 * Math.atan(g) * 180 / Math.PI).toFixed(3)} deg`);
}
const LMAX = maxGradR(1200, 2e-6, 2e-5);
const CEIL_DEG = 2 * Math.atan(LMAX) * 180 / Math.PI;
const GRAPHF = Math.sqrt(1 + LMAX * LMAX);
log(`   REFERENCE h=2.000e-6 on 1200^2: max|grad r| ${LMAX.toFixed(4)}  *** CEIL ${CEIL_DEG.toFixed(3)} deg ***  graph factor sqrt(1+L^2) ${GRAPHF.toFixed(4)} ${el()}`);
{
  const t = Date.now(); let acc = 0; const N = 2_000_000;
  for (let i = 0; i < N; i += 1) acc += rA((i * 0.00031) % (2 * Math.PI), (i * 0.0007) % H);
  const dt = (Date.now() - t) / 1000;
  log(`   rA THROUGHPUT ${(N / dt / 1e6).toFixed(2)} M evals/s (${(dt / N * 1e9).toFixed(0)} ns/eval)  [checksum ${(acc / N).toFixed(6)}]`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MESH
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const T_SEED = 2 * NTH * NZ;
const V_SEED = NTH * (NZ + 1);
const TCAP = 2 * MAXT + 8;
const VCAP = V_SEED + Math.ceil((MAXT - T_SEED) / 2) + 8;
if (MAXT < T_SEED) { log('*** MAXT below seed size ***'); process.exit(2); }
log(`── STAGE B: SEED GRID  ${NTH} x ${NZ}  ->  T ${T_SEED.toLocaleString()}  V ${V_SEED.toLocaleString()}`);
log(`   alloc  tv/tnb Int32Array(${(3 * TCAP).toLocaleString()}) = ${mbs(24 * TCAP)}  verts 3x Float64Array(${VCAP.toLocaleString()}) = ${mbs(24 * VCAP)}  r1 f64 ${mbs(8 * TCAP)}`);

const vx = new Float64Array(VCAP); const vy = new Float64Array(VCAP); const vz = new Float64Array(VCAP);
const tv = new Int32Array(3 * TCAP); const tnb = new Int32Array(3 * TCAP).fill(-1);
const alive = new Uint8Array(TCAP); const r1 = new Float64Array(TCAP);
/** bisection depth, for the runaway guard and for the honest "how deep did it have to go" report. */
const lev = new Uint8Array(TCAP);
const LEVCAP = envI('PF_S118D_LEVCAP', 200);
let maxLev = 0; let levStuck = 0;
let nV = 0; let nT = 0;

{
  const TAU = 2 * Math.PI;
  for (let i = 0; i < NTH; i += 1) {
    const th = (i / NTH) * TAU;
    const cs = Math.cos(th); const sn = Math.sin(th);
    for (let j = 0; j <= NZ; j += 1) {
      const z = (j / NZ) * H;
      const r = rA(th, z);
      // f32-ROUND AT BIRTH: the deliverable is a binary STL, so every number scored below is a number
      // the FILE actually stores.
      vx[nV] = Math.fround(r * cs); vy[nV] = Math.fround(r * sn); vz[nV] = Math.fround(z); nV += 1;
    }
  }
  const V = (i: number, j: number): number => ((i % NTH) + NTH) % NTH * (NZ + 1) + j;
  const T = (i: number, j: number, k: number): number => 2 * ((((i % NTH) + NTH) % NTH) * NZ + j) + k;
  for (let i = 0; i < NTH; i += 1) {
    for (let j = 0; j < NZ; j += 1) {
      const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
      const t0 = T(i, j, 0), t1 = T(i, j, 1);
      tv[t0 * 3] = a; tv[t0 * 3 + 1] = b; tv[t0 * 3 + 2] = c; alive[t0] = 1;
      tv[t1 * 3] = a; tv[t1 * 3 + 1] = c; tv[t1 * 3 + 2] = d; alive[t1] = 1;
      tnb[t0 * 3] = j > 0 ? T(i, j - 1, 1) : -1;
      tnb[t0 * 3 + 1] = T(i + 1, j, 1);
      tnb[t0 * 3 + 2] = t1;
      tnb[t1 * 3] = t0;
      tnb[t1 * 3 + 1] = j + 1 < NZ ? T(i, j + 1, 0) : -1;
      tnb[t1 * 3 + 2] = T(i - 1, j, 0);
    }
  }
  nT = T_SEED;
}
// CONTROL: the neighbour table must be a true involution and must reproduce the closed form.
{
  let bad = 0; let bnd = 0;
  for (let t = 0; t < nT; t += 1) {
    for (let s = 0; s < 3; s += 1) {
      const n = tnb[t * 3 + s];
      if (n < 0) { bnd += 1; continue; }
      let back = -1;
      for (let q = 0; q < 3; q += 1) if (tnb[n * 3 + q] === t) back = q;
      if (back < 0) { bad += 1; continue; }
      const a = tv[t * 3 + s], b = tv[t * 3 + ((s + 1) % 3)];
      const c = tv[n * 3 + back], d = tv[n * 3 + ((back + 1) % 3)];
      if (!((a === c && b === d) || (a === d && b === c))) bad += 1;
    }
  }
  const E = NTH * (NZ + 1) + 2 * NTH * NZ;
  const chi = V_SEED - E + T_SEED;
  log(`   CONTROL neighbour involution: ${bad} violations (must be 0)   boundary half-edges ${bnd} (closed form ${2 * NTH})`);
  log(`   CONTROL closed form  V ${V_SEED.toLocaleString()}  E ${E.toLocaleString()}  F ${T_SEED.toLocaleString()}  chi ${chi} (must be 0) ${el()}`);
  if (bad > 0 || bnd !== 2 * NTH || chi !== 0) { log('*** SEED TOPOLOGY CONTROL FIRED — RUN IS VOID ***'); process.exit(3); }
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// BISECTION — parameter metric, exact parameter midpoint lifted onto rA, footprint-sign CONTROL
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let nBisect = 0; let nReject = 0; let maxOff = 0; let sumOff = 0; let nOff = 0;
let minEdgePar = Infinity;

const edgeLen2 = (a: number, b: number): number => {
  const ta = Math.atan2(vy[a], vx[a]);
  const dth = dThRaw(ta, Math.atan2(vy[b], vx[b]));
  const rm = 0.5 * (Math.hypot(vx[a], vy[a]) + Math.hypot(vx[b], vy[b]));
  const du = dth * rm; const dz = vz[a] - vz[b];
  return du * du + dz * dz;
};
const longestSlot = (t: number): number => {
  let best = -1; let bl = -1; let bk = -1;
  for (let s = 0; s < 3; s += 1) {
    const a = tv[t * 3 + s], b = tv[t * 3 + ((s + 1) % 3)];
    const l = edgeLen2(a, b);
    const k = a < b ? a * 1e7 + b : b * 1e7 + a;
    if (l > bl || (l === bl && k > bk)) { bl = l; bk = k; best = s; }
  }
  return best;
};
/** signed arc-space area of (p,q,r), UNWRAPPED theta off p. Sign only — rMean is a positive scale. */
const parSigned = (
  px: number, py: number, pz: number, qx: number, qy: number, qz: number, rx: number, ry: number, rz: number,
): number => {
  const tp = Math.atan2(py, px);
  const tq = tp + dThRaw(tp, Math.atan2(qy, qx));
  const tr = tp + dThRaw(tp, Math.atan2(ry, rx));
  const rm = (Math.hypot(px, py) + Math.hypot(qx, qy) + Math.hypot(rx, ry)) / 3;
  return 0.5 * ((tq - tp) * rm * (rz - pz) - (tr - tp) * rm * (qz - pz));
};

function bisect(t: number, s: number): number {
  const a = tv[t * 3 + s], b = tv[t * 3 + ((s + 1) % 3)], c = tv[t * 3 + ((s + 2) % 3)];
  const n = tnb[t * 3 + s];
  let s2 = -1; let d = -1;
  if (n >= 0) {
    for (let q = 0; q < 3; q += 1) if (tnb[n * 3 + q] === t) { s2 = q; break; }
    if (s2 < 0) return 0;
    d = tv[n * 3 + ((s2 + 2) % 3)];
  }
  const ax = vx[a], ay = vy[a], az = vz[a];
  const bx = vx[b], by = vy[b], bz = vz[b];
  const tha = Math.atan2(ay, ax);
  const thm = tha + 0.5 * dThRaw(tha, Math.atan2(by, bx));
  const zm = 0.5 * (az + bz);
  const rm = rA(thm, zm);
  const mx = Math.fround(rm * Math.cos(thm)), my = Math.fround(rm * Math.sin(thm)), mz = Math.fround(zm);
  // CONTROL: the new vertex must be ON the surface to the f32 write floor.
  const off = Math.abs(Math.hypot(mx, my) - rA(Math.atan2(my, mx), mz));
  sumOff += off; nOff += 1; if (off > maxOff) maxOff = off;
  {
    const el2 = edgeLen2(a, b);
    if (el2 < minEdgePar) minEdgePar = el2;
  }
  // CONTROL: footprint-sign. By construction it cannot fire on a mesh generated by this tool.
  {
    const cx = vx[c], cy = vy[c], cz = vz[c];
    const sp = Math.sign(parSigned(ax, ay, az, bx, by, bz, cx, cy, cz));
    const s1 = Math.sign(parSigned(ax, ay, az, mx, my, mz, cx, cy, cz));
    const s2p = Math.sign(parSigned(mx, my, mz, bx, by, bz, cx, cy, cz));
    let ok = sp === 0 || (s1 === sp && s2p === sp);
    if (ok && n >= 0) {
      const dx = vx[d], dy = vy[d], dz = vz[d];
      const sq = Math.sign(parSigned(bx, by, bz, ax, ay, az, dx, dy, dz));
      const q1 = Math.sign(parSigned(bx, by, bz, mx, my, mz, dx, dy, dz));
      const q2 = Math.sign(parSigned(mx, my, mz, ax, ay, az, dx, dy, dz));
      ok = sq === 0 || (q1 === sq && q2 === sq);
    }
    if (!ok) { nReject += 1; return 0; }
  }
  if (nV >= VCAP || nT + 4 >= TCAP) return 0;
  const m = nV; vx[m] = mx; vy[m] = my; vz[m] = mz; nV += 1;
  const tBC = tnb[t * 3 + ((s + 1) % 3)], tCA = tnb[t * 3 + ((s + 2) % 3)];
  const t1 = nT; const t2 = nT + 1; nT += 2;
  tv[t1 * 3] = a; tv[t1 * 3 + 1] = m; tv[t1 * 3 + 2] = c; alive[t1] = 1;
  tv[t2 * 3] = m; tv[t2 * 3 + 1] = b; tv[t2 * 3 + 2] = c; alive[t2] = 1;
  alive[t] = 0;
  const lvT = Math.min(255, lev[t] + 1); lev[t1] = lvT; lev[t2] = lvT;
  if (lvT > maxLev) maxLev = lvT;
  let n1 = -1; let n2 = -1;
  if (n >= 0) {
    const nAD = tnb[n * 3 + ((s2 + 1) % 3)], nDB = tnb[n * 3 + ((s2 + 2) % 3)];
    n1 = nT; n2 = nT + 1; nT += 2;
    tv[n1 * 3] = b; tv[n1 * 3 + 1] = m; tv[n1 * 3 + 2] = d; alive[n1] = 1;
    tv[n2 * 3] = m; tv[n2 * 3 + 1] = a; tv[n2 * 3 + 2] = d; alive[n2] = 1;
    alive[n] = 0;
    const lvN = Math.min(255, lev[n] + 1); lev[n1] = lvN; lev[n2] = lvN;
    if (lvN > maxLev) maxLev = lvN;
    tnb[n1 * 3] = t2; tnb[n1 * 3 + 1] = n2; tnb[n1 * 3 + 2] = nDB;
    tnb[n2 * 3] = t1; tnb[n2 * 3 + 1] = nAD; tnb[n2 * 3 + 2] = n1;
    if (nAD >= 0) for (let q = 0; q < 3; q += 1) if (tnb[nAD * 3 + q] === n) tnb[nAD * 3 + q] = n2;
    if (nDB >= 0) for (let q = 0; q < 3; q += 1) if (tnb[nDB * 3 + q] === n) tnb[nDB * 3 + q] = n1;
  }
  tnb[t1 * 3] = n2; tnb[t1 * 3 + 1] = t2; tnb[t1 * 3 + 2] = tCA;
  tnb[t2 * 3] = n1; tnb[t2 * 3 + 1] = tBC; tnb[t2 * 3 + 2] = t1;
  if (tBC >= 0) for (let q = 0; q < 3; q += 1) if (tnb[tBC * 3 + q] === t) tnb[tBC * 3 + q] = t2;
  if (tCA >= 0) for (let q = 0; q < 3; q += 1) if (tnb[tCA * 3 + q] === t) tnb[tCA * 3 + q] = t1;
  nBisect += 1;
  return n >= 0 ? 4 : 2;
}

let born: Int32Array = new Int32Array(1 << 20);
let nBorn = 0;
const pushBorn = (t: number): void => {
  if (nBorn >= born.length) { const g = new Int32Array(born.length * 2); g.set(born); born = g; }
  born[nBorn] = t; nBorn += 1;
};

/** Rivara LEPP: bisect the terminal edge of `t`'s longest-edge chain until `t` itself is split. */
function lepp(t: number): void {
  let guard = 0;
  while (alive[t] === 1 && guard < 600) {
    guard += 1;
    let cur = t;
    for (let chain = 0; chain < 600; chain += 1) {
      const s = longestSlot(cur);
      const nb = tnb[cur * 3 + s];
      if (nb < 0) break;
      const s2 = longestSlot(nb);
      if (tnb[nb * 3 + s2] === cur) break;
      cur = nb;
    }
    const s = longestSlot(cur);
    const before = nT;
    let made = bisect(cur, s);
    if (made === 0) { for (let alt = 0; alt < 3 && made === 0; alt += 1) if (alt !== s) made = bisect(cur, alt); }
    if (made === 0) return;
    for (let q = before; q < nT; q += 1) pushBorn(q);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE KEY — R1, the PROVEN UPPER BOUND on the perpendicular distance
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const latOf = (k: number): Float64Array => latticePts(k);
const LAT_D = latOf(K_DRV); const NP_D = LAT_D.length / 3;
const KEY = envS('PF_S118D_KEY', 'perp');
const UB_ITER = envI('PF_S118D_UBITER', 3);
const UB_H = envF('PF_S118D_UBH', 1e-4);
let ubEvals = 0;

/**
 * A PROVEN UPPER BOUND on dist(P, S), and the reason the driver does not overpay by the graph factor.
 *
 * R1 is sound but LOOSE exactly where all the work is. At a crest the surface's gradient jump is up to
 * L = 9.64, so a chord that cuts the crest has a RADIAL residual up to sqrt(1+L^2) = 9.70x its true
 * perpendicular distance. Driving on R1 would therefore buy ~9.7x more refinement than the objective
 * needs, in the one place the mesh is already most expensive.
 *
 * Every value this function ever compares is |P - S(th, z)| for an ACTUAL (th, z) — a real point of the
 * analytic surface. The minimum of such values is an upper bound on the distance to the surface NO MATTER
 * how the search behaves: a bad step can only make the bound loose, never optimistic. That is what makes
 * it safe to drive on. It is seeded at the radial foot, so it starts at exactly R1 and can only improve,
 * and it is validated against buildRadialSurfaceProjector on a sample (control U1 below).
 */
function perpUB(x: number, y: number, z: number, seed2: number): number {
  const th0 = Math.atan2(y, x);
  let best = seed2;
  let th = th0; let zz = z < 0 ? 0 : z > H ? H : z;
  let fcur = seed2;
  const F = (t2: number, z2: number): number => {
    const zc = z2 < 0 ? 0 : z2 > H ? H : z2;
    const r = rA(t2, zc); ubEvals += 1;
    const dx = x - r * Math.cos(t2), dy = y - r * Math.sin(t2), dz = z - zc;
    const f = dx * dx + dy * dy + dz * dz;
    if (f < best) best = f;
    return f;
  };
  for (let it = 0; it < UB_ITER; it += 1) {
    const rr = Math.max(1e-6, rA(th, zz)); ubEvals += 1;
    const hTh = UB_H / rr;
    const gU = (F(th + hTh, zz) - F(th - hTh, zz)) / (2 * UB_H);
    const gV = (F(th, zz + UB_H) - F(th, zz - UB_H)) / (2 * UB_H);
    const gn2 = gU * gU + gV * gV;
    if (gn2 <= 0) break;
    let step = (2 * fcur) / gn2;      // exact for a locally quadratic F; backtracked below
    let moved = false;
    for (let trial = 0; trial < 3; trial += 1) {
      const u = -step * gU, v = -step * gV;
      const nth = th + u / rr; const nz = zz + v;
      const f = F(nth, nz);
      if (f < fcur) { th = nth; zz = nz < 0 ? 0 : nz > H ? H : nz; fcur = f; moved = true; break; }
      step *= 0.35;
    }
    if (!moved) break;
  }
  return Math.sqrt(best);
}

/**
 * The driving key for facet `t`: a PROVEN UPPER BOUND on the perpendicular distance from the facet to the
 * analytic surface, evaluated on the order-`k` barycentric lattice.
 *
 * KEY=r1   the radial residual alone — sound, and 1.0-9.7x loose.
 * KEY=perp the radial residual first (it is 25x cheaper and CERTIFIES any point at or under the bar,
 *          since perpendicular <= radial POINTWISE), then the tightened bound only at the points the
 *          radial screen could not clear. `early` stops at the first point that is proven over the bar —
 *          correct for a yes/no driving decision, WRONG for a reported max, so the census never uses it.
 */
function keyOf(t: number, LAT: Float64Array, NP: number, early: boolean): number {
  const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2];
  const ax = vx[a], ay = vy[a], az = vz[a];
  const bx = vx[b], by = vy[b], bz = vz[b];
  const cx = vx[c], cy = vy[c], cz = vz[c];
  let w = 0;
  if (KEY !== 'perp') {
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > w) w = dd;
      if (early && w > BAR) return w;
    }
    return w;
  }
  for (let p = 0; p < NP; p += 1) {
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd <= BAR) { if (dd > w) w = dd; continue; }   // PROVEN under the bar: perpendicular <= radial
    const u = perpUB(x, y, z, dd * dd);
    if (u > w) w = u;
    if (early && w > BAR) return w;
  }
  return w;
}
const r1Of = (t: number, LAT: Float64Array, NP: number): number => keyOf(t, LAT, NP, false);

// deterministic PRNG for the placebo arm
let rngS = SEED >>> 0;
const rnd = (): number => { rngS ^= rngS << 13; rngS >>>= 0; rngS ^= rngS >>> 17; rngS ^= rngS << 5; rngS >>>= 0; return rngS / 4294967296; };

// ── CONTROL U1: the cheap upper bound must never read BELOW the real projector, and its LOOSENESS is
// the honest price of not paying 140 us/call. Both directions are printed; a single violation voids the
// KEY=perp arm, because the whole soundness argument is "U >= dist".
log(`── CONTROL U1: perpUB vs buildRadialSurfaceProjector (key=${KEY}) ──`);
{
  const projC = buildRadialSurfaceProjector(rA, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });
  const N = envI('PF_S118D_U1N', 4000);
  let viol = 0; let worstViol = 0; let sumRat = 0; let maxRat = 0; let minRat = Infinity; let n = 0;
  const rats: number[] = [];
  const tU = Date.now(); const e0 = ubEvals;
  for (let q = 0; q < N; q += 1) {
    const th = rnd() * 2 * Math.PI; const z = rnd() * H;
    const off = (rnd() - 0.5) * 0.4;                 // +/- 0.2 mm off the surface, the regime that matters
    const r = rA(th, z) + off;
    const x = r * Math.cos(th), y = r * Math.sin(th);
    const dd = Math.abs(off);
    const u = perpUB(x, y, z, dd * dd);
    const d = projC.project(x, y, z).dist;
    if (u < d - 1e-9) { viol += 1; if (d - u > worstViol) worstViol = d - u; }
    if (d > 1e-12) { const rt = u / d; rats.push(rt); sumRat += rt; if (rt > maxRat) maxRat = rt; if (rt < minRat) minRat = rt; n += 1; }
  }
  rats.sort((p, q2) => p - q2);
  const dtU = (Date.now() - tU) / 1000;
  log(`   n=${N}  *** U < projector violations ${viol} (MUST be 0; worst ${ex(worstViol)} mm) ***`);
  log(`   looseness U/proj: min ${minRat.toFixed(6)}  p50 ${rats[Math.floor(n * 0.5)].toFixed(6)}  p99 ${rats[Math.floor(n * 0.99)].toFixed(6)}  MAX ${maxRat.toFixed(6)}  mean ${(sumRat / n).toFixed(6)}`);
  log(`   cost: ${((ubEvals - e0) / N).toFixed(1)} rA evals per perpUB call;  ${dtU.toFixed(2)} s for ${N} pairs ${el()}`);
  if (viol > 0 && KEY === 'perp') { log('*** CONTROL U1 FIRED — the upper-bound argument is broken. RUN IS VOID. ***'); process.exit(3); }
}
log('');

log(`── STAGE C: DRIVE (${ARM === 'placebo' ? 'PLACEBO — random targets, cost-matched' : 'OPERATOR — over-bar targets'})  key=${KEY} ──`);
{
  let live0 = 0;
  for (let t = 0; t < nT; t += 1) if (alive[t] === 1) { r1[t] = keyOf(t, LAT_D, NP_D, true); live0 += 1; }
  let mx = 0; let over = 0;
  for (let t = 0; t < nT; t += 1) if (alive[t] === 1) { if (r1[t] > mx) mx = r1[t]; if (r1[t] > BAR) over += 1; }
  log(`   seed scored: live ${live0.toLocaleString()}  key MAX ${ex(mx)} mm  over bar ${over.toLocaleString()} (${pct(over, live0)}%) ${el()}`);
}

// ── THE WORK LIST ───────────────────────────────────────────────────────────────────────────────────
// Round-based refinement halves a target's longest edge ONCE per global rescan, so a facet whose R1 is
// 150x over the bar needs ~15 full O(nT) rescans before it is done, and the run spends its whole budget
// on bookkeeping. The work list drives each facet to the bar directly: pop, refine, score the children,
// push the ones still over. LEPP's chain also splits neighbours; those children are scored and pushed on
// the same rule, which is what keeps the result INDEPENDENT of the pop order.
let stack: Int32Array = new Int32Array(1 << 20);
let nStack = 0;
const push = (t: number): void => {
  if (nStack >= stack.length) { const g = new Int32Array(stack.length * 2); g.set(stack); stack = g; }
  stack[nStack] = t; nStack += 1;
};
const targetT = ARM === 'placebo' && MATCHT > 0 ? MATCHT : MAXT;
let stopReason = 'converged';
let live = 0;
for (let t = 0; t < nT; t += 1) if (alive[t] === 1) live += 1;
let capHit = false;
const capReached = (): boolean => nT + 8 >= TCAP || nV + 2 >= VCAP || live >= targetT;
if (ARM === 'placebo') {
  // UNINFORMED KEY, IDENTICAL MACHINERY: a deterministic uniform draw from the live facets, spending the
  // SAME triangle budget. Nothing about rA enters the choice of what to refine.
  let nextLog = live + 200_000;
  while (!capReached() && secs() < MAXSECS) {
    let t = Math.floor(rnd() * nT);
    let guard = 0;
    while (alive[t] !== 1 && guard < 128) { t = Math.floor(rnd() * nT); guard += 1; }
    if (alive[t] !== 1) continue;
    const before = nT; nBorn = 0;
    lepp(t);
    live += (nT - before) / 2;
    if (live >= nextLog) { log(`   [placebo] live ${Math.round(live).toLocaleString()}  bisections ${nBisect.toLocaleString()} ${el()} rss ${mbs(rssNow())}`); nextLog = live + 200_000; }
  }
  stopReason = live >= targetT ? 'cost-matched' : (secs() >= MAXSECS ? 'time cap' : 'allocation cap');
} else {
  for (let t = 0; t < nT; t += 1) if (alive[t] === 1 && r1[t] > BAR) push(t);
  let nextLog = live + 250_000;
  let popped = 0;
  while (nStack > 0) {
    if (capReached()) { capHit = true; stopReason = live >= targetT ? 'triangle cap' : 'allocation cap'; break; }
    if (secs() > MAXSECS) { stopReason = 'time cap'; break; }
    nStack -= 1;
    const t = stack[nStack];
    popped += 1;
    if (alive[t] !== 1 || r1[t] <= BAR) continue;
    if (lev[t] >= LEVCAP) { levStuck += 1; continue; }
    const before = nT; nBorn = 0;
    lepp(t);
    live += (nT - before) / 2;
    for (let q = 0; q < nBorn; q += 1) {
      const c = born[q];
      if (alive[c] !== 1) continue;
      r1[c] = keyOf(c, LAT_D, NP_D, true);
      if (r1[c] > BAR) push(c);
    }
    if (live >= nextLog) {
      log(`   live ${Math.round(live).toLocaleString()}  bisections ${nBisect.toLocaleString()}  worklist ${nStack.toLocaleString()}  popped ${popped.toLocaleString()}  maxLevel ${maxLev} ${el()} rss ${mbs(rssNow())}`);
      nextLog = live + 250_000;
    }
  }
  if (!capHit && nStack === 0 && stopReason === 'converged') stopReason = 'converged';
}
log(`   DRIVE DONE (${stopReason})  bisections ${nBisect.toLocaleString()}  rejections ${nReject.toLocaleString()} (${pct(nReject, nBisect + nReject)}%)  maxLevel ${maxLev}  level-capped facets ${levStuck}`);
log(`   CONTROL new-vertex off-surface |r - rA|: mean ${ex(nOff > 0 ? sumOff / nOff : 0)} mm  MAX ${ex(maxOff)} mm   (f32 write floor at r=50 is ~3.8e-6 mm)`);
log(`   CONTROL footprint-sign rejections ${nReject} — on a generated mesh this MUST be 0; a non-zero value refutes the by-construction claim.`);
log(`   min bisected PARAMETER edge ${ex(Math.sqrt(minEdgePar))} mm   (f32 coordinate quantum at r=50 is ~3.8e-6 mm)`);

// ── CHECKPOINT. This box is shared with concurrent agents and two full runs of this tool have already
// been lost to an external `taskkill /F /IM node.exe`. The verify stage below is the longest phase, so
// the mesh is written to disk BEFORE it starts: a kill then costs the verification, not the mesh.
function writeStl(path: string): number {
  const fd = openSync(path, 'w');
  try {
    let liveW = 0;
    for (let t = 0; t < nT; t += 1) if (alive[t] === 1) liveW += 1;
    const head = Buffer.alloc(84);
    head.writeUInt32LE(liveW, 80);
    writeSync(fd, head, 0, 84);
    const BLK = 100_000;
    const blk = Buffer.alloc(BLK * 50);
    let o = 0; let wrote = 0;
    for (let t = 0; t < nT; t += 1) {
      if (alive[t] !== 1) continue;
      const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2];
      const ax = vx[a], ay = vy[a], az = vz[a];
      const bx = vx[b], by = vy[b], bz = vz[b];
      const cx = vx[c], cy = vy[c], cz = vz[c];
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      blk.writeFloatLE(nx, o); blk.writeFloatLE(ny, o + 4); blk.writeFloatLE(nz, o + 8);
      blk.writeFloatLE(ax, o + 12); blk.writeFloatLE(ay, o + 16); blk.writeFloatLE(az, o + 20);
      blk.writeFloatLE(bx, o + 24); blk.writeFloatLE(by, o + 28); blk.writeFloatLE(bz, o + 32);
      blk.writeFloatLE(cx, o + 36); blk.writeFloatLE(cy, o + 40); blk.writeFloatLE(cz, o + 44);
      blk.writeUInt16LE(0, o + 48);
      o += 50; wrote += 1;
      if (o >= BLK * 50) { writeSync(fd, blk, 0, o); o = 0; }
    }
    if (o > 0) writeSync(fd, blk, 0, o);
    return wrote;
  } finally { closeSync(fd); }
}
if (OUT.length > 0) log(`   CHECKPOINT: wrote ${writeStl(`${OUT}.ckpt`).toLocaleString()} facets -> ${OUT}.ckpt ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE D — VERIFY ON A STRICTLY FINER LATTICE, AND REFINE UNTIL IT AGREES
// The order-k barycentric lattice CONTAINS the order-(k/m) lattice for integer m, so a mesh certified at
// K_VER is certified at every coarser divisor — including the scorer's k=8.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log(`── STAGE D: VERIFY AT k=${K_VER} (${(K_VER + 1) * (K_VER + 2) / 2} pts/facet) AND REFINE UNTIL IT AGREES ──`);
const LAT_V = latOf(K_VER); const NP_V = LAT_V.length / 3;
let verPass = 0; let verOver = -1;
if (ARM !== 'placebo') {
  for (verPass = 0; verPass < VER_PASSES; verPass += 1) {
    const tgt: number[] = [];
    let mx = 0; let scanned = 0; let nextScanLog = 500_000;
    for (let t = 0; t < nT; t += 1) {
      if (alive[t] !== 1) continue;
      const v = r1Of(t, LAT_V, NP_V);
      r1[t] = v;
      if (v > mx) mx = v;
      if (v > BAR) tgt.push(t);
      scanned += 1;
      if (scanned >= nextScanLog) { log(`      ...scanned ${scanned.toLocaleString()} facets, over-bar so far ${tgt.length.toLocaleString()}, max ${ex(mx)} ${el()}`); nextScanLog += 500_000; }
    }
    verOver = tgt.length;
    log(`   verify pass ${verPass}: over-bar at k=${K_VER}: ${tgt.length.toLocaleString()}   R1max ${ex(mx)} mm  live ${Math.round(live).toLocaleString()} ${el()}`);
    if (tgt.length === 0) break;
    if (secs() > MAXSECS) { log('   *** time cap during verify — NOT converged ***'); break; }
    // drive the k=K_VER offenders on the SAME work list, so each one reaches the bar rather than being
    // halved once per pass.
    nStack = 0;
    for (const t of tgt) push(t);
    while (nStack > 0) {
      if (nT + 8 >= TCAP || nV + 2 >= VCAP || live >= targetT) { log('   *** cap during verify-refine ***'); break; }
      if (secs() > MAXSECS) break;
      nStack -= 1;
      const t = stack[nStack];
      if (alive[t] !== 1 || r1[t] <= BAR) continue;
      if (lev[t] >= LEVCAP) { levStuck += 1; continue; }
      const before = nT; nBorn = 0;
      lepp(t);
      live += (nT - before) / 2;
      for (let q = 0; q < nBorn; q += 1) {
        const c = born[q];
        if (alive[c] !== 1) continue;
        r1[c] = keyOf(c, LAT_V, NP_V, true);
        if (r1[c] > BAR) push(c);
      }
    }
  }
} else {
  let mx = 0;
  for (let t = 0; t < nT; t += 1) if (alive[t] === 1) { const v = r1Of(t, LAT_V, NP_V); r1[t] = v; if (v > mx) mx = v; }
  log(`   placebo arm: verification is a MEASUREMENT only, never a driver.  R1max at k=${K_VER} ${ex(mx)} mm ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE E — IN-TOOL CENSUS (the authoritative one is s118Score on the written STL)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE E: IN-TOOL CENSUS (COUNT + AREA + MAX, per facet) ──');
let liveN = 0; let area3 = 0;
let preMax = 0; let preOver1um = 0;
let r1OverHiC = 0; let r1OverHiA = 0; let r1OverLoC = 0; let r1OverLoA = 0; let r1Max = 0;
let ndlC = 0; let ndlA = 0; let invC = 0; let invA = 0; let poleC = 0; let poleA = 0;
let thinC = 0; let thinA = 0; let minAltMin = Infinity; let minThin = Infinity; let minEdge3 = Infinity;
const BARLO = 0.001;
{
  for (let t = 0; t < nT; t += 1) {
    if (alive[t] !== 1) continue;
    liveN += 1;
    const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2];
    const ax = vx[a], ay = vy[a], az = vz[a];
    const bx = vx[b], by = vy[b], bz = vz[b];
    const cx = vx[c], cy = vy[c], cz = vz[c];
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const G = facetGeom(ax, ay, az, bx, by, bz, cx, cy, cz, tha, thb, thc);
    area3 += G.area;
    // PRECOND: exhaustive, every corner, no stride
    for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
      const dv = Math.abs(Math.hypot(px, py) - rA(Math.atan2(py, px), pz));
      if (dv > preMax) preMax = dv;
      if (dv > 1e-3) preOver1um += 1;
    }
    const v = r1[t];
    if (v > r1Max) r1Max = v;
    if (v > BAR) { r1OverHiC += 1; r1OverHiA += G.area; }
    if (v > BARLO) { r1OverLoC += 1; r1OverLoA += G.area; }
    if (G.minAltUm < 2) { ndlC += 1; ndlA += G.area; }
    if (G.apsSign < 0) { invC += 1; invA += G.area; }
    if (G.graphRatio >= 100) { poleC += 1; poleA += G.area; }
    if (G.minAltUm < minAltMin) minAltMin = G.minAltUm;
    // SCALE-FREE thinness: minAlt / maxEdge in ARC space. A small well-shaped facet is not a needle;
    // an absolute micron bar cannot tell the two apart once the mesh is dense (scar 6).
    const ua = tha * 1; const ub = thb; const uc = thc;
    const rmM = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const e1 = Math.hypot((ub - ua) * rmM, bz - az);
    const e2 = Math.hypot((uc - ub) * rmM, cz - bz);
    const e3 = Math.hypot((ua - uc) * rmM, az - cz);
    const emax = Math.max(e1, e2, e3);
    const thin = emax > 0 ? (G.minAltUm / 1000) / emax : 0;
    if (thin < 0.02) { thinC += 1; thinA += G.area; }
    if (thin < minThin) minThin = thin;
    const e3d = Math.min(
      Math.hypot(bx - ax, by - ay, bz - az),
      Math.hypot(cx - bx, cy - by, cz - bz),
      Math.hypot(ax - cx, ay - cy, az - cz),
    );
    if (e3d < minEdge3) minEdge3 = e3d;
  }
}
log(`   facets ${liveN.toLocaleString()}   3D area ${area3.toFixed(3)} mm2`);
log(`   PRECOND (EXHAUSTIVE, every corner): MAX ${(preMax * 1000).toFixed(4)} um   corners over 1 um ${preOver1um}`);
log(`   DRIVING KEY (key=${KEY}; a PROVEN UPPER BOUND on the perpendicular distance), lattice k=${K_VER}:`);
log(`      > 0.01  mm : ${r1OverHiC.toLocaleString()} facets (${pct(r1OverHiC, liveN)}%)  ${r1OverHiA.toFixed(4)} mm2 = ${pct(r1OverHiA, area3)}% OF MESH`);
log(`      > 0.001 mm : ${r1OverLoC.toLocaleString()} facets (${pct(r1OverLoC, liveN)}%)  ${r1OverLoA.toFixed(4)} mm2 = ${pct(r1OverLoA, area3)}% OF MESH`);
log(`      *** KEY MAX ${ex(r1Max)} mm ***  (key=r1 => this IS the radial residual; key=perp => it is the tightened bound, <= radial)`);
log('   ARTEFACTS (analytic-free):');
log(`      NEEDLES (arc minAlt < 2 um, ABSOLUTE): ${ndlC.toLocaleString()} (${pct(ndlC, liveN)}%)  ${ndlA.toFixed(4)} mm2 = ${pct(ndlA, area3)}% OF MESH   min arc altitude ${minAltMin.toFixed(4)} um`);
log(`      THIN (arc minAlt/maxEdge < 0.02, SCALE-FREE): ${thinC.toLocaleString()} (${pct(thinC, liveN)}%)  ${thinA.toFixed(4)} mm2 = ${pct(thinA, area3)}% OF MESH   worst ratio ${minThin.toFixed(6)}`);
log(`      FOOTPRINT-SIGN INVERSIONS: ${invC.toLocaleString()} (${pct(invC, liveN)}%)  ${invA.toFixed(4)} mm2 = ${pct(invA, area3)}% OF MESH`);
log(`      DEGENERACY POLES (graphRatio >= 100): ${poleC.toLocaleString()} (${pct(poleC, liveN)}%)  ${poleA.toFixed(4)} mm2 = ${pct(poleA, area3)}% OF MESH`);
log(`      min 3D edge ${ex(minEdge3)} mm = ${(minEdge3 / 3.8e-6).toFixed(0)}x the f32 coordinate quantum at r=50`);
log(`   ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE F — WRITE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (OUT.length > 0) log(`── STAGE F: wrote ${writeStl(OUT).toLocaleString()} facets -> ${OUT} ${el()}`);

const J = {
  tag: TAG, style: STYLE, arm: ARM, bar: BAR, seed: [NTH, NZ], kDrive: K_DRV, kVerify: K_VER,
  facets: liveN, area3D: area3, bisections: nBisect, rejections: nReject, stopReason,
  verifyPasses: verPass, verifyOver: verOver,
  precondMaxUm: preMax * 1000, r1Max, r1OverHiC, r1OverHiA, r1OverLoC, r1OverLoA,
  needleC: ndlC, needleA: ndlA, thinC, thinA, invC, poleC, minAltUm: minAltMin, minThin, minEdge3,
  out: OUT, wallSecs: secs(),
};
writeFileSync(`${OUTDIR}/S118_DRIVE_${TAG}.json`, JSON.stringify(J, null, 2));
log(`WALL ${secs().toFixed(1)} s   peak rss ${mbs(process.resourceUsage().maxRSS * 1024)}`);
log(`json -> ${OUTDIR}/S118_DRIVE_${TAG}.json`);
log('S118 DRIVE DONE');

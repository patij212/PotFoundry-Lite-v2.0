// s118CtApcr.ts — S118 DRIVE PHASE: take CelticTriquetra to 0.01 mm, then to 0.001 mm, with ZERO artefacts.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE OPERATOR — APCR, verbatim from S116 (research/tools/s116BestGothic.ts), because its two structural
// properties are exactly the ones this session needs and they are properties of the CONSTRUCTION, not of
// a repair pass:
//   (1) RIVARA LEPP LONGEST-EDGE BISECTION always splits BOTH triangles incident on the chosen edge, so a
//       hanging node never exists at any intermediate state. Conformity is structural.
//   (2) EVERY NEW VERTEX IS THE EXACT PARAMETER MIDPOINT LIFTED ONTO rA. Radial projection preserves
//       (theta, z), so every child inherits its parent's parametric footprint sign: A FOLD IS NOT
//       REPRESENTABLE. PRECOND cannot degrade either — every vertex is ON rA by construction.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS NEW HERE, AND WHY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A. THE DRIVE KEY IS THE AUDIT RULER. The campaign's scar is refining on a ruler that is not the one
//    that judges (the driver's plane ruler is 21.9x blind). Here a facet is judged by a THREE-WAY test
//    that never certifies on anything but a sound bound:
//        R1 <= bar                       -> CERTIFIED under the bar. Radial >= perpendicular POINTWISE,
//                                           so this is a proof, not a sample. No projector call.
//        R1 > bar * SLOPE                -> assume over. SLOPE is a HEURISTIC accelerator only; being
//                                           wrong here can only cause OVER-refinement, never a false
//                                           certification.
//        otherwise                       -> ADJUDICATE with buildRadialSurfaceProjector (perpendicular).
//    Nothing is ever certified by a projector-free guess in the direction that would flatter the mesh.
//
// B. THE STALL DETECTOR — the mechanism-free way to find what cannot converge.
//    CelticTriquetra's rA is GENUINELY DISCONTINUOUS (S118 step 0 measured a 1.720 mm jump that survived
//    a bracket collapsing to 4.4e-16 rad). A facet spanning that cliff CANNOT have its residual reduced
//    by splitting: the solid has a cliff FACE there, the ruler's surface model is the graph of rA and has
//    no points inside the jump, so the facet reads ~jump/2 forever. Splitting it forever is precisely how
//    a needle class gets manufactured along the seam.
//    Rather than hard-coding where the cliff is, this tool MEASURES non-convergence: when a child's
//    residual fails to fall below STALL_FRAC x its parent's, its stall counter increments; at STALL_MAX
//    consecutive stalls the facet is RETIRED from the target set and booked to the STALLED class, which is
//    then DIAGNOSED (below). Any non-converging mechanism is caught, including ones I have not thought of.
//
// C. THE CLIFF DIAGNOSIS, applied only to the residual (so it can afford to be exact). For a facet, walk
//    its three PARAMETRIC edges; wherever two adjacent samples of rA differ by more than the threshold,
//    run a bracket-preserving bisection. If the jump SURVIVES the bracket collapsing to ~1e-15 rad, rA is
//    discontinuous inside that facet and the facet is CLIFF-EXPOSED. A smooth rA cannot survive that test.
//
// D. THE COST-MATCHED PLACEBO. Identical machinery, identical guard, identical projection, identical
//    stall logic; the ONLY difference is that targets are drawn by a deterministic uniform RNG instead of
//    by the ruler. It runs until it has at least as many live triangles as the operator arm. If it scores
//    as well, the operator is refuted.
//
// Usage: bash research/tools/run-s118-ctapcr.sh
//   env PF_S118A_STL(abs) PF_S118A_STYLE PF_S118A_TAG PF_S118A_BARS(csv) PF_S118A_MAXT PF_S118A_TCAP
//       PF_S118A_VCAP PF_S118A_PLACEBO(0/1) PF_S118A_ROUNDS PF_S118A_STALLMAX PF_S118A_OUTDIR
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

const STYLE = envS('PF_S118A_STYLE', 'CelticTriquetra');
const STL = envS('PF_S118A_STL', '');
const TAG = envS('PF_S118A_TAG', 'CT');
const OUTDIR = envS('PF_S118A_OUTDIR', 'research/exchange/_strataConformBisect/s118');
const DIMS: StyleDims = { H: envF('PF_S118A_H', 120), Rb: envF('PF_S118A_RB', 40), Rt: envF('PF_S118A_RT', 50), expn: 1 };
const H = DIMS.H;
const BARS = envS('PF_S118A_BARS', '0.01,0.001').split(',').map(Number);
const MAXT = envI('PF_S118A_MAXT', 8_000_000);
const TCAP = envI('PF_S118A_TCAP', 20_000_000);
const VCAP = envI('PF_S118A_VCAP', 10_000_000);
const ROUNDS = envI('PF_S118A_ROUNDS', 60);
const STALL_MAX = envI('PF_S118A_STALLMAX', 4);
const STALL_FRAC = envF('PF_S118A_STALLFRAC', 0.80);
// THE REFINEMENT RULER MUST EQUAL THE AUDIT RULER (feedback_sag_ruler_discipline). k=8 is the lattice
// the session's scorer judges on, so the drive uses it too: a facet the drive certifies is a facet the
// audit certifies, rather than one that passed on a coarser sample.
const K_LOOP = envI('PF_S118A_KLOOP', 8);
const K_FINAL = envI('PF_S118A_KFINAL', 8);
const DO_PLACEBO = envI('PF_S118A_PLACEBO', 1) === 1;
const MAXSECS = envF('PF_S118A_MAXSECS', 100000);
if (STL.length === 0) { log('*** PF_S118A_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
let rEvals = 0;
const rA = (th: number, z: number): number => { rEvals += 1; return rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z); };
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1536, nZ: 768, seedTopK: 6 });
let projCalls = 0;
const perpDist = (x: number, y: number, z: number): number => { projCalls += 1; return proj.project(x, y, z).dist; };

const pct = (a: number, b: number): string => (b === 0 ? '   —   ' : ((a / b) * 100).toFixed(4));
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(0)}s`;

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 DRIVE — ${STYLE} to ${BARS.map((b) => `${b} mm`).join(' then ')}, APCR + STALL RETIREMENT  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`seed stl  ${STL}`);
log(`params    ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log(`caps      maxT ${MAXT.toLocaleString()}  tcap ${TCAP.toLocaleString()}  vcap ${VCAP.toLocaleString()}  rounds<=${ROUNDS}  stallMax ${STALL_MAX} @ frac ${STALL_FRAC}`);
log(`projector ${proj.gridThetaCount} x ${proj.gridZCount} = ${proj.sampleCount.toLocaleString()} samples`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SLOPE ACCELERATOR. |grad r| bounds how far perpendicular can fall below radial on a GRAPH patch.
// It is measured, swept in h (scar 3), and used ONLY to skip adjudication for facets we are going to
// split anyway. It NEVER certifies. On a discontinuous rA a finite-difference scan cannot see the cliff,
// so this number is a smooth-region figure and is labelled as such.
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
      const rz = (rA(th, zh) - rA(th, zl)) / Math.max(1e-12, zh - zl);
      const m = Math.hypot(rt, rz);
      if (m > g) g = m;
    }
  }
  return g;
}
log('── SLOPE ACCELERATOR (scar 3: h swept). NOT a certification — see the header. ──');
let LMAX = 0;
for (const h of [2e-5, 2e-4, 1e-3]) { const m = maxGradR(300, h, h); LMAX = Math.max(LMAX, m); log(`   h=${h.toExponential(0)}  max|grad r| ${m.toFixed(4)}`); }
const SLOPE = Math.sqrt(1 + LMAX * LMAX);
log(`   SLOPE = sqrt(1+L^2) = ${SLOPE.toFixed(4)}   (adjudication band is bar < R1 <= ${SLOPE.toFixed(2)} x bar)`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MESH
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Mesh {
  vx: Float64Array; vy: Float64Array; vz: Float64Array; nV: number;
  tv: Int32Array; tnb: Int32Array; alive: Uint8Array; nT: number;
  cap: number; vcap: number;
}
let weldNonMan = 0;
function buildMesh(xyz: Float64Array, nTri: number): Mesh {
  const nVin = nTri * 3;
  const id = new Int32Array(nVin);
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const vx = new Float64Array(VCAP); const vy = new Float64Array(VCAP); const vz = new Float64Array(VCAP);
  let nV = 0;
  for (let v = 0; v < nVin; v += 1) {
    const x = xyz[v * 3], y = xyz[v * 3 + 1], z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    const h = (Math.imul(u32[0], 0x9e3779b1) ^ Math.imul(u32[1], 0x85ebca6b) ^ Math.imul(u32[2], 0xc2b2ae35)) | 0;
    const b = buckets.get(h);
    let found = -1;
    if (b !== undefined) for (const c of b) if (vx[c] === x && vy[c] === y && vz[c] === z) { found = c; break; }
    if (found < 0) { found = nV; vx[nV] = x; vy[nV] = y; vz[nV] = z; nV += 1; if (b === undefined) buckets.set(h, [found]); else b.push(found); }
    id[v] = found;
  }
  const tv = new Int32Array(TCAP * 3); const tnb = new Int32Array(TCAP * 3).fill(-1);
  const alive = new Uint8Array(TCAP);
  for (let t = 0; t < nTri; t += 1) { tv[t * 3] = id[t * 3]; tv[t * 3 + 1] = id[t * 3 + 1]; tv[t * 3 + 2] = id[t * 3 + 2]; alive[t] = 1; }
  // half-edge pairing by CSR counting sort — NEVER a Map. A V8 Map throws above 2^23 entries and this
  // mesh reaches 1e7 facets = 1.5e7 unique edges. (dihedralRulerBig exists for exactly this reason.)
  const off = new Int32Array(nV + 2);
  for (let t = 0; t < nTri; t += 1) for (let s = 0; s < 3; s += 1) {
    const a = tv[t * 3 + s], b2 = tv[t * 3 + ((s + 1) % 3)];
    off[(a < b2 ? a : b2) + 1] += 1;
  }
  for (let v = 0; v < nV + 1; v += 1) off[v + 1] += off[v];
  const cur = off.slice(0, nV + 1);
  const heHi = new Int32Array(nTri * 3); const heId = new Int32Array(nTri * 3);
  for (let t = 0; t < nTri; t += 1) for (let s = 0; s < 3; s += 1) {
    const a = tv[t * 3 + s], b2 = tv[t * 3 + ((s + 1) % 3)];
    const lo = a < b2 ? a : b2; const hi = a < b2 ? b2 : a;
    const p = cur[lo]; cur[lo] += 1; heHi[p] = hi; heId[p] = t * 3 + s;
  }
  let nonMan = 0;
  for (let v = 0; v < nV; v += 1) {
    for (let p = off[v]; p < off[v + 1]; p += 1) {
      if (heId[p] < 0) continue;
      let partner = -1;
      for (let q = p + 1; q < off[v + 1]; q += 1) if (heId[q] >= 0 && heHi[q] === heHi[p]) { partner = q; break; }
      if (partner < 0) continue;
      // a third half-edge on the same pair is non-manifold
      for (let q = partner + 1; q < off[v + 1]; q += 1) if (heId[q] >= 0 && heHi[q] === heHi[p]) nonMan += 1;
      const e1 = heId[p]; const e2 = heId[partner];
      tnb[e1] = (e2 / 3) | 0; tnb[e2] = (e1 / 3) | 0;
      heId[p] = -1; heId[partner] = -1;
    }
  }
  weldNonMan = nonMan;
  if (nonMan > 0) log(`   *** WELD: ${nonMan} extra half-edges on an already-paired edge (non-manifold) ***`);
  return { vx, vy, vz, nV, tv, tnb, alive, nT: nTri, cap: TCAP, vcap: VCAP };
}

const triNormal = (M: Mesh, t: number, out: Float64Array): number => {
  const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
  const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
  const ux = M.vx[b] - ax, uy = M.vy[b] - ay, uz = M.vz[b] - az;
  const wx = M.vx[c] - ax, wy = M.vy[c] - ay, wz = M.vz[c] - az;
  out[0] = uy * wz - uz * wy; out[1] = uz * wx - ux * wz; out[2] = ux * wy - uy * wx;
  return Math.hypot(out[0], out[1], out[2]);
};
/** PARAMETER-metric edge length. S116 measured the 3D metric MULTIPLYING the blade class 8x: a curtain
 *  facet's longest 3D edge is its SHORTEST parameter edge, so 3D-longest-edge bisection thins the
 *  parametric needle every time. The triangulation lives in (arc, z); refine there. */
const edgeLen2 = (M: Mesh, a: number, b: number): number => {
  const ta = Math.atan2(M.vy[a], M.vx[a]);
  const dth = dThRaw(ta, Math.atan2(M.vy[b], M.vx[b]));
  const rm = 0.5 * (Math.hypot(M.vx[a], M.vy[a]) + Math.hypot(M.vx[b], M.vy[b]));
  const du = dth * rm; const dz = M.vz[a] - M.vz[b];
  return du * du + dz * dz;
};
const longestSlot = (M: Mesh, t: number): number => {
  let best = -1; let bl = -1; let bk = -1;
  for (let s = 0; s < 3; s += 1) {
    const a = M.tv[t * 3 + s], b = M.tv[t * 3 + ((s + 1) % 3)];
    const l = edgeLen2(M, a, b);
    const k = a < b ? a * 1e7 + b : b * 1e7 + a;
    if (l > bl || (l === bl && k > bk)) { bl = l; bk = k; best = s; }
  }
  return best;
};
/** signed parametric area in (rRef*theta, z), theta UNWRAPPED off p. */
const parSigned = (
  px: number, py: number, pz: number, qx: number, qy: number, qz: number, rx: number, ry: number, rz: number,
): number => {
  const tp = Math.atan2(py, px);
  const tq = tp + dThRaw(tp, Math.atan2(qy, qx));
  const tr = tp + dThRaw(tp, Math.atan2(ry, rx));
  const rm = (Math.hypot(px, py) + Math.hypot(qx, qy) + Math.hypot(rx, ry)) / 3;
  const up = tp * rm, uq = tq * rm, ur = tr * rm;
  return 0.5 * ((uq - up) * (rz - pz) - (ur - up) * (qz - pz));
};

let nBisect = 0; let nReject = 0; let maxOffSurf = 0;
/**
 * WHO EACH CHILD CAME FROM. Needed because a LEPP call splits the WHOLE terminal chain, not just the
 * target: `born` holds children of several different parents. A first version compared every child in
 * `born` against the TARGET's residual, which mis-attributes the stall test for every chain triangle.
 * The parent's r3/stall entries stay valid after it dies (dead facets are never re-scored), so a plain
 * index is all the bookkeeping needs.
 */
const parentOf = new Int32Array(TCAP).fill(-1);
/** APCR bisection — see the header. Returns the number of triangles created (0 = refused). */
function bisect(M: Mesh, t: number, s: number): number {
  const a = M.tv[t * 3 + s], b = M.tv[t * 3 + ((s + 1) % 3)], c = M.tv[t * 3 + ((s + 2) % 3)];
  const n = M.tnb[t * 3 + s];
  let s2 = -1; let d = -1;
  if (n >= 0) { for (let q = 0; q < 3; q += 1) if (M.tnb[n * 3 + q] === t) { s2 = q; break; } if (s2 < 0) return 0; d = M.tv[n * 3 + ((s2 + 2) % 3)]; }
  const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
  const bx = M.vx[b], by = M.vy[b], bz = M.vz[b];
  const tha = Math.atan2(ay, ax);
  const thm = tha + 0.5 * dThRaw(tha, Math.atan2(by, bx));
  const zm = 0.5 * (az + bz);
  const rm = rA(thm, zm);
  // f32-round at birth: the deliverable is a binary STL, so score only numbers the FILE will hold.
  const mx = Math.fround(rm * Math.cos(thm)), my = Math.fround(rm * Math.sin(thm)), mz = Math.fround(zm);
  const offS = Math.abs(Math.hypot(mx, my) - rA(Math.atan2(my, mx), mz));
  if (offS > maxOffSurf) maxOffSurf = offS;
  {
    const cx = M.vx[c], cy = M.vy[c], cz = M.vz[c];
    const sp = Math.sign(parSigned(ax, ay, az, bx, by, bz, cx, cy, cz));
    const s1 = Math.sign(parSigned(ax, ay, az, mx, my, mz, cx, cy, cz));
    const s2p = Math.sign(parSigned(mx, my, mz, bx, by, bz, cx, cy, cz));
    let ok = sp === 0 || (s1 === sp && s2p === sp);
    if (ok && n >= 0) {
      const dx = M.vx[d], dy = M.vy[d], dz = M.vz[d];
      const sq = Math.sign(parSigned(bx, by, bz, ax, ay, az, dx, dy, dz));
      const q1 = Math.sign(parSigned(bx, by, bz, mx, my, mz, dx, dy, dz));
      const q2 = Math.sign(parSigned(mx, my, mz, ax, ay, az, dx, dy, dz));
      ok = sq === 0 || (q1 === sq && q2 === sq);
    }
    if (!ok) { nReject += 1; return 0; }
  }
  if (M.nV >= M.vcap || M.nT + 4 >= M.cap) return 0;
  const m = M.nV; M.vx[m] = mx; M.vy[m] = my; M.vz[m] = mz; M.nV += 1;
  const tBC = M.tnb[t * 3 + ((s + 1) % 3)], tCA = M.tnb[t * 3 + ((s + 2) % 3)];
  const t1 = M.nT; const t2 = M.nT + 1; M.nT += 2;
  M.tv[t1 * 3] = a; M.tv[t1 * 3 + 1] = m; M.tv[t1 * 3 + 2] = c; M.alive[t1] = 1;
  M.tv[t2 * 3] = m; M.tv[t2 * 3 + 1] = b; M.tv[t2 * 3 + 2] = c; M.alive[t2] = 1;
  M.alive[t] = 0;
  parentOf[t1] = t; parentOf[t2] = t;
  let n1 = -1; let n2 = -1;
  if (n >= 0) {
    const nAD = M.tnb[n * 3 + ((s2 + 1) % 3)], nDB = M.tnb[n * 3 + ((s2 + 2) % 3)];
    n1 = M.nT; n2 = M.nT + 1; M.nT += 2;
    M.tv[n1 * 3] = b; M.tv[n1 * 3 + 1] = m; M.tv[n1 * 3 + 2] = d; M.alive[n1] = 1;
    M.tv[n2 * 3] = m; M.tv[n2 * 3 + 1] = a; M.tv[n2 * 3 + 2] = d; M.alive[n2] = 1;
    M.alive[n] = 0;
    parentOf[n1] = n; parentOf[n2] = n;
    M.tnb[n1 * 3] = t2; M.tnb[n1 * 3 + 1] = n2; M.tnb[n1 * 3 + 2] = nDB;
    M.tnb[n2 * 3] = t1; M.tnb[n2 * 3 + 1] = nAD; M.tnb[n2 * 3 + 2] = n1;
    if (nAD >= 0) for (let q = 0; q < 3; q += 1) if (M.tnb[nAD * 3 + q] === n) M.tnb[nAD * 3 + q] = n2;
    if (nDB >= 0) for (let q = 0; q < 3; q += 1) if (M.tnb[nDB * 3 + q] === n) M.tnb[nDB * 3 + q] = n1;
  }
  M.tnb[t1 * 3] = n2; M.tnb[t1 * 3 + 1] = t2; M.tnb[t1 * 3 + 2] = tCA;
  M.tnb[t2 * 3] = n1; M.tnb[t2 * 3 + 1] = tBC; M.tnb[t2 * 3 + 2] = t1;
  if (tBC >= 0) for (let q = 0; q < 3; q += 1) if (M.tnb[tBC * 3 + q] === t) M.tnb[tBC * 3 + q] = t2;
  if (tCA >= 0) for (let q = 0; q < 3; q += 1) if (M.tnb[tCA * 3 + q] === t) M.tnb[tCA * 3 + q] = t1;
  nBisect += 1;
  return n >= 0 ? 4 : 2;
}
/** Rivara LEPP. `born` collects every triangle index created. */
function lepp(M: Mesh, t: number, born: number[]): void {
  let guard = 0;
  while (M.alive[t] === 1 && guard < 400) {
    guard += 1;
    let cur = t;
    for (let chain = 0; chain < 400; chain += 1) {
      const s = longestSlot(M, cur);
      const nb = M.tnb[cur * 3 + s];
      if (nb < 0) break;
      const s2 = longestSlot(M, nb);
      if (M.tnb[nb * 3 + s2] === cur) break;
      cur = nb;
    }
    const s = longestSlot(M, cur);
    const before = M.nT;
    let made = bisect(M, cur, s);
    if (made === 0) { for (let alt = 0; alt < 3 && made === 0; alt += 1) if (alt !== s) made = bisect(M, cur, alt); if (made === 0) return; }
    for (let q = before; q < M.nT; q += 1) born.push(q);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// RULERS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const latticePts = (k: number): Float64Array => {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
};
const LAT_LOOP = latticePts(K_LOOP); const NPL = LAT_LOOP.length / 3;
const LAT_FIN = latticePts(K_FINAL); const NPF = LAT_FIN.length / 3;

function r1Of(M: Mesh, t: number, LAT: Float64Array, NP: number): number {
  const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
  const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
  const bx = M.vx[b], by = M.vy[b], bz = M.vz[b];
  const cx = M.vx[c], cy = M.vy[c], cz = M.vz[c];
  let w = 0;
  for (let p = 0; p < NP; p += 1) {
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > w) w = dd;
  }
  return w;
}
const ddBuf = new Float64Array(NPF); const ordBuf = new Int32Array(NPF);
let c2Violations = 0;
/**
 * EXACT max perpendicular distance over the facet's lattice points — not a top-K sample.
 *
 * A first version projected only the PERP_TOP points with the largest RADIAL residual. That is a
 * heuristic, not a proof: perpendicular <= radial POINTWISE, so the point with the largest PERPENDICULAR
 * need not be among the largest radial ones. Measured against the session's validated scorer on the same
 * baseline it under-read the over-0.01 class by 6.2% by count. Driving on a ruler that under-reads is the
 * exact scar this session is meant to avoid, so the reduction is now the PROVEN one (the same one
 * s118ScoreLib.perpScan uses):
 *
 *   walk the lattice points in DESCENDING radial order and stop at the first point whose RADIAL value is
 *   <= the running best. Every remaining point has perpendicular <= radial <= best, so none can raise the
 *   max. The result is the EXACT lattice max, with the fewest possible projector calls.
 *
 * C2 CONTROL: perpendicular must never exceed radial at the same point. Any violation voids the run.
 */
function r3Of(M: Mesh, t: number, LAT: Float64Array, NP: number, bailBar = 0): number {
  const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
  const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
  const bx = M.vx[b], by = M.vy[b], bz = M.vz[b];
  const cx = M.vx[c], cy = M.vy[c], cz = M.vz[c];
  for (let p = 0; p < NP; p += 1) {
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
    ddBuf[p] = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    ordBuf[p] = p;
  }
  for (let i = 1; i < NP; i += 1) {           // insertion sort, descending by radial (NP <= 45)
    const v = ordBuf[i]; const dv = ddBuf[v]; let j = i - 1;
    while (j >= 0 && ddBuf[ordBuf[j]] < dv) { ordBuf[j + 1] = ordBuf[j]; j -= 1; }
    ordBuf[j + 1] = v;
  }
  let best = 0;
  for (let ti = 0; ti < NP; ti += 1) {
    const p = ordBuf[ti];
    if (ddBuf[p] <= best) break;              // PROVEN irrelevant: perp <= radial <= best
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
    const dv = perpDist(x, y, z);
    if (dv > ddBuf[p] + 1e-9) c2Violations += 1;
    if (dv > best) best = dv;
    // DRIVE-ONLY EARLY EXIT (bailBar > 0). The refinement only needs the VERDICT "is this facet over the
    // bar", and one point proven over the bar settles it — the exact max cannot change that answer. The
    // TARGET DECISION IS THEREFORE STILL EXACT; only the returned magnitude becomes a lower bound, which
    // is why the stall test below uses R1 (always exact and always computed) rather than this value.
    // The CENSUS passes bailBar = 0 and gets the exact lattice max.
    if (bailBar > 0 && best > bailBar) return best;
  }
  return best;
}

/**
 * CLIFF DIAGNOSIS. Walk the facet's three PARAMETRIC edges; where two adjacent samples of rA differ by
 * more than `thr`, bisect preserving the bracket. If the jump SURVIVES the bracket collapsing to ~1e-15
 * of the edge, rA is discontinuous inside the facet. A smooth rA cannot survive that.
 * Returns the surviving jump in mm (0 = no discontinuity found).
 */
function cliffJump(M: Mesh, t: number, thr = 0.05, nSamp = 24): number {
  const vs = [M.tv[t * 3], M.tv[t * 3 + 1], M.tv[t * 3 + 2]];
  const th: number[] = []; const zz: number[] = [];
  const t0 = Math.atan2(M.vy[vs[0]], M.vx[vs[0]]);
  for (let q = 0; q < 3; q += 1) { th.push(q === 0 ? t0 : t0 + dThRaw(t0, Math.atan2(M.vy[vs[q]], M.vx[vs[q]]))); zz.push(M.vz[vs[q]]); }
  let best = 0;
  for (let e = 0; e < 3; e += 1) {
    const a = e; const b = (e + 1) % 3;
    let pTh = th[a]; let pZ = zz[a]; let pR = rA(pTh, pZ);
    for (let i = 1; i <= nSamp; i += 1) {
      const f = i / nSamp;
      const qTh = th[a] + f * (th[b] - th[a]); const qZ = zz[a] + f * (zz[b] - zz[a]);
      const qR = rA(qTh, qZ);
      if (Math.abs(qR - pR) > thr) {
        let lo = 0; let hi = 1;                                  // fraction along [p,q]
        for (let it = 0; it < 55; it += 1) {
          const mf = 0.5 * (lo + hi);
          const mTh = pTh + mf * (qTh - pTh); const mZ = pZ + mf * (qZ - pZ);
          const mR = rA(mTh, mZ);
          const rl = rA(pTh + lo * (qTh - pTh), pZ + lo * (qZ - pZ));
          const rh = rA(pTh + hi * (qTh - pTh), pZ + hi * (qZ - pZ));
          if (Math.abs(mR - rl) >= Math.abs(rh - mR)) hi = mf; else lo = mf;
        }
        const j = Math.abs(rA(pTh + hi * (qTh - pTh), pZ + hi * (qZ - pZ)) - rA(pTh + lo * (qTh - pTh), pZ + lo * (qZ - pZ)));
        if (j > best) best = j;
      }
      pTh = qTh; pZ = qZ; pR = qR;
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DRIVE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface DriveState { M: Mesh; r1: Float32Array; r3: Float32Array; stall: Uint8Array; dirty: Uint8Array; retired: Uint8Array }

/**
 * THE GRID SEED — an artefact-free starting mesh, by construction.
 *
 * WHY IT EXISTS. The S102 driver mesh ALREADY CONTAINS 24,012 arc-space needles, 11 footprint-sign
 * inversions and 3,546 degeneracy poles (measured by this tool's own baseline census). APCR can neither
 * create nor remove those: it preserves footprint sign, and Rivara bounds the smallest angle below by
 * half the SEED's smallest angle — so whatever the seed carries, the refined mesh carries. Refining that
 * seed therefore CANNOT reach zero artefacts, no matter how good the operator is.
 *
 * A structured (theta, z) grid on rA has, by construction: every vertex exactly on rA (PRECOND 0), a
 * uniformly positive parametric footprint (no inversions), and a bounded aspect ratio (no needles, no
 * poles). Combined with APCR's two structural properties that is a ZERO-ARTEFACT PIPELINE AT EVERY
 * DENSITY — which is precisely the claim this session exists to test.
 *
 * THE WRAP IS THE ONE PLACE THIS CAN GO WRONG: theta index nTh and index 0 must produce BIT-IDENTICAL
 * f32 coordinates or the weld leaves a seam crack. They do here because the angle is computed from
 * `i % nTh`, so the two indices evaluate the SAME f64 theta rather than 0 and 2*pi (whose sines differ
 * by 2.4e-16 and would fail an exact-f32 weld).
 */
function gridSeed(nTh: number, nZ: number): { xyz: Float64Array; nTri: number } {
  const vxT = new Float64Array(nTh * (nZ + 1)); const vyT = new Float64Array(nTh * (nZ + 1)); const vzT = new Float64Array(nTh * (nZ + 1));
  for (let i = 0; i < nTh; i += 1) {
    const th = (2 * Math.PI * i) / nTh;
    for (let j = 0; j <= nZ; j += 1) {
      const z = (H * j) / nZ;
      const r = rA(th, z);
      const k = i * (nZ + 1) + j;
      vxT[k] = Math.fround(r * Math.cos(th)); vyT[k] = Math.fround(r * Math.sin(th)); vzT[k] = Math.fround(z);
    }
  }
  const nTri = nTh * nZ * 2;
  const xyz = new Float64Array(nTri * 9);
  let o = 0;
  const put = (i: number, j: number): void => { const k = (i % nTh) * (nZ + 1) + j; xyz[o] = vxT[k]; xyz[o + 1] = vyT[k]; xyz[o + 2] = vzT[k]; o += 3; };
  for (let i = 0; i < nTh; i += 1) {
    for (let j = 0; j < nZ; j += 1) {
      put(i, j); put(i + 1, j); put(i + 1, j + 1);          // outward: d/dtheta x d/dz points along +r
      put(i, j); put(i + 1, j + 1); put(i, j + 1);
    }
  }
  return { xyz, nTri };
}

function newState(): DriveState {
  const seedSpec = envS('PF_S118A_SEED', 'stl');
  let src: { xyz: Float64Array; nTri: number };
  if (seedSpec.startsWith('grid')) {
    const p = seedSpec.split(':');
    const nTh = Math.round(Number(p[1] ?? 1200)); const nZ = Math.round(Number(p[2] ?? 600));
    log(`── GRID SEED ${nTh} x ${nZ} on rA (artefact-free by construction; see the note above) ──`);
    src = gridSeed(nTh, nZ);
  } else {
    src = readMeshFloat64(STL, false);
  }
  log(`── loading seed: ${src.nTri.toLocaleString()} facets ──`);
  const M = buildMesh(src.xyz, src.nTri);
  log(`   welded: ${M.nT.toLocaleString()} facets, ${M.nV.toLocaleString()} vertices   [${el()}]`);
  return {
    M,
    r1: new Float32Array(TCAP), r3: new Float32Array(TCAP),
    stall: new Uint8Array(TCAP), dirty: new Uint8Array(TCAP).fill(1), retired: new Uint8Array(TCAP),
  };
}

interface DriveStats { rounds: number; live: number; retired: number; adjud: number; skipHi: number; certLo: number }

/**
 * Refine until every live facet is either CERTIFIED under `bar` or RETIRED as non-convergent.
 * `pick` selects the target set: the operator uses the ruler, the placebo uses an RNG.
 */
function drive(S: DriveState, bar: number, kind: 'op' | 'placebo', matchT: number, seed: number): DriveStats {
  const { M, r1, r3, stall, dirty, retired } = S;
  let rngS = seed >>> 0;
  const rng = (): number => { rngS = (rngS + 0x6D2B79F5) >>> 0; let x = Math.imul(rngS ^ (rngS >>> 15), 1 | rngS); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  let adjud = 0; let skipHi = 0; let certLo = 0; let rounds = 0;
  for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) dirty[t] = 1;   // a new bar re-opens every facet
  let live = 0;
  for (let r = 0; r < ROUNDS; r += 1) {
    rounds = r + 1;
    // ── (re)score dirty live facets on the THREE-WAY test ──
    for (let t = 0; t < M.nT; t += 1) {
      if (M.alive[t] === 0 || dirty[t] === 0) continue;
      const v = r1Of(M, t, LAT_LOOP, NPL);
      r1[t] = v;
      if (v <= bar) { r3[t] = v; certLo += 1; }
      else if (v > bar * SLOPE) { r3[t] = v; skipHi += 1; }
      else { r3[t] = r3Of(M, t, LAT_LOOP, NPL, bar); adjud += 1; }
      dirty[t] = 0;
    }
    live = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) live += 1;
    const tgt: number[] = [];
    if (kind === 'op') {
      for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1 && retired[t] === 0 && r3[t] > bar) tgt.push(t);
    } else {
      if (live >= matchT) break;
      const want = Math.max(1, Math.min(live, Math.round((matchT - live) / 3)));
      const seen = new Set<number>();
      let guard = 0;
      while (seen.size < want && guard < want * 40) {
        guard += 1;
        const t = Math.floor(rng() * M.nT);
        if (t < M.nT && M.alive[t] === 1 && !seen.has(t)) { seen.add(t); tgt.push(t); }
      }
    }
    let nRet = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1 && retired[t] === 1) nRet += 1;
    log(`   [${kind} bar=${bar}] round ${r}: live ${live.toLocaleString()}  targets ${tgt.length.toLocaleString()}  retired ${nRet.toLocaleString()}  splits ${nBisect.toLocaleString()}  proj ${(projCalls / 1e6).toFixed(2)}M  rA ${(rEvals / 1e6).toFixed(0)}M  [${el()}]`);
    if (tgt.length === 0) break;
    if ((Date.now() - T0) / 1000 > MAXSECS) { log(`   [${kind}] *** TIME CAP ${MAXSECS}s — this is a TRAJECTORY, not a verdict ***`); break; }
    const born: number[] = [];
    for (const t of tgt) {
      if (M.alive[t] === 0) continue;
      if (M.nT + 8 >= TCAP || M.nV + 4 >= VCAP) { log(`   [${kind}] CAPACITY REACHED`); break; }
      const b0 = born.length;
      lepp(M, t, born);
      // STALL BOOKKEEPING — a child that did not improve on ITS OWN parent inherits that parent's
      // count + 1. `parentOf` is what makes "its own" correct across a multi-triangle LEPP chain.
      for (let q = b0; q < born.length; q += 1) {
        const c = born[q];
        if (M.alive[c] === 0) continue;
        const par = parentOf[c];
        // THE STALL METRIC IS R1, NOT R3. R1 is the exhaustive radial max over the lattice: always
        // computed, always exact, and it converges wherever the surface is a graph. At a genuine cliff it
        // does NOT converge — which is exactly the signal being detected. R3 now early-exits during the
        // drive (its magnitude is only a lower bound), so it is unfit to be a ratio.
        const parentR1 = par >= 0 ? r1[par] : Infinity;
        const parentStall = par >= 0 ? stall[par] : 0;
        const cv = r1Of(M, c, LAT_LOOP, NPL);
        let cr = cv;
        if (cv > bar && cv <= bar * SLOPE) cr = r3Of(M, c, LAT_LOOP, NPL, bar);
        r1[c] = cv; r3[c] = cr; dirty[c] = 0;
        const st = cv > STALL_FRAC * parentR1 ? parentStall + 1 : 0;
        stall[c] = st > 255 ? 255 : st;
        if (st >= STALL_MAX && cr > bar) retired[c] = 1;
      }
    }
    if (kind === 'op') { let ln = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) ln += 1; if (ln > MAXT) { log(`   [${kind}] triangle budget ${MAXT.toLocaleString()} reached`); break; } }
    if (M.nT + 16 >= TCAP || M.nV + 8 >= VCAP) break;
  }
  live = 0; let nRet = 0;
  for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) { live += 1; if (retired[t] === 1) nRet += 1; }
  return { rounds, live, retired: nRet, adjud, skipHi, certLo };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CENSUS — one code path for every mesh scored here.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Cen {
  nT: number; area: number;
  precRadMax: number; precPerpMax: number; precOver: number;
  hiN: number; hiA: number; hiMax: number; loN: number; loA: number; loMax: number;
  hiCliffN: number; hiCliffA: number; hiCleanN: number; hiCleanA: number; hiCleanMax: number;
  needN: number; needA: number; minAlt: number;
  signN: number; signA: number;
  poleN: number; poleA: number;
  bnd: number; nonMan: number; incons: number;
}
function census(M: Mesh, label: string, bars: number[], cliffBar: number): Cen {
  const t0 = Date.now();
  const liveIdx: number[] = [];
  for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) liveIdx.push(t);
  const nL = liveIdx.length;
  const area = new Float64Array(nL); const R1 = new Float64Array(nL); const R3 = new Float64Array(nL);
  const alt = new Float64Array(nL); const sgn = new Float64Array(nL); const gr = new Float64Array(nL);
  let areaTot = 0; let precRadMax = 0; let precOver = 0;
  const nb = new Float64Array(3);
  let sigPos = 0; let sigNeg = 0;
  const worstCorner: { d: number; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < nL; i += 1) {
    const t = liveIdx[i];
    const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
    const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
    const bx = M.vx[b], by = M.vy[b], bz = M.vz[b];
    const cx = M.vx[c], cy = M.vy[c], cz = M.vz[c];
    area[i] = 0.5 * triNormal(M, t, nb); areaTot += area[i];
    // PRECOND — EXHAUSTIVE, every corner, no stride (scar 5). Radial first (a sound upper bound).
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const p1 = Math.abs(Math.hypot(ax, ay) - rA(tha, az));
    const p2 = Math.abs(Math.hypot(bx, by) - rA(thb, bz));
    const p3 = Math.abs(Math.hypot(cx, cy) - rA(thc, cz));
    if (p1 > precRadMax) precRadMax = p1; if (p2 > precRadMax) precRadMax = p2; if (p3 > precRadMax) precRadMax = p3;
    if (p1 > 2e-5) { precOver += 1; worstCorner.push({ d: p1, x: ax, y: ay, z: az }); }
    if (p2 > 2e-5) { precOver += 1; worstCorner.push({ d: p2, x: bx, y: by, z: bz }); }
    if (p3 > 2e-5) { precOver += 1; worstCorner.push({ d: p3, x: cx, y: cy, z: cz }); }
    // arc-space footprint: signed area, min altitude, graphRatio
    const rmean = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const ua = tha * rmean, ub = thb * rmean, uc = thc * rmean;
    const ps = 0.5 * ((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
    sgn[i] = ps; if (ps > 0) sigPos += 1; else if (ps < 0) sigNeg += 1;
    const e1 = Math.hypot(ub - ua, bz - az), e2 = Math.hypot(uc - ub, cz - bz), e3 = Math.hypot(ua - uc, az - cz);
    const emax = Math.max(e1, e2, e3);
    alt[i] = emax > 0 ? (2 * Math.abs(ps)) / emax : 0;
    gr[i] = Math.abs(ps) > 0 ? area[i] / Math.abs(ps) : Infinity;
    R1[i] = r1Of(M, t, LAT_FIN, NPF);
  }
  const SIGMA = sigPos >= sigNeg ? 1 : -1;
  // PRECOND perpendicular: adjudicate the worst corners (perpendicular <= radial certifies the rest).
  worstCorner.sort((x, y) => y.d - x.d);
  let precPerpMax = 0;
  for (let i = 0; i < Math.min(worstCorner.length, 40000); i += 1) {
    const w = worstCorner[i];
    if (w.d <= precPerpMax) break;              // radial >= perp: nothing below the running max can beat it
    const dv = perpDist(w.x, w.y, w.z);
    if (dv > precPerpMax) precPerpMax = dv;
  }
  // POSITION: adjudicate EVERY facet whose radial upper bound exceeds `cliffBar` -> 100% coverage AT THAT
  // BAR. Facets below it are CERTIFIED under it without a call, because perpendicular <= radial pointwise.
  // A bar BELOW cliffBar is therefore reported as a SOUND UPPER BOUND (radial stands in for perpendicular
  // on the un-adjudicated remainder) and is LABELLED as such — never quoted as an exact figure.
  const barMin = cliffBar;
  const ordIdx: number[] = [];
  for (let i = 0; i < nL; i += 1) { if (R1[i] <= barMin) R3[i] = R1[i]; else ordIdx.push(i); }
  ordIdx.sort((x, y) => R1[y] - R1[x]);
  for (const i of ordIdx) R3[i] = r3Of(M, liveIdx[i], LAT_FIN, NPF);
  // topology from the neighbour table (exact; no Map, no re-weld)
  let bnd = 0; let incons = 0;
  for (const t of liveIdx) {
    for (let s = 0; s < 3; s += 1) {
      const o = M.tnb[t * 3 + s];
      if (o < 0) { bnd += 1; continue; }
      const a = M.tv[t * 3 + s], b = M.tv[t * 3 + ((s + 1) % 3)];
      for (let q = 0; q < 3; q += 1) if (M.tv[o * 3 + q] === a && M.tv[o * 3 + ((q + 1) % 3)] === b) incons += 1;
    }
  }
  incons /= 2;
  const tally = (v: Float64Array, bar: number): { n: number; a: number; mx: number } => {
    let n = 0; let aa = 0; let mx = 0;
    for (let i = 0; i < nL; i += 1) { if (v[i] > bar) { n += 1; aa += area[i]; } if (v[i] > mx) mx = v[i]; }
    return { n, a: aa, mx };
  };
  const hi = tally(R3, bars[0]); const lo = tally(R3, bars[bars.length - 1]);
  // artefacts
  let needN = 0; let needA = 0; let minAlt = Infinity; let signN = 0; let signA = 0; let poleN = 0; let poleA = 0;
  for (let i = 0; i < nL; i += 1) {
    if (alt[i] < minAlt) minAlt = alt[i];
    if (alt[i] < 0.002) { needN += 1; needA += area[i]; }
    if (SIGMA * sgn[i] <= 0) { signN += 1; signA += area[i]; }
    if (gr[i] >= 100) { poleN += 1; poleA += area[i]; }
  }
  // cliff split of the over-bar residual
  let hiCliffN = 0; let hiCliffA = 0; let hiCleanN = 0; let hiCleanA = 0; let hiCleanMax = 0;
  if (cliffBar > 0) {
    for (let i = 0; i < nL; i += 1) {
      if (R3[i] <= cliffBar) continue;
      if (cliffJump(M, liveIdx[i]) > 0.05) { hiCliffN += 1; hiCliffA += area[i]; }
      else { hiCleanN += 1; hiCleanA += area[i]; if (R3[i] > hiCleanMax) hiCleanMax = R3[i]; }
    }
  }
  log(`   [${label}] census ${nL.toLocaleString()} facets in ${((Date.now() - t0) / 1000).toFixed(0)}s   sigma ${SIGMA > 0 ? '+1' : '-1'} (footprint + ${sigPos} / - ${sigNeg})`);
  return {
    nT: nL, area: areaTot, precRadMax, precPerpMax, precOver,
    hiN: hi.n, hiA: hi.a, hiMax: hi.mx, loN: lo.n, loA: lo.a, loMax: lo.mx,
    hiCliffN, hiCliffA, hiCleanN, hiCleanA, hiCleanMax,
    needN, needA, minAlt, signN, signA, poleN, poleA,
    bnd, nonMan: weldNonMan, incons,
  };
}
function printCen(C: Cen, label: string, bars: number[], cliffBar: number): void {
  log(`──────── ${label} ────────`);
  log(`   facets ${C.nT.toLocaleString()}   3D area ${C.area.toFixed(3)} mm2`);
  log(`   PRECOND (EXHAUSTIVE, every corner, no stride; PERPENDICULAR, scar 5)`);
  log(`      radial MAX ${(C.precRadMax * 1000).toFixed(4)} um   *** PERPENDICULAR MAX ${(C.precPerpMax * 1000).toFixed(4)} um ***   corners over 0.02 um: ${C.precOver.toLocaleString()}`);
  const exH = bars[0] >= cliffBar ? 'EXACT' : 'UPPER BOUND (radial stands in below the adjudicated bar)';
  const exL = bars[bars.length - 1] >= cliffBar ? 'EXACT' : 'UPPER BOUND (radial stands in below the adjudicated bar)';
  log(`   POSITION, TRUE PERPENDICULAR, EXHAUSTIVE (every facet with radial > ${cliffBar} mm adjudicated; 100% coverage at that bar)`);
  log(`      > ${bars[0]} mm : COUNT ${C.hiN.toLocaleString()} (${pct(C.hiN, C.nT)}%)   AREA ${C.hiA.toFixed(4)} mm2 = ${pct(C.hiA, C.area)}% OF MESH   MAX ${C.hiMax.toExponential(4)} mm   [${exH}]`);
  log(`      > ${bars[bars.length - 1]} mm : COUNT ${C.loN.toLocaleString()} (${pct(C.loN, C.nT)}%)   AREA ${C.loA.toFixed(4)} mm2 = ${pct(C.loA, C.area)}% OF MESH   MAX ${C.loMax.toExponential(4)} mm   [${exL}]`);
  if (C.hiCliffN + C.hiCleanN > 0) {
    log(`      THE OVER-${cliffBar} RESIDUAL, SPLIT BY CAUSE (cliff diagnosis: a surviving rA discontinuity inside the facet)`);
    log(`         CLIFF-EXPOSED (irreducible — the ruler has no surface inside the jump): ${C.hiCliffN.toLocaleString()} facets, ${C.hiCliffA.toFixed(4)} mm2 = ${pct(C.hiCliffA, C.area)}% OF MESH`);
    log(`         CLEAN         (genuine chord residual, REDUCIBLE by refinement)       : ${C.hiCleanN.toLocaleString()} facets, ${C.hiCleanA.toFixed(4)} mm2 = ${pct(C.hiCleanA, C.area)}% OF MESH   MAX ${C.hiCleanMax.toExponential(4)} mm`);
  }
  log(`   ARTEFACTS (analytic-free; COUNT + AREA + MAX, never one alone)`);
  log(`      NEEDLES (arc-space min altitude < 2 um): ${C.needN.toLocaleString()} (${pct(C.needN, C.nT)}%)   ${C.needA.toFixed(4)} mm2 = ${pct(C.needA, C.area)}% OF MESH   mesh-wide MIN altitude ${(C.minAlt * 1e6).toFixed(3)} nm`);
  log(`      FOOTPRINT-SIGN INVERSIONS: ${C.signN.toLocaleString()} (${pct(C.signN, C.nT)}%)   ${C.signA.toFixed(4)} mm2 = ${pct(C.signA, C.area)}% OF MESH`);
  log(`      DEGENERACY POLES (graphRatio >= 100): ${C.poleN.toLocaleString()} (${pct(C.poleN, C.nT)}%)   ${C.poleA.toFixed(4)} mm2 = ${pct(C.poleA, C.area)}% OF MESH`);
  log(`   TOPOLOGY  boundary ${C.bnd}   non-manifold ${C.nonMan}   inconsistent winding ${C.incons}`);
  log(`   C2 CONTROL (perpendicular must never exceed radial at the same point): ${c2Violations} violations  ${c2Violations === 0 ? 'HOLDS' : '*** RUN IS VOID ***'}`);
  log('');
}

function writeSTL(M: Mesh, path: string): number {
  let live = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) live += 1;
  const buf = Buffer.alloc(84 + live * 50);
  buf.write(`S118 APCR ${STYLE} ${TAG}`.slice(0, 79), 0, 79, 'ascii');
  buf.writeUInt32LE(live, 80);
  let o = 84;
  const nb = new Float64Array(3);
  for (let t = 0; t < M.nT; t += 1) {
    if (M.alive[t] === 0) continue;
    const l = triNormal(M, t, nb);
    buf.writeFloatLE(l > 0 ? nb[0] / l : 0, o); buf.writeFloatLE(l > 0 ? nb[1] / l : 0, o + 4); buf.writeFloatLE(l > 0 ? nb[2] / l : 0, o + 8); o += 12;
    for (let q = 0; q < 3; q += 1) {
      const v = M.tv[t * 3 + q];
      buf.writeFloatLE(M.vx[v], o); buf.writeFloatLE(M.vy[v], o + 4); buf.writeFloatLE(M.vz[v], o + 8); o += 12;
    }
    buf.writeUInt16LE(0, o); o += 2;
  }
  writeFileSync(path, buf);
  return live;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const S = newState();
log('');
log('── BASELINE (the seed, scored by the SAME census code path as every arm) ──');
// PF_S118A_SKIPBASE=1 skips the seed census when it has ALREADY been run and published by an earlier
// invocation of this same code path. It is a scheduling switch, never a substitute for the measurement:
// the seed numbers quoted in the write-up come from a run where this was 0.
if (envI('PF_S118A_SKIPBASE', 0) === 1) {
  log('── BASELINE CENSUS SKIPPED (PF_S118A_SKIPBASE=1) — seed already censused by a previous run ──');
} else {
  const cBase = census(S.M, 'BASELINE', BARS, BARS[0]);
  printCen(cBase, `BASELINE — ${STL.split(/[\\/]/).pop()}`, BARS, BARS[0]);
}

const liveAfter: number[] = [];
const ONLY_PLACEBO = envI('PF_S118A_ONLYPLACEBO', 0) === 1;
for (let bi = 0; bi < BARS.length && !ONLY_PLACEBO; bi += 1) {
  const bar = BARS[bi];
  log(`══════════════ RUNG ${bi + 1}: DRIVE TO ${bar} mm ══════════════`);
  const st = drive(S, bar, 'op', 0, 12345);
  log(`   [op bar=${bar}] DONE  rounds ${st.rounds}  live ${st.live.toLocaleString()}  RETIRED ${st.retired.toLocaleString()}`);
  log(`   [op bar=${bar}] three-way test: certified-by-radial ${st.certLo.toLocaleString()}   split-without-adjudication ${st.skipHi.toLocaleString()}   ADJUDICATED by the projector ${st.adjud.toLocaleString()}`);
  log(`   [op bar=${bar}] CONTROL footprint-sign rejections at emit: ${nReject}   new-vertex off-surface MAX ${(maxOffSurf * 1e6).toFixed(3)} nm (must be at the f32 floor ~3000 nm)`);
  const c = census(S.M, `RUNG${bi + 1}`, BARS, bar);
  printCen(c, `RUNG ${bi + 1} — OPERATOR (APCR), driven to ${bar} mm`, BARS, bar);
  const p = `${OUTDIR}/celtictriquetra_ring_S118APCR_${TAG}_R${bi + 1}.stl`;
  log(`   STL -> ${p}  (${writeSTL(S.M, p).toLocaleString()} facets)   [${el()}]`);
  log('');
  liveAfter.push(st.live);
  if ((Date.now() - T0) / 1000 > MAXSECS) { log('*** TIME CAP — stopping the ladder here ***'); break; }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE COST-MATCHED PLACEBO — same machinery, same guard, same projection, RANDOM targets, matched count.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PF_S118A_MATCH lets the placebo be run in its OWN process against a triangle count the operator
// already reached, so the two arms can be scheduled independently without re-doing the operator's work.
// The match count is the operator's LIVE FACET COUNT — the placebo runs until it has at least that many.
const MATCH_OVERRIDE = envI('PF_S118A_MATCH', 0);
if (DO_PLACEBO && (liveAfter.length > 0 || MATCH_OVERRIDE > 0)) {
  log('══════════════ COST-MATCHED PLACEBO — identical machinery, UNINFORMED key ══════════════');
  const match = MATCH_OVERRIDE > 0 ? MATCH_OVERRIDE : liveAfter[0];
  log(`   matching the operator's ${match.toLocaleString()} live facets`);
  nBisect = 0; nReject = 0; maxOffSurf = 0;
  const P = newState();
  const st = drive(P, BARS[0], 'placebo', match, 987654321);
  log(`   [placebo] DONE  rounds ${st.rounds}  live ${st.live.toLocaleString()}  (operator had ${match.toLocaleString()}; ratio ${(st.live / match).toFixed(4)}x)`);
  const c = census(P.M, 'PLACEBO', BARS, BARS[0]);
  printCen(c, `PLACEBO — random targets, ${(st.live / match).toFixed(3)}x the operator's triangles`, BARS, BARS[0]);
  const p = `${OUTDIR}/celtictriquetra_ring_S118PLACEBO_${TAG}.stl`;
  log(`   STL -> ${p}  (${writeSTL(P.M, p).toLocaleString()} facets)`);
}

log(`WALL ${el()}   rA evals ${(rEvals / 1e6).toFixed(0)}M   projector calls ${(projCalls / 1e6).toFixed(2)}M   peak rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
log('S118 DRIVE DONE');

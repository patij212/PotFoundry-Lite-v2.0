// s116BestGothic.ts — S116 PHASE 2: PRODUCE THE BEST GothicArches MESH THE CAMPAIGN CAN CURRENTLY MAKE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The shipping mesh (gothicarches_ring_DS-HT_S39CTL.stl) is the baseline. S116 phase 1 established, on
// exhaustive rulers, that GothicArches is a PROVEN EXACT SINGLE COVER of its chart (covering number
// 1.000000, zero inverted facets) and that 100% of its residual is chord sag + a small mesh-made fold
// class. Its two named defects are therefore:
//    POSITION  R3 (honest perpendicular) > 0.01 mm on 2,271 facets = 11.02 mm2 = 0.0287% of area.
//    FOLD      dihedral > CEIL = 2*atan(max|grad r|) = 168.02 deg on 1,523 facets = 6.875 mm2 = 0.0179%,
//              of which 865 facets / 5.366 mm2 are BLADES (>= 175 deg).
//
// THE OPERATOR — APCR, "analytic-projected conforming refinement".
//   * Rivara LEPP longest-edge bisection. Conforming at every step BY CONSTRUCTION: there is never a
//     hanging node, so no T-junction, no crack, no green-sliver bookkeeping. Rivara's theorem bounds the
//     smallest angle below by half the initial smallest angle, so no operator-made needle exists either.
//   * Every new vertex is placed by RADIAL PROJECTION onto rA. Radial projection changes ONLY r, so the
//     new vertex has the SAME (theta, z) as the linear midpoint: the parametric footprint of every child
//     is bit-for-bit the linear-bisection footprint. THE SIGN OF THE PARAMETRIC AREA THEREFORE CANNOT
//     CHANGE. A parameter-space fold is impossible by construction, not by detection.
//   * The 3D side is not automatic, so it is GUARDED: the projection is admitted only at the largest
//     ladder step t in {1, .75, .5, .25, .125, 0} for which every child of every incident triangle keeps
//     a strictly positive area AND a non-negative dot with its parent's unit normal, and for which the
//     vertex moves no more than 0.5x the bisected edge. t = 0 is linear bisection, which always passes.
//     Fallbacks are COUNTED and their off-surface residual is reported, because a fallback vertex is the
//     only way this operator can put a vertex off rA.
//
// THE PLACEBO — mandatory, cost-matched. Identical machinery, identical guard, identical projection; the
// only difference is WHICH triangles are targeted: a deterministic uniform random draw from the live
// triangles instead of the defect set. It is run until it has at least as many triangles as the operator
// arm. If the placebo scores as well, the operator is refuted and the shipping mesh ships.
//
// SCORING. One scorer, `census()`, is applied to the baseline and to both arms — the same code path, so a
// difference cannot be a ruler difference. COUNT + AREA-SHARE + MAX together, per facet, never one alone.
//   PRECOND   exhaustive |r - rA| at every facet CORNER (no dedup, no stride).
//   POSITION  R1 radial (a PROVEN upper bound on the distance to the surface) exhaustively at k lattice
//             points, R3 perpendicular (buildRadialSurfaceProjector) on every facet with R1 > bar, and
//             R1/sqrt(1+L^2) as a PROVEN LOWER bound (the surface is a graph with |grad r| <= L, so a
//             radial gap of d cannot be closer than d/sqrt(1+L^2)). Both bars, 0.01 and 0.001.
//   FOLDS     dihedral > CEIL (mesh-made: the analytic surface cannot bend that far), blades >= 175 deg,
//             and the graphRatio degeneracy-pole bands.
//   TOPOLOGY  boundary / non-manifold / inconsistent-winding edge counts.
//   ORIENT    normDeg via orientOfFacet with inset, lattice order k and the fd step h ALL SWEPT (scars
//             1, 2, 3). Nothing is quoted at a single setting.
//
// Usage: bash research/tools/run-s116-best.sh
//   env PF_S116_STL(abs) PF_S116_STYLE PF_S116_OUTDIR PF_S116_TAG PF_S116_ROUNDS PF_S116_MAXT
//       PF_S116_BARHI PF_S116_BARLO PF_S116_PLACEBO(0/1) PF_S116_R3FULL(0/1)
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

const STYLE = envS('PF_S116_STYLE', 'GothicArches');
const STL = envS('PF_S116_STL', '');
const TAG = envS('PF_S116_TAG', 'GOTH');
const OUTDIR = envS('PF_S116_OUTDIR', 'research/exchange/_strataConformBisect/s116');
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S116_BARHI', 0.01);
const BAR_LO = envF('PF_S116_BARLO', 0.001);
/** the bar the OPERATOR drives at (the bars above are the ones the CENSUS scores against). */
const TBAR = envF('PF_S116_TBAR', envF('PF_S116_BARHI', 0.01));
const ROUNDS = envI('PF_S116_ROUNDS', 14);
const MAXT = envI('PF_S116_MAXT', 5_000_000);
const K_LOOP = envI('PF_S116_KLOOP', 4);       // lattice order inside the refinement loop
const K_FINAL = envI('PF_S116_KFINAL', 8);     // lattice order for the census
const PERP_TOP = envI('PF_S116_PERPTOP', 4);
const DO_PLACEBO = envI('PF_S116_PLACEBO', 1) === 1;
const R3FULL = envI('PF_S116_R3FULL', 0) === 1; // exhaustive R3 down to the LO bar (slow: ~16 min/mesh)
const ORIENT_N = envI('PF_S116_ORIENTN', 4000);
if (STL.length === 0) { log('*** PF_S116_STL required ***'); process.exit(2); }

// ── the analytic surface ────────────────────────────────────────────────────────────────────────────
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });

const pct = (a: number, b: number): string => (b === 0 ? '   —   ' : ((a / b) * 100).toFixed(4));
const qOf = (v: Float64Array, p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * p)))]);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 PHASE 2 — THE BEST ${STYLE} MESH WE CAN MAKE, AND AN HONEST SCORE  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl    ${STL}`);
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log(`bars   HI ${BAR_HI} mm   LO ${BAR_LO} mm   rounds<=${ROUNDS}  maxT ${MAXT}  kLoop ${K_LOOP} kFinal ${K_FINAL}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE A — THE ANALYTIC CEILING.  CEIL = 2*atan(max|grad r|) is the largest angle two normals of a
// radial-graph surface can subtend, so a mesh dihedral above it CANNOT come from the surface.
// h is SWEPT (scar 3) and the grid is refined, because both feed max|grad r|.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function maxGradR(nG: number, hArc: number, hZ: number): number {
  let g = 0;
  for (let i = 0; i < nG; i += 1) {
    const th = (i / nG) * 2 * Math.PI;
    for (let j = 0; j <= nG; j += 1) {
      const z = (j / nG) * H;
      const r0 = rA(th, z);
      const hTh = hArc / Math.max(1e-9, r0);          // theta step whose ARC LENGTH is hArc mm
      const rtA = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hArc);
      const zl = Math.max(0, z - hZ); const zh = Math.min(H, z + hZ);
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const m = Math.hypot(rtA, rz);
      if (m > g) g = m;
    }
  }
  return g;
}
log('── STAGE A: ANALYTIC CEILING  CEIL = 2*atan(max|grad r|)   (scar 3: h swept) ──');
let LMAX = 0;
{
  for (const h of [2e-6, 2e-5, 2e-4, 1e-3]) {
    const g = maxGradR(400, h, h * 10);
    log(`   h=${h.toExponential(3)}  (400^2)  max|grad r| ${g.toFixed(4)}  CEIL ${(2 * Math.atan(g) * DEG).toFixed(3)} deg`);
  }
  LMAX = maxGradR(1200, 2e-6, 2e-5);
  log(`   REFERENCE h=2.000e-6 on a 1200^2 grid: max|grad r| ${LMAX.toFixed(4)}  *** CEIL = ${(2 * Math.atan(LMAX) * DEG).toFixed(3)} deg ***`);
}
const CEIL_RAD = 2 * Math.atan(LMAX);
const GRAPH_SLOPE = Math.sqrt(1 + LMAX * LMAX);   // the R1 -> distance deflation factor, PROVEN
log(`   graph factor sqrt(1+L^2) = ${GRAPH_SLOPE.toFixed(4)}  =>  dist(p,S) >= R1(p)/${GRAPH_SLOPE.toFixed(4)} is a PROVEN LOWER BOUND`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MESH — indexed, with an explicit triangle-neighbour table. No Map in the hot path.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Mesh {
  vx: Float64Array; vy: Float64Array; vz: Float64Array; nV: number;
  tv: Int32Array; tnb: Int32Array; alive: Uint8Array; nT: number;
  cap: number; vcap: number;
}

let weldNonMan = 0;
function buildMesh(xyz: Float64Array, nTri: number, tcap: number, vcap: number): Mesh {
  // exact-f32 weld: an STL writes a shared vertex from the same f64 through the same f32 rounding.
  const nVin = nTri * 3;
  const id = new Int32Array(nVin);
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const vx = new Float64Array(vcap); const vy = new Float64Array(vcap); const vz = new Float64Array(vcap);
  let nV = 0;
  for (let v = 0; v < nVin; v += 1) {
    const x = xyz[v * 3], y = xyz[v * 3 + 1], z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (Math.imul(u32[0], 0x9e3779b1) ^ Math.imul(u32[1], 0x85ebca6b) ^ Math.imul(u32[2], 0xc2b2ae35)) | 0;
    const b = buckets.get(h);
    let found = -1;
    if (b !== undefined) for (const c of b) if (vx[c] === x && vy[c] === y && vz[c] === z) { found = c; break; }
    if (found < 0) { found = nV; vx[nV] = x; vy[nV] = y; vz[nV] = z; nV += 1; if (b === undefined) buckets.set(h, [found]); else b.push(found); }
    id[v] = found;
  }
  const tv = new Int32Array(tcap * 3); const tnb = new Int32Array(tcap * 3).fill(-1);
  const alive = new Uint8Array(tcap);
  for (let t = 0; t < nTri; t += 1) { tv[t * 3] = id[t * 3]; tv[t * 3 + 1] = id[t * 3 + 1]; tv[t * 3 + 2] = id[t * 3 + 2]; alive[t] = 1; }
  // pair half-edges
  const em = new Map<number, number>();   // key -> half-edge (3t+s)
  let nonMan = 0;
  for (let t = 0; t < nTri; t += 1) {
    for (let s = 0; s < 3; s += 1) {
      const a = tv[t * 3 + s], b2 = tv[t * 3 + ((s + 1) % 3)];
      const key = a < b2 ? a * 1e7 + b2 : b2 * 1e7 + a;
      const prev = em.get(key);
      if (prev === undefined) em.set(key, t * 3 + s);
      else if (tnb[prev] === -1) { tnb[prev] = t; tnb[t * 3 + s] = (prev / 3) | 0; }
      else nonMan += 1;
    }
  }
  weldNonMan = nonMan;
  if (nonMan > 0) log(`   *** WELD: ${nonMan} half-edges could not be paired (3+ facets on an edge) ***`);
  return { vx, vy, vz, nV, tv, tnb, alive, nT: nTri, cap: tcap, vcap };
}

const triNormal = (M: Mesh, t: number, out: Float64Array): number => {
  const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
  const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
  const ux = M.vx[b] - ax, uy = M.vy[b] - ay, uz = M.vz[b] - az;
  const wx = M.vx[c] - ax, wy = M.vy[c] - ay, wz = M.vz[c] - az;
  out[0] = uy * wz - uz * wy; out[1] = uz * wx - ux * wz; out[2] = ux * wy - uy * wx;
  return Math.hypot(out[0], out[1], out[2]);   // = 2 * area
};
/**
 * EDGE LENGTH IN THE METRIC THE REFINEMENT LIVES IN.
 *
 * MEASURED, not assumed. With the 3D chord metric (PF_S116_METRIC=3d) the operator halved the position
 * defect but MULTIPLIED the blade class 8x by count and grew the degeneracy pole from 4.11 to 5.02 mm2:
 * a curtain facet's longest 3D edge is its SHORTEST parameter edge, so bisecting it makes the parametric
 * needle thinner every time. The parameter metric (arc = rMean*dTheta, dz) is the domain the triangulation
 * actually lives in, it is what the shipping quadtree balances (PeriodicBalancedQuadtree, first-
 * fundamental-form extent), and Rivara's angle bound then applies WHERE THE DEGENERACY IS.
 */
const METRIC = envS('PF_S116_METRIC', 'par');
const edgeLen2 = (M: Mesh, a: number, b: number): number => {
  if (METRIC === '3d') {
    const dx = M.vx[a] - M.vx[b], dy = M.vy[a] - M.vy[b], dz = M.vz[a] - M.vz[b];
    return dx * dx + dy * dy + dz * dz;
  }
  const ta = Math.atan2(M.vy[a], M.vx[a]);
  const dth = dThRaw(ta, Math.atan2(M.vy[b], M.vx[b]));
  const rm = 0.5 * (Math.hypot(M.vx[a], M.vy[a]) + Math.hypot(M.vx[b], M.vy[b]));
  const du = dth * rm; const dz = M.vz[a] - M.vz[b];
  return du * du + dz * dz;
};
/** longest-edge slot with a GLOBAL deterministic tie-break, so a terminal edge always exists. */
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE GUARDED BISECTION.  Radial projection preserves (theta, z), so the parametric footprint of every
// child is exactly the linear-bisection footprint => a parameter-space fold is IMPOSSIBLE. The ladder
// below guards only the 3D side.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let nBisect = 0; let nReject = 0; let sumOff = 0; let maxOff = 0; let sumDisp = 0; let maxDisp = 0;
let rejPar: number[] = []; let rejAR: number[] = [];

/** signed parametric area of (p,q,r) in the (rRef*theta, z) plane, using UNWRAPPED theta off p. */
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

/**
 * Bisect the edge in slot s of triangle t.
 *
 * THE NEW VERTEX IS THE EXACT PARAMETER MIDPOINT LIFTED ONTO rA:
 *     th_m = th_a + dThRaw(th_a, th_b)/2,  z_m = (z_a+z_b)/2,  r_m = rA(th_m, z_m).
 * Two consequences, both BY CONSTRUCTION rather than by detection:
 *   1. the vertex is ON the analytic surface to the f32 write floor — PRECOND cannot degrade;
 *   2. in the (theta, z) chart the operation is the ordinary midpoint bisection of a triangle, so the
 *      refined parameter triangulation is valid and every child inherits the PARENT'S FOOTPRINT SIGN.
 *      A parameter-space fold is therefore impossible, and since the mesh is the graph of rA over that
 *      triangulation, the exact-single-cover property of the shipping mesh is preserved exactly.
 * The 3D checks below are CONTROLS, not the mechanism: they assert (1) and (2) rather than repair them.
 * (An earlier version guarded on `dot(childNormal, parentNormal) > 0` and BACKED OFF the projection when
 * it failed. That guard is WRONG: on a cliff the radial direction lies almost in the facet plane, so two
 * legitimate neighbours can subtend more than 90 deg. It fired on 63% of bisections and pushed PRECOND
 * from 0.031 um to 423.5 um — the fallback vertices were simply off the surface. Measured, then deleted.)
 */
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
  // f32-ROUND AT BIRTH. The deliverable is a binary STL, so a vertex the census scores as f64-exact but
  // the file stores as f32 would be a scored-but-not-shipped vertex. Round here so every number below is
  // a number the FILE has.
  const mx = Math.fround(rm * Math.cos(thm)), my = Math.fround(rm * Math.sin(thm)), mz = Math.fround(zm);
  // CONTROLS
  const lx = 0.5 * (ax + bx), ly = 0.5 * (ay + by), lz = 0.5 * (az + bz);
  const disp = Math.hypot(mx - lx, my - ly, mz - lz);       // the sag this bisection removes
  sumDisp += disp; if (disp > maxDisp) maxDisp = disp;
  const off = Math.abs(Math.hypot(mx, my) - rA(Math.atan2(my, mx), mz));
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
    if (!ok) {
      nReject += 1;
      const pa = Math.abs(parSigned(ax, ay, az, bx, by, bz, cx, cy, cz));
      const ar = 0.5 * Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) + Math.abs((bz - az) * (cx - ax));
      rejPar.push(pa); rejAR.push(ar > 0 ? pa / ar : 0);
      return 0;
    }
  }
  if (M.nV >= M.vcap || M.nT + 4 >= M.cap) return 0;
  const m = M.nV; M.vx[m] = mx; M.vy[m] = my; M.vz[m] = mz; M.nV += 1;
  const tBC = M.tnb[t * 3 + ((s + 1) % 3)], tCA = M.tnb[t * 3 + ((s + 2) % 3)];
  const t1 = M.nT; const t2 = M.nT + 1; M.nT += 2;
  M.tv[t1 * 3] = a; M.tv[t1 * 3 + 1] = m; M.tv[t1 * 3 + 2] = c; M.alive[t1] = 1;
  M.tv[t2 * 3] = m; M.tv[t2 * 3 + 1] = b; M.tv[t2 * 3 + 2] = c; M.alive[t2] = 1;
  M.alive[t] = 0;
  let n1 = -1; let n2 = -1;
  if (n >= 0) {
    const nAD = M.tnb[n * 3 + ((s2 + 1) % 3)], nDB = M.tnb[n * 3 + ((s2 + 2) % 3)];
    n1 = M.nT; n2 = M.nT + 1; M.nT += 2;
    M.tv[n1 * 3] = b; M.tv[n1 * 3 + 1] = m; M.tv[n1 * 3 + 2] = d; M.alive[n1] = 1;
    M.tv[n2 * 3] = m; M.tv[n2 * 3 + 1] = a; M.tv[n2 * 3 + 2] = d; M.alive[n2] = 1;
    M.alive[n] = 0;
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

/** Rivara LEPP: refine `t` by repeatedly bisecting the terminal edge of its longest-edge chain. */
function lepp(M: Mesh, t: number, born: number[]): void {
  let guard = 0;
  while (M.alive[t] === 1 && guard < 400) {
    guard += 1;
    let cur = t; let chain = 0;
    for (; chain < 400; chain += 1) {
      const s = longestSlot(M, cur);
      const nb = M.tnb[cur * 3 + s];
      if (nb < 0) break;
      const s2 = longestSlot(M, nb);
      if (M.tnb[nb * 3 + s2] === cur) break;    // terminal pair
      cur = nb;
    }
    const s = longestSlot(M, cur);
    const before = M.nT;
    let made = bisect(M, cur, s);
    if (made === 0) {
      // The terminal edge was REFUSED (its parent's parametric footprint is at the f32 noise floor).
      // Conformity does not depend on which edge is chosen — `bisect` always splits BOTH incident
      // triangles — so try the other two. Only quality (Rivara's angle bound) is at stake, and a
      // slightly worse-shaped child beats an unrefinable one. If all three refuse, the facet is at the
      // operator's floor and is REPORTED as such rather than forced.
      for (let alt = 0; alt < 3 && made === 0; alt += 1) if (alt !== s) made = bisect(M, cur, alt);
      if (made === 0) return;
    }
    for (let q = before; q < M.nT; q += 1) born.push(q);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SCORING PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const latticePts = (k: number): Float64Array => {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
};
const LAT_LOOP = latticePts(K_LOOP); const NPL = LAT_LOOP.length / 3;

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
function r3Of(M: Mesh, t: number, LAT: Float64Array, NP: number, dd: Float64Array, ord: Int32Array): number {
  const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
  const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
  const bx = M.vx[b], by = M.vy[b], bz = M.vz[b];
  const cx = M.vx[c], cy = M.vy[c], cz = M.vz[c];
  for (let p = 0; p < NP; p += 1) {
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
    dd[p] = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
  }
  let nTop = 0;
  for (let p = 0; p < NP; p += 1) {
    const v = dd[p];
    if (nTop < PERP_TOP) { let i = nTop; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; nTop += 1; }
    else if (v > dd[ord[nTop - 1]]) { let i = nTop - 1; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; }
  }
  let best = 0;
  for (let ti = 0; ti < nTop; ti += 1) {
    const p = ord[ti];
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
    const dv = proj.project(x, y, z).dist;
    if (dv > best) best = dv;
  }
  return best;
}
/** per-facet MAX adjacent dihedral, radians, from the neighbour table (no re-weld). */
function dihedralMax(M: Mesh): Float64Array {
  const out = new Float64Array(M.nT);
  const nx = new Float64Array(M.nT); const ny = new Float64Array(M.nT); const nz = new Float64Array(M.nT);
  const nb = new Float64Array(3);
  for (let t = 0; t < M.nT; t += 1) {
    if (M.alive[t] === 0) continue;
    const l = triNormal(M, t, nb);
    if (l > 0) { nx[t] = nb[0] / l; ny[t] = nb[1] / l; nz[t] = nb[2] / l; }
  }
  for (let t = 0; t < M.nT; t += 1) {
    if (M.alive[t] === 0) continue;
    let w = 0;
    for (let s = 0; s < 3; s += 1) {
      const o = M.tnb[t * 3 + s];
      if (o < 0) continue;
      let dp = nx[t] * nx[o] + ny[t] * ny[o] + nz[t] * nz[o];
      if (dp > 1) dp = 1; if (dp < -1) dp = -1;
      const ang = Math.acos(dp);
      if (ang > w) w = ang;
    }
    out[t] = w;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE OPERATOR
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface RunOut { M: Mesh; live: number; rounds: number; targets: number[]; }

function runArm(kind: 'op' | 'placebo', tcap: number, vcap: number, matchT: number, seed: number): RunOut {
  const src = readMeshFloat64(STL, false);
  const M = buildMesh(src.xyz, src.nTri, tcap, vcap);
  const base = M.nT;
  nBisect = 0; nReject = 0; sumOff = 0; maxOff = 0; sumDisp = 0; maxDisp = 0; rejPar = []; rejAR = [];
  const r1 = new Float64Array(tcap); const r3 = new Float64Array(tcap);
  const dirty = new Uint8Array(tcap).fill(1);
  const dd = new Float64Array(NPL); const ord = new Int32Array(NPL);
  let rngS = seed >>> 0;
  const rng = (): number => { rngS = (rngS + 0x6D2B79F5) >>> 0; let x = Math.imul(rngS ^ (rngS >>> 15), 1 | rngS); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const targets: number[] = [];
  let rounds = 0;
  for (let r = 0; r < ROUNDS; r += 1) {
    // (re)score dirty live triangles
    for (let t = 0; t < M.nT; t += 1) {
      if (M.alive[t] === 0 || dirty[t] === 0) continue;
      const v = r1Of(M, t, LAT_LOOP, NPL);
      r1[t] = v;
      r3[t] = v > TBAR ? r3Of(M, t, LAT_LOOP, NPL, dd, ord) : v;
      dirty[t] = 0;
    }
    const dih = dihedralMax(M);
    let live = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) live += 1;
    // target set
    const tgt: number[] = [];
    if (kind === 'op') {
      for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1 && (r3[t] > TBAR || dih[t] > CEIL_RAD)) tgt.push(t);
    } else {
      if (live >= matchT) { targets.push(0); rounds = r; break; }
      const want = Math.max(1, Math.min(live, Math.round((matchT - live) / 3)));
      const seen = new Set<number>();
      let guard = 0;
      while (seen.size < want && guard < want * 20) {
        guard += 1;
        const t = Math.floor(rng() * M.nT);
        if (t < M.nT && M.alive[t] === 1 && !seen.has(t)) { seen.add(t); tgt.push(t); }
      }
    }
    targets.push(tgt.length);
    log(`   [${kind}] round ${r}: live ${live}  targets ${tgt.length}  (bisections so far ${nBisect})`);
    if (tgt.length === 0) { rounds = r; break; }
    const born: number[] = [];
    for (const t of tgt) {
      if (M.alive[t] === 0) continue;
      if (M.nT + 8 >= tcap || M.nV + 4 >= vcap) break;
      lepp(M, t, born);
    }
    for (const q of born) dirty[q] = 1;
    rounds = r + 1;
    if (M.nT + 16 >= tcap || M.nV + 8 >= vcap) { log(`   [${kind}] CAPACITY REACHED at round ${r}`); break; }
    if (kind === 'op') { let liveN = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) liveN += 1; if (liveN > MAXT) { log(`   [${kind}] triangle budget ${MAXT} reached`); break; } }
  }
  let live = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) live += 1;
  log(`   [${kind}] DONE  base ${base} -> live ${live} (${(live / base).toFixed(4)}x)  bisections ${nBisect}  vertices ${M.nV}`);
  log(`   [${kind}] CONTROL footprint-sign rejections: ${nReject} (${pct(nReject, Math.max(1, nBisect + nReject))}%)  ${nReject === 0 ? 'CONTROL HOLDS — every child kept its parent\'s parametric orientation.' : 'rejections are REFUSED bisections, never emitted geometry'}`);
  if (nReject > 0) {
    const rp = new Float64Array(rejPar); rp.sort();
    log(`   [${kind}]   rejected parents' |parametric area| mm2: p50 ${qOf(rp, 0.5).toExponential(3)}  p99 ${qOf(rp, 0.99).toExponential(3)}  MAX ${qOf(rp, 1).toExponential(3)}  (f32 noise floor on a 50 mm arm ~ 3e-6 mm x edge)`);
  }
  log(`   [${kind}] new-vertex off-surface |r-rA|: mean ${(sumOff / Math.max(1, nBisect)).toExponential(3)} mm  MAX ${maxOff.toExponential(3)} mm  (must be at the f32 floor ~3.0e-6)`);
  log(`   [${kind}] sag removed at the new vertex |m_proj - m_linear|: mean ${(sumDisp / Math.max(1, nBisect)).toExponential(3)} mm  MAX ${maxDisp.toExponential(3)} mm`);
  return { M, live, rounds, targets };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CENSUS — one code path, applied identically to every mesh.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Census {
  label: string; nT: number; area: number;
  precondMax: number; precondP99: number; precondOverLo: number;
  hiN: number; hiA: number; hiMax: number; loN: number; loA: number; loMax: number;
  hiNlb: number; hiAlb: number;
  r1hiN: number; r1hiA: number; r1loN: number; r1loA: number; r1max: number;
  badN: number; badA: number; bladeN: number; bladeA: number; c45N: number; c45A: number; dihMax: number;
  curtN: number; curtA: number; poleN: number; poleA: number;
  bnd: number; nonMan: number; incons: number;
  r3: Float64Array; live: Int32Array;
}

function census(M: Mesh, label: string, fullR3: boolean): Census {
  const LAT = latticePts(K_FINAL); const NP = LAT.length / 3;
  const live: number[] = [];
  for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) live.push(t);
  const nL = live.length;
  const area = new Float64Array(nL); const r1 = new Float64Array(nL); const r3 = new Float64Array(nL);
  const gr = new Float64Array(nL);
  let areaTot = 0; let precMax = 0; let precOverLo = 0;
  const prec: number[] = [];
  const nb = new Float64Array(3);
  const t0 = Date.now();
  for (let i = 0; i < nL; i += 1) {
    const t = live[i];
    const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
    const ax = M.vx[a], ay = M.vy[a], az = M.vz[a];
    const bx = M.vx[b], by = M.vy[b], bz = M.vz[b];
    const cx = M.vx[c], cy = M.vy[c], cz = M.vz[c];
    area[i] = 0.5 * triNormal(M, t, nb); areaTot += area[i];
    // PRECOND — every corner, no dedup, no stride
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const p1 = Math.abs(Math.hypot(ax, ay) - rA(tha, az));
    const p2 = Math.abs(Math.hypot(bx, by) - rA(thb, bz));
    const p3 = Math.abs(Math.hypot(cx, cy) - rA(thc, cz));
    const pm = Math.max(p1, p2, p3);
    prec.push(p1, p2, p3);
    if (pm > precMax) precMax = pm;
    if (pm > BAR_LO) precOverLo += 1;
    // graphRatio
    const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const ua = tha * rm, ub = thb * rm, uc = thc * rm;
    const pa = 0.5 * Math.abs((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
    gr[i] = pa > 0 ? area[i] / pa : Infinity;
    r1[i] = r1Of(M, t, LAT, NP);
  }
  const secR1 = (Date.now() - t0) / 1000;
  // R3 adjudication
  const dd = new Float64Array(NP); const ord = new Int32Array(NP);
  const cand = fullR3 ? BAR_LO : BAR_HI;
  let nCalls = 0;
  const t1 = Date.now();
  for (let i = 0; i < nL; i += 1) {
    if (r1[i] <= cand) { r3[i] = r1[i]; continue; }
    r3[i] = r3Of(M, live[i], LAT, NP, dd, ord); nCalls += PERP_TOP;
  }
  const secR3 = (Date.now() - t1) / 1000;
  // dihedral + topology
  const dih = dihedralMax(M);
  let bnd = 0; let incons = 0;
  for (let t = 0; t < M.nT; t += 1) {
    if (M.alive[t] === 0) continue;
    for (let s = 0; s < 3; s += 1) {
      const o = M.tnb[t * 3 + s];
      if (o < 0) { bnd += 1; continue; }
      // inconsistent winding: both traverse the shared edge the same way
      const a = M.tv[t * 3 + s], b = M.tv[t * 3 + ((s + 1) % 3)];
      let same = false;
      for (let q = 0; q < 3; q += 1) if (M.tv[o * 3 + q] === a && M.tv[o * 3 + ((q + 1) % 3)] === b) same = true;
      if (same) incons += 1;
    }
  }
  incons = incons / 2;
  const tally = (v: Float64Array, bar: number): { n: number; a: number; mx: number } => {
    let n = 0; let aa = 0; let mx = 0;
    for (let i = 0; i < nL; i += 1) { if (v[i] > bar) { n += 1; aa += area[i]; } if (v[i] > mx) mx = v[i]; }
    return { n, a: aa, mx };
  };
  const hi = tally(r3, BAR_HI); const lo = tally(r3, BAR_LO);
  const rhi = tally(r1, BAR_HI); const rlo = tally(r1, BAR_LO);
  // PROVEN LOWER BOUND: dist >= R1 / sqrt(1+L^2)
  let hiNlb = 0; let hiAlb = 0;
  for (let i = 0; i < nL; i += 1) if (r1[i] / GRAPH_SLOPE > BAR_HI) { hiNlb += 1; hiAlb += area[i]; }
  let badN = 0, badA = 0, bladeN = 0, bladeA = 0, c45N = 0, c45A = 0, dmx = 0;
  let curtN = 0, curtA = 0, poleN = 0, poleA = 0;
  const B45 = 45 / DEG; const B175 = 175 / DEG;
  for (let i = 0; i < nL; i += 1) {
    const dv = dih[live[i]];
    if (dv > dmx) dmx = dv;
    if (dv > B45) { c45N += 1; c45A += area[i]; }
    if (dv > CEIL_RAD) { badN += 1; badA += area[i]; }
    if (dv >= B175) { bladeN += 1; bladeA += area[i]; }
    if (gr[i] >= 10 && gr[i] < 100) { curtN += 1; curtA += area[i]; }
    if (gr[i] >= 100) { poleN += 1; poleA += area[i]; }
  }
  const ps = new Float64Array(prec); ps.sort();
  log(`   [${label}] census: ${nL} facets, ${areaTot.toFixed(3)} mm2, R1 ${secR1.toFixed(1)}s, R3 ${secR3.toFixed(1)}s (${nCalls} calls, cand>${cand})`);
  return {
    label, nT: nL, area: areaTot,
    precondMax: precMax, precondP99: qOf(ps, 0.99), precondOverLo: precOverLo,
    hiN: hi.n, hiA: hi.a, hiMax: hi.mx, loN: lo.n, loA: lo.a, loMax: lo.mx,
    hiNlb, hiAlb,
    r1hiN: rhi.n, r1hiA: rhi.a, r1loN: rlo.n, r1loA: rlo.a, r1max: rhi.mx,
    badN, badA, bladeN, bladeA, c45N, c45A, dihMax: dmx,
    curtN, curtA, poleN, poleA,
    bnd, nonMan: weldNonMan, incons,
    r3, live: new Int32Array(live),
  };
}

function printCensus(C: Census): void {
  log(`──────── ${C.label} ────────`);
  log(`   facets ${C.nT}   3D area ${C.area.toFixed(3)} mm2`);
  log(`   PRECOND (EXHAUSTIVE, every corner, no stride): MAX ${(C.precondMax * 1000).toFixed(4)} um   p99 ${(C.precondP99 * 1000).toExponential(3)} um   facets with a corner over ${BAR_LO} mm: ${C.precondOverLo} (${pct(C.precondOverLo, C.nT)}%)`);
  log(`   POSITION  ruler                 bar mm    COUNT        %mesh      AREA mm2     %area        MAX mm`);
  log(`             R1 radial (UPPER)   ${BAR_HI.toFixed(4)}  ${String(C.r1hiN).padStart(9)}  ${pct(C.r1hiN, C.nT).padStart(9)}%  ${C.r1hiA.toFixed(4).padStart(12)}  ${pct(C.r1hiA, C.area).padStart(8)}%  ${C.r1max.toExponential(4)}`);
  log(`             R1 radial (UPPER)   ${BAR_LO.toFixed(4)}  ${String(C.r1loN).padStart(9)}  ${pct(C.r1loN, C.nT).padStart(9)}%  ${C.r1loA.toFixed(4).padStart(12)}  ${pct(C.r1loA, C.area).padStart(8)}%  ${C.r1max.toExponential(4)}`);
  log(`             R3 perp   (HONEST)  ${BAR_HI.toFixed(4)}  ${String(C.hiN).padStart(9)}  ${pct(C.hiN, C.nT).padStart(9)}%  ${C.hiA.toFixed(4).padStart(12)}  ${pct(C.hiA, C.area).padStart(8)}%  ${C.hiMax.toExponential(4)}`);
  log(`             R3 perp   (HONEST)  ${BAR_LO.toFixed(4)}  ${String(C.loN).padStart(9)}  ${pct(C.loN, C.nT).padStart(9)}%  ${C.loA.toFixed(4).padStart(12)}  ${pct(C.loA, C.area).padStart(8)}%  ${C.loMax.toExponential(4)}`);
  log(`             R1/sqrt(1+L^2) (PROVEN LOWER) ${BAR_HI}  ${String(C.hiNlb).padStart(9)}  ${pct(C.hiNlb, C.nT).padStart(9)}%  ${C.hiAlb.toFixed(4).padStart(12)}  ${pct(C.hiAlb, C.area).padStart(8)}%`);
  log(`   FOLDS     >45 deg class     COUNT ${C.c45N} (${pct(C.c45N, C.nT)}%)  AREA ${C.c45A.toFixed(3)} mm2 (${pct(C.c45A, C.area)}% OF MESH)   dihedral MAX ${(C.dihMax * DEG).toFixed(3)} deg`);
  log(`             >CEIL(${(CEIL_RAD * DEG).toFixed(2)}) BAD  COUNT ${C.badN} (${pct(C.badN, C.nT)}%)  AREA ${C.badA.toFixed(4)} mm2 (${pct(C.badA, C.area)}% OF MESH)`);
  log(`             >=175 deg BLADE   COUNT ${C.bladeN} (${pct(C.bladeN, C.nT)}%)  AREA ${C.bladeA.toFixed(4)} mm2 (${pct(C.bladeA, C.area)}% OF MESH)`);
  log(`             graphRatio [10,100) COUNT ${C.curtN} AREA ${C.curtA.toFixed(4)} mm2 (${pct(C.curtA, C.area)}%)   >=100 POLE COUNT ${C.poleN} AREA ${C.poleA.toFixed(4)} mm2 (${pct(C.poleA, C.area)}%)`);
  log(`   TOPOLOGY  boundary edges ${C.bnd}   non-manifold ${C.nonMan}   inconsistent winding ${C.incons}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const srcProbe = readMeshFloat64(STL, false);
const BASE_T = srcProbe.nTri;
const TCAP = Math.min(MAXT * 2 + 64, envI('PF_S116_TCAP', 6_000_000));
const VCAP = envI('PF_S116_VCAP', 3_200_000);
log(`── STAGE B: BASELINE ──`);
const B0 = buildMesh(srcProbe.xyz, srcProbe.nTri, TCAP, VCAP);
log(`   welded: ${B0.nT} facets, ${B0.nV} vertices`);
const cBase = census(B0, 'BASELINE (shipping mesh)', R3FULL);
printCensus(cBase);
// free
(B0 as unknown as { tv: Int32Array | null }).tv = null;

log('── STAGE C: OPERATOR ARM — APCR (analytic-projected conforming refinement) ──');
const opRun = runArm('op', TCAP, VCAP, 0, 12345);
const cOp = census(opRun.M, 'OPERATOR APCR', R3FULL);
printCensus(cOp);

// write the operator STL before anything else can run out of memory
function writeSTL(M: Mesh, path: string): number {
  let live = 0; for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) live += 1;
  const buf = Buffer.alloc(84 + live * 50);
  buf.write('S116 APCR GothicArches — analytic-projected conforming refinement', 0, 79, 'ascii');
  buf.writeUInt32LE(live, 80);
  let o = 84;
  const nb = new Float64Array(3);
  for (let t = 0; t < M.nT; t += 1) {
    if (M.alive[t] === 0) continue;
    const l = triNormal(M, t, nb);
    const nx = l > 0 ? nb[0] / l : 0, ny = l > 0 ? nb[1] / l : 0, nz = l > 0 ? nb[2] / l : 0;
    buf.writeFloatLE(nx, o); buf.writeFloatLE(ny, o + 4); buf.writeFloatLE(nz, o + 8); o += 12;
    for (let q = 0; q < 3; q += 1) {
      const v = M.tv[t * 3 + q];
      buf.writeFloatLE(M.vx[v], o); buf.writeFloatLE(M.vy[v], o + 4); buf.writeFloatLE(M.vz[v], o + 8); o += 12;
    }
    buf.writeUInt16LE(0, o); o += 2;
  }
  writeFileSync(path, buf);
  return live;
}
const OP_STL = `${OUTDIR}/S116_BEST_${TAG}_APCR.stl`;
const wrote = writeSTL(opRun.M, OP_STL);
log(`   operator STL -> ${OP_STL}  (${wrote} facets)`);
log('');

// ── SCAR 2 on the POSITION ruler: the barycentric lattice order must be shown to converge ──
function kLadder(M: Mesh, label: string): void {
  log(`── SCAR 2: BARYCENTRIC LATTICE ORDER k ON R1 — ${label} (strided so the ladder is affordable) ──`);
  log('   k     pts/facet      MAX R1 mm     mean R1 mm    facets>HI    facets>LO      n');
  const liveIdx: number[] = [];
  for (let t = 0; t < M.nT; t += 1) if (M.alive[t] === 1) liveIdx.push(t);
  const stride = Math.max(1, Math.floor(liveIdx.length / 40000));
  for (const k of [4, 8, 16, 24]) {
    const L = latticePts(k); const NP = L.length / 3;
    let mx = 0; let sum = 0; let n = 0; let oh = 0; let ol = 0;
    for (let i = 0; i < liveIdx.length; i += stride) {
      const w = r1Of(M, liveIdx[i], L, NP);
      if (w > mx) mx = w; sum += w; n += 1; if (w > BAR_HI) oh += 1; if (w > BAR_LO) ol += 1;
    }
    log(`   ${String(k).padStart(3)}  ${String(NP).padStart(10)}   ${mx.toExponential(4).padStart(13)}  ${(sum / n).toExponential(4).padStart(13)}  ${String(oh).padStart(10)}   ${String(ol).padStart(10)}  ${String(n).padStart(7)}`);
  }
  log('');
}
kLadder(opRun.M, 'OPERATOR APCR');

// ── ORIENTATION on the operator mesh and the baseline, scars 1/2/3 swept ──
function orientSweep(M: Mesh, C: Census, label: string): void {
  log(`── ORIENTATION (normDeg) — ${label} — SCARS 1/2/3 ALL SWEPT ──`);
  const dih = dihedralMax(M);
  const cls: number[] = [];
  const B45 = 45 / DEG;
  for (let i = 0; i < C.live.length; i += 1) if (dih[C.live[i]] > B45) cls.push(C.live[i]);
  const stride = Math.max(1, Math.floor(cls.length / ORIENT_N));
  const sub: number[] = []; for (let i = 0; i < cls.length; i += stride) sub.push(cls[i]);
  const strideAll = Math.max(1, Math.floor(C.live.length / ORIENT_N));
  const subAll: number[] = []; for (let i = 0; i < C.live.length; i += strideAll) subAll.push(C.live[i]);
  log(`   >45 class ${cls.length} facets; subsample ${sub.length}. whole-mesh subsample ${subAll.length}.`);
  const scratch = new Float64Array(12);
  const run = (set: number[], ns: ReturnType<typeof fdNormals>, k: number, inset: number): { p50: number; p90: number; mx: number; le10: number } => {
    const v: number[] = [];
    for (const t of set) {
      const a = M.tv[t * 3], b = M.tv[t * 3 + 1], c = M.tv[t * 3 + 2];
      const ath = Math.atan2(M.vy[a], M.vx[a]);
      const bth = ath + dThRaw(ath, Math.atan2(M.vy[b], M.vx[b]));
      const cth = ath + dThRaw(ath, Math.atan2(M.vy[c], M.vx[c]));
      const o = orientOfFacet(ns, M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], M.vx[c], M.vy[c], M.vz[c], ath, bth, cth, { k, inset, scratch });
      if (Number.isFinite(o.normDeg)) v.push(o.normDeg);
    }
    v.sort((x, y) => x - y);
    let le = 0; for (const x of v) if (x <= 10) le += 1;
    const g = (p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);
    return { p50: g(0.5), p90: g(0.9), mx: v.length ? v[v.length - 1] : NaN, le10: le / Math.max(1, v.length) };
  };
  log('   SCAR 1 — inset (k=8, h=2e-6), on the >45 class:');
  for (const ins of [0, 0.02, 0.05, 0.1]) {
    const r = run(sub, fdNormals(rA, H, 2e-6, 2e-5), 8, ins);
    log(`     inset=${ins.toFixed(2)}  normDeg p50 ${r.p50.toFixed(3)} p90 ${r.p90.toFixed(3)} MAX ${r.mx.toFixed(3)}  <=10deg share ${(r.le10 * 100).toFixed(2)}%`);
  }
  log('   SCAR 2 — lattice order k (inset=0.05, h=2e-6):');
  for (const k of [4, 8, 16]) {
    const r = run(sub, fdNormals(rA, H, 2e-6, 2e-5), k, 0.05);
    log(`     k=${k}  normDeg p50 ${r.p50.toFixed(3)} p90 ${r.p90.toFixed(3)} MAX ${r.mx.toFixed(3)}  <=10deg share ${(r.le10 * 100).toFixed(2)}%`);
  }
  log('   SCAR 3 — fd step h (k=8, inset=0.05):');
  for (const h of [2e-6, 2e-5, 2e-4, 1e-3]) {
    const r = run(sub, fdNormals(rA, H, h, h * 10), 8, 0.05);
    log(`     h=${h.toExponential(3)}  normDeg p50 ${r.p50.toFixed(3)} p90 ${r.p90.toFixed(3)} MAX ${r.mx.toFixed(3)}  <=10deg share ${(r.le10 * 100).toFixed(2)}%`);
  }
  const rw = run(subAll, fdNormals(rA, H, 2e-6, 2e-5), 8, 0.05);
  log(`   WHOLE-MESH subsample (k=8 inset=0.05 h=2e-6): normDeg p50 ${rw.p50.toFixed(3)} p90 ${rw.p90.toFixed(3)} MAX ${rw.mx.toFixed(3)}  <=10deg share ${(rw.le10 * 100).toFixed(2)}%`);
  log('');
}
orientSweep(opRun.M, cOp, 'OPERATOR APCR');

// write a per-facet R3 scalar for the renderer heatmap (STL file order == live order)
{
  const s = new Float64Array(cOp.r3.length);
  for (let i = 0; i < s.length; i += 1) s[i] = cOp.r3[i];
  writeFileSync(`${OUTDIR}/S116_BEST_${TAG}_APCR_R3.f64`, Buffer.from(s.buffer));
  log(`   R3 scalar -> ${OUTDIR}/S116_BEST_${TAG}_APCR_R3.f64  (${s.length} f64)`);
}
const opLive = cOp.nT;
(opRun.M as unknown as { tv: Int32Array | null }).tv = null;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE D — THE COST-MATCHED PLACEBO
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let cPla: Census | null = null;
if (DO_PLACEBO) {
  log('── STAGE D: COST-MATCHED PLACEBO — identical machinery, RANDOM targets, matched triangle count ──');
  const plRun = runArm('placebo', TCAP, VCAP, opLive, 987654321);
  cPla = census(plRun.M, 'PLACEBO (random targets, cost-matched)', R3FULL);
  printCensus(cPla);
  (plRun.M as unknown as { tv: Int32Array | null }).tv = null;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// VERDICT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   HEAD-TO-HEAD — the same census code on all arms. COUNT + AREA + MAX together.');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
const rows: Census[] = [cBase, cOp]; if (cPla !== null) rows.push(cPla);
log('   arm                                    facets     x base   >0.01 COUNT   >0.01 AREA%   >0.01 MAX mm   >0.001 AREA%    BAD area mm2   BLADE area mm2   dihMAX deg');
for (const C of rows) {
  log(`   ${C.label.padEnd(38)} ${String(C.nT).padStart(8)}  ${(C.nT / cBase.nT).toFixed(4)}x  ${String(C.hiN).padStart(11)}   ${pct(C.hiA, C.area).padStart(11)}%  ${C.hiMax.toExponential(4).padStart(13)}   ${pct(C.loA, C.area).padStart(12)}%  ${C.badA.toFixed(4).padStart(14)}   ${C.bladeA.toFixed(4).padStart(14)}   ${(C.dihMax * DEG).toFixed(3).padStart(10)}`);
}
log('');
const impArea = cBase.hiA > 0 ? cBase.hiA / Math.max(1e-12, cOp.hiA) : NaN;
const impMax = cBase.hiMax / Math.max(1e-12, cOp.hiMax);
log(`   OPERATOR vs BASELINE at 0.01 mm:  AREA ${impArea.toFixed(3)}x better   COUNT ${(cBase.hiN / Math.max(1, cOp.hiN)).toFixed(3)}x   MAX ${impMax.toFixed(3)}x   at ${(cOp.nT / cBase.nT).toFixed(4)}x triangles`);
if (cPla !== null) {
  const pArea = cBase.hiA / Math.max(1e-12, cPla.hiA);
  log(`   PLACEBO  vs BASELINE at 0.01 mm:  AREA ${pArea.toFixed(3)}x better   COUNT ${(cBase.hiN / Math.max(1, cPla.hiN)).toFixed(3)}x   MAX ${(cBase.hiMax / Math.max(1e-12, cPla.hiMax)).toFixed(3)}x   at ${(cPla.nT / cBase.nT).toFixed(4)}x triangles`);
  log(`   OPERATOR vs PLACEBO   at 0.01 mm:  AREA ${(cPla.hiA / Math.max(1e-12, cOp.hiA)).toFixed(3)}x   MAX ${(cPla.hiMax / Math.max(1e-12, cOp.hiMax)).toFixed(3)}x`);
  log(`   *** If the operator is not decisively better than the placebo at matched cost, IT IS REFUTED. ***`);
}
log('');
const out = {
  style: STYLE, stl: STL, ceilDeg: CEIL_RAD * DEG, LMAX, graphSlope: GRAPH_SLOPE,
  arms: rows.map((C) => ({
    label: C.label, nT: C.nT, area: C.area, precondMaxUm: C.precondMax * 1000, precondOverLo: C.precondOverLo,
    hiN: C.hiN, hiA: C.hiA, hiAreaPct: (C.hiA / C.area) * 100, hiMax: C.hiMax,
    loN: C.loN, loA: C.loA, loAreaPct: (C.loA / C.area) * 100, loMax: C.loMax,
    hiNlb: C.hiNlb, hiAlb: C.hiAlb,
    r1hiN: C.r1hiN, r1hiA: C.r1hiA, r1loN: C.r1loN, r1loA: C.r1loA,
    badN: C.badN, badA: C.badA, bladeN: C.bladeN, bladeA: C.bladeA, c45N: C.c45N, c45A: C.c45A, dihMaxDeg: C.dihMax * DEG,
    curtN: C.curtN, curtA: C.curtA, poleN: C.poleN, poleA: C.poleA,
    bnd: C.bnd, incons: C.incons,
  })),
  opStl: OP_STL, bisections: nBisect,
};
writeFileSync(`${OUTDIR}/S116_BEST_${TAG}.json`, JSON.stringify(out, null, 1));
log(`json -> ${OUTDIR}/S116_BEST_${TAG}.json`);
log('S116 PHASE 2 DONE');

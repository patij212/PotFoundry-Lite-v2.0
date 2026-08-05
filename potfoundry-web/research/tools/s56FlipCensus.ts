// s56FlipCensus.ts — R4: CAN AN EDGE-FLIP-ONLY PASS REPAIR THE ORIENTATION DEFECT AT ZERO COST?
//
// S53/S54/S55 established: the unscored class is NORMAL-FIELD (G1) error; its mechanism is the
// Babuska-Aziz max-angle condition (normDeg p99 5.3 -> 73.4 deg over maxAngle 90 -> 165 while the
// driver's ruler moves 1.009x); and on the shipped mesh 129,757 facets (11.36%) exceed the 10 um bar
// on tangential excursion while only 75 (0.007%) exceed it on the driver's own ruler.
//
// AN EDGE FLIP MOVES NO VERTEX. Every vertex of this mesh is already on the surface, so a flip cannot
// change any vertex's position error — it can only change CONNECTIVITY and therefore ORIENTATION,
// which is exactly and only the defect. It costs zero new triangles and zero budget. If a large
// fraction of the cap elements have a legal improving flip, the entire fix is free.
//
// THRESHOLD, JUSTIFIED RATHER THAN PICKED. S54 measured normDeg p99 by maxAngle bin:
//    [0,90) 4.0 | [90,120) 5.3 | [120,150) 9.1 | [150,165) 73.4 | [165,175) 119.5 | [175,180) 128.2
// The knee is at 150 deg (9.1 -> 73.4, an 8.1x step). So CAP := maxAngle >= 150 deg is the measured
// boundary of the regime, and 165 is reported alongside it.
//
// LEGALITY, three conditions, all required:
//   (1) INTERIOR EDGE — exactly two incident facets.
//   (2) NO FOLD — in the (theta,z) parameter domain (unwrapped off the shared edge), the quad must be
//       strictly convex at the diagonal: c and d strictly opposite across line a-b AND a and b
//       strictly opposite across line c-d. On a graph surface that is exactly "the flip does not fold".
//   (3) STRICT IMPROVEMENT — max(maxAngle of the two NEW facets) < max(maxAngle of the two OLD ones).
//
// READ-ONLY against the shipped STL. The flipped mesh is written to a NEW file for inspection; no
// pipeline file is touched and nothing here is wired into the driver.
//
// Usage:  bash research/tools/run-s56-flip-census.sh [TAG]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { writeBinarySTL } from '../bridge/labkit';
import { mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAG = process.env.PF_S56_TAG ?? 'S39CTL';
const STYLE = process.env.PF_S56_STYLE ?? 'GothicArches';
const STEM = process.env.PF_S56_STEM ?? 'gothicarches_ring_DS-HT';
const ROUNDS = Math.round(envF('PF_S56_ROUNDS', 12));
const CAP = envF('PF_S56_CAP_DEG', 150);
// R4  = 'maxangle': flip iff it strictly reduces max(maxAngle) of the incident PAIR. REFUTED (S56):
//       crushes maxAngle 20.5x and makes tangExc 5.5x WORSE, because Euclidean shape optimisation
//       turns rib-aligned triangles ACROSS the rib, into the high-curvature direction.
// R4' = 'tangexc':  flip iff it strictly reduces max(tangExc) of the incident PAIR — the DEFECT
//       itself, which is anisotropy-aware by construction because it reads the surface normal.
const CRIT = (process.env.PF_S56_CRIT ?? 'maxangle').toLowerCase();
const OUTDIR = 'research/exchange/_strataConformBisect/s56flip';

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
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);

log('===== S56 — R4: THE FLIP-ONLY CENSUS (zero new vertices, zero vertex motion) =====');
const path = `research/exchange/_strataConformBisect/${STEM}_${TAG}.stl`;
const { xyz, nTri } = readMeshFloat64(path, false);
log(`${path}: ${nTri} facets`);

// ── 1. WELD. exact f32 positions (the STL round-trip is exact), hash-bucketed, exact compare on hit.
const t0w = Date.now();
const VX = new Float64Array(nTri * 3); const VY = new Float64Array(nTri * 3); const VZ = new Float64Array(nTri * 3);
const tri = new Int32Array(nTri * 3);
{
  const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
  const map = new Map<number, number[]>();
  let nv = 0;
  for (let i = 0; i < nTri * 3; i += 1) {
    const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
    f64[0] = x; f64[1] = y; f64[2] = z;
    let h = 2166136261;
    for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
    h >>>= 0;
    const b = map.get(h);
    let found = -1;
    if (b !== undefined) { for (const v of b) if (VX[v] === x && VY[v] === y && VZ[v] === z) { found = v; break; } }
    if (found < 0) { found = nv; VX[nv] = x; VY[nv] = y; VZ[nv] = z; nv += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
    tri[i] = found;
  }
  log(`weld: ${nv} unique vertices from ${nTri * 3} corners  (${((Date.now() - t0w) / 1000).toFixed(1)} s)`);
  (globalThis as unknown as { __nv: number }).__nv = nv;
}
const NV = (globalThis as unknown as { __nv: number }).__nv;
// per-vertex theta, used for the (theta,z) fold test (unwrapped locally per quad, never globally)
const VT = new Float64Array(NV);
for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VY[v], VX[v]);

// ── geometry helpers
function angles(a: number, b: number, c: number): [number, number, number] {
  const la = Math.hypot(VX[b] - VX[c], VY[b] - VY[c], VZ[b] - VZ[c]);
  const lb = Math.hypot(VX[a] - VX[c], VY[a] - VY[c], VZ[a] - VZ[c]);
  const lc = Math.hypot(VX[a] - VX[b], VY[a] - VY[b], VZ[a] - VZ[b]);
  const g = (p1: number, p2: number, p3: number): number => {
    const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
    return (Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI;
  };
  return [g(la, lb, lc), g(lb, lc, la), g(lc, la, lb)];
}
const maxAngOf = (a: number, b: number, c: number): number => { const A = angles(a, b, c); return Math.max(A[0], A[1], A[2]); };

/** facet orientation error: sin(angle(n_facet, n_surface)) x diam, in mm. 5 rA evals. */
function tangExcOf(a: number, b: number, c: number): number {
  const ax = VX[a]; const ay = VY[a]; const az = VZ[a];
  const bx = VX[b]; const by = VY[b]; const bz = VZ[b];
  const cx = VX[c]; const cy = VY[c]; const cz = VZ[c];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = VT[a];
  const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
  const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
  const r = rA(thc, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
  const cc = Math.cos(thc); const ss = Math.sin(thc);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  const diam = Math.max(
    Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  return Math.sin(Math.acos(dot)) * diam;
}

/** the (theta,z) fold test: is the quad strictly convex at the diagonal a-b? */
function quadConvex(a: number, b: number, c: number, d: number): boolean {
  const t0 = VT[a];
  const pa: [number, number] = [0, VZ[a]];
  const pb: [number, number] = [dThRaw(t0, VT[b]), VZ[b]];
  const pc: [number, number] = [dThRaw(t0, VT[c]), VZ[c]];
  const pd: [number, number] = [dThRaw(t0, VT[d]), VZ[d]];
  const cr = (p: [number, number], q: [number, number], r: [number, number]): number =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const s1 = cr(pa, pb, pc); const s2 = cr(pa, pb, pd);
  const s3 = cr(pc, pd, pa); const s4 = cr(pc, pd, pb);
  return s1 * s2 < 0 && s3 * s4 < 0;
}

// ── 2. BEFORE distributions
function census(label: string): { maxA: number[]; tang: number[]; nCap: number; nCap165: number; nTang10: number; tangMax: number } {
  const maxA: number[] = []; const tang: number[] = [];
  let nCap = 0; let nCap165 = 0; let nTang10 = 0; let tangMax = 0;
  for (let t = 0; t < nTri; t += 1) {
    const a = tri[3 * t]; const b = tri[3 * t + 1]; const c = tri[3 * t + 2];
    const m = maxAngOf(a, b, c); const g = tangExcOf(a, b, c) * 1000;
    maxA.push(m); tang.push(g);
    if (m >= CAP) nCap += 1;
    if (m >= 165) nCap165 += 1;
    if (g > 10) nTang10 += 1;
    if (g > tangMax) tangMax = g;
  }
  maxA.sort((x, y) => x - y); tang.sort((x, y) => x - y);
  log(`${label}: maxAngle p50 ${pq(maxA, 0.5).toFixed(1)} p99 ${pq(maxA, 0.99).toFixed(1)} max ${maxA[nTri - 1].toFixed(2)}   caps>=${CAP} ${nCap} (${((100 * nCap) / nTri).toFixed(3)}%)  >=165 ${nCap165}`);
  log(`${' '.repeat(label.length)}: tangExc p50 ${pq(tang, 0.5).toFixed(2)} p99 ${pq(tang, 0.99).toFixed(2)} max ${tangMax.toFixed(1)} um   over-10um ${nTang10} (${((100 * nTang10) / nTri).toFixed(3)}%)`);
  return { maxA, tang, nCap, nCap165, nTang10, tangMax };
}
log('');
const before = census('BEFORE');

// ── 3. EDGE MAP + iterative independent-set flip rounds
const KEY = NV + 1;   // NV <= ~572k so a*KEY+b < 3.3e11, exact in f64
function buildEdges(): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let t = 0; t < nTri; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const u = tri[3 * t + e]; const v = tri[3 * t + ((e + 1) % 3)];
      const k = u < v ? u * KEY + v : v * KEY + u;
      const l = m.get(k); if (l === undefined) m.set(k, [t]); else l.push(t);
    }
  }
  return m;
}
/** the vertex of facet t that is not u or v */
const opp = (t: number, u: number, v: number): number => {
  const a = tri[3 * t]; const b = tri[3 * t + 1]; const c = tri[3 * t + 2];
  return a !== u && a !== v ? a : b !== u && b !== v ? b : c;
};

log('');
log(`FLIP ROUNDS — criterion '${CRIT}' (independent set per round; strict improvement in max(${CRIT === 'tangexc' ? 'tangExc' : 'maxAngle'}) of the PAIR)`);
let totalFlips = 0; let firstRoundCandidates = 0; let firstRoundCapWithFlip = 0; let firstRoundCapTotal = 0;
let boundaryEdges = 0; let nonManEdges = 0;
for (let round = 0; round < ROUNDS; round += 1) {
  const em = buildEdges();
  if (round === 0) {
    for (const l of em.values()) { if (l.length === 1) boundaryEdges += 1; else if (l.length > 2) nonManEdges += 1; }
    log(`  edge map: ${em.size} edges, boundary ${boundaryEdges}, non-manifold ${nonManEdges}`);
  }
  const dirty = new Uint8Array(nTri);
  // on round 0, also answer the CENSUS question: of the cap facets, how many have a legal improving flip?
  const capHasFlip = round === 0 ? new Uint8Array(nTri) : null;
  // per-round score cache: a facet's score is invariant until it is flipped, and the independent-set
  // rule flips each facet at most once per round, so one fill per round is exact.
  const score = new Float64Array(nTri);
  if (CRIT === 'tangexc') for (let t = 0; t < nTri; t += 1) score[t] = tangExcOf(tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]);
  const scoreOf = (a: number, b: number, c2: number): number => (CRIT === 'tangexc' ? tangExcOf(a, b, c2) : maxAngOf(a, b, c2));
  const eps = CRIT === 'tangexc' ? 1e-9 : 1e-9;
  let flips = 0;
  for (const [k, l] of em) {
    if (l.length !== 2) continue;
    const t1 = l[0]; const t2 = l[1];
    const u = Math.floor(k / KEY); const v = k - u * KEY;
    const c = opp(t1, u, v); const d = opp(t2, u, v);
    if (c === d) continue;
    if (!quadConvex(u, v, c, d)) continue;
    const oldMax = CRIT === 'tangexc'
      ? Math.max(score[t1], score[t2])
      : Math.max(maxAngOf(tri[3 * t1], tri[3 * t1 + 1], tri[3 * t1 + 2]), maxAngOf(tri[3 * t2], tri[3 * t2 + 1], tri[3 * t2 + 2]));
    const newMax = Math.max(scoreOf(d, v, c), scoreOf(d, c, u));
    if (!(newMax < oldMax - eps)) continue;
    if (capHasFlip !== null) {
      firstRoundCandidates += 1;
      if (maxAngOf(tri[3 * t1], tri[3 * t1 + 1], tri[3 * t1 + 2]) >= CAP) capHasFlip[t1] = 1;
      if (maxAngOf(tri[3 * t2], tri[3 * t2 + 1], tri[3 * t2 + 2]) >= CAP) capHasFlip[t2] = 1;
    }
    if (dirty[t1] === 1 || dirty[t2] === 1) continue;
    // apply: T1 <- (d,v,c), T2 <- (d,c,u)   [preserves boundary orientation of the quad]
    tri[3 * t1] = d; tri[3 * t1 + 1] = v; tri[3 * t1 + 2] = c;
    tri[3 * t2] = d; tri[3 * t2 + 1] = c; tri[3 * t2 + 2] = u;
    if (CRIT === 'tangexc') { score[t1] = scoreOf(d, v, c); score[t2] = scoreOf(d, c, u); }
    dirty[t1] = 1; dirty[t2] = 1;
    flips += 1;
  }
  if (capHasFlip !== null) {
    for (let t = 0; t < nTri; t += 1) {
      const m = maxAngOf(tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]);
      if (m >= CAP) { firstRoundCapTotal += 1; if (capHasFlip[t] === 1) firstRoundCapWithFlip += 1; }
    }
  }
  totalFlips += flips;
  log(`  round ${String(round + 1).padStart(2)}: ${String(flips).padStart(7)} flips  (cumulative ${totalFlips})`);
  if (flips === 0) break;
}

log('');
log('*** R4 CENSUS ANSWER (round 1, before any flip was applied) ***');
log(`   improving+legal flips available anywhere: ${firstRoundCandidates}`);
log(`   cap facets (maxAngle >= ${CAP} deg):       ${firstRoundCapTotal}`);
log(`   of those, HAVE a legal improving flip:    ${firstRoundCapWithFlip}  = ${((100 * firstRoundCapWithFlip) / Math.max(1, firstRoundCapTotal)).toFixed(1)}%`);

// ── 4. AFTER
log('');
const after = census('AFTER ');
log('');
log('DELTA');
log(`   caps >=${CAP} deg   ${before.nCap} -> ${after.nCap}   (${(before.nCap / Math.max(1, after.nCap)).toFixed(2)}x)`);
log(`   caps >=165 deg   ${before.nCap165} -> ${after.nCap165}   (${(before.nCap165 / Math.max(1, after.nCap165)).toFixed(2)}x)`);
log(`   tangExc >10um    ${before.nTang10} -> ${after.nTang10}   (${(before.nTang10 / Math.max(1, after.nTang10)).toFixed(2)}x)`);
log(`   tangExc p99      ${pq(before.tang, 0.99).toFixed(2)} -> ${pq(after.tang, 0.99).toFixed(2)} um   (${(pq(before.tang, 0.99) / Math.max(1e-9, pq(after.tang, 0.99))).toFixed(2)}x)`);
log(`   tangExc max      ${before.tangMax.toFixed(1)} -> ${after.tangMax.toFixed(1)} um`);
log(`   total flips ${totalFlips} = ${((100 * totalFlips) / nTri).toFixed(2)}% of facet-pairs; VERTICES MOVED: 0; TRIANGLES ADDED: 0`);

// ── 5. NON-VACUOUS TOPOLOGY CHECK — a flip must preserve every edge's incidence count
{
  const em = buildEdges();
  let b = 0; let nm = 0;
  for (const l of em.values()) { if (l.length === 1) b += 1; else if (l.length > 2) nm += 1; }
  log(`   topology after: ${em.size} edges, boundary ${b} (was ${boundaryEdges}), non-manifold ${nm} (was ${nonManEdges})`);
  log(`   ${b === boundaryEdges && nm === nonManEdges ? '*** watertightness class PRESERVED ***' : '*** TOPOLOGY CHANGED — the flip pass is unsound as written ***'}`);
}

// ── 6. write the flipped mesh for inspection (a NEW file; nothing in the pipeline is touched)
mkdirSync(OUTDIR, { recursive: true });
{
  const P = new Float32Array(nTri * 9);
  const I = new Uint32Array(nTri * 3);
  for (let t = 0; t < nTri; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const v = tri[3 * t + e];
      P[9 * t + 3 * e] = VX[v]; P[9 * t + 3 * e + 1] = VY[v]; P[9 * t + 3 * e + 2] = VZ[v];
      I[3 * t + e] = 3 * t + e;
    }
  }
  writeBinarySTL(`${OUTDIR}/${TAG}_flipped_${CRIT}.stl`, P, I);
  log(`   flipped mesh written to ${OUTDIR}/${TAG}_flipped_${CRIT}.stl (inspection only)`);
}
log('');
log('done');

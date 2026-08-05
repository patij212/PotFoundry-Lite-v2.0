// s90CollapseCensus.ts — WHAT ARE THE 124,245 MIS-ORIENTED FACETS, GEOMETRICALLY? READ-ONLY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S66 split the orientation defect into two mechanisms by `aspect3 := diam / minAlt`:
//
//     Voronoi V-before   MIS-ORIENTED (aspect3 >= 50)  124,245 facets   98.31% over the 10 um chord bar
//                        TURNING      (aspect3 <  50)  682,520 facets   29.05% over
//     after the constrained flip                       120,520          97.14%      <- essentially UNMOVED
//                                                      686,245          18.14%      <- 1.60x better
//
// A flip re-cuts a diagonal; it cannot repair a facet whose own SHAPE is the defect. Three levers are
// already measured DEAD for the MIS-ORIENTED class and are not re-derived here:
//   * CONNECTIVITY  — the exact min-max retriangulation of a hexagon cavity (the flip is its k=4 case)
//                     buys 3.29% over the flip (S63).
//   * DENSITY       — one round of longest-edge bisection makes orientation 55% WORSE at +29% triangles
//                     (S65); the inserted on-surface vertex sits off the old plane by the position sag `s`
//                     and rotates each child by ~ s/h.
//   * THE AR CAP    — PF_CB_SHAPE_AR 50->90 moves orientation by ~nothing (S72); crushing Euclidean
//                     maxAngle 20.5x made orientation 5.5x WORSE.
// So the remaining lever must change the VERTEX SET (collapse / re-point / local re-mesh). Nobody has
// tried it, and NOBODY HAS LOOKED AT THE CLASS. This file looks, before any arm is spent.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED — WRITTEN BEFORE THE FIRST RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H-A1 TAXONOMY. The class is NEEDLES (one short edge, two long: `e0/e2 <= 0.1`), not CAPS.
//      KILL: if needles are < 50% of the class, an edge collapse (which needs a short edge to remove)
//      addresses less than half of it and the ceiling must be quoted against the needle subset only.
//
// H-A2 AREA. The class is a small fraction of the SURFACE. Report area-weighted throughout: S70 measured
//      that facet COUNT over-states mis-oriented AREA by 12.96x on this style (13.0x at 5 deg; the brief's
//      23.96x is the GothicArches row). No kill — this is the denominator every later claim is quoted in,
//      and quoting a count without it is the error this line exists to prevent.
//
// H-A3 CLUSTERING. The class is spatially clustered — it lies in connected runs along Voronoi cell walls,
//      not scattered. MEASURE: connected components of the dual (edge-adjacency) subgraph induced by the
//      class, against a RANDOM subset of the same cardinality drawn from the same mesh (non-vacuous
//      control — the control must move the number).
//      KILL: if (mean component size of the class) / (mean component size of the random control) < 1.5,
//      the class is scattered, a local re-mesh has no purchase, and only per-facet operations remain.
//
// H-A4 ALIGNMENT. The needles run ALONG the wall (their long axis perpendicular to the surface gradient),
//      which is the classical GOOD anisotropy, or ACROSS it, which is the bad one. MEASURE: the angle
//      between the facet's longest edge and grad-r in the arc-length parameter plane.
//      KILL: none — this is a diagnosis, and both answers are informative. Predicted: ALONG (>60 deg)
//      for the majority, because a wall is a 1-D locus and the mesher's sizing field is isotropic.
//
// H-A5 THE FIN TEST (from the coordinator's H1/H2 note, 2026-08-05). A facet with LARGE H1 (points ON THE
//      FACET are far from the surface) and SMALL H2 (points ON THE SURFACE all have some facet nearby) is
//      REDUNDANT GEOMETRY STANDING OFF THE WALL — a fin — rather than missing coverage. That is the exact
//      geometry a collapse deletes for free and a refinement cannot touch.
//      MEASURE, on a sample: H1 = `certifyTriangle` (facet -> surface, tol = the 10 um product bar) and
//      H2loc = max over a lattice of SURFACE points in the facet's footprint of the distance to the
//      NEAREST facet in its 2-ring (surface -> mesh, restricted to a neighbourhood that provably contains
//      the nearest facet whenever H2loc is small).
//      KILL: if the class's H2loc p50 is within 2x of its H1 witnessed p50, these are NOT fins, the
//      surface is genuinely uncovered there, and deleting them would open a hole — which would refute the
//      collapse lever before a single collapse is attempted.
//
// EVERY NUMBER IS REPORTED BY COUNT AND BY AREA. The orientation key is the MONOTONE Gauss-map chord
// `2*sin(theta/2)*diam` (S66: `sin(theta)*diam` is non-monotone and scores an inverted facet at ~0).
// Position, where it is quoted at all, is `certifyTriangle` at tol = 0.010 — never the driver's plane
// ruler, which reports 0 over-bar on this mesh where certifyTriangle proves 396 of the top 400 FAIL.
//
// Usage:  bash research/tools/run-s90-collapse-census.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S90_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S90_STEM ?? 'voronoi_ring_D--';
const AR_SPLIT = envF('PF_S90_AR', 50);
const BAR_UM = envF('PF_S90_BAR_UM', 10);
const PHASE = process.env.PF_S90_PHASE ?? 'AB';
const FINK = Math.round(envF('PF_S90_FINK', 300));       // facets per group in the FIN test
const TOL = envF('PF_S90_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S90_NMAX', 512));
const OUT = 'research/exchange/_strataConformBisect/S90_CENSUS.ndjson';
const t00 = Date.now();
const el = (): string => `${((Date.now() - t00) / 1000).toFixed(1)}s`;
mkdirSync('research/exchange/_strataConformBisect', { recursive: true });
const ck = (o: unknown): void => { appendFileSync(OUT, `${JSON.stringify({ ts: Date.now(), style: STYLE, stem: STEM, ...(o as object) })}\n`); };

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const pq = (a: ArrayLike<number>, f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const sortA = (a: number[]): Float64Array => Float64Array.from(a).sort();
const fmt = (a: ArrayLike<number>, u = 1): string => (a.length === 0 ? '(empty)'
  : `p01 ${(pq(a, 0.01) * u).toFixed(3)}  p10 ${(pq(a, 0.10) * u).toFixed(3)}  p50 ${(pq(a, 0.5) * u).toFixed(3)}  p90 ${(pq(a, 0.9) * u).toFixed(3)}  p99 ${(pq(a, 0.99) * u).toFixed(3)}  max ${(a[a.length - 1] * u).toFixed(3)}`);

log('===== S90 — CENSUS OF THE MIS-ORIENTED (aspect3 >= 50) CLASS =====');
log(`style ${STYLE}  stem ${STEM}  aspect3 split ${AR_SPLIT}  bar ${BAR_UM} um  phase ${PHASE}`);

const DIMS: StyleDims = { H: envF('PF_S90_H', 120), Rb: envF('PF_S90_RB', 40), Rt: envF('PF_S90_RT', 50), expn: 1 };
const H = DIMS.H;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
{
  const t = Date.now(); let acc = 0;
  for (let i = 0; i < 200000; i += 1) acc += rA((i * 0.0000173) % 6.28 - 3.14, (i * 0.00071) % H);
  log(`rA cost: ${(0.2 / ((Date.now() - t) / 1000)).toFixed(2)} M eval/s  (checksum ${acc.toFixed(3)})`);
}

// ── 1. READ + WELD (exact f32 compare — the STL round-trip is exact; same weld as s60/s61)
const path = `research/exchange/_strataConformBisect/${STEM}.stl`;
const { xyz, nTri } = readMeshFloat64(path, false);
const VXa = new Float64Array(nTri * 3); const VYa = new Float64Array(nTri * 3); const VZa = new Float64Array(nTri * 3);
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
let NV = 0;
{
  const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
  const map = new Map<number, number[]>();
  const corner = new Int32Array(3);
  for (let t = 0; t < nTri; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const i = t * 3 + e;
      const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
      f64[0] = x; f64[1] = y; f64[2] = z;
      let h = 2166136261;
      for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
      h >>>= 0;
      const b = map.get(h);
      let found = -1;
      if (b !== undefined) { for (const v of b) if (VXa[v] === x && VYa[v] === y && VZa[v] === z) { found = v; break; } }
      if (found < 0) { found = NV; VXa[NV] = x; VYa[NV] = y; VZa[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
      corner[e] = found;
    }
    ta[t] = corner[0]; tb[t] = corner[1]; tc[t] = corner[2];
  }
}
const VT = new Float64Array(NV);
for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VYa[v], VXa[v]);
log(`${path}: ${nTri} facets, welded to ${NV} vertices   [${el()}]`);

// instrument-validity gate: the mesher puts vertices ON the surface, so the rebuilt rA must agree
{
  const g: number[] = []; const st = Math.max(1, Math.floor(NV / 50000));
  for (let v = 0; v < NV; v += st) g.push(Math.abs(Math.hypot(VXa[v], VYa[v]) - rA(VT[v], VZa[v])));
  const s = sortA(g);
  log(`GATE vertex-on-surface: p50 ${pq(s, 0.5).toExponential(2)}  p99 ${pq(s, 0.99).toExponential(2)}  max ${s[s.length - 1].toExponential(2)} mm -> ${pq(s, 0.99) <= 0.05 ? 'TRUSTED' : '*** UNTRUSTED ***'}`);
}

// ── 2. PER-FACET GEOMETRY + THE LEGACY CLASS DEFINITION (reproduce 124,245 exactly)
const AR = new Float64Array(nTri); const AREA = new Float64Array(nTri);
const E0 = new Float64Array(nTri); const E1 = new Float64Array(nTri); const E2 = new Float64Array(nTri);
const DEG = new Float64Array(nTri);      // orientation angle at the centroid (legacy central-FD normal)
const CHD = new Float64Array(nTri);      // MONOTONE key 2*sin(th/2)*diam, um
const GRADA = new Float64Array(nTri);    // angle(longest edge, grad r) in the arc-length plane, deg
const GRADM = new Float64Array(nTri);    // |grad r| (dimensionless slope) at the centroid
const ZC = new Float64Array(nTri);
{
  const tS = Date.now();
  for (let t = 0; t < nTri; t += 1) {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
    const bx = VXa[b]; const by = VYa[b]; const bz = VZa[b];
    const cx = VXa[c]; const cy = VYa[c]; const cz = VZa[c];
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz);
    AREA[t] = fl / 2;
    const la = Math.hypot(bx - cx, by - cy, bz - cz);
    const lb = Math.hypot(ax - cx, ay - cy, az - cz);
    const lc = Math.hypot(ax - bx, ay - by, az - bz);
    const s3 = [la, lb, lc].sort((p, q) => p - q);
    E0[t] = s3[0]; E1[t] = s3[1]; E2[t] = s3[2];
    const diam = s3[2];
    const minAlt = fl / Math.max(1e-300, diam);
    AR[t] = diam / Math.max(1e-300, minAlt);
    if (fl < 1e-18) { DEG[t] = NaN; CHD[t] = NaN; GRADA[t] = NaN; continue; }
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thA = VT[a];
    const dB = dThRaw(thA, VT[b]); const dC = dThRaw(thA, VT[c]);
    const thc = thA + (dB + dC) / 3;
    const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3)); ZC[t] = zc;
    const r = rA(thc, zc);
    const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const ang = Math.acos(dot);
    DEG[t] = (ang * 180) / Math.PI;
    CHD[t] = 2 * Math.sin(ang / 2) * diam * 1000;
    // H-A4: longest edge vs grad r, both in the arc-length (r*dtheta, dz) parameter plane
    const gth = rTh / Math.max(1e-9, r);            // d r / d(arc)   along theta
    const gz = rZ;                                  // d r / dz
    const gl = Math.hypot(gth, gz); GRADM[t] = gl;
    // the longest edge, as (r*dtheta, dz)
    let pu = 0; let pv = 0;
    if (diam === la) { pu = r * dThRaw(VT[b], VT[c]); pv = cz - bz; } else if (diam === lb) { pu = r * dThRaw(VT[a], VT[c]); pv = cz - az; } else { pu = r * dThRaw(VT[a], VT[b]); pv = bz - az; }
    const pl = Math.hypot(pu, pv);
    if (gl > 1e-12 && pl > 1e-12) {
      let cd = Math.abs((pu * gth + pv * gz) / (pl * gl)); cd = cd > 1 ? 1 : cd;
      GRADA[t] = (Math.acos(cd) * 180) / Math.PI;    // 0 = long axis ACROSS the wall, 90 = ALONG it
    } else GRADA[t] = NaN;
  }
  log(`per-facet geometry + legacy orientation: ${((Date.now() - tS) / 1000).toFixed(1)}s   [${el()}]`);
}

// ── 3. THE CLASS
const MIS: number[] = []; const TURN: number[] = [];
let areaTot = 0; let areaMis = 0; let overMis = 0; let overTurn = 0; let areaOverAll = 0;
for (let t = 0; t < nTri; t += 1) {
  areaTot += AREA[t];
  if (AR[t] >= AR_SPLIT) { MIS.push(t); areaMis += AREA[t]; if (CHD[t] > BAR_UM) overMis += 1; } else { TURN.push(t); if (CHD[t] > BAR_UM) overTurn += 1; }
  if (CHD[t] > BAR_UM) areaOverAll += AREA[t];
}
log('');
log(`── THE SPLIT (legacy centroid ruler, monotone chord key) ──`);
log(`   MIS-ORIENTED aspect3>=${AR_SPLIT}: ${MIS.length} facets (${((100 * MIS.length) / nTri).toFixed(3)}% of count)  ${areaMis.toFixed(2)} mm2 (${((100 * areaMis) / areaTot).toFixed(4)}% of AREA)   over-bar ${overMis} (${((100 * overMis) / Math.max(1, MIS.length)).toFixed(2)}%)`);
log(`   TURNING      aspect3< ${AR_SPLIT}: ${TURN.length} facets (${((100 * TURN.length) / nTri).toFixed(3)}%)  ${(areaTot - areaMis).toFixed(2)} mm2 (${((100 * (areaTot - areaMis)) / areaTot).toFixed(4)}%)   over-bar ${overTurn} (${((100 * overTurn) / Math.max(1, TURN.length)).toFixed(2)}%)`);
log(`   *** H-A2: the MIS class is ${((100 * areaMis) / areaTot).toFixed(4)}% OF THE SURFACE and ${((100 * MIS.length) / nTri).toFixed(3)}% of the facets -> count over-states area ${(((MIS.length / nTri)) / Math.max(1e-12, areaMis / areaTot)).toFixed(2)}x ***`);
log(`   total surface ${areaTot.toFixed(1)} mm2;  area over the orientation bar (whole mesh) ${((100 * areaOverAll) / areaTot).toFixed(3)}%`);
ck({ phase: 'split', nTri, NV, mis: MIS.length, turn: TURN.length, areaTot, areaMis, overMis, overTurn, areaOverAll });

// ── 4. H-A1 TAXONOMY + the size distributions
{
  const sel = (arr: Float64Array, idx: number[]): Float64Array => { const o = new Float64Array(idx.length); for (let i = 0; i < idx.length; i += 1) o[i] = arr[idx[i]]; return o.sort(); };
  let needle = 0; let cap = 0; let needleArea = 0; let capArea = 0;
  const maxAng: number[] = [];
  for (const t of MIS) {
    const isNeedle = E0[t] / Math.max(1e-300, E2[t]) <= 0.1;
    if (isNeedle) { needle += 1; needleArea += AREA[t]; } else { cap += 1; capArea += AREA[t]; }
    // largest angle, from the sorted sides (opposite the longest edge)
    const v = (E0[t] * E0[t] + E1[t] * E1[t] - E2[t] * E2[t]) / (2 * Math.max(1e-300, E0[t] * E1[t]));
    maxAng.push((Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI);
  }
  const sMA = sortA(maxAng);
  log('');
  log(`── H-A1 TAXONOMY of the ${MIS.length} MIS facets ──`);
  log(`   NEEDLE (e0/e2 <= 0.1): ${needle} (${((100 * needle) / Math.max(1, MIS.length)).toFixed(2)}% of count, ${((100 * needleArea) / Math.max(1e-30, areaMis)).toFixed(2)}% of class area)`);
  log(`   CAP    (e0/e2 >  0.1): ${cap} (${((100 * cap) / Math.max(1, MIS.length)).toFixed(2)}% of count, ${((100 * capArea) / Math.max(1e-30, areaMis)).toFixed(2)}% of class area)`);
  log(`   *** H-A1 ${needle / Math.max(1, MIS.length) >= 0.5 ? 'CONFIRMED — needles dominate; an edge collapse has a short edge to remove' : 'REFUTED — the class is NOT majority needles; quote any collapse ceiling against the needle subset only'} ***`);
  log(`   largest interior angle (deg): ${fmt(sMA)}`);
  log(`   e0 shortest edge (um): ${fmt(sel(E0, MIS), 1000)}`);
  log(`   e1 middle   edge (um): ${fmt(sel(E1, MIS), 1000)}`);
  log(`   e2 longest  edge (um): ${fmt(sel(E2, MIS), 1000)}`);
  log(`   minAlt          (um): ${fmt(sortA(MIS.map((t) => (2 * AREA[t]) / Math.max(1e-300, E2[t]))), 1000)}`);
  log(`   aspect3             : ${fmt(sel(AR, MIS))}`);
  log(`   area          (um^2): ${fmt(sel(AREA, MIS), 1e6)}`);
  log(`   orientation   (deg) : ${fmt(sel(DEG, MIS))}`);
  log(`   chord key      (um) : ${fmt(sel(CHD, MIS))}`);
  log(`   CONTROL (TURNING class, same statistics)`);
  const stride = Math.max(1, Math.floor(TURN.length / 200000));
  const tSub = TURN.filter((_v, i) => i % stride === 0);
  log(`   e0 (um): ${fmt(sel(E0, tSub), 1000)}`);
  log(`   e2 (um): ${fmt(sel(E2, tSub), 1000)}`);
  log(`   aspect3: ${fmt(sel(AR, tSub))}`);
  log(`   orient (deg): ${fmt(sel(DEG, tSub))}`);
  ck({
    phase: 'taxonomy', needle, cap, needleArea, capArea,
    e0p50: pq(sel(E0, MIS), 0.5), e2p50: pq(sel(E2, MIS), 0.5), arP50: pq(sel(AR, MIS), 0.5),
    maxAngP50: pq(sMA, 0.5), degP50: pq(sel(DEG, MIS), 0.5),
  });
}

// ── 5. CSR EDGE TABLE (no Map — the V8 16.7M-entry cap is a documented killer on meshes this size)
//    For every undirected edge (u<v) we store the incident facets. Built by counting sort on u.
const vcount = new Int32Array(NV + 1);
for (let t = 0; t < nTri; t += 1) {
  const v3 = [ta[t], tb[t], tc[t]];
  for (let e = 0; e < 3; e += 1) { const u = v3[e]; const w = v3[(e + 1) % 3]; vcount[u < w ? u : w] += 1; }
}
const voff = new Int32Array(NV + 1);
for (let v = 0; v < NV; v += 1) voff[v + 1] = voff[v] + vcount[v];
const eOther = new Int32Array(voff[NV]); const eFace = new Int32Array(voff[NV]);
{
  const cur = voff.slice(0, NV);
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const u = v3[e]; const w = v3[(e + 1) % 3];
      const lo = u < w ? u : w; const hi = u < w ? w : u;
      const p = cur[lo]; cur[lo] += 1; eOther[p] = hi; eFace[p] = t;
    }
  }
  // sort each vertex's bucket by `other` so equal edges are adjacent
  for (let v = 0; v < NV; v += 1) {
    const s = voff[v]; const e = voff[v + 1];
    for (let i = s + 1; i < e; i += 1) {
      const ko = eOther[i]; const kf = eFace[i]; let j = i - 1;
      while (j >= s && eOther[j] > ko) { eOther[j + 1] = eOther[j]; eFace[j + 1] = eFace[j]; j -= 1; }
      eOther[j + 1] = ko; eFace[j + 1] = kf;
    }
  }
}
log('');
log(`CSR edge table: ${voff[NV]} directed corner-edges   [${el()}]`);
// topology audit by INDEX (non-vacuous: a boundary count of 0 on a ring would be the tell that it is wrong)
let nEdges = 0; let nBnd = 0; let nNonMan = 0;
{
  for (let v = 0; v < NV; v += 1) {
    let i = voff[v];
    while (i < voff[v + 1]) {
      let j = i; while (j < voff[v + 1] && eOther[j] === eOther[i]) j += 1;
      nEdges += 1; const d = j - i;
      if (d === 1) nBnd += 1; else if (d > 2) nNonMan += 1;
      i = j;
    }
  }
  log(`TOPOLOGY (by welded index): edges ${nEdges}   boundary ${nBnd}   non-manifold ${nNonMan}   Euler V-E+F = ${NV - nEdges + nTri}`);
  ck({ phase: 'topology', NV, nEdges, nTri, nBnd, nNonMan, euler: NV - nEdges + nTri });
}

// ── 6. H-A3 CLUSTERING — connected components of the dual subgraph induced by a facet set
function components(setFlag: Uint8Array): { n: number; mean: number; max: number; hist: Record<string, number> } {
  const comp = new Int32Array(nTri).fill(-1);
  const stack: number[] = [];
  const sizes: number[] = [];
  const nbrs: number[] = [];
  const neighboursOf = (t: number): void => {
    nbrs.length = 0;
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const u = v3[e]; const w = v3[(e + 1) % 3];
      const lo = u < w ? u : w; const hi = u < w ? w : u;
      for (let i = voff[lo]; i < voff[lo + 1]; i += 1) {
        if (eOther[i] !== hi) continue;
        if (eFace[i] !== t) nbrs.push(eFace[i]);
      }
    }
  };
  let nc = 0;
  for (let s = 0; s < nTri; s += 1) {
    if (setFlag[s] === 0 || comp[s] >= 0) continue;
    comp[s] = nc; stack.length = 0; stack.push(s); let sz = 0;
    while (stack.length > 0) {
      const t = stack.pop() as number; sz += 1;
      neighboursOf(t);
      for (const q of nbrs) if (setFlag[q] === 1 && comp[q] < 0) { comp[q] = nc; stack.push(q); }
    }
    sizes.push(sz); nc += 1;
  }
  const s = sortA(sizes);
  const hist: Record<string, number> = { '1': 0, '2': 0, '3-5': 0, '6-20': 0, '21-100': 0, '>100': 0 };
  let tot = 0;
  for (const v of sizes) {
    tot += v;
    if (v === 1) hist['1'] += 1; else if (v === 2) hist['2'] += 1; else if (v <= 5) hist['3-5'] += 1;
    else if (v <= 20) hist['6-20'] += 1; else if (v <= 100) hist['21-100'] += 1; else hist['>100'] += 1;
  }
  return { n: nc, mean: tot / Math.max(1, nc), max: s.length > 0 ? s[s.length - 1] : 0, hist };
}
{
  const flagMis = new Uint8Array(nTri);
  for (const t of MIS) flagMis[t] = 1;
  const cM = components(flagMis);
  // NON-VACUOUS CONTROL: a random subset of the same cardinality from the same mesh
  const flagRnd = new Uint8Array(nTri);
  {
    let rng = 987654321; const rnd = (): number => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
    let placed = 0;
    while (placed < MIS.length) { const t = Math.floor(rnd() * nTri); if (flagRnd[t] === 0) { flagRnd[t] = 1; placed += 1; } }
  }
  const cR = components(flagRnd);
  const ratio = cM.mean / Math.max(1e-9, cR.mean);
  log('');
  log(`── H-A3 CLUSTERING (dual connected components of the class) ──`);
  log(`   MIS class      : ${cM.n} components, mean size ${cM.mean.toFixed(3)}, max ${cM.max}   hist ${JSON.stringify(cM.hist)}`);
  log(`   RANDOM control : ${cR.n} components, mean size ${cR.mean.toFixed(3)}, max ${cR.max}   hist ${JSON.stringify(cR.hist)}`);
  log(`   *** H-A3 ratio ${ratio.toFixed(3)}x  -> ${ratio >= 1.5 ? 'CONFIRMED: the class is CLUSTERED; a local re-mesh has purchase' : 'REFUTED: the class is SCATTERED; only per-facet operations remain'} (kill < 1.5x) ***`);
  ck({ phase: 'clustering', mis: cM, rnd: cR, ratio });
}

// ── 7. H-A4 ALIGNMENT + where the class sits
{
  const g: number[] = []; const gm: number[] = []; const zz: number[] = [];
  for (const t of MIS) { if (Number.isFinite(GRADA[t])) g.push(GRADA[t]); gm.push(GRADM[t]); zz.push(ZC[t]); }
  const sg = sortA(g); const sgm = sortA(gm); const szz = sortA(zz);
  let along = 0; let across = 0;
  for (const v of g) { if (v >= 60) along += 1; else if (v <= 30) across += 1; }
  // control
  const stride = Math.max(1, Math.floor(TURN.length / 100000));
  const cg: number[] = []; const cgm: number[] = [];
  for (let i = 0; i < TURN.length; i += stride) { const t = TURN[i]; if (Number.isFinite(GRADA[t])) cg.push(GRADA[t]); cgm.push(GRADM[t]); }
  log('');
  log(`── H-A4 ALIGNMENT — angle(longest edge, grad r) in the arc-length plane; 0 = ACROSS the wall, 90 = ALONG it ──`);
  log(`   MIS class     : ${fmt(sg)}   ALONG(>=60deg) ${along} (${((100 * along) / Math.max(1, g.length)).toFixed(2)}%)   ACROSS(<=30deg) ${across} (${((100 * across) / Math.max(1, g.length)).toFixed(2)}%)`);
  log(`   TURNING ctrl  : ${fmt(sortA(cg))}`);
  log(`   |grad r| at the centroid — MIS: ${fmt(sgm)}`);
  log(`   |grad r| at the centroid — ctrl: ${fmt(sortA(cgm))}`);
  log(`   z of the class (mm, H=${H}): ${fmt(szz)}`);
  ck({ phase: 'alignment', along, across, n: g.length, gradAP50: pq(sg, 0.5), gradMP50: pq(sgm, 0.5), ctrlGradMP50: pq(sortA(cgm), 0.5) });
}

// ── 8. H-A5 THE FIN TEST — H1 (facet -> surface, certifyTriangle) vs H2loc (surface -> local 2-ring)
if (PHASE.includes('B')) {
  const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
  log('');
  log(`── H-A5 FIN TEST (n=${FINK} per group, tol ${TOL * 1000} um, nMax ${NMAX})   zJumps ${zJ.length} thJumps ${thJ.length} ──`);
  // 2-ring facet set of a facet: all facets incident to any of its three vertices, plus their edge-neighbours
  const vfCount = new Int32Array(NV + 1);
  for (let t = 0; t < nTri; t += 1) { vfCount[ta[t]] += 1; vfCount[tb[t]] += 1; vfCount[tc[t]] += 1; }
  const vfOff = new Int32Array(NV + 1);
  for (let v = 0; v < NV; v += 1) vfOff[v + 1] = vfOff[v] + vfCount[v];
  const vfList = new Int32Array(vfOff[NV]);
  { const cur = vfOff.slice(0, NV); for (let t = 0; t < nTri; t += 1) { for (const v of [ta[t], tb[t], tc[t]]) { vfList[cur[v]] = t; cur[v] += 1; } } }
  const ptTri = (px: number, py: number, pz: number, t: number): number => {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
    const abx = VXa[b] - ax; const aby = VYa[b] - ay; const abz = VZa[b] - az;
    const acx = VXa[c] - ax; const acy = VYa[c] - ay; const acz = VZa[c] - az;
    const apx = px - ax; const apy = py - ay; const apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz; const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
    const bpx = px - VXa[b]; const bpy = py - VYa[b]; const bpz = pz - VZa[b];
    const d3 = abx * bpx + aby * bpy + abz * bpz; const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const w = d1 / Math.max(1e-300, d1 - d3); return Math.hypot(apx - w * abx, apy - w * aby, apz - w * abz); }
    const cpx = px - VXa[c]; const cpy = py - VYa[c]; const cpz = pz - VZa[c];
    const d5 = abx * cpx + aby * cpy + abz * cpz; const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / Math.max(1e-300, d2 - d6); return Math.hypot(apx - w * acx, apy - w * acy, apz - w * acz); }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / Math.max(1e-300, (d4 - d3) + (d5 - d6)); return Math.hypot(px - (VXa[b] + w * (VXa[c] - VXa[b])), py - (VYa[b] + w * (VYa[c] - VYa[b])), pz - (VZa[b] + w * (VZa[c] - VZa[b]))); }
    const den = 1 / Math.max(1e-300, va + vb + vc); const v = vb * den; const w = vc * den;
    return Math.hypot(apx - v * abx - w * acx, apy - v * aby - w * acy, apz - v * abz - w * acz);
  };
  const KH2 = 6;
  const finGroup = (idxs: number[], label: string): Record<string, number> => {
    const h1: number[] = []; const h2: number[] = []; const h2self: number[] = [];
    let nFail = 0; let nPass = 0; let nUnk = 0;
    const tg = Date.now();
    const seen = new Set<number>();
    for (const t of idxs) {
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const v = certifyTriangle(rA, VXa[a], VYa[a], VZa[a], VXa[b], VYa[b], VZa[b], VXa[c], VYa[c], VZa[c],
        { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
      h1.push(v.witnessed * 1000);
      if (v.witnessed > TOL) nFail += 1; else if (v.certified) nPass += 1; else nUnk += 1;
      // local 2-ring
      seen.clear(); const ring: number[] = [];
      for (const vv of [a, b, c]) for (let i = vfOff[vv]; i < vfOff[vv + 1]; i += 1) { const q = vfList[i]; if (!seen.has(q)) { seen.add(q); ring.push(q); } }
      const ring2: number[] = ring.slice();
      for (const q of ring) for (const vv of [ta[q], tb[q], tc[q]]) for (let i = vfOff[vv]; i < vfOff[vv + 1]; i += 1) { const w = vfList[i]; if (!seen.has(w)) { seen.add(w); ring2.push(w); } }
      // lattice of SURFACE points over the facet's parameter footprint
      const thA = VT[a]; const thB = thA + dThRaw(thA, VT[b]); const thC = thA + dThRaw(thA, VT[c]);
      let worst = 0; let worstSelf = 0;
      for (let i = 0; i <= KH2; i += 1) {
        for (let j = 0; i + j <= KH2; j += 1) {
          const wa = i / KH2; const wb = j / KH2; const wc = 1 - wa - wb;
          const th = wa * thA + wb * thB + wc * thC;
          const z = Math.min(H, Math.max(0, wa * VZa[a] + wb * VZa[b] + wc * VZa[c]));
          const rr = rA(th, z);
          const qx = rr * Math.cos(th); const qy = rr * Math.sin(th); const qz = z;
          let dmin = Infinity;
          for (const q of ring2) { const d = ptTri(qx, qy, qz, q); if (d < dmin) dmin = d; }
          if (dmin > worst) worst = dmin;
          const ds = ptTri(qx, qy, qz, t); if (ds > worstSelf) worstSelf = ds;
        }
      }
      h2.push(worst * 1000); h2self.push(worstSelf * 1000);
    }
    const s1 = sortA(h1); const s2 = sortA(h2); const s2s = sortA(h2self);
    log(`   ── ${label} (n=${idxs.length}, ${((Date.now() - tg) / 1000).toFixed(1)}s)`);
    log(`      H1 certifyTriangle witnessed (facet->surface, um): ${fmt(s1)}`);
    log(`      H1 VERDICT at ${(TOL * 1000).toFixed(0)} um: PROVEN-FAIL ${nFail}  PROVEN-PASS ${nPass}  UNKNOWN ${nUnk}`);
    log(`      H2loc (surface -> 2-ring incl. self, um): ${fmt(s2)}`);
    log(`      H2self (surface -> THIS facet only, um) : ${fmt(s2s)}`);
    log(`      *** FIN RATIO H1p50 / H2locp50 = ${(pq(s1, 0.5) / Math.max(1e-9, pq(s2, 0.5))).toFixed(2)}x  (>=2 => FIN: redundant geometry, deletable; <2 => real uncovered surface) ***`);
    return { n: idxs.length, h1p50: pq(s1, 0.5), h1p99: pq(s1, 0.99), h1max: s1[s1.length - 1], h2p50: pq(s2, 0.5), h2p99: pq(s2, 0.99), h2max: s2[s2.length - 1], h2selfP50: pq(s2s, 0.5), nFail, nPass, nUnk };
  };
  const pick = (pool: number[], k: number): number[] => {
    const out: number[] = []; const st = Math.max(1, Math.floor(pool.length / k));
    for (let i = 0; i < pool.length && out.length < k; i += st) out.push(pool[i]);
    return out;
  };
  const gMis = finGroup(pick(MIS, FINK), 'MIS-ORIENTED class');
  ck({ phase: 'fin', group: 'mis', ...gMis });
  const gTurn = finGroup(pick(TURN, FINK), 'TURNING control');
  ck({ phase: 'fin', group: 'turn', ...gTurn });
  log('');
  log(`   *** H-A5: MIS H1 ${gMis.h1p50.toFixed(2)} um vs H2loc ${gMis.h2p50.toFixed(2)} um = ${(gMis.h1p50 / Math.max(1e-9, gMis.h2p50)).toFixed(2)}x   ${gMis.h1p50 / Math.max(1e-9, gMis.h2p50) >= 2 ? 'CONFIRMED — the class is FINS' : 'REFUTED — the surface there is genuinely uncovered'} ***`);
  log(`   (control TURNING: H1 ${gTurn.h1p50.toFixed(2)} / H2loc ${gTurn.h2p50.toFixed(2)} = ${(gTurn.h1p50 / Math.max(1e-9, gTurn.h2p50)).toFixed(2)}x)`);
}

log('');
log(`done   [${el()}]   checkpoints in ${OUT}`);

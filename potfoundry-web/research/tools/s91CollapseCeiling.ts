// s91CollapseCeiling.ts — THE CEILING: what fraction of the MIS-ORIENTED class can a VERTEX-SET change
// remove, without breaking topology and without pushing honest POSITION over the 10 um product bar?
// READ-ONLY (no mesh is written; every operation is evaluated on scratch and rolled back).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT S90 ESTABLISHED, AND WHY IT DICTATES THE OPERATION TESTED HERE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The 124,245 MIS-ORIENTED facets (aspect3 >= 50) on voronoi_ring_D-- are:
//   * 0.5920% of the SURFACE (242.52 of 40,968.5 mm^2) — count over-states area 26.02x;
//   * CAPS, not needles in the useful sense: largest interior angle p50 177.325 deg, p10 168.650;
//   * median 788.8 um long and 2.795 um tall (minAlt p10 0.289, p90 10.542, p99 18.422 um);
//   * clustered 30.1x above chance (3,176 components, max 7,019 facets);
//   * lying ACROSS the wall (59.6% within 30 deg of grad r) on flank 2.5x steeper than the mesh average.
//
// A cap with a 177 deg vertex is a vertex `a` sitting `minAlt` off the segment joining the other two.
// The operation that removes it is therefore NOT an edge flip (connectivity is exhausted: the exact
// hexagon-cavity DP bought 3.29% over the flip, S63) and NOT refinement (S65: +55% over-bar at +29%
// triangles). It is DELETING `a`. Two vertex-set operations are priced:
//
//   OP-A  HALF-EDGE COLLAPSE  v -> u, for each of the facet's 3 edges in both directions (6 candidates).
//         Both endpoints are already ON the surface (S90 gate: |r_mesh - rA| p99 9.54e-6 mm), so the
//         merged vertex is on the surface by construction and contributes no new vertex-position error.
//   OP-B  VERTEX REMOVAL + MIN-MAX RETRIANGULATION of the apex (the vertex opposite the longest edge).
//         Its 1-ring polygon is re-triangulated by an O(k^3) DP that MINIMISES THE MAXIMUM ORIENTATION
//         ERROR of the new facets — i.e. the objective is the ruler the class fails, not the position
//         ruler the driver already optimises. This is the "delete-and-retriangulate with the vertex
//         chosen to minimise orientation" the brief asks for, in its strongest (exact-DP) form.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED — WRITTEN BEFORE THE FIRST RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H-B0 THE FREE NECESSARY CONDITION. Deleting apex `a` replaces it with the chord between its neighbours,
//      and `a` lies `minAlt` off the LONG EDGE of the facet, ON the surface. So the position error the
//      deletion introduces along that edge is AT LEAST `minAlt`. `minAlt <= 10 um` is therefore a
//      NECESSARY condition for an admissible deletion and is exact and free on all 124,245.
//      This bounds the ceiling from ABOVE before any operation is attempted. REPORT by count AND area.
//
// H-B1 THE TOPOLOGY+SHAPE CEILING (all 124,245, no position). A facet is L2-REACHABLE if some candidate
//      operation is (L0) topologically admissible — link condition, no boundary vertex moved, no facet
//      folded or inverted, no duplicate facet — AND (L1) creates no NEW facet with aspect3 >= 50 — AND
//      (L2) leaves every new facet at or under the 10 um MONOTONE orientation chord bar.
//      KILL: if the L2 fraction (BY AREA) is < 20%, the vertex-set lever is REFUTED as the general
//      remedy for this class and the class needs a different representation. That verdict would be
//      decisive and is stated here so it cannot be softened afterwards.
//
// H-B2 THE POSITION PRICE (sample of L2 survivors). `certifyTriangle` at tol = 0.010 on every affected
//      facet, BEFORE and AFTER.
//        * ABSOLUTE      : AFTER max witnessed <= 10 um.
//        * NO-REGRESSION : AFTER max <= max(10 um, BEFORE max over the same patch).  <- PRIMARY, because
//          the BEFORE mesh ALREADY FAILS 10 um at exactly these facets (audTruePos: 396 of the top 400
//          by tangExc are PROVEN-FAIL, witnessed p50 26.56 um, while the driver's plane ruler reports 0).
//          Requiring an operation to reach a bar the input does not meet would refute it for the input's
//          defect, not its own.
//      KILL: if NO-REGRESSION holds on < 50% of L2 survivors, position is the binding constraint and the
//      ceiling collapses to that product.
//
// THE CEILING = L2 fraction x no-regression fraction, quoted BY COUNT AND BY AREA, with the sampling n.
//
// Usage:  bash research/tools/run-s91-collapse-ceiling.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S91_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S91_STEM ?? 'voronoi_ring_D--';
const AR_SPLIT = envF('PF_S91_AR', 50);
const BAR_UM = envF('PF_S91_BAR_UM', 10);
const POSK = Math.round(envF('PF_S91_POSK', 120));      // L2 survivors sampled for the position price
const TOL = envF('PF_S91_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S91_NMAX', 512));
const STAGE = process.env.PF_S91_STAGE ?? '012';
const OUT = 'research/exchange/_strataConformBisect/S91_CEILING.ndjson';
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
  : `p10 ${(pq(a, 0.10) * u).toFixed(3)}  p50 ${(pq(a, 0.5) * u).toFixed(3)}  p90 ${(pq(a, 0.9) * u).toFixed(3)}  p99 ${(pq(a, 0.99) * u).toFixed(3)}  max ${(a[a.length - 1] * u).toFixed(3)}`);

log('===== S91 — THE VERTEX-SET CEILING FOR THE MIS-ORIENTED CLASS =====');
log(`style ${STYLE}  stem ${STEM}  aspect3>=${AR_SPLIT}  bar ${BAR_UM} um  stages ${STAGE}  posK ${POSK}`);

const DIMS: StyleDims = { H: envF('PF_S91_H', 120), Rb: envF('PF_S91_RB', 40), Rt: envF('PF_S91_RT', 50), expn: 1 };
const H = DIMS.H;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// ── 1. READ + WELD (identical to s90/s60 — exact f32 compare)
const path = `research/exchange/_strataConformBisect/${STEM}.stl`;
const { xyz, nTri } = readMeshFloat64(path, false);
const VX = new Float64Array(nTri * 3); const VY = new Float64Array(nTri * 3); const VZ = new Float64Array(nTri * 3);
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
let NV = 0;
{
  const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
  const map = new Map<number, number[]>(); const corner = new Int32Array(3);
  for (let t = 0; t < nTri; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const i = t * 3 + e;
      const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
      f64[0] = x; f64[1] = y; f64[2] = z;
      let h = 2166136261;
      for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
      h >>>= 0;
      const b = map.get(h); let found = -1;
      if (b !== undefined) { for (const v of b) if (VX[v] === x && VY[v] === y && VZ[v] === z) { found = v; break; } }
      if (found < 0) { found = NV; VX[NV] = x; VY[NV] = y; VZ[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
      corner[e] = found;
    }
    ta[t] = corner[0]; tb[t] = corner[1]; tc[t] = corner[2];
  }
}
const VT = new Float64Array(NV);
for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VY[v], VX[v]);
log(`${path}: ${nTri} facets, ${NV} welded vertices   [${el()}]`);

// ── 2. CSR: vertex -> incident facets
const vfOff = new Int32Array(NV + 1); const vfList = new Int32Array(3 * nTri);
{
  const cnt = new Int32Array(NV);
  for (let t = 0; t < nTri; t += 1) { cnt[ta[t]] += 1; cnt[tb[t]] += 1; cnt[tc[t]] += 1; }
  for (let v = 0; v < NV; v += 1) vfOff[v + 1] = vfOff[v] + cnt[v];
  const cur = vfOff.slice(0, NV);
  for (let t = 0; t < nTri; t += 1) for (const v of [ta[t], tb[t], tc[t]]) { vfList[cur[v]] = t; cur[v] += 1; }
}
// boundary vertices: an edge with exactly one incident facet
const isBnd = new Uint8Array(NV);
{
  const seen = new Map<number, number>(); const KEY = NV + 1;
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const u = v3[e]; const w = v3[(e + 1) % 3];
      const k = u < w ? u * KEY + w : w * KEY + u;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  let nb = 0;
  for (const [k, c] of seen) { if (c !== 2) { const u = Math.floor(k / KEY); const w = k - u * KEY; isBnd[u] = 1; isBnd[w] = 1; if (c === 1) nb += 1; } }
  let nbv = 0; for (let v = 0; v < NV; v += 1) nbv += isBnd[v];
  log(`edges ${seen.size}   boundary/non-manifold edges ${nb}   flagged vertices ${nbv}   [${el()}]`);
}

// ── 3. GEOMETRY HELPERS + THE TWO RULERS
const scratchN = new Float64Array(3);
/** unit surface normal at (th,z), outward, via central FD — 5 rA evals. */
function surfN(th: number, z: number): Float64Array {
  const zc = Math.min(H, Math.max(0, z));
  const r = rA(th, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(th + hTh, zc) - rA(th - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(th, zp) - rA(th, zm)) / (zp - zm) : 0;
  const cc = Math.cos(th); const ss = Math.sin(th);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1;
  scratchN[0] = nx / L; scratchN[1] = ny / L; scratchN[2] = nz / L;
  return scratchN;
}
interface FacetMetric { chdUm: number; ar: number; area: number; degOff: number }
/** MONOTONE orientation chord 2*sin(th/2)*diam (um) + aspect3 + area, for a triangle by vertex index. */
function metric(a: number, b: number, c: number): FacetMetric {
  const ax = VX[a]; const ay = VY[a]; const az = VZ[a];
  const bx = VX[b]; const by = VY[b]; const bz = VZ[b];
  const cx = VX[c]; const cy = VY[c]; const cz = VZ[c];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  if (!(fl > 1e-18)) return { chdUm: Infinity, ar: Infinity, area: 0, degOff: 180 };
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = VT[a];
  const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
  const n = surfN(thc, (az + bz + cz) / 3);
  let dot = fx * n[0] + fy * n[1] + fz * n[2]; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  const ang = Math.acos(dot);
  const minAlt = fl / Math.max(1e-300, diam);
  return { chdUm: 2 * Math.sin(ang / 2) * diam * 1000, ar: diam / Math.max(1e-300, minAlt), area: fl / 2, degOff: (ang * 180) / Math.PI };
}
/** raw geometric (unit) normal, winding order, written to `out`. Returns 2*area. */
function rawN(a: number, b: number, c: number, out: Float64Array): number {
  const ax = VX[a]; const ay = VY[a]; const az = VZ[a];
  const ux = VX[b] - ax; const uy = VY[b] - ay; const uz = VZ[b] - az;
  const wx = VX[c] - ax; const wy = VY[c] - ay; const wz = VZ[c] - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  if (L > 0) { out[0] = nx / L; out[1] = ny / L; out[2] = nz / L; } else { out[0] = 0; out[1] = 0; out[2] = 0; }
  return L;
}

// ── 4. THE CLASS (identical definition to S66/S90)
const MIS: number[] = []; const AREA = new Float64Array(nTri); const ARF = new Float64Array(nTri);
const APEX = new Int32Array(nTri); const MINALT = new Float64Array(nTri);
let areaTot = 0; let areaMis = 0;
{
  for (let t = 0; t < nTri; t += 1) {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    const la = Math.hypot(VX[b] - VX[c], VY[b] - VY[c], VZ[b] - VZ[c]);
    const lb = Math.hypot(VX[a] - VX[c], VY[a] - VY[c], VZ[a] - VZ[c]);
    const lc = Math.hypot(VX[a] - VX[b], VY[a] - VY[b], VZ[a] - VZ[b]);
    const diam = Math.max(la, lb, lc);
    const n = new Float64Array(3); const fl = rawN(a, b, c, n);
    AREA[t] = fl / 2; areaTot += fl / 2;
    const minAlt = fl / Math.max(1e-300, diam);
    MINALT[t] = minAlt;
    ARF[t] = diam / Math.max(1e-300, minAlt);
    APEX[t] = diam === la ? a : diam === lb ? b : c;   // the vertex OPPOSITE the longest edge = the ~180 deg corner
    if (ARF[t] >= AR_SPLIT) { MIS.push(t); areaMis += AREA[t]; }
  }
  log(`MIS class: ${MIS.length} facets, ${areaMis.toFixed(2)} mm2 of ${areaTot.toFixed(1)} (${((100 * areaMis) / areaTot).toFixed(4)}%)   [${el()}]`);
}

// ── 5. STAGE 0 — H-B0, the FREE necessary condition: minAlt <= bar
{
  let nOk = 0; let aOk = 0; const ma: number[] = [];
  for (const t of MIS) { ma.push(MINALT[t] * 1000); if (MINALT[t] * 1000 <= BAR_UM) { nOk += 1; aOk += AREA[t]; } }
  const s = sortA(ma);
  log('');
  log('── STAGE 0 (H-B0) — minAlt is a LOWER bound on the position error that deleting the apex introduces ──');
  log(`   minAlt (um): ${fmt(s)}`);
  log(`   *** minAlt <= ${BAR_UM} um on ${nOk}/${MIS.length} = ${((100 * nOk) / MIS.length).toFixed(2)}% BY COUNT   ${((100 * aOk) / Math.max(1e-30, areaMis)).toFixed(2)}% BY AREA ***`);
  log(`   -> the vertex-set ceiling CANNOT EXCEED this. Everything below is bounded by it.`);
  ck({ stage: 0, nMis: MIS.length, areaMis, areaTot, minAltOkN: nOk, minAltOkArea: aOk, minAltP50: pq(s, 0.5), minAltP90: pq(s, 0.9) });
}
if (!STAGE.includes('1')) { log(`\nstage 1 skipped   [${el()}]`); process.exit(0); }

// ── 6. STAGE 1 — the TOPOLOGY + SHAPE + ORIENTATION ceiling, on ALL of the class
//
// OP-B: remove vertex `a`, retriangulate the 1-ring polygon by an exact O(k^3) MIN-MAX DP whose cost is
//       the new facet's ORIENTATION chord (the ruler the class fails). Hard-rejected: a triangle that is
//       reflex in the tangent-plane projection (would leave the polygon), degenerate, or aspect3 >= AR.
// OP-A: half-edge collapse v -> u. Link condition; no boundary vertex moved; no surviving facet folded.
//
//
// *** A MEASUREMENT FLAW IN THE FIRST VERSION OF THIS FILE, FIXED HERE AND RECORDED RATHER THAN
// QUIETLY PATCHED. *** The first run folded the "creates no new aspect3>=50 facet" requirement INTO the
// DP's cost (Infinity on a capped triangle), so its refusal bucket read `no-valid-retriangulation=120000`
// — which conflated "this polygon has NO valid triangulation at all" with "every triangulation of it
// contains a sliver". Those are different claims and the second is the interesting one. The DP is now run
// TWICE per cavity, unconstrained both times:
//     mode 'chord'  -> min over triangulations of (max ORIENTATION chord)   -> exact existence test for LC
//     mode 'aspect' -> min over triangulations of (max aspect3)             -> exact existence test for LA
// and the only Infinity left is a genuinely impossible ear (reflex in the tangent-plane projection).
type RingOut = { ok: boolean; k: number; best: number; other: number; why: string; tris: number[] };
const ringCache = new Map<number, RingOut>();
const nb3 = new Float64Array(3); const nb4 = new Float64Array(3);

/** ordered 1-ring polygon of an interior manifold vertex, or null. */
function ringPolygon(a: number): number[] | null {
  if (isBnd[a] === 1) return null;
  const s = vfOff[a]; const e = vfOff[a + 1]; const k = e - s;
  if (k < 3) return null;
  const from = new Map<number, number>();
  for (let i = s; i < e; i += 1) {
    const t = vfList[i]; const v3 = [ta[t], tb[t], tc[t]];
    let p = -1; let q = -1;
    for (let j = 0; j < 3; j += 1) if (v3[j] === a) { p = v3[(j + 1) % 3]; q = v3[(j + 2) % 3]; }
    if (p < 0) return null;
    if (from.has(p)) return null;                 // not a simple fan
    from.set(p, q);
  }
  const poly: number[] = []; const start = from.keys().next().value as number;
  let cur = start;
  for (let i = 0; i < k; i += 1) { poly.push(cur); const nx = from.get(cur); if (nx === undefined) return null; cur = nx; }
  if (cur !== start || poly.length !== k) return null;
  return poly;
}

/**
 * EXACT min-max retriangulation of the 1-ring of `a` after deleting it.
 * `mode='chord'`  -> minimise the MAXIMUM orientation chord (um) over the new facets;
 * `mode='aspect'` -> minimise the MAXIMUM aspect3 over the new facets.
 * `best` is that minimised maximum; `other` is the value of the OTHER metric on the winning triangulation.
 */
function removeVertex(a: number, mode: 'chord' | 'aspect' = 'chord'): RingOut {
  const cacheKey = mode === 'chord' ? a : a + NV;
  const hit = ringCache.get(cacheKey); if (hit !== undefined) return hit;
  const fail = (why: string, k = 0): RingOut => { const o = { ok: false, k, best: Infinity, other: Infinity, why, tris: [] }; ringCache.set(cacheKey, o); return o; };
  const poly = ringPolygon(a);
  if (poly === null) return fail('not-interior-manifold-fan');
  const k = poly.length;
  if (k < 3) return fail('deg<3', k);
  if (k > 12) return fail('deg>12(cost cap)', k);
  // tangent-plane basis at `a` (area-weighted mean of the incident facet normals)
  let mx = 0; let my = 0; let mz = 0;
  for (let i = vfOff[a]; i < vfOff[a + 1]; i += 1) {
    const t = vfList[i]; const L = rawN(ta[t], tb[t], tc[t], nb3);
    const gx = (VX[ta[t]] + VX[tb[t]] + VX[tc[t]]) / 3; const gy = (VY[ta[t]] + VY[tb[t]] + VY[tc[t]]) / 3;
    const sgn = (nb3[0] * gx + nb3[1] * gy) < 0 ? -1 : 1;
    mx += sgn * nb3[0] * L; my += sgn * nb3[1] * L; mz += sgn * nb3[2] * L;
  }
  const ml = Math.hypot(mx, my, mz); if (!(ml > 0)) return fail('null-mean-normal', k);
  mx /= ml; my /= ml; mz /= ml;
  let ex = 1 - mx * mx; let ey = -mx * my; let ez = -mx * mz;
  if (Math.hypot(ex, ey, ez) < 1e-6) { ex = -my * mx; ey = 1 - my * my; ez = -my * mz; }
  const eL = Math.hypot(ex, ey, ez); ex /= eL; ey /= eL; ez /= eL;
  const fx2 = my * ez - mz * ey; const fy2 = mz * ex - mx * ez; const fz2 = mx * ey - my * ex;
  const PU = new Float64Array(k); const PV = new Float64Array(k);
  for (let i = 0; i < k; i += 1) {
    const dx = VX[poly[i]] - VX[a]; const dy = VY[poly[i]] - VY[a]; const dz = VZ[poly[i]] - VZ[a];
    PU[i] = dx * ex + dy * ey + dz * ez; PV[i] = dx * fx2 + dy * fy2 + dz * fz2;
  }
  // the projected polygon must be simple and positively oriented; if the signed area is negative, flip.
  let sa = 0; for (let i = 0; i < k; i += 1) { const j = (i + 1) % k; sa += PU[i] * PV[j] - PU[j] * PV[i]; }
  const sgnP = sa >= 0 ? 1 : -1;
  const cost = new Float64Array(k * k * k).fill(-1);
  const costOf = (i: number, m: number, j: number): number => {
    const key = (i * k + m) * k + j;
    const c0 = cost[key]; if (c0 >= 0) return c0;
    // cross of (m-i) x (j-i) in the projected tangent plane; <= 0 means the ear leaves the polygon
    const crx = sgnP * ((PU[m] - PU[i]) * (PV[j] - PV[i]) - (PU[j] - PU[i]) * (PV[m] - PV[i]));
    if (!(crx > 0)) { cost[key] = Infinity; return Infinity; }     // reflex / degenerate in projection
    const mt = metric(poly[i], poly[m], poly[j]);
    const c = mode === 'chord' ? mt.chdUm : mt.ar;
    cost[key] = c; return c;
  };
  // polygon-triangulation DP over the cycle, base edge (0, k-1)
  const best = new Float64Array(k * k).fill(-1);
  const choice = new Int32Array(k * k).fill(-1);
  const solve = (i: number, j: number): number => {
    if (j - i < 2) return 0;
    const key = i * k + j; const b0 = best[key]; if (b0 >= 0) return b0;
    let bv = Infinity; let bm = -1;
    for (let m = i + 1; m < j; m += 1) {
      const c = costOf(i, m, j);
      if (!Number.isFinite(c)) continue;
      const v = Math.max(c, solve(i, m), solve(m, j));
      if (v < bv) { bv = v; bm = m; }
    }
    best[key] = bv; choice[key] = bm; return bv;
  };
  const v = solve(0, k - 1);
  // the ONLY way this is Infinity now is a polygon with no legal ear anywhere — a genuinely impossible
  // cavity, not a quality refusal. Reported under its own name so the two are never conflated again.
  if (!Number.isFinite(v)) return fail('no-legal-ear-in-projection', k);
  const tris: number[] = [];
  const emit = (i: number, j: number): void => {
    if (j - i < 2) return;
    const m = choice[i * k + j]; if (m < 0) return;
    tris.push(poly[i], poly[m], poly[j]); emit(i, m); emit(m, j);
  };
  emit(0, k - 1);
  let other = 0;
  for (let i = 0; i < tris.length; i += 3) { const mt = metric(tris[i], tris[i + 1], tris[i + 2]); const q = mode === 'chord' ? mt.ar : mt.chdUm; if (q > other) other = q; }
  const out: RingOut = { ok: true, k, best: v, other, why: '', tris };
  ringCache.set(cacheKey, out);
  return out;
}

/**
 * Is the apex's 1-ring polygon SIMPLE in the same tangent-plane projection the DP uses?
 * Returns 1 = non-simple (some pair of non-adjacent projected edges crosses), 0 = simple, -1 = no ring.
 * This exists so a `no-legal-ear-in-projection` refusal can be attributed to the MESH or to the PROJECTION
 * rather than assumed to be the mesh's.
 */
function ringSimple(a: number): number {
  const poly = ringPolygon(a); if (poly === null) return -1;
  const k = poly.length; if (k > 12 || k < 3) return -1;
  let mx = 0; let my = 0; let mz = 0;
  for (let i = vfOff[a]; i < vfOff[a + 1]; i += 1) {
    const t = vfList[i]; const L = rawN(ta[t], tb[t], tc[t], nb3);
    const gx = (VX[ta[t]] + VX[tb[t]] + VX[tc[t]]) / 3; const gy = (VY[ta[t]] + VY[tb[t]] + VY[tc[t]]) / 3;
    const sgn = (nb3[0] * gx + nb3[1] * gy) < 0 ? -1 : 1;
    mx += sgn * nb3[0] * L; my += sgn * nb3[1] * L; mz += sgn * nb3[2] * L;
  }
  const ml = Math.hypot(mx, my, mz); if (!(ml > 0)) return -1;
  mx /= ml; my /= ml; mz /= ml;
  let ex = 1 - mx * mx; let ey = -mx * my; let ez = -mx * mz;
  if (Math.hypot(ex, ey, ez) < 1e-6) { ex = -my * mx; ey = 1 - my * my; ez = -my * mz; }
  const eL = Math.hypot(ex, ey, ez); ex /= eL; ey /= eL; ez /= eL;
  const fx2 = my * ez - mz * ey; const fy2 = mz * ex - mx * ez; const fz2 = mx * ey - my * ex;
  const U = new Float64Array(k); const V = new Float64Array(k);
  for (let i = 0; i < k; i += 1) {
    const dx = VX[poly[i]] - VX[a]; const dy = VY[poly[i]] - VY[a]; const dz = VZ[poly[i]] - VZ[a];
    U[i] = dx * ex + dy * ey + dz * ez; V[i] = dx * fx2 + dy * fy2 + dz * fz2;
  }
  const cr = (o: number, p: number, q: number): number => (U[p] - U[o]) * (V[q] - V[o]) - (U[q] - U[o]) * (V[p] - V[o]);
  for (let i = 0; i < k; i += 1) {
    const i2 = (i + 1) % k;
    for (let j = i + 1; j < k; j += 1) {
      const j2 = (j + 1) % k;
      if (i === j || i2 === j || i === j2) continue;
      const d1 = cr(i, i2, j); const d2 = cr(i, i2, j2); const d3 = cr(j, j2, i); const d4 = cr(j, j2, i2);
      if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 1;
    }
  }
  return 0;
}

/** half-edge collapse v -> u: link condition, boundary, folds, and the new facets' orientation. */
type ColOut = { ok: boolean; maxChd: number; maxAr: number; why: string; kept: number[] };
function collapse(u: number, v: number): ColOut {
  const bad = (why: string): ColOut => ({ ok: false, maxChd: Infinity, maxAr: Infinity, why, kept: [] });
  if (isBnd[v] === 1) return bad('moves-boundary-vertex');
  // facets on the edge (u,v)
  const onEdge: number[] = []; const opp: number[] = [];
  for (let i = vfOff[v]; i < vfOff[v + 1]; i += 1) {
    const t = vfList[i]; const v3 = [ta[t], tb[t], tc[t]];
    if (v3[0] === u || v3[1] === u || v3[2] === u) { onEdge.push(t); for (const w of v3) if (w !== u && w !== v) opp.push(w); }
  }
  if (onEdge.length !== 2) return bad(`edge-not-manifold(${onEdge.length})`);
  // LINK CONDITION: N(u) ∩ N(v) must be EXACTLY the two opposite vertices
  const Nu = new Set<number>();
  for (let i = vfOff[u]; i < vfOff[u + 1]; i += 1) { const t = vfList[i]; for (const w of [ta[t], tb[t], tc[t]]) if (w !== u) Nu.add(w); }
  let shared = 0;
  const Nv = new Set<number>();
  for (let i = vfOff[v]; i < vfOff[v + 1]; i += 1) { const t = vfList[i]; for (const w of [ta[t], tb[t], tc[t]]) if (w !== v) Nv.add(w); }
  for (const w of Nv) if (Nu.has(w) && w !== u) shared += 1;
  if (shared !== 2) return bad(`link-condition(${shared})`);
  if (opp.length !== 2) return bad('opp-degenerate');
  // surviving facets of v, with v -> u
  const kept: number[] = []; let maxChd = 0; let maxAr = 0;
  for (let i = vfOff[v]; i < vfOff[v + 1]; i += 1) {
    const t = vfList[i]; if (onEdge.includes(t)) continue;
    const a0 = ta[t] === v ? u : ta[t]; const b0 = tb[t] === v ? u : tb[t]; const c0 = tc[t] === v ? u : tc[t];
    if (a0 === b0 || b0 === c0 || a0 === c0) return bad('degenerate-after');
    rawN(ta[t], tb[t], tc[t], nb3);
    const L = rawN(a0, b0, c0, nb4);
    if (!(L > 0)) return bad('zero-area-after');
    if (nb3[0] * nb4[0] + nb3[1] * nb4[1] + nb3[2] * nb4[2] <= 0) return bad('fold');
    const mt = metric(a0, b0, c0);
    if (mt.chdUm > maxChd) maxChd = mt.chdUm;
    if (mt.ar > maxAr) maxAr = mt.ar;
    kept.push(t);
  }
  return { ok: true, maxChd, maxAr, why: '', kept };
}

const L0 = new Uint8Array(nTri); const LA = new Uint8Array(nTri); const LC = new Uint8Array(nTri);
const BESTOP = new Int32Array(nTri).fill(-1);      // 0 = OP-B (vertex removal), 1..6 = OP-A candidate
const BESTU = new Int32Array(nTri).fill(-1); const BESTV = new Int32Array(nTri).fill(-1);
const BESTCHD = new Float64Array(nTri).fill(Infinity);
const BESTAR = new Float64Array(nTri).fill(Infinity);
const whyCount: Record<string, number> = {};

/** Run the whole Stage-1 ladder over `pool`. Used for the MIS class AND for a TURNING control. */
function stage1(pool: number[], label: string, record: boolean): Record<string, number> {
  const tS = Date.now();
  let n0 = 0; let nA = 0; let nC = 0; let a0 = 0; let aA = 0; let aC = 0; let aPool = 0;
  let opB = 0; let opA = 0;
  const bch: number[] = []; const bar: number[] = [];
  // *** THE A/B THE FIRST DRAFT WAS MISSING. *** "min-max chord 1352 um" is uninterpretable on its own:
  // it is a max over a PATCH of several facets, while the class statistic is one facet's own chord. The
  // only honest comparison is the SAME patch before and after, so both are collected here.
  const befP: number[] = []; const ratP: number[] = []; let nImprove = 0; let nWorse = 0;
  let nonSimple = 0; let ringTried = 0;
  let done = 0;
  for (const t of pool) {
    done += 1;
    if (done % 40000 === 0) log(`   ... ${label} ${done}/${pool.length}  [${el()}]`);
    aPool += AREA[t];
    let bestChd = Infinity; let bestAr = Infinity; let bestOp = -1; let bestU = -1; let bestV = -1; let any0 = false;
    const ap = APEX[t];
    const rvC = removeVertex(ap, 'chord');
    const rvA = removeVertex(ap, 'aspect');
    if (rvC.ok) {
      any0 = true;
      if (rvC.best < bestChd) { bestChd = rvC.best; bestOp = 0; bestU = ap; bestV = -1; }
      if (rvA.best < bestAr) bestAr = rvA.best;
    } else if (record) whyCount[`B:${rvC.why}`] = (whyCount[`B:${rvC.why}`] ?? 0) + 1;
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      for (const dir of [0, 1]) {
        const u = dir === 0 ? v3[e] : v3[(e + 1) % 3];
        const w = dir === 0 ? v3[(e + 1) % 3] : v3[e];
        const co = collapse(u, w);
        if (!co.ok) { if (record) whyCount[`A:${co.why}`] = (whyCount[`A:${co.why}`] ?? 0) + 1; continue; }
        any0 = true;
        if (co.maxChd < bestChd) { bestChd = co.maxChd; bestOp = 1 + 2 * e + dir; bestU = u; bestV = w; }
        if (co.maxAr < bestAr) bestAr = co.maxAr;
      }
    }
    if (any0) { n0 += 1; a0 += AREA[t]; L0[t] = 1; }
    if (bestAr < AR_SPLIT) { nA += 1; aA += AREA[t]; LA[t] = 1; }
    if (bestChd <= BAR_UM) { nC += 1; aC += AREA[t]; LC[t] = 1; }
    BESTCHD[t] = bestChd; BESTAR[t] = bestAr; BESTOP[t] = bestOp; BESTU[t] = bestU; BESTV[t] = bestV;
    if (bestOp === 0) opB += 1; else if (bestOp > 0) opA += 1;
    if (Number.isFinite(bestChd)) bch.push(bestChd);
    if (Number.isFinite(bestAr)) bar.push(bestAr);
    // BEFORE, on the SAME patch the winning operation touches
    if (bestOp >= 0) {
      const moved = bestOp === 0 ? bestU : bestV;
      let mb = 0;
      for (let i = vfOff[moved]; i < vfOff[moved + 1]; i += 1) { const q = vfList[i]; const mt = metric(ta[q], tb[q], tc[q]); if (mt.chdUm > mb) mb = mt.chdUm; }
      befP.push(mb); ratP.push(bestChd / Math.max(1e-9, mb));
      if (bestChd < mb) nImprove += 1; else nWorse += 1;
    }
    // OP-B diagnostic: is the apex ring polygon SIMPLE in the tangent-plane projection? A `no-legal-ear`
    // refusal on a NON-SIMPLE polygon is the projection's, not the mesh's, and must not be quoted as the
    // latter. Counted, not assumed.
    if (record) { const sp = ringSimple(APEX[t]); if (sp >= 0) { ringTried += 1; nonSimple += sp; } }
  }
  const N = Math.max(1, pool.length); const A = Math.max(1e-30, aPool);
  log('');
  log(`── STAGE 1 — ${label}: ${pool.length} facets, ${aPool.toFixed(2)} mm2 (${((Date.now() - tS) / 1000).toFixed(1)}s) ──`);
  log(`   L0 a topologically admissible op EXISTS      : ${n0} (${((100 * n0) / N).toFixed(2)}% count)   ${((100 * a0) / A).toFixed(2)}% AREA`);
  log(`   LA + best triangulation has max aspect3 < ${AR_SPLIT} : ${nA} (${((100 * nA) / N).toFixed(2)}% count)   ${((100 * aA) / A).toFixed(2)}% AREA`);
  log(`   LC + best triangulation is <= ${BAR_UM} um chord   : ${nC} (${((100 * nC) / N).toFixed(2)}% count)   ${((100 * aC) / A).toFixed(2)}% AREA`);
  log(`   min-max ORIENTATION chord achievable (um): ${fmt(sortA(bch))}`);
  log(`   min-max ASPECT3 achievable              : ${fmt(sortA(bar))}`);
  log(`   SAME PATCH BEFORE, max chord (um)       : ${fmt(sortA(befP))}`);
  log(`   AFTER/BEFORE ratio on the same patch    : ${fmt(sortA(ratP))}`);
  log(`   *** the best operation IMPROVES the patch on ${nImprove}/${nImprove + nWorse} = ${((100 * nImprove) / Math.max(1, nImprove + nWorse)).toFixed(2)}% ***`);
  if (record && ringTried > 0) log(`   OP-B diagnostic: apex ring polygon NON-SIMPLE in the tangent projection on ${nonSimple}/${ringTried} = ${((100 * nonSimple) / ringTried).toFixed(2)}%`);
  log(`   winning op: OP-B vertex-removal ${opB}   OP-A half-edge collapse ${opA}`);
  return {
    n: pool.length, aPool, n0, nA, nC, a0, aA, aC, opB, opA,
    chdP50: pq(sortA(bch), 0.5), arP50: pq(sortA(bar), 0.5),
    befP50: pq(sortA(befP), 0.5), ratP50: pq(sortA(ratP), 0.5), nImprove, nWorse, nonSimple, ringTried,
  };
}
{
  const gMis = stage1(MIS, 'MIS-ORIENTED class', true);
  ck({ stage: 1, group: 'mis', ...gMis, whyCount });
  // *** THE NON-VACUOUS CONTROL. *** If the identical machinery refuses ~everything on WELL-SHAPED facets
  // too, the refusals are the tool's, not the mesh's. Same code path, same bars, a matched-size random
  // sample of the TURNING class.
  const ctl: number[] = [];
  {
    let rng = 24681357; const rnd = (): number => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
    const want = Math.min(20000, nTri - MIS.length); const seen = new Set<number>();
    while (ctl.length < want) { const t = Math.floor(rnd() * nTri); if (ARF[t] < AR_SPLIT && !seen.has(t)) { seen.add(t); ctl.push(t); } }
  }
  const gCtl = stage1(ctl, 'TURNING control (random, same machinery)', false);
  ck({ stage: 1, group: 'turnCtl', ...gCtl });
  const whys = Object.entries(whyCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
  log('');
  log(`   refusal reasons on the MIS class (CANDIDATE-level, 7 candidates per facet): ${whys.map(([k2, v2]) => `${k2}=${v2}`).join('  ')}`);
  log(`   *** CONTROL CHECK: LA on the class ${((100 * gMis.nA) / Math.max(1, gMis.n)).toFixed(2)}% vs on well-shaped facets ${((100 * gCtl.nA) / Math.max(1, gCtl.n)).toFixed(2)}%  -> the machinery ${(gCtl.nA / Math.max(1, gCtl.n)) > 2 * (gMis.nA / Math.max(1, gMis.n)) ? 'DISCRIMINATES (refusals are the mesh’s)' : 'REFUSES EVERYTHING — the numbers below are the TOOL, not the mesh'} ***`);
  log(`   *** H-B1 ${(100 * gMis.aC) / Math.max(1e-30, gMis.aPool) >= 20 ? 'CONFIRMED' : 'REFUTED'} at the pre-registered 20%-BY-AREA kill line (LC by area ${((100 * gMis.aC) / Math.max(1e-30, gMis.aPool)).toFixed(2)}%) ***`);
}
if (!STAGE.includes('2')) { log(`\nstage 2 skipped   [${el()}]`); process.exit(0); }

// ── 7. STAGE 2 — H-B2, the POSITION PRICE on a sample of L2 survivors (certifyTriangle, tol 0.010)
{
  const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
  const pool: number[] = []; for (const t of MIS) if (LC[t] === 1) pool.push(t);
  const pick: number[] = []; const st = Math.max(1, Math.floor(pool.length / POSK));
  for (let i = 0; i < pool.length && pick.length < POSK; i += st) pick.push(pool[i]);
  log('');
  log(`── STAGE 2 (H-B2) — certifyTriangle at tol ${TOL * 1000} um on ${pick.length} of ${pool.length} L2 survivors  zJ ${zJ.length} thJ ${thJ.length} ──`);
  const cert = (a: number, b: number, c: number): number => certifyTriangle(rA, VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ }).witnessed * 1000;
  let nAbs = 0; let nNoReg = 0; let aAbs = 0; let aNoReg = 0; let aPick = 0;
  const bef: number[] = []; const aft: number[] = [];
  const tS = Date.now();
  for (const t of pick) {
    aPick += AREA[t];
    const op = BESTOP[t];
    // the AFFECTED PATCH: facets destroyed + facets re-shaped; BEFORE = all facets touched by the op
    let beforeSet: number[] = []; const afterTris: number[] = [];
    if (op === 0) {
      const a = BESTU[t]; const rv = removeVertex(a);
      for (let i = vfOff[a]; i < vfOff[a + 1]; i += 1) beforeSet.push(vfList[i]);
      for (let i = 0; i < rv.tris.length; i += 3) afterTris.push(rv.tris[i], rv.tris[i + 1], rv.tris[i + 2]);
    } else {
      const u = BESTU[t]; const v = BESTV[t]; const co = collapse(u, v);
      for (let i = vfOff[v]; i < vfOff[v + 1]; i += 1) beforeSet.push(vfList[i]);
      for (const q of co.kept) afterTris.push(ta[q] === v ? u : ta[q], tb[q] === v ? u : tb[q], tc[q] === v ? u : tc[q]);
    }
    beforeSet = Array.from(new Set(beforeSet));
    let mb = 0; for (const q of beforeSet) { const d = cert(ta[q], tb[q], tc[q]); if (d > mb) mb = d; }
    let mafter = 0; for (let i = 0; i < afterTris.length; i += 3) { const d = cert(afterTris[i], afterTris[i + 1], afterTris[i + 2]); if (d > mafter) mafter = d; }
    bef.push(mb); aft.push(mafter);
    if (mafter <= BAR_UM) { nAbs += 1; aAbs += AREA[t]; }
    if (mafter <= Math.max(BAR_UM, mb)) { nNoReg += 1; aNoReg += AREA[t]; }
  }
  const sb = sortA(bef); const sa2 = sortA(aft);
  log(`   (${((Date.now() - tS) / 1000).toFixed(1)}s)`);
  log(`   BEFORE max witnessed over the patch (um): ${fmt(sb)}`);
  log(`   AFTER  max witnessed over the patch (um): ${fmt(sa2)}`);
  log(`   *** NO-REGRESSION (AFTER <= max(${BAR_UM}, BEFORE)) : ${nNoReg}/${pick.length} = ${((100 * nNoReg) / Math.max(1, pick.length)).toFixed(2)}% count   ${((100 * aNoReg) / Math.max(1e-30, aPick)).toFixed(2)}% area ***`);
  log(`   *** ABSOLUTE     (AFTER <= ${BAR_UM} um)            : ${nAbs}/${pick.length} = ${((100 * nAbs) / Math.max(1, pick.length)).toFixed(2)}% count   ${((100 * aAbs) / Math.max(1e-30, aPick)).toFixed(2)}% area ***`);
  log(`   H-B2 ${(100 * nNoReg) / Math.max(1, pick.length) >= 50 ? 'CONFIRMED' : 'REFUTED'} at the pre-registered 50% no-regression kill line`);
  ck({ stage: 2, poolSize: pool.length, sampled: pick.length, nAbs, nNoReg, aAbs, aNoReg, aPick, befP50: pq(sb, 0.5), aftP50: pq(sa2, 0.5), befMax: sb[sb.length - 1], aftMax: sa2[sa2.length - 1] });
  // THE CEILING
  const accL2 = ((): { n: number; a: number } => { let n = 0; let a = 0; for (const t of MIS) if (LC[t] === 1) { n += 1; a += AREA[t]; } return { n, a }; })();
  const fN = (nNoReg / Math.max(1, pick.length)); const fA = aNoReg / Math.max(1e-30, aPick);
  log('');
  log(`═══ THE CEILING ═══`);
  log(`   BY COUNT: LC ${((100 * accL2.n) / MIS.length).toFixed(2)}%  x  no-regression ${(100 * fN).toFixed(2)}%  =  ${((100 * accL2.n * fN) / MIS.length).toFixed(2)}% of the ${MIS.length} MIS facets`);
  log(`   BY AREA : LC ${((100 * accL2.a) / areaMis).toFixed(2)}%  x  no-regression ${(100 * fA).toFixed(2)}%  =  ${((100 * accL2.a * fA) / areaMis).toFixed(2)}% of the ${areaMis.toFixed(2)} mm2 class area`);
  log(`   in whole-mesh terms that is ${((100 * accL2.a * fA) / areaTot).toFixed(4)}% of the ${areaTot.toFixed(1)} mm2 surface`);
  ck({ stage: 'ceiling', countPct: (100 * accL2.n * fN) / MIS.length, areaPct: (100 * accL2.a * fA) / areaMis, wholeMeshAreaPct: (100 * accL2.a * fA) / areaTot });
}
log('');
log(`done   [${el()}]   checkpoints in ${OUT}`);

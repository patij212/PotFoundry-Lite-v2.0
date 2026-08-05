// s92CollapsePass.ts — THE GREEDY SEQUENTIAL COLLAPSE PASS. The only experiment that can see the
// INTERACTION the single-shot ceiling cannot. READ-ONLY w.r.t. `src/`; writes an STL for audit + render.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY A SEQUENTIAL PASS AND NOT MORE SINGLE-SHOT ANALYSIS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S91 priced EVERY vertex-set operation available to a MIS facet ON THE UNMODIFIED MESH:
//     L0 a topologically admissible op exists            96.19% of the class by count, 93.21% by area
//     LA + its best triangulation has max aspect3 < 50    5.29%                          8.73%
//     LC + its best triangulation is <= 10 um chord       1.98%                          1.48%
//     same-patch max chord BEFORE p50 1378.9 um  ->  AFTER p50 1352.5 um   (ratio p50 0.987)
// and the refusal is NOT topology (96% have a legal op) — it is that the operation lands the defect on a
// NEIGHBOUR: `A:fold` on 494,895 of 745,470 collapse candidates, i.e. moving one vertex INVERTS an
// adjacent facet, and adjacent facets are themselves slivers because the class is clustered 30.1x
// (S90 H-A3: 3,176 components, mean 39.1, max 7,019).
//
// That is precisely the regime where a single-shot census UNDER-states the reachable set: removing fin #1
// can make fin #2 collapsible. A one-shot analysis cannot see it and a sequential pass can. This file runs
// the pass, in ROUNDS, until it stops making progress, and then AUDITS the result.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED — WRITTEN BEFORE THE FIRST RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H-C1 UNLOCKING. A sequential worst-first collapse pass removes materially more of the MIS class than the
//      single-shot LA ceiling of 5.29% (count) / 8.73% (area), because each applied collapse unblocks its
//      neighbours.
//      KILL: if the pass removes < 2x the single-shot LA fraction BY AREA (i.e. < 17.5% of class area),
//      unlocking is REFUTED and the single-shot ceiling stands as the ceiling.
//
// H-C2 IT MUST NOT MOVE THE DEFECT. The pass is only a win if the mesh-wide orientation statistic improves.
//      KILL: if the mesh-wide AREA over the 10 um orientation chord bar does not fall, the pass is a no-op
//      or worse, regardless of how many MIS facets it deletes. (S65's refutation is the precedent: a
//      +29% triangle bisection pass improved position while making orientation 55% worse.)
//
// H-C3 TOPOLOGY IS A HARD BAR, VERIFIED NOT ASSUMED. The output must reproduce, by welded INDEX:
//      non-manifold edges 0, boundary edges 601, boundary loops 2, Euler V-E+F = 0, and ZERO facets whose
//      winding disagrees with their neighbours. An unconstrained flip pass produced 131 non-manifold edges
//      and 464 exactly-degenerate facets on this same branch tonight; this audit is why.
//      KILL: any of those five numbers wrong => the arm is withdrawn entirely, whatever it scored.
//
// H-C4 POSITION. `certifyTriangle` at tol = 0.010 on a matched sample BEFORE and AFTER, in the region the
//      pass touched. Reported as the primary price, with the NO-REGRESSION form as the verdict because the
//      input mesh already fails 10 um at these facets (S90 fin test: PROVEN-FAIL 150/300 on the class).
//
// THE ADMISSIBILITY RULE, stated once. A half-edge collapse v -> u is applied iff
//   (1) v is not a boundary vertex;                      (4) no surviving facet folds (normal dot <= 0);
//   (2) edge (u,v) has exactly 2 incident live facets;    (5) no surviving facet is degenerate;
//   (3) the LINK CONDITION holds (|N(u) & N(v)| == 2);    (6) `maxNewAr` cap and `maxNewChd` cap.
// Both endpoints are already ON the surface (S90 gate p99 9.54e-6 mm), so the merged vertex introduces no
// new vertex-position error by construction. `minAlt`-style position cost is priced in H-C4, not assumed.
//
// Usage:  bash research/tools/run-s92-collapse-pass.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S92_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S92_STEM ?? 'voronoi_ring_D--';
const AR_SPLIT = envF('PF_S92_AR', 50);
const BAR_UM = envF('PF_S92_BAR_UM', 10);
const MAXNEWAR = envF('PF_S92_MAXNEWAR', 50);      // reject a collapse creating a facet at/over this aspect3
const MAXROUNDS = Math.round(envF('PF_S92_ROUNDS', 8));
const POSK = Math.round(envF('PF_S92_POSK', 100));
const TOL = envF('PF_S92_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S92_NMAX', 512));
const WRITE = process.env.PF_S92_WRITE !== '0';
const OUT = 'research/exchange/_strataConformBisect/S92_PASS.ndjson';
const t00 = Date.now();
const el = (): string => `${((Date.now() - t00) / 1000).toFixed(1)}s`;
mkdirSync('research/exchange/_strataConformBisect/s92pass', { recursive: true });
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

log('===== S92 — GREEDY SEQUENTIAL COLLAPSE PASS =====');
log(`style ${STYLE}  stem ${STEM}  aspect3>=${AR_SPLIT}  bar ${BAR_UM} um  maxNewAr ${MAXNEWAR}  rounds ${MAXROUNDS}`);

const DIMS: StyleDims = { H: envF('PF_S92_H', 120), Rb: envF('PF_S92_RB', 40), Rt: envF('PF_S92_RT', 50), expn: 1 };
const H = DIMS.H;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// ── 1. READ + WELD
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
// the ORIGINAL connectivity, kept so H-C4 can score the SAME facet id before and after
const ta0 = Int32Array.from(ta); const tb0 = Int32Array.from(tb); const tc0 = Int32Array.from(tc);
log(`${path}: ${nTri} facets, ${NV} welded vertices   [${el()}]`);

// ── 2. MUTABLE TOPOLOGY: alive flags + growable vertex->facet adjacency (dead entries filtered on read)
const alive = new Uint8Array(nTri).fill(1);
const vf: Int32Array[] = new Array(NV);
const vfN = new Int32Array(NV);
{
  const cnt = new Int32Array(NV);
  for (let t = 0; t < nTri; t += 1) { cnt[ta[t]] += 1; cnt[tb[t]] += 1; cnt[tc[t]] += 1; }
  for (let v = 0; v < NV; v += 1) vf[v] = new Int32Array(cnt[v] + 4);
  for (let t = 0; t < nTri; t += 1) for (const v of [ta[t], tb[t], tc[t]]) { vf[v][vfN[v]] = t; vfN[v] += 1; }
}
function vfPush(v: number, t: number): void {
  if (vfN[v] >= vf[v].length) { const g = new Int32Array(vf[v].length * 2 + 4); g.set(vf[v]); vf[v] = g; }
  vf[v][vfN[v]] = t; vfN[v] += 1;
}
/** live facets incident to v, with dead/stale entries compacted out. */
function vfLive(v: number, out: number[]): void {
  out.length = 0; let w = 0;
  for (let i = 0; i < vfN[v]; i += 1) {
    const t = vf[v][i];
    if (alive[t] === 0) continue;
    if (ta[t] !== v && tb[t] !== v && tc[t] !== v) continue;      // stale after a re-point
    vf[v][w] = t; w += 1; out.push(t);
  }
  vfN[v] = w;
}
const isBnd = new Uint8Array(NV);
{
  const seen = new Map<number, number>(); const KEY = NV + 1;
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) { const u = v3[e]; const w = v3[(e + 1) % 3]; const k = u < w ? u * KEY + w : w * KEY + u; seen.set(k, (seen.get(k) ?? 0) + 1); }
  }
  for (const [k, c] of seen) if (c !== 2) { const u = Math.floor(k / KEY); isBnd[u] = 1; isBnd[k - u * KEY] = 1; }
}

// ── 3. RULERS (identical definitions to S66/S90/S91)
const scr = new Float64Array(3);
function surfN(th: number, z: number): Float64Array {
  const zc = Math.min(H, Math.max(0, z));
  const r = rA(th, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(th + hTh, zc) - rA(th - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(th, zp) - rA(th, zm)) / (zp - zm) : 0;
  const cc = Math.cos(th); const ss = Math.sin(th);
  const nx = rTh * ss + r * cc; const ny = r * ss - rTh * cc; const nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1;
  scr[0] = nx / L; scr[1] = ny / L; scr[2] = nz / L;
  return scr;
}
interface M { chdUm: number; ar: number; area: number }
function metricOf(a: number, b: number, c: number): M {
  const ax = VX[a]; const ay = VY[a]; const az = VZ[a];
  const bx = VX[b]; const by = VY[b]; const bz = VZ[b];
  const cx = VX[c]; const cy = VY[c]; const cz = VZ[c];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  if (!(fl > 1e-18)) return { chdUm: Infinity, ar: Infinity, area: 0 };
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = VT[a];
  const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
  const n = surfN(thc, (az + bz + cz) / 3);
  let dot = fx * n[0] + fy * n[1] + fz * n[2]; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  return { chdUm: 2 * Math.sin(Math.acos(dot) / 2) * diam * 1000, ar: diam / Math.max(1e-300, fl / Math.max(1e-300, diam)), area: fl / 2 };
}
function rawN(a: number, b: number, c: number, out: Float64Array): number {
  const ax = VX[a]; const ay = VY[a]; const az = VZ[a];
  const ux = VX[b] - ax; const uy = VY[b] - ay; const uz = VZ[b] - az;
  const wx = VX[c] - ax; const wy = VY[c] - ay; const wz = VZ[c] - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  if (L > 0) { out[0] = nx / L; out[1] = ny / L; out[2] = nz / L; } else { out[0] = 0; out[1] = 0; out[2] = 0; }
  return L;
}

// ── 4. THE CENSUS (mesh-wide, live facets only) — by COUNT and by AREA, both rulers
function census(label: string): Record<string, number> {
  let n = 0; let aTot = 0; let nMis = 0; let aMis = 0; let nOver = 0; let aOver = 0; let aMisOver = 0;
  const ch: number[] = [];
  for (let t = 0; t < nTri; t += 1) {
    if (alive[t] === 0) continue;
    const m = metricOf(ta[t], tb[t], tc[t]);
    n += 1; aTot += m.area; ch.push(m.chdUm);
    if (m.ar >= AR_SPLIT) { nMis += 1; aMis += m.area; if (m.chdUm > BAR_UM) aMisOver += m.area; }
    if (m.chdUm > BAR_UM) { nOver += 1; aOver += m.area; }
  }
  const s = sortA(ch);
  log(`── CENSUS ${label} ──`);
  log(`   facets ${n}   area ${aTot.toFixed(2)} mm2`);
  log(`   MIS aspect3>=${AR_SPLIT}: ${nMis} (${((100 * nMis) / n).toFixed(3)}% count)  ${aMis.toFixed(3)} mm2 (${((100 * aMis) / aTot).toFixed(4)}% area)`);
  log(`   ORIENT over ${BAR_UM} um: ${nOver} (${((100 * nOver) / n).toFixed(3)}% count)  ${aOver.toFixed(2)} mm2 (${((100 * aOver) / aTot).toFixed(4)}% AREA)`);
  log(`   orientation chord (um): ${fmt(s)}`);
  return { n, aTot, nMis, aMis, nOver, aOver, aMisOver, chP50: pq(s, 0.5), chP99: pq(s, 0.99), chMax: s[s.length - 1] };
}

// ── 5. THE COLLAPSE (applied to the LIVE mesh; returns false and changes nothing if inadmissible)
const na = new Float64Array(3); const nb2 = new Float64Array(3);
const bufU: number[] = []; const bufV: number[] = [];
const rej: Record<string, number> = {};
//
// *** THE GUARD THE FIRST RUN WAS MISSING, AND WHAT IT COST. *** Run 1 (ROUNDS=2, no guard) applied any
// ADMISSIBLE collapse of a MIS facet and measured: class area -14.93%, but MESH-WIDE orientation area
// 13.1391% -> 13.5914% (WORSE), surface area +0.42%, and honest position over-bar 4/20 -> 7/20 on the
// changed facets. The pass was moving the defect onto the neighbours, exactly as the `fold` refusal
// statistic predicted. An operation that is legal is not thereby an improvement; PF_S92_GUARD=1 (default)
// requires the patch's MAX ORIENTATION CHORD to strictly fall, which is the only form in which the lever
// could ever be productionised. Both arms are reported.
const GUARD = process.env.PF_S92_GUARD !== '0';
function tryCollapse(u: number, v: number, apply: boolean): boolean {
  const no = (k: string): boolean => { rej[k] = (rej[k] ?? 0) + 1; return false; };
  if (u === v) return no('same');
  if (isBnd[v] === 1) return no('bnd');
  vfLive(v, bufV); vfLive(u, bufU);
  if (bufV.length < 3) return no('degV');
  const onEdge: number[] = [];
  for (const t of bufV) if (ta[t] === u || tb[t] === u || tc[t] === u) onEdge.push(t);
  if (onEdge.length !== 2) return no(`edge${onEdge.length}`);
  const Nu = new Set<number>(); for (const t of bufU) for (const w of [ta[t], tb[t], tc[t]]) if (w !== u) Nu.add(w);
  let shared = 0; const Nv = new Set<number>();
  for (const t of bufV) for (const w of [ta[t], tb[t], tc[t]]) if (w !== v) Nv.add(w);
  for (const w of Nv) if (w !== u && Nu.has(w)) shared += 1;
  if (shared !== 2) return no(`link${shared}`);
  let maxAr = 0; let maxChd = 0;
  for (const t of bufV) {
    if (t === onEdge[0] || t === onEdge[1]) continue;
    const a0 = ta[t] === v ? u : ta[t]; const b0 = tb[t] === v ? u : tb[t]; const c0 = tc[t] === v ? u : tc[t];
    if (a0 === b0 || b0 === c0 || a0 === c0) return no('degen');
    rawN(ta[t], tb[t], tc[t], na);
    if (!(rawN(a0, b0, c0, nb2) > 0)) return no('zeroArea');
    if (na[0] * nb2[0] + na[1] * nb2[1] + na[2] * nb2[2] <= 0) return no('fold');
    const m = metricOf(a0, b0, c0);
    if (m.ar > maxAr) maxAr = m.ar;
    if (m.chdUm > maxChd) maxChd = m.chdUm;
  }
  if (maxAr >= MAXNEWAR) return no('newAr');
  if (GUARD) {
    // BEFORE on the SAME patch: every live facet incident to v (the two on the edge are destroyed, so
    // their chord counts as removed — the comparison is max-over-what-was against max-over-what-remains).
    let befMax = 0;
    for (const t of bufV) { const m = metricOf(ta[t], tb[t], tc[t]); if (m.chdUm > befMax) befMax = m.chdUm; }
    if (!(maxChd < befMax)) return no('noImprove');
  }
  if (!apply) return true;
  for (const t of onEdge) alive[t] = 0;
  for (const t of bufV) {
    if (t === onEdge[0] || t === onEdge[1]) continue;
    if (ta[t] === v) ta[t] = u; if (tb[t] === v) tb[t] = u; if (tc[t] === v) tc[t] = u;
    vfPush(u, t);
  }
  vfN[v] = 0;
  return true;
}

// ── 6. BEFORE CENSUS + THE PASS
const before = census('BEFORE (input mesh)');
ck({ phase: 'before', ...before });
const misBefore: number[] = [];
for (let t = 0; t < nTri; t += 1) if (alive[t] === 1 && metricOf(ta[t], tb[t], tc[t]).ar >= AR_SPLIT) misBefore.push(t);
log(`MIS class at start: ${misBefore.length}   [${el()}]`);

let totalApplied = 0;
for (let round = 0; round < MAXROUNDS; round += 1) {
  // worst-first by orientation chord over the LIVE MIS facets
  const cand: Array<[number, number]> = [];
  for (let t = 0; t < nTri; t += 1) {
    if (alive[t] === 0) continue;
    const m = metricOf(ta[t], tb[t], tc[t]);
    if (m.ar >= AR_SPLIT) cand.push([m.chdUm, t]);
  }
  cand.sort((p, q) => q[0] - p[0]);
  let applied = 0;
  for (const [, t] of cand) {
    if (alive[t] === 0) continue;
    const v3 = [ta[t], tb[t], tc[t]];
    // try the SHORT edges first (least material moved), both directions
    const edges: Array<[number, number]> = [];
    for (let e = 0; e < 3; e += 1) {
      const p = v3[e]; const q = v3[(e + 1) % 3];
      const L = Math.hypot(VX[p] - VX[q], VY[p] - VY[q], VZ[p] - VZ[q]);
      edges.push([L, e]);
    }
    edges.sort((p, q) => p[0] - q[0]);
    let ok = false;
    for (const [, e] of edges) {
      const p = v3[e]; const q = v3[(e + 1) % 3];
      if (tryCollapse(p, q, true)) { ok = true; break; }
      if (tryCollapse(q, p, true)) { ok = true; break; }
    }
    if (ok) applied += 1;
  }
  totalApplied += applied;
  let live = 0; for (let t = 0; t < nTri; t += 1) live += alive[t];
  log(`round ${round + 1}: candidates ${cand.length}  applied ${applied}  live facets ${live}   [${el()}]`);
  ck({ phase: 'round', round: round + 1, cand: cand.length, applied, live });
  if (applied < Math.max(50, 0.005 * cand.length)) break;
}
log(`total collapses applied: ${totalApplied}   [${el()}]`);

// ── 7. AFTER CENSUS
const after = census('AFTER (collapse pass)');
ck({ phase: 'after', ...after, totalApplied });
log('');
log(`═══ H-C1 / H-C2 ═══`);
log(`   MIS class   : ${before.nMis} -> ${after.nMis} facets (${(before.nMis / Math.max(1, after.nMis)).toFixed(3)}x)   ${before.aMis.toFixed(3)} -> ${after.aMis.toFixed(3)} mm2 (removed ${((100 * (before.aMis - after.aMis)) / before.aMis).toFixed(2)}% of class AREA)`);
log(`   ORIENT over-bar BY AREA : ${((100 * before.aOver) / before.aTot).toFixed(4)}% -> ${((100 * after.aOver) / after.aTot).toFixed(4)}%  (${(before.aOver / Math.max(1e-30, after.aOver)).toFixed(3)}x)`);
log(`   ORIENT over-bar BY COUNT: ${((100 * before.nOver) / before.n).toFixed(3)}% -> ${((100 * after.nOver) / after.n).toFixed(3)}%  (${(before.nOver / Math.max(1, after.nOver)).toFixed(3)}x)`);
log(`   triangles: ${before.n} -> ${after.n} (${((100 * (before.n - after.n)) / before.n).toFixed(2)}% removed)   surface area ${before.aTot.toFixed(2)} -> ${after.aTot.toFixed(2)} mm2 (${((100 * (after.aTot - before.aTot)) / before.aTot).toFixed(4)}% change)`);
const remAreaPct = (100 * (before.aMis - after.aMis)) / Math.max(1e-30, before.aMis);
log(`   *** H-C1 ${remAreaPct >= 17.5 ? 'CONFIRMED' : 'REFUTED'}: removed ${remAreaPct.toFixed(2)}% of class area vs the 17.5% kill line (2x the single-shot LA 8.73%) ***`);
log(`   *** H-C2 ${after.aOver / Math.max(1e-30, after.aTot) < before.aOver / Math.max(1e-30, before.aTot) ? 'CONFIRMED — mesh-wide orientation AREA fell' : 'REFUTED — the pass did not reduce mis-oriented AREA'} ***`);
const rj = Object.entries(rej).sort((a, b) => b[1] - a[1]).slice(0, 10);
log(`   refusals: ${rj.map(([k, v]) => `${k}=${v}`).join('  ')}`);

// ── 8. H-C3 TOPOLOGY AUDIT BY WELDED INDEX — verified, not assumed
{
  const KEY = NV + 1; const em = new Map<number, number[]>();
  let live = 0;
  for (let t = 0; t < nTri; t += 1) {
    if (alive[t] === 0) continue; live += 1;
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const u = v3[e]; const w = v3[(e + 1) % 3];
      const k = u < w ? u * KEY + w : w * KEY + u;
      const l = em.get(k); if (l === undefined) em.set(k, [t]); else l.push(t);
    }
  }
  let nm = 0; let bnd = 0; let orientBad = 0;
  for (const [k, l] of em) {
    if (l.length === 1) bnd += 1;
    else if (l.length > 2) nm += 1;
    else {
      const u = Math.floor(k / KEY); const w = k - u * KEY;
      let dirU = 0;
      for (const t of l) {
        const v3 = [ta[t], tb[t], tc[t]];
        for (let e = 0; e < 3; e += 1) if (v3[e] === u && v3[(e + 1) % 3] === w) dirU += 1;
      }
      if (dirU !== 1) orientBad += 1;      // both facets traverse u->w the same way => inconsistent winding
    }
  }
  // boundary loops
  const bAdj = new Map<number, number[]>();
  for (const [k, l] of em) {
    if (l.length !== 1) continue;
    const u = Math.floor(k / KEY); const w = k - u * KEY;
    if (!bAdj.has(u)) bAdj.set(u, []);
    if (!bAdj.has(w)) bAdj.set(w, []);
    (bAdj.get(u) as number[]).push(w);
    (bAdj.get(w) as number[]).push(u);
  }
  const visited = new Set<number>(); let loops = 0;
  for (const s of bAdj.keys()) {
    if (visited.has(s)) continue;
    loops += 1; const st = [s]; visited.add(s);
    while (st.length > 0) { const x = st.pop() as number; for (const y of bAdj.get(x) ?? []) if (!visited.has(y)) { visited.add(y); st.push(y); } }
  }
  let vLive = 0; const used = new Uint8Array(NV);
  for (let t = 0; t < nTri; t += 1) if (alive[t] === 1) { used[ta[t]] = 1; used[tb[t]] = 1; used[tc[t]] = 1; }
  for (let v = 0; v < NV; v += 1) vLive += used[v];
  const euler = vLive - em.size + live;
  log('');
  log(`═══ H-C3 TOPOLOGY AUDIT (by welded INDEX) ═══`);
  log(`   live facets ${live}   live vertices ${vLive}   edges ${em.size}`);
  log(`   non-manifold edges ${nm}  (must be 0)`);
  log(`   boundary edges ${bnd}  (must be 601)   boundary loops ${loops}  (must be 2)`);
  log(`   inconsistent-winding edges ${orientBad}  (must be 0)`);
  log(`   Euler V-E+F = ${euler}  (must be 0)`);
  const pass = nm === 0 && bnd === 601 && loops === 2 && orientBad === 0 && euler === 0;
  log(`   *** H-C3 ${pass ? 'PASS' : '*** FAIL — THE ARM IS WITHDRAWN ***'} ***`);
  ck({ phase: 'topology', live, vLive, edges: em.size, nm, bnd, loops, orientBad, euler, pass });
}

// ── 9. WRITE THE STL (for render + independent audit)
if (WRITE) {
  let live = 0; for (let t = 0; t < nTri; t += 1) live += alive[t];
  const buf = Buffer.alloc(84 + live * 50);
  buf.writeUInt32LE(live, 80);
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    if (alive[t] === 0) continue;
    o += 12;
    for (const v of [ta[t], tb[t], tc[t]]) { buf.writeFloatLE(VX[v], o); buf.writeFloatLE(VY[v], o + 4); buf.writeFloatLE(VZ[v], o + 8); o += 12; }
    o += 2;
  }
  const p = `research/exchange/_strataConformBisect/s92pass/${STEM}_S92.stl`;
  writeFileSync(p, buf);
  log(`\nwrote ${p} (${live} facets)`);
}

// ── 10. H-C4 POSITION PRICE — certifyTriangle at tol 0.010, BEFORE vs AFTER, matched region
{
  const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
  const cert = (a: number, b: number, c: number): number => certifyTriangle(rA, VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ }).witnessed * 1000;
  // AFTER: sample the facets that the pass CHANGED (their vertex list differs from the input's)
  const changed: number[] = [];
  for (let t = 0; t < nTri; t += 1) if (alive[t] === 1 && (ta[t] !== ta0[t] || tb[t] !== tb0[t] || tc[t] !== tc0[t])) changed.push(t);
  const pick: number[] = []; const st = Math.max(1, Math.floor(changed.length / POSK));
  for (let i = 0; i < changed.length && pick.length < POSK; i += st) pick.push(changed[i]);
  log('');
  log(`═══ H-C4 POSITION (certifyTriangle tol ${TOL * 1000} um) — ${pick.length} of ${changed.length} CHANGED facets ═══`);
  const aft: number[] = []; const bef: number[] = [];
  let nAftFail = 0; let nBefFail = 0;
  for (const t of pick) {
    const da = cert(ta[t], tb[t], tc[t]); aft.push(da); if (da > BAR_UM) nAftFail += 1;
    const db = cert(ta0[t], tb0[t], tc0[t]); bef.push(db); if (db > BAR_UM) nBefFail += 1;
  }
  const sa = sortA(aft); const sb = sortA(bef);
  log(`   BEFORE (same facet ids, original vertices): ${fmt(sb)}   over-${BAR_UM}um ${nBefFail}/${pick.length}`);
  log(`   AFTER                                     : ${fmt(sa)}   over-${BAR_UM}um ${nAftFail}/${pick.length}`);
  log(`   *** H-C4: honest position over-bar ${nBefFail} -> ${nAftFail} on the changed facets ***`);
  ck({ phase: 'position', changed: changed.length, sampled: pick.length, nBefFail, nAftFail, befP50: pq(sb, 0.5), aftP50: pq(sa, 0.5), befMax: sb[sb.length - 1], aftMax: sa[sa.length - 1] });
}
log('');
log(`done   [${el()}]   checkpoints in ${OUT}`);

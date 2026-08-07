// revS115HarmAudit.ts — S115 REFUTATION AUDIT: THE HARM SIDE OF THE A1 WELD, MEASURED INDEPENDENTLY.
//
// The shipped tool (s115OpDeblade.ts) scores the A1 weld's collateral by comparing the NEW facet set
// against the REMOVED facet set. Those are DIFFERENT POPULATIONS, so that comparison cannot say whether
// a given facet got worse. Every new facet, however, carries a `src` back to the ORIGINAL facet it was
// rewritten from, so a PAIRED before/after is available and is what this tool measures.
//
// WHAT IT ADDS OVER THE SHIPPED RUN
//  H1 PAIRED POSITION   for every new facet: posDev(parent triple) vs posDev(child triple), same src.
//                       COUNT + AREA-share + MAX of the facets the operator PUSHED OVER 0.01 mm from
//                       under it, restricted to where the radial projector is HONEST (|rDot| > 0.2)
//                       AND on the unrestricted set, both printed.
//  H2 NEW INVERSIONS    normDeg > 90 census (COUNT + AREA + signMargin) on the NEW set, the REMOVED set
//                       and a whole-mesh stride base. The shipped run prints only ndP50, and ndP50(new)
//                       = 92.27 > 90 — i.e. the median new facet is INVERTED — without ever labelling it.
//  H3 PAIRED SHAPE      min-angle and min-altitude parent vs child, same src. Zero-area census exact.
//  H4 PRECOND REACH     did the operator touch v434664 (the 1374.78 um PRECOND exceedance the shipped
//                       tool says is "EXCLUDED from every target set")?
//  H5 REMOVED SET EXHAUSTIVE  the shipped run capped the removed set at stride 2 (CAPPED). Here the
//                       removed-side position numbers are exhaustive, so the K4 delta is a census.
//
// The weld itself is COPIED VERBATIM from s115OpDeblade.ts so the mesh under audit is the same mesh.
// Usage: bash research/tools/run-rev-s115-harm.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));

const STYLE = process.env.PF_S115_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115_STL ?? '';
const TAG = process.env.PF_S115_TAG ?? STYLE;
const OUTDIR = process.env.PF_S115_OUTDIR ?? 'research/exchange/_strataConformBisect/s115rev';
const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;
const BLADE_BAR = envF('PF_S115_BLADE', 175);
const POS_BAR = envF('PF_S115_POSBAR', 0.01);
const POS_K = envI('PF_S115_POSK', 6);
const K_REF = envI('PF_S115_K', 8);
const INSET_REF = envF('PF_S115_INSET', 0.05);
const H_REF = envF('PF_S115_HFD', 2e-6);
const PASSES = envI('PF_S115_PASSES', 8);
const RDOT_HON = envF('PF_S115_RDOT', 0.2);
const BASE_STRIDE = envI('PF_S115_BSTRIDE', 32);

if (STL.length === 0) { log('*** PF_S115_STL required (ABSOLUTE) ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const f4 = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : 'inf');
const pc = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const DEFAULTS: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [kk, v] of Object.entries(g)) if (typeof v.default === 'number') DEFAULTS[snakeToCamel(kk)] = v.default;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 REFUTATION AUDIT — THE A1 WELD'S HARM SIDE, PAIRED — ${STYLE} (${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`cuts blade>=${BLADE_BAR}  posBar ${POS_BAR}mm posK ${POS_K}  k ${K_REF} inset ${INSET_REF} h ${H_REF}  |rDot|>${RDOT_HON}`);
log('');

const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri0 = M.nTri;
const nCorner = nTri0 * 3;
const vid = new Int32Array(nCorner);
let nV = 0;
const VXl: number[] = []; const VYl: number[] = []; const VZl: number[] = [];
{
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  for (let c = 0; c < nCorner; c += 1) {
    const x = xyz0[c * 3]; const y = xyz0[c * 3 + 1]; const z = xyz0[c * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35); h |= 0;
    const b = buckets.get(h);
    let found = -1;
    if (b !== undefined) for (const cc of b) if (VXl[cc] === x && VYl[cc] === y && VZl[cc] === z) { found = cc; break; }
    if (found < 0) { found = nV; nV += 1; VXl.push(x); VYl.push(y); VZl.push(z); if (b === undefined) buckets.set(h, [found]); else b.push(found); }
    vid[c] = found;
  }
}
const VX = Float64Array.from(VXl); const VY = Float64Array.from(VYl); const VZ = Float64Array.from(VZl);
const IDX0 = Uint32Array.from(vid);
log(`loaded ${nTri0} facets, welded to ${nV} vertices ${el()}`);

// ── PRECOND, exhaustive (the same control the shipped tool runs) ──────────────────────────────────────
let PRECOND_V = -1; let PRECOND_UM = 0; let over50 = 0;
for (let v = 0; v < nV; v += 1) {
  const dd = Math.abs(Math.hypot(VX[v], VY[v]) - rA(Math.atan2(VY[v], VX[v]), VZ[v])) * 1000;
  if (dd > PRECOND_UM) { PRECOND_UM = dd; PRECOND_V = v; }
  if (dd > 50) over50 += 1;
}
log(`PRECOND exhaustive: MAX ${PRECOND_UM.toFixed(2)} um at v${PRECOND_V}, over-50um ${over50} ${el()}`);

const triArea = (a: number, b: number, c: number): number => {
  const ux = VX[b] - VX[a]; const uy = VY[b] - VY[a]; const uz = VZ[b] - VZ[a];
  const wx = VX[c] - VX[a]; const wy = VY[c] - VY[a]; const wz = VZ[c] - VZ[a];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
const dist = (i: number, j: number): number => Math.hypot(VX[i] - VX[j], VY[i] - VY[j], VZ[i] - VZ[j]);
const minAngleOf = (a: number, b: number, c: number): number => {
  const la = dist(b, c); const lb = dist(a, c); const lc = dist(a, b);
  const ang = (x: number, y: number, z: number): number => Math.acos(Math.max(-1, Math.min(1, (y * y + z * z - x * x) / (2 * y * z)))) * DEG;
  return Math.min(ang(la, lb, lc), ang(lb, la, lc), ang(lc, la, lb));
};
/** min altitude in mm — S111's sliver quantity (5.94 um there). */
const minAltOf = (a: number, b: number, c: number): number => {
  const L = Math.max(dist(b, c), dist(a, c), dist(a, b));
  return L > 0 ? (2 * triArea(a, b, c)) / L : 0;
};
function posDevOf(a: number, b: number, c: number, kk: number): number {
  let worst = 0;
  for (let i = 0; i <= kk; i += 1) {
    for (let j = 0; i + j <= kk; j += 1) {
      const w0 = (kk - i - j) / kk; const w1 = i / kk; const w2 = j / kk;
      const x = w0 * VX[a] + w1 * VX[b] + w2 * VX[c];
      const y = w0 * VY[a] + w1 * VY[b] + w2 * VY[c];
      const z = w0 * VZ[a] + w1 * VZ[b] + w2 * VZ[c];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}
const rDotOf = (a: number, b: number, c: number): number => {
  let nx = (VY[b] - VY[a]) * (VZ[c] - VZ[a]) - (VZ[b] - VZ[a]) * (VY[c] - VY[a]);
  let ny = (VZ[b] - VZ[a]) * (VX[c] - VX[a]) - (VX[b] - VX[a]) * (VZ[c] - VZ[a]);
  const nz = (VX[b] - VX[a]) * (VY[c] - VY[a]) - (VY[b] - VY[a]) * (VX[c] - VX[a]);
  const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; }
  const gx = (VX[a] + VX[b] + VX[c]) / 3; const gy = (VY[a] + VY[b] + VY[c]) / 3;
  const gl = Math.hypot(gx, gy); void nz;
  return gl > 0 ? (nx * gx + ny * gy) / gl : 0;
};
const scratch = new Float64Array(12);
const nsAt = (hh: number): (th: number, z: number, o: Float64Array) => number => fdNormals(rA, H, hh, hh);
function orientOf(a: number, b: number, c: number, ns: (th: number, z: number, o: Float64Array) => number,
  kk: number, inset: number): { normDeg: number; signMargin: number } {
  const ath = Math.atan2(VY[a], VX[a]);
  const bth = ath + dThRaw(ath, Math.atan2(VY[b], VX[b]));
  const cth = ath + dThRaw(ath, Math.atan2(VY[c], VX[c]));
  const r = orientOfFacet(ns, VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c], ath, bth, cth,
    { k: kk, inset, scratch });
  return { normDeg: r.normDeg, signMargin: r.signMargin };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE WELD — copied verbatim from s115OpDeblade.ts so the audited mesh is the audited mesh.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
type Mesh = { idx: Uint32Array; nF: number; src: Int32Array };
const MESH0: Mesh = { idx: IDX0, nF: nTri0, src: Int32Array.from({ length: nTri0 }, (_v, i) => i) };
const SHIFT = 67_108_864;
type Edge = { u: number; v: number; f1: number; f2: number; ang: number };
interface Topo { edges: Edge[]; keys: Set<number>; vOff: Int32Array; vFac: Int32Array }
function buildTopo(m: Mesh): Topo {
  const tmp = new Map<number, { u: number; v: number; f1: number; f2: number; n: number }>();
  for (let f = 0; f < m.nF; f += 1) {
    const a = m.idx[f * 3]; const b = m.idx[f * 3 + 1]; const c = m.idx[f * 3 + 2];
    for (const [p, r] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const lo = p < r ? p : r; const hi = p < r ? r : p; const k = lo * SHIFT + hi;
      const t = tmp.get(k);
      if (t === undefined) tmp.set(k, { u: lo, v: hi, f1: f, f2: -1, n: 1 });
      else { if (t.f2 < 0) t.f2 = f; t.n += 1; }
    }
  }
  const FN = new Float64Array(m.nF * 3);
  for (let f = 0; f < m.nF; f += 1) {
    const a = m.idx[f * 3]; const b = m.idx[f * 3 + 1]; const c = m.idx[f * 3 + 2];
    let nx = (VY[b] - VY[a]) * (VZ[c] - VZ[a]) - (VZ[b] - VZ[a]) * (VY[c] - VY[a]);
    let ny = (VZ[b] - VZ[a]) * (VX[c] - VX[a]) - (VX[b] - VX[a]) * (VZ[c] - VZ[a]);
    let nz = (VX[b] - VX[a]) * (VY[c] - VY[a]) - (VY[b] - VY[a]) * (VX[c] - VX[a]);
    const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; nz /= l; }
    FN[f * 3] = nx; FN[f * 3 + 1] = ny; FN[f * 3 + 2] = nz;
  }
  const edges: Edge[] = []; const keys = new Set<number>();
  for (const [k, t] of tmp) {
    keys.add(k);
    if (t.n !== 2) continue;
    let dp = FN[t.f1 * 3] * FN[t.f2 * 3] + FN[t.f1 * 3 + 1] * FN[t.f2 * 3 + 1] + FN[t.f1 * 3 + 2] * FN[t.f2 * 3 + 2];
    if (dp > 1) dp = 1; else if (dp < -1) dp = -1;
    edges.push({ u: t.u, v: t.v, f1: t.f1, f2: t.f2, ang: Math.acos(dp) * DEG });
  }
  const vDeg = new Int32Array(nV);
  for (let i = 0; i < m.nF * 3; i += 1) vDeg[m.idx[i]] += 1;
  const vOff = new Int32Array(nV + 1);
  for (let v = 0; v < nV; v += 1) vOff[v + 1] = vOff[v] + vDeg[v];
  const vFac = new Int32Array(m.nF * 3);
  const cur = Int32Array.from(vOff.subarray(0, nV));
  for (let f = 0; f < m.nF; f += 1) for (let k = 0; k < 3; k += 1) { const v = m.idx[f * 3 + k]; vFac[cur[v]] = f; cur[v] += 1; }
  return { edges, keys, vOff, vFac };
}
const apexOf = (m: Mesh, f: number, u: number, v: number): number => {
  const a = m.idx[f * 3]; const b = m.idx[f * 3 + 1]; const c = m.idx[f * 3 + 2];
  if (a !== u && a !== v) return a; if (b !== u && b !== v) return b; return c;
};
function applyOps(m: Mesh, remap: Int32Array, kill: Uint8Array): Mesh {
  const idx: number[] = []; const src: number[] = [];
  for (let f = 0; f < m.nF; f += 1) {
    if (kill[f] === 1) continue;
    const a = remap[m.idx[f * 3]]; const b = remap[m.idx[f * 3 + 1]]; const c = remap[m.idx[f * 3 + 2]];
    if (a === b || b === c || c === a) continue;
    idx.push(a, b, c); src.push(m.src[f]);
  }
  return { idx: Uint32Array.from(idx), nF: idx.length / 3, src: Int32Array.from(src) };
}
const WELDED_FROM = new Set<number>(); const WELDED_TO = new Set<number>();
function weldPass(m: Mesh, topo: Topo, targets: number[]): { mesh: Mesh; applied: number; skipped: number } {
  const remap = new Int32Array(nV); for (let v = 0; v < nV; v += 1) remap[v] = v;
  const consumed = new Uint8Array(nV); const isTarget = new Uint8Array(nV);
  const lockedF = new Uint8Array(m.nF); const kill = new Uint8Array(m.nF);
  const nbrOf = new Set<number>();
  let applied = 0; let skippedLink = 0;
  for (const ei of targets) {
    const e = topo.edges[ei];
    const p = apexOf(m, e.f1, e.u, e.v); const qq = apexOf(m, e.f2, e.u, e.v);
    if (p === qq) continue;
    if (lockedF[e.f1] === 1 || lockedF[e.f2] === 1) continue;
    const dp = topo.vOff[p + 1] - topo.vOff[p]; const dq = topo.vOff[qq + 1] - topo.vOff[qq];
    let from = dp <= dq ? p : qq; let to = dp <= dq ? qq : p;
    if (consumed[from] === 1 || isTarget[from] === 1 || consumed[to] === 1) {
      const alt = from; from = to; to = alt;
      if (consumed[from] === 1 || isTarget[from] === 1 || consumed[to] === 1) continue;
    }
    let clash = false;
    for (let i = topo.vOff[from]; i < topo.vOff[from + 1] && !clash; i += 1) if (lockedF[topo.vFac[i]] === 1) clash = true;
    for (let i = topo.vOff[to]; i < topo.vOff[to + 1] && !clash; i += 1) if (lockedF[topo.vFac[i]] === 1) clash = true;
    if (clash) continue;
    nbrOf.clear();
    for (let i = topo.vOff[to]; i < topo.vOff[to + 1]; i += 1) {
      const g = topo.vFac[i];
      nbrOf.add(m.idx[g * 3]); nbrOf.add(m.idx[g * 3 + 1]); nbrOf.add(m.idx[g * 3 + 2]);
    }
    let pinch = false;
    for (let i = topo.vOff[from]; i < topo.vOff[from + 1] && !pinch; i += 1) {
      const g = topo.vFac[i];
      for (let k = 0; k < 3; k += 1) {
        const w = m.idx[g * 3 + k];
        if (w === from || w === to || w === e.u || w === e.v) continue;
        if (nbrOf.has(w)) { pinch = true; break; }
      }
    }
    if (pinch) { skippedLink += 1; continue; }
    for (let i = topo.vOff[from]; i < topo.vOff[from + 1]; i += 1) lockedF[topo.vFac[i]] = 1;
    for (let i = topo.vOff[to]; i < topo.vOff[to + 1]; i += 1) lockedF[topo.vFac[i]] = 1;
    lockedF[e.f1] = 1; lockedF[e.f2] = 1;
    kill[e.f1] = 1; kill[e.f2] = 1;
    consumed[from] = 1; isTarget[to] = 1;
    remap[from] = to; applied += 1;
    WELDED_FROM.add(from); WELDED_TO.add(to);
  }
  return { mesh: applyOps(m, remap, kill), applied, skipped: skippedLink };
}

let mesh: Mesh = MESH0; let totalWelds = 0;
for (let pass = 0; pass < PASSES; pass += 1) {
  const topo = buildTopo(mesh);
  const t: number[] = [];
  for (let i = 0; i < topo.edges.length; i += 1) if (topo.edges[i].ang >= BLADE_BAR) t.push(i);
  t.sort((a, b) => topo.edges[b].ang - topo.edges[a].ang);
  if (t.length === 0) break;
  const r = weldPass(mesh, topo, t);
  if (r.applied === 0) break;
  mesh = r.mesh; totalWelds += r.applied;
  log(`  pass ${pass + 1}: targets ${t.length} applied ${r.applied} linkSkips ${r.skipped} facets ${mesh.nF} ${el()}`);
}
log(`A1 WELD reproduced: ${totalWelds} welds, facets ${nTri0} -> ${mesh.nF}  ${el()}`);

// provenance against the ORIGINAL
const present = new Uint8Array(nTri0);
const newFacets: number[] = [];
for (let f = 0; f < mesh.nF; f += 1) {
  const s = mesh.src[f];
  if (s >= 0 && mesh.idx[f * 3] === IDX0[s * 3] && mesh.idx[f * 3 + 1] === IDX0[s * 3 + 1]
    && mesh.idx[f * 3 + 2] === IDX0[s * 3 + 2]) present[s] = 1;
  else newFacets.push(f);
}
const removedSrc: number[] = [];
for (let f = 0; f < nTri0; f += 1) if (present[f] === 0) removedSrc.push(f);
log(`provenance: removed ${removedSrc.length}  new ${newFacets.length}`);
log('');

const OUT: Record<string, unknown> = { style: STYLE, stl: STL, welds: totalWelds, nF0: nTri0, nF1: mesh.nF,
  removed: removedSrc.length, new: newFacets.length, precond: { v: PRECOND_V, um: PRECOND_UM, over50 } };

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H4 — PRECOND REACH. Was the 1374.78 um vertex touched, and is the "EXCLUDED" claim implemented?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  let inNew = 0; let inNewArea = 0;
  for (const f of newFacets) {
    const a = mesh.idx[f * 3]; const b = mesh.idx[f * 3 + 1]; const c = mesh.idx[f * 3 + 2];
    if (a === PRECOND_V || b === PRECOND_V || c === PRECOND_V) { inNew += 1; inNewArea += triArea(a, b, c); }
  }
  let inRem = 0;
  for (const f of removedSrc) {
    const a = IDX0[f * 3]; const b = IDX0[f * 3 + 1]; const c = IDX0[f * 3 + 2];
    if (a === PRECOND_V || b === PRECOND_V || c === PRECOND_V) inRem += 1;
  }
  log('── H4: PRECOND-EXCEEDANCE REACH (the shipped tool claims this vertex is "EXCLUDED from every target set") ──');
  log(`   v${PRECOND_V} (${PRECOND_UM.toFixed(2)} um off rA):  welded AWAY (as from) ${WELDED_FROM.has(PRECOND_V)}   welded ONTO (as to) ${WELDED_TO.has(PRECOND_V)}`);
  log(`   facets touching it that were REMOVED ${inRem}   that are NEW ${inNew} (area ${inNewArea.toExponential(3)} mm2)`);
  OUT.h4 = { v: PRECOND_V, um: PRECOND_UM, weldedFrom: WELDED_FROM.has(PRECOND_V), weldedTo: WELDED_TO.has(PRECOND_V), inRem, inNew, inNewArea };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H1 / H3 — PAIRED parent -> child, EXACT (no stride, no cap)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Pair { pd0: number; pd1: number; rd0: number; rd1: number; ar0: number; ar1: number;
  ma0: number; ma1: number; al0: number; al1: number }
const pairs: Pair[] = [];
for (const f of newFacets) {
  const s = mesh.src[f];
  const a0 = IDX0[s * 3]; const b0 = IDX0[s * 3 + 1]; const c0 = IDX0[s * 3 + 2];
  const a1 = mesh.idx[f * 3]; const b1 = mesh.idx[f * 3 + 1]; const c1 = mesh.idx[f * 3 + 2];
  pairs.push({
    pd0: posDevOf(a0, b0, c0, POS_K), pd1: posDevOf(a1, b1, c1, POS_K),
    rd0: Math.abs(rDotOf(a0, b0, c0)), rd1: Math.abs(rDotOf(a1, b1, c1)),
    ar0: triArea(a0, b0, c0), ar1: triArea(a1, b1, c1),
    ma0: minAngleOf(a0, b0, c0), ma1: minAngleOf(a1, b1, c1),
    al0: minAltOf(a0, b0, c0), al1: minAltOf(a1, b1, c1),
  });
}
log(`── H1: PAIRED POSITION, parent -> child, SAME src, EXHAUSTIVE over all ${pairs.length} rewritten facets ──`);
{
  const rows: Array<Record<string, unknown>> = [];
  for (const [lbl, sel] of [['ALL (unrestricted projector)', (): boolean => true],
    [`HONEST BOTH SIDES (|rDot|>${RDOT_HON} on parent AND child)`, (p: Pair): boolean => p.rd0 > RDOT_HON && p.rd1 > RDOT_HON],
    [`HONEST CHILD ONLY (|rDot|>${RDOT_HON} on child, the shipped tool's cut)`, (p: Pair): boolean => p.rd1 > RDOT_HON]] as Array<[string, (p: Pair) => boolean]>) {
    const ss = pairs.filter(sel);
    let under0over1 = 0; let a_uo = 0; let over0under1 = 0; let a_ou = 0;
    let over0 = 0; let over1 = 0; let aOver0 = 0; let aOver1 = 0; let mx0 = 0; let mx1 = 0;
    let worsened = 0; let aWorse = 0; let totA0 = 0; let totA1 = 0;
    const d: number[] = [];
    for (const p of ss) {
      totA0 += p.ar0; totA1 += p.ar1;
      if (p.pd0 > POS_BAR) { over0 += 1; aOver0 += p.ar0; }
      if (p.pd1 > POS_BAR) { over1 += 1; aOver1 += p.ar1; }
      if (p.pd0 <= POS_BAR && p.pd1 > POS_BAR) { under0over1 += 1; a_uo += p.ar1; }
      if (p.pd0 > POS_BAR && p.pd1 <= POS_BAR) { over0under1 += 1; a_ou += p.ar0; }
      if (p.pd1 > p.pd0) { worsened += 1; aWorse += p.ar1; }
      if (p.pd0 > mx0) mx0 = p.pd0;
      if (p.pd1 > mx1) mx1 = p.pd1;
      d.push(p.pd1 - p.pd0);
    }
    log(`   ${lbl}`);
    log(`     n ${ss.length}   parent over-bar ${over0} (${pc(over0, ss.length)}%, AREA ${pc(aOver0, totA0)}%)   child over-bar ${over1} (${pc(over1, ss.length)}%, AREA ${pc(aOver1, totA1)}%)`);
    log(`     *** PUSHED OVER (was under, now over): ${under0over1} facets (${pc(under0over1, ss.length)}%), AREA ${a_uo.toFixed(4)} mm2 (${pc(a_uo, totA1)}% of the rewritten area) ***`);
    log(`     pulled under (was over, now under): ${over0under1} (${pc(over0under1, ss.length)}%), AREA ${a_ou.toFixed(4)} mm2`);
    log(`     worsened at all (pd up): ${worsened} (${pc(worsened, ss.length)}%)  AREA ${pc(aWorse, totA1)}%   d(pd) p50 ${ex(q(d, 0.5))} p90 ${ex(q(d, 0.9))} MAX ${ex(q(d, 1))} mm`);
    log(`     MAX parent ${ex(mx0)}  MAX child ${ex(mx1)} mm`);
    rows.push({ label: lbl, n: ss.length, over0, over1, pushedOver: under0over1, pushedOverArea: a_uo,
      pulledUnder: over0under1, worsened, maxParent: mx0, maxChild: mx1,
      dP50: q(d, 0.5), dP90: q(d, 0.9), dMax: q(d, 1) });
  }
  OUT.h1 = rows;
}
log('');

log('── H3: PAIRED SHAPE, parent -> child (S111 sliver quantity = MIN ALTITUDE) ──');
{
  const ma0 = pairs.map((p) => p.ma0); const ma1 = pairs.map((p) => p.ma1);
  const al0 = pairs.map((p) => p.al0 * 1000); const al1 = pairs.map((p) => p.al1 * 1000);
  let maWorse = 0; let alWorse = 0; let zero1 = 0; let zero0 = 0; let sub6um = 0; let sub6um0 = 0;
  for (const p of pairs) {
    if (p.ma1 < p.ma0) maWorse += 1;
    if (p.al1 < p.al0) alWorse += 1;
    if (!(p.ar1 > 0)) zero1 += 1;
    if (!(p.ar0 > 0)) zero0 += 1;
    if (p.al1 * 1000 < 5.94) sub6um += 1;
    if (p.al0 * 1000 < 5.94) sub6um0 += 1;
  }
  log(`   minAngle  parent p10 ${f4(q(ma0, 0.1))} p50 ${f4(q(ma0, 0.5))}  ->  child p10 ${f4(q(ma1, 0.1))} p50 ${f4(q(ma1, 0.5))} deg   worsened ${maWorse}/${pairs.length} (${pc(maWorse, pairs.length)}%)`);
  log(`   minAlt um parent p10 ${ex(q(al0, 0.1))} p50 ${ex(q(al0, 0.5))}  ->  child p10 ${ex(q(al1, 0.1))} p50 ${ex(q(al1, 0.5))}   worsened ${alWorse} (${pc(alWorse, pairs.length)}%)`);
  log(`   *** SLIVERS by S111's 5.94 um min-altitude bar: parent ${sub6um0} (${pc(sub6um0, pairs.length)}%)  ->  child ${sub6um} (${pc(sub6um, pairs.length)}%) ***`);
  log(`   exactly-zero-area: parent ${zero0}  child ${zero1}`);
  OUT.h3 = { maP10_0: q(ma0, 0.1), maP50_0: q(ma0, 0.5), maP10_1: q(ma1, 0.1), maP50_1: q(ma1, 0.5),
    maWorse, alWorse, sub6um0, sub6um, zero0, zero1, n: pairs.length };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H2 — INVERSION CENSUS (normDeg > 90). The shipped run never counts these.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── H2: INVERSION CENSUS (normDeg > 90 — the campaign definition), COUNT + AREA + signMargin ──');
log('   h swept (scar 3). NEW set exhaustive; REMOVED set exhaustive; whole-mesh base by stride.');
log('   set              h        n       inv COUNT      inv%      inv AREA mm2   inv AREA%    sgnMargin p50   ndP50');
{
  const rows: Array<Record<string, unknown>> = [];
  {
    const doSet = (label: string, hh: number, list: number[], src: 'orig' | 'new', stride: number): void => {
      const ns = nsAt(hh);
      let n = 0; let inv = 0; let aTot = 0; let aInv = 0; const sm: number[] = []; const ndl: number[] = [];
      for (let i = 0; i < list.length; i += stride) {
        const f = list[i];
        const a = src === 'orig' ? IDX0[f * 3] : mesh.idx[f * 3];
        const b = src === 'orig' ? IDX0[f * 3 + 1] : mesh.idx[f * 3 + 1];
        const c = src === 'orig' ? IDX0[f * 3 + 2] : mesh.idx[f * 3 + 2];
        const r = orientOf(a, b, c, ns, K_REF, INSET_REF);
        const ar = triArea(a, b, c);
        n += 1; aTot += ar; ndl.push(r.normDeg);
        if (r.normDeg > 90) { inv += 1; aInv += ar; sm.push(r.signMargin); }
      }
      log(`   ${label.padEnd(16)} ${hh.toExponential(0).padStart(6)} ${String(n).padStart(8)} ${String(inv * stride).padStart(13)} ${pc(inv, n).padStart(9)}% ${(aInv * stride).toFixed(3).padStart(15)} ${pc(aInv, aTot).padStart(11)}% ${f4(q(sm, 0.5)).padStart(15)} ${f4(q(ndl, 0.5)).padStart(8)} ${el()}`);
      rows.push({ set: label, h: hh, n, inv, invScaled: inv * stride, invArea: aInv * stride, totArea: aTot * stride, smP50: q(sm, 0.5), ndP50: q(ndl, 0.5), stride });
    };
    const baseList: number[] = [];
    for (let f = 0; f < nTri0; f += BASE_STRIDE) baseList.push(f);
    // h ladder on the two sets the verdict rests on; the common-mode base at the reference h.
    for (const hh of [2e-7, 2e-6, 2e-4, 1e-3]) doSet('NEW (A1)', hh, newFacets, 'new', 1);
    log('');
    doSet('REMOVED (A1)', 2e-6, removedSrc, 'orig', 1);
    for (const hh of [2e-7, 2e-4, 1e-3]) doSet('REMOVED (A1)', hh, removedSrc, 'orig', 8);
    log('');
    doSet('SHIPPING base', 2e-6, baseList, 'orig', 1);
    log('');
  }
  OUT.h2 = rows;
}

writeFileSync(`${OUTDIR}/S115REVHARM_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/S115REVHARM_${TAG}.json  done ${el()}`);

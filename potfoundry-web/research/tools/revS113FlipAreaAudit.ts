// revS113FlipAreaAudit.ts — ADVERSARIAL AUDIT of s113opFlip.ts.
//
// LENS: is the operator silently skipping cases, DOUBLE-COUNTING AREA, or reporting COUNT where AREA
// disagrees? This tool replicates s113opFlip's operator VERBATIM (same rows, same order, same predicates)
// and then re-measures the same quantities with the accounting the original did NOT use, so the two can
// be diffed as PRINTED VALUES.
//
// WHAT IS UNDER TEST
//  1. s113opFlip.ts:452 `ndCen` charges every facet `d0.areaMm2[...]` — the BEFORE area — for BOTH the
//     BEFORE and the AFTER normDeg census. A flipped facet's area CHANGES. So RESULT 2's AFTER "area"
//     column is a stale-weight number. Re-weight with d1 and diff.
//  2. The 1-RING block prints AREA ONLY. COUNT and MAX are computed (cR0/cR1) and dropped. Print them.
//  3. FLOOR-3's worseArea/betterArea also use d0 areas. Re-weight.
//  4. Is the operator's REACH the binding constraint? Score the operator ONLY on the pairs it actually
//     accepted (parents vs children), which removes the dilution from the 58.9% it refused.
//  5. Is the area drop genuine geometry or a degenerate-triangle bug? Parent/child area, min child area.
//  6. MECHANISM CROSS-CHECK: sample 33 points along the OLD diagonal and the NEW diagonal and take the
//     SUP of |r_edge - rA| (a 1-D FOOTPRINT probe of the edge, not an endpoint probe). An edge lying ON
//     the crease chords the surface far less than one crossing it.
//
// Usage: bash research/tools/run-rev-s113-flip-audit.sh   (PF_S113_STL = absolute path)
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const SET = process.env.PF_S113_SET ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const K = Math.round(envF('PF_S113_K', 8));
const INSET_LO = envF('PF_S113_INSET_LO', 0);
const INSET_HI = envF('PF_S113_INSET_HI', 0.05);
const HI_DEG = envF('PF_S113_HI_DEG', 45);
const AR_CAP = envF('PF_S113_AR_CAP', 50);
const DIMS: StyleDims = { H: envF('PF_S113_H', 120), Rb: envF('PF_S113_RB', 40), Rt: envF('PF_S113_RT', 50), expn: 1 };
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
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

log('===== REV AUDIT of S113 OPFLIP — area accounting, coverage, and the mechanism claim =====');
log('');

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (pinned: 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch ***'); process.exit(4); }
}
log(`mesh ${nTri} facets  ${el()}`);

function weldSoup(xyz: Float64Array, n: number): { id: Int32Array; vx: Float64Array; vy: Float64Array; vz: Float64Array; nV: number } {
  const nVin = n * 3;
  const id = new Int32Array(nVin);
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const cx: number[] = []; const cy: number[] = []; const cz: number[] = [];
  let next = 0;
  for (let v = 0; v < nVin; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35);
    h |= 0;
    const bucket = buckets.get(h);
    let found = -1;
    if (bucket !== undefined) for (const cc of bucket) if (cx[cc] === x && cy[cc] === y && cz[cc] === z) { found = cc; break; }
    if (found < 0) {
      found = next; next += 1;
      cx.push(x); cy.push(y); cz.push(z);
      if (bucket === undefined) buckets.set(h, [found]); else bucket.push(found);
    }
    id[v] = found;
  }
  return { id, vx: Float64Array.from(cx), vy: Float64Array.from(cy), vz: Float64Array.from(cz), nV: next };
}
const W = weldSoup(xyz0, nTri);
const EKEY = 67_108_864;
const ekey = (a: number, b: number): number => (a < b ? a * EKEY + b : b * EKEY + a);
const baseEdges = new Set<number>();
for (let f = 0; f < nTri; f += 1) {
  const a = W.id[f * 3]; const b = W.id[f * 3 + 1]; const c = W.id[f * 3 + 2];
  baseEdges.add(ekey(a, b)); baseEdges.add(ekey(b, c)); baseEdges.add(ekey(c, a));
}
const VT = new Float64Array(W.nV);
for (let v = 0; v < W.nV; v += 1) VT[v] = Math.atan2(W.vy[v], W.vx[v]);

const idxIdentity = new Uint32Array(nTri * 3).map((_, i) => i);
const d0 = facetDihedrals(xyz0, idxIdentity);
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
log(`BEFORE census: area ${meshArea0.toFixed(3)} mm2  ${el()}`);

interface Row { e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number; tri1: number[]; tri2: number[] }
const rows: Row[] = readFileSync(SET, 'utf8').split('\n').filter((s) => s.length > 2).map((s) => JSON.parse(s) as Row);
{
  let worst = 0;
  for (const r of rows) for (let k = 0; k < 9; k += 1) {
    worst = Math.max(worst, Math.abs(r.tri1[k] - xyz0[r.f1 * 9 + k]), Math.abs(r.tri2[k] - xyz0[r.f2 * 9 + k]));
  }
  log(`INPUT CONTROL: max |ndjson tri - STL tri| = ${worst}`);
  if (worst > 0) process.exit(5);
}
const U: number[] = [];
{
  const seen = new Set<number>();
  for (const r of rows) { if (!seen.has(r.f1)) { seen.add(r.f1); U.push(r.f1); } if (!seen.has(r.f2)) { seen.add(r.f2); U.push(r.f2); } }
}
const inU = new Uint8Array(nTri);
for (const f of U) inU[f] = 1;
let areaU0 = 0;
for (const f of U) areaU0 += d0.areaMm2[f];
log(`pairs ${rows.length}  unique facets ${U.length}  AREA ${areaU0.toFixed(4)} mm2 = ${((areaU0 / meshArea0) * 100).toFixed(4)}%`);

const probe: number[] = [];
{
  const inP = new Uint8Array(nTri);
  for (const f of U) inP[f] = 1;
  for (let e = 0; e < d0.edgeAngRad.length; e += 1) {
    const a = d0.edgeF1[e]; const b = d0.edgeF2[e];
    if (inU[a] === 1) inP[b] = 1;
    if (inU[b] === 1) inP[a] = 1;
  }
  for (let f = 0; f < nTri; f += 1) if (inP[f] === 1) probe.push(f);
}
const ring: number[] = probe.filter((f) => inU[f] !== 1);
log(`probe ${probe.length}  ring ${ring.length}  ${el()}`);
log('');

function normDegTri(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, inset: number,
): number {
  const a = Math.atan2(ay, ax);
  const b = a + dThRaw(a, Math.atan2(by, bx));
  const c = a + dThRaw(a, Math.atan2(cy, cx));
  return orientOfFacet(nsKink, ax, ay, az, bx, by, bz, cx, cy, cz, a, b, c, { k: K, inset, scratch }).normDeg;
}
const normDegOf = (xyz: Float64Array, f: number, inset: number): number => normDegTri(
  xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
  xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], inset,
);
function arOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const s = 0.5 * (ab + bc + ca);
  if (!(area > 0) || !(s > 0)) return Infinity;
  return Math.max(ab, bc, ca) / (2 * (area / s));
}
function nrmOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  return L > 0 ? [nx / L, ny / L, nz / L] : [0, 0, 0];
}
/** SUP of |r - rA| over 33 samples along an edge — a 1-D FOOTPRINT probe, not an endpoint probe. */
function edgeChordSup(p: number, r: number): number {
  let worst = 0;
  for (let s = 0; s <= 32; s += 1) {
    const t = s / 32;
    const x = W.vx[p] + (W.vx[r] - W.vx[p]) * t;
    const y = W.vy[p] + (W.vy[r] - W.vy[p]) * t;
    const z = W.vz[p] + (W.vz[r] - W.vz[p]) * t;
    const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (d > worst) worst = d;
  }
  return worst;
}

// ── OPERATOR, verbatim from s113opFlip.ts ─────────────────────────────────────────────────────────
interface Acc { i: number; f1: number; f2: number; u: number; v: number; c: number; dv: number }
const REASONS = ['ACCEPT', 'notEdgePair', 'conflict', 'sameOpp', 'dup', 'fold', 'invert3d', 'shape', 'noImprove'] as const;
function runArm(guard: boolean): { xyz: Float64Array; touched: Uint8Array; acc: Acc[]; why: Int32Array } {
  const xyz = Float64Array.from(xyz0);
  const touched = new Uint8Array(nTri);
  const created = new Set<number>();
  const acc: Acc[] = [];
  const why = new Int32Array(rows.length);
  const P = (id: number, k: number): number => (k === 0 ? W.vx[id] : k === 1 ? W.vy[id] : W.vz[id]);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const f1 = r.f1; const f2 = r.f2;
    const A1 = [W.id[f1 * 3], W.id[f1 * 3 + 1], W.id[f1 * 3 + 2]];
    const A2 = [W.id[f2 * 3], W.id[f2 * 3 + 1], W.id[f2 * 3 + 2]];
    const sh = A1.filter((x) => A2.includes(x));
    if (sh.length !== 2) { why[i] = 1; continue; }
    if (touched[f1] === 1 || touched[f2] === 1) { why[i] = 2; continue; }
    const u = sh[0]; const v = sh[1];
    const c = A1.find((x) => x !== u && x !== v) as number;
    const dv = A2.find((x) => x !== u && x !== v) as number;
    if (c === dv) { why[i] = 3; continue; }
    if (baseEdges.has(ekey(c, dv)) || created.has(ekey(c, dv))) { why[i] = 4; continue; }
    const t0th = VT[u];
    const pux = 0; const puy = W.vz[u];
    const pvx = dThRaw(t0th, VT[v]); const pvy = W.vz[v];
    const pcx = dThRaw(t0th, VT[c]); const pcy = W.vz[c];
    const pdx = dThRaw(t0th, VT[dv]); const pdy = W.vz[dv];
    const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
    const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
    if (!(s1 * s2 < 0 && s3 * s4 < 0)) { why[i] = 5; continue; }
    let f1IsUV = false;
    for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
    const cc = f1IsUV ? c : dv; const dd = f1IsUV ? dv : c;
    const n1 = [cc, u, dd]; const n2 = [cc, dd, v];
    const g1 = nrmOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const g2 = nrmOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const o1 = nrmOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
    const o2 = nrmOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
    const mx = o1[0] + o2[0]; const my = o1[1] + o2[1]; const mz = o1[2] + o2[2];
    if (!(Math.hypot(mx, my, mz) > 0) || !(g1[0] * mx + g1[1] * my + g1[2] * mz > 0 && g2[0] * mx + g2[1] * my + g2[2] * mz > 0)) { why[i] = 6; continue; }
    const arC1 = arOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const arC2 = arOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const arP1 = arOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
    const arP2 = arOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
    if (!(arC1 <= Math.max(AR_CAP, arP1, arP2) && arC2 <= Math.max(AR_CAP, arP1, arP2))) { why[i] = 7; continue; }
    const ndB = Math.max(normDegOf(xyz0, f1, INSET_HI), normDegOf(xyz0, f2, INSET_HI));
    const ndA = Math.max(
      normDegTri(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2), INSET_HI),
      normDegTri(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2), INSET_HI),
    );
    if (guard && !(ndA < ndB - 1e-9)) { why[i] = 8; continue; }
    for (let k = 0; k < 3; k += 1) {
      xyz[f1 * 9 + k * 3] = W.vx[n1[k]]; xyz[f1 * 9 + k * 3 + 1] = W.vy[n1[k]]; xyz[f1 * 9 + k * 3 + 2] = W.vz[n1[k]];
      xyz[f2 * 9 + k * 3] = W.vx[n2[k]]; xyz[f2 * 9 + k * 3 + 1] = W.vy[n2[k]]; xyz[f2 * 9 + k * 3 + 2] = W.vz[n2[k]];
    }
    touched[f1] = 1; touched[f2] = 1;
    created.add(ekey(c, dv));
    acc.push({ i, f1, f2, u, v, c, dv });
  }
  return { xyz, touched, acc, why };
}

const thr = (HI_DEG * Math.PI) / 180;
interface Cen { n: number; nTot: number; area: number; areaTot: number; max: number }
function census(d: { perFacetMaxRad: Float64Array; areaMm2: Float64Array }, set: number[]): Cen {
  let n = 0; let area = 0; let max = 0; let areaTot = 0; let nTot = 0;
  for (const f of set) {
    const a = d.perFacetMaxRad[f];
    nTot += 1; areaTot += d.areaMm2[f];
    if (a > max) max = a;
    if (a > thr) { n += 1; area += d.areaMm2[f]; }
  }
  return { n, nTot, area, areaTot, max: (max * 180) / Math.PI };
}
const line = (t: string, c: Cen): void => log(
  `    ${t.padEnd(34)} COUNT ${String(c.n).padStart(6)}/${String(c.nTot).padStart(7)}  AREA ${c.area.toFixed(4).padStart(9)}/${c.areaTot.toFixed(4).padStart(9)} mm2  SHARE ${((c.areaTot > 0 ? c.area / c.areaTot : 0) * 100).toFixed(3)}%  MAX ${c.max.toFixed(2)}`,
);

const ndBefore: Record<string, Float64Array> = {};
for (const inset of [INSET_LO, INSET_HI]) {
  const b = new Float64Array(probe.length);
  for (let i = 0; i < probe.length; i += 1) b[i] = normDegOf(xyz0, probe[i], inset);
  ndBefore[String(inset)] = b;
}
log(`BEFORE normDeg on probe set  ${el()}`);
log('');

for (const arm of [{ n: 'A UNCONDITIONAL', guard: false }, { n: 'B GUARDED (C1)', guard: true }]) {
  log('══════════════════════════════════════════════════════════════════════════════════════════');
  log(`ARM ${arm.n}`);
  log('══════════════════════════════════════════════════════════════════════════════════════════');
  const R = runArm(arm.guard);
  const d1 = facetDihedrals(R.xyz, idxIdentity);
  let meshArea1 = 0;
  for (let f = 0; f < nTri; f += 1) meshArea1 += d1.areaMm2[f];
  const cnt: number[] = new Array(REASONS.length).fill(0);
  for (let i = 0; i < rows.length; i += 1) cnt[R.why[i]] += 1;
  cnt[0] = R.acc.length;
  log(`  accepted ${R.acc.length}  refusals: ${REASONS.slice(1).map((s, k) => `${s}=${cnt[k + 1]}`).join(' ')}  SUM ${cnt.reduce((a, b) => a + b, 0)} (must be ${rows.length})`);
  log(`  mesh area ${meshArea0.toFixed(4)} -> ${meshArea1.toFixed(4)} mm2`);
  log('');

  // ── CHECK 1: COUNT + AREA + MAX for EVERY region, including the ones the report printed area-only ──
  log('  ── CHECK 1 — every region with COUNT and AREA and MAX (dihedral > 45 deg) ──');
  const flipped: number[] = [];
  for (const a of R.acc) { flipped.push(a.f1); flipped.push(a.f2); }
  const unflippedU = U.filter((f) => R.touched[f] !== 1);
  line('U  BEFORE', census(d0, U)); line('U  AFTER ', census(d1, U));
  line('  of which FLIPPED  BEFORE', census(d0, flipped)); line('  of which FLIPPED  AFTER ', census(d1, flipped));
  line('  of which UNFLIPPED BEFORE', census(d0, unflippedU)); line('  of which UNFLIPPED AFTER ', census(d1, unflippedU));
  line('1-RING BEFORE', census(d0, ring)); line('1-RING AFTER ', census(d1, ring));
  const uPlusRing = U.concat(ring);
  line('U + 1-RING BEFORE', census(d0, uPlusRing)); line('U + 1-RING AFTER ', census(d1, uPlusRing));
  log('');

  // ── CHECK 2: does the operator work on the population it ACTUALLY treats? ──
  const fp0 = census(d0, flipped); const fp1 = census(d1, flipped);
  log('  ── CHECK 2 — the operator scored ONLY on the pairs it accepted (reach removed) ──');
  log(`    over-bar AREA ${fp0.area.toFixed(4)} -> ${fp1.area.toFixed(4)} mm2   raw ratio ${(fp0.area / fp1.area).toFixed(4)}x`);
  log(`    those facets' TOTAL area ${fp0.areaTot.toFixed(4)} -> ${fp1.areaTot.toFixed(4)} mm2  (${(fp0.areaTot / fp1.areaTot).toFixed(4)}x)`);
  log(`    over-bar SHARE ${((fp0.area / fp0.areaTot) * 100).toFixed(3)}% -> ${((fp1.area / fp1.areaTot) * 100).toFixed(3)}%   => SHARE ratio ${((fp0.area / fp0.areaTot) / (fp1.area / fp1.areaTot)).toFixed(4)}x`);
  log(`    over-bar COUNT ${fp0.n}/${fp0.nTot} -> ${fp1.n}/${fp1.nTot}`);
  log('');

  // ── CHECK 3: is the area drop genuine, or degenerate children? ──
  {
    let minChild = Infinity; let zeroish = 0; const ratios: number[] = [];
    for (const a of R.acc) {
      const p = d0.areaMm2[a.f1] + d0.areaMm2[a.f2];
      const c = d1.areaMm2[a.f1] + d1.areaMm2[a.f2];
      ratios.push(c / p);
      minChild = Math.min(minChild, d1.areaMm2[a.f1], d1.areaMm2[a.f2]);
      if (d1.areaMm2[a.f1] < 1e-12 || d1.areaMm2[a.f2] < 1e-12) zeroish += 1;
    }
    log('  ── CHECK 3 — quad re-cut: child area / parent area, per accepted flip ──');
    log(`    p10 ${q(ratios, 0.1).toFixed(4)} p50 ${q(ratios, 0.5).toFixed(4)} p90 ${q(ratios, 0.9).toFixed(4)}  MIN ${Math.min(...ratios).toFixed(4)} MAX ${Math.max(...ratios).toFixed(4)}`);
    log(`    flips where children are SMALLER: ${ratios.filter((x) => x < 1).length} of ${ratios.length}`);
    log(`    smallest child facet area ${minChild.toExponential(3)} mm2; degenerate (<1e-12) children: ${zeroish}`);
  }
  log('');

  // ── CHECK 4: RESULT 2 re-weighted with the AFTER areas ──
  const ndAfter: Record<string, Float64Array> = {};
  for (const inset of [INSET_LO, INSET_HI]) {
    const a = new Float64Array(probe.length);
    for (let i = 0; i < probe.length; i += 1) a[i] = normDegOf(R.xyz, probe[i], inset);
    ndAfter[String(inset)] = a;
  }
  const ndCen = (v: Float64Array, bar: number, ar: Float64Array): { n: number; area: number; areaTot: number; max: number } => {
    let n = 0; let area = 0; let max = 0; let areaTot = 0;
    for (let i = 0; i < probe.length; i += 1) {
      if (inU[probe[i]] !== 1) continue;
      areaTot += ar[probe[i]];
      if (v[i] > max) max = v[i];
      if (v[i] > bar) { n += 1; area += ar[probe[i]]; }
    }
    return { n, area, areaTot, max };
  };
  log('  ── CHECK 4 — RESULT 2 normDeg census: TOOL weighting (d0 areas) vs HONEST (d1 areas) ──');
  log(`     U total area BEFORE ${census(d0, U).areaTot.toFixed(4)} mm2 | AFTER ${census(d1, U).areaTot.toFixed(4)} mm2`);
  for (const inset of [INSET_LO, INSET_HI]) {
    for (const bar of [1, 10, 45]) {
      const cb = ndCen(ndBefore[String(inset)], bar, d0.areaMm2);
      const caStale = ndCen(ndAfter[String(inset)], bar, d0.areaMm2);
      const caTrue = ndCen(ndAfter[String(inset)], bar, d1.areaMm2);
      log(`    inset ${String(inset).padEnd(5)} bar ${String(bar).padStart(2)} | BEFORE n=${String(cb.n).padStart(5)} area=${cb.area.toFixed(4).padStart(8)} share=${((cb.area / cb.areaTot) * 100).toFixed(2)}%`
        + ` | AFTER(tool,d0) n=${String(caStale.n).padStart(5)} area=${caStale.area.toFixed(4).padStart(8)}`
        + ` | AFTER(honest,d1) n=${String(caTrue.n).padStart(5)} area=${caTrue.area.toFixed(4).padStart(8)} share=${((caTrue.area / caTrue.areaTot) * 100).toFixed(2)}%`
        + ` | tool overstates by ${(caStale.area / caTrue.area).toFixed(4)}x`);
    }
  }
  log('');

  // ── CHECK 5: FLOOR-3 re-weighted ──
  {
    const b = ndBefore[String(INSET_HI)]; const a = ndAfter[String(INSET_HI)];
    let wN = 0; let wA0 = 0; let wA1 = 0; let bN = 0; let bA0 = 0; let bA1 = 0; let over = 0; let worstUp = 0;
    for (let i = 0; i < probe.length; i += 1) {
      const del = a[i] - b[i]; const f = probe[i];
      if (del > 1e-12) { wN += 1; wA0 += d0.areaMm2[f]; wA1 += d1.areaMm2[f]; if (del > worstUp) worstUp = del; if (del > 5) over += 1; }
      else if (del < -1e-12) { bN += 1; bA0 += d0.areaMm2[f]; bA1 += d1.areaMm2[f]; }
    }
    log('  ── CHECK 5 — FLOOR-3 population, weighted both ways ──');
    log(`    WORSE  n=${wN}  area(d0)=${wA0.toFixed(4)}  area(d1)=${wA1.toFixed(4)} mm2`);
    log(`    BETTER n=${bN}  area(d0)=${bA0.toFixed(4)}  area(d1)=${bA1.toFixed(4)} mm2`);
    log(`    => by COUNT ${wN > bN ? 'WORSE wins' : 'BETTER wins'}; by AREA(d1) ${wA1 > bA1 ? 'WORSE wins' : 'BETTER wins'}  <= DIRECTION CHECK`);
    log(`    facets over +5 deg ${over}; worst +${worstUp.toFixed(3)} deg`);
  }
  log('');

  // ── CHECK 6: the mechanism — does the new diagonal sit ON the crease or ACROSS it? ──
  {
    const oldSup: number[] = []; const newSup: number[] = []; let newWorse = 0;
    for (const a of R.acc) {
      const o = edgeChordSup(a.u, a.v); const n = edgeChordSup(a.c, a.dv);
      oldSup.push(o); newSup.push(n);
      if (n > o) newWorse += 1;
    }
    log('  ── CHECK 6 — 33-point FOOTPRINT probe of the diagonal: SUP |r_edge - rA| (mm) ──');
    log(`    OLD diagonal (u-v) p10 ${q(oldSup, 0.1).toFixed(4)} p50 ${q(oldSup, 0.5).toFixed(4)} p90 ${q(oldSup, 0.9).toFixed(4)} MAX ${Math.max(...oldSup).toFixed(4)}`);
    log(`    NEW diagonal (c-d) p10 ${q(newSup, 0.1).toFixed(4)} p50 ${q(newSup, 0.5).toFixed(4)} p90 ${q(newSup, 0.9).toFixed(4)} MAX ${Math.max(...newSup).toFixed(4)}`);
    log(`    flips where the NEW diagonal chords the surface MORE than the old: ${newWorse} of ${R.acc.length} = ${((newWorse / R.acc.length) * 100).toFixed(2)}%`);
    log(`    median ratio new/old ${(q(newSup, 0.5) / q(oldSup, 0.5)).toFixed(3)}x`);
  }
  log('');

  // ── CHECK 7: what the REFUSED pairs hold — the operator's reach ceiling ──
  {
    const held: number[] = new Array(REASONS.length).fill(0);
    const heldN: number[] = new Array(REASONS.length).fill(0);
    const counted = new Uint8Array(nTri);
    for (let i = 0; i < rows.length; i += 1) {
      for (const f of [rows[i].f1, rows[i].f2]) {
        if (counted[f] === 1) continue;
        counted[f] = 1;
        held[R.why[i]] += d0.areaMm2[f]; heldN[R.why[i]] += 1;
      }
    }
    log('  ── CHECK 7 — BEFORE over-bar area held by each disposition (unique facets, first-seen row) ──');
    for (let k = 0; k < REASONS.length; k += 1) {
      if (heldN[k] === 0) continue;
      log(`    ${REASONS[k].padEnd(12)} facets ${String(heldN[k]).padStart(5)}  area ${held[k].toFixed(4).padStart(9)} mm2 = ${((held[k] / areaU0) * 100).toFixed(2)}% of U`);
    }
    log(`    SUM facets ${heldN.reduce((a, b) => a + b, 0)} (must be ${U.length})  area ${held.reduce((a, b) => a + b, 0).toFixed(4)} (must be ${areaU0.toFixed(4)})`);
  }
  log('');
}
log(`done ${el()}`);

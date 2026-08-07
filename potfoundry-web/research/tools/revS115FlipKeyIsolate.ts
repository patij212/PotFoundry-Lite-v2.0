// revS115FlipKeyIsolate.ts — S115 REVIEW: isolate the ACCEPT CLAUSE from the ORDERING KEY and the COUNT.
//
// S115's s115opFlipCT.ts ran two placebos:
//   P1 = random over ALL interior edges, cost-matched to arm A (42050 flips)
//   P2 = random over the CLASS edges,    cost-matched to arm B (20580 flips)
// and concluded (a) arm B beats its placebo so the C1 normDeg clause "carries real signal", and
// (b) arm A is "indistinguishable from random" because 0.9933x ~ P2's 0.9944x.
//
// Both conclusions are under-controlled:
//   * B vs P2 differs in THREE things at once: the accept clause (guard), the ordering key
//     (worst-dihedral-first vs random), and nothing else — but the FLIP COUNT is matched only
//     because the guard happens to accept 20580. It is not shown that the CLAUSE, rather than
//     simply STOPPING EARLIER on the same worst-first key, is what produces +52 mm2.
//   * A vs P2 is NOT cost-matched: 42050 flips vs 20580. The in-class placebo cost-matched to
//     arm A was never drawn.
//
// This tool adds exactly the two missing arms, on the same STL, same weld, same candidate order:
//   T  = UNGUARDED, worst-dihedral-first, TRUNCATED at 20580 accepts  -> isolates the guard
//   P2A= random over CLASS edges, cost-matched to arm A at 42050      -> the missing A placebo
// and reproduces A / B / P2 as controls that this distilled re-implementation is the same operator.
//
// Nothing under src/ or research/bridge/ is modified. STL read-only by absolute path.
import { mkdirSync, writeFileSync } from 'node:fs';
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
const DEG = 180 / Math.PI;

const STYLE = 'CelticTriquetra';
const STL = process.env.PF_REVKI_STL
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/celtictriquetra_ring_D--.stl';
const K_REF = 8; const INSET_REF = 0.05; const H_REF = 2e-6;
const HI_DEG = 45; const AR_CAP = 50; const SEED = Math.round(envF('PF_REVKI_SEED', 20260807));
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s115flip';
mkdirSync(OUTDIR, { recursive: true });

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a += 0x6d2b79f5; a >>>= 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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

log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('REV-S115 — DOES THE C1 ACCEPT CLAUSE DO THE WORK, OR IS IT JUST "STOP AT 20580"?');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log('');
log('PRE-REGISTERED READ (stated before any result):');
log('  If arm T (UNGUARDED, worst-first, truncated to arm B\'s 20580 accepts) reaches a whole-mesh');
log('  over-45 AREA reduction COMPARABLE TO arm B\'s +52.04 mm2, then the C1 normDeg accept clause is');
log('  NOT what produces the gain — stopping early on the same key is — and S115\'s claim that the');
log('  clause "carries real signal" is REFUTED. If T is materially worse than B, the claim STANDS.');
log('  If arm P2A (in-class RANDOM at arm A\'s 42050) lands near arm A\'s 0.9933x, S115\'s');
log('  "indistinguishable from random" claim is CONFIRMED on a properly cost-matched placebo.');
log('');

const defs = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...defs }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsRef = fdNormals(rA, H, H_REF, H_REF);
const scratch = new Float64Array(12);

const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri = M.nTri;
const idxIdentity = new Uint32Array(nTri * 3);
for (let i = 0; i < nTri * 3; i += 1) idxIdentity[i] = i;
const d0 = facetDihedrals(xyz0, idxIdentity);
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
const thrRef = (HI_DEG * Math.PI) / 180;
let cN0 = 0; let cA0 = 0;
for (let f = 0; f < nTri; f += 1) if (d0.perFacetMaxRad[f] > thrRef) { cN0 += 1; cA0 += d0.areaMm2[f]; }
log(`loaded ${nTri} facets  AREA ${meshArea0.toFixed(3)} mm2  interior ${d0.interiorEdges} boundary ${d0.boundaryEdges}  ${el()}`);
log(`CONTROL R1-BEFORE: >45 COUNT ${cN0} AREA ${cA0.toFixed(4)} mm2 = ${((cA0 / meshArea0) * 100).toFixed(4)}%   ${cN0 === 306737 && Math.abs(cA0 - 1585.8350) < 5e-3 ? 'REPRODUCES S115 EXACTLY' : '*** DIFFERS — VOID ***'}`);
if (!(cN0 === 306737 && Math.abs(cA0 - 1585.835) < 5e-3)) process.exit(3);

// PRECOND — same exhaustive pass, to reproduce the 4 offending facets S115 excluded.
const badF = new Set<number>();
{
  let worstE = 0;
  for (let f = 0; f < nTri; f += 1) {
    let dm = 0;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > dm) dm = dd;
    }
    if (dm > worstE) worstE = dm;
    if (dm * 1000 > 50) badF.add(f);
  }
  log(`CONTROL PRECOND: exhaustive MAX ${(worstE * 1000).toFixed(1)} um, ${badF.size} facets over the 50 um gate: ${[...badF].join(' ')}`);
}

// ── weld, identical to s115opFlipCT ──────────────────────────────────────────────────────────────
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
const edgeMap = new Map<number, number[]>();
for (let f = 0; f < nTri; f += 1) {
  const a = W.id[f * 3]; const b = W.id[f * 3 + 1]; const c = W.id[f * 3 + 2];
  for (const k of [ekey(a, b), ekey(b, c), ekey(c, a)]) {
    const g = edgeMap.get(k);
    if (g === undefined) edgeMap.set(k, [f]); else g.push(f);
  }
}
const VT = new Float64Array(W.nV);
for (let v = 0; v < W.nV; v += 1) VT[v] = Math.atan2(W.vy[v], W.vx[v]);
function nrmOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  return L > 0 ? [nx / L, ny / L, nz / L] : [0, 0, 0];
}
const FN = new Float64Array(nTri * 3);
for (let f = 0; f < nTri; f += 1) {
  const n = nrmOf(xyz0[f * 9], xyz0[f * 9 + 1], xyz0[f * 9 + 2], xyz0[f * 9 + 3], xyz0[f * 9 + 4], xyz0[f * 9 + 5], xyz0[f * 9 + 6], xyz0[f * 9 + 7], xyz0[f * 9 + 8]);
  FN[f * 3] = n[0]; FN[f * 3 + 1] = n[1]; FN[f * 3 + 2] = n[2];
}
interface EdgeRec { u: number; v: number; f1: number; f2: number; ang: number }
const edges: EdgeRec[] = [];
for (const [k, g] of edgeMap) {
  if (g.length !== 2) continue;
  const u = Math.floor(k / EKEY); const v = k - u * EKEY;
  const f1 = g[0]; const f2 = g[1];
  let dp = FN[f1 * 3] * FN[f2 * 3] + FN[f1 * 3 + 1] * FN[f2 * 3 + 1] + FN[f1 * 3 + 2] * FN[f2 * 3 + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  edges.push({ u, v, f1, f2, ang: Math.acos(dp) });
}
let cand: EdgeRec[] = edges.filter((e) => e.ang > thrRef);
cand.sort((a, b) => b.ang - a.ang);
log(`CONTROL CANDIDATES: ${cand.length} class edges of ${edges.length} interior   ${cand.length === 237835 ? 'REPRODUCES S114/S115 (237,835)' : '*** DIFFERS — VOID ***'}   ${el()}`);
if (cand.length !== 237835) process.exit(3);
log('');

function normDegXYZ(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const a = Math.atan2(ay, ax);
  const b = a + dThRaw(a, Math.atan2(by, bx));
  const c = a + dThRaw(a, Math.atan2(cy, cx));
  return orientOfFacet(nsRef, ax, ay, az, bx, by, bz, cx, cy, cz, a, b, c, { k: K_REF, inset: INSET_REF, scratch }).normDeg;
}
const ndCache = new Float64Array(nTri).fill(NaN);
const ndBefore = (f: number): number => {
  if (Number.isNaN(ndCache[f])) {
    ndCache[f] = normDegXYZ(xyz0[f * 9], xyz0[f * 9 + 1], xyz0[f * 9 + 2], xyz0[f * 9 + 3], xyz0[f * 9 + 4], xyz0[f * 9 + 5], xyz0[f * 9 + 6], xyz0[f * 9 + 7], xyz0[f * 9 + 8]);
  }
  return ndCache[f];
};
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

interface ArmOut { xyz: Float64Array; touched: Uint8Array; nAcc: number; scanned: number }
function runArm(list: EdgeRec[], guard: boolean, cap: number): ArmOut {
  const xyz = Float64Array.from(xyz0);
  const touched = new Uint8Array(nTri);
  const created = new Set<number>();
  let nAcc = 0; let scanned = 0;
  const P = (id: number, k: number): number => (k === 0 ? W.vx[id] : k === 1 ? W.vy[id] : W.vz[id]);
  for (let i = 0; i < list.length; i += 1) {
    if (cap > 0 && nAcc >= cap) break;
    scanned += 1;
    const r = list[i];
    const f1 = r.f1; const f2 = r.f2;
    if (badF.has(f1) || badF.has(f2)) continue;
    if (touched[f1] === 1 || touched[f2] === 1) continue;
    const A1 = [W.id[f1 * 3], W.id[f1 * 3 + 1], W.id[f1 * 3 + 2]];
    const A2 = [W.id[f2 * 3], W.id[f2 * 3 + 1], W.id[f2 * 3 + 2]];
    const u = r.u; const v = r.v;
    if (!(A1.includes(u) && A1.includes(v) && A2.includes(u) && A2.includes(v))) continue;
    const c = A1.find((x) => x !== u && x !== v) as number;
    const dv = A2.find((x) => x !== u && x !== v) as number;
    if (c === undefined || dv === undefined || c === dv) continue;
    if (edgeMap.has(ekey(c, dv)) || created.has(ekey(c, dv))) continue;
    const t0th = VT[u];
    const pux = 0; const puy = W.vz[u];
    const pvx = dThRaw(t0th, VT[v]); const pvy = W.vz[v];
    const pcx = dThRaw(t0th, VT[c]); const pcy = W.vz[c];
    const pdx = dThRaw(t0th, VT[dv]); const pdy = W.vz[dv];
    const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
    const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
    if (!(s1 * s2 < 0 && s3 * s4 < 0)) continue;
    let f1IsUV = false;
    for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
    const cc = f1IsUV ? c : dv; const dd = f1IsUV ? dv : c;
    const n1 = [cc, u, dd]; const n2 = [cc, dd, v];
    const g1 = nrmOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const g2 = nrmOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const smx = FN[f1 * 3] + FN[f2 * 3]; const smy = FN[f1 * 3 + 1] + FN[f2 * 3 + 1]; const smz = FN[f1 * 3 + 2] + FN[f2 * 3 + 2];
    if (!(Math.hypot(smx, smy, smz) > 0) || !(g1[0] * smx + g1[1] * smy + g1[2] * smz > 0 && g2[0] * smx + g2[1] * smy + g2[2] * smz > 0)) continue;
    const arC1 = arOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const arC2 = arOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const arP1 = arOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
    const arP2 = arOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
    if (!(arC1 <= Math.max(AR_CAP, arP1, arP2) && arC2 <= Math.max(AR_CAP, arP1, arP2))) continue;
    if (guard) {
      const ndB = Math.max(ndBefore(f1), ndBefore(f2));
      const ndA = Math.max(
        normDegXYZ(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2)),
        normDegXYZ(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2)),
      );
      if (!(ndA < ndB - 1e-9)) continue;
    }
    for (let k = 0; k < 3; k += 1) {
      xyz[f1 * 9 + k * 3] = W.vx[n1[k]]; xyz[f1 * 9 + k * 3 + 1] = W.vy[n1[k]]; xyz[f1 * 9 + k * 3 + 2] = W.vz[n1[k]];
      xyz[f2 * 9 + k * 3] = W.vx[n2[k]]; xyz[f2 * 9 + k * 3 + 1] = W.vy[n2[k]]; xyz[f2 * 9 + k * 3 + 2] = W.vz[n2[k]];
    }
    touched[f1] = 1; touched[f2] = 1;
    created.add(ekey(c, dv));
    nAcc += 1;
  }
  return { xyz, touched, nAcc, scanned };
}

const inU = new Uint8Array(nTri);
for (const e of cand) { inU[e.f1] = 1; inU[e.f2] = 1; }
const U: number[] = [];
for (let f = 0; f < nTri; f += 1) if (inU[f] === 1) U.push(f);
let uA0 = 0; let uN0 = 0;
for (const f of U) if (d0.perFacetMaxRad[f] > thrRef) { uN0 += 1; uA0 += d0.areaMm2[f]; }

interface Row { name: string; flips: number; n1: number; a1: number; max1: number; x: number; red: number; tn: number; ta: number; reloc: number; area1: number }
const rows: Row[] = [];
function score(name: string, R: ArmOut): Row {
  const d1 = facetDihedrals(R.xyz, idxIdentity);
  let n1 = 0; let a1 = 0; let max1 = 0; let area1 = 0;
  for (let f = 0; f < nTri; f += 1) {
    area1 += d1.areaMm2[f];
    if (d1.perFacetMaxRad[f] > max1) max1 = d1.perFacetMaxRad[f];
    if (d1.perFacetMaxRad[f] > thrRef) { n1 += 1; a1 += d1.areaMm2[f]; }
  }
  let tn = 0; let ta = 0;
  for (const f of U) if (d1.perFacetMaxRad[f] > thrRef) { tn += 1; ta += d1.areaMm2[f]; }
  // PARTITION CONTROL, per-arm (the invariant that is actually true of a flip)
  const inTP = new Uint8Array(nTri);
  for (let f = 0; f < nTri; f += 1) if (R.touched[f] === 1) inTP[f] = 1;
  for (let e = 0; e < d0.edgeF1.length; e += 1) {
    const a = d0.edgeF1[e]; const b = d0.edgeF2[e];
    if (R.touched[a] === 1) inTP[b] = 1;
    if (R.touched[b] === 1) inTP[a] = 1;
  }
  let o0 = 0; let o1 = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (inTP[f] === 1) continue;
    if (d0.perFacetMaxRad[f] > thrRef) o0 += d0.areaMm2[f];
    if (d1.perFacetMaxRad[f] > thrRef) o1 += d1.areaMm2[f];
  }
  const ok = o0 === o1;
  const row: Row = {
    name, flips: R.nAcc, n1, a1, max1: max1 * DEG, x: cA0 / a1, red: cA0 - a1,
    tn, ta, reloc: (cA0 - a1) - (uA0 - ta), area1,
  };
  log(`── ${name}`);
  log(`   flips ${R.nAcc}  scanned ${R.scanned}   PARTITION ${ok ? 'EXACTLY 0 — OK' : `*** ${(o1 - o0).toExponential(2)} — VOID ***`}`);
  log(`   WHOLE-MESH >45: COUNT ${cN0} -> ${n1}   AREA ${cA0.toFixed(4)} -> ${a1.toFixed(4)} mm2   MAX ${(max1 * DEG).toFixed(5)} deg`);
  log(`   PRIMARY ${(cA0 / a1).toFixed(5)}x   REDUCTION ${(cA0 - a1) >= 0 ? '+' : ''}${(cA0 - a1).toFixed(4)} mm2   mesh area ${area1.toFixed(3)} (delta ${(area1 - meshArea0).toFixed(4)})`);
  log(`   TARGET U >45:   COUNT ${uN0} -> ${tn}   AREA ${uA0.toFixed(4)} -> ${ta.toFixed(4)} mm2 = ${(uA0 / ta).toFixed(5)}x   RELOCATED ${((uA0 - ta) - (cA0 - a1)).toFixed(4)} mm2`);
  log(`   ${el()}`);
  log('');
  if (!ok) process.exit(8);
  rows.push(row);
  return row;
}

// ── CONTROL: reproduce arm A ─────────────────────────────────────────────────────────────────────
const rA_A = runArm(cand, false, 0);
const sA = score('CONTROL arm A  UNCONDITIONAL, full (S115: 42050 flips @ 0.99327x, red -10.7386)', rA_A);
log(`   >>> reproduction: ${rA_A.nAcc === 42050 && Math.abs(sA.x - 0.99327) < 5e-5 ? 'EXACT — this re-implementation IS S115\'s operator' : '*** DIFFERS — my re-implementation is not the same operator; nothing below is comparable ***'}`);
log('');
if (!(rA_A.nAcc === 42050 && Math.abs(sA.x - 0.99327) < 5e-5)) process.exit(5);

// ── CONTROL: reproduce arm B ─────────────────────────────────────────────────────────────────────
const rB = runArm(cand, true, 0);
const sB = score('CONTROL arm B  GUARDED, full (S115: 20580 flips @ 1.03393x, red +52.0445)', rB);
log(`   >>> reproduction: ${rB.nAcc === 20580 && Math.abs(sB.x - 1.03393) < 5e-5 ? 'EXACT' : '*** DIFFERS — VOID ***'}`);
log('');
if (!(rB.nAcc === 20580 && Math.abs(sB.x - 1.03393) < 5e-5)) process.exit(5);
const NB = rB.nAcc; const NA = rA_A.nAcc;

// ── CONTROL: reproduce placebo P2 ────────────────────────────────────────────────────────────────
{
  const rnd = rng(SEED ^ 0x5bf03635);
  const perm = cand.slice();
  for (let i = perm.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const R = runArm(perm, false, NB);
  const s = score(`CONTROL placebo P2  RANDOM in-class @ ${NB} (S115: -8.9094 mm2 @ 0.99441x)`, R);
  log(`   >>> reproduction: ${Math.abs(s.x - 0.99441) < 5e-5 ? 'EXACT' : '*** DIFFERS — VOID ***'}`);
  log('');
  if (!(Math.abs(s.x - 0.99441) < 5e-5)) process.exit(5);
}

// ══ THE MISSING ARM T — UNGUARDED, worst-first, TRUNCATED to arm B's flip count ═══════════════════
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log(`*** THE MISSING ARM — T: UNGUARDED, worst-dihedral-first, TRUNCATED at ${NB} accepts ***`);
log('   Same key as arm A, same count as arm B, NO accept clause. The ONLY difference from arm B is');
log('   the C1 normDeg guard. This is the control that isolates the clause.');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
const sT = score(`ARM T  UNGUARDED worst-first, truncated @ ${NB}`, runArm(cand, false, NB));

// ══ THE MISSING PLACEBO P2A — in-class RANDOM, cost-matched to arm A ══════════════════════════════
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log(`*** THE MISSING PLACEBO — P2A: RANDOM in-class, cost-matched to arm A at ${NA} flips ***`);
log('   S115 compared arm A (42050 flips) to P2 (20580 flips) and called them "indistinguishable".');
log('   That comparison was NOT cost-matched. This one is.');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
let sP2A: Row;
{
  const rnd = rng(SEED ^ 0x5bf03635);
  const perm = cand.slice();
  for (let i = perm.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  sP2A = score(`PLACEBO P2A  RANDOM in-class @ ${NA} (cost-matched to arm A)`, runArm(perm, false, NA));
}

// ══ VERDICT ══════════════════════════════════════════════════════════════════════════════════════
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('THE ISOLATION TABLE');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('  ARM                                                  flips   whole-mesh >45 AREA mm2       x        REDUCTION mm2');
for (const r of rows) {
  log(`  ${r.name.slice(0, 50).padEnd(52)} ${String(r.flips).padStart(6)}   ${cA0.toFixed(4).padStart(10)} -> ${r.a1.toFixed(4).padStart(10)}  ${r.x.toFixed(5).padStart(8)}x   ${(r.red >= 0 ? '+' : '') + r.red.toFixed(4)}`);
}
log('');
log('══ READ 1 — IS THE C1 ACCEPT CLAUSE DOING THE WORK? ══');
log(`  arm B (GUARDED,   ${NB} flips)  reduction ${(sB.red >= 0 ? '+' : '') + sB.red.toFixed(4)} mm2 @ ${sB.x.toFixed(5)}x`);
log(`  arm T (UNGUARDED, ${NB} flips)  reduction ${(sT.red >= 0 ? '+' : '') + sT.red.toFixed(4)} mm2 @ ${sT.x.toFixed(5)}x`);
const clauseShare = sB.red !== 0 ? (sB.red - sT.red) / sB.red : NaN;
log(`  => the CLAUSE contributes ${(sB.red - sT.red).toFixed(4)} mm2 of arm B's ${sB.red.toFixed(4)} mm2 = ${(clauseShare * 100).toFixed(1)}%`);
log(`  => the rest (${sT.red.toFixed(4)} mm2 = ${(100 - clauseShare * 100).toFixed(1)}%) is bought by STOPPING EARLY on the same key.`);
log(`  ${sT.red >= 0.5 * sB.red ? '*** S115 OVERSTATES THE CLAUSE: an UNGUARDED truncation at the same cost gets >=50% of the gain ***' : 'S115 STANDS: the clause, not the truncation, produces the gain.'}`);
log('');
log('══ READ 2 — IS ARM A "INDISTINGUISHABLE FROM RANDOM" ON A COST-MATCHED PLACEBO? ══');
log(`  arm A  (informed key, ${NA} flips)  ${sA.x.toFixed(5)}x  reduction ${sA.red.toFixed(4)} mm2`);
log(`  P2A    (random,       ${NA} flips)  ${sP2A.x.toFixed(5)}x  reduction ${sP2A.red.toFixed(4)} mm2`);
log(`  => cost-matched gap ${(sA.red - sP2A.red).toFixed(4)} mm2 (S115 quoted a 0.001 gap against a HALF-COST placebo)`);
log(`  ${Math.abs(sA.red - sP2A.red) < 5 ? 'CONFIRMED on the proper control: the informed key buys nothing.' : '*** S115\'s "indistinguishable from random" is NOT supported by the cost-matched placebo ***'}`);
log('');
log(`ALL ARMS remain far below the 2.0x PRIMARY kill line: best is ${Math.max(...rows.map((r) => r.x)).toFixed(5)}x.`);
writeFileSync(`${OUTDIR}/REV_S115_FLIP_KEYISOLATE.json`, `${JSON.stringify({
  stl: STL, nTri, meshArea0, before: { n: cN0, area: cA0 }, candidates: cand.length, NA, NB, rows,
}, null, 2)}\n`);
log(`done ${el()}`);

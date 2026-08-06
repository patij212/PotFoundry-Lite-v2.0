// revS113FlipAudit.ts — ADVERSARIAL RE-MEASUREMENT of S113 OPERATOR 1 (the edge flip).
//
// I am not re-running the original tool's arithmetic; I am attacking it from angles it did not take.
// Four questions the original report does NOT answer, each of which could rescue or bury the operator:
//
//  Q1  FIXED-WEIGHT PRIMARY. The original's PRIMARY divides two AREAS measured on DIFFERENT meshes: a
//      flip re-cuts a non-planar quad and the two cuts differ in area, so facets shrinking is scored as
//      defect being repaired. Score the AFTER state with the BEFORE areas as fixed weights. That removes
//      the confound completely and needs no "share of set" reasoning to interpret.
//
//  Q2  WHAT ACTUALLY CLEARED. Count + BEFORE-area + AFTER-area of the facets that genuinely crossed from
//      over-bar to under-bar, and of those that crossed the other way. Never a bare count.
//
//  Q3  WAS THE KILL LINE EVEN REACHABLE? The original refutes ONE accept rule under ONE ordering. If the
//      geometrically-legal flips cannot cover 50% of the class's area no matter what accept rule or
//      ordering you choose, then no accept rule rescues the operator and the refutation is structural.
//      The fold / 3D-inversion / duplicate-edge predicates are all evaluated on the ORIGINAL mesh in the
//      original tool, so they are ORDER-INDEPENDENT: the reachable set is well-defined. Compute it, and
//      the resulting UPPER BOUND on the primary ratio.
//
//  Q4  IS THE AREA SHRINK "BETTER" OR "WORSE"? The original asserts the shrink is an artefact. Test it:
//      compare mesh area against the ANALYTIC surface area of the same patch. A crease-conforming mesh
//      should approach the analytic area from BELOW; a mesh whose area falls further below it is cutting
//      MORE chord across the fold, i.e. representing the surface worse.
//
// CONTROLS: I re-derive the flipped triangles from the quad boundary cycle MYSELF and require my
// whole-mesh census to equal the original tool's printed figures. If it does not, one of us is wrong and
// I say so rather than reporting my own number as the truth.
//
// Usage: bash research/tools/run-rev-s113-flipaudit.sh
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const SET = process.env.PF_S113_SET ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const ACC = process.env.PF_S113_ACC ?? 'research/exchange/_strataConformBisect/straddle/S113_OPFLIP_GOTH_ARMA.accepted.ndjson';
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

log('===== REV — ADVERSARIAL RE-MEASUREMENT of S113 OPERATOR 1 (edge flip) =====');
log('');

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

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
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
log(`mesh ${nTri} facets  ${el()}`);

// ── weld (independent of the original tool's) ──────────────────────────────────────────────────────
const nVin = nTri * 3;
const vid = new Int32Array(nVin);
const cx: number[] = []; const cy: number[] = []; const cz: number[] = [];
{
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  let next = 0;
  for (let v = 0; v < nVin; v += 1) {
    const x = xyz0[v * 3]; const y = xyz0[v * 3 + 1]; const z = xyz0[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35);
    h |= 0;
    const bucket = buckets.get(h);
    let found = -1;
    if (bucket !== undefined) for (const c of bucket) if (cx[c] === x && cy[c] === y && cz[c] === z) { found = c; break; }
    if (found < 0) { found = next; next += 1; cx.push(x); cy.push(y); cz.push(z); if (bucket === undefined) buckets.set(h, [found]); else bucket.push(found); }
    vid[v] = found;
  }
}
const nV = cx.length;
const VX = Float64Array.from(cx); const VY = Float64Array.from(cy); const VZ = Float64Array.from(cz);
const VT = new Float64Array(nV);
for (let v = 0; v < nV; v += 1) VT[v] = Math.atan2(VY[v], VX[v]);
const EKEY = 67_108_864;
const ekey = (a: number, b: number): number => (a < b ? a * EKEY + b : b * EKEY + a);
const baseEdges = new Set<number>();
for (let f = 0; f < nTri; f += 1) {
  const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
  baseEdges.add(ekey(a, b)); baseEdges.add(ekey(b, c)); baseEdges.add(ekey(c, a));
}
log(`welded ${nV} vertices, ${baseEdges.size} undirected edges  ${el()}`);

const idxIdentity = new Uint32Array(nTri * 3).map((_, i) => i);
const d0 = facetDihedrals(xyz0, idxIdentity);
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
log(`BEFORE mesh area ${meshArea0.toFixed(3)} mm2  ${el()}`);

interface Row { e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number }
const rows: Row[] = readFileSync(SET, 'utf8').split('\n').filter((s) => s.length > 2).map((s) => JSON.parse(s) as Row);
const U: number[] = [];
{
  const seen = new Set<number>();
  for (const r of rows) { if (!seen.has(r.f1)) { seen.add(r.f1); U.push(r.f1); } if (!seen.has(r.f2)) { seen.add(r.f2); U.push(r.f2); } }
}
const inU = new Uint8Array(nTri);
for (const f of U) inU[f] = 1;
let areaU0 = 0;
for (const f of U) areaU0 += d0.areaMm2[f];
log(`target set ${rows.length} pairs, ${U.length} unique facets, BEFORE area ${areaU0.toFixed(4)} mm2 = ${((areaU0 / meshArea0) * 100).toFixed(4)}% of mesh`);
log('');

// ── geometry helpers, my own ───────────────────────────────────────────────────────────────────────
function nrm(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ccx: number, ccy: number, ccz: number): [number, number, number] {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = ccx - ax; const wy = ccy - ay; const wz = ccz - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  return L > 0 ? [nx / L, ny / L, nz / L] : [0, 0, 0];
}
function arOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ccx: number, ccy: number, ccz: number): number {
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(ccx - bx, ccy - by, ccz - bz);
  const ca = Math.hypot(ax - ccx, ay - ccy, az - ccz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = ccx - ax; const wy = ccy - ay; const wz = ccz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const s = 0.5 * (ab + bc + ca);
  if (!(area > 0) || !(s > 0)) return Infinity;
  return Math.max(ab, bc, ca) / (2 * (area / s));
}
const P = (id: number, k: number): number => (k === 0 ? VX[id] : k === 1 ? VY[id] : VZ[id]);

/** The quad of a pair, and the two children of the OTHER diagonal, derived from the boundary cycle. */
function quadOf(f1: number, f2: number): { u: number; v: number; c: number; d: number; n1: number[]; n2: number[] } | null {
  const A1 = [vid[f1 * 3], vid[f1 * 3 + 1], vid[f1 * 3 + 2]];
  const A2 = [vid[f2 * 3], vid[f2 * 3 + 1], vid[f2 * 3 + 2]];
  const sh = A1.filter((x) => A2.includes(x));
  if (sh.length !== 2) return null;
  const u = sh[0]; const v = sh[1];
  const c = A1.find((x) => x !== u && x !== v);
  const d = A2.find((x) => x !== u && x !== v);
  if (c === undefined || d === undefined || c === d) return null;
  let f1IsUV = false;
  for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
  const cc = f1IsUV ? c : d; const dd = f1IsUV ? d : c;
  return { u, v, c, d, n1: [cc, u, dd], n2: [cc, dd, v] };
}

/** ORDER-INDEPENDENT legality: every predicate the original evaluates on the ORIGINAL mesh only. */
function legalOrderIndependent(f1: number, f2: number): { ok: boolean; why: string } {
  const Q = quadOf(f1, f2);
  if (Q === null) return { ok: false, why: 'notEdgePair/sameOpp' };
  if (baseEdges.has(ekey(Q.c, Q.d))) return { ok: false, why: 'dupEdge' };
  const t0 = VT[Q.u];
  const pux = 0; const puy = VZ[Q.u];
  const pvx = dThRaw(t0, VT[Q.v]); const pvy = VZ[Q.v];
  const pcx = dThRaw(t0, VT[Q.c]); const pcy = VZ[Q.c];
  const pdx = dThRaw(t0, VT[Q.d]); const pdy = VZ[Q.d];
  const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
  const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
  if (!(s1 * s2 < 0 && s3 * s4 < 0)) return { ok: false, why: 'fold' };
  const g1 = nrm(P(Q.n1[0], 0), P(Q.n1[0], 1), P(Q.n1[0], 2), P(Q.n1[1], 0), P(Q.n1[1], 1), P(Q.n1[1], 2), P(Q.n1[2], 0), P(Q.n1[2], 1), P(Q.n1[2], 2));
  const g2 = nrm(P(Q.n2[0], 0), P(Q.n2[0], 1), P(Q.n2[0], 2), P(Q.n2[1], 0), P(Q.n2[1], 1), P(Q.n2[1], 2), P(Q.n2[2], 0), P(Q.n2[2], 1), P(Q.n2[2], 2));
  const o1 = nrm(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
  const o2 = nrm(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
  const mx = o1[0] + o2[0]; const my = o1[1] + o2[1]; const mz = o1[2] + o2[2];
  if (!(Math.hypot(mx, my, mz) > 0) || !(g1[0] * mx + g1[1] * my + g1[2] * mz > 0 && g2[0] * mx + g2[1] * my + g2[2] * mz > 0)) return { ok: false, why: 'invert3d' };
  const arC1 = arOf(P(Q.n1[0], 0), P(Q.n1[0], 1), P(Q.n1[0], 2), P(Q.n1[1], 0), P(Q.n1[1], 1), P(Q.n1[1], 2), P(Q.n1[2], 0), P(Q.n1[2], 1), P(Q.n1[2], 2));
  const arC2 = arOf(P(Q.n2[0], 0), P(Q.n2[0], 1), P(Q.n2[0], 2), P(Q.n2[1], 0), P(Q.n2[1], 1), P(Q.n2[1], 2), P(Q.n2[2], 0), P(Q.n2[2], 1), P(Q.n2[2], 2));
  const arP1 = arOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
  const arP2 = arOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
  const cap = Math.max(AR_CAP, arP1, arP2);
  if (!(arC1 <= cap && arC2 <= cap)) return { ok: false, why: 'shape' };
  return { ok: true, why: '' };
}

// ══ Q3 — WAS THE 2.0x KILL LINE EVEN REACHABLE BY ANY ACCEPT RULE / ANY ORDER? ═══════════════════
log('══ Q3 — REACHABILITY: is the kill line attainable by ANY accept rule under ANY ordering? ══');
{
  const why = new Map<string, number>();
  const reach = new Uint8Array(nTri);
  let nLegal = 0;
  for (const r of rows) {
    const L = legalOrderIndependent(r.f1, r.f2);
    if (L.ok) { nLegal += 1; reach[r.f1] = 1; reach[r.f2] = 1; } else why.set(L.why, (why.get(L.why) ?? 0) + 1);
  }
  let areaReach = 0; let nReach = 0;
  for (const f of U) if (reach[f] === 1) { nReach += 1; areaReach += d0.areaMm2[f]; }
  log(`  pairs whose flip is legal on the ORIGINAL mesh (order-independent): ${nLegal} of ${rows.length} = ${((nLegal / rows.length) * 100).toFixed(2)}%`);
  for (const [k, v] of [...why.entries()].sort((a, b) => b[1] - a[1])) log(`    permanently refused: ${k.padEnd(18)} ${v}`);
  log(`  REACHABLE facets (touched by at least one legal flip): COUNT ${nReach} = ${((nReach / U.length) * 100).toFixed(2)}% of the set`);
  log(`                                                          AREA  ${areaReach.toFixed(4)} mm2 = ${((areaReach / areaU0) * 100).toFixed(2)}% of the set's area`);
  const bound = areaU0 / Math.max(1e-12, areaU0 - areaReach);
  log(`  *** UPPER BOUND on the PRIMARY ratio, assuming EVERY reachable facet is PERFECTLY repaired`);
  log(`      and no facet anywhere is harmed: ${areaU0.toFixed(4)} / ${(areaU0 - areaReach).toFixed(4)} = ${bound.toFixed(4)}x   [kill line 2.0x]`);
  log(`      => the 2.0x kill line is ${bound >= 2.0 ? 'REACHABLE in principle' : 'UNREACHABLE BY CONSTRUCTION'}.`);
  log(`      (a facet is UNREACHABLE when both its pairs' quads are non-convex or would invert in 3D;`);
  log(`       those predicates are evaluated on the ORIGINAL mesh, so no ordering or accept rule changes them)`);
}
log('');

// ── apply the ORIGINAL tool's ARM-A accepted set, re-deriving the triangles myself ────────────────
interface Acc { i: number; f1: number; f2: number; pairBefore: number; pairAfter: number }
const acc: Acc[] = readFileSync(ACC, 'utf8').split('\n').filter((s) => s.length > 2).map((s) => JSON.parse(s) as Acc);
log(`accepted set read: ${acc.length} pairs from ${ACC}`);
const xyz1 = Float64Array.from(xyz0);
const touched = new Uint8Array(nTri);
let maxPairAfterDev = 0;
for (const a of acc) {
  const Q = quadOf(a.f1, a.f2);
  if (Q === null) { log('*** VOID: an accepted pair is not an edge pair in my weld ***'); process.exit(9); }
  if (touched[a.f1] === 1 || touched[a.f2] === 1) { log('*** VOID: the accepted set double-flips a facet ***'); process.exit(9); }
  for (let k = 0; k < 3; k += 1) {
    xyz1[a.f1 * 9 + k * 3] = VX[Q.n1[k]]; xyz1[a.f1 * 9 + k * 3 + 1] = VY[Q.n1[k]]; xyz1[a.f1 * 9 + k * 3 + 2] = VZ[Q.n1[k]];
    xyz1[a.f2 * 9 + k * 3] = VX[Q.n2[k]]; xyz1[a.f2 * 9 + k * 3 + 1] = VY[Q.n2[k]]; xyz1[a.f2 * 9 + k * 3 + 2] = VZ[Q.n2[k]];
  }
  touched[a.f1] = 1; touched[a.f2] = 1;
  const g1 = nrm(P(Q.n1[0], 0), P(Q.n1[0], 1), P(Q.n1[0], 2), P(Q.n1[1], 0), P(Q.n1[1], 1), P(Q.n1[1], 2), P(Q.n1[2], 0), P(Q.n1[2], 1), P(Q.n1[2], 2));
  const g2 = nrm(P(Q.n2[0], 0), P(Q.n2[0], 1), P(Q.n2[0], 2), P(Q.n2[1], 0), P(Q.n2[1], 1), P(Q.n2[1], 2), P(Q.n2[2], 0), P(Q.n2[2], 1), P(Q.n2[2], 2));
  let dp = g1[0] * g2[0] + g1[1] * g2[1] + g1[2] * g2[2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  maxPairAfterDev = Math.max(maxPairAfterDev, Math.abs((Math.acos(dp) * 180) / Math.PI - a.pairAfter));
}
log(`  RE-DERIVATION CONTROL: max |my pairAfter - the tool's| = ${maxPairAfterDev.toExponential(3)} deg (must be ~0)`);
const d1 = facetDihedrals(xyz1, idxIdentity);
let meshArea1 = 0;
for (let f = 0; f < nTri; f += 1) meshArea1 += d1.areaMm2[f];
log(`  my AFTER mesh area ${meshArea1.toFixed(3)} mm2  (tool printed 38436.252)  topology: interior ${d1.interiorEdges} boundary ${d1.boundaryEdges} nonManifold ${d1.nonManifoldEdges} inconsistent ${d1.inconsistentEdges}  ${el()}`);
log('');

const thr = (HI_DEG * Math.PI) / 180;

// ══ Q1 — FIXED-WEIGHT PRIMARY ═════════════════════════════════════════════════════════════════════
log('══ Q1 — the PRIMARY, scored with FIXED (BEFORE) areas so shrink cannot masquerade as repair ══');
{
  let n0 = 0; let a0Live = 0; let a0Fix = 0;
  let n1c = 0; let a1Live = 0; let a1Fix = 0;
  let tot0 = 0; let tot1 = 0;
  for (const f of U) {
    tot0 += d0.areaMm2[f]; tot1 += d1.areaMm2[f];
    if (d0.perFacetMaxRad[f] > thr) { n0 += 1; a0Live += d0.areaMm2[f]; a0Fix += d0.areaMm2[f]; }
    if (d1.perFacetMaxRad[f] > thr) { n1c += 1; a1Live += d1.areaMm2[f]; a1Fix += d0.areaMm2[f]; }
  }
  log(`                       COUNT      AREA(live) mm2   AREA(fixed BEFORE weights) mm2`);
  log(`  U BEFORE        ${String(n0).padStart(9)}   ${a0Live.toFixed(4).padStart(14)}   ${a0Fix.toFixed(4).padStart(14)}`);
  log(`  U AFTER         ${String(n1c).padStart(9)}   ${a1Live.toFixed(4).padStart(14)}   ${a1Fix.toFixed(4).padStart(14)}`);
  log(`  U TOTAL area    ${tot0.toFixed(4)} -> ${tot1.toFixed(4)} mm2`);
  log(`  PRIMARY as the tool scored it (live areas)   = ${(a0Live / a1Live).toFixed(4)}x`);
  log(`  PRIMARY with FIXED BEFORE weights            = ${(a0Fix / a1Fix).toFixed(4)}x   <-- the shrink confound removed`);
  log(`  PRIMARY by COUNT                             = ${(n0 / n1c).toFixed(4)}x`);
  log(`  => the tool's 1.3290x is ${(((a0Live / a1Live) - (a0Fix / a1Fix)) / ((a0Live / a1Live) - 1) * 100).toFixed(1)}% shrink and ${(((a0Fix / a1Fix) - 1) / ((a0Live / a1Live) - 1) * 100).toFixed(1)}% repair.`);
}
log('');

// ══ Q2 — WHAT ACTUALLY CROSSED THE BAR, in both directions ════════════════════════════════════════
log('══ Q2 — the facets that genuinely CROSSED the bar (count + before-area + after-area) ══');
{
  let clN = 0; let clA0 = 0; let clA1 = 0;
  let brN = 0; let brA0 = 0; let brA1 = 0;
  const upU: number[] = []; const dnU: number[] = [];
  for (const f of U) {
    const b = d0.perFacetMaxRad[f] > thr; const a = d1.perFacetMaxRad[f] > thr;
    if (b && !a) { clN += 1; clA0 += d0.areaMm2[f]; clA1 += d1.areaMm2[f]; }
    if (!b && a) { brN += 1; brA0 += d0.areaMm2[f]; brA1 += d1.areaMm2[f]; }
    const dd = ((d1.perFacetMaxRad[f] - d0.perFacetMaxRad[f]) * 180) / Math.PI;
    if (dd > 0) upU.push(dd); else if (dd < 0) dnU.push(-dd);
  }
  log(`  CLEARED (over-bar -> under-bar) COUNT ${clN} = ${((clN / U.length) * 100).toFixed(2)}% of the set`);
  log(`                                  BEFORE-AREA ${clA0.toFixed(4)} mm2 = ${((clA0 / areaU0) * 100).toFixed(3)}% of the set's area`);
  log(`                                  AFTER-AREA  ${clA1.toFixed(4)} mm2`);
  log(`  BROKEN  (under-bar -> over-bar) COUNT ${brN}  BEFORE-AREA ${brA0.toFixed(4)}  (0 expected: the set is 100% over-bar by construction)`);
  log(`  within U, dihedral VALUE rose on ${upU.length} facets (p50 +${q(upU, 0.5).toFixed(2)} deg, MAX +${Math.max(...upU, 0).toFixed(2)})`);
  log(`                          and fell on ${dnU.length} facets (p50 -${q(dnU, 0.5).toFixed(2)} deg, MAX -${Math.max(...dnU, 0).toFixed(2)})`);
  const c0max = Math.max(...U.map((f) => d0.perFacetMaxRad[f])) * 180 / Math.PI;
  const c1max = Math.max(...U.map((f) => d1.perFacetMaxRad[f])) * 180 / Math.PI;
  log(`  U dihedral MAX ${c0max.toFixed(2)} -> ${c1max.toFixed(2)} deg`);
}
log('');

// ══ FLOOR-2 renormalised: does the relocation survive dividing by each state's OWN mesh area? ══════
log('══ FLOOR-2 renormalised (the whole-mesh figure as a FRACTION of each state\'s own area) ══');
{
  let n0 = 0; let a0 = 0; let n1c = 0; let a1 = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (d0.perFacetMaxRad[f] > thr) { n0 += 1; a0 += d0.areaMm2[f]; }
    if (d1.perFacetMaxRad[f] > thr) { n1c += 1; a1 += d1.areaMm2[f]; }
  }
  log(`  WHOLE MESH BEFORE  COUNT ${n0}  AREA ${a0.toFixed(4)} mm2  = ${((a0 / meshArea0) * 100).toFixed(4)}% of ITS OWN mesh area`);
  log(`  WHOLE MESH AFTER   COUNT ${n1c}  AREA ${a1.toFixed(4)} mm2  = ${((a1 / meshArea1) * 100).toFixed(4)}% of ITS OWN mesh area`);
  log(`  => COUNT ${n0 > 0 ? (((n1c - n0) / n0) * 100).toFixed(2) : 'n/a'}% , AREA ${(((a1 - a0) / a0) * 100).toFixed(2)}% , AREA-FRACTION ${((((a1 / meshArea1) - (a0 / meshArea0)) / (a0 / meshArea0)) * 100).toFixed(2)}%`);
  log('     COUNT and AREA and AREA-FRACTION must AGREE IN DIRECTION for the relocation claim to stand.');
}
log('');

// ══ Q4 — is the area shrink toward or away from the ANALYTIC surface area? ════════════════════════
log('══ Q4 — the mesh area moved -17.0 mm2. Toward the analytic surface, or away from it? ══');
{
  // Analytic area of the same z-band, by dense quadrature of the surface of revolution-with-theta:
  //   dA = sqrt( (r^2 + r_th^2) * (1 + r_z^2) - (r_th * r_z)^2 ) dth dz   for the graph r(th,z).
  // Grid chosen so the estimate is stable to the digit reported; both resolutions are printed so the
  // reader can see the convergence rather than trust one number.
  let zLo = Infinity; let zHi = -Infinity;
  for (let v = 0; v < nV; v += 1) { if (VZ[v] < zLo) zLo = VZ[v]; if (VZ[v] > zHi) zHi = VZ[v]; }
  log(`  mesh z-extent ${zLo.toFixed(4)} .. ${zHi.toFixed(4)} mm`);
  const quad = (nth: number, nz: number): number => {
    const dth = (2 * Math.PI) / nth; const dz = (zHi - zLo) / nz;
    const hth = 1e-5; const hz = 1e-5;
    let tot = 0;
    for (let i = 0; i < nth; i += 1) {
      const th = (i + 0.5) * dth;
      for (let j = 0; j < nz; j += 1) {
        const z = zLo + (j + 0.5) * dz;
        const r = rA(th, z);
        const rth = (rA(th + hth, z) - rA(th - hth, z)) / (2 * hth);
        const rz = (rA(th, z + hz) - rA(th, z - hz)) / (2 * hz);
        const g = (r * r + rth * rth) * (1 + rz * rz) - (rth * rz) * (rth * rz);
        tot += Math.sqrt(Math.max(0, g)) * dth * dz;
      }
    }
    return tot;
  };
  const q1 = quad(1000, 400);
  const q2 = quad(2000, 800);
  const q3 = quad(4000, 1600);
  const q4 = quad(8000, 3200);
  log(`  ANALYTIC wall area (theta x z midpoint quadrature), CONVERGENCE LADDER:`);
  log(`    1000x400 = ${q1.toFixed(2)} | 2000x800 = ${q2.toFixed(2)} | 4000x1600 = ${q3.toFixed(2)} | 8000x3200 = ${q4.toFixed(2)} mm2`);
  log(`    successive deltas ${(q2 - q1).toFixed(2)}, ${(q3 - q2).toFixed(2)}, ${(q4 - q3).toFixed(2)} mm2`);
  log(`  MESH area BEFORE ${meshArea0.toFixed(3)} mm2 ; AFTER ${meshArea1.toFixed(3)} mm2 ; the flip moved it ${(meshArea1 - meshArea0).toFixed(3)}`);
  const resid = Math.abs(q4 - q3);
  log(`  quadrature residual ${resid.toFixed(2)} mm2 vs the ${Math.abs(meshArea1 - meshArea0).toFixed(2)} mm2 signal`);
  log(`  => ${resid > 0.25 * Math.abs(meshArea1 - meshArea0) ? 'INCONCLUSIVE: the quadrature has not converged to better than the signal, and the mesh carries rim/base/tread facets the quadrature omits. I do NOT claim a direction.' : 'the ladder is converged; direction is readable'}`);
}
log('');

// ══ Q5 — THE ORACLE. Give the operator a PERFECT accept rule and see if it can reach 2.0x. ════════
// The original refutes ONE accept rule (unconditional) and ONE guard (C1 on the pair's max normDeg).
// Neither is the best rule available. The best rule is: apply the flip IN ISOLATION, compute the two
// children's TRUE per-facet max dihedral against their REAL neighbours (all three edges, not just the
// pair's own diagonal), and accept only when BOTH children land UNDER the bar. That is an oracle no
// online driver could implement cheaply, and it is exactly what "the other diagonal runs along the
// crease" would predict. If the oracle cannot reach the kill line, no accept rule can.
log('══ Q5 — the ORACLE accept rule (accept only flips that PROVABLY clear both children) ══');
{
  // facet -> its 3 neighbours, from the base edge map
  const em = new Map<number, number[]>();
  for (let f = 0; f < nTri; f += 1) {
    const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
    for (const [p1, p2] of [[a, b], [b, c], [c, a]]) {
      const k = ekey(p1, p2);
      const e = em.get(k);
      if (e === undefined) em.set(k, [f]); else e.push(f);
    }
  }
  const N0 = new Float64Array(nTri * 3);
  for (let f = 0; f < nTri; f += 1) {
    const n = nrm(xyz0[f * 9], xyz0[f * 9 + 1], xyz0[f * 9 + 2], xyz0[f * 9 + 3], xyz0[f * 9 + 4], xyz0[f * 9 + 5], xyz0[f * 9 + 6], xyz0[f * 9 + 7], xyz0[f * 9 + 8]);
    N0[f * 3] = n[0]; N0[f * 3 + 1] = n[1]; N0[f * 3 + 2] = n[2];
  }
  const other = (p1: number, p2: number, self: number, sib: number): number => {
    const e = em.get(ekey(p1, p2));
    if (e === undefined) return -1;
    for (const f of e) if (f !== self && f !== sib) return f;
    return -1;
  };
  const angTo = (g: [number, number, number], f: number): number => {
    if (f < 0) return 0;
    let dp = g[0] * N0[f * 3] + g[1] * N0[f * 3 + 1] + g[2] * N0[f * 3 + 2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    return Math.acos(dp);
  };
  const oracle: Array<{ f1: number; f2: number }> = [];
  const created = new Set<number>();
  const tch = new Uint8Array(nTri);
  let nLegal = 0; let nClearBoth = 0; let nClearOne = 0; let nConflict = 0;
  for (const r of rows) {
    if (!legalOrderIndependent(r.f1, r.f2).ok) continue;
    nLegal += 1;
    const Q = quadOf(r.f1, r.f2) as { u: number; v: number; c: number; d: number; n1: number[]; n2: number[] };
    const g1 = nrm(P(Q.n1[0], 0), P(Q.n1[0], 1), P(Q.n1[0], 2), P(Q.n1[1], 0), P(Q.n1[1], 1), P(Q.n1[1], 2), P(Q.n1[2], 0), P(Q.n1[2], 1), P(Q.n1[2], 2));
    const g2 = nrm(P(Q.n2[0], 0), P(Q.n2[0], 1), P(Q.n2[0], 2), P(Q.n2[1], 0), P(Q.n2[1], 1), P(Q.n2[1], 2), P(Q.n2[2], 0), P(Q.n2[2], 1), P(Q.n2[2], 2));
    let dp = g1[0] * g2[0] + g1[1] * g2[1] + g1[2] * g2[2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    const sib = Math.acos(dp);
    // n1 = [cc,u,dd] -> outer edges (cc,u) and (u,dd); n2 = [cc,dd,v] -> outer edges (dd,v) and (v,cc)
    const m1 = Math.max(sib, angTo(g1, other(Q.n1[0], Q.n1[1], r.f1, r.f2)), angTo(g1, other(Q.n1[1], Q.n1[2], r.f1, r.f2)));
    const m2 = Math.max(sib, angTo(g2, other(Q.n2[1], Q.n2[2], r.f1, r.f2)), angTo(g2, other(Q.n2[2], Q.n2[0], r.f1, r.f2)));
    const both = m1 <= thr && m2 <= thr;
    if (both) nClearBoth += 1; else if (m1 <= thr || m2 <= thr) nClearOne += 1;
    if (!both) continue;
    if (tch[r.f1] === 1 || tch[r.f2] === 1 || created.has(ekey(Q.c, Q.d))) { nConflict += 1; continue; }
    tch[r.f1] = 1; tch[r.f2] = 1; created.add(ekey(Q.c, Q.d));
    oracle.push({ f1: r.f1, f2: r.f2 });
  }
  log(`  legal pairs ${nLegal}; of those, an ISOLATED flip lands BOTH children under ${HI_DEG}deg: ${nClearBoth} (${((nClearBoth / rows.length) * 100).toFixed(2)}% of the class), exactly ONE child: ${nClearOne}`);
  log(`  oracle-accepted after conflict resolution: ${oracle.length}  (${nConflict} dropped for conflict)`);
  const xyz2 = Float64Array.from(xyz0);
  for (const a of oracle) {
    const Q = quadOf(a.f1, a.f2) as { n1: number[]; n2: number[] };
    for (let k = 0; k < 3; k += 1) {
      xyz2[a.f1 * 9 + k * 3] = VX[Q.n1[k]]; xyz2[a.f1 * 9 + k * 3 + 1] = VY[Q.n1[k]]; xyz2[a.f1 * 9 + k * 3 + 2] = VZ[Q.n1[k]];
      xyz2[a.f2 * 9 + k * 3] = VX[Q.n2[k]]; xyz2[a.f2 * 9 + k * 3 + 1] = VY[Q.n2[k]]; xyz2[a.f2 * 9 + k * 3 + 2] = VZ[Q.n2[k]];
    }
  }
  const d2 = facetDihedrals(xyz2, idxIdentity);
  let meshArea2 = 0;
  for (let f = 0; f < nTri; f += 1) meshArea2 += d2.areaMm2[f];
  let un = 0; let uaLive = 0; let uaFix = 0; let cleared = 0; let clearedA = 0;
  for (const f of U) {
    if (d2.perFacetMaxRad[f] > thr) { un += 1; uaLive += d2.areaMm2[f]; uaFix += d0.areaMm2[f]; }
    else { cleared += 1; clearedA += d0.areaMm2[f]; }
  }
  let mn = 0; let ma = 0;
  for (let f = 0; f < nTri; f += 1) if (d2.perFacetMaxRad[f] > thr) { mn += 1; ma += d2.areaMm2[f]; }
  log(`  ORACLE RESULT — target set U:  COUNT 6193 -> ${un}   AREA(live) ${areaU0.toFixed(4)} -> ${uaLive.toFixed(4)} mm2   AREA(fixed) -> ${uaFix.toFixed(4)} mm2`);
  log(`                  CLEARED ${cleared} facets, BEFORE-AREA ${clearedA.toFixed(4)} mm2 = ${((clearedA / areaU0) * 100).toFixed(3)}% of the class`);
  log(`                  PRIMARY live ${(areaU0 / uaLive).toFixed(4)}x | PRIMARY fixed-weight ${(areaU0 / uaFix).toFixed(4)}x | by COUNT ${(6193 / un).toFixed(4)}x   [kill line 2.0x]`);
  log(`  ORACLE — whole mesh:  COUNT 34105 -> ${mn}   AREA 911.2897 -> ${ma.toFixed(4)} mm2 = ${((ma / meshArea2) * 100).toFixed(4)}% of its own area (before 2.3699%)`);
  log(`                        FLOOR-2 delta ${ma - 911.2897 >= 0 ? '+' : ''}${(ma - 911.2897).toFixed(4)} mm2  (must be <= 0)`);
  log(`  => even a PERFECT accept rule reaches ${(areaU0 / uaFix).toFixed(4)}x on the honest (fixed-weight) primary.`);
}
log('');
log(`done ${el()}`);

// revS113OracleRefute.ts — REVIEW. Does S113-OP4's "the visible metric is IRREDUCIBLE" survive an
// instrument that shares NOTHING with it?
//
// S113-OP4 declares a pair IRREDUCIBLE when `sepCreaseDeg >= 45`, where sepCreaseDeg is the MAX angle over
// the 8 closest cross-flank sample pairs of a 2-MEANS split of a MULTI-CANDIDATE (`fdNormals`, up to 4
// one-sided normals per point) lattice. Two things make that suspect as a verdict:
//   (i)  the tool's own sibling (revCurtainTurnProbe.ts) documents that a MAX over fdNormals' 4x4 pairings
//        is an UPPER BOUND on the analytic turn — and an upper bound is the WRONG direction for declaring
//        something irreducible;
//   (ii) at parameter gap 0 the "two flanks" are candidates AT THE SAME POINT, including the two MIXED
//        combinations (rtF,rzB) and (rtB,rzF) which lie on NEITHER side of the surface.
//
// THIS TOOL RE-DERIVES THE SAME VERDICT TWICE, WITHOUT 2-MEANS AND WITHOUT MIXED CANDIDATES.
//
//  R1  TRIANGLE-INEQUALITY LOWER BOUND. For every WALL edge with dihedral > 45 deg, the analytic normal
//      field MUST turn by at least  dih(f1,f2) - normDeg(f1) - normDeg(f2)  between f1's inset footprint
//      and f2's inset footprint. normDeg is orientOfFacet(inset EXPLICIT, orient 'outward'); dih is the
//      outward-oriented adjacent dihedral. No clustering, no crease model, no candidate mixing. If this
//      LOWER bound is >= 45 deg on most of the area, the visible edge really is the surface.
//
//  R2  locateTurnAdaptive ACROSS the edge. Style-agnostic crease locator, fdNormalsCentral (ONE candidate,
//      no mixing), probed on the f1-centroid -> f2-centroid segment so it CROSSES the shared edge, and
//      driven to a nanometre bracket. A turn that survives a 6-nm bracket is a genuine C0 crease that no
//      refinement resolves; a turn that decays with the bracket is CURVATURE and refinement DOES fix it.
//      Reported with `hFinal` so the reader sees the scale. `turn` is checked, never `s` (orientRuler:529).
//
//  CTL SMOOTH CONTROL — the same R2 probe on adjacent WALL pairs with dihedral < 2 deg. If it manufactures
//      creases there, every number in this file is void.
//
//  R3  THE CIRCULARITY AUDIT of Part C's "empirical ceiling": recompute it with and without the
//      normDeg <= 5 selection that defined the class, and report both medians and both MAXes.
//
// COUNT + AREA + MAX everywhere. Nothing under src/ or research/bridge/ is touched.
// Usage: bash research/tools/run-rev-s113-oracle-refute.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STL = process.env.PF_REV_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJ = process.env.PF_REV_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const OPB = process.env.PF_REV_OPB ?? 'research/exchange/_strataConformBisect/straddle/S113OPB_ORACLE_GOTH.ndjson';
const STYLE = process.env.PF_REV_STYLE ?? 'GothicArches';
const TAG = process.env.PF_REV_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_REV_H', 120), Rb: envF('PF_REV_RB', 40), Rt: envF('PF_REV_RT', 50), expn: 1 };
const H = DIMS.H;
const VIS_DEG = envF('PF_REV_VIS', 45);
const K_OBS = Math.round(envF('PF_REV_KOBS', 8));
const ITERS = Math.round(envF('PF_REV_ITERS', 14));
const SAMPN = Math.round(envF('PF_REV_SAMPN', 4000));
const CTLN = Math.round(envF('PF_REV_CTLN', 1500));
const DEG = 180 / Math.PI;

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
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mn = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b < a ? b : a), Infinity);
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
/** AREA-weighted quantile: count medians and area medians disagree by 13-184x in this project. */
const qA = (v: Array<{ x: number; a: number }>, p: number): number => {
  const s = v.slice().filter((r) => Number.isFinite(r.x)).sort((a, b) => a.x - b.x);
  let tot = 0; for (const r of s) tot += r.a;
  let c = 0; for (const r of s) { c += r.a; if (c >= p * tot) return r.x; }
  return s.length ? s[s.length - 1].x : NaN;
};

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const scratch = new Float64Array(12);
const nsObs = fdNormals(rA, H, 2e-4, 2e-4);

log('===== REV-S113OP — REFUTATION PASS ON "THE VISIBLE METRIC IS IRREDUCIBLE" =====');
log(`style ${STYLE}  tag ${TAG}  vis=${VIS_DEG} deg  kObs=${K_OBS}  locateTurn iters=${ITERS}`);
log('R1 triangle-inequality LOWER bound (no clustering).  R2 locateTurnAdaptive ACROSS the edge (no mixing).');
log('CTL smooth control on the R2 probe.  R3 circularity audit of the empirical ceiling.');
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  inconsistent ${d.inconsistentEdges}  ${el()}`);
log('');

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
function woundNormal(f: number, out: Float64Array): void {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz);
  if (L > 0) { nx /= L; ny /= L; nz /= L; }
  out[0] = nx; out[1] = ny; out[2] = nz;
}
/** analytic OUTWARD normal at the facet centroid parameter point (central difference, ONE candidate). */
const anC = new Float64Array(3);
function analyticOutwardAtCentroid(f: number, out: Float64Array): void {
  const [ath, bth, cth] = th3(f);
  const gth = (ath + bth + cth) / 3;
  const gz = (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
  const r0 = rA(gth, gz); const hTh = 2e-4 / Math.max(1e-9, Math.abs(r0));
  const rt = (rA(gth + hTh, gz) - rA(gth - hTh, gz)) / (2 * hTh);
  const zl = Math.max(0, gz - 2e-4); const zh = Math.min(H, gz + 2e-4);
  const rz = zh > zl ? (rA(gth, zh) - rA(gth, zl)) / (zh - zl) : 0;
  const c = Math.cos(gth); const s = Math.sin(gth);
  let nx = rt * s + r0 * c; let ny = r0 * s - rt * c; let nz = -r0 * rz;
  const L = Math.hypot(nx, ny, nz); if (L > 0) { nx /= L; ny /= L; nz /= L; }
  out[0] = nx; out[1] = ny; out[2] = nz;
}
const signCache = new Map<number, number>();
function outwardSign(f: number): number {
  const c = signCache.get(f); if (c !== undefined) return c;
  const w = new Float64Array(3); woundNormal(f, w); analyticOutwardAtCentroid(f, anC);
  const dp = w[0] * anC[0] + w[1] * anC[1] + w[2] * anC[2];
  const s = dp < 0 ? -1 : 1; signCache.set(f, s); return s;
}
const normCache = new Map<string, number>();
const obsNorm = (f: number, inset: number): number => {
  const key = `${f}|${inset}`;
  const c = normCache.get(key); if (c !== undefined) return c;
  const [ath, bth, cth] = th3(f);
  const v = orientOfFacet(nsObs, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4],
    xyz[f * 9 + 5], xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
    { k: K_OBS, inset, orient: 'outward', scratch }).normDeg;
  normCache.set(key, v); return v;
};
/** centroid parameter point of a facet, in (theta, z) with theta unwrapped onto the facet's own branch. */
function centroidParam(f: number): { th: number; z: number; rRef: number } {
  const [ath, bth, cth] = th3(f);
  return {
    th: (ath + bth + cth) / 3,
    z: (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3,
    rRef: rRefOf(f),
  };
}
/** R2 PROBE: locateTurnAdaptive on the segment that JOINS the two centroids, so it crosses the shared edge. */
function crossTurn(f1: number, f2: number): { turn: number; hFinal: number; lenMm: number } {
  const a = centroidParam(f1); const b = centroidParam(f2);
  const rRef = 0.5 * (a.rRef + b.rRef);
  // put f2's theta on f1's branch — a 2*pi slip here would probe the far side of the pot
  const bth = a.th + dThRaw(a.th, b.th);
  const r = locateTurnAdaptive(rA, H, a.th, a.z, bth, b.z, rRef, ITERS);
  return { turn: r.turn * DEG, hFinal: r.hFinal, lenMm: Math.hypot(rRef * (bth - a.th), b.z - a.z) };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// R1 — THE TRIANGLE-INEQUALITY LOWER BOUND, over EVERY wall edge with dihedral > 45 deg
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface EdgeRow { e: number; f1: number; f2: number; dihW: number; dihO: number; n1: number; n2: number; lb: number; a1: number; a2: number }
const edges: EdgeRow[] = [];
{
  const hiThr = (VIS_DEG * Math.PI) / 180;
  const nE = d.edgeAngRad.length;
  let skippedGR = 0;
  for (let e = 0; e < nE; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (graphRatio(f1) > 8 || graphRatio(f2) > 8) { skippedGR += 1; continue; }
    edges.push({ e, f1, f2, dihW: d.edgeAngRad[e] * DEG, dihO: 0, n1: 0, n2: 0, lb: 0, a1: d.areaMm2[f1], a2: d.areaMm2[f2] });
  }
  log(`── R1: WALL edges (graphRatio<=8) with dihedral > ${VIS_DEG} deg: ${edges.length}   (skipped as curtain: ${skippedGR})`);
  const w1 = new Float64Array(3); const w2 = new Float64Array(3);
  for (const r of edges) {
    woundNormal(r.f1, w1); woundNormal(r.f2, w2);
    const s1 = outwardSign(r.f1); const s2 = outwardSign(r.f2);
    let dp = s1 * s2 * (w1[0] * w2[0] + w1[1] * w2[1] + w1[2] * w2[2]);
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    r.dihO = Math.acos(dp) * DEG;
    r.n1 = obsNorm(r.f1, 0.10); r.n2 = obsNorm(r.f2, 0.10);
    r.lb = r.dihO - r.n1 - r.n2;
  }
  const uniq = new Map<number, number>();
  for (const r of edges) { uniq.set(r.f1, r.a1); uniq.set(r.f2, r.a2); }
  let clsArea = 0; for (const a of uniq.values()) clsArea += a;
  log(`   unique facets ${uniq.size}  AREA ${clsArea.toFixed(3)} mm2 = ${((clsArea / meshArea) * 100).toFixed(4)}% of mesh   ${el()}`);
  log(`   dihedral AS WOUND p50 ${q(edges.map((r) => r.dihW), 0.5).toFixed(2)}  OUTWARD-ORIENTED p50 ${q(edges.map((r) => r.dihO), 0.5).toFixed(2)}  MAX ${mx(edges.map((r) => r.dihO)).toFixed(2)} deg`);
  log(`   normDeg(inset 0.10, outward, EXPLICIT) per facet: p10 ${q(edges.map((r) => Math.max(r.n1, r.n2)), 0.1).toFixed(3)} p50 ${q(edges.map((r) => Math.max(r.n1, r.n2)), 0.5).toFixed(3)} p90 ${q(edges.map((r) => Math.max(r.n1, r.n2)), 0.9).toFixed(2)} MAX ${mx(edges.map((r) => Math.max(r.n1, r.n2))).toFixed(2)} deg`);
  const lbs = edges.map((r) => r.lb);
  log(`   LOWER BOUND on the analytic turn = dihO - normDeg(f1) - normDeg(f2):`);
  log(`     p10 ${q(lbs, 0.1).toFixed(2)}  p50 ${q(lbs, 0.5).toFixed(2)}  p90 ${q(lbs, 0.9).toFixed(2)}  MIN ${mn(lbs).toFixed(2)}  MAX ${mx(lbs).toFixed(2)} deg`);
  // edge-level share; then facet-level COUNT + AREA (a facet counts if ANY of its >45 edges is proven)
  const okE = edges.filter((r) => r.lb >= VIS_DEG);
  const proven = new Set<number>();
  for (const r of okE) { proven.add(r.f1); proven.add(r.f2); }
  let provenArea = 0; for (const f of proven) provenArea += d.areaMm2[f];
  log(`   EDGES with LOWER BOUND >= ${VIS_DEG} deg: ${okE.length}/${edges.length} = ${((okE.length / edges.length) * 100).toFixed(2)}%`);
  log(`   FACETS touched by such an edge: COUNT ${proven.size}/${uniq.size} = ${((proven.size / uniq.size) * 100).toFixed(2)}%  AREA ${provenArea.toFixed(3)} mm2 = ${((provenArea / clsArea) * 100).toFixed(2)}% of the flagged class = ${((provenArea / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`   >>> this is a PROVEN LOWER bound: no clustering, no crease model, no candidate mixing.`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// R2 — locateTurnAdaptive ACROSS the shared edge, on the PINNED TARGET SET and on the FLAGGED CLASS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row { e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number; locs: Loc[] }
const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
log(`loaded ${rows.length} pinned pairs (must be 3282)`);
{
  // CONTROL first: the same probe on adjacent SMOOTH wall pairs. If it fires here, R2 is void.
  const ctl: Array<{ turn: number; h: number }> = [];
  const loThr = (2 * Math.PI) / 180;
  const stride = Math.max(1, Math.floor(d.edgeAngRad.length / (CTLN * 40)));
  for (let e = 0; e < d.edgeAngRad.length && ctl.length < CTLN; e += stride) {
    if (!(d.edgeAngRad[e] < loThr)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (graphRatio(f1) > 8 || graphRatio(f2) > 8) continue;
    if (d.perFacetMaxRad[f1] >= loThr || d.perFacetMaxRad[f2] >= loThr) continue;
    const t = crossTurn(f1, f2); ctl.push({ turn: t.turn, h: t.hFinal });
  }
  log(`── CTL: R2 probe on ${ctl.length} SMOOTH adjacent wall pairs (both facets max-dihedral < 2 deg)`);
  log(`   turn p50 ${q(ctl.map((c) => c.turn), 0.5).toExponential(2)}  p90 ${q(ctl.map((c) => c.turn), 0.9).toExponential(2)}  MAX ${mx(ctl.map((c) => c.turn)).toFixed(4)} deg`);
  const bad = ctl.filter((c) => c.turn >= VIS_DEG).length;
  log(`   >= ${VIS_DEG} deg: ${bad}/${ctl.length} = ${((bad / Math.max(1, ctl.length)) * 100).toFixed(2)}%   (VOID LINE 5%)`);
  if (bad / Math.max(1, ctl.length) > 0.05) log('   *** CONTROL FIRED: the R2 probe manufactures creases on smooth pairs. R2 IS VOID. ***');
  log('');

  // TARGET SET
  const tt: number[] = []; const th: number[] = [];
  for (const r of rows) { const t = crossTurn(r.f1, r.f2); tt.push(t.turn); th.push(t.hFinal); }
  const areaOf = new Map<number, number>();
  for (const r of rows) { areaOf.set(r.f1, d.areaMm2[r.f1]); areaOf.set(r.f2, d.areaMm2[r.f2]); }
  let tArea = 0; for (const a of areaOf.values()) tArea += a;
  const anyIrr = new Map<number, boolean>();
  for (let i = 0; i < rows.length; i += 1) for (const f of [rows[i].f1, rows[i].f2]) anyIrr.set(f, (anyIrr.get(f) ?? false) || tt[i] >= VIS_DEG);
  let irrA = 0; let irrN = 0;
  for (const [f, v] of anyIrr) if (v) { irrA += d.areaMm2[f]; irrN += 1; }
  log(`── R2 on the PINNED TARGET SET (${rows.length} pairs, ${areaOf.size} facets, AREA ${tArea.toFixed(3)} mm2)`);
  log(`   cross-edge turn p10 ${q(tt, 0.1).toFixed(2)} p50 ${q(tt, 0.5).toFixed(2)} p90 ${q(tt, 0.9).toFixed(2)} MAX ${mx(tt).toFixed(2)} deg`);
  log(`   final bracket hFinal p50 ${q(th, 0.5).toExponential(2)} MAX ${mx(th).toExponential(2)} mm  (a turn that survives THIS is C0, not curvature)`);
  log(`   PAIRS with turn >= ${VIS_DEG}: ${tt.filter((x) => x >= VIS_DEG).length}/${rows.length} = ${((tt.filter((x) => x >= VIS_DEG).length / rows.length) * 100).toFixed(2)}%`);
  log(`   FACETS: COUNT ${irrN}/${areaOf.size} = ${((irrN / areaOf.size) * 100).toFixed(2)}%  AREA ${irrA.toFixed(4)} mm2 = ${((irrA / tArea) * 100).toFixed(2)}% of target = ${((irrA / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`   S113-OP4 claimed COUNT 5850 (94.46%) / AREA 69.4072 (99.40%). DIFF: count ${irrN - 5850}  area ${(irrA - 69.4072).toFixed(4)} mm2`);
  log('');

  // FLAGGED CLASS (the 94.83%-by-area figure's own population), subsampled
  const stride2 = Math.max(1, Math.floor(edges.length / SAMPN));
  const sub = edges.filter((_, i) => i % stride2 === 0);
  const st = sub.map((r) => crossTurn(r.f1, r.f2));
  log(`── R2 on a ${sub.length}-edge stride-${stride2} subsample of the ${edges.length} flagged WALL edges`);
  log(`   cross-edge turn p10 ${q(st.map((s) => s.turn), 0.1).toFixed(2)} p50 ${q(st.map((s) => s.turn), 0.5).toFixed(2)} p90 ${q(st.map((s) => s.turn), 0.9).toFixed(2)} MAX ${mx(st.map((s) => s.turn)).toFixed(2)} deg`);
  const okS = st.filter((s) => s.turn >= VIS_DEG).length;
  let subArea = 0; let okArea = 0;
  for (let i = 0; i < sub.length; i += 1) { const a = sub[i].a1 + sub[i].a2; subArea += a; if (st[i].turn >= VIS_DEG) okArea += a; }
  log(`   >= ${VIS_DEG} deg: COUNT ${okS}/${sub.length} = ${((okS / sub.length) * 100).toFixed(2)}%   AREA(pair-sum) ${okArea.toFixed(2)}/${subArea.toFixed(2)} = ${((okArea / subArea) * 100).toFixed(2)}%`);
  log(`   hFinal p50 ${q(st.map((s) => s.hFinal), 0.5).toExponential(2)} mm   segment length p50 ${q(st.map((s) => s.lenMm), 0.5).toFixed(4)} mm`);
  log('');

  writeFileSync(`${OUTDIR}/REV_S113OP_REFUTE_${TAG}.ndjson`,
    `${rows.map((r, i) => JSON.stringify({ e: r.e, f1: r.f1, f2: r.f2, measDeg: r.measDeg, crossTurnDeg: tt[i], hFinal: th[i] })).join('\n')}\n`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// R3 — THE CIRCULARITY AUDIT of Part C's "empirical ceiling"
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  interface B { f: number; minor: number; sepDeg: number; dihDeg: number; area: number; n05: number; n10: number }
  const bs: B[] = readFileSync(OPB, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as B);
  let tot = 0; for (const r of bs) tot += r.area;
  log(`── R3: Part C's empirical ceiling, recomputed from ${bs.length} rows of ${OPB}  (AREA ${tot.toFixed(3)} mm2)`);
  const noCrease = bs.filter((r) => !(r.sepDeg >= VIS_DEG && r.minor >= 0.02));
  const aligned = noCrease.filter((r) => r.n10 <= 5);
  const rep = (name: string, v: B[]): void => {
    let a = 0; for (const r of v) a += r.area;
    log(`   ${name}`);
    log(`     COUNT ${v.length} (${((v.length / bs.length) * 100).toFixed(2)}%)  AREA ${a.toFixed(3)} mm2 = ${((a / tot) * 100).toFixed(2)}% of class = ${((a / meshArea) * 100).toFixed(4)}% of mesh`);
    log(`     normDeg(0.10) count-p50 ${q(v.map((r) => r.n10), 0.5).toFixed(4)}  AREA-p50 ${qA(v.map((r) => ({ x: r.n10, a: r.area })), 0.5).toFixed(4)}  p90 ${q(v.map((r) => r.n10), 0.9).toFixed(3)}  MAX ${mx(v.map((r) => r.n10)).toFixed(3)} deg`);
    log(`     adjacent dihedral p10 ${q(v.map((r) => r.dihDeg), 0.1).toFixed(2)} p50 ${q(v.map((r) => r.dihDeg), 0.5).toFixed(2)} MIN ${mn(v.map((r) => r.dihDeg)).toFixed(2)} MAX ${mx(v.map((r) => r.dihDeg)).toFixed(2)} deg`);
  };
  rep('ALIGNED as Part C defined it (no interior crease AND normDeg(0.10) <= 5) — CIRCULAR on normDeg:', aligned);
  rep('SAME CLASS WITHOUT the normDeg cut (no interior crease only) — NON-CIRCULAR:', noCrease);
  const obs = 68.564;   // the target set's own normDeg(inset 0.05) p50, from S113-OP4 Stage 2
  log(`   RATIO the report quotes at the median: ${obs}/${q(aligned.map((r) => r.n10), 0.5).toFixed(4)} = ${(obs / q(aligned.map((r) => r.n10), 0.5)).toFixed(1)}x`);
  log(`   SAME RATIO on the non-circular class:  ${obs}/${q(noCrease.map((r) => r.n10), 0.5).toFixed(4)} = ${(obs / q(noCrease.map((r) => r.n10), 0.5)).toFixed(1)}x`);
  log(`   RATIO the report quotes on MAX:        179.80/${mx(aligned.map((r) => r.n10)).toFixed(3)} = ${(179.80 / mx(aligned.map((r) => r.n10))).toFixed(2)}x  <- the denominator IS the selection cut`);
  log(`   SAME RATIO on the non-circular class:  179.80/${mx(noCrease.map((r) => r.n10)).toFixed(3)} = ${(179.80 / mx(noCrease.map((r) => r.n10))).toFixed(2)}x`);
  log('');
}
log(`done ${el()}`);

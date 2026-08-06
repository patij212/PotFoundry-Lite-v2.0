// revS115OracleRefute.ts — REVIEWER re-measurement of the S113-OP "oracle ceiling" claim.
//
// THREE CHECKS THE ORIGINAL DID NOT RUN.
//
//  R1  THE LOAD-BEARING FIGURE, MADE NON-TAUTOLOGICAL. The claim's decisive control is
//      "the ALIGNED class still renders a p50 159.76-deg dihedral, 100% still over the 45-deg cut".
//      That class was SELECTED from facets adjacent to an edge with dihedral > 45 (measured MIN
//      45.057), so "100% still over the cut" CANNOT FAIL. The honest question is per-EDGE and
//      two-sided: for each >45-deg wall edge, is the mesh accurate on BOTH sides? Only then does
//      the mesh "prove" the turn is the surface's. Report COUNT + AREA + MAX for both/one/neither.
//
//  R2  THE MISSING CONTROL ON THE ACTUAL HEADLINE INSTRUMENT. Stage 4 labels a pair IRREDUCIBLE on
//      `sepCreaseDeg >= 45` alone (it does not gate on the crease flag). The published smooth control
//      tested a DIFFERENT statistic (the 2-means `crease` boolean on SINGLE facets). Here the exact
//      Stage-3 pair pipeline is run on SMOOTH adjacent pairs (dihedral < 2 deg). A false-positive
//      rate over 5% voids the headline.
//
//  R3  DOES THE NUMBER PORT TO A DIFFERENT MESH? The headline quotes an AREA share (0.1805% of mesh).
//      A crease is a 1-D locus, so the area of facets whose footprint meets it must fall ~2x per
//      refinement level. Ladder it on the analytic surface: subdivide each target facet 4^L and
//      measure the crease-carrying AREA share. Flat => density-invariant. Halving => the headline
//      number is a property of THIS mesh's facet size, not of the surface.
//
// FLOOR ASSERTIONS (a one-sided bar is vacuous): R2 must also read a NON-ZERO rate on a POSITIVE
// control (the pinned target pairs) or the detector is dead; R3's L=0 must reproduce the published
// ~99% or my crease test is not theirs.
//
// Usage: bash research/tools/run-rev-s115-refute.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NDJ = process.env.PF_REV_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const STL = process.env.PF_REV_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const STYLE = process.env.PF_REV_STYLE ?? 'GothicArches';
const TAG = process.env.PF_REV_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_REV_H', 120), Rb: envF('PF_REV_RB', 40), Rt: envF('PF_REV_RT', 50), expn: 1 };
const H = DIMS.H;
const VIS = envF('PF_REV_VIS', 45);
const ACC = envF('PF_REV_ACC', 5);       // "accurate" bar on normDeg, matching the claim's ALIGNED class
const K_LAT = Math.round(envF('PF_REV_K', 12));
const K_OBS = 8;
const NCROSS = 8;
const SEP_MIN = 15;
const CTLN = Math.round(envF('PF_REV_CTLN', 600));
const SUBN = Math.round(envF('PF_REV_SUBN', 400));
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
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const scratch = new Float64Array(12);
const ns = fdNormals(rA, H, 2e-4, 2e-4);

log('===== REV-S115 — REFUTATION PASS ON THE S113-OP ORACLE CEILING =====');
log(`style ${STYLE}  tag ${TAG}  K=${K_LAT}  visibility=${VIS} deg  accurate-bar=${ACC} deg`);
log('');

// ── LOAD + PRECOND ──────────────────────────────────────────────────────────────────────────────
// PF_REV_ONLY=R1 runs ONLY the two-sided edge census, so the same instrument can be pointed at a
// DIFFERENT mesh of the SAME surface (R2/R3 are keyed to the pinned S39CTL facet indices).
const ONLY_R1 = process.env.PF_REV_ONLY === 'R1';
interface Row { e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number }
const rows: Row[] = ONLY_R1 ? [] : readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
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
log(`mesh ${nTri} facets ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  pinned pairs ${rows.length}  ${el()}`);
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
  const [ath, bth, cth] = th3(f); const rRef = rRefOf(f);
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
const normDegOf = (f: number, inset: number): number => {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(ns, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
    { k: K_OBS, inset, orient: 'outward', scratch }).normDeg;
};
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// R1 — THE >45-DEG WALL EDGES, SCORED TWO-SIDED. THIS IS THE NON-TAUTOLOGICAL VERSION.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const nd05 = new Map<number, number>(); const nd10 = new Map<number, number>();
{
  const hiThr = (VIS * Math.PI) / 180;
  const eIdx: number[] = [];
  const wallF = new Set<number>();
  for (let e = 0; e < d.interiorEdges; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (graphRatio(f1) > 8 || graphRatio(f2) > 8) continue;
    eIdx.push(e); wallF.add(f1); wallF.add(f2);
  }
  for (const f of wallF) { nd05.set(f, normDegOf(f, 0.05)); nd10.set(f, normDegOf(f, 0.10)); }
  log('── R1: EVERY >45-deg WALL EDGE, SCORED ON BOTH SIDES (inset PASSED EXPLICITLY, swept 0.05 / 0.10) ──');
  log(`   edges ${eIdx.length}   unique facets ${wallF.size}   (OracleB printed 24587 facets)`);
  let wallArea = 0; for (const f of wallF) wallArea += d.areaMm2[f];
  log(`   class AREA ${wallArea.toFixed(3)} mm2 = ${((wallArea / meshArea) * 100).toFixed(4)}% of mesh   (OracleB printed 676.868 mm2)`);
  for (const inset of [0.05, 0.10]) {
    const map = inset === 0.05 ? nd05 : nd10;
    // per-EDGE class
    const cls = { both: [] as number[], one: [] as number[], none: [] as number[] };
    for (const e of eIdx) {
      const a = map.get(d.edgeF1[e]) as number; const b = map.get(d.edgeF2[e]) as number;
      const hi = Math.max(a, b); const lo = Math.min(a, b);
      (hi <= ACC ? cls.both : lo <= ACC ? cls.one : cls.none).push(e);
    }
    // per-FACET area, attributed to the STRONGEST class the facet participates in (BOTH wins)
    const rank = new Map<number, number>();
    const setR = (f: number, r: number): void => { if ((rank.get(f) ?? -1) < r) rank.set(f, r); };
    for (const e of cls.none) { setR(d.edgeF1[e], 0); setR(d.edgeF2[e], 0); }
    for (const e of cls.one) { setR(d.edgeF1[e], 1); setR(d.edgeF2[e], 1); }
    for (const e of cls.both) { setR(d.edgeF1[e], 2); setR(d.edgeF2[e], 2); }
    const aBy = [0, 0, 0]; const nBy = [0, 0, 0];
    for (const [f, r] of rank) { aBy[r] += d.areaMm2[f]; nBy[r] += 1; }
    log(`  inset ${inset.toFixed(2)}  ("accurate" := normDeg <= ${ACC} deg, outward)`);
    const names = ['NEITHER side accurate', 'ONE side accurate', 'BOTH sides accurate'];
    for (let r = 2; r >= 0; r -= 1) {
      const eList = r === 2 ? cls.both : r === 1 ? cls.one : cls.none;
      const dihs = eList.map((e) => d.edgeAngRad[e] * DEG);
      log(`     ${names[r].padEnd(22)} EDGES ${String(eList.length).padStart(6)} (${((eList.length / eIdx.length) * 100).toFixed(2).padStart(6)}%)  facet-AREA ${aBy[r].toFixed(3).padStart(8)} mm2 = ${((aBy[r] / wallArea) * 100).toFixed(2).padStart(6)}% of class = ${((aBy[r] / meshArea) * 100).toFixed(4)}% of mesh  facets ${String(nBy[r]).padStart(6)}  dihedral p50 ${Number.isFinite(q(dihs, 0.5)) ? q(dihs, 0.5).toFixed(2) : 'n/a'} MAX ${Number.isFinite(mx(dihs)) ? mx(dihs).toFixed(2) : 'n/a'}`);
    }
    const nAll = [...map.values()];
    log(`     per-facet normDeg over the WHOLE class: p50 ${q(nAll, 0.5).toFixed(3)} p90 ${q(nAll, 0.9).toFixed(2)} MAX ${mx(nAll).toFixed(2)} deg`);
  }
  log(`   ${el()}`);
  log('');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// R2 — THE MISSING CONTROL: the Stage-3 PAIR instrument, run on SMOOTH pairs and on the target pairs.
// ════════════════════════════════════════════════════════════════════════════════════════════════
interface Samp { n: Float64Array; m: number; pth: Float64Array; pz: Float64Array }
function sampleFacet(f: number, k: number, inset: number, sampler: NormalSampler): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const rRef = rRefOf(f);
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
  const sh = 1 - inset; const sc = inset / 3;
  let m = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
    const th = wa * ath + wb * bth + wc * cth;
    const z = wa * az + wb * bz + wc * cz;
    const nc = sampler(th, z, scratch);
    for (let qi = 0; qi < nc; qi += 1) {
      n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
      pth[m] = rRef * th; pz[m] = z; m += 1;
    }
  }
  return { n, m, pth, pz };
}
function twoMeans(n: Float64Array, m: number): { lab: Int8Array; sepRad: number; wA: number; wB: number } {
  const lab = new Int8Array(m); const c = new Float64Array(6);
  if (m === 0) return { lab, sepRad: 0, wA: 0, wB: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < m; i += 1) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  let L = Math.hypot(sx, sy, sz); if (!(L > 0)) L = 1;
  const mean = new Float64Array([sx / L, sy / L, sz / L]);
  let i1 = 0; let best = -1;
  for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = 0; best = -1;
  for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
  c[0] = n[i1 * 3]; c[1] = n[i1 * 3 + 1]; c[2] = n[i1 * 3 + 2];
  c[3] = n[i2 * 3]; c[4] = n[i2 * 3 + 1]; c[5] = n[i2 * 3 + 2];
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; let na = 0; let nb = 0;
    for (let i = 0; i < m; i += 1) {
      const da = angU(n, i * 3, c, 0); const db = angU(n, i * 3, c, 3);
      if (da <= db) { lab[i] = 0; ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
      else { lab[i] = 1; bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; nb += 1; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (nb > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || nb === 0) break;
  }
  let wA = 0; let wB = 0; let na = 0; let nb = 0;
  for (let i = 0; i < m; i += 1) {
    if (lab[i] === 0) { na += 1; wA = Math.max(wA, angU(n, i * 3, c, 0)); }
    else { nb += 1; wB = Math.max(wB, angU(n, i * 3, c, 3)); }
  }
  return { lab, sepRad: na > 0 && nb > 0 ? angU(c, 0, c, 3) : 0, wA, wB };
}
/** THE EXACT STAGE-3 PAIR STATISTIC the headline thresholds at 45 deg. */
function sepCreaseOfPair(f1: number, f2: number): { sepCreaseDeg: number; gapMm: number; sepCentDeg: number } {
  const s1 = sampleFacet(f1, K_LAT, 0, ns); const s2 = sampleFacet(f2, K_LAT, 0, ns);
  const m = s1.m + s2.m;
  const n = new Float64Array(m * 3); const pth = new Float64Array(m); const pz = new Float64Array(m);
  n.set(s1.n.subarray(0, s1.m * 3), 0); n.set(s2.n.subarray(0, s2.m * 3), s1.m * 3);
  pth.set(s1.pth.subarray(0, s1.m), 0); pth.set(s2.pth.subarray(0, s2.m), s1.m);
  pz.set(s1.pz.subarray(0, s1.m), 0); pz.set(s2.pz.subarray(0, s2.m), s1.m);
  const sp = twoMeans(n, m);
  const idxA: number[] = []; const idxB: number[] = [];
  for (let i = 0; i < m; i += 1) (sp.lab[i] === 0 ? idxA : idxB).push(i);
  const cand: Array<{ dd: number; ang: number }> = [];
  for (const a of idxA) for (const b of idxB) cand.push({ dd: Math.hypot(pth[a] - pth[b], pz[a] - pz[b]), ang: angU(n, a * 3, n, b * 3) });
  cand.sort((x, y) => x.dd - y.dd);
  let sc = 0; const take = Math.min(NCROSS, cand.length);
  for (let i = 0; i < take; i += 1) if (cand[i].ang > sc) sc = cand[i].ang;
  return { sepCreaseDeg: sc * DEG, gapMm: take > 0 ? cand[take - 1].dd : NaN, sepCentDeg: sp.sepRad * DEG };
}
{
  if (ONLY_R1) { log('R2/R3 skipped (PF_REV_ONLY=R1).'); log(`done ${el()}`); process.exit(0); }
  log('── R2: THE HEADLINE INSTRUMENT (Stage-3 sepCreaseDeg >= 45) RUN ON A SMOOTH CONTROL ──');
  log('   The published smooth control tested a DIFFERENT statistic (the 2-means crease flag on SINGLE');
  log('   facets, 3.17%). The statistic the headline thresholds is this one, on PAIRS. Never controlled.');
  const inTarget = new Set<number>(); for (const r of rows) { inTarget.add(r.f1); inTarget.add(r.f2); }
  const lo = (2 * Math.PI) / 180;
  const smoothPairs: Array<[number, number]> = [];
  for (let e = 0; e < d.interiorEdges && smoothPairs.length < CTLN; e += 1) {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (d.edgeAngRad[e] >= lo) continue;
    if (inTarget.has(f1) || inTarget.has(f2)) continue;
    if (d.perFacetMaxRad[f1] >= lo || d.perFacetMaxRad[f2] >= lo) continue;
    if (graphRatio(f1) > 8 || graphRatio(f2) > 8) continue;
    smoothPairs.push([f1, f2]);
  }
  const sc = smoothPairs.map(([a, b]) => sepCreaseOfPair(a, b));
  const scv = sc.map((x) => x.sepCreaseDeg);
  const fp = scv.filter((x) => x >= VIS).length;
  log(`   SMOOTH PAIRS ${smoothPairs.length} (both facets max-dihedral < 2 deg, wall, not in target):`);
  log(`     sepCreaseDeg p50 ${q(scv, 0.5).toFixed(4)} p90 ${q(scv, 0.9).toFixed(4)} MAX ${mx(scv).toFixed(3)} deg`);
  log(`     labelled IRREDUCIBLE (>= ${VIS} deg): ${fp} = ${((fp / Math.max(1, smoothPairs.length)) * 100).toFixed(2)}%   (void line 5%)`);
  log(`     gapMm == 0 on the control: ${sc.filter((x) => x.gapMm === 0).length}/${sc.length}`);
  // POSITIVE-CONTROL FLOOR: the same code must fire on the target pairs, or the detector is dead.
  const sub: Array<[number, number]> = [];
  for (let i = 0; i < rows.length && sub.length < 300; i += Math.max(1, Math.floor(rows.length / 300))) sub.push([rows[i].f1, rows[i].f2]);
  const pv = sub.map(([a, b]) => sepCreaseOfPair(a, b).sepCreaseDeg);
  const pfire = pv.filter((x) => x >= VIS).length;
  log(`   POSITIVE CONTROL (FLOOR) — ${sub.length} pinned target pairs through MY copy of the instrument:`);
  log(`     sepCreaseDeg p50 ${q(pv, 0.5).toFixed(2)} MAX ${mx(pv).toFixed(2)} deg;  >= ${VIS} deg: ${pfire} = ${((pfire / sub.length) * 100).toFixed(2)}%  (published 93.17% of pairs)`);
  log(`   ${el()}`);
  log('');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// R3 — DOES THE AREA SHARE PORT TO A DIFFERENT (FINER) MESH?
// A crease is a 1-D locus. If the "irreducible" AREA is a strip of facets meeting that locus, it must
// shrink ~2x per refinement level. Subdivide each target facet 4^L ON THE ANALYTIC SURFACE and measure
// the AREA share of sub-triangles whose footprint still contains a >=45-deg pointwise normal kink.
// ════════════════════════════════════════════════════════════════════════════════════════════════
{
  log('── R3: REFINEMENT LADDER ON THE "IRREDUCIBLE AREA" — is 0.1805%-of-mesh a surface fact or a');
  log('   facet-size fact?  Sub-triangles are built ON the analytic surface, so this is the SAME surface');
  log('   at a different density — the closest available proxy for "a different mesh".');
  const sub: number[] = [];
  const uniqF: number[] = [];
  { const seen = new Set<number>(); for (const r of rows) for (const f of [r.f1, r.f2]) if (!seen.has(f)) { seen.add(f); uniqF.push(f); } }
  for (let i = 0; i < uniqF.length && sub.length < SUBN; i += Math.max(1, Math.floor(uniqF.length / SUBN))) sub.push(uniqF[i]);
  const KS = 8;
  /** max pointwise kink (angle between one-sided normal candidates AT one lattice point) over a footprint,
   *  plus the 3D area of the sub-triangle taken from the analytic positions. */
  function subTri(th: number[], z: number[]): { kinkDeg: number; area: number } {
    let kink = 0;
    for (let i = 0; i <= KS; i += 1) for (let j = 0; i + j <= KS; j += 1) {
      const wa = i / KS; const wb = j / KS; const wc = 1 - wa - wb;
      const t = wa * th[0] + wb * th[1] + wc * th[2];
      const zz = wa * z[0] + wb * z[1] + wc * z[2];
      const nc = ns(t, zz, scratch);
      for (let a = 0; a < nc; a += 1) for (let b = a + 1; b < nc; b += 1) {
        const ang = angU(scratch, a * 3, scratch, b * 3);
        if (ang > kink) kink = ang;
      }
    }
    const P: number[][] = [];
    for (let v = 0; v < 3; v += 1) { const r = rA(th[v], z[v]); P.push([r * Math.cos(th[v]), r * Math.sin(th[v]), z[v]]); }
    const ux = P[1][0] - P[0][0]; const uy = P[1][1] - P[0][1]; const uz = P[1][2] - P[0][2];
    const wx = P[2][0] - P[0][0]; const wy = P[2][1] - P[0][1]; const wz = P[2][2] - P[0][2];
    return { kinkDeg: kink * DEG, area: 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) };
  }
  const out: string[] = [];
  for (const L of [0, 1, 2, 3]) {
    const nS = 2 ** L;
    let hot = 0; let tot = 0; let hotN = 0; let totN = 0;
    for (const f of sub) {
      const [ath, bth, cth] = th3(f);
      const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
      const P = (u: number, v: number): [number, number] => {
        const wa = 1 - u - v;
        return [wa * ath + u * bth + v * cth, wa * az + u * bz + v * cz];
      };
      for (let i = 0; i < nS; i += 1) for (let j = 0; i + j < nS; j += 1) {
        const combos: Array<Array<[number, number]>> = [[[i / nS, j / nS], [(i + 1) / nS, j / nS], [i / nS, (j + 1) / nS]]];
        if (i + j + 1 < nS) combos.push([[(i + 1) / nS, j / nS], [(i + 1) / nS, (j + 1) / nS], [i / nS, (j + 1) / nS]]);
        for (const cb of combos) {
          const th = cb.map((c) => P(c[0], c[1])[0]); const zz = cb.map((c) => P(c[0], c[1])[1]);
          const r = subTri(th, zz);
          tot += r.area; totN += 1;
          if (r.kinkDeg >= VIS) { hot += r.area; hotN += 1; }
        }
      }
    }
    const line = `   L=${L} (${nS}x${nS})  sub-tris ${totN}  crease-carrying AREA ${hot.toFixed(4)} of ${tot.toFixed(4)} mm2 = ${((hot / tot) * 100).toFixed(2)}%   by COUNT ${hotN} = ${((hotN / totN) * 100).toFixed(2)}%`;
    log(line); out.push(line);
    log(`        ${el()}`);
  }
  log('   FLOOR: L=0 must reproduce the published ~99% of area or my crease test is not theirs.');
  log('   CEILING: if the share HALVES per level, the published 0.1805%-of-mesh irreducible AREA is a');
  log('   property of THIS mesh\'s facet size and does not port to a finer or differently-sized mesh.');
  writeFileSync(`${OUTDIR}/REV_S115_ORACLE_${TAG}.ladder.txt`, `${out.join('\n')}\n`);
  log('');
}
log(`done ${el()}`);

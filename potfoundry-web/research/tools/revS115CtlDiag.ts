// revS115CtlDiag.ts — DIAGNOSE MY OWN R2 CONTROL BEFORE TRUSTING IT.
// R2 read a 95.50% false-positive rate for `sepCreaseDeg >= 45` on smooth pairs while the published
// `crease` flag reads 3.17% on the same kind of population. Either the headline instrument is broken
// or MY control is. This decides which, by:
//   D1  matching the published control's SELECTION exactly (random facets, perFacetMaxRad < 2 deg,
//       graphRatio <= 8, not in target) instead of my edge-ordered scan, and reporting BOTH statistics
//       (the 2-means crease flag AND sepCreaseDeg) on the SAME facets. Diff printed values.
//   D2  reporting what those control facets actually ARE: z, normDeg(inset 0.05/0.10), max POINTWISE
//       one-sided kink, and the analytic 2-means sep. A mesh-flatness control is not a surface-
//       smoothness control, and if these facets sit on a real crease my R2 is void, not the oracle.
//   D3  splitting sepCreaseDeg by whether the pair's own POINTWISE kink is small. The pointwise kink
//       is the only thing that can legitimately produce a >45 cross-flank jump at gap 0.
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const NDJ = 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const STL = process.env.PF_REV_STL as string;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120; const VIS = 45; const K_LAT = 12; const NCROSS = 8; const SEP_MIN = 15; const DEG = 180 / Math.PI;
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const q = (v: number[], p: number): number => { const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b); return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
const rAbase = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const scratch = new Float64Array(12);
const ns = fdNormals(rA, H, 2e-4, 2e-4);
const M = readMeshFloat64(STL, false); const xyz = M.xyz; const nTri = M.nTri;
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
const rows = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as { f1: number; f2: number });
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1]) + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az; const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f); const rRef = rRefOf(f);
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => { let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2]; dp = dp > 1 ? 1 : dp < -1 ? -1 : dp; return Math.acos(dp); };
interface Samp { n: Float64Array; m: number; pth: Float64Array; pz: Float64Array; maxKink: number }
function sampleFacet(f: number, k: number, inset: number, sampler: NormalSampler): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8]; const rRef = rRefOf(f);
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
  const sh = 1 - inset; const sc = inset / 3; let m = 0; let maxKink = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
    const th = wa * ath + wb * bth + wc * cth; const z = wa * az + wb * bz + wc * cz;
    const nc = sampler(th, z, scratch);
    for (let a = 0; a < nc; a += 1) for (let b = a + 1; b < nc; b += 1) { const t = angU(scratch, a * 3, scratch, b * 3); if (t > maxKink) maxKink = t; }
    for (let qi = 0; qi < nc; qi += 1) { n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2]; pth[m] = rRef * th; pz[m] = z; m += 1; }
  }
  return { n, m, pth, pz, maxKink: maxKink * DEG };
}
function twoMeans(n: Float64Array, m: number): { lab: Int8Array; sepRad: number; wA: number; wB: number; nA: number } {
  const lab = new Int8Array(m); const c = new Float64Array(6);
  if (m === 0) return { lab, sepRad: 0, wA: 0, wB: 0, nA: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < m; i += 1) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  let L = Math.hypot(sx, sy, sz); if (!(L > 0)) L = 1;
  const mean = new Float64Array([sx / L, sy / L, sz / L]);
  let i1 = 0; let best = -1;
  for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = 0; best = -1;
  for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
  c[0] = n[i1 * 3]; c[1] = n[i1 * 3 + 1]; c[2] = n[i1 * 3 + 2]; c[3] = n[i2 * 3]; c[4] = n[i2 * 3 + 1]; c[5] = n[i2 * 3 + 2];
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; let na = 0; let nb = 0;
    for (let i = 0; i < m; i += 1) { const da = angU(n, i * 3, c, 0); const db = angU(n, i * 3, c, 3);
      if (da <= db) { lab[i] = 0; ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
      else { lab[i] = 1; bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; nb += 1; } }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (nb > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || nb === 0) break;
  }
  let wA = 0; let wB = 0; let na = 0; let nb = 0;
  for (let i = 0; i < m; i += 1) { if (lab[i] === 0) { na += 1; wA = Math.max(wA, angU(n, i * 3, c, 0)); } else { nb += 1; wB = Math.max(wB, angU(n, i * 3, c, 3)); } }
  return { lab, sepRad: na > 0 && nb > 0 ? angU(c, 0, c, 3) : 0, wA, wB, nA: na };
}
function pairStat(f1: number, f2: number): { sepCreaseDeg: number; sepCentDeg: number; gapMm: number; kink: number } {
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
  return { sepCreaseDeg: sc * DEG, sepCentDeg: sp.sepRad * DEG, gapMm: take > 0 ? cand[take - 1].dd : NaN, kink: Math.max(s1.maxKink, s2.maxKink) };
}
const normDegOf = (f: number, inset: number): number => {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(ns, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5], xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: 8, inset, orient: 'outward', scratch }).normDeg;
};

log('===== REV-S115 D — IS MY R2 CONTROL SOUND, OR IS THE HEADLINE INSTRUMENT? =====');
const inTarget = new Set<number>(); for (const r of rows) { inTarget.add(r.f1); inTarget.add(r.f2); }
const lo = (2 * Math.PI) / 180;
// D1 — the PUBLISHED selection: RANDOM facets, perFacetMaxRad < 2 deg, wall, not in target (their seed/RNG).
let seed = 12345;
const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pool: number[] = [];
for (let tries = 0; tries < 400000 && pool.length < 600; tries += 1) {
  const f = Math.floor(rnd() * nTri);
  if (inTarget.has(f) || d.perFacetMaxRad[f] >= lo || graphRatio(f) > 8) continue;
  pool.push(f);
}
log(`D1 published-style SMOOTH CONTROL: ${pool.length} random wall facets, max adjacent dihedral < 2 deg, not in target.`);
const singles = pool.map((f) => { const s = sampleFacet(f, K_LAT, 0, ns); const sp = twoMeans(s.n, s.m); const idxA: number[] = []; const idxB: number[] = [];
  for (let i = 0; i < s.m; i += 1) (sp.lab[i] === 0 ? idxA : idxB).push(i);
  const minSide = Math.min(idxA.length, idxB.length); const sepDeg = sp.sepRad * DEG;
  return { f, sepDeg, crease: sepDeg >= SEP_MIN && minSide >= 2 && sepDeg > Math.max(sp.wA, sp.wB) * DEG, kink: s.maxKink }; });
const nCr = singles.filter((x) => x.crease).length;
log(`   their statistic (2-means crease flag): ${nCr} = ${((nCr / pool.length) * 100).toFixed(2)}%   (published 3.17%)`);
log(`   sepDeg p50 ${q(singles.map((x) => x.sepDeg), 0.5).toFixed(4)} p90 ${q(singles.map((x) => x.sepDeg), 0.9).toFixed(4)} MAX ${mx(singles.map((x) => x.sepDeg)).toFixed(3)} deg   (published p50 0.4341 p90 1.3473 MAX 163.752)`);
log(`   POINTWISE one-sided kink over the footprint: p50 ${q(singles.map((x) => x.kink), 0.5).toExponential(2)} p90 ${q(singles.map((x) => x.kink), 0.9).toFixed(4)} MAX ${mx(singles.map((x) => x.kink)).toFixed(3)} deg`);
log(`   their normDeg(0.05) p50 ${q(pool.map((f) => normDegOf(f, 0.05)), 0.5).toFixed(4)} MAX ${mx(pool.map((f) => normDegOf(f, 0.05))).toFixed(3)} deg`);
log(`   their z p10 ${q(pool.map((f) => xyz[f * 9 + 2]), 0.1).toFixed(2)} p50 ${q(pool.map((f) => xyz[f * 9 + 2]), 0.5).toFixed(2)} p90 ${q(pool.map((f) => xyz[f * 9 + 2]), 0.9).toFixed(2)} mm`);
log('');
// D2 — the PAIR statistic on the SAME facets: pair each control facet with its lowest-dihedral neighbour.
const nbrOf = new Map<number, number>();
for (let e = 0; e < d.interiorEdges; e += 1) {
  for (const [a, b] of [[d.edgeF1[e], d.edgeF2[e]], [d.edgeF2[e], d.edgeF1[e]]] as Array<[number, number]>) {
    if (!nbrOf.has(a) && d.edgeAngRad[e] < lo && d.perFacetMaxRad[b] < lo && !inTarget.has(b) && graphRatio(b) <= 8) nbrOf.set(a, b);
  }
}
const pairs = pool.filter((f) => nbrOf.has(f)).map((f) => [f, nbrOf.get(f) as number] as [number, number]);
const ps = pairs.map(([a, b]) => pairStat(a, b));
const scv = ps.map((x) => x.sepCreaseDeg);
const fp = scv.filter((x) => x >= VIS).length;
log(`D2 THE HEADLINE STATISTIC on the SAME ${pairs.length} control facets (paired with a smooth neighbour):`);
log(`   sepCreaseDeg p50 ${q(scv, 0.5).toFixed(4)} p90 ${q(scv, 0.9).toFixed(3)} MAX ${mx(scv).toFixed(3)} deg`);
log(`   labelled IRREDUCIBLE (>= ${VIS}): ${fp} = ${((fp / Math.max(1, pairs.length)) * 100).toFixed(2)}%`);
log(`   sepCentDeg  p50 ${q(ps.map((x) => x.sepCentDeg), 0.5).toFixed(4)} MAX ${mx(ps.map((x) => x.sepCentDeg)).toFixed(3)} deg`);
log(`   gapMm == 0: ${ps.filter((x) => x.gapMm === 0).length}/${ps.length}`);
log(`   max POINTWISE kink in the pair: p50 ${q(ps.map((x) => x.kink), 0.5).toExponential(2)} p90 ${q(ps.map((x) => x.kink), 0.9).toFixed(3)} MAX ${mx(ps.map((x) => x.kink)).toFixed(3)} deg`);
log('');
// D3 — split by pointwise kink: a >45 cross-flank jump at gap 0 can ONLY be legitimate if there is a kink.
const noKink = ps.filter((x) => x.kink < 5);
log(`D3 pairs whose POINTWISE kink is < 5 deg everywhere (no crease anywhere in the footprint): ${noKink.length}/${ps.length}`);
if (noKink.length > 0) {
  const v = noKink.map((x) => x.sepCreaseDeg);
  const f2 = v.filter((x) => x >= VIS).length;
  log(`   ... of those, sepCreaseDeg p50 ${q(v, 0.5).toFixed(4)} MAX ${mx(v).toFixed(3)} deg;  labelled IRREDUCIBLE ${f2} = ${((f2 / noKink.length) * 100).toFixed(2)}%`);
  log('   >>> ANY non-zero rate here is a FALSE POSITIVE of the headline instrument: no kink exists.');
}
log('done');

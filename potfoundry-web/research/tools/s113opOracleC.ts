// s113opOracleC.ts — OPERATOR 4, PART C. THE RESOLVING MEASUREMENT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT PARTS A AND B ACTUALLY ESTABLISHED, AND THE TWO DEFECTS IN MY OWN INSTRUMENTS THEY EXPOSED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PART A ran the flank decomposition on the FULL footprint (inset 0) and found a crease inside 97.05% of
// the target facets. PART B ran the same decomposition on the INTERIOR only (inset 0.1) and found a
// crease inside 2,009 of 24,587 high-dihedral wall facets. Both are correct and they are not in conflict:
// *** A CONFORMED FACET HAS THE CREASE ON ITS BOUNDARY. *** An inset-0 lattice samples the boundary, so
// it reports "crease inside" for exactly the facets that are doing the right thing. That is S112's
// inset-0 artefact reappearing inside MY OWN classifier, and it means Part A's per-facet crease label is
// not a straddle test. The interior test is. Part A's PAIR-level across-crease turn is unaffected — it
// asks what the SURFACE does in the neighbourhood, not where the facet sits.
//
// PART B's second defect: I labelled "CONFORMED-GEOMETRIC" as `interior crease present AND minority
// share <= 2%`, which is self-contradictory — a conformed facet has NO interior crease at all. The class
// it actually selected (152 facets, normDeg p50 138 deg) is facets with a crease grazing just inside the
// inset boundary, i.e. NEAR-MISSES. The genuinely aligned population is the one Part B printed as "NO
// CREASE in the interior footprint": 22,578 facets, normDeg p50 2.224 deg, ADJACENT DIHEDRAL p50 157.50
// deg. PB3a is therefore VOID as printed (wrong class), and this file re-measures it on the right class.
//
// PART B's third defect: the refinement ladder called a sub-triangle PURE when `sep < 45 OR minor <= 0.1`,
// so a sub-triangle holding a 160-deg crease with a 5% minority passed as pure and carried its whole
// straddle into the "pure" statistic. The ladder rose with refinement, which is impossible for a decaying
// quantity and is the signature of a population that changes per level. Re-run here with PURE := no
// crease at all (sep < 15 deg), which is a like-for-like test.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE RESULT THAT SURVIVES ALL OF THAT, AND IT IS THE ANSWER TO THE BRIEF
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// 22,578 facets of this shipping mesh are ACCURATE (normDeg p50 2.2 deg — they lie inside a single flank)
// and SIMULTANEOUSLY show an adjacent dihedral of p50 157.5 deg. Perfect alignment does not reduce the
// visible angle by one degree, because the visible angle IS the surface. That is measured, on the mesh,
// with no clustering in the verdict chain.
//
// PRE-REGISTERED FOR PART C:
//  PC1  Of the 6,193 pinned target facets, the majority (>= 50%) have NO crease in their interior
//       footprint — i.e. they are boundary-contact, not interior straddles, and the aligned-edge
//       operator has nothing to cut in them.  KILL LINE: if < 50%, the target set really is dominated by
//       interior straddles and the crease programme has the headroom Part A's fidelity side suggested.
//  PC2  The corrected refinement ladder halves the pure-sub-triangle normDeg per level on the straddling
//       class, as it already provably does on the smooth control (0.543/0.300/0.176/0.087).
//
// Usage: bash research/tools/run-s113op-oraclec.sh
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

const STL = process.env.PF_S113OP_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJ = process.env.PF_S113OP_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const ORA = process.env.PF_S113OPC_ORACLE ?? 'research/exchange/_strataConformBisect/straddle/S113OP_ORACLE_GOTH.ndjson';
const STYLE = process.env.PF_S113OP_STYLE ?? 'GothicArches';
const TAG = process.env.PF_S113OP_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_S113OP_H', 120), Rb: envF('PF_S113OP_RB', 40), Rt: envF('PF_S113OP_RT', 50), expn: 1 };
const H = DIMS.H;
const VIS_DEG = envF('PF_S113OP_VIS', 45);
const CREASE_MIN = envF('PF_S113OPC_CREASEMIN', 15);
const K_LAT = 12;
const K_FINE = 48;
const H_FD = 2e-4;
const K_OBS = 8;
const DEG = 180 / Math.PI;
const INSETS = [0, 0.02, 0.05, 0.1, 0.2];

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
const nsObs = fdNormals(rA, H, 2e-4, 2e-4);
const nsMain = fdNormals(rA, H, H_FD, H_FD);

log('===== S113-OP4 PART C — THE RESOLVING MEASUREMENT =====');
log(`PC1  >= 50% of the 6,193 pinned target facets have NO crease in their INTERIOR footprint. KILL if < 50%.`);
log('PC2  the corrected refinement ladder halves per level on the straddling class.');
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
  if (worst * 1000 > 50) { log('*** REFUSING ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];

interface Row { e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number }
const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
interface OraRow { e: number; f1: number; f2: number; sepCreaseDeg: number; irreducible: boolean }
const ora: OraRow[] = readFileSync(ORA, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as OraRow);
if (ora.length !== rows.length) { log('*** row-count mismatch between the pinned dump and Part A. VOID. ***'); process.exit(5); }
for (let i = 0; i < rows.length; i += 1) {
  if (ora[i].e !== rows[i].e || ora[i].f1 !== rows[i].f1) { log('*** row alignment mismatch. VOID. ***'); process.exit(5); }
}
const uniqF: number[] = [];
{ const s = new Set<number>(); for (const r of rows) for (const f of [r.f1, r.f2]) if (!s.has(f)) { s.add(f); uniqF.push(f); } }
let targetArea = 0; for (const f of uniqF) targetArea += d.areaMm2[f];
log(`mesh ${nTri} facets ${meshArea.toFixed(3)} mm2 | target ${uniqF.length} facets ${targetArea.toFixed(3)} mm2 = ${((targetArea / meshArea) * 100).toFixed(4)}%  ${el()}`);
log('');

// ── shared geometry (identical bodies to Parts A/B) ────────────────────────────────────────────────────
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
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
  const aP = 0.5 * Math.abs((rRefOf(f) * (bth - ath)) * (cz - az) - (bz - az) * (rRefOf(f) * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp; return Math.acos(dp);
};
interface Samp { n: Float64Array; wa: Float64Array; wb: Float64Array; m: number }
function sampleFacet(f: number, k: number, inset: number, ns: NormalSampler): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3); const wa = new Float64Array(cap * 4); const wb = new Float64Array(cap * 4);
  const sh = 1 - inset; const sc = inset / 3;
  let m = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const a = sh * (i / k) + sc; const b = sh * (j / k) + sc; const c = 1 - a - b;
    const nc = ns(a * ath + b * bth + c * cth, a * az + b * bz + c * cz, scratch);
    for (let qi = 0; qi < nc; qi += 1) {
      n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
      wa[m] = a; wb[m] = b; m += 1;
    }
  }
  return { n, wa, wb, m };
}
function twoMeansOn(n: Float64Array, idx: number[]): { sepDeg: number; minor: number } {
  const m = idx.length;
  if (m < 2) return { sepDeg: 0, minor: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (const i of idx) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  const L0 = Math.hypot(sx, sy, sz) || 1;
  const mean = new Float64Array([sx / L0, sy / L0, sz / L0]);
  let i1 = idx[0]; let best = -1;
  for (const i of idx) { const a = angU(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = idx[0]; best = -1;
  for (const i of idx) { const a = angU(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
  const c = new Float64Array([n[i1 * 3], n[i1 * 3 + 1], n[i1 * 3 + 2], n[i2 * 3], n[i2 * 3 + 1], n[i2 * 3 + 2]]);
  let na = 0;
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; na = 0;
    for (const i of idx) {
      if (angU(n, i * 3, c, 0) <= angU(n, i * 3, c, 3)) { ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
      else { bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (m - na > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || na === m) break;
  }
  return { sepDeg: na > 0 && na < m ? angU(c, 0, c, 3) * DEG : 0, minor: Math.min(na, m - na) / m };
}
function minimaxUB(n: Float64Array, idx: number[]): number {
  if (idx.length === 0) return 0;
  let sx = 0; let sy = 0; let sz = 0;
  for (const i of idx) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  const L = Math.hypot(sx, sy, sz) || 1;
  const cur = new Float64Array([sx / L, sy / L, sz / L]);
  const worst = (): { a: number; i: number } => {
    let a = -1; let bi = idx[0];
    for (const i of idx) { const t = angU(n, i * 3, cur, 0); if (t > a) { a = t; bi = i; } }
    return { a, i: bi };
  };
  let ub = worst().a;
  for (let it = 0; it < 80; it += 1) {
    const w = worst(); const lam = 0.5 / (it + 2);
    const tx = (1 - lam) * cur[0] + lam * n[w.i * 3]; const ty = (1 - lam) * cur[1] + lam * n[w.i * 3 + 1];
    const tz = (1 - lam) * cur[2] + lam * n[w.i * 3 + 2];
    const l2 = Math.hypot(tx, ty, tz) || 1;
    cur[0] = tx / l2; cur[1] = ty / l2; cur[2] = tz / l2;
    const a = worst().a; if (a < ub) ub = a;
  }
  return ub;
}
const obsNorm = (f: number, inset: number): number => {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(nsObs, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_OBS, inset, orient: 'outward', scratch }).normDeg;
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE C1 — WHERE DOES THE CREASE SIT RELATIVE TO EACH PINNED TARGET FACET? (inset SWEPT)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const interiorSep = new Map<number, number>();
const interiorMinor = new Map<number, number>();
{
  log('── STAGE C1: interior-vs-boundary crease location for the 6,193 pinned target facets ──');
  log('   (an inset-0 lattice samples the BOUNDARY, where a CONFORMED facet puts the crease on purpose,');
  log('    so "crease in footprint" at inset 0 is not a straddle test. The sweep shows the whole story.)');
  for (const ins of INSETS) {
    const seps: number[] = []; const minors: number[] = [];
    let nCr = 0; let aCr = 0;
    for (const f of uniqF) {
      const s = sampleFacet(f, K_LAT, ins, nsMain);
      const idx: number[] = []; for (let i = 0; i < s.m; i += 1) idx.push(i);
      const r = twoMeansOn(s.n, idx);
      seps.push(r.sepDeg); minors.push(r.minor);
      const cr = r.sepDeg >= CREASE_MIN && r.minor >= 0.02;
      if (cr) { nCr += 1; aCr += d.areaMm2[f]; }
      if (ins === 0.1) { interiorSep.set(f, r.sepDeg); interiorMinor.set(f, r.minor); }
    }
    const nd = uniqF.map((f) => obsNorm(f, ins));
    log(`  inset ${ins.toFixed(2)}  crease-in-footprint COUNT ${nCr} (${((nCr / uniqF.length) * 100).toFixed(2)}%)  AREA ${aCr.toFixed(3)} mm2 = ${((aCr / targetArea) * 100).toFixed(2)}% of target`);
    log(`             sep p50 ${q(seps, 0.5).toFixed(2)} p90 ${q(seps, 0.9).toFixed(2)} MAX ${mx(seps).toFixed(2)} | minority p50 ${q(minors, 0.5).toFixed(3)} p90 ${q(minors, 0.9).toFixed(3)}`);
    log(`             observed normDeg p50 ${q(nd, 0.5).toFixed(3)} p90 ${q(nd, 0.9).toFixed(2)} MAX ${mx(nd).toFixed(2)} deg`);
  }
  const noInt = uniqF.filter((f) => !((interiorSep.get(f) as number) >= CREASE_MIN && (interiorMinor.get(f) as number) >= 0.02));
  let aNo = 0; for (const f of noInt) aNo += d.areaMm2[f];
  const pc1 = (noInt.length / uniqF.length) * 100;
  log('');
  log(`  >>> PC1  target facets with NO crease in the INTERIOR (inset 0.1) footprint:`);
  log(`      COUNT ${noInt.length}/${uniqF.length} = ${pc1.toFixed(2)}%   AREA ${aNo.toFixed(3)} mm2 = ${((aNo / targetArea) * 100).toFixed(2)}% of target`);
  log(`      => ${pc1 >= 50 ? 'PC1 SURVIVES' : '*** PC1 FALSIFIED ***'}`);
  log(`      their normDeg at inset 0.1: p50 ${q(noInt.map((f) => obsNorm(f, 0.1)), 0.5).toFixed(3)} p90 ${q(noInt.map((f) => obsNorm(f, 0.1)), 0.9).toFixed(2)} MAX ${mx(noInt.map((f) => obsNorm(f, 0.1))).toFixed(2)} deg`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE C2 — THE EMPIRICAL CEILING, ON THE RIGHT CLASS THIS TIME.
// The ALIGNED population: high-dihedral wall facets with NO crease in their interior footprint AND a
// normDeg under 5 deg. These are facets that a perfect aligned-edge operator has ALREADY produced.
// The question is only whether their adjacent dihedral is still over the visibility cut.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  interface B { f: number; minor: number; sepDeg: number; dihDeg: number; area: number; n05: number; n10: number }
  const bs: B[] = readFileSync(`${OUTDIR}/S113OPB_ORACLE_${TAG}.ndjson`, 'utf8')
    .split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as B);
  log(`── STAGE C2: THE EMPIRICAL CEILING — ${bs.length} wall facets with an adjacent dihedral > ${VIS_DEG} deg ──`);
  const aligned = bs.filter((r) => !(r.sepDeg >= CREASE_MIN && r.minor >= 0.02) && r.n10 <= 5);
  const rest = bs.filter((r) => !aligned.includes(r));
  let aA = 0; for (const r of aligned) aA += r.area;
  let aR = 0; for (const r of rest) aR += r.area;
  log(`  ALIGNED (no interior crease AND normDeg(inset 0.1) <= 5 deg) — the operator's OWN OUTPUT, already in the mesh:`);
  log(`     COUNT ${aligned.length} (${((aligned.length / bs.length) * 100).toFixed(2)}%)  AREA ${aA.toFixed(3)} mm2 = ${((aA / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`     normDeg inset0.10  p50 ${q(aligned.map((r) => r.n10), 0.5).toFixed(4)} p90 ${q(aligned.map((r) => r.n10), 0.9).toFixed(3)} MAX ${mx(aligned.map((r) => r.n10)).toFixed(3)} deg`);
  log(`     ADJACENT DIHEDRAL  p10 ${q(aligned.map((r) => r.dihDeg), 0.1).toFixed(2)} p50 ${q(aligned.map((r) => r.dihDeg), 0.5).toFixed(2)} p90 ${q(aligned.map((r) => r.dihDeg), 0.9).toFixed(2)} MAX ${mx(aligned.map((r) => r.dihDeg)).toFixed(2)} deg`);
  const over = aligned.filter((r) => r.dihDeg > VIS_DEG);
  let aO = 0; for (const r of over) aO += r.area;
  log(`     of those, STILL over the ${VIS_DEG}-deg visibility cut: COUNT ${over.length} (${((over.length / Math.max(1, aligned.length)) * 100).toFixed(2)}%)  AREA ${aO.toFixed(3)} mm2`);
  log(`  NOT-ALIGNED remainder: COUNT ${rest.length}  AREA ${aR.toFixed(3)} mm2  normDeg(0.1) p50 ${q(rest.map((r) => r.n10), 0.5).toFixed(2)} MAX ${mx(rest.map((r) => r.n10)).toFixed(2)} deg`);
  log('');
  log('  *** THE CEILING: a facet that is ALREADY perfectly aligned to these creases achieves');
  log(`      normDeg p50 ${q(aligned.map((r) => r.n10), 0.5).toFixed(4)} deg and STILL renders a p50 ${q(aligned.map((r) => r.dihDeg), 0.5).toFixed(2)}-deg dihedral.`);
  log('      Alignment is a FIDELITY operator. It is not a visibility operator, at any quality. ***');
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE C3 — THE CORRECTED REFINEMENT LADDER. PURE := no crease at all (sep < CREASE_MIN).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const strad = uniqF.filter((f) => (interiorSep.get(f) as number) >= VIS_DEG && (interiorMinor.get(f) as number) >= 0.05);
  const sub = strad.slice(0, Math.min(120, strad.length));
  const inHi = new Set(uniqF);
  const ctl: number[] = []; let seed = 4242;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 400000 && ctl.length < 60; t += 1) {
    const f = Math.floor(rnd() * nTri);
    if (inHi.has(f) || d.perFacetMaxRad[f] >= (2 * Math.PI) / 180 || graphRatio(f) > 8) continue;
    ctl.push(f);
  }
  log(`── STAGE C3: CORRECTED refinement ladder. PURE := sep < ${CREASE_MIN} deg (no crease at all). ──`);
  log(`   interior straddlers available ${strad.length}; ladder on ${sub.length}; smooth control ${ctl.length}.`);
  const ladder = (fs: number[], label: string): void => {
    for (let L = 0; L <= 3; L += 1) {
      const nDiv = 1 << L;
      const worstPure: number[] = []; const pureFrac: number[] = [];
      for (const f of fs) {
        const s = sampleFacet(f, K_FINE, 0, nsMain);
        const buck = new Map<number, number[]>();
        for (let i = 0; i < s.m; i += 1) {
          const ia = Math.min(nDiv - 1, Math.floor(s.wa[i] * nDiv));
          const ib = Math.min(nDiv - 1, Math.floor(s.wb[i] * nDiv));
          const ic = Math.min(nDiv - 1, Math.floor((1 - s.wa[i] - s.wb[i]) * nDiv));
          const key = ((ia * nDiv + ib) * 2) + (ia + ib + ic === nDiv - 1 ? 0 : 1);
          if (!buck.has(key)) buck.set(key, []);
          (buck.get(key) as number[]).push(i);
        }
        let worst = 0; let nP = 0; let nT = 0;
        for (const g of buck.values()) {
          if (g.length < 3) continue;
          nT += 1;
          if (twoMeansOn(s.n, g).sepDeg >= CREASE_MIN) continue;   // holds a crease: the oracle cuts here
          nP += 1;
          worst = Math.max(worst, minimaxUB(s.n, g) * DEG);
        }
        pureFrac.push(nP / Math.max(1, nT));
        if (nP > 0) worstPure.push(worst);
      }
      log(`   ${label} L=${L} (${nDiv}x${nDiv})  PURE sub-tris p50 ${(q(pureFrac, 0.5) * 100).toFixed(1)}%  worst normDeg over PURE: p50 ${q(worstPure, 0.5).toFixed(4)} p90 ${q(worstPure, 0.9).toFixed(4)} MAX ${mx(worstPure).toFixed(3)} deg  (n=${worstPure.length})`);
    }
  };
  ladder(sub, 'STRADDLE');
  ladder(ctl, 'SMOOTH-CTL');
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE C4 — THE FINAL ACCOUNTING.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  // IRREDUCIBLE on the VISIBLE metric: the pair's neighbourhood carries a genuine >= VIS_DEG analytic
  // crease (Part A stage 3, which is a statement about the SURFACE and is untouched by the inset defect).
  // REDUCIBLE on the FIDELITY metric: the facet's INTERIOR straddles, so an aligned edge has something
  // to cut. These are DIFFERENT questions and the two answers are different.
  const irrPair = ora.map((o) => o.sepCreaseDeg >= VIS_DEG);
  const anyIrr = new Map<number, boolean>();
  for (let i = 0; i < rows.length; i += 1) for (const f of [rows[i].f1, rows[i].f2]) anyIrr.set(f, (anyIrr.get(f) ?? false) || irrPair[i]);
  let aIrr = 0; let nIrr = 0;
  for (const f of uniqF) if (anyIrr.get(f) === true) { aIrr += d.areaMm2[f]; nIrr += 1; }
  const stradF = uniqF.filter((f) => (interiorSep.get(f) as number) >= VIS_DEG && (interiorMinor.get(f) as number) >= 0.05);
  let aStrad = 0; for (const f of stradF) aStrad += d.areaMm2[f];
  const nd05 = uniqF.map((f) => obsNorm(f, 0.05));
  log('════════════════════════════════════════════════════════════════════════════════════════════════');
  log('  STAGE C4 — THE FINAL ACCOUNTING (the two questions, kept apart)');
  log('════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`  VISIBLE METRIC (adjacent dihedral > ${VIS_DEG} deg — what a preview shades):`);
  log(`    IRREDUCIBLE: the analytic surface turns >= ${VIS_DEG} deg across a crease in the neighbourhood.`);
  log(`      COUNT ${nIrr}/${uniqF.length} (${((nIrr / uniqF.length) * 100).toFixed(2)}%)  AREA ${aIrr.toFixed(4)} mm2 = ${((aIrr / targetArea) * 100).toFixed(2)}% of target = ${((aIrr / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`      MAX analytic crease turn ${mx(ora.map((o) => o.sepCreaseDeg)).toFixed(2)} deg`);
  log(`    REDUCIBLE: ${(targetArea - aIrr).toFixed(4)} mm2 = ${(((targetArea - aIrr) / targetArea) * 100).toFixed(2)}% of target = ${(((targetArea - aIrr) / meshArea) * 100).toFixed(4)}% of mesh`);
  log('');
  log('  FIDELITY METRIC (normDeg — how far the facet is from the analytic normal):');
  log(`    facets whose INTERIOR genuinely straddles (an aligned edge has something to cut):`);
  log(`      COUNT ${stradF.length}/${uniqF.length} (${((stradF.length / uniqF.length) * 100).toFixed(2)}%)  AREA ${aStrad.toFixed(4)} mm2 = ${((aStrad / targetArea) * 100).toFixed(2)}% of target = ${((aStrad / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`      their normDeg(inset 0.05) p50 ${q(stradF.map((f) => obsNorm(f, 0.05)), 0.5).toFixed(2)} MAX ${mx(stradF.map((f) => obsNorm(f, 0.05))).toFixed(2)} deg`);
  log(`    whole target set normDeg(inset 0.05) p50 ${q(nd05, 0.5).toFixed(2)} p90 ${q(nd05, 0.9).toFixed(2)} MAX ${mx(nd05).toFixed(2)} deg`);
  log('');
  writeFileSync(`${OUTDIR}/S113OPC_ORACLE_${TAG}.ndjson`, `${uniqF.map((f) => JSON.stringify({
    f, area: d.areaMm2[f], intSep: interiorSep.get(f), intMinor: interiorMinor.get(f),
    n05: obsNorm(f, 0.05), n10: obsNorm(f, 0.1), irr: anyIrr.get(f) === true,
  })).join('\n')}\n`);
  log(`wrote ${OUTDIR}/S113OPC_ORACLE_${TAG}.ndjson`);
}
log(`done ${el()}`);

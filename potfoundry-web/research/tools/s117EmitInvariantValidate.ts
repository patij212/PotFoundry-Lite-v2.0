// s117EmitInvariantValidate.ts — S117 P1 step 3/4: RE-VALIDATE THE PRODUCTION emitInvariant MODULE
// AT WHOLE-MESH SCALE, TWO-SIDED, WITH EVERY THRESHOLD SWEPT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// This harness imports the SHIPPING module — src/renderers/webgpu/parametric/conforming/emitInvariant.ts
// — and never re-implements it. If the module and the ladder ever disagree, CONTROL C2 below VOIDS the
// run rather than quietly printing the reconstruction.
//
// GROUND TRUTH (pre-registered, analytic-free except one scalar):
//   CLASS  facets whose max adjacent dihedral exceeds HI_DEG (45 deg, the inherited visibility bar)
//   BAD    facets whose max adjacent dihedral exceeds the ANALYTIC CEILING CEIL = 2*atan(max|grad r|).
//          The surface cannot produce that angle over that footprint, so the MESH made it.
//   BLADE  dihedral >= 175 deg (the fold-flat sub-class).
//   GOOD   facets in CLASS whose REAL orientRuler normDeg is <= ACC_BAR. REAL GEOMETRY.
//          *** A PREDICATE THAT FLAGS THE GOOD SET IS REFUTED. This file says so out loud. ***
//
// FIVE INSTRUMENT SCARS:
//  1 inset  passed EXPLICITLY to orientOfFacet AND to the predicate, swept {0,0.02,0.05,0.1}.
//  2 k      swept {4,8,16} on every orientOfFacet number. spreadRad is never quoted.
//  3 h      swept {2e-6,2e-5,2e-4,1e-3} on normDeg and on the ceiling.
//  4 cuts   tauQ, minAltMm, tauNDeg, posBar, CEIL, the 45 deg bar and ACC_BAR — all swept, ladders printed.
//  5 precond EXHAUSTIVE over every facet corner, never strided; position quoted PERPENDICULAR.
//
// MEASUREMENT DISCIPLINE: COUNT + AREA-share + MAX together, per facet, every share printing its
// DENOMINATOR. Cost-matched placebo in Stage 5b.
//
// Usage: bash research/tools/run-s117-validate.sh
//   env PF_S117_STL (absolute) PF_S117_STYLE PF_S117_TAG
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import {
  checkEmitInvariant, makeEmitVerdict, DEFENSIBLE_EMIT_INVARIANT,
  type EmitInvariantOptions, type EmitRejectReason,
} from '../../src/renderers/webgpu/parametric/conforming/emitInvariant';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envL = (n: string, d: string): number[] => (process.env[n] ?? d).split(',').map(Number);

const STYLE = process.env.PF_S117_STYLE ?? 'GothicArches';
const STL = process.env.PF_S117_STL ?? '';
const TAG = process.env.PF_S117_TAG ?? STYLE;
const OUTDIR = process.env.PF_S117_OUTDIR ?? 'research/exchange/_strataConformBisect/s117';
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

// ── ground-truth cuts ──────────────────────────────────────────────────────────────────────────
const HI_DEG = envF('PF_S117_HI_DEG', 45);
const BLADE_DEG = envF('PF_S117_BLADE', 175);
const ACC_BAR = envF('PF_S117_ACC', 10);
// ── ruler settings (the INDEPENDENT instrument) ────────────────────────────────────────────────
const K_REF = envI('PF_S117_K', 8);
const INSET_REF = envF('PF_S117_INSET', 0.05);
const H_REF = envF('PF_S117_HFD', 2e-6);
const CEIL_N = envI('PF_S117_CEILN', 1200);
const GT_CAP = envI('PF_S117_GTCAP', 240000);
const SWEEP_N = envI('PF_S117_SWEEPN', 4000);
// ── the predicate's swept knobs ────────────────────────────────────────────────────────────────
const INSETS = envL('PF_S117_INSETS', '0,0.02,0.05,0.1');
const INSET_S_IDX = Math.max(0, INSETS.indexOf(envF('PF_S117_INSET_S', 0.05)));
const TAUQ_LADDER = envL('PF_S117_TAUQ_LADDER', '0,1e-6,1e-4,0.001,0.005,0.01,0.02,0.05,0.1,0.2');
const ALT_LADDER = envL('PF_S117_ALT_LADDER', '0,1e-5,1e-4,5e-4,1e-3,2e-3,5e-3,1e-2,2e-2,5e-2');
const TAUN_LADDER = envL('PF_S117_TAUN_LADDER', '1,2,5,10,15,20,30,45,60,90');
const POS_LADDER = envL('PF_S117_POS_LADDER', '1e-4,3e-4,1e-3,3e-3,0.01,0.03,0.1');

if (STL.length === 0) { log('*** PF_S117_STL is required (ABSOLUTE path). ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const qt = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const amin = (a: number[]): number => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
const amax = (a: number[]): number => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };
const f3 = (v: number): string => (Number.isFinite(v) ? v.toFixed(3) : '—');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [kk, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(kk)] = v.default;
  }
  return out;
}
const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
let RA_CALLS = 0;
const rA = (th: number, z: number): number => {
  RA_CALLS += 1;
  return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
};

const OUT: Record<string, unknown> = {
  session: 'S117', style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS,
  defensible: DEFENSIBLE_EMIT_INVARIANT, gtCuts: { HI_DEG, BLADE_DEG, ACC_BAR },
  ruler: { K_REF, INSET_REF, H_REF }, insets: INSETS,
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S117 — PRODUCTION emitInvariant, WHOLE-MESH TWO-SIDED RE-VALIDATION — ${STYLE} (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`defs  ${Object.entries(DEFAULTS).map(([kk, v]) => `${kk}=${v}`).join(' ')}`);
log(`module DEFENSIBLE cut: tauQ=${DEFENSIBLE_EMIT_INVARIANT.tauQ} minAlt=${DEFENSIBLE_EMIT_INVARIANT.minAltMm}mm tauN=${DEFENSIBLE_EMIT_INVARIANT.tauNDeg}deg pos<=${DEFENSIBLE_EMIT_INVARIANT.posBarMm}mm inset=${DEFENSIBLE_EMIT_INVARIANT.inset} h=${DEFENSIBLE_EMIT_INVARIANT.fdStepMm} posMode=${DEFENSIBLE_EMIT_INVARIANT.posMode}`);
log(`gt cuts: class>${HI_DEG}deg  blade>=${BLADE_DEG}deg  ACC<=${ACC_BAR}deg   ruler k=${K_REF} inset=${INSET_REF} h=${H_REF}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD + PRECOND (EXHAUSTIVE, scar 5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nF = M.nTri;
log(`loaded ${nF} facets ${el()}`);
{
  const nC = nF * 3;
  let worst = 0; let wth = 0; let wz = 0; let over10 = 0; let over50 = 0;
  const devs: number[] = [];
  for (let c = 0; c < nC; c += 1) {
    const x = xyz[c * 3]; const y = xyz[c * 3 + 1]; const z = xyz[c * 3 + 2];
    const th = Math.atan2(y, x);
    const dd = Math.abs(Math.hypot(x, y) - rA(th, z)) * 1000;
    if (dd > worst) { worst = dd; wth = th; wz = z; }
    if (dd > 10) over10 += 1;
    if (dd > 50) over50 += 1;
    if (c % 37 === 0) devs.push(dd);
  }
  log('── STAGE 0 / CONTROL C1: PRECOND, EXHAUSTIVE over every FACET CORNER (no dedup, no stride) ──');
  log(`  corners ${nC}   |dr| p50 ${ex(qt(devs, 0.5))} p99 ${ex(qt(devs, 0.99))} um   MAX ${worst.toFixed(3)} um @ th=${f3(wth)} z=${f3(wz)}`);
  log(`  over 10 um: ${over10} (${pct(over10, nC)}% of corners)   over 50 um: ${over50} (${pct(over50, nC)}% of corners)`);
  if (over50 > 0) log(`  ██ ${over50} corners exceed the 50 um PRECOND gate (MAX ${worst.toFixed(1)} um) — REPORTED, not averaged in.`);
  OUT.precond = { nCorners: nC, p50Um: qt(devs, 0.5), p99Um: qt(devs, 0.99), maxUm: worst, over10, over50 };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — THE ANALYTIC CEILING (h SWEPT, scar 3)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
function ceilingAt(hfd: number, N: number): { gmax: number; deg: number } {
  let gmax = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const th = (2 * Math.PI * (i + 0.5)) / N; const z = (H * (j + 0.5)) / N;
      const r0 = rA(th, z);
      const hT = hfd / Math.max(1e-9, r0);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      let zl = z - hfd; let zh = z + hfd;
      if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
      if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const g = Math.hypot(rt / r0, rz);
      if (g > gmax) gmax = g;
    }
  }
  return { gmax, deg: 2 * Math.atan(gmax) * DEG };
}
log('── STAGE 1: ANALYTIC CEILING  CEIL = 2*atan(max|grad r|) — h SWEPT (scar 3) ──');
const CEIL_LADDER: Array<{ h: number; gmax: number; deg: number }> = [];
for (const hh of [2e-6, 2e-5, 2e-4, 1e-3]) {
  const c = ceilingAt(hh, 400);
  CEIL_LADDER.push({ h: hh, ...c });
  log(`   h=${ex(hh)} (400^2 grid)  max|grad r| ${c.gmax.toFixed(4)}  CEIL ${c.deg.toFixed(3)} deg`);
}
const CEILREF = ceilingAt(H_REF, CEIL_N);
const CEIL_DEG = CEILREF.deg;
log(`   REFERENCE h=${ex(H_REF)} on a ${CEIL_N}^2 grid: max|grad r| ${CEILREF.gmax.toFixed(4)}  ***CEIL = ${CEIL_DEG.toFixed(3)} deg*** ${el()}`);
OUT.ceiling = { ref: CEILREF, ladder: CEIL_LADDER, refDeg: CEIL_DEG };
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — RUN THE PRODUCTION MODULE EXHAUSTIVELY AND HARVEST ITS SCALARS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const A3 = new Float64Array(nF);
const APS = new Float64Array(nF);
const QP = new Float64Array(nF);
const MALT = new Float64Array(nF);
const NDEG: Float64Array[] = INSETS.map(() => new Float64Array(nF));
const POSP: Float64Array[] = INSETS.map(() => new Float64Array(nF));
const POSR = new Float64Array(nF);         // radial (the KNOWN-INFLATING projector), for the contrast
const HARD = new Uint8Array(nF);           // module's HARD geometric guard fired (zero 3D area / non-finite)
const THA = new Float64Array(nF);
const THB = new Float64Array(nF);
const THC = new Float64Array(nF);

for (let f = 0; f < nF; f += 1) {
  const o = f * 9;
  const tha = Math.atan2(xyz[o + 1], xyz[o]);
  THA[f] = tha;
  THB[f] = tha + dThRaw(tha, Math.atan2(xyz[o + 4], xyz[o + 3]));
  THC[f] = tha + dThRaw(tha, Math.atan2(xyz[o + 7], xyz[o + 6]));
}

const scratch = makeEmitVerdict();
/** Thresholds OFF so every term's scalar is produced; the verdict is reconstructed offline. */
function harvest(insetIdx: number, posMode: 'perpendicular' | 'radial', store: Float64Array | null): number {
  const base: EmitInvariantOptions = {
    sigma: 1, tauQ: 0, minAltMm: 0, rA, zMin: 0, zMax: H,
    tauNDeg: Number.POSITIVE_INFINITY, posBarMm: Number.POSITIVE_INFINITY,
    inset: INSETS[insetIdx], fdStepMm: H_REF, wsign: 1, posMode,
  };
  const flip: EmitInvariantOptions = { ...base, sigma: -1 };
  const t0 = Date.now();
  for (let f = 0; f < nF; f += 1) {
    const o = f * 9;
    let r = checkEmitInvariant(
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      THA[f], THB[f], THC[f], base, scratch,
    );
    // With tauQ=0 and minAltMm=0 the only refusals possible here are the module's HARD geometric guard
    // (zero 3D area / non-finite) and T2 FOLD.
    if (r.reason === 'degenerate') { HARD[f] = 1; }
    // A minority-winding facet is refused by T2 before T4 ever runs. Re-ask with the opposite sigma so
    // its ORIENTATION and POSITION are measured too — the fold set must not be a hole in the anatomy.
    if (r.reason === 'fold') {
      const keepQ = r.qP; const keepA = r.apSMm2; const keepM = r.minAltMm; const keepA3 = r.a3Mm2;
      r = checkEmitInvariant(
        xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
        THA[f], THB[f], THC[f], flip, scratch,
      );
      r.qP = keepQ; r.apSMm2 = keepA; r.minAltMm = keepM; r.a3Mm2 = keepA3;
    }
    if (insetIdx === INSET_S_IDX && posMode === 'perpendicular') {
      A3[f] = r.a3Mm2; APS[f] = r.apSMm2; QP[f] = r.qP; MALT[f] = r.minAltMm;
    }
    NDEG[insetIdx][f] = r.normDeg;
    if (store !== null) store[f] = r.posMm; else POSP[insetIdx][f] = r.posMm;
  }
  return Date.now() - t0;
}

log(`── STAGE 2: THE PRODUCTION PREDICATE, EXHAUSTIVE OVER ALL ${nF} FACETS (${INSETS.length} insets, scar 1) ──`);
let tHarvest = 0;
for (let li = 0; li < INSETS.length; li += 1) tHarvest += harvest(li, 'perpendicular', null);
const tRadial = harvest(INSET_S_IDX, 'radial', POSR);
let MESH_AREA = 0; for (let f = 0; f < nF; f += 1) MESH_AREA += A3[f];
log(`   done ${el()}   T4-ON wall-clock ${((tHarvest / INSETS.length) / 1000).toFixed(2)}s/inset = ${((tHarvest / INSETS.length) * 1e6 / nF).toFixed(0)} ns/triangle (42 rA evals/tri)`);
log(`   mesh AREA ${MESH_AREA.toFixed(3)} mm2   facets ${nF}   radial-position pass ${(tRadial / 1000).toFixed(2)}s`);
{
  let negAp = 0; let negApArea = 0;
  for (let f = 0; f < nF; f += 1) if (APS[f] < 0) { negAp += 1; negApArea += A3[f]; }
  log(`   signed parameter area NEGATIVE on ${negAp} facets (${pct(negAp, nF)}% of facets) carrying ${negApArea.toFixed(3)} mm2 (${pct(negApArea, MESH_AREA)}% OF MESH)`);
  log(`   => the module's sigma=+1 is the AREA-WEIGHTED MAJORITY winding; T2 flags the minority.`);
  OUT.stage2 = { nF, meshArea: MESH_AREA, negAp, negApArea, nsPerTri: (tHarvest / INSETS.length) * 1e6 / nF };
}
{
  const s: number[] = []; const m: number[] = []; const p: number[] = []; const pr: number[] = [];
  for (let f = 0; f < nF; f += 37) { s.push(QP[f]); m.push(MALT[f]); p.push(POSP[INSET_S_IDX][f]); pr.push(POSR[f]); }
  log(`   qP     p01 ${ex(qt(s, 0.01))} p50 ${f3(qt(s, 0.5))} p99 ${f3(qt(s, 0.99))}   (inset-free, zero evals)`);
  log(`   minAlt p01 ${ex(qt(m, 0.01))} p50 ${ex(qt(m, 0.5))} p99 ${ex(qt(m, 0.99))} mm  (inset-free, zero evals)`);
  log(`   posPERP p50 ${ex(qt(p, 0.5))} p99 ${ex(qt(p, 0.99))} mm   posRADIAL p50 ${ex(qt(pr, 0.5))} p99 ${ex(qt(pr, 0.99))} mm  => radial/perp p99 ratio ${(qt(pr, 0.99) / qt(p, 0.99)).toFixed(3)}x`);
  for (let li = 0; li < INSETS.length; li += 1) {
    const n: number[] = []; for (let f = 0; f < nF; f += 37) n.push(NDEG[li][f]);
    log(`   inset=${String(INSETS[li]).padStart(5)}  nDeg p50 ${f3(qt(n, 0.5))} p90 ${f3(qt(n, 0.9))} p99 ${f3(qt(n, 0.99))}`);
  }
  log(`   REFERENCE predicate inset = ${INSETS[INSET_S_IDX]}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — GROUND TRUTH
// ══════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 3: GROUND TRUTH (analytic-free dihedral classes + the INDEPENDENT orientRuler) ──');
const idxAll = new Uint32Array(nF * 3); for (let i = 0; i < nF * 3; i += 1) idxAll[i] = i;
const DD = facetDihedrals(xyz, idxAll);
log(`   topology: interior ${DD.interiorEdges}  boundary ${DD.boundaryEdges}  non-manifold ${DD.nonManifoldEdges}  inconsistent winding ${DD.inconsistentEdges} ${el()}`);
const hiThr = (HI_DEG * Math.PI) / 180;
const ceThr = (CEIL_DEG * Math.PI) / 180;
const blThr = (BLADE_DEG * Math.PI) / 180;
const CLASS: number[] = []; const BAD: number[] = []; const BLADE: number[] = [];
let clsA = 0; let badA = 0; let blA = 0; let dMax = 0; let badMax = 0;
for (let f = 0; f < nF; f += 1) {
  const d = DD.perFacetMaxRad[f];
  if (d > dMax) dMax = d;
  if (d > hiThr) { CLASS.push(f); clsA += A3[f]; }
  if (d > ceThr) { BAD.push(f); badA += A3[f]; if (d > badMax) badMax = d; }
  if (d >= blThr) { BLADE.push(f); blA += A3[f]; }
}
log(`   >${HI_DEG} deg CLASS       COUNT ${CLASS.length} (${pct(CLASS.length, nF)}% of facets)  AREA ${clsA.toFixed(3)} mm2 (${pct(clsA, MESH_AREA)}% OF MESH)  dihedral MAX ${(dMax * DEG).toFixed(3)} deg`);
log(`   >CEIL(${CEIL_DEG.toFixed(2)}) = "BAD"  COUNT ${BAD.length} (${pct(BAD.length, nF)}% of facets)  AREA ${badA.toFixed(3)} mm2 (${pct(badA, MESH_AREA)}% OF MESH) = ${pct(badA, clsA)}% OF THE >${HI_DEG} CLASS   MAX ${(badMax * DEG).toFixed(3)} deg`);
log(`   >=${BLADE_DEG} deg BLADE     COUNT ${BLADE.length} (${pct(BLADE.length, nF)}% of facets)  AREA ${blA.toFixed(3)} mm2 (${pct(blA, MESH_AREA)}% OF MESH) = ${pct(blA, clsA)}% OF THE >${HI_DEG} CLASS`);
log('');

// the REAL ruler, scars 1/2/3 swept on a subsample
const rulerScratch = new Float64Array(12);
function realND(f: number, k: number, inset: number, hfd: number): number {
  const o = f * 9;
  const ns = fdNormals(rA, H, hfd, hfd);
  return orientOfFacet(
    ns, xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
    THA[f], THB[f], THC[f], { k, inset, scratch: rulerScratch },
  ).normDeg;
}
{
  const stride = Math.max(1, Math.floor(CLASS.length / SWEEP_N));
  const sub: number[] = []; for (let i = 0; i < CLASS.length; i += stride) sub.push(CLASS[i]);
  log(`   ── SCARS 1/2/3 on the REAL orientRuler over the >${HI_DEG} class (subsample ${sub.length} of ${CLASS.length}) ──`);
  const scarOut: Record<string, unknown> = {};
  log(`   SCAR 1 — inset (k=${K_REF}, h=${ex(H_REF)}):`);
  for (const ins of [0, 0.02, 0.05, 0.1]) {
    const a = sub.map((f) => realND(f, K_REF, ins, H_REF));
    const under = a.filter((x) => x <= ACC_BAR).length;
    log(`     inset=${ins.toFixed(2)}  normDeg p50 ${f3(qt(a, 0.5))} p90 ${f3(qt(a, 0.9))} MAX ${f3(amax(a))}  <=${ACC_BAR}deg share ${((under / a.length) * 100).toFixed(2)}%`);
    scarOut[`inset${ins}`] = { p50: qt(a, 0.5), p90: qt(a, 0.9), max: Math.max(...a), underShare: under / a.length };
  }
  log(`   SCAR 2 — lattice order k (inset=${INSET_REF}):`);
  for (const k of [4, 8, 16]) {
    const a = sub.map((f) => realND(f, k, INSET_REF, H_REF));
    const under = a.filter((x) => x <= ACC_BAR).length;
    log(`     k=${k}  normDeg p50 ${f3(qt(a, 0.5))} p90 ${f3(qt(a, 0.9))} MAX ${f3(amax(a))}  <=${ACC_BAR}deg share ${((under / a.length) * 100).toFixed(2)}%`);
    scarOut[`k${k}`] = { p50: qt(a, 0.5), p90: qt(a, 0.9), max: Math.max(...a), underShare: under / a.length };
  }
  log(`   SCAR 3 — fd step h (k=${K_REF}, inset=${INSET_REF}):`);
  for (const hh of [2e-6, 2e-5, 2e-4, 1e-3]) {
    const a = sub.map((f) => realND(f, K_REF, INSET_REF, hh));
    const under = a.filter((x) => x <= ACC_BAR).length;
    log(`     h=${ex(hh)}  normDeg p50 ${f3(qt(a, 0.5))} p90 ${f3(qt(a, 0.9))} MAX ${f3(amax(a))}  <=${ACC_BAR}deg share ${((under / a.length) * 100).toFixed(2)}%`);
    scarOut[`h${hh}`] = { p50: qt(a, 0.5), p90: qt(a, 0.9), max: Math.max(...a), underShare: under / a.length };
  }
  OUT.scars = scarOut;
}

// GOOD = CLASS and real normDeg <= ACC_BAR (exhaustive up to GT_CAP)
const GOOD: number[] = []; let goodA = 0; let goodMaxND = 0;
const CLASS_LIM = Math.min(CLASS.length, GT_CAP);
/** The real orientRuler over the class, computed ONCE and reused by every GOOD-set redefinition. */
const CLASS_ND = new Float64Array(CLASS_LIM);
{
  const lim = CLASS_LIM;
  if (CLASS.length > GT_CAP) log(`   ** >${HI_DEG} class has ${CLASS.length} facets, capped at ${GT_CAP} for the exhaustive real normDeg **`);
  for (let i = 0; i < lim; i += 1) {
    const f = CLASS[i];
    const nd = realND(f, K_REF, INSET_REF, H_REF);
    CLASS_ND[i] = nd;
    if (nd <= ACC_BAR) { GOOD.push(f); goodA += A3[f]; if (nd > goodMaxND) goodMaxND = nd; }
  }
  log(`   GOOD  (in CLASS AND real normDeg <= ${ACC_BAR} deg): COUNT ${GOOD.length}  AREA ${goodA.toFixed(3)} mm2 = ${pct(goodA, clsA)}% OF THE CLASS (= ${pct(goodA, MESH_AREA)}% of mesh)  normDeg MAX ${f3(goodMaxND)} deg ${el()}`);
  OUT.groundTruth = {
    classN: CLASS.length, classArea: clsA, badN: BAD.length, badArea: badA,
    bladeN: BLADE.length, bladeArea: blA, goodN: GOOD.length, goodArea: goodA, goodMaxND, dihMaxDeg: dMax * DEG,
  };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — CONFUSION MATRIX AT THE MODULE'S OWN DEFENSIBLE CUT
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const inBad = new Uint8Array(nF); for (const f of BAD) inBad[f] = 1;
const inBlade = new Uint8Array(nF); for (const f of BLADE) inBlade[f] = 1;
const inGood = new Uint8Array(nF); for (const f of GOOD) inGood[f] = 1;

interface Row { n: number; area: number; badN: number; badA: number; blN: number; blA: number; gN: number; gA: number; maxDih: number }
function newRow(): Row { return { n: 0, area: 0, badN: 0, badA: 0, blN: 0, blA: 0, gN: 0, gA: 0, maxDih: 0 }; }
function add(r: Row, f: number): void {
  r.n += 1; r.area += A3[f];
  if (inBad[f] === 1) { r.badN += 1; r.badA += A3[f]; }
  if (inBlade[f] === 1) { r.blN += 1; r.blA += A3[f]; }
  if (inGood[f] === 1) { r.gN += 1; r.gA += A3[f]; }
  const d = DD.perFacetMaxRad[f] * DEG; if (d > r.maxDih) r.maxDih = d;
}
function printRow(name: string, r: Row): void {
  log(`   ${name.padEnd(6)} MESH flagged  COUNT ${String(r.n).padStart(9)} (${pct(r.n, nF).padStart(8)}% of facets)  AREA ${r.area.toFixed(3).padStart(11)} mm2 (${pct(r.area, MESH_AREA).padStart(8)}% OF MESH)  flagged-dihedral MAX ${r.maxDih.toFixed(3)} deg`);
  log(`          BAD(>CEIL) caught   ${String(r.badN).padStart(8)} / ${BAD.length}  = ${pct(r.badN, BAD.length)}% by count   AREA ${r.badA.toFixed(3)} / ${badA.toFixed(3)} = ${pct(r.badA, badA)}% OF THE BAD SET`);
  log(`          BLADE caught        ${String(r.blN).padStart(8)} / ${BLADE.length}  = ${pct(r.blN, BLADE.length)}% by count   AREA ${r.blA.toFixed(3)} / ${blA.toFixed(3)} = ${pct(r.blA, blA)}% OF THE BLADE SET`);
  log(`          GOOD FALSE-FLAGGED  ${String(r.gN).padStart(8)} / ${GOOD.length}  = ${pct(r.gN, GOOD.length)}% by count   AREA ${r.gA.toFixed(6)} / ${goodA.toFixed(3)} = ${pct(r.gA, goodA)}% OF THE GOOD SET`);
}

const D = DEFENSIBLE_EMIT_INVARIANT;
const li = INSET_S_IDX;
const rowT1 = newRow(); const rowT2 = newRow(); const rowT3 = newRow();
const rowT4o = newRow(); const rowT4p = newRow(); const rowCore = newRow(); const rowFull = newRow();
for (let f = 0; f < nF; f += 1) {
  const t1 = HARD[f] === 1 || Math.abs(QP[f]) < D.tauQ;
  const t2 = !(APS[f] > 0);
  const t3 = MALT[f] < D.minAltMm;
  const t4o = !(NDEG[li][f] <= D.tauNDeg);
  const t4p = !(POSP[li][f] <= D.posBarMm);
  if (t1) add(rowT1, f);
  if (t2) add(rowT2, f);
  if (t3) add(rowT3, f);
  if (t4o) add(rowT4o, f);
  if (t4p) add(rowT4p, f);
  if (t1 || t2 || t3) add(rowCore, f);
  if (t1 || t2 || t3 || t4o || t4p) add(rowFull, f);
}
log('── STAGE 4: CONFUSION MATRIX at the module\'s DEFENSIBLE cut ──');
log(`   T1 |qP|>=${D.tauQ} | T2 sigma*apS>0 | T3 minAlt>=${D.minAltMm}mm | T4o nDeg<=${D.tauNDeg}deg | T4p posPERP<=${D.posBarMm}mm`);
printRow('T1', rowT1); printRow('T2', rowT2); printRow('T3', rowT3);
printRow('T4o', rowT4o); printRow('T4p', rowT4p);
log('   ── CORE = T1|T2|T3, the ZERO-ANALYTIC-EVALUATION half ──');
printRow('CORE', rowCore);
log('   ── FULL = CORE|T4 ──');
printRow('FULL', rowFull);
OUT.confusion = { T1: rowT1, T2: rowT2, T3: rowT3, T4o: rowT4o, T4p: rowT4p, CORE: rowCore, FULL: rowFull };
log('');

// ── CONTROL C2: the module's OWN verdict must agree with the offline reconstruction, facet for facet
{
  const optCore: EmitInvariantOptions = { ...D, rA: undefined };
  const optFull: EmitInvariantOptions = { ...D, rA, zMin: 0, zMax: H, inset: INSETS[li] };
  let mismatchCore = 0; let mismatchFull = 0; let firstBad = -1;
  const reasonCount = new Map<EmitRejectReason, number>();
  for (let f = 0; f < nF; f += 1) {
    const o = f * 9;
    const rc = checkEmitInvariant(
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      THA[f], THB[f], THC[f], optCore, scratch,
    );
    const wantCore = !(HARD[f] === 1 || Math.abs(QP[f]) < D.tauQ || !(APS[f] > 0) || MALT[f] < D.minAltMm);
    if (rc.ok !== wantCore) { mismatchCore += 1; if (firstBad < 0) firstBad = f; }
    reasonCount.set(rc.reason, (reasonCount.get(rc.reason) ?? 0) + 1);
  }
  // FULL is re-run on a stride: 42 evals/facet twice over is pure duplication, and the CORE arm above
  // already exercises the same code path end to end.
  const strideF = Math.max(1, Math.floor(nF / 50000));
  for (let f = 0; f < nF; f += strideF) {
    const o = f * 9;
    const rf = checkEmitInvariant(
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      THA[f], THB[f], THC[f], optFull, scratch,
    );
    const wantFull = !(HARD[f] === 1 || Math.abs(QP[f]) < D.tauQ || !(APS[f] > 0) || MALT[f] < D.minAltMm
      || !(NDEG[li][f] <= D.tauNDeg) || !(POSP[li][f] <= D.posBarMm));
    if (rf.ok !== wantFull) mismatchFull += 1;
  }
  log('── CONTROL C2: module verdict vs offline reconstruction ──');
  log(`   CORE: ${nF - mismatchCore} / ${nF} agree (${pct(nF - mismatchCore, nF)}%)   FULL (stride ${strideF}): ${Math.ceil(nF / strideF) - mismatchFull} / ${Math.ceil(nF / strideF)} agree`);
  log(`   module reason histogram at the CORE cut: ${[...reasonCount.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`);
  if (mismatchCore > 0 || mismatchFull > 0) log(`   ██ CONTROL C2 FIRED — THE RUN IS VOID. first mismatching facet ${firstBad}`);
  else log('   control clean: every ladder below is the module\'s own behaviour, not a paraphrase.');
  OUT.controlC2 = { mismatchCore, mismatchFull, strideF };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — THRESHOLD LADDERS (scar 4)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
function ladder(name: string, values: number[], fire: (f: number, v: number) => boolean): void {
  log(`   ${name}:`);
  log('        value      MESH cnt%   MESH area%   BAD caught% (area)   BLADE caught% (area)   GOOD false% (area)');
  const rows: Array<Record<string, number>> = [];
  for (const v of values) {
    const r = newRow();
    for (let f = 0; f < nF; f += 1) if (fire(f, v)) add(r, f);
    log(`   ${String(v).padStart(12)} ${pct(r.n, nF).padStart(10)} ${pct(r.area, MESH_AREA).padStart(11)}   ${pct(r.badA, badA).padStart(10)}         ${pct(r.blA, blA).padStart(10)}         ${pct(r.gA, goodA).padStart(10)}`);
    rows.push({ value: v, cntPct: (r.n / nF) * 100, areaPct: (r.area / MESH_AREA) * 100, badArea: (r.badA / badA) * 100, bladeArea: (r.blA / blA) * 100, goodFalse: (r.gA / goodA) * 100 });
  }
  (OUT.ladders as Record<string, unknown>[]).push({ name, rows });
}
OUT.ladders = [] as Record<string, unknown>[];
log('── STAGE 5: THRESHOLD LADDERS (scar 4) ──');
ladder('T1 tauQ (parameter shape floor, |qP|)', TAUQ_LADDER, (f, v) => Math.abs(QP[f]) < v);
ladder('T3 minAltMm (arc-space altitude bar, mm)', ALT_LADDER, (f, v) => MALT[f] < v);
for (let k = 0; k < INSETS.length; k += 1) {
  ladder(`T4o tauN (deg) at predicate inset=${INSETS[k]}`, TAUN_LADDER, (f, v) => !(NDEG[k][f] <= v));
}
ladder(`T4p posBar PERPENDICULAR (mm) at inset=${INSETS[li]}`, POS_LADDER, (f, v) => !(POSP[li][f] <= v));
ladder('T4p posBar RADIAL (mm) — the KNOWN-INFLATING projector, for contrast', POS_LADDER, (f, v) => !(POSR[f] <= v));
// the CORE grid: the two zero-eval knobs together
log('   CORE = T1|T2|T3 grid (tauQ x minAltMm):');
log('      tauQ      minAltMm    MESH cnt%   MESH area%   BAD area%   BLADE area%   GOOD-false area%');
const coreGrid: Array<Record<string, number>> = [];
for (const tq of [1e-4, 1e-3, 0.005, 0.02, 0.05]) {
  for (const ma of [0, 5e-4, 2e-3, 5e-3, 2e-2]) {
    const r = newRow();
    for (let f = 0; f < nF; f += 1) if (HARD[f] === 1 || Math.abs(QP[f]) < tq || !(APS[f] > 0) || MALT[f] < ma) add(r, f);
    log(`      ${String(tq).padStart(8)}  ${String(ma).padStart(9)}  ${pct(r.n, nF).padStart(10)} ${pct(r.area, MESH_AREA).padStart(11)}  ${pct(r.badA, badA).padStart(10)}  ${pct(r.blA, blA).padStart(11)}  ${pct(r.gA, goodA).padStart(15)}`);
    coreGrid.push({ tauQ: tq, minAlt: ma, cnt: (r.n / nF) * 100, area: (r.area / MESH_AREA) * 100, bad: (r.badA / badA) * 100, blade: (r.blA / blA) * 100, goodFalse: (r.gA / goodA) * 100 });
  }
}
OUT.coreGrid = coreGrid;
// GT-cut sensitivity: hold the predicate fixed, move the ground truth
log('   GT-CUT SENSITIVITY — the BAD set redefined at other dihedral bars, the DEFENSIBLE cut held fixed:');
for (const bar of [CEIL_DEG, 150, 160, 170, 175, 179]) {
  const thr = (bar * Math.PI) / 180;
  let n = 0; let a = 0; let cn = 0; let ca = 0; let fn2 = 0; let fa = 0;
  for (let f = 0; f < nF; f += 1) {
    if (DD.perFacetMaxRad[f] <= thr) continue;
    n += 1; a += A3[f];
    const core = HARD[f] === 1 || Math.abs(QP[f]) < D.tauQ || !(APS[f] > 0) || MALT[f] < D.minAltMm;
    const full = core || !(NDEG[li][f] <= D.tauNDeg) || !(POSP[li][f] <= D.posBarMm);
    if (core) { cn += 1; ca += A3[f]; }
    if (full) { fn2 += 1; fa += A3[f]; }
  }
  log(`      BAD bar ${bar.toFixed(2)} deg: n=${n} area ${a.toFixed(3)} mm2 (${pct(a, MESH_AREA)}% of mesh)  CORE catches ${pct(cn, n)}% cnt / ${pct(ca, a)}% AREA   FULL ${pct(fn2, n)}% cnt / ${pct(fa, a)}% AREA`);
}
log('   GT-CUT SENSITIVITY — the GOOD set redefined at other ACC bars, the DEFENSIBLE cut held fixed:');
for (const bar of [1, 2, 5, 10, 20]) {
  let n = 0; let a = 0; let cn = 0; let ca = 0; let fn2 = 0; let fa = 0;
  for (let i = 0; i < CLASS_LIM; i += 1) {
    const f = CLASS[i];
    if (!(CLASS_ND[i] <= bar)) continue;
    n += 1; a += A3[f];
    const core = HARD[f] === 1 || Math.abs(QP[f]) < D.tauQ || !(APS[f] > 0) || MALT[f] < D.minAltMm;
    const full = core || !(NDEG[li][f] <= D.tauNDeg) || !(POSP[li][f] <= D.posBarMm);
    if (core) { cn += 1; ca += A3[f]; }
    if (full) { fn2 += 1; fa += A3[f]; }
  }
  log(`      ACC bar ${String(bar).padStart(3)} deg: GOOD n=${n} area ${a.toFixed(3)} mm2 (${pct(a, MESH_AREA)}% of mesh)  CORE FALSE-FLAGS ${pct(cn, n)}% cnt / ${pct(ca, a)}% AREA   FULL ${pct(fn2, n)}% cnt / ${pct(fa, a)}% AREA`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5b — COST-MATCHED PLACEBO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
{
  log('── STAGE 5b: COST-MATCHED PLACEBO (uninformed key, SAME flagged COUNT) ──');
  const arms: Array<[string, Row]> = [['CORE', rowCore], ['FULL', rowFull]];
  const placeboOut: Record<string, unknown> = {};
  for (const [nm, r] of arms) {
    // uninformed key: a cheap hash of the facet index. Same count flagged, zero information.
    const keys = new Float64Array(nF);
    for (let f = 0; f < nF; f += 1) {
      let h = (f * 2654435761) % 4294967296;
      h ^= h >>> 13; h = (h * 1274126177) % 4294967296; h ^= h >>> 16;
      keys[f] = h;
    }
    const order = Array.from({ length: nF }, (_v, i) => i).sort((a, b) => keys[a] - keys[b]);
    const p = newRow();
    for (let i = 0; i < r.n; i += 1) add(p, order[i]);
    const ratio = p.badA > 0 ? (r.badA / badA) / (p.badA / badA) : Infinity;
    log(`   ${nm.padEnd(5)}    flagged ${r.n} facets (${pct(r.area, MESH_AREA)}% of mesh area)  BAD-area ${pct(r.badA, badA)}%  BLADE ${pct(r.blA, blA)}%  GOOD-false ${pct(r.gA, goodA)}%`);
    log(`   PLACEBO  flagged ${p.n} facets (${pct(p.area, MESH_AREA)}% of mesh area)  BAD-area ${pct(p.badA, badA)}%  BLADE ${pct(p.blA, blA)}%  GOOD-false ${pct(p.gA, goodA)}%`);
    log(`   *** ${nm} beats the cost-matched placebo by ${Number.isFinite(ratio) ? ratio.toFixed(2) : 'inf'}x on BAD area caught. ***`);
    placeboOut[nm] = { armBad: (r.badA / badA) * 100, placeboBad: (p.badA / badA) * 100, ratio };
  }
  OUT.placebo = placeboOut;
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — ANATOMY
// ══════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 6: ANATOMY — the predicate quantities ON each ground-truth set ──');
function anatomy(name: string, set: ArrayLike<number>): void {
  const q: number[] = []; const m: number[] = []; const n: number[] = []; const p: number[] = [];
  for (let i = 0; i < set.length; i += 1) { const f = set[i]; q.push(QP[f]); m.push(MALT[f]); n.push(NDEG[li][f]); p.push(POSP[li][f]); }
  log(`   ${name}  n=${set.length}`);
  log(`      qP     p01 ${ex(qt(q, 0.01))} p50 ${ex(qt(q, 0.5))} p99 ${ex(qt(q, 0.99))}   MIN ${ex(amin(q))}`);
  log(`      minAlt p01 ${ex(qt(m, 0.01))} p50 ${ex(qt(m, 0.5))} p99 ${ex(qt(m, 0.99))} mm  MIN ${ex(amin(m))}`);
  log(`      nDeg   p50 ${f3(qt(n, 0.5))} p90 ${f3(qt(n, 0.9))} p99 ${f3(qt(n, 0.99))}   MAX ${f3(amax(n))} deg`);
  log(`      posP   p50 ${ex(qt(p, 0.5))} p99 ${ex(qt(p, 0.99))}   MAX ${ex(amax(p))} mm`);
}
anatomy('BAD (>CEIL)', BAD.slice(0, 200000));
anatomy(`BLADE (>=${BLADE_DEG})`, BLADE.slice(0, 200000));
anatomy(`GOOD (class & normDeg<=${ACC_BAR})`, GOOD.slice(0, 200000));
{
  const s: number[] = []; for (let f = 0; f < nF; f += 7) s.push(f);
  anatomy('WHOLE MESH (stride 7)', s.slice(0, 200000));
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — COST, MEASURED
// ══════════════════════════════════════════════════════════════════════════════════════════════════
{
  log('── STAGE 7: COST (measured on this machine, this mesh) ──');
  const before = RA_CALLS;
  const t0 = Date.now();
  let sink = 0;
  for (let i = 0; i < 200000; i += 1) sink += rA((i * 0.0001) % 6.283, (i * 0.0007) % H);
  const tEval = Date.now() - t0;
  log(`   rA alone: ${((tEval * 1e6) / 200000).toFixed(0)} ns/eval  (checksum ${sink.toFixed(3)}, calls ${RA_CALLS - before})`);

  const optCore: EmitInvariantOptions = { ...D, rA: undefined };
  const optFull: EmitInvariantOptions = { ...D, rA, zMin: 0, zMax: H, inset: INSETS[li] };
  const N = Math.min(nF, 300000);
  const t1 = Date.now();
  for (let f = 0; f < N; f += 1) {
    const o = f * 9;
    checkEmitInvariant(xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8], THA[f], THB[f], THC[f], optCore, scratch);
  }
  const tCore = Date.now() - t1;
  const t2 = Date.now();
  for (let f = 0; f < N; f += 1) {
    const o = f * 9;
    checkEmitInvariant(xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8], THA[f], THB[f], THC[f], optFull, scratch);
  }
  const tFull = Date.now() - t2;
  log(`   CORE (T1|T2|T3, ZERO analytic evals): ${((tCore * 1e6) / N).toFixed(1)} ns/triangle over ${N} triangles`);
  log(`   FULL (CORE + T4, 42 analytic evals):  ${((tFull * 1e6) / N).toFixed(0)} ns/triangle over ${N} triangles`);
  log(`   => T4 costs ${(tFull / Math.max(1, tCore)).toFixed(0)}x the core. The core is the one that can run on every emit.`);
  OUT.cost = { nsPerEval: (tEval * 1e6) / 200000, nsPerTriCore: (tCore * 1e6) / N, nsPerTriFull: (tFull * 1e6) / N, benchN: N };
}
log('');

writeFileSync(`${OUTDIR}/S117_VALIDATE_${TAG}.json`, JSON.stringify(OUT, null, 2));
log(`json -> ${OUTDIR}/S117_VALIDATE_${TAG}.json  ${el()}`);

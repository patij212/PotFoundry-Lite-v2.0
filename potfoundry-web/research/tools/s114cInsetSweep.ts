// s114cInsetSweep.ts — THE REPAIR OF PROBE B. MY OWN CONTROL FIRED AND THIS IS THE DIAGNOSIS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT FAILED, IN MY OWN NUMBERS. s114cInverse.ts Probe B measured the ANALYTIC JUMP inside each facet's
// footprint, to find creases that carry NO visible mesh edge. Its SMOOTH NEGATIVE CONTROL — facets whose
// per-facet max dihedral is under 2 deg, i.e. the visibly-fine mesh — came back:
//
//     GothicArches       control in-footprint JUMP  p50 0.0748   MAX 166.379 deg   (10/400 over 45 deg)
//     LowPolyFacet       control MAX 29.918 deg  ==  target MAX 29.918 deg, IDENTICAL to 3 decimals
//
// A control that reads the same value as the target measures nothing. And PI-2, the pre-registered FLOOR
// ("RippleInterference in-footprint jump MAX < 5 deg"), read 27.793. By my own pre-registration PI-2's
// failure VOIDS PI-1, and PI-1 was falsified anyway (LowPolyFacet p99 29.918, under its own 30 deg line).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DIAGNOSIS — TWO CANDIDATE MECHANISMS, BOTH TESTABLE, NEITHER ASSUMED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// (M1) THE inset DEFAULT. Probe B sampled the FULL footprint (inset 0). `orientRuler.ts` documents this
//      exact failure at the `inset` option: a kink-aware sampler evaluated EXACTLY ON a C0 crease returns
//      BOTH one-sided normals, and a CONFORMED mesh puts its vertices/edges on the crease ON PURPOSE. So
//      a facet lying perfectly flat in ONE flank, with its edge on the crease, reads the FULL jump from
//      its own boundary — "the conforming mesher's best work scored as its worst". Gothic is a conformed
//      mesh (S112: 56.7% of target area has a vertex on the locus at the f32 floor). If M1 is the cause,
//      INSETTING removes the control's firing while leaving genuinely STRADDLING facets firing.
//      *** THE CAMPAIGN BRIEF SAYS THIS IN CAPITALS: AN OPTION DEFAULT IS A MEASUREMENT CHOICE. I took
//      the default. This file is the sweep I should have run the first time. ***
//
// (M2) THE z-CLAMP IN MY OWN rA WRAPPER. Every tool in this lineage wraps the radius function as
//          rA = (th, z) => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z)
//      That CLAMP makes dr/dz discontinuous at z=0 and z=H, so the finite-difference normal sampler sees
//      an ARTIFICIAL crease along the base and the rim — on every style, entirely as an artefact of the
//      wrapper. RippleInterference is analytically smooth (MAX mesh dihedral 8.071 deg) yet Probe B found
//      a 27.793 deg jump somewhere; a rim/base artefact would explain it exactly.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, BEFORE THIS FILE'S FIRST RUN. The two mechanisms make DIFFERENT predictions, so the
// run can distinguish them rather than confirm whichever I name first.
//   PS-1 (M1). On Gothic the control's over-45 rate falls to <= 1% by inset 0.05, while the TARGET class
//        (facets whose own footprint carries a jump at inset 0) retains >= 25% of its over-45 count.
//        A crease on the BOUNDARY is removed by insetting; a crease through the INTERIOR is not.
//   PS-2 (M2). Excluding facets within Z_EDGE mm of z=0 or z=H removes >= 50% of RippleInterference's
//        over-5-deg jumps. If it removes < 10%, M2 is refuted for that style and the tail is real.
//   PS-3 (FLOOR, and it guards everything else). After BOTH corrections, RippleInterference's control
//        AND target in-footprint jump must both read MAX < 5 deg. *** If they do not, the probe still
//        manufactures creases and NO hidden-crease number from this lineage is admissible. ***
//
// COUNT + AREA + MAX on every population; every inset printed, never one.
//
// Usage: bash research/tools/run-s114c-insetsweep.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DEG = 180 / Math.PI;

const OUTDIR = process.env.PF_S114S_OUTDIR ?? 'research/exchange/_strataConformBisect/s114c';
const EXCH = process.env.PF_S114S_EXCH ?? 'research/exchange/_strataConformBisect';
const K_LAT = Math.round(envF('PF_S114S_KLAT', 12));
const NCROSS = Math.round(envF('PF_S114S_NCROSS', 8));
const CURTAIN_RATIO = envF('PF_S114S_CURTAIN', 8);
const NFACET = Math.round(envF('PF_S114S_NFACET', 1200));
const CTLN = Math.round(envF('PF_S114S_CTLN', 400));
const H_FD = envF('PF_S114S_HFD', 2e-4);
const Z_EDGE = envF('PF_S114S_ZEDGE', 0.5);          // mm from z=0 / z=H excluded to test M2
const INSETS = (process.env.PF_S114S_INSETS ?? '0,0.02,0.05,0.1').split(',').map(Number);
const DIMS: StyleDims = { H: envF('PF_S114S_H', 120), Rb: envF('PF_S114S_RB', 40), Rt: envF('PF_S114S_RT', 50), expn: 1 };
const H = DIMS.H;
const TAG = process.env.PF_S114S_TAG ?? 'C';

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
function goldenSample(n: number, want: number): number[] {
  if (want >= n) { const a: number[] = []; for (let i = 0; i < n; i += 1) a.push(i); return a; }
  const GOLD = 0.6180339887498949;
  const seen = new Set<number>(); const out: number[] = [];
  let i = 0;
  while (out.length < want && i < want * 40) {
    const idx = Math.floor(((i * GOLD) % 1) * n);
    if (!seen.has(idx)) { seen.add(idx); out.push(idx); }
    i += 1;
  }
  return out;
}
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

function measure(style: string, stl: string): Record<string, unknown> {
  const row: Record<string, unknown> = { style, stl };
  log('');
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style} ═════`);
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const ns: NormalSampler = fdNormals(rA, H, H_FD, H_FD);
  const scratch = new Float64Array(12);

  const M = readMeshFloat64(stl, false);
  const xyz = M.xyz; const nTri = M.nTri;
  let worst = 0;
  { const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    } }
  log(`  facets ${nTri}   PRECOND ${(worst * 1000).toFixed(4)} um`);
  row.nTri = nTri; row.precondUm = worst * 1000;
  if (worst * 1000 > 50) { log('  *** REFUSED (PRECOND) ***'); row.refused = true; return row; }
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));

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
    const ux = xyz[f * 9 + 3] - ax; const uy = xyz[f * 9 + 4] - ay; const uz = xyz[f * 9 + 5] - az;
    const wx = xyz[f * 9 + 6] - ax; const wy = xyz[f * 9 + 7] - ay; const wz = xyz[f * 9 + 8] - az;
    const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const [ath, bth, cth] = th3(f);
    const rRef = rRefOf(f);
    const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (xyz[f * 9 + 8] - az) - (xyz[f * 9 + 5] - az) * (rRef * (cth - ath)));
    return aP > 1e-15 ? a3 / aP : Infinity;
  }
  function angU(a: Float64Array, ai: number, b: Float64Array, bi: number): number {
    let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    return Math.acos(dp);
  }
  /** in-footprint analytic JUMP at an EXPLICIT inset (no default is taken anywhere in this file) */
  function jumpOf(f: number, inset: number): number {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    const rRef = rRefOf(f);
    const k = K_LAT; const cap = ((k + 1) * (k + 2)) / 2;
    const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
    const sh = 1 - inset; const sc = inset / 3;
    let m = 0;
    for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = ns(th, z, scratch);
      for (let qi = 0; qi < nc; qi += 1) {
        n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
        pth[m] = rRef * th; pz[m] = z; m += 1;
      }
    }
    if (m < 2) return 0;
    // 2-means
    const lab = new Int8Array(m); const c = new Float64Array(6);
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
      let ax = 0; let ay = 0; let az2 = 0; let bx = 0; let by = 0; let bz2 = 0; let na = 0; let nb = 0;
      for (let i = 0; i < m; i += 1) {
        const da = angU(n, i * 3, c, 0); const db = angU(n, i * 3, c, 3);
        if (da <= db) { lab[i] = 0; ax += n[i * 3]; ay += n[i * 3 + 1]; az2 += n[i * 3 + 2]; na += 1; }
        else { lab[i] = 1; bx += n[i * 3]; by += n[i * 3 + 1]; bz2 += n[i * 3 + 2]; nb += 1; }
      }
      if (na > 0) { const l = Math.hypot(ax, ay, az2) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az2 / l; }
      if (nb > 0) { const l = Math.hypot(bx, by, bz2) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz2 / l; }
      if (na === 0 || nb === 0) break;
    }
    const A: number[] = []; const B: number[] = [];
    for (let i = 0; i < m; i += 1) (lab[i] === 0 ? A : B).push(i);
    if (A.length === 0 || B.length === 0) return 0;
    const cand: Array<{ dd: number; ang: number }> = [];
    for (const a of A) for (const b of B) cand.push({ dd: Math.hypot(pth[a] - pth[b], pz[a] - pz[b]), ang: angU(n, a * 3, n, b * 3) });
    cand.sort((x, y) => x.dd - y.dd);
    let jump = 0;
    const take = Math.min(NCROSS, cand.length);
    for (let i = 0; i < take; i += 1) if (cand[i].ang > jump) jump = cand[i].ang;
    return jump * DEG;
  }
  const nearZEdge = (f: number): boolean => {
    for (let k = 0; k < 3; k += 1) { const z = xyz[f * 9 + k * 3 + 2]; if (z < Z_EDGE || z > H - Z_EDGE) return true; }
    return false;
  };

  // populations
  const all = goldenSample(nTri, Math.min(NFACET, nTri));
  const smooth: number[] = [];
  { const loThr = (2 * Math.PI) / 180;
    for (const f of goldenSample(nTri, Math.min(nTri, CTLN * 100))) {
      if (smooth.length >= CTLN) break;
      if (d.perFacetMaxRad[f] < loThr && graphRatio(f) <= CURTAIN_RATIO) smooth.push(f);
    } }
  log(`  populations: ALL n=${all.length}   SMOOTH CONTROL n=${smooth.length}   (z-edge band ${Z_EDGE} mm)`);

  const out: Record<string, unknown> = {};
  log('');
  log('  ── INSET SWEEP (M1) x Z-EDGE EXCLUSION (M2). Every cell printed; no default taken anywhere. ──');
  log('     inset |            ALL FACETS  p50 / p99 / MAX / n>=45           |         SMOOTH CONTROL  p50 / p99 / MAX / n>=45');
  for (const ins of INSETS) {
    const ja = all.map((f) => jumpOf(f, ins));
    const jc = smooth.map((f) => jumpOf(f, ins));
    const ca = ja.filter((x) => x >= 45).length; const cc = jc.filter((x) => x >= 45).length;
    log(`     ${ins.toFixed(3)} | ${q(ja, 0.5).toFixed(4)} / ${q(ja, 0.99).toFixed(3)} / ${mx(ja).toFixed(3)} / ${ca}`
      + `   |   ${q(jc, 0.5).toFixed(4)} / ${q(jc, 0.99).toFixed(3)} / ${mx(jc).toFixed(3)} / ${cc}`);
    out[`inset${ins}`] = {
      allP50: q(ja, 0.5), allP99: q(ja, 0.99), allMax: mx(ja), allOver45: ca, allN: ja.length,
      ctlP50: q(jc, 0.5), ctlP99: q(jc, 0.99), ctlMax: mx(jc), ctlOver45: cc, ctlN: jc.length,
    };
  }
  // M2: z-edge exclusion at the honest inset 0.05
  const insM2 = 0.05;
  const interior = all.filter((f) => !nearZEdge(f));
  const edgeF = all.filter((f) => nearZEdge(f));
  const jInt = interior.map((f) => jumpOf(f, insM2));
  const jEdg = edgeF.map((f) => jumpOf(f, insM2));
  const jAll = all.map((f) => jumpOf(f, insM2));
  const o5 = (v: number[]): number => v.filter((x) => x >= 5).length;
  log('');
  log(`  ── M2 TEST at inset ${insM2}: does the z-CLAMP in the rA wrapper manufacture a rim/base crease? ──`);
  log(`     ALL           n=${jAll.length}  jump p50 ${q(jAll, 0.5).toFixed(4)}  MAX ${mx(jAll).toFixed(3)}  over-5-deg ${o5(jAll)}`);
  log(`     z-INTERIOR    n=${jInt.length}  jump p50 ${q(jInt, 0.5).toFixed(4)}  MAX ${mx(jInt).toFixed(3)}  over-5-deg ${o5(jInt)}`);
  log(`     within ${Z_EDGE} mm of z=0/H  n=${jEdg.length}  jump p50 ${q(jEdg, 0.5).toFixed(4)}  MAX ${mx(jEdg).toFixed(3)}  over-5-deg ${o5(jEdg)}`);
  const removed = o5(jAll) > 0 ? ((o5(jAll) - o5(jInt)) / o5(jAll)) * 100 : NaN;
  log(`     >>> excluding the z-edge band removes ${Number.isFinite(removed) ? removed.toFixed(2) : 'n/a'}% of the over-5-deg jumps  (PS-2: >=50% => M2 confirmed, <10% => M2 refuted)`);
  Object.assign(out, {
    m2Inset: insM2, m2AllOver5: o5(jAll), m2IntOver5: o5(jInt), m2EdgeOver5: o5(jEdg),
    m2AllMax: mx(jAll), m2IntMax: mx(jInt), m2EdgeMax: mx(jEdg), m2RemovedPct: removed,
    m2IntN: jInt.length, m2EdgeN: jEdg.length,
  });
  // the honest combined figure: inset 0.05 AND z-interior, with an AREA share
  let aTot = 0; let aOver = [0, 0, 0]; const nOv = [0, 0, 0]; const BARS = [20, 30, 45];
  for (let i = 0; i < interior.length; i += 1) {
    aTot += d.areaMm2[interior[i]];
    for (let b = 0; b < BARS.length; b += 1) if (jInt[i] >= BARS[b]) { aOver[b] += d.areaMm2[interior[i]]; nOv[b] += 1; }
  }
  log('');
  log('  ── THE CORRECTED HIDDEN-CREASE FIGURE (inset 0.05, z-interior only) ──');
  for (let b = 0; b < BARS.length; b += 1) {
    log(`     footprints carrying a >= ${BARS[b]} deg analytic JUMP:  COUNT ${nOv[b]}/${interior.length} (${((nOv[b] / Math.max(1, interior.length)) * 100).toFixed(3)}%)   AREA-share ${((aOver[b] / Math.max(1e-12, aTot)) * 100).toFixed(4)}%`);
  }
  Object.assign(out, { corrBars: BARS, corrCount: nOv, corrAreaPct: aOver.map((a) => (a / Math.max(1e-12, aTot)) * 100), corrN: interior.length });
  row.sweep = out;
  log(`  ${el()}`);
  return row;
}

mkdirSync(OUTDIR, { recursive: true });
const DEFAULT_LIST = [
  'RippleInterference:rippleinterference_ring_D--.stl',
  'GothicArches:gothicarches_ring_DS-HT_S39CTL.stl',
  'LowPolyFacet:lowpolyfacet_ring_D--.stl',
  'HexagonalHive:hexagonalhive_ring_D--.stl',
  'GyroidManifold:gyroidmanifold_ring_D--.stl',
  'HarmonicRipple:harmonicripple_ring_D--C.stl',
].join(',');
const LIST = (process.env.PF_S114S_LIST ?? DEFAULT_LIST).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

log('===== S114-C INSET SWEEP — REPAIRING PROBE B AFTER ITS OWN CONTROL FIRED =====');
log(`  insets ${INSETS.join(', ')}  |  K=${K_LAT}  |  z-edge band ${Z_EDGE} mm  |  n=${NFACET} all / ${CTLN} control`);
log('  PS-1 (M1 inset): Gothic control over-45 rate <= 1% by inset 0.05 while the target keeps >= 25%.');
log('  PS-2 (M2 z-clamp): z-edge exclusion removes >= 50% of RippleInterference over-5-deg jumps.');
log('  PS-3 (FLOOR): after both, RippleInterference control AND target MAX < 5 deg, or NO hidden-crease');
log('       number from this lineage is admissible.');

const rows: Array<Record<string, unknown>> = [];
for (const item of LIST) {
  const [s, f] = item.split(':');
  try { rows.push(measure(s, `${EXCH}/${f}`)); }
  catch (err) { log(`  *** ${s} THREW: ${(err as Error).message} ***`); rows.push({ style: s, error: (err as Error).message }); }
}
writeFileSync(`${OUTDIR}/S114_INSETSWEEP_${TAG}.json`, `${JSON.stringify({ tool: 's114cInsetSweep.ts', generatedAt: new Date().toISOString(), insets: INSETS, K_LAT, Z_EDGE, dims: DIMS, rows }, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_INSETSWEEP_${TAG}.json`);
log(`done ${el()}`);

// s120Blocked.ts — S120 TASK C, STAGE 1. CENSUS THE BLOCKED CLASS on a DRIVER-PRODUCED mesh.
//
// A facet is BLOCKED when it has REFINEMENT DEMAND and NO LEGAL SPLIT: every edge >= FLOOR_MM, at every
// rung of the nudge ladder (plus the SNAP placement where SNAP is on), is refused by `bisectAt`.
// That is the exact set the S118 ADMIT gate strands, the set S119's reordering provably cannot reach
// (reordering cannot change whether the set of legal candidates is EMPTY), and the set Task C's five
// operators are candidates for.
//
// OUTPUTS  COUNT + AREA-SHARE + MAX, per facet. Never a bare count, never a bare max.
// Writes a JSON dump of the blocked facets (and their 1-rings) for the operator stage.
//
// env: PF_S120_STL PF_S120_STYLE PF_S120_TAG PF_S120_ACCEPT_UM PF_S120_SNAP PF_S120_OUT PF_S120_EDGEN
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  rebuildFromStl, measureSurfaceResidual, styleRadius, driverDefaults, buildWeldGrid,
  facetLegality, probeSplitEdge, makeDemand, eLen, eVerts, triArea, arOf, eKeyOf, edgeRadialMax,
  edgeCliffJump,
  type Mesh, type DriverConst, type WeldGrid,
} from './s120DriverLib';
import { distPerpFrom } from '../bridge/_facetTruthLib';
import { dThRaw, type SweepPredConst } from '../bridge/_sweepPredicate';

/* eslint-disable no-console */
const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STL = envS('PF_S120_STL', '');
const STYLE = envS('PF_S120_STYLE', 'CelticTriquetra');
const TAG = envS('PF_S120_TAG', 'RUN');
const ACCEPT = envF('PF_S120_ACCEPT_UM', 7) / 1000;
const SNAP = envS('PF_S120_SNAP', '0') === '1';
const OUT = envS('PF_S120_OUT', '');
const EDGEN = Math.round(envF('PF_S120_EDGEN', 64));
if (STL.length === 0) { log('*** PF_S120_STL required ***'); process.exit(2); }

const T0 = Date.now();
log('═'.repeat(104));
log(`S120 TASK C · STAGE 1 — THE BLOCKED CLASS   tag=${TAG}  style=${STYLE}  acceptTol=${(ACCEPT * 1000).toFixed(3)} µm  SNAP=${SNAP ? 1 : 0}`);
log('═'.repeat(104));
log(`mesh ${STL}`);

const { rA, paramsJson } = styleRadius(STYLE);
log(`params ${paramsJson}`);
const C: DriverConst = driverDefaults(ACCEPT, SNAP);
const PRED: SweepPredConst = { kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62, confMm: 0.6 / 1000, snap: true };

// ─────────────────────────────── 1. LOAD + PROVENANCE ───────────────────────────────
const M: Mesh = rebuildFromStl(STL);
log('');
log('── 1. PROVENANCE (this must match the driver log line for the arm) ──');
log(`   facets            ${M.nT.toLocaleString()}`);
log(`   welded vertices   ${M.nV.toLocaleString()}   (exact f32-triple weld)`);
log(`   3-D area          ${M.area3.toFixed(3)} mm²`);
let bdry = 0; let nonManifold = 0; let interior = 0;
for (const [, l] of M.edge) { if (l.length === 1) bdry += 1; else if (l.length === 2) interior += 1; else nonManifold += 1; }
log(`   edges             interior ${interior.toLocaleString()}   boundary ${bdry}   non-manifold ${nonManifold}`);
const res = measureSurfaceResidual(M, rA);
log(`   vertex |r - rA|   p50 ${(res.p50 * 1e6).toFixed(3)} nm   p99 ${(res.p99 * 1e6).toFixed(3)} nm   MAX ${(res.max * 1000).toFixed(4)} µm`);
log('   ↑ vertices are on the surface BY CONSTRUCTION; this residual is the f32 STL quantum plus any TREAD.');

// TREAD / WALL separation (S103: a tread is a second emitter with no admission test).
// A tread vertex is one whose stored radius is not rA at its own (theta,z) beyond the f32 quantum.
const TREAD_BAR = 1e-3; // 1 µm — two orders above the f32 quantum at r ~ 50 mm (6 nm)
let treadV = 0;
for (let i = 0; i < M.nV; i += 1) if (M.rResid[i] > TREAD_BAR) treadV += 1;
let treadT = 0; let treadArea = 0; let wallArea = 0;
const isTread = new Uint8Array(M.nT);
for (let t = 0; t < M.nT; t += 1) {
  const a = M.rResid[M.ta[t]] > TREAD_BAR || M.rResid[M.tb[t]] > TREAD_BAR || M.rResid[M.tc[t]] > TREAD_BAR;
  const ar = triArea(M, t);
  if (a) { isTread[t] = 1; treadT += 1; treadArea += ar; } else wallArea += ar;
}
log(`   TREAD (off-rA)    vertices ${treadV.toLocaleString()}   facets ${treadT.toLocaleString()} (${(100 * treadT / M.nT).toFixed(4)} %)   area ${treadArea.toFixed(3)} mm² (${(100 * treadArea / M.area3).toFixed(4)} %)   bar ${TREAD_BAR * 1000} µm`);
log(`   WALL              facets ${(M.nT - treadT).toLocaleString()}   area ${wallArea.toFixed(3)} mm²`);

// ─────────────────────────────── 2. LEGALITY, EXHAUSTIVE ───────────────────────────────
log('');
log('── 2. LEGALITY — EXHAUSTIVE over every facet. No cap, no stride. ──');
const G: WeldGrid = buildWeldGrid(M, C);
const edgeMemo = new Map<number, number>();  // eKey -> 1 legal / 0 illegal
let memoHit = 0; let evalsTot = 0;
const illegal: number[] = [];
const worstChildArOf = new Float64Array(M.nT);
const probeEdge = (a: number, b: number): boolean => {
  const k = eKeyOf(M.BIG, a, b);
  const got = edgeMemo.get(k);
  if (got !== undefined) { memoHit += 1; return got === 1; }
  const p = probeSplitEdge(M, rA, C, G, a, b, SNAP ? PRED : undefined);
  evalsTot += p.rAEvals;
  edgeMemo.set(k, p.legal ? 1 : 0);
  return p.legal;
};
let nBelowFloorAll = 0;
// *** THE DEAD-BAND TEST. *** `bisectAt` ADMITS a facet up to aspect3 = SHAPE_AR (50), but a midpoint
// split multiplies a thin facet's aspect by ~1/min(t,1-t) = 2, so a parent above SHAPE_AR/2 = 25 cannot
// be halved without producing a child over the cap. If that is the mechanism, legality must COLLAPSE
// across AR = 25 and be near-total above it. Cross-tabulated mesh-wide, exhaustively, so the claim is
// either visible in the table or refuted by it.
const AR_BINS = [0, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 1e9];
const binLegal = new Array<number>(AR_BINS.length - 1).fill(0);
const binIllegal = new Array<number>(AR_BINS.length - 1).fill(0);
const binOf = (a: number): number => { for (let i = AR_BINS.length - 2; i >= 0; i -= 1) if (a >= AR_BINS[i]) return i; return 0; };
for (let t = 0; t < M.nT; t += 1) {
  let legal = false; let above = 0; let worst = 0;
  for (let e = 0; e < 3 && !legal; e += 1) {
    const [a, b] = eVerts(M, t, e);
    if (eLen(M, a, b) < C.FLOOR_MM) continue;
    above += 1;
    if (probeEdge(a, b)) legal = true;
  }
  const bi = binOf(arOf(M, t));
  if (legal) binLegal[bi] += 1; else binIllegal[bi] += 1;
  if (above === 0) nBelowFloorAll += 1;
  if (!legal) {
    illegal.push(t);
    // re-probe without the memo to harvest the evidence (small set)
    const fl = facetLegality(M, rA, C, G, t, SNAP ? PRED : undefined);
    worst = fl.worstChildAr;
  }
  worstChildArOf[t] = worst;
  if ((t & 0x3ffff) === 0) log(`   … ${t.toLocaleString()}/${M.nT.toLocaleString()}  illegal ${illegal.length.toLocaleString()}  ${((Date.now() - T0) / 1000).toFixed(0)}s`);
}
log(`   probed ${(edgeMemo.size).toLocaleString()} unique edges (${memoHit.toLocaleString()} memo hits), ${(evalsTot / 1e6).toFixed(1)} M rA evals`);
log(`   facets with NO edge >= FLOOR_MM (${C.FLOOR_MM * 1000} µm): ${nBelowFloorAll.toLocaleString()}  ⇒ the h⁰ 'floor' class`);
log(`   facets with NO LEGAL SPLIT: ${illegal.length.toLocaleString()} (${(100 * illegal.length / M.nT).toFixed(5)} %)`);
log('');
log('   *** THE DEAD-BAND CROSS-TAB — mesh-wide, EXHAUSTIVE, every facet. ***');
log(`   The emit guard admits up to aspect3 = ${C.SHAPE_AR}; a midpoint split multiplies a thin facet's`);
log(`   aspect by ~1/min(t,1-t) = 2, so the predicted collapse of legality is at AR = ${C.SHAPE_AR / 2}.`);
log('     AR bin          facets      LEGAL       ILLEGAL     illegal share');
for (let i = 0; i < binLegal.length; i += 1) {
  const n = binLegal[i] + binIllegal[i];
  if (n === 0) continue;
  const hi = AR_BINS[i + 1] >= 1e9 ? '∞' : String(AR_BINS[i + 1]);
  log(`     [${String(AR_BINS[i]).padStart(3)},${hi.padStart(3)})  ${String(n).padStart(11)}  ${String(binLegal[i]).padStart(11)}  ${String(binIllegal[i]).padStart(11)}   ${(100 * binIllegal[i] / n).toFixed(3).padStart(9)} %`);
}

// ─────────────────────────────── 3. DEMAND on the illegal set ───────────────────────────────
log('');
log('── 3. DEMAND — the driver\'s own accept test (RANK=plane, sagAdaptive 0.03mm pitch, n∈[12,64]) ──');
const demand = makeDemand(M, rA, C);
interface Rec { t: number; sag: number; area: number; ar: number; worstChildAr: number; belowFloor: boolean }
const recs: Rec[] = [];
let illegalArea = 0;
for (const t of illegal) {
  const s = demand(t);
  const a = triArea(M, t);
  illegalArea += a;
  let above = 0;
  for (let e = 0; e < 3; e += 1) { const [p, q] = eVerts(M, t, e); if (eLen(M, p, q) >= C.FLOOR_MM) above += 1; }
  recs.push({ t, sag: s, area: a, ar: arOf(M, t), worstChildAr: worstChildArOf[t], belowFloor: above === 0 });
}
const blocked = recs.filter((r) => r.sag > C.acceptTol && !r.belowFloor);
const blockedFloor = recs.filter((r) => r.sag > C.acceptTol && r.belowFloor);
const quiet = recs.filter((r) => r.sag <= C.acceptTol);
const sumA = (rs: Rec[]): number => rs.reduce((s, r) => s + r.area, 0);
const maxS = (rs: Rec[]): number => rs.reduce((s, r) => Math.max(s, r.sag), 0);
log(`   illegal facets                 ${illegal.length.toLocaleString()}   area ${illegalArea.toFixed(4)} mm² (${(100 * illegalArea / M.area3).toFixed(5)} % of mesh)`);
log(`   … of which QUIET (sag<=accept) ${quiet.length.toLocaleString()}   area ${sumA(quiet).toFixed(4)} mm² — illegal but NOT blocked: nothing wants to split them`);
log(`   … of which BLOCKED (shape)     ${blocked.length.toLocaleString()}   area ${sumA(blocked).toFixed(4)} mm² (${(100 * sumA(blocked) / M.area3).toFixed(5)} %)   MAX sag ${(maxS(blocked) * 1000).toFixed(3)} µm`);
log(`   … of which BLOCKED (floor h⁰)  ${blockedFloor.length.toLocaleString()}   area ${sumA(blockedFloor).toFixed(4)} mm²   MAX sag ${(maxS(blockedFloor) * 1000).toFixed(3)} µm`);
log('');
log(`   *** VALIDATION GATE: compare BLOCKED(shape) with the driver log's \`unresolved by reason: shape-ar\`. ***`);

// parent-AR ladder on the blocked set — the mechanism evidence
const ARB = [2, 5, 10, 20, 25, 40, 50, 100, 1000];
log('');
log('   parent AR ladder over the BLOCKED(shape) set    (the guard cap is AR 50)');
log('     AR >=      count      area mm²    share of blocked area');
const bArea = sumA(blocked);
for (const b of ARB) {
  const s = blocked.filter((r) => r.ar >= b);
  log(`     ${String(b).padStart(6)}   ${String(s.length).padStart(8)}   ${sumA(s).toFixed(5).padStart(11)}   ${(100 * sumA(s) / Math.max(1e-30, bArea)).toFixed(2).padStart(7)} %`);
}
const arVals = blocked.map((r) => r.ar).sort((a, b) => a - b);
if (arVals.length > 0) {
  log(`     parent AR   p05 ${arVals[Math.floor(arVals.length * 0.05)].toFixed(2)}   p50 ${arVals[Math.floor(arVals.length * 0.5)].toFixed(2)}   p95 ${arVals[Math.floor(arVals.length * 0.95)].toFixed(2)}   MAX ${arVals[arVals.length - 1].toFixed(2)}`);
}
const wcVals = blocked.map((r) => r.worstChildAr).filter((v) => v > 0).sort((a, b) => a - b);
if (wcVals.length > 0) {
  log(`     worst CHILD AR the ladder ever offered   p05 ${wcVals[Math.floor(wcVals.length * 0.05)].toFixed(1)}   p50 ${wcVals[Math.floor(wcVals.length * 0.5)].toFixed(1)}   p95 ${wcVals[Math.floor(wcVals.length * 0.95)].toFixed(1)}   MAX ${wcVals[wcVals.length - 1].toFixed(1)}`);
  const nearBar = wcVals.filter((v) => v <= C.SHAPE_AR * 1.02).length;
  log(`     … within 2 % of the AR-50 bar: ${nearBar} of ${wcVals.length} — *** THE f32-REBUILD SENSITIVITY. A verdict this close could flip under the driver's f64 (theta,z). ***`);
}

// ─────────────────────── 3b. DRAIN CHECK — did this arm's heap actually empty? ───────────────────────
log('');
log('── 3b. DRAIN CHECK — on a DRAINED arm every demanding facet must be ILLEGAL. ──');
{
  const NS = Math.min(M.nT, 200_000);
  const stride = Math.max(1, Math.floor(M.nT / NS));
  let n = 0; let dem = 0; let demLegal = 0;
  for (let t = 0; t < M.nT; t += stride) {
    n += 1;
    if (demand(t) <= C.acceptTol) continue;
    dem += 1;
    let legal = false;
    for (let e = 0; e < 3 && !legal; e += 1) {
      const [a, b] = eVerts(M, t, e);
      if (eLen(M, a, b) < C.FLOOR_MM) continue;
      if (probeEdge(a, b)) legal = true;
    }
    if (legal) demLegal += 1;
  }
  log(`   *** SAMPLED, stride ${stride}, ${n.toLocaleString()} facets adjudicated (${(100 * n / M.nT).toFixed(3)} % of the mesh) ***`);
  log(`   demanding (sag > acceptTol): ${dem.toLocaleString()} (${(100 * dem / n).toFixed(4)} % of the sample)`);
  log(`   … of those, STILL LEGAL     : ${demLegal.toLocaleString()} (${(100 * demLegal / Math.max(1, dem)).toFixed(2)} % of demanding)`);
  log(`   ⇒ extrapolated legal-and-demanding over the mesh: ${Math.round(demLegal * stride).toLocaleString()}`);
  log('   A LARGE number here means the arm was CAPPED, not drained: its `unresolved` is not comparable and');
  log('   its blocked class is a LOWER BOUND on what a drained run of the same recipe would strand.');
}

// ─────────────────────────── 4. EDGE CONFORMANCE on the blocked set ───────────────────────────
log('');
log('── 4. EDGE CONFORMANCE — max over the 3-D SEGMENT of dist(point, surface). *** NOT edgeSag. *** ──');
log(`   radial lattice n=${EDGEN} + golden-section refine, then PERPENDICULAR confirmation at the argmax.`);
log('   *** NO ONE IN THIS CAMPAIGN HAS SCORED AN EDGE BEFORE. Every prior position number is PER FACET. ***');
const LAD = [0.001, 0.01];
const CLIFF_BARS = [0.005, 0.02, 0.05, 0.2];
const CLIFF_N = 256;
interface EStat { n: number; maxRad: number; maxPerp: number; sumLen: number; over: number[]; overLen: number[]; vals: number[] }
const mkE = (): EStat => ({ n: 0, maxRad: 0, maxPerp: 0, sumLen: 0, over: LAD.map(() => 0), overLen: LAD.map(() => 0), vals: [] });
const scoreEdge = (a: number, b: number, S: EStat): number => {
  S.n += 1;
  const L = eLen(M, a, b); S.sumLen += L;
  const rd = edgeRadialMax(rA, C.H, M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], EDGEN);
  if (rd.d > S.maxRad) S.maxRad = rd.d;
  const s = rd.s;
  const px = M.vx[a] + (M.vx[b] - M.vx[a]) * s; const py = M.vy[a] + (M.vy[b] - M.vy[a]) * s; const pz = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
  const pd = distPerpFrom(rA, C.H, px, py, pz, Math.atan2(py, px), Math.min(C.H, Math.max(0, pz))).d;
  if (pd > S.maxPerp) S.maxPerp = pd;
  S.vals.push(pd);
  for (let i = 0; i < LAD.length; i += 1) if (pd > LAD[i]) { S.over[i] += 1; S.overLen[i] += L; }
  return pd;
};
const showE = (label: string, S: EStat): void => {
  if (S.n === 0) { log(`   ${label}: (empty)`); return; }
  const v = S.vals.slice().sort((a, b) => a - b);
  log(`   ${label}: ${S.n.toLocaleString()} edges, total length ${S.sumLen.toFixed(3)} mm`);
  log(`      perp p50 ${(v[Math.floor(v.length * 0.5)] * 1000).toFixed(4)} µm   p95 ${(v[Math.floor(v.length * 0.95)] * 1000).toFixed(4)} µm   p99 ${(v[Math.floor(v.length * 0.99)] * 1000).toFixed(4)} µm   MAX ${(S.maxPerp * 1000).toFixed(4)} µm   (radial upper bound MAX ${(S.maxRad * 1000).toFixed(4)} µm)`);
  for (let i = 0; i < LAD.length; i += 1) {
    log(`      over ${(LAD[i] * 1000).toFixed(0).padStart(2)} µm : ${String(S.over[i]).padStart(8)} (${(100 * S.over[i] / S.n).toFixed(3)} % by count, ${(100 * S.overLen[i] / Math.max(1e-30, S.sumLen)).toFixed(3)} % by length)`);
  }
};
const classifyCliff = (a: number, b: number): number =>
  edgeCliffJump(rA, M.vth[a], M.vz[a], dThRaw(M.vth[a], M.vth[b]), M.vz[b] - M.vz[a], CLIFF_N);
{
  const seen = new Set<number>();
  const all = mkE(); const smooth = mkE(); const cliff = mkE();
  const cliffHist = CLIFF_BARS.map(() => 0);
  for (const r of blocked) for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, r.t, e);
    const k = eKeyOf(M.BIG, a, b); if (seen.has(k)) continue; seen.add(k);
    const j = classifyCliff(a, b);
    for (let i = 0; i < CLIFF_BARS.length; i += 1) if (j > CLIFF_BARS[i]) cliffHist[i] += 1;
    const isTreadEdge = M.rResid[a] > TREAD_BAR || M.rResid[b] > TREAD_BAR;
    scoreEdge(a, b, all);
    if (j > 0.05 || isTreadEdge) scoreEdge(a, b, cliff); else scoreEdge(a, b, smooth);
  }
  log('');
  log(`   CLIFF LADDER over the blocked set's edges (max adjacent |Δ rA| at n=${CLIFF_N} along the parameter segment)`);
  log(`      ${CLIFF_BARS.map((b, i) => `>${(b * 1000).toFixed(0)}µm ${cliffHist[i]}`).join('   ')}   of ${all.n}`);
  showE('BLOCKED edges — ALL', all);
  showE('BLOCKED edges — SMOOTH-REGION ONLY (no cliff crossing, no tread endpoint)', smooth);
  showE('BLOCKED edges — CLIFF-CROSSING or TREAD (*** rA is single-valued here: the ruler OVER-READS ***)', cliff);
}

// a MESH-WIDE edge-conformance reference so the blocked share is never quoted as a mesh share.
{
  const stride = Math.max(1, Math.floor(M.nT / 40000));
  const all = mkE(); const smooth = mkE(); const cliff = mkE();
  for (let t = 0; t < M.nT; t += stride) for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, t, e);
    const j = classifyCliff(a, b);
    const isTreadEdge = M.rResid[a] > TREAD_BAR || M.rResid[b] > TREAD_BAR;
    scoreEdge(a, b, all);
    if (j > 0.05 || isTreadEdge) scoreEdge(a, b, cliff); else scoreEdge(a, b, smooth);
  }
  log('');
  log(`   MESH-WIDE REFERENCE — *** SAMPLED, stride ${stride} over facets, ${all.n.toLocaleString()} edge slots adjudicated (${(100 * all.n / (3 * M.nT)).toFixed(3)} % of all) ***`);
  showE('MESH edges — ALL', all);
  showE('MESH edges — SMOOTH-REGION ONLY', smooth);
  showE('MESH edges — CLIFF-CROSSING or TREAD (ruler OVER-READS)', cliff);
}

// ─────────────────────────────── 5. DUMP for the operator stage ───────────────────────────────
if (OUT.length > 0) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    tag: TAG, style: STYLE, stl: STL, acceptTolMm: C.acceptTol, snap: SNAP,
    nT: M.nT, nV: M.nV, area3: M.area3, wallArea, treadT,
    blocked: blocked.map((r) => [r.t, r.sag, r.area, r.ar, r.worstChildAr]),
    blockedFloor: blockedFloor.map((r) => [r.t, r.sag, r.area, r.ar]),
    quietIllegal: quiet.length,
  }));
  log('');
  log(`dump ${OUT}`);
}
log('');
log(`done in ${((Date.now() - T0) / 1000).toFixed(1)}s`);

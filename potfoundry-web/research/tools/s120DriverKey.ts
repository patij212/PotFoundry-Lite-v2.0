// s120DriverKey.ts — S120: HOW BLIND IS THE DRIVER'S OWN EDGE RULER TO EDGE CONFORMANCE?
//
// The driver ranks edges for splitting by `edgeSag` (_strataConformBisectL.test.ts:902), which is
// `edgeSagRaw` (_sweepPredicate.ts:93) with the driver's own PRED pitch (esN=8, refHs=0.03, refNmax=64,
// i.e. n = clamp(ceil(L/0.03), 8, 64)). That quantity is
//
//     D(a,b) = max over t of dist( surfaceCurve(t) , the infinite LINE through a,b )
//
// The user's standard, and what S120 measures, is
//
//     E(a,b) = max over s of dist( a + s(b-a) , the SURFACE )                    [PERPENDICULAR]
//
// These are different: D measures FROM the surface curve TO a line; E measures FROM the segment TO the
// whole surface. Neither bounds the other. This tool computes both on the SAME exhaustive edge set and
// reports the blindness — because a ranking function that does not see the quantity being certified is
// exactly the S99 finding ("the heap driver never ASKS") restated at the edge level.
//
// It reads S120's per-edge scalar dumps, so nothing expensive is recomputed. The edge ordering is a pure
// function of the mesh, and the tool REFUSES if the dump length disagrees.
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, edgeSagRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshF32 } from './s118MeshIo';
import { weldExact, uniqueEdges } from './s120EdgeLib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ }
// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const STYLE = envS('PF_S120_STYLE', 'CelticTriquetra');
const STL = envS('PF_S120_STL', '');
const TAG = envS('PF_S120_TAG', 'RUN');
const OUTDIR = envS('PF_S120_OUTDIR', 'research/exchange/_strataConformBisect/s120');
const DIMS: StyleDims = { H: envF('PF_S120_H', 120), Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S120_BARHI', 0.01);
const BAR_LO = envF('PF_S120_BARLO', 0.001);
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const qt = (v: number[], p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);
if (STL.length === 0) { log('*** PF_S120_STL required ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// THE DRIVER'S OWN PITCH, verbatim from _strataConformBisectL.test.ts:882/893.
const PRED: SweepPredConst = {
  esN: envI('PF_CB_ESN', 8), refHs: envF('PF_CB_REF_HS', 0.03), refNmax: envI('PF_CB_REF_NMAX', 64),
  kinkScan: 0, kinkHalvings: 0, kinkRatio: 0, jumpRatio: 0, snap: false, confMm: 0,
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S120 — THE DRIVER'S RANK KEY vs EDGE CONFORMANCE — ${STYLE}  tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`driver pitch (verbatim): esN=${PRED.esN}  refHs=${PRED.refHs}  refNmax=${PRED.refNmax}`);
log('D(a,b) = max_t dist(surface curve, the LINE ab)      <- the driver ranks by this (_sweepPredicate.ts:93)');
log('E(a,b) = max_s dist(a+s(b-a), the SURFACE)           <- the user\'s standard, S120 measures this');
log('');
const M = readMeshF32(STL);
const WELD = weldExact(M.xyz);
const U = uniqueEdges(WELD.id, WELD.count, M.nTri);
const nE = U.count;
const vx = new Float64Array(WELD.count); const vy = new Float64Array(WELD.count); const vz = new Float64Array(WELD.count);
for (let c = 0; c < M.nTri * 3; c += 1) { const w = WELD.id[c]; vx[w] = M.xyz[c * 3]; vy[w] = M.xyz[c * 3 + 1]; vz[w] = M.xyz[c * 3 + 2]; }
const load = (n: string): Float32Array => {
  const b = readFileSync(`${OUTDIR}/S120_${TAG}_${n}.f32`);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
const ePerp = load('edgePerp'); const eLen = load('edgeLen');
if (ePerp.length !== nE) { log(`*** edge count ${nE} != dump ${ePerp.length} — RUN VOID ***`); process.exit(3); }
log(`mesh ${M.nTri.toLocaleString()} facets   ${nE.toLocaleString()} unique edges   dumps MATCH`);

const t0 = Date.now();
const eDrv = new Float64Array(nE);
let totLen = 0;
for (let e = 0; e < nE; e += 1) {
  const a = U.eLo[e]; const b = U.eHi[e];
  const thA = Math.atan2(vy[a], vx[a]);
  const dth = dThRaw(thA, Math.atan2(vy[b], vx[b]));
  eDrv[e] = edgeSagRaw(rA, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], thA, dth, PRED);
  totLen += eLen[e];
}
log(`driver key computed for every edge in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
log('');

// ── the two rulers side by side, at both bars, EXHAUSTIVE ────────────────────────────────────────────
const J: Record<string, unknown> = { tag: TAG, style: STYLE, nE, pred: PRED };
const bars = [BAR_HI, BAR_LO];
log('── SAME EDGE SET, TWO RULERS, EXHAUSTIVE. COUNT + LENGTH-share + MAX. ──');
log('      bar        D>bar count   D %LEN      E>bar count   E %LEN     agree     D-only      E-only');
const rows: Array<Record<string, number>> = [];
for (const bar of bars) {
  let cD = 0, lD = 0, cE = 0, lE = 0, both = 0, dOnly = 0, eOnly = 0;
  for (let e = 0; e < nE; e += 1) {
    const d = eDrv[e] > bar; const p = ePerp[e] > bar;
    if (d) { cD += 1; lD += eLen[e]; }
    if (p) { cE += 1; lE += eLen[e]; }
    if (d && p) both += 1; else if (d) dOnly += 1; else if (p) eOnly += 1;
  }
  log(`   ${bar.toFixed(4).padStart(8)} ${String(cD).padStart(15)} ${(pct(lD, totLen) + '%').padStart(9)} ${String(cE).padStart(15)} ${(pct(lE, totLen) + '%').padStart(9)} ${String(both).padStart(10)} ${String(dOnly).padStart(11)} ${String(eOnly).padStart(11)}`);
  rows.push({ bar, dCount: cD, dLen: lD, eCount: cE, eLen: lE, both, dOnly, eOnly });
}
J.bars = rows;
let dMax = 0; let eMax = 0;
for (let e = 0; e < nE; e += 1) { if (eDrv[e] > dMax) dMax = eDrv[e]; if (ePerp[e] > eMax) eMax = ePerp[e]; }
log(`   MAX:  D ${ex(dMax)} mm    E ${ex(eMax)} mm    ratio E/D ${(eMax / Math.max(1e-15, dMax)).toFixed(3)}x`);
J.dMax = dMax; J.eMax = eMax;
log('');

// ── BLINDNESS on the edges that actually fail the user's standard ────────────────────────────────────
{
  const rat: number[] = [];
  let nFail = 0; let nBlind = 0; let blindLen = 0; let failLen = 0;
  for (let e = 0; e < nE; e += 1) {
    if (!(ePerp[e] > BAR_HI)) continue;
    nFail += 1; failLen += eLen[e];
    rat.push(ePerp[e] / Math.max(1e-15, eDrv[e]));
    if (!(eDrv[e] > BAR_HI)) { nBlind += 1; blindLen += eLen[e]; }
  }
  rat.sort((a, b) => a - b);
  log(`── BLINDNESS at the ${BAR_HI} mm bar: edges that FAIL the user's standard, seen through the DRIVER's key ──`);
  log(`   failing edges ${nFail.toLocaleString()} (${pct(failLen, totLen)}% of length)`);
  log(`   *** of those, edges the DRIVER's key ALSO puts over the bar: ${(nFail - nBlind).toLocaleString()} = ${pct(nFail - nBlind, nFail)}%`);
  log(`       INVISIBLE to the driver's key: ${nBlind.toLocaleString()} = ${pct(nBlind, nFail)}% (${pct(blindLen, totLen)}% of total length) ***`);
  log(`   ratio E/D on failing edges: p10 ${qt(rat, 0.1).toFixed(3)}  p50 ${qt(rat, 0.5).toFixed(3)}  p90 ${qt(rat, 0.9).toFixed(3)}  p99 ${qt(rat, 0.99).toFixed(3)}  MAX ${qt(rat, 1).toExponential(3)}`);
  J.blindHi = { nFail, nBlind, blindLen, failLen, p10: qt(rat, 0.1), p50: qt(rat, 0.5), p90: qt(rat, 0.9), p99: qt(rat, 0.99), max: qt(rat, 1) };
}
log('');

// ── RANK AGREEMENT — the driver never uses the VALUE, only the ORDER within one triangle ─────────────
// The selector picks argmax over an edge's own triangle's THREE edges, so what matters is not the
// value but whether the key ORDERS a triangle's edges the way conformance does. Measured on every
// facet, exhaustively: does argmax_D equal argmax_E?
{
  let agree = 0; let n = 0; let lostSum = 0; let lostMax = 0;
  const idOf = new Map<number, number>();
  for (let e = 0; e < nE; e += 1) idOf.set(U.eLo[e] * 4294967296 + U.eHi[e], e);
  const key = (a: number, b: number): number => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  for (let f = 0; f < M.nTri; f += 1) {
    const w0 = WELD.id[f * 3], w1 = WELD.id[f * 3 + 1], w2 = WELD.id[f * 3 + 2];
    const e0 = idOf.get(key(w0, w1)); const e1 = idOf.get(key(w1, w2)); const e2 = idOf.get(key(w2, w0));
    if (e0 === undefined || e1 === undefined || e2 === undefined) continue;
    const es = [e0, e1, e2];
    let bD = 0; let bE = 0;
    for (let i = 1; i < 3; i += 1) {
      if (eDrv[es[i]] > eDrv[es[bD]]) bD = i;
      if (ePerp[es[i]] > ePerp[es[bE]]) bE = i;
    }
    n += 1;
    if (bD === bE) agree += 1;
    else {
      const lost = ePerp[es[bE]] - ePerp[es[bD]];
      lostSum += lost;
      if (lost > lostMax) lostMax = lost;
    }
  }
  log('── RANK AGREEMENT (what the selector actually consumes: argmax over ONE triangle\'s three edges) ──');
  log(`   facets scored ${n.toLocaleString()} (exhaustive)`);
  log(`   *** the driver's key picks the SAME edge conformance would pick on ${agree.toLocaleString()} = ${pct(agree, n)}% of facets ***`);
  log(`   on the ${(n - agree).toLocaleString()} disagreements: mean conformance FOREGONE ${ex(lostSum / Math.max(1, n - agree))} mm, worst ${ex(lostMax)} mm`);
  J.rank = { facets: n, agree, agreePct: (agree / n) * 100, disagree: n - agree, meanLost: lostSum / Math.max(1, n - agree), maxLost: lostMax };
}
log('');
const jp = `${OUTDIR}/S120_DRIVERKEY_${TAG}.json`;
writeFileSync(jp, JSON.stringify(J, null, 2));
log(`json -> ${jp}`);
log('S120 DRIVER-KEY COMPARISON DONE');

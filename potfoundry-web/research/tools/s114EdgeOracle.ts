// s114EdgeOracle.ts — IS THE NEW `locs.turnDeg` THE HONEST ONE? AN INDEPENDENT ARBITER ON THE REAL MESH.
//
// WHY. Fixing the locator moved `locs.turnDeg` on 100% of the S113 straddle set's 19,692 facet edges, and
// the movement is not one-directional: at a 1-deg bar the class SHRINKS by 3,398 edges / 32.6 points of
// area, at a 90-deg bar it GROWS by 4,210 edges / 25.5 points. Both readings cannot be right. My own
// fixtures say the new one is, but a fixture is a closed form I chose; this is the same question asked of
// the actual Gothic mesh by an instrument that shares no code path with either locator.
//
// THE ARBITER. A dense uniform SCAN across each edge: `CELLS+1` finite-difference normals, step a 64th of
// a cell, largest turn over pairs TWO APART. No bracket, no bisection, nothing that can discard a half —
// and the 2-apart pairing means the one probe that may straddle the locus cannot split the reading (the
// exact mechanism of DEFECT A). It costs ~64x a locator call, which is why it is a sampled control and
// not the instrument.
//
// Usage: PF_S114E_PRE=<abs pre.ndjson> PF_S114E_POST=<abs post.ndjson> bash research/tools/run-s114-edgeoracle.sh
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { fdNormalsCentral } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114E_STYLE ?? 'GothicArches';
const PRE = process.env.PF_S114E_PRE ?? '';
const POST = process.env.PF_S114E_POST ?? '';
const STRIDE = Math.round(envF('PF_S114E_STRIDE', 23));
const CELLS = Math.round(envF('PF_S114E_CELLS', 8192));
const DIMS: StyleDims = { H: envF('PF_S114E_H', 120), Rb: envF('PF_S114E_RB', 40), Rt: envF('PF_S114E_RT', 50), expn: 1 };
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
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

interface Loc { f: number; edge: number; s: number; turnDeg: number }
interface Row { e: number; f1: number; f2: number; area1: number; area2: number; tri1: number[]; tri2: number[]; locs: Loc[] }
const rd = (p: string): Row[] => readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Row);

const A = rd(PRE); const B = rd(POST);
log('===== S114 — INDEPENDENT DENSE-SCAN ARBITER on the S113 straddle edges =====');
log(`style ${STYLE}   rows ${A.length}   stride ${STRIDE}   scan cells ${CELLS} (2-apart pairs, h = cell/64)`);
if (A.length !== B.length) { log('*** ROW COUNT DIFFERS — VOID ***'); process.exit(3); }

const sc = new Float64Array(12);
/**
 * `pad` in units of s. pad=0 scans the CLOSED edge [0,1] only. pad>0 scans [-pad, 1+pad].
 *
 * ⚠ THE PAD IS NOT A REFINEMENT, IT IS A SEMANTIC CHOICE, AND IT IS THE ONE THE TWO LOCATORS DIFFER ON.
 * A locus sitting EXACTLY on a mesh vertex is the commonest case on a crease-conformed mesh (S112: 56.7%
 * of the target area has a vertex on the locus at the f32 floor). At pad=0 the 2-apart pair nearest s=0
 * spans [0, 2/CELLS] — BOTH points on the same side of that locus — so the pad=0 oracle is BLIND to it
 * and reads ~0. The fixed locator deliberately reads its turn a bracket OUTSIDE the final bracket and
 * therefore SEES it. Running both pads is the only way to tell "POST over-reads" from "the pad=0 oracle
 * cannot see endpoint loci", and those are opposite conclusions.
 */
function oracleTurnDeg(ath: number, az: number, bth: number, bz: number, rRef: number, pad: number): number {
  const lenMm = Math.hypot(rRef * (bth - ath), bz - az);
  const h = Math.max(1e-12, lenMm / (64 * CELLS));
  const ns = fdNormalsCentral(rA, H, h, h);
  const N = new Float64Array(3 * (CELLS + 1));
  const s0 = -pad; const span = 1 + 2 * pad;
  for (let i = 0; i <= CELLS; i += 1) {
    const s = s0 + (span * i) / CELLS;
    ns(ath + (bth - ath) * s, az + (bz - az) * s, sc);
    N[3 * i] = sc[0]; N[3 * i + 1] = sc[1]; N[3 * i + 2] = sc[2];
  }
  let best = -1;
  for (let i = 1; i < CELLS; i += 1) {
    let d = N[3 * (i - 1)] * N[3 * (i + 1)] + N[3 * (i - 1) + 1] * N[3 * (i + 1) + 1] + N[3 * (i - 1) + 2] * N[3 * (i + 1) + 2];
    d = d > 1 ? 1 : d < -1 ? -1 : d;
    const t = Math.acos(d);
    if (t > best) best = t;
  }
  return (best * 180) / Math.PI;
}

const PAD = envF('PF_S114E_PAD', 0.01);
const dPre: number[] = []; const dPost: number[] = [];
const dPreX: number[] = []; const dPostX: number[] = [];
const vPre: number[] = []; const vPost: number[] = []; const vOr: number[] = []; const vOrX: number[] = [];
const vS: number[] = [];
let n = 0;
for (let i = 0; i < A.length; i += 1) {
  for (let j = 0; j < A[i].locs.length; j += 1) {
    n += 1;
    if ((n - 1) % STRIDE !== 0) continue;
    const la = A[i].locs[j]; const lb = B[i].locs[j];
    const tri = la.f === A[i].f1 ? A[i].tri1 : A[i].tri2;
    const ath = Math.atan2(tri[1], tri[0]);
    const ths = [ath, ath + dThRaw(ath, Math.atan2(tri[4], tri[3])), ath + dThRaw(ath, Math.atan2(tri[7], tri[6]))];
    const zs = [tri[2], tri[5], tri[8]];
    const rRef = (Math.hypot(tri[0], tri[1]) + Math.hypot(tri[3], tri[4]) + Math.hypot(tri[6], tri[7])) / 3;
    const ei = la.edge; const jj = (ei + 1) % 3;
    const orc = oracleTurnDeg(ths[ei], zs[ei], ths[jj], zs[jj], rRef, 0);
    const orcX = oracleTurnDeg(ths[ei], zs[ei], ths[jj], zs[jj], rRef, PAD);
    vPre.push(la.turnDeg); vPost.push(lb.turnDeg); vOr.push(orc); vOrX.push(orcX); vS.push(lb.s);
    dPre.push(Math.abs(la.turnDeg - orc)); dPost.push(Math.abs(lb.turnDeg - orc));
    dPreX.push(Math.abs(la.turnDeg - orcX)); dPostX.push(Math.abs(lb.turnDeg - orcX));
  }
}
const q = (v: number[], p: number): number => { const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mx = (v: number[]): number => v.reduce((a, b) => (b > a ? b : a), -Infinity);
log(`sampled ${vOr.length} of ${n} facet edges`);
log('');
log('── |locator - ORACLE|, degrees ──          p50        p90        p99        MAX      mean');
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
log(`  PRE  vs pad=0      ${q(dPre, 0.5).toFixed(4).padStart(10)} ${q(dPre, 0.9).toFixed(4).padStart(10)} ${q(dPre, 0.99).toFixed(4).padStart(10)} ${mx(dPre).toFixed(4).padStart(10)} ${mean(dPre).toFixed(4).padStart(9)}`);
log(`  POST vs pad=0      ${q(dPost, 0.5).toFixed(4).padStart(10)} ${q(dPost, 0.9).toFixed(4).padStart(10)} ${q(dPost, 0.99).toFixed(4).padStart(10)} ${mx(dPost).toFixed(4).padStart(10)} ${mean(dPost).toFixed(4).padStart(9)}`);
log(`  PRE  vs pad=${PAD}   ${q(dPreX, 0.5).toFixed(4).padStart(10)} ${q(dPreX, 0.9).toFixed(4).padStart(10)} ${q(dPreX, 0.99).toFixed(4).padStart(10)} ${mx(dPreX).toFixed(4).padStart(10)} ${mean(dPreX).toFixed(4).padStart(9)}`);
log(`  POST vs pad=${PAD}   ${q(dPostX, 0.5).toFixed(4).padStart(10)} ${q(dPostX, 0.9).toFixed(4).padStart(10)} ${q(dPostX, 0.99).toFixed(4).padStart(10)} ${mx(dPostX).toFixed(4).padStart(10)} ${mean(dPostX).toFixed(4).padStart(9)}`);
log('');
const closer = (dp: number[], dq: number[], nm: string): void => {
  let cPost = 0; let cPre = 0; let tie = 0;
  for (let i = 0; i < dp.length; i += 1) {
    if (dq[i] < dp[i] - 1e-9) cPost += 1; else if (dp[i] < dq[i] - 1e-9) cPre += 1; else tie += 1;
  }
  log(`  vs ${nm}:  POST closer ${cPost} (${((cPost / dp.length) * 100).toFixed(2)}%)   PRE closer ${cPre} (${((cPre / dp.length) * 100).toFixed(2)}%)   tie ${tie}`);
};
log('── WHICH IS CLOSER TO THE ARBITER, EDGE BY EDGE ──');
closer(dPre, dPost, 'pad=0    ');
closer(dPreX, dPostX, `pad=${PAD}`);
log('');
log('── WHERE POST DISAGREES WITH THE pad=0 ORACLE (>5 deg), BY THE LOCATED `s` ──');
log('   (if it concentrates at s~0 / s~1 the disagreement is the ORACLE\'s endpoint blindness, not POST)');
const buck = [0, 0, 0]; const bTot = [0, 0, 0];
for (let i = 0; i < vS.length; i += 1) {
  const b = vS[i] < 0.02 ? 0 : vS[i] > 0.98 ? 2 : 1;
  bTot[b] += 1; if (dPost[i] > 5) buck[b] += 1;
}
const bn = ['s < 0.02 (at the FIRST vertex)', 's in [0.02,0.98] (interior)', 's > 0.98 (at the SECOND vertex)'];
for (let b = 0; b < 3; b += 1) log(`  ${bn[b].padEnd(34)} ${String(buck[b]).padStart(4)} / ${String(bTot[b]).padStart(4)} disagree  (${bTot[b] > 0 ? ((buck[b] / bTot[b]) * 100).toFixed(2) : 'n/a'}%)`);
log('');
log('── SIGN OF THE RESIDUAL vs the pad=0 arbiter (>5 deg): does the locator MISS or INVENT? ──');
for (const [nm, v] of [['PRE ', vPre], ['POST', vPost]] as Array<[string, number[]]>) {
  let miss = 0; let inv = 0; let missSum = 0; let invSum = 0; let missMax = 0; let invMax = 0;
  for (let i = 0; i < v.length; i += 1) {
    const d = v[i] - vOr[i];
    if (d < -5) { miss += 1; missSum += -d; if (-d > missMax) missMax = -d; } else if (d > 5) { inv += 1; invSum += d; if (d > invMax) invMax = d; }
  }
  log(`  ${nm}  MISSES a turn the scan sees: ${String(miss).padStart(4)} edges  mean ${(miss > 0 ? missSum / miss : 0).toFixed(2).padStart(7)} deg  max ${missMax.toFixed(2).padStart(7)} deg`);
  log(`  ${nm}  REPORTS a turn the scan does not: ${String(inv).padStart(4)} edges  mean ${(inv > 0 ? invSum / inv : 0).toFixed(2).padStart(7)} deg  max ${invMax.toFixed(2).padStart(7)} deg`);
}
log('');
log('── AGREEMENT WITH THE ARBITER AT A CREASE BAR (the classification the dump is used for) ──');
for (const [onm, ov] of [['pad=0    ', vOr], [`pad=${PAD}`, vOrX]] as Array<[string, number[]]>) {
  for (const bar of [1, 10, 45, 90]) {
    let nOr = 0; let agrPre = 0; let agrPost = 0;
    for (let i = 0; i < ov.length; i += 1) {
      const o = ov[i] >= bar; if (o) nOr += 1;
      if ((vPre[i] >= bar) === o) agrPre += 1;
      if ((vPost[i] >= bar) === o) agrPost += 1;
    }
    log(`  ${onm}  bar ${String(bar).padStart(3)} deg   arbiter YES on ${String(nOr).padStart(4)}/${ov.length}   PRE agrees ${((agrPre / ov.length) * 100).toFixed(2)}%   POST agrees ${((agrPost / ov.length) * 100).toFixed(2)}%`);
  }
}
log('');
// NON-VACUITY FLOOR: if the arbiter itself were degenerate (all zero / all equal) every agreement above
// would be meaningless. Print its own spread, both pads.
log(`ARBITER non-vacuity pad=0:    p10 ${q(vOr, 0.1).toFixed(4)}  p50 ${q(vOr, 0.5).toFixed(4)}  p90 ${q(vOr, 0.9).toFixed(4)}  MAX ${mx(vOr).toFixed(4)} deg`);
log(`ARBITER non-vacuity pad=${PAD}: p10 ${q(vOrX, 0.1).toFixed(4)}  p50 ${q(vOrX, 0.5).toFixed(4)}  p90 ${q(vOrX, 0.9).toFixed(4)}  MAX ${mx(vOrX).toFixed(4)} deg`);

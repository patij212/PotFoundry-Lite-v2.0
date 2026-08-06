// revS112AuditProbe.ts — INDEPENDENT CODE-REVIEW PROBE for S112/S113. RESEARCH ONLY, READ-ONLY.
//
// This does NOT re-derive the target set. It reads the PINNED S113 ndjson (which carries tri1[9]/tri2[9]
// and area1/area2 per row) and recomputes PER-FACET what S112/S113 recorded only as a PAIR MAXIMUM.
// Every number below is a within-set comparison of two estimators on the SAME rows, so it prices the
// estimator, not the population.
//
// FOUR SUSPICIONS BEING PRICED:
//  R1  REPRODUCTION. Do normHi/normLo recompute to the dumped values? If not, nothing else means anything.
//  R2  `drop = max_pair(normDeg @0.05) / max_pair(normDeg @0)` mixes two maxima that may be attained on
//      DIFFERENT facets. Measure the swap rate and how membership moves under a per-facet drop.
//  R3  P3's `normMax - spreadMax` is a difference of two independently-taken pair maxima, hence
//      <= the excess of the facet attaining the norm max. Measure both, count + AREA-weighted.
//  R4  spreadRad's k-dependence (the printed k-ladder shows spreadDeg p90 99.5 -> 81.6 -> 65.8 at
//      k=4/8/16 while normDeg is flat). Re-measure on this exact set, count + AREA-weighted.
//
// Usage: bash research/tools/run-rev-s112-audit.sh
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { orientOfFacet, fdNormals, fdNormalsCentral } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const NDJSON = process.env.PF_REV_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const STYLE = process.env.PF_REV_STYLE ?? 'GothicArches';
const LIMIT = Math.round(envF('PF_REV_LIMIT', 0));
const DIMS: StyleDims = { H: envF('PF_REV_H', 120), Rb: envF('PF_REV_RB', 40), Rt: envF('PF_REV_RT', 50), expn: 1 };
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
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

type Row = {
  e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number;
  spread1: number; spread2: number; area1: number; area2: number;
  tri1: number[]; tri2: number[]; onEdge: boolean; onSeg: boolean;
};
const raw = readFileSync(NDJSON, 'utf8').split('\n').filter((s) => s.length > 2);
const rows: Row[] = (LIMIT > 0 ? raw.slice(0, LIMIT) : raw).map((s) => JSON.parse(s) as Row);

/** per-facet ruler on a dumped tri[9], replicating s113's theta unwrap EXACTLY. */
function orientTri(t: number[], k: number, inset: number): { normDeg: number; spreadDeg: number } {
  const ath = Math.atan2(t[1], t[0]);
  const bth = ath + dThRaw(ath, Math.atan2(t[4], t[3]));
  const cth = ath + dThRaw(ath, Math.atan2(t[7], t[6]));
  const o = orientOfFacet(nsKink, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], ath, bth, cth,
    { k, inset, scratch });
  return { normDeg: o.normDeg, spreadDeg: (o.spreadRad * 180) / Math.PI };
}

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
/** area-weighted quantile: w[i] is the weight of v[i]. */
const qw = (v: number[], w: number[], p: number): number => {
  const idx = v.map((_, i) => i).filter((i) => Number.isFinite(v[i]));
  idx.sort((a, b) => v[a] - v[b]);
  let tot = 0; for (const i of idx) tot += w[i];
  let acc = 0;
  for (const i of idx) { acc += w[i]; if (acc >= p * tot) return v[i]; }
  return idx.length === 0 ? NaN : v[idx[idx.length - 1]];
};

log('===== REV — INDEPENDENT AUDIT PROBE of S112/S113 (recompute PER FACET from the pinned dump) =====');
log(`ndjson ${NDJSON}   rows ${rows.length}`);
log('');

// ── R1 REPRODUCTION ────────────────────────────────────────────────────────────────────────────────
const n1Hi: number[] = []; const n2Hi: number[] = []; const n1Lo: number[] = []; const n2Lo: number[] = [];
const s1: number[] = []; const s2: number[] = [];
for (const r of rows) {
  const a = orientTri(r.tri1, 8, 0.05); const b = orientTri(r.tri2, 8, 0.05);
  const al = orientTri(r.tri1, 8, 0); const bl = orientTri(r.tri2, 8, 0);
  n1Hi.push(a.normDeg); n2Hi.push(b.normDeg); n1Lo.push(al.normDeg); n2Lo.push(bl.normDeg);
  s1.push(a.spreadDeg); s2.push(b.spreadDeg);
}
let maxErrHi = 0; let maxErrLo = 0; let maxErrSp = 0;
for (let i = 0; i < rows.length; i += 1) {
  maxErrHi = Math.max(maxErrHi, Math.abs(Math.max(n1Hi[i], n2Hi[i]) - rows[i].normHi));
  maxErrLo = Math.max(maxErrLo, Math.abs(Math.max(n1Lo[i], n2Lo[i]) - rows[i].normLo));
  maxErrSp = Math.max(maxErrSp, Math.abs(s1[i] - rows[i].spread1), Math.abs(s2[i] - rows[i].spread2));
}
log('── R1 REPRODUCTION (a control: if this fails, ignore everything below) ──');
log(`  MAX |recomputed - dumped|:  normHi ${maxErrHi.toExponential(2)} deg   normLo ${maxErrLo.toExponential(2)} deg   spread ${maxErrSp.toExponential(2)} deg`);
log(`  ${maxErrHi < 1e-9 && maxErrLo < 1e-9 && maxErrSp < 1e-9 ? '[PASS] byte-for-byte reproduction of the pinned dump.' : '*** REPRODUCTION FAILED — this probe is not measuring the same thing. VOID. ***'}`);
log('');

// ── R2 THE `drop` ARGMAX SWAP ──────────────────────────────────────────────────────────────────────
let swap = 0;
const dropPair: number[] = []; const dropArg: number[] = []; const dropMin: number[] = []; const dropMax: number[] = [];
for (let i = 0; i < rows.length; i += 1) {
  const argHi = n1Hi[i] >= n2Hi[i] ? 1 : 2;
  const argLo = n1Lo[i] >= n2Lo[i] ? 1 : 2;
  if (argHi !== argLo) swap += 1;
  const nHi = Math.max(n1Hi[i], n2Hi[i]); const nLo = Math.max(n1Lo[i], n2Lo[i]);
  dropPair.push(nLo > 1e-9 ? nHi / nLo : 1);
  // per-facet drop of the facet that attains the HI max (the one the pair statistic is about)
  const dA = argHi === 1 ? (n1Lo[i] > 1e-9 ? n1Hi[i] / n1Lo[i] : 1) : (n2Lo[i] > 1e-9 ? n2Hi[i] / n2Lo[i] : 1);
  dropArg.push(dA);
  const d1 = n1Lo[i] > 1e-9 ? n1Hi[i] / n1Lo[i] : 1;
  const d2 = n2Lo[i] > 1e-9 ? n2Hi[i] / n2Lo[i] : 1;
  dropMin.push(Math.min(d1, d2)); dropMax.push(Math.max(d1, d2));
}
log('── R2 `drop` IS A RATIO OF TWO PAIR-MAXIMA THAT MAY SIT ON DIFFERENT FACETS ──');
log(`  argmax(normDeg@0.05) != argmax(normDeg@0):  ${swap} / ${rows.length} = ${((100 * swap) / rows.length).toFixed(2)}%`);
log(`  pair drop        p10 ${q(dropPair, 0.1).toFixed(3)}  p50 ${q(dropPair, 0.5).toFixed(3)}  p90 ${q(dropPair, 0.9).toFixed(3)}`);
log(`  per-facet drop (facet attaining normHi)  p10 ${q(dropArg, 0.1).toFixed(3)}  p50 ${q(dropArg, 0.5).toFixed(3)}  p90 ${q(dropArg, 0.9).toFixed(3)}`);
log(`  per-facet drop MIN over the pair         p10 ${q(dropMin, 0.1).toFixed(3)}  p50 ${q(dropMin, 0.5).toFixed(3)}  p90 ${q(dropMin, 0.9).toFixed(3)}`);
// membership: how many of the PINNED rows survive a per-facet straddling test?
const surviveArg = dropArg.filter((x, i) => x >= 0.25 && Math.max(n1Hi[i], n2Hi[i]) > 10).length;
const surviveBoth = rows.filter((_, i) => {
  const d1 = n1Lo[i] > 1e-9 ? n1Hi[i] / n1Lo[i] : 1; const d2 = n2Lo[i] > 1e-9 ? n2Hi[i] / n2Lo[i] : 1;
  return (d1 >= 0.25 && n1Hi[i] > 10) || (d2 >= 0.25 && n2Hi[i] > 10);
}).length;
log(`  MEMBERSHIP under a PER-FACET straddling test, on the pinned 3,282:`);
log(`    facet-attaining-normHi rule:  ${surviveArg} survive (${((100 * surviveArg) / rows.length).toFixed(2)}%)`);
log(`    either-facet rule:            ${surviveBoth} survive (${((100 * surviveBoth) / rows.length).toFixed(2)}%)`);
log('');

// ── R3 P3's MAX-MINUS-MAX vs THE PER-FACET EXCESS ──────────────────────────────────────────────────
const exPair: number[] = []; const exFacet: number[] = []; const exArea: number[] = [];
const exF: number[] = []; const wF: number[] = [];
for (let i = 0; i < rows.length; i += 1) {
  const nM = Math.max(n1Hi[i], n2Hi[i]); const sM = Math.max(s1[i], s2[i]);
  exPair.push(nM - sM);
  exFacet.push(Math.max(n1Hi[i] - s1[i], n2Hi[i] - s2[i]));
  exArea.push(rows[i].area1 + rows[i].area2);
  exF.push(n1Hi[i] - s1[i]); wF.push(rows[i].area1);
  exF.push(n2Hi[i] - s2[i]); wF.push(rows[i].area2);
}
log('── R3 P3 (`normMax - spreadMax`) vs THE PER-FACET EXCESS — SAME ROWS, TWO ESTIMATORS ──');
log(`  PAIR  normMax - spreadMax   p10 ${q(exPair, 0.1).toFixed(3)}  p50 ${q(exPair, 0.5).toFixed(3)}  p90 ${q(exPair, 0.9).toFixed(2)} deg   (what S112 published)`);
log(`  FACET max_i(norm_i - spr_i) p10 ${q(exFacet, 0.1).toFixed(3)}  p50 ${q(exFacet, 0.5).toFixed(3)}  p90 ${q(exFacet, 0.9).toFixed(2)} deg`);
log(`  FACET, every facet, AREA-weighted  p10 ${qw(exF, wF, 0.1).toFixed(3)}  p50 ${qw(exF, wF, 0.5).toFixed(3)}  p90 ${qw(exF, wF, 0.9).toFixed(2)} deg`);
log(`  FACET, every facet, COUNT-weighted p10 ${q(exF, 0.1).toFixed(3)}  p50 ${q(exF, 0.5).toFixed(3)}  p90 ${q(exF, 0.9).toFixed(2)} deg`);
log(`  ratio of medians FACET/PAIR = ${(q(exFacet, 0.5) / Math.max(1e-9, q(exPair, 0.5))).toFixed(2)}x`);
log('');

// ── R3b THE AREA THE PAIR RULE CREDITS TO THE CLASS ────────────────────────────────────────────────
// `areaOf` sums the UNIQUE facets of the admitted ROWS — which is f1 AND f2 of every pair. If only one
// facet of a pair actually straddles, the partner's area is credited to the straddling class anyway.
{
  const uniq = new Map<number, { area: number; hi: number; lo: number }>();
  for (let i = 0; i < rows.length; i += 1) {
    if (!uniq.has(rows[i].f1)) uniq.set(rows[i].f1, { area: rows[i].area1, hi: n1Hi[i], lo: n1Lo[i] });
    if (!uniq.has(rows[i].f2)) uniq.set(rows[i].f2, { area: rows[i].area2, hi: n2Hi[i], lo: n2Lo[i] });
  }
  let aTot = 0; let aStrad = 0; let nStrad = 0;
  for (const v of uniq.values()) {
    aTot += v.area;
    const dr = v.lo > 1e-9 ? v.hi / v.lo : 1;
    if (dr >= 0.25 && v.hi > 10) { aStrad += v.area; nStrad += 1; }
  }
  log('── R3b THE AREA THE PAIR RULE CREDITS TO THE STRADDLING CLASS ──');
  log(`  unique facets in the pinned set        ${uniq.size}   AREA ${aTot.toFixed(3)} mm2  (dump meta: 6193 / 69.826 mm2)`);
  log(`  ... that INDIVIDUALLY pass drop>=0.25 AND normHi>10:  ${nStrad} (${((100 * nStrad) / uniq.size).toFixed(2)}%)   AREA ${aStrad.toFixed(3)} mm2 (${((100 * aStrad) / aTot).toFixed(2)}%)`);
  log(`  => per-facet straddling area as % of the 38453.259 mm2 mesh: ${((100 * aStrad) / 38453.25863710511).toFixed(4)}%   (published pair figure 0.1816%)`);
  log('');
}

// ── R4 spreadRad's k-DEPENDENCE ON THIS EXACT SET ──────────────────────────────────────────────────
log('── R4 IS `spreadRad` CONVERGED IN LATTICE ORDER k? (normDeg is; the printed ladder says spread is not) ──');
let prevSp = NaN;
for (const kk of [4, 8, 16, 32, 64]) {
  const sub = kk >= 64 ? rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 400)) === 0) : rows;
  const nd: number[] = []; const sp: number[] = []; const spF: number[] = []; const spW: number[] = [];
  for (const r of sub) {
    const a = orientTri(r.tri1, kk, 0.05); const b = orientTri(r.tri2, kk, 0.05);
    nd.push(Math.max(a.normDeg, b.normDeg)); sp.push(Math.max(a.spreadDeg, b.spreadDeg));
    spF.push(a.spreadDeg); spW.push(r.area1); spF.push(b.spreadDeg); spW.push(r.area2);
  }
  const s50 = q(sp, 0.5);
  log(`  k=${String(kk).padStart(2)} n=${String(sub.length).padStart(5)}  normDeg p50 ${q(nd, 0.5).toFixed(3).padStart(8)} p90 ${q(nd, 0.9).toFixed(3).padStart(8)}   spreadDeg(pair max) p50 ${s50.toFixed(3).padStart(8)} p90 ${q(sp, 0.9).toFixed(3).padStart(8)}   AREA-wtd p50 ${qw(spF, spW, 0.5).toFixed(3).padStart(8)}   ratio-to-prev ${Number.isFinite(prevSp) ? (s50 / prevSp).toFixed(3) : '  --  '}`);
  prevSp = s50;
}
log('  [a k^-1/2 law (0.707 per doubling) is the signature of a quantity carried by the O(1/k) lattice');
log('   points whose FINITE-DIFFERENCE STENCIL straddles the crease — i.e. an h-dependent artefact, which');
log('   is exactly what orientRuler documents for kinkRad and explicitly denies for spreadRad.]');
log('');

// ── R4b SEPARATOR: is the k-decay caused by the MULTI-CANDIDATE sampler, or by the lattice itself? ──
// fdNormalsCentral writes exactly ONE candidate per lattice point, so spreadRad then measures pure
// normal-field variation over the footprint with no stencil-straddle term. If the decay VANISHES there,
// the multi-candidate sampler is the cause; if it persists, the unweighted lattice average is.
{
  const nsC = fdNormalsCentral(rA, H, 2e-4, 2e-4);
  const orientC = (t: number[], k: number): number => {
    const ath = Math.atan2(t[1], t[0]);
    const bth = ath + dThRaw(ath, Math.atan2(t[4], t[3]));
    const cth = ath + dThRaw(ath, Math.atan2(t[7], t[6]));
    const o = orientOfFacet(nsC, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], ath, bth, cth,
      { k, inset: 0.05, scratch });
    return (o.spreadRad * 180) / Math.PI;
  };
  const subC = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 400)) === 0);
  log('── R4b SEPARATOR: spreadDeg under a SINGLE-candidate sampler (fdNormalsCentral), same footprints ──');
  let prev = NaN;
  for (const kk of [4, 8, 16, 32]) {
    const sp = subC.map((r) => Math.max(orientC(r.tri1, kk), orientC(r.tri2, kk)));
    const s50 = q(sp, 0.5);
    log(`  k=${String(kk).padStart(2)} n=${subC.length}  spreadDeg p50 ${s50.toFixed(3).padStart(8)} p90 ${q(sp, 0.9).toFixed(3).padStart(8)}   ratio-to-prev ${Number.isFinite(prev) ? (s50 / prev).toFixed(3) : '  --  '}`);
    prev = s50;
  }
  log('');
}

// ── R5 COUNT vs AREA on the P1 ratio, on this set ──────────────────────────────────────────────────
const ratF: number[] = []; const ratW: number[] = [];
for (let i = 0; i < rows.length; i += 1) {
  if (n1Hi[i] > 1e-9) { ratF.push(s1[i] / n1Hi[i]); ratW.push(rows[i].area1); }
  if (n2Hi[i] > 1e-9) { ratF.push(s2[i] / n2Hi[i]); ratW.push(rows[i].area2); }
}
const ratPair = rows.map((_, i) => Math.max(s1[i], s2[i]) / Math.max(1e-9, Math.max(n1Hi[i], n2Hi[i])));
log('── R5 P1 RATIO: pair-max-of-max vs per-facet, COUNT vs AREA (this set only) ──');
log(`  pair  spreadMax/normMax   p10 ${q(ratPair, 0.1).toFixed(3)}  p50 ${q(ratPair, 0.5).toFixed(3)}  p90 ${q(ratPair, 0.9).toFixed(3)}`);
log(`  facet spread_i/norm_i  COUNT  p10 ${q(ratF, 0.1).toFixed(3)}  p50 ${q(ratF, 0.5).toFixed(3)}  p90 ${q(ratF, 0.9).toFixed(3)}`);
log(`  facet spread_i/norm_i  AREA   p10 ${qw(ratF, ratW, 0.1).toFixed(3)}  p50 ${qw(ratF, ratW, 0.5).toFixed(3)}  p90 ${qw(ratF, ratW, 0.9).toFixed(3)}`);
log('');

// ── R6 the `normHi > 10` cut: is it inert? ─────────────────────────────────────────────────────────
const under10 = rows.filter((_, i) => Math.max(n1Hi[i], n2Hi[i]) <= 10).length;
log('── R6 IS THE STATED `normHi > 10` CUT DOING ANY WORK? ──');
log(`  rows in the PINNED set with pair normHi <= 10 deg: ${under10}  (must be 0 — it is a membership cut)`);
log(`  pair normHi p01 ${q(rows.map((_, i) => Math.max(n1Hi[i], n2Hi[i])), 0.01).toFixed(3)}  p10 ${q(rows.map((_, i) => Math.max(n1Hi[i], n2Hi[i])), 0.1).toFixed(3)} deg`);
log(`  per-facet normHi MIN over the pair: p01 ${q(rows.map((_, i) => Math.min(n1Hi[i], n2Hi[i])), 0.01).toFixed(3)}  p10 ${q(rows.map((_, i) => Math.min(n1Hi[i], n2Hi[i])), 0.1).toFixed(3)}  p50 ${q(rows.map((_, i) => Math.min(n1Hi[i], n2Hi[i])), 0.5).toFixed(3)} deg`);
log('done');

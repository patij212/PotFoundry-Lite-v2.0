// s105BandsRefine.ts — *** CONFIDENCE BANDS ON THE CAMPAIGN'S REFINEMENT MULTIPLIERS. ***
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PROVENANCE. This file is a VERBATIM COPY of `research/tools/s98QRefine.ts` (which is itself a verbatim
// copy of S93's `research/tools/frontierRefine.ts` plus the q-bin block) with exactly THREE additions,
// all default-inert:
//   (1) a PER-PARENT NDJSON dump (PF_BD_OUT), appended the instant each parent finishes — the whole
//       point of the file. Every band below is arithmetic on that dump; no re-meshing is ever needed.
//   (2) PF_BD_ANGBARS / PF_BD_TURN, which SUBSET the angle-bar list and switch off the `turn` arm.
//       Each `adapt(bar)` call is a pure deterministic function of `root` alone, so dropping one bar
//       provably cannot move another. Verified anyway (see FIDELITY below) — not asserted.
//   (3) resume-by-line-count, so a killed run restarts at the first unwritten parent.
// The one micro-change inside the loop: s98QRefine calls `adapt(angDeg > 1)` TWICE (once for ANGBARS[2],
// once for the q-bin). Here it is called once and the result reused. Same pure function, same argument.
// It is checked by the fidelity run, not assumed.
//
// FIDELITY CHECK (run it, do not assume): with PF_BD_ANGBARS/PF_BD_TURN at their defaults this file must
// reproduce `S98_QREFINE_GOTH2000.report.txt` / `S98_QREFINE_VORSHP2000.report.txt` line for line on the
// same STL/N. Then re-run at the pool settings and diff the RETAINED columns. Both diffs are printed.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DEBT THIS PAYS. Every refinement multiplier in this campaign is a POINT ESTIMATE from ONE
// golden-stride sample. The same mesh / bar / operator (GothicArches S39CTL, 10 um chord, LEPP) has been
// published at 4.69x / 5.29x / 5.50x / 6.67x / 3.12x / 10.76x / 116.89x — a 25x spread — and the campaign
// steered on the 6.67x for weeks. Part of that spread is cap and scope. The N=600 -> N=1200 move
// (5.50x -> 12.71x, 0.12% -> 25.3% uncleared) is PURE SAMPLING: ONE parent (level-0 minAngle 2.78 deg,
// slope 7.735) entering the sample, consuming 7,139 leaves, never clearing. The worst 1% of parents hold
// 74.92% of all LEPP leaves.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED HYPOTHESES AND KILL LINES  (written before the first run; analysis in s105BandsAnalyze.cjs)
//
//   THE SAMPLING DESIGN. `goldenIdx(n, C)` returns {q*s mod n : q = 0..C-1} with s coprime to n. Extend it
//   to NTOT = R*C and cut it into R CONSECUTIVE DISJOINT BLOCKS of length C. Block j is
//   {(jC+q)*s mod n} = block 0 translated by (jC*s mod n): an EXACT PHASE-TRANSLATE of the campaign's own
//   sample, same stride, same structure, different phase. The blocks are disjoint and their union is a
//   near-census. No distributional assumption is made anywhere in B1.
//
//   B1 (PRIMARY — the assumption-free band). The spread of an estimator across the R phase blocks
//        directly measures "how much would this number have moved if we had sampled differently".
//        *** KILL: if the phase-block relative half-width at the campaign's working C (400..2000) is
//        under +-10% on the headline multipliers, the debt is SMALLER than claimed and I say so plainly.
//
//   B2 (does a systematic sample behave like a random one?). Compare, at the same C:
//        SD_phase (R disjoint blocks)  vs  SD_iid = sd(pool)/sqrt(C)  vs  a naive nonparametric BOOTSTRAP
//        SD taken from ONE block (what an analyst with one sample would actually compute).
//        *** KILL: if SD_phase / SD_iid is outside [0.5, 2.0], facet index order correlates with geometry
//        and every band in this campaign needs the phase-offset method, not resampling. ***
//        SECOND, PRE-REGISTERED PREDICTION: the single-block bootstrap 95% CI will COVER the pooled mean
//        less than 95% of the time (the naive bootstrap of a mean UNDER-COVERS under a heavy tail: it can
//        only resample atoms it has already seen). Measured as an empirical coverage over the R blocks.
//
//   B3 (the required-N curve). For each headline quantity, the smallest C on the ladder
//        {50,100,200,400,800,1600,3200,...} whose phase-block 95% interval half-width is <= 10% relative.
//        Reported SEPARATELY for leaves/parent (tail-dominated) and uncleared% (a proportion) — they are
//        expected to differ by a lot and conflating them would be the same error the campaign already made.
//
//   B4 (variance reduction). Post-stratify on a level-0 covariate that is cheap for the WHOLE population
//        (q = 2*sqrt(area)/e_max and diam are FREE from the STL; slope = hypot(r_th/r, r_z) is 5 rA evals;
//        the level-0 covering chord is 225). ESS gain = Var_SRS / Var_strat under proportional and Neyman
//        allocation, with sigma_h fit on one half of the pool and EVALUATED on the other (no in-sample
//        optimism). *** KILL: < 2x effective-sample-size gain => not worth the complexity, say so. ***
//
//   H1-OVERLAP (the deliverable that matters most; s105BandsCone.ts carries it).
//        H1 was REFUTED on a 1.35x ratio (Gothic scoped lepp 3.120x vs cone 4.211x) and a 1.86x ratio
//        (Voronoi lepp 8.650x vs cone 16.076x). *** KILL: if the 95% phase-block interval for cone/lepp
//        contains 1.000, the refutation is NOT established at that N and must be re-stated. ***
//
//   THE MEAN IS THE RIGHT FUNCTIONAL AND IS NOT SUBSTITUTED. total triangles = (total facets) x (mean
//   leaves/parent). A median or trimmed mean would be better behaved and would answer a DIFFERENT
//   question. Robust statistics are reported ALONGSIDE and labelled as different quantities, never
//   instead of.
//
// RULER: `orient:'outward'` sign fix `5698d023` is NOT in frontierRefine's inline `score` (it signs from
// `f_xy . centroid_xy`). This file keeps that convention BYTE-FOR-BYTE because its whole job is to band the
// numbers the campaign published, which were taken on it. `s105BandsCone.ts` carries the 5698d023
// convention because s94ConeRefine does. Every table states which. They are NOT interchangeable.
//
// Usage:  bash research/tools/run-s105-bands-refine.sh
//   env (inherited, unchanged): PF_FD_STYLE PF_FD_STL PF_FD_TAG PF_FD_N PF_FD_K PF_FD_INSET PF_FD_BAR_UM
//                               PF_FD_MAXLEV PF_FD_UNILEV PF_FD_H/RB/RT PF_FD_NULL PF_FD_SKIPFOLD
//   env (new):                  PF_BD_OUT (ndjson path) PF_BD_ANGBARS ("10,5,1,0.5") PF_BD_TURN (1)
//                               PF_BD_RESUME (1)

import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_FD_STYLE ?? 'GothicArches';
const STL = process.env.PF_FD_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_FD_TAG ?? 'S39CTL';
const NSAMP = Math.round(envF('PF_FD_N', 2000));
const K = Math.round(envF('PF_FD_K', 8));
const INSET = envF('PF_FD_INSET', 0.02);
const BAR_UM = envF('PF_FD_BAR_UM', 10);
const MAXLEV = Math.round(envF('PF_FD_MAXLEV', 8));
/** the UNIFORM sweep is 4^L triangles per parent — it is the expensive one and only needs to show a RATE. */
const UNILEV = Math.round(envF('PF_FD_UNILEV', 3));
const NULLARM = process.env.PF_FD_NULL === '1';
const SKIPFOLD = process.env.PF_FD_SKIPFOLD === '1';
const DIMS: StyleDims = { H: envF('PF_FD_H', 120), Rb: envF('PF_FD_RB', 40), Rt: envF('PF_FD_RT', 50), expn: 1 };
const H = DIMS.H;

// ── S105 ADDITIONS (all default-inert) ─────────────────────────────────────────────────────────
const OUTND = process.env.PF_BD_OUT ?? '';
const DOTURN = (process.env.PF_BD_TURN ?? '1') === '1';
const ANGBARS = (process.env.PF_BD_ANGBARS ?? '10,5,1,0.5').split(',').map(Number).filter((x) => x > 0);
const RESUME = (process.env.PF_BD_RESUME ?? '1') === '1';
// ───────────────────────────────────────────────────────────────────────────────────────────────

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

const T0 = Date.now();
mkdirSync('research/exchange/_strataConformBisect/frontier', { recursive: true });
log('===== FRONTIER REFINE — DOES THE ORIENTATION CHORD CONVERGE, AND WHAT DOES THE BAR COST? =====');
log(`style ${STYLE}  tag ${TAG}  bar ${BAR_UM} um  covering k=${K} inset=${INSET}  uniformLevels ${UNILEV}  adaptiveMax ${MAXLEV}${NULLARM ? '  *** NULL ARM ***' : ''}`);
log(`STL ${STL}`);
log(`S105 pool: ndjson '${OUTND}'  angBars [${ANGBARS.join(',')}]  turn ${DOTURN ? 'ON' : 'OFF'}  resume ${RESUME ? 'ON' : 'OFF'}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`mesh ${nTri} facets  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}
const idx = goldenIdx(nTri, NSAMP);
const NS = idx.length;
log(`sample ${NS} parents (${((100 * NS) / nTri).toFixed(3)}%), golden stride`);

/** S105: resume. Count already-written records; the run restarts at the first unwritten SEQUENCE index. */
let QSTART = 0;
if (OUTND !== '' && RESUME && existsSync(OUTND)) {
  // *** RESUME MUST READ THE LAST RECORD'S `q`, NOT THE LINE COUNT. *** Zero-area / SKIPFOLD parents are
  // dropped, so line count != sequence index; a line-count resume would re-walk and DUPLICATE rows.
  const txt = readFileSync(OUTND, 'utf8');
  const lines = txt.split('\n').filter((l) => l.length > 2);
  let lastQ = -1;
  for (let i = lines.length - 1; i >= 0 && lastQ < 0; i -= 1) {
    try { lastQ = (JSON.parse(lines[i]) as { q: number }).q; } catch { lastQ = -1; }
  }
  QSTART = lastQ + 1;
  log(`S105 RESUME: ${lines.length} records present, last sequence index ${lastQ}, restarting at ${QSTART}`);
}

const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const sc = INSET / 3;
  let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + sc; const b = sh * (j / K) + sc;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}
const HARC = 2e-4; const HZ = 2e-4;

/** lift a parameter point onto the surface. THIS IS THE MESHER'S OWN `addV` CONTRACT. */
function lift(th: number, z: number): [number, number, number] {
  const r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

interface Score { chordUm: number; area: number; dPerpUm: number; angDeg: number; }
/** covering chord + position proxy for one triangle given 3D coords AND unwrapped params. */
function score(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
  ath: number, bth: number, cth: number,
): Score {
  const eA = Math.hypot(bx - cx, by - cy, bz - cz);
  const eB = Math.hypot(ax - cx, ay - cy, az - cz);
  const eC = Math.hypot(ax - bx, ay - by, az - bz);
  const diam = Math.max(eA, eB, eC);
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const area = 0.5 * fl;
  if (!(fl > 0)) return { chordUm: 0, area: 0, dPerpUm: 0, angDeg: 0 };
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  let best = -1; let dPerpMax = 0;
  for (let p = 0; p < LP; p += 1) {
    const th = wA[p] * ath + wB[p] * bth + wC[p] * cth;
    const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const r0 = rA(th, zz);
    const hTh = HARC / Math.max(1e-9, Math.abs(r0));
    let zLo = zz - HZ; let zHi = zz + HZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
    const rt = (rA(th + hTh, zz) - rA(th - hTh, zz)) / (2 * hTh);
    const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
    const c = Math.cos(th); const s = Math.sin(th);
    let vx = rt * s + r0 * c; let vy = r0 * s - rt * c; let vz = -r0 * rz;
    const L = Math.hypot(vx, vy, vz) || 1; vx /= L; vy /= L; vz /= L;
    let d = fx * vx + fy * vy + fz * vz; d = d > 1 ? 1 : d < -1 ? -1 : d;
    const a = Math.acos(d);
    if (a > best) best = a;
    const px = wA[p] * ax + wB[p] * bx + wC[p] * cx;
    const py = wA[p] * ay + wB[p] * by + wC[p] * cy;
    const pz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const dp = Math.abs((px - r0 * c) * vx + (py - r0 * s) * vy + (pz - zz) * vz);
    if (dp > dPerpMax) dPerpMax = dp;
  }
  return { chordUm: 2 * Math.sin(0.5 * best) * diam * 1000, area, dPerpUm: dPerpMax * 1000, angDeg: (best * 180) / Math.PI };
}

// ── level-by-level UNIFORM refinement (H-D) and ADAPTIVE refinement (H-E), one pass ──
const LEVAREA = new Float64Array(UNILEV + 1);       // total leaf area at each uniform level
const LEVOVER = new Float64Array(UNILEV + 1);       // over-bar leaf area at each uniform level
const LEVCHORD = new Float64Array(UNILEV + 1);      // area-weighted mean chord
const LEVMAX = new Float64Array(UNILEV + 1);
const LEVOVERP = new Float64Array(UNILEV + 1);      // over-bar-by-POSITION-proxy leaf area
const LEVANG = new Float64Array(UNILEV + 1);       // area-weighted mean sup ANGLE, deg
const LEVANGMAX = new Float64Array(UNILEV + 1);
let adaptTrisOrient = 0; let adaptTrisPos = 0; let adaptUncleared = 0; let adaptUnclearedPos = 0;
let nSkipped = 0;
let leppTris = 0; let leppUnc = 0; let leppAngSum = 0; let leppAngMin = 180;
let turnTris = 0; let turnUnc = 0; let turnAngSum = 0; let turnAngMin = 180;
/** unit surface normal at a parameter point, 5 rA evals — used by the 'turn' bisection key. */
function surfNormal(th: number, z: number): [number, number, number] {
  const r0 = rA(th, z);
  const hT = HARC / Math.max(1e-9, Math.abs(r0));
  let zl = z - HZ; let zh = z + HZ;
  if (zl < 0) { zl = 0; zh = Math.min(H, 2 * HZ); }
  if (zh > H) { zh = H; zl = Math.max(0, H - 2 * HZ); }
  const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
  const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
  const c = Math.cos(th); const s2 = Math.sin(th);
  let ax = rt * s2 + r0 * c; let ay = r0 * s2 - rt * c; let az = -r0 * rz;
  const L = Math.hypot(ax, ay, az) || 1;
  return [ax / L, ay / L, az / L];
}
const adaptTrisAng = new Float64Array(ANGBARS.length);
const adaptUnclearedAng = new Float64Array(ANGBARS.length);
let parentArea = 0; let vertResidMax = 0;
let nParents = 0;

interface Tri { x: number[]; y: number[]; z: number[]; th: number[]; }
function children(t: Tri): Tri[] {
  const mid = (i: number, j: number): { x: number; y: number; z: number; th: number } => {
    const th = 0.5 * (t.th[i] + t.th[j]); const zz = 0.5 * (t.z[i] + t.z[j]);
    if (NULLARM) {
      return { x: 0.5 * (t.x[i] + t.x[j]), y: 0.5 * (t.y[i] + t.y[j]), z: zz, th };
    }
    const [X, Y, Z] = lift(th, zz);
    return { x: X, y: Y, z: Z, th };
  };
  const m01 = mid(0, 1); const m12 = mid(1, 2); const m20 = mid(2, 0);
  const mk = (a: { x: number; y: number; z: number; th: number },
    b: { x: number; y: number; z: number; th: number },
    c: { x: number; y: number; z: number; th: number }): Tri =>
    ({ x: [a.x, b.x, c.x], y: [a.y, b.y, c.y], z: [a.z, b.z, c.z], th: [a.th, b.th, c.th] });
  const V = (i: number): { x: number; y: number; z: number; th: number } =>
    ({ x: t.x[i], y: t.y[i], z: t.z[i], th: t.th[i] });
  return [mk(V(0), m01, m20), mk(m01, V(1), m12), mk(m20, m12, V(2)), mk(m01, m12, m20)];
}
const sc = (t: Tri): Score => score(t.x[0], t.y[0], t.z[0], t.x[1], t.y[1], t.z[1], t.x[2], t.y[2], t.z[2],
  t.th[0], t.th[1], t.th[2]);

// ── S98 ADDITION (kept verbatim): per-parent shape bins ────────────────────────────────────────
const QEDGE = [0, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4];
const QN = QEDGE.length;
const qParents = new Float64Array(QN); const qTris = new Float64Array(QN);
const qUnc = new Float64Array(QN); const qArea = new Float64Array(QN);
const qUncAng1 = new Float64Array(QN); const qTrisAng1 = new Float64Array(QN);
const qBin = (v: number): number => { let b = 0; for (let i = 0; i < QN; i += 1) if (v >= QEDGE[i]) b = i; return b; };
// ───────────────────────────────────────────────────────────────────────────────────────────────
const ANG1IDX = ANGBARS.indexOf(1);
let ndBuf = '';
for (let q = QSTART; q < NS; q += 1) {
  const o = idx[q] * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  // vertex-on-surface control
  for (const [vx2, vy2, vz2, tv] of [[ax, ay, az, thA], [bx, by, bz, thB], [cx, cy, cz, thC]] as const) {
    const d = Math.abs(Math.hypot(vx2, vy2) - rA(tv, vz2));
    if (d > vertResidMax) vertResidMax = d;
  }
  const root: Tri = { x: [ax, bx, cx], y: [ay, by, cy], z: [az, bz, cz], th: [thA, thB, thC] };
  const s0 = sc(root);
  if (!(s0.area > 0)) continue;
  if (SKIPFOLD && s0.angDeg > 90) { nSkipped += 1; continue; }
  nParents += 1; parentArea += s0.area;

  // uniform levels
  const uniA: number[] = []; const uniO: number[] = []; const uniOP: number[] = []; const uniC: number[] = []; const uniG: number[] = [];
  let cur: Tri[] = [root];
  for (let lev = 0; lev <= UNILEV; lev += 1) {
    if (lev > 0) { const nx: Tri[] = []; for (const t of cur) nx.push(...children(t)); cur = nx; }
    let aTot = 0; let aOver = 0; let cWeighted = 0; let mx = 0; let aOverP = 0;
    let angW = 0; let angMx = 0;
    for (const t of cur) {
      const s = sc(t);
      aTot += s.area; cWeighted += s.chordUm * s.area; angW += s.angDeg * s.area;
      if (s.chordUm > BAR_UM) aOver += s.area;
      if (s.dPerpUm > BAR_UM) aOverP += s.area;
      if (s.chordUm > mx) mx = s.chordUm;
      if (s.angDeg > angMx) angMx = s.angDeg;
    }
    LEVAREA[lev] += aTot; LEVOVER[lev] += aOver; LEVCHORD[lev] += cWeighted;
    LEVOVERP[lev] += aOverP; LEVANG[lev] += angW;
    if (mx > LEVMAX[lev]) LEVMAX[lev] = mx;
    if (angMx > LEVANGMAX[lev]) LEVANGMAX[lev] = angMx;
    uniA.push(aTot); uniO.push(aOver); uniOP.push(aOverP); uniC.push(cWeighted); uniG.push(angW);
  }

  // adaptive: split only what is still over bar. Two independent runs, one per bar.
  const adapt = (bar: (s: Score) => boolean): { tris: number; uncleared: number } => {
    let tris = 0; let uncleared = 0;
    const stack: Array<[Tri, number]> = [[root, 0]];
    while (stack.length > 0) {
      const [t, lev] = stack.pop() as [Tri, number];
      const s = sc(t);
      if (!bar(s) || lev >= MAXLEV) { tris += 1; if (bar(s)) uncleared += 1; continue; }
      for (const ch of children(t)) stack.push([ch, lev + 1]);
    }
    return { tris, uncleared };
  };
  const ao = adapt((s) => s.chordUm > BAR_UM);
  const ap = adapt((s) => s.dPerpUm > BAR_UM);
  adaptTrisOrient += ao.tris; adaptUncleared += ao.uncleared;
  adaptTrisPos += ap.tris; adaptUnclearedPos += ap.uncleared;
  const bisect = (t: Tri, mode: 'lepp' | 'turn'): Tri[] => {
    let bi = 0; let bv = -1;
    for (let u = 0; u < 3; u += 1) {
      const v = (u + 1) % 3;
      let m: number;
      if (mode === 'lepp') {
        m = Math.hypot(t.x[v] - t.x[u], t.y[v] - t.y[u], t.z[v] - t.z[u]);
      } else {
        const n0 = surfNormal(t.th[u], t.z[u]); const n1 = surfNormal(t.th[v], t.z[v]);
        let d = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
        d = d > 1 ? 1 : d < -1 ? -1 : d;
        m = Math.acos(d);
      }
      if (m > bv) { bv = m; bi = u; }
    }
    const u = bi; const v = (bi + 1) % 3; const w = (bi + 2) % 3;
    const thm = 0.5 * (t.th[u] + t.th[v]); const zm = 0.5 * (t.z[u] + t.z[v]);
    const [mx, my, mz] = NULLARM
      ? [0.5 * (t.x[u] + t.x[v]), 0.5 * (t.y[u] + t.y[v]), zm] : lift(thm, zm);
    return [
      { x: [t.x[u], mx, t.x[w]], y: [t.y[u], my, t.y[w]], z: [t.z[u], zm, t.z[w]], th: [t.th[u], thm, t.th[w]] },
      { x: [mx, t.x[v], t.x[w]], y: [my, t.y[v], t.y[w]], z: [zm, t.z[v], t.z[w]], th: [thm, t.th[v], t.th[w]] },
    ];
  };
  const adaptBisect = (mode: 'lepp' | 'turn'): { tris: number; unc: number; minAngSum: number; minAngMin: number } => {
    let tris = 0; let unc = 0; let minAngSum = 0; let minAngMin = 180;
    const stack: Array<[Tri, number]> = [[root, 0]];
    while (stack.length > 0) {
      const [t, lev] = stack.pop() as [Tri, number];
      const s = sc(t);
      if (!(s.chordUm > BAR_UM) || lev >= 2 * MAXLEV) {
        tris += 1; if (s.chordUm > BAR_UM) unc += 1;
        const e0 = Math.hypot(t.x[1] - t.x[2], t.y[1] - t.y[2], t.z[1] - t.z[2]);
        const e1 = Math.hypot(t.x[0] - t.x[2], t.y[0] - t.y[2], t.z[0] - t.z[2]);
        const e2 = Math.hypot(t.x[0] - t.x[1], t.y[0] - t.y[1], t.z[0] - t.z[1]);
        const lo = Math.min(e0, e1, e2); const hi = Math.max(e0, e1, e2); const mi = e0 + e1 + e2 - lo - hi;
        const cm = (mi * mi + hi * hi - lo * lo) / Math.max(1e-300, 2 * mi * hi);
        const ma = (Math.acos(Math.max(-1, Math.min(1, cm))) * 180) / Math.PI;
        minAngSum += ma; if (ma < minAngMin) minAngMin = ma;
        continue;
      }
      for (const ch of bisect(t, mode)) stack.push([ch, lev + 1]);
    }
    return { tris, unc, minAngSum, minAngMin };
  };
  const bl = adaptBisect('lepp');
  const bt = DOTURN ? adaptBisect('turn') : { tris: 0, unc: 0, minAngSum: 0, minAngMin: 180 };

  // *** THE INVARIANT BARS. *** (moved ABOVE the q-bin block so the 1-deg result can be shared)
  const angRes: Array<{ tris: number; uncleared: number }> = [];
  for (let b = 0; b < ANGBARS.length; b += 1) {
    const r = adapt((s) => s.angDeg > ANGBARS[b]);
    angRes.push(r);
    adaptTrisAng[b] += r.tris; adaptUnclearedAng[b] += r.uncleared;
  }

  // ── S98 ADDITION: bin THIS parent's lepp result by its own shape index ───────────────────────
  const qIdx = (2 * Math.sqrt(s0.area)) / Math.max(1e-300,
    Math.max(Math.hypot(root.x[1] - root.x[2], root.y[1] - root.y[2], root.z[1] - root.z[2]),
      Math.hypot(root.x[0] - root.x[2], root.y[0] - root.y[2], root.z[0] - root.z[2]),
      Math.hypot(root.x[0] - root.x[1], root.y[0] - root.y[1], root.z[0] - root.z[1])));
  {
    const b = qBin(qIdx);
    qParents[b] += 1; qTris[b] += bl.tris; qUnc[b] += bl.unc; qArea[b] += s0.area;
    // s98QRefine re-runs `adapt(angDeg > 1)` here; `adapt` is pure in `root`, so the ANGBARS result is
    // reused instead. Checked by the fidelity diff, not assumed.
    const r1 = ANG1IDX >= 0 ? angRes[ANG1IDX] : adapt((s) => s.angDeg > 1);
    qTrisAng1[b] += r1.tris; qUncAng1[b] += r1.uncleared;
  }
  // ────────────────────────────────────────────────────────────────────────────────────────────
  leppTris += bl.tris; leppUnc += bl.unc; leppAngSum += bl.minAngSum; if (bl.minAngMin < leppAngMin) leppAngMin = bl.minAngMin;
  turnTris += bt.tris; turnUnc += bt.unc; turnAngSum += bt.minAngSum; if (bt.minAngMin < turnAngMin) turnAngMin = bt.minAngMin;

  // ── S105 ADDITION: the per-parent record. Appended the instant it is computed. ───────────────
  if (OUTND !== '') {
    // level-0 covariates a stratifier could actually have BEFORE refining.
    const e0 = Math.hypot(root.x[1] - root.x[2], root.y[1] - root.y[2], root.z[1] - root.z[2]);
    const e1 = Math.hypot(root.x[0] - root.x[2], root.y[0] - root.y[2], root.z[0] - root.z[2]);
    const e2 = Math.hypot(root.x[0] - root.x[1], root.y[0] - root.y[1], root.z[0] - root.z[1]);
    const dm = Math.max(e0, e1, e2); const lo = Math.min(e0, e1, e2); const mi = e0 + e1 + e2 - lo - dm;
    const cmm = (mi * mi + dm * dm - lo * lo) / Math.max(1e-300, 2 * mi * dm);
    const mn = (Math.acos(Math.max(-1, Math.min(1, cmm))) * 180) / Math.PI;
    const th0 = (thA + thB + thC) / 3; const zz0 = (az + bz + cz) / 3;
    const r00 = rA(th0, zz0); const hT0 = HARC / Math.max(1e-9, Math.abs(r00));
    let zl0 = zz0 - HZ; let zh0 = zz0 + HZ;
    if (zl0 < 0) { zl0 = 0; zh0 = Math.min(H, 2 * HZ); }
    if (zh0 > H) { zh0 = H; zl0 = Math.max(0, H - 2 * HZ); }
    const rt0 = (rA(th0 + hT0, zz0) - rA(th0 - hT0, zz0)) / (2 * hT0);
    const rz0 = zh0 > zl0 ? (rA(th0, zh0) - rA(th0, zl0)) / (zh0 - zl0) : 0;
    const sl0 = Math.hypot(rt0 / Math.max(1e-9, r00), rz0);
    const rec = {
      q, i: idx[q],
      a0: s0.area, c0: s0.chordUm, g0: s0.angDeg, p0: s0.dPerpUm, dm, mn, qs: qIdx, sl: sl0,
      uA: uniA, uO: uniO, uP: uniOP, uC: uniC, uG: uniG,
      rT: ao.tris, rU: ao.uncleared, pT: ap.tris, pU: ap.uncleared,
      lT: bl.tris, lU: bl.unc, lS: bl.minAngSum, lm: bl.minAngMin,
      tT: bt.tris, tU: bt.unc,
      A: angRes.map((r) => [r.tris, r.uncleared]),
    };
    ndBuf += `${JSON.stringify(rec)}\n`;
    appendFileSync(OUTND, ndBuf); ndBuf = '';
  }
  // ────────────────────────────────────────────────────────────────────────────────────────────

  if ((q + 1) % 250 === 0) {
    const el = (Date.now() - T0) / 1000;
    const done = q + 1 - QSTART; const rate = done / Math.max(1e-9, el);
    log(`  ${q + 1}/${NS}  [${el.toFixed(1)}s]  ${rate.toFixed(2)} par/s  ETA ${((NS - q - 1) / Math.max(1e-9, rate) / 60).toFixed(1)} min`);
  }
}

log('');
log(`CONTROL — max |r_vertex - rA(theta,z)| over ${nParents * 3} sampled parent vertices: ${(vertResidMax * 1000).toExponential(3)} um`);
log('  (if this is not tiny, the children are being lifted onto a different surface than the parents live on)');
log('');
log('══ H-D  UNIFORM 1->4 REFINEMENT, exact surface-lifted midpoints ══');
log('  lev  leaves/par   over-bar AREA %    ratio    mean chord um   ratio   maxChord   || mean ANGLE deg  ratio   maxAng   posOver%');
log('       (chord = 2 sin(theta/2)*diam: falls under a COPLANAR split too. ANGLE is the invariant.)');
for (let lev = 0; lev <= UNILEV; lev += 1) {
  if (!(LEVAREA[lev] > 0)) continue;
  const ov = (100 * LEVOVER[lev]) / LEVAREA[lev];
  const ovp = (100 * LEVOVERP[lev]) / LEVAREA[lev];
  const mc = LEVCHORD[lev] / LEVAREA[lev];
  const pv = lev > 0 && LEVAREA[lev - 1] > 0 ? (100 * LEVOVER[lev - 1]) / LEVAREA[lev - 1] : NaN;
  const pmc = lev > 0 && LEVAREA[lev - 1] > 0 ? LEVCHORD[lev - 1] / LEVAREA[lev - 1] : NaN;
  const ma = LEVANG[lev] / LEVAREA[lev];
  const pma = lev > 0 && LEVAREA[lev - 1] > 0 ? LEVANG[lev - 1] / LEVAREA[lev - 1] : NaN;
  log(`  ${String(lev).padStart(3)}  ${String(4 ** lev).padStart(9)}   ${ov.toFixed(3).padStart(14)}  ${Number.isFinite(pv) ? (ov / Math.max(1e-12, pv)).toFixed(4).padStart(7) : '      -'}   ${mc.toFixed(4).padStart(13)}  ${Number.isFinite(pmc) ? (mc / Math.max(1e-12, pmc)).toFixed(4).padStart(6) : '     -'}   ${LEVMAX[lev].toFixed(1).padStart(8)}   || ${ma.toFixed(4).padStart(13)}  ${Number.isFinite(pma) ? (ma / Math.max(1e-12, pma)).toFixed(4).padStart(6) : '     -'}  ${LEVANGMAX[lev].toFixed(2).padStart(7)}  ${ovp.toFixed(3).padStart(8)}`);
}
log('');
log('══ H-E  ADAPTIVE COST — split only what is still over bar, cap at maxLevel ══');
log(`  ORIENTATION bar ${BAR_UM} um:  ${adaptTrisOrient} leaves for ${nParents} parents = ${(adaptTrisOrient / Math.max(1, nParents)).toFixed(2)}x triangles   (uncleared at maxLevel: ${adaptUncleared} = ${((100 * adaptUncleared) / Math.max(1, adaptTrisOrient)).toFixed(3)}%)`);
log(`  POSITION    bar ${BAR_UM} um:  ${adaptTrisPos} leaves for ${nParents} parents = ${(adaptTrisPos / Math.max(1, nParents)).toFixed(2)}x triangles   (uncleared: ${adaptUnclearedPos} = ${((100 * adaptUnclearedPos) / Math.max(1, adaptTrisPos)).toFixed(3)}%)`);
log(`  *** RATIO orientation/position triangle cost: ${(adaptTrisOrient / Math.max(1, adaptTrisPos)).toFixed(2)}x ***`);
log('');
if (SKIPFOLD) log(`  *** PF_FD_SKIPFOLD=1: ${nSkipped} of ${nSkipped + nParents} parents (${((100 * nSkipped) / Math.max(1, nSkipped + nParents)).toFixed(2)}%) EXCLUDED as back-facing (normDeg > 90 at level 0) ***`);
log('  *** THE FRONTIER ARM — three refinement OPERATORS to the same 10 um chord bar, same parents ***');
log('  (conformity ignored for all three equally, so each count is a lower bound; the RATIO is the claim)');
log(`    red  1->4 uniform-adaptive :  ${String(adaptTrisOrient).padStart(8)} leaves = ${(adaptTrisOrient / Math.max(1, nParents)).toFixed(2).padStart(7)}x   (uncleared ${((100 * adaptUncleared) / Math.max(1, adaptTrisOrient)).toFixed(2)}%)`);
log(`    lepp longest EDGE bisect   :  ${String(leppTris).padStart(8)} leaves = ${(leppTris / Math.max(1, nParents)).toFixed(2).padStart(7)}x   (uncleared ${((100 * leppUnc) / Math.max(1, leppTris)).toFixed(2)}%)  mean leaf minAngle ${(leppAngSum / Math.max(1, leppTris)).toFixed(1)} deg, worst ${leppAngMin.toFixed(2)}`);
log(`    turn longest TURN bisect   :  ${String(turnTris).padStart(8)} leaves = ${(turnTris / Math.max(1, nParents)).toFixed(2).padStart(7)}x   (uncleared ${((100 * turnUnc) / Math.max(1, turnTris)).toFixed(2)}%)  mean leaf minAngle ${(turnAngSum / Math.max(1, turnTris)).toFixed(1)} deg, worst ${turnAngMin.toFixed(2)}`);
log(`    *** turn / lepp = ${(turnTris / Math.max(1, leppTris)).toFixed(3)}x     turn / red = ${(turnTris / Math.max(1, adaptTrisOrient)).toFixed(3)}x ***`);
log('');
log('  THE INVARIANT (ANGLE) BARS — the currency CAD packages state angular deviation in:');
for (let b = 0; b < ANGBARS.length; b += 1) {
  log(`    angle <= ${String(ANGBARS[b]).padStart(4)} deg :  ${String(adaptTrisAng[b]).padStart(8)} leaves = ${(adaptTrisAng[b] / Math.max(1, nParents)).toFixed(3).padStart(8)}x triangles   (uncleared ${((100 * adaptUnclearedAng[b]) / Math.max(1, adaptTrisAng[b])).toFixed(3)}%)`);
}
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

// ── S98 ADDITION: THE BINNED TABLE ──────────────────────────────────────────────────────────────
log('');
log('══ S98 — LEPP REFINABILITY BINNED BY *PARENT SHAPE INDEX*  q = h_min/sqrt(area) ══');
log('   (equilateral q = 1.316; q -> 0 is a sliver. Same mesh, same bar, same operator: the ONLY');
log('    thing that differs between rows is the shape of the parent triangle.)');
log('');
log(`   ${'q bin'.padEnd(14)} ${'parents'.padStart(8)} ${'mesh AREA %'.padStart(12)} ${'leaves/par'.padStart(11)} ${'UNCLEARED %'.padStart(12)}  ||  ${'1deg lv/par'.padStart(11)} ${'1deg UNCL %'.padStart(12)}`);
let aTotAll = 0; for (let b = 0; b < QN; b += 1) aTotAll += qArea[b];
for (let b = 0; b < QN; b += 1) {
  if (qParents[b] === 0) continue;
  const hi = b + 1 < QN ? QEDGE[b + 1].toFixed(2) : ' inf';
  const lbl = `${QEDGE[b].toFixed(2)}-${hi}`;
  log(`   ${lbl.padEnd(14)} ${String(qParents[b]).padStart(8)} ${((100 * qArea[b]) / Math.max(1e-300, aTotAll)).toFixed(3).padStart(12)} ${(qTris[b] / qParents[b]).toFixed(2).padStart(11)} ${((100 * qUnc[b]) / Math.max(1, qTris[b])).toFixed(3).padStart(12)}  ||  ${(qTrisAng1[b] / qParents[b]).toFixed(2).padStart(11)} ${((100 * qUncAng1[b]) / Math.max(1, qTrisAng1[b])).toFixed(3).padStart(12)}`);
}
log('');
log('   PRE-REGISTERED KILL: uncleared% must fall MONOTONICALLY with q, and the top bin must carry');
log('   < 5% uncleared. If it does not, parent shape does not decide refinability and S95 read a');
log('   between-mesh confound.');
log('');
{
  let tp = 0; let tt = 0; let tu = 0;
  for (let b = 0; b < QN; b += 1) if (QEDGE[b] >= 0.4) { tp += qParents[b]; tt += qTris[b]; tu += qUnc[b]; }
  let sp = 0; let st = 0; let su = 0;
  for (let b = 0; b < QN; b += 1) if (QEDGE[b] < 0.4) { sp += qParents[b]; st += qTris[b]; su += qUnc[b]; }
  log(`   SPLIT AT q = 0.4 :  q<0.4  ${sp} parents, ${(st / Math.max(1, sp)).toFixed(2)}x leaves, ${((100 * su) / Math.max(1, st)).toFixed(3)}% uncleared`);
  log(`                       q>=0.4 ${tp} parents, ${(tt / Math.max(1, tp)).toFixed(2)}x leaves, ${((100 * tu) / Math.max(1, tt)).toFixed(3)}% uncleared`);
}
log('');
log('FIDELITY: every line ABOVE this point is s98QRefine.ts / frontierRefine.ts verbatim. Diff them on');
log('the same input before trusting anything downstream.');
if (OUTND !== '') log(`S105 pool written: ${OUTND}  (${nParents} records this run, sequence ${QSTART}..${NS - 1})`);
if (QSTART > 0) {
  log('');
  log('*** WARNING: THIS WAS A RESUMED RUN (QSTART > 0). EVERY AGGREGATE LINE ABOVE COVERS ONLY THE');
  log('*** PARENTS PROCESSED IN THIS PROCESS AND IS NOT THE FULL-POOL FIGURE. Use the ndjson.');
}

// _gd_gothic.test.ts — DEV-ONLY (PF_GD_GOTHIC=1). E-2026-07-04-GD-GOTHIC.
//
// THE ONE DECISIVE QUESTION: Is GothicArches' true-3D floor DENSITY-RESPONSIVE or DENSITY-INVARIANT?
// Settle a contradiction between two prior passes (do NOT try to fix anything):
//   - perp-guard pass:            floor 0.042 is chordTol-BOUND / density-INVARIANT, on the near-vertical rib CREST.
//   - collinear-subdivision pass: floor 0.0581 is recovery-INVARIANT, attributed to smooth inter-crest VALLEY/PANEL
//                                 facets (a chordTol gap that WOULD be density-responsive).
// These can't both be right.
//
// METHOD: take the local-segment Gothic mesh (crest embedded as zero-serration constraint SEGMENTS, from
// _cu_gothicsegLib). HOLD THE CREST-SEGMENT SET FIXED (one extraction, reused). Sweep ONLY the panel-density knob
// (chordTolMm, the chordSteiner split target), giving a GENEROUS fixed budget so NO level hits budget (the prior
// screen-1.5M confound). Measure honest true-3D p99 (bruteAnchoredRedPerp.trustedP99) at EACH level. Then LOCATE the
// worst ~200 red facets at the finest level: crest (near-vertical, high radial gradient, small crest-u distance) vs
// smooth inter-crest PANEL (interior, low gradient). The location split is the TIEBREAKER (the p99 trend can be
// confounded by recovery drift; the split cannot).
//
// KILL (pre-registered):
//   DENSITY-RESPONSIVE iff true-3D p99 drops MONOTONICALLY toward <=0.01 as chordTol tightens (report the chordTol
//     that crosses 0.01) AND the worst red facets are majority PANEL.
//   DENSITY-INVARIANT iff true-3D p99 floors FLAT (+/-10%) across the sweep (report the floor Y) AND the worst red
//     facets are majority CREST (near-vertical) => genuine steep-EXCLUDE geometry, NOT closable by panel density.
// A clean invariant floor is a VALID, VALUABLE result — do NOT force a pass. Trust ONLY measured numbers.
//
// ISOLATION: NEW files only. Reuses labkit rulers + inhouse kernel + _cu_gothicsegLib READ-ONLY. Writes ONLY
// research/exchange/_gd_gothic/. Env sub-gate + row-exists skip => resumable; checkpoint each scored row INSTANTLY.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts,
  buildMeshUt, triangleQualityDistribution, perFaceChordSag, bruteAnchoredRedPerp,
  type AnalyticRadiusFn,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { extractGothicCrestSegments, measureCrestSerration, type CrestExtractOpts, type CrestExtractResult } from './_cu_gothicsegLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const DIR = join(process.cwd(), 'research', 'exchange', '_gd_gothic');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const EXCACHE = join(DIR, 'extract.cache.json');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };

// RAW-INDEX non-manifold (literal-index edges shared by >2 tris).
function auditNonManRaw(idx: ArrayLike<number>): number {
  const keys = new Float64Array(idx.length); let w = 0; const BIG = 2 ** 26;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const lo = p < q ? p : q, hi = p < q ? q : p; keys[w++] = lo * BIG + hi; }
  }
  const arr = keys.subarray(0, w); arr.sort();
  let nm = 0, i = 0;
  while (i < w) { let j = i + 1; while (j < w && arr[j] === arr[i]) j++; if (j - i > 2) nm++; i = j; }
  return nm;
}

// SAME loci config as the collinear-subdivision pass (_cu_gothicseg.test.ts) so we sweep the EXACT contested mesh.
const EXTRACT: CrestExtractOpts = {
  nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true,
};

// Extract ONCE, cache to disk, reuse across all density levels => the crest-segment set is HELD FIXED (the whole
// point of the experiment). Cache survives a process kill so a resumed run does not re-scan 640x4096.
function loadOrExtract(rA: AnalyticRadiusFn): CrestExtractResult {
  if (existsSync(EXCACHE)) {
    try {
      const c = JSON.parse(readFileSync(EXCACHE, 'utf8'));
      if (c.points && c.constraints && c.crestUt) {
        plog(`extract: CACHE hit peaks=${c.nPeaks} segments=${c.nSegments}`);
        return c as CrestExtractResult;
      }
    } catch { /* fall through to re-extract */ }
  }
  const t0 = Date.now();
  const ex = extractGothicCrestSegments(rA, H, EXTRACT);
  plog(`extract: FRESH rows=${ex.nRows} peaks=${ex.nPeaks} points=${ex.points.length / 2} segments=${ex.nSegments} births=${ex.nBirths} merges=${ex.nMerges} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(EXCACHE, JSON.stringify(ex));
  return ex;
}

// ── Facet locator: crest (near-vertical rib) vs smooth inter-crest PANEL. ──────────────────────────────────────
// For a red facet centroid (u,t): radSpan = max-min radius over its 3 lifted vertices (LARGE on a near-vertical rib
// wall). azSpan = max-min azimuth. gradU/gradT = |d rA / d(u,t)| by central difference at the centroid (HIGH near a
// crest edge, LOW on a flat panel). crestDu = |u - nearest extracted crest u at this row| (SMALL => on/at a crest).
interface FacetLoc { f: number; radSpan: number; azSpan: number; gradU: number; gradT: number; crestDu: number; classCrest: boolean; radialSag: number; }

// Sorted crest-u per z-band => fast nearest-crest lookup (mirrors the extraction's per-row structure).
function buildCrestUByBand(crestUt: number[], nBand: number): Float64Array[] {
  const bands: number[][] = Array.from({ length: nBand }, () => []);
  for (let i = 0; i + 1 < crestUt.length; i += 2) {
    const u = crestUt[i], t = crestUt[i + 1];
    let bi = Math.floor(t * nBand); if (bi < 0) bi = 0; if (bi >= nBand) bi = nBand - 1;
    bands[bi].push(u);
  }
  return bands.map((a) => { const arr = Float64Array.from(a); arr.sort(); return arr; });
}
function nearestCrestDu(u: number, t: number, bands: Float64Array[]): number {
  const nBand = bands.length; let bi = Math.floor(t * nBand); if (bi < 0) bi = 0; if (bi >= nBand) bi = nBand - 1;
  let best = 0.5;
  for (const b of [bi - 1, bi, bi + 1]) {
    if (b < 0 || b >= nBand) continue; const arr = bands[b]; if (arr.length === 0) continue;
    // linear scan (bands are small); periodic du
    for (let k = 0; k < arr.length; k++) { let du = Math.abs(u - arr[k]); if (du > 0.5) du = 1 - du; if (du < best) best = du; }
  }
  return best;
}

function locateRedFacets(
  ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number,
  radial: { faceErr: Float64Array }, redMm: number, topN: number, bands: Float64Array[],
): { locs: FacetLoc[]; nCrest: number; nPanel: number } {
  const nF = indices.length / 3;
  const red: number[] = [];
  for (let f = 0; f < nF; f++) if (radial.faceErr[f] > redMm) red.push(f);
  red.sort((x, y) => radial.faceErr[y] - radial.faceErr[x]);
  const sample = red.slice(0, Math.min(topN, red.length));
  const du = 1 / 8192, dt = 1 / 8192; // central-difference step for the gradient
  const locs: FacetLoc[] = [];
  let nCrest = 0, nPanel = 0;
  for (const f of sample) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    // seam-aware u
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    const ra = rA(TAU * (ua - Math.floor(ua)), ta * H), rb = rA(TAU * (ub - Math.floor(ub)), tb * H), rc = rA(TAU * (uc - Math.floor(uc)), tc * H);
    const radSpan = Math.max(ra, rb, rc) - Math.min(ra, rb, rc);
    const azSpan = (Math.max(ua, ub, uc) - Math.min(ua, ub, uc)) * TAU; // radians of azimuth swept
    const um = (ua + ub + uc) / 3, tm = (ta + tb + tc) / 3;
    const uw = um - Math.floor(um);
    const z = tm * H;
    const gU = Math.abs(rA(TAU * (uw + du - Math.floor(uw + du)), z) - rA(TAU * (uw - du - Math.floor(uw - du)), z)) / (2 * du * TAU); // mm per radian
    const tzHi = Math.min(1, tm + dt) * H, tzLo = Math.max(0, tm - dt) * H;
    const gT = Math.abs(rA(TAU * uw, tzHi) - rA(TAU * uw, tzLo)) / Math.max(1e-9, (tzHi - tzLo)); // mm per mm-z
    const crestDu = nearestCrestDu(uw, tm, bands);
    // CREST classification: the facet sits on a near-vertical rib wall. Signatures (any strong one => crest):
    //   (i)  large radial span across a tiny azimuth  => a wall (radSpan/azSpan-arclength ratio high), OR
    //   (ii) high radial gradient in u at centroid (mm/rad; a Gothic rib is ~2mm over a fraction of a bay), OR
    //   (iii) very close to an extracted crest u AND steep gradient.
    const arc = Math.max(1e-4, azSpan * ((ra + rb + rc) / 3)); // azimuthal arc length (mm) the facet spans
    const wallRatio = radSpan / arc;                            // dz-ish / dxy => >~1 is a steep wall face
    const steepGrad = gU > 8;                                   // >8 mm/rad ~ a rib flank (bay pitch << 1 rad)
    const nearCrest = crestDu < 0.004;                          // within ~1.4mm-u of an embedded crest
    const classCrest = wallRatio > 0.6 || steepGrad || (nearCrest && gU > 3);
    if (classCrest) nCrest++; else nPanel++;
    locs.push({ f, radSpan: +radSpan.toFixed(4), azSpan: +azSpan.toFixed(5), gradU: +gU.toFixed(2), gradT: +gT.toFixed(3), crestDu: +crestDu.toFixed(5), classCrest, radialSag: +radial.faceErr[f].toFixed(4) });
  }
  return { locs, nCrest, nPanel };
}

// ── DENSITY SWEEP: crest-segment set FIXED; ONLY chordTolMm (panel-density knob) varies. ───────────────────────
// Base grid (tolMm/hMin) held CONSTANT so chordSteiner is the SOLE density lever changing between levels. Budget is
// generous & fixed (7M) so no level hits budget — the confound that broke the prior 2-row screen-vs-hd comparison.
interface Recipe { key: string; chordTolMm: number; locate?: boolean; }
const BUDGET = 7_000_000;
const BASE_TOL = 0.006;   // fixed base-grid chord target
const BASE_HMIN = 0.010;  // fixed base-grid min edge
const RECIPES: Recipe[] = [
  { key: 'L0-chord0.030', chordTolMm: 0.030 },
  { key: 'L1-chord0.015', chordTolMm: 0.015 },
  { key: 'L2-chord0.008', chordTolMm: 0.008, locate: true }, // finest => run the crest-vs-panel locator here
];

describe('gd-gothic: density-responsive vs density-invariant true-3D floor', () => {
  for (const rec of RECIPES) {
    it.skipIf(process.env.PF_GD_GOTHIC !== '1')(`sweep ${rec.key}`, () => {
      if (rowExists(rec.key)) { plog(`${rec.key} exists, skip`); return; }
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const ex = loadOrExtract(rA);
      const constraints = ex.constraints;
      const points = ex.points;
      plog(`${rec.key}: FIXED loci peaks=${ex.nPeaks} segments=${constraints.length / 2}; chordTolMm=${rec.chordTolMm} budget=${BUDGET}; building...`);
      const opts: InhouseMeshOpts = {
        tolMm: BASE_TOL, hMin: BASE_HMIN, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
        maxPoints: BUDGET, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
        chordTolMm: rec.chordTolMm, chordSteiner: true,
        guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
        injectedPoints: points, pinInjected: true, constraintEdges: constraints,
      };
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, opts);
      const buildS = (Date.now() - t0) / 1000;
      const tris = mesh.indices.length / 3;
      const cs = mesh.constraint;
      const req = cs?.requested ?? 0;
      const recovered = (cs?.alreadyPresent ?? 0) + (cs?.recovered ?? 0);
      const recoveryPct = req ? 100 * recovered / req : 0;
      plog(`${rec.key}: tris=${(tris / 1e6).toFixed(2)}M build=${buildS.toFixed(0)}s recovery=${recoveryPct.toFixed(1)}% (req=${req} present=${cs?.alreadyPresent} recov=${cs?.recovered} fail=${cs?.failed}) hitBudget=${mesh.hitBudget}`);

      const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);
      // FAST robust measurements FIRST (WT + Q + serration + radial) so a crash in the slow brute-anchor checkpoints.
      const rawNonMan = auditNonManRaw(mesh.indices);
      const q = triangleQualityDistribution({ vertices: m.xyz, indices: mesh.indices });
      const serr = measureCrestSerration(ex.crestUt, m.xyz, mesh.indices, rA, H);
      const radial = perFaceChordSag(mesh.ut, mesh.indices, rA, H);
      const partial = {
        key: rec.key, tris, buildS: +buildS.toFixed(0), chordTolMm: rec.chordTolMm,
        recoveryPct: +recoveryPct.toFixed(1), req, fail: cs?.failed ?? 0,
        serrP99: +serr.p99Mm.toFixed(4), serrMax: +serr.maxMm.toFixed(4),
        rawNonMan, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2),
        radialP99: radial.faceErr.length ? +percentile(radial.faceErr, 0.99).toFixed(4) : 0,
        hitBudget: mesh.hitBudget,
      };
      plog(`${rec.key}: [partial] serrP99=${partial.serrP99} rawNonMan=${rawNonMan} %<20=${partial.pctBelow20} recovery=${partial.recoveryPct}% radialP99=${partial.radialP99}`);
      // TRUE-3D: brute-anchored trusted p99 on the worst red facets (labkit) — the slow step. Bigger sampleN for a
      // stable p99 on the verdict number.
      const brute = bruteAnchoredRedPerp(mesh.ut, mesh.indices, rA, H, { redMm: 0.03, sampleN: 64, radial });
      let locSummary: Record<string, unknown> = {};
      if (rec.locate) {
        const bands = buildCrestUByBand(ex.crestUt, 320);
        const loc = locateRedFacets(mesh.ut, mesh.indices, rA, H, radial, 0.03, 200, bands);
        // dump the full per-facet location table for inspection
        writeFileSync(join(DIR, `redfacets_${rec.key}.json`), JSON.stringify(loc.locs, null, 0));
        // summary stats of the worst-N radial-sag facets' location
        const crestSags = loc.locs.filter((l) => l.classCrest).map((l) => l.radialSag);
        const panelSags = loc.locs.filter((l) => !l.classCrest).map((l) => l.radialSag);
        locSummary = {
          locTopN: loc.locs.length, nCrest: loc.nCrest, nPanel: loc.nPanel,
          crestFrac: +(loc.nCrest / Math.max(1, loc.locs.length)).toFixed(3),
          crestSagMedian: crestSags.length ? +median(crestSags).toFixed(4) : 0,
          panelSagMedian: panelSags.length ? +median(panelSags).toFixed(4) : 0,
          crestRadSpanMed: +median(loc.locs.filter((l) => l.classCrest).map((l) => l.radSpan)).toFixed(3),
          panelRadSpanMed: +median(loc.locs.filter((l) => !l.classCrest).map((l) => l.radSpan)).toFixed(3),
          crestGradUMed: +median(loc.locs.filter((l) => l.classCrest).map((l) => l.gradU)).toFixed(2),
          panelGradUMed: +median(loc.locs.filter((l) => !l.classCrest).map((l) => l.gradU)).toFixed(2),
        };
        plog(`${rec.key}: [LOCATE] nCrest=${loc.nCrest} nPanel=${loc.nPanel} crestFrac=${(loc.nCrest / Math.max(1, loc.locs.length)).toFixed(3)} crestSagMed=${locSummary.crestSagMedian} panelSagMed=${locSummary.panelSagMedian}`);
      }
      const row = {
        ...partial,
        true3dP99: +brute.trustedP99.toFixed(4), gnP99: +brute.gnP99.toFixed(4), true3dMax: +brute.trustedMax.toFixed(4), nRed: brute.nRed, gnOver: brute.gnOver,
        ...locSummary,
      };
      checkpoint(row);
      plog(`${rec.key}: true3dP99=${row.true3dP99} (gn=${row.gnP99}) nRed=${row.nRed} serrP99=${row.serrP99} recovery=${row.recoveryPct}%`);
      expect(tris).toBeGreaterThan(0);
    }, 120 * 60 * 1000);
  }
});

function percentile(arr: ArrayLike<number>, p: number): number {
  const a = Float64Array.from(arr as ArrayLike<number>).sort();
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
}
function median(arr: number[]): number {
  if (arr.length === 0) return 0; const a = Float64Array.from(arr).sort();
  const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

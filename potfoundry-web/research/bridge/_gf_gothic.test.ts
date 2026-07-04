// _gf_gothic.test.ts — DEV-ONLY (PF_GF_GOTHIC=1). E-2026-07-04-GF-GOTHIC (the LAST distinct Gothic lever).
//
// Explicit rib-FLANK strip tessellation. RECON (_gf_gothic_recon) proved the near-vertical rib flank is flank-pitch-
// RESPONSIVE (u-flank crest->valley true-3D chord 0.968@N1 -> 0.0187@N16, quadratic; crosses 0.012 at pitch ~0.126mm
// -arc). chordTol is BLIND to it (stalls at 0.088, density-INVARIANT, E-GD-GOTHIC). LEVER: start from the local-
// segment crest embedding (_cu_gothicseg: crest = zero-serration mesh edge, rawNonMan 0, floored 0.0581 by the FLANK)
// and INJECT explicit PINNED flank points (buildFlankPoints) marching crest->valley at a fine u/t-pitch sized from the
// TRUE-3D flank gradient — anchoring flat facets ONTO the curved flank WITHOUT adding crossing constraints (which
// capped Track-B recovery at 65.7%). Sweep the flank pitch >=2 levels; keep <=6M tris; checkpoint each INSTANTLY.
//
// KILL (pre-registered, committed cfb530e): CONFIRMED iff true-3D p99 (bruteAnchoredRedPerp.trustedP99) <=0.012 AND
// serration <=0.001 (crest stays a mesh edge) AND rawNonMan 0 AND flank-pitch-RESPONSIVE (true-3D drops toward <=0.01
// as flank pitch tightens). REFUTED iff, even with explicit fine flank strips, true-3D floors >0.02 => Gothic
// DEFINITIVELY steep-EXCLUDE. A clean refutation is a valid, valuable result — do NOT force a pass.
//
// ISOLATION: NEW files only. Reuses labkit rulers + inhouse kernel + _cu_gothicsegLib + _gf_gothicFlankLib READ-ONLY.
// Writes ONLY research/exchange/_gf_gothic/. Env sub-gate + row-exists skip => resumable; checkpoint each row INSTANTLY.
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
import { buildFlankPoints, type FlankPitchOpts } from './_gf_gothicFlankLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const R_MEAN = 48; // Gothic Rt~50/Rb~40 => mean radius ~48 for u-arc<->du
const DIR = join(process.cwd(), 'research', 'exchange', '_gf_gothic');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
// reuse GD-GOTHIC's cached extraction (SAME loci config) so the crest-segment set is HELD FIXED across levels.
const EXCACHE = join(process.cwd(), 'research', 'exchange', '_gd_gothic', 'extract.cache.json');

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
function percentile(arr: ArrayLike<number>, p: number): number {
  const a = Float64Array.from(arr as ArrayLike<number>).sort();
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
}

// SAME loci config as GD-GOTHIC / Track-B (so we start from the EXACT contested crest-segment mesh).
const EXTRACT: CrestExtractOpts = { nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true };

function loadOrExtract(rA: AnalyticRadiusFn): CrestExtractResult {
  if (existsSync(EXCACHE)) {
    try { const c = JSON.parse(readFileSync(EXCACHE, 'utf8')); if (c.points && c.constraints && c.crestUt) { plog(`extract: CACHE hit (GD) peaks=${c.nPeaks} segs=${c.nSegments}`); return c as CrestExtractResult; } } catch { /* re-extract */ }
  }
  const t0 = Date.now(); const ex = extractGothicCrestSegments(rA, H, EXTRACT);
  plog(`extract FRESH peaks=${ex.nPeaks} segs=${ex.nSegments} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, 'extract.cache.json'), JSON.stringify(ex)); return ex;
}

// FLANK-PITCH SWEEP: crest-segment set FIXED; ONLY the flank pitch varies (the sole lever). Budget generous & fixed
// (6M) so no level hits budget. maxDu = half a bay (72 slots): 1/72/2*1.2. chordSteiner kept ON (handles panel + the
// slower t-flank residual); the pinned flank points close the u-flank chordTol is blind to.
interface Recipe { key: string; uPitchMmArc: number; tPitchMmZ: number; locate?: boolean; }
const BUDGET = 6_000_000;
const BASE_TOL = 0.006;
const BASE_HMIN = 0.010;
const CHORD_TOL = 0.010; // panel/t chord guard (kept moderate; the flank points are the u-lever)
const MAXDU = (1 / 72) / 2 * 1.2;
const MAXDT = 0.05;
// recon predicts u-pitch ~0.126mm-arc -> chord 0.012. Sweep coarse->fine so the RESPONSE is visible.
const RECIPES: Recipe[] = [
  { key: 'P0-u0.30-t0.25', uPitchMmArc: 0.30, tPitchMmZ: 0.25 }, // coarse (near current chordSteiner state)
  { key: 'P1-u0.16-t0.14', uPitchMmArc: 0.16, tPitchMmZ: 0.14 }, // mid
  { key: 'P2-u0.10-t0.09', uPitchMmArc: 0.10, tPitchMmZ: 0.09, locate: true }, // fine (predicts <=0.012); locate here
];

describe('gf-gothic: explicit rib-flank strip tessellation', () => {
  for (const rec of RECIPES) {
    it.skipIf(process.env.PF_GF_GOTHIC !== '1')(`flank ${rec.key}`, () => {
      if (rowExists(rec.key)) { plog(`${rec.key} exists, skip`); return; }
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const ex = loadOrExtract(rA);
      const crestSegConstraints = ex.constraints;   // the ONLY locked edges (zero serration)
      const crestPoints = ex.points;                // crest points (pinned + segment endpoints)

      // build explicit PINNED flank points at this pitch
      const flankOpts: FlankPitchOpts = {
        uPitchMmArc: rec.uPitchMmArc, tPitchMmZ: rec.tPitchMmZ, rMean: R_MEAN, H,
        maxDu: MAXDU, maxDt: MAXDT, minGradU: 6, minGradT: 0.4,
      };
      const t0f = Date.now();
      const flank = buildFlankPoints(rA, ex.crestUt, flankOpts);
      plog(`${rec.key}: flank pts u=${flank.nUFlank} t=${flank.nTFlank} crestUsed=${flank.nCrestUsed} in ${((Date.now() - t0f) / 1000).toFixed(1)}s`);

      // injected points = crest points (segment endpoints, referenced by constraints) FOLLOWED BY flank points.
      // constraintEdges index into the FIRST crestPoints.length/2 positions only (crest segments) — flank points are
      // appended AFTER so they never appear in a constraint => pinned-only, no crossing constraints.
      const injected = crestPoints.concat(flank.points);

      const opts: InhouseMeshOpts = {
        tolMm: BASE_TOL, hMin: BASE_HMIN, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
        maxPoints: BUDGET, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
        chordTolMm: CHORD_TOL, chordSteiner: true,
        guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
        injectedPoints: injected, pinInjected: true, constraintEdges: crestSegConstraints,
      };
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, opts);
      const buildS = (Date.now() - t0) / 1000;
      const tris = mesh.indices.length / 3;
      const cs = mesh.constraint;
      const req = cs?.requested ?? 0;
      const recovered = (cs?.alreadyPresent ?? 0) + (cs?.recovered ?? 0);
      const recoveryPct = req ? 100 * recovered / req : 0;
      plog(`${rec.key}: tris=${(tris / 1e6).toFixed(2)}M build=${buildS.toFixed(0)}s recovery=${recoveryPct.toFixed(1)}% (req=${req} fail=${cs?.failed}) hitBudget=${mesh.hitBudget}`);

      const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);
      // FAST robust measurements FIRST (WT + Q + serration + radial) so a crash in the slow brute-anchor checkpoints.
      const rawNonMan = auditNonManRaw(mesh.indices);
      const q = triangleQualityDistribution({ vertices: m.xyz, indices: mesh.indices });
      const serr = measureCrestSerration(ex.crestUt, m.xyz, mesh.indices, rA, H);
      const radial = perFaceChordSag(mesh.ut, mesh.indices, rA, H);
      const partial = {
        key: rec.key, tris, buildS: +buildS.toFixed(0), uPitchMmArc: rec.uPitchMmArc, tPitchMmZ: rec.tPitchMmZ,
        nUFlank: flank.nUFlank, nTFlank: flank.nTFlank,
        recoveryPct: +recoveryPct.toFixed(1), req, fail: cs?.failed ?? 0,
        serrP99: +serr.p99Mm.toFixed(4), serrMax: +serr.maxMm.toFixed(4),
        rawNonMan, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2),
        radialP99: radial.faceErr.length ? +percentile(radial.faceErr, 0.99).toFixed(4) : 0,
        hitBudget: mesh.hitBudget,
      };
      plog(`${rec.key}: [partial] serrP99=${partial.serrP99} rawNonMan=${rawNonMan} %<20=${partial.pctBelow20} recovery=${partial.recoveryPct}% radialP99=${partial.radialP99}`);
      // TRUE-3D: brute-anchored trusted p99 on the worst red facets (labkit) — the slow step, last. Bigger sampleN.
      const brute = bruteAnchoredRedPerp(mesh.ut, mesh.indices, rA, H, { redMm: 0.03, sampleN: 64, radial });
      const row = {
        ...partial,
        true3dP99: +brute.trustedP99.toFixed(4), gnP99: +brute.gnP99.toFixed(4), true3dMax: +brute.trustedMax.toFixed(4), nRed: brute.nRed, gnOver: brute.gnOver,
      };
      checkpoint(row);
      plog(`${rec.key}: true3dP99=${row.true3dP99} (gn=${row.gnP99}) nRed=${row.nRed} serrP99=${row.serrP99} rawNonMan=${rawNonMan} recovery=${row.recoveryPct}%`);
      expect(tris).toBeGreaterThan(0);
    }, 120 * 60 * 1000);
  }
});

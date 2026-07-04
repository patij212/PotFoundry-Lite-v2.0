// _col_gothicseg.test.ts — DEV-ONLY (PF_COL_GOTHICSEG=1). E-2026-07-04-COL-SUBDIV Phase-1 CLOSE.
// Re-run the EXACT E-2026-07-04-CU-GOTHICSEG pipeline (local crest constraint SEGMENTS + robust recovery) with
// the NEW opt-in `recoverySubdivideCollinear` ON. The prior run REFUTED at recovery 90.1%@3M → 65.7%@5.87M,
// true-3D floored 0.058 — root cause MEASURED: kernel interior/Steiner vertices land collinear ON constraint
// segments and BLOCK edge recovery (density makes it WORSE). The subdivide fix splits each on-segment vertex
// into a shared endpoint so recovery lifts toward ~100% regardless of density.
//
// KILL (pre-registered): CONFIRMED iff recovery >=98% AND true-3D p99 (bruteAnchoredRedPerp.trustedP99) <=0.012
// AND serration <=0.001 AND rawNonMan 0, at <=6M tris, buildS not worse than the 948s baseline. REFUTED iff
// subdivision still leaves recovery <95% (deeper block) OR true-3D floors >0.02 even at ~100% recovery.
// Report recoveryPctBefore (66%) -> recoveryPctAfter. MEASURE AT TWO densities; CHECKPOINT each instant.
//
// ISOLATION: NEW files only. Reuses labkit rulers + _cu_gothicsegLib + inhouse kernel READ-ONLY (the ONLY new
// kernel behavior is the opt-in recoverySubdivideCollinear flag). Env sub-gate + row-exists skip => resumable.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts,
  buildMeshUt, triangleQualityDistribution, perFaceChordSag, bruteAnchoredRedPerp,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { extractGothicCrestSegments, measureCrestSerration, type CrestExtractOpts } from './_cu_gothicsegLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = 'GothicArches' as StyleId;
const DIR = join(process.cwd(), 'research', 'exchange', '_col_gothicseg');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };

// RAW-INDEX non-manifold (literal-index edges shared by >2 tris) — identical to the prior probe.
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

// IDENTICAL loci config to _cu_gothicseg (so the A/B isolates the recovery change only).
const EXTRACT: CrestExtractOpts = {
  nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true,
};

interface Recipe { key: string; maxPoints: number; tolMm: number; hMin: number; chordTolMm: number; }
const RECIPES: Recipe[] = [
  // SAME two densities as the refuted prior run (screen 1.5M-target ~3M, HD 4.5M-target ~5.87M) so the A/B is
  // apples-to-apples: the ONLY change is recoverySubdivideCollinear ON.
  { key: 'sub-screen-1.5M', maxPoints: 1_500_000, tolMm: 0.006, hMin: 0.010, chordTolMm: 0.012 },
  { key: 'sub-hd-4.5M', maxPoints: 4_500_000, tolMm: 0.004, hMin: 0.008, chordTolMm: 0.008 },
];

describe('col-gothicseg: subdivide-collinear recovery A/B', () => {
  for (const rec of RECIPES) {
    it.skipIf(process.env.PF_COL_GOTHICSEG !== '1')(`build+score ${rec.key}`, () => {
      if (rowExists(rec.key)) { plog(`${rec.key} exists, skip`); return; }
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      plog(`${rec.key}: extracting loci...`);
      const ex = extractGothicCrestSegments(rA, H, EXTRACT);
      const constraints = ex.constraints;
      const points = ex.points;
      plog(`${rec.key}: loci peaks=${ex.nPeaks} segments=${constraints.length / 2}; building kernel (subdivideCollinear ON)...`);
      const opts: InhouseMeshOpts = {
        tolMm: rec.tolMm, hMin: rec.hMin, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
        maxPoints: rec.maxPoints, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
        chordTolMm: rec.chordTolMm, chordSteiner: true,
        guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
        recoverySubdivideCollinear: true, // <-- THE NEW LEVER (E-2026-07-04-COL-SUBDIV)
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
      plog(`${rec.key}: tris=${(tris / 1e6).toFixed(2)}M build=${buildS.toFixed(0)}s recovery=${recoveryPct.toFixed(1)}% (req=${req} present=${cs?.alreadyPresent} recov=${cs?.recovered} fail=${cs?.failed} splits=${cs?.subdivSplits} subSegs=${cs?.subdivSubSegments}) hitBudget=${mesh.hitBudget}`);

      const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);
      // FAST robust measurements FIRST (WT + Q + serration) so a crash in the slow brute-anchor still checkpoints.
      const rawNonMan = auditNonManRaw(mesh.indices);
      const q = triangleQualityDistribution({ vertices: m.xyz, indices: mesh.indices });
      const serr = measureCrestSerration(ex.crestUt, m.xyz, mesh.indices, rA, H);
      const radial = perFaceChordSag(mesh.ut, mesh.indices, rA, H);
      const partial = {
        key: rec.key, tris, buildS: +buildS.toFixed(0),
        recoveryPct: +recoveryPct.toFixed(1), req, present: cs?.alreadyPresent ?? 0, recov: cs?.recovered ?? 0, fail: cs?.failed ?? 0,
        subdivSplits: cs?.subdivSplits ?? 0, subdivSubSegments: cs?.subdivSubSegments ?? 0,
        serrP99: +serr.p99Mm.toFixed(4), serrMax: +serr.maxMm.toFixed(4), serrMean: +serr.meanMm.toFixed(4), serrN: serr.nSample,
        rawNonMan, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2),
        hitBudget: mesh.hitBudget,
      };
      plog(`${rec.key}: [partial] recovery=${partial.recoveryPct}% serrP99=${partial.serrP99} rawNonMan=${rawNonMan} %<20=${partial.pctBelow20}`);
      // TRUE-3D: brute-anchored trusted p99 on the worst red facets (labkit) — the slow step, last.
      const brute = bruteAnchoredRedPerp(mesh.ut, mesh.indices, rA, H, { redMm: 0.03, sampleN: 40, radial });
      const row = {
        ...partial,
        true3dP99: +brute.trustedP99.toFixed(4), gnP99: +brute.gnP99.toFixed(4), true3dMax: +brute.trustedMax.toFixed(4), nRed: brute.nRed, gnOver: brute.gnOver,
      };
      checkpoint(row);
      plog(`${rec.key}: true3dP99=${row.true3dP99} (gn=${row.gnP99}) serrP99=${row.serrP99} rawNonMan=${rawNonMan} %<20=${row.pctBelow20} recovery=${row.recoveryPct}%`);
      expect(tris).toBeGreaterThan(0);
    }, 90 * 60 * 1000);
  }
});

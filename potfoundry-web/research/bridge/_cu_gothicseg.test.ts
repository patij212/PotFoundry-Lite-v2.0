// _cu_gothicseg.test.ts — DEV-ONLY (PF_CU_GOTHICSEG=1). E-2026-07-04-CU-GOTHICSEG (Track B).
// Embed GothicArches' count-UNSTABLE rib/lattice crest network as LOCAL constraint SEGMENTS + junction Steiner,
// fed to the in-house kernel with recoveryRobust + guardManifoldAlways + guardRecoveryManifold + chordSteiner.
//
// KILL (pre-registered): CONFIRMED iff true-3D p99 (bruteAnchoredRedPerp.trustedP99) <=0.012 AND serration
// (crest->nearest MESH EDGE) <=0.001 AND rawNonMan 0 AND recovery >=95%, at <=6M tris. REFUTED iff recovery
// <90% OR true-3D floors >0.02 with segments locked => count-unstable network cannot be embedded cleanly
// (accept steep-EXCLUDE). Report recoveryPct explicitly. MEASURE AT TWO densities; CHECKPOINT each instant.
//
// ISOLATION: NEW files only. Reuses labkit rulers + inhouse kernel READ-ONLY. Writes ONLY research/exchange/_cu_gothicseg/.
// Env sub-gate + row-exists skip => resumable.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts,
  buildMeshUt, triangleQualityDistribution, perFaceChordSag, bruteAnchoredRedPerp,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { extractGothicCrestSegments, measureCrestSerration, type CrestExtractOpts } from './_cu_gothicsegLib';
import { planarizeConstraintGraph } from './featureConformingMesh';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
// u->mm scale for planarize predicates = mean circumference (Rt~50, Rb~40 => mean radius ~45 => ~283mm).
const TAU_CIRC = TAU * 45;
const DIR = join(process.cwd(), 'research', 'exchange', '_cu_gothicseg');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

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

// Loci-extraction config — dense per-row-pair segments. maxLinkDu tuned so a crest at u-count N=6 bays x diamond
// rows can only link to a near neighbour (bay pitch ~1/N in u, so <<1/N keeps links local).
const EXTRACT: CrestExtractOpts = {
  nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true,
};

interface Recipe { key: string; maxPoints: number; tolMm: number; hMin: number; chordTolMm: number; planarize?: boolean; }
const RECIPES: Recipe[] = [
  { key: 'screen-1.5M', maxPoints: 1_500_000, tolMm: 0.006, hMin: 0.010, chordTolMm: 0.012 },
  { key: 'hd-4.5M', maxPoints: 4_500_000, tolMm: 0.004, hMin: 0.008, chordTolMm: 0.008 },
  // planarized: SPLIT every X-crossing of two local segments into a shared junction vertex (task step 3) so the
  // inter-family diamond-lattice crossings stop blocking recovery. This is the direct test of "junction Steiner
  // at births/merges/X-crossings so the CDT can conform without crossing-constraint failure."
  { key: 'hd-planar', maxPoints: 4_500_000, tolMm: 0.004, hMin: 0.008, chordTolMm: 0.008, planarize: true },
];

describe('cu-gothicseg: local crest segments + robust recovery', () => {
  it.skipIf(process.env.PF_CU_GOTHICSEG !== '1')('diag: extract loci composition', () => {
    if (rowExists('diag-loci')) { plog('diag-loci exists, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const t0 = Date.now();
    const ex = extractGothicCrestSegments(rA, H, EXTRACT);
    plog(`extract: rows=${ex.nRows} peaks=${ex.nPeaks} points=${ex.points.length / 2} segments=${ex.nSegments} births=${ex.nBirths} merges/deaths=${ex.nMerges} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    checkpoint({ key: 'diag-loci', nRows: ex.nRows, nPeaks: ex.nPeaks, nPoints: ex.points.length / 2, nSegments: ex.nSegments, nBirths: ex.nBirths, nMerges: ex.nMerges });
    expect(ex.nSegments).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  for (const rec of RECIPES) {
    it.skipIf(process.env.PF_CU_GOTHICSEG !== '1')(`build+score ${rec.key}`, () => {
      if (rowExists(rec.key)) { plog(`${rec.key} exists, skip`); return; }
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      plog(`${rec.key}: extracting loci...`);
      const ex = extractGothicCrestSegments(rA, H, EXTRACT);
      let constraints = ex.constraints;
      const points = ex.points;
      let planarInfo = '';
      if (rec.planarize) {
        // uToMm = mean circumference (Gothic Rt~50 => ~283mm); tToMm = H. Splits interior X-crossings into
        // shared vertices appended to `points`, returns non-crossing segment list.
        const uToMm = TAU_CIRC;
        const pr = planarizeConstraintGraph(constraints, uToMm, H, points, 6);
        constraints = pr.constraints;
        planarInfo = ` planarized: crossingsSplit=${pr.crossingsSplit} added=${pr.addedPoints} passes=${pr.passes} residual=${pr.residualCrossings} segs ${ex.nSegments}->${constraints.length / 2}`;
        plog(`${rec.key}:${planarInfo}`);
      }
      plog(`${rec.key}: loci peaks=${ex.nPeaks} segments=${constraints.length / 2}; building kernel...`);
      const opts: InhouseMeshOpts = {
        tolMm: rec.tolMm, hMin: rec.hMin, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
        maxPoints: rec.maxPoints, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
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
      // FAST robust measurements FIRST (WT + Q + serration) so a crash in the slow brute-anchor still checkpoints.
      const rawNonMan = auditNonManRaw(mesh.indices);
      const q = triangleQualityDistribution({ vertices: m.xyz, indices: mesh.indices });
      const serr = measureCrestSerration(ex.crestUt, m.xyz, mesh.indices, rA, H); // crest sample -> nearest MESH EDGE
      const radial = perFaceChordSag(mesh.ut, mesh.indices, rA, H);
      const partial = {
        key: rec.key, tris, buildS: +buildS.toFixed(0),
        recoveryPct: +recoveryPct.toFixed(1), req, present: cs?.alreadyPresent ?? 0, recov: cs?.recovered ?? 0, fail: cs?.failed ?? 0,
        serrP99: +serr.p99Mm.toFixed(4), serrMax: +serr.maxMm.toFixed(4), serrMean: +serr.meanMm.toFixed(4), serrN: serr.nSample,
        rawNonMan, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2),
        hitBudget: mesh.hitBudget,
      };
      plog(`${rec.key}: [partial] serrP99=${partial.serrP99} rawNonMan=${rawNonMan} %<20=${partial.pctBelow20} recovery=${partial.recoveryPct}%`);
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

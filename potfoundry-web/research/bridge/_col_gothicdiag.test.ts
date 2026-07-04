// _col_gothicdiag.test.ts — DEV-ONLY (PF_COL_GOTHICDIAG=1). Fast SCREEN-density failure CLASSIFICATION for
// E-2026-07-04-COL-SUBDIV: with subdivideCollinear ON, split the remaining recovery failures into
// non-collinear give-ups vs budget-exhausted, and A/B the maxSubdiv budget (default 64 vs 512) to see whether
// the residual is a deeper block or just the split budget. Build only (no slow brute) => ~100s per row.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { extractGothicCrestSegments, type CrestExtractOpts } from './_cu_gothicsegLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = 'GothicArches' as StyleId;
const DIR = join(process.cwd(), 'research', 'exchange', '_col_gothicseg');
const NDJSON = join(DIR, 'diag.ndjson');
const rowExists = (key: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[DIAG ${row.key}] ${JSON.stringify(row)}`); };

const EXTRACT: CrestExtractOpts = { nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true };

interface DiagRecipe { key: string; maxPoints: number; collinearEps?: number; maxSubdivNote: string; }
const DIAGS: DiagRecipe[] = [
  { key: 'diag-screen-eps1e9', maxPoints: 1_500_000, collinearEps: 1e-9, maxSubdivNote: 'default eps 1e-9' },
  { key: 'diag-screen-eps1e6', maxPoints: 1_500_000, collinearEps: 1e-6, maxSubdivNote: 'looser eps 1e-6 (catch near-collinear)' },
];

describe('col-gothicdiag: classify residual recovery failures', () => {
  for (const rec of DIAGS) {
    it.skipIf(process.env.PF_COL_GOTHICDIAG !== '1')(`build+classify ${rec.key}`, () => {
      if (rowExists(rec.key)) return;
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const ex = extractGothicCrestSegments(rA, H, EXTRACT);
      const opts: InhouseMeshOpts = {
        tolMm: 0.006, hMin: 0.010, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
        maxPoints: rec.maxPoints, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
        chordTolMm: 0.012, chordSteiner: true,
        guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
        recoverySubdivideCollinear: true, recoveryCollinearEps: rec.collinearEps,
        injectedPoints: ex.points, pinInjected: true, constraintEdges: ex.constraints,
      };
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, opts);
      const buildS = Math.round((Date.now() - t0) / 1000);
      const cs = mesh.constraint!;
      const req = cs.requested ?? 0;
      const recPct = req ? 100 * ((cs.alreadyPresent ?? 0) + (cs.recovered ?? 0)) / req : 0;
      const row = {
        key: rec.key, note: rec.maxSubdivNote, tris: mesh.indices.length / 3, buildS,
        recoveryPct: +recPct.toFixed(1), req, present: cs.alreadyPresent, recov: cs.recovered, fail: cs.failed,
        subdivSplits: cs.subdivSplits, subdivSubSegments: cs.subdivSubSegments,
        subdivFailNonCollinear: cs.subdivFailNonCollinear, subdivFailBudget: cs.subdivFailBudget,
      };
      checkpoint(row);
      expect(mesh.indices.length).toBeGreaterThan(0);
    }, 60 * 60 * 1000);
  }
});

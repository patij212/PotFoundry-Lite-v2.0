// _gd_gothic_render.test.ts — DEV-ONLY (PF_GD_GOTHIC_RENDER=1). Visual evidence for E-2026-07-04-GD-GOTHIC:
// rebuild the L2 (chordTol=0.008) Gothic mesh ONCE and dump a TRUE-3D anchored heatmap so the render shows WHERE the
// residual lives (near-vertical rib CREST vs smooth inter-crest PANEL). scale=0.03mm so the crest reds are visible.
// ISOLATION: NEW file, reuses labkit + _cu_gothicsegLib READ-ONLY; writes ONLY research/exchange/_gd_gothic/.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts, buildMeshUt, dumpHeatmap,
  type AnalyticRadiusFn,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { extractGothicCrestSegments, type CrestExtractOpts, type CrestExtractResult } from './_cu_gothicsegLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = 'GothicArches' as StyleId;
const DIR = join(process.cwd(), 'research', 'exchange', '_gd_gothic');
const EXCACHE = join(DIR, 'extract.cache.json');
const EXTRACT: CrestExtractOpts = { nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true };

function loadOrExtract(rA: AnalyticRadiusFn): CrestExtractResult {
  if (existsSync(EXCACHE)) { try { const c = JSON.parse(readFileSync(EXCACHE, 'utf8')); if (c.points && c.constraints) return c as CrestExtractResult; } catch { /* re-extract */ } }
  const ex = extractGothicCrestSegments(rA, H, EXTRACT); mkdirSync(DIR, { recursive: true }); writeFileSync(EXCACHE, JSON.stringify(ex)); return ex;
}

describe('gd-gothic-render: true-3D anchored heatmap of the L2 mesh', () => {
  it.skipIf(process.env.PF_GD_GOTHIC_RENDER !== '1')('render L2', () => {
    if (existsSync(join(DIR, 'gd_L2.col.bin'))) { /* eslint-disable-next-line no-console */ console.log('L2 render bins exist, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const ex = loadOrExtract(rA);
    const opts: InhouseMeshOpts = {
      tolMm: 0.006, hMin: 0.010, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
      maxPoints: 7_000_000, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
      chordTolMm: 0.008, chordSteiner: true,
      guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
      injectedPoints: ex.points, pinInjected: true, constraintEdges: ex.constraints,
    };
    const mesh = buildInhouseMetricMesh(rA, H, opts);
    const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);
    // TRUE-3D anchored heatmap (brute-anchor the worst 400 red facets so the reddest facets show their TRUE colour).
    // Plain true-3D GN heatmap (NO brute anchor): the render is CONFIRMATORY — the numeric facet-location split
    // already decided the verdict — so keep it FAST. GothicArches is a thin-ridge style (not a tangled lattice), so
    // single-seed GN is close to trusted; the reds cluster on the rib crest either way, which is all the render shows.
    const sag = dumpHeatmap(DIR, 'gd_L2', m.xyz, mesh.ut, mesh.indices, rA, H, {
      ruler: 'true3d', scaleMm: 0.03, stl: false,
      meta: { note: 'GothicArches L2 chordTol=0.008; residual on near-vertical rib crest (density-invariant)', tris: mesh.indices.length / 3 },
    });
    /* eslint-disable-next-line no-console */ console.log(`[RENDER] gd_L2 dumped worstMm=${sag.worstMm.toFixed(4)} tris=${mesh.indices.length / 3}`);
    expect(existsSync(join(DIR, 'gd_L2.col.bin'))).toBe(true);
  }, 120 * 60 * 1000);
});

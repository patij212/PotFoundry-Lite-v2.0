// _sfb1Probe.test.ts — DEV-ONLY (env PF_SFB1=1). "SFB @1" = SuperformulaBlossom at sf_strength=1 (full blossom, sharp
// petal corners) — try the ArtDeco-breakthrough recipe on a DIFFERENT feature class (petal-corner ridges, not radius
// steps). SFB is single-valued r=rA(θ,z) ⇒ perFaceTrue3DSag (facet→nearest true surface) is a valid genuine-3D ruler.
// SAFE + CHECKPOINTED: base conforming recipe (metric-Delaunay + pinned refined crests, NO chordSteiner — its RADIAL
// guard EXPLODES on near-vertical petal corners, which hung the first run), maxPoints CAPPED so it can't blow the budget,
// and every stage is logged to disk (research/exchange/_sfb1/ckpt.txt) so a stall is visible. Isolated: CALLS the kernel.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator, featureLineChord3D,
  liftUtToRadial, triangleQualityDistribution, auditNonManByIndex, perFaceTrue3DSag, dumpHeatmap,
  type StyleDims, type FeatureTruth,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as StyleId;
const PARAMS = { sf_strength: 1 }; // "@1" = full blossom (sharp), other params default
const DIR = join('research', 'exchange', '_sfb1');
const CKPT = join(DIR, 'ckpt.txt');
const SEAM = 0.01;
const MAXP = Number(process.env.PF_SFB1_MAXP ?? 1_500_000);
const ck = (s: string): void => { appendFileSync(CKPT, s + '\n'); /* eslint-disable-next-line no-console */ console.log(s); };
const pct = (a: Float64Array, p: number): number => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

describe('SFB @1 (sf_strength=1) — sharp petals, honest-3D baseline', () => {
  it.skipIf(process.env.PF_SFB1 !== '1')('measure honest-3D + heatmap + STL (safe, checkpointed)', () => {
    mkdirSync(DIR, { recursive: true });
    ck(`[sfb1] start maxPoints=${MAXP}`);
    const rA = buildRadiusFn(STYLE, PARAMS, DIMS);
    const truth = buildFeatureTruth(STYLE, PARAMS, DIMS, 384);
    const interiorTruth: FeatureTruth = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)) };
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));
    ck(`[sfb1] skeleton ${pslg.points.length / 2} pts / ${pslg.edges.length / 2} edges — building mesh…`);

    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      tolMm: 0.004, hMin: 0.004, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
      maxPoints: MAXP, splitThresh: 1.5, optimizeSweeps: 2,
      guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true, // NO chordSteiner (radial guard explodes on near-vertical corners)
    });
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    const nV = ut.length / 2; const budgetHit = nV >= MAXP - 5000;
    ck(`[sfb1] built tris=${idx.length / 3} verts=${nV}${budgetHit ? ' *** BUDGET-HIT ***' : ''} — measuring honest-3D…`);

    const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
    const sag = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: 0.01 }); // accurate at the 0.01 bar, faster
    ck(`[sfb1] measured true-3D worst=${sag.worstMm.toFixed(4)} — feature-line + quality…`);
    const p99 = pct(sag.faceErr, 0.99);
    const fl3 = featureLineChord3D(interiorTruth, buildLocator(meshUt, 256), meshUt, rA, DIMS.H, 0.05, 0, 4);
    const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: mesh.indices });
    const nonMan = auditNonManByIndex(meshUt.xyz, idx);
    dumpHeatmap(DIR, 'sfb1', meshUt.xyz, ut, idx, rA, DIMS.H, { ruler: 'true3d', scaleMm: 0.01, preFilterMm: 0.01, stl: true, meta: { label: 'SFB @1 (sf_strength=1) sharp petals vs true 3D', featLineP99: fl3.p99Mm, minAngle: q.minAngleDeg, nonMan } });
    ck(`[sfb1] RESULT tris=${idx.length / 3}${budgetHit ? ' BUDGET-HIT' : ''} | TRUE-3D worst=${sag.worstMm.toFixed(4)} p99=${p99.toFixed(4)} %>0.01=${(100 * sag.fracOver(0.01)).toFixed(3)} %>0.03=${(100 * sag.fracOver(0.03)).toFixed(3)} | featLine p99=${fl3.p99Mm.toFixed(4)} | minAngle=${q.minAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} | nonMan=${nonMan}`);
    ck(`[sfb1] ALL-GREEN@0.01 (worst<0.012)? ${sag.worstMm < 0.012 ? 'YES' : `NO — worst ${sag.worstMm.toFixed(4)}mm, ${(100 * sag.fracOver(0.01)).toFixed(3)}% over 0.01`}`);
    expect(idx.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});

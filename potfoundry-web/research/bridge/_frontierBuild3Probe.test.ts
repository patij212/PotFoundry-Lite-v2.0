// _frontierBuild3Probe.test.ts — DEV-ONLY (env PF_BUILD3=1). FRONTIER BUILD #3: drive the chord-error heatmap
// FULLY GREEN (no yellow, no red) — every facet's chord sag below the green band. Heatmap ramp is green(0)→yellow
// (0.075mm)→red(≥0.15mm), so "fully green" ⇒ max facet sag < ~0.03mm (x<0.2). Mechanism = build #2 (metric-Delaunay
// under M + pinned refined-crest vertices, no locks) + the kernel chord-sag guard `chordTolMm` (splits ANY facet
// whose true-surface sag exceeds tol). Isolated: CALLS the kernel; edits nothing. Reports the exact color-band
// fractions + renders the heatmap.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt,
  liftUtToRadial, triangleQualityDistribution, auditNonManByIndex,
  perFaceChordSag, vertErrColors, dumpRenderBins, type StyleDims,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_build3');
const SEAM = 0.01;
const CHORD_TOL = Number(process.env.PF_BUILD3_TOL ?? 0.03); // green target: facet sag <= this
const MAXP = Number(process.env.PF_BUILD3_MAXP ?? 4_000_000);
const HMIN = Number(process.env.PF_BUILD3_HMIN ?? 0.003);

describe('FRONTIER BUILD #3 — drive the heatmap FULLY GREEN (chordTolMm)', () => {
  it.skipIf(process.env.PF_BUILD3 !== '1')('GothicArches: metric + pinned crests + chord-sag guard', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));

    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      tolMm: 0.004, hMin: HMIN, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
      maxPoints: MAXP, splitThresh: 1.5, optimizeSweeps: 2,
      guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true, chordTolMm: CHORD_TOL,
    });
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
    const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
    const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: mesh.indices });
    const nonMan = auditNonManByIndex(meshUt.xyz, idx);
    dumpRenderBins(DIR, 'build3_green', meshUt.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { chordTol: CHORD_TOL, worst: sag.worstMm, nonMan }, stl: true });
    // color-band fractions vs the heatmap ramp (green<0.03, yellow 0.05–0.15, red>=0.15)
    const red = 100 * sag.fracOver(0.10), yellow = 100 * (sag.fracOver(0.05) - sag.fracOver(0.10)), overGreen = 100 * sag.fracOver(0.03);
    // eslint-disable-next-line no-console
    console.log(`BUILD3 chordTol=${CHORD_TOL} tris=${idx.length / 3} worstSag=${sag.worstMm.toFixed(4)}mm | RED(>0.1)=${red.toFixed(4)}% YELLOWish(0.05-0.1)=${yellow.toFixed(4)}% >0.03=${overGreen.toFixed(3)}% | minA=${q.minAngleDeg.toFixed(2)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nonMan}`);
    // eslint-disable-next-line no-console
    console.log(`FULLY GREEN (worst < ~0.03mm)? ${sag.worstMm < 0.035 ? 'YES' : `NO — worst ${sag.worstMm.toFixed(3)}mm (${overGreen.toFixed(3)}% of faces > 0.03)`}`);
    expect(idx.length).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});

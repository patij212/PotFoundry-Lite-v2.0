// _frontierBuild2Probe.test.ts — DEV-ONLY (env PF_BUILD2=1). FRONTIER BUILD #2: de-sliver the protected mesh.
// Build #1 (pin crest vertices + LOCKED constraint edges) hit true-3D p99 0.084 but regressed slivers (%<20 0.6→6.5,
// minA→0) — because the LOCKED edges block the kernel's true-3D max-min-angle flips, and recovery was only 42% (so
// the locked edges barely contributed to fidelity anyway). Hypothesis: PIN the crest vertices (keep fidelity) but
// DROP the locked edges (let the metric flips de-sliver). A/B: pin+lock (build #1) vs pin-no-lock (build #2-A).
// Also a coarser-injection variant (metric-spaced crest points) if dense pinning itself slivers. Isolated: CALLS
// the in-house kernel + committed hooks; edits nothing. Dumps heatmaps for the render.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator,
  featureLineChord3D, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, vertErrColors, dumpRenderBins, type StyleDims, type FeatureTruth,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_build2');
const SEAM = 0.01;
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;

describe('FRONTIER BUILD #2 — de-sliver: pinned crests, no locked edges', () => {
  it.skipIf(process.env.PF_BUILD2 !== '1')('GothicArches: pin+lock vs pin-no-lock under M', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const interiorTruth: FeatureTruth = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)) };
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));

    const measure = (label: string, mesh: { ut: number[] | Float64Array; indices: Uint32Array; constraint?: { requested: number; recovered: number } }): void => {
      const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
      const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
      const fl3 = featureLineChord3D(interiorTruth, buildLocator(meshUt, 256), meshUt, rA, DIMS.H, 0.05, 0, 4);
      const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: mesh.indices });
      const nonMan = auditNonManByIndex(meshUt.xyz, idx);
      const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
      dumpRenderBins(DIR, label, meshUt.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { true3D_p99: fl3.p99Mm, pctOver0_15: 100 * sag.fracOver(0.15), nonMan }, stl: false });
      const rec = mesh.constraint ? `${(100 * mesh.constraint.recovered / Math.max(1, mesh.constraint.requested)).toFixed(0)}%` : 'n/a';
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(20)} tris=${String(idx.length / 3).padStart(8)} true3D_p99=${fl3.p99Mm.toFixed(4)} max=${fl3.maxMm.toFixed(3)} minA=${q.minAngleDeg.toFixed(2)} p5=${q.p5MinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nonMan} rec=${rec}`);
    };

    // A/B: build #1 (pin + locked edges) vs build #2-A (pin crests, NO locked edges — flips free to de-sliver)
    measure('b2_pin_lock', buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true, constraintEdges: pslg.edges }));
    measure('b2_pin_nolock', buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true }));
    // build #2-B: crests injected but NOT pinned (flips + smoothing fully free) — tests if pinning is the sliver source
    measure('b2_nopin_nolock', buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: false }));
    expect(true).toBe(true);
  }, 45 * 60 * 1000);
});

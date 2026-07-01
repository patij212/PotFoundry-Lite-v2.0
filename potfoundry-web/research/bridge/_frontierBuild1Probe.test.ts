// _frontierBuild1Probe.test.ts — DEV-ONLY (env PF_BUILD1=1). FRONTIER BUILD #1: protected-skeleton constrained
// meshing UNDER THE METRIC M (Bet 1 protected-PLC + Bet 2 curvature metric, unified). In-house realization: the
// surface-metric kernel (metric-Delaunay under M=g/h²) + the refined+planarized feature skeleton via the committed
// injectedPoints/constraintEdges hooks (pinned, guarded). ISOLATED — CALLS the kernel, edits nothing.
//
// A/B vs the raw kernel (no skeleton). Metric sizing should close the interior-chord residual that the uniform-h
// gmsh embed left (0.51 raw-loci / 0.33 refined-loci); the protected refined skeleton keeps the crests as edges.
// Dumps render bins + STL + chord-sag heatmap colours for both. Renders shown via research/render/meshRender.cjs.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator,
  featureLineChord3D, crestValleyRetention, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, vertErrColors, dumpRenderBins, type StyleDims, type FeatureTruth,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_build1');
const SEAM = 0.01;
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;

describe('FRONTIER BUILD #1 — protected skeleton under M (in-house)', () => {
  it.skipIf(process.env.PF_BUILD1 !== '1')('GothicArches: raw kernel vs protected-skeleton-under-M', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const interiorTruth: FeatureTruth = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)) };
    // refined + planarized protected skeleton
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));
    // eslint-disable-next-line no-console
    console.log(`protected skeleton: ${pslg.points.length / 2} pts / ${pslg.edges.length / 2} edges`);

    const measure = (label: string, mesh: { ut: number[] | Float64Array; indices: Uint32Array; constraint?: { requested: number; recovered: number } }): { p99: number; minA: number } => {
      const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
      const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
      const loc = buildLocator(meshUt, 256);
      const fl3 = featureLineChord3D(interiorTruth, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
      const cr = crestValleyRetention(interiorTruth, loc, rA, DIMS.H, 0.05);
      const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: mesh.indices });
      const nonMan = auditNonManByIndex(meshUt.xyz, idx);
      const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
      dumpRenderBins(DIR, label, meshUt.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { true3D_p99: fl3.p99Mm, pctOver0_15: 100 * sag.fracOver(0.15), nonMan }, stl: true });
      const rec = mesh.constraint ? 100 * mesh.constraint.recovered / Math.max(1, mesh.constraint.requested) : NaN;
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(18)} tris=${String(idx.length / 3).padStart(8)} true3D_p99=${fl3.p99Mm.toFixed(4)} max=${fl3.maxMm.toFixed(3)} crestU=${cr.crestUnderWorstMm.toFixed(3)} minA=${q.minAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nonMan} recovery=${Number.isNaN(rec) ? 'n/a' : rec.toFixed(1) + '%'}`);
      return { p99: fl3.p99Mm, minA: q.minAngleDeg };
    };

    const base = measure('build1_baseline', buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true }));
    const b1 = measure('build1_protected', buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true, constraintEdges: pslg.edges }));
    // eslint-disable-next-line no-console
    console.log(`BUILD1: raw kernel p99 ${base.p99.toFixed(4)} -> protected-under-M p99 ${b1.p99.toFixed(4)} | vs gmsh-embed uniform 0.51 / refined 0.33 | target <=0.112`);
    expect(b1.p99).toBeGreaterThan(0);
  }, 40 * 60 * 1000);
});

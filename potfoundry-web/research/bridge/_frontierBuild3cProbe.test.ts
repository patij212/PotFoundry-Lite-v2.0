// _frontierBuild3cProbe.test.ts — DEV-ONLY (env PF_BUILD3C=1). Is the GothicArches TRUE-3D residual (worst 0.58mm,
// 2.4% > 0.03) genuine under-tessellation (density-REDUCIBLE) or structural (FROZEN)? The verify probe showed the
// radial heatmap overstates ~2×, but the HONEST true-3D metric is ALSO red at the steep ribs — real error, not just
// the ruler. This sweeps hMin (density) for the pinned-crest mesh and measures the TRUE-3D metric
// (perpendicular3DDeviation) + radial at each level. If true-3D chordMax/nAbove fall with density → genuine, the
// lever is sizing; if frozen → structural (metric grid aliases the ridge, Bet 2). Renders the finest true-3D heatmap.
// Isolated: CALLS the kernel, edits nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, liftUtToRadial,
  auditNonManByIndex, perFaceChordSag, vertErrColors, dumpRenderBins,
  perpendicular3DDeviation, type StyleDims,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import { projectPointToRadialSurface } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_build3c');
const SEAM = 0.01;
const HMINS = (process.env.PF_B3C_HMINS ?? '0.008,0.004,0.0025').split(',').map(Number);
const BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

describe('FRONTIER BUILD #3c — true-3D density sweep (genuine vs frozen)', () => {
  it.skipIf(process.env.PF_BUILD3C !== '1')('GothicArches: does the honest true-3D residual fall with density?', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));

    const lines: string[] = ['BUILD3c true-3D density sweep (GothicArches, pinned crests):'];
    let finest: { xyz: Float64Array; idx: number[]; ut: number[] } | null = null;
    for (const hMin of HMINS) {
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
        tolMm: 0.004, hMin, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
        maxPoints: 6_000_000, splitThresh: 1.5, optimizeSweeps: 2,
        guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true,
      });
      const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
      const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
      const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
      const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
      const p3 = perpendicular3DDeviation({ vertices: vtx, indices: Uint32Array.from(idx) }, ut, rA, { H: DIMS.H, tolMm: 0.03 });
      const nonMan = auditNonManByIndex(meshUt.xyz, idx);
      lines.push(`  hMin=${hMin} tris=${idx.length / 3} | RADIAL worst=${sag.worstMm.toFixed(3)} %>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)} | TRUE-3D chordMax=${p3.chordMaxMm.toFixed(4)} p99=${p3.p99DevMm.toFixed(4)} nAbove(>0.03)=${p3.nAbove}/${p3.samples} (${(100 * p3.nAbove / Math.max(1, p3.samples)).toFixed(2)}%) worst@θ=${p3.worst.theta.toFixed(2)},z=${p3.worst.z.toFixed(1)}=${p3.worst.mm.toFixed(4)} | nonMan=${nonMan}`);
      finest = { xyz: meshUt.xyz, idx, ut };
      void vtx;
    }
    // render the finest true-3D heatmap (project facets with radial>0.02; rest green)
    if (finest) {
      const { xyz, idx, ut } = finest; const nF = idx.length / 3;
      const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
      const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
      const t3 = new Float64Array(vtx.length / 3);
      for (let f = 0; f < nF; f++) {
        if (sag.faceErr[f] <= 0.02) continue;
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; let mx = 0;
        for (const [wa, wb, wc] of BARY) {
          const px = wa * vtx[3 * a] + wb * vtx[3 * b] + wc * vtx[3 * c];
          const py = wa * vtx[3 * a + 1] + wb * vtx[3 * b + 1] + wc * vtx[3 * c + 1];
          const pz = wa * vtx[3 * a + 2] + wb * vtx[3 * b + 2] + wc * vtx[3 * c + 2];
          const d = projectPointToRadialSurface(px, py, pz, rA).dist; if (d > mx) mx = d;
        }
        if (mx > t3[a]) t3[a] = mx; if (mx > t3[b]) t3[b] = mx; if (mx > t3[c]) t3[c] = mx;
      }
      let w = 0; for (let i = 0; i < t3.length; i++) if (t3[i] > w) w = t3[i];
      dumpRenderBins(DIR, 'build3c_true3d', xyz, idx, { colors: vertErrColors(t3, 0.15), meta: { metric: 'true3D', worst: w }, stl: false });
      lines.push(`  finest true-3D vertHeatmap worst=${w.toFixed(4)}mm`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(finest).not.toBeNull();
  }, 90 * 60 * 1000);
});

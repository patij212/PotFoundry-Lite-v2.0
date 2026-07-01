// _frontierBuild3dProbe.test.ts — DEV-ONLY (env PF_BUILD3D=1). Run the ACTUAL production green-push recipe
// (featConformGreen.test.ts:94 — chordTolMm 0.01 + chordSteiner + curvatureFineStep 1/2048 + curvatureSubsamples 2)
// on GothicArches and measure it under the HONEST dual ruler. Key question: the kernel chord guard measures the
// SAME-(u,t) RADIAL sag (inhouseMetricMesh.ts chordSag: liftP(su,st) at the same bary), which OVERSTATES near-vertical
// relief and is IRREDUCIBLE there (build #3b froze at 1.25mm). So does the recipe (a) make GothicArches true-3D GREEN,
// or (b) explode toward the point budget chasing an artifact it can never satisfy? Variants isolate the two root
// fixes (curvature sizing vs chord Steiner). Isolated: CALLS the kernel with committed opts; edits NOTHING.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator, featureLineChord3D,
  liftUtToRadial, auditNonManByIndex, perFaceChordSag, vertErrColors, dumpRenderBins,
  perpendicular3DDeviation, type StyleDims, type FeatureTruth, type InhouseMeshOpts,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import { projectPointToRadialSurface } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_build3d');
const SEAM = 0.01;
const BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
// maxPoints capped at 2.5M so a NON-converging variant HITS the cap (flagged) instead of overflowing the 2^24 Map.
const MAXP = 2_500_000;
const BASE = { tolMm: 0.004, hMin: 0.003, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: MAXP, splitThresh: 1.5, optimizeSweeps: 2, guardManifoldAlways: true } as const;
const CKPT = join(DIR, 'build3d_ckpt.txt');

describe('FRONTIER BUILD #3d — production green-push recipe under the honest ruler', () => {
  it.skipIf(process.env.PF_BUILD3D !== '1')('GothicArches: does chordSteiner+curvatureFine reach true-3D green?', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const interiorTruth: FeatureTruth = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)) };
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));
    const inj = { injectedPoints: pslg.points, pinInjected: true } as const;

    const variants: Array<{ label: string; opts: InhouseMeshOpts }> = [
      { label: 'A_curvOnly', opts: { ...BASE, ...inj, curvatureFineStep: 1 / 2048, curvatureSubsamples: 2 } },
      { label: 'B_steinerOnly', opts: { ...BASE, ...inj, chordTolMm: 0.01, chordSteiner: true } },
      { label: 'C_greenpush', opts: { ...BASE, ...inj, chordTolMm: 0.01, chordSteiner: true, curvatureFineStep: 1 / 2048, curvatureSubsamples: 2 } },
    ];

    let last: { xyz: Float64Array; idx: number[]; ut: number[]; sagFace: Float64Array } | null = null;
    const out: string[] = ['BUILD3d GothicArches — green-push recipe, honest dual ruler:'];
    appendFileSync(CKPT, out[0] + '\n');
    for (const v of variants) {
      let line: string;
      try {
        const mesh = buildInhouseMetricMesh(rA, DIMS.H, v.opts);
        const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
        const nV = ut.length / 2; const budgetHit = nV >= MAXP - 5000;
        const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
        const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
        const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
        const p3 = perpendicular3DDeviation({ vertices: vtx, indices: Uint32Array.from(idx) }, ut, rA, { H: DIMS.H, tolMm: 0.03 });
        const fl3 = featureLineChord3D(interiorTruth, buildLocator(meshUt, 256), meshUt, rA, DIMS.H, 0.05, 0, 4);
        const nonMan = auditNonManByIndex(meshUt.xyz, idx);
        line = `  ${v.label.padEnd(14)} tris=${String(idx.length / 3).padStart(8)} verts=${nV} | RADIAL worst=${sag.worstMm.toFixed(3)} %>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)} %>0.1=${(100 * sag.fracOver(0.1)).toFixed(3)} | TRUE-3D chordMax=${p3.chordMaxMm.toFixed(4)} p99=${p3.p99DevMm.toFixed(4)} nAbove(>0.03)=${(100 * p3.nAbove / Math.max(1, p3.samples)).toFixed(3)}% | featLine p99=${fl3.p99Mm.toFixed(4)} | nonMan=${nonMan}${budgetHit ? ' *** BUDGET-HIT (did NOT converge) ***' : ''}`;
        last = { xyz: meshUt.xyz, idx, ut, sagFace: sag.faceErr };
      } catch (e) {
        line = `  ${v.label.padEnd(14)} CRASHED: ${(e as Error).message} (mesh exploded past the 2^24 Map — catastrophic over-refinement, did NOT converge)`;
      }
      out.push(line);
      appendFileSync(CKPT, line + '\n'); // checkpoint IMMEDIATELY so a later crash can't lose this variant
    }
    // render the green-push variant's TRUE-3D heatmap (project facets with radial>0.02; rest green)
    if (last) {
      const { xyz, idx, ut, sagFace } = last; const nF = idx.length / 3;
      const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices; const t3 = new Float64Array(vtx.length / 3);
      for (let f = 0; f < nF; f++) {
        if (sagFace[f] <= 0.02) continue;
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
      dumpRenderBins(DIR, 'build3d_true3d', xyz, idx, { colors: vertErrColors(t3, 0.15), meta: { metric: 'true3D-greenpush', worst: w }, stl: false });
      dumpRenderBins(DIR, 'build3d_radial', xyz, idx, { colors: vertErrColors(perFaceChordSag(ut, idx, rA, DIMS.H).vertErr, 0.15), meta: { metric: 'radial-greenpush' }, stl: false });
      out.push(`  green-push true-3D vertHeatmap worst=${w.toFixed(4)}mm`);
    }
    // eslint-disable-next-line no-console
    console.log(out.join('\n'));
    expect(last).not.toBeNull();
  }, 90 * 60 * 1000);
});

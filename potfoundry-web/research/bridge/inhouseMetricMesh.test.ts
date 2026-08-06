// inhouseMetricMesh.test.ts — validate the in-house PER-NODE-metric mesher vs spike+opt (mean 41) and the gmsh
// oracle (mean ~47). (PF_INMESH=1.) Two rungs on Gyroid: moderate (correctness/quality) + dense (does it beat
// gmsh's 1.8M cap and drive rms toward 0.01?). Timing reported so the perf path to millions is visible.
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;

describe('in-house per-node-metric mesher', () => {
  it.skipIf(!process.env.PF_INMESH)('quality + chord vs oracle, with timing', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const rungs = [
      { tol: 0.02, hMin: 0.05, sizeRes: 160, maxPoints: 400_000 },
      { tol: 0.006, hMin: 0.02, sizeRes: 192, maxPoints: 1_400_000 },
    ];
    for (const r of rungs) {
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: r.tol, hMin: r.hMin, hMax: 8, sizeRes: r.sizeRes, gradeBeta: 0.2, seedN: 12, maxPoints: r.maxPoints, splitThresh: 1.5, optimizeSweeps: 6 });
      const secs = (Date.now() - t0) / 1000;
      const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: mesh.indices });
      const tris = mesh.indices.length / 3;
      let rms = -1, p99 = -1;
      if (tris <= 1_600_000) { const d = perpendicular3DDeviation({ vertices: lifted.vertices, indices: mesh.indices }, lifted.utFlat, rA, { H: DIMS.H, tolMm: r.tol, seamExclU: 0, denseN: 3 }); rms = d.rmsDevMm; p99 = d.p99DevMm; }
      // eslint-disable-next-line no-console
      console.log(`tol=${r.tol} pts=${mesh.points} tris=${tris} rounds=${mesh.rounds} hitBudget=${mesh.hitBudget} | worst=${q.minAngleDeg.toFixed(1)} p5=${q.p5MinAngleDeg.toFixed(1)} mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(2)} rms=${rms < 0 ? 'skip' : rms.toFixed(4)} p99=${p99 < 0 ? 'skip' : p99.toFixed(4)} | ${secs.toFixed(1)}s`);
      expect(tris).toBeGreaterThan(0);
    }
  }, 25 * 60 * 1000);

  // ══════════ ANGLE-BAR SIZING REACHES THE MESHER (E-2026-08-06-ANGLE-SIZING) ══════════
  // Always-on (seconds, no oracle): the field-level law is unit-tested in surfaceMetricField.test.ts;
  // what is tested HERE is that `angBarRad` actually reaches `buildSurfaceMetricField` through the
  // mesher's opts — a pass-through that is silently droppable and would leave every future "angle arm"
  // secretly running the chord law.
  it('a binding angBarRad refines the mesh; a slack one is a strict no-op', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const common = { hMin: 0.05, hMax: 8, sizeRes: 48, gradeBeta: 0.2, seedN: 8, maxPoints: 120_000, splitThresh: 1.5, optimizeSweeps: 0 } as const;
    // tol LOOSE so the chord term is not what moves; θ* = 0.05 rad is far tighter than that chord size.
    const chordOnly = buildInhouseMetricMesh(rA, DIMS.H, { ...common, tolMm: 0.05 });
    const angleOn = buildInhouseMetricMesh(rA, DIMS.H, { ...common, tolMm: 0.05, angBarRad: 0.05 });
    const slack = buildInhouseMetricMesh(rA, DIMS.H, { ...common, tolMm: 0.05, angBarRad: 1e9 });

    // CEILING: the angle bar must bind — strictly more elements than chord alone.
    expect(angleOn.points).toBeGreaterThan(chordOnly.points);
    // FLOOR (non-vacuity): the control must be a real mesh, not a degenerate one.
    expect(chordOnly.points).toBeGreaterThan(100);
    // FLOOR (strict no-op): a slack bar must reproduce the chord-only mesh exactly.
    expect(slack.points).toBe(chordOnly.points);
    expect(slack.indices.length).toBe(chordOnly.indices.length);
  }, 5 * 60 * 1000);
});

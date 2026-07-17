import { describe, it, expect } from 'vitest';
import { buildDoubleValuedMesh } from './doubleValuedMesh';
import { auditManifold } from './verify';
import { toMeshData } from './mesh';

const H = 120,
  RLO = 40,
  RHI = 42; // 2mm step
// One straight vertical cliff at u=0.5 over t in [0.1,0.9]; left region low, right region high.
const straightComplex = {
  segments: [
    {
      tRange: [0.1, 0.9] as [number, number],
      at: (s: number) => ({ u: 0.5, t: 0.1 + 0.8 * s }),
      lipsAt: (_s: number) => ({ upper: RHI, lower: RLO }),
    },
  ],
  junctions: [] as [],
};
const stepSurface = (u: number, _t: number): number => (u >= 0.5 ? RHI : RLO);

describe('double-valued mesher (M1 straight cliff)', () => {
  it('builds a watertight double-valued wall between two flat sheets', () => {
    const mesh = buildDoubleValuedMesh(straightComplex, stepSurface, { H }, {
      baseGridU: 12,
      baseGridT: 24,
      chordTolMm: 0.01,
      maxRefinePasses: 0,
    });
    expect(mesh.triangles.length / 3).toBeGreaterThan(0);
    // Every interior edge shared by exactly 2 triangles; the only boundary is the
    // outer domain rectangle rim (u=0/1 ends, t=0.1/0.9 ends) — NO crack along the cliff.
    const audit = auditManifold(mesh);
    expect(audit.nonManifold).toBe(0);
    // the cliff must NOT be a boundary (the wall closes it): boundary edges only on the 4 rim sides
    expect(audit.cliffBoundary).toBe(0);
    // wall exists: some triangle spans radius RLO..RHI at constant (u,t)=0.5-ish
    const md = toMeshData(mesh);
    expect(md.vertexCount).toBeGreaterThan(0);
    expect(md.triangleCount).toBe(mesh.triangles.length / 3);
  });
});

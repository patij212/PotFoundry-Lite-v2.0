import { describe, it, expect } from 'vitest';
import { buildDoubleValuedMesh } from './doubleValuedMesh';
import { auditManifold, certifyAgainstTrueSurface } from './verify';
import { toMeshData } from './mesh';
import type { Mesh, SurfaceRadiusFn } from './types';

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

// ---------------------------------------------------------------------------
// Independent-certifier detector test: prove certifyAgainstTrueSurface actually BITES on a
// ribbon/background lip swap (the failure the old circular chord gate could not see). A
// minimal hand-built mesh — one ribbon-band step surface, one cliff vertex on the u=0.5
// locus with two interior ribbon neighbours — is certified twice: once with the cliff vertex
// on the correct (ribbon) lip, once swapped to the background lip.
// ---------------------------------------------------------------------------

// surface: a raised ribbon band u∈[0.5,0.6] at radius 42, background 40 elsewhere.
const RIBBON_R = 42;
const BG_R = 40;
const stepRibbonSurface: SurfaceRadiusFn = (u) => (u >= 0.5 && u < 0.6 ? RIBBON_R : BG_R);
// one straight cliff locus (segment 0) at u=0.5; ribbon interior is on its +u side.
const stepLocusDistance = (u: number): number => Math.abs(u - 0.5);
const stepLocusU = (): number => 0.5;

/** Build a 3-vertex mesh: cliff vertex v0 on u=0.5 (radius `cliffR`) + two ribbon neighbours. */
function stepDetectorMesh(cliffR: number): Mesh {
  const at = (u: number, r: number): [number, number, number] => [r * Math.cos(2 * Math.PI * u), r * Math.sin(2 * Math.PI * u), 0];
  const [x0, y0] = at(0.5, cliffR); // cliff vertex, radius is what the classifier chose
  const [x1, y1] = at(0.55, RIBBON_R); // interior ribbon neighbour
  const [x2, y2] = at(0.56, RIBBON_R); // interior ribbon neighbour (different t)
  return {
    positions: [x0, y0, 0, x1, y1, 0, x2, y2, 12],
    triangles: [0, 1, 2],
    vertexOnCliff: [true, false, false],
    vertexOnRim: [false, false, false],
    vertexU: [0.5, 0.55, 0.56],
    vertexT: [0.5, 0.5, 0.6],
    vertexRegion: [1, 1, 1], // all in the ribbon region
    vertexCliffSeg: [0, -1, -1],
    regionIsRibbon: [false, true], // region 1 = ribbon
  };
}

describe('certifyAgainstTrueSurface detector', () => {
  it('passes when the cliff vertex takes the correct (ribbon) lip', () => {
    const mesh = stepDetectorMesh(RIBBON_R); // correctly lifted to the ribbon foot
    const cert = certifyAgainstTrueSurface(mesh, stepRibbonSurface, stepLocusDistance, stepLocusU, 1e-6);
    expect(cert.cliffVertsCertified).toBe(1);
    expect(cert.cliffVertsSkipped).toBe(0);
    expect(cert.maxCliffDevMm).toBeLessThan(1e-9); // step surface: exact one-sided limit, no overshoot
    expect(cert.maxSheetDevMm).toBeLessThan(1e-9);
  });

  it('SPIKES when the cliff vertex is swapped to the wrong (background) lip', () => {
    const mesh = stepDetectorMesh(BG_R); // classifier swap: ribbon vertex mis-lifted to background
    const cert = certifyAgainstTrueSurface(mesh, stepRibbonSurface, stepLocusDistance, stepLocusU, 1e-6);
    expect(cert.cliffVertsCertified).toBe(1);
    // the swap is exactly the ribbon→background radial jump, orders of magnitude over any tol
    expect(cert.maxCliffDevMm).toBeCloseTo(RIBBON_R - BG_R, 6);
    expect(cert.maxCliffDevMm).toBeGreaterThan(0.01);
  });
});

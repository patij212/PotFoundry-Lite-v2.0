import { describe, it, expect } from 'vitest';
import { summarizeConformingValidation } from './ParametricExportComputer';
import { assembleWatertight, type AssemblyDimensions } from './parametric/conforming/WatertightAssembly';
import type { SurfaceSampler, Vec3 } from './parametric/conforming/SurfaceSampler';

/**
 * CPU-assembled conforming mesh validation (Plan Task 2.2).
 *
 * Mirrors the `evalSurface` CPU re-implementation in WatertightAssembly.test.ts
 * so the conforming validationSummary is exercised WITHOUT a GPU. The conforming
 * branch in ParametricExportComputer builds the same watertight assembly and then
 * GPU-evaluates the packed (u,t,surfaceId) vertices to 3D; here we evaluate them
 * on the CPU with the identical geometry and feed pos3D + indices through the same
 * `summarizeConformingValidation` helper the production branch uses.
 */

/** 3D position for a given (u, t, surfaceId) — the GPU's evaluate_vertices. */
function evalSurface(
  Ro: number,
  Ri: number,
  H: number,
  tBottom: number,
  rDrain: number,
  u: number,
  t: number,
  surfaceId: number,
): Vec3 {
  const theta = 2 * Math.PI * (u - Math.floor(u));
  const s = surfaceId;
  let r: number;
  let z: number;
  if (s < 0.5) {
    r = Ro;
    z = t * H;
  } else if (s < 1.5) {
    r = Ri;
    z = tBottom + t * (H - tBottom);
  } else if (s < 2.5) {
    r = Ri + (Ro - Ri) * t;
    z = H;
  } else if (s < 3.5) {
    r = Ro + (rDrain - Ro) * t;
    z = 0;
  } else if (s < 4.5) {
    r = Ri + (rDrain - Ri) * t;
    z = tBottom;
  } else {
    r = rDrain;
    z = t * tBottom;
  }
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

function wallSampler(
  Ro: number,
  Ri: number,
  H: number,
  tBottom: number,
  rDrain: number,
  surfaceId: number,
): SurfaceSampler {
  return {
    position: (u: number, t: number): Vec3 =>
      evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, surfaceId),
  };
}

/** Evaluate every packed (u,t,surfaceId) vertex to 3D via the CPU geometry. */
function eval3D(
  geom: (u: number, t: number, s: number) => Vec3,
  packed: Float32Array,
): Float32Array {
  const n = packed.length / 3;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = geom(packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2]);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  }
  return out;
}

const WALL_OPTS = {
  maxSagMm: 0.5,
  maxEdgeMm: 200,
  minEdgeMm: 1,
  gradeRatio: 2,
  maxLevel: 7,
  resU: 33,
  resT: 9,
  nRing: 32,
};

describe('summarizeConformingValidation — conforming output (CPU assembly)', () => {
  // Default-dims-like pot (concentric cylinders + rim + base + drain).
  const Ro = 70;
  const Ri = 66;
  const H = 120;
  const tBottom = 8;
  const rDrain = 10;
  const dims: AssemblyDimensions = { H, tBottom, rDrain };
  const outer = wallSampler(Ro, Ri, H, tBottom, rDrain, 0);
  const inner = wallSampler(Ro, Ri, H, tBottom, rDrain, 1);
  const geom = (u: number, t: number, s: number): Vec3 =>
    evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, s);

  const asm = assembleWatertight(outer, inner, dims, WALL_OPTS);
  const pos3D = eval3D(geom, asm.vertices);
  const summary = summarizeConformingValidation(pos3D, asm.indices);

  it('returns a populated ValidationSummary (not undefined)', () => {
    expect(summary).toBeDefined();
    expect(typeof summary.valid).toBe('boolean');
    expect(Array.isArray(summary.warnings)).toBe(true);
    expect(typeof summary.minAngleDeg).toBe('number');
    expect(typeof summary.maxAspectRatio).toBe('number');
  });

  it('reports the by-construction watertight conforming mesh as valid', () => {
    // The assembly is watertight/manifold/oriented/sliver-free by construction,
    // so every topology + quality check must pass and `valid` must be true.
    expect(summary.manifoldOk).toBe(true);       // boundaryEdges + nonManifoldEdges = 0
    expect(summary.normalsOk).toBe(true);        // orientationMismatches = 0
    expect(summary.triangleQualityOk).toBe(true); // sliverCount = 0
    expect(summary.degeneratesOk).toBe(true);
    expect(summary.valid).toBe(true);
    expect(summary.warnings).toEqual([]);
  });

  it('surfaces boundaryEdges/nonManifoldEdges/orientationMismatches/sliverCount as warnings when defects exist', () => {
    // Inject a naked edge: append one stray triangle referencing a fresh vertex
    // that no other triangle shares → 3 boundary edges, 1 sliver-ish degenerate.
    const v = pos3D.length / 3;
    const defectPos = new Float32Array(pos3D.length + 9);
    defectPos.set(pos3D, 0);
    // A thin degenerate-ish stray triangle far from the surface.
    defectPos.set([200, 0, 0, 200.0001, 0, 0, 200, 0.0001, 0], pos3D.length);
    const defectIdx = new Uint32Array(asm.indices.length + 3);
    defectIdx.set(asm.indices, 0);
    defectIdx.set([v, v + 1, v + 2], asm.indices.length);

    const defectSummary = summarizeConformingValidation(defectPos, defectIdx);
    expect(defectSummary.manifoldOk).toBe(false); // boundary edges now > 0
    expect(defectSummary.valid).toBe(false);
    expect(defectSummary.warnings.length).toBeGreaterThan(0);
    // The four named metrics are surfaced in the human-readable warnings.
    const joined = defectSummary.warnings.join(' ');
    expect(joined).toMatch(/boundary|non-manifold|orientation|sliver/i);
  });
});

/**
 * Sliver (finite-area) vs degenerate (zero-area) gating (E-2026-07-09-EXPORT-PERF).
 *
 * A closed tetrahedron is the minimal watertight/manifold/oriented triangle
 * mesh — perturbing ONE vertex changes triangle quality without touching the
 * index-based topology, isolating the sliver/degenerate axis from
 * manifold/orientation. Face winding verified analytically (positively-
 * oriented ABCD ⇒ outward faces BCD/ADC/ABD/ACB); the control test below
 * pins that the fixture itself is manifold+oriented before trusting the
 * perturbed variants.
 */
describe('summarizeConformingValidation — sliver vs degenerate gating', () => {
  const A: [number, number, number] = [0, 0, 0];
  const B: [number, number, number] = [1, 0, 0];
  const C: [number, number, number] = [0, 1, 0];
  const D: [number, number, number] = [0, 0, 1];
  const FACES = [
    [1, 2, 3], // B,C,D — opposite A
    [0, 3, 2], // A,D,C — opposite B
    [0, 1, 3], // A,B,D — opposite C
    [0, 2, 1], // A,C,B — opposite D
  ];
  const idx = new Uint32Array(FACES.flat());
  const verts = (pts: Array<[number, number, number]>): Float32Array =>
    new Float32Array(pts.flat());

  it('control: the closed tetrahedron fixture is manifold, oriented, and sliver-free', () => {
    const s = summarizeConformingValidation(verts([A, B, C, D]), idx);
    expect(s.manifoldOk).toBe(true);
    expect(s.normalsOk).toBe(true);
    expect(s.degeneratesOk).toBe(true);
    expect(s.triangleQualityOk).toBe(true);
    expect(s.valid).toBe(true);
    expect(s.warnings).toEqual([]);
  });

  it('a finite-area sliver (one vertex stretched far away) stays valid — non-blocking warning only', () => {
    // D stretched far along its own ray from the ABC plane: same side (z>0)
    // throughout, so the tetrahedron's combinatorial orientation is
    // preserved — only shape (aspect ratio), not topology, changes.
    const Dfar: [number, number, number] = [0.001, 0.001, 1000];
    const s = summarizeConformingValidation(verts([A, B, C, Dfar]), idx);
    expect(s.manifoldOk).toBe(true);
    expect(s.normalsOk).toBe(true);
    expect(s.triangleQualityOk).toBe(false); // sliver(s) present
    expect(s.degeneratesOk).toBe(true); // finite area — NOT degenerate
    expect(s.valid).toBe(true); // finite-area slivers do not gate export
    expect(s.warnings.join(' ')).toMatch(/sliver/i);
    expect(s.warnings.join(' ')).not.toMatch(/degenerate/i);
  });

  it('a true zero-area (collinear) triangle DOES gate valid=false', () => {
    // D collapsed onto segment AB (z=0, midpoint) — face ABD (A,B,D) is
    // exactly collinear ⇒ zero area, a genuine defect, not a print-usable
    // needle.
    const Dflat: [number, number, number] = [0.5, 0, 0];
    const s = summarizeConformingValidation(verts([A, B, C, Dflat]), idx);
    expect(s.degeneratesOk).toBe(false);
    expect(s.valid).toBe(false);
    expect(s.warnings.join(' ')).toMatch(/degenerate/i);
  });
});

/**
 * parametricHausdorff.test.ts — TDD for the SURFACE→MESH direction (missing-feature
 * detection) that completes the two-sided Hausdorff measurement.
 *
 * mesh→surface (the projector) is structurally BLIND to surface the mesh OMITS: a
 * dropped strand or a hole emits no mesh sample, so every present facet can be
 * perfectly faithful while a whole feature is missing. surface→mesh
 * (`surfaceToMeshMaxMm`) samples the true surface Φ densely and measures each sample to
 * the NEAREST mesh triangle — so a hole shows up as a large distance (≈ the gap size).
 * The honest "true error including all features" is max(both directions).
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { surfaceToMeshMaxMm, twoSidedHausdorffMm } from './parametricHausdorff';
import { buildParametricSurfaceProjector, type ParametricSurface } from './parametricSurfaceProjector';

const TAU = 2 * Math.PI;
const R = 40;
const H = 100;

const cylinder: ParametricSurface = (u, v) => {
  const a = TAU * u;
  return [R * Math.cos(a), R * Math.sin(a), H * v] as const;
};

/** A cylinder wall grid, optionally omitting triangles whose centroid (u,t) is in a box. */
function cylinderMesh(nu: number, nt: number, hole?: { u0: number; u1: number; t0: number; t1: number }): {
  vertices: Float32Array; indices: Uint32Array;
} {
  const verts: number[] = [];
  for (let it = 0; it <= nt; it++) {
    const t = it / nt, z = H * t;
    for (let iu = 0; iu < nu; iu++) {
      const a = (iu / nu) * TAU;
      verts.push(R * Math.cos(a), R * Math.sin(a), z);
    }
  }
  const ring = (it: number, iu: number): number => it * nu + ((iu % nu) + nu) % nu;
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const uc = (iu + 0.5) / nu, tc = (it + 0.5) / nt;
      if (hole && uc > hole.u0 && uc < hole.u1 && tc > hole.t0 && tc < hole.t1) continue; // omit → a hole
      const a = ring(it, iu), b = ring(it, iu + 1), c = ring(it + 1, iu), d = ring(it + 1, iu + 1);
      idx.push(a, b, d, a, d, c);
    }
  }
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx) };
}

describe('surfaceToMeshMaxMm — catches surface the mesh is MISSING', () => {
  it('a faithful cylinder reads ≈0 (surface everywhere covered)', () => {
    const mesh = cylinderMesh(96, 48);
    const res = surfaceToMeshMaxMm(cylinder, mesh, { nu: 240, nv: 120, uPeriodic: true });
    expect(res.maxMm).toBeLessThan(0.05); // just the facet chord
  });

  it('a HOLED cylinder: surface→mesh is large where mesh→surface stays ≈0 (the asymmetry)', () => {
    const hole = { u0: 0.40, u1: 0.60, t0: 0.40, t1: 0.60 }; // ~0.2×0.2 of the domain
    const mesh = cylinderMesh(96, 48, hole);

    // ONE-SIDED mesh→surface: every PRESENT vertex sits exactly on Φ, so projecting the
    // mesh onto the surface reads ≈0 — it is blind to the missing patch.
    const projector = buildParametricSurfaceProjector(cylinder, { uPeriodic: true, nu: 192, nv: 96 });
    const V = mesh.vertices;
    let meshToSurfaceMax = 0;
    for (let i = 0; i + 2 < V.length; i += 3) {
      const d = projector.project(V[i], V[i + 1], V[i + 2]).dist;
      if (d > meshToSurfaceMax) meshToSurfaceMax = d;
    }
    expect(meshToSurfaceMax).toBeLessThan(0.05); // blind to the hole

    // SURFACE→MESH catches the hole: a Φ-sample at the hole centre is far from any
    // present triangle (nearest is at the hole rim). The hole spans t∈[0.4,0.6]·H = 20mm,
    // so the worst sample sits ~10mm from the mesh.
    const s2m = surfaceToMeshMaxMm(cylinder, mesh, { nu: 240, nv: 120, uPeriodic: true });
    expect(s2m.maxMm).toBeGreaterThan(5);
    // and the worst location is inside the hole.
    expect(s2m.worst.u).toBeGreaterThan(hole.u0 - 0.05);
    expect(s2m.worst.u).toBeLessThan(hole.u1 + 0.05);
    expect(s2m.worst.v).toBeGreaterThan(hole.t0 - 0.05);
    expect(s2m.worst.v).toBeLessThan(hole.t1 + 0.05);
  });
});

/** A cylinder mesh with the ring at row `it==nudgeRow` pushed +dMm radially outward. */
function nudgedCylinderMesh(nu: number, nt: number, nudgeRow: number, dMm: number): { vertices: Float32Array; indices: Uint32Array } {
  const m = cylinderMesh(nu, nt);
  const V = m.vertices;
  for (let it = 0; it <= nt; it++) {
    if (it !== nudgeRow) continue;
    for (let iu = 0; iu < nu; iu++) {
      const i = (it * nu + iu) * 3;
      const r = Math.hypot(V[i], V[i + 1]);
      const s = (r + dMm) / r;
      V[i] *= s; V[i + 1] *= s;
    }
  }
  return m;
}

describe('twoSidedHausdorffMm — true error including all features (both directions)', () => {
  it('faithful cylinder ⇒ both directions ≈0', () => {
    const mesh = cylinderMesh(96, 48);
    const h = twoSidedHausdorffMm(mesh, cylinder, { uPeriodic: true, nu: 200, nv: 100, denseN: 3 });
    expect(h.meshToSurfaceMm).toBeLessThan(0.05);
    expect(h.surfaceToMeshMm).toBeLessThan(0.05);
    expect(h.hausdorffMm).toBeLessThan(0.05);
  });

  it('a MISSING feature is caught by surface→mesh (mesh→surface would miss it)', () => {
    const mesh = cylinderMesh(96, 48, { u0: 0.40, u1: 0.60, t0: 0.40, t1: 0.60 });
    const h = twoSidedHausdorffMm(mesh, cylinder, { uPeriodic: true, nu: 200, nv: 100, denseN: 3 });
    expect(h.meshToSurfaceMm).toBeLessThan(0.05); // one-sided is blind
    expect(h.surfaceToMeshMm).toBeGreaterThan(5); // two-sided catches it
    expect(h.hausdorffMm).toBe(h.surfaceToMeshMm); // and it dominates the verdict
  });

  it('an OFF-SURFACE mesh is caught by mesh→surface (surface→mesh would miss it)', () => {
    // Push one ring 0.5mm outward: the mesh still COVERS the surface (surface→mesh small),
    // but its facets stray 0.5mm OFF it (mesh→surface ≈0.5).
    const mesh = nudgedCylinderMesh(96, 48, 24, 0.5);
    const h = twoSidedHausdorffMm(mesh, cylinder, { uPeriodic: true, nu: 200, nv: 100, denseN: 3 });
    expect(h.meshToSurfaceMm).toBeGreaterThan(0.4);
    expect(h.surfaceToMeshMm).toBeLessThan(0.5); // still covered (nearest triangle is close)
    expect(h.hausdorffMm).toBe(h.meshToSurfaceMm); // this direction dominates
  });
});

/**
 * radialParametricSurface.test.ts — TDD for the adapter that bridges a single-valued
 * radius field `rA(θ,z)` into the shape-agnostic `Φ(u,v)` interface.
 *
 * WHY. The whole single-valued roster is expressed as a radius field, and its rulers are
 * ONE-SIDED (mesh→surface) — structurally blind to a feature the mesh OMITS (a dropped
 * ridge emits no mesh sample, so mesh→surface reads ≈0). `twoSidedHausdorffMm` closes that
 * blind spot, but it consumes `Φ(u,v)`, not `rA(θ,z)`. This adapter is the missing bridge:
 * `Φ(u,v) = (rA·cosθ, rA·sinθ, z)` with `θ = 2π·u`, `z = z0 + height·v`. Feeding a radial
 * style through it makes the two-sided (missing-feature) measurement apply to every
 * single-valued style with zero change to the styles.
 *
 * Pure CPU, read-only, no production behaviour change.
 */
import { describe, it, expect } from 'vitest';
import { buildRadialParametricSurface } from './radialParametricSurface';
import { twoSidedHausdorffMm } from './parametricHausdorff';
import { buildAnalyticRadiusFn } from '../geometry/analyticRadius';

const TAU = 2 * Math.PI;
const R = 40, A = 1.0, K = 4;
/** A gentle rippled radius field: 4 angular lobes, a slow axial modulation. */
const rippleRadius = (theta: number, z: number): number => R + A * Math.sin(K * theta) * Math.cos(z * 0.05);

describe('buildRadialParametricSurface — maps (u,v) → (rA·cosθ, rA·sinθ, z)', () => {
  it('places each (u,v) exactly on the radius field (θ=2πu, z=z0+height·v)', () => {
    const z0 = 5, height = 100;
    const surf = buildRadialParametricSurface(rippleRadius, { z0, height });
    for (const [u, v] of [[0, 0], [0.1, 0.3], [0.37, 0.82], [0.5, 1], [0.99, 0.5]] as const) {
      const theta = TAU * u, z = z0 + height * v, r = rippleRadius(theta, z);
      const [x, y, zz] = surf(u, v);
      expect(x).toBeCloseTo(r * Math.cos(theta), 9);
      expect(y).toBeCloseTo(r * Math.sin(theta), 9);
      expect(zz).toBeCloseTo(z, 9);
    }
  });

  it('defaults to z0=0, height=1 (unit v-domain)', () => {
    const surf = buildRadialParametricSurface(rippleRadius);
    const theta = TAU * 0.25, z = 0.5, r = rippleRadius(theta, z);
    const [x, y, zz] = surf(0.25, 0.5);
    expect(x).toBeCloseTo(r * Math.cos(theta), 9);
    expect(y).toBeCloseTo(r * Math.sin(theta), 9);
    expect(zz).toBeCloseTo(0.5, 9);
  });
});

/** Sample the surface on an (nu × nt) grid → a watertight-in-u radial mesh, optionally
 *  omitting triangles whose centroid (u,t) falls in a box (→ a hole = a missing feature). */
function radialMesh(
  surf: (u: number, v: number) => readonly [number, number, number],
  nu: number, nt: number,
  hole?: { u0: number; u1: number; t0: number; t1: number },
): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  for (let it = 0; it <= nt; it++) {
    const t = it / nt;
    for (let iu = 0; iu < nu; iu++) {
      const p = surf(iu / nu, t);
      verts.push(p[0], p[1], p[2]);
    }
  }
  const ring = (it: number, iu: number): number => it * nu + ((iu % nu) + nu) % nu;
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const uc = (iu + 0.5) / nu, tc = (it + 0.5) / nt;
      if (hole && uc > hole.u0 && uc < hole.u1 && tc > hole.t0 && tc < hole.t1) continue;
      const a = ring(it, iu), b = ring(it, iu + 1), c = ring(it + 1, iu), d = ring(it + 1, iu + 1);
      idx.push(a, b, d, a, d, c);
    }
  }
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx) };
}

describe('adapter ∘ twoSidedHausdorffMm — two-sided coverage now reaches a radius-field style', () => {
  const height = 100;
  const surf = buildRadialParametricSurface(rippleRadius, { z0: 0, height });

  it('a faithful radial mesh reads ≈0 in both directions', () => {
    const mesh = radialMesh(surf, 96, 48);
    const h = twoSidedHausdorffMm(mesh, surf, { uPeriodic: true, nu: 200, nv: 100, denseN: 3 });
    expect(h.meshToSurfaceMm).toBeLessThan(0.05);
    expect(h.surfaceToMeshMm).toBeLessThan(0.05);
    expect(h.hausdorffMm).toBeLessThan(0.05);
  });

  it('a DROPPED feature (hole) is caught by surface→mesh — the one-sided ruler is blind to it', () => {
    const mesh = radialMesh(surf, 96, 48, { u0: 0.40, u1: 0.60, t0: 0.40, t1: 0.60 });
    const h = twoSidedHausdorffMm(mesh, surf, { uPeriodic: true, nu: 200, nv: 100, denseN: 3 });
    expect(h.meshToSurfaceMm).toBeLessThan(0.05); // every present facet still sits on Φ → blind
    expect(h.surfaceToMeshMm).toBeGreaterThan(5); // the true surface at the hole is far from any facet
    expect(h.hausdorffMm).toBe(h.surfaceToMeshMm); // and it dominates the verdict
  });
});

describe('adapter ∘ production buildAnalyticRadiusFn — the REAL analytic surface, not a hand-ripple', () => {
  // The EXACT surface the export pipeline / research champion score against (`{}` params =
  // the canonical default surface, so no snake_case/camelCase param-spelling hazard).
  const H = 100, Rb = 40, Rt = 30;
  const rA = buildAnalyticRadiusFn('HarmonicRipple', {}, { H, Rb, Rt });
  const surf = buildRadialParametricSurface(rA, { z0: 0, height: H });

  it('a faithful radial mesh COVERS the surface — surface→mesh reports the uniform-grid crest chord', () => {
    const mesh = radialMesh(surf, 128, 64);
    const h = twoSidedHausdorffMm(mesh, surf, { uPeriodic: true, nu: 220, nv: 110, denseN: 3 });
    // A present-everywhere UNIFORM grid still chords across the ripple crests: surface→mesh
    // reads ~0.55mm here (measured) — NOT a hole, the real sagitta a uniform grid leaves and
    // feature-conforming meshing exists to close to 0.01mm. Sub-mm ⇒ covered, vs ≫5mm for a hole.
    expect(h.surfaceToMeshMm).toBeGreaterThan(0.1); // genuine crest chord (uniform grid, not 0.01mm)
    expect(h.surfaceToMeshMm).toBeLessThan(1.0);    // …but bounded — the surface IS covered
  });

  it('a DROPPED ridge on the real style is caught by surface→mesh only', () => {
    const faithful = twoSidedHausdorffMm(radialMesh(surf, 128, 64), surf, { uPeriodic: true, nu: 220, nv: 110, denseN: 3 });
    const holed = twoSidedHausdorffMm(
      radialMesh(surf, 128, 64, { u0: 0.40, u1: 0.60, t0: 0.40, t1: 0.60 }), surf,
      { uPeriodic: true, nu: 220, nv: 110, denseN: 3 },
    );
    // The hole is invisible to the placement (mesh→surface) channel — its facets still sit on Φ…
    expect(holed.meshToSurfaceMm).toBeCloseTo(faithful.meshToSurfaceMm, 2);
    // …but surface→mesh exposes a whole missing band, adding ≫4mm of uncovered surface.
    expect(holed.surfaceToMeshMm).toBeGreaterThan(5);
    expect(holed.surfaceToMeshMm).toBeGreaterThan(faithful.surfaceToMeshMm + 4);
  });
});

/**
 * parametricSurfaceProjector.test.ts — TDD for the SHAPE-AGNOSTIC perpendicular
 * projector that measures against a surface as a PARAMETRIC 2-manifold Φ(u,v) rather
 * than a single-valued radius field rA(θ,z). Because Φ is single-valued in the (u,v)
 * chart even where its 3D image SELF-FOLDS, this is the primitive that measures
 * over/under (multi-sheet) walls — the feature the radial projector structurally
 * cannot represent (two r at one (θ,z)).
 *
 * The test surface is a TORUS: Φ(u,v) = ((R+ρcos2πv)cos2πu, (R+ρcos2πv)sin2πu,
 * z0+ρsin2πv). It is single-valued in (u,v) but TWO-VALUED in (θ,z): at a fixed
 * (θ, z) inside the tube band there is an OUTER foot (v≈0) and an INNER foot (v≈½).
 * The projector must resolve the CORRECT sheet — which a radial (θ,z)→r search cannot.
 * Cross-checked against a brute-force 2D (u,v) scan.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { buildParametricSurfaceProjector, type ParametricSurface } from './parametricSurfaceProjector';

const TAU = 2 * Math.PI;
const R = 50;
const RHO = 8;
const Z0 = 40;

const torus: ParametricSurface = (u, v) => {
  const a = TAU * u, b = TAU * v;
  const rr = R + RHO * Math.cos(b);
  return [rr * Math.cos(a), rr * Math.sin(a), Z0 + RHO * Math.sin(b)] as const;
};

/** Unit surface normal at (u,v) via the analytic tangents Φ_u × Φ_v. */
function torusNormal(u: number, v: number): [number, number, number] {
  const a = TAU * u, b = TAU * v;
  const rr = R + RHO * Math.cos(b);
  const ca = Math.cos(a), sa = Math.sin(a), sb = Math.sin(b), cb = Math.cos(b);
  const Xu = [-TAU * rr * sa, TAU * rr * ca, 0];
  const Xv = [-TAU * RHO * sb * ca, -TAU * RHO * sb * sa, TAU * RHO * cb];
  const nx = Xu[1] * Xv[2] - Xu[2] * Xv[1];
  const ny = Xu[2] * Xv[0] - Xu[0] * Xv[2];
  const nz = Xu[0] * Xv[1] - Xu[1] * Xv[0];
  const L = Math.hypot(nx, ny, nz);
  return [nx / L, ny / L, nz / L];
}

/** Trusted brute-force nearest point on Φ over the (u,v) domain (both periodic). */
function brute(px: number, py: number, pz: number, nU = 512, nV = 512): { u: number; v: number; dist: number } {
  const d2 = (u: number, v: number): number => {
    const [x, y, z] = torus(u, v);
    const dx = px - x, dy = py - y, dz = pz - z;
    return dx * dx + dy * dy + dz * dz;
  };
  let bu = 0, bv = 0, bf = Infinity;
  for (let i = 0; i < nU; i++) {
    for (let j = 0; j < nV; j++) {
      const u = i / nU, v = j / nV, f = d2(u, v);
      if (f < bf) { bf = f; bu = u; bv = v; }
    }
  }
  // Coordinate-descent polish.
  let hu = 1 / nU, hv = 1 / nV;
  for (let k = 0; k < 60; k++) {
    let improved = false;
    for (const [du, dv] of [[hu, 0], [-hu, 0], [0, hv], [0, -hv]] as const) {
      const f = d2(bu + du, bv + dv);
      if (f < bf) { bf = f; bu += du; bv += dv; improved = true; }
    }
    if (!improved) { hu *= 0.5; hv *= 0.5; }
  }
  return { u: bu, v: bv, dist: Math.sqrt(bf) };
}

function dist3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('buildParametricSurfaceProjector — nearest point on a self-folding Φ(u,v)', () => {
  const projector = buildParametricSurfaceProjector(torus, {
    uPeriodic: true, vPeriodic: true, nu: 256, nv: 256, seedTopK: 8,
  });

  it('recovers a normal-offset foot on the OUTER sheet (dist == offset, correct (u,v))', () => {
    const u0 = 0.3, v0 = 0.08; // outer sheet (v≈0 ⇒ largest radius)
    const s0 = torus(u0, v0);
    const n = torusNormal(u0, v0);
    const d = 0.5;
    const P: [number, number, number] = [s0[0] + d * n[0], s0[1] + d * n[1], s0[2] + d * n[2]];
    const proj = projector.project(P[0], P[1], P[2]);
    expect(proj.dist).toBeCloseTo(d, 3);
    // The recovered foot is the SAME surface point (⇒ the correct sheet), not the
    // inner sheet that shares this (θ,z).
    expect(dist3(torus(proj.u, proj.v), s0)).toBeLessThan(0.01);
  });

  it('resolves the INNER sheet when the point is nearer it (the multi-sheet discriminator)', () => {
    const u1 = 0.62, v1 = 0.55; // inner sheet (v≈½ ⇒ smallest radius)
    const s1 = torus(u1, v1);
    const n = torusNormal(u1, v1); // points toward the tube interior here
    const d = 0.4;
    // Offset INWARD (toward the axis / tube interior): −n moves into the tube.
    const P: [number, number, number] = [s1[0] - d * n[0], s1[1] - d * n[1], s1[2] - d * n[2]];
    const proj = projector.project(P[0], P[1], P[2]);
    const br = brute(P[0], P[1], P[2]);
    // Matches the trusted brute nearest point, and it is the INNER sheet (≈ s1), NOT
    // the outer sheet at the same (θ,z).
    expect(proj.dist).toBeCloseTo(br.dist, 3);
    expect(dist3(torus(proj.u, proj.v), s1)).toBeLessThan(0.02);
    expect(dist3(torus(proj.u, proj.v), torus(u1, 0.08))).toBeGreaterThan(2 * RHO - 1); // far from the outer sheet
  });

  it('matches the brute-force (u,v) scan across a spread of floating probe points', () => {
    let worstOver = 0; // proj must never UNDER-shoot the true nearest (it is a min over feet)
    let worstErr = 0;
    for (let i = 0; i < 40; i++) {
      // Floating points: torus points pushed off along the normal by a range of signed d.
      const u = (i * 0.137) % 1;
      const v = (i * 0.071 + 0.02) % 1;
      const s = torus(u, v);
      const n = torusNormal(u, v);
      const d = ((i % 5) - 2) * 0.35; // −0.7 .. +0.7, crosses both sheets
      const P: [number, number, number] = [s[0] + d * n[0], s[1] + d * n[1], s[2] + d * n[2]];
      const proj = projector.project(P[0], P[1], P[2]);
      const br = brute(P[0], P[1], P[2]);
      worstErr = Math.max(worstErr, Math.abs(proj.dist - br.dist));
      worstOver = Math.max(worstOver, proj.dist - br.dist); // proj is an upper bound ⇒ ≥ br
    }
    expect(worstErr).toBeLessThan(0.01);   // agrees with the exhaustive scan everywhere
    expect(worstOver).toBeLessThan(0.005); // never overstates the true nearest distance
  });
});

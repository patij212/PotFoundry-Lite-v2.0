/**
 * perpendicular3DDeviation.test.ts — TDD for the HONEST 3D (perpendicular) chord
 * metric and its core projection helper.
 *
 * The radial metric (radialAnalyticDeviation) measures |hypot(x,y) − r(θ,z)| —
 * the distance to the surface point at P's OWN (θ,z). On a steep relief face that
 * OVERSTATES the true geometric error (the closest surface point is at a different
 * θ/z). The perpendicular metric measures the SHORTEST 3D distance from P to the
 * surface S(θ,z) = (r·cosθ, r·sinθ, z) — the honest "is this triangle faithful"
 * gate. It is always ≤ radial, and ≪ radial where the surface tilts.
 *
 * Oracle 1 (closed form): for an axisymmetric cone r = R0 + k·z the shortest
 * distance from a radially-offset point = radialDev / √(1+k²) — exact.
 * Oracle 2 (normal offset): a point placed at S(θ,z) + d·n̂ has true shortest
 * distance exactly d, with foot (θ,z) — works for any smooth surface, recovers
 * the foot point even when it sits at a different θ than atan2(P).
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import {
  projectPointToRadialSurface,
  radialAnalyticDeviation,
  perpendicular3DDeviation,
  type AnalyticRadiusFn,
} from './analyticSurfaceGate';

const TAU = 2 * Math.PI;
const H = 120;
const wrap1 = (u: number): number => ((u % 1) + 1) % 1;

type Surface = (u: number, t: number) => readonly [number, number, number];

/** Build a known (nu×nt) grid mesh on `surface`, with the parallel (u,t,sid=0) stash. */
function buildGridMesh(
  nu: number,
  nt: number,
  surface: Surface,
  nudge?: (u: number, t: number, p: readonly [number, number, number]) => [number, number, number],
): { mesh3D: { vertices: Float32Array; indices: Uint32Array }; ut: Float32Array } {
  const nUv = nu + 1, nTv = nt + 1;
  const utv: number[] = [], v3: number[] = [];
  for (let it = 0; it < nTv; it++) {
    const t = it / nt;
    for (let iu = 0; iu < nUv; iu++) {
      const u = iu / nu;
      utv.push(u, t, 0);
      let p = surface(u, t);
      if (nudge) p = nudge(u, t, p);
      v3.push(p[0], p[1], p[2]);
    }
  }
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = it * nUv + iu, b = a + 1, c = a + nUv, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return {
    mesh3D: { vertices: Float32Array.from(v3), indices: Uint32Array.from(idx) },
    ut: Float32Array.from(utv),
  };
}

/** A radial surface from an rAnalytic closure (z = t·H). */
const surfaceOf = (rA: AnalyticRadiusFn): Surface => (u, t) => {
  const theta = TAU * u, z = t * H;
  const r = rA(theta, z);
  return [r * Math.cos(theta), r * Math.sin(theta), z] as const;
};

describe('projectPointToRadialSurface — shortest 3D distance to r(θ,z) surface', () => {
  it('cylinder (r=const): perpendicular == radial (normal is radial)', () => {
    const R = 50;
    const rFn: AnalyticRadiusFn = () => R;
    const phi = 0.9, zP = 37, rhoP = R + 0.8; // 0.8mm radially outside
    const px = rhoP * Math.cos(phi), py = rhoP * Math.sin(phi), pz = zP;

    const proj = projectPointToRadialSurface(px, py, pz, rFn);

    // On a cylinder the surface normal IS radial ⇒ perpendicular == radial dev.
    expect(proj.dist).toBeCloseTo(0.8, 6);
    expect(wrap1(proj.theta / TAU)).toBeCloseTo(wrap1(phi / TAU), 5);
    expect(proj.z).toBeCloseTo(zP, 4);
  });

  it('steep cone (r=R0+k·z): perpendicular == radialDev/√(1+k²), ≪ radial', () => {
    const R0 = 40, k = 2; // steep flare
    const rFn: AnalyticRadiusFn = (_theta, z) => R0 + k * z;
    const phi = 0.7, zP = 30;
    const rSurf = R0 + k * zP;
    const radialDev = 1.0;
    const rhoP = rSurf + radialDev; // 1mm radially outside the cone
    const px = rhoP * Math.cos(phi), py = rhoP * Math.sin(phi), pz = zP;

    const proj = projectPointToRadialSurface(px, py, pz, rFn);

    const expected = radialDev / Math.sqrt(1 + k * k); // = 1/√5 ≈ 0.4472
    expect(proj.dist).toBeCloseTo(expected, 4);
    // The headline property: the perpendicular distance is far below the radial.
    expect(proj.dist).toBeLessThan(radialDev * 0.5);
    // Axisymmetric ⇒ foot stays at the same azimuth.
    expect(wrap1(proj.theta / TAU)).toBeCloseTo(wrap1(phi / TAU), 4);
  });

  it('curved θ-varying surface: a normal-offset point has shortest distance == offset, foot at a shifted θ', () => {
    // r(θ,z) = R + A·cos(Nθ) + B·z — both azimuthal flutes and a z-slope, so the
    // normal tilts away from radial in BOTH directions.
    const R = 50, A = 2, N = 4, B = 0.5;
    const rFn: AnalyticRadiusFn = (theta, z) => R + A * Math.cos(N * theta) + B * z;
    const dr_dtheta = (theta: number): number => -A * N * Math.sin(N * theta);
    const dr_dz = B;

    const thetaS = 0.55, zS = 28;
    const r = rFn(thetaS, zS);
    const cs = Math.cos(thetaS), sn = Math.sin(thetaS);
    const rt = dr_dtheta(thetaS);
    // Unit surface normal n ∝ (r_θ sinθ + r cosθ, −r_θ cosθ + r sinθ, −r·r_z).
    let nx = rt * sn + r * cs, ny = -rt * cs + r * sn, nz = -r * dr_dz;
    const nlen = Math.hypot(nx, ny, nz);
    nx /= nlen; ny /= nlen; nz /= nlen;

    const sx = r * cs, sy = r * sn, sz = zS;
    const d = 0.2; // small offset (< local radius of curvature)
    const px = sx + d * nx, py = sy + d * ny, pz = sz + d * nz;

    const proj = projectPointToRadialSurface(px, py, pz, rFn);

    // The true shortest distance equals the normal offset.
    expect(proj.dist).toBeCloseTo(d, 4);
    // The foot is recovered at the surface parameter (θ,z) the point was offset from.
    expect(wrap1(proj.theta / TAU)).toBeCloseTo(wrap1(thetaS / TAU), 3);
    expect(proj.z).toBeCloseTo(zS, 2);

    // And it actually MOVED off the naive radial azimuth: the foot θ is closer to
    // thetaS than atan2(P) is (the radial metric would have used atan2(P)).
    const atan2Theta = wrap1(Math.atan2(py, px) / TAU);
    const footErr = Math.abs(wrap1(proj.theta / TAU) - wrap1(thetaS / TAU));
    const atan2Err = Math.abs(atan2Theta - wrap1(thetaS / TAU));
    expect(footErr).toBeLessThan(atan2Err);
  });
});

describe('perpendicular3DDeviation — the honest 3D chord metric over a mesh', () => {
  it('steep cone: perpendicular chordMax ≈ radial/√(1+k²), ≤ radial, vertex≈0', () => {
    const R0 = 45, k = 2; // steep flare
    const rA: AnalyticRadiusFn = (_theta, z) => R0 + k * z;
    const { mesh3D, ut } = buildGridMesh(48, 48, surfaceOf(rA));

    const optsArg = { H, tolMm: 0.1, seamExclU: 0, denseN: 12 };
    const radial = radialAnalyticDeviation(mesh3D, ut, rA, optsArg);
    const perp = perpendicular3DDeviation(mesh3D, ut, rA, optsArg);

    // Fundamental: the perpendicular distance never exceeds the radial residual.
    expect(perp.chordMaxMm).toBeLessThanOrEqual(radial.chordMaxMm + 1e-9);
    // Headline: the azimuthal facet sagitta is radial-inward; its perpendicular
    // distance to the cone = sagitta/√(1+k²). The worst sample is the same facet
    // location for both metrics ⇒ the MAX ratio ≈ 1/√(1+k²) = 1/√5 ≈ 0.447.
    const ratio = perp.chordMaxMm / radial.chordMaxMm;
    expect(ratio).toBeGreaterThan(0.40);
    expect(ratio).toBeLessThan(0.49);
    // The chord channel is non-trivial (it genuinely measures facet sag).
    expect(perp.chordMaxMm).toBeGreaterThan(0);
    // Vertices lie on the surface ⇒ the vertex channel reads the f32/f64 floor.
    expect(perp.vertexMaxMm).toBeLessThan(1e-4);
    expect(perp.nonFiniteCount).toBe(0);
    expect(perp.wallTriangles).toBe(radial.wallTriangles);
  }, 60000); // builds a 48² mesh + projects every steep facet sample

  it('detects an injected radial defect (one ring nudged +0.3mm outward)', () => {
    const R = 55;
    const rA: AnalyticRadiusFn = () => R; // cylinder (vertical wall: perp == radial)
    const targetT = 0.5;
    const nudge = (_u: number, t: number, p: readonly [number, number, number]): [number, number, number] => {
      if (Math.abs(t - targetT) > 1e-9) return [p[0], p[1], p[2]];
      const r = Math.hypot(p[0], p[1]);
      const s = (r + 0.3) / (r || 1);
      return [p[0] * s, p[1] * s, p[2]];
    };
    const { mesh3D, ut } = buildGridMesh(64, 64, surfaceOf(rA), nudge);
    const perp = perpendicular3DDeviation(mesh3D, ut, rA, { H, tolMm: 0.1, seamExclU: 0, denseN: 8 });

    // On a vertical wall the radial nudge is perpendicular ⇒ the metric must SEE it.
    expect(perp.vertexMaxMm).toBeGreaterThan(0.25);
    expect(perp.vertexMaxMm).toBeLessThan(0.35);
    expect(perp.nAbove).toBeGreaterThan(0);
  });

  it('excludes the u-seam band (tracked in seamBandMaxMm, not maxDevMm)', () => {
    const R = 50;
    const rA: AnalyticRadiusFn = () => R;
    const nudge = (u: number, _t: number, p: readonly [number, number, number]): [number, number, number] => {
      if (u > 1e-9 && u < 1 - 1e-9) return [p[0], p[1], p[2]];
      const r = Math.hypot(p[0], p[1]);
      const s = (r + 1.0) / (r || 1); // +1mm spike at the seam (u=0/1)
      return [p[0] * s, p[1] * s, p[2]];
    };
    const { mesh3D, ut } = buildGridMesh(64, 64, surfaceOf(rA), nudge);
    const perp = perpendicular3DDeviation(mesh3D, ut, rA, { H, tolMm: 0.1, seamExclU: 0.05, denseN: 6 });

    expect(perp.seamBandMaxMm).toBeGreaterThan(0.9); // captured in the seam channel
    expect(perp.maxDevMm).toBeLessThan(0.1);          // and NOT in the measured wall
  });
});

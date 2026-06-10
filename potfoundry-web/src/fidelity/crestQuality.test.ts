/**
 * crestQuality.test.ts — TDD guards for the STAGE 0 faithful crest-band
 * TRIANGLE-QUALITY metric (`crestBandTriangleQuality` in metrics.ts).
 *
 * The serration (chord-error) metric was reference-dominated at sharp cusps and
 * fooled a prior session. The min interior angle of a 3D triangle is a pure
 * function of the GPU-evaluated vertex positions — REFERENCE-FREE, so it cannot be
 * fooled by the reference. This metric reports the fraction of sub-bar (default
 * <15°) triangles WITHIN a crest band (centred on the sampler's per-row radius
 * extrema), not diluted by the clean bulk — the sharp gate for the diagonal/helical
 * crest fix. NOTE: a uniform (u,t) grid sampling a ridge produces chord-error but
 * NOT min-angle slivers (those come from the CDT fill around an inserted diagonal
 * constraint — a mesher concern, tested against the mesher). So these guards inject
 * KNOWN sliver triangles at known angular loci and verify the metric (a) reads 0 on
 * a plain pot, (b) attributes a crest-locus sliver to the band, (c) attributes an
 * off-crest sliver to the bulk — i.e. detection AND correct localization both ways.
 */
import { describe, it, expect } from 'vitest';
import { crestBandTriangleQuality, type PositionSampler } from './metrics';

const TAU = 2 * Math.PI;

/** Sharp triangle wave on [0,1) → [0,1]: 0 at the integer, 1 at the half. */
function triWave(x: number): number {
  const f = x - Math.floor(x);
  return 1 - 2 * Math.abs(f - 0.5);
}

/**
 * Analytic test surface: a cylinder with a SHARP vertical ridge crest.
 * `r(u,t) = R0 + amp·tri(m·u)` — a C0 kink at every ridge/valley, so the radius
 * EXTREMA ARE the sharp crest loci. amp=0 ⇒ a plain cylinder (no crest). Ridges
 * (maxima) sit at u = (k+0.5)/m → θ = 2π·(k+0.5)/m.
 */
class SharpRidgeSampler implements PositionSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly amp = 0,
    private readonly m = 0,
  ) {}

  position(u: number, t: number): readonly [number, number, number] {
    const r = this.R0 + (this.m > 0 ? this.amp * triWave(this.m * u) : 0);
    const theta = TAU * u;
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

/** Axis-aligned (u,t) wall mesh, vertices ON the sampler, periodic in u. */
function axisAlignedWallMesh(
  sampler: PositionSampler,
  nU: number,
  nT: number,
): { vertices: number[]; indices: number[] } {
  const verts: number[] = [];
  for (let j = 0; j < nT; j++) {
    const t = j / (nT - 1);
    for (let i = 0; i < nU; i++) {
      const p = sampler.position(i / nU, t);
      verts.push(p[0], p[1], p[2]);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nT - 1; j++) {
    for (let i = 0; i < nU; i++) {
      const i1 = (i + 1) % nU;
      const a = j * nU + i;
      const b = j * nU + i1;
      const c = (j + 1) * nU + i;
      const d = (j + 1) * nU + i1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return { vertices: verts, indices: idx };
}

/** Append a near-degenerate needle triangle (~0.3° min angle) at (θ, z, r=R). */
function appendNeedle(
  verts: number[],
  idx: number[],
  thetaRad: number,
  z: number,
  R: number,
): void {
  const base = verts.length / 3;
  const dTheta = 0.0005; // 0.0005·R ≈ 0.025mm → a ~0.3° needle vs the 5mm height edge
  verts.push(R * Math.cos(thetaRad), R * Math.sin(thetaRad), z);
  verts.push(R * Math.cos(thetaRad + dTheta), R * Math.sin(thetaRad + dTheta), z);
  verts.push(R * Math.cos(thetaRad), R * Math.sin(thetaRad), z + 5);
  idx.push(base, base + 1, base + 2);
}

describe('crestBandTriangleQuality (faithful reference-free crest-band min-angle)', () => {
  it('C1: plain cylinder → empty crest band, no false positive, clean bulk', () => {
    const s = new SharpRidgeSampler(50, 100, 0, 0);
    const mesh = axisAlignedWallMesh(s, 128, 64);
    const r = crestBandTriangleQuality(
      { vertices: new Float32Array(mesh.vertices), indices: new Uint32Array(mesh.indices) },
      s,
    );
    expect(r.crestLoci).toBe(0);
    expect(r.bandTriangles).toBe(0);
    expect(r.bandPctBelow15).toBe(0);
    // A regular cylinder grid is right-triangle clean (cells ~2.5×1.6mm → ~33°).
    expect(r.pctBelow15).toBeLessThan(1);
  });

  it('C2: a sliver ribbon ON the ridge loci is attributed to the crest band', () => {
    const m = 8;
    const s = new SharpRidgeSampler(50, 100, 8, m); // vertical ridges at θ=2π·(k+0.5)/m
    const mesh = axisAlignedWallMesh(new SharpRidgeSampler(50, 100, 0, 0), 96, 48); // clean bulk
    // A ribbon of needles tracing every ridge up the height (the real defect shape).
    for (let k = 0; k < m; k++) {
      for (let z = 10; z <= 90; z += 10) appendNeedle(mesh.vertices, mesh.indices, (TAU * (k + 0.5)) / m, z, 50);
    }
    const r = crestBandTriangleQuality(
      { vertices: new Float32Array(mesh.vertices), indices: new Uint32Array(mesh.indices) },
      s,
    );
    expect(r.crestLoci).toBeGreaterThanOrEqual(m);
    expect(r.worstMinAngleDeg).toBeLessThan(5); // the injected needles
    expect(r.bandPctBelow15).toBeGreaterThan(1); // the crest band is red
    expect(r.nonBandPctBelow15).toBe(0); // the smooth bulk stays clean
    expect(r.bandPctBelow15).toBeGreaterThan(r.nonBandPctBelow15); // localized to the band
  });

  it('C3: a sliver ribbon OFF the crest (flank) is attributed to the bulk, not the band', () => {
    const m = 8;
    const s = new SharpRidgeSampler(50, 100, 8, m);
    const mesh = axisAlignedWallMesh(new SharpRidgeSampler(50, 100, 0, 0), 96, 48);
    // Flank midpoints (u=(k+0.75)/m) between each ridge and the next valley — 11.25°
    // from any locus, outside every crest band → must count as bulk, not crest.
    for (let k = 0; k < m; k++) {
      for (let z = 10; z <= 90; z += 10) appendNeedle(mesh.vertices, mesh.indices, (TAU * (k + 0.75)) / m, z, 50);
    }
    const r = crestBandTriangleQuality(
      { vertices: new Float32Array(mesh.vertices), indices: new Uint32Array(mesh.indices) },
      s,
    );
    expect(r.worstMinAngleDeg).toBeLessThan(5); // the needles still drag the worst tail
    expect(r.bandPctBelow15).toBe(0); // nothing sub-bar inside the band
    expect(r.nonBandPctBelow15).toBeGreaterThan(1); // the flank ribbon is bulk
  });
});

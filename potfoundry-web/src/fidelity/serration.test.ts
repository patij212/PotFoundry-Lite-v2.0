/**
 * serration.test.ts — TDD guards for the STAGE 0 faithful crest-band serration
 * metric (`wallChordError` + helpers in metrics.ts).
 *
 * The existing `wallDeviation` is artifact-dominated (reads ~25mm on a plain pot,
 * rms barely moves with serration — measured live). STAGE 0 builds a metric that
 * reads ~0 on a plain pot and rises with ridge serration, by measuring the OUTER
 * wall's RADIAL deviation from the true crest radius (recovered by inverting the
 * stashed outer sampler on ANGLE+HEIGHT, which is monotone/well-conditioned —
 * unlike a 3D nearest-point GN, which under-measures a tangential staircase and
 * is singular where ∂r/∂θ→0 at the crest).
 *
 * Synthetic surfaces with closed-form crest geometry pin each guarantee:
 *  - G1 plain pot (amp=0) → serrationScore < 1 (no false positive).
 *  - G2 monotone rise with crest amplitude on a fixed coarse mesh.
 *  - G3 refinement reduces serration → the metric measures UNDER-RESOLUTION, and
 *       the crest band must cover ALL m crests (not 1 via argmax/argmin).
 */
import { describe, it, expect } from 'vitest';
import {
  wallChordError,
  extractOuterWallSubmesh,
  sampleTrueRadius,
  findRowExtrema,
  type PositionSampler,
} from './metrics';

const TAU = 2 * Math.PI;

/**
 * Analytic test surface: a cylinder with an optional helical radius crest.
 * `r(u,t) = R0 + amp·cos(2π·m·(u − slope·t))`, θ = 2π·u + twist·t, z = t·H.
 * amp=0 ⇒ a plain cylinder (no crest). slope≠0 ⇒ a DIAGONAL crest that an
 * axis-aligned (u,t) mesh staircases. twist≠0 ⇒ θ ≠ 2π·u (inversion must cope).
 */
class HelicalCrestSampler implements PositionSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly amp = 0,
    private readonly m = 0,
    private readonly slope = 0,
    private readonly twist = 0,
  ) {}

  position(u: number, t: number): readonly [number, number, number] {
    const r = this.R0 + this.amp * Math.cos(TAU * this.m * (u - this.slope * t));
    const theta = TAU * u + this.twist * t;
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

/**
 * Build an axis-aligned (u,t) outer-wall mesh, vertices evaluated ON the sampler.
 * Periodic in u (column nU wraps to 0). The flat axis-aligned facets chord-cut a
 * crest radius curve → exactly the serration the metric must detect.
 */
function axisAlignedWallMesh(
  sampler: PositionSampler,
  nU: number,
  nT: number,
): { vertices: Float32Array; indices: Uint32Array } {
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
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

describe('findRowExtrema (crest-locus detection — all extrema, not argmax/argmin)', () => {
  it('finds all m maxima AND m minima of a cos(m·θ) radius row', () => {
    const m = 8;
    const n = 512;
    const radii: number[] = [];
    for (let i = 0; i < n; i++) radii.push(50 + 5 * Math.cos(TAU * m * (i / n)));
    const { maxima, minima } = findRowExtrema(radii, 0.05);
    expect(maxima.length).toBe(m);
    expect(minima.length).toBe(m);
  });

  it('finds NO prominent extrema on a flat (plain-pot) row', () => {
    const n = 512;
    const radii = new Array(n).fill(50);
    const { maxima, minima } = findRowExtrema(radii, 0.05);
    expect(maxima.length).toBe(0);
    expect(minima.length).toBe(0);
  });
});

describe('sampleTrueRadius (invert sampler on angle+height → true crest radius)', () => {
  it('recovers the radius of a plain cylinder at any (θ,z)', () => {
    const s = new HelicalCrestSampler(50, 100, 0, 0, 0);
    for (const [th, z] of [[0.3, 10], [2.1, 55], [5.7, 90]] as const) {
      expect(sampleTrueRadius(s, th, z, 0, 100)).toBeCloseTo(50, 2);
    }
  });

  it('recovers a modulated radius (cos crest) at a known angle/height', () => {
    const s = new HelicalCrestSampler(50, 100, 5, 4, 0);
    // At u=0,t arbitrary: θ=0, r = 50 + 5·cos(0) = 55 (a peak).
    expect(sampleTrueRadius(s, 0, 50, 0, 100)).toBeCloseTo(55, 1);
    // At u=1/8 (θ=π/4): r = 50 + 5·cos(2π·4·(1/8)) = 50 + 5·cos(π) = 45 (a valley).
    expect(sampleTrueRadius(s, TAU / 8, 50, 0, 100)).toBeCloseTo(45, 1);
  });

  it('inverts correctly under twist (θ ≠ 2π·u) — well-conditioned on angle', () => {
    const s = new HelicalCrestSampler(50, 100, 5, 4, 0, 0.6);
    // Regardless of twist, querying by the sample's own angle must recover its radius.
    const p = s.position(0.137, 0.42);
    const th = Math.atan2(p[1], p[0]);
    const r = Math.hypot(p[0], p[1]);
    expect(sampleTrueRadius(s, th, p[2], 0, 100)).toBeCloseTo(r, 1);
  });
});

describe('extractOuterWallSubmesh (outer-wall-only restriction via surfaceId mask)', () => {
  it('keeps only all-outer triangles and reindexes compactly', () => {
    const vertices = new Float32Array([
      0, 0, 0, // 0 outer
      1, 0, 0, // 1 outer
      2, 0, 0, // 2 inner (phantom)
      3, 0, 0, // 3 outer
    ]);
    const indices = new Uint32Array([0, 1, 3, /* all outer */ 0, 2, 3 /* has inner */]);
    const mask = new Uint8Array([1, 1, 0, 1]);
    const sub = extractOuterWallSubmesh(vertices, indices, mask);
    expect(sub.indices.length).toBe(3); // one triangle survives
    expect(sub.vertices.length).toBe(9); // exactly the 3 outer verts of that tri
    // The surviving triangle's three positions are the outer verts 0,1,3.
    const xs = new Set<number>();
    for (let k = 0; k < sub.indices.length; k++) xs.add(sub.vertices[sub.indices[k] * 3]);
    expect(xs).toEqual(new Set([0, 1, 3]));
  });
});

describe('wallChordError (faithful crest-band serration metric)', () => {
  it('G1: reads ~0 on a plain cylinder (no false positive)', () => {
    const s = new HelicalCrestSampler(50, 100, 0, 0, 0);
    const mesh = axisAlignedWallMesh(s, 128, 64);
    const r = wallChordError(mesh, s);
    expect(r.serrationScore).toBeLessThan(0.5);
    expect(r.crestBandRmsMm).toBeLessThan(0.1);
    expect(r.maxDevMm).toBeLessThan(0.1);
  });

  it('G2: serrationScore rises monotonically with crest amplitude (fixed coarse mesh)', () => {
    // A 0.3mm crest on a 48-facet mesh already sits at the 0.1mm rms threshold
    // (the metric captures the diagonal-staircase dip), so 0.1mm is "gentle".
    const scores = [0.1, 1.5, 6].map((amp) => {
      const s = new HelicalCrestSampler(50, 100, amp, 8, 0.5);
      const mesh = axisAlignedWallMesh(s, 48, 48);
      return wallChordError(mesh, s).serrationScore;
    });
    expect(scores[1]).toBeGreaterThan(scores[0]);
    expect(scores[2]).toBeGreaterThan(scores[1]);
    expect(scores[0]).toBeLessThan(1); // gentle crest within CAD tol on this mesh
    expect(scores[2]).toBeGreaterThan(1); // strong crest serrates (real defect)
  });

  it('G3: refining the mesh reduces serration toward zero (measures under-resolution)', () => {
    const s = new HelicalCrestSampler(50, 100, 6, 8, 0.5);
    const coarse = wallChordError(axisAlignedWallMesh(s, 48, 48), s).serrationScore;
    const fine = wallChordError(axisAlignedWallMesh(s, 256, 192), s).serrationScore;
    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeLessThan(1); // a well-resolved crest is within CAD tolerance
  });

  it('G3: the crest band covers ALL m crests, not a single argmax petal', () => {
    const m = 8;
    const s = new HelicalCrestSampler(50, 100, 6, m, 0.5);
    const mesh = axisAlignedWallMesh(s, 64, 64);
    const r = wallChordError(mesh, s);
    // 8 peaks + 8 valleys = 16 crest loci per row; the band must span them all,
    // so crest samples appear in every angular sector (not clustered on one petal).
    expect(r.crestLoci).toBeGreaterThanOrEqual(m);
    expect(r.crestSamples).toBeGreaterThan(0);
  });
});

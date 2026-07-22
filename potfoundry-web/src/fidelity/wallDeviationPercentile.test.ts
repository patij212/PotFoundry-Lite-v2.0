/**
 * wallDeviationPercentile.test.ts — TDD for the p99 histogram quantization in
 * wallDeviation. The p99 was a 0.05mm-bucket histogram reporting the bucket's LOWER
 * edge (`b·0.05`), so a true p99 anywhere in [0, 0.05) reported 0.00 — 5× coarser
 * than the 0.01mm standard and a systematic UNDER-report (dangerous for a gate). The
 * fix: fine buckets reporting the conservative UPPER edge, so a uniform 0.03mm wall
 * deviation reads p99 ≈ 0.03, never 0.00. max/rms were already exact and must stay so.
 *
 * Pure CPU, read-only imports, no production change beyond the metric it tests.
 */
import { describe, it, expect } from 'vitest';
import { wallDeviation } from './metrics';

const TAU = 2 * Math.PI;
const H = 120;

/** Flat vertex array of a cylinder r=R, (nu×nt) grid over z∈[0,H]. */
function cylinderVerts(R: number, nu: number, nt: number): Float32Array {
  const out: number[] = [];
  for (let it = 0; it <= nt; it++) {
    const z = (it / nt) * H;
    for (let iu = 0; iu < nu; iu++) {
      const th = (iu / nu) * TAU;
      out.push(R * Math.cos(th), R * Math.sin(th), z);
    }
  }
  return Float32Array.from(out);
}

/** A near-vertical cylinder WALL mesh at radius R (normals radial ⇒ wall-classified). */
function cylinderMesh(R: number, nu: number, nt: number): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  for (let it = 0; it <= nt; it++) {
    const z = (it / nt) * H;
    for (let iu = 0; iu < nu; iu++) {
      const th = (iu / nu) * TAU;
      verts.push(R * Math.cos(th), R * Math.sin(th), z);
    }
  }
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = it * nu + iu;
      const b = it * nu + ((iu + 1) % nu);
      const c = (it + 1) * nu + iu;
      const d = (it + 1) * nu + ((iu + 1) % nu);
      idx.push(a, b, d, a, d, c);
    }
  }
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx) };
}

describe('wallDeviation — p99 resolves below the 0.05mm bucket', () => {
  it('a uniform 0.03mm wall deviation reports p99 ≈ 0.03 (not 0.00) and exact max/rms', () => {
    const dense = cylinderVerts(50, 360, 240);          // reference ≈ r=50 everywhere
    // FINE mesh (nu=256) so the facet chord sagitta (~0.004mm) is negligible and the
    // deviation is ~uniformly the 0.03mm radial offset — isolating the p99 resolution.
    const mesh = cylinderMesh(50.03, 256, 8);
    const res = wallDeviation(mesh, dense);

    // max and rms were always exact — a uniform 0.03mm offset reads 0.03.
    expect(res.maxMm).toBeGreaterThan(0.025);
    expect(res.maxMm).toBeLessThan(0.05);
    expect(res.rmsMm).toBeGreaterThan(0.025);
    // THE FIX: p99 must resolve the 0.03mm deviation — the old 0.05mm lower-edge
    // histogram reported 0.00 here (a full-tolerance violation read as perfect).
    expect(res.p99Mm).toBeGreaterThan(0.02);
    expect(res.p99Mm).toBeLessThan(0.05);
  });

  it('p99 is a conservative UPPER bound (never under-reports the true p99)', () => {
    const dense = cylinderVerts(50, 360, 240);
    const mesh = cylinderMesh(50.012, 256, 8); // just above the 0.01mm bar (fine ⇒ ~uniform)
    const res = wallDeviation(mesh, dense);
    // A ~0.012mm deviation must NOT round down to 0.01 or 0.00 — it exceeds the bar.
    expect(res.p99Mm).toBeGreaterThanOrEqual(0.012 - 0.002);
  });
});

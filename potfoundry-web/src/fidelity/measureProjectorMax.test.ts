import { describe, expect, it } from 'vitest';
import { measureProjectorMax } from './measureProjectorMax';

/** A 2-ring cylinder wall (radius r, height H) as a structured strip of `nCols` quads. */
function cylinderMesh(nCols: number, r: number, H: number): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < nCols; i++) {
      const th = (i / nCols) * Math.PI * 2;
      verts.push(r * Math.cos(th), r * Math.sin(th), j * H);
    }
  }
  for (let i = 0; i < nCols; i++) {
    const a = i, b = (i + 1) % nCols, c = nCols + i, d = nCols + ((i + 1) % nCols);
    idx.push(a, b, c, b, d, c);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

describe('measureProjectorMax', () => {
  it('reads ≈0 vertex error for a mesh exactly on the analytic surface', async () => {
    const H = 120;
    const r = await measureProjectorMax(cylinderMesh(64, 50, H), () => 50, { H, tolMm: 0.01, nTheta: 512, nZ: 64 });
    expect(r.nonFiniteCount).toBe(0);
    expect(r.vertexMaxMm).toBeLessThan(0.001); // vertices sit ON the cylinder
    expect(Number.isFinite(r.chordMaxMm)).toBe(true);
    expect(Number.isFinite(r.p99Mm)).toBe(true);
  });

  it('reports the radial offset when the mesh sits off the analytic surface (and fails certification)', async () => {
    const H = 120;
    // radius 50.5 vs rA 50 ⇒ every vertex is ~0.5mm off the true surface.
    const r = await measureProjectorMax(cylinderMesh(128, 50.5, H), () => 50, { H, tolMm: 0.01, nTheta: 512, nZ: 64 });
    expect(r.vertexMaxMm).toBeGreaterThan(0.45);
    expect(r.vertexMaxMm).toBeLessThan(0.55);
    expect(r.maxMm).toBeGreaterThanOrEqual(r.vertexMaxMm);
    expect(r.certified).toBe(false);
  });
});

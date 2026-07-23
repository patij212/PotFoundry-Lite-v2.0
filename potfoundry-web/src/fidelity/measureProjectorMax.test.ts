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

  it('tread-aware mode routes a riser (step) face out of the smooth verdict; vertices stay on the stepped surface', async () => {
    const H = 120;
    // A STEP surface: rA = 50 below z=5, 52 above (a radial riser at z=5). The tread quad's bottom ring (r=50,z=4) and
    // top ring (r=52,z=6) are BOTH on rA (vtx≈0), but the flat riser interior bridges ~1mm from the single-valued rA.
    const rA = (_theta: number, z: number): number => (z < 5 ? 50 : 52);
    const th = 0.1;
    const vertices = new Float32Array([
      50, 0, 4, // v0 r=50 z=4 (on rA=50)
      50 * Math.cos(th), 50 * Math.sin(th), 4, // v1 r=50 (on rA=50)
      52, 0, 6, // v2 r=52 z=6 (on rA=52)
      52 * Math.cos(th), 52 * Math.sin(th), 6, // v3 r=52 (on rA=52)
    ]);
    const indices = new Uint32Array([0, 1, 3, 0, 3, 2]); // the vertical riser quad (both tris span r=50→52)
    const full = await measureProjectorMax({ vertices, indices }, rA, { H, tolMm: 0.01, nTheta: 256, nZ: 256 });
    const aware = await measureProjectorMax({ vertices, indices }, rA, { H, tolMm: 0.01, nTheta: 256, nZ: 256, treadRadiusSpreadMm: 0.5 });
    // Vertices are ON the stepped surface (placement faithful) in both modes.
    expect(full.vertexMaxMm).toBeLessThan(0.05);
    // Full mode: the riser interior chord inflates maxMm; nothing is classified tread.
    expect(full.maxMm).toBeGreaterThan(0.4);
    expect(full.treadFaceCount).toBe(0);
    // Tread-aware: both riser tris split out ⇒ smoothMaxMm tiny (just the on-surface vertices), inflation in treadChordMaxMm.
    expect(aware.treadFaceCount).toBe(2);
    expect(aware.smoothMaxMm).toBeLessThan(0.05);
    expect(aware.treadChordMaxMm).toBeGreaterThan(0.4);
    expect(aware.certified).toBe(true); // certifies on the honest smooth max (treads faithful by construction)
  });
});

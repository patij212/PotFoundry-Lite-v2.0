/**
 * selfIntersection.scale.test.ts — large-mesh regression for `detectSelfIntersections`.
 *
 * Guards the failure mode reported from the Raycast-Oracle Fidelity Spike: on
 * 1M+ triangle meshes the pairwise-dedup bookkeeping used to grow an unbounded
 * `Set` and throw `RangeError: Set maximum size exceeded` (V8 caps a Set at
 * 2^23 = 8,388,608 entries on Node) instead of degrading gracefully.
 *
 * Profiling the real verdict-refined (0.01mm) spike meshes (2026-07-12) showed
 * the crash is NOT driven by a single dense cell — the spatial-hash buckets are
 * uniformly small (max ~28-52 triangles/cell, zero cells >= 100). It is driven
 * by the SHEER COUNT of cells: the old `tested` Set accumulated one entry per
 * DISTINCT candidate pair across millions of cells — tens of millions total
 * (Gothic 15.4M @ 0.6M tris, SpiralRidges 27.3M @ 1.24M tris, Gyroid 47.0M @
 * 1.63M tris) — blowing past the 2^23 cap.
 *
 * A clean ~1.2M-triangle cylinder wall reproduces that exact regime: uniform
 * small buckets, > 2^23 distinct candidate pairs, no pathological single cell
 * (a bare cylinder of 1M+ tris alone drives the old Set to the cap). Post-fix
 * the detector dedupes only confirmed crossings, so memory is bounded and the
 * scan completes. Runs at the 1M+ scale — the regime where the crash occurs.
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from './types';
import { detectSelfIntersections } from './selfIntersection';

function makeMesh(verts: number[], tris: number[]): MeshData {
  const vertices = new Float32Array(verts);
  const indices = new Uint32Array(tris);
  return {
    vertices,
    indices,
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

/** Clean tessellated cylinder wall (radial, like the real pot export): adjacent
 *  quads share edges, nothing crosses. `nTheta*nZ*2` triangles. */
function cylinderInto(verts: number[], tris: number[], nTheta: number, nZ: number): void {
  const base = verts.length / 3;
  for (let zi = 0; zi <= nZ; zi++) {
    const z = (zi / nZ) * 120;
    for (let ti = 0; ti < nTheta; ti++) {
      const a = (ti / nTheta) * 2 * Math.PI;
      verts.push(50 * Math.cos(a), 50 * Math.sin(a), z);
    }
  }
  const idx = (zi: number, ti: number): number => base + zi * nTheta + (ti % nTheta);
  for (let zi = 0; zi < nZ; zi++) {
    for (let ti = 0; ti < nTheta; ti++) {
      const a = idx(zi, ti);
      const b = idx(zi, ti + 1);
      const c = idx(zi + 1, ti);
      const d = idx(zi + 1, ti + 1);
      tris.push(a, b, d, a, d, c);
    }
  }
}

describe('detectSelfIntersections — large meshes', () => {
  it('does not throw on a 1.2M-triangle mesh (>2^23 candidate pairs across many small cells)', () => {
    const verts: number[] = [];
    const tris: number[] = [];
    cylinderInto(verts, tris, 780, 780); // 1,216,800 clean triangles
    const mesh = makeMesh(verts, tris);
    expect(mesh.triangleCount).toBeGreaterThan(1_200_000);

    let result: ReturnType<typeof detectSelfIntersections> | undefined;
    expect(() => {
      result = detectSelfIntersections(mesh);
    }).not.toThrow();

    // A clean cylinder has no self-intersections.
    expect(result!.intersects).toBe(false);
    expect(result!.count).toBe(0);
  }, 120_000);

  it('counts a crossing spanning many grid cells exactly once (cross-bucket dedup)', () => {
    const verts: number[] = [];
    const tris: number[] = [];

    // Small-triangle field far away (y=100): drives the mean-AABB cell size down
    // to ~0.07mm so the two big crossing triangles below span hundreds of cells.
    for (let k = 0; k < 2000; k++) {
      const x = k * 0.5;
      const v0 = verts.length / 3;
      verts.push(x, 100, 0, x + 0.1, 100, 0, x, 100.1, 0);
      tris.push(v0, v0 + 1, v0 + 2);
    }

    // Two long, thin triangles crossing transversally along the x-axis over
    // x in ~[2.5, 17.5]: A lies in z=0, B lies in y=0. With ~0.07mm cells the
    // pair co-occurs in hundreds of buckets (~269) — a naive per-cell count reports
    // it many times; the detector must report the single crossing once.
    const a0 = verts.length / 3;
    verts.push(0, -1, 0, 20, -1, 0, 10, 3, 0); // A: plane z=0
    tris.push(a0, a0 + 1, a0 + 2);
    const b0 = verts.length / 3;
    verts.push(0, 0, -1, 20, 0, -1, 10, 0, 3); // B: plane y=0
    tris.push(b0, b0 + 1, b0 + 2);

    const mesh = makeMesh(verts, tris);
    const result = detectSelfIntersections(mesh);

    expect(result.intersects).toBe(true);
    expect(result.count).toBe(1);
    expect(result.samplePairs).toBeDefined();
    // The one reported pair must be the two big triangles (the last two indices).
    const [pa, pb] = result.samplePairs![0];
    expect(new Set([pa, pb])).toEqual(new Set([mesh.triangleCount - 2, mesh.triangleCount - 1]));
  }, 30_000);
});

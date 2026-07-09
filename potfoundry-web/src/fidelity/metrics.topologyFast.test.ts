/**
 * topologyMetric — numeric-accounting equivalence + large-mesh safety.
 *
 * E-2026-07-09-EXPORT-PERF measured the string-keyed weld+edge Maps at 27.3s on a real 5.25M-tri
 * default export and CONFIRMED a latent crash: JS Maps cap at 2^24 entries, and a pot has ~1.5
 * unique edges per triangle, so any export above ~11.2M tris (CAD budget cap is 16M) throws
 * `RangeError: Map maximum size exceeded` inside the production validator.
 *
 * These tests pin (a) EXACT count-equivalence of topologyMetric against an independent reference
 * implementation of the documented semantics (weld representative = first-seen/min index;
 * boundary: total==1; nonManifold: total>2; orientationMismatch: total==2 && not 1fwd+1rev;
 * degenerate post-weld edges skipped) across crafted + fuzzed meshes, and (b) that a mesh with
 * >2^24 unique edges is scored WITHOUT crashing.
 */
import { describe, it, expect } from 'vitest';
import { topologyMetric, type MeshView, type TopologyResult } from './metrics';

/** Independent reference oracle — the documented semantics, naive Map implementation. */
function referenceTopology(mesh: MeshView, weldToleranceMm: number): TopologyResult {
  const n = mesh.vertices.length / 3;
  const remap = new Uint32Array(n);
  if (weldToleranceMm <= 0) {
    for (let i = 0; i < n; i++) remap[i] = i;
  } else {
    const inv = 1 / weldToleranceMm;
    const buckets = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(mesh.vertices[i * 3] * inv)},${Math.round(mesh.vertices[i * 3 + 1] * inv)},${Math.round(mesh.vertices[i * 3 + 2] * inv)}`;
      const existing = buckets.get(key);
      if (existing === undefined) {
        buckets.set(key, i);
        remap[i] = i;
      } else remap[i] = existing;
    }
  }
  const uses = new Map<string, { fwd: number; rev: number }>();
  const { indices } = mesh;
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      let u = uses.get(key);
      if (!u) {
        u = { fwd: 0, rev: 0 };
        uses.set(key, u);
      }
      if (a === lo) u.fwd++;
      else u.rev++;
    }
  }
  let boundary = 0, nonManifold = 0, mismatch = 0;
  for (const u of uses.values()) {
    const total = u.fwd + u.rev;
    if (total === 1) boundary++;
    else if (total > 2) nonManifold++;
    else if (total === 2 && !(u.fwd === 1 && u.rev === 1)) mismatch++;
  }
  return { boundaryEdges: boundary, nonManifoldEdges: nonManifold, orientationMismatches: mismatch };
}

/** Closed quad grid (nu x nv) wrapped in u — a cylinder open at top/bottom. */
function cylinderGrid(nu: number, nv: number): MeshView {
  const vertices = new Float32Array(nu * (nv + 1) * 3);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < nu; i++) {
      const th = (2 * Math.PI * i) / nu;
      const v = (j * nu + i) * 3;
      vertices[v] = 40 * Math.cos(th);
      vertices[v + 1] = 40 * Math.sin(th);
      vertices[v + 2] = j * 2;
    }
  }
  const indices = new Uint32Array(nu * nv * 6);
  let k = 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i2 = (i + 1) % nu;
      const a = j * nu + i, b = j * nu + i2, c = (j + 1) * nu + i, d = (j + 1) * nu + i2;
      indices[k++] = a; indices[k++] = b; indices[k++] = d;
      indices[k++] = a; indices[k++] = d; indices[k++] = c;
    }
  }
  return { vertices, indices };
}

function expectEqual(mesh: MeshView, tol = 1e-4): void {
  expect(topologyMetric(mesh, tol)).toEqual(referenceTopology(mesh, tol));
}

describe('topologyMetric numeric accounting — exact equivalence with the reference semantics', () => {
  it('open cylinder: boundary rings only, welded seam', () => {
    const mesh = cylinderGrid(64, 16);
    const out = topologyMetric(mesh, 1e-4);
    expect(out).toEqual(referenceTopology(mesh, 1e-4));
    expect(out.boundaryEdges).toBe(128); // top + bottom rings
    expect(out.nonManifoldEdges).toBe(0);
    expect(out.orientationMismatches).toBe(0);
  });

  it('duplicated triangle => non-manifold + orientation accounting matches reference', () => {
    const base = cylinderGrid(16, 4);
    const indices = new Uint32Array(base.indices.length + 3);
    indices.set(base.indices);
    indices.set([base.indices[0], base.indices[1], base.indices[2]], base.indices.length);
    expectEqual({ vertices: base.vertices, indices });
  });

  it('flipped triangle => orientation mismatches match reference', () => {
    const base = cylinderGrid(16, 4);
    const indices = base.indices.slice();
    const t = 9 * 3;
    const tmp = indices[t + 1];
    indices[t + 1] = indices[t + 2];
    indices[t + 2] = tmp;
    expectEqual({ vertices: base.vertices, indices });
  });

  it('weld tolerance merges duplicate seam vertices (unindexed seam)', () => {
    // Duplicate every vertex with sub-tolerance jitter; triangles reference the copies.
    const base = cylinderGrid(24, 6);
    const n = base.vertices.length / 3;
    const vertices = new Float32Array(base.vertices.length * 2);
    vertices.set(base.vertices);
    for (let i = 0; i < base.vertices.length; i++) {
      vertices[base.vertices.length + i] = base.vertices[i] + 1e-6;
    }
    const indices = base.indices.slice();
    for (let i = 0; i < indices.length; i += 2) indices[i] += n; // mix originals and copies
    expectEqual({ vertices, indices });
  });

  it('degenerate (post-weld collapsed) edges are skipped identically', () => {
    const base = cylinderGrid(12, 3);
    const indices = new Uint32Array([...base.indices, 0, 0, 5, 7, 7, 7]);
    expectEqual({ vertices: base.vertices, indices });
  });

  it('zero/negative weld tolerance short-circuits identically', () => {
    const mesh = cylinderGrid(12, 3);
    expect(topologyMetric(mesh, 0)).toEqual(referenceTopology(mesh, 0));
    expect(topologyMetric(mesh, -1)).toEqual(referenceTopology(mesh, -1));
  });

  it('fuzz: 150 random soups with welds/dups/flips match the reference exactly', () => {
    // Deterministic LCG so failures are reproducible.
    let seed = 0x12345678;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
    for (let iter = 0; iter < 150; iter++) {
      const nV = 4 + Math.floor(rnd() * 24);
      const vertices = new Float32Array(nV * 3);
      // Coarse 0.5mm grid so distinct vertices often share weld cells at tol 1e-4 x factor.
      for (let i = 0; i < vertices.length; i++) vertices[i] = Math.floor(rnd() * 8) * 0.5 + (rnd() < 0.3 ? 2e-5 : 0);
      const nT = 1 + Math.floor(rnd() * 30);
      const indices = new Uint32Array(nT * 3);
      for (let i = 0; i < indices.length; i++) indices[i] = Math.floor(rnd() * nV);
      const tol = rnd() < 0.2 ? 0 : 1e-4;
      expect(topologyMetric({ vertices, indices }, tol)).toEqual(referenceTopology({ vertices, indices }, tol));
    }
  });

  it('scores a mesh with >2^24 unique edges without crashing (the 16M-tri CAD-cap class)', () => {
    // 2400x2400 open grid: 11.52M tris, ~17.3M unique edges — above the JS Map cap that crashed
    // the previous implementation (RangeError: Map maximum size exceeded) and the E-2026-07-09
    // crash-demo on a real doubled DragonScales artifact.
    const nu = 2400, nv = 2400;
    const mesh = cylinderGrid(nu, nv);
    const out = topologyMetric(mesh, 1e-4);
    expect(out.boundaryEdges).toBe(nu * 2);
    expect(out.nonManifoldEdges).toBe(0);
    expect(out.orientationMismatches).toBe(0);
  }, 300_000);
});

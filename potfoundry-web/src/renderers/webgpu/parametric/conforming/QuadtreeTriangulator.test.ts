import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree, type QuadLeaf } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree, type QuadtreeLike } from './QuadtreeTriangulator';

interface Tri {
  a: number;
  b: number;
  c: number;
}

function tris(indices: Uint32Array): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    out.push({ a: indices[i], b: indices[i + 1], c: indices[i + 2] });
  }
  return out;
}

function signedArea(verts: Float32Array, t: Tri, wrapsSeam: boolean): number {
  // Seam-aware: a right-seam triangle's u=1 corners were collapsed onto the u=0
  // column. Unwrap those (u=0 → u=1) so the area reflects true winding.
  let ax = verts[t.a * 3];
  let bx = verts[t.b * 3];
  let cx = verts[t.c * 3];
  const ay = verts[t.a * 3 + 1];
  const by = verts[t.b * 3 + 1];
  const cy = verts[t.c * 3 + 1];
  if (wrapsSeam) {
    if (ax < 1e-6) ax += 1;
    if (bx < 1e-6) bx += 1;
    if (cx < 1e-6) cx += 1;
  }
  return 0.5 * ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
}

/** Undirected edge-use counts keyed by deduped index pairs. */
function edgeUse(triangles: Tri[]): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (i: number, j: number): void => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const t of triangles) {
    bump(t.a, t.b);
    bump(t.b, t.c);
    bump(t.c, t.a);
  }
  return m;
}

function assertCoreInvariants(
  verts: Float32Array,
  indices: Uint32Array,
  seamTriangles: Uint8Array,
): { boundaryEdges: [number, number][] } {
  const triangles = tris(indices);
  // Orientation: every triangle CCW (signed area > 0).
  for (let ti = 0; ti < triangles.length; ti++) {
    expect(signedArea(verts, triangles[ti], seamTriangles[ti] === 1)).toBeGreaterThan(0);
  }
  // Manifold: no edge used > 2 times.
  const eu = edgeUse(triangles);
  const boundaryEdges: [number, number][] = [];
  for (const [k, count] of eu) {
    expect(count).toBeLessThanOrEqual(2);
    if (count === 1) {
      const [i, j] = k.split('_').map(Number);
      boundaryEdges.push([i, j]);
    }
  }
  // Seam closed: boundary edges (used once) only where both endpoints are at
  // t≈0 or t≈1 — never along u≈0/u≈1.
  for (const [i, j] of boundaryEdges) {
    const ti = verts[i * 3 + 1];
    const tj = verts[j * 3 + 1];
    const bothBottom = ti < 1e-6 && tj < 1e-6;
    const bothTop = ti > 1 - 1e-6 && tj > 1 - 1e-6;
    expect(bothBottom || bothTop).toBe(true);
  }
  return { boundaryEdges };
}

describe('triangulateQuadtree — uniform level-2 tree', () => {
  it('2 triangles per quad, 32 triangles, invariants hold', () => {
    // Constant target forcing uniform level 2 (sqrt(E)=2πR0≈314 wide).
    // 314/2^L ≤ target ⇒ choose target=80 ⇒ 2^L≥3.93 ⇒ L=2.
    const s = new SyntheticCylinderSampler(50, 120);
    const opts: SizingOptions = {
      maxSagMm: 0.1,
      minEdgeMm: 80,
      maxEdgeMm: 80,
      gradeRatio: 2,
      resU: 9,
      resT: 9,
    };
    const field = new MetricSizingField(s, opts);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 5 });
    expect(qt.leaves().every((l) => l.level === 2)).toBe(true);
    expect(qt.leaves().length).toBe(16);

    const { vertices, indices, seamTriangles } = triangulateQuadtree(qt);
    expect(indices.length / 3).toBe(32);
    assertCoreInvariants(vertices, indices, seamTriangles);
  });
});

/**
 * A hand-built, 2:1-balanced quadtree: a 2×2 base (level 1) with the SW quad
 * split to level 2. The triangulator infers split sides from the leaf set, so
 * the fixture is just a list of leaves.
 */
function handForcedTree(): QuadtreeLike {
  const leaves: QuadLeaf[] = [
    // SW quadrant refined to level 2 (size 0.25 each).
    { u0: 0.0, t0: 0.0, level: 2 },
    { u0: 0.25, t0: 0.0, level: 2 },
    { u0: 0.0, t0: 0.25, level: 2 },
    { u0: 0.25, t0: 0.25, level: 2 },
    // The other three level-1 quads (size 0.5).
    { u0: 0.5, t0: 0.0, level: 1 },
    { u0: 0.0, t0: 0.5, level: 1 },
    { u0: 0.5, t0: 0.5, level: 1 },
  ];
  return { leaves: () => leaves };
}

describe('triangulateQuadtree — transition template (one quadrant finer)', () => {
  it('no T-junctions; mid-edge vertices shared; invariants hold', () => {
    const qt = handForcedTree();
    const { vertices, indices, seamTriangles } = triangulateQuadtree(qt);
    assertCoreInvariants(vertices, indices, seamTriangles);
    // Sanity: a transition mid-edge vertex (u=0.5,t=0.25 — between the two
    // east level-2 cells and the level-1 east quad) exists and is shared.
    const target = { u: 0.5, t: 0.25 };
    let found = -1;
    for (let v = 0; v < vertices.length / 3; v++) {
      if (
        Math.abs(vertices[v * 3] - target.u) < 1e-6 &&
        Math.abs(vertices[v * 3 + 1] - target.t) < 1e-6
      ) {
        found = v;
        break;
      }
    }
    expect(found).toBeGreaterThanOrEqual(0);
    // That mid-edge vertex must be an endpoint of at least one triangle edge of
    // the coarse (level-1) east quad — guaranteed by the template (else T-junc).
    const eu = edgeUse(tris(indices));
    let used = false;
    for (const k of eu.keys()) {
      const [i, j] = k.split('_').map(Number);
      if (i === found || j === found) {
        used = true;
        break;
      }
    }
    expect(used).toBe(true);
  });
});

describe('triangulateQuadtree — real mixed-level tree (5,6,7)', () => {
  it('invariants hold at scale (manifold, seam-closed, CCW)', () => {
    // Same fixture as the quadtree balance test: genuinely mixed levels with
    // many transition cells and full seam wrap.
    const s = new SyntheticCylinderSampler(50, 120, 8, 2);
    const opts: SizingOptions = {
      maxSagMm: 0.1,
      minEdgeMm: 0.5,
      maxEdgeMm: 120,
      gradeRatio: 4,
      resU: 65,
      resT: 9,
    };
    const field = new MetricSizingField(s, opts);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 7 });
    const levels = new Set(qt.leaves().map((l) => l.level));
    expect(levels.size).toBeGreaterThan(1);

    const { vertices, indices, seamTriangles } = triangulateQuadtree(qt);
    assertCoreInvariants(vertices, indices, seamTriangles);
  });
});

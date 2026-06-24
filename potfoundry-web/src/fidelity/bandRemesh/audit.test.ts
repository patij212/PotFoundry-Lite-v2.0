/**
 * audit.test.ts — TDD tests for bandRemesh audit utilities.
 *
 * Tests:
 *   auditWatertight  — edge topology (boundary / non-manifold / T-junction)
 *   triangleQuality3D — per-mesh 3D quality stats (aspect, min-angle)
 *   lateralWobbleMm  — perpendicular distance of boundary pts from a locus
 */
import { describe, it, expect } from 'vitest';
import { auditWatertight, triangleQuality3D, lateralWobbleMm } from './audit';

// ── Mesh helpers ──────────────────────────────────────────────────────────────

/**
 * Build a watertight closed octahedron-style "quad strip torus": a single band
 * of two triangles forming a quad, then closed on both the top and bottom rings
 * with one extra triangle each, yielding a fully watertight 4-triangle sphere cap.
 *
 * Simpler approach: a closed triangle strip of two quads (4 triangles, 4 verts)
 * where every edge is shared by exactly two triangles — a watertight "tent".
 *
 * We use a minimal welded quad strip that closes on itself:
 *   verts: 0=(0,0,0), 1=(1,0,0), 2=(1,1,0), 3=(0,1,0)
 *   two triangles sharing every interior edge → closed quad
 *   Then close it into a watertight closed surface by adding a top vertex (4)
 *   and bottom vertex (5): forms an octahedron-like closed shape.
 */
function closedOctahedron(): { positions: Float32Array; indices: Uint32Array } {
  // 6 vertices: 4 on equator, top, bottom
  const positions = new Float32Array([
    1, 0, 0,   // 0: east
    0, 1, 0,   // 1: north
    -1, 0, 0,  // 2: west
    0, -1, 0,  // 3: south
    0, 0, 1,   // 4: top
    0, 0, -1,  // 5: bottom
  ]);
  // 8 triangles forming a closed octahedron
  const indices = new Uint32Array([
    // top cap
    0, 1, 4,
    1, 2, 4,
    2, 3, 4,
    3, 0, 4,
    // bottom cap (reversed winding for outward normals)
    0, 5, 1,
    1, 5, 2,
    2, 5, 3,
    3, 5, 0,
  ]);
  return { positions, indices };
}

/**
 * A deliberately broken mesh with a T-junction (interior dangling edge).
 *
 * We build a closed octahedron but then split one edge of a triangle using
 * an extra vertex injected at its midpoint — one triangle references the
 * original edge endpoint (v5) and the other references the midpoint (v6).
 * Edge [5,6] is only used by one triangle (the one that introduces v6), so
 * it is a T-junction: a boundary edge whose vertices are NOT on the extreme
 * y-planes (they are interior to the shape).
 *
 * Positions: 5 verts of a pentagon ring (y=0.5, interior) + top + bottom.
 * The T-junction is manufactured by splitting one face of the closed cap.
 */
function meshWithTJunction(): { positions: Float32Array; indices: Uint32Array } {
  // Simple closed tetrahedron (4 verts, 4 triangles = watertight)
  // then inject an extra midpoint vertex breaking one edge.
  const positions = new Float32Array([
    0, 0, 0,     // 0
    1, 0, 0,     // 1
    0.5, 1, 0,   // 2
    0.5, 0.5, 1, // 3 — interior apex
    0.75, 0.5, 0.5, // 4 — midpoint of edge 1-2 (injected, interior)
  ]);
  // Watertight tetrahedron would be: (0,1,2)(0,1,3)(1,2,3)(0,2,3)
  // We break it by splitting face (1,2,3) into (1,4,3)+(4,2,3)
  // but the adjacent face (0,1,2)+(0,2,3) still reference the original
  // edge [1,2] — so edge [1,4] and [4,2] only appear once each → T-junctions.
  const indices = new Uint32Array([
    0, 1, 2,  // face using original edge 1-2
    0, 1, 3,  // face using edge 1-3
    1, 4, 3,  // split face (left half) — introduces edge [1,4] and [4,3]
    4, 2, 3,  // split face (right half) — introduces edge [4,2] and [4,3] (shared with above)
    0, 2, 3,  // face using edge 2-3
    // Edge [1,4]: count=1 (only in split left) → T-junction
    // Edge [4,2]: count=1 (only in split right) → T-junction
    // Edge [1,2]: count=1 (in original face 0-1-2) → boundary (NOT shared with split)
  ]);
  return { positions, indices };
}

// ── auditWatertight ───────────────────────────────────────────────────────────

describe('auditWatertight', () => {
  it('returns 0,0,0 for a closed watertight octahedron', () => {
    const m = closedOctahedron();
    const result = auditWatertight(m);
    expect(result.boundaryEdges).toBe(0);
    expect(result.nonManifoldEdges).toBe(0);
    expect(result.tJunctions).toBe(0);
  });

  it('detects tJunctions ≥ 1 on a mesh with a deliberate T-junction', () => {
    const m = meshWithTJunction();
    const result = auditWatertight(m);
    expect(result.tJunctions).toBeGreaterThanOrEqual(1);
  });

  it('detects nonManifoldEdges when an edge is shared by 3 triangles', () => {
    // Take the octahedron and add an extra triangle sharing one of its edges
    const base = closedOctahedron();
    const extraIdx = new Uint32Array([...base.indices, 0, 1, 5]); // edge 0-1 now used 3×
    const result = auditWatertight({ positions: base.positions, indices: extraIdx });
    expect(result.nonManifoldEdges).toBeGreaterThanOrEqual(1);
  });
});

// ── triangleQuality3D ─────────────────────────────────────────────────────────

describe('triangleQuality3D', () => {
  it('equilateral-ish triangle → aspectMax ≈ 1.15, minAngleP50 ≈ 60', () => {
    // Equilateral: vertices at (0,0,0), (1,0,0), (0.5, √3/2, 0)
    const sq3h = Math.sqrt(3) / 2;
    const positions = new Float32Array([0, 0, 0,  1, 0, 0,  0.5, sq3h, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const q = triangleQuality3D({ positions, indices });
    // aspect for equilateral = longest^2 * sqrt3 / (4*area)
    // side=1, area=sqrt3/4, aspect = 1*sqrt3/(4*sqrt3/4) = 1*sqrt3/sqrt3 = 1
    expect(q.aspectMax).toBeGreaterThan(0.9);
    expect(q.aspectMax).toBeLessThan(1.5);
    expect(q.minAngleP50).toBeGreaterThan(55);
    expect(q.minAngleP50).toBeLessThanOrEqual(65);
    expect(q.pctMinAngleBelow10).toBe(0);
  });

  it('30:1 needle → aspectMax > 20, pctMinAngleBelow10 = 100', () => {
    // Needle: base=30, height=1 → min angle ≈ atan(1/15) ≈ 3.8°
    const positions = new Float32Array([0, 0, 0,  30, 0, 0,  15, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const q = triangleQuality3D({ positions, indices });
    expect(q.aspectMax).toBeGreaterThan(20);
    expect(q.pctMinAngleBelow10).toBe(100);
  });
});

// ── lateralWobbleMm ───────────────────────────────────────────────────────────

describe('lateralWobbleMm', () => {
  it('boundary offset 0.03mm from a straight locus → max ≈ 0.03', () => {
    // Locus: straight horizontal line along u (t=0.5 in parameter space)
    // uToMm = 10, tToMm = 100
    const uToMm = 10;
    const tToMm = 100;

    // Locus: at any u, the locus point is (u, 0.5) in (u,t) space
    const locus = (u: number): [number, number] => [u, 0.5];

    // Boundary: 10 points offset 0.03mm in t-direction from the locus
    // offset = 0.03mm / tToMm = 0.0003 in t-units
    const offsetT = 0.03 / tToMm;
    const boundary: Array<[number, number]> = [];
    for (let i = 0; i <= 9; i++) {
      const u = i / 9;
      boundary.push([u, 0.5 + offsetT]);
    }

    const result = lateralWobbleMm(boundary, locus, uToMm, tToMm);
    expect(result.max).toBeCloseTo(0.03, 2);
    expect(result.p99).toBeCloseTo(0.03, 2);
  });

  it('returns 0 for a boundary exactly on the locus', () => {
    const uToMm = 10;
    const tToMm = 100;
    const locus = (u: number): [number, number] => [u, 0.5];
    const boundary: Array<[number, number]> = Array.from({ length: 5 }, (_, i) => [i / 4, 0.5]);
    const result = lateralWobbleMm(boundary, locus, uToMm, tToMm);
    expect(result.max).toBeCloseTo(0, 10);
    expect(result.p99).toBeCloseTo(0, 10);
  });
});

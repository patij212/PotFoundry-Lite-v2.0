/**
 * Tests for ChainStripOptimizer – 3D edge flip optimization for chain-strip triangles.
 *
 * Tests cover:
 *   - 3D math helpers (edgeKey, pos3, cross3, dot3, etc.)
 *   - Valence utilities (computeValenceStats, buildConstraintEdgeSet)
 *   - Phase A/B/C chain-strip flip optimization
 *   - Boundary diagonal optimization
 *   - Boundary diagnostic (read-only)
 *   - Mesh quality diagnostics (read-only)
 */
import { describe, it, expect } from 'vitest';
import {
  // Types
  type Vec3,
  // Constants
  MAX_CS_PASSES,
  MIN_ANGLE_IMPROVEMENT,
  MIN_ANGLE_VALENCE_BONUS,
  MIN_ANGLE_FLOOR,
  MAX_VALENCE_PASSES,
  ANGLE_DEGRADE_TOLERANCE,
  // 3D math
  edgeKey,
  pos3,
  cross3,
  dot3,
  len3,
  dist3sq,
  triNormalFromPoints,
  cosAngle3,
  minAngle3D,
  triAspect3D,
  isConvexQuad3D,
  computeMaxRowTSpan,
  // Utilities
  computeValenceStats,
  buildConstraintEdgeSet,
  // Main functions
  optimizeChainStrips,
  optimizeBoundaryDiagonals,
  computeBoundaryDiagnostic,
  computeMeshDiagnostics,
  computeChainStrip3DQuality,
} from './ChainStripOptimizer';

// ═══════════════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════════════

/** Build a flat Float32Array from an array of [x,y,z] triples. */
function makePositions(verts: [number, number, number][]): Float32Array {
  const arr = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    arr[i * 3] = verts[i][0];
    arr[i * 3 + 1] = verts[i][1];
    arr[i * 3 + 2] = verts[i][2];
  }
  return arr;
}

/** Build Uint32Array from flat index list. */
function makeIndices(indices: number[]): Uint32Array {
  return new Uint32Array(indices);
}

// ═══════════════════════════════════════════════════════════════════════
// 3D Math Helpers
// ═══════════════════════════════════════════════════════════════════════

describe('edgeKey', () => {
  it('produces the same key regardless of order', () => {
    expect(edgeKey(3, 7)).toBe(edgeKey(7, 3));
  });

  it('different edges produce different keys', () => {
    expect(edgeKey(1, 2)).not.toBe(edgeKey(1, 3));
    expect(edgeKey(0, 1)).not.toBe(edgeKey(0, 2));
  });

  it('returns a bigint', () => {
    expect(typeof edgeKey(0, 1)).toBe('bigint');
  });

  it('encodes lo * 0x100000 + hi', () => {
    const k = edgeKey(5, 10);
    expect(k).toBe(BigInt(5) * BigInt(0x200000) + BigInt(10));
  });
});

describe('pos3', () => {
  it('reads xyz from interleaved Float32Array', () => {
    const positions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pos3(positions, 0)).toEqual([1, 2, 3]);
    expect(pos3(positions, 1)).toEqual([4, 5, 6]);
    expect(pos3(positions, 2)).toEqual([7, 8, 9]);
  });
});

describe('cross3', () => {
  it('computes cross product of unit vectors', () => {
    const result = cross3(1, 0, 0, 0, 1, 0);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(0);
    expect(result[2]).toBeCloseTo(1);
  });

  it('returns zero for parallel vectors', () => {
    const result = cross3(1, 0, 0, 2, 0, 0);
    expect(len3(result)).toBeCloseTo(0);
  });
});

describe('dot3', () => {
  it('computes dot product', () => {
    expect(dot3([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(dot3([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('dot of unit vector with itself is 1', () => {
    expect(dot3([1, 0, 0], [1, 0, 0])).toBe(1);
  });
});

describe('len3', () => {
  it('computes magnitude', () => {
    expect(len3([3, 4, 0])).toBeCloseTo(5);
    expect(len3([0, 0, 0])).toBe(0);
    expect(len3([1, 0, 0])).toBe(1);
  });
});

describe('dist3sq', () => {
  it('returns squared distance', () => {
    expect(dist3sq([0, 0, 0], [3, 4, 0])).toBeCloseTo(25);
    expect(dist3sq([1, 1, 1], [1, 1, 1])).toBe(0);
  });
});

describe('triNormalFromPoints', () => {
  it('returns upward normal for XY-plane triangle', () => {
    const n = triNormalFromPoints([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    expect(n[0]).toBeCloseTo(0);
    expect(n[1]).toBeCloseTo(0);
    expect(n[2]).toBeCloseTo(1);
  });

  it('returns zero for degenerate triangle', () => {
    const n = triNormalFromPoints([0, 0, 0], [1, 0, 0], [2, 0, 0]);
    expect(len3(n)).toBeCloseTo(0);
  });
});

describe('cosAngle3', () => {
  it('returns 1 for identical direction', () => {
    expect(cosAngle3([1, 0, 0], [2, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for perpendicular', () => {
    expect(cosAngle3([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('returns -1 for opposite', () => {
    expect(cosAngle3([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });

  it('returns 1 for degenerate zero vector', () => {
    expect(cosAngle3([0, 0, 0], [1, 0, 0])).toBe(1);
  });
});

describe('minAngle3D', () => {
  it('returns ~60° for equilateral triangle', () => {
    // Equilateral in XY plane
    const positions = makePositions([
      [0, 0, 0],
      [1, 0, 0],
      [0.5, Math.sqrt(3) / 2, 0],
    ]);
    const angle = minAngle3D(positions, 0, 1, 2);
    expect(angle).toBeCloseTo(Math.PI / 3, 4);
  });

  it('returns small angle for elongated triangle', () => {
    const positions = makePositions([
      [0, 0, 0],
      [10, 0, 0],
      [5, 0.1, 0],
    ]);
    const angle = minAngle3D(positions, 0, 1, 2);
    expect(angle).toBeLessThan(0.1); // very small
  });

  it('returns 0 for degenerate triangle', () => {
    const positions = makePositions([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(minAngle3D(positions, 0, 1, 2)).toBe(0);
  });

  it('works with 3D positions (not just XY)', () => {
    const positions = makePositions([
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 1],
    ]);
    const angle = minAngle3D(positions, 0, 1, 2);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(Math.PI / 2);
  });
});

describe('triAspect3D', () => {
  it('returns ~1 for equilateral triangle', () => {
    const positions = makePositions([
      [0, 0, 0],
      [1, 0, 0],
      [0.5, Math.sqrt(3) / 2, 0],
    ]);
    const aspect = triAspect3D(positions, 0, 1, 2);
    expect(aspect).toBeCloseTo(1.0, 0);
  });

  it('returns high value for degenerate triangle', () => {
    const positions = makePositions([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(triAspect3D(positions, 0, 1, 2)).toBe(1e6);
  });

  it('returns moderate value for right triangle', () => {
    const positions = makePositions([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const aspect = triAspect3D(positions, 0, 1, 2);
    expect(aspect).toBeGreaterThan(1);
    expect(aspect).toBeLessThan(5);
  });
});

describe('isConvexQuad3D', () => {
  it('returns true for convex square', () => {
    const positions = makePositions([
      [0, 0, 0], // A
      [1, 0, 0], // B
      [1, 1, 0], // C
      [0, 1, 0], // D
    ]);
    expect(isConvexQuad3D(positions, 0, 1, 2, 3)).toBe(true);
  });

  it('returns false for concave quad', () => {
    // Push vertex C inward to create concavity
    const positions = makePositions([
      [0, 0, 0],   // A
      [1, 0, 0],   // B
      [0.3, 0.3, 0], // C (inside)
      [0, 1, 0],   // D
    ]);
    expect(isConvexQuad3D(positions, 0, 1, 2, 3)).toBe(false);
  });

  it('works with 3D positions', () => {
    const positions = makePositions([
      [0, 0, 0],
      [1, 0, 0.1],
      [1, 1, 0.2],
      [0, 1, 0.1],
    ]);
    expect(isConvexQuad3D(positions, 0, 1, 2, 3)).toBe(true);
  });
});

describe('computeMaxRowTSpan', () => {
  it('returns max span from uniform T values', () => {
    expect(computeMaxRowTSpan([0, 0.25, 0.5, 0.75, 1.0])).toBeCloseTo(0.25);
  });

  it('returns max span from non-uniform T values', () => {
    expect(computeMaxRowTSpan([0, 0.1, 0.5, 0.6, 1.0])).toBeCloseTo(0.4);
  });

  it('returns 0 for single-element array', () => {
    expect(computeMaxRowTSpan([0.5])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Utility Helpers
// ═══════════════════════════════════════════════════════════════════════

describe('computeValenceStats', () => {
  it('categorizes valence values correctly', () => {
    const map = new Map<number, number>([
      [0, 3],  // low
      [1, 4],  // low
      [2, 6],  // ideal
      [3, 6],  // ideal
      [4, 8],  // high
      [5, 5],  // none (5 is not <5 and not >7 and not ===6)
      [6, 7],  // none
    ]);
    const stats = computeValenceStats(map);
    expect(stats.total).toBe(7);
    expect(stats.low).toBe(2);
    expect(stats.ideal).toBe(2);
    expect(stats.high).toBe(1);
  });

  it('handles empty map', () => {
    const stats = computeValenceStats(new Map());
    expect(stats.total).toBe(0);
    expect(stats.low).toBe(0);
    expect(stats.ideal).toBe(0);
    expect(stats.high).toBe(0);
  });
});

describe('buildConstraintEdgeSet', () => {
  it('builds a set from edge pairs', () => {
    const edges: [number, number][] = [[0, 1], [3, 2], [5, 5]];
    const set = buildConstraintEdgeSet(edges);
    expect(set.size).toBe(3);
    expect(set.has(edgeKey(0, 1))).toBe(true);
    expect(set.has(edgeKey(2, 3))).toBe(true); // order-independent
    expect(set.has(edgeKey(5, 5))).toBe(true);
  });

  it('handles empty arrays', () => {
    expect(buildConstraintEdgeSet([]).size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

describe('constants', () => {
  it('has expected Phase A values', () => {
    expect(MAX_CS_PASSES).toBe(8);
    expect(MIN_ANGLE_IMPROVEMENT).toBeCloseTo(0.005);
    expect(MIN_ANGLE_VALENCE_BONUS).toBeCloseTo(0.0005);
    expect(MIN_ANGLE_FLOOR).toBeCloseTo(0.04);
  });

  it('has expected Phase B/C values', () => {
    expect(MAX_VALENCE_PASSES).toBe(4);
    expect(ANGLE_DEGRADE_TOLERANCE).toBeCloseTo(0.002);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// optimizeChainStrips – Integration Tests
// ═══════════════════════════════════════════════════════════════════════

describe('optimizeChainStrips', () => {
  /**
   * Create a minimal test mesh:
   *   Grid: 3×2 vertices (indices 0-5)
   *   Chain vertex: index 6 (between two grid vertices)
   *   Two chain-strip tris sharing a bad diagonal that should be flipped.
   *
   * Grid layout (flat, z=0):
   *   3---4---5    (row 1, t=1)
   *   |   |   |
   *   0---1---2    (row 0, t=0)
   *
   * Chain vertex 6 is placed near vertex 1 but offset in Z (ridge).
   * Chain-strip tris: (1, 4, 6) and (4, 5, 6) — sharing edge (4, 6).
   */
  function makeChainStripMesh() {
    // 3D positions: grid is flat, chain vertex has Z offset
    const positions = makePositions([
      [0, 0, 0],     // 0 (grid)
      [1, 0, 0],     // 1 (grid)
      [2, 0, 0],     // 2 (grid)
      [0, 1, 0],     // 3 (grid)
      [1, 1, 0],     // 4 (grid)
      [2, 1, 0],     // 5 (grid)
      [1.5, 0.5, 0], // 6 (chain vertex — in the middle)
    ]);

    // UV/T parameters (u, t, 0)
    const combinedVerts = makePositions([
      [0, 0, 0],     // v0: u=0, t=0
      [0.5, 0, 0],   // v1: u=0.5, t=0
      [1, 0, 0],     // v2: u=1.0, t=0
      [0, 1, 0],     // v3: u=0, t=1
      [0.5, 1, 0],   // v4: u=0.5, t=1
      [1, 1, 0],     // v5: u=1.0, t=1
      [0.75, 0.5, 0], // v6: u=0.75, t=0.5
    ]);

    // Grid quads: cell (0,0) → tris (0,1,4),(0,4,3)
    //             cell (1,0) → tris (1,2,5),(1,5,4) — standard
    // Chain-strip tris: (1,6,4) and (2,6,5)
    // But we need chain-strip tris to have vertex >= outerGridVertexCount
    const outerGridVertexCount = 6; // vertices 0-5 are grid
    const combinedIdxs = makeIndices([
      // Cell (0,0): standard grid quad — tris at offset 0, 3
      0, 1, 4,
      0, 4, 3,
      // Chain-strip tris — at offset 6, 9
      1, 6, 4,  // chain tri (has vertex 6 >= outerGridVertexCount)
      2, 6, 5,  // chain tri
      // Additional chain-strip tri sharing edge with first — offset 12
      4, 6, 5,  // chain tri sharing edge (6,5) and (4,6) with others
    ]);

    const outerIdxCount = combinedIdxs.length;
    const outerChainEdges: [number, number][] = [[1, 6], [6, 2]]; // constraint edges
    const constraintEdgeSet = buildConstraintEdgeSet(outerChainEdges);
    const finalT = [0, 0.5, 1.0];

    return {
      combinedIdxs,
      positions,
      combinedVerts,
      constraintEdgeSet,
      outerGridVertexCount,
      outerIdxCount,
      finalT,
    };
  }

  it('returns valid result structure', () => {
    const mesh = makeChainStripMesh();
    const result = optimizeChainStrips(mesh);

    expect(result).toHaveProperty('phaseAFlips');
    expect(result).toHaveProperty('phaseBFlips');
    expect(result).toHaveProperty('phaseCFlips');
    expect(result).toHaveProperty('rowSpanRejects');
    expect(result).toHaveProperty('edgeLenRejects');
    expect(result).toHaveProperty('aspectRejects');
    expect(result).toHaveProperty('valenceBonusFlips');
    expect(result).toHaveProperty('chainStripTriCount');
    expect(result).toHaveProperty('maxSingleRowTSpan');
    expect(result).toHaveProperty('valenceStats');
    expect(result).toHaveProperty('timeMs');
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  it('identifies chain-strip tris correctly', () => {
    const mesh = makeChainStripMesh();
    const result = optimizeChainStrips(mesh);
    // Tris with at least one vertex >= outerGridVertexCount (6):
    // offset 6: (1,6,4), offset 9: (2,6,5), offset 12: (4,6,5)
    expect(result.chainStripTriCount).toBe(3);
  });

  it('does not flip constraint edges', () => {
    const mesh = makeChainStripMesh();
    const before = new Uint32Array(mesh.combinedIdxs);
    const result = optimizeChainStrips(mesh);

    // Constraint edges: (1,6), (6,2) must appear in the mesh
    const hasEdge = (a: number, b: number): boolean => {
      const idxs = mesh.combinedIdxs;
      for (let t = 0; t < idxs.length; t += 3) {
        const verts = [idxs[t], idxs[t + 1], idxs[t + 2]];
        const hasA = verts.includes(a);
        const hasB = verts.includes(b);
        if (hasA && hasB) return true;
      }
      return false;
    };
    // Constraint edges should still exist as triangle edges
    expect(hasEdge(1, 6)).toBe(true);
    expect(hasEdge(6, 2)).toBe(true);
  });

  it('preserves grid quad tris', () => {
    const mesh = makeChainStripMesh();
    optimizeChainStrips(mesh);
    // Grid tris at offset 0 and 3 should be unchanged
    // (they're not chain-strip tris)
    expect(mesh.combinedIdxs[0]).toBe(0);
    expect(mesh.combinedIdxs[1]).toBe(1);
    expect(mesh.combinedIdxs[2]).toBe(4);
    expect(mesh.combinedIdxs[3]).toBe(0);
    expect(mesh.combinedIdxs[4]).toBe(4);
    expect(mesh.combinedIdxs[5]).toBe(3);
  });

  it('valence stats have valid structure', () => {
    const mesh = makeChainStripMesh();
    const result = optimizeChainStrips(mesh);
    expect(result.valenceStats.before.total).toBeGreaterThan(0);
    expect(result.valenceStats.after.total).toBeGreaterThan(0);
  });

  it('handles mesh with no chain-strip tris', () => {
    // All grid vertices (no chain vertex)
    const positions = makePositions([
      [0, 0, 0], [1, 0, 0], [2, 0, 0],
      [0, 1, 0], [1, 1, 0], [2, 1, 0],
    ]);
    const combinedVerts = makePositions([
      [0, 0, 0], [0.5, 0, 0], [1, 0, 0],
      [0, 1, 0], [0.5, 1, 0], [1, 1, 0],
    ]);
    const combinedIdxs = makeIndices([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]);
    const result = optimizeChainStrips({
      combinedIdxs, positions, combinedVerts,
      constraintEdgeSet: new Set(), outerGridVertexCount: 6,
      outerIdxCount: combinedIdxs.length, finalT: [0, 1],
    });
    expect(result.chainStripTriCount).toBe(0);
    expect(result.phaseAFlips).toBe(0);
    expect(result.phaseBFlips).toBe(0);
    expect(result.phaseCFlips).toBe(0);
  });

  it('Phase A flips a bad diagonal to improve min-angle', () => {
    // Create two chain-strip tris sharing a long diagonal edge.
    // shLo=10 and shHi=11 are 2.0 apart (long current diagonal).
    // opp0=12 and opp1=13 are 1.0 apart (shorter alternative).
    // Flipping (10,11) → (12,13) produces more equilateral triangles.
    //
    //      opp1(13) at (5, 1, 0)
    //      /     \
    //  shLo(10)---shHi(11)    current diagonal len=2.0
    //      \     /
    //      opp0(12) at (5, 0, 0)
    //
    const positions = makePositions([
      // Grid vertices 0-3 (simple row)
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
      // 4-9: more grid vertices for padding
      [2, 0, 0], [2, 1, 0], [3, 0, 0], [3, 1, 0],
      [4, 0, 0], [4, 1, 0],
      // Chain vertices 10-13 forming a bad-diagonal quad
      [4.0, 0.5, 0],  // 10 (shLo)
      [6.0, 0.5, 0],  // 11 (shHi) — 2.0 away from shLo
      [5.0, 0.0, 0],  // 12 (opp0) — below midpoint
      [5.0, 1.0, 0],  // 13 (opp1) — above midpoint, 1.0 from opp0
    ]);
    const combinedVerts = makePositions([
      [0, 0, 0], [0.1, 0, 0], [0, 1, 0], [0.1, 1, 0],
      [0.2, 0, 0], [0.2, 1, 0], [0.3, 0, 0], [0.3, 1, 0],
      [0.4, 0, 0], [0.4, 1, 0],
      [0.4, 0.5, 0], [0.6, 0.5, 0], [0.5, 0.0, 0], [0.5, 1.0, 0],
    ]);
    const outerGridVertexCount = 10;

    // Grid tris (standard, won't be touched)
    const gridIdxs = [0, 1, 3, 0, 3, 2];
    // Chain-strip tris: sharing edge (10,11), opposites 12 and 13
    // Tri A: (10, 11, 12) — thin triangle (long edge 10→11)
    // Tri B: (10, 13, 11) — thin triangle
    const chainIdxs = [10, 11, 12, 10, 13, 11];
    const combinedIdxs = makeIndices([...gridIdxs, ...chainIdxs]);
    const outerIdxCount = combinedIdxs.length;

    const constraintEdgeSet = new Set<bigint>();
    // No constraint on edge (10,11) so it can be flipped
    const finalT = [0, 0.5, 1.0];

    const result = optimizeChainStrips({
      combinedIdxs, positions, combinedVerts,
      constraintEdgeSet, outerGridVertexCount, outerIdxCount, finalT,
    });

    // Should have flipped the long diagonal to the shorter one
    expect(result.phaseAFlips + result.phaseBFlips + result.phaseCFlips).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Characterization (perf-pin): freezes the EXACT output of
  // optimizeChainStrips on a large deterministic mesh so that any
  // performance refactor of the flip loops can be proven byte-identical.
  // The expected hash + counts were captured from the reference
  // implementation; a mismatch means the refactor changed behaviour.
  // ─────────────────────────────────────────────────────────────────────
  describe('characterization (perf-pin)', () => {
    /** Deterministic PRNG (same as MeshSubdivision perf-pin). */
    function mulberry32(seed: number): () => number {
      let a = seed >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /** FNV-1a 32-bit hash over a Uint32Array (stable, order-sensitive). */
    function hashU32(arr: Uint32Array): number {
      let h = 0x811c9dc5;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        for (let b = 0; b < 4; b++) {
          h ^= (v >>> (b * 8)) & 0xff;
          h = Math.imul(h, 0x01000193);
        }
      }
      return h >>> 0;
    }

    /**
     * Build a deterministic triangulated W×H grid with 3D z-noise (so the
     * diagonals are non-Delaunay and the flip phases do real work).
     * outerGridVertexCount=0 ⇒ every triangle is a chain-strip triangle,
     * exercising the full Phase A/B/C machinery across the whole grid.
     */
    function makeGridMesh(W: number, H: number, seed: number) {
      const rng = mulberry32(seed);
      const positions = new Float32Array(W * H * 3);
      const combinedVerts = new Float32Array(W * H * 3);
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const v = j * W + i;
          const u = i / (W - 1);
          const t = j / (H - 1);
          // 3D position: planar grid + per-vertex z perturbation
          positions[v * 3] = u;
          positions[v * 3 + 1] = t;
          positions[v * 3 + 2] = (rng() - 0.5) * 0.18;
          // UV/T parameter coords
          combinedVerts[v * 3] = u;
          combinedVerts[v * 3 + 1] = t;
          combinedVerts[v * 3 + 2] = 0;
        }
      }
      // Triangulate each cell with a consistent diagonal.
      const idx: number[] = [];
      for (let j = 0; j < H - 1; j++) {
        for (let i = 0; i < W - 1; i++) {
          const bl = j * W + i, br = bl + 1, tl = bl + W, tr = tl + 1;
          idx.push(bl, br, tr);
          idx.push(bl, tr, tl);
        }
      }
      const combinedIdxs = new Uint32Array(idx);
      // A handful of constraint edges scattered through the grid.
      const constraintEdgeSet = new Set<bigint>();
      for (let j = 0; j < H - 1; j += 3) {
        const a = j * W + 2, b = (j + 1) * W + 2;
        constraintEdgeSet.add(edgeKey(a, b));
      }
      const finalT: number[] = [];
      for (let j = 0; j < H; j++) finalT.push(j / (H - 1));
      return {
        combinedIdxs,
        positions,
        combinedVerts,
        constraintEdgeSet,
        outerGridVertexCount: 0,
        outerIdxCount: combinedIdxs.length,
        finalT,
      };
    }

    it('produces the exact same flipped index buffer (40×40 z-noise grid)', () => {
      const mesh = makeGridMesh(40, 40, 0x1234abcd);
      const result = optimizeChainStrips(mesh);

      // Output index buffer must be byte-identical to the captured baseline.
      expect(hashU32(mesh.combinedIdxs)).toBe(2126344167);

      // Flip counts and rejects must match exactly.
      expect({
        phaseAFlips: result.phaseAFlips,
        phaseBFlips: result.phaseBFlips,
        phaseCFlips: result.phaseCFlips,
        rowSpanRejects: result.rowSpanRejects,
        edgeLenRejects: result.edgeLenRejects,
        aspectRejects: result.aspectRejects,
        valenceBonusFlips: result.valenceBonusFlips,
        chainStripTriCount: result.chainStripTriCount,
        chainGridFlips: result.chainGridFlips,
        chainGridFlipsAllowed: result.chainGridFlipsAllowed,
        valBeforeTotal: result.valenceStats.before.total,
        valAfterTotal: result.valenceStats.after.total,
      }).toEqual({
        phaseAFlips: 1866,
        phaseBFlips: 16,
        phaseCFlips: 19,
        rowSpanRejects: 1072,
        edgeLenRejects: 0,
        aspectRejects: 1,
        valenceBonusFlips: 6,
        chainStripTriCount: 3042,
        chainGridFlips: 0,
        chainGridFlipsAllowed: 0,
        valBeforeTotal: 1600,
        valAfterTotal: 1600,
      });
    });

    it('produces the exact same output with real chain-grid edges (split gridVertexCount)', () => {
      // outerGridVertexCount in the middle ⇒ the upper half of the grid are
      // "chain" vertices, so shared edges straddling the split are chain-grid
      // edges, exercising the CHAIN_GRID_FLIP_THRESHOLD gate.
      const mesh = makeGridMesh(40, 40, 0x55aa33cc);
      mesh.outerGridVertexCount = 800; // 1600 verts total → rows 0..19 grid, 20..39 chain

      const result = optimizeChainStrips(mesh);

      expect(hashU32(mesh.combinedIdxs)).toBe(2766157292);
      expect({
        phaseAFlips: result.phaseAFlips,
        phaseBFlips: result.phaseBFlips,
        phaseCFlips: result.phaseCFlips,
        rowSpanRejects: result.rowSpanRejects,
        edgeLenRejects: result.edgeLenRejects,
        aspectRejects: result.aspectRejects,
        valenceBonusFlips: result.valenceBonusFlips,
        chainStripTriCount: result.chainStripTriCount,
        chainGridFlips: result.chainGridFlips,
        chainGridFlipsAllowed: result.chainGridFlipsAllowed,
      }).toEqual({
        phaseAFlips: 934,
        phaseBFlips: 5,
        phaseCFlips: 9,
        rowSpanRejects: 463,
        edgeLenRejects: 0,
        aspectRejects: 2,
        valenceBonusFlips: 2,
        chainStripTriCount: 1560,
        chainGridFlips: 114,
        chainGridFlipsAllowed: 16,
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// optimizeBoundaryDiagonals – Integration Tests
// ═══════════════════════════════════════════════════════════════════════

describe('optimizeBoundaryDiagonals', () => {
  it('returns valid result structure', () => {
    // Simple 2×2 grid (3 cols × 2 rows = 6 verts) with one chain tri
    const positions = makePositions([
      [0, 0, 0], [1, 0, 0], [2, 0, 0],
      [0, 1, 0], [1, 1, 0], [2, 1, 0],
      [1.5, 0.5, 0.5], // chain vertex 6
    ]);
    const outerW = 3, outerH = 2;
    const outerGridVertexCount = 6;

    // Cell (0,0): standard grid → tris at offset 0
    // Cell (1,0): chain-strip → triBase = -1
    const outerQuadMap = new Int32Array([0, -1]);

    // Grid tris for cell (0,0)
    const combinedIdxs = makeIndices([
      0, 1, 4, 0, 4, 3, // cell (0,0) AD diagonal
      1, 6, 4, 2, 6, 5, 4, 6, 5, // chain tris for cell (1,0)
    ]);

    const result = optimizeBoundaryDiagonals({
      combinedIdxs, positions, outerW, outerH,
      outerQuadMap, outerIdxCount: combinedIdxs.length, outerGridVertexCount,
    });

    expect(result).toHaveProperty('flips');
    expect(result).toHaveProperty('checked');
    expect(result).toHaveProperty('timeMs');
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  it('does not modify chain-strip cells', () => {
    const positions = makePositions([
      [0, 0, 0], [1, 0, 0],
      [0, 1, 0], [1, 1, 0],
    ]);
    const outerQuadMap = new Int32Array([-1]); // all chain-strip
    const combinedIdxs = makeIndices([0, 1, 3, 0, 3, 2]);

    const before = new Uint32Array(combinedIdxs);
    optimizeBoundaryDiagonals({
      combinedIdxs, positions, outerW: 2, outerH: 2,
      outerQuadMap, outerIdxCount: combinedIdxs.length, outerGridVertexCount: 4,
    });

    // Nothing should change — all cells are chain-strip
    expect(Array.from(combinedIdxs)).toEqual(Array.from(before));
  });

  it('skips non-boundary cells', () => {
    // 3×2 grid, all cells are standard (no chain tris at all)
    const positions = makePositions([
      [0, 0, 0], [1, 0, 0], [2, 0, 0],
      [0, 1, 0], [1, 1, 0], [2, 1, 0],
    ]);
    const outerQuadMap = new Int32Array([0, 6]); // both standard
    const combinedIdxs = makeIndices([
      0, 1, 4, 0, 4, 3,  // cell (0,0) AD
      1, 2, 5, 1, 5, 4,  // cell (1,0) AD
    ]);

    const result = optimizeBoundaryDiagonals({
      combinedIdxs, positions, outerW: 3, outerH: 2,
      outerQuadMap, outerIdxCount: combinedIdxs.length, outerGridVertexCount: 6,
    });

    expect(result.checked).toBe(0);
    expect(result.flips).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// computeBoundaryDiagnostic – Tests
// ═══════════════════════════════════════════════════════════════════════

describe('computeBoundaryDiagnostic', () => {
  it('returns valid result for mesh with boundary edges', () => {
    // Two triangles sharing an edge, one chain-strip and one grid
    const positions = makePositions([
      [0, 0, 0], [1, 0, 0], [0.5, 1, 0], // grid tri
      [1.5, 1, 0], // chain vertex (index 3)
    ]);
    const indices = makeIndices([
      0, 1, 2,  // grid tri (all < 3)
      1, 3, 2,  // chain-strip tri (vertex 3 >= 3)
    ]);

    const result = computeBoundaryDiagnostic({
      indices, positions, outerIdxCount: indices.length, outerGridVertexCount: 3,
    });

    expect(result.boundaryEdgeCount).toBeGreaterThan(0);
    expect(result.dihedralAvg).toBeCloseTo(1.0, 2); // coplanar → cos ≈ 1
  });

  it('returns 0 boundary edges for mesh with no chain vertices', () => {
    const positions = makePositions([
      [0, 0, 0], [1, 0, 0], [0.5, 1, 0],
    ]);
    const indices = makeIndices([0, 1, 2]);

    const result = computeBoundaryDiagnostic({
      indices, positions, outerIdxCount: indices.length, outerGridVertexCount: 10,
    });

    expect(result.boundaryEdgeCount).toBe(0);
  });

  it('detects non-smooth dihedral for non-coplanar tris', () => {
    // Two tris sharing edge (1,2), one flat and one tilted
    const positions = makePositions([
      [0, 0, 0],     // 0 grid
      [1, 0, 0],     // 1 grid
      [0.5, 1, 0],   // 2 grid
      [1.5, 1, 0.5], // 3 chain vertex (tilted)
    ]);
    const indices = makeIndices([0, 1, 2, 1, 3, 2]);

    const result = computeBoundaryDiagnostic({
      indices, positions, outerIdxCount: indices.length, outerGridVertexCount: 3,
    });

    expect(result.boundaryEdgeCount).toBeGreaterThan(0);
    // Tilted triangle should have dihedral < 1.0
    expect(result.dihedralMin).toBeLessThan(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// computeMeshDiagnostics – Tests
// ═══════════════════════════════════════════════════════════════════════

describe('computeMeshDiagnostics', () => {
  it('returns valid result for simple mesh', () => {
    const finalPositions = makePositions([
      [0, 0, 0], [1, 0, 0], [0.5, 1, 0],
    ]);
    const combinedVerts = makePositions([
      [0, 0, 0], [0.5, 0, 0], [0.25, 0.5, 0],
    ]);
    const finalIndices = makeIndices([0, 1, 2]);

    const result = computeMeshDiagnostics({
      finalIndices,
      finalPositions,
      combinedVerts,
      outerIdxCountAfterSubdiv: 3,
      origVertCount: 3,
      maxSingleRowTSpan: 0.5,
      numU: 3,
      numT: 1,
      gridVertexCount: 3,
    });

    expect(result).toHaveProperty('crossRow1');
    expect(result).toHaveProperty('aspectOver5');
    expect(result).toHaveProperty('val3');
  });

  it('counts low valence vertices correctly', () => {
    // 4 tris sharing a center vertex → center has valence 4
    const finalPositions = makePositions([
      [0, 0, 0],   // 0 center
      [1, 0, 0],   // 1
      [0, 1, 0],   // 2
      [-1, 0, 0],  // 3
      [0, -1, 0],  // 4
    ]);
    const combinedVerts = makePositions([
      [0.5, 0.5, 0], [1, 0.5, 0], [0.5, 1, 0], [0, 0.5, 0], [0.5, 0, 0],
    ]);
    const finalIndices = makeIndices([
      0, 1, 2,
      0, 2, 3,
      0, 3, 4,
      0, 4, 1,
    ]);

    const result = computeMeshDiagnostics({
      finalIndices, finalPositions, combinedVerts,
      outerIdxCountAfterSubdiv: finalIndices.length,
      origVertCount: 5, maxSingleRowTSpan: 0.5,
      numU: 5,
      numT: 1,
      gridVertexCount: 5,
    });

    // Vertex 0 has face-valence 4, vertices 1-4 have face-valence 2
    // val3: 0, val4: valence 4 means 1 vertex, val5: 0
    expect(result.val4).toBe(1);
  });

  it('skips tris beyond outerIdxCountAfterSubdiv', () => {
    // Fan of 4 tris around center vertex 0. With limit including all 4,
    // vertex 0 has face-valence 4. With limit=9 (3 tris), face-valence=3.
    const finalPositions = makePositions([
      [0, 0, 0],   // 0: center
      [1, 0, 0],   // 1
      [0, 1, 0],   // 2
      [-1, 0, 0],  // 3
      [0, -1, 0],  // 4
    ]);
    const combinedVerts = makePositions([
      [0.5, 0.5, 0], [1, 0.5, 0], [0.5, 1, 0], [0, 0.5, 0], [0.5, 0, 0],
    ]);
    const finalIndices = makeIndices([
      0, 1, 2,  // tri 0 — counted
      0, 2, 3,  // tri 1 — counted
      0, 3, 4,  // tri 2 — counted
      0, 4, 1,  // tri 3 — NOT counted (beyond limit)
    ]);

    const result = computeMeshDiagnostics({
      finalIndices, finalPositions, combinedVerts,
      outerIdxCountAfterSubdiv: 9, // only first 3 tris
      origVertCount: 5, maxSingleRowTSpan: 0.5,
      numU: 5,
      numT: 1,
      gridVertexCount: 5,
    });

    // Vertex 0 appears in 3 tris → face-valence 3
    expect(result.val3).toBe(1);
  });

  it('detects cross-row triangles', () => {
    // One triangle spanning 3 row bands
    const finalPositions = makePositions([
      [0, 0, 0], [1, 0, 0], [0.5, 3, 0],
    ]);
    const combinedVerts = makePositions([
      [0, 0, 0],   // t=0
      [0.5, 0, 0], // t=0
      [0.25, 0.9, 0], // t=0.9 → spans 0.9 / 0.1 = 9 row bands
    ]);
    const finalIndices = makeIndices([0, 1, 2]);

    const result = computeMeshDiagnostics({
      finalIndices, finalPositions, combinedVerts,
      outerIdxCountAfterSubdiv: 3, origVertCount: 3,
      maxSingleRowTSpan: 0.1, // very small rows → this tri spans many
      numU: 3,
      numT: 1,
      gridVertexCount: 3,
    });

    // The tSpan is 0.9, rowBands = 9. That's > 3.5, so crossRow3plus
    expect(result.crossRow3plus).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// computeChainStrip3DQuality (B5)
// ═══════════════════════════════════════════════════════════════════════

describe('computeChainStrip3DQuality', () => {
  it('returns zero counts when no chain-strip triangles exist', () => {
    // All-grid triangle (vertices 0,1,2 < gridVertexCount=10)
    const positions = makePositions([
      [0, 0, 0], [1, 0, 0], [0, 1, 0],
    ]);
    const indices = makeIndices([0, 1, 2]);
    const result = computeChainStrip3DQuality({
      indices, positions,
      outerGridVertexCount: 10,
      outerIdxCount: 3,
    });
    expect(result.triCount).toBe(0);
    expect(result.minAngle).toBe(0);
    expect(result.maxAspect).toBe(0);
  });

  it('identifies chain-strip triangles (vertex >= gridVertexCount)', () => {
    // Equilateral-ish triangle: v0, v1 are grid, v2 is chain vertex
    const positions = makePositions([
      [0, 0, 0], [10, 0, 0], // grid verts (idx 0,1 < 2)
      [5, 8, 0],             // chain vert (idx 2 >= gridVertexCount=2)
    ]);
    const indices = makeIndices([0, 1, 2]);
    const result = computeChainStrip3DQuality({
      indices, positions,
      outerGridVertexCount: 2,
      outerIdxCount: 3,
    });
    expect(result.triCount).toBe(1);
    expect(result.minAngle).toBeGreaterThan(0);
    expect(result.maxAspect).toBeGreaterThan(0);
    expect(result.avgAspect).toBeCloseTo(result.maxAspect, 5);
  });

  it('detects high aspect ratio triangles (R4 violations)', () => {
    // Very elongated sliver: long and thin
    const positions = makePositions([
      [0, 0, 0], [100, 0, 0], // grid
      [50, 0.1, 0],           // chain — very thin triangle
    ]);
    const indices = makeIndices([0, 1, 2]);
    const result = computeChainStrip3DQuality({
      indices, positions,
      outerGridVertexCount: 2,
      outerIdxCount: 3,
    });
    expect(result.triCount).toBe(1);
    expect(result.maxAspect).toBeGreaterThan(4);
    expect(result.aspectOver4).toBe(1);
  });

  it('computes grading violations for mismatched adjacent triangles', () => {
    // Two adjacent triangles sharing edge (0,1), very different areas
    // Large triangle: v0(0,0,0), v1(10,0,0), v2(5,10,0) — area=50
    // Tiny triangle: v0(0,0,0), v1(10,0,0), v3(5,0.1,0) — area=0.5
    // Area ratio = 100:1 — grading violation
    const positions = makePositions([
      [0, 0, 0], [10, 0, 0],    // grid (shared edge)
      [5, 10, 0],                // chain vert (large tri)
      [5, 0.1, 0],              // chain vert (tiny tri)
    ]);
    const indices = makeIndices([0, 1, 2, 0, 1, 3]);
    const result = computeChainStrip3DQuality({
      indices, positions,
      outerGridVertexCount: 2,
      outerIdxCount: 6,
    });
    expect(result.triCount).toBe(2);
    expect(result.maxAreaRatio).toBeGreaterThan(2);
    expect(result.gradingViolations).toBeGreaterThan(0);
  });

  it('reports no grading violations for uniform triangles', () => {
    // Two adjacent equilateral-ish triangles of similar area
    const positions = makePositions([
      [0, 0, 0], [10, 0, 0],  // grid (shared edge)
      [5, 8, 0],               // chain vert (tri 1)
      [5, -8, 0],              // chain vert (tri 2)
    ]);
    const indices = makeIndices([0, 1, 2, 0, 1, 3]);
    const result = computeChainStrip3DQuality({
      indices, positions,
      outerGridVertexCount: 2,
      outerIdxCount: 6,
    });
    expect(result.triCount).toBe(2);
    expect(result.maxAreaRatio).toBeLessThan(2);
    expect(result.gradingViolations).toBe(0);
  });
});

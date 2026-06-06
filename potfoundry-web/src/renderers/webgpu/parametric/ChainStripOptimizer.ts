/**
 * ChainStripOptimizer – Chain-strip triangle optimization via 3D edge flipping.
 *
 * Extracted from ParametricExportComputer.ts to reduce monolith complexity (~800 lines).
 * Contains:
 *   - 3D geometry math helpers (pos3, cross3, dot3, triNormal, minAngle3D, etc.)
 *   - Three-phase chain-strip edge flip optimization (angle + valence + short diagonal)
 *   - Boundary diagonal optimization for grid cells adjacent to chain strips
 *   - Boundary diagnostic (read-only dihedral analysis)
 *   - Mesh quality diagnostic (cross-row, aspect ratio, valence analysis)
 *
 * All functions are pure (no GPU/WebGPU dependencies). They operate on
 * Float32Array positions and Uint32Array index buffers. Mutation is
 * limited to the combinedIdxs buffer passed in (documented per function).
 */

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

/** Compact 3-component vector. */
export type Vec3 = [number, number, number];

/** Valence statistics for a set of vertices. */
export interface ValenceStats {
  total: number;
  low: number;   // valence < 5
  ideal: number; // valence === 6
  high: number;  // valence > 7
}

/** Parameters for the three-phase chain-strip edge flip optimization. */
export interface ChainStripFlipParams {
  /** Combined index buffer (mutated in place). */
  combinedIdxs: Uint32Array;
  /** 3D vertex positions from GPU evaluation (xyz interleaved). */
  positions: Float32Array;
  /** UV/T parameter-space coordinates (u, t, 0 interleaved per vertex). */
  combinedVerts: Float32Array;
  /** Pre-built constraint edge set from outerChainEdges. */
  constraintEdgeSet: Set<bigint>;
  /** Number of grid-only vertices; indices >= this are chain vertices. */
  outerGridVertexCount: number;
  /** Number of outer wall indices in combinedIdxs. */
  outerIdxCount: number;
  /** Sorted T-values for adaptive row spacing. */
  finalT: Float32Array | number[];
  /** Optional quad -> triangle-base map; -1 marks non-standard chain/super cells. */
  quadMap?: Int32Array;
  /**
   * Optional set of chain-adjacent vertex indices identified by UV-proximity.
   * When provided, triangles touching these vertices are also treated as chain-strip,
   * catching UV-snapped triangles that the index-based detection misses.
   */
  chainAdjacentVertices?: Set<number>;
  /** R38: Protected corridor around phantom crossing anchors and companions. */
  protectedVertices?: Set<number>;
}

/** Result of the three-phase chain-strip edge flip optimization. */
export interface ChainStripFlipResult {
  phaseAFlips: number;
  phaseBFlips: number;
  phaseCFlips: number;
  rowSpanRejects: number;
  edgeLenRejects: number;
  aspectRejects: number;
  valenceBonusFlips: number;
  chainStripTriCount: number;
  maxSingleRowTSpan: number;
  /** R46: Flips where shared edge has exactly one chain vertex (≥ outerGridVertexCount) */
  chainGridFlips: number;
  /** R47: Chain-grid flips allowed through the quality gate */
  chainGridFlipsAllowed: number;
  /** High-aspect chain-strip flips rescued with UV-convex topology. */
  chainSliverRescueFlips: number;
  /** High-aspect pure-grid flips in non-standard outer-wall cells. */
  nonQuadSliverFlips: number;
  valenceStats: {
    before: ValenceStats;
    after: ValenceStats;
  };
  timeMs: number;
}

interface ChainStripOptimizerProbe {
  triangles?: number[];
  edges?: Array<[number, number]>;
  events?: Array<Record<string, unknown>>;
}

interface ChainStripOptimizerProbeGlobal {
  __pfChainStripOptimizerProbe?: ChainStripOptimizerProbe;
}

/** Parameters for boundary diagonal optimization. */
export interface BoundaryDiagonalParams {
  /** Combined index buffer (mutated in place). */
  combinedIdxs: Uint32Array;
  /** 3D vertex positions (xyz interleaved). */
  positions: Float32Array;
  /** Outer wall grid width (columns). */
  outerW: number;
  /** Outer wall grid height (rows). */
  outerH: number;
  /** Quad → triangle-base-index map. Negative means chain-strip cell. */
  outerQuadMap: Int32Array;
  /** Number of outer wall indices in combinedIdxs. */
  outerIdxCount: number;
  /** Number of grid-only vertices; indices >= this are chain vertices. */
  outerGridVertexCount: number;
  /** Optional UV-proximity chain-adjacent vertices for hybrid detection. */
  chainAdjacentVertices?: Set<number>;
  /** R38: Protected corridor around phantom crossing anchors and companions. */
  protectedVertices?: Set<number>;
}

/** Result of boundary diagonal optimization. */
export interface BoundaryDiagonalResult {
  flips: number;
  checked: number;
  timeMs: number;
}

/** Parameters for boundary diagnostic (read-only). */
export interface BoundaryDiagnosticParams {
  /** Index buffer to analyze. */
  indices: Uint32Array;
  /** 3D vertex positions (xyz interleaved). */
  positions: Float32Array;
  /** Number of outer wall indices to analyze. */
  outerIdxCount: number;
  /** Number of grid-only vertices; indices >= this are chain vertices. */
  outerGridVertexCount: number;
  /** Optional UV-proximity chain-adjacent vertices for hybrid detection. */
  chainAdjacentVertices?: Set<number>;
}

/** Result of boundary diagnostic analysis. */
export interface BoundaryDiagnosticResult {
  boundaryEdgeCount: number;
  dihedralAvg: number;
  dihedralMin: number;
  dihedralMax: number;
}

/** Parameters for mesh quality diagnostics (read-only). */
export interface MeshDiagnosticParams {
  /** Final index buffer (after subdivision). */
  finalIndices: Uint32Array;
  /** Final 3D positions (after subdivision, xyz interleaved). */
  finalPositions: Float32Array;
  /** UV/T parameters for original vertices (u, t, 0 per vertex). */
  combinedVerts: Float32Array;
  /** Outer wall index count after subdivision (original + appended). */
  outerIdxCountAfterSubdiv: number;
  /** Vertex count before subdivision (grid + chain verts). */
  origVertCount: number;
  /** Max T-span of a single row band. */
  maxSingleRowTSpan: number;
  /** Number of columns per row in the outer wall grid. */
  numU: number;
  /** Number of rows in the outer wall grid. */
  numT: number;
  /** Number of grid-only vertices (grid = numU × numT). */
  gridVertexCount: number;
}

/** Result of mesh quality diagnostics. */
export interface MeshDiagnosticResult {
  crossRow1: number;
  crossRow2: number;
  crossRow3plus: number;
  aspectOver5: number;
  aspectOver10: number;
  aspectOver20: number;
  val3: number;
  val4: number;
  val5: number;
  /** Valence-3 vertices on mesh boundary (row 0/last, col 0/last). */
  val3Boundary: number;
  /** Valence-3 vertices in mesh interior — THESE ARE T-JUNCTIONS. */
  val3Interior: number;
  /** Valence-3 vertices that are chain/phantom (index ≥ gridVertexCount). */
  val3Chain: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

/** Maximum Phase A iterations. */
export const MAX_CS_PASSES = 8;
/** Minimum angle improvement for Phase A (radians, ~0.29°). */
export const MIN_ANGLE_IMPROVEMENT = 0.005;
/** Reduced threshold when valence also improves (radians, ~0.03°). */
export const MIN_ANGLE_VALENCE_BONUS = 0.0005;
/** Absolute angle floor: never create triangles worse than this (~2.3°). */
export const MIN_ANGLE_FLOOR = 0.04;
/** Maximum Phase B iterations. */
export const MAX_VALENCE_PASSES = 4;
/** Phase C angle degradation tolerance (radians, ~0.11°). */
export const ANGLE_DEGRADE_TOLERANCE = 0.002;
/** R47: minimum quality gain (radians) required to allow a chain-grid edge flip */
export const CHAIN_GRID_FLIP_THRESHOLD = 0.20;
/** Minimum aspect ratio for the non-standard pure-grid sliver rescue pass. */
const NON_QUAD_SLIVER_ASPECT_TRIGGER = 100.0;
/** Rescue flips must produce triangles at or below this aspect unless massively better. */
const NON_QUAD_SLIVER_TARGET_ASPECT = 100.0;
const EDGE_KEY_SHIFT_BITS = 32n;
const EDGE_KEY_MASK = (1n << EDGE_KEY_SHIFT_BITS) - 1n;
const EDGE_KEY_MAX_INDEX = 0xffffffff;

// ═══════════════════════════════════════════════════════════════════════
// 3D Math Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Canonical bigint edge key: lo in the high 32 bits, hi in the low 32 bits. */
export function edgeKey(a: number, b: number): bigint {
  if (
    !Number.isInteger(a) || !Number.isInteger(b) ||
    a < 0 || b < 0 ||
    a > EDGE_KEY_MAX_INDEX || b > EDGE_KEY_MAX_INDEX
  ) {
    throw new Error(`Vertex index outside Uint32 edgeKey range: a=${a}, b=${b}`);
  }
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return (BigInt(lo) << EDGE_KEY_SHIFT_BITS) | BigInt(hi);
}

/** Read xyz position of vertex v from interleaved Float32Array. */
export function pos3(positions: Float32Array, v: number): Vec3 {
  return [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
}

/** Cross product of two 3D vectors given components. */
export function cross3(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): Vec3 {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** Dot product of two Vec3 arrays. */
export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Length (magnitude) of a Vec3. */
export function len3(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

/** Squared distance between two Vec3 points. */
export function dist3sq(p: Vec3, q: Vec3): number {
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
}

/** Unnormalized triangle normal via cross product of (p1-p0) × (p2-p0). */
export function triNormalFromPoints(p0: Vec3, p1: Vec3, p2: Vec3): Vec3 {
  return cross3(
    p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2],
    p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2],
  );
}

/**
 * Cosine of angle between two unnormalized vectors.
 * Returns 1 (smooth) for degenerate zero-length inputs.
 */
export function cosAngle3(a: Vec3, b: Vec3): number {
  const la = len3(a);
  const lb = len3(b);
  if (la < 1e-12 || lb < 1e-12) return 1;
  return dot3(a, b) / (la * lb);
}

/** Minimum interior angle (radians) of a 3D triangle given vertex indices. */
export function minAngle3D(
  positions: Float32Array, i0: number, i1: number, i2: number,
): number {
  const p0 = pos3(positions, i0), p1 = pos3(positions, i1), p2 = pos3(positions, i2);
  const e01: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e02: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const e12: Vec3 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const d01 = len3(e01), d02 = len3(e02), d12 = len3(e12);
  if (d01 < 1e-12 || d02 < 1e-12 || d12 < 1e-12) return 0;
  const cos0 = dot3(e01, e02) / (d01 * d02);
  const ne01: Vec3 = [-e01[0], -e01[1], -e01[2]];
  const cos1 = dot3(ne01, e12) / (d01 * d12);
  const ne02: Vec3 = [-e02[0], -e02[1], -e02[2]];
  const cos2 = dot3(e12, ne02) / (d12 * d02);
  return Math.min(
    Math.acos(Math.max(-1, Math.min(1, cos0))),
    Math.acos(Math.max(-1, Math.min(1, cos1))),
    Math.acos(Math.max(-1, Math.min(1, cos2))),
  );
}

/**
 * Aspect ratio of a 3D triangle: longest edge / shortest altitude.
 * Values >= 1; high values indicate elongated slivers.
 * Returns 1e6 for degenerate zero-area triangles.
 */
export function triAspect3D(
  positions: Float32Array, i0: number, i1: number, i2: number,
): number {
  const p0 = pos3(positions, i0), p1 = pos3(positions, i1), p2 = pos3(positions, i2);
  const a2 = dist3sq(p1, p2), b2 = dist3sq(p0, p2), c2 = dist3sq(p0, p1);
  const longest2 = Math.max(a2, b2, c2);
  const longest = Math.sqrt(longest2);
  const n = triNormalFromPoints(p0, p1, p2);
  const area2 = len3(n); // 2× area
  if (area2 < 1e-15) return 1e6;
  const shortAlt = area2 / longest;
  return longest / Math.max(shortAlt, 1e-15);
}

/**
 * Check if quad (A,B,C,D) forming a ring is convex in 3D.
 * Verifies all 4 corner cross products point the same direction.
 */
export function isConvexQuad3D(
  positions: Float32Array,
  vA: number, vB: number, vC: number, vD: number,
): boolean {
  const pA = pos3(positions, vA), pB = pos3(positions, vB);
  const pC = pos3(positions, vC), pD = pos3(positions, vD);
  const n0 = cross3(pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2], pD[0] - pA[0], pD[1] - pA[1], pD[2] - pA[2]);
  const n1 = cross3(pC[0] - pB[0], pC[1] - pB[1], pC[2] - pB[2], pA[0] - pB[0], pA[1] - pB[1], pA[2] - pB[2]);
  const n2 = cross3(pD[0] - pC[0], pD[1] - pC[1], pD[2] - pC[2], pB[0] - pC[0], pB[1] - pC[1], pB[2] - pC[2]);
  const n3 = cross3(pA[0] - pD[0], pA[1] - pD[1], pA[2] - pD[2], pC[0] - pD[0], pC[1] - pD[1], pC[2] - pD[2]);
  return dot3(n0, n1) > 0 && dot3(n0, n2) > 0 && dot3(n0, n3) > 0;
}

/** Maximum T-span of a single row band from sorted T-values. */
export function computeMaxRowTSpan(finalT: Float32Array | number[]): number {
  let maxSpan = 0;
  for (let j = 0; j < finalT.length - 1; j++) {
    const span = finalT[j + 1] - finalT[j];
    if (span > maxSpan) maxSpan = span;
  }
  return maxSpan;
}

// ═══════════════════════════════════════════════════════════════════════
// Utility Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Compute valence distribution stats for a vertex valence map. */
export function computeValenceStats(valence: Map<number, number>): ValenceStats {
  let lo = 0, hi = 0, ideal = 0;
  for (const [, v] of valence) {
    if (v < 5) lo++;
    else if (v > 7) hi++;
    else if (v === 6) ideal++;
  }
  return { total: valence.size, low: lo, ideal, high: hi };
}

/**
 * Build the constraint edge set from chain edge pairs.
 * Returns a Set of canonical bigint edge keys.
 */
export function buildConstraintEdgeSet(outerChainEdges: [number, number][]): Set<bigint> {
  const set = new Set<bigint>();
  for (const [v0, v1] of outerChainEdges) {
    set.add(edgeKey(v0, v1));
  }
  return set;
}

// ═══════════════════════════════════════════════════════════════════════
// Three-Phase Chain-Strip Edge Flip Optimization
// ═══════════════════════════════════════════════════════════════════════

/**
 * Three-phase chain-strip edge flip optimization (v16.28f).
 *
 * Phase A: Angle-based Delaunay flips with valence bonus — improves
 *          min-angle across chain-strip triangle pairs, with a reduced
 *          threshold for flips that also improve vertex valence toward 6.
 *
 * Phase B: Valence-only flips — redistributes connectivity at "pinch
 *          points" (valence < 5) and "star points" (valence > 7) without
 *          requiring angle improvement.
 *
 * Phase C: Short-diagonal Delaunay tie-breaker — for near-equal-angle
 *          pairs, flips to the shorter diagonal to eliminate the visible
 *          \\\\ bias from the sweep's consistent `<=` tie-break.
 *
 * Guards (all phases):
 *   1. Convexity: only flip convex quads
 *   2. Normal consistency: both new tris must face same way as originals
 *   3. Row-span: new tris must not exceed original pair's T-extent
 *   4. Edge length: new edge ≤ 2× longest perimeter edge
 *   5. Aspect ratio: reject extreme slivers (aspect > 12)
 *   6. Constraint protection: never flip chain edges
 *   7. Chain-strip only: no boundary flips into grid-managed quads
 *   8. Angle floor: flipped result must not have min-angle < 0.04 rad
 *
 * Mutates combinedIdxs in place.
 */
export function optimizeChainStrips(params: ChainStripFlipParams): ChainStripFlipResult {
  const {
    combinedIdxs, positions, combinedVerts,
    constraintEdgeSet, outerGridVertexCount, outerIdxCount, finalT,
    quadMap, chainAdjacentVertices, protectedVertices,
  } = params;

  const startTime = performance.now();

  // ─── Identify chain-strip triangles (hybrid: index + UV-proximity) ─
  const chainStripTriSet = new Set<number>();
  for (let t = 0; t < outerIdxCount; t += 3) {
    const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
    if (a === b || b === c || a === c) continue;
    // Classic index-based detection
    if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
      chainStripTriSet.add(t);
      continue;
    }
    // UV-proximity detection for v20.0 UV-snapped triangles
    if (chainAdjacentVertices &&
        (chainAdjacentVertices.has(a) || chainAdjacentVertices.has(b) || chainAdjacentVertices.has(c))) {
      chainStripTriSet.add(t);
    }
  }

  const standardQuadTriSet = new Set<number>();
  if (quadMap) {
    for (let i = 0; i < quadMap.length; i++) {
      const triBase = quadMap[i];
      if (triBase < 0) continue;
      standardQuadTriSet.add(triBase);
      standardQuadTriSet.add(triBase + 3);
    }
  }

  // ─── Vertex T-coordinate lookup ──────────────────────────────────
  const vtxT = (v: number): number => combinedVerts[v * 3 + 1];
  const uvOrient = (i0: number, i1: number, i2: number): number => {
    const ax = combinedVerts[i0 * 3], ay = combinedVerts[i0 * 3 + 1];
    const bx = combinedVerts[i1 * 3], by = combinedVerts[i1 * 3 + 1];
    const cx = combinedVerts[i2 * 3], cy = combinedVerts[i2 * 3 + 1];
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  };
  const isConvexQuadUv = (vA: number, vB: number, vC: number, vD: number): boolean => {
    const turns = [
      uvOrient(vA, vB, vC),
      uvOrient(vB, vC, vD),
      uvOrient(vC, vD, vA),
      uvOrient(vD, vA, vB),
    ];
    let sign = 0;
    for (const turn of turns) {
      if (Math.abs(turn) < 1e-12) return false;
      const s = Math.sign(turn);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  };
  const uvOrientedTriangle = (
    targetSign: number,
    i0: number,
    i1: number,
    i2: number,
  ): [number, number, number] => {
    const sign = Math.sign(uvOrient(i0, i1, i2));
    if (sign !== 0 && targetSign !== 0 && sign !== targetSign) {
      return [i0, i2, i1];
    }
    return [i0, i1, i2];
  };

  // ─── Build edge→tri adjacency for chain-strip tris only ─────────
  // Boundary triangles are excluded — flipping at the boundary between
  // chain-strip and standard grid quads creates inconsistencies because
  // the grid quad side is managed by flipEdges3D via quadMap.
  const edgeToTris = new Map<bigint, number[]>();
  for (const t of chainStripTriSet) {
    const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
    for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      if (!edgeToTris.has(ek)) edgeToTris.set(ek, []);
      edgeToTris.get(ek)!.push(t);
    }
  }

  // ─── Local position-bound 3D helpers (allocation-free) ───────────
  // These inline pos3/cross3/dot3/len3/minAngle3D/triAspect3D/isConvexQuad3D
  // with scalar reads to avoid millions of short-lived Vec3 arrays in the
  // per-edge flip loops. Float ops are preserved in original order so the
  // numeric output is bit-identical (pinned by characterization tests).
  const px = (v: number): number => positions[v * 3];
  const py = (v: number): number => positions[v * 3 + 1];
  const pz = (v: number): number => positions[v * 3 + 2];

  // minAngle3D inlined.
  const ma3D = (i0: number, i1: number, i2: number): number => {
    const x0 = px(i0), y0 = py(i0), z0 = pz(i0);
    const x1 = px(i1), y1 = py(i1), z1 = pz(i1);
    const x2 = px(i2), y2 = py(i2), z2 = pz(i2);
    const e01x = x1 - x0, e01y = y1 - y0, e01z = z1 - z0;
    const e02x = x2 - x0, e02y = y2 - y0, e02z = z2 - z0;
    const e12x = x2 - x1, e12y = y2 - y1, e12z = z2 - z1;
    const d01 = Math.sqrt(e01x * e01x + e01y * e01y + e01z * e01z);
    const d02 = Math.sqrt(e02x * e02x + e02y * e02y + e02z * e02z);
    const d12 = Math.sqrt(e12x * e12x + e12y * e12y + e12z * e12z);
    if (d01 < 1e-12 || d02 < 1e-12 || d12 < 1e-12) return 0;
    const cos0 = (e01x * e02x + e01y * e02y + e01z * e02z) / (d01 * d02);
    const cos1 = (-e01x * e12x + -e01y * e12y + -e01z * e12z) / (d01 * d12);
    const cos2 = (e12x * -e02x + e12y * -e02y + e12z * -e02z) / (d12 * d02);
    return Math.min(
      Math.acos(Math.max(-1, Math.min(1, cos0))),
      Math.acos(Math.max(-1, Math.min(1, cos1))),
      Math.acos(Math.max(-1, Math.min(1, cos2))),
    );
  };

  // triAspect3D inlined.
  const ta3D = (i0: number, i1: number, i2: number): number => {
    const x0 = px(i0), y0 = py(i0), z0 = pz(i0);
    const x1 = px(i1), y1 = py(i1), z1 = pz(i1);
    const x2 = px(i2), y2 = py(i2), z2 = pz(i2);
    const a2 = (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2;
    const b2 = (x0 - x2) ** 2 + (y0 - y2) ** 2 + (z0 - z2) ** 2;
    const c2 = (x0 - x1) ** 2 + (y0 - y1) ** 2 + (z0 - z1) ** 2;
    const longest2 = Math.max(a2, b2, c2);
    const longest = Math.sqrt(longest2);
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
    const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (area2 < 1e-15) return 1e6;
    const shortAlt = area2 / longest;
    return longest / Math.max(shortAlt, 1e-15);
  };

  // isConvexQuad3D(positions, vA, vB, vC, vD) inlined; short-circuits on
  // the same dot>0 conjunction as the original.
  const convex = (vA: number, vB: number, vC: number, vD: number): boolean => {
    const ax = px(vA), ay = py(vA), az = pz(vA);
    const bx = px(vB), by = py(vB), bz = pz(vB);
    const cx = px(vC), cy = py(vC), cz = pz(vC);
    const dx = px(vD), dy = py(vD), dz = pz(vD);
    // n0 = cross(B-A, D-A)
    let e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    let e2x = dx - ax, e2y = dy - ay, e2z = dz - az;
    const n0x = e1y * e2z - e1z * e2y, n0y = e1z * e2x - e1x * e2z, n0z = e1x * e2y - e1y * e2x;
    // n1 = cross(C-B, A-B)
    e1x = cx - bx; e1y = cy - by; e1z = cz - bz;
    e2x = ax - bx; e2y = ay - by; e2z = az - bz;
    const n1x = e1y * e2z - e1z * e2y, n1y = e1z * e2x - e1x * e2z, n1z = e1x * e2y - e1y * e2x;
    if (!(n0x * n1x + n0y * n1y + n0z * n1z > 0)) return false;
    // n2 = cross(D-C, B-C)
    e1x = dx - cx; e1y = dy - cy; e1z = dz - cz;
    e2x = bx - cx; e2y = by - cy; e2z = bz - cz;
    const n2x = e1y * e2z - e1z * e2y, n2y = e1z * e2x - e1x * e2z, n2z = e1x * e2y - e1y * e2x;
    if (!(n0x * n2x + n0y * n2y + n0z * n2z > 0)) return false;
    // n3 = cross(A-D, C-D)
    e1x = ax - dx; e1y = ay - dy; e1z = az - dz;
    e2x = cx - dx; e2y = cy - dy; e2z = cz - dz;
    const n3x = e1y * e2z - e1z * e2y, n3y = e1z * e2x - e1x * e2z, n3z = e1x * e2y - e1y * e2x;
    return n0x * n3x + n0y * n3y + n0z * n3z > 0;
  };

  // ─── Row T-span ──────────────────────────────────────────────────
  const maxSingleRowTSpan = computeMaxRowTSpan(finalT);

  // ─── Valence infrastructure ──────────────────────────────────────
  // Build vertex valence map: number of distinct edges per vertex within
  // the chain-strip region. Ideal interior valence is 6.
  const csValence = new Map<number, number>();
  const addValenceEdge = (a: number, b: number): void => {
    csValence.set(a, (csValence.get(a) || 0) + 1);
    csValence.set(b, (csValence.get(b) || 0) + 1);
  };
  const countedEdges = new Set<bigint>();
  for (const t of chainStripTriSet) {
    const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
    const eAB = edgeKey(a, b), eBC = edgeKey(b, c), eCA = edgeKey(c, a);
    if (!countedEdges.has(eAB)) { countedEdges.add(eAB); addValenceEdge(a, b); }
    if (!countedEdges.has(eBC)) { countedEdges.add(eBC); addValenceEdge(b, c); }
    if (!countedEdges.has(eCA)) { countedEdges.add(eCA); addValenceEdge(c, a); }
  }

  const valenceDeviation = (v: number): number => Math.abs((csValence.get(v) || 6) - 6);

  const valenceCost4 = (shLo: number, shHi: number, opp0: number, opp1: number): number =>
    valenceDeviation(shLo) + valenceDeviation(shHi) + valenceDeviation(opp0) + valenceDeviation(opp1);

  const valenceCostAfterFlip = (shLo: number, shHi: number, opp0: number, opp1: number): number => {
    const vShLo = (csValence.get(shLo) || 6) - 1;
    const vShHi = (csValence.get(shHi) || 6) - 1;
    const vOpp0 = (csValence.get(opp0) || 6) + 1;
    const vOpp1 = (csValence.get(opp1) || 6) + 1;
    return Math.abs(vShLo - 6) + Math.abs(vShHi - 6) + Math.abs(vOpp0 - 6) + Math.abs(vOpp1 - 6);
  };

  const applyValenceFlip = (shLo: number, shHi: number, opp0: number, opp1: number): void => {
    csValence.set(shLo, (csValence.get(shLo) || 6) - 1);
    csValence.set(shHi, (csValence.get(shHi) || 6) - 1);
    csValence.set(opp0, (csValence.get(opp0) || 6) + 1);
    csValence.set(opp1, (csValence.get(opp1) || 6) + 1);
  };

  const valBefore = computeValenceStats(csValence);

  // ─── Shared guard helpers ────────────────────────────────────────
  // Row-span guard: returns true if flip would exceed T-span limits.
  // Uses "no-worse" policy + absolute cap at 2 row bands.
  const rowSpanExceeds = (shLo: number, shHi: number, opp0: number, opp1: number): boolean => {
    const t_shLo = vtxT(shLo), t_shHi = vtxT(shHi);
    const t_opp0 = vtxT(opp0), t_opp1 = vtxT(opp1);
    const origTExtent = Math.max(t_shLo, t_shHi, t_opp0, t_opp1) - Math.min(t_shLo, t_shHi, t_opp0, t_opp1);
    const newTriATSpan = Math.max(t_shLo, t_opp0, t_opp1) - Math.min(t_shLo, t_opp0, t_opp1);
    const newTriBTSpan = Math.max(t_shHi, t_opp0, t_opp1) - Math.min(t_shHi, t_opp0, t_opp1);
    const maxNewTSpan = Math.max(newTriATSpan, newTriBTSpan);
    const tSpanLimit = Math.min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.5);
    return maxNewTSpan > tSpanLimit;
  };

  // Edge-length guard: returns true if new diagonal > 2× longest perimeter edge.
  const edgeLenExceeds = (shLo: number, shHi: number, opp0: number, opp1: number): boolean => {
    const loX = px(shLo), loY = py(shLo), loZ = pz(shLo);
    const hiX = px(shHi), hiY = py(shHi), hiZ = pz(shHi);
    const o0X = px(opp0), o0Y = py(opp0), o0Z = pz(opp0);
    const o1X = px(opp1), o1Y = py(opp1), o1Z = pz(opp1);
    const d_lo_o0 = (loX - o0X) ** 2 + (loY - o0Y) ** 2 + (loZ - o0Z) ** 2;
    const d_o0_hi = (o0X - hiX) ** 2 + (o0Y - hiY) ** 2 + (o0Z - hiZ) ** 2;
    const d_hi_o1 = (hiX - o1X) ** 2 + (hiY - o1Y) ** 2 + (hiZ - o1Z) ** 2;
    const d_o1_lo = (o1X - loX) ** 2 + (o1Y - loY) ** 2 + (o1Z - loZ) ** 2;
    const maxPerim2 = Math.max(d_lo_o0, d_o0_hi, d_hi_o1, d_o1_lo);
    const newEdge2 = (o0X - o1X) ** 2 + (o0Y - o1Y) ** 2 + (o0Z - o1Z) ** 2;
    return newEdge2 > maxPerim2 * 4.0; // 2.0² = 4.0
  };

  // Try both windings for a flip; returns valid winding or null.
  type FlipWinding = {
    flipI0: number; flipI1: number; flipI2: number;
    flipJ0: number; flipJ1: number; flipJ2: number;
  };
  const tryFlipWinding = (
    shLo: number, shHi: number, opp0: number, opp1: number,
    a0: number, b0: number, c0: number,
    a1: number, b1: number, c1: number,
  ): FlipWinding | null => {
    // triNorm(p,q,r) = cross(q-p, r-p)
    const a0x = px(a0), a0y = py(a0), a0z = pz(a0);
    let qx = px(b0) - a0x, qy = py(b0) - a0y, qz = pz(b0) - a0z;
    let rx = px(c0) - a0x, ry = py(c0) - a0y, rz = pz(c0) - a0z;
    const on0x = qy * rz - qz * ry, on0y = qz * rx - qx * rz, on0z = qx * ry - qy * rx;
    const a1x = px(a1), a1y = py(a1), a1z = pz(a1);
    qx = px(b1) - a1x; qy = py(b1) - a1y; qz = pz(b1) - a1z;
    rx = px(c1) - a1x; ry = py(c1) - a1y; rz = pz(c1) - a1z;
    const on1x = qy * rz - qz * ry, on1y = qz * rx - qx * rz, on1z = qx * ry - qy * rx;
    const avgX = on0x + on1x, avgY = on0y + on1y, avgZ = on0z + on1z;
    if (Math.sqrt(avgX * avgX + avgY * avgY + avgZ * avgZ) < 1e-12) return null;

    const loX = px(shLo), loY = py(shLo), loZ = pz(shLo);
    const hiX = px(shHi), hiY = py(shHi), hiZ = pz(shHi);
    const o0X = px(opp0), o0Y = py(opp0), o0Z = pz(opp0);
    const o1X = px(opp1), o1Y = py(opp1), o1Z = pz(opp1);
    // newNA = triNorm(shLo, opp0, opp1) = cross(opp0-shLo, opp1-shLo)
    let e1x = o0X - loX, e1y = o0Y - loY, e1z = o0Z - loZ;
    let e2x = o1X - loX, e2y = o1Y - loY, e2z = o1Z - loZ;
    const nAx = e1y * e2z - e1z * e2y, nAy = e1z * e2x - e1x * e2z, nAz = e1x * e2y - e1y * e2x;
    // newNB = triNorm(shHi, opp1, opp0) = cross(opp1-shHi, opp0-shHi)
    e1x = o1X - hiX; e1y = o1Y - hiY; e1z = o1Z - hiZ;
    e2x = o0X - hiX; e2y = o0Y - hiY; e2z = o0Z - hiZ;
    const nBx = e1y * e2z - e1z * e2y, nBy = e1z * e2x - e1x * e2z, nBz = e1x * e2y - e1y * e2x;
    if (avgX * nAx + avgY * nAy + avgZ * nAz > 0 && avgX * nBx + avgY * nBy + avgZ * nBz > 0) {
      return {
        flipI0: shLo, flipI1: opp0, flipI2: opp1,
        flipJ0: shHi, flipJ1: opp1, flipJ2: opp0,
      };
    }
    // altNA = triNorm(shLo, opp1, opp0) = cross(opp1-shLo, opp0-shLo)
    e1x = o1X - loX; e1y = o1Y - loY; e1z = o1Z - loZ;
    e2x = o0X - loX; e2y = o0Y - loY; e2z = o0Z - loZ;
    const aNAx = e1y * e2z - e1z * e2y, aNAy = e1z * e2x - e1x * e2z, aNAz = e1x * e2y - e1y * e2x;
    // altNB = triNorm(shHi, opp0, opp1) = cross(opp0-shHi, opp1-shHi)
    e1x = o0X - hiX; e1y = o0Y - hiY; e1z = o0Z - hiZ;
    e2x = o1X - hiX; e2y = o1Y - hiY; e2z = o1Z - hiZ;
    const aNBx = e1y * e2z - e1z * e2y, aNBy = e1z * e2x - e1x * e2z, aNBz = e1x * e2y - e1y * e2x;
    if (avgX * aNAx + avgY * aNAy + avgZ * aNAz > 0 && avgX * aNBx + avgY * aNBy + avgZ * aNBz > 0) {
      return {
        flipI0: shLo, flipI1: opp1, flipI2: opp0,
        flipJ0: shHi, flipJ1: opp0, flipJ2: opp1,
      };
    }
    return null;
  };

  // Apply flip: update indices, valence, and adjacency.
  const applyFlip = (
    ek: bigint, t0: number, t1: number,
    shLo: number, shHi: number, opp0: number, opp1: number,
    f: FlipWinding,
  ): void => {
    combinedIdxs[t0] = f.flipI0; combinedIdxs[t0 + 1] = f.flipI1; combinedIdxs[t0 + 2] = f.flipI2;
    combinedIdxs[t1] = f.flipJ0; combinedIdxs[t1 + 1] = f.flipJ1; combinedIdxs[t1 + 2] = f.flipJ2;
    applyValenceFlip(shLo, shHi, opp0, opp1);

    const newEk = edgeKey(opp0, opp1);
    edgeToTris.delete(ek);
    edgeToTris.set(newEk, [t0, t1]);

    // Update perimeter adjacency (defensive: handles both swaps)
    for (const perimEk of [edgeKey(shHi, opp0), edgeKey(opp1, shLo)]) {
      const perimTris = edgeToTris.get(perimEk);
      if (perimTris) {
        const idx0 = perimTris.indexOf(t0);
        const idx1 = perimTris.indexOf(t1);
        if (idx0 >= 0) perimTris[idx0] = t1;
        if (idx1 >= 0) perimTris[idx1] = t0;
      }
    }
  };

  // Decode shared edge + opposites from an edge key and two triangle offsets.
  // Returns null if the edge or opposites can't be resolved.
  interface DecodedEdge {
    shLo: number; shHi: number;
    opp0: number; opp1: number;
    a0: number; b0: number; c0: number;
    a1: number; b1: number; c1: number;
  }
  const decodeEdge = (ek: bigint, t0: number, t1: number): DecodedEdge | null => {
    const a0 = combinedIdxs[t0], b0 = combinedIdxs[t0 + 1], c0 = combinedIdxs[t0 + 2];
    const a1 = combinedIdxs[t1], b1 = combinedIdxs[t1 + 1], c1 = combinedIdxs[t1 + 2];
    const shLo = Number(ek >> EDGE_KEY_SHIFT_BITS);
    const shHi = Number(ek & EDGE_KEY_MASK);
    const in0Lo = a0 === shLo || b0 === shLo || c0 === shLo;
    const in0Hi = a0 === shHi || b0 === shHi || c0 === shHi;
    const in1Lo = a1 === shLo || b1 === shLo || c1 === shLo;
    const in1Hi = a1 === shHi || b1 === shHi || c1 === shHi;
    if (!in0Lo || !in0Hi || !in1Lo || !in1Hi) return null;
    let opp0 = -1, opp1 = -1;
    for (const v of [a0, b0, c0]) { if (v !== shLo && v !== shHi) { opp0 = v; break; } }
    for (const v of [a1, b1, c1]) { if (v !== shLo && v !== shHi) { opp1 = v; break; } }
    if (opp0 < 0 || opp1 < 0 || opp0 === opp1) return null;
    return { shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1 };
  };

  const probe = (globalThis as unknown as ChainStripOptimizerProbeGlobal).__pfChainStripOptimizerProbe;
  const probeEdges = new Set<string>();
  if (probe?.edges) {
    for (const [a, b] of probe.edges) probeEdges.add(edgeKey(a, b).toString());
  }
  const probeTriangles = new Set<number>((probe?.triangles ?? []).map((tri) => tri * 3));
  const recordProbe = (payload: Record<string, unknown>): void => {
    if (!probe) return;
    (probe.events ??= []).push(payload);
    try {
      console.warn(`[CSO-PROBE] ${JSON.stringify(payload)}`);
    } catch {
      console.warn('[CSO-PROBE] <unserializable>');
    }
  };
  const isProbeEdge = (ek: bigint): boolean => probeEdges.has(ek.toString());
  const isProbeTriPair = (t0: number, t1: number): boolean =>
    probeTriangles.has(t0) || probeTriangles.has(t1);
  const edgeLabel = (a: number, b: number): string => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const explainProbeEdge = (
    stage: string,
    ek: bigint,
    tris: number[] | undefined,
    useUvConvexity: boolean,
  ): void => {
    if (!probe || !isProbeEdge(ek)) return;
    if (!tris) {
      recordProbe({ stage, edge: ek.toString(), status: 'absent' });
      return;
    }
    if (tris.length !== 2) {
      recordProbe({ stage, edge: ek.toString(), status: 'wrong-incidence', tris: tris.map((t) => t / 3) });
      return;
    }
    const d = decodeEdge(ek, tris[0], tris[1]);
    if (!d) {
      recordProbe({ stage, edge: ek.toString(), status: 'decode-failed', tris: tris.map((t) => t / 3) });
      return;
    }
    const { shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1 } = d;
    let reject = '';
    const newEdge = edgeKey(opp0, opp1);
    const curAspect = Math.max(ta3D(a0, b0, c0), ta3D(a1, b1, c1));
    const curMin = Math.min(ma3D(a0, b0, c0), ma3D(a1, b1, c1));
    let newAspect: number | undefined;
    let newMin: number | undefined;
    if (constraintEdgeSet.has(ek)) reject = 'current-constraint';
    else if (touchesProtectedCorridor(shLo, shHi, opp0, opp1)) reject = 'protected';
    else if (constraintEdgeSet.has(newEdge)) reject = 'new-constraint';
    else if (useUvConvexity ? !isConvexQuadUv(shLo, opp0, shHi, opp1) : !convex(shLo, opp0, shHi, opp1)) reject = 'not-convex';
    else if (rowSpanExceeds(shLo, shHi, opp0, opp1)) reject = 'row-span';
    else if (edgeLenExceeds(shLo, shHi, opp0, opp1)) reject = 'edge-length';
    else {
      const oldUvSign = Math.sign(uvOrient(a0, b0, c0) + uvOrient(a1, b1, c1));
      const tri0 = uvOrientedTriangle(oldUvSign, shLo, opp0, opp1);
      const tri1 = uvOrientedTriangle(oldUvSign, shHi, opp1, opp0);
      newAspect = Math.max(ta3D(tri0[0], tri0[1], tri0[2]), ta3D(tri1[0], tri1[1], tri1[2]));
      newMin = Math.min(ma3D(tri0[0], tri0[1], tri0[2]), ma3D(tri1[0], tri1[1], tri1[2]));
      if (newMin <= curMin + MIN_ANGLE_VALENCE_BONUS) reject = 'angle-gain';
      else if (newAspect > Math.min(NON_QUAD_SLIVER_TARGET_ASPECT, curAspect * 0.25)) reject = 'aspect-target';
    }
    recordProbe({
      stage,
      edge: edgeLabel(shLo, shHi),
      tris: tris.map((t) => t / 3),
      verts: [a0, b0, c0, a1, b1, c1],
      shared: [shLo, shHi],
      opposites: [opp0, opp1],
      classes: [shLo, shHi, opp0, opp1].map((v) => v >= outerGridVertexCount ? 'chain' : 'grid'),
      chainStrip: tris.map((t) => chainStripTriSet.has(t)),
      standardQuad: tris.map((t) => standardQuadTriSet.has(t)),
      chainAdjacent: [shLo, shHi, opp0, opp1].map((v) => chainAdjacentVertices?.has(v) ?? false),
      curAspect,
      curMin,
      newAspect,
      newMin,
      reject: reject || 'eligible',
    });
  };

  const touchesProtectedCorridor = (a: number, b: number, c: number, d: number): boolean =>
    protectedVertices !== undefined &&
    (protectedVertices.has(a) || protectedVertices.has(b) || protectedVertices.has(c) || protectedVertices.has(d));

  if (probe) {
    for (const triBase of probeTriangles) {
      if (triBase < 0 || triBase + 2 >= outerIdxCount) continue;
      const verts = [combinedIdxs[triBase], combinedIdxs[triBase + 1], combinedIdxs[triBase + 2]];
      recordProbe({
        stage: 'triangle-classification',
        tri: triBase / 3,
        verts,
        classes: verts.map((v) => v >= outerGridVertexCount ? 'chain' : 'grid'),
        chainStrip: chainStripTriSet.has(triBase),
        standardQuad: standardQuadTriSet.has(triBase),
        chainAdjacent: verts.map((v) => chainAdjacentVertices?.has(v) ?? false),
        aspect: ta3D(verts[0], verts[1], verts[2]),
        minAngle: ma3D(verts[0], verts[1], verts[2]),
      });
    }
    for (const edgeText of probeEdges) {
      const ek = BigInt(edgeText);
      explainProbeEdge('chain-map-initial', ek, edgeToTris.get(ek), false);
    }
  }

  // ─── Phase A: Angle-based with valence bonus ─────────────────────
  let totalCSFlips = 0;
  let csRowSpanRejects = 0, csEdgeLenRejects = 0, csAspectRejects = 0;
  let csValenceBonus = 0;
  // R46: Count flips where the shared edge has exactly one chain vertex
  let chainGridFlips = 0;
  let chainGridFlipsAllowed = 0;
  const isChainGridEdge = (a: number, b: number): boolean =>
    (a >= outerGridVertexCount) !== (b >= outerGridVertexCount);

  for (let pass = 0; pass < MAX_CS_PASSES; pass++) {
    let passFlips = 0;
    const edgeKeys = Array.from(edgeToTris.keys());

    for (const ek of edgeKeys) {
      const tris = edgeToTris.get(ek);
      if (!tris || tris.length !== 2) continue;
      if (constraintEdgeSet.has(ek)) continue;

      const d = decodeEdge(ek, tris[0], tris[1]);
      if (!d) continue;
      const { shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1 } = d;
      const t0 = tris[0], t1 = tris[1];
      if (touchesProtectedCorridor(shLo, shHi, opp0, opp1)) continue;

      // Don't create a constraint edge
      if (constraintEdgeSet.has(edgeKey(opp0, opp1))) continue;

      // Convexity check
      if (!convex(shLo, opp0, shHi, opp1)) continue;

      // Row-span guard
      if (rowSpanExceeds(shLo, shHi, opp0, opp1)) {
        csRowSpanRejects++;
        continue;
      }

      // Edge length guard
      if (edgeLenExceeds(shLo, shHi, opp0, opp1)) {
        csEdgeLenRejects++;
        continue;
      }

      // Current quality
      const curMin = Math.min(ma3D(a0, b0, c0), ma3D(a1, b1, c1));

      // Normal consistency + winding
      const fw = tryFlipWinding(shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1);
      if (!fw) continue;

      // Quality check: min angle must improve.
      // If the flip also improves valence, use a much lower threshold.
      const flipMin = Math.min(ma3D(fw.flipI0, fw.flipI1, fw.flipI2), ma3D(fw.flipJ0, fw.flipJ1, fw.flipJ2));
      const curValCost = valenceCost4(shLo, shHi, opp0, opp1);
      const newValCost = valenceCostAfterFlip(shLo, shHi, opp0, opp1);
      const valenceImproves = newValCost < curValCost;
      const threshold = valenceImproves ? MIN_ANGLE_VALENCE_BONUS : MIN_ANGLE_IMPROVEMENT;
      if (flipMin <= curMin + threshold) continue;
      // Floor check: never create very bad triangles
      if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin) continue;
      if (valenceImproves && flipMin > curMin + MIN_ANGLE_VALENCE_BONUS && flipMin <= curMin + MIN_ANGLE_IMPROVEMENT) {
        csValenceBonus++;
      }

      // Aspect ratio guard
      const newAspect = Math.max(ta3D(fw.flipI0, fw.flipI1, fw.flipI2), ta3D(fw.flipJ0, fw.flipJ1, fw.flipJ2));
      const curAspect = Math.max(ta3D(a0, b0, c0), ta3D(a1, b1, c1));
      if (newAspect > 12.0 && newAspect > curAspect) {
        csAspectRejects++;
        continue;
      }

      // Apply
      // R47: quality-gated chain-grid flip (was blanket skip in R46)
      if (isChainGridEdge(shLo, shHi)) {
        const qualityGain = flipMin - curMin;
        if (qualityGain < CHAIN_GRID_FLIP_THRESHOLD) {
          chainGridFlips++;
          continue;
        }
        chainGridFlipsAllowed++;
      }

      applyFlip(ek, t0, t1, shLo, shHi, opp0, opp1, fw);
      passFlips++;
    }
    totalCSFlips += passFlips;
    if (passFlips === 0) break;
  }

  // ─── Phase B: Valence-only flips ─────────────────────────────────
  let phaseB_flips = 0;

  for (let pass = 0; pass < MAX_VALENCE_PASSES; pass++) {
    let passFlips = 0;
    const edgeKeys2 = Array.from(edgeToTris.keys());

    for (const ek of edgeKeys2) {
      const tris = edgeToTris.get(ek);
      if (!tris || tris.length !== 2) continue;
      if (constraintEdgeSet.has(ek)) continue;

      const d = decodeEdge(ek, tris[0], tris[1]);
      if (!d) continue;
      const { shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1 } = d;
      const t0 = tris[0], t1 = tris[1];
      if (touchesProtectedCorridor(shLo, shHi, opp0, opp1)) continue;

      // Skip if valence doesn't improve
      const curValCost = valenceCost4(shLo, shHi, opp0, opp1);
      const newValCost = valenceCostAfterFlip(shLo, shHi, opp0, opp1);
      if (newValCost >= curValCost) continue;

      if (constraintEdgeSet.has(edgeKey(opp0, opp1))) continue;
      if (!convex(shLo, opp0, shHi, opp1)) continue;

      // Row-span guard
      if (rowSpanExceeds(shLo, shHi, opp0, opp1)) continue;

      // Edge length guard
      if (edgeLenExceeds(shLo, shHi, opp0, opp1)) continue;

      // Normal consistency + winding
      const fw = tryFlipWinding(shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1);
      if (!fw) continue;

      // Angle floor: flipped result must not have terrible min-angle
      const curMin = Math.min(ma3D(a0, b0, c0), ma3D(a1, b1, c1));
      const flipMin = Math.min(ma3D(fw.flipI0, fw.flipI1, fw.flipI2), ma3D(fw.flipJ0, fw.flipJ1, fw.flipJ2));
      if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin) continue;
      // Don't allow angle to degrade more than 0.01 rad (~0.57°) even for valence
      if (flipMin < curMin - 0.01) continue;

      // Aspect ratio guard
      const newAspect = Math.max(ta3D(fw.flipI0, fw.flipI1, fw.flipI2), ta3D(fw.flipJ0, fw.flipJ1, fw.flipJ2));
      const curAspect = Math.max(ta3D(a0, b0, c0), ta3D(a1, b1, c1));
      if (newAspect > 12.0 && newAspect > curAspect) continue;

      // R47: quality-gated chain-grid flip
      if (isChainGridEdge(shLo, shHi)) {
        const qualityGain = flipMin - curMin;
        if (qualityGain < CHAIN_GRID_FLIP_THRESHOLD) {
          chainGridFlips++;
          continue;
        }
        chainGridFlipsAllowed++;
      }

      applyFlip(ek, t0, t1, shLo, shHi, opp0, opp1, fw);
      passFlips++;
    }
    phaseB_flips += passFlips;
    if (passFlips === 0) break;
  }

  // ─── Phase C: Short-diagonal flips (Delaunay tie-breaker) ────────
  // When angle difference is negligible, flip to the SHORTER diagonal.
  // Shorter diagonal → more equilateral triangles on near-planar quads.
  let phaseC_flips = 0;
  {
    const edgeKeys3 = Array.from(edgeToTris.keys());

    for (const ek of edgeKeys3) {
      const tris = edgeToTris.get(ek);
      if (!tris || tris.length !== 2) continue;
      if (constraintEdgeSet.has(ek)) continue;

      const d = decodeEdge(ek, tris[0], tris[1]);
      if (!d) continue;
      const { shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1 } = d;
      const t0 = tris[0], t1 = tris[1];
      if (touchesProtectedCorridor(shLo, shHi, opp0, opp1)) continue;

      if (constraintEdgeSet.has(edgeKey(opp0, opp1))) continue;

      // Check if the alternative diagonal is actually shorter
      const loX = px(shLo), loY = py(shLo), loZ = pz(shLo);
      const hiX = px(shHi), hiY = py(shHi), hiZ = pz(shHi);
      const o0X = px(opp0), o0Y = py(opp0), o0Z = pz(opp0);
      const o1X = px(opp1), o1Y = py(opp1), o1Z = pz(opp1);
      const curDiag2 = (loX - hiX) ** 2 + (loY - hiY) ** 2 + (loZ - hiZ) ** 2;
      const altDiag2 = (o0X - o1X) ** 2 + (o0Y - o1Y) ** 2 + (o0Z - o1Z) ** 2;
      if (altDiag2 >= curDiag2) continue; // only flip to shorter diagonal

      if (!convex(shLo, opp0, shHi, opp1)) continue;

      // Row-span guard
      if (rowSpanExceeds(shLo, shHi, opp0, opp1)) continue;

      // Edge length guard
      {
        const d_lo_o0 = (loX - o0X) ** 2 + (loY - o0Y) ** 2 + (loZ - o0Z) ** 2;
        const d_o0_hi = (o0X - hiX) ** 2 + (o0Y - hiY) ** 2 + (o0Z - hiZ) ** 2;
        const d_hi_o1 = (hiX - o1X) ** 2 + (hiY - o1Y) ** 2 + (hiZ - o1Z) ** 2;
        const d_o1_lo = (o1X - loX) ** 2 + (o1Y - loY) ** 2 + (o1Z - loZ) ** 2;
        const maxPerim2 = Math.max(d_lo_o0, d_o0_hi, d_hi_o1, d_o1_lo);
        if (altDiag2 > maxPerim2 * 4.0) continue;
      }

      // Angle quality: the flip must not degrade min-angle too much
      const curMin = Math.min(ma3D(a0, b0, c0), ma3D(a1, b1, c1));

      // Normal consistency + winding
      const fw = tryFlipWinding(shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1);
      if (!fw) continue;

      const flipMin = Math.min(ma3D(fw.flipI0, fw.flipI1, fw.flipI2), ma3D(fw.flipJ0, fw.flipJ1, fw.flipJ2));
      // Allow small angle degradation for shorter diagonal
      if (flipMin < curMin - ANGLE_DEGRADE_TOLERANCE) continue;
      // Never create very bad triangles
      if (flipMin < MIN_ANGLE_FLOOR) continue;

      // Aspect ratio guard
      const newAspect = Math.max(ta3D(fw.flipI0, fw.flipI1, fw.flipI2), ta3D(fw.flipJ0, fw.flipJ1, fw.flipJ2));
      if (newAspect > 12.0) continue;

      // R47: quality-gated chain-grid flip
      if (isChainGridEdge(shLo, shHi)) {
        const qualityGain = flipMin - curMin;
        if (qualityGain < CHAIN_GRID_FLIP_THRESHOLD) {
          chainGridFlips++;
          continue;
        }
        chainGridFlipsAllowed++;
      }

      applyFlip(ek, t0, t1, shLo, shHi, opp0, opp1, fw);
      phaseC_flips++;
    }
  }

  let chainSliverRescueFlips = 0;
  {
    const allOuterEdgeCounts = new Map<bigint, number>();
    for (let t = 0; t < outerIdxCount; t += 3) {
      const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
      if (a === b || b === c || a === c) continue;
      for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
        allOuterEdgeCounts.set(ek, (allOuterEdgeCounts.get(ek) ?? 0) + 1);
      }
    }

    const flippedTris = new Set<number>();
    for (const [ek, tris] of Array.from(edgeToTris.entries())) {
      if (tris.length !== 2) continue;
      if (constraintEdgeSet.has(ek)) continue;
      const t0 = tris[0], t1 = tris[1];
      if (flippedTris.has(t0) || flippedTris.has(t1)) continue;

      const d = decodeEdge(ek, t0, t1);
      if (!d) continue;
      const { shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1 } = d;
      const probeChainRescue = isProbeEdge(ek) || isProbeTriPair(t0, t1);
      if (probeChainRescue) {
        const oldUvSign = Math.sign(uvOrient(a0, b0, c0) + uvOrient(a1, b1, c1));
        const tri0 = uvOrientedTriangle(oldUvSign, shLo, opp0, opp1);
        const tri1 = uvOrientedTriangle(oldUvSign, shHi, opp1, opp0);
        const curAspect = Math.max(ta3D(a0, b0, c0), ta3D(a1, b1, c1));
        const newAspect = Math.max(ta3D(tri0[0], tri0[1], tri0[2]), ta3D(tri1[0], tri1[1], tri1[2]));
        const curMin = Math.min(ma3D(a0, b0, c0), ma3D(a1, b1, c1));
        const newMin = Math.min(ma3D(tri0[0], tri0[1], tri0[2]), ma3D(tri1[0], tri1[1], tri1[2]));
        recordProbe({
          stage: 'chain-sliver-rescue-candidate',
          edge: edgeLabel(shLo, shHi),
          tris: [t0 / 3, t1 / 3],
          shared: [shLo, shHi],
          opposites: [opp0, opp1],
          uv: [shLo, shHi, opp0, opp1].map((v) => [
            combinedVerts[v * 3],
            combinedVerts[v * 3 + 1],
          ]),
          uvTurns: [
            uvOrient(shLo, opp0, shHi),
            uvOrient(opp0, shHi, opp1),
            uvOrient(shHi, opp1, shLo),
            uvOrient(opp1, shLo, opp0),
          ],
          newUvOrient: [
            uvOrient(shLo, opp0, opp1),
            uvOrient(shHi, opp1, opp0),
          ],
          newEdgeExists: (allOuterEdgeCounts.get(edgeKey(opp0, opp1)) ?? 0) > 0,
          currentConstraint: constraintEdgeSet.has(ek),
          newConstraint: constraintEdgeSet.has(edgeKey(opp0, opp1)),
          protected: touchesProtectedCorridor(shLo, shHi, opp0, opp1),
          uvConvex: isConvexQuadUv(shLo, opp0, shHi, opp1),
          rowSpan: rowSpanExceeds(shLo, shHi, opp0, opp1),
          edgeLength: edgeLenExceeds(shLo, shHi, opp0, opp1),
          chainGrid: isChainGridEdge(shLo, shHi),
          curAspect,
          newAspect,
          targetAspect: Math.min(NON_QUAD_SLIVER_TARGET_ASPECT, curAspect * 0.25),
          curMin,
          newMin,
        });
      }
      if (touchesProtectedCorridor(shLo, shHi, opp0, opp1)) continue;

      const newEdge = edgeKey(opp0, opp1);
      if (constraintEdgeSet.has(newEdge)) continue;
      if ((allOuterEdgeCounts.get(newEdge) ?? 0) > 0) continue;
      if (!isConvexQuadUv(shLo, opp0, shHi, opp1)) continue;
      if (rowSpanExceeds(shLo, shHi, opp0, opp1)) continue;
      if (edgeLenExceeds(shLo, shHi, opp0, opp1)) continue;

      const curAspect = Math.max(ta3D(a0, b0, c0), ta3D(a1, b1, c1));
      if (!Number.isFinite(curAspect) || curAspect < NON_QUAD_SLIVER_ASPECT_TRIGGER) continue;

      const oldUvSign = Math.sign(uvOrient(a0, b0, c0) + uvOrient(a1, b1, c1));
      const tri0 = uvOrientedTriangle(oldUvSign, shLo, opp0, opp1);
      const tri1 = uvOrientedTriangle(oldUvSign, shHi, opp1, opp0);
      const newAspect = Math.max(ta3D(tri0[0], tri0[1], tri0[2]), ta3D(tri1[0], tri1[1], tri1[2]));
      if (!Number.isFinite(newAspect)) continue;
      const targetAspect = Math.min(NON_QUAD_SLIVER_TARGET_ASPECT, curAspect * 0.25);
      if (newAspect > targetAspect) continue;

      const curMin = Math.min(ma3D(a0, b0, c0), ma3D(a1, b1, c1));
      const newMin = Math.min(ma3D(tri0[0], tri0[1], tri0[2]), ma3D(tri1[0], tri1[1], tri1[2]));
      if (newMin <= curMin + MIN_ANGLE_VALENCE_BONUS) continue;
      if (isChainGridEdge(shLo, shHi) && newMin - curMin < CHAIN_GRID_FLIP_THRESHOLD) {
        chainGridFlips++;
        continue;
      }

      combinedIdxs[t0] = tri0[0]; combinedIdxs[t0 + 1] = tri0[1]; combinedIdxs[t0 + 2] = tri0[2];
      combinedIdxs[t1] = tri1[0]; combinedIdxs[t1 + 1] = tri1[1]; combinedIdxs[t1 + 2] = tri1[2];
      applyValenceFlip(shLo, shHi, opp0, opp1);
      allOuterEdgeCounts.set(ek, 0);
      allOuterEdgeCounts.set(newEdge, 2);
      flippedTris.add(t0);
      flippedTris.add(t1);
      chainSliverRescueFlips++;
    }
  }

  let nonQuadSliverFlips = 0;
  if (quadMap) {
    const allOuterEdgeCounts = new Map<bigint, number>();
    const nonQuadEdgeToTris = new Map<bigint, number[]>();
    for (let t = 0; t < outerIdxCount; t += 3) {
      const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
      if (a === b || b === c || a === c) continue;
      const edges = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)];
      for (const ek of edges) {
        allOuterEdgeCounts.set(ek, (allOuterEdgeCounts.get(ek) ?? 0) + 1);
      }
      if (chainStripTriSet.has(t) || standardQuadTriSet.has(t)) continue;
      if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) continue;
      if (chainAdjacentVertices &&
          (chainAdjacentVertices.has(a) || chainAdjacentVertices.has(b) || chainAdjacentVertices.has(c))) {
        continue;
      }
      for (const ek of edges) {
        let tris = nonQuadEdgeToTris.get(ek);
        if (!tris) { tris = []; nonQuadEdgeToTris.set(ek, tris); }
        tris.push(t);
      }
    }

    if (probe) {
      for (const edgeText of probeEdges) {
        const ek = BigInt(edgeText);
        explainProbeEdge('nonquad-map-initial', ek, nonQuadEdgeToTris.get(ek), true);
      }
    }

    const flippedTris = new Set<number>();
    for (const [ek, tris] of nonQuadEdgeToTris) {
      if (tris.length !== 2) continue;
      if (constraintEdgeSet.has(ek)) continue;
      const t0 = tris[0], t1 = tris[1];
      if (flippedTris.has(t0) || flippedTris.has(t1)) continue;

      const d = decodeEdge(ek, t0, t1);
      if (!d) continue;
      const { shLo, shHi, opp0, opp1, a0, b0, c0, a1, b1, c1 } = d;
      if (touchesProtectedCorridor(shLo, shHi, opp0, opp1)) continue;

      const newEdge = edgeKey(opp0, opp1);
      if (constraintEdgeSet.has(newEdge)) continue;
      if ((allOuterEdgeCounts.get(newEdge) ?? 0) > 0) continue;
      if (!isConvexQuadUv(shLo, opp0, shHi, opp1)) continue;
      if (rowSpanExceeds(shLo, shHi, opp0, opp1)) continue;
      if (edgeLenExceeds(shLo, shHi, opp0, opp1)) continue;

      const curAspect = Math.max(ta3D(a0, b0, c0), ta3D(a1, b1, c1));
      if (!Number.isFinite(curAspect) || curAspect < NON_QUAD_SLIVER_ASPECT_TRIGGER) continue;

      const oldUvSign = Math.sign(uvOrient(a0, b0, c0) + uvOrient(a1, b1, c1));
      const tri0 = uvOrientedTriangle(oldUvSign, shLo, opp0, opp1);
      const tri1 = uvOrientedTriangle(oldUvSign, shHi, opp1, opp0);
      const newAspect = Math.max(ta3D(tri0[0], tri0[1], tri0[2]), ta3D(tri1[0], tri1[1], tri1[2]));
      if (!Number.isFinite(newAspect)) continue;
      const targetAspect = Math.min(NON_QUAD_SLIVER_TARGET_ASPECT, curAspect * 0.25);
      if (newAspect > targetAspect) continue;

      const curMin = Math.min(ma3D(a0, b0, c0), ma3D(a1, b1, c1));
      const newMin = Math.min(ma3D(tri0[0], tri0[1], tri0[2]), ma3D(tri1[0], tri1[1], tri1[2]));
      if (newMin <= curMin + MIN_ANGLE_VALENCE_BONUS) continue;

      combinedIdxs[t0] = tri0[0]; combinedIdxs[t0 + 1] = tri0[1]; combinedIdxs[t0 + 2] = tri0[2];
      combinedIdxs[t1] = tri1[0]; combinedIdxs[t1 + 1] = tri1[1]; combinedIdxs[t1 + 2] = tri1[2];
      allOuterEdgeCounts.set(ek, 0);
      allOuterEdgeCounts.set(newEdge, 2);
      flippedTris.add(t0);
      flippedTris.add(t1);
      nonQuadSliverFlips++;
    }
  }

  const valAfter = computeValenceStats(csValence);

  return {
    phaseAFlips: totalCSFlips,
    phaseBFlips: phaseB_flips,
    phaseCFlips: phaseC_flips,
    rowSpanRejects: csRowSpanRejects,
    edgeLenRejects: csEdgeLenRejects,
    aspectRejects: csAspectRejects,
    valenceBonusFlips: csValenceBonus,
    chainStripTriCount: chainStripTriSet.size,
    maxSingleRowTSpan,
    chainGridFlips,
    chainGridFlipsAllowed,
    chainSliverRescueFlips,
    nonQuadSliverFlips,
    valenceStats: { before: valBefore, after: valAfter },
    timeMs: performance.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Boundary Diagonal Optimization (v16.34)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Boundary diagonal optimization (v16.34).
 *
 * Standard cells adjacent to chain strips have their diagonal chosen by
 * chainDirectedFlip (UV-based chain direction). This pass examines each
 * standard cell bordering a chain strip, tries both diagonal options
 * (AD and BC), and picks the one that minimizes the dihedral angle at
 * the boundary edge with the adjacent chain-strip triangle.
 *
 * Only changes the INTERNAL DIAGONAL of standard cells — a safe operation
 * that rearranges two triangles within one cell.
 *
 * Mutates combinedIdxs in place.
 */
export function optimizeBoundaryDiagonals(params: BoundaryDiagonalParams): BoundaryDiagonalResult {
  const {
    combinedIdxs, positions, outerW, outerH,
    outerQuadMap, outerIdxCount, outerGridVertexCount,
    chainAdjacentVertices: bdChainAdjacentVerts,
    protectedVertices,
  } = params;

  const startTime = performance.now();
  const cellsPerRow = outerW - 1;

  // Build edge→tri adjacency for all outer wall tris
  const bdEdge2Tri = new Map<bigint, number[]>();
  for (let t = 0; t < outerIdxCount; t += 3) {
    const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
    if (a === b || b === c || a === c) continue;
    for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      let arr = bdEdge2Tri.get(ek);
      if (!arr) { arr = []; bdEdge2Tri.set(ek, arr); }
      arr.push(t);
    }
  }

  // 3D normal of a triangle (unnormalized), reading from positions
  const bdNorm = (v0: number, v1: number, v2: number): Vec3 => {
    const ax = positions[v1 * 3] - positions[v0 * 3];
    const ay = positions[v1 * 3 + 1] - positions[v0 * 3 + 1];
    const az = positions[v1 * 3 + 2] - positions[v0 * 3 + 2];
    const bx = positions[v2 * 3] - positions[v0 * 3];
    const by = positions[v2 * 3 + 1] - positions[v0 * 3 + 1];
    const bz = positions[v2 * 3 + 2] - positions[v0 * 3 + 2];
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  };

  // Normalized dot product (cosine of angle between normals)
  const bdDotN = (a: Vec3, b: Vec3): number => {
    const la = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const lb = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
    if (la < 1e-12 || lb < 1e-12) return 1; // degenerate → treat as smooth
    return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  };

  let bdFlips = 0;
  let bdChecked = 0;

  for (let j = 0; j < outerH - 1; j++) {
    for (let col = 0; col < cellsPerRow; col++) {
      const qIdx = j * cellsPerRow + col;
      const triBase = outerQuadMap[qIdx];
      if (triBase < 0) continue; // chain-strip cell, skip

      // Cell vertices
      const vBL = j * outerW + col;
      const vBR = j * outerW + col + 1;
      const vTL = (j + 1) * outerW + col;
      const vTR = (j + 1) * outerW + col + 1;

      // Check boundary edges: right (vBR→vTR) and left (vBL→vTL)
      const checkEdge = (v0: number, v1: number): number => {
        const ek = edgeKey(v0, v1);
        const tris = bdEdge2Tri.get(ek);
        if (!tris || tris.length !== 2) return -1;
        for (const t of tris) {
          const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
          // Hybrid detection: index-based + UV-proximity
          if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
            return t;
          }
          if (bdChainAdjacentVerts &&
              (bdChainAdjacentVerts.has(a) || bdChainAdjacentVerts.has(b) || bdChainAdjacentVerts.has(c))) {
            return t;
          }
        }
        return -1;
      };

      const csTriRight = checkEdge(vBR, vTR);
      const csTriLeft = checkEdge(vBL, vTL);
      if (csTriRight < 0 && csTriLeft < 0) continue;

      if (protectedVertices && (
        protectedVertices.has(vBL) || protectedVertices.has(vBR) ||
        protectedVertices.has(vTL) || protectedVertices.has(vTR)
      )) {
        continue;
      }

      const triTouchesProtected = (triBaseIdx: number): boolean => {
        if (triBaseIdx < 0 || protectedVertices === undefined) return false;
        const a = combinedIdxs[triBaseIdx];
        const b = combinedIdxs[triBaseIdx + 1];
        const c = combinedIdxs[triBaseIdx + 2];
        return protectedVertices.has(a) || protectedVertices.has(b) || protectedVertices.has(c);
      };

      if (triTouchesProtected(csTriRight) || triTouchesProtected(csTriLeft)) continue;

      bdChecked++;

      // Compute boundary dihedral for BOTH diagonal options
      // AD diagonal: tri0 = (vBL, vBR, vTR), tri1 = (vBL, vTR, vTL)
      // BC diagonal: tri0 = (vBL, vBR, vTL), tri1 = (vBR, vTR, vTL)
      let adScore = 0;
      let bcScore = 0;
      let edgeCount = 0;

      if (csTriRight >= 0) {
        const ca = combinedIdxs[csTriRight], cb = combinedIdxs[csTriRight + 1], cc = combinedIdxs[csTriRight + 2];
        const csNorm = bdNorm(ca, cb, cc);
        adScore += bdDotN(bdNorm(vBL, vBR, vTR), csNorm);
        bcScore += bdDotN(bdNorm(vBR, vTR, vTL), csNorm);
        edgeCount++;
      }
      if (csTriLeft >= 0) {
        const ca = combinedIdxs[csTriLeft], cb = combinedIdxs[csTriLeft + 1], cc = combinedIdxs[csTriLeft + 2];
        const csNorm = bdNorm(ca, cb, cc);
        adScore += bdDotN(bdNorm(vBL, vTR, vTL), csNorm);
        bcScore += bdDotN(bdNorm(vBL, vBR, vTL), csNorm);
        edgeCount++;
      }

      if (edgeCount === 0) continue;

      // Current diagonal from index buffer
      const curI0 = combinedIdxs[triBase], curI1 = combinedIdxs[triBase + 1], curI2 = combinedIdxs[triBase + 2];
      const curIsAD = (curI0 === vTR || curI1 === vTR || curI2 === vTR);
      const curScore = curIsAD ? adScore : bcScore;
      const altScore = curIsAD ? bcScore : adScore;

      // Only flip if alternative is meaningfully better
      if (altScore <= curScore + 0.001) continue;

      // Apply the flip
      if (curIsAD) {
        // Currently AD, switch to BC
        combinedIdxs[triBase + 0] = vBL;
        combinedIdxs[triBase + 1] = vBR;
        combinedIdxs[triBase + 2] = vTL;
        combinedIdxs[triBase + 3] = vBR;
        combinedIdxs[triBase + 4] = vTR;
        combinedIdxs[triBase + 5] = vTL;
      } else {
        // Currently BC, switch to AD
        combinedIdxs[triBase + 0] = vBL;
        combinedIdxs[triBase + 1] = vBR;
        combinedIdxs[triBase + 2] = vTR;
        combinedIdxs[triBase + 3] = vBL;
        combinedIdxs[triBase + 4] = vTR;
        combinedIdxs[triBase + 5] = vTL;
      }
      bdFlips++;
    }
  }

  return {
    flips: bdFlips,
    checked: bdChecked,
    timeMs: performance.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Boundary Diagnostic (v16.33 — read-only)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Boundary diagnostic: count boundary edges and compute dihedral stats
 * between chain-strip and standard grid triangles. Read-only; does not
 * modify any geometry.
 */
export function computeBoundaryDiagnostic(params: BoundaryDiagnosticParams): BoundaryDiagnosticResult {
  const { indices, positions, outerIdxCount, outerGridVertexCount, chainAdjacentVertices } = params;

  // Build edge→tri for outer wall
  const bndE2T = new Map<bigint, number[]>();
  for (let t = 0; t < outerIdxCount; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (a === b || b === c || a === c) continue;
    for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      let arr = bndE2T.get(ek);
      if (!arr) { arr = []; bndE2T.set(ek, arr); }
      arr.push(t);
    }
  }

  let bndEdgeCount = 0;
  let dihedralSum = 0, dihedralMin = 2, dihedralMax = -2;

  for (const [, tris] of bndE2T) {
    if (tris.length !== 2) continue;
    const [t0, t1] = tris;
    const a0 = indices[t0], b0 = indices[t0 + 1], c0 = indices[t0 + 2];
    const a1 = indices[t1], b1 = indices[t1 + 1], c1 = indices[t1 + 2];
    const isChainTri = (a: number, b: number, c: number): boolean =>
      a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount ||
      (chainAdjacentVertices !== undefined &&
        (chainAdjacentVertices.has(a) || chainAdjacentVertices.has(b) || chainAdjacentVertices.has(c)));
    const cs0 = isChainTri(a0, b0, c0);
    const cs1 = isChainTri(a1, b1, c1);
    if (cs0 === cs1) continue; // not a boundary edge

    bndEdgeCount++;

    // Compute dihedral (dot of triangle normals)
    const px = (v: number) => positions[v * 3];
    const py = (v: number) => positions[v * 3 + 1];
    const pz = (v: number) => positions[v * 3 + 2];
    const nx0 = (py(b0) - py(a0)) * (pz(c0) - pz(a0)) - (pz(b0) - pz(a0)) * (py(c0) - py(a0));
    const ny0 = (pz(b0) - pz(a0)) * (px(c0) - px(a0)) - (px(b0) - px(a0)) * (pz(c0) - pz(a0));
    const nz0 = (px(b0) - px(a0)) * (py(c0) - py(a0)) - (py(b0) - py(a0)) * (px(c0) - px(a0));
    const nx1 = (py(b1) - py(a1)) * (pz(c1) - pz(a1)) - (pz(b1) - pz(a1)) * (py(c1) - py(a1));
    const ny1 = (pz(b1) - pz(a1)) * (px(c1) - px(a1)) - (px(b1) - px(a1)) * (pz(c1) - pz(a1));
    const nz1 = (px(b1) - px(a1)) * (py(c1) - py(a1)) - (py(b1) - py(a1)) * (px(c1) - px(a1));
    const len0 = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0);
    const len1 = Math.sqrt(nx1 * nx1 + ny1 * ny1 + nz1 * nz1);
    if (len0 > 1e-10 && len1 > 1e-10) {
      const d = (nx0 * nx1 + ny0 * ny1 + nz0 * nz1) / (len0 * len1);
      dihedralSum += d;
      if (d < dihedralMin) dihedralMin = d;
      if (d > dihedralMax) dihedralMax = d;
    }
  }

  const dihedralAvg = bndEdgeCount > 0 ? dihedralSum / bndEdgeCount : 0;

  return { boundaryEdgeCount: bndEdgeCount, dihedralAvg, dihedralMin, dihedralMax };
}

// ═══════════════════════════════════════════════════════════════════════
// Mesh Quality Diagnostics (v16.31)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Mesh quality diagnostics (v16.31): count cross-row triangles, aspect
 * ratios, and low-valence vertices across the outer wall. Read-only.
 */
export function computeMeshDiagnostics(params: MeshDiagnosticParams): MeshDiagnosticResult {
  const {
    finalIndices, finalPositions, combinedVerts,
    outerIdxCountAfterSubdiv, origVertCount, maxSingleRowTSpan,
    numU, numT, gridVertexCount,
  } = params;

  let crossRow1 = 0, crossRow2 = 0, crossRow3plus = 0;
  let aspectOver5 = 0, aspectOver10 = 0, aspectOver20 = 0;
  let val3 = 0, val4 = 0, val5 = 0;

  // Rebuild valence for final mesh (outer wall only)
  const finalVal = new Map<number, number>();

  for (let t = 0; t < finalIndices.length; t += 3) {
    const a = finalIndices[t], b = finalIndices[t + 1], c = finalIndices[t + 2];
    if (a === b || b === c || a === c) continue;
    // Only count outer wall tris
    if (t >= outerIdxCountAfterSubdiv) continue;

    finalVal.set(a, (finalVal.get(a) || 0) + 1);
    finalVal.set(b, (finalVal.get(b) || 0) + 1);
    finalVal.set(c, (finalVal.get(c) || 0) + 1);

    // T-span check: use combinedVerts for grid+chain verts, NaN for subdiv verts
    const tOf = (v: number): number => {
      if (v < origVertCount) return combinedVerts[v * 3 + 1];
      return NaN; // subdivision vertex
    };
    const tA = tOf(a), tB = tOf(b), tC = tOf(c);
    const validTs: number[] = [];
    if (!isNaN(tA)) validTs.push(tA);
    if (!isNaN(tB)) validTs.push(tB);
    if (!isNaN(tC)) validTs.push(tC);
    if (validTs.length >= 2) {
      const tSpan = Math.max(...validTs) - Math.min(...validTs);
      const rowBands = tSpan / maxSingleRowTSpan;
      if (rowBands > 1.5 && rowBands <= 2.5) crossRow1++;
      else if (rowBands > 2.5 && rowBands <= 3.5) crossRow2++;
      else if (rowBands > 3.5) crossRow3plus++;
    }

    // Aspect ratio check (3D using Heron's formula variant)
    const px = (v: number) => finalPositions[v * 3];
    const py = (v: number) => finalPositions[v * 3 + 1];
    const pz = (v: number) => finalPositions[v * 3 + 2];
    const e1 = Math.sqrt((px(b) - px(a)) ** 2 + (py(b) - py(a)) ** 2 + (pz(b) - pz(a)) ** 2);
    const e2 = Math.sqrt((px(c) - px(b)) ** 2 + (py(c) - py(b)) ** 2 + (pz(c) - pz(b)) ** 2);
    const e3 = Math.sqrt((px(a) - px(c)) ** 2 + (py(a) - py(c)) ** 2 + (pz(a) - pz(c)) ** 2);
    const maxE = Math.max(e1, e2, e3);
    const s = (e1 + e2 + e3) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - e1) * (s - e2) * (s - e3)));
    const aspect = area > 1e-10 ? (maxE * maxE) / (4 * area * 1.7320508) : 999;
    if (aspect > 5) aspectOver5++;
    if (aspect > 10) aspectOver10++;
    if (aspect > 20) aspectOver20++;
  }

  let val3Boundary = 0, val3Interior = 0, val3Chain = 0;

  for (const [vertIdx, v] of finalVal) {
    if (v === 3) {
      val3++;
      if (vertIdx < gridVertexCount) {
        const row = Math.floor(vertIdx / numU);
        const col = vertIdx % numU;
        const isBoundary = row === 0 || row === numT - 1
                        || col === 0 || col === numU - 1;
        if (isBoundary) {
          val3Boundary++;
        } else {
          val3Interior++;
        }
      } else {
        val3Chain++;
      }
    } else if (v === 4) val4++;
    else if (v === 5) val5++;
  }

  return {
    crossRow1, crossRow2, crossRow3plus,
    aspectOver5, aspectOver10, aspectOver20,
    val3, val4, val5,
    val3Boundary, val3Interior, val3Chain,
  };
}

// ============================================================================
// Chain-strip-specific 3D quality report (B5)
// ============================================================================

/** Parameters for chain-strip-specific 3D quality analysis. */
export interface ChainStrip3DQualityParams {
    /** Combined index buffer. */
    indices: Uint32Array;
    /** GPU-evaluated 3D positions (x,y,z per vertex). */
    positions: Float32Array;
    /** Number of grid vertices (chain vertices start after this). */
    outerGridVertexCount: number;
    /** Upper bound for outer-wall index range. */
    outerIdxCount: number;
}

/** Result of chain-strip-specific 3D quality analysis. */
export interface ChainStrip3DQualityResult {
    /** Total chain-strip triangles analyzed. */
    triCount: number;
    /** Minimum angle across all chain-strip triangles (radians). */
    minAngle: number;
    /** Maximum aspect ratio across all chain-strip triangles. */
    maxAspect: number;
    /** Average aspect ratio. */
    avgAspect: number;
    /** Number of triangles with aspect ratio > 4:1 (R4 violations). */
    aspectOver4: number;
    /** Maximum area ratio between adjacent chain-strip triangles. */
    maxAreaRatio: number;
    /** Number of adjacent triangle pairs with area ratio > 2:1 (R3 violations). */
    gradingViolations: number;
}

/**
 * Compute 3D quality metrics specifically for chain-strip triangles.
 *
 * Chain-strip triangles are those containing at least one vertex with
 * index >= outerGridVertexCount (i.e. a chain or transition vertex).
 *
 * Also computes grading verification by measuring area ratios between
 * adjacent chain-strip triangles (those sharing an edge).
 */
export function computeChainStrip3DQuality(params: ChainStrip3DQualityParams): ChainStrip3DQualityResult {
    const { indices, positions, outerGridVertexCount, outerIdxCount } = params;

    let minAngle = Math.PI;
    let maxAspect = 0;
    let aspectSum = 0;
    let aspectOver4 = 0;
    let triCount = 0;

    // Collect chain-strip triangle indices and their areas for grading check
    const csTriIndices: number[] = []; // triangle start offsets in index buffer
    const csTriAreas: number[] = [];

    // Edge → triangle index mapping for adjacency detection
    const edgeToTri = new Map<bigint, number[]>();

    for (let t = 0; t < outerIdxCount; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) continue;

        // Is this a chain-strip triangle? At least one vertex is a chain vertex
        const isChainStrip = a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount;
        if (!isChainStrip) continue;

        // 3D quality metrics
        const angle = minAngle3D(positions, a, b, c);
        const aspect = triAspect3D(positions, a, b, c);

        if (angle < minAngle) minAngle = angle;
        if (aspect > maxAspect) maxAspect = aspect;
        aspectSum += aspect;
        if (aspect > 4) aspectOver4++;

        // Compute area for grading check
        const p0 = pos3(positions, a), p1 = pos3(positions, b), p2 = pos3(positions, c);
        const n = cross3(
            p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2],
            p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2],
        );
        const area = len3(n) * 0.5;

        const triIdx = csTriIndices.length;
        csTriIndices.push(t);
        csTriAreas.push(area);

        // Register edges for adjacency
        for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(a, c)]) {
            const arr = edgeToTri.get(ek);
            if (arr) arr.push(triIdx);
            else edgeToTri.set(ek, [triIdx]);
        }

        triCount++;
    }

    // Grading check: find max area ratio between adjacent chain-strip triangles
    let maxAreaRatio = 1.0;
    let gradingViolations = 0;
    const checkedPairs = new Set<bigint>();

    for (const triList of edgeToTri.values()) {
        if (triList.length < 2) continue;
        for (let i = 0; i < triList.length; i++) {
            for (let j = i + 1; j < triList.length; j++) {
                const pairKey = BigInt(Math.min(triList[i], triList[j])) * BigInt(1e9) + BigInt(Math.max(triList[i], triList[j]));
                if (checkedPairs.has(pairKey)) continue;
                checkedPairs.add(pairKey);

                const a1 = csTriAreas[triList[i]];
                const a2 = csTriAreas[triList[j]];
                if (a1 < 1e-15 || a2 < 1e-15) continue;
                const ratio = Math.max(a1, a2) / Math.min(a1, a2);
                if (ratio > maxAreaRatio) maxAreaRatio = ratio;
                if (ratio > 2.0) gradingViolations++;
            }
        }
    }

    return {
        triCount,
        minAngle: triCount > 0 ? minAngle : 0,
        maxAspect: triCount > 0 ? maxAspect : 0,
        avgAspect: triCount > 0 ? aspectSum / triCount : 0,
        aspectOver4,
        maxAreaRatio,
        gradingViolations,
    };
}

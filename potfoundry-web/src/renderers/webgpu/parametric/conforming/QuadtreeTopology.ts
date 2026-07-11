/**
 * Immutable structural topology derived from an ordered quadtree leaf array.
 *
 * The CSR edge slices reproduce QuadtreeTriangulator's historical QSCALE
 * quantisation, periodic-u unwrapping, strict one-unit endpoint exclusion, and
 * ascending sort. Feature-specific edge insertions are intentionally excluded.
 */

import type { QuadLeaf } from './PeriodicBalancedQuadtree';
import { makeQuadtreeCellKeyCodec, MAX_U_EXTRA_FOR_CODEC } from './QuadtreeCellKeyCodec';

/** South, east, north, west side order used by masks and CSR slices. */
export const QUAD_SIDE = { SOUTH: 0, EAST: 1, NORTH: 2, WEST: 3 } as const;

/** Bit corresponding to a side in {@link QUAD_SIDE}. */
export const quadSideBit = (side: number): number => 1 << side;

const QSCALE = 1 << 24;
const QEPS = 1;
const SIDE_COUNT = 4;

/** Finalized, immutable structural topology for an ordered leaf array. */
export interface QuadtreeTopology {
  /** Four-bit finer-neighbour mask per leaf (S/E/N/W). */
  readonly splitMasks: Uint8Array;
  /** CSR offsets for leaf-major, S/E/N/W edge slices. */
  readonly edgePointOffsets: Uint32Array;
  /** Ascending structural subdivision coordinate for each CSR entry. */
  readonly edgePoints: Float64Array;
  /** CSR offsets for leaf-major, S/E/N/W adjacent-leaf slices. */
  readonly sideNeighbourOffsets?: Uint32Array;
  /** Leaf indices in original leaf order within each side slice. */
  readonly sideNeighbourIndices?: Uint32Array;
}

/** Optional retained topology products. */
export interface QuadtreeTopologyOptions {
  /** Retain adjacency CSR; false avoids approximately 32N bytes in production. */
  includeAdjacency?: boolean;
}

/** Build byte-compatible structural edge topology for finalized leaves. */
export function buildQuadtreeTopology(
  leaves: readonly QuadLeaf[],
  uBias: number,
  options: QuadtreeTopologyOptions = {},
): QuadtreeTopology {
  const eULof = (leaf: QuadLeaf): number => leaf.level + uBias + (leaf.uExtra ?? 0);
  const uMod = (eUL: number): number => 1 << eUL;
  const iuOf = (leaf: QuadLeaf): number => leaf.iu ?? Math.round(leaf.u0 * uMod(eULof(leaf)));
  const itOf = (leaf: QuadLeaf): number => leaf.it ?? Math.round(leaf.t0 * (1 << leaf.level));

  let maxLevel = 0;
  let maxEUL = 0;
  for (const leaf of leaves) {
    maxLevel = Math.max(maxLevel, leaf.level);
    maxEUL = Math.max(maxEUL, eULof(leaf));
  }
  const codec = makeQuadtreeCellKeyCodec(maxLevel, uBias);
  const cells = new Set<number>();
  for (const leaf of leaves) {
    cells.add(codec.packCell(leaf.level, itOf(leaf), leaf.uExtra ?? 0, iuOf(leaf)));
  }
  const has = (level: number, iu: number, it: number, eUL: number): boolean => {
    const uExtra = eUL - uBias - level;
    if (uExtra < 0 || uExtra > MAX_U_EXTRA_FOR_CODEC) return false;
    const span = uMod(eUL);
    const wrappedU = ((iu % span) + span) % span;
    return cells.has(codec.packCell(level, it, uExtra, wrappedU));
  };
  const uColHasFiner = (eUL: number, col: number, level: number, it: number): boolean => {
    for (let candidateLevel = level; candidateLevel <= maxLevel; candidateLevel++) {
      const uExtra = eUL - uBias - candidateLevel;
      if (uExtra < 0 || uExtra > MAX_U_EXTRA_FOR_CODEC) continue;
      const tMultiplier = 1 << (candidateLevel - level);
      const tBase = it * tMultiplier;
      for (let offset = 0; offset < tMultiplier; offset++) {
        if (has(candidateLevel, col, tBase + offset, eUL)) return true;
      }
    }
    return false;
  };
  const sideHasFiner = (leaf: QuadLeaf, side: number): boolean => {
    const level = leaf.level;
    const eUL = eULof(leaf);
    const iu = iuOf(leaf);
    const it = itOf(leaf);
    if (side === QUAD_SIDE.EAST) {
      return eUL < maxEUL && uColHasFiner(eUL + 1, (iu + 1) * 2, level, it);
    }
    if (side === QUAD_SIDE.WEST) {
      return eUL < maxEUL && uColHasFiner(eUL + 1, iu * 2 - 1, level, it);
    }
    if (level >= maxLevel) return false;
    const finerLevel = level + 1;
    const finerEUL = finerLevel + uBias;
    if (side === QUAD_SIDE.NORTH) {
      if (it + 1 >= 1 << level) return false;
      const row = (it + 1) * 2;
      return has(finerLevel, iu * 2, row, finerEUL) || has(finerLevel, iu * 2 + 1, row, finerEUL);
    }
    if (it === 0) return false;
    const row = it * 2 - 1;
    return has(finerLevel, iu * 2, row, finerEUL) || has(finerLevel, iu * 2 + 1, row, finerEUL);
  };

  const tKey = (t: number): number => Math.round(t * QSCALE);
  const uKey = (u: number): number => Math.round((((u % 1) + 1) % 1) * QSCALE);
  const horizontal = new Map<number, Set<number>>();
  const vertical = new Map<number, Set<number>>();
  interface EdgeRecord { leafIndex: number; side: number; loQ: number; hiQ: number }
  const horizontalEdges = new Map<number, EdgeRecord[]>();
  const verticalEdges = new Map<number, EdgeRecord[]>();
  const add = (registry: Map<number, Set<number>>, key: number, value: number): void => {
    let values = registry.get(key);
    if (!values) {
      values = new Set<number>();
      registry.set(key, values);
    }
    values.add(value);
  };
  const addEdge = (registry: Map<number, EdgeRecord[]>, key: number, edge: EdgeRecord): void => {
    let edges = registry.get(key);
    if (!edges) {
      edges = [];
      registry.set(key, edges);
    }
    edges.push(edge);
  };
  for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
    const leaf = leaves[leafIndex];
    const sizeU = 1 / uMod(eULof(leaf));
    const sizeT = 1 / (1 << leaf.level);
    const u0 = leaf.u0;
    const t0 = leaf.t0;
    const u1 = u0 + sizeU;
    const t1 = t0 + sizeT;
    add(horizontal, tKey(t0), uKey(u0));
    add(horizontal, tKey(t0), uKey(u1));
    add(horizontal, tKey(t1), uKey(u0));
    add(horizontal, tKey(t1), uKey(u1));
    add(vertical, uKey(u0), tKey(t0));
    add(vertical, uKey(u0), tKey(t1));
    add(vertical, uKey(u1), tKey(t0));
    add(vertical, uKey(u1), tKey(t1));
    if (options.includeAdjacency) {
      const u0Q = Math.round(u0 * QSCALE);
      const u1Q = Math.round(u1 * QSCALE);
      const t0Q = Math.round(t0 * QSCALE);
      const t1Q = Math.round(t1 * QSCALE);
      addEdge(horizontalEdges, tKey(t0), { leafIndex, side: QUAD_SIDE.SOUTH, loQ: u0Q, hiQ: u1Q });
      addEdge(horizontalEdges, tKey(t1), { leafIndex, side: QUAD_SIDE.NORTH, loQ: u0Q, hiQ: u1Q });
      addEdge(verticalEdges, uKey(u0), { leafIndex, side: QUAD_SIDE.WEST, loQ: t0Q, hiQ: t1Q });
      addEdge(verticalEdges, uKey(u1), { leafIndex, side: QUAD_SIDE.EAST, loQ: t0Q, hiQ: t1Q });
    }
  }
  const sortedLines = (registry: Map<number, Set<number>>): Map<number, number[]> => {
    const out = new Map<number, number[]>();
    for (const [key, values] of registry) out.set(key, Array.from(values).sort((a, b) => a - b));
    return out;
  };
  const horizontalSorted = sortedLines(horizontal);
  const verticalSorted = sortedLines(vertical);
  horizontal.clear();
  vertical.clear();
  const lowerBound = (values: readonly number[], target: number): number => {
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const upperBound = (values: readonly number[], target: number): number => {
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const readSorted = (values: readonly number[] | undefined, lo: number, hi: number): number[] => {
    if (!values) return [];
    const loQ = Math.round(lo * QSCALE);
    const hiQ = Math.round(hi * QSCALE);
    const start = upperBound(values, loQ + QEPS);
    const end = lowerBound(values, hiQ - QEPS);
    const out = new Array<number>(Math.max(0, end - start));
    for (let index = start; index < end; index++) out[index - start] = values[index] / QSCALE;
    return out;
  };
  const readH = (key: number, lo: number, hi: number): number[] =>
    readSorted(horizontalSorted.get(key), lo, hi);
  const readV = (key: number, lo: number, hi: number): number[] =>
    readSorted(verticalSorted.get(key), lo, hi);

  interface OppositeEdges { first: EdgeRecord[]; second: EdgeRecord[] }
  const oppositeEdges: OppositeEdges[] = [];
  if (options.includeAdjacency) {
    const collectPairs = (
      registry: Map<number, EdgeRecord[]>,
      firstSide: number,
      secondSide: number,
    ): void => {
      const byInterval = (a: EdgeRecord, b: EdgeRecord): number =>
        a.loQ - b.loQ || a.hiQ - b.hiQ || a.leafIndex - b.leafIndex;
      for (const edges of registry.values()) {
        const first = edges.filter((edge) => edge.side === firstSide).sort(byInterval);
        const second = edges.filter((edge) => edge.side === secondSide).sort(byInterval);
        if (first.length > 0 && second.length > 0) oppositeEdges.push({ first, second });
      }
    };
    collectPairs(horizontalEdges, QUAD_SIDE.SOUTH, QUAD_SIDE.NORTH);
    collectPairs(verticalEdges, QUAD_SIDE.WEST, QUAD_SIDE.EAST);
    horizontalEdges.clear();
    verticalEdges.clear();
  }
  const sweepOppositeEdges = (emit: (a: EdgeRecord, b: EdgeRecord) => void): void => {
    for (const { first, second } of oppositeEdges) {
      let firstIndex = 0;
      let secondIndex = 0;
      while (firstIndex < first.length && secondIndex < second.length) {
        const a = first[firstIndex];
        const b = second[secondIndex];
        if (Math.min(a.hiQ, b.hiQ) - Math.max(a.loQ, b.loQ) > QEPS) emit(a, b);
        if (a.hiQ <= b.hiQ) firstIndex++;
        if (b.hiQ <= a.hiQ) secondIndex++;
      }
    }
  };

  let sideNeighbourOffsets: Uint32Array | undefined;
  let sideNeighbourIndices: Uint32Array | undefined;
  if (options.includeAdjacency) {
    const counts = new Uint32Array(leaves.length * SIDE_COUNT);
    sweepOppositeEdges((a, b) => {
      counts[a.leafIndex * SIDE_COUNT + a.side]++;
      counts[b.leafIndex * SIDE_COUNT + b.side]++;
    });
    sideNeighbourOffsets = new Uint32Array(counts.length + 1);
    for (let slot = 0; slot < counts.length; slot++) {
      sideNeighbourOffsets[slot + 1] = sideNeighbourOffsets[slot] + counts[slot];
    }
    sideNeighbourIndices = new Uint32Array(sideNeighbourOffsets[counts.length]);
    const cursors = sideNeighbourOffsets.slice(0, counts.length);
    sweepOppositeEdges((a, b) => {
      sideNeighbourIndices![cursors[a.leafIndex * SIDE_COUNT + a.side]++] = b.leafIndex;
      sideNeighbourIndices![cursors[b.leafIndex * SIDE_COUNT + b.side]++] = a.leafIndex;
    });
    // The sweep is interval-ordered. Restore the historical leaf-index order in
    // each tiny side slice without allocating one array per leaf.
    for (let slot = 0; slot < counts.length; slot++) {
      const start = sideNeighbourOffsets[slot];
      const end = sideNeighbourOffsets[slot + 1];
      for (let index = start + 1; index < end; index++) {
        const value = sideNeighbourIndices[index];
        let cursor = index;
        while (cursor > start && sideNeighbourIndices[cursor - 1] > value) {
          sideNeighbourIndices[cursor] = sideNeighbourIndices[cursor - 1];
          cursor--;
        }
        sideNeighbourIndices[cursor] = value;
      }
    }
  }

  const splitMasks = new Uint8Array(leaves.length);
  const edgePointOffsets = new Uint32Array(leaves.length * SIDE_COUNT + 1);
  const edgePoints: number[] = [];
  for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
    const leaf = leaves[leafIndex];
    const sizeU = 1 / uMod(eULof(leaf));
    const sizeT = 1 / (1 << leaf.level);
    const u0 = leaf.u0;
    const t0 = leaf.t0;
    const u1 = u0 + sizeU;
    const t1 = t0 + sizeT;
    let mask = 0;
    for (let side = 0; side < SIDE_COUNT; side++) {
      if (sideHasFiner(leaf, side)) mask |= quadSideBit(side);
      edgePointOffsets[leafIndex * SIDE_COUNT + side] = edgePoints.length;
      const points = side === QUAD_SIDE.SOUTH || side === QUAD_SIDE.NORTH
        ? readH(tKey(side === QUAD_SIDE.SOUTH ? t0 : t1), u0, u1)
        : readV(uKey(side === QUAD_SIDE.EAST ? u1 : u0), t0, t1);
      edgePoints.push(...points);
    }
    splitMasks[leafIndex] = mask;
  }
  edgePointOffsets[leaves.length * SIDE_COUNT] = edgePoints.length;
  return {
    splitMasks,
    edgePointOffsets,
    edgePoints: Float64Array.from(edgePoints),
    sideNeighbourOffsets,
    sideNeighbourIndices,
  };
}

/** Return one leaf/side CSR slice without allocation. */
export function topologyEdgePoints(
  topology: QuadtreeTopology,
  leafIndex: number,
  side: number,
): Float64Array {
  const slot = leafIndex * SIDE_COUNT + side;
  return topology.edgePoints.subarray(topology.edgePointOffsets[slot], topology.edgePointOffsets[slot + 1]);
}

/** Return one leaf/side adjacency CSR slice without allocation. */
export function topologySideNeighbours(
  topology: QuadtreeTopology,
  leafIndex: number,
  side: number,
): Uint32Array {
  const offsets = topology.sideNeighbourOffsets;
  const indices = topology.sideNeighbourIndices;
  if (!offsets || !indices) {
    throw new Error('QuadtreeTopology adjacency was not retained; pass includeAdjacency: true');
  }
  const slot = leafIndex * SIDE_COUNT + side;
  return indices.subarray(offsets[slot], offsets[slot + 1]);
}

/** Visit structural edge points in leaf-major S/E/N/W CSR order. */
export function forEachTopologyEdgePoint(
  topology: QuadtreeTopology,
  visit: (leafIndex: number, side: number, coordinate: number) => void,
): void {
  const leafCount = topology.splitMasks.length;
  for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
    for (let side = 0; side < SIDE_COUNT; side++) {
      const slot = leafIndex * SIDE_COUNT + side;
      const end = topology.edgePointOffsets[slot + 1];
      for (let pointIndex = topology.edgePointOffsets[slot]; pointIndex < end; pointIndex++) {
        visit(leafIndex, side, topology.edgePoints[pointIndex]);
      }
    }
  }
}

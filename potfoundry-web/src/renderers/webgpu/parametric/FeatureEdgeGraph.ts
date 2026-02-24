/**
 * FeatureEdgeGraph — Constrained feature-edge graph for ridge/crease preservation.
 *
 * Builds a graph of mesh edges that lie on feature chains (ridges, valleys, creases).
 * These edges are marked as immutable constraints that downstream stages
 * (optimizer, subdivision, refinement) must preserve.
 *
 * Works with v20.0's "snap to grid" strategy: after UV-snapping, chain points
 * map to specific grid vertex indices. Consecutive chain points in adjacent rows
 * define feature edges through the grid topology.
 *
 * @see docs/plans/2026-02-24-parametric-pipeline-modular-redesign.md Phase 2 Gap B
 */

import type { FeatureChain, FeatureKind, ChainPoint } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * A single constrained edge in the feature graph.
 */
export interface FeatureEdge {
    /** First vertex index (smaller index first for canonical ordering). */
    v0: number;
    /** Second vertex index (larger index first for canonical ordering). */
    v1: number;
    /** Index of the chain this edge belongs to. */
    chainId: number;
    /** Feature classification (peak ridge or valley). */
    kind: FeatureKind;
}

/**
 * The complete feature-edge graph for a tessellated mesh.
 *
 * Provides O(1) edge lookups and per-chain traversal.
 */
export interface FeatureEdgeGraph {
    /** All feature edges in canonical order. */
    edges: FeatureEdge[];
    /** O(1) lookup: canonical edge key "v0-v1" → true. */
    edgeSet: ReadonlySet<string>;
    /** Chain id → list of edges in that chain. */
    edgesByChain: ReadonlyMap<number, FeatureEdge[]>;
    /** Chain id → feature kind. */
    chainKinds: ReadonlyMap<number, FeatureKind>;
    /** Total number of feature chains represented. */
    chainCount: number;
    /** Total number of constrained edges. */
    edgeCount: number;
}

/**
 * Mapping from chain points to grid vertex indices.
 *
 * Produced by the tessellator after UV-snapping. Each entry maps
 * (chainId, pointIndex) → global vertex index in the mesh.
 */
export interface ChainVertexMapping {
    /** chainId → array of vertex indices (parallel to chain.points). */
    chainToVertices: Map<number, number[]>;
}

// ============================================================================
// Edge Key Utilities
// ============================================================================

/**
 * Create a canonical edge key string for O(1) set lookups.
 * Always orders v0 < v1 to ensure consistent hashing.
 *
 * @param a - First vertex index.
 * @param b - Second vertex index.
 * @returns Canonical edge key "min-max".
 */
export function edgeKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Build a feature-edge graph from chains and their vertex mappings.
 *
 * For each chain, consecutive points that map to valid vertex indices
 * produce a constrained feature edge. Edges that cross the seam
 * (u-distance > 0.4) are excluded to match the tessellator's behavior.
 *
 * @param chains - Feature chains with points in (u, row) space.
 * @param mapping - Chain-to-vertex index mapping from the tessellator.
 * @returns The complete feature-edge graph.
 */
export function buildFeatureEdgeGraph(
    chains: FeatureChain[],
    mapping: ChainVertexMapping,
): FeatureEdgeGraph {
    const edges: FeatureEdge[] = [];
    const edgeSet = new Set<string>();
    const edgesByChain = new Map<number, FeatureEdge[]>();
    const chainKinds = new Map<number, FeatureKind>();

    for (let chainId = 0; chainId < chains.length; chainId++) {
        const chain = chains[chainId];
        const kind: FeatureKind = chain.kind ?? 'peak';
        chainKinds.set(chainId, kind);
        const chainEdges: FeatureEdge[] = [];

        const vertexIndices = mapping.chainToVertices.get(chainId);
        if (!vertexIndices || vertexIndices.length < 2) continue;

        for (let i = 0; i < vertexIndices.length - 1; i++) {
            const vA = vertexIndices[i];
            const vB = vertexIndices[i + 1];

            // Skip invalid indices
            if (vA < 0 || vB < 0) continue;
            // Skip degenerate edges
            if (vA === vB) continue;

            const key = edgeKey(vA, vB);
            // Prevent duplicate edges (e.g., from overlapping chains)
            if (edgeSet.has(key)) continue;

            const edge: FeatureEdge = {
                v0: Math.min(vA, vB),
                v1: Math.max(vA, vB),
                chainId,
                kind,
            };
            edges.push(edge);
            chainEdges.push(edge);
            edgeSet.add(key);
        }

        edgesByChain.set(chainId, chainEdges);
    }

    return {
        edges,
        edgeSet,
        edgesByChain,
        chainKinds,
        chainCount: chains.length,
        edgeCount: edges.length,
    };
}

/**
 * Build a feature-edge graph from chains using UV-snap vertex resolution.
 *
 * This is the v20.0-compatible path: instead of dedicated chain vertices,
 * each chain point's U is snapped to the nearest grid column, and the
 * corresponding grid vertex index is computed from (row, col) in the grid.
 *
 * @param chains - Feature chains with points in (u, row) space.
 * @param unionU - Sorted array of grid U positions.
 * @param numU - Number of U columns in the grid.
 * @param numT - Number of T rows in the grid.
 * @param rowMapping - Maps original row indices to final grid row indices.
 *                     If undefined, row indices are used directly.
 * @returns The complete feature-edge graph.
 */
export function buildFeatureEdgeGraphFromGrid(
    chains: FeatureChain[],
    unionU: Float32Array,
    numU: number,
    numT: number,
    rowMapping?: Map<number, number> | number[],
): FeatureEdgeGraph {
    const SEAM_THRESHOLD = 0.4;

    // Build mapping by snapping chain points to nearest grid columns
    const mapping: ChainVertexMapping = {
        chainToVertices: new Map(),
    };

    for (let chainId = 0; chainId < chains.length; chainId++) {
        const chain = chains[chainId];
        const vertexIndices: number[] = [];

        for (const point of chain.points) {
            // Resolve row to final grid row
            let finalRow = point.row;
            if (rowMapping) {
                if (rowMapping instanceof Map) {
                    finalRow = rowMapping.get(point.row) ?? -1;
                } else {
                    finalRow = point.row < rowMapping.length ? rowMapping[point.row] : -1;
                }
            }

            if (finalRow < 0 || finalRow >= numT) {
                vertexIndices.push(-1);
                continue;
            }

            // Find nearest grid column via binary search
            const col = findNearestColumn(unionU, point.u, numU);
            if (col < 0) {
                vertexIndices.push(-1);
                continue;
            }

            // Grid vertex index = row * numU + col
            const vertexIdx = finalRow * numU + col;
            vertexIndices.push(vertexIdx);
        }

        mapping.chainToVertices.set(chainId, vertexIndices);
    }

    // Filter out seam-crossing edges
    const graph = buildFeatureEdgeGraph(chains, mapping);

    // Post-filter: remove edges where chain points cross seam
    const filteredEdges: FeatureEdge[] = [];
    const filteredEdgeSet = new Set<string>();
    const filteredEdgesByChain = new Map<number, FeatureEdge[]>();

    for (const edge of graph.edges) {
        const chain = chains[edge.chainId];
        // Find the point indices for this edge
        const chainVerts = mapping.chainToVertices.get(edge.chainId);
        if (!chainVerts) continue;

        let seamCrossing = false;
        for (let i = 0; i < chainVerts.length - 1; i++) {
            const vA = Math.min(chainVerts[i], chainVerts[i + 1]);
            const vB = Math.max(chainVerts[i], chainVerts[i + 1]);
            if (vA === edge.v0 && vB === edge.v1) {
                // Check if the underlying U values cross the seam
                const uA = chain.points[i].u;
                const uB = chain.points[i + 1].u;
                let du = Math.abs(uA - uB);
                if (du > 0.5) du = 1 - du;
                if (du > SEAM_THRESHOLD) {
                    seamCrossing = true;
                }
                break;
            }
        }

        if (!seamCrossing) {
            filteredEdges.push(edge);
            filteredEdgeSet.add(edgeKey(edge.v0, edge.v1));
            const chainEdges = filteredEdgesByChain.get(edge.chainId) ?? [];
            chainEdges.push(edge);
            filteredEdgesByChain.set(edge.chainId, chainEdges);
        }
    }

    return {
        edges: filteredEdges,
        edgeSet: filteredEdgeSet,
        edgesByChain: filteredEdgesByChain,
        chainKinds: graph.chainKinds,
        chainCount: graph.chainCount,
        edgeCount: filteredEdges.length,
    };
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Check whether a mesh edge is a constrained feature edge.
 * O(1) lookup via the edge set.
 *
 * @param graph - The feature-edge graph.
 * @param v0 - First vertex index.
 * @param v1 - Second vertex index.
 * @returns True if this edge is a feature constraint.
 */
export function isFeatureEdge(graph: FeatureEdgeGraph, v0: number, v1: number): boolean {
    return graph.edgeSet.has(edgeKey(v0, v1));
}

/**
 * Get the feature kind for a specific edge, if it is a feature edge.
 *
 * @param graph - The feature-edge graph.
 * @param v0 - First vertex index.
 * @param v1 - Second vertex index.
 * @returns The FeatureKind if this is a feature edge, undefined otherwise.
 */
export function getEdgeKind(graph: FeatureEdgeGraph, v0: number, v1: number): FeatureKind | undefined {
    const key = edgeKey(v0, v1);
    if (!graph.edgeSet.has(key)) return undefined;
    const edge = graph.edges.find(e => edgeKey(e.v0, e.v1) === key);
    return edge?.kind;
}

/**
 * Get all constrained edges for a specific chain.
 *
 * @param graph - The feature-edge graph.
 * @param chainId - Chain index.
 * @returns Array of feature edges, or empty array if chain not found.
 */
export function getChainEdges(graph: FeatureEdgeGraph, chainId: number): FeatureEdge[] {
    return graph.edgesByChain.get(chainId) ?? [];
}

/**
 * Convert the feature-edge graph to a set of locked quad indices.
 *
 * This bridges the new edge-level constraints to the existing quad-level
 * locking used by MeshOptimizer. Each quad containing a feature edge is locked.
 *
 * @param graph - The feature-edge graph.
 * @param numU - Number of U columns in the grid.
 * @param bandHalfWidth - Number of columns on each side to also lock (default: 1).
 * @returns Set of locked quad indices.
 */
export function featureEdgesToLockedQuads(
    graph: FeatureEdgeGraph,
    numU: number,
    bandHalfWidth: number = 1,
): Set<number> {
    const locked = new Set<number>();

    for (const edge of graph.edges) {
        // Convert vertex indices to (row, col)
        const row0 = Math.floor(edge.v0 / numU);
        const col0 = edge.v0 % numU;
        const row1 = Math.floor(edge.v1 / numU);
        const col1 = edge.v1 % numU;

        // Lock quads around both endpoints
        const minRow = Math.min(row0, row1);
        const maxCol = Math.max(col0, col1);
        const minCol = Math.min(col0, col1);

        for (let dc = -bandHalfWidth; dc <= bandHalfWidth; dc++) {
            const c0 = (minCol + dc + numU) % numU;
            const c1 = (maxCol + dc + numU) % numU;
            // Quad index = row * (numU) + col (for the upper-left corner)
            if (minRow > 0) {
                locked.add((minRow - 1) * numU + c0);
                locked.add((minRow - 1) * numU + c1);
            }
            locked.add(minRow * numU + c0);
            locked.add(minRow * numU + c1);
        }
    }

    return locked;
}

/**
 * Check whether a proposed edge flip would destroy a constrained feature edge.
 *
 * During Delaunay-like optimization, before flipping a quad diagonal,
 * check that neither diagonal candidate is a feature edge.
 *
 * @param graph - The feature-edge graph.
 * @param diag0 - Current diagonal vertex pair [a, b].
 * @param diag1 - Proposed new diagonal vertex pair [c, d].
 * @returns True if the flip would remove a constrained edge (should be blocked).
 */
export function wouldFlipDestroyConstraint(
    graph: FeatureEdgeGraph,
    diag0: [number, number],
    diag1: [number, number],
): boolean {
    // If current diagonal is a feature edge, it must not be flipped away
    return isFeatureEdge(graph, diag0[0], diag0[1]);
}

// ============================================================================
// Merge & Update
// ============================================================================

/**
 * Create an empty feature-edge graph.
 */
export function emptyFeatureEdgeGraph(): FeatureEdgeGraph {
    return {
        edges: [],
        edgeSet: new Set(),
        edgesByChain: new Map(),
        chainKinds: new Map(),
        chainCount: 0,
        edgeCount: 0,
    };
}

/**
 * Merge two feature-edge graphs (e.g., from different surfaces).
 *
 * @param a - First graph.
 * @param b - Second graph (chain IDs are offset by a.chainCount).
 * @returns Merged graph with all edges from both inputs.
 */
export function mergeGraphs(a: FeatureEdgeGraph, b: FeatureEdgeGraph): FeatureEdgeGraph {
    const edges = [...a.edges];
    const edgeSet = new Set(a.edgeSet);
    const edgesByChain = new Map(a.edgesByChain);
    const chainKinds = new Map(a.chainKinds);

    const chainOffset = a.chainCount;

    for (const edge of b.edges) {
        const offsetEdge: FeatureEdge = {
            ...edge,
            chainId: edge.chainId + chainOffset,
        };
        const key = edgeKey(offsetEdge.v0, offsetEdge.v1);
        if (!edgeSet.has(key)) {
            edges.push(offsetEdge);
            edgeSet.add(key);
        }
    }

    for (const [chainId, chainEdges] of b.edgesByChain) {
        const offsetId = chainId + chainOffset;
        edgesByChain.set(
            offsetId,
            chainEdges.map(e => ({ ...e, chainId: offsetId })),
        );
    }

    for (const [chainId, kind] of b.chainKinds) {
        chainKinds.set(chainId + chainOffset, kind);
    }

    return {
        edges,
        edgeSet,
        edgesByChain,
        chainKinds,
        chainCount: a.chainCount + b.chainCount,
        edgeCount: edges.length,
    };
}

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Find the nearest grid column index for a given U position.
 *
 * @param unionU - Sorted array of grid U positions.
 * @param targetU - Target U position to snap to.
 * @param numU - Number of U columns.
 * @returns Nearest column index, or -1 if grid is empty.
 */
function findNearestColumn(unionU: Float32Array, targetU: number, numU: number): number {
    if (numU === 0) return -1;

    // Binary search for nearest
    let lo = 0;
    let hi = numU - 1;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (unionU[mid] < targetU) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    // Check both lo and lo-1 for nearest
    if (lo > 0) {
        const dLo = Math.abs(unionU[lo] - targetU);
        const dPrev = Math.abs(unionU[lo - 1] - targetU);
        if (dPrev < dLo) return lo - 1;
    }

    return lo;
}

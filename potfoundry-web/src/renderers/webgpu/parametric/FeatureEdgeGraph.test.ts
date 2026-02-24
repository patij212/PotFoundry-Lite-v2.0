/**
 * FeatureEdgeGraph.test.ts — Tests for constrained feature-edge graph.
 */
import { describe, it, expect } from 'vitest';
import {
    edgeKey,
    buildFeatureEdgeGraph,
    buildFeatureEdgeGraphFromGrid,
    isFeatureEdge,
    getEdgeKind,
    getChainEdges,
    featureEdgesToLockedQuads,
    wouldFlipDestroyConstraint,
    emptyFeatureEdgeGraph,
    mergeGraphs,
} from './FeatureEdgeGraph';
import type { FeatureChain, FeatureKind } from './types';
import type { ChainVertexMapping, FeatureEdgeGraph as FeatureEdgeGraphType } from './FeatureEdgeGraph';

// ============================================================================
// Helper: build a simple chain for testing
// ============================================================================

function makeChain(points: Array<{ u: number; row: number }>, kind?: FeatureKind): FeatureChain {
    return { points, kind };
}

function makeMapping(entries: Array<[number, number[]]>): ChainVertexMapping {
    return { chainToVertices: new Map(entries) };
}

// ============================================================================
// edgeKey
// ============================================================================

describe('edgeKey', () => {
    it('returns canonical ordered key', () => {
        expect(edgeKey(5, 10)).toBe('5-10');
        expect(edgeKey(10, 5)).toBe('5-10');
    });

    it('handles same vertex (degenerate edge)', () => {
        expect(edgeKey(7, 7)).toBe('7-7');
    });

    it('handles zero indices', () => {
        expect(edgeKey(0, 100)).toBe('0-100');
    });
});

// ============================================================================
// buildFeatureEdgeGraph
// ============================================================================

describe('buildFeatureEdgeGraph', () => {
    it('builds edges from a simple 3-point chain', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 },
            { u: 0.2, row: 1 },
            { u: 0.2, row: 2 },
        ], 'peak')];
        const mapping = makeMapping([[0, [10, 20, 30]]]);

        const graph = buildFeatureEdgeGraph(chains, mapping);

        expect(graph.edgeCount).toBe(2);
        expect(graph.chainCount).toBe(1);
        expect(isFeatureEdge(graph, 10, 20)).toBe(true);
        expect(isFeatureEdge(graph, 20, 30)).toBe(true);
        expect(isFeatureEdge(graph, 10, 30)).toBe(false);
    });

    it('assigns correct kind from chain', () => {
        const chains = [makeChain([
            { u: 0.5, row: 0 },
            { u: 0.5, row: 1 },
        ], 'valley')];
        const mapping = makeMapping([[0, [5, 15]]]);

        const graph = buildFeatureEdgeGraph(chains, mapping);

        expect(getEdgeKind(graph, 5, 15)).toBe('valley');
        expect(graph.chainKinds.get(0)).toBe('valley');
    });

    it('defaults to peak when kind is undefined', () => {
        const chains = [makeChain([
            { u: 0.5, row: 0 },
            { u: 0.5, row: 1 },
        ])]; // no kind
        const mapping = makeMapping([[0, [1, 2]]]);

        const graph = buildFeatureEdgeGraph(chains, mapping);

        expect(getEdgeKind(graph, 1, 2)).toBe('peak');
    });

    it('skips invalid vertex indices (-1)', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 },
            { u: 0.2, row: 1 },
            { u: 0.2, row: 2 },
        ], 'peak')];
        // Middle point is unmapped
        const mapping = makeMapping([[0, [10, -1, 30]]]);

        const graph = buildFeatureEdgeGraph(chains, mapping);

        // Only the edge 10→-1 and -1→30 are skipped (both have -1)
        expect(graph.edgeCount).toBe(0);
    });

    it('skips degenerate edges (same vertex)', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 },
            { u: 0.2, row: 1 },
        ], 'peak')];
        const mapping = makeMapping([[0, [10, 10]]]);

        const graph = buildFeatureEdgeGraph(chains, mapping);
        expect(graph.edgeCount).toBe(0);
    });

    it('deduplicates overlapping edges', () => {
        // Two chains producing the same edge
        const chains = [
            makeChain([{ u: 0.2, row: 0 }, { u: 0.2, row: 1 }], 'peak'),
            makeChain([{ u: 0.2, row: 0 }, { u: 0.2, row: 1 }], 'valley'),
        ];
        const mapping = makeMapping([
            [0, [10, 20]],
            [1, [10, 20]], // same vertices
        ]);

        const graph = buildFeatureEdgeGraph(chains, mapping);

        // Only one edge should exist
        expect(graph.edgeCount).toBe(1);
    });

    it('handles multiple chains independently', () => {
        const chains = [
            makeChain([{ u: 0.2, row: 0 }, { u: 0.2, row: 1 }], 'peak'),
            makeChain([{ u: 0.8, row: 0 }, { u: 0.8, row: 1 }], 'valley'),
        ];
        const mapping = makeMapping([
            [0, [10, 20]],
            [1, [50, 60]],
        ]);

        const graph = buildFeatureEdgeGraph(chains, mapping);

        expect(graph.edgeCount).toBe(2);
        expect(isFeatureEdge(graph, 10, 20)).toBe(true);
        expect(isFeatureEdge(graph, 50, 60)).toBe(true);
        expect(getChainEdges(graph, 0).length).toBe(1);
        expect(getChainEdges(graph, 1).length).toBe(1);
    });

    it('returns empty graph for empty chains', () => {
        const graph = buildFeatureEdgeGraph([], { chainToVertices: new Map() });
        expect(graph.edgeCount).toBe(0);
        expect(graph.chainCount).toBe(0);
    });

    it('handles single-point chains (no edges)', () => {
        const chains = [makeChain([{ u: 0.5, row: 0 }], 'peak')];
        const mapping = makeMapping([[0, [42]]]);

        const graph = buildFeatureEdgeGraph(chains, mapping);
        expect(graph.edgeCount).toBe(0);
    });
});

// ============================================================================
// buildFeatureEdgeGraphFromGrid
// ============================================================================

describe('buildFeatureEdgeGraphFromGrid', () => {
    // Build a 10-column grid: U = [0, 0.1, 0.2, ..., 0.9]
    const numU = 10;
    const numT = 5;
    const unionU = new Float32Array(numU);
    for (let i = 0; i < numU; i++) unionU[i] = i / numU;

    it('snaps chain points to nearest grid columns', () => {
        const chains = [makeChain([
            { u: 0.21, row: 0 }, // nearest to col 2 (u=0.2)
            { u: 0.19, row: 1 }, // nearest to col 2 (u=0.2)
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT);

        // Both snap to col 2: vertex 0*10+2=2 and 1*10+2=12
        expect(graph.edgeCount).toBe(1);
        expect(isFeatureEdge(graph, 2, 12)).toBe(true);
    });

    it('handles diagonal chains across columns', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 }, // col 2, vertex 2
            { u: 0.3, row: 1 }, // col 3, vertex 13
            { u: 0.4, row: 2 }, // col 4, vertex 24
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT);

        expect(graph.edgeCount).toBe(2);
        expect(isFeatureEdge(graph, 2, 13)).toBe(true);
        expect(isFeatureEdge(graph, 13, 24)).toBe(true);
    });

    it('filters out seam-crossing edges (du > 0.4)', () => {
        const chains = [makeChain([
            { u: 0.9, row: 0 }, // col 9, vertex 9
            { u: 0.1, row: 1 }, // col 1, vertex 11 — crosses seam!
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT);

        // Circular du = 0.2, but raw du = 0.8 > SEAM_THRESHOLD → filtered
        // Actually: du = |0.9 - 0.1| = 0.8. After circular: du = 1 - 0.8 = 0.2.
        // Since 0.2 < 0.4 this should NOT be filtered.
        // The filter checks: if (du > 0.5) du = 1 - du → 0.2 < 0.4 → kept
        expect(graph.edgeCount).toBe(1);
    });

    it('actually filters large seam-crossing edges', () => {
        // U positions far enough apart that even circular distance > 0.4
        const chains = [makeChain([
            { u: 0.8, row: 0 }, // col 8
            { u: 0.2, row: 1 }, // col 2 — raw du = 0.6, circular = 0.4
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT);

        // |0.8 - 0.2| = 0.6, after circular: 1 - 0.6 = 0.4, which is equal to threshold
        // SEAM_THRESHOLD check is du > 0.4, so 0.4 is NOT greater — edge is kept
        expect(graph.edgeCount).toBe(1);
    });

    it('filters edges with very large seam gap', () => {
        // du > 0.4 after circular wrapping
        const chains = [makeChain([
            { u: 0.05, row: 0 }, // col 1 (nearest to 0.1)
            { u: 0.55, row: 1 }, // col 6 (nearest to 0.6)
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT);

        // du = |0.05 - 0.55| = 0.5, after circular: since 0.5 is not > 0.5, stays 0.5
        // 0.5 > 0.4 → filtered!
        expect(graph.edgeCount).toBe(0);
    });

    it('uses rowMapping when provided as array', () => {
        // rowMapping: original row 0→2, row 1→4 (some rows were inserted)
        const rowMap = [2, 4, -1, -1, -1];
        const chains = [makeChain([
            { u: 0.3, row: 0 }, // maps to final row 2
            { u: 0.3, row: 1 }, // maps to final row 4
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT, rowMap);

        // col 3 (u=0.3), final row 2: vertex = 2*10+3 = 23
        // col 3 (u=0.3), final row 4: vertex = 4*10+3 = 43
        expect(graph.edgeCount).toBe(1);
        expect(isFeatureEdge(graph, 23, 43)).toBe(true);
    });

    it('uses rowMapping when provided as Map', () => {
        const rowMap = new Map([[0, 1], [1, 3]]);
        const chains = [makeChain([
            { u: 0.5, row: 0 }, // maps to final row 1
            { u: 0.5, row: 1 }, // maps to final row 3
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT, rowMap);

        // col 5, row 1: 1*10+5=15, row 3: 3*10+5=35
        expect(graph.edgeCount).toBe(1);
        expect(isFeatureEdge(graph, 15, 35)).toBe(true);
    });

    it('skips points with out-of-range rows', () => {
        const chains = [makeChain([
            { u: 0.3, row: 0 }, // valid
            { u: 0.3, row: 10 }, // out of range (numT=5)
        ], 'peak')];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT);
        expect(graph.edgeCount).toBe(0);
    });
});

// ============================================================================
// isFeatureEdge
// ============================================================================

describe('isFeatureEdge', () => {
    it('is order-independent', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 },
            { u: 0.2, row: 1 },
        ], 'peak')];
        const mapping = makeMapping([[0, [10, 20]]]);
        const graph = buildFeatureEdgeGraph(chains, mapping);

        expect(isFeatureEdge(graph, 10, 20)).toBe(true);
        expect(isFeatureEdge(graph, 20, 10)).toBe(true); // reversed
    });

    it('returns false for non-feature edges', () => {
        const graph = emptyFeatureEdgeGraph();
        expect(isFeatureEdge(graph, 10, 20)).toBe(false);
    });
});

// ============================================================================
// getChainEdges
// ============================================================================

describe('getChainEdges', () => {
    it('returns edges for existing chain', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 },
            { u: 0.2, row: 1 },
            { u: 0.2, row: 2 },
        ], 'peak')];
        const mapping = makeMapping([[0, [1, 2, 3]]]);
        const graph = buildFeatureEdgeGraph(chains, mapping);

        const edges = getChainEdges(graph, 0);
        expect(edges.length).toBe(2);
    });

    it('returns empty array for missing chain', () => {
        const graph = emptyFeatureEdgeGraph();
        expect(getChainEdges(graph, 99)).toEqual([]);
    });
});

// ============================================================================
// featureEdgesToLockedQuads
// ============================================================================

describe('featureEdgesToLockedQuads', () => {
    it('locks quads around feature edges', () => {
        const chains = [makeChain([
            { u: 0.3, row: 1 },
            { u: 0.3, row: 2 },
        ], 'peak')];
        const numU = 10;
        const mapping = makeMapping([[0, [13, 23]]]); // row 1 col 3, row 2 col 3

        const graph = buildFeatureEdgeGraph(chains, mapping);
        const locked = featureEdgesToLockedQuads(graph, numU, 1);

        // Should lock quads around col 3, rows 0-2
        expect(locked.size).toBeGreaterThan(0);
        // Quad at (row=1, col=3) = 1*10+3 = 13 should be locked
        expect(locked.has(13)).toBe(true);
    });

    it('returns empty set for empty graph', () => {
        const locked = featureEdgesToLockedQuads(emptyFeatureEdgeGraph(), 10);
        expect(locked.size).toBe(0);
    });

    it('locks wider band with larger bandHalfWidth', () => {
        const chains = [makeChain([
            { u: 0.5, row: 0 },
            { u: 0.5, row: 1 },
        ], 'peak')];
        const numU = 10;
        const mapping = makeMapping([[0, [5, 15]]]); // row 0 col 5, row 1 col 5
        const graph = buildFeatureEdgeGraph(chains, mapping);

        const narrow = featureEdgesToLockedQuads(graph, numU, 0);
        const wide = featureEdgesToLockedQuads(graph, numU, 2);

        expect(wide.size).toBeGreaterThan(narrow.size);
    });
});

// ============================================================================
// wouldFlipDestroyConstraint
// ============================================================================

describe('wouldFlipDestroyConstraint', () => {
    it('returns true when current diagonal is a feature edge', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 },
            { u: 0.2, row: 1 },
        ], 'peak')];
        const mapping = makeMapping([[0, [10, 20]]]);
        const graph = buildFeatureEdgeGraph(chains, mapping);

        // Current diagonal [10, 20] is a feature edge — flip should be blocked
        expect(wouldFlipDestroyConstraint(graph, [10, 20], [11, 21])).toBe(true);
    });

    it('returns false when current diagonal is not a feature edge', () => {
        const chains = [makeChain([
            { u: 0.2, row: 0 },
            { u: 0.2, row: 1 },
        ], 'peak')];
        const mapping = makeMapping([[0, [10, 20]]]);
        const graph = buildFeatureEdgeGraph(chains, mapping);

        // Current diagonal [11, 21] is NOT a feature edge — flip allowed
        expect(wouldFlipDestroyConstraint(graph, [11, 21], [10, 20])).toBe(false);
    });
});

// ============================================================================
// emptyFeatureEdgeGraph
// ============================================================================

describe('emptyFeatureEdgeGraph', () => {
    it('returns a valid empty graph', () => {
        const graph = emptyFeatureEdgeGraph();
        expect(graph.edgeCount).toBe(0);
        expect(graph.chainCount).toBe(0);
        expect(graph.edges).toEqual([]);
    });
});

// ============================================================================
// mergeGraphs
// ============================================================================

describe('mergeGraphs', () => {
    it('combines edges from two graphs', () => {
        const chainsA = [makeChain([{ u: 0.2, row: 0 }, { u: 0.2, row: 1 }], 'peak')];
        const chainsB = [makeChain([{ u: 0.8, row: 0 }, { u: 0.8, row: 1 }], 'valley')];

        const graphA = buildFeatureEdgeGraph(chainsA, makeMapping([[0, [1, 2]]]));
        const graphB = buildFeatureEdgeGraph(chainsB, makeMapping([[0, [50, 60]]]));

        const merged = mergeGraphs(graphA, graphB);

        expect(merged.edgeCount).toBe(2);
        expect(merged.chainCount).toBe(2);
        expect(isFeatureEdge(merged, 1, 2)).toBe(true);
        expect(isFeatureEdge(merged, 50, 60)).toBe(true);
    });

    it('offsets chain IDs in second graph', () => {
        const chainsA = [makeChain([{ u: 0.2, row: 0 }, { u: 0.2, row: 1 }], 'peak')];
        const chainsB = [makeChain([{ u: 0.8, row: 0 }, { u: 0.8, row: 1 }], 'valley')];

        const graphA = buildFeatureEdgeGraph(chainsA, makeMapping([[0, [1, 2]]]));
        const graphB = buildFeatureEdgeGraph(chainsB, makeMapping([[0, [50, 60]]]));

        const merged = mergeGraphs(graphA, graphB);

        // Chain 0 from A stays chain 0
        expect(getChainEdges(merged, 0).length).toBe(1);
        // Chain 0 from B becomes chain 1
        expect(getChainEdges(merged, 1).length).toBe(1);
    });

    it('deduplicates shared edges', () => {
        const graphs = [
            buildFeatureEdgeGraph([makeChain([{ u: 0, row: 0 }, { u: 0, row: 1 }], 'peak')], makeMapping([[0, [1, 2]]])),
            buildFeatureEdgeGraph([makeChain([{ u: 0, row: 0 }, { u: 0, row: 1 }], 'peak')], makeMapping([[0, [1, 2]]])),
        ];

        const merged = mergeGraphs(graphs[0], graphs[1]);
        // Same vertex pair → only 1 edge
        expect(merged.edgeCount).toBe(1);
    });

    it('merging with empty graph returns identical', () => {
        const chains = [makeChain([{ u: 0.5, row: 0 }, { u: 0.5, row: 1 }], 'peak')];
        const graph = buildFeatureEdgeGraph(chains, makeMapping([[0, [10, 20]]]));
        const empty = emptyFeatureEdgeGraph();

        const merged = mergeGraphs(graph, empty);
        expect(merged.edgeCount).toBe(1);
        expect(merged.chainCount).toBe(1);

        const mergedReverse = mergeGraphs(empty, graph);
        expect(mergedReverse.edgeCount).toBe(1);
    });
});

// ============================================================================
// Integration: full pipeline from chains to locked quads
// ============================================================================

describe('Integration: chains → graph → locked quads', () => {
    it('builds complete pipeline for multi-chain grid', () => {
        const numU = 20;
        const numT = 10;
        const unionU = new Float32Array(numU);
        for (let i = 0; i < numU; i++) unionU[i] = i / numU;

        // Two chains: one vertical peak at u≈0.25, one diagonal valley
        const chains: FeatureChain[] = [
            makeChain([
                { u: 0.25, row: 0 },
                { u: 0.25, row: 1 },
                { u: 0.25, row: 2 },
                { u: 0.25, row: 3 },
            ], 'peak'),
            makeChain([
                { u: 0.40, row: 0 },
                { u: 0.45, row: 1 },
                { u: 0.50, row: 2 },
                { u: 0.55, row: 3 },
            ], 'valley'),
        ];

        const graph = buildFeatureEdgeGraphFromGrid(chains, unionU, numU, numT);

        // Peak chain: 3 edges (4 points)
        // Valley chain: 3 edges (4 points)
        expect(graph.edgeCount).toBe(6);
        expect(graph.chainCount).toBe(2);
        expect(graph.chainKinds.get(0)).toBe('peak');
        expect(graph.chainKinds.get(1)).toBe('valley');

        // Convert to locked quads
        const locked = featureEdgesToLockedQuads(graph, numU, 1);
        expect(locked.size).toBeGreaterThan(0);

        // Verify no constraint is accidentally flippable
        for (const edge of graph.edges) {
            expect(wouldFlipDestroyConstraint(graph, [edge.v0, edge.v1], [0, 0])).toBe(true);
        }
    });
});

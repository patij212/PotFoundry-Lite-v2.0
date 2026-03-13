/**
 * EdgeCollapser.ts — QEM-based edge collapse for adaptive refinement.
 *
 * Removes over-tessellated edges in smooth regions using Quadric Error Metric
 * (QEM) scoring. Half-edge collapse only — no optimal vertex placement, since
 * pot vertices are GPU-snapped to the analytic surface.
 *
 * @module EdgeCollapser
 */

import type { FeatureEdgeGraph } from './FeatureEdgeGraph';
import { isFeatureEdge } from './FeatureEdgeGraph';
import type { VertexMetrics } from './AdaptiveRefinement';
import { metricEdgeLengthSq } from './SurfaceMetric';
import { SEAM_PROXIMITY_THRESHOLD } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum allowed metric aspect ratio for post-collapse triangles. */
export const _MAX_METRIC_ASPECT_RATIO = 5;

// ============================================================================
// Types
// ============================================================================

export interface CollapseCandidate {
    v0: number;          // first vertex of edge
    v1: number;          // second vertex of edge
    vRemove: number;     // vertex to delete
    vKeep: number;       // vertex to keep (lower QEM error)
    cost: number;        // QEM collapse cost
    priority: number;    // final priority score (lower = collapse first)
}

export interface CollapseResult {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    outerIdxCount: number;
    collapseCount: number;
    removedVertices: Set<number>;
}

// ============================================================================
// Min-Heap for collapse candidates
// ============================================================================

class MinHeap {
    private data: CollapseCandidate[] = [];

    get size(): number { return this.data.length; }

    push(item: CollapseCandidate): void {
        this.data.push(item);
        this._bubbleUp(this.data.length - 1);
    }

    pop(): CollapseCandidate | undefined {
        if (this.data.length === 0) return undefined;
        const top = this.data[0];
        const last = this.data.pop()!;
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    private _bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.data[parent].priority <= this.data[i].priority) break;
            [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
            i = parent;
        }
    }

    private _sinkDown(i: number): void {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1, right = 2 * i + 2;
            if (left < n && this.data[left].priority < this.data[smallest].priority) smallest = left;
            if (right < n && this.data[right].priority < this.data[smallest].priority) smallest = right;
            if (smallest === i) break;
            [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
            i = smallest;
        }
    }
}

// ============================================================================
// QEM Utilities
// ============================================================================

/**
 * Initialize per-vertex quadric matrices from triangle planes.
 *
 * Each quadric is stored as 10 floats (upper-triangle of 4×4 symmetric matrix):
 * [Q00, Q01, Q02, Q03, Q11, Q12, Q13, Q22, Q23, Q33]
 *
 * Uses Float64Array for numerical stability.
 */
export function initQuadrics(
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
): Float64Array {
    const vertCount = positions.length / 3;
    const quadrics = new Float64Array(vertCount * 10);

    const triCount = Math.floor(outerIdxCount / 3);
    for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        const i0 = indices[base], i1 = indices[base + 1], i2 = indices[base + 2];

        // Triangle plane: ax + by + cz + d = 0
        const x0 = positions[i0 * 3], y0 = positions[i0 * 3 + 1], z0 = positions[i0 * 3 + 2];
        const x1 = positions[i1 * 3], y1 = positions[i1 * 3 + 1], z1 = positions[i1 * 3 + 2];
        const x2 = positions[i2 * 3], y2 = positions[i2 * 3 + 1], z2 = positions[i2 * 3 + 2];

        // Edge vectors
        const ex1 = x1 - x0, ey1 = y1 - y0, ez1 = z1 - z0;
        const ex2 = x2 - x0, ey2 = y2 - y0, ez2 = z2 - z0;

        // Normal (cross product)
        let nx = ey1 * ez2 - ez1 * ey2;
        let ny = ez1 * ex2 - ex1 * ez2;
        let nz = ex1 * ey2 - ey1 * ex2;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-12) continue;

        // Area = half the cross-product magnitude (I3: area weighting)
        const area = len * 0.5;

        nx /= len; ny /= len; nz /= len;

        const d = -(nx * x0 + ny * y0 + nz * z0);

        // Quadric Q = p·pᵀ where p = (nx, ny, nz, d)
        // Upper triangle of 4×4 symmetric matrix
        const q: [number, number, number, number, number, number, number, number, number, number] = [
            nx * nx, nx * ny, nx * nz, nx * d,   // row 0
            ny * ny, ny * nz, ny * d,             // row 1
            nz * nz, nz * d,                      // row 2
            d * d,                                  // row 3
        ];

        // Accumulate area-weighted quadric into vertex quadrics (I3)
        for (const vi of [i0, i1, i2]) {
            const off = vi * 10;
            for (let j = 0; j < 10; j++) quadrics[off + j] += q[j] * area;
        }
    }

    return quadrics;
}

/**
 * Compute collapse cost and direction for an edge.
 * Half-edge collapse: keep the vertex with lower QEM error.
 */
export function computeCollapseCost(
    quadrics: Float64Array,
    positions: Float32Array,
    v0: number,
    v1: number,
): { cost: number; vKeep: number; vRemove: number } {
    // Combine quadrics
    const off0 = v0 * 10, off1 = v1 * 10;
    const combined = new Float64Array(10);
    for (let j = 0; j < 10; j++) combined[j] = quadrics[off0 + j] + quadrics[off1 + j];

    // Evaluate error at both positions
    const x0 = positions[v0 * 3], y0 = positions[v0 * 3 + 1], z0 = positions[v0 * 3 + 2];
    const err0 = (
        combined[0] * x0 * x0 + 2 * combined[1] * x0 * y0 + 2 * combined[2] * x0 * z0 + 2 * combined[3] * x0 +
        combined[4] * y0 * y0 + 2 * combined[5] * y0 * z0 + 2 * combined[6] * y0 +
        combined[7] * z0 * z0 + 2 * combined[8] * z0 + combined[9]
    );

    const x1 = positions[v1 * 3], y1 = positions[v1 * 3 + 1], z1 = positions[v1 * 3 + 2];
    const err1 = (
        combined[0] * x1 * x1 + 2 * combined[1] * x1 * y1 + 2 * combined[2] * x1 * z1 + 2 * combined[3] * x1 +
        combined[4] * y1 * y1 + 2 * combined[5] * y1 * z1 + 2 * combined[6] * y1 +
        combined[7] * z1 * z1 + 2 * combined[8] * z1 + combined[9]
    );

    return err0 <= err1
        ? { cost: Math.max(0, err0), vKeep: v0, vRemove: v1 }
        : { cost: Math.max(0, err1), vKeep: v1, vRemove: v0 };
}

// ============================================================================
// Validity Checks
// ============================================================================

/**
 * Build vertex-to-triangle adjacency map.
 */
function buildVertexTriMap(indices: Uint32Array, outerIdxCount: number): Map<number, number[]> {
    const vtMap = new Map<number, number[]>();
    const triCount = Math.floor(outerIdxCount / 3);
    for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        for (let k = 0; k < 3; k++) {
            const v = indices[base + k];
            let tris = vtMap.get(v);
            if (!tris) { tris = []; vtMap.set(v, tris); }
            tris.push(base);
        }
    }
    return vtMap;
}

/**
 * Build 1-ring neighbor set for a vertex.
 * Works with both Array-based and Set-based vtMap values via Iterable<number>.
 */
function oneRingOf(v: number, vtMap: Map<number, Iterable<number>>, indices: Uint32Array): Set<number> {
    const neighbors = new Set<number>();
    const tris = vtMap.get(v);
    if (!tris) return neighbors;
    for (const t of tris) {
        for (let k = 0; k < 3; k++) {
            const w = indices[t + k];
            if (w !== v) neighbors.add(w);
        }
    }
    return neighbors;
}

/**
 * Link condition: shared neighbors of v0 and v1 must be exactly 2 (manifold interior)
 * or 1 (boundary). More than 2 shared neighbors → non-manifold collapse.
 *
 * Accepts both Array-based (`Map<number, number[]>`) and Set-based
 * (`Map<number, Set<number>>`) vtMap via Iterable<number>.
 */
export function checkLinkCondition(
    v0: number, v1: number,
    vtMap: Map<number, Iterable<number>>,
    indices: Uint32Array,
): boolean {
    const ring0 = oneRingOf(v0, vtMap, indices);
    const ring1 = oneRingOf(v1, vtMap, indices);
    let sharedCount = 0;
    for (const n of ring0) {
        if (ring1.has(n)) sharedCount++;
    }
    return sharedCount <= 2;
}

/**
 * Inversion prevention: check that no triangle incident on vKeep would flip
 * its normal after collapsing vRemove → vKeep.
 * Accepts both Array and Set-based vtMap via Iterable<number>.
 */
function checkNoInversion(
    vKeep: number, vRemove: number,
    vtMap: Map<number, Iterable<number>>,
    positions: Float32Array,
    indices: Uint32Array,
): boolean {
    const tris = vtMap.get(vRemove);
    if (!tris) return true;

    for (const t of tris) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        // Skip triangles that share the edge — these become degenerate and will be removed
        if ((i0 === vKeep || i1 === vKeep || i2 === vKeep)) continue;

        // This triangle has vRemove but not vKeep — simulate collapse
        const verts = [i0, i1, i2].map(v => v === vRemove ? vKeep : v);

        // Check degenerate
        if (verts[0] === verts[1] || verts[1] === verts[2] || verts[0] === verts[2]) continue;

        // Compute normal before
        const nBefore = triNormal(positions, i0, i1, i2);
        // Compute normal after (with vRemove replaced by vKeep)
        const nAfter = triNormal(positions, verts[0], verts[1], verts[2]);

        // Check for inversion
        const dot = nBefore[0] * nAfter[0] + nBefore[1] * nAfter[1] + nBefore[2] * nAfter[2];
        if (dot < 0) return false; // normal flipped
    }

    return true;
}

/**
 * Compute triangle normal from positions.
 */
function triNormal(positions: Float32Array, i0: number, i1: number, i2: number): [number, number, number] {
    const x0 = positions[i0 * 3], y0 = positions[i0 * 3 + 1], z0 = positions[i0 * 3 + 2];
    const x1 = positions[i1 * 3], y1 = positions[i1 * 3 + 1], z1 = positions[i1 * 3 + 2];
    const x2 = positions[i2 * 3], y2 = positions[i2 * 3 + 1], z2 = positions[i2 * 3 + 2];
    const ex1 = x1 - x0, ey1 = y1 - y0, ez1 = z1 - z0;
    const ex2 = x2 - x0, ey2 = y2 - y0, ez2 = z2 - z0;
    const nx = ey1 * ez2 - ez1 * ey2;
    const ny = ez1 * ex2 - ex1 * ez2;
    const nz = ex1 * ey2 - ey1 * ex2;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return len < 1e-12 ? [0, 0, 1] : [nx / len, ny / len, nz / len];
}

/**
 * Check minimum angle of a triangle in degrees.
 */
function triMinAngle(positions: Float32Array, i0: number, i1: number, i2: number): number {
    const x0 = positions[i0 * 3], y0 = positions[i0 * 3 + 1], z0 = positions[i0 * 3 + 2];
    const x1 = positions[i1 * 3], y1 = positions[i1 * 3 + 1], z1 = positions[i1 * 3 + 2];
    const x2 = positions[i2 * 3], y2 = positions[i2 * 3 + 1], z2 = positions[i2 * 3 + 2];
    const edges = [
        [x1 - x0, y1 - y0, z1 - z0],
        [x2 - x1, y2 - y1, z2 - z1],
        [x0 - x2, y0 - y2, z0 - z2],
    ];
    let minAngle = 180;
    for (let i = 0; i < 3; i++) {
        const a = edges[i], b = edges[(i + 2) % 3]; // vectors emanating FROM vertex i
        const aLen = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
        const bLen = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
        if (aLen < 1e-12 || bLen < 1e-12) return 0;
        // Angle at vertex i: angle between edge going FROM vertex
        const dot = -(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]); // negate because b points away
        const cosA = Math.max(-1, Math.min(1, dot / (aLen * bLen)));
        const angle = Math.acos(cosA) * (180 / Math.PI);
        if (angle < minAngle) minAngle = angle;
    }
    return minAngle;
}

/**
 * Identify seam vertices (u ≈ 0 or u ≈ 1).
 */
function identifySeamVertices(
    uvs: Float32Array,
    vertexCount: number,
    seamThreshold: number = SEAM_PROXIMITY_THRESHOLD,
): Set<number> {
    const seamVerts = new Set<number>();
    for (let v = 0; v < vertexCount; v++) {
        const u = uvs[v * 3];
        if (u < seamThreshold || u > 1 - seamThreshold) seamVerts.add(v);
    }
    return seamVerts;
}

/**
 * Identify feature vertices from the feature edge graph.
 */
function identifyFeatureVertices(featureGraph: FeatureEdgeGraph): Set<number> {
    const featureVerts = new Set<number>();
    for (const edge of featureGraph.edges) {
        featureVerts.add(edge.v0);
        featureVerts.add(edge.v1);
    }
    return featureVerts;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Collapse short (over-sampled) edges to reduce triangle count.
 *
 * Uses QEM scoring to find the cheapest collapses, with five validity checks:
 * 1. Feature edge protection
 * 2. Feature vertex protection
 * 3. Seam safety
 * 4. Link condition
 * 5. Inversion prevention
 *
 * Fixes from review:
 * - C3: Single heap construction (no double pass)
 * - C4: Removed broken generation counter; uses removedVertices + staleness check
 * - I4: Proper re-scoring of edges incident on vKeep after each collapse
 * - I7: Proactive collapse at 90% of target (not only when over budget)
 * - C2: vtMap properly updated using Set-based triangle tracking
 *
 * @returns CollapseResult with compacted mesh.
 */
export async function collapseOverBudgetEdges(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    featureGraph: FeatureEdgeGraph,
    targetTriangles: number,
    vertexMetrics?: VertexMetrics,
): Promise<CollapseResult> {
    const currentTriangles = Math.floor(outerIdxCount / 3);

    // I7: Proactive collapse — trigger at 90% of target, not just when over
    const proactiveThreshold = Math.ceil(targetTriangles * 0.9);
    if (currentTriangles <= proactiveThreshold) {
        return {
            positions: new Float32Array(positions),
            uvs: new Float32Array(uvs),
            indices: new Uint32Array(indices),
            outerIdxCount,
            collapseCount: 0,
            removedVertices: new Set(),
        };
    }

    const vertCount = positions.length / 3;

    // ── 1. Init quadrics (area-weighted per I3) ──────────────────────
    const quadrics = initQuadrics(positions, indices, outerIdxCount);

    // ── 2. Build adjacency ───────────────────────────────────────────
    // C2: Use Set-based vtMap for O(1) lookups instead of Array.includes
    const vtMap = new Map<number, Set<number>>();
    const triCount = Math.floor(outerIdxCount / 3);
    for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        for (let k = 0; k < 3; k++) {
            const v = indices[base + k];
            let tris = vtMap.get(v);
            if (!tris) { tris = new Set(); vtMap.set(v, tris); }
            tris.add(base);
        }
    }

    const featureVerts = identifyFeatureVertices(featureGraph);
    const seamVerts = identifySeamVertices(uvs, vertCount);

    // ── 3. Single-pass: collect all edge costs, compute median, build heap ─
    // C3: Only one heap build instead of two
    interface EdgeInfo {
        v0: number; v1: number;
        cost: number; vKeep: number; vRemove: number;
        metricLen: number;
    }
    const edgeInfos: EdgeInfo[] = [];
    const visited = new Set<string>();

    for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        const verts = [indices[base], indices[base + 1], indices[base + 2]];
        for (let e = 0; e < 3; e++) {
            const a = verts[e], b = verts[(e + 1) % 3];
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (visited.has(key)) continue;
            visited.add(key);

            // Skip protected edges/vertices
            if (isFeatureEdge(featureGraph, a, b)) continue;
            if (featureVerts.has(a) || featureVerts.has(b)) continue;
            const aSeam = seamVerts.has(a), bSeam = seamVerts.has(b);
            if (aSeam !== bSeam) continue;

            const { cost, vKeep, vRemove } = computeCollapseCost(quadrics, positions, a, b);
            let metricLen = 1;
            if (vertexMetrics) {
                metricLen = Math.sqrt(Math.max(0, metricEdgeLengthSq(vertexMetrics, uvs, a, b)));
            }
            edgeInfos.push({ v0: a, v1: b, cost, vKeep, vRemove, metricLen });
        }
    }

    if (edgeInfos.length === 0) {
        return {
            positions: new Float32Array(positions), uvs: new Float32Array(uvs),
            indices: new Uint32Array(indices), outerIdxCount,
            collapseCount: 0, removedVertices: new Set(),
        };
    }

    // Compute median cost from flat array (no second pass)
    const allCosts = edgeInfos.map(e => e.cost).sort((a, b) => a - b);
    const medianCost = allCosts[Math.floor(allCosts.length / 2)] || 1;

    // Build single heap with final priorities
    const heap = new MinHeap();
    for (const info of edgeInfos) {
        const priority = info.metricLen * (1 + info.cost / Math.max(medianCost, 1e-12));
        heap.push({
            v0: info.v0, v1: info.v1,
            vRemove: info.vRemove, vKeep: info.vKeep,
            cost: info.cost, priority,
        });
    }

    // ── 4. Greedy collapse with proper re-scoring ────────────────────
    const mutableIdx = new Uint32Array(indices);
    const removedVertices = new Set<number>();
    let currentTris = currentTriangles;
    let collapseCount = 0;
    const MIN_ANGLE_THRESHOLD = 10; // degrees

    while (heap.size > 0 && currentTris > targetTriangles) {
        const candidate = heap.pop()!;
        const { v0, v1 } = candidate;

        // Lazy deletion: skip if either vertex already removed
        if (removedVertices.has(v0) || removedVertices.has(v1)) continue;

        // Re-score stale candidates (vertex was modified since initial scoring)
        // C4: Use removedVertices as the only staleness indicator — no generation counter
        // We check if the edge still exists in the topology
        const trisV0 = vtMap.get(v0);
        const trisV1 = vtMap.get(v1);
        if (!trisV0 || !trisV1) continue;

        // Verify the edge still exists (both vertices share a triangle)
        let edgeExists = false;
        for (const t of trisV0) {
            if (trisV1.has(t)) { edgeExists = true; break; }
        }
        if (!edgeExists) continue;

        const { vKeep, vRemove } = candidate;

        // Validity checks — use Set-based vtMap for link condition
        if (!checkLinkCondition(v0, v1, vtMap, mutableIdx)) continue;
        if (!checkNoInversion(vKeep, vRemove, vtMap, positions, mutableIdx)) continue;

        // Check that remaining triangles won't become slivers
        let wouldCreateSliver = false;
        const trisOfRemoved = vtMap.get(vRemove);
        if (trisOfRemoved) {
            for (const t of trisOfRemoved) {
                const ti0 = mutableIdx[t], ti1 = mutableIdx[t + 1], ti2 = mutableIdx[t + 2];
                if (ti0 === vKeep || ti1 === vKeep || ti2 === vKeep) continue; // degenerate — will be removed
                const newVerts = [ti0, ti1, ti2].map(v => v === vRemove ? vKeep : v);
                if (newVerts[0] === newVerts[1] || newVerts[1] === newVerts[2] || newVerts[0] === newVerts[2]) continue;
                const angle = triMinAngle(positions, newVerts[0], newVerts[1], newVerts[2]);
                if (angle < MIN_ANGLE_THRESHOLD) { wouldCreateSliver = true; break; }
            }
        }
        if (wouldCreateSliver) continue;

        // ── Execute collapse ─────────────────────────────────────────
        const trisToUpdate = vtMap.get(vRemove);
        if (trisToUpdate) {
            // C2: Track degenerate triangles for proper vtMap cleanup
            const degenerateTris = new Set<number>();

            for (const t of trisToUpdate) {
                for (let k = 0; k < 3; k++) {
                    if (mutableIdx[t + k] === vRemove) mutableIdx[t + k] = vKeep;
                }

                // Check if triangle became degenerate
                const a = mutableIdx[t], b = mutableIdx[t + 1], c = mutableIdx[t + 2];
                if (a === b || b === c || a === c) {
                    degenerateTris.add(t);
                }

                // Add triangle to vKeep's adjacency
                let keepTris = vtMap.get(vKeep);
                if (!keepTris) { keepTris = new Set(); vtMap.set(vKeep, keepTris); }
                keepTris.add(t);
            }

            // C2: Remove degenerate triangles from all vtMap entries
            for (const dt of degenerateTris) {
                const a = mutableIdx[dt], b = mutableIdx[dt + 1], c = mutableIdx[dt + 2];
                for (const v of [a, b, c]) {
                    vtMap.get(v)?.delete(dt);
                }
                currentTris--;
            }
        }

        // Update quadric of vKeep
        const offKeep = vKeep * 10, offRemove = vRemove * 10;
        for (let j = 0; j < 10; j++) quadrics[offKeep + j] += quadrics[offRemove + j];

        removedVertices.add(vRemove);
        vtMap.delete(vRemove);
        collapseCount++;

        // I4: Proper re-scoring — re-score all edges incident on vKeep
        const keepTris = vtMap.get(vKeep);
        if (keepTris) {
            const reScoreEdges = new Set<string>();
            for (const t of keepTris) {
                for (let k = 0; k < 3; k++) {
                    const va = mutableIdx[t + k];
                    for (let k2 = k + 1; k2 < 3; k2++) {
                        const vb = mutableIdx[t + k2];
                        if (va === vb) continue;
                        if (removedVertices.has(va) || removedVertices.has(vb)) continue;
                        const key = va < vb ? `${va}-${vb}` : `${vb}-${va}`;
                        reScoreEdges.add(key);
                    }
                }
            }
            for (const key of reScoreEdges) {
                const dashIdx = key.indexOf('-');
                const eA = parseInt(key.substring(0, dashIdx));
                const eB = parseInt(key.substring(dashIdx + 1));
                if (isFeatureEdge(featureGraph, eA, eB)) continue;
                if (featureVerts.has(eA) || featureVerts.has(eB)) continue;
                const aSeam = seamVerts.has(eA), bSeam = seamVerts.has(eB);
                if (aSeam !== bSeam) continue;

                const { cost, vKeep: nKeep, vRemove: nRemove } = computeCollapseCost(quadrics, positions, eA, eB);
                let mLen = 1;
                if (vertexMetrics) mLen = Math.sqrt(Math.max(0, metricEdgeLengthSq(vertexMetrics, uvs, eA, eB)));
                const priority = mLen * (1 + cost / Math.max(medianCost, 1e-12));
                heap.push({ v0: eA, v1: eB, vRemove: nRemove, vKeep: nKeep, cost, priority });
            }
        }
    }

    // ── 5. Compact mesh ──────────────────────────────────────────────
    return compactMesh(positions, uvs, mutableIdx, outerIdxCount, removedVertices, collapseCount);
}

// ============================================================================
// Mesh Compaction
// ============================================================================

/**
 * Remove degenerate triangles and renumber vertices to fill gaps.
 */
export function compactMesh(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    removedVertices: Set<number>,
    collapseCount: number,
): CollapseResult {
    const vertCount = positions.length / 3;

    // Build old→new vertex index map
    const oldToNew = new Int32Array(vertCount).fill(-1);
    let newIdx = 0;
    for (let v = 0; v < vertCount; v++) {
        if (!removedVertices.has(v)) {
            oldToNew[v] = newIdx++;
        }
    }
    const newVertCount = newIdx;

    // Copy surviving positions/uvs
    const newPositions = new Float32Array(newVertCount * 3);
    const newUVs = new Float32Array(newVertCount * 3);
    for (let v = 0; v < vertCount; v++) {
        const ni = oldToNew[v];
        if (ni < 0) continue;
        newPositions[ni * 3] = positions[v * 3];
        newPositions[ni * 3 + 1] = positions[v * 3 + 1];
        newPositions[ni * 3 + 2] = positions[v * 3 + 2];
        newUVs[ni * 3] = uvs[v * 3];
        newUVs[ni * 3 + 1] = uvs[v * 3 + 1];
        newUVs[ni * 3 + 2] = uvs[v * 3 + 2];
    }

    // Filter degenerate triangles and remap indices
    const triCount = Math.floor(outerIdxCount / 3);
    const newIndicesArr: number[] = [];
    for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        const a = oldToNew[indices[base]];
        const b = oldToNew[indices[base + 1]];
        const c = oldToNew[indices[base + 2]];
        // Skip degenerate (two identical or removed vertex)
        if (a < 0 || b < 0 || c < 0) continue;
        if (a === b || b === c || a === c) continue;
        newIndicesArr.push(a, b, c);
    }

    const newIndices = new Uint32Array(newIndicesArr);

    return {
        positions: newPositions,
        uvs: newUVs,
        indices: newIndices,
        outerIdxCount: newIndices.length,
        collapseCount,
        removedVertices,
    };
}

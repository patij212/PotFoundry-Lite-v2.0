/**
 * MeshValidator — Comprehensive geometric QA for the parametric export mesh.
 *
 * Combines baseline topological checks (manifold, degenerates, normal consistency)
 * with geometric fidelity validation (chord error, normal error, feature drift,
 * triangle quality, seam continuity).
 *
 * All checks are tolerance-gated using the QualityProfiles system.
 * The validator returns a structured {@link ValidationReport} that the
 * orchestrator can use as a pass/fail gate.
 *
 * @module MeshValidator
 * @see QualityProfiles.ts for tolerance thresholds
 * @see AdaptiveRefinement.ts for error estimation utilities
 * @see SeamTopology.ts for seam continuity metrics
 */

import type { ExportTolerances } from './types';
import {
    triangleNormal,
    computeChordError,
    computeNormalError,
    edgeLengthSq,
    percentile,
    buildEdgeAdjacency,
} from './AdaptiveRefinement';
import {
    identifySeamPairs,
    measurePositionGap,
    estimateNormalGapFromFaces,
    seamConfigForProfile,
} from './SeamTopology';
import type { SeamValidationConfig } from './SeamTopology';
import type { QualityProfileName } from './types';
import {
    computeDistortion,
    edgeLengthStats,
} from './SurfaceMetric';

const DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM = 0;

// ============================================================================
// Types
// ============================================================================

/** Manifold topology check result. */
export interface ManifoldReport {
    /** Whether the mesh is manifold (every edge has exactly 2 faces). */
    ok: boolean;
    /** Number of non-manifold edges (>2 adjacent triangles). */
    nonManifoldEdges: number;
    /** Number of boundary edges (exactly 1 adjacent triangle). */
    boundaryEdges: number;
}

/** Degenerate triangle check result. */
export interface DegenerateReport {
    /** Whether no degenerate elements were found. */
    ok: boolean;
    /** Triangles with area below threshold. */
    zeroAreaTriangles: number;
    /** Edges shorter than the collapse threshold. */
    collapsedEdges: number;
}

/** Normal consistency check result. */
export interface NormalConsistencyReport {
    /** Whether normals are consistent across the mesh. */
    ok: boolean;
    /** Triangles with normals pointing opposite to dominant direction. */
    invertedTriangles: number;
    /** Adjacent triangle pairs with incompatible normals. */
    inconsistentPairs: number;
}

/** Geometric fidelity check result (vs analytic surface). */
export interface FidelityReport {
    /** Whether fidelity passes the tolerance gates. */
    ok: boolean;
    /** 95th percentile position error in mm. */
    p95PosErrorMm: number;
    /** 99.9th percentile position error in mm. */
    p999PosErrorMm: number;
    /** 95th percentile normal error in degrees. */
    p95NormalErrorDeg: number;
    /** 99.9th percentile normal error in degrees. */
    p999NormalErrorDeg: number;
    /** Maximum feature edge drift from chain reference in mm. */
    maxFeatureDriftMm: number;
}

/** Triangle shape quality check result. */
export interface TriangleQualityReport {
    /** Whether triangle quality passes the tolerance gates. */
    ok: boolean;
    /** Minimum interior angle across all triangles (degrees). */
    minAngleDeg: number;
    /** Maximum aspect ratio (circumradius/inradius, R/r) across all triangles. */
    maxAspectRatio: number;
    /** Number of sliver triangles (min angle < threshold). */
    sliverCount: number;
    /** Mean aspect ratio. */
    meanAspectRatio: number;
}

/** Seam continuity check result. */
export interface SeamReport {
    /** Whether seam continuity passes the tolerance gates. */
    ok: boolean;
    /** Maximum position discontinuity at the seam in mm. */
    maxPositionDiscontinuityMm: number;
    /** Maximum normal discontinuity at the seam in degrees. */
    maxNormalDiscontinuityDeg: number;
}

/** Wall thickness check result (optional). */
export interface WallThicknessReport {
    /** Whether wall thickness is above minimum. */
    ok: boolean;
    /** Minimum measured wall thickness in mm. */
    minThicknessMm: number;
    /** Number of spots below the minimum threshold. */
    thinSpots: number;
}

/** UV metric distortion check result. */
export interface DistortionReport {
    /** Whether distortion passes the tolerance gates. */
    ok: boolean;
    /** 95th percentile stretch ratio (σ₁/σ₂) across triangles. */
    p95StretchRatio: number;
    /** 99.9th percentile stretch ratio. */
    p999StretchRatio: number;
    /** Mean stretch ratio across triangles. */
    meanStretchRatio: number;
    /** Number of triangles evaluated. */
    triangleCount: number;
}

/** 3D edge-length distribution check result. */
export interface EdgeLengthReport {
    /** Whether edge-length distribution passes quality gates. */
    ok: boolean;
    /** 95th percentile 3D edge length in mm. */
    p95Mm: number;
    /** 99.9th percentile 3D edge length in mm. */
    p999Mm: number;
    /** Mean 3D edge length in mm. */
    meanMm: number;
    /** Coefficient of variation (stddev/mean). Lower = more uniform. */
    coeffOfVariation: number;
    /** Total unique edges measured. */
    edgeCount: number;
}

/** Boundary-edge classification used for export topology diagnostics. */
export interface BoundaryEdgeDiagnostics {
    /** Total boundary edges after optional geometric welding. */
    total: number;
    /** Counts grouped by endpoint surface ids. */
    bySurfacePair: Array<{ key: string; count: number }>;
    /** Counts grouped by endpoint surface id and T-boundary class. */
    byEndpointClass: Array<{ key: string; count: number }>;
    /** Representative raw vertex pairs for the first few boundary edges. */
    samples: Array<{
        classKey?: string;
        rawCount?: number;
        v0: number;
        v1: number;
        u0: number;
        t0: number;
        s0: number;
        u1: number;
        t1: number;
        s1: number;
    }>;
    /** Connected components of the boundary-edge graph after optional geometric welding. */
    components: {
        total: number;
        closedLoops: number;
        openChains: number;
        branched: number;
        largestEdges: number;
        degree1Vertices: number;
        degree2Vertices: number;
        degree3PlusVertices: number;
    };
    /** Representative connected boundary components with UV extents. */
    componentSamples?: Array<{
        kind: 'loop' | 'chain' | 'branched';
        edges: number;
        vertices: number;
        minU: number;
        maxU: number;
        minT: number;
        maxT: number;
        maxDegree: number;
        sampleVertices: number[];
    }>;
}

export interface EdgeAnomalyDiagnostics {
    total: number;
    byEndpointClass: Array<{ key: string; count: number }>;
    samples: Array<{
        classKey?: string;
        count: number;
        v0: number;
        v1: number;
        u0: number;
        t0: number;
        s0: number;
        u1: number;
        t1: number;
        s1: number;
        incidents?: Array<{
            triOffset: number;
            opp: number;
            oppU?: number;
            oppT?: number;
            oppS?: number;
        }>;
    }>;
}

/** Distortion tolerance thresholds per quality profile. */
export interface DistortionGates {
    /** Maximum allowable p95 stretch ratio. */
    maxP95StretchRatio: number;
    /** Maximum allowable p999 stretch ratio. */
    maxP999StretchRatio: number;
}

/** Complete mesh validation report. */
export interface ValidationReport {
    /** Overall pass: all enabled checks passed. */
    valid: boolean;
    /** Manifold topology check. */
    manifold: ManifoldReport;
    /** Degenerate element check. */
    degenerates: DegenerateReport;
    /** Normal consistency check. */
    normals: NormalConsistencyReport;
    /** Geometric fidelity vs analytic surface (present if evaluator provided). */
    fidelity?: FidelityReport;
    /** Triangle shape quality. */
    triangleQuality: TriangleQualityReport;
    /** Seam continuity (present if numU/numT provided). */
    seam?: SeamReport;
    /** Wall thickness (present if inner positions provided). */
    wallThickness?: WallThicknessReport;
    /** UV metric distortion (present if UVs provided). */
    distortion?: DistortionReport;
    /** 3D edge-length distribution. */
    edgeLength?: EdgeLengthReport;
    /** Human-readable warnings. */
    warnings: string[];
}

/** Configuration for running mesh validation. */
export interface ValidateConfig {
    /** Tolerance thresholds for pass/fail gating. */
    tolerances: ExportTolerances;
    /** Quality profile name (used for seam thresholds). */
    profileName?: QualityProfileName;
    /** Grid dimensions for seam checking. */
    numU?: number;
    /** Grid dimensions for seam checking. */
    numT?: number;
    /** Minimum area threshold for zero-area triangle detection. */
    minTriangleArea?: number;
    /** Minimum edge length threshold for collapsed edge detection. */
    minEdgeLength?: number;
    /** Inner wall positions for wall thickness check. */
    innerPositions?: Float32Array;
    /** Minimum wall thickness in mm (default: 0.8 for SLA). */
    minWallThicknessMm?: number;
    /** Feature chain vertex positions for drift measurement. */
    featureChainPositions?: Float32Array;
    /** Feature chain reference (snapped) positions for drift measurement. */
    featureChainReferencePositions?: Float32Array;
    /** Only check outer wall triangles up to this index count. */
    outerIdxCount?: number;
    /** UV coordinates for distortion checking. Packed [u,v,surfaceId,...]. */
    uvs?: Float32Array;
    /** Distortion tolerance gates (profile-dependent). */
    distortionGates?: DistortionGates;
    /**
     * Position tolerance used to weld STL-style duplicated vertices before
     * manifold checks. Defaults to 0 for the hot export path; callers can opt
     * in when they need STL-style geometric topology auditing.
     */
    topologyWeldToleranceMm?: number;
}

// ============================================================================
// Edge Key Helpers
// ============================================================================

/**
 * Pack two vertex indices into a canonical bigint edge key.
 * Uses 0x200000 (2M) stride to allow vertex indices up to 2M per coordinate.
 * Key = min(a,b) * stride + max(a,b), ensuring consistent ordering.
 */
function edgeKey(a: number, b: number): bigint {
    return a < b
        ? BigInt(a) * 0x200000n + BigInt(b)
        : BigInt(b) * 0x200000n + BigInt(a);
}

function buildGeometricVertexRemap(
    positions: Float32Array,
    epsilon: number,
): Uint32Array {
    const vertexCount = Math.floor(positions.length / 3);
    const remap = new Uint32Array(vertexCount);
    if (vertexCount === 0) return remap;

    const precision = Math.max(1, Math.round(1 / epsilon));
    const quantized = new Int32Array(vertexCount * 4);
    const order = new Uint32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
        quantized[i * 4] = Math.round(positions[i * 3] * precision);
        quantized[i * 4 + 1] = Math.round(positions[i * 3 + 1] * precision);
        quantized[i * 4 + 2] = Math.round(positions[i * 3 + 2] * precision);
        quantized[i * 4 + 3] = i;
        order[i] = i;
    }

    order.sort((a, b) => {
        const ax = quantized[a * 4];
        const bx = quantized[b * 4];
        if (ax !== bx) return ax - bx;

        const ay = quantized[a * 4 + 1];
        const by = quantized[b * 4 + 1];
        if (ay !== by) return ay - by;

        return quantized[a * 4 + 2] - quantized[b * 4 + 2];
    });

    let canonical = 0;
    let prevX = quantized[order[0] * 4];
    let prevY = quantized[order[0] * 4 + 1];
    let prevZ = quantized[order[0] * 4 + 2];
    remap[order[0]] = canonical;

    for (let sortedIdx = 1; sortedIdx < vertexCount; sortedIdx++) {
        const vertexIdx = order[sortedIdx];
        const x = quantized[vertexIdx * 4];
        const y = quantized[vertexIdx * 4 + 1];
        const z = quantized[vertexIdx * 4 + 2];
        if (x !== prevX || y !== prevY || z !== prevZ) {
            canonical++;
            prevX = x;
            prevY = y;
            prevZ = z;
        }
        remap[vertexIdx] = canonical;
    }

    return remap;
}

// ============================================================================
// Manifold Check
// ============================================================================

/**
 * Check manifold topology: every mesh edge should have exactly 2 adjacent faces.
 *
 * Boundary edges (1 face) indicate holes or unclosed surfaces.
 * Non-manifold edges (3+ faces) indicate self-intersections or T-junctions.
 *
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @returns ManifoldReport with edge statistics.
 */
export function checkManifold(
    indices: Uint32Array,
    idxCount: number,
): ManifoldReport {
    return checkManifoldWithRemap(indices, idxCount);
}

function checkManifoldWithRemap(
    indices: Uint32Array,
    idxCount: number,
    remap?: Uint32Array,
): ManifoldReport {
    const edgeFaceCount = new Map<bigint, number>();

    for (let t = 0; t < idxCount; t += 3) {
        const raw0 = indices[t], raw1 = indices[t + 1], raw2 = indices[t + 2];
        const i0 = remap && raw0 < remap.length ? remap[raw0] : raw0;
        const i1 = remap && raw1 < remap.length ? remap[raw1] : raw1;
        const i2 = remap && raw2 < remap.length ? remap[raw2] : raw2;
        // Skip degenerate triangles
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const e0 = edgeKey(i0, i1);
        const e1 = edgeKey(i1, i2);
        const e2 = edgeKey(i2, i0);

        edgeFaceCount.set(e0, (edgeFaceCount.get(e0) ?? 0) + 1);
        edgeFaceCount.set(e1, (edgeFaceCount.get(e1) ?? 0) + 1);
        edgeFaceCount.set(e2, (edgeFaceCount.get(e2) ?? 0) + 1);
    }

    let boundaryEdges = 0;
    let nonManifoldEdges = 0;

    for (const count of edgeFaceCount.values()) {
        if (count === 1) boundaryEdges++;
        else if (count > 2) nonManifoldEdges++;
    }

    return {
        ok: nonManifoldEdges === 0,
        nonManifoldEdges,
        boundaryEdges,
    };
}

/**
 * Check manifold topology after welding coincident geometric vertices.
 *
 * STL is triangle soup and OBJ/3MF writers may contain duplicated vertex rows
 * even when surfaces meet exactly in 3D. This check measures slicer-style
 * geometric closure instead of requiring shared vertex IDs.
 */
export function checkGeometricManifold(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    topologyWeldToleranceMm: number = DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM,
): ManifoldReport {
    if (topologyWeldToleranceMm <= 0) {
        return checkManifold(indices, idxCount);
    }

    const remap = buildGeometricVertexRemap(positions, topologyWeldToleranceMm);
    return checkManifoldWithRemap(indices, idxCount, remap);
}

function incrementCount(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map: Map<string, number>): Array<{ key: string; count: number }> {
    return Array.from(map.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function tBoundaryClass(t: number): string {
    if (t <= 1e-5) return 't0';
    if (t >= 1 - 1e-5) return 't1';
    return 'tmid';
}

function endpointClass(uvs: Float32Array, vertexIdx: number): string {
    const base = vertexIdx * 3;
    const surface = Math.round(uvs[base + 2] ?? -1);
    const t = uvs[base + 1] ?? NaN;
    return `s${surface}:${tBoundaryClass(t)}`;
}

function surfacePairKey(uvs: Float32Array, v0: number, v1: number): string {
    const s0 = Math.round(uvs[v0 * 3 + 2] ?? -1);
    const s1 = Math.round(uvs[v1 * 3 + 2] ?? -1);
    return s0 <= s1 ? `s${s0}-s${s1}` : `s${s1}-s${s0}`;
}

function endpointPairKey(uvs: Float32Array, v0: number, v1: number): string {
    const a = endpointClass(uvs, v0);
    const b = endpointClass(uvs, v1);
    return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

function summarizeBoundaryComponents(boundaryEdges: Array<[number, number]>): BoundaryEdgeDiagnostics['components'] {
    const adjacency = new Map<number, Set<number>>();
    for (const [a, b] of boundaryEdges) {
        let aNeighbors = adjacency.get(a);
        if (!aNeighbors) {
            aNeighbors = new Set<number>();
            adjacency.set(a, aNeighbors);
        }
        aNeighbors.add(b);

        let bNeighbors = adjacency.get(b);
        if (!bNeighbors) {
            bNeighbors = new Set<number>();
            adjacency.set(b, bNeighbors);
        }
        bNeighbors.add(a);
    }

    let degree1Vertices = 0;
    let degree2Vertices = 0;
    let degree3PlusVertices = 0;
    for (const neighbors of adjacency.values()) {
        if (neighbors.size === 1) degree1Vertices++;
        else if (neighbors.size === 2) degree2Vertices++;
        else if (neighbors.size >= 3) degree3PlusVertices++;
    }

    const visited = new Set<number>();
    let total = 0;
    let closedLoops = 0;
    let openChains = 0;
    let branched = 0;
    let largestEdges = 0;

    for (const start of adjacency.keys()) {
        if (visited.has(start)) continue;
        total++;
        const stack = [start];
        const vertices: number[] = [];
        let degreeSum = 0;
        let hasBranch = false;
        let endpoints = 0;

        while (stack.length > 0) {
            const v = stack.pop()!;
            if (visited.has(v)) continue;
            visited.add(v);
            vertices.push(v);

            const neighbors = adjacency.get(v);
            if (!neighbors) continue;
            degreeSum += neighbors.size;
            if (neighbors.size === 1) endpoints++;
            if (neighbors.size > 2) hasBranch = true;
            for (const n of neighbors) {
                if (!visited.has(n)) stack.push(n);
            }
        }

        const edgeCount = degreeSum / 2;
        largestEdges = Math.max(largestEdges, edgeCount);
        if (hasBranch) branched++;
        else if (vertices.length > 0 && endpoints === 0) closedLoops++;
        else openChains++;
    }

    return {
        total,
        closedLoops,
        openChains,
        branched,
        largestEdges,
        degree1Vertices,
        degree2Vertices,
        degree3PlusVertices,
    };
}

function summarizeBoundaryComponentSamples(
    boundaryEdges: Array<[number, number]>,
    uvs: Float32Array,
    maxSamples: number = 8,
): NonNullable<BoundaryEdgeDiagnostics['componentSamples']> {
    const adjacency = new Map<number, Set<number>>();
    for (const [a, b] of boundaryEdges) {
        let aNeighbors = adjacency.get(a);
        if (!aNeighbors) {
            aNeighbors = new Set<number>();
            adjacency.set(a, aNeighbors);
        }
        aNeighbors.add(b);

        let bNeighbors = adjacency.get(b);
        if (!bNeighbors) {
            bNeighbors = new Set<number>();
            adjacency.set(b, bNeighbors);
        }
        bNeighbors.add(a);
    }

    const visited = new Set<number>();
    const components: NonNullable<BoundaryEdgeDiagnostics['componentSamples']> = [];

    for (const start of adjacency.keys()) {
        if (visited.has(start)) continue;
        const stack = [start];
        const vertices: number[] = [];
        let degreeSum = 0;
        let endpoints = 0;
        let maxDegree = 0;
        let minU = Infinity, maxU = -Infinity, minT = Infinity, maxT = -Infinity;

        while (stack.length > 0) {
            const v = stack.pop()!;
            if (visited.has(v)) continue;
            visited.add(v);
            vertices.push(v);

            const base = v * 3;
            const u = uvs[base] ?? NaN;
            const t = uvs[base + 1] ?? NaN;
            if (Number.isFinite(u)) {
                minU = Math.min(minU, u);
                maxU = Math.max(maxU, u);
            }
            if (Number.isFinite(t)) {
                minT = Math.min(minT, t);
                maxT = Math.max(maxT, t);
            }

            const neighbors = adjacency.get(v);
            if (!neighbors) continue;
            const degree = neighbors.size;
            degreeSum += degree;
            maxDegree = Math.max(maxDegree, degree);
            if (degree === 1) endpoints++;
            for (const n of neighbors) {
                if (!visited.has(n)) stack.push(n);
            }
        }

        const kind = maxDegree > 2 ? 'branched' : endpoints === 0 ? 'loop' : 'chain';
        components.push({
            kind,
            edges: degreeSum / 2,
            vertices: vertices.length,
            minU: Number.isFinite(minU) ? minU : NaN,
            maxU: Number.isFinite(maxU) ? maxU : NaN,
            minT: Number.isFinite(minT) ? minT : NaN,
            maxT: Number.isFinite(maxT) ? maxT : NaN,
            maxDegree,
            sampleVertices: vertices.slice(0, 6),
        });
    }

    return components
        .sort((a, b) => b.edges - a.edges || b.maxDegree - a.maxDegree)
        .slice(0, maxSamples);
}

/**
 * Classify boundary edges after the same optional geometric weld used by
 * manifold validation. Intended for diagnosing which surface loops remain open.
 */
export function diagnoseBoundaryEdges(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    uvs?: Float32Array,
    topologyWeldToleranceMm: number = DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM,
): BoundaryEdgeDiagnostics {
    const remap = topologyWeldToleranceMm > 0
        ? buildGeometricVertexRemap(positions, topologyWeldToleranceMm)
        : undefined;
    const edgeFaceCount = new Map<bigint, number>();
    const rawEdgeFaceCount = new Map<bigint, number>();
    const rawEdgeSample = new Map<bigint, [number, number]>();

    for (let t = 0; t < idxCount; t += 3) {
        const raw0 = indices[t], raw1 = indices[t + 1], raw2 = indices[t + 2];
        const i0 = remap && raw0 < remap.length ? remap[raw0] : raw0;
        const i1 = remap && raw1 < remap.length ? remap[raw1] : raw1;
        const i2 = remap && raw2 < remap.length ? remap[raw2] : raw2;
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const edges: Array<[bigint, number, number]> = [
            [edgeKey(i0, i1), raw0, raw1],
            [edgeKey(i1, i2), raw1, raw2],
            [edgeKey(i2, i0), raw2, raw0],
        ];
        for (const [key, rawA, rawB] of edges) {
            edgeFaceCount.set(key, (edgeFaceCount.get(key) ?? 0) + 1);
            const rawKey = edgeKey(rawA, rawB);
            rawEdgeFaceCount.set(rawKey, (rawEdgeFaceCount.get(rawKey) ?? 0) + 1);
            if (!rawEdgeSample.has(key)) rawEdgeSample.set(key, [rawA, rawB]);
        }
    }

    const bySurfacePair = new Map<string, number>();
    const byEndpointClass = new Map<string, number>();
    const samplesByClass = new Map<string, BoundaryEdgeDiagnostics['samples']>();
    const boundaryEdges: Array<[number, number]> = [];
    const rawBoundaryEdges: Array<[number, number]> = [];
    let total = 0;

    for (const [key, count] of edgeFaceCount) {
        if (count !== 1) continue;
        total++;
        const raw = rawEdgeSample.get(key);
        if (raw) {
            const [raw0, raw1] = raw;
            const i0 = remap && raw0 < remap.length ? remap[raw0] : raw0;
            const i1 = remap && raw1 < remap.length ? remap[raw1] : raw1;
            boundaryEdges.push([i0, i1]);
            rawBoundaryEdges.push([raw0, raw1]);
        }
        if (!uvs || !raw) continue;
        const [v0, v1] = raw;
        incrementCount(bySurfacePair, surfacePairKey(uvs, v0, v1));
        const classKey = endpointPairKey(uvs, v0, v1);
        incrementCount(byEndpointClass, classKey);
        let classSamples = samplesByClass.get(classKey);
        if (!classSamples) {
            classSamples = [];
            samplesByClass.set(classKey, classSamples);
        }
        if (classSamples.length < 3) {
            const b0 = v0 * 3;
            const b1 = v1 * 3;
            classSamples.push({
                classKey,
                rawCount: rawEdgeFaceCount.get(edgeKey(v0, v1)) ?? 0,
                v0,
                v1,
                u0: uvs[b0],
                t0: uvs[b0 + 1],
                s0: uvs[b0 + 2],
                u1: uvs[b1],
                t1: uvs[b1 + 1],
                s1: uvs[b1 + 2],
            });
        }
    }

    const byEndpointClassSorted = sortedCounts(byEndpointClass);
    const samples: BoundaryEdgeDiagnostics['samples'] = [];
    for (const { key } of byEndpointClassSorted) {
        const classSamples = samplesByClass.get(key);
        if (!classSamples) continue;
        for (const sample of classSamples) {
            samples.push(sample);
            if (samples.length >= 8) break;
        }
        if (samples.length >= 8) break;
    }

    return {
        total,
        bySurfacePair: sortedCounts(bySurfacePair),
        byEndpointClass: byEndpointClassSorted,
        samples,
        components: summarizeBoundaryComponents(boundaryEdges),
        componentSamples: uvs ? summarizeBoundaryComponentSamples(rawBoundaryEdges, uvs) : undefined,
    };
}

export function diagnoseNonManifoldEdges(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    uvs?: Float32Array,
    topologyWeldToleranceMm: number = DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM,
): EdgeAnomalyDiagnostics {
    const remap = topologyWeldToleranceMm > 0
        ? buildGeometricVertexRemap(positions, topologyWeldToleranceMm)
        : undefined;
    const edgeFaceCount = new Map<bigint, number>();
    const rawEdgeSample = new Map<bigint, [number, number]>();
    const incidentSamples = new Map<bigint, Array<{ triOffset: number; opp: number }>>();

    for (let t = 0; t < idxCount; t += 3) {
        const raw0 = indices[t], raw1 = indices[t + 1], raw2 = indices[t + 2];
        const i0 = remap && raw0 < remap.length ? remap[raw0] : raw0;
        const i1 = remap && raw1 < remap.length ? remap[raw1] : raw1;
        const i2 = remap && raw2 < remap.length ? remap[raw2] : raw2;
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const edges: Array<[bigint, number, number, number]> = [
            [edgeKey(i0, i1), raw0, raw1, raw2],
            [edgeKey(i1, i2), raw1, raw2, raw0],
            [edgeKey(i2, i0), raw2, raw0, raw1],
        ];
        for (const [key, rawA, rawB, opp] of edges) {
            edgeFaceCount.set(key, (edgeFaceCount.get(key) ?? 0) + 1);
            if (!rawEdgeSample.has(key)) rawEdgeSample.set(key, [rawA, rawB]);
            let incidents = incidentSamples.get(key);
            if (!incidents) {
                incidents = [];
                incidentSamples.set(key, incidents);
            }
            incidents.push({ triOffset: t, opp });
        }
    }

    const byEndpointClass = new Map<string, number>();
    const samples: EdgeAnomalyDiagnostics['samples'] = [];
    let total = 0;
    for (const [key, count] of edgeFaceCount) {
        if (count <= 2) continue;
        total++;
        const raw = rawEdgeSample.get(key);
        if (!uvs || !raw) continue;
        const [v0, v1] = raw;
        const classKey = endpointPairKey(uvs, v0, v1);
        incrementCount(byEndpointClass, classKey);
        if (samples.length < 8) {
            const b0 = v0 * 3;
            const b1 = v1 * 3;
            const incidents = (incidentSamples.get(key) ?? []).map(incident => {
                const oppBase = incident.opp * 3;
                return {
                    ...incident,
                    oppU: uvs[oppBase],
                    oppT: uvs[oppBase + 1],
                    oppS: uvs[oppBase + 2],
                };
            });
            samples.push({
                classKey,
                count,
                v0,
                v1,
                u0: uvs[b0],
                t0: uvs[b0 + 1],
                s0: uvs[b0 + 2],
                u1: uvs[b1],
                t1: uvs[b1 + 1],
                s1: uvs[b1 + 2],
                incidents,
            });
        }
    }

    return {
        total,
        byEndpointClass: sortedCounts(byEndpointClass),
        samples,
    };
}

// ============================================================================
// Degenerate Check
// ============================================================================

/**
 * Check for degenerate mesh elements: zero-area triangles and collapsed edges.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param minArea - Minimum triangle area threshold (default: 1e-10).
 * @param minEdgeLen - Minimum edge length threshold (default: 1e-6).
 * @returns DegenerateReport with counts of degenerate elements.
 */
export function checkDegenerates(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    minArea: number = 1e-10,
    minEdgeLen: number = 1e-6,
): DegenerateReport {
    let zeroAreaTriangles = 0;
    const collapsedEdgesSet = new Set<bigint>();
    const minEdgeSq = minEdgeLen * minEdgeLen;

    for (let t = 0; t < idxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) {
            zeroAreaTriangles++;
            continue;
        }

        // Check triangle area via cross product magnitude
        const normal = triangleNormal(positions, i0, i1, i2);
        const area = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2) / 2;
        if (area < minArea) zeroAreaTriangles++;

        // Check edge lengths
        const e01 = edgeLengthSq(positions, i0, i1);
        const e12 = edgeLengthSq(positions, i1, i2);
        const e20 = edgeLengthSq(positions, i2, i0);

        if (e01 < minEdgeSq) collapsedEdgesSet.add(edgeKey(i0, i1));
        if (e12 < minEdgeSq) collapsedEdgesSet.add(edgeKey(i1, i2));
        if (e20 < minEdgeSq) collapsedEdgesSet.add(edgeKey(i2, i0));
    }

    return {
        ok: zeroAreaTriangles === 0 && collapsedEdgesSet.size === 0,
        zeroAreaTriangles,
        collapsedEdges: collapsedEdgesSet.size,
    };
}

// ============================================================================
// Normal Consistency Check
// ============================================================================

/**
 * Check normal consistency: adjacent triangles sharing an edge should have
 * compatible face normals (dot product > -threshold).
 *
 * Also counts triangles whose normal opposes the dominant mesh direction
 * (average normal), which suggests inverted winding.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param inconsistencyThreshold - Minimum dot product for consistency (default: -0.1).
 * @returns NormalConsistencyReport.
 */
export function checkNormals(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    inconsistencyThreshold: number = -0.1,
): NormalConsistencyReport {
    const triCount = Math.floor(idxCount / 3);
    if (triCount === 0) {
        return { ok: true, invertedTriangles: 0, inconsistentPairs: 0 };
    }

    // Compute all face normals
    const normals: Array<[number, number, number]> = [];
    for (let t = 0; t < idxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) {
            normals.push([0, 0, 0]);
            continue;
        }
        const n = triangleNormal(positions, i0, i1, i2);
        const len = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
        if (len > 1e-12) {
            normals.push([n[0] / len, n[1] / len, n[2] / len]);
        } else {
            normals.push([0, 0, 0]);
        }
    }

    // Compute dominant normal direction (average)
    let avgX = 0, avgY = 0, avgZ = 0;
    for (const n of normals) {
        avgX += n[0]; avgY += n[1]; avgZ += n[2];
    }
    const avgLen = Math.sqrt(avgX ** 2 + avgY ** 2 + avgZ ** 2);
    if (avgLen > 1e-12) {
        avgX /= avgLen; avgY /= avgLen; avgZ /= avgLen;
    }

    // Count inverted triangles (oppose dominant direction)
    // NOTE: This metric is informational only. For closed solids with
    // inner + outer surfaces, the global average normal is dominated by
    // the largest surface, causing normals on opposing surfaces (inner wall,
    // base underside) to be flagged as "inverted" — a false positive.
    // Validation gates on inconsistentPairs (local adjacent-face check) instead.
    let invertedTriangles = 0;
    for (const n of normals) {
        if (n[0] === 0 && n[1] === 0 && n[2] === 0) continue;
        const dot = n[0] * avgX + n[1] * avgY + n[2] * avgZ;
        if (dot < 0) invertedTriangles++;
    }

    // Check adjacent triangle normal consistency
    const edgeTriMap = new Map<bigint, number[]>();
    for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        const i0 = indices[base], i1 = indices[base + 1], i2 = indices[base + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        for (const ek of [edgeKey(i0, i1), edgeKey(i1, i2), edgeKey(i2, i0)]) {
            const existing = edgeTriMap.get(ek);
            if (existing) existing.push(t);
            else edgeTriMap.set(ek, [t]);
        }
    }

    let inconsistentPairs = 0;
    for (const tris of edgeTriMap.values()) {
        if (tris.length !== 2) continue;
        const [t0, t1] = tris;
        const n0 = normals[t0], n1 = normals[t1];
        if ((n0[0] === 0 && n0[1] === 0 && n0[2] === 0) ||
            (n1[0] === 0 && n1[1] === 0 && n1[2] === 0)) continue;
        const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
        if (dot < inconsistencyThreshold) inconsistentPairs++;
    }

    return {
        ok: inconsistentPairs === 0,
        invertedTriangles,
        inconsistentPairs,
    };
}

// ============================================================================
// Triangle Quality Check
// ============================================================================

/**
 * Measure per-triangle interior angles and aspect ratios.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param sliverThresholdDeg - Angle below which a triangle counts as a sliver.
 * @returns TriangleQualityReport with min angle, max aspect ratio, etc.
 */
export function checkTriangleQuality(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    sliverThresholdDeg: number = 15,
): TriangleQualityReport {
    const triCount = Math.floor(idxCount / 3);
    if (triCount === 0) {
        return {
            ok: true,
            minAngleDeg: 60, // equilateral default
            maxAspectRatio: 2,  // equilateral R/r = 2
            sliverCount: 0,
            meanAspectRatio: 2, // equilateral R/r = 2
        };
    }

    let globalMinAngle = Infinity;
    let globalMaxAR = 0;
    let arSum = 0;
    let sliverCount = 0;
    let validCount = 0;

    // Diagnostic: track top-10 worst-aspect triangles for triage. We only
    // log vertex indices + edge lengths so post-mortem analysis can answer
    // "is this triangle from chain-strip / from seam / from grid?".
    interface BadTri { aspect: number; i0: number; i1: number; i2: number; e01: number; e12: number; e20: number; }
    const worstTris: BadTri[] = [];
    const WORST_TRACK_SIZE = 10;
    const trackWorst = (aspect: number, i0: number, i1: number, i2: number, e01: number, e12: number, e20: number) => {
        if (worstTris.length < WORST_TRACK_SIZE) {
            worstTris.push({ aspect, i0, i1, i2, e01, e12, e20 });
            worstTris.sort((a, b) => b.aspect - a.aspect);
        } else if (aspect > worstTris[worstTris.length - 1].aspect) {
            worstTris[worstTris.length - 1] = { aspect, i0, i1, i2, e01, e12, e20 };
            worstTris.sort((a, b) => b.aspect - a.aspect);
        }
    };

    for (let t = 0; t < idxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) {
            sliverCount++;
            continue;
        }

        // Edge lengths squared
        const e01sq = edgeLengthSq(positions, i0, i1);
        const e12sq = edgeLengthSq(positions, i1, i2);
        const e20sq = edgeLengthSq(positions, i2, i0);

        const e01 = Math.sqrt(e01sq);
        const e12 = Math.sqrt(e12sq);
        const e20 = Math.sqrt(e20sq);

        if (e01 < 1e-12 || e12 < 1e-12 || e20 < 1e-12) {
            sliverCount++;
            continue;
        }

        // Interior angles using law of cosines
        const angles = computeTriangleAngles(e01, e12, e20);
        const minAngle = Math.min(...angles);

        if (minAngle < globalMinAngle) globalMinAngle = minAngle;
        if (minAngle < sliverThresholdDeg) sliverCount++;

        // Aspect ratio: circumradius / inradius (R/r metric).
        // Equilateral = 2.0, slivers → ∞.
        // R = abc / (4A), r = 2A / (a+b+c), so R/r = abc(a+b+c) / (8A²).
        const s = (e01 + e12 + e20) * 0.5;
        const areaSq = s * (s - e01) * (s - e12) * (s - e20);
        let ar: number;
        if (areaSq > 1e-24) {
            const area = Math.sqrt(areaSq);
            ar = (e01 * e12 * e20) / (8 * area * area) * (e01 + e12 + e20);
        } else {
            ar = Infinity;
            sliverCount++;
            trackWorst(Infinity, i0, i1, i2, e01, e12, e20);
            continue;
        }
        if (ar > globalMaxAR) globalMaxAR = ar;
        if (ar > 100) trackWorst(ar, i0, i1, i2, e01, e12, e20);
        arSum += ar;
        validCount++;
    }

    // Diagnostic: log the top 10 worst-aspect triangles so post-mortem can
    // pinpoint where slivers come from (chain-strip, seam, drain, phantom row).
    // Each line gives the three vertex indices + the three edge lengths in mm.
    // To interpret: if all three indices < gridVertexCount they're pure grid;
    // mixed indices indicate chain/phantom involvement. Two near-zero edge
    // lengths and one large = needle; one near-zero edge = pin.
    if (worstTris.length > 0 && worstTris[0].aspect > 1000) {
        console.log(`[MeshValidator] Worst-aspect triangle triage (top ${worstTris.length}):`);
        for (let i = 0; i < worstTris.length; i++) {
            const t = worstTris[i];
            console.log(
                `[MeshValidator]   #${i}: aspect=${t.aspect === Infinity ? 'Inf' : t.aspect.toExponential(3)} ` +
                `verts=[${t.i0}, ${t.i1}, ${t.i2}] ` +
                `edges=[${t.e01.toExponential(3)}, ${t.e12.toExponential(3)}, ${t.e20.toExponential(3)}] mm`,
            );
        }
    }

    if (validCount === 0) {
        return {
            ok: false,
            minAngleDeg: 0,
            maxAspectRatio: Infinity,
            sliverCount: triCount,
            meanAspectRatio: Infinity,
        };
    }

    return {
        ok: true, // Will be gated by tolerance check in validateMesh
        minAngleDeg: globalMinAngle === Infinity ? 60 : globalMinAngle,
        maxAspectRatio: globalMaxAR,
        sliverCount,
        meanAspectRatio: arSum / validCount,
    };
}

/**
 * Compute the three interior angles of a triangle given edge lengths.
 *
 * @returns Array of three angles in degrees.
 */
export function computeTriangleAngles(
    a: number, b: number, c: number,
): [number, number, number] {
    const RAD_TO_DEG = 180 / Math.PI;

    // Angle opposite to side a (between sides b and c)
    const cosA = clampCos((b * b + c * c - a * a) / (2 * b * c));
    // Angle opposite to side b (between sides a and c)
    const cosB = clampCos((a * a + c * c - b * b) / (2 * a * c));
    // Angle opposite to side c (between sides a and b)
    const cosC = clampCos((a * a + b * b - c * c) / (2 * a * b));

    return [
        Math.acos(cosA) * RAD_TO_DEG,
        Math.acos(cosB) * RAD_TO_DEG,
        Math.acos(cosC) * RAD_TO_DEG,
    ];
}

/** Clamp a cosine value to [-1, 1] to avoid NaN from floating-point drift. */
function clampCos(x: number): number {
    return Math.max(-1, Math.min(1, x));
}

// ============================================================================
// Fidelity Check (requires GPU evaluator)
// ============================================================================

/**
 * Measure geometric fidelity of the mesh against the analytic surface.
 *
 * Evaluates midpoints of all triangles on the analytic surface and measures
 * chord error (position distance) and normal error (angle difference).
 * Reports p95 and p999 percentiles.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,t,surfaceId,...] UV coordinates.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param evaluatePoints - GPU callback to evaluate surface positions from UVs.
 * @param featureChainPositions - Mesh vertex positions of feature chain vertices (optional).
 * @param featureChainRefPositions - Analytic reference positions for chain vertices (optional).
 * @returns FidelityReport with error percentiles.
 */
export async function checkFidelity(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    evaluatePoints: (uvBatch: Float32Array) => Promise<Float32Array>,
    featureChainPositions?: Float32Array,
    featureChainRefPositions?: Float32Array,
): Promise<FidelityReport> {
    const triCount = Math.floor(idxCount / 3);

    if (triCount === 0) {
        return {
            ok: true,
            p95PosErrorMm: 0,
            p999PosErrorMm: 0,
            p95NormalErrorDeg: 0,
            p999NormalErrorDeg: 0,
            maxFeatureDriftMm: 0,
        };
    }

    // Collect midpoint UVs for each valid triangle
    const midUVs: number[] = [];
    const validTriIndices: number[] = [];

    for (let t = 0; t < idxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const u0 = uvs[i0 * 3], t0 = uvs[i0 * 3 + 1], s0 = uvs[i0 * 3 + 2];
        const u1 = uvs[i1 * 3], t1 = uvs[i1 * 3 + 1];
        const u2 = uvs[i2 * 3], t2 = uvs[i2 * 3 + 1];

        // Triangle centroid in UV space
        midUVs.push((u0 + u1 + u2) / 3, (t0 + t1 + t2) / 3, s0);
        validTriIndices.push(t);
    }

    const batchCount = midUVs.length / 3;
    if (batchCount === 0) {
        return {
            ok: true,
            p95PosErrorMm: 0,
            p999PosErrorMm: 0,
            p95NormalErrorDeg: 0,
            p999NormalErrorDeg: 0,
            maxFeatureDriftMm: 0,
        };
    }

    // Evaluate analytic surface at centroids
    const uvBatch = new Float32Array(midUVs);
    const surfacePositions = await evaluatePoints(uvBatch);

    // Compute per-triangle errors
    const posErrors: number[] = [];
    const normErrors: number[] = [];

    for (let i = 0; i < batchCount; i++) {
        const triBase = validTriIndices[i];
        const i0 = indices[triBase], i1 = indices[triBase + 1], i2 = indices[triBase + 2];

        // Mesh centroid position
        const cx = (positions[i0 * 3] + positions[i1 * 3] + positions[i2 * 3]) / 3;
        const cy = (positions[i0 * 3 + 1] + positions[i1 * 3 + 1] + positions[i2 * 3 + 1]) / 3;
        const cz = (positions[i0 * 3 + 2] + positions[i1 * 3 + 2] + positions[i2 * 3 + 2]) / 3;

        // Analytic surface position at centroid UV
        const sx = surfacePositions[i * 3];
        const sy = surfacePositions[i * 3 + 1];
        const sz = surfacePositions[i * 3 + 2];

        // Position error (chord error at centroid)
        const dx = cx - sx, dy = cy - sy, dz = cz - sz;
        posErrors.push(Math.sqrt(dx * dx + dy * dy + dz * dz));

        // Normal error: angle between mesh face normal and analytic normal
        // We approximate analytic normal via mesh normal (face normal)
        // since we only have centroid positions from the evaluator
        const faceNorm = triangleNormal(positions, i0, i1, i2);
        const fnLen = Math.sqrt(faceNorm[0] ** 2 + faceNorm[1] ** 2 + faceNorm[2] ** 2);
        if (fnLen < 1e-12) {
            normErrors.push(0);
            continue;
        }

        // Approximate analytic normal: use vertex positions to estimate
        // (This is a proxy — the true analytic normal would need finite diffs)
        // For now, use the chord error direction as a rough proxy for the
        // deviation; the AdaptiveRefinement module does this more rigorously.
        // We report the inter-triangle dihedral deviation instead.
        normErrors.push(0); // Will be populated by dihedral analysis below
    }

    // Enhanced normal error: compute per-triangle dihedral deviation
    // (angle between adjacent face normals), which correlates with
    // the angular error from the analytic surface
    const edgeAdj = buildEdgeAdjacency(indices, idxCount);
    const dihedralAngles = computeDihedralAngles(positions, indices, idxCount, edgeAdj);

    // For each triangle, take the max dihedral angle to any neighbor
    const triDihedralMax = new Array<number>(triCount).fill(0);
    for (let t = 0; t < idxCount; t += 3) {
        const triIdx = t / 3;
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        for (const [, angle] of getTriangleEdgeDihedrals(t, indices, edgeAdj, dihedralAngles)) {
            if (angle > triDihedralMax[triIdx]) {
                triDihedralMax[triIdx] = angle;
            }
        }
    }

    // Replace the zero normal errors with dihedral-based estimates
    for (let i = 0; i < batchCount; i++) {
        const triIdx = validTriIndices[i] / 3;
        normErrors[i] = triDihedralMax[triIdx];
    }

    // Sort for percentile computation
    const sortedPos = [...posErrors].sort((a, b) => a - b);
    const sortedNorm = [...normErrors].sort((a, b) => a - b);

    const p95Pos = percentile(sortedPos, 95);
    const p999Pos = percentile(sortedPos, 99.9);
    const p95Norm = percentile(sortedNorm, 95);
    const p999Norm = percentile(sortedNorm, 99.9);

    // Feature drift
    let maxFeatureDrift = 0;
    if (featureChainPositions && featureChainRefPositions) {
        const chainVerts = Math.min(
            featureChainPositions.length / 3,
            featureChainRefPositions.length / 3,
        );
        for (let i = 0; i < chainVerts; i++) {
            const dx = featureChainPositions[i * 3] - featureChainRefPositions[i * 3];
            const dy = featureChainPositions[i * 3 + 1] - featureChainRefPositions[i * 3 + 1];
            const dz = featureChainPositions[i * 3 + 2] - featureChainRefPositions[i * 3 + 2];
            const drift = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (drift > maxFeatureDrift) maxFeatureDrift = drift;
        }
    }

    return {
        ok: true, // Gated in validateMesh
        p95PosErrorMm: p95Pos,
        p999PosErrorMm: p999Pos,
        p95NormalErrorDeg: p95Norm,
        p999NormalErrorDeg: p999Norm,
        maxFeatureDriftMm: maxFeatureDrift,
    };
}

/**
 * Compute dihedral angles for all interior edges.
 *
 * @returns Map from edge key to dihedral angle in degrees.
 */
function computeDihedralAngles(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    edgeAdj: Map<bigint, number[]>,
): Map<bigint, number> {
    const triCount = Math.floor(idxCount / 3);

    // Precompute face normals
    const faceNormals: Array<[number, number, number]> = [];
    for (let t = 0; t < idxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) {
            faceNormals.push([0, 0, 0]);
            continue;
        }
        const n = triangleNormal(positions, i0, i1, i2);
        const len = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
        if (len > 1e-12) {
            faceNormals.push([n[0] / len, n[1] / len, n[2] / len]);
        } else {
            faceNormals.push([0, 0, 0]);
        }
    }

    const result = new Map<bigint, number>();

    for (const [ek, tris] of edgeAdj) {
        if (tris.length !== 2) continue;
        // buildEdgeAdjacency stores raw index offsets (0,3,6,...); divide by 3 for array index
        const ti0 = tris[0] / 3;
        const ti1 = tris[1] / 3;
        const n0 = faceNormals[ti0];
        const n1 = faceNormals[ti1];

        if (!n0 || !n1 ||
            (n0[0] === 0 && n0[1] === 0 && n0[2] === 0) ||
            (n1[0] === 0 && n1[1] === 0 && n1[2] === 0)) {
            result.set(ek, 0);
            continue;
        }

        const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
        const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
        result.set(ek, angle);
    }

    return result;
}

/**
 * Get dihedral angles for edges of a specific triangle.
 */
function getTriangleEdgeDihedrals(
    triOffset: number,
    indices: Uint32Array,
    edgeAdj: Map<bigint, number[]>,
    dihedralAngles: Map<bigint, number>,
): Array<[bigint, number]> {
    const i0 = indices[triOffset], i1 = indices[triOffset + 1], i2 = indices[triOffset + 2];
    const edges = [edgeKey(i0, i1), edgeKey(i1, i2), edgeKey(i2, i0)];
    const result: Array<[bigint, number]> = [];

    for (const ek of edges) {
        const angle = dihedralAngles.get(ek);
        if (angle !== undefined) result.push([ek, angle]);
    }

    return result;
}

// ============================================================================
// CPU-Only Fidelity Check (no GPU evaluator)
// ============================================================================

/**
 * Measure geometric fidelity using CPU-only dihedral analysis.
 *
 * This is a lighter version of {@link checkFidelity} that doesn't require
 * a GPU evaluator. It uses dihedral angles as a proxy for surface error.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param featureChainPositions - Feature chain mesh positions (optional).
 * @param featureChainRefPositions - Feature chain reference positions (optional).
 * @returns FidelityReport with dihedral-based estimates.
 */
export function checkFidelityCPU(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    featureChainPositions?: Float32Array,
    featureChainRefPositions?: Float32Array,
): FidelityReport {
    const triCount = Math.floor(idxCount / 3);

    if (triCount === 0) {
        return {
            ok: true,
            p95PosErrorMm: 0,
            p999PosErrorMm: 0,
            p95NormalErrorDeg: 0,
            p999NormalErrorDeg: 0,
            maxFeatureDriftMm: 0,
        };
    }

    const edgeAdj = buildEdgeAdjacency(indices, idxCount);
    const dihedralAngles = computeDihedralAngles(positions, indices, idxCount, edgeAdj);

    // Use dihedral angles for normal error estimation
    const dihedralValues = [...dihedralAngles.values()].sort((a, b) => a - b);

    // Estimate position error from dihedral angles using the chord error bound:
    // For an edge of length L subtending angle θ, chord error ≈ L²θ / 8
    const posErrors: number[] = [];
    for (const [ek, angle] of dihedralAngles) {
        // Decode bigint key: ek = min(a,b) * 0x200000 + max(a,b)
        const a = Number(ek / 0x200000n);
        const b = Number(ek % 0x200000n);
        const lenSq = edgeLengthSq(positions, a, b);
        const theta = angle * Math.PI / 180;
        const len = Math.sqrt(lenSq);
        const chordErr = len * theta / 8; // L·θ/8 chord error bound
        posErrors.push(chordErr);
    }
    const sortedPos = posErrors.sort((a, b) => a - b);

    // Feature drift
    let maxFeatureDrift = 0;
    if (featureChainPositions && featureChainRefPositions) {
        const chainVerts = Math.min(
            featureChainPositions.length / 3,
            featureChainRefPositions.length / 3,
        );
        for (let i = 0; i < chainVerts; i++) {
            const dx = featureChainPositions[i * 3] - featureChainRefPositions[i * 3];
            const dy = featureChainPositions[i * 3 + 1] - featureChainRefPositions[i * 3 + 1];
            const dz = featureChainPositions[i * 3 + 2] - featureChainRefPositions[i * 3 + 2];
            const drift = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (drift > maxFeatureDrift) maxFeatureDrift = drift;
        }
    }

    return {
        ok: true,
        p95PosErrorMm: sortedPos.length > 0 ? percentile(sortedPos, 95) : 0,
        p999PosErrorMm: sortedPos.length > 0 ? percentile(sortedPos, 99.9) : 0,
        p95NormalErrorDeg: dihedralValues.length > 0 ? percentile(dihedralValues, 95) : 0,
        p999NormalErrorDeg: dihedralValues.length > 0 ? percentile(dihedralValues, 99.9) : 0,
        maxFeatureDriftMm: maxFeatureDrift,
    };
}

// ============================================================================
// Seam Continuity Check
// ============================================================================

/**
 * Check seam continuity for the outer wall grid.
 *
 * Delegates to SeamTopology for position and normal gap measurement.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer wall indices.
 * @param numU - Number of U columns in the grid.
 * @param numT - Number of T rows in the grid.
 * @param config - Seam tolerance thresholds.
 * @returns SeamReport with max gaps and pass/fail.
 */
export function checkSeam(
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    numU: number,
    numT: number,
    config?: SeamValidationConfig,
): SeamReport {
    const seamConfig = config ?? seamConfigForProfile('standard');
    const pairs = identifySeamPairs(numU, numT);

    if (pairs.length === 0) {
        return { ok: true, maxPositionDiscontinuityMm: 0, maxNormalDiscontinuityDeg: 0 };
    }

    let maxPosGap = 0;
    let maxNormGap = 0;

    for (const pair of pairs) {
        const posGap = measurePositionGap(positions, pair);
        const normGap = estimateNormalGapFromFaces(positions, indices, outerIdxCount, pair);
        if (posGap > maxPosGap) maxPosGap = posGap;
        if (normGap > maxNormGap) maxNormGap = normGap;
    }

    const posOk = maxPosGap <= seamConfig.maxPositionGapMm;
    const normOk = maxNormGap <= seamConfig.maxNormalGapDeg;

    return {
        ok: posOk && normOk,
        maxPositionDiscontinuityMm: maxPosGap,
        maxNormalDiscontinuityDeg: maxNormGap,
    };
}

// ============================================================================
// Wall Thickness Check
// ============================================================================

/**
 * Check minimum wall thickness by measuring outer-to-inner vertex distances.
 *
 * For each outer wall vertex, finds the closest inner wall vertex and
 * reports the minimum distance.
 *
 * @param outerPositions - Outer wall vertex positions [x,y,z,...].
 * @param innerPositions - Inner wall vertex positions [x,y,z,...].
 * @param minThicknessMm - Minimum acceptable thickness in mm (default: 0.8 SLA).
 * @returns WallThicknessReport.
 */
export function checkWallThickness(
    outerPositions: Float32Array,
    innerPositions: Float32Array,
    minThicknessMm: number = 0.8,
): WallThicknessReport {
    const outerCount = outerPositions.length / 3;
    const innerCount = innerPositions.length / 3;

    if (outerCount === 0 || innerCount === 0) {
        return { ok: true, minThicknessMm: Infinity, thinSpots: 0 };
    }

    let minThickness = Infinity;
    let thinSpots = 0;

    // For each outer vertex, find nearest inner vertex
    // (brute force — for production, use spatial hash or k-d tree)
    for (let o = 0; o < outerCount; o++) {
        const ox = outerPositions[o * 3];
        const oy = outerPositions[o * 3 + 1];
        const oz = outerPositions[o * 3 + 2];

        let minDistSq = Infinity;
        for (let i = 0; i < innerCount; i++) {
            const dx = ox - innerPositions[i * 3];
            const dy = oy - innerPositions[i * 3 + 1];
            const dz = oz - innerPositions[i * 3 + 2];
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < minDistSq) minDistSq = distSq;
        }

        const dist = Math.sqrt(minDistSq);
        if (dist < minThickness) minThickness = dist;
        if (dist < minThicknessMm) thinSpots++;
    }

    return {
        ok: minThickness >= minThicknessMm,
        minThicknessMm: minThickness,
        thinSpots,
    };
}

// ============================================================================
// Distortion Check (UV Metric)
// ============================================================================

/**
 * Check UV metric distortion across all triangles.
 *
 * Computes the per-triangle anisotropy ratio (σ₁/σ₂) from the first
 * fundamental form and reports p95, p999, and mean values.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param gates - Optional distortion thresholds for pass/fail gating.
 * @returns DistortionReport with stretch ratio statistics.
 */
export function checkDistortionMetric(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    gates?: DistortionGates,
): DistortionReport {
    const d = computeDistortion(positions, uvs, indices, idxCount);

    const ok = gates
        ? d.p95Anisotropy <= gates.maxP95StretchRatio &&
        (d.triangleCount >= 1000
            ? d.maxAnisotropy <= gates.maxP999StretchRatio * 1.5  // p999 proxy for small meshes
            : true)
        : true;

    return {
        ok,
        p95StretchRatio: d.p95Anisotropy,
        p999StretchRatio: d.maxAnisotropy,  // For small meshes, max ≈ p999
        meanStretchRatio: d.meanAnisotropy,
        triangleCount: d.triangleCount,
    };
}

// ============================================================================
// Edge-Length Distribution Check
// ============================================================================

/**
 * Check the distribution of 3D edge lengths across the mesh.
 *
 * A well-behaved mesh should have relatively uniform edge lengths.
 * Large variation indicates uneven tessellation that metric-aware
 * refinement should improve.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @returns EdgeLengthReport with distribution statistics.
 */
export function checkEdgeLengthDistribution(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
): EdgeLengthReport {
    const stats = edgeLengthStats(positions, indices, idxCount);

    return {
        ok: true, // No hard gates; used for monitoring
        p95Mm: stats.p95,
        p999Mm: stats.max, // max ≈ p999 for moderate meshes
        meanMm: stats.mean,
        coeffOfVariation: stats.mean > 0 ? stats.stddev / stats.mean : 0,
        edgeCount: stats.count,
    };
}

// ============================================================================
// Distortion Gate Presets
// ============================================================================

/**
 * Get distortion tolerance gates for a named quality profile.
 *
 * @param profileName - Quality profile name.
 * @returns DistortionGates thresholds.
 */
export function distortionGatesForProfile(profileName: QualityProfileName): DistortionGates {
    switch (profileName) {
        case 'high':
            return { maxP95StretchRatio: 1.8, maxP999StretchRatio: 3.0 };
        case 'ultra':
            return { maxP95StretchRatio: 1.5, maxP999StretchRatio: 2.5 };
        default:
            // draft/standard: no distortion gating
            return { maxP95StretchRatio: Infinity, maxP999StretchRatio: Infinity };
    }
}

// ============================================================================
// Main Validation Entry Point
// ============================================================================

/**
 * Run comprehensive mesh validation.
 *
 * Executes all enabled checks and returns a complete ValidationReport.
 * Checks are tolerance-gated using the QualityProfiles system.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param config - Validation configuration.
 * @returns Complete validation report.
 */
export function validateMesh(
    positions: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    config: ValidateConfig,
): ValidationReport {
    const warnings: string[] = [];

    // 1. Manifold check
    const manifold = checkGeometricManifold(
        positions,
        indices,
        idxCount,
        config.topologyWeldToleranceMm ?? DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM,
    );
    if (!manifold.ok) {
        warnings.push(`${manifold.nonManifoldEdges} non-manifold edges detected`);
        if (config.uvs) {
            const nonManifoldDiag = diagnoseNonManifoldEdges(
                positions,
                indices,
                idxCount,
                config.uvs,
                config.topologyWeldToleranceMm ?? DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM,
            );
            const classes = nonManifoldDiag.byEndpointClass
                .slice(0, 8)
                .map(({ key, count }) => `${key}:${count}`)
                .join(', ');
            const samples = nonManifoldDiag.samples
                .slice(0, 8)
                .map(s => {
                    const incidents = (s.incidents ?? [])
                        .map(i => `@${i.triOffset}:opp=${i.opp}[s${Math.round(i.oppS ?? -1)} t=${(i.oppT ?? 0).toFixed(5)} u=${(i.oppU ?? 0).toFixed(5)}]`)
                        .join('|');
                    return `${s.classKey ?? 'edge'} count=${s.count} ${s.v0}->${s.v1} [s${Math.round(s.s0)} t=${s.t0.toFixed(5)} u=${s.u0.toFixed(5)} | s${Math.round(s.s1)} t=${s.t1.toFixed(5)} u=${s.u1.toFixed(5)}] incidents=${incidents || 'n/a'}`;
                })
                .join('; ');
            console.warn(`[MeshValidator] Non-manifold diagnostics: total=${nonManifoldDiag.total}, classes=${classes || 'n/a'}, samples=${samples || 'n/a'}`);
        }
    }
    if (manifold.boundaryEdges > 0) {
        warnings.push(`${manifold.boundaryEdges} boundary edges (mesh not closed)`);
        if (config.uvs) {
            const boundaryDiag = diagnoseBoundaryEdges(
                positions,
                indices,
                idxCount,
                config.uvs,
                config.topologyWeldToleranceMm ?? DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM,
            );
            const classes = boundaryDiag.byEndpointClass
                .slice(0, 8)
                .map(({ key, count }) => `${key}:${count}`)
                .join(', ');
            const samples = boundaryDiag.samples
                .slice(0, 8)
                .map(s => `${s.classKey ?? 'edge'} raw=${s.rawCount ?? '?'} ${s.v0}->${s.v1} [s${Math.round(s.s0)} t=${s.t0.toFixed(5)} u=${s.u0.toFixed(5)} | s${Math.round(s.s1)} t=${s.t1.toFixed(5)} u=${s.u1.toFixed(5)}]`)
                .join('; ');
            const c = boundaryDiag.components;
            const componentSamples = (boundaryDiag.componentSamples ?? [])
                .slice(0, 8)
                .map(sample =>
                    `${sample.kind}:edges=${sample.edges},verts=${sample.vertices},deg=${sample.maxDegree},` +
                    `u=${sample.minU.toFixed(5)}..${sample.maxU.toFixed(5)},` +
                    `t=${sample.minT.toFixed(5)}..${sample.maxT.toFixed(5)},` +
                    `v=${sample.sampleVertices.join('/')}`,
                )
                .join('; ');
            console.warn(
                `[MeshValidator] Boundary diagnostics: total=${boundaryDiag.total}, ` +
                `classes=${classes || 'n/a'}, ` +
                `components=${c.total} (loops=${c.closedLoops}, chains=${c.openChains}, ` +
                `branched=${c.branched}, largest=${c.largestEdges}, ` +
                `deg1=${c.degree1Vertices}, deg2=${c.degree2Vertices}, deg3+=${c.degree3PlusVertices}), ` +
                `samples=${samples || 'n/a'}, componentSamples=${componentSamples || 'n/a'}`,
            );
        }
    }

    // 2. Degenerate check
    const degenerates = checkDegenerates(
        positions, indices, idxCount,
        config.minTriangleArea ?? 1e-10,
        config.minEdgeLength ?? 1e-6,
    );
    if (!degenerates.ok) {
        warnings.push(
            `${degenerates.zeroAreaTriangles} zero-area triangles, ` +
            `${degenerates.collapsedEdges} collapsed edges`,
        );
    }

    // 3. Normal consistency
    const normals = checkNormals(positions, indices, idxCount);
    if (!normals.ok) {
        warnings.push(
            `${normals.inconsistentPairs} inconsistent normal pairs` +
            (normals.invertedTriangles > 0
                ? ` (${normals.invertedTriangles} inverted triangles — includes inner wall, expected for closed solids)`
                : ''),
        );
    }

    // 4. Triangle quality
    const triangleQuality = checkTriangleQuality(
        positions, indices, idxCount,
        config.tolerances.minTriangleAngleDeg,
    );
    const draftProfile = config.profileName === 'draft';
    const tqOk = triangleQuality.minAngleDeg >= config.tolerances.minTriangleAngleDeg &&
        triangleQuality.maxAspectRatio <= config.tolerances.maxAspectRatio;
    triangleQuality.ok = tqOk;
    if (!tqOk) {
        if (triangleQuality.minAngleDeg < config.tolerances.minTriangleAngleDeg) {
            warnings.push(
                `Min angle ${triangleQuality.minAngleDeg.toFixed(1)}° < ` +
                `threshold ${config.tolerances.minTriangleAngleDeg}°`,
            );
        }
        if (triangleQuality.maxAspectRatio > config.tolerances.maxAspectRatio) {
            warnings.push(
                `Max aspect ratio ${triangleQuality.maxAspectRatio.toFixed(1)} > ` +
                `threshold ${config.tolerances.maxAspectRatio}`,
            );
        }
    }

    // 5. CPU fidelity check (always available)
    const fidelity = checkFidelityCPU(
        positions, indices, idxCount,
        config.featureChainPositions,
        config.featureChainReferencePositions,
    );
    const fidOk = fidelity.p999PosErrorMm <= config.tolerances.epsPosMm &&
        fidelity.p999NormalErrorDeg <= config.tolerances.epsNormalDeg &&
        fidelity.maxFeatureDriftMm <= config.tolerances.epsFeatureMm;
    fidelity.ok = fidOk;
    if (!fidOk) {
        warnings.push(
            `Fidelity: p999 pos ${fidelity.p999PosErrorMm.toFixed(4)}mm, ` +
            `p999 norm ${fidelity.p999NormalErrorDeg.toFixed(1)}°, ` +
            `max drift ${fidelity.maxFeatureDriftMm.toFixed(4)}mm`,
        );
    }

    // 6. Seam continuity (if grid dimensions provided)
    let seam: SeamReport | undefined;
    if (config.numU !== undefined && config.numT !== undefined) {
        const seamCfg = config.profileName
            ? seamConfigForProfile(config.profileName)
            : undefined;
        seam = checkSeam(
            positions, indices,
            config.outerIdxCount ?? idxCount,
            config.numU, config.numT,
            seamCfg,
        );
        if (!seam.ok) {
            warnings.push(
                `Seam: pos gap ${seam.maxPositionDiscontinuityMm.toFixed(3)}mm, ` +
                `norm gap ${seam.maxNormalDiscontinuityDeg.toFixed(1)}°`,
            );
        }
    }

    // 7. Wall thickness (if inner positions provided)
    let wallThickness: WallThicknessReport | undefined;
    if (config.innerPositions) {
        wallThickness = checkWallThickness(
            positions, config.innerPositions,
            config.minWallThicknessMm ?? 0.8,
        );
        if (!wallThickness.ok) {
            warnings.push(
                `Wall thickness: min ${wallThickness.minThicknessMm.toFixed(3)}mm, ` +
                `${wallThickness.thinSpots} thin spots`,
            );
        }
    }

    // 8. UV metric distortion (if UVs provided)
    let distortion: DistortionReport | undefined;
    if (config.uvs) {
        distortion = checkDistortionMetric(
            positions, config.uvs, indices, idxCount,
            config.distortionGates,
        );
        if (!distortion.ok) {
            warnings.push(
                `Distortion: p95 stretch ${distortion.p95StretchRatio.toFixed(2)}, ` +
                `p999 stretch ${distortion.p999StretchRatio.toFixed(2)}`,
            );
        }
    }

    // 9. Edge-length distribution (always available)
    const edgeLength = checkEdgeLengthDistribution(positions, indices, idxCount);

    // Overall validity
    const valid =
        manifold.ok &&
        manifold.boundaryEdges === 0 &&
        degenerates.ok &&
        (draftProfile || normals.ok) &&
        (draftProfile || tqOk) &&
        (draftProfile || fidOk) &&
        (seam?.ok ?? true) &&
        (wallThickness?.ok ?? true) &&
        (distortion?.ok ?? true);

    return {
        valid,
        manifold,
        degenerates,
        normals,
        fidelity,
        triangleQuality,
        seam,
        wallThickness,
        distortion,
        edgeLength,
        warnings,
    };
}

/**
 * Run comprehensive mesh validation with GPU-based fidelity checking.
 *
 * Like {@link validateMesh} but uses the GPU evaluator for more accurate
 * chord error measurement.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,t,surfaceId,...] UV coordinates.
 * @param indices - Triangle index buffer.
 * @param idxCount - Number of indices to check.
 * @param config - Validation configuration.
 * @param evaluatePoints - GPU callback to evaluate surface positions.
 * @returns Complete validation report with GPU fidelity.
 */
export async function validateMeshGPU(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    idxCount: number,
    config: ValidateConfig,
    evaluatePoints: (uvBatch: Float32Array) => Promise<Float32Array>,
): Promise<ValidationReport> {
    // Run the CPU validation first
    const report = validateMesh(positions, indices, idxCount, config);

    // Replace fidelity with GPU-based version
    const gpuFidelity = await checkFidelity(
        positions, uvs, indices, idxCount, evaluatePoints,
        config.featureChainPositions,
        config.featureChainReferencePositions,
    );
    const fidOk = gpuFidelity.p999PosErrorMm <= config.tolerances.epsPosMm &&
        gpuFidelity.p999NormalErrorDeg <= config.tolerances.epsNormalDeg &&
        gpuFidelity.maxFeatureDriftMm <= config.tolerances.epsFeatureMm;
    gpuFidelity.ok = fidOk;

    report.fidelity = gpuFidelity;

    // Recalculate overall validity
    report.valid =
        report.manifold.ok &&
        report.manifold.boundaryEdges === 0 &&
        report.degenerates.ok &&
        (config.profileName === 'draft' || report.normals.ok) &&
        (config.profileName === 'draft' || report.triangleQuality.ok) &&
        (config.profileName === 'draft' || fidOk) &&
        (report.seam?.ok ?? true) &&
        (report.wallThickness?.ok ?? true) &&
        (report.distortion?.ok ?? true);

    // Update fidelity warning
    if (!fidOk) {
        // Remove old CPU fidelity warning and add GPU one
        const idx = report.warnings.findIndex(w => w.startsWith('Fidelity:'));
        const gpuWarning =
            `Fidelity (GPU): p999 pos ${gpuFidelity.p999PosErrorMm.toFixed(4)}mm, ` +
            `p999 norm ${gpuFidelity.p999NormalErrorDeg.toFixed(1)}°, ` +
            `max drift ${gpuFidelity.maxFeatureDriftMm.toFixed(4)}mm`;
        if (idx >= 0) report.warnings[idx] = gpuWarning;
        else report.warnings.push(gpuWarning);
    }

    return report;
}

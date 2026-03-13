/**
 * debug_stitch.ts - Comprehensive Per-Surface Mesh Topology Audit
 * 
 * Validates every surface in the generated pot mesh for:
 * - Seam periodicity (zero vertices at u=1.0)
 * - Degenerate triangles (zero area)
 * - Non-manifold edges
 * - Flipped/inconsistent winding
 * - Vertex range validity
 */

import { ConstrainedTriangulator, FeaturePoint } from './ConstrainedTriangulator';

// ============================================================================
// Surface ID Map
// ============================================================================
const SURFACE_NAMES: Record<number, string> = {
    0: 'Outer Wall (CDT)',
    1: 'Inner Wall (Grid)',
    2: 'Rim (Grid)',
    3: 'Bottom Under (Grid)',
    4: 'Bottom Top (Grid)',
    5: 'Drain (Grid)',
};

// ============================================================================
// Mesh Analysis Utilities
// ============================================================================

interface SurfaceStats {
    name: string;
    id: number;
    vertexCount: number;
    triangleCount: number;
    seamVertices: number;        // Vertices at u ≈ 1.0 (should be 0)
    degenerateTriangles: number; // Zero-area triangles
    flippedTriangles: number;    // Inconsistent winding (negative signed area in UV)
    wrappingTriangles: number;   // Seam-wrapping: expected in periodic topology
    nonManifoldEdges: number;    // Edges shared by >2 triangles
    boundaryEdges: number;       // Edges shared by exactly 1 triangle (seam or hole)
    minArea: number;
    maxArea: number;
    avgArea: number;
    uRange: [number, number];
    tRange: [number, number];
}

function analyzeSurface(
    vertices: Float32Array,
    indices: Uint32Array,
    surfaceId: number
): SurfaceStats {
    const name = SURFACE_NAMES[surfaceId] ?? `Unknown (${surfaceId})`;

    // 1. Collect vertices and triangles for this surface
    const surfVerts: number[] = [];  // flat [u, t, surfId, ...]
    const surfVertMap = new Map<number, number>(); // global index -> local index
    const surfTris: number[][] = [];

    // First pass: find vertices belonging to this surface
    for (let i = 0; i < vertices.length; i += 3) {
        const z = vertices[i + 2];
        if (Math.round(z) === surfaceId) {
            surfVertMap.set(i / 3, surfVerts.length / 3);
            surfVerts.push(vertices[i], vertices[i + 1], vertices[i + 2]);
        }
    }

    // Second pass: find triangles using these vertices
    for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
        if (surfVertMap.has(i0) && surfVertMap.has(i1) && surfVertMap.has(i2)) {
            surfTris.push([
                surfVertMap.get(i0)!,
                surfVertMap.get(i1)!,
                surfVertMap.get(i2)!,
            ]);
        }
    }

    const vCount = surfVerts.length / 3;
    const tCount = surfTris.length;

    // 2. Seam check: vertices at u ≈ 1.0
    let seamVertices = 0;
    let uMin = Infinity, uMax = -Infinity;
    let tMin = Infinity, tMax = -Infinity;

    for (let i = 0; i < surfVerts.length; i += 3) {
        const u = surfVerts[i];
        const t = surfVerts[i + 1];
        if (Math.abs(u - 1.0) < 1e-3) seamVertices++;
        uMin = Math.min(uMin, u);
        uMax = Math.max(uMax, u);
        tMin = Math.min(tMin, t);
        tMax = Math.max(tMax, t);
    }

    // 3. Triangle quality analysis
    let degenerateTriangles = 0;
    let flippedTriangles = 0;
    let wrappingTriangles = 0;
    let minArea = Infinity, maxArea = 0, totalArea = 0;

    for (const [a, b, c] of surfTris) {
        const ax = surfVerts[a * 3], ay = surfVerts[a * 3 + 1];
        const bx = surfVerts[b * 3], by = surfVerts[b * 3 + 1];
        const cx = surfVerts[c * 3], cy = surfVerts[c * 3 + 1];

        // Signed area (positive = CCW, negative = CW)
        const signedArea = 0.5 * ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
        const area = Math.abs(signedArea);

        // Detect seam-wrapping triangles: any vertex pair with |Δu| > 0.5
        const isWrapping = Math.abs(bx - ax) > 0.5 || Math.abs(cx - ax) > 0.5 || Math.abs(cx - bx) > 0.5;

        if (area < 1e-12) {
            degenerateTriangles++;
        } else if (isWrapping) {
            // Seam-wrapping triangles have inverted UV signed area by design.
            // They are expected in periodic topology and are NOT errors.
            wrappingTriangles++;
        } else {
            // For outer wall (surface 0), expect CCW. For inverted surfaces (1,3,5), expect CW.
            const expectCW = (surfaceId === 1 || surfaceId === 3 || surfaceId === 5);
            if (expectCW && signedArea > 0) flippedTriangles++;
            if (!expectCW && signedArea < 0) flippedTriangles++;
        }

        minArea = Math.min(minArea, area);
        maxArea = Math.max(maxArea, area);
        totalArea += area;
    }

    // 4. Edge manifold analysis
    const edgeMap = new Map<string, number>();
    const edgeKey = (a: number, b: number) => `${Math.min(a, b)}_${Math.max(a, b)}`;

    for (const [a, b, c] of surfTris) {
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            const key = edgeKey(p, q);
            edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
        }
    }

    let nonManifoldEdges = 0;
    let boundaryEdges = 0;
    for (const count of edgeMap.values()) {
        if (count > 2) nonManifoldEdges++;
        if (count === 1) boundaryEdges++;
    }

    return {
        name,
        id: surfaceId,
        vertexCount: vCount,
        triangleCount: tCount,
        seamVertices,
        degenerateTriangles,
        flippedTriangles,
        wrappingTriangles,
        nonManifoldEdges,
        boundaryEdges,
        minArea: tCount > 0 ? minArea : 0,
        maxArea,
        avgArea: tCount > 0 ? totalArea / tCount : 0,
        uRange: [uMin === Infinity ? 0 : uMin, uMax === -Infinity ? 0 : uMax],
        tRange: [tMin === Infinity ? 0 : tMin, tMax === -Infinity ? 0 : tMax],
    };
}

// ============================================================================
// Main Test Runner
// ============================================================================

const getDimsForAR = (ar: number) => {
    const R = ar / (2 * Math.PI);
    return {
        H: 1.0,
        Rt: R,
        Rb: R,
        tWall: 0.05,
        tBottom: 0.05,
        rDrain: 0.0,
        expn: 1.0,
        scaleW: R * 2 * Math.PI,
        scaleH: 1.0
    };
};

const runAudit = () => {
    const testCases = [
        { ar: 0.5, label: 'Tall pot (AR=0.5)' },
        { ar: 1.0, label: 'Square pot (AR=1.0)' },
        { ar: 3.0, label: 'Wide pot (AR=3.0)' },
    ];

    for (const { ar, label } of testCases) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`  AUDIT: ${label}`);
        console.log(`${'='.repeat(70)}`);

        const dims = getDimsForAR(ar);

        const features: FeaturePoint[] = [
            { strength: 1, type: 0, theta: (ar * 0.5) * (Math.PI * 2), t: 0.1 },
            { strength: 1, type: 0, theta: (ar * 0.5) * (Math.PI * 2), t: 0.9 }
        ];

        console.time('generateFullPot');
        const mesh = ConstrainedTriangulator.generateFullPot(features, dims, undefined, 64);
        console.timeEnd('generateFullPot');

        console.log(`Total: ${mesh.vertices.length / 3} vertices, ${mesh.indices.length / 3} triangles`);

        // Analyze each surface
        let totalIssues = 0;
        for (let surfId = 0; surfId <= 5; surfId++) {
            const stats = analyzeSurface(mesh.vertices, mesh.indices, surfId);

            if (stats.vertexCount === 0) continue; // Skip empty surfaces

            const issues: string[] = [];
            if (stats.seamVertices > 0) issues.push(`${stats.seamVertices} seam verts at u=1.0`);
            if (stats.degenerateTriangles > 0) issues.push(`${stats.degenerateTriangles} degenerate tris`);
            if (stats.flippedTriangles > 0) issues.push(`${stats.flippedTriangles} flipped tris`);
            if (stats.nonManifoldEdges > 0) issues.push(`${stats.nonManifoldEdges} non-manifold edges`);

            const status = issues.length === 0 ? '✓ PASS' : '✗ FAIL';
            totalIssues += issues.length;

            console.log(`\n  [${status}] Surface ${surfId}: ${stats.name}`);
            console.log(`    Vertices: ${stats.vertexCount}, Triangles: ${stats.triangleCount}`);
            console.log(`    U Range: [${stats.uRange[0].toFixed(6)}, ${stats.uRange[1].toFixed(6)}]`);
            console.log(`    T Range: [${stats.tRange[0].toFixed(6)}, ${stats.tRange[1].toFixed(6)}]`);
            console.log(`    Boundary Edges: ${stats.boundaryEdges}`);
            console.log(`    Wrapping Tris: ${stats.wrappingTriangles} (expected in periodic topology)`);
            console.log(`    Area: min=${stats.minArea.toExponential(3)}, max=${stats.maxArea.toExponential(3)}, avg=${stats.avgArea.toExponential(3)}`);

            if (issues.length > 0) {
                console.log(`    ISSUES: ${issues.join(', ')}`);
            }
        }

        console.log(`\n  TOTAL ISSUES: ${totalIssues}`);
    }
};

runAudit();

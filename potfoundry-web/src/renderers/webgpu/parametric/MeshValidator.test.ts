/**
 * Tests for MeshValidator — comprehensive geometric QA for parametric export meshes.
 *
 * Covers:
 * - Manifold topology detection (closed mesh, boundary, non-manifold)
 * - Degenerate element detection (zero-area, collapsed edges)
 * - Normal consistency checking (inverted, inconsistent)
 * - Triangle quality metrics (min angle, aspect ratio, slivers)
 * - CPU fidelity estimation (chord error proxy, normal error proxy)
 * - Seam continuity checking
 * - Wall thickness checking
 * - Full validateMesh integration with tolerance gating
 */

import { describe, it, expect } from 'vitest';
import {
    checkManifold,
    checkGeometricManifold,
    diagnoseBoundaryEdges,
    diagnoseNonManifoldEdges,
    checkDegenerates,
    checkNormals,
    checkTriangleQuality,
    computeTriangleAngles,
    checkFidelityCPU,
    checkSeam,
    checkWallThickness,
    checkDistortionMetric,
    checkEdgeLengthDistribution,
    distortionGatesForProfile,
    validateMesh,
    checkFidelity,
} from './MeshValidator';
import type {
    ManifoldReport,
    DegenerateReport,
    NormalConsistencyReport,
    TriangleQualityReport,
    FidelityReport,
    SeamReport,
    WallThicknessReport,
    ValidationReport,
    ValidateConfig,
} from './MeshValidator';
import type { ExportTolerances } from './types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Build a simple tetrahedron mesh (4 vertices, 4 triangles).
 * This is the minimum closed manifold mesh.
 */
function makeTetrahedron(): { positions: Float32Array; indices: Uint32Array } {
    const positions = new Float32Array([
        0, 0, 0,       // v0
        1, 0, 0,       // v1
        0.5, 1, 0,     // v2
        0.5, 0.5, 1,   // v3
    ]);
    // Winding: all outward normals
    const indices = new Uint32Array([
        0, 2, 1,  // bottom
        0, 1, 3,  // front
        1, 2, 3,  // right
        2, 0, 3,  // left
    ]);
    return { positions, indices };
}

function makeDuplicatedTetrahedron(): { positions: Float32Array; indices: Uint32Array } {
    const coords = [
        [0, 0, 0],
        [1, 0, 0],
        [0.5, 1, 0],
        [0.5, 0.5, 1],
    ] as const;
    const faces = [
        [0, 2, 1],
        [0, 1, 3],
        [1, 2, 3],
        [2, 0, 3],
    ] as const;
    const positions: number[] = [];
    const indices: number[] = [];

    for (const face of faces) {
        for (const src of face) {
            positions.push(coords[src][0], coords[src][1], coords[src][2]);
            indices.push(indices.length);
        }
    }

    return {
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
    };
}

/**
 * Build a flat quad (2 triangles) — not closed (has boundary edges).
 */
function makeQuad(): { positions: Float32Array; indices: Uint32Array } {
    const positions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
    ]);
    const indices = new Uint32Array([
        0, 1, 2,
        0, 2, 3,
    ]);
    return { positions, indices };
}

/**
 * Build a grid strip mesh simulating an outer wall.
 * numU columns, numT rows.
 * Vertices are placed in a flat grid with z=0.
 */
function makeGridStrip(numU: number, numT: number): {
    positions: Float32Array;
    indices: Uint32Array;
} {
    const vertCount = numU * numT;
    const positions = new Float32Array(vertCount * 3);
    for (let t = 0; t < numT; t++) {
        for (let u = 0; u < numU; u++) {
            const idx = t * numU + u;
            positions[idx * 3] = u;
            positions[idx * 3 + 1] = t;
            positions[idx * 3 + 2] = 0;
        }
    }
    const indices: number[] = [];
    for (let t = 0; t < numT - 1; t++) {
        for (let u = 0; u < numU - 1; u++) {
            const i0 = t * numU + u;
            const i1 = t * numU + (u + 1);
            const i2 = (t + 1) * numU + (u + 1);
            const i3 = (t + 1) * numU + u;
            indices.push(i0, i1, i2);
            indices.push(i0, i2, i3);
        }
    }
    return { positions, indices: new Uint32Array(indices) };
}

/** Standard tolerances for testing (standard profile). */
const STANDARD_TOLERANCES: ExportTolerances = {
    epsPosMm: 0.08,
    epsNormalDeg: 6.0,
    epsFeatureMm: 0.06,
    minTriangleAngleDeg: 18,
    maxAspectRatio: 10.0,
};

/** Loose tolerances that everything should pass. */
const LOOSE_TOLERANCES: ExportTolerances = {
    epsPosMm: 100,
    epsNormalDeg: 180,
    epsFeatureMm: 100,
    minTriangleAngleDeg: 1,
    maxAspectRatio: 1000,
};

// ============================================================================
// checkManifold Tests
// ============================================================================

describe('checkManifold', () => {
    it('reports closed tetrahedron as manifold with no boundary', () => {
        const { indices } = makeTetrahedron();
        const report = checkManifold(indices, indices.length);

        expect(report.ok).toBe(true);
        expect(report.nonManifoldEdges).toBe(0);
        expect(report.boundaryEdges).toBe(0);
    });

    it('reports open quad as manifold but with boundary edges', () => {
        const { indices } = makeQuad();
        const report = checkManifold(indices, indices.length);

        expect(report.ok).toBe(true); // no non-manifold edges
        expect(report.nonManifoldEdges).toBe(0);
        expect(report.boundaryEdges).toBeGreaterThan(0); // open mesh has boundary
    });

    it('detects non-manifold edges (3+ triangles sharing an edge)', () => {
        // Three triangles sharing edge 0-1
        const indices = new Uint32Array([
            0, 1, 2,
            0, 1, 3,
            0, 1, 4,
        ]);
        const report = checkManifold(indices, indices.length);

        expect(report.ok).toBe(false);
        expect(report.nonManifoldEdges).toBeGreaterThan(0);
    });

    it('handles empty mesh', () => {
        const report = checkManifold(new Uint32Array(0), 0);
        expect(report.ok).toBe(true);
        expect(report.nonManifoldEdges).toBe(0);
        expect(report.boundaryEdges).toBe(0);
    });

    it('skips degenerate triangles (duplicate indices)', () => {
        const indices = new Uint32Array([0, 0, 1]); // degenerate
        const report = checkManifold(indices, 3);
        expect(report.ok).toBe(true);
        expect(report.nonManifoldEdges).toBe(0);
    });

    it('correctly counts boundary edges on a single triangle', () => {
        const indices = new Uint32Array([0, 1, 2]);
        const report = checkManifold(indices, 3);
        expect(report.ok).toBe(true);
        expect(report.boundaryEdges).toBe(3); // all 3 edges are boundary
    });
});

describe('checkGeometricManifold', () => {
    it('treats STL-style duplicated face vertices as closed when coordinates coincide', () => {
        const { positions, indices } = makeDuplicatedTetrahedron();

        const indexReport = checkManifold(indices, indices.length);
        const geometricReport = checkGeometricManifold(positions, indices, indices.length, 1e-5);

        expect(indexReport.boundaryEdges).toBeGreaterThan(0);
        expect(geometricReport.ok).toBe(true);
        expect(geometricReport.boundaryEdges).toBe(0);
        expect(geometricReport.nonManifoldEdges).toBe(0);
    });
});

describe('diagnoseBoundaryEdges', () => {
    it('classifies open edge loops by endpoint surface and T boundary', () => {
        const { positions, indices } = makeQuad();
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0,
        ]);

        const diag = diagnoseBoundaryEdges(positions, indices, indices.length, uvs);

        expect(diag.total).toBe(4);
        expect(diag.bySurfacePair).toContainEqual({ key: 's0-s0', count: 4 });
        expect(diag.byEndpointClass).toContainEqual({ key: 's0:t0-s0:t0', count: 1 });
        expect(diag.byEndpointClass).toContainEqual({ key: 's0:t1-s0:t1', count: 1 });
        expect(diag.samples.length).toBeGreaterThan(0);
        expect(diag.components.total).toBe(1);
        expect(diag.components.closedLoops).toBe(1);
        expect(diag.components.openChains).toBe(0);
        expect(diag.components.largestEdges).toBe(4);
    });
});

describe('diagnoseNonManifoldEdges', () => {
    it('reports incident triangle offsets and opposite vertices for non-manifold edge samples', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            0, -1, 0,
            0.5, 0, 1,
        ]);
        const uvs = new Float32Array([
            0.1, 0.5, 0,
            0.2, 0.5, 0,
            0.1, 0.6, 0,
            0.1, 0.4, 0,
            0.2, 0.6, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            1, 0, 3,
            0, 1, 4,
        ]);

        const diag = diagnoseNonManifoldEdges(positions, indices, indices.length, uvs);

        expect(diag.total).toBe(1);
        expect(diag.samples[0].incidents?.map(({ triOffset, opp }) => ({ triOffset, opp }))).toEqual([
            { triOffset: 0, opp: 2 },
            { triOffset: 3, opp: 3 },
            { triOffset: 6, opp: 4 },
        ]);
        expect(diag.samples[0].incidents?.[0].oppT).toBeCloseTo(0.6);
    });
});

// ============================================================================
// checkDegenerates Tests
// ============================================================================

describe('checkDegenerates', () => {
    it('reports no degenerates on a well-formed tetrahedron', () => {
        const { positions, indices } = makeTetrahedron();
        const report = checkDegenerates(positions, indices, indices.length);

        expect(report.ok).toBe(true);
        expect(report.zeroAreaTriangles).toBe(0);
        expect(report.collapsedEdges).toBe(0);
    });

    it('detects zero-area triangle (collinear vertices)', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            2, 0, 0,  // collinear
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const report = checkDegenerates(positions, indices, 3);

        expect(report.ok).toBe(false);
        expect(report.zeroAreaTriangles).toBe(1);
    });

    it('detects collapsed edges (very short)', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1e-8, 0, 0,  // very close to v0
            0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const report = checkDegenerates(positions, indices, 3, 1e-10, 1e-6);

        expect(report.ok).toBe(false);
        expect(report.collapsedEdges).toBeGreaterThan(0);
    });

    it('counts duplicate-index triangles as zero-area', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const indices = new Uint32Array([0, 0, 1]); // v0 duplicated
        const report = checkDegenerates(positions, indices, 3);

        expect(report.zeroAreaTriangles).toBe(1);
    });

    it('handles empty mesh', () => {
        const report = checkDegenerates(new Float32Array(0), new Uint32Array(0), 0);
        expect(report.ok).toBe(true);
    });
});

// ============================================================================
// checkNormals Tests
// ============================================================================

describe('checkNormals', () => {
    it('reports on a tetrahedron (faces meet at dihedral angles)', () => {
        const { positions, indices } = makeTetrahedron();
        const report = checkNormals(positions, indices, indices.length);

        // Tetrahedron faces meet at ~70° dihedral angle.
        // With mixed winding, some adjacent normals may differ.
        // We just verify the function runs and produces valid counts.
        expect(report.inconsistentPairs).toBeGreaterThanOrEqual(0);
        expect(report.invertedTriangles).toBeGreaterThanOrEqual(0);
    });

    it('reports consistent normals on a flat quad', () => {
        const { positions, indices } = makeQuad();
        const report = checkNormals(positions, indices, indices.length);

        expect(report.ok).toBe(true);
        expect(report.invertedTriangles).toBe(0);
        expect(report.inconsistentPairs).toBe(0);
    });

    it('detects inverted triangle normal', () => {
        // Create many +Z triangles and one -Z to ensure dominant direction is clear
        const positions = new Float32Array([
            0, 0, 0,    // v0
            1, 0, 0,    // v1
            0.5, 1, 0,  // v2 — CCW → normal +Z
            2, 0, 0,    // v3
            3, 0, 0,    // v4
            2.5, 1, 0,  // v5 — CCW → normal +Z
            4, 0, 0,    // v6
            5, 0, 0,    // v7
            4.5, 1, 0,  // v8 — CW → normal -Z (inverted)
        ]);
        const indices = new Uint32Array([
            0, 1, 2,  // CCW → normal +Z
            3, 4, 5,  // CCW → normal +Z
            6, 8, 7,  // CW → normal -Z (inverted)
        ]);
        const report = checkNormals(positions, indices, 9);

        // One of the three should be "inverted" relative to dominant +Z direction
        expect(report.invertedTriangles).toBeGreaterThan(0);
    });

    it('handles empty mesh', () => {
        const report = checkNormals(new Float32Array(0), new Uint32Array(0), 0);
        expect(report.ok).toBe(true);
    });

    // Orientability gate: `ok` must measure GENUINE winding consistency
    // (each shared edge traversed once a->b and once b->a), NOT the normal-dot
    // heuristic. Sharp dihedrals (intentional on gothic/feature-dense walls)
    // legitimately produce adjacent normals with dot < -0.1 even when winding
    // is perfectly consistent — those must NOT fail the gate. Measured on the
    // GothicArches export: normal-dot reported 304634 "inconsistent" pairs but
    // the edge-direction check found only 7935 genuine winding flips (~97%
    // false-positive from sharp grooves).
    it('passes sharp antiparallel-normal faces when winding is consistent', () => {
        // Two triangles sharing edge (0,1), traversed in OPPOSITE directions
        // (0->1 vs 1->0) = consistent winding, but coplanar-folded so their
        // normals are antiparallel (dot = -1, well below the -0.1 threshold).
        const positions = new Float32Array([
            0, 0, 0,    // v0
            1, 0, 0,    // v1
            0.5, 1, 0,  // v2 — tri A normal +Z
            2, 1, 0,    // v3 — tri B normal -Z
        ]);
        const indices = new Uint32Array([
            0, 1, 2,    // A: edge 0->1
            1, 0, 3,    // B: edge 1->0 (opposite => consistent)
        ]);
        const report = checkNormals(positions, indices, indices.length);

        expect(report.inconsistentPairs).toBeGreaterThan(0); // normal-dot trips
        expect(report.windingInconsistentEdges).toBe(0);     // but winding is fine
        expect(report.ok).toBe(true);                        // gate must pass
    });

    it('fails a genuine winding flip even when normals agree', () => {
        // Two triangles sharing edge (0,1) traversed the SAME direction
        // (0->1 in both) = winding flip, yet both normals point +Z so the
        // normal-dot heuristic would call it consistent. The edge-direction
        // gate must still catch it.
        const positions = new Float32Array([
            0, 0, 0,    // v0
            1, 0, 0,    // v1
            0.5, 1, 0,  // v2 — tri A normal +Z
            2, 1, 0,    // v3 — tri B normal +Z
        ]);
        const indices = new Uint32Array([
            0, 1, 2,    // A: edge 0->1
            0, 1, 3,    // B: edge 0->1 (same => flipped)
        ]);
        const report = checkNormals(positions, indices, indices.length);

        expect(report.inconsistentPairs).toBe(0);            // normal-dot misses it
        expect(report.windingInconsistentEdges).toBe(1);     // edge-direction catches it
        expect(report.ok).toBe(false);                       // gate must fail
    });

    it('reports zero winding-inconsistent edges on a correctly wound tetrahedron', () => {
        const { positions, indices } = makeTetrahedron();
        const report = checkNormals(positions, indices, indices.length);
        expect(report.windingInconsistentEdges).toBe(0);
        expect(report.ok).toBe(true);
    });
});

// ============================================================================
// checkTriangleQuality Tests
// ============================================================================

describe('checkTriangleQuality', () => {
    it('reports good quality for an equilateral triangle', () => {
        const s = 1;
        const h = Math.sqrt(3) / 2;
        const positions = new Float32Array([
            0, 0, 0,
            s, 0, 0,
            s / 2, h, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const report = checkTriangleQuality(positions, indices, 3);

        // Equilateral: all angles ≈ 60°, R/r aspect ratio ≈ 2.0
        expect(report.minAngleDeg).toBeCloseTo(60, 0);
        expect(report.maxAspectRatio).toBeCloseTo(2, 1);
        expect(report.sliverCount).toBe(0);
    });

    it('counts slivers for very flat triangles', () => {
        const positions = new Float32Array([
            0, 0, 0,
            100, 0, 0,
            50, 0.001, 0,  // extremely flat — tiny height relative to base
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const report = checkTriangleQuality(positions, indices, 3, 15);

        expect(report.sliverCount).toBe(1);
        expect(report.minAngleDeg).toBeLessThan(1);
        expect(report.maxAspectRatio).toBeGreaterThan(1.5);
    });

    it('reports sensible defaults for empty mesh', () => {
        const report = checkTriangleQuality(new Float32Array(0), new Uint32Array(0), 0);
        expect(report.ok).toBe(true);
        expect(report.minAngleDeg).toBe(60);
        expect(report.sliverCount).toBe(0);
    });

    it('handles degenerate triangle (duplicate index)', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const indices = new Uint32Array([0, 0, 1]);
        const report = checkTriangleQuality(positions, indices, 3, 15);

        expect(report.sliverCount).toBe(1); // degenerate counts as sliver
    });

    it('handles multiple triangles with varying quality', () => {
        // Good triangle + sliver
        const s = 1;
        const h = Math.sqrt(3) / 2;
        const positions = new Float32Array([
            // Equilateral
            0, 0, 0,
            s, 0, 0,
            s / 2, h, 0,
            // Sliver — extremely elongated
            10, 0, 0,
            110, 0, 0,
            60, 0.001, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2, // good
            3, 4, 5, // sliver
        ]);
        const report = checkTriangleQuality(positions, indices, 6, 15);

        expect(report.sliverCount).toBe(1);
        expect(report.minAngleDeg).toBeLessThan(1);
        expect(report.maxAspectRatio).toBeGreaterThan(1.5);
    });
});

// ============================================================================
// computeTriangleAngles Tests
// ============================================================================

describe('computeTriangleAngles', () => {
    it('computes 60-60-60 for equilateral triangle', () => {
        const angles = computeTriangleAngles(1, 1, 1);
        expect(angles[0]).toBeCloseTo(60, 5);
        expect(angles[1]).toBeCloseTo(60, 5);
        expect(angles[2]).toBeCloseTo(60, 5);
    });

    it('computes 90-45-45 for right isosceles triangle', () => {
        // sides: 1, 1, √2
        const angles = computeTriangleAngles(Math.SQRT2, 1, 1);
        // Angle opposite to longest side (√2) should be 90°
        expect(angles[0]).toBeCloseTo(90, 3);
        expect(angles[1]).toBeCloseTo(45, 3);
        expect(angles[2]).toBeCloseTo(45, 3);
    });

    it('angles sum to 180', () => {
        const angles = computeTriangleAngles(3, 4, 5);
        const sum = angles[0] + angles[1] + angles[2];
        expect(sum).toBeCloseTo(180, 5);
    });
});

// ============================================================================
// checkFidelityCPU Tests
// ============================================================================

describe('checkFidelityCPU', () => {
    it('reports zero error for a flat surface', () => {
        const { positions, indices } = makeQuad();
        const report = checkFidelityCPU(positions, indices, indices.length);

        // All dihedral angles should be 0 for a flat surface
        expect(report.p95NormalErrorDeg).toBeCloseTo(0, 1);
        expect(report.p95PosErrorMm).toBeCloseTo(0, 3);
    });

    it('reports nonzero error for a bent surface', () => {
        // Two triangles bent at 45 degrees
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0.5, // lifted → creates dihedral angle
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
        ]);
        const report = checkFidelityCPU(positions, indices, indices.length);

        expect(report.p95NormalErrorDeg).toBeGreaterThan(0);
    });

    it('measures feature drift when chain positions provided', () => {
        const { positions, indices } = makeQuad();
        const chainPos = new Float32Array([0, 0, 0, 1, 0, 0]);
        const chainRef = new Float32Array([0.1, 0.1, 0, 1.1, 0.1, 0]);

        const report = checkFidelityCPU(
            positions, indices, indices.length,
            chainPos, chainRef,
        );

        expect(report.maxFeatureDriftMm).toBeGreaterThan(0);
        const expectedDrift = Math.sqrt(0.01 + 0.01); // √(0.1²+0.1²)
        expect(report.maxFeatureDriftMm).toBeCloseTo(expectedDrift, 4);
    });

    it('handles empty mesh', () => {
        const report = checkFidelityCPU(new Float32Array(0), new Uint32Array(0), 0);
        expect(report.ok).toBe(true);
        expect(report.p95PosErrorMm).toBe(0);
        expect(report.maxFeatureDriftMm).toBe(0);
    });
});

// ============================================================================
// checkFidelity (async GPU) Tests
// ============================================================================

describe('checkFidelity (GPU evaluator)', () => {
    it('reports zero error when surface matches mesh exactly', async () => {
        const { positions, indices } = makeQuad();
        // UVs for quad: u=[0..1], t=[0..1], surfaceId=0
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0,
        ]);

        // Mock evaluator returns the mesh centroid position itself
        const evaluatePoints = async (uvBatch: Float32Array): Promise<Float32Array> => {
            // For each centroid UV, return the mesh centroid position
            const count = uvBatch.length / 3;
            const result = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const u = uvBatch[i * 3];
                const t = uvBatch[i * 3 + 1];
                // Our quad: x=u, y=t, z=0
                result[i * 3] = u;
                result[i * 3 + 1] = t;
                result[i * 3 + 2] = 0;
            }
            return result;
        };

        const report = await checkFidelity(
            positions, uvs, indices, indices.length, evaluatePoints,
        );

        expect(report.p95PosErrorMm).toBeLessThan(0.01);
    });

    it('detects position error when surface differs from mesh', async () => {
        const { positions, indices } = makeQuad();
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0,
        ]);

        // Mock evaluator returns positions shifted by 1mm in Z
        const evaluatePoints = async (uvBatch: Float32Array): Promise<Float32Array> => {
            const count = uvBatch.length / 3;
            const result = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const u = uvBatch[i * 3];
                const t = uvBatch[i * 3 + 1];
                result[i * 3] = u;
                result[i * 3 + 1] = t;
                result[i * 3 + 2] = 1.0; // shifted 1mm from z=0
            }
            return result;
        };

        const report = await checkFidelity(
            positions, uvs, indices, indices.length, evaluatePoints,
        );

        expect(report.p95PosErrorMm).toBeGreaterThan(0.5);
    });

    it('handles empty mesh', async () => {
        const evaluatePoints = async () => new Float32Array(0);
        const report = await checkFidelity(
            new Float32Array(0), new Float32Array(0),
            new Uint32Array(0), 0, evaluatePoints,
        );
        expect(report.ok).toBe(true);
        expect(report.p95PosErrorMm).toBe(0);
    });
});

// ============================================================================
// checkWallThickness Tests
// ============================================================================

describe('checkWallThickness', () => {
    it('reports thick walls as passing', () => {
        const outer = new Float32Array([0, 0, 0, 1, 0, 0]);
        const inner = new Float32Array([0, 0, 2, 1, 0, 2]); // 2mm away
        const report = checkWallThickness(outer, inner, 0.8);

        expect(report.ok).toBe(true);
        expect(report.minThicknessMm).toBeCloseTo(2, 4);
        expect(report.thinSpots).toBe(0);
    });

    it('reports thin walls as failing', () => {
        const outer = new Float32Array([0, 0, 0]);
        const inner = new Float32Array([0, 0, 0.3]); // 0.3mm — too thin
        const report = checkWallThickness(outer, inner, 0.8);

        expect(report.ok).toBe(false);
        expect(report.minThicknessMm).toBeCloseTo(0.3, 4);
        expect(report.thinSpots).toBe(1);
    });

    it('finds the minimum across multiple vertices', () => {
        const outer = new Float32Array([
            0, 0, 0,
            10, 0, 0,
        ]);
        const inner = new Float32Array([
            0, 0, 5,    // 5mm from first outer
            10, 0, 0.1, // 0.1mm from second outer — too thin
        ]);
        const report = checkWallThickness(outer, inner, 0.8);

        expect(report.ok).toBe(false);
        expect(report.minThicknessMm).toBeCloseTo(0.1, 4);
        expect(report.thinSpots).toBe(1);
    });

    it('handles empty mesh', () => {
        const report = checkWallThickness(new Float32Array(0), new Float32Array(0));
        expect(report.ok).toBe(true);
    });
});

// ============================================================================
// checkSeam Tests
// ============================================================================

describe('checkSeam', () => {
    it('reports zero gap for a perfectly closed grid', () => {
        // Grid where column 0 and column numU-1 have identical positions
        const numU = 4, numT = 3;
        const positions = new Float32Array(numU * numT * 3);
        for (let t = 0; t < numT; t++) {
            for (let u = 0; u < numU; u++) {
                const idx = t * numU + u;
                const angle = (u / numU) * 2 * Math.PI;
                positions[idx * 3] = Math.cos(angle);
                positions[idx * 3 + 1] = t;
                positions[idx * 3 + 2] = Math.sin(angle);
            }
        }
        // Make column 0 = column numU-1 (perfect closure)
        for (let t = 0; t < numT; t++) {
            const leftIdx = t * numU;
            const rightIdx = t * numU + (numU - 1);
            positions[rightIdx * 3] = positions[leftIdx * 3];
            positions[rightIdx * 3 + 1] = positions[leftIdx * 3 + 1];
            positions[rightIdx * 3 + 2] = positions[leftIdx * 3 + 2];
        }

        const indices = new Uint32Array(0); // No faces needed for position-only check

        const report = checkSeam(positions, indices, 0, numU, numT, {
            maxPositionGapMm: 0.01,
            maxNormalGapDeg: 10,
            deviationFraction: 0.2,
        });

        expect(report.ok).toBe(true);
        expect(report.maxPositionDiscontinuityMm).toBeCloseTo(0, 4);
    });

    it('detects gap when seam vertices are misaligned', () => {
        const numU = 4, numT = 2;
        const positions = new Float32Array(numU * numT * 3);
        for (let t = 0; t < numT; t++) {
            for (let u = 0; u < numU; u++) {
                const idx = t * numU + u;
                positions[idx * 3] = u;
                positions[idx * 3 + 1] = t;
                positions[idx * 3 + 2] = 0;
            }
        }
        // Column 0 and column numU-1 are 3mm apart
        // Column 0 has x=0, column numU-1 has x=3

        const report = checkSeam(positions, new Uint32Array(0), 0, numU, numT, {
            maxPositionGapMm: 0.01,
            maxNormalGapDeg: 10,
            deviationFraction: 0.2,
        });

        expect(report.ok).toBe(false);
        expect(report.maxPositionDiscontinuityMm).toBeGreaterThan(1);
    });
});

// ============================================================================
// validateMesh Integration Tests
// ============================================================================

describe('validateMesh', () => {
    it('rejects an open flat quad even with loose tolerances', () => {
        const { positions, indices } = makeQuad();
        const config: ValidateConfig = {
            tolerances: LOOSE_TOLERANCES,
        };

        const report = validateMesh(positions, indices, indices.length, config);

        expect(report.manifold.ok).toBe(true);
        expect(report.manifold.boundaryEdges).toBeGreaterThan(0);
        expect(report.degenerates.ok).toBe(true);
        expect(report.normals.ok).toBe(true);
        expect(report.valid).toBe(false);
        expect(report.warnings.some(w => w.includes('boundary edges'))).toBe(true);
    });

    it('reports warnings for a mesh with boundary edges', () => {
        const { positions, indices } = makeQuad();
        const config: ValidateConfig = {
            tolerances: LOOSE_TOLERANCES,
        };

        const report = validateMesh(positions, indices, indices.length, config);

        // Open mesh → boundary edges warning
        expect(report.manifold.boundaryEdges).toBeGreaterThan(0);
        expect(report.warnings.some(w => w.includes('boundary edges'))).toBe(true);
    });

    it('fails on non-manifold mesh', () => {
        // Three triangles sharing edge 0-1
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0.5, 1, 0,
            0.5, -1, 0,
            0.5, 0, 1,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 1, 3,
            0, 1, 4,
        ]);
        const config: ValidateConfig = {
            tolerances: LOOSE_TOLERANCES,
        };

        const report = validateMesh(positions, indices, indices.length, config);

        expect(report.valid).toBe(false);
        expect(report.manifold.ok).toBe(false);
    });

    it('fails when triangles exceed aspect ratio threshold', () => {
        // Sliver triangle
        const positions = new Float32Array([
            0, 0, 0,
            100, 0, 0,
            50, 0.001, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const config: ValidateConfig = {
            tolerances: {
                ...STANDARD_TOLERANCES,
                maxAspectRatio: 5.0,
                minTriangleAngleDeg: 15,
            },
        };

        const report = validateMesh(positions, indices, indices.length, config);

        // Extreme sliver should fail quality check
        expect(report.triangleQuality.ok).toBe(false);
        expect(report.valid).toBe(false);
    });

    it('keeps draft export valid for closed topology while reporting quality warnings', () => {
        const { positions, indices } = makeTetrahedron();
        const config: ValidateConfig = {
            tolerances: {
                ...STANDARD_TOLERANCES,
                maxAspectRatio: 1.01,
                minTriangleAngleDeg: 59,
                epsPosMm: 0.0001,
                epsNormalDeg: 0.1,
            },
            profileName: 'draft',
        };

        const report = validateMesh(positions, indices, indices.length, config);

        expect(report.manifold.boundaryEdges).toBe(0);
        expect(report.valid).toBe(true);
        expect(report.warnings.length).toBeGreaterThan(0);
    });

    it('includes wall thickness when inner positions provided', () => {
        const { positions, indices } = makeTetrahedron();
        const innerPositions = new Float32Array([
            0, 0, 10,  // far from outer
        ]);
        const config: ValidateConfig = {
            tolerances: LOOSE_TOLERANCES,
            innerPositions,
            minWallThicknessMm: 0.8,
        };

        const report = validateMesh(positions, indices, indices.length, config);

        expect(report.wallThickness).toBeDefined();
        expect(report.wallThickness!.ok).toBe(true);
    });

    it('includes seam check when numU/numT provided', () => {
        const grid = makeGridStrip(4, 3);
        const config: ValidateConfig = {
            tolerances: LOOSE_TOLERANCES,
            numU: 4,
            numT: 3,
            profileName: 'draft',
        };

        const report = validateMesh(grid.positions, grid.indices, grid.indices.length, config);

        expect(report.seam).toBeDefined();
    });

    it('includes fidelity report (CPU-based)', () => {
        const { positions, indices } = makeQuad();
        const config: ValidateConfig = {
            tolerances: LOOSE_TOLERANCES,
        };

        const report = validateMesh(positions, indices, indices.length, config);

        expect(report.fidelity).toBeDefined();
        expect(report.fidelity!.ok).toBe(true);
    });

    it('captures feature drift in fidelity report', () => {
        const { positions, indices } = makeQuad();
        const chainPos = new Float32Array([0, 0, 0]);
        const chainRef = new Float32Array([0, 0, 10]); // 10mm drift

        const config: ValidateConfig = {
            tolerances: {
                ...STANDARD_TOLERANCES,
                epsFeatureMm: 0.06, // tight threshold
            },
            featureChainPositions: chainPos,
            featureChainReferencePositions: chainRef,
        };

        const report = validateMesh(positions, indices, indices.length, config);

        expect(report.fidelity!.maxFeatureDriftMm).toBeCloseTo(10, 1);
        expect(report.fidelity!.ok).toBe(false); // 10mm > 0.06mm
        expect(report.valid).toBe(false);
    });

    it('ok=true when all checks pass on a closed mesh with consistent winding', () => {
        const positions = new Float32Array([
            0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
            0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
        ]);
        const indices = new Uint32Array([
            0, 2, 1, 0, 3, 2,
            4, 5, 6, 4, 6, 7,
            0, 1, 5, 0, 5, 4,
            1, 2, 6, 1, 6, 5,
            2, 3, 7, 2, 7, 6,
            3, 0, 4, 3, 4, 7,
        ]);

        const config: ValidateConfig = {
            tolerances: LOOSE_TOLERANCES,
        };

        const report = validateMesh(positions, indices, indices.length, config);

        expect(report.valid).toBe(true);
        expect(report.manifold.ok).toBe(true);
        expect(report.degenerates.ok).toBe(true);
        expect(report.normals.ok).toBe(true);
        expect(report.triangleQuality.ok).toBe(true);
    });
});

// ============================================================================
// checkDistortionMetric
// ============================================================================

describe('checkDistortionMetric', () => {
    it('reports low distortion for isotropic quad', () => {
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 10, 0,  0, 10, 0,
        ]);
        const uvs = new Float32Array([
            0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const report = checkDistortionMetric(positions, uvs, indices, 6);
        expect(report.p95StretchRatio).toBeCloseTo(1.0, 0);
        expect(report.meanStretchRatio).toBeCloseTo(1.0, 0);
        expect(report.ok).toBe(true);
    });

    it('reports high distortion for stretched quad', () => {
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 100, 0,  0, 100, 0,
        ]);
        const uvs = new Float32Array([
            0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const report = checkDistortionMetric(positions, uvs, indices, 6);
        expect(report.p95StretchRatio).toBeGreaterThan(5);
        expect(report.ok).toBe(true); // No gates specified → always ok
    });

    it('fails with strict distortion gates on stretched mesh', () => {
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 100, 0,  0, 100, 0,
        ]);
        const uvs = new Float32Array([
            0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const gates = { maxP95StretchRatio: 1.5, maxP999StretchRatio: 2.5 };
        const report = checkDistortionMetric(positions, uvs, indices, 6, gates);
        expect(report.ok).toBe(false);
    });

    it('handles empty mesh', () => {
        const report = checkDistortionMetric(
            new Float32Array(0), new Float32Array(0),
            new Uint32Array(0), 0,
        );
        expect(report.triangleCount).toBe(0);
        expect(report.ok).toBe(true);
    });
});

// ============================================================================
// checkEdgeLengthDistribution
// ============================================================================

describe('checkEdgeLengthDistribution', () => {
    it('reports edge stats for a simple quad', () => {
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 10, 0,  0, 10, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const report = checkEdgeLengthDistribution(positions, indices, 6);
        expect(report.edgeCount).toBeGreaterThan(0);
        expect(report.meanMm).toBeGreaterThan(0);
        expect(report.p95Mm).toBeGreaterThanOrEqual(report.meanMm);
        expect(report.ok).toBe(true);
    });

    it('reports higher CV for non-uniform mesh', () => {
        // Uniform grid
        const uniformPos = new Float32Array([
            0, 0, 0,  5, 0, 0,  10, 0, 0,
            0, 5, 0,  5, 5, 0,  10, 5, 0,
        ]);
        const uniformIdx = new Uint32Array([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]);
        const uniformReport = checkEdgeLengthDistribution(uniformPos, uniformIdx, 12);

        // Stretched: one edge 10× longer
        const stretchPos = new Float32Array([
            0, 0, 0,  5, 0, 0,  50, 0, 0,
            0, 5, 0,  5, 5, 0,  50, 5, 0,
        ]);
        const stretchReport = checkEdgeLengthDistribution(stretchPos, uniformIdx, 12);

        expect(stretchReport.coeffOfVariation).toBeGreaterThan(uniformReport.coeffOfVariation);
    });

    it('returns zeros for empty mesh', () => {
        const report = checkEdgeLengthDistribution(new Float32Array(0), new Uint32Array(0), 0);
        expect(report.edgeCount).toBe(0);
        expect(report.meanMm).toBe(0);
    });
});

// ============================================================================
// distortionGatesForProfile
// ============================================================================

describe('distortionGatesForProfile', () => {
    it('high profile has moderate gates', () => {
        const gates = distortionGatesForProfile('high');
        expect(gates.maxP95StretchRatio).toBe(1.8);
        expect(gates.maxP999StretchRatio).toBe(3.0);
    });

    it('ultra profile has strict gates', () => {
        const gates = distortionGatesForProfile('ultra');
        expect(gates.maxP95StretchRatio).toBe(1.5);
        expect(gates.maxP999StretchRatio).toBe(2.5);
    });

    it('draft profile has no gating (Infinity)', () => {
        const gates = distortionGatesForProfile('draft');
        expect(gates.maxP95StretchRatio).toBe(Infinity);
        expect(gates.maxP999StretchRatio).toBe(Infinity);
    });
});

// ============================================================================
// validateMesh with distortion + edge-length integration
// ============================================================================

describe('validateMesh — distortion and edge-length gates', () => {
    it('includes distortion report when UVs provided', () => {
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 10, 0,  0, 10, 0,
        ]);
        const uvs = new Float32Array([
            0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const report = validateMesh(positions, indices, 6, {
            tolerances: LOOSE_TOLERANCES,
            uvs,
        });
        expect(report.distortion).toBeDefined();
        expect(report.distortion!.p95StretchRatio).toBeCloseTo(1.0, 0);
    });

    it('omits distortion report when no UVs', () => {
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 10, 0,  0, 10, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const report = validateMesh(positions, indices, 6, {
            tolerances: LOOSE_TOLERANCES,
        });
        expect(report.distortion).toBeUndefined();
    });

    it('always includes edge-length report', () => {
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 10, 0,  0, 10, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const report = validateMesh(positions, indices, 6, {
            tolerances: LOOSE_TOLERANCES,
        });
        expect(report.edgeLength).toBeDefined();
        expect(report.edgeLength!.edgeCount).toBeGreaterThan(0);
    });

    it('fails valid when distortion gates exceeded', () => {
        // 10× stretch
        const positions = new Float32Array([
            0, 0, 0,  10, 0, 0,  10, 100, 0,  0, 100, 0,
        ]);
        const uvs = new Float32Array([
            0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const report = validateMesh(positions, indices, 6, {
            tolerances: LOOSE_TOLERANCES,
            uvs,
            distortionGates: { maxP95StretchRatio: 1.5, maxP999StretchRatio: 2.5 },
        });
        expect(report.distortion!.ok).toBe(false);
        expect(report.valid).toBe(false);
        expect(report.warnings.some(w => w.includes('Distortion'))).toBe(true);
    });
});

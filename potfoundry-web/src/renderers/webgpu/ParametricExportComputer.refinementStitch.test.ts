import { describe, expect, it } from 'vitest';
import {
    buildSurfaceTPositionsForQuality,
    MAX_PARAMETRIC_EVAL_VERTICES_PER_DISPATCH,
    WEBGPU_MAX_EVAL_VERTICES_PER_DISPATCH,
    resolveValidationIndexScopes,
    repairPostDefectWeldTopology,
    selectSurfaceUPositionsForClosure,
    selectFinalDefectWeldCandidate,
    shouldAcceptPostDefectTopologyRepair,
    shouldAcceptWindingNormalization,
    splitUvVerticesForDispatch,
    describeSourceProbeVertex,
    classifyPhantomAnchorResnapCandidates,
    stitchRefinedOuterIndices,
    shouldAcceptSampledResnapCandidate,
    topologyWeldToleranceForExport,
    validationPassForExport,
} from './ParametricExportComputer';
import { triangleQualityDiagnostics } from '../../fidelity/metrics';
import { topologyDiagnostics } from '../../fidelity/metrics';
import { generateAdaptiveGrid } from './parametric/GridBuilder';

describe('shouldAcceptSampledResnapCandidate', () => {
    it('rejects edge-of-window samples because the extremum is unbracketed', () => {
        expect(shouldAcceptSampledResnapCandidate({
            currentU: 0.683,
            finalU: 0.673,
            bestK: 0,
            candidateCount: 64,
            maxDelta: 0.08,
        })).toEqual({ accept: false, reason: 'unbracketed' });
        expect(shouldAcceptSampledResnapCandidate({
            currentU: 0.683,
            finalU: 0.693,
            bestK: 63,
            candidateCount: 64,
            maxDelta: 0.08,
        })).toEqual({ accept: false, reason: 'unbracketed' });
    });

    it('accepts interior samples within the displacement cap', () => {
        expect(shouldAcceptSampledResnapCandidate({
            currentU: 0.683,
            finalU: 0.684,
            bestK: 31,
            candidateCount: 64,
            maxDelta: 0.08,
        })).toEqual({ accept: true, reason: 'accepted' });
    });

    it('rejects protected corridor vertices', () => {
        expect(shouldAcceptSampledResnapCandidate({
            currentU: 0.062,
            finalU: 0.054,
            bestK: 31,
            candidateCount: 64,
            maxDelta: 0.08,
            protectedVertex: true,
        })).toEqual({ accept: false, reason: 'protected' });
    });
});

describe('describeSourceProbeVertex', () => {
    it('reports vertex role, protection, and phantom-anchor metadata for source probes', () => {
        const result = {
            vertices: new Float32Array([
                0.10, 0.20, 0,
                0.30, 0.20, 0,
                0.40, 0.25, 0,
                0.50, 0.30, 0,
            ]),
            gridVertexCount: 2,
            chainVertexChainIds: new Map([[2, 17], [3, 17]]),
            protectedStripVertices: new Set([3]),
            phantomChainAnchors: [{ vertexIdx: 3, chainId: 17, tCross: 0.30 }],
        };

        const gridVertex = describeSourceProbeVertex(result as never, 0);
        expect(gridVertex).toMatchObject({
            index: 0,
            kind: 'grid',
            surface: 0,
            protected: false,
            phantomAnchor: false,
        });
        expect(gridVertex.u).toBeCloseTo(0.10);
        expect(gridVertex.t).toBeCloseTo(0.20);

        const phantomAnchor = describeSourceProbeVertex(result as never, 3);
        expect(phantomAnchor).toMatchObject({
            index: 3,
            kind: 'chain',
            chainId: 17,
            surface: 0,
            protected: true,
            phantomAnchor: true,
        });
        expect(phantomAnchor.u).toBeCloseTo(0.50);
        expect(phantomAnchor.t).toBeCloseTo(0.30);
    });
});

describe('classifyPhantomAnchorResnapCandidates', () => {
    it('rejects the weaker same-row phantom anchor when analytic snap would create a micro segment', () => {
        const decisions = classifyPhantomAnchorResnapCandidates([
            {
                vertexIdx: 563107,
                currentU: 0.060315,
                finalU: 0.062078434,
                t: 0.761036,
                gradAbs: 0.01,
                gradThreshold: 1.0,
                maxDelta: 0.003,
                minSeparation: 0.00005,
            },
            {
                vertexIdx: 563108,
                currentU: 0.060442,
                finalU: 0.062078766,
                t: 0.761036,
                gradAbs: 0.02,
                gradThreshold: 1.0,
                maxDelta: 0.003,
                minSeparation: 0.00005,
            },
        ]);

        expect(decisions.map(decision => decision.reason)).toEqual(['accepted', 'near-duplicate']);
    });

    it('accepts same-row phantom anchors when analytic snap keeps them separated', () => {
        const decisions = classifyPhantomAnchorResnapCandidates([
            {
                vertexIdx: 1,
                currentU: 0.060,
                finalU: 0.061,
                t: 0.50,
                gradAbs: 0.01,
                gradThreshold: 1.0,
                maxDelta: 0.003,
                minSeparation: 0.00005,
            },
            {
                vertexIdx: 2,
                currentU: 0.062,
                finalU: 0.062,
                t: 0.50,
                gradAbs: 0.01,
                gradThreshold: 1.0,
                maxDelta: 0.003,
                minSeparation: 0.00005,
            },
        ]);

        expect(decisions.map(decision => decision.reason)).toEqual(['accepted', 'already-correct']);
    });

    it('treats stationary protected companions as blockers for moving phantom anchors', () => {
        const decisions = classifyPhantomAnchorResnapCandidates([
            {
                vertexIdx: 437766,
                currentU: 0.312068,
                finalU: 0.312283247,
                t: 0.537825,
                gradAbs: 0.01,
                gradThreshold: 1.0,
                maxDelta: 0.003,
                minSeparation: 0.00005,
            },
            {
                vertexIdx: 437773,
                currentU: 0.312282771,
                finalU: 0.312282771,
                t: 0.537825167,
                gradAbs: 0,
                gradThreshold: 1.0,
                maxDelta: 0.003,
                minSeparation: 0.00005,
            },
        ]);

        expect(decisions.map(decision => decision.reason)).toEqual(['near-duplicate', 'already-correct']);
    });
});

describe('stitchRefinedOuterIndices', () => {
    it('uses the refined outer index length as the post-refinement validation boundary', () => {
        const refinedOuter = new Uint32Array([
            0, 1, 2,
            2, 1, 3,
            2, 3, 4,
        ]);
        const nonOuter = new Uint32Array([
            10, 11, 12,
        ]);

        const stitched = stitchRefinedOuterIndices(refinedOuter, nonOuter);

        expect([...stitched.indices]).toEqual([
            0, 1, 2,
            2, 1, 3,
            2, 3, 4,
            10, 11, 12,
        ]);
        expect(stitched.outerIdxCount).toBe(refinedOuter.length);
    });
});

describe('splitUvVerticesForDispatch', () => {
    // Regression: a single GothicArches export hung Dawn on a ~5.01M-vertex
    // midpoint eval. The default cap equalled the WebGPU hardware ceiling
    // (~4.19M verts/dispatch), so the batch split left one ~4.19M-vertex
    // dispatch that stalled the compute path indefinitely (observed >150s).
    // The default per-dispatch cap must sit strictly BELOW the hardware
    // ceiling so no single dispatch reaches the Dawn-stall size.
    it('caps the default eval dispatch below the WebGPU hardware ceiling', () => {
        expect(MAX_PARAMETRIC_EVAL_VERTICES_PER_DISPATCH)
            .toBeLessThan(WEBGPU_MAX_EVAL_VERTICES_PER_DISPATCH);
    });

    it('keeps every dispatch under the hardware ceiling for the observed hang size', () => {
        const HANG_VERTEX_COUNT = 5_010_688;
        const uvVertices = new Float32Array(HANG_VERTEX_COUNT * 3);

        const batches = splitUvVerticesForDispatch(uvVertices);

        for (const batch of batches) {
            expect(batch.vertexCount).toBeLessThan(WEBGPU_MAX_EVAL_VERTICES_PER_DISPATCH);
        }
    });

    it('splits UV vertices into dispatch-safe whole-vertex batches with offsets', () => {
        const uvVertices = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            2, 0, 0,
            3, 0, 0,
            4, 0, 0,
        ]);

        const batches = splitUvVerticesForDispatch(uvVertices, 2);

        expect(batches.map(batch => batch.startVertex)).toEqual([0, 2, 4]);
        expect(batches.map(batch => batch.vertexCount)).toEqual([2, 2, 1]);
        expect([...batches[0].vertices]).toEqual([0, 0, 0, 1, 0, 0]);
        expect([...batches[1].vertices]).toEqual([2, 0, 0, 3, 0, 0]);
        expect([...batches[2].vertices]).toEqual([4, 0, 0]);
    });
});

describe('resolveValidationIndexScopes', () => {
    it('validates the full stitched export while retaining the outer-wall seam boundary', () => {
        const scopes = resolveValidationIndexScopes(1200, 450);

        expect(scopes.meshIdxCount).toBe(1200);
        expect(scopes.outerIdxCount).toBe(450);
    });
});

describe('repairPostDefectWeldTopology', () => {
    function sharedJunctionFixture(): { indices: Uint32Array; uvs: Float32Array; positions: Float32Array } {
        const uvs = new Float32Array([
            0, 0.5, 0,
            0.1, 0.5, 0,
            0, 0.6, 0,
            0.1, 0.6, 0,
            -0.1, 0.5, 0,
            0, 0.4, 0,
            -0.1, 0.4, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
            -1, 0, 0,
            0, -1, 0,
            -1, -1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
            0, 4, 5,
            0, 5, 6,
        ]);
        return { indices, uvs, positions };
    }

    it('runs a same-surface mop-up after defect weld has exposed a boundary loop', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0,
        ]);
        const uvs = new Float32Array([
            0, 0.5, 0,
            0.1, 0.5, 0,
            0.1, 0.6, 0,
            0, 0.6, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
        ]);

        expect(topologyDiagnostics({ vertices: positions, indices }, 1e-4, 0).boundaryEdges).toBeGreaterThan(0);

        const repaired = repairPostDefectWeldTopology(indices, uvs, positions, indices.length, 1e-4, 0);
        const topology = topologyDiagnostics({ vertices: repaired.positions, indices: repaired.indices }, 1e-4, 0);

        expect(repaired.sameSurfaceFilledLoops).toBe(1);
        expect(topology.boundaryEdges).toBe(0);
        expect(topology.nonManifoldEdges).toBe(0);
    });

    it('runs a branched mop-up after defect weld has exposed a degree-4 same-surface component', () => {
        const { indices, uvs, positions } = sharedJunctionFixture();

        const repaired = repairPostDefectWeldTopology(indices, uvs, positions, indices.length, 1e-4, 0);
        const topology = topologyDiagnostics({ vertices: repaired.positions, indices: repaired.indices }, 1e-4, 0);

        expect(repaired.sameSurfaceFilledLoops).toBe(0);
        expect(topology.boundaryEdges).toBe(0);
        expect(topology.nonManifoldEdges).toBe(0);
        expect(topology.orientationMismatches).toBe(0);
    });

    it('splits a non-manifold outer-wall edge through a matching boundary chain after defect weld', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,  // A
            0.6, 0.5, 0,  // B
            0.4, 0.8, 0,  // O
            0.4, 0.5, 0,  // M
            0.3, 0.2, 0,  // L
            0.5, 0.2, 0,  // R
            0.4, 1.0, 0,  // P
            0.4, -0.2, 0, // Q
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2,
            0, 4, 3,
            3, 5, 1,
            1, 0, 6,
            0, 1, 7,
        ]);
        const before = topologyDiagnostics({ vertices: positions, indices, uvs }, 1e-4, 0);

        const repaired = repairPostDefectWeldTopology(indices, uvs, positions, indices.length, 1e-4, 0);
        const after = topologyDiagnostics({ vertices: repaired.positions, indices: repaired.indices, uvs: repaired.uvs }, 1e-4, 0);

        expect(before.boundaryEdges).toBeGreaterThan(0);
        expect(before.nonManifoldEdges).toBeGreaterThan(0);
        expect(repaired.nonManifoldRepairedEdges).toBe(1);
        expect(after.boundaryEdges).toBeLessThan(before.boundaryEdges);
        expect(after.nonManifoldEdges).toBeLessThan(before.nonManifoldEdges);
    });
});

describe('shouldAcceptPostDefectTopologyRepair', () => {
    it('rejects candidates that reduce non-manifold edges by opening more boundaries', () => {
        expect(shouldAcceptPostDefectTopologyRepair(
            { boundaryEdges: 3, nonManifoldEdges: 32, orientationMismatches: 32230 },
            { boundaryEdges: 15, nonManifoldEdges: 24, orientationMismatches: 32230 },
        )).toBe(false);
    });

    it('accepts candidates only when at least one topology defect improves and none regress', () => {
        expect(shouldAcceptPostDefectTopologyRepair(
            { boundaryEdges: 3, nonManifoldEdges: 32, orientationMismatches: 32230 },
            { boundaryEdges: 3, nonManifoldEdges: 24, orientationMismatches: 32230 },
        )).toBe(true);
        expect(shouldAcceptPostDefectTopologyRepair(
            { boundaryEdges: 3, nonManifoldEdges: 32, orientationMismatches: 32230 },
            { boundaryEdges: 3, nonManifoldEdges: 32, orientationMismatches: 32230 },
        )).toBe(false);
    });

    it('accepts hard topology closure when only a tiny pre-normalization orientation count regresses', () => {
        expect(shouldAcceptPostDefectTopologyRepair(
            { boundaryEdges: 13, nonManifoldEdges: 5, orientationMismatches: 4370 },
            { boundaryEdges: 4, nonManifoldEdges: 0, orientationMismatches: 4372 },
        )).toBe(true);
    });
});

describe('shouldAcceptWindingNormalization', () => {
    it('rejects the measured HarmonicRipple normalization that amplifies orientation defects', () => {
        expect(shouldAcceptWindingNormalization(
            { boundaryEdges: 0, nonManifoldEdges: 0, orientationMismatches: 162 },
            { boundaryEdges: 0, nonManifoldEdges: 0, orientationMismatches: 2911 },
        )).toBe(false);
    });

    it('accepts a winding rewrite only when hard topology is unchanged and orientation improves', () => {
        expect(shouldAcceptWindingNormalization(
            { boundaryEdges: 0, nonManifoldEdges: 0, orientationMismatches: 162 },
            { boundaryEdges: 0, nonManifoldEdges: 0, orientationMismatches: 0 },
        )).toBe(true);
        expect(shouldAcceptWindingNormalization(
            { boundaryEdges: 0, nonManifoldEdges: 0, orientationMismatches: 162 },
            { boundaryEdges: 1, nonManifoldEdges: 0, orientationMismatches: 0 },
        )).toBe(false);
    });
});

describe('selectFinalDefectWeldCandidate', () => {
    it('prefers the smallest boundary count that does not increase non-manifold edges', () => {
        const selected = selectFinalDefectWeldCandidate(
            { boundaryEdges: 836, nonManifoldEdges: 5, orientationMismatches: 4329 },
            [
                { toleranceMm: 0.001, boundaryEdges: 15, nonManifoldEdges: 5, orientationMismatches: 4370 },
                { toleranceMm: 0.002, boundaryEdges: 15, nonManifoldEdges: 10, orientationMismatches: 4370 },
                { toleranceMm: 0.005, boundaryEdges: 14, nonManifoldEdges: 14, orientationMismatches: 4370 },
                { toleranceMm: 0.01, boundaryEdges: 13, nonManifoldEdges: 18, orientationMismatches: 4369 },
                { toleranceMm: 0.02, boundaryEdges: 3, nonManifoldEdges: 32, orientationMismatches: 4362 },
            ],
        );

        expect(selected.toleranceMm).toBe(0.001);
    });
});

describe('selectSurfaceUPositionsForClosure', () => {
    it('uses the outer-wall U grid for every export surface so boundary edges are conformal', () => {
        const outerU = new Float32Array([0, 0.1, 0.2, 0.5, 0.9]);
        const baseU = new Float32Array([0, 0.5, 0.9]);

        for (const surfaceId of [0, 1, 2, 3, 4, 5]) {
            expect(selectSurfaceUPositionsForClosure(surfaceId, outerU, baseU)).toBe(outerU);
        }
    });
});

describe('buildSurfaceTPositionsForQuality', () => {
    it('clusters bottom-surface rows toward the drain so the seam wrap cell is not a sliver', () => {
        const uPositions = new Float32Array([0, 0.25, 0.5, 0.75, 0.998696]);
        const segments = 9;
        const outerRadiusMm = 34.9324;
        const drainRadiusMm = 2.5;

        const uniformT = new Float32Array(segments + 1);
        for (let j = 0; j <= segments; j++) uniformT[j] = j / segments;
        const uniformGrid = generateAdaptiveGrid(uPositions, uniformT, 4, false);
        const uniformQuality = triangleQualityDiagnostics({
            vertices: projectBottomAnnulus(uniformGrid.vertices, outerRadiusMm, drainRadiusMm),
            indices: uniformGrid.indices,
        }, 1);

        const biasedGrid = generateAdaptiveGrid(
            uPositions,
            buildSurfaceTPositionsForQuality(4, segments, outerRadiusMm, drainRadiusMm),
            4,
            false,
        );
        const biasedQuality = triangleQualityDiagnostics({
            vertices: projectBottomAnnulus(biasedGrid.vertices, outerRadiusMm, drainRadiusMm),
            indices: biasedGrid.indices,
        }, 1);

        expect(uniformQuality.maxAspect3D).toBeGreaterThan(100);
        expect(biasedQuality.maxAspect3D).toBeLessThan(50);
    });

    it('uses only the constrained boundary rings for the planar rim', () => {
        const uPositions = new Float32Array(32);
        for (let i = 0; i < uPositions.length; i++) uPositions[i] = i / uPositions.length;

        const oversegmentedGrid = generateAdaptiveGrid(
            uPositions,
            buildSurfaceTPositionsForQuality(1, 50),
            2,
            true,
        );
        const oversegmentedQuality = triangleQualityDiagnostics({
            vertices: projectRimAnnulus(oversegmentedGrid.vertices, 64, 61),
            indices: oversegmentedGrid.indices,
        }, 1);

        const rimGrid = generateAdaptiveGrid(
            uPositions,
            buildSurfaceTPositionsForQuality(2, 50),
            2,
            true,
        );
        const rimQuality = triangleQualityDiagnostics({
            vertices: projectRimAnnulus(rimGrid.vertices, 64, 61),
            indices: rimGrid.indices,
        }, 1);

        expect(oversegmentedQuality.sliverCount).toBeGreaterThan(0);
        expect([...buildSurfaceTPositionsForQuality(2, 50)]).toEqual([0, 1]);
        expect(rimQuality.sliverCount).toBe(0);
    });

    it('keeps non-planar non-drain surfaces uniformly spaced in T', () => {
        expect([...buildSurfaceTPositionsForQuality(1, 4)]).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });
});

describe('topologyWeldToleranceForExport', () => {
    it('uses a sub-micron-to-micron closure tolerance derived from the active position tolerance', () => {
        expect(topologyWeldToleranceForExport(0.12)).toBeCloseTo(0.001, 8);
        expect(topologyWeldToleranceForExport(0.03)).toBeCloseTo(0.0003, 8);
        expect(topologyWeldToleranceForExport(0)).toBeCloseTo(0.00001, 8);
    });
});

describe('validationPassForExport', () => {
    it('allows export when topology is clean but profile quality checks are advisory warnings', () => {
        const report = {
            valid: false,
            manifold: { ok: true, boundaryEdges: 0, nonManifoldEdges: 0 },
            degenerates: { ok: true },
        };

        expect(validationPassForExport(report as never)).toBe(true);
    });

    it('still blocks export when boundary topology is open', () => {
        const report = {
            valid: false,
            manifold: { ok: true, boundaryEdges: 1, nonManifoldEdges: 0 },
            degenerates: { ok: true },
        };

        expect(validationPassForExport(report as never)).toBe(false);
    });

    it('still blocks export when degenerates remain', () => {
        const report = {
            valid: false,
            manifold: { ok: true, boundaryEdges: 0, nonManifoldEdges: 0 },
            degenerates: { ok: false },
        };

        expect(validationPassForExport(report as never)).toBe(false);
    });
});

function projectBottomAnnulus(
    uvs: Float32Array,
    outerRadiusMm: number,
    drainRadiusMm: number,
): Float32Array {
    const positions = new Float32Array(uvs.length);
    for (let v = 0; v < uvs.length / 3; v++) {
        const u = uvs[v * 3];
        const t = uvs[v * 3 + 1];
        const theta = ((u % 1) + 1) % 1 * Math.PI * 2;
        const radius = outerRadiusMm + (drainRadiusMm - outerRadiusMm) * t;
        positions[v * 3] = radius * Math.cos(theta);
        positions[v * 3 + 1] = radius * Math.sin(theta);
        positions[v * 3 + 2] = 0;
    }
    return positions;
}

function projectRimAnnulus(
    uvs: Float32Array,
    outerRadiusMm: number,
    innerRadiusMm: number,
): Float32Array {
    const positions = new Float32Array(uvs.length);
    for (let v = 0; v < uvs.length / 3; v++) {
        const u = uvs[v * 3];
        const t = uvs[v * 3 + 1];
        const theta = ((u % 1) + 1) % 1 * Math.PI * 2;
        const radius = outerRadiusMm + (innerRadiusMm - outerRadiusMm) * t;
        positions[v * 3] = radius * Math.cos(theta);
        positions[v * 3 + 1] = radius * Math.sin(theta);
        positions[v * 3 + 2] = 120;
    }
    return positions;
}

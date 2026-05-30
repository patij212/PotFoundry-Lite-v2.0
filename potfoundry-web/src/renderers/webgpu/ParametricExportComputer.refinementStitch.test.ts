import { describe, expect, it } from 'vitest';
import {
    resolveValidationIndexScopes,
    selectSurfaceUPositionsForClosure,
    splitUvVerticesForDispatch,
    stitchRefinedOuterIndices,
    topologyWeldToleranceForExport,
    validationPassForExport,
} from './ParametricExportComputer';

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

describe('selectSurfaceUPositionsForClosure', () => {
    it('uses the outer-wall U grid for every export surface so boundary edges are conformal', () => {
        const outerU = new Float32Array([0, 0.1, 0.2, 0.5, 0.9]);
        const baseU = new Float32Array([0, 0.5, 0.9]);

        for (const surfaceId of [0, 1, 2, 3, 4, 5]) {
            expect(selectSurfaceUPositionsForClosure(surfaceId, outerU, baseU)).toBe(outerU);
        }
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

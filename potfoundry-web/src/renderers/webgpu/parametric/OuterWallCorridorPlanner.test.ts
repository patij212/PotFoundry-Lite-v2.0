import { describe, expect, it } from 'vitest';

import { planOuterWallCorridors } from './OuterWallCorridorPlanner';

describe('OuterWallCorridorPlanner', () => {
    it('supports single-chain seam-span candidates by producing an ownership segment', () => {
        const result = planOuterWallCorridors({
            unionU: new Float32Array([0, 0.1, 0.2, 0.3, 0.7]),
            cellsPerRow: 4,
            legacyCells: [
                { band: 0, col: 3, chainIds: [0] },
            ],
            seamGuard: 0.3,
            includeDiagnostics: true,
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].supported).toBe(true);
        expect(result.candidates[0].unsupportedReasons).toEqual([]);
        expect(result.candidates[0].ownershipSegments).toHaveLength(1);
        expect(result.candidates[0].ownershipSegments[0].periodicSeam).toBe(true);
        expect(result.diagnostics?.seamCandidateCount).toBe(1);
        expect(result.diagnostics?.supportedCandidateCount).toBe(1);
    });

    it('supports non-seam two-chain overlap structurally with one ownership segment', () => {
        const result = planOuterWallCorridors({
            unionU: new Float32Array([0, 0.1, 0.2, 0.3, 0.4]),
            cellsPerRow: 4,
            legacyCells: [
                { band: 0, col: 3, chainIds: [0, 1] },
            ],
            seamGuard: 0.3,
            includeDiagnostics: true,
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].supported).toBe(true);
        expect(result.candidates[0].unsupportedReasons).toEqual([]);
        expect(result.candidates[0].ownershipSegments).toHaveLength(1);
        expect(result.candidates[0].ownershipSegments[0].chainIds).toEqual([0, 1]);
        expect(result.diagnostics?.supportedOverlapCandidateCount).toBe(1);
    });

    it('keeps seam-overlap candidates unsupported with no ownership segments', () => {
        const result = planOuterWallCorridors({
            unionU: new Float32Array([0, 0.1, 0.2, 0.3, 0.7]),
            cellsPerRow: 4,
            legacyCells: [
                { band: 0, col: 3, chainIds: [0, 1] },
            ],
            seamGuard: 0.3,
            includeDiagnostics: true,
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].supported).toBe(false);
        expect(result.candidates[0].unsupportedReasons).toContain('multi_chain_overlap');
        expect(result.candidates[0].unsupportedReasons).toContain('seam_span');
        expect(result.candidates[0].ownershipSegments).toEqual([]);
        expect(result.diagnostics?.unsupportedCandidateCount).toBe(1);
    });
});
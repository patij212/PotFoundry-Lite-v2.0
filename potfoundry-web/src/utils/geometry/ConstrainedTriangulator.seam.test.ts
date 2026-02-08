import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from './ConstrainedTriangulator';

// Expose private methods for testing via casting
type TestableTriangulator = typeof ConstrainedTriangulator & {
    normalizeFeatures(points: { theta: number, t: number, strength: number, type: number }[]): { x: number, y: number, strength: number, type: number }[];
};

describe('ConstrainedTriangulator Seam Logic', () => {
    // @ts-ignore - Accessing private methods for testing
    const CT = ConstrainedTriangulator as TestableTriangulator;

    describe('normalizeFeatures', () => {
        it('should map input range [min, max] to exactly [0, 1]', () => {
            const inputs = [
                { theta: 0.0, t: 0.5, strength: 1, type: 1 }, // 0
                { theta: Math.PI, t: 0.5, strength: 1, type: 1 }, // 0.5
                { theta: 2 * Math.PI, t: 0.5, strength: 1, type: 1 } // 1.0
            ];

            const normalized = CT.normalizeFeatures(inputs);
            expect(normalized[0].x).toBeCloseTo(0.0);
            expect(normalized[1].x).toBeCloseTo(0.5);
            expect(normalized[2].x).toBeCloseTo(1.0);
        });
    });

    describe('handleSeamCrossings', () => {
        it('should split a segment crossing the seam (0.99 -> 0.01)', () => {
            const chain = [
                { x: 0.99, y: 0.5 },
                { x: 0.01, y: 0.5 }
            ];

            // Expected: Two segments
            // 1. 0.99 -> 1.00
            // 2. 0.00 -> 0.01

            const segments = CT.handleSeamCrossings(chain);

            expect(segments.length).toBe(2);

            // First segment (End of domain)
            expect(segments[0].p1.x).toBeCloseTo(0.99);
            expect(segments[0].p2.x).toBeCloseTo(1.00);

            // Second segment (Start of domain)
            expect(segments[1].p1.x).toBeCloseTo(0.00);
            expect(segments[1].p2.x).toBeCloseTo(0.01);
        });

        it('should handle standard non-crossing segments normally', () => {
            const chain = [
                { x: 0.1, y: 0.5 },
                { x: 0.2, y: 0.6 }
            ];

            const segments = CT.handleSeamCrossings(chain);

            expect(segments.length).toBe(1);
            expect(segments[0].p1.x).toBe(0.1);
            expect(segments[0].p2.x).toBe(0.2);
        });

        it('should handle multiple crossings in a chain', () => {
            const chain = [
                { x: 0.9, y: 0.5 },
                { x: 0.1, y: 0.5 }, // Crossing 1
                { x: 0.2, y: 0.5 },
                { x: 0.6, y: 0.5 }  // No crossing (0.2 -> 0.6 < 0.5)
            ];
            // Input chain points: A, B, C, D
            // Segments: AB, BC, CD
            // AB (0.9->0.1): CROSSING -> Split to 2
            // BC (0.1->0.2): Normal -> 1
            // CD (0.2->0.6): Normal -> 1
            // Total: 4 segments

            const segments = CT.handleSeamCrossings(chain);

            expect(segments.length).toBe(4);
        });
    });
});

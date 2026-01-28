/**
 * Tests for Ramer-Douglas-Peucker simplification
 */

import { describe, it, expect } from 'vitest';
import { simplify, Point } from './simplify';

describe('Geometry Simplification', () => {
    it('should handle empty or small arrays efficiently', () => {
        expect(simplify([])).toEqual([]);
        expect(simplify([{ x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }]);
        expect(simplify([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toHaveLength(2);
    });

    it('should simplify collinear points', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 1, y: 1 }, // On line
            { x: 2, y: 2 }, // On line
            { x: 3, y: 3 }
        ];

        const simplified = simplify(points, 0.1);
        expect(simplified).toHaveLength(2);
        expect(simplified[0]).toEqual({ x: 0, y: 0 });
        expect(simplified[1]).toEqual({ x: 3, y: 3 });
    });

    it('should preserve points outside tolerance', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 1, y: 2 }, // Spike
            { x: 2, y: 0 }
        ];

        // Tolerance 1.0. Spike distance is 2.0. Should remain.
        const simplified = simplify(points, 1.0);
        expect(simplified).toHaveLength(3);
    });

    it('should remove points inside tolerance', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 1, y: 0.1 }, // Minor noise
            { x: 2, y: 0 }
        ];

        // Tolerance 0.2. Point distance 0.1. Should be removed.
        const simplified = simplify(points, 0.2);
        expect(simplified).toHaveLength(2);
        expect(simplified[0]).toEqual({ x: 0, y: 0 });
        expect(simplified[1]).toEqual({ x: 2, y: 0 });
    });

    it('should support lower quality (radial dist) mode', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 0.05, y: 0 }, // Close to prev
            { x: 0.06, y: 0 }, // Close to prev
            { x: 1, y: 0 }
        ];

        // highestQuality = false uses radial distance check first
        const simplified = simplify(points, 0.1, false);
        expect(simplified).toHaveLength(2);
    });
});

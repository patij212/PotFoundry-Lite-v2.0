
import { ConstrainedTriangulator } from '../ConstrainedTriangulator';

describe('ConstrainedTriangulator Tube Check', () => {

    // Helper to make points array
    const p = (x: number, y: number) => [x, y];

    it('should detect strict intersections', () => {
        // Cross +
        const s1 = { a: p(0, 0.5), b: p(1, 0.5) };
        const s2 = { a: p(0.5, 0), b: p(0.5, 1) };

        expect(ConstrainedTriangulator.isConflict(s1.a, s1.b, s2.a, s2.b)).toBe(true);
    });

    it('should detect proximity conflicts (Tube Check)', () => {
        // Parallel lines, very close
        const offset = Math.sqrt(ConstrainedTriangulator.TUBE_RAD_SQ) * 0.5;
        const s1 = { a: p(0, 0), b: p(1, 0) };
        const s2 = { a: p(0, offset), b: p(1, offset) };

        expect(ConstrainedTriangulator.isConflict(s1.a, s1.b, s2.a, s2.b)).toBe(true);
    });

    it('should allow non-conflicting edges outside tube radius', () => {
        // Parallel lines, safe distance
        // Distance > tube radius
        const offset = Math.sqrt(ConstrainedTriangulator.TUBE_RAD_SQ) * 2.0;

        const s1 = { a: p(0, 0), b: p(1, 0) };
        const s2 = { a: p(0, offset), b: p(1, offset) };

        expect(ConstrainedTriangulator.isConflict(s1.a, s1.b, s2.a, s2.b)).toBe(false);
    });

    it('should detect T-junction proximity', () => {
        // One segment endpoint close to middle of other segment
        const offset = Math.sqrt(ConstrainedTriangulator.TUBE_RAD_SQ) * 0.5;

        const s1 = { a: p(0, 0), b: p(1, 0) };
        const s2 = { a: p(0.5, offset), b: p(0.5, 0.5) };

        expect(ConstrainedTriangulator.isConflict(s1.a, s1.b, s2.a, s2.b)).toBe(true);
    });

});

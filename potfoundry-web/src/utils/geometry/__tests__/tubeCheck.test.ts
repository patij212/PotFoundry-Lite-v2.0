
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
        // TUBE_RAD = 0.002
        // Distance = 0.001

        const s1 = { a: p(0, 0), b: p(1, 0) };
        const s2 = { a: p(0, 0.001), b: p(1, 0.001) };

        expect(ConstrainedTriangulator.isConflict(s1.a, s1.b, s2.a, s2.b)).toBe(true);
    });

    it('should allow non-conflicting edges outside tube radius', () => {
        // Parallel lines, safe distance
        // Distance = 0.003 ( > 0.002)

        const s1 = { a: p(0, 0), b: p(1, 0) };
        const s2 = { a: p(0, 0.003), b: p(1, 0.003) };

        expect(ConstrainedTriangulator.isConflict(s1.a, s1.b, s2.a, s2.b)).toBe(false);
    });

    it('should detect T-junction proximity', () => {
        // One segment endpoint close to middle of other segment
        // s1: Horizontal 0..1 at y=0
        // s2: Vertical at x=0.5, y=0.001 to y=0.5
        // Endpoint (0.5, 0.001) is distance 0.001 from s1

        const s1 = { a: p(0, 0), b: p(1, 0) };
        const s2 = { a: p(0.5, 0.001), b: p(0.5, 0.5) };

        expect(ConstrainedTriangulator.isConflict(s1.a, s1.b, s2.a, s2.b)).toBe(true);
    });

});

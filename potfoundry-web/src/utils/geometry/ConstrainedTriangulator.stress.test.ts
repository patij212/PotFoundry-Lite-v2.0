
import { ConstrainedTriangulator, Point2D, FeaturePoint } from './ConstrainedTriangulator';
import { describe, it, expect } from 'vitest';

// Helper to create feature chain
const makeChain = (points: Point2D[], closed: boolean = false): FeaturePoint[] => {
    const chain = points.map((p, i) => ({
        ...p,
        theta: 0,
        t: p.y,
        type: i === 0 || i === points.length - 1 ? 0 : 1, // 0=stop, 1=smooth
        strength: 1
    }));
    if (closed) {
        // Close the loop by duplicating start point at end? 
        // Or just rely on geometry. Usually features are open chains.
        // Let's just make start/end same point for "visual" closed loop
        if (points.length > 2 &&
            Math.abs(points[0].x - points[points.length - 1].x) < 1e-5 &&
            Math.abs(points[0].y - points[points.length - 1].y) < 1e-5) {
            chain[0].type = 1;
            chain[chain.length - 1].type = 1;
        }
    }
    return chain;
};

// Helper to calculate pot dimensions for a specific Aspect Ratio (AR = Width / Height)
// Normalized Width W_uv = 1.0 corresponds to Real Width W = R * 2PI
// Normalized Height H_uv = 1.0 corresponds to Real Height H
// AR = W / H = (R * 2PI) / H
// Let H = 1.0, then AR = R * 2PI => R = AR / 2PI
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
        scaleW: R * 2 * Math.PI, // Add scaleW explicitly if needed by some checks
        scaleH: 1.0
    };
};

describe('ConstrainedTriangulator Exhaustive Stress Tests', () => {

    const aspectRatios = [0.5, 1.0, 3.0];

    aspectRatios.forEach(ar => {
        it(`should handle Aspect Ratio ${ar} without seam gaps or overflow`, () => {
            console.log(`\n--- Testing AR=${ar} ---`);
            const dims = getDimsForAR(ar);

            // Vertical Ridge (Intersects many grid cells if tall, few if wide)
            // Ensure points are within [0, AR]
            const cx = ar * 0.5;
            const features = makeChain([
                { x: cx, y: 0.1 },
                { x: cx + Math.min(0.05, ar * 0.1), y: 0.5 }, // Slight bump
                { x: cx, y: 0.9 }
            ]);

            const mesh = ConstrainedTriangulator.generateFullPot(features, dims, undefined, 64);

            expect(mesh.vertices.length).toBeGreaterThan(0);

            // 1. Seam Check
            // Seam is at x=AR in scaled space
            // Vertices should be merged to x=0.0
            let unstitched = 0;
            const vCount = mesh.vertices.length / 3;
            for (let i = 0; i < vCount; i++) {
                const x = mesh.vertices[i * 3];
                // Check if any point is near the "Right Edge" (1.0 in UV space)
                // The mesh is returned in UV coordinates [0,1], regardless of AR.
                if (Math.abs(x - 1.0) < 1e-3) unstitched++;

                // Check for NaN
                expect(x).not.toBeNaN();
                expect(mesh.vertices[i * 3 + 1]).not.toBeNaN();
                expect(mesh.vertices[i * 3 + 2]).not.toBeNaN();
            }
            if (unstitched > 0) {
                console.error(`AR=${ar} FAILED: Found ${unstitched} unstitched vertices at x=1.0 (UV)`);
            }
            expect(unstitched).toBe(0);

            // 2. Triangle Quality Stats (Optional but good for logs)
            // let badTris = 0;
            const tCount = mesh.indices.length / 3;
            console.log(`AR=${ar}: ${vCount} verts, ${tCount} tris. OK.`);
        }, 30_000);
    });

    it('should handle Diagonal Features crossing multiple grid cells', () => {
        const dims = getDimsForAR(1.0); // Square pot
        // Diagonal from (0.1, 0.1) to (0.9, 0.9)
        const features = makeChain([
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.9 }
        ]);

        const mesh = ConstrainedTriangulator.generateFullPot(features, dims, undefined, 64);
        expect(mesh.vertices.length).toBeGreaterThan(0);

        // Just ensure it didn't crash and produced geometry
        console.log(`Diagonal Feature: ${mesh.vertices.length / 3} verts. OK.`);
    }, 30_000);

    it('should handle Closed Loop Features', () => {
        const dims = getDimsForAR(1.0);
        // Diamond shape loop
        const features = makeChain([
            { x: 0.5, y: 0.2 },
            { x: 0.8, y: 0.5 },
            { x: 0.5, y: 0.8 },
            { x: 0.2, y: 0.5 },
            { x: 0.5, y: 0.2 }
        ], true);

        const mesh = ConstrainedTriangulator.generateFullPot(features, dims, undefined, 64);
        expect(mesh.vertices.length).toBeGreaterThan(0);
        console.log(`Closed Loop: ${mesh.vertices.length / 3} verts. OK.`);
    }, 30_000);

    it('should handle Multi-Segment Features with Sharp Turns (stressing Buffer)', () => {
        const dims = getDimsForAR(1.5);
        // Zig-zag
        const features = makeChain([
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.2 },
            { x: 0.1, y: 0.3 },
            { x: 0.9, y: 0.4 },
            { x: 0.1, y: 0.5 }
        ]);

        const mesh = ConstrainedTriangulator.generateFullPot(features, dims, undefined, 64);
        expect(mesh.vertices.length).toBeGreaterThan(0);
        console.log(`ZigZag Feature: ${mesh.vertices.length / 3} verts. OK.`);
    }, 30_000);

});

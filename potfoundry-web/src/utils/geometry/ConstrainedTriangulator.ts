import { FeaturePoint } from '../../renderers/webgpu/FeatureExtractionComputer';
export type { FeaturePoint };
import { simplify } from '../../utils/geometry/simplify';
import { PotDimensions, TAU } from '../../geometry/types';
import cdt2d from 'cdt2d';

// ============================================================================
// Types
// ============================================================================

export interface TriangulatedMesh {
    vertices: Float32Array;
    indices: Uint32Array;
    ranges?: {
        boundary: number;
        feature: number;
        buffer: number;
        background: number;
    };
}

export interface Point2D {
    x: number;
    y: number;
}

// ============================================================================
// Robust Constrained Triangulator
// ============================================================================

export class ConstrainedTriangulator {

    // TUBE_RAD_SQ for robust conflict detection (prevents sliver triangles)
    // Relaxed to 1e-6 to match RDP tolerance (0.00001) and allow fine details.
    // Previous 0.0005 was rejecting valid high-frequency ridges.
    public static readonly TUBE_RAD_SQ = 0.000001 * 0.000001;

    /**
     * Normalizes raw GPU features to [0,1] domain.
     * Exposed for testing.
     */
    public static normalizeFeatures(features: FeaturePoint[]): { x: number, y: number, strength: number, type: number }[] {
        return features.map(f => ({
            x: f.theta / (Math.PI * 2),
            y: f.t,
            strength: f.strength,
            type: f.type
        }));
    }

    /**
     * Splits feature chains that cross the seam (u=0/1 wraps) into separate segments.
     * Exposed for testing.
     */
    public static handleSeamCrossings(chain: Point2D[]): { p1: Point2D, p2: Point2D }[] {
        const segments: { p1: Point2D, p2: Point2D }[] = [];
        for (let i = 0; i < chain.length - 1; i++) {
            const p1 = chain[i];
            const p2 = chain[i + 1];
            let dx = p2.x - p1.x;
            const dy = p2.y - p1.y;

            if (Math.abs(dx) > 0.5) {
                // Crossing detected
                // Unwrap for slope calc
                if (dx > 0.5) dx -= 1.0;
                else if (dx < -0.5) dx += 1.0;

                const slope = dy / dx; // dx is unwrapped

                // If going Right (dx > 0), we hit 1.0. Next segment starts at 0.0.
                // If going Left (dx < 0), we hit 0.0. Next segment starts at 1.0.
                const boundaryX = dx > 0 ? 1.0 : 0.0;

                // y = y1 + m(x - x1)
                const ySeam = p1.y + slope * (boundaryX - p1.x);
                const clampedY = Math.max(0, Math.min(1, ySeam));

                const mid1 = { x: boundaryX, y: clampedY };
                const mid2 = { x: (boundaryX === 1.0 ? 0.0 : 1.0), y: clampedY };

                segments.push({ p1: p1, p2: mid1 });
                segments.push({ p1: mid2, p2: p2 });
            } else {
                segments.push({ p1, p2 });
            }
        }
        return segments;
    }


    public static distToSegmentSq(p: number[], v: number[], w: number[]): number {
        const l2 = (v[0] - w[0]) ** 2 + (v[1] - w[1]) ** 2;
        if (l2 === 0) return (p[0] - v[0]) ** 2 + (p[1] - v[1]) ** 2;
        let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
        t = Math.max(0, Math.min(1, t));
        return (p[0] - (v[0] + t * (w[0] - v[0]))) ** 2 + (p[1] - (v[1] + t * (w[1] - v[1]))) ** 2;
    }

    public static isConflict(
        p1: number[], p2: number[], p3: number[], p4: number[]
    ): boolean {
        // 1. Strict Intersection Check
        const d1 = (p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0]);
        const d2 = (p4[0] - p3[0]) * (p2[1] - p3[1]) - (p4[1] - p3[1]) * (p2[0] - p3[0]);
        const d3 = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
        const d4 = (p2[0] - p1[0]) * (p4[1] - p1[1]) - (p2[1] - p1[1]) * (p4[0] - p1[0]);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        // 2. Tube / Proximity Check (Robustness)
        const TOL = ConstrainedTriangulator.TUBE_RAD_SQ;
        if (ConstrainedTriangulator.distToSegmentSq(p1, p3, p4) < TOL) return true;
        if (ConstrainedTriangulator.distToSegmentSq(p2, p3, p4) < TOL) return true;
        if (ConstrainedTriangulator.distToSegmentSq(p3, p1, p2) < TOL) return true;
        if (ConstrainedTriangulator.distToSegmentSq(p4, p1, p2) < TOL) return true;

        return false;
    }

    // Helper: Calculate intersection point of two segments AB and CD
    // Returns null if no intersection or parallel
    private static getSegmentIntersection(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D): Point2D | null {
        const s1_x = p1.x - p0.x;
        const s1_y = p1.y - p0.y;
        const s2_x = p3.x - p2.x;
        const s2_y = p3.y - p2.y;

        const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
        const t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

        if (s >= 0.001 && s <= 0.999 && t >= 0.001 && t <= 0.999) {
            return {
                x: p0.x + (t * s1_x),
                y: p0.y + (t * s1_y)
            };
        }
        return null;
    }

    private static planarizeSegments<T extends { p0: Point2D, p1: Point2D }>(segments: T[], points: Point2D[] = [], aspectRatio: number = 1.0): T[] {
        // Wrapper to track validity without array splicing
        interface SegmentPacket<U> {
            data: U;
            dead: boolean;
            id: number;
        }

        let nextId = 0;
        // const packets: SegmentPacket<T>[] = []; // Unused

        // Stack contains packets that need to be tested and added
        const stack: SegmentPacket<T>[] = segments.map(s => ({ data: s, dead: false, id: nextId++ }));

        // Final list of valid packets
        const processed: SegmentPacket<T>[] = [];

        // Uniform Grid for Spatial Indexing
        // ADAPTIVE GRID: Scale X resolution by Aspect Ratio to keep cells roughly square
        const GRID_RES_Y = 64;
        const GRID_RES_X = Math.ceil(GRID_RES_Y * aspectRatio);

        // Total cells: Y * X
        const grid: SegmentPacket<T>[][] = new Array(GRID_RES_X * GRID_RES_Y).fill(null).map(() => []);

        const getGridIndices = (p0: Point2D, p1: Point2D) => {
            const minX = Math.min(p0.x, p1.x);
            const maxX = Math.max(p0.x, p1.x);
            const minY = Math.min(p0.y, p1.y);
            const maxY = Math.max(p0.y, p1.y);

            // X is in [0, aspectRatio], Y is in [0, 1]
            // We clamp indices to [0, RES-1]
            const i0 = Math.floor(Math.max(0, Math.min(GRID_RES_X - 1, (minX / aspectRatio) * GRID_RES_X)));
            const i1 = Math.floor(Math.max(0, Math.min(GRID_RES_X - 1, (maxX / aspectRatio) * GRID_RES_X)));

            const j0 = Math.floor(Math.max(0, Math.min(GRID_RES_Y - 1, minY * GRID_RES_Y)));
            const j1 = Math.floor(Math.max(0, Math.min(GRID_RES_Y - 1, maxY * GRID_RES_Y)));

            const indices: number[] = [];
            for (let j = j0; j <= j1; j++) {
                for (let i = i0; i <= i1; i++) {
                    indices.push(j * GRID_RES_X + i); // Row-major: y*W + x
                }
            }
            return indices;
        };

        const getPointGridIndex = (p: Point2D) => {
            const i = Math.floor(Math.max(0, Math.min(GRID_RES_X - 1, (p.x / aspectRatio) * GRID_RES_X)));
            const j = Math.floor(Math.max(0, Math.min(GRID_RES_Y - 1, p.y * GRID_RES_Y)));
            return j * GRID_RES_X + i;
        };

        // Helper: is point P on segment AB? (Exclusive of endpoints)
        const isPointOnSegment = (p: Point2D, a: Point2D, b: Point2D): boolean => {
            const TOL = 1e-10;
            // Bounding Box fast check
            if (p.x < Math.min(a.x, b.x) - TOL || p.x > Math.max(a.x, b.x) + TOL ||
                p.y < Math.min(a.y, b.y) - TOL || p.y > Math.max(a.y, b.y) + TOL) return false;

            // Distance check
            const dSq = ConstrainedTriangulator.distToSegmentSq([p.x, p.y], [a.x, a.y], [b.x, b.y]);
            if (dSq > TOL) return false;

            // Endpoint check (Exclusive)
            const d0 = (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
            const d1 = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
            if (d0 < TOL || d1 < TOL) return false; // Is endpoint

            return true;
        };

        let operations = 0;
        const MAX_OPS = 5000000; // Increased to 5M for complex pots

        // Phase 1: Segment-Segment Intersections + Grid Building
        while (stack.length > 0 && operations < MAX_OPS) {
            const s1 = stack.pop()!;
            if (s1.dead) continue; // Should not happen if we don't push dead, but safety

            const gridIndices = getGridIndices(s1.data.p0, s1.data.p1);
            let intersected = false;

            // Collect candidates from grid (deduplicate by ID for performance if segment spans many cells)
            // Using a small Set for dedup
            const candidates = new Set<SegmentPacket<T>>();
            for (const idx of gridIndices) {
                const cell = grid[idx];
                for (const other of cell) {
                    if (!other.dead) candidates.add(other);
                }
            }

            for (const s2 of candidates) {
                operations++;
                // Skip connected
                if (Math.abs(s1.data.p0.x - s2.data.p0.x) < 1e-9 && Math.abs(s1.data.p0.y - s2.data.p0.y) < 1e-9) continue;
                if (Math.abs(s1.data.p0.x - s2.data.p1.x) < 1e-9 && Math.abs(s1.data.p0.y - s2.data.p1.y) < 1e-9) continue;
                if (Math.abs(s1.data.p1.x - s2.data.p0.x) < 1e-9 && Math.abs(s1.data.p1.y - s2.data.p0.y) < 1e-9) continue;
                if (Math.abs(s1.data.p1.x - s2.data.p1.x) < 1e-9 && Math.abs(s1.data.p1.y - s2.data.p1.y) < 1e-9) continue;

                // 1. Strict Intersection Check (Crossing)
                const hit = this.getSegmentIntersection(s1.data.p0, s1.data.p1, s2.data.p0, s2.data.p1);

                if (hit) {
                    // Split BOTH at intersection
                    s2.dead = true;
                    intersected = true;

                    const split = (s: SegmentPacket<T>, p: Point2D) => {
                        const dx = s.data.p1.x - s.data.p0.x;
                        const dy = s.data.p1.y - s.data.p0.y;
                        // Verify p is strictly inside (not endpoint) - getSegmentIntersection guarantees this for 'hit'
                        // but we double check length
                        if (dx * dx + dy * dy < 1e-12) return; // Degenerate signal

                        stack.push({ data: { ...s.data, p0: s.data.p0, p1: p }, dead: false, id: nextId++ });
                        stack.push({ data: { ...s.data, p0: p, p1: s.data.p1 }, dead: false, id: nextId++ });
                    };

                    split(s1, hit);
                    split(s2, hit);
                    break;
                }

                // 2. Check for Collinear Overlap (Vertex on Segment)
                // Even if endpoints match, one might contain the other's endpoint in its interior?
                // No, if endpoints match, we skipped above logic?
                // Wait, logic above skipped if *any* endpoint matches.
                // We need to check if s2.p0 is on s1, or s2.p1 is on s1, or s1.p0 on s2, s1.p1 on s2.
                // But we must be careful not to trigger on shared endpoints (distance ~ 0).

                // Case A: S2 endpoint on S1
                let splitPoint: Point2D | null = null;
                let target: SegmentPacket<T> | null = null; // Which segment to split?

                if (isPointOnSegment(s2.data.p0, s1.data.p0, s1.data.p1)) {
                    splitPoint = s2.data.p0; target = s1;
                } else if (isPointOnSegment(s2.data.p1, s1.data.p0, s1.data.p1)) {
                    splitPoint = s2.data.p1; target = s1;
                }
                // Case B: S1 endpoint on S2
                else if (isPointOnSegment(s1.data.p0, s2.data.p0, s2.data.p1)) {
                    splitPoint = s1.data.p0; target = s2;
                } else if (isPointOnSegment(s1.data.p1, s2.data.p0, s2.data.p1)) {
                    splitPoint = s1.data.p1; target = s2;
                }

                if (splitPoint && target) {
                    // Split 'target' at 'splitPoint'
                    // If target is s1: s1 becomes dead, we push 2 parts. S2 remains in processed (untouched).
                    // If target is s2: s2 becomes dead (removed from processing/grid), we push 2 parts. S1 remains active in stack (will be re-evaluated).

                    if (target === s1) {
                        intersected = true; // s1 matches
                        // s1 naturally handled by loop break (it wasn't added to processed)
                        // We just push its children
                        stack.push({ data: { ...s1.data, p0: s1.data.p0, p1: splitPoint }, dead: false, id: nextId++ });
                        stack.push({ data: { ...s1.data, p0: splitPoint, p1: s1.data.p1 }, dead: false, id: nextId++ });
                        break;
                    } else {
                        // target is s2 (in processed/grid)
                        s2.dead = true;
                        // s2 is removed. s1 is still pending checks.
                        // We must add s2's children to stack to be checked against s1 (and others)
                        stack.push({ data: { ...s2.data, p0: s2.data.p0, p1: splitPoint }, dead: false, id: nextId++ });
                        stack.push({ data: { ...s2.data, p0: splitPoint, p1: s2.data.p1 }, dead: false, id: nextId++ });

                        // s1 needs to restart its check? 
                        // Actually, s1 might have more intersections. The loop continues for s1.
                        // But we removed s2 from the candidate set (logically via dead flag).
                        // So we continue.
                    }
                }

                if (operations > MAX_OPS) break;
            }

            if (!intersected) {
                // Add to processed and Grid
                processed.push(s1);
                for (const idx of gridIndices) {
                    grid[idx].push(s1);
                }
            }
        }

        // Phase 2: Point-Segment Conflicts ("Intruders")
        // Check if any free point lies on a segment
        if (points.length > 0) {
            console.log(`[CDT] Checking ${points.length} points against constraints...`);
            // We iterate segments in 'processed' (which are final from Phase 1)
            // But if we split a segment, we must remove it and add children.
            // Using a queue for points might be safer, but just iterating points against grid segments is easier.
            // But if we split a segment, we need to update the grid.

            // Simpler: iterate points. Check grid. If hit, split segment.
            // Remove segment from processed/grid. Add children to processed/grid.
            // BUT children might be hit by OTHER points?
            // Yes. So children must be checked also?
            // Actually, if we split segment S at P, we get S1, S2 meeting at P.
            // P is now an endpoint.
            // Subsequent points won't trigger on P (endpoint exclusive).
            // So we just need to add S1, S2 back to the pool.

            // Note: Since 'processed' is an array, splicing is slow.
            // We can use the 'dead' flag again.

            for (const p of points) {
                const idx = getPointGridIndex(p);
                // Grid cell might contain candidates.
                // Also check neighbors? Segments span multiple cells. 
                // The segment is stored in all cells it overlaps. 
                // So checking cell 'idx' is sufficient to find all segments covering P.
                const cell = grid[idx];
                if (!cell || cell.length === 0) continue;

                // Copy cell to avoid modification issues during iteration
                const candidates = [...cell];

                for (const s of candidates) {
                    if (s.dead) continue;

                    if (isPointOnSegment(p, s.data.p0, s.data.p1)) {
                        // Split!
                        s.dead = true; // Logically removed

                        // Create children
                        const pushChild = (start: Point2D, end: Point2D) => {
                            const dx = end.x - start.x;
                            const dy = end.y - start.y;
                            if (dx * dx + dy * dy < 1e-12) return;

                            const newSeg = { data: { ...s.data, p0: start, p1: end }, dead: false, id: nextId++ };
                            processed.push(newSeg);

                            // Re-inject into grid
                            const newIndices = getGridIndices(start, end);
                            for (const gIdx of newIndices) {
                                grid[gIdx].push(newSeg);
                            }
                        };

                        pushChild(s.data.p0, p);
                        pushChild(p, s.data.p1);
                    }
                }
            }
        }

        if (operations >= MAX_OPS) console.warn('[ConstrainedTriangulator] Planarization hit safety limit (Grid)!');

        // Filter dead packets from processed (some might have been killed after adding)
        return processed.filter(p => !p.dead).map(p => p.data);
    }

    /**
     * Main Entry Point
     * Generates a high-quality mesh from feature points.
     * 
     * Pipeline:
     * 1. Feature Clean & Chain: Organize raw GPU points into clean polylines.
     * 2. Seam Enforcement: Ensure topology wraps correctly at u=0/1.
     * 3. Adaptive Sampling: Generate background points using Poisson Disk with variable density.
     * 4. Constrained Delaunay: Triangulate the domain.
     * 5. Stitching: Weld the seam topologically.
     * 
     * @param features - Feature points from GPU extraction
     * @param dimensions - Pot dimensions for physical scaling
     * @param importanceMap - Optional GPU-computed importance map for adaptive density
     * @param importanceGridSize - Size of importance map grid (default 64)
     */
    static generateFullPot(
        features: FeaturePoint[],
        dimensions?: PotDimensions,
        importanceMap?: Float32Array,
        importanceGridSize: number = 64
    ): TriangulatedMesh {
        console.log('[ConstrainedTriangulator] Using CDT mode with feature constraints');
        if (importanceMap) {
            console.log(`[ConstrainedTriangulator] Using GPU importance map (${importanceGridSize}x${importanceGridSize})`);
        }

        // Estimate physical scales (used for anisotropic density matching)
        // Default to 1.0 if no dimensions provided
        const scaleH = dimensions?.H || 1.0;
        const avgR = dimensions ? (dimensions.Rt + dimensions.Rb) * 0.5 : (1.0 / TAU);
        const scaleW = avgR * TAU; // Physical circumference

        // 1. Extract feature chains, seam points, and curve buffer points
        const { chains, seamPoints, curveBufferPoints } = this.extractChains(features, scaleW, scaleH);
        console.log(`[ConstrainedTriangulator] Extracted ${chains.length} chains, ${seamPoints.length} seam points, ${curveBufferPoints.length} buffer points`);

        // =========================================================
        // DOMAIN SCALING: Transform UV -> Physical-ish Space
        // =========================================================
        // Issue: CDT in [0,1]x[0,1] creates isotropic triangles in UV.
        // Physically, the pot is W wide and H high. W ~= 3*H.
        // This stretches UV-isotropic triangles into 3:1 long slivers physically.
        // Fix: Scale U by aspect ratio (AR) before CDT, then unscale back.
        // CDT will then minimize "physical" skinny triangles.
        const aspectRatio = (scaleH > 0.001) ? (scaleW / scaleH) : 1.0;
        console.log(`[ConstrainedTriangulator] Anisotropic Scaling: AR=${aspectRatio.toFixed(3)} (W=${scaleW.toFixed(2)}, H=${scaleH.toFixed(2)})`);

        // Transform Inputs
        chains.forEach(c => c.forEach(p => p.x *= aspectRatio));
        seamPoints.forEach(p => p.x *= aspectRatio);
        curveBufferPoints.forEach(p => p.x *= aspectRatio);

        // 1.5 DECIMATION - chains MUST match background grid density
        // Background uses BASE_GRID=64 (with up to 3x subdivision for importance)
        // Using 1/64 to match the base grid spacing, preventing density mismatch
        // SCALED: Spacing must be relative to scaled domain.
        // UV spacing 1/64 -> Scaled Spacing AR/64? No.
        // We want constant physical density.
        // If grid is 64 high (H), we want ~64*AR wide (W).
        // Grid cell size in scaled space: `1.0/64`.
        // So decimation target should be `1.0/64` in Scaled Space.
        // 1.5 DECIMATION
        // Background max subdivision is 3x (1/192).
        // To ensure feature edges are finer than the background, we need smaller spacing.
        // User requested "very fine" edge triangles (much smaller than 1.5mm).
        // Increasing density to 1/1024 (~0.001) to reduce aspect ratio against 0.00025 buffer.
        const TARGET_SPACING = 1.0 / 1024; // High density features

        const decimatedChains = chains.map(chain => this.decimateChain(chain, TARGET_SPACING));
        const decimatedPointCount = decimatedChains.reduce((sum, c) => sum + c.length, 0);
        console.log(`[ConstrainedTriangulator] Decimated chains: ${decimatedPointCount} points (from ${chains.reduce((s, c) => s + c.length, 0)})`);

        // 1.6 Generate BUFFER ZONE points - DISABLED (v3.7 Feature-Only Subdivision)
        // Buffers cause artifacts at sharp corners. We rely on refinement (step 3.5).
        const bufferPoints: Point2D[] = [];

        /* v3.7 - Disable Structured Buffer
        const BUFFER_OFFSET = TARGET_SPACING * 1.5; 
        for (const chain of decimatedChains) {
             ... (loop code) ...
        }
        console.log(`[ConstrainedTriangulator] Generated ${bufferPoints.length} structured buffer points.`);
        */
        console.log(`[ConstrainedTriangulator] Structured Buffer: DISABLED (v3.7 mode)`);

        // 2. Generate adaptive background points
        // Must pass AR to fill [0, AR] domain
        const bgPoints = this.generateAdaptiveBackground(decimatedChains, aspectRatio, importanceMap, importanceGridSize);
        console.log(`[ConstrainedTriangulator] Generated ${bgPoints.length} background points`);

        // 3. Run Constrained Delaunay Triangulation
        // Pass seamPoints to ensure boundary vertices exist for stitching
        // MERGE into a single buffer array to ensure they persist through refinement
        const allBufferPoints = [...curveBufferPoints, ...bufferPoints, ...seamPoints];
        const outerMesh = this.runCDT(decimatedChains, bgPoints, allBufferPoints, aspectRatio);

        // =========================================================
        // UNSCALE: Transform Physical-ish -> UV Space
        // =========================================================
        if (aspectRatio !== 1.0) {
            for (let i = 0; i < outerMesh.vertices.length; i += 3) {
                outerMesh.vertices[i] /= aspectRatio;
            }
        }

        console.log(`[ConstrainedTriangulator] CDT: ${outerMesh.vertices.length / 3} vertices, ${outerMesh.indices.length / 3} triangles`);

        // 3.5. CPU Refinement DISABLED (v3.9):
        // refineTriangleQuality re-triangulates bad triangles, but near features this creates
        // OVERLAPPING geometry (NM Count 4 edges) and 3.5× MORE degenerates (32K→112K).
        // The GPU subdivision + feature proximity boost handles feature-adjacent refinement better.
        const refinedMesh = outerMesh;

        // 4. Stitch the seam at theta=0/2π
        const stitched = this.stitchSeam(refinedMesh, aspectRatio);

        // 5. Append other surfaces (inner wall, rim, bottom, drain)
        const fullMesh = this.appendSurfaces(stitched);

        console.log(`[ConstrainedTriangulator] Full mesh: ${fullMesh.vertices.length / 3} vertices, ${fullMesh.indices.length / 3} triangles`);
        return fullMesh;
    }

    // ===================================
    // 1. Feature Processing
    // ===================================

    /**
     * Decimates a chain to match a target point spacing.
     * Keeps first/last points and samples intermediate points at roughly targetSpacing distance.
     * This prevents density mismatch between features and background grid.
     */
    private static decimateChain(chain: Point2D[], targetSpacing: number): Point2D[] {
        if (chain.length <= 2) return chain; // Keep short chains as-is

        const result: Point2D[] = [chain[0]];
        let accumulatedDist = 0;

        for (let i = 1; i < chain.length - 1; i++) {
            const prev = chain[i - 1];
            const curr = chain[i];
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            accumulatedDist += Math.sqrt(dx * dx + dy * dy);

            if (accumulatedDist >= targetSpacing) {
                result.push(curr);
                accumulatedDist = 0;
            }
        }

        // Always keep last point
        result.push(chain[chain.length - 1]);

        return result;
    }

    public static extractChains(rawFeatures: FeaturePoint[], scaleW: number = 1, scaleH: number = 1): { chains: Point2D[][], seamPoints: Point2D[], curveBufferPoints: Point2D[] } {
        if (rawFeatures.length === 0) return { chains: [], seamPoints: [], curveBufferPoints: [] };

        // ===========================================
        // PHASE 1: Normalize and Deduplicate Points
        // ===========================================
        // MARGIN REMOVED for "Zero-Gap" topology. Exact [0,1] range used.
        // ULTRA FIDELITY: 0.00001 = 0.02 pixels at 2048 res
        const DEDUP_EPSILON = 0.00001;
        const MIN_SEGMENT_LENGTH = 0.00005; // 0.05px

        // Normalize to [0,1] exactly - PRESERVE TYPE for separate chaining
        // Normalize to [0,1] exactly - PRESERVE TYPE for separate chaining
        const rawPoints = this.normalizeFeatures(rawFeatures);



        // Spatial hash deduplication
        const dedupGrid = new Map<string, number>();
        const dedupKey = (x: number, y: number) =>
            `${Math.round(x / DEDUP_EPSILON)}_${Math.round(y / DEDUP_EPSILON)}`;

        const points: { x: number, y: number, strength: number, type: number, idx: number }[] = [];
        for (let i = 0; i < rawPoints.length; i++) {
            const p = rawPoints[i];
            const key = dedupKey(p.x, p.y);
            if (!dedupGrid.has(key)) {
                dedupGrid.set(key, points.length);
                points.push({ ...p, idx: points.length });
            } else {
                // Keep the stronger point
                const existingIdx = dedupGrid.get(key)!;
                if (p.strength > points[existingIdx].strength) {
                    points[existingIdx] = { ...p, idx: existingIdx };
                }
            }
        }

        console.log(`[ConstrainedTriangulator] Deduplicated: ${rawPoints.length} -> ${points.length} unique points`);

        // ===========================================
        // PHASE 2: Greedy Chaining BY FEATURE TYPE
        // Ridges and valleys must be chained separately!
        // Previous bug: mixing types caused valleys to jump to ridges
        // ===========================================

        // Relaxed constraints for robustness with sparse user input?
        // NO. "Wild" jumps are caused by too loose constraints.
        // If density is high (as user claims), we should restrain this.
        const MAX_CONNECT_DIST = 0.05; // Reduced from 0.2 to 5% of domain (prevent cross-feature jumps)
        const gridCell = 0.05; // Match connect dist
        const chains: Point2D[][] = [];

        // Get unique feature types present
        const featureTypes = [...new Set(points.map(p => p.type))];
        console.log(`[ConstrainedTriangulator] Chaining ${featureTypes.length} feature types separately: ${featureTypes.join(', ')}`);

        for (const featureType of featureTypes) {
            // Filter points to this type only
            const typePoints = points.filter(p => p.type === featureType);
            if (typePoints.length < 2) continue;

            // Sort by scanline for deterministic chaining
            typePoints.sort((a, b) => (a.y - b.y) || (a.x - b.x));

            // Build spatial grid for this type
            const grid = new Map<string, number[]>();
            const toKey = (x: number, y: number) =>
                `${Math.floor(x / gridCell)}_${Math.floor(y / gridCell)}`;

            typePoints.forEach((p, i) => {
                const k = toKey(p.x, p.y);
                if (!grid.has(k)) grid.set(k, []);
                grid.get(k)!.push(i);
            });

            const visited = new Uint8Array(typePoints.length);

            for (let i = 0; i < typePoints.length; i++) {
                if (visited[i]) continue;

                let chain: Point2D[] = [{ x: typePoints[i].x, y: typePoints[i].y }];
                visited[i] = 1;
                let currentIdx = i;

                // Track direction for direction-aware selection
                let prevDirX = 0, prevDirY = 0;
                const GRID_W = Math.ceil(1.0 / gridCell);

                while (true) {
                    const curr = typePoints[currentIdx];
                    let bestNextIdx = -1;
                    let bestScore = Infinity; // Lower is better
                    let bestIsWrapped = false;
                    let bestWrapOffset = 0;

                    const gx = Math.floor(curr.x / gridCell);
                    const gy = Math.floor(curr.y / gridCell);

                    for (let jx = -1; jx <= 1; jx++) {
                        for (let jy = -1; jy <= 1; jy++) {
                            // Handle Grid Wrapping
                            let nx = gx + jx;
                            if (nx < 0) nx += GRID_W;
                            else if (nx >= GRID_W) nx -= GRID_W;

                            const cellKey = `${nx}_${gy + jy}`;
                            // console.log(`[Loop Key] checking ${cellKey} for (${curr.x}, ${curr.y})`);
                            const neighbors = grid.get(cellKey);
                            if (!neighbors) continue;

                            for (const nIdx of neighbors) {
                                if (visited[nIdx]) continue;
                                const next = typePoints[nIdx];

                                let dx = next.x - curr.x;
                                let isWrapped = false;
                                let wrapOffsetVal = 0;

                                // Detect Wraparound (shortest path)
                                if (dx > 0.5) {
                                    dx -= 1.0;
                                    isWrapped = true;
                                    wrapOffsetVal = -1.0; // next is physically "left" of 0
                                } else if (dx < -0.5) {
                                    dx += 1.0;
                                    isWrapped = true;
                                    wrapOffsetVal = 1.0; // next is physically "right" of 1
                                }

                                const dy = next.y - curr.y;
                                const dist = Math.sqrt(dx * dx + dy * dy);

                                if (dist > MAX_CONNECT_DIST) continue;

                                // Direction-aware scoring
                                let score = dist;

                                if (chain.length >= 2 && (prevDirX !== 0 || prevDirY !== 0)) {
                                    const candDirX = dx / dist;
                                    const candDirY = dy / dist;
                                    const dot = prevDirX * candDirX + prevDirY * candDirY;

                                    // STRICTER TURN PENALTY
                                    // If dot < 0 (angle > 90 deg), forbid it.
                                    // Valleys/Ridges don't turn 90 degrees instantly.
                                    if (dot < 0.0) continue;

                                    const directionPenalty = dist * (1 - dot) * 2.0; // Stronger penalty for turns
                                    score += directionPenalty;
                                }

                                if (score < bestScore) {
                                    bestScore = score;
                                    bestNextIdx = nIdx;
                                    bestIsWrapped = isWrapped;
                                    bestWrapOffset = wrapOffsetVal;
                                }
                            }
                        }
                    }

                    if (bestNextIdx !== -1) {
                        const best = typePoints[bestNextIdx];

                        // Recover wrapped dx for direction update
                        let dx = best.x - curr.x;
                        if (bestWrapOffset === -1.0) dx -= 1.0;
                        if (bestWrapOffset === 1.0) dx += 1.0;
                        const dy = best.y - curr.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        // Update direction for next iteration
                        prevDirX = dx / dist;
                        prevDirY = dy / dist;

                        visited[bestNextIdx] = 1;

                        if (bestIsWrapped) {
                            // GHOST SEGMENT LOGIC: Split chain at boundary
                            const slope = dy / dx; // dx is already wrapped

                            if (dx > 0) {
                                // Going Right -> Cross 1.0
                                // y at x=1.0: y = curr.y + slope * (1.0 - curr.x)
                                const yInt = curr.y + slope * (1.0 - curr.x);
                                const yIntClamped = Math.max(0, Math.min(1, yInt));

                                chain.push({ x: 1.0, y: yIntClamped });
                                if (chain.length > 1) chains.push(chain);

                                // Start new chain at 0.0
                                chain = [{ x: 0.0, y: yIntClamped }];
                            } else {
                                // Going Left -> Cross 0.0
                                // y at x=0.0: y = curr.y + slope * (0.0 - curr.x)
                                const yInt = curr.y + slope * (0.0 - curr.x);
                                const yIntClamped = Math.max(0, Math.min(1, yInt));

                                chain.push({ x: 0.0, y: yIntClamped });
                                if (chain.length > 1) chains.push(chain);

                                // Start new chain at 1.0
                                chain = [{ x: 1.0, y: yIntClamped }];
                            }
                        }

                        chain.push({ x: best.x, y: best.y });
                        currentIdx = bestNextIdx;
                    } else {
                        break;
                    }
                }
                if (chain.length >= 2) chains.push(chain);
            }

            console.log(`[ConstrainedTriangulator] Type ${featureType}: ${chains.length} chains built`);
        } // End of featureType loop

        console.log(`[ConstrainedTriangulator] Built ${chains.length} total chains with ${chains.reduce((a, c) => a + c.length, 0)} total points`);

        // ===========================================
        // PHASE 3: SIMPLIFY & DENSIFY Chains
        // 1. Simplify: Remove noise from raw GPU pixels (Ramer-Douglas-Peucker)
        // 2. Densify: Add interpolated points so CDT edges follow curves precisely
        // ===========================================
        // ULTRA FIDELITY: 0.00001 = 0.02 pixel tolerance.
        // SIGNAL RECONSTRUCTION: Set to 0.00001 (High Fidelity) to preserve the
        // smooth vertices generated by smoothChain, avoiding polygonal artifacts.
        const SIMPLIFY_TOLERANCE = 0.00001;
        // 0.1% of domain = ~1000 segments per full chain. Extremely dense.
        const MAX_SEGMENT_LENGTH = 0.001;

        const densifyChain = (chain: Point2D[]): Point2D[] => {
            if (chain.length < 2) return chain;

            // Step 0: Signal Restoration (Smoothing) - NEW
            // Melt jitter/noise into a physical curve
            // 10 Iterations for ultra-smooth signal recovery
            const smoothed = ConstrainedTriangulator.smoothChain(chain);

            // Step 1: Simplify
            const simplified = simplify(smoothed, SIMPLIFY_TOLERANCE, true);

            // Step 2: Densify (UV-space distance, not physical)
            if (simplified.length < 2) return simplified;

            const densified: Point2D[] = [simplified[0]];

            for (let i = 1; i < simplified.length; i++) {
                const prev = simplified[i - 1];
                const curr = simplified[i];
                const dx = curr.x - prev.x;
                const dy = curr.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy);

                if (len < MIN_SEGMENT_LENGTH) continue;

                if (len > MAX_SEGMENT_LENGTH) {
                    const numSegments = Math.ceil(len / MAX_SEGMENT_LENGTH);
                    for (let j = 1; j < numSegments; j++) {
                        const t = j / numSegments;
                        densified.push({
                            x: prev.x + dx * t,
                            y: prev.y + dy * t
                        });
                    }
                }
                densified.push(curr);
            }

            return densified;
        };

        const densifiedChains = chains.map(c => densifyChain(c))
            .filter(c => c.length >= 2);

        const totalDensifiedPoints = densifiedChains.reduce((a, c) => a + c.length, 0);
        console.log(`[ConstrainedTriangulator] Densified: ${chains.length} chains -> ${totalDensifiedPoints} total points`);

        // PHASE 4: Corner Support Buffer (Determinisitc)
        // Adds "magnet" points inside sharp corners to break huge fan triangles.
        const curveBufferPoints: Point2D[] = [];

        const CORNER_THRESHOLD = 2.6; // Radians (approx 150 degrees). Anything sharper gets a point.
        // We want to support turns involved in "features".
        // If angle is < 150 deg, put a point.
        // Straight line = PI (3.14). 90 deg = PI/2 (1.57).

        // Offset distance: needs to be close enough to be the "nearest neighbor" for the corner vertex
        // Safe to use tight offset because create_midpoint snap is DISABLED
        const CORNER_OFFSET = 0.0005;

        for (const chain of densifiedChains) {
            if (chain.length < 3) continue;

            for (let i = 1; i < chain.length - 1; i++) {
                const prev = chain[i - 1];
                const curr = chain[i];
                const next = chain[i + 1];

                // Vectors
                const v1x = curr.x - prev.x;
                const v1y = curr.y - prev.y;
                const len1 = Math.sqrt(v1x * v1x + v1y * v1y);

                const v2x = next.x - curr.x;
                const v2y = next.y - curr.y;
                const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

                if (len1 < 1e-9 || len2 < 1e-9) continue;

                // Normalize
                const dir1x = v1x / len1;
                const dir1y = v1y / len1;
                const dir2x = v2x / len2;
                const dir2y = v2y / len2;

                // Dot product for angle
                // dot = cos(theta). theta is angle *change*? No, angle between vectors.
                // We want interior angle.
                // Vector 1 is prev->curr. Vector 2 is curr->next.
                // Interior angle requires reversing V1: curr->prev.
                const dot = (-dir1x * dir2x) + (-dir1y * dir2y);
                const angle = Math.acos(Math.max(-1, Math.min(1, dot))); // 0..PI

                if (angle < CORNER_THRESHOLD) {
                    // Calculate Bisector
                    // bisector = normalize(normalize(curr->prev) + normalize(curr->next))
                    // vLeft = (-dir1x, -dir1y)
                    // vRight = (dir2x, dir2y)
                    const bx = -dir1x + dir2x;
                    const by = -dir1y + dir2y;
                    const bLen = Math.sqrt(bx * bx + by * by);

                    if (bLen > 1e-9) {
                        const bnx = bx / bLen;
                        const bny = by / bLen;

                        // Add support point
                        const px = curr.x + bnx * CORNER_OFFSET;
                        const py = curr.y + bny * CORNER_OFFSET;

                        // Bounds check
                        if (px > 0.001 && px < scaleW / scaleH - 0.001 && py > 0.001 && py < 0.999) {
                            curveBufferPoints.push({ x: px, y: py });
                        }
                    }
                }
            }
        }
        console.log(`[ConstrainedTriangulator] Generated ${curveBufferPoints.length} Corner Support points`);

        // 4b. Parallel Feature Buffer
        // v3.10: Tight ring REMOVED — 0.0005 UV creates Feature Shield triangles that
        // span the curvature maximum at ridges. Their face normals are irrecoverably bad.
        // The GPU proximity boost (5% UV influence zone) now handles near-feature subdivision.
        // Wide ring (0.002 UV) is the closest buffer — far enough that CDT triangles
        // don't span extreme curvature, close enough to prevent "reaching" artifacts.
        const PARALLEL_OFFSET_WIDE = 0.002;   // ~0.72° — closest ring to feature
        const PARALLEL_OFFSET_EXTRA = 0.005;  // ~1.8° extra ring (bridges to background grid)
        let parallelCount = 0;

        for (const chain of densifiedChains) {
            if (chain.length < 2) continue;

            for (let i = 0; i < chain.length - 1; i++) {
                const p1 = chain[i];
                const p2 = chain[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);

                if (len < 1e-9) continue;

                // Segment Normal (-dy, dx) - perpendicular to segment
                const nx = -dy / len;
                const ny = dx / len;

                // WIDE RING: Full coverage (midpoint + endpoints) — closest ring needs no gaps
                const wideSamples = [
                    { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 },
                    p1, p2
                ];
                for (const pt of wideSamples) {
                    for (const sign of [1, -1]) {
                        const px = pt.x + nx * PARALLEL_OFFSET_WIDE * sign;
                        const py = pt.y + ny * PARALLEL_OFFSET_WIDE * sign;
                        if (px > 1e-5 && px < 1.0 - 1e-5 && py > 1e-5 && py < 1.0 - 1e-5) {
                            curveBufferPoints.push({ x: px, y: py });
                            parallelCount++;
                        }
                    }
                }

                // EXTRA RING: Midpoint-only — bridges to background grid
                const mid = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
                for (const sign of [1, -1]) {
                    const px = mid.x + nx * PARALLEL_OFFSET_EXTRA * sign;
                    const py = mid.y + ny * PARALLEL_OFFSET_EXTRA * sign;
                    if (px > 1e-5 && px < 1.0 - 1e-5 && py > 1e-5 && py < 1.0 - 1e-5) {
                        curveBufferPoints.push({ x: px, y: py });
                        parallelCount++;
                    }
                }
            }

            // Add End Caps (Circle around endpoints)
            // Prevents huge triangles from hooking onto the exposed feature tips.
            const endpoints = [chain[0], chain[chain.length - 1]];
            for (const ep of endpoints) {
                const offsets = [
                    { x: PARALLEL_OFFSET_WIDE, y: 0 },
                    { x: -PARALLEL_OFFSET_WIDE, y: 0 },
                    { x: 0, y: PARALLEL_OFFSET_WIDE },
                    { x: 0, y: -PARALLEL_OFFSET_WIDE }
                ];
                for (const off of offsets) {
                    const px = ep.x + off.x;
                    const py = ep.y + off.y;
                    if (px > 1e-5 && px < 1.0 - 1e-5 && py > 1e-5 && py < 1.0 - 1e-5) {
                        curveBufferPoints.push({ x: px, y: py });
                        parallelCount++;
                    }
                }
            }
        }
        console.log(`[ConstrainedTriangulator] Generated ${parallelCount} Parallel Buffer points`);

        // 5. Force Seam Nodes
        // We define fixed nodes on left/right boundary to ensure they match later
        // High resolution seams to match ancillary grids (w=180/360) 
        // and ensure watertight welding.
        // 180 ensures edge length ~2 degrees, small enough for WeldMesh epsilon.
        // INCREASED to 1024 to ensure boundary edges are < 0.001 (Safety Cap).
        // If boundary edges are > Safety Cap, they get split, causing asymmetric T-Junctions.
        const SEAMS = 1024; // Number of vertical divisions (~0.001 spacing)
        const seamPoints: Point2D[] = [];
        for (let k = 0; k <= SEAMS; k++) {
            const y = k / SEAMS;
            seamPoints.push({ x: 0, y });
            seamPoints.push({ x: 1, y }); // Will be aliased later, but needed for triangulation
        }

        // Also Add Cap boundaries
        for (let k = 0; k <= SEAMS; k++) {
            const x = k / SEAMS;
            seamPoints.push({ x, y: 0 }); // Bottom
            seamPoints.push({ x, y: 1 }); // Top
        }

        return { chains: densifiedChains, seamPoints, curveBufferPoints };
    }

    /**
     * Signal Reconstruction: Two-Pass Smoothing
     * 
     * Pass 1: Gaussian blur (radius R) — directly removes oscillations with wavelength < ~2R.
     *         This is a one-shot filter, unlike Laplacian which needs O(λ²) iterations.
     *         Endpoints are pinned (not smoothed).
     * 
     * Pass 2: Ohtake Laplacian polish — regularizes vertex spacing along the curve.
     *         Light (10 iterations, lambda=0.3) since the heavy lifting is done by Gaussian.
     */
    private static smoothChain(chain: Point2D[]): Point2D[] {
        if (chain.length < 3) return [...chain];

        // =============================================
        // PASS 1: Gaussian Blur (Low-frequency killer)
        // =============================================
        // Radius 15 removes oscillations with wavelength < ~30 points.
        // For a chain of 1000+ points over the circumference, this removes
        // wobble shorter than ~3% of domain (~11°) — the user-reported oscillations.
        const GAUSS_RADIUS = 15;
        const gaussed = chain.map(p => ({ ...p }));

        for (let i = 1; i < chain.length - 1; i++) {
            let sumX = 0, sumY = 0, sumW = 0;
            const lo = Math.max(1, i - GAUSS_RADIUS);
            const hi = Math.min(chain.length - 2, i + GAUSS_RADIUS);

            for (let j = lo; j <= hi; j++) {
                const d = (j - i) / GAUSS_RADIUS;
                const w = Math.exp(-2.0 * d * d);
                sumX += chain[j].x * w;
                sumY += chain[j].y * w;
                sumW += w;
            }
            gaussed[i] = { x: sumX / sumW, y: sumY / sumW };
        }

        // =============================================
        // PASS 2: Ohtake Laplacian Polish (Regularize spacing)
        // =============================================
        const ITERATIONS = 10;
        const LAMBDA = 0.3;    // Normal smoothing
        const MU = 0.5;        // Tangential regularization

        let current = gaussed;

        for (let it = 0; it < ITERATIONS; it++) {
            const next = current.map(p => ({ ...p }));

            for (let i = 1; i < current.length - 1; i++) {
                const prev = current[i - 1];
                const curr = current[i];
                const nextP = current[i + 1];

                const lx = 0.5 * (prev.x + nextP.x) - curr.x;
                const ly = 0.5 * (prev.y + nextP.y) - curr.y;

                let tx = nextP.x - prev.x;
                let ty = nextP.y - prev.y;
                const tLen = Math.sqrt(tx * tx + ty * ty);

                if (tLen < 1e-9) {
                    next[i].x = curr.x + lx * LAMBDA;
                    next[i].y = curr.y + ly * LAMBDA;
                    continue;
                }

                tx /= tLen;
                ty /= tLen;

                const dot = lx * tx + ly * ty;
                const ltx = dot * tx;
                const lty = dot * ty;
                const lnx = lx - ltx;
                const lny = ly - lty;

                next[i].x = curr.x + lnx * LAMBDA + ltx * MU;
                next[i].y = curr.y + lny * LAMBDA + lty * MU;
            }
            current = next;
        }
        return current;
    }

    // ===================================
    // 2. Adaptive Background Sampling
    // ===================================

    private static generateAdaptiveBackground(
        _chains: Point2D[][],
        aspectRatio: number,
        importanceMap?: Float32Array,
        importanceGridSize: number = 64
    ): Point2D[] {
        const candidates: Point2D[] = [];

        // If importance map provided, use adaptive density
        if (importanceMap && importanceMap.length === importanceGridSize * importanceGridSize) {
            // Adaptive Grid
            const BASE_GRID_Y = 64;
            const BASE_GRID_X = Math.round(BASE_GRID_Y * aspectRatio);

            // Cell dimensions in PHYSICAL-ISH Scaled Space ([0, AR] x [0, 1])
            // Effectively we want (cellW_scaled / cellH) ~= 1.0 (Physical Square)
            // AR = W/H.
            // Domain Width = AR. Domain Height = 1.
            // Width/GridX = AR/GridX
            // Height/GridY = 1/GridY
            // We set GridX = GridY * AR.
            // Width/GridX = AR / (GridY * AR) = 1/GridY.
            // Height/GridY = 1/GridY.
            // So cellW_scaled == cellH. Correct.

            const cellW = aspectRatio / BASE_GRID_X; // ~ 1/64
            const cellH = 1.0 / BASE_GRID_Y;         // 1/64

            // PRE-PASS: Mark grid cells that contain feature points
            // This forces max density near features, preventing "stretched triangles"
            const featureGrid = new Set<string>();
            for (const chain of _chains) {
                for (const p of chain) {
                    const gx = Math.floor(p.x / cellW);
                    const gy = Math.floor(p.y / cellH);
                    // Mark 3x3 neighborhood to ensure coverage
                    for (let j = -1; j <= 1; j++) {
                        for (let i = -1; i <= 1; i++) {
                            featureGrid.add(`${gx + i}_${gy + j}`);
                        }
                    }
                }
            }

            // Importance Map is always 64x64 (square buffer). We must stretch sampling.
            for (let gy = 0; gy < BASE_GRID_Y; gy++) {
                for (let gx = 0; gx < BASE_GRID_X; gx++) {
                    // Sample importance at UV center
                    // u is normalized 0..1 (x / AR)
                    const u = ((gx + 0.5) * cellW) / aspectRatio;
                    const t = ((gy + 0.5) * cellH); // Already 0..1

                    // Robust sampling
                    const impX = Math.max(0, Math.min(importanceGridSize - 1, Math.floor(u * importanceGridSize)));
                    const impY = Math.max(0, Math.min(importanceGridSize - 1, Math.floor(t * importanceGridSize)));
                    const impIdx = impY * importanceGridSize + impX;
                    let importance = importanceMap[impIdx] || 0;

                    // OVERRIDE: If near feature, force Max Importance
                    if (featureGrid.has(`${gx}_${gy}`)) {
                        importance = 1.0;
                    }

                    let subdiv = 1;
                    // HARMONIZATION: Increase max density to 4 (approx 0.004 spacing) to match features (0.004)
                    if (importance >= 1.0) subdiv = 4;      // Near features
                    else if (importance > 0.75) subdiv = 3;
                    else if (importance > 0.5) subdiv = 2;
                    else subdiv = 1;

                    // Skip very low importance
                    if (importance < 0.1 && Math.random() > 0.3) continue;

                    const subCellW = cellW / subdiv;
                    const subCellH = cellH / subdiv;

                    for (let sy = 0; sy < subdiv; sy++) {
                        for (let sx = 0; sx < subdiv; sx++) {
                            const rx = 0.2 + Math.random() * 0.6;
                            const ry = 0.2 + Math.random() * 0.6;
                            const px = gx * cellW + sx * subCellW + rx * subCellW;
                            const py = gy * cellH + sy * subCellH + ry * subCellH;
                            candidates.push({ x: px, y: py });
                        }
                    }
                }
            }

            // NOTE: Stochastic Feature Buffer Cloud removed (v3.9).
            // Was permanently disabled (`if (false)`). The importance map's 3x3 neighborhood
            // marking + adaptive grid subdivision handles feature-adjacent density better
            // without the non-determinism of random point clouds.

            console.log(`[ConstrainedTriangulator] Background: ${candidates.length} points (AR=${aspectRatio.toFixed(2)})`);
        } else {
            // Fallback: Anisotropic Uniform Grid
            const GRID_Y = 64;
            const GRID_X = Math.round(GRID_Y * aspectRatio);

            const cellW = aspectRatio / GRID_X;
            const cellH = 1.0 / GRID_Y;

            for (let gy = 0; gy < GRID_Y; gy++) {
                for (let gx = 0; gx < GRID_X; gx++) {
                    const rx = 0.2 + Math.random() * 0.6;
                    const ry = 0.2 + Math.random() * 0.6;
                    const px = (gx + rx) * cellW;
                    const py = (gy + ry) * cellH;

                    // SAFETY ZONE:
                    // Prevent background points from spawning too close to the Dense Periodic Boundary (stepsH=32).
                    // If points are too close (< 0.02), CDT creates slivers that trigger infinite refinement.
                    if (px > 0.02 && px < aspectRatio - 0.02) {
                        candidates.push({ x: px, y: py });
                    }
                }
            }

            console.log(`[ConstrainedTriangulator] Background: ${candidates.length} points (uniform ${GRID_X}x${GRID_Y})`);
        }

        return candidates;
    }

    // ===================================
    // 3. Constrained Delaunay Logic
    // ===================================

    private static runCDT(chains: Point2D[][], bgPoints: Point2D[], curveBufferPoints: Point2D[] = [], aspectRatio: number = 1.0): TriangulatedMesh {
        // =========================================================================================
        // NEW PIPELINE: Segment Collection -> Planarization -> Deduplication -> CDT
        // =========================================================================================

        interface TaggedSegment { p0: Point2D, p1: Point2D, type: 'boundary' | 'feature' }
        const segments: TaggedSegment[] = [];

        // 1. Generate Boundary Segments
        // -----------------------------
        // We replicate the boundary point generation logic but turn it into segments immediately.
        const stepsW = Math.ceil(4 * aspectRatio); // sparse boundary
        const stepsH = 32; // Dense periodic boundary to match background grid

        const topPoints: Point2D[] = [];
        const bottomPoints: Point2D[] = [];
        const leftPoints: Point2D[] = [];
        const rightPoints: Point2D[] = [];

        // Corners
        const c00 = { x: 0, y: 0 };
        const c10 = { x: aspectRatio, y: 0 };
        const c11 = { x: aspectRatio, y: 1 };
        const c01 = { x: 0, y: 1 };

        // Edges
        for (let i = 1; i < stepsW; i++) {
            const t = i / stepsW;
            bottomPoints.push({ x: t * aspectRatio, y: 0 });
            topPoints.push({ x: t * aspectRatio, y: 1 });
        }
        for (let i = 1; i < stepsH; i++) {
            const t = i / stepsH;
            leftPoints.push({ x: 0, y: t });
            rightPoints.push({ x: aspectRatio, y: t });
        }

        // Create Segments (CCW Loop: Bottom -> Right -> Top -> Left)
        // Bottom: c00 -> bottom -> c10
        let prev = c00;
        bottomPoints.forEach(p => { segments.push({ p0: prev, p1: p, type: 'boundary' }); prev = p; });
        segments.push({ p0: prev, p1: c10, type: 'boundary' });

        // Right: c10 -> right -> c11
        prev = c10;
        rightPoints.forEach(p => { segments.push({ p0: prev, p1: p, type: 'boundary' }); prev = p; });
        segments.push({ p0: prev, p1: c11, type: 'boundary' });

        // Top: c11 -> top (reversed) -> c01
        prev = c11;
        [...topPoints].reverse().forEach(p => { segments.push({ p0: prev, p1: p, type: 'boundary' }); prev = p; });
        segments.push({ p0: prev, p1: c01, type: 'boundary' });

        // Left: c01 -> left (reversed) -> c00
        prev = c01;
        [...leftPoints].reverse().forEach(p => { segments.push({ p0: prev, p1: p, type: 'boundary' }); prev = p; });
        segments.push({ p0: prev, p1: c00, type: 'boundary' });

        // 2. Generate Feature Segments
        // ----------------------------
        chains.forEach(chain => {
            if (chain.length < 2) return;
            for (let k = 0; k < chain.length - 1; k++) {
                // Snap to bounds for robustness
                let p0 = chain[k];
                let p1 = chain[k + 1];

                // Helper to clamp
                const clamp = (p: Point2D) => ({
                    x: Math.max(0, Math.min(aspectRatio, p.x)),
                    y: Math.max(0, Math.min(1.0, p.y))
                });
                p0 = clamp(p0);
                p1 = clamp(p1);

                segments.push({ p0, p1, type: 'feature' });
            }
        });

        console.log(`[CDT] Planarizing ${segments.length} constraint segments...`);

        // 3. Planarize (Segments vs Segments AND Segments vs Points)
        // ------------
        // Gather ALL points that will be constraint-ob aware.
        // We EXCLUDE bgPoints because they are random/grid and unlikely to intersect lines.
        // Including them (2000+) vs segments (200+) causes massive N*M slowdown or grid clamping issues.
        // Only *Buffer Points* (which track features) must strictly split segments.
        const allIntruderPoints = [...curveBufferPoints];

        const planarized = this.planarizeSegments(segments, allIntruderPoints, aspectRatio);
        console.log(`[CDT] Planarization complete: ${segments.length} -> ${planarized.length} segments`);

        // 4. Build Clean Inputs for CDT
        // -----------------------------
        // Sort: Boundary first for range tracking
        planarized.sort((a, b) => {
            if (a.type === b.type) return 0;
            return a.type === 'boundary' ? -1 : 1;
        });

        const DEDUP_TOL = 1e-5;
        const uniquePoints: Point2D[] = [];
        const pointMap = new Map<string, number>();

        const addPoint = (x: number, y: number): number => {
            // SAFETY NET: Snap to exact boundary if close (fixes Steiner point drift)
            if (x < 0.01) x = 0;
            if (Math.abs(x - aspectRatio) < 0.01) x = aspectRatio;

            const key = `${Math.round(x / DEDUP_TOL)}_${Math.round(y / DEDUP_TOL)}`;
            if (pointMap.has(key)) return pointMap.get(key)!;
            const idx = uniquePoints.length;
            uniquePoints.push({ x, y });
            pointMap.set(key, idx);
            return idx;
        };

        const finalEdges: [number, number][] = [];

        // Add Constraints
        for (const s of planarized) {
            const i0 = addPoint(s.p0.x, s.p0.y);
            const i1 = addPoint(s.p1.x, s.p1.y);
            if (i0 !== i1) finalEdges.push([i0, i1]);
        }

        // Count Boundary / Feature ranges (approximate but sufficient for protection)
        // We scan planarized to see where the transition happened?
        // Actually, just relying on the fact that we sorted them.
        // We can just assume that ALL points generated so far are "protected constraints".
        // refineTriangleQuality expects 'boundary', 'feature', 'buffer'.
        // We can lump boundary+feature into 'feature'.
        // Let's iterate and count carefully if needed, or just grab current count.
        const countConstraints = uniquePoints.length;

        console.log(`[runCDT] AR=${aspectRatio}, Constraints=${countConstraints}`);

        // 5. Add Buffers
        // --------------
        curveBufferPoints.forEach(p => addPoint(p.x, p.y));
        const countBuffer = uniquePoints.length - countConstraints;

        // 6. Add Background
        // -----------------
        bgPoints.forEach(p => addPoint(p.x, p.y));
        const countBackground = uniquePoints.length - (countConstraints + countBuffer);


        // 7. Run CDT
        // ----------
        // Convert to array format for cdt2d
        const ptArray = uniquePoints.map(p => [p.x, p.y] as [number, number]);

        let resultTriangles: number[][] | null = null;
        try {
            resultTriangles = cdt2d(ptArray, finalEdges);
        } catch (e) {
            console.error('[CDT] Primary triangulation failed!', e);
            // Fallback: Try without constraints?
            try {
                resultTriangles = cdt2d(ptArray, []);
            } catch (e2) {
                console.error('[CDT] Fallback triangulation failed!', e2);
            }
        }

        if (!resultTriangles) {
            return { vertices: new Float32Array(0), indices: new Uint32Array(0) };
        }

        // 8. Filter & Format
        // ------------------
        const validTriangles: number[][] = [];
        for (const tri of resultTriangles) {
            const p0 = uniquePoints[tri[0]];
            const p1 = uniquePoints[tri[1]];
            const p2 = uniquePoints[tri[2]];

            // Filter exterior
            const cx = (p0.x + p1.x + p2.x) / 3;
            const cy = (p0.y + p1.y + p2.y) / 3;
            if (cx < -1e-4 || cx > aspectRatio + 1e-4 || cy < -1e-4 || cy > 1 + 1e-4) continue;

            const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
            if (cross > 0) validTriangles.push(tri);
            else if (cross < 0) validTriangles.push([tri[0], tri[2], tri[1]]);
        }

        const vertices = new Float32Array(uniquePoints.length * 3);
        const indices = new Uint32Array(validTriangles.flat());

        for (let i = 0; i < uniquePoints.length; i++) {
            vertices[i * 3 + 0] = uniquePoints[i].x;
            vertices[i * 3 + 1] = uniquePoints[i].y;
            vertices[i * 3 + 2] = 0;
        }

        console.log(`[CDT] Success. Vertices: ${uniquePoints.length}, Triangles: ${validTriangles.length}`);

        // POST-CDT SNAP: Force boundary alignment for Steiner points
        // runCDT is in Physical Space [0, AR].
        for (let i = 0; i < vertices.length; i += 3) {
            const vx = vertices[i];
            // Snap Left
            if (vx < 0.01 && vx > 0) vertices[i] = 0;
            // Snap Right (AR)
            else if (Math.abs(vx - aspectRatio) < 0.01) {
                if (Math.abs(vx - aspectRatio) > 1e-9) console.log(`[CDT] Post-Snap Right: ${vx} -> ${aspectRatio}`);
                vertices[i] = aspectRatio;
            }
        }

        return {
            vertices,
            indices,
            ranges: {
                boundary: 0, // Lumped into feature for simplicity, protection works based on sum
                feature: countConstraints,
                buffer: countBuffer,
                background: countBackground
            }
        };
        /* 
           Legacy Block Removed:
           - Try 1/2/3 logic replaced by robust dedup + single fallback
           - Point array building (vertices loop) updated to use cleanPoints
        */
    }


    /**
     * Refines mesh quality by splitting long edges of skinny triangles.
     * Naive implementation: Finds bad triangles, adds midpoints of long edges, and re-triangulates.
     * 
     * DISABLED (v3.9): Caused 3.5× more degenerates. Kept for future re-evaluation.
     * 
     * @param mesh The input mesh
     * @param maxRatio Maximum allowed Aspect Ratio (Longest Edge / Shortest Altitude)
     * @param maxIterations Number of refinement passes
     */
    private static refineTriangleQuality(
        mesh: TriangulatedMesh,
        chains: Point2D[][],
        bufferPoints: Point2D[],
        aspectRatio: number,
        maxRatio: number = 3.0,
        maxIterations: number = 2
    ): TriangulatedMesh {
        let currentMesh = mesh;

        // Ensure we have something to work with
        if (currentMesh.vertices.length < 3) return currentMesh;

        // Refinement Loop (Re-enabled: skinny triangle shards need splitting)
        for (let it = 0; it < maxIterations; it++) {
            console.log(`[ConstrainedTriangulator] Refine Pass ${it + 1}/${maxIterations} starting...`);
            const vertices = currentMesh.vertices;
            const indices = currentMesh.indices;
            const newPoints: Point2D[] = [];
            const edgesToSplit = new Set<string>();

            // Safety Cap (vertices is Float32Array, 3 floats per vertex)
            if (vertices.length > 1500000) {
                console.warn('[ConstrainedTriangulator] Refinement aborted: Vertex count exceeded 500k safety limit.');
                break;
            }

            let badTriangles = 0;

            for (let i = 0; i < indices.length; i += 3) {
                const i0 = indices[i];
                const i1 = indices[i + 1];
                const i2 = indices[i + 2];

                // PROTECT BUFFER ZONE:
                // If the triangle is composed entirely of Boundary, Feature, or Buffer points,
                // it is part of the "Feature Shield". These triangles are INTENTIONALLY skinny.
                // Refining them destroys the shield and breaks constraints.
                // We use the 'ranges' metadata to identify these points.
                let protectedTri = false;
                if (currentMesh.ranges) {
                    const r = currentMesh.ranges;
                    const protectedCount = r.boundary + r.feature + r.buffer;
                    if (i0 < protectedCount && i1 < protectedCount && i2 < protectedCount) {
                        protectedTri = true;
                    }
                }

                const p0 = { x: vertices[i0 * 3], y: vertices[i0 * 3 + 1] };
                const p1 = { x: vertices[i1 * 3], y: vertices[i1 * 3 + 1] };
                const p2 = { x: vertices[i2 * 3], y: vertices[i2 * 3 + 1] };

                // Apply aspect ratio scaling for metric calculation
                const x0 = p0.x * aspectRatio, y0 = p0.y;
                const x1 = p1.x * aspectRatio, y1 = p1.y;
                const x2 = p2.x * aspectRatio, y2 = p2.y;

                const d01 = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
                const d12 = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                const d20 = Math.sqrt((x0 - x2) ** 2 + (y0 - y2) ** 2);

                const maxLen = Math.max(d01, d12, d20);

                // PROTECTION CHECK:
                // Only protect if the triangle is reasonably small. 
                // If a "protected" triangle spans a large distance (> 0.001, approx 0.3mm), it is a defect (Bridge).
                // We force refinement in that case.
                if (protectedTri && maxLen < 0.001) {
                    continue;
                }
                const s = (d01 + d12 + d20) / 2;
                const area = Math.sqrt(Math.max(0, s * (s - d01) * (s - d12) * (s - d20)));

                if (area < 1e-9) continue; // Degenerate

                // Aspect Ratio = Longest Edge / Shortest Altitude 
                // Shortest Altitude = 2 * Area / Longest Edge
                // Ratio = Longest^2 / (2 * Area)
                // Using simplified metric: R = abc / 4A / s (Circumradius/Inradius?)
                // Let's use simple Longest / Shortest Altitude
                const shortestAlt = (2 * area) / maxLen;
                const ratio = maxLen / shortestAlt;

                if (ratio > maxRatio) {
                    badTriangles++;

                    // Split the longest edge(s)
                    const splitEdge = (idxA: number, idxB: number) => {
                        const vA = { x: vertices[idxA * 3], y: vertices[idxA * 3 + 1] };
                        const vB = { x: vertices[idxB * 3], y: vertices[idxB * 3 + 1] };

                        // SEAM PROTECTION:
                        // Do NOT split edges that lie on the Seam Boundaries (x=0 or x=1.0).
                        // Splitting one side independently breaks symmetry and makes stitching impossible.
                        const EPS = 1e-4;
                        const isLeft = Math.abs(vA.x) < EPS && Math.abs(vB.x) < EPS;
                        // MESH IS IN UV SPACE [0,1] HERE. Check against 1.0, not AR.
                        const isRight = Math.abs(vA.x - 1.0) < EPS && Math.abs(vB.x - 1.0) < EPS;

                        // Also protect Top/Bottom to keep the rect clean? (Optional, but safe)
                        // const isTop = Math.abs(vA.y) < EPS && Math.abs(vB.y) < EPS;
                        // const isBottom = Math.abs(vA.y - 1.0) < EPS && Math.abs(vB.y - 1.0) < EPS;

                        if (isLeft || isRight) return;

                        const key = idxA < idxB ? `${idxA}_${idxB}` : `${idxB}_${idxA}`;
                        if (!edgesToSplit.has(key)) {
                            edgesToSplit.add(key);
                            newPoints.push({ x: (vA.x + vB.x) * 0.5, y: (vA.y + vB.y) * 0.5 });
                        }
                    };

                    if (d01 >= maxLen * 0.99) splitEdge(i0, i1);
                    if (d12 >= maxLen * 0.99) splitEdge(i1, i2);
                    if (d20 >= maxLen * 0.99) splitEdge(i2, i0);
                }
            }

            if (badTriangles === 0 || newPoints.length === 0) break;

            console.log(`[ConstrainedTriangulator] Refinement Pass ${it + 1}: Found ${badTriangles} bad triangles. Adding ${newPoints.length} steiner points.`);

            // Re-triangulate:
            // CRITICAL FIX: Do NOT include original features/buffers in 'bgPoints' for next pass.
            // If we do, they become unconstrained duplicates, causing "Large Triangle" artifacts.
            // We must extract ONLY the background points from the previous mesh.

            const bgPointsForNextPass: Point2D[] = [];

            if (currentMesh.ranges) {
                // We have metadata to cleanly extract strict background points
                const r = currentMesh.ranges;
                const offset = r.boundary + r.feature + r.buffer;
                const count = r.background;

                // Extract original background points
                for (let k = 0; k < count; k++) {
                    const idx = offset + k;
                    bgPointsForNextPass.push({
                        x: vertices[idx * 3],
                        y: vertices[idx * 3 + 1]
                    });
                }
            } else {
                // Fallback (should not happen with updated runCDT): use all points
                // This preserves old behavior but risks bugs.
                for (let k = 0; k < vertices.length / 3; k++) {
                    bgPointsForNextPass.push({ x: vertices[k * 3], y: vertices[k * 3 + 1] });
                }
            }

            // Add the NEW Steiner points from this refinement pass
            newPoints.forEach(p => bgPointsForNextPass.push(p));

            // Scale for CDT (Aspect Ratio)
            const scaledBgPoints = bgPointsForNextPass.map(p => ({ x: p.x * aspectRatio, y: p.y }));

            // Run CDT with CLEAN inputs:
            // 1. Chains (Constraints)
            // 2. Buffer Points (Support)
            // 3. Background + Steiner (Fill)
            const nextMesh = this.runCDT(chains, scaledBgPoints, bufferPoints, aspectRatio);

            if (aspectRatio !== 1.0) {
                for (let k = 0; k < nextMesh.vertices.length; k += 3) {
                    nextMesh.vertices[k] /= aspectRatio;
                }
            }

            currentMesh = nextMesh;
        }
        return currentMesh;
    }

    // 4. Seam Stitching
    // ===================================

    private static stitchSeam(mesh: TriangulatedMesh, _aspectRatio: number = 1.0): TriangulatedMesh {
        if (mesh.vertices.length === 0) return mesh;

        // Vertices at x=0 need to be unified with vertices at x=2PI
        // Since we normalized inputs, x=0 and x=1 (before 2PI scale).
        // BUT we scaled them back to 0..2PI in step 3.

        const EPS = 1e-3; // Relaxed to handle float drift
        // MESH IS IN UV SPACE [0, 1] HERE (unscaled in generateFullPot).
        const TAU = 1.0;

        // Map Y-coord to Index for the Left Seam (x ~ 0)
        // Quantize Y to handle float drift. Relaxed to 1000 (1e-3) to catch all matching pairs.
        const QUANT = 1000;
        const leftMap = new Map<string, number>();
        const vertices = mesh.vertices;
        const vCount = vertices.length / 3;

        for (let i = 0; i < vCount; i++) {
            const x = vertices[i * 3];
            const y = vertices[i * 3 + 1];
            const z = vertices[i * 3 + 2]; // Surface ID
            if (x < EPS) {
                // Key includes Surface ID to prevent cross-surface merging
                const key = `${Math.round(y * QUANT)}:${Math.round(z)}`;
                leftMap.set(key, i);
            }
        }



        // Remap array
        const remapping = new Int32Array(vCount);
        const validIndices = new Int32Array(vCount).fill(-1);
        const newVertices: number[] = [];
        let newCount = 0;

        for (let i = 0; i < vCount; i++) {
            const x = vertices[i * 3];
            const y = vertices[i * 3 + 1];
            let keptIndex = i;

            // Check if Right Seam
            if (Math.abs(x - TAU) < EPS) {
                const z = vertices[i * 3 + 2];
                const yKey = Math.round(y * QUANT);

                // Try exact match and extended neighbors (2 steps) to handle float drift/clamping
                const candidates = [yKey, yKey - 1, yKey + 1, yKey - 2, yKey + 2];
                for (const k of candidates) {
                    const key = `${k}:${Math.round(z)}`;
                    if (leftMap.has(key)) {
                        keptIndex = leftMap.get(key)!;
                        break;
                    }
                }
                if (keptIndex === i) {
                    // DEBUG: Log failure
                    console.log(`[stitchSeam] Failed to match right vertex at x=${x.toFixed(6)}. Keys tried: ${candidates.map(k => `'${k}:${Math.round(z)}'`).join(',')}`);
                }
            }

            remapping[i] = keptIndex;

            if (keptIndex === i) {
                validIndices[i] = newCount;
                newVertices.push(x, y, vertices[i * 3 + 2]);
                newCount++;
            }
        }

        // Rebuild Indices (Stride by 3 to preserve triangles)
        const newIndices: number[] = [];
        for (let k = 0; k < mesh.indices.length; k += 3) {
            const idx0 = mesh.indices[k];
            const idx1 = mesh.indices[k + 1];
            const idx2 = mesh.indices[k + 2];

            const map0 = validIndices[remapping[idx0]];
            const map1 = validIndices[remapping[idx1]];
            const map2 = validIndices[remapping[idx2]];

            if (map0 !== -1 && map1 !== -1 && map2 !== -1) {
                // Filter degenerate triangles collapsed by stitching
                if (map0 !== map1 && map1 !== map2 && map2 !== map0) {
                    newIndices.push(map0, map1, map2);
                }
            } else {
                console.error(`[stitchSeam] Invalid mapping: old(${idx0}, ${idx1}, ${idx2}) -> kept(${remapping[idx0]}, ${remapping[idx1]}, ${remapping[idx2]}) -> new (${map0},${map1},${map2})`);
            }
        }

        return {
            vertices: new Float32Array(newVertices),
            indices: new Uint32Array(newIndices)
        };
    }

    // ===================================
    // 5. Ancillary Surfaces
    // ===================================

    private static appendSurfaces(outer: TriangulatedMesh): TriangulatedMesh {
        const otherSurfaces = [
            { id: 1, w: 180, h: 90 },  // Inner Wall (Reduced from 360x180 per user request)
            { id: 2, w: 360, h: 8 },   // Rim (Matched to Outer SEAMS=360)
            { id: 3, w: 180, h: 8 },   // Bottom Under (Reduced)
            { id: 4, w: 180, h: 8 },   // Bottom Top (Reduced)
            { id: 5, w: 180, h: 8 }    // Drain (Matched to Bottom)
        ];

        // Combine
        // Note: outer.vertices is Float32Array, we need to convert to growable
        const allVertices: number[] = Array.from(outer.vertices);
        const allIndices: number[] = Array.from(outer.indices);

        // --- DEBUG: Log Boundary Vertices (Round 2) ---
        const EPS = 1e-4;
        const boundarySamples: string[] = [];
        let count = 0;
        for (let i = 0; i < outer.vertices.length; i += 3) {
            const u = outer.vertices[i];
            const t = outer.vertices[i + 1];
            if ((Math.abs(t) < EPS || Math.abs(t - 1.0) < EPS) && count < 20) {
                boundarySamples.push(`u=${u.toFixed(6)}, t=${t.toFixed(1)}`);
                count++;
            }
        }
        console.warn(`[ConstrainedTriangulator] Outer Wall Boundary U Samples 2:\n` + boundarySamples.join('\n'));



        let vertexOffset = outer.vertices.length / 3;

        for (const surf of otherSurfaces) {
            const mesh = this.generateGrid(surf.w, surf.h, surf.id);
            for (let k = 0; k < mesh.vertices.length; k++) allVertices.push(mesh.vertices[k]);
            for (let k = 0; k < mesh.indices.length; k++) allIndices.push(mesh.indices[k] + vertexOffset);
            vertexOffset += mesh.vertices.length / 3;
        }

        return {
            vertices: new Float32Array(allVertices),
            indices: new Uint32Array(allIndices)
        };
    }

    private static generateGrid(w: number, h: number, surfaceId: number): TriangulatedMesh {
        // PERIODIC grid: Only w columns (not w+1). Last column wraps to column 0.
        // This ensures zero vertices at u=1.0, giving watertight seam topology.
        const vertCount = w * (h + 1);
        const vertices = new Float32Array(vertCount * 3);
        const indices: number[] = [];
        const dU = 1.0 / w;
        const dT = 1.0 / h;

        let vIdx = 0;
        for (let j = 0; j <= h; j++) {
            const t = j * dT;
            for (let i = 0; i < w; i++) {  // NOTE: < w, not <= w
                const u = i * dU;
                vertices[vIdx++] = u; // Normalized U [0, 1)
                vertices[vIdx++] = t;
                vertices[vIdx++] = surfaceId;
            }
        }

        const stride = w; // w columns per row (not w+1)

        // Determine winding order based on surface type
        const invertWinding = (surfaceId === 1 || surfaceId === 3 || surfaceId === 5);

        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const i0 = j * stride + i;
                const i1 = j * stride + ((i + 1) % w);       // Wrap!
                const i2 = (j + 1) * stride + i;
                const i3 = (j + 1) * stride + ((i + 1) % w); // Wrap!

                if (invertWinding) {
                    indices.push(i0, i2, i1);
                    indices.push(i1, i2, i3);
                } else {
                    indices.push(i0, i1, i2);
                    indices.push(i1, i3, i2);
                }
            }
        }
        return { vertices, indices: new Uint32Array(indices) };
    }
}

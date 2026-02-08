import { FeaturePoint } from '../../renderers/webgpu/FeatureExtractionComputer';
import { simplify } from '../../utils/geometry/simplify';
import { PotDimensions, TAU } from '../../geometry/types';
import cdt2d from 'cdt2d';

// ============================================================================
// Types
// ============================================================================

export interface TriangulatedMesh {
    vertices: Float32Array;
    indices: Uint32Array;
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
        // User requested "very fine" edge triangles.
        const TARGET_SPACING = 1.0 / 256; // High density features

        const decimatedChains = chains.map(chain => this.decimateChain(chain, TARGET_SPACING));
        const decimatedPointCount = decimatedChains.reduce((sum, c) => sum + c.length, 0);
        console.log(`[ConstrainedTriangulator] Decimated chains: ${decimatedPointCount} points (from ${chains.reduce((s, c) => s + c.length, 0)})`);

        // 1.6 Generate BUFFER ZONE points - DISABLED due to causing "shard" artifacts
        // around sharp corners. Adaptive background grid is sufficient.
        const bufferPoints: Point2D[] = [];
        /* 
        const BUFFER_OFFSET = TARGET_SPACING * 0.5;
        for (const chain of decimatedChains) {
            // ... (disabled code)
        }
        */
        console.log(`[ConstrainedTriangulator] Buffer generation DISABLED to prevent shards.`);

        // 2. Generate adaptive background points
        // Must pass AR to fill [0, AR] domain
        const bgPoints = this.generateAdaptiveBackground(decimatedChains, aspectRatio, importanceMap, importanceGridSize);
        console.log(`[ConstrainedTriangulator] Generated ${bgPoints.length} background points`);

        // 3. Run Constrained Delaunay Triangulation with decimated chains
        // Include buffer points as curve support (no constraint edges)
        // Note: runCDT logic handles the boundary. We must tell it valid domain if needed?
        // runCDT calculates boundary from SEAMS. SEAMS points are already scaled above.
        // But runCDT *re-adds* boundary internally at lines 615-640.
        // We must update runCDT or pass the scaled boundary?
        // runCDT is internal. We should update runCDT to respect AR or pass it.
        // EASIER: Pass `seamPoints` explicitly as the boundary definition to runCDT?
        // Current runCDT ignores `seamPoints` arg?? No, it doesn't take seamPoints arg!
        // It regenerates boundary.
        // FIX: Update runCDT to take aspectRatio argument.
        const outerMesh = this.runCDT(decimatedChains, bgPoints, [...curveBufferPoints, ...bufferPoints], aspectRatio);

        // =========================================================
        // UNSCALE: Transform Physical-ish -> UV Space
        // =========================================================
        if (aspectRatio !== 1.0) {
            for (let i = 0; i < outerMesh.vertices.length; i += 3) {
                outerMesh.vertices[i] /= aspectRatio;
            }
        }

        console.log(`[ConstrainedTriangulator] CDT: ${outerMesh.vertices.length / 3} vertices, ${outerMesh.indices.length / 3} triangles`);

        // 3.5. Refine triangle quality - DISABLED
        // With Anisotropic Scaling, physical 1:1 triangles look like 1:3 slivers in UV space.
        // This refinement step sees them as "bad" and shatters them into shards.
        // Since CDT now produces good physical topology, we skip this.
        // const refinedMesh = this.refineTriangleQuality(outerMesh, 3.0, 2);
        const refinedMesh = outerMesh;

        // 4. Stitch the seam at theta=0/2π
        const stitched = this.stitchSeam(refinedMesh);

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

        if (points.length < 4) {
            // Return empty chains but with seam points for boundary stability
            const SEAMS = 180;
            const seamPoints: Point2D[] = [];
            for (let k = 0; k <= SEAMS; k++) {
                const y = k / SEAMS;
                seamPoints.push({ x: 0, y }, { x: 1, y });
            }
            for (let k = 0; k <= SEAMS; k++) {
                const x = k / SEAMS;
                seamPoints.push({ x, y: 0 }, { x, y: 1 });
            }
            return { chains: [], seamPoints, curveBufferPoints: [] };
        }

        // ===========================================
        // PHASE 2: Greedy Chaining BY FEATURE TYPE
        // Ridges and valleys must be chained separately!
        // Previous bug: mixing types caused valleys to jump to ridges
        // ===========================================

        const MAX_CONNECT_DIST = 0.08; // ~8% of domain - TESTED VALUE
        const gridCell = 0.1;
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
                                    const directionPenalty = dist * (1 - dot) * 0.5;
                                    score += directionPenalty;
                                    if (dot < -0.5) continue;
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
                if (chain.length > 3) chains.push(chain);
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
        const SIMPLIFY_TOLERANCE = 0.00001;
        // 0.1% of domain = ~1000 segments per full chain. Extremely dense.
        const MAX_SEGMENT_LENGTH = 0.001;

        const densifyChain = (chain: Point2D[]): Point2D[] => {
            if (chain.length < 2) return chain;

            // Step 1: Simplify
            const simplified = simplify(chain, SIMPLIFY_TOLERANCE, true);

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

        // PHASE 4: Buffer zones DISABLED - too heavy
        // GPU adaptive subdivision handles density transitions
        const curveBufferPoints: Point2D[] = [];
        void scaleW; void scaleH; void densifiedChains;
        console.log(`[ConstrainedTriangulator] Buffer DISABLED - minimal base mesh`);

        // 5. Force Seam Nodes
        // We define fixed nodes on left/right boundary to ensure they match later
        // High resolution seams to match ancillary grids (w=180/360) 
        // and ensure watertight welding.
        // 180 ensures edge length ~2 degrees, small enough for WeldMesh epsilon.
        // INCREASED to 360 to match feature density (0.002) and prevent low-res patches.
        const SEAMS = 360; // Number of vertical divisions
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
                    if (importance > 0.75) subdiv = 3;
                    else if (importance > 0.5) subdiv = 2;
                    else if (importance > 0.25) subdiv = 1;
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

            // 3. Stochastic Feature Buffer (Cloud)
            // The importance map might miss fine feature lines due to 64x64 resolution.
            // We explicitly add random points near the known chains to ensure high density.
            // This prevents "large fan triangles" connecting fine features to coarse background.
            // (Approximating 3D metric density in 2D CDT)
            if (false) {
                const CLOUD_RADIUS = 0.05; // Physical-ish distance (AR scaled)
                const CLOUD_DENSITY = 4; // Points per segment

                for (const chain of _chains) {
                    for (let i = 0; i < chain.length - 1; i++) {
                        const p0 = chain[i];
                        const p1 = chain[i + 1];
                        const segLen = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
                        const segments = Math.max(1, Math.ceil(segLen / 0.01));

                        // Add random points along the segment
                        for (let d = 0; d < CLOUD_DENSITY * segments; d++) {
                            const t = Math.random();
                            const cx = p0.x + (p1.x - p0.x) * t;
                            const cy = p0.y + (p1.y - p0.y) * t;

                            // Random offset in circle
                            const ang = Math.random() * Math.PI * 2;
                            const rad = Math.random() * CLOUD_RADIUS;

                            const px = cx + Math.cos(ang) * rad;
                            const py = cy + Math.sin(ang) * rad;

                            // Bounds check (scaled domain [0, AR] x [0, 1])
                            if (px > 0.01 && px < aspectRatio - 0.01 && py > 0.01 && py < 0.99) {
                                candidates.push({ x: px, y: py });
                            }
                        }
                    }
                }

            } console.log(`[ConstrainedTriangulator] Background: ${candidates.length} points (AR=${aspectRatio.toFixed(2)})`);
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
                    candidates.push({ x: (gx + rx) * cellW, y: (gy + ry) * cellH });
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
        const points: [number, number][] = [];
        const edges: [number, number][] = [];

        // ===================================
        // 1. Add Boundary Box with Constraints
        //    The domain is [0, AR] x [0, 1] (Scaled Space)
        // ===================================
        const SEAMS = 360; // Must match extractChains and appendSurfaces grid resolution
        const boundaryIndices = {
            left: [] as number[],   // x = 0
            right: [] as number[],  // x = AR
            bottom: [] as number[], // y = 0
            top: [] as number[]     // y = 1
        };

        // Add boundary points in order
        let idx = 0;

        // Left boundary (x = 0, y = 0 to 1)
        for (let k = 0; k <= SEAMS; k++) {
            const y = k / SEAMS;
            points.push([0, y]);
            boundaryIndices.left.push(idx++);
        }

        // Right boundary (x = AR, y = 0 to 1)
        for (let k = 0; k <= SEAMS; k++) {
            const y = k / SEAMS;
            points.push([aspectRatio, y]);
            boundaryIndices.right.push(idx++);
        }

        // Top boundary (x = 0 to AR, y = 1) - skip corners (already added)
        for (let k = 1; k < SEAMS; k++) {
            const x = (k / SEAMS) * aspectRatio;
            points.push([x, 1]);
            boundaryIndices.top.push(idx++);
        }

        // Bottom boundary (x = 0 to AR, y = 0) - skip corners (already added)
        for (let k = 1; k < SEAMS; k++) {
            const x = (k / SEAMS) * aspectRatio;
            points.push([x, 0]);
            boundaryIndices.bottom.push(idx++);
        }

        // Add boundary EDGES (connect adjacent points)
        // Left seam edges
        for (let k = 0; k < SEAMS; k++) {
            edges.push([boundaryIndices.left[k], boundaryIndices.left[k + 1]]);
        }
        // Right seam edges
        for (let k = 0; k < SEAMS; k++) {
            edges.push([boundaryIndices.right[k], boundaryIndices.right[k + 1]]);
        }
        // Top edges (connect left top corner -> top points -> right top corner)
        const leftTop = boundaryIndices.left[SEAMS];  // (0, 1)
        const rightTop = boundaryIndices.right[SEAMS]; // (1, 1)
        if (boundaryIndices.top.length > 0) {
            edges.push([leftTop, boundaryIndices.top[0]]);
            for (let k = 0; k < boundaryIndices.top.length - 1; k++) {
                edges.push([boundaryIndices.top[k], boundaryIndices.top[k + 1]]);
            }
            edges.push([boundaryIndices.top[boundaryIndices.top.length - 1], rightTop]);
        } else {
            edges.push([leftTop, rightTop]);
        }
        // Bottom edges (connect left bottom corner -> bottom points -> right bottom corner)
        const leftBottom = boundaryIndices.left[0];  // (0, 0)
        const rightBottom = boundaryIndices.right[0]; // (1, 0)
        if (boundaryIndices.bottom.length > 0) {
            edges.push([leftBottom, boundaryIndices.bottom[0]]);
            for (let k = 0; k < boundaryIndices.bottom.length - 1; k++) {
                edges.push([boundaryIndices.bottom[k], boundaryIndices.bottom[k + 1]]);
            }
            edges.push([boundaryIndices.bottom[boundaryIndices.bottom.length - 1], rightBottom]);
        } else {
            edges.push([leftBottom, rightBottom]);
        }

        console.log(`[CDT] Boundary: ${idx} points, ${edges.length} edges`);

        // ===================================
        // 2. Add Feature Chain Constraints
        // ===================================
        const featureEdgeStart = edges.length;
        chains.forEach(chain => {
            if (chain.length < 2) return;

            // Snap first point - precision snap only
            let x0 = chain[0].x;
            if (x0 < 0.000001) x0 = 0;
            if (x0 > aspectRatio - 0.000001) x0 = aspectRatio; // Snap to AR
            points.push([x0, chain[0].y]); idx++;

            for (let k = 1; k < chain.length; k++) {
                let xk = chain[k].x;
                if (xk < 0.000001) xk = 0;
                if (xk > aspectRatio - 0.000001) xk = aspectRatio; // Snap to AR

                points.push([xk, chain[k].y]); idx++;
                edges.push([idx - 2, idx - 1]);
            }
        });

        console.log(`[CDT] After features: ${idx} points, ${edges.length} edges`);

        // ===================================
        // 3. Validate and Clean Edges
        // ===================================
        // const cleanEdges = (edgeList: number[][]): number[][] => { ... } // Unused

        const isConflict = ConstrainedTriangulator.isConflict;

        // Remove feature edges that intersect boundary edges OR other feature edges
        const boundaryEdges = edges.slice(0, featureEdgeStart);
        let featureEdges = edges.slice(featureEdgeStart);

        // First pass: remove edges intersecting boundary
        let safeFeatureEdges: number[][] = [];
        for (const [a, b] of featureEdges) {
            let intersects = false;
            for (const [c, d] of boundaryEdges) {
                if (a === c || a === d || b === c || b === d) continue;
                if (isConflict(points[a], points[b], points[c], points[d])) {
                    intersects = true;
                    break;
                }
            }
            if (!intersects) {
                safeFeatureEdges.push([a, b]);
            }
        }

        // Second pass: remove edges that intersect other feature edges (self-intersection)
        // Use greedy approach: keep edges in order, skip if intersects with already-kept edges
        const finalFeatureEdges: number[][] = [];
        // Safety cap increased to 20k to allow full resolution while preventing infinite loops
        const MAX_SAFE_EDGES = 20000;

        for (const edge of safeFeatureEdges) {
            if (finalFeatureEdges.length >= MAX_SAFE_EDGES) {
                console.warn(`[CDT] Hit safety cap of ${MAX_SAFE_EDGES} edges. Some features may be lost.`);
                break;
            }

            const [a, b] = edge;
            let intersects = false;

            // Only check against already accepted edges (greedy)
            for (const [c, d] of finalFeatureEdges) {
                // Skip if they share a vertex (adjacent edges in a chain are valid)
                if (a === c || a === d || b === c || b === d) continue;

                // Real conflict: improper intersection (crossing)
                if (isConflict(points[a], points[b], points[c], points[d])) {
                    intersects = true;
                    // Debug log for tricky cases
                    // console.log(`[CDT] Conflict: Edge ${a}-${b} crosses ${c}-${d}`);
                    break;
                }
            }

            if (!intersects) {
                finalFeatureEdges.push(edge);
            }
        }

        const rejectedCount = featureEdges.length - finalFeatureEdges.length;
        if (rejectedCount > 0) {
            console.warn(`[CDT] REJECTED ${rejectedCount} feature edges due to conflicts! This causes jagged artifacts.`);
        }
        console.log(`[CDT] Safe edges: ${finalFeatureEdges.length} / ${featureEdges.length} feature edges kept (after self-intersection check)`);

        // ===================================
        // 4. Add Curve Buffer Points (no constraint edges - just symmetric support)
        // ===================================
        curveBufferPoints.forEach(p => { points.push([p.x, p.y]); idx++; });
        console.log(`[CDT] Added ${curveBufferPoints.length} curve buffer points`);

        // ===================================
        // 5. Add Background Points
        // ===================================
        bgPoints.forEach(p => { points.push([p.x, p.y]); idx++; });

        // ===================================
        // 5. Deduplicate All Points Before CDT
        //    Merging overlapping points (boundary, feature, buffer, bg) is crucial
        //    to prevent degenerate "sliver" triangles and NaN normals on GPU.
        // ===================================
        const DEDUP_TOL = 1e-5; // Very tight tolerance, just for coincident points
        const uniquePoints: Point2D[] = [];
        const pointMap = new Map<string, number>(); // quantization key -> new index

        // Helper to add point and getting unique index
        const addPoint = (x: number, y: number): number => {
            const key = `${Math.round(x / DEDUP_TOL)}_${Math.round(y / DEDUP_TOL)}`;
            if (pointMap.has(key)) return pointMap.get(key)!;

            const idx = uniquePoints.length;
            uniquePoints.push({ x, y });
            pointMap.set(key, idx);
            return idx;
        };

        // Rebuild clean data structures
        const cleanPoints: [number, number][] = [];
        const dedupEdges: [number, number][] = [];

        // 1. Process Points & Remap Indices
        //    We must process original 'points' array which contains:
        //    [Boundary... FeaturePoints... BufferPoints... BgPoints...]
        //    BUT 'edges' refer to indices in the ORIGINAL 'points' array.
        //    So we must iterate original 'points', add to unique, and build a remapping table.

        const oldIndexToNewIndex = new Int32Array(points.length).fill(-1);

        for (let i = 0; i < points.length; i++) {
            const [x, y] = points[i];
            const newIdx = addPoint(x, y);
            oldIndexToNewIndex[i] = newIdx;
        }

        // 2. Build Clean Point Array
        for (const p of uniquePoints) {
            cleanPoints.push([p.x, p.y]);
        }

        // 3. Remap Edges
        const processEdges = (sourceEdges: number[][]) => {
            for (const [a, b] of sourceEdges) {
                const newA = oldIndexToNewIndex[a];
                const newB = oldIndexToNewIndex[b];
                if (newA !== newB) { // Filter zero-length edges
                    dedupEdges.push([newA, newB]);
                }
            }
        };

        processEdges(boundaryEdges);
        processEdges(finalFeatureEdges);

        console.log(`[CDT] Deduplicated Input: ${points.length} -> ${cleanPoints.length} points.`);
        console.log(`[CDT] Cleaned Edges: ${boundaryEdges.length + finalFeatureEdges.length} -> ${dedupEdges.length} edges.`);

        // Update local variables for CDT call
        // We override the previous 'points' logic just for the CDT input
        // But 'runCDT' returns 'vertices'. We need to make sure we return the CLEAN vertices.

        // ===================================
        // 6. Run CDT with Progressive Fallback
        // ===================================
        const runCDTWithEdges = (pts: number[][], edgeList: number[][]): number[][] | null => {
            try {
                // cdt2d expects [x, y] arrays
                // We use our cleanPoints and dedupEdges
                // Note: dedupEdges are already unique indices into cleanPoints
                return cdt2d(pts as [number, number][], edgeList as [number, number][]);
            } catch (e) {
                console.warn('[CDT] Triangulation error:', e);
                return null;
            }
        };

        // Try 1: Full CDT with all edges
        let triangles = runCDTWithEdges(cleanPoints, dedupEdges);

        // Try 2: Boundary only (no feature edges) - Filter dedupEdges to only boundary?
        // Hard to distinguish now. But failures are rare with clean data.
        if (!triangles) {
            console.warn('[CDT] Full CDT failed, trying fallback (Boundary Only approach logic requires re-separation or tagging, skipping to pure Delaunay for safety)');
            triangles = runCDTWithEdges(cleanPoints, []); // Unconstrained
        }

        if (!triangles) {
            console.error('[CDT] All triangulation attempts failed');
            return { vertices: new Float32Array(0), indices: new Uint32Array(0) };
        }

        // ===================================
        // 7. Filter & Validate Triangles
        // ===================================
        const validTriangles: number[][] = [];
        for (const tri of triangles) {
            // Mapping tri indices (which are into cleanPoints)
            // back to geometry.
            const p0 = cleanPoints[tri[0]];
            const p1 = cleanPoints[tri[1]];
            const p2 = cleanPoints[tri[2]];

            // Filter exterior triangles (centroid outside [0,AR]x[0,1])
            const cx = (p0[0] + p1[0] + p2[0]) / 3;
            const cy = (p0[1] + p1[1] + p2[1]) / 3;
            // X bound uses aspectRatio, Y bound is 1.0
            if (cx < -1e-4 || cx > aspectRatio + 1e-4 || cy < -1e-4 || cy > 1 + 1e-4) continue;

            // Validate winding order (CCW in UV space = positive cross product)
            const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
            if (cross > 0) {
                validTriangles.push(tri);
            } else if (cross < 0) {
                // Flip winding
                validTriangles.push([tri[0], tri[2], tri[1]]);
            }
            // Skip degenerate (cross == 0)
        }

        console.log(`[CDT] Triangles: ${triangles.length} -> ${validTriangles.length} valid`);

        // ===================================
        // 8. Convert to Output Format
        // ===================================
        // Use CLEAN points
        const vertices = new Float32Array(cleanPoints.length * 3);
        for (let i = 0; i < cleanPoints.length; i++) {
            vertices[i * 3 + 0] = cleanPoints[i][0];       // Normalized U
            vertices[i * 3 + 1] = cleanPoints[i][1];       // T
            vertices[i * 3 + 2] = 0;                       // Surface ID
        }

        const indices = new Uint32Array(validTriangles.flat());
        return { vertices, indices };

        /* 
           Legacy Block Removed:
           - Try 1/2/3 logic replaced by robust dedup + single fallback
           - Point array building (vertices loop) updated to use cleanPoints
        */
    }

    // ===================================
    // 3.5 Post-CDT Triangle Quality Refinement
    // ===================================

    /**
     * Refines mesh quality by splitting triangles with poor aspect ratios.
     * 
     * Uses LONGEST-EDGE BISECTION (not centroid insertion):
     * - Find the longest edge of bad triangles
     * - Insert midpoint vertex on that edge
     * - Split triangle into 2 (not 3) triangles
     * 
     * This guarantees each child triangle has edges at most half the parent's
     * longest edge, ensuring convergence.
     * 
     * @param mesh - Input mesh from CDT
     * @param maxEdgeRatio - Triangles with edge ratio above this are split (default 3.0)
     * @param maxIterations - Number of refinement passes (default 4)
     */
    private static refineTriangleQuality(
        mesh: TriangulatedMesh,
        maxEdgeRatio: number = 3.0,
        maxIterations: number = 4
    ): TriangulatedMesh {
        if (mesh.indices.length === 0) return mesh;

        // DISABLE REFINEMENT - Buggy on shared edges (T-junctions)
        console.warn("[ConstrainedTriangulator] CPU Refinement DISABLED (Fixing Bad Triangles)");
        return mesh;

        // Work with mutable arrays
        let vertices: number[] = Array.from(mesh.vertices);
        let indices: number[] = Array.from(mesh.indices);

        // Track edge midpoints to avoid duplicates (key: "minIdx_maxIdx" -> midpoint vertex index)
        let edgeMidpoints = new Map<string, number>();

        for (let iter = 0; iter < maxIterations; iter++) {
            const newIndices: number[] = [];
            let splitCount = 0;

            // Clear edge map each iteration (vertices array grows)
            edgeMidpoints = new Map<string, number>();

            for (let i = 0; i < indices.length; i += 3) {
                const i0 = indices[i];
                const i1 = indices[i + 1];
                const i2 = indices[i + 2];

                // Get vertex positions
                const x0 = vertices[i0 * 3], y0 = vertices[i0 * 3 + 1];
                const x1 = vertices[i1 * 3], y1 = vertices[i1 * 3 + 1];
                const x2 = vertices[i2 * 3], y2 = vertices[i2 * 3 + 1];
                const z = vertices[i0 * 3 + 2]; // Surface ID

                // Calculate edge lengths squared
                const e01sq = (x1 - x0) ** 2 + (y1 - y0) ** 2; // edge i0-i1
                const e12sq = (x2 - x1) ** 2 + (y2 - y1) ** 2; // edge i1-i2
                const e20sq = (x0 - x2) ** 2 + (y0 - y2) ** 2; // edge i2-i0

                const maxEdgeSq = Math.max(e01sq, e12sq, e20sq);
                const minEdgeSq = Math.min(e01sq, e12sq, e20sq);
                const edgeRatio = Math.sqrt(maxEdgeSq / (minEdgeSq + 1e-12));

                // Check if longest edge is on boundary
                let isBoundary = false;
                const EPS = 1e-4;
                if (e01sq >= e12sq && e01sq >= e20sq) {
                    if ((Math.abs(x0) < EPS && Math.abs(x1) < EPS) || (Math.abs(x0 - 1) < EPS && Math.abs(x1 - 1) < EPS) ||
                        (Math.abs(y0) < EPS && Math.abs(y1) < EPS) || (Math.abs(y0 - 1) < EPS && Math.abs(y1 - 1) < EPS)) isBoundary = true;
                } else if (e12sq >= e01sq && e12sq >= e20sq) {
                    if ((Math.abs(x1) < EPS && Math.abs(x2) < EPS) || (Math.abs(x1 - 1) < EPS && Math.abs(x2 - 1) < EPS) ||
                        (Math.abs(y1) < EPS && Math.abs(y2) < EPS) || (Math.abs(y1 - 1) < EPS && Math.abs(y2 - 1) < EPS)) isBoundary = true;
                } else {
                    if ((Math.abs(x2) < EPS && Math.abs(x0) < EPS) || (Math.abs(x2 - 1) < EPS && Math.abs(x0 - 1) < EPS) ||
                        (Math.abs(y2) < EPS && Math.abs(y0) < EPS) || (Math.abs(y2 - 1) < EPS && Math.abs(y0 - 1) < EPS)) isBoundary = true;
                }

                if (edgeRatio > maxEdgeRatio && !isBoundary) {
                    // Find which edge is longest and split it
                    // IMPORTANT: Must preserve CCW winding order!
                    // Original triangle is (i0, i1, i2) in CCW order
                    let midX: number, midY: number;
                    let edgeKey: string;
                    let midIdx: number;

                    if (e01sq >= e12sq && e01sq >= e20sq) {
                        // Edge i0-i1 is longest
                        midX = (x0 + x1) / 2; midY = (y0 + y1) / 2;
                        edgeKey = i0 < i1 ? `${i0}_${i1}` : `${i1}_${i0}`;

                        if (edgeMidpoints.has(edgeKey)) {
                            midIdx = edgeMidpoints.get(edgeKey)!;
                        } else {
                            midIdx = vertices.length / 3;
                            vertices.push(midX, midY, z);
                            edgeMidpoints.set(edgeKey, midIdx);
                        }

                        // Split: (i0, M, i2) and (M, i1, i2) - both CCW
                        newIndices.push(i0, midIdx, i2);
                        newIndices.push(midIdx, i1, i2);

                    } else if (e12sq >= e01sq && e12sq >= e20sq) {
                        // Edge i1-i2 is longest
                        midX = (x1 + x2) / 2; midY = (y1 + y2) / 2;
                        edgeKey = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;

                        if (edgeMidpoints.has(edgeKey)) {
                            midIdx = edgeMidpoints.get(edgeKey)!;
                        } else {
                            midIdx = vertices.length / 3;
                            vertices.push(midX, midY, z);
                            edgeMidpoints.set(edgeKey, midIdx);
                        }

                        // Split: (i0, i1, M) and (i0, M, i2) - both CCW
                        newIndices.push(i0, i1, midIdx);
                        newIndices.push(i0, midIdx, i2);

                    } else {
                        // Edge i2-i0 is longest
                        midX = (x2 + x0) / 2; midY = (y2 + y0) / 2;
                        edgeKey = i2 < i0 ? `${i2}_${i0}` : `${i0}_${i2}`;

                        if (edgeMidpoints.has(edgeKey)) {
                            midIdx = edgeMidpoints.get(edgeKey)!;
                        } else {
                            midIdx = vertices.length / 3;
                            vertices.push(midX, midY, z);
                            edgeMidpoints.set(edgeKey, midIdx);
                        }

                        // Split: (i0, i1, M) and (M, i1, i2) - both CCW
                        newIndices.push(i0, i1, midIdx);
                        newIndices.push(midIdx, i1, i2);
                    }

                    splitCount++;
                } else {
                    // Keep original triangle
                    newIndices.push(i0, i1, i2);
                }
            }

            indices = newIndices;

            console.log(`[TriangleRefinement] Pass ${iter + 1}: split ${splitCount} triangles(ratio > ${maxEdgeRatio})`);

            if (splitCount === 0) {
                // No more bad triangles, early exit
                break;
            }
        }

        console.log(`[TriangleRefinement] Final: ${vertices.length / 3} vertices, ${indices.length / 3} triangles`);

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices)
        };
    }

    // ===================================
    // 4. Seam Stitching
    // ===================================

    private static stitchSeam(mesh: TriangulatedMesh): TriangulatedMesh {
        if (mesh.vertices.length === 0) return mesh;

        // Vertices at x=0 need to be unified with vertices at x=2PI
        // Since we normalized inputs, x=0 and x=1 (before 2PI scale).
        // BUT we scaled them back to 0..2PI in step 3.

        const EPS = 1e-4;
        const TAU = 1.0; // Normalized wrapping domain

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
                const key = `${Math.round(y * QUANT)}:${Math.round(z)} `;
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
                    const key = `${k}:${Math.round(z)} `;
                    if (leftMap.has(key)) {
                        keptIndex = leftMap.get(key)!;
                        break; // Found a match
                    }
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
            { id: 1, w: 360, h: 180 }, // Inner Wall
            { id: 2, w: 360, h: 8 },   // Rim (Matched to SEAMS=360)
            { id: 3, w: 360, h: 8 },   // Bottom Under (Matched to SEAMS=360)
            { id: 4, w: 360, h: 8 },   // Bottom Top
            { id: 5, w: 360, h: 8 }    // Drain (Matched to Bottom)
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
        // Standard grid generation
        const vertices = new Float32Array((w + 1) * (h + 1) * 3);
        const indices: number[] = [];
        const dU = 1.0 / w;
        const dT = 1.0 / h;

        let vIdx = 0;
        for (let j = 0; j <= h; j++) {
            const t = j * dT;
            for (let i = 0; i <= w; i++) {
                const u = i * dU;
                vertices[vIdx++] = u; // Normalized U
                vertices[vIdx++] = t;
                vertices[vIdx++] = surfaceId;
            }
        }

        const stride = w + 1;

        // Determine winding order based on surface type
        // Surfaces that need normals pointing "inward" (toward center or down) should be CW
        // Surface 1 (Inner Wall): normals should face inward
        // Surface 3 (Bottom Under): normals should face down
        // Surface 5 (Drain): normals should face inward
        const invertWinding = (surfaceId === 1 || surfaceId === 3 || surfaceId === 5);

        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const i0 = j * stride + i;
                const i1 = i0 + 1;
                const i2 = (j + 1) * stride + i;
                const i3 = i2 + 1;

                if (invertWinding) {
                    // CW winding for inward-facing normals
                    indices.push(i0, i2, i1);
                    indices.push(i1, i2, i3);
                } else {
                    // CCW winding for outward-facing normals
                    indices.push(i0, i1, i2);
                    indices.push(i1, i3, i2);
                }
            }
        }
        return { vertices, indices: new Uint32Array(indices) };
    }
}

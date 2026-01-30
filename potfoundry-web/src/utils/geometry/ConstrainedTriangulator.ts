import { FeaturePoint } from '../../renderers/webgpu/FeatureExtractionComputer';
import { simplify } from '../../utils/geometry/simplify';
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
    // Reduced to 0.0005^2 to allow tight spirals without self-conflict rejection
    public static readonly TUBE_RAD_SQ = 0.0005 * 0.0005;

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
     */
    static generateFullPot(features: FeaturePoint[]): TriangulatedMesh {
        console.log('[ConstrainedTriangulator] Using CDT mode with feature constraints');

        // 1. Extract feature chains, seam points, and curve buffer points
        const { chains, seamPoints, curveBufferPoints } = this.extractChains(features);
        console.log(`[ConstrainedTriangulator] Extracted ${chains.length} chains, ${seamPoints.length} seam points, ${curveBufferPoints.length} buffer points`);

        // 2. Generate adaptive background points (denser near features)
        const bgPoints = this.generateAdaptiveBackground(chains);
        console.log(`[ConstrainedTriangulator] Generated ${bgPoints.length} background points`);

        // 3. Run Constrained Delaunay Triangulation with buffer points
        const outerMesh = this.runCDT(chains, bgPoints, curveBufferPoints);
        console.log(`[ConstrainedTriangulator] CDT: ${outerMesh.vertices.length / 3} vertices, ${outerMesh.indices.length / 3} triangles`);

        // 4. Stitch the seam at theta=0/2π
        const stitched = this.stitchSeam(outerMesh);

        // 5. Append other surfaces (inner wall, rim, bottom, drain)
        const fullMesh = this.appendSurfaces(stitched);

        console.log(`[ConstrainedTriangulator] Full mesh: ${fullMesh.vertices.length / 3} vertices, ${fullMesh.indices.length / 3} triangles`);
        return fullMesh;
    }

    // ===================================
    // 1. Feature Processing
    // ===================================

    public static extractChains(rawFeatures: FeaturePoint[]): { chains: Point2D[][], seamPoints: Point2D[], curveBufferPoints: Point2D[] } {
        if (rawFeatures.length === 0) return { chains: [], seamPoints: [], curveBufferPoints: [] };

        // ===========================================
        // PHASE 1: Normalize and Deduplicate Points
        // ===========================================
        // MARGIN REMOVED for "Zero-Gap" topology. Exact [0,1] range used.
        const DEDUP_EPSILON = 0.0005; // ~0.05% - points closer than this are duplicates
        const MIN_SEGMENT_LENGTH = 0.001; // Minimum edge length for CDT stability

        // Normalize to [0,1] exactly
        const rawPoints = rawFeatures.map(f => ({
            x: f.theta / (Math.PI * 2),
            y: f.t,
            strength: f.strength
        }));

        // Spatial hash deduplication
        const dedupGrid = new Map<string, number>();
        const dedupKey = (x: number, y: number) =>
            `${Math.round(x / DEDUP_EPSILON)}_${Math.round(y / DEDUP_EPSILON)}`;

        const points: { x: number, y: number, strength: number, idx: number }[] = [];
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
        // PHASE 2: Simple Greedy Chaining (STABLE - do not modify)
        // Previous attempts at direction-aware chaining crashed CDT
        // ===========================================

        // Sort by scanline for deterministic chaining
        points.sort((a, b) => (a.y - b.y) || (a.x - b.x));

        const MAX_CONNECT_DIST = 0.08; // ~8% of domain - TESTED VALUE
        const gridCell = 0.1;
        const grid = new Map<string, number[]>();
        const toKey = (x: number, y: number) =>
            `${Math.floor(x / gridCell)}_${Math.floor(y / gridCell)}`;

        points.forEach((p, i) => {
            const k = toKey(p.x, p.y);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k)!.push(i);
        });

        const visited = new Uint8Array(points.length);
        const chains: Point2D[][] = [];

        for (let i = 0; i < points.length; i++) {
            if (visited[i]) continue;

            let chain: Point2D[] = [{ x: points[i].x, y: points[i].y }];
            visited[i] = 1;
            let currentIdx = i;

            // Track direction for direction-aware selection
            let prevDirX = 0, prevDirY = 0;
            const GRID_W = Math.ceil(1.0 / gridCell);

            while (true) {
                const curr = points[currentIdx];
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
                            const next = points[nIdx];

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
                    const best = points[bestNextIdx];

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

        console.log(`[ConstrainedTriangulator] Built ${chains.length} chains with ${chains.reduce((a, c) => a + c.length, 0)} total points`);

        // ===========================================
        // PHASE 3: SIMPLIFY & DENSIFY Chains
        // 1. Simplify: Remove noise from raw GPU pixels (Ramer-Douglas-Peucker)
        // 2. Densify: Add interpolated points so CDT edges follow curves precisely
        // ===========================================
        const SIMPLIFY_TOLERANCE = 0.0005; // ~0.05% of domain (reduced from 0.002 to improve curve smoothness)
        const MAX_SEGMENT_LENGTH = 0.005; // 0.5% of domain = ~200 segments per full-length chain

        const densifyChain = (chain: Point2D[]): Point2D[] => {
            if (chain.length < 2) return chain;

            // Step 1: Simplify
            // Convert to {x,y} for simplify lib if needed, but Point2D matches.
            // simplify(points, tolerance, highQuality)
            const simplified = simplify(chain, SIMPLIFY_TOLERANCE, true);

            // Step 2: Densify
            if (simplified.length < 2) return simplified;

            const densified: Point2D[] = [simplified[0]];

            for (let i = 1; i < simplified.length; i++) {
                const prev = simplified[i - 1];
                const curr = simplified[i];
                const dx = curr.x - prev.x;
                const dy = curr.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy);

                if (len < MIN_SEGMENT_LENGTH) {
                    // Skip tiny segments to avoid numerical instability on GPU
                    continue;
                }

                if (len > MAX_SEGMENT_LENGTH) {
                    // Add interpolated points
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

        // ===========================================
        // PHASE 4: Generate Curve Buffer Points
        // Buffer points on both sides of curves create symmetric triangle ribbons
        // ===========================================
        const BUFFER_DISTANCE = 0.003; // ~0.3% of domain, perpendicular offset
        const curveBufferPoints: Point2D[] = [];

        for (const chain of densifiedChains) {
            for (let i = 0; i < chain.length; i++) {
                const curr = chain[i];

                // Calculate tangent direction (average of prev and next segments)
                let tx = 0, ty = 0;
                if (i > 0) {
                    tx += curr.x - chain[i - 1].x;
                    ty += curr.y - chain[i - 1].y;
                }
                if (i < chain.length - 1) {
                    tx += chain[i + 1].x - curr.x;
                    ty += chain[i + 1].y - curr.y;
                }

                // Normalize tangent
                const tLen = Math.sqrt(tx * tx + ty * ty);
                if (tLen < 0.0001) continue;
                tx /= tLen;
                ty /= tLen;

                // Perpendicular direction (rotate 90 degrees)
                const px = -ty;
                const py = tx;

                // Add buffer points on both sides with Seam Wrapping
                // If a point goes < 0, it wraps to 1+x. If > 1, it wraps to x-1.
                // We add BOTH the clamped version (to stay in domain) AND the wrapped version (ghost)
                const addWrappedBuffer = (bx: number, by: number) => {
                    // Clamp for primary domain
                    const xClamped = Math.max(0, Math.min(1, bx));
                    const yClamped = Math.max(0, Math.min(1, by)); // Y shouldn't wrap but clamp
                    curveBufferPoints.push({ x: xClamped, y: yClamped });

                    // Ghost Wrap Check
                    if (bx > 1.0) {
                        // Wrapped to left side
                        curveBufferPoints.push({ x: bx - 1.0, y: yClamped });
                    } else if (bx < 0.0) {
                        // Wrapped to right side
                        curveBufferPoints.push({ x: bx + 1.0, y: yClamped });
                    }
                };

                const bxPlus = curr.x + px * BUFFER_DISTANCE;
                const byPlus = curr.y + py * BUFFER_DISTANCE;
                addWrappedBuffer(bxPlus, byPlus);

                const bxMinus = curr.x - px * BUFFER_DISTANCE;
                const byMinus = curr.y - py * BUFFER_DISTANCE;
                addWrappedBuffer(bxMinus, byMinus);
            }
        }

        console.log(`[ConstrainedTriangulator] Generated ${curveBufferPoints.length} curve buffer points`);

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

    private static generateAdaptiveBackground(chains: Point2D[][]): Point2D[] {
        // We use a simplified Distance Field + Random Sampling approach.
        // True Poisson Disk is expensive dynamically.
        // 1. Build Distance Field (Approximate via Grid)
        const GW = 64;
        const GH = 64;
        const distField = new Float32Array(GW * GH).fill(1.0);

        // Rasterize chains into grid
        chains.forEach(chain => {
            for (let k = 0; k < chain.length - 1; k++) {
                const a = chain[k];
                const b = chain[k + 1];
                // Line rasterization (rough)
                const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
                const steps = Math.ceil(dist * GW * 2);
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const x = a.x + (b.x - a.x) * t;
                    const y = a.y + (b.y - a.y) * t;
                    const ix = Math.floor(x * GW);
                    const iy = Math.floor(y * GH);
                    if (ix >= 0 && ix < GW && iy >= 0 && iy < GH) {
                        distField[iy * GW + ix] = 0;
                        // Dilate slightly
                        // (Done in pass 2)
                    }
                }
            }
        });

        // Simple Distance Propagation (Fast Marching approx)
        // Pass 1: Top-Left to Bottom-Right
        for (let y = 0; y < GH; y++) {
            for (let x = 0; x < GW; x++) {
                const idx = y * GW + x;
                if (distField[idx] === 0) continue;
                let minD = 1.0;
                if (x > 0) minD = Math.min(minD, distField[idx - 1] + 1 / GW);
                if (y > 0) minD = Math.min(minD, distField[idx - GW] + 1 / GH);
                distField[idx] = minD;
            }
        }
        // Pass 2: Bottom-Right to Top-Left
        for (let y = GH - 1; y >= 0; y--) {
            for (let x = GW - 1; x >= 0; x--) {
                const idx = y * GW + x;
                let minD = distField[idx];
                if (x < GW - 1) minD = Math.min(minD, distField[idx + 1] + 1 / GW);
                if (y < GH - 1) minD = Math.min(minD, distField[idx + GW] + 1 / GH);
                distField[idx] = minD;
            }
        }

        // 2. Generate Points
        // We want density ~ 1 / distance?
        // Let's use rejection sampling.
        const candidates: Point2D[] = [];
        const NUM_SAMPLES = 5000; // Tweak for base density
        // const NUM_SAMPLES = 5000; // Tweak for base density

        // Min/Max edge lengths
        // CRITICAL: Must match boundary resolution (SEAMS=180)
        // 1/180 ≈ 0.0055, so MAX_EDGE = 0.0055 gives ~180x180 grid
        const MIN_EDGE = 0.001;
        const MAX_EDGE = 0.0055;

        // Jittered Grid Strategy for Guaranteed Coverage
        // Dart throwing is unreliable for "void" coverage. We need to FORCE points 
        // into the void to support the triangulation.
        const gridSizeX = Math.ceil(1.0 / MAX_EDGE);
        const gridSizeY = Math.ceil(1.0 / MAX_EDGE);
        const cellW = 1.0 / gridSizeX;
        const cellH = 1.0 / gridSizeY;

        for (let gy = 0; gy < gridSizeY; gy++) {
            for (let gx = 0; gx < gridSizeX; gx++) {
                // Jitter
                const rx = 0.2 + Math.random() * 0.6; // Keep away from cell edges slightly
                const ry = 0.2 + Math.random() * 0.6;
                const px = (gx + rx) * cellW;
                const py = (gy + ry) * cellH;

                // 1. Query Distance Field
                // Map px, py (0..1) to GW, GH
                const ix = Math.min(GW - 1, Math.floor(px * GW));
                const iy = Math.min(GH - 1, Math.floor(py * GH));
                const d = distField[iy * GW + ix];

                // 2. Reject if too close to feature
                if (d < MIN_EDGE) continue;

                // 3. Adaptive Density Check
                // If d is large (void), we WANT points.
                // If d is small (near feature), we only want them if they don't crowd.
                // But Jittered Grid ALREADY enforces spacing ~ MAX_EDGE.
                // So we can just accept all points that are far enough from features/walls.

                // OPTIONAL: Variable density (skip every other point if d is huge?)
                // For now, uniform density in the void is safer to prevent chords.

                // 4. Transitional Density Near Boundaries
                // The boundary has SEAMS=180 → 720 points
                // Interior has ~25,000 points (182×182 grid - thinned)
                // This density mismatch causes CDT to create fan patterns.
                // Solution: Aggressively thin points near edges with extended transition zone.
                const distFromEdgeX = Math.min(gx, gridSizeX - 1 - gx);
                const distFromEdgeY = Math.min(gy, gridSizeY - 1 - gy);
                const distFromEdge = Math.min(distFromEdgeX, distFromEdgeY);

                // Extended transition zone:
                // - Cells 0-2 from edge: 95% skip (very sparse)
                // - Cells 3-10 from edge: gradual decrease
                // - Cells 10+ from edge: minimal skip (full density)
                const transitionDepth = 15; // Extended from ~10
                if (distFromEdge < transitionDepth) {
                    const normalizedDist = distFromEdge / transitionDepth;
                    // Cubic falloff for smoother transition
                    const skipProbability = 0.95 * (1 - normalizedDist * normalizedDist * normalizedDist);
                    if (Math.random() < skipProbability) continue;
                }

                // Add point
                candidates.push({ x: px, y: py });
            }
        }
        console.log(`[ConstrainedTriangulator] Generated ${candidates.length} background points (Grid: ${gridSizeX}x${gridSizeY})`);
        return candidates;
    }

    // ===================================
    // 3. Constrained Delaunay Logic
    // ===================================

    private static runCDT(chains: Point2D[][], bgPoints: Point2D[], curveBufferPoints: Point2D[] = []): TriangulatedMesh {
        const points: [number, number][] = [];
        const edges: [number, number][] = [];

        // ===================================
        // 1. Add Boundary Box with Constraints
        //    The domain is [0,1] x [0,1] (normalized theta x t)
        //    We need explicit boundary edges so CDT knows what's inside/outside.
        // ===================================
        const SEAMS = 180; // Must match extractChains and appendSurfaces grid resolution
        const boundaryIndices = {
            left: [] as number[],   // x = 0
            right: [] as number[],  // x = 1
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

        // Right boundary (x = 1, y = 0 to 1)
        for (let k = 0; k <= SEAMS; k++) {
            const y = k / SEAMS;
            points.push([1, y]);
            boundaryIndices.right.push(idx++);
        }

        // Top boundary (x = 0 to 1, y = 1) - skip corners (already added)
        for (let k = 1; k < SEAMS; k++) {
            const x = k / SEAMS;
            points.push([x, 1]);
            boundaryIndices.top.push(idx++);
        }

        // Bottom boundary (x = 0 to 1, y = 0) - skip corners (already added)
        for (let k = 1; k < SEAMS; k++) {
            const x = k / SEAMS;
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
            points.push([chain[0].x, chain[0].y]); idx++;
            for (let k = 1; k < chain.length; k++) {
                points.push([chain[k].x, chain[k].y]); idx++;
                edges.push([idx - 2, idx - 1]);
            }
        });

        console.log(`[CDT] After features: ${idx} points, ${edges.length} edges`);

        // ===================================
        // 3. Validate and Clean Edges
        // ===================================
        const cleanEdges = (edgeList: number[][]): number[][] => {
            // Remove duplicate edges
            const seen = new Set<string>();
            const unique: number[][] = [];
            for (const [a, b] of edgeList) {
                const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push([a, b]);
                }
            }
            return unique;
        };

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
                // Skip if they share a vertex (adjacent edges)
                if (a === c || a === d || b === c || b === d) continue;
                if (isConflict(points[a], points[b], points[c], points[d])) {
                    intersects = true;
                    break;
                }
            }

            if (!intersects) {
                finalFeatureEdges.push(edge);
            }
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

            // Filter exterior triangles (centroid outside [0,1]x[0,1])
            const cx = (p0[0] + p1[0] + p2[0]) / 3;
            const cy = (p0[1] + p1[1] + p2[1]) / 3;
            if (cx < -1e-4 || cx > 1 + 1e-4 || cy < -1e-4 || cy > 1 + 1e-4) continue;

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
                console.error(`[stitchSeam] Invalid mapping: old(${idx0},${idx1},${idx2}) -> kept(${remapping[idx0]},${remapping[idx1]},${remapping[idx2]}) -> new(${map0},${map1},${map2})`);
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
            { id: 1, w: 180, h: 180 }, // Inner Wall
            { id: 2, w: 180, h: 8 },   // Rim (Matched to SEAMS=180)
            { id: 3, w: 180, h: 8 },   // Bottom Under (Matched to SEAMS=180)
            { id: 4, w: 180, h: 8 },   // Bottom Top
            { id: 5, w: 64, h: 8 }     // Drain
        ];

        // Combine
        // Note: outer.vertices is Float32Array, we need to convert to growable
        const allVertices: number[] = Array.from(outer.vertices);
        const allIndices: number[] = Array.from(outer.indices);

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
        // Standard grid generation (unchanged logic, just clean)
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
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const i0 = j * stride + i;
                const i1 = i0 + 1;
                const i2 = (j + 1) * stride + i;
                const i3 = i2 + 1;
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }
        }
        return { vertices, indices: new Uint32Array(indices) };
    }
}

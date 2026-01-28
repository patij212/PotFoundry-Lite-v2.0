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
        // DEBUG: Bypass CDT entirely. Use ONLY simple grids for all surfaces.
        // This isolates whether the issue is CDT or GPU shader.
        console.log('[ConstrainedTriangulator] DEBUG: Using ALL-GRID mode (no CDT)');

        const allSurfaces = [
            { id: 0, w: 180, h: 180 }, // Outer Wall (was CDT)
            { id: 1, w: 180, h: 180 }, // Inner Wall
            { id: 2, w: 180, h: 8 },   // Rim
            { id: 3, w: 180, h: 8 },   // Bottom Under
            { id: 4, w: 180, h: 8 },   // Bottom Top
            { id: 5, w: 64, h: 8 }     // Drain
        ];

        const allVertices: number[] = [];
        const allIndices: number[] = [];
        let vertexOffset = 0;

        for (const surf of allSurfaces) {
            const mesh = this.generateGrid(surf.w, surf.h, surf.id);
            for (let k = 0; k < mesh.vertices.length; k++) allVertices.push(mesh.vertices[k]);
            for (let k = 0; k < mesh.indices.length; k++) allIndices.push(mesh.indices[k] + vertexOffset);
            vertexOffset += mesh.vertices.length / 3;
        }

        console.log(`[ConstrainedTriangulator] All surfaces combined: ${vertexOffset} vertices, ${allIndices.length / 3} triangles`);

        return {
            vertices: new Float32Array(allVertices),
            indices: new Uint32Array(allIndices)
        };
    }

    // ===================================
    // 1. Feature Processing
    // ===================================

    public static extractChains(rawFeatures: FeaturePoint[]): { chains: Point2D[][], seamPoints: Point2D[] } {
        if (rawFeatures.length === 0) return { chains: [], seamPoints: [] };

        // Normalize inputs to [0,1] domain
        // theta: 0..2PI -> 0..1
        // t: 0..1 -> 0..1
        const points: { x: number, y: number, strength: number }[] = rawFeatures.map(f => ({
            x: f.theta / (Math.PI * 2),
            y: f.t,
            strength: f.strength
        }));

        // Bounding Box Safety
        const MARGIN = 0.005; // 0.5% margin
        points.forEach(p => {
            p.x = Math.max(MARGIN, Math.min(1 - MARGIN, p.x));
            p.y = Math.max(MARGIN, Math.min(1 - MARGIN, p.y));
        });

        // 1. Sort effectively for chaining (Scanline order)
        points.sort((a, b) => (a.y - b.y) || (a.x - b.x));

        // 2. Greedy Chaining with Directionality
        const chains: Point2D[][] = [];
        const visited = new Uint8Array(points.length);
        const MAX_CONNECT_DIST = 0.03; // ~3% of domain

        // Spatial Grid for neighbor lookup optimization
        const gridCell = 0.04;
        const grid = new Map<string, number[]>();
        const toKey = (p: Point2D) => `${Math.floor(p.x / gridCell)}_${Math.floor(p.y / gridCell)}`;
        points.forEach((p, i) => {
            const k = toKey(p);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k)!.push(i);
        });

        for (let i = 0; i < points.length; i++) {
            if (visited[i]) continue;

            // Start a new chain
            const chain: Point2D[] = [points[i]];
            visited[i] = 1;
            let currentIdx = i;

            while (true) {
                const curr = points[currentIdx];
                let bestNextIdx = -1;
                let bestDistSq = MAX_CONNECT_DIST * MAX_CONNECT_DIST;

                // Search neighborhood
                const gx = Math.floor(curr.x / gridCell);
                const gy = Math.floor(curr.y / gridCell);

                for (let jx = -1; jx <= 1; jx++) {
                    for (let jy = -1; jy <= 1; jy++) {
                        const cellKey = `${gx + jx}_${gy + jy}`;
                        const neighbors = grid.get(cellKey);
                        if (!neighbors) continue;

                        for (const nIdx of neighbors) {
                            if (visited[nIdx]) continue;
                            const next = points[nIdx];
                            const dx = next.x - curr.x;
                            const dy = next.y - curr.y;
                            const d2 = dx * dx + dy * dy;

                            if (d2 < bestDistSq) {
                                bestDistSq = d2;
                                bestNextIdx = nIdx;
                            }
                        }
                    }
                }

                if (bestNextIdx !== -1) {
                    visited[bestNextIdx] = 1;
                    chain.push(points[bestNextIdx]);
                    currentIdx = bestNextIdx;
                } else {
                    break;
                }
            }
            if (chain.length > 3) chains.push(chain);
        }

        // 3. Simplify Chains
        const simplifiedChains = chains.map(c => simplify(c, 0.002, true));

        // 4. Force Seam Nodes
        // We define fixed nodes on left/right boundary to ensure they match later
        // High resolution seams to match ancillary grids (w=180/360) 
        // and ensure watertight welding.
        // 180 ensures edge length ~2 degrees, small enough for WeldMesh epsilon.
        const SEAMS = 180; // Number of vertical divisions
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

        return { chains: simplifiedChains, seamPoints };
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

    private static runCDT(chains: Point2D[][], bgPoints: Point2D[], seams: Point2D[]): TriangulatedMesh {
        const points: [number, number][] = [];
        const edges: [number, number][] = [];

        // Flatten all points into single list
        // 1. Boundary/Seam (Highest priority)
        let idx = 0;
        seams.forEach(p => { points.push([p.x, p.y]); idx++; });

        // 2. Features (Constraints)
        chains.forEach(chain => {
            if (chain.length < 2) return;
            points.push([chain[0].x, chain[0].y]); idx++;
            for (let k = 1; k < chain.length; k++) {
                points.push([chain[k].x, chain[k].y]); idx++;
                edges.push([idx - 2, idx - 1]); // Add constraint edge
            }
        });

        // 3. Background
        bgPoints.forEach(p => { points.push([p.x, p.y]); idx++; });

        // TRIANGULATE
        // cdt2d handles constraints robustly.
        // But we must ensure input constraints don't intersect!
        // Our chaining logic (simple greedy) *might* self-intersect if features spiral.
        // However, simplify() usually handles local noise.
        // Crossing chains are a rare case in this specific domain (smooth SDF features).

        // Run CDT
        try {
            const triangles = cdt2d(points, edges, { exterior: false });

            // Convert to output format (rescaling x back to theta)
            const vertices = new Float32Array(points.length * 3);
            for (let i = 0; i < points.length; i++) {
                vertices[i * 3 + 0] = points[i][0] * Math.PI * 2; // Un-normalize Theta
                vertices[i * 3 + 1] = points[i][1];               // T
                vertices[i * 3 + 2] = 0;                          // Z (Surfaceless)
            }

            const indices = new Uint32Array(triangles.flat());
            return { vertices, indices };

        } catch (e) {
            console.error("CDT Failed", e);
            // Fallback: Empty mesh or Convex Hull?
            return { vertices: new Float32Array(0), indices: new Uint32Array(0) };
        }
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
        const TAU = Math.PI * 2;

        // Map Y-coord to Index for the Left Seam (x ~ 0)
        // Quantize Y to handle float drift
        const QUANT = 10000;
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

                // Try exact match and neighbors to handle float drift
                const candidates = [yKey, yKey - 1, yKey + 1];
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
        const dTheta = (Math.PI * 2) / w;
        const dT = 1.0 / h;

        let vIdx = 0;
        for (let j = 0; j <= h; j++) {
            const t = j * dT;
            for (let i = 0; i <= w; i++) {
                const theta = i * dTheta;
                vertices[vIdx++] = theta;
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

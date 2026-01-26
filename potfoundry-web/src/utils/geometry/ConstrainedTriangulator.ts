
import { FeaturePoint } from '../../renderers/webgpu/FeatureExtractionComputer';
import { simplify } from '../../utils/geometry/simplify';
import cdt2d from 'cdt2d';

export interface TriangulatedMesh {
    vertices: Float32Array;
    indices: Uint32Array;
}

export class ConstrainedTriangulator {

    /**
     * Generates a topology where feature chains are enforced as explicit edges.
     * Uses Aggressive Cleaning and Tube-Based Intersection Culling.
     */
    static triangulate(features: FeaturePoint[], gridSizeX: number = 720, gridSizeY: number = 720): TriangulatedMesh {
        const points: [number, number][] = [];
        const edges: [number, number][] = [];
        let pIdx = 0;

        // --- 1. Helpers for Robustness ---

        // Spatial Hash: Merge very close points
        const PT_EPS = 0.0002; // Reduced precision slightly to encourage merging
        const ptMap = new Map<string, number>();
        const getPtKey = (x: number, y: number) => `${Math.round(x / PT_EPS)}_${Math.round(y / PT_EPS)}`;

        const addNode = (x: number, y: number): number => {
            const key = getPtKey(x, y);
            if (ptMap.has(key)) return ptMap.get(key)!;
            points.push([x, y]);
            const idx = pIdx++;
            ptMap.set(key, idx);
            return idx;
        };

        // Edge Grid for spatial queries
        const EDGE_BUCKET = 0.05;
        const edgeGrid = new Map<string, number[]>();

        const getEdgeCells = (p1: [number, number], p2: [number, number]) => {
            const cells = new Set<string>();
            const minX = Math.min(p1[0], p2[0]), maxX = Math.max(p1[0], p2[0]);
            const minY = Math.min(p1[1], p2[1]), maxY = Math.max(p1[1], p2[1]);

            const iMin = Math.floor(minX / EDGE_BUCKET);
            const iMax = Math.floor(maxX / EDGE_BUCKET);
            const jMin = Math.floor(minY / EDGE_BUCKET);
            const jMax = Math.floor(maxY / EDGE_BUCKET);

            for (let i = iMin; i <= iMax; i++) {
                for (let j = jMin; j <= jMax; j++) {
                    cells.add(`${i}_${j}`);
                }
            }
            return Array.from(cells);
        };

        // Distance from point p to segment ab
        const distToSegmentSq = (p: [number, number], a: [number, number], b: [number, number]) => {
            const l2 = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
            if (l2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
            let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
            t = Math.max(0, Math.min(1, t));
            const px = a[0] + t * (b[0] - a[0]);
            const py = a[1] + t * (b[1] - a[1]);
            return (p[0] - px) ** 2 + (p[1] - py) ** 2;
        };

        const ccw = (a: [number, number], b: [number, number], c: [number, number]) => {
            return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        };

        // Strict Check: Intersection OR Proximity
        const isConflict = (a: [number, number], b: [number, number]) => {
            const neighbors = getEdgeCells(a, b);
            // "Tube" radius squared. 
            // If a new edge passes within 0.002 of an existing edge, reject it.
            // This prevents "Parallel Ridge" artifacts.
            const TUBE_RAD_SQ = 0.002 * 0.002;

            for (const key of neighbors) {
                const cellEdges = edgeGrid.get(key);
                if (!cellEdges) continue;

                for (const eIdx of cellEdges) {
                    const e = edges[eIdx];
                    const c = points[e[0]];
                    const d = points[e[1]];

                    // 1. Strict Intersection
                    // Ignore shared endpoints
                    const shareEndpoint = (Math.abs(a[0] - c[0]) < 1e-5 && Math.abs(a[1] - c[1]) < 1e-5) ||
                        (Math.abs(a[0] - d[0]) < 1e-5 && Math.abs(a[1] - d[1]) < 1e-5) ||
                        (Math.abs(b[0] - c[0]) < 1e-5 && Math.abs(b[1] - c[1]) < 1e-5) ||
                        (Math.abs(b[0] - d[0]) < 1e-5 && Math.abs(b[1] - d[1]) < 1e-5);

                    if (!shareEndpoint) {
                        const cross = (ccw(a, b, c) * ccw(a, b, d) < 0) && (ccw(c, d, a) * ccw(c, d, b) < 0);
                        if (cross) return true;

                        // 2. Proximity (Tube)
                        // Check distance from a to cd, b to cd, c to ab, d to ab
                        // If any is small, reject.
                        if (distToSegmentSq(a, c, d) < TUBE_RAD_SQ) return true;
                        if (distToSegmentSq(b, c, d) < TUBE_RAD_SQ) return true;
                        // (Checking endpoints against segment is usually enough for crossed tubes)
                    }
                }
            }
            return false;
        };

        const tryAddEdge = (idx1: number, idx2: number) => {
            if (idx1 === idx2) return;
            const p1 = points[idx1];
            const p2 = points[idx2];

            if (isConflict(p1, p2)) return;

            edges.push([idx1, idx2]);
            const newEIdx = edges.length - 1;
            const cells = getEdgeCells(p1, p2);
            for (const key of cells) {
                if (!edgeGrid.has(key)) edgeGrid.set(key, []);
                edgeGrid.get(key)!.push(newEIdx);
            }
        };

        // --- 2. Process Features ---
        const BOUNDARY_MARGIN = 0.01; // Increase margin

        const chains = this.extractChains(features);
        const simplifiedChains = chains.map(chain => {
            // Clamp points
            const pts = chain.map(fp => ({
                x: Math.max(BOUNDARY_MARGIN, Math.min(Math.PI * 2 - BOUNDARY_MARGIN, fp.theta)),
                y: Math.max(BOUNDARY_MARGIN, Math.min(1.0 - BOUNDARY_MARGIN, fp.t))
            }));
            return simplify(pts, 0.003, true); // Slightly coarser simplify to reduce node count
        });

        // Sort chains by length (longer = more important)
        simplifiedChains.sort((a, b) => b.length - a.length);

        simplifiedChains.forEach(chain => {
            if (chain.length < 2) return;
            let prevIdx = addNode(chain[0].x, chain[0].y);
            for (let k = 1; k < chain.length; k++) {
                const currIdx = addNode(chain[k].x, chain[k].y);
                tryAddEdge(prevIdx, currIdx);
                prevIdx = currIdx;
            }
        });

        // --- 3. Uniform Boundary Box ---
        const STEPS_X = gridSizeX; // 720
        const STEPS_Y = gridSizeY; // 720

        let prevIdx = -1;

        // We use tryAddEdge to protect boundary too? 
        // No, boundary MUST exist. We should add boundary FIRST?
        // Actually, if a feature crosses boundary, we want feature clipped.
        // But we clamped features.
        // So checking conflict for boundary is just a sanity check. 
        // We FORCE boundary.

        const addChainForce = (xFrom: number, yFrom: number, xTo: number, yTo: number, steps: number) => {
            if (prevIdx === -1) prevIdx = addNode(xFrom, yFrom);
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const x = xFrom + (xTo - xFrom) * t;
                const y = yFrom + (yTo - yFrom) * t;
                const curr = addNode(x, y);
                // We add edge directly to array, bypassing conflict check (Boundary is Supreme)
                edges.push([prevIdx, curr]);
                // But we must regiser it in grid so internal features don't cross it
                const cells = getEdgeCells(points[prevIdx], points[curr]);
                for (const key of cells) {
                    if (!edgeGrid.has(key)) edgeGrid.set(key, []);
                    edgeGrid.get(key)!.push(edges.length - 1);
                }
                prevIdx = curr;
            }
        };

        // Reset everything to add boundary FIRST?
        // Yes, good practice. Features should respect boundary.
        // Let's clear and restart pIdx? No, just reorder.
        // Can't easily reorder entire function.
        // But features are clamped, so they won't conflict. 
        // The only conflict is parallel features.

        // let's just add boundary now. It fits the loop flow.
        addChainForce(0, 0, Math.PI * 2, 0, STEPS_X);       // Bottom
        addChainForce(Math.PI * 2, 0, Math.PI * 2, 1, STEPS_Y); // Right
        addChainForce(Math.PI * 2, 1, 0, 1, STEPS_X);       // Top
        addChainForce(0, 1, 0, 0, STEPS_Y);               // Left

        // --- 4. background Grid ---
        const OCC_W = 360;
        const OCC_H = 360;
        const occupied = new Uint8Array(OCC_W * OCC_H);

        // Mark occupied - AGGRESSIVE RADIUS
        // 5x5 was ~1.4%. 
        // Let's use Radius based on coordinate distance.
        // Radius 0.02 (Tube radius * 10).
        const EXCLUSION_RAD = 0.02;
        const EXCLUSION_RAD_SQ = EXCLUSION_RAD * EXCLUSION_RAD;

        // Iterate all points added so far (Features + Boundary)
        for (let k = 0; k < points.length; k++) {
            const p = points[k];
            // Convert to grid coords
            const gx = (p[0] / (Math.PI * 2)) * OCC_W;
            const gy = p[1] * OCC_H;

            // Search range
            const range = Math.ceil(EXCLUSION_RAD * OCC_W); // e.g. 0.02 * 360 = 7 cells
            const ix = Math.floor(gx);
            const iy = Math.floor(gy);

            for (let dy = -range; dy <= range; dy++) {
                for (let dx = -range; dx <= range; dx++) {
                    const nx = ix + dx;
                    const ny = iy + dy;
                    if (nx >= 0 && nx < OCC_W && ny >= 0 && ny < OCC_H) {
                        // Check exact distance to be precise
                        // cell center
                        const cx = (nx + 0.5) / OCC_W * Math.PI * 2;
                        const cy = (ny + 0.5) / OCC_H;

                        const d2 = (cx - p[0]) ** 2 + (cy - p[1]) ** 2;
                        if (d2 < EXCLUSION_RAD_SQ) {
                            occupied[ny * OCC_W + nx] = 1;
                        }
                    }
                }
            }
        }

        const BG_W = 360;
        const BG_H = 360;

        for (let j = 0; j <= BG_H; j++) {
            const t = j / BG_H;
            for (let i = 0; i <= BG_W; i++) {
                const ix = Math.floor((i / BG_W) * OCC_W);
                const iy = Math.floor((j / BG_H) * OCC_H);
                // Safety clamp
                const safeIx = Math.max(0, Math.min(OCC_W - 1, ix));
                const safeIy = Math.max(0, Math.min(OCC_H - 1, iy));

                if (occupied[safeIy * OCC_W + safeIx]) continue;

                const theta = (i / BG_W) * Math.PI * 2;
                addNode(theta, t);
            }
        }

        // --- 5. Run CDT ---
        console.time('cdt2d');
        const triangles = cdt2d(points, edges, { exterior: false });
        console.timeEnd('cdt2d');

        // --- 6. Output ---
        const vertices = new Float32Array(points.length * 3);
        const indicesArray = new Uint32Array(triangles.length * 3);

        for (let i = 0; i < points.length; i++) {
            vertices[i * 3] = points[i][0];
            vertices[i * 3 + 1] = points[i][1];
            vertices[i * 3 + 2] = 0;
        }

        for (let i = 0; i < triangles.length; i++) {
            indicesArray[i * 3] = triangles[i][0];
            indicesArray[i * 3 + 1] = triangles[i][1];
            indicesArray[i * 3 + 2] = triangles[i][2];
        }

        return { vertices, indices: indicesArray };
    }

    static generateFullPot(features: FeaturePoint[]): TriangulatedMesh {
        const outer = this.triangulate(features, 720, 720);

        const otherSurfaces = [
            { id: 1, w: 360, h: 360 },
            { id: 2, w: 720, h: 16 },
            { id: 3, w: 720, h: 64 },  // Upgraded to match Outer
            { id: 4, w: 360, h: 64 },
            { id: 5, w: 128, h: 64 }
        ];

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

    private static extractChains(features: FeaturePoint[]): FeaturePoint[][] {
        if (features.length === 0) return [];
        features.sort((a, b) => {
            if (Math.abs(a.t - b.t) > 0.001) return a.t - b.t;
            return a.theta - b.theta;
        });
        const chains: FeaturePoint[][] = [];
        const activeChains: FeaturePoint[][] = [];
        const MAX_DT = 0.05;
        const MAX_DTH = 0.2;
        const WRAP_THRESHOLD = 5.0;
        for (const pt of features) {
            let bestChainIdx = -1;
            let bestDist = Infinity;
            for (let i = 0; i < activeChains.length; i++) {
                const chain = activeChains[i];
                const tip = chain[chain.length - 1];
                const dt = pt.t - tip.t;
                if (dt > MAX_DT) continue;
                const dth = Math.abs(pt.theta - tip.theta);
                if (dth > WRAP_THRESHOLD) continue;
                if (dth < MAX_DTH && dth < bestDist) {
                    bestDist = dth;
                    bestChainIdx = i;
                }
            }
            if (bestChainIdx !== -1) {
                activeChains[bestChainIdx].push(pt);
            } else {
                activeChains.push([pt]);
            }
        }
        chains.push(...activeChains);
        return chains.filter(c => c.length > 5);
    }
}


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
     * Uses robust intersection culling and uniform boundary constraints.
     */
    static triangulate(features: FeaturePoint[], gridSizeX: number = 720, gridSizeY: number = 720): TriangulatedMesh {
        const points: [number, number][] = [];
        const edges: [number, number][] = [];
        let pIdx = 0;

        // --- 1. Helpers for Robustness ---

        // Spatial Hash for Points (Merge close vertices)
        // Must be finer than grid resolution (2PI/720 ~= 0.0087)
        const PT_EPS = 0.0001;
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

        // Spatial Hash for Edges (Intersection Check)
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

        const ccw = (a: [number, number], b: [number, number], c: [number, number]) => {
            return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        };

        const intersects = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
            // Shared endpoints are OK
            if ((Math.abs(a[0] - c[0]) < 1e-5 && Math.abs(a[1] - c[1]) < 1e-5) ||
                (Math.abs(a[0] - d[0]) < 1e-5 && Math.abs(a[1] - d[1]) < 1e-5) ||
                (Math.abs(b[0] - c[0]) < 1e-5 && Math.abs(b[1] - c[1]) < 1e-5) ||
                (Math.abs(b[0] - d[0]) < 1e-5 && Math.abs(b[1] - d[1]) < 1e-5)) return false;

            return (ccw(a, b, c) * ccw(a, b, d) < 0) && (ccw(c, d, a) * ccw(c, d, b) < 0);
        };

        const tryAddEdge = (idx1: number, idx2: number) => {
            if (idx1 === idx2) return;
            const p1 = points[idx1];
            const p2 = points[idx2];

            // Check intersection against existing edges
            const cells = getEdgeCells(p1, p2);
            for (const key of cells) {
                const neighbors = edgeGrid.get(key);
                if (!neighbors) continue;
                for (const eIdx of neighbors) {
                    const e = edges[eIdx];
                    const ep1 = points[e[0]];
                    const ep2 = points[e[1]];
                    if (intersects(p1, p2, ep1, ep2)) {
                        return; // Reject intersection
                    }
                }
            }

            edges.push([idx1, idx2]);
            const newEIdx = edges.length - 1;
            for (const key of cells) {
                if (!edgeGrid.has(key)) edgeGrid.set(key, []);
                edgeGrid.get(key)!.push(newEIdx);
            }
        };

        // --- 2. Process Features ---
        // CLAMP features away from boundary to preserve Uniform Boundary Vertices
        const BOUNDARY_MARGIN = 0.005; // Sufficient margin

        const chains = this.extractChains(features);
        const simplifiedChains = chains.map(chain => {
            // Clamp points
            const pts = chain.map(fp => ({
                x: Math.max(BOUNDARY_MARGIN, Math.min(Math.PI * 2 - BOUNDARY_MARGIN, fp.theta)),
                y: Math.max(BOUNDARY_MARGIN, Math.min(1.0 - BOUNDARY_MARGIN, fp.t))
            }));
            return simplify(pts, 0.002, true);
        });

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
        // Must match the resolution of adjacent surfaces (Rim/Bottom)
        // Rim/Bottom use gridSizeX (720) and gridSizeY (720) or similar.
        // We strictly enforce 720 steps for Top/Bottom to match Rim.

        const STEPS_X = gridSizeX; // 720
        const STEPS_Y = gridSizeY; // 720

        // Reuse corner indices?
        // Actually, we generate the loop sequentially.

        // Points:
        // Bottom: (0,0) -> (2PI, 0)
        // Right:  (2PI, 0) -> (2PI, 1)
        // Top:    (2PI, 1) -> (0, 1)  (Reversed? No, cdt2d doesn't care about winding for edges, but consistency helps)
        // Left:   (0, 1) -> (0, 0)

        let firstIdx = -1;
        let prevIdx = -1;

        // Helper to add chain of edges
        const addChain = (xFrom: number, yFrom: number, xTo: number, yTo: number, steps: number) => {
            if (prevIdx === -1) {
                prevIdx = addNode(xFrom, yFrom);
                firstIdx = prevIdx;
            }

            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const x = xFrom + (xTo - xFrom) * t;
                const y = yFrom + (yTo - yFrom) * t;
                const curr = addNode(x, y); // Spatial hash handles closing the loop at the end
                tryAddEdge(prevIdx, curr);
                prevIdx = curr;
            }
        };

        addChain(0, 0, Math.PI * 2, 0, STEPS_X);       // Bottom
        addChain(Math.PI * 2, 0, Math.PI * 2, 1, STEPS_Y); // Right
        addChain(Math.PI * 2, 1, 0, 1, STEPS_X);       // Top
        addChain(0, 1, 0, 0, STEPS_Y);               // Left

        // --- 4. background Grid ---
        const OCC_W = 360;
        const OCC_H = 360;
        const occupied = new Uint8Array(OCC_W * OCC_H);

        // Mark occupied...
        for (const p of points) {
            const ix = Math.floor(p[0] / (Math.PI * 2) * OCC_W);
            const iy = Math.floor(p[1] * OCC_H);
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const nx = ix + dx, ny = iy + dy;
                    if (nx >= 0 && nx < OCC_W && ny >= 0 && ny < OCC_H) occupied[ny * OCC_W + nx] = 1;
                }
            }
        }

        // Use 360x360 for background Steiner points (balanced density)
        const BG_W = 360;
        const BG_H = 360;

        for (let j = 0; j <= BG_H; j++) {
            const t = j / BG_H;
            for (let i = 0; i <= BG_W; i++) {
                const ix = Math.floor((i / BG_W) * OCC_W);
                const iy = Math.floor((j / BG_H) * OCC_H);
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
        // 1. Generate Constrained Outer Wall (Surface 0)
        // Uses 720 steps for Top/Bottom boundary to match Rim/Bottom
        const outer = this.triangulate(features, 720, 720);

        // 2. Generate other surfaces
        const otherSurfaces = [
            { id: 1, w: 360, h: 360 }, // Inner
            { id: 2, w: 720, h: 16 },  // Rim (Matches Outer X=720)
            { id: 3, w: 360, h: 64 },  // Bottom Under (Outer edge matches 720?) 
            // Wait, Standard grid w=360. 
            // PROBLEM: Bottom Under W=360, but Outer W=720.
            // Vertices won't match. 
            // We should upgrade Bottom Under to 720? Or downgrade Outer?
            // Rim is 720. So Outer must be 720.
            // Bottom Under should probably be 720 at the edge. 
            // generateGrid is uniform density. If we change W, we change density.
            // Let's bump Bottom Under to 720 for watertightness.
            { id: 4, w: 360, h: 64 },  // Bottom Top 
            { id: 5, w: 128, h: 64 }   // Drain
        ];

        // Fix: Make BottomUnder match Outer (720)
        otherSurfaces[2].w = 720;

        // Merge logic
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


/**
 * weldMesh.ts
 * 
 * Welds vertices that are within a certain epsilon distance.
 * Performance Optimized: Uses Spatial Sorting (Int32 Quantization) instead of String Hashing.
 * Eliminates V8 memory crashes on large meshes (2M+ vertices).
 */

export interface WeldedMesh {
    vertices: Float32Array;
    indices: Uint32Array;
}

export function weldMesh(vertices: Float32Array, indices: Uint32Array, epsilon = 1e-4): WeldedMesh {
    const vertexCount = vertices.length / 3;
    if (vertexCount === 0) return { vertices: new Float32Array(0), indices: new Uint32Array(0) };

    const startTime = performance.now();
    const precision = Math.round(1 / epsilon);

    // 1. Quantize and Store for Sorting
    // Structure: [x, y, z, originalIndex]
    // We use a flat Int32Array for cache coherence
    const data = new Int32Array(vertexCount * 4);
    const sortIndices = new Uint32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
        data[i * 4] = Math.round(vertices[i * 3] * precision);
        data[i * 4 + 1] = Math.round(vertices[i * 3 + 1] * precision);
        data[i * 4 + 2] = Math.round(vertices[i * 3 + 2] * precision);
        data[i * 4 + 3] = i;
        sortIndices[i] = i;
    }

    // 2. Sort by X, then Y, then Z
    // Using DataView or straight access? Straight access is faster.
    sortIndices.sort((a, b) => {
        const ax = data[a * 4];
        const bx = data[b * 4];
        if (ax !== bx) return ax - bx;

        const ay = data[a * 4 + 1];
        const by = data[b * 4 + 1];
        if (ay !== by) return ay - by;

        return data[a * 4 + 2] - data[b * 4 + 2];
    });

    // 3. Merge
    const remapping = new Int32Array(vertexCount).fill(-1);
    const uniqueVertices: number[] = [];
    let uniqueCount = 0;

    for (let i = 0; i < vertexCount; i++) {
        const idx = sortIndices[i];

        // Skip if already mapped (handled by a previous vertex in the cluster)
        if (remapping[idx] !== -1) continue;

        // Start a new cluster
        remapping[idx] = uniqueCount;
        uniqueVertices.push(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);

        const x = data[idx * 4];
        const y = data[idx * 4 + 1];
        const z = data[idx * 4 + 2];

        // Look ahead for candidates within 1 unit (epsilon)
        // Since sorted by X, we can stop when X difference > 1
        for (let j = i + 1; j < vertexCount; j++) {
            const nextIdx = sortIndices[j];
            // Skip if already merged
            if (remapping[nextIdx] !== -1) continue;

            // X check
            const nx = data[nextIdx * 4];
            if (nx > x + 1) break; // Guaranteed out of range

            // Y check (must be within 1)
            const ny = data[nextIdx * 4 + 1];
            if (Math.abs(ny - y) > 1) continue;

            // Z check (must be within 1)
            const nz = data[nextIdx * 4 + 2];
            if (Math.abs(nz - z) > 1) continue;

            // Match found! Map to current unique vertex
            remapping[nextIdx] = uniqueCount;
        }

        uniqueCount++;
    }

    // 4. Rebuild Mesh
    const newVertices = new Float32Array(uniqueVertices);
    const newIndices: number[] = [];

    // Minimum area threshold (squared) for valid triangles
    // 1e-10 mm² is vanishingly small - any smaller is numerical noise
    const MIN_AREA_SQ = 1e-10;
    let degenerateCount = 0;
    let sliverCount = 0;

    // Remap Indices
    for (let i = 0; i < indices.length; i += 3) {
        const a = remapping[indices[i]];
        const b = remapping[indices[i + 1]];
        const c = remapping[indices[i + 2]];

        // Filter degenerate (same indices)
        if (a === b || b === c || c === a) {
            degenerateCount++;
            continue;
        }

        // Filter slivers (near-zero area via cross product magnitude)
        // Area = 0.5 * |AB x AC|
        const ax = newVertices[a * 3], ay = newVertices[a * 3 + 1], az = newVertices[a * 3 + 2];
        const bx = newVertices[b * 3], by = newVertices[b * 3 + 1], bz = newVertices[b * 3 + 2];
        const cx = newVertices[c * 3], cy = newVertices[c * 3 + 1], cz = newVertices[c * 3 + 2];

        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;

        // Cross product
        const crossX = aby * acz - abz * acy;
        const crossY = abz * acx - abx * acz;
        const crossZ = abx * acy - aby * acx;

        // Area² = 0.25 * |cross|²
        const areaSq = 0.25 * (crossX * crossX + crossY * crossY + crossZ * crossZ);

        if (areaSq < MIN_AREA_SQ) {
            sliverCount++;
            continue;
        }

        // Aspect ratio filter: catch pathologically thin triangles
        // Ratio = longest_edge / shortest_altitude. If > 50, triangle is a sliver.
        // (Equilateral = 1.15, reasonable = < 10, pathological = > 50)
        const d01sq = abx * abx + aby * aby + abz * abz;
        const d12sq = (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2;
        const d20sq = acx * acx + acy * acy + acz * acz;
        const maxEdgeSq = Math.max(d01sq, d12sq, d20sq);
        // ratio = maxEdge / (2 * area / maxEdge) = maxEdge² / (2 * area)
        const ratioSq = (maxEdgeSq * maxEdgeSq) / (4.0 * areaSq);
        if (ratioSq > 50.0 * 50.0) {
            sliverCount++;
            continue;
        }

        newIndices.push(a, b, c);
    }

    const dt = performance.now() - startTime;
    const filteredTotal = degenerateCount + sliverCount;
    console.log(`[weldMesh] Welded ${vertexCount} -> ${uniqueCount} vertices in ${dt.toFixed(2)}ms. Filtered ${filteredTotal} bad tris (${degenerateCount} degenerate, ${sliverCount} slivers).`);

    // ========== FIX: REMOVE DUPLICATE TRIANGLES ==========
    // Duplicate triangles cause non-manifold edges (3+ faces per edge).
    // The previous weld step merged vertices, so now we likely have identical index triplets.
    const triSet = new Set<string>();
    const dedupedIndices: number[] = [];
    let duplicateCount = 0;

    for (let i = 0; i < newIndices.length; i += 3) {
        const a = newIndices[i];
        const b = newIndices[i + 1];
        const c = newIndices[i + 2];

        // Create canonical key (sorted indices to catch permutations like A-B-C vs B-C-A)
        // Since we enforced winding order elsewhere, sorting indices loses winding info for KEY purposes only,
        // but that's fine because (A,B,C) and (A,C,B) are distinct geometric triangles if we care about normals,
        // but for "overlapping geometry" they are collisions.
        // However, usually duplicate triangles from welding come from identical original triangles 
        // that got their vertices merged to the same IDs. They will have the same winding.
        // If we have (A,B,C) and (A,C,B), that's a zero-volume tet or conflicting normals.
        // For safety, let's treat any permutation as a collision.

        let i0 = a, i1 = b, i2 = c;
        // Sort
        if (i0 > i1) { const t = i0; i0 = i1; i1 = t; }
        if (i0 > i2) { const t = i0; i0 = i2; i2 = t; }
        if (i1 > i2) { const t = i1; i1 = i2; i2 = t; }

        const key = `${i0}_${i1}_${i2}`;

        if (triSet.has(key)) {
            duplicateCount++;
            continue; // Skip duplicate
        }
        triSet.add(key);
        dedupedIndices.push(a, b, c);
    }

    if (duplicateCount > 0) {
        console.log(`[weldMesh] Removed ${duplicateCount} duplicate triangles.`);
    }

    // ========== DIAGNOSTICS: Non-manifold edge check ==========
    const edgeMap = new Map<string, number>();
    const boundaryEdgeList: { v1: number, v2: number }[] = [];

    for (let i = 0; i < dedupedIndices.length; i += 3) {
        const a = dedupedIndices[i];
        const b = dedupedIndices[i + 1];
        const c = dedupedIndices[i + 2];

        const addEdge = (v1: number, v2: number) => {
            const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
            edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
        };
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
    }

    let nonManifoldEdges = 0;
    let boundaryEdges = 0;
    const errorSamples: string[] = [];

    for (const [key, count] of edgeMap.entries()) {
        const [v1, v2] = key.split('_').map(Number);
        if (count > 2) {
            nonManifoldEdges++;
            if (errorSamples.length < 5) {
                const x1 = newVertices[v1 * 3], y1 = newVertices[v1 * 3 + 1], z1 = newVertices[v1 * 3 + 2];
                const x2 = newVertices[v2 * 3], y2 = newVertices[v2 * 3 + 1], z2 = newVertices[v2 * 3 + 2];
                errorSamples.push(`NM Count ${count}: [${v1}](${x1.toFixed(3)}, ${y1.toFixed(3)}, ${z1.toFixed(3)}) - [${v2}](${x2.toFixed(3)}, ${y2.toFixed(3)}, ${z2.toFixed(3)})`);
            }
        }
        if (count === 1) {
            boundaryEdges++;
            // Store a sample of boundary edges for gap analysis (limit memory)
            if (boundaryEdgeList.length < 200) {
                // Store ORIGINAL direction if possible? Map loses direction.
                // But we just want positions.
                boundaryEdgeList.push({ v1, v2 });
            }
        }
    }

    if (nonManifoldEdges > 0 || boundaryEdges > 100) {
        console.warn(`[weldMesh] MESH ISSUES: ${nonManifoldEdges} non-manifold edges, ${boundaryEdges} boundary edges (holes)`);

        // --- GAP ANALYSIS (New) ---
        // Pick 5 boundary edges and find the closest matching boundary edge (reversed geometry)
        // This is slow (O(N)), so only do a few samples.
        const gapSamples: string[] = [];
        const MAX_SEARCH = 1000; // Limit search to first 1000 boundary edges to avoid hang
        const searchList = boundaryEdgeList.length > MAX_SEARCH ? boundaryEdgeList.slice(0, MAX_SEARCH) : boundaryEdgeList;

        let minTotalGap = 9999.0;
        let maxTotalGap = 0.0;

        // We only check the first 5 edges against the searchList
        for (let i = 0; i < Math.min(5, boundaryEdgeList.length); i++) {
            const e1 = boundaryEdgeList[i];
            const p1a = { x: newVertices[e1.v1 * 3], y: newVertices[e1.v1 * 3 + 1], z: newVertices[e1.v1 * 3 + 2] };
            const p1b = { x: newVertices[e1.v2 * 3], y: newVertices[e1.v2 * 3 + 1], z: newVertices[e1.v2 * 3 + 2] };

            let bestGap = 9999.0;
            // let bestMatch = -1;

            for (let j = 0; j < searchList.length; j++) {
                if (i === j) continue;
                const e2 = searchList[j];
                const p2a = { x: newVertices[e2.v1 * 3], y: newVertices[e2.v1 * 3 + 1], z: newVertices[e2.v1 * 3 + 2] };
                const p2b = { x: newVertices[e2.v2 * 3], y: newVertices[e2.v2 * 3 + 1], z: newVertices[e2.v2 * 3 + 2] };

                // Check "Reversed" match: A->B matches D->C (A near D, B near C)
                // Or "Forward" match (A near C, B near D) - effectively same edge (duplicate)

                const d_ad = Math.hypot(p1a.x - p2a.x, p1a.y - p2a.y, p1a.z - p2a.z);
                const d_bc = Math.hypot(p1b.x - p2b.x, p1b.y - p2b.y, p1b.z - p2b.z);
                const gap1 = Math.max(d_ad, d_bc);

                const d_ac = Math.hypot(p1a.x - p2b.x, p1a.y - p2b.y, p1a.z - p2b.z);
                const d_bd = Math.hypot(p1b.x - p2a.x, p1b.y - p2a.y, p1b.z - p2a.z);
                const gap2 = Math.max(d_ac, d_bd);

                const localMin = Math.min(gap1, gap2);
                if (localMin < bestGap) {
                    bestGap = localMin;
                }
            }

            gapSamples.push(`Edge [${e1.v1}-${e1.v2}] Gap: ${bestGap.toFixed(6)}`);
            minTotalGap = Math.min(minTotalGap, bestGap);
            maxTotalGap = Math.max(maxTotalGap, bestGap);
        }

        if (gapSamples.length > 0) {
            console.warn(`[weldMesh] Gap Analysis (Sampled): Min=${minTotalGap.toFixed(6)}, Max=${maxTotalGap.toFixed(6)}\n` + gapSamples.join('\n'));
        }

        if (errorSamples.length > 0) {
            console.warn(`[weldMesh] Sample Non-Manifold Edges:\n` + errorSamples.join('\n'));
        }
    } else {
        console.log(`[weldMesh] Mesh check OK: 0 non-manifold, ${boundaryEdges} boundary edges`);
    }
    // ========== END DIAGNOSTICS ==========

    return {
        vertices: newVertices,
        indices: new Uint32Array(dedupedIndices)
    };
}

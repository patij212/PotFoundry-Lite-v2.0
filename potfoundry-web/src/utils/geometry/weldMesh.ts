
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

        // Look ahead for identical quantized values
        for (let j = i + 1; j < vertexCount; j++) {
            const nextIdx = sortIndices[j];

            // Fast exit: X sorted
            const nx = data[nextIdx * 4];
            if (nx !== x) break;

            // Check Y and Z
            const ny = data[nextIdx * 4 + 1];
            if (ny !== y) continue;
            const nz = data[nextIdx * 4 + 2];
            if (nz !== z) continue;

            // Match found! Map to current unique vertex
            // Note: If remapping[nextIdx] was already set, it means we have duplicates in sort order?
            // Should be -1 since we iterate i sequentially and haven't reached j yet.
            remapping[nextIdx] = uniqueCount;
        }

        uniqueCount++;
    }

    // 4. Rebuild Mesh
    const newVertices = new Float32Array(uniqueVertices);
    const newIndices: number[] = [];

    // Remap Indices
    for (let i = 0; i < indices.length; i += 3) {
        const a = remapping[indices[i]];
        const b = remapping[indices[i + 1]];
        const c = remapping[indices[i + 2]];

        // Filter degenerate
        if (a !== b && b !== c && c !== a) {
            newIndices.push(a, b, c);
        }
    }

    const dt = performance.now() - startTime;
    console.log(`[weldMesh] Welded ${vertexCount} -> ${uniqueCount} vertices in ${dt.toFixed(2)}ms.`);

    return {
        vertices: newVertices,
        indices: new Uint32Array(newIndices)
    };
}

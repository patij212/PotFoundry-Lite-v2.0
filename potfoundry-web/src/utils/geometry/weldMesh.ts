
/**
 * weldMesh.ts
 * 
 * Welds vertices that are within a certain epsilon distance.
 * Crucial for fixing seams and joining separate mesh patches (e.g. Wall + Rim).
 */

export interface WeldedMesh {
    vertices: Float32Array;
    indices: Uint32Array;
}

export function weldMesh(vertices: Float32Array, indices: Uint32Array, epsilon = 1e-4): WeldedMesh {
    const vertexCount = vertices.length / 3;
    const remapping = new Int32Array(vertexCount).fill(-1);
    const uniqueVertices: number[] = [];
    let uniqueCount = 0;

    // Simple robust method: Decimal quantization Key
    // Using a Map is cleaner than sorting for Javascript
    const precision = Math.round(1 / epsilon);
    const keyMap = new Map<string, number>();

    const getKey = (x: number, y: number, z: number) => {
        const kX = Math.round(x * precision);
        const kY = Math.round(y * precision);
        const kZ = Math.round(z * precision);
        return `${kX}_${kY}_${kZ}`;
    };

    for (let i = 0; i < vertexCount; i++) {
        const x = vertices[i * 3];
        const y = vertices[i * 3 + 1];
        const z = vertices[i * 3 + 2];
        const key = getKey(x, y, z);

        if (keyMap.has(key)) {
            remapping[i] = keyMap.get(key)!;
        } else {
            remapping[i] = uniqueCount;
            keyMap.set(key, uniqueCount);
            uniqueVertices.push(x, y, z);
            uniqueCount++;
        }
    }

    // New Buffers
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

    console.log(`[weldMesh] Welded ${vertexCount} -> ${uniqueCount} vertices.`);

    return {
        vertices: newVertices,
        indices: new Uint32Array(newIndices)
    };
}

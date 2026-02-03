
// Paste weldMesh logic directly to avoid module resolution issues
function weldMesh(vertices, indices, epsilon = 1e-4) {
    const vertexCount = vertices.length / 3;
    if (vertexCount === 0) return { vertices: new Float32Array(0), indices: new Uint32Array(0) };

    const precision = Math.round(1 / epsilon);
    const data = new Int32Array(vertexCount * 4);
    const sortIndices = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
        data[i * 4] = Math.round(vertices[i * 3] * precision);
        data[i * 4 + 1] = Math.round(vertices[i * 3 + 1] * precision);
        data[i * 4 + 2] = Math.round(vertices[i * 3 + 2] * precision);
        data[i * 4 + 3] = i;
        sortIndices[i] = i;
    }

    sortIndices.sort((a, b) => {
        const ax = data[a * 4];
        const bx = data[b * 4];
        if (ax !== bx) return ax - bx;
        const ay = data[a * 4 + 1];
        const by = data[b * 4 + 1];
        if (ay !== by) return ay - by;
        return data[a * 4 + 2] - data[b * 4 + 2];
    });

    const remapping = new Int32Array(vertexCount).fill(-1);
    const uniqueVertices = [];
    let uniqueCount = 0;

    for (let i = 0; i < vertexCount; i++) {
        const idx = sortIndices[i];
        if (remapping[idx] !== -1) continue;

        remapping[idx] = uniqueCount;
        uniqueVertices.push(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
        const x = data[idx * 4];
        const y = data[idx * 4 + 1];
        const z = data[idx * 4 + 2];

        for (let j = i + 1; j < vertexCount; j++) {
            const nextIdx = sortIndices[j];
            const nx = data[nextIdx * 4];
            if (nx !== x) break;
            const ny = data[nextIdx * 4 + 1];
            if (ny !== y) continue;
            const nz = data[nextIdx * 4 + 2];
            if (nz !== z) continue;
            remapping[nextIdx] = uniqueCount;
        }
        uniqueCount++;
    }

    const newVertices = new Float32Array(uniqueVertices);
    const newIndices = [];
    for (let i = 0; i < indices.length; i += 3) {
        const a = remapping[indices[i]];
        const b = remapping[indices[i + 1]];
        const c = remapping[indices[i + 2]];

        // DEGENERATE FILTER
        if (a !== b && b !== c && c !== a) {
            newIndices.push(a, b, c);
        }
    }
    return { vertices: newVertices, indices: new Uint32Array(newIndices) };
}

console.log("Debugging degenerate case...");

// T1: (0,0,0), (0,0,0), (0,0,0) -> Degenerate (All same)
// T2: (1,1,1), (2,2,2), (3,3,3) -> Valid
const vertices = new Float32Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    1, 1, 1, 2, 2, 2, 3, 3, 3
]);
const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);

const welded = weldMesh(vertices, indices);

console.log("Original Vertices:", vertices.length / 3);
console.log("Welded Vertices:", welded.vertices.length / 3);
console.log("Welded Indices Length:", welded.indices.length);
console.log("Welded Indices:", welded.indices);

// Expect T1 to be removed.
// T1 has vertices 0,1,2. All (0,0,0). Remapped to 0,0,0.
// T2 has vertices 3,4,5. Remapped to 1,2,3.
// Result indices should be [1,2,3].
// Result vertices: (0,0,0) (used by T1 but T1 is skipped), (1,1,1), (2,2,2), (3,3,3).
// Wait, if T1 is skipped, do we keep (0,0,0) in vertex list?
// Yes, the vertex list includes ALL unique vertices found, even if no triangle uses them (orphan vertices).
// weldMesh does NOT currently prune unused vertices after welding.

if (welded.indices.length === 3) {
    console.log("PASS: Degenerate triangle removed.");
} else {
    console.error("FAIL: Expected 3 indices, got", welded.indices.length);
}

// In the test expectation:
// expect(welded.vertices.length / 3).toBe(4);
// expect(welded.indices[0]).toBe(welded.indices[1]); 
// Wait, the test expects T1 indices to point to same vertex?
// If T1 is degenerate, it should be REMOVED from indices array?
// Line 209: expect(welded.indices[0]).toBe(welded.indices[1]);
// THIS IS THE BUG. The test EXPECTS the degenerate triangle to exist but have identical indices?
// But my implementation REMOVES it.

console.log("Checking test assumptions...");
// The test says: "should handle degenerate triangles gracefully"
// And expects:
// expect(welded.vertices.length / 3).toBe(4); // Correct (4 unique verts)
// expect(welded.indices[0]).toBe(welded.indices[1]);
// This implies the test expects indices array to still contain the degenerate triangle!

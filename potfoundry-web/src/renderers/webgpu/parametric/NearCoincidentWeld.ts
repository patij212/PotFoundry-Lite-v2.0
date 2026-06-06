/**
 * NearCoincidentWeld — final export cleanup that merges vertices whose 3D positions
 * are within a weld tolerance, then strips the triangles that collapse to degenerate
 * (zero-area) as a result.
 *
 * WHY: the fidelity validator and topology metric judge the mesh on the POSITION-WELDED
 * canonical vertex set (quantize at WELD_TOL_MM = 1e-4mm). But the exported parametric
 * mesh keeps raw vertices — including near-coincident interior vertices that the
 * tessellation / chain re-snap can cluster sub-tolerance apart. Those raw pairs form
 * NEEDLE triangles (one ~1e-5mm short edge + mm-long edges → aspect 1e5–1e6) that the
 * sliver metric counts even though the welded topology treats the pair as one point.
 * Welding the export at the SAME quantization the metric uses makes the raw exported
 * geometry match the validated topology: the needles collapse to degenerate and are
 * stripped, with no new boundary opened (a zero-area needle bounds no surface) and —
 * because the validator already welds at this tolerance and reports it manifold — no
 * new non-manifold edge that the validator did not already account for.
 *
 * Pure: operates only on the index buffer (vertices are referenced through a remap; the
 * position buffer is left intact, unused vertices simply become unreferenced).
 */

export interface NearCoincidentWeldResult {
    /** Rewritten index buffer (degenerate triangles removed). */
    indices: Uint32Array;
    /** Number of raw vertices remapped onto an earlier canonical vertex. */
    weldedVertices: number;
    /** Number of triangles dropped because they collapsed to degenerate. */
    strippedTriangles: number;
    /**
     * New length of the outer-wall index prefix after stripping. Only meaningful
     * when `outerIdxCount` was passed; otherwise equals the result index length.
     */
    outerIdxCount: number;
}

/**
 * Weld vertices by position quantization at `toleranceMm` (matching the metric's
 * `buildWeldRemap`: `Math.round(pos / tol)`), remap the index buffer onto the canonical
 * representatives, and drop triangles that become degenerate (two indices equal).
 *
 * @param indices      Flat triangle index buffer.
 * @param positions    Flat xyz vertex positions.
 * @param toleranceMm  Weld quantization cell size in mm (e.g. 1e-4).
 */
export function weldNearCoincidentVertices(
    indices: Uint32Array,
    positions: Float32Array,
    toleranceMm: number,
    outerIdxCount: number = indices.length,
): NearCoincidentWeldResult {
    if (toleranceMm <= 0) {
        return { indices, weldedVertices: 0, strippedTriangles: 0, outerIdxCount };
    }
    const numV = (positions.length / 3) | 0;
    const inv = 1 / toleranceMm;
    const cellToCanon = new Map<string, number>();
    const remap = new Uint32Array(numV);
    let weldedVertices = 0;
    for (let v = 0; v < numV; v++) {
        const key =
            `${Math.round(positions[v * 3] * inv)}:` +
            `${Math.round(positions[v * 3 + 1] * inv)}:` +
            `${Math.round(positions[v * 3 + 2] * inv)}`;
        const existing = cellToCanon.get(key);
        if (existing === undefined) {
            cellToCanon.set(key, v);
            remap[v] = v;
        } else {
            remap[v] = existing;
            weldedVertices++;
        }
    }

    if (weldedVertices === 0) {
        return { indices, weldedVertices: 0, strippedTriangles: 0, outerIdxCount };
    }

    const out = new Uint32Array(indices.length);
    let w = 0;
    let strippedTriangles = 0;
    let newOuterIdxCount = outerIdxCount;
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const a = remap[indices[t]];
        const b = remap[indices[t + 1]];
        const c = remap[indices[t + 2]];
        if (a === b || b === c || a === c) {
            strippedTriangles++;
            if (t < outerIdxCount) newOuterIdxCount -= 3; // keep the outer prefix accurate
            continue;
        }
        out[w++] = a;
        out[w++] = b;
        out[w++] = c;
    }

    return { indices: out.subarray(0, w), weldedVertices, strippedTriangles, outerIdxCount: newOuterIdxCount };
}

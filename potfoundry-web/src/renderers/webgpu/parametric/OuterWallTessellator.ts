/**
 * parametric/OuterWallTessellator.ts — Chain-constrained outer wall mesh generation.
 *
 * Builds the outer wall triangulation with feature chain points as first-class
 * vertices. Implements v20.0 per-row UV snapping for exact ridge positioning
 * and constraint-aware strip triangulation for chain edge enforcement.
 *
 * Extracted from ParametricExportComputer.ts for modularity and testability.
 *
 * @module OuterWallTessellator
 */

import type { FeatureChain } from './types';
import { bsearchFloor } from './GridBuilder';

// ============================================================================
// Types
// ============================================================================

/**
 * A chain point remapped to UV space with a unique vertex index.
 * Used during outer wall tessellation to track chain vertices
 * that are inserted into the grid mesh.
 */
export interface ChainVertex {
    /** U position in [0, 1) */
    u: number;
    /** Final row index in the T grid */
    rowIdx: number;
    /** Global vertex index in the combined vertex buffer */
    vertexIdx: number;
    /** Index of the chain this vertex belongs to */
    chainId: number;
    /** Index within the chain (-1 for interpolated points) */
    pointIdx: number;
}

/**
 * A vertex in a merged row strip, combining grid and chain vertices.
 */
export interface StripVertex {
    /** Global vertex index */
    idx: number;
    /** U position */
    u: number;
    /** Whether this is a chain vertex (vs grid vertex) */
    isChain: boolean;
    /** Grid column this vertex belongs to or is nearest to */
    gridCol: number;
}

/**
 * Return type for buildCDTOuterWall.
 */
export interface OuterWallResult {
    /** Interleaved vertex buffer (u, t, surfaceId) × N */
    vertices: Float32Array;
    /** Triangle index buffer */
    indices: Uint32Array;
    /** Per-quad map: index into indices buffer, or -1 for chain/seam cells */
    quadMap: Int32Array;
    /** Number of grid vertices (before chain vertices) */
    gridVertexCount: number;
    /** Chain edge pairs (vertex index tuples) */
    chainEdges: Array<[number, number]>;
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Seam threshold: skip chain edges crossing more than this U-delta */
const SEAM_THRESHOLD = 0.4;

/** Seam guard: skip grid cells wider than this */
const SEAM_GUARD = 0.3;

/**
 * Sweep a sub-region of the strip from (botStart..botEnd) × (topStart..topEnd).
 * Standard alternating-advance: at each step, advance whichever pointer
 * has the smaller next-U, creating one triangle per step.
 */
function sweepRegion(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    botStart: number, botEnd: number,
    topStart: number, topEnd: number
): void {
    let bi = botStart, ti = topStart;
    while (bi < botEnd || ti < topEnd) {
        if (bi >= botEnd) {
            buf.push(bot[bi].idx, top[ti + 1].idx, top[ti].idx);
            ti++;
        } else if (ti >= topEnd) {
            buf.push(bot[bi].idx, bot[bi + 1].idx, top[ti].idx);
            bi++;
        } else {
            const nextBotU = bot[bi + 1].u;
            const nextTopU = top[ti + 1].u;
            if (nextBotU <= nextTopU) {
                buf.push(bot[bi].idx, bot[bi + 1].idx, top[ti].idx);
                bi++;
            } else {
                buf.push(bot[bi].idx, top[ti + 1].idx, top[ti].idx);
                ti++;
            }
        }
    }
}

/**
 * Simple strip sweep (no constraints). Equivalent to standard algorithm.
 */
function simpleSweep(buf: number[], bot: StripVertex[], top: StripVertex[]): void {
    sweepRegion(buf, bot, top, 0, bot.length - 1, 0, top.length - 1);
}

/**
 * Triangulate a strip between two rows with mandatory constraint edges.
 *
 * Strategy: Process the strip left-to-right. At each step, we have a
 * "current front" of bottom and top pointers. When we reach a constraint
 * edge's position, we fan-triangulate from both endpoints to close the
 * region before the constraint, then emit the constraint edge and continue.
 *
 * For strips WITHOUT constraints, this is equivalent to the standard
 * alternating-advance sweep.
 */
function constraintAwareTriangulate(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    chainVerts: ChainVertex[],
    gridVCount: number
): void {
    if (bot.length < 2 && top.length < 2) return;

    if (constraints.length === 0) {
        simpleSweep(buf, bot, top);
        return;
    }

    const vtxBotPos = new Map<number, number>();
    const vtxTopPos = new Map<number, number>();
    for (let i = 0; i < bot.length; i++) vtxBotPos.set(bot[i].idx, i);
    for (let i = 0; i < top.length; i++) vtxTopPos.set(top[i].idx, i);

    interface ClassifiedConstraint {
        botIdx: number;
        topIdx: number;
        botPos: number;
        topPos: number;
        midU: number;
    }

    const classified: ClassifiedConstraint[] = [];
    for (const [v0, v1] of constraints) {
        const cv0 = chainVerts[v0 - gridVCount];
        const cv1 = chainVerts[v1 - gridVCount];
        if (!cv0 || !cv1) continue;

        let bIdx: number, tIdx: number;
        const bp0 = vtxBotPos.get(v0);
        const tp0 = vtxTopPos.get(v0);
        const bp1 = vtxBotPos.get(v1);
        const tp1 = vtxTopPos.get(v1);

        if (bp0 !== undefined && tp1 !== undefined) {
            bIdx = v0; tIdx = v1;
        } else if (bp1 !== undefined && tp0 !== undefined) {
            bIdx = v1; tIdx = v0;
        } else {
            continue;
        }

        const bPos = vtxBotPos.get(bIdx);
        const tPos = vtxTopPos.get(tIdx);
        if (bPos === undefined || tPos === undefined) continue;

        classified.push({
            botIdx: bIdx,
            topIdx: tIdx,
            botPos: bPos,
            topPos: tPos,
            midU: (bot[bPos].u + top[tPos].u) / 2
        });
    }

    classified.sort((a, b) => a.midU - b.midU);

    let curBot = 0;
    let curTop = 0;

    for (const con of classified) {
        const targetBot = con.botPos;
        const targetTop = con.topPos;

        const sweepBotEnd = Math.max(targetBot, curBot);
        const sweepTopEnd = Math.max(targetTop, curTop);

        if (sweepBotEnd > curBot || sweepTopEnd > curTop) {
            sweepRegion(buf, bot, top, curBot, sweepBotEnd, curTop, sweepTopEnd);
        }

        if (targetBot < curBot || targetTop < curTop) {
            if (targetBot < curBot && targetTop >= curTop) {
                const anchorTop = targetTop > 0 ? targetTop - 1 : targetTop + 1;
                if (anchorTop >= 0 && anchorTop < top.length && anchorTop !== targetTop) {
                    buf.push(bot[targetBot].idx, top[targetTop].idx, top[anchorTop].idx);
                }
            } else if (targetTop < curTop && targetBot >= curBot) {
                const anchorBot = targetBot > 0 ? targetBot - 1 : targetBot + 1;
                if (anchorBot >= 0 && anchorBot < bot.length && anchorBot !== targetBot) {
                    buf.push(bot[targetBot].idx, bot[anchorBot].idx, top[targetTop].idx);
                }
            }
        }

        curBot = Math.max(curBot, targetBot);
        curTop = Math.max(curTop, targetTop);
    }

    if (curBot < bot.length - 1 || curTop < top.length - 1) {
        sweepRegion(buf, bot, top, curBot, bot.length - 1, curTop, top.length - 1);
    }
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Build the outer wall mesh with chain points as first-class vertices.
 *
 * v16.13 CHAIN-CONSTRAINED TESSELLATION:
 * Instead of generating a grid and patching the nearest column, this approach:
 *   1. Generates the base grid vertices (numU × numT)
 *   2. INSERTS chain points as additional vertices (appended after grid)
 *   3. For grid cells containing chain points, splits the cell into fan
 *      triangles around the chain vertex — the chain point IS a mesh vertex
 *   4. Chain edges (consecutive chain points) are enforced as mesh edges
 *      by triangulating chain-occupied cells to connect the chain vertices
 *   5. Grid cells without chain points are triangulated normally (2 tris)
 *
 * This ensures every chain point is an actual mesh vertex and consecutive
 * chain points are connected by mesh edges — the chain IS the tessellation
 * constraint, not a post-hoc patch.
 *
 * The grid stays at numU × numT (no extra columns/rows). Chain points are
 * extra vertices beyond the grid, inserted into the cells they occupy.
 *
 * @param chains          Feature chains from Phase 2.5 (linked per-row peaks)
 * @param rowMapping      Mapping from final rows to original rows
 * @param tPositions      T positions for all rows (original + inserted)
 * @param unionU          Union grid U positions (base grid)
 * @param _targetOuterTris Target triangle count for the outer wall (reserved)
 * @param surfaceId       Surface ID (0 for outer wall)
 * @returns OuterWallResult with vertices, indices, quadMap, gridVertexCount, chainEdges
 */
export function buildCDTOuterWall(
    chains: FeatureChain[],
    rowMapping: number[],
    tPositions: Float32Array,
    unionU: Float32Array,
    _targetOuterTris: number,
    surfaceId: number = 0
): OuterWallResult {
    const buildStart = performance.now();

    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    const numT = tPositions.length;
    const numU = unionU.length;
    const gridVertexCount = numU * numT;

    // ── 1. Collect chain points remapped to UV space with vertex indices ──

    // Each chain point gets a unique vertex index (appended after grid)
    const chainVertices: ChainVertex[] = [];
    const cellsPerRow = numU - 1;

    // Chain edge segments: pairs of consecutive chain vertex indices.
    // After interpolation, every edge spans exactly 1 row band.
    const chainEdges: Array<[number, number]> = [];

    let nextVertexIdx = gridVertexCount;

    // v16.14: For chain edges spanning multiple rows (chain skips a row where
    // no feature was detected), interpolate intermediate chain vertices so
    // that every chain edge spans exactly one row band.
    let interpolatedCount = 0;

    for (let cIdx = 0; cIdx < chains.length; cIdx++) {
        const chain = chains[cIdx];
        if (chain.points.length < 2) continue;

        // First pass: remap chain points to final row indices
        const rawRemapped: ChainVertex[] = [];
        for (let pIdx = 0; pIdx < chain.points.length; pIdx++) {
            const pt = chain.points[pIdx];
            const fr = origToFinal.get(pt.row);
            if (fr === undefined || fr < 0 || fr >= numT) continue;

            const u = Math.max(0, Math.min(1 - 1e-7, pt.u));

            const cv: ChainVertex = {
                u,
                rowIdx: fr,
                vertexIdx: nextVertexIdx++,
                chainId: cIdx,
                pointIdx: pIdx
            };
            chainVertices.push(cv);
            rawRemapped.push(cv);
        }

        // Second pass: for each consecutive pair, if they span >1 row,
        // insert interpolated chain vertices at intermediate rows.
        const fullChain: ChainVertex[] = [];
        for (let k = 0; k < rawRemapped.length; k++) {
            fullChain.push(rawRemapped[k]);

            if (k < rawRemapped.length - 1) {
                const p0 = rawRemapped[k];
                const p1 = rawRemapped[k + 1];

                // Skip seam-crossing edges
                let du = p1.u - p0.u;
                if (du > 0.5) du -= 1;
                if (du < -0.5) du += 1;
                if (Math.abs(du) > SEAM_THRESHOLD) continue;

                const rowGap = p1.rowIdx - p0.rowIdx;
                if (rowGap <= 1 && rowGap >= -1) {
                    continue; // edge recorded in the next loop
                }

                // Multi-row gap: interpolate intermediate vertices
                const dir = rowGap > 0 ? 1 : -1;
                const steps = Math.abs(rowGap);
                for (let s = 1; s < steps; s++) {
                    const frac = s / steps;
                    let interpU = p0.u + du * frac;
                    interpU = Math.max(0, Math.min(1 - 1e-7, ((interpU % 1) + 1) % 1));
                    const interpRow = p0.rowIdx + dir * s;

                    if (interpRow < 0 || interpRow >= numT) continue;

                    const interpCV: ChainVertex = {
                        u: interpU,
                        rowIdx: interpRow,
                        vertexIdx: nextVertexIdx++,
                        chainId: cIdx,
                        pointIdx: -1
                    };
                    chainVertices.push(interpCV);
                    fullChain.push(interpCV);
                    interpolatedCount++;
                }
            }
        }

        // Record chain edges between consecutive fullChain entries (single-row steps)
        for (let k = 1; k < fullChain.length; k++) {
            const p0 = fullChain[k - 1];
            const p1 = fullChain[k];
            let du = Math.abs(p1.u - p0.u);
            if (du > SEAM_THRESHOLD) continue;
            const rowGap = Math.abs(p1.rowIdx - p0.rowIdx);
            if (rowGap !== 1) continue;
            chainEdges.push([p0.vertexIdx, p1.vertexIdx]);
        }
    }

    // v20.0: Per-row UV snapping — exact feature positions without chain-strip topology.
    //
    // Instead of appending extra chain vertices (which create bridge triangles
    // with poor dihedral), we SNAP the nearest existing grid vertex in each row to the
    // chain's exact U position. The GPU evaluates the snapped vertex at that U → it lands
    // exactly on the mathematical ridge surface. No extra vertices → no chain-strip
    // designation → standard quad triangulation → smooth surface + exact feature positions.
    //
    // chainDirectedFlip still orients diagonals using chain UV data (unchanged).
    // All chain-strip downstream passes are no-ops (chainVertices cleared below).
    const chainDataForSnap = chainVertices.slice(); // save before clearing
    chainVertices.length = 0;
    chainEdges.length = 0;

    // ── 2. Generate vertices: grid (v20.0 — chain UVs snapped in-place) ──
    const totalVertexCount = gridVertexCount;
    const vertices = new Float32Array(totalVertexCount * 3);

    // Grid vertices
    let vIdx = 0;
    for (let j = 0; j < numT; j++) {
        for (let i = 0; i < numU; i++) {
            vertices[vIdx++] = unionU[i];
            vertices[vIdx++] = tPositions[j];
            vertices[vIdx++] = surfaceId;
        }
    }

    // Per-row UV snapping: move the nearest grid column vertex in each row to the
    // chain's exact U position. Binary-search for efficiency (unionU is sorted).
    let snappedVertexCount = 0;
    for (const cv of chainDataForSnap) {
        let lo = 0, hi = numU - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (unionU[mid] < cv.u) lo = mid + 1; else hi = mid;
        }
        let bestCol = lo;
        if (lo > 0 && Math.abs(unionU[lo - 1] - cv.u) < Math.abs(unionU[lo] - cv.u)) {
            bestCol = lo - 1;
        }
        vertices[(cv.rowIdx * numU + bestCol) * 3 + 0] = cv.u;
        snappedVertexCount++;
    }

    // ── 3. Build per-row chain vertex lookup (sorted by U) ──
    const rowChainVerts = new Map<number, ChainVertex[]>();
    for (const cv of chainVertices) {
        let list = rowChainVerts.get(cv.rowIdx);
        if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
        list.push(cv);
    }
    for (const [, list] of rowChainVerts) {
        list.sort((a, b) => a.u - b.u);
    }

    // ── 4. Full-row strip triangulation ──
    const totalCells = cellsPerRow * (numT - 1);
    const indexBuf: number[] = [];

    const quadMap = new Int32Array(totalCells);
    quadMap.fill(-1);
    let seamSkipCount = 0;
    let chainCellCount = 0;
    let crossCellEdgeCount = 0;

    // Pre-build row-indexed chain edge lookup
    const rowBandEdges = new Map<number, Array<[number, number]>>();
    for (const [v0, v1] of chainEdges) {
        const cv0 = chainVertices[v0 - gridVertexCount];
        const cv1 = chainVertices[v1 - gridVertexCount];
        if (!cv0 || !cv1) continue;
        const r0 = Math.min(cv0.rowIdx, cv1.rowIdx);
        const r1 = Math.max(cv0.rowIdx, cv1.rowIdx);
        if (r1 - r0 !== 1) continue;
        let list = rowBandEdges.get(r0);
        if (!list) { list = []; rowBandEdges.set(r0, list); }
        list.push([v0, v1]);
    }

    // Build merged row: grid columns interleaved with chain points.
    const buildMergedRow = (row: number): StripVertex[] => {
        const result: StripVertex[] = [];
        const chainList = rowChainVerts.get(row) || [];
        let ci = 0;

        for (let i = 0; i < numU; i++) {
            while (ci < chainList.length && chainList[ci].u < unionU[i] - 1e-9) {
                const col = i > 0 ? i - 1 : 0;
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: col });
                ci++;
            }

            if (ci < chainList.length && Math.abs(chainList[ci].u - unionU[i]) <= 1e-6) {
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: i });
                ci++;
            } else {
                const actualU = vertices[(row * numU + i) * 3 + 0];
                result.push({ idx: row * numU + i, u: actualU, isChain: false, gridCol: i });
            }

            const uNext = (i < numU - 1) ? unionU[i + 1] : 1.0 + 1e-6;
            while (ci < chainList.length && chainList[ci].u < uNext - 1e-9) {
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: i });
                ci++;
            }
        }
        while (ci < chainList.length) {
            result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: numU - 1 });
            ci++;
        }

        return result;
    };

    const colHasChain = new Uint8Array(cellsPerRow);

    for (let j = 0; j < numT - 1; j++) {
        const botRow = buildMergedRow(j);
        const topRow = buildMergedRow(j + 1);

        const bandEdges = rowBandEdges.get(j);
        const bandConstraintEdges: Array<[number, number]> = [];

        colHasChain.fill(0);

        if (bandEdges) {
            for (const [v0, v1] of bandEdges) {
                const cv0 = chainVertices[v0 - gridVertexCount];
                const cv1 = chainVertices[v1 - gridVertexCount];
                if (!cv0 || !cv1) continue;

                bandConstraintEdges.push([v0, v1]);

                const col0raw = bsearchFloor(unionU, cv0.u);
                const col1raw = bsearchFloor(unionU, cv1.u);
                const col0 = col0raw < 0 ? 0 : (col0raw >= cellsPerRow ? cellsPerRow - 1 : col0raw);
                const col1 = col1raw < 0 ? 0 : (col1raw >= cellsPerRow ? cellsPerRow - 1 : col1raw);
                const cMin = Math.min(col0, col1);
                const cMax = Math.max(col0, col1);
                for (let c = cMin; c <= cMax; c++) {
                    colHasChain[c] = 1;
                }
            }
        }

        for (const sv of botRow) {
            if (sv.isChain) {
                const col = bsearchFloor(unionU, sv.u);
                const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
                colHasChain[gc] = 1;
            }
        }
        for (const sv of topRow) {
            if (sv.isChain) {
                const col = bsearchFloor(unionU, sv.u);
                const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
                colHasChain[gc] = 1;
            }
        }

        let i = 0;
        while (i < cellsPerRow) {
            const quadIdx = j * cellsPerRow + i;
            const uLeft = unionU[i];
            const uRight = unionU[i + 1];
            const uSpan = uRight - uLeft;

            if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
                indexBuf.push(0, 0, 0, 0, 0, 0);
                quadMap[quadIdx] = -1;
                seamSkipCount++;
                i++;
                continue;
            }

            if (!colHasChain[i]) {
                // Standard cell: 2 triangles (default diagonal)
                const bl = j * numU + i;
                const br = j * numU + (i + 1);
                const tl = (j + 1) * numU + i;
                const tr = (j + 1) * numU + (i + 1);

                const triBase = indexBuf.length;
                indexBuf.push(bl, br, tr);
                indexBuf.push(bl, tr, tl);
                quadMap[quadIdx] = triBase;
                i++;
            } else {
                // Chain segment: contiguous run of chain-involved columns
                const segStart = i;
                while (i < cellsPerRow && colHasChain[i]) {
                    chainCellCount++;
                    quadMap[j * cellsPerRow + i] = -1;
                    i++;
                }
                const segEnd = i;

                const uStripLeft = unionU[segStart];
                const uStripRight = unionU[segEnd];

                const stripBot: StripVertex[] = [];
                const stripTop: StripVertex[] = [];

                for (let bi = 0; bi < botRow.length; bi++) {
                    const sv = botRow[bi];
                    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
                        stripBot.push(sv);
                    }
                }
                const botLeftIdx = j * numU + segStart;
                const botRightIdx = j * numU + segEnd;
                if (stripBot.length === 0 || stripBot[0].idx !== botLeftIdx) {
                    stripBot.unshift({ idx: botLeftIdx, u: uStripLeft, isChain: false, gridCol: segStart });
                }
                if (stripBot[stripBot.length - 1].idx !== botRightIdx) {
                    stripBot.push({ idx: botRightIdx, u: uStripRight, isChain: false, gridCol: segEnd });
                }

                for (let ti = 0; ti < topRow.length; ti++) {
                    const sv = topRow[ti];
                    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
                        stripTop.push(sv);
                    }
                }
                const topLeftIdx = (j + 1) * numU + segStart;
                const topRightIdx = (j + 1) * numU + segEnd;
                if (stripTop.length === 0 || stripTop[0].idx !== topLeftIdx) {
                    stripTop.unshift({ idx: topLeftIdx, u: uStripLeft, isChain: false, gridCol: segStart });
                }
                if (stripTop[stripTop.length - 1].idx !== topRightIdx) {
                    stripTop.push({ idx: topRightIdx, u: uStripRight, isChain: false, gridCol: segEnd });
                }

                const segConstraints: Array<[number, number]> = [];
                for (const [v0, v1] of bandConstraintEdges) {
                    const cv0 = chainVertices[v0 - gridVertexCount];
                    const cv1 = chainVertices[v1 - gridVertexCount];
                    if (!cv0 || !cv1) continue;
                    const uMin = Math.min(cv0.u, cv1.u);
                    const uMax = Math.max(cv0.u, cv1.u);
                    if (uMax >= uStripLeft - 1e-9 && uMin <= uStripRight + 1e-9) {
                        segConstraints.push([v0, v1]);
                    }
                }

                constraintAwareTriangulate(indexBuf, stripBot, stripTop, segConstraints, chainVertices, gridVertexCount);
            }
        }
    }

    // Count cross-cell chain edges
    for (const [v0, v1] of chainEdges) {
        const cv0 = chainVertices[v0 - gridVertexCount];
        const cv1 = chainVertices[v1 - gridVertexCount];
        if (cv0 && cv1) {
            const col0 = bsearchFloor(unionU, cv0.u);
            const col1 = bsearchFloor(unionU, cv1.u);
            if (col0 !== col1) crossCellEdgeCount++;
        }
    }

    const indices = new Uint32Array(indexBuf);

    // ── Verify chain edges are actual mesh edges ──
    const meshEdgeSet = new Set<string>();
    for (let t = 0; t < indexBuf.length; t += 3) {
        const a = indexBuf[t], b = indexBuf[t + 1], c = indexBuf[t + 2];
        meshEdgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`);
        meshEdgeSet.add(b < c ? `${b}-${c}` : `${c}-${b}`);
        meshEdgeSet.add(a < c ? `${a}-${c}` : `${c}-${a}`);
    }
    let enforced = 0, missing = 0;
    const missingExamples: string[] = [];
    for (const [v0, v1] of chainEdges) {
        const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
        if (meshEdgeSet.has(key)) {
            enforced++;
        } else {
            missing++;
            if (missingExamples.length < 10) {
                const cv0 = chainVertices[v0 - gridVertexCount];
                const cv1 = chainVertices[v1 - gridVertexCount];
                if (cv0 && cv1) {
                    const col0 = bsearchFloor(unionU, cv0.u);
                    const col1 = bsearchFloor(unionU, cv1.u);
                    missingExamples.push(
                        `  chain${cv0.chainId} pt${cv0.pointIdx}\u2192pt${cv1.pointIdx}: ` +
                        `row${cv0.rowIdx}\u2192${cv1.rowIdx} col${col0}\u2192${col1} ` +
                        `u=${cv0.u.toFixed(6)}\u2192${cv1.u.toFixed(6)} ` +
                        `vidx=${v0}\u2192${v1}`
                    );
                }
            }
        }
    }
    if (missingExamples.length > 0) {
        console.log(`[ParametricExport]   v16.19 Missing edge examples:`);
        for (const ex of missingExamples) console.log(`[ParametricExport]     ${ex}`);
    }

    const buildMs = performance.now() - buildStart;
    const triCount = indices.length / 3;
    const realTriCount = triCount - seamSkipCount * 2;
    console.log(`[ParametricExport]   v20.0 Per-row UV snapping: ${totalVertexCount} verts (${numU}\u00d7${numT} grid, ${snappedVertexCount} snapped to chain positions), ${realTriCount} real tris`);
    console.log(`[ParametricExport]   v20.0 Grid: ${numU}\u00d7${numT}, seam skips: ${seamSkipCount}, build time: ${buildMs.toFixed(1)}ms`);

    return { vertices, indices, quadMap, gridVertexCount, chainEdges };
}

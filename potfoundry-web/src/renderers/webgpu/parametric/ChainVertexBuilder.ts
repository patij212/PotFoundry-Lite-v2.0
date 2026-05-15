/**
 * parametric/ChainVertexBuilder.ts — Chain vertex collection, interpolation, and edge recording.
 *
 * Extracted from OuterWallTessellator.ts (R52) for modularity.
 * This module is the **single source of truth** for creating chain vertices
 * from FeatureChain data and mapping them into the UV grid.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ 🔒 R52 PRECISION GUARANTEE                                            ║
 * ║                                                                        ║
 * ║ Chain vertices represent sub-sample-precision feature positions from   ║
 * ║ the detection pipeline (parabolic refinement, ±0.00006 U accuracy).    ║
 * ║ They must NEVER be merged, averaged, snapped, or moved toward grid     ║
 * ║ positions. Any merging destroys the precision that makes PotFoundry's  ║
 * ║ feature edges "absolutely perfect."                                    ║
 * ║                                                                        ║
 * ║ The vertices produced here flow unchanged into the mesh. Extra         ║
 * ║ triangulation from near-coincident chain/grid vertices is acceptable.  ║
 * ║ Precision is absolute: no averaging, no estimation, no "close enough." ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * @module ChainVertexBuilder
 */

import type { FeatureChain } from './types';
import type { ChainVertex } from './OuterWallTessellator';
import { splitChainsAtSeam, splitChainsAtSteepDelta } from './ChainLinker';

// ============================================================================
// Constants
// ============================================================================

/**
 * Seam threshold: skip chain edges crossing more than this U-delta.
 * Edges with |Δu| > 0.4 are seam-spanning and excluded from the constraint set.
 * Shared with OuterWallTessellator for cellChainMap construction.
 */
export const SEAM_THRESHOLD = 0.4;

// ============================================================================
// Result type
// ============================================================================

/**
 * Result of chain vertex collection and edge recording.
 *
 * All vertex indices in `chainVertices` and `chainEdges` are globally unique,
 * starting at `gridVertexCount` and incrementing sequentially. These indices
 * are used directly in the combined vertex buffer (grid + chain + phantom).
 */
export interface ChainBuildResult {
    /** All chain vertices (original detections + interpolated gap-fills). */
    chainVertices: ChainVertex[];
    /** Chain edge pairs — each spans exactly 1 row band after interpolation. */
    chainEdges: Array<[number, number]>;
    /** Count of interpolated vertices inserted for multi-row gaps. */
    interpolatedCount: number;
    /** Map: interpolated vertex index → gap size (row steps in original gap). */
    interpolatedGapSizes: Map<number, number>;
    /** Next available vertex index after all chain vertices. */
    nextVertexIdx: number;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Collect chain vertices from FeatureChain data, remap to UV space,
 * interpolate multi-row gaps, and record chain edge segments.
 *
 * Each chain point is assigned a unique vertex index starting at `gridVertexCount`.
 * Multi-row gaps (where detection skipped a row) are filled with linearly
 * interpolated vertices so every chain edge spans exactly one row band.
 *
 * 🔒 R52: The U-positions of chain vertices are the EXACT values from the
 * detection pipeline. They are clamped to [0, 1-ε) for numerical safety but
 * are never snapped, merged, or averaged with grid positions.
 *
 * @param chains         Feature chains from the linking pipeline
 * @param origToFinal    Map from original probe row → final grid row index
 * @param numT           Number of T-rows in the grid
 * @param gridVertexCount Total grid vertices (numU × numT)
 * @returns Chain vertices, edges, and metadata
 */
export function collectChainVertices(
    chains: ReadonlyArray<FeatureChain>,
    origToFinal: ReadonlyMap<number, number>,
    numT: number,
    gridVertexCount: number,
): ChainBuildResult {
    // Cluster-1 fix (defensive): split any seam-spanning chains so we never
    // place interpolated chain vertices straddling u=0/1 with no constraint
    // edge connecting them. See parametric.audit.test.ts Phase C cluster 1.
    // Production callers (linkFeatureChainsByKind, buildCDTOuterWall) already
    // pre-split; this is the third defense-in-depth layer.
    chains = splitChainsAtSeam(chains as FeatureChain[]);

    // Cluster-2 fix (defensive): split steep-spiral segments. numU is derived
    // from gridVertexCount / numT — the function's existing assumption is
    // gridVertexCount = numU × numT. See parametric.audit.test.ts Phase C
    // cluster 2.
    if (numT > 0) {
        const numU = Math.floor(gridVertexCount / numT);
        if (numU >= 2) {
            const maxDuPerRow = 2 / (numU - 1);
            chains = splitChainsAtSteepDelta(chains as FeatureChain[], maxDuPerRow);
        }
    }

    const chainVertices: ChainVertex[] = [];
    const chainEdges: Array<[number, number]> = [];
    let nextVertexIdx = gridVertexCount;
    let interpolatedCount = 0;
    const interpolatedGapSizes = new Map<number, number>();

    for (let cIdx = 0; cIdx < chains.length; cIdx++) {
        const chain = chains[cIdx];
        if (chain.points.length < 2) continue;

        // First pass: remap chain points to final row indices
        const rawRemapped: ChainVertex[] = [];
        for (let pIdx = 0; pIdx < chain.points.length; pIdx++) {
            const pt = chain.points[pIdx];
            const fr = origToFinal.get(pt.row);
            if (fr === undefined || fr < 0 || fr >= numT) continue;

            // 🔒 R52: Clamp to [0, 1-ε) for numerical safety only — NOT snapping
            const u = Math.max(0, Math.min(1 - 1e-7, pt.u));

            const cv: ChainVertex = {
                u,
                rowIdx: fr,
                vertexIdx: nextVertexIdx++,
                chainId: cIdx,
                pointIdx: pIdx,
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

                // Wrap-correct for physical distance — interpolated vertices
                // must be placed on the correct side of the seam.
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
                        pointIdx: -1,
                    };
                    chainVertices.push(interpCV);
                    fullChain.push(interpCV);
                    interpolatedGapSizes.set(interpCV.vertexIdx, steps);
                    interpolatedCount++;
                }
            }
        }

        // v27.0: CatRom subdivision removed — piecewise-linear chain used directly.
        const finalChain = fullChain;

        // Record chain edges between consecutive finalChain entries.
        // Raw UV delta (no wrap-correction) — seam-spanning edges excluded.
        for (let k = 1; k < finalChain.length; k++) {
            const p0 = finalChain[k - 1];
            const p1 = finalChain[k];
            const du = Math.abs(p1.u - p0.u);
            if (du > SEAM_THRESHOLD) continue;
            const rowGap = Math.abs(p1.rowIdx - p0.rowIdx);
            const isSubdivEdge = p0.pointIdx < 0 || p1.pointIdx < 0;
            if (rowGap > 1) continue;
            if (rowGap === 0 && !isSubdivEdge) continue;
            chainEdges.push([p0.vertexIdx, p1.vertexIdx]);
        }
    }

    return {
        chainVertices,
        chainEdges,
        interpolatedCount,
        interpolatedGapSizes,
        nextVertexIdx,
    };
}

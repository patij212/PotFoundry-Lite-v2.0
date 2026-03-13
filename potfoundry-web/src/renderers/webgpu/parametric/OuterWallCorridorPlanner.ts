/**
 * Dry-run corridor planning for future chain-owned outer-wall transition zones.
 *
 * This module is intentionally read-only in C0/C1. It derives corridor candidates
 * and diagnostics from the existing legacy ownership maps without changing emitted
 * vertices, indices, or metadata semantics.
 *
 * @module OuterWallCorridorPlanner
 */

/** Planned shell rail on one side of a corridor candidate. */
export interface OuterWallCorridorShellRail {
    /** Which side of the corridor the shell rail represents. */
    readonly side: 'left' | 'right';
    /** Owning band in the host grid. */
    readonly band: number;
    /** Inclusive start row of the dry-run corridor slice. */
    readonly rowStart: number;
    /** Inclusive end row of the dry-run corridor slice. */
    readonly rowEnd: number;
    /** Boundary U on the host grid used for the dry-run shell. */
    readonly boundaryU: number;
}

/** Planned host-edge split decomposition for a corridor candidate. */
export interface OuterWallSeamCollarSplit {
    /** Host edge touched by the future corridor boundary. */
    readonly edge: 'bottom' | 'top';
    /** Owning band in the host grid. */
    readonly band: number;
    /** First covered cell column. */
    readonly colStart: number;
    /** Last covered cell column. */
    readonly colEnd: number;
    /** Ordered U split positions on the host edge. */
    readonly splitUs: readonly number[];
}

/** Metadata contract summary for future corridor-owned output. */
export interface OuterWallCorridorMetadataContract {
    /** `quadMap` behavior expected from future corridor emission. */
    readonly quadMap: 'preserve_legacy_until_emitter';
    /** `chainEdges` behavior expected from future corridor emission. */
    readonly chainEdges: 'preserve_legacy_until_emitter';
    /** `chainAdjacentVertices` behavior expected from future corridor emission. */
    readonly chainAdjacentVertices: 'preserve_legacy_until_emitter';
    /** `protectedStripVertices` behavior expected from future corridor emission. */
    readonly protectedStripVertices: 'preserve_legacy_until_emitter';
    /** `fanDiagonalEdges` behavior expected from future corridor emission. */
    readonly fanDiagonalEdges: 'preserve_legacy_until_emitter';
    /** `interpolatedChainVertices` behavior expected from future corridor emission. */
    readonly interpolatedChainVertices: 'preserve_legacy_until_emitter';
}

/** Reason a dry-run corridor candidate is not yet eligible for corridor ownership. */
export type OuterWallCorridorUnsupportedReason = 'multi_chain_overlap' | 'seam_span';

/**
 * Planner-authoritative linear ownership segment derived from one candidate.
 *
 * C4a keeps the emitter linear by asking the planner to decide whether a seam
 * candidate can still be emitted as a single corridor-owned span.
 */
export interface OuterWallCorridorOwnershipSegment {
    /** Stable segment identifier for diagnostics and ownership lookup. */
    readonly id: string;
    /** Owning band. */
    readonly band: number;
    /** Inclusive start row. */
    readonly rowStart: number;
    /** Inclusive end row. */
    readonly rowEnd: number;
    /** Inclusive start cell column. */
    readonly colStart: number;
    /** Inclusive end cell column. */
    readonly colEnd: number;
    /** Unique chain IDs owned by the segment. */
    readonly chainIds: readonly number[];
    /** Whether the segment originated from a seam-spanning legacy corridor. */
    readonly periodicSeam: boolean;
    /** Planned dry-run shell rails. */
    readonly shellRails: readonly OuterWallCorridorShellRail[];
    /** Planned dry-run host-edge split decomposition. */
    readonly seamCollar: readonly OuterWallSeamCollarSplit[];
}

/** One legacy-owned cell snapshot used to derive corridor candidates. */
export interface OuterWallLegacyOwnershipCell {
    /** Band index in the outer-wall grid. */
    readonly band: number;
    /** Cell column index in the outer-wall grid. */
    readonly col: number;
    /** Chain IDs participating in the legacy-owned cell. */
    readonly chainIds: readonly number[];
}

/** Dry-run corridor candidate derived from the current legacy ownership maps. */
export interface OuterWallCorridorCandidate {
    /** Stable candidate identifier for diagnostics. */
    readonly id: string;
    /** Candidate band. */
    readonly band: number;
    /** Inclusive start row. */
    readonly rowStart: number;
    /** Inclusive end row. */
    readonly rowEnd: number;
    /** Inclusive start cell column. */
    readonly colStart: number;
    /** Inclusive end cell column. */
    readonly colEnd: number;
    /** Unique chain IDs present in the candidate footprint. */
    readonly chainIds: readonly number[];
    /** Whether the candidate is supported by the C1 dry-run rules. */
    readonly supported: boolean;
    /** Reasons the candidate is not supported, if any. */
    readonly unsupportedReasons: readonly OuterWallCorridorUnsupportedReason[];
    /** Planned dry-run shell rails. */
    readonly shellRails: readonly OuterWallCorridorShellRail[];
    /** Planned dry-run host-edge split decomposition. */
    readonly seamCollar: readonly OuterWallSeamCollarSplit[];
    /** Planner-authoritative ownership segments eligible for corridor emission. */
    readonly ownershipSegments: readonly OuterWallCorridorOwnershipSegment[];
}

/** Aggregate dry-run diagnostics for corridor planning. */
export interface OuterWallCorridorDiagnostics {
    /** Number of legacy-owned cells examined. */
    readonly legacyCellCount: number;
    /** Number of dry-run corridor candidates derived. */
    readonly candidateCount: number;
    /** Number of supported candidates. */
    readonly supportedCandidateCount: number;
    /** Number of unsupported candidates. */
    readonly unsupportedCandidateCount: number;
    /** Number of cells covered by all candidates. */
    readonly candidateCellCount: number;
    /** Number of cells covered by supported candidates only. */
    readonly supportedCellCount: number;
    /** Ratio of supported cells to legacy cells. */
    readonly supportedCoverageRatio: number;
    /** Count of seam-span candidates. */
    readonly seamCandidateCount: number;
    /** Count of multi-chain overlap candidates. */
    readonly overlapCandidateCount: number;
    /** Count of structurally supported overlap candidates before tessellator veto. */
    readonly supportedOverlapCandidateCount: number;
}

/** Dry-run planner output for future corridor emission work. */
export interface OuterWallCorridorPlanningResult {
    /** Metadata contract frozen for the future emitter. */
    readonly metadataContract: OuterWallCorridorMetadataContract;
    /** Dry-run corridor candidates. */
    readonly candidates: readonly OuterWallCorridorCandidate[];
    /** Optional diagnostics emitted only when requested. */
    readonly diagnostics?: OuterWallCorridorDiagnostics;
}

/** Input to the dry-run corridor planner. */
export interface OuterWallCorridorPlannerInput {
    /** Base grid U positions. */
    readonly unionU: Float32Array;
    /** Number of cells per row. */
    readonly cellsPerRow: number;
    /** Legacy-owned cells derived from the current tessellator path. */
    readonly legacyCells: readonly OuterWallLegacyOwnershipCell[];
    /** Width threshold used to classify seam-spanning cells. */
    readonly seamGuard: number;
    /** Whether aggregate diagnostics should be included. */
    readonly includeDiagnostics?: boolean;
}

/** Frozen contract summary shared by all dry-run planner results. */
export const OUTER_WALL_CORRIDOR_METADATA_CONTRACT: Readonly<OuterWallCorridorMetadataContract> = Object.freeze({
    quadMap: 'preserve_legacy_until_emitter',
    chainEdges: 'preserve_legacy_until_emitter',
    chainAdjacentVertices: 'preserve_legacy_until_emitter',
    protectedStripVertices: 'preserve_legacy_until_emitter',
    fanDiagonalEdges: 'preserve_legacy_until_emitter',
    interpolatedChainVertices: 'preserve_legacy_until_emitter',
});

/**
 * Build dry-run corridor candidates from the current legacy ownership cells.
 *
 * The planner intentionally does not mutate the mesh path. It only groups
 * contiguous legacy-owned cells into future corridor candidates and classifies
 * which ones satisfy the simple C1 support rules.
 *
 * @param input Planner input derived from the live outer-wall ownership maps.
 * @returns Dry-run corridor candidates and optional diagnostics.
 */
export function planOuterWallCorridors(
    input: OuterWallCorridorPlannerInput,
): OuterWallCorridorPlanningResult {
    const byBand = new Map<number, Map<number, readonly number[]>>();
    for (const cell of input.legacyCells) {
        let bandCells = byBand.get(cell.band);
        if (!bandCells) {
            bandCells = new Map<number, readonly number[]>();
            byBand.set(cell.band, bandCells);
        }
        bandCells.set(cell.col, cell.chainIds);
    }

    const candidates: OuterWallCorridorCandidate[] = [];
    let candidateCellCount = 0;
    let supportedCellCount = 0;
    let seamCandidateCount = 0;
    let overlapCandidateCount = 0;
    let supportedOverlapCandidateCount = 0;

    const sortedBands = [...byBand.keys()].sort((a, b) => a - b);
    for (const band of sortedBands) {
        const bandCells = byBand.get(band);
        if (!bandCells || bandCells.size === 0) continue;
        const cols = [...bandCells.keys()].sort((a, b) => a - b);

        let runStart = cols[0];
        let prevCol = cols[0];
        let runChainIds = new Set<number>(bandCells.get(cols[0]) ?? []);
        let runHasSeam = isSeamCell(cols[0], input.unionU, input.seamGuard);

        const flushRun = (colStart: number, colEnd: number, chainIdSet: ReadonlySet<number>, hasSeam: boolean): void => {
            const chainIds = [...chainIdSet].sort((a, b) => a - b);
            const unsupportedReasons: OuterWallCorridorUnsupportedReason[] = [];
            const structurallySupportedOverlap = !hasSeam && chainIds.length === 2;
            if (chainIds.length > 1 && !structurallySupportedOverlap) {
                unsupportedReasons.push('multi_chain_overlap');
                overlapCandidateCount++;
            } else if (structurallySupportedOverlap) {
                supportedOverlapCandidateCount++;
            }
            if (hasSeam && chainIds.length > 1) {
                unsupportedReasons.push('seam_span');
                if (!unsupportedReasons.includes('multi_chain_overlap')) {
                    overlapCandidateCount++;
                }
            }
            if (hasSeam) {
                seamCandidateCount++;
            }
            const leftBoundaryCell = Math.max(0, colStart - 1);
            const rightBoundaryCell = Math.min(input.cellsPerRow - 1, colEnd + 1);
            const shellRails: OuterWallCorridorShellRail[] = [
                {
                    side: 'left',
                    band,
                    rowStart: band,
                    rowEnd: band + 1,
                    boundaryU: input.unionU[leftBoundaryCell],
                },
                {
                    side: 'right',
                    band,
                    rowStart: band,
                    rowEnd: band + 1,
                    boundaryU: input.unionU[rightBoundaryCell + 1],
                },
            ];
            const seamCollar: OuterWallSeamCollarSplit[] = [
                {
                    edge: 'bottom',
                    band,
                    colStart,
                    colEnd,
                    splitUs: [input.unionU[colStart], input.unionU[colEnd + 1]],
                },
                {
                    edge: 'top',
                    band,
                    colStart,
                    colEnd,
                    splitUs: [input.unionU[colStart], input.unionU[colEnd + 1]],
                },
            ];
            const ownershipSegments: OuterWallCorridorOwnershipSegment[] = unsupportedReasons.length === 0
                ? [{
                    id: `band-${band}-cols-${colStart}-${colEnd}-segment-0`,
                    band,
                    rowStart: band,
                    rowEnd: band + 1,
                    colStart,
                    colEnd,
                    chainIds,
                    periodicSeam: hasSeam,
                    shellRails,
                    seamCollar,
                }]
                : [];
            const supported = ownershipSegments.length > 0;
            const cellSpan = colEnd - colStart + 1;
            candidateCellCount += cellSpan;
            if (supported) supportedCellCount += cellSpan;
            candidates.push({
                id: `band-${band}-cols-${colStart}-${colEnd}`,
                band,
                rowStart: band,
                rowEnd: band + 1,
                colStart,
                colEnd,
                chainIds,
                supported,
                unsupportedReasons,
                shellRails,
                seamCollar,
                ownershipSegments,
            });
        };

        for (let i = 1; i < cols.length; i++) {
            const col = cols[i];
            if (col === prevCol + 1) {
                for (const chainId of bandCells.get(col) ?? []) {
                    runChainIds.add(chainId);
                }
                runHasSeam = runHasSeam || isSeamCell(col, input.unionU, input.seamGuard);
                prevCol = col;
                continue;
            }
            flushRun(runStart, prevCol, runChainIds, runHasSeam);
            runStart = col;
            prevCol = col;
            runChainIds = new Set<number>(bandCells.get(col) ?? []);
            runHasSeam = isSeamCell(col, input.unionU, input.seamGuard);
        }
        flushRun(runStart, prevCol, runChainIds, runHasSeam);
    }

    return {
        metadataContract: OUTER_WALL_CORRIDOR_METADATA_CONTRACT,
        candidates,
        diagnostics: input.includeDiagnostics ? {
            legacyCellCount: input.legacyCells.length,
            candidateCount: candidates.length,
            supportedCandidateCount: candidates.filter(candidate => candidate.supported).length,
            unsupportedCandidateCount: candidates.filter(candidate => !candidate.supported).length,
            candidateCellCount,
            supportedCellCount,
            supportedCoverageRatio: input.legacyCells.length > 0 ? supportedCellCount / input.legacyCells.length : 0,
            seamCandidateCount,
            overlapCandidateCount,
            supportedOverlapCandidateCount,
        } : undefined,
    };
}

function isSeamCell(col: number, unionU: Float32Array, seamGuard: number): boolean {
    const uSpan = unionU[col + 1] - unionU[col];
    return uSpan > seamGuard || uSpan < -seamGuard;
}
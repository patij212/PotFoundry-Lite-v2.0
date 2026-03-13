# Master Approval — R46 Phase 3: Subdivision Midpoint Re-snap

Date: 2026-03-08

## Decision: APPROVED WITH AMENDMENTS

## Unanimous Agreement Status
- Generator: Proposed Proposal 2 (metadata return + PEC re-snap) with Sub-option 2b (discrete best candidate)
- Verifier: ACCEPT WITH AMENDMENTS (C1 window width, C2 fan diagonal guard, W1-W3)
- Executioner: pending
- Master: APPROVED — all Verifier amendments accepted

## Rationale

Root Cause D is confirmed. When `subdivideLongEdges` splits 8,632 chain edges, midpoints are placed at the UV average, which for curved ridges can be up to ~0.004 U (~1.2mm) off the true ridge. This creates a zigzag alternating on-ridge original vertices with off-ridge midpoints — the visible "dip" pattern.

The Generator's Proposal 2 is architecturally sound: MeshSubdivision returns metadata about chain-edge midpoints, PEC applies the re-snap. Both Verifier CRITICAL findings are correct and must be incorporated.

## Accepted Amendments

| ID | Amendment | Rationale |
|---|---|---|
| C1 | Adaptive window: `hw = max(BASE, min(0.01, uDrift/2 + BASE))` | ±0.000244 covers only 6% of worst-case 0.004 U error |
| C2 | Guard: both endpoints ≥ `outerGridVertexCount` AND skip if `chainId === undefined` | Fan diagonals in `constraintEdgeSet` would be falsely tagged |
| W1 | `continue` when chainId unknown (not `isMax = true`) | Wrong extremum search for valleys is worse than no re-snap |
| W2 | 64 candidates when `hw > 4 × SAMPLE_WIDTH` | Maintain spatial resolution for wide windows |
| W3 | Prefix-sum `probeOffset` accumulator (not fixed stride) | Variable candidate count per midpoint |

## Implementation Spec

### File 1: MeshSubdivision.ts

**Change 1**: Add interface after `SubdivisionStats` (~line 103):
```typescript
export interface ChainMidpointInfo {
    vertexIdx: number;   // final index in grown resultData
    u: number;           // initial midpoint U (circular average)
    t: number;           // midpoint T
    v0: number;          // endpoint vertex index
    v1: number;          // endpoint vertex index
    u0: number;          // endpoint U (for adaptive window)
    u1: number;          // endpoint U (for adaptive window)
}
```

**Change 2**: Add `chainMidpoints: ChainMidpointInfo[]` to `SubdivisionResult`.

**Change 3**: In Phase A split collection, track chain-edge splits using the safe guard:
```typescript
const isChainMidpoint = isChainEdgeA
    && se.v0 >= outerGridVertexCount
    && se.v1 >= outerGridVertexCount;
if (isChainMidpoint) chainSplitIndices.push(splitsToApply.length - 1);
```

**Change 4**: After Phase C, build `ChainMidpointInfo[]` from tracked indices:
- `vertexIdx = resultData.length / 3 + splitIndex` (1:1 mapping confirmed by Verifier A3)
- `u = midUVBatch[splitIndex * 3]`
- `t = midUVBatch[splitIndex * 3 + 1]`
- `v0, v1, u0, u1` from `splitsToApply[splitIndex].se`

**Change 5**: Return `chainMidpoints` (empty array when no splits).

### File 2: ParametricExportComputer.ts

**Change 6**: After subdivision results extraction (~line 1770), insert re-snap block:
1. Skip if `subdivResult.chainMidpoints.length === 0` or `!cfgGpuResnap`
2. Pre-compute per-midpoint adaptive window and candidate count (skip if `circularDistance(u0, u1) < 2 * SAMPLE_WIDTH`)
3. Build candidate UV batch with prefix-sum allocation
4. GPU evaluate all candidates in one call
5. For each midpoint: look up `chainId` from `outerChainVertexChainIds` → **skip if undefined**
6. Find best discrete candidate (max radius for peak, min for valley)
7. Guard: `moved > 1e-7 && moved < 0.08`
8. Update `finalResultData[vertexIdx * 3 .. +2]` with best candidate's 3D position
9. Log: `R46 subdiv re-snap: {count}/{total} refined, {skipped} skipped (no chainId)`

## Risk Assessment

- **Blast radius**: Moderate. Modifies subdivision midpoint 3D positions, which affects all downstream diagnostics (boundary, mesh quality, chain-strip quality). The changes are intentional — moving midpoints closer to ridges improves feature fidelity.
- **Rollback**: Simple. Remove the re-snap block in PEC and the `chainMidpoints` field in MeshSubdivision. The extra interface/tracking code is inert without PEC consuming it.
- **Performance**: One additional GPU call evaluating ~276K-553K candidates (8.6K midpoints × 32-64). Expected <40ms based on Phase 2 benchmarks.

## Implementation Order

1. MeshSubdivision.ts: interface + result field + Phase A tracking + Phase C metadata collection
2. PEC: re-snap block after subdivision
3. Run `npm run typecheck`, `npm run lint`, `npm test`

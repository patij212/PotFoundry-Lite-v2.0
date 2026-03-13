# Master Approval — R46 Phase 2: Interpolated Re-snap + Chain-Grid Flip Prevention
Date: 2026-03-08

## Decision: APPROVED WITH AMENDMENTS

## Unanimous Agreement Status
- Generator: proposed P2 (re-snap) + P3B (chain-aware sweep) + P3C (blunt constraint)
- Verifier: accepted with 2 critical amendments (C1 window width, C2 batch2Remap skip), redirected P3B scope, accepted P3C as diagnostic
- Master: approved P2 with amendments + simplified P3 (CSO-level skip, not constraintEdgeSet)

## What to Implement

### Fix 1: Post-OWT GPU Re-snap of Interpolated Chain Vertices (P2)

**Location**: `OuterWallTessellator.ts` (expose data) + `ParametricExportComputer.ts` (re-snap logic)

**OWT changes:**
1. Add `interpolatedChainVertices` to `OuterWallResult` interface:
   ```typescript
   interpolatedChainVertices: Array<{ vertexIdx: number; chainId: number; rowIdx: number; gapSize: number }>;
   ```
2. After the chain vertex interpolation loop (~L783), collect interpolated vertices:
   ```typescript
   // Filter OUT batch2Remap'd vertices (C2 amendment)
   const interpolatedChainVertices = chainVertices
       .filter(cv => cv.pointIdx === -1 && !batch2Remap.has(cv.vertexIdx))
       .map(cv => ({ vertexIdx: cv.vertexIdx, chainId: cv.chainId, rowIdx: cv.rowIdx, gapSize: /* from gap context */ }));
   ```
3. To get `gapSize`, track it during interpolation. In the gap loop (L762-783), the variable `steps` is the gap size. Store it on the ChainVertex or collect alongside:
   - Either add `gapSize` to ChainVertex interface
   - Or build a Map<vertexIdx, gapSize> during interpolation and use it when building the output array

**PEC changes (after buildCDTOuterWall returns, before Phase 3 GPU eval):**
1. Extract `interpolatedChainVertices` from cdtResult
2. For each interpolated vertex:
   - Compute adaptive window: `HALFWIDTH = Math.min(0.01, Math.max(BASE_WIDTH, gapSize² × 0.001))`
   - Use 64 candidates when HALFWIDTH > 4× SAMPLE_WIDTH, else 32
   - Build GPU probe vertices at `currentU ± HALFWIDTH`
   - Evaluate on GPU via `this.evaluatePoints()`
   - Find best candidate (max/min radius based on chain kind)
   - Parabolic refinement
   - Apply if `moved > 1e-7 && moved < MAX_INTERP_DELTA (0.08)`
   - Update `combinedVerts[iv.vertexIdx * 3] = finalU`
3. Log: `R46 interp re-snap: N/M refined, K skipped (batch2Remap), avg window=X, max window=Y`

### Fix 2: Chain-Grid Edge Flip Prevention in CSO (Simplified P3)

**Location**: `ChainStripOptimizer.ts` only

Instead of adding to constraintEdgeSet (which would affect subdivision thresholds), add the `isChainGridEdge` check directly in CSO's flip loop to skip chain-grid edge flips:

In all 3 phases, AFTER the constraintEdgeSet check and BEFORE the quality checks:
```typescript
if (constraintEdgeSet.has(ek)) continue;
// R46 Phase 2: prevent chain-grid diagonal flips (consistency > individual quality)
if (isChainGridEdge(shLo, shHi)) { chainGridFlips++; continue; }
```

Wait — the counter currently increments AFTER `applyFlip`. Move it to count PREVENTED flips:
```typescript
if (isChainGridEdge(shLo, shHi)) { chainGridFlips++; continue; }
```

This makes `chainGridFlips` count prevented flips (should be ~1170, matching previous flipped count). The semantic changes from "chain-grid edges flipped" to "chain-grid edges skipped" — update the log label accordingly.

**Why this over P3B**: P3B (tracked sweep diagonals) adds ~50 lines across OWT and PEC, a new `sweepQuadTracked` function, and additional state threading. The CSO-level skip achieves the same result — preventing chain-grid diagonal flips — with 3 lines of code and zero architectural changes. If we discover later that some chain-grid flips are beneficial (unlikely), we can add nuance then.

## Rationale

1. **P2 addresses the largest positional error**: 2516 vertices (40.7% of chain vertices) have linearly interpolated U coordinates. Even with perfect diagonal consistency, these off-ridge vertices create smooth deviations from the feature ridge.

2. **Simplified P3 addresses the largest flip category**: 1170 chain-grid flips (63.3% of all CSO flips) create row-by-row diagonal inconsistency → visible zigzag. Preventing them is more important than the quality improvement each flip individually provides.

3. **Verifier's C1 amendment is mandatory**: The Step 3.5 re-snap window was designed for detected peaks within ±1 sample. Interpolated vertices need 10× wider windows. The adaptive formula `gapSize² × 0.001` scales correctly with the quadratic nature of interpolation error.

4. **Verifier's C2 amendment is mandatory**: batch2Remap'd vertices point to shared grid vertices. Re-snapping them corrupts grid regularity.

5. **Verifier's C4 insight simplifies P3**: Both-sides 2×2 sub-quads have all-chain-vertex diagonals, which aren't counted in chainGridFlips. The CSO-level skip catches all actual chain-grid flips without needing to modify OWT.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| P2 adaptive window too wide, finds wrong feature | Low | Medium | Tolerance bound (0.08 U), parabolic refinement, chain kind check |
| P2 GPU cost for 2516 × 64 candidates = 161K probes | Low | Low | <100ms on any modern GPU |
| P3 blocking 1170 flips degrades mesh quality | Low | Low | CSO still flips 679 non-chain-grid edges; visual consistency outweighs individual quality |
| P2 gapSize tracking adds complexity to OWT | Low | Low | 5 lines of additional tracking in existing loop |

## Implementation Order (for Executioner)

**All changes in a single atomic changeset:**

1. **OWT**: Add `gapSize` tracking to interpolation loop. Add `interpolatedChainVertices` to interface and return value. Filter out batch2Remap'd vertices.
2. **PEC**: Add post-OWT re-snap logic after cdtResult extraction with adaptive window.  
3. **CSO**: Add `isChainGridEdge` skip in all 3 phases (3 lines). Change counter semantic to "skipped" not "flipped".
4. Validate: `npm run typecheck && npm run lint && npm test`

## Conditions
- [ ] Adaptive window MUST scale with gapSize² (Verifier C1)
- [ ] batch2Remap'd vertices MUST be excluded (Verifier C2)
- [ ] Candidate count = 64 when window > 4× SAMPLE_WIDTH
- [ ] Log must include refined count, skipped count, avg/max window width
- [ ] CSO chainGridFlips counter semantic = "skipped" (not "flipped")
- [ ] All 1881 tests pass, typecheck clean, lint 0 warnings

# Verifier Round 5 — Final Verdict: T-Ladder Companion Redesign
Date: 2025-07-10

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's T-Ladder proposal (Proposal 1) is a **fundamentally sound redesign**
that correctly addresses all 6 root causes identified in the Verifier's diagnostic.
The core insight — that the CDF-adaptive grid already solves U-density near chain
features, and the real deficit is T-density between row boundaries — is correct and
well-supported by the codebase evidence.

## Accepted Items

### A1: Sizing by T-gap, not halfGapU ✓
**Evidence**: `buildDensityProfile` (GridBuilder.ts L235-270) uses `featureFloor=0.6,
featureRadius=0.004`, guaranteeing high column density near chain features. The CDF
grid places columns at ~0.001 spacing near features, making `halfGapU ≈ 0.0005`.
Using T-gap (~0.0025) for sizing produces radii 5× larger than the Round 4 approach.

### A2: No cell bounds check ✓
**Evidence**: The strip collection code (OWT L960-967) collects companions by
band and U-range. stripExpansion=1 (CST L47) widens strips by 1 column on each side.
Companions at u_cv ± 0.001 (spreadU at density=4) fall within the typical strip
width of 0.003-0.005. Cross-cell companions are naturally handled.

### A3: Full T-gap span with evenly-spaced rungs ✓
**Evidence**: `tFrac = k/(nTLevels+1)` places companions at 33%/67% (nTLevels=2)
of the T-gap. These are strictly interior — never at band boundaries. The existing
`bsearchFloor` bucketing (OWT L544-550) and strict inequality filter (OWT L548)
both pass for interior positions.

### A4: No changes to ChainStripTriangulator ✓
**Evidence**: The `addVertex` function (CST L170-177) uses `cv.t` for T-position,
which is set by the T-Ladder. The CDT normalization (CST L164: `scale = max(uRange,
tRange)`) preserves aspect ratio. Interior companions at intermediate T-levels create
well-distributed points in normalized space.

### A5: Constraint endpoint injection for missing edges ✓
**Evidence**: The strip U-range filter (OWT L904-910) excludes chain vertices beyond
the strip boundary. Constraint edges referencing these vertices have their endpoints
silently dropped in CST L225-230 (`globalToLocal.get(v0)` returns undefined). The
proposed fix explicitly injects missing endpoints into stripBot/stripTop.

### A6: nTLevels/nUSpread scaling ✓
The `floor(density/2)` and `floor((density-1)/2)` formulas give monotonic growth:
density=1→(1,0), density=4→(2,1), density=8→(4,2), density=12→(6,4). At low
densities, the design degrades gracefully to center-only (Proposal 2 behavior).

## Amendments

### C1 [WARNING → AMEND]: Seam guard too large at 1e-4

**Generator's claim**: `SEAM_COMPANION_GUARD = 1e-4` fixes chain6 at U≈0.99999.

**Actual behavior**: `1 - 1e-4 = 0.9999`. Chain6 center companion at U=0.99999:
`0.99999 > 0.9999` → **REJECTED**. Chain6 still gets ZERO center companions.
Left-spread companions at U ≈ 0.99899 pass, but these don't provide T-resolution
at the chain vertex's own U-position.

**Required fix**: Reduce `SEAM_COMPANION_GUARD` to **1e-6** (matching the grid's
last column position precision at `1 - 1e-6`). Chain6 at U=0.99999:
`0.99999 < 1 - 0.000001 = 0.999999` → **ACCEPTED**. Only chain vertices at
U > 0.999999 lose center companions, and those are essentially coincident with
the last grid column.

### C2 [WARNING → NOTE]: Companion count underestimated by ~10×

**Generator's claim**: "~400 chain vertices" producing "~3,000-3,500 companions".

**Actual data**: The pipeline produces ~4,854-6,600 chain vertices (20 chains × 
~243-330 points each, depending on row count). At 12 companions per vertex
(density=4), pre-dedup count is ~58,000-79,000.

**Corrected estimate**: After spatial dedup from overlapping ladders (adjacent
chain vertices on the same chain produce overlapping rungs in shared bands),
expect ~50-70% survival → **~30,000-50,000 companions** post-dedup.

This is still <20% of grid vertex count (577×400 = 230,800) and manageable for
CDT performance. **No design change needed**, just corrected projections.

### C3 [NOTE]: Batch endpoint injection, sort once

**Generator's code**: Sorts stripBot/stripTop after EACH endpoint insertion.

**Required optimization**: Batch all missing-endpoint insertions, then sort once
at the end. The `stripBot.some()` lookup doesn't require sorted order. The sort
is only needed before CDT boundary edge construction.

## Rejected Items

None. The T-Ladder design is sound in all its core aspects.

## Implementation Plan (For Executioner)

### Step 1: Replace Ring Generator with T-Ladder
**File**: OuterWallTessellator.ts  
**What**: Replace OWT L398-542 (RING_CONFIG, buildRings, concentric ring loop,
cell bounds check, seam guard at 0.003) with the T-Ladder algorithm from
Generator Section 1.3.

**Key parameters**:
- `ASPECT_MATCH_FACTOR = 0.4`
- `SEAM_COMPANION_GUARD = 1e-6` (amended from Generator's 1e-4)
- `nTLevels = max(1, min(6, floor(density/2)))`
- `nUSpread = max(0, min(4, floor((density-1)/2)))`
- NO `halfGapU`, NO `maxR`, NO cell bounds check
- Keep existing 2D spatial-bucket dedup infrastructure

### Step 2: Fix Missing Constraint Endpoints
**File**: OuterWallTessellator.ts  
**What**: After collecting `segConstraints` (OWT ~L935-945) and applying
Batch2 remap, add a pass that ensures all constraint endpoints appear in
stripBot or stripTop.

**Implementation** (amended per C3):
```typescript
// After segConstraints population and batch2Remap application:
let botModified = false, topModified = false;
for (const [v0, v1] of segConstraints) {
    for (const vIdx of [v0, v1]) {
        if (vIdx < gridVertexCount) continue; // Grid vertex — already in strip
        const cvIdx = vIdx - gridVertexCount;
        const cv = allChainVertices[cvIdx];
        if (!cv) continue;
        const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                        stripTop.some(sv => sv.idx === vIdx);
        if (inStrip) continue;
        if (cv.rowIdx === j) {
            stripBot.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
            botModified = true;
        } else if (cv.rowIdx === j + 1) {
            stripTop.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
            topModified = true;
        }
    }
}
if (botModified) stripBot.sort((a, b) => a.u - b.u);
if (topModified) stripTop.sort((a, b) => a.u - b.u);
```

### Step 3: Keep Existing Infrastructure
- **2D spatial-bucket dedup**: Keep as-is (OWT L441-475)
- **interiorByBand bucketing**: Keep as-is (OWT L540-550)
- **stripInteriorVerts collection**: Keep as-is (OWT L960-970)
- **C1 fix (rowChainVerts filter)**: Keep as-is (OWT L589-594)
- **Vertex buffer T-position**: Keep as-is (OWT L580: `cv.t ?? activeTPositions[cv.rowIdx]`)
- **CDT interior vertex handling**: Keep as-is (CST L237-250)

### Step 4: Update Diagnostic Logging
Update the companion diagnostic log line (OWT L555-562) to report T-Ladder
metrics instead of ring metrics (nTLevels, nUSpread instead of density/rings).

## Validation Protocol

After implementation, run an export and verify:

| Metric | Target | Hard Fail |
|--------|--------|-----------|
| maxAspect (UV) | < 20:1 | > 100:1 |
| Missing chain edges | 0 | > 10 |
| R2 violations | < 500 | > 5000 |
| Min angle (UV) | > 10° | < 1° |
| Validation | PASS | FAIL on any dim |
| Inverted triangles | 0 | > 100 |
| Non-manifold edges | 0 | > 10 |

## Answers to Generator's Open Questions

1. **ASPECT_MATCH_FACTOR = 0.4**: ACCEPTED. CDT normalization uses uniform scaling
   (`scale = max(uRange, tRange)`), preserving the 1.2:1 ratio between U-spacing
   and T-spacing in normalized space. No adjustment needed.

2. **nTLevels = floor(density/2)**: ACCEPTED. At density=4, 2 T-levels per band
   gives T-spacing ≈ tGap/3 ≈ 0.000833. This creates well-shaped triangles without
   excessive vertex density.

3. **Dedup threshold**: ACCEPTED. 1e-5 is fine. Minimum companion spacing at
   density=4 is ~0.001 (spreadU/nUSpread), well above threshold.

4. **Grid-companion collision**: ACCEPTED. Grid vertices are at row T-positions,
   companions at intermediate T-positions. They never share the same (U,T). No
   collision possible in 2D.

5. **Sub-problem B implementation**: Use explicit endpoint injection (more robust)
   with C3 amendment (batch sort). See Implementation Plan Step 2.

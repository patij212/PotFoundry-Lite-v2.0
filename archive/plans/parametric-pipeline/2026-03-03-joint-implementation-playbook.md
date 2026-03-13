# Joint Implementation Playbook — Opus A + Opus B

**Date:** 2026-03-03  
**Purpose:** Concrete implementation guide for the P0/P1 changes agreed upon in the review document  
**Audience:** Both Opus instances + human coordinator  

---

## Section 1: The Kill List — What to Remove First

Before adding anything, remove the dead weight. These are safe deletions that simplify the codebase without changing behavior:

### 1.1 Remove UV-Snapping Loop (OWT lines 693-755)

**Why**: UV-snapping is the root of Root Causes 2, 3, and part of 5. It warps grid vertices, prevents transition vertices from working, and creates staircase artifacts.

**Exactly what to delete**: The entire block from `// UV-snap grid vertices near chain points` through `snappedVertexCount++; }` (approximately OWT lines 693-755).

**What happens when we delete it**:
- Chain vertices (idx >= gridVCount) retain their exact U positions from detection
- Grid vertices stay at their uniform grid positions (no warping)
- `insertGradedTransitionVertices` stops false-positive rejecting via grid-proximity
- The CDT receives both chain and grid vertices with distinct positions
- ChainStripOptimizer's index-based detection (`idx >= gridVCount`) works correctly

**What breaks**:
- If any downstream code assumes chain "vertex" = modified grid vertex, it will read the wrong position. Verify: the CDT uses `allChainVertices[idx - gridVCount].u` directly, so this should be fine.
- The `snappedCells` collision tracking disappears, but it's no longer needed.

**Risk**: Near-coincident vertices (chain at U=0.253, grid at U=0.254). Mitigated by Idea A below.

### 1.2 Remove `localOnlyMode` Gate from Union Grid Build (PEC lines ~1130-1142)

**Current code** (approximately):
```typescript
if (cfgLocalOnly) {
    unionU = outerBaseU;
} else {
    unionU = buildUnionFeatureGrid(outerBaseU, finalRowFeatures, maxOuterColumns);
}
```

**Replace with**:
```typescript
unionU = buildUnionFeatureGrid(outerBaseU, finalRowFeatures, maxOuterColumns);
```

### 1.3 Remove `localOnlyMode` Gate from Row Insertion (PEC line ~1057)

**Current code**:
```typescript
const maxRowInsertions = cfgLocalOnly
    ? 0
    : Math.min(200, Math.floor(numOuterRows * 0.5), budgetInsertionCap);
```

**Replace with**:
```typescript
const maxRowInsertions = Math.min(200, Math.floor(numOuterRows * 0.5), budgetInsertionCap);
```

### 1.4 Remove `localOnlyMode` from ExportDialog.tsx

Remove the toggle UI and the field from PipelineConfig. This also removes the `localOnlyMode` field from `PipelineStageConfig` in types.ts.

### 1.5 Keep Column Probing Gated (But Rename the Gate)

Instead of `localOnlyMode`, gate column probing behind a new explicit field:

```typescript
// types.ts
detectHorizontalFeatures: boolean;  // default: false

// PEC:
if (cfg.detectHorizontalFeatures) {
    // ... column probing section (lines 801-860) ...
}
```

This preserves working code but makes it opt-in for styles that actually have horizontal features.

---

## Section 2: The Build — Transition Ring Geometry Fix

### 2.1 The Core Problem (Gap 3 from 2026-03-01 chain-strip-fix-round-2)

Current `insertGradedTransitionVertices` places all ring vertices at the feature edge's own two rows (bot.rowIdx, top.rowIdx). Rings spread in U but NOT in T. This creates a 1-dimensional spread, not the intended 2D concentric shells.

### 2.2 The Fix: Multi-Row Ring Expansion

Replace the inner loop at OWT lines 370-389:

**FROM**:
```typescript
for (const targetRow of [bot.rowIdx, top.rowIdx]) {
    // ... place at bot and top only
}
```

**TO**:
```typescript
// Expand rows proportional to ring distance
const minRow = Math.max(0, bot.rowIdx - ring);
const maxRow = Math.min(numT - 1, top.rowIdx + ring);
for (let targetRow = minRow; targetRow <= maxRow; targetRow++) {
    const tRow = activeTPositions[targetRow];
    const tBot = activeTPositions[bot.rowIdx];
    const tTop = activeTPositions[top.rowIdx];
    
    // Compute U at this row by interpolating the chain edge
    let uAtRow: number;
    if (targetRow <= bot.rowIdx) {
        uAtRow = bot.u;  // Extend from bottom
    } else if (targetRow >= top.rowIdx) {
        uAtRow = top.u;  // Extend from top
    } else {
        const frac = (tRow - tBot) / (tTop - tBot + 1e-12);
        uAtRow = bot.u + du * frac;  // Interpolate
    }
    
    for (const side of [-1, 1]) {
        tryAddVertex(uAtRow + side * ringDist, targetRow, bot.chainId);
    }
}
```

**Effect**: Ring 1 covers rows [bot-1, top+1] (3 rows), Ring 2 covers [bot-2, top+2] (5 rows), etc. This creates proper 2D density shells.

**Budget concern**: More vertices per ring. With maxRings=6, the worst case is Ring 6 covering 13 rows × 2 sides = 26 vertices per edge. With ~250 feature edges, that's ~6,500 vertices at ring 6 alone. Total across all rings: ~25,000 vertices. This is within the maxVertices=50,000 budget but uses significant allocation. Consider reducing maxRings from 6 to 4.

### 2.3 Safety: Nearest-Grid Dedup After Ring Insertion

After removing UV-snapping and adding multi-row rings, some ring vertices may land very close to grid vertices. Add a post-pass:

```typescript
// After insertGradedTransitionVertices returns:
// Merge ring vertices that are within MIN_U_SEPARATION of a grid column
for (const cv of newTransitionVertices) {
    const nearestCol = bsearchFloor(unionU, cv.u);
    for (const c of [nearestCol - 1, nearestCol, nearestCol + 1]) {
        if (c >= 0 && c < unionU.length && Math.abs(unionU[c] - cv.u) < 0.0005) {
            cv.u = unionU[c];  // Snap TO grid (not grid to chain)
            break;
        }
    }
}
```

This is the opposite of the old UV-snapping: instead of warping the grid to the chains, we snap stray transition vertices TO the grid. This prevents near-degenerate triangles without losing grid integrity.

---

## Section 3: Adaptive Prominence — Implementation Sketch

### 3.1 Per-Row StdDev Calculation

Add to `detectAllRowFeatures`:

```typescript
export function detectAllRowFeatures(
    rowProbeData: Float32Array[],
    probeSamples: number
): { allRowFeatures: number[][]; allRowTypedFeatures: FeaturePoint[][]; totalRejected: number } {
    const allRowFeatures: number[][] = [];
    const allRowTypedFeatures: FeaturePoint[][] = [];
    let totalRejected = 0;

    for (let j = 0; j < rowProbeData.length; j++) {
        if (rowProbeData[j].length >= probeSamples * 3) {
            // Compute per-row stats for adaptive threshold
            const radii = new Float32Array(probeSamples);
            for (let i = 0; i < probeSamples; i++) {
                const x = rowProbeData[j][i * 3];
                const y = rowProbeData[j][i * 3 + 1];
                radii[i] = Math.sqrt(x * x + y * y);
            }
            let sum = 0, sum2 = 0;
            for (let i = 0; i < probeSamples; i++) {
                sum += radii[i];
                sum2 += radii[i] * radii[i];
            }
            const mean = sum / probeSamples;
            const variance = sum2 / probeSamples - mean * mean;
            const stdDev = Math.sqrt(Math.max(0, variance));
            
            // Adaptive prominence: half a standard deviation, floored at 0.0005mm
            const adaptiveMinProm = Math.max(0.0005, 0.5 * stdDev);
            
            const result = detectRowFeaturesV16(rowProbeData[j], probeSamples, adaptiveMinProm);
            allRowFeatures.push(result.uPositions);
            allRowTypedFeatures.push(result.features);
            totalRejected += result.rejected;
        } else {
            allRowFeatures.push([]);
            allRowTypedFeatures.push([]);
        }
    }
    return { allRowFeatures, allRowTypedFeatures, totalRejected };
}
```

### 3.2 Cross-Validation Match

Update `MIN_ROW_PROMINENCE` in `crossValidateAndMergeColumnFeatures` to also use stdDev-relative:

```typescript
// Instead of: const MIN_ROW_PROMINENCE = 0.005;
// Use: compute stdDev of the target row's probe data and use 0.5 * stdDev
```

This requires passing `rowStdDevs: Float32Array` (precomputed) to the cross-validation function.

---

## Section 4: Metric-Distorted CDT — Implementation Sketch

### 4.1 Where to Apply

In `cdtTriangulateStrip` (ChainStripTriangulator.ts, around lines 179-203), the `addVertex` function normalizes U and T to `[0, 1]` range:

```typescript
points.push([(u - uMin) / scale, (t - tBase) / scale]);
```

### 4.2 What to Change

Apply circumferential stretch compensation:

```typescript
// Compute stretch at the band's T midpoint
const tMid = (tBot + tTop) / 2;
const stretch = stretchFn ? stretchFn(tMid) : 1.0;

// When placing 2D points for CDT, scale U by stretch
points.push([((u - uMin) * stretch) / scale, (t - tBase) / scale]);
```

This makes CDT "see" the 3D aspect ratio. A thin triangle in 3D becomes thin in the CDT's 2D space, so CDT avoids it.

### 4.3 Passing stretchFn

`triangulateChainStrip` currently doesn't receive a stretch function. Add it:

```typescript
export function triangulateChainStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    config: ChainStripConfig,
    stats: ChainStripStats,
    stretchFn?: (t: number) => number,  // NEW
): void
```

This requires threading `potGeometry` → `estimateCircumferentialStretch` → `stretchFn` through `buildCDTOuterWall` → `triangulateChainStrip`.

---

## Section 5: Feature-Aware Grid (Idea 1 from Review) — Full Spec

### 5.1 Replace buildUnionFeatureGrid with buildFeatureAwareGrid

```typescript
export function buildFeatureAwareGrid(
    baseDensity: number,       // base columns (e.g., 735)
    chainFeatureUs: number[],  // all chain feature U positions (merged, sorted)
    sigma: number,             // Gaussian spread in U-space (default: 2 * baseSpacing)
    maxColumns: number,        // budget cap
    peakDensityMultiplier: number = 3.0,  // density at feature center vs base
): Float32Array {
    const baseSpacing = 1.0 / baseDensity;
    const effectiveSigma = sigma ?? (2 * baseSpacing);
    
    // Step 1: Compute continuous density function
    function desiredSpacing(u: number): number {
        let densityBoost = 0;
        for (const fu of chainFeatureUs) {
            const d = circularDistance(u, fu);
            densityBoost += peakDensityMultiplier * Math.exp(-(d * d) / (2 * effectiveSigma * effectiveSigma));
        }
        const totalDensity = 1.0 + densityBoost;  // 1.0 = base density
        return baseSpacing / totalDensity;
    }
    
    // Step 2: Walk U from 0 to 1, placing columns at locally-adaptive spacing
    const positions: number[] = [0];
    let u = 0;
    while (u < 1 - 1e-7) {
        const spacing = desiredSpacing(u);
        u += spacing;
        if (u < 1 - 1e-7) {
            positions.push(u);
        }
    }
    
    // Step 3: Budget cap — if too many columns, increase base spacing proportionally
    if (maxColumns > 0 && positions.length > maxColumns) {
        // Binary search for the base spacing that produces exactly maxColumns
        let lo = baseSpacing, hi = 1.0;
        while (hi - lo > 1e-8) {
            const mid = (lo + hi) / 2;
            // Re-run walk with mid as baseSpacing
            let count = 1, u2 = 0;
            while (u2 < 1 - 1e-7) {
                let db = 0;
                for (const fu of chainFeatureUs) {
                    const d = circularDistance(u2, fu);
                    db += peakDensityMultiplier * Math.exp(-(d * d) / (2 * effectiveSigma * effectiveSigma));
                }
                u2 += mid / (1 + db);
                if (u2 < 1 - 1e-7) count++;
            }
            if (count > maxColumns) lo = mid; else hi = mid;
        }
        // Re-run with final spacing
        positions.length = 0;
        positions.push(0);
        u = 0;
        const finalBase = hi;
        while (u < 1 - 1e-7) {
            let db = 0;
            for (const fu of chainFeatureUs) {
                const d = circularDistance(u, fu);
                db += peakDensityMultiplier * Math.exp(-(d * d) / (2 * effectiveSigma * effectiveSigma));
            }
            u += finalBase / (1 + db);
            if (u < 1 - 1e-7) positions.push(u);
        }
    }
    
    return new Float32Array(positions);
}
```

### 5.2 Benefits Over Current Approach
- **No flanking system**: Density transitions are smooth, not discrete offsets
- **No transition vertices needed**: Grid itself provides gradual density
- **No budget starvation**: Budget cap adjusts base density proportionally, features always get relative density boost
- **Deterministic**: Same inputs → same grid. No hash collisions or snapping ambiguity.

### 5.3 Risks
- **Feature positions not guaranteed in grid**: Unlike current approach where cluster centers are always kept, the adaptive walk may not place a column exactly at a feature U. Mitigation: snap the nearest column to the feature U within `MIN_U_SEPARATION`.
- **Computational cost for budget binary search**: O(log(1/ε) × numColumns × numFeatures). With maxColumns=2000, numFeatures=50, ε=1e-8, that's ~27 × 2000 × 50 = 2.7M ops. Acceptable.
- **This is a big change**: Replaces a well-tested (if imperfect) system. Should be implemented as an alternative, tested in parallel, then switched.

---

## Section 6: Fingerprint Quality Score (FQS) — Metric Spec

### 6.1 Components

| Component | Symbol | Range | Computation |
|-----------|--------|-------|-------------|
| Chain Continuity | CC | 0-1 | (total chain points with pointIdx≥0) / (detected features × non-gap rows) |
| Chain-Strip Aspect Quality | AQ | 0-1 | 1 - (chain-strip triangles with AR>4) / (total chain-strip triangles) |
| Transition Grading | TG | 0-1 | 1 - (area grading violations) / (total chain-strip triangles) |
| Edge Preservation | EP | 0-1 | (chain edges found in mesh) / (total chain edges) |
| R2 Compliance | R2 | 0-1 | 1 - (R2 violation triangles) / (total chain-strip triangles) |

### 6.2 Formula

```
FQS = 0.25 * CC + 0.25 * AQ + 0.20 * TG + 0.20 * EP + 0.10 * R2
```

### 6.3 Targets

| Grade | FQS | Meaning |
|-------|-----|---------|
| 🏆 Fingerprint | ≥ 0.95 | Publication quality — every ridge visible, no artifacts |
| ✅ Good | 0.85-0.94 | Functional quality — features clear, minor imperfections |
| ⚠️ Acceptable | 0.70-0.84 | Features recognizable but degraded |
| ❌ Poor | < 0.70 | Features lost or severely distorted |

### 6.4 Where to Compute

In `ParametricExportComputer.compute()`, after Phase 4 (post-GPU optimization), before returning results. All required data is available:
- Chain edges: from `buildCDTOuterWall` result
- R2 violations: from ChainStripStats
- Aspect ratios: compute from 3D positions + triangle indices
- Edge preservation: from `buildCDTOuterWall` edge verification (OWT lines 1200-1255)

### 6.5 Where to Display

Add to the Debug tab in ExportDialog.tsx. Show the breakdown + grade badge.

---

## Section 7: Decision Matrix — What We Need Alignment On

| Decision | Option A | Option B | Opus B Recommendation |
|----------|----------|----------|----------------------|
| Column detection | Delete entirely (Opus A plan Phase 4) | Keep behind opt-in flag | **Option B** — working code should be preserved |
| Feature grid | Current flank system + rings | Feature-Aware Grid (Gaussian density) | **Option B** — but implement as parallel option first |
| Prominence threshold | `max(0.001, 0.0003 * meanRadius)` | `max(0.0005, 0.5 * stdDev)` | **Option B** — signal-relative is more robust |
| R2 violations | Count only (current) | Count + reject + local re-triangulation | **Reject** — R2 violations are rare (~0.1%) but when they occur they're visible |
| Feature budget | Additive augmentation (current) | Direct maxColumns control | **Direct** — simpler mental model |
| Seam handling | Rely on circularSignedDelta | Explicit seam-crossing chain detection + split | **Explicit** — for robustness |

---

## Section 8: Test Plan

### 8.1 Existing Tests to Preserve
- 39 FeatureDetection tests (taper, consensus, cross-validation, prominence)
- 8 ExportPanel tests
- All 1911 project-wide tests

### 8.2 New Tests Needed

| Test | File | Description |
|------|------|-------------|
| Chain vertex indices distinct from grid | OuterWallTessellator.test.ts | After removing UV-snap, verify chain vertices have idx >= gridVCount |
| Transition rings span multiple rows | OuterWallTessellator.test.ts | Ring at distance k expands ±k rows from edge |
| No near-degenerate triangles near chains | Integration test | Min triangle area > 0 for all chain strip triangles |
| Adaptive prominence catches gentle features | FeatureDetection.test.ts | Row with stdDev=0.003 and features at 0.002 prominence should still detect |
| Adaptive prominence rejects noise | FeatureDetection.test.ts | Row with stdDev=0.1 should reject prominence=0.01 features |
| FQS >= 0.85 for TypeA style | Integration test | End-to-end quality metric |
| Feature-Aware Grid density gradient | GridBuilder.test.ts | Grid spacing near feature < grid spacing far from feature |
| Metric-distorted CDT produces better AR | ChainStripTriangulator.test.ts | With stretch=3, CDT produces lower max aspect ratio |

### 8.3 Regression Tests
- Golden mesh comparison at 3 resolutions (low/med/high)
- Triangle count within 5% of baseline (budget preservation)
- Export time within 2× of baseline
- Feature edge preservation ≥ 99%

---

*Opus B — 2026-03-03. This is the playbook. Let's decide, divide, and conquer.*

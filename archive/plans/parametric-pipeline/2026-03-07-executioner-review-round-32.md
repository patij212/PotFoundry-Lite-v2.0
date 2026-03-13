# Executioner Review — R32 Boundary Chain Promotion
Date: 2026-03-07

## Feasibility Verdict: FEASIBLE

The proposal is well-scoped, low-risk, and mechanically straightforward. All Generator code assumptions verified against source. Two line number corrections and one missing interaction identified (B-A2 not strictly needed but explained below). No blocking issues.

---

## 1. Feasibility Assessment

The change promotes mid-row grid vertices at `segStart`/`segEnd` from CDT interior Steiner points to boundary polygon vertices. This is a routing change in OWT + boundary construction change in CST. The CDT input geometry is the same vertex set with the same constraint edges — only the vertex classification changes.

**Why this is safe**:
- `addVertex` dedup (global→local map) prevents double-registration regardless of routing
- `addEdge` dedup prevents duplicate constraint edges from R31 overlap
- Empty boundary chains fall back to original single-edge behavior (single-band strips)
- Sweep/sweep-repair modes are unaffected (params passed but ignored)
- All 18 test call sites need only mechanical `[], []` insertion

**Verifier amendments accepted**:
- A1 (B-A1 rescue guard): CRITICAL, confirmed necessary, corrected line numbers below
- A2 (framing correction): Acknowledged — this is a robustness cleanup, not a sliver fix
- A3 (test count = 18): Confirmed via grep

---

## 2. File Impact Analysis — Confirmed Line Numbers

### ChainStripTriangulator.ts

| Edit | Generator Line | Actual Line | Status |
|------|---------------|-------------|--------|
| `triangulateChainStrip()` signature | ~102 | **102** | ✓ Match |
| switch body (CDT pass-through) | ~120-135 | **121-133** | ~1 off |
| `cdtTriangulateStrip()` signature | ~147 | **149** | ~2 off |
| Left/right boundary edges | ~253-259 | **252-257** | ~1 off |

### OuterWallTessellator.ts

| Edit | Generator Line | Actual Line | Status |
|------|---------------|-------------|--------|
| `stripInteriorVerts` declaration | ~1376 | **1376** | ✓ Match |
| Mid-row grid vertex filter | ~1460-1475 | **1459-1478** | ~1 off |
| B-A1 rescue `inStrip` | ~1564-1571 | **1567-1569** | ~3 off |
| B-A2 rescue `inStrip` | ~1605-1607 | **1605-1607** | ✓ Match |
| R31 boundary companions | ~1635-1670 | **1637-1670** | ~2 off |
| R31 boundary constraints | ~1675-1695 | **1677-1696** | ~2 off |
| `triangulateChainStrip()` call | ~1762 | **1760-1768** | ~2 off |

### ChainStripTriangulator.test.ts

18 call sites confirmed at lines: 108, 132, 156, 180, 189, 216, 237, 249, 264, 285, 298, 327, 342, 358, 370, 385, 410, 427.

---

## 3. Exact Code Changes

### 3A. ChainStripTriangulator.ts — Signature: `triangulateChainStrip()` (line 102)

**Before** (lines 102-115):
```typescript
export function triangulateChainStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    config: ChainStripConfig,
    stats: ChainStripStats,
    potGeometry?: PotGeometryParams,
): void {
```

**After**:
```typescript
export function triangulateChainStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],
    leftBoundary: StripVertex[],
    rightBoundary: StripVertex[],
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    config: ChainStripConfig,
    stats: ChainStripStats,
    potGeometry?: PotGeometryParams,
): void {
```

### 3B. ChainStripTriangulator.ts — Switch body (lines 121-133)

**Before**:
```typescript
    switch (config.mode) {
        case 'cdt':
            cdtTriangulateStrip(buf, bot, top, constraints, interiorVerts, chainVerts, gridVCount, tBot, tTop, stats, potGeometry);
            break;
        case 'sweep':
            sweepTriangulateStrip(buf, bot, top, constraints, chainVerts, gridVCount, tBot, tTop, stats);
            break;
        case 'sweep-repair':
            sweepRepairTriangulateStrip(buf, bot, top, constraints, chainVerts, gridVCount, tBot, tTop, stats);
            break;
        default:
            cdtTriangulateStrip(buf, bot, top, constraints, interiorVerts, chainVerts, gridVCount, tBot, tTop, stats, potGeometry);
    }
```

**After**:
```typescript
    switch (config.mode) {
        case 'cdt':
            cdtTriangulateStrip(buf, bot, top, constraints, interiorVerts, leftBoundary, rightBoundary, chainVerts, gridVCount, tBot, tTop, stats, potGeometry);
            break;
        case 'sweep':
            sweepTriangulateStrip(buf, bot, top, constraints, chainVerts, gridVCount, tBot, tTop, stats);
            break;
        case 'sweep-repair':
            sweepRepairTriangulateStrip(buf, bot, top, constraints, chainVerts, gridVCount, tBot, tTop, stats);
            break;
        default:
            cdtTriangulateStrip(buf, bot, top, constraints, interiorVerts, leftBoundary, rightBoundary, chainVerts, gridVCount, tBot, tTop, stats, potGeometry);
    }
```

### 3C. ChainStripTriangulator.ts — Signature: `cdtTriangulateStrip()` (line 149)

**Before** (lines 149-161):
```typescript
function cdtTriangulateStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    stats: ChainStripStats,
    potGeometry?: PotGeometryParams,
): void {
```

**After**:
```typescript
function cdtTriangulateStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],
    leftBoundary: StripVertex[],
    rightBoundary: StripVertex[],
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    stats: ChainStripStats,
    potGeometry?: PotGeometryParams,
): void {
```

### 3D. ChainStripTriangulator.ts — Boundary construction (lines 252-257)

**Before**:
```typescript
    const botLeftLocal = globalToLocal.get(bot[0].idx)!;
    const botRightLocal = globalToLocal.get(bot[bot.length - 1].idx)!;
    const topLeftLocal = globalToLocal.get(top[0].idx)!;
    const topRightLocal = globalToLocal.get(top[top.length - 1].idx)!;
    addEdge(botLeftLocal, topLeftLocal);
    addEdge(botRightLocal, topRightLocal);
```

**After**:
```typescript
    const botLeftLocal = globalToLocal.get(bot[0].idx)!;
    const botRightLocal = globalToLocal.get(bot[bot.length - 1].idx)!;
    const topLeftLocal = globalToLocal.get(top[0].idx)!;
    const topRightLocal = globalToLocal.get(top[top.length - 1].idx)!;

    // R32: Left boundary chain (descending T — top→bot for CCW winding)
    if (leftBoundary.length > 0) {
        let prevLocal = topLeftLocal;
        for (const sv of leftBoundary) {
            const local = addVertex(sv.idx, sv.u, sv.promotedT!);
            addEdge(prevLocal, local);
            prevLocal = local;
        }
        addEdge(prevLocal, botLeftLocal);
    } else {
        addEdge(botLeftLocal, topLeftLocal);
    }

    // R32: Right boundary chain (ascending T — bot→top for CCW winding)
    if (rightBoundary.length > 0) {
        let prevLocal = botRightLocal;
        for (const sv of rightBoundary) {
            const local = addVertex(sv.idx, sv.u, sv.promotedT!);
            addEdge(prevLocal, local);
            prevLocal = local;
        }
        addEdge(prevLocal, topRightLocal);
    } else {
        addEdge(botRightLocal, topRightLocal);
    }
```

**Note on `addVertex` vs pre-registration**: The Generator correctly uses `addVertex` directly in the boundary chain loop. This registers boundary chain vertices AFTER interiorVerts pre-registration (line 218) but BEFORE constraint edge processing (line 263). R31 column constraints reference these same global indices, so they must be registered before step 7. The boundary chain construction at step 6 satisfies this ordering. No separate pre-registration block needed.

**Note on winding**: Technically irrelevant — CDT uses `exterior: true` and the filter is centroid-based (line 304+). `addEdge` is undirected. However, the ordering DOES matter for avoiding collinear edge containment: descending T for left ensures each edge connects consecutive T-valued vertices (no long edge spanning collinear intermediate points). This is the correct approach.

### 3E. OuterWallTessellator.ts — Array declarations (after line 1376)

**Before**:
```typescript
                const stripInteriorVerts: StripVertex[] = [];
```

**After**:
```typescript
                const stripInteriorVerts: StripVertex[] = [];
                const leftBoundaryChain: StripVertex[] = [];
                const rightBoundaryChain: StripVertex[] = [];
```

### 3F. OuterWallTessellator.ts — Mid-row grid vertex routing (lines 1459-1478)

**Before**:
```typescript
                for (const midRow of midRows) {
                    for (const sv of midRow.verts) {
                        if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
                            if (sv.idx < gridVertexCount) {
                                const col = sv.idx % numU;
                                if (col !== segStart && col !== segEnd) {
                                    stripGridInteriorSkipCount++;
                                    continue;
                                }
                            }
                            stripInteriorVerts.push({
                                idx: sv.idx, u: sv.u, isChain: sv.isChain,
                                gridCol: sv.gridCol,
                                promotedT: activeTPositions[midRow.row],
                            });
                        }
                    }
                }
```

**After**:
```typescript
                for (const midRow of midRows) {
                    for (const sv of midRow.verts) {
                        if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
                            if (sv.idx < gridVertexCount) {
                                const col = sv.idx % numU;
                                if (col === segStart) {
                                    // R32: Promote to left boundary chain vertex
                                    leftBoundaryChain.push({
                                        idx: sv.idx, u: sv.u, isChain: false,
                                        gridCol: col,
                                        promotedT: activeTPositions[midRow.row],
                                    });
                                    continue;
                                }
                                if (col === segEnd) {
                                    // R32: Promote to right boundary chain vertex
                                    rightBoundaryChain.push({
                                        idx: sv.idx, u: sv.u, isChain: false,
                                        gridCol: col,
                                        promotedT: activeTPositions[midRow.row],
                                    });
                                    continue;
                                }
                                stripGridInteriorSkipCount++;
                                continue;
                            }
                            stripInteriorVerts.push({
                                idx: sv.idx, u: sv.u, isChain: sv.isChain,
                                gridCol: sv.gridCol,
                                promotedT: activeTPositions[midRow.row],
                            });
                        }
                    }
                }
```

### 3G. OuterWallTessellator.ts — Sort/orient chains (after midRows loop, before constraint collection)

Insert after the closing `}` of the midRows loop (after line ~1478), before `const segConstraints`:

```typescript
                // R32: Orient boundary chains for CDT polygon winding.
                // midRows iterate ascending T → sort ascending, then reverse left for descending T.
                leftBoundaryChain.sort((a, b) => a.promotedT! - b.promotedT!);
                leftBoundaryChain.reverse();
                rightBoundaryChain.sort((a, b) => a.promotedT! - b.promotedT!);
```

### 3H. OuterWallTessellator.ts — B-A1 rescue `inStrip` (Amendment A1) (lines 1567-1569)

**Before**:
```typescript
                        const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                                        stripTop.some(sv => sv.idx === vIdx) ||
                                        stripInteriorVerts.some(sv => sv.idx === vIdx);
```

**After**:
```typescript
                        const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                                        stripTop.some(sv => sv.idx === vIdx) ||
                                        stripInteriorVerts.some(sv => sv.idx === vIdx) ||
                                        leftBoundaryChain.some(sv => sv.idx === vIdx) ||
                                        rightBoundaryChain.some(sv => sv.idx === vIdx);
```

**B-A2 `inStrip` (lines 1605-1607): NO CHANGE NEEDED.** B-A2 only processes chain vertices (`vIdx >= gridVertexCount`). Boundary chains contain exclusively grid vertices (`idx < gridVertexCount`). A chain vertex can never appear in a boundary chain array. Adding the check would be dead code.

### 3I. OuterWallTessellator.ts — Pass chains to `triangulateChainStrip()` (line 1760)

**Before**:
```typescript
                triangulateChainStrip(
                    indexBuf, stripBot, stripTop, segConstraints,
                    stripInteriorVerts,
                    allChainVertices, gridVertexCount,
                    tBot, tTop,
                    chainStripConfig, chainStripStats,
                    potGeometry,
                );
```

**After**:
```typescript
                triangulateChainStrip(
                    indexBuf, stripBot, stripTop, segConstraints,
                    stripInteriorVerts,
                    leftBoundaryChain,
                    rightBoundaryChain,
                    allChainVertices, gridVertexCount,
                    tBot, tTop,
                    chainStripConfig, chainStripStats,
                    potGeometry,
                );
```

### 3J. ChainStripTriangulator.test.ts — 18 call sites

Each call currently has this pattern (e.g., line 108):
```typescript
triangulateChainStrip(buf, bot, top, [], [], [], gridVCount, 0.0, 1.0, cdtConfig, stats);
```

After R32, insert `[], []` after the 5th argument (the `interiorVerts` `[]`):
```typescript
triangulateChainStrip(buf, bot, top, [], [], [], [], [], gridVCount, 0.0, 1.0, cdtConfig, stats);
```

For calls with non-empty `interiorVerts` (none exist currently — all pass `[]`), the `[], []` still goes after interiorVerts.

All 18 lines: 108, 132, 156, 180, 189, 216, 237, 249, 264, 285, 298, 327, 342, 358, 370, 385, 410, 427.

---

## 4. Risk Assessment

### Low Risk
- **Signature change is mechanical**: Two new params after `interiorVerts`. All callers identified (1 in OWT, 18 in test). No other call sites exist.
- **Empty arrays preserve behavior**: Single-band strips (the common case for most pots) produce empty boundary chains → original single-edge fallback → identical output.
- **R31 constraint dedup**: Boundary chain edges duplicate R31 column constraints. `addEdge` dedup handles this cleanly — verified in source at lines 231-237.
- **addVertex dedup**: If B-A1 rescue somehow fires for a boundary chain vertex (shouldn't after A1 fix), `addVertex` returns the existing local index. No geometric corruption.

### Watch Points (not risks, just items to verify during testing)
1. **CDT collinearity**: All left boundary vertices are at U=0 (normalized). CDT2d handles convex hull collinearity correctly per robust-predicates. The Generator's ascending-T sub-edge ordering avoids long collinear edge containment. If ANY style shows `stats.minAngleUV < 1°` after R32, consider the U+1e-9 perturbation (Proposal 1A).
2. **Edge case E5 (bot/top at different U)**: When `bot[0].u ≠ top[0].u` (chain vertex inserted before grid vertex at start), the boundary chain forms a non-vertical path. This is a valid simple polygon — verified by the endpoint safety net at lines 1413-1415 guaranteeing the grid vertex is always `bot[0]`/`top[0]`.

---

## 5. Dependencies — Implementation Order

Changes must be applied **atomically** (all files in one commit):

1. **ChainStripTriangulator.ts** — signature + switch + boundary construction (3A–3D)
2. **ChainStripTriangulator.test.ts** — add `[], []` to all 18 calls (3J)
3. **OuterWallTessellator.ts** — declarations + routing + sort + B-A1 fix + call site (3E–3I)

Steps 1 and 2 can be done together (they fix the compile error from the signature change). Step 3 depends on step 1 (new signature). But all must land together to avoid a broken intermediate state.

---

## 6. Test Strategy

### Validation Protocol (per Verifier)
1. `npx vitest run` — all existing tests pass (131+)
2. `npm run typecheck` — clean
3. `npm run lint` — 0 warnings
4. Export Gothic Arches: triangle count ±5%, `stats.minAngleUV` same or better, `stats.r2Violations` same, no visual regression
5. Export Rounded Cylinder: identical mesh output
6. `batch2RescueCount` in diagnostics: should NOT increase vs pre-R32

### New Tests (recommended but not blocking)
- Boundary chain with 3-band strip: verify triangles connect boundary chain vertices properly
- Empty boundary chain: verify identical output to pre-R32

---

## 7. Surprises / Feedback for Generator & Verifier

### For the Generator
1. **B-A2 doesn't need the boundary chain check** — B-A2 processes only chain vertices (`vIdx >= gridVertexCount`), and boundary chains contain only grid vertices. Adding the check there would be dead code. The Verifier's amendment A1 correctly targets only B-A1.
2. **Winding direction is irrelevant for CDT** — `exterior: true` + centroid filter means the polygon winding doesn't affect triangle classification. However, the sort ordering IS important for avoiding collinear edge containment in cdt2d. Your analysis reaches the right conclusion for the wrong reason.
3. **R31 column constraints become redundant** — With R32, boundary chain edges cover the same connections. They're harmlessly deduped, but consider removing them in a future cleanup round (not in R32).

### For the Verifier
1. **Your amendment A1 is precisely correct.** The scenario (batch2Remap'd chain → grid vertex at segStart → constraint endpoint → B-A1 fires) is real and the fix is necessary.
2. **C1 (overclaimed benefit) is accurate.** The slivers are a companion desert problem, not a Steiner/boundary classification problem. R32 eliminates the degenerate collinear-Steiner-on-boundary-edge configuration, which is a real robustness win.
3. **B-A2 `inStrip` does NOT need updating** — see reasoning above. This is a refinement of your amendment that the Generator's proposal didn't address because neither party analyzed B-A2 separately.

---

*Signature: Executioner Agent — 2026-03-07*

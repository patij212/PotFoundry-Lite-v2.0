# Verifier Round 27 — Critique of Multi-Band CDT + Heuristic T-Inflation

Date: 2026-03-06

## Summary Verdict: ACCEPT Proposal A WITH AMENDMENTS; ACCEPT Proposal B WITH MAJOR AMENDMENTS; ACCEPT Proposal C conditionally

The Generator's R27 proposals are significantly more mature than R26's metric normalization attempts. The key insight from R26 V5/V6 — that √metricRatio is a heuristic geometric-mean compromise, not a theoretically optimal correction — has been correctly incorporated. The multi-band CDT (Proposal B) addresses a genuine architectural limitation. However, several claims require correction and one side-effect bug is critical.

---

## Proposal A: Heuristic T-Inflation

### V1 [VERIFIED]: `dimensions.H` exists and is accessible at PEC

**Generator's claim**: "`dimensions.H` at PEC line 491 is the total pot height in mm"

**Verification**: Confirmed at [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L491):
```typescript
dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
```

And [geometry/types.ts](potfoundry-web/src/geometry/types.ts#L42-L58):
```typescript
export interface PotDimensions {
  H: number;       // "Total height of the pot"
  Rt: number;      // "Top radius (not diameter)"
  Rb: number;      // "Bottom radius (not diameter)"
  ...
  expn: number;    // "Flare exponent"
}
```

At [PEC line 605](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L605), `const { H, Rt, Rb } = dimensions` is destructured — confirms `H` is always present. The PEC call site at [line 1321](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1321) currently passes `{ Rb, Rt, expn }` — adding `H: dimensions.H` is trivial.

**Verdict**: VERIFIED. `PotGeometryParams` needs `H: number` added; plumbing is straightforward.

---

### V2 [NOTE]: `estimateCircumferentialStretch` is related but NOT reusable for T-inflation

**Generator's claim** (implicit): Computes `R(t)` manually in `cdtTriangulateStrip`.

**Verification**: The existing `estimateCircumferentialStretch` at [OWT:111-122](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L111-L122):
```typescript
export function estimateCircumferentialStretch(t: number, params: PotGeometryParams): number {
    const R = params.Rb + (params.Rt - params.Rb) * Math.pow(Math.max(0, Math.min(1, t)), params.expn);
    const Rmin = Math.min(params.Rb, params.Rt);
    if (Rmin <= 0) return 1.0;
    return Math.max(1.0, R / Rmin);
}
```

This returns `R(t) / Rmin` — a **stretch ratio relative to the narrowest point** — clamped to ≥1.0. The Generator needs `R(t)` absolute, not relative. The clamping to 1.0 would also suppress metricRatio < 1 for tall/narrow pots.

**Verdict**: Correct not to reuse. The Generator should compute `R(t)` directly as proposed. However, the Generator could extract a shared `computeRadiusAtT(t, params)` helper to avoid duplicating the `Rb + (Rt - Rb) * t^expn` formula. This is a NOTE, not a requirement.

---

### V3 [VERIFIED]: Sweep fallback is unaffected by T-inflation

**Generator's claim**: "The sweep fallback path is unaffected because it doesn't use the `points[]` array"

**Verification**: The sweep function at [CST:370-460](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L370-L460):
```typescript
function sweepTriangulateStrip(
    buf: number[], bot: StripVertex[], top: StripVertex[],
    constraints: Array<[number, number]>,
    chainVerts: ChainVertex[], gridVCount: number,
    tBot: number, tTop: number, stats: ChainStripStats,
): void {
```

The sweep function receives `bot`/`top` arrays (with `.idx` and `.u` fields) and classifies constraints by bot/top position. It does NOT reference the `points[]` array (which is local to `cdtTriangulateStrip`). The sweep operates on global vertex indices and U-positions, completely independent of CDT normalization.

**Verdict**: VERIFIED. Sweep is isolated from T-inflation.

---

### V4 [VERIFIED]: Quality metrics are diagnostic-only — T-inflation does not break algorithmic decisions

**Generator's claim**: "The quality metrics at CST lines 330-358 are diagnostic-only and not used for algorithmic decisions"

**Verification**: 

In `ChainStripTriangulator.ts`, `minAngleUV` and `maxAspectUV` are:
- Written at [CST:339](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L339) and [CST:348](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L348)
- Logged at [OWT:1844](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1844)
- Asserted in tests at [ChainStripTriangulator.test.ts:413-414](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.test.ts#L413-L414) — `minAngleUV > 5` and `maxAspectUV < 20`

In `ChainStripOptimizer.ts`, the quality metrics are `minAngle3D` and `maxAspect3D` (computed from **3D positions**, not UV coordinates, at [CSO:1090-1193](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L1090-L1193)). These are post-GPU-evaluation metrics, completely independent of CDT normalization.

No code path uses `minAngleUV` or `maxAspectUV` for algorithmic branching (no `if (stats.minAngleUV < threshold)` anywhere).

**Verdict**: VERIFIED. Test thresholds (`> 5°`, `< 20`) may need adjustment since T-inflation changes the UV metric space, but these are calibration updates, not correctness bugs.

---

### V5 [WARNING]: The `tBoundsMax` dynamic formula has an edge case when `tRange > uRange`

**Generator's claim**: The formula `tBoundsMax = Math.max(1.01, tRange / scale * tCorrection + 0.01)` is "self-adjusting"

**Verification**: When `tRange > uRange` (possible with multi-band merge or very narrow strips):
- `scale = tRange` (the max)
- `tRange / scale = 1.0`
- `tBoundsMax = Math.max(1.01, 1.0 * tCorrection + 0.01) = tCorrection + 0.01`
- For typical `tCorrection ≈ 1.77`: `tBoundsMax = 1.78`

This correctly allows the inflated T-coordinates through the centroid filter. ✅

However, the **U-bound** is unchanged at `uBoundsMax = 1.01`. When `scale = tRange` (T-dominant), normalized U = `uRange / tRange` which could be as low as, say, 0.3. Triangle centroids at `cu > 1.01` would be filtered — but no CDT point has `u > uRange/scale ≤ 1.0`, so this is safe.

The one edge case I found: with a **3-band merge** (if ever implemented) where tRange ≈ 3 × 0.0023 = 0.0069 and uRange = 0.0074, scale = uRange, and `tRange/scale * tCorrection = 0.932 * 1.77 = 1.65`. The dynamic `tBoundsMax = 1.66` correctly handles this.

**Counterexample failed**: I could not construct a case where the dynamic formula produces an incorrect bound. The formula is robust.

**Verdict**: The formula works. But the Generator should also apply the same dynamic approach to `tBoundsMin` for symmetry: `tBoundsMin = -0.01` is fine since normalized T ≥ 0, but stating this explicitly would prevent confusion.

---

### V6 [VERIFIED]: Threading `potGeometry` through function signatures is clean

**Generator's claim**: Add `potGeometry?: PotGeometryParams` as the last optional parameter.

**Verification**: `triangulateChainStrip` at [CST:99-112](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L99-L112) has 11 parameters currently. Adding an optional 12th is acceptable. The switch statement at [CST:114-125](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L114-L125) passes `potGeometry` only to `cdtTriangulateStrip` — correct, since sweep/sweep-repair don't need it.

The OWT call site at [OWT:1621-1627](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1621-L1627) already has `potGeometry` in scope via the function parameter. Adding it to the call is a one-line change.

**Verdict**: VERIFIED. Clean plumbing.

---

### V7 [NOTE]: The `Math.pow(meanT, expn)` formula matches the GPU shader semantics

**Generator's claim**: "`Math.pow(meanT, expn)` matches the profile curve used by the GPU shader"

**Verification**: The profile curve `R(t) = Rb + (Rt - Rb) × t^expn` where `t ∈ [0,1]` is used consistently:
- [estimateCircumferentialStretch](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L112): `params.Rb + (params.Rt - params.Rb) * Math.pow(t, params.expn)`
- PEC line 605 destructures `const { H, Rt, Rb } = dimensions` and uses these same parameters for grid sizing

The GPU shader uses the equivalent formula. The `meanT` computation `(tBot + tTop) / 2` uses the T-positions from `activeTPositions[]`, which are in [0, 1] normalized space.

**Verdict**: VERIFIED. Formula is consistent.

---

## Proposal A Verdict: **ACCEPT WITH MINOR AMENDMENTS**

### Amendments:
1. **A-A1**: Test thresholds in `ChainStripTriangulator.test.ts` lines 413-414 must be recalibrated after implementation. The Executioner should run tests, identify any threshold failures, and adjust (this is expected, not a bug).
2. **A-A2**: Add a brief JSDoc comment on the `tCorrection` computation explaining it's a geometric-mean heuristic (√metricRatio), not theoretically optimal. This prevents the next agent from "correcting" it to full metricRatio.

---

## Proposal B: Multi-Band CDT

### V8 [CRITICAL]: `buildMergedRow()` is NOT side-effect free — it mutates `batch2Remap`

**Generator's claim (OQ1)**: "Is `buildMergedRow()` idempotent and side-effect free?"

**Actual behavior** at [OWT:1039-1100](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1039-L1100):

```typescript
const batch2Remap = new Map<number, number>();  // OWT:1023, OUTER scope

const buildMergedRow = (row: number): StripVertex[] => {
    // ...
    if (Math.abs(chainList[ci].u - unionU[i]) <= 1e-6) {
        // ...
        batch2Remap.set(chainList[ci].vertexIdx, gridIdx);  // OWT:1053 — SIDE EFFECT
        // ...
    }
    // Dedup pass:
    if (!prev.isChain && result[k].isChain) {
        batch2Remap.set(result[k].idx, prev.idx);           // OWT:1073 — SIDE EFFECT
    } else if (prev.isChain && !result[k].isChain) {
        batch2Remap.set(prev.idx, result[k].idx);           // OWT:1076 — SIDE EFFECT
    } else {
        batch2Remap.set(result[k].idx, prev.idx);           // OWT:1079 — SIDE EFFECT
    }
};
```

`batch2Remap` is a **closure-captured mutable Map** shared across ALL `buildMergedRow` calls. Every call potentially adds entries mapping chain vertex indices to grid indices (when they coincide spatially).

**Impact on multi-band**:

In the current single-band code, `buildMergedRow(j)` and `buildMergedRow(j+1)` are called per-band, and `batch2Remap` accumulates entries across ALL bands sequentially. The constraint remap at [OWT:1438-1449](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1438-L1449) uses the cumulative map.

For multi-band, calling `buildMergedRow` for intermediate rows adds entries to `batch2Remap` **before** the CDT processes them. This is potentially fine IF the constraint remap correctly handles intermediate row entries. But:

1. The rescue code at [OWT:1488-1510](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1488-L1510) checks `Math.abs(t - tBot) < 1e-9` — intermediate row vertices have `t = activeTPositions[midRow]`, which is NEITHER `tBot` NOR `tTop`. They fall through to the `else` branch and get incorrectly added to `stripTop`.

2. For a 2-band merge with rows [j, j+1, j+2]: an intermediate row j+1 vertex remapped by `batch2Remap` has `t = activeTPositions[j+1]`. The check `Math.abs(t - tBot) < 1e-9` is false (j+1 ≠ j), and the else branch adds it to `stripTop` — but it should be in `stripInteriorVerts` with `promotedT`.

**Counterexample**: Chain vertex at row j+1 coincides with grid position. `buildMergedRow(j+1)` maps it via `batch2Remap` to the grid index. A constraint edge references this chain vertex. After remap, the constraint references a grid index at row j+1. The rescue code finds it's not in any strip array, reads `t` from the vertex buffer, and since `t ≠ tBot` and `t ≠ tTop`, adds it to `stripTop`. The CDT now has a boundary vertex at the wrong T-position, creating a degenerate triangle.

**Required fix**: The rescue code needs a three-way routing for multi-band:
```typescript
const isBot = Math.abs(t - tBot) < 1e-9;
const isTop = Math.abs(t - tTop) < 1e-9;
if (isBot) {
    stripBot.push({ idx: vIdx, u, isChain: false, gridCol: -1 });
    botModified = true;
} else if (isTop) {
    stripTop.push({ idx: vIdx, u, isChain: false, gridCol: -1 });
    topModified = true;
} else {
    // Intermediate row → route to interior with explicit T
    stripInteriorVerts.push({ idx: vIdx, u, isChain: false, gridCol: -1, promotedT: t });
}
```

**Severity**: CRITICAL — without this fix, batch2Remap'd intermediate-row vertices will corrupt the CDT boundary.

---

### V9 [VERIFIED]: `quadMap` unused slots (-1) are harmless downstream

**Generator's claim (OQ2)**: "The quadMap slots for intermediate-band chain-strip cells would be unused (-1). Is this acceptable?"

**Verification**: `quadMap` is consumed by `optimizeBoundaryDiagonals` at [CSO:784-850](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L784-L850):

```typescript
for (let j = 0; j < outerH - 1; j++) {
    for (let col = 0; col < cellsPerRow; col++) {
      const qIdx = j * cellsPerRow + col;
      const triBase = outerQuadMap[qIdx];
      if (triBase < 0) continue; // chain-strip cell, skip
```

Cells with `triBase < 0` (i.e., -1) are skipped entirely. Chain-strip cells are already set to -1 in the current code at [OWT:1289](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1289). Merged-band chain-strip slots would also be -1. The quadMap is initialized to all -1 at [OWT:992](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L992).

**Verdict**: VERIFIED. Unused quadMap slots are harmless.

---

### V10 [WARNING]: `topDupMap` remapping has 5 hardcoded `j + 1` references, not just 1

**Generator's claim**: "Change `cvObj.rowIdx === j + 1` to `cvObj.rowIdx === jTop`"

**Verification**: The Generator identified the constraint edge remap at [OWT:1460](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1460) and [OWT:1467](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1467). But there are **additional** `j + 1` references that must change for multi-band:

| Line | Current Code | Multi-band Change |
|------|-------------|-------------------|
| 1181 | `buildMergedRow(j + 1)` | `buildMergedRow(jTop)` |
| 1244 | `(j + 1) * numU + i` (tl vertex) | `jTop * numU + i` |
| 1245 | `(j + 1) * numU + (i + 1)` (tr vertex) | `jTop * numU + (i + 1)` |
| 1301 | `activeTPositions[j + 1]` (tTop) | `activeTPositions[jTop]` |
| 1361 | `(j + 1) * numU + segStart` (topLeftIdx) | `jTop * numU + segStart` |
| 1362 | `(j + 1) * numU + segEnd` (topRightIdx) | `jTop * numU + segEnd` |
| 1460 | `cvObj.rowIdx === j + 1` (topDupMap remap) | `cvObj.rowIdx === jTop` |
| 1467 | `cvObj.rowIdx === j + 1` (topDupMap remap) | `cvObj.rowIdx === jTop` |
| 1539 | `cv.rowIdx === j + 1` (missing endpoint rescue) | `cv.rowIdx === jTop` |
| 1625 | `activeTPositions[j + 1]` (CDT tTop) | `activeTPositions[jTop]` |

Lines 1244-1245 are inside the non-chain cell block. With Option B2, non-chain cells still emit per-sub-band quads, so these would use `b` and `b + 1` in the sub-band loop, NOT `jTop`. The Generator's pseudo-code handles this correctly.

The missing endpoint rescue at line 1539 checks `cv.rowIdx === j + 1` to route to `stripTop`. For multi-band, intermediate rows (j < rowIdx < jTop) should route to `stripInteriorVerts`, not `stripBot` or `stripTop`. This requires a NEW code path:

```typescript
if (cv.rowIdx === j) {
    stripBot.push(...);
} else if (cv.rowIdx === jTop) {
    stripTop.push(...);
} else if (cv.rowIdx > j && cv.rowIdx < jTop) {
    stripInteriorVerts.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1,
        promotedT: activeTPositions[cv.rowIdx] });
}
```

**Impact**: Missing any of these `j + 1 → jTop` substitutions would produce silent vertex misplacement, leading to degenerate triangles or non-manifold edges.

**Verdict**: WARNING — the Generator identified the core issue but undercounted the change sites. The Executioner must audit ALL 12 `j + 1` references in the band loop (lines 1150-1650) and classify each as: (a) changes to `jTop`, (b) changes to sub-band `b + 1`, or (c) needs new intermediate-row routing.

---

### V11 [VERIFIED]: `StripVertex.promotedT` exists and is handled by CDT

**Generator's claim**: "The `StripVertex` interface already has `promotedT?: number`"

**Verification**: At [OWT:60](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L60):
```typescript
export interface StripVertex {
    idx: number;
    u: number;
    isChain: boolean;
    gridCol: number;
    /** Perturbed T-position for promoted chain vertices (D-Radical). */
    promotedT?: number;
}
```

And at [CST:192-199](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L192-L199):
```typescript
for (const sv of interiorVerts) {
    if (sv.promotedT !== undefined) {
        addVertex(sv.idx, sv.u, sv.promotedT);
    } else { ... }
}
```

Interior vertices with `promotedT` are correctly added to the CDT `points[]` array with their explicit T position. Intermediate row grid vertices passed as `stripInteriorVerts` with `promotedT = activeTPositions[midRow]` will be handled by this existing path.

**Verdict**: VERIFIED. The existing `promotedT` mechanism supports intermediate-row-as-interior without changes to `cdtTriangulateStrip`.

---

### V12 [WARNING]: `batch2Remap` rescue code needs intermediate row awareness (OQ4 confirmed as real risk)

**Generator's claim (OQ4)**: "The current `Math.abs(t - tBot) < 1e-9` check would fail for intermediate rows"

**Verification**: At [OWT:1488-1510](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1488-L1510):

```typescript
for (const vIdx of [v0, v1]) {
    if (vIdx >= gridVertexCount) continue;
    const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                    stripTop.some(sv => sv.idx === vIdx) ||
                    stripInteriorVerts.some(sv => sv.idx === vIdx);
    if (inStrip) continue;
    const u = vertices[vIdx * 3];
    const t = vertices[vIdx * 3 + 1];
    const isBot = Math.abs(t - tBot) < 1e-9;
    if (isBot) {
        stripBot.push({ idx: vIdx, u, isChain: false, gridCol: -1 });
        botModified = true;
    } else {
        stripTop.push({ idx: vIdx, u, isChain: false, gridCol: -1 });
        topModified = true;
    }
}
```

The `else` branch catches EVERYTHING that isn't bot — including intermediate rows. For a 2-band merge, a grid vertex at row j+1 (the intermediate row) has `t = activeTPositions[j+1]`. Since `t ≠ tBot` (`activeTPositions[j]`), it falls into `else` and gets added to `stripTop` as a boundary vertex (no `promotedT`). But it should be a free interior vertex.

**Evidence of harm**: When a vertex meant for the intermediate interior is placed on the top boundary, the CDT creates a constraint edge to it (since boundary vertices have boundary constraint edges — see [CST:220-228](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L220-L228)). This forces a horizontal edge through the interior of the merged band — exactly the artifact multi-band CDT is designed to eliminate.

**Verdict**: WARNING — this is a genuine risk as the Generator flagged. Same fix as V8: add explicit `isTop` check and route remaining vertices to `stripInteriorVerts` with `promotedT`.

---

### V13 [VERIFIED]: Crossing-constraint removal works with merged band constraints

**Analysis**: The P5 crossing-constraint removal at [OWT:1555-1615](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1555-L1615) uses a geometric `segmentsCross()` test — it doesn't care which band a constraint came from. When merging constraints from bands j and j+1:

- Constraint edges within band j cannot cross each other (already handled)
- Constraint edges within band j+1 cannot cross each other (already handled)
- A constraint edge from band j **can** cross an edge from band j+1 if two chains oscillate near each other across the intermediate row. The crossing removal correctly detects and resolves this via confidence scoring.

**Performance**: O(n²) where n is constraint count per segment. Typical: n ≈ 20-30 per band, doubled to 40-60 for 2-band → 3600 comparisons max per segment. With ~100 segments: 360K comparisons total. Each comparison is a few multiplications. Well under 10ms.

**Verdict**: VERIFIED. No changes needed.

---

### V14 [WARNING]: Option B2 (interleaved non-chain cells) has a subtle quadMap indexing concern

**Generator's claim**: "Non-chain cells: emit quads for EACH sub-band individually"

**Verification**: The Generator's pseudo-code:
```typescript
for (let b = j; b < jTop; b++) {
    const bl = b * numU + i;
    const br = b * numU + (i + 1);
    const tl = (b + 1) * numU + i;
    const tr = (b + 1) * numU + (i + 1);
    // ... quad emission
}
```

The quadMap tracking: `quadMap[b * cellsPerRow + i] = triBase` — this correctly uses each sub-band's own slot because `b` iterates over the component bands. Each sub-band's non-chain cell gets its own quadMap entry with its own `triBase` index. ✅

**But**: The current code uses a single `quadIdx = j * cellsPerRow + i` computed at the outer loop level ([OWT:1226](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1226)). The Generator's restructuring MUST compute `quadIdx` inside the sub-band loop, not at the outer level. If the Executioner copies the existing pattern, they'll overwrite the same quadMap slot for every sub-band.

**Verdict**: WARNING. The design is sound but the implementation must be careful about quadIdx computation. Each sub-band needs its own `quadIdx = b * cellsPerRow + i`.

---

### V15 [NOTE]: `topDupMap` for intermediate row chain vertices — no duplication needed

**Generator's claim**: "Chain vertices on the intermediate row should use their original index, not duplicates"

**The purpose of `topDupMap`** (from [OWT:940-947](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L940-L947)):

> "When a chain vertex sits on a grid row (cv.t === undefined), it appears in adjacent bands as both botRow and topRow. Using the same global index in both bands' CDT creates non-manifold edges."

With multi-band merge: the intermediate row is NOT a boundary in either the j-band or j+1-band CDTs. It's interior to the merged CDT. So the chain vertex at row j+1 should use its **original** index (not the duplicate) when it appears as an interior vertex. The duplicate index is only needed when it appears as the **top boundary** — which now means row jTop, not j+1.

When building `stripTop` for row jTop, the existing `topDupMap` lookup at [OWT:1369](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1369) should remain unchanged — it correctly duplicates chain vertices on the top boundary to prevent non-manifold sharing with the next merged band.

When collecting intermediate row vertices for `stripInteriorVerts`, do NOT apply `topDupMap` — use the original vertex index.

**Verdict**: VERIFIED. The Generator's analysis is correct. The constraint edge remap at OWT:1460-1467 must check `cvObj.rowIdx === jTop` (not `j + 1`) to avoid incorrectly remapping intermediate-row constraint endpoints to duplicate indices.

---

### V16 [NOTE]: Shadow vertices on intermediate rows become interior — needs explicit handling

**Generator's claim (OQ3)**: "Shadow vertices on the intermediate row become interior points"

**Verification**: `buildMergedRow` includes shadow vertices in its output at [OWT:1081-1093](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1081-L1093). Shadow vertices have `isChain: false`. When the intermediate row is collected as `stripInteriorVerts`, shadow vertices would be included with `promotedT = activeTPositions[midRow]`.

In `cdtTriangulateStrip`, interior vertices with `promotedT` are added via `addVertex(sv.idx, sv.u, sv.promotedT)` at [CST:193](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L193). Since shadow vertices have `isChain: false` and are NOT chain vertices (`cv.t` lookup would fail), the `promotedT` path handles them correctly.

**Verdict**: VERIFIED. Shadow vertices on intermediate rows will work correctly as interior points via `promotedT`. No special casing needed.

---

## Proposal B Verdict: **ACCEPT WITH MAJOR AMENDMENTS**

### Required Amendments:

1. **B-A1 [CRITICAL]**: The `batch2Remap` rescue code at OWT:1488-1510 must be extended with three-way routing (bot/top/interior) as described in V8. Intermediate-row remapped vertices MUST go to `stripInteriorVerts` with `promotedT`, not to `stripTop`.

2. **B-A2 [CRITICAL]**: The missing-endpoint rescue at OWT:1530-1544 must be extended with intermediate-row routing as described in V10. Currently checks `cv.rowIdx === j` and `cv.rowIdx === j + 1`. Multi-band needs `cv.rowIdx === j` (bot) / `cv.rowIdx === jTop` (top) / `j < cv.rowIdx < jTop` (interior).

3. **B-A3 [WARNING]**: All 12 hardcoded `j + 1` references in the band loop (lines 1150-1650) must be audited. The Executioner must produce a table classifying each as `jTop` (boundary), `b + 1` (sub-band), or `intermediate routing`. See V10 for the complete list.

4. **B-A4 [WARNING]**: Each sub-band's non-chain quad emission must use its own `quadIdx = b * cellsPerRow + i`, not the outer-level `j * cellsPerRow + i`. See V14.

5. **B-A5 [NOTE]**: The `buildMergedRow` side-effect on `batch2Remap` (V8) is acceptable IF intermediate rows are called in order (j+1, j+2, ..., jTop-1) before the CDT runs, because the remap entries are cumulative and order-independent within a single merged band. The Executioner should call `buildMergedRow` for intermediate rows AFTER building botRow and topRow but BEFORE processing constraints.

---

## Proposal C: Combined Interaction

### V17 [VERIFIED]: Aspect ratio math for 2-band + expansion=2 + √metricRatio

**Generator's claim**: Domain aspect ≈ 0.9:1

**Verification**:
- uRange ≈ 5 × (1/numU) ≈ 5 × 0.00148 = 0.0074 (5 cells for expansion=2)
- tRange (2-band) ≈ 2 × 0.0023 = 0.0046
- scale = max(0.0074, 0.0046) = 0.0074
- Normalized T = 0.0046 / 0.0074 = 0.622
- After √metricRatio ≈ 1.77: 0.622 × 1.77 = 1.101
- CDT domain: [0, 1.0] × [0, 1.101]
- Aspect: 1.0:1.1 ≈ **0.91:1** ✅

This is near-square. The Delaunay criterion will have maximum freedom to choose optimal triangle shapes.

**Edge case**: For a wide, short pot (H=30, R=60): metricRatio = 2π×60/30 = 12.6, √metricRatio = 3.55. With 2-band: normalized T × 3.55 = 0.622 × 3.55 = 2.21. `tBoundsMax = max(1.01, 2.22) = 2.22`. CDT domain aspect: 1:2.2 — fairly tall, but still reasonable. The Delaunay will preferentially create horizontal connections, which aligns with short pots' preference for circumferential structure.

For a tall, narrow pot (H=200, R=20): metricRatio = 2π×20/200 = 0.628, √metricRatio = 0.793. Normalized T × 0.793 = 0.622 × 0.793 = 0.493. CDT domain aspect: 1:0.49 = 2:1. Still a good aspect ratio.

**Verdict**: VERIFIED. The combined formula produces robust domain aspects across the parameter range.

---

### V18 [VERIFIED]: `tBoundsMax` dynamic formula handles scale dominance transitions correctly

**Generator's claim**: "The formula is self-adjusting"

Refer to V5 above — verified that the dynamic `tBoundsMax` formula correctly adapts when `scale` switches between `uRange` and `tRange` dominance.

**Verdict**: VERIFIED.

---

## Answers to Generator's Open Questions

### OQ1: "Is `buildMergedRow()` idempotent and side-effect free?"

**NO.** It mutates `batch2Remap` (a closure-captured Map). See V8 for full analysis. Each call adds chain→grid vertex remapping entries. This is acceptable for multi-band IF the rescue code is amended per B-A1 and B-A2.

Additionally, `buildMergedRow` is NOT idempotent — calling it twice for the same row adds duplicate entries to `batch2Remap`. The duplicate entries are harmless (same key→value pairs) but wasteful. The Executioner should ensure each row is built exactly once per merged band group.

### OQ2: "Does the `quadMap` need adjustment for multi-band?"

**NO.** Chain-strip cells set `quadMap` to -1. Downstream consumers (`optimizeBoundaryDiagonals`) skip -1 entries. Merged-band chain-strip cells spanning multiple band slots all correctly get -1. Non-chain cells use per-sub-band `quadIdx = b * cellsPerRow + i` which remains correct. See V9 and V14.

### OQ3: "Shadow vertices on the intermediate row"

**They work correctly.** Shadow vertices have `isChain: false` and will be collected into `stripInteriorVerts` with `promotedT`. The CDT handles them via the existing `promotedT` path. See V16.

### OQ4: "The `batch2Remap` endpoint rescue"

**CONFIRMED AS REAL RISK.** The rescue code's `Math.abs(t - tBot) < 1e-9` check misroutes intermediate-row vertices to `stripTop`. Fix: three-way routing (bot/top/interior). See V8 and V12.

### OQ5: "Should `bandMergeFactor` be adaptive?"

**Defer.** Start with uniform factor 2. Adaptive merge is a future optimization that requires curvature-dependent heuristics. The current implementation should expose `bandMergeFactor` as a `ChainStripConfig` field with default 1 (disabled) for safety, togglable to 2 for testing.

---

## Implementation Conditions for the Executioner

### Phase 1: Proposal A (T-inflation) — implement first

1. Add `H: number` to `PotGeometryParams` at [OWT:87-95](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L87-L95)
2. Pass `H` from PEC at [line 1321](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1321): `{ Rb: dimensions.Rb, Rt: dimensions.Rt, expn: dimensions.expn, H: dimensions.H }`
3. Add `potGeometry?: PotGeometryParams` to `triangulateChainStrip` and `cdtTriangulateStrip` signatures
4. Thread `potGeometry` from OWT call site to `triangulateChainStrip`
5. In `cdtTriangulateStrip`, after `scale` computation, add:
   ```typescript
   let tCorrection = 1.0;
   if (potGeometry && potGeometry.H > 0) {
       const meanT = (tBot + tTop) / 2;
       const R = potGeometry.Rb +
           (potGeometry.Rt - potGeometry.Rb) * Math.pow(meanT, potGeometry.expn);
       const metricRatio = (2 * Math.PI * R) / potGeometry.H;
       tCorrection = Math.sqrt(metricRatio);
   }
   ```
6. Modify `addVertex` to apply T-correction: `(t - tBase) / scale * tCorrection`
7. Update `tBoundsMax` to `Math.max(1.01, tRange / scale * tCorrection + 0.01)`
8. Add JSDoc comment on `tCorrection` explaining the geometric-mean heuristic
9. Run `npx vitest run` — fix any test threshold failures (expected for `minAngleUV`/`maxAspectUV` assertions)
10. Export default 8-petal pot → verify no visual regression, measure quality metrics

### Phase 2: Proposal B (Multi-band CDT) — implement after A is validated

1. Add `bandMergeFactor?: number` to `ChainStripConfig` with default `1` (disabled)
2. Restructure the band loop from `for j=0..numT-2` to `while (j < numT - 1)` with `jTop = j + Math.min(mergeFactor, numT - 1 - j)`
3. Build intermediate rows using `buildMergedRow(m)` for `j < m < jTop`, storing results in a `midRows` array
4. **AUDIT all 12 `j + 1` references** (per V10 table) and change each to either `jTop` or sub-band `b + 1`
5. Union `colHasChain` across all bands in [j, jTop)
6. Merge `rowBandEdges` across all bands in [j, jTop)
7. Collect companion/interior vertices across all bands in [j, jTop)
8. **FIX** batch2Remap rescue code (B-A1): three-way routing for bot/top/intermediate
9. **FIX** missing-endpoint rescue code (B-A2): three-way routing for bot/top/intermediate
10. **FIX** quadIdx per sub-band (B-A4): use `b * cellsPerRow + i` in sub-band loop
11. Skip `topDupMap` for intermediate row vertices
12. Set `bandMergeFactor` to 2 for testing, validate:
    - `npx vitest run` passes
    - Export produces manifold mesh
    - Visual: horizontal band lines reduced
    - Triangle count ±10% of single-band
    - `bandMergeFactor = 1` reproduces exact single-band output (regression gate)

### Recommended Implementation Order

**A alone first.** Validate. Measure.
**Then B, guarded by `bandMergeFactor = 1` default.** Test with factor 2 behind a flag.
**Never ship both simultaneously without A-only as a validated checkpoint.**

---

## Risk Summary

| Risk | Severity | Proposal | Status |
|------|----------|----------|--------|
| `batch2Remap` mutated by `buildMergedRow` | CRITICAL | B | Requires B-A1 fix |
| Missing-endpoint rescue misroutes intermediate rows | CRITICAL | B | Requires B-A2 fix |
| 12× `j+1` hardcoded references in band loop | WARNING | B | Requires B-A3 audit |
| quadMap indexing in sub-band loop | WARNING | B | Requires B-A4 fix |
| Test threshold recalibration for UV metrics | WARNING | A | Expected, not a bug |
| Wide/short pots push tBoundsMax to 2.2 | NOTE | A+C | Dynamic formula handles |
| `buildMergedRow` non-idempotent | NOTE | B | Acceptable if called once per row |

---

*Verifier signing off. This is the most architecturally ambitious proposal since the CDT adoption itself. Proposal A is clean — a genuine evolution of the R26 √metricRatio idea with correct plumbing. Proposal B is where the dragons live: the `batch2Remap` side-effect was the most dangerous finding because it's a silent data corruption that would only manifest as subtle mesh defects (intermediate-row vertices on wrong boundary), not crashes. The Generator correctly flagged it as a risk (OQ4) but underestimated its severity. The three-way rescue routing is the linchpin of the multi-band implementation — get it right and the rest flows naturally. Get it wrong and you'll chase ghost slivers for another 3 rounds.*

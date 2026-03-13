# Executioner Review — Round 8 Converged Plan (Catmull-Rom Subdivision + Debug Instrumentation)

**Date**: 2026-03-04
**Agent**: Executioner (Claude Opus 4)
**Status**: Read full chain processing pipeline (OWT L310-640), crossing filter (L1069-1136), constraint fix (L1036-1065), companion system (L421-635), strip triangulation (L960-1160), edge verification (L1270-1370), debug line construction (PEC L1156-1180), and test file.

---

## Verdict: FEASIBLE WITH NOTES

Phase 1 (Catmull-Rom subdivision) is feasible but requires **more modifications than specified** and the **insertion point must change**. Phase 2 (debug instrumentation) is trivially feasible.

---

## Phase 1: Catmull-Rom Subdivision of Chain Edges

### Q1: Insertion Point Precision

**Assessment: Plan's insertion point is WRONG. Must restructure.**

The plan says: "Runs AFTER chain edge recording (~L413), BEFORE companion generation (~L425)."

This is problematic because **Catmull-Rom needs per-chain sequential context** (4 control points: P_{-1}, P_0, P_1, P_{+1}), but `chainEdges` is a flat `Array<[number, number]>` of vertex index pairs with no chain-sequence information. After the chain loop ends at ~L415, the per-chain `fullChain` arrays are out of scope.

**Two options:**

**Option A (recommended):** Insert subdivision INSIDE the per-chain loop, AFTER `fullChain` is built (L400), BEFORE edges are recorded (L404). This keeps per-chain sequence context available:

```
for (let cIdx = 0; cIdx < chains.length; cIdx++) {
    // ... build rawRemapped (L338-356)
    // ... build fullChain with interpolation (L359-400)
    // NEW: Catmull-Rom subdivision of fullChain
    // ... Record edges from subdivided fullChain (L404-413)
}
```

**Option B:** Store all `fullChain` arrays before they go out of scope, then subdivide after the loop. Forces storing N arrays and rebuilding `chainEdges`. Messier.

**Recommendation:** Option A. The plan's insertion point is a design error — subdivision must happen before edge recording, not after, because CatRom needs chain sequence context that `chainEdges` doesn't carry.

### Q2: ChainVertex Compatibility

**Assessment: COMPATIBLE, with one design decision required.**

The `ChainVertex` interface (L31-44):
```typescript
interface ChainVertex {
    u: number;
    rowIdx: number;
    t?: number;          // explicit T for non-row vertices
    vertexIdx: number;
    chainId: number;
    pointIdx: number;    // -1 for interpolated
}
```

- `pointIdx = -1` is already established convention for interpolated vertices (used at L392 for multi-row gap fill). Works.
- `t?: number` is the key field. Subdivision points lie BETWEEN rows, not on rows. They MUST have explicit `t` values. This triggers correct behavior:
  - **Excluded from `rowChainVerts`** (L664: `if (cv.t !== undefined) continue;`) — correct, they shouldn't appear on row boundaries
  - **Excluded from companion emitter** (L587: `if (cv.pointIdx < 0) continue;`) — correct, no companions around subdivision points
  - **Included in vertex buffer** via `allChainVertices` (L635)

**Design decision:** `rowIdx` should be set to the **lower row of the band** (e.g., for a vertex between row R and R+1, `rowIdx = R`). This is consistent with how `constraintsByBand` uses `Math.min(cv0.rowIdx, cv1.rowIdx)` for band indexing.

### Q3: Vertex Index Consistency

**Assessment: SAFE if subdivision vertices are APPENDED (never inserted) to `chainVertices`.**

The critical invariant is:
```
chainVertices[vIdx - gridVertexCount] === the ChainVertex with vertexIdx === vIdx
```

This holds because vertices are pushed with sequential `nextVertexIdx++`. As long as subdivision vertices are pushed to the END of `chainVertices` (using the same `nextVertexIdx++` counter), indices remain consistent.

**Downstream systems that use `vIdx - gridVertexCount` as array index:**
- `constraintsByBand` construction (L446-455) — reads `chainVertices[v0Idx - gridVertexCount]`. **Safe** if subdivision runs before `constraintsByBand` is built (which it would with Option A).
- `rowBandEdges` construction (L688-697) — reads `allChainVertices[v0 - gridVertexCount]`. **Safe** because `allChainVertices = [...chainVertices, ...companionVertices]` (L635) preserves order.
- `buildMergedRow` (L713) — only accesses `rowChainVerts`, which excludes `cv.t !== undefined`. **Safe**.
- Edge verification (L1283-1350) — reads `allChainVertices[v0 - gridVertexCount]`. **Safe**.
- `batch2Remap` and `batch6Remap` — operate on vertex indices, not array positions. **Safe**.

**One subtlety:** With Option A (inside loop), subdivision vertices are interleaved with original vertices from later chains. But since `nextVertexIdx` is monotonic and we always append, the array-index === (vertexIdx - gridVertexCount) invariant holds.

### Q4: The `fullChain` Scope Problem

**Assessment: This is EXACTLY why Option A is the right insertion point.**

With Option A, `fullChain` is in scope. We subdivide `fullChain` in-place (or build a new `subdividedChain`), then edges are recorded from the subdivided chain. No scoping issue.

With Option B (plan's insertion point), we'd need to:
1. Store all `fullChain` arrays in a parallel array (`allFullChains`)
2. Iterate them after the loop
3. Clear and rebuild `chainEdges`
4. Also clear and rebuild `chainVertices` entries for any invalidated interpolation vertices

This is significantly more complex. Option A avoids it entirely.

### Q5: Row Index Assignment for Subdivision Vertices

**Assessment: Use `rowIdx = bandLowerRow`, with explicit `t`. Requires one downstream fix.**

Subdivision vertices between row R and R+1:
- `rowIdx = R` (lower row of the band)
- `t = lerp(activeTPositions[R], activeTPositions[R+1], fraction)` — explicit, not undefined

This correctly:
- Excludes them from `rowChainVerts` (L664: `cv.t !== undefined`)
- gives them a valid band index for `constraintsByBand`

**HOWEVER**, there is a required fix:

The `interiorByBand` construction (L611-623) currently iterates only `companionVertices`:
```typescript
const interiorByBand = new Map<number, ChainVertex[]>();
for (const cv of companionVertices) {  // ← ONLY companions
    if (cv.t === undefined) continue;
    const bandIdx = bsearchFloor(activeTPositions, cv.t);
    ...
    list.push(cv);
}
```

Subdivision vertices are in `chainVertices`, not `companionVertices`. They won't appear in `interiorByBand`. They won't appear in `stripInteriorVerts`. But they ARE constraint edge endpoints. If the CDT doesn't know about them, the constraints silently fail.

**Fix required:** After `allChainVertices = [...chainVertices, ...companionVertices]` (L635), build `interiorByBand` from `allChainVertices` instead of just `companionVertices`:

```typescript
for (const cv of allChainVertices) {   // ← iterate ALL
    if (cv.t === undefined) continue;
    const bandIdx = bsearchFloor(activeTPositions, cv.t);
    ...
}
```

This is the most critical fix the plan didn't specify. Without it, subdivision vertices are invisible to strip triangulation.

**Secondary fix:** The "fix missing constraint endpoints" code (L1043-1063) handles vertices with `cv.rowIdx === j` or `cv.rowIdx === j+1`:
```typescript
if (cv.rowIdx === j) {
    stripBot.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
} else if (cv.rowIdx === j + 1) {
    stripTop.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
}
```

A subdivision vertex with `rowIdx = j` (lower band row) would match `cv.rowIdx === j` and be added to `stripBot`. But it's NOT at the bottom row's T-position — it's between rows. Adding it to `stripBot` would create an incorrect row boundary.

**Fix:** Check whether the vertex has an explicit `t` (is interior) before adding to strip boundaries:
```typescript
if (cv.t !== undefined) {
    // Interior vertex — should already be in stripInteriorVerts.
    // Check and add if missing.
    if (!stripInteriorVerts.some(sv => sv.idx === vIdx)) {
        stripInteriorVerts.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
    }
} else if (cv.rowIdx === j) {
    stripBot.push(...);
} else if (cv.rowIdx === j + 1) {
    stripTop.push(...);
}
```

### Q6: Crossing Constraint Interaction

**Assessment: No re-run needed. Crossing filter naturally handles subdivided edges.**

The `segmentsCross()` filter (L1069-1136) runs per-strip during triangulation, operating on `segConstraints` which is populated from `rowBandEdges` (L1000-1014), which is built from `allChainEdges` (L688-697).

If subdivision updates `chainEdges` (which is aliased as `allChainEdges` at L635), the subdivided edges flow through `rowBandEdges` → `segConstraints` → crossing filter automatically.

**Note:** Catmull-Rom can overshoot. Two originally non-crossing edges might cross after their sub-edges are computed with CatRom intermediate points. The crossing filter handles this — it'll remove the lower-confidence sub-edge. The `edgeConfidence` function (L1090-1100) scores subdivision edges lower (because `cv.pointIdx < 0` → no +2 bonus). This means subdivision edges are preferentially removed when they cross detected-point edges. This is correct behavior.

### Q7: Test Coverage

**Assessment: Tests need additions, not modifications.**

Existing test file: `OuterWallTessellator.test.ts`
- `describe('buildCDTOuterWall — empty chains')` — 10 tests, no chains. Unaffected.
- `describe('buildCDTOuterWall — with chains')` — Tests basic chain insertion, vertex appending, single-point skip, row mapping. These test the pre-subdivision pipeline. They should still pass because subdivision of a 2-point chain produces new intermediate vertices but preserves the original chain vertices.
- `describe('buildCDTOuterWall — steep chain integration')` — Tests micro-row insertion. Unaffected.

**New tests needed:**
1. **Subdivision vertex count**: A chain with N edges should gain 2N subdivision vertices (2 per edge)
2. **Subdivision edge count**: Original N edges → 3N sub-edges
3. **Interior vertex positioning**: Subdivision vertices have `t !== undefined` and `t` is between row boundaries
4. **Non-destruction**: Original chain vertices remain unchanged (same U, rowIdx, pointIdx)
5. **Vertex index consistency**: All subdivision vertex indices in `chainEdges` resolve to valid `chainVertices` entries

---

## Phase 2: Debug Line Instrumentation

**Assessment: TRIVIALLY FEASIBLE.**

The debug line construction at PEC L1156-1180 is a clean, self-contained block. Adding counters requires:

1. **Dropped point counter** — Add `let droppedPoints = 0;` before the loop. Increment before the `continue` at L1169 (`if (fr === undefined || fr < 0 || fr >= finalT.length)`).

2. **Large Δu counter** — After building `remapped`, iterate consecutive pairs and count where `|remapped[i+1][0] - remapped[i][0]| > 0.1`.

3. **Console.log** — After the loop, log both counters.

No type changes, no structural changes, no downstream impacts. ~10 lines of code.

---

## Implementation Concerns

### C1: The `interiorByBand` Fix Is Critical
Without changing L611 to iterate `allChainVertices` instead of `companionVertices`, subdivision vertices are orphaned — they exist in the vertex buffer but never appear in any CDT. The mesh would reference vertex indices that don't participate in triangulation. This would manifest as:
- Chain constraints silently dropped (CDT doesn't know about intermediate vertices)
- Possible non-manifold geometry if dedup picks up these orphaned vertices

### C2: Performance — CatRom Computation Cost
Each chain edge produces 2 CatRom evaluations (4-point weighted sum each). For a typical export with ~5000 chain edges, this adds 10,000 FP multiplications — negligible. The real cost is the increased vertex/edge count: 3× more chain edges for the crossing filter (O(n²) within each strip). At density ≤5 constraints per strip, this is fine. At density >20, the quadratic cost becomes noticeable.

### C3: Seam-Crossing Edges
The existing code skips seam-crossing edges (|Δu| > SEAM_THRESHOLD = 0.4). Catmull-Rom with seam-adjacent control points could produce U-values that wrap around (e.g., control points at u=0.95, 0.98, 0.02, 0.05 — CatRom would produce u≈0.5 instead of u≈0.0). The subdivision function must handle this:
- Mirror extension at chain boundaries already handles first/last points
- The seam threshold check happens BEFORE edge recording (L409), so seam-crossing edges are never in `chainEdges`. But CatRom control points from adjacent (non-crossing) edges might be near the seam. Need to clamp/wrap CatRom output to [0, 1-ε].

### C4: `fullChain` Order Matters for CatRom
The `fullChain` array includes both original and interpolated (gap-fill) vertices. CatRom subdivision would treat interpolated gap-fill points as real control points. This is actually desirable — the gap-fill points are linear interpolations, and CatRom will gently curve through them, improving path quality. No special handling needed.

---

## Suggested Implementation Order

### Changeset 1: Phase 2 (Debug Instrumentation) — LOW RISK
1. Add counters to PEC L1156-1180
2. No structural changes, no test impact
3. Provides diagnostic data for verifying Phase 1 effects

### Changeset 2: Phase 1 (Catmull-Rom Subdivision) — MEDIUM RISK
**Step 2a:** Add `subdivideFullChain()` function (pure function, testable in isolation)
- Input: `fullChain: ChainVertex[]`, `activeTPositions: Float32Array`, `nextVertexIdx: { value: number }`
- Output: `{ subdivided: ChainVertex[], newVertices: ChainVertex[] }`
- Unit test this function in isolation before integration

**Step 2b:** Integrate into chain loop
- Call `subdivideFullChain()` after `fullChain` is built (after L400)
- Push new vertices to `chainVertices`
- Replace `fullChain` content with subdivided version
- Edge recording at L404 now records subdivided edges

**Step 2c:** Fix `interiorByBand` construction
- Change L611 to iterate `allChainVertices` instead of `companionVertices`
- Guards: `cv.t === undefined` filter still applies — only vertices with explicit `t` become interior

**Step 2d:** Fix constraint endpoint handling
- Update "fix missing constraint endpoints" code (L1043-1063) to handle interior constraint endpoints (vertices with `cv.t !== undefined`)

**Step 2e:** Integration test
- Run full export on a test pot with feature chains
- Verify chain enforcement rate doesn't drop
- Verify vertex count increase matches expectations (2 new vertices per original chain edge)

---

## Test Strategy

### Unit Tests (new)
1. `subdivideFullChain` with 3-point chain → verify 4 subdivision vertices, 6 sub-edges
2. `subdivideFullChain` with 2-point chain → verify mirror extension handles boundary
3. Subdivision vertex positions: U is CatRom-interpolated, T is lerped between row boundaries
4. Subdivision near seam: U values clamped to [0, 1-ε]

### Integration Tests (new)
5. `buildCDTOuterWall` with subdivided chain produces more chain edges than original
6. Chain enforcement % doesn't regress (≥ current rate)
7. All subdivision vertices have `t !== undefined`
8. `interiorByBand` maps contain subdivision vertices

### Regression Tests (existing — should pass unchanged)
9. All existing `OuterWallTessellator.test.ts` tests
10. All existing PEC tests

---

## Questions for Generator & Verifier

1. **Insertion point override:** The plan specified "after chain edge recording, before companion generation." My analysis shows it must be "after fullChain construction, before edge recording" (inside the loop). Do you concur, or is there a reason the plan deliberately chose the later position?

2. **Subdivision count per edge:** The plan says "2 Catmull-Rom intermediate UV points per edge." This produces 3 sub-edges per original edge, tripling chain edge count. Is 2 the right number? τ=0.5 (Catmull-Rom tension) is standard, but should we expose this as a config parameter?

3. **Interaction with SG filter:** The Verifier noted the existing 2-pass Savitzky-Golay at L1043-1044 is already optimal. Should CatRom subdivision run on pre-SG or post-SG chain data? The current code runs SG during feature detection (upstream), so `fullChain` already has smoothed U-values. CatRom would subdivide already-smoothed paths. Is this the intended behavior?

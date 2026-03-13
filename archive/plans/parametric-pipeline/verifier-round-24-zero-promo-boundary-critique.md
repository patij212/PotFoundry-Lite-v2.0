# Verifier Round 24 — Critique of Zero-PROMO Boundary Integration Proposal

Date: 2026-03-06

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's proposal is mathematically sound and targets the correct root cause. Setting `PROMO_EPSILON = 0` and routing chain vertices to boundary arrays eliminates the structural UV/3D mismatch responsible for 55.6% sliver triangles. The analysis is thorough, the option evaluation is well-reasoned (Options B/C/D correctly rejected), and the downstream adjustments are mostly correct.

Three amendments required. One is a **CRITICAL** scoping bug that would cause a compile error. One is a **WARNING** about the same-row constraint filter being understated as merely "redundant" when it is in fact **mandatory** for cdt2d stability. One is a **NOTE** about companion budget oversizing.

---

## Critique

### C1 [CRITICAL]: Variable Scoping Bug — `botModified`/`topModified` Not In Scope for Change 3

**Generator's claim**: Change 3 (batch2Remap rescue routing) sets `botModified = true` / `topModified = true` to trigger the re-sort at lines ~1531-1532.

**Actual behavior**: The variables `botModified` and `topModified` are declared at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1503):
```typescript
let botModified = false, topModified = false;
```
This declaration is at line 1503, inside the "Fix missing constraint endpoints (Sub-problem B)" block. The batch2Remap rescue code (Change 3's target) is at lines 1480-1496, which is **BEFORE** line 1503. Setting `botModified = true` at line ~1490 references a variable that doesn't exist yet in scope.

**Impact**: TypeScript compile error. The Executioner would be blocked immediately.

**Evidence**: Reading lines 1480-1503:
- Lines 1480-1496: batch2Remap rescue loop (`for (const [v0, v1] of segConstraints)`)
- Line 1503: `let botModified = false, topModified = false;`

**Required fix**: Move the `let botModified = false, topModified = false;` declaration to BEFORE the rescue block (e.g., line ~1478, just before the `// ── R22 Amendment A1` comment). Both Change 3 (rescue) and Change 4 (missing endpoints) can then share the same flags and the re-sort at line 1531-1532 covers both.

---

### C2 [WARNING]: Same-Row Constraint Filter Is MANDATORY, Not Just "Redundant"

**Generator's claim**: Same-row chain constraints are "redundant when both endpoints are boundary vertices (the boundary edge sequence already enforces connectivity)." The filter is presented as an optimization.

**Actual behavior**: The filter is not just redundant — it is **mandatory** for cdt2d stability. Here's why:

With PROMO=0, two chain vertices A (u=0.50) and C (u=0.52) on the same row are both at T=tBot. If there's an intermediate boundary vertex B (u=0.51, T=tBot) — a grid vertex or shadow vertex — in stripBot, the constraint edge A→C passes **directly through** vertex B.

`cdt2d`'s monotone sweep (`lib/monotone.js`) handles constraint edges by creating EVENT_START and EVENT_END events. For the A→C constraint:
1. EVENT_START(A, C) at x=u_A
2. EVENT_POINT(B) at x=u_B (between events)
3. EVENT_END(C, A) at x=u_C

At step 2, `testPoint(hull, B)` calls `orient(A, C, B)`. Since A, B, C are collinear, `orient = 0`. In `addPoint`, `bsearch.lt` returns hulls where orient < 0, `bsearch.gt` returns hulls where orient > 0. For orient = 0, **neither includes the hull** bounded by A→C. So B is not added to any hull and potentially becomes disconnected.

Additionally, the collinear boundary edges A→B and B→C (from the boundary edge sequence in ChainStripTriangulator lines 213-217) are also constraint edges. These overlap with A→C, creating degenerate edge configurations where three collinear edges share the same line through three points. `cdt2d`'s monotone sweep processes these as simultaneous EVENT_START events at the same point with `orient` tiebreaker = 0, leading to arbitrary event ordering.

This is not a theoretical concern — it's a structural hazard that WILL occur whenever two same-row chain vertices have any boundary vertex between them in U-space. Given ~558 grid columns and ~20 chains, this scenario is virtually guaranteed.

**Counterexample**: Chain 5 on row 50 has vertices at u=0.300 and u=0.320. Grid columns at u=0.303, u=0.306, u=0.309, u=0.312, u=0.315, u=0.318 are all boundary vertices between them. The same-row constraint creates a degenerate 6-through-vertex configuration.

**Impact on verdict**: Change 5 is CORRECT as proposed. The critique elevates its importance from "optimization" to "safety-critical." If the Executioner were to deprioritize or remove the filter, cdt2d crashes or garbage triangulations would result.

**The sweep fallback (try/catch) provides a safety net** — if cdt2d throws, the band falls back to sweep triangulation. But we should not rely on error recovery for a known structural problem.

---

### C3 [NOTE]: T-Ring Budget Is Oversized After Fraction Reduction

**Generator's claim**: Open Question 4 asks whether `MAX_TRING_PER_BAND = 24` should be reduced to 18.

**Analysis**: With 4 fractions × 3 shells × 2 sides = 24, the old budget was exactly saturated. With 3 fractions × 3 shells × 2 sides = 18, the budget can be reduced. But leaving it at 24 is harmless — the `tRingEmitted >= MAX_TRING_PER_BAND` check simply never triggers. The budget is a ceiling, not a target.

**Recommendation**: Leave at 24. No behavioral change. The Generator can optionally reduce in a follow-up cleanup pass. Not blocking.

---

## Claim-by-Claim Verification

### Claim 1: "PROMO_EPSILON = 0 eliminates the UV/3D mismatch" — CONFIRMED

**Verification path**: At [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L128), `PROMO_EPSILON = 0.20`. All downstream code computes:
- `tBot + PROMO_EPSILON * tGap` → with PROMO=0, this is `tBot`
- `tTop - PROMO_EPSILON * tGap` → with PROMO=0, this is `tTop`

Chain vertices in the vertex buffer store `T = tRow` (assigned at line ~934: `vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx]`). For botRow chains, `tRow = activeTPositions[j] = tBot`. For topRow chains, `tRow = activeTPositions[j+1] = tTop`.

With PROMO=0: CDT places chain vertices at tBot/tTop. Vertex buffer stores tBot/tTop. **UV matches 3D. Zero-height slivers eliminated.**

### Claim 2: "Chain vertices flow into stripBot/stripTop alongside grid and shadow vertices" — CONFIRMED

**Verification path**: The loop at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1316-L1358) processes `botRow` entries. The `if (sv.isChain)` branch currently pushes to `stripInteriorVerts`. The proposed change pushes to `stripBot`. Since `botRow` is built by `buildMergedRow` (sorted by U), chain vertices are already interleaved at their correct U positions. The boundary coarsening check (`if (sv.u - lastKeptBotU > MAX_BOUNDARY_EDGE_U)`) only applies to non-chain grid vertices — chain vertices are processed before the `else` branch.

Adding `lastKeptBotU = sv.u` after pushing a chain vertex to stripBot is a **new behavior** (not present in current code). This is correct: it prevents the next grid vertex from creating an unnecessarily long boundary gap near the chain vertex. Consistent with shadow vertex behavior (line 1352: `lastKeptBotU = sv.u; // shadows contribute to spacing`).

### Claim 3: "D-Radical original and duplicate both at tRow — no jagging" — CONFIRMED

**Verification path**: D-Radical duplicate vertex creation at line ~949:
```typescript
vertices[dupIdx * 3 + 1] = vertices[cv.vertexIdx * 3 + 1]; // copies T from original
```
Original stores `T = tRow` (line ~934). Duplicate copies this → duplicate also has `T = tRow`.

With PROMO=0:
- In band [j, j+1]: original chain (rowIdx=j) goes to stripBot. CDT places at T=tBot=tRow. ✓
- In band [j-1, j]: duplicate goes to stripTop. CDT places at T=tTop=tRow. ✓

Both agree on tRow. No micro-jagging (contrast with R23 which set different promotedT for original vs duplicate).

### Claim 4: "cdt2d handles boundary-to-boundary diagonal constraints correctly" — CONFIRMED

**Verification path**: I read the full cdt2d pipeline at `node_modules/.vite/deps/cdt2d.js`:

1. **Monotone triangulation** (line 671): The sweep-line processes events sorted by x-coordinate. A constraint edge from (u_a, tBot) to (u_b, tTop) creates EVENT_START at the left endpoint and EVENT_END at the right endpoint. The sweep splits/merges partial hulls correctly for any diagonal crossing the strip interior, regardless of whether endpoints are on the convex hull. The algorithm doesn't distinguish "interior" from "boundary" points.

2. **Delaunay flip** (line 1131): After monotone triangulation, `delaunayFlip` runs. The `testFlip` function (line 1139) checks `triangulation.isConstraint(a, b)` — constraint edges are NEVER flipped. Boundary-to-boundary diagonals marked as constraints are preserved.

3. **Filter** (line 1217): With `{exterior: true}`, all triangles are returned (no filtering by interior/exterior). The centroid filter in ChainStripTriangulator handles bounds checking.

**Cross-row constraint diagonals between boundary vertices are valid CDT constraints.** The monotone sweep handles them, the Delaunay refinement preserves them, and the filter passes them through.

### Claim 5: "Same-row filter condition `cv0.t === undefined && cv1.t === undefined && cv0.rowIdx === cv1.rowIdx`" — CONFIRMED CORRECT

**Verification path**: Chain vertices with `t === undefined` are row-boundary vertices (placed at grid row T positions). Chain vertices with `t !== undefined` are explicit-T interior vertices (companions, subdivision). The filter correctly targets only row-boundary-to-row-boundary same-row constraints.

Constraints involving explicit-T vertices are NOT filtered (the `cv.t === undefined` check excludes them). These are valid interior constraints regardless of PROMO value.

**Downstream consumer check**: 
- `segConstraints` feeds into `triangulateChainStrip()` — only consumer of filtered constraints. ✓
- `allChainEdges` is used by edge verification (line 1764) and `buildFeatureEdgeGraphFromChainEdges()` — neither is affected by the `segConstraints` filter. The filter only applies WITHIN the strip assembly loop, not to the global edge set. ✓
- `bandConstraintEdges` is the per-band edge set that `segConstraints` is built from. The filter is applied to `segConstraints` after `bandConstraintEdges` is populated. No upstream impact. ✓

### Claim 6: "Companion fractions [0.25, 0.50, 0.75] create even band subdivision" — CONFIRMED WITH NOTE

**Verification path**: At [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L716), the current fractions `[0.10, 0.15, 0.85, 0.90]` emit T-ring companions at 4 T-levels. The proposed `[0.25, 0.50, 0.75]` emits at 3 T-levels.

With PROMO=0.20, the [0.10, 0.15] fractions filled the gap between boundary (T=0) and promoted chain (T=0.20). Without PROMO, these create ultra-thin sub-layers of height `0.10 * tGap * H ≈ 0.023mm` with aspect ~40:1 — **actively harmful**. The new fractions create sub-layers of height `0.25 * tGap * H ≈ 0.058mm`, which is the minimum of the three layers. Worst sub-layer aspect: `0.91 / 0.058 ≈ 16:1`. **Acceptable.**

**T-ring vs T-ladder overlap check**: T-ladder uses `nTLevels = 2`, producing T-positions at `k/(nT+1) * tGap` for varying nT per shell. Common T-ladder positions: ~0.33, ~0.67 for nT=2. The T-ring positions (0.25, 0.50, 0.75) are distinct from T-ladder positions (0.33, 0.50, 0.67). The 0.50 position MAY overlap with a T-ladder position, but the companion dedup logic (using `COMPANION_DEDUP_THRESHOLD` spatial bucketing at line ~773) handles this. No concern.

### Claim 7: "getUV is already consistent — no code change needed" — CONFIRMED

**Verification path**: Current `getUV` implementation at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1545):
```typescript
const getUV = (vIdx: number): [number, number] => {
    return [vertices[vIdx * 3], vertices[vIdx * 3 + 1]];
};
```
This reads U and T from the vertex buffer. With PROMO=0:
- Chain vertices in vertex buffer store T=tRow
- CDT places chain vertices at T=tBot (for botRow) or T=tTop (for topRow)
- tBot=tRow for botRow chains, tTop=tRow for topRow chains

So `getUV` returns T=tRow, which equals the CDT T for these vertices. **Consistent.** Crossing detection tests at the correct positions.

---

## Open Questions — Answered

### Q1: Does `cdt2d` handle boundary constraint diagonals correctly?

**YES.** Verified by reading the full `cdt2d` pipeline. See Claim 4 verification above. The monotone sweep handles arbitrary diagonal constraints regardless of endpoint positions. The Delaunay flip preserves constraint edges. The `{exterior: true}` option returns all triangles. Cross-row constraints connecting bot boundary to top boundary are valid interior diagonals that `cdt2d` handles correctly.

### Q2: Does downstream code depend on same-row chain constraints?

**NO.** Traced all consumers:
- `segConstraints` → `triangulateChainStrip()` — CDT doesn't need same-row constraints; boundary edge sequence handles adjacency
- `allChainEdges` → `FeatureEdgeGraph` — built from the global edge set, not `segConstraints`. Unaffected by filter
- `allChainEdges` → edge verification — same-row edges between boundary vertices are enforced via boundary edges A→B and B→C, though the direct edge A→C may not exist as a mesh edge when intermediate vertices are present. This is already the case today and is tracked separately as `missingSameRow` (line 1801)

### Q3: Are there tests that depend on specific companion positions?

**Low risk.** The companion system's outputs are verified by aggregate metrics (companion count, CDT quality stats). No tests hard-code specific T-ring fractions. The diagnostic log reports total companion counts, which will decrease (~265K vs ~353K). Tests asserting minimum companion counts should be checked by the Executioner.

### Q4: Should MAX_TRING_PER_BAND be reduced?

**No.** See C3 above. Leave at 24. Harmless ceiling. Clean up optionally later.

### Q5: Is boundary coarsening interaction beneficial?

**YES, slightly.** Chain vertices resetting `lastKeptBotU` causes nearby grid vertices to be DROPPED (if within `MAX_BOUNDARY_EDGE_U ≈ 0.0029`). This is correct: the chain vertex already provides coverage at that U location. Grid vertices very close to chains are redundant. The behavior mirrors shadow vertex handling (line 1352). Net effect: slightly denser boundary vertices near features (chain vertex itself), slightly sparser immediately after. **No concern.**

---

## Bugs Found

### B1 [CRITICAL]: Scoping Bug in Change 3 (see C1)

`botModified`/`topModified` referenced before declaration. Compile error. Fix: move declaration to line ~1478.

### B2 [NOTE]: Edge Verification Will Report More `missingSameRow`

With same-row constraints filtered from CDT, same-row chain edges are enforced only via boundary edges (A→B→C, not A→C directly). The edge verification at line 1764 checks for direct A→C edges in the mesh edge set. These will show as "missing" more often than today. This is cosmetic — the geometry is correct (boundary handles adjacency) — but the diagnostic may be misleading. The Executioner should consider adjusting the edge verification to skip same-row edges, or add a note to the diagnostic output.

### B3 [NOTE]: Rescue Code Path Interaction

Change 3 routes rescued batch2Remap vertices to stripBot/stripTop. Change 4 routes rescued missing-endpoint chain vertices to stripBot/stripTop. Both use the shared `botModified`/`topModified` flags (after fix B1). The re-sort at line 1531 correctly handles both. No interaction bug, but the Executioner should verify order independence — both rescue passes may add to the same boundary, and the single re-sort must produce correct U-ordering for both.

---

## Accepted Items

| Item | Status | Evidence |
|------|--------|----------|
| Change 1: PROMO_EPSILON = 0 | ✅ ACCEPTED | Root cause correctly identified. Single constant change. |
| Change 2: Bot/top chain routing | ✅ ACCEPTED | Chain vertices interleaved by U-order in buildMergedRow. Boundary edges connect consecutive vertices. lastKeptBotU update is correct new behavior. |
| Change 3: Batch2 rescue routing | ✅ ACCEPTED WITH FIX | Correct logic but scoping bug (C1). Move flag declaration. |
| Change 4: Missing endpoint rescue routing | ✅ ACCEPTED | Within existing botModified/topModified scope. Correct. |
| Change 5: Same-row constraint filter | ✅ ACCEPTED (CRITICAL SAFETY) | Not just redundant — mandatory for cdt2d stability (C2). |
| Change 6: T-ring fractions | ✅ ACCEPTED | [0.25, 0.50, 0.75] prevents harmful ultra-thin sub-layers. |
| Change 7: getUV consistency | ✅ ACCEPTED | No-op in code, confirmed consistent in semantics. |

---

## Amendments Required

### Amendment A1: Move variable declaration (CRITICAL)

Move `let botModified = false, topModified = false;` from line 1503 to before the batch2Remap rescue block (~line 1478). Without this, Change 3 produces a compile error.

### Amendment A2: Elevate same-row filter to safety-critical (WARNING)

Add a comment in the code marking the same-row constraint filter as mandatory, not optional:
```typescript
// CRITICAL: Same-row constraints are collinear with boundary. With PROMO=0,
// these create through-vertex constraint edges that cause cdt2d instability.
// This filter is MANDATORY, not an optimization. See Verifier R24 C2.
if (cv0.t === undefined && cv1.t === undefined && cv0.rowIdx === cv1.rowIdx) {
    continue;
}
```

### Amendment A3: Edge verification adjustment (NOTE, non-blocking)

After the same-row constraint filter is applied, the edge verification at line 1764 will report more `missingSameRow` edges. The Executioner should consider adding a note to the diagnostic output explaining this is expected and benign, or skip same-row edges in the verification count. Non-blocking — can be deferred.

---

## Implementation Conditions for the Executioner

1. Apply Changes 1-7 as proposed, with Amendment A1 (move flag declaration) applied first
2. Apply Amendment A2 (comment clarifying filter is safety-critical)
3. Run full test suite — expect:
   - `maxAspect3D` to drop by 4+ orders of magnitude
   - `violations(>4:1)` to drop from ~55% to ~15-20%
   - `aspectRejects` edge flips to drop to near-zero
   - T-ring companion count to decrease (~25%)
   - `missingSameRow` count may increase (cosmetic, not a regression)
4. Verify no compile errors (especially the scoping fix)
5. Run a visual export test — confirm no visible seam gaps or feature edge jagging

---

## Validation Protocol

### Must-Pass Criteria

| Criterion | Metric | Expected |
|-----------|--------|----------|
| No compile errors | `tsc --noEmit` | Zero errors |
| CDT doesn't crash | `sweepFallbacks` | Same or fewer than R22.2 baseline |
| Slivers eliminated | `maxAspect3D` | < 1,000 (vs 2.4M baseline) |
| Sliver fraction reduced | `violations(>4:1)` | < 30% (vs 55.6% baseline) |
| Feature edges preserved | `primaryEnforced / primaryTotal` | ≥ current ratio |
| No watertightness regression | `non-manifold` count | ≤ 433 (R22.2 baseline) |
| No visual artifact | Visual inspection | No jagging, no seam gaps |

### Stretch Goals (desirable but non-blocking)

| Goal | Target |
|------|--------|
| maxAspect3D < 100 | Generator's prediction |
| violations(>4:1) < 20% | Generator's prediction |
| avgAspect3D < 10 | Generator's prediction |

---

## Final Assessment

The Zero-PROMO Boundary Integration is the right fix. R23 tried to move 3D to match CDT; R24 correctly moves CDT to match 3D. The Generator's analysis is thorough and the six downstream adjustments are well-reasoned. The one critical bug (scoping) is trivial to fix. The same-row constraint filter is more important than the Generator realized — it's not optional, it's safety-critical.

**This proposal should proceed to implementation with the three amendments above.**

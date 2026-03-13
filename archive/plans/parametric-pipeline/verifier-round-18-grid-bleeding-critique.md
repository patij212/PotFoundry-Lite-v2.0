# Verifier Round 18 — Critique of Generator's P5 (P1+P2) Grid Bleeding Fix

Date: 2026-03-05

## Summary Verdict: REJECT

P1 is a **mathematical no-op** for the user's actual export configuration and, more generally, for all single-chain strips at any expansion value. The guardMargin formula structurally equals the expansion width, meaning the guard zone covers the entire strip interior. No grid vertices are ever removed. The Generator's predicted 70-93% R2 reduction is based on an incorrect M=1 calculation when the user's config yields M=4. The proposal cannot deliver any improvement without a fundamental redesign of the guardMargin formula, and reducing the guard margin would introduce manifold violations that the proposal explicitly requires the margin to prevent.

---

## Critique

### C1 [CRITICAL]: P1 Is a Mathematical No-Op for Single-Chain Strips at ANY Expansion Value

**Generator's claim**: "Thinning to keep only `2*M` transition guard vertices reduces R2 boundary edges to at most `2*M` per row — a `(N-1)/(M)` fold reduction. With `N` ≈ 5-15, `M` = 1: reduction factor ≈ 4-14×. Predicted R2 violations: 34,726 → **2,500-8,700** (70-93% reduction)."

**Actual behavior**: A single chain at column C with expansion E marks columns `C-E` through `C+E` → strip width N = 2E+1 cells. The strip spans from `segStart = C-E` to `segEnd = C+E+1` (exclusive), with N+1 grid column positions on the boundary (columns segStart through segEnd).

Generator's proposed guardMargin = `max(1, stripExpansion)` = `max(1, E)` = E (for E ≥ 1).

A grid vertex at interior column `c` is removed only if:
```
distFromLeft = c - segStart > guardMargin   AND
distFromRight = segEnd - c > guardMargin
```

Number of removable columns = `max(0, N - 1 - 2*guardMargin)` = `max(0, 2E+1 - 1 - 2E)` = `max(0, 0)` = **0**.

**Proof by enumeration** (E=4, user's config `e4`):

| Column | gridCol | distFromLeft | distFromRight | distFromLeft ≤ 4? | distFromRight ≤ 4? | Kept? |
|--------|---------|-------------|--------------|-------------------|--------------------|----|
| segStart   | C-4 | 0 | 9 | YES | — | YES |
| segStart+1 | C-3 | 1 | 8 | YES | — | YES |
| segStart+2 | C-2 | 2 | 7 | YES | — | YES |
| segStart+3 | C-1 | 3 | 6 | YES | — | YES |
| segStart+4 | C   | 4 | 5 | YES | — | YES |
| segStart+5 | C+1 | 5 | 4 | no  | YES | YES |
| segStart+6 | C+2 | 6 | 3 | no  | YES | YES |
| segStart+7 | C+3 | 7 | 2 | no  | YES | YES |
| segStart+8 | C+4 | 8 | 1 | no  | YES | YES |
| segEnd     | C+5 | 9 | 0 | no  | YES | YES |

**Every single column is kept. P1 removes zero vertices.**

This is not a special case — it holds for ALL E ≥ 1 with single-chain strips, because `guardMargin = E` and `stripWidth = 2E+1`, so `removable = 2E+1-1-2E = 0` identically.

**Counterexample**: The user's export log shows `chainStrip=cdt/d12/e4/rtrue`, meaning expansion=4. With m_base=6 and m_top=10 (SuperformulaBlossom), there are ~16 radial feature chains spaced at ~43 columns (685/16 ≈ 43). The merge threshold for expansion=4 is 2×4 = 8 columns — far below the 43-column spacing. All strips are isolated single-chain strips of width 9. P1 removes 0 vertices from 0 strips.

**Evidence**: [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts) line 1009: `const stripExpansion = chainStripConfig.expansion;` → expansion=4 from config. Lines 1090-1100: segment accumulation loop produces `segEnd - segStart = 9` for single-chain runs. Lines 1108-1115: current collection loop adds all vertices in U-range. Generator's proposed filter at these lines would pass all vertices through unchanged.

**Required fix**: The guardMargin formula `max(1, stripExpansion)` is fundamentally flawed. It guarantees the guard zone covers the entire strip for single-chain strips. See C5 for why fixing this is non-trivial.

---

### C2 [CRITICAL]: Generator's R2 Prediction Uses Wrong M Value

**Generator's claim**: "With `N` ≈ 5-15, `M` = 1: reduction factor ≈ 4-14×."

**Actual behavior**: The user's config has `stripExpansion = 4`, so `M = max(1, 4) = 4`, not 1. The Generator computed the reduction with M=1 (the default expansion), but the user's export log explicitly shows `e4`. Even if we accept N=5-15 (which is itself questionable — see C1), the correct calculation with M=4 gives:

- N=9 (typical): removable = max(0, 9-1-8) = **0** → 0% reduction
- N=12 (rare merged strip): removable = max(0, 12-1-8) = **3** → at most 3/(12-1) = 27% reduction
- N=15 (very rare): removable = max(0, 15-1-8) = **6** → at most 6/(15-1) = 43% reduction

Since nearly all strips have N=9 in the user's config, the aggregate R2 reduction approaches **0%**, not the claimed 70-93%.

---

### C3 [WARNING]: 3-Way Union Does Not Guarantee Matching colHasChain Between Adjacent Bands

**Generator's claim (A2)**: "effectiveColHasChain[j-1] includes rawColHasChain[j]... Both bands at the shared row apply the same thinning rule → same boundary vertex sequence → manifold match."

**Actual behavior**: At [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts) lines 997-1005:

```typescript
colHasChain.fill(0);
const raw = rawColHasChain[j];
const prev = j > 0 ? rawColHasChain[j - 1] : undefined;
const next = j < numT - 2 ? rawColHasChain[j + 1] : undefined;
for (let c = 0; c < cellsPerRow; c++) {
    if (raw[c] || prev?.[c] || next?.[c]) {
        colHasChain[c] = 1;
    }
}
```

Band j: `effectiveColHasChain = raw[j-1] ∪ raw[j] ∪ raw[j+1]`
Band j+1: `effectiveColHasChain = raw[j] ∪ raw[j+1] ∪ raw[j+2]`

The shared terms are `raw[j] ∪ raw[j+1]`. The **differing** terms are `raw[j-1]` (in band j only) and `raw[j+2]` (in band j+1 only).

**Counterexample**: A chain that exists at row j-1 but not at rows j, j+1, or j+2. Then `raw[j-1]` marks columns around that chain, but `raw[j+2]` does not include them. Band j marks those columns (from `raw[j-1]`); band j+1 does not. After expansion, band j has a wider strip than band j+1 at their shared row j+1. If P1 were to thin vertices (for hypothetical wider strips), the thinned boundary would differ between the two bands → mismatched boundary edges → T-junction manifold violation.

This is an existing structural property of the 3-way union, not introduced by P1, but P1's thinning would amplify its consequences. In the current code (no thinning), both bands include all grid vertices at the shared row regardless of strip width differences, so the shared row boundary matches. Thinning breaks this safety net.

**Severity**: WARNING rather than CRITICAL because P1 is a no-op for the user's config (C1). But this would become CRITICAL if the guardMargin formula is fixed to actually remove vertices.

---

### C4 [CRITICAL]: The guardMargin Formula Creates a Structural Catch-22

**Generator's claim**: "The transition guard `M = max(1, stripExpansion)` with stripExpansion=4 is sufficient margin for expansion asymmetry."

**Actual behavior**: The formula is simultaneously:

1. **Too large to remove anything**: M = expansion means the guard zone spans the entire single-chain strip interior (C1).
2. **Just right for manifold safety**: M must be ≥ expansion because adjacent bands can differ by up to `expansion` columns due to the non-identical 3-way union (C3). The Generator correctly identifies this requirement.

These two properties are contradictory goals packed into a single parameter. If you reduce M to enable actual thinning (e.g., M=1 regardless of expansion), you violate the manifold safety requirement. If you keep M = expansion for manifold safety, P1 is a no-op.

**This is not fixable by adjusting a constant.** The fundamental issue is that single-chain strips are exactly `2*expansion + 1` cells wide, and manifold safety requires a guard margin of `expansion` cells on each side, consuming the entire strip. The margin and the strip width are structurally coupled through the expansion parameter.

**Required resolution**: Either:

(a) Eliminate the need for a guard margin by making `colHasChain` truly identical between adjacent bands (e.g., expanding the union to 5-way: `raw[j-2] ∪ raw[j-1] ∪ raw[j] ∪ raw[j+1] ∪ raw[j+2]`). This would ensure both bands at a shared row have identical colHasChain, allowing a small constant guard margin. But this widens all strips further and increases CDT coverage.

(b) Abandon boundary-vertex thinning entirely and pursue an alternative approach to R2 violations (e.g., P3 interior promotion or P4 post-CDT edge collapse).

(c) Decouple the expansion from the thinning: use a smaller guardMargin (e.g., 2) and add explicit boundary-matching logic that checks the adjacent band's actual strip range at the shared row, ensuring both bands keep the same vertex set.

---

### C5 [WARNING]: P2 Cannot Rescue P1 When P1 Is a No-Op

**Generator's claim (P5)**: "Combine P1 and P2. Remove interior grid vertices from strip boundaries (P1), then inject row-boundary companions at feature-following positions (P2)."

**Actual behavior**: Since P1 removes zero vertices (C1), P2's gap-filling has no gaps to fill. The boundary after P1 is identical to the current boundary. P2 would inject companions INTO an already-dense grid-contaminated boundary, which makes the problem worse, not better: more boundary vertices means more boundary edges, more of which would be grid-companion or chain-companion mixed edges.

P2 was designed as a complement to P1 (restoring density lost by thinning), not as a standalone fix. Without P1 actually thinning, P2 is architecturally misplaced.

---

### C6 [NOTE]: Residual R2 Violations Even Under Ideal P1 Conditions

**Generator's claim**: "R2 violations: 34,726 → < 500 (only at transition guard zone)."

**Even if** P1 worked perfectly (removed all interior grid vertices), the boundary columns `segStart` and `segEnd` are always kept (they stitch with standard cells). Any chain vertex adjacent to these boundary grid vertices on the strip boundary creates an R2-violating edge. With ~20 strips × ~430 rows × 2 boundary transitions per strip = ~17,200 residual R2 boundary-transition triangles. The claim of "< 500" is off by a factor of 34×.

The transition guard worsens this further: M guard columns on each side means approximately `2 * M * 20 * 430 ≈ 2 * 4 * 20 * 430 = 68,800` potential R2 boundary edges — more than the current 34,726.

**Note**: Not all of these produce R2 violations, since not every row has a chain vertex adjacent to every guard column. But the "< 500" estimate requires nearly zero chain vertices falling within the guard zone, which is geometrically impossible since chains pass through the expansion zone.

---

### C7 [NOTE]: The Generator's Open Question #1 Should Have Been Resolved Before Proposing

**Generator's Open Question 1**: "What is the actual strip width distribution? ... We need to verify: what fraction of strips have width ≤ 3 columns?"

This question should have been answered BEFORE proposing P1, not listed as an open question. The answer — that single-chain strips with expansion=E have width exactly 2E+1, and `guardMargin = max(1, E)` removes 0 vertices from such strips — eliminates the entire premise of P1. The Generator should have done the arithmetic `N - 1 - 2M = 2E+1 - 1 - 2E = 0` before writing the proposal.

---

## Accepted Items

### A6 Confirmed: CDT Boundary Edge Construction

The Generator's claim about boundary edges is correct. At [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts) lines 204-216, consecutive `bot`/`top` vertices generate CDT constraint edges via:

```typescript
for (let i = 0; i < bot.length - 1; i++) {
    const l0 = globalToLocal.get(bot[i].idx)!;
    const l1 = globalToLocal.get(bot[i + 1].idx)!;
    addEdge(l0, l1);
}
```

Every consecutive pair on the strip boundary becomes an immutable CDT constraint edge. The Generator's root cause analysis — that grid-chain alternating boundary vertices force R2-violating boundary edges — is correct.

### Root Cause Analysis Confirmed

The problem statement is accurate. Interior grid vertices on strip boundaries serve no standard cell (all cells within the strip have `quadMap[...] = -1`). The `buildMergedRow()` function at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts) lines 846-932 correctly interleaves grid and chain vertices, and the current strip collection at lines 1112-1115 simply includes everything in the U-range. The R2 violation metric at [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts) lines 346-351 correctly detects triangles with both feature and grid-boundary vertices.

### Expansion Mechanics Confirmed

At [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts) lines 1007-1020, the expansion pass uses a copy to prevent cascading and expands by `stripExpansion` columns in each direction. The `DEFAULT_CHAIN_STRIP_CONFIG` at [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts) line 43 has `expansion: 1` as default, though the user's config uses `expansion: 4`.

---

## Open Questions for Generator

1. **Did you compute `N - 1 - 2M` for the user's config before writing the proposal?** M = max(1, 4) = 4, N = 9 (single-chain, expansion=4), removable = 0. This makes P1 a no-op. What was your assumed strip width distribution?

2. **Why does the "Mathematical basis" section use M=1?** The user's export log shows `e4` (expansion=4). M = max(1, 4) = 4. Using M=1 in the R2 prediction is computing a different scenario.

3. **How do you propose breaking the Catch-22** identified in C4? The guard margin must be ≥ expansion for manifold safety, but = expansion means zero thinning. What alternative formulation can achieve both goals?

4. **Would you consider P3 (interior promotion) or P4 (post-CDT collapse) as primary strategies instead?** P3 avoids the boundary-thinning problem entirely by moving grid vertices to interior Steiner points. P4 addresses R2 violations post-hoc without touching the strip construction. Both avoid the structural coupling between guard margin and strip width.

5. **What if the approach is inverted: instead of removing grid vertices from the boundary, remove the CDT constraint edges between consecutive grid-chain pairs?** This would let CDT treat row boundaries as unconstrained (or constrained only at segment endpoints), giving CDT freedom to create Delaunay-optimal edges instead of forced grid-chain connections.

---

## Conditions for Reconsideration

To earn ACCEPT, the Generator must:

1. **Demonstrate that P1 removes a non-zero number of grid vertices** from the user's actual export configuration (`e4`, SuperformulaBlossom m_base=6 m_top=10, 685×432 grid). Provide the exact strip width distribution and the count of vertices removed.

2. **Resolve the Catch-22** (C4): either prove that a smaller guard margin is manifold-safe, or propose an alternative mechanism that achieves thinning without manifold risk.

3. **Correct the R2 prediction** to use M=4 (not M=1) for the user's config. The prediction must account for residual R2 violations at boundary transitions (C6).

4. **Address the 3-way union asymmetry** (C3): either prove it can't create strip width differences exceeding the guard margin, or add explicit boundary-matching logic.

5. **If P1 is abandoned**, propose an alternative primary strategy with the same level of analysis (root cause, mechanism, assumptions, counterexamples).

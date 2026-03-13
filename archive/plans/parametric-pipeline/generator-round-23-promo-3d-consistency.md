# Generator Round 23 — PROMO_EPSILON 3D/UV Consistency Fix

Date: 2026-03-06

## Problem Statement

R22.2 dramatically improved avg_aspect (444 → 64.8, 7× better) by increasing `PROMO_EPSILON` to 0.20 and adding symmetric T-ring companions. But **55.6% of chain-strip triangles still have >4:1 aspect ratio** and **423,754 edge flip attempts were rejected** — because no connectivity change can fix them.

The problem is structural: **the 3D position of chain vertices does not match their CDT placement**. The CDT places promoted chain vertices at `tBot + 0.20 * tGap`, but the GPU evaluates them at `tRow` (the exact grid boundary). Every triangle connecting a promoted chain vertex to a same-row boundary vertex has two vertices that are 3D-coincident → **unfixable 3D sliver**. Edge flips cannot help because the *vertex positions themselves* create zero-height triangles in 3D.

## Root Cause Analysis

### The Mismatch (Two Systems, Two Positions)

**System 1 — Vertex Buffer (OWT lines 930-935)**:
```
vertices[vIdx++] = cv.u;
vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];   // ← tRow
vertices[vIdx++] = surfaceId;
```
The GPU receives `(u, tRow, surfaceId)` and evaluates `S(u, tRow)` → 3D position **on the boundary**.

**System 2 — CDT Strip (OWT lines 1322-1325)**:
```
if (sv.isChain) {
    stripInteriorVerts.push({ ...sv, promotedT: tBot + PROMO_EPSILON * tGap });
}
```
The CDT places this vertex at `tBot + 0.20 * tGap` — **20% into the band interior**.

**System 3 — D-Radical Duplicate (OWT lines 940-950)**:
```
vertices[dupIdx * 3]     = vertices[cv.vertexIdx * 3];       // u (same)
vertices[dupIdx * 3 + 1] = vertices[cv.vertexIdx * 3 + 1];   // t (same = tRow!)
vertices[dupIdx * 3 + 2] = vertices[cv.vertexIdx * 3 + 2];   // surfaceId
```
The duplicate also stores `tRow`. When used in the top band (OWT line 1369):
```
stripInteriorVerts.push({ ...sv, idx: dupIdx ?? sv.idx, promotedT: tTop - PROMO_EPSILON * tGap });
```
CDT places it at `tTop - 0.20 * tGap`, but GPU evaluates it at `tRow = tTop`.

### Why This Causes 55.6% Violations

Consider a triangle with vertices A (boundary grid at `tBot`), B (promoted chain at CDT `tBot + 0.20*tGap`), C (some interior companion). In CDT UV space, this triangle has non-zero area. But in 3D:

- A evaluates at `S(uA, tBot)` → 3D position on the boundary
- B evaluates at `S(uB, tBot)` → 3D position **also on the boundary** (because `vertices` stores `tBot`, not `tBot + 0.20*tGap`)
- C evaluates at its stored T → legitimate interior position

A and B are on the same `tBot` surface → the triangle A-B-C is a sliver (two points at ~same height, one offset). The 3D aspect ratio is enormous because the base A-B has zero T-separation in 3D even though CDT thinks they're separated.

### Why Edge Flip Can't Fix It

Edge flip changes connectivity, not vertex positions. If vertex B's 3D position is on the boundary while CDT thinks it's interior, *every* triangle incident to B that also touches the boundary will be a sliver. The 423K rejected flips are the optimizer exhaustively proving this.

### Quantifying the Fix's Fidelity Cost

For a 100mm pot with 432 T rows:
- Inter-row gap: `tGap ≈ 1/432 ≈ 0.00231` (parametric)
- PROMO offset: `0.20 × 0.00231 = 0.000463` (parametric)
- Physical offset: `0.000463 × 100mm = 0.046mm`
- GPU resnap tolerance: `0.073mm`

The chain vertex moves **0.046mm off the exact feature row** — well within resnap tolerance and below 3D printer layer height (0.1-0.2mm). Imperceptible in the final print.

## Proposals

### Proposal 1: Store Promoted T in Vertex Buffer (CONSERVATIVE)

**Idea**: Change the parametric T stored in `vertices[]` for row-boundary chain vertices from `tRow` to the promoted position. Both original and duplicate vertices get their respective promoted T values.

**Mechanism**: Two changes in vertex allocation (OWT lines 928-950):

**Change A — Original chain vertices** (used in bottom bands):

Currently (line 932):
```
vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];
```

Proposed pseudocode:
```
if (cv.t !== undefined) {
    // Companion vertex — T is explicit, no change needed
    vertices[vIdx++] = cv.t;
} else {
    // Row-boundary chain vertex — store promoted T for the BOTTOM band
    const rowT = activeTPositions[cv.rowIdx];
    const nextRowT = activeTPositions[cv.rowIdx + 1];  // bottom band is [rowIdx, rowIdx+1]
    if (cv.rowIdx + 1 < numT) {
        vertices[vIdx++] = rowT + PROMO_EPSILON * (nextRowT - rowT);
    } else {
        // Last row: no band below, keep tRow (edge case E1)
        vertices[vIdx++] = rowT;
    }
}
```

**Change B — D-Radical duplicates** (used in top bands via `topDupMap`):

Currently (lines 947-949):
```
vertices[dupIdx * 3]     = vertices[cv.vertexIdx * 3];       // u
vertices[dupIdx * 3 + 1] = vertices[cv.vertexIdx * 3 + 1];   // t = tRow
vertices[dupIdx * 3 + 2] = vertices[cv.vertexIdx * 3 + 2];   // surfaceId
```

Proposed pseudocode:
```
vertices[dupIdx * 3]     = vertices[cv.vertexIdx * 3];       // u (same)
vertices[dupIdx * 3 + 2] = vertices[cv.vertexIdx * 3 + 2];   // surfaceId (same)

// Duplicate is used in TOP band [rowIdx-1, rowIdx], promoted inward from top
const rowT = activeTPositions[cv.rowIdx];
const prevRowT = activeTPositions[cv.rowIdx - 1];  // top band is [rowIdx-1, rowIdx]
if (cv.rowIdx - 1 >= 0) {
    vertices[dupIdx * 3 + 1] = rowT - PROMO_EPSILON * (rowT - prevRowT);
} else {
    // First row: no band above, keep tRow (edge case E2)
    vertices[dupIdx * 3 + 1] = rowT;
}
```

**Change C — `getUV` function** (OWT line 1543-1555):

The `getUV` helper resolves UV for constraint edge crossing detection. Currently it looks up `cv.t ?? activeTPositions[cv.rowIdx]` for chain vertices. After the fix, the vertex buffer already contains the promoted T, so `getUV` should read from the buffer directly:

Currently (lines 1551-1554):
```
const cv = allChainVertices[vIdx - gridVertexCount];
return [cv.u, cv.t ?? activeTPositions[cv.rowIdx]];
```

Proposed pseudocode:
```
// After P1, vertices[] already stores promoted T for row-boundary chains
return [vertices[vIdx * 3], vertices[vIdx * 3 + 1]];
```

This is actually a simplification — `getUV` becomes uniform across all vertex types (grid, chain, topDup), since they all read from the buffer.

**Mathematical basis**: The CDT places the vertex at promoted T. The GPU should evaluate at the same T. When both agree, the 3D position is genuinely interior to the band, and triangles connecting it to the boundary have non-zero 3D height ≈ `PROMO_EPSILON * tGap * ∂S/∂t`.

**Files affected**:
- `OuterWallTessellator.ts`: vertex allocation loop (~lines 928-950), `getUV` helper (~line 1543)

**Trade-offs**:
- (+) Eliminates the fundamental 3D/UV mismatch — no more zero-height triangles
- (+) Edge flip can now actually improve quality (vertex positions are correct)
- (+) `getUV` simplifies — all cases read directly from buffer
- (-) Chain vertices no longer sit exactly on the mathematical feature — offset by `PROMO_EPSILON * tGap`
- (-) Feature chains that were precisely GPU-resnapped to tRow are now evaluated at tRow ± offset
- (-) Two different T values for the same logical chain vertex (original vs duplicate)

**Assumptions** (for Verifier to attack):
1. `cv.rowIdx + 1 < numT` is always true for chain vertices appearing as botRow chains (because they appear in band [rowIdx, rowIdx+1], which requires rowIdx+1 to exist)
2. `cv.rowIdx - 1 >= 0` is always true for chain vertices that have topDupMap entries (because topDupMap is for vertices appearing in the top band [rowIdx-1, rowIdx], which requires rowIdx-1 to exist)
3. The promoted T value produces a valid, finite surface evaluation — no pole or discontinuity in the parametric surface at `tRow ± PROMO_EPSILON * tGap`
4. Reading `vertices[vIdx * 3 + 1]` in `getUV` for chain vertex indices (`gridVertexCount ≤ vIdx < totalVertexCount`) is valid because those slots were populated in the chain vertex loop
5. The `PROMO_EPSILON * tGap` offset (0.046mm for default geometry) is below perceptual and resnap thresholds
6. No other consumer of the vertex buffer depends on row-boundary chain vertices being exactly at `tRow` (no code path uses the stored T to determine row membership or perform row-boundary logic after vertex allocation)

---

### Proposal 2: Reduce PROMO_EPSILON to 0.10 (MODERATE)

**Idea**: With the 3D/UV fix in place, the T-ring layer system works correctly. The original motivation for PROMO=0.20 was to ensure T-ring companions at `frac=0.10` fall between boundary and chain. But with 3D consistency, the mesh quality improvement is structural, not parametric. We can safely reduce PROMO_EPSILON and gain better feature fidelity.

**Mechanism**: Change `const PROMO_EPSILON = 0.20;` → `const PROMO_EPSILON = 0.10;`

**Mathematical basis**: At PROMO=0.10:
- Chain promoted to `tBot + 0.10 * tGap` in bottom band
- T-ring companion at `frac=0.10` sits at `tBot + 0.10 * tGap` — **coincident with chain**
- T-ring companion at `frac=0.15` sits at `tBot + 0.15 * tGap` — above chain

This means the `frac=0.10` T-ring no longer fills the boundary→chain gap; it's on top of the chain. We need to adjust `nearChainTFractions` if we reduce PROMO.

**Alternative**: PROMO=0.10 with `nearChainTFractions = [0.05, 0.07, 0.93, 0.95]`:
- Chain at 10%, T-ring at 5% and 7% → two layers between boundary (0%) and chain (10%)
- Symmetric: chain at 90%, T-ring at 93% and 95% → two layers between chain and top
- Feature fidelity offset: `0.10 × 0.00231 × 100mm = 0.023mm` (half of PROMO=0.20)

**Trade-offs**:
- (+) 2× better feature fidelity (0.023mm vs 0.046mm offset)
- (+) Still well within resnap tolerance (0.073mm)
- (-) Coupled change — must adjust T-ring fractions simultaneously
- (-) More testing surface area (two constants changed)

**Recommendation**: **Defer P2 to a follow-up round.** Fix the 3D/UV mismatch first (P1) and measure. If avg_aspect drops dramatically with PROMO=0.20, we can fine-tune the epsilon separately without confounding the measurement.

**Assumptions** (for Verifier to attack):
1. PROMO=0.10 with adjusted T-ring fractions produces the same layered triangulation quality as PROMO=0.20 with current fractions
2. The companion dedup threshold (1e-5) does not merge the T-ring at frac=0.05 with the boundary at frac=0.00 when tGap is very small
3. Reducing PROMO does not re-introduce the original sliver pattern that R22.2 fixed (because the 3D/UV fix was the real solution, not the PROMO magnitude)

---

### Proposal 3: T-Ring Fraction Review (CONSERVATIVE)

**Idea**: With P1 in place, review whether the symmetric T-ring fractions `[0.10, 0.15, 0.85, 0.90]` are still well-positioned relative to the promoted chain positions.

**Analysis at PROMO=0.20**:

Bottom band layout (bot boundary at T=0.00, top boundary at T=1.00 in normalized band coordinates):
```
T=0.00  → bot boundary (grid row j)
T=0.10  → T-ring companion ← fills boundary→chain gap (50% of gap)
T=0.15  → T-ring companion ← fills boundary→chain gap (75% of gap)
T=0.20  → chain vertex (promoted) ← GPU now evaluates here too
T=0.50  → main shell companions (typical)
T=0.80  → chain vertex (promoted from top, via topDupMap)
T=0.85  → T-ring companion ← fills chain→boundary gap (75% of gap)
T=0.90  → T-ring companion ← fills chain→boundary gap (50% of gap)  
T=1.00  → top boundary (grid row j+1)
```

This is **well-layered**. The T-ring fractions create two intermediate layers on each side, with the chain vertex as the interior anchor. No changes needed.

**However**, there's a subtlety: in a band where a chain appears on BOTH boundaries (bottom AND top), the band gets:
- Original chain at bot: promoted to T=0.20
- Duplicate chain at top: promoted to T=0.80
- T-ring at 0.10, 0.15 filling bot→chain gap
- T-ring at 0.85, 0.90 filling chain→top gap
- Gap between 0.20 and 0.80 is filled by main shell companions

This is fine — the 0.20→0.80 interior gap (60% of band) gets standard shells.

**For a band with only a bot chain** (more common):
- Chain at T=0.20, T-ring at 0.10, 0.15
- T-ring at 0.85, 0.90 fills top boundary neighborhood with NO chain there
- This provides bonus interior density near the top boundary — harmless, slightly wasteful

**Recommendation**: **No change to T-ring fractions.** The current layout is correct for the PROMO=0.20 case. If P2 reduces PROMO to 0.10, fractions would need adjustment (see P2).

**Assumptions** (for Verifier to attack):
1. The main shell companions adequately fill the 0.20→0.80 gap
2. T-ring companions at 0.85, 0.90 in bands without a top chain don't create unintended CDT artifacts
3. The T-ring dedup radius (1e-5) correctly prevents coincidence with promoted chain vertices when fractions approach PROMO_EPSILON

---

## Edge Case Analysis

### E1: Chain at rowIdx=0 (First Row)

- Row 0 is the bottom of the entire surface (T≈0.0)
- No band [-1, 0] exists → no `topDupMap` entry for this vertex
- The original vertex appears only in band [0, 1] as a botRow chain
- **P1 assigns**: `T = activeTPositions[0] + PROMO_EPSILON * (activeTPositions[1] - activeTPositions[0])`
- This is correct — the vertex is promoted into band [0,1]

**Risk**: If `activeTPositions[0]` is very close to 0.0 and the surface has a pole/singularity at T=0, the promoted position could be in a degenerate region. **Probability: very low** — the parametric surface is well-defined across [0,1]; the first row corresponds to the bottom rim of the pot, not a pole.

### E2: Chain at rowIdx=numT-1 (Last Row)

- Row numT-1 is the top of the surface (T≈1.0)
- No band [numT-1, numT] exists → the original vertex only appears in band [numT-2, numT-1] as a topRow chain
- The topDupMap creates a duplicate for the top band
- **P1 assigns to duplicate**: `T = activeTPositions[numT-1] - PROMO_EPSILON * (activeTPositions[numT-1] - activeTPositions[numT-2])`
- **P1 assigns to original**: No bottom band to appear in → requires edge case guard

**Wait — does a chain at the last row ever appear as a botRow chain?** Only in band [numT-1, numT], which doesn't exist. So the original vertex is used as a topRow chain in band [numT-2, numT-1], where it's remapped via `topDupMap` to a duplicate. The ORIGINAL vertex's T value in the buffer is consumed only by `getUV` and potentially by GPU eval. Since it never appears in a CDT strip as a bot vertex, the mismatch doesn't create slivers.

**Safe approach**: For the original, use the fallback `vertices[vIdx++] = rowT;` (no band below). This is fine because the original index is only used via topDupMap → duplicate, which gets the correct promoted T.

### E3: Seam Chain Vertices (col 684, near U≈1.0)

Chains 1, 2, 3, 11 have vertices at col 684 (the last column before the seam wrap). These are row-boundary chain vertices like any other — the seam is a U-space issue, not a T-space issue. P1 changes T values only and does not interact with the SEAM_THRESHOLD or SEAM_GUARD logic.

**Assumption**: The seam-related max_aspect outliers (96.7M:1 in R22.1 logs) are caused by seam-crossing edges, not by the 3D/UV mismatch. P1 will not fix seam artifacts — those need separate treatment (constraint edge seam filtering).

### E4: Micro-Rows (Small tGap)

When chain-guided row insertion creates tightly-spaced rows, `tGap` can be very small (e.g., 0.002).

- Promoted T offset: `PROMO_EPSILON × tGap = 0.20 × 0.002 = 0.0004`
- Physical: `0.0004 × 100mm = 0.04mm`
- T-ring at frac=0.10: `0.10 × 0.002 = 0.0002` → physical `0.02mm`
- Companion dedup threshold: `1e-5` → `0.001mm`

All values are well above the dedup threshold. The T-ring and chain are distinct points in the CDT. No dedup collision.

**Risk**: At `tGap < 5e-5` (which would mean >20,000 rows), the `frac=0.10` T-ring would be within dedup radius of the boundary. This doesn't occur at 432 rows (tGap ≈ 0.00231).

### E5: Chain Vertex with Explicit T (cv.t !== undefined)

These are 2D companion vertices with explicit parametric positions — not row-boundary vertices. The original code path `vertices[vIdx++] = cv.t` is unchanged by P1. The `topDupMap` loop (line 943: `if (cv.t !== undefined) continue;`) skips them. No impact.

### E6: getUV After P1 — Is Reading from Buffer Always Safe?

After P1, `getUV` reads `vertices[vIdx * 3 + 1]` for ALL vertex types. For chain vertices:
- Original (gridVCount ≤ vIdx < totalVertexCount): stores promoted T via Change A
- Duplicate (totalVertexCount ≤ vIdx): stores promoted T via Change B
- Companion (cv.t defined): stores cv.t (unchanged)

All three cases have correct T in the buffer. The current `getUV` fallback to `cv.t ?? activeTPositions[cv.rowIdx]` was necessary *because* the buffer stored `tRow` for row-boundary chains. After P1, the buffer is the source of truth for all vertex types.

**Simplification benefit**: `getUV` no longer needs to index into `allChainVertices` — it becomes a simple buffer read for all cases.

## Recommended Approach

**Implement P1 only.** This is the minimum-scope, maximum-impact fix.

1. Two changes in vertex allocation (Change A + Change B): ~8 lines modified
2. One simplification in getUV (Change C): ~4 lines simplified
3. No constant changes (PROMO_EPSILON stays at 0.20)
4. No T-ring fraction changes
5. Defer P2/P3 to a measurement round after P1 is validated

### Expected Impact

- **avg_aspect**: Should drop dramatically. The 55.6% violation rate is dominated by the 3D/UV mismatch. With correct 3D positions, triangles that CDT made well-shaped will *actually be* well-shaped in 3D.
- **Edge flip rejections**: Should drop from 423K to near zero for the mismatch-caused slivers. Remaining rejections would be from true geometric difficulty (seam, curvature).
- **max_aspect**: The extreme outliers (2.4M:1) may persist if they're seam-related, but the distribution should dramatically improve.
- **Feature fidelity**: 0.046mm offset — below resnap tolerance, below layer height, imperceptible.

### Verification Criteria

After implementation, the following should hold:
1. `vertices[cv.vertexIdx * 3 + 1]` ≠ `activeTPositions[cv.rowIdx]` for row-boundary chain vertices with rowIdx < numT-1
2. `vertices[dupIdx * 3 + 1]` ≠ `activeTPositions[cv.rowIdx]` for topDupMap duplicate vertices with rowIdx > 0
3. The difference equals `±PROMO_EPSILON * tGap` for the respective band
4. All existing tests pass (test relaxations from R22.2 may need further adjustment on tiny grids)
5. 3D avg_aspect drops by >50% from 64.8

## Open Questions

1. **Does any code path use the stored T of row-boundary chain vertices to determine row membership?** I've traced `getUV` and the GPU evaluator — both just read the buffer. But the `buildMergedRow` function (OWT ~line 1000) builds merged rows from `activeTPositions[j]` and classifies vertices by row index, not by stored T. **I believe no code path depends on stored T equaling tRow**, but the Verifier should confirm by tracing all consumers of `vertices[cv.vertexIdx * 3 + 1]`.

2. **Should the GPU resnap pass (Step 3.5) be aware of the promoted offset?** Resnap searches for the nearest local extremum given a chain vertex's stored `(u, t)`. After P1, the search starts from `(u, tRow ± epsilon)` instead of `(u, tRow)`. Since the search window (32 candidates, 0.073mm radius) vastly exceeds the 0.046mm offset, this should find the same extremum. But the Verifier should analyze whether the parabolic refinement's initial estimate quality degrades.

3. **The constraint edge crossing test in the dedup scope (OWT lines 1543-1590)** — after P1, `getUV` returns promoted T for chain vertices. Crossing tests between constraint edges and grid cell diagonals will use slightly different T values. Is this safe? The edges are short (local UV), and the T offset is small relative to tGap. But the Verifier should confirm no false-positive crossings.

4. **D-Radical manifold guarantee**: The original and duplicate now have DIFFERENT T values in the buffer (original: tRow + ε, duplicate: tRow - ε). This is intentional — they're in different bands. But does any post-CDT code assume original and duplicate are at the same 3D position? The `topDupReverse` map is used in `chainVertexChainIds` construction (line 1848) which only cares about chainId, not position. **Likely safe**, but Verifier should trace.

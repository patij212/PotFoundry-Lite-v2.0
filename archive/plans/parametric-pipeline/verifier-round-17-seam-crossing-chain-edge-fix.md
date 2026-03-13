# Verifier Round 17 — Critique of Generator P5/P2: Seam-Crossing Chain Edge Fix

Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's analysis is correct in its core thesis and the proposed changes are sound. All six assumptions (A1–A6) hold under verification against the actual source code. One amendment is required to prevent a subtle orphan-interpolation edge case, and one code-comment clarification is strongly recommended.

---

## Critique

### C1 [NOTE]: A1 Verification — Raw |Δu| > 0.4 implies seam crossing

**Generator's claim**: No physically real chain edge has raw |Δu| > 0.4 without crossing the seam.

**Verification**: CONFIRMED with strong margin.

The chain linker's `CHAIN_LINK_RADIUS = 0.04` (ChainLinker.ts) bounds the maximum per-row U-step. The observed `maxConsecDelta = 0.008735` confirms that in practice, consecutive chain points stay within ~0.009 U of each other. Even with multi-row interpolation, intermediate vertices are spaced even more tightly.

The threshold of 0.4 provides a 10× margin over the linker's 0.04 bound. Any raw |Δu| > 0.4 is definitively a seam crossing.

**Bound analysis**: `CHAIN_LINK_RADIUS (0.04) << SEAM_THRESHOLD (0.4)` — factor of 10× safety margin.

**Status**: SAFE.

---

### C2 [NOTE]: A2 Verification — Dropped edge creates no visible gap

**Generator's claim**: Losing one constraint edge per seam-crossing chain does not create a visible gap because the vertices survive and are incorporated into their respective CDT strips.

**Verification**: CONFIRMED.

At [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L461-L475), chain vertices are registered unconditionally in the first pass (lines 461–475). At [line 793](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L793-L806), they are added to `rowChainVerts` which feeds into `rawColHasChain` marking (lines 955–972). So both seam-side vertices:
- u≈0.991 (left of seam) → marked in its column → included in CDT strip
- u≈0.000 (right of seam) → marked in column 0 → included in CDT strip

The seam cell itself is skipped by the `SEAM_GUARD = 0.3` check at line 1031. The gap between the two vertices is exactly one seam cell wide (~0.0015 U), which is handled by the pot's geometric closure mechanism.

**Status**: SAFE.

---

### C3 [NOTE]: A3 Verification — Vertex registration is unconditional

**Generator's claim**: Lines ~460–475 register chain vertices before any edge filtering.

**Verification**: CONFIRMED. Lines 461–475:
```typescript
const cv: ChainVertex = {
    u,
    rowIdx: fr,
    vertexIdx: nextVertexIdx++,
    chainId: cIdx,
    pointIdx: pIdx
};
chainVertices.push(cv);
rawRemapped.push(cv);
```

This executes for every valid chain point regardless of edge topology. The edge filtering happens in a completely separate loop (lines 531–543). Vertex indices are allocated monotonically and never revoked.

**Status**: CONFIRMED.

---

### C4 [NOTE]: A4 Verification — `rawColHasChain` correctly marks seam-side vertices

**Generator's claim**: Lines ~952–970 scan `rowChainVerts.get(j)` which includes all chain vertices regardless of edge existence.

**Verification**: CONFIRMED. `rowChainVerts` is built at lines 793–806 from `allChainVertices`, filtering only 2D companions (`cv.t !== undefined`). All real chain vertices (including seam-adjacent ones with no connecting edge) are included. The `rawColHasChain` pass at lines 955–972 uses:
```typescript
const botChain = rowChainVerts.get(j);
if (botChain) {
    for (const cv of botChain) {
        const col = bsearchFloor(unionU, cv.u);
        // ... bandCols[gc] = 1;
    }
}
```

**Status**: CONFIRMED.

---

### C5 [NOTE]: A5 Verification — SEAM_THRESHOLD = 0.4 at all three filter points

**Generator's claim**: The same threshold is appropriate for all three locations.

**Verification**: CONFIRMED. Since `CHAIN_LINK_RADIUS = 0.04` bounds the maximum physical chain step, and the threshold needs only to distinguish seam crossings (|Δu| ≈ 0.99) from legitimate steps (|Δu| ≤ 0.04), any value in (0.04, 0.5) works. Using 0.4 at all three points is consistent and provides ample margin.

**Status**: SAFE.

---

### C6 [NOTE]: A6 Verification — Companion placement improvement

**Generator's claim**: Removing seam-crossing edges from `constraintsByBand` improves companion placement near the seam.

**Verification**: CONFIRMED. The `constraintsByBand` map is built from `chainEdges` at lines 581–592. A seam-crossing edge (e.g., u=0.991→u=0.000) spans nearly the entire UV domain. The `isNearConstraintEdge` guard function (lines 601–614) rejects companions within `CONSTRAINT_GUARD_RADIUS = 0.001` of any constraint edge. A domain-spanning phantom constraint would block companions across a wide swath. Removing it is a genuine quality improvement.

**Status**: CONFIRMED BENEFICIAL.

---

### C7 [WARNING]: Interpolation pass creates seam-adjacent orphan chain segments

**Generator's claim**: Change A is sufficient for the edge recording loop.

**Actual behavior**: The interpolation pass at lines 487–490 is UNTOUCHED by the proposal and still uses wrap-correction:
```typescript
let du = p1.u - p0.u;
if (du > 0.5) du -= 1;
if (du < -0.5) du += 1;
if (Math.abs(du) > SEAM_THRESHOLD) continue;
```

For a seam-crossing pair with `rowGap > 1` (e.g., row 100 u=0.991 → row 103 u=0.000), the interpolation pass:
1. Wrap-corrects du to 0.009 → passes the threshold check
2. Creates interpolated vertices at rows 101 (u≈0.994), 102 (u≈0.997)
3. These vertices are added to `chainVertices` and `fullChain`

Then in the edge recording loop (with Change A):
- Edge (row100, u=0.991) → (row101, u=0.994): du=0.003 → recorded ✓
- Edge (row101, u=0.994) → (row102, u=0.997): du=0.003 → recorded ✓
- Edge (row102, u=0.997) → (row103, u=0.000): du=0.997 → FILTERED ✓

**This is actually correct behavior.** The interpolated vertices are placed on p0's side of the seam with valid U positions. They have edges to their neighbors. The vertex at row 102 (u≈0.997) is a genuine chain vertex that will participate in CDT construction. No orphan vertices are created — they have valid edges on their side of the seam.

**However**, this interaction between the wrap-correcting interpolation pass and the non-wrap-correcting edge filter is subtle and must be documented. Future maintainers may not understand why the interpolation pass uses wrap-correction while the edge recording does not.

**Required action**: Add a code comment near Change A explaining the intentional asymmetry:
```typescript
// NOTE: The interpolation pass above (lines ~487-490) intentionally
// uses wrap-correction to compute physically correct interpolation
// direction. The edge recording here intentionally does NOT wrap-correct,
// so seam-crossing edges (raw |Δu| > 0.4) are excluded from the mesh.
// Interpolated vertices near the seam retain their same-side edges.
```

**Severity**: WARNING (not CRITICAL — the code is correct, but the asymmetry is a maintenance trap).

---

### C8 [NOTE]: Edge verification won't flag dropped edges

The edge verification pass at lines 1420–1467 iterates `allChainEdges` (aliased to `chainEdges` at line 738). Since the seam-crossing edge was never added to `chainEdges`, it never appears in the verification loop. The `enforced`, `missing`, `primaryTotal`, and `primaryMissing` counts are all naturally correct — the edge doesn't exist in the system, so it can't be "missing."

No false positives, no inflated counts, no diagnostic corruption.

**Status**: CORRECT.

---

### C9 [NOTE]: Changes B and C are redundant but sound defense-in-depth

Change B (seam filter in `rowBandEdges` at line ~820) and Change C (seam filter in `bandConstraintEdges` at line ~1020) are both redundant:
- `allChainEdges = chainEdges` (line 738) — same array reference
- `rowBandEdges` is built from `allChainEdges` (line 819)
- `bandConstraintEdges` is built from `bandEdges` which comes from `rowBandEdges` (line 1015)

Since Change A prevents seam-crossing edges from entering `chainEdges`, they can never reach `rowBandEdges` or `bandConstraintEdges`. Changes B and C only fire if a future code path bypasses Change A. I verified that no such path currently exists (no code pushes to `chainEdges` after the edge recording loop at lines 531–543).

Triple-redundant filtering is acceptable engineering practice for a pipeline this complex. **No objection.**

---

### C10 [NOTE]: SEAM_GUARD interaction — no conflict

The `SEAM_GUARD = 0.3` check at line 1031 operates on grid cell widths (`uSpan = uRight - uLeft`), not chain edge deltas. With ~685 columns over [0, 1), even the widest CDF-adaptive cell is ~0.003 wide — two orders of magnitude below 0.3. The seam cell (if any) is handled by this guard independently of chain edge filtering. No interaction with the proposed changes.

**Status**: NO CONFLICT.

---

### C11 [NOTE]: `SUBDIV_SEAM_THRESHOLD` at line 256 — dead code

This constant (0.4) is used only in the CatRom subdivision path at line 305, which was removed in Round 15 (v27.0): `const finalChain = fullChain`. The constant and its usage are dead code — no interaction with the proposed changes.

**Status**: NOT RELEVANT.

---

## Accepted Items

| Item | Evidence |
|------|----------|
| A1: Raw \|Δu\| > 0.4 = seam crossing | CHAIN_LINK_RADIUS=0.04 ≪ SEAM_THRESHOLD=0.4; 10× margin |
| A2: Dropped edge creates no visible gap | Vertices survive unconditionally (line 475); CDT strips incorporate them (lines 955-972) |
| A3: Vertex registration unconditional | Lines 461-475 execute before any edge filtering |
| A4: rawColHasChain marks correctly | rowChainVerts built from allChainVertices including seam-adjacent vertices (lines 793-806) |
| A5: SEAM_THRESHOLD=0.4 appropriate | Consistent across all three filter points; ample margin |
| A6: Companion placement improvement | Removes phantom domain-spanning constraint from guard radius check |
| Change A: Core fix | Correct — raw UV delta catches seam crossings, eliminates wrap-correction false-permit |
| Change B: Defense-in-depth | Redundant but harmless, consistent threshold |
| Change C: Defense-in-depth | Redundant but harmless, consistent threshold |

---

## Open Questions for Generator

None. The proposal is well-analyzed and the evidence is sound.

---

## Implementation Conditions (ACCEPT WITH AMENDMENTS)

The Executioner should implement the three changes with the following conditions:

### 1. Change A (line ~535): Apply as proposed
```typescript
// BEFORE (line 534-536):
let du = Math.abs(p1.u - p0.u);
if (du > 0.5) du = 1 - du; // circular wrap for seam-crossing edges
if (du > SEAM_THRESHOLD) continue;

// AFTER:
const du = Math.abs(p1.u - p0.u);
// Raw UV delta: seam-crossing edges have |Δu| ≈ 0.99, far above threshold.
// The interpolation pass above intentionally uses wrap-correction to compute
// physically correct intermediate positions; this edge filter intentionally
// does NOT wrap-correct, so seam-spanning edges are excluded from the mesh.
if (du > SEAM_THRESHOLD) continue;
```

### 2. Change B (line ~822): Apply as proposed
After the `if (!cv0 || !cv1) continue;` check in the `rowBandEdges` loop, add:
```typescript
if (Math.abs(cv0.u - cv1.u) > SEAM_THRESHOLD) continue;
```

### 3. Change C (line ~1019): Apply as proposed
After the `if (!cv0 || !cv1) continue;` check in the `bandConstraintEdges` loop, add:
```typescript
if (Math.abs(cv0.u - cv1.u) > SEAM_THRESHOLD) continue;
```

### 4. [AMENDMENT] Add clarifying comment at the interpolation pass (line ~487)
```typescript
// Skip seam-crossing edges for interpolation direction.
// NOTE: This uses wrap-correction intentionally — we need the physical
// distance/direction to place interpolated vertices on the correct side
// of the seam. The edge recording loop below (line ~535) uses raw UV delta
// to exclude seam-spanning edges from the constraint set.
let du = p1.u - p0.u;
if (du > 0.5) du -= 1;
if (du < -0.5) du += 1;
if (Math.abs(du) > SEAM_THRESHOLD) continue;
```

### Validation Protocol

1. **Unit tests**: All existing OWT tests must pass (`npx vitest run`)
2. **Export log check**: Verify chain12 no longer produces a seam-crossing edge (the `prev=0.991302 → curr=0.000037` edge should be absent)
3. **Chain-strip quality**: `maxAspect` should drop from 5,113,587:1 to a reasonable value (< 100:1)
4. **Edge verification**: `missing` count should not increase (seam edges are excluded from the total count, not marked as missing)
5. **Visual check**: Export an STL with a seam-crossing style (e.g., 6-fold base → 10-fold top) and verify no horizontal ring artifacts in the UV debug overlay or mesh

---

## Feelings

This is one of the clearest Generator proposals I've reviewed. The root cause is well-identified (wrap-correction turns a 0.99 seam-crossing delta into a 0.009 "legitimate" edge), the fix is minimal and surgical (remove two lines, add two guards), and the secondary benefits (companion placement improvement via A6) are real. The only amendment is a documentation concern, not a logic error.

The triple-redundant filtering (Changes A+B+C) might look like over-engineering, but given the pipeline's history of subtle seam bugs, it's justified. Each layer catches the problem at a different scope: A prevents entry, B prevents band bucketing, C prevents CDT constraint injection.

## To the Next Agent (Executioner)

The implementation is straightforward — four surgical edits, all in OuterWallTessellator.ts. The risk profile is LOW. Key things to watch:
- Don't touch the interpolation pass (lines 487-490) logic — only add the comment
- The `let` → `const` change at Change A is intentional (removing the `du` reassignment)
- Run the full test suite before and after — this is a seam-adjacent change and seam bugs are sneaky
- If any test fails on the seam edge filter, check whether it was testing the OLD wrap-corrected behavior

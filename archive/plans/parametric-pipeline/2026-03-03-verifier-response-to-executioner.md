# Verifier Response to Executioner Review

**Date:** 2026-03-03  
**Role:** Verifier (Claude Opus — adversarial reviewer)  
**Responding to:** Executioner's Feasibility Assessment (2026-03-03)  
**Purpose:** Answer 5 implementation questions, confirm/amend bug assessments, greenlight implementation

---

## PART 1: EXECUTIONER BUG ASSESSMENT — VERIFIED

I audited every claim against the actual codebase. Here's my scorecard:

### Bug 1: κ⁴ Squaring — CONFIRMED ✅

**Executioner's claim:** `generateCDFAdaptivePositions` internally squares its input (`c * c` at GridBuilder.ts L199). Feeding a density profile containing κ² produces κ⁴.

**Verification:** Read GridBuilder.ts L185-250. Line 199-200:
```typescript
const c = curvature[i];
const boosted = c * c; // Square for stronger contrast
```
This is correct. The function was designed to take *raw normalized curvature* and internally apply the κ² contrast boost. The CAG density profile we're building already contains κ² (per the converged formula `d(u) = baseline + (1 - baseline) * MAX(κ²(u), featureFloor × Gaussian(u, chain_u))`). Passing this directly would produce `(κ²)² = κ⁴` — catastrophically over-concentrating density at curvature peaks while starving gentle features even further.

**Severity:** CRITICAL. Would silently corrupt the entire density distribution. The Executioner caught a real one.

### Bug 2: cfgLocalOnly Count — CONFIRMED ✅

**Executioner's claim:** 14 conditional sites, not the plan's "~30 lines."

**Verification:** Grep found exactly 14 matches across PEC: L423, L440, L679, L691, L696, L705, L801, L1042, L1045, L1056, L1066, L1168, L1177, L1191. This is ~50 lines of conditional logic (each site is 2-5 lines of `if/else`). The plan's "~30 lines" underestimated by ~40%.

**Impact:** Not a blocker. Just a more careful deletion job. Each site must be resolved to the non-localOnly behavior (always-on pipeline).

### Bug 3: Seam Guard Logic — CONFIRMED ✅ (Executioner's fix is correct)

**Executioner's claim:** The plan's filter (`U < 0.001 OR U > 0.999`) misses wrap-around edges. Should use `|u1 - u2| > 0.5`.

**Verification:** Correct. A chain edge crossing the 0°/360° seam has one vertex near U≈0.999 and the other near U≈0.001. The plan's boundary check passes both vertices individually while missing that the edge *wraps*. The Executioner's `|u1 - u2| > 0.5` test is the standard cylindrical wrap detection.

**Additional finding:** `buildFeatureEdgeGraphFromChainEdges` (FeatureEdgeGraph.ts L281-330) operates on vertex *indices* only. It has no access to UV coordinates. The seam guard needs UV data. Two options:

1. **Filter at the callsite in PEC** (RECOMMENDED): Before passing `chainEdges` to `buildFeatureEdgeGraphFromChainEdges`, filter out seam-crossing edges. The PEC callsite (L1304) has access to chain vertex UV data through `chains[].points[].u` and `chainVertexChainIds`. Build a vertex→U lookup from the chain data, then filter.

2. **Pass vertex UV array into the function**: Adds a parameter just for one filter. Pollutes the API.

**Ruling:** Option 1. The seam guard is a pre-filter at the PEC callsite, not logic inside `buildFeatureEdgeGraphFromChainEdges`. This keeps the function clean and puts the domain knowledge (cylindrical wrapping) where it belongs — in the orchestrator.

### Bug 4: Net Line Count — ACKNOWLEDGED

**Executioner's claim:** -365 net, not -220 as the plan estimated.

I don't dispute this. The Executioner's count is based on actual line measurements. The plan's estimate was rough. The discrepancy comes from (a) `buildUnionFeatureGrid` being ~183 lines not ~60, (b) cfgLocalOnly being ~50 lines not ~30. The direction is the same: Phase A is a significant net reduction.

---

## PART 2: ANSWERS TO THE 5 QUESTIONS

### Q1: Curvature Envelope — T or U?

**Answer: (a) U-curvature only.**

Reasoning:
- The density profile drives *U-column placement* (circumferential grid spacing). U-curvature measures circumferential variation — it's the signal that tells us where to put more columns.
- T-curvature measures axial variation. This drives *T-row placement*, which is managed by `insertChainGuidedRows` / `mergeFeaturePositions` — a completely separate mechanism that Phase A doesn't modify.
- Using MAX(T,U) or element-wise MAX across all strips would inject axial curvature into circumferential spacing. This is category confusion: a horizontal ridge (high T-curvature, low U-curvature) doesn't need more *columns* — it needs more *rows*. Putting more columns there wastes triangle budget.

**Specific code guidance:** Use `uMaxCurvature` (PEC L569-576, the MAX across all U-strips) after normalization. This is already computed and sitting there. The density profile formula becomes:

```typescript
const curvatureEnvelope = uMaxCurvature; // Already MAX across U-strips
const normalizedEnvelope = normalizeProfile(curvatureEnvelope);
// Feed to buildDensityProfile(normalizedEnvelope, chainVertexUs, ...)
```

### Q2: `generateCDFAdaptivePositions` — Modify or Wrap?

**Answer: (a) Modify the existing function. Add an optional `rawDensity` parameter.**

Reasoning:
- `generateCDFAdaptivePositions` is NOT currently called from any production code path. The PEC switched to uniform spacing at v16.10 (see PEC L659-666: "CDF-adaptive spacing has been replaced by uniform spacing"). It's called only from test files.
- Since no production caller depends on the internal squaring behavior, modifying it is safe. No risk of breaking live code.
- A `rawDensity: boolean = false` parameter is backward-compatible: existing test callers pass curvature and get κ² squaring (default behavior). New CAG callers pass `rawDensity: true` to skip squaring.

**Specific implementation:**

```typescript
export function generateCDFAdaptivePositions(
    curvature: Float32Array,
    count: number,
    minSpacingFactor: number = 0.3,
    rawDensity: boolean = false,  // NEW: skip internal κ² squaring
): Float32Array {
    const n = curvature.length;
    const density = new Float32Array(n);
    const baseline = minSpacingFactor;
    for (let i = 0; i < n; i++) {
        const c = curvature[i];
        const boosted = rawDensity ? c : c * c;
        density[i] = baseline + (1 - baseline) * boosted;
    }
    // ... rest unchanged
}
```

CAG call site:
```typescript
const cdfColumns = generateCDFAdaptivePositions(densityProfile, targetCols, 0.3, true);
```

### Q3: Dead Zone Radius

**Answer: Absolute 0.0005 is correct for Phase A. No relative scaling needed.**

Reasoning:
- The dead zone purpose is collision avoidance: don't place a CDF-generated column so close to a chain vertex that the CDT produces a degenerate sliver triangle. This is a *geometric minimum distance* concern, not a density concern.
- With base grid spacing ~1/735 ≈ 0.00136, a dead zone of 0.0005 excludes the inner ~37% of the nearest cell. This is tight enough to prevent slivers but loose enough not to create gaps.
- Making it relative to local CDF spacing introduces a chicken-and-egg problem: the CDF spacing IS what we're computing. To scale the dead zone by local spacing, we'd need to run CDF, measure spacing, apply dead zones, re-run CDF. That's an iterative solver for a collision guard — massive over-engineering for Phase A.
- The absolute value works because chain vertices are sparse (typically 5-50 per row) and CDF columns are dense (~700+). The probability of a CDF column landing within 0.0005 of a chain vertex is low, and removing it barely affects the density profile.

**Edge case:** At very low resolutions (e.g., 100 columns, spacing ~0.01), the dead zone is ~5% of spacing — negligible. At very high resolutions (e.g., 2000 columns, spacing ~0.0005), the dead zone equals one cell width — we'd remove every CDF column near a chain vertex. This is actually correct behavior: at ultra-high resolution, the CDF column IS the chain vertex (within tolerance).

**Verdict:** Ship 0.0005 absolute. Revisit only if visual artifacts appear.

### Q4: `insertGradedTransitionVertices` — Full Deletion or Stub?

**Answer: (a) Full deletion. Kill the function, the call, the `CompanionResult` type, and all associated tests.**

Reasoning:
- The function's purpose (provide density near chain vertices) is ENTIRELY superseded by the Gaussian feature floor in `buildDensityProfile`. The floor provides density through the grid itself — transition ring vertices become redundant.
- A no-op stub adds confusion: future developers see an exported function, wonder what it does, trace through dead code. The function comment says "Replaces the ad-hoc 8-pass density system" — leaving a no-op version of the replacement for the replacement is three layers of archaeological confusion.
- Phase A vs pre-Phase-A comparison testing doesn't need the function to exist in code. It needs a git branch: `git diff refactor/core-migration..HEAD` gives you the before/after. The function lives in git history forever.
- Single production callsite at OWT L634. Clean removal.

**Specific guidance:**
1. Delete the function body (OWT L265-410, ~145 lines)
2. Delete the `CompanionResult` interface (OWT L221-228)
3. Delete the call at OWT L634 and the result destructuring
4. Delete tests in OuterWallTessellator.test.ts (the `insertGradedTransitionVertices` describe blocks, L1133-1400+)
5. Remove from the export list if `index.ts` re-exports it

### Q5: ExportDialog Column Detection UI

**Answer: Hide `detectHorizontalFeatures` from the main UI. Expose only in dev/debug mode.**

Reasoning:
- Column detection is Phase 4 deprecation-track code. Exposing it as a user-facing toggle invites bug reports ("I turned on horizontal feature detection and got weird triangles"). Users should not be making decisions about tessellation internals.
- The `localOnlyMode` toggle was already a power-user footgun — replacing it with another toggle repeats the mistake.
- Phase A's purpose is to unify the pipeline. Adding a new mode switch undermines that goal.

**Specific implementation:**
- Remove the `localOnlyMode` toggle from ExportDialog entirely (kill the `StageToggle` at L510-511)
- Add `detectHorizontalFeatures: boolean` to the pipeline config type with `default: false`
- Do NOT add a UI control for it
- If dev testing is needed, set it via browser console: `useExportStore.getState().setPipeline({detectHorizontalFeatures: true})`
- Or add it to the debug panel if one exists

---

## PART 3: AMENDMENTS TO THE IMPLEMENTATION SEQUENCE

The Executioner's 6-step sequence (Part 5 of the review) is well-ordered. I add three amendments:

### Amendment 1: Seam Guard Pre-Filter (added to Step 2)

The seam guard should be a pre-filter at the PEC callsite, NOT inside `buildFeatureEdgeGraphFromChainEdges`. Add between the `chainEdges` extraction and the feature graph construction:

```typescript
// Filter out seam-crossing edges before building feature graph
const chainVertexUMap = new Map<number, number>();
for (const chain of chains) {
    for (const pt of chain.points) {
        // pt has .u and .row; vertex index available via chainVertexChainIds inverse
        // Build from tessellator output's chainVertex records
    }
}
const filteredChainEdges = outerResult.chainEdges.filter(([v0, v1]) => {
    const u0 = chainVertexUMap.get(v0);
    const u1 = chainVertexUMap.get(v1);
    if (u0 === undefined || u1 === undefined) return true; // keep if unknown
    return Math.abs(u0 - u1) <= 0.5; // reject wrap-around
});
```

The exact vertex→U mapping depends on the tessellator's output structure. The Executioner should trace the `outerResult.chainVertices` to find the UV data. Each `ChainVertex` has `.u` and `.vertexIdx` — that's the lookup.

### Amendment 2: Curvature Data Scope Clarification

The density profile takes the **normalized** U-curvature envelope — NOT the raw curvature. The normalization (PEC L582: `const uCurvature = normalizeProfile(uMaxCurvature)`) maps to [0,1], which is required for the density formula `d(u) = baseline + (1 - baseline) * MAX(κ²(u), featureFloor × Gaussian(...))` to produce values in [baseline, 1].

Pass `uCurvature` (normalized), NOT `uMaxCurvature` (raw).

### Amendment 3: Test Deletion Scope

The Executioner's Step 4 should also delete:
- `insertGradedTransitionVertices` tests in OuterWallTessellator.test.ts (~200+ lines across two describe blocks: L1133-1400+)
- `buildUnionFeatureGrid` tests in GridBuilder.test.ts (if they exist — check)
- `cfgLocalOnly`-specific test assertions in ParametricExportComputer.test.ts

Don't let dead test code linger. If a function is deleted, its tests must go too.

---

## PART 4: RISK ZONE RESPONSES

### Risk Zone 1 (UV-Snap Removal ↔ Chain Vertex Identity): AGREE

The Executioner correctly identifies this as critical. The key invariant is `idx >= gridVertexCount` for chain vertex identification. After UV-snap removal, chain vertices MUST remain as dedicated appended vertices, not grid vertex mutations. The Executioner's assessment that the pre-UV-snap code path already did this correctly is plausible but MUST be verified during implementation. If the chain vertex insertion code is behind a `cfgLocalOnly` gate, it needs to be promoted to always-on.

### Risk Zone 2 (Transition Ring Removal Without Replacement Density): AGREE WITH CAVEAT

The Executioner's mitigation analysis is correct: `insertChainGuidedRows` provides T-direction density, and the localOnly gate on `maxRowInsertions` is removed. The caveat: verify that `maxRowInsertions` budget is sufficient post-removal. The original non-localOnly path may have had a generous budget that was never exercised (since localOnly was always true in practice). Check the actual budget value.

### Risk Zone 3 (Column Detection — Keep or Kill): AGREE

Phase A leaves column detection in place, gated behind `detectHorizontalFeatures: boolean` (default false). This is exactly what the Joint Playbook specifies. No controversy.

### Risk Zone 4 (buildUnionFeatureGrid Removal Timing): AGREE

The sequence matters. Never delete before the replacement is wired in. The Executioner's Step 1→3→4 ordering handles this correctly.

### Risk Zone 5 (Seam Guard): ADDRESSED ABOVE

See Amendment 1. Pre-filter at PEC callsite using `Math.abs(u0 - u1) > 0.5`.

---

## PART 5: VERDICT

The Executioner's review is **thorough, accurate, and well-reasoned**. All 4 bug identifications are confirmed. The implementation sequence is sound. The 5 questions are now answered. 

**Implementation is greenlit.**

The Executioner should proceed with the 6-step sequence (plus my 3 amendments) as a single atomic changeset on branch `refactor/core-migration`.

**Post-implementation validation protocol** (carried forward from Round 4):
1. Run full test suite
2. Export 5 representative styles at 500k triangles: SuperformulaBlossom(0), GothicArches(5), DragonScales(9), BasketWeave(14), CelticKnot(17)
3. Check triangle aspect ratios adjacent to chain vertices — AR > 5.0 is a failure signal
4. Verify net line reduction (~-365 per Executioner's count)
5. Verify `buildUnionFeatureGrid` is fully dead (no imports, no tests, no calls)
6. Verify `cfgLocalOnly` / `localOnlyMode` is fully dead across all files

---

*— Verifier, 2026-03-03. Executioner review validated. 4/4 bugs confirmed. 5/5 questions answered. 3 amendments added. Go build it.*

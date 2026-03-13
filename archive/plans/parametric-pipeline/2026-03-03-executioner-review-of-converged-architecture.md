# Executioner Review — Converged Architecture (Phase A)

**Date:** 2026-03-03  
**Role:** Executioner (Claude Opus — implementation agent)  
**Responding to:** Generator Round 4 Closing + Verifier Round 4 Final Verdict + Joint Implementation Playbook  
**Purpose:** Feasibility assessment, file impact analysis, risk identification, implementation sequence planning

---

## PART 1: FEASIBILITY ASSESSMENT

**Verdict: FEASIBLE. The converged architecture can be implemented as specified.**

I've audited every file referenced in the kill list and build list against the actual codebase on branch `refactor/core-migration`. The line numbers are slightly shifted from the plan (typical after prior edits) but all targets exist and are structurally as described.

### Confirmed Code Locations

| Plan Item | Plan Location | Actual Location | Status |
|-----------|--------------|-----------------|--------|
| `buildFeatureEdgeGraphFromGrid` call | PEC L1304 | PEC ~L1304 (within feature graph construction block) | **EXISTS** — single callsite, clean swap |
| UV-snapping loop | OWT L707-755 | OWT L693-755 (binary search + collision + snap write) | **EXISTS** — ~62 lines, self-contained |
| `cfgLocalOnly` conditionals | PEC various | **14 locations** across PEC (L423, L440, L679, L691, L696, L705, L801, L860, L1042, L1045, L1056, L1066, L1168, L1177) | **EXISTS** — more pervasive than the plan's "~30 lines" estimate |
| `insertGradedTransitionVertices` | OWT L265-410 | OWT L265-410 (~145 lines) | **EXISTS** — matches plan exactly |
| `buildUnionFeatureGrid` + FLANK_OFFSETS | GridBuilder | GridBuilder L332-515 (function) + L22/L46 (constants) | **EXISTS** — ~183 lines for function, plus constants |
| `buildFeatureEdgeGraphFromChainEdges` | FeatureEdgeGraph | FeatureEdgeGraph L281-330 | **EXISTS** — ready to swap in |
| `generateCDFAdaptivePositions` | GridBuilder | GridBuilder L185-230 | **EXISTS** — already implemented, just needs the right density input |
| `computeRawCurvature` | PEC | PEC L550-589 (T and U strips, MAX aggregation, normalization) | **EXISTS** — curvature envelope already computed, just needs MAX + normalize step |

### Critical Discovery: `cfgLocalOnly` Is Deeper Than Planned

The Verifier's kill list says "~30 lines" for localOnly removal. The actual count is **14 conditional sites** across ParametricExportComputer.ts, touching:
- Grid column selection (L679)
- T-feature merging (L696)
- Column probing gate (L801)
- Base column count (L1042)
- Base U computation (L1045)
- Row insertion budget (L1056)
- Column adjustment (L1168)
- Union grid selection (L1177)
- Plus 6 console.log lines

This is closer to **~50 lines** of conditional logic, not 30. Not a blocker — just a more careful deletion job. Each site must be resolved to the "always-on" (non-localOnly) behavior, which is the correct unified pipeline.

---

## PART 2: FILE IMPACT ANALYSIS

### Files Modified (with net line changes)

| File | Kill (lines) | Build (lines) | Net | Complexity |
|------|-------------|---------------|-----|------------|
| `ParametricExportComputer.ts` | -50 (localOnly) -1 (graph swap) | +1 (graph swap) +15 (curvature envelope) +25 (density profile call site) +5 (CDF-adaptive call) | **-5** | **HIGH** — 6 separate edits in a 1875-line orchestrator |
| `OuterWallTessellator.ts` | -62 (UV-snap) -145 (transition rings) | +0 | **-207** | **MEDIUM** — two contiguous deletions |
| `GridBuilder.ts` | -183 (buildUnionFeatureGrid) -4 (FLANK constants) | +25 (buildDensityProfile) +15 (applyChainDeadZones) | **-147** | **MEDIUM** — kill one large function, add two small ones |
| `FeatureEdgeGraph.ts` | -0 | +3 (seam guard in existing function) | **+3** | **LOW** — surgical addition |
| `parametric/types.ts` | -1 (localOnlyMode field) | +0 | **-1** | **LOW** |
| `ui/controls/ExportDialog.tsx` | -5~10 (toggle UI) | +0 | **-8** | **LOW** |

**Grand total: ~-365 lines** (plan estimated -220; the discrepancy is because the plan undercounted `cfgLocalOnly` sites and I'm including the full `buildUnionFeatureGrid` deletion rather than just the call site).

### Files NOT Modified (Verification)

These files should be **unchanged** by Phase A — verify post-implementation:

| File | Why Unchanged |
|------|--------------|
| `ChainStripTriangulator.ts` | CDT input format unchanged; chain vertices are still free points + constraints |
| `ChainStripOptimizer.ts` | `chainDirectedFlip` still operates on chain UV data; strip detection via `idx >= gridVCount` unchanged |
| `ChainLinker.ts` | Chain linking algorithm unchanged in Phase A |
| `FeatureDetection.ts` | Row detection unchanged; column detection stays (just ungated) — wait, see Risk Zone 3 |
| `MeshSubdivision.ts` | Feature edge protection via `isFeatureEdge()` unchanged |
| `AdaptiveRefinement.ts` | Constraint edge protection unchanged |

---

## PART 3: RISK ZONES

### Risk Zone 1: The UV-Snap Removal ↔ Chain Vertex Identity (CRITICAL)

**The risk:** Currently, chain "vertices" in localOnly mode are grid vertices whose U has been overwritten. Downstream code (ChainStripOptimizer, MeshSubdivision) uses `idx >= gridVertexCount` to identify chain vertices. When UV-snapping is removed, chain vertices MUST retain their dedicated indices (idx >= gridVertexCount) — they must be inserted as separate vertices, NOT grid vertices.

**Verification needed:** After UV-snap removal, confirm:
1. `allChainVertices` are still appended with indices >= `gridVertexCount` in `buildCDTOuterWall`
2. The CDT receives both grid vertices AND chain vertices as separate point sets
3. `isChainVertex(idx)` tests still work throughout the pipeline

**My assessment:** The pre-UV-snap code path (v17.0-v18.0) already did this. The UV-snap was an overlay that REPLACED the chain vertex insertion with grid vertex mutation. Removing the UV-snap loop (OWT L693-755) and keeping the chain vertex insertion path (which should still exist in the non-localOnly branch) should restore correct behavior. But I need to verify the chain vertex insertion code is still present and not behind a localOnly gate.

### Risk Zone 2: Transition Ring Removal Without Replacement Density (CRITICAL)

**The risk:** The plan kills `insertGradedTransitionVertices` (145 lines). This function currently provides the ONLY mechanism for density near chain vertices. The replacement mechanism is the Gaussian feature floor in `buildDensityProfile`, which feeds CDF-adaptive column positions.

**The gap:** CDF-adaptive columns provide density in the U-direction. But transition rings provided density in BOTH U and T directions. After removal, chain vertices will have denser grid columns nearby (from the feature floor) but no extra T-direction density. If a chain edge spans a large T gap (e.g., a chain point at row 5, next at row 8 with no intermediate points), the triangle connecting them will be stretched in T.

**Mitigation:** This should be OK because:
1. `insertChainGuidedRows` (Phase 6 in the pipeline) adds rows near chain features — this provides T-direction density
2. The `maxRowInsertions` budget is freed by removing the localOnly gate (was 0 in localOnly mode, now uses the actual budget)
3. Chain gaps > 6 rows are already handled by the chain linker's `maxMissCount`

**Verification needed:** After implementation, check triangle aspect ratios adjacent to chain vertices in the T-direction. If AR > 5.0, we need row-direction density (not from transition rings — from chain-guided row insertion).

### Risk Zone 3: Column Detection Code — Keep or Kill? (AMBIGUITY)

**The plan is ambiguous on this point:**
- The Verifier's kill list does NOT include column detection removal (it only kills localOnly gate, UV-snap, transition rings, flanks)
- The Joint Playbook (Section 1.5) says: "Keep column probing gated behind `detectHorizontalFeatures: boolean`"
- The original column-detection-fix document (2026-03-02) proposes deprecating column detection entirely (Phase 4)
- But Phase A's scope does NOT include column detection removal

**My ruling:** Phase A leaves column detection code IN PLACE. The `cfgLocalOnly` gate on column probing (PEC L801) gets replaced with a `cfg.detectHorizontalFeatures` gate (as the Playbook specifies). This preserves existing code while making it opt-in. Column detection removal is a Phase 4 task, not Phase A.

### Risk Zone 4: `buildUnionFeatureGrid` Removal Timing (SEQUENCE-SENSITIVE)

**The risk:** The plan kills `buildUnionFeatureGrid` and replaces the grid construction with CDF-adaptive positioning. But `buildUnionFeatureGrid` is the ONLY thing that puts feature-aware columns in the grid today (when localOnly is false). If we kill it before the CDF-adaptive replacement is working, we lose all feature column awareness.

**Mitigation:** The implementation sequence MUST be:
1. First: Add `buildDensityProfile` + `applyChainDeadZones` (build list items 7-10)
2. Then: Replace the `buildUnionFeatureGrid` call with `generateCDFAdaptivePositions(densityProfile, ...)`
3. Last: Delete the `buildUnionFeatureGrid` function body from GridBuilder.ts

Never delete before the replacement is wired in.

### Risk Zone 5: Seam Guard Filter Coordinates (LOW)

The plan says: "filter edges where both vertices have U < 0.001 OR U > 0.999." This is a reasonable heuristic but needs to handle the wrap-around case: a chain edge crossing the seam has one vertex near U=0.999 and the other near U=0.001. The filter should catch edges where `|u1 - u2| > 0.5` (indicating a wrap), not just edges where both are near seam boundaries.

---

## PART 4: UNSTATED DEPENDENCIES

### Dependency 1: Curvature Envelope MAX Aggregation

The plan says "MAX of per-row `computeRawCurvature` results." But `computeRawCurvature` is currently called on T-strips and U-strips separately (PEC L550-585), producing `tMaxCurvature` and `uMaxCurvature`. These are then normalized into `tCurvature` and `uCurvature`.

The density profile needs a SINGLE curvature envelope per U position. The plan doesn't specify: **which curvature? T? U? Both?**

**My recommendation:** Use the U-curvature (`uMaxCurvature`), which is the MAX across all U-direction strips. This captures circumferential curvature variation — exactly what the U-grid columns need to adapt to. T-curvature drives row density, which is managed by `insertChainGuidedRows`.

### Dependency 2: Chain Vertex U Extraction Post-Resnap

`buildDensityProfile` takes `chainVertexUs: number[]`. This is "all chain vertex U positions post-resnap." The chain data is available in `chains: FeatureChain[]` at PEC around L897. Each chain has `.points[]` with `.u` fields. The Executioner will need to extract:

```typescript
const chainVertexUs = chains.flatMap(c => c.points.map(p => p.u));
```

This is straightforward but not specified in the plan.

### Dependency 3: `generateCDFAdaptivePositions` Parameter Threading

The existing `generateCDFAdaptivePositions(curvature, count, minSpacingFactor)` takes a curvature profile. The plan feeds it a density profile instead. These are semantically different:
- Curvature profile: raw curvature values, normalized to [0,1]
- Density profile: κ² + feature floor Gaussian, potentially exceeding 1.0

The CDF function internally does `density[i] = curvature[i] * curvature[i]` (squaring the curvature). If we pass a density profile that ALREADY includes κ², this squares it AGAIN (κ⁴). 

**Fix needed:** Either:
(a) Modify `generateCDFAdaptivePositions` to accept raw density (skip internal squaring), OR
(b) Pass `sqrt(densityProfile)` so the internal squaring recovers the correct density

Option (a) is cleaner. This is a small but important change the plan doesn't mention.

### Dependency 4: `applyChainDeadZones` Integration Point

The plan describes a dead zone filter that removes CDF columns near chain vertices. This function operates on the CDF output BEFORE the columns become grid positions. The integration point is:

```typescript
// Phase 7: Grid building
const rawCdfColumns = generateCDFAdaptivePositions(densityProfile, targetCols, 0.3);
const cdfColumns = applyChainDeadZones(rawCdfColumns, chainVertexUs, 0.0005);
// Use cdfColumns as the new unionU
```

This means `unionU` is no longer from `buildUnionFeatureGrid` — it comes from the CDF pipeline directly. All downstream code using `unionU` should work unchanged since it's still a sorted Float32Array of column positions.

---

## PART 5: IMPLEMENTATION SEQUENCE

The Generator correctly emphasizes: **all 10 items must land as ONE atomic changeset.** Here's my execution order within that single changeset, designed to maintain type-level correctness at each step:

### Step 1: Add new functions (no callers yet)
- Add `buildDensityProfile()` to GridBuilder.ts
- Add `applyChainDeadZones()` to GridBuilder.ts
- Add seam guard to `buildFeatureEdgeGraphFromChainEdges()` in FeatureEdgeGraph.ts
- Modify `generateCDFAdaptivePositions` to accept a `rawDensity` flag (skip internal κ² squaring)

### Step 2: Swap the feature edge graph (1 line)
- PEC: Change `buildFeatureEdgeGraphFromGrid(...)` → `buildFeatureEdgeGraphFromChainEdges(...)`
- Adjust arguments (different signature)

### Step 3: Wire up the new density pipeline
- PEC: After curvature computation (L589), compute MAX curvature envelope
- PEC: After chain linking (L897), extract `chainVertexUs`
- PEC: Call `buildDensityProfile(curvatureEnvelope, chainVertexUs)` 
- PEC: Replace `unionU` construction with `generateCDFAdaptivePositions(densityProfile, ...) + applyChainDeadZones(...)`

### Step 4: Kill the old mechanisms
- OWT: Delete UV-snapping loop (L693-755)
- OWT: Delete `insertGradedTransitionVertices` (L265-410)
- GridBuilder: Delete `buildUnionFeatureGrid` (L332-515) + FLANK constants
- PEC: Delete all `cfgLocalOnly` conditionals (replace with always-on path)
- types.ts: Remove `localOnlyMode` field
- ExportDialog.tsx: Remove localOnly toggle UI

### Step 5: Replace column probing gate
- PEC L801: Change `if (!cfgLocalOnly)` → `if (cfg.detectHorizontalFeatures)` 
- types.ts: Add `detectHorizontalFeatures: boolean` field (default: false)

### Step 6: Validate
- Run all existing tests
- Run 5-style visual validation per the Verifier's protocol
- Check triangle aspect ratios adjacent to chain vertices
- Verify net line count reduction

---

## PART 6: QUESTIONS FOR GENERATOR & VERIFIER

### Q1: Curvature Envelope — T or U?
The density profile drives U-column placement. Should the curvature envelope be:
(a) U-curvature only (circumferential — drives U-column density)
(b) MAX(T, U) curvature (captures both directions)
(c) Element-wise MAX across ALL strips (T + U combined)

I lean toward (a) for Phase A. If Generator/Verifier disagree, specify.

### Q2: `generateCDFAdaptivePositions` — Modify or Wrap?
Should I modify the existing function to add a `rawDensity` flag, or create a new function `generateCDFFromDensityProfile` that wraps it? The existing function is called in other places (grid dimension computation) — modifying it requires checking all call sites.

### Q3: Dead Zone Radius
The plan specifies `0.0005` U-space for dead zones. With base grid spacing ~1/735 ≈ 0.00136, a dead zone of 0.0005 means "don't place a CDF column within 37% of grid spacing from a chain vertex." Is this the right scale? Should it be relative to local CDF spacing instead of absolute?

### Q4: `insertGradedTransitionVertices` — Full Deletion or Stub?
The plan says delete. But `insertGradedTransitionVertices` is exported and called from `buildCDTOuterWall`. Should I:
(a) Delete the function body and all calls
(b) Keep the function signature but make it a no-op (return empty result)
(c) Keep it behind a feature flag for Phase B comparison testing

I lean toward (a) — clean kill. But if Generator/Verifier want Phase A vs pre-Phase-A comparison testing, (c) is safer.

### Q5: ExportDialog Column Detection UI
With `localOnlyMode` removed and `detectHorizontalFeatures` added, should the ExportDialog show a toggle for `detectHorizontalFeatures`? Or should it be debug-only / hidden?

---

## PART 7: SUMMARY

The converged architecture is sound and implementable. The 4-round debate produced a clean design. My concerns are:

1. **`cfgLocalOnly` is more pervasive than estimated** — 14 sites, not "~30 lines" → careful deletion required
2. **`generateCDFAdaptivePositions` internal squaring** — must be addressed to avoid κ⁴ density
3. **Transition ring removal** — T-direction density must be verified post-implementation via aspect ratio checks
4. **Seam guard edge filter** — should use `|u1 - u2| > 0.5` wrap detection, not just boundary checks

None of these are blockers. They're implementation details that need to be handled correctly during execution.

**Ready to implement on your signal.**

---

*— Executioner, 2026-03-03. Code reviewed. Architecture feasible. Five questions pending for Generator/Verifier. Implementation sequence defined. Waiting for go.*

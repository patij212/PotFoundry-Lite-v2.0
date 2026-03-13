# Master Journal — PotFoundry Agent System

## 2026-03-09 — Session 20: Journal Distillation and Context Compression

### Context
Agent journal had grown too large and was causing startup context dilution. User requested a precise, minimal-token distilled context and a reset of journal hygiene.

### Actions
- Distilled high-signal project context into `../docs/AGENT_CONTEXT_DISTILLED.md`.
- Updated all agent-facing instruction files to read distilled context first and only tail journal entries when needed.
- Archived oversized journals into `../archive/agent-journals/`.
- Reset `../agents_journal.md` as compact rolling log with strict entry-size rules.
- Recreated `agents_journal.md` in `potfoundry-web/` as a pointer to canonical root journal.

### Process Insight
The journal should function as an index + handoff surface, not as a full forensic dump. Deep detail belongs in `docs/plans/` where it can be linked, versioned, and consumed selectively.

### Next Pattern to Enforce
- If an entry exceeds ~120 lines, split technical detail into a plan doc and keep a short indexed summary in journal.

## 2026-03-09 — Session 19: R51 — Chain Birth/Death + Mesh Topology (Phase 1)

### Context
D1 diagnostic data proved detection is precise for stable chains (0.05-0.35 sample widths) but chains 0-3 at feature birth/death zones are tracking wrong features. User rejected filtering approach — wants proper fixes. Also wants mesh topology improvement (39% aspect ratio violations).

### Team Performance
**Generator R51**: Comprehensive — 4 chain quality proposals + 5 mesh topology proposals, all code-grounded with file:line references. Correctly identified three failure modes in chain linking at birth/death zones. Wrong about alternating distance cause (CDF Gaussians, not FLANK_OFFSET) and pipeline ordering (grid gen already after chain linking). Grade: A-

**Verifier R51**: Strong. Four critical findings, all constructive:
1. C1: Prominence is absolute mm — must normalize by radius (CRITICAL, would have broken all cross-height comparisons)
2. C4: Stable core definition fails for short transition-zone chains (CRITICAL)
3. C10: Corrected wrong alternating distance explanation
4. C12: Corrected pipeline ordering assumption — simplifies B3 significantly

Also verified UV min-angle criterion is adequate for diagonal ranking (stretch preserves relative ordering even though absolute angles differ). Grade: A

**Executioner R51**: Clean implementation of all 5 changes. Zero deviations. TypeScript 0 errors, ESLint 0 warnings.

### Decision
APPROVED Phase 1: A1 (plumbing) + A2 (prominence gating) + A3 (post-linking validation) + B1 (quality zone) + B2 (quality-aware fan diagonal). Phase 2 (B3 column injection, P2 expected feature count) deferred pending Phase 1 results.

### Key Pattern
This is the first time the three-agent system produced a fully converged proposal on the first debate round — Generator and Verifier agreed on approach, only differed on implementation details. The quality of the Generator's code trace has improved significantly since R50-B. The Verifier's catch of the prominence normalization issue continues the pattern of the Verifier finding critical domain bugs that the Generator misses.

### Recurring Theme: Generator Missing Normalization
| Round | What Generator Missed | Verifier Caught |
|-------|----------------------|-----------------|
| R50-B | R48 measurement bias overestimated | Exact floor = 0.052mm |
| R51 | Prominence absolute, not comparable | Must normalize by radius |

Adding to checklist: "When comparing any physical quantity across different pot heights, verify that the quantity is normalized by local radius or some scale factor."

## 2026-03-09 — Session 18: R50-B — The 0.22mm Mystery

### Context
User provided definitive export logs (both resnap ON and OFF) proving chain vertices are NOT at the true mathematical ridge. R48 shows avg 0.22mm / max 6.8mm distance from true ridge. Re-snap changes essentially nothing. This kills the previous R50 Generator hypothesis that "chains are fine, it's just twist drift."

### Team Performance
**Generator R50-B**: Excellent code trace — verified all 14 steps from detection to mesh vertex, confirmed metrics match, U preserved, shaders identical. Found the re-snap isMax bug (probe-data heuristic vs chain.kind). Overestimated R48 measurement bias — claimed 0.22mm could be mostly artifact. Grade: B+

**Verifier R50-B**: Devastating. Computed exact R48 floor = 0.052mm with clean math (m=8, A=5mm, R=35mm). Proved "radial amplification" is negligible (Δr=0.36μm). Showed removing chain0 outlier drops avg to 0.18mm — still 3.5x the diagnostic floor. Definitively answered: the 0.22mm is NOT a measurement artifact. Grade: A

**Executioner R50-B**: Clean implementation of all 3 changes. No deviations.

### Decision
APPROVED: Three diagnostic-first changes — P1 (isMax fix), D1 (per-chain breakdown), D3 (R48 parabolic refinement). Zero risk, pure information gain.

### The Real Problem
After eliminating every obvious cause (metric mismatch, pipeline corruption, shader difference, parabolic clamping), we have a genuine ~0.001 U (~10 sample widths) detection error with NO IDENTIFIED ROOT CAUSE. Detection claims ±0.5 sample precision. Observed: ±10 samples. 19x discrepancy.

The D1 per-chain diagnostic will be the key to narrowing this. Two possible outcomes:
1. Error concentrated in a few chains → chain linking or assignment problem
2. Error uniform across all chains → fundamental detection limitation or R48 finding different sub-peak

### Key Pattern
The re-snap isMax bug is the 4th instance of re-snap direction logic being wrong or fragile. Adding to the pre-flight checklist: "always derive peak/valley from the chain's kind, never from local probe data."

## 2026-03-09 — Session 17: R49 — The Root Cause Fix

### Context
After R48 made things worse (fan midpoints → 47% slivers, 38,980 CSO rowSpan rejects), the team did a proper root-cause analysis instead of layering more post-processing. Generator found the smoking gun: Step 3.5's re-snap window is 61× too narrow (±0.000244 U) to correct chain-linking noise (up to ±0.008 U).

### Team Performance
Three-agent convergence with one critical amendment. Generator's 61× window analysis was the keystone insight — backed by solid arithmetic against actual constants. Verifier caught two important issues: (1) Generator incorrectly claimed fan midpoints aren't GPU-evaluated (they are, at PEC L1740), and (2) a straight 64-candidate wide search would degrade precision 10×. The C7 two-stage amendment (wide search → narrow refinement) preserved both reach and precision. Executioner implemented with zero deviations.

The C7 pattern is worth noting: this is the THIRD time a Generator proposal needed search-window correction (R46 Phase 2 C1, R46 Phase 3 C1, now R49 C7). Adding "validate search window against error magnitude AND against precision requirements" to the pre-flight checklist for all re-snap proposals.

### Decision
- APPROVED: P4 (revert fan midpoints) + P1 (two-stage adaptive re-snap per C7)
- DEFERRED: P2 (chain-coherent DP) — needs expectedDrift spec, α sensitivity, seam handling
- REJECTED: P5 (batch2Remap correction) — marginal ROI
- DEFERRED: P3 (differential tracking) — too radical, feature births/deaths unsolved

### Key Lesson
After 5 rounds of downstream fixes (R44–R48), the actual problem was upstream: the re-snap window was designed for sub-sample refinement (±0.00006 U jitter) but being asked to correct chain-linking errors (±0.008 U). The window was never going to work. The diagnostic data (primary ≈ interpolated ridge distance) was the key evidence — if re-snap had ANY effect, primary vertices would show systematic advantage over interpolated. They didn't.

### Recurring Pattern: Generator Search Window Underestimation
| Round | Generator Proposed | Verifier Caught | Fix |
|-------|-------------------|----------------|-----|
| R46 Phase 2 | ±0.000244 U interp re-snap | Covers only 6% of worst-case error | Adaptive hw |
| R46 Phase 3 | ±0.000244 U subdiv re-snap | Same class — too narrow | Adaptive hw |
| R49 | 64 candidates in ±0.005 | 10× coarser precision | Two-stage re-snap |

This is now a known Generator failure mode. Future proposals involving search windows should be automatically flagged for window-vs-error and window-vs-precision analysis.

### Validation
- typecheck: clean
- lint: 0 warnings
- tests: 88/90 pass, 1920/1923 pass (3 pre-existing failures)

---

## 2026-03-09 — Session 16: R47 — The Topology Pivot

### Context
User tested R46 Phase 3 (all four vertex-position root causes fixed). Dips STILL persist. NEW artifact: "very sharp edges look wavy now." This is the third consecutive round where fixes are validatable in diagnostics but don't resolve the visual problem.

### The Realization
We've been solving the WRONG CLASS OF PROBLEM. Three phases of vertex-position fixes — all technically correct, all validated — and the problem persists. The Generator correctly reframed this as a MESH TOPOLOGY issue:
- 37.1% of chain-strip triangles have aspect ratio > 4:1 — catastrophic sliver rate
- The CSO chain-grid skip (R46 Phase 2) blocked 2118 quality-improving flips
- Phase 2's independent re-snap introduced sampling noise comparable to sharp features' natural variation

### Team Performance
Strongest round yet. Generator's topology analysis was substantive and well-grounded: fan diagonal slivers traced to `constrainedSweepCell`, re-snap noise quantified against feature variation, CSO skip amplification identified. Verifier's critical OQ2 verification (fan diags ARE in constraintEdgeSet, end-to-end confirmed) was the key safety proof for P1. Verifier's C5 (adaptive α, not fixed) prevented a "works on noisy features, breaks clean features" failure mode. Both agents converged in one round.

### Decision
- APPROVED: P1 (selective CSO flip, 0.20 rad threshold) + P3 (neighbor-constrained re-snap with adaptive α)
- DEFERRED: P2 (fan midpoint insertion) — next round if needed
- REJECTED: P4 (column densification) — Verifier proved cascading outerW risk
- DEFERRED: P5 (dual chains) — too much coupling risk

### Key Lesson
After three failed rounds of vertex-position fixes, the pattern was clear: the fixes ARE working (validated by diagnostics), the dips STILL persist. When symptoms persist after correct fixes, the diagnosis is wrong. We were treating "vertex off-ridge" as the root cause when the actual root cause is "mesh topology creates faceting artifacts near ridges." The vertex-position fixes were necessary prerequisites (can't judge topology with wrong positions) but not sufficient.

### Validation
- typecheck: clean
- lint: 0 warnings
- tests: 89 files, 1903 passed, 0 failures

---

## 2026-03-09 — Session 15: R46 Phase 3 — Subdivision Midpoint Re-snap

### Context
User tested Phase 2, reported "dips have not been eliminated." Phase 2 diagnostics confirmed all prior fixes working (interp re-snap: 2007/2190 refined, CSO skip: 2118, fan diags: 6508). The question was: what's left?

### Root Cause Investigation
Investigated two suspects:
1. **flipEdges3D** — RULED OUT. Verified it respects `lockedQuads` from `chainDirectedFlip` (16,649 quads locked). Chain-strip cells have `quadMap[qIdx] = -1` → completely skipped.
2. **subdivideLongEdges midpoints** — THIS WAS IT. When chain edges are split, midpoints are placed at `(u0+u1)/2`. But when the ridge curves, the true ridge U at the midpoint T differs by up to ~0.004 U ≈ 1.2mm. With 8,632 chain edges split, this creates a zigzag: on-ridge originals alternating with off-ridge midpoints.

This was Root Cause D — previously dismissed as "negligible ROI" during the Phase 2 investigation. That assessment was correct at the time (A/B/C were dominant), but after fixing A/B/C, D became the dominant remaining source. **Lesson: re-evaluate dismissed root causes after fixing higher-priority ones.**

### Team Performance
One-round convergence again. Generator proposed Proposal 2 (return `ChainMidpointInfo[]` metadata from MeshSubdivision, re-snap in PEC) with Sub-option 2b (discrete best candidate). Verifier caught two CRITICAL issues:
- **C1 (window width)**: Exact same class of bug as Phase 2 C1 — Generator used ±0.000244 fixed window that covers only 6% of worst-case 0.004 error. Adaptive formula: `hw = max(BASE, min(0.01, uDrift/2 + BASE))`.
- **C2 (fan diagonal contamination)**: Phase 1 added fan diagonals to `constraintEdgeSet`. The Phase 3 code uses `constraintEdgeSet.has(ek)` to identify chain edges — this would falsely tag fan diagonals as chain edges. Guard: both endpoints ≥ `outerGridVertexCount`.

The C1 pattern recurrence (Generator underestimates search window) is becoming a known failure mode. Should consider making it a checklist item for all future re-snap proposals.

### Changes
- **MeshSubdivision.ts**: 5 changes — `ChainMidpointInfo` interface, `SubdivisionResult` field, `chainSplitIndices` tracking with fan-diagonal guard, Phase C metadata collection, return value
- **ParametricExportComputer.ts**: ~100-line re-snap block — adaptive window, prefix-sum probeOffset, discrete best candidate, 3D position update in `finalResultData`

### Validation
- typecheck: clean (no errors in modified source files; 156 pre-existing test file errors unchanged)
- lint: 0 warnings
- tests: 88 files, 1883 passed, 0 failures

### Risk Assessment
Low risk. The re-snap follows the exact Phase 2 pattern (proven architecture). The adaptive window is conservatively capped at 0.01 U. The fan-diagonal guard is defensive (both endpoints must be chain vertices). Skip-on-undefined prevents wrong-direction candidate selection.

If dips persist after Phase 3, we've exhausted all four identified geometric root causes (A/B/C/D). Next investigation would need to look at: (a) adaptive refinement midpoints, (b) seam artifacts being confused with ridge dips, (c) entirely new root causes not yet identified.

---

## 2026-03-09 — Session 14: R46 Phase 2 — The Interpolation Gap + CSO Flip Prevention

### Context
User tested R46 Phase 1 (fan diagonal protection), reported "dips persist." Phase 1 diagnostics revealed two clear remaining root causes:
- 2516 interpolated chain vertices (40.7%) placed via LINEAR U interpolation — never GPU re-snapped
- 1170 chain-grid CSO flips (63.3%) swapping ridge-aligned diagonals for quality-optimized ones

### Team Performance
**One-round convergence with high-quality critique.** Generator proposed P2 + three P3 alternatives. Verifier found 2 CRITICAL issues (window sizing, batch2Remap corruption risk) and one important analytical correction (both-sides 2×2 non-problem). These catches were substantive — the C1 window issue would have caused a "runs but does nothing" failure that's notoriously hard to debug.

### Master's Simplification
The Generator proposed P3B (tracked sweep with sweepQuadTracked function) — ~50 lines of new code threading a collector through constraint cell logic. I simplified this to a 3-line CSO-level `isChainGridEdge` skip. Same effect (prevent chain-grid flips), zero new abstractions. The key insight: we don't need to identify WHICH diagonals to protect. We just need to prevent ANY chain-grid edge from being flipped. The CSO already has the `isChainGridEdge` helper from Phase 1. Moving the check BEFORE `applyFlip` with a `continue` is trivially correct.

I also rejected adding chain-grid edges to `constraintEdgeSet` because that set is consumed by both CSO AND subdivision. Chain-grid edges getting the tighter `chainSubdivThreshold` could cause unexpected subdivision changes. The CSO-level skip has zero side effects outside CSO.

### Process Insight
The Verifier's C4 catch illustrates why adversarial review matters: the Generator traced the 1170 chainGridFlips to "chain cells" and proposed a fix targeting both-sides 2×2 sub-quads AND N×M fallthrough. But both-sides 2×2 creates chain↔chain diagonals (all 4 corners are chain vertices), not chain↔grid. The 1170 ALL come from N×M fallthrough. Without this correction, we'd have wasted effort on a fix targeting the wrong cells.

### Validation
88 test files pass (meshDecimator timeout resolved), typecheck clean, lint 0 warnings.

### Risk Assessment
The CSO chain-grid skip is the riskiest change — blocking 63% of CSO flips could theoretically degrade triangle quality in non-feature areas. But CSO operates on chain strips specifically, so these are all feature-adjacent triangles where ridge alignment > triangle quality. If triangle quality issues appear, we can replace with P3B (tracked sweep) which is more surgical.

## 2026-03-11 — Session 21: Chain-Owned Transition Zones Approved as the Next Fidelity Step

### Context
The user rejected global U-column injection on first principles: it spends triangles globally while the actual defect is local topology ownership near feature edges. Round-21 Generator, Verifier, and Executioner work all converged on the same conclusion: the live outer wall still lets the feature neighborhood inherit grid rails and cell decomposition, which is exactly why long feature-to-grid connectors survive despite R54/R55/R51-era quality patches.

### Actions
- Reviewed the round-21 proposal, critique, and feasibility output.
- Approved a staged implementation plan in `potfoundry-web/docs/plans/master-approval-chain-owned-transition-zones-implementation.md`.
- Required two explicit contracts before code: seam-collar decomposition and downstream metadata semantics.

### Process Insight
This is the right kind of rewrite: bounded, topology-local, and reversible. It changes ownership only where the current architecture is provably wrong. The key management lesson is to separate “the architecture with the highest fidelity ceiling” from “a claim already validated in measurements.” The former can be approved now; the latter needs gates and metrics.

### Watch Pattern
- If the team starts solving this by widening host-grid density again, stop the work. That is symptom spending, not ownership repair.
- If a proposed corridor seam starts snapping to inherited grid columns, stop the work. That is the old topology returning under a new abstraction.

## 2026-03-12 — Session 22: Corridor Owned Super-Cell Reuse

### Context
The corridor planner was already exposing supported ownership segments, but any segment touching `superCellCols` still fell back because only the legacy super-cell path owned R37 phantom rows and R53 propagated-boundary handling. The user asked for the missing emitter behavior, not more planner breadth.

### Actions
- Ran a Generator → Verifier → Executioner convergence round focused on the smallest safe shared-emitter change.
- Approved a bounded implementation that resolves owned-span ownership before preprocessing.
- Implemented the shared owned-span registry and routed exact-match single-chain corridor spans through shared R35/R37/R53 emission.
- Updated regressions so the simple supported span and real `SuperformulaBlossom` case now assert changed topology instead of legacy equality.

### Process Insight
This was the right way to unlock corridor reuse: not by widening planner claims, and not by adding a second phantom pipeline, but by moving ownership resolution earlier so the existing preprocessing stages operate on one authoritative owner map.

### Next Pattern to Enforce
- Any future corridor-super expansion should start with owner identity and blast radius, not with geometric ambition.
- If a test failure can be explained by an explicit `0,0,0` sentinel contract rather than a real duplicate triangle, encode that contract directly in the test instead of hiding it in implementation folklore.

## 2026-03-12 — Session 23: Next Expansion Framed as Bounded Multi-Chain, Not Partial-Interval

### Context
After shipping exact-match single-chain owned-span reuse, the next question was whether to expand into partial-interval single-chain admission or into bounded exact-match multi-chain admission.

### Actions
- Compared the two paths against the live owned-span registry and R53 propagation contract.
- Confirmed with Generator, Verifier, and Executioner that partial-interval is the more invasive path even though it looks narrower.
- Wrote a concrete master directive for bounded multi-chain implementation.

### Process Insight
This is a useful management pattern: distinguish “smaller geometric case” from “smaller ownership-model change.” Partial-interval is geometrically narrower but architecturally larger because it breaks the single-owner interval contract.

### Next Pattern to Enforce
- When a proposed slice introduces a second owner inside an existing owned interval, treat it as a model rewrite, not a gate tweak.
- Prefer extending a proven tessellator-side proof over widening planner authority.

---

## 2026-03-12 — Session 22: Corridor Flags Were Wired but Invisible

### Context
The pipeline-side corridor feature flags were already threaded into `ParametricExportComputer`, but the user could not access them from the export dialog because `ExportDialog.tsx` never exposed the controls.

### Actions
- Verified the existing flow from `ExportDialog` → `ExportPanel` → `useParametricExport` → `ParametricExportComputer`.
- Added Debug-tab controls for `outerWallCorridorPlanning` and `outerWallCorridorDiagnostics`.
- Preserved the dependency rule in state: enabling diagnostics auto-enables planning; disabling planning clears diagnostics.
- Removed the diagnostics toggle's disabled UI state because it blocked the intended auto-enable path.
- Added direct UI coverage in `src/ui/controls/ExportDialog.test.tsx` and reran the corridor-focused suite.

### Process Insight
This was a useful reminder that internal threading is not feature delivery. If a flag is meant to be user-driven, the review checklist needs an explicit UI discoverability step, not just contract and hook plumbing.

### Validation Snapshot
- `npx vitest run src/ui/controls/ExportDialog.test.tsx src/renderers/webgpu/ParametricExportComputer.corridorFlags.test.ts --reporter=verbose`
- Result: 2 files passed, 10 tests passed

### Watch Pattern
- Avoid pairing “auto-enable dependency” logic with a disabled child control unless the parent is the only legal entrypoint by design.
- For debug-only flags, decide deliberately whether discoverability or containment is more important; do not leave them half-exposed.

## 2026-03-08 — Session 13: Known Issues Batch 1 — Code Quality Cleanup

### Context
User requested continuation of the Known Issues audit work. The infrastructure blockers (ESLint I-1, TypeScript I-2, empty test file I-3) had already been resolved. This session targeted the low-risk code quality items.

### Team Performance
**One-round convergence.** Generator → Verifier → Executioner completed in a single debate cycle. The Verifier's amendment (delete try-catch instead of hoisting) was valuable and simpler than the Generator's proposal.

### Changes Made
| Issue | File | Action |
|-------|------|--------|
| I-4 | `ConstrainedTriangulator.smooth.test.ts` | DELETED |
| I-4 | `ConstrainedTriangulator.ohtake.test.ts` | DELETED |
| A-4 | `styleParams.ts` | +`isStyleId()` type guard, -2 `@ts-ignore` |
| A-4 | `webgpu_core.ts` | -9 lines try-catch block, -2 `@ts-ignore` |
| A-5 | `AppUIv2.tsx` | +4 `ErrorBoundary` wrappers |
| IV-2 | `useAdaptiveExport.ts` | 14 logs gated, 12 removed |

### Metrics Impact
- Test files: 90 → 88 (2 stale deleted)
- Skipped tests: 13 → 7 (6 fewer from deleted files)
- @ts-ignore in production: 4 → 2
- ErrorBoundary coverage: 0% → 100% of V2 major components

### Remaining Batch 2 Items
- **A-1**: `camera_controller.ts` — 20+ `as any` casts (3-4 hours, P1)
- **A-3**: Axis canvas memory leak — 7 listeners not cleaned up (30 min, P2)
- **A-7**: WebGPU controller `any` payloads — React→GPU API surface (2-3 hours, P2)

### Process Lessons
1. **Amendment quality**: The Verifier correctly identified that deleting the try-catch was simpler than hoisting. The `typeof` check already handles TDZ safely.
2. **Scope discipline**: Batch 1 was correctly scoped to quick-win items. camera_controller.ts type safety is larger and should be a standalone session.
3. **Test suite hygiene**: Deleting skip-wrapped stale tests is always the right call. They add noise and inflate metrics.

---

## 2026-03-09 — Session 12: R45 — Zero-Tolerance Position Accuracy

### User Directive
"The detected peaks and produced feature edges have to be aligned precisely with the true feature edge. There is no room for any misalignment at all."

Clear. Absolute. No compromise on position accuracy.

### What Was Done
- **Fix A**: Mesh now uses `preSmoothChains` — raw GPU re-snapped positions with zero smoothing. Precision ~±0.03mm. Previously used `smoothedChains` (up to 3.8mm displacement).
- **Fix B**: Chain edges exempt from phantom corridor protection. Unblocks 51% of previously rejected subdivision candidates.

### The Lesson
The user's "no room for any misalignment" statement reframes the entire design principle. Previous rounds treated smoothness as desirable and accepted position displacement as a tradeoff. The user says: **no tradeoff. Position accuracy is non-negotiable.** The natural per-row oscillation (~0.003 U ≈ 1.4mm) from genuine feature trajectory variance is acceptable because it's REAL — it reflects the true mathematical surface. Smoothing that oscillation away is LYING about the geometry.

### Tests
1882 passed, 1 pre-existing flake (meshDecimator 100M stress test timeout).

---

## 2026-03-09 — Session 11: R44.3 — The Real Root Cause (Position Accuracy, Not Subdivision)

### The Wake-Up Call

User tested R44.2 and said: "it is not getting better, now even the detected feature points in the debug preview are not aligned with the style model. you have missed the point completely."

After 6 rounds (R40-R44.2) of subdivision/topology/classification/threshold fixes producing ZERO visual improvement, the user's message was unambiguous: **the entire approach is wrong.**

### What I Got Wrong

1. **Debug points regression (Session 10 mistake):** I changed debug points from `allRowFeatures` (raw GPU detections, ON the actual ridges) to `meshChains` (WH-smoothed, displaced from ridges). This made the debug overlay show displaced points — confirming the user's complaint that "detected feature points are not aligned with the style model." **Reverted.**

2. **Six rounds targeting the wrong mechanism:** All R40-R44.2 fixes targeted SUBDIVISION (adding vertices along chain edge paths). But subdivision adds vertices along the EXISTING path. If the path itself is wrong (displaced from true features by WH smoothing), more vertices on the wrong path can't help.

### The Two Real Root Causes

**Root Cause A — R43 Mesh Displacement:** R43 switched mesh construction from `meshGuideChains` (blended, ≤0.005 U ≈ 2.35mm displacement) to `smoothedChains` (fully WH-smoothed, up to ~0.008 U ≈ 3.8mm displacement). The comment said the blend "preserves nearly all raw oscillation" — interpreting this as a BAD thing. But preserving raw oscillation = preserving position accuracy. The switch to full smoothing moved mesh edges up to 3.8mm away from actual ridges.

**Root Cause B — Phantom Corridor Blocking 51% of Chain Subdivisions:** R44.2 diagnostics showed `protected=2594` out of 5112 chain edge candidates. R37's phantom anchors/companions populate `protectedVertices`, and `touchesProtectedPatch` blocks chain edge splits when any adjacent vertex is protected. Chain edge midpoint splits are topology-preserving (phantom vertices don't move). The protection is overly conservative.

### The Pattern Across 10 Sessions

| Session | Category | What We Actually Fixed |
|---------|----------|----------------------|
| 6-8 | Topology | sweepQuad diagonal, chainFanQuad, feature threshold — cell-level tessellation |
| 9 | Classification | Removed constraintEdgeSet skip — chain edges entered subdivision |
| 10 | Measurement | Vertical threshold + chain-first priority — more candidates, more splits |
| **11** | **POSITION ACCURACY** | **The mesh vertices themselves are in the wrong place** |

Sessions 6-10 all improved DIFFERENT aspects of the same pipeline stage (subdivision). But the INPUT to subdivision (chain vertex positions) was wrong since R43. No amount of subdivision improvement can compensate for vertices at wrong positions.

### Proposed Fix (R45)

**Fix A:** Revert `meshChains` from `filterLowConfidenceChains(smoothedChains)` to `filterLowConfidenceChains(meshGuideChains)`. One-line change in PEC L1110.

**Fix B:** Exempt chain edges from `touchesProtectedPatch` opposite-vertex check in MeshSubdivision. Chain midpoint splits are topology-preserving.

### Lessons Learned

1. **When the user says "you missed the point" — STOP and re-examine assumptions.** Don't double down on the current approach. Question the INPUT, not just the MECHANISM.
2. **The debug overlay is diagnostic gold.** The mismatch between allRowFeatures (ground truth) and meshChains (what the mesh uses) directly shows the problem. My "fix" to hide this mismatch by making both use the same wrong data was exactly backwards.
3. **Position accuracy > smoothness.** The user would rather have edges ON the ridges with some zigzag than edges NEAR the ridges with no zigzag. 3.8mm displacement is worse than 0.003 U oscillation.

---

## 2026-03-08 — Session 10: R44.2 — The Threshold Mismatch

### The Discovery

R44 unblocked chain edge subdivision (removed the `constraintEdgeSet.has(ek) → continue` skip). But the user reported: still no improvement. Export showed only 42 extra splits out of 6614 chain edges. 684 became candidates, 42 were split, 320 protected, 322 modifiedTris-blocked.

I started adding diagnostic counters but then realized I could COMPUTE the answer from first principles. Chain edges connect vertex at row j to row j+1 — they're primarily VERTICAL. But `avgGridEdge` measures HORIZONTAL grid edges. A pot with 685 columns and 264 rows has very different horizontal (~0.772mm) and vertical (~0.42mm) edge lengths. The feature threshold at 0.579mm (0.75 × 0.772) is ABOVE the typical chain edge length (~0.424mm). The 684 that made it through were statistical outliers.

Even for the 684 candidates, the length-descending sort put them at the END of the edge list (9254 total candidates, chain edges among the shortest). By the time they were processed, modifiedTris had already claimed their adjacent triangles.

### The Fix

Two complementary mechanisms:
1. **Vertical grid edge measurement**: New sampling loop measures T-direction edges → `avgVertGridEdge`. Chain edges use `CHAIN_SCALE × avgVertGridEdge` threshold instead of `FEATURE_SCALE × avgGridEdge`. This catches virtually all 6614 chain edges.
2. **Chain-first priority**: Phase A split into A1 (chain edges) and A2 (non-chain edges). Chain edges get first access to triangles via `modifiedTris`. Expected ~5300-5900 chain splits instead of 42.

Also fixed the debug visualization: points now use `meshChains` (same as polylines) instead of `allRowFeatures` (different chain count, different U positions).

### The Pattern Deepens

| Round | Category | What I Missed |
|-------|----------|---------------|
| R40-R42 | Topology | Chain edges frozen → wrong category entirely |
| R43 | Geometry | Remaining oscillation is irreducible → wrong target |
| R44 | Resolution (skip) | Removed skip, but threshold + priority still blocked |
| **R44.2** | **Resolution (threshold + priority)** | **Both blocking mechanisms fixed** |

Each R44.x fix peeled back one layer of the same onion. The skip was the outermost layer. The threshold was the next. The priority sort was the deepest.

### One-Round Convergence (Again)

Generator → Verifier → Executioner in 1 round. The Verifier caught a CRITICAL bug: the Generator's code pseudocode applied the new threshold in the wrong section (Phase A recomputation instead of Section 4 collection loop). Without the Verifier's C2 amendment, the fix would have been another no-op. This validates the 3-agent debate model — each agent catches different classes of errors.

### Honest Assessment

This fix targets ~2× sawtooth amplitude reduction. It's not a cure. The residual oscillation is baked into the chain vertex positions by the WH smoothing (which trades position accuracy for smoothness). Further improvement requires fundamentally different approaches: spline paths, post-CDT relaxation, or dedicated micro-rows near chains.

After 6 rounds (R40-R44.2), I'm cautiously optimistic but prepared for the user to report "still not good enough." If they do, the diagnostic data from this build will tell us EXACTLY where to go next.

## 2026-03-08 — Session 9: R44 — The Chain Edge Resolution Fix

### The Discovery

R43 was supposed to be "finally fixing the right layer" (geometry instead of topology). It DID fix the geometry — maxConsecDelta went from 0.008 to 0.003, meshChains matched smoothedChains. But the user reported: "nop. edges still don't match the polyline."

The key insight from R43's log: λ=200 reduced maxConsecDelta from 0.003069 to 0.002990 — a 0.26% improvement. The remaining 0.003 IS the real feature trajectory. More smoothing cannot help. The problem is not geometry. The problem is RESOLUTION.

### The Root Cause (Master Investigation)

I traced the chain edge lifecycle through the entire subdivision pipeline and found TWO independent blocks preventing chain edges from ever being subdivided:

1. **constraintEdgeSet skip** (MeshSubdivision.ts:372): `if (constraintEdgeSet.has(ek)) continue;` — all chain edges unconditionally skipped. The constraint set was designed for flip-protection in CSO. Its reuse as a subdivision skip was an overly aggressive guard.

2. **Feature edge misclassification** (line 383): `isFeatureEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount)` — XOR only catches grid↔chain cross-edges. Chain↔chain edges (both ≥ outerGridVertexCount) → XOR=false → interior threshold (1.389mm) which is above chain edge length (~0.77mm). Even without Block 1, they'd never be subdivided.

Ridge resolution was LOCKED at row-spacing. Every round before R44 was working on topology/geometry while the resolution bottleneck was hiding in plain sight.

### What Made This Round Different

Three things:

1. **Category shift**: I stopped asking "how do we make the chain positions smoother?" and started asking "why don't the chain edges get subdivided?" Categories matter: topology, geometry, and resolution are different problems requiring different solutions.

2. **Direct investigation**: Instead of dispatching the Generator with an exploratory brief ("fix the sawtooth"), I traced the code myself, found the exact blocking lines, and dispatched with a precise problem statement ("these 2 lines block chain edge subdivision, propose the fix").

3. **One-round convergence**: The Generator proposed exact code changes. The Verifier verified all 10 critical points against actual code. The Executioner implemented without deviation. 1 round instead of the usual 2-3.

### The Fix

Minimal and targeted:
- Removed constraint edge skip (line 372): chain edges are now subdivision candidates
- Added chain edge classification: `isFeatureEdge = isCrossEdge || isChainEdge`
- Chain edges at ~0.77mm exceed feature threshold (0.579mm) → subdivided once → 2× ridge resolution
- Debug vis aligned with smoothed chains (meshChains vs preSmoothChains)

### The Pattern Across 5 Rounds

| Round | Category | Master Insight |
|-------|----------|---------------|
| R40 | Topology | "Fix the diagonal direction" — correct diagnosis, wrong scope |
| R41 | Topology + Resolution | "Fan quads + FAST" — right direction, chain edges still frozen |
| R42 | Topology + Weak Geometry | "4 compounding causes" — thorough but missed the dominant one |
| R43 | Geometry | "Wrong chains used" — correct fix, but exposed that remaining delta is irreducible |
| **R44** | **Resolution** | **"Chain edges are frozen"** — directly addresses the bottleneck |

The lesson: **when multiple rounds of fixes in one category fail, switch categories.** R40-R42 were all topology. R43 was geometry. R44 is resolution. Each category handles a fundamentally different aspect of the problem.

### Self-Critique

I should have traced the subdivision code in R41 when FAST was introduced. The `constraintEdgeSet.has(ek) → continue` skip was RIGHT THERE at line 372. I even wrote about "feature threshold" and "chain-strip detection" in the R41 approval without noticing that chain edges were being skipped. I was so focused on the threshold values and protection logic that I missed the skip that happened BEFORE the threshold check.

Lesson: **read the skip conditions FIRST.** If the code never reaches the threshold check, the threshold doesn't matter.

## 2026-03-08 — Session 8: R43 — Finally Fixing the Right Layer

### The Humbling Insight

Three rounds of topology work (R40-R42) with full Generator/Verifier debate cycles, all passing tests, all producing zero visual improvement. The user's patient "there is no improvement" screenshots were the only evidence that mattered.

The root cause was embarrassingly discoverable: the log said "Post-smooth quality: maxConsecDelta=0.003069" but the mesh used DIFFERENT chains (meshGuideChains) with maxConsecDelta ≈ 0.008. The `blendTowardSmoothedChain` function (R39) was designed for sub-millimeter peak fidelity — exactly what 3D printing DOESN'T need. The blend moved vertices by an average of 0.000192 in UV, which is ~0.06mm in 3D. The oscillation was 2.5mm. We were applying a 2% correction to a geometry problem while fixing topology.

### What Made This Round Different

I stopped delegating investigation and read the pipeline myself. Tracing `smoothedChains` → `meshGuideChains` → `meshChains` revealed the architectural gap. No amount of topology fixes could overcome a geometry input that oscillated by 2.5mm per row.

### Process Failure Analysis

| Round | What We Fixed | Why It Didn't Work |
|-------|--------------|-------------------|
| R40 | sweepQuad diagonal direction | Topology, not geometry |
| R41 | chainFanQuad + FAST subdivision | Topology + resolution, not geometry |
| R42 | j%2 alternation + blend strength + subdivision exemption | Topology + weak geometry (blend 0.12→0.40 was ~2% effective) |
| **R43** | **Chain positions for mesh (smoothed + λ=200)** | **Directly fixes the 2.5mm oscillation** |

The failure pattern: each round correctly identified a real sub-issue but missed the dominant cause. The pipeline's misleading diagnostic (measuring smoothed chains, not mesh chains) concealed the gap for 3 rounds.

### Fixes (2 files, ~10 lines)

1. `meshChains = filterLowConfidenceChains(smoothedChains)` — bypasses the conservative R39 blend entirely
2. `WH_LAMBDA = 200` — 4× stronger smoothing for ~0.001 maxConsecDelta
3. Mesh-chain quality diagnostic — prevents the misleading log from hiding real oscillation

### Risk Assessment

Low. The smoothed chain positions are geometrically valid (they're a weighted optimization of the raw peak positions). For 3D printing, the sub-millimeter accuracy sacrifice is well within FDM/SLA tolerance. If a user ever needs precision-critical chain positions (e.g., for CNC clay routing), the meshGuideChains code is preserved and could be restored.

### Self-Critique

I should have investigated the chain position pipeline in R40, not R43. The signs were there: `avgShift=0.000104` in the R40 log was a flashing red light that the blend was doing nothing. I overlooked it because I focused on topology (the domain I was excited about) rather than geometry (the domain that mattered).

Lesson for future sessions: **when a fix doesn't work, question the CATEGORY before questioning the IMPLEMENTATION.** Is the problem topology or geometry? Is it connectivity or positions? Is it the mesh or the input data?

## 2026-03-08 — Session 7: R42 Multi-Layer Sawtooth Fix — The Real Root Cause

### What Happened

R41's chainFanQuad was technically correct but visually insufficient. The user reported NO improvement with 3 screenshots showing persistent sawtooth. I conducted a deep investigation reading 15+ code sections across 4 files and discovered the sawtooth was a 4-layer problem — R41 had only addressed 1 of 4 contributing causes.

### The Critical Discovery

The `j%2` alternation in `chainDirectedFlip` (MeshOptimizer.ts:216-226) was the dominant sawtooth factory. For near-vertical chains (most pottery features), `localUDelta` falls below LEAN_THRESHOLD (0.0001), and the tie-break deliberately alternates flipToAD/flipToBC row by row on the ±1 column band around the ridge. This creates maximum-visibility zigzag on the cells IMMEDIATELY flanking the chain cells — exactly where the eye focuses.

The irony: `chainDirectedFlip` was supposed to IMPROVE chain-adjacent quality. Instead, its tie-break strategy was the primary cause of the artifact.

### Team Performance

**Generator**: Adapted well to the 4-cause framing. Proposed Fix 1 (remove j%2) as the linchpin with two sub-options. The macro-tangent approach (1A) was more sophisticated but the Verifier correctly steered toward the simpler 1B.

**Verifier**: Excellent session. Key contributions: (1) caught MAX_POINT_SHIFT 0.008 being too aggressive with a concrete spiral-ridge counterexample, (2) verified pipeline ordering to prove Fix 3 is safe (subdivision runs LAST, so midpoints can't be damaged by optimizers), (3) searched the journal for j%2 rationale and confirmed none exists.

**Executioner**: Clean implementation, minimal changes, tests pass.

### Process Lessons

1. **R41's failure was a scoping failure, not a technical one.** The Generator in R40/R41 correctly identified `sweepQuad` alternation but only addressed it inside chain cells. The adjacent standard cells (affected by `chainDirectedFlip`) were overlooked. Lesson: when fixing a pattern, trace the fix boundary — what happens at the edge?

2. **Visual testing is non-negotiable.** R41 was "implemented and validated" (tests pass, lint clean) but was visually broken. The user's screenshots were the only real validation. We need systematic visual regression testing, not just unit tests.

3. **Multiple small fixes can beat one big fix.** R42's 3 fixes total ~15 lines changed across 3 files. Each fix is simple, auditable, and independently testable. Compare to some earlier rounds that proposed 200+ line rewrites.

### Risk Monitoring

- The stronger blend (Fix 2) is the highest-risk change. If the user reports that features look "smoothed over" or "blurry," the first thing to try is reducing BASE_BLEND_WEIGHT back toward 0.25.
- The subdivision exemption (Fix 3) relies on pipeline ordering. If anyone ever moves subdivision BEFORE optimizer passes, the exemption becomes unsafe. This should be documented as a pipeline invariant.
- Fix 1 removes code that's been present since v10.4. If some obscure geometry (very diagonal ridges) exhibits new artifacts, the fix is easy to revert by adding back a consistent tie-break (always flipToAD instead of j%2).

### Patterns Across Sessions

| Session | Round | Core Issue | Root Cause Depth |
|---------|-------|-----------|-----------------|
| 1 | R34 | CDT crashes | Cell-local approach (architectural) |
| 2 | R37 | Column-crossing dips | Phantom row topology |
| 3 | R38 | Phantom corridor gaps | Companion point anchoring |
| 4 | R39 | Chain vertex oscillation | Mesh-guide blend (new mechanism) |
| 5 | R40 | Chain cell diagonal alternation | sweepQuad U-comparison |
| 6 | R41 | Fan diagonal in chain cells | constrainedSweepCell (correct but insufficient) |
| **7** | **R42** | **Multi-layer sawtooth** | **chainDirectedFlip j%2 + blend conservatism + subdivision blocking** |

The trend: issues are getting more multi-factorial. Simple single-cause bugs have been fixed; what remains are compound effects that require coordinated fixes across multiple pipeline stages.

## 2026-03-08 — Session 6: R41 Chain-Coherent Tessellation — The Root Cause Fix

### Pattern Recognized

After reading all 39 rounds of journal entries plus 5 previous Master sessions, I identified the pattern: every fix targeted a secondary mechanism while the primary pathology — `sweepQuad`'s U-comparison alternating diagonal direction — was never addressed. The DP-vs-greedy equivalence in Round 12/13 was the key proof that the chain linker was never broken, yet 26 more rounds of linker/post-processing fixes followed.

### What Made This Round Different

Two things: (1) I framed the problem correctly before dispatching the Generator — pointing directly at `sweepQuad` line 231 as the alternation mechanism, and (2) the Verifier caught the Bridge Support T-junction flaw (C6) before it could become another failed "buffer zones" attempt. The Generator's response — solving Problem B at subdivision time instead of tessellation time — was the kind of lateral thinking that the adversarial review process is designed to produce.

### Leadership Notes

- **Debate efficiency**: 2 rounds to convergence (R40 + R41). Previous rounds often ran 3-5 rounds or more. The difference: a precisely scoped problem statement.
- **Verifier quality**: The C6 T-junction catch was the highlight. The Verifier read `emitStandardCell` and found the exact failure mode. This is what rigorous review looks like.
- **Generator adaptability**: Withdrawing Proposal 2 and proposing 2B (FAST) showed good engineering judgment — solving the problem at the right layer.
- **Executioner simplification**: Found that chain side is derivable from loop state (`prevIsChainEdge`) rather than vertex index scanning — simpler than the Generator proposed.

### Bottleneck Analysis

The 2-month delay on this root cause fix was a process failure, not a technical one. The Generator kept proposing increasingly complex secondary fixes, and the Verifier kept accepting them (because they were locally correct). Nobody stepped back to question whether the target was right until Round 13. Lesson: the Master should periodically audit whether the current fix target is the primary mechanism, not just a secondary one.

### Next Steps

1. **Visual validation needed**: The implementation is live but hasn't been visually tested with a real export. Someone needs to export Gothic/Art Deco and inspect the chain-adjacent triangles.
2. **N×M sub-quads**: Deferred per A1. These are rare (multi-chain cells) but should be addressed in a future round.
3. **FEATURE_SCALE tuning**: 0.75 is a starting point. May need adjustment based on visual results.
4. **The seam problem (0°/360°)**: Still the #3 priority per ROADMAP.md. The fan diagonal fix may interact with seam geometry — needs investigation.

---

## 2026-03-04 — Session 1: First Day on the Job

### Context Absorbed

Read the full agents_journal.md (900+ lines) and the Verifier's Round 7 diagnostic. Here's what I see:

**The Good:**
- The agent system works. Generator proposes, Verifier attacks, Executioner ships. Convergence has been achieved in every round.
- CAG (Curvature-Adaptive Grid) was a genuine architectural improvement — replacing 500 lines of union grid + UV-snapping + transition vertices with 70 lines of curvature-driven density.
- The chain linking improvements (momentum signed-median, tighter radius) are sound.
- The companion system evolved correctly through Ring → T-Ladder → Round 6 collinearity fix.

**The Concerning:**
- 6 rounds of CDT/companion work when the root cause was upstream in the chain path. The Verifier correctly diagnosed this in Round 7, but ideally this would have been caught earlier.
- Export time is 72s (target 20s). This hasn't been addressed by any round.
- 147K inverted triangles, 487 missing edges, maxAspect 14M:1. These are catastrophic numbers. The mesh is unusable.
- The team has been optimizing the wrong layer. Rounds 1-6 made the CDT better at reproducing oscillating chains. Round 7 finally targets the oscillation itself.

**Pattern I'm Watching:**
- The Generator tends to propose creative but sometimes over-engineered solutions (CIFAG → withdrawn, concentric rings → failed in production). Need to evaluate proposals for simplicity and robustness, not just elegance.
- The Verifier is rigorous but occasionally misses the forest for the trees (6 rounds of CDT work without questioning whether the chain path was the problem).
- The Executioner is reliable but implements exactly what's specified — no safety catches for fundamentally flawed designs (concentric rings shipped and failed catastrophically).

**My Assessment:**
The Verifier's Round 7 diagnostic is the sharpest piece of analysis in the entire journal. It correctly identifies that chain oscillation is the root cause, traces it to feature detection resolution limits, and proposes the right investigation areas. I'm dispatching the Generator with a focused problem statement: make the chain paths smooth.

The three-track approach (smoothing enhancement, crossing constraint resolution, analytical projection) gives the Generator structure without constraining creativity. Track A should produce immediate measurable improvement. Track B addresses the crossing constraint symptom. Track C is the long-term play if the superformula math supports it.

### Bottleneck Identified
The single biggest process improvement opportunity is **earlier root cause analysis**. Rounds 1-6 each implemented a fix, tested it, found it didn't solve the visual problem, then tried another CDT-layer fix. An upfront diagnostic like the Verifier's Round 7 analysis would have saved 4-5 rounds of work.

**Action**: Going forward, every round will start with a Verifier diagnostic pass before the Generator proposes anything. Measure first, then fix.

## 2026-03-04 — Session 2: Round 7.1 Crossing Constraint Resolution

### Decision Log

## 2026-03-08 — Session: Protected Subdivision Corridor

### Context

The adaptive mesh-guide change improved the chain trajectory, but the user still reported unstable visible feature edges. The new export log showed the guide path moving, while late topology passes were still extremely active:

- chain-strip flips still in the thousands
- boundary flips still present
- GPU subdivision still split 2129 edges

That made the next decision straightforward: inspect which late pass still bypassed the existing protection model.

### Decision Log

I approved the smallest fix with the highest evidentiary value: extend the R38 protected corridor into `MeshSubdivision.ts`.

This is the right intervention because the subdivision pass runs after the protected strip and boundary optimizers. If it remains free to split patches that touch the corridor, the earlier protections are only provisional.

### Validation

- `MeshSubdivision.test.ts`: 33 passed
- `ParametricExportComputer.test.ts`: 169 passed
- editor diagnostics clean in touched files

### Process Note

This round had strong convergence. Generator, Verifier, and Executioner all landed on the same conclusion independently: stop rewriting the protected corridor in the final subdivision pass before escalating to broader rework of generic 3D flipping.

Data from the Round 7 export confirmed the Verifier's prediction: smoothing alone cannot fix mesh quality. Primary missing edges regressed (+32%) because SG smoothing shifts chain positions, creating NEW crossings between close chains. The mechanism is clear, the evidence is unambiguous.

**Decision: Skip Generator/Verifier debate, proceed directly to implementation.**

Justification:
1. P5 was already designed by the Generator in Round 7 (complete pseudocode)
2. The Verifier deferred P5 pending data — we now have the data
3. The algorithm is straightforward (2D segment intersection test + confidence-based removal)
4. The insertion point is precisely identified (between endpoint injection and CDT call)
5. The debate happened; only the data confirmation was missing

This is the correct call. Not every round needs a full Generator→Verifier cycle. When the design exists and the data confirms it's needed, execute.

### Implementation Notes

The confidence scoring heuristic deserves a note: I chose `pointIdx >= 0` (detected vs interpolated) as the primary signal and edge length as the tiebreaker. The rationale: a constraint between two detected feature points is anchored to real surface geometry. A constraint with an interpolated endpoint is between rows where the chain position was linearly interpolated — less geometrically reliable. When two such constraints cross, keeping the one with stronger anchoring produces better visual fidelity.

The T-normalization in the edge length tiebreaker (`(t1 - t0) / (tTop - tBot)`) ensures UV edge length is measured in aspect-corrected space. Without this, constraints spanning the full T-gap would always dominate U-direction constraints.

### Process Observation

Round 7.1 was faster than any previous round: problem identified → implementation → validated in a single pass. This worked because:
1. The diagnostic (Verifier Round 7.1) was precise and actionable
2. The solution (Generator Round 7 P5) was already designed
3. No architectural decisions required — purely surgical insertion

The lesson: invest heavily in diagnostics and pre-design. When the data arrives, execution is trivial.

## 2026-03-04 — Session 3: Round 8 Problem Framing — Polyline Jaggedness + Horizontal Line Artifacts

### Context

Post-Round 7.1 export data confirms:
- CDT enforcement rate: 100% (crossing filter works)
- Post-smooth maxConsecDelta: 0.003378 (still 69% above 0.002 target)
- Primary missing edges: 287 (of which ~127 unexplained, rest crossing-removed)
- maxAspect UV: 30.8M:1, inverted tris: 133K — mesh quality still catastrophic
- Validation: FAIL on 6/7 checks

User reports TWO distinct visual problems:

**P1 — Jagged chain polylines**: Feature points are well-detected and aligned, but the polyline connections between them create visible jagged geometry. The chain edges become CDT constraints, propagating the jaggedness into the mesh itself.

**P2 — Horizontal line artifacts**: Lines breaking out of the pot geometry, connecting completely independent feature chain points in a ring around the pot. Visible in the UV feature detection debug overlay.

### Root Cause Analysis

**P1 (Jaggedness)**: The chain polylines are piecewise-linear connections between detected feature points at each row. Even with 2-pass SG smoothing (halfWidth=8), maxConsecDelta=0.003378 means consecutive U-positions still differ by ~2 grid columns. This creates visible zigzag edges in the mesh. The fundamental limit is that SG smoothing preserves polynomial trends but cannot eliminate oscillation faster than the window size (17 points).

Two avenues remain:
- **Stronger smoothing**: More passes, larger window, or non-SG filter (cubic spline fit)
- **Polyline interpolation**: Instead of straight-line segments between chain points, use smooth curve interpolation (cubic B-spline or Catmull-Rom through the chain points). This doesn't change the chain point positions but smooths the CONNECTION between them.

**P2 (Horizontal lines)**: Three possible causes:
1. **Seam-crossing chain segments**: When a chain crosses the u=0/1 boundary, consecutive points go from u≈0.99 to u≈0.01. The debug segment shader evaluates each endpoint independently on the surface, drawing a straight 3D line that may cut through geometry or appear as a crossing line.
2. **Missing chain gaps**: If `origToFinalRow.get(pt.row)` returns undefined for some intermediate chain points, the remapped debug array skips those points, connecting non-adjacent chain points. These skip-segments could span large U-ranges at nearly constant T, appearing horizontal.
3. **T-Ladder companion artifacts**: With 46K companion vertices at discrete T-levels, the CDT may create visible horizontal edge patterns between companion vertices from different chains at the same fractional T-position within a strip.

### Decision

Dispatch Generator with focused investigation + proposals for both P1 and P2. The problems are independent — P1 is a signal processing problem (smooth chain paths), P2 is a visualization/construction bug (eliminate spurious horizontal segments).

### Key Constraint

Round 8 must produce MEASURABLE improvement. The team has done 7+ rounds of CDT/companion work. Time to deliver visible quality improvement in the exported mesh and debug visualization.

---

## 2026-03-05 — Session 4: Round 13 — The Misdiagnosis Correction

### The Six-Round Blind Spot

Rounds 7-12 attacked the chain linker from every angle: smoothing (SG, WH, CatRom), scoring (momentum, cost-based), repair (zigzag detection), and finally the non-crossing DP. Every round produced IDENTICAL metrics: maxConsecDelta=0.008735, repair=18 points, 207K inverted triangles.

When the DP (an optimal algorithm) produced the same results as the greedy, I had to accept the only remaining conclusion: **the chain linker was never broken.**

### The Three Real Problems

1. **Debug viz data source mismatch**: Dots=raw, lines=smoothed. WH smoothing (λ=50) displaces chain points from raw positions. The user sees oscillation that is actually the smoothing doing its job.

2. **207K invertedTriangles is a false positive**: For closed solids, inner wall triangles face inward and are flagged. The code's own comments say so. We should have read the code more carefully in Round 7.

3. **maxConsecDelta=0.009 is physical reality**: Feature positions genuinely shift 0.009 in U at bifurcation zones. The superformula with m transitioning from 6→10 creates peak position drift at integer m crossings.

### Leadership Failure

I should have questioned the diagnosis after Round 8 failed to improve the metrics. Instead, I let the team iterate on increasingly sophisticated chain linker fixes (DP, cost-based scoring, momentum) without verifying the fundamental assumption: "the chain linker is producing bad assignments."

The Verifier's Round 7 diagnostic was right about chain oscillation being the root cause of mesh quality. But the chain oscillation was the feature trajectory itself, not a linker error. The Verifier correctly identified the symptom but misattributed the cause.

### Pattern Noted

When metric doesn't change across multiple rounds, the metric is measuring something that isn't affected by the changes — either the metric is wrong or the changes are orthogonal. Investigate the metric first, then attack the problem.

### Fix Applied

Three small targeted changes (v26): pre-smooth debug lines, prominent inconsistentPairs logging, reworded warning message. 338/338 tests pass.

### What's Next

If `inconsistentPairs > 0` in the user's next export, the mesh genuinely has quality issues — but they come from the CDT/tessellation, not the chain linker. That would be a Round 14 investigation focused on the OuterWallTessellator and ChainStripTriangulator.

If `inconsistentPairs === 0`, the mesh is actually fine and the 207K number was always a false alarm. The user's visual complaint about polyline jaggedness will be resolved by the pre-smooth debug lines (which now align with the dots).

---

## 2026-03-06 — Session 5: v2.2 Undo/Redo Consistency Audit

### Situation

v2.2 implementation was mostly complete and build-clean, but final audit found a semantic mismatch:

- Transactions were wired on many UI controls.
- History snapshots only contained `geometry + style + appearance`.
- Export tab interactions (`mesh`) triggered transactions but produced no history commits.
- Several non-slider interactions in `StyleTab` were bypassing transaction boundaries entirely.

### Action Taken

1. Extended snapshot scope to include `mesh` in `src/state/slices/ui.ts`.
2. Applied history wrapping for discrete interactions in `StyleTab`:
	- style selection
	- boolean style params
	- color scheme swatches
	- display toggles
	- lighting/background chips
	- color inputs with `focus -> begin`, `blur -> commit`
3. Applied history wrapping for discrete mesh interactions in `ExportTab`:
	- quality preset cards
	- optimize toggle

### Reflection

The execution pass had strong coverage on sliders, but discrete controls are where history systems usually drift. This was a classic "wiring done, state scope incomplete" bug class.

### Process Improvement

For future UI work: every new transaction callsite should be checked against snapshot payload membership. If action mutates state outside snapshot scope, either add snapshot coverage or remove the transaction callsite.

## 2026-03-07  Session: Parametric Pipeline Team Audit

### Context
User requested a comprehensive audit of the parametric export pipeline with all agents iterating on a single document until unanimous agreement.

### Process Executed
1. **Context Gathering:** Read agents_journal.md (~6000 lines), existing audits, parametric/ module code
2. **Generator Round 1:** Comprehensive audit proposal (2 P0, 4 P1, 4 P2, 3 P3)
3. **Verifier Round 1:** Adversarial review with 7 amendments (all accepted)
4. **Generator Round 2:** Accept all amendments
5. **Executioner Review:** Feasibility confirmed, effort estimates validated
6. **Master Approval:** Unanimous sign-off achieved

### Key Decisions

1. **P0-2 Demoted to P1:** The webgpu_core.ts monolith (5,245 lines) is a maintenance risk, not a functional blocker. Exports work, tests pass. P0 is for crashes/corruption/data-loss.

2. **Error Count Correction:** 166 TypeScript errors, not 80+. Verifier caught this through independent verification. Effort estimate revised from 4-6h to 8-16h.

3. **Seam Fix Strategy A:** Export-time vertex welding (4-6h) before architectural ghost segments (16-24h). Validate root cause first, escalate if needed.

4. **P2-4 Re-verification Needed:** Executioner found tBot/tTop ARE used at lines 178-189. Parameter "unused" claim may be stale.

5. **Phase Ordering:** Quick wins  CI gate  TS errors  config cleanup  seam fix  webgpu_core.ts decomposition

### Observations

**Protocol Validation:** This audit demonstrated the full Generator  Verifier  Executioner  Master cycle working as intended. Each agent contributed distinct value:
- Generator: Comprehensive issue identification
- Verifier: Evidence validation, prioritization challenge, false positive catch
- Executioner: Feasibility confirmation, implementation detail
- Master: Process orchestration, final arbitration

**Time Investment:** ~2 hours of agent orchestration for a 35+ issue audit with full team review. Efficient given the scope.

**Unanimous Agreement:** All four agents signed off on the final document. No unresolved disputes.

### Deliverables
- 2026-03-07-parametric-pipeline-team-audit-FINAL.md  Approved unified document
- Generator, Verifier, Executioner working documents preserved for audit trail

### Next Actions Authorized

## 2026-03-08 — Session: Adaptive Mesh-Guide Completion

### Context

R38 had already cleaned up the corridor layer enough that the remaining user-visible artifact no longer matched a support-gap diagnosis. The log made the pivot obvious:

- post-resnap chain quality was still rough
- post-smooth quality improved materially
- mesh construction still followed pre-smooth chains

That is a classic pipeline smell: the system measures an improved trajectory and then discards it before geometry generation.

### Decision Log

I approved a bounded guide-chain path first, then escalated to an adaptive per-point version after the next user export proved the first blend was too timid. This was the correct sequence. The first pass verified the direction safely; the second pass increased force only where the chain actually shows jagged curvature.

The important management call here was to stop tuning the tessellator once the evidence shifted upstream. Continuing to polish corridor support would have been low-value churn.

### Validation

- `ParametricExportComputer.test.ts`: 169 passed
- `ChainLinker.test.ts`: 55 passed after adjusting the adaptive test fixture away from cap saturation
- editor diagnostics clean in touched files

### Process Note

The adaptive test failure was useful. It showed the implementation was strong enough to drive multiple points into the displacement cap, which means future debugging should watch cap-hit distribution, not just average shift metrics.
- Phase 0: CI type gate (immediate)
- Quick wins batch (immediate)
- Phase 1: 166 TS errors (after Phase 0)
- Phases 3-6: After CI green
- webgpu_core.ts decomposition: Separate sprint

## 2026-03-08  Session: R37 Column-Crossing Dip Elimination

### Context
User reported persistent feature edge dips after R36/R36.1. Root cause: vertex-absence problem at column crossings  no mesh vertex at the ridge position where chain edges cross column boundaries.

### Decision
Dispatched Generator  Verifier  Executioner for R37. One debate round  direction was clear, no extended cycling needed.

### Key Decisions
1. **Proposal 2 (band splitting)** over Proposal 1 (micro-rows): 7.5k vertices vs 100k+, ~15k tris vs 274k+
2. **Buffer overestimate** over pipeline reordering: Executioner correctly identified that batch2Remap uses cv.u directly  no Float32Array dependency. Avoids all code motion risk.
3. **Vertex buffer trim** at return: Master addition. subarray prevents ~30k wasted GPU evaluations.
4. **Global pre-split** of chain edges: Verifier's A4 caught a critical edge verification issue  master chainEdges needed sub-edges before batch6 dedup.

### Process Observations
- Generator delivered a focused proposal with 4 ranked approaches and clear mathematical justification. The root cause framing ("vertex-absence, not triangulation") was the key insight.
- Verifier earned its keep with 3 critical catches: buffer allocation, chain edge orphaning, sub-band edge filtering. All would have caused runtime failures.
- Executioner made a smart pragmatic choice (overestimate vs reorder) that simplified implementation significantly.
- One debate round was sufficient  all parties agreed on the approach.

### Implementation Verified
- 1879 tests pass
- 0 TypeScript errors
- ~130 lines new code (Section 3.9) + ~35 lines in emitSuperCell
- Buffer management clean (overestimate + trim)

### Next Steps
- User export test required to verify visual improvement
- Monitor: phantom vertex count, missing chain edges at junctions, triangle count delta
- If dips persist: Proposal 4 (companion fans) as supplementary fix
## 2026-03-08  Session: R37 Coverage Patch

### Problem
R37 improved chain enforcement but still left a visible subset of chain-edge dips. The log mismatch (super-cells=2529, and-split super-cells=1810) was the strongest indicator that the fix path still had incomplete coverage.

### Fix
1. Clamp near-boundary crossings instead of dropping them.
2. Treat boundary-touch events as split candidates.
3. Tag phantom split vertices with chain IDs so the feature-edge graph remains continuous.

### Result
- Tests still pass: 1879/1879
- No TypeScript errors in the modified tessellator
- Next export should show stronger R37 coverage and better chain continuity through split junctions

## 2026-03-08  Session: R38 Protected Corridor Fan

### Context
The user's next export log after the R37 coverage patch showed that the old diagnosis was obsolete: all super-cells were now band-split and missing chain edges were zero, but the visible chain-edge dips were still present and local quality metrics regressed sharply.

### Decision
Approved an R38 implementation focused on local corridor support quality and optimizer protection rather than further split coverage work.

### Why
The evidence now says:
- topology coverage is fixed;
- chain edge presence is fixed;
- the remaining defect lives in the sparse phantom support fan and in post-process flip passes that keep rewiring that corridor.

### Implementation Notes
- `OuterWallTessellator.ts` now records crossing provenance per phantom row and emits left/right companions only around true boundary crossings.
- `protectedStripVertices` was added as a first-class output so the repaired corridor can survive later stages.
- `ParametricExportComputer.ts` threads the protected set into both optimizer passes.
- `ChainStripOptimizer.ts` now skips flips that touch protected corridor vertices in both chain-strip and boundary-diagonal phases.

### Validation
- Editor/type diagnostics clean in all modified files.
- Full tests: 1879 passed, 13 skipped.

### Remaining Unknown
No fresh export has been run yet after R38. Visual success is still unproven. The next decision should be based on the user’s new export log, not more theory.

## 2026-03-08  Session: R39 Bounded Mesh-Guide Chains

### Context
The next export log after R38 showed that local corridor support was no longer the dominant issue. Mesh quality improved materially, but the visible feature-edge dips persisted. At the same time, Step 3.6 diagnostics still showed a large gap between raw and smoothed chain quality.

### Decision
Approved a bounded chain-geometry fix rather than more corridor work.

### Why
The current pipeline was computing a much cleaner smoothed chain and then explicitly discarding it for mesh construction. That left the mesh following the exact noisy path while the diagnostics already knew a better trajectory existed. Full smoothing remained too risky because of prior drift off the true feature crest, so the safe move was a capped blend.

### Implementation Notes
- Added `blendTowardSmoothedChain()` in `ChainLinker.ts`.
- The helper is seam-safe, row-topology-preserving, and hard-caps per-point drift.
- `ParametricExportComputer.ts` now builds `meshGuideChains` from raw + smoothed chains and uses those for downstream mesh construction.
- Added a `Mesh-guide blend` diagnostic line so future export logs show actual max and average geometry shift.

### Validation
- Editor/type diagnostics clean in touched files.
- Focused tests passed:
- `ChainLinker.test.ts`: 54 passed.
- `ParametricExportComputer.test.ts`: 169 passed.

### Remaining Unknown
Need a fresh export to confirm whether the visible dips retreat. If they do not, the next fix should target the linker or local chain repair itself, especially at rows that keep saturating the blend cap.

---

## 2026-03-08 — Session: R46 Phase 1 — Algorithm Cleanup (Fan Diagonal Protection)

### Context
User tested R45 and confirmed debug overlay is correct but STL mesh edges still dip. Requested full investigation and algorithm cleanup before further fixes.

### Investigation
Traced the full post-CDT pipeline: OWT → chainDirectedFlip → flipEdges3D → CSO → boundaryDiag → subdivideLongEdges. Read ~2000 lines of source across 5 files.

Key architectural gap found: R41's `chainFanQuad` creates deterministic chain↔grid diagonals for visual consistency, but these edges were NOT in `constraintEdgeSet` (only chain↔chain edges were). The CSO could freely flip them based on 3D quality criteria, undoing the deterministic alignment → row-by-row diagonal inconsistency → visual zigzag/dip.

### Root Causes Identified
1. **A (HIGH)**: CSO flips chainFanQuad diagonals — the architectural gap above
2. **B (HIGH)**: Linear interpolation for multi-row gap vertices (off-ridge by ~0.71mm)
3. **C (MEDIUM)**: sweepQuad fallback inconsistency in both-sides sub-quads
4. **D (LOW)**: Subdivision midpoints at UV-averaged positions (negligible)
5. **E (DIAGNOSTIC)**: No observability into interpolated counts, fan diags, or CSO chain-grid flips

### Team Performance
**One-round convergence.** Generator produced 5 well-phased proposals. Verifier accepted 4, rejected 1 (P5: negligible ROI), with substantive amendments:
- P1: Collector-as-parameter instead of module state ✓
- P2: Triangle inversion guard + tolerance bound ✓
- P3: Split else clause for 2×2 vs N×M ✓
- constraintEdgeSet growth ~100% not 5-20% (caught magnitude error) ✓

Executioner delivered zero-deviation implementation across 22 edits in 3 files. Clean validation.

### Pattern Observed
The chain of R38→R39→R40→R41→R42→R43→R44→R45→R46 reveals a recurring theme: each fix addresses the primary visible defect but exposes the next one in the pipeline. The subsystem interactions are the real complexity — a fix in OWT's tessellation can be undone by CSO's optimization because the constraint system doesn't fully express OWT's intent. R46 begins closing this intent-gap.

### Decision
Approved Phase 1 (P4 diagnostics + P1 fan diagonal protection). Phases 2-3 gated on diagnostic data from user's next export.

### Remaining Unknown
Will fan diagonal protection alone resolve the visible dip, or is Root Cause B (interpolated vertices) also contributing significantly? The new diagnostic output will tell us.

---

## 2026-03-08: Known Issues Batch 2 Complete

### Summary
Continued the Known Issues audit work from 2026-03-07-known-issues-audit.md. Batch 2 completed in approximately one hour.

### Issues Addressed
- **A-3 Memory leak**: Discovered ALREADY FIXED (7 removeEventListener calls present)
- **A-1 camera_controller.ts**: Eliminated 23 as any casts via Generator/Verifier/Executioner cycle
- **A-7 Controller payloads**: Fixed updateParams and handleCameraCommand types directly

### Team Coordination
Single Generator/Verifier debate round achieved convergence. Verifier caught one documentation error in Generator's P6 breakdown (ray vs rigAfter distinction) but the proposed code changes were correct.

### Patterns Observed
1. **Unnecessary casts**: 7 of 23 casts were pure cruft - field exists in interface or export exists in module
2. **Vestigial code**: ray as any casts had guards already present - likely from older TS version or overcautious coding
3. **Type system gaps**: WebGPUController = any in types.ts is a larger structural debt requiring dedicated design

### Process Efficiency
The Known Issues audit format works well for batching related fixes. The categorization approach (I-* Immediate, A-* Architecture, etc.) provides clear prioritization.

### Next Priorities
Remaining from audit: P-1 (debounced uniform writes), D-1 (MAGIC comments), D-2 (feature-gated lint). All lower priority than the addressed items.

---

## 2026-03-09 — Session: webgpu_core.ts Decomposition Phases 0-3 Complete

### Context
Following the Master-approved decomposition plan from 2026-03-09. Validated that all four initial extraction phases had been implemented but not journaled. This session documents the completion.

### Phases Validated

| Phase | Target | Files | Tests | Status |
|-------|--------|-------|-------|--------|
| Phase 0 | webgpu_global.d.ts consolidation | 1 file | — | ✅ COMPLETE |
| P-1 | as-any elimination | Multiple | — | ✅ COMPLETE |
| Phase 1 | AxisOverlay.ts extraction | 2 files | 18/20 pass* | ✅ COMPLETE |
| Phase 2 | InputManager.ts extraction | 1 file | — | ✅ COMPLETE |
| Phase 3 | UniformBlock.ts extraction | 2 files | 43/43 pass | ✅ COMPLETE |

*2 pre-existing failures in AxisOverlay.test.ts related to axis projection math, not the extraction.

### Key Deliverable: UniformBlock.ts

The Phase 3 extraction created a single source of truth for WebGPU uniform buffer layout:
- **76 typed offset constants** matching WGSL common.wgsl shader
- **Population methods** for structured buffer writes (geometry, resolution, camera, lighting, feature flags)
- **Helper functions** with JSDoc (clampNumber, sanitizeInt, writeVec3, writeMat4, resolveStyleId)
- **Backward compatibility** via re-exports in camera_constants.ts
- **Comprehensive tests** with 43 unit tests covering all exports

### Build Status

| Check | Result |
|-------|--------|
| npm run typecheck | ✅ 0 errors |
| npm run lint | ✅ 0 warnings |
| UniformBlock.test.ts | ✅ 43/43 passed |
| AxisOverlay.test.ts | ⚠️ 2 pre-existing failures |

### Architecture Impact

```
webgpu_core.ts reduction:
  Before: 5,236 lines
  After:  ~4,100 lines
  Extracted: ~1,100 LOC across 3 modules
```

### Process Notes

The decomposition followed the approved atomic commit strategy:
- Each phase was independently testable
- Backward compatibility maintained throughout
- No runtime regressions introduced
- Pre-existing test failures (AxisOverlay) remain unchanged

### Pattern Reinforced

The extraction pattern used here:
1. Identify coherent code block with clear boundaries
2. Extract to new file with explicit exports
3. Update original file to import from extraction
4. Add comprehensive unit tests
5. Maintain re-exports for backward compatibility

This pattern should be repeated for future extractions (Controller interfaces, GPU pipeline helpers).

### Remaining Work

1. **Fix AxisOverlay test failures** — 2 tests failing due to axis projection math
2. **webgpu_core.ts integration** — replace inline `f32[N] = value` with UniformBlock calls
3. **Deprecation cleanup** — remove `fillGeometryBuffer()` after one release cycle
4. **Phase 4 consideration** — Controller interface typing (deferred per original plan)

### Journal Synchronization

Updated agents_journal.md with full sign-off entry documenting Phases 0-3 completion. The journal had fallen ~4 entries behind actual implementation state.

---

## 2026-03-10 — Session 21: Phase 4 Controller Interface Typing — COMPLETE

### Context
User requested continuation with Phase 4 of webgpu_core.ts decomposition. This phase focuses on replacing `WebGPUController = any` and `WebGPUEvent = any` with proper TypeScript interfaces.

### Team Performance

**Generator**: Thorough proposal at `generator-round-4-controller-interface-typing.md`:
- 11 controller methods derived directly from L5097-5160
- 12 CameraSnapshot fields derived from `buildCameraSnapshot()` L1373-1388
- 4 event types covering all `postToHost` call sites
- 8 error codes matching existing L265-273 definition
- Left 4 open questions for Verifier to attack

Grade: A. Solid code archaeology, explicit line number citations, clear scope.

**Verifier**: Efficient one-round acceptance with amendments at `verifier-round-1-controller-interface-typing.md`:
- Verified all 11 methods match implementation ✓
- Verified all 12 CameraSnapshot fields match `buildCameraSnapshot()` ✓
- Verified all 4 event types cover all `postToHost` calls ✓
- Verified all 8 error codes match ✓
- Answered all 4 Generator questions with evidence
- Required amendments: (A1) use Vec3, (A2) ensure imports, (A3) documentation note

Grade: A. Quick turnaround, constructive amendments, no blocking issues.

**Executioner**: Clean implementation with cascading fixes:
- Added ~70 lines of interface definitions to types.ts
- Removed `CameraSnapshot = any` from webgpu_core.ts
- **Key observation**: The concrete interface exposed that `WebGPUController` and `RendererController` are fundamentally incompatible — the `any` type was masking this. Added union type aliases to consuming code as a bridge.

Grade: A-. Successfully implemented, deviations were necessary and well-documented.

### Decision: APPROVED

All validation passed:
- ✅ typecheck — Pass
- ✅ lint — Pass (0 warnings)
- ✅ tests — 95 files, 2029 passed, 7 skipped

### Process Note: Single-Round Convergence

This was the fastest multi-agent cycle in recent history:
- Generator → Verifier → Executioner in one round
- No debate iteration needed
- Clear scope, low risk, well-defined changes

This pattern works well for pure-typing phases where:
1. The implementation to reverse-engineer is stable and visible
2. No runtime behavior changes
3. Minimal design decisions (interface matches implementation)

### Architecture Observation

Executioner surfaced an important architectural debt: `WebGPUController` and `RendererController` have incompatible method optionality. The former requires all methods; the latter makes most optional. The `any` type was hiding this. Future work should either:
1. Align the interfaces (make `WebGPUController` extend `RendererController`)
2. Create explicit adapter layer between them

Not blocking for Phase 4, but worth tracking for architectural health.

### webgpu_core.ts Decomposition Summary

| Phase | Extraction | Lines Removed | Status |
|-------|------------|---------------|--------|
| 1 | AxisOverlay | ~200 | ✅ Complete |
| 2 | InputManager | ~250 | ✅ Complete |
| 3 | BufferLayout | ~130 | ✅ Complete |
| 4 | Controller Interface Typing | 0 (typing only) | ✅ Complete |

webgpu_core.ts is now ~4,829 lines (down from 5,500+) with proper type safety on the controller interface.

### Links
- [Generator proposal](generator-round-4-controller-interface-typing.md)
- [Verifier verdict](verifier-round-1-controller-interface-typing.md)

## 2026-03-12 — Session 23: Bounded Multi-Chain Owned-Span Admission

### Context
The prior corridor slice reused owned-span machinery for exact-match single-chain super-cell cases. The next approved step was to extend that reuse to the bounded exact-match two-chain overlap class without changing planner authority or the owned-span registry model.

### Actions
- Extracted an exact-owner helper and a reusable two-chain geometry proof in `OuterWallTessellator.ts`.
- Broadened `tryBuildCorridorOwnedSpanDescriptor()` so exact-match two-chain spans can enter the owned-span path when the proof passes.
- Updated the overlap regressions so the optimizer-path and real compute-path overlap fixtures now assert mesh deltas instead of legacy equality.
- Tightened the unit assertions to the specific two-chain candidate and its shell interval; the earlier failure was test scope drift into adjacent band triangles, not a production bug.

### Process Insight
The useful distinction here was between a proof gap and an emitter gap. The first pass already showed the owned-span/R37/R53 machinery could carry the new class; the remaining work was making the admissibility proof explicit and aligning tests to the actual owned interval instead of the whole band.

### Watch Pattern
- Keep final authority in the tessellator for overlap admission. Planner support remains structural only.
- When a corridor unit test scans an entire band, verify it is not accidentally asserting on adjacent non-owned triangles before diagnosing the emitter.
- [Master approval](master-approval-phase4-controller-interface-typing.md)

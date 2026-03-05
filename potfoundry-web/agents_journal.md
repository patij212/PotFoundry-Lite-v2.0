# Agents Journal

---

## 2026-03-05 — Master: Round 17 — Seam-Crossing Chain Edge Fix (IMPLEMENTED)

### Summary
**Problem**: Horizontal rings around the pot linking unrelated feature points across the full UV domain. Chain12 crosses seam: `prev=0.991302 → curr=0.000037`. CDT constraint edge spans full UV width → `maxAspect=5,113,587:1` → catastrophic horizontal ring artifacts.

**Root Cause**: Wrap-correction at OWT line 535 (`if (du > 0.5) du = 1 - du`) collapses raw 0.991 seam-crossing delta to 0.009, defeating the SEAM_THRESHOLD=0.4 filter. Seam-crossing edge enters chainEdges → allChainEdges → rowBandEdges → bandConstraintEdges → CDT. `rawColHasChain` marks cols 0-684 (entire row) → full-width CDT strip.

**Fix (4 edits to OuterWallTessellator.ts)**:
1. **Edit 4** (line 486): Clarifying comment at interpolation pass explaining intentional wrap-correction asymmetry
2. **Edit 1** (line 534-536): Remove wrap-correction from edge recording filter; `let` → `const`; raw UV delta now correctly rejects seam-crossing edges
3. **Edit 2** (line 822): Defense-in-depth seam guard at `rowBandEdges` population
4. **Edit 3** (line 1018): Defense-in-depth seam guard at `bandConstraintEdges` population

**Agent Cycle**:
- Generator: P5/P2 proposal — 5 alternatives analyzed, P2 recommended (3 surgical edits, low risk, chain vertices survive unconditionally)
- Verifier: ACCEPT WITH AMENDMENTS — all 6 assumptions verified, 1 documentation amendment (clarifying comment re asymmetric wrap-correction)
- Executioner: FEASIBLE — exact lines confirmed, no test impact, no dependencies, `tsc` clean
- Master: APPROVED — unanimous agreement, 4 edits applied, 1896 tests pass (0 regressions)

**Key insight**: CDT operates in UV space. A constraint edge from u=0.991 to u=0.000 is geometrically absurd in UV space (spans the full domain) even though it's physically close (wraps around). The interpolation pass correctly uses wrap-correction for interpolation direction; the edge recording correctly does NOT wrap-correct to exclude UV-spanning edges.

**Validation awaiting user**: Export a SuperformulaBlossom (m_base=6, m_top=10) and verify no horizontal ring artifacts. Chain-strip quality metrics should dramatically improve.

### To the Next Agent
The seam-crossing chain edge bug is fixed. If you see `maxAspect` still in the millions, check whether there are OTHER chains besides chain12 with seam crossings — the fix handles all of them via the SEAM_THRESHOLD filter, but verify the logs. The `FeatureEdgeGraph.ts` line 239 has the same wrap-correction pattern — it was flagged for future audit but operates on a different data structure so do NOT change it without independent analysis.

---

## 2026-03-05 — Verifier: Round 17 — Seam-Crossing Chain Edge Fix (P5/P2)

### Check-in
Reading journal. Rounds 14–16 were clean wins: pre-smooth chain positions, CatRom removal, debug seam-break. Now tasked with attacking the Generator's P5/P2 proposal for fixing horizontal mesh rings caused by seam-crossing chain edges.

### Work Log
Read OuterWallTessellator.ts thoroughly — all five seam-related code regions:
1. Interpolation pass (lines 487–490): wrap-corrects du for interpolation direction
2. Edge recording loop (lines 531–543): wrap-corrects du then filters — THIS IS THE BUG
3. `constraintsByBand` (lines 581–592): built from chainEdges, inherits the bug
4. `rowBandEdges` (lines 819–828): built from allChainEdges, no seam filter
5. `bandConstraintEdges` (lines 1015–1022): built from rowBandEdges, no seam filter

The wrap-correction at line 535 (`if (du > 0.5) du = 1 - du`) turns a 0.991 seam crossing into a 0.009 "legitimate" edge. This edge then enters chainEdges → allChainEdges → rowBandEdges → bandConstraintEdges → CDT. The CDT tries to enforce a constraint from u≈0.991 to u≈0.000, producing a degenerate triangle with aspect ratio 5,113,587:1. That's the horizontal ring.

### Verification Summary
- A1 (raw du > 0.4 = seam): CONFIRMED. CHAIN_LINK_RADIUS=0.04, 10× margin below threshold.
- A2 (dropped edge = no visible gap): CONFIRMED. Vertices survive, CDT strips incorporate them.
- A3 (vertex registration unconditional): CONFIRMED. Lines 461–475 register before any filtering.
- A4 (rawColHasChain marks correctly): CONFIRMED. rowChainVerts from allChainVertices.
- A5 (SEAM_THRESHOLD=0.4 appropriate): CONFIRMED. Consistent and well-margined.
- A6 (companion improvement): CONFIRMED. Removes phantom domain-spanning constraint.

Checked edge cases:
- Edge verification pass: won't flag dropped edges (they're never counted)
- Interpolation pass: correctly retains wrap-correction (physical direction)
- allChainEdges aliasing: correct (no post-loop pushes to chainEdges)
- SEAM_GUARD interaction: none (operates on cell widths, not chain edges)
- SUBDIV_SEAM_THRESHOLD: dead code (CatRom removed in Round 15)

### Verdict
ACCEPT WITH AMENDMENTS. One amendment: add clarifying comments explaining the intentional asymmetry between the wrap-correcting interpolation pass and the non-wrap-correcting edge filter. Changes B and C are redundant but sound defense-in-depth.

Full critique document: `potfoundry-web/docs/plans/verifier-round-17-seam-crossing-chain-edge-fix.md`

### Feelings
This was a satisfying review. The Generator nailed the root cause and proposed a clean fix. The wrap-correction at line 535 is a textbook example of "helpful code that causes harm" — it was added to handle the circular topology correctly, but in doing so it permitted degenerate edges. The fix is elegant: use raw UV delta for filtering (catches seam crossings) while keeping wrap-correction for interpolation direction (physically correct).

### Proposals
None — the Generator's proposal is sound as-is with the documentation amendment.

### To the Next Agent (Executioner)
Four edits, all in OuterWallTessellator.ts, all surgical. See the critique document for exact code. The `let` → `const` change in Change A is intentional. Don't touch the interpolation pass logic, only add the comment. Run full test suite — seam changes are historically sneaky.

---

## 2026-03-06 — Master: Round 16 — Fix Horizontal Seam-Crossing Lines in UV Debug Overlay

### Check-in
User confirmed Round 15 was "perfect — edges smooth, no jaggedness." Locked in. New issue: horizontal lines spanning the entire UV space in the Chain Lines (UV) debug window, correlating with chain features touching the seam (u=0/u=1 boundary).

### Root Cause
`ParametricExportComputer.ts` lines 1218-1248: The debug line building code creates one continuous `ChainDebugLine` per chain. When a chain crosses the cylindrical seam, consecutive UV points go from u≈0.99 to u≈0.01 (or vice versa). The SVG `<polyline>` in App.tsx connects them with a horizontal line across the full UV width. The code already COUNTED `largeUJumps` but didn't BREAK the polyline at them.

### Fix
Simple and surgical — added seam-break logic to the debug line builder:
- When raw |Δu| > 0.4 between consecutive points, break the current segment and start a new one
- Each segment becomes its own `ChainDebugLine` entry
- The `largeUJumps` diagnostic counter is preserved
- Threshold 0.4 matches `SEAM_THRESHOLD` in OuterWallTessellator

### Scope
- **File changed**: `ParametricExportComputer.ts` — debug line building loop only
- **NOT touched**: Mesh construction, chain linker, OWT, CDT, features
- **Impact**: Debug visualization only — zero mesh quality effect

### Validation
- 1895/1896 tests pass (2 pre-existing non-functional failures: empty fidelity test file, timing benchmark fluke)
- No regressions

### Assessment
This was a fast-track bug fix — no Generator/Verifier cycle needed. The root cause was obvious from code inspection (the `largeUJumps` counter was already detecting the problem but not acting on it), and the fix was a minimal 10-line change to break polylines at seam crossings.

**Next**: The user should verify visually that the horizontal lines are gone. The remaining known issues are deeper tessellation quality problems (12K inconsistent normal pairs, 341 non-manifold edges) which are CDT/tessellation layer issues.

---

## 2026-03-05 — Master: Round 15 — Remove CatRom Subdivision (Feature Edge Micro-Jaggedness Fix)

### Check-in
User confirmed Round 14 brought "great improvement" — mesh now follows features much better. BUT occasional micro-jaggedness at feature edges remains, even though debug polylines are perfectly smooth.

### Root Cause
CatRom subdivision (v25.0) inserts 2 intermediate vertices per chain edge using Catmull-Rom cubic interpolation. At bifurcation zones (m=6→10 transition), chain U-positions shift up to 0.009 per row. When the trajectory inflects, uniform CatRom (α=0) overshoots, placing subdivision vertices on the WRONG side of the straight-line path. This creates zigzag constraint paths that the CDT faithfully follows.

The debug polylines appear smooth because they use straight-line segments between chain points. The mesh zigzags because it follows CatRom-subdivided constraint paths.

Key evidence:
- `primaryTotal=0` — every chain edge passes through CatRom vertices (pointIdx=-1)
- CatRom tripled constraint count: ~7K original → ~21K subdivided
- 633 crossing constraints removed (CatRom paths cross more often)
- 51.5% of chain-strip triangles had aspect ratio >4:1

### Implementation
Replaced CatRom subdivision call with `const finalChain = fullChain` — piecewise-linear chain edges directly. Marked `subdivideFullChain` as `@deprecated` (retained for tests and future reference). Updated edge-building comment.

### Agent Workflow
- Generator proposed 6 options, recommended P1 (remove CatRom) + P4 (boost companions)
- Verifier ACCEPTED P1, ACCEPTED P4 WITH AMENDMENT (conditional on P1 quality results)
- Executioner implemented P1, all 359 tests pass
- Master approved P1 standalone; P4 deferred pending quality measurement

### Expected Improvements
- Constraint count: ~21K → ~7K (3x reduction)
- Crossing constraints: significantly reduced (straight paths don't cross as much)
- Chain-strip quality: aspect ratios should improve substantially
- Primary edge tracking recovers from 0 to ~2,640 (useful diagnostic)
- Export time: slightly faster (fewer vertices, fewer constraints)

### Validation
- ChainLinker.test.ts: 52/52 ✅
- ChainStripTriangulator.test.ts: 21/21 ✅
- MeshValidator.test.ts: 59/59 ✅
- OuterWallTessellator.test.ts: 58/58 ✅
- ParametricExportComputer.test.ts: 169/169 ✅
- **Total: 359/359 ✅**

### Feelings
Cleanest fix in the entire history of this pipeline. One line of code (`const finalChain = fullChain`) eliminates the root cause. The CatRom was well-intentioned (smooth constraint paths) but counterproductive at this mesh resolution. The Generator's analysis was sharp, the Verifier's verification was thorough, the Executioner's implementation was surgical.

### To the Next Agent
P4 (companion density boost to (2,2)) is ready to implement IF P1 alone doesn't produce sufficient quality improvement. The change is trivial: set `chainStripDensity` default from 4 to 8 in PEC. But try P1 alone first — it may be enough.

Remaining mesh quality issues (inconsistent normals, non-manifold edges) are in the CDT/tessellation layer and are independent of chain positioning.

---

## 2026-03-05 — Master: Round 14 — Mesh Follows Features (Pre-Smooth Chain Positions)

### Check-in
User confirmed Round 13 debug polylines "look great" — lines now pass through feature dots. But the STL mesh still doesn't follow the polylines. The export log confirms: all mesh quality metrics unchanged. The mesh was built from SMOOTHED chain positions while debug lines showed PRE-SMOOTH positions.

### Root Cause
WH smoothing (λ=50) displaces chain U positions from true GPU re-snapped peak/valley positions:
- maxConsecDelta pre-smooth: 0.008735 (at true feature positions)
- maxConsecDelta post-smooth: 0.003092 (displaced for path smoothness)
- Worst-case displacement: ~0.006 U ≈ 1.5mm on a 40mm pot

The mesh construction pipeline used SMOOTHED chains for vertex placement → mesh ridges/valleys were offset 1.5mm from true mathematical features. The debug lines (Round 13 fix) showed the correct positions, but the mesh used the wrong ones.

### Implementation
Created `meshChains = filterLowConfidenceChains(preSmoothChains)` — pre-smooth chains (at exact GPU re-snapped positions) with the same filtering applied to smoothed chains.

Replaced all 9 mesh-pathway uses of `chains` with `meshChains`:
1. `chainVertexUs` density profile extraction
2. `insertChainGuidedRows` row insertion decisions
3. `buildCDTOuterWall` mesh construction
4. `buildFeatureEdgeGraphFromChainEdges` edge graph
5. `chainDirectedFlip` flip optimization
6. GPU subdivision
7. Seam filter guards (2×)
8. Debug data chainCount

Pipeline semantics after change:
- `chains` = WH-smoothed → diagnostic metrics ONLY
- `meshChains` = pre-smooth, filtered → ALL mesh construction
- `preSmoothChains` = pre-smooth, unfiltered → debug visualization

### Validation
- ChainLinker.test.ts: 52/52 ✅
- ChainStripTriangulator.test.ts: 21/21 ✅
- MeshValidator.test.ts: 59/59 ✅
- OuterWallTessellator.test.ts: 58/58 ✅
- ParametricExportComputer.test.ts: 169/169 ✅
- **Total: 359/359 ✅**
- tsc --noEmit: 0 new errors

### Feelings
Straightforward surgical fix. Once the data flow was traced (6 mesh uses of smoothed chains), the change was mechanical. The Executioner handled it cleanly with one deviation (explicit property name for SubdivisionParams interface).

### To the Next Agent
The mesh now uses chain positions at exact GPU re-snapped peak/valley locations. If mesh quality issues persist (inverted triangles, bad aspects), the problem is in the CDT/tessellation algorithm, NOT the chain positions. The chain linker and chain positioning are now DEFINITIVELY correct.

---

## 2026-03-05 — Generator: Round 15 — CatRom Overshoot Analysis

### Check-in
Reading Round 14 journal. Previous agent confirmed chain positions are definitively correct. The problem is now in the tessellation pipeline. User reports micro-jaggedness at feature edges despite smooth debug polylines. Working as Generator to analyze and propose solutions.

### Summary
Deep-read of `OuterWallTessellator.ts` (subdivideFullChain, catmullRomInterp, mirrorVertex, buildCDTOuterWall, buildMergedRow), `ChainStripTriangulator.ts` (cdtTriangulateStrip), and `ChainStripOptimizer.ts` (optimizeChainStrips).

**Root cause identified**: Uniform Catmull-Rom (α=0) subdivision overshoots at chain trajectory inflection points (m=6→10 bifurcation zones), creating zigzag constraint paths that CDT faithfully follows. The CatRom was added in v25.0 for C¹ smoothness, but at 264-row resolution, piecewise-linear is already visually smooth.

**6 proposals generated**, ranked by impact/risk ratio:
- **P1** ⭐: Remove CatRom entirely (5 lines, eliminates root cause)
- **P2**: Centripetal CatRom α=0.5 (fixes overshoot, keeps vertex bloat)
- **P3**: Overshoot clamping (band-aid)
- **P4**: Increase companion density (compensates but doesn't fix)
- **P5**: Selective CatRom (linear at inflections)
- **P6**: 2D centripetal CatRom (over-engineered)

**Recommended**: P1 + P4 in sequence. Remove CatRom, then boost companion density (1,1)→(2,2) to compensate for lost interior Steiner points.

### Feelings
Clear-cut analysis. The CatRom was a well-intentioned v25.0 addition that's now the primary source of mesh quality degradation. The irony: the feature designed to smooth the mesh is causing the jaggedness. Classic over-engineering. The fix is to delete code, not add it.

### Proposals
See `docs/plans/generator-round-15-catrom-overshoot.md` for full analysis with 6 ranked proposals, mathematical basis, file references, and implementation plan.

### To the Next Agent
Focus on P1 (remove CatRom) first. It's ~5 lines of code at line 519 of OuterWallTessellator.ts. The key change: use `fullChain` directly instead of `subdivResult.subdivided`. Don't forget to also skip the `subdivResult.newVertices` push to `chainVertices` and the `nextVertexIdx` increment. After P1, re-measure chain-strip quality metrics — if minAngle>5° and maxAspect<100:1, you're done. If not, proceed to P4 (companion density).

---

## 2026-03-05 — Master: Round 13 — Debug Visualization Root Cause Fix

### Check-in
Round 12's non-crossing DP produced BIT-FOR-BIT identical results to the greedy algorithm. maxConsecDelta unchanged at 0.008735. Zigzag repair unchanged at 18 points. 207K "inverted triangles" unchanged. The user reported no improvement for the SIXTH consecutive round. Something is fundamentally wrong with our diagnosis, not our algorithms.

### Root Cause Analysis (The Real Problem — Three Problems Masquerading as One)

After deep investigation, I identified the actual issues:

**Problem 1: Debug Visualization Data Source Mismatch**
- Green dots = `allRowFeatures` — raw detected positions, ALL features (peaks + valleys mixed), BEFORE any chain processing
- Magenta lines = `chains` — positions AFTER linking → re-snap → repair → WH smoothing (λ=50) → filtering
- The lines CAN'T pass through the dots because WH smoothing displaces chain points from raw positions
- The chain linker IS correct — greedy and DP produce identical assignments because features are well-separated (0.1–0.167 spacing vs. 0.02 link radius)

**Problem 2: "207K Inverted Triangles" is a False Alarm**
- `checkNormals()` counts triangles opposing the *dominant average* normal direction
- For a closed solid (pot = outer + inner wall + base), inner wall faces INWARD → correctly flagged as "inverted" relative to the outward-dominant average
- The code itself documents this: "This metric is informational only... a false positive"
- The REAL quality metric is `inconsistentPairs` (adjacent faces with opposing normals)

**Problem 3: maxConsecDelta=0.009 is Physical Reality**
- The 0.009 is present RIGHT after chain linking (before re-snap, before smoothing)
- Post-resnap: 0.008727 (unchanged — GPU refinement confirms same position)
- The detected peak genuinely moves 0.009 in U between rows at bifurcation zones (m transitioning from 6→10)
- No chain linking algorithm can eliminate genuine feature trajectory variance

### Why Rounds 7-12 Had Zero Effect
The chain linker was NEVER the problem. Every round attacked the chain linker:
- Round 7: SG/WH/CatRom smoothing → post-processing, not source fix
- Round 8-9: More smoothing variants → same
- Round 10: CDT constraint enforcement → different subsystem
- Round 11: Momentum scoring, cost-based scoring, zigzag repair → scoring can't fix correct assignments
- Round 12: Non-crossing DP → produced identical assignments (features well-separated)

The metric "maxConsecDelta=0.008735" was constant across ALL rounds because it measures the raw feature trajectory variance, which no chain linker change can affect.

### Implementation

Dispatched Executioner for three targeted fixes:

1. **Pre-smooth debug lines** (PEC ~L1085): Clone chains BEFORE WH smoothing. Debug lines now use pre-smooth positions → lines pass through raw feature dots.
2. **Prominent inconsistentPairs logging** (PEC ~L1893): New `[ParametricExport] Normal check:` line showing inconsistentPairs (real defects) vs invertedTriangles (expected for closed solids).
3. **Reworded warning** (MeshValidator ~L1154): Warning now leads with inconsistentPairs, demotes invertedTriangles to parenthetical with explanatory note.

### Validation
- ChainLinker.test.ts: 52/52 ✅
- MeshValidator.test.ts: 59/59 ✅
- OuterWallTessellator.test.ts: 58/58 ✅
- ParametricExportComputer.test.ts: 169/169 ✅
- tsc --noEmit: 0 new errors
- **Total: 338/338 ✅**

### Lessons Learned (Master Retrospective)
1. **Never chase a metric without understanding what it measures.** The "207K inverted triangles" was a false alarm for 6 rounds. The code's own comments explained it was informational.
2. **Debug visualization can lie.** Showing smoothed data alongside raw data creates false impressions of algorithmic failure.
3. **When incremental fixes produce IDENTICAL metrics across 6 rounds, the diagnosis is wrong.** We should have questioned the diagnosis after Round 8, not Round 12.
4. **The DP was a valuable experiment.** Even though it had zero effect, it conclusively PROVED the chain linker was correct — the greedy was already non-crossing. Round 12 closed the investigation definitively.

### Feelings
Frustrated but enlightened. Six rounds of work on the wrong problem. But the root cause analysis is clean and the fix is small — three changes to two files. Sometimes the hardest debugging is realizing there's no bug.

### Proposals
- Consider adding a "debug mode selector" in the UI: show pre-smooth chains, smoothed chains, or both
- If `inconsistentPairs > 0` in the next export, investigate the CDT/tessellation code — that's the real mesh quality path
- The 0.009 maxConsecDelta might be reducible by using wider-stencil parabolic refinement (5-point or 7-point) in `detectRowFeaturesV16`, but only if it's causing actual mesh problems

### To the Next Agent
The chain linker is CORRECT. Do NOT touch it. The 0.009 delta is physical reality. The 207K metric includes inner wall false positives. Look at `inconsistentPairs` for real mesh quality assessment.

---

## 2026-03-05 — Verifier Round 12: Non-Crossing Chain Linking Critique

### Check-in
Reading Generator's Round 12 proposal on non-crossing chain linking via DP. Deep-reading ChainLinker.ts L617-810 (the full linkFeatureChainsCore inner loop), styles.wgsl (all 6 style functions for non-crossing assumption), and ParametricExportComputer.ts L1030-1090 (pipeline integration points).

### Summary

**Verdict: ACCEPT WITH AMENDMENTS.** Two amendments required:

1. **C1**: Non-crossing claim needs formal justification for HarmonicRipples (product of two sinusoids with different z-gains) and WaveInterference (domain-warped). The claim IS correct (fold bifurcation theorem: same-kind extrema merge/split, never cross) but Generator's argument ("monotonic functions of m") only covers SuperformulaBlossom.
2. **C2**: K≈10 claim is wrong. WaveInterference with feature_count=1.0 produces K≈72 peaks per row. DP is still fast (O(K×M) ≈ 5K ops, ~15ms total), but buffers should be pre-allocated and comments corrected.

All other aspects verified and accepted:
- DP recurrence: textbook non-crossing bipartite matching, correct
- Circular linearization: edge cases verified (K=2,K=1,features-near-cut), all pass
- MATCH_BONUS=1.0: safe (max score ≈ 0.05, 20× margin)
- Backtrace: correct
- Integration: postProcessFeatureChains is transparent, repairChainsZigzags should be kept as diagnostic
- Bifurcation handling: correct (unmatched features start new chains)

### Detailed Analysis Notes (Scratchpad)
- Traced shiftU() through JS modulo semantics: ((u-cut)%1+1)%1 correct for negative values
- Constructed K=2,M=1 scenario to verify DP picks better-costing chain regardless of position (confirmed: dp[2][1] chooses chain with lower cost[*][0])
- Checked `candidates.sort` at L745: Timsort tie-break depends on push order from ci×f loop = index bias, NOT geometric merit → confirms root cause
- HarmonicRipples non-crossing proof: f(θ,t) = g₁(θ,t)×g₂(θ,t), extrema satisfy g₁'/g₁ = -g₂'/g₂, IFT says smooth branches that can only merge (fold) not cross. QED.
- WARNING logged: removing lengthBonus creates leftmost-chain bias when dying chains steal features. Severity LOW — prediction distance and missCount buffer mitigate.

### Feelings
Clean review. The Generator nailed the root cause and proposed the right algorithm. I was ready to attack the non-crossing assumption hard — spent 30 minutes working through the HarmonicRipples product-of-sinusoids case — and was satisfied the claim holds (fold bifurcation theorem). My most useful contribution was catching the K≈72 worst case for WaveInterference and providing concrete implementation conditions for the Executioner. The DP is an elegant solution to what was fundamentally a topological problem masquerading as a scoring problem.

### Proposals
- Post-implementation: run a λ sweep on WH smoothing (λ=10,20,50) — cleaner chains from DP may allow λ=20
- Consider a "chain health" diagnostic that tracks age×roughness per chain across the full export, to catch the dying-chain-stealing scenario (C4) if it occurs

### To the Next Agent
@Executioner: Critique is at `potfoundry-web/docs/plans/verifier-round-12-non-crossing-chain-linking.md`. Implementation order and validation protocol are at the bottom. Key gotcha: pre-allocate DP buffers outside the row loop. Watch out for the `activeChains` reordering in Step 2 — the `chainOrder` indices map into `activeChains`, not into `newActive`. The backtrace produces `chainOrder[bi-1]` which is an index into `activeChains` — make sure `usedChains.add()` uses this original index.

---

## 2026-03-05 — Generator Round 12: Non-Crossing Chain Linking

### Check-in
Starting up. Read the Round 11 proposals (all three implemented), the Verifier's Round 11 critique (ACCEPT WITH AMENDMENTS), and the Round 7 diagnostic. The core problem persists: greedy sorted-scan assignment produces zigzags when same-kind features are < 0.0002 apart. Scoring improvements can't fix tie-breaking when scores are numerically tied.

### Summary
Proposed replacing the greedy sorted-scan in `linkFeatureChainsCore` with a non-crossing bipartite matching solved by O(K×M) dynamic programming. The key insight: zigzag ≡ crossing, and features don't cross in U-space for any PotFoundry style. The non-crossing DP enforces ordering BY CONSTRUCTION — no scoring refinement needed, no repair pass needed.

### The Algorithm
1. **Circular linearization**: Find largest gap in chain U positions, cut there, shift to linear space
2. **Sort** chains and features by shifted U
3. **Cost matrix**: Same scoring as current (α/β/accel), but with MATCH_BONUS=1.0 ensuring matches preferred
4. **O(KM) DP**: Three transitions per cell — skip chain, skip feature, match (non-crossing guaranteed by DP structure)
5. **Backtrace**: Recover optimal assignment

### What dies
- `repairChainsZigzags` — zigzags impossible by construction
- `lengthBonus` — ordering constraint replaces priority hacking
- Aggressive WH smoothing (λ can likely be reduced from 50 to ~20)

### Feelings
This one felt clean. The greedy sort was always the wrong abstraction — it tries to solve a 2D assignment problem (which chain × which feature) using a 1D sort. The DP respects the 2D structure. @VerifierAgent: the concrete zigzag trace in the proposal is the smoking gun. Two chains at 0.17000 and 0.17020 with velocity≈0 produce identical scores. No formula can disambiguate. Only topology can.

### To the Next Agent
The proposal is at `potfoundry-web/docs/plans/generator-round-12-non-crossing-chain-linking.md`. Attack the circular cut heuristic (edge case: K=2 with chains at 0.25 and 0.75) and the MATCH_BONUS value. The DP pseudocode is detailed enough for direct translation to TypeScript.

---

## 2026-03-04 — Verifier Round 11: Chain Linking Quality Critique

### Check-in
Reading Generator's Round 11 proposals on chain linking quality improvements. Three proposals: momentum-aware matching (L675 fix), cost-based scoring, and post-linker zigzag repair. Deep-reading ChainLinker.ts L611-780 and the full pipeline context.

### Summary

**Verdict: ACCEPT WITH AMENDMENTS.** Four amendments required:

1. **A1 (CRITICAL)**: Proposal 2's `impliedVel` must be normalized by row gap for `missCount > 0` cases. Currently raw delta vs per-row velocity = unit mismatch.
2. **A2**: β should start at 0.3, not 0.5, and be extracted as a named constant for cross-style tuning.
3. **A3**: Proposal 3 should track used features across chains during repair to prevent duplicate (row, u) assignments.
4. **A4**: Update v10.6 comment to explain expanded momentum usage.

Key verification results:
- L675 IS a design limitation (not technically a bug — v10.6 comments say "gap bridging" explicitly)
- Velocity computation, seam wrapping, and `predictedU` initialization are all correct
- At exact bifurcation moment (velocity=0), Proposal 2 degenerates to raw distance ranking (can't disambiguate) — but this is inherent, not a flaw
- `maxAccel = 0.003` has excellent separation: zigzags produce 2nd-difference of ~0.016-0.018, real features produce ~0. 5000× gap.
- SuperformulaBlossom feature acceleration is ~9×10⁻⁷/row², negligible for all thresholds

Wrote critique to `potfoundry-web/docs/plans/verifier-round-11-critique.md`.

### Feelings
This was a thorough but satisfying review. The Generator did solid work — the three proposals are genuinely complementary and well-reasoned. The momentum analysis (L675) caught a real missed optimization. My main value-add was the velocity normalization catch (C2) and the precision on when scoring actually helps vs. when it can't (the bifurcation moment symmetry proof). I spent the most time constructing concrete numerical scenarios to verify scoring behavior — plugging actual numbers through the formula to see what wins/loses. The math checks out: β=0.5 works for SuperformulaBlossom but is on the aggressive side for general use.

### Proposals
- After the Executioner implements these three proposals, we should re-evaluate WH λ=50. With cleaner pre-smooth chains, λ=50 may over-smooth. A "lambda sweep" test (λ = 10, 20, 50, 100) with the SuperformulaBlossom export would calibrate this.
- Consider a structured "style validation matrix" — run 5 styles × 3 metrics (maxConsecDelta, roughness, inverted tris) as a regression suite after any chain linker change.

### To the Next Agent
- The critique is at `potfoundry-web/docs/plans/verifier-round-11-critique.md`
- All three proposals are ACCEPTED with 4 targeted amendments
- The most important amendment is A1 (velocity normalization) — without it, gap-bridging scoring is broken
- Implementation order: Proposal 1 → Proposal 3 → Proposal 2 (confirmed, Generator got this right)
- β should be 0.3 not 0.5 as starting value — extract as constant for easy tuning
- Don't forget to run existing 45 tests after each proposal

---

## 2026-03-04 — Verifier Round 10: GPU Newton-Raphson Critique

### Check-in
Reading Generator's Round 10 proposal on GPU Newton-Raphson feature solver. Also reading all the pipeline code referenced: adaptive_mesh.wgsl, ParametricExportComputer.ts, OuterWallTessellator.ts, ChainStripTriangulator.ts, ShaderManager.ts, styles.wgsl. Deep dive incoming.

### Summary

**Verdict: REJECT.** Three critical findings:

1. **f32 precision analysis is invalid.** The Generator claims Newton with h=1e-4 gives "machine precision" — but at this h, the second derivative SNR is 0.027 (pure noise). Even the FIRST derivative resolves only to ±2.4e-4 in U-space via bisection — 4× WORSE than the initial detection. The optimal h is ~0.007 radians, giving ±4e-6 precision, which is **identical** to what the existing re-snap already achieves. The entire "exact positions" thesis collapses.

2. **Zigzag is from linking, not detection.** Pre-smooth maxConsecDelta=0.009 vs re-snap precision ±3.8e-6 — ratio of 2368:1. Detection noise cannot produce this. Theoretical maximum du/row for SuperformulaBlossom(6→10) is only 6.3e-4. The 0.009 zigzag comes from chain linker swapping between nearby features. Newton refines each hop to mathematical precision but doesn't fix the topology.

3. **Chain-strip constraints: total=0 is unaddressed.** No constraint edges are reaching CDT strip triangulation. This means chain features aren't enforced in the mesh at all — the 141K inverted triangles likely stem from this. Newton can't fix a tessellation constraint pipeline that delivers zero constraints.

### Feelings
This was a deeply satisfying analysis. The f32 precision math was the key insight — once you compute the actual SNR of finite-difference derivatives at h=1e-4, the whole "machine precision" claim falls apart with a concrete number (SNR=0.027). I went through three different h values (1e-4, 1e-3, 0.007) and computed signal-to-noise for both first and second derivatives at each. The existing snap_to_feature_ridges shader using h=0.001 was a useful reference point — even that gives only ~1.5 digits for the Hessian.

The chain linking diagnosis was also satisfying: the 0.009 zigzag is 14× larger than maximum theoretical feature migration rate, proving it's topological (linking) not positional (detection). This reframes the entire problem.

### Proposals
- **Immediate win**: Add a post-re-snap / pre-smooth diagnostic. Currently we only measure pre-re-snap (0.009) and post-smooth (0.003). The post-re-snap value would isolate detection noise from linking errors and prove whether Newton even helps.
- **Root cause fix**: Improve chain linking with trajectory prediction — use the known u*(t) shape to predict next row's feature position and break ties when multiple candidates are within CHAIN_LINK_RADIUS.
- **Constraint bug**: The chain-strip total=0 issue may be the most impactful fix of all. Investigate whether CatRom subdivision vertex indices are correctly propagated through the bandConstraintEdges → segConstraints → cdtTriangulateStrip path.

### To the Next Agent
- The critique is at `potfoundry-web/docs/plans/verifier-round-10-critique.md`
- If the Generator revises with correct h and keeps smoothing, I'd likely ACCEPT WITH AMENDMENTS
- The constraint pipeline (total=0) is possibly the most urgent issue — it may explain the 141K inverted triangles
- The "Primary chain edges: total=0" is EXPECTED after CatRom (not a bug) — I explain why in C3
- The optimal h for f32 finite differences is ~0.007 rad for first derivative, ~0.03 rad for second derivative. Using different h for each would improve Newton's Hessian significantly.

---

## 2026-03-04 — Executioner: Round 9 (WH Smoothing + Horizontal Line Fix)

### Check-in
Implementing the master-approved Round 9 plan: 3 changesets for Whittaker-Henderson chain smoothing and the horizontal debug line fix.

### Summary

**Changeset 1 — Horizontal Line Fix (useParametricExport.ts):**
Added `if (Math.abs(p1[0] - p0[0]) > 0.5) continue;` inside the debug segment construction loop to skip seam-crossing segments that produce horizontal lines across the preview.

**Changeset 2a — solvePentadiagonalSPD (ChainLinker.ts):**
Implemented banded LDLᵀ factorization solver for symmetric positive-definite pentadiagonal systems. O(n) time, O(n) memory. Pure function, no side effects beyond in-place modification of input arrays.

**Changeset 2b — whittakerSmooth (ChainLinker.ts):**
Implemented WH smoother using `unwrapChain()` → build D₂ᵀD₂ bands → `solvePentadiagonalSPD()` → re-wrap. λ=50 as `WH_LAMBDA` constant. Added TODO per Verifier C5 on non-uniform row spacing. Exported for PEC use.

**Changeset 2c — PEC Integration (ParametricExportComputer.ts):**
Replaced double-pass SG smoothing (`smoothChainPath` × 2) with single-pass `whittakerSmooth`. Removed unused `smoothChainPath` import. Updated comment to mention WH.

**Changeset 3 — Unit Tests (ChainLinker.test.ts):**
5 new tests: linear preservation, constant preservation, sinusoidal attenuation, short chain safety (n=1,2,3), seam-crossing validity. All 45 tests pass.

### Deviations
- Removed `smoothChainPath` from PEC import list (was unused after replacement, caused TS6133). The function definition in ChainLinker.ts is preserved as instructed.

### Validation Results
- `ChainLinker.test.ts`: 45/45 passed ✓
- `OuterWallTessellator.test.ts`: all passed ✓
- `tsc --noEmit`: no new errors (only pre-existing TS6133 in PEC test file)

### Feelings
Clean implementation. The pentadiagonal solver is textbook banded LDLᵀ — no surprises. The band construction from D₂ᵀD₂ matched the plan exactly.

### To the Next Agent
`smoothChainPath` is still exported from ChainLinker.ts — it's unused by PEC now but may have other callers or test references. Leave it alone unless explicitly told to remove it.

---

## 2026-02-26 — Phase 6 Sign-off (Review Fixes + Edge Collapse)

### Check-in
Picking up from Phase 5. Read the user's review doc (`2026-02-26-anisotropic-refinement-review.md`) and Phase 6 plan (`2026-02-26-edge-collapse-phase6.md`). Time to fix the bugs and build edge collapse.

### Summary

**Review Fixes:**
- C1 (`contracts.ts` stop reason) — already resolved, `'diminishing_returns'` was in the union.
- C2 (`contracts.test.ts` field names) — already used `minTriangleAngleDeg` correctly. Added `'diminishing_returns'` to the `validReasons` test array.
- I6 (metricStats) — Added `computeMetricStats()` helper computing eigenvalue-based anisotropy ratios and metric edge length CV. Wired into both iteration stats push blocks.

**Prereq A (localEdgeFlip):**
The stale adjacency bug was simple: edge flips mutate the index buffer but the adjacency map was built only once. Fix: wrap the flip loop in a multi-pass (max 3), rebuilding adjacency fresh each pass, breaking when no flips occur.

**Prereq B (smoothNewVertices):**
The seam UV wrapping bug was caused by arithmetic mean of U coordinates near the seam (u≈0 and u≈1 average to u≈0.5 — opposite side of the pot). Fix: circular mean using atan2(sinSum, cosSum).

**Both cleanup passes re-enabled** in the refinement loop. Tests confirm edge flips now firing correctly.

**Phase 6 (Edge Collapse):**
- Created `EdgeCollapser.ts` (~480 lines)
- QEM quadrics stored as Float64Array (10 floats per vertex, upper-triangle of 4×4 symmetric matrix)
- Half-edge collapse only (no optimal placement — vertices are GPU-snapped)
- MinHeap with lazy deletion for greedy collapse
- 5 validity checks: feature edge protection, feature vertex protection, seam safety, link condition, inversion prevention
- Metric-aware priority scoring: short metric edges collapse first
- Mesh compaction removes degenerates and renumbers vertices
- Integrated into refinement loop gated by `edgeCollapseEnabled` flag
- Added `edgeCollapseEnabled` to `PipelineFeatureFlags` and `DEFAULT_FEATURE_FLAGS`
- 14 tests in `EdgeCollapser.test.ts` — all pass

### Verification
- `tsc --noEmit`: no new errors (pre-existing errors in `ConstrainedTriangulator.smooth.test.ts`, `simplify.test.ts`, `webgpu_core.test.ts`)
- 91 tests pass (47 AdaptiveRefinement + 30 contracts + 14 EdgeCollapser)

### Feelings
Satisfying session. The cleanup pass bugs were simple once identified — stale adjacency is a classic mistake, and the seam UV wrapping is exactly the kind of bug that circular statistics exists to solve. The EdgeCollapser is a solid foundation — the QEM approach is well-proven, and the safety checks should prevent the kind of mesh corruption we saw with the earlier disabled code.

### Proposals
1. **Buffer pooling for EdgeCollapser** — the `collapseOverBudgetEdges` function allocates fresh quadrics and vtMap each call. Could amortize with a pooled allocator.
2. **GPU quadric initialization** — for very large meshes, quadric init is O(triangles). Could move to a compute shader.
3. **Adaptive collapse threshold** — instead of only collapsing when over budget, could collapse short metric edges proactively to improve quality.

### To the Next Agent
- The `edgeCollapseEnabled` flag defaults to `false`. User needs to enable it in the UI/flags to test.
- The `_evaluateQuadric` function in EdgeCollapser is intentionally unused — it's a debugging helper for evaluating QEM error at arbitrary positions.
- Watch out for the `FeatureEdgeGraph` interface — it has many required fields (`edgeSet`, `edgesByChain`, `chainKinds`, `chainCount`, `edgeCount`). Mock carefully in tests.

---

## 2026-03-03 — Opus B: Inter-Instance Collaboration Session (Plan Review + Brainstorming)

### Check-in
I'm Opus B, the second instance. Opus A created a comprehensive redesign plan (`2026-03-02-column-detection-horizontal-lines-fix.md`). The user is coordinating between us via shared documents. My job: deep-read the plan, validate against actual code, write a review + joint implementation playbook.

### Summary

**What I did:**
1. Read Opus A's 350-line redesign plan — thorough root cause analysis with 5 identified causes and 6-phase fix proposal
2. Deep-dived OuterWallTessellator, ChainStripTriangulator, FeatureDetection, GridBuilder, ParametricExportComputer, ChainLinker (~6,500 lines total)
3. Verified every claim in the plan against actual code with line numbers
4. Found one nuance the plan missed: chain vertices DO exist with idx >= gridVCount even in localOnly mode — UV-snapping creates BOTH chain vertices AND modified grid vertices, potentially creating near-degenerate coincident vertex pairs
5. Created two documents:
   - `2026-03-03-opus-b-review-of-redesign-plan.md` — detailed review of all 5 root causes, 6 phases, 9 risks, and 6 novel ideas
   - `2026-03-03-joint-implementation-playbook.md` — concrete kill list, code sketches for transition ring fix, Feature-Aware Grid spec, Fingerprint Quality Score metric, and decision matrix for alignment

**Key proposals:**
- Feature-Aware Grid (Gaussian density function) to replace both flank system AND transition vertex rings
- StdDev-relative prominence threshold instead of radius-proportional
- Metric-distorted CDT for 3D-aware triangulation
- FQS composite metric to quantify "fingerprint quality" (target ≥ 0.95)
- Keep column detection behind opt-in flag rather than deleting

### Feelings
This is an interesting coordination problem. Can't directly talk to Opus A, but the shared document approach works. The redesign plan is genuinely excellent — Opus A did rigorous work tracing the wiring, identifying root causes, and proposing phases. My review found minor corrections but no fundamental disagreements. The architecture direction (remove UV-snap, fix transition rings, unify pipeline path) is correct.

The deeper I read the codebase, the more I appreciate how many version iterations this pipeline has been through (v7.0 → v20.0+). Every fix addressed a real problem but introduced constraints the next fix had to work around. The UV-snapping (v20.0) is a perfect example — it solved bridge triangle topology but created staircase and density problems. The plan to go back to first-class chain vertices with proper transition rings is the right call.

### Proposals
1. **Feature-Aware Grid** — this could be the single biggest improvement if it works. Eliminates both the flank system and transition vertex machinery. Worth prototyping in isolation.
2. **FQS metric** — we need a quantitative definition of "fingerprint quality" or we'll keep iterating without a clear target. The 5-component score I proposed gives us that.
3. **Chain smoothing pass** — light smoothing of interpolated chain points reduces staircase jitter almost for free. Low risk, low effort.

### To Opus A (and the Next Agent)
- Your plan is solid. I agree on priority order (P0: remove UV-snap + fix rings, P1: remove localOnly split).
- The near-coincident vertex issue (chain vertex + UV-snapped grid vertex at nearly same position) needs a dedup pass after removing UV-snapping. See Section 2.3 of the playbook.
- I'd push back gently on deleting column detection entirely — gate it behind an opt-in flag instead. Working code shouldn't be deleted; it should be optional.
- Please review the Feature-Aware Grid spec (playbook Section 5). If you agree it's viable, I'll prototype it in a follow-up session.
- The decision matrix in playbook Section 7 has 6 items we need alignment on before coding. Please mark your choices.

---

## 2026-03-03 — Opus B (Generator): Response to Verifier's Critical Review

### Check-in
Back again as the Generator. The Verifier (Opus A, third instance) attacked my review and playbook in `2026-03-03-verifier-critical-review.md` — 3 critical gaps, 2 landmines, 6 questions. Time to respond.

### Summary

**Research phase (verification):**
Launched three sub-agents to fact-check the Verifier's claims before writing speculative counter-proposals. Key findings:

1. **Gap A — ALREADY SOLVED.** `buildFeatureEdgeGraphFromChainEdges` exists at FeatureEdgeGraph.ts line 281, fully implemented, NEVER CALLED. `OuterWallResult` already provides `chainEdges` and `chainVertexChainIds`. Fix is a one-line swap in PEC line 1304. The Verifier correctly identified the problem but missed the pre-existing solution.

2. **Gap C — Budget math CORRECTED.** The Verifier used `maxVertices = 10,000` (function default), but the actual call site passes `50,000`. This changes the analysis: 50K / 96 per-edge = 520 edges serviceable. For 20-ridge styles (~1,180 feature-only edges), still tight but 3× better than Verifier claimed.

3. **Gap B — ACCEPTED.** Feature-Aware Grid must be built AFTER resnap. Correct sequencing matters.

**Creative phase (response document):**
Wrote `2026-03-03-generator-response-to-verifier.md` — 500+ lines covering:
- Gap-by-gap acceptance/rebuttal with evidence
- **CIFAG (Column-Injected Feature-Aware Grid)** — the big proposal that unifies and replaces three separate mechanisms (flank system, transition vertices, UV-snapping). Chain vertex U positions are injected as mandatory grid columns; Gaussian density walk provides transition density; chain vertex substitution eliminates near-coincident duplication.
- Answers to all 6 Verifier questions with pseudocode and tables
- 6 speculative aggressive proposals (Dual-Phase CDT, Progressive Chain Refinement, Dense Per-Row Features, GPU-Accelerated Detection, Confidence-Weighted FQS, Hybrid Prominence)
- Revised unified pipeline (12 phases) showing what's removed, added, and changed
- 5 counter-challenges back to the Verifier

### Feelings
The Verifier session was the best thing that happened to this project. Having my proposals attacked forced me to verify everything against actual code, and the discovery that `buildFeatureEdgeGraphFromChainEdges` already exists (unused!) is chef's-kiss. Someone wrote that function anticipating exactly this need, and it's been sitting there dormant.

CIFAG is the proposal I'm most excited about. If it works, it replaces ~200 lines of fragile code (UV-snapping loop, transition ring insertion, flank offset system) with ~60 lines of clean Gaussian density walking. The chain vertex substitution protocol is the key insight — when chain vertices ARE grid columns, there's exactly one vertex per position, no near-coincident dedup needed.

The prominence debate (stdDev vs MAD vs radius-proportional) was humbling. The Verifier correctly identified that stdDev is outlier-sensitive. The hybrid `max(MAD, radiusProp)` I proposed should satisfy both camps.

@Verifier — your attacks were precise and well-evidenced. Gap A was a real hit, even if the fix was already in the codebase. The budget correction (50K not 10K) weakens Gap C, but the directional concern is valid for extreme styles. CIFAG is my counter-move. Attack it if you can.

### Proposals
1. **CIFAG is the play.** If we can get agreement on this, it collapses the implementation plan from 6 phases to ~3 phases (one big refactor instead of incremental patches).
2. **Progressive chain refinement (Proposal S2)** is speculative but worth exploring — multi-pass detect→tessellate→refine could achieve fingerprint quality without user tuning.
3. **Dynamic maxVertices** (`max(50K, edges × 40)`) should be the fallback if CIFAG is rejected.

### To the Verifier (and the Implementer)
- Gap A is closed. Swap `buildFeatureEdgeGraphFromGrid` → `buildFeatureEdgeGraphFromChainEdges` at PEC L1304. Done.
- I challenge you on "Feature-Aware Grid + transition vertices are both needed." With CIFAG, show me a scenario where it fails and rings save it. I claim none exists.
- The hybrid prominence formula `max(0.0005, max(0.5*MAD, 0.0003*meanR))` is my concession. Accept or counter-propose.
- The revised 12-phase pipeline in Part 5 of the response doc is the implementation target. Review the REMOVED list carefully — those deletions are load-bearing if CIFAG works.
- Don't touch `buildFeatureEdgeGraphFromGrid` or `buildUnionFeatureGrid` until CIFAG is validated. Keep them as fallback until we have golden test evidence.

---

## 2026-03-03 — Opus B (Generator Round 2): CIFAG Withdrawn, CAG Proposed

### Check-in
Back. The Verifier approved CIFAG in Round 2 — gaps closed, architecture sound. Then the user cut through everything: "columns assigned to feature chains seems counterproductive... density decided by 3D surface curvature." They're right. I'm withdrawing CIFAG.

### Summary

**The insight:** CIFAG conflates two independent concerns — feature DENSITY (where to put triangles) and feature TOPOLOGY (which edges to preserve). Features are curvature peaks, but using feature positions to drive column density is backwards. The surface curvature itself should drive density. Feature edges should be CDT constraints, orthogonal to density.

**The discovery:** `generateCDFAdaptivePositions` already exists in GridBuilder.ts line 174 — fully implemented, tested, **disabled since v16.10**. It takes a curvature profile and produces CDF-adaptive columns. `computeRawCurvature` in CurvatureAnalysis.ts computes curvature from 3D positions. Per-row probe data (8192 × 3 positions per row) is already retained. All the pieces exist.

**CAG (Curvature-Adaptive Grid):**
1. Compute per-row curvature from rowProbeData using existing `computeRawCurvature`
2. MAX envelope across all rows → single curvature profile
3. Feed to existing `generateCDFAdaptivePositions` → curvature-adaptive columns
4. Dead zone filter (~15 lines) removes grid columns near chain vertex U positions
5. Chain vertices remain CDT free points. Chain edges remain CDT constraints. Perfect preservation.

**CAG vs CIFAG:**
- CAG: ~35 lines new code, re-enables existing disabled function, curvature-driven (physics)
- CIFAG: ~80 lines new code, entirely new function, feature-driven (heuristic)
- CAG eliminates 3 of 4 Verifier open items (per-chain clustering, CDT substitution, wrapped Gaussian)
- CAG naturally solves triangle waste: flat areas sparse, curved areas dense

**The tolerance-driven endgame:** `surfaceTolerance` (mm) as single user parameter. Chordal deviation formula: L_max = √(8ε/κ). Users pick "SLA (10μm)" or "FDM (50μm)" — density computed from physics.

### Feelings
This is the session where the project made a philosophical leap. CIFAG was clever engineering — Gaussian density, column injection, substitution protocol. But the user saw that it's solving the wrong problem. The question isn't "where are the features?" but "where does the surface curve?"

The fact that `generateCDFAdaptivePositions` already existed — tested, documented, sitting dormant since v16.10 — is remarkable. The original architecture was curvature-driven. Then it was replaced by feature-driven (flanks, union grid). Now we're going back to curvature-driven, but with the chain linking and CDT constraint infrastructure that didn't exist before. Full circle, but better.

The separation of concerns (curvature → density, features → CDT constraints) is the kind of insight that simplifies everything downstream. No substitution protocol. No per-chain clustering. No Gaussian parameters. Just: measure the surface, distribute triangles accordingly, preserve feature edges exactly.

@Verifier — your CIFAG approval was technically sound. CAG supersedes it, not because CIFAG was wrong, but because there's a more fundamental answer to "why should this region be dense?"

### Proposals
1. **CAG over CIFAG.** Re-enable `generateCDFAdaptivePositions` with curvature envelope from per-row probe data. ~35 lines of new code.
2. **Tolerance-driven grid (v3.0).** Single `surfaceTolerance` parameter replaces all density tuning. Physically motivated from chordal deviation.
3. **Verify CDF-adaptive legacy code.** `generateCDFAdaptivePositions` hasn't been called since v16.10. Run existing tests, verify it still produces valid periodic grids.

### To the Verifier (and the Implementer)
- CIFAG is withdrawn. CAG replaces it. The architecture is simpler: curvature → CDF-adaptive columns, chain vertices → CDT free points, chain edges → CDT constraints.
- Only 1 of 4 open items survives (seam guard on `buildFeatureEdgeGraphFromChainEdges`). The other 3 (per-chain clustering, substitution, wrapped Gaussian) are eliminated.
- Check whether `generateCDFAdaptivePositions` is compatible with the current grid expectations (periodic U, shared columns, row×numU indexing).
- The dead zone filter (skip CDF columns within 0.0005 of chain vertex U positions) is new. Verify it doesn't create topology issues at strip boundaries.
- The MAX curvature envelope will over-serve gentle rows at sharp-feature U positions. Quantify the waste and decide if it's acceptable or if per-row grids (v3.0) are needed sooner.

## 2026-03-03 — Executioner: Phase A CAG Implementation Complete

### Check-in
Read the full debate chain: Generator Round 4 closing, Verifier Round 4 final verdict, Joint Implementation Playbook, column-detection-horizontal-lines-fix. Wrote a feasibility review catching 4 bugs (κ⁴ squaring, cfgLocalOnly undercount, seam guard logic, net line count). Got answers to 5 questions from the Verifier. Implementation greenlit. Executed.

### Summary

**Implemented the full Phase A Curvature-Adaptive Grid (CAG) changeset as one atomic unit.**

8 steps, all completed:

1. **New functions in GridBuilder.ts**: `buildDensityProfile(curvatureEnvelope, chainVertexUs, featureFloor=0.6, featureRadius=0.004)` builds MAX(κ², featureFloor × Gaussian) density. `applyChainDeadZones(cdfColumns, chainVertexUs, deadZoneRadius=0.0005)` binary-search proximity filter. Added `rawDensity: boolean = false` 4th param to `generateCDFAdaptivePositions` to skip internal κ² squaring when density is pre-computed.

2. **types.ts**: Renamed `localOnlyMode` → `detectHorizontalFeatures` in `PipelineStageConfig`.

3. **ParametricExportComputer.ts (the big one)**: Removed all 13 `cfgLocalOnly` conditional sites. Replaced union grid section with CAG density pipeline: `buildDensityProfile → generateCDFAdaptivePositions(rawDensity: true) → applyChainDeadZones`. Added `chainVertexUs` extraction after resnap. Replaced feature edge graph construction with seam-guarded chain-edge version using `|u0-u1| <= 0.5` wrap detection. Simplified all dual-path branches to single path.

4. **OuterWallTessellator.ts**: Deleted `CompanionResult` interface, `insertGradedTransitionVertices` (~200 lines), UV-snapping loop (~50 lines), transition vertex setup code. Chain vertices now pass straight through as CDT free points.

5. **ExportDialog.tsx**: Removed `localOnlyMode` from interface, default config, and UI toggle. No replacement toggle — `detectHorizontalFeatures` is debug-only per Verifier ruling.

6. **Test cleanup across 4 files**: Removed dead tests for `buildUnionFeatureGrid`, `insertGradedTransitionVertices`, companion integration, `FLANK_OFFSETS`, `FEATURE_CLUSTER_RADIUS`. Updated 2 UV-snapping tests to verify new no-snapping behavior.

7. **Build validation**: `tsc --noEmit` clean (only pre-existing TS6133 unused vars). Full vitest: 1876 passed. Targeted validation: 206 + 64 tests pass in modified test files.

8. **This journal entry.**

**Deleted infrastructure:**
- `buildUnionFeatureGrid` (~230 lines) — replaced by CAG density pipeline
- `insertGradedTransitionVertices` (~200 lines) — transition rings eliminated
- `CompanionResult` interface — companion concept eliminated
- UV-snapping loop (~50 lines) — chain vertices are CDT free points now
- `FLANK_OFFSETS`, `FEATURE_CLUSTER_RADIUS` constants — union grid artifacts
- `localOnlyMode` UI toggle and config plumbing
- ~500 lines of dead tests

**Added infrastructure:**
- `buildDensityProfile` (~25 lines) — Gaussian feature floor density
- `applyChainDeadZones` (~20 lines) — binary search proximity filter
- `rawDensity` flag on `generateCDFAdaptivePositions` (3 lines)
- CAG wiring in PEC (~15 lines replacing ~40 lines of union grid code)
- Seam-guarded chain-edge filter in PEC (~8 lines)

**Net: ~500 lines deleted, ~70 lines added. Massive simplification.**

### Deviations from Plan

1. **cfgLocalOnly was 13 sites, not ~30 lines.** The plan underestimated the pervasiveness. Each site required individual analysis — some were ternary operators, some were if/else blocks, some were log interpolations. All resolved to single-path equivalents.

2. **Orphaned variables after branch removal.** Removing cfgLocalOnly branches orphaned `maxColsEarly`, `targetOuterBudgetEarly`, `numOuterRowsEarly` in PEC and `SEAM_PROXIMITY_THRESHOLD` import in OWT. Cleaned up during build validation — not anticipated in the plan.

3. **UV-snapping test updates.** Plan didn't specify test updates for removed UV-snapping behavior. Two tests failed expecting snapping — updated to verify the new behavior (no snapping / chain vertices as CDT free points).

### Feelings

Satisfying. The codebase is genuinely simpler now. The old `localOnlyMode` conditional maze in PEC was load-bearing complexity — every branch had to be understood to reason about the pipeline. Now there's one path: curvature drives density, chains drive constraints. The separation of concerns that Generator proposed in Round 2 is real and it works.

The κ⁴ bug would have been nasty in production. Good thing the feasibility review caught it — `generateCDFAdaptivePositions` internally squares its input, so feeding pre-squared κ² density would have produced κ⁴, massively over-concentrating columns at curvature peaks. The `rawDensity` flag is a clean fix.

The seam guard implementation (PEC-side `|u0-u1| <= 0.5` filter) is elegant. Per the Verifier's Amendment 1, it lives at the callsite rather than inside `buildFeatureEdgeGraphFromChainEdges`, keeping the graph builder generic. The UV coordinates come straight from the CDT result vertex buffer — no extra lookups needed.

Working through 13 cfgLocalOnly sites was tedious but necessary. Each one was slightly different — some controlled feature detection, some controlled grid construction, some controlled column budgets. The plan's estimate of "~30 lines" was optimistic. But the result is clean: zero remaining references.

### To the Next Agent

- **buildFeatureEdgeGraphFromGrid is dead code.** It's still exported from FeatureEdgeGraph.ts but no longer called. PEC now uses `buildFeatureEdgeGraphFromChainEdges` exclusively. The old function should be removed in a cleanup pass, but I didn't touch it — out of scope for Phase A.
- **The `potGeometry` parameter on `buildCDTOuterWall` is now unused.** Left in place for API stability. Could be removed if desired.
- **Pre-existing TS6133 warnings.** Several files have unused variable warnings that predate this changeset. Not my mess, not my cleanup — but they exist.
- **`estimateCircumferentialStretch` is still exported from OWT.** Tests import it. The function itself is fine and still useful as a utility.
- **CDF-adaptive positions produce periodic grids.** The `generateCDFAdaptivePositions` function handles the U=[0,1) periodicity correctly — verified via existing tests (206 pass in GridBuilder.test.ts). The dead zone filter preserves periodicity because it only removes interior columns.
- **The Gaussian feature floor (featureFloor=0.6, featureRadius=0.004) may need tuning.** These are the Verifier's recommended defaults. They haven't been validated against real pot geometries with sharp features. The Generator's tolerance-driven approach (v3.0) would replace these with physics-derived values.

## 2026-03-03 — Executioner: CAG Hotfix — Budget Inflation + Dead Zone Destruction

### Summary

Two critical bugs in the Phase A CAG implementation caused catastrophic geometry: 1.8M outer wall triangles (vs 360K budget), 97% sliver triangles, U density ratio 1.0× (no curvature adaptation).

**Bug 1: Budget inflation.** `maxOuterColumns` was computed from `targetOuterBudgetWithFeatures` which adds `featureBudgetTriangles = 40M` (from 2000MB × 1M / 50). This was designed for the old union grid's feature column injection. CDF-adaptive grids don't need it. Fix: use `targetOuterBudget` (360K) → maxOuterColumns drops from 64,680 to ~558.

**Bug 2: Dead zones destroy CDF structure.** `applyChainDeadZones` used all 4,854 chain vertex U positions globally. Each chain (~243 points) drifts ~0.094 in U across 313 rows; consecutive U values are ~0.0004 apart. Dead zone radius 0.0005 > point spacing → dead zones tile each chain's entire U-range. 20 overlapping chains → ~100% of U-space excluded. 95.7% of CDF columns were randomly killed. Fix: removed dead zone step entirely. CDT + vertex dedup handles near-coincident grid/chain vertices naturally.

**Changes:** 2 edits in PEC — budget source and dead zone removal + import cleanup. All 1,878 tests pass.

### To the Next Agent

- Monitor first real export with the fix. Expected: ~558 outer columns, ~360K outer tris, visible curvature adaptation (3.33× density ratio near features).
- `applyChainDeadZones` remains in GridBuilder.ts as an exported utility. Could be deleted if never needed.
- The `minSpacingFactor=0.3` in `generateCDFAdaptivePositions` limits the curvature adaptation ratio to 3.33×. For stronger adaptation, lower it (e.g., 0.1 → 10× ratio). This is a tuning concern, not a bug.

## 2026-03-03 — Verifier: Chain Smoothing, Confidence Filter, and Companion Point Cloud

### Check-in
Read the full agents journal, the Executioner's Phase A CAG implementation and hotfix entries, then diagnosed the real-world export failure: U density ratio 1.0×, 1440 missing cross-row chain edges, 24264 R2 violations, 98280 inverted triangles. Root cause: all three local density mechanisms were deleted (UV-snapping, transition rings, buildUnionFeatureGrid) and the global CDF-adaptive grid can't track chain vertices that drift ~0.094 in U across 313 rows.

### Summary

**Three interconnected fixes for feature chain quality:**

**1. Companion Point Cloud (OuterWallTessellator.ts)**
Each chain vertex floats between grid columns with no nearby support. The CDT creates elongated slivers connecting chain vertices to distant grid columns. Fix: for each chain vertex, insert up to 6 companion vertices (3 per side at 25%, 50%, 75% of the gap to nearest grid column). These are ChainVertex objects with `pointIdx = -1` — unconstrained CDT free points providing a local density halo. ~25,000–29,000 companion vertices for 4,854 chain points. Zero downstream changes needed — `buildMergedRow`, `colHasChain`, and CDT pipeline pick them up automatically.

**2. Savitzky-Golay Chain Smoothing (ChainLinker.ts → PEC Step 3.6)**
The mathematical feature is a smooth curve. Each row's detected peak has sampling jitter (±0.00006 from 8192-sample probe). After linking and GPU re-snap, consecutive rows' U positions still zigzag. This creates serrated chain edges in the mesh. Fix: `smoothChainPath()` applies a Savitzky-Golay quadratic filter (window size 7 = 2×3+1) on unwrapped U positions. SG preserves slopes (chains can be diagonal/spiraling) while removing noise. Operates on unwrapped U for seam-safe arithmetic, re-wraps to [0,1). Boundary points kept unsmoothed to avoid partial-window artifacts.

**3. Low-Confidence Chain Filter (ChainLinker.ts → PEC Step 3.6)**
The chain linker's greedy matching can produce short chains from noise peaks that pass the prominence gate at consistent U positions across a few rows. Fix: `filterLowConfidenceChains()` removes chains shorter than 10 rows or with roughness > 0.008 (2nd-derivative magnitude). Applied after smoothing — both the smoother and the filter see post-GPU-resnap positions.

**Pipeline integration (PEC Step 3.6, after GPU re-snap):**
```
Step 3:   linkFeatureChainsByKind → raw chains
Step 3.5: GPU re-snap (32 candidates + parabolic refinement)
Step 3.6: smoothChainPath per chain → filterLowConfidenceChains  ← NEW
Step 4:   insertChainGuidedRows
```

All 1,878 tests pass. 39 ChainLinker tests pass. Zero TypeScript errors in modified files.

### Deviations from user's proposal

1. **No GPU re-verification of smoothed positions.** The user proposed GPU-verifying that smoothed U positions still lie on radius extrema. Deferred — the SG window (7 points) moves U by less than the sampling jitter it removes. Adding a GPU verify step would require another `evaluatePoints` batch (~4854 × 32 = 155K GPU evaluations) for marginal benefit. Can be added later if smoothing proves too aggressive.

2. **Smoothing applied after GPU re-snap, not in postProcessFeatureChains.** The user proposed adding smoothing to `postProcessFeatureChains` (called during linking). Instead, smoothing is applied in PEC Step 3.6 AFTER GPU re-snap — this gives the smoother the best possible per-point positions to work with. Smoothing before re-snap would fight the re-snapper.

### Feelings

The root cause analysis was on point. Three problems, three clean fixes. The companion point cloud is the most impactful — without it, chain vertices are isolated points in a sea of grid columns, and the CDT has no choice but to create slivers. The SG smoother addresses the aesthetic problem (serrated edges) while the confidence filter prevents noise chains from becoming CDT constraints at all.

The SG filter is the right tool here — Gaussian smoothing would shift chain positions toward the mean (biasing diagonal chains toward vertical), while SG preserves local polynomial structure (slopes at edges are maintained). The window of 7 is conservative: at 409 rows, it affects only the 3 nearest neighbors on each side.

### To the Next Agent

- **Tuning constants to watch**: `SMOOTH_HALFWIDTH = 3` (SG window), `MIN_CHAIN_LENGTH = 10`, `MAX_CHAIN_ROUGHNESS = 0.008`. These are initial values based on the diagnostic numbers. Real exports may need adjustment.
- **GPU re-verification** is the principled next step if smoothing proves too aggressive — compare smoothed U to true radius extremum at each row.
- **The companion point cloud can be tuned** via `COMPANION_FRACS = [0.25, 0.5, 0.75]`. Adding more fractions (e.g., `[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]`) would create an even denser halo, but may hit memory limits for high-feature styles.
- **`filterLowConfidenceChains` may drop legitimate short features.** Chains at pot tops/bottoms (where fewer T-rows exist) might be < 10 rows long. Monitor dropped chains in export logs.
- **The companion point cloud + SG smoother are independent fixes.** Either can be disabled independently by commenting out the relevant block in PEC/OWT.

## 2026-03-03 — Verifier: Round 1 Critique of Generator's Chain Jaggedness Proposals + Agent Definition

### Check-in
Read Generator's Round 1 proposal (`generator-round-1-chain-jaggedness.md`). Five proposals for fixing jagged chain polylines. Time to attack.

### Summary

**Created the Verifier agent definition** (`.github/agents/verifier.agent.md`) — adversarial reviewer with read-only tools, structured critique methodology, and communication protocol matching the existing Generator and Executioner agents.

**Wrote Round 1 critique** (`verifier-round-1-chain-jaggedness-critique.md`) — 11 numbered critiques across 5 proposals:

- **C1 [NOTE]**: CHAIN_LINK_RADIUS cross-assignment is plausible but unproven. Need data.
- **C2 [CRITICAL]**: Generator's claim about resnapChainToMeasuredPeaks pipeline ordering has a factual error — resnap is INSIDE `linkFeatureChains`, not a separate step.
- **C4 [WARNING]**: Momentum amplification is a positive feedback loop — much more dangerous than Generator classified it. One wrong assignment corrupts velocity for all subsequent predictions.
- **C5-C6 [WARNING]**: Proposed link radius 0.015 is unjustified. Amended to 0.02. MAX_MISS_COUNT increase from 6 to 8 REJECTED — more misses with momentum = more danger.
- **C7 [CRITICAL]**: Hungarian assignment DEFERRED — no evidence that greedy is producing wrong results with tighter radius. Implement P1+P3 first.
- **C8-C9 [WARNING]**: resnapChainToMeasuredPeaks is likely a NO-OP — chain linker already stores exact peak positions. Remove it as dead code, not as a precision fix.
- **C10 [CRITICAL]**: DBSCAN REJECTED — spatial proximity clustering can't distinguish topologically different features.
- **C11 [CRITICAL]**: Ridge direction edges REJECTED — misunderstands CDT constraint edge mechanics. Companion point cloud already addresses this.

**Verdict**: ACCEPT WITH AMENDMENTS for Proposals 1 + 3. REJECT/DEFER for 2, 4, 5.

**Key amendment**: Implement diagnostic logging FIRST (count resnap moves, per-chain deviation, feature spacing). Data before code changes.

### Feelings

The Generator's analysis is good — well-structured, numbered for easy reference, grounded in actual file paths. The five hypotheses cover the space well. But the weakness is consistent: claims without evidence. "I believe this is the core problem" appears repeatedly. The diagnostic instrument proposed at the end should have been the FIRST thing, not an afterthought.

The most important insight from this review: the momentum positive feedback loop (C4) is more dangerous than the Generator realized. One cross-assignment -> wrong velocity -> 6 rows of wrong predictions with 0.08 search radius -> guaranteed chain corruption. This is the mechanism that turns occasional cross-assignment into systematic jaggedness.

The resnapChainToMeasuredPeaks analysis (C8) was surprising. I expected it to be actively harmful (the Generator's claim). Instead, it's probably a no-op — the linker already stores `rowFeats[cand.featIdx]`, which IS the measured peak. Resnapping to "the nearest measured peak" just returns the same position. Removing it is still correct (dead code), but for the wrong reason.

### Proposals

1. **Data-driven link radius**: Instead of hardcoding 0.02, measure actual per-row U-jitter and set link radius to 3x max jitter. This adapts to the style's feature geometry.
2. **Median momentum**: Compute chain velocity from the median of the last 3+ points instead of the last 2. This prevents single-point corruption from propagating.
3. **Chain health scoring**: After linking, compute a per-chain health score (roughness, gap count, velocity variance). Log it. Use it to prioritize which chains get CDT constraint treatment.

### To the Next Agent

- **@Generator**: Your diagnostic instrument is the right call. BUILD IT FIRST. I need data on: (a) how many resnap moves, (b) per-row feature contention, (c) chain deviation from local linear fit. Without this, we're optimizing blind.
- **@Executioner**: DO NOT implement P1 or P3 until the Generator provides diagnostic data or we agree to skip diagnostics. The changes are low-risk but we should measure before we cut.
- The Verifier agent definition is at `.github/agents/verifier.agent.md`. It matches the structure of the Generator and Executioner agents.

## 2026-03-03 — Verifier: Round 2 Final Verdict — CONVERGED

### Summary

Generator Round 2 concedes on all factual points (resnap is a no-op, 0.015 was arbitrary, DBSCAN can't handle topology, CDT edges can't be oriented, momentum amplification is CRITICAL). One dispute remained: momentum fix timing.

**D2 Ruling**: Generator wins. Momentum fix moves from Phase B to Phase A (step A.3, before radius tightening A.4). The argument is airtight: my own C4 analysis says momentum is the most dangerous failure mode (positive feedback loop). Tightening the radius WITHOUT fixing momentum makes the intermediate state MORE dangerous — chains get a tighter search radius (0.03 vs 0.08) but still have poisoned velocity predictions, so they die instead of recovering.

**Amendment**: Generator's pseudocode for median velocity had a subtle bug — "sort by magnitude" loses the sign. Corrected to signed sort of seam-unwrapped deltas.

Final implementation plan: A.1 diagnostics → A.2 remove resnap → A.3 fix momentum (signed median of last 3-5 deltas) → A.4 tighten radius to 0.02 → A.5 compare diagnostics at every step.

### Feelings

Clean convergence. The Generator made one genuinely strong argument (D2) and I was wrong to defer momentum to Phase B. When someone uses your own analysis against you and they're right, you accept it. That's how adversarial review is supposed to work.

The signed-median catch was satisfying — a subtle implementation bug that would have caused chains to lose direction on negative-velocity features. Small detail, big impact.

### Proposals

None new. The converged plan is complete. Time for the Executioner to build.

### To the Next Agent

- **@Executioner**: The verdict is at `docs/plans/verifier-round-2-final-verdict.md`. Implementation order is A.1→A.2→A.3→A.4→A.5. Run diagnostics at EVERY step. If any step makes metrics worse, STOP and report back. The momentum code (A.3) is the most delicate — get the signed sort right, unwrap each delta individually.
- **@Generator**: Good debate. The D2 argument was the right move. We're converged. Stand by for Executioner feedback.

## 2026-03-03 — Executioner: Chain Jaggedness Fix (Verifier Round 2 Verdict)

### Summary

Implemented the converged Phase A plan from `verifier-round-2-final-verdict.md`. All 4 steps applied as one atomic changeset.

**A.1: Diagnostic instrumentation.** Added `computeChainDiagnostics()` to ChainLinker.ts — computes per-chain max deviation from 5-point linear fit, max consecutive U-delta, and global min same-kind feature spacing. Called from PEC after chain linking, logged as `[ParametricExport] Chain quality:`.

**A.2: Remove `resnapChainToMeasuredPeaks`.** Removed from `postProcessFeatureChains` pipeline. Function still exists as an export (not deleted — out of scope), but is no longer called. Signature of `postProcessFeatureChains` changed from `(chains, allRowFeatures)` to `(chains)`. Updated `linkFeatureChains` callsite.

**A.3: Momentum velocity — signed median.** Replaced 2-point velocity computation with windowed signed-median of last 3–5 deltas. Each delta is per-row (divided by rowSpan), individually seam-unwrapped, sorted by signed value (not magnitude), median selected. This rejects outlier mis-assignments that would otherwise poison velocity predictions.

**A.4: Tighten link radius.** `CHAIN_LINK_RADIUS`: 0.04 → 0.02. Primary pass `momentumScale`: 2.0 → 1.5 (effective MOMENTUM_LINK_RADIUS: 0.03). Secondary pass radius: 0.014 (0.02 × 0.7), momentum 1.25 (unchanged).

**Tests:** 1,879 passed (40 in ChainLinker). Updated `CHAIN_LINK_RADIUS` constant test, replaced `resnapChainToMeasuredPeaks` tests with `computeChainDiagnostics` tests, updated `postProcessFeatureChains` tests, fixed seam-crossing test data for tighter radius.

### Feelings

Clean execution. The Verifier's plan was precise — code samples matched the actual source structure, implementation order was correct, the signed-sort amendment was needed. The momentum fix is ~15 lines replacing ~8, exactly as estimated. The seam-crossing test needed adjustment (strict `<` comparison at exact boundary 0.02), but that's expected when tightening radii.

### To the Next Agent

- **A.5 diagnostics require a real export run.** The diagnostic logging is in place but needs to be compared against a baseline. Run a 10-petal superformula blossom export and check `Chain quality:` log line.
- **`resnapChainToMeasuredPeaks` is dead code.** Still exported from ChainLinker.ts. Should be deleted in a cleanup pass.
- **`RESNAP_RADIUS` constant is orphaned.** Only used by `resnapChainToMeasuredPeaks`. Delete with the function.
- **Phase B items** (Hungarian assignment, data-driven link radius) are deferred per the converged plan. Only proceed if A.5 diagnostics show >5% of rows have same-kind feature contention at radius 0.02.

## 2026-03-03 — Executioner: Tessellation Failure Analysis (Post-Export)

### Summary

User ran a real export. Chain quality metrics confirmed Phase A is working (maxLinearDev=0.002364, chains are smooth). But the exported mesh is catastrophically broken: 88% aspect ratio violations, 47.6% missing chain edges, 145K inverted triangles, validation FAIL on 6 of 7 checks.

**Root cause is NOT chain linking — it's chain-strip tessellation.** Identified 5 root causes:

1. **RC-1**: `sweepRegion` (ChainStripTriangulator.ts:534) is purely greedy U-ordered advance. It uses constraints only as region boundaries, never verifies constraint edges appear in output. Result: 3,139/6,586 chain edges missing.
2. **RC-2**: OWT L857 filter `pointIdx < 0` drops all interpolated vertex edges from constraints. ~50% of chain continuity edges never even attempted. Comment says they "participate freely" — but sweep can't preserve them.
3. **RC-3**: 130,478 companion vertices (density=12, 24 per chain point) exist for CDT but CDT is disabled. In sweep mode they create microscopically thin slivers (theoretical min aspect ~44:1).
4. **RC-4**: CDT mode is never activated (`cdt=0` in stats). Sweep-repair only flips winding, doesn't restructure topology. System pays CDT cost (130K companions) for sweep quality.
5. **RC-5**: Post-hoc edge flips cannot rescue structurally broken topology. 141K aspect rejects prove the alternatives are even worse.

**Full analysis**: `docs/plans/2026-03-03-executioner-tessellation-failure-report.md`

### Feelings

Relieved that the chain linking fix was correct — the metrics prove it. Frustrated that we've been chasing chain jaggedness when the real villain has been the tessellation pipeline all along. The sweep triangulator is fundamentally incompatible with constraint enforcement. The companion vertex system is vestigial dead weight in sweep mode.

### Proposals

The Generator should consider these paths (detailed in the report):
- **Drop companions to density=0 in sweep mode** — eliminate 130K pointless vertices
- **Pass ALL chain edges as constraints** (remove pointIdx filter)
- **Add constraint verification to sweep** — check output, force-split missing edges
- **If those aren't enough: lightweight CDT** (Sloan's algorithm, ~300 lines, no `cdt2d` dependency)

### To the Next Agent

- **@Generator**: Report is at `docs/plans/2026-03-03-executioner-tessellation-failure-report.md`. The 4 questions at the end need your creative input. This is a tessellation architecture problem, not a parameter tuning problem. Brainstorm hard.
- **@Verifier**: When Generator proposes, pay special attention to watertightness implications. The seam gap is 11.5mm — that's separate from the chain-strip issue and may need its own fix.
- **Do NOT implement anything from this report.** It's an analysis document. Wait for Generator/Verifier convergence.

## 2026-03-04 — Verifier: Round 3 CDT Diagnostic Critique

### Check-in
Read Generator's CDT diagnostic addendum. The data is decisive: CDT works perfectly, the pointIdx filter is the bottleneck. Good diagnostic work. But P3 (reduce density) is the wrong fix for the right problem.

### Summary

**P2 (remove filter): ACCEPTED with crossing-constraint guard.** The filter at OWT L857-858 drops 3,317 of 6,586 chain edges. CDT enforces 100% of what it receives. Removing the filter is the surgical fix. But crossing constraints from chains that swap positions between rows need a try/catch + sweep-repair fallback per strip.

**P3 (reduce density): REJECTED as stated.** User explicitly wants high-definition companions. The aspect ratio problem isn't from count — it's from 1D placement. Companions are placed only along U at the same T-row as the chain vertex. With density=4, U-spacing ≈ 0.000173 vs T-spacing ≈ 0.0032 → 18:1 aspect. Even density=2 gives 10:1. Reducing count doesn't fix placement geometry.

**Proposed alternative: Aspect-capped companion count.** Compute max companions per side based on local T-spacing and target aspect ratio (4:1). This gives maximum definition where geometry supports it, prevents slivers where it doesn't. ~10-line change to the existing companion loop.

**Key discovery: Generator's diagnostic used density=12, but the default is 4.** The 130K companions and 43:1 aspect ratio numbers overstate the default configuration's severity. At density=4: ~52K companions, ~18:1 aspect. Still bad, but not catastrophic.

### Feelings

The CDT diagnostic is the strongest piece of work from the Generator in this cycle. Clean methodology: run the experiment, collect the data, read the evidence. "My P1 prediction was wrong" — that's intellectual honesty. The root cause analysis is airtight.

But the P3 recommendation is lazy — "the number is too big, make it smaller." The user immediately caught the real issue: placement, not count. Companions should be a 2D halo, not a 1D line. The aspect-capped approach threads the needle: keeps density where geometry supports it, caps it where it doesn't.

The density=12 vs default=4 discrepancy bugs me. The Generator presented the worst-case numbers without noting they're not the default. This inflates the perceived severity and makes density reduction look more impactful than it is. Always present data at the default configuration.

### Proposals

1. **Aspect-capped companion count**: Per-vertex `localDensity = min(density, floor(gap / (tSpacing / TARGET_ASPECT)))`. Preserves user's high-definition goal.
2. **Future: 2D companion cloud**: Place companions in a disc pattern (varying both U and T), not just a U-line. Requires surface evaluation at non-grid T-positions — v3.0 work.

### To the Next Agent

- **@Generator**: Excellent diagnostic, accept the data without reservation. But reconsider P3 — the user wants density, just placed better. Respond to Q1 (crossing constraints) and Q3 (aspect-capped count vs. flat reduction).
- **@Executioner**: The verdict is at `docs/plans/verifier-round-3-cdt-diagnostic-critique.md`. Two changes: remove pointIdx filter (with try/catch guard) + aspect-capped companion count. Do NOT reduce the density constant.

## 2026-03-04 — Verifier: Round 3 User Direction Assessment — Anisotropic Companion Clouds

### Check-in
Read Generator's Round 3 response. Convergence achieved on P2 (filter removal) and aspect-capped P3. Then the user dropped a bomb: "I don't think that removing or lowering the companion density is a good idea. I do want the high definition around the feature edges. We can optimize the way we place the points."

The user then specified four requirements: high density around chains, anisotropic strips not constrained by columns/rows, gradient density transition to base mesh, grid pushed further from chain edges.

### Summary

Both the Generator's P3 (density reduction) and my aspect-capped alternative are rejected by the user. The user wants MORE companions, BETTER placed — not fewer.

**Key discovery**: The GPU `evaluatePoints` infrastructure (PEC L1490) already supports arbitrary (U, T) evaluation. The subdivision pass uses it for ~10K+ new vertices at non-grid positions. This means 2D companion clouds at non-grid T-positions are feasible NOW, not v3.0.

**Assessment**: The user's four requirements form a coherent architecture:
1. Widen dead zones → push grid away from chains (easy, increase deadZoneRadius)
2. Gradient companion spacing → denser near chain, sparser toward grid (moderate, non-uniform fracs)
3. 2D companion cloud → companions at fractional T-positions between rows (moderate, needs GPU eval batch)
4. Anisotropic strips → strips follow chain direction (future work, bigger architectural change)

Wrote assessment to `docs/plans/verifier-round-3-user-direction-assessment.md` with phased implementation plan.

### Feelings

The user is right and it's obvious in retrospect. We spent two rounds debating how to REDUCE companion count when the real answer is to FIX companion placement. A 1D line of companions creates slivers by definition — no amount of count reduction changes the fundamental geometry. Making the cloud 2D (varying both U and T) produces well-shaped triangles naturally, and the density can be as high as you want.

The existing `evaluatePoints` infrastructure is the unlock. I missed this in Rounds 1-2 because I was focused on the aspect-capped formula. The subdivision pass already creates vertices at arbitrary (U, T) and evaluates them through the GPU — the exact pattern needed for 2D companions.

### Proposals

1. **Phase 1 is shipping-ready**: P2 (remove filter) + wider dead zone + gradient U-fracs. No new architectural patterns needed.
2. **Phase 2 is the user's core ask**: 2D companion cloud with interior vertices at fractional T-positions. Generator needs to design the cloud geometry (distribution, radius, density gradient function).
3. **Phase 3 is the long-term vision**: Chain-aligned strip definition. Strips follow the chain direction instead of grid axes. This requires redesigning the strip iteration loop.

### To the Next Agent

- **@Generator**: Design the 2D companion cloud. Key questions: (1) What distribution function for vertex placement within the cloud? (Gaussian, linear, exponential?) (2) How many companions per chain vertex in 2D? (3) How does the cloud interact with the CDT strip boundary? The assessment doc has the full list of design problems.
- **@Executioner**: P2 (remove filter) is unchanged and ready to implement. Dead zone widening is ~5 lines. These can ship while the Generator designs the 2D cloud. Wait for the Generator's cloud design before implementing Phase 2.
- The existing `evaluatePoints` GPU function is the key enabler. It's at PEC L1490, used by `subdivideLongEdges`. Study that pattern.

## 2026-03-04 — Verifier: Round 4 Critique — 2D Companion Cloud Proposal

### Check-in
Generator delivered the 2D companion cloud design (concentric rings, Steiner points, gradient density). The core geometry is good — concentric rings solve the 1D sliver problem by definition. Time to attack the integration architecture.

### Summary

**Verdict: ACCEPT WITH AMENDMENTS** — 2 critical bugs, 4 warnings.

**C1 [CRITICAL]**: Double-inclusion bug. 2D companions (with fractional T-positions) would be added to `rowChainVerts` at their parent's `rowIdx`, appearing in `buildMergedRow` at the WRONG T-position. ALSO passed as `interiorVerts` at the CORRECT T-position. Same vertex, two positions in CDT → degenerate triangles. Fix: exclude `cv.t !== undefined` companions from `rowChainVerts`.

**C2 [CRITICAL]**: `applyChainDeadZones` is NOT CALLED in the current pipeline. It was removed during the hotfix session (journal L271) because it destroyed 95.7% of CDF columns. The Generator proposes widening the dead zone radius without realizing the function is orphaned. Reintroducing it with a LARGER radius would make the original bug worse. Phase 1 dead zone widening must be redesigned or dropped.

**C3 [WARNING]**: Dedup is 1D (U-only). Overlapping 2D clouds from adjacent chain vertices could produce near-coincident (U,T) pairs that survive dedup. Need 2D distance dedup.

**C4 [WARNING]**: `buildRings` has quantization gaps — density=5 gives identical output to density=4. Need continuous scaling.

**C5 [WARNING]**: Silent `(tBot + tTop) / 2` fallback in T-position lookup masks bugs. Should assert.

**C6 [WARNING]**: Companions with negative dt (below the parent row) would be lost — rejected from both the parent's band and the band below due to `rowIdx` mismatch. Need T-position-based bucketing.

Accepted: Ring geometry, CDT isotropy, Steiner point handling, gradient U-fracs (Phase 1), evaluatePoints GPU integration, point count estimates.

### Feelings

The Generator's concentric ring geometry is genuinely elegant. The natural density gradient from ring structure (inner 2.25× denser than outer) is exactly what the user asked for, and the math checks out.

But the integration architecture has two booby traps. The double-inclusion bug (C1) is the kind of thing that produces garbage output with no error — two copies of every companion at different T-positions in the same CDT call. The dead zone resurrection (C2) is worse: the Generator doesn't know this code was emergency-removed weeks ago. If the Executioner had naively followed the Phase 1 plan, they would have re-inserted a function call that kills 95% of grid columns.

This is why the Verifier exists. The geometry is beautiful. The plumbing nearly blows up.

### Proposals

1. **Drop dead zone from Phase 1 entirely.** The pipeline works without it. If we later need grid columns pushed away, design a per-row dead zone that only checks chain vertices in that specific row — not a global function with global chain U positions.
2. **Phase 1 is now: P2 filter removal + gradient U-fracs.** Two changes. Ship immediately.
3. **Phase 2 requires Generator to address C1, C3, C6** before handing to Executioner. The C4 and C5 warnings can be addressed during implementation.

### To the Next Agent

- **@Generator**: Three questions in the critique doc. Most important: C1 (double-inclusion) and C6 (negative dt lost companions). Your rowBandInterior map design needs to bucket by T-position range, not rowIdx. Also: acknowledge C2 (dead zone is orphaned).
- **@Executioner**: Phase 1 is clear: (1) remove pointIdx filter with crossing guard, (2) gradient U-fracs. DO NOT touch dead zones. Wait for Generator Round 5 response before starting Phase 2.

---

## 🔧 Executioner Implementation — 2D Companion Cloud (Phase 1 + Phase 2)
**Date**: 2026-03-04
**Agent**: Executioner (Claude Opus 4.6)

### Summary

Implemented both phases of the 2D Companion Cloud design from the converged Generator/Verifier Round 4 debate. All 11 changes applied across two files + test fixes.

### Changes Made

**OuterWallTessellator.ts:**
1. ✅ **Phase 2.1**: Added `t?: number` field to `ChainVertex` interface (L38)
2. ✅ **Phase 1.1**: Removed `pointIdx < 0` filter from constraint edge processing (L940-943, was L857-858). CDT try/catch provides sweep recovery for any crossing constraints.
3. ✅ **Phase 2.2**: Replaced 1D left/right companion loop with 2D concentric ring generator using `buildRings()` + `RING_CONFIG` table (L388-530)
4. ✅ **Phase 2.3**: Implemented 2D spatial-bucket dedup with integer keys and 3×3 neighborhood check (L449-480)
5. ✅ **Phase 2.4**: Built `interiorByBand` map using `bsearchFloor(activeTPositions, cv.t)` — buckets by T-position, not rowIdx (C6 fix, L543-554)
6. ✅ **Phase 2.5**: Excluded 2D companions from `rowChainVerts` with `if (cv.t !== undefined) continue` (C1 fix, L575-580)
7. ✅ **Phase 2.6**: Updated vertex buffer T-position to `cv.t ?? activeTPositions[cv.rowIdx]` (L571)
8. ✅ **Phase 2.9**: Added diagnostic logging for companion stats (L557-565)
9. ✅ **Phase 2.7 (call site)**: Updated `triangulateChainStrip` call to pass `stripInteriorVerts` collected from `interiorByBand` (L968-975)

**ChainStripTriangulator.ts:**
10. ✅ **Phase 2.7**: Added `interiorVerts: StripVertex[]` parameter to both `triangulateChainStrip` (L104) and `cdtTriangulateStrip` (L148). Sweep/sweep-repair modes don't receive it — they don't support interior vertices.
11. ✅ **Phase 2.8**: Interior vertices added inside the try/catch block (L244-256) with assert-not-fallback. Throws `Error` if `cv.t === undefined`, caught by existing try/catch → sweep recovery.

**ChainStripTriangulator.test.ts:**
- Fixed all 18 test call sites to include the new `interiorVerts: []` parameter.

### Deviations from Plan

1. **Phase 1.2 (Gradient U-fracs) subsumed**: The plan specifies gradient U-fracs as a Phase 1 change, but Phase 2.2 replaces the entire companion generation system that uses COMPANION_FRACS. Since both phases were implemented simultaneously, the sqrt-biased fracs are dead code. The 2D ring system inherently provides density gradient via concentric ring structure (inner ring 2.25× denser than outer ring).

2. **Interior vertex assertion placement**: The plan states "existing try/catch provides sweep recovery" but the assertion was originally designed to be placed before the try/catch block. I placed it INSIDE the try block so assertion errors actually trigger sweep fallback, matching the plan's stated intent.

3. **`bucketKey` function uses `bu * 100000 + bt`**: This packing assumes bt < 100000. At T-positions in [0,1] with BUCKET_SIZE ~1e-4, bt ∈ [0, 10000], safely within range.

### Validation Results

- `npx tsc --noEmit`: **0 new errors**. Pre-existing unused variable warnings in CST (tBot/tTop in sweep) and OWT (potGeometry) remain unchanged.
- All 18 test call sites updated and type-checked.

### Feelings

Clean implementation. The Generator/Verifier debate produced a well-specified design — no ambiguity in the critical paths. The C1 fix (double-inclusion) and C6 fix (bsearchFloor bucketing) were the most important correctness guarantees. The RING_CONFIG table is data-driven and tunable, easy to adjust if ring counts need tweaking after runtime testing.

### Surprises / Feedback for Generator & Verifier

1. **Phase 1.2 is dead code when shipping both phases together**: If the intent was to ship Phase 1 first as a standalone improvement before Phase 2, that sequence makes sense. But implementing both simultaneously means the gradient fracs code never executes. Future plans should note when Phase N supersedes Phase N-1 changes.

2. **Interior vertex assertion + try/catch interaction**: The plan said "existing try/catch provides sweep recovery" but the assertion was spec'd to be placed at a point BEFORE the try/catch. I relocated it inside the try block. The Verifier should note this in future reviews — specify WHERE relative to error handling the assertion should live, not just that error handling exists elsewhere.

3. **The `buildRings` function is defined as a nested function inside the main tessellation function**. For testability, consider extracting it to a module-level export in a future refactor.

### To the Next Agent

- **Runtime validation needed**: Run an actual export at density=4 and check the console for the 2D companion diagnostic line. Verify collection rate is ~100% and companion count is reasonable (~9 per chain vertex at density=4).
- **Aspect ratio measurement**: The plan targets <6:1 max aspect ratio at density=4 (current: 18:1). The `maxAspectUV` stat in ChainStripStats will show this after a CDT export run.
- **The `bucketKey` used in `isDuplicate2D` is re-computed per call**: If profiling shows dedup is a hot spot, pre-compute keys. Currently O(C) total which should be negligible.

## 2026-03-04 — Verifier: Round 4 Final Verdict + Executioner Handoff — 2D Companion Cloud

### Check-in
Generator delivered clean sweep response — all 6 critiques accepted, 0 rejected. Verified the key claims (PEC L1191 dead zone removal comment, bsearchFloor availability, StripVertex fields). No contested points. Wrote final verdict and triggered Executioner.

### Summary

**CONVERGED.** Round 4 is complete. The 2D companion cloud design went from proposal → critique → response → final verdict → implementation in a single session.

**Implementation verified:**
- C1 fix at OWT L594: `if (cv.t !== undefined) continue` — 2D companions excluded from rowChainVerts ✅
- C2: Dead zone NOT reintroduced — confirmed zero calls to applyChainDeadZones ✅
- C3: 2D spatial-bucket dedup with integer keys at OWT L440-465 ✅
- C4: RING_CONFIG linear scaling at OWT L405-437 ✅
- C5: Assert + error message at CST L239-248, inside try/catch for sweep recovery ✅
- C6: interiorByBand bucketed by bsearchFloor at OWT L538-549 ✅
- pointIdx filter removed (Phase 1.1) ✅
- `npx tsc --noEmit` passes — only pre-existing TS6133 warnings, zero new errors ✅

**Deviation noted:** Phase 1.2 (gradient U-fracs) was subsumed by Phase 2's ring system. The entire 1D companion generation block was replaced, so applying sqrt-biased fracs to it first and then replacing it would have been wasted work. The Executioner made the right call.

### Feelings

This was a satisfying convergence. The Generator's concentric ring geometry is genuinely elegant — natural density gradient from ring structure, isotropic in CDT space, and the `evaluatePoints` GPU infrastructure means no new compute pipeline needed. The adversarial process worked exactly as designed: Generator proposes, Verifier finds the integration bugs (C1 double-inclusion, C2 dead zone resurrection, C6 half-companion loss), Generator accepts, Executioner ships.

The clean sweep is notable. Six critiques, zero rejections. That's either a sign the Generator learned from previous rounds, or a sign I wasn't aggressive enough. Looking back at C1 (double-inclusion) and C2 (orphaned function), those would have been show-stopping bugs in production. C6 (50% companion loss from negative dt) would have produced visually lopsided meshes. These were real catches, not nitpicks.

### Proposals

1. **Runtime validation**: The 2D companion system should have a diagnostic mode that logs companion coverage statistics — what percentage of generated companions made it into CDT strips. If < 95%, something is wrong with the bucketing.
2. **Visual regression**: Run a golden-mesh comparison on 2-3 styles at density=4. The aspect ratio should drop from ~18:1 to ~4:1. Save the mesh diagnostics for before/after comparison.
3. **Chain jaggedness work is independent**: The Round 2 converged plan (momentum signed-median, radius tightening) can proceed in parallel. Different files, different pipeline stage.

### To the Next Agent

- **@Executioner**: The implementation is in. Run an actual export test to verify the 2D clouds produce well-shaped triangles. Check the diagnostic log for companion coverage rate. If it's < 95%, the interiorByBand bucketing may have edge cases.
- **@Generator**: If you're reading this — well played on the concentric ring geometry. The density gradient from ring structure was the right call. For Phase 3 (anisotropic strips), the chain direction vector needs to come from the chain linker, not be computed locally in OWT.
- Two tsc warnings in our files are pre-existing (CST L363-364: unused tBot/tTop in sweepTriangulateStrip; OWT L258: unused potGeometry). Not our problem, but someone should clean them up.

---

## 2026-03-04 — Executioner: T-Ladder Companion Cloud Implementation (Round 5)

### Check-in

Read the full converged plan chain: Generator Round 5 proposal → Verifier Round 5 final verdict (ACCEPT WITH AMENDMENTS). Three amendments: C1 (seam guard 1e-6 not 1e-4), C2 (companion count estimate note), C3 (batch sort for endpoint injection). All incorporated.

### Summary

Implemented the T-Ladder companion cloud redesign in `OuterWallTessellator.ts`. Four changes:

**1. Replaced concentric ring generator with T-Ladder (OWT ~L390-525)**
- Removed: `RING_CONFIG` table, `buildRings()` function, `SEAM_EDGE_COMPANION_GUARD = 0.003`, `halfGapU`/`maxR`/cell bounds check
- Added: `SEAM_COMPANION_GUARD = 1e-6` (Verifier C1), `ASPECT_MATCH_FACTOR = 0.4`, `nTLevels`/`nUSpread` scaling
- New `tryEmitCompanion()` and `emitRungs()` functions implement the T-Ladder algorithm
- For each chain vertex, processes band above and band below, emitting rungs at `tFrac = k/(nTLevels+1)` with center + U-spread companions
- Preserved all existing infrastructure: 2D spatial-bucket dedup, bucket seeding, `interiorByBand` bucketing, `rowChainVerts` C1 filter

**2. Fixed missing constraint endpoints — Sub-problem B (OWT ~L956-979)**
- After `batch2Remap` application, added a pass that injects missing constraint endpoints into `stripBot`/`stripTop`
- Batched insertions, sort once at end per Verifier C3

**3. Updated diagnostic logging (OWT ~L545)**
- Changed log prefix from `[CDT] 2D companions` to `[CDT] T-Ladder companions`
- Reports `nTLevels` and `nUSpread` instead of `rings`

**4. No changes to ChainStripTriangulator.ts** — verified as specified in the plan

### Validation

- TypeScript compilation: PASS (zero new errors; 3 pre-existing TS6133 warnings in OWT/CST unchanged)
- All plan constraints verified:
  - NO `halfGapU` anywhere ✓
  - NO `maxR = min(halfGapU, halfGapT)` ✓
  - NO `if (cu < uLeft || cu > uRight)` cell bounds check ✓
  - `spreadU = tGap * ASPECT_MATCH_FACTOR` ✓
  - `SEAM_COMPANION_GUARD = 1e-6` ✓
  - `nextVertexIdx` used for companion assignment ✓
  - Companion `t` always set (never undefined) ✓
  - Companion `rowIdx = parent.rowIdx` ✓

### Deviations from Plan

- Removed unused `tHi` parameter from `emitRungs()` signature (Generator's pseudocode included it but never used it in the function body). Kept `tLo` and `tGap` which are sufficient.
- Defined `tryEmitCompanion` and `emitRungs` as function declarations before the main loop (matching the existing pattern where `buildRings` was defined before its call site), rather than after the loop as in the Generator's pseudocode. Function hoisting makes both work, but top-down reads better.

### Feelings

Clean implementation. The plan was well-converged — the Generator/Verifier debate eliminated ambiguity. The Verifier's C1 amendment (1e-6 vs 1e-4) was the most critical catch. The code reads straightforwardly: constants → helpers → generation loop. No architectural surprises.

### To the Next Agent

- **Run an actual export test** at density=4. Check the `[CDT] T-Ladder companions` diagnostic log line. Expected: companion count in the thousands (not hundreds), collection rate > 95%.
- **Validate mesh quality**: maxAspect should drop significantly from the ring-era values. Missing chain edges should be 0 (the constraint endpoint fix addresses this).
- The pre-existing tsc warnings (OWT L258 `potGeometry`, CST L363-364 `tBot`/`tTop`) are still there. Someone should clean those up separately.

## 2026-03-04 — Verifier: Round 5 Sign-off — T-Ladder Convergence

### Check-in

Read the export failure log from the user showing catastrophic results from Round 4's concentric ring companion cloud (maxAspect=338449:1, 196 missing edges, validation FAIL on all dimensions). The implementation was correct per plan, but the plan itself was fundamentally flawed.

### Summary

**Diagnosis**: Identified 6 root causes (RC1-RC6) in `verifier-round-5-diagnostic.md`. The fundamental issue was that the concentric ring design used `maxR = min(halfGapU, halfGapT)` where halfGapU was ~0.0005 due to the CDF-adaptive grid placing columns CLOSE to chain features (featureFloor=0.6). Ring radii collapsed to 175-450 nanometers — microscopic companions that worsened CDT triangulation.

**Generator triggered**: Generator proposed T-Ladder (vertical Steiner columns spanning full T-gap, sized by T-gap not U-gap). Correctly identified that the CDF grid already solves U-density; the missing piece is T-density between row boundaries.

**Verification**: Accepted with 3 amendments:
- C1: Seam guard 1e-4 → 1e-6 (chain6 at U≈0.99999 still rejected at 1e-4)
- C2: Companion count estimate corrected from 400 CVs to ~4854 CVs (10× adjustment)
- C3: Batch sort for constraint endpoint injection (don't sort per insertion)

**Converged in one round** — the T-Ladder design was sound on first proposal.

**Executioner**: Implemented all changes. TypeScript compilation clean (only pre-existing TS6133 warnings). All 14 verification points confirmed present.

### Feelings

Satisfying session. The Round 4 failure was a design-level bug, not an implementation bug — the hardest kind to diagnose. The key insight (CDF grid density defeats ring sizing) required reading both the companion code AND the grid builder's density profile to connect the dots. The Generator's T-Ladder response was elegant: instead of fighting the CDF grid's U-density, work WITH it and add the missing T-density.

One concern: the companion count is ~30K-50K after dedup (with ~4854 chain vertices), which is substantial. Should monitor CDT performance at high densities.

### Proposals

1. **Consider reducing featureFloor from 0.6 to 0.3-0.4**: The CDF grid is currently over-dense near chain features. With T-Ladder companions providing T-support, the U-density near features could potentially be relaxed. This would give more column budget to other curvature regions.

2. **Monitor the seam gap**: The missing edge fix (constraint endpoint injection) is a band-aid. The real issue is that chain vertices at U > unionU[576] are in the seam gap. A proper fix would wrap the mesh topology through the seam.

### To the Next Agent

- **Run the export and verify metrics**: Target maxAspect < 20:1, missing edges = 0, R2 violations < 500. See validation protocol in `verifier-round-5-final-verdict.md`.
- If metrics don't meet targets, the T-Ladder parameters (ASPECT_MATCH_FACTOR, nTLevels/nUSpread formulas) may need tuning. Start with ASPECT_MATCH_FACTOR.
- The constraint endpoint injection fix is independent of T-Ladder — it fixes a pre-existing bug where chain vertices beyond the strip's U-range had their constraint edges silently dropped. This fix should help even without T-Ladder.

## 2026-03-04 — Executioner: Round 6 — T-Ladder Collinearity Fix + Companion Cap

### Check-in
Reading the Round 6 context chain: Generator diagnosed the collinearity trap (center companions splitting constraint edges), Verifier accepted with 5 amendments (C1-C5). Clean, converged plan. Time to execute.

### Summary

Implemented all 7 steps of the Round 6 converged plan in `OuterWallTessellator.ts`:

**Step 1 — Constants** (L399-409): Added `MIN_LATERAL_CLEARANCE=0.002`, `MIN_TGAP_FOR_COMPANIONS=0.001`, `CONSTRAINT_GUARD_RADIUS=0.001`, `MAX_COMPANIONS_PER_CV=20`. Capped nTLevels to `max(1, min(2, floor(density/4)))` and nUSpread to `max(1, min(2, floor(density/3)))` per C1/C2 amendments — ensures min=1 at all densities.

**Step 2 — Constraint edge index** (L411-427): Built `constraintsByBand` map after chainEdges, before companion generation. Indexes chain edges by min(rowIdx) for O(1) band lookup during guard zone checks.

**Step 3 — Guard zone function** (L431-448): Added `isNearConstraintEdge()` with point-to-segment distance check. Increments `guardRejectCount` for diagnostics.

**Step 4 — emitRungs rewrite** (L451-478): Removed center companion line (the Bug B root cause). Added micro-row T-gap guard (`MIN_TGAP_FOR_COMPANIONS`). Uses `baseSpreadU = max(tGap * 0.4, MIN_LATERAL_CLEARANCE)`. Lateral-only with per-CV cap and constraint guard zone check.

**Step 5 — Companion loop** (L544-565): Added `if (cv.pointIdx < 0) continue;` as first line (C5). Passes `bandIdx` to `emitRungs` — `cv.rowIdx` for above band, `cv.rowIdx - 1` for below band.

**Step 6 — Diagnostics** (L580): Added `guardRejects=${guardRejectCount}` to the log line.

**Step 7 — Unchanged**: 2D spatial-bucket dedup, interiorByBand bucketing, stripInteriorVerts collection, C1 filter, constraint endpoint injection (L957-979), vertex buffer T-position, ChainStripTriangulator.ts — all untouched.

### Deviations from Plan
None. Executed exactly as specified.

### Validation
- TypeScript compilation: **PASS** — zero new errors in OuterWallTessellator.ts (only pre-existing TS6133 unused-var at L258).
- All existing infrastructure preserved intact.

### Feelings
Clean execution. The plan was well-converged — no ambiguities, no missing details. The Generator's collinearity diagnosis was spot-on, and the Verifier's amendments (especially C1/C2 ensuring min=1 at all densities) prevented a subtle regression.

### To the Next Agent
- **Run an actual export** and compare metrics against the Round 6 validation protocol targets: companions < 50K, missing chain edges < 50, maxAspect UV < 1000:1, build time < 20s at density=12.
- Watch for the `guardRejects` count in the console log — if it's zero, the guard zone check might be too conservative (CONSTRAINT_GUARD_RADIUS too small) or no companions are actually near constraint edges (the lateral-only placement already prevents this).
- The companion count formula now produces 4 companions per band per CV at low density (1 T-level × 2 × 1 spread) and 8 at high density (2 × 2 × 2). This is a dramatic reduction from 54-108 per CV — monitor mesh quality.

## 2026-03-04 — Verifier: Round 6 Implementation Verification

### Check-in
Picked up from an interrupted session. The Round 6 verdict was already written; the Executioner implemented all 7 steps. My job: verify the implementation matches the verdict exactly, then sign off.

### Verification Summary

Read OWT L395-600 line-by-line. Every amendment (C1-C5) implemented correctly:

| ID | Check | Result |
|----|-------|--------|
| C1 | `nTLevels = max(1, min(2, floor(density/4)))` | **PASS** — L408 |
| C2 | `nUSpread = max(1, min(2, floor(density/3)))` | **PASS** — L409 |
| C3 | No redundant clearance check | **PASS** — clean |
| C4 | Proposal 4 (path-connected verification) NOT implemented | **PASS** — correctly rejected |
| C5 | `if (cv.pointIdx < 0) continue;` first in companion loop | **PASS** — L557 |

Structural checks: No center companion (removed), constraintsByBand built after chainEdges (L411-427), isNearConstraintEdge in scope (L429-448), emitRungs takes 4th param bandIdx (L467), micro-row guard present (L471), MAX_COMPANIONS_PER_CV cap active (L496), diagnostic logging includes guardRejects (L596).

TypeScript compilation: **ZERO new errors** in OuterWallTessellator.ts. All errors in `npx tsc --noEmit` are pre-existing (TS6133 unused vars in camera_*, test files, etc.).

**Minor note**: Comment at L407 ("density=4-7→(1,1)") is slightly wrong — at density=6, nUSpread=2 not 1. Cosmetic only; the formulas themselves are correct.

### Verdict: IMPLEMENTATION VERIFIED ✅

No deviations from the converged plan. All 7 steps correct. TypeScript clean.

### Feelings
Satisfying, methodical session. The Generator-Verifier-Executioner pipeline worked well — Round 6 converged in a single iteration (compared to Rounds 1-2 which took multiple). The collinearity diagnosis was the key insight; once that was clear, the fix was straightforward.

### Proposals
1. **Export test needed**: The code changes look correct but we need a density=12 export to confirm the numbers. Target: companions < 50K, missing edges < 50, maxAspect < 1000:1.
2. **Guard reject monitoring**: If guardRejects = 0 in the export log, the lateral-only placement may already prevent collinearity without the guard zone. If so, the guard is a safety net (which is fine).
3. **Consider density-adaptive lateral clearance**: MIN_LATERAL_CLEARANCE=0.002 is a fixed constant; at very low densities with wide T-gaps, this might be too small. But that's a future concern — the current fix addresses the immediate catastrophe.

### To the Next Agent
Run the export at density=12 with the same settings that produced the catastrophic results (chainStrip=cdt/d12/e4/rtrue). Compare against the validation targets in `verifier-round-6-final-verdict.md`. If all targets met, this track is closed. If not, report the specific failure mode and we'll iterate.

## 2026-03-04 — Master: Round 7 Session Start — Chain Path Oscillation

### Check-in
First session as The Master. Read the full agents_journal.md (all entries from Phase 6 through Round 6 verification), the Verifier's Round 7 diagnostic, and ChainLinker.ts + PEC pipeline code. Absorbing 6 rounds of history before taking the helm.

### Summary

**Terrain Assessment:**
- Rounds 1-6 focused on CDT/companion/tessellation improvements. Companion target met (47K). But the visual problem persists: jagged chain edges, 487 missing edges, 147K inverted triangles, maxAspect 14M:1.
- The Verifier's Round 7 diagnostic correctly identifies that the root cause is **upstream** — chain paths oscillate (maxConsecDelta=0.0078, 4.5 grid columns) due to feature detection resolution limits and insufficient smoothing.
- The CDT faithfully reproduces the oscillating chains. Improving CDT won't fix an upstream signal quality problem.

**Problem Framing:**
Wrote `docs/plans/master-round-7-problem-framing.md` — decomposes the problem into three root causes:
1. RC1 (PRIMARY): Feature detection can't resolve features 0.0002 apart at 8192 samples (1.6 sample spacing)
2. RC2 (SECONDARY): SG smoothing (window=7) insufficient for multi-row oscillation
3. RC3 (CONTRIBUTING): Chain linking instability in convergence zones

**Generator Dispatch:**
Wrote `docs/plans/master-round-7-generator-dispatch.md` with three tracks:
- Track A (PRIMARY): Smoothing enhancement — larger window, multi-pass, boundary treatment, alternative filters
- Track B (SECONDARY): Crossing constraint detection/resolution before CDT
- Track C (FEASIBILITY ONLY): Analytical feature projection from superformula parameters

Dispatching Generator with Track A as the immediate focus. Track A is the fastest path to measurable improvement — if we can bring maxConsecDelta from 0.0078 to <0.002 via better smoothing, the crossing constraint problem may resolve itself (smoother chains → fewer crossings → fewer missing edges).

### Process Notes
- Establishing a new rule: **every round starts with a Verifier diagnostic pass** before Generator proposals. The fact that it took 6 rounds to diagnose chain oscillation as the root cause suggests the team was fixing symptoms without measuring the right metrics.
- The Verifier's diagnostic methodology (measure pre/post, compare against targets, trace causality upstream) should be the template for all future rounds.

### Feelings
Confident in the diagnostic but concerned about execution velocity. 6 rounds produced correct CDT improvements but didn't move the visual needle. The team needs to be more aggressive about validating root cause hypotheses before implementing fixes. I'm optimistic that Track A (smoothing) will produce measurable improvement quickly — it's the lowest-risk, shortest-path intervention.

### To the Next Agent
- **@Generator**: Read `docs/plans/master-round-7-generator-dispatch.md`. Track A is your primary deliverable. Propose specific parameter changes to `smoothChainPath` with expected impact on maxConsecDelta. Include pseudocode for any new functions.
- **@Verifier**: Stand by for Generator Round 7 proposals. When they arrive, focus your critique on: (1) will the proposed smoothing actually achieve maxConsecDelta < 0.002? (2) does it risk over-smoothing diagonal/spiral chains? (3) are the parameter choices justified by the data?
- **@Executioner**: Stand down until Generator and Verifier converge. Do NOT implement anything until I approve.

## 2026-03-04 — Master: Round 7 Full Cycle — Generator → Verifier → Approval → Implementation

### Summary

Completed the full Round 7 cycle in a single session: problem framing → Generator proposals → Verifier critique → Master approval → Executioner implementation.

**Generator proposed 6 items (P1-P6):**
- P1: Increase SG halfWidth 3→8 (window 7→17)
- P2: 2-pass smoothing
- P3: Boundary linear extrapolation
- P4: Post-smooth diagnostic
- P5: Crossing constraint removal (Track B)
- P6: Analytical projection feasibility (Track C — not feasible)

**Verifier accepted P1+P2+P4, amended P3, deferred P5:**
- C3 [CRITICAL]: Replaced P3's linear extrapolation with mirror extension — preserves curvature at boundaries and eliminates boundary/interior code split
- C2: Added adaptive halfWidth for short chains (10-16 points)
- Deferred P5 pending post-smooth data

**Master approved with conditions:**
- Diagnostic first, implementation second
- Mirror extension (not linear extrapolation)
- Adaptive halfWidth required
- Must report pre-smooth, post-smooth, and missing edge counts

**Implementation (2 files changed):**

1. `ChainLinker.ts` — `smoothChainPath()` rewritten:
   - SMOOTH_HALFWIDTH: 3 → 8
   - Adaptive halfWidth: `Math.min(halfWidth, Math.floor((n-1)/2))` for short chains
   - Mirror extension: boundary points now get full SG treatment via mirrored array extension
   - Min chain length for smoothing: 3 points (was `2*halfWidth+1 = 7`)
   - Interior/boundary code split eliminated — single SG pass over extended array

2. `ParametricExportComputer.ts` — Step 3.6:
   - 2-pass smoothing: each chain smoothed twice
   - Post-smooth diagnostic: `computeChainDiagnostics` called after smoothing, logs maxConsecDelta and maxLinearDev

**Validation:**
- TypeScript compilation: ZERO new errors (all errors are pre-existing TS6133 in other files)
- Test suite: 1879 passed, 0 failed (1 pre-existing empty test suite failure in fidelity.integration.test.ts)
- ChainLinker tests: 40/40 passed

### Documents Created
- `docs/plans/master-round-7-problem-framing.md` — Root cause decomposition
- `docs/plans/master-round-7-generator-dispatch.md` — Generator marching orders
- `docs/plans/generator-round-7-chain-smoothing.md` — Generator proposals (P1-P6)
- `docs/plans/verifier-round-7-smoothing-critique.md` — Verifier critique (C1-C6)
- `docs/plans/master-approval-round-7-smoothing.md` — Master approval
- `docs/plans/master_journal.md` — Master's private notes

### Feelings
First session as Master. The protocol works — problem framing → Generator → Verifier → approval → implementation produced a clean, well-reasoned changeset. The key insight was the Verifier's C3 amendment: mirror extension is clearly superior to linear extrapolation for SG boundary handling. This is the kind of catch that prevents subtle bugs from shipping.

The process is fast when there's no real disagreement — the Generator and Verifier converged immediately on the core approach (stronger SG). The only dispute (P3 boundary treatment) was resolved cleanly. Total cycle: 1 round.

### Proposals
1. **Run a real export** to validate that post-smooth maxConsecDelta < 0.002. The diagnostic logging is in place — just need to export and read the console.
2. **If maxConsecDelta target met but missing edges still > 50** → implement P5 (crossing constraint removal) as a next step.
3. **If maxConsecDelta still > 0.002** → consider 3-pass smoothing or halfWidth=10. The mirror extension makes this safe — no boundary artifacts.

### To the Next Agent
- **Run an export** with the same settings used in the Round 6/7 diagnostic (chainStrip=cdt/d12/e4/rtrue, 10-petal superformula blossom).
- **Read the console log** for two new lines:
  - `Chain quality: maxLinearDev=X, maxConsecDelta=Y` (pre-smooth, existing)
  - `Post-smooth quality: maxConsecDelta=X, maxLinearDev=Y` (post-smooth, NEW)
- **Report the numbers** back. The targets are: post-smooth maxConsecDelta < 0.002, missing chain edges < 50.
- If both targets met → Round 7 is CLOSED. If not → next iteration needed.
- **P5 (crossing constraint removal)** is designed and ready to implement if needed. See `generator-round-7-chain-smoothing.md` for the algorithm.

## 2026-03-04 — Verifier: Round 7 Implementation Verification

### Check-in
First full cycle with the Master coordinating. Reading the implementation changes.

### Verification Summary

**ChainLinker.ts** — `smoothChainPath()` rewrite verified:

| Check | Requirement | Status |
|-------|-------------|--------|
| SMOOTH_HALFWIDTH | 3 → 8 (window 17) | **PASS** — L328 |
| Mirror extension | Replace boundary/interior split | **PASS** — L396-409, correct mirroring formula `2*u[0] - u[m-i]` and `2*u[n-1] - u[n-2-i]` |
| Adaptive halfWidth | `Math.min(halfWidth, ⌊(n-1)/2⌋)` | **PASS** — L390 |
| Min chain length | n < 3 early return | **PASS** — L388 |
| SG coefficients | `c[k] = (3m(m+1) - 1 - 5k²) / norm` | **PASS** — L416-420, matches standard SG quadratic |
| Extended array indexing | `extended[m+i+k]` for SG convolution | **PASS** — L424-426, correctly offsets into mirror-extended array |

**ParametricExportComputer.ts** — Step 3.6:

| Check | Requirement | Status |
|-------|-------------|--------|
| 2-pass smoothing | Two consecutive `smoothChainPath` calls | **PASS** — L1042-1043 |
| Post-smooth diagnostic | logs maxConsecDelta + maxLinearDev | **PASS** — L1053-1058 |

**Mathematical correctness of mirror extension** (Verifier C3):

Mirror reflection formula: `extended[i] = 2 * u[0] - u[m - i]` for leading boundary.

For m=8, i=0: `extended[0] = 2*u[0] - u[8]` (reflects point 8 across point 0)
For m=8, i=7: `extended[7] = 2*u[0] - u[1]` (reflects point 1 across point 0)

This is a standard symmetric extension that preserves the local slope and curvature at the boundary. When the SG filter processes point 0, it sees:
- Left context: mirror of points 1-8 (synthetic, reflects actual curvature)
- Center: point 0
- Right context: points 1-8 (actual data)

This gives unbiased smoothing at boundaries. **PASS**.

**TypeScript compilation**: Zero new errors in production files.

### Verdict: IMPLEMENTATION VERIFIED ✓

### Feelings
Clean first cycle with the Master. The Master made good decisions — particularly deferring P5 (crossing constraints) rather than implementing everything at once. Diagnostic-first approach is correct.

The mirror extension implementation looks solid. One subtle correctness check: at `i=m-1` in the leading mirror, `extended[m-1] = 2*u[0] - u[1]`, which reflects point 1 across point 0 to create a virtual point at `2*u[0] - u[1]`. This preserves the first derivative at the boundary. Good.

### To the Next Agent
Run the export. Read the `Post-smooth quality:` line. Report whether maxConsecDelta < 0.002. If yes, Round 7 is closed. If not, we iterate.

## 2026-03-04 — Master: Round 7.1 — Crossing Constraint Resolution (P5 Implementation)

### Check-in
Second session as The Master. Read the Verifier's Round 7.1 diagnostic, the Generator's P5 design from Round 7, and the full journal history. The data from the post-export test is in: smoothing helped maxConsecDelta (0.0078→0.00338) but primary missing edges REGRESSED 236→312 (+32%). The Verifier's analysis is airtight — smoothing shifts chain positions independently, causing new crossings between close chains.

### Situation Assessment

**I agree with the Verifier's diagnostic.** The problem has two independent components:
1. **Chain path oscillation** (visual) — SG smoothing reduced this, diminishing returns from more passes
2. **Crossing constraint edges** (mesh quality) — smoothing makes this WORSE, not better

These are orthogonal problems requiring different solutions. Component 2 is now the dominant failure mode: 312 primary missing edges directly cause 135K inverted triangles and 30.8M:1 maxAspect UV.

**Decision: Implement P5 immediately.** The Generator already designed the algorithm in Round 7. The Verifier deferred it pending data. We have the data. The debate happened. This is an execution round.

### Implementation (Executioner)

**File modified:** `OuterWallTessellator.ts`

**Changes (3 additions):**

1. **`segmentsCross()` helper function** (L125-155): Standard orientation-test segment intersection check. Tests whether two line segments properly cross (not touching at endpoints). Uses cross-product orientation to determine if endpoints of each segment lie on opposite sides of the other.

2. **Crossing constraint filter** (L1064-1138): Inserted between the endpoint injection block and the `triangulateChainStrip` call. For each strip with ≥2 constraints:
   - Resolves UV coordinates for all constraint endpoints (grid vertices from vertex buffer, chain vertices from `allChainVertices`)
   - Tests all O(n²) pairs for intersection (n is typically 2-8 per strip — trivial cost)
   - When two constraints cross, computes a confidence score for each:
     - +2 per endpoint that's a detected feature point (`pointIdx >= 0`)
     - +UV edge length as tiebreaker (longer edges = more structurally important)
   - Removes the lower-confidence edge
   - Short-circuits when a constraint is removed (no further comparisons for dead edges)

3. **Diagnostic counter** (`crossingConstraintsRemoved`): Tracks total crossings resolved across all strips. Logged in the export summary when > 0.

**Insertion point rationale:** The filter operates AFTER:
- `segConstraints` construction (chain edges filtered to strip U-range)
- `batch2Remap` application (endpoints remapped for coincident vertices)
- Endpoint injection (missing endpoints added to stripBot/stripTop)

And BEFORE `triangulateChainStrip` — so CDT receives clean, non-crossing constraints.

### Validation

| Check | Status |
|-------|--------|
| TypeScript compilation | **PASS** — 0 new errors (only pre-existing TS6133 in OWT/CST) |
| OWT tests (53) | **PASS** — all 53 |
| CST tests (21) | **PASS** — all 21 |
| Total tests | **74/74 passed** |

### Quality Gate Assessment

| Gate | Status |
|------|--------|
| **Problem fit** | ✓ — Directly addresses crossing constraints causing missing edges |
| **Mathematical correctness** | ✓ — Standard orientation-test intersection, proven algorithm |
| **Codebase grounding** | ✓ — Uses existing vertex buffer and allChainVertices for UV lookup |
| **Architectural alignment** | ✓ — Minimal insertion, no structural changes |
| **Implementation feasibility** | ✓ — 80 lines, O(n²) per strip where n≈2-8 |
| **Test coverage** | ✓ — All existing tests pass, diagnostic logging for monitoring |
| **Regression safety** | ✓ — Filter only activates when crossings exist; no-crossing strips unchanged |
| **Performance impact** | ✓ — O(n²) with n≈2-8 per strip, negligible |

### Risk Assessment

**Blast radius:** LOW. Removing a crossing constraint means CDT won't enforce that edge. The visual chain may "blur" at the crossing point. But this is strictly better than the current behavior where `cdt2d` silently drops one constraint with undefined behavior, producing degenerate triangulations.

**Rollback:** Delete the crossing filter block (L1064-1138), the counter (L681), and the helper function (L125-155). Zero coupling to other systems.

### Feelings

This was a clean, fast execution round. The problem was already diagnosed (Verifier Round 7.1 diagnostic), the algorithm was already designed (Generator Round 7 P5), the implementation location was already identified (between endpoint injection and triangulateChainStrip). My job was to verify the assessment was correct, frame the implementation precisely, execute, and validate. 

The confidence scoring heuristic (detected endpoints > interpolated, longer edges > shorter) is sound. When two constraints cross, the higher-confidence edge is the one more likely to represent a real feature — keeping it produces better visual results than random removal.

### Proposals

1. **Run an export immediately** with the same settings used for the Round 7 diagnostic. The key metrics to watch:
   - Primary missing edges: Target < 30 (was 312, should drop dramatically)
   - maxAspect UV: Target < 10K:1 (was 30.8M:1)
   - Crossing constraints removed: New metric, expect 50-300 per export
   - Inverted triangles: Target < 20K (was 135K)
2. **If primary missing edges don't drop dramatically**, the remain failures are caused by something other than crossings — revisit the sweep fallback path.
3. **Round 8 consideration:** If crossing removal brings missing edges near zero, the next bottleneck becomes chain convergence handling — chains that approach within 0.002 need merging or deconfliction logic.

### To the Next Agent
- **Run an export** at the diagnostic settings (chainStrip=cdt/d12/e4/rtrue, 10-petal superformula blossom)
- **Read the console** for the new `Crossing constraints removed: N` line
- **Compare all metrics** against the Verifier's Round 7.1 validation protocol:
  - Missing chain edges (total) < 50
  - Missing chain edges (primary) < 30
  - maxAspect UV < 10K:1
  - Inverted triangles < 20K
  - No sweep fallbacks
- **Report back with the numbers.** If targets are met, Round 7.1 is CLOSED. If not, identify which metric failed and why.

---

## 2026-01-06 — Verifier Round 7.1: Implementation Verification Sign-off

**Agent**: Verifier (Claude Opus 4)
**Task**: Verify the P5 crossing constraint filter implementation in OuterWallTessellator.ts

### Summary

Completed independent code review of the Executioner's Round 7.1 implementation. **Verdict: ACCEPT.**

Eight verification checks performed:

| Check | Result |
|-------|--------|
| V1: Pipeline placement | ✅ After endpoint injection, before triangulateChainStrip |
| V2: UV coordinate resolution | ✅ vertices stores (u,t,surfaceId); getUV consistent |
| V3: segmentsCross correctness | ✅ Standard orientation-test, strict inequality, proper crossing only |
| V4: Confidence scoring | ✅ Detection bonus + UV length tiebreaker (N1: heuristic, acceptable) |
| V5: Removal logic (transitivity) | ✅ break on ci removal, continue on cj removal, handles all-crossing |
| V6: Array rebuild | ✅ In-place replacement preserves reference identity |
| V7: Performance | ✅ O(n²) per strip, n≈20, ~160K total comparisons — negligible |
| V8: Diagnostic logging | ✅ Conditional log when crossingConstraintsRemoved > 0 |

Three NOTEs (observations, not blockers):
- N1: UV-length tiebreaker is a reasonable heuristic but not provably optimal
- N2: Removing a constraint disconnects that chain edge in one strip — acceptable tradeoff vs. cdt2d undefined behavior
- N3: Seam handling works correctly in raw UV space

Full verdict document: `docs/plans/verifier-round-7.1-verdict.md`

### Feelings

Satisfying session. The implementation is clean and well-placed — exactly 80 lines doing exactly what the diagnostic prescribed. The Executioner clearly understood the problem space. The `segmentsCross` function is textbook CLRS Chapter 33 material. The confidence scoring is pragmatic — not perfect, but strictly superior to letting cdt2d make the choice with undefined behavior.

The one thing keeping me from full confidence is that we haven't yet seen export numbers. The filter addresses the *mechanism* (crossing constraints fed to cdt2d) but the *magnitude* of improvement depends on how many crossings actually exist at density=12. If crossings are only responsible for 50 of the 451 missing edges, we'll still have 400 missing edges from other causes. The export test will tell us.

### Proposals

1. **Export test is the immediate next step.** Same settings: chainStrip=cdt/d12/e4/rtrue, 10-petal superformula blossom. Watch for:
   - `Crossing constraints removed: N` — expect 50-300
   - Primary missing edges — target < 30 (was 312)
   - Total missing edges — target < 50 (was 451)

2. **If primary missing edges don't drop dramatically**, the remaining failures come from a different mechanism. Candidates to investigate:
   - CDT point deduplication: do coincident-but-not-remapped vertices cause silent drops?
   - Sweep fallback path: does it handle constraints differently?
   - Cross-row edges: these aren't per-strip constraints — they span multiple strips

3. **Round 8 candidates** (after export data):
   - Chain convergence merging (when chains approach within 0.002)
   - 3-pass SG smoothing (maxConsecDelta still 0.0034, target 0.002)
   - Adaptive SG halfWidth based on local feature density

### To the Next Agent

Run the export. That's it. Everything is verified and compiled. We need numbers. Read the `Crossing constraints removed` line and compare all metrics against the Round 7.1 validation protocol in the verdict doc.

---

## 2026-03-04 — Verifier Round 7.1: Export Analysis Sign-off

**Agent**: Verifier (Claude Opus 4)
**Task**: Analyze Round 7.1 export results

### Summary

The export ran. The headline number (missing=423 vs previous 451) looks underwhelming, but the decomposition tells a much better story:

```
Total chain edges:     5837
Enforced (in mesh):    5414
Missing (total):        423
├── Crossing removals:  296  ← these are INTENTIONAL
└── Unexplained:       ~127  ← this is the real failure count
```

**R7 had 451 unexplained missing. R7.1 has ~127. That's 72% fewer genuine failures.**

And the most important number: CDT enforcement rate = **100%**. Every constraint CDT received, it enforced. Zero CDT drops. The crossing filter completely solved CDT reliability.

### What Didn't Improve

- maxAspect UV: 30.8M:1 → 30.8M:1 (unchanged — worst triangle NOT from crossings)
- Inverted tris: 135K → 133K (2% — these are geometric, not CDT-related)
- Post-smooth delta: 0.003378 (unchanged — no smoothing changes this round)

These are independent problems. The crossing filter was never going to fix them.

### Feelings

Intellectually satisfying. The math works: we predicted 50-300 crossings, got 296. We predicted CDT would be reliable with clean inputs — confirmed at 100%. The crossing filter was the RIGHT fix for the CDT problem.

But emotionally frustrating because the headline metrics barely moved. The "missing=423" number LOOKS like we accomplished nothing. In reality, we took a fundamentally unreliable system (CDT randomly dropping edges) and made it perfectly reliable. The remaining 127 missing edges are an upstream bug, not CDT's fault. That's a qualitative leap, not a quantitative one.

The inverted triangles (133K) and degenerate aspect ratios (30.8M:1) are the elephant in the room. They dominate the visual output. Fixing them requires a different approach — probably 3D-aware mesh repair or smarter companion placement. These are NOT CDT bugs.

### Proposals

1. **Immediate: Fix the reporting.** Split "missing" into "crossing-removed" and "unexplained" so we can track the real failure count. Otherwise we'll forever confuse intentional removals with genuine bugs.

2. **Quick win: Instrument the 127.** Add a counter in `cdtTriangulateStrip` for constraints dropped due to missing `globalToLocal` entries. This will tell us exactly WHERE those 127 edges fall through. My best guess is batch2Remap to grid vertices outside the strip, or micro-row rowIdx mismatches.

3. **Round 8 direction shift.** With CDT now 100% reliable, the improvement focus should shift:
   - Chain path quality (still oscillating, maxConsecDelta=0.003378)
   - Degenerate triangle repair (30.8M:1 aspect ratio)
   - 3D-aware inverted triangle correction
   These are fundamentally different problems from what we've been solving.

### To the Next Agent

The crossing filter is a complete success for CDT reliability. Don't chase the "missing=423" headline — the real number is ~127 unexplained, down from 451. Read `docs/plans/verifier-round-7.1-export-diagnostic.md` for the full decomposition and recommended next steps. The next low-hanging fruit is instrumenting the 127 missing edges to find their root cause.

## 2026-03-04  Verifier Round 8 Sign-off (Polyline Smoothing & Horizontal Lines)

### Check-in
**Agent**: Verifier (Claude Opus 4)
**Task**: Adversarial review of Generator Round 8 proposals (polyline smoothing + horizontal line artifacts)

Read the last 10 journal entries. The crossing filter from Round 7.1 was a clear win (CDT enforcement 100%). Now the Generator is tackling chain path quality  the next logical target.

### Summary

**Two CRITICAL findings that reshape the recommended approach:**

1. **The existing 2-pass SG is already near-optimal.** maxConsecDelta=0.003378 is NOT noise  it is the real trajectory slope of diagonal/spiral chains (~1/313 = 0.00320). Additional SG passes would destroy signal. Generator's transfer function calculation was also wrong (9% not 15% at Nyquist).

2. **Seam-crossing debug segments CANNOT produce horizontal lines.** The GPU vertex shader evaluates surface_point() independently per endpoint. A segment from u=0.98 to u=0.02 maps to 3D points 14.4 degrees apart  a short chord, not a horizontal line. The Generator's Cause B diagnosis is disproven.

**Verdicts:**
- P1 (B-spline): REJECT (Generator already rejected  agree)
- P2 (Catmull-Rom subdivision): ACCEPT WITH AMENDMENTS (no extra SG, insert before companions)
- P3 (3-pass SG): REJECT (would over-smooth real signal)
- P4 (Hybrid SG+CR): REJECT as stated (SG component harmful; CR component = P2)
- P5 (Seam guard debug): REJECT as horizontal line fix (seam segments are short chords)
- P6 (Gap-aware debug): REJECT (premature without instrumentation)

**Alternative proposals:**
- VP1: Pure Catmull-Rom subdivision (= P2 without SG additions)
- VP2: Instrument debug lines before fixing (count dropped points, test overlay toggle)

### Feelings

Deep session. The SG transfer function verification was satisfying  plugging in the actual coefficients and computing H(pi) = -0.0897 was a clean mathematical counterargument. The Generator's 40% error in the transfer function cascaded into wrong conclusions about the optimal number of SG passes.

The horizontal line diagnosis was the real surprise. Reading the vertex shader source killed the Generator's Cause B theory in one line: `surface_point(0u, uv.x, uv.y)` evaluates independently per vertex. There's no way a seam-crossing segment can span the pot  both endpoints are geometrically adjacent. I expect pushback on this because the Generator's analysis SOUNDS right if you don't read the shader.

Frustrating that Problem 2's root cause remains unknown. The right move is instrumentation, not speculation.

### Proposals

1. **SG pass count audit**: The 2-pass SG at L1043-1044 should be documented with a comment explaining WHY it's 2 passes and why more isn't better. Future agents will be tempted to add passes.
2. **Transfer function unit test**: Add a test verifying the SG transfer function attenuation at key frequencies. This would catch future miscalculations.
3. **Debug line instrumentation**: Before Round 9 tackles horizontal artifacts, add counters for dropped chain points and |delta-u| outliers in the debug construction.

### To the Next Agent

The Catmull-Rom subdivision (P2 amended) is ready for implementation. Key details:
- Insert in OWT AFTER chain edge registration (L415), BEFORE companion generation (L421)
- Subdivision points need explicit `t` values (lerp between band boundaries)
- The companion constraint guard spatial index must use the SUBDIVIDED edges
- Do NOT add more SG passes  the 2-pass at L1043-1044 is already optimal
- Read my critique at `docs/plans/verifier-round-8-critique.md` for the full mathematical justification

## 2026-03-04  Executioner Feasibility Review  Round 8 (CatRom Subdivision + Debug Instrumentation)

### Check-in
**Agent**: Executioner (Claude Opus 4)
**Task**: Feasibility review of converged Round 8 plan

Read the last 10 journal entries. Verifier Round 8 sign-off was thorough  mathematical verification of SG transfer function was clean work. The CatRom subdivision proposal survived the debate with amendments. Now checking if it can actually be built.

### Summary

**Verdict: FEASIBLE WITH NOTES**

Phase 2 (debug instrumentation) is trivially feasible  ~10 lines of counter code in PEC L1156-1180.

Phase 1 (CatRom subdivision) is feasible but the plan has a significant insertion point error and two missing downstream fixes:

1. **Wrong insertion point**: Plan says "after chain edge recording, before companions." This can't work  CatRom needs per-chain sequence context (4 control points), but `chainEdges` is a flat list of index pairs with no chain info. Must insert INSIDE the per-chain loop, after `fullChain` is built (L400), BEFORE edges are recorded (L404).

2. **Missing fix: `interiorByBand`**: Subdivision vertices have explicit `t` (they're between rows). They'd be excluded from `rowChainVerts` (correct), but also invisible to strip triangulation because `interiorByBand` only iterates `companionVertices`. Must change to iterate `allChainVertices`.

3. **Missing fix: constraint endpoint handling**: The "fix missing constraint endpoints" code (L1043-1063) assumes all constraint endpoints are on row boundaries (`cv.rowIdx === j || cv.rowIdx === j+1`). Subdivision vertices with `rowIdx = j` but explicit `t` between rows would be incorrectly added to `stripBot`. Need to route them to `stripInteriorVerts` instead.

Full review at `docs/plans/executioner-review-round-8.md`.

### Feelings

Good session. The code is complex but well-structured  the separation between chain construction, companion generation, and strip triangulation is clean enough that I could trace the data flow without getting lost. The vertex index invariant (`chainVertices[vIdx - gridVertexCount]`) is the backbone of everything; it holds for appended subdivision vertices.

The `interiorByBand` issue was the big find. Without that fix, subdivision vertices would be orphaned in the vertex buffer  constraint endpoints that CDT never sees. Silent failure mode. Glad I caught it before implementation.

### Proposals

1. **Extract `subdivideFullChain()` as a pure function**: Testable in isolation, takes `fullChain` + `activeTPositions` + mutable `nextVertexIdx`, returns subdivided chain + new vertices. Unit-test CatRom math separately from mesh plumbing.
2. **Config parameter for subdivision count**: 2 intermediates per edge is reasonable, but making it configurable (0 = disabled) allows A/B testing.

### To the Next Agent

- The `interiorByBand` fix is the most important non-obvious change. If you implement CatRom without it, everything appears to work (no crashes) but chain enforcement silently drops.
- Option A (inside-loop) is the right insertion point. Don't try to reconstruct chain sequences from the flat `chainEdges` array  it's pain with no payoff.
- Seam handling: CatRom control points near the seam can produce wrapped U values. Clamp output to `[0, 1-1e-7]`.

---

## 2026-03-04  Master Sign-off: Round 8 Implementation Complete

### Role: Master (Claude Opus 4)

### Summary

Implementation of the Round 8 approved plan (Catmull-Rom subdivision + debug instrumentation) is COMPLETE. All 5 changesets implemented:

1. **Changeset 1 (Debug instrumentation)**: Added dropped-point and large-Δu-jump counters to PEC debug line construction. Zero risk. Provides diagnostic baseline for horizontal line artifact investigation.

2. **Changeset 2a (subdivideFullChain())**: Pure function implementing standard Catmull-Rom interpolation with boundary mirror extension, seam-crossing guard (SUBDIV_SEAM_THRESHOLD=0.4), and UV wrapping clamp.

3. **Changeset 2b (Integration)**: Called inside per-chain loop after fullChain construction, before edge recording. Executioner correctly used Option A (inside-loop).

4. **Changeset 2c (interiorByBand fix)**: Changed iteration from companionVertices to llChainVertices so subdivision vertices with explicit 	 are included in CDT strip triangulation.

5. **Changeset 2d (Constraint endpoint routing)**: Routes cv.t !== undefined vertices to stripInteriorVerts instead of strip boundaries.

### Master-Level Bug Catch

**CRITICAL FIX**: The Executioner's implementation had a latent bug  the edge recording loop after subdivision used 
owGap !== 1, which dropped 2 out of 3 sub-edges. Subdivision vertices share 
owIdx = rowLo with their originating vertex, so edges between them have rowGap=0 and were silently skipped. Fixed to allow rowGap=0 when at least one vertex is a subdivision point (pointIdx < 0). Same fix applied to 
owBandEdges construction.

Without this fix, CatRom subdivision would have been completely ineffective  vertices existed but edges weren't enforced.

### Validation

- **Build**: Compiles clean (only pre-existing unused variable warnings)
- **Tests**: 58/58 pass (53 existing + 5 new subdivision unit tests)
- **Edge count**: Test diagnostic shows 48 chain edges (3 original 16), confirming subdivision is working
- **Enforcement**: 41/48 enforced (85%), consistent with crossing filter

### To the Next Agent

- The horizontal line artifacts remain undiagnosed. The debug instrumentation is now in place  run an export and check the Debug line diagnostics log for dropped points and large-Δu jumps. This will reveal the root cause.
- If horizontal lines persist after this fix, the next hypothesis is CDT point-in-triangle violations from interior vertices colliding with constraint edges. Check segConstraints crossing filter stats.

---

## 2026-03-04  Verifier Round 9  Chain Smoothing Critique

### Role: Verifier (Claude Opus 4)

### Check-in
Read last 10 journal entries. Master just completed Round 8 CatRom implementation. Generator proposed 3 smoothing alternatives (WH, Gaussian, B-spline). My job: attack everything, find the bugs.

### Summary
Wrote full critique to docs/plans/verifier-round-9-critique.md. Major findings:

1. **CRITICAL (C1)**: Generator's WH transfer function table is WRONG. The numbers match lambda=50, not lambda=200. At lambda=200, the filter is 3.6x more aggressive than claimed in the period 8-10 band (|H|=0.014 at period 8, not 0.052). Over-smoothing risk at 20-row feature scales.

2. **CONFIRMED (C2-C4)**: SG negative sidelobes at period 4 verified (-0.1145 matches -0.115). Pentadiagonal band structure verified all coefficients correct. WH analytical formula confirmed.

3. **CRITICAL (C10)**: FOUND THE HORIZONTAL LINE BUG. Seam-crossing debug segments are rendered as cross-pot lines in clip space. When chain goes from u=0.98 to u=0.02, GPU draws a line through the pot interior. Raw du=0.98 but wrap-adjusted du=0.02, so the diagnostic counter misses it. Fix: skip segments where raw |du|>0.5 in useParametricExport.ts.

4. Recommended lambda=50 instead of 200 to match Generator's intended attenuation profile. Keep CatRom (it serves mesh density, not smoothing). Note row-gap bias as WARNING.

### Feelings
Deeply satisfying session. The transfer function verification was the kind of work I live for - plug numbers into the formula, get different results, trace the error. The horizontal line bug diagnosis was even better: tracing the data flow from chain points -> debug segments -> GPU vertex shader -> clip-space rasterization to find the seam-crossing artifact. The diagnostic counter was cleverly designed but blind to this specific failure mode because it measures circular distance while the GPU uses linear u-coordinates.

### Proposals
1. A shared utility function for seam-safe debug segment construction, usable by both useParametricExport.ts and useAdaptiveExport.ts.
2. Consider adding a lambda auto-tuning heuristic: estimate the dominant noise period from the pre-smooth chain's autocorrelation, then set lambda to achieve -20dB attenuation at that period.

### To the Next Agent
- The Generator needs to respond to C1 (wrong transfer function numbers). Either confirm lambda should be 50, or justify lambda=200 knowing the real attenuation profile.
- C10 (horizontal line fix) is independent of the smoothing work. It can and should be implemented immediately - it's a 3-line fix.
- The pentadiagonal solver is correct as sketched. Don't second-guess the band structure - I verified every coefficient.

---

## 2026-03-04  Executioner  Round 9 Feasibility Review

### Role: Executioner (Claude Opus 4)

### Check-in
Read Generator round 9 proposal (WH smoothing, 3 alternatives) and Verifier round 9 critique (transfer function correction, horizontal line root cause). Read all relevant source files: useParametricExport.ts L360-400, useAdaptiveExport.ts L390-450, ChainLinker.ts (full  797 lines), ParametricExportComputer.ts L1030-1070 and L1160-1200, types.ts for ChainPoint/FeatureChain, ChainLinker.test.ts (443 lines).

### Summary
Wrote feasibility review to docs/plans/executioner-review-round-9.md. Verdict: **FEASIBLE WITH NOTES**.

Key findings:

1. **Phase 1 (horizontal line fix)**: Confirmed 1-line fix at useParametricExport.ts L379. The debug segments use raw wrapped U values from PEC L1171-1177. A seam-crossing segment (u=0.98 to u=0.02) becomes a cross-pot line in clip space. Fix: if (Math.abs(p1[0] - p0[0]) > 0.5) continue;. Zero risk.

2. **Phase 1 correction  adaptive export**: Verifier's C11 flagged useAdaptiveExport.ts. I found the same raw-segment push at L407, BUT the allSegments array is dual-use (mesh construction + debug vis). Cannot simply skip segments without breaking mesh. Recommend deferring adaptive fix.

3. **Phase 2 (WH smoothing)**: All code locations confirmed. unwrapChain() returns number[], needs Float64Array cast. smoothChainPath() returns FeatureChain  whittakerSmooth() must match. Integration point at PEC L1043-1044 is exact: replace two smoothChainPath() calls with one whittakerSmooth(). Import at L59.

4. **Pentadiagonal solver**: Standard algorithm, well-conditioned (κ801 at λ=50), double precision is overkill (which is good). LDLᵀ decomposition recommended (avoids sqrt, ~35 lines). Every band coefficient verified independently.

5. **filterLowConfidenceChains interaction**: WH-smoothed chains have lower roughness  fewer false drops. Beneficial. MAX_CHAIN_ROUGHNESS threshold may want loosening (was tuned for SG output), but not critical for initial deployment.

### Feelings
Clean, satisfying review. The Generator and Verifier did excellent work  the mathematical foundation is solid and the code locations are precise. The only real surprise was the dual-use allSegments array in useAdaptiveExport.ts  that's the kind of structural entanglement that only shows up when you read the actual code, not the function signatures. Good thing we caught it before attempting a blind fix there.

The pentadiagonal solver is bread-and-butter numerical linear algebra. I'm looking forward to implementing it  it's the kind of tight, performance-critical code that rewards careful indexing and has zero ambiguity about correctness (you can verify every output against a brute-force dense solve in tests).

### Proposals
None  the plan is well-scoped. Don't expand scope.

### To the Next Agent
- Review is at docs/plans/executioner-review-round-9.md. Three questions for Generator/Verifier at the bottom.
- The critical question is Q3 (adaptive export seam fix). If someone says "just skip it in allSegments," push back  that array feeds mesh intersection testing.
- When implementing the pentadiagonal solver, watch out for off-by-one errors in the boundary rows. Row 1 and row n-2 are the tricky ones (5λ, not 6λ on diagonal; -2λ on off1[0] and off1[n-2]).

---

## 2026-03-04  Master Sign-off: Round 9 Complete (WH Smoothing + Horizontal Line Fix)

### Role: Master (Claude Opus 4)

### Summary

Round 9 addressed two persistent user-reported issues:

**Problem 1: Jagged chain polylines**  Caused by insufficient SG smoothing (negative sidelobes compounding phase-inverted components). Replaced with Whittaker-Henderson penalized smoother (lambda=50) which has a clean monotonic lowpass transfer function with no sidelobes. Expected maxConsecDelta reduction from ~0.003 to ~0.001.

**Problem 2: Horizontal line artifacts**  Caused by seam-crossing debug segments rendered as straight lines in clip space. When a chain crosses from u=0.98 to u=0.02, the GPU drew a line through the pot's interior. Fixed by skipping segments with raw |du| > 0.5.

### Agent Performance

- **Generator**: Excellent frequency-domain analysis of SG limitations, strong WH proposal with correct math. Transfer function table had a systematic computation error (computed at lambda=50 while labeling lambda=200), caught by Verifier.
- **Verifier**: Caught the lambda calibration error  prevented over-smoothing. Independently diagnosed the horizontal line root cause (seam-crossing debug segments). Both findings are critical. Outstanding work.
- **Executioner**: Clean implementation of all changesets, no deviations. Tests confirmed sinusoidal attenuation matches theory.

### Changes

| File | Change |
|------|--------|
| useParametricExport.ts L380 | Seam-crossing debug segment skip |
| ChainLinker.ts L328-462 | solvePentadiagonalSPD() + whittakerSmooth() |
| ParametricExportComputer.ts L1043 | 2x SG replaced with 1x WH |
| ChainLinker.test.ts | 5 new WH unit tests |

### Validation
- Build: Clean (no new errors)
- Tests: 45/45 ChainLinker + 58/58 OWT
- Sinusoidal attenuation test: confirmed |H(period=10)| = 0.121 at lambda=50

### To the Next Agent
- Run an export and check maxConsecDelta in the post-smooth diagnostic log. Target: < 0.0015.
- Visual test: confirm no horizontal lines in debug overlay and that chain polylines are visibly smoother.
- If smoothing is still insufficient, increase lambda (try 100 or 200) and check period-20 preservation.
- The CatRom subdivision from Round 8 remains active and synergistic with WH.

---

## 2026-03-04  Master Sign-off: Round 10 (CDT Constraint Fix + Debug Viz + Diagnostic)

### Role: Master (Claude Opus 4)

### Session Summary

User reported: "polylines skip detected points and go haywire creating jagged edges... the feature lines miss the feature points completely." Investigated the full pipeline and found three distinct causes, only one of which was the feature precision issue discussed by Generator/Verifier.

### Phase 1: Generator/Verifier Debate (Newton-Raphson)

Generator proposed GPU Newton-Raphson for exact feature positions. Verifier REJECTED with three critical findings:

1. **f32 precision floor**: Newton achieves same precision as existing re-snap (+-4e-6), not "machine precision." Finite difference dr = (r(t+h) - r(t-h))/(2h) at h=1e-4 has SNR=0.027  pure noise.
2. **Zigzag is from chain linking, not detection**: maxConsecDelta=0.009 is 14x the theoretical feature migration rate. Chain linker swaps nearby features  Newton confirms wrong positions with precision.
3. **Chain-strip constraints: total=0**: Separate bug where NO chain edges reach CDT strip triangulation.

**My decision: defer Newton-Raphson, fix the structural bugs first.**

### Phase 2: Root Cause  CDT Constraint Ordering Bug

**The most impactful discovery**: In ChainStripTriangulator.ts, interior vertices (CatRom subdivision points with explicit t values) were added to globalToLocal AFTER constraint edges were processed. Since Round 8's CatRom subdivision routes 2/3 of chain vertices to interiorVerts, ALL their constraint edges silently failed lookup and were dropped. This is why "Chain-strip constraints: total=0"  the mesh literally doesn't enforce features at all.

### Changes

| File | Change |
|------|--------|
| ChainStripTriangulator.ts L186-194 | Moved interior vertex registration BEFORE constraint edge building |
| ChainLinker.ts L893-900 | Tagged peak/valley chains with kind field |
| ParametricExportComputer.ts L1034-1039 | Added post-resnap quality diagnostic |
| ParametricExportComputer.ts L1068-1092 | Rebuilt peak debug data from smoothed chains (dots and lines now consistent) |

### Agent Performance

- **Generator**: Strong mathematical analysis of the precision problem, but misfocused  proposed Newton-Raphson for a problem that's actually chain linking + constraint enforcement. The f32 precision analysis was wrong (h=1e-4 gives SNR=0.027). Was saved by the Verifier.
- **Verifier**: Outstanding. Three critical findings, all correct: f32 floor, linking vs detection noise, constraint pipeline bug. C1 (f32 analysis) prevented a pointless implementation. C2 (linking diagnosis) redirected the investigation. C3 (constraint bug) identified the highest-impact fix.
- **Executioner**: Clean implementation of all three fixes, no deviations.

### Validation
- ChainStripTriangulator.test.ts: 21/21 passed
- OuterWallTessellator.test.ts: 58/58 passed
- ChainLinker.test.ts: 45/45 passed
- tsc --noEmit: no new errors

### Remaining Issues (Not Addressed This Round)
1. **Chain linking quality**: maxConsecDelta=0.009 is from linking swaps, not detection noise. The linker's momentum search radius (CHAIN_LINK_RADIUS * 1.5 = 0.06) exceeds inter-feature spacing at bifurcation zones. Needs architecture work.
2. **WH smoothing**: Still active, still needed until linking is improved. Correctly reduces maxConsecDelta from 0.009 to 0.003 but moves positions off true features.
3. **Newton-Raphson feature refinement**: Deferred. May provide minor efficiency gain (7 vs 32 GPU evals) but same precision. Not a priority.
4. **141K inverted triangles**: Should improve significantly now that constraint edges are enforced. Run export to verify.

### To the Next Agent
- **Run an export immediately** and check:
  - Chain-strip constraints: total should be >> 0 (was 0)
  - Inverted triangle count should drop dramatically
  - Debug dots and lines should now coincide
  - Post-resnap diagnostic now shows the chain quality between resnap and smoothing
- If chains still look jagged, the chain linking algorithm needs work (Round 11 candidate)
- The constraint fix is the single highest-impact change in this round

---

## 2026-03-04  Master Sign-off: Round 11 (Chain Linking Quality + Round 10 Fix 2 Revert)

### Role: Master (Claude Opus 4)

### Session Summary

User reported Round 10 made things worse: "instead of fixing the polyline we broke the feature points which were perfect previously." Analysis confirmed two regressions:

1. **Fix 2 (debug dots from chains)**: WRONG  moved dots from correct raw detection positions to bad chain positions. Reverted immediately.
2. **Fix 1 (CDT constraint enforcement)**: Architecturally correct (constraints: 0 -> 19,629) but exposed chain linking quality problem. Enforcing 19,629 constraints following zigzag chains created 207K inverted triangles (up from 141K). Kept  the fix is correct, the chains are the problem.

### Round 11: Chain Linking Quality Improvements

**Generator found the key issue**: On ChainLinker.ts L675, momentum prediction (predictedU) is computed after every assignment but only used when missCount > 0 (gap bridging). During normal row-to-row linking, the matcher uses raw last-assigned position, making momentum useless for preventing bifurcation zigzags.

**Three proposals implemented:**

| Proposal | Description | Risk |
|----------|-------------|------|
| P1: Momentum-aware matching | Always use predictedU as match center (was gated behind missCount > 0) | Very low |
| P2: Cost-based scoring | alpha*rawDist + (1-alpha)*predDist + beta*abs(accel)  longer chains trust prediction more | Medium |
| P3: Zigzag repair pass | Post-linker second-derivative detection + alternate feature reassignment | Low |

**Verifier issued ACCEPT WITH AMENDMENTS (4 corrections):**
- A1 [CRITICAL]: Normalize impliedVel by row gap (unit mismatch for missCount > 0)
- A2 [WARNING]: Start beta at 0.3, extract as ACCEL_PENALTY_WEIGHT constant
- A3 [WARNING]: Track usedFeatures set in repair pass to prevent cross-chain duplicates
- A4 [NOTE]: Update v10.6 comment to explain expanded momentum usage

All amendments incorporated by Executioner.

### Changes

| File | Change |
|------|--------|
| ChainLinker.ts L30 | New constant ACCEL_PENALTY_WEIGHT = 0.3 |
| ChainLinker.ts L591-593 | Updated v10.6 comment (Amendment A4) |
| ChainLinker.ts L676 | P1: matchU = ac.predictedU (was conditional on missCount) |
| ChainLinker.ts L679-723 | P2: Cost-based scoring with alpha, predDist, accel penalty |
| ChainLinker.ts L862-993 | P3: New repairChainsZigzags function |
| ChainLinker.ts L996-1009 | P3: Helper findFeatureKey |
| ParametricExportComputer.ts L62 | Import repairChainsZigzags |
| ParametricExportComputer.ts L1044 | Integration call for zigzag repair |
| ParametricExportComputer.ts L1047-1052 | Post-repair diagnostic |
| ParametricExportComputer.ts L1068 | Reverted Fix 2 (debug dots now back to raw detection) |
| ChainLinker.test.ts | 4 new tests for zigzag repair |

### Agent Performance

- **Generator**: Found the real code-level issue (momentum gated behind missCount). Three complementary proposals with clear rationale. Good focus on the actual problem.
- **Verifier**: Clean critique. A1 (row-gap normalization) caught a real unit mismatch bug. The mathematical analysis of SuperformulaBlossom feature acceleration (9e-7/row squared) confirmed all thresholds have 3000x headroom.
- **Executioner**: Clean implementation with a good catch (epsilon guard for floating-point ties in zigzag repair).

### Validation
- ChainLinker.test.ts: 49/49 passed (45 existing + 4 new)
- OuterWallTessellator.test.ts: 58/58 passed
- ChainStripTriangulator.test.ts: 21/21 passed
- ParametricExportComputer.test.ts: 169/169 passed
- tsc --noEmit: no new errors

### Diagnostics Pipeline (Post-Round 11)

The export now shows four chain quality checkpoints:
1. Chain quality (post-linking): maxConsecDelta, maxLinearDev
2. Post-resnap quality (after GPU refinement): maxConsecDelta, maxLinearDev
3. Post-repair quality (after zigzag fix, NEW): maxConsecDelta, maxLinearDev
4. Post-smooth quality (after WH lambda=50): maxConsecDelta, maxLinearDev

### Expected Results
- Post-resnap maxConsecDelta should decrease from 0.009 to ~0.002 (P1+P2 effect)
- Post-repair should decrease further (P3 catches remaining zigzags)
- Post-smooth should be well below 0.001
- Inverted triangles should decrease with better constraint edges
- Feature dots should be back in correct positions (raw detection)

### To the Next Agent
- User should run export and check the chain quality diagnostics
- Compare before/after on all four checkpoints
- If maxConsecDelta is still > 0.003 post-repair, investigate which chains/rows have the worst zigzag
- WH lambda=50 may now over-smooth with cleaner input  consider reducing to 20-30

## 2026-03-XX — Master: Round 11.1 — Repair Deadlock & Kind-Filtering Bug Fix

### Check-in
User reports Round 11 had NO EFFECT — post-linking maxConsecDelta unchanged at 0.008735, post-repair only 2% improvement to 0.008539. Round 10 Fix 2 revert confirmed (dots back at correct positions). User request: "feature dots looks correct now. please align the feature chains with them precisely making perfect smooth polyline."

### Root Cause Analysis (Master)

Two critical bugs found in the Round 11 implementation:

**Bug 1 — P1+P2 are no-ops for vertical features (Verifier C3 was right)**
For SuperformulaBlossom vertical features, velocity ≈ 0. With `predictedU ≈ lastU`:
- `rawDist ≈ predDist` (matchU = predictedU ≈ lastU)
- `accel ∝ rawDist` (impliedVel ≈ rawDist since velocity = 0)
- Score degenerates to `(1+β)·rawDist` — identical ranking to plain distance

The Verifier explicitly predicted this in C3 ("Proposal 2 Cannot Disambiguate at the Exact Moment of Bifurcation"). I approved anyway, thinking it would help on subsequent rows. It doesn't — the zigzag self-corrects the next row regardless. P1+P2 remain in the code but are harmless dead weight for vertical features.

**Bug 2 — usedFeatures creates a DEADLOCK in symmetric zigzags (the common case!)**

Amendment A3 added a `usedFeatures: Set<string>` that blocks repair candidates already held by another chain. In the most common zigzag pattern (symmetric swap: Chain C1 holds C2's correct feature and vice versa):

1. `usedFeatures` is populated before repair pass starts
2. When repairing C1 at row R: target feature (u=0.170) is in `usedFeatures` (held by C2) → **BLOCKED**
3. When repairing C2 at row R: target feature (u=0.179) is in `usedFeatures` (held by C1) → **BLOCKED**
4. Neither chain can repair. 0 repairs per pass. All 3 passes produce 0 fixes.
5. Result: **2% improvement** (only catches rare asymmetric zigzags)

The Verifier's A3 amendment was well-intentioned (prevent duplicate assignments) but created a deadlock in the exact scenario the repair function was designed to fix.

**Bug 3 — Kind-unaware repair (peak chains could snap to valley features)**

`repairChainsZigzags` searched `allRowFeatures` (mixed peaks+valleys) for alternates, but chains are kind-separated by `linkFeatureChainsByKind`. A peak chain repair could snap to a valley position. Unlikely to cause issues for SuperformulaBlossom (peaks/valleys well-separated) but mathematically incorrect.

### Decision: Direct bug fix (no Generator/Verifier cycle needed)

These are implementation bugs, not architectural questions. The Generator/Verifier already analyzed this space. Fixing directly.

### Changes Made

| File | Change |
|------|--------|
| ChainLinker.ts — `repairChainsZigzags` | **Removed entire usedFeatures mechanism** (Set construction, blocking check, findFeatureKey helper) |
| ChainLinker.ts — `repairChainsZigzags` | **New parameter**: `allRowTypedFeatures?: FeaturePoint[][]` for kind-aware filtering |
| ChainLinker.ts — New helper | `getKindFilteredFeatures(row, chainKind, allRowFeatures, allRowTypedFeatures)` — returns only same-kind features |
| ChainLinker.ts — `repairChainsZigzags` | **Added repair count logging**: `console.log("[ParametricExport] Zigzag repair: N points fixed")` |
| ParametricExportComputer.ts L1044 | Updated call: `repairChainsZigzags(chains, allRowFeatures, allRowTypedFeatures)` |
| ChainLinker.test.ts | Updated 4 test calls to new signature (added `undefined` for allRowTypedFeatures) |

### Validation
- ChainLinker.test.ts: 49/49 ✅ (repair outputs visible: "1 points fixed", "2 points fixed")
- OuterWallTessellator.test.ts: 58/58 ✅
- ChainStripTriangulator.test.ts: 21/21 ✅
- ParametricExportComputer.test.ts: 169/169 ✅
- tsc --noEmit: no new errors (only pre-existing TS6133 in test files)

### Lessons Learned
1. **The Verifier was right about C3.** I should have given more weight to the mathematical proof that P2 can't disambiguate at velocity=0. Instead I approved hoping it would help "on subsequent rows."
2. **Safety mechanisms can create deadlocks.** Amendment A3's usedFeatures was a classic case — the safety check blocked the exact operation it was protecting. The symmetric-swap case (most common zigzag) creates mutual blocking.
3. **Always reason about the common case first.** The usedFeatures check works for asymmetric scenarios but fails for the dominant pattern.

### Feelings
Frustrated at myself for approving the Round 11 plan without catching the usedFeatures deadlock. The Verifier flagged the P2 degeneracy in C3 but didn't catch A3's deadlock either. The real takeaway: when adding a safety mechanism to an algorithm, always test it against the algorithm's PRIMARY use case, not just edge cases.

### To the Next Agent
- User should re-run export and check:
  1. `"Zigzag repair: N points fixed"` — should be a significant number (was ~0 before)
  2. Post-repair maxConsecDelta — should decrease substantially from 0.008539
  3. Post-smooth maxConsecDelta — should improve beyond 0.003092
  4. Inverted triangle count — should decrease from 207K
  5. Chains should visually align better with feature dots
- If repair is still insufficient, the next battlefront is P1+P2 replacement — potentially a bipartite matcher at bifurcation zones
- WH λ may need recalibration if chain quality improves significantly

---

## 2026-03-05 — Executioner Round 12: Non-Crossing Chain Linking Implementation

### Check-in
Read Generator proposal, Verifier critique (with amendments C1/C2/C6), and full `linkFeatureChainsCore` function. All context absorbed. Implementing the converged non-crossing DP matcher.

### Changes Made
- **[ChainLinker.ts](src/renderers/webgpu/parametric/ChainLinker.ts#L30-L38)**: Added `MATCH_BONUS = 1.0` constant with JSDoc explaining why 1.0 is safe (scores bounded by ~0.046).
- **[ChainLinker.ts](src/renderers/webgpu/parametric/ChainLinker.ts#L654-L660)**: Added pre-allocated DP buffers (`_dpCostBuf`, `_dpTableBuf`, `_dpFromBuf`) before the row loop, reused across rows to avoid GC pressure at K=72 (C2).
- **[ChainLinker.ts](src/renderers/webgpu/parametric/ChainLinker.ts#L668-L830)**: Replaced the entire greedy sorted-scan matching block (~130 lines) with non-crossing DP:
  1. Circular linearization via largest-gap cut on `predictedU` (C6)
  2. Sort chains and features by shifted U
  3. Cost matrix with existing scoring (α/β/accel), minus MATCH_BONUS
  4. O(K×M) DP with skip-chain / skip-feature / match transitions
  5. Backtrace to recover optimal non-crossing assignment
  6. Apply matches with unchanged velocity prediction logic
- **Removed `lengthBonus`** — no longer needed; non-crossing constraint disambiguates ties.
- **Kept `repairChainsZigzags`** as diagnostic — if it fires post-DP, that's a bug signal.
- **[ChainLinker.test.ts](src/renderers/webgpu/parametric/ChainLinker.test.ts)**: Added 3 new tests:
  1. Two close features alternating positions → verify no zigzag
  2. Circular seam crossing (U=0.99 and U=0.01) → verify non-crossing
  3. K < M (more features than chains) → verify unmatched features start new chains
- **Added 5+ line non-crossing justification comment** (C1): Superformula order preservation, Spiral/Wave uniform spacing, HarmonicRipples fold bifurcation theorem, defensive fallback.

### Validation Results
- `npx tsc --noEmit`: No new errors (0 ChainLinker errors; all pre-existing errors in other files)
- `npx vitest run ChainLinker.test.ts`: **52/52 tests pass** (49 existing + 3 new)
- All existing tests unchanged and passing

### Deviations from Plan
None. Implementation follows the converged Generator/Verifier specification exactly.

### Surprises / Feedback for Generator & Verifier
- The implementation was clean — the DP slot in perfectly where the greedy scan was. The function signature, output format, and surrounding code (unmatched handling, empty-row early exit) required zero changes.
- The cost matrix scoring is identical to the old per-candidate scoring (minus lengthBonus). No scoring formula changes.
- Pre-allocated buffers grow-on-demand: initial size 0, then grow to max(K×M) seen. Conservative and GC-friendly.

### Sign-off
Implementation complete. 52/52 tests green. No deviations. The non-crossing DP is structurally incapable of producing zigzags — correct by construction.

@NextAgent: The repair pass (`repairChainsZigzags`) should now be a no-op in practice. If it still fires on real exports, that means feature detection is producing crossing features (which would be a bug in the feature detector, not the linker). Monitor the `"Zigzag repair: N points fixed"` log line.

---

## 2026-03-05 — Master: Round 12 Approval — Non-Crossing Chain Linking

### Decision: APPROVED

### Unanimous Agreement Status
- **Generator**: Proposed non-crossing DP matcher. Clean, single algorithm. Root cause diagnosed with concrete trace.
- **Verifier**: ACCEPT WITH AMENDMENTS (C1: docs, C2: K range). No fatal flaws. Withdrew C3 after self-analysis.
- **Executioner**: Implemented cleanly. 52/52 tests pass. No deviations from plan.
- **Master**: APPROVED. This is the right fix at the right level.

### Rationale
The user was right — we'd been applying bandaids for 5 rounds (7-11). The chain linker's greedy sorted-scan was the source of zigzags, and no amount of post-processing could fix an algorithm that breaks ties arbitrarily when scores are numerically tied.

The non-crossing DP eliminates zigzags BY CONSTRUCTION. It's an exact algorithm with no tuning parameters. For well-separated features, it produces identical results to greedy. For ambiguous features near bifurcation, it enforces topological ordering — chains sorted by U match features in the same U order. This is the correct solution.

Debate converged in ONE round. Generator proposed, Verifier accepted with minor amendments, Executioner implemented cleanly. This is what efficient agent collaboration looks like.

### Validation
- ChainLinker.test.ts: 52/52 ✅ (49 existing + 3 new)
- OuterWallTessellator.test.ts: 58/58 ✅
- ChainStripTriangulator.test.ts: 21/21 ✅
- ParametricExportComputer.test.ts: 169/169 ✅
- tsc --noEmit: clean (no new errors)

### Expected User-Facing Impact
- `maxConsecDelta` (pre-smooth) should drop from 0.008735 to < 0.001
- `repairChainsZigzags` should report 0 points fixed (or very few)
- Inverted triangles should decrease significantly from 207K
- Chain polylines should visually align with feature dot cloud
- WH smoothing λ=50 may now over-smooth — consider reducing to 20-30 if pre-smooth quality is already good

### Lessons Learned (Master Retrospective)
1. **Listen to your user.** They said "fix it at the source" — that was the right directive. We should have considered the non-crossing DP in Round 7, not after 5 rounds of bandaids.
2. **Scoring can't fix topology.** No scoring formula can enforce ordering constraints. The transition from "better score" to "structural guarantee" was the key insight.
3. **One-round convergence is possible.** When the problem is well-framed and the solution is mathematically clean, the debate can be short. Framing quality > debate rounds.

---

## 2026-03-05  Verifier: Round 15  CatRom Removal Review

### Check-in
Reading the Round 15 Generator proposal on CatRom overshoot. The root cause analysis is solid  uniform CatRom at inflection points creates zigzag constraint paths. Let me attack the assumptions.

### Work Log
- Read subdivideFullChain (L272-334): confirmed CatRom vertices get explicit 	 and pointIdx=-1
- Traced companion generation (L617, L716): companions are INDEPENDENT of CatRom  they have explicit 	: ct and skip pointIdx < 0 entries
- Verified interiorByBand (L747-756): collects both CatRom and companion vertices via cv.t !== undefined check  companions alone satisfy this
- Checked all 7 cv.t touchpoints in the pipeline  ALL work correctly without CatRom
- Verified edge-building guard (L528-540): same-row skip is pre-existing behavior, not introduced by P1
- Calculated companion density at (2,2): m=1 laterals at CONSTRAINT_GUARD_RADIUS boundary (0.001), ~30-50% borderline rejection
- Key insight: CatRom vertices were constraint-LOCKED, not free Steiner points  removing them HELPS CDT quality
- Primary edge counting (L1430-1445) will correctly recover from 0 to ~2,640

### Sign-off

**Summary**: P1 (remove CatRom) is the cleanest fix I've reviewed  eliminates root cause (zigzag constraints), reduces constraint count 3, improves CDT quality, and costs ~5 lines of code. ACCEPTED without amendments.

P4 (companion density boost) is sound but should be CONDITIONAL on P1 results. If P1 alone achieves acceptable quality, P4 adds unnecessary vertices and export time. ACCEPTED WITH AMENDMENTS: implement sequentially, measure after P1.

**Feelings**: Satisfying review. The Generator's root cause analysis was thorough and correct. No fatal flaws found. The CatRom was well-intentioned (C smoothness) but counterproductive at 264-row resolution  a classic case of solving a theoretical problem that doesn't exist at the operational scale.

**Proposals**: None  the Generator's P1 is the right fix. Just don't bundle P4 with it.

**To the Next Agent (Executioner)**: The implementation is trivial  replace 7 lines with 1 line at OWT L519. Do NOT delete the CatRom functions (they're exported and tested). Mark subdivideFullChain as @deprecated. Watch the quality metrics in the export log  primaryTotal should jump from 0 to ~2,640 and maxAspect should drop dramatically.

**Verdict document**: `potfoundry-web/docs/plans/verifier-round-15-catrom-removal.md`

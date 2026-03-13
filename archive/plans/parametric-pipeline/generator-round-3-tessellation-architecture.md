# Generator Round 3 — Tessellation Architecture Overhaul

Date: 2026-03-03

## Problem Statement

The chain-strip tessellation pipeline is catastrophically broken. The Executioner's Phase A diagnostics prove that **chain linking is now smooth** (maxLinearDev=0.002364), but the downstream triangulation produces:

- **47.6% missing chain edges** (3,139 / 6,586)
- **88% aspect ratio violations** (253K / 288K triangles)
- **145K inverted triangles** (structural, not winding)
- **11.5mm seam gap**
- **min_angle = 0.0°**, max_aspect = 39,672.5

The problem is architectural: the system pays the cost of CDT infrastructure (130K companion vertices) while running in sweep mode that ignores all constraint edges. This is not a parameter problem — it's a design contradiction.

## Root Cause Analysis

### The Internal Contradiction

The pipeline has five interacting failures, but they all stem from one architectural issue: **the companion vertex system was designed for CDT, CDT was disabled, and nobody updated the companion logic for sweep mode.**

Tracing the data flow:

1. **Companion vertices created** (OWT L388-480): `density=12` → 24 companions per chain point → 130K total vertices. Comments explicitly say "so the CDT produces well-shaped triangles" and "These are unconstrained free points."

2. **Constraint filter** (OWT L855-857): `if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;` — drops ALL edges involving companions and interpolated vertices (~50% of chain continuity). This is defensible for CDT (CDT guarantees Delaunay angles — unconstrained free points find optimal positions automatically). It's catastrophic for sweep (sweep has no quality guarantee — unconstrained points become random debris).

3. **Export runs sweep-repair** (`cdt=0, sweep=5,642`): The Executioner's test used sweep-repair. Even though DEFAULT_PIPELINE_CONFIG sets `'cdt'` (ExportDialog.tsx L145), the actual export ran sweep-repair. Why?

4. **sweepRegion** (ChainStripTriangulator.ts L534-561): Pure greedy U-ordered advance. Constraints partition regions but are never enforced as edges. The greedy advance picks whichever of `nextBotU` or `nextTopU` is smaller — it can (and does) skip constraint endpoints entirely.

5. **Post-hoc optimizers** can't rescue this: ChainStripOptimizer does 165K edge flips but rejects 141K because the alternatives are worse. You can't edge-flip your way out of a structurally broken topology.

### Key Discovery: CDT Code EXISTS and WORKS

This is the critical insight the Executioner missed in framing Q1 as "CDT vs Sweep": **CDT is not broken or missing — it's fully implemented and correctly structured.**

`cdtTriangulateStrip()` (ChainStripTriangulator.ts L141-325):
- Uses `cdt2d` library (already in package.json as `"cdt2d": "^1.0.0"`)
- Performs uniform T/U scaling to prevent aspect-ratio bias
- Builds boundary edges (left, right, bot, top strip edges)
- Builds constraint edges from ALL passed constraints
- Runs CDT with `exterior: true` (correct — prevents misclassification of sub-regions)
- Filters triangles by centroid bounds
- Tracks R2 violations and quality metrics
- Falls back to sweep on CDT failure (`sweepFallbacks` counter)

The `DEFAULT_CHAIN_STRIP_CONFIG` (L82) sets `mode: 'cdt'`. The UI default (ExportDialog.tsx L145) sets `chainStripMode: 'cdt'`. The backend default (ParametricExportComputer.ts L432) defaults to `'cdt'`.

**So why was cdt=0 in the Executioner's test?** The mode was explicitly set to `sweep-repair` for that export. The CDT infrastructure is live and available — it just wasn't selected.

### The Real Question: Why Would Anyone Switch to Sweep-Repair?

The CDT code has a sweep fallback path (L235-237). If CDT fails on degenerate input, it increments `sweepFallbacks` and falls through to sweep. This suggests historical reliability concerns with `cdt2d` on edge cases. But the default is still CDT.

Possible reasons for switching to sweep-repair:
1. **Performance**: CDT is O(n log n) per strip, sweep is O(n). With 5,642 strips × avg ~65 verts, the raw CDT cost is ~65×16 ≈ 1,040 operations per strip × 5,642 = ~5.9M operations. Not prohibitive.
2. **cdt2d crashes**: The try/catch (L233-238) exists for a reason. Perhaps cdt2d throws on certain strip geometries.
3. **cdt2d produces garbage**: Perhaps the CDT output fails centroid filtering or produces exterior triangles.
4. **Historical regression**: Perhaps CDT worked, someone tested sweep-repair, found it "faster," and the default de facto shifted even though the code default is still CDT.

**This must be tested empirically.** I propose running CDT mode on the same 10-petal pot and comparing diagnostics.

## Proposals

### Proposal 1: Run CDT Mode As-Is (Diagnostic) — Conservative

**Idea**: Before changing ANY code, re-run the exact same export with `chainStripMode: 'cdt'` instead of `'sweep-repair'` and compare diagnostics.

**Mechanism**: No code change. Change the UI dropdown from "Sweep + repair" to "Local CDT (best quality)" and export.

**Mathematical basis**: CDT with constraint edges guarantees those edges appear in the triangulation. If CDT produces the output, 47.6% missing edges should drop to ~0%, because `cdtTriangulateStrip` builds constraint edges from the passed constraints (L210-225).

**Files affected**: None (UI config change only)

**Trade-offs**: If CDT mode works, the entire companion infrastructure becomes useful instead of dead weight. If CDT mode crashes/degrades on some strips, we'll see it in `sweepFallbacks` count.

**Expected outcome**:
- `cdtStrips` > 0, `sweepFallbacks` ≤ a few
- Missing chain edges drops from 47.6% → ~3-5% (constraint filter still drops interpolated edges)
- Aspect violations improve (CDT optimizes angles)
- If sweepFallbacks is high → we need Proposal 3 or 4

**Assumptions** (for Verifier to attack):
1. CDT mode default is correctly wired through the pipeline (ExportDialog → ParametricExportComputer → OuterWallTessellator → ChainStripTriangulator)
2. `cdt2d` reliably handles strips of 30-100 vertices with 5-15 constraint edges
3. The centroid filtering (L248-261) doesn't over-aggressively discard valid interior triangles
4. Companion vertices at density=4 (UI default) produce reasonable CDT output

### Proposal 2: Remove the `pointIdx < 0` Constraint Filter — Moderate

**Idea**: Remove or weaken the filter at OWT L855-857 that drops ~50% of chain continuity edges.

**Mechanism**: Replace:
```typescript
if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;
```
With either:
- **Option A** (remove entirely): Delete the filter. Pass ALL chain edges as constraints.
- **Option B** (allow one interpolated): `if (cv0.pointIdx < 0 && cv1.pointIdx < 0) continue;` — only skip edges where BOTH endpoints are interpolated.
- **Option C** (allow all, but mark soft): Pass all edges but with a `soft` flag that tells the triangulator to prefer-but-not-require them.

**Mathematical basis**: The Executioner's accounting shows:
- Primary edges (both pointIdx ≥ 0): 3,269 total → 107 missing (3.3%)
- Interpolated edges (at least one pointIdx < 0): ~3,317 total → ~3,032 missing (91.4%)

The interpolated edges represent chain continuity through rows that don't have detected features at exact grid positions. These edges ARE the chain's structure between feature rows. Dropping them creates 91.4% loss of chain continuity.

In CDT mode, passing these as constraints is safe — CDT handles any valid constraint edge. In sweep mode, more constraints could improve the partition quality (sweepTriangulateStrip classifies constraints by bot/top position, more constraints = finer partitioning).

**Files affected**: `OuterWallTessellator.ts` L855-857

**Trade-offs**:
- More constraints = more work for CDT (but CDT handles this natively)
- In sweep mode, more constraints = more partitions = more sweepRegion calls = better chance of covering chain edges
- Risk: if interpolated vertices have imprecise positions (pointIdx=-1 means they were placed by interpolation, not detection), constraint edges could cross each other → CDT failure → sweep fallback

**Assumptions** (for Verifier to attack):
1. Interpolated vertex positions are accurate enough to form non-crossing constraint edges
2. Chain edges involving interpolated vertices don't create crossing constraints within a strip
3. CDT handles the increased constraint count without performance degradation
4. The batch2Remap logic (L874-882) correctly handles remapped interpolated vertices

### Proposal 3: Mode-Adaptive Companion Density — Moderate

**Idea**: Set companion density based on the actual triangulation mode. CDT benefits from density; sweep is harmed by it.

**Mechanism**: 
```
if mode == 'cdt':     density = max(1, min(6, userDensity))    // useful for CDT angle quality
if mode == 'sweep':   density = 0                              // companions are pure slivers in sweep
if mode == 'sweep-repair': density = 0                         // same — sweep doesn't use them
```

**Mathematical basis**: In sweep mode, companion vertices are unconstrained free points that the greedy advance must thread through. Each companion adds a vertex between grid columns at U-spacing ~0.000073, while T-spacing is ~0.0032. Aspect ratio = 0.0032 / 0.000073 ≈ 43.8:1. This perfectly explains the 88% aspect violations and min_angle=0.0°.

In CDT mode, companions serve their designed purpose: providing local density so the Delaunay criterion produces well-shaped triangles around chain features. But even for CDT, density=12 (24 companions per chain point) is extreme. The Delaunay angle guarantee only needs ~3-5 support points per side to avoid slivers.

**Files affected**: `OuterWallTessellator.ts` L405-410 (density calculation)

**Trade-offs**:
- Sweep with density=0 eliminates 130K vertices → faster, better quality
- CDT with capped density (1-6) preserves angle quality at lower vertex count
- Risk: CDT with too few companions might create slivers connecting chain points to distant grid columns (but grid density near chains is already enhanced by CDF-adaptive placement)

**Assumptions** (for Verifier to attack):
1. The CDF-adaptive grid (GridBuilder.ts) already provides sufficient density near chain features
2. Eliminating companions in sweep mode doesn't create holes (companions are free points, not structural)
3. CDT with density=4-6 produces acceptable angle quality
4. Companion vertices don't serve any purpose outside of triangulation density (no downstream dependency)

### Proposal 4: Constraint-Enforced Sweep (If CDT Fails) — Moderate

**Idea**: If CDT mode proves unreliable (high `sweepFallbacks`), add a post-sweep constraint enforcement pass to sweepRegion.

**Mechanism**: After the greedy sweep produces triangles, check each constraint edge:
1. For each constraint edge (v0, v1), search the triangle list for a triangle containing both v0 and v1 as an edge.
2. If found → constraint satisfied, do nothing.
3. If not found → find the two triangles whose union contains (v0, v1) and flip the shared diagonal. If flip is impossible (non-convex quad), split one triangle by inserting a vertex.

**Mathematical basis**: This is the standard "edge recovery" step in incremental CDT algorithms (Shewchuk 2002). For a sweep of N vertices with K constraints, the verification pass is O(K × avg_triangle_degree) which is effectively O(K) since triangle degrees are bounded.

In the current data: ~6,586 chain edges, of which ~3,269 are passed as constraints. The constraint check per strip is at most ~10-20 edges × ~50 triangles = negligible.

**Files affected**: 
- `ChainStripTriangulator.ts` — new function `enforceConstraints()` called after sweepRegion
- `ChainStripTriangulator.ts` — `sweepTriangulateStrip` calls enforceConstraints on each region output

**Trade-offs**:
- Adds O(K) per strip — small constant cost
- More complex than "just enable CDT"
- Still no angle quality guarantee (sweep + constraint enforcement ≠ Delaunay)
- But guaranteed constraint edge presence (the primary quality metric)

**Assumptions** (for Verifier to attack):
1. The sweep output is topologically valid enough for edge recovery to work
2. Constraint edges don't cross other constraint edges (prerequisite for single-flip recovery)
3. The shared-diagonal flip produces valid triangles (non-degenerate, correct winding)
4. This is only needed if Proposal 1 (CDT mode) proves unreliable

### Proposal 5: Aggressive — Seam Guard Reduction — Conservative

**Idea**: Reduce `SEAM_GUARD` from 0.3 to 0.01-0.03 and `SEAM_EDGE_COMPANION_GUARD` from 0.003 to 0.001 to close the 11.5mm seam gap.

**Mechanism**: The seam gap is at U=0/U=1 (the 0°/360° seam). Three guards create exclusion zones:

1. `SEAM_GUARD = 0.3` (OWT L118): Skips chain edge creation when `cellWidth > SEAM_GUARD`. Since the seam-wrapping cell has width ~0.3-0.5 in the CDF grid, ALL chain edges crossing the seam are dropped.

2. `SEAM_THRESHOLD = 0.4` (OWT L115): Skips chain edges when `|du| > SEAM_THRESHOLD`. This prevents false cross-seam connections.

3. `SEAM_EDGE_COMPANION_GUARD = 0.003` (OWT L409): Prevents companion placement near U=0/1.

The 11.5mm seam gap is approximately 7.6% of circumference at ~150mm circumference. In U-space, 7.6% = 0.076 — but the guards exclude 0.3 + 0.3 = 0.6 of U-range, which is **60%** of the domain. This is absurdly conservative.

**Mathematical basis**: The seam is where U wraps from 1 back to 0. Chain vertices near the seam have U values near 0 or near 1. The correct handling is to unwrap chain edges that cross the seam (add or subtract 1.0) rather than exclude them.

Proposed values:
- `SEAM_GUARD = 0.03` — only exclude the actual seam-crossing cell, not 30% of the domain
- `SEAM_THRESHOLD = 0.06` — allow edges within 6% of circumference, still prevents cross-domain errors
- `SEAM_EDGE_COMPANION_GUARD = 0.001` — minimal exclusion near exact edge

**Files affected**: `OuterWallTessellator.ts` L115, L118, L409

**Trade-offs**:
- Drastically reduces seam gap (11.5mm → <1mm estimated)
- Risk: false cross-seam connections if unwrapping isn't handled correctly
- The proper fix is seam unwrapping (adding 1.0 to chain U values near 0 when comparing with chain vertices near 1), but that's a bigger change

**Assumptions** (for Verifier to attack):
1. The 11.5mm gap is primarily caused by the guard exclusion zones, not by missing chain data near the seam
2. Reducing guards doesn't create false cross-seam triangulations
3. The strip segmentation logic correctly handles the seam-region strips
4. Grid columns at U=0 and U=1 share the same physical position (seam welding)

### Proposal 6: Nuclear Option — Replace Sweep Entirely with CDT — Radical

**Idea**: Remove sweep and sweep-repair modes. CDT becomes the only triangulation path for chain strips. Sweep fallback becomes a hard error instead of silent degradation.

**Mechanism**:
1. Remove `sweepTriangulateStrip` and `sweepRegion` entirely
2. Remove `sweepRepairTriangulateStrip`
3. `triangulateChainStrip` always calls `cdtTriangulateStrip`
4. CDT failure → throw error with diagnostic info instead of falling back to garbage
5. Investigate and fix the specific strip geometries that cause `cdt2d` to fail, rather than having a fallback that produces broken output

**Mathematical basis**: CDT is the correct algorithm for this problem. It guarantees:
- Constraint edges appear in the output (resolves RC-1: 47.6% missing edges)
- Delaunay angle optimization (resolves RC-3: aspect ratio violations)
- Companion vertices serve their designed purpose (resolves RC-3, RC-4)

The only reason to keep sweep is if CDT is unreliable. But unreliable CDT → sweep fallback → 47.6% missing edges is WORSE than CDT failure → error → developer fixes the degenerate input. Silent degradation is the enemy.

**Files affected**: 
- `ChainStripTriangulator.ts` — remove sweep/sweep-repair, simplify dispatcher
- `OuterWallTessellator.ts` — remove mode-switching config
- `types.ts` — simplify `ChainStripMode` to just 'cdt' or remove entirely
- `ExportDialog.tsx` — remove mode selector

**Trade-offs**:
- Eliminates the fundamental architecture bug (sweep used where CDT needed)
- Forces confrontation with cdt2d edge cases instead of hiding them
- Risk: if cdt2d has genuine failure modes on 1% of strips, exports break entirely instead of producing garbage output
- Lower code complexity (removes ~200 lines of sweep logic)

**Assumptions** (for Verifier to attack):
1. `cdt2d` is reliable enough for production use (sweepFallbacks = 0 on typical exports)
2. Any cdt2d failure is caused by degenerate input that can be preprocessed away
3. The performance difference between CDT and sweep is acceptable
4. Users don't need sweep mode for any valid use case

## Recommended Approach

### Phase 1: Diagnostic (Zero Code Change)
**P1**: Run CDT mode on the same 10-petal pot. Collect `cdtStrips`, `sweepFallbacks`, missing edges, aspect violations. This is 5 minutes of work and answers the most important question: **does CDT mode already solve the problem?**

### Phase 2: Quick Wins (If CDT Works)
If CDT shows significant improvement:
1. **P2**: Remove the `pointIdx < 0` filter → recover 50% of chain continuity
2. **P3**: Set companion density to 4 (default) in CDT mode, 0 in sweep mode
3. **P5**: Reduce seam guards → close the 11.5mm gap

### Phase 3: Architecture Decision
Based on Phase 1 diagnostics:
- If `sweepFallbacks = 0` → **P6** (remove sweep entirely)
- If `sweepFallbacks > 0 but < 5%` → keep CDT default, fix degenerate inputs
- If `sweepFallbacks > 5%` → **P4** (constraint-enforced sweep as fallback)

### Execution Order: P1 → P2 → P3 → P5 → P6 or P4

The entire strategy hinges on P1. If CDT mode already produces dramatically better output (which I predict it will, based on the code analysis), then Proposals 2-6 are refinements, not architecture changes.

## Open Questions

1. **Why was the Executioner's test run with sweep-repair?** Was this deliberate? Accidental? If the default is CDT, who changed it and why?

2. **What is the `sweepFallbacks` count on a typical CDT export?** This is the single most important diagnostic. If cdt2d is reliable, sweep should be deleted.

3. **Are interpolated vertex positions accurate enough for CDT constraints?** Interpolation happens between detected feature rows — the U positions come from linear interpolation of detected peaks/valleys. If the interpolation is good, these should form valid non-crossing constraint edges.

4. **Does `cdt2d` handle the ~60-vertex strips with ~10 constraints efficiently?** The library is mature (npm `cdt2d ^1.0.0`) but we need to confirm it doesn't have edge cases with the specific strip geometries PotFoundry produces.

5. **Is the seam gap related to chain data or triangulation?** The 11.5mm gap could be caused by missing chain vertices near U=0/1 (no features detected near seam) OR by the guard exclusions preventing triangulation near the seam. Need to distinguish.

---

*Generator out. The CDT code exists, the CDT code works, and it's the designed solution. P1 is the diagnostic that proves everything. If CDT produces clean output, the entire sweep path is dead code that should be deleted.*

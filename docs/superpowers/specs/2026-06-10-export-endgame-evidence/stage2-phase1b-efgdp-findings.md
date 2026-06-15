# Stage-2 Phase-1b Findings — the DP is already ON (premise corrected) (2026-06-15)

Phase-1b set out to "activate the dead max-min-angle (Klincsek DP) diagonal." **That
premise was wrong** — the DP is already active in production. This documents the
correction and the real, measured picture. Probe: `e2e/_fidelity_quality_efgdp_sweep.cjs`.

## 1. Correction: the DP is ON by default

The Stage-1 investigation concluded `efgSampler` is "never injected" by reading
`ConformingWall.ts:270` (`efgSampler: opts.efgSampler`) — but it **missed the export
computer's wiring**: `ParametricExportComputer.ts:2587-2596` sets
`const efgOn = window.__pfConformingEfg !== false` (**default ON**) and passes a
**warp-composed** `outerEfgSampler`/`innerEfgSampler` into `assembleWatertight`
(→ `WatertightAssembly.ts:484/489` → `ConformingWall` `opts.efgSampler`). So `efg`
populates and the `aniso && efg` DP fires by default.

A new `__pfConformingEfgDP` lever (commit `df1534e`) was therefore a **no-op** (both
smoke tests byte-identical) — **reverted (`af24042`)**.

## 2. Measured: the DP is nearly irrelevant on the lattice (guard-suppressed)

Toggling the real existing lever `__pfConformingEfg` on GyroidManifold:

| state | worstMinAng | %<20° | bandPct | bulkPct | tris |
|---|---|---|---|---|---|
| def (DP on) | 0.85 | 7.10 | 5.20 | 8.80 | 684,876 |
| `__pfConformingEfg=false` (DP off) | 0.85 | 7.20 | 5.30 | 8.90 | 695,098 |

Turning the DP OFF barely changes Gyroid (7.1→7.2%) ⇒ the DP is doing almost nothing
there. Cause: the **metric-reliability guard** (`EFG_MAX_REL_VARIATION=0.5`,
`PeriodicBalancedQuadtree.ts:608-638`) **suppresses `efg` on high-variation cells** —
exactly the tangled lattice cells where the slivers are. The guard is correct (a single
`efg` tag would be wrong where the metric varies wildly within a cell), so the DP simply
cannot reach those cells.

## 3. Synthesis with Stage-1: two distinct sliver sub-classes

- **Bulk slivers (`%<20°`, ~6-10%)** — partly **density-helpable**: Stage-1's uniform
  sweep dropped Gyroid `%<20°` 7.1→3.7 at level 9 (more density → smaller cells → metric
  locally uniform → `efg` reliable → DP fires). But it is expensive and never reached 0.
- **Catastrophic worst (<1°, e.g. Gyroid 0.85, CelticKnot 0.41, SFB 0.37)** — **invariant**
  under both density AND the DP. A separate **degenerate-cell** source: the 2:1
  transition-template centroid fans (`QuadtreeTriangulator.ts:628-629/662-663`) and
  feature-pin column junctions produce near-degenerate needles that neither density nor
  the diagonal choice removes.

## 4. The corrected fork (needs a direction decision)

The quality defect is NOT "activate the DP" (it's on) and NOT GATE-B (the mitigation).
It is two deeper mechanisms — the **efg-reliability guard's blind spot** on tangled cells,
and the **transition-template / feature-pin degenerate cells**. Closing them within the
conforming mesher means either:
- **(A) keep extending the conforming triangulation** — make the DP reach high-variation
  cells (local/sub-cell reliable `efg`, or a metric-aware split) AND replace the
  degenerate transition-fan/feature-pin templates with quality-bounded ones; OR
- **(C) escalate quality to a Delaunay-refinement remesh** — provable min-angle bound
  (Chew/Ruppert), which structurally ends the per-mechanism whack-a-mole the last two
  phases exhibited (GATE-B refuted, DP already-on) — at the cost of the re-architecture.

This is the Option-A-vs-C decision the design reserved "where the conforming mesher is
structurally at its limit." Phase-1b is evidence we may be at that limit for *quality*.

## 5. What stands
- `__pfConformingEfg` (default ON) is the real DP lever; it helps where `efg` is reliable.
- `e2e/_fidelity_quality_efgdp_sweep.cjs` is now a `__pfConformingEfg` discriminator.
- No production change (lever reverted; byte-identical).

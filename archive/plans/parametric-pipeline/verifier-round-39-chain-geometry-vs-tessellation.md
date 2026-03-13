# Verifier Round 39 — Chain Geometry vs Tessellation After R38
Date: 2026-03-08

## Summary Verdict: ACCEPT WITH AMENDMENTS

The remaining visible dips are now more likely to be **chain-geometry artifacts first, tessellation artifacts second**.

R37/R38 materially improved the tessellation-side failure modes: the pipeline now threads protected corridor vertices into both optimizer passes at `ParametricExportComputer.ts:1542-1563`, and `ChainStripOptimizer.ts:564-566`, `ChainStripOptimizer.ts:586`, `ChainStripOptimizer.ts:659`, `ChainStripOptimizer.ts:714`, `ChainStripOptimizer.ts:875-887` explicitly skip protected neighborhoods. That does not prove tessellation is perfect, but it does mean the current mesh is no longer freely re-diagonalizing the repaired crossing corridor.

By contrast, the geometry handoff still has a hard fork: Step 3.6 computes smoother chains, logs the improved diagnostics, then discards them for actual mesh construction. `whittakerSmooth()` is applied at `ParametricExportComputer.ts:1094`, but `meshChains` is rebuilt from `preSmoothChains` at `ParametricExportComputer.ts:1108`, then those pre-smooth chains drive row insertion at `ParametricExportComputer.ts:1146`, outer-wall construction at `ParametricExportComputer.ts:1315`, and chain-directed flipping with the explicit comment `feature chains (pre-smooth, at true peak positions)` at `ParametricExportComputer.ts:1494`.

That makes the observed post-smooth improvement diagnostic-only unless the geometry path changes.

## Critique

### C1 [CRITICAL]: The current export still meshes the jagged chain path, not the improved one
**Claim under review**: the residual dips may still be primarily tessellation-driven after R38.

**Actual behavior**: the smoother and the mesh use different chain sets.

- `repairChainsZigzags()` runs before the Step 3.6 snapshot at `ParametricExportComputer.ts:1066`.
- Post-repair diagnostics are logged at `ParametricExportComputer.ts:1071-1073`.
- `preSmoothChains` is snapshotted at `ParametricExportComputer.ts:1087-1090`.
- `whittakerSmooth()` is then applied at `ParametricExportComputer.ts:1094`.
- The smoothed chains are filtered for diagnostics at `ParametricExportComputer.ts:1098` and logged at `ParametricExportComputer.ts:1113-1115`.
- The geometry path is then switched back to `filterLowConfidenceChains(preSmoothChains)` at `ParametricExportComputer.ts:1108`.

**Why that matters**: a dramatic drop in `maxConsecDelta` or `maxLinearDev` after smoothing does not alter the exported ridge if the exported ridge still uses `preSmoothChains`. A corridor fan or protected optimizer can only preserve the polyline it is given. It cannot remove a visible dip that is already encoded in the chain geometry.

**Counterexample**: if `whittakerSmooth()` were replaced by a no-op while leaving `meshChains = filterLowConfidenceChains(preSmoothChains)`, the mesh would be identical even though the post-smooth log would worsen. Conversely, if only `meshChains` changed and every tessellation pass remained the same, the visible ridge could change immediately. That is the signature of a geometry-primary failure.

**Verdict**: the most likely primary cause is now the raw chain geometry that still feeds the mesh.

### C2 [CRITICAL]: Using WH-smoothed chains directly is unsafe as a default fix
**Claim under review**: replace `meshChains` with the fully smoothed chains.

**Actual behavior**:

- `whittakerSmooth()` is a global second-difference penalty smoother, not a peak-preserving projector, at `ChainLinker.ts:415-494`.
- The code comment that introduced the current fork is explicit: smoothing displaced vertices away from exact GPU re-snapped feature positions, so geometry was switched back to pre-smooth chains at `ParametricExportComputer.ts:1102-1108`.
- Earlier verifier analysis already established that large pre-smooth jaggedness is not explainable by probe noise alone; it reflects linker/path errors, not mere sampling jitter, in `docs/plans/verifier-round-10-critique.md` under C2.

**Counterexample**: if a true peak migrates sharply over a short row interval, unconditional WH smoothing can reduce the local bend and produce a visually nicer but positionally wrong ridge. The mesh would look smoother while no longer passing through the exact re-snapped extrema the export path was designed to honor.

**Verdict**: **REJECT** unconditional use of the smoothed chains as the new default geometry source.

### C3 [ACCEPT WITH AMENDMENTS]: A bounded or blended mesh-guide chain is the safest next direction
**Claim under review**: use smoothing in the mesh path, but in a bounded form.

**Actual behavior**: this is the only candidate that directly addresses the verified geometry fork while respecting the v27 constraint that exact peaks must not drift arbitrarily.

**Why it is salvageable**:

- It changes the same downstream consumers that currently use `meshChains` at `ParametricExportComputer.ts:1146`, `ParametricExportComputer.ts:1315`, and `ParametricExportComputer.ts:1494`.
- It does not require removing `whittakerSmooth()` or abandoning the exact post-resnap/post-repair chain data.
- It can be validated with explicit drift metrics, which the current pipeline lacks.

**Required amendments**:

1. Keep two chain sets: `exactChains` and `meshGuideChains`. Do not destroy the exact post-repair/post-resnap data.
2. Derive `meshGuideChains` from `exactChains` by clamping the WH displacement per point rather than replacing points wholesale.
3. Add a hard metric `maxMeshGuideDriftFromExact` and log it next to the existing post-repair and post-smooth diagnostics.
4. Reject any point update that changes seam classification, changes row order, or crosses a same-kind neighbor in that row.
5. Gate the behavior behind an export flag until a before/after A/B confirms lower visual dip without unacceptable feature drift.

**Safe implementation shape**:

```text
exactChains = post-repair chains
smoothedChains = WH(exactChains)
meshGuideChains[i] = exactChains[i] + clamp(smoothedChains[i] - exactChains[i], per-point cap)
meshChains = filterLowConfidenceChains(meshGuideChains)
```

The cap must be tied to local topology, not a free global guess. A safe cap is the minimum of:

- a fraction of local same-kind feature spacing,
- a fraction of local grid column spacing,
- and a small absolute fallback bound.

This keeps the guide path inside the current feature basin instead of letting WH pull it onto the flank.

**Verdict**: **ACCEPT WITH AMENDMENTS**. This is the safest next implementation direction.

### C4 [ACCEPT]: More linker or zigzag repair work is valid, but it is a structural follow-up, not the fastest isolated fix
**Claim under review**: keep the geometry exact and instead improve linker or zigzag repair.

**Actual behavior**:

- `repairChainsZigzags()` already exists at `ChainLinker.ts:1009-1093` and is already in the pipeline at `ParametricExportComputer.ts:1066`.
- `filterLowConfidenceChains()` currently removes short or rough chains, but does not correct wrong row-level assignments beyond what the zigzag repair already catches, at `ChainLinker.ts:496-526`.
- The current post-repair diagnostic is logged before Step 3.6 at `ParametricExportComputer.ts:1071-1073`. If that number is still materially worse than the post-smooth number, the linker-side structure is still imperfect.

**Counterexample**: a pure linker-only round may eventually eliminate the need for mesh-guide smoothing, but it is a larger and less predictable intervention. If the immediate goal is to determine whether the remaining visible dip is geometry-driven, changing only linker internals first adds too many variables.

**Verdict**: **ACCEPT** linker and zigzag work as the longer-term root fix, but not as the only recommended next step.

## Accepted / Rejected Directions

1. **Most likely root cause now**: chain geometry is the primary cause; tessellation remains a secondary amplifier.
2. **Use smoothed chains directly**: **REJECT** as a default fix.
3. **Use bounded/blended smoothing for mesh**: **ACCEPT WITH AMENDMENTS**.
4. **More linker/zigzag changes**: **ACCEPT** as a structural follow-up and likely eventual root fix.

## Constraints To Avoid Regressions

1. Preserve the exact post-resnap/post-repair chain set for diagnostics and rollback.
2. Log both `maxMeshGuideDriftFromExact` and the existing chain-quality metrics in the same export.
3. Add a new validation metric for the user-visible failure: crossing dip depth before vs after.
4. Do not allow the mesh-guide chain to cross a same-kind neighbor, cross the seam differently than the exact chain, or move far enough to leave its local feature basin.
5. Run the A/B with the current R38 protected-corridor path unchanged so the test isolates geometry vs tessellation.

## Specific Safe Implementation Plan

1. Add an opt-in `meshGuideMode` in Step 3.6 with three modes: `exact` (current), `bounded-wh`, `full-wh`.
2. Keep `exactChains` as the post-repair chain array.
3. Compute `smoothedChains = whittakerSmooth(exactChains)`.
4. Build `meshGuideChains` by clamping pointwise displacement from `exactChains`.
5. Feed `meshGuideChains` consistently into row insertion, density-profile extraction, outer-wall building, and chain-directed flipping so the geometry path remains internally coherent.
6. Keep `full-wh` available only as an experiment, not as the default.
7. In a follow-up round, strengthen `repairChainsZigzags()` or linker reassignment only for rows where the exact-vs-smoothed delta repeatedly hits the clamp. Those rows are the strongest candidates for genuine linker mistakes.

## Bottom Line

The evidence no longer supports treating tessellation as the sole or even most likely primary cause. The pipeline is explicitly exporting the rougher chain set while only logging the smoother one. The safe next move is not to trust full WH geometry blindly; it is to introduce a bounded mesh-guide path, keep exact chains as the reference truth, and use the rows that keep hitting the drift clamp as the target set for the next linker/zigzag repair round.
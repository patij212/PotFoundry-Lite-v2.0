# Arm A4b Verdict — Gyroid band-edge holes 'snapMerge': REFUTED as implemented (measured-negative, default-off)

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm A4b (prereg Addendum 4). **Verdict: FAIL —
lever moved the target the WRONG direction.** Committed default-off / byte-identical / clearly
labeled measured-negative (preserves the `detectMultiCurveLeaves` factoring + the exact result for a
redesign; matches the A2 documented-negative precedent). Raw: `research/exchange/tierc/armA4b_*.json`.

## Target & fix attempted

A4 diagnosis: 329/360 boundary holes are near-tangent doubled-curve registry collisions (~65 spots)
where two near-coincident registry points (gap ≈0.000178) on the inner/outer contours never weld into
a shared edge. Fix attempted: `multiCurveCellPolicy: 'snapMerge'` — a new `regAddResolve` (sibling of
`regAdd`) called from `registerBoundary` ONLY in leaves flagged by A2's exact same-cell/2-distinct-
general-curve test (`detectMultiCurveLeaves`, factored out verbatim). On no exact registry match it
searches the shared grid line for a point within `SNAP_MERGE_WELD=4e-4` and reuses it.

## Result: FAIL (byte-identical + fidelity-clean, but wrong direction)

| metric | off | snapMerge | gate | result |
|---|---|---|---|---|
| outer hash | f033dbf5-b5f9fb84 | (off byte-identical) | ==banked | PASS |
| **boundaryEdges** | **360** | **426** | ≤31 | **FAIL (+66, wrong way)** |
| nonManifoldEdges | 3 | 3 | 0 | FAIL (unchanged) |
| orientationMismatches | 652 | 652 | Δ report | unchanged (untargeted) |
| outer tris | 2,242,987 | 2,242,137 | ±0.5% | PASS (0.038%) |
| Newton-worst | 0.02491654… | 0.02491654… | ±5% | PASS (bit-identical) |
| coverage max | 0.02531285… | 0.02531285… | ±10% | PASS (bit-identical) |

Default-off byte-identity + fidelity-Δ0 both pass — so the gating is correct and the merge is
geometrically harmless where it fires. But the primary target regressed. Existing suites: 74 pass / 1
skip (matches A2 baseline). ESLint + typecheck clean.

## Root cause of the failure (diagnosed, not tuned)

`regAddResolve`'s widen search is bounded in absolute (u,t) distance but **NOT scoped to the flagged
leaf's own edge extent** — it searches every point already registered anywhere on that exact shared
grid line. On Gyroid's long near-parallel doubled band-edge run (~0.00058 mean curve separation,
sub-cell in places), it merges onto a coincidentally-nearby but topologically-UNRELATED point instead
of the intended near-tangent twin — relocating the disagreement rather than resolving it (net +66).

## Redesign direction (for A4b-v2, untried)

Scope the merge-candidate search to points **provenance-tagged as registered while processing the
same flagged leaf** (i.e. the two curves' crossings within THIS cell's boundary span), not merely
nearby in absolute (u,t) on the whole grid line. Materially different design. Alternatively, the
boundary-hole fix may belong at the same layer as A4-orient (the seam/winding kernel work) if both
turn out to be the same cross-cell-registry-disagreement root — worth checking during A4-orient.

## Status

Gyroid watertightness: BOTH blockers remain open — 360 boundary holes (A4b-v2, provenance-scoped) AND
652 orientation mismatches (A4-orient, the u-seam winding). Neither closed yet. The 'snapMerge' branch
stays in the kernel default-off as a labeled measured-negative; do NOT enable it.

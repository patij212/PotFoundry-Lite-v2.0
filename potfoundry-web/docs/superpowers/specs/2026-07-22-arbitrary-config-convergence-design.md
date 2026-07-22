# Arbitrary-config convergence — self-calibrating refine-vs-redesign on uncertified configs

**Date:** 2026-07-22
**Status:** Design approved (decisions locked; proceeding to plan + implementation)
**Branch:** `refactor/core-migration`
**Builds on:** the convergence probe (`research/bridge/_certRosterConvergenceLib.ts`, `potscope converge`) shipped earlier this session.

## Problem

The convergence probe answers the campaign's most decision-relevant question — does a residual shrink when you add triangles (RESPONSIVE → refine) or stay flat (IRREDUCIBLE → redesign)? — but today it only runs on the **certified roster** (`CERTIFIED_POTS`). The actual frontier work is on **uncertified** configs: a known style at production relief/scale, a higher-relief variant, a new parameter regime. The probe can't reach them.

The blocker is calibration, not capability. `convergePot(pot, options)` ([`_certRosterConvergenceLib.ts:297`](../../research/bridge/_certRosterConvergenceLib.ts)) already takes a plain `{name, styleId, styleParams, geometry, divisions}` and runs `atlas → tessellate → sampleWorstResidualByPatch → ratio` with **zero roster or certificate coupling**. The only roster-coupling in the whole probe is in the test driver, which validates trust by comparing `fineGlobalMaxMm` against the pot's committed `error.bin` certified max. An uncertified config has no such certificate — so a cert-free way to know the cheap proxy is tight enough is the entire design.

## Goal

Run the convergence probe on an **arbitrary config** and produce a **trustworthy** per-patch refine-vs-redesign verdict, where trust is established without a certificate.

**Non-goals:** replacing the certifies-at ladder (the probe stays a cheap estimate); certifying anything (this measures convergence, not 0.01 mm); a GUI (CLI + JSON only).

## The key insight — trust comes from depth-convergence, not a certificate

The per-triangle estimate (`sampleWorstResidualByPatch`, [`:122`](../../research/bridge/_certRosterConvergenceLib.ts)) is `max over uniform subcells of the enclosure UPPER bound` — a **guaranteed conservative upper bound** on the true residual sup. As `depth` rises (finer subcells) the bound **tightens monotonically downward** toward the true sup. Measured on GeometricStar: `fineMax = 0.0106 (d2) → 0.0093 (d3) → 0.0089 (d4)`.

That monotone convergence is a cert-free calibration: **increase depth until the verdict stops changing.**

## Architecture

Four parts (A the core; B/C/D support it).

### A. Self-calibration by verdict-stability (the core)

New pure-ish lib function in `_certRosterConvergenceLib.ts`:

```ts
convergePotSelfCalibrated(config, {
  startDepth = 2, maxDepth = 5, coarseStep, floors, budgetMs?
}): ConvergePotResult & {
  selfCalibration: {
    method: 'verdict-stability';
    depthsRun: number[];               // e.g. [2,3]
    finalDepth: number;                // the depth whose result is reported
    perPatchStable: Record<string, boolean>;
    stable: boolean;                   // all non-trivial patches stable
    reason?: 'converged' | 'max-depth' | 'budget' | 'cannot-coarsen';
  }
}
```

Algorithm:
```
d = startDepth
Rprev = convergePot(config, depth=d)          // reuses the existing fn unchanged
loop d = startDepth+1 .. maxDepth:
  Rcur = convergePot(config, depth=d)
  perPatchStable[p] = verdict(Rprev[p]) === verdict(Rcur[p])   for each patch p
  if all patches stable:  report Rcur, stable=true, reason='converged'; stop
  Rprev = Rcur
  if elapsed > budgetMs:  report Rcur, stable=false, reason='budget'; stop
report Rcur, stable=false, reason='max-depth'   // proxy never converged
```

**Why verdict-stability and not fine-max-stability** — this is the load-bearing subtlety. The coarse mesh has bigger triangles, so at a fixed depth its enclosure is *looser* than the fine mesh's; that inflates `coarseMax/fineMax` and biases toward "responsive" — the dangerous false-negative (telling you to refine when you should redesign). Requiring the **verdict** (not just `fineMax`) to be stable across a depth step implicitly forces *both* bounds tight enough that the residual looseness no longer moves the call. It is the honest criterion, and it is the reason to pay the ~5×+ cost over a single-depth bake.

**Voronoi falls out correctly.** Voronoi's field blew up at depth 2 (427× vs cert-max, 512 numerical `encloseResidual` fallbacks) — a depth-independent numerical failure. Its verdicts would never stabilize, so self-calibration reports `stable:false, reason:'max-depth'` — an honest "this cheap probe cannot measure this field," not a garbage number. This replaces the roster's cert-ratio calibration with something that works off-roster *and* self-flags the pathological case.

### B. Vertical-coarsening v2 (in scope — completes the axis)

Today `coarsenDivisions` ([`:53`](../../research/bridge/_certRosterConvergenceLib.ts)) reduces the two uniform knobs (`angularDivisionsLog2`, `verticalDivisionsLog2ByPatch`) but **passes `verticalStationsByPatch` ladders through unchanged**, so a ladder-pinned patch (GeometricStar inner-wall, Voronoi inner-wall, HarmonicRipple_production) coarsens *angular-only* — its verdict is "angular-refinement-invariant," not a complete refine-vs-redesign call.

v2 also coarsens the ladders: for each `verticalStationsByPatch[patch]` ladder, produce a coarse variant that **drops alternate interior stations (stride 2), preserving the endpoints 0 and 1**, roughly halving the ladder's station count per `coarseStep`. Same for `angularStations` when present. This makes the coarse mesh genuinely lower-resolution on *both* axes, so ladder-patch ratios test vertical refinement too.

**Implementation hazard (flag for the plan):** `verticalStationsByPatch` entries are resolved ladder objects (e.g. `rationalStationLadder(...)` / `dyadicEdgeLadder(...)` outputs — see `_certRoster.ts` and the `ResolvedStations` shape in `annularSolidReferenceTessellation.ts`), not plain arrays. Subsampling must yield a ladder the tessellator still accepts (valid `numerators`/`values`/denominator, monotone, endpoints intact). The plan's first task is to pin exactly how a ladder is represented and how to produce a valid stride-2 coarsening (add a `coarsenLadder(ladder, step)` helper, unit-tested against a real roster ladder). If a ladder type can't be safely subsampled, fall back to angular-only for that patch **and record it** (`coarsenedAxes: 'angular'` per patch) so the verdict never silently over-claims.

Because v2 changes the coarse mesh for ladder patches, the roster convergence must be **re-baked and re-validated** (the 3 irreducible frontiers may shift — e.g. GeometricStar inner-wall 1.07 could change once vertical is also coarsened; that is new information, not a regression).

### C. Config input — JSON file + builder command

- **Driver path:** the convergence harness reads `PF_CONVERGE_CONFIG=<path.json>`; if set, it runs `convergePotSelfCalibrated` on that config instead of iterating the roster. Config shape = `CertifiedPot` minus the certified implication: `{ name, styleId, styleParams, geometry, divisions, coarseStep? }`.
- **Builder command:** `potscope convergeconfig <styleId> --relief <r> --od <mm> --h <mm> --ang <log2> --vert <log2> [--name <n>] [--out <path>]` writes that JSON with sensible defaults so you don't hand-author `divisions`. It maps `--relief` to the style's relief param (per a small per-style relief-key table — the one legitimately style-specific bit; document it), builds a `geometry` from `DEFAULT_GEOMETRY` + od/h, and a uniform `divisions` from `--ang`/`--vert`. This is what makes frontier *sweeps* ergonomic ("GeometricStar at relief 0.04, 0.08, 0.16").

### D. Reader / doctor / dashboard integration

- `<name>.converge.json` gains the `selfCalibration` block alongside (or instead of) the existing cert-based `calibration`.
- `readConverge` derives `calibrated = certCalibration?.ok ?? selfCalibration?.stable ?? false` and exposes the calibration `method`.
- `converge` / `doctor` / `dashboard` render a self-calibrated config exactly like a roster pot, labeling the method (`cert` vs `depth-stability`) and, when `!stable`, the `reason`. No new rendering path — the existing calibration-honesty plumbing (uncalibrated = muted, non-authoritative) already handles it.

## Output schema (additions to `converge.json`)

```jsonc
{
  // ...existing ConvergePotResult fields (perPatch, fineGlobalMaxMm, depth, ...)...
  "configSource": "roster" | "arbitrary",
  "coarsenedAxes": { "inner-wall": "angular+vertical", "outer-wall": "angular+vertical", ... },
  "selfCalibration": {
    "method": "verdict-stability",
    "depthsRun": [2, 3],
    "finalDepth": 3,
    "perPatchStable": { "inner-wall": true, "outer-wall": true, ... },
    "stable": true,
    "reason": "converged"
  }
}
```

## Compute cost & bounding

- Easy configs stabilize at d2↔d3: two `convergePot` runs, each `fine+coarse`, depth d+1 being 4× the subcells of d → roughly **5× a single-depth bake**. Hard configs escalate toward `maxDepth`.
- **Bounds:** `maxDepth` cap (default 5) + optional `budgetMs` wall-clock guard; both surface in `selfCalibration.reason`. Run heavy bakes through `potscope run` for the EcoQoS bump + the new heartbeat/stall visibility.
- **`coarse == floor` edge:** if `coarsenDivisions` can't reduce (already at floors), `coarseDivisions === fineDivisions` → ratio ≈ 1 → a false "irreducible". The driver MUST detect no-reduction (compare coarse vs fine divisions / tri totals) and refuse with `reason:'cannot-coarsen'` rather than emit a bogus verdict.

## Testing

- `coarsenLadder(ladder, step)` — pure; unit-test against a real roster ladder (`rationalStationLadder`/`dyadicEdgeLadder` output): stride-2, endpoints preserved, result is a valid ladder the tessellator accepts.
- `coarsenDivisions` v2 — a division spec with a `verticalStationsByPatch` ladder now yields a coarse ladder (fewer stations) AND records `coarsenedAxes`; a ladder-free patch unchanged.
- `convergePotSelfCalibrated` — driven with a **stub `convergePot`** (dependency-injected or a tiny fake) returning scripted per-depth verdicts: verdicts agree at d2↔d3 → `stable:true, finalDepth:3`; disagree through maxDepth → `stable:false, reason:'max-depth'`; per-patch partial stability recorded. (No real bake in the unit test — the stability logic is the unit under test.)
- Reader — `readConverge` sets `calibrated` from `selfCalibration.stable` when no cert calibration; the muted rendering fires for `stable:false`.
- `convergeconfig` — writes a valid config JSON that `convergePot` accepts (round-trip: build → parse → `atlas` succeeds).

## Validation plan (real bakes — the acceptance evidence)

1. **Reproduce a certified config.** Feed `convergePotSelfCalibrated` the exact `GeometricStar_H32_OD30_fract` config. Expect `stable:true` and per-patch verdicts matching the roster result (inner-wall IRREDUCIBLE) — proving self-calibration agrees with the cert-based calibration where both exist.
2. **A frontier config.** `convergeconfig GeometricStar --relief 0.08 --od 30 --h 32 ...` (higher than the certified 0.02) → a measured verdict on an *open* problem (does the chevron cliff respond to density at higher relief, or is it structurally irreducible → the anisotropic-flank kernel?). Report whatever it says.
3. **Voronoi.** Confirm `convergePotSelfCalibrated` on the Voronoi config reports `stable:false` (never converges) rather than a garbage ratio.
4. **Vertical-coarsening re-validation.** Re-bake the roster with v2 coarsening; report which irreducible verdicts change once vertical is also coarsened (new information).

## Files

**Modify:**
- `research/bridge/_certRosterConvergenceLib.ts` — add `convergePotSelfCalibrated`, `coarsenLadder`, extend `coarsenDivisions` (ladder coarsening + `coarsenedAxes`).
- `research/bridge/_certRosterConvergence.test.ts` — the `PF_CONVERGE_CONFIG` arbitrary-config path + emit `selfCalibration`/`coarsenedAxes`; unit tests above.
- `research/tools/potscope/potscope.mjs` — `convergeconfig` command; `readConverge`/`converge`/`doctor`/`dashboard` calibration-method handling.
- `research/tools/potscope/_potscope.test.mjs` — reader + `convergeconfig` tests.

**New (optional helper):** a small per-style relief-key table for `convergeconfig` (documented as the one legitimately style-specific bit).

## Decisions (locked)

- **Calibration:** verdict-stability across a depth step, bounded auto-escalation (`maxDepth` + `budgetMs`).
- **Input:** JSON file (`PF_CONVERGE_CONFIG`) **and** the `convergeconfig` builder command.
- **Scope:** includes vertical-coarsening v2 (ladder coarsening) — accept the roster re-bake/re-validation it entails.

## Open risks

- **Ladder subsampling** is the implementation's genuine hard part (§B hazard) — pin the representation first; fall back to angular-only + record it rather than emit an invalid ladder.
- **Cost on production-scale frontier configs** — a single self-calibration could be tens of minutes at high `maxDepth`; the `budgetMs` guard + `potscope run` visibility are the mitigations, and an honest `reason:'budget'` beats a wrong verdict.
- **Verdict-stability can plateau at the wrong value** if the field converges pathologically slowly (looks stable across one step but isn't). Mitigate by requiring stability across **two** consecutive steps for a "converged" claim if a single step proves flaky in validation (a cheap tightening, decided by the real bakes).

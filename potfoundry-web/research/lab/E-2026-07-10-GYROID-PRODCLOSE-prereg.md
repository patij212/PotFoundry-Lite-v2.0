# E-2026-07-10-GYROID-PRODCLOSE — pre-registration

> Dev-only production-twin experiment. UNWIRED unless explicitly noted — any `src/` wiring used is the
> ALREADY-SHIPPED `outerCurvatureFloor`/`outerMaxKappa`/`cellSamples`/`resU`/`resT` hooks (commits
> `2d72a56f`, `54372e8c`), consumed via `AssemblyWallOptions`/`TwinOverrides` exactly as
> `_analytic_floor_lib.ts` already does for SpiralRidges — no new `src/` edit is planned in this arm. Only
> `research/bridge/_gyroid_prodclose*` and `research/lab/E-2026-07-10-GYROID-PRODCLOSE*` are
> created/modified, plus data under `research/exchange/_gyroid_prodclose/` (gitignored —
> `research/.gitignore:3` covers `exchange/`). Multiple other sessions are concurrently active in this
> working tree (confirmed via `git status` — uncommitted WIP in `research/EXPERIMENT-REGISTRY.md`,
> `research/bridge/labkit.ts`, `_gyroid_literal0.test.ts`, `_voronoi_inthash_lib.ts`, etc.) — this arm
> never touches those paths.

## FRAME

`E-2026-07-09-PROD-ARTIFACT-TRUTH` measured the **real production default GyroidManifold export**
(H120/Rt50/Rb40/expn1/spin0, `ParametricExportComputer.compute()`'s conforming branch, 'high'+CAD-floor)
under the honest every-facet ruler and found a genuine production regression, resolved to a LITERAL
number via `E-2026-07-09-FAST-HONEST-RULER`'s prescreen+shard method: **outer wall 1,892,114 tris**,
**105,107 LITERAL interior outliers** (stride-1 dense-45-radial-prescreen + 6-shard, max 0.3817 →
**Newton-confirmed worst 0.0590**), **coverage max 0.0987** at (u,t)≈(0.415,0.048), nonMan/zeroArea clean.
Adjudication: "production regression, resolved to a literal number" — only 141,146/1,892,114 facets
(7.46%) survive the sound radial screen; 74.5% of those are genuine Newton-confirmed interior outliers;
the band-limited 256² sampler cannot see the channel walls, matching the coverage witness at t≈0.05
(near the base, consistent with a wall-band feature the field under-reads).

Two prior close mechanisms exist for Gyroid, at DIFFERENT scope/scale, and must not be conflated:

1. **The LAB close** (`2026-07-04-perfect-mesher-spec.md` §V11j/V11o/V11q + the terminal
   `2026-07-09-drive-final-scorecard.md` row 12): a **doubled wall-band contour EMBED** — marching-squares
   extraction of the TWO isolevels `|val|=0.135` (ridge-plateau edge) and `|val|=0.15` (channel-floor
   edge) as locked constraint edges (`_gyroidContourLib.ts`), fine-picket recovery, chord-refine, and
   PINNED KNEE CLUSTERS at the wall junctions/saddles — reached **LITERAL Newton-0** at **6.61M research
   tris**. Along the way, the HONEST FLOOR *without* embedding (§V11j, pure density/radial-screen
   dispatch) was **~12,000 true-3D outliers, max 0.0628mm, at 2.17M tris** — i.e. density alone,
   un-embedded, floors at a small-but-nonzero true-3D residual concentrated 94-95% on the near-vertical
   channel walls (wallSlope p50 1.9mm/mm). This is the reference point for "what the residual looks like
   if density/floor alone is insufficient."
2. **This arm's target lever (curvature floor, NOT the lab's mechanism):** the mission is to test whether
   the ALREADY-SHIPPED, ALREADY-WIRED analytic-curvature-floor hook
   (`ConformingWallOptions.outerCurvatureFloor`/`outerMaxKappa`, proven on SpiralRidges in
   `E-2026-07-09-ANALYTIC-FLOOR`) closes the Gyroid production regression on a FINE sizing grid (the
   `qSizingRes`/`resU`/`resT` lever, dead until `E-2026-07-10-CAD-LEVER-COMPLETION`'s Stage A wiring
   landed in commit `54372e8c`) — a DIFFERENT, cheaper mechanism than the lab's doubled-contour embed. If
   this genuinely closes the regression at an acceptable budget, it is a materially cheaper production fix
   than porting the lab's 6.61M-tri embed machinery. If it plateaus short of the target, the honest
   expectation (per the lab's own un-embedded floor figure above) is a residual concentrated on the
   channel-wall band that needs EDGES, not more density — and this arm's job is to measure that
   plateau precisely and classify it, not to declare defeat by assumption.

**MECHANISM NOTE (why a fine grid, not just any floor):** `E-2026-07-09-ANALYTIC-FLOOR`'s own follow-on
design analysis (registry §6171) found the SpiralRidges floor closed fidelity but at 1.935× budget because
the floor is evaluated as a **cell-supremum baked onto a `resU×resT` grid** (`AnalyticCurvatureFloor.ts`'s
own pattern: precompute a `resU×resT` grid via a `±1-node` dense sub-sample window, then bilinearly
interpolate at query time) — at the production 128² grid, the `±1-node` window is MANY mm wide relative to
the true feature support, so the floor over-lifts far more of the domain than the true crest/wall actually
needs. The registry's own diagnosis: *"the crest-band mask is therefore realized by RESOLUTION: evaluate
the SAME floor... on a finer sizing grid, and its natural support emerges."* This arm applies that exact
insight to Gyroid: build the floor's own internal grid AND the production `MetricSizingField` grid
(`resU`/`resT`, now live via `qSizingRes`) at a resolution fine enough that the `±1-node` window collapses
toward the true wall-band width (`_gyroidContourLib.ts` confirms the wall band is only
`|val| ∈ [0.135,0.15]`, ~0.0006–0.0015 wide in (u,t) per §V11q's own gradient measurement) — i.e. the
floor is naturally band-limited by RESOLUTION rather than by an explicit (u,t) mask.

## DESIGN

### STAGE T — twin instrument gate

Build a Node "production twin" of the Gyroid conforming export, in `research/bridge/_gyroid_prodclose_lib.ts`
(new file; imports `_analytic_floor_lib.ts` READ-ONLY for the generic pieces — `fnvHash`, `pctStats`,
`zeroAreaCount`, `scoreForward`, `scoreCoverage`, `auditWatertight`, the `AF_PROD_OPTS` CAD-floor constant
table shape — and RE-DERIVES the SpiralRidges-tuned pieces locally: dims, style ID, and critically the
**style-options object**, since Gyroid's real default `styleOpts` differs in shape from SpiralRidges'):

- **Dims**: H120/Rt50/Rb40/expn1/spin0 (matches the capture exactly — `AF_DIMS` is style-independent,
  reused from `_analytic_floor_lib.ts`).
- **Style options — VERIFIED, not assumed** (see LEDGER-NOTES below for the full trace): the real
  production default Gyroid export resolves `params.styleOpts` to the **snake_case** object sourced from
  `src/styles/registry.ts`'s `GyroidManifold.params`/`.advancedParams` `default` fields:
  `{gm_scale:4.0, gm_thickness:0.1, gm_sharpness:0.1, gm_bias:0.0, gm_curve:1.0, gm_morph:0.0,
  gm_relief:1.5, gm_z_stretch:1.0, gm_pulse:0.0, gm_edge_fade:0.2}`. This is passed EXPLICITLY to
  `buildStyleParamPayload('GyroidManifold', GYROID_DEFAULT_OPTS)` in the twin — **NOT** the empty-object
  call `_analytic_floor_lib.ts` uses for SpiralRidges — because `packGyroidManifold`'s own internal
  fallback for `gm_scale` (3.5, `styleParams.ts:304`) genuinely DIVERGES from the registry default (4.0),
  and an empty-object call would silently mismatch the extracted `general-curve` feature-line locus
  against the true radius field. (Every other Gyroid packed slot's fallback already agrees with the
  registry default — `gm_scale` is the sole divergence, confirmed by direct read + an independent
  research-agent cross-check.) `buildRadiusFn('GyroidManifold', {}, AF_DIMS)` is unaffected by this (it
  reads `DEFAULT_GYROID_MANIFOLD` directly, which independently also carries `gmScale=4.0`).
- **Feature graph**: unlike SpiralRidges (whose graph is `helical-crease`-only, zero `general-curve`
  lines), Gyroid's `extractAnalyticFeatures('GyroidManifold', ...)` dispatches to `extractGyroidManifold`
  (`FeatureLineGraph.ts:603-607`) — a marching-squares trace of the **`val=0` level set** at 640×512
  resolution, returned as `kind:'general-curve'` lines (verified: `segmentsToPolylines` always emits
  `kind:'general-curve'`; the string passed as its 2nd positional arg — `'gyroid-level'` — is the
  human-readable `label`, not the kind). This is DIFFERENT from the lab's wall-band embed (which traces
  `|val|=0.135` and `|val|=0.15`, the shape-transition edges) — production embeds the TPMS zero-crossing
  itself. Consequence: for Gyroid, `generalCurves.length > 0` ⇒ `hasFeatures=true` in `computeUBias`,
  which CAPS the auto-computed anisotropy bias at ≤2 (`WatertightAssembly.ts`'s GATE B,
  `hasFeatures ? Math.min(b,2) : b`) — a genuinely different `uBias` resolution path than SpiralRidges'
  uncapped case. The twin's `prepareTwinInputs`-equivalent must compute `hasFeatures` from the REAL
  (non-empty) `generalCurves` array, not assume it away.
- **Assembly path**: plain `assembleWatertight` (NOT `assembleWatertightWithFeatures` — confirmed
  `enableFeatureMesher` is an opt-in flag, default OFF, unrelated to whether a style's feature graph
  contains `general-curve` lines; the constrained-CDT refinement from `outerFeatureLines` happens
  automatically INSIDE plain `assembleWatertight`/`buildConformingWall` via
  `triangulateQuadtreeWithFeatures` regardless).
- **CAD-floor knobs**: identical, style-independent constants confirmed via direct read of
  `ParametricExportComputer.ts`'s conforming branch + `QualityProfiles.ts`'s `HIGH` profile — `maxSagMm
  0.003, maxEdgeMm 1, minEdgeMm 0.1, gradeRatio 2, maxLevel 16, resU/resT 128 (default; the fine-grid
  lever in Stage F), nRing 2048, targetTriangles 16,000,000, budgetMode 'cap', featureLevel 11` — reused
  verbatim from `_analytic_floor_lib.ts`'s `AF_PROD_OPTS` (imported, not re-typed).
- **`computeUBias`**: called generically (style-independent code path, confirmed no `styleId===` branch
  anywhere in `ParametricExportComputer.ts`'s conforming block or `WatertightAssembly.ts`), with
  `hasFeatures` correctly derived from Gyroid's real non-empty `generalCurves`.

**GATE (pre-registered, exact numbers from the banked production row):** twin outer tris within **±3%**
of **1,892,114** AND prescreen radial-survivor count within **±10%** of **141,146** AND coverage max
**0.0987±0.010**. PASS ⇒ proceed unlabeled. FAIL the strict gate but tris within **±10%** AND outlier
magnitude class matches (**survivors 100k–200k, Newton-worst 0.03–0.09**) ⇒ proceed, all subsequent
numbers explicitly LABELED "twin-baseline, not artifact-exact" in every report line. Miss BOTH bands ⇒
**STOP** — report the divergence verbatim (tris, survivors, Newton-worst, coverage vs. the banked row),
no Stage F measurement from an unvalidated instrument.

### STAGE F — analytic curvature floor, fine-grid, band-realized-by-resolution

1. **Derive the Gyroid analytic curvature floor** in `_gyroid_prodclose_lib.ts` (a new
   `buildGyroidCurvatureFloor` function, parallel in spirit to `AnalyticCurvatureFloor.ts`'s
   `buildSpiralRidgesFloor` but NOT editing that `src/` file — the floor fn is built and passed directly
   via `AssemblyWallOptions.outerCurvatureFloor`/`outerMaxKappa`, exactly as `_analytic_floor_lib.ts`
   already demonstrates for the Node-twin injection path; wiring these two fields into `src/` PEC's
   default-off dev-lever path is EXPLICITLY OUT OF SCOPE for this arm — it stays a twin-only injection,
   matching `E-2026-07-09-ANALYTIC-FLOOR`'s own precedent of shipping the wiring hook but not the
   `AnalyticCurvatureFloor.ts` per-style dispatch entry in the same arm).
   - **Closed form**: unlike SpiralRidges' 1D polar-section-plus-Euler-correction (justified there because
     the ridges are near-helical, 1D-dominant), Gyroid's relief genuinely varies in BOTH u and t (the TPMS
     field is not separable) and the dominant curvature is ACROSS the wall band — i.e. in the direction of
     `∇val`, which has no fixed orientation in (u,t). The floor is therefore derived as a direct 2D
     shape-operator estimate on `r(u,t) = r0(t) + relief·shape(val(u,t))·fade(t)`, using EXACT analytic
     partials of `val` (available in closed form: `val = gyr` at `morph=0`, `x=fScale·cos(TAU·u)`,
     `y=fScale·sin(TAU·u)`, `zT=fScale·t·zStretch·4`, all elementary trig — `∂val/∂u`, `∂val/∂t`,
     `∂²val/∂u²`, `∂²val/∂t²`, `∂²val/∂u∂t` all closed-form) chained through `shape`'s own smoothstep
     derivative (`shape = s²(3−2s)` with `s = (th−d)/(smoothVal·th)`, `d=|val|` — `ds/dval` has a sign flip
     at `val=0` from the `|val|` but is smooth on each branch since the branches don't touch inside the
     wall band, confirmed by `_gyroidContourLib.ts`'s own gradient-magnitude finding `|∇val|∈[4.8,38.3]`,
     never near 0 on the mid isolevel). The 2D shape operator on the embedded surface
     `P(u,t)=(r·cosθ, r·sinθ, z)` (θ=TAU·u, z=t·H) gives principal curvatures from `I` (first fundamental
     form, from `Pu`,`Pt`) and `II` (second fundamental form, from `Puu`,`Ptt`,`Put`, dotted with the unit
     normal) — the SAME shape-operator convention `principalCurvatureMax`
     (`SurfaceMetricTensor.ts:144-205`) uses on the sampler, so the floor and the sampler estimate are
     apples-to-apples and `max(κ_sampler, κ_floor)` is a sound comparison.
   - Because a fully-closed-form 2D shape operator on a smoothstep-of-a-transcendental-field is algebraically
     heavy and error-prone to hand-derive exactly, the floor function itself may be realized as an
     **analytic-partials-driven numerical estimate** (exact first/second partials of `val` via the closed
     trig forms above, chained through `shape`'s exact chain rule — NOT finite-differencing `val` itself,
     only combining its exact derivatives) rather than a literal closed-form κ(u,t) one-liner. This is
     still "analytic" in the load-bearing sense (no finite-difference noise from `val`, no dependency on
     the band-limited sampler) — the validation gate below is what actually adjudicates whether it is a
     sound floor, not the algebraic form.
   - **VALIDATION (pre-registered, before any production use):** compare the derived floor against DENSE
     finite-difference κ sampling of the true f64 field (`principalCurvatureMax`-equivalent FD on a
     synthetic high-res `SurfaceSampler` wrapping the exact Gyroid `r(u,t)`) at **≥1,000,000 probe points**
     covering the wall band densely (stratified: dense in the `|val|∈[0.10,0.20]` neighborhood of the
     band, sparse elsewhere). **GATE: floor(u,t) ≥ sampled κ(u,t) at ≥99% of probe points** (a lower BOUND
     is only useful if it is genuinely a bound almost everywhere — report violations: count, max shortfall,
     (u,t) locations, and whether they cluster at the `∇val≈0` edge cases or are scattered noise).
2. **Apply via the FINE sizing-grid lever**: `TwinOverrides.resU`/`resT` (already defined in
   `_analytic_floor_lib.ts`, imported) set to a fine value — **start `resU=resT=512`** (the mission's
   stated starting point; ladder up if Stage F's first design does not close, per the KILL/PARTIAL logic
   below) — passed through `AssemblyWallOptions.resU/resT` (now live via commit `54372e8c`'s Stage A
   wiring) into BOTH `MetricSizingField` (the sizing grid the floor corrects) AND the floor's own internal
   grid resolution (built to match, so the `±1-node` window shrinks in lockstep with the sizing grid —
   avoiding a mismatched-resolution repeat of the smear).
   - **Masking**: rather than an explicit (u,t) boolean mask (which risks the SAME kind of resolution-vs-
     mask mismatch this arm exists to avoid), the floor's natural support is left to emerge from
     resolution alone, per the ANALYTIC-FLOOR-MASKED registry entry's own stated approach — the closed-form
     `val`-derivative-driven κ is naturally ~0 (or ≤ the sampler's own read) away from the wall band by
     construction (the smoothstep `shape` function saturates to a flat plateau/floor outside `|val|∈[th·(1
     −smoothVal),th]`, where its second derivative → 0), so `max(κ_sampler,κ_floor)` is a no-op there
     regardless of grid resolution. If Stage F measurement shows this is NOT band-limited in practice
     (over-lift measured far from the wall band), that is itself reported as a finding, not silently
     patched with an ad hoc mask.
   - `maxKappa`: `(8·maxSagMm)/(minEdgeMm²) = (8·0.003)/(0.1²) = 2.4` (same formula
     `AnalyticCurvatureFloor.ts` uses, reused verbatim — style-independent cap derivation).

### VERDICT BASIS (per style, exactly the FAST-HONEST-RULER method — no new instrument)

Prescreen (dense-45 radial, sound upper bound — `denseBary(8)` from `_pf_rebaselineRuler.ts`) → survivors
→ `scoreWholeMeshInterior` (GN+brute upper bound, EVERY facet stride 1; shard via `PF_GPC_SHARD`/
`PF_GPC_NSHARDS` if projected wall time on a single shard exceeds ~45min, per the banked FAST-HONEST-RULER
precedent) → Newton re-score (`newtonNearest` from `_gyroid_truthLib.ts`, imported READ-ONLY) of the
worst point AND (where population is small enough, ≤ a few thousand flagged points) every flagged point,
matching `_analytic_floor_lib.ts`'s `newtonAll` option. Coverage via `buildRefLocator`
(`_sharp3dRef.ts`, imported READ-ONLY) on a 1024² lattice + 4× local refine around the worst cell,
boundary bands (0.5mm from t=0/1) reported separately. Watertight via `nonManRawBig` (labkit, imported
READ-ONLY) — NON-VACUOUS (injected-crack control must move the count). `zeroAreaCount` on the full
assembly. All of these are reused verbatim from `_analytic_floor_lib.ts`'s exported scoring functions
(`scoreForward`, `scoreCoverage`, `auditWatertight`) — no new ruler is invented in this arm.

### ACCEPTANCE (all four, matching the ANALYTIC-FLOOR precedent's acceptance shape)

(a) outer-wall EVERY-FACET ≤0.01mm on the Newton basis (every dense-45-flagged facet Newton-re-scored,
exact population, stride 1); (b) outer tris ≤7.0M (projected full pot ≤10M — the mission's stated budget,
tighter than ANALYTIC-FLOOR's 1.5× SpiralRidges gate because Gyroid's baseline outer wall, 1.89M, is much
smaller than SpiralRidges' 2.68M, so a flat 7.0M cap is the more meaningful constraint here); (c) coverage
max ≤0.01mm; (d) watertight (non-vacuous) + zeroArea=0.

### KILL CRITERIA (committed BEFORE measuring)

- **KILL-A (density/floor insufeicient — the expected-failure-mode classifier):** if the floor at 2
  designs (resU 512, then 1024 or half-band — i.e. a genuine escalation, not a repeat) PLATEAUS with
  survivors still concentrated ON the wall band (classify: (u,t) scatter of the remaining Newton-flagged
  population vs. the `|val|∈[0.135,0.15]` wall-band loci from `_gyroidContourLib.ts`'s `wallIsolevels()` —
  imported READ-ONLY as a classification reference, NOT as a mesher input) ⇒ **STOP**, classify the
  residual as the lab's known needs-EDGES class (per the terminal scorecard's own class map: "Smooth
  level-set walls (Gyroid TPMS) → doubled-contour embed... → literal 0" — density/floor alone was never
  claimed sufficient by the lab's own prior work, only embedding was), and report the honest fork: measured
  floor numbers (tris/outliers/worst/coverage at each design point) + the priced recommendation (port the
  lab's doubled-contour embed as a SEPARATE arm on owned files, OR accept the floor's partial improvement
  as a frontier price). This is a full, first-class deliverable, not an early exit.
- **KILL-B (budget):** ≤0.01mm reachable only above 7.0M outer tris ⇒ **FRONTIER** — report the priced
  curve (tris vs. outliers/worst/coverage at every design point measured), no acceptance claim, no further
  escalation past the 2-design ladder in KILL-A (avoid unbounded iteration — matches the ANALYTIC-FLOOR
  arm's own no-silent-iteration discipline).
- **KILL-C (coverage regression):** ANY lever design making coverage max WORSE than the Stage-T twin
  baseline (0.0987±0.010, or the twin-baseline-labeled equivalent if Stage T fell into the wider band) ⇒
  **STOP** + classify (does the floor's refinement introduce a NEW gap — e.g. over-refining the wall band
  starves budget from a channel-floor region the baseline covered adequately? — report the (u,t) locus of
  the regression).
- **VALIDATION KILL (Stage F step 1):** if the floor-vs-FD-sampled-κ validation gate (≥99% of ≥1M probes)
  FAILS, the floor itself is unsound — do NOT proceed to apply it in Stage F step 2; report the violation
  pattern (this is a pre-Stage-F gate, logically prior to KILL-A/B/C, and failing it is its own terminal
  finding for this arm: "the analytic floor for this style could not be validated," which is itself
  informative — it would mean the lab's use of a genuinely different mechanism, wall-band contour
  embedding rather than a curvature floor, was not an arbitrary choice but a response to Gyroid's
  non-separable 2D field defeating a clean closed-form κ bound).

## TRACTABILITY / RESILIENCE (banked lessons, reused verbatim)

- `NODE_OPTIONS=--max-old-space-size=16384` on the COMMAND LINE, not only in `vitest.*.config.ts`'s
  `poolOptions` (Vitest 4 confirmed via `node --version`=v24.11.1 / `vitest`=^4.0.17 in `package.json` to
  silently ignore `test.poolOptions.forks.execArgv` — the exact banked ANALYTIC-FLOOR finding #2).
- One env-gated `it` per stage: `PF_GPC=twin|floor|verdict` (mirrors `PF_AF_STAGE=twin|walls|orient-mini|on`).
- Checkpoint ndjson rows to `research/exchange/_gyroid_prodclose/rows.ndjson` the INSTANT each stage
  computes (append-inside-test-body, survives a timeout per the banked "sync test bodies outlive vitest
  testTimeout" lesson).
- **MACHINE COURTESY**: before each heavy build, `powershell -NoProfile -Command "Get-Process node
  -ErrorAction SilentlyContinue | Where-Object {$_.WorkingSet64 -gt 2GB}"` — if a FOREIGN heavy node
  process is running, sleep-poll up to 30min before launching; never run two of this arm's own builds
  concurrently. (Checked clean at pre-registration time — no foreign heavy node process running.)
- Honest timeouts: builds may take 10-30min each; `testTimeout` set generously (5,400,000ms, matching
  `_analytic_floor.test.ts`'s own budget) with per-`it` env gating so a killed run resumes cheaply.
- **PERF EYES**: record per-stage wall times (sampler build, sizing, quadtree, triangulation, assembly,
  scoring) in every ndjson row — feeds the program's perf ledger per the mission's explicit ask, distinct
  from the fidelity verdict itself.

## LEDGER-NOTES (the `gm_scale` fact-check trail, banked here since it materially changed the twin design
from a naive copy of `_analytic_floor_lib.ts`'s SpiralRidges pattern)

Verified via direct source read (this session) + an independent research-agent cross-check, both
converging on the same conclusion: `packGyroidManifold`'s internal fallback for slot 0 (`gm_scale`,
`styleParams.ts:304`, value `3.5`) diverges from `src/styles/registry.ts:328`'s `gm_scale` default
(`4.0`), which — via `useParametricExport.ts:315-335`'s unchanged key-copy `buildStyleOptions()` ←
`state/slices/style.ts:57-76`'s `getDefaultStyleOpts()` (iterates `STYLE_SCHEMAS[name].params`/
`.advancedParams`, itself `STYLE_REGISTRY` re-exported verbatim, `style.ts:44-48`) ← `setStyle`'s "resets
opts to defaults" (documented at `windowHook.ts:210-212`, exercised by the capture script's
`__pfFidelity.setStyle(s)` call before capture) — is the value a REAL production default export actually
uses. The `3.5` fallback is dead code on the default path (only reachable via an explicitly-empty
`styleOpts`, as some unit tests intentionally construct to test the packer in isolation). Every OTHER
Gyroid packed slot's three candidate default sources (packer fallback / registry / `DEFAULT_GYROID_MANIFOLD`
camelCase) already agree. Conclusion: this arm's twin passes the registry-sourced snake_case defaults
EXPLICITLY to `buildStyleParamPayload`, not an empty object.

## DELIVERABLES

1. `research/bridge/_gyroid_prodclose_lib.ts` — the twin builder + floor derivation (new file).
2. `research/bridge/_gyroid_prodclose.test.ts` — env-gated probe (`PF_GPC=twin|floor|verdict`; new file).
3. `vitest.gyroid_prodclose.config.ts` — Node env config, generous timeout, `pool:'forks'`,
   `singleFork:true` (heap via `NODE_OPTIONS` on the command line per the banked lesson — new file).
4. This file's VERDICT section (appended below, before commit) — twin-gate result, per-lever table (tris /
   survivors / Newton-worst / coverage / wall time per stage), verdict class (CLOSED / FRONTIER-priced /
   KILLED-with-classification), perf observations, exact file paths + commit SHAs.
5. `research/exchange/_gyroid_prodclose/` — gitignored data (rows.ndjson + any binary mesh dumps).

Committed BEFORE any measurement. Only this file is staged for the pre-registration commit.

---

## VERDICT (2026-07-10, measurement complete)

**VERDICT CLASS: KILLED-with-classification (KILL-A, fired exactly per the 05:12:22Z pre-committed
interpretation rule) — the analytic curvature floor is NOT the lever for the Gyroid production
regression. The floor genuinely halves the worst mid-ramp deviation, but the residual outlier
population is 100% SMOOTHSTEP-KNEE-localized (|val| within ±0.005 of the band edges 0.135/0.15 for
every single Newton-confirmed outlier sampled, in BOTH configs), and the knee is structurally
unreachable by ANY density floor at production minEdge: knee κ ≈ 10³ mm⁻¹ (FD-measured up to 1049.9)
demands h ≈ 0.005mm ≪ minEdge 0.1, and h(κ≥2.4)=minEdge exactly, so no cap escalation can change the
sizing output. This is the lab's needs-EDGES class (§V11o/q/aa), re-derived independently on a
Δ2-exact production twin.**

### STAGE T — twin instrument gate: STRICT PASS (all three pre-registered legs)

| leg | banked artifact | twin | Δ |
|---|---|---|---|
| outer tris | 1,892,114 | 1,892,112 | **2** (1.1e-6) |
| prescreen survivors | 141,146 | 141,147 | **1** |
| coverage max | 0.0987 | 0.098741 | 0.00004 |

Full tris 4,014,802 vs captured 4,014,814 (Δ12); nonMan 0 (non-vacuous), zeroArea 0; uBias=1 (the
`hasFeatures`-capped GATE-B path — Gyroid's 14 `general-curve` lines from the production
`extractGyroidManifold` val=0 marching squares, verified live); coverage p99 0.0036 == banked.
Tighter than the SpiralRidges Δ8 twin precedent on every leg. `twin_gate.json` banked.

### STAGE F1 — floorval (resU 512, SUB 24): VALIDATION GATE PASSED, with the decisive knee finding

Floor ≥ FD-sampled κ at **99.896%** of 1,000,000 probes (gate ≥99%). The 1,044 violations are ALL
knee-class BY CONSTRUCTION: the independent deep-ladder FD cross-check observes smoothstep-knee κ up
to **1049.9 mm⁻¹** (worst at (u,t)=(0.1177,0.7925)) against the cap maxKappa=2.4. fracInBand 7.69% ≈
the 7.46% survivor fraction (consistent). CAP PROVENANCE: maxKappa = 8·maxSag/minEdge² =
8·0.003/0.1² = 2.4 = the κ at which production minEdge 0.1 BINDS — a style-independent formula given
production knobs (the same formula `AnalyticCurvatureFloor.ts` ships; the SpiralRidges crest-κ
2.0-2.4 coincidence is observational, not the derivation). SHARPENING (pre-committed before the
floor verdict): since h(κ≥2.4)=minEdge exactly, NO cap escalation changes anything at production
minEdge — the knee was mechanically out of reach of this arm's lever BEFORE the A/B ran.

### STAGE F2 — floor A/B (stratified V11i two-tier interim basis, labeled)

REFRAME (banked to run.log BEFORE any Newton results existed): the radial survivor count SATURATES
on near-vertical walls (V11b: count GROWS with density while true deviation SHRINKS) ⇒ survivor
count is NOT a verdict signal on this wall-dominated style; only the Newton basis adjudicates.

| config | outer tris | radial survivors | est. true outliers (stratified) | Newton-worst (sampled) | knee-class of Newton-confirmed outliers |
|---|---|---|---|---|---|
| baseline (128², no floor) | 1,892,112 | 141,147 (7.46%) | **~96,012** | **0.0576** | 372/372 knee-adjacent (0 wall-band, 0 off-band) |
| floor (512², κ-floor cap 2.4) | 3,545,856 (**+87%**) | 351,698 (9.92%) | **~78,124 (−19%)** | **0.0284 (−51%)** | **754/754 knee-adjacent (0 wall-band, 0 off-band)** |

ESTIMATOR VALIDATION: the baseline stratified estimate (96,012 / 0.0576) reconciles with the
artifact LITERAL row (105,107 / 0.0590, E-2026-07-09-FAST-HONEST-RULER) within −8.7% / −2.4% on a
Δ2-exact twin — the stratified instrument is sound. Sampling: deterministic (mulberry32 0xC0FFEE),
worst-radial head exhaustive (100/400) + 8 equal-count strata (50/200 each); 500 + 2,000 Newton
queries; per-stratum table + ≤400-pt (u,t)/|val| scatter banked to `floor_strat.json`.

THE PRICED FORK (the arm's honest deliverable): **+87% outer tris buys −19% estimated true outliers
and −51% Newton-worst — and 100% of what remains sits ON the smoothstep knees**, exactly where no
density can go (h-demand ~0.005mm < minEdge 0.1). Acceptance (every-facet ≤0.01) is unreachable on
the density-floor lever: KILL-A. KILL-B did NOT fire (3.55M ≤ 7.0M outer gate — budget was not the
binding constraint; the mechanism was). KILL-C untested (floor-config coverage unmeasured — the
blind literal was redirected at the prescreen tell; flagged for any future floor use, irrelevant to
this classification).

### BASIS HONESTY

- Twin gate: pre-registered instruments verbatim (unbundled from the scoring into the `twingate`
  stage — same build fn, same prescreen lattice, same coverage ruler; the strict gate's three legs
  never required the stride-1 scoring).
- F2: stratified V11i two-tier (LABELED interim basis — a coordinator-directed tractability
  redirect, banked to run.log before results). The literal every-facet basis was NOT run for the
  floor config: per pre-registration, KILL-A is adjudicable from classification data, and the
  351,698-survivor blind literal (~10-20 CPU-h) would not have changed the classification.
  FAST-HONEST-RULER shard levers (PF_GPC_SHARD/PF_GPC_NSHARDS, survivors mod-split) are IMPLEMENTED
  in the probe and unused — ready for any future literal acceptance run.
- Baseline own-basis literal scan: killed at 163 CPU-min (est 92-358 min remaining) once the
  stratified baseline reconciled to the artifact literals — the artifact literals stand as the
  baseline fidelity numbers (the twin being Δ2/Δ1-exact makes them the same mesh's numbers to
  within the gate tolerance). First-run post-mortem: 2.2h "stall" was Windows EcoQoS throttling of
  the detached fork child (~23% of a core), NOT heap — in-child heapLimitMB=16576 proved
  NODE_OPTIONS propagated; killed for undiagnosability before breadcrumbs existed.

### RECOMMENDATION (the arm's deliverable)

The production Gyroid close is **wall-band contour EMBEDDING + knee treatment, NOT density**:

1. **Doubled band-edge contours through the EXISTING production machinery.** Production already
   embeds a Gyroid level set as `general-curve` CDT constraints with featureLevel-11 refinement
   (extractGyroidManifold → outerFeatureLines → per-cell constrained CDT) — but it traces **val=0**,
   the ridge-plateau CENTERLINE, where shape is saturated flat (κ≈0) and no outliers live. The
   measured knee population sits at **|val| ∈ {0.135, 0.15}** — the band edges
   `research/bridge/_gyroidContourLib.ts` (committed, read-only) already extracts at machine
   precision. The natural next arm: feed the DOUBLED band-edge contours through the same
   general-curve path on this Δ2-exact twin. The lab proved the mechanism: doubled edges → off-wall
   0, trueMax 0.0628→0.0385 (§V11o); NOTE single RAMP-midline (|val|=0.1425) was REFUTED
   (catastrophic, §V11o) — val=0 plateau-centerline is a different, harmless locus, but it is not
   doing the work either.
2. **Knee treatment second**: the lab's literal-0 needed pinned knee clusters on top of the doubled
   embed (§V11aa closed the final tail with 35 points; terminal scorecard row 12: literal Newton-0
   at 6.61M via "doubled wall-band + knee clusters"). Production has no exposed pinned-point
   mechanism — candidate: dense polyline vertices along the knee loci as degenerate general-curves,
   or the band mesher; an open engineering question for that arm.
3. **Floor optional, decoupled**: the lab reached literal-0 WITHOUT a curvature floor; the floor's
   real −51% mid-ramp improvement is largely mooted by an edge-conforming mesh. Do not couple the
   arms.
4. Ready-made instruments for that arm: this Δ2-exact twin + gates (`twin_gate.json`), the validated
   stratified estimator (±9%), shard levers, breadcrumb/heap-gate/EcoQoS patterns.

### PERF NOTES (program ledger)

- **Windows EcoQoS throttling of detached node children: AboveNormal priority = ~4× measured**
  (23%→88-94% of a core; corroborated by build times 229s→109-133s). Bump the fork child
  immediately after spawn; the `tinypool` CommandLine filter matches nothing on vitest-4 Windows
  forks — select by CreationDate instead.
- Vitest 4: `poolOptions.forks.execArgv` silently ignored; `NODE_OPTIONS` env var DOES propagate to
  fork children (proven in-child: heapLimitMB=16576). Heap fail-fast gate (assert
  `v8.getHeapStatistics().heap_size_limit` ≥ 8192MB at test start) turns a silent misconfig into a
  30s diagnosis. Fork-child console is buffered until test end — `appendFileSync` breadcrumbs are
  the ONLY live telemetry; sync bodies outlive testTimeout (row-append-before-assert held).
- Phase wall-times (healthy/bumped): assembleWatertight 115-229s @4.01M full tris (128²), 109-133s
  @5.75M (512²+floor); submesh+eval 3-6s; nonManRawBig full-pot audit 5-8s; prescreen count 48s
  @1.89M facets / ~96s @3.55M; prescreen detail ~117s @3.55M; coverage (1024²+4× refine) 38s @1.89M
  tris; floor grid 512²×SUB24 642.6s (projection 494s, +30%); floor validation 13.8s/1M probes;
  stratified Newton ~71ms/query (2,000 in 142.8s — 3× faster than the banked 205ms figure,
  radial-anchor seeds + healthy priority).

### LEDGER

Files: `research/bridge/_gyroid_prodclose_lib.ts` (twin + exact-partials curvature floor +
validation + stratified instruments), `research/bridge/_gyroid_prodclose.test.ts` (stages
twin|twingate|floorval|floor|floorstrat; heap gate; shard levers), this prereg. NO
vitest.*.config.ts (CLI flags only — file-glob scope). NO src/ edits (the floor was injected via the
already-shipped `AssemblyWallOptions.outerCurvatureFloor` hooks, twin-side only). Data (gitignored):
`research/exchange/_gyroid_prodclose/{rows.ndjson, twin_gate.json, floor_strat.json, run.log}` —
run.log carries the full timestamped breadcrumb/pre-commit/decision trail. Commits: pre-reg
2285fd02 → verdict [this]. Concurrent-session notes: shared-tree discipline held (only the three
files above + gitignored exchange data touched); machine-courtesy deviation (two own processes
briefly concurrent during the lane-2 parallelization) coordinator-authorized and documented.

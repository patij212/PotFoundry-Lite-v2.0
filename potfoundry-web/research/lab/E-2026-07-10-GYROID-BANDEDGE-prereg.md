# E-2026-07-10-GYROID-BANDEDGE — pre-registration

> Dev-only production-twin experiment. Direct follow-up to `E-2026-07-10-GYROID-PRODCLOSE` (parent
> arm; read its VERDICT below). UNWIRED — no `src/` edit is planned in this arm. The doubled
> band-edge contours are injected purely by OVERRIDING the `generalCurves` array the twin builds
> before it is passed to `AssemblyWallOptions.outerFeatureLines` — a research-side substitution at
> the exact seam `_gyroid_prodclose_lib.ts`'s `prepareGpcTwinInputs()` already exposes (production's
> `ConformingWallOptions.featureLines`/`ConformingWall.ts`'s `triangulateQuadtreeWithFeatures` accept
> any `FeatureLine[]` regardless of `kind` or which extractor produced it — verified by direct read,
> no dispatch on `kind==='general-curve'` vs any other value anywhere in the consuming per-cell CDT
> path). Only `research/bridge/_gyroid_bandedge*` and `research/lab/E-2026-07-10-GYROID-BANDEDGE*`
> are created/modified, plus data under `research/exchange/_gyroid_bandedge/` (gitignored —
> `research/.gitignore:3` covers `exchange/`). Multiple other sessions are concurrently active in
> this working tree (confirmed via `git status --short` — uncommitted WIP in
> `research/EXPERIMENT-REGISTRY.md`, `research/LAB-CHEATSHEET.md`, `research/CROSS-WORKSTREAM-NOTES.md`,
> `research/bridge/labkit.ts`, `_voronoi_embed.test.ts`, `_pf_tangledKernelLib.ts`, etc.) — this arm
> never touches those paths, and never runs `git add -A`/`-u`.

## FRAME

`E-2026-07-10-GYROID-PRODCLOSE` built a Δ2-exact production twin of the shipped GyroidManifold
conforming export (H120/Rt50/Rb40/expn1, 'high'+production defaults) and tested whether the
ALREADY-SHIPPED analytic-curvature-floor lever (`AssemblyWallOptions.outerCurvatureFloor`/
`outerMaxKappa`, fine `resU`/`resT` sizing grid) closes the measured production regression
(baseline: outer wall 1,892,112 tris, prescreen survivors 141,147 (7.46%), **stratified-estimated
~96,012 true outliers, Newton-worst 0.0576mm**, reconciling within −8.7%/−2.4% of the artifact
LITERAL row 105,107/0.0590 from `E-2026-07-09-FAST-HONEST-RULER`). **VERDICT: KILL-A** — the floor
genuinely helps (+87% tris → −19% est. outliers, −51% Newton-worst at resU=512) but **100% of the
Newton-confirmed residual in BOTH configs (372/372 baseline, 754/754 floor) sits within ±0.005 of
the wall-band edges** `|val| ∈ {0.135, 0.15}` — the smoothstep KNEE, where FD-measured curvature
reaches up to 1049.9 mm⁻¹ against a production cap of 2.4 mm⁻¹ (`maxKappa = 8·maxSagMm/minEdgeMm² =
8·0.003/0.1² = 2.4`, the κ at which minEdge=0.1 mechanically binds). **No density floor can move
this population — `h(κ≥2.4) = minEdge` exactly, so escalating the cap is a no-op.** This is
structurally the SAME defect class the lab closed via EDGES, not density, in
`2026-07-04-perfect-mesher-spec.md` §V11o/§V11q (registry `E-2026-07-08-GYROID-CONFORMING-CLOSE` /
`E-2026-07-08-GYROID-POLISH`): the parent arm's own DECISIVE finding also independently confirmed
that **production's existing `extractGyroidManifold` general-curve embed traces the `val=0`
PLATEAU-CENTERLINE** (14 lines, `hasFeatures=true`, `uBias` capped ≤2 via `computeUBias`'s GATE B) —
a locus where `shape` is saturated flat (κ≈0, no outliers live there) — **not** the working
`|val| ∈ {0.135, 0.15}` band edges the lab's mechanism actually needed. Production has NEVER fed the
correct contours through its own feature machinery. This arm does exactly that.

**The lab's own precedent, scaled context for this arm's acceptance bar:**

- §V11o (DOUBLED wall-band embed, step 0.15, 1.5M research tris): honest un-embedded floor
  ~12,000 true-3D outliers (max 0.0628) → **off-wall 0/46, ~2,133 on-wall residual, trueMax 0.0385**
  (halved). SINGLE-midline (`|val|=0.1425`) was **REFUTED catastrophically**: 90% OFF-wall
  (285/318), trueMax 0.321, zeroArea 57 — a single ramp-middle constraint forces facets to bridge
  ridge→wall→floor on BOTH sides. The doubled pair (top+bottom of the ramp) lets near-vertical ramp
  facets span cleanly between two real edges — **this is why the design below embeds BOTH isolevels,
  never a midline, and never only one.**
- §V11q (chord-refine, no mid-rung): drove the doubled-embed mesh to **whole-mesh p99 0.00918 (<tol),
  trueMax 0.0206, ~583 on-wall outliers (irreducible near-vertical ramp chord-Steiner floor)** at
  4.4min build. Mid-rung (a THIRD constraint line at the band midline, ADDED not replacing the pair)
  was **also REFUTED** — REGRESSED to trueMax 0.312, 69% off-wall: the band is only ~0.001 wide in
  (u,t), so a third near-coincident parallel line over-constrains the triangulation.
- §V11aa (referenced in the parent arm's recommendation; the `_gyroid_knee` exchange data this
  session found, tag `K0c`, confirms independently): **pinned knee clusters (35 points) on top of
  the doubled embed reached literal Newton-0 at 6,612,759 research tris** (`newtonOutliers:0,
  trueMax:0` in the banked `verdict.ndjson`, confirmed by direct read this session). Production has
  NO exposed pinned-point mechanism — this arm's job is to measure how far contours ALONE (no pins)
  get on the production twin, not to port the pin mechanism.

**This arm's question:** feed the CORRECT doubled band-edge contours (both isolevels, machine-precision
placed via `_gyroidContourLib.ts`, already committed and read-only) through production's EXISTING
`outerFeatureLines`/`featureLevel`-11 per-cell constrained-CDT machinery — untested at this contour
density (~tens of thousands of points vs. the 14-line val=0 centerline it has only ever seen) — on the
Δ2-exact twin, and measure whether the ~96,012-outlier / 0.0576mm-worst knee-adjacent population closes,
shrinks, or the machinery itself chokes. Floor is explicitly NOT combined in this arm (contours-first,
per the parent's own recommendation #3: "the lab reached literal-0 WITHOUT a curvature floor").

## DESIGN

### STAGE E — extract (band-edge contours at the twin's exact params)

1. Build `GyroidFieldParams` (for `_gyroidContourLib.ts`'s `gyroidVal`/`marchAbsIso`/etc.) from the
   SAME production defaults `_gyroid_prodclose_lib.ts`'s `GPC_FIELD` already uses —
   `{fScale:4.0, zStretch:1.0, pulse:0.0, morph:0.0, bias:0.0, thickness:0.1, smoothVal:0.1}` — the
   `gm_scale=4.0` production default the parent arm verified (NOT `packGyroidManifold`'s internal
   fallback 3.5). `wallIsolevels()` on this param set must report `inner=0.135, outer=0.15` — asserted
   before any extraction (a one-line sanity gate; already hand-verified this session:
   `0.1·1.5·(1−0.1)=0.135`, `0.1·1.5=0.15`).
2. For **both isolevels** `c ∈ {0.135, 0.15}` independently: `marchAbsIso(c, params, {nu, nt,
   polishIters})` at the lab's proven grid (start `nu=nt=1200`, matching §V11o/q's own extraction
   grid — the "1200-res marching squares yields ~25k vertices/isolevel" figure the contour lib's own
   header documents) → `linkSegments` → `refineAndFilterContours(contours, c, params, valTol=1e-4)`
   (drops any vertex that cannot polish to `|val|-c|` ≤ 1e-4, splitting its polyline — report
   dropped/kept counts, a >1% drop rate is itself a finding) → `decimateContours(contours, stepMm,
   rA, H)` at **stepMm=0.15** (the lab's default decimation step per the mission's stated range
   0.15→0.08; start coarse-end, ladder to 0.08 only if STAGE V's first design falls short per the
   KILL/escalation rule below — not a free second run).
3. **Placement validation (mandatory before Stage B):** for a sample of ≥2,000 points per isolevel
   (deterministic stride over the decimated contour vertices, not random — reproducible), run
   `isoResidual3D(u, t, c, params, rA, H)` and require **max `disp3D` ≤ 0.001mm** (the mission's
   stated isoResidual3D-class bound) at **both** isolevels. This is a genuinely independent 3D
   nearest-isolevel bounded search (not the same code path as the polish step), so it is a real
   placement cross-check, not a tautology — matching the lab's own §V11o validation discipline
   (which caught and fixed an 85mm validator artifact at `∇val→0` saddles via exactly this bounded
   search).
4. Report: point counts per isolevel (raw march / after refine-filter / after decimation), drop
   fraction, placement max/p50/p99 `disp3D` at each isolevel, wall time. This IS the contour set
   that replaces production's val=0 centerlines in Stage B — no further processing.

**KILL-E (placement):** if max `disp3D` > 0.001mm at either isolevel after design 1 (stepMm=0.15,
nu=nt=1200) AND after design 2 (a genuine escalation — nu=nt=2400, or `polishIters` raised, or
tighter `valTol`, not a repeat) ⇒ **STOP**, report the field pathology verbatim (which isolevel,
which (u,t) region, whether it clusters near a `∇val→0` locus — the contour lib's own §V11o finding
was that a naive single-Newton-step validator, not the extractor, produced spurious blowups there;
distinguish a genuine extraction failure from a repeat of that known validator trap before concluding
KILL-E). This is logically prior to Stage B — do not build with unvalidated contours.

### STAGE B — build (twin rebuild with contours overriding the general-curve inputs)

1. New function in `_gyroid_bandedge_lib.ts`: `prepareGbeTwinInputs()` — mirrors
   `_gyroid_prodclose_lib.ts`'s `prepareGpcTwinInputs()` EXACTLY (same samplers via
   `buildWallGridCPU`, same `chooseCreaseGrid([])`/`chooseCreaseTGrid([])`/`chooseHelixGrid(0,0,0)`
   identity no-ops since Gyroid has no crease/helix warps, same `composedWallSampler` pair), with
   ONE substitution: instead of calling `extractAnalyticFeatures` and filtering for
   `kind==='general-curve'`, build the `FeatureLine[]` directly from the Stage-E decimated contours:
   ```ts
   function contoursToFeatureLines(contours: Contour[], label: string): FeatureLine[] {
     return contours.map((c, i) => ({
       kind: 'general-curve' as const,
       points: c.pts.map(([u, t]) => ({ u, t })),
       label: `${label}[${i}]`,
     }));
   }
   const generalCurves = [
     ...contoursToFeatureLines(inner135, 'bandedge-inner'),
     ...contoursToFeatureLines(outer150, 'bandedge-outer'),
   ];
   ```
   Kept as `kind: 'general-curve'` (matching the mission's framing "feed... through the production
   conforming path's EXISTING general-curve feature machinery" — this is not a new feature-line
   kind, it is the correct LOCUS fed through the SAME consuming code path Gyroid already uses).
   `hasFeatures = generalCurves.length > 0` (true, same GATE-B-capped `uBias` path as the parent
   twin — Gyroid already exercises this branch, just with a different `generalCurves.length`, from
   14 to potentially tens of thousands of points across many polylines).
2. Everything else stays at the parent twin's production config verbatim, imported from
   `_analytic_floor_lib.ts`'s `AF_PROD_OPTS` exactly as `_gyroid_prodclose_lib.ts` does: 128²
   sizing (`resU=resT=128`, the PRODUCTION default — the parent arm's `resU=512` floor lever is
   NOT applied here, per the mission's explicit "keep everything else at production config" and
   the parent's own recommendation #3, "floor optional, decoupled"), `featureLevel=11`,
   `maxSagMm=0.003`, `maxEdgeMm=1`, `minEdgeMm=0.1`, `gradeRatio=2`, `maxLevel=16`, `nRing=2048`,
   `targetTriangles=16,000,000`, `budgetMode='cap'`. **No curvature floor** (`outerCurvatureFloor`/
   `outerMaxKappa` left undefined) — per the mission's explicit instruction.
3. `assembleWatertight` call identical in shape to the parent's `buildGpcTwin` (same
   `AssemblyWallOptions` fields, `outerFeatureLines: generalCurves`, no `outerCreaseLines` since
   Gyroid's creaseLines array is empty either way).
4. **Recovery/planarize instrumentation (mandatory — this IS a finding, not incidental):**
   production's per-cell constrained CDT (`triangulateQuadtreeWithFeatures` inside
   `ConformingWall.ts`, `featureLevel=11`) has, per the mission framing, "never seen ~50k contour
   points." Wrap the `assembleWatertight` call with breadcrumbs before/after AND capture any
   recovery-failure counters the kernel exposes (grep `ConformingWall.ts`/
   `FeatureConformingTriangulator.ts` for exported failure-count fields — e.g. any
   `subdivFailNonCollinear`-class counter analogous to the lab's own kernel, or a thrown error) —
   report exact counts, not just pass/fail. If the build throws, catch it, breadcrumb the exact
   error + stack, and report that as the Stage-B outcome (this is a first-class KILL-B outcome, not
   a crash to silently retry).
5. **Mandatory gates on the built twin (checked before any scoring):**
   - `nonManRawBig` NON-VACUOUS (injected-crack control must move the count) — reused from
     `_analytic_floor_lib.ts`'s `auditWatertight`, imported READ-ONLY exactly as the parent arm did.
   - `zeroAreaCount` on the full assembly = 0.
   - Full tris / outer tris reported (no gate vs. the baseline here — a materially different tri
     count from embedding ~50k contour points is EXPECTED and is itself part of the finding, distinct
     from the acceptance/frontier budget gate in Stage V).

**KILL-B (machinery chokes — THE finding if it fires):** if `assembleWatertight` throws, if
`nonManRawBig` is non-zero (post NON-VACUOUS control check), or if `zeroAreaCount` > 0 ⇒ this is
reported as the arm's primary deliverable: **exactly where production's feature path fails at this
contour density**, with counts (how many contour points, how many polylines, at what stage —
recovery/planarize/assembly — the failure occurred, any error text). Do NOT silently retry with a
coarser contour set as if nothing happened — if a coarser retry (stepMm=0.08→0.15 ladder, or a
capped point budget) is attempted to characterize the failure boundary, it is reported as a SEPARATE
labeled design point, not a silent substitution for the first design's result.

### STAGE V — verdict (two-tier, per the validated FAST-HONEST-RULER / stratified method)

1. **Prescreen** (dense-45 radial, `gpcPrescreenCount`/`gpcPrescreenDetail` reused verbatim from
   `_gyroid_prodclose_lib.ts`, imported READ-ONLY): report survivor count and fraction. Per the
   prereg's own V11b saturation caveat (already banked in the parent arm's run.log and restated
   here): **radial survivor COUNT is NOT a verdict signal on this wall-dominated style** — it can
   grow with density even as true deviation shrinks (the parent arm's own floor A/B showed
   survivors 141,147→351,698 (+149%) while est. true outliers FELL 96,012→78,124 (−19%)). Prescreen
   count is reported for instrument continuity only; it never gates a KILL/ACCEPT decision alone.
2. **Stratified Newton** (`gpcStratifiedNewton`, imported READ-ONLY, exactly the parent arm's
   `floorstrat` basis): worst-radial head exhaustive + 8 equal-count strata, same per-sample
   knee-classification (`dEdge = min(|absVal-0.135|, |absVal-0.15|) ≤ 0.005` ⇒ knee-adjacent; else
   `absVal ∈ [0.13,0.155]` ⇒ wall-band; else off-band) — but this arm additionally needs an
   **off-wall-population check** distinct from the parent's classifier, because THIS arm's specific
   risk (per KILL-3 below) is the single-midline failure mode (90% off-wall in §V11o) despite
   embedding both edges. Reuse `gyroidValDerivs(u,t).val` at each Newton-confirmed outlier's
   (u,t) exactly as the parent's `classify()` does — the SAME field the classifier already reads,
   so no new instrument is needed, only the same report broken out with an explicit off-band count
   headline (not buried in the "off" bucket in a >400-char JSON blob).
   - Sampling plan sized to whichever of Stage B's designs actually built: start
     `{topExhaustive: 200, strata: 8, perStratum: 100}` (~1,000 points, near the mission's stated
     ~2,000 budget; scale to 2,000 if the survivor population and available wall-time budget allow
     — report the actual plan used, this is not a hard-coded literal).
3. **DECIDE fork** (exactly the parent's 05:12:22Z-class pre-committed rule, restated for this arm
   BEFORE any Stage-V number exists):
   - If the stratified estimate is **near or at acceptance** (est. outliers materially smaller than
     the ~96,012 baseline AND Newton-worst approaching ≤0.01, i.e. plausibly closing within a
     bounded literal-scan budget) ⇒ run the **sharded literal** (PF-style shard env — `PF_GBE_SHARD`/
     `PF_GBE_NSHARDS`, survivors ≡ i mod n, 6 shards, exact-count equivalence by construction per
     `E-2026-07-09-FAST-HONEST-RULER`, priority-bumped per the OPS section below) for the every-facet
     acceptance number.
   - If **clearly short** (est. outliers still a large fraction of baseline, Newton-worst still well
     above 0.01, OR the knee-adjacent population is still ~100% of what remains, mirroring the
     parent's own floor result) ⇒ classify the residual via the (u,t)+`|val|`+knee scatter (already
     collected by `gpcStratifiedNewton`'s `scatter` field, ≤400 points, reused verbatim) and PRICE it:
     compare the achieved reduction against the lab's own precedent (§V11o: ~12,000→~2,133 on-wall,
     an 82% reduction, at 1.5M research tris with a coarse step-0.15/0.6 picket and BEFORE any
     chord-refine or pins; §V11q: chord-refine alone, no pins, reached p99<tol with ~583 residual
     at 4.4min build) scaled to this arm's twin budget — do NOT re-run an open-ended ladder past the
     one stepMm escalation already reserved in KILL-E; a short result at the reserved design points
     is a full, first-class deliverable classified against that precedent, not a failure to chase
     further.
4. **Coverage** (`gpcScoreCoverage`, imported READ-ONLY, 1024² + 4× local refine, boundary bands
   separated) — reported for both hygiene and the KILL-3 comparison below.
5. **Watertight/zeroArea** — already gated in Stage B; re-confirmed on whichever mesh Stage V scores
   (if a shard run rebuilds independently, the watertight/zeroArea check runs once on shard 0's full
   assembly, not redundantly per shard, matching the parent arm's shard discipline).

### ACCEPTANCE

Every-facet ≤0.01mm Newton-basis at outer ≤7.0M tris (the mission's stated budget) — **OR** the
honest measured fork: contours-alone reach an estimated/measured true-outlier count X (report X and
Newton-worst), the remaining population is classified knee/wall-band/off-band with exact fractions,
and — if a pin mechanism would plausibly be needed for the remainder — that need is priced against
the lab's 12k→2.1k (§V11o) and 2.1k→583 (§V11q, chord-refine only) precedents scaled to this arm's
population, explicitly stating this arm does NOT implement pins (out of scope, matching the parent's
recommendation #2's "an open engineering question for that arm").

### KILL CRITERIA (all committed BEFORE measuring)

- **K1 (extraction placement):** see KILL-E above — >0.001mm placement after 2 designs ⇒ report the
  field pathology, STOP before Stage B.
- **K2 (general-curve machinery chokes):** see KILL-B above — planarize/recovery failure, `cdt2d`
  crash, or watertight/zeroArea broken ⇒ THE finding; document exactly where and with what counts,
  do not silently retry as if nothing happened.
- **K3 (verdict regresses vs. baseline, control-anchored):** the parent arm's baseline is
  **~96,012 estimated true outliers / Newton-worst 0.0576** (stratified) reconciling to the artifact
  LITERAL row **105,107 / 0.0590**. If this arm's Stage-V stratified estimate is WORSE than the
  baseline on EITHER metric (est. outliers OR Newton-worst) ⇒ **STOP + classify.** The single-midline
  failure mode (§V11o: 90% off-wall, catastrophic) is the KNOWN trap for this defect class — even
  though this design embeds BOTH edges (not a midline), the off-wall population from Stage V's
  classifier (§3 above) MUST be checked explicitly and reported as its own headline number, not
  assumed zero because "both edges are embedded." A regression accompanied by a large off-wall
  fraction points at a recovery/picket-density problem (too coarse a contour step, mirroring the
  lab's own "coarse picket = count-unstable recovery" finding, §V11o Q2) rather than the doubled-edge
  mechanism itself being wrong — distinguish the two in the report.
- **K4 (budget):** outer tris > 7.0M ⇒ **FRONTIER** — report the priced curve (this design's tris vs.
  outliers/worst/coverage), no acceptance claim, no further escalation beyond the one stepMm ladder
  step already reserved for K1/K2 recovery characterization.

## VERDICT BASIS (instruments, all imported READ-ONLY, no new ruler invented)

Same as the parent arm, verbatim: `gpcPrescreenCount`/`gpcPrescreenDetail`/`gpcStratifiedNewton`/
`gpcScoreForward`/`gpcScoreCoverage`/`auditWatertight`/`zeroAreaCount` from `_gyroid_prodclose_lib.ts`
(this arm's OWN new file, `_gyroid_bandedge_lib.ts`, imports these READ-ONLY rather than
re-implementing — the twin-BUILD function is new/different per Stage B above, but the SCORING
machinery is identical and reused, exactly matching the mission's "no new instrument" framing).
`newtonNearest` from `_gyroid_truthLib.ts`, `buildRefLocator` from `_sharp3dRef.ts` — both READ-ONLY,
same imports the parent arm used.

## TRACTABILITY / RESILIENCE (banked lessons, reused verbatim from the parent arm)

- `NODE_OPTIONS=--max-old-space-size=16384` on the CLI (Vitest 4 silently ignores
  `poolOptions.forks.execArgv` in a config file — confirmed again this arc). No
  `vitest.*.config.ts` for this arm either (CLI flags only, staying inside the allowed file globs,
  matching the parent's own file-scope discipline).
- **Heap fail-fast gate** at test start: assert `v8.getHeapStatistics().heap_size_limit ≥ 8192MB`,
  fail in seconds with an unambiguous message instead of grinding for hours if NODE_OPTIONS did not
  propagate.
- `appendFileSync` breadcrumbs to `research/exchange/_gyroid_bandedge/run.log` at every phase
  (extract-inner/extract-outer/decimate/validate-placement/build/planarize/recovery/assembly/audit/
  prescreen/stratify/score) — sync test bodies outlive vitest `testTimeout`; a killed run resumes
  cheaply from the last breadcrumb.
- One env-gated `it` per stage (`PF_GBE_STAGE=extract|build|verdict`, mirroring `PF_GPC_STAGE`).
- **Priority-bump fork children by CreationDate** (<2min old `node.exe`) — the `tinypool`
  CommandLine filter matches nothing on vitest-4 Windows forks (banked parent-arm finding: Windows
  EcoQoS throttling of detached node children measured ~4× — 23%→88-94% of a core after an
  AboveNormal priority bump).
- Launch detached, breadcrumb, END the turn — the orchestrator polls `run.log`/`rows.ndjson` and
  wakes the session; do NOT arm cross-turn watchers.
- **Machine-courtesy check** before each heavy build: `powershell -NoProfile -Command "Get-Process
  node -ErrorAction SilentlyContinue | Where-Object {$_.WorkingSet64 -gt 2GB}"` — if a FOREIGN heavy
  node process is running, sleep-poll up to 30min before launching; never run two of this arm's own
  builds concurrently.
- Honest generous `testTimeout` (5,400,000ms, matching the parent arm) with per-`it` env gating.
- **PERF EYES**: record per-stage wall times in every ndjson row (contour extraction, decimation,
  placement validation, sampler build, sizing, quadtree, per-cell CDT/recovery, assembly, scoring) —
  feeds the program's perf ledger, distinct from the fidelity verdict itself.
- **FAST-HONEST-RULER shard levers** implemented from the start (`PF_GBE_SHARD`/`PF_GBE_NSHARDS`),
  ready for the sharded-literal DECIDE branch — not exercised unless Stage V's stratified estimate
  says it is worth the CPU-hours (the parent arm's own floorstrat basis explicitly did NOT run the
  blind literal for its floor config, since the classification did not need it; this arm makes the
  same tractability call explicitly, not by default).

## DELIVERABLES

1. `research/bridge/_gyroid_bandedge_lib.ts` — Stage-E extraction orchestration (wraps
   `_gyroidContourLib.ts`'s `marchAbsIso`/`linkSegments`/`refineAndFilterContours`/
   `decimateContours`/`isoResidual3D`, both isolevels) + Stage-B twin builder
   (`prepareGbeTwinInputs`/`buildGbeTwin`, mirroring `_gyroid_prodclose_lib.ts`'s shape) + re-exports
   of the parent arm's scoring functions (new file).
2. `research/bridge/_gyroid_bandedge.test.ts` — env-gated probe (`PF_GBE=1`,
   `PF_GBE_STAGE=extract|build|verdict`; shard levers `PF_GBE_SHARD`/`PF_GBE_NSHARDS`; new file).
3. No `vitest.*.config.ts` (CLI flags only, per the parent arm's own file-scope precedent).
4. This file's VERDICT section (appended below, before commit) — extraction counts+placement,
   build/recovery/watertight outcomes, A/B table vs. the parent's baseline AND vs. the parent's
   floor config, verdict class, pin-population estimate if applicable, perf notes, exact file paths
   + commit SHAs.
5. `research/exchange/_gyroid_bandedge/` — gitignored data (`run.log`, `rows.ndjson`,
   `contours_bandedge.json` or similar contour dump, any binary mesh/scatter dumps).

Committed BEFORE any measurement. Only this file is staged for the pre-registration commit.

---

## VERDICT (2026-07-10, measurement complete)

**VERDICT CLASS: MECHANISM-CONFIRMED on production machinery, with a priced knee residual and a
classified 2-locus topology defect.** Feeding the CORRECT doubled band-edge contours through
production's EXISTING general-curve machinery collapses the true-outlier population **~96,012 →
~31,114 (−67.6%, 3.1×)** and Newton-worst **0.0576 → 0.0249 (−56.8%, 2.3×)** at only **+18.5%
outer tris** — DOMINATING the parent arm's curvature-floor lever on BOTH fidelity axes at ~21% of
its added-triangle cost (floor: −19% outliers, −51% worst, at +87% tris). Coverage max improved
**0.0987 → 0.0253 (−74%)**, p99 0.0036 → 0.0009. The remaining population is **100%
knee-adjacent** (410/410 and 445/445 Newton-confirmed outliers within ±0.005 of the band edges,
ZERO off-band, ZERO wall-band in both configs) — K3 clean: the single-midline catastrophic trap
(§V11o: 90% off-wall) did NOT fire. Acceptance (every-facet ≤0.01) was NOT reached — the residual
~31k knee facets are the pin-pass target, exactly the population class the lab's §V11aa closed
LAST with pinned knee clusters (35 points, but only AFTER the contour+chord ladder); production
has no pin mechanism — the named engineering item. Sub-finding (KILL-B, classified): the
general-curve path leaves **3 (step 0.15) / 2 (step 0.08) non-manifold edges**, and the locus
classifier proves **two loci are step-INVARIANT (bit-identical (u,t) across a near-doubling of
picket density)** — a deterministic per-cell-CDT defect where BOTH band edges pass within ~1
featureLevel-11 cell of each other, NOT a picket-density problem.

### STAGE E — extract: PASSED cleanly, machine-precision placement, zero drops

Design: `nu=nt=1200`, `stepMm=0.15`, `polishIters=40`, `valTol=1e-4` (the pre-registered
design point, matching the lab's own §V11o extraction grid). Both isolevels extracted in
10.4s total:

| isolevel | raw pts (marched+linked) | dropped (valErr>1e-4) | kept | decimated (stepMm=0.15) | placement max `disp3D` | placement p99 |
|---|---|---|---|---|---|---|
| inner `\|val\|=0.135` | 25,381 | 0 | 25,381 | 14,480 | **0.000000mm** | 0.000000mm |
| outer `\|val\|=0.15` | 25,274 | 0 | 25,274 | 14,305 | **0.000000mm** | 0.000000mm |

**KILL-E did not fire** — placement is machine-precision (0.000000mm, sampled 2,069 /
2,044 points respectively, far under the 0.001mm gate), zero drops at either isolevel.
Total doubled band-edge contour set: **28,785 points across ~2,045 polylines** — this
is the exact set that overrides production's 14-line val=0 centerline in Stage B.

### STAGE B — build: production's per-cell constrained CDT did NOT choke, but left 3 non-manifold edges (KILL-B fired, near-miss class)

`assembleWatertight` was fed **2,045 general-curve polylines / 28,785 points**
(vs. production's native 14 lines) at unmodified production config (128² sizing,
`featureLevel=11`, no curvature floor) and **completed without throwing** in 92.5s:

| metric | value |
|---|---|
| full tris | 4,365,677 |
| outer tris | 2,242,987 (well under the 7.0M budget gate) |
| generalCurves fed | 2,045 lines / 28,785 pts (vs. production's 14 lines / ~hundreds of pts) |
| `hasFeatures` / `uBias` | true / 1 (same GATE-B-capped anisotropy path Gyroid already exercises) |
| `nonManRawBig` | **3** (control non-vacuous: `controlMoved=true`) |
| `zeroAreaCount` | 0 |
| build wall time | 92.5s assembly + 4.8s audit |

**KILL-B fired by the pre-registered gate** (`nonManRawBig` non-zero) — but this is a
**near-miss, not a wholesale machinery choke**: 3 non-manifold edges out of 4,365,677
triangles (≈6.9e-7 fraction) against a feature-line input ~150× denser than production
has ever fed this path. The mesh is watertight except for 3 edges, `zeroArea`-clean, and
built in under 2 minutes at production sizing. This matches the qualitative mechanism
the lab's own §V11o Q2 already documented and named — coarse-relative-to-picket
Lawson crossing-chain recovery is COUNT-UNSTABLE at a handful of loci even when the
bulk of the picket is fine enough to recover cleanly (`alreadyPresent`, no recovery
needed, for the vast majority of the ~28,785 points) — rather than a novel defect
class specific to production's kernel. (Initially only counted; per coordinator directive the
loci were subsequently classified in full — see the LOCUS section below, which REVISES the
"recovery instability" hypothesis: the persistent loci are step-INVARIANT, i.e. deterministic,
not picket-noise.)

**Decision:** proceeded to Stage V regardless — my own KILL-B text commits to
"report... the arm's primary deliverable," not to abort scoring; a 3-edge crack does
not prevent measuring whether the doubled-edge embed closes the ~96,012-outlier
population, which is this arm's actual mission question. Both findings (the 3-edge
near-miss AND the fidelity outcome) are reported together below.

### STAGE V — verdict (stratified V11i two-tier basis, 2,000 Newton queries per config,
`topExhaustive:200, strata:8, perStratum:225`, deterministic mulberry32 0xC0FFEE)

### BOUNDED RETRY (coordinator-authorized, exactly one): step 0.15 → 0.08

Per the §V11o recovery lesson (finer picket ⇒ consecutive constraint vertices Delaunay-adjacent).
Extraction at 0.08: 39,849 total pts (20,001 + 19,848), zero drops, placement again 0.000000mm.
Retry gates: outer ≤7.0M **PASS** (2,259,855); stratified no-regress **PASS vs baseline**
(est 36,610 ≪ 96,012; worst bit-identical to step-0.15's — see below); **nonMan=0 FAIL: 3 → 2**.
Per the pre-committed rule, STOPPED — no further iteration; loci classified instead.

### THE A/B TABLE (all four configs; baseline + floor rows from the parent arm's banked verdict)

| config | outer tris (Δ vs base) | radial survivors¹ | est. true outliers (stratified) | Newton-worst | knee-class of confirmed outliers | coverage max / p99 | nonMan / zeroArea |
|---|---|---|---|---|---|---|---|
| baseline (128², prod val=0 curves) | 1,892,112 | 141,147 (7.46%) | **~96,012** (artifact literal 105,107) | **0.0576** (literal 0.0590) | 372/372 knee-adj, 0 off | 0.0987 / 0.0036 | 0 / 0 |
| floor (parent arm: 512² + κ-floor 2.4) | 3,545,856 (**+87%**) | 351,698 (9.92%) | ~78,124 (−19%) | 0.0284 (−51%) | 754/754 knee-adj, 0 off | not measured (KILL-C untested) | 0 / 0 |
| **band-edge step 0.15 (this arm)** | 2,242,987 (**+18.5%**) | 236,185 (10.53%) | **~31,114 (−67.6%)** | **0.024917 (−56.8%)** | **410/410 knee-adj, 0 off, 0 wall** | **0.0253 / 0.0009 (−74%)** | **3** / 0 |
| **band-edge step 0.08 (retry)** | 2,259,855 (+19.4%) | 242,214 (10.72%) | ~36,610² | 0.024917 (bit-identical²) | 445/445 knee-adj, 0 off, 0 wall | 0.0253 / 0.0009 | **2** / 0 |

¹ Report-only per the V11b saturation caveat (count grows with density while true deviation
shrinks — the survivor count is NOT a verdict signal on this wall-dominated style; both this
arm's configs and the parent's floor config show survivor-count INCREASES alongside massive
true-outlier DECREASES, the caveat's textbook signature).
² The two steps are fidelity-EQUIVALENT: Newton-worst is bit-identical (0.02491654414922634 —
the same physical worst locus survives both pickets), coverage identical to 4 decimals, and the
est. difference (31,114 vs 36,610, ±8-9%) is within the stratified estimator's own validated
noise band (±9% vs literals, parent arm). Picket density in [0.08, 0.15] is NOT a fidelity lever
at production 128²/featureLevel-11 — the residual is knee-population-bound, not picket-bound.

### LOCUS CLASSIFICATION (the KILL-B residual, coordinator-directed, `nonman_loci.json`)

New instrument: `classifyNonManLoci` (Map-free packed-key sort + run-length — the 2^23 Map-cap
lesson applied; a Map at 13.1M edges would crash). Every non-manifold edge resolved to (u,t),
`|val|`, distance-to-contour, and constraint-vertex/seam flags:

| step | edge (u, t) | mid `\|val\|` | dEdgeIso | d(inner ctr) | d(outer ctr) | on-contour endpoints | near u-seam |
|---|---|---|---|---|---|---|---|
| 0.15 | (0.6448, 0.8931) | 0.13504 | 4e-5 | 0.000227 | 0.000820 | no/no | no |
| 0.15 | (0.5231, 0.4162) | 0.15005 | 5e-5 | 0.000502 | 0.000304 | no/no | no |
| 0.15 | (0.4384, 0.4421) | 0.13500 | 0 | 0.000126 | 0.000753 | no/no | no |
| 0.08 | **(0.6448, 0.8931)** | 0.13502 | 2e-5 | 0.000237 | 0.000658 | no/no | no |
| 0.08 | **(0.4384, 0.4421)** | 0.13500 | 0 | 0.000126 | 0.000591 | no/no | no |

**The classified defect:** all cracks are mult=3 (one extra triangle on an edge), all on the
OUTER wall (sid=0), all sit ON an embedded isolevel curve (mid `|val|` within 5e-5 of
0.135/0.15), all within ~0.0001–0.0008 (u,t) of BOTH contour sets — i.e. at loci where the
doubled band edges converge to ≲1–1.7 featureLevel-11 cells apart (cell = 1/2048 ≈ 4.88e-4) —
and none touch a constraint vertex or the u-seam. **Two of the three loci are STEP-INVARIANT:
(0.6448, 0.8931) and (0.4384, 0.4421) reproduce at bit-identical endpoint (u,t) across a
near-doubling of picket density** (the third, the only outer-isolevel locus, was fixed by the
finer step). ⇒ This is a **deterministic per-cell constrained-CDT topology defect at
near-tangent doubled-curve passes** — the §V11q over-constraint hazard class ("the band is only
~0.001 wide... near-coincident parallel constraint lines over-constrain the triangulation") —
NOT the picket-density recovery instability initially hypothesized, and NOT fixable by step
laddering (proven). Candidate kernel remedies (named, not implemented — out of this arm's
scope): force-refine feature cells crossed by ≥2 distinct general-curves to featureLevel+1
(production already has band/rail force-refine machinery), or a fan-consistency post-pass on
cells emitting an edge already claimed by a neighbor.

### ACCEPTANCE / KILLS ADJUDICATION

- **ACCEPTANCE (every-facet ≤0.01 at ≤7.0M): NOT reached** — the honest measured fork applies:
  contours alone reach est ~31k outliers / worst 0.0249 (from ~96k / 0.0576); the remainder is
  100% knee-class; pins are the priced next mechanism (below).
- **K1 (placement): did not fire** (0.000000mm both isolevels, both steps).
- **K2 (machinery chokes): fired as a NEAR-MISS and is now CLASSIFIED** (above): no throw, no
  cdt2d crash, zeroArea 0, budget fine — residual = 2 deterministic mult-3 edges at
  doubled-curve near-tangencies (production kernel item, small and actionable).
- **K3 (regression): did not fire** — est/worst/coverage all massively better than baseline;
  off-band population ZERO in both configs (the single-midline trap explicitly checked, absent).
- **K4 (budget): did not fire** — 2.24-2.26M ≪ 7.0M.

### RECOMMENDATION

1. **The production Gyroid close mechanism is CONFIRMED: doubled band-edge contours through the
   EXISTING general-curve machinery.** Swap `extractGyroidManifold`'s val=0 centerline trace for
   the two `|val| ∈ {0.135, 0.15}` band-edge traces (both derived from the style's own
   `thickness`/`sharpness` params — `th·(1−smoothVal)` and `th` — so the production extractor
   can compute the isolevels for ANY Gyroid parameterization, not just defaults). Step 0.15 and
   0.08 are fidelity-equivalent; **prefer ~0.15** (fewer points, one extra crack of the same
   deterministic class — and the crack fix is the kernel item, not the step).
2. **Knee-pin mechanism second (the priced residual):** est ~31k knee-adjacent facets remain
   (worst 0.0249, p99-class 0.010–0.025). The lab's §V11aa literal-0 needed pinned knee clusters
   ONLY for its final tail AFTER the contour+chord ladder; production's analog needs both a chord
   lever near embedded curves (the lab's chordTol drove 2,133→583 before pins, §V11q) and a pin
   mechanism (production has neither exposed). This is the named engineering item for the next
   arm — its target population and loci are banked in `verdict_strat*.json`'s scatters.
3. **Curvature floor: NOT needed — dominated.** The floor buys −19%/−51% at +87% tris; contours
   buy −67.6%/−56.8% at +18.5%. Do not couple them (parent recommendation #3 confirmed by
   measurement).
4. **Kernel item (small):** the deterministic mult-3 edge at doubled-curve near-tangent cells
   (2 loci at default params, locus-stable, `nonman_loci.json`) — fix in
   `triangulateQuadtreeWithFeatures`'s cell-fan emission or by local featureLevel+1 force-refine.

### PERF NOTES (program ledger)

- **HEADLINE: production's per-cell constrained CDT ingested 146-150× its native general-curve
  point density at NO meaningful build-time cost** — 92.5s (28,785 pts) / 94.8s (39,849 pts)
  assembleWatertight at 4.37-4.38M full tris, vs the parent arm's 115-229s for the PLAIN
  128²-baseline twin at 4.01M. featureLevel-11 cell refinement + CDT absorbs ~29-40k constraint
  points essentially free at this scale.
- Extraction end-to-end (march 1200² + link + polish-filter + decimate + 2×~2k-pt placement
  validation): 10.4s per full doubled set, both steps.
- Stage V wall (bumped, healthy): rebuild 95-98s, prescreen detail 49-52s @2.24-2.26M facets,
  stratified 2,000 Newton 159-162s (~80ms/query), coverage (1024²+4×refine) 32-33s. Total ~5.7min
  per config.
- Locus classifier: full 13.1M-edge Map-free scan + classification in seconds (packed-key
  Float64Array sort dominates); the 2^23 Map-cap lesson held (a naive Map scan would have
  crashed at this mesh size).
- EcoQoS priority-bump by CreationDate applied to every fork child (parent-arm lesson reused);
  machine-courtesy checks run before each heavy stage (one foreign ~2.4GB node process active
  throughout — steady-state, coordinated around, no contention incidents).

### LEDGER

Files: `research/bridge/_gyroid_bandedge_lib.ts` (Stage-E orchestration over the read-only
`_gyroidContourLib` extractors + Stage-B twin with overridden generalCurves + Map-free
`classifyNonManLoci`; scoring re-exported READ-ONLY from `_gyroid_prodclose_lib`),
`research/bridge/_gyroid_bandedge.test.ts` (stages extract|build|verdict|locus; PF_GBE_STEP
step lever; PF_GBE_SHARD/NSHARDS literal-shard levers implemented, unused — the stratified
classification decided the fork without the 10-20 CPU-h literal), this prereg. NO
vitest.*.config.ts, NO src/ edits (the override lives entirely at the twin's
`outerFeatureLines` seam). Data (gitignored):
`research/exchange/_gyroid_bandedge/{run.log, rows.ndjson, contours_bandedge*.json,
build_meta*.json, verdict_strat*.json, nonman_loci.json, *stdout.log}`. Commits: pre-reg
3c996af8 → verdict [this]. Concurrent-session notes: shared-tree discipline held (only this
arm's three files + gitignored exchange data touched; explicit staging throughout); the
coordinator-directed mid-arm additions (step lever, locus stage/classifier) are annotated
inline at each site with the directive timestamp.

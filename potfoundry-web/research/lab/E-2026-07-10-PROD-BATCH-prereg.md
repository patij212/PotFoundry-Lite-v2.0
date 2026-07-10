# E-2026-07-10-PROD-BATCH — first all-20 production artifact scorecard + reuse-fix stage-timing delta

**Status: PRE-REGISTERED — kill criteria committed BEFORE measuring.**

## FRAME

`E-2026-07-09-PROD-ARTIFACT-TRUTH` scored 5 pilot styles (HarmonicRipple, SpiralRidges,
GyroidManifold, DragonScales, Voronoi) against the honest every-facet ruler on production default
exports, at a tree that predates several since-landed changes. `research/lab/2026-07-10-program-
consolidation.md` (§E) banks three since-landed, currently-**UNCOMMITTED** changes on top of that
pilot: (1) the **guaranteed final-quadtree reuse** in `ConformingWall.ts` (measured ~23% of export
time removed structurally — assembly was 94.1–98.8% of generate time, of which the duplicate final
quadtree rebuild was 23.8%); (2) the **DS-gate + silent-failure fix** (`valid = manifold && normals
&& degenerates`, finite-area needles demoted to warnings) that unblocks DragonScales' default
export; (3) assorted v3 export-fixes. None of this has been re-captured against real production
artifacts. This arm does two things: (a) extends the pilot's method to all 20 styles for the first
time (per program-consolidation §E revised priority 5), and (b) re-captures the 5 pilot styles on
the current tree to bank the reuse-fix's real generate-time delta (priority 2), directly comparable
to the banked pilot numbers (HR 377s / SR 455s / Gyroid 250s / DS 1113s / Voronoi 534s).

This is a **measurement batch**, not a fix arm — no `src/` edit regardless of outcome.

## BASIS LABELING (pre-registered, critical — read before trusting any number below)

The working tree carries **uncommitted production changes** on top of HEAD. Every number this arm
produces is **tree-basis**, not commit-basis, and must be reported with the snapshot below attached
(re-captured at the moment captures actually start, in case another session lands a commit mid-run
— any drift will be noted verbatim, not silently absorbed).

- `git rev-parse HEAD` (potfoundry-web, at prereg time): `da6b423a15291ac26eb7d28396d253dc1752e708`
- `git status --short` (potfoundry-web, at prereg time) shows uncommitted modifications touching
  the conforming export path, fidelity metrics, geometry export, UI v3 export panel, and (per
  program-consolidation §E) the DS-gate change; full paths (repo-root-relative, `potfoundry-web/`
  omitted) as of this prereg:
  `src/renderers/webgpu/parametric/conforming/{ConformingWall,FeatureConformingTriangulator,
  PeriodicBalancedQuadtree,QuadtreeTriangulator,WatertightAssembly,index}.ts`,
  `src/renderers/webgpu/{ParametricExportComputer,ParametricExportConformingValidation.test,raycast/
  RaycastController,raycast/RaycastController.test}.ts`, `src/renderers/webgpu/parametric/conforming/
  tierC/_topologyLiteral0.test.ts`, `src/fidelity/{metrics,metrics.test,windowHook}.ts`,
  `src/geometry/{stlExport,stlExport.test}.ts`, `src/hooks/{useHaptics,useParametricExport,
  useParametricExport.test}.ts`, `src/ui/v3/blueprint/BlueprintCanvas.tsx`, `src/ui/v3/panel/
  {Certificate,Certificate.test,ExportFooter,ExportFooter.test,ExportTab,ExportTab.test,KilnLog,
  KilnLog.test,kilnLogStore,kilnLogStore.test}.{ts,tsx}`, `src/types/cdt2d.d.ts`,
  `src/webgpu_core.ts`, `src/assets/shaders/{preview_raycast,raycast_bound}.wgsl`,
  `research/bridge/{_gyroid_literal0.test,_pf_dsconform.test,_pf_tangledKernelLib,_prod_truth.test,
  _voronoi_embed.test,_voronoi_truthbridge_lib,labkit.test,labkit}.ts`. Untracked (new, not yet
  committed): `src/renderers/webgpu/parametric/conforming/QuadtreeCellKeyCodec.{ts,test.ts}`,
  `src/ui/v3/panel/exportFormat.ts`, several `e2e/_raycast_*.mjs`/`e2e/_export_*.mjs`/
  `e2e/_v3_export_gate_verify.mjs` probes (untracked, run-only per this arm's scope).
- **This arm does not touch, stage, or commit any of the above.** It reads the tree as-is. If the
  tree changes mid-batch (another session commits), the SHA/status is re-snapshotted at the START
  of the CAPTURE phase (§DESIGN step 2) and reported alongside the one above; a material change
  mid-batch is recorded as a finding, not silently absorbed into one basis label.
- Every scorecard row is labeled `tree-basis: <sha>+uncommitted` and carries the capture wall-clock
  so a reader can tell which numbers came from before vs after any such drift.

## DESIGN (ordered; commands are the literal invocation used — deviations recorded verbatim)

### 0. Discovered operational hazards (pre-registered fixes, found while reading the harnesses)

1. **DS scorecard is a fixed-path, key-deduplicated ndjson — re-scoring silently no-ops without a
   reset.** `_ds_prodtruth_lib.ts` hardcodes `PROD_TRUTH_DIR = research/exchange/_prod_truth/
   DragonScales` (always reads whatever is currently there) and `checkpoint()`/`keyExists()`
   dedupe by a fixed task key (`t1a_construction`, `fwd_body`, …) against `research/exchange/
   _ds_prodtruth/scorecard.ndjson` — **NOT** keyed by artifact/tree basis. `research/exchange/
   _ds_prodtruth/{scorecard.ndjson,run.log}` already exist from the prior DS-PRODTRUTH arm
   (18 lines, scored against the OLD-tree artifact). Rule: **before running the DS probe against
   the newly-recaptured artifact, `research/exchange/_ds_prodtruth/` is moved to
   `research/exchange/_ds_prodtruth_pre_reuse_baseline/`** (data, gitignored, preserved not
   deleted — mirrors the pilot-capture-dir rule already in the mission) so every DS task key is
   re-computed fresh against the new artifact instead of silently reading stale rows.
2. **`e2e/_export_stage_timing_capture.mjs` hardcodes `http://localhost:3001/`** — a SECOND,
   independently-bound dev server, distinct from the primary capture server on `:3000` (confirmed:
   `vite.config.ts` default port 3000; no existing listener on 3000 or 3001 at prereg time). Plan:
   after the capture phase's primary `:3000` server needs are done (or in parallel — both are cheap
   idle-mostly Vite processes), start a second instance via `npx vite --port 3001 --strictPort`
   (own log) for this one stage, then it can be torn down.
3. **`_prod_truth.test.ts`'s scorecard (`research/exchange/_prod_truth/scorecard.ndjson`) is NOT
   per-style and NOT deduplicated** — every run simply appends a timestamped row (`row.at`). No
   reset is needed (old pilot rows and new tree-basis rows coexist safely); this arm's rows are
   distinguished from the pilot's 2026-07-09 rows by `at` timestamp (>= this arm's capture-phase
   start) when assembling the scorecard. Existing file has 15 lines (pilot + FAST-HONEST-RULER +
   VORONOI-TRUTHBRIDGE rows) at prereg time — left untouched, read-only for delta context.
4. Capture-dir collisions: `research/exchange/_prod_truth/` already contains
   `{DragonScales,GyroidManifold,HarmonicRipple,SpiralRidges,Voronoi}/` (the 5 pilot captures) plus
   `Voronoi_floathash_baseline/` (an unrelated prior session's backup — left untouched). Per the
   mission: each pilot style's dir is renamed to `<Style>_pre_reuse_baseline/` immediately before
   that style is recaptured (not batched ahead of time, so a killed run never leaves a style
   without ANY capture dir).

### 1. SERVER

`npm run dev` (`vite`, port 3000) started detached, own log file, from `potfoundry-web/`. Wait for
a TCP listener on :3000 before the first capture batch. EcoQoS: bump the new node process (and any
child chrome.exe Playwright spawns) to `AboveNormal` by process-list diff (CreationDate/PID, since
the CommandLine filter is banked-useless on this stack) immediately after each spawn.

### 2. CAPTURE — all 20 styles, batches of 1–5 (batch G is a deliberate solo due to a named hazard)

Style keys (from `src/styles/registry.ts`, the single source of truth) grouped into capture batches
— each batch is one `node e2e/_prod_truth_capture.mjs <Style...>` invocation (its own browser
session; batching bounds a browser crash/hang's blast radius to the remaining styles in that batch,
per the lab's "no single multi-hour unit" resilience rule):

- **Batch A (smoke, 2):** SuperformulaBlossom, FourierBloom — cheap validation that the harness
  still works end-to-end on the reuse-fixed tree before committing to the expensive pilot batches.
- **Batch B (pilot recapture 1/2, 3):** HarmonicRipple, SpiralRidges, GyroidManifold — dirs moved
  to `*_pre_reuse_baseline/` immediately before this batch runs.
- **Batch C (pilot recapture 2/2, 2):** DragonScales, Voronoi (the two heaviest pilot styles,
  isolated so one running long doesn't stall the other three) — dirs moved to
  `*_pre_reuse_baseline/` immediately before this batch runs.
- **Batch D (4):** SuperellipseMorph, GothicArches, WaveInterference, Crystalline
- **Batch E (4):** ArtDeco, BambooSegments, RippleInterference, BasketWeave
- **Batch F (4):** GeometricStar, HexagonalHive, CelticKnot, CelticTriquetra
- **Batch G (1, hazard-isolated):** LowPolyFacet — pre-existing Dawn shader-compile hang risk
  (banked, style 19). Run SOLO so a hang cannot stall/kill other styles' batch. Attempt once,
  10-minute cap (below the general 35-min/style cap specifically because this hazard is a KNOWN
  hang, not a slow-but-progressing generate); on hang/timeout, kill the process tree by PID (Windows
  `TaskStop`/pipeline kill does not reliably kill the vitest/playwright fork child, banked lesson),
  record verbatim (`meta.error` or a synthesized timeout row if the process never writes meta.json),
  and continue — do not retry.

Rationale for this order: smoke-test first (cheap failure if the harness itself broke), then the
5 pilot styles (banks the reuse-fix delta — the mission's co-equal second deliverable — as early as
possible), then breadth across the remaining 15, hazard last and isolated.

General hazard handling (all batches): any style whose `generate` throws is captured verbatim
(`meta.ok=false`, `meta.error`) by the harness itself and the batch continues (harness already
`process.exitCode = 0`s on a style failure — capture failures are findings, not harness failures,
per the harness's own header comment). Per-style wall cap: **35 minutes** — if a single style is
still running past that with no meta.json written, treat as a hang: kill by PID tree, record a
synthetic `{ok:false, error:"TIMEOUT >35min, killed"}` row, move to the next style/batch.

Checkpoint: `meta.json` is written by the harness itself the instant each style finishes (already
built in) — no extra plumbing needed; this arm additionally appends one line to a batch-progress
ndjson (`research/exchange/_prod_batch/capture_progress.ndjson`: `{style, batch, startedAt,
finishedAt, ok, tris, generateMs, error}`) after every style, built from reading each style's fresh
`meta.json` right after its batch completes (belt-and-suspenders — meta.json is already the durable
record; this is purely an aggregate index for the final scorecard assembly step).

### 3. STAGE-TIMING (banks the reuse-fix delta table — mission-priority deliverable)

After Batch C (all 5 pilots recaptured): start the second dev server (`:3001`, own log), run
`node e2e/_export_stage_timing_capture.mjs HarmonicRipple SpiralRidges GyroidManifold DragonScales
Voronoi` (run-only, unmodified). Compare its per-style `assembleWatertightMs`/`totalMs` against the
banked E-2026-07-10 profiler aggregate (assembly 94.1–98.8%, 97.4% aggregate; ~23% of export time
attributed to the now-fixed duplicate final-quadtree rebuild) and against the fresh Batch B/C
`generateMs` from the capture metas (two independent measurements of the same reuse-fixed tree —
report both, do not silently prefer one). If the harness errors (e.g., the DS-gate/export-fix
changes shifted an internal shape it depends on), fall back to the generate-time deltas already
banked in the Batch B/C capture metas vs the pilot's banked per-style seconds, and record the
stage-timing harness's error verbatim as a finding (per mission fallback instruction) — do not
silently skip the deliverable.

### 4. CERTIFY each successfully-captured artifact

Reconciling the mission's "18 styles" figure against the actual roster: 20 styles − DragonScales
(special composite-ruler probe, never the standard probe) = 19 candidates for the standard probe.
The mission's "18" most likely anticipates the pre-registered LowPolyFacet hang risk removing one
style from the capturable set. This arm does **not** pre-commit to a fixed count — it certifies
whatever the capture phase actually delivered `meta.ok===true` for for (up to 19 via the standard
probe + DragonScales via the DS probe), and reports the realized count plainly if it differs from
18/19.

**Standard probe** (every captured non-DragonScales style):
```
PF_PROD_TRUTH=1 PF_PT_STYLES=<Style> PF_PT_PRESCREEN=1 NODE_OPTIONS=--max-old-space-size=16384 \
  npx vitest run --config vitest.prod_truth.config.ts
```
Add `PF_PT_STRIDE=4` (labeled in the row per the probe's own basis string) for any style whose
`outerTris` (from its capture meta) exceeds 3,000,000. For a style whose prescreen survivor
population is itself large enough that a single-thread pass is projected past ~45–60 minutes
(the historical trigger was Gyroid/Voronoi-class multi-well styles), shard via `PF_PT_SHARD=i
PF_PT_NSHARDS=N` and merge with `node research/bridge/_prod_truth_merge.mjs <Style>` (both
committed, run-only) — mirroring the banked FAST-HONEST-RULER method exactly. Per the machine-
courtesy mandate, shard fleets are kept small enough (≤3–4 concurrent heavy forks) to leave
headroom for the concurrently-running Jacobian arm; a style that would want a larger fleet is
instead run with fewer concurrent shards and a longer wall time.

**DragonScales — composite-ruler probe** (after moving the stale `_ds_prodtruth` data dir aside,
per §0.1):
```
PF_DS_PRODTRUTH_BATTERY=1 NODE_OPTIONS=--max-old-space-size=16384 npx vitest run \
  research/bridge/_ds_prodtruth.test.ts
```
**BATTERY FAIL ⇒ STOP, DS reported as instrument-invalid, no forward/reverse numbers published**
(inherited kill criterion from the DS-PRODTRUTH prereg — re-asserted here since this arm reuses
that instrument against a new artifact). On battery PASS, proceed with `PF_DS_PRODTRUTH_FWD=1`
(body+ring-band forward scoring; shard via `PF_DS_PT_SHARD`/`PF_DS_PT_NSHARDS` and merge via
`node research/bridge/_ds_prodtruth_merge.mjs` if a population's single-thread projection exceeds
45 minutes, exactly as the original arm did), then `PF_DS_PRODTRUTH_REV=1` (coverage witnesses).
The pre-registered ring-band wall-hiding guard (§KILL CRITERIA below) is inherited verbatim.

**Hash/branch styles (Voronoi, and any of CelticKnot/CelticTriquetra/BasketWeave/GeometricStar/
HexagonalHive that show the same signature):** the standard probe's own pre-registered
INSTRUMENT-VALIDITY GATE (`vertexOnSurf p99 > 0.01` ⇒ interior numbers UNTRUSTED) already handles
this — no special-casing needed beyond what the probe does automatically. Voronoi is expected
TRUSTED post-INTHASH-SWAP (banked: post-swap p99 0.00002, >3000× better, real-GPU-confirmed) —
this arm's fresh Voronoi row is the first production-artifact confirmation of that swap's effect
under the FULL certification probe (previously confirmed only via the narrower _voronoi_truthbridge
arm re-scoring the OLD captured artifact). Any OTHER style whose gate fires is recorded with the
gate verdict and its interior numbers marked UNTRUSTED in the scorecard — the row is never skipped.

### 5. SCORECARD

New file `research/bridge/_prod_batch_assemble.mjs` (run-only aggregator, no probe logic
duplicated — reads `research/exchange/_prod_truth/scorecard.ndjson` filtered to rows with
`at >= <this arm's capture-phase start ISO timestamp>`, `research/exchange/_prod_truth/<style>/
meta.json` for capture timings, and `research/exchange/_ds_prodtruth/scorecard.ndjson` for the
DragonScales row) → writes `research/exchange/_prod_batch/all20_scorecard.{ndjson,md}` per the
mission's schema. A compact md table is additionally inlined directly into this file's VERDICT
section (repo convention: numbers committed in the prose, not only in gitignored data).

## KILL CRITERIA (committed BEFORE measuring — inherited from the mission verbatim, plus 2 additions)

- **Dev-server/GPU unavailability after 30 minutes of retries** ⇒ record and stop; a partial batch
  is a valid deliverable.
- **More than 6 styles failing capture** ⇒ stop and report the pattern (do not keep burning wall
  time against a systemic break).
- **Certification of a style exceeding 90 minutes even sharded** ⇒ record a basis-labeled partial
  (the DS-PRODTRUTH precedent: a labeled partial fraction is a legitimate deliverable) and continue
  to the next style — never silently downgrade precision without labeling it.
- **DS BATTERY FAIL** ⇒ instrument-invalid verdict only for DragonScales, no forward/reverse
  numbers from a ruler that hasn't passed its own battery (inherited from the DS-PRODTRUTH prereg).
- **DS ring-band wall-hiding guard** (ring-band max/p99 reads ≪0.1mm) ⇒ re-run the density-matched
  1d re-validation before trusting the ring numbers (inherited; the prior arm's own resolution
  method — winner-attribution + no-wall control + reverse-wall cross-check — is the template if it
  fires again).
- **[Addition] DS scorecard staleness guard:** before trusting ANY DS `_ds_prodtruth` row produced
  in this arm, confirm `research/exchange/_ds_prodtruth_pre_reuse_baseline/` exists (i.e., the
  reset in §0.1 actually happened) — a DS row computed against a non-reset ndjson is a silently
  stale (old-artifact) number wearing a new-tree label; if this is ever discovered after the fact,
  the affected row is retracted and re-run, not patched in place.
- **[Addition] Machine courtesy:** before every heavy certification stage, run `powershell -NoProfile
  -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object {$_.WorkingSet64 -gt 2GB}
  | Measure-Object"` (the DS-PRODTRUTH precedent's exact gate). If ≥2 foreign heavy node processes
  are found, sleep-poll at 60s intervals up to 45 minutes before proceeding, exactly as that arm did.
  At most one of this arm's OWN heavy Node processes runs at a time alongside the concurrently-
  active Jacobian arm.
- Every phase checkpoints the instant a unit finishes (per-style `meta.json` for capture,
  per-task ndjson row for certification) — a killed run resumes without re-doing finished units.
- **No `src/` edit, no `git add -A`/`-u`, no file created outside `research/bridge/_prod_batch*` /
  `research/lab/E-2026-07-10-PROD-BATCH*` (data under `research/exchange/_prod_truth/` and
  `research/exchange/_prod_batch/` gitignored, per repo convention) — regardless of outcome.**

## SCOPE / FILE DISCIPLINE

- New files only: `research/lab/E-2026-07-10-PROD-BATCH-prereg.md` (this file, verdict appended
  below), `research/bridge/_prod_batch_assemble.mjs` (aggregator; no re-derivation of any probe
  logic — reads already-committed harnesses' own output files only).
- RUN-only (never edited): `e2e/_prod_truth_capture.mjs`, `research/bridge/_prod_truth.test.ts`,
  `vitest.prod_truth.config.ts`, `research/bridge/_prod_truth_merge.mjs`,
  `research/bridge/_ds_prodtruth.test.ts`, `research/bridge/_ds_prodtruth_lib.ts`,
  `research/bridge/_ds_prodtruth_merge.mjs`, `e2e/_export_stage_timing_capture.mjs` (untracked,
  another session's harness).
- Data: `research/exchange/_prod_truth/`, `research/exchange/_ds_prodtruth/`,
  `research/exchange/_export_stage_timing/`, `research/exchange/_prod_batch/` — all gitignored
  (`research/.gitignore`'s blanket `exchange/` rule, confirmed). Numbers are inlined in this file's
  verdict, not committed as data.
- Journal: one sign-off entry appended to `../agents_journal.md` at close-out — **left uncommitted**
  per mission instruction (never `git add`/`git commit` the journal or `EXPERIMENT-REGISTRY.md` in
  this arm).
- No `git add -A`/`-u` ever. This pre-reg is committed ALONE, first (explicit `git add
  research/lab/E-2026-07-10-PROD-BATCH-prereg.md`), before any measurement.

## DELIVERABLE

Verdict + the all-20 scorecard table appended to this file (committed, explicit staging: `git add
research/lab/E-2026-07-10-PROD-BATCH-prereg.md` only, each time it is updated). Journal sign-off
(uncommitted). Final chat message = dense data summary for the orchestrator: capture stats
(per-style times + failures verbatim), the reuse-fix delta table (5 pilots, banked-vs-fresh
generateMs + stage-timing breakdown where available), the all-20 scorecard, instrument notes,
file paths + commit SHAs. Not user-facing prose.

---

*(VERDICT appended below as phases complete — this arm checkpoints its own prereg file with
interim status rather than holding everything for one final write, consistent with the "no single
multi-hour unit" resilience rule.)*

## INTERIM STATUS (checkpoint 1 — capture phase in flight)

**Server:** `npm run dev` up on :3000 (PID 10276, bumped AboveNormal) at commit basis
`da6b423a+uncommitted` (re-confirmed unchanged at capture-phase start).

**Provenance finding (pre-registered handling applied):** three existing pilot capture dirs
predate this arm cleanly (`DragonScales`, `HarmonicRipple`, `SpiralRidges`, `GyroidManifold`, all
2026-07-09) and were moved to `*_pre_reuse_baseline/` as designed. **`Voronoi`'s existing dir was
NOT the 2026-07-09 pilot capture** — its `meta.json` shows `startedAt: 2026-07-10T02:48:43Z`,
`full.generateMs=301,865` (302s, already well under the banked 534s pilot figure), i.e. an
ambiguous **intermediate-tree** capture from earlier today (most likely the INTHASH-SWAP session's
own e2e verification run — tree state at that exact moment not reconstructable). Moved to
`Voronoi_intermediate_20260710T0248_baseline/` (distinct name, not `_pre_reuse_baseline`, so it is
never confused with the true 2026-07-09/534s pilot number) — the true pre-reuse pilot baseline for
Voronoi remains only the banked 534s figure from the registry row, not a locally-preserved artifact.

**Batch A (smoke, 2/2 OK):** SuperformulaBlossom full=1,059,840t/17.6s outer=289,792t/18.8s
total=61.4s; FourierBloom full=3,143,106t/103.6s outer=1,278,510t/109.8s total=218.2s. Batch wall
286.3s. Harness confirmed working end-to-end on the reuse-fixed tree. One recurring benign
artifact: a ~35s "Style 18 createRenderPipelineAsync... possible Dawn compiler hang" console error
fires once per fresh browser launch (page-load-time shader warmup, not per-style, not fatal) —
noted for LowPolyFacet-hazard interpretation (the hang risk may not be exclusive to style 19).

**Batch B (pilot recapture 1/2: HarmonicRipple, SpiralRidges, GyroidManifold) — IN FLIGHT**, dirs
pre-backed-up. EcoQoS bump applied to new node/chrome children. Machine courtesy check at launch:
0 foreign node processes >2GB WS.

Aggregator `research/bridge/_prod_batch_assemble.mjs` drafted; dry-run against partial data
confirmed it runs clean (20/20 rows, no crash) and — usefully — surfaced the exact DS staleness
hazard pre-registered in SS0.1 in practice (it showed the OLD `_ds_prodtruth` rows next to
DragonScales' correctly-PENDING capture status), confirming the reset-before-rerun rule is load-
bearing, not theoretical.

Second dev server up on :3001 (PID 28564, bumped) ahead of need, to remove a step from the
stage-timing phase's critical path.

**Parallel work started** (courtesy-checked: 0 foreign >2GB node processes at launch; one browser
+ one light capture-orchestrator + one heavy certification fork is within the "one heavy Node
build at a time" budget): certification of `SuperformulaBlossom` (Batch A, already captured)
launched concurrently with Batch B's still-running capture, to use wall time productively rather
than idling.

**First reuse-fix delta point (HarmonicRipple, Batch B):** OLD tree (2026-07-09 pilot,
`HarmonicRipple_pre_reuse_baseline/meta.json`) full.generateMs=**377,429** / outer.generateMs=
**368,696** / totalMs=751,608. THIS tree (tree-basis da6b423a+uncommitted): full.generateMs=
**321,300 (−14.9%)** / outer.generateMs=**277,500 (−24.7%)** / totalMs=605,500 (−19.4%), tris
identical class (full 5,253,860 — matches banked byte-identity target exactly; outer 2,304,454 vs
banked 2,304,454 exactly). Directionally consistent with the banked ~23% assembly-time removal
(profiler arm), with the OUTER wall's solo generate (no cap/inner-wall competing work) showing the
larger of the two deltas.

**Second reuse-fix delta point (SpiralRidges FULL generate, Batch B, in flight):** OLD tree
full.generateMs=**455,272**. THIS tree full.generateMs ≈ **317,000 (≈−30.4%)** (derived from
`full.{xyz,idx}.bin` mtimes: capture started 14:21:43+01:00, full-pot bins written 14:26 — the
outer-wall generate for this style is still running at the time of this checkpoint; the harness's
own precise `generateMs` will supersede this mtime-derived estimate once `meta.json` lands). The
SpiralRidges full-generate delta (−30.4%) is larger than HarmonicRipple's (−14.9%) — directionally
sensible if SpiralRidges' helix/analytic-floor-adjacent sizing does more budget-search/quadtree
rebuild work per the profiler's "budget-search 24.9% + duplicate final-quadtree-rebuild 23.8%"
breakdown that the reuse fix specifically targets.

## INTERIM STATUS (checkpoint 2 — session time-budget checkpoint, work left running)

This session invested substantial wall-clock time proving the pipeline end-to-end and banking the
mission's second deliverable (reuse-fix delta) with real numbers on 1.4 of 5 pilot styles, while
capture and certification continued running. Given the mission's own ~5h capture budget plus a
full certification pass is far larger than one session can responsibly narrate turn-by-turn, and
per the mission's explicit "END YOUR TURN after launching each long detached phase" +
"a partial batch is a valid deliverable" guidance, this checkpoint hands off a clean, resumable
state rather than continuing to narrate silent waiting.

**Left RUNNING (detached, will keep producing durable checkpointed output on disk regardless of
this session's lifetime):**
- Dev server :3000 (PID 10276, AboveNormal) — keep alive for all remaining capture batches.
- Dev server :3001 (PID 28564, AboveNormal) — keep alive for the stage-timing phase.
- Batch B capture (`node e2e/_prod_truth_capture.mjs HarmonicRipple SpiralRidges GyroidManifold`,
  log `research/exchange/_prod_batch/capture_batchB.log`): HarmonicRipple DONE; SpiralRidges full
  DONE (outer in flight); GyroidManifold not yet started. Will self-checkpoint `meta.json` per
  style and print `CAPTURE TOTAL` on completion; exits cleanly on its own.
- SuperformulaBlossom certification (PID 27484, AboveNormal, CPU 632s+ and still climbing —
  genuinely computing, not hung; log `research/exchange/_prod_batch/certify_SuperformulaBlossom.log`,
  stdout is BUFFERED by vitest until the row is appended to `research/exchange/_prod_truth/
  scorecard.ndjson` — check that file's line count, not the log, for real completion signal).

**Exact resumption checklist** (also duplicated to the scratchpad for the executing session's own
convenience; reproduced here since scratchpad is not part of the deliverable): once Batch B and the
SuperformulaBlossom certification finish —
1. Certify FourierBloom, HarmonicRipple, SpiralRidges, GyroidManifold with the standard probe
   (command template in SS4 DESIGN above); GyroidManifold's outer tris were 1,892,114-class at the
   OLD tree (banked) — expect it to need `PF_PT_STRIDE` and/or sharding per the FAST-HONEST-RULER
   precedent if the reuse-fixed tree's count is similar.
2. Launch Batch C (`DragonScales Voronoi`) — dirs already backed up
   (`DragonScales_pre_reuse_baseline/`, `Voronoi_intermediate_20260710T0248_baseline/`).
3. Run the stage-timing capture against :3001 for the 5 pilots (SS3 DESIGN).
4. **Before any DS certification**: `mv research/exchange/_ds_prodtruth research/exchange/
   _ds_prodtruth_pre_reuse_baseline` (mandatory reset, SS0.1) — then BATTERY → FWD (sharded) →
   merge → REV, per SS4 DESIGN.
5. Batches D, E, F (4 styles each), then G (LowPolyFacet solo, 10-min cap) — commands pre-written
   in SS2 DESIGN.
6. Certify each as captured; re-run `node research/bridge/_prod_batch_assemble.mjs` at any time to
   regenerate the current-state scorecard (it is idempotent and safe to run repeatedly against
   partial data).
7. Final verdict + scorecard table appended to this file; journal sign-off; both committed/left
   uncommitted per the rules already stated above.

No `src/` file was read for editing purposes and none was modified. No `git add -A`/`-u` was run.
Every capture/certification result that HAS landed is durable (on disk, several independently
checkpointed formats) — nothing measured so far is at risk from this checkpoint.

## INTERIM STATUS (checkpoint 3 — Batch B complete; reuse-delta table banked; byte-identity carry-over; full chain launched)

**Batch B complete (3/3 OK, batch wall 1,968.6s). The reuse-fix generate-time delta table
(tree-basis da6b423a+uncommitted vs the 2026-07-09 pilot metas, exact `generateMs` from
`meta.json` both sides):**

| style | full generateMs pilot → tree (Δ) | outer generateMs pilot → tree (Δ) |
|---|---|---|
| HarmonicRipple | 377,429 → 321,257 (**−14.9%**) | 368,696 → 277,509 (**−24.7%**) |
| SpiralRidges | 455,272 → 297,849 (**−34.6%**) | 449,151 → 572,015 (**+27.4%** — see caveat) |
| GyroidManifold | 250,377 → 221,167 (**−11.7%**) | 273,888 → 256,640 (**−6.3%**) |

**CONTENTION CAVEAT (recorded before interpreting):** from 13:18:49Z this arm's own
SuperformulaBlossom certification fork (1 full core, AboveNormal) ran concurrently, a
`gitnexus analyze` process (475+ CPU-s observed) ran from ~13:12Z, and the Jacobian arm's
pinned-worktree sequence runs throughout (coordinator-confirmed, owns one core). HR's FULL
generate (13:12→13:17Z) is the cleanest window; SR and Gyroid overlapped contention on both
generates. The SR outer **+27.4%** is therefore most plausibly load contention, not a real
regression — and Gyroid's small deltas may be understated for the same reason. ADJUDICATION
DEFERRED to the stage-timing phase (quiet GPU, `assembleWatertightMs` directly attributable);
these wall numbers are banked as measured, caveat attached, not silently averaged.

**BYTE-IDENTITY CARRY-OVER (major basis result):** all 12 recaptured pilot bins
(HR/SR/Gyroid × full/outer × xyz/idx) are **sha1-IDENTICAL** to their `*_pre_reuse_baseline`
counterparts. The reuse fix + the rest of the uncommitted tree changed generate TIME only for
these styles — the artifacts are bit-for-bit the pilot artifacts. Consequence (carry-over by
proven equivalence): the pilot's certification rows transfer to the tree basis VERBATIM —
HarmonicRipple literal-0 (max 0.0055), SpiralRidges 3,145 over / Newton-worst 0.0239,
GyroidManifold 105,107 LITERAL / Newton-worst 0.0590 — no redundant re-certification. The same
check will be applied to DragonScales/Voronoi when Batch C lands (DS vs the 2026-07-09 pilot
baseline; Voronoi vs the 02:48 intermediate capture whose scorecard row is the post-INTHASH
2026-07-10T03:09 stride-4 row).

**DS SCORECARD RESET EXECUTED (pre-reg SS0.1):** `research/exchange/_ds_prodtruth/` →
`_ds_prodtruth_pre_reuse_baseline/` (preserved). The DS composite-ruler probe now starts from a
clean keyspace against the Batch C re-capture.

**LAUNCHED (detached, sentinel-chained, each with wall-cap guard + EcoQoS bump + per-style
breadcrumbs via the new `research/bridge/_prod_batch_progress.mjs`):** capture batches
C (DragonScales+Voronoi, 60-min guard, RUNNING) → D (SuperellipseMorph GothicArches
WaveInterference Crystalline, 90-min guard) → E (ArtDeco BambooSegments RippleInterference
BasketWeave) → F (GeometricStar HexagonalHive CelticKnot CelticTriquetra) → G (LowPolyFacet
SOLO, **600s pre-registered hang cap**, orphan report on exit). Certification queue task:
waits for the in-flight SuperformulaBlossom row → courtesy gate (≥2 heavy foreign nodes ⇒
sleep-poll ≤45min) → FourierBloom certification (stride 1, prescreen) → aggregator refresh.
Breadcrumbs backfilled for batches A/B (`capture_progress.ndjson`, 5 rows).

**Stage-timing ordering deviation (recorded):** prereg SS3 said "after Batch C"; execution
defers it to after ALL capture batches — a timing instrument must not share the GPU with
concurrent captures (measurement-quality rationale, not scope change).

**Certification plan restated after the byte-identity result:** styles still needing scoring =
FourierBloom (queued) + Batch D/E/F styles as captured + LowPolyFacet if G succeeds + DS
composite-ruler run + Voronoi/DS only if their Batch C hashes DIFFER from their baselines.
CelticKnot carries its own float sin-hash (`src/geometry/styles.ts:1912`, NOT the swapped
Voronoi chain) — its vertexOnSurf gate is the next TRUTH-BRIDGE-FAILURE candidate; if it fires,
the row records the gate verdict and interior numbers are marked UNTRUSTED per the pilot's
pre-registered rule (row never skipped).

## INTERIM STATUS (checkpoint 4 — Batch C: Voronoi OK, DragonScales CAPTURE FAILED — priority diagnostic opened)

**Batch C result:** Voronoi OK — full 7,559,574 tris / **123.6s** generate, outer 4,170,518 /
117.9s (three-basis comparison: 533.6s at the 2026-07-09 pilot [float-hash tree] → 301.9s at the
02:48Z intermediate capture [post-INTHASH] → 123.6s now [post-INTHASH + reuse fix, quieter
machine]; the pilot→now delta conflates the int-hash swap's banked 2.2× eval speedup with the
reuse fix — only the 02:48→now leg (−59%) isolates reuse+load, contention caveats apply).

**DragonScales FAILED (first capture failure of the batch, recorded verbatim per pre-reg):**
`meta.error = "Error: getMeshForRender returned null (generate failed)"` at 118.5s; page error
`AbortError: Failed to execute 'mapAsync' on 'GPUBuffer': Buffer was unmapped before mapping was
resolved.` via `useParametricExport` with `safelyCallDestroy` in the stack. Voronoi succeeded
SECONDS LATER in the same browser ⇒ not a device wedge. **Precedent match:** identical
AbortError string banked on the OLD tree (E-2026-07-09-EXPORT-PERF e2e attempt 1, "unrelated
WebGPU race... during the prior style's device teardown") ⇒ a PRE-EXISTING race class is the
null hypothesis; DS (longest generate = widest race window, heaviest buffers) is its most likely
victim. Failure meta preserved: `research/exchange/_prod_batch/DragonScales_fail1_meta.json`.

**Diagnostic ladder (coordinator-directed, in flight):** (1) verbatim log pulled DONE; (2) single
retry launched 15:01Z (log `capture_DS_retry1.log`, 40-min guard) — batch D continues in
parallel per coordinator (retry is binary works/fails, not a timing measurement; conditions
recorded: SFB cert fork still computing, batch D browser sharing the GPU); (3) if reproduced ⇒
pinned-worktree-at-HEAD capture (worktree at `da6b423a`, own vite on :3002 via `--strictPort`,
worktree-local COPY of the harness with only the port constant changed — the shared tree's
committed harness is never edited): HEAD-succeeds + tree-fails = TREE REGRESSION CONFIRMED;
HEAD-fails-too = pre-existing race re-confirmed; (4) finding posted to
`research/CROSS-WORKSTREAM-NOTES.md` (update 4) for the reuse-fix/gate-fix owners BEFORE they
commit DONE. Not attempting any fix in owned files regardless of outcome.

**Batch D meanwhile (rolling):** SuperellipseMorph + GothicArches OK (full 3,128,634t/53.7s) +
WaveInterference OK (1,306,488t/10.4s) at last poll — the never-before-captured mid-roster
styles are FAST (10-54s class, not the 4-19min pilot class). Recurring benign page-load artifact
each fresh browser: "createRenderPipelineAsync failed for Style 18 ... possible Dawn compiler
hang" ~30-35s — logged by SceneManager for the LIVE PREVIEW pipeline, does not affect capture.

## INTERIM STATUS (checkpoint 5 — DS retry SUCCESS; all-5 pilot carry-over; policy update; certification waves rolling)

**POLICY UPDATE (user directive via coordinator, 2026-07-10):** machine dedicated to this work.
Standing priority enforcer active (node forks auto-bumped to High). One-heavy-Node courtesy cap
LIFTED — certifications now run CONCURRENTLY (up to ~cores−4 = 12); two browser sessions
permitted. Quiet-GPU stage-timing pass at the end remains the clean-conditions measurement;
everything else stays labeled contended (as already practiced).

**DS DIAGNOSTIC RESOLVED — TRANSIENT, NOT A TREE REGRESSION:** the single pre-registered retry
(15:01Z) captured DragonScales cleanly — full 8,734,682t/**131.3s**, outer 4,549,600t/104.7s —
and all 4 bins hash sha1-IDENTICAL to the 2026-07-09 pilot artifact. The 13:51Z failure is
classified as the pre-existing mapAsync/style-switch-teardown race (OLD-tree precedent,
E-2026-07-09-EXPORT-PERF e2e attempt 1) firing under heavy concurrent load. Ladder step 3
(pinned-worktree-at-HEAD) NOT NEEDED. CROSS-WORKSTREAM-NOTES update 4 amended with the
resolution. The race itself remains a real pre-existing load-sensitive flake — flagged for a
future item, not this arm's scope.

**ALL FIVE pilot styles now carry over certification by proven byte-identity (20/20 bins
sha1-identical):** HR, SR, Gyroid (checkpoint 3) + DragonScales vs the pilot artifact and
Voronoi vs the 02:48Z post-INTHASH intermediate artifact (this checkpoint). Consequences:
(a) the DS composite-ruler re-run (BATTERY→FWD→REV, the single most expensive certification)
is ELIMINATED — the E-2026-07-10-DS-PRODTRUTH verdict transfers verbatim (body 6,158 literal /
max 0.158 rim-class; ring 71,355@8/16 = 6.35% / max 0.0700; battery ALL PASS; wall coverage
0.0703); (b) Voronoi's post-INTHASH rows transfer (stride-1 row preferred: 64,327 over / max
0.1094 / Newton-worst 0.0739 / coverage 0.1403, vtxOnSurf p99 0.00002 OK).

**Aggregator extended (carry-over aware):** `_prod_batch_assemble.mjs` now (1) falls back to
pre-SINCE scorecard rows ONLY for the byte-identity-proven CARRIED set, labeling every such row
`carried:true` + basis string; (2) reads the DS baseline ndjson (moved aside by the reset) as
the DS carry-over source; (3) prefers stride=1 over stride>1 among candidate rows (Voronoi has
both); (4) surfaces `[carried: byte-identical]` in the md verdict column.

**Fresh certifications landing (wave 1, 9 styles concurrent; instrument note: first launch hit
the bash assignment-prefix-after-empty-expansion footgun — `$extra` expanding empty made
`NODE_OPTIONS=...` the command word, exit 127 ×9; relaunched with `env`, all healthy):**
FourierBloom **SHIPPED-CLEAN** (0 outliers stride-1, vtxOnSurf p99 0.00004 OK, coverage max
0.0037); SuperellipseMorph **SHIPPED-CLEAN** (0 outliers, coverage 0.0032); RippleInterference
**REGRESSION-borderline** (16 over / max 0.0104 grid-basis, Newton-worst **0.0065 < tol** —
likely §V11j grid-trap inflation of a sub-tol worst; noted for the verdict). Batch F captures
GeometricStar (4,770,450t/68.2s) + HexagonalHive (4,056,158t/70.3s) OK; wave 2 (GS+HH certs)
launched. SFB cert fork survived its wrapper task's kill (banked lesson re-confirmed) — CPU
3,160s+, still computing; left to finish (nothing blocks on it under the lifted cap).

**Attribution correction (supersedes checkpoint 2/3 phrasing):** generate-time deltas measure
the WHOLE uncommitted tree delta set — final-quadtree reuse + the integer-key quadtree codec
(`QuadtreeCellKeyCodec.ts`, untracked-new, per the Codex journal entry) + gate/validation
changes — NOT the reuse fix alone. DS −88.2% and Voronoi −76.9% vs pilot make this unmistakable
(reuse fix alone was ~23% of export time). Per-bucket attribution = the stage-timing pass.

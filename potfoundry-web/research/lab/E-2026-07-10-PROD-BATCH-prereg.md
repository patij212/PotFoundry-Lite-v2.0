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

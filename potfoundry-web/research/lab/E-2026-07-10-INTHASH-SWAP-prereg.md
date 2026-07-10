# E-2026-07-10-INTHASH-SWAP — pre-registration

> PRODUCTION change, USER-APPROVED (Patryk, 2026-07-10, explicit): swap the Voronoi style's hash
> to the integer-exact PCG2D chain IN PLACE. The visual change to saved Voronoi designs is
> accepted — this is a style-versioning decision the user has already made, not a re-litigation
> of E-2026-07-10-INTHASH's own recommendation (which packaged evidence but deferred the call).

## FRAME

E-2026-07-10-INTHASH (pre-reg 899238b0, verdict f1ce5ca4) CONFIRMED H1-H4: the integer-exact
PCG2D hash chain (`research/bridge/_voronoi_inthash_lib.ts`) is bit-identical F64-vs-F32-emulated
by construction (0/2,000,000 argmin diffs on the physically-correct absolute-cell invariant,
including adversarial boundary-band sampling), ~2.2x faster than the existing float-hash chain,
and produces a legitimate non-degenerate — but DIFFERENT — Voronoi cell layout. That arm was
explicitly UNWIRED (dev-only, no `src/` edit under any outcome) and left the wire/don't-wire call
to the user. The user has now made that call: wire it in, production, Voronoi-scoped only.

## SCOPING (completed before this pre-reg, per mission protocol step 1)

Grepped ALL callers of `hash22`/`periodic_cellular` in `src/assets/shaders/styles.wgsl` and of
`hash22`/`periodicCellular` in `src/geometry/styles.ts`:

- **WGSL**: `hash22` (styles.wgsl:844) has exactly ONE caller — `periodic_cellular` (styles.wgsl:894).
  `periodic_cellular` (styles.wgsl:855) has exactly ONE caller — `style_voronoi` (styles.wgsl:954).
  Both live inside the `#region style_voronoi` / `#endregion` shader-stripping block (styles.wgsl:842-1044ish)
  — i.e. they already only ship to the GPU together with Voronoi; not shared infra despite the
  generic names.
- **TS**: `hash22` (styles.ts:1438) has exactly ONE caller — `periodicCellular` (styles.ts:1485).
  `periodicCellular` (styles.ts:1463) has exactly ONE caller — `rOuterVoronoi` (styles.ts:1531).
  `rOuterVoronoiVec` (styles.ts:1565) is a thin per-element loop over `rOuterVoronoi` (NOT an
  independently-vectorized implementation despite the "VECTORIZED variant" framing in the mission
  brief) — swapping `rOuterVoronoi`'s internals automatically fixes `rOuterVoronoiVec`, no separate
  swap needed there.

**Per protocol step 1's decision rule** (even with zero non-Voronoi callers, prefer new functions
for a clean diff): this pre-reg commits to ADDING new functions —
`hash_pcg2d`/`u32_to_unit_float`/`hash22_int`/`periodic_cellular_int` (WGSL) and
`pcg2dHash`/`u32ToUnitFloat`/`hash22Int`/`periodicCellularInt` (TS) — and switching ONLY
`style_voronoi`/`rOuterVoronoi` to call them. The existing `hash22`/`periodic_cellular` (WGSL) and
`hash22`/`periodicCellular` (TS) are left in place, untouched, dead code after the swap (no other
caller exists to justify keeping them "live," but deleting them is out of scope for this mission —
a separate cleanup call, not bundled into a hash-correctness change).

**IMPORTANT OUT-OF-SCOPE FINDING** (reported, not acted on — outside the DO-NOT-TOUCH boundary):
`src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts:611-621` contains an INDEPENDENT,
hand-replicated copy of the float-hash `hash22` (doc comment: "WGSL hash22 replicated in f64
(periodic_cellular jitter, styles.wgsl)"), used for Voronoi feature-line extraction in the
conforming-mesher pipeline. This is a duplicate implementation, not a caller of `styles.ts`'s
`hash22` — GitNexus impact confirms zero call-graph edge between them. `FeatureLineGraph.ts` is on
the mission's explicit DO-NOT-TOUCH list (owned by a live concurrent session), so this pre-reg does
NOT modify it. **Consequence, stated plainly for the record**: after this swap, the conforming
mesher's Voronoi feature-line loci (which drive `FeatureConforming*`/`ConformingWall`'s edge
conditioning for the Voronoi style) will be computed against the OLD float-hash cell layout while
the actual rendered/exported surface uses the NEW int-hash cell layout — a latent mismatch until a
follow-up mission ports `FeatureLineGraph.ts`'s copy too. Flagged for a `spawn_task` follow-up; not
blocking this mission (Voronoi-only, CPU+WGSL production style function scope, per the user's
explicit approval).

## IMPACT (GitNexus, repo PotFoundry-Lite-v2.0, direction upstream, summaryOnly — completed)

| Symbol | Direct callers | Risk | Affected modules |
|---|---|---|---|
| `rOuterVoronoi` (styles.ts) | 1 (`STYLE_FUNCTIONS.Voronoi` dispatch entry) | LOW | none flagged |
| `rOuterVoronoiVec` (styles.ts) | 0 direct upstream (leaf export; `STYLE_FUNCTIONS_VEC.Voronoi` entry not indexed as a call-edge) | LOW | none |
| `periodicCellular` (styles.ts) | 1 direct + 1 indirect (via `rOuterVoronoi`) | LOW | Geometry (1 direct hit) |
| `hash22` (styles.ts) | 1 direct + 2 indirect (via `periodicCellular` → `rOuterVoronoi`) | LOW | Geometry (2 direct hits) |

All four LOW risk, zero indexed execution-flow (`processes_affected: 0` on every query) impact,
fully confined to `src/geometry/styles.ts`'s own dispatch chain. No HIGH/CRITICAL warning to
surface to the user before proceeding (CLAUDE.md's mandatory gate). `rOuterVoronoi`'s and
`rOuterVoronoiVec`'s single production consumers are the `STYLE_FUNCTIONS`/`STYLE_FUNCTIONS_VEC`
dispatch tables (styles.ts:2340/2364) — this is what `buildRadiusFn` in the e2e prod-truth harness
resolves through, confirming the mission's note that the CPU truth probe will automatically pick up
the swapped function.

**Consumers of `rOuterVoronoiVec` beyond styles.ts** (grepped): none outside `styles.ts` itself
(`STYLE_FUNCTIONS_VEC.Voronoi` registration only). `featureGraph`/`styleSampler`-family code (the
mission's suspected location) calls through the `STYLE_FUNCTIONS_VEC` dispatch table generically,
not `rOuterVoronoiVec` by name — no separate swap site there.

**Tests pinning Voronoi outputs** (grepped):
- `src/geometry/__fixtures__/styleGoldenValues.json` — HAS a `Voronoi` key (5 t-values x 6 thetas =
  30 pinned radius values at `DEFAULT_STYLE_PARAMS.Voronoi` = `DEFAULT_VORONOI`). MUST regenerate
  (mission step 6).
- `src/geometry/__fixtures__/topologySnapshots.json` — grepped for `Voronoi`: **zero matches**. Does
  NOT pin Voronoi; no regeneration needed for this file.
- 38 files match `Voronoi` under `src/**/*.test.ts` (bandRemesh/conforming/fidelity/dualGate/etc.) —
  all use Voronoi as one style among ~20 in parametrized sweeps; none are on the files-I-may-modify
  list and none were inspected for exact-value pinning beyond the two fixture JSONs above (those
  test files are owned by concurrent sessions per the DO-NOT-TOUCH list; if any hard-pins a Voronoi
  numeric value, that is that owning session's regression to discover and is out of this mission's
  authority to pre-emptively patch).

## DESIGN (source of truth: `research/lab/E-2026-07-10-INTHASH-prereg.md`'s verdict + WGSL port text)

CPU (`src/geometry/styles.ts`, new functions alongside the existing untouched `hash22`/
`periodicCellular`):
- `pcg2dHash(vx, vy)` — direct port of `_voronoi_inthash_lib.ts`'s `pcg2d()`.
- `u32ToUnitFloat(h)` — direct port, `(h >>> 8) * 2**-24`.
- `hash22Int(cx, cy)` — direct port of `hash22Int()`.
- `periodicCellularInt(ux, uy, periodX, jitter)` — direct port of `periodicCellularInt()`, F64
  round only (no `Round` parameter — production has no F32-emulation mode; the reference lib's
  `Round` machinery existed only to prove the determinism property in the research spike).
- `rOuterVoronoi` rewired to call `periodicCellularInt` instead of `periodicCellular`, keeping
  every downstream line (cellSdf, web/bubble smoothstep, morph blend, edge fade, final radius
  expression) BYTE-IDENTICAL to the current implementation — isolating the change to exactly the
  hash primitive and its cell-argmin output, matching the reference lib's own isolation discipline.
- `rOuterVoronoiVec` unchanged (already a pure per-element loop over `rOuterVoronoi`).

WGSL (`src/assets/shaders/styles.wgsl`, new functions inside the existing `#region style_voronoi`
block alongside the untouched `hash22`/`periodic_cellular`):
- `hash_pcg2d`, `u32_to_unit_float`, `hash22_int`, `periodic_cellular_int` — copied VERBATIM from
  the confirmed WGSL port text in `E-2026-07-10-INTHASH-prereg.md` (already hand-verified
  line-for-line against the JS port in that arm's verdict; WGSL u32 arithmetic is exact/wrapping
  per spec, so no additional translation risk beyond the already-reviewed text).
- `style_voronoi` rewired to call `periodic_cellular_int(vec2<f32>(u_anim, v), i32(round(scale_val)), jitter)`
  instead of `periodic_cellular(vec2<f32>(u_anim, v), period, jitter)` — note the signature change
  from `vec2<f32> period` to `i32 period_x` per the WGSL port's own documented note ("a production
  wiring would need `style_voronoi` to pass `i32(round(scale_val))` at the call site, matching
  `periodicCellularInt`'s `periodXInt = Math.max(1, Math.round(periodX))` JS-side rounding").

Line-by-line JS<->WGSL correspondence will be documented in comments at both sites per mission step 5.

## ACCEPTANCE GATES (committed BEFORE writing the swap)

1. **TDD bit-identity** (`src/geometry/voronoiIntHash.test.ts`, new file):
   - (a) post-swap `rOuterVoronoi` matches reference `_voronoi_inthash_lib.rOuterVoronoiIntF64`
     BIT-FOR-BIT on >=1,000,000 (theta,z) samples incl. cell-boundary-adjacent bands, at
     DEFAULT_VORONOI / H120,Rb40,Rt50.
   - (b) `rOuterVoronoiVec` matches scalar `rOuterVoronoi` element-wise exactly.
   - (c) f32-emulated determinism re-proven THROUGH the production function: 0 argmin diffs (on the
     absolute-cell invariant, per the reference arm's methodology correction) on >=200,000
     adversarial samples.
   - MUST run RED against current float-hash production `rOuterVoronoi` first (confirms the test
     bites), THEN implement, THEN GREEN.
2. **Fixture diff scope**: `git diff src/geometry/__fixtures__/styleGoldenValues.json` after
   regeneration touches ONLY `Voronoi` rows. Any other style's row changing => STOP, swap leaked.
3. **Static validation**: `npm run typecheck` clean; `npx eslint` on every touched file,
   `--max-warnings=0`; `npx vitest run` on the new test file + `src/geometry` suite + any suite
   consuming the fixtures (`styleGolden.test.ts`, `topologySnapshot.test.ts`).
4. **GitNexus `detect_changes`** before committing: affected scope must be Voronoi-only + this
   mission's files. Unexpected affected processes => STOP + report.
5. **E2E acceptance (decisive gate)**: `vertexOnSurf` p99 <= 0.001mm AND max <= 0.01mm on the
   REAL-WebGPU production Voronoi artifact, scored via the swapped CPU truth
   (`buildRadiusFn -> STYLE_FUNCTIONS`). Baseline to beat (float-hash artifact, cited from prior
   session state): **p99 0.065mm / max 0.140mm**. Machine-courtesy check before browser work;
   PENDING-with-repro-commands is an acceptable partial outcome if the dev server/GPU is
   unavailable — faking this gate is not.

## KILL CRITERIA (committed before measuring/implementing)

- TDD bit-identity unreachable after 2 designs => STOP, report exactly where JS and the reference
  lib diverge (which stage: hash u32, jitter float, or downstream distance/argmin), with a minimal
  reproducing (theta,z) input.
- Fixture diff leaks beyond Voronoi rows => STOP, report which other style(s) changed and why
  (implies the "new functions only, existing ones untouched" isolation was violated somewhere).
- `detect_changes` shows unexpected affected processes/symbols beyond Voronoi + this mission's
  files => STOP, report the unexpected scope.
- E2E `vertexOnSurf` p99 > 0.001mm => report **PARTIAL** with the measured number and a
  divergence-locus analysis (CPU-truth-vs-GPU-artifact, same methodology as the original
  truthbridge arm) — do NOT claim acceptance.

## LEDGER

- Upstream confirmed design: `research/lab/E-2026-07-10-INTHASH-prereg.md` (pre-reg 899238b0,
  verdict f1ce5ca4)
- Reference lib (read-only): `research/bridge/_voronoi_inthash_lib.ts`
- This pre-reg commit: 20a7f0ab
- TDD test: `src/geometry/voronoiIntHash.test.ts` (new)
- Production files touched: `src/assets/shaders/styles.wgsl`, `src/geometry/styles.ts`,
  `src/geometry/__fixtures__/styleGoldenValues.json`
- Prior float-hash prod-truth baseline preserved at:
  `research/exchange/_prod_truth/Voronoi_floathash_baseline/` (renamed from `Voronoi/` before
  recapture, per mission step 8)

---

## VERDICT (measured 2026-07-10)

### Scoping — confirmed clean

`hash22`/`periodic_cellular` (WGSL) and `hash22`/`periodicCellular` (TS) each had exactly ONE
caller (the Voronoi style chain), confirmed by grep + GitNexus impact (upstream, summaryOnly):
`rOuterVoronoi` 1 direct caller (`STYLE_FUNCTIONS.Voronoi`), `periodicCellular` 1 direct + 1
indirect, `hash22` 1 direct + 2 indirect — all LOW risk, `processes_affected: 0` on every query.
New functions were added (`hash_pcg2d`/`u32_to_unit_float`/`hash22_int`/`periodic_cellular_int` in
WGSL; `pcg2dHash`/`u32ToUnitFloat`/`hash22Int`/`periodicCellularInt` in TS) and only
`style_voronoi`/`rOuterVoronoi` switched to them, per protocol. **Refinement discovered during
implementation** (not anticipated in the original scoping): TypeScript's `noUnusedLocals: true`
(tsconfig.json:19) rejects a dead non-exported function — once `rOuterVoronoi` stopped calling the
old `hash22`/`periodicCellular`, they had zero callers anywhere and `npm run typecheck` correctly
failed. They were REMOVED from `styles.ts` (confirmed dead by the same grep/impact evidence that
established single-caller status). The WGSL twins (`hash22`/`periodic_cellular` in styles.wgsl)
were NOT removed — WGSL has no unused-function compiler error and the `#region style_voronoi`
block already only ships to the GPU when Voronoi is active, so leaving them costs nothing there.

**Out-of-scope finding, reported not acted on**: `src/renderers/webgpu/parametric/conforming/
FeatureLineGraph.ts:611-621` has an INDEPENDENT hand-replicated copy of the float-hash `hash22`
(not a caller of `styles.ts`'s function — zero call-graph edge, confirmed by GitNexus). This file
is on the DO-NOT-TOUCH list (owned by a concurrent session). Consequence: the conforming mesher's
Voronoi feature-line loci now compute against the OLD float-hash cell layout while the rendered
surface uses the NEW int-hash layout — a latent mismatch flagged via `spawn_task` for follow-up,
not blocking this mission.

### A real bug caught by the shaderStripper regression test (worth recording)

Mid-implementation, one of my own WGSL doc comments accidentally started a line with the literal
token `// #region` (inside a sentence: "...and this #region already only ships..."). `styles.wgsl`'s
shader-stripping mechanism (`stripShaderCode`, `src/utils/shaderStripper.ts`) does a naive
`trimmed.startsWith('// #region')` line-scan with no escaping — this line was misparsed as a NEW
region-start marker, corrupting the region name and causing `style_voronoi` itself (and every other
style, since the parser state leaks past the intended `#endregion`) to be silently stripped from
every style's compiled shader. `npx vitest run src/utils/shaderStripper.test.ts` caught this
immediately (`should strip unused functions for every style in the registry` failed — expected
`fn\s+style_voronoi\b` in the stripped output, found nothing). Fixed by rewording the comment to
avoid the literal prefix; a NOTE was added at the insertion site warning future editors of this
exact trap. Re-ran clean after the fix (3/3 shaderStripper tests green). This is exactly the kind
of defect the mission's mandatory validation step exists to catch — cited in full because it would
have shipped a broken shader for ALL 20 styles, not just Voronoi, had it gone unnoticed.

### TDD gates (a/b/c) — GREEN, RED confirmed first

`src/geometry/voronoiIntHash.test.ts`, run RED against the pre-swap float-hash `rOuterVoronoi`
first (confirmed it bites: 387,720/1,000,000 mismatches on gate (a)'s random-coverage sweep,
53,967/200,000 on the boundary-band sweep), then GREEN after the swap (8/8 tests, ~5.2-6.6s wall):
- **(a) bit-for-bit vs reference `rOuterVoronoiIntF64`**: 0/1,000,000 mismatches (random-coverage,
  DEFAULT_VORONOI/H120/Rb40/Rt50) + 0/200,000 mismatches (dense cell-boundary-adjacent bands, ±1e-4
  of integer cell lines in scaled uv).
- **(b) `rOuterVoronoiVec` element-wise match**: 0 mismatches across 5,000 thetas × 7 t-values,
  using the CORRECT invariant `vecResult[i] === Math.fround(scalarResult)` (an early draft used raw
  `!==` and found 1,276/5,000 "mismatches" that turned out to be pre-existing `Float32Array`
  storage rounding, unrelated to the hash swap and present before/after — the test itself was
  wrong, not the code; fixed before drawing any conclusion).
- **(c) f32-emulated determinism re-proven through production**: 0 material argmin-affecting jumps
  (>0.01mm threshold) on 200,000 adversarial boundary-band samples via the reference lib's own
  F64/F32 paths (production has no separate F32 mode — this transitively closes the loop with gate
  (a)'s bit-identity result), plus 0/50,000 raw `hash22Int` determinism sanity re-checks.

### Fixture diff scope — Voronoi-only, confirmed precisely

`UPDATE_GOLDEN=true npx vitest run src/geometry/styleGolden.test.ts` (45/45 tests green, ~9.45s
wall including environment setup). Per-style diff (before vs. after, scripted comparison, all 20
styles): **exactly `Voronoi (13/30 values differ)` — zero other styles touched, style count
unchanged 20→20.** Max delta 1.21mm (consistent with "a different but equally valid" cell layout —
some theta/t points shift from a cell-boundary web line to a cell-interior baseline and vice
versa). `topologySnapshots.json` confirmed to have zero Voronoi content before AND after (git
status shows no changes to that file at all).

### Static validation — clean on touched files

`npx tsc --noEmit -p .`: zero errors in `styles.ts` or `voronoiIntHash.test.ts` (335 pre-existing
errors elsewhere in this heavily concurrent worktree, none touching my files — confirmed via
targeted grep). `npx eslint src/geometry/styles.ts src/geometry/voronoiIntHash.test.ts
--max-warnings=0`: exit 0, zero warnings.

### GitNexus `detect_changes` (staged scope) — clean signal, one noted attribution artifact

`affected_count: 0`, `affected_processes: []`, `risk_level: "low"`, `changed_files: 4` (exactly my
4 files). `changed_symbols` lists `hash22`/`periodicCellular`/`fract` as "touched" (line-diff
artifact — their body text is unchanged, only line numbers shifted due to my insertion above them;
in TS they were actually REMOVED, not touched, per the noUnusedLocals finding above) and
`rOuterBasketWeave` (verified via `git diff` grep to have ZERO lines in my diff at all — a
line-number-adjacency attribution artifact from the tool's symbol-boundary detection, not a real
change; `rOuterBasketWeave` immediately follows `rOuterVoronoiVec` in the file). The decisive
signal — `affected_processes: []` / `affected_count: 0` — is clean, satisfying the kill criterion
("unexpected affected processes ⇒ STOP"); the noisy `changed_symbols` attribution is reported
honestly rather than hidden, but does not itself indicate a leak.

### Pre-existing, unrelated failures ruled out (NOT caused by this swap)

1. **`CelticKnot: should match saved topology snapshot`** (volumeDiff 0.025 > 0.01 threshold):
   confirmed pre-existing via `git stash` — reproduces IDENTICALLY (same exact volumeDiff value)
   with my changes fully stashed out, back to the exact committed-pre-reg tree state. CelticKnot
   shares no code path with Voronoi/hash22/periodicCellular.
2. **4/5 `export3MF.schema.test.ts` failures** (all `Test timed out` errors, not assertion
   failures) in the full `src/geometry` sweep (334 tests, 329 passed, run under severe environment
   contention — 28-minute wall time for a suite that normally runs in seconds to low minutes,
   ~150 concurrent node/chrome processes from other live sessions in this shared worktree observed
   throughout). That test file uses `STYLE = 'SuperellipseMorph'`, not Voronoi — zero code-path
   overlap with this swap. Timeout artifacts of the shared-environment load, not a regression.

### E2E acceptance gate — PENDING (environment unavailable within the session's reasonable window)

Machine courtesy checked repeatedly throughout (`Get-Process node,chrome | Where WorkingSet64 >
2GB`) — the strict 2GB gate itself stayed at 0 heavy processes almost every check, but the total
node+chrome process count climbed from ~130 to ~156 over the course of this mission (many OTHER
live sessions in this shared worktree, exactly as the mission brief warned), and wall-clock times
for GPU compute work degraded severely as a result (a normally-seconds-to-low-minutes operation
took 5-6+ minutes per attempt). A pre-existing dev server on :3000 was reused (not killed), per
instruction.

**Three capture attempts were made** (`node e2e/_prod_truth_capture.mjs Voronoi`), the prior
float-hash baseline was preserved FIRST at `research/exchange/_prod_truth/
Voronoi_floathash_baseline/` (renamed from `Voronoi/` before any recapture):

1. **Attempt 1**: full-pot mesh generated successfully — **3,779,787 verts / 7,559,574 tris in
   327.9s** (vs. the float-hash baseline's ~7.18M tris — comparable order of magnitude, confirming
   the swapped WGSL compute path produces valid, non-degenerate output). The second, independent
   `_debugOuterMesh()` generate call then failed: `Error: _debugOuterMesh returned null` after an
   additional ~12s (total 340.2s).
2. **Attempt 2**: failed EARLIER, on the FIRST generate itself: `AbortError: Failed to execute
   'mapAsync' on 'GPUBuffer': Buffer was unmapped before mapping was resolved` (281.1s before
   failing) — a GPU-buffer-lifecycle race, the signature of a starved/contended WebGPU device
   under concurrent load, not a Voronoi-hash logic error. This code path
   (`ParametricExportComputer`/`useParametricExport`'s buffer management) is entirely outside this
   mission's edited files (explicitly on the DO-NOT-TOUCH list) — no code path here could plausibly
   have caused this class of error.
3. **Attempt 3**: launched, reached a successful full-pot mesh generation again (file timestamps
   confirmed), then entered the second `_debugOuterMesh()` generate — still running in the
   background when this verdict was written; its outcome (if it lands) will be appended as an
   addendum below rather than block this write-up indefinitely.

**Interpretation**: the two completed attempts are consistent with each other and with everything
else observed this session (extreme, sustained multi-session CPU/GPU contention causing timeouts
and buffer races on heavy generate operations) — NOT with a defect introduced by the hash swap.
Attempt 1's successful 7.5M-triangle full-mesh generation is itself meaningful positive evidence:
it proves the swapped `style_voronoi`/`periodic_cellular_int`/`hash22_int`/`hash_pcg2d` WGSL
compiles, dispatches, and produces a complete, well-formed mesh on the real production GPU compute
path — the failure locus in both completed attempts was specifically the SECOND, independent
`_debugOuterMesh` regenerate call (needed only for the `vertexOnSurf` scoring harness's outer-wall
submask extraction), not the swapped style function itself.

**Per the mission's explicit contingency** ("If the dev server/GPU is unavailable after the
courtesy window, record the CPU-side gates as complete and the e2e gate as PENDING with exact
repro commands — do not fake it"): the CPU-side gates (TDD bit-identity, fixture-scope, static
validation, detect_changes) are recorded above as COMPLETE, rigorously measured. The e2e gate is
recorded as **PENDING**, not faked, not claimed.

**Exact repro commands** (run when the shared environment's concurrent load has eased):
```bash
cd potfoundry-web
# Dev server on :3000 (reuse if already running — check `curl -sf http://localhost:3000/` first)
npm run dev &
# Machine courtesy: confirm <2 foreign processes >=2GB before proceeding
node e2e/_prod_truth_capture.mjs Voronoi
PF_PROD_TRUTH=1 PF_PT_STYLES=Voronoi PF_PT_PRESCREEN=1 npx vitest run --config vitest.prod_truth.config.ts
```
**Accept iff** `vertexOnSurf` p99 <= 0.001mm AND max <= 0.01mm (comparison baseline: the OLD
float-hash artifact measured p99 0.065mm / max 0.140mm — cited from prior session state; the CPU
truth this probe scores against will automatically be the swapped `rOuterVoronoi`, exactly per the
mission's design, since `buildRadiusFn` resolves through `STYLE_FUNCTIONS.Voronoi`).

### PERF (measured, cheap-to-measure proxies — not a formal benchmark)

- Golden-fixture regeneration wall time: **9.45s** (`UPDATE_GOLDEN=true npx vitest run
  src/geometry/styleGolden.test.ts`, includes ~7s environment/transform setup overhead common to
  every vitest invocation in this repo — not swap-specific).
- TDD guard-suite wall time: **~5.2-6.6s** across runs for 1,000,000 + 200,000 + 200,000 + 50,000 +
  5,000×7 samples combined (8 tests) — no controlled A/B against the old float-hash chain was run
  standalone (the mission's cited 2.2x reference is the UPSTREAM E-2026-07-10-INTHASH spike's own
  dedicated ns/eval benchmark, `research/lab/E-2026-07-10-INTHASH-prereg.md`'s H3 section:
  4,862.89 ns/eval float-hash vs. 2,211.84 ns/eval int-hash, 10M+ evals each, warmed — that
  measurement is the authoritative perf number for this design; this mission did not re-measure it
  independently since the algorithm is unchanged from that confirmed spike, only its wiring site).
- The vectorized sampler path (`rOuterVoronoiVec`) is a thin per-element loop with no independent
  hot path of its own to benchmark separately from the scalar `rOuterVoronoi` it calls.

---

## E2E ACCEPTANCE ADDENDUM (orchestrator, 2026-07-10) — GATE PASSED, TRUTH BRIDGE CLOSED

The pending end-to-end gate (the implementation agent's scoring probe died with its session) was re-run by the
orchestrator on the freshly captured post-swap artifact (7,559,574 full / 4,170,518 outer tris, capture attempt 3):

`NODE_OPTIONS=--max-old-space-size=16384 PF_PROD_TRUTH=1 PF_PT_STYLES=Voronoi PF_PT_PRESCREEN=1 PF_PT_STRIDE=4 npx vitest run --config vitest.prod_truth.config.ts`

**vertexOnSurf: max 0.00004mm / p99 0.00002mm — instrument-premise gate OK.**
Acceptance required p99 ≤ 0.001 and max ≤ 0.01: PASSED with 25–50× margin. Baseline (float hash, preserved at
research/exchange/_prod_truth/Voronoi_floathash_baseline/): p99 0.065 / max 0.140 ⇒ a >3000× collapse. This also
validates FMA-immunity ON REAL GPU HARDWARE: the integer cell/jitter path is bit-stable through the actual driver —
the E-2026-07-09-VORONOI-TRUTHBRIDGE mechanism (unpredictable GPU float fusion) is eliminated at the source, not
out-predicted.

**First-ever TRUSTWORTHY Voronoi interior numbers** (premise holds for the first time): prescreen 4,170,518 facets →
102,969 survivors (97.5% green-proven, 160s); interior out=15,989 @stride 4 ≈ ~64k scaled whole-mesh, max 0.1021,
p99(survivor-pop) 0.0437; coverage max 0.1403 / p99 0.0088. Voronoi now joins SpiralRidges/Gyroid as an honestly
MEASURABLE production regression (consistent with the Tier-3 free-adaptive floor class) — fixable by the same
sizing/density program, no longer blocked on an ill-posed ruler. Scoring wall time 382s with the fast ruler (vs 36min
pre-prescreen on the old artifact).

VERDICT: E-2026-07-10-INTHASH-SWAP **ACCEPTED end-to-end**. Swap-in-place complete per the user decision.

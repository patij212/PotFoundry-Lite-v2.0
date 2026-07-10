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
- This pre-reg commit: [pending]
- TDD test: `src/geometry/voronoiIntHash.test.ts` (new)
- Production files touched: `src/assets/shaders/styles.wgsl`, `src/geometry/styles.ts`,
  `src/geometry/__fixtures__/styleGoldenValues.json`
- Prior float-hash prod-truth baseline preserved at:
  `research/exchange/_prod_truth/Voronoi_floathash_baseline/` (renamed from `Voronoi/` before
  recapture, per mission step 8)
- Verdict: [to be appended after implementation + validation]

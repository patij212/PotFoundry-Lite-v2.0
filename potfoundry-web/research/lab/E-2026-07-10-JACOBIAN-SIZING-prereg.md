# E-2026-07-10-JACOBIAN-SIZING — warp-Jacobian-aware sizing for the SpiralRidges masked floor [PRE-REGISTERED — kill-criteria committed BEFORE measuring]

**Scope discipline.** This experiment may only create/modify files matching `research/bridge/_jacobian_sizing*`
and `research/lab/E-2026-07-10-JACOBIAN-SIZING*`. Data lives under `research/exchange/_jacobian_sizing/`
(gitignored). `research/bridge/_analytic_floor_lib.ts`, `_gyroid_prodclose_lib.ts`, `_gyroid_truthLib.ts`,
`_pf_rebaselineRuler.ts`, and all `src/` production files are READ-ONLY imports — nothing in them is edited.
Verdict-run measurements execute in a **pinned git worktree at the exact HEAD commit** (node_modules
junctioned, no gitignored baselines needed — H0 and the C1-match numbers are hardcoded literals below, not
read from another experiment's gitignored state file), per the standing practice banked in
`agents_journal.md` (2026-07-10, E-2026-07-10-ANALYTIC-FLOOR-MASKED entry): the shared tree carries
concurrent uncommitted edits to the conforming core (confirmed dirty at pre-reg time: `ConformingWall.ts`,
`WatertightAssembly.ts`, `PeriodicBalancedQuadtree.ts`, `QuadtreeTriangulator.ts`,
`FeatureConformingTriangulator.ts`, `conforming/index.ts`) and is compile-hazardous for a multi-million-tri
build.

## FRAME

`E-2026-07-10-ANALYTIC-FLOOR-MASKED` (commit `fa7e8c48`) fired **KILL-A with a NEW-MECHANISM classification**
on the crest-band-masked analytic curvature floor for SpiralRidges: at resU512/resT128 the budget closed to
1.223x (6,956,244 tris, gate <=8,530,251) but fidelity was **unchanged** — 2,764 facets still over 0.01mm,
worst == the flag-off baseline's 0.03575, despite the floor demanding >=0.8x true-kappa at **100%** of the
failing loci (median kTrue/kFloor=0.39 — the floor over-reads pointwise-true as designed). The verdict's own
words: "the sizing demand was RIGHT and the delivered mesh does not obey it — a REFINEMENT-DELIVERY class,
not a floor/grid class." Named mechanism: **WARP-JACOBIAN SAG DILUTION** — `MetricSizingField` reads the
PLAIN (unwarped) `GpuSurfaceSampler` by construction (`ConformingWall.ts` ~line 325, `buildQuadtreeAtScale`
constructs `new MetricSizingField(sampler, ...)` where `sampler` is the plain wall grid — confirmed by
reading the file directly at HEAD, not the dirty tree); only the **efg** sampler
(`composedWallSampler(plain, {uWarp,tWarp,helix})`, `PullbackMetric.ts:160-179`) sees the post-triangulation
domain warp, and it only arms shaped-template triangulation, never sizing (`ConformingWall.ts` comment,
verbatim: "the per-wall efg samplers (warp-composed maps) arm the shaped templates; sizing stays on the
plain samplers"). SpiralRidges' helical ridges are pinned onto mesh columns by a **post-triangulation**
u-remap (`CreaseHelixWarp.applyHelixWarp`); realized 3D chord sag over plain-domain sizing runs ~J^2, where
`J = d(uFinal)/du` is the local derivative of that remap. NAMED FOLLOW-UP (not run, this experiment's
mandate): "warp-Jacobian-aware sizing... extending [efg] composition to the SIZING field... predicted to
close within the C1 budget since compensation applies only in compression zones" (journal, commit `fa7e8c48`).

## THE WARP CHAIN (verified against HEAD, not the dirty tree)

`composedWallSampler`'s exact branch order (`PullbackMetric.ts:160-179`, doc-verified against
`ParametricExportComputer.ts`'s post-assembly warp-application loops):

```
tEff   = tWarp active ? applyTWarp(tWarp, t) : t
uEff   = uWarp active ? applyUWarp(uWarp, u) : u
uFinal = (helix active AND uWarp NOT active) ? applyHelixWarp(helix, uEff, tEff) : uEff
```

For SpiralRidges specifically (confirmed empirically below, stage `fd`): `creaseChoice.warp.isIdentity ===
true` (no vertical creases — SpiralRidges is a smooth sinusoid, not a faceted style) and
`helixChoice.warp.isIdentity === false` (k=9 helical ridges pinned). `CreaseHelixWarp.applyHelixWarp`:

```
u_final(u,t) = phi0(u) - shearRate*t + offset,   phi0 = applyUWarp(helix.base, u)
```

`phi0` is a **periodic, piecewise-LINEAR** circle homeomorphism (the k=9 seam-avoiding anchor pins, snapped
onto a coarse dyadic column lattice by `chooseCreaseGrid`); the shear term is a pure per-row translation.
Because both `applyUWarp` and `applyTWarp` are piecewise-linear, `d(uFinal)/du` and `d(uFinal)/dt` are
piecewise-**constant**, discontinuous only at the anchor kinks (dyadic by construction) — no finite
differences are needed at runtime; `PullbackMetric.ts` already exports the exact segment-slope readers
`uWarpDerivative(warp, u)` / `tWarpDerivative(warp, t)` used below.

## J DERIVATION (chain rule; verify-then-use per the mission brief)

Within one linear segment (away from a kink), `W: (u,t) -> (uFinal, tEff)` is **exactly affine** — both
warps have zero second derivative there, so no curvature-of-the-warp correction term exists (this is why
the analytic Jacobian below is compared against FD of the actual warp map for validation, not derived from
first principles alone — see `research/bridge/_jacobian_sizing_lib.ts`'s `domainWarpJacobian` doc comment
for the full derivation written into the code):

- **helix branch** (`uWarp` identity, so `uEff = u` exactly):
  `dUfinal/du = phi0'(u) = uWarpDerivative(helix.base, u)` **(this experiment's `Ju`)**
  `dUfinal/dt = -shearRate * tWarpDerivative(tWarp, t)` (0 if no t-warp active) — the shear cross-term
  `dTeff/dt   = tWarpDerivative(tWarp, t)` (or 1)
- **uwarp branch** (helix inactive, u-warp active): `Ju = uWarpDerivative(uWarp, u)`, shear = 0.
- **identity branch**: `Ju = Jt = 1`, shear = 0.

**DESIGN DECISION (pre-registered): only `Ju` composes into the sizing correction; the shear cross-term is
NOT folded in.** Rationale: (1) the task's own hint names "du'/du" specifically; (2) `Ju` is the direct,
row-local measure of how densely plain-domain columns cover the TRUE (post-warp) angular domain — the
dominant axis for a cross-ridge (radial) curvature floor; (3) the shear's contribution to triangle SHAPE
(not sizing) is already handled by the existing efg/shaped-template mechanism; (4) folding shear into a
*scalar* kappa multiplier is not well-posed (shear is a directional/off-diagonal distortion, not a
length-scale) — a sound treatment would need the full tensor pullback `I_Q = M^T I_P M` (M = the warp's 2x2
Jacobian), which is NOT expressible through the `curvatureFloor(u,t): number` hook (a scalar function) —
out of reach without new production wiring. This is flagged as the first candidate follow-up if KILL-J1
fires.

**Composition into the existing hook (pre-registered, no new production wiring):**

```
kappa_jFloor(u,t) = baseFloor.curvatureFloor(u,t) * ( Ju(u,t)^2 > 1 ? Ju(u,t)^2 : 1 )
```

where `baseFloor` is the existing, KILL-A-validated `buildAnalyticCurvatureFloor` (unmodified, read-only
import). **DESIGN DECISION: raise-only (never lower).** `MetricSizingField` combines
`kappa = max(kappa_sampler_plain, curvatureFloor(u,t))` (max, not multiply) — a "lower kappa when `Ju<1`"
design is not expressible through this hook without also touching the sampler's own reading (which would
require editing `MetricSizingField.ts`, out of scope), AND the base floor is independently validated at
100% of the FAILING loci (`kFloor >= 0.8*kTrue`) — multiplying it down anywhere risks regressing loci that
were never part of the diagnosed failure class. This is the same "smooth regions where the floor <= the
sampler are unaffected" philosophy the original floor hook was built on (`SizingOptions` doc comment).

## INSTRUMENT VALIDATION (run BEFORE this pre-registration measures the mesh hypothesis — pure math, no
mesh; the same "ANALYTIC PRIOR" pattern the parent arms used)

**Stage `fd` (2026-07-10, this machine):** `validateJacobianFD` against 100,000 random `(u,t)` probes on
SpiralRidges' real `prepareTwinInputs()` warp choice (imported read-only from `_analytic_floor_lib.ts`),
excluding a 1e-4 margin around the 9 anchor kinks (209 probes excluded, 0.2%) where the derivative is
genuinely discontinuous (right-segment-slope convention, not a bug). Central FD step `h=1e-6`.

```
nProbes=100000  maxAbsErrJu=1.005e-10  maxRelErrJu=6.839e-11  maxRelErrShear=3.576e-10
```

**PASSES the pre-registered gate (`max rel-err < 1e-6`) by four orders of magnitude.** The analytic `Ju` is
correct against the actual composed warp map, not merely self-consistent.

**Stage `fleet` (mandatory diagnostic, run now regardless of the mesh verdict below):** dense
2048x512 `J^2` field over `(u,t)` for three styles at the SpiralRidges body dims (H120/Rb40/Rt50) and
default style options:

| style | branch | maxJ2 | p99J2 | meanJ2 | area J2>1 | area J2>1.5 |
|---|---|---|---|---|---|---|
| SpiralRidges | helix | 3.1605 | 3.1605 | 1.0864 | 12.50% | 12.50% |
| GyroidManifold | **identity** | 1.0 | 1.0 | 1.0 | 0% | 0% |
| DragonScales | **identity** | 1.0 | 1.0 | 1.0 | 0% | 0% |

**FINDING (narrows the "fleet-wide" framing from the KILL-A verdict):** at default parameters, GyroidManifold
and DragonScales currently route their sharp features through `general-curve` feature-line embedding
(band-edge contours / ring embeddings, per `2026-07-10-program-consolidation.md` §A — a mechanism that
inserts constrained edges into the triangulation directly), NOT through `CreaseUWarp`/`CreaseTWarp`/
`CreaseHelixWarp` post-triangulation domain remapping. `extractWarpChoices` (which filters
`featureGraph.lines` by `kind==='vertical-crease'|'horizontal-band'|'helical-crease'`, exactly mirroring
`prepareTwinInputs`) finds none for either style — `J===1` everywhere, i.e. **zero exposure to THIS specific
mechanism** for these two styles at these settings. WARP-JACOBIAN SAG DILUTION is confirmed to affect styles
that pin ridges via the crease/helix warp family (SpiralRidges); it is not shown to affect Gyroid/DragonScales
by this measurement — their own conforming recipes (band-edge/ring embedding) are a structurally different
mechanism and outside this experiment's scope. "Fleet-wide" should be read as "every warp-family style," a
narrower set than "every style with sharp features."

SpiralRidges' own field: exactly 12.50% of the `(u,t)` domain sits on a single `J^2=3.16` plateau (`Ju
~1.778`, one of the k=9 anchor-pin segments where the coarse dyadic source column is stretched over a wider
true-angle span); the rest of the domain has `Ju<=1` (no correction applied, per the raise-only design).

## HYPOTHESIS (falsifiable)

Composing `Ju^2` into the SpiralRidges analytic floor at the SAME masked-C1 sizing-grid resolution
(resU=512/resT=128) that KILL-A measured — no other knob moved — closes the every-facet <=0.01mm Newton
acceptance (0 facets over) while holding full-pot tris <=1.5x the flag-off twin (<=8,530,251), because the
correction applies only in the 12.5%-area compression zone the KILL-A classification located (median
`kTrue/kFloor=0.39` there is consistent with needing a multiplicative boost in roughly the 2-3x range that
`maxJ2=3.16` supplies).

## METHOD (ordered; instruments below are committed in this same file BEFORE the mesh-build stages run)

1. **IMPACT (repo mandate):** this experiment touches ZERO production symbols (no `src/` edits at all — the
   correction is expressed entirely as a wrapped `curvatureFloor` closure passed into the EXISTING,
   already-threaded `outerCurvatureFloor` hook via the research-only twin). `gitnexus impact` is therefore
   run informationally on the hook's consumers (`MetricSizingField`, `buildQuadtreeAtScale`,
   `buildConformingWall`, `assembleWatertight`) to confirm no NEW blast radius is introduced beyond what
   `E-2026-07-09-ANALYTIC-FLOOR` already cleared and shipped dev-flag-OFF.
2. **INSTRUMENT (this file, done above, PRE-mesh-measurement):** `research/bridge/_jacobian_sizing_lib.ts` —
   `domainWarpJacobian` (analytic Ju/Jt/shear), `evalDomainWarp` (FD reference, built from the SAME
   `applyUWarp`/`applyTWarp`/`applyHelixWarp` primitives `composedWallSampler` uses), `validateJacobianFD`,
   `buildJacobianAwareFloor` (the composition), `jFieldStats` (fleet diagnostic), `extractWarpChoices`
   (generic per-style warp extraction for the fleet arm), `stratifiedNewtonEstimate` (two-tier estimator,
   the GYROID-arm method reused generically — head-exhaustive + equal-count stratified remainder,
   deterministic `mulberry32` sampling, ratio extrapolation), `classifyJacobianResidual` (KILL-J1 worst-N
   locus dump with local J). Driver: `research/bridge/_jacobian_sizing.test.ts`, stages
   `fd|fleet|h0|c1match|jdesign`. Heap fail-fast gate ported from `_gyroid_prodclose_lib.ts`'s
   `gpcHeapLimitMB` pattern (`jsHeapLimitMB`, asserted >=8192MB at every heavy stage). Breadcrumbs via
   `jsBreadcrumb` -> `research/exchange/_jacobian_sizing/run.log` (vitest buffers sync-test stdout).
3. **NO DEDICATED VITEST CONFIG (deliberate, file-scope-compliant, and matches the MORE RECENT precedent):**
   a root-level `vitest.jacobian_sizing.config.ts` would sit outside this experiment's allowed glob. Verified
   empirically that (a) the root `vite.config.ts`'s `test.include` already covers
   `research/**/*.test.ts`; (b) `test.poolOptions` is a Vitest-4 no-op regardless (confirmed live:
   `DEPRECATED test.poolOptions was removed in Vitest 4`), which is WHY `_gyroid_prodclose.test.ts` /
   `_gyroid_bandedge.test.ts` (same day, later than `vitest.analytic_floor.config.ts`) already dropped the
   per-experiment config file in favor of CLI flags + `NODE_OPTIONS` — this experiment follows that more
   recent pattern, not the older config-file one; (c) the root environment (`jsdom`, via `setupFiles:
   ['./src/test/setup.ts']`) is functionally inert for this pure-numeric/mesh workload (`setupFiles` cannot
   be bypassed per-file even with the `// @vitest-environment node` docblock override — verified empirically,
   the override crashes on `HTMLCanvasElement` from `setup.ts`; running under the default jsdom instead
   passes cleanly, costing a fixed ~13s jsdom-init tax per invocation, accepted). Run command:
   ```
   NODE_OPTIONS=--max-old-space-size=16384 PF_JS=1 PF_JS_STAGE=<stage> \
     npx vitest run research/bridge/_jacobian_sizing.test.ts \
     --testTimeout=5400000 --hookTimeout=600000 --pool=forks --no-file-parallelism
   ```
4. **H0 GATE (stage `h0`):** pinned-worktree flag-off twin must reproduce **H0 = f707898e-02e3bea1** EXACTLY
   (the same standing hash from `E-2026-07-09-ANALYTIC-FLOOR`, re-verified post-repair by the MASKED arm) —
   proves committed-HEAD == what this experiment measures, independent of any other session's gitignored
   state files (H0 is a hardcoded literal in the driver, not read from `_analytic_floor`'s baseline JSON).
5. **C1 INSTRUMENT-MATCH (stage `c1match`):** rebuild the ORIGINAL (non-J) masked-C1 floor
   (`buildAnalyticCurvatureFloor` directly, resU512/resT128) and confirm it reproduces the KILL-A verdict's
   class: fullTris ~6,956,244 (within 1%), facets-over ~2,764 (within +-10%), worst ~0.03575mm (within
   +-0.003mm). This MUST pass before the J-arm's number is trusted (a mismatch means the conforming pipeline
   drifted since `fa7e8c48` and invalidates the baseline this hypothesis is measured against).
6. **J-DESIGN RUN (stage `jdesign`):** `buildJacobianAwareFloor(baseFloor, spiralRidgesWarpChoices())` at
   the SAME resU512/resT128 config, no other knob moved. Acceptance basis: dense-45 radial PRESCREEN over
   every outer facet -> **stratified estimate** (`stratifiedNewtonEstimate`, plan `{topExhaustive:400,
   strata:8, perStratum:200}` = 2,000 Newton queries, matching the GYROID F2-floor-config plan scale) logged
   as an early signal via breadcrumb -> **exact literal** Newton-ALL over every flagged point
   (`scoreForward(...,{newtonAll:true})`, the same non-sharded exhaustive machinery the precursor C1 already
   proved tractable at this exact survivor scale). ADAPTATION NOTE (documented, not a deviation from intent):
   unlike the GYROID arms (~350K survivors, where the sharded-literal tier was theoretical and never
   exercised), SpiralRidges' survivor population is the same order the C1/c1match arms already scored
   exhaustively in a single process — so the exact tier is always run here (not conditionally skipped) to
   CERTIFY the final verdict number, while the stratified tier still runs first and is logged immediately for
   an early wall-clock signal and as a cross-check on the exact pass. No shard levers are built (out of
   scope; not needed at this survivor scale).

## GATES (committed BEFORE the mesh-build stages run)

- **ACCEPTANCE (all, stage `jdesign`):** (a) every dense-45-flagged point Newton-re-scored <=0.01mm, EXACT
  population — 0 facets over; (b) full-pot tris <= 1.5x flag-off = **8,530,251**; (c) coverage interior max
  <=0.01mm; (d) watertight `nonManRawBig`=0 NON-VACUOUS (injected-crack control must move the count) +
  zeroArea=0.
- **INSTRUMENT (must pass before `jdesign` is trusted):** H0 byte-identity (step 4) + C1 instrument-match
  (step 5) — both are hard gates, not advisory.
- **KILL-J1 (fidelity unchanged / attribution wrong):** `jdesign`'s exact facets-over is not materially
  reduced from the c1match baseline (2,764) — i.e. the J-attribution is wrong or incomplete. On this kill:
  dump worst-50 loci via `classifyJacobianResidual` (local `Ju`, branch, base-vs-J-composed floor kappa,
  demanded h) — already wired to fire automatically whenever `facetsOver>0` in stage `jdesign`, written to
  `research/exchange/_jacobian_sizing/jdesign_worst50.json`. STOP after at most 2 designs total (this
  raise-only `Ju^2` design, and if it kills, ONE follow-up design informed by the worst-50 classification —
  e.g. folding the shear term via a directional/anisotropic floor, or reconsidering the raise-only clamp).
  No third design without a new pre-registration.
- **KILL-J2 (budget):** `jdesign`'s fullTris > 8,530,251 even though fidelity closed ⇒ FRONTIER, priced at
  the new number (report alongside the existing 3-point curve: {5.687M tris => 3,140 over/0.0239} ->
  {11.004M blanket => 0 over/0.0100} -> {6.956M masked-C1 => 2,764 over/0.0358} -> {X J-design => ...}).
- **FLEET DIAGNOSTIC (mandatory, run — see above, already complete and reported regardless of the mesh
  verdict):** SpiralRidges maxJ2=3.16/p99J2=3.16/meanJ2=1.09/area>1=12.5%/area>1.5=12.5%; GyroidManifold and
  DragonScales both J===1 everywhere (branch identity) at default params on the shared body dims — no
  exposure to this specific mechanism measured for those two styles.

## OPS (mandatory for the mesh-build stages)

- `NODE_OPTIONS=--max-old-space-size=16384` on the CLI (config-level heap is a Vitest-4 no-op — confirmed
  live, see step 3).
- Heap fail-fast gate (`jsHeapLimitMB() >= 8192`) asserted at the top of every heavy stage.
- EcoQoS: bump the fork child to `AboveNormal` immediately after spawn, selected by CreationDate (<2min-old
  `node.exe`) per `CROSS-WORKSTREAM-NOTES.md`'s banked fix (`PriorityClass` CommandLine filtering matches
  nothing on this vitest-4/Windows stack) — `powershell -NoProfile -Command "(Get-Process -Id <pid>).
  PriorityClass='AboveNormal'"`.
- `jsBreadcrumb` writes to `research/exchange/_jacobian_sizing/run.log` at every phase transition (field
  build, twin build, prescreen, stratified, exact-Newton, coverage) — vitest buffers sync-test stdout
  entirely.
- Machine courtesy: check for a foreign node.exe >2GB working set before launching (another arm may be
  running a browser capture — Node-vs-browser coexistence is fine per the standing note; two heavy Node
  builds are not). Stages run SEQUENTIALLY (h0 -> c1match -> jdesign), never concurrently with each other or
  with another heavy detached build.
- Per the mission brief: END TURN after launching the detached mesh-build sequence — no cross-turn watcher
  is armed; progress is polled via `research/exchange/_jacobian_sizing/run.log` /
  `research/exchange/_jacobian_sizing/rows.ndjson`.

## LEDGER

Pre-reg (this file) + instrument lib/driver: commit pending (staged explicitly, this file +
`research/bridge/_jacobian_sizing_lib.ts` + `research/bridge/_jacobian_sizing.test.ts` only). Mesh-build
stage results appended to this file's VERDICT section below as they complete.

---

## VERDICT (2026-07-10, all three mesh stages complete, pinned worktree at 875f9089)

**CLASS: PARTIAL — TOLERANCE-BOUNDARY residual; MECHANISM CONFIRMED CAUSAL.** The literal acceptance gate
(facetsOver = 0) was NOT met: 34 facets read over 0.01mm on the exact Newton-ALL basis. But the J²-composed
floor did exactly what the WARP-JACOBIAN SAG DILUTION classification predicted a J-correction would do:
**2,764 → 34 facets over (−98.8%, 81×), worst 0.035754 → 0.010203 (pulled to the tol line), INSIDE the
budget gate (8,131,784 = 1.430× ≤ 1.5×)** — where the same floor WITHOUT the J² composition (c1match, same
config, same day, exact KILL-A reproduction) left fidelity completely unchanged. The masked arm's verdict
("the sizing was right, the delivered mesh does not obey it") is closed causally: composing the warp
Jacobian into the demand side makes the delivered mesh obey it.

### Instrument chain (all gates PASSED, in order, before the J-number was read)

| gate | result |
|---|---|
| `fd` — analytic Ju vs FD of the composed warp map | maxRelErrJu **6.84e-11** over 100k probes (gate <1e-6) |
| `h0` — flag-off byte-identity, pinned worktree | hash **f707898e-02e3bea1 EXACT**, fullTris 5,686,834 exact, build 616s |
| `c1match` — non-J masked-C1 instrument match | fullTris **6,956,244 bit-identical**, facetsOver **2,764 exact**, max 0.035754 (banked 0.03575), vertexOnSurf max 7.6e-6, nonMan 0 non-vacuous, zeroArea 0 — Newton-ALL scored 110,474 points in 94.4 min |

### A/B/C table (config family frozen: sag 0.003 / minEdge 0.1 / maxEdge 1 / maxKappa 2.4; all fidelity
numbers on the reported-deviation basis — dense-45 lattice, min(radial, Newton) upper bounds — the
identical ruler across rows)

| arm | sizing | fullTris (× flag-off) | facets over 0.01 | worst (mm) |
|---|---|---|---|---|
| flag-off (h0-hashed twin; fidelity per the §E-2026-07-09 banked baseline) | plain sampler @128² | 5,686,834 (1.000×) | ~3,140 | 0.0239 Newton / 0.0358 grid |
| blanket floor (parent arm, banked, context row) | cell-sup κ-floor @128² | 11,004,336 (1.935×) | 0 | 0.009985 |
| masked-C1 == `c1match` (re-measured, exact) | same floor @512×128 | 6,956,244 (1.223×) | 2,764 | 0.035754 |
| **`jdesign` (this arm)** | **same floor @512×128 × max(1, Ju²)** | **8,131,784 (1.430×)** | **34** | **0.010203** |

Budget: PASSED with 4.7% headroom (gate 8,530,251). Coverage interior max 0.009951 ≤ 0.01 PASSED (p99
0.00368; worst locus (u 0.847, t 0.979) = the same near-rim band as the forward residual; well under the
parent arm's KILL-C threshold 2×blanket = 0.0175). Watertight nonMan 0 NON-VACUOUS (injected-crack control
moved), zeroArea 0, vertexOnSurf max 7.6e-6 (twin on truth). jdesign build 775s; prescreen survivors
collapsed **5,605 → 80 (70×)**; forward scoring wall collapsed **5,664s → 101s (56×)** — the pre-named soft
tell corroborating the population collapse (the flagged set shrank to the boundary class before any Newton
query ran).

### The 34 residuals — TOLERANCE-BOUNDARY class (dump: `research/exchange/_jacobian_sizing/jdesign_worst50.json`)

Every residual sits in **[0.010015, 0.010203]** — the entire population is within 0.0002mm of tol, i.e.
inside the **~0.001mm Newton-resolution class** the registry's §V11w adjudication language established
(there, an exceedance was ruled GENUINE because it cleared tol by >10× that resolution; here the worst
clears it by **~0.2×** that resolution). Since every reported deviation is an upper bound (Newton returns
the distance to the best FOUND surface point; min(radial, Newton) likewise), the true worst may sit
marginally under tol — but the pre-registered gate reads the reported basis, so the literal acceptance
stands NOT MET; no gate motion. Stratified-vs-exact cross-check: survivors (80) < topExhaustive (400), so
the stratified tier degenerated to a fully-exhaustive head stratum — estOutliers 34 EXACT == the exact
tier's 34; single stratum, radial bounds [0.010037, 0.010858].

Loci-vs-J² correlation (per the dump): all 34 are helix-branch, all in the near-rim attachment band
**t ∈ [0.917, 0.979]** (the cross-style attachment-zone cluster, program consolidation §A), in 4 u-clusters
(≈0.237–0.241, ≈0.735–0.736, 0.847, ≈0.904–0.905), split **16/34 on the J²=3.16 compression plateau**
(kBase 0.72 raised to kJFloor 2.26 — just under the 2.4 κ-cap) and **18/34 on J²=0.79 expansion segments**
where raise-only is a designed no-op and the base floor alone reads 2.01–2.28 (also near-cap); demanded h
0.103–0.183mm across all 34. The whole residual class sits at the κ-cap/minEdge-clamp frontier of the
sizing law, one resolution-unit from tol.

### Field-semantics reconciliation (coordinator ask: state precisely what each field measures)

`forward.newtonWorst` = **0.008447** is the Newton refinement of exactly ONE point: the argmax point of
`scoreWholeMeshInterior`'s min(GN, brute-seeded) scorer over survivor facets, reported as min(gridMax,
Newton-at-that-point) — a single-point diagnostic whose ranking metric (the GN class) can put a different
point on top than the true worst (registry precedent: it appears only in WIDE fallback bands, never as an
acceptance leg). `forward.newtonAll.max` = **0.010203** is the max Newton distance over EVERY dense-45
lattice point whose sound radial bound exceeds tol (167 points scored; radial ≥ true distance, so this
population provably contains every candidate >tol point on the dense-45 basis) — **the pre-registered
acceptance basis and the verdict number**. They differ because they take argmaxes over different
populations; newtonAll's population is exhaustive, newtonWorst's is not.

### Fleet J-diagnostic (mandatory deliverable — banked pre-verdict, full table in the instrument section)

SpiralRidges (helix branch): maxJ² = p99J² = **3.16** on a single 12.5%-area plateau, meanJ² 1.09.
GyroidManifold and DragonScales: **branch = identity, J ≡ 1 everywhere** at default params — their sharp
features route through general-curve embedding (band-edge contours / rings), not the CreaseU/T/Helix warp
family. **Scope note:** WARP-JACOBIAN SAG DILUTION is a warp-family-style mechanism, not a universal
sharp-feature mechanism — "fleet-wide" = every style whose recipe uses the crease/helix warp layer.

### NAMED FOLLOW-UPS (not iterated now — design 1 delivered a 98.8% reduction; per discipline the boundary
residual goes to a NEW pre-registration, not a same-arm retry. KILL-J1's 2-design allowance is unspent.)

1. **Micro-arm (predicted to clear the final 34):** one pre-registered run applying a small raise-only
   safety margin to the COMPOSED floor — `kappa = baseFloor · max(1, Ju²) · (1+ε)`, ε ≈ 5% — NOT to the J²
   term alone: the worst-34 dump shows 18/34 sit at J² < 1 where a J²-side margin is a no-op, while a
   whole-floor margin lifts both residual classes (2.26 → 2.37 and 2.01–2.28 → 2.11–2.39, both still under
   the 2.4 κ-cap, so the cap does not saturate it). Budget headroom exists: 8.13M → 8.53M allows ~4.9%
   globally, and the margin binds only where the floor binds (crest bands), so realized cost ≪ 4.9%.
2. **Production wiring (the manifest sizing-layer item):** compose Ju² into the production sizing field for
   warp-family styles — a pure wrapper around the already-threaded `outerCurvatureFloor` hook using the
   warp-choice objects `ParametricExportComputer`'s conforming branch already computes; separately-scoped
   experiment (this arm's file scope excludes `src/`).

### Ledger (verdict)

Pre-reg + instruments: **875f9089**. All three mesh stages executed in the pinned worktree at exactly
875f9089 (node_modules junctioned). Stage rows + worst-34 dump under `research/exchange/_jacobian_sizing/`
(gitignored; worktree copies synced to the main tree). Timings: h0 build 616s · c1match build 743s +
Newton-ALL 5,664s · jdesign build 775s + forward 101s + coverage 69s + classify 97s. jdesign full-assembly
hash 4ac7475d-5a4c96f0 (flag-on — expected ≠ H0).

---

# E-2026-07-10-JACOBIAN-SIZING-MARGIN — the authorized ε-margin micro-arm [PRE-REGISTERED — committed BEFORE running; ONE design, no ε-iteration]

**AUTHORIZATION.** Orchestrator-authorized follow-up to the PARTIAL verdict above, run while the pinned
worktree and validated instrument chain are warm. Named in the verdict's follow-up #1; the worst-34
classification (18/34 residuals at J² < 1, where a J²-side margin is a no-op) is what redirects the margin
to the WHOLE composed floor.

**DESIGN (one, frozen).** Stage `margin` in `_jacobian_sizing.test.ts` — byte-for-byte the `jdesign` path
with exactly one change:

```
kappa_margin(u,t) = jFloor.curvatureFloor(u,t) · (1 + ε),   ε = 0.05  (raise-only)
```

where `jFloor` is the identical `buildJacobianAwareFloor(baseFloor, w)` composition the jdesign arm
measured. The frozen `maxKappa = 2.4` cap still applies INSIDE `MetricSizingField` (after the floor max),
exactly as in every prior arm — wherever the margined floor exceeds 2.4 it truncates to the cap, which per
the worst-34 dump does NOT saturate the residual class (compression plateau 2.26 → 2.37 < 2.4; expansion
segments 2.01–2.28 → 2.11–2.39 < 2.4). No other knob moves (512×128 grid, sag 0.003, minEdge 0.1, maxEdge
1, budget 16M 'cap', uBias auto, nRing 2048 — all frozen).

**HYPOTHESIS (falsifiable, quantitative).** Realized chord sag scales ~h² and the sagitta law gives
h ∝ 1/√κ, so a uniform (1+ε) κ-raise where the floor binds contracts sag by ≈ 1/(1+ε): the jdesign
residual population [0.010015, 0.010203] maps to ≈ [0.00954, 0.00972] — ALL 34 clear tol with ~3–5%
margin. Predicted budget: the margin densifies only floor-bound bands (h × 1/√1.05 ≈ −2.4% ⇒ ~+5% tris in
those bands); with the jdesign outer wall at 5,393,272 and the inner wall un-floored, predicted full-pot ∈
**[8.2M, 8.45M]** vs the gate 8,530,251 — PASS with reduced headroom.

**GATES (committed BEFORE the run):**
- **ACCEPTANCE (all):** exact Newton-ALL facetsOver **0** AND fullTris ≤ **8,530,251** AND coverage
  interior max ≤ 0.01 AND watertight nonMan 0 NON-VACUOUS + zeroArea 0.
- **KILL (one-shot):** ANY facet still over tol OR budget exceeded ⇒ **STOP after this ONE design — no
  ε-iteration.** Report the surviving loci against the jdesign worst-34 dump (the stage auto-dumps
  `margin_worst50.json` with the ACTUAL margined-floor demand at each locus) and the honest floor; the
  ladder then stands at jdesign's 34-residual point as the measured frontier.
- If ACCEPTED: SpiralRidges is the program's first warp-family LITERAL close within budget — state it
  plainly, with the full ladder (baseline → blanket 1.935× → masked 1.223× fidelity-failed → J 1.430× @ 34
  → J+margin) as the manifest sizing-layer case study.

**METHOD.** Same pinned-worktree discipline: the worktree is re-pinned (`git checkout`) to THIS commit
(driver gains the `margin` stage; the lib is untouched — its committed state is the one the validated
chain ran). Same detached single-command launch; same exchange-dir rows/breadcrumbs; coordinator polls.
Expected cost ~13min build + ~2min scoring on the collapsed population.

## VERDICT (MARGIN) — KILL fired (one-shot, no ε-iteration), and the failure mode is the finding: THE SIZING LEVER IS LEVEL-QUANTIZED DEAD AT THE RESIDUAL LOCI

**RESULTS (pinned worktree at 5776b079, stage `margin`, ε=0.05):** fullTris **8,456,484 = 1.487×** (99.1%
of the 8,530,251 gate; build 865s) · prescreen survivors 76 · exact Newton-ALL **facetsOver 28 / max
0.010191** (jdesign: 34 / 0.010203) · coverage max 0.009951 · watertight non-vacuous, zeroArea 0,
vertexOnSurf max 7.6e-6. The pre-registered quantitative hypothesis (all 34 clear via sag × 1/(1+ε))
is REFUTED: +324,700 tris (+4.0%) bought a 34→28 count change and a ~0.1% max shift. KILL stands —
no ε-iteration, per the one-shot clause.

**QUANTIZATION HYPOTHESIS — PROVEN (the close-out diagnostic, three independent lines):**

1. **Bit-identity at the surviving loci.** All 28 margin residuals match a jdesign residual at the same
   (u,t) with **bit-identical Newton deviations (max |Δ| = 0.0, exact float equality, 28/28)** — including
   the new max 0.010191445631178223, which is byte-for-byte jdesign's locus at (u 0.2394, t 0.9287).
   Meanwhile the REQUEST at those loci moved exactly as designed: demanded-h ratio margin/jdesign =
   1/√1.05 to 2.2e-16. The demand changed 2.4%; the delivered local mesh did not change AT ALL. Coverage
   corroborates: max AND worst-locus (u 0.8467, t 0.9794) bit-identical between the two runs.
2. **Level arithmetic.** At the residual band's radii (~48–55mm), both request bands (jdesign 0.101–0.109
   / margin ≥ minEdge 0.1) sit strictly inside ONE quadtree level interval: the L11 cell is 0.147–0.169mm
   > request > L12 cell 0.074–0.084mm ⇒ both runs deliver L12 cells. Crossing to L13 would need
   h_request < 0.074–0.084 ⇒ κ > 3.4–4.4, **impossible under the frozen maxKappa = 2.4** (which pins the
   minimum request at √(8·0.003/2.4) = 0.100 = minEdge, by construction). Under this config the sizing
   derivative at the residual loci is EXACTLY ZERO for any raise-only floor change of ANY size — the
   one-shot KILL is not merely procedural; the sizing lever is provably exhausted.
3. **The 6 that cleared are boundary-adjacency beneficiaries, not sizing responders.** 3 distinct (u,t)
   loci × 2 facet-points each — (0.736, 0.966–0.970) [including the former WORST, 0.010203] and (0.905,
   0.937) — dropped out entirely (gone from the >tol set, not reduced) while every remaining locus is
   bit-identical. The +4.0% tris landed where NEIGHBORING bands' requests did straddle a level boundary;
   cells adjacent to newly-split neighbors get template/vertex changes, which is what cleared these 6.
   Sizing-insensitive band interiors (the 28) saw nothing.

**COMPLETED SIZING LADDER (SpiralRidges, frozen config family, identical ruler):**

| rung | fullTris (×) | facets over 0.01 | worst | note |
|---|---|---|---|---|
| baseline (plain 128²) | 5,686,834 (1.000×) | ~3,140 | 0.0239 N | production regression |
| blanket κ-floor | 11,004,336 (1.935×) | 0 | 0.009985 | closed by ~8× over-delivery |
| masked floor 512×128 | 6,956,244 (1.223×) | 2,764 | 0.035754 | KILL-A: warp-dilution |
| + Ju² composition | 8,131,784 (1.430×) | 34 | 0.010203 | **mechanism confirmed, 81×** |
| + ε=0.05 margin | 8,456,484 (1.487×) | 28 | 0.010191 | KILL: sizing saturated, level-quantized |

**CONCLUSION (plain).** Warp-Jacobian-aware sizing is the CORRECT and CONFIRMED sizing-layer mechanism for
warp-family styles: composing Ju² into the curvature floor delivers the 81× outlier collapse and pulls the
worst deviation to the tolerance line within budget — closing the mechanism gap ANALYTIC-FLOOR-MASKED
diagnosed. The FINAL ~28 facet-points at the tolerance line (all within 0.0002mm of tol, all in the
near-rim attachment band) are **sizing-dead**: their requested h is pinned between the minEdge/κ-cap bound
and a quadtree level boundary no floor change can cross, so any further sizing spend buys zero local
refinement (budget is equally dead: 99.1% consumed for no movement at the target loci). They need a
**LOCAL lever** — pinned points at the loci (the §V11aa/HexHive recipe class; production lacks pins — the
known design item) or a forced level-split on the specific cells — the same endgame pattern as Gyroid's
knee (§E-2026-07-08-GYROID-KNEE closed its last 5 spots with pinned knee-injection after its field-level
levers saturated).

**FOLLOW-UPS (named, NOT run):** (1) the local-lever micro-arm for the 28 (pins or forced level-split at
the 14 distinct (u,t) loci; new prereg); (2) the production-wiring recommendation for Ju²-composed sizing
STANDS UNCHANGED — it is the fleet lever for warp-family styles and does not depend on the 28-residual
endgame.

**Ledger (margin):** margin prereg + stage: **5776b079** · row + `margin_worst50.json` under
`research/exchange/_jacobian_sizing/` (gitignored, synced to the main tree) · margin full-assembly hash
b5716eed-ce0aa540 · timings: build 865s / forward 90s / coverage ~69s / classify ~160s.

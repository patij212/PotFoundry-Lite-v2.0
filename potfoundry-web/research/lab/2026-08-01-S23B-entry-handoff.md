# S23B ENTRY HANDOFF — the reconstruction BUILD. Written 2026-08-01, at the Stage-0 close.

**Read in this order:** the **S23 RECONSTRUCTION registration** and the three blocks that follow it in
`research/lab/2026-07-29-strata-perf-convergence-worklog.md` (S23 STAGE 0 amendments -> S23 STAGE 0 RESULT
-> S23 PREREQUISITE A2), then `2026-07-31-S23-entry-handoff.md` §2-§4 for the machinery inventory and the
ops costs. `2026-07-31-S22-entry-handoff.md`, `2026-07-31-S21B-entry-handoff.md`,
`2026-07-31-S21-entry-handoff.md` and `2026-07-30-P5-entry-handoff.md` remain standing and are NOT
superseded. THE FRONTIER RESULT, the HARD GATE block and OPS TRAP 11 + amendment are unchanged.

**SAID PLAINLY: THE ARM IS REGISTERED, ITS GATE IS PASSED, ITS PREREQUISITE IS DISCHARGED, AND THE BUILD IS
NOT STARTED.** No driver file was edited. No `src/` file was edited. No default was flipped. Nothing needs
undoing before you begin. **This handoff was taken deliberately at a clean boundary rather than by running
out mid-edit on a 338 KB shared file** — the HARD GATE block's own warning is that a gate run taken while
the tree is mid-edit is meaningless, and that risk is what ended this session rather than a result.

---

## 0. WHERE THIS SESSION LEAVES YOU

| step | commit | verdict |
|---|---|---|
| S23 registered in full (Stage-0 bars, build spec, 5 verdict rows, 4 predictions) | `95cd8662` | REGISTRATION ONLY |
| Stage 0 first pass: E1 fired on D2/D4; amendments D2'/D4' + new bar D7 registered before the re-score | `863715d4` | both failures were MINE |
| **S23 STAGE 0 = E2 GO** — the density field IS extractable | `3c18e998` | **THE #1 RISK IS RETIRED** |
| Prerequisite A2 — the stable metric kernel transcribed and validated | `6a00c271` | **DISCHARGED** |
| the field emitted as a durable artifact | this commit | **INPUT READY** |

**NEW FILES, all standalone, all artifact-only, none imported by anything:**
`research/tools/s23Density.ts` + `tsconfig.s23d.json` · `research/tools/s23Metric.ts` +
`tsconfig.s23met.json` · `research/bridge/out/s23d_stage0.sh`.
**Logs:** `research/exchange/_strataConformBisect/S23_STAGE0_S22B.log`, `S23_METRIC_S22B.log`.
**THE FIELD:** `research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S22B.density.json`
(schema `pf.strata.density/1`, 4.3 MB, 1131 x 480 cells at 0.25 mm, values in **um**, **UNSMOOTHED and NOT
gradient-limited on purpose** — see §3).

## 1. THE NUMBERS THE BUILD IS PRICED BY. All measured this session, all on `_S22B`.

`1,251,546` facets -> `626,348` welded vertices, `1,877,894` edges, mean degree **6.00**.
Whole-wall `hA` (the density-preserving scalar, `sqrt(2*A(v)/sqrt3)`): p01 **19.3** / p10 **49.1** /
p50 **113.5** / p90 **479.9** / p99 **868.1** um, MIN 2.0 MAX 1,261.5.
`hMin` p50 **65.5** um, MIN **0.7**. `hMed` p50 **141.2** um.

| landmark | measured | the record's value |
|---|---|---|
| designed lattice | `hA` p50 **687.6** um | 699.6 DERIVED from 1,101 x 385 — agree to **1.7%** |
| loci `d in [0,50] um` | `hMin` p50 **40.7**, p10 **10.0** um | the across rule PLACED min/p50 **50.0** um |
| near/far contrast | **5.614x** | rings top out at 650 um, lattice beyond |
| 43 declared regions | `hA` p50 **63.8** um, **0.0927x** the lattice | routed radius cap 1.50 mm |
| finest z-bin | **z 80-85 at 76.2 um** | `_S22B` MAX-locus **z 76.40** (report line 83) |
| coarsest z-bin | **z 10-15 at 653.3 um** | undecorated wall = the lattice |
| implied cost | **1,761,257 tri = x1.4073** | `_S22B`'s own 1,251,546 |
| constructibility | `hA` < 36.4 um at **4.527%** | bar 5.000% — **NARROW** |
| texture dispersion | within-cell `hA` p90/p10 median **2.793** | bar 3.0 — **NARROW**, p99 14.742, MAX 41.93 |

**THE arM CONTROL FOR PREDICTION P-c, reproduced by an independent transcription to every digit:**
whole-mesh `aspect3` p50 **3.40** / p99 **39.04**; `arM` p50 **11.58** / p99 **239.13**; designed-lattice
`arM` p99 **16.61** -> `MET_AR` **27**; `ALT_FLOOR` 0.7629 um already breached by **162 of 1,251,546**
(0.0129%). T1a **1.139e-11**, T3 **2.634e-9**, both < 1e-6.

## 2. THE BUILD — WHAT IS SPECIFIED AND WHAT IS NOT

The registration (`95cd8662`) specifies it. **Two facts bound how, and both were measured, not assumed:**

  1. **THE SEED'S ABSOLUTE SCALE IS ONE NUMBER.** `pitchMean = sqrt(pitchTh * pitchZ)`
     (`_strataAlignedSeed.ts:416`), `pitchTh = 2*pi*rRef/gu`, `pitchZ = H/gv`, `rRef = 45` HARDCODED at
     :408. At `gu=200 gv=140 H=120` that is **1.10080 mm** — the 1,101 um of the record — and
     `acrossBase = 0.35 * pitchMean = 385.3 um`. Everything else (`alongBase`, `clearMm`, `minSepMm`,
     `snapMm`, the hash cell, the segment bucket) is a multiple of it.
  2. **THE EXISTING SIZING FIELD CANNOT CARRY THE EXTRACTED ONE.** `useField` enters through
     `cl(x) = max(1/fieldRange, min(fieldRange, x))` at :518 with `fieldRange = 2.0` and **NO env var**. A
     +-2x clamp cannot express a 50 um -> 1,101 um demand range — which is exactly why S15's `acrossAbs`
     and S19's rings exist as separate ABSOLUTE rules. **The extracted field must enter as an absolute rule
     of that same family, not through `cl()`.** `fieldRange`, `clearFrac`, `patchInnerMm`, `patchGrade`,
     `patchM`, `weldMm`, `pslgEpsMm`, `chartAreaEpsMm2` have no env var at all, so S23 calls
     `buildAlignedSeedRepaired` with its own opts object rather than driving it through `PF_CB_*` alone.

  **AND THE FLOOR IS ARCHITECTURAL, NOT A PREFERENCE.** `_strataAlignedSeed.ts:398` ASSERTS
  `acrossMinMm * 0.55 > pslgEpsMm` with a **throw**; at `pslgEpsMm = 0.02` that forbids any across floor
  below **36.4 um**. The extracted field asks for less than that at **4.527%** of source vertices (`hA`)
  and **20.046%** (`hMin`). D7 passed on the registered quantity; the build still has to decide what to do
  at those cells, and clamping is the only option the seed permits.

  **A CORRECTION THIS SESSION MADE TO THE S23 SKETCH, so it is not re-inherited:** *"free Steiner points
  only, ZERO constraint edges"* describes the PATCH EMITTER and the OFFSET RINGS. **The seed is a genuine
  CDT** — `_strataAlignedSeed.ts:1114` passes `constraints` (locus chain segments :766 + the four domain
  sides :1038), **12,806 on `_S22B`, recovered 12,806**, asserted with a throw at :1140-1147. At final
  density that assertion is a live failure mode: S15 Stage 0 saw it fire twice when chains densified below
  seed AR 24. **That is what the S7 INFEASIBLE tripwire is aimed at.**

## 3. THE ONE DECISION THE BUILD MUST MAKE, LEFT OPEN ON PURPOSE

**WHETHER TO GRADIENT-LIMIT THE FIELD.** Measured inter-cell `|log(h_i/h_j)| / dist`: p50 **1.2919** /
p90 **3.5114** / p99 **7.9947** per mm. Within-cell `hA` p90/p10: median **2.793** but p99 **14.742**,
MAX **41.93**. **The field is smooth enough to construct at its median and emphatically not at its tail.**
The extractor deliberately writes the field UNSMOOTHED and NOT gradient-limited, and says so in the
artifact (`estimator.smoothed: false`, `estimator.gradientLimited: false`). **Deciding it silently inside
the extractor would hide a design decision inside an instrument, which is the mistake this campaign keeps
paying for.** Register the choice — limit or not, and at what Lipschitz constant — as a declared variable
before the run, because it will move both the cost and the shard census.

**AND ONE PREDICTED CONSEQUENCE, ALREADY ON THE RECORD (`3c18e998`):** the `hA` profile is **NOT monotone**
in the ring band — `[0,50] 104.5` · `[50,100] 133.6` · `[100,200] 95.0` · `[200,400] 94.6` ·
`[400,650] 130.9` um — because `_strataAlignedSeed.ts:859` saturates the ring stride at 4 from ring 3
(204.8 um). **A reconstruction that honours the field in [200,650] um will place FINER material there than
S19's rings do.** That is the first place to look if the constructed cost overruns.

## 4. THE COST PRESSURE, RESTATED HONESTLY

D6 moved the derivation AGAINST the arm. `1,761,257` predicted triangles means ~**881k** placed points, so
`cdt2d` scales `(881/117) * log(881k)/log(117k) = **x8.80**` of the seed's own share, not the **x6.14** S4
derived on ~627k. **The registered ceilings stand — total wall <= 600 s, seed build <= 450 s, live tris
<= 2.0 M — and 1.76M is 88% of the last one.** If the field is gradient-limited the count falls; if it is
honoured as measured, plan for the ceiling to bind. **S21B already caught a `cdt2d` `mergeHulls` crash at
300k TRICAP, so budget a probe arm at reduced density BEFORE the full run — and remember the handoff rule:
probe the SEED at low density, never the POPULATION.**

## 5. OPS — what worked, and the traps this session paid for

  * **esbuild, playwright externals REQUIRED:**
    `node node_modules/esbuild/bin/esbuild <f>.ts --bundle --platform=node --format=cjs --target=node20
    --external:playwright --external:playwright-core --external:chromium-bidi --outfile=<out>.cjs`
  * **TYPECHECK EXPLICITLY.** The repo tsconfig's `include` is `["src"]`, so `npx tsc --noEmit` sees
    NOTHING in `research/`. Use a scoped tsconfig. **THE BASELINE IS 3 PRE-EXISTING ERRORS**
    (`featureLocalizedFidelity.ts` x2 TS6133, `inhouseMetricMesh.ts` TS7016 `delaunator`); both new tools
    add **zero**. Confirm the baseline against `research/tools/tsconfig.s23m.json` (the committed S23-M
    tool) before believing any error is yours.
  * **`StyleDims` IS NOT IN `src/geometry/types`** — it is `research/bridge/runStyle.ts:14`. `StyleId` IS
    in `src/geometry/types`. Cost this session ~2 minutes; costs you 0 now.
  * **`sh -n <script>` AND `grep -n "_run_" <script>` BEFORE backgrounding an hour of compute.** The
    `sed`-derived-chain-script trap from S22C is unchanged and still cheap to avoid.
  * OPS TRAP 11 + amendment unchanged: background with a failure sentinel; repeated FOREGROUND
    `until <sentinel>; do sleep 25; done` waits at 600 s, re-issued IMMEDIATELY, never ending the turn
    between them. The `nohup ... &` launcher's own completion notification means NOTHING.
  * Costs unchanged from the S23 handoff §4: production arm **934-1,017 s**, Part-B audit **~830 s**, hard
    gate **~228 s**, W1 identity **~225 s**, a census on a 1.25M STL **60-90 s**. Stage 0 itself runs in
    well under a minute and the `arM` census in ~5 — both are cheap enough to re-run freely.

## 6. THE ONE THING TO KNOW FIRST

> **The architecture survived its first real test, and it survived it on a bar that could have killed it.**
> The whole S23 claim is that a bisected mesh's DENSITY MAP outlives its geometry. Stage 0 asked whether
> that map is recoverable at usable resolution and the answer is yes: 50 um across the loci, 687.6 um on
> the designed lattice against a target of 699.6 derived before anything was measured, the junction disks
> at a tenth of the lattice, and the finest material within 6.1 mm of this arm's own H2 argmax.
> **The sharpest evidence is the one nobody asked for: my z 40-60 bar FAILED because it named where the
> demand used to be, and the field was pointing at where the demand actually is.** An extractor that
> reproduced my expectation would have been less informative than one that corrected it.
> **What is NOT shown, and must not be claimed: that a constructor can HONOUR this field.** Extractability
> and constructibility are different questions. D7 is the only evidence on the second one, it passed by
> 0.47 of a percentage point, and 20% of the mesh carries short edges the seed builder is forbidden to
> place. **Build it and find out — that is the arm.**

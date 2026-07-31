# S21 ENTRY HANDOFF — the routing build over the plate census. Written at the S20.1 close, 2026-07-31.

**Read in this order:** the **S20.1 RESULT** and the **S21 REGISTRATION** sections of
`research/lab/2026-07-29-strata-perf-convergence-worklog.md` (they are adjacent, just after the S20.1
amendment), then THE FRONTIER RESULT standing law, then the HARD GATE block and OPS TRAP 11 near the top.
`2026-07-30-P5-entry-handoff.md` is still the campaign's standing-invariant reference and has not been
superseded.

**The S21 registration IS the contract.** This file only carries the state you inherit and the traps.

---

## 0. WHY THIS SESSION EXISTS

S20.1 is complete, scored and committed (`9150d48f`). It ended at a boundary the registration itself
predicted: **the invariant is real and it cannot ship yet.** The routing has to land first, and S21 is
registered and ready to build. This session builds it.

The operator's amended standing order waives the pre-build review pause. It does **not** waive
pre-registration (already done — do not re-litigate it) and it does **not** waive the post-arm eyeball gate.

---

## 1. STATE YOU INHERIT — VERIFIED, DO NOT RE-DERIVE

* **The orientation class is CLOSED.** `_S20B` = `_S20A` + `PF_CB_ADMIT_SHIPPED=1`. Judge `[NORMAL] PASS
  count 0` of 1,218,348, strand list empty. 1,074 -> 108 -> 0 across S19A/S20A/S20B.
* **It cost nothing to compute:** 909M rA evals, identical to `_S20A`; 830 s against a 2,400 s cap.
* **It bought no fidelity: H2 witnessed is 55.652 um on BOTH `_S20A` and `_S20B`**, same argmax carrier to
  the micron. That is why S20.1 scored **Y7 ROW 2, REGRESSION STOP**, and why `PF_CB_ADMIT_SHIPPED` stays
  **DEFAULT OFF** until routing lands.
* **Both registered S20.1 causes were REFUTED and the amendment's own premise was retracted.** The driver's
  admission test and the judge's never disagreed; the driver was scoring an f64 mesh nobody receives. The
  diagnostic (`PF_CB_ADMIT_DIAG=1`, default OFF, decision-free) proved it: same sweep, 0 on f64 coordinates,
  108 on the f32 coordinates that ship, and those 108 are the judge's 108 facet for facet.
* **The mechanism, worth carrying because it will recur:** `admBestDot` differences the surface at
  `ADM_H = 1e-6` mm while one f32 ulp on z ~ 80 mm is ~7.6e-6 mm — **seven times the stencil**. Rounding a
  vertex can carry the whole stencil across a crease onto the other flank. Any future instrument that
  differences the analytic surface at a step finer than an f32 ulp has this bug waiting in it.
* **The strand list is EMPTY on every admission arm.** The routing's work order is NOT the strand list. It
  is the plate census below.

## 2. THE TARGET LIST — ALREADY MEASURED, AND THIS IS THE POINT OF THE HANDOFF

`research/bridge/out/s201plates.ts` (scratch, gitignored; bundle with the esbuild line in §5). It separates
the operator's two classes on existing artifacts, no mesh run, ~3 min.

**Why the normal cannot be the protrusion instrument, and this is not a detail:** every vertex the driver
emits is LIFTED ONTO the analytic surface by `addV`, so a facet cannot stand off at its corners. **A plate
is a large CHORD whose INTERIOR departs.** So it is measured by sampling the facet's own interior:
`standoff = r_facet - rA(theta,z)`. That is an UPPER bound on true distance — **a classifier, not a fidelity
number.** Never quote it as one; H1/H2 through the hardened judge remain the only fidelity instruments.

Measured, at the operator-visible area floor of 0.02 mm^2:

| | `_S20A` | `_S20B` |
|---|---|---|
| orientation blades (gated) | 1 | **0** |
| protrusion plates (standoff >= 50 um) | 223 | 213 |
| admission CANNOT address | 222 (99.6%) | **213 (100.0%)** |
| standoff p50 / MAX | 197.1 / **639.3 um** | 197.1 / **639.3 um** |
| inside a traced junction disk | 81.6% | 82.2% |

**Only 1 of the 108 gated facets was ever large enough to see.** The class the operator photographs is the
plate class, and admission was never its instrument. Plates are unmoved across the fix — same four sites,
same magnitudes to the digit. **P1 th -0.2663 / z 79.31-79.59 (639.3 um)**, **P2 th -1.8327 / z 81.585-81.594
(528.7)**, **P3 th -0.2654 / z 114.42 (413.2)**, **P4 th +0.5674 / z 97.31 (334.9)**.

Their AR is **1.8-8.9** (well-shaped, far under the cap), long edges 776-1,401 um, deviation **85-95 deg** —
nearly tangent, the signature of a chord across a deep valley. This is the **ACCEPTED-BLIND population of the
P5 handoff** (carriers at AR 2.68 / 5.71, driver's ruler 47-96x blind) measured a third way, and the 639.3 um
worst standoff is that handoff's own `-630.6 um within 83 um of centre in theta` V-profile. **Same feature,
same sites, three instruments, four arms.**

**STAGE 0 IS MANDATORY: re-run the census on `_S19A` and confirm P1-P4 transfer before building anything.**
The registration makes this a start condition, not a nicety.

## 3. WHAT ALREADY EXISTS FOR THE BUILD (do not rebuild)

| asset | where | state |
|---|---|---|
| patch emitter | `PF_CB_ALIGNED_PATCH=<regions.json>` + `PF_CB_ALIGNED_PATCH_IDS`/`_TOPN`/`_MAX` | built + seed-validated in S18: watertight by construction, ZERO constraint edges, no over-cap facet added, free-Steiner through the single CDT call. OFF path reproduces the `_S15A` seed exactly. |
| region artifact | `<tag>.regions.json` beside every aligned STL | 235 regions, ~6 s per arm, no mesher run |
| declared provenance | `<tag>.patches.json` -> `PF_FT_PATCHES` | judge understands declared regions since S14; PROVENANCE-2 pins that a MIS-REGISTERED region exempts nothing |
| plate census | `research/bridge/out/s201plates.ts` | the target list instrument, above |
| judge transcription | `research/bridge/out/s201d1.ts` | reproduces `_judgeNormal` EXACTLY on `_S20A` (108 / 4,543 / 4,651 / all 12 hist bins / p50-max). Useful for fast X1-style checks without a full audit. |

**THE ONE MANDATORY CODE CHANGE, already specified so it is not re-derived: patch interior sizing must be
`min(polar grading, sizing field)`.** S18 measured the defect — the polar set REPLACES the background
lattice, so a routed disk can be COARSER than what the driver would have built (disk #25's congruent copy,
**0.008 -> 31.429 um**). An arm without this fix is invalid, not merely worse.

## 4. STANDING INVARIANTS — every one held through S20.1 and must keep holding

flag-OFF md5 `8a59fb37a9115600b13262254380ccb0` at the W1 config; hard gate **12/12** with exact values
(V3 thin 12.041, V7 tread 0.000, V7c **12.041 / 39.767 / 142.668**); folds 0; determined blades 2 (seed-born,
declared); worst admitted child AR <= 50; seam-cracks 0 / Euler 0. **Never quote the driver self-report as
fidelity. Quote H1 coverage and stride with every H1 number.** Never touch `_facetTruthLib.ts`,
`_sharp3dRef.ts`, `_shapeGuard.ts`, `_judgeNormal.ts` or `_judgeShape.ts`. Never `git stash`, never
`git add -A` — the tree carries pre-existing dirty paths that are not ours (`src/**`, `CLAUDE.md`,
`.serena/`, root `research/`). Commit only your own files.

`npx tsc --noEmit` reports **461 pre-existing errors repo-wide, ZERO in `research/bridge`** — that is the
baseline, do not chase it. eslint must be clean on files you touch.

## 5. OPS — the costs you are budgeting against, measured this session

| step | cost |
|---|---|
| production mesher (200x140, 1.2M facets) | **811-846 s** |
| Part-B deep audit (`H1MAX=40000 H2BUDGET=4e7 WORKERS=8 GUARD_AR=50`) | **~1,700 s** |
| hard gate + W1 identity | ~9 min |
| plate census / judge transcription on a 1.2M STL | ~3 min each |
| reduced-cap probe (TRICAP=300k) | ~240 s |

**OPS TRAP 11 AND ITS AMENDMENT — the pattern that worked end to end this session:** background the chain
with a **failure sentinel**, then issue repeated FOREGROUND `until <sentinel>; do sleep 25; done` waits at
600 s each, re-issued immediately on timeout, **never ending the turn between them**. A completed background
task does NOT re-invoke the session. Verify CPU consumption before the first wait. Set node
`PriorityClass=AboveNormal`. Always `NODE_OPTIONS=--max-old-space-size=16384`,
`-c vitest.strata.config.ts`, `--testTimeout=1800000 --hookTimeout=600000`.

Scratch bundles: `research/bridge/out/` is gitignored. Build with
`node node_modules/esbuild/bin/esbuild <f>.ts --bundle --platform=node --format=cjs --target=node20
--external:playwright --external:playwright-core --external:chromium-bidi --outfile=_run_<f>.cjs`
(the playwright externals are required — `_gpuRankBridge` imports it and the bundle will not resolve
chromium-bidi otherwise).

**A reduced-cap probe will NOT reproduce a deep-mesh disagreement.** Measured this session: at 243,403
facets the judge and the driver both read 0 and the whole S20.1 question was invisible. Budget for
production depth when the question is about the deep population.

## 6. THE ONE THING TO KNOW FIRST

> **The campaign has now measured, three independent ways and across four arms, that the population the
> operator vetoes on is NOT an orientation defect.** It is a well-shaped, sub-cap, nearly-tangent chord
> standing up to 639 um off the surface inside the junction cage, at four sites that have not moved through
> a seed-family change, a graded-field completion, an accept-rule change and an admission invariant.
> **S21 is the first arm that aims at it directly.** Its success criterion is the operator's photograph
> changing, and Z1 is written in exactly those terms.

# S21B ENTRY HANDOFF — the coverage completion. Written at the S21A close, 2026-07-31.

**Read in this order:** the **S21A RESULT** section of `research/lab/2026-07-29-strata-perf-convergence-worklog.md`
(it is immediately after the S21 registration), then THE FRONTIER RESULT standing law, then the HARD GATE
block and OPS TRAP 11 near the top. `2026-07-31-S21-entry-handoff.md` and `2026-07-30-P5-entry-handoff.md`
remain the standing-invariant references and are NOT superseded.

**The S21 registration is still the contract.** S21B is its coverage completion, not new scope.

---

## 0. WHERE THIS SESSION STARTS

S21A is built, scored and committed. **Z7 ROW 3, REGRESSION** — on one clause, Z3's H2 guard (21.379 ->
25.063 um). Rows 1 and 2 did NOT fire. **The routing mechanism is not in question; its coverage is.**

**THE ONE-LINE RESULT:** *routing removes the plate class wherever the geometry lands, at a fidelity price
paid on a sub-visible congruent copy the routing did not create.*

## 1. STATE YOU INHERIT — MEASURED, DO NOT RE-DERIVE

* **THE PLATE CLASS IS ROUTABLE.** P1/P2/P3: **88 -> 0** plates. Whole routed footprint: **108 -> 1**
  (2.578 -> 0.016 per 1k). Global 200 -> 67. Gated blades at the visible floor 35 -> 11.
* **H1 WITNESSED FELL x0.258 — 482.131 -> 124.525 um** (certified bound 591.762 -> 143.072). `_S19A`'s H1
  witness-locus WAS P1. The worst mesh->surface error and the operator's headline plate were one feature.
* **P4 IS THE UNTREATED CONTROL INSIDE THE ARM.** Selected (disk #72, rank 3) but never covered — the
  emitter caps routed radius at `patchMaxMm` = 1.5 mm and P4 sits **2.510 mm** from #72's centre. Its 21
  plates / 378.4 um worst / 55.9431 worst(area x standoff) are **identical on `_S19A` and `_S21A`**.
  **A SELECTED DISK IS NOT A COVERED SITE.** Score the SITE, never the disk — a per-disk count reported
  that miss as a clean zero and only site-scoring caught it.
* **THE H2 PRICE IS A RELOCATION, NOT A CREATION.** `_S21A`'s H2 argmax is th **6.021386** z **113.45994**,
  carrier edges 389.9/349.5/50.0 um, area ~0.0088 mm^2 — **below the 0.02 mm^2 visible floor**. `_S15A`'s
  argmax was th 1.308997 at the SAME z to five decimals, exactly **9 periods of 2pi/12** away: a CONGRUENT
  COPY, the same mechanism S18 recorded at disk #25. H1 improved 3.9x because the big errors went; H2
  worsened 17% because the argmax moved to what was underneath.
* **THE EMITTER GRADING FIX IS IN AND MEASURED.** Field bound the polar grading on **93 rings**, **218
  sub-rings** inserted, worst polar/field ratio **9.26x**, `patchSubMax` guard **never clipped**. The
  control `PF_CB_ALIGNED_PATCH_SUBMAX=1` reproduces the S18 emitter exactly (114 rings bound, worst ratio
  **36.44x**, nothing acted on) and exists so the fix can be A/B'd rather than asserted.

## 2. WHAT IS ALREADY BUILT FOR S21B (do not rebuild)

| asset | where | state |
|---|---|---|
| coverage extractor | `research/bridge/out/s21bCover.ts` (scratch, gitignored) | sweeps the 67-offender census, keeps the 26 `_S21A` regions, adds 17, **THROWS unless 100% covered**. Asserts **67/67**. |
| the region artifact | `research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json` | **43 regions**, schema `pf.strata.regions/1`, written and asserted |
| site-resolved census | `research/bridge/out/s21plates.ts` | Z1/Z2's instrument: per-site neighbourhoods, routed-vs-outside density, routed-coverage distance per primary |
| the grading fix + its control | `_strataAlignedSeed.ts`, `PF_CB_ALIGNED_PATCH_SUBMAX` | committed, default 16 = fix ON; 1 = S18 arithmetic |

**THE COMMAND, ALREADY DERIVED:**
```
PF_CB_ALIGNED_PATCH=research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
PF_CB_ALIGNED_PATCH_TOPN=0
PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,
                        1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016
```
on the `_S19A` command family (`GRIDU=200 GRIDV=140 TRICAP=8000000 ACCEPT=0.0035 TAILK=800 MAXSECS=5400
RANK=plane ALIGNED_SEED=1 ALIGNED_ACROSS_ABS=1 ALIGNED_RINGS=7 ALIGNED_TURN_MUL=9`). **TOPN=0 is
deliberate: every routed id is named explicitly, so the routed set is exactly the asserted coverage set.**
**No cluster exceeds `patchMaxMm`** — largest is P4's at radius 0.501 mm — so there is nothing to register.

## 3. THE TWO OPEN DECISIONS THAT ARE NOT AN AGENT'S TO MAKE

1. **`PF_CB_ADMIT_SHIPPED=1` IN THE S21B ARM.** The coordinating session asked for it. It was NOT run here.
   The lever is held **DEFAULT OFF "until routing lands — OPERATOR DECISION"**, and routing landed *as a
   registered regression on the fidelity guard*, which is not the condition the hold anticipated. Releasing
   an operator hold is the operator's to give. **The defaults were not touched.** If released, it is an
   explicit arm flag exactly as `_S20A`/`_S20B` used it, and its registered target is the 11 gated blades
   at the visible floor (expect 0, judge-verified). Note S20.1's measurement: admission cost H2 **nothing**
   (55.652 on both arms), so it should not compound S21A's H2 clause — but that is a prediction, not a bar.
2. **WHETHER S21B RE-REGISTERS Z3.** S21A failed Z3 by 3.68 um of H2 on a sub-visible congruent copy. If
   S21B is run against the SAME Z3 guard it will likely fail the same way for the same reason, because
   better coverage removes MORE masking geometry. **Either the guard is re-registered against `_S21A`
   (25.063 um) as the new control, or the arm is expected to score REGRESSION again and be read on Z1.**
   Registering that choice BEFORE the run is the whole discipline; discovering it afterwards is not.

## 4. STANDING INVARIANTS — all held through S21A

flag-OFF md5 `8a59fb37a9115600b13262254380ccb0` byte-exact (`cmp` clean, taken AFTER every edit); hard gate
**12/12** with every value exact (V1 2.249981, V3 197.167 / **12.041**, V4 502.615, V5 5.552 / 391.661,
V6 0.617, V7 **0.000**, V7b 402.230, V7c **12.041 / 39.767 / 142.668**); folds 0; determined blades 2;
worst admitted child AR <= 50; constraint recovery 100%; seam-cracks 0 / Euler 0.
**Never quote the driver self-report as fidelity. Quote H1 coverage and stride with every H1 number.**
Never touch `_facetTruthLib.ts`, `_sharp3dRef.ts`, `_shapeGuard.ts`, `_judgeNormal.ts`, `_judgeShape.ts`.
Never `git stash`, never `git add -A` — the tree carries pre-existing dirty paths that are not ours
(`src/**`, `CLAUDE.md`, `agents.md`, `.serena/`, root `research/`).

`npx tsc --noEmit`: **ZERO errors in `research/bridge`** (the repo-wide count moves with the pre-existing
dirty `src/**` paths and is not a baseline worth chasing). eslint clean on every file touched.

## 5. OPS — costs measured THIS session

| step | cost |
|---|---|
| production arm (200x140, 1.24M facets, 26 routed regions) | **769 s** |
| Part-B deep audit (`H1MAX=40000 H2BUDGET=4e7 WORKERS=8 GUARD_AR=50`) | **~840 s** (H1 338 s + H2 496 s) |
| hard gate | **218-233 s** |
| W1 identity | **190-233 s** |
| reduced-cap emitter probe (TRICAP=300k) | **321 s** — and it caught two real defects in the fix |
| plate census / coverage sweep on a 1.24M STL | ~60-90 s each |
| region extraction on a 1.22M STL | **7 s** |

**THE PROBE EARNED ITS KEEP AND THE HANDOFF'S WARNING STILL STANDS.** "A reduced-cap probe reproduces
nothing" is about DEEP-POPULATION questions. It is NOT about the seed: the seed is built identically at any
triangle cap, so a reduced-cap run prices the emitter exactly. It caught a cdt2d crash and an unfloored
sizing read for 321 s instead of 769 s. **Probe the seed at low cap; never probe the population there.**

**A PRACTICAL OPS NOTE FOR THIS ENVIRONMENT, MEASURED REPEATEDLY:** the harness intermittently refuses
long command lines and `sh <script>` invocations. Retrying the SAME command, or varying its tail
(`| tail -N` vs `> log 2>&1`), succeeds — usually within two attempts. Budget for it; it is not a failure
of the command.

## 6. THE ONE THING TO KNOW FIRST

> **For the first time in this campaign, the population the operator vetoes on MOVED — and it moved only
> where the geometry actually landed.** 88 -> 0 at the three covered primaries; unchanged to the digit at
> the one that was selected and never covered. That single arm contains both the treatment and its own
> matched control, so the attribution is not an inference. **The remaining work at the visible scale is
> COVERAGE, and it is already enumerated and asserted at 67/67.** What is NOT solved is the fidelity
> instrument: H2's argmax has retreated to a sub-visible congruent copy at z 113.45994 that has now
> outlived a seed-family change, a graded-field completion, an accept-rule change, an admission invariant
> and a routing arm. **That facet, not the plates, is what Phase D will have to answer for.**

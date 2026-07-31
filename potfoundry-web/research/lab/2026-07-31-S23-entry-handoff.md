# S23 ENTRY HANDOFF — the reconstruction pass. Written at the S22C close, 2026-07-31.

**Read in this order:** the **S22, S22B and S22C RESULT** sections of
`research/lab/2026-07-29-strata-perf-convergence-worklog.md` (consecutive, at the end of the S22 block),
then **THE FRONTIER RESULT** standing law, then the **HARD GATE** block and **OPS TRAP 11** near the top.
`2026-07-31-S22-entry-handoff.md`, `2026-07-31-S21B-entry-handoff.md`, `2026-07-31-S21-entry-handoff.md`
and `2026-07-30-P5-entry-handoff.md` remain standing references and are NOT superseded.

**SAID PLAINLY: S23 IS SKETCHED HERE, NOT REGISTERED.** The coordinating session asked for a full S23
registration *if context remained after S22C*, and for this handoff otherwise. **This is the otherwise
branch, taken deliberately rather than by running out mid-registration.** Everything S23 needs is below;
the bars are marked SKETCH and must be turned into a registered block, with numbers, before anything runs.

---

## 0. WHERE THIS SESSION LEAVES YOU

Three arms built, run and scored this session, all committed with measured numbers:

| arm | commit | verdict | one line |
|---|---|---|---|
| S22 | `53c23455` | W8 row 4 TRADE | de-shard pass built; shards 123 -> 29, fans 297 -> 93; **population did not relocate** |
| S22B | `94b5ded0` | X8 row 4 TRADE | bar derived and lowered to 1.0 mm; photographed 232 -> 97, loose 2,129 -> 984, hubs 93 -> 31 |
| S22C | `c9ebe424` | Y8 row 4 TRADE, **Y1 REFUTED** | S8 protector cascade wired; **3.4% conformed, 96.6% self-blocked**; 1.5 mm census 44 -> 48 |

Registrations were committed BEFORE their arms (`e343b9f2` for S22B, `3f129e88` for S22C). Meshes:
`gothicarches_ring_DS-H_{S22A,S22B,S22C}.stl` in `research/exchange/_strataConformBisect/`.
**`_S22B` is the operator's current best mesh** — `_S22C` is 4 facets worse on the named target.

## 1. THE RESULT THAT DECIDES WHAT COMES NEXT

**THE P5 TRIGGER HAS FIRED FIVE TIMES AND THE BISECTION-FAMILY QUESTION IS CLOSED ON TWO INDEPENDENT
DEFECT CLASSES.** CTLPLUS (refinement FEEDS the class 211 -> 294) · S6 (collapse has ZERO candidates,
100% long-edged) · S7 (rotation FEEDS it x1.44) · S8 (conforming-by-split cannot reach the CROSSING class,
**86.3% self-blocked at production**) · **S22C (protector-cascaded conforming-by-split cannot reach the
LENGTH class, 96.6% self-blocked, 3.4% conformed, named target moved the WRONG way)**.

**THE COMMON CAUSE, now confirmed on two populations:** a post-loop pass inherits only what the main loop
could not already fix, so **its candidates are CENSORED AT THE S1 CAP** — 3-D AR just under 50. The
midpoint split of the longest edge is the amplification-minimising placement that exists on that edge; if
it emits a child over 50, no neighbour refinement and no re-placement can help. **The cap must stand**
(dropping it is D51: 48,130 blades and a ~110x-blind self-report).

>> **THEREFORE: STOP BUILDING LOCAL FINISHING PASSES.** What they achieve is real and is not retracted —
>> photographed 232 -> 97, loose band 2,129 -> 984, fan hubs 297 -> 31, fan members over 1.5 mm 111 -> 8,
>> at +0.3% cost with every fidelity and area tripwire holding. **But the residue is the cap-censored tail
>> and it is provably out of reach.** The next arm must change what produces the geometry, not what
>> repairs it.

## 2. S23 — THE RECONSTRUCTION PASS. **SKETCH ONLY. REGISTER BEFORE BUILDING.**

**THE ONE-LINE STATEMENT.** *Bisection texture never ships because bisection output never ships — only its
DENSITY MAP does.* Keep the refinement driver purely as an **oracle**, and rebuild the wall from the
aligned-CDT machinery in **one construction pass at final density**.

**THE FOUR ROLES, SEPARATED — this completes the separation this log started on 2026-07-29** (ranking key /
stop rule / certificate, "the driver may be as biased as it likes so long as it is never BELIEVED"):

1. **DENSITY ORACLE — the existing bisection driver, unchanged, run once.** Extract a per-cell target edge
   length `h(theta, z)` from the FINAL refined mesh's local edge lengths. The mesh is discarded; only the
   field survives. Every shard, fan hub and cap-censored blade dies with it **by construction, because none
   of that geometry is carried forward.**
2. **CONSTRUCTOR — the aligned CDT machinery, already built and proven.** `_strataAlignedSeed.ts` already
   composes tracer chains (394 components / 11,083 points / 235 junctions), graded across-rings
   (`ALIGNED_RINGS`/`TURN_MUL`), the X-crossing patch emitter (43 declared regions, 23,248 structured
   points on 549 graded rings, **free Steiner points only, watertight through ONE cdt2d call**) and the
   designed background lattice. **Today it runs at seed density and hands off to refinement. S23 runs it
   at FINAL density and hands off to nobody.**
3. **ACCEPTANCE — the composed gates, unchanged.** S1 aspect + S2 (theta,z) fold + footprint-normal
   admission on SHIPPED f32 values. These are element-wise and apply to a constructed element exactly as
   to a bisected one. **The admission precondition that made S22 safe carries over verbatim.**
4. **CERTIFICATE — the judge, unchanged.** `_strataFacetTruth` at Part-B depth, `_judgeNormal`,
   `_judgeShape`, the plate census, the shard/fan censuses.

**WHY THIS IS NOT A NEW MECHANISM AND THAT IS THE POINT.** Every component exists and is measured. S21B
proved the patch emitter is watertight through a single cdt2d call with zero constraint edges added; S19
proved the graded-ring completion; S15/S16 proved the across-spacing rules; S10 proved the topological
drop guard (loops 2, Euler 0). **S23 is a re-composition, not an invention** — the same class of work
S22C was, and S22C's wiring landed clean on the first run.

### BARS — SKETCH. Turn each into a number against a recorded control before running.
  * **THE PRIMARY IS THE SHARD/FAN CENSUS AND IT SHOULD BE ~0 BY CONSTRUCTION.** Outside declared geometry
    (the designed 1,101/385 um lattice and the declared patch regions), a constructed mesh has no
    refinement-to-background transition, so **there is no mechanism to birth a fan hub**. Registered
    thresholds unchanged: shard = long >= 1.0 mm AND (dev >= 45 deg OR AR3 >= 20); fan = vertex on >= 12
    facets carrying an edge >= 500 um. **Control = `_S22B`: 205 shards / 31 hubs / 97 photographed.**
    **A WIN THAT IS NOT ~0 IS NOT A WIN** — the whole claim is "by construction", so a nonzero count is a
    refutation of the construction argument and must be scored as one.
  * **FIDELITY WITHIN THE `_S22B` ENVELOPE.** H2 over-tol fraction <= 1.2x of 0.00139%; H2 witnessed
    relocation-classified on the same three conditions; unresolved <= 8,000 / worst <= 250.0 um; H1
    facets-over <= 1.30% quoted with coverage and stride **and with the full-coverage adaptive-oracle
    control beside it** (four arms now show the sampled H1 witness moving while the oracle reads 95.473 um
    at the same locus — do not repeat that mistake).
  * **COST — DERIVE IT FROM THE SEED-COST TABLE, DO NOT GUESS.** Inputs already measured this session:
    seed 116,931 points -> 233,062 tris; locus trace 400x280 in **25-29 s**; region extraction on a 1.22M
    STL **7 s**; the full production arm **934-1,017 s**, of which the seed+trace is ~30 s and the rest is
    bisection. **Final density is ~1.25M triangles, i.e. ~5.4x the seed's triangle count.** cdt2d is
    O(n log n), so the derivation to write down is: point count at target `h`, times the measured
    per-point cdt2d rate from the S10/S19 table, plus the trace (unchanged, it is density-independent).
    **State the predicted number BEFORE the run.** The prior worth registering: **reconstruction should be
    CHEAPER than refinement**, because 512,182 bisection splits and 926M rA evals are replaced by one
    triangulation — and if it is not cheaper, that is a finding.
  * **PRECONDITIONS, carried over:** folds 0; determined blades <= 3; worst admitted child AR <= 50;
    constraint recovery 100%; seam-cracks 0, Euler 0; judge NORMAL 0.
  * **IDENTITY + GATE:** md5 `8a59fb37a9115600b13262254380ccb0` byte-exact, hard gate 12/12 every value
    exact, both AFTER the edit. New flag DEFAULT OFF, unset path byte-identical.

### THE HONEST RISKS, REGISTERED SO THEY CANNOT BE CLAIMED AS SURPRISES
  1. **THE DENSITY FIELD MAY NOT BE EXTRACTABLE AT USABLE RESOLUTION.** The refined mesh's local edge
     length is a noisy estimator near creases. Smooth it, and you lose the feature; do not, and you import
     the bisection texture through the back door. **This is the arm's real technical risk and it should be
     probed at reduced cap FIRST** — the seed is built identically at any triangle cap, so a low-cap probe
     prices the constructor exactly (handoff rule: probe the SEED at low cap, never the POPULATION).
  2. **cdt2d AT ~625k POINTS IS UNTESTED HERE.** S21B's emitter probe already caught a cdt2d `mergeHulls`
     crash at 300k TRICAP. Expect to find limits; budget a probe arm.
  3. **THE FRONTIER LAW HAS NOT BEEN REPEALED.** S22 broke it on the interior wall twice, but S22B's loose
     band grew in the top rim bin (39 -> 43). A constructed mesh removes the refinement-transition
     mechanism; it does not obviously remove whatever produces the rim-row population. **Do not register a
     rim-row win.**
  4. **THE 25.063 um CONGRUENT COPY IS ORTHOGONAL AND WILL SURVIVE THIS.** It has now outlived a seed
     change, a graded-field completion, an accept-rule change, an admission invariant, a routing arm, and
     three de-shard arms — pinned to the digit at th 6.021386 z 113.45994, carrier 0.005430 mm^2. **It is
     Phase-2 grading demand and S23 must not claim it.**

## 3. WHAT IS BUILT AND WHERE (all scratch under `research/bridge/out/` is gitignored)

| asset | where | state |
|---|---|---|
| the de-shard pass | `research/bridge/_strataConformBisect.test.ts`, `PF_CB_DESHARD` | committed, DEFAULT OFF; sub-levers `_LMM _AR _DEV _DEPTH _BUDGET _FANDEG _FANLONG_UM _FANPASSES _CASCADE _CASDEPTH` |
| the protector cascade | same file, `deshardConform` | committed; `PF_CB_DESHARD_CASCADE=0` reproduces `_S22B` exactly |
| the length-keyed census | `out/s22shard.ts` | the SCORED instrument — do not edit it, or the arms stop being comparable |
| the S22B derivation | `out/s22bDerive.ts` | photographed-population + designed-lattice separation test + bar sweep |
| chain scripts | `out/s22_t1.sh`, `out/s22_arm.sh`, `out/s22b_arm.sh`, `out/s22c_arm.sh` | gate + identity + arm + audit + censuses, TRAP-11 durable with sentinels |
| scoped typecheck | `out/tsconfig.s22.json` | the repo tsconfig covers only `src`, so `npx tsc --noEmit` sees NOTHING in `research/` — this file is how you actually typecheck the driver |

**A TRAP WORTH INHERITING:** `npx tsc --noEmit | grep research/bridge` returns 0 errors because the root
tsconfig's `include` is `["src"]`. That "zero errors in research/bridge" line in earlier handoffs is
vacuous. Use `out/tsconfig.s22.json`. Under it the driver has **4 pre-existing `StyleDims`/`Phase2Dims`
errors** (lines 407, ~4103, ~4106, plus `s22shard.ts:16`) that are NOT ours and were not introduced by
this session's edits — that is the real baseline.

## 4. OPS — costs measured this session

| step | cost |
|---|---|
| production arm + de-shard pass | **934 s** (S22A) / **939 s** (S22B) / **1,017 s** (S22C) |
| Part-B deep audit | **~830 s** |
| hard gate | **~228 s** |
| W1 identity | **~225 s** |
| plate / shard / derivation census on a 1.25M STL | **60-90 s each** |
| esbuild bundle | `npx esbuild <f>.ts --bundle --platform=node --format=cjs --target=node20 --external:playwright --external:playwright-core --external:chromium-bidi --outfile=_run_<f>.cjs` — **the playwright externals are required** (`_gpuRankBridge` imports it) |

**OPS TRAP 11 AND ITS AMENDMENT WORKED END TO END FOUR MORE TIMES.** Background the chain with a failure
sentinel; issue repeated FOREGROUND `until <sentinel>; do sleep 25; done` waits at 600 s each, re-issued
IMMEDIATELY on timeout, never ending the turn between them. **The `nohup ... &` launcher's own completion
notification arrives within seconds and means NOTHING — it is the wrapper exiting, not the chain.** Bump
node `PriorityClass=AboveNormal` after each spawn. Always `NODE_OPTIONS=--max-old-space-size=16384`,
`-c vitest.strata.config.ts`, `--testTimeout=1800000 --hookTimeout=600000`.

**A `sed`-DERIVED CHAIN SCRIPT IS A TRAP.** `s22c_arm.sh` was derived from `s22b_arm.sh` by `sed` and two
census stages silently kept the OLD arm's tag as their argv (they read `S22B`, not `_S22B`). Caught by
`grep`-ing the derived script before launch. **Always `grep -n "_run_" <script>` and `sh -n <script>`
before backgrounding an hour of compute.**

## 5. THE ONE THING TO KNOW FIRST

> **The operator asked us to eliminate the sharded meshing, and across S22/S22B we removed 58% of the
> photographed population, 90% of the fan hubs and 93% of the long fan spokes — and then S22C proved the
> remainder cannot be removed by any bisection-family primitive while the aspect cap stands.** That is not
> a stall; it is the question being answered. **Every local repair has now been tried and measured: extra
> refinement, collapse, rotation, conforming-by-split, and conforming-by-split with a protector ladder.**
> The next arm should not repair geometry that bisection produced. **It should stop shipping geometry that
> bisection produced.**

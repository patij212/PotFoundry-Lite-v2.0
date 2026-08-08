# S120 TASK A — THE CASCADE, CENSUSED. S119's ESCAPE HATCH NEVER HAPPENS, AND THE POLE CLASS HAS NO BAD 3-D TRIANGLES.

2026-08-08. Instrument `PF_CB_S120_LINEAGE=1` in `research/bridge/_strataConformBisectL.test.ts`.
**Census only.** Both meshes come out of the driver, from the driver's own seed, through the driver's own
refinement loop. No new generator, no seed of my own, no offline refiner, nothing edited under `src/`.

Full tables + machine-readable JSON: `research/exchange/_strataConformBisect/s120/lineage/`
(`S120_TASKA_RESULTS.md`, `S120_PREREG.md`, `<tag>.s120.json`, `S120_THIN_*`, `S120_STLAR_*`). That tree
is gitignored, so every load-bearing number is reproduced here.

## The gates — both pass before anything is quoted

**Byte identity, THREE arms** (`run-s120-byteid.sh CelticTriquetra`), all `103,506` facets / `49,173`
splits / md5 **`b739496a2cbee0a2530adcbedbe6bdbf`**:
HEAD baseline (`_s120Baseline.test.ts`) · working tree flag-OFF · **working tree flag-ON**.
The third arm is the one every number below comes from, so it is the one that had to be free. (S119's
gate only proved its lever inert when UNSET.) The hash is the one S119's gate produced, so identity chains
back to `f7c55ae9`. The diff **deletes exactly two existing lines**, both in `refineDirected`'s candidate
loop, each re-added with an `if (S120_LIN)` counter on a branch the loop already took.

**Control identity, to the digit:** CelticTriquetra `1,282,394` facets / `48,535.770` mm²;
GothicArches `1,142,166` / `38,453.259` mm².
⚠ CT's recipe is **`PF_CB_TRICAP=2500000`**. `run-s119-arms.sh full` uses 8 M and yields 1,303,516 facets —
a *different mesh*. S119's "full" CT arms are not comparable to the S102 baseline.

**Cross-check:** `s118ThinCensus` on the shipped STL vs the in-driver f64 census — CT poles 3,546 vs
3,499+49; Gothic 736 vs 735+0; thin 35,927 vs 35,923 and 4,338 vs 4,337. f32 write rounding at the bar.

⚠ GitNexus was unavailable in this worktree (`.gitnexus/run.cjs` absent, MCP tools not reachable), so the
CLAUDE.md-mandated `impact()` / `detect_changes()` were **not run**. Substituted: the three-arm md5 gate —
a bit-identical mesh is a stronger blast-radius statement than a call-graph estimate — plus the two-line
deletion receipt above.

## 1. *** S119's SINGLE-CANDIDATE ESCAPE HATCH IS REFUTED. IT NEVER HAPPENS, ON EITHER STYLE. ***

S119's NO-GO rested entirely on an INFERENCE it never counted: *"on a thin facet the two non-crossing
edges are already sub-floor IN 3-D, so the candidate list has EXACTLY ONE MEMBER and there is nothing to
reorder."*

| `\|cand\|` | CT pops (615,981) | CT pole-emitting | GO pops (444,765) | GO pole-emitting |
|---|---|---|---|---|
| 0 | **0** | — | **0** | — |
| 1 | **0** | — | **0** | — |
| 2 | 24,440 (3.97%) | 1,909 (7.811%) | 5,100 (1.15%) | 85 (1.667%) |
| 3 | 591,541 (96.03%) | 1,152 (0.195%) | 439,665 (98.85%) | 608 (0.138%) |

* `|cand|` is **never 0 and never 1**, in 1,060,746 exhaustive pops.
* **`FLOOR_MM` rejected an edge in 22 CT pops and 8 GO pops — 0.0036% / 0.0018%.** The 3-D weld floor
  S119 blamed is not the gate. The **ASPECT GUARD** is (24,418 / 5,092 pops), and it never cuts more than one.
* In S119's *own* population — thin parents (< 0.02) — CT is `|cand|=2: 1,780`, `=3: 9,025`; GO `123` /
  `981`. **100% had ≥ 2 candidates.** Pre-registered kill line (">50% with ≥2") passed unanimously.

The reorder was never blocked. **The escape-hatch explanation for S119's NO-GO must be withdrawn.**

What *is* enriched at the selector: `|cand| == 2` (the aspect guard fired) carries **62.4%** of CT's
pole-emitting pops on 3.97% of pops — a **40.1×** pole-rate enrichment (12.1× on Gothic, but only 12.3%
recall there, so it is not a universal law). It is a **marker** of an already-8:1-elongated parent; this
census cannot separate marker from cause and does not claim to.

## 2. THE CASCADE, MEASURED DIRECTLY — RR 513× (CT) / 2,431× (GO)

Exact parent→child pairs: `bisectAt` kills one facet and emits two, and the link is taken at the emit
site, never reconstructed. CT 2,444,000 pairs, GO 1,774,480.

| bar | CT P(c\|p) / P(c\|¬p) → RR | GO P(c\|p) / P(c\|¬p) → RR |
|---|---|---|
| thin < 0.005 | 76.80% / 0.15407% → **498.5×** | 76.64% / 0.04189% → **1,829.9×** |
| thin < 0.02 | 62.59% / 1.19715% → **52.3×** | 66.87% / 0.18732% → **357.0×** |
| GR ≥ 10 | 59.04% / 1.25686% → **47.0×** | 61.45% / 0.13100% → **469.1×** |
| **GR ≥ 100** | **66.26%** / 0.12904% → **513.5×** | **79.47%** / 0.03270% → **2,430.6×** |
| GR ≥ 1000 | 86.00% / 0.00724% → **11,874.6×** | undefined — 23 children born, none ever split again |

Pre-registered bar was RR ≥ 5. **A degenerate parent hands the defect to its child two to four times in
five.** The empty-numerator Gothic row is reported as undefined, not as zero.

## 3. THE CASCADE HAS SEEDS — but the seed story reaches 98% of the class on Gothic and only 48% on CT

| | CT | Gothic |
|---|---|---|
| poles alive | 3,499 = 0.2738% count, 60.811 mm² = **0.1254% area** | 735 = 0.0644%, 4.110 mm² = **0.0107% area** |
| **distinct ancestral roots of the pole class** | **409 of 56,000 = 0.7304%** | **156 of 254,926 = 0.0612%** |
| top 1% of those roots carry | 8.75% of poles | 9.39% of poles |
| max birth generation | 26 | 18 |
| **poles with NO thin ancestor at all** | **1,818 / 3,499 = 51.96%** | **15 / 735 = 2.04%** |

Pre-registered "seeded" bar was < 5% of surviving roots; both clear it by 7× and 80×. Poles' *share* of a
generation rises monotonically into the deep tail (1.68% at gen 16 on CT, 33% at gen 16-17 on Gothic).
Lineages cross thin < 0.02 around gen 9-10 (CT) / 5-6 (GO), ~4-6 generations before the pole appears.
**But half the CT pole class is unreachable by any ancestor-thinness test.**

## 4. A PARENT-ONLY PREDICATE IS NOT ACTIONABLE — as registered, on both styles

`parent thin < X` → child is a pole (base rate CT 0.1869%, GO 0.0562%):

| bar | CT prec / recall | GO prec / recall |
|---|---|---|
| 1e-3 | 81.25% / 2.85% | 90.00% / 1.80% |
| 3e-3 | 32.27% / 9.04% | 54.37% / 13.73% |
| 1e-2 | 7.65% / 20.97% | **22.63% / 43.49%** |
| 3e-2 | 1.49% / 34.69% | 6.81% / **85.47%** |
| 1e-1 | 0.47% / 58.79% | 0.75% / 100.00% |

Pre-registered "actionable" = precision ≥ 20% **and** recall ≥ 50%. **No rung reaches both on either
style.** Quoting the 100%-precision rung without its 0.35% recall would be the vacuous one-sided bar this
campaign has already paid for.

Which of the parent's three ARC edges is cut (`eLenP`), pole rate per birth:

| edge cut | CT | GO |
|---|---|---|
| SHORTEST | 0.1871% (571,854) | 0.0282% (287,112) |
| **MIDDLE** | **0.3417%** (704,372) | **0.1195%** (484,582) |
| LONGEST | 0.0935% (1,167,774) | 0.0337% (1,002,786) |

**The only signal both styles agree on: cutting the MIDDLE arc edge is worst — 3.65× / 3.55× the longest
edge's pole rate.** They do *not* agree the shortest is bad (2.00× worse on CT, 0.84× — slightly *better* —
on Gothic). So **"always split the longest arc edge" is NOT supported by this data**; "never split the
middle" is, and I have no mechanism for it. Given `project_strata_artefact_deep_review`'s measured
refutation of the isotropic angle-sizing law, no sizing rule may be inferred from this table without its
own A/B and a ≥4-rung density ladder.

## 5. *** THE STRUCTURAL CEILING: 70-77% OF POLE BIRTHS ARE ON A FACET THAT NEVER RAN THE SELECTOR ***

`bisectAt` splits **every** triangle incident to the chosen edge. One of them was popped and ran the
candidate loop; the other has the split **imposed** — no candidacy test, no aspect guard, no floor, no say
in which of *its own* edges is cut.

| | CT births / pole rate | GO births / pole rate |
|---|---|---|
| **IMPOSED** (neighbour) | 1,218,806 (49.87%) / **0.2624%** | 886,590 (49.96%) / **0.0870%** |
| SELECTED (popped) | 1,225,194 (50.13%) / 0.1119% | 887,890 (50.04%) / 0.0256% |
| ratio | **2.34×** | **3.40×** |
| **share of ALL pole births** | **70.0%** (3,198/4,569) | **77.3%** (771/998) |

**Any remedy that tests only the popped facet — every selector lever this campaign has tried, S119's
parameter metric included — can reach at most 23-30% of pole births BY CONSTRUCTION.** S119 instrumented
the selector; the defect is mostly born on the other side of the edge, where there is no selector at all.

## 6. *** THE POLE CLASS CONTAINS ZERO BAD 3-D TRIANGLES. THE UNGUARDED AUXILIARY EMITTERS CONTAIN ALL OF THEM. ***

`graphRatio` and thinness are **arc-space** quantities on `(u = r·θ, v = z)`. A facet on a near-vertical
piece of surface has a tiny (θ,z) footprint BY CONSTRUCTION and reads as a pole while being a fine
triangle in R³. So every pole was also scored in 3-D with the driver's own `aspect3`:

| wall | poles | over AR > 50 | worst 3-D AR | min 3-D altitude |
|---|---|---|---|---|
| CT | 3,499 | **0** | 49.99 | 2.911 µm |
| Gothic | 735 | **0** | 45.07 | 4.238 µm |

The driver's own independent exhaustive post-loop scan agrees on CT (*"facets over cap BEFORE 0 (worst
50.0)"*). **`graphRatio ≥ 100` means "this facet stands on a near-vertical piece of surface", not "this
facet is a sliver".** At the published density it convicts not one facet the driver's own 3-D shape metric
calls bad, on either style.

Now the STL, scanned exhaustively in a **separate process** with an independent transcription of
`aspect3` (`research/tools/s120StlAr.cjs`, plain CJS — no esbuild, safe beside a live arm):

| | over AR > 50 | area | worst AR | where |
|---|---|---|---|---|
| **CT** | **714** (0.0557%) | 3.756 mm² | **190.93** | **707 in three 0.1 mm z-bands, z = 32.4 / 46.8 / 82.8, max facet z-span 8.0e-3 mm** |
| Gothic | 4 (0.0004%) | 0.059 mm² | 85.13 | scattered singletons |

The driver reported `z-steps 3` for CT. **Those three bands ARE the detected C0 steps — the tread
annuli.** The in-driver tread census agrees facet-for-facet:

> **`stitchRings` (`:4605-4635` at HEAD) — first audit ever.** 4,394 facets, 0.3426% of the soup,
> 51.998 mm². **707 (16.09%) exceed AR > 50; worst 3-D AR 191.01 = 3.82× the driver's own cap**, 3.738 mm².
> 49 are poles carrying 19.510 mm² — 37.5% of tread area and **24.3% of the entire mesh's pole area from
> 0.34% of its facets**. 1,045 (23.78%) arc-space thin; min arc altitude 106.348 nm; min 3-D altitude
> 2.674 µm; zero sign inversions; zero exactly-zero-area facets.

100% arc-space thinness on a riser is expected — a riser *is* a vertical wall. **The AR > 50 count is the
defect.** The 707-vs-714 gap is f32 rounding on wall facets sitting at exactly AR 50.00, which is where
the guard admits its worst child. Gothic has **zero** treads; its four over-cap facets trace to the other
unguarded emitter, and the driver says so itself:

> `initial grid: 3 of 254,926 facets over the cap, worst AR 85.13` — *"BORN OVER THE CAP. No split guard
> can have caused these and none can repair them — S1 refuses their splits, so they are FROZEN into the
> STL."* That is the **ALIGNED SEED builder**, `_strataAlignedSeed.ts`.

### The answer to "what creates a bad triangle" splits cleanly in two

1. **The refinement loop does not create 3-D-bad triangles.** Its S1/S2 guard is binding and exact: zero
   over-cap facets on either style, worst admitted child AR exactly 50.00. What it creates is an
   **arc-space** degeneracy that cascades at RR 513-2,431×, seeds from 0.06-0.73% of the initial facets,
   is 70-77% born on the **imposed neighbour** side where no selector runs, and is **0.011-0.125% of the
   mesh by area**.
2. **Every 3-D-bad triangle in the shipped file came from an emitter that is not the refinement loop and
   has no admission test:** `stitchRings` (707 of CT's 714 over-cap facets = 99.0%) and the aligned seed
   builder (3 on Gothic). **Neither is covered by the driver's own cap scan.**

## 7. UNKNOWNS — named, with their settling measurements

* **Whether the imposed-side excess is *because* the neighbour gets its middle/short arc edge cut.**
  Settling measurement: the rank × imposed/selected cross-tab at birth — one more `if (S120_LIN)` block in
  `s120NoteBirth`, one re-gate, one arm per style. **Not run.**
* **Why the MIDDLE arc-edge rank is worst on both styles** while the shortest is not consistently bad.
  No mechanism. Do not build a sizing law on that table.
* **Whether the arc-space pole class matters to the product at all.** It is 0.011-0.125% of area and
  contains no 3-D-bad triangle. Whether it maps onto the *position* residual is a perpendicular-projector
  measurement, not this one.
* **The tread emitter's POSITION error.** This audit measured shape only. `stitchRings` also has no
  parameter-space placement, and nothing here says how far its risers sit from the analytic surface.
* **Edge conformance** (the session's stated standard, `max over the edge of dist(edge point, surface)`)
  is not measured by this instrument. No one has scored an edge; Task A did not either.

## 8. Reproduce

```bash
cd .claude/worktrees/s112-angular-quantity/potfoundry-web
bash research/tools/run-s120-byteid.sh CelticTriquetra            # the 3-arm md5 gate
bash research/tools/run-s120-lineage.sh CelticTriquetra S120CTL1  # 1,282,394 facets or the run is VOID
bash research/tools/run-s120-lineage.sh GothicArches    S120GOR1  # 1,142,166 facets or the run is VOID
PF_S118T_STL=<abs>.stl PF_S118T_TAG=<tag> bash research/tools/run-s120-thin.sh
node research/tools/s120StlAr.cjs <abs>.stl 50
```

⚠ Ops, observed live again this session: a concurrent `npx esbuild` tears down the esbuild service a live
vitest holds through the junctioned `node_modules`. `run-s120-thin.sh` therefore refuses to bundle unless
`PF_S120_BUNDLE=1`, and `s120StlAr.cjs` is dependency-free CJS on purpose.

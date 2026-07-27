# All-20 scorecard — directed-bisection universal mesher (2026-07-25)

> # ⛔ SUPERSEDED 2026-07-27 — "19 closed" DOES NOT MEAN 0.01 mm TRUE-3D. Read the re-audit first.
>
> **`research/lab/2026-07-27-facet-truth-reaudit.md`.**
>
> Every "closed" verdict below was produced by `sagOfN`, which samples a **fixed** barycentric lattice
> (`n = clamp(ceil(longestEdge/0.03mm), 12, 64)`) and measures distance to a triangle's **infinite plane**.
> It has no error bound, its pitch is capped at 0.03 mm against a 0.01 mm bar, and — decisively — **it is
> the same sampler that drives refinement**, so a facet spanning a feature it cannot see is never refined
> *and* never flagged. The sixteen rows reading exactly `MAX 5.000 µm` are reporting `ACCEPT` back, not
> measuring the mesh. This was demonstrated deterministically, not argued: on a mesh missing 400 µm of
> relief, this ruler reads **5.552 µm "clean"** while an independent two-sided auditor reads **391.661 µm**.
>
> Re-measured against the true surface on these exact meshes, **6 of the 19 carry genuine interior
> tessellation defects** and one more fails only at the ring's open rim:
>
> | row | this scorecard | re-audit (floor) | where |
> |---|---|---|---|
> | GothicArches | 5.856 PASS | **20.077** | wall-wide, 2 372 samples, peak at the arch rib |
> | CelticTriquetra | 5.079 PASS | **17.837** | interior, upper wall |
> | GyroidManifold | 7.416 PASS | **17.299** | wall-wide, uniform |
> | GeometricStar | 4.999 PASS | **12.675** | interior, one cluster at z 10-15 |
> | Voronoi | 5.000 PASS | **11.906** | interior, scattered |
> | Crystalline | 5.000 PASS | **10.302** | interior, marginal (3 samples, +3 %) |
> | BasketWeave | 7.034 PASS | **93.662** | **RIM BAND ONLY** — ring boundary, wall is clean |
>
> The twelve remaining rows do hold (worst: DragonScales 8.853, BambooSegments 7.457 — both floors). The
> split is not noise: it is exactly smooth/layered vs **sharp-locus** styles, and on the twelve holding rows
> both rulers agree, which is what makes the disagreement on the others meaningful.
>
> Nothing below is deleted — the mesher work, and the vertex placement in particular, is not in dispute.
> What is withdrawn is the claim that these numbers certify 0.01 mm true-3D fidelity.

**One pipeline, zero per-style code.** `research/bridge/_strataConformBisect.test.ts` (`PF_STRATA_CB=1`), `PF_CB_DIRECTED=1`, grid 200×140, ruler ≡ audit ruler (`REF_HS=0.03 REF_NMIN=12 REF_NMAX=64`), `ACCEPT=0.005`, `TRICAP=5M`, `LOCUS_AUDIT=1`, **registry defaults**, `ring` stage unless noted.

> # UPDATE 8 — §10's slot-reuse allocator is BUILT and REFUTED. The shear's real mechanism is MEASURED (it IS a parking bug, contrary to §8) — and the obvious repair is refuted too, at 140 rows but not at 40
>
> Pre-registered target (§10): inter-row column shear **42 573 µm → ~1 400 µm**, all revert gates held. **Not met.**
> **Four attempts, all measured, all reverted. No mesh-affecting change is kept** — the harness reproduces its
> recorded numbers exactly. What is kept is instrumentation (a shear forensics dump; a tie-break falsification knob)
> and four things now known rather than assumed: §10's reuse has nothing to reuse (§2); §10's sweep is not
> order-consistent (§3); the shear's dominant term is a parking bug in the dormant-slot LAYOUT (§4); and the residual
> is forced by the mesher's fixed per-band column count, not by the allocator (§5).
> `_strataConformBisect.test.ts` was not touched. CelticKnot stays open — **19 closed / 1 open**.
>
> ## 1. Attempt D — the reserved-room ceiling: a clean win at 64×40, a broken grid at 208×140. REVERTED.
>
> CelticKnot ring, registry defaults, 200 k cap, `PF_CB_HAUS=1`:
>
> | 64×40 | baseline (HEAD) | reserved-room ceiling | |
> |---|---|---|---|
> | inter-row COLUMN SHEAR, worst | 42 573.117 µm | **17 769.874 µm** | 2.4× |
> | **HAUSDORFF MAX** (product ruler) | 1 942.268 µm | **1 019.065 µm** | 1.91× |
> | worst skewed edge at the HAUS locus | 12 171.7 µm | **2 172.5 µm** | 5.6× |
> | plane HEADLINE MAX · p50 · spread | 691.173 µm · 2.056 · 1.1× | 641.272 µm · 1.619 · 1.0× | |
> | non-manifold / seam-crack | 0 / 0 | 0 / 0 | gate ✓ |
> | coverage · θ-order · cycle-breaks · MINSEP-moved-LIVE | 0/2612 PASS · 0 · 0 · 0 | 0/2612 PASS · 0 · 0 · 0 | gates ✓ |
> | order-repair demoted · branch separation | 101/2452 · 463× | 101/2452 · 463× | unchanged |
> | CURTAIN PLACEMENT MAX | 132.461 µm | 132.461 µm | identical |
> | shear events over 1 mm | 1159 | 1259 | *worse* |
>
> Every gate green, two rulers improved, the curtain untouched. **Then the same code at 208×140, 450 k, `PF_CB_BRSKIP=1`:**
>
> ```
> non-manifold 784  FAIL   ·   seam-crack 2477  FAIL   ·   boundary 2863, loops 22     (baseline: 0 · 0 · 571, 2)
> and at 159 k cap — essentially NO refinement, so this is the INITIAL GRID:
> non-manifold 370  FAIL   ·   seam-crack 2379  FAIL   ·   boundary 2769, loops 22
> ```
>
> Cause: bunching dormant slots at the ceiling collapses the spans the FILLER columns must occupy, and the filler
> count `nSubT` is sized from the WIDEST row — so a slot needing ~9 fillers at gu=208 is handed a span of a few
> MINSEP. Same failure class as attempts B and C, invisible below ~140 rows.
>
> **METHOD NOTE, worth more than the attempt: a 64×40 fast probe CANNOT gate a column-layout change.** The watertight
> failure is row-count-dependent — 0/0 at 40 rows, 370/2379 at 140. §8's attempts A and B were also judged at 64×40.
> Any future layout change must clear 208×140 on the INITIAL grid before its fidelity numbers mean anything.
>
> ## 2. §10's premise does not hold: there is nothing to reuse
>
> The allocator was built exactly as specified (ordered label list, release on death, newborn takes a free label
> between its θ-neighbours, list grows only when none fits) plus the two constraints a reuse needs to not become a
> new shear source (a one-row cooldown, so a curtain quad can never span two tenancies — asserted at emission — and
> a per-row translation budget). It ran clean and stayed watertight. It also did **nothing**:
>
> ```
> 252 branches → 251 column LABELS   ·   1 reused / 251 fresh   ·   compression 1.00×
> max simultaneous live 18           ·   SHEAR 42 573.117 µm — UNCHANGED to three decimals
> order-repair DEMOTED 101 → 307     ·   tracer COVERAGE 0/2612 PASS → 104/2612 FAIL (worst 14 639.9 µm)
> ```
>
> **Why:** `M = brs.length` is per BAND, and CelticKnot's bands hold 18–36 branches with **14–18 live at every row**
> (per-band counts 24,24,18,24,18,36,24,24,18,24,18 — the "252 slots" in the report is the sum over 11 bands, not one
> band's allocation). Branch lifetimes overlap almost completely, so "≈ the max simultaneous live count" is 18 against
> M = 24–36: a 1.3–2× ceiling, and 1.00× achieved. §10's "~18 of ~23 slots per band are dormant at any row" inverts
> the measured ratio — ~60 % of slots are LIVE.
>
> ## 3. The sweep is not order-consistent by construction — and the reason is structural
>
> Tried separately, as an ORDERING rule replacing the topological sort (same insertion rule, ties between co-born
> siblings broken by dθ/dz): **DEMOTED 101 → 243/1942, COVERAGE 0/2550 PASS → 86/2550 FAIL, shear unmoved.**
>
> A newborn's position relative to a label that is dormant NOW but live LATER is decided with no co-live evidence — it
> compares a θ at this z against a θ at that branch's own birth z, which is precisely the "mean θ is not
> order-consistent" trap the topological sort exists to avoid. The decision is then permanent, so every later row
> where the two are co-live in the opposite order costs a demotion, and a demoted slot is an unmeshed locus. Reverted.
>
> ## 4. What the shear actually is — read off a forensic dump, not inferred
>
> New instrument (kept): every over-budget shear event now records liveness at both rows, the two LIVE anchors
> bracketing the slot, and the live count. The baseline's twelve worst events are all the same shape — a slot going
> **LIVE → dormant**, i.e. a branch DEATH:
>
> ```
> 42573.1 µm  slot 12  z 46.6667→46.6775  θ 7.0974→6.1513  live L→.  bracket 11@5.6784 .. 14@7.0971
>             5.6784 + (7.0971 − 5.6784)/3 = 6.1513   ← exactly the uniform-lerp share
> ```
>
> The dying slot's park **is** its death θ (7.0974), and a death is a MERGE, so the right place for that label is
> immediately beside the partner it merged into. `min(park_k, lerp_k)` — attempt C, §8 — refuses to leave it there,
> because park > lerp whenever the run's upper anchor is that partner.
>
> **So item 1 IS a parking bug, contradicting §8's "NOT a parking bug" conclusion.** The earlier reasoning was right
> that no *ceiling of that form* could fix it, and wrong to generalise that to all layout rules. But the correction
> is narrow: the repair that follows from it (attempt D, §1) is itself refuted at 140 rows. What survives is the
> attribution — this half of the shear lives in the DORMANT-SLOT LAYOUT, not in the allocator, and it is worth
> 42 573 → 17 770 µm and 1 942 → 1 019 µm of Hausdorff to whoever finds a form of it that stays watertight.
>
> ## 5. The residual is FORCED — falsified, not assumed
>
> Under attempt D (i.e. with the death-side half of the shear removed) every worst event changes class to a **birth
> crushing a dormant run**:
>
> ```
> 17769.9 µm  slots 17..20 dormant  z 46.6667→46.6775  θ 7.5394→7.1445  live .→.
>             bracket 15@7.1445 .. 22@7.7257   →   15@7.1442 .. 21@7.1448     (slot 21 BORN at 7.1448)
> ```
>
> Four never-co-live slots stranded between an anchor and a newborn that lands beside the anchor *below* them, then
> crushed as that bracket collapses to 27 µm of arc. That looks like allocation freedom, so it was **tested**:
> `PF_CB_TR_TIEKEY` runs Kahn with the branch's birth θ (0), its mean θ (1, default) or a deterministic pseudo-random
> key (2). Kahn honours every co-live edge whatever the key, so the key selects a linear extension and nothing else.
>
> **All three keys give byte-identical output** — shear 17 769.874 µm / 959 events, demoted 101/1942, coverage
> 0/2550 PASS. The linear extension is not free: the co-live edges force it. **No allocator, ordering rule or reuse
> policy can move the residual.** It is the fixed per-band COLUMN COUNT meeting a θ-interval that genuinely collapses
> in z, and it is resolution-independent because the collapse happens at merge-corner rows (δz ≈ 0.01 mm), which
> exist at every grid density.
>
> ## 6. HANDOVER — the refined design
>
> **The residual (§5) is a MESHER limitation, not an allocator one.** The band model requires one column count for
> all its rows, so a run of dormant columns trapped inside a bracket that collapses **must** compress into it, and
> compressing it is what breaks either the shear (uniform lerp) or the fillers (any bunching ceiling). Two ways out:
>
> 1. **Per-row column count with an angle-merge stitch between consecutive rows.** The machinery already exists — the
>    tread annuli stitch loop-to-loop by angle merge between loops of DIFFERENT sizes. Applying it row-to-row inside
>    a band lets a dormant column be *dropped* at the row where its bracket collapses instead of being crushed into
>    it, which removes the crushed quad AND the filler-span problem that killed attempt D in one move. This is the
>    architecturally correct answer, and it is a mesher change, not an allocator change.
> 2. **Split the band at the collapse z.** Cheap to state, but bands are meshed disconnected and re-stitched, and that
>    stitch is only sound at a genuine C0 z-step — an arbitrary split would open a crack. Needs the same angle-merge
>    stitch as (1), so (1) subsumes it.
>
> Do **not** revisit: slot reuse (§2), the ordered-label sweep as an ordering rule (§3), full-order constraints (§8
> attempt A), the bare-anchor clamp (§8 attempt B), the reserved-room ceiling (§1 attempt D), or Kahn tie-break keys
> (§5). And do not judge the next one at 64×40.
>
> **§8c's prediction remains untestable.** Under attempt D — half the shear removed — `worst-left` was still
> 598.071 µm (64×40) and 597.982 µm (208×140 with `PF_CB_BRSKIP=1`). That is consistent with §8c's own reasoning:
> the wrong-side region on the crushed quads is wider than the 50 µm attribution band, so the guard correctly refuses
> to forgive it. Convergence stays blocked behind item 1 above.
>
> ## 7. Gates, stated plainly
>
> **Shipped state = HEAD behaviour.** Verified after the revert (32×8): shear 42 573.117 µm, non-manifold 0,
> seam-crack 0, coverage 0/2550 PASS, θ-order 0, cycle-breaks 0, MINSEP moved 0 LIVE columns, demoted 101/1942 —
> i.e. the instrument reproduces its recorded numbers and only gained measurement output.
> Not met: shear 42 573 µm vs the ~1 400 µm target; Hausdorff 1 942 µm vs ≤ 10 µm; still CAPPED, not converged.
> Pre-existing and untouched: GHOST live slots 12/2978 FAIL.
>
> **When quoting the Hausdorff number, carry both caveats:** an unmeshed cliff still reads the full jump (the far
> branch has no mesh near it), so it cannot hide a missing curtain; and distance-to-mesh ≤ distance-to-covering-
> triangle, so the 19 already-closed rows can only improve under it — their PASS status is unaffected.

> # UPDATE 9 — per-row columns FIX THE SHEAR (64×, at the analytic floor); the blocker moves to the GUARD's locus finder
>
> `PF_CB_TR_PERROW=1` (default OFF). Each row gets its own column set — branches live at that row plus per-row fillers — and consecutive rows are stitched by the **existing** angle-merge walk (`stitchWalk` refactored onto a shared `walkMergeIdx`: one stitcher, two consumers, no duplicate). Correctness condition is **anchoring** — spans run between slots live at *both* rows, so a curtain's r⁻/r⁺ pair can never be split by the merge. A dying branch simply has no column above it, so no quad is emitted into a collapsing bracket.
>
> | INITIAL GRID | control | reserved-room (§8, failed) | **per-row 208×140** | **per-row 208×280** |
> |---|---|---|---|---|
> | non-manifold / seam-crack | 0/0 | **370 / 2379** | **0 / 0** | **0 / 0** |
> | coverage | 0/2725 PASS | — | 0/2725 PASS | 0/2737 PASS |
> | θ-order · cycles · MINSEP-LIVE | 0·0·0 | — | 0·0·0 | 0·0·0 |
> | **column shear** | 42,573.117 µm | 17,769.874 | **1,577.048** | **663.101** (over-1 mm **0**) |
> | init tris | 174,912 | — | 105,884 (−39 %) | 172,900 |
>
> Shear is now **at the locus's own analytic floor** — 32×8 gives 10,173 µm against the `|dθ/dz| ≤ 0.0329 rad/mm` bound of 10,490 µm (0.97×) — and scales 1577 → 663 for 2× rows. Control (flag off) reproduces 42,573.117 µm to three decimals; **BasketWeave reproduces every recorded number** including `key-inversions 39778`, so the stitcher refactor is provably inert.
>
> **Certification run — NOT closed.** 208×280, 900 k, `BRSKIP=1 HAUS=1`, 3629 s, 541,176 tris: 0 non-manifold · 0 seam-crack · coverage PASS · placement p999 **2.854 µm** (floor 2.670 ⇒ **at the floor**) · **HAUSDORFF MAX 483.807 µm** (from 2125.821 same grid/cap ⇒ 4.4×) · plane 602.873 · **CAPPED**, heap 122,431, worst-left 597.949.
>
> ## TWO PREDICTIONS REFUTED BY MEASUREMENT
> - **§8c is refuted.** It predicted `worst-left` would fall below 598 µm once the shear was gone. Shear fell **64×**; `worst-left` moved 598.001 → **597.949**. **The shear and the driver floor are INDEPENDENT defects, not coupled.**
> - **The Hausdorff candidate-set hypothesis is refuted.** Same-mesh A/B: 1-ring 569.599 vs 3-ring 559.227 = **1.0×**. The bound was tight. Do not revisit.
>
> ## WHERE THE RESIDUAL ACTUALLY LIVES (`PF_CB_WHYBIG=1`, attributed not inferred)
> Every reading puts the plane-MAX argmax **ON the locus** — 0.000–0.007 µm of arc — where `rA` is branch-arbitrary:
> `argmax θ=2.745129 z=79.3682 · TRUE locus θ=2.745129 (jump 600.000 µm) · 0.001 µm ABOVE, centroid BELOW ⇒ WRONG-SIDE, INSIDE the 50 µm band`.
> Not shear, not an unmeshed cliff, not the candidate set. `BRSKIP` exists to forgive exactly this and fails to fire, for **two measured bugs in `locusThNear`** (the guard's locus finder — *not* the ruler's definition):
> 1. **No ε→0 jump verification** (which `lociWinAll` already has). Proven directly: it returned `TRUE locus θ=1.206158 (jump 0.000 µm)` — a false locus.
> 2. **Recall 4–27 % short**: no locus found for 21,808/375,648 triangles at 280 rows (26,409/97,244 at 140). Its window `min(0.05, max(2e-3, spanTh))` is narrower than the locus's θ-motion across a large triangle's z-span — 0.046 rad over a 1.4 mm cell against a 0.03 rad window.
>
> **The blocker has moved out of the mesher and into the guard.** These are correctness bugs in a *finder* (it returns loci that are not loci, and misses loci that are there), not adjustments to a *ruler* — the distinction that keeps the fix honest. Validation is fixed in advance: the BasketWeave A/B must stay byte-identical.

> # UPDATE 7 — the "√-cusp" diagnosis is REFUTED; the tail was IDENTITY, and a traced-contour curtain removes it
>
> New instruments: `research/bridge/_strataCkContour.test.ts` (`PF_STRATA_CKC=1`, contour tracer + jump-family census)
> and a `PF_CB_TRACE=1` path in `_strataChainCurtain.test.ts` (default OFF).
> `_strataConformBisect.test.ts` — the instrument behind the 19 confirmed rows — is **not touched at all**. Inside
> `_strataChainCurtain.test.ts` the only mesh-affecting additions are gated on `TRACE`; the per-row z and per-row
> liveness arrays reduce to the previous constants when it is off. Two MEASUREMENT-only changes do apply to the chain
> path and are stated so no number is compared across them: the placement/chord audit now skips PINCH-to-PINCH edges
> (both ends branch 0 ⇒ no curtain triangle was ever emitted there), and `PF_CB_PLACE_STRIDE` (default 1 = no change)
> can subsample the probed edge list.
>
> ## 1. There is no parameterization singularity. The loci are gentle sines.
>
> The contour census measures the locus TANGENT at every z-jump site (the direction along which the two-sided
> difference vanishes). Minimum tangent angle **34.0°** ⇒ **|dθ/dz| ≤ 0.0329 rad/mm** = 1.48 mm of arc per mm of z.
> That is exactly the analytic bound of CelticKnot's strand sine, `(2π/3)/2 · amp · dv/dz` = 0.03290 rad/mm. A
> coalescence is therefore a **transversal corner** of ∂{minD ≤ strandW}, where both arcs have finite slope — not a
> parabola with dθ/dz → ∞. Chording it converges QUADRATICALLY, and the whole row sweep is predicted by one number:
>
> | rows | δz | predicted chord sagitta `r·θ''·δz²/8` | measured placement |
> |---|---|---|---|
> | 140 (chain) | 0.857 mm | 10.7 µm | p90 **7.573** ✓ · MAX 1130.5 ✗ (**106×**) |
> | 560 (chain) | 0.214 mm | 0.667 µm | p90 **0.684** ✓ · MAX 1786.2 ✗ (**2666×**) |
> | 40 (TRACE) | 3.000 mm | 130.8 µm | MAX **123.2** ✓ (**0.94×**) |
>
> The p50/p90 always tracked the sagitta model; the MAX never did. The tracer removes the entire non-sagitta term.
>
> ## 2. What the tail actually was — measured, not inferred
>
> The A-run (chain path, 140×208, 120 k cap) reproduces UPDATE 6 exactly (MAX 1130.516 µm, p999 837.396). Splitting
> the placement probes by whether the curtain edge carries a real jump at BOTH ends:
> `LIVE 6065 edges MAX 1129.632 µm` / `DEAD 1775 edges MAX 1130.516 µm`. So it is **not** a dead-column artifact: a
> LIVE edge with a genuine 600 µm cliff at each endpoint is 1.13 mm of arc from the nearest locus — i.e. ONE chain
> edge joins two DIFFERENT branches ~0.05 rad apart, implying |dθ/dz| = 0.059 rad/mm, **1.8× the physical maximum**.
> That is the greedy nearest-θ matcher swapping identity where two loci close below its window. Three failure modes,
> one cause: identity, termination, and coverage (m = 18 slots allocated for ~116–252 monotone branches).
>
> ## 3. The mechanism: trace by CONNECTIVITY, not by per-row re-detection
>
> March each locus in z with a **slope-continuity gate** (at a merge the partner arc has the opposite slope, so an
> inconsistent candidate is a HOP and is refused; the step then shrinks until the death z is bisected exactly), round
> each merge onto its partner, cut the curve into monotone branches, give every branch its own column slot, make every
> merge corner a mesh ROW, and order the slots by a **topological sort of the per-row θ order** (a mean-θ sort is not
> order-consistent — 1183 violations, and MINSEP then compressed the grid and left a 92 mm triangle).
> Traps found and fixed by measurement, each worth recording:
> * a corrector window that scales with the step (0.14 rad) exceeds the 0.09 rad inter-locus gap ⇒ silent hopping;
> * a merge-rounding marcher never re-hits its seed, so a closed curve must be closed on its **corners** (else 15×
>   over-tracing);
> * a wide merge window buys no recall (a true partner is 7e-8 rad away 1 µm below the death) but does admit spurious
>   hops that put CYCLES in the slot-order graph;
> * dormant slots must be **parked on their own branch**, not re-interpolated per row — otherwise an inert column
>   moves ~1 rad in one row step, and the plane ruler is blind to the resulting 49 mm skewed quad.
>
> ## 4. A ruler finding that matters beyond CelticKnot
>
> `sagOfN` measures |analytic point − the triangle's own PLANE|. On a **curved** h⁰ locus that is structurally
> inflating: a straight mesh edge cannot lie on a curved cliff, so between the curtain chord and the true locus there
> is always a strip of width = the chord sagitta in which a sample belongs to the branch on the other side of the
> chord. Its distance to THIS plane is the full 600 µm jump; its distance to the MESH is the strip width, because the
> correct sheet is a few µm away. **No density empties the strip**, so a plane-distance MAX can never reach 10 µm on a
> curved cliff at any finite budget. Every previously-closed h⁰ style (BasketWeave's constant-θ column, the four
> constant-z tread styles) has an exactly representable STRAIGHT locus and therefore no strip — which is why this has
> not appeared before. The product bar is one-sided Hausdorff, so `PF_CB_HAUS=1` re-measures every plane-over-tol
> triangle against the nearest point of the local mesh. It cannot hide a missing curtain (an unmeshed cliff has no
> mesh near it and still reads the full jump), and it is strictly more sensitive to slivers than the plane ruler —
> it is what found the 49 mm quad the plane ruler missed.
>
> ## 5. Measured — `PF_CB_TRACE=1`, registry defaults, ring, 208×280, 900 k cap, 1718 s
>
> ```
> 252 curves → 252 monotone branches → 252 column slots; 108 merge-corner ROWS inserted
> θ-order violations 0 · cycle-breaks 0 · order-repair demoted 101/6639 live row-slots
> TRACER COVERAGE: 0/2737 loci without a live slot  PASS   ·  ghost live slots 7/3067
> branch separation MIN 23.150 µm vs weld 0.050 µm = 463×   ·   0 non-manifold · 0 seam-crack
> CURTAIN PLACEMENT  p50 0.000  p90 0.011  p99 2.110  p999 2.844 µm   MAX 24.181 µm
>                    over-0.01 mm 37/56 622 probes (0.065 %)
> HEADLINE (plane ruler) MAX 700.493 µm  ·  p50 0.498  ·  CAPPED (86 110 left, worst-left 597.98)
> ```
>
> **Placement p999 = 2.844 µm against a predicted sagitta bound of 2.670 µm** — 99.9 % of the curtain is at the
> theoretical floor for 280 rows, versus 1130 µm (106× the bound) on the chain path. Against the A-run at the same
> style and tolerance the tail improves ~400× at p99 (319.1 → 2.110 µm) and ~46× at MAX.
>
> ## 6. Placement A/B at the SAME grid (208×140) — chain vs traced contour
>
> | | chain (A-run, 120 k) | TRACE + parking (450 k) | |
> |---|---|---|---|
> | p99 | 319.146 µm | **8.871 µm** | 36× |
> | p999 | 837.396 µm | **12.025 µm** | 70× |
> | MAX | 1130.516 µm | **23.628 µm** | 48× |
> | over-0.01 mm | 1035/23 520 (4.4 %) | 142/27 069 (0.52 %) | 8.5× |
>
> Predicted sagitta bound at 140 rows is 10.678 µm; measured p999 is 12.025 µm (1.13×). The three worst probes sit on
> edges whose OWN jump is only 58.187/32.994, 28.607/58.190 and 28.462/52.254 µm — i.e. the residual tail is
> concentrated where the cliff is already fading toward a merge, not on the 600 µm body of a strand. The worst
> full-600 µm probe is 14.209 µm.
>
> ## 7. Not closed — one defect remains, and it is NOT the curtain
>
> Both TRACE runs still carry a **~1.08 rad θ offset between two ADJACENT rows at the same column index**
> (`HAUS-locus edges 181.3 / 50052.1 / 50207.7 µm`, `θ = [1.2956, 1.2993, 2.3756]`, `z = [112.92, 112.92, 113.33]`,
> `feat=[000]`), sitting in the background gap between two strand clusters. It is a per-row COLUMN LAYOUT defect: the
> position of a dormant column depends on which slots are live at that row, so when the live-anchor set changes across
> a row the interpolation fallback can translate the column by a full background gap. Parking dormant slots on their
> own branch (§3) removes most of it but not this case — the run still falls back to the lerp there. Consequences:
> * the plane-ruler headline (836.975 µm) and the Hausdorff re-measure (6624.482 µm ≈ `r·(1−cos)` for a 1.08 rad
>   chord, i.e. exactly this quad) are BOTH dominated by it, not by the curtain;
> * the plane ruler is *blind* to it (a thin skewed quad has a plane that passes near the surface) — the Hausdorff
>   instrument is what surfaced it;
> * both runs are also CAPPED (`worst-left 598.06 µm`), so neither headline is a converged number.
>
> **Verdict: the h⁰ curtain mechanism for a CURVED, snaking locus is built and measured** — connectivity tracing,
> merge-exact rows, per-branch slots, topological slot order, dormant-slot demotion — and it drives placement to the
> chord-sagitta floor with 0 non-manifold, 0 seam-crack, a passing coverage invariant and 463× weld margin.
>
> ## 7b. CERTIFICATION RUN — all fixes in, 208×280, 900 k cap, registry defaults, ring
>
> ```
> 252 curves → 252 branches → 252 slots · 108 merge-corner rows · θ-order violations 0 · cycle-breaks 0
> COVERAGE 0/2737 loci without a live slot  PASS   ·  branch separation 23.150 µm vs weld 0.050 = 463×
> non-manifold 0  OK   ·   seam-crack 0  OK   ·   boundary 576 (ring = top+bottom), 2 loops
> PLACEMENT   p50 0.000  p90 0.010  p99 2.106  p999 2.853 µm   MAX 24.181   over-0.01 mm 42/58 563 (0.072 %)
> PLANE  MAX 599.192 µm  spread 1.0× consistent   p50 0.558   MAXtri@oracle8 0.886 µm
> HAUSDORFF MAX 2125.821 µm            [CAPPED — heap 89 225 left, worst-left 597.971 µm; see §9]
> ```
>
> Against the same configuration before §8's fixes: plane MAX 700.493 → **599.192**, Hausdorff 6701.983 → **2125.821
> (3.2×)**, live columns moved by the separation pass 32 → 22, placement unchanged at 24.181 (no regression).
> `p999 = 2.853 µm` against a predicted sagitta floor of 2.670 µm — 99.9 % of the curtain is at the theoretical floor.
>
> **Where the two rulers now point is itself the finding.** The plane MAX-locus is `edges = 0.4 / 705.4 / 705.1 µm` —
> a 0.4 µm NEEDLE whose plane normal is garbage — while the Hausdorff MAX-locus is a 30 mm skewed quad from the shear
> of §8. Neither is the curtain. The two instruments are blind in opposite directions and both are needed.
>
> ## 8. The column-layout defect is ALLOCATION-entangled — two fixes tried, both refuted by measurement
>
> New instrument first: an **inter-row column shear** guard now reports the largest θ translation of any column
> between adjacent rows (`PF_CB_TR_MAXSHEAR`, default 1 mm). Baseline at 64×40: **worst 48 824 µm, 1196 rows over
> 1 mm** — the defect made into a number instead of an anecdote.
>
> **Attempt A — constrain the FULL per-row order** (live slots at their locus θ, dormant slots at their parked θ), so
> a dormant slot can never sit on the wrong side of a later birth. **REFUTED.** A dormant branch's parked θ is fixed
> while the live loci move, so the induced total order flips between rows and the constraint graph becomes cyclic:
>
> | | before | attempt A |
> |---|---|---|
> | cycle-breaks | 0 | **93** |
> | demoted live row-slots | 101/2452 | **311/2452** |
> | tracer coverage | 0/2612 PASS | **158/2612 FAIL** |
> | non-manifold / seam-crack | 0 / 0 | **264 / 1255** |
> | worst shear | 48 824 µm | **26 139 µm, still 1311 rows over** |
>
> **Attempt B — per-slot monotone clamp into the live bracket** instead of the all-or-nothing park→lerp fallback.
> **REFUTED as written**: when a bracket is narrower than MINSEP × (dormant slots it must hold), the clamp overshoots
> its upper anchor, the column array stops being strictly increasing and vertices weld — 264 non-manifold / 1255
> seam-crack from 0/0.
>
> **Attempt C — per-slot park under a provable LERP CEILING: `v_k = max(prev+MINSEP, min(park_k, lerp_k))`. KEPT.**
> Monotone by construction and `v_k ≤ lerp_k` always (because `prev ≤ lerp_{k−1}` and `lerp_k − lerp_{k−1} = span/n ≥
> MINSEP`), so the array is bounded by exactly the sequence the old code emitted — strictly no worse, while every slot
> that *can* sit on its own branch does. Measured at 64×40: watertight **0/0**, coverage **0/2612 PASS**,
> **Hausdorff 5997.252 → 1942.268 µm (3.1×)**, worst skewed edge 48 862 → 12 172 µm. Shear only 48 824 → 42 573 µm.
>
> **Conclusion (asked for explicitly, so stated plainly): item 1 is NOT a parking bug.** The band allocates one
> permanent column slot per branch, so a slot's *index* is fixed for the whole band while its natural θ *position* is
> not — and no per-row layout rule can remove that degree of freedom. The fix is **slot REUSE**: allocate ≈ the max
> simultaneous live count per band and let one slot host different branches at different z, inserting a newborn into a
> free label positioned between its θ-neighbours (an ordered-label sweep, growing the label list only when no free
> label sits in the right position). That is a genuine re-architecture of the allocator, and two speculative fixes
> already regressed watertightness today, so it is left as designed-not-built rather than forced.
>
> ## 8b. BRANCH-AWARE SAMPLE ATTRIBUTION (`PF_CB_BRSKIP=1`, default OFF) — validated on BasketWeave
>
> A strip sample reads 600 µm because it is **attributed to the wrong triangle**: it lies on the other branch, so it
> belongs to the adjacent sheet a few µm away across the curtain. That is a measurement error, and because its value
> floors at the jump height it is also what pins `worst-left ≈ 598 µm` and stops the heap draining at ANY `triCap`.
> The rule: when sampling a triangle, skip samples whose side of the TRUE locus differs from the triangle's own side.
>
> **The guard is structural, not statistical.** A sample is skipped ONLY if it is within `PF_CB_BRSKIP_BAND`
> (default 50 µm of arc, ≳2× the measured placement MAX) of the true locus — the wrong-side strip is exactly that
> narrow, because its width IS the placement error. A triangle straddling an UNMESHED locus has wrong-branch samples
> spread over its whole width, outside the band, not skipped, still reading the full jump. Skipped-sample counts are
> reported. Cost is controlled by a two-pass: measure normally, re-measure only triangles reading worse than
> `5 × acceptTol`.
>
> Keying the rule on "the triangle has a locus VERTEX" was considered and **rejected**: after refinement the strip
> triangles are `feat=[000]` (all three vertices are interior split points), so a vertex-tag rule would miss exactly
> the triangles that dominate the tail. The test must be geometric; the band is what makes it safe.
>
> **BasketWeave A/B (straight h⁰ locus, `PF_CB_CURTAIN=1`, 208×140, 2.5 M cap), the rule's sanity check:**
>
> | | BRSKIP OFF | BRSKIP ON |
> |---|---|---|
> | tris / alloc | 466 776 / 855 024 | identical |
> | HEADLINE MAX | 7.429 µm | **7.429 µm** |
> | adaptive / fixed-12 / tail-44 | 7.429 / 7.030 / 7.412 | identical |
> | p99 / p50 / over-0.01 mm | 6.590 / 3.224 / 0 | identical |
> | non-manifold / seam-crack | 0 / 0 | 0 / 0 |
> | heap | 0 left, worst-left 0.000 | identical |
>
> **The number does not move.** 4.87 % of samples in re-measured triangles were skipped — not "near zero" — but the
> A/B proves none of them was ever the argmax, which is what matters: on a STRAIGHT locus the strip has zero width,
> so wrong-branch samples inside the band are ties AT the locus, where both sheets are present anyway. Only runtime
> (111 → 321 s) and one heap tie-break (key-inversions 39778 → 39779) differ.
>
> ## 8c. The attribution rule works — and it PROVES items 1 and 2 are coupled
>
> CelticKnot, `PF_CB_TRACE=1 PF_CB_BRSKIP=1`, 208×140, 450 k cap:
>
> ```
> re-measured 174 588 tris · 1 509 098 / 29 986 922 samples skipped (5.03 %) · 29 054 tris had no locus nearby
> PLACEMENT MAX 14.209 µm (p99 8.531, p999 11.477)   [was 23.628 / 8.871 / 12.025 at the same grid]
> non-manifold 0 · seam-crack 0 · coverage 0/2725 PASS
> heap 57 155 left, worst-left 598.001 µm            ← STILL PINNED AT THE JUMP HEIGHT
> ```
>
> **The heap did not drain, and that is informative rather than disappointing.** The rule only forgives samples
> within 50 µm of the true locus. If the residual 598 µm survived it, the wrong-side region on those triangles is
> WIDER than the strip — which is exactly the signature of the §8 shear: a skewed quad spanning ~1 rad crosses loci
> in its interior, so it straddles unmeshed geometry over a wide θ range. That is a real mesh defect, not a
> mis-attribution, and the band guard correctly refuses to forgive it.
>
> **Conclusion: attribution cannot unblock convergence until the allocator removes the shear.** The rule is correct,
> validated, and now in place; it is gated behind the allocator, not the other way round. Placement did improve
> (MAX 23.628 → 14.209 µm) because the driver now spends budget sensibly around the curtain instead of chasing a
> floored reading.
>
> ## 9. "Converged, not capped" is unreachable with the plane ruler as the refinement driver
>
> Every run of this style ends `worst-left ≈ 598 µm` — the jump height. That is not under-budgeting: the refinement
> priority is the plane-distance sag, which on a curved cliff has an **irreducible floor equal to the jump** inside
> the wrong-side strip (§4). The heap therefore refills with strip triangles no matter how large `PF_CB_TRICAP` is.
> Reaching a drained heap on a curved h⁰ locus requires the refinement DRIVER to use the distance-to-mesh measure,
> not just the final audit. Recording this so the CAPPED label on these rows is read as structural, not as budget.
>
> **Guarantees to keep attached wherever the Hausdorff number is quoted:** (1) an unmeshed cliff still reads the full
> jump, because the far-branch surface points have no mesh near them; (2) distance-to-mesh ≤ distance-to-covering-
> triangle, so the 19 already-closed rows can only improve — their PASS status is unaffected by adopting it.
>
> ## 10. HANDOVER — the slot-reuse allocator (designed, not built)
>
> This is the one remaining blocker and it is a self-contained ~80-line change inside the `TRACE` branch of
> `_strataChainCurtain.test.ts`, between "cut curves into monotone branches" and "build the per-row slot table".
>
> **Why the current allocator forces the shear.** Today `M = brs.length` — one permanent column slot per branch for
> the whole band. A slot's INDEX is therefore fixed while its natural θ POSITION moves, and ~18 of ~23 slots per band
> are dormant at any row. No per-row layout rule can remove that degree of freedom; three were tried and measured
> (§8), and the two that touched slot ordering regressed watertightness.
>
> **The design.** Allocate ≈ the max simultaneous live count and let one slot host different branches at different z:
> 1. Sweep rows bottom→top over `rowLive` (already computed).
> 2. Maintain an ORDERED LIST OF LABELS (not indices). Each label is free or holds a branch. The list order is the
>    column order and, once a label is placed, it never moves.
> 3. At each row: release labels whose branch just died (they stay in the list, marked free); keep labels whose
>    branch is still alive.
> 4. For each newborn branch, find its θ-neighbours among the currently-live labels and take a FREE label positioned
>    strictly between them. Only if no free label sits in that interval, INSERT a new label there (list grows).
> 5. After the sweep, `S = labels.length` and `slotOf(branch)` is its label's index. Order-consistency is then true
>    by construction — no topological sort, no cycle-breaking, no demotion — because a label is only ever placed in
>    a position that was already correct at the row that placed it.
>
> **Expected effect.** Dormant slots per row fall from ~18 to ~(S − live), so the dormant runs the layout must
> distribute are short and local, and a birth can no longer translate a dormant column across a background gap.
>
> **Gates to run it against (all already implemented, all currently green — revert on any regression):**
> `TRACER COVERAGE` 0 misses · `non-manifold`/`seam-crack` 0/0 · `θ-order violations` 0 · `cycle-breaks` 0 ·
> `MINSEP moved 0 LIVE columns` · and the new `inter-row COLUMN SHEAR` guard, which is the direct success metric:
> **worst 42 573 µm today, and it must fall to the column pitch (~1.4 mm) or below.**
> Then re-run with `PF_CB_BRSKIP=1` — §8c predicts `worst-left` finally drops below 598 µm and the heap can drain,
> which is the precondition for ever reporting "converged".

> # UPDATE 6 — CelticKnot: termination fix CONFIRMED by a pre-registered A/B (7.9× on MAX), still not closed
>
> The prediction was registered **before** the numbers existed: *"placement error should drop hard on the ~2.7 % coalescence rows and leave the other 97.3 % flat — p999/MAX fall substantially while p50/p90 stay put."* Identical config, chain path, 120k cap:
>
> | placement error | before | after | |
> |---|---|---|---|
> | p50 | 0.005 µm | 0.004 µm | **flat** ✓ |
> | p90 | 8.571 µm | 7.573 µm | **flat** ✓ |
> | p99 | 3204.923 µm | **320.755 µm** | **10.0×** ✓ |
> | p999 | 7603.617 µm | **837.396 µm** | **9.1×** ✓ |
> | MAX | 8958.470 µm | **1130.516 µm** | **7.9×** ✓ |
> | over-0.01 mm | 1888/24078 | **1035/23310** | −45 % |
>
> `terminal-snap to true death point` fired **126** times; hold rate 9.9 % → 5.1 % (RECOVERED 396 → 488). The **chord audit stayed flat** (2546.788 → 2481.579 µm), independently confirming it measures nothing on curved loci — the reason it was replaced.
>
> **Mechanism validated: chording across a curving locus into the pinch was the dominant error**, and following the locus to its true death point removes ~90 % of it. Same "conform to the curve, don't chord it" principle that closed the h¹ tier.
>
> **Still open.** Placement MAX 1130 µm on the remaining 4.4 % of probes (coalescence rows), and the run is CAPPED at 120k (heap 59,832 left, worst-left 598.647 µm) so fidelity is unchanged at **HEADLINE 604.173 µm — UNKNOWN, not a failure**. Watertight throughout (0 non-manifold, 0 seam-crack, 2 loops). Two things stand between here and closure: finish the coalescence placement tail, then one full-budget run.

> # ★★ UPDATE 5 — **19/20. GyroidManifold CLOSED — and the fix was a COARSER-IS-WORSE inversion.**
>
> ```
> grid 500×350 (350,000 init tris) → 1,132,314 tris   alloc 1,914,628/16,000,000 (12% of budget)
> heap 0 left · no-op splits 0 · welded-splits 0 · collapsed 0 · 674s
> non-manifold 0 · seam-crack 0
> HEADLINE MAX 7.416 µm PASS = max(adaptive 7.000, fixed-12 7.194, tail-44 7.416)  spread 1.1×
> over-0.01mm 0/1,132,314 · p99 6.704 · p50 0.978 · LOCUS AUDIT 0.983 µm PASS
> ```
>
> **The lesson: for fine, near-uniform features a FINE STRUCTURED START beats deep adaptive cascade.** Same style, same tolerance, three attempts:
>
> | init grid | tris | time | result |
> |---|---|---|---|
> | 200×140, 7M cap | 3,523,152 | 115 min | 11.763 µm FAIL, CAPPED |
> | 200×140, 16M cap | 7,656,000 | 204 min | crashed in cleanup |
> | **500×350** | **1,132,314** | **11 min** | **7.416 µm PASS, converged** |
>
> **6.8× fewer triangles, 18× faster, and it closes.** Critically, every pathology we had been fixing *individually* went to zero at once: `welded-splits 1,406,558 → 0`, `no-op splits (stranding) → 0`, `collapsed → 0`. Those were **symptoms of over-deep adaptive refinement from too coarse a start** — LEPP was driving into the nanometre regime where split points collide with the weld radius — not independent defects. The weld-radius and nudge-ladder work was treating symptoms; it made things better but could never have closed it.
>
> Note this is the *opposite* prescription from the ridge styles (Gothic et al.), where adaptivity is exactly what wins. The discriminator is feature **uniformity**: near-uniform fine detail ⇒ resolve it uniformly; localized sharp features ⇒ refine adaptively.
>
> Three container ceilings were cleared en route (all real, all committed, none geometry-changing): the edge-index **leak** (empty keys never deleted ⇒ index grew with cumulative allocation), Node's **2^23 Map cap** (⇒ ~5.6M live-triangle ceiling; fixed by 32-way sharding — verified reaching 7.66M live), and the **2^23 Set cap** in the sliver pass (fixed by bounded dedup: length-test first, dedup only short edges). Regression-verified behaviour-neutral: LowPolyFacet reproduces exactly (137,480 tris, 5.000 µm, 0 over-tol).
>
> **STANDING: 19 closed / 1 open — CelticKnot only.**

> # ★ UPDATE 4 — **18/20. The θ-CURTAIN closes BasketWeave — the first h⁰ jump closed in this campaign.**
>
> `research/bridge/_strataCurtainClose.test.ts` (+ `_strataThetaLocusProbe.test.ts`), commit `e35dff8d`. BasketWeave ring, registry defaults, `gu=208`, DIRECTED + θ-curtain:
>
> ```
> HEADLINE MAX 5.035 µm PASS = max(adaptive 4.999, fixed-12 4.999, tail-44 5.035)
> ruler spread 1.0× CONSISTENT   (was 381.3× — the 2 mm defect is GONE, not hidden)
> over-0.01mm 0/586,136 · 0 non-manifold · 0 seam-crack · CONVERGED (1.11M/5M)
> LOCUS AUDIT (closure invariant) 5.102 µm PASS
> 594,888 tris in 260 s — SMALLER and FASTER than the failing run (844,520 tris / 489 s)
> STL byte-verified: 29,744,484 = 84 + 594,888×50
> ```
>
> **Generic, not hard-coded** — the two-scale detector found all 16 loci itself (0.82 M evals) at `θ* = k·2π/16` exactly ⇒ grid columns `0,13,26,39,52,…` = 13k at `gu=208` (independently re-derived).
>
> **The h⁰ theorem made actionable.** Alignment alone still failed at 1906 µm *with the column landing at exactly index 182.000000*, because a jump is two-valued at its locus and one vertex can hold one branch. The curtain duplicates the locus column into r⁻/r⁺ vertex rows, binds each side's cells to its own copy, and stitches a vertical quad strip — **the z-tread mechanism rotated 90°**.
>
> All three predicted harness hazards handled **and measured**: 8,288 branch-tagged verts (explicit-radius creation); **3,520 branch-inherited splits** (pinning — so `splitEdge` cannot silently recompute r and collapse a curtain edge onto one branch); weld-fusion guard **branch separation MIN 1.180 µm vs weld 0.050 µm = 23.6×**, asserted; curtain/tread T-corners → 32 pinch verts + 2,368 doubled row-slots with clean topology; curtain-chord audit (8,000 branch edges @ n=64) MAX 4.767 µm PASS.
>
> **Notable:** conforming to a jump is *cheaper* than fighting it — refinement had been burning budget hammering a discontinuity it could never resolve.
>
> **Gyroid interim (env-only experiment, no code change):** the weld-radius diagnosis is **confirmed** — 50 nm → 5 nm cut weld collisions **926,638 → 1,548 (600×)** and the run CONVERGES again instead of capping. But that run also set `PF_CB_NUDGE=0.5`, which is *midpoint-only* and stripped the original 0.42/0.58 fallback, so stranding rose 8 → 48 and MAX landed at 75.1 µm (spread 1.0×, so real). The two levers are independent and were conflated; the correct combination `PF_CB_NUDGE='0.5,0.42,0.58'` + `PF_CB_WELD_UM=0.005` is still to be run (first attempt died to a concurrent-run OOM — **run heavy mesher jobs one at a time**).
>
> **STANDING: 18 closed / 2 open** — CelticKnot (h⁰ *snaking sinusoid*, needs the traced-polyline curtain + Y-junctions; BasketWeave's straight-line curtain is its degenerate case) and GyroidManifold (weld radius, one parameter run away).

> **UPDATE 3 — BasketWeave's jump is REAL; the "ruler bug" was a rounding artifact.** Forensic dump (full-precision) at the disputed triangle: argmax at the exact midpoint of edge B–C, θ and z **provably inside** the footprint, `|n| = 0.0400` (healthy, area 20,013 µm²), and `r = 45.5446` where all three vertices sit at `r ≈ 47.5346` — a genuine **1.9900 mm** drop, exactly reproducing the reported `dd = 1.98757 mm = 1987.566 µm`. Verifiable by arithmetic alone.
>
> The earlier refutation failed because it reconstructed from the **printed, rounded** vertices: rounding θ by 8.3e-6 rad — **0.39 µm of arc** — stepped off the discontinuity and gave r-spread 13.78 µm / sag 0.956 µm. With full precision: r-spread **2004.62 µm**, dense sag **1990.181 µm**. **Rule: never re-measure a discontinuity from rounded coordinates** — a sub-micron parameter change flipping the answer 2000× *is* the h⁰ signature.
>
> Consequences: **(a)** BasketWeave is **NOT closed** — it is a second h⁰ curtain case (its jump is invisible to the z-step detector, whose `probes = [0.21, 1.03, 2.44, 3.77, 5.29]` sees only full θ-rings). **(b)** The `max(adaptive, fixed-N, tail-N)` headline is **correct as originally stated** — the larger reading *was* the true one; the "spread might be a bogus high" amendment is **withdrawn**. It now correctly flags BasketWeave at HEADLINE 1987.566 µm FAIL, spread 397.5×. **(c)** `_strataJumpProbe` **window mode is BROKEN** — it reported zero jump cells in a ±0.6 mm window containing a 2 mm jump; its verdicts (incl. CelticKnot's ratio 1.027) cannot be leaned on until debugged. Triangle mode is sound *with full-precision input*. **(d)** Gyroid **REGRESSED** on the nudge ladder (24.8 → 239.0 µm, all rulers agreeing): 926,638 welded splits burned the budget into the cap. Re-diagnosis — ~75 % of split points land inside the 50 nm weld radius, so **the weld radius is too coarse for Gyroid's sheet spacing**; fix the radius, revert the ladder.
>
> **Standing: 17 closed · 3 open** (CelticKnot h⁰ 584 µm · BasketWeave h⁰ 1988 µm · Gyroid weld-radius 239 µm).

> **UPDATE (later same day, after follow-up runs):** **17 confirmed closed.** CelticTriquetra is **promoted to closed** — its earlier CAPPED row was simply under-budget; at the full 5 M cap it converges (heap drained, adaptive 5.079 / fixed-12 5.535 / tail-44 5.771 µm, 0/1,709,365 over tol, 0 non-manifold, 0 seam-crack). Its `jump-class 6582` was the coarse classifier over-firing — a feature a drained heap converges on cannot be h⁰.
>
> **BasketWeave is UNRESOLVED (neither closed nor failed).** My snaking-C0 hypothesis was **refuted**: a 300×300 window probe at the locus gives two-scale ratio **0.125 = textbook smooth**, with zero jump-class and zero crease-class cells in a ±0.6 mm window; and a 700×700 reconstruction of the reported triangle shows `r` varies only **13.78 µm** across the footprint, so no reading above ~15 µm is physical there (true sag **0.956 µm**, and n=12 vs n=13 agree). But the argmax tracking is correct (`maxFixed`/`maxFixedT` update together), so the printed triangle *is* the one that scored 1987.566 µm — meaning `sagOfN` returned a value inconsistent with its own inputs. **An unexplained ruler defect, not a mesh defect** — and one that can read high must be assumed able to read low, so it is being root-caused before any row is re-blessed.
>
> **CelticKnot is a PROVEN h⁰ case.** MAX **584.092 µm on all three rulers** on a triangle with **0.9/0.3/1.2 µm edges** — sag invariant at the refinement floor is the jump signature *by construction*, not by inference. Localized: 5 triangles in 2.53 M, p99 5.100 µm. It is now the **only** curtain target (BasketWeave and Triquetra both eliminated).
>
> Ruler policy amended: headline = `max(adaptive, fixed-N, tail-N)`, with a large spread treated as an **investigation trigger** (not auto-accepted as truth — BasketWeave shows the high reading can be the bogus one). Re-checking the other 15 rows under this rule moved **none** of them.
>
> New instrument: `research/bridge/_strataJumpProbe.test.ts` (`PF_STRATA_JUMP=1`) — window mode classifies a locus jump/crease/smooth; `PF_JUMP_TRI` mode reconstructs a reported triangle and re-measures it densely against the r-spread bound. Settles a ruler disagreement in ~1 s.

## Verdict (original sweep): 16 / 20 VERIFIED closed · 1 suspect · 2 need a curtain · 1 unmeasured

"Verified" = MAX ≤ 5.1 µm, **0** triangles over 0.01 mm, 0 non-manifold, 0 seam-crack, converged (not capped), **and all independent rulers agree**.

| style | MAX µm | oracle12 | tail44 | locus | over-tol | nonMan | tris | state |
|---|---|---|---|---|---|---|---|---|
| GothicArches **(SOLID)** | **5.000** | 5.810 | 5.749 | 6.153 | 0/2,001,816 | 0 | 2.03 M | ✅ closed solid (boundary 0) |
| LowPolyFacet | 5.000 | 5.000 | 4.943 | 5.000 | 0/137,480 | 0 | 137 k | ✅ |
| SuperellipseMorph | 4.999 | 5.000 | 5.000 | 4.516 | 0/155,824 | 0 | 156 k | ✅ |
| SuperformulaBlossom | 4.997 | 4.997 | 4.997 | (0 loci) | 0/160,600 | 0 | 161 k | ✅ |
| WaveInterference | 5.000 | 5.013 | 5.013 | 4.988 | 0/168,288 | 0 | 168 k | ✅ |
| RippleInterference | 5.000 | 5.001 | 5.002 | 4.903 | 0/170,496 | 0 | 170 k | ✅ |
| ArtDeco | 5.000 | 5.222 | 5.298 | 5.397 | 0/235,436 | 0 | 242 k | ✅ **8 z-steps** |
| BambooSegments | 5.000 | 5.009 | 5.009 | 4.910 | 0/322,182 | 0 | 325 k | ✅ **4 z-steps** |
| FourierBloom | 5.000 | 5.026 | 5.026 | 4.993 | 0/533,521 | 0 | 534 k | ✅ |
| DragonScales | 5.000 | 5.075 | 5.071 | 5.099 | 0/656,082 | 0 | 668 k | ✅ **7 z-steps** |
| SpiralRidges | 5.000 | 5.021 | 5.021 | 4.988 | 0/763,322 | 0 | 763 k | ✅ |
| HexagonalHive | 4.999 | 4.999 | 5.030 | 3.284 | 0/880,000 | 0 | 880 k | ✅ |
| GeometricStar | 4.999 | 5.012 | 5.249 | 5.120 | 0/885,400 | 0 | 885 k | ✅ |
| HarmonicRipple | 5.026 | 5.026 | 5.026 | 4.975 | 0/955,603 | 0 | 956 k | ✅ |
| Voronoi (universal grid) | 5.000 | 5.504 | 5.505 | 5.786 | 0/806,765 | 0 | 807 k | ✅ |
| Crystalline | 5.000 | 5.285 | 5.455 | 5.614 | 0/1,163,100 | 0 | 1.16 M | ✅ |
| **BasketWeave** | 5.000 | **1987.566** ⚠ | 5.632 | 5.551 | 0/1,576,890 | 0 | 1.59 M | ⚠ **SUSPECT — see below** |
| GyroidManifold | **24.824** | 24.225 | 24.751 | 4.914 | 5/1,680,002 | 0 | 1.68 M | ❌ 8 stranded tris |
| CelticTriquetra | 8.633 | 11.368 | 11.650 | **11.927 FAIL** | 0/827,863 | 0 | 831 k | ❌ **CAPPED = UNKNOWN**, h⁰ gap |
| CelticKnot | — | — | — | — | — | — | — | ⬜ **not measured** (>50 min) |

## ⚠ BasketWeave is NOT a verified pass

Its two **independent full-mesh** rulers disagree by **~400×**: adaptive 5.000 µm vs fixed-oracle-12 **1987.566 µm** (at z=66.75, θ=3.538, on a 215/214/372 µm triangle). Every other style agrees within ~10 %.

**Sampling can only UNDER-estimate a max deviation** — each sample is a real analytic-surface point measured against the triangle's plane — so a ruler reporting 1987 µm has *found* a real ~2 mm deviation that the other rulers miss. Degeneracy does not explain it: BasketWeave's min edge (0.200 µm) is *larger* than Voronoi (0.077), Gyroid (0.101), Triquetra (0.108) and GeoStar (0.136), all of which are ruler-consistent. Its adaptive MAX-locus is however a 424:1 needle (1910.6 / 4.5 / 1910.6 µm), so an unstable plane normal is the other candidate.

Independently, this row's log was overwritten by a duplicate worker mid-sweep, so it is *recorded-not-re-verified*. **It needs a re-run before being counted.**

### Methodological trap this exposed
**The tail-44 re-measure and the locus audit are NOT independent checks.** Tail-44 re-measures "the worst 3000 *as ranked by the adaptive ruler*" — it inherits that ruler's blind spots by construction. The locus audit only samples along detected loci. **The only genuinely independent full-mesh check is the second full-pass ruler (oracle-12)** — which is exactly the one that flagged BasketWeave. Always compare full-pass rulers, and treat any large spread as unconverged-or-blind, never as noise.

## The layered/C0 tier is CLOSED (first real test of the treads)

ArtDeco (8 z-steps → 6,284 tread tris), DragonScales (7 → 11,755), BambooSegments (4 → 2,619), BasketWeave (9 → 8,664) all auto-detect their C0 z-steps, mesh the bands disconnected, stitch double-valued tread annuli, and land **0 seam-crack**. The tread machinery ported from `_strataVoronoiSolid` was a no-op on Gothic; this is its first genuine exercise and it works.

## Distance to 20/20 — three items, increasing size

1. **GyroidManifold — 8 stranded triangles (small, mechanical).** `no-op splits 8`, `welded-splits 67,720` (densest of any style). Eight triangles exhausted every split candidate — all three edges at t = 0.5, 0.42, 0.58 each welded onto a pre-existing vertex — so they are permanently unrefinable and carry all 5 over-tolerance readings. Not a feature-class gap: the closure invariant **passes at 4.914 µm**, p99 is 4.854, and the MAX triangle is large (771/1200/1964 µm), not a sliver. Fix: widen the nudge set / perturb locally when the weld hash saturates.
2. **BasketWeave — re-run and resolve the 400× ruler split.**
3. **The snaking pair (CelticTriquetra, CelticKnot) — the one genuinely new mechanism left.** Triquetra is the first non-trivial firing of the jump classifier (`jump-class 6582`). Its 3 z-aligned jumps were handled by the treads (3,293 tread tris); the rest are not. The locus audit **failing at 11.927 µm across 123,280 locus-crossed triangles** is error sitting *on* the loci that refinement cannot remove — the h⁰ signature.

### What the curtain must do (and why treads can't)
A tread annulus stitches **loop-to-loop by angle merge** — it expresses exactly one jump shape: *a complete θ-ring at constant z*. That is why the four layered styles closed. Celtic's loci are **open, snaking, and mutually crossing**, requiring:
1. **trace the jump locus as an ordered polyline** — the one place "chaining" is genuinely required (for creases it was not, because a split point is a local edge property; a jump must split the **domain**, and you cannot split a domain with unordered crossings);
2. duplicate the chain into two vertex sets carrying `r⁻` and `r⁺`;
3. mesh each side as a separate sheet terminating on its own chain;
4. stitch a vertical quad strip between them (the double-valued wall);
5. **junctions** — at a strand crossing, 3+ sheets meet along a curve, so the curtain becomes a Y-pinch, not a simple strip.

Steps 1 and 5 are new machinery. CelticKnot's jumps read from source (`rOuterCelticKnot`, `src/geometry/styles.ts:2011-2124`): a **strand silhouette** (`minD > strandW ⇒ r0 − relief·0.3`, a jump of exactly 0.3·relief along the snaking sinusoid `|localU − amp·sin(v·frq + phase)| = strandW`) and an **occlusion seam** (the Z-buffer argmax switches `finalDist`/`depthFactor` discontinuously where two strands' heights cross).

## Caveats

- **Ring stage only** for all rows except GothicArches (solid). No solids measured for the other 19.
- CelticTriquetra ran at a deliberately reduced 1.6 M cap with 314,364 still in the heap ⇒ its MAX is **unknown**; only the locus-audit FAIL is a verdict.
- CelticKnot has **no measurement** — everything about it here is read from source.
- `jump-class` only populates with `PF_CB_SNAP=1`; the sweep ran SNAP off, so that column is 0 except Triquetra, run with SNAP on to obtain the classification.

# STRATA-001 RE-AUDIT — the "19/20 closed" scorecard, re-measured by an independent two-sided ruler

**Status: H2 sweep COMPLETE, all 19 rows, plus an exceedance census locating every failure.**
12 within tolerance, 7 over the 0.01 mm bar — of which **6 are genuine interior defects and 1
(BasketWeave) is confined to the ring's open rim row**. H1 certificates: 2 done, 17 pending a second pass.
Every refuted number is a *floor* (refinement truncated), so those rows can only get worse.

> ### READ THIS BEFORE §0 — what later sections overturned (2026-07-28)
>
> This document was written in layers and **four of its conclusions have since been corrected by
> measurement**. §0 below is the ORIGINAL answer and is still right about the scorecard; the items here are
> the ones a reader would otherwise carry away wrong.
>
> | claim | where | status |
> |---|---|---|
> | §0's "the most actionable finding is §7 — the mesh is coarse, not floored, so a bounded accept test may close it" | §0, §7 | **REFUTED** (§14a, §14f). The bounded test was run twice, the second time with the lever implemented exactly as §6 specified. It does not close GeometricStar: H2 went **12.675 → 175.475 µm** and the run CAPPED. |
> | §13's "therefore the sharp-locus rows are MECHANISM-limited" | §13 | **NOT SUPPORTED** (§14c). The chord error of every refuted style falls 1.45–3.2× per halving with **no plateau**; at 20 µm cells only 0.002–0.53 % of the wall is still over the bar. The surface is density-closable; this driver is not. |
> | §12's "survivor rates are mostly jump deferrals; a closure would cut them sharply" | §12 | **REFUTED** (§15c). GeoStar and Gyroid have `z-steps 0` and **zero** tread facets. The closure was built anyway (it is correct, −15.6 % on BasketWeave) but the cause was RADIAL over-statement — fixed by Gauss-Newton, §15d/§15e, **3.0× fewer survivors across all 19 rows**. |
> | §10's structure map, reporting 0.000 µm bulge for all 20 styles | §10 | **That was a dropped GPU dispatch, not a reading** (§15a). Fixed, validated against an independent CPU recomputation, and swept: §15b. |
>
> Two corrections are to claims made in §14 itself and are marked in place: §14b's causal chain, and a
> `worstLeft ~ alloc^-0.58` scaling law that the later checkpoints refute (§14f).
>
> **The current one-line position:** the surface is density-closable at ~2 M targeted triangles; the driver
> spends 9 M and plateaus at ~350 µm with its heap still growing. That ~100× gap is **allocation
> efficiency**, and it — not a missing mechanism — is what the next attempt has to attack.

## 0. THE ANSWER, for anyone who reads only this

**The "19/20 closed" scorecard cannot be read as 0.01 mm true-3D fidelity.** Re-measured by an independent
auditor against the true surface, on the exact meshes those verdicts were based on:

> **19 claimed closed → 12 survive H2 → 5 survive both directions.**
>
> Clean in both: **LowPolyFacet · SuperellipseMorph · SuperformulaBlossom · RippleInterference · FourierBloom**

The old ruler was not lying about its own quantity — plane-distance on its lattice really is ~5 µm on these
meshes. It was measuring something that is **not the product bar**, with no error bound, at a pitch capped
3× coarser than the bar, using the same sampler that drives refinement. So a facet spanning a feature it
cannot see was never refined *and* never flagged.

**Proven deterministically, not argued:** on a mesh missing 400 µm of relief, the old ruler reads
**5.552 µm "clean"** while the new one reads **391.661 µm** (V5). The crest is placed provably between the
old ruler's computable sample positions; nothing about it is luck.

**Three things a reader should not over-read:**

1. **BasketWeave's 93.662 µm — the largest number here — is RIM ONLY.** All 22 160 exceedances lie in
   z ∈ [115,120] of a *ring* mesh whose top edge is an open boundary the solid stage caps differently.
   Do not quote it as "BasketWeave is 93 µm wrong". **GothicArches is the worst genuine row** (2 372
   exceedances spread wall-wide, peaking at the arch rib).
2. **Passes are provisional; refutations are sound.** Every exceedance is an exact point-to-triangle
   distance, brute-force confirmed. But H2 is a witnessed lower bound with ~11.5 µm resolving power, and
   H1's certificate is loose. A row that "holds" holds *as far as this instrument can see*.
3. **The instrument had eight defects of its own**, four capable of a false PASS (§5b, §9). All were caught
   by measurements disagreeing with each other — **none by reading the code**. The validation suite
   (`PF_STRATA_FTV=1`, 9/9) is synthetic-only: cylinders, ridges, steps. No case is built from a real
   style's `rA`.

**The most actionable finding is §7**: at every refuted row's worst locus the mesh is **coarse, not
floored** (74-1383 µm triangles against a 1.5 µm floor) and the mesher **stopped with budget unspent and a
drained heap**. It was not out of mechanism. It stopped because its ruler told it there was nothing left to
do. Whether that is fixable by a bounded accept test is pre-registered there, together with the strongest
prior evidence against it.

---

## 1. Why the scorecard is being re-opened

Vertex placement in STRATA-001 is genuinely exact — that work stands and nothing here disputes it. The
tessellation is a separate claim, and the ruler that certified it has a structural blind spot.

`sagOfN` (`research/bridge/_strataConformBisect.test.ts:245`) reports, for each triangle, the largest
distance from an analytic surface point to that triangle's **infinite plane**, sampled on a **fixed
barycentric lattice** of level `n = clamp(ceil(longestEdge / 0.03 mm), 12, 64)`. Three problems, in
increasing order of seriousness:

1. **No bound.** Nothing connects max-over-samples to max-over-the-triangle. The reading is a lower bound
   with no error control, so "MAX 5.000 µm" means "no sample I happened to take read above 5 µm".
2. **Pitch capped above the product bar.** `n <= 64` caps the sample pitch at 0.03 mm while the bar is
   0.01 mm. A feature narrower than the pitch can sit between samples and contribute nothing.
3. **The ruler and the refinement driver are the same sampler.** The scorecard's own header states
   `ruler ≡ audit ruler` as a virtue. It is the defect: a facet spanning a feature the sampler cannot see
   is never refined *and* never flagged. The verdict is not independent of the thing it judges.

Sixteen of the nineteen closed rows report `MAX 5.000 µm` — exactly `ACCEPT`. That is the refinement
threshold reflected back, not a measurement of the mesh.

## 2. The replacement instrument

`research/bridge/_facetTruthLib.ts`, driven by `research/bridge/_strataFacetTruth.test.ts`
(`PF_STRATA_FT=1`). It reads a finished binary STL from disk and shares **no machinery with any mesher** —
it does not import one. Parameters come from the style registry defaults.

Two directions, because neither alone can audit this pipeline:

| | measures | status |
|---|---|---|
| **H1** mesh → surface | `max over p in the mesh of dist(p, S)` | **certified** |
| **H2** surface → mesh | `max over q in S of dist(q, mesh)` | **witnessed** (sound lower bound) |

**H1 is certified by the 1-Lipschitz property.** Distance to a set satisfies `|d(p) − d(q)| ≤ |p − q|` for
*any* set, with no assumption on `rA`. Sampling a triangle on a barycentric lattice of level `n` puts every
point of the triangle within `rho = covRad(T)/n` of a sampled vertex, where `covRad` is the exact
farthest-point-from-the-vertices radius (circumradius if acute, else half the longest edge). Hence

```
max over the whole triangle  <=  max over the lattice  +  rho          (rigorous)
```

`n` is raised until the bound clears the tolerance. No feature detector, no per-style envelope, no
smoothness assumption — nothing can hide between samples, because the bound holds over the continuum.

Soundness of the distance estimate is one-directional and in our favour: any surface point `q` gives
`d(p) <= |p − q|`, so every candidate-based estimate **over**-estimates. A PASS is therefore sound however
crude the nearest-point search; only a FAIL can be a search artifact, which is what the stage-3 global
confirm exists to rule out.

**The printed boundary is the CLOSURE of the graph.** At a C0 z-step the solid has a vertical tread wall,
and at a θ-jump a curtain; both are correct geometry the mesher deliberately emits, and both are absent
from the bare graph `r = rA(θ,z)`. Scoring them against the graph would report about half the jump height
as an error on every layered style. So at each candidate `(θ,z)` the surface footprint is the radial
segment spanned by the one-sided limits (probed at ±1e-6), and the query radius is clamped into it. On a
smooth patch the limits coincide to within `slope × 1e-6` mm, so this is a no-op except exactly at a jump.

**H2 is coverage-first, then worst-first.** Phase A sweeps the entire `(θ,z)` domain on a uniform lattice
at a stated pitch, so no part of the surface can be starved by budget spent elsewhere. Phase B then spends
what is left refining cells in priority order, keyed by what a cell could still be hiding: its reading plus
a cheap `rA`-only measure of how far the true surface departs from that cell's own corner interpolant.
That second term is what earns refinement for a feature living strictly *between* query samples. Each
reading is an exact 3-D point-to-triangle distance, so every exceedance H2 reports is genuine. Its
resolving power is bounded by the structure-scan pitch, which is reported with every result.

## 3. The instrument is validated before it is believed

`research/bridge/_strataFacetTruthValidate.test.ts` (`PF_STRATA_FTV=1`) checks every claim against a
closed-form value or a constructed defect of known size. **6/6 green.** This is not ceremony — the first
three drafts of the sampler all failed here, and two of them failed by silently reporting a PASS, which is
the exact failure class under investigation. Both were budget starvation: depth-first adaptive refinement
that exhausted its query budget before reaching the defect, on a domain it never finished covering. That is
why phase-A coverage is now unconditional.

| | check | result |
|---|---|---|
| V1 | H1 vs the closed-form cylinder chord sagitta `R(1−cos(dθ/2))` | exact 2.249981 µm → witnessed **2.249981 µm** |
| V2 | bound ≥ witnessed; bound tightens with `n`; honest NOT-CERTIFIED below the true sagitta | pass |
| V3 | H1 against a 400 µm ridge the mesh never represents | reads **12.04 µm** — under-reports **33×** |
| V4 | H2 against a 500 µm ridge the mesh never represents | reads **502.6 µm** |
| V5 | **the blind spot, deterministically** | **old ruler 5.552 µm · H2 391.661 µm** on 400 µm relief |
| V6 | a mesh that *does* resolve the same ridge | **0.617 µm** |

**V3 is the finding that reshaped the instrument.** H1 does not read zero on a missing feature — it reads
roughly the feature's *half-width*, because that is how far a facet point sits from the nearest surviving
surface. So H1 under-reports absent relief by the width/height ratio, which is unbounded for a thin
feature: an 8 µm-half-width, 400 µm-tall ridge reads 12 µm. **A mesh→surface number alone can never audit
this pipeline**, and any auditor reporting only H1 reproduces the blind spot it was built to catch.

**V5 is deterministic, not a lucky construction.** The old ruler's sample positions are computable: for a
structured mesh every facet spans the same `[θ_i, θ_i+1]` and its lattice puts θ samples exactly at
`θ_i + k·dθ/n`. Placing a crest at a half-integer multiple of that pitch, narrower than the pitch itself,
guarantees no sample ever lands on it. The old ruler then calls a mesh missing 400 µm of relief clean at
5.552 µm. V6 confirms this is diagnosis and not instrument bias: the same ridge, resolved by the mesh,
reads 0.617 µm.

## 4. What each verdict will and will not mean

- **H1 PASS** is a genuine certificate: no point of any triangle is further than the tolerance from the
  surface. It is *not* a statement that the mesh represents the surface.
- **H2 within tolerance** is bounded by the reported structure pitch: no feature materially wider than that
  is missed. It is not a certificate; a certified H2 needs interval arithmetic on `rA`.
- Both are measured on the **ring** stage at **registry defaults**, on the exact meshes the scorecard's
  verdicts were based on (`research/exchange/_strataConformBisect/<style>_ring_D--.stl`). GothicArches uses
  its ring output rather than the solid, because the auditor's surface model is the outer wall and inner
  wall/cap triangles would read as false H1 exceedances.

## 5. Results

Sweep: `bash research/bridge/_facetTruthSweep.sh` (one style at a time). Reports land in
`research/exchange/_strataFacetTruth/<style>.report.txt`.

_(table filled as rows complete — no row's status changes before its number is here)_

Sweep config: TOL 10 µm · H2 coverage pitch 40 µm · H2 refinement floor 2.5 µm · H2 phase-B wall-clock cap
300 s (so an H2 number marked *truncated* is a floor, not a converged value) · old-ruler A/B on every row.


### The verdict

**7 of the 19 "closed" rows do not hold at 0.01 mm true-3D:**

| refuted row | old ruler | H2 witnessed (floor) | ratio |
|---|---|---|---|
| **BasketWeave** | 7.034 PASS | **93.662** | 13.3× |
| **GothicArches** | 5.856 PASS | **20.077** | 3.4× |
| **CelticTriquetra** | 5.079 PASS | **17.837** | 3.5× |
| **GyroidManifold** | 7.416 PASS | **17.299** | 2.3× |
| **GeometricStar** | 4.999 PASS | **12.675** | 2.5× |
| **Voronoi** | 5.000 PASS | **11.906** | 2.4× |
| **Crystalline** | 5.000 PASS | **10.302** | 2.1× |

Every one of these was brute-force re-checked against the entire mesh, so none is an acceleration-structure
artifact. Every one is a *floor*.

**The split is not random — it is exactly the feature taxonomy.** The twelve rows that hold are the smooth
styles plus the layered ones (worst: DragonScales 8.853, Bamboo 7.457 — both floors, both uncomfortably
close to the bar). The seven that fail are, without exception, the styles whose defining geometry is a
**sharp locus**: θ-jumps (BasketWeave), ribs and creases (Gothic), snaking strands (Triquetra), ridge
networks (Gyroid), star tips (GeoStar), cell bisectors (Voronoi), facet edges (Crystalline). These are
precisely the styles that needed bespoke closers, and precisely where a plane-distance lattice ruler is
blind.

Read together with §3: the old ruler was not lying about *its own* quantity — plane-distance on its lattice
really is ~5 µm on these meshes. It was measuring something that is not the product bar. On the twelve
smooth/layered rows the two rulers agree, which is what makes the disagreement on the other seven
meaningful rather than a systematic offset.


### Where the failures actually live — the census (this changes the reading of the table)

Every H2 sample over tolerance is counted and binned by z (24 bins, base -> rim). Six of the seven
refutations are genuine INTERIOR defects; exactly one is a boundary artifact, and it is the one with the
most alarming headline number.

| refuted row | H2 (floor) | samples over tol | where they are | character |
|---|---|---|---|---|
| **GothicArches** | 20.077 | **2 372** / 30.6 M | bins 5-24, peak bin 12 (z 55-60) | **wall-wide**, mid-wall peak = the arch rib |
| **GyroidManifold** | 17.299 | 189 / 37.4 M | bins 2-23, everywhere | **wall-wide**, uniformly distributed |
| **CelticTriquetra** | 17.837 | 73 / 32.6 M | bins 10, 16-20 (z 45-50, 75-100) | interior, multi-locus, upper wall |
| **GeometricStar** | 12.675 | 40 / 33.1 M | bin 3 only (z 10-15) | interior, ONE cluster |
| **Voronoi** | 11.906 | 26 / 44.8 M | bins 4, 8, 11, 12 | interior, scattered loci |
| **Crystalline** | 10.302 | 3 / 40.8 M | bin 14 only (z 65-70) | interior, ONE locus, 3 samples — marginal |
| **BasketWeave** | 93.662 | 22 160 / 88.2 M | **bin 24 ONLY** (z 115-120) | **RIM BAND ONLY — the wall is clean** |

**BasketWeave must be read differently from the other six.** Its 93.662 µm argmax sits at exactly
z = 120.000, the ring's open top boundary, and *not one* of its 22 160 exceedances lies below z = 115. This
is a boundary-row defect of the **ring** stage. The solid stage caps the rim differently, so it is an open
question whether this exists in the exported product at all — it must not be quoted as "BasketWeave is
93 µm wrong" without that qualifier.

**GothicArches is the most serious row**, not BasketWeave: 2 372 exceedances spread across nearly the whole
wall with a peak exactly where the arch rib lives. That is a distributed tessellation failure, which is the
hardest kind. GyroidManifold is second: fewer samples but spread uniformly over every bin.

**Crystalline is marginal and should be labelled so**: 3 samples out of 40.8 M, at 10.302 µm against a
10.000 µm bar. It is over, but it is over by 3 %.

Severity order for anyone acting on this: **GothicArches > GyroidManifold > CelticTriquetra > GeometricStar
> Voronoi > Crystalline**, with **BasketWeave separate** as a ring-boundary question.

### Rows that hold, with their caveats

The twelve within-tolerance rows clear 10 µm in both directions, and the two with H1 certificates carry a
rigorous bound on every triangle with none left uncertified. Worth stating plainly, because it is evidence
about the instrument as much as about the meshes — this ruler does not simply read high on everything,
which V6 also showed synthetically.

Two of them are marginal and should not be treated as safe: **DragonScales 8.853** and **BambooSegments
7.457**, both floors, both layered styles where the old ruler said 5.000. A longer refinement budget could
push either over.

### Sequencing change, and why

H1's certificate cost 609 s for SuperellipseMorph's 156 k triangles, which extrapolates to ~2.2 h on the
2 M-triangle rows — a full-certificate sweep across nineteen styles would not finish. H1 is also **not**
where the suspected defect lives: V3 established that H1 under-reports absent relief by the feature's
width/height ratio. So H2 now runs across all nineteen rows first, and H1 certificates follow as a second
pass. The certificates already earned are preserved as `<style>.h1h2.report.txt`.

## 5b. Defects found in THIS auditor (recorded, because they are the same failure class)

Four, three of them capable of producing a false PASS. They are listed because "the ruler was never
validated" is precisely what put the original scorecard in question, and this instrument should not be
granted the trust that was wrongly extended to the last one.

1. **H1 reported a partial sweep as PASS.** On hitting the sample cap it broke out of the triangle loop and
   still printed `0 / nTri` exceedances. Now reports `audited/nTri` and downgrades to INCOMPLETE — an
   unseen triangle is *unknown*, not passing.
2. **Two H2 sampler drafts reported a false PASS by budget starvation** (§3): depth-first refinement that
   never finished covering the domain. Phase-A coverage is now unconditional.
3. **Three sweeps ran concurrently** — `pkill` does not exist on Git Bash, so the kill silently failed.
   They competed for CPU and clobbered each other's logs; one style produced no report at all. The sweep
   now takes a `mkdir` lock and refuses to start a second copy. Everything measured under that contention
   was discarded and re-run.
4. **The locator's buckets were sized from triangle scale, not memory budget** — 2.68 mm buckets holding
   ~33 triangles each, so every nearest-point query brute-forced ~890 triangle tests at 24 µs. A
   performance bug, not a correctness one, but it was about to turn the sweep into a multi-day run.

## 6. The fix that follows from the diagnosis (designed, NOT yet measured)

Independent of how many rows survive §5, the refinement driver has a defect of its own that is worth
stating now, because it is the same defect as the ruler's and it has a one-concept fix.

`bisect` currently accepts a triangle when its **witnessed** sag falls below `acceptTol`. Witnessed is a
lower bound with no error control, so acceptance means "no sample I took read high" — which is why the
scorecard's rows all land at exactly `ACCEPT`. The accept test should be the **bound**, not the witness:

```
accept  iff   witnessed + covRad(T)/n   <=   acceptTol           (H1 direction)
accept  iff   maxSurfaceSample + arcPitch <= acceptTol           (H2 direction)
```

Both are rigorous for the same reason — distance-to-a-set is 1-Lipschitz, and moving along the surface by
arc length `s` moves at most `s` in 3-D. Consequences:

- A triangle whose sampling cannot certify it is **refined instead of accepted**. The `n <= 64` clamp
  becomes unnecessary and harmful; `n` should be whatever the bound demands.
- No feature detector is involved, so it stays shape-agnostic — this is the property the campaign has been
  chasing with per-style closers.
- The H2 form is the one that forces a feature to be *represented*: a facet chording over a ridge has a
  surface sample on the crest that is far from the mesh, and no amount of plane-distance sampling of that
  same facet will say so (V3).

The cost is real and should not be hidden: certifying at 10 µm means a sample pitch of order 10 µm, so
sample count scales as `area / tol²` rather than with triangle count. That is the honest price of a
certificate, and it is the number to put in front of a ship decision — not a cheaper ruler.

## 7. PRE-REGISTERED: are the refuted rows mechanism-limited or driver-limited?

Registered **before** the experiment exists, so the answer cannot be fitted afterwards.

### The observation

At every refuted row's worst locus the mesh is **coarse, not floored**, and the mesher **had budget left**:

| row | tris / cap | budget used | worst-triangle edges (µm) | heap at stop |
|---|---|---|---|---|
| GyroidManifold | 1.91 M / 16 M | 12 % | 140 / 267 / 206 | 0 left |
| Voronoi | 1.56 M / 9 M | 17 % | 74 / 75 / 142 | 0 left |
| GeometricStar | 1.72 M / 9 M | 19 % | 197 / 129 / 265 | 0 left |
| BasketWeave | 0.86 M / 2.5 M | 34 % | 997 / 813 / 1382 | 0 left |
| Crystalline | 2.27 M / 5 M | 45 % | 296 / 138 / 159 | 0 left |
| GothicArches | 3.90 M / 6 M | 65 % | 433 / 353 / 535 | 0 left |
| CelticTriquetra | 3.36 M / 5 M | 67 % | 82 / 396 / 316 | 0 left |

The refinement floor is `FLOOR_MM = 1.5 µm`. Every one of these triangles is **50×–900× above it**, and every
run ended with a **drained heap** — the driver believed it was converged. It was not out of room, out of
budget, or out of mechanism. It stopped because `sagAdaptive` told it these triangles were within 5 µm.

### The hypothesis

**These rows are DRIVER-limited, not MECHANISM-limited.** The campaign has been building per-style
conforming machinery (curtains, chains, junctions, treads) on the premise that the sharp-locus styles need
new mechanisms. At the measured worst loci that premise is not what is binding: the mesh is simply coarse
there, and the driver had both budget and floor headroom to fix it.

### The prediction (falsifiable, and stated in advance)

Re-running a refuted style with an accept test that a triangle cannot pass **unless its own sampling
resolves it** — `witnessed + coveringRadius ≤ acceptTol` rather than `witnessed ≤ acceptTol` — should:

1. drive H2 on that style **below 10 µm**, measured by the independent auditor, with **no new mechanism**;
2. do so **within the existing triangle budget** (GeometricStar used 19 % of 9 M);
3. leave the twelve holding rows **unchanged** when the flag is off (byte-identical output).

**What refutes it:** if the style still reads over 10 µm at the floor, or the triangle count explodes past
budget, then the locus genuinely needs conforming and the mechanism premise was right after all.

**Target: GeometricStar** — one interior cluster (40 samples, z 10-15), 12.675 µm, coarsest headroom
(19 % of budget), so it is the cleanest discriminator. If it does not move, the hypothesis is dead.

### The known limit of the fix

The covering-radius term cannot be satisfied at a genuine **C0 jump**: adjacent surface samples straddling
a discontinuity stay a jump-height apart in 3-D no matter how fine the parameter lattice. Such triangles
will refine to the floor and remain flagged — which is the correct and useful behaviour, because it names
exactly the loci that need a curtain rather than density. That is the closure invariant the original brief
asked for in its §5.6, obtained for free.

## 8. BOTH DIRECTIONS TOGETHER — the picture is worse than the H2 table alone

H1 refutes rows that H2 passes, and it must, because the two directions catch different defects. A facet
that **spans a feature** has its interior far from the surface while the surface itself stays covered by
neighbouring facets: H1 sees it, H2 cannot. That is the purest form of the defect this campaign is about.

H1 headline figures below are the **stage-3 globally confirmed** values, not the cheaper per-triangle local
estimates. That distinction is not cosmetic — the local estimates over-stated by roughly 2x
(WaveInterference 20.671 → 10.784, SpiralRidges 20.597 → 10.602, HarmonicRipple 23.955 → 13.963), and
quoting them would have inflated the failures. Every candidate distance is an upper bound on the truth, so
the smaller number is always the better one.

| style | H2 (surface→mesh) | H1 (mesh→surface) | clean in BOTH? |
|---|---|---|---|
| LowPolyFacet | 5.000 | **10.000 PASS** | ✅ |
| SuperellipseMorph | 5.019 | **10.000 PASS** | ✅ |
| SuperformulaBlossom | 4.997 | **10.000 PASS** | ✅ |
| RippleInterference | 5.001 | **9.999 PASS** | ✅ |
| FourierBloom | 5.157 | **10.000 PASS** | ✅ |
| SpiralRidges | 5.151 | 10.602 | ❌ H1 |
| WaveInterference | 5.006 | 10.784 | ❌ H1 |
| HarmonicRipple | 5.997 | 13.963 | ❌ H1 |
| ArtDeco | 5.771 | 23.360 | ❌ H1 |
| BambooSegments | 7.457 | 35.039 | ❌ H1 |
| DragonScales | 8.853 | 63.177 | ❌ H1 |
| HexagonalHive | 5.555 | 40.260 | ❌ H1 |
| Crystalline | **10.302** | not run | ❌ H2 |
| Voronoi | **11.906** | not run | ❌ H2 |
| GeometricStar | **12.675** | not run | ❌ H2 |
| GyroidManifold | **17.299** | not run | ❌ H2 |
| CelticTriquetra | **17.837** | not run | ❌ H2 |
| GothicArches | **20.077** | not run | ❌ H2 |
| BasketWeave | **93.662** (rim only) | not run | ❌ H2 (ring boundary) |

**Five rows are clean in both directions.** Not twelve, and not nineteen:

> LowPolyFacet · SuperellipseMorph · SuperformulaBlossom · RippleInterference · FourierBloom

The trajectory of this audit is worth stating plainly rather than letting it arrive in pieces:
**19 claimed closed → 12 surviving H2 → 5 surviving both directions.** The seven rows still pending an H1
number already fail H2, so they can only move down.

The layered rows were re-measured after the closure was fixed (§9); their z-steps were located correctly —
ArtDeco 8 at z=3/27/33/57/63/87/93/117, BambooSegments 4 at 24/48/72/96, DragonScales 7 at 15..105 — and
HexagonalHive has **none**, so its number never depended on the closure at all.

The four H1-only failures (SpiralRidges, WaveInterference, HarmonicRipple, ArtDeco) sit at 10.6-23.4 µm on
ordinary wall triangles of 400-1200 µm — again far above the 1.5 µm floor, again with the heap drained.
Same driver-limited signature as §7.

### §7 addendum — PRIOR ART, including the strongest evidence AGAINST the hypothesis

Logged before running the experiment, not after.

`research/lab/2026-07-12-raycast-oracle-fidelity.md` already asked "can raycast make a perfect 0.01 mm
mesh?" and answered it with a GPU raycast oracle, validated by a vertex-parity proof
(`referenceTrusted=true`, vertexMax ≤ 0.5 µm). Phase 2, perpendicular metric, ~2 M tris:

| style | cert max | cert p99 |
|---|---|---|
| GyroidManifold | 0.7241 mm | 0.1346 |
| GothicArches | 0.4401 mm | 0.1289 |
| SpiralRidges | 0.0469 mm | 0.0041 |

Its verdict — *"NONE of the 3 frontier styles reach 0.01 mm max EVERYWHERE (4.7×–72× over)"* — is the same
class of finding as this re-audit, from a completely independent instrument, and it predates it by a
fortnight. **But it is NOT numerical corroboration**: it measured the PRODUCTION parametric GPU pipeline,
not the `_strataConformBisect` meshes audited here. Gothic reads 0.4401 mm there against 0.0201 mm here —
22× apart, because they are different meshes from different meshers. It corroborates the class and the
direction, nothing more.

**The counter-evidence, stated plainly.** For GyroidManifold that spike reports: *"the single worst facet
is PINNED at the same (θ,z) across all 3 conditions"* — verdict-refine moved p99 by −35 % and the max by
**0.0 %**. A maximum that does not move under refinement is the signature of a **mechanism** limit, which
is the opposite of §7's hypothesis.

**Why the hypothesis may still survive it** — and this is an argument, not a measurement, which is exactly
why it is being written down in advance: that refinement was (a) subdivision-only with no
feature-conforming edges, and (b) scoped to `general-curve` feature lines, therefore **inert on Gothic and
SpiralRidges entirely**. A pinned max under feature-blind subdivision does not test what a bounded accept
test does. If the bounded run also leaves the max pinned, §7 is dead and the mechanism premise was right.

**This sharpens the pre-registered prediction rather than weakening it**: the discriminator is not "does
the triangle count rise" but "does the MAX move". §7 predicted GeometricStar's H2 drops below 10 µm; the
prior art says watch the max specifically, because that is what previously refused to move.

## 10. GPU THROUGHPUT ON THE SOUND COMPUTATION (`research/gpu/gpuRuler.js`)

The binding cost of a certificate is `area / tol²` — ~1.4 ms/triangle on CPU, 30 min for GeometricStar.
The fix is throughput, **not** a cheaper metric: a ray-gap measure would trade the guarantee away, since a
ray gap is the perpendicular distance divided by cos(incidence), unbounded at grazing angles — worst
exactly on the steep features where every failure here lives. So the *same* computation was ported, not
replaced.

**Prerequisite, measured before anything was built on it.** A GPU screen filters against whatever surface
the GPU thinks it has, so GPU `style_radius` must equal CPU `STYLE_FUNCTIONS` — and this repo already
carried finding **F1: CPU `styles.ts` sf_strength divergence**. Result over 73 k samples × 20 styles:

| | |
|---|---|
| all 20 styles, away from jump loci | **≤ 0.4813 µm** (worst: GyroidManifold), **0 samples over 1 µm** |
| BasketWeave sampled ON its 16 θ-jumps | 1999.967 µm |
| BasketWeave with the grid shifted off them | **0.042 µm**, 0 over 1 µm |

The on-grid argmax sits **1.72e-7 rad from θ = k·2π/16** — i.e. exactly on the discontinuity, where the
surface is genuinely two-valued and the two implementations may legitimately pick different branches. So
this is a **tie-break at a measure-zero locus, not a disagreement about the surface**, and jump loci are
handled by the closure rather than by the screen. A 1 µm f32 margin covers the real divergence 2× over.

**Verified throughput** (compile once, one dispatch, compute timed separately from readback, output
spot-checked against the CPU function so a dropped pass cannot masquerade as speed):

| batch | dispatch | compute | throughput | spot-check |
|---|---|---|---|---|
| 8 388 608 | 65535 × 3 | **51.06 ms** | **164 289 228 evals/s** | 842/842 non-zero, max diff 0.2412 µm |

**~100× over the CPU harness.** GeometricStar's 4 414 M-sample H1, which cost 1779 s on CPU, is ~27 s of
GPU compute.

**A trap worth recording.** `maxComputeWorkgroupsPerDimension` is 65535, so a 1-D dispatch silently caps at
4 194 240 invocations — exceeding it does not raise where you can see it, the pass is simply **dropped and
the output stays zero**. Measured as "8.7 billion evals/sec" with an all-zero buffer. Any GPU throughput
figure that is not accompanied by a verified non-zero output is worthless; `dispatchDims()` now handles it.

**The soundness argument for the screen** (implemented, not yet wired into the audit loop): the radial foot
is a genuine surface point, so its distance is an UPPER bound on `dist(p, S)`. Therefore
`gpuMax + covRad/n + margin ≤ tol` **certifies a triangle clean with no false negatives**, and only the
survivors need the exact CPU treatment. On these meshes the overwhelming majority clears.


## 11. THE PERPENDICULAR RULER — and what it does to the numbers above

The product bar is error measured **perpendicular to the true 3-D surface**. `dist(p, S)` is exactly that
quantity — the closest-point vector is orthogonal to the surface at its foot — but §2's implementation was
not computing it:

- `distRadial`, the **radial** gap, was the primary per-sample measure. Radial = perpendicular / cos(tilt),
  so it over-states, and it over-states most on steep geometry — precisely where every failure here lives.
- The polish fired only above `tol/4`, so every reading under ~2.5 µm was radial.
- The certified bound was therefore **built from inflated values**.
- Nothing anywhere verified that a returned foot was perpendicular to anything at all.

**Now solved rather than approximated.** The closest point satisfies orthogonality against both tangents,
`F(θ,z) = [(p−P)·P_θ, (p−P)·P_z] = 0`, and damped Newton with a numerical 2×2 Jacobian converges
quadratically to it. It needs only `rA` and finite differences — no per-style code, no feature detector, no
envelope. **That is what makes it shape-agnostic.** Every measurement returns `ortho`, the orthogonality
residual: the sine of the angle by which the foot deviates from perpendicular, so a caller can assert on it.

| validation | result |
|---|---|
| V8 cylinder, offsets 400 / 50 / 4 µm | exact to 1e-7 mm, ortho **1e-15** |
| V9 cone of slope k | radial **300.000** µm vs perpendicular **294.174 / 268.328 / 212.132** µm = closed form `gap·cos(slope)`; radial over-states **41 % at 45°** |
| V10 ridged surface, 40 probes | worst radial/perpendicular **19.871×**, worst ortho 2.70e-7 |

**A regression caught during the build, recorded because the lesson generalises.** Newton alone converges
to the nearest **stationary** point, not the global minimum. Seeded at the radial foot of a facet spanning a
ridge — a foot that sits *on the crest*, ~400 µm away — it polished a flank solution and never found the
base surface 8 µm sideways: V3's thin ridge read **409 µm** where the truth is 12.041. Fixed by
**descent first, then Newton**: the coordinate descent is globally better behaved because its first steps
are large, Newton is locally exact. V10's ratio moving 1.000× → 19.871× on that fix shows the earlier
apparent "agreement" between radial and perpendicular was simply the solver failing to find the
perpendicular foot at all.

### What this does to §5 and §8

Radial **over-states**, so every H1 figure reported above is an upper bound on the truth:

- the five **PASS** rows stay sound — passing on an over-estimate is still passing;
- the H1 **failures** (SpiralRidges 10.602 · WaveInterference 10.784 · HarmonicRipple 13.963 ·
  ArtDeco 23.360 · BambooSegments 35.039 · HexagonalHive 40.260 · DragonScales 63.177 ·
  GeometricStar 193.846) were all measured on the old path and **may be materially inflated**.

They are being re-run. **None of them should be treated as a verdict until it lands**, and the marginal ones
(SpiralRidges, WaveInterference) could plausibly cross back under the bar.

H2 is unaffected: it measures exact point-to-triangle distances from surface samples to the mesh, which
were never radial.

## 12. GPU SCREEN — all 19 rows, 13.3 M triangles, 84 % certified without touching the CPU

| batch | tris | wall | outcome |
|---|---|---|---|
| 14 smaller styles | 6.51 M | **29 s** | 4 rows FULLY certified, 0 survivors |
| 5 largest styles | 6.80 M | **12 min** | chunked, no device loss |

**Fully certified end-to-end, zero survivors:** LowPolyFacet 5.49 · SuperformulaBlossom 7.026 ·
RippleInterference 7.405 · SuperellipseMorph 7.608 µm.

**~2.12 M survivors of 13.3 M triangles — 84 % cleared by the GPU**, leaving ~1.9 h of CPU perpendicular
work instead of the 10.4 h a full CPU sweep would have cost.

Survivor rates are **deliberately pessimistic** and must not be read as failure rates: the screen measures
raw radial distance to the bare graph with **no closure**, so every tread and curtain facet survives by
construction (BasketWeave 19 %, GeometricStar 35 %, Gyroid 37 %). Adding the z-/θ-jump closure to the
kernel would cut those sharply. The screen can only ever send extra work to the CPU, never clear a bad
triangle — that is the property that makes it sound.

**TDR is a correctness constraint, not a tuning knob.** A single dispatch running ~2 s trips the Windows GPU
watchdog and the device is LOST, taking every subsequent style with it — measured: GeometricStar ran
2633 ms at n=192 and the next five styles all died with `[Device] is lost`. Chunking by sample count fixed
it; the five largest styles then completed with no loss.

### The perpendicular re-runs resolved the outstanding risk

§11 flagged that the H1 failures might be inflated because the old path measured radially. Tested on the
two most likely candidates — one smooth, one steep with 8 z-steps — and **both returned identical numbers**:

| | old path | perpendicular ruler |
|---|---|---|
| WaveInterference | 20.671 / 10.784 / 6 over | **identical** |
| ArtDeco | 33.294 / 23.360 / 212 over | **identical** |

The risk was real and correctly raised; it did not materialise. **The H1 failure list stands as reported.**

## 13. §7 VERDICT — REFUTED. The sharp-locus rows are MECHANISM-limited, not driver-limited.

> **SUPERSEDED IN PART — read §14 with this.** The refutation of §7 stands (and §14a strengthens it with the
> pre-registered auditor number: H2 went 12.675 → **175.475 µm**). The *"mechanism-limited"* conclusion in
> this section's title and closing does not hold, for two measured reasons: §14c finds the chord error of
> every refuted style falls 1.45-3.2× per halving with **no plateau**, which is the opposite of a pinned max;
> and §14b finds the accept test that was run **pins its sampling level at n=12**, refusing 84.8 % of a mesh
> on grounds unrelated to fidelity, which made the CAP inevitable. §7 has not yet been tested with the lever
> §6 specified.

```
GeometricStar, PF_CB_BOUNDED=1, grid 200x140, 9 M cap, registry defaults, ring
  -> 4,521,424 tris   alloc 9,000,000/9,000,000  *** CAPPED ***   1856 s, 3626 M rA evals
  heap 5,182,239 LEFT, worst-left 228.279 um
  HEADLINE MAX 192.067 um FAIL    over-0.01 mm 87,696 / 4,521,424
  non-manifold 0 . seam-crack 0   min edge 0.131 um
```

§7 pre-registered: *"if the style still reads over 10 µm at the floor, **or the triangle count explodes
past budget**, then the locus genuinely needs conforming and the mechanism premise was right after all."*

**Both conditions fired.** The bounded accept test built **5.1× the baseline's triangles** (4.52 M vs
885 k), **exhausted the entire 9 M budget** — the baseline used 19 % of it — and still had 5.18 M queued
at a worst-left of 228 µm.

The lever itself behaved exactly as designed: it refuses to accept a triangle its own sampling has not
resolved, and it stayed watertight (0 non-manifold, 0 seam-crack) while doing so. What it demonstrates is
that **GeometricStar cannot be closed by density at any feasible budget.**

**So the hypothesis is dead and the campaign's original premise is vindicated.** The sharp-locus styles
need the conforming machinery — curtains, chains, junctions, feature-conforming edges. Better-driven
refinement does not substitute for it. This also agrees with the independent prior evidence logged in the
§7 addendum before the run: the raycast-oracle spike found Gyroid's single worst facet **pinned at 0.0 %
change** under refinement.

**What §7 was right about, and what it was wrong about.** Right: the driver IS blind — it accepted on an
unbounded witness, stopped with a drained heap and unspent budget, and its 5.000 µm readings were the
accept threshold reflected back. Wrong: that blindness was not the whole story. Fixing the accept test
exposes the real gap rather than closing it — which is still progress, because an honest driver that
refuses to converge names exactly the loci that need a mechanism.

**Consequence for the roadmap.** Do not pursue "close the refuted rows by refining harder". The bounded
accept test should be kept as an INSTRUMENT (it turns silent acceptance into a visible refusal), not as a
fix. The route to 0.01 mm on the seven refuted rows runs through feature-conforming, and the auditor built
here is what will tell the truth about whether any given attempt worked.

## 14. §13 IS OVER-CLAIMED — the sharp loci CONVERGE under refinement, they are not pinned

§13 concludes *"GeometricStar cannot be closed by density at any feasible budget"* and *"the campaign's
original premise is vindicated"*. Half of its evidence is sound: the bounded run did fire §7's pre-registered
refutation clause (the triangle count exploded past budget), so **§7's prediction is correctly recorded as
refuted**. The inference from that to a *mechanism* limit is not supported, and two direct measurements
contradict it.

### 14a. First — the pre-registered number §13 was missing

§7 said the discriminator is H2 **measured by the independent auditor**. That run has now landed
(`PF_FT_TAG=GeometricStar_BOUNDED`, identical settings to the baseline sweep: 40 µm phase-A pitch,
2.5 µm floor, 300 s phase-B cap, 11.505 µm uniform structure pitch):

| | baseline `geometricstar_ring_D--` | bounded `geometricstar_ring_D--B` |
|---|---|---|
| triangles | 885 400 (19 % of 9 M) | 4 521 424 (**100 %, CAPPED**) |
| **H2 witnessed** | **12.675 µm** | **175.475 µm** (brute-force re-checked: 175.475) |
| H2 samples over tol | 40 / 33.1 M | **2 631 930 / 29.1 M** |
| argmax locus | z 10-15 band | th=4.661548 **z=6.21094** |
| argmax triangle edges | — | 519.315 / 403.758 / 485.946 µm |
| mesher's own ruler | 4.999 PASS (blind) | 192.067 FAIL |
| median (p50) sag | 1.526 µm | **0.189 µm** |

**The bounded accept test made H2 14× WORSE** — 12.675 → 175.475 µm — while making the *median* triangle
8× better. Two instruments that share no code agree on the same triangle: the mesher's own honest ruler
reports edges 519.3/403.8/485.9 at z≈6.21, and the independent auditor's nearest-triangle locus is
519.315/403.758/485.946 at z=6.21094. This is not an instrument artifact.

So §7 is refuted **harder** than §13 says: the lever did not merely fail to close the row, it degraded it.

### 14b. But that is an ALLOCATION failure, not a mechanism limit

> **PARTLY WITHDRAWN — see §14f.** The refusal-rate measurement below is sound, but the causal claim built
> on it ("the run was doomed to CAP before fidelity ever entered") is REFUTED by a direct A/B: implementing
> the escalating lever exactly as §6 specified yields a **byte-identical mesh** for 5.4x the sampling cost.
> §7 is properly refuted. What survives from this section is only that the driver never reached its own
> worst locus; what survives from §14c is untouched.

A mechanism limit means the error at a locus does **not fall when you refine it** — that is what the
raycast-oracle prior art observed (Gyroid's worst facet pinned at 0.0 % change) and what §7 said to watch.
The bounded run cannot demonstrate it, because **it never refined the worst locus at all**: the argmax
triangle carries ~500 µm edges, **346× above the 1.5 µm floor**, and the run stopped by CAP with 5.18 M
items still queued at a worst-left of 228 µm. A max that was never touched is not a max that refused to move.

**RETRACTED — my own over-claim, corrected by reading the code I was citing.** An earlier draft of this
section blamed *"1 002 064 key inversions (the priority queue is not ordering by priority)"* and
*"10 110 640 REFUSED welded splits"*. Both are wrong, and applying to myself the standard this section
applies to §13:

- `keyInversions` counts pops where the current heap max exceeds the previously popped key. `hpush`/`hpop`
  are a textbook max-heap and always return the current max; a max that *rises* is simply an insert landing
  above the last pop, which is **normal for any dynamic priority queue**. It is not a defect.
- `weldedSplits` is an **attempt** counter, not a refusal-to-progress counter: `splitEdge` deliberately walks
  a `NUDGE_LADDER` of offsets and `refineDirected` tries up to six edges, so one successful split can log
  several weld hits by design. The real progress-failure number is `stuck` = **87 832 no-op splits, 3.8 %**
  of pops — unremarkable.

**The actual cause, measured.** The bounded accept test is `witness + covering`, where the covering term is
the largest 3-D gap between lattice-adjacent surface samples — approximately `L/n` for a triangle of extent
`L`. §6 specified that `n` *"is raised until the bound clears the tolerance"* and called the fixed clamp
*"unnecessary and harmful"*. **The implementation pinned `BND_N = 12` and never escalated.** So at n=12 the
covering term alone is ~L/12, and every triangle with edges above ~85 µm is refused **regardless of how well
it fits**.

Measured on 400 random triangles of the *baseline* GeometricStar mesh at the mesher's own
`acceptTol = 7 µm`:

| accept test | refused |
|---|---|
| at the implemented **n = 12** | **339 / 400 = 84.8 %** |
| with `n` escalated to ≤ 192, as §6 specified | **93 / 400 = 23.3 %** |
| witness alone over tol (genuinely does not fit) | 75 / 400 = **18.8 %** |

**62 points of the refusal rate were pure sampling artifact.** The lever therefore demanded a global
~85 µm edge length on grounds that have nothing to do with fidelity — on the order of 12 M triangles for
this pot, above the 9 M cap — so the run was **doomed to CAP before fidelity ever entered**. That is why it
spent 9 M triangles without reaching a 519 µm triangle at 5 % of the wall height, and why p50 improved 8×
(it refined the whole wall) while the max did not move (it never got there).

**Consequence: §7 has not actually been tested yet.** The experiment ran a lever that is not the one §6
designed. Escalating `n` is also not more expensive than the splits it avoids — certifying an `L`-sized
triangle needs `n >= L/tol`, i.e. ~`(L/tol)²/2` samples, and splitting it into four children each needing
`(L/2/tol)²/2` costs the same total while doubling the triangle count. The fix is implemented behind
`PF_CB_BND_NMAX` (default 12 = byte-identical to the run above) and the corrected re-run is tagged `_E192`.

### 14c. The measurement that settles it — does the error fall with density?

`structureMap` (§10, repaired in §15a) computes the max departure of `rA` from its own bilinear corner
interpolant over cells of size `h`. That is the chord error an ideal mesh of resolution `h` would carry; it
is a pure `rA` question with no mesher in it, and sweeping `h` **is** the "does the max move" test.

**A genuine C0 jump keeps its jump height as `h → 0`.** None of these does:

| style | h=320 µm | h=160 | h=80 | h=40 | h=20 | rate / halving |
|---|---|---|---|---|---|---|
| GothicArches | 984.489 | 746.876 | 426.048 | 187.763 | **129.742** | 1.32 · 1.75 · 2.27 · 1.45 |
| GyroidManifold | 1117.649 | 806.698 | 420.528 | 161.243 | **51.105** | 1.39 · 1.92 · 2.61 · 3.16 |
| GeometricStar | 887.890 | 373.985 | 175.022 | 92.567 | **36.976** | 2.37 · 2.14 · 1.89 · 2.50 |
| Voronoi | 303.082 | 155.556 | 76.973 | 38.868 | **19.520** | 1.95 · 2.02 · 1.98 · 1.99 |
| Crystalline | 227.757 | 112.274 | 55.908 | 28.019 | **14.118** | 2.03 · 2.01 · 2.00 · 1.98 |
| _SuperellipseMorph (control)_ | 1.339 | 0.565 | 0.267 | 0.130 | — | 2.37 · 2.12 · 2.05 |

Every row falls monotonically. Voronoi and Crystalline are **textbook linear** — 1.98-2.03× per halving
across four halvings — the signature of a **crease** (C1 discontinuity), not a jump. A crease closes with
density; a jump does not. Gothic is slowest at ~1.45× and is correctly the worst genuine row, but it
converges too.

**How much surface is still over the bar at 20 µm cells**, out of 94 248 000:

| style | cells over 10 µm | fraction of the wall |
|---|---|---|
| GeometricStar | 1 792 | **0.0019 %** |
| Voronoi | 8 154 | **0.0087 %** |
| Crystalline | 34 389 | **0.0365 %** |
| GothicArches | 198 636 | **0.2108 %** |
| GyroidManifold | 500 969 | **0.5315 %** |

For GeometricStar the residue is **0.72 mm² of a ~33 900 mm² wall**. Refining only the 1.04 % of cells that
fail at 40 µm down to 20 µm costs on the order of **2 M triangles** — against a 9 M budget the mesher
*already spent in full, and still missed the worst triangle*.

### 14d. The corrected verdict

- **§7's prediction: REFUTED, and then some.** It did not close within budget (CAPPED at 5.1× the
  baseline's triangles) and it degraded H2 by 14×. §13 is right about the refutation and the
  pre-registration is honoured.
- **§13's inference: NOT SUPPORTED.** "Cannot be closed by density at any feasible budget" and "the
  mechanism premise is vindicated" do not follow from a run that never touched the locus in question. The
  error is not pinned; it falls 1.45-3.2× per halving on every refuted style, and the residual area is
  0.002-0.53 % of the wall.
- **What IS established:** the lever that was run is not the lever §6 designed — it pins its sampling level
  at n=12, which refuses 84.8 % of a mesh for reasons unrelated to fidelity (§14b). **§7 remains untested.**
- **Roadmap consequence:** re-run §7 with the escalating-`n` accept test (`PF_CB_BND_NMAX=192`) before
  spending another campaign on per-style conforming machinery. The conforming premise may still be right for
  the C0 styles, but nothing here tests it, and the crease-class styles (Voronoi, Crystalline, GeoStar) look
  density-closable by §14c.

**Caveats, stated as caveats.** §14c is an idealised surface measurement: bilinear departure of `rA`, in the
RADIAL direction, assuming mesh vertices land on cell corners. Radial over-states perpendicular, so the true
requirement is *easier* than the table — which strengthens the conclusion rather than weakening it. It bounds
what a perfect adaptive mesher would need; it does **not** show this mesher can allocate that way, and §14b's
two counters are direct evidence that today it cannot. It says nothing about watertightness or sliver quality
at those densities. The H2 figures in §14a are floors (phase-B truncated by budget on both meshes).

## 15. INSTRUMENT REPAIRS (2026-07-27, later session)

### 15a. The structure map was returning zero for every style — a dropped dispatch, not a reading

§10's `structureMap` reported `maxBulgeUm = 0.000` for all 20 styles including ones with 2 mm of relief.
Cause, taken from the device rather than inferred:

```
In entries[1], binding index 1 not present in the bind group layout.
Expected layout: [binding 0, binding 2, binding 3]
```

`KERNEL_STRUCT` never referenced `samples`, so `layout:'auto'` dropped binding 1, `createBindGroup` failed
validation, the bind group was invalid, and **the dispatch was silently discarded, leaving the output buffer
at its initial zeros**. (The suspected cause — `style_radius` returning `r0` unchanged — was innocent.) This
is the *third* silently-dropped GPU pass in this campaign, after the 65535-workgroup cap and the TDR loss.

Three fixes, in increasing order of importance:

1. The kernel now references `samples[0]` inside the never-taken `ufield[0] > 1e30` branch — the same
   liveness trick binding 3 already had.
2. **`guardValidation` wraps every dispatch path** (`dispatch`, `screenTriangles`, `structureMap`) in a
   WebGPU validation error scope and THROWS with Dawn's own message. WebGPU validation failures are
   asynchronous and non-fatal by design; without a scope they are indistinguishable from a measurement of
   zero. This kills the class, not the instance.
3. `structureMap` throws on an all-zero map, matching the screen's existing all-zero guard, and is now
   **chunked** by sample count — a 1024×512 grid at K=32 is ~571 M evals in one dispatch (~3.5 s), past the
   watchdog.

**Validated before being believed**, against an independent CPU recomputation of the same quantity using CPU
`STYLE_FUNCTIONS` (not the GPU environment):

| check | result |
|---|---|
| GPU vs CPU at the GPU's own argmax cell, DragonScales | 1186.6875 vs **1186.6946 µm** |
| worst GPU/CPU disagreement, 150 random cells + argmax, 3 styles | **≤ 0.2265 µm** |
| K-monotonicity (K and 2K lattices nest, so the max must not fall) | holds on all 3 styles |
| GothicArches cells reading exactly 0 | 25 392 / 131 072 — the arch-free background, where `rA` **is** bilinear |

### 15b. All-20 structure map — this is what bounds H2's blind spot

Cells at H2's **own** 40 µm coverage pitch, probed on a K=16 sub-lattice (2.5 µm sub-pitch = H2's refinement
floor), 23 562 000 cells per style, ~5 s per style:

| no structure below H2's pitch — H2's number is trustworthy | max bulge (µm) |
|---|---|
| SuperformulaBlossom · WaveInterference · SuperellipseMorph · HarmonicRipple | 0.008 · 0.072 · 0.134 · 0.206 |
| FourierBloom · SpiralRidges · HexagonalHive · RippleInterference · LowPolyFacet | 0.244 · 0.259 · 1.038 · 1.053 · 3.670 |

**All nine have ZERO cells over the 10 µm bar** — nothing material can hide between H2's samples on these
styles, so their witnessed values are close to the truth. **All five rows clean in both directions are in
this group.** The split is not luck.

| structure hiding below H2's pitch — H2's number is a FLOOR | max bulge (µm) | cells > 10 µm | cells > 100 µm |
|---|---|---|---|
| ArtDeco | 3935.6 | 62 832 | 62 832 |
| BasketWeave | 1875.7 | 126 380 | 124 540 |
| CelticTriquetra | 1623.8 | 214 525 | 3 289 |
| BambooSegments | 1578.6 | 31 308 | 30 078 |
| DragonScales | 1134.5 | 55 070 | 52 214 |
| CelticKnot | 673.6 | 137 039 | 107 496 |
| GothicArches | 187.8 | 108 528 | 35 172 |
| GyroidManifold | 161.3 | 248 732 | 52 512 |
| GeometricStar | 92.6 | 243 908 | 0 |
| Voronoi | 39.1 | 11 004 | 0 |
| Crystalline | 28.1 | 30 909 | 0 |

**Read the layered rows with care.** For ArtDeco / BasketWeave / BambooSegments / DragonScales the departure
at a z-step *is* the tread height, which the mesher deliberately emits as a wall — those figures conflate
genuine hidden structure with represented geometry and must not be quoted as defect sizes. No jump-class
style appears in the clean nine, so that group is unaffected.

### 15c. The jump closure — implemented, and §12's "deferrals" claim is REFUTED

§12 wrote: *"the screen measures raw radial distance to the bare graph with no closure, so every tread and
curtain facet survives by construction (BasketWeave 19 %, GeometricStar 35 %, Gyroid 37 %). Adding the
z-/θ-jump closure to the kernel would cut those sharply."* That was an argument, not a measurement.

**The closure is now implemented** — shape-agnostic, with no jump list: take the one-sided limits of `rA` at
±ε in **both** parameters and clamp the query radius into the interval they span. On a smooth patch the
limits coincide to within `slope·ε` so it is a no-op; exactly at a jump the interval **is** the wall.
Soundness costs one line of margin: at a smooth point the interval adds points at most `slope·ε ≈ 0.001 µm`
off the surface, folded into the existing 1 µm `marginMm`.

**A/B, full cascade n = 12 → 48 → 192:**

| style | jumps in the mesh | survivors OFF | survivors ON | |
|---|---|---|---|---|
| BasketWeave | 9 z-steps, 7 920 tread facets | 103 361 (22.14 %) | **87 237 (18.69 %)** | −15.6 % |
| LowPolyFacet | none | 0 | 0 | proven no-op |

The closure is correct and worth keeping. But **the claim it was meant to justify is false**, and the meshes
say so directly:

| style | claimed "deferrals" | `z-steps` | tread facets in the mesh |
|---|---|---|---|
| GyroidManifold | 37 % | **0** | **0** of 1 132 314 |
| GeometricStar | 35 % | **0** | **0** of 885 400 |
| BasketWeave | 19 % | 9 | 7 920 of 466 776 = **1.7 %** |

GeoStar and Gyroid contain **no tread or curtain facets at all**, so not one of their survivors can be a
closure deferral. **The ~2.12 M survivors are genuine un-certified triangles, not artifacts**, and the CPU
perpendicular pass over them is measuring real work — not, as §12 implied, mostly deferrals.

**What actually drives the survivor rate** is the screen's use of RADIAL distance, which over-states
perpendicular by `1/cos(tilt)` — measured at 19.871× on a ridged surface (V10). That is why survivors are
~0 % on smooth styles and 35-37 % on exactly the steep ones. Tightening the screen means putting a
descent/Newton step on the GPU, not a closure. That is the next lever, and it is the difference between
1.9 h of CPU and minutes of GPU.

### 15d. Gauss-Newton tightening — the survivor rate was radial over-statement, and it is now measured

§15c established that the survivors are NOT jump deferrals. The remaining hypothesis was the screen's use of
RADIAL distance, which over-states perpendicular by `1/cos(tilt)`. That is now implemented and measured
rather than argued: one Gauss-Newton step on the closest-point problem, seeded at the radial foot, built from
central-difference tangents and the 2x2 normal equations — ~5 extra `rA` evals per sample, `gnIters` knob,
default 0 so the previous behaviour is unchanged.

**Soundness is free here.** Any surface point is an UPPER bound on `dist(p,S)`, so the Newton point is a
valid bound however badly the step behaves, and `min(radial, newton)` is a valid bound too. A bad step can
only fail to help — it can never wave a bad triangle through. This is why a SCREEN needs no globalisation,
unlike `distPerp`, which must find the true global foot and therefore needs descent-first (§11).

Screened at n=192 on a 6 000-triangle random subsample per style, tol 10 µm:

| style | radial (as shipped) | + GN x1 | + GN x3 |
|---|---|---|---|
| GeometricStar | **35.40 %** | 16.93 % | **16.92 %** |
| GyroidManifold | **37.57 %** | 14.73 % | **5.83 %** |
| LowPolyFacet | 0 % | 0 % | **0 %** (no-op, as it must be) |

The `gn0` column reproduces §12's full-mesh figures (GeoStar 35 %, Gyroid 37 %) to within rounding, which is
what validates the subsample. GeoStar saturates after one step; Gyroid keeps improving to **6.4x fewer
survivors** at three.

**Consequence for the CPU pass.** The ~2.12 M survivors of §12 were the *radial* screen's output. With GN the
same meshes yield roughly 2-6x fewer, so the outstanding CPU perpendicular work drops from ~1.9 h to well
under an hour — and, unlike a cheaper metric, it does so without giving up the guarantee. **This, not the
jump closure, was the lever §12 was looking for.**

### 14e. §7 RE-RUN with the escalating lever — a TRAJECTORY, not a verdict

`PF_CB_BOUNDED=1 PF_CB_BND_NMAX=192 PF_CB_DIRECTED=1 PF_CB_TRICAP=9000000`, GeometricStar ring, registry
defaults — the same configuration as both reference runs. Stopped by a wall-clock budget
(`PF_CB_MAXSECS=3000`, added for this run) and **labelled TIME-CAPPED in its own report**, because a run
that outlives its session writes no STL and no numbers at all: the loop exits only on an empty heap or the
triangle cap, and everything is reported after it.

| | baseline `D--` | bounded, n pinned at 12 `D--B` | escalating `D--B_E192` |
|---|---|---|---|
| stop reason | heap DRAINED | **triangle CAP** | time cap — still running |
| triangles | 885 400 | 4 521 424 | 2 249 776 |
| allocations | 1 716 752 / 9 M (19 %) | **9 000 000 / 9 M (100 %)** | **4 451 008 / 9 M (49 %)** |
| wall | 593 s | 1856 s | 3000 s (+ reporting) |
| rA evals | 1835 M | 3626 M | 9204 M |
| heap left | 0 | 5 182 239 @ 228 µm | 2 757 156 @ 417 µm |
| **no-op splits** | 0 | 87 832 | **0** |
| key-inversions | 111 992 | 1 002 064 | 481 336 |
| MAX | 4.999 (blind ruler) | 192.067 | 262.139 |
| p99 / p50 | 4.876 / 1.526 | 21.150 / 0.189 | 53.573 / 0.177 |
| over 0.01 mm | 0 / 885 k | 87 696 (1.94 %) | 68 541 (3.05 %) |
| watertight | yes | yes | **yes** (0 non-manifold, 0 seam-crack) |

**What this does establish.** The escalating lever removes the *specific* failure §7 hit: the pinned-n test
consumed the entire 9 M allocation budget in 1856 s, while the escalating test was still at 49 % of it after
3000 s. `no-op splits` fell from 87 832 to **0** — every pop now makes progress — and the mesh stayed
watertight throughout.

**What it does NOT establish, and must not be read as.** It did not converge. The heap is still 2 757 156
deep with a worst-left of 417 µm, which is *higher* than the pinned run's 228 µm — it is still finding bad
triangles, not running out of them. MAX 262 µm and 3.05 % over the bar are **mid-flight values on an
unconverged mesh**, not a fidelity verdict, and they are not comparable to the baseline's drained-heap
4.999 µm. Whether this run would have converged given hours more is exactly the question still open.

**So §7 remains untested.** Two of its three pre-registered clauses are now measured against the right
lever — the triangle count did NOT explode past budget (clause 2 does not fire), and no mechanism was added
— but clause 1 (H2 below 10 µm) cannot be evaluated on an unconverged mesh. The next run needs a wall budget
sized to convergence, not to a session.

### 15e. All-19 survivor projection with the GN screen — the certification tail falls 3x

Screened at n=192 on a deterministic 5 000-triangle stride sample per row (tol 10 µm, closure on), projected
to the full mesh. The **radial** column reproduces §12's published full-mesh rates — GeoStar 35.98 vs 35 %,
Gyroid 37.92 vs 37 %, BasketWeave 18.72 vs 19 % — which is what validates the sample.

| row | triangles | radial % | **+GN x3 %** | survivors radial | **survivors GN** |
|---|---|---|---|---|---|
| LowPolyFacet | 137 480 | 0.00 | **0.00** | 0 | **0** |
| SuperformulaBlossom | 160 600 | 0.50 | **0.18** | 803 | **289** |
| HarmonicRipple | 955 603 | 4.58 | **0.24** | 43 767 | **2 293** |
| HexagonalHive | 880 000 | 0.48 | **0.38** | 4 224 | **3 344** |
| FourierBloom | 533 521 | 6.18 | **0.52** | 32 972 | **2 774** |
| SpiralRidges | 763 322 | 14.36 | **0.80** | 109 613 | **6 107** |
| RippleInterference | 170 496 | 1.58 | **1.16** | 2 694 | **1 978** |
| BambooSegments | 324 801 | 6.98 | **1.44** | 22 671 | **4 677** |
| WaveInterference | 168 288 | 1.52 | **1.46** | 2 558 | **2 457** |
| SuperellipseMorph | 155 824 | 2.18 | **1.54** | 3 397 | **2 400** |
| DragonScales | 667 837 | 10.72 | **2.56** | 71 592 | **17 097** |
| ArtDeco | 241 720 | 3.16 | **2.96** | 7 638 | **7 155** |
| GyroidManifold | 1 132 314 | 37.92 | **5.64** | 429 373 | **63 863** |
| BasketWeave | 466 776 | 18.72 | **6.06** | 87 380 | **28 287** |
| Crystalline | 1 163 100 | 23.64 | **6.36** | 274 957 | **73 973** |
| CelticTriquetra | 1 714 638 | 16.64 | **6.36** | 285 316 | **109 051** |
| Voronoi | 806 765 | 21.36 | **11.22** | 172 325 | **90 519** |
| GothicArches | 1 979 816 | 29.64 | **12.98** | 586 817 | **256 980** |
| GeometricStar | 885 400 | 35.98 | **17.04** | 318 567 | **150 872** |
| **TOTAL** | **13.3 M** | | | **~2 456 664** | **~824 116** |

**3.0x fewer survivors overall**, and up to **19x** on individual rows (HarmonicRipple 4.58 -> 0.24 %,
SpiralRidges 14.36 -> 0.80 %, FourierBloom 6.18 -> 0.52 %). The outstanding CPU perpendicular pass therefore
drops from the ~1.9 h quoted in §12 to roughly **40 minutes**, without weakening the guarantee — every
survivor is still a triangle no sound bound could clear.

**The residual tail is now concentrated and interpretable.** Five rows carry 80 % of what is left —
GeoStar 150 872, Gothic 256 980, CelticTriquetra 109 051, Voronoi 90 519, Crystalline 73 973 — and they are
exactly the crease-class styles §14c showed converging linearly under refinement. The smooth rows are
essentially certified already: nine of nineteen now sit under 1.6 %, and LowPolyFacet is at zero.

### 14f. CORRECTION to 14b — the escalating lever is INERT under a budget cap, and §7 is properly refuted

§14b argued that the pinned `BND_N = 12` refused 84.8 % of triangles on sampling grounds and that this
"doomed the run to CAP before fidelity ever entered". **The first half is right and the second half is
wrong.** Measured, at an identical 300 000 triangle cap on GeometricStar:

| | n pinned at 12 | n escalating to 192 |
|---|---|---|
| triangles | 177 056 | 177 056 |
| MAX / p99 / p50 (µm) | 691.238 / 426.128 / 2.586 | **identical** |
| over 0.01 mm | 13 627 | **13 627** |
| worst-left / key-inversions / no-op splits | 1018.544 / 29 576 / 0 | **identical** |
| rA evals | 274 M | **1476 M (5.4x)** |
| wall | 101 s | 564 s |
| **heap left** | 221 351 | **188 057** |

The same holds at the full 9 M cap: the escalating run (`_E192b`, 6228 s, **16 325 M** rA evals against
3626 M) reproduces the pinned run's mesh to every printed digit — 4 521 424 tris, MAX 192.067, p99 21.150,
p50 0.189, 87 696 over tolerance, the same argmax locus and the same 519.3/403.8/485.9 µm edges — differing
**only** in heap-left, 5 182 239 -> 4 459 527.

**Why.** The escalation does exactly what it was built to do: it spares triangles whose bound clears once
they are sampled properly (33 294 here, ~723 000 at full scale). But those are by construction the
LOW-key triangles, and the loop is a max-heap that caps with millions still queued — so the spared triangles
were never going to be popped. Sparing them changes the queue and nothing else. **The budget is consumed
entirely by triangles whose WITNESS genuinely exceeds tolerance, which no amount of extra sampling can
rescue.** `splits` being identical across every run is likewise not evidence of anything: it is arithmetic,
`(triCap - initTris)/4`.

**Consequences, including for two of my own claims:**

- **§7 is REFUTED, now on solid ground.** §13 reached that verdict from a run whose lever was mis-implemented;
  the lever has now been implemented as §6 specified and the answer is unchanged. Better-driven acceptance
  does not close GeometricStar within 9 M triangles.
- **§14b's causal claim is withdrawn.** The sampling artifact is real — 84.8 % vs 23.3 % refusal — but it is
  measured on a CONVERGED baseline mesh, where witnesses are small and the covering term dominates. During a
  run from a coarse grid the witnesses are genuinely large, the early exit fires, and the artifact is
  irrelevant to the cap.
- **The `worstLeft ~ alloc^-0.58` scaling I fitted is withdrawn too.** It was taken from the early transient
  (1065 -> 390 µm, which is just the initial grid being cleared). Across the last 20 checkpoints `worstLeft`
  oscillates **233-491 µm with no trend** while the heap grows monotonically to 4 444 262. The late phase is
  not converging at any rate; it is treading water.

**What still stands, and it is the important part.** §14c measured the SURFACE, not this driver, and is
unaffected: chord error falls 1.45-3.2x per halving on every refuted style with no plateau, and at 20 µm
cells only 0.002-0.53 % of the wall is still over the bar. So the reconciliation is:

> The surface is density-closable at roughly 2 M targeted triangles. This driver spends 9 M and plateaus at
> ~350 µm. The ~100x gap between those two numbers is the driver's ALLOCATION efficiency — it refines
> broadly where the geometry needs it narrowly — and that gap, not a missing mechanism, is what the next
> attempt has to attack.

**Recommendation on the lever itself: keep it OFF by default.** `PF_CB_BND_NMAX>12` costs 5.4x the rA evals
for a byte-identical mesh. It remains valuable as an INSTRUMENT (it is what makes "this triangle is
genuinely unresolved" distinguishable from "this triangle was under-sampled"), but it is not a fix and it
must not ship as one.

### 15f. A TDR defect I introduced with the GN screen — chunking must count EVALS, not samples

Adding Gauss-Newton (§15d) silently broke the chunking that §12 had established as a *correctness*
requirement. `certifyMeshGpu`'s `chunkSamples` budget was written against the radial kernel, where one
lattice sample costs one `rA` eval. It is not 1 any more:

```
evalsPerSample  =  1 (centre)  +  4 (closure one-sided probes)  +  ~10 per GN iteration
                =  35  at closureEps>0, gnIters=3
```

So a chunk sized at "2e7 samples" became ~7e8 `rA` evals — far past the ~2 s Windows watchdog. **Measured:**
a cascade that chunked safely for years at radial lost the device on the *second* style, and all eight
after it died with `[Device] is lost` — the exact cascade failure §12 recorded and thought was closed.

Fixed by dividing the eval budget by the multiplier, so the chunk self-adjusts to whatever the kernel now
costs, and by re-acquiring the device between styles so one loss cannot poison the rest of a sweep.

**The lesson generalises beyond this file.** A safety limit expressed in the wrong unit stops being a safety
limit the moment the cost model changes underneath it. The budget is in `rA` evals because that is what the
GPU actually spends; `samples` was only ever a proxy that happened to be exact.

### 15g. §8's seven "not run" H1 cells are now filled — and they are far worse than their H2 values

§8 left the H1 column blank for the seven rows H2 had already refuted, noting only that they "can only move
down". They have now been measured with the independent CPU auditor (`PF_FT_H1=1 PF_FT_H2=0`, TOL 10 µm,
1200 s/row, TRUE PERPENDICULAR distance):

| row | **H1 witnessed** | certified UB | audited | exceedances | H2 (§5) | H1/H2 |
|---|---|---|---|---|---|---|
| **BasketWeave** | **651.879** | 1991.850 | **466 776 / 466 776 (100 %)** | 3 904 | 93.662 | 7.0x |
| CelticTriquetra | 572.734 | 858.890 | 574 311 / 1 714 638 (33 %) | 17 315 | 17.837 | **32x** |
| GothicArches | 362.888 | 372.763 | 443 467 / 1 979 816 (22 %) | 20 508 | 20.077 | 18x |
| Crystalline | 247.863 | 257.801 | 482 399 / 1 163 100 (41 %) | 23 422 | 10.302 | 24x |
| GeometricStar | 193.846 | 203.819 | 648 543 / 885 400 (73 %) | **122 305** | 12.675 | 15x |
| Voronoi | 170.970 | 180.871 | 153 695 / 806 765 (19 %) | 4 416 | 11.906 | 14x |
| GyroidManifold | 87.040 | 96.994 | 570 596 / 1 132 314 (50 %) | 4 381 | 17.299 | 5.0x |

**Every one is 5-32x worse in the mesh->surface direction than surface->mesh.** That is exactly the
asymmetry §8 predicted — a facet that SPANS a feature has its interior far from the surface while the
surface itself stays covered by neighbouring facets, so H1 sees it and H2 cannot — but the magnitude was not
known until now. GeometricStar is the starkest: **122 305 of 648 543 audited triangles (18.9 %)** exceed the
bar in H1, against 40 H2 samples out of 33.1 M.

**Two readings to get right.**

1. **BasketWeave is the only COMPLETE audit here** — 100 % of its triangles seen, 0 left uncertified — so
   651.879 µm is a genuine full-mesh witnessed max, not a floor. But its argmax is at **z = 120.000**, the
   ring's open top boundary, and the stage-3 global confirm's worst cases are all at z = 120.0000. So §5's
   "RIM ONLY" qualifier **survives in both directions** rather than being overturned. It still must not be
   quoted as a wall defect. (The distribution of all 3 904 exceedances is not established by this report —
   only that the extremes are at the rim.)
2. **The other six are floors**, audited at 19-73 % under a 1200 s cap, and each report says so. They can
   only get worse. The certified upper bounds are built from the per-triangle LOCAL estimate, which
   over-states, so `NOT CERTIFIED` on those rows may be pessimistic — CelticTriquetra's 858.890 and
   BasketWeave's 1991.850 in particular sit far above their witnessed values.

**What this does to the headline.** The trajectory in §0 was *19 claimed closed → 12 survive H2 → 5 survive
both*. The five survivors are unaffected. What has changed is the depth of the failure on the other
fourteen: the seven H2-refuted rows are not marginally over a 10 µm bar, they are **87-652 µm out** in the
direction that a plane-distance ruler is structurally blind to.

### 15h. THE COMPLETE TWO-DIRECTIONAL SCORECARD — all 19 rows, both directions, for the first time

§8 carried H1 for twelve rows and "not run" for seven. §15g filled the seven. Combining them, every row now
has a number in both directions. H2 from §5; H1 for the twelve from §8 (measured on the earlier path, whose
equivalence to the perpendicular ruler was checked on two rows in §12 and held exactly); H1 for the seven
from §15g (TRUE PERPENDICULAR, this session).

| style | H2 surface→mesh | H1 mesh→surface | clean BOTH? |
|---|---|---|---|
| LowPolyFacet | 5.000 | **10.000 PASS** | ✅ |
| SuperformulaBlossom | 4.997 | **10.000 PASS** | ✅ |
| SuperellipseMorph | 5.019 | **10.000 PASS** | ✅ |
| RippleInterference | 5.001 | **9.999 PASS** | ✅ |
| FourierBloom | 5.157 | **10.000 PASS** | ✅ |
| SpiralRidges | 5.151 | 10.602 | ❌ H1 |
| WaveInterference | 5.006 | 10.784 | ❌ H1 |
| HarmonicRipple | 5.997 | 13.963 | ❌ H1 |
| ArtDeco | 5.771 | 23.360 | ❌ H1 |
| BambooSegments | 7.457 | 35.039 | ❌ H1 |
| HexagonalHive | 5.555 | 40.260 | ❌ H1 |
| DragonScales | 8.853 | 63.177 | ❌ H1 |
| GyroidManifold | 17.299 | **87.040** | ❌ BOTH |
| Voronoi | 11.906 | **170.970** | ❌ BOTH |
| GeometricStar | 12.675 | **193.846** | ❌ BOTH |
| Crystalline | 10.302 | **247.863** | ❌ BOTH |
| GothicArches | 20.077 | **362.888** | ❌ BOTH |
| CelticTriquetra | 17.837 | **572.734** | ❌ BOTH |
| BasketWeave | 93.662 (rim) | **651.879** (rim, 100 % audited) | ❌ BOTH (rim-located in both) |

**Five clean, seven H1-only failures, seven failing both.** The five survivors are the same five §0 named,
and nothing in this session has moved them.

**The structure of the failure is now legible.** Read down the H1 column: it rises monotonically through
three regimes.

- **≤ 10 µm (5 rows)** — smooth styles, genuinely clean in both directions.
- **10-63 µm (7 rows)** — H2 passes, H1 fails. These are facets SPANNING features: the surface stays
  covered so H2 sees nothing, while the facet interior sits far from it. Every one of these rows would have
  been declared closed by any surface→mesh ruler alone.
- **87-652 µm (7 rows)** — fails both. Exactly the sharp-locus taxonomy: ridge networks, cell bisectors,
  star tips, facet edges, arch ribs, snaking strands, θ-jumps.

**The single most important line for a reader is the H1/H2 ratio**, which runs 5x-32x on the bottom seven.
A ruler that measures only surface→mesh does not merely under-report on these styles — it under-reports by
more than an order of magnitude, and it does so WORST on exactly the styles the campaign cares about. That
is the quantitative form of the §1 argument, and it is now measured on all nineteen rows rather than argued.

**Caveats carried forward, not buried.** Six of the seven new H1 numbers are floors (19-73 % audited under a
1200 s cap); only BasketWeave is complete. The twelve older H1 values are stage-3 globally confirmed. Every
H2 value is a witnessed lower bound whose blind spot is bounded per style by §15b — and for the nine styles
listed there with zero cells over the bar, that blind spot is smaller than the bar.

### 15i. Corrections from external review (2026-07-28)

**(a) §15e's projection does NOT describe the sweep that is running, and the ~40 min CPU estimate is void.**
§15e computed 2.46 M → 824 k survivors and "~1.9 h → ~40 min" at **gnIters=3 with n=768 in the cascade**.
The live sweep runs **gnIters=2, levels=[12,48,192]**. Both changes move survivors UP and neither is
quantified: dropping 768 converts every triangle that needed it into a survivor, and §15d measured Gyroid at
14.73 % (GN×1) and 5.83 % (GN×3) — the ×2 point is unmeasured, on precisely the row that keeps improving to
the third step. **The resulting table is therefore not comparable to the projection it was meant to
validate.** Early rows are consistent with that: RippleInterference 1.33 % and SuperellipseMorph 1.64 %
against §15e's 1.16 % and 1.54 %.

**(b) The H1/H2 ratio column in §15h is INDICATIVE, not a measured multiple.** Every H2 value in §5 is a
refinement-truncated floor, and six of the seven H1 values in §15g are floors audited at 19-73 %. A ratio of
two independent lower bounds is not a measurement. The qualitative finding is what is supported and it is
strong enough on its own: **the refuted rows are 87-652 µm out, not marginally over a 10 µm bar.** Read the
column as "H1 is very much larger", never as "32x".

**(c) BasketWeave's 651.879 µm is more likely a RULER-DOMAIN artifact than geometry.** The auditor's surface
model is the **outer wall** — that is why the sweep script uses Gothic's ring file rather than its solid.
BasketWeave's H1 argmax sits at **z = 120.000**, exactly the ring's open top boundary, and every case in the
stage-3 global confirm is at z = 120.0000. An open boundary row is where the auditor's domain ends, so the
distance it reports there is not necessarily a defect in the mesh. Settling it needs either a re-measure on
the SOLID stage (which caps the rim) or an explicit exclusion of the boundary row. **Until then, BasketWeave's
H1 number should not be quoted as a wall defect in either direction** — consistent with §5's H2 caveat, and
now for a sharper reason than "it is at the rim": the ruler may not be entitled to an opinion there.

**(d) The chunking cost model is not a time proxy, and adaptive chunking replaces it.** §15f budgeted
dispatches in `rA` evals rather than samples, which was a real improvement — but the model is still wrong by
~6x in either direction. Derived from two completed rows at identical settings: RippleInterference implies
**138 M model-evals/s**, LowPolyFacet **867 M** — the latter 5x above the measured 164 M/s hardware peak, so
the model cannot be predicting time. Both the review's proposal to raise the budget 10x and this author's
counter-arithmetic that doing so would trip the watchdog were computed from that same broken proxy, and
neither was entitled to a conclusion. `certifyMeshGpu` now steers dispatch size by **measured wall-time**
(`targetMs`, default 400 ms) with growth capped at 2x per step; `chunkSamples` only seeds the first dispatch.
Self-calibrating per style, per kernel and per GPU — no cost model required to be correct.

### 15j. OPERATIONAL: never edit a dev-server-served file while a browser-side job is running

The sweep died mid-row and the stall watchdog caught it. Cause: **editing `research/gpu/gpuRuler.js` while
the sweep was using it.** Vite HMR reloads the page on any change to a served file, so the edit destroyed
the loop it was meant to improve. `window.__cert` was gone; the checkpoints in localStorage survived.

This is the same shape as the earlier loss — a long job depending on state that something else can move
underneath it — and it has a simple rule: **while a browser-side job is running, do not touch anything under
the dev server's root.** Queue the edit, or accept that it restarts the run. Node-side background jobs are
immune (vitest reads the file once at launch); browser jobs are not.

Second lesson, from the same incident: the stall watchdog fired at 264 s, and was RIGHT — but a false
positive had already occurred earlier from a **timezone mismatch** (sink stamped UTC, shell read local), and
Chrome throttles `setInterval` in hidden tabs. So a heartbeat gap is a HINT, never proof of death. The
threshold is now 8 minutes and the trustworthy signals are the event lines (ROW-DONE / ROW-ERR / HALTED),
not the pulse. Verify a suspected stall by querying the page, not by trusting the timer.

### 15k. A FALSE-PASS bug I introduced into the auditor, and the test that caught it

Making dispatch chunking adaptive (§15i-d) produced a genuine ~42x speedup **and** a correctness bug:

```js
for (let base = 0; base < curN; base += maxTri) {   // header reads maxTri AFTER the body mutated it
  const cnt = Math.min(maxTri, curN - base);        // batch sized by the OLD value
```

Cursor and batch disagree. Shrinking re-screens triangles; **growing SKIPS them — and a skipped triangle
never enters `survivors`, so it is silently reported as CERTIFIED.** A false PASS, introduced into the
instrument whose entire purpose is catching false passes. Fixed to a `while` loop advancing by `cnt`, the
count actually processed.

**What caught it was not code review.** Chunking is pure batching, so it cannot legitimately change a
survivor count — and it did: SuperellipseMorph read 3927 where the fixed-chunk run read 2563, and
RippleInterference 2418 against 2270. Same signal as every other defect in this campaign: two measurements
that must agree, disagreeing.

**The regression test, now the standing gate for this code path.** Run both paths on the same input and
assert equality of the RESULT, not merely that the fast path completes. The slow path stays callable for
exactly this (`targetMs: 1e9, maxTriCap: <fixed>`):

| row | reference (pre-bug fixed chunk) | adaptive | fixed re-run | adaptive wall | fixed wall |
|---|---|---|---|---|---|
| RippleInterference | 2 270 | **2 270** | 2 270 | **13.0 s** | 555.9 s |
| SuperellipseMorph | 2 563 | **2 563** | 2 563 | **13.9 s** | ~569 s |

Byte-identical, 42x faster. The external review was right that large headroom existed at n<=192 and right
that deferring it was wrong; it was wrong about the lever (a 10x larger constant, justified by the same
eval model §15i-d shows is off by 6x). Closing the loop on measured time finds the headroom without needing
the model to be correct — but it must be paired with the invariant assertion above, because a fast
instrument that can miscount is worth less than a slow one that cannot.

**All twelve rows of the sweep that ran on the buggy loop are VOID** and are not recorded anywhere as
results. Only the pre-bug fixed-chunk values stand: LowPolyFacet and SuperformulaBlossom CERTIFIED with
0 survivors, RippleInterference 2 270, SuperellipseMorph 2 563.

## 16. REF_HS — the driver's ranking pitch fixes CONVERGENCE, not FIDELITY

Pre-registered before the run: the driver ranks with `sagAdaptive` at `REF_HS=0.15, NMAX=24`, which on the
1.185 mm triangle that carries GothicArches' true worst error gives `n=8` — a **148 µm sample pitch**,
coarser than a Gothic rib. Falsifier stated in advance: *if that triangle survives unrefined at a finer
pitch, pitch is not the mechanism and the infinite-plane term is.*

Run: `PF_CB_REF_HS=0.03 PF_CB_REF_NMIN=12 PF_CB_REF_NMAX=64`, GothicArches ring, DIRECTED, 6 M cap
(`_REF003`). The same triangle now gets `n=40`, a 30 µm pitch.

### What it changed — real, and structural

| | baseline `D--` | **REF003** |
|---|---|---|
| stop reason | ruler satisfied, budget left | **heap DRAINED to 0** |
| triangles | 1 979 816 | **1 493 004** (−25 %) |
| allocations | 3.90 M / 6 M (65 %) | **2.93 M / 6 M (49 %)** |
| wall | 1468 s | **1048 s** |
| rA evals | 1679 M | **1110 M** |
| own-ruler MAX | — | 7.858 µm PASS, 0 / 1 493 004 over bar |
| watertight | yes | yes |

**This is the only run in the whole campaign whose heap drained.** Every other one — baseline, bounded,
escalating — grew its queue monotonically and stopped by cap or clock. That is a fact about the driver and
does not depend on any ruler being accurate.

### What it did NOT change — measured at FULL coverage by the independent screen

| | baseline | REF003 |
|---|---|---|
| triangles | 1 979 816 | 1 493 004 |
| **uncertifiable** | **263 939 (13.33 %)** | **275 906 (18.48 %)** |

**REF003 is WORSE.** More uncertifiable triangles in absolute count (+11 967) despite a quarter fewer
triangles, and a 39 % higher rate. Same screen, same settings, both meshes, 34 s each.

**So: converging and being right are different properties, and this session conflated them.** A finer
ranking pitch made the driver's ruler self-consistent enough to declare itself finished — and it finished on
a mesh a larger fraction of which cannot be certified. The falsifier resolves against pitch: it was a real
constraint on CONVERGENCE, and is not the mechanism behind the FIDELITY failure.

### A sampling trap that would have produced the opposite headline

CPU H1 on the REF003 mesh reported **7.051 µm, 0 exceedances** — against the baseline's 362.888 µm. On
**2.2 % of the mesh** (32 349 / 1 493 004), almost certainly index-ordered and therefore one spatial region.
The baseline needed 22 % coverage before its worst triangle appeared. Reported as a verdict, that number
would have read "GothicArches closed by a one-line config change"; 34 s of full coverage contradicts it.
**H1 coverage percentages must be quoted with every H1 number** — §15g's rows range from 19 % to 100 %.

Note also what is NOT the defect: REF003 still contains 1.6 mm triangles measuring ≤ 7 µm, because they sit
on locally flat wall. Size is not the problem. **Spanning is.**

## 17. THE SLIVER CENSUS — a shape defect no distance ruler was measuring

Prompted by a user render of `gothicarches_ring_D--_REF003.stl` showing sharp facet spikes fanning along a
crease, with the note that **every STRATA-001 mesh has them**. Measured directly from the STLs
(min angle per triangle, and aspect = longest edge / 2·inradius):

| mesh | <20° | <5° | **<1°** | worst angle | worst aspect |
|---|---|---|---|---|---|
| GeometricStar | 60.3 % | 31.6 % | **14.44 %** | **0.00002°** | **3 567 552** |
| GothicArches baseline | 58.3 % | 19.9 % | 3.05 % | 0.0027° | 21 711 |
| GothicArches REF003 | 57.1 % | 18.2 % | 2.46 % | 0.020° | 2 914 |
| **LowPolyFacet** | 29.1 % | 0.46 % | **0.00 %** | **3.66°** | **23.3** |

GeoStar's worst triangle has edges **0.5 / 561.2 / 560.6 µm** — a half-micron edge against half-millimetre
ones, and 70 344 of its triangles (7.9 %) are under 0.1°. Those are the rendered spikes.

**LowPolyFacet is the control and it is decisive.** It is the ONLY row that fully certified (0 survivors,
every triangle) and the ONLY row with zero triangles under 1° and an aspect ratio in double digits rather
than millions.

**Why every distance ruler missed this.** `sagOfN` measures distance to the triangle's INFINITE PLANE. At
0.00002° the normal is numerically meaningless, so the ruler is not under-sampling these — it is computing a
garbage quantity and ranking on it. No pitch refinement can fix that, which is exactly why REF003 improved
everything except this (58.3 % → 57.1 % under 20°).

**Suspect in the driver**, stated as a hypothesis to test rather than a finding: `refineDirected` splits the
edge of largest chord sag rather than the longest edge, abandoning LEPP's quality guarantee — and when its
aspect-guarded pass fails it explicitly **drops the guard and splits anyway**
(`// drop the guard`, `_strataConformBisect.test.ts`).

**The correlation worth testing next.** GeometricStar has **122 305** H1 exceedances (of 648 543 audited)
and **127 864** triangles under 1°. If the exceedance set largely IS the sliver set, then the seven refuted
rows need a mesher that does not emit needles — not per-style conforming machinery — and the unwired
M=g/h² surface-metric work (recorded at GeoStar 18.2 % → 5.8 % under 20°) is the existing lever.

# STRATA-001 RE-AUDIT — the "19/20 closed" scorecard, re-measured by an independent two-sided ruler

**Status: H2 sweep COMPLETE, all 19 rows, plus an exceedance census locating every failure.**
12 within tolerance, 7 over the 0.01 mm bar — of which **6 are genuine interior defects and 1
(BasketWeave) is confined to the ring's open rim row**. H1 certificates: 2 done, 17 pending a second pass.
Every refuted number is a *floor* (refinement truncated), so those rows can only get worse.

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

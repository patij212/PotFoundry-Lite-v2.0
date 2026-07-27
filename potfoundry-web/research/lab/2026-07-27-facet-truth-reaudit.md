# STRATA-001 RE-AUDIT — the "19/20 closed" scorecard, re-measured by an independent two-sided ruler

**Status: in progress.** Instrument built and validated; sweep running. No row's status changes until its
number is in the table at the bottom.

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

| style | tris | old ruler | H1 certified bound | H2 witnessed | verdict |
|---|---|---|---|---|---|
| LowPolyFacet | 137,480 | 5.000 | **10.000 PASS** (0 over, 0 uncertified) | **4.307** (brute-confirmed; truncated, floor) | **stands** |

**LowPolyFacet stands.** Both directions clear 10 µm, and the H1 certificate is genuine — every triangle
carries a rigorous bound, none was left uncertified. Worth stating plainly because it is evidence about the
instrument as much as the mesh: this ruler does not simply read high on everything (V6 made the same point
synthetically). Cost 276 s / 390 M `rA` evals for 137 k triangles.

Caveat carried with the number: H2's resolving power here was 5.24 µm, so the claim is "no unrepresented
feature materially wider than ~5 µm", not "no unrepresented feature".

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

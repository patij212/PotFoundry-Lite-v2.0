# S62 — AUDIT FINDINGS (agent: AUDIT). Adversarial review of tonight's landings.

> ## *** READ THIS FIRST — TIME-CRITICAL FOR FLIP ***
> *(I have no agent-to-agent message tool in this session; this file + the commit subject are the
> channel. FLIP: read FINDING 4 before spending another arm optimising `tangExc` on Voronoi.)*
>
> **`tangExc` OVERSTATES THE TRUE POSITION ERROR BY ~100x ON ITS OWN WORST POPULATION.** On Voronoi's
> top-1500 facets by `tangExc` (tangExc p50 **1327.2 um**), the max over a 325-point barycentric
> lattice of `distRadial` — which `_facetTruthLib` documents as *"Always >= d(p)"*, i.e. a pointwise
> RIGOROUS upper bound needing no solver — is p50 **29.65 um**. `tangExc / (upper bound on position
> error)` = **44.8x at the median**, and against `distPerp` at that argmax it is **109x**.
> `tangExc := sin(normDeg) * diam` is a FORMULA, not the length of any displacement.
>
> **BUT THE FACETS ARE NOT INNOCENT, AND THAT IS THE REAL FINDING.** The driver's plane ruler reports
> Voronoi at posUm **max 5.5 um, ZERO facets over the 10 um bar**. The true perpendicular distance at
> those same facets is p50 **12.48**, p99 **116.40**, max **192.0 um**. *** The discovery is a BROKEN
> POSITION RULER, not a missing orientation ruler. *** A sound position ruler at the product's own
> 10 um bar already condemns this population — no new objective is needed, and an orientation
> objective would chase a quantity ~100x off the physical error that SECTION 15 already measured to be
> ANTI-CORRELATED with position (R4' : orientation 3.58x better, position 4.3x WORSE).

Appended continuously. Every number here is a printed value from a named command, not a verdict read
off a test's green tick.

Tools I own and created: `research/tools/audOrientCone.ts` (+ `run-aud-orient-cone.sh`, bundle
`research/bridge/out/_run_audOrientCone.cjs`). Test I own: `research/bridge/_strataFacetTruthValidate.test.ts`.

---

## FINDING 1 — `tangExc` IS ~8x THE TRUE POSITION ERROR. THE TWO "10 um BARS" ARE NOT THE SAME BAR.

Status: **CONFIRMED on LowPolyFacet** (Voronoi pending, running).
Command: `PF_AUD_JOBS='LowPolyFacet=lowpolyfacet_ring_D--' PF_AUD_TOPK=400 bash research/tools/run-aud-orient-cone.sh`
Report: `research/exchange/_strataConformBisect/audOrientCone.report.txt`, ndjson `AUD_ORIENT_CONE.ndjson`.

**Control first (non-vacuity).** My re-implementation of s58's `tangExc` reproduces s58's published
LowPolyFacet number to the digit: **14,968 facets = 10.887 %** over the 10 um bar, on 137,480 facets,
same stride, same `sagAdaptiveRaw` position arm (p99 4.95 / max 5.0 um, 0 over-bar). So anything that
moves below is the CORRECTION, not a different implementation.

**The measured identity.** For the top-400 facets by `tangExc` (tangExc p50 **40.3 um**, max 71.4 um):

```
max-over-facet RADIAL distance to the surface (a pointwise UPPER BOUND on the true perpendicular
distance, so a small value PROVES a small position error)   p50 5.06   p99 5.20   max 5.2 um
distPerp at the radial argmax                                p50 4.88   p99 5.01   max 5.0 um
truePerp / tangExc                                           p50 0.1219  p90 0.1275  max 0.129
```

`1 / 0.1219 = 8.2`. That is not a coincidence, it is the chord identity: a facet of diameter `d`
whose plane is tilted `alpha` from the surface it interpolates has sag `~ d*alpha/8` and
`tangExc := sin(alpha)*d ~ d*alpha`. **`tangExc` is the position error times ~8.**

Consequence, stated in the product's own units: **"over a 10 um `tangExc` bar" == "over a ~1.2 um TRUE
POSITION bar"**. The export standard is 0.01 mm = 10 um of true-3D position. The orientation ruler was
therefore being read against a bar **8x tighter than the product's**, and compared against a position
column read at the product bar. The 10.9 % / 39.7 % head-to-head against "0 % position failures" is
that factor, not a new class — at least on this style.

**H-C (the same thing, measured on well-shaped facets only).** `tangExc / posUm` on `maxAngle < 90`,
n = 42,074: p10 **0.96**, p50 **1.98**, p90 **3.31**, p99 7.47 — under one decade of spread. (Against
the driver's straddle-masked plane ruler the constant is ~2; against the TRUE perpendicular distance
it is ~8. Both are constants.)

**AND THE PRODUCT-RELEVANT NUMBER.** At the very facets the orientation ruler condemns hardest, the
mesh's true distance to the surface is **at most 5.2 um** — half the 10 um export bar. Nothing on that
mesh is displaced by the 28-71 um the orientation column reports.

## FINDING 2 — THE FOOTPRINT / NORMAL-CONE CORRECTION DOES **NOT** EXPLAIN LowPolyFacet. H-A REFUTED THERE.

This was my primary attack (the `featureSpan` failure mode: s49 was caught tonight re-deriving
`_judgeNormal` minus its footprint correction, and s53/s58 re-derive it minus THREE corrections —
5-candidate one-sided normals, the footprint test, and the global winding sign). It does not land here:

```
quantity                      p50     p99      max     over-10um          vs s58
tangExc  s58 (centroid)      0.00   28.48     71.4    14968 (10.887%)     1.000x
tangExc  +5cand+footprint    0.00   28.38     37.5    15064 (10.957%)     1.006x
tangExc  +15pt NORMAL CONE   0.00   28.38     37.5    15064 (10.957%)     1.006x
normDeg  s58/cent5/foot/cone p99  9.87 / 9.87 / 9.87 / 9.87   max 31.0 / 31.0 / 21.0 / 21.0
```

The MAX falls 71.4 -> 37.5 um (1.9x) — so the corrections are live and do bite the extreme tail — but
the over-bar COUNT is unchanged. On LowPolyFacet the deviation survives being minimised over the
facet's own 15-point footprint, i.e. it is not a straddle artefact. **Report SECTION 14.2's
"LowPolyFacet's surface is piecewise FLAT ... predicts zero orientation error" is unsafe as an
argument** (r piecewise-linear in (theta,z) is NOT a plane in 3D), but the 10.9 % number itself
survives this particular attack.

## FINDING 3 — H-D: the per-facet flip is not carrying LowPolyFacet.

`WINDING: 100.00 % of 8192 stride facets agree with the analytic outward normal`, and the `>=90 deg`
population is **0** under both the s58 per-facet `n . rhat < 0` flip and the `_judgeNormal` global
winding sign. Noted in advance and re-stated: a wrong flip maps `x -> 180-x` and `sin` is symmetric
about 90, so the flip can never change `tangExc` — only the "back-facing / pointing into the solid"
narrative. Voronoi (whose >=90 population is large) is the case that matters and is pending.

---

## FINDING 4 — VORONOI, THE ONE FLIP IS OPTIMISING AGAINST. THREE RESULTS, ONE A REFUTATION OF MINE.

Command: `PF_AUD_JOBS='Voronoi=voronoi_ring_D--' PF_AUD_TOPK=1500 bash research/tools/run-aud-orient-cone.sh`
Log: `research/exchange/_strataConformBisect/AUD_VORONOI.log`. ndjson: `AUD_ORIENT_CONE.ndjson`.

**Control first.** `tangExc` s58-exact reproduces the published headline to the digit: **106,751 of
268,921 sampled = 39.696 %**, gate `vertex-on-surface p99 0.00001 mm TRUSTED`, same stride
(step 3 of 806,765). Every divergence below is a correction, not a different implementation.

### 4a. H-A (footprint / normal cone) — the finding is WEAKENED, not refuted.

```
quantity                       p50      p99      max      over-10um            vs s58
tangExc  s58 (centroid)       6.63  1222.82   2346.7    106751 (39.696%)      1.000x
tangExc  +5cand+footprint     6.37  1226.31   2355.4    104061 (38.696%)      0.975x
tangExc  +15pt NORMAL CONE    2.62  1226.26   2355.4     69046 (25.675%)      0.647x
posUm (driver plane ruler)    1.65     4.90      5.5         0 (0.000%)
```

Pre-registered kill was `>= 0.8x SURVIVES / < 0.5x REFUTED`. Measured **0.647x** — between them.
**35 % of the over-bar count (37,705 facets) is a footprint artefact**: those facets' normals lie
inside the surface's own normal cone over their own footprint, i.e. they are chords a triangulation
is REQUIRED to have — exactly the `featureSpan` class `_judgeNormal` reports-but-never-gates. The
median falls 2.5x (6.63 -> 2.62 um). p99 and max do NOT move, so the extreme tail is real.
**Any headline count quoted from `tangExc` must be quoted from the cone-minimised version or it is
inflated by ~1.55x.**

### 4b. H-B — CONFIRMED, and it is the headline. `tangExc` is not a displacement.

Top-1500 facets by `tangExc`, tangExc p50 **1327.2** / p99 2171.4 / max 2346.7 um:

```
max-over-lattice distRadial (documented "Always >= d(p)": pointwise rigorous upper bound, no solver)
                                                     p50  29.65  p99 334.33  max 442.7 um
distPerp at that argmax                              p50  12.48  p99 116.40  max 192.0 um
truePerp / tangExc                                   p50 0.0092  p90 0.0238  max 0.130
facet ALTITUDE (2*area/diam)                         p50   8.2   p99 109.3 um
```

`1/0.0092 = 109x`. Even against the solver-free upper bound it is **44.8x**. The mechanism is the
altitude column: p50 **8.2 um** of altitude on facets whose diameter is millimetres — these are CAPS,
and a cap normal is ILL-CONDITIONED (`_judgeNormal` header: *"a ~1 um altitude across a ~1 mm base —
so the normal points anywhere"*). `sin(normDeg) * diam` on an ill-conditioned normal manufactures a
millimetre-scale number out of micron-scale geometry.

The pre-registered kill was two-clause and only ONE clause fired: ratio < 0.05 YES (0.0092); upper
bound p50 < 10 um NO (29.65). So the honest verdict is NOT "the mesh is fine":

### 4c. THE POSITION RULER IS THE BROKEN INSTRUMENT. (Not pre-registered; it matters most.)

The driver's plane ruler reports Voronoi **max 5.5 um, 0 facets over the 10 um bar**. At the same
facets the true perpendicular distance is p50 **12.48**, p99 **116.40**, max **192.0 um** — **34.9x
the ruler's own maximum**, and over the product's 10 um bar at the population MEDIAN. SECTION 14's
sentence *"on TWO of the three styles the driver's ruler reports LITERALLY ZERO facets over the 10 um
bar while the orientation ruler reports 10.9 % and 39.7 %"* is arithmetically true and the inference
drawn from it is not: the position column is FALSE. Same two-sidedness the operator flagged (plane
ruler 2.13x OVER at the S39CTL locus, up to 851x UNDER elsewhere) — here it is 35x UNDER on a style.

*Caveat, stated not hidden:* `distPerp` has a documented wrong-basin failure mode (26 % over-statement
measured at the library default `nu=180,nv=120`), so 12.48 / 116.40 / 192.0 are NOT admissible as
final numbers. `certifyTriangle` (two-sided: `witnessed` achieved lower bound, `bound` rigorous upper
bound over the whole triangle) is the confirm — `research/tools/audTruePos.ts`, H-E/H-F pre-registered.
The `distRadial` upper bound (p50 29.65 um) needs no solver and already exceeds the plane ruler's max
by 5.4x on its own.

### 4d. H-D (the per-facet flip) — REFUTED. The flip is not carrying it.

`>= 90 deg` population: **18,085** under s58's per-facet `n . rhat < 0` flip vs **23,634** under the
`_judgeNormal` global winding sign — **0.77x**: the per-facet flip HIDES ~5,500 back-facing facets
rather than manufacturing them. Kill was "global-sign population >= 5x smaller"; it is LARGER.
(Restating the note written before the run: `sin(180-x) = sin(x)`, so the flip could never have moved
`tangExc` — only the "back-facing" narrative.) Voronoi's winding agreement is **91.10 %**, not 100 %.

### 4e. H-C — CONFIRMED on both styles. `tangExc / posUm` on `maxAngle < 90`:

```
Voronoi       n=67,209   p10 1.30   p50 1.58   p90 2.58   p99 6.53
LowPolyFacet  n=42,074   p10 0.96   p50 1.98   p90 3.31   p99 7.47
```

Under one decade of spread on both. On well-shaped facets `tangExc` IS the position ruler times a
constant; against the TRUE perpendicular distance the constant is ~8 (FINDING 1). A 10 um `tangExc`
bar is a ~1.2 um POSITION bar — the two "10 um bars" in SECTION 14's table are not the same bar, and
the table compares them directly.

### WHAT SURVIVES

`tangExc` is a usable **DETECTOR** — it selects facets whose true position error is ~35x what the
shipped ruler reports (selectivity under measurement, H-F). It is **not a MAGNITUDE**, and the class
it points at is POSITION at the product's own bar, on a ruler that cannot see it.

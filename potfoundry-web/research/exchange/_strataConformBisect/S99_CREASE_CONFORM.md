# S99 — THE CREASE CLASS: WHY OVER-BAR AREA STILL SPANS CREASES

**Owner: the CREASE class** (S93's partition of the over-bar orientation AREA:
FOLDED 0.57% / 2.48%, **CREASE 0.39% / 0.11%**, SMOOTH-TURNING 99.04% / 97.41%, Gothic / Voronoi).

Tools: `research/tools/s99CreaseCensus.ts` + `run-s99-crease-census.sh` (read-only census; no production
code, no flag, no mesher run). Meshes: `gothicarches_ring_DS-HT_S39CTL.stl` (primary),
`voronoi_ring_D--H_S94CTL.stl`.

---

## PRE-REGISTRATION — written before the census was run

Four hypotheses, four kill lines. **H-C1 is a precondition**: the number the brief asks me to explain
(0.39% / 0.11%) was measured with an instrument whose own docstring says it cannot measure it, so the
class must be re-sized before it can be attributed.

| id | hypothesis | KILL LINE (pre-registered) |
|---|---|---|
| **H-C1** | S93's CREASE share is an under-count, because `kinkDeg > 1` fires only when a k=8 lattice point lands within `hArc = 2e-4 mm` of the crease | **REFUTED if** the h-free detector's crease-crossing share of over-bar AREA is **≤ 2×** the `kinkDeg>1` share on the SAME facets (≤0.78% Gothic / ≤0.22% Voronoi) |
| **H-C2** | (a) DETECTION — the driver's own locator `locateKinkRaw` fails to find a substantial share of the genuine crossings | **REFUTED as the dominant cause if** `locateKinkRaw` fires (non-null) on **≥95%** of segments where the h-free detector reports `turnFine > 1°` |
| **H-C3** | (b) PLACEMENT — edges land NEAR the crease, not ON it | **REFUTED as the dominant cause if** the area-weighted **median** distance from the crossing to the nearest facet vertex is **> 10% of the facet diameter** (i.e. the crossings are spread over the edge, so nothing is being aimed at the crease at all) |
| **H-C4** | (d) — the "crease" is a genuine 1-D C0 locus, not a 2-D high-curvature region | **REFUTED (⇒ (d) CONFIRMED) if** the two-sided turn is **not** invariant under a 256× shrink of the offset: `turnFine/turnCoarse < 0.8` on the majority of the crossing AREA |

Ruler discipline enforced: the plane ruler `sagAdaptiveRaw` is never used as a verdict (it appears only
as the driver's own accept quantity, quoted as such); orientation levels come from
`orientRuler.orientOfFacet` (k=8, inset 0.02, `orient:'outward'` with the 2026-08-06 analytic-normal
sign fix), never from `normAngOf`; every population is reported by COUNT **and** AREA.

---

## THE INSTRUMENT, AND A DEFECT IT FOUND IN THE SHIPPED ONE

### The h-free crease detector

A crease is a JUMP in the normal field. Along a probe segment of length `L`, at offset `d` either side
of the located feature:

```
smooth patch :  angle( n(s*-d), n(s*+d) )  ~  2*kappa*d   ->  0   as d -> 0
C0 crease    :  angle( n(s*-d), n(s*+d) )  ->  the DIHEDRAL, INVARIANT in d
```

`s99CreaseCensus.makeProbe` (i) coarse-scans the segment for the adjacent pair of normals that differ
most, following the **top 2** brackets so a large smooth turn elsewhere cannot mask a smaller crease;
(ii) bisects on the Gauss map with the finite-difference half-width tied to the bracket (`h =
bracket/32`) so no probe window ever straddles the feature; (iii) measures the **two-sided** angle on a
ladder `d = dMax · 2^{0,-2,-4,-6,-8}` (a 256× shrink) with `h = d/32`, so even a **2.5°-oblique**
crossing is resolved one-sidedly. `turnFine` IS the dihedral; `turnFine/turnCoarse` is the (d)-test.

**A crease lying ALONG the probe reads ~0.** That is the contract, not a defect: it is exactly what
separates "this edge CROSSES a crease" (spanning, bad) from "this edge LIES ON a crease" (conforming,
good). Facet-edge endpoints are inset by 5% so a vertex sitting *on* a crease is not counted as a
crossing.

### Self-test: 15 two-sided bars on closed-form fixtures — ALL PASS

| fixture | bar | measured |
|---|---|---|
| F1 z-wedge, crease at the exact probe midpoint | z = 60 ± 1e-4 mm; dihedral = 2·atan(0.5) = 53.1301° ± 0.01; ladder ratio = 1 ± 0.01 | 60.0000 / **53.1301** / 1.00000 |
| F1b same wedge, crease off-centre | dihedral 53.1301° ± 0.01 | 53.1301 |
| F2 exact cylinder (analytic smooth reference) | turnCoarse = 2·2⁻⁶·L/R₀ ± 1e-6 rad; turnFine = 2·2⁻¹⁴·L/R₀ ± 1e-8; ratio = 2⁻⁸ ± 1e-6 | **exact to every digit asserted** |
| F2b narrow smooth bump, tight probe | ratio < 0.02 (classed SMOOTH) | 3.93e-3 |
| F3 crease ALONG the probe | turn = 0 ± 0.02° | 0.00000 |
| F3 same crease ACROSS the probe | 53.1301° ± 0.01; θ located ± 1e-6 rad | 53.1298 / 1.000000 |
| F4 WEAK crease (dihedral 1.146°) | 2·atan(0.01) = 1.14588° ± 0.005; ratio 1 ± 0.02 | **1.14588** / 1.00000 |
| F5 OBLIQUE: 45° vs perpendicular vs ~8°-shallow probes of the SAME crease | all three equal ± 0.02–0.05° | 45.9793 / 45.9795 / 45.9797 |

### ⚠ AND A SIXTH INSTRUMENT DEFECT, IN THE SHIPPED `orientRuler.locateTurnAdaptive`

Fixture F1 puts the crease at the **exact midpoint** of the probe. `locateTurnAdaptive` then returns
**26.5651° = exactly 0.5000× the true 53.1301° dihedral**, and on the symmetric smooth bump (F2b) it
returns **2.7e-5°** for a feature whose real turn is 0.056°. Cause: its bisection compares
`ang(n0,nm)` against `ang(nm,n1)`, and on the symmetric tie the `>=` sends `hi = mid`, planting a
bracket endpoint **on** the crease, where a central difference returns the AVERAGE of the two one-sided
normals. This is the S74 "walks to the LEFT END" defect re-appearing in the *symmetric* configuration —
which S74's own fixture (crease deliberately off-centre, F1b here, where the two agree to 5e-2°) does
not exercise.

Consequence for this campaign: **a conforming mesher's crease crossings are disproportionately near the
middle of an edge** (that is what `SNAP_ALPHA = 0.12` enforces — see below), so this is the *most*
likely configuration, and any S74-derived "turn" reading on a real mesh is a coin-toss between the
dihedral and half of it. `orientRuler.ts` is **not patched here** — it is a shipped instrument that
other running jobs share, and this is a read-only census. The defect is reproduced by the fixture and
recorded.

---

# THE ANSWER IN ONE PARAGRAPH

**It is (b) PLACEMENT — but the CAUSE is not a placement inaccuracy, it is that the DEMAND IS NEVER
RAISED.** The driver's own locator finds **98.9%** (Gothic) / **98.3%** (Voronoi) of the genuine crease
crossings and locates them to **6.3e-7 of the edge**, so (a) DETECTION is refuted outright. The crossings
are genuine 1-D C0 loci — the two-sided normal jump is invariant under a **256× shrink** of the offset on
**98.2% / 99.6%** of them — so (d) is refuted and the class is correctly named. They survive because the
heap driver's `consider()` accept test is **`sagAdaptive` and nothing else** — there is no conformance
term in it at all (the sweep driver's `triangleNeed` has one; both committed meshes are `driver: heap`) —
and **95.98% (Gothic) / 99.74% (Voronoi) of the surviving crease-crossing AREA is UNDER `acceptTol`**
(plane sag p50 **1.09 µm** against a 3.5 µm bar, while the same facets' true orientation error is
**228 µm** of chord / **82.5°**: the accept ruler under-reads this class by **209×**). Conformity in this
driver is therefore *opportunistic* — an edge is conformed only if the driver happened to split it for
SIZE and the crossing happened to fall outside the `SNAP_ALPHA` band — and once a facet's plane sag drops
under `acceptTol` its crease crossing is **frozen into the STL forever**. The class is small: **0.086%**
(Gothic) / **0.285%** (Voronoi) of the over-bar defect AREA, **3,187 / 19,018 facets** whole-mesh. It is
**partially closeable at ZERO triangle cost** by the already-built, default-OFF §4.3 vertex move
(`PF_CB_MOVE43H`): orientation chord **228 → 26 µm** on Gothic, **79 → 43 µm** on Voronoi — but only
~28% of the facets clear a 5° angular bar and 18–31% are still crease-crossed afterwards, so one local
operator does not finish it.

**AND THE CLASS SIZE S93 PUBLISHED IS WRONG IN BOTH DIRECTIONS.** Its `kinkDeg > 1` detector has
**RECALL 46.6% / PRECISION 12.1%** on Gothic (over-states the class **8.8×**) and **RECALL 41.9% /
PRECISION 83.3%** on Voronoi (under-states it **4.6×**). It is not a small bias — it is a different
random variable.

---

## THE FOUR CANDIDATES, EACH WITH ITS NUMBER

Measured on `gothicarches_ring_DS-HT_S39CTL.stl` (100,000 facets = 8.75% golden-stride of 1,142,166) and
`voronoi_ring_D--H_S94CTL.stl` (60,000 = 12.19% of 492,068).

| candidate | verdict | evidence |
|---|---|---|
| **(a) DETECTION** — the locus set is incomplete | **REFUTED** (kill line: ≥95% found) | `locateKinkRaw` (the driver's own code, driver's own constants) fires on **98.925% by count / 99.701% by AREA** of genuine crossings on Gothic and **98.3% by count** on Voronoi. Where it fires, `\|t_driver − t_true\| ` is **1.8e-7 / 6.3e-7 / 1.0e-4** (p05/50/95 of the edge fraction) and it agrees on WHICH crossing 99.64% of the time. Detection is essentially perfect. |
| **(b) PLACEMENT** — edges land NEAR the crease, not ON it | **CONFIRMED, and it is the whole residual** | Crossing → nearest facet vertex: **p50 38.98 µm = 6.93% of the facet diameter** (Gothic; uniform would be 25%). At the EDGE level the median crease crossing sits **1.39 µm** from a vertex against the driver's own `CONF_MM = 0.6 µm` conformance radius — **the mesh is aiming at the crease and landing 2.3× its own radius off**. `conformed` is FALSE on **98.9%** of the surviving crossings: the driver KNOWS. |
| **(c) CONFORMITY LOST LATER** — a split/flip/collapse destroys it | **REFUTED — no operator destroys it; it was never established** | The S39CTL run's own log: the aligned seed left **1,392 of 382,644 seed edges crossing a locus (0.364%)**, down from 10,641 uniform. My census finds **≈1,800 distinct crossing edges** whole-mesh (279 crossed facets in 100,000 ⇒ 3,187 facets ⇒ ~1,600–1,800 edges). **The survivors ARE the seed's residue, subdivided** — the loop neither creates nor destroys them. Collapse/flip counters in that run are literally 0 (`collapsed 0, flips 0`). |
| **(d) NOT A 1-D CURVE** | **REFUTED** | Two-sided turn at offset `L·2⁻¹⁴` vs `L·2⁻⁶` (a **256×** shrink): ratio p50 **1.002** (Gothic) / **0.9999** (Voronoi); **INVARIANT on 98.2% count / 92.2% AREA** (Gothic) and 99.6% / 99.8% (Voronoi); **0.000% classed as a vanishing (smooth) curvature peak on either mesh**. These are true tangent discontinuities. Dihedrals: Gothic p25/50/75 = **3.2° / 103.2° / 150.4°** (the near-blade mullion/column ridges, `ridge(d,w,sharp=4)` has slope `amp·sharp/w` on both sides); Voronoi p50 **17.4°**. |

### ⇒ THE FIFTH MECHANISM, WHICH IS THE REAL ONE

`consider()` (`_strataConformBisectS34.test.ts:2923`) queues a triangle **only** when
`sagAdaptive > localAcceptTol`, plus three vetoes that are all default-OFF (`ADMIT_NORMAL` S20, `s29`,
`CERTACCEPT`). **There is no conformance term.** The SNAP machinery lives inside `splitEdge`, which is
only reached when a triangle was queued for SIZE and popped. So:

> **An edge is conformed to a crease only if the driver happened to split it for SIZE reasons AND the
> crossing happened to land outside the `SNAP_ALPHA = 0.12` band. The moment a facet's plane sag falls
> under `acceptTol` it leaves the queue forever and its crease crossing is frozen into the STL.**

Which gate each surviving crossing sits behind (Gothic, `acceptTol` 3.5 µm from its own `run.json`):

| gate | count | AREA |
|---|---|---|
| **A. ACCEPTED by the plane ruler** (`sagAdaptiveRaw < acceptTol`) | **83.87%** | **95.98%** |
| B. not accepted, but inside the `SNAP_ALPHA` band ⇒ the R4 `move-deferred` dead end (`PF_CB_MOVE43H=0`) | 1.08% | 0.26% |
| C. not accepted, outside the band ⇒ a SHAPE/AR refusal or budget | 15.05% | 3.77% |

Voronoi (`acceptTol` 7 µm): **A = 99.70% count / 99.74% AREA.** Voronoi's mesh additionally has
`snap: false` in its `run.json` — the crease machinery was **switched off entirely** for that arm, so
`locateKinkRaw` was never called and `conformed` was vacuously true on every edge.

The plane ruler's blindness on this class, on the same facets: plane sag p50 **1.09 µm**, edge chord sag
(the DIRECTED *rank* key) p50 **8.12 µm** (7.5× larger), orientation chord p50 **228.2 µm** (**209×**
larger). The rank key can see 7.5× of what the accept key sees, and the accept key is the one that decides.

---

## HOW BIG IS THE CLASS, HONESTLY

| | Gothic S39CTL | Voronoi S94CTL |
|---|---|---|
| crease-crossing facets, **count** | 0.279% of all | 3.865% of all |
| crease-crossing, **AREA** | 0.037% of all | 0.272% of all |
| **share of the OVER-BAR defect AREA** | **0.086%** (S93 said 0.39%) | **0.285%** (S93 said 0.11%) |
| same, by count | 0.451% | 4.312% |
| **extrapolated whole-mesh facet count** | **3,187** of 1,142,166 | **19,018** of 492,068 |
| their orientation, area-wt p50 | normDeg **82.5°**, chord **228 µm** (uncrossed: 0.56°, 8.9 µm) | normDeg **11.3°**, chord **78.9 µm** (uncrossed: 0.89°, 26.1 µm) |
| their shape, minAngle p05/50/95 | **1.51° / 7.45° / 40.3°** — already slivers | 4.7° / 20.2° (p50) |

**S93's `kinkDeg > 1` detector, scored against the h-free one on the SAME facets:**

| | Gothic | Voronoi |
|---|---|---|
| recall (genuine crossings it finds) | **46.59%** | **41.87%** |
| precision (its firings that are real) | **12.12%** | **83.28%** |
| net effect on the class AREA | **over-states 8.8×** | **under-states 4.6×** |

### AND THE "FOLDED" CLASS IS PARTLY THIS CLASS

S93 declares FOLDED / CREASE / SMOOTH mutually exclusive and assigns FOLDED first. But a facet spanning a
150° blade has a normal that is legitimately **>90°** from one side's surface normal — no fold, no
inversion, just a straddle. Measured:

| | Gothic | Voronoi |
|---|---|---|
| share of the **FOLDED** class (normDeg>90) that is crease-crossing | **35.71% count / 7.77% AREA** | **58.15% count / 19.42% AREA** |
| share of the **CROSSING** class that reads as folded | **62.72% count / 47.97% AREA** | 5.69% / 1.60% |

⇒ **A third to a half of the "back-facing" population by count is a crease straddle, not a fold.** This
matters to whoever owns the FOLDED arm.

---

## CAN IT BE CLOSED, AND AT WHAT PRICE — THREE OPERATORS, MEASURED

Read-only synthetic operators applied to the committed STL, cut/moved points lifted with the mesher's own
`addV` contract (`r = rA(θ,z)`), children re-measured with the SAME `orientOfFacet` ruler.

| operator | Δ triangles | Gothic: worst normDeg p50 | Voronoi: worst normDeg p50 | clears 5° | minAngle < 5° after |
|---|---|---|---|---|---|
| **1→2 split at the crossing** (a VERTEX on the crease, no edge) | +1 | 36.9 → **5.5** | 8.40 → **9.07 (WORSE)** | 16.2% / 1.3% | 86.0% / 69.0% |
| **1→3 cut along the crease chord** (an EDGE on the crease) | +2 | 94.3 → **48.7** | 13.7 → **7.40** | **0.00%** / 7.8% | **95.1%** / 53.9% |
| **§4.3 vertex MOVE** (`PF_CB_MOVE43H`, built, default OFF) | **0** | 82.5 → **5.78** | 11.3 → **3.69** | 27.6% / 28.5% | 69.2% (from 39.4%) / 14.6% (from 13.3%) |

* **The MOVE is the best operator and it is free.** Orientation chord p50 **228.2 → 26.3 µm** (Gothic,
  8.7×) and **78.9 → 43.0 µm** (Voronoi, 1.8×) at **zero triangle cost**, median displacement 48 µm
  (Gothic) / 66 µm (Voronoi). It is already implemented (`tryLocusMoveH`, guarded by the same AR ≤ 50
  shape test) and default OFF in both committed meshes.
* **It does not finish the job:** only **27.6% / 28.5%** of facets clear a 5° angular bar, and
  **17.9% / 31.4%** are STILL crease-crossed after the move (the crease enters through one edge and
  leaves through another — one vertex cannot conform both).
* **REFUTED — my own first proposal.** I expected the 1→3 cut ("just put an edge on the crease") to be the
  fix. On Gothic it **fails outright**: 0.00% clear a 5° bar and **95.1% of the cuts produce a child with
  minAngle < 5°**, because the surviving crossings sit at `tMin` p50 **0.076 of the edge** — the crease
  *clips a corner*, so the cut manufactures needles. The children's summed area is only **0.32×** the
  parent's at p50, which is itself the signature of a degenerate cut and is reported rather than hidden.
* **REFUTED — "a vertex on the crease is enough".** The 1→2 arm makes Voronoi **worse** (8.40 → 9.07).
  The brief's structural claim ("an edge is on the crease only if its endpoints are") is measured true.

### THE PRICE OF A CONFORMANCE-AWARE ACCEPT — and the trap in it

The obvious fix (add a conformance term to `consider()`) cannot be keyed naively on `locateKinkRaw`:
it fires on **3.16% of all edges** on Gothic, of which **86.1% are FALSE POSITIVES** (the two-sided turn
at its *own* located `t` is < 1°). A naive rule would demand refinement on ~7× more edges than there are
creases.

**And the discriminant that would fix it does not exist in this quantity.** `locateKinkRaw`'s two-scale
ratio is 1/4 at a true kink and 1/16 at a smooth peak — but measured on Gothic:

| | p05 | p25 | p50 | p75 | p95 |
|---|---|---|---|---|---|
| FALSE POSITIVES (n 8,533) | 0.2100 | 0.2440 | **0.2486** | 0.2504 | 0.2560 |
| TRUE CROSSINGS (n 1,376) | 0.2500 | 0.2503 | **0.2516** | 0.2522 | 0.2562 |

**They overlap almost completely.** Raising `kinkRatio` 0.15 → 0.24 keeps 98.3% of the true crossings but
still admits **81.9%** of the false ones. ⇒ **REFUTED: the crease class cannot be gated by tightening
`PF_CB_KINK_RATIO`.** (Why the false positives read 0.25: Gothic's `ridge(d,w,4)` and `sat()` terms are
piecewise-smooth with slope discontinuities of their own at the ridge FEET and clamp boundaries — genuine
C¹ breaks in `r` that produce a 1/4 second-difference ratio while the *normal* barely turns. The radius
ruler and the Gauss ruler are measuring different things, and only the Gauss one is the bar.)

---

## VISUAL EVIDENCE — AND IT CORRECTS A READING OF MY OWN METRIC

`research/exchange/_strataConformBisect/s99/render/S99_GOTH_crease.png`
(`research/tools/s99CreaseRender.ts` → `research/render/meshRender.cjs`, flat-shaded, per-FACET colours,
6 × 6 mm window at θ = −1.3065, z = 80.5 — one of the census's own crossing sites; 6,080 facets).

**LEFT — orientation angle vs a 5° bar.** The red is a set of long **RIBBONS several facets wide** running
down both flanks of each arch rib.
**RIGHT — crease crossing (red = an h-free crease crosses an edge).** *Almost the whole window is grey,
including the rib CREST itself.* Only one facet in this view is flagged (94 of 6,080 in the whole window
= 1.55% count / 0.65% AREA).

⇒ **The visible orientation defect along the ribs is NOT the crease class.** The rib crest line is
*already conformed* (grey), and the wide red band is the SMOOTH, very steep rib FLANK — S93's
SMOOTH-TURNING 99.04%, a sizing problem. The render agrees with the census and kills any temptation to
read the crease class as the cause of what the eye actually sees on GothicArches.

---

## MY OWN HYPOTHESES, REFUTED — STATED AS PROMINENTLY AS THE CONFIRMATIONS

1. **H-C1 (that S93 UNDER-counts the crease class) — REFUTED AND INVERTED on Gothic.** It over-counts
   **8.8×** there (and under-counts 4.6× on Voronoi). I pre-registered the wrong direction.
2. **H-C2 (detection is incomplete) — REFUTED**, decisively: 98.9% found, located to 6e-7 of the edge.
3. **H-C4 / (d) — REFUTED**: 0.000% of the crossings are smooth curvature peaks.
4. **"Put an edge on the crease" (the 1→3 cut) — REFUTED on Gothic**: 0% clear a 5° bar, 95% slivers.
5. **"Tighten `kinkRatio` to make a conformance-aware accept affordable" — REFUTED**: the true and false
   populations overlap at p50 0.2516 vs 0.2486.
6. **H-C3's kill line was mis-specified and I flipped on it.** At N = 20,000 (63 crossings) the
   area-weighted median miss read **0.121 of the diameter** ⇒ *refuted*; at N = 100,000 (279 crossings) it
   reads **0.0693** ⇒ *confirmed*. The N=20k figure was dominated by a handful of large facets. **Quote
   only the N=100,000 number**, and treat any area-weighted quantile over <100 members as noise. The
   qualitative conclusion (crossings are concentrated near vertices, not spread over the edge) holds at
   both N.
7. **An instrument defect I found and did NOT patch:** `orientRuler.locateTurnAdaptive` returns **exactly
   half** the dihedral when the crease sits at the probe midpoint, and **0.0000°** on a symmetric smooth
   feature (fixtures F1/F2b). It is the S74 tie-rule defect in the symmetric configuration. Not patched
   here — it is a shipped instrument other running jobs share and this is a read-only census — but any
   S74-derived `turn` on a real mesh is a coin toss between the dihedral and half of it.

---

## WHAT I DID NOT MEASURE — STATED PLAINLY

* **No mesher arm was run.** Every number here is read-only on the two committed STLs plus synthetic
  operators. The MOVE's collateral on the moved vertex's **STAR** is not measured (displacement p50 48–66 µm
  is reported so the size of that risk is visible); the real `tryLocusMoveH` has an AR ≤ 50 guard that
  would refuse some of them.
* **The 5% endpoint inset.** A crease crossing within 5% of a vertex is excluded by construction (so a
  conformed vertex is not counted as a span). Adjudicated: of the 956 such edges on Gothic, **22.4% are
  within `CONF_MM` (0.6 µm) — genuinely conformed** — and p50 is **1.39 µm**, p95 11.8 µm. They are real
  but their wrong-normal band is ~1 µm wide on a ~500 µm facet, i.e. measure-~0 in AREA. The facet-level
  count is therefore a **lower bound in COUNT** and tight in AREA.
* **One crossing per edge.** A segment crossing two creases reports the larger; junction facets
  (Voronoi triple points) are under-counted in `nCross`.
* **Only two meshes, one config each**, both `driver: heap`. The sweep driver's `triangleNeed` DOES put
  conformance first and would not have gate A — untested.
* **No σ bands** on any share; golden-stride samples of 8.75% / 12.19%.

---

## PRE-REGISTERED NEXT ARMS

1. **`PF_CB_MOVE43H=1` A/B on Gothic at fixed budget.** Kill line: crease-crossing facet count must fall
   below **1,600** (half of 3,187) with whole-mesh minAngle p05 not worse than 1.5× — otherwise the move's
   sliver cost (69.2% of moved facets under 5° in the facet-local probe) sinks it.
2. **`PF_CB_DRIVER=sweep` A/B** (no `PF_CB_TIGHTEN`, which is refused under sweep). Kill line: if the
   crease-crossing count does not fall ≥3×, the conformance-first `triangleNeed` is not the difference
   and gate A is mis-attributed.
3. **A conformance term in `consider()` keyed on the GAUSS ruler, not the radius ruler.** The census
   measures the demand exactly: **0.28% of facets on Gothic, 3.9% on Voronoi** — but it costs ~600 rA
   evaluations per edge, so it is an offline/GPU quantity, not an inner-loop one. Kill line: > 2× total
   run time ⇒ not affordable in the driver, and the answer is a pre-pass locus set instead.


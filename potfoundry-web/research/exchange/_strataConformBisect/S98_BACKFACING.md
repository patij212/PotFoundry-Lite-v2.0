# S98-BF — THE BACK-FACING FACET CLASS: *** THE 305 CONTAIN ZERO ACTUAL BACK-FACING FACETS, AND THE REAL ONES ARE A SET S97 CANNOT SEE ***

Owner: back-facing facet class. Hypotheses + kill lines pre-registered before any run (§1, unedited).
Instruments: `research/tools/s98BackFacingPartition.ts`, `research/tools/s98BackFacingMechanism.ts`,
`research/render/s98BackfaceRender.cjs`. Reports in this directory (`S98_BACKFACING_*.report.txt`).

## HEADLINE

| | |
|---|---|
| **Of S97's 305 "back-facing" facets, how many are back-facing under any defensible convention?** | **ZERO** |
| Where they actually are | 280 (91.8%) SUP-STRADDLE, 25 (8.2%) outright false positives |
| The real unambiguous class, Gothic S39CTL full mesh | **690 facets · 0.0604% count · 0.00596% AREA** |
| The real unambiguous class, Voronoi S94CTL (**the config that ships**) | **488 facets · 0.0992% count · 0.01298% AREA** |
| Overlap between the S97 set and the real set, on 3 meshes | **Jaccard 0.0000 — exactly disjoint, and it is a THEOREM (§2.2)** |
| Mechanism | **needle slivers**: parametric orientation CORRECT on 1178/1178, curvature remainder ρ>1 on 1178/1178 |
| The lever | the **existing default-ON shape gate**: 77.9× by count / 39.0× by area, same style/rA/params |

---

## 0. WHAT I INHERITED, AND THE TWO THINGS WRONG WITH IT

S97 (`05e61f5c`) reports on Gothic S39CTL, 60,000-facet golden sample:
`BACK-FACING (normDeg > 90): 305/60,000 = 0.24338% of sampled AREA, max normDeg 174.68`,
measured by `orientOfFacet(..., {k:8, inset:0.02, orient:'outward'})` with `ns = fdNormalsCentral`.

**(P1) `orient:'outward'` DISCARDS THE WINDING — the only thing a renderer uses.** In that mode the ruler
computes `d = f_winding · n_S(centroid)` and *if `d < 0` replaces `f` with `−f`*. A facet whose STL winding
genuinely points into the solid is silently re-oriented outward, then scored. After that flip
`angle(f, n_S(centroid)) ≤ 90°` **by construction**. So `normDeg > 90` can only mean *"somewhere else in
the footprint the surface normal turned more than 90° away from the outward-aligned facet plane"*. It is a
**surface-turn detector, not an inversion detector**.

**(P2) `fdNormalsCentral` is the CENTRAL difference**, which `orientRuler`'s own header states returns the
*average* of the two one-sided normals at a C0 crease — a normal belonging to neither flank. `_judgeNormal`
was given the five-candidate fix on 2026-07-30 *after it was measured necessary*; S97 does not have it.

**THE TASK BRIEF IS STALE ON THE CONVENTION, AND THE FOLKLORE IT REPEATS IS FALSE.** The brief describes
the outward test as `fx*gx + fy*gy < 0` and warns that deep cavities make the direction "genuinely
ambiguous". Commit `5698d023` (2026-08-06 00:26) replaced that with the analytic surface normal, and
`git merge-base --is-ancestor 5698d023 05e61f5c` = **YES** — the 305 was measured under the FIXED sign.
And the fixed sign has **no cavity ambiguity to find**: for a radial graph `r = rA(θ,z)`,

    N = (r cosθ + r_θ sinθ,  r sinθ − r_θ cosθ,  −r·r_z)      ⇒      N · r̂ = r > 0   IDENTICALLY

for every `r_θ`, every `r_z`, every cavity, every undercut. **There is no sign ambiguity in the surface.**
The only ambiguity is *which point of the footprint you ask*. That is what this experiment partitions.

---

## 1. PRE-REGISTERED HYPOTHESES AND KILL LINES (written before any run)

Instrument: one pass, `k=8`, `inset=0.02` (identical 45-point covering to S97), 5 rA evals per lattice
point yielding **five** candidate analytic normals (central + the four one-sided — `_judgeNormal`'s set) at
zero extra rA cost. Per lattice point `p`: `bestDot(p) = max over the 5 candidates of (f_winding · n_j(p))`.
`bestDot(p) < 0` ⟺ *under no defensible one-sided surface normal at `p` is this facet front-facing* — the
most-favourable-to-the-mesh test, the only safe bias for a gate.

`nBack` = #{ of the 45 lattice points with `bestDot < 0` }:

| bucket | definition |
|---|---|
| **(a) UNAMBIGUOUS** | `nBack == 45` — back-facing over its whole footprint under every admissible normal |
| **(b) STRADDLE** | `1 ≤ nBack ≤ 44` — front-facing on part of itself, back-facing on the rest |
| **(c) FRONT-FACING** | `nBack == 0` — not back-facing anywhere; a false positive of the census |

- **H0 (convention/artefact).** The S97 population is dominated by (b)+(c).
  *KILL: ≥ 50% of the S97-flagged facets in bucket (a) ⇒ REFUTED.*
- **H1 (winding).** `{normDeg>90 | outward}` and `{bucket (a)}` are different sets.
  *KILL: Jaccard > 0.8 ⇒ REFUTED.*
- **H2 (straddle mechanism).** (b) are chords across a >90° turn; (a) sit on a coherent normal field.
  Predicted median `spreadRad`: (b) ≥ 60°, (a) ≤ 30°. *KILL: medians differ by < 2× ⇒ REFUTED.*
- **H3 (sliver conditioning).** Bucket (a) median `minAngle` < 5°. *KILL: > 15° ⇒ REFUTED.*
  *(I expected to be wrong here — `project_strata_ranking_function` found the failing class to be LARGE
  well-shaped facets. See §3.3: that is a different class.)*
- **H4 (parametric fold).** Bucket (a) has negative parametric signed area. *KILL: < 20% ⇒ REFUTED.*
- **H5 (curvature remainder).** With `A_param > 0`, `f_raw = 2·A_param·N_raw + R` and `ρ = |R|/|2 A_param N_raw| > 1`.
  *KILL: ρ ≤ 1 on > 20% of the `A_param > 0` subset ⇒ REFUTED.*

**NON-VACUITY, all three passed before any number below was believed:**
1. **S97 REPRODUCTION — EXACT.** Same 60,000-facet golden sample, same settings: **305 facets, AREA
   0.24338%, max normDeg 174.68**. Identical to the published triple, to the digit.
2. **RADIAL MEMBERSHIP.** `max |‖(x,y)‖ − rA(θ,z)|` = **0.031 µm** (Gothic) / **0.016 µm** (Voronoi) —
   the style params match the artefact AND the mesh is a radial graph, which licenses `N·r̂ = r > 0`.
3. **GLOBAL WIND.** 99.83% / 99.9% of a stride sample winds OUTWARD. Not a mesh-wide convention.

Plus two controls that came back clean and are worth stating: **the STL's stored f32 normal disagrees with
the winding on 0 facets** in all four runs (so no "which normal does the viewer use" ambiguity exists), and
the **determinacy band** `|bestDot| < 1e-9` fires on **0** facets (no verdict here sits on f32 noise).

---

## 2. RESULT — STEP 1, THE PARTITION

### 2.1 The four censuses (FULL MESH except where noted)

| mesh | facets | S97 flag `normDeg>90` | **(a) UNAMBIGUOUS** | (b) STRADDLE | (c) FRONT-FACING |
|---|---|---|---|---|---|
| **Gothic S39CTL** — the S97 sample (N=60k) | 60,000 | **305** · 0.5083% cnt · 0.24338% area · max 174.68 | **22** · 0.0367% · 0.00270% | 280 | 59,698 |
| **Gothic S39CTL** FULL | 1,142,166 | 5,311 · 0.4650% · 0.21130% · max 179.60 | **690** · 0.0604% · **0.00596%** | 4,918 | 1,136,558 |
| **Voronoi S94CTL — SHAPE-ON, SHIPS** | 492,068 | 1,835 · 0.3729% · 0.03050% · max 178.99 | **488** · 0.0992% · **0.01298%** | 1,827 | 489,753 |
| **Voronoi D-- — SHAPE-OFF** | 806,765 | 18,361 · 2.2759% · 0.42522% · max 178.23 | **62,332** · 7.7262% · **0.50635%** | 18,379 | 726,054 |

### 2.2 *** THE CROSS-TAB IS THE FINDING: THE TWO SETS ARE EXACTLY DISJOINT ***

| mesh | S97 ∩ (a) | S97 ∩ (b) | S97 ∩ (c) | (a) missed by S97 | **JACCARD** |
|---|---|---|---|---|---|
| Gothic N=60k (**the 305**) | **0** | 280 (91.80%) | 25 (8.20%) | 22 of 22 | **0.0000** |
| Gothic FULL | **0** | 4,872 | 439 | 690 of 690 | **0.0000** |
| Voronoi SHAPE-ON | **0** | 1,827 | 8 | 488 of 488 | **0.0000** |
| Voronoi SHAPE-OFF | **0** | 18,340 | 21 | 62,332 of 62,332 | **0.0000** |

**A zero Jaccard between a 62,332-facet set and an 18,361-facet set inside an 806,765-facet mesh is not a
statistic — chance overlap alone would be ~1,400. It is a THEOREM, and (P1) is the proof:**

> Every bucket-(a) facet is back-facing at its parametric centroid (measured: **690/690 and 488/488**, §3.2)
> ⇒ `dRef < 0` ⇒ `outward` mode flips `f`, so `f_out = −f_w` ⇒ at every lattice point
> `angle(f_out, n) = 180° − angle(f_w, n) < 90°` ⇒ `normDeg ≤ 90` ⇒ **never flagged.** ∎

**`orientOfFacet({orient:'outward'})` is provably incapable of containing a facet that is back-facing over
its whole footprint.** The S97 census is not a weak measurement of the back-facing class; it measures its
exact complement.

### 2.3 The buckets, NAMED, with the evidence that puts each facet in its bucket

**(a) UNAMBIGUOUS BACK-FACING — 22 of 60k / 690 full / 488 (ships) / 62,332 (SHAPE-off).**
Back-facing at all 45 covering points against the most favourable of 5 one-sided analytic normals.
Corroborated independently by the **4-point `_judgeNormal`-compatible test** (centroid + 3 vertices,
un-inset): 577 vs my 690 on Gothic, 481 vs 488 on Voronoi — and by `advNormalAudit`'s previously published
"TRUE back-facing = 623" for this same S39CTL mesh, computed with a *different* FD step (1e-6 rad vs my
2e-4 mm). Three instruments, three step sizes, same class within 8–16%. The 45-point covering is the
sharpest of them (it catches 113 facets the 4-point test misses).

**(b) SUP-STRADDLE — 280 of the 305 (91.8% by count, 89.8% by area).** NOT convention artefacts, and NOT
back-facing facets. Median `backFrac` = **0.156**: the facet is front-facing over ~84% of its own
footprint, and the >90° reading is the SUP attained on a sub-region. Median `spreadRad` = **87.7°** — the
surface genuinely turns ~88° *inside* one facet. This is a **fidelity defect** (the facet is too big for
the turn; H1/H2 charge for it) — **no renderer will ever draw it black.**

**(c) OUTRIGHT FALSE POSITIVE — 25 of the 305 (8.2% count, 10.2% area).** Front-facing at all 45 points
under best-of-5, yet flagged. These are exactly the **(P2)** population: S97 scores against the single
CENTRAL-difference normal, which at a crease is the average of two one-sided normals belonging to neither
flank. Give the facet either real flank and it is fine.

### 2.4 THE `signMargin` QUESTION, ANSWERED DIRECTLY — AND MY OWN FRAMING WAS WRONG

The brief asked for a bucket "CONVENTION-AMBIGUOUS — `signMargin` small / the outward test near-degenerate".
Measured on the S97-flagged 305: `signMargin` p50 = **0.9996**, p90 = 1.0000, p10 = 0.1445; the outward
mode actually **flipped the sign on only 44/305 = 14.4%**. So:

**THE 305 ARE NOT `signMargin` ARTEFACTS.** The outward test is decisive (margin ~1.0) on ~90% of them.
The bucket the brief anticipated is essentially EMPTY. The census fails for a *different and more
interesting* reason — it is a **sup over a footprint of a quantity whose sign it has already normalised
away** — which no margin diagnostic can reveal. **Refuting the expected explanation is part of this
result:** had I only measured `signMargin` (as asked), I would have reported "the 305 look fine" and missed
that they contain zero real defects.

---

## 3. RESULT — STEP 2, THE MECHANISM OF BUCKET (a)

### 3.1 The exact identity (not a heuristic)

For a triangle whose three vertices lie on the radial graph (verified: membership MAX 0.031 µm), with
`Φ_θ × Φ_z = N_raw`, linearity gives

    f_raw = (P1−P0) × (P2−P0) = 2 · A_param_signed · N_raw(centroid) + R

`A_param_signed` = signed area of the triangle in the (θ,z) plane; `R` = every second- and higher-order
variation of the surface across the footprint. **Exactly two mechanisms are admissible**, and they demand
opposite remedies:

| | condition | remedy |
|---|---|---|
| **H4 PARAMETRIC FOLD** | `A_param < 0` | re-wind (free, exact) |
| **H5 CONDITIONING** | `A_param > 0` and `ρ = \|R\|/\|2 A_param N_raw\| > 1` | **kill the sliver** — re-winding would make it wrong the *other* way |

### 3.2 Measured, both meshes

| | Gothic S39CTL (690) | Voronoi SHAPE-ON (488) |
|---|---|---|
| **H4** `A_param < 0` (parametric fold) | **0 / 690 = 0.00%** | **0 / 488 = 0.00%** |
| **H5** `A_param > 0` **and** `ρ > 1` | **690 / 690 = 100.00%** | **488 / 488 = 100.00%** |
| `ρ` p10 / p50 / p90 / max | 2.84 / **9.01** / 42.3 / 380.7 | 2.30 / **6.18** / 20.8 / 100.2 |
| `cos(f_raw, lead)` p50 | **−0.353** | **−0.339** |
| bucket-(a) `minAngle` p50 (mesh p50) | **4.20°** (26.47°) | **3.19°** (21.03°) |
| whole-mesh P(minAngle < 5°) | 2.06% | 6.32% |
| P(sliver \| bucket a) | 60.1% | 69.7% |
| **RISK RATIO** | **71.6×** | **34.1×** |
| precision of a "collapse every sliver" guard | **2.93%** | **1.57%** |
| **bucket (a) also caught by the O(1) CENTROID test** | **690/690 = 100%** | **488/488 = 100%** |

**H4 REFUTED at 0/1178. H5 CONFIRMED at 1178/1178.** *There is no winding or topology inversion anywhere
in either mesh.* The parametric mesh is correctly oriented at every single facet; only the 3-D lift is bad,
and it is bad because the leading term `2·A_param·N` has shrunk (sliver) below the curvature remainder `R`.
`cos(f_raw, lead) ≈ −0.35` says the actual normal points *opposite* to the first-order prediction — which
is precisely what `ρ > 1` licenses.

**H3 CONFIRMED (median minAngle 4.20° / 3.19° ≪ 5°) — but the naive guard it suggests is refuted by its own
price:** sliverhood is a 34–72× risk factor and still only **1.6–2.9% precise**. A "collapse every sliver"
rule would touch 23,576 / 31,092 facets to reach 690 / 488. **ρ, or the O(1) centroid test, is the right
key; `minAngle` is not.**

**H2 CONFIRMED:** `spreadRad` (b)/(a) = 87.7/16.7 = **5.24×** (Gothic), 42.1/14.8 = **2.84×** (Voronoi) —
both over the pre-registered 2× line, and both predicted values landed ((b) ≥ 60 ✓ Gothic, (a) ≤ 30 ✓ both).
The buckets are mechanistically distinct: (b) is a surface that TURNS inside the facet, (a) is a facet
whose own normal is ill-conditioned against a nearly-flat field.

### 3.3 This is NOT the class `project_strata_ranking_function` found

That memory records the chord-failing class as *LARGE well-shaped facets (GeoStar median 1.7 mm at 252 µm),
not slivers*. **That remains true and is not contradicted** — it is bucket (b)/the chord class. Bucket (a)
is a different, much smaller, sliver-borne class. Two classes, two keys, two remedies; do not merge them.

---

## 4. VISUAL EVIDENCE — AND THE LAB RENDERER IS BLIND TO THIS CLASS

`research/render/meshRender.cjs` builds **every** material with `side: THREE.DoubleSide` (its lines 78–79),
which lights a back-facing triangle exactly like a front-facing one. **Every picture this campaign has ever
produced is structurally incapable of showing this defect.** `research/render/s98BackfaceRender.cjs` adds a
per-cell `D`/`F` side spec so the same bins can be shown both ways.

`s98bf/S98_BACKFACING_ZOOM.png` — 0.6 mm zooms around the worst bucket-(a) facet of each arm, bucket-(a)
painted RED. **The render agrees with the metric:** the defective facets are literally **needle blades**
standing off the surface. On SHAPE-OFF Voronoi (761 of 2,545 facets in the zoom) a red needle spans the
whole patch; on the shipping SHAPE-ON mesh (6 of 162) and Gothic (16 of 1,164) they are thin slivers.

**A RENDER I BUILT AND THEN THREW OUT, stated because it would have been misleading.** My first attempt
rendered a 2.5 mm *patch* with backface culling ON and captioned it "the surface is shredded". **That is
invalid evidence.** A patch is an open sheet whose far side is legitimately back-facing to the camera, so
culling removes correct geometry and the picture conflates *back-facing w.r.t. the surface* (the defect)
with *back-facing w.r.t. the camera* (normal and right). Culling is only a sound test on the CLOSED whole
mesh — where this class, holding 0.006–0.013% of area, is sub-pixel. `S98_BACKFACING_PATCH.png` is kept
only as the record of that mistake; **do not cite it.**

---

## 5. STEP 3 — THE FIX, AND ITS PRICE

### 5.1 PREVENTION: the lever already ships, and it is worth 78×

The mechanism (`ρ ∝ edge-length × |D²Φ| / (sin θ_param · |N|)`) says the class is governed by facet ASPECT.
There is already a default-ON aspect gate. Same style, same rA, same registry params, the two committed
artefacts:

| | facets | **bucket (a) count** | **bucket (a) AREA** | S97's ruler |
|---|---|---|---|---|
| `voronoi_ring_D--` SHAPE-OFF | 806,765 | 62,332 (7.7262%) | 0.50635% | 2.2759% |
| `voronoi_ring_D--H_S94CTL` SHAPE-ON (**ships**) | 492,068 | **488 (0.0992%)** | **0.01298%** | 0.3729% |
| **ratio** | 0.61× tris | **77.9×** | **39.0×** | 6.1× |

**The measurement is CONSERVATIVE**: the SHAPE-ON arm also has **39% FEWER triangles**, so density works
*against* it and the 78× cannot be a density artefact. **And S97's own ruler under-reports this win by
13×** (6.1× vs 39.0× by area) — a third independent way that census is the wrong instrument.

*CAVEAT, stated:* the two artefacts differ by more than one flag (S95 records `PF_CB_SHAPE_AR` as driving
both a gate and a seed-repair path, and the tri counts differ). This is an artefact-level A/B, not a
one-flag A/B. The direction and order of magnitude are safe; the exact 77.9× is not.

**Why this is not S84's refuted `PF_CB_FOLD3D`.** That guard REFUSED SPLITS on a 3-D fold predicate at
threshold 0.5 and produced a 126 KB STL against 3.06 MB, headline 405→1262 µm. It refused to *make
geometry*. The shape gate constrains the ASPECT of geometry it does make — exactly the quantity `ρ` is
inversely proportional to — and it is already default-ON and already measured non-destructive by S95
(1.52× more accurate by area with 39% fewer triangles). **These are not the same kind of intervention.**

### 5.2 DETECTION: an O(1) sound screen, priced

The 45-point covering costs 225 rA evals/facet (14.2 M for 60k facets). The **O(1) centroid test**
(5 rA evals, best of 5 one-sided candidates) has measured **recall 100% (690/690, 488/488)** against the
covering verdict, at ~**46% precision** (1,502 flagged vs 690 real; 1,048 vs 488). So it is a **sound
screen**: run it on every facet (5 × 1.14 M = 5.7 M rA evals ≈ 2 s on a 1.14 M-facet export), then confirm
the ~0.13% it flags with the 45-point covering. **Total ≈ 2–3 s per export.** That makes the class
measurable at ship time, which today it is not.
*Caveat: 100% recall is MEASURED on two meshes, not proved. The covering test is the verdict; the centroid
test is a screen whose recall must be re-checked per style before anyone gates on it alone.*

### 5.3 REPAIR: NOT PROPOSED — and here is the number that says why

**A post-hoc re-winding repair is REFUTED before being built.** `A_param > 0` on **1,178 of 1,178**
bucket-(a) facets across both meshes: the parametric mesh is correctly oriented *everywhere*. Flipping such
a facet's winding would (i) make it inconsistent with its edge-neighbours, breaking the mesh's global
orientation, and (ii) not move its plane one micron closer to the surface. The defect is a **shape**
defect wearing an orientation costume. The correct repair is sliver removal (collapse/flip) — a shape
operator, i.e. exactly what §5.1's gate already does at build time. **I have not measured a post-hoc
collapse and claim nothing about it.**

---

## 6. VERDICTS

| hypothesis | verdict | number |
|---|---|---|
| **H0** S97 population dominated by (b)+(c) | **CONFIRMED** (kill line 50%) | **0.00%** in (a) |
| **H1** the two sets differ | **CONFIRMED** (kill line 0.8) | Jaccard **0.0000** ×4 meshes |
| **H2** (b) straddle vs (a) coherent field | **CONFIRMED** (kill line 2×) | 5.24× / 2.84× |
| **H3** (a) are slivers | **CONFIRMED** (kill line 15°) | minAngle p50 4.20° / 3.19° |
| **H4** parametric fold | **REFUTED** (kill line 20%) | **0 / 1178** |
| **H5** curvature remainder ρ>1 | **CONFIRMED** (kill line 20%) | **1178 / 1178** |
| brief's `signMargin` bucket | **EMPTY** | margin p50 0.9996; only 14.4% flipped |
| brief's "cavity sign ambiguity" | **REFUTED analytically** | `N·r̂ = r > 0` identically |
| my culled-patch render | **REFUTED by inspection** | invalid instrument, §4 |

**PLAIN ANSWER TO THE QUESTION THE BRIEF ASKED.** *"If step 1 shows most of the 305 are convention
artefacts, say so plainly."* — **Not "most". ALL of them.** Zero of the 305 are back-facing under any
defensible convention; 91.8% are sup-straddle (a fidelity defect, not an orientation one) and 8.2% are
outright false positives of the central-difference normal. **The export is far closer to orientation-clean
than the 0.243% figure implies: the true unambiguous back-facing area is 0.00596% on Gothic and 0.01298%
on the config that ships — 41× and 19× smaller than the number that was being quoted.** It is still not
zero, and zero is the standard.

---

## 7. NEXT (pre-registered for whoever takes this)

1. **Run the O(1) centroid screen across all 20 styles** — the class has never been censused beyond these
   two. Cost ≈ 2 s/mesh. Kill line: if any style exceeds 0.1% of AREA, the shape gate is not sufficient
   there and prevention needs a per-style look.
2. **A one-flag `PF_CB_SHAPE_AR` A/B** at fixed triangle budget, to convert §5.1's artefact-level 77.9×
   into a clean single-lever number. Kill line: < 5× ⇒ the gate is not the mechanism and §5.1 is confounded.
3. **Price a post-hoc sliver collapse** keyed on the O(1) screen (~0.13% of facets, 46% precision) and
   measure whether it clears bucket (a) to literal 0 without moving H1/H2. Not attempted here.

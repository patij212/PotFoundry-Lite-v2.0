# S116 — THE ROADMAP TO 0.01 / 0.001 WITH ZERO FOLDS BY CONSTRUCTION

**2026-08-07.** 8 agents, 2.08 M tokens, 0 errors. Deliverables: 6 STLs + 113 PNGs under
`research/exchange/_strataConformBisect/s116/`. **This document supersedes the S113–S115 framing.**

---

## 0. THE FINDING THAT CHANGES EVERYTHING — WRONG MESH

***`celtictriquetra_ring_D--.stl` WAS NEVER MADE BY THE SHIPPING GENERATOR.*** It is **STRATA
research-driver output with the shape guard OFF**, built **2026-07-25** — four days *before* the S1–S4
shape levers landed (2026-07-29) and became the default.

Decoded from the driver's own tag grammar (`_strataConformBisectL.test.ts:4715`):
`CelticTriquetra / ring / DIRECTED / no-snap / no-reproj / plane rank / **NO shape suffix**`.
Seed: a uniform 200×140 grid (`:1251-1268`), refined by midpoint bisection — **828,893 splits through one
choke point**, `bisectAt` `:1572-1573`.

**So the campaign's "CelticTriquetra is 72.7× Gothic" headline was measured on a known-obsolete artefact,
and I amplified it.** The guard the driver *already ships* fixes most of it:

| | guard OFF (`_D--`) | guard ON (`_D--H_S102`) | ratio |
|---|---|---|---|
| over-ceiling fold class | 2.3262% of mesh | **0.2388%** | **9.96×** |
| needles (<2 µm arc altitude) | 2.2068% of mesh | **0.1008%** | **22.4×** |
| excess 3D area vs analytic | 1,256.491 mm² | **187.402 mm²** | **6.71×** |
| facets | 1,714,638 | **1,282,394** | **25% FEWER** |

***I re-rendered and re-measured the guard-ON mesh myself: 1,282,394 facets, 48,535.770 mm² against the
analytic 48,348.368 mm² ⇒ excess 187.402 mm². Reproduced exactly.***

**The folds were never a surface phenomenon.** 94.87% of the class AREA is arc-space slivers under
**2 µm** min altitude (Gothic control: 1.78% — a **53×** separation), MAX dihedral exactly 180.000°, which
is what a triangle whose altitude sits at the f32 noise floor returns. **They are needles, born in one
line, in a research driver, with its shape guard switched off.**

⛔ ***AND MY "C0 CLIFFS ARE THE ROOT CAUSE" HYPOTHESIS IS REFUTED.*** CelticTriquetra *does* carry a real
1.32–1.71 mm C0 discontinuity (`src/geometry/styles.ts:2263`, `Math.floor(angle / (CT_TAU/3))` — a hard
3-way branch inside the medallion), but it is **3 cells of a 1536×768 exhaustive raster = 0.0003% of the
parameter domain**, and only **1.291%** of the fold class lies within 5 mm of it. **98.7% of fold area is
nowhere near a cliff.**
✅ **But the cliff IS the endgame:** on the guard-ON mesh the enrichment jumps to **177.4×** at ≤0.05 mm
(vs 20.1× guard-OFF). ***The guard clears the generic needles and concentrates the residual on the one
place the surface is genuinely double-valued — and the shipping path has NO curtain/tread emitter.***

## 1. WHERE "BY CONSTRUCTION" ACTUALLY GOES — THE SHIPPING PATH, TRACED

`ParametricExportComputer.ts:2468` — `if (flags.conformingMesher)`, **default TRUE**
(`parametric/contracts.ts:435`) — takes an **early return** that skips the entire CDT surface loop, the
optimisation passes and the tail repair battery. ***`MeshOptimizer.chainDirectedFlip`,
`MeshSubdivision.subdivideLongEdges`, `NearCoincidentWeld`, `CollinearTriangleResolution` and
`BoundaryTJunctionRepair` are DEAD CODE in the shipping configuration.***

The live chain, and the only place a triangle is born:

```
:3185 assembleWatertight -> WatertightAssembly.ts:683 -> buildConformingWall
   -> MetricSizingField.ts:114   h = sqrt(8*maxSagMm/kappa)   + gradeLipschitz :134-160
   -> PeriodicBalancedQuadtree.shouldRefine :750-809 + analyticSagExceeds :812+
   -> QuadtreeTriangulator.triangulateQuadtree
        emit closure :627-631  <=== THE ONE CHOKE POINT
        sites :693-697 (PLAIN_QUAD), :723/:730 (single-mid), :757/:764 (N-mid)
   caps: RingStrip.annulusStrip :37-64, discFan :79-95  (called at WatertightAssembly :478/:483/:702/:749)
```

⚠ ***NOBODY HAS EVER MEASURED A CelticTriquetra MESH BUILT BY THE SHIPPING PATH.*** No such STL exists in
`research/exchange/`. Every statement about the shipping generator is a **code trace, not a measurement**.
***Producing that mesh is the single highest-value next artefact and the whole programme's missing
baseline.***

## 2. THE EMIT-TIME INVARIANT — BUILT AND VALIDATED TWO-SIDED

A per-triangle predicate on (3 vertices, `rA`), installable at the `emit` closure above:

- catches **99.41%** of CelticTriquetra's over-ceiling fold/blade AREA and **99.96%** of its blade AREA;
- flags **0.0246%** of GothicArches's mesh area and ***0.0000% of Gothic's 860.392 mm² of REAL
  GEOMETRY*** — the two-sided test that matters, since Gothic's high-dihedral facets are correct;
- its decisive terms (fold + parameter-degeneracy) cost ***ZERO analytic evaluations***;
- every flag on both meshes is accounted for, none unexplained.

Cost measured at 43 µs/tri (Gothic) / 26 µs/tri (CT). ⚠ **Fraction of generation time is UNKNOWN** —
`getLastConformingStageTimings()` is `import.meta.env.DEV`-gated and browser-only, unreachable from node.

## 3. THE TWO FLOORS — AND THE ANSWER FLIPS BETWEEN THEM

***At 0.01 mm CelticTriquetra's defect is 85.31% MESH-MADE CURTAIN (a generator bug). At 0.001 mm it is
97.7% ORDINARY CHORD SAG (a density bill).*** They are different problems and need different fixes.

**GothicArches is a PROVEN EXACT SINGLE COVER of its chart** — covering number **1.000000**, zero inverted
facets, area excess −0.07% ± 0.11% ⇒ **100% of its residual is chord sag.**

Honest exhaustive position today (perpendicular ruler):

| | over 0.01 mm | MAX | over 0.001 mm |
|---|---|---|---|
| Gothic (shipping) | 0.0287% of area | 0.333 mm | 92.08% |
| CelticTriquetra (guard-OFF) | 2.5154% | ≥0.851 mm | 95.51% |

***THE 0.001 BILL IS AFFORDABLE — ~1.1e7 (Gothic) / ~1.7e7 (CT) triangles.***
⛔ ***BUT 0.001 IS NOT REACHABLE ON THE CURRENT REPRESENTATION, AND THE BLOCKER IS NOT TRIANGLE COUNT:***
**`qMinEdge = 0.04 mm` hard-clamps `MetricSizingField` on 4.79% (Gothic) / 3.67% (CT) of the surface
area.** A 0.001 mm chord bar needs edges below that clamp; the field cannot ask for them. ***That is a
single constant, and it is the actual gate on the 0.001 floor.***

## 4. THE BEST MESHES THIS CAMPAIGN CAN CURRENTLY PRODUCE

### GothicArches — **APCR beats the shipping mesh, and it is fold-free BY CONSTRUCTION**
`s116/S116_BEST_GOTH_APCR.stl` — 1,183,568 facets (**1.036×** the shipping mesh), 38,444.54 mm².

Operator: **analytic-projected conforming refinement** — 20,705 edge bisections in 18 rounds. Why it is
*by construction* and not detect-and-repair:
1. **Rivara LEPP longest-edge bisection always splits both incident triangles**, so a hanging node never
   exists at any intermediate state — conformity is **structural**, not restored afterwards.
2. **Every new vertex is the exact parameter midpoint lifted onto `rA`.** Because radial projection
   preserves (θ, z), ***the parametric footprint sign CANNOT flip*** — a fold is not representable.

| | shipping | APCR | gain |
|---|---|---|---|
| over-0.01 mm AREA | 11.70238 mm² | 0.233742 mm² | ***50.1×*** |
| over-ceiling fold AREA | 0.017866% of mesh | 0.00000093% | **19,271×** |
| triangles | 1,142,166 | 1,183,568 | 1.036× |

⚠ ***THE HEADLINE 175× WAS A RULER ARTEFACT AND THE HONEST FIGURE IS 50.1×.*** The census's R3 projected
only 4 of 45 lattice points, chosen by ranking on a *different* metric (the radial residual), so it is a
sampled **lower** bound — and the under-read is asymmetric in exactly the direction that inflates the
ratio (operator facets sit just under the bar, baseline facets far over). Two cost-matched placebos scored
1.081× and 1.113×, so the operator genuinely dominates them.

**Honest verdict: NO on all three.** 42 facets still over 0.01 mm (MAX 12.93 µm); 94.38% of area still
over 0.001 mm (moved 0.0022 pp — nothing); 583 over-ceiling facets and MAX dihedral still 179.933°.

### CelticTriquetra — **the best mesh is the GUARD-ON one, and nobody was using it**
`celtictriquetra_ring_D--H_S102.stl` — 1,282,394 facets, 48,535.770 mm², excess **0.39%** vs the
guard-OFF mesh's 2.60%. **9.96× less fold area at 25% fewer triangles.** No new operator was needed; the
driver has shipped this guard by default since 2026-07-29.

## 5. WHAT THE RENDERS SHOW — AND TWO MIS-STATEMENTS THEY KILL

The first single-sided renderer this campaign has had, **validated 13/13 against planted defects**.

1. ***GOTHIC HAS ZERO INWARD-WOUND VISIBLE BACK FACES from all four azimuths.*** Its "13.6% back-facing"
   is **the pot INTERIOR seen through the mouth** — quoting that as defect would have been a ***~2000×
   mis-statement***. CT shows 20–32 candidates = 0.0033–0.0068% of visible area (candidates, not verdicts:
   a real overhang also reads `n·r̂ < 0`).
2. **18.4% (Gothic) / 27.9% (CT) of facets cover ZERO samples in frame** at 1000×1300 with 3× supersampling
   — **≈31 µm per sample** on a 120 mm pot, whole pot in frame, one camera distance.

> ### ⛔ CORRECTION — "SUB-PIXEL" DOES NOT MEAN "RESOLVED", AND I DREW THE WRONG CONCLUSION
> I originally wrote that this makes the blade class "nearly invisible" and the visible-defect framing
> "mis-named". ***That inference is withdrawn.*** Zero screen coverage is a fact about **my sampling**,
> not about the geometry:
> - ***A SLICER DOES NOT SAMPLE.*** Plane–triangle intersection is exact arithmetic. A degenerate or
>   folded triangle yields a degenerate/non-manifold intersection **regardless of pixel coverage**.
> - ***31 µm/sample is comparable to or COARSER THAN THE PRINTER.*** Fine SLA is 25–50 µm XY and 25 µm
>   layers. ***The machine can resolve what this camera could not.***
> - **One camera, one distance, whole pot in frame.** The zoom renders in this same set resolve them.
> - ***UNDER-SAMPLED ≠ ABSENT.*** Sub-sample-rate geometry **aliases**; it does not vanish. It still
>   costs file size and still shimmers under motion.
>
> This is the same error class the campaign has repeatedly paid for — stride-sampled PRECOND missing 4
> facets at 1,374.8 µm; the 2-point probe under-reading 13×. ***An instrument that cannot see a defect is
> evidence about the instrument.***
>
> **What survives:** these *are* export/topology defects (that part stands, and is now the stronger
> claim). **What is withdrawn:** that they are therefore not visible, and that the framing was mis-named.
> **The open measurement:** discernibility at *print* resolution and at *inspection* distance, which is
> P5's job — with the mm/pixel stated, not assumed.

## 6. THE ROADMAP

**P0 — build the missing baseline.** Generate CelticTriquetra through the **shipping** path
(`flags.conformingMesher` default, registry defaults, H=120/Rb=40/Rt=50) and measure it. Every
"by construction" claim is currently unanchored without it.

**P1 — install the invariant at `QuadtreeTriangulator`'s `emit` closure (`:627-631`).** It is built,
two-sided-validated, and its decisive terms are free. Add the certificate + an export gate that refuses a
mesh with one violation.

**P2 — raise `qMinEdge`'s clamp (0.04 mm).** This, not triangle count, is what blocks 0.001 mm. The bill
(~1.1e7 / ~1.7e7 triangles) is affordable; the field simply cannot currently ask for edges that small.

**P3 — give the shipping path a curtain/tread emitter.** After the shape guard, the residual concentrates
**177.4×** on the genuine C0 set. A cliff cannot be a graph over (θ, z); emitting it as a degenerate quad
is the remaining structural bug.

**P4 — generalise APCR.** It is the campaign's first real operator win (50.1× on Gothic, fold-free by
construction, 1.036× cost). Run it on the guard-ON CT mesh and across the roster.

**P5 — retire the 45° "visibility" bar, but NOT because the class is sub-pixel.** §5.2's correction
stands: zero screen coverage at 31 µm/sample says nothing about a slicer (exact arithmetic, no sampling)
and nothing about a printer that resolves finer. The bar should be retired because it was **inherited and
never derived**, and because S108 already showed dihedral and `normDeg` dissociate in *both* directions.
Replace it with **two derived bars**: one for **export/topology correctness** (degeneracy, manifoldness,
winding — where sampling is irrelevant), and one for **fidelity/appearance** measured at a **stated
mm/pixel at print and inspection distance**. ***Do not let "sub-pixel" retire anything.***

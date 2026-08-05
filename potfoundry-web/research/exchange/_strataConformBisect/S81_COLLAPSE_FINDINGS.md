# S81 / COLLAPSE — the MIS-ORIENTED class on Voronoi, and whether a vertex-set change can remove it

Agent: COLLAPSE. Read-only over the finished `voronoi_ring_D--.stl` (806,765 facets). Appended continuously.
Tools: `research/tools/s90CollapseCensus.ts` (`run-s90-collapse-census.sh`), `research/tools/s91CollapseCeiling.ts`.
Raw: `S90_PHASE_A.report.txt`, `S90_PHASE_B.log`, `S90_CENSUS.ndjson`, `S91_CEILING.ndjson`.

**RULERS USED, STATED ONCE.** Orientation = the MONOTONE Gauss-map chord `2*sin(θ/2)*diam` (never
`sin(θ)*diam`, which scores an inverted facet at ~0). Position = `certifyTriangle` at tol = 0.010 mm
(never the driver's plane ruler, which reports 0 over-bar on this mesh where `certifyTriangle` proves
396 of the top 400 FAIL). Every population number is given **by COUNT and by AREA**.

---

## 1. PHASE A CENSUS — what the 124,245 actually are  (`S90_PHASE_A.report.txt`, 6.8 s, read-only)

Class definition reproduced EXACTLY from S66: `aspect3 := diam / minAlt >= 50`.
**124,245 facets, 98.31% over the 10 µm orientation bar** — identical to S66's row, so the population is
the same one and nothing below is measuring a different set.

### 1a. THE HEADLINE NUMBER NOBODY HAD: the class is 0.5920% OF THE SURFACE

```
  MIS-ORIENTED aspect3>=50 : 124,245 facets (15.400% of count)    242.52 mm^2  ( 0.5920% of AREA)   98.31% over-bar
  TURNING      aspect3< 50 : 682,520 facets (84.600% of count)  40,725.96 mm^2 (99.4080% of AREA)   29.05% over-bar
  total surface 40,968.5 mm^2
```
**Facet count over-states this class's SURFACE by 26.02×.** (The brief's 23.96× is the GothicArches row of
the S70 table; on Voronoi the whole-mesh figure is 12.96× and for *this class specifically* it is 26.02×.)
Every claim below is quoted against 242.52 mm², not against 124,245.

### 1b. TAXONOMY — they are CAPS, and their normals are barely defined

```
  NEEDLE (e0/e2 <= 0.1)  72,641 (58.47% of count, 35.23% of class area)
  CAP    (e0/e2 >  0.1)  51,604 (41.53% of count, 64.77% of class area)
  largest interior angle (deg)  p10 168.650   p50 177.325   p90 179.387   max 179.968
  e0 shortest edge (um)         p01 0.872  p10 8.810   p50   63.221  p90  227.208  p99  592.313
  e1 middle edge   (um)                    p10 478.190 p50  701.331  p90 1093.471
  e2 longest edge  (um)                    p10 553.935 p50  788.793  p90 1214.813  max 2360.555
  minAlt           (um)         p01 0.030  p10 0.289   p50    2.795  p90   10.542  p99   18.422
  aspect3                       p10 72.1   p50 287.5   p90 2660.2    p99 25480.4   max 797637.1
  area           (um^2)                    p10 103.3   p50 1063.1    p90 4846.1
  ORIENTATION      (deg)        p01 0.643  p10 25.161  p50   75.480  p90  117.497  max  155.666
```
The `e0/e2` split is cosmetic: **the largest interior angle is 177.3° at the median and >168° at p10, so
essentially the entire class is a CAP** — a near-180° vertex sitting `minAlt` off the long edge. The median
member is **789 µm long and 2.8 µm tall**.

Two consequences that decide which lever is even applicable:

1. **The normal of a facet whose three vertices are collinear to 2.8 µm over 789 µm is nearly
   undetermined** — it can rotate about the near-line axis almost freely. An orientation error of 75° at
   the median is the *expected* reading for an under-determined normal, not evidence that the mesher
   "aimed wrong". (s60's own `jitterUm = 1.5·ulp(R)·aspect3` puts the f32 determinacy of these normals at
   ~1.6 µm at the median aspect and ~145 µm at p99 aspect — i.e. at the tail the normal is not even
   f32-determined, and s60 already reported that column.)
2. **The existing driver-side sliver collapse is bounded to edges < 5 µm, and that threshold reaches under
   ~7% of this class** (e0 p10 = 8.81 µm; e0 p50 = 63.2 µm). This is the measured size of the gap the brief
   asked about, and it is why S6 is out of scope here.

### 1c. THEY ARE CLUSTERED — 30× more than chance (H-A3 CONFIRMED, kill was <1.5×)

```
  MIS class      3,176 components   mean size 39.120   max 7,019   hist {1:1625, 2:495, 3-5:408, 6-20:531, 21-100:63, >100:54}
  RANDOM control 95,589 components  mean size  1.300   max    11   hist {1:75185, 2:14755, 3-5:5452, 6-20:197, 21-100:0, >100:0}
  ratio 30.097x
```
The control is non-vacuous (same cardinality, same mesh, random placement — it moves the number by 30×).
**54 components hold >100 facets each and one holds 7,019.** A local re-mesh therefore has purchase: these
are contiguous strips, not scattered singletons. (1,625 singletons do exist — 51% of the *components* but a
small share of the *facets*.)

### 1d. THEY LIE ACROSS THE WALL, ON THE STEEP FLANK (H-A4)

```
  angle(longest edge, grad r), deg   MIS  p10 5.52  p50 20.53  p90 65.32    ALONG(>=60) 15.84%   ACROSS(<=30) 59.57%
                                    ctrl  p10 15.77 p50 63.28  p90 87.76
  |grad r| at the centroid           MIS  p10 1.266 p50 1.936  p90 3.001
                                    ctrl  p10 0.083 p50 0.772  p90 2.548
```
The class sits where the wall is **2.5× steeper than the mesh average**, and its long axis runs **ACROSS**
the wall (down the steepest-descent direction) in 59.6% of cases — the *bad* anisotropy. The TURNING
control is the mirror image (p50 63.3°, i.e. along the level set). Spread over the whole height
(z p10 20.9 → p90 96.5 of H=120), so this is not a rim artefact.

### 1e. Topology of the input, audited by welded INDEX (so later arms have a non-vacuous baseline)

```
  806,765 facets -> 403,683 welded vertices, 1,210,448 edges, boundary 601, non-manifold 0, V-E+F = 0
```
601 boundary edges = the two open rims of a ring; `V-E+F = 0` is the Euler characteristic of an annulus
(χ=0), so the weld is consistent. **Any vertex-set change must reproduce all four of these numbers.**

---

## 2. *** THE CLASS IS FINS — REDUNDANT GEOMETRY, NOT MISSING COVERAGE *** (H-A5, `S90_PHASE_B.log`)

Following the coordinator's H1/H2 note: a facet with LARGE H1 (points ON THE FACET are far from the
surface) and SMALL H2 (points ON THE SURFACE all have a facet nearby) is geometry standing off the wall.
`certifyTriangle` (facet → surface) vs `H2loc` (surface → the facet's 2-ring), 300 per group, tol 10 µm:

```
                        H1 witnessed (facet->surface, um)                H2loc (surface->2-ring, um)
  MIS-ORIENTED   p10   1.294   p50  10.039   p90  50.948   max 123.682 | p10 0.289  p50 1.422  p90 4.552  max 10.835
  TURNING (ctl)  p10   1.103   p50   1.957   p90   5.190   max 171.771 | p10 1.099  p50 1.949  p90 4.304  max  9.023
  H2self (surface -> THIS facet only): MIS p50 6.005 / max 125.641   ctl p50 2.206 / max 157.984
  H1 PROVEN-FAIL at 10 um:  MIS 150/300      TURNING control 19/300      (7.9x enriched)
```

**FIN RATIO H1p50/H2locp50 = 7.06× on the class, 1.00× on the control.** The control is the thing that
makes this non-vacuous: run the identical instrument on well-shaped facets and the two rulers agree to
three digits; run it on the class and they differ 7×.

Read the third row too: **H2self (6.005 µm) is 4.2× LARGER than H2loc (1.422 µm)** — the surface inside a
MIS facet's own footprint is four times closer to one of its NEIGHBOURS than to the facet itself. These
facets are not carrying the surface. They are extra.

**This is the load-bearing fact for the whole assignment**: the class is not under-resolved surface (which
would need more triangles) and not mis-aimed surface (which would need better placement). It is *surplus*
surface, and the only operation that removes surplus is one that changes the vertex set.

---

## 3. THE SINGLE-OPERATION CEILING — 1.98% by count, 1.48% by area  (`S91_STAGE1b.log`, 43 s)

Every vertex-set operation available to each of the 124,245, evaluated on the unmodified mesh:
* **OP-A** half-edge collapse `v→u`, all 3 edges × both directions (6 candidates);
* **OP-B** delete the apex (the vertex opposite the longest edge) and re-triangulate its 1-ring by an
  **exact O(k³) min-max DP** — run TWICE, unconstrained, once minimising max orientation chord and once
  minimising max `aspect3`, so the two existence questions are answered separately and exactly.

```
  ladder                                                   MIS class            TURNING control (n=20,000)
  L0  a topologically admissible op EXISTS                 96.19% / 93.21% area   99.32% / 99.75% area
  LA  + best triangulation has max aspect3 < 50             5.29% /  8.73%        96.74% / 99.14%
  LC  + best triangulation is <= 10 um chord                1.98% /  1.48%        57.59% / 79.09%

  min-max ORIENTATION chord achievable (um)   p10  524.4  p50 1352.5  p90 1934.6   [ctl p50    8.2]
  SAME PATCH BEFORE, max chord         (um)   p10  711.0  p50 1378.9  p90 1925.7   [ctl p50   11.1]
  AFTER/BEFORE ratio on the same patch        p10  0.813  p50  0.987  p90  1.112   [ctl p50  0.932]
  min-max ASPECT3 achievable                  p10  111.3  p50  647.3  p90 2907.4   [ctl p50    3.6]
```

**H-B1 REFUTED at the pre-registered 20%-by-area kill line: LC by area is 1.48%.**

Three things this says, in order of importance:

1. **The blocker is NOT topology.** 96.19% of the class *has* a legal operation. The blocker is that the
   operation lands the defect on a NEIGHBOUR — `A:fold` on **494,895 of 745,470** collapse candidates
   (66.4%): moving the vertex INVERTS an adjacent facet, and adjacent facets are themselves slivers
   because the class is clustered 30×.
2. **The best available operation moves the patch by 1.3%** (after/before ratio p50 0.987, improves at
   all on 65.21%). That is the same order as the flip's 98.31%→97.14%. Two structurally different levers,
   the same non-result — which is itself evidence the obstruction is upstream of the operator.
3. **The control validates the instrument**: 5.29% LA on the class vs **96.74%** on random well-shaped
   facets. The refusals are the mesh's, not the tool's.

### Honesty notes on this measurement
* The first version of `s91CollapseCeiling.ts` folded the "no new sliver" test into the DP cost, so its
  refusal bucket read `no-valid-retriangulation=120000` — conflating "no legal triangulation exists" with
  "every triangulation contains a sliver". Fixed, re-run, and recorded in the tool header rather than
  silently patched. The corrected split is `no-legal-ear-in-projection = 109,261`.
* **87.97% of the apex 1-ring polygons are NON-SIMPLE in the tangent-plane projection** the OP-B DP uses.
  That is itself a finding (a fin's 1-ring folds back on itself, so the neighbourhood is not locally
  embeddable), but it means OP-B's refusals cannot be attributed cleanly to the mesh. **The ladder above
  does not depend on it**: OP-A, which uses no projection at all, wins the best-operation slot 108,044
  times out of 119,517 (90.4%).
* Stage 0, free and exact on all 124,245: deleting the apex introduces a position error of **at least
  `minAlt`**, and `minAlt ≤ 10 µm` on **88.40% by count / 58.27% by area**. That is a hard upper bound on
  any deletion-based ceiling, and the measured ceiling is far below it — so position is NOT what binds.

---

## 4. THE SEQUENTIAL PASS — built, run, topology-clean, and REFUTED  (`S92_ARM*`, `s92CollapsePass.ts`)

A single-shot census under-states reachability when operations unlock each other, and this class is
clustered 30×, so the objection is real. I built the actual greedy worst-first collapse pass, ran it to
convergence, and audited the output by welded index. **Two arms**, both to convergence:

| | applied | MIS class facets | class AREA removed | mesh-wide over-bar **AREA** | mesh surface area | honest position on changed facets |
|---|---|---|---|---|---|---|
| input | – | 124,245 | – | 13.1391% | 40,968.49 mm² | – |
| **ARM 1** no improvement guard, 2 rounds | 6,962 | 112,464 | **14.93%** | **13.5914% (WORSE)** | +0.42% | over-bar 4/20 → **7/20** |
| **ARM 2** improvement-guarded, converged in 3 rounds | 5,107 | 117,568 | **8.57%** | **13.2007% (WORSE)** | −0.0135% | over-bar 4/60 → **9/60** |

`certifyTriangle` tol 0.010 for the position column. Topology audited on both: **non-manifold 0, boundary
601, boundary loops 2, inconsistent-winding 0, Euler V−E+F = 0 — H-C3 PASS.** The pass is not broken.

**H-C1 REFUTED — there is no unlocking.** The guarded sequential pass converges at **8.57% of class area**,
which is 98% of the single-shot LA ceiling of **8.73%**. Two completely different search procedures land on
the same number; that is the ceiling, not an artefact of either.

**H-C2 REFUTED — and this is the one that matters.** Both arms make the mesh-wide mis-oriented AREA
*worse*. Deleting a fin merges two vertices and the surviving neighbours inherit the defect. The guard
(apply only if the patch's max chord strictly falls) reduces the damage from +3.4% to +0.5% and stops the
area inflation, but it cannot make the sign positive.

### *** 4a. AND THE CLASS IS 4.456% OF THE DEFECT IT IS SUPPOSED TO EXPLAIN ***

```
  mis-oriented AREA, whole mesh      5,382.91 mm2   (13.139% of the surface)
  of which the MIS-ORIENTED class      239.86 mm2   =  4.456%
  of which the TURNING class         5,143.05 mm2   = 95.544%
  by COUNT the same split is 38.78% / 61.22%
```
So the ceiling in the terms the brief asked for: **8.6% of a class that is 4.5% of the defect = 0.38% of
the mesh's orientation error is reachable by any vertex-set change.** That number is the answer, and it
is small enough to be decisive on its own.

---

## 5. *** THE ACTUAL CAUSE: 69 SUPER-HUB VERTICES. IT IS A MESHER BUG, NOT A DEFECT CLASS. ***

The parameter-plane plot (`s94plot/hub_2550.png`, `s94plot/fins_param.png`) shows the thing every scalar
missed: the MIS facets are not chains of near-collinear vertices, they are **FANS CONVERGING ON A SINGLE
VERTEX**. Measured:

```
  voronoi_ring_D--   806,765 tris   403,683 verts   median vertex facet-degree 5   p99 13
    deg >= 1000 :  32 vertices | fans hold  45,324 facets ( 5.62% of the MESH)  311.96 mm2 | 22.56% of the class
    deg >=  500 :  50 vertices | fans hold  59,830 facets ( 7.42%)              407.52 mm2 | 30.02%
    deg >=  100 :  69 vertices | fans hold  64,730 facets ( 8.02%)              444.28 mm2 | 32.56% of class count, 36.44% of class AREA
    worst hubs: deg 2550 (1,000 MIS facets) @ th -3.0788 z 54.857 | 2530 | 1700 | 1698 | 1500
```

**32 vertices consume 5.62% of the entire triangle budget of this mesh.**

### The control that makes it a bug rather than a property of the style

Identical instrument, same aspect3 ≥ 50 definition, other meshes on disk:

```
  mesh                                    tris      max vertex degree   verts deg>=100   MIS facets
  voronoi_ring_D--   (this mesher)      806,765         2,550                69          124,245  (15.40%)
  voronoi_D--        (SAME STYLE)       671,823            57                 0           12,652  ( 1.88%)
  gothicarches_ring_D--                  61,120            47                 0            1,288  ( 2.11%)
  lowpolyfacet_ring_D--                 137,480            10                 0                0  ( 0.00%)
```

**The same style, meshed by another configuration, has zero vertices over degree 57 and 8.2× less of the
class as a fraction of facets.** The top hub location is geometrically real — `voronoi_D--` has a vertex at
the *same* (θ = −3.0788, z = 54.857, r = 46.571), a genuine Voronoi junction — but it carries **degree 57
there and degree 2,550 here.** Whatever produces the fan is in this mesher's handling of that junction,
not in the surface.

### This is also the complete explanation of why every local lever failed

A flip, the exact hexagon-cavity DP (S63), an edge collapse and a vertex removal are all **1-ring
operations**. The 1-ring of a degree-2,550 vertex is a 2,550-gon. Concretely, in my own runs:
* `removeVertex` refuses `deg > 12` on cost grounds — it never even looks at a hub;
* `A:fold` fires on **494,895 of 745,470** collapse candidates, because moving any vertex adjacent to a
  2,550-triangle fan inverts some member of that fan;
* 87.97% of apex 1-rings are non-simple in tangent projection — a fan's neighbourhood is not locally
  embeddable.

**No local operator can repair a 2,550-triangle fan, and none should have to.** The fan must not be
emitted. That is upstream of everything my assignment is scoped to.

---

## 6. VERDICT AND WHAT I DID NOT DO

**THE CEILING (the number asked for):** a vertex-set change that preserves topology and does not regress
orientation reaches **8.6% of the MIS class by area** (single-shot exact bound 8.73%; sequential pass to
convergence 8.57%; two independent procedures agreeing). Because the class is **4.456% of the mis-oriented
AREA**, that is **0.38% of the mesh's orientation defect**. Collapse, re-point and delete-and-retriangulate
are **REFUTED as a remedy for this class**, and refuted with a clean topology audit so the refutation is
not an implementation artefact.

**But the class is not a representation problem.** One third of it (36.44% by area) is 69 pathological
super-hub vertices that another mesher run of the same style does not produce. The right next action is
**not** a new operator — it is to find and fix whatever emits a degree-2,550 vertex.

### What I did NOT do, named
* **I did not find the code that creates the hubs.** I have the locations (θ/z/r of the top 32, in
  `S90_CENSUS.ndjson` / §5) and the control mesh that lacks them, but locating the emitting site in the
  driver is not mine (`_strataConformBisect*` is not my file). **Handing this to whoever owns the driver.**
* **I did not run any style but Voronoi at full depth.** The hub census is cross-style (§5, 4 meshes) but
  the collapse ceiling is Voronoi-only. GothicArches has 2 MIS facets, so there is nothing there to price.
* **I did not price a fan-aware operator** (re-mesh a whole hub fan at once). It is the obvious next arm
  if anyone wants the class closed rather than the bug fixed, but it would be repairing output the mesher
  should not produce.
* **I did not re-run S91 with the HUB as the vertex-removal target instead of the apex.** The render
  showed the hub is one of the two *base* vertices (their facet-degree p90 is 1,120 against the apex's 6),
  so my OP-B was aimed at the wrong vertex for ~a third of the class. It would not change the verdict —
  a 2,550-gon cavity is outside any O(k³) DP — but the ladder in §3 is an under-estimate for that third,
  and I am flagging it rather than leaving it implicit.
* **The 3D render (`s93render/fins.png`) is honest but uninformative** — 2.8 µm-tall facets vanish at any
  camera distance that shows the wall. The parameter-plane plots are the evidence.
* **A bug in my own `s94FinPlot.ts` printed a blank PNG** (absolute z passed to a window-relative mapping).
  Caught only because I added painted/clipped pixel counters; a blank plot would otherwise have read as
  "no geometry here". Fixed, counters kept.

### Files
* Tools: `research/tools/s90CollapseCensus.ts`, `s91CollapseCeiling.ts`, `s92CollapsePass.ts`,
  `s93ClusterRender.ts`, `s94FinPlot.ts` (+ their `run-s9*.sh`, each with its own derived bundle path).
* Data: `S90_PHASE_A.report.txt`, `S90_PHASE_B.log`, `S90_CENSUS.ndjson`, `S91_STAGE0.report.txt`,
  `S91_STAGE1b.log`, `S91_CEILING.ndjson`, `S92_ARM1_NOGUARD.report.txt`, `S92_ARM2_GUARD.report.txt`,
  `S92_PASS.ndjson`, `s92pass/voronoi_ring_D--_S92.stl`.
* Pictures: `s94plot/hub_2550.png` (the degree-2,550 fan), `s94plot/fins_param.png`,
  `s93render/fins.png` (3D, superseded).

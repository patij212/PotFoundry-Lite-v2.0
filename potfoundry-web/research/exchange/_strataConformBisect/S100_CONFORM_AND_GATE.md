# S100 — THE CONFORMANCE-TERM ATTRIBUTION, THE MOVE OPERATOR, AND THE BACK-FACING SHIP GATE

Three pre-registered arms. **Two of the three refute the thing they were built to confirm**, and one of
those is the headline.

| task | pre-registered kill line | measured | verdict |
|---|---|---|---|
| **1** `PF_CB_DRIVER=sweep` A/B | < **3×** reduction in crease-crossed **AREA** ⇒ attribution REFUTED | at EQUAL triangle budget the AREA **ROSE 3.42×** (1.012% → 3.460%) while COUNT fell 2.60× | **REFUTED** |
| **2** `PF_CB_MOVE43H=1` real driver arm | crossings must fall **below 1,600** AND minAngle p05 not worse than 1.5× | crossings **3,844** (baseline 3,187 — they ROSE 1.21×); minAngle p05 1.005× | **REFUTED** |
| **3** back-facing ship gate | must reproduce **690 / 0.00596%** (Gothic) and **488 / 0.01298%** (Voronoi) | **690 / 0.00596%** and **488 / 0.01298%**, exact | **WIRED + VALIDATED** |

> ### THE HEADLINE
> **S99's DIAGNOSIS is right and its REMEDY is refuted.** Turning on the driver that HAS a conformance
> term collapses the exact gate S99 named — "accepted by the blind plane ruler" falls from **97.27% to
> 9.17%** of the crease-crossing area — and makes the mesh **worse by every area-weighted measure**:
> crease-crossed AREA **3.42× worse**, surviving crossings' orientation chord **63.8× worse**,
> back-facing facets **3.22× worse**, minAngle p05 **1.55× worse**, all at the SAME 1.26 M triangles.
> The defect does not leave the mesh; it moves from gate A into the `move-deferred` dead end (**0.395% →
> 71.448%** of that area, **181×**), because a conformance demand that cannot be met **does not fall
> back to a size split**. *Raising the demand without an operator that can satisfy it is worse than not
> raising it.*

Instruments: `research/tools/s99CreaseCensus.ts` (S99's own crease detector — no third detector was
invented), `research/tools/s100BackFacingGate.ts` (new; S98's arithmetic at a screen+confirm schedule).
Every population is reported by COUNT **and** AREA. The plane ruler `sagAdaptiveRaw` appears only as the
driver's own accept quantity and never as a verdict.

---

## 0. AN OPS FACT THAT SHAPED TASK 1, FOUND BY THE SMOKE RUN RATHER THAN ASSUMED

```
_strataConformBisectS34.test.ts:1057
const ALIGNED_SEED = envOn('PF_CB_ALIGNED_SEED') && !SWEEP && !GPU_RANK;
```

**The aligned constrained seed is structurally unavailable to the sweep driver.** A sweep arm always
starts from the uniform `gu × gv` grid. `PF_CB_TIGHTEN` is likewise refused under sweep (it is a
`consider()` lever). S99 established that the aligned seed is what does most of the conforming today —
"the survivors ARE the seed's residue, subdivided", 1,392 of 382,644 seed edges crossing a locus against
10,641 uniform — so giving the seed to the heap arm alone would confound the DRIVER with the SEED.

**Both arms therefore run the uniform seed and no tightening field, and the only variable is
`PF_CB_DRIVER`.** The consequence is stated up front: this heap arm is NOT the committed S39CTL mesh and
its crease numbers are far worse than production's. That direction is *safe for a refutation* (the
control has more crossings available to remove, which favours sweep) and *unsafe for a confirmation*.

---

## 1. TASK 1 — THE SWEEP-DRIVER A/B

### 1.1 What the arms are

| | heap control | sweep arm |
|---|---|---|
| tag | `gothicarches_ring_DS-H_S100*HEAP` | `gothicarches_ring_DS-WH_S100*SWEEP` |
| driver | `heap` (`consider()`, plane-sag accept, no conformance term) | `sweep` (`triangleNeed`, **conformance FIRST**) |
| seed | uniform (see §0) | uniform (forced) |
| everything else | identical | identical |

Script: `research/tools/run-s100-sweep-ab.sh`. `PF_STRATA_CB=1` is set inside it; every run below was
checked for `1 passed` (never `1 skipped`) before any number was read.

### 1.2 SMOKE PAIR — an EQUAL-BUDGET pair by construction (checkpointed first, on purpose)

Grid 60×40, `PF_CB_TRICAP=400000`. The cap binds in both arms, and because the driver's alloc cap fixes
`live = (alloc + initTris)/2`, **both arms emit exactly 202,400 triangles — identical file size to the
byte.** Census: `s99CreaseCensus`, N=100,000 golden stride = 49.4% of each mesh.

| quantity (instrument: `s99CreaseCensus`, h-free two-sided Gauss-map detector, turn > 1°) | HEAP | SWEEP | ratio |
|---|---|---|---|
| triangles | 202,400 | 202,400 | **1.000 (equal by cap)** |
| wall seconds | 445 | **95** | sweep **4.7× faster** |
| rA evals | 473 M | 202 M | 0.43× |
| crease-crossing facets, **COUNT** % of all | 5.256% | **2.161%** | **2.43× FEWER** |
| extrapolated whole-mesh crossing facets | 10,638 | **4,374** | **2.43× fewer** |
| crease-crossing **AREA** % of all | 5.496% | **9.631%** | **1.75× WORSE** |
| share of the OVER-BAR defect AREA | 5.561% | 12.600% | 2.27× worse |
| CROSSED orientation chord `tangUm` p50 | 403.9 µm | **5,535 µm** | **13.7× WORSE** |
| CROSSED `normDeg` p50 | 18.93° | 84.87° | worse |
| whole-mesh over-bar AREA (context) | 98.822% | 76.433% | sweep better overall |
| unresolved facets | 631 (all `shape-ar`) | **10,189** (`move-deferred` 9,533) | 16.1× more |
| worst unresolved (EDGE ruler) | 639.5 µm | **1,509.1 µm** | 2.36× worse |

**⇒ AGAINST THE PRE-REGISTERED KILL METRIC (crease-crossed AREA), THE SMOKE PAIR IS A REFUTATION: the
area did not fall 3×, it ROSE 1.75×.**

### 1.3 THE MECHANISM DID CHANGE — the attribution is half right and the half that is right is not enough

The census's own gate split, on the surviving crossings, is the cleanest evidence in this report:

| gate the surviving crossing sits behind | HEAP (cnt / AREA) | SWEEP (cnt / AREA) |
|---|---|---|
| **A. ACCEPTED by the plane ruler** (`sagAdaptiveRaw < acceptTol`) | 8.371% / **7.533%** | 4.535% / **0.417%** |
| **B. not accepted, IN the `SNAP_ALPHA` band ⇒ the `move-deferred` dead end** | 33.010% / 26.017% | 47.941% / **51.645%** |
| **C. not accepted, out of band ⇒ SHAPE/AR refusal or budget** | 58.619% / 66.450% | 47.524% / 47.938% |

**Gate A — the exact gate S99 named — collapses by 18× in AREA (7.533% → 0.417%).** The conformance term
does precisely what S99 said it would: crease crossings can no longer leave the queue by passing a blind
plane-sag test. That part of the attribution is **CONFIRMED**.

**But the defect moved into gate B rather than out of the mesh.** `triangleNeed` returns
`need:'conform'`, `refineOne` reaches the `SNAP_ALPHA` in-band case, and §4.3's vertex move is
**DEFERRED BY DESIGN under sweep** (the driver's own header says so: "spec §4.3 SNAP-TO-LOCUS VERTEX
MOVE — DEFERRED … recorded as the explicit unresolved reason `move-deferred`"). The triangle is then
dropped from the work list **without falling back to a size split**, which the heap driver would have
performed. Hence: 9,533 `move-deferred` unresolved against the heap's 0, worst unresolved 1,509 µm
against 639 µm, and a crossing population whose orientation chord p50 is **13.7× larger**.

**This is the AR-cap signature again** (`project_ar_cap_is_the_residual`: "2.13× fewer failing facets by
COUNT, WORSE by area"). *A COUNT-only reading of this arm would have reported a 2.43× win.*

### 1.4 FULL-SCALE PAIR — grid 200×140, EQUAL TRIANGLE BUDGET TO ONE TRIANGLE

The control ran uncapped (`PF_CB_TRICAP=8000000`) and **DRAINED** at alloc 2,464,436 → 1,260,218
triangles. The treatment arm was then capped at *exactly that alloc*, which pins the two meshes to the
same size because every split here is a 1→2 bisection (`live = (alloc + initTris)/2`, verified on both
smoke arms). Result: **1,260,218 vs 1,260,219 triangles — a ONE-TRIANGLE difference.**

| quantity | **HEAP control** | **SWEEP arm** | ratio |
|---|---|---|---|
| **triangles** | **1,260,218** | **1,260,219** | **1.0000008 — equal budget** |
| alloc / cap | 2,464,436 / 8,000,000 (drained) | 2,464,438 / 2,464,436 `[CAPPED]` | |
| wall seconds | 937 | **374** | sweep **2.51× faster** |
| rA evals | 1,079 M | 584 M | 0.54× |
| **crease-crossing facets, COUNT % of all** | 2.188% | **0.841%** | **2.60× FEWER** |
| extrapolated whole-mesh crossing facets | 27,574 | **10,598** | 2.60× fewer |
| **⇒ crease-crossing AREA, % of all (THE KILL METRIC)** | **1.012%** | **3.460%** | **3.42× WORSE** |
| share of the OVER-BAR defect AREA | 2.260% | 7.697% | 3.41× worse |
| **CROSSED orientation chord `tangUm` p50** | **36.78 µm** | **2,346 µm** | **63.8× WORSE** |
| CROSSED `normDeg` p50 | 2.230° | 101.3° | worse |
| unresolved facets | 9,794 | **103,414** | 10.6× more |
| unresolved reasons | `shape-ar`-family 9,794 | **`move-deferred` 63,687** + `shape-refused` 39,727 | |
| worst unresolved (EDGE ruler) | 873.4 µm | 1,225.7 µm | 1.40× worse |
| whole-mesh over-bar AREA (context) | 42.580% | 44.870% | 1.05× worse |
| **back-facing facets** (Task-3 gate, full mesh) | **9,944** (0.7891%) | **32,054** (2.5435%) | **3.22× WORSE** |
| **back-facing AREA** | **0.23533%** | **0.55982%** | **2.38× WORSE** |
| whole-mesh minAngle **p05** | 3.585° | **2.308°** | **1.55× worse** |
| P(minAngle < 5°) | 8.1135% | **16.7605%** | 2.07× worse |

### *** VERDICT: THE KILL LINE IS CROSSED IN THE OPPOSITE DIRECTION. REFUTED. ***

> The pre-registered line was **"< 3× reduction in crease-crossed AREA ⇒ the missing-conformance-term
> attribution is REFUTED."** Measured at equal triangle budget: the crease-crossed AREA **rose 3.42×**.
> The smoke pair, also at equal budget and a different scale, agrees (1.75× worse). **REFUTED.**

### 1.5 AND HERE IS EXACTLY WHY — the diagnosis is right, the remedy is not

The census's own gate split is the mechanism, and it changes by two orders of magnitude:

| gate the surviving crossing sits behind | HEAP (cnt / **AREA**) | SWEEP (cnt / **AREA**) |
|---|---|---|
| **A. ACCEPTED by the plane ruler** — the gate S99 named | 79.342% / **97.267%** | 18.668% / **9.170%** |
| **B. IN the `SNAP_ALPHA` band ⇒ the `move-deferred` dead end** | 1.645% / **0.395%** | 61.712% / **71.448%** |
| **C. out of band ⇒ SHAPE/AR refusal or budget** | 19.013% / 2.338% | 19.620% / 19.382% |

* **S99's DIAGNOSIS IS CONFIRMED.** Gate A — "the crossing left the queue because a blind plane-sag test
  accepted it" — collapses from **97.267% to 9.170%** of the crease-crossing area (10.6×). The
  conformance term does exactly what S99 said the heap driver lacks.
* **S99's IMPLIED REMEDY IS REFUTED.** Gate B goes from 0.395% to **71.448%** of that area — **181×**.
  `triangleNeed` returns `need:'conform'`; `refineOne` reaches the in-band `SNAP_ALPHA` case; §4.3's
  vertex move is **DEFERRED BY DESIGN under sweep** (the driver's own header: "spec §4.3 SNAP-TO-LOCUS
  VERTEX MOVE — DEFERRED … recorded as the explicit unresolved reason `move-deferred`"); and the
  triangle is then **dropped from the work list without falling back to a size split**. The heap driver
  would have split it for size. So the demand is raised, cannot be met, and *suppresses the one action
  that was still working*.

**⇒ RAISING THE DEMAND WITHOUT AN OPERATOR THAT CAN SATISFY IT IS WORSE THAN NOT RAISING IT.** 2.60×
fewer crease crossings, each **63.8× worse**, 10.6× more unresolved facets, **3.22× more back-facing
facets** and **1.55× worse minAngle p05 — at identical triangle count**.

This is the AR-cap signature (`project_ar_cap_is_the_residual`: "2.13× fewer failing facets by COUNT,
WORSE by area") and the one-sided-bar trap (`feedback_one_sided_bars_are_vacuous`) in one arm.
**A COUNT-only reading of this experiment would have reported a 2.60× win and shipped it.**

### 1.6 VISUAL EVIDENCE — and it agrees with the metric

`research/exchange/_strataConformBisect/s100/render/S100_BACKFACING_AB.png`
(whole CLOSED mesh, `research/render/s98BackfaceRender.cjs`, flat-shaded, `DoubleSide` in all three
cells so no culling ambiguity exists; bucket-(a) painted red but sub-pixel at this zoom — **what you are
looking at is the GEOMETRY**.)

**LEFT** production heap (aligned seed + tighten, 1.14 M tris) — arch ribs are clean continuous curves.
**MIDDLE** the S100 heap control (uniform seed, 1.26 M) — still clean.
**RIGHT** the S100 sweep arm, **the same 1.26 M triangles** — **every rib and every column is visibly
TORN**: a continuous ragged serration along exactly the feature lines the conformance term was supposed
to protect.

⇒ **The render is the same finding as the table.** The sweep driver does not fail to notice the creases;
it notices them, demands a conformance it cannot deliver, abandons the facet, and leaves the feature line
shredded. `S100_BACKFACING_ZOOM.png` (1.2 mm patches) shows the needle blades in red — *it is an OPEN
patch and S98 §4's warning applies*: a patch's far side is legitimately back-facing to the camera, so it
is cited only as supplementary texture, never as the verdict.

### 1.7 A SIDE FINDING THAT FALLS OUT, AND IT IS LARGE

The §0 confound had to be paid, and paying it prices the aligned seed + tightening field for the first
time on this class. Production (`S39CTL`) vs the S100 heap control differ only in seed + tighten:

| | production `S39CTL` | S100 HEAP (uniform seed, no tighten) | |
|---|---|---|---|
| triangles | 1,142,166 | 1,260,218 | production has **10% FEWER** |
| crease-crossing AREA | 0.037% | 1.012% | **27×** |
| extrapolated crossing facets | 3,187 | 27,574 | **8.7×** |
| back-facing facets | 690 | 9,944 | **14.4×** |
| back-facing AREA | 0.00596% | 0.23533% | **39.5×** |
| minAngle p05 | 7.169° | 3.585° | **2.00×** |

**The measurement is conservative — production also has 10% fewer triangles, so density works against
it.** This is an artefact-level comparison (two levers, not one), but the direction and order of
magnitude are safe: **the aligned seed is doing the conforming, and it is worth ~27× on the crease class
and ~39× on the back-facing class.** That is consistent with S99's (c) finding that "the survivors ARE
the seed's residue, subdivided", and it is the strongest argument yet against any driver change that
costs the seed.

---

## 2. TASK 2 — `PF_CB_MOVE43H`, AS A **REAL DRIVER ARM**

### 2.1 The arms already existed, and the control is byte-identical to S99's baseline mesh

`run-s35-move43h-and-full-cert.sh` ran the pair **sequentially in one session** on 2026-08-04
(21:12 / 21:27), identical in every flag but `PF_CB_MOVE43H`. And:

```
md5  9d5061f111f683ce65644809ded04876  gothicarches_ring_DS-HT_S35CTL.stl
md5  9d5061f111f683ce65644809ded04876  gothicarches_ring_DS-HT_S39CTL.stl
```

**S35CTL is BYTE-IDENTICAL to S39CTL**, the mesh S99 censused. So the control needs no re-measurement:
S99's published Gothic numbers ARE this A/B's control, at the same N and the same instrument.

The lever fired hard — from the treatment arm's own report:
`PF_CB_MOVE43H=1 cap 50.0 um / star<=64 MOVED 4818, refused 439 on shape + 92 boundary + 3402
per-vertex-cap + 17821 other; displacement mean 7.56 / max 49.99 um`.

### 2.2 THE RESULT — REFUTED, AND IN THE WRONG DIRECTION

Census N=100,000 golden stride on each mesh (8.77% / 8.77%), `s99CreaseCensus`, turn > 1°:

| | **S35CTL** (MOVE43H=0) | **S35M43H** (MOVE43H=1) | ratio |
|---|---|---|---|
| triangles | 1,142,166 | 1,140,696 | 0.9987× (−1,470) |
| wall seconds | 821.6 | 848.1 | 1.032× |
| unresolved | 774 | 838 | 1.083× |
| crease-crossing facets in sample | 279 | 337 | 1.208× |
| **extrapolated whole-mesh crossing FACET COUNT** | **3,187** | **3,844** | **1.21× WORSE** |
| crease-crossing **COUNT** % of all | 0.279% | 0.337% | 1.21× worse |
| crease-crossing **AREA** % of all | 0.037% | 0.059% | 1.59× worse |
| share of the OVER-BAR defect AREA | 0.086% | 0.132% | 1.53× worse |
| CROSSED `normDeg` p50 | 82.51° | **102.1°** | worse |
| **CROSSED orientation chord `tangUm` p50** | **228.2 µm** | **318.2 µm** | **1.39× WORSE** |
| crossed facet diam p50 | 0.6883 mm | 0.3119 mm | 2.21× smaller |
| IN the `SNAP_ALPHA` band, AREA | 70.121% | 55.390% | the move DID consume in-band crossings |
| gate B (`move-deferred`), cnt / AREA | 1.075% / 0.255% | 2.374% / 1.446% | 5.7× more area |

**PRE-REGISTERED KILL LINE (S99's own): crossings must fall below 1,600 AND minAngle p05 must not worsen
by more than 1.5×.**

* **Clause 1 — KILLED, and not narrowly.** 3,844 against a 1,600 line, and they went **UP** from 3,187.
  Poisson σ on the extrapolated count is ≈ ±210, so the line is ~10σ away; the *direction* of the 21%
  rise is ≈2.3σ and is quoted as suggestive, not established. The kill verdict does not depend on it.
* **Clause 2 — passed.** minAngle p05 7.169° → 7.204° = **1.005×** (better, not worse).

**⇒ `PF_CB_MOVE43H` IS REFUTED AS A REAL DRIVER ARM. S99's synthetic 228 → 26 µm does not survive contact
with the mesher: the real arm reads 228 → 318 µm.** The synthetic operator measured the moved facets in
isolation at the instant of the move; the real driver keeps refining afterwards, the moved vertex changes
its star, and the loop manufactures new crossings faster than the move retires old ones. *This refutes my
own prior expectation that a free operator with an 8.7× synthetic win would at least not make things
worse.*

### 2.3 THE SLIVERS-FOR-CREASES TRADE THE BRIEF ASKED ME TO WATCH FOR — **IT DID NOT HAPPEN**

Measured with the Task-3 gate (full mesh, both arms, same instrument):

| | **S35CTL** (OFF) | **S35M43H** (ON) | ratio |
|---|---|---|---|
| **unambiguous BACK-FACING facets** | **690** | **708** | **1.026×** |
| back-facing **AREA** | **0.00596%** | **0.00643%** | **1.079×** |
| screen-flagged (centroid) | 1,502 | 1,537 | 1.023× |
| straddle-only (fidelity, not orientation) | 812 | 829 | 1.021× |
| whole-mesh minAngle **p05** | 7.169° | 7.204° | 0.995× (better) |
| whole-mesh minAngle p10 / p50 | 10.043° / 26.468° | 10.077° / 26.496° | flat |
| **P(minAngle < 5°)** | **2.0641%** | **2.0284%** | **better** |
| back-facing minAngle p05 / p50 | 1.783° / 4.201° | 1.750° / 4.114° | flat |

**S99's synthetic "Gothic sliver share rises 39.4% → 69.2%" DOES NOT APPEAR AT WHOLE-MESH SCALE.** That
figure was a facet-LOCAL probe of the moved facets only. In the real arm the whole-mesh sliver share
*falls* slightly and back-facing rises 2.6% by count / 7.9% by area — i.e. the operator neither buys the
crease win nor pays the sliver price. **Refuting the expected cost is as much of this result as refuting
the expected benefit.**

---

## 3. TASK 3 — THE BACK-FACING SHIP GATE

`research/tools/s100BackFacingGate.ts` + `research/tools/run-s100-bf-gate.sh`.

### 3.1 What it does

**SCREEN** the O(1) centroid test (5 rA evals/facet, best of 5 one-sided analytic candidate normals,
scored against the STL's **OWN WINDING**) → **CONFIRM** the ~0.13% it flags with S98's 45-point covering
(k=8, inset 0.02). The covering is the verdict; the centroid test is only a screen.

**PASS ⟺ ZERO unambiguous back-facing facets.** There is no accept band. On FAIL it prints the count, the
AREA, and **names the worst facets** — facet index in the STL, area, worst angle, minAngle, diameter,
`(x,y,z)` and `θ` — plus an ndjson of every one and a machine-readable json summary.

**MODE: REPORT-ONLY BY DEFAULT — exit 0 whatever the verdict.** Blocking is opt-in with
`PF_S100_GATE_BLOCK=1` (FAIL → exit 3, NOT-MEASURED → exit 4). The mode is printed on its own line on
every run. This is deliberate: other agents' long jobs are running against this tree.

### 3.2 The two things it had to get right

1. **It never flips the facet normal.** `normDeg > 90` under `orient:'outward'` measures the exact
   COMPLEMENT of this class (S98's theorem: the outward block replaces `f` with `−f` when
   `f · n_S(centroid) < 0`, after which `normDeg ≤ 90` by construction; Jaccard 0.0000 on four meshes).
   Every dot product in this gate is against the STL's own winding. **It reports 690 on Gothic, not
   S97's 305 — i.e. it is measuring the right class.**
2. **A check that did not run reads `NOT-MEASURED`, never 0.** Every field is `number | null` rendered by
   a `fmt()` that prints `NOT-MEASURED` for null, and the VERDICT itself is three-way:
   PASS / FAIL / **NOT-MEASURED**. The screen's recall is *not* assumed to be 100%: it prints
   `NOT-MEASURED` unless `PF_S100_FULLCOVER=1` actually measures it on that mesh.

### 3.3 VALIDATION — it reproduces S98 exactly, and three non-vacuity controls fire

| control | expected | measured | |
|---|---|---|---|
| **Gothic S39CTL full mesh** | S98: **690** facets / **0.00596%** AREA | **690** / **0.00596%** (2.290105 of 38453.259 mm²) | ✅ exact |
| **Voronoi `_S94CTL` full mesh** (the config that ships) | S98: **488** / **0.01298%** | **488** / **0.01298%** (5.242924 of 40394.113 mm²) | ✅ exact |
| screen precision | S98: ~46% | 45.94% (Gothic) / 46.56% (Voronoi) | ✅ |
| **NON-VACUITY A — wrong style params** (Gothic STL scored as Voronoi) | must NOT read PASS | radial membership **2319.9 µm** ⇒ **NOT-MEASURED**, exit **4** | ✅ |
| **NON-VACUITY B — blocking mode on a real FAIL** | exit 3 | exit **3** | ✅ |
| **NON-VACUITY C — the PASS branch is reachable** | PASS printed, exit 0 | N=1000 golden sample, 0 confirmed ⇒ **PASS**, exit 0 | ✅ |
| report-only default on a real FAIL | exit 0 | exit **0** | ✅ |

*(Control C is a sampling construction, not a clean mesh: 690 of 1.14 M means a 1,000-facet sample is
expected to contain ~0.6 of them. It proves the PASS path prints and exits correctly; it is not evidence
that any mesh passes.)*

### 3.4 Cost, measured

| mesh | facets | screen | confirm | **total wall** | rA evals |
|---|---|---|---|---|---|
| Gothic S39CTL | 1,142,166 | 8.0 s | 0.4 s | **10.2 s** | 6.15 M |
| Voronoi S94CTL | 492,068 | 3.1 s | 0.3 s | **~4 s** | 2.66 M |

Against 268 M rA evals / 295 s for S98's full covering — a **26× saving at an identical verdict** on both
validation meshes.

### 3.5 THE GATE'S VERDICT ON WHAT SHIPS TODAY

| artefact | verdict | back-facing count | AREA | minAngle p05 |
|---|---|---|---|---|
| `gothicarches_ring_DS-HT_S39CTL.stl` (= `S35CTL`) | **FAIL** | 690 (0.0604%) | 0.00596% | 7.169° |
| `voronoi_ring_D--H_S94CTL.stl` (**ships**) | **FAIL** | 488 (0.0992%) | 0.01298% | 4.504° |
| `gothicarches_ring_DS-HT_S35M43H.stl` (Task 2) | **FAIL** | 708 (0.0621%) | 0.00643% | 7.204° |
| `gothicarches_ring_DS-H_S100HEAP.stl` (Task 1 control) | **FAIL** | 9,944 (0.7891%) | 0.23533% | 3.585° |
| `gothicarches_ring_DS-WH_S100SWEEP.stl` (Task 1 arm) | **FAIL** | **32,054 (2.5435%)** | **0.55982%** | **2.308°** |

**Nothing measured in this session passes. Zero is the standard and no artefact is at zero.**

Worst Gothic offenders (by area) cluster hard: **8 of the top 20 sit within 0.5 mm of
(θ ≈ 2.576, z ≈ 97.0)** — one site, not a scatter. Full list in
`s100/S100_BFGATE_VAL_GOTH_S39CTL.report.txt` and `..._backfacing.ndjson`.

---

## 4. WHAT I DID NOT MEASURE — STATED PLAINLY

* **No Voronoi sweep arm.** Task 1 is Gothic only. S99's Voronoi mesh additionally has `snap: false`,
  so a Voronoi sweep arm would be testing a different question.
* **No render of the Task-2 arms** (the MOVE43H pair). Only the Task-1 pair and production were
  rendered. `research/render/meshRender.cjs` is `THREE.DoubleSide` and structurally cannot show the
  back-facing class — `research/render/s98BackfaceRender.cjs` was used for both figures here.
* **The 1.2 mm ZOOM figure is an open patch** and S98 §4's warning applies to it; it is supplementary.
  The whole-CLOSED-mesh figure is the primary visual evidence and needs no culling to make its point.
* **The screen's recall is measured on two meshes only** (S98's 690/690 and 488/488), and this gate
  prints `NOT-MEASURED` for it rather than inheriting that number. `PF_S100_FULLCOVER=1` measures it per
  mesh at S98's ~295 s price.
* **No σ bands** on any census share; single golden-stride samples throughout.
* **The Task-1 arms are not the production configuration** (no aligned seed, no tightening field — §0).
* `orientRuler.locateTurnAdaptive`'s midpoint defect (S99's sixth instrument defect) is **not patched**
  and nothing here depends on an S74-derived `turn`.

## 5. MY OWN HYPOTHESES, REFUTED — AS PROMINENTLY AS THE CONFIRMATIONS

1. **I expected `PF_CB_MOVE43H` to be free-and-positive** on the strength of S99's 8.7× synthetic win.
   It is **negative** on the real arm: crossings +21%, orientation chord +39%.
2. **I expected the MOVE's sliver cost to be the risk to watch** (the brief's slivers-for-creases trade).
   **It did not materialise** — whole-mesh minAngle p05 moved 0.5% in the *good* direction.
3. **I expected the sweep driver's conformance term to be a large win on the crease class.** It moves the
   defect from gate A into gate B rather than out of the mesh, because §4.3 is deferred under sweep and a
   conformance demand that cannot be met **does not fall back to a size split**.
4. **I nearly ran a two-variable A/B.** The aligned seed's `&& !SWEEP` was found by a smoke run that
   threw, not by reading the code first. A full-scale arm launched on the original script would have
   spent an hour producing an unattributable number.
5. **I nearly reported a 2.60× WIN.** The COUNT column of the Task-1 arm says the sweep driver removes
   crease crossings 2.60× at equal budget, and that number is real. The AREA column says it is 3.42×
   worse, the orientation chord says 63.8× worse, and the render shows a shredded rib. **Had the kill
   line been written on COUNT instead of AREA, this session would have recommended shipping the arm
   that tears the feature lines apart.** That is the third time this campaign has been saved by
   insisting on AREA alongside COUNT.

---

## 6. RECOMMENDATION

1. **Do NOT add a conformance term to `consider()`** on the strength of S99's attribution. The
   attribution is correct and the intervention is refuted: `PF_CB_DRIVER=sweep` is the natural
   experiment for it and it loses on area, shape, back-facing and the render at equal budget. S99's
   pre-registered arm 3 (a Gauss-keyed conformance term in `consider()`) should be considered
   **provisionally refuted by this arm** unless it is paired with an operator that can DISCHARGE the
   demand — which today does not exist (§4.3 is the only candidate and Task 2 refutes it too).
2. **`PF_CB_MOVE43H` should stay default OFF** and its S99 synthetic figures should be withdrawn as
   predictions of driver behaviour.
3. **Take the gate.** `s100BackFacingGate.ts` is validated, ~10 s on a 1.14 M export, report-only by
   default. The obvious next use is S98's own pre-registered arm 1: run it across all 20 styles
   (~2–10 s each) — this session did 5 meshes and all 5 FAIL.
4. **The next lever to price is the SEED, not the driver.** §1.7 measures the aligned seed + tightening
   field at ~27× on the crease class and ~39.5× on the back-facing class *with 10% fewer triangles*.
   That is the largest single effect measured in this session and it has never had a one-flag A/B.

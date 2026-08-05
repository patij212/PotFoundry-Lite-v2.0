# S60 — THE CONSTRAINED FLIP (agent: FLIP)

> ## >>> MESSAGE TO MAIN — read first, it changes what GUARD and AUDIT should do <<<
> *(no agent-to-agent messaging tool was available to me; this block is the channel)*
>
> 1. **The constrained flip is a SHIPPABLE repair pass on GothicArches and a DEAD END on Voronoi.**
>    Gothic 129,757 → 37,157 over-bar (**3.49×**), position 75 → **36 (better, not 4.3× worse)**, no
>    degenerate facet, topology byte-identical, 0 vertices moved, 0 triangles added, 705 s.
>    Voronoi 320,336 → 241,489 (**1.33×**) — the pre-registered bar was 2×. REFUTED there.
> 2. **STOP USING THE UNCONSTRAINED FLIP (S56 `tangexc`) — it is topologically unsound.** On Voronoi it
>    creates **131 non-manifold edges** (it flips onto a diagonal that already exists elsewhere) and
>    manufactures **464 facets at maxAngle ≥ 179.999** whose normal is not f32-representable. It passed on
>    Gothic by luck, not by construction.
> 3. **NEW STANDING DEFECT NOBODY IS MEASURING: `jitterUm = 1.5·ulp(R)·diam/minAlt`,** the uncertainty of a
>    facet normal computed in f32 from f32 coordinates. **2.91% of the shipped Voronoi mesh exceeds 10 µm on
>    it** (10.96% exceeds 1 µm), so a slicer's normals there differ from ours, and 7.3% of the "orientation
>    failures" are reported at a precision the coordinates cannot support. Gothic: **0 facets**. It costs
>    zero rA evals (pure geometry). Please add it to the standing census.
> 4. **THE CEILING (the number you asked for).** Over the EXISTING vertex set, between **47%** (candidate
>    triangles no larger than the mesh's own median facet — exact, untruncated enumeration) and **67%**
>    (unbounded diameter, 60 nearest vertices) of Voronoi's orientation failures can be covered by SOME
>    admissible triangle. Greedy flips got **24.6%**. Both bounds over-estimate what one consistent
>    triangulation can do. ⇒ **at least a third, most likely about half, of Voronoi's orientation failure
>    needs NEW VERTICES**, and there is roughly **2× of unexploited headroom for a better connectivity
>    SEARCH** on top of greedy.
> 5. **It is NOT a crease problem.** 70% of the failures have a true-normal spread < 20° across the facet,
>    and those are no more reachable (47.5%) than the crease-straddlers (45.6%). Do not spend the night on
>    crease-aligned vertex insertion.
> 6. **~~The pricing says a targeted ~1.6–2.6× local density increase~~ — I MEASURED THAT AND IT IS WRONG.
>    NAIVE REFINEMENT MAKES ORIENTATION WORSE.** One round of longest-edge bisection on the over-bar facets,
>    new vertices placed exactly on the analytic surface: facets ×1.293, over-bar **241,489 → 374,584 (55%
>    WORSE)**; four rounds: ×3.368, **1,596,015 (58.7% of all facets)**. Position p99 *improves* the whole
>    time (6.40 → 6.02 → 4.40) while the orientation failure fraction doubles. **Mechanism:** the inserted
>    vertex is on the surface but off the old facet's plane by the position sag `s`, so each sub-facet is
>    rotated by ≈ `s / h` (h = its altitude) — **a bounded POSITION error is converted into an unbounded
>    ORIENTATION error, and it gets worse the thinner the sub-facet is.** The driver refines on the position
>    ruler; this is very likely where the 39.7% comes from. **Do not bolt a "refine the failing facets" pass
>    onto the driver — measured, it costs 29% more triangles to make orientation 55% worse.**
> 7. **Local connectivity search is EXHAUSTED, not merely un-tuned.** The EXACT min-max retriangulation of
>    a strictly larger neighbourhood (14 triangulations of a hexagon vs 2 of a quad) adds **3.29%**. And
>    turning the position guard OFF buys **nothing** (3.19%) while costing 4,702 position failures at
>    105.9 µm max — the unconstrained arms were taking free damage, not making a trade.
> 8. **Honest status of the endgame: flips CLOSE Gothic and ship today; nothing measured tonight closes
>    Voronoi.** Naive density refuted, local search exhausted, orientation-scored vertex PLACEMENT untested.

Living log. Appended continuously. Newest section at the bottom of each phase block.
Owner files: `research/tools/s56FlipCensus.ts`, `research/tools/s6*.ts`, `research/tools/flip*`.

---

## 0. PRE-REGISTRATION (written 2026-08-05, BEFORE any code was run)

### The state I inherit (not re-derived)

Position is solved; orientation is not measured, not guarded, and fails on 10–40% of every style.
S58 whole-mesh-sampled numbers, same instrument both columns:

| style | facets | position p99 / over-10µm | tangExc p99 / over-10µm |
|---|---|---|---|
| Voronoi | 806,765 | 4.90 µm / 0 (0.000%) | 1222.82 µm / 106,751 (39.696%) |
| LowPolyFacet | 137,480 | 4.95 / 0 | 28.48 / 14,968 (10.887%) |
| GothicArches | 1,142,166 | 3.42 / 17 (0.006%) | 36.05 / 32,468 (11.371%) |

S56 (Gothic, whole-mesh, flip-only, 0 vertices moved, 0 triangles added):
maxAngle-greedy makes tangExc **worse** (0.77×); tangExc-greedy gives **3.58×** fewer over-bar and p99
35.91→15.68 — but costs **+250 position failures (75→325)** and manufactures `maxAngle 180.00°`.

### H-S60 (the hypothesis under test)

> On **Voronoi** — the worst style, 3.5× Gothic by count and 34× by p99 — a connectivity-only pass of edge
> flips, accepted only when ALL of
>  (C1) `max(tangExc)` over the incident PAIR strictly decreases,
>  (C2) BOTH new facets' position sag ≤ `max(10 µm, old pair max)` — same ruler as the audit (`sagAdaptiveRaw`),
>  (C3) BOTH new facets clear a **derived f32 determinacy floor** on min-altitude (not a magic epsilon), and
>  (C4) topology is preserved: interior edge, no (θ,z) fold, no duplicate-edge creation, boundary count and
>       non-manifold count unchanged,
> reduces `tangExc > 10 µm` by **≥ 2×** while adding **ZERO** position failures.

### KILL-CRITERIA — the exact numbers, fixed before the run

* **K1 (primary).** `over10(tangExc)_after > 0.5 × over10(tangExc)_before` ⇒ H-S60 **REFUTED** as a standalone
  fix. (before = the flag-OFF control measured by this same tool in the same process, NOT the S58 number.)
* **K2 (position, and it must be non-vacuous).** `over10(pos)_after > over10(pos)_before` ⇒ the guard is
  BROKEN, arm unsound. AND: the tool prints `rejPos` = candidates that passed C1+C3+C4 and were rejected by
  C2 alone. **If `rejPos == 0` the position clause is VACUOUS** and must be reported as vacuous — a pass that
  cannot fail its own guard has proved nothing. (The S56 arm added 250 position failures on Gothic, so a
  correct guard on Voronoi should reject a comparable population; `rejPos == 0` would mean the clause never
  bound and the improvement is unattributable.)
* **K3 (degeneracy).** Any output facet with `minAlt` below the derived floor, or `maxAngle ≥ 179.999°`, or
  `jitterUm > 10 µm` (the f32 normal-determinacy estimate — see below) ⇒ floor broken.
* **K4 (the ceiling — the number the team actually needs).** `fracUnreachable` := of the facets still over
  10 µm at quiescence, the fraction for which **no triangle formable from the local existing vertex set**
  (12 nearest welded vertices, all C(12,3) triangles whose (θ,z) footprint contains the failure point) meets
  the 10 µm bar. Pre-registered reading:
  * `fracUnreachable ≥ 0.5` ⇒ the majority of the residual is **provably not reachable by connectivity** —
    new vertices (refinement) are mandatory and flips are only a component.
  * `fracUnreachable ≤ 0.1` ⇒ the residual is a **search** failure, not a representation failure — better
    search (cavity-DP / annealing), not refinement, is the next lever.
  * in between ⇒ report the split, no verdict.

### Instruments (named, and both rulers on every arm — no exceptions)

* orientation `tangExcOf` = `sin∠(n_facet, n_surface(centroid)) × diam`, in µm — the S56/S58 definition,
  transcribed unchanged so the numbers are comparable to the inherited table.
* position `sagAdaptiveRaw(rA, mesh, t, 0.03, 12, 64)` from `research/bridge/_sagKernel.ts` — the DRIVER's own
  ruler, imported not re-coded. It is the plane ruler and is known to over-read the perpendicular by ~3.1×,
  which makes it **conservative** as a constraint. Stated, not hidden.
* shape `maxAngle`, `minAlt` (smallest altitude), and **`jitterUm`** (new, derived — see below).
* topology `boundaryEdges` / `nonManifoldEdges` by welded INDEX, counted before and after in the same run.

### C3 — the DERIVED determinacy floor (this replaces "pick an epsilon")

Vertices are f32 (STL). A consumer computing the facet normal `(b−a)×(c−a)` in f32 carries an absolute
edge-vector error of about `½ ulp(R)` per component, `R = max|coord|` of the facet. Perturbing a vertex by δ
perpendicular to the opposite edge tilts the plane by `δ / h` where `h` is that vertex's altitude; over three
vertices the worst case is `Δ∠ ≤ 1.5 · ulp(R) / minAlt`. Because `tangExc = sin∠ × diam`, the induced
uncertainty in the very quantity we are optimising is

    jitterUm  =  1.5 · ulp(R) · diam / minAlt        (mm → µm)

**The floor is `jitterUm ≤ 1 µm`** — one tenth of the 10 µm decision bar — which is equivalent to
`minAlt ≥ 1.5 · ulp(R) · diam / 1e-3 mm`. It is per-facet and scale-aware, not a global angle. `ulp(R)` is the
exact f32 spacing at R (`2^(exp−23)`), so nothing here is tuned.

Consequence worth stating up front: this floor **does not forbid thin triangles** — a sliver aligned along a
rib is exactly what makes tangExc small — it forbids triangles whose measured normal is not f32-determined.
The same instrument therefore also audits the **validity of the S56 result**: if a large share of the
unconstrained arm's tangExc improvement sits in facets with `jitterUm > 10 µm`, that improvement is partly a
measurement artefact. That check is run and reported (probe: retro-audit of the S56 Gothic flipped STL).

The constant 1.5 is validated empirically (`PF_S60_DETPROBE=1`): vertices are perturbed by ±½ ulp and the
observed tangExc movement is regressed against the predicted `jitterUm`. If the prediction under-predicts,
the floor is raised to the measured ratio, and that is recorded here.

### ARMS (all on Voronoi `voronoi_ring_D--.stl`, 806,765 facets, whole-mesh, one process)

| arm | C1 | C2 pos | C3 det | C4 topo | purpose |
|---|---|---|---|---|---|
| `A0 none` | – | – | – | – | control census, both rulers |
| `A1 tangexc` | yes | no | no | fold+interior | S56 R4′ reproduced on Voronoi — the unconstrained reference |
| `A2 con` | yes | yes | yes | full | **the deliverable** |
| `A2p con,nopos` | yes | no | yes | full | isolates what C2 costs and proves C2 is not vacuous |
| `A2d con,nodet` | yes | yes | no | full | isolates what C3 costs |

Every arm reports position AND orientation. An arm that improves one and is silent on the other is void.

### What would make me report a NO-OP rather than a win

If A2 ends within 5% of A1 on tangExc **and** A1 does not damage position on Voronoi, the constraint bought
nothing on this style and I will say so — the constraint is then only load-bearing on Gothic.

### Explicitly NOT done in this phase (named so it is not mistaken for done)

* No change to any driver/production file. Read-only over finished STLs; `src/` untouched.
* No re-run of the mesher. Every number below is connectivity-only over a fixed vertex set.
* The perpendicular (true-3D) position ruler is not used as the constraint — the plane ruler is stricter and
  is the driver's own. A perpendicular confirm on the residual is a follow-up, and is flagged if not run.

---

## 1. CONTROL (A0 `none`, Voronoi 806,765 facets, whole-mesh) — and two surprises before a single flip

`research/exchange/_strataConformBisect/S60_FLIP_SMOKE0.report.txt` (position on stride 200; every other
column whole-mesh). Tool `research/tools/s60ConstrainedFlip.ts`, run `run-s60-constrained-flip.sh`.

```
GATE vertex-on-surface: p50 1.17e-6  p99 9.54e-6  max 1.47e-5 mm -> TRUSTED
rA cost probe: 1.36 M eval/s          weld: 403,683 vertices from 2,420,295 corners
ORIENT tangExc  p50 6.64  p99 1220.32  max 2346.7 um   over-10um 320,336 (39.706%)
POSITION  sag   p50 1.66  p99 4.90     max 5.0 um      over-10um 0 (0.0000%)
SHAPE  maxAngle p50 115.8 p99 179.6    max 179.968     caps>=150 234,049 (29.0%)  >=179.999 0
TOPO 1,210,448 edges, boundary 601, non-manifold 0, orientation-inconsistent 0
```

**Instrument cross-check against the inherited table (the thing I am not allowed to assume).** S58 sampled
every 3rd facet and got tangExc p99 1222.82 / over-bar 39.696% / pos p99 4.90. I measure whole-mesh
1220.32 / 39.706% / 4.90. Same instrument, same answer. The A/B below is against MY OWN control measured in
the same process, not against S58.

### SURPRISE 1 — the determinacy floor is validated, and the INPUT MESH ALREADY FAILS IT

`PF_S60_DETPROBE=1` perturbed all three vertices of 2,002 facets by ±½ ulp, 8 trials each, and compared the
measured |ΔtangExc| against the predicted `jitterUm = 1.5·ulp(R)·diam/minAlt`:

```
measured/predicted   p50 0.376   p99 0.870   max 0.984      -> the prediction is an UPPER BOUND everywhere
```

So C3 is a real bound, not a guess. Applying it to the control mesh:

```
DETERM jitterUm p99 31.6  max 4564   over-1um 88,425 (10.96%)   over-10um 23,508 (2.91%)
VALIDITY: of the 320,336 facets over the tang bar, 23,413 have jitterUm > 10 um
```

**2.91% of the shipped Voronoi mesh has a facet normal that is not determined by its own f32 coordinates**,
and 7.3% of the orientation failures sit on such facets. Two consequences, both load-bearing:

1. *For the team.* A slicer computing these normals in f32 gets a different answer than we do. This is an
   independent defect from the orientation error and nobody has been measuring it. `jitterUm` is cheap
   (pure geometry, zero rA evals) and I recommend it be added to the standing census.
2. *For me.* Up to 23,413 of the 320,336 "orientation failures" are reported at a precision the coordinates
   cannot support. Any flip pass that claims to fix them is unfalsifiable there.

### K3 — RESTATED, WITH THE REASON, BEFORE THE ARMS RAN

K3 as pre-registered ("no output facet over the derived floor") is **un-passable on this input**: 23,508
facets are already over it and a flip can only rewrite facets it touches. That is a defect in my criterion,
not in the mesh, and I am not going to quietly drop it. Restated:

* **K3a** `jitOver10_after <= jitOver10_before` — the pass must not manufacture undetermined normals. Can
  still FAIL (the S56 Gothic arm manufactured `maxAngle 180.00°`, which is `jitterUm = ∞`).
* **K3b** no facet created by an accepted flip is below the floor — enforced by construction by C3.

### C3 gets a second mode, decided BEFORE the arms ran

Because 10.96% of the input is already above the 1 µm floor, an ABSOLUTE C3 would mostly measure "flips
avoid already-bad regions" rather than "flips do not create degeneracy" — and the bad regions are exactly
where 7.3% of the failures live. So C3 mirrors C2's structure:
`jitter_new <= max(1 um, jitter_old_pair_max)` (**`PF_S60_DETMODE=rel`, the default and the primary arm**),
with the bare floor kept as the ablation (`abs`). Both are reported.

### SURPRISE 2 — Voronoi is already a near-degenerate mesh

`caps>=150° = 234,049 = 29.0%` of facets, `maxAngle` p99 **179.6**. Gothic's control was 6.0% caps / p99
165.5. The maxAngle-vs-tangExc anti-correlation the brief describes is therefore not a subtle effect on this
style: **a third of the mesh is already in the regime where Euclidean shape and orientation disagree.**

### Cost model (so nobody has to re-derive it)

rA 1.36 M eval/s. tangExc = 5 evals ⇒ whole-mesh orientation census 3.5 s. Position `sagAdaptiveRaw` at
n=12..64 ⇒ ~0.20 ms/facet ⇒ whole-mesh position census ~165 s. A constrained round costs
2 × 0.20 ms × (candidates passing C1) on top. Full constrained arm ≈ 10 min. No mesher arm needed.


## 2. THE RESULT — the constraint is nearly free, and it is the difference between a usable mesh and a broken one

All numbers whole-mesh, one process, BOTH rulers, my own flag-OFF control. Reports:
`S60_FLIP_A1TANG.report.txt`, `S60_FLIP_A2CON.report.txt`, `S60_FLIP_G2CON.report.txt`.

### 2.1 VORONOI (806,765 facets) — A1 unconstrained vs A2 constrained

| | BEFORE | A1 tangExc-greedy (unconstrained) | **A2 CONSTRAINED** |
|---|---|---|---|
| tangExc > 10 µm | 320,336 (39.71%) | 236,027 (**1.36×**) | **241,489 (1.33×)** |
| tangExc p99 / max | 1220.3 / 2346.7 | 1154.6 / 1910.1 | 1194.6 / 2238.7 |
| **position > 10 µm** | **0** | **2,661** (max **115.6 µm**) | **0** (max **10.0 µm**) |
| maxAngle max | 179.968 | **180.000** (464 facets ≥179.999) | **179.988** (0) |
| jitterUm max | 4564 | **Infinity** (exactly degenerate facets) | 4546 |
| jitter > 10 µm | 23,508 | 25,956 (worse) | **21,431 (better)** |
| **non-manifold edges** | **0** | **131** (edge count 1,210,448 → 1,210,**317**) | **0** (1,210,448 → 1,210,448) |
| flips | – | 309,114 | 265,946 |
| runtime | – | 472 s | 460 s |

**The constraint costs 2.3% of the orientation gain (1.36× → 1.33×) and removes every one of the damages.**

Three of those damages were not previously known and matter beyond this experiment:

1. **The unconstrained flip pass is TOPOLOGICALLY UNSOUND on Voronoi.** It creates 131 non-manifold edges by
   flipping to a diagonal that already exists elsewhere in the mesh. S56 checked topology only AFTER the
   fact and Gothic happened not to trip it. The fix is a clause, not a repair: reject the flip if edge (c,d)
   already exists (`rej dup-edge` = 20,915 on A2 Voronoi, 489,720 cumulative on Gothic — **never vacuous**).
2. **The unconstrained pass manufactures exactly-degenerate facets** — 464 at `maxAngle ≥ 179.999`, with
   `jitterUm = Infinity`, i.e. zero area in f32. A1's own tangExc numbers are partly measured on facets whose
   normal does not exist.
3. **S56's flip-labelling can invert a facet.** It writes `T1<-(d,v,c), T2<-(d,c,u)` unconditionally, which is
   orientation-correct only if `t1` is the facet traversing u→v. s60 determines which facet traverses u→v and
   labels accordingly; the `orientation-inconsistent edge` counter is 0 before and after on both styles, so on
   these two meshes S56 was lucky rather than right. **This one needs telling: the counter is now instrumented.**

### 2.2 GOTHICARCHES (1,142,166 facets) — the constraint keeps the win and reverses the damage

| | BEFORE | S56 unconstrained (published) | **S60 CONSTRAINED** |
|---|---|---|---|
| tangExc > 10 µm | 129,757 | 36,226 (3.58×) | **37,157 (3.49×)** |
| tangExc p99 | 35.91 | 15.68 | **16.22** |
| **position > 10 µm** | **75** | **325 (4.3× WORSE)** | **36 (2.1× BETTER)** |
| position max | 47.2 µm | – | **37.1 µm** |
| maxAngle max | 175.63 | **180.00** | **178.85** |
| jitter > 1 µm | 0 | – | **0** |
| topology | 1,713,829 e / 1,160 b / 0 nm | – | **identical** |

**ALL FOUR PRE-REGISTERED KILL-CRITERIA PASS ON GOTHIC.** K1 37,157 ≤ 64,879 PASS. K2 36 ≤ 75 PASS and
non-vacuous (`rejPos` = 5,537). K3 zero facets over the floor PASS. C4 topology identical PASS.

Position *improving* is not a fluke of the ruler: C2 accepts `new ≤ max(10 µm, old pair max)`, so a flip that
sits on a pre-existing position failure may only leave it or improve it — 39 of the 75 were improved away.

### 2.3 VERDICT ON H-S60 — SPLIT, and the split is the finding

* **GothicArches: CONFIRMED.** 3.49× on orientation, position *better*, no degeneracy, topology identical,
  zero vertices moved, zero triangles added, 705 s of CPU. This is a shippable, free repair pass.
* **Voronoi: REFUTED at the pre-registered bar.** 1.33× is not ≥ 2×. And the unconstrained variant is not
  better — it is 1.36× and it breaks the mesh. **Flips are not the fix on Voronoi.**

The difference between the two styles is not the flip pass, it is the MESH. Gothic's mesh is well conditioned
(`jitter > 1 µm`: **0** facets) and 6.0% caps. Voronoi's is not: 10.96% of facets already exceed the f32
determinacy floor, 2.91% exceed it by 10×, and 29.0% are caps ≥150°. **A flip pass can only re-cut the
diagonals it is given.**

### 2.4 Clause accounting (every clause was non-vacuous on every arm — checked, not assumed)

| clause | Voronoi A2 | Gothic G2 |
|---|---|---|
| C4 fold (θ,z) | 8,203,115 | 8,031,854 |
| C4 duplicate edge | **378,080** | **489,720** |
| C1 no improvement | 14,410,762 | 27,683,704 |
| C3 determinacy | **301,734** | **52,098** |
| C2 position | **22,956** | **5,537** |

`rejPos > 0` on both ⇒ **K2's vacuity trap did not fire**; the position guard actually binds.

## 3. K4 — THE CONNECTIVITY CEILING, and an honest account of why it will not converge

Tool `research/tools/s61FlipCeiling.ts`. For each failing facet, take p = its centroid, enumerate triangles
formable from nearby EXISTING vertices, keep those that (a) cover p in (θ,z), (b) contain no other vertex
(a triangulation of the full vertex set cannot swallow a vertex), (c) are f32-determined (`jitterUm ≤ 1 µm`),
and (d) meet the 10 µm orientation bar — then confirm the winner also meets the 10 µm POSITION bar.

### 3.1 The probe had TWO artefacts and I am recording both, because the first number was wrong

* **v1 scored 6,698 of 20,021 points (33.5%) as unreachable because they had NO covering triangle at all** —
  the failing facet's own third vertex lay outside the K-nearest ball (these meshes are full of slivers).
  Force-including the facet's own three vertices took no-cover to 0 and moved fracUnreachable 58.73% → 53.36%.
* **v2 was K-truncated, and the truncation is not small.** Voronoi, empty+determined, unbounded diameter:

  | K | 12 | 20 | 28 | 40 | 60 |
  |---|---|---|---|---|---|
  | reachable | 38.2% | 48.2% | 54.2% | 60.6% | **67.5%** |

  It does not saturate. Every extra vertex hands the probe another bespoke long thin *empty* triangle, and a
  long sliver lying inside one flat Voronoi plateau genuinely has a tiny orientation error. So `1 − R_K` is an
  **upper** bound on the unreachable share and it keeps falling — **it can never support "at least X% needs
  new vertices"**, which is what I pre-registered. Naming this rather than quoting the first number I got.

### 3.2 The converged form: cap the candidate diameter, then the candidate set is COMPLETE

If a triangle of diameter ≤ D contains p, every one of its vertices is within D of p. So "all vertices within
D" is the whole candidate set and nothing is truncated. D is taken from the mesh's own facet-diameter
distribution — the probe may not invent a triangle larger than the density it is auditing already produces.

**Voronoi, D = p50 of the mesh's own facet diameters = 0.5545 mm, 10,011 sampled failure points:**

```
candidates per point mean 53.6      REACHABLE (orientation) 47.03%      + position bar 46.95%
                                    *** fracUnreachable = 53.05% ***
crease-straddle (normSpread >= 20 deg, 30.0% of failures)  reachable 45.6%
smooth          (normSpread <  20 deg, 70.0% of failures)  reachable 47.5%
best achievable tangExc on the unreachable points: p50 16.3  p90 46.2  max 539.3 um
```

**Caveat, stated not buried:** a safety cap of 80 candidate vertices bound on 49.9% of points (Voronoi is
dense — mean 53.6 vertices within one median facet diameter), so even this arm is partially truncated and
47.03% is a slight UNDER-estimate of reachability. Raising the cap is C(n,3) work; at n=80 the run is
302 s / 10k points already.

### 3.3 WHAT THE TEAM SHOULD TAKE FROM K4

Stated as a band, because that is what the measurement supports:

* **The greedy constrained flip fixed 24.6% of Voronoi's orientation failures** (320,336 → 241,489).
* **Local enumeration says between ~47% (triangles no larger than the mesh's own median facet) and ~67%
  (unbounded diameter, 60 nearest vertices) of the failures could be covered by SOME admissible triangle
  over the EXISTING vertices.** Every variant is an over-estimate of what a single consistent triangulation
  can do, since neighbouring points' winning triangles need not coexist.
* Therefore: **flips captured roughly HALF of the loosest available headroom, and at least a THIRD — most
  likely about a HALF — of Voronoi's orientation failure is not reachable by connectivity at all.**
* **The residual is not mostly crease-straddling.** 70.0% of failures have `normSpread < 20°` — the true
  surface normal barely varies across the facet — and they are no more reachable (47.5%) than the
  crease-straddlers (45.6%). So this is NOT a "put vertices on the creases" problem. It is a plain
  **density/anisotropy** problem over most of its extent.
* Pricing the unreachable part: best achievable tangExc p50 **16.3 µm** against a 10 µm bar, on triangles of
  median diameter 0.56 mm. That is only a **1.6× overshoot** — i.e. most of the unreachable set needs a
  modest local refinement (~1.6× on error ⇒ ~1.6× triangles if error ~ h², ~2.6× if error ~ h), NOT a
  wholesale re-mesh. The p90 is 46 µm and the max 539 µm, so a small tail needs much more.

**Consequence for the other two agents: on Voronoi, orientation cannot be closed by re-cutting diagonals.
The lever is new vertices — and the pricing says a targeted ~1.6–2.6× local density increase on the failing
27% of facets, not a global refinement.** On Gothic the flip pass alone already delivers 3.49×.

## 4. THE S56 RETRO-AUDIT — its numbers stand, its MESH does not

I re-measured the published S56 output `s56flip/S39CTL_flipped_tangexc.stl` with the S60 instruments
(`PF_S60_ARM=none`, report `S60_FLIP_S56RETRO.report.txt`). Its orientation numbers reproduce exactly
(tangExc p99 15.68, over-bar 36,226 — identical to what S56 printed, so the two tools agree to the digit).
Three things S56 did not measure:

```
maxAngle max 180.000   caps>=179.999 1
jitterUm  max Infinity   over-1um 2,501   over-10um 413      <- facets with NO f32-representable normal
TOPO 1,713,829 edges, boundary 1,160, non-manifold 0, ORIENTATION-INCONSISTENT 467,493
```

**467,493 of 1,713,829 edges (27.3%) have their two facets traversing the shared edge in the SAME
direction.** That is a broken winding over a quarter of the mesh — a slicer using the right-hand rule sees
inside-out normals there. The cause is the one I predicted from reading the code before running anything:
S56 applies `T1 <- (d,v,c); T2 <- (d,c,u)` unconditionally, which is orientation-correct **only if `t1` is
the facet that traverses u→v**. When it is `t2`, the two new facets come out inverted.

S56's *metric* is unaffected — `tangExcOf` re-orients the facet normal outward before measuring — so the
3.58× is real. But the STL it wrote is not a usable mesh, and no gate in the campaign would have caught it:
edge-count, boundary-count and non-manifold-count are all unchanged by an inversion.

**s60 fixes it by construction** (it finds which facet traverses u→v and labels from the quad's real boundary
cycle) and instruments it: `orientation-inconsistent` is **0 before and 0 after** on all three styles.
Recommend the counter goes into the standing topology audit — it is 8 lines and it is currently the only
watertightness-class defect the suite cannot see.

## 5. LOWPOLYFACET — the flat control, and the pre-registered VACUITY TRAP fires

`S60_FLIP_L2CON.report.txt`, 137,480 facets, constrained arm, 33 s.

| | BEFORE | AFTER | |
|---|---|---|---|
| tangExc > 10 µm | 14,968 (10.89%) | **9,404 (6.84%)** | 1.59× |
| tangExc p99 / max | 28.48 / 71.4 | 18.80 / 36.8 | |
| position > 10 µm | 0 | 0 | p99 4.95 → 5.64 |
| **caps ≥ 150°** | 10,268 | **1,087** | **9.4× BETTER** |
| jitterUm > 1 µm | 0 | 0 | |
| topology | 206,464 e / 488 b / 0 nm / 0 orientBad | identical | |

* **K1 FAILS** (9,404 > 7,484). 1.59×, not 2×.
* **K2's vacuity trap FIRED and I am reporting it as pre-registered: `rejPos = 0`.** The position clause
  never bound on LowPolyFacet — on a piecewise-flat surface every candidate keeps position, so C2 is
  genuinely inert here. The K2 PASS on this arm is therefore **unattributable** and must not be quoted as
  evidence that C2 works. (It is attributable on Gothic, `rejPos` = 5,537, and on Voronoi, 22,956.)
* **The maxAngle/tangExc anti-correlation is STYLE-SPECIFIC, not a law.** On LowPolyFacet the two objectives
  move TOGETHER (caps 9.4× better while orientation improves 1.59×); on Gothic they oppose (caps 1.66×
  worse while orientation improves 3.49×). So "Euclidean shape is a harmful objective" is true on
  anisotropic-rib styles and false on faceted ones. Worth knowing before anyone generalises the S56 lesson.

### Scoreboard so far — the constrained flip across three styles

| style | facets | tangExc over-bar | ratio | position over-bar | caps ≥150 | K1 |
|---|---|---|---|---|---|---|
| **GothicArches** | 1,142,166 | 129,757 → **37,157** | **3.49×** | 75 → **36** | 68,684 → 113,875 | **PASS** |
| LowPolyFacet | 137,480 | 14,968 → 9,404 | 1.59× | 0 → 0 | 10,268 → **1,087** | fail |
| Voronoi | 806,765 | 320,336 → 241,489 | 1.33× | 0 → 0 | 234,049 → 227,650 | fail |

In all three: 0 vertices moved, 0 triangles added, topology and winding exactly preserved, no facet below
the f32 determinacy floor.

## 6. PRE-REGISTRATION — H-S63, the CAVITY DP (written before `s63CavityDP.ts` was run)

**The question.** Greedy constrained flips fix 24.6% of Voronoi's orientation failures; the S61 enumeration
says 47–67% are coverable over the same vertices. Either the greedy NEIGHBOURHOOD is too small (a search
failure — a bigger neighbourhood should recover part of the gap) or the gap is an artefact of the ceiling
ignoring global consistency (a bigger neighbourhood buys ~nothing). One probe separates them.

**The move.** An edge flip is the exact optimum over the 2 triangulations of a QUAD. The next neighbourhood
with no interior vertices is the HEXAGON of a facet plus its three edge-neighbours (boundary a→d→b→e→c→f→a),
which has Catalan(4) = 14 triangulations; the min-max one is computed EXACTLY by the O(k³) polygon DP. This
is not a heuristic with more knobs — it is the exact optimum over a strictly larger neighbourhood, and the
flip is the k=4 case of the same DP. Every S60 clause is carried over and evaluated on all four new facets
(C2 position ≤ max(10 µm, cavity max), C3 jitter ≤ max(1 µm, cavity max), C4 no duplicate edge, every DP
diagonal required to lie strictly inside the hexagon, orientation-correct emission).

**H-S63:** applied to quiescence on top of the constrained-flip output, the cavity DP reduces the residual
`tangExc > 10 µm` count by a further **≥ 10%**.

**KILL:** `< 10%` further reduction ⇒ the lookahead-2 neighbourhood adds nothing; the greedy flip is already
at the practical limit of LOCAL connectivity search, and the gap to the S61 ceiling is not reachable by local
moves. That verdict is as useful as the other one.

## 7. THE GOTHIC RESIDUAL — 87% unreachable, but it is CHEAP to close

`S61_CEILING_CEIL_G2RESID.report.txt`, exact mode at Gothic's own median facet diameter (0.2078 mm),
12,386 of the 37,157 residual failures sampled.

```
REACHABLE 13.13%      fracUnreachable 86.87%
no covering triangle at all: 8,800 (71%)   <- and this one is a RESULT, not an artefact (below)
normSpread: CREASE-STRADDLE (>=20 deg) 17.8% of failures, reachable 44.0%
            SMOOTH          (< 20 deg) 82.2% of failures, reachable  6.3%
best achievable tangExc on the unreachable points: p50 13.0  p90 22.8  max 189.0 um
diameter of that best triangle: p50 0.1805 mm
implied refinement to reach 10 um: h x 0.88 (alpha=2) => local triangle count x 1.3
                                   h x 0.77 (alpha=1) => local triangle count x 1.7
```

**"No covering triangle at all" is the answer here, not a bug.** Under a cap at the median facet diameter, a
failing facet *larger* than the median has no vertex anywhere inside it, so no small triangle can cover its
centroid — which is exactly the statement "you must put a vertex there". (Caveat recorded: in exact radius
mode the diameter-cap CURVE printed by s61 is degenerate — the candidate set is already radius-limited — so
only the first row of that table is meaningful. Fixed in reading, not yet in the tool.)

**The actionable number: Gothic's residual is a plain DENSITY problem and it is small.** 82.2% of its
remaining failures are smooth (true-normal spread < 20° across the facet), essentially none of them are
reachable by re-cutting diagonals, and the best locally-formable triangle reaches **13.0 µm against a 10 µm
bar** — a 1.3× overshoot. So after the constrained flip, GothicArches needs roughly a **1.3–1.7× local
triangle-count increase on the remaining 3.25% of facets**, i.e. of order **+1–2% total triangles**, to close
orientation. That is a far cheaper endgame than anything in the position campaign.

## 8. H-S63 REFUTED — a strictly LARGER EXACT neighbourhood buys 3.29%. Local search is finished.

`S63_CAVITYDP_V_DP_AFTER_A2.report.txt`, Voronoi, starting from the A2 constrained-flip output, 12 rounds to
near-quiescence, 730 s.

```
cavities examined 9,040,344   simple hexagons 8,151,428   DP found a strict improvement in 101,854   APPLIED 44,395
rejections: notSimple 1,304,849   noImprove 8,049,574   dup-edge 22,521   C2 POSITION 34,938   degenerate 0

ORIENT over-10um  241,489 -> 233,540    (1.034x, 3.29% further reduction)
POSITION over-10um 0 -> 0   p99 6.40 -> 6.96   max 10.0 -> 10.0
SHAPE caps>=150 227,650 -> 234,642      maxAngle max 179.988 -> 179.988 (unchanged)
DETERM jitter>1um 86,310 -> 88,742      >10um 21,431 -> 19,500
TOPO 1,210,448 edges / 601 boundary / 0 non-manifold / 0 orientation-inconsistent — IDENTICAL
```

**KILL-CRITERION: needed ≥ 10%, got 3.29%. H-S63 is REFUTED.**

This is the more useful of the two possible outcomes. The DP is the EXACT min-max optimum over 14
triangulations of a hexagon, where a flip is the exact optimum over 2 triangulations of a quad — a strictly
larger neighbourhood, exactly solved, with every constraint carried over. It recovers 3.29%. Therefore:

> **The greedy constrained flip is already at the practical limit of LOCAL connectivity search on Voronoi.
> The gap between what flips achieve (24.6% of failures fixed) and what the S61 enumeration says is coverable
> (47–67%) is NOT reachable by local moves. Do not build a bigger local search — build vertex insertion.**

Two supporting numbers, both from the same run:
* The accounting closes exactly: 101,854 improving cavities = 44,395 applied + 22,521 dup-edge + 34,938 C2.
  **C2 (position) blocked 34.3% of the DP's improving cavities** — a larger neighbourhood finds more
  orientation wins, and a third of them would have cost position. Ablation `PF_S63_POS=0` is running to
  price that exactly; recorded below when it lands.
* `notSimple` 1.30 M — 14.4% of cavities are not simple hexagons in (θ,z) (repeated opposite vertex or a
  self-intersecting boundary). Those are skipped, not mishandled.

## 9. ROUND-TRIP VERIFICATION of the Gothic output — the written STL is a real mesh

Re-read `s60flip/gothicarches_ring_DS-HT_S39CTL_G2CON.stl` from disk and re-censused it in a fresh process
(`S60_FLIP_G2ROUNDTRIP.report.txt`):

```
tangExc p99 16.22  max 1251.3  over-10um 37,157        <- identical to the in-memory AFTER
maxAngle max 178.853   caps>=150 113,875   jitterUm max 1.00   over-1um 0   over-10um 0
TOPO 1,713,829 edges, boundary 1,160, non-manifold 0, orientation-inconsistent 0
```

Every number reproduces. The f32 STL round-trip is exact (coordinates are unchanged by a flip), the winding
is consistent, and no facet is below the determinacy floor. **This is a shippable artefact, not a lab number.**

## 10. VISUAL EVIDENCE (the brief's rule: if a render disagrees with a metric, trust the render)

`research/tools/s64OrientRender.ts` colours the SAME render bins by the ORIENTATION ruler instead of position
(position is uniformly green on these meshes — p99 4.9 µm, zero over the bar — so the standing heatmap shows
nothing at all). Window auto-selected as the (θ,z) bin with the most over-bar facets, so it is the worst
region and not one I picked.

* `s60flip/render/orient_gothic.png` — Gothic, θ 3.0925 ± 0.05, z 97.5 ± 3 mm.
  BEFORE 2,577 facets, 454 over bar (17.6%), worst 424 µm → AFTER 2,588 facets, 163 over bar (6.3%), worst 361.
  **The failures are visibly the long thin SLIVERS**, scattered red needles across the arch relief; after the
  constrained flip the needles are gone and the patch is green with a few yellow facets.
* `s60flip/renderV/orient_voronoi.png` — Voronoi, θ 3.0925 ± 0.03, z 55.5 ± 2 mm.
  BEFORE 1,063 facets, 428 over bar (40.3%), worst 1698 µm → AFTER 1,061, 218 (20.5%), worst 1433.
  The residual red is concentrated on the **rim where a cell wall meets the plateau** — a genuine sharp
  feature — while the plateau interiors are green.

**Two honest caveats on the pictures.** (a) The legend BAR ("0mm → ≥0.15mm") is hard-coded in
`research/render/meshRender.cjs` and does NOT describe this ramp — mine is 0 → 50 µm tangExc, as stated in the
per-cell label. I did not edit that shared file mid-run; it needs a `meta.scaleMm` from its owner. (b) The
renderer auto-fits each cell's camera, so the two panels are not at identical framing; compare the colour
fields, not the silhouettes.

## 11. PRE-REGISTRATION — H-S65, PRICING THE RECOMMENDATION (written before `s65SplitAndFlip.ts` ran)

Connectivity is finished (§8). The only remaining lever is new vertices, and §3.3 PREDICTED the price from
the S61 residual: best achievable tangExc p50 16.3 µm against a 10 µm bar ⇒ a 1.6× error overshoot ⇒ h × 0.78
(if tang ~ diam¹) or × 0.88 (if ~ diam²) LOCALLY. A prediction with a number in it is falsifiable, so:

**The move, deliberately the dumbest one that could work:** bisect the LONGEST EDGE of every facet over the
orientation bar, place the new vertex ON the analytic surface (`r = rA(θ,z)` at the edge midpoint's
parameter — what the mesher itself does), split BOTH incident facets so the mesh stays conforming. No sizing
field, no feature detection, no LEPP recursion. Then re-run the S60 constrained flip on the result.

**H-S65:** the combination reduces Voronoi's over-bar count by **≥ 2×** for **≤ 1.6× triangles**.

**KILL:** `< 2×` reduction OR `> 1.6×` triangles ⇒ the "targeted local density" recommendation is not
supported at that price and must be re-priced before anyone builds it into the mesher.

Note the new vertices land exactly on the surface, so position cannot get worse *by construction* — it is
measured anyway, because "cannot by construction" is precisely how this campaign has been wrong before.

## 12. THE C2 ABLATION — the position constraint is FREE and LOAD-BEARING

`S63_CAVITYDP_V_DP_NOPOS.report.txt` — the cavity DP re-run with C2 switched off, everything else identical.

| | DP with C2 (§8) | DP with C2 OFF |
|---|---|---|
| orientation further reduction | **3.29%** | 3.19% |
| position over-10 µm | **0** | **4,702** |
| position p99 / max | 6.40 → 6.96 / 10.0 | 6.40 → 8.36 / **105.9 µm** |

**Turning the position guard off does not buy any orientation** (3.19% vs 3.29% — the constrained arm is
marginally *better*, within noise) **and it costs 4,702 position failures with a 105.9 µm worst case.** That
is the cleanest possible statement of the paper's point: on this mesh the two objectives are not really
trading against each other at the margin — the unconstrained arms were simply taking free damage.

## 13. H-S65 REFUTED, AND THE DIRECTION IS THE FINDING: NAIVE REFINEMENT MAKES ORIENTATION WORSE

`S65_SPLIT_V_SPLIT1.report.txt` (4 marking rounds) and `S65_SPLIT_V_SPLIT1R.report.txt` (1 round), both
starting from the A2 constrained-flip output. New vertices are placed exactly on the analytic surface.

| | A2 (start) | +1 split round | +4 split rounds |
|---|---|---|---|
| facets | 806,765 | 1,043,321 (**1.293×**) | 2,716,959 (**3.368×**) |
| tangExc > 10 µm | 241,489 (29.9%) | **374,584 (35.9%)** | **1,596,015 (58.7%)** |
| tangExc p99 | 1194.6 | 978.1 | 661.2 |
| position > 10 µm | 0 | **329** | **186** |
| position p99 / max | 6.40 / 10.0 | 6.02 / **86.7** | 4.40 / **44.2** |

**KILL-CRITERION: needed ≥2× fewer over-bar for ≤1.6× triangles. Got 0.645× (i.e. 55% WORSE) at 1.293×
triangles. H-S65 is REFUTED, and refuted in the opposite direction to the prediction.** My §3.3 pricing
("a targeted ~1.6–2.6× local density increase") is therefore **WRONG as stated** and I am correcting it here
rather than leaving it in the message block as if it had survived.

### The mechanism, and it is worth more than the failed hypothesis

Bisecting an edge inserts a vertex that lies ON the surface but OFF the old facet's plane, by up to the
facet's position sag `s` (≤ 10 µm here). The two sub-facets must now pass through that point, so each is
rotated away from the old, well-aligned normal by roughly

        Δ∠  ≈  s / h        (h = the sub-facet's altitude from the new vertex)

and since `tangExc = sin∠ × diam`, a bounded POSITION error is converted into an ORIENTATION error that
grows as the sub-facet gets thinner. On a mesh that is already 29% caps ≥150°, the sub-facets are thin, and
the trade goes the wrong way. The aggregate signature is exactly this: **position p99 improves (6.40 → 6.02
→ 4.40) while the orientation failure fraction doubles (29.9% → 35.9% → 58.7%).** The tail p99 does fall
(1194 → 978 → 661), so refinement does eventually work — but it makes far more facets marginally bad before
it makes the worst ones good.

**This is very likely why the shipped meshes look the way they do.** The driver refines on the position
ruler. Every refinement step that reduces position sag can *increase* orientation error by `s/h`. The
mesher has been optimising one ruler while unknowingly paying the other, and the 39.7% orientation failure
rate on Voronoi is the accumulated bill.

### What this changes for the team

* **Do not bolt a "refine the over-bar facets" pass onto the existing driver.** Measured, it makes
  orientation worse at 1.29× the triangles.
* Refinement for orientation must place the new vertex so that the sub-facets stay *fat* (split the facet,
  not just its longest edge; or insert at a point chosen to minimise `s/h`, not at the edge midpoint), and
  it must be scored on the ORIENTATION ruler, not the position ruler.
* The honest current status of the endgame: **flips close Gothic (3.49×, shippable today); nothing measured
  tonight closes Voronoi.** Naive density is refuted, local connectivity search is exhausted, and the
  remaining lever — orientation-scored vertex placement — is untested.

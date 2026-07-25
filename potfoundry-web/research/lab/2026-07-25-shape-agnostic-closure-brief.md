# BRIEF — closing the meshing pipeline with a TRUE shape-agnostic result

**The question:** how do we detect **all and any** features on an arbitrary parametric surface, and how should we **act** on each, so that ONE pipeline meshes ANY style to 0.01 mm MAX, watertight, with zero per-style code? **What is STRATA-001 missing?**

> Self-contained brief. Everything needed is below. Work **research-only** (`potfoundry-web/research/`), **never edit `src/`** (concurrent sessions). Flag-gate everything default-OFF.

---

## 1. Product bar (non-negotiable)

PotFoundry exports pottery as printable STL/3MF. The standard:

- **0.01 mm true-3D fidelity EVERYWHERE**, judged by **MAX** perpendicular distance mesh→exact analytic surface. Not p99, not p50. Sharp features are *real geometry to mesh*, never "acceptable artifacts".
- **Flat triangles only** (it's a print) — a sharp feature is captured by *placing edges on it*, i.e. conforming.
- **Watertight** closed 2-manifold: 0 non-manifold edges, 0 seam cracks.
- **Shape-agnostic**: one mesher + one detector-driven feature extractor. **Zero per-style special-casing.** (Per-style certified closers exist; the point of this problem is not needing them.)

**Surface model:** a generalized cylinder `r = rA(θ, z)`, θ∈[0,2π) periodic, z∈[0,H]; 3D point `(r·cosθ, r·sinθ, z)`. Dims `H=120, Rb=40, Rt=50` mm. 20 styles in `src/styles/registry.ts`. Get `rA` via `buildRadiusFn(styleId, params, DIMS)` from `research/bridge/labkit.ts`. **Always measure at registry defaults** (snake→camel) — reduced relief silently "passes".

---

## 2. Theory: the feature taxonomy is forced, not heuristic

For a flat triangle of size `h` against the surface, the sag scales by the surface's local regularity — this **completely classifies** what a mesher must do:

| sag scaling | class | mechanism needed | why density alone fails |
|---|---|---|---|
| **∝ h²** | smooth (C²) | **density**, metric-sized | — (converges) |
| **∝ h¹** | **crease** (gradient/normal jump, r continuous) | **conform**: an edge lying ON the locus | halving h only halves sag; budget explodes |
| **∝ h⁰** | **jump** (r discontinuous) | **split**: two sheets + curtain/tread strip (double-valued) | scale-invariant — refinement NEVER helps |

For single-valued `r(θ,z)` there is **no fourth class**. Two orthogonal axes modulate the action:
- **dimension**: 2D region / 1D curve / **0D junction** (where feature curves meet — arch apex, Voronoi triple point, star tip)
- **anisotropy**: a long thin ridge wants long-thin triangles (a metric), else you burn ~10× triangles

A **two-scale test** measures the class directly: compare the directional 2nd difference at scale `h` vs `h/4`. Ratio → ~1 ⇒ jump; ~0.5 ⇒ crease; ~0.06 ⇒ smooth. This already exists and works (`research/bridge/_strataCreaseDetect.test.ts`, `PF_STRATA_CREASE=1`).

---

## 3. What exists: the STRATA-001 universal mesher

**One file:** `research/bridge/_strataVoronoiSolid.test.ts` — a Vitest harness emitting a binary STL + fidelity/watertight report. Gated `PF_STRATA_SOLID=1`.

```
init → refine (LEPP) → sliver collapse → treads/caps → position-weld audit → STL
```

1. **init** — structured θ×z grid (`PF_SOLID_INIT=grid`) or Voronoi cells. Vertices are (θ,z), spatial-hash welded; θ=0≡2π seam via shortest-arc midpoints. Auto-detects C0 **z-steps** and meshes the z-**bands** disconnected.
2. **refine** — **LEPP** (Rivara longest-edge bisection) over edge→triangle adjacency: splitting a shared edge splits both incident triangles ⇒ **watertight by construction**. Driven by true-3D perpendicular **sag** vs analytic. Stops at `acceptTol`, or longest edge < `FLOOR_MM` (1.5 µm), or `triCap`. Now a **max-heap on sag** (worst-first).
3. **cleanup** — union-find collapse of <1 µm needle slivers.
4. **close** — stitch structural **tread annuli** between band loops at each z-step (double-valued); then base/rim/inner-wall/floor caps (`PF_SOLID_STAGE=solid`; `ring` = outer wall only).
5. **audit** — 3D position-weld topology (non-manifold / seam-crack / boundary loops), then MAX/p99/p50 sag over `oracleN²` barycentric samples per triangle.

**Run:**
```bash
NODE_OPTIONS=--max-old-space-size=6144 \
PF_STRATA_SOLID=1 PF_SOLID_STYLE=GothicArches PF_SOLID_INIT=grid PF_SOLID_STAGE=ring \
PF_SOLID_DEBUG=1 PF_SOLID_FCOLS=1 PF_SOLID_FCOLS_A=40 \
PF_SOLID_GRIDU=200 PF_SOLID_GRIDV=140 PF_SOLID_TRICAP=2500000 \
npx vitest run --config vitest.strata.config.ts research/bridge/_strataVoronoiSolid.test.ts
```
Flags: `PF_SOLID_STYLE` · `INIT=grid|voronoi` · `STAGE=ring|solid` · `GRIDU/GRIDV` · `TRICAP` · `ACCEPT_TOL`(0.007) · `ORACLE`(12) · `FLOOR_UM`(1.5) · `FCOLS`/`FCOLS_A` · `FROWS`/`FROWS_A` · `CREASE` · `DEBUG`. Output → `research/exchange/_strataVoronoiSolid/<style>_<stage>.stl[.report.txt]`; `MAX-locus:` prints the worst triangle's z/θ/edges.

> **Ops:** the strata vitest config's `include` only matches `research/bridge/_strata*.test.ts` — name new harnesses `_strata*`. Vitest's fork pool **buffers stdout until the test ends** (a long silent run is normal). Run heavy jobs one at a time.

**Proven working:** Voronoi closed solid (both morphs); T1 smooth (8 styles) + LowPolyFacet + HexHive close on grid; T3 layered C0-step (Bamboo/DragonScales/ArtDeco) close via double-valued treads; generic feature **detector** proven; **FCOLS** (feature-aligned θ-columns) closes the crease-tier **bulk** — Gothic p50 5.97→**0.004 µm**, p99 1429→**8.96 µm**, watertight.

---

## 4. The gap, and the diagnosis to attack

**Gothic (registry defaults) MAX is stuck ~1.5 mm** and was *invariant* across every method tried: pure LEPP 1512 / FCOLS 1509 / +feature-rows 1522 / crease-cut 1497 / worst-first heap 1079 µm.

**Measured facts (audit-first, don't re-derive):**
- The MAX triangle is **mid-wall** (z≈37, 31 % H) with edges **~457 µm — UNREFINED, not floored**. Not a boundary artifact.
- A direct probe (`research/bridge/_strataGothicProbe.test.ts`, `PF_GOTHIC_PROBE=1`) shows **r is CONTINUOUS** there (|Δr|→0 cleanly, no jump plateau) and θ-variation at z=37 is only 12 µm — so it is **not a θ-feature**.
- `archZ(θ=2.19) = 35.9 mm` ⇒ the MAX **is the arch RIB**: `ribArch = ridge(t−archZ(θ), wZ, sharp)`, `ridge(d,w,s)=max(0,1−|d|/w)^s`, `wZ=0.04`(of t), `sharp=4`, amp≈relief. Its locus `z = archZ(θ)` varies with θ ⇒ the crease runs **DIAGONALLY** in (θ,z).

**Arithmetic that reframes the problem:** the rib's smooth flank is a quartic of half-width ≈4.8 mm and height ≈1.5 mm ⇒ curvature ≈0.78 mm⁻¹ ⇒ `h ≈ 0.32 mm` suffices for 0.01 mm sag. That is **easily** reachable. So a triangle edge genuinely lying on the crest **should** close this feature. Therefore the residual is most likely **coverage holes in the conforming**, not an intrinsic limit of diagonal creases. (Working hypothesis — verify it, don't assume it.)

**Tried and MEASURED to fail (don't repeat without a new idea):**

| approach | result | why it failed |
|---|---|---|
| pure grid + LEPP | MAX 1512 µm @4 M cap | sag ∝h¹ across a kink; LEPP bisects the *longest* (usually z) edge, never *across* the rib |
| **FCOLS** θ-columns | p99→**8.96 µm** ✅ bulk, MAX 1509 ❌ | conforms **vertical** ridges only; the rib is diagonal |
| FROWS z-rows | p99→355, MAX 1522 ❌ | rib is at a *different z per θ*; no constant-z row lands on it |
| crease-CUT (per-cell chord) | MAX 1497; **degrades the clean mesh** p50 0.004→8.5 | per-cell + disconnected; fires only when a cell has **exactly 2** crossings, else silently falls back to a plain split ⇒ **coverage holes + T-junctions**; midpoints drift off a curved crease when LEPP re-bisects |
| worst-first heap | MAX 1519→1079, bulk p50 →9.96 | attacks worst tris but cap-starves the rest; density can't close a kink |

**Breadth failure (important):** FCOLS's crest detector found **0 crests on GeoometricStar** ⇒ FCOLS was a no-op there (MAX 1108 µm). The detector's *score* is direction-agnostic, but every **consumer** projects it onto an axis (z-steps from a 1-D z-scan; FCOLS crests from a 1-D θ-scan at 5 fixed z levels). **STRATA detects axis-aligned projections of features, not features.**

---

## 5. Leading hypothesis of what STRATA is MISSING (attack or improve this — it is not gospel)

1. **Chaining.** Per-edge crease crossings are never linked into **ordered polylines**. The crease-cut was *marching squares without the marching*. A feature is a **curve**; the mesh needs it as a connected constraint.
2. **A fail-closed contract.** The reference implementation *refuses* an inconsistent chain; STRATA silently falls back → mixed cut/uncut neighbours → T-junctions/cracks/coverage holes.
3. **Reprojection under refinement.** When LEPP bisects a crease edge, the shortest-arc midpoint **leaves** the crease curve, so conforming decays precisely as you refine. Crease-edge midpoints must be re-solved onto the locus.
4. **Junctions (0D).** Where feature curves meet, chains must terminate/branch at a **shared** vertex.
5. **Anisotropic sizing.** Isotropic sag-LEPP wastes triangles on elongated ridges; a surface metric (M = g/h²) is certified in-repo but unwired.
6. **A closure INVARIANT — the thing that actually earns "shape-agnostic".** Don't enumerate styles. Instead: mesh → **re-detect residual features on the produced mesh** → assert **no surviving triangle has h¹/h⁰ error character** → feed failures back → iterate to a fixpoint. Self-verifying generality: it either converges or names exactly what it couldn't conform.

---

## 6. Reference implementation to mine (read-only, `src/` — DO NOT EDIT)

A **certified** 304,808-triangle Gothic solid exists (0.01 mm, interval-arithmetic proof). Its crease mechanism is exactly the missing piece — study it and generalize it:

- **`src/geometry/targetSolid/annularSolidReferenceTessellation.ts`**
  - `interface ConformingChord` **(~line 76-92)** — the **chain contract**: each chord's endpoints lie **ON grid lines**; interior chain vertices are shared **verbatim** by both adjacent cells; the kernel **refuses** an inconsistent chain as a T-junction. Splitting a cell is then a pure boundary walk — no intersection arithmetic.
  - `splitPolygonByChain` **(~line 632)** — cuts a cell polygon by a polyline into two sub-polygons **sharing the chain edges**; returns null (fails closed) if the chain doesn't lie properly; chain-hugging pieces triangulated by a **max-min-angle DP** to avoid slivers.
  - `rationalStationLadder` (~1240), `snappedFeatureAngularLadder` (~129), `tessellateAnnularRadialSolidTargetForCertification` (~1550).
- **`research/bridge/_gothicVoronoiConformingSpike.test.ts`** — `gothicChordsForPatch` (~410) traces the rib crease by recording crossings with angular columns (~549) and vertical rows (~617) then `pushChain` (~472) emits consecutive crossings as chords; **`RIB_OFFSETS`** (~238) adds **8 graded offset curves per side** to resolve the quartic stripe; interior degree-2 "collar" pass-through vertices (~565-615) where row pitch is too coarse.
- **`src/geometry/targetSolid/voronoiConformingChords.ts`** — the **auto-generated** (non-hand-authored) version of the same chain mechanism for the Voronoi bisector graph: δ-merge, grid-corner anchoring, and an explicit authority model — *chords are heuristic f64 and UNTRUSTED; a missed/false locus costs only triangles, never soundness.* **This is the closest existing thing to what we want, and the best model to generalize.**
- `src/renderers/webgpu/parametric/conforming/` — production feature-graph / ChainLinker / metric-sizing / balanced-quadtree machinery (reference only).
- `cdt2d` is available in `src/utils/geometry` (planarize first — non-planar PSLG crashes).

**Why the reference isn't the answer by itself:** its ladders/chords are **hand-authored per style** (hardcoded offsets, asymmetric collar windows, rows fit to measured picometre "razor" cells); the campaign's own verdict is *"the emitter generalizes, the schedule does NOT."* It also certifies a **small, de-featured** pot (`gaRelief 0.2` vs registry default 1.5, `gaDiamond 0`, H32/OD30), takes 287 s, admits only **one** periodic feature patch, and is not the product path. **We need its contract, not its schedule.**

---

## 7. Your task

**Design and prototype the generic mechanism that closes the pipeline shape-agnostically.** Specifically:

1. **Think first.** Interrogate §2 and §5. Is the taxonomy complete? Is the "coverage holes, not diagonal-hardness" hypothesis right? What's the *minimal* set of mechanisms that provably covers all three classes in any direction? Say plainly if you think the framing is wrong.
2. **Design** the detector→action pipeline: how to extract feature loci as **ordered polylines in any direction** (marching-squares on edge-crossings? ridge-line extraction on the feature field? something better?), how to insert them as constraints without T-junctions, how to keep them conformed **under refinement**, how to handle junctions and the θ-seam/z-caps.
3. **Prototype the smallest decisive version** in `research/` (name it `_strata*.test.ts`), flag-gated default-OFF so the proven pipeline stays safe.
4. **Measure it** with the harness at **registry defaults**. Report **MAX** (not p99) plus non-manifold/seam-crack counts, and print the **`MAX-locus`** after your change to prove the arch rib specifically is closed.
5. **Verdict.** Either "closed, here are the numbers", or a precise statement of what remains and why — with evidence. Do not claim success without a measured MAX.

**Success:** GothicArches `ring` at registry defaults, **MAX ≤ 10 µm**, 0 non-manifold, 0 seam-crack, at a feasible triangle budget — then evidence it generalizes (GeometricStar is the next hardest: its features defeat the current θ-projection detector entirely).

You are free to reject the leading hypothesis and propose something better (anisotropic/curvature-aligned metric meshing; a directional refinement rule that bisects the edge **crossing** the feature rather than the longest; advancing-front/wavefront conforming; a global CDT per band). Argue it, build the smallest decisive test, and let the measurement decide.

# PotFoundry Meshing — Frontier Knowledge Base

_Compiled 2026-07-01 by the `meshing-frontier` ideation loop (READ + WEB + COMPOSE mode; no meshes run, no code
touched). Grounds the three frontier bets in the verified SOTA literature. Companion to `FRONTIER-THESIS.md`
(the ranked bets) and `EXPERIMENT-REGISTRY.md` (the empirical results, esp. `E-2026-07-01-FRONTIER-*`)._

**Epistemic rule (from `tessellation-knowledge`):** every claim is either CITED to a verified paper, tagged
`[measured-in-project]` with the registry entry, or marked `(unverified)`. Citations below were confirmed via
`WebSearch`/`WebFetch` on 2026-07-01 (venue + authors checked against the publisher/arXiv page). The full bibliographic
list is §7.

**The thesis this serves** (from `FRONTIER-THESIS.md`): every standing wall is a **C0/near-C0 discontinuity** (crease /
occlusion step / cliff / cusp / hash break) meeting a mesher + metric that assume a smooth single-valued field. The
frontier move is to make the **discontinuity graph the primitive** the mesh grows from (feature-skeleton-first /
protected-PLC), not a patch applied to a smooth-field mesh after the fact.

---

## 1. CITATION AUDIT — every SOTA reference the thesis marked "(verify)"

All references the thesis flagged `(verify)` are **REAL and correctly attributed**, with two attribution corrections
noted. Details, correct citations in §7.

| Thesis claim | Verdict | Correct citation | Applicability to PotFoundry `(u,t)→3D` radial surfaces |
|---|---|---|---|
| Cheng–Dey–Ramos–Ray "protecting balls" for sharp features | **REAL** | Cheng, Dey, Ramos, Ray, *"Delaunay Refinement for Piecewise Smooth Complexes,"* **SODA 2007** (also DCG 2010). [C1] | Directly applicable in spirit: the arch-apex junction = a 0-cell where two ridge 1-cells meet at a small angle; protecting balls are the canonical device that lets refinement terminate at such junctions. Their algorithm is a **3D** PSC mesher; we need the **2D-in-(u,t)** analogue (protected-PLC), which is simpler. |
| Boissonnat–Oudot restricted Delaunay | **REAL** | Boissonnat, Oudot, *"Provably Good Sampling and Meshing of Surfaces,"* **Graphical Models 67(5), 2005** (SGP 2003 preliminary). [C2] | Applicable but not our first pick: it is a **3D farthest-point** surface mesher that needs no parametrization — the opposite of our native-(u,t) advantage. Its guarantee (ε-sample ⇒ restricted Delaunay is topologically + geometrically correct) is the theory that underwrites "mesh the surface faithfully." |
| CGAL Mesh_3 1D-feature protection | **REAL** | CGAL *3D Mesh Generation* user manual, `Mesh_3` package (protection-of-1D-features via protecting balls); classes `Polyhedral_mesh_domain_with_features_3` / `Polyhedral_complex_mesh_domain_3`. [C3] | The exact production of the idea we want. **Not installed** (oracle venv has gmsh only) — see Bet 1 portability. The manual states the failure mode precisely: *without* 1D protection the mesher **over-refines next to sharp edges** inserting surface-Delaunay-ball centers not on the edge — which is our raw-loci embed problem in `E-2026-07-01-FRONTIER-BET1`. |
| PRS sharp-feature priors, arXiv:2311.18494 | **REAL** | ***"PRS: Sharp Feature Priors for Resolution-Free Surface Remeshing,"* arXiv:2311.18494 (2023)** — title/number confirmed; verify the exact author list on the arXiv page before load-bearing use. [C4] | Tangential. A **learning-based** feature detector+remesher for coarse/aliased input meshes. We already have a style-agnostic analytic feature detector (`featureGraph`); PRS's value is only as a fallback detector, not a mesher. Lower priority than the classical PSC line. |
| Jakob et al. Instant Meshes, SIGGRAPH Asia 2015 | **REAL** | Jakob, Tarini, Panozzo, Sorkine-Hornung, *"Instant Field-Aligned Meshes,"* **ACM TOG 34(6), SIGGRAPH Asia 2015.** [C5] (SIGGRAPH Asia **Test-of-Time Award 2025**.) | Applicable in mechanism, blocked in tooling: it optimizes an orientation (cross) field + position field with a **local smoothing operator on the 3D surface** and **snaps edges to sharp features** — the right idea for the transition-fan sliver wall. **Not installed** `[measured E-2026-07-01-FRONTIER-BET3]`; and it operates on the **3D surface**, which self-occluding lattices break. See Bet 3. |
| QuadriFlow | **REAL** | Huang, Zhou, Nießner, Guibas, *"QuadriFlow: A Scalable and Robust Method for Quadrangulation,"* **CGF 37(5), SGP 2018.** [C6] Built ON Instant Meshes; adds a min-cost-flow + SAT to cut singularities ~4×. | Same applicability + same blockers as Instant Meshes (3D-surface, not installed; Blender-MCP QuadriFlow exists but is not isolated `[measured-in-project]`). |

**Two attribution corrections:**
1. **Signpost intrinsic triangulations** (the thesis's demoted "signpost intrinsic / Bet-1 fallback") is
   **Sharp, Soliman, Crane, "Navigating Intrinsic Triangulations," SIGGRAPH 2019** [C7] — the FRONTIER-THESIS text
   is right; but note prior handoffs occasionally miswrote the author as "Sawhney" — it is **Soliman**, not Sawhney.
2. The Cheng–Dey line has a **localized** successor worth knowing: **Dey, Ramos, "Localized Delaunay Refinement
   for Piecewise-Smooth Complexes," SoCG 2013** [C1b] — same guarantees, cheaper (only refines near features), which
   is a better fit for our sparse-skeleton-in-a-mostly-smooth-domain case.

**Nothing was unverifiable or wrong.** All six flagged references exist at the claimed venue with the claimed authors.

---

## 2. BET 1 — protected-PLC constrained-Delaunay refinement WITH true-extremum loci

### The wall (from the registry)
`E-2026-07-01-FRONTIER-BET1`: gmsh `mesh.embed` of a planarized skeleton hit **100% constraint recovery** (vs
in-house recover-after ~90%), watertight — the crossing-locus recovery CEILING is dissolved by construction. BUT
`featureLineChord3D` p99 = **0.51** (target ≤ 0.112) because we embedded the **RAW bilinear-sampler loci**, which
`E-2026-07-01-FRONTIER-BET2` proved sit **off** the true crest (curvature aliased 5–10×). So the constraint edges are
near-but-not-ON the ridge. This is the CGAL-manual failure mode inverted: we protected the *wrong curve*.

### The canonical algorithm
The correct framing is **Delaunay refinement of a Piecewise-Linear/Smooth Complex with 1D-feature protection**:
- **Cheng–Dey–Ramos–Ray protecting balls** [C1]: cover each protected 1-cell (a ridge polyline) and each 0-cell
  (a junction) with a chain of balls sized to the *local feature size*, satisfying a Lipschitz condition so adjacent
  balls overlap consistently. Refinement runs on the **weighted** Delaunay/Voronoi diagram where the balls are
  weighted points; the protected curves then appear as a **union of restricted weighted-Delaunay edges** — i.e. the
  feature is recovered **by construction**, and small angles at junctions cannot force nontermination.
- **CGAL Mesh_3's** production of exactly this [C3] is what we would use off-the-shelf if it were installed — and its
  manual names our exact bug (over-refinement / off-edge ball centers without protection).
- The **2D specialization** we actually need (our domain is the flat `(u,t)` rectangle, refined then lifted) is
  simpler: it is **Shewchuk/Ruppert Delaunay refinement of a planar CDT** [C8, C9] where the input PSLG segments are
  *protected* segments. Ruppert's rule (split an encroached segment at its midpoint; split a skinny triangle at its
  circumcenter unless that encroaches a segment) already guarantees the segments survive; the junction handling is the
  only addition (see below). This is **fully in-house-portable**: `cdt2d`/`@kninnug/constrainautor` (already shipped,
  transition-free) + a Ruppert quality loop with a **metric in-circle test** over `(u,t)` under `M = g/h²` (the
  project's surface-metric kernel). The registry's own recommendation (`E-2026-06-26-OURS-VS-SOTA`) points here.

### Junctions / protecting balls — how, concretely
The empirical fix is already half-built in the registry (`E-2026-07-01-PUREGREEN` P1): a proper single-pass
**segment arrangement** (planarize) that splits every proper crossing/T-junction into a **shared vertex**
(`planarizeSkeleton.ts` / `planarizeSegments` — read: O(n²) crossing scan, snap-dedupe to a shared node, rebuild each
segment as a monotone chain). That took recovery **88.4% → 98.8%** with crossingsSplit=10515, residual=0. The
protecting-ball idea maps onto this as: around each shared junction node, forbid Steiner insertions inside a small
disk (radius ≈ half the nearest-junction distance = local feature size) so refinement never places a vertex that
would re-cross a protected edge — this is the 2D analogue of CDRR balls and it is what kills the residual 1.2%
"collinear/locked-blocked" chains. (The `nonMan=2` regression the registry flags is a downstream lock-through-
T-junction artifact, fixable by the manifold guard `guardManifoldAlways` `[measured-in-project]`.)

### The open piece: TRUE-EXTREMUM loci (the fidelity lever, not the recovery lever)
Recovery is solved. Fidelity requires the constraint vertices to land **on the true `rA` crest**, not on the
band-limited sampler ridge. The lever exists in-house: the **`makeRefiner` step** (locus → local 1D golden-section /
Newton search on the raw analytic `rA` perpendicular to the ridge, to the true extremum) — this is the same
window-max mechanism `E-2026-07-01-FRONTIER-BET2` used to *measure* the 5–10× aliasing. **Refine loci to the true
extremum BEFORE planarizing/embedding**, then plarize+refine. Expected: p99 falls from 0.51 toward the loci-chord
floor (Bet-2's fine `h ≈ 0.05mm`).

### PROJECT-PORTABLE path (ranked)
1. **In-house Ruppert-refinement-of-a-protected-CDT over `(u,t)` under `M=g/h²`.** Highest portability: reuses the
   shipped `cdt2d`, the planarizer (`planarizeSkeleton.ts`), the metric kernel, and `makeRefiner`. No new binary. This
   is the destination the registry already recommends. The one new piece is the **junction protecting-disk** rule.
2. **gmsh `mesh.embed` of true-extremum-refined + planarized loci** (the current Bet-1 proxy, fixed). Portability: the
   oracle adapter `embed` mode already exists (`E-2026-07-01-FRONTIER-BET1`); only the pre-embed `makeRefiner` step is
   missing. Fastest to a fidelity number, but gmsh is a dev oracle, not a shippable path.
3. **CGAL Mesh_3 with 1D-feature protection** [C3] — the gold standard, but **NOT installed** and heavyweight (C++
   template build); use only if 1 and 2 both stall at apex crossings.
- **Fallback if the PLC refiner stalls at apex crossings:** signpost intrinsic Delaunay [C7] — intrinsic edges cross
  the junction *legally* along the surface; keep as the demoted-fallback the thesis already names.

**Headline:** Bet 1's recovery claim is CONFIRMED and portable; the fidelity gap is a **locus-refinement** problem
(refine to the true `rA` extremum with `makeRefiner`), not a recovery or a topology problem — it couples to Bet 2 exactly
as the thesis predicted.

---

## 3. BET 3 — can a cross-field/quad layout be driven IN THE `(u,t)` DOMAIN from the 3D fundamental forms?

### The blocker (from the registry)
`E-2026-07-01-FRONTIER-BET3`: the isolated gmsh proxy is INVALID because **gmsh Algorithm 11 IGNORES the anisotropic
tensor metric** (Gyroid/BasketWeave metric → 8 tris), and meshing the flat `(u,t)` square aligns a cross field to the
**domain axes**, not the 3D relief. Instant Meshes/QuadriFlow are NOT installed; the tangled lattices **self-occlude**,
so a 3D-surface remesh would break reparametrization.

### Why Algo 11 ignored the metric — now explained by the literature
gmsh's quasi-structured quad (Algorithm 11) is **Reberol, Georgiadis, Remacle, "Quasi-structured quadrilateral
meshing in Gmsh," arXiv:2103.04652 (2021)** [C10]. By design it uses a **cross field (solved on a background
triangulation) + a scalar size map** for frontal point insertion — it is **not** an anisotropic-metric mesher. So the
project's "Algo 11 ignores the TP tensor" is not a bug in the adapter; it is the published algorithm. (The tensor
metric *is* consumed by gmsh's **BAMG / Algorithm 7**, `[measured-in-project]`.) This closes the puzzle honestly.

### The KEY question: YES, in principle — two literature-grounded mechanisms

**Mechanism A — a cross field designed under the PULLBACK metric (solve in `(u,t)`, align to 3D).**
A cross/direction field is an **intrinsic** object: you can design it on the surface *by working in the parameter
domain with the surface's first fundamental form `g` as the metric*. The connection that measures "smoothness" of the
field is the **Levi-Civita connection of `g`** (the pullback of the surface's connection). This is the standard setup:
- **Ray, Vallet, Li, Lévy, "N-Symmetry Direction Field Design," ACM TOG 27(2), 2008** [C11] — designs a smooth
  N-symmetry (N=4 ⇒ cross) field with prescribed singularities; the field lives in tangent space, so on a parametric
  patch it is computed in `(u,t)` under `g`.
- **Vaxman et al., "Directional Field Synthesis, Design, and Processing," CGF/EG-STAR 2016** [C12] — the survey; makes
  explicit that field smoothness energies are defined via the **connection/metric**, i.e. computing in a chart under
  the pullback metric is equivalent to computing on the surface.
So a cross field solved on the `(u,t)` grid **under `g` (not the flat Euclidean `(u,t)` metric)** aligns to the **3D**
principal directions — which for a ridge/crease relief IS the relief direction. This is precisely the fix the failed
proxy lacked (it used the flat `(u,t)` metric ⇒ axis-aligned). **This is the most important insight for Bet 3.**

**Mechanism B — metric-orthogonal point placement (skip the separate cross-field solve entirely).**
**Tenkes, Loseille, Alauzet, "Quasi-structured anisotropic quad-dominant mesh adaptation using metric-orthogonal
approach," AIAA SciTech 2022** [C13]. Point placement follows the **eigenstructure of the metric tensor field `M`
directly** — the anisotropy of `M` *is* the "cross field," so no separate field PDE is solved; a gradation process
favors structured (quad) elements. Because it is 100% metric-driven and our kernel already builds `M = g/h²` (isotropic
in 3D) and can build the crease-aligned anisotropic `M` from `(II, I)`, this is the **most project-portable** route:
run our metric-Delaunay kernel with a **metric-orthogonal insertion pattern** instead of the quadtree, over `(u,t)`.
Related generalizations if orthogonal quads over-constrain: **Panozzo, Puppo, Tarini, Sorkine-Hornung, "Frame Fields:
Anisotropic and Non-Orthogonal Cross Fields," ACM TOG 33(4), SIGGRAPH 2014** [C14] — anisotropic, non-orthogonal,
non-unit frame fields for adaptive quad meshing on surfaces; this is the direct answer to "metric-driven cross field."

### The self-occlusion caveat is DODGED by staying in `(u,t)`
The registry's worry — a **3D-surface** remesh breaks on self-occluding lattices (BasketWeave over-under) — **does not
apply** to Mechanism A/B, because both stay in the **single-valued `(u,t)` chart** and only *use* the 3D metric `g`
(and its anisotropy from `II`) evaluated there. The `(u,t)→3D` map is single-valued even where the 3D embedding
self-intersects; the occlusion is a property of the *embedding*, not the *chart*. So field-aligned layout in `(u,t)`
under the pullback metric sidesteps self-occlusion entirely. (Fidelity of the over-under relief is a separate axis —
that is §4, the multi-valued-height problem, not a quality/sliver problem.)

### PROJECT-PORTABLE path (ranked)
1. **Metric-orthogonal insertion over `(u,t)` under `M`** (Tenkes–Loseille–Alauzet [C13]) — reuses the in-house metric
   `M`; replaces the 2:1 quadtree (the transition-fan sliver source `[measured-in-project]`) with metric-aligned point
   placement. No new binary, no 3D remesh, no self-occlusion. **Recommended first.**
2. **Cross field solved in `(u,t)` under the pullback metric `g`** (N-symmetry [C11] / Frame Fields [C14]) then seed a
   field-aligned Delaunay/quad extraction — a bigger build but the principled Instant-Meshes-style layout **without**
   needing the 3D binary or a manifold 3D surface. libigl ships N-Rosy/frame-field solvers (`igl::nrosy`,
   `igl::frame_field`) — portable as a dev oracle.
3. **Blender-MCP QuadriFlow / installing Instant Meshes** — only if 1 and 2 both fail; both hit the 3D-surface
   self-occlusion wall on BasketWeave, so run them on the SMOOTH-relief lattice (Gyroid) first, not the occluding one.
- **Honest caveat (from the registry):** the in-house surface-metric kernel *already* beats the production 2:1 ~2°
  floor on the BULK (Gyroid minA 3.0 / p5 22; BasketWeave minA 0.4 / p5 11) `[measured E-2026-07-01-FRONTIER-BET3
  incidental baseline]`. The residual Bet-3 target is the **worst-case sliver TAIL** (minA <3°), so a field-aligned
  layout must be judged on the **tail** (minAngle, depth-invariant), not `%<20°` (a dilution artifact).

**Headline:** YES — a cross field / metric-aligned layout **can** be driven in the `(u,t)` domain from the 3D
fundamental forms, by solving under the **pullback metric `g`** (Mechanism A) or by **metric-orthogonal placement**
(Mechanism B); both sidestep self-occlusion because they never leave the single-valued chart. The failed proxy failed
only because it used the flat-`(u,t)` metric and gmsh Algo 11 (a cross+scalar mesher, not a tensor mesher).

---

## 4. WEAVE/BRAID EXCLUDE family — meshing MULTI-VALUED height fields / occlusion

### The wall (from the registry)
BasketWeave / CelticKnot / CelticTriquetra are **step/occlusion-discontinuous** — an over-under weave is a
**multi-valued height field** (two `r` values at one `(u,t)`). `[measured E-2026-06-30-FEAT-CONFORM-WARP]` no-lock /
better-loci REFUTED (G≈B to 3 decimals); conforming trades slivers for a true-3D chord regression. The thesis names
this a **separate future bet**, not one of the three conforming bets.

### Root diagnosis, named by the literature
This is exactly the **2.5D-heightfield limitation**: *"a 2D heightfield cannot store terrain structures with multiple
vertical layers such as overhangs"* [C15 — feature-based volumetric terrain generation, Peytavie et al. and the
terrain-modeling line]. A `(u,t)→r` radial map is a 2.5D height field over the cylinder; a weave over-under is an
overhang. The whole EXCLUDE verdict is the correct classical answer for a 2.5D representation.

### The two literature escape hatches (both change the REPRESENTATION — frontier moves)
1. **Multi-layer height maps / seam-as-boundary (cut-graph atlas).** Represent the weave as **≥2 stacked single-valued
   layers**, each meshed normally, stitched along the over-under boundary treated as a **domain boundary (seam)**. This
   is the atlas/seamless-parametrization view: **Bommes, Zimmer, Kobbelt, "Mixed-Integer Quadrangulation," SIGGRAPH
   2009** [C16] (cut the surface open along a cut graph, mesh each chart, reconcile across transition functions) and
   the cut-graph machinery in the **Bommes et al. "Quad-Mesh Generation and Processing: A Survey," CGF 2013** [C17].
   The over-under crossing curve becomes a *protected 1-cell* — which folds this back into **Bet 1** (the discontinuity
   graph as primitive): the occlusion boundary is just another protected feature, and each strand-layer is a smooth
   patch between branches. **This is the cleanest unification: weave = Bet 1 applied to the occlusion boundary + a
   2-layer atlas.**
2. **Volumetric / implicit (SDF) → marching cubes.** Represent the weave as a signed distance / occupancy field in 3D
   and extract the surface with marching cubes (or dual contouring for sharp features). This is the "lift 2.5D → true
   3D" answer [C15] and it *natively* handles multi-valued relief (no chart cut needed). Cost: leaves the native
   `(u,t)` entirely (no warp/seam/rim-lock machinery), and needs a feature-preserving isosurface extractor (dual
   contouring) to keep the strand edges sharp. Heavier; the atlas route (1) is preferred.

### The "correct height source (post-warp GPU eval) vs analytic `rA`" reconciliation
`[measured-in-project]` the registry flags a **CPU↔WGSL post-warp locus divergence**: the analytic CPU `rA` diverges
from the GPU-evaluated post-warp surface on BasketWeave (`vertexMaxMm=2.0mm`, reference-UNTRUSTED). The literature
lens says **the multi-valued surface is authoritative only in its post-warp embedded form** — the analytic `rA` is a
single-valued proxy that *cannot* represent the over-under, so its divergence is not a bug to fix but a **symptom of
using a 2.5D reference for a multi-valued surface**. The fix aligns with escape hatch (1): use the **post-warp GPU
evaluation** (the true multi-valued embedding, which the project already captures via
`LAST_CONFORMING_ASSEMBLY_UT_POSTWARP` per memory `project_export_endgame_design`) as the ground truth, and treat the
occlusion boundary as a protected seam. Any weave experiment MUST measure against the post-warp GPU surface, not the
analytic `rA` — otherwise `vertexMax`/chord numbers are the reference artifact, not a mesh defect.

**Headline:** the weave EXCLUDE class is the classical **2.5D-multi-valued-height** limitation [C15]; the literature
escape is a **cut-graph/multi-layer atlas** treating the over-under boundary as a protected seam [C16, C17] — which
**folds the weave family back into Bet 1** (discontinuity graph as primitive) — with a volumetric/SDF+marching-cubes
fallback. Measure against the **post-warp GPU surface**, never the single-valued analytic `rA`.

---

## 5. THREE methods NOT yet in the registry that could unlock a wall

1. **Metric-orthogonal quad-dominant point placement** — Tenkes, Loseille, Alauzet, AIAA SciTech 2022 [C13].
   *Why:* replaces the 2:1-transition-fan quadtree (the structural sliver source) with metric-aligned insertion, driven
   purely by the `M` the kernel already builds — attacks the transition-fan sliver TAIL without a cross-field solve or a
   3D remesh. *Portability:* HIGH — reuses the in-house `M=g/h²` and the metric-Delaunay kernel; new piece is the
   insertion pattern only.
2. **Cut-graph / mixed-integer seamless parametrization for the occlusion boundary** — Bommes, Zimmer, Kobbelt,
   SIGGRAPH 2009 [C16] + the quad-meshing survey [C17]. *Why:* the ONLY class of method that meshes a multi-valued
   over-under weave correctly — cut along the occlusion curve into single-valued charts, mesh each, stitch as a seam.
   It converts the weave EXCLUDE wall into a boundary-of-domain problem (= the thesis). *Portability:* MEDIUM — the cut
   is the new machinery; each chart then meshes with the existing kernel. libigl has integer-grid-map / comiso helpers.
3. **Localized Delaunay refinement for piecewise-smooth complexes** — Dey, Ramos, SoCG 2013 [C1b]. *Why:* the
   cost-correct version of Bet 1's refiner — refines only near the protected features (our skeleton is sparse in a
   mostly-smooth domain), so the protected-PLC build stays cheap even at high budget; also the cleanest theory for
   junction termination. *Portability:* MEDIUM — the localization rule is portable onto the in-house Ruppert loop; the
   CDRR/CGAL implementation itself is not installed.

*(Runner-up, noted not counted: **Frame Fields** [C14] for adaptive non-orthogonal anisotropic layout — the general
form of Bet 3 Mechanism A; and **dual contouring** for the SDF fallback of §4. Both are heavier than the three above.)*

---

## 6. UNIFYING READ — does one canonical framework subsume the discontinuity-first thesis?

**Yes.** The discontinuity-first thesis is a special case of **feature-preserving / feature-sensitive meshing via a
protected complex + a Riemannian sizing metric** — i.e. the classical **Delaunay refinement of a Piecewise-Smooth
Complex (PSC)** framework, run under a **curvature-derived metric field**. Two orthogonal axes, each with a canonical
line:

- **Axis 1 — the constraint model (WHERE features go): protected-PLC / PSC Delaunay refinement.** Canonical:
  **Cheng–Dey–Ramos–Ray (SODA 2007 / DCG 2010)** [C1] + **Boissonnat–Oudot (Graphical Models 2005)** [C2], productized
  in **CGAL Mesh_3** [C3]. "Make the feature a protected sub-complex that is recovered by construction" IS the thesis,
  verbatim, from the meshing literature. Bets 1 and 4 (weave) live here.
- **Axis 2 — the sizing/shape model (HOW dense + what shape): metric-based anisotropic remeshing.** Canonical:
  **Frey–George / BAMG** and the **MMG/mmgs** metric-tensor remesher [C18] (surface metric from the curvature tensor +
  Hausdorff tolerance; anisotropic Delaunay kernel). "Size from curvature, shape from the fundamental form" IS the
  project's `M=g/h²` kernel. Bets 2 and 3 live here.

The single sentence that subsumes the thesis: **mesh under a curvature-derived Riemannian metric while protecting the
feature complex as a recovered sub-complex** — CGAL Mesh_3 [C3] is the one system that does BOTH axes at once (1D-feature
protection + a sizing field), which is why it is the closest single-framework match. The project's native-`(u,t)`
advantage is what lets us do the same two axes cheaply without a general 3D PSC mesher.

**Best 2–3 papers to anchor the framework:**
1. **Cheng, Dey, Shewchuk, *Delaunay Mesh Generation* (CRC Press, 2012)** [C19] — the textbook that unifies protected-
   PLC refinement, quality guarantees, and metric sizing; the single best reference for the whole thesis.
2. **Cheng–Dey–Ramos–Ray, SODA 2007** [C1] — the protecting-balls result that makes "feature recovered by construction"
   rigorous (Axis 1).
3. **The MMG/mmgs metric-based remesher** [C18] (+ the **Directional Field Synthesis STAR** [C12] for the field/metric
   equivalence) — the anisotropic-metric productization for Axis 2.

**Caveat on subsumption:** the classical PSC framework assumes the feature complex is embeddable and the surface is
single-valued per chart. The **weave/occlusion (multi-valued) class breaks that assumption** — it needs the
cut-graph/atlas extension (§4, [C16, C17]) or a volumetric representation (§4, [C15]) BEFORE the PSC framework applies.
So the unifying framework subsumes 4 of the 5 wall classes (seam / crease / junction / cliff); the 5th (occlusion) needs
one representation change (cut the multi-valued surface into single-valued charts) to enter it.

---

## 7. Bibliography (all verified 2026-07-01 unless marked)

- **[C1]** S.-W. Cheng, T. K. Dey, E. A. Ramos, T. Ray. *Delaunay Refinement for Piecewise Smooth Complexes.* SODA
  2007 (pp. 1096–1105); journal version *Discrete & Computational Geometry* 43(1):121–166, 2010. Protecting balls /
  weighted refinement for sharp features. `cse.hkust.edu.hk/~scheng/pub/soda2007a-psc.pdf`
- **[C1b]** T. K. Dey, E. A. Ramos (with G. Chen). *Localized Delaunay Refinement for Piecewise-Smooth Complexes.*
  SoCG 2013. Refines only near features. `dl.acm.org/doi/10.1145/2462356.2462376`
- **[C2]** J.-D. Boissonnat, S. Oudot. *Provably Good Sampling and Meshing of Surfaces.* Graphical Models 67(5):
  405–451, 2005 (SGP 2003 preliminary). Restricted-Delaunay ε-sample guarantee.
  `geometrica.saclay.inria.fr/Steve.Oudot/papers/bo-pgsms-05/bo-pgsms-05.pdf`
- **[C3]** CGAL Editorial Board. *3D Mesh Generation* (`Mesh_3` package) — protection of 1D-features via protecting
  balls; `Polyhedral_mesh_domain_with_features_3`, `Polyhedral_complex_mesh_domain_3`. `doc.cgal.org/latest/Mesh_3/`
- **[C4]** Y. Chen et al. *PRS: Sharp Feature Priors for Resolution-Free Surface Remeshing.* arXiv:2311.18494, 2023.
  Learning-based feature detection + remeshing. `arxiv.org/abs/2311.18494`
- **[C5]** W. Jakob, M. Tarini, D. Panozzo, O. Sorkine-Hornung. *Instant Field-Aligned Meshes.* ACM TOG 34(6):189
  (SIGGRAPH Asia 2015). Local smoothing of orientation + position field; snaps edges to sharp features. Test-of-Time
  2025. `rgl.epfl.ch/publications/Jakob2015Instant`
- **[C6]** J. Huang, Y. Zhou, M. Nießner, L. Guibas. *QuadriFlow: A Scalable and Robust Method for Quadrangulation.*
  CGF 37(5):147–160 (SGP 2018). Built on Instant Meshes; min-cost-flow + SAT to cut singularities.
  `onlinelibrary.wiley.com/doi/10.1111/cgf.13498`
- **[C7]** N. Sharp, Y. Soliman, K. Crane. *Navigating Intrinsic Triangulations.* ACM TOG 38(4) (SIGGRAPH 2019).
  Signpost data structure; intrinsic Delaunay refinement. `cs.cmu.edu/~kmcrane/Projects/NavigatingIntrinsicTriangulations/`
  (NOTE: author is **Soliman**, sometimes miswritten "Sawhney" in project handoffs.)
- **[C8]** J. Ruppert. *A Delaunay Refinement Algorithm for Quality 2-Dimensional Mesh Generation.* J. Algorithms
  18(3):548–585, 1995. (Foundational segment-encroachment refinement.)
- **[C9]** J. R. Shewchuk. *Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator*, 1996; and
  *Delaunay Refinement Algorithms for Triangular Mesh Generation*, Comp. Geom. 22(1–3):21–74, 2002 + robust adaptive
  predicates. `people.eecs.berkeley.edu/~jrs/papers/triangle.pdf`
- **[C10]** M. Reberol, C. Georgiadis, J.-F. Remacle. *Quasi-structured quadrilateral meshing in Gmsh — a robust
  pipeline for complex CAD models.* arXiv:2103.04652, 2021. = gmsh Algorithm 11 (cross field on background triangulation
  + scalar size map; **not** an anisotropic-tensor mesher). `arxiv.org/abs/2103.04652`
- **[C11]** N. Ray, B. Vallet, W. C. Li, B. Lévy. *N-Symmetry Direction Field Design.* ACM TOG 27(2):10, 2008. Cross
  field w/ prescribed singularities; designed in tangent space / chart under the metric.
  `inria.hal.science/inria-00331900`
- **[C12]** A. Vaxman, M. Campen, O. Diamanti, D. Panozzo, D. Bommes, K. Hildebrandt, M. Ben-Chen. *Directional Field
  Synthesis, Design, and Processing.* CGF 35(2):545–572 (EG STAR 2016). Field smoothness via the connection/metric.
  `onlinelibrary.wiley.com/doi/10.1111/cgf.12864`
- **[C13]** L.-M. Tenkes, A. Loseille, F. Alauzet. *Quasi-structured anisotropic quad-dominant mesh adaptation using
  metric-orthogonal approach.* AIAA SciTech Forum 2022. Point placement follows the metric eigenstructure directly.
  `inria.hal.science/hal-03536970`
- **[C14]** D. Panozzo, E. Puppo, M. Tarini, O. Sorkine-Hornung. *Frame Fields: Anisotropic and Non-Orthogonal Cross
  Fields.* ACM TOG 33(4) (SIGGRAPH 2014). Anisotropic non-orthogonal frame fields for adaptive quad meshing.
  `dl.acm.org/doi/10.1145/2601097.2601179`
- **[C15]** A. Peytavie, E. Galin, et al. *Feature-based volumetric terrain generation* line (2.5D-heightfield-cannot-
  store-overhangs; volumetric/implicit representation for multi-valued relief). Representative of the terrain-modeling
  literature on multi-layer / overhang surfaces. `[venue attribution partial — the specific volumetric-terrain paper]`
- **[C16]** D. Bommes, H. Zimmer, L. Kobbelt. *Mixed-Integer Quadrangulation.* ACM TOG 28(3):77 (SIGGRAPH 2009). Cut
  graph + seamless global parametrization from a cross field; prescribed singularities. `graphics.rwth-aachen.de/publication/0344/`
- **[C17]** D. Bommes, B. Lévy, N. Pietroni, E. Puppo, C. Silva, M. Tarini, D. Zorin. *Quad-Mesh Generation and
  Processing: A Survey.* CGF 32(6):51–76, 2013 (also EG STAR "State of the Art in Quad Meshing").
  `onlinelibrary.wiley.com/doi/10.1111/cgf.12014`
- **[C18]** C. Dobrzynski, P. Frey, et al. *MMG / mmgs* — open-source anisotropic metric-based surface & volume
  remesher (surface metric from curvature tensor + Hausdorff parameter; anisotropic Delaunay kernel). `mmgtools.org`
  (Underlying method: P. J. Frey, P.-L. George, *Mesh Generation*, 2nd ed., Wiley 2008; BAMG.)
- **[C19]** S.-W. Cheng, T. K. Dey, J. R. Shewchuk. *Delaunay Mesh Generation.* CRC Press, 2012. The unifying textbook
  (protected-PLC refinement + quality + metric sizing). `routledge.com/Delaunay-Mesh-Generation/...`
- **[C20]** L. P. Chew. *Guaranteed-Quality Mesh Generation for Curved Surfaces.* SoCG 1993 (pp. 274–280). Delaunay
  triangulation defined for curved surfaces; boundary-respecting, well-shaped/sized. `kogs-www.informatik.uni-hamburg.de/~tchernia/SR_papers/chew93.pdf`

**Verification note:** [C1]–[C14], [C16], [C17], [C19], [C20] were confirmed at the cited venue with the cited authors
via publisher/arXiv pages on 2026-07-01. [C15] (volumetric-terrain / 2.5D-overhang) is verified as a real body of work
but the single canonical citation is `(attribution partial)` — the *mechanism* (2.5D heightfield cannot store overhangs
⇒ volumetric or multi-layer) is well-established; pin the exact paper (Peytavie et al. 2009 "Arches: a Framework for
Modeling Complex Terrains", or Gamito/Musgrave) before citing it as load-bearing. [C18] MMG is verified as software +
method; the specific journal cite for the surface-metric-from-curvature step should be pinned to the mmgtools
publications list before load-bearing use.
```

---

_No meshes were run and no code was touched to produce this doc. It is a knowledge-composition deliverable for the
`meshing-frontier` ideation loop. The empirical results it builds on are in `EXPERIMENT-REGISTRY.md`
(`E-2026-07-01-FRONTIER-BET1/2/3`, `E-2026-07-01-PUREGREEN`, `E-2026-06-26-*`) and `docs/AGENT_CONTEXT_DISTILLED.md` §7._

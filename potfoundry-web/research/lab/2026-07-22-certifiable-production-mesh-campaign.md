# Certifiable production-mesh campaign (2026-07-22) — wiring mesher outputs to the exact-dyadic judge (U5.3)

**Goal context:** the overarching target is shape-agnostic ≤0.01mm true-3D at PRODUCTION scale (OD140/H120 + registry
defaults) for all 20 styles. The judge side (G2) has 14 pots / 11 styles certified small/gentle; the PRODUCTION-mesher
side had **0/20** certified. This campaign attacks the production side by wiring structured production meshes to the
exact-dyadic partition judge (`verifyExactDyadicRectanglePartition`, Track A, READ-ONLY).

## The load-bearing thesis (measured, not assumed)

**Structured meshes are judge-certifiable; free-Delaunay meshes are not.** A structured (u,t) grid has columns on
u=i/nU (dyadic-snappable to the judge's integer lattice) ⇒ its exact-dyadic domain partition is clean. A free-Delaunay
conforming mesh carries non-dyadic float UV stations ⇒ it cannot be snapped to an exact partition without accounted
correspondence error the judge won't accept (roadmap U5.3 note). **So the certifiable production path is a STRUCTURED
mesh** — a uniform/graded grid for smooth styles, or a structured feature-conforming emitter (the DragonScales cone-fan
template) for styles with C0/C1 discontinuities.

## The reusable bridge: `research/bridge/certAdapter.ts` (commit 9b8d0af1)

Generalizes the DS cut-at-gap closure to ANY periodic (u,t)-grid production mesh:
- `cutAtGapCertDomain(ut, indices, positions, nU, cutColumn)` — relabel the flat-domain seam onto a gap column, close
  the one straddling quad column with u=1 lattice copies (no wrap; positions unchanged).
- `snapAndVerifyCertDomain(cert, rA, H, bits, opts)` — snap to N=2^bits, feed the judge with FULL hard resource
  headroom, account the path-A snap δ; returns {accepted, maxDelta, wrapTris, nonPosTris}.
- `certifyPeriodicGridMesh(...)` — both in one call.
Cross-validated against the DS-specific `buildDsConeFanCertDomain`; judge-ACCEPTs (certAdapter.test.ts 2/2).

## Certified production meshes so far (all judge-ACCEPT, exactPartition=true, N=2^20)

| # | style | mesh | closing true-3D MAX | closing tris | snap δ | fold | vehicle |
|---|-------|------|---------------------|--------------|--------|------|---------|
| 1 | **DragonScales** | cone-fan structured emitter | fwd 0.005 / rev 0.0028 | (representative 656,896; prod nU4096 9.4M) | 0.00039 | 0.00539 | structured emitter + cut-at-gap (S3, `175a2a6f`) |
| 2 | **HarmonicRipple** (gentle) | uniform structured grid 2048×256 | 0.007078 | 1,044,480 (under cap) | 0.000065 | 0.00714 | smooth grid + adapter (`01d610bd`) |
| 3 | **SuperellipseMorph** (defaults) | uniform structured grid 512×256 | 0.008334 | 261,120 (under cap) | 0.000059 | 0.00840 | smooth grid + adapter (`01d610bd`) |
| 4 | **FourierBloom** (defaults) | uniform structured grid 2048×256 | 0.004659 | 1,044,480 (under cap) | 0.000061 | 0.00472 | smooth grid + adapter |
| 5 | **SpiralRidges** (defaults) | uniform-θ structured grid ~3.94M (safe) | 0.0048 | 3.94M (>cap ⇒ atlas) | 0.000004 (pow2) | ~0.0048 | smooth grid, subagent (`18cd894f`) |
| 6 | **SuperformulaBlossom** (defaults) | uniform structured grid 256×128 | 0.005271 | **65,024** (under cap) | 0.000057 | 0.00533 | smooth grid + adapter |
| 7 | **WaveInterference** (defaults) | uniform structured grid 2048×256 | 0.008924 | 1,044,480 (under cap) | 0.000058 | 0.00898 | smooth grid + adapter |

**PRODUCTION-EXACT (tapered) confirmation (2026-07-22):** the table above was first measured at OD140 UNTAPERED (Rb=Rt=70);
re-run on the true production `DEFAULT_DIMENSIONS` — TAPERED Rb45/Rt70/expn1.1 (more base curvature) — ALL 5 smooth
closers still close ≤0.01 + judge-ACCEPT, near-identical: SFB 0.00514@65k · SE 0.00790@261k · FB 0.00440@1.04M ·
HR 0.00614@1.04M · WI 0.00878@1.04M (δ ≤ 0.00007 each). The narrower tapered base gives finer columns there, absorbing
the extra base curvature. DS + SpiralRidges already used correct tapered dims. So the 7-style claim is production-exact.

**Measured NON-closer on a uniform grid (route to feature-conforming / graded, NOT uniform density):**
- **RippleInterference** (defaults): stuck true-3D MAX ~0.028 / ~40 outliers even at 2.09M — wave-interference crests are
  localized sharp features. Still judge-ACCEPTs at 2048×256 (structure clean); only FIDELITY is unmet on a uniform grid.
  Route: feature-conforming rows on the interference crest lines. (WaveInterference LOOKED stuck at low density but CLOSES
  at 2048×256 — its edge-fade kinks resolve by angular density at true-3D; it is row 7.)

### PRODUCTIONIZED (commit 121a7fe1) — the smooth-grid emitter is WIRED into the export dispatch

The 6 smooth-grid styles are no longer just a research harness: `src/renderers/webgpu/parametric/conforming/tierC/
smoothGrid.ts` (`buildSmoothGridWall` uniform periodic (u,t) grid CCW-by-construction + u-seam welded by index;
`smoothGridWallToOuterWall` (u,t,0) packing with EMERGENT nU rims; `deriveSmoothGridDensity` sag∝1/n² sizing nU→pow2;
`buildSmoothGridOuterWall`) is routed by the `ParametricExportComputer` dispatch (`smoothWall ?? regionWall ??
buildTierCOuterWall`) under a narrow default-OFF sub-flag `__pfSmoothGrid` (regionLayerFlag.ts) + `SMOOTH_GRID_STYLES`/
`isSmoothGridStyle`/`buildSmoothGridDispatchWall` (index.ts). Needs BOTH `__pfSmoothGrid` AND `__pfPerfectMesher` (the
assembly adopt hook) ⇒ `__pfSmoothGrid` alone is inert, flag-off is byte-identical (guarded). The emergent-nU rims are
adopted exactly like the DS cone-fan (WatertightAssembly pins the inner wall to `outer.bottomRing.length`). TDD 18/18 +
an END-TO-END `assembleWatertight` adoption test proving the wall stitches into a watertight closed solid (boundary=0,
nonMan=0, orient=0). This is the FIRST production-wired member of the certifiable-mesh campaign.

DS is the STRUCTURED-EMITTER class proof; HR/SE/FB/SR/SFB/WI are the SMOOTH-GRID class proof. **7 styles now have a
certifiable structured production mesh, from 0 at session start (6 now WIRED into the dispatch).** Note the closing tri-count varies 65k (SFB) → ~4M
(SR): SFB/SE are gentle-shaped (cheap), FB/HR/SR need the angular columns for their petals/ridges. SR (>cap) certifies
by the DS multi-patch-atlas + representative-wall argument; the under-cap styles certify directly. All three certify the EXACT production
positions (the cut/relabel is domain-only). The judge's 1,048,576-triangle hard cap means production meshes larger than
that (DS nU4096, or any dense grid) certify by the **density/structure-invariant** argument on a representative
under-cap wall — the structure is identical at every density.

## Routing (how a style gets a certified production mesh)

- **Smooth styles** (HR, SE, FB, RI, …): uniform structured grid at the density that closes true-3D ≤0.01, cut at any
  column (no feature ⇒ any column is a gap). Uniform grids are wasteful (HR ~1M tris; a curvature-graded grid closes
  far cheaper — a follow-up lever). Residual is angular-limited (petals need the columns) then vertical.
- **Structured-feature styles** (DS rings + scale-tip cone; the 6 layered/curtain styles): the DS template — a
  structured emitter with explicit discontinuity handling (double-valued tread walls, per-apex cone-fans), cut at an
  apex-GAP column so no feature straddles the flat seam.
- **Conforming-crease riser styles** (GeometricStar chevrons): CORRECTED — the strapwork chevron edges (`dStrap≈0` in
  `geometricStarStrapField`, analyticSurfaceGate.ts) are steep **C0 SLOPE kinks, NOT double-valued value cliffs**
  (`_geoStarClose.test.ts:36`: "no separate riser-wall to exclude; every facet is a body facet"). So the close path is the
  DS-INTERIOR-CLOSE recipe — CONFORM mesh edges onto the diagonal chevron crease loci (a `buildGeometricStarConformingGraph`
  analog of `buildDragonScalesConformingGraph`) + fine curvature sizing (`curvatureFineStep`), with the `aniso` metric as a
  SLIVER-quality accelerator (not the fidelity closer). GeoStar is grouped with DragonScales in `RISERS_4`
  (featConformAll20.test.ts). Extensive prior art (9 `_geoStar*` probes) under active synthesis + measurement. (In progress.)

## All-20 honest uniform-grid baseline (2026-07-22, production scale + defaults)

The stalled subagent's goal, done via the lighter smooth-grid harness. Uniform-grid true-3D classifies each style:
CLOSES ⇒ smooth-grid certifiable; else ⇒ the feature-specific route. (Steep-lattice numbers are GN-based ⇒ may
overstate; the classification stands.)

| ID | style | best uniform-grid true-3D | verdict | route |
|----|-------|---------------------------|---------|-------|
| 0 | SuperformulaBlossom | 0.0053 @ 65k | **CLOSES** | smooth-grid ✓ certified |
| 1 | FourierBloom | 0.0047 @ 1.04M | **CLOSES** | smooth-grid ✓ certified |
| 2 | SpiralRidges | 0.0048 @ 3.94M (>cap) | **CLOSES** | smooth-grid + atlas ✓ certified |
| 3 | SuperellipseMorph | 0.0083 @ 261k | **CLOSES** | smooth-grid ✓ certified |
| 4 | HarmonicRipple | 0.0071 @ 1.04M (gentle) | **CLOSES** | smooth-grid ✓ certified |
| 5 | GothicArches | 0.237 | no | feature-conforming (p<1 arch cusps; judge-side already certified) |
| 6 | WaveInterference | 0.0089 @ 1.04M | **CLOSES** | smooth-grid ✓ certified |
| 7 | Crystalline | 0.150 | no | feature-conforming (facet creases; gentle hp0 was certified small) |
| 8 | ArtDeco | 3.42 | no | structured emitter — COMPLEX (horizontal steps + angular fan + diagonal chevron) |
| 9 | DragonScales | (structured emitter) | — | structured emitter ✓ certified (S3 cut-at-gap) |
| 10 | BambooSegments | 0.95 uniform / 0.79 ring-strip WIP | no | ring-strip WIP — bulk closes, feature-line residual (per-style adaptation needed) |
| 11 | RippleInterference | 0.028 | no | feature-conforming (interference crests) |
| 12 | GyroidManifold | ~1.0 (GN) | no | v6 density (vertical ridge network) |
| 13 | Voronoi | 0.245 | no | feature-conforming (cell bisectors) |
| 14 | BasketWeave | (expected no) | no | structured emitter (weave/occlusion) |
| 15 | GeometricStar | 0.726 | no | ANISOTROPIC (chevron flanks; M=g/h² kernel) |
| 16 | HexagonalHive | 0.581 | no | structured emitter (curtain/riser) |
| 17 | CelticKnot | (expected no) | no | structured emitter (double-valued, snaking-C0 WIP exists) |
| 18 | CelticTriquetra | (expected no) | no | structured emitter (diagonal braid) |
| 19 | LowPolyFacet | (expected no) | no | structured emitter (facet complex) |

**7 / 20 now have a certifiable structured production mesh** (was 0). The 13 non-closers split: 4 feature-conforming
(Crystalline/RI/Voronoi/Gothic), 1 anisotropic (GeoStar), 1 v6-density (Gyroid), 7 structured-emitter/layered (ArtDeco/
Bamboo/HexHive/Basket/CKnot/CTri/LowPoly). The DS structured-emitter template is the vehicle for the layered class but
is NOT plug-and-play (the Bamboo probe showed per-style tread-placement + double-valued scoring are still needed).

## Layered-class routing (2026-07-22 desk study — analysis-only)

Tractability map for the 6 remaining layered/structured-emitter styles. **The class boundary is set by DEFAULT
params:** at defaults BasketWeave (`bwTwist=0`, axis-aligned) and LowPolyFacet (`lpTiers=1`, no horizontal step) are in
the EASY static-crease class, NOT the snaking class. Clean split: **{LowPolyFacet, BambooSegments, ArtDeco, BasketWeave}
→ DS ring-strip / smooth-grid template (one shared double-valued TREAD primitive from `src/geometry/doubleValued/mesh.ts`);
{CelticKnot, CelticTriquetra} → the `doubleValued/` snaking mesher** (do NOT force the Celtics onto the ring-strip).

**Recommended order + mechanism:**
1. **LowPolyFacet** (easiest) — 12 vertical C1 facet edges, no C0, no junctions ⇒ uniform smooth grid (nU aligned to 12),
   NO double-valued wall. ~0.1–0.3M est. (MEASURING now via the shipped `buildSmoothGridWall`.)
2. **BambooSegments** (de-risked) — the DS ring-strip RAN and floors at **0.79mm**; root cause = a t-SCHEDULE gap
   (`buildDsRingTSchedule` brackets the ±1mm C0 ring but does NOT grade rows across the smooth node-bulge flanks, `exp`
   reaches ±3.6mm), NOT a wall. Fix = a node-bulge-tracking `buildBambooTSchedule`. ~1–3M est.
3. **BasketWeave** — 2-axis value cliffs (`bwTwist=0` axis-aligned) + checker occlusion ⇒ generalize the DS tread to
   treads on u=m/16 AND t=k/10 + a per-cell over/under step. Loci exist (`deriveBasketWeaveAxisAlignedCreases`). ~1–4M.
4. **ArtDeco** — riser (dominant; the 3.42 blocker is the riser facet-chord, on-loci true-3D is only 0.039) + fan cusps +
   diagonal chevron ⇒ DS treads at `artDecoRiserTBands` + fan columns + chevron density. ~1–3M.
5–6. **CelticTriquetra ∥ CelticKnot** — OFF the ring-strip lane. `doubleValued/celticKnotMesh.ts` EXISTS (215k
   watertight, vertices <0.01); the ONLY residual is the crossing-crest occlusion-fold diamond **0.211mm MAX**
   (architectural M6b full-envelope clip). Triquetra reuses that braid core + a medallion atlas patch. ONE snaking project.

**Discipline:** every layered style needs its OWN feature-shaped t/u-schedule — the emitter generalizes, the schedule does
NOT (the concrete content of "not plug-and-play"). Radial MAX (ArtDeco 3.42 / BasketWeave 1.90) is near-vertical-riser
inflation; the real blocker is the facet chord ACROSS the riser, which the double-valued tread removes by construction —
the tread route beats density-only (free-Delaunay floors p99~0.6).

**HexagonalHive — RECLASSIFIED (NO-GO on the DS template):** measured whole-mesh true-3D MAX floors at **0.738mm** on a
NON-PERIODIC honeycomb seam (25.13 cells don't tile the circumference ⇒ |rA(0⁺)−rA(2π⁻)| up to 0.921mm — a C0
discontinuity of the TARGET surface, density- AND curtain-invariant). The interior closes ≤0.01 on a plain smooth grid
(≈3.27M uniform) and judge-certifies; the seam is irreducible for ANY mesher. HexHive is a **smooth-grid style + an
irreducible non-periodic seam**, NOT a curtain/riser structured-emitter style. This is a SURFACE-DEFINITION issue
(likely a latent bug: the cell count should be an integer) escalated to Patryk (spawned task chip) — not a mesher gap.
Corrects the prior E-CT-HEXHIVE "reaches ≤0.01" (that was p99 with the seam excluded).

## Open threads (updated 2026-07-22 pm)
- ✅ **Smooth-grid emitter PRODUCTIONIZED** (commit 121a7fe1) — 6 smooth styles wired into the dispatch, flag-gated.
- **GeometricStar closure** (active subagent) — synthesize the 9 `_geoStar*` probes + measure the best
  conforming-graph+fineStep+aniso arm at production scale; is true-3D MAX (trusted continuous, not single-seed GN) ≤0.01?
- **LowPolyFacet closure** (active subagent) — measure whole-mesh MAX on the shipped smooth grid (pow2 vs facet-aligned nU);
  the rank-1 layered win, likely a smooth-grid style with no double-valued wall.
- ✅ **HexagonalHive** — NO-GO (irreducible non-periodic seam); reclassified + escalated to Patryk. See layered-class section.
- **Next layered productionizations** (in order): LowPoly (smooth grid + facet-aligned nU) → Bamboo (`buildBambooTSchedule`
  node-bulge grading) → BasketWeave (2-axis tread grid) → ArtDeco (riser+fan+chevron superposition). Celtics = separate
  `doubleValued/` snaking-mesher project (CelticKnot crossing-crest 0.211mm architectural fix + productionize the standalone mesher).
- **SpiralRidges under-cap / curvature-graded grid** — DEFERRED: grading breaks BOTH u- and t-dyadic certifiability (the
  exact-dyadic partition needs both axes dyadic); SR certifies via the multi-patch atlas argument instead.

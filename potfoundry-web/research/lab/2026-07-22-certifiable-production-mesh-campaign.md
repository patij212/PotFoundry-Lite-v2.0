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

DS is the STRUCTURED-EMITTER class proof; HR/SE are the SMOOTH-GRID class proof. All three certify the EXACT production
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
- **Anisotropic-flank styles** (GeometricStar chevrons): the M=g/h² surface metric sizes along/across the flank; isotropic
  density is the wrong lever. (In progress.)

## Open threads (this session)
- All-20 honest production-scale true-3D baseline (subagent) — routes the remaining closures.
- SpiralRidges closure (subagent) — the closest smooth style (~0.047, helix-shear).
- GeometricStar anisotropic closure (pending) — is the 0.37 real or a radial/GN artifact?
- Curvature-graded grid — close smooth styles under the cap at far fewer triangles.
- Structured emitters for the layered styles (DS template) — the U4 class, 6 styles.

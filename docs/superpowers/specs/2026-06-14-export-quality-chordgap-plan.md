# Export Quality — Chord-Gap Closure Plan (2026-06-14)

From the `export-quality-chordgap` workflow (wf_3d9546a7, 17 agents: per-style analyze →
adversarial verify → synthesis). **The adversarial pass overturned 7 of 8 analyst models.**

## Headline: raw density closes almost nothing here

With the B5 metric now trustworthy (19/20 vertex-certified), the chord channel measures the
real flat-facet-vs-surface error. The workflow found the dominant chord residuals are NOT
smooth relief (density-closable) but **intentional C0 STEP faces** the radial chord metric
*cannot* score (like the seam / ArtDeco riser / drain) — the mesh already represents them
faithfully; density *diverges* on them. Only a few are genuine ridge reliefs.

## Buckets (post-verification)

| Bucket | Styles | Action |
|---|---|---|
| **Accept C0 step (exclude band)** — mesh faithful, metric mis-scores the vertical face | DragonScales (row-step t=k/8), BambooSegments (node-step t=k/5 incl. t=1 rim), GyroidManifold (lattice face band), BasketWeave (over/under face — needs PAIRED risers to also de-sliver the mesh) | register the step loci in the gate exclusion (`creaseT`/`creasePredicate` — ALREADY BUILT this session) |
| **Complete the extractor THEN density** — genuine ridge relief | **GeometricStar** (only `yes-to-tol`; chevron arms unextracted), GothicArches (arch ribs + upper-tier lattice — both MANDATORY), CelticTriquetra (ridge-skeleton; MEASURE first) | new general-curve extractor lines + featureLevel=11 |
| **Crest-local density** | LowPolyFacet (face is flat κ=0; residual is the smin-rounded crest) | keep vertical creases + L11; crest-local curvatureFloor only if residual survives |
| **Accept as irreducible** | GyroidManifold (~0.14mm smoothstep-ramp residual after riser) | document |

## Prioritized order
- **Tier 0 — M1 (gate exclusion API): ALREADY EXISTS** (`creaseU`/`creaseT`/`creasePredicate`/`tBands`
  + the seam exclusion). The synthesis assumed it didn't; it does (built this session). M2
  (paired-ring riser *emission* in the extractor, general-curve not CreaseTWarp) is still needed
  for BasketWeave/Gyroid/GeoStar de-slivering.
- **Tier 1 — GeometricStar** (0.98 → ~0.1mm, the only verified `yes-to-tol`, `watertightSafe`):
  rewrite `extractGeometricStar` to emit paired diagonal chevron walls (v∈[−1,0], clip short of
  the apex needle), drop the flat apex vertical, then L11. Validates the mechanism end-to-end.
- **Tier 2 — accept-and-exclude** (DragonScales, BambooSegments): register step t-loci in the
  gate → the chord reads the real flank fidelity (sub-tol). ZERO mesh risk.
- **Tier 3 — extractor completion** (GothicArches: ribs + lattice; GyroidManifold: paired shoulder
  risers + exclude band, ~0.14 irreducible).
- **Tier 4 — measure-first / tail** (CelticTriquetra: no B5 data yet, high sliver risk, likely
  partial-p99; LowPolyFacet: confirm crest-clustered before any density).

## Verified mechanism traps (do NOT repeat)
- **CreaseTWarp cannot make risers** — `chooseCreaseTGrid` maxLevel=6 (grid≤64); an eps pair
  collides onto one snapped row → IDENTITY warp → silently DROPS the working lines. Risers must
  be general-curve extractor emission + gate exclusion, NOT the t-warp.
- **The global periodic `chooseCreaseGrid` collapses vertical-crease t0/t1 → IDENTITY** for
  all-dyadic u; vertical "risers" via warp are no-ops.
- **"density only safe with complete extraction"** bites GothicArches/CelticTriquetra/GeometricStar
  (density REGRESSES until the dominant loci are extracted) — do extraction FIRST.
- Must GPU-verify watertight (slivers/featDrop/bnd/nonMan/orient=0) before any win claim — Gyroid
  (sliver ribbon: weld/min-edge tolerances ≪ 0.08mm band), Celtic/Gothic (cross-cell needles),
  GeoStar (apex 3-constraint needle).

## NOT closable to tol — accept + document
- GyroidManifold ~0.14mm smoothstep-ramp residual.
- BambooSegments / DragonScales / BasketWeave / Gyroid C0 step *faces* — the mesh IS faithful;
  the metric correctly excludes the vertical face (the export there is already perfect).

Files: extractors `src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts`
(GeometricStar:322, GothicArches:295, DragonScales:359, BambooSegments:341, GyroidManifold:587,
CelticTriquetra:460, LowPolyFacet:268; STYLE_EXTRACTORS:819); density/budget
`ParametricExportComputer.ts` (featureLevel:2643, budgetMode 'cap':2621); gate exclusion
`src/fidelity/analyticSurfaceGate.ts` (creaseU/creaseT/creasePredicate, the M1 template).

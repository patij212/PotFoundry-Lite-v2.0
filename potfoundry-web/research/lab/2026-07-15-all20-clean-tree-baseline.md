# Containment #5 — fresh CLEAN-TREE all-20 production-default baseline (2026-07-15)

**Mandate:** audit containment item #5 (`9bec055d`): "run a fresh clean-HEAD all-20 default
artifact baseline after the truth fixes; retain it as empirical status, not universality
proof." The truth fixes landed 2026-07-15 (`2d02f566`: WI CPU→WGSL parity, BasketWeave
ratio live, drain floors removed, Gyroid/Celtic pack defaults; `276bb885`: >2.1M-vertex
edge-key collision fix) plus the Voronoi PCG2D hash syncs (`549bec4d`/`5cf68c3e`).

**Basis:** HEAD `3de5641e`, working tree clean except the capture harness's `PF_PT_URL`
override (committed as `2784c417`; non-production code). This is a true clean-tree basis —
stronger than the July 11 tree-basis run.

**Method:** capture arm `e2e/_prod_truth_capture.mjs` (real WebGPU, production
`ParametricExportComputer.compute`, conforming branch, default high profile + CAD floor,
pinned dims H120/top_od100/bottom_od80/expn1/spin0), then byte-identity classification
against the preserved 2026-07-11 bins (`research/exchange/_prod_truth_2026_07_11_backup`),
then the honest every-facet ruler (`research/bridge/_prod_truth.test.ts`,
`PF_PT_PRESCREEN=1`) on every style whose bytes changed.

## Capture (all 20, one pass, 2,450.9 s ≈ 41 min, zero failures)

Full-pot triangle counts at defaults ranged 1.06M (SuperformulaBlossom) to 13.65M
(CelticTriquetra); worst single capture 370 s (CelticTriquetra), most under 2 min —
the July −81…−93 % generation-time gains hold on today's HEAD.

## Byte-identity classification (fresh vs 2026-07-11)

**17/20 sha1-IDENTICAL** across all four bins (full/outer × xyz/idx): ArtDeco,
BambooSegments, BasketWeave, CelticKnot, CelticTriquetra, Crystalline, FourierBloom,
GeometricStar, GothicArches, GyroidManifold, HarmonicRipple, HexagonalHive, LowPolyFacet,
RippleInterference, SpiralRidges, SuperformulaBlossom + (SuperellipseMorph — see note).
Identical bytes ⇒ the 2026-07-11 scorecard rows carry over verbatim (established
byte-identity precedent). Notably BasketWeave and GyroidManifold are byte-identical
DESPITE their `styles.ts` truth fixes — those fixes changed the CPU truth functions, not
the GPU production pipeline that generates these artifacts, exactly as the parity
programme predicted.

**3/20 DIFFERENT, each traced to a landed fix:**

| Style | Diff | Cause | Fresh verdict |
|---|---|---|---|
| WaveInterference | HASH-diff, sizes equal | CPU→WGSL parity fix moved vertices, same topology | **SHIPPED-CLEAN**: prescreen 394,806 facets → 100 % green-proven; vtxOnSurf max 0.00002 (premise OK — parity took); interior outliers 0; coverage max 0.0080 / p99 0.0032 |
| DragonScales | SIZE-diff (all bins) | `276bb885` edge-key collision fix (DS full pot = 4.3M vertices > 2^21) | scoring fleet in flight (4 shards, ~40k survivors/shard interior) |
| Voronoi | SIZE-diff (all bins) | PCG2D hash desync fixes (`549bec4d`/`5cf68c3e`) changed the cell field | scoring fleet in flight (4 shards) |

**SuperellipseMorph note:** the smoke capture overwrote its July bins before comparison
and no hashes were recorded in July, so identity is unprovable — it was therefore scored
FRESH instead: **SHIPPED-CLEAN** (prescreen 341,274 facets → 100 % green-proven;
vtxOnSurf max 0.00002; interior outliers 0; coverage max 0.0032 / p99 0.0028).

## Standing verdict table (this baseline)

- **SHIPPED-CLEAN, freshly proven today:** WaveInterference (was TRUTH-BRIDGE-FAILURE at
  0.937 mm in July — the parity fix converted it outright), SuperellipseMorph.
- **Carried by byte-identity from 2026-07-11:** the 16 identical styles keep their July
  verdicts (3 SHIPPED-CLEAN / regressions / special-ruler as recorded in
  `E-2026-07-10-PROD-BATCH-prereg.md` — note SuperformulaBlossom's July row predates
  nothing that changed its bytes, and its sf_strength truth-bridge caveat still applies
  to its CPU ruler, not its artifact).
- **Pending fleet merge:** DragonScales, Voronoi (shard rows merge via
  `_prod_truth_merge.mjs` when the fleets complete; DS additionally has its dedicated
  composite ruler `_ds_prodtruth.test.ts` as the July special-ruler precedent).

## Fleet results (merged 2026-07-16, 4 shards each, premise-checked)

**DragonScales — REGRESSION, now TRUSTED on the generic ruler for the first time.**
Watertight (nonManRaw 0, zeroArea 0, non-vacuous control moved); vertexOnSurf max
0.00008 / p99 0.00004 over 2,264,666 vertices — the generic ruler's premise HOLDS on the
fresh post-edge-key-fix topology (July's row was a carried special-ruler entry, never
premise-checked fresh). Interior: 96.5 % of 4.53M facets green-proven; 158,750 of 159,722
survivors are outliers, grid worst 0.6017 mm -> **Newton-refined worst 0.4024 mm**,
p99 ~0.537 (survivor population). Coverage (surface->mesh): max 0.0603 / p99 0.0016.
Reading: vertices sit ON the surface while facet interiors miss by up to 0.40 mm — chord
error across DS scale cliffs, i.e. the known feature-conforming gap, now measured
trusted on the production artifact. ~13.1 h/shard of honest interior work.

**Voronoi — REGRESSION (post-hash-sync field).** Watertight; premise OK (vtx p99
0.00002). Interior: 97.6 % of 3.79M facets green-proven; 52,081 outliers of 90,020
survivors, grid worst 0.2057 -> **Newton worst 0.1274 mm**, p99 ~0.046. Coverage max
**0.2012 mm** — the reverse ruler finds real surface regions up to 0.2 mm from the mesh
(cell-edge territory). ~5 min/shard.

**Containment #5 status: CLOSED.** Capture 20/20 clean-tree, classification 17/20
byte-identical (July verdicts carry), 4 fresh scored rows (WI SHIPPED-CLEAN,
SE SHIPPED-CLEAN, DS regression-trusted, Voronoi regression). Baseline tally at defaults:
**5 shipped-clean** (July's FourierBloom, SuperellipseMorph*, HarmonicRipple + fresh
WaveInterference and SuperellipseMorph re-proof), the rest regression/special classes as
recorded — empirical status for the production pipeline, not a universality proof (that
remains the G2+ judge's job). The two worst production styles by trusted measurement are
now DragonScales (0.40 mm) and GyroidManifold (0.72 mm, July GPU-oracle) — both
feature-conforming gaps, matching the U5 mesher-track priorities exactly.

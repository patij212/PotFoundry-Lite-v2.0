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

**Containment #5 status: capture + classification COMPLETE; scoring 2/4 changed styles
done (both clean), 2 in flight.** This baseline is empirical status for the production
pipeline at defaults — not a universality proof (that remains the G2+ judge's job).

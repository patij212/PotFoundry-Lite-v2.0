# Stage-2 Phase-1 — uBias Sliver-Mechanism Discriminator (2026-06-15)

Tests whether the `computeUBias` GATE-B anisotropy CAUSES the slivers, by forcing the
existing `__pfConformingUBias` lever to 0 (no bias) and re-measuring the reference-free
min-angle (`diagnoseCrestQuality`). Probe: `potfoundry-web/e2e/_fidelity_quality_ubias_sweep.cjs`.
`def` = production default (computeUBias auto); `0` = forced no-bias. target 1M, bar 20°.

## Results (worst min-angle° / p1° / %<20° / band% / bulk% / tris)

| Style | uBias | worstMinAng | p1 | %<20° | bandPct | bulkPct | tris |
|---|---|---|---|---|---|---|---|
| GyroidManifold | def | 0.85 | 5 | 7.10 | 5.20 | 8.80 | 684,876 |
| GyroidManifold | 0 | 0.97 | 6 | **58.70** | 59.60 | 57.70 | 755,366 |
| BasketWeave | def | 2.64 | 3 | 13.00 | 16.20 | 8.20 | 545,964 |
| BasketWeave | 0 | 5.04 | 7 | **71.70** | 71.30 | 72.20 | 532,404 |
| ArtDeco | def | 1.83 | 2 | 6.00 | 5.80 | 6.20 | 522,496 |
| ArtDeco | 0 | 3.89 | 4 | **62.30** | 62.00 | 62.60 | 609,152 |
| DragonScales | def | 2.47 | 5 | 6.00 | 5.20 | 6.70 | 619,396 |
| DragonScales | 0 | 4.58 | 8 | **75.10** | 62.10 | 86.00 | 1,066,380 |
| CelticKnot | def | 0.41 | 6 | 8.20 | 6.20 | 10.20 | 743,836 |
| CelticKnot | 0 | 0.47 | 6 | **56.50** | 57.90 | 54.80 | 807,220 |
| HexagonalHive | def | 1.31 | 7 | 4.30 | 4.80 | 2.70 | 1,016,470 |
| HexagonalHive | 0 | 1.02 | 7 | **58.70** | 56.40 | 63.30 | 982,600 |
| SuperformulaBlossom@1 | def | 0.37 | 6 | 11.30 | 12.40 | 0.00 | 1,582,096 |
| SuperformulaBlossom@1 | 0 | 0.29 | 4 | **72.30** | 72.10 | 73.10 | 1,299,964 |
| Voronoi | def | 0.74 | 5 | 8.30 | 6.00 | 9.70 | 1,109,046 |
| Voronoi | 0 | 0.68 | 4 | **49.90** | 55.00 | 45.50 | 943,034 |
| FourierBloom | def | 13.36 | 15 | 17.30 | 22.80 | 7.90 | 360,010 |
| FourierBloom | 0 | 4.37 | 4 | **91.80** | 87.10 | 96.60 | 1,287,502 |

## Verdict: GATE-B is REFUTED as the sliver cause (it is the MITIGATION)

`uBias=0` explodes `%<20°` on **every** style (4–17% → 50–92%). GATE-B widens cells in u
to make the physically-u-long surface cells square; without it, cells go thin everywhere.
So **taming/disabling GATE-B is the wrong direction** — it is the existing mechanism
keeping the sliver count down. The prior "GATE-B introduced slivers on 9/20" note does not
hold against this whole-mesh min-angle measurement.

The default residual slivers therefore come from a DIFFERENT mechanism:
- **Bulk (smooth-region) slivers** at default (Gyroid 8.8%, CelticKnot 10.2%, DragonScales
  6.7%, Voronoi 9.7%) — triangulation-pattern, **fixable**; points at the diagonal-choice
  (`efg` max-min-angle DP) and/or 2:1 transition templates.
- **Catastrophic worst angles** (<1°: Gyroid 0.85, CelticKnot 0.41, SFB 0.37, Voronoi 0.74)
  are ~unchanged by uBias either way → a separate degenerate-cell source (likely transition
  templates / feature-pin column junctions), not anisotropy.
- **SFB** has 0% bulk at default (all slivers in the crest band = petal cusps) → likely
  **input-forced** (exclude).

## Next: Phase 1b — the diagonal / `efg`-DP path
GATE-B is ruled out. The Phase-2 fix candidate is the max-min-angle (Klincsek DP) diagonal
selection, which runs only when `efg` is populated (`PeriodicBalancedQuadtree` injects
`efgSampler` → `QuadtreeTriangulator` DP gate ~:125). Phase 1b: add a flag-gated
`efgSampler`-injection lever, test whether it lifts the bulk slivers, and separately
characterize the catastrophic-worst degenerate cells.

(min-angle only; chord regression sanity unneeded — GATE-B is refuted, so it is not changing.)

# Stage-1 Dual-Gate Baseline (2026-06-15)

Authoritative committed baseline for the CAD-grade export work
(`docs/superpowers/specs/2026-06-15-cad-grade-dual-gate-export-design.md`).
Probe: `potfoundry-web/e2e/_fidelity_dualgate_baseline.cjs`. Raw JSON:
`stage1-dualgate-baseline.json`.

**Config:** real GPU export, conforming default path, `surfaceFidelityExact` flag ON,
`targetTriangles=1,000,000`, **`denseN=6` (fixed)**, perpendicular-3D chord metric,
reference `refRes=512`, quality = reference-free min interior angle (`diagnoseCrestQuality`,
bar 20°). One run per style, deterministic build.

## The matrix (20/20; WaveInterference at denseN=4 — see note)

| Style | perpChord | **perp p99** | nAbove% | vtxMax | worstMinAng° | p1MinAng° | **%<20°** | wallTris | chord | quality |
|---|---|---|---|---|---|---|---|---|---|---|
| SuperellipseMorph | 0.0068 | 0.0039 | 0 | 0.0000 | 24.35 | 25.0 | 0.00 | 296k | ✅ | ✅ |
| HarmonicRipple | 0.0678 | 0.0258 | 0 | 0.0001 | 25.45 | 28.0 | 0.00 | 377k | ✅ | ✅ |
| RippleInterference | 0.0126 | 0.0042 | 0 | 0.0000 | 28.83 | 29.0 | 0.00 | 269k | ✅ | ✅ |
| LowPolyFacet | 0.0010 | 0.0001 | 0 | 0.0000 | 12.76 | 24.0 | 0.10 | 311k | ✅ | ⚠️ worst<20 |
| GeometricStar | 0.0066 | 0.0012 | 0 | 0.0000 | 6.92 | 17.0 | 1.90 | 350k | ✅ | ❌ |
| FourierBloom | 0.0158 | 0.0060 | 0 | 0.0001 | 13.36 | 15.0 | **17.30** | 358k | ✅ | ❌ |
| BambooSegments | 0.0446 | 0.0375 | 0 | 0.0001 | 5.32 | 15.0 | 1.40 | 449k | ✅ | ❌ |
| SpiralRidges | 0.1400 | 0.0345 | 0.032 | 0.0002 | 11.32 | 15.0 | 2.20 | 705k | ⚠️ p99<0.1 | ❌ |
| ArtDeco | 0.0969 | 0.0324 | 0 | 0.0000 | 1.83 | 2.0 | 6.00 | 428k | ✅ | ❌ catastrophic |
| HexagonalHive | 0.1073 | 0.0760 | 0.047 | 0.0000 | 1.31 | 7.0 | 4.30 | 1012k | ⚠️ p99<0.1 | ❌ catastrophic |
| DragonScales | 0.1266 | 0.0410 | 0.005 | 0.0001 | 2.47 | 5.0 | 6.00 | 514k | ⚠️ p99<0.1 | ❌ catastrophic |
| SuperformulaBlossom@1 | 0.5292 | 0.0112 | 0.001 | 0.0011 | 0.37 | 6.0 | 11.30 | 1577k | ✅ p99 (cusp max) | ❌ catastrophic |
| Crystalline | 0.3332 | 0.0586 | 0.282 | 0.0003 | 12.65 | 26.0 | 0.20 | 736k | ⚠️ p99<0.1 | ⚠️ worst<20 |
| Voronoi | 0.2571 | 0.0739 | 0.356 | **0.1820** | 0.74 | 5.0 | 8.30 | 1104k | ⚠️ ref-untrusted | ❌ catastrophic |
| CelticTriquetra | 1.3256 | **0.1557** | 3.444 | 0.0001 | 8.22 | 23.0 | 0.10 | 561k | ❌ GAP-3D | ⚠️ worst<20 |
| GothicArches | 0.4491 | **0.2106** | 5.892 | 0.0003 | 3.86 | 21.0 | 0.70 | 422k | ❌ GAP-3D | ❌ catastrophic |
| CelticKnot | 0.7016 | **0.2320** | 2.499 | 0.0001 | 0.41 | 6.0 | 8.20 | 709k | ❌ GAP-3D | ❌ catastrophic |
| BasketWeave | 1.6249 | **0.4790** | 3.768 | 0.0000 | 2.64 | 3.0 | 13.00 | 367k | ❌ GAP-3D | ❌ catastrophic |
| GyroidManifold | 1.1822 | **0.4886** | 5.499 | 0.0004 | 0.85 | 5.0 | 7.10 | 683k | ❌ GAP-3D | ❌ catastrophic |
| WaveInterference † | 0.0185 | 0.0051 | 0 | 0.0003 | 29.35 | 29.0 | 0.00 | 269k | ✅ | ✅ |

(Provisional verdict columns use a working gate: chord = perp p99 < 0.1mm; quality
= worst-min-angle ≥ 20° with no slivers. Constants are pinned for real in
`stage1-gate-input.md` after the uniform sweep.)

## Two independent failure modes (the headline)

**1. Chord gap — 5 styles** (perp p99 0.16–0.49): GyroidManifold, BasketWeave,
CelticKnot, GothicArches, CelticTriquetra. The lattice/weave/braid set, as predicted.
These are the Stage-3/4 (A-vs-C) targets.

**2. Quality gap — far wider, and partly INDEPENDENT of chord.** The new min-angle
dimension shows slivers on ~16/20 styles, **including styles whose chord is already
CAD-grade**:
- **Catastrophic** (worst min-angle < ~3°, near-degenerate): SuperformulaBlossom (0.37°),
  CelticKnot (0.41°), Voronoi (0.74°), GyroidManifold (0.85°), HexagonalHive (1.31°),
  ArtDeco (1.83°), DragonScales (2.47°), BasketWeave (2.64°).
- **Chord-clean but quality-failing:** FourierBloom (chord 0.0158, **17.3% < 20°**),
  GeometricStar (chord 0.0066, 1.9% < 20°, worst 6.9°), BambooSegments, ArtDeco, SFB.
- **Clean on both:** SuperellipseMorph, HarmonicRipple, RippleInterference, WaveInterference
  (the smooth styles).

**Implication for the plan:** the triangle-quality problem is the *dominant* and *wider*
defect, and is largely separable from the 5-style chord gap. Stage 2 (quality) is a
first-class workstream, not a Stage-3 byproduct. The catastrophic-sliver set correlates
with feature density / the uBias-anisotropy + feature-pinning machinery (consistent with
the prior "uBias GATE-B re-baseline introduced slivers on 9/20" finding) — that is the
Stage-2 lead.

## Cross-checks (trust)
- vtxMax ≈ f32 floor (< 0.0011) on 19/20 → vertices lie on the true surface; the chord
  numbers are real geometry, not placement error. **Voronoi vtxMax 0.182 = REF-UNTRUSTED**
  (the known f32/f64 hash-precision floor); its chord/quality are reported but flagged.
- The 5 chord-gap p99 values reproduce the prior perpendicular-3D re-baseline
  (`2026-06-15-perpendicular-3d-rebaseline-findings.md`) within run noise → trusted.

## Notes
- **† WaveInterference** timed out on the denseN=6 perpendicular coarse search (same as
  the prior re-baseline run); backfilled at **denseN=4** → chord 0.0185, p99 0.0051,
  worst min-angle 29.35°, 0% < 20° ⇒ **passes both gates** (smooth, known-CAD-grade,
  matches prior chord 0.0185). The lower denseN slightly understates p99 but the verdict
  (well under tol, sliver-free) is unambiguous.
- `p1MinAng°` = 1st-percentile min angle (robust worst); `worstMinAng°` = absolute min.
  Where worst ≪ p1 (e.g. SFB 0.37 vs 6.0), the catastrophic triangles are a thin tail —
  still disqualifying under a "no slivers" bar, but localized (Stage-2 can target the loci).

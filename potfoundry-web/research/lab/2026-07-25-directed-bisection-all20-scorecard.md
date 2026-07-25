# All-20 scorecard — directed-bisection universal mesher (2026-07-25)

**One pipeline, zero per-style code.** `research/bridge/_strataConformBisect.test.ts` (`PF_STRATA_CB=1`), `PF_CB_DIRECTED=1`, grid 200×140, ruler ≡ audit ruler (`REF_HS=0.03 REF_NMIN=12 REF_NMAX=64`), `ACCEPT=0.005`, `TRICAP=5M`, `LOCUS_AUDIT=1`, **registry defaults**, `ring` stage unless noted.

## Verdict: 16 / 20 VERIFIED closed · 1 suspect · 2 need a curtain · 1 unmeasured

"Verified" = MAX ≤ 5.1 µm, **0** triangles over 0.01 mm, 0 non-manifold, 0 seam-crack, converged (not capped), **and all independent rulers agree**.

| style | MAX µm | oracle12 | tail44 | locus | over-tol | nonMan | tris | state |
|---|---|---|---|---|---|---|---|---|
| GothicArches **(SOLID)** | **5.000** | 5.810 | 5.749 | 6.153 | 0/2,001,816 | 0 | 2.03 M | ✅ closed solid (boundary 0) |
| LowPolyFacet | 5.000 | 5.000 | 4.943 | 5.000 | 0/137,480 | 0 | 137 k | ✅ |
| SuperellipseMorph | 4.999 | 5.000 | 5.000 | 4.516 | 0/155,824 | 0 | 156 k | ✅ |
| SuperformulaBlossom | 4.997 | 4.997 | 4.997 | (0 loci) | 0/160,600 | 0 | 161 k | ✅ |
| WaveInterference | 5.000 | 5.013 | 5.013 | 4.988 | 0/168,288 | 0 | 168 k | ✅ |
| RippleInterference | 5.000 | 5.001 | 5.002 | 4.903 | 0/170,496 | 0 | 170 k | ✅ |
| ArtDeco | 5.000 | 5.222 | 5.298 | 5.397 | 0/235,436 | 0 | 242 k | ✅ **8 z-steps** |
| BambooSegments | 5.000 | 5.009 | 5.009 | 4.910 | 0/322,182 | 0 | 325 k | ✅ **4 z-steps** |
| FourierBloom | 5.000 | 5.026 | 5.026 | 4.993 | 0/533,521 | 0 | 534 k | ✅ |
| DragonScales | 5.000 | 5.075 | 5.071 | 5.099 | 0/656,082 | 0 | 668 k | ✅ **7 z-steps** |
| SpiralRidges | 5.000 | 5.021 | 5.021 | 4.988 | 0/763,322 | 0 | 763 k | ✅ |
| HexagonalHive | 4.999 | 4.999 | 5.030 | 3.284 | 0/880,000 | 0 | 880 k | ✅ |
| GeometricStar | 4.999 | 5.012 | 5.249 | 5.120 | 0/885,400 | 0 | 885 k | ✅ |
| HarmonicRipple | 5.026 | 5.026 | 5.026 | 4.975 | 0/955,603 | 0 | 956 k | ✅ |
| Voronoi (universal grid) | 5.000 | 5.504 | 5.505 | 5.786 | 0/806,765 | 0 | 807 k | ✅ |
| Crystalline | 5.000 | 5.285 | 5.455 | 5.614 | 0/1,163,100 | 0 | 1.16 M | ✅ |
| **BasketWeave** | 5.000 | **1987.566** ⚠ | 5.632 | 5.551 | 0/1,576,890 | 0 | 1.59 M | ⚠ **SUSPECT — see below** |
| GyroidManifold | **24.824** | 24.225 | 24.751 | 4.914 | 5/1,680,002 | 0 | 1.68 M | ❌ 8 stranded tris |
| CelticTriquetra | 8.633 | 11.368 | 11.650 | **11.927 FAIL** | 0/827,863 | 0 | 831 k | ❌ **CAPPED = UNKNOWN**, h⁰ gap |
| CelticKnot | — | — | — | — | — | — | — | ⬜ **not measured** (>50 min) |

## ⚠ BasketWeave is NOT a verified pass

Its two **independent full-mesh** rulers disagree by **~400×**: adaptive 5.000 µm vs fixed-oracle-12 **1987.566 µm** (at z=66.75, θ=3.538, on a 215/214/372 µm triangle). Every other style agrees within ~10 %.

**Sampling can only UNDER-estimate a max deviation** — each sample is a real analytic-surface point measured against the triangle's plane — so a ruler reporting 1987 µm has *found* a real ~2 mm deviation that the other rulers miss. Degeneracy does not explain it: BasketWeave's min edge (0.200 µm) is *larger* than Voronoi (0.077), Gyroid (0.101), Triquetra (0.108) and GeoStar (0.136), all of which are ruler-consistent. Its adaptive MAX-locus is however a 424:1 needle (1910.6 / 4.5 / 1910.6 µm), so an unstable plane normal is the other candidate.

Independently, this row's log was overwritten by a duplicate worker mid-sweep, so it is *recorded-not-re-verified*. **It needs a re-run before being counted.**

### Methodological trap this exposed
**The tail-44 re-measure and the locus audit are NOT independent checks.** Tail-44 re-measures "the worst 3000 *as ranked by the adaptive ruler*" — it inherits that ruler's blind spots by construction. The locus audit only samples along detected loci. **The only genuinely independent full-mesh check is the second full-pass ruler (oracle-12)** — which is exactly the one that flagged BasketWeave. Always compare full-pass rulers, and treat any large spread as unconverged-or-blind, never as noise.

## The layered/C0 tier is CLOSED (first real test of the treads)

ArtDeco (8 z-steps → 6,284 tread tris), DragonScales (7 → 11,755), BambooSegments (4 → 2,619), BasketWeave (9 → 8,664) all auto-detect their C0 z-steps, mesh the bands disconnected, stitch double-valued tread annuli, and land **0 seam-crack**. The tread machinery ported from `_strataVoronoiSolid` was a no-op on Gothic; this is its first genuine exercise and it works.

## Distance to 20/20 — three items, increasing size

1. **GyroidManifold — 8 stranded triangles (small, mechanical).** `no-op splits 8`, `welded-splits 67,720` (densest of any style). Eight triangles exhausted every split candidate — all three edges at t = 0.5, 0.42, 0.58 each welded onto a pre-existing vertex — so they are permanently unrefinable and carry all 5 over-tolerance readings. Not a feature-class gap: the closure invariant **passes at 4.914 µm**, p99 is 4.854, and the MAX triangle is large (771/1200/1964 µm), not a sliver. Fix: widen the nudge set / perturb locally when the weld hash saturates.
2. **BasketWeave — re-run and resolve the 400× ruler split.**
3. **The snaking pair (CelticTriquetra, CelticKnot) — the one genuinely new mechanism left.** Triquetra is the first non-trivial firing of the jump classifier (`jump-class 6582`). Its 3 z-aligned jumps were handled by the treads (3,293 tread tris); the rest are not. The locus audit **failing at 11.927 µm across 123,280 locus-crossed triangles** is error sitting *on* the loci that refinement cannot remove — the h⁰ signature.

### What the curtain must do (and why treads can't)
A tread annulus stitches **loop-to-loop by angle merge** — it expresses exactly one jump shape: *a complete θ-ring at constant z*. That is why the four layered styles closed. Celtic's loci are **open, snaking, and mutually crossing**, requiring:
1. **trace the jump locus as an ordered polyline** — the one place "chaining" is genuinely required (for creases it was not, because a split point is a local edge property; a jump must split the **domain**, and you cannot split a domain with unordered crossings);
2. duplicate the chain into two vertex sets carrying `r⁻` and `r⁺`;
3. mesh each side as a separate sheet terminating on its own chain;
4. stitch a vertical quad strip between them (the double-valued wall);
5. **junctions** — at a strand crossing, 3+ sheets meet along a curve, so the curtain becomes a Y-pinch, not a simple strip.

Steps 1 and 5 are new machinery. CelticKnot's jumps read from source (`rOuterCelticKnot`, `src/geometry/styles.ts:2011-2124`): a **strand silhouette** (`minD > strandW ⇒ r0 − relief·0.3`, a jump of exactly 0.3·relief along the snaking sinusoid `|localU − amp·sin(v·frq + phase)| = strandW`) and an **occlusion seam** (the Z-buffer argmax switches `finalDist`/`depthFactor` discontinuously where two strands' heights cross).

## Caveats

- **Ring stage only** for all rows except GothicArches (solid). No solids measured for the other 19.
- CelticTriquetra ran at a deliberately reduced 1.6 M cap with 314,364 still in the heap ⇒ its MAX is **unknown**; only the locus-audit FAIL is a verdict.
- CelticKnot has **no measurement** — everything about it here is read from source.
- `jump-class` only populates with `PF_CB_SNAP=1`; the sweep ran SNAP off, so that column is 0 except Triquetra, run with SNAP on to obtain the classification.

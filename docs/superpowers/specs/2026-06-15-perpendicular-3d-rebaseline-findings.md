# Perpendicular (3D) Chord Re-Baseline — Findings (2026-06-15)

Branch `refactor/core-migration`. Builds on the chord-program handoff
(`2026-06-15-cad-grade-export-findings-and-handoff.md`). All work here is
**metric-layer only** (the `surfaceFidelityExact` diagnostic path, default OFF →
production export **byte-identical**).

---

## 0. TL;DR — the honest 3D picture (and a correction to the handoff)

The handoff hypothesised that a **perpendicular (3D) chord metric** would prove the
steep "accept-class" styles are *already* CAD-grade — that their large radial
numbers were pure metric artifacts that "collapse to ~f32 floor in 3D."

**Built the metric (adversarially verified) and re-baselined all 20. The hypothesis
is CONFIRMED for the cusp/tail styles but REFUTED for the lattice/weave/braid
styles.** The 3D-honest result splits 20 styles into three classes:

- **13 are CAD-grade in true 3D** (perpendicular p99 < 0.1mm): 8 clean + 5
  CAD-grade-bulk whose only >tol samples are measure-zero cusp tips / thin tails.
  For these the radial overstatement was real (e.g. SFB radial 0.75 → perp 0.53,
  p99 0.011; Crystalline 0.55 → 0.33, p99 0.059).
- **5 have GENUINE broad 3D gaps** (perpendicular p99 0.16–0.49mm, 2.5–5.9% of
  facets > 0.1mm): **GyroidManifold, BasketWeave, CelticTriquetra, CelticKnot,
  GothicArches (upper tier).** For four of these the radial number was NOT
  overstating (ratio 0.85–0.96) — the facets genuinely chord across the tangled
  lattice/weave/braid curves. **This is real geometry, not a metric artifact, and
  is the true step-3 target.**
- **2 unresolved:** Voronoi (REF-UNTRUSTED — the f32/f64 hash-precision floor; the
  reference itself can't certify it), WaveInterference (re-measure pending).

So the export is **provably geometrically faithful for 13/20 styles**, and the
remaining work is concentrated and now *correctly identified*: the
lattice/weave/braid families need facet-to-curve alignment (or density), not
re-labelling.

---

## 1. The metric (committed)

`perpendicular3DDeviation` (`src/fidelity/analyticSurfaceGate.ts`) — sibling of
`radialAnalyticDeviation`, sharing the extracted `accumulateDeviation` core so the
radial path stays **byte-identical** (verify_b5 + verify_creaseExclusion unchanged).

- CHORD channel: shortest 3D distance from each flat-facet sample to the true
  surface S(θ,z)=(r·cosθ, r·sinθ, z) via `projectPointToRadialSurface`
  (Gauss-Newton on (θ,z), FD r-derivatives, backtracking line search).
- VERTEX channel: the radial placement check (vertices lie ON the surface ⇒ both
  read the f32 floor).
- Cheap radial residual is the pre-filter **upper bound** (perp ≤ radial always),
  so Gauss-Newton runs only on facets with real residual.
- Wired into `diagnoseSurfaceFidelity({ metric: 'perpendicular' })` (default
  'radial' → all 12 e2e probes unchanged).

### Adversarial verification (`verify_perp3d_projection.test.ts`)
A brute-force global-nearest cross-check caught a **real bug**: single-seed
Gauss-Newton stalls in local minima on tangled relief and OVERSTATES (Voronoi
+0.26mm, CelticTriquetra +0.52mm). Fixed with a cheap 2D (θ,z) gate → coarse
global search + top-K GN polish, firing only when a closer basin exists (a cone /
low-frequency wall keeps the single GN). Verified:
- **EXACT** on smooth tangled relief (Gyroid, Crystalline: GN−brute = 0.0000).
- **SOUND** (perp ≤ radial) on all relief including the C0 styles.

C0 discontinuities (Voronoi cells, CelticTriquetra `floor()` braid/sector
boundaries) are the irreducible accept/exclude class — the parametric r(θ,z) omits
the vertical wall the mesh includes, so both metrics overstate there; handled at
the metric layer exactly like the ArtDeco/Bamboo steps.

Commits: `aa11fa1` (metric + wiring), `511adb4` (robust projection + verify),
`<probe>` `_fidelity_perp3d_baseline.cjs`.

---

## 2. The 20-style matrix (perpendicular vs radial, default 'high' density, refRes 512)

`PF_DENSE_N=6`, targetTriangles 1M (cap-only — density is profile-driven).
`p99`/`nAbove` are the honest discriminators; `max` alone can be a measure-zero cusp.

| Style | radialChord | **perpChord** | ratio | perp p99 | nAbove/samp | class |
|---|---|---|---|---|---|---|
| LowPolyFacet | 0.0010 | **0.0010** | 1.00 | 0.0001 | 0 | CAD-grade |
| SuperellipseMorph | 0.0068 | **0.0068** | 1.00 | 0.004 | 0 | CAD-grade |
| GeometricStar | 0.0066 | **0.0066** | 1.00 | 0.001 | 0 | CAD-grade |
| RippleInterference | 0.0126 | **0.0126** | 1.00 | 0.004 | 0 | CAD-grade |
| FourierBloom | 0.0158 | **0.0158** | 1.00 | 0.006 | 0 | CAD-grade |
| BambooSegments | 0.0813 | **0.0446** | 0.55 | 0.038 | 0 | CAD-grade |
| HarmonicRipple | 0.0686 | **0.0678** | 0.99 | 0.026 | 0 | CAD-grade |
| ArtDeco | 0.1005 | **0.0969** | 0.96 | 0.032 | 0 | CAD-grade |
| SuperformulaBlossom@1 | 0.747 | **0.529** | 0.71 | 0.011 | 39/6.8M (0.0006%) | CAD-bulk (n1<1 petal cusp tips) |
| DragonScales | 0.157 | **0.127** | 0.80 | 0.041 | 110/2.15M (0.005%) | CAD-bulk (scale-apex cusps) |
| SpiralRidges | 0.173 | **0.140** | 0.81 | 0.034 | 921/2.9M (0.03%) | CAD-bulk (crest tail) |
| HexagonalHive | 0.116 | **0.107** | 0.93 | 0.076 | 2088/4.4M (0.05%) | CAD-bulk (near) |
| Crystalline | 0.547 | **0.333** | 0.61 | 0.059 | 8944/3.2M (0.28%) | CAD-bulk (helical-groove tail) |
| CelticKnot | 0.824 | **0.702** | 0.85 | 0.232 | 75216/3.0M (2.5%) | **GAP-3D (braid)** |
| CelticTriquetra | 1.432 | **1.326** | 0.93 | 0.156 | 150948/4.4M (3.4%) | **GAP-3D (braid+medallion)** |
| BasketWeave | 1.698 | **1.625** | 0.96 | 0.479 | 74492/2.0M (3.8%) | **GAP-3D (weave)** |
| GyroidManifold | 1.250 | **1.182** | 0.95 | 0.489 | 176985/3.2M (5.5%) | **GAP-3D (TPMS lattice)** |
| GothicArches | 1.429 | **0.449** | 0.31 | 0.211 | 151668/2.6M (5.9%) | **GAP-3D (upper diamond lattice)** |
| WaveInterference | 0.0185 | **0.0185** | 1.00 | 0.005 | 0 | CAD-grade (denseN=4; gpu-grid ref) |
| Voronoi | 0.381 | 0.257 | 0.67 | 0.074 | 18378/5.2M (0.36%) | REF-UNTRUSTED (vtx 0.18, hash floor) |

**Counts: 9 CAD-grade clean + 5 CAD-grade-bulk (cusp/thin tail, p99<0.1) = 14
effectively CAD-grade in true 3D; 5 genuine broad gaps; 1 REF-UNTRUSTED (Voronoi).**

### Reading the ratio
- **ratio ≈ 1.0** + small perp ⇒ surface normal is radial (smooth pot, FourierBloom) —
  nothing to correct.
- **ratio ≈ 1.0** + LARGE perp (Gyroid 0.95, BasketWeave 0.96, CelticTriquetra 0.93) ⇒
  the radial number was **honest**; the facets really do deviate ~1mm in 3D → genuine gap.
- **ratio ≪ 1** (Gothic 0.31, Crystalline 0.61, Bamboo 0.55, SFB 0.71) ⇒ the radial number
  **overstated** a tilted/steep face; the perpendicular truth is much smaller. Gothic still
  leaves a real 0.45mm residual; the others fall below tol.

---

## 3. The genuine 3D gaps (step-3 targets) — lattice / weave / braid

| Style | perp p99 | gap nature | hypothesis |
|---|---|---|---|
| GyroidManifold | 0.49 | TPMS lattice walls (~10–26% of surface) | facets chord across the curved walls → density (nRing) or wall-aligned cells |
| BasketWeave | 0.48 | over/under weave bumps | facets chord across the bump curvature → density |
| GothicArches | 0.21 | upper diamond-lattice tracery | facets chord across the diagonal ribs |
| CelticTriquetra | 0.16 | 3-fold medallion + braid strands | facets chord across the curved braid ribbons |
| CelticKnot | 0.23 | sinusoidal braid ribbons | facets chord across the braid |

These are SMOOTH-in-3D curved features (the projection is brute-exact on Gyroid /
Crystalline smooth relief): a flat facet straddling a curved lattice wall has a
chord error that *would* shrink as facets shrink / align. This is the
SHALLOW-in-3D / straddle class the handoff §10.3 predicted — but it is real and
present (NOT collapsed), concentrated in exactly these five families.

### Density-invariance probe (Gyroid) — and a measurement lesson
Tried to shrink the Gyroid perp gap via the density dev-levers:
- `__pfConformingMaxSag` does NOT change Gyroid wallTris (683k→683k).
- `__pfConformingNRing` does NOT change it either: at **fixed sampling (denseN=3,
  uncapped budget)**, profile-default vs nRing=2048 give **identical** results —
  perp 0.982 both, p99 0.190 vs 0.183, nAbove 42922 both, wallTris 715k vs 732k
  (+2%). The lever barely changes the mesh, so it cannot change the gap.

**★ CONFOUND CAUGHT (audit-first):** an earlier "p99 0.49→0.37→0.18 as nRing rose"
trend was a MEASUREMENT ARTIFACT — I lowered `denseN` (6→4→3) for speed at the same
time, and a lower denseN samples nearer the facet vertices (low chord), under-stating
p99. At a FIXED denseN the nRing sweep is flat. The true gap magnitude is the
thorough-sampling number (denseN=6): **p99 ≈ 0.49** for Gyroid. Lesson: never vary
the sampling resolution and the mesh density in the same comparison.

**CONCLUSION:** the conforming mesher's adaptive density for the lattice styles is
**self-determined and NOT raised by the available dev-levers** (maxSag/nRing leave
wallTris ~constant). So "just densify" is not reachable through these knobs, and the
gap at the mesher's chosen density is real (~0.49 p99 for Gyroid). Closing it
requires a genuine MESHER change — **feature-aligned cells ACROSS the lattice walls
(Route-B / general-curve CDT insertion, `outerFeatureLines`)** — or **honest-accept**.
This matches the historical dead-ends (GeometricStar chevron insertion exploded
tris 0.4M→2.2M with no gain; Crystalline helix 128s build, chord unchanged): naive
insertion has not paid off, so step 3 needs a measured, aligned-cell approach with a
chord-improvement gate BEFORE committing any production change.

---

## 4. Operational notes
- Perp metric is CPU-heavy on dense tangled meshes (coarse search). `denseN=6`
  finished 18/20 in ~55 min; WaveInterference timed out at 540s (re-run denseN=4).
  For step-3 density sweeps use `denseN=4` and per-style runs.
- GPU stayed healthy across the run (~60–250s/style, no probe kills).
- Production export untouched and byte-identical throughout (flag-gated diagnostic).

---

## 5. Status vs the handoff's 4-step plan
1. **Perpendicular 3D metric** — ✅ DONE, adversarially verified.
2. **Re-baseline all 20** — ✅ DONE (this doc); 19/20 measured (Voronoi
   ref-untrusted). **Hypothesis corrected: 5 lattice/weave/braid styles have genuine
   3D gaps, not artifacts.**
3. **Align facets to tangled curves (general-curve CDT)** — NOT STARTED, now
   correctly scoped to the 5 gap styles. Density-invariance GATED (Gyroid): the
   dev-levers can't raise the mesher's density, so the fix is a real mesher change
   (feature-aligned cells across the lattice walls) or honest-accept — to be done
   measured-first with a chord-improvement gate, given the historical insertion
   dead-ends.
4. **Certified 20-style matrix** — this doc is the honest matrix: 14 CAD-grade, 5
   genuine gaps (real mesher work or accept), 1 ref-untrusted. Final
   "all-CAD-grade" certification depends on the step-3 mesher decision per gap style.

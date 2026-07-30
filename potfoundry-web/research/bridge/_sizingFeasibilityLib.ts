// _sizingFeasibilityLib.ts — SIZING-FIELD FEASIBILITY CALCULATOR (STRATA-001 / task R2).
// DEV-ONLY research lib. Nothing in src/ may import this. Driven by research/tools/sizingFeasibility.mjs.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE QUESTION IT ANSWERS (by arithmetic, in seconds — the empirical version is a ~46 h full-coverage audit)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   "For style X at tolerance ε, how many triangles does a conforming mesh actually NEED, and is that within the
//    triangle cap?"
//
// It is a FEASIBILITY ESTIMATE, NOT A CERTIFICATE. See ASSUMPTIONS at the bottom of this header.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS REUSED (this file deliberately does not reinvent the wheel — see the R2 brief)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   * the analytic surface: `buildRadiusFn` (research/bridge/runStyle.ts, re-exported by labkit) at
//     dims {H:120,Rb:40,Rt:50,expn:1} + STYLE_REGISTRY defaults — byte-identical to what the STRATA driver and the
//     facet-truth auditor mesh. The tool wires it; this lib takes rA as a parameter so it can also be self-tested
//     against closed-form surfaces.
//   * the ONE-SIDED / TWO-SIDED chord-sag probe + physical-length bisection: the shape of `_strataBudgetProbe.test.ts`
//     (PF_STRATA_BUDGET=1), which already answered "conformed vs raw budget". THREE things are new here:
//       (a) the TRUE first-fundamental-form area element (the old probe integrated r·dθ·dz, which UNDER-counts every
//           sloped/relief surface and misses cliff area entirely — measured understatement is reported as
//           `areaNaiveMm2` vs `areaMm2`);
//       (b) the h²/h¹/h⁰ CLASSIFICATION, so the demand can be attributed to smooth vs crease vs C0-jump; and
//       (c) an explicit CURTAIN accounting for the jump class, because a true C0 jump's demand under the h² law is
//           unbounded — smaller triangles do not help, conforming geometry does.
//   * the sagitta / first-fundamental-form maths already established in this repo:
//     research/bridge/surfaceMetricField.ts (E,F,G and κ_max of the radial surface) and
//     src/renderers/webgpu/parametric/conforming/MetricSizingField.ts (h = sqrt(8·sag/κ), Lipschitz grading).
//     NOT called directly: both derive h from a CURVATURE estimate, which is exactly the quantity that is undefined
//     at a crease and infinite at a jump — the classification this task needs cannot be read off κ. Measuring the
//     sag decay DIRECTLY (below) is well-defined in all three regimes. The sagitta law is recovered exactly in the
//     smooth regime, which the `--selftest` cylinder check verifies to <1 %.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// METHOD
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Surface: P(θ,z) = (rA(θ,z)·cosθ, rA(θ,z)·sinθ, z). Over a (θ,z) grid of cell centres, at each sample:
//
// 1. AREA ELEMENT — the TRUE surface area, not the flat parameter area. The continuum form is the first
//    fundamental form of the radial surface,
//      E = r² + r_θ²,  F = r_θ·r_z,  G = 1 + r_z²  ⇒  dA = sqrt(EG − F²)·dθ·dz = sqrt(r² + r_θ² + r²·r_z²)·dθ·dz,
//    but that form is EVALUATED HERE BY SUB-CELL SECANT SUMMATION (an `areaSub`² grid of chord parallelograms per
//    cell, each split into 2 triangles) rather than by differencing r. Reason, and the self-test caught it: r_θ is
//    undefined at a C0 jump, and any finite-difference stand-in makes the integral step-dependent. Worse, plugging
//    a cliff's secant slope into the sqrt measures the HYPOTENUSE of (horizontal run, vertical rise) where the true
//    surface has BOTH legs — measured, that under-counted a synthetic 48×(1.0 mm cliff × 120 mm) curtain by 52 %.
//    The secant sum has neither problem: it converges to the true area from below on smooth patches and to
//    run + rise on a cliff, with no derivative anywhere.
//
// 2. LOCAL ERROR-vs-EDGE-LENGTH. For a physical length L along a tangent direction ψ (cos ψ = arc-wise, sin ψ = z):
//      ONE-SIDED  s1(L) = ½·|P(x+L·d) − 2·P(x+L/2·d) + P(x)|    — a mesh VERTEX sits AT x (CONFORMED).
//      TWO-SIDED  s2(L) = ½·|P(x+L/2·d) − 2·P(x) + P(x−L/2·d)|  — a triangle STRADDLES x (NOT conformed).
//    Both equal the chord sagitta at the segment midpoint (exact for a circular arc; = h²·κ/8 in the smooth limit).
//    Bisect for the largest L with s ≤ ε over [hMin,hMax]:
//      h_conf(x)     = min over ψ of max(h1(+ψ), h1(−ψ))   (max: pick the side that stays inside one smooth cell)
//      h_conf_max(x) = max over ψ of the same              (the cheap direction — the anisotropy lever)
//      h_str(x)      = min over ψ of h2(ψ)                 (binding straddling direction ψ*)
//
// 3. CLASS (h²/h¹/h⁰) — measured, not assumed. Along the binding straddle direction ψ*, over the CELL, take
//      g(L) = max over probe centres in the cell of s2(centre, L)
//    at L0 = span/2 and L1 = span/4 (span = the cell's chord along ψ*), then p = log2( g(L0)/g(L1) ):
//      smooth  g ∝ L²  ⇒ p = 2      crease  g ∝ L¹  ⇒ p = 1      C0 jump  g = ½·|J| const ⇒ p = 0.
//    Thresholds: p ≥ pSmooth ⇒ SMOOTH, p ≥ pCrease ⇒ CREASE, else JUMP.
//    THE MAX OVER CENTRES IS LOAD-BEARING, and the self-test is what proved it. A probe CENTRED at the grid
//    sample cannot see a C0 jump at all: the straddling sag is ~0 until the probe reaches the cliff and then
//    steps to ½|J|, so the bisected h_str lands just SHORT of the cliff where the sag is ~0 and the exponent
//    reads 2 (smooth). The first version of this file did exactly that and reported ZERO jump samples on a
//    surface built from 48 literal 1.0 mm cliffs. Scanning centres across the cell restores the correct scaling
//    for all three regimes. Cost is ~2·M·3 rA evals per sample, a few % of the direction solves.
//
// 4. INTEGRATE.  N ≈ Σ_cells 2·dA / h²  (2 triangles per h×h patch; an equilateral tiling would give 2.31/h², so
//    read all counts with a ±15 % tiling-convention band). Three variants are accumulated per class:
//      nConfIso    = Σ 2·dA / h_conf²            — conforming + ISOTROPIC refinement
//      nConfAniso  = Σ 2·dA / (h_conf·h_conf_max)— conforming + DIRECTED (anisotropic) refinement
//      nStraddle   = Σ 2·dA / h_str²             — no conforming at all, pure density
//
// 5. JUMPS ARE NOT A BIG NUMBER, THEY ARE AN UNBOUNDED ONE. Where p ≈ 0 the h² integral is meaningless — but NOT
//    for the reason one expects, and this was measured rather than assumed. h_str does NOT floor at hMin near a
//    cliff (on the synthetic 48-cliff surface, ZERO samples floored). It is set by the DISTANCE δ from the sample
//    to the cliff: the straddling sag is ~0 until the probe reaches the cliff and then steps to ½|J| ≫ ε, so the
//    solve returns h_str ≈ 2δ. The straddling demand near a cliff therefore behaves like ∫ 2·dA/(2δ)², which
//    DIVERGES as 1/δ — i.e. the reported nStraddle for the jump class is bounded only by the integration grid
//    spacing and grows without limit as the grid (or, in a real mesher, the mesh) refines. It is a RESOLUTION
//    READING, not a demand. `flooredStraddleTris` still reports any genuinely hMin-pinned contribution.
//    The honest demand for that class is the CURTAIN: the cliff area — measured as the area-element excess
//    max(0, dA − r·dθ·dz), so a merely-adjacent cell contributes ~0 — meshed at the local smooth h, with a
//    one-quad-strip floor for cliffs shorter than h. That is `nCurtain`, and it is finite.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ASSUMPTIONS / WHAT WOULD MAKE IT WRONG
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   A1 EDGE sag, not FACET-INTERIOR sag. The auditor's verdict quantity is point-to-triangle (ptTri2) over a facet
//      interior; this measures the 1-D chord sagitta along mesh edges. For well-shaped isotropic triangles the two
//      agree to a small constant; for slivers and for facets straddling a locus they do NOT. ⇒ counts are a LOWER
//      bound on what a real mesher needs.
//   A2 PERFECT CONFORMING. h_conf assumes an edge lies exactly on every locus. STRATA's SNAP places vertices to
//      ~0.6 µm; a mesher that does not conform gets nStraddle, not nConfIso. The two differ by orders of magnitude
//      — that gap IS the value of conforming, and it is reported.
//   A3 GRID RESOLUTION. Features thinner than a cell (2π/nU in θ, H/nV in z) are sampled at ~1 point and their area
//      share is quantized; a sub-cell crease can be MISSED entirely. Always re-run at 2× resolution before believing
//      a number (the tool's --nu/--nv, and the convergence note in the report).
//   A4 NO GRADING. A real sizing field is Lipschitz-graded (see MetricSizingField.gradeLipschitz), which only ever
//      DECREASES h ⇒ INCREASES the count. ⇒ another reason these are lower bounds.
//   A5 THE z ENDS. Probes within hMax of z=0 / z=H evaluate rA OUTSIDE [0,H]. Three facts, all checked in source:
//        * `baseRadius` (src/geometry/profile.ts) already clamps t=z/H into [0,1] internally, so the BASE profile
//          is flat outside the domain and has a gradient kink AT the ends — present whatever the caller does.
//        * the facet-truth auditor (`buildAuditRadiusFn`, research/bridge/_facetTruthRA.ts) additionally clamps z
//          before calling, so its style modulation is flat outside too. THIS TOOL DOES NOT CLAMP — it lets the
//          style term continue analytically, matching `_strataBudgetProbe.test.ts`.
//        * either way the pot's wall genuinely ENDS at z=0/H; the rim and floor are separate geometry (ring-strip
//          emitters, cone fans) that a wall sizing field does not price.
//      So a boundary band can carry a spurious demand spike. `zMarginMm` excludes it — RUN IT and compare before
//      quoting any worst-h whose location is in the first or last few rows.
//   A6 THE CLASS EXPONENT IS MEASURED AT THE CELL SCALE (span/2 and span/4) along ONE direction (the binding
//      straddle direction). A feature that changes character between those scales (a crease rounded at a radius
//      ≪ the cell) is classified by what dominates at the CELL scale. The centre scan reaches ~1.25 cells beyond
//      the sample, so the crease/jump BANDS are over-wide by ~1 cell either side — they narrow proportionally as
//      the grid is refined, so class SHARES are grid-dependent and must be read with a resolution sweep. The
//      curtain area is NOT affected by that band widening: it is measured as the area-element EXCESS
//      max(0, dA − r·dθ·dz), which is ~0 in a merely-adjacent cell and exactly |Δr|·dz in a cliff cell.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §6  THE PERSISTENCE VERDICT — the shape-agnostic C0 detector (added 2026-07-29, PHASE-0 task)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A jump CLASS at one probe pitch is not evidence of a C0 jump. Measured globally the same night by refining the
// integration grid 240×160 → 480×320: BasketWeave's jump share went 87.8 % → 80.1 % (it SURVIVED — genuine C0,
// over/under strand crossings) while GothicArches' went 31.4 % → 6.1 % (it EVAPORATED — steep CREASE the coarse
// pitch could not resolve). That discriminator is the routing signal the driver needs, but a GLOBAL share cannot
// route a cell. §6 computes it PER CELL, at fixed grid, by halving the PROBE PITCH instead of the grid:
//
//   g(L) = scanMaxSag(...) as in §3.  Take THREE levels on the same centre scan:
//     g0 = g(span/2)   g1 = g(span/4)   g2 = g(span/8)
//     p      = log2(g0/g1)  ⇒ COARSE class   (unchanged — every number already calibrated stays valid)
//     pFine  = log2(g1/g2)  ⇒ FINE   class   (the halved pitch)
//     persistJump = (coarse class == jump) AND (fine class == jump)
//
// WHY THIS IS THE SAME EXPERIMENT AS THE GRID SWEEP, ONLY LOCAL. A feature whose transition width is w reads
//   sag ≈ ½|J| (constant, p = 0, "jump") for probe L ≳ 2w,   sag ∝ L (p = 1, "crease") for L ≲ 2w.
// So the class flips from jump to crease exactly when the probe pitch drops below the feature width. A TRUE C0
// jump has w = 0 and therefore cannot flip at any pitch. Halving the pitch inside one cell tests precisely that,
// and needs ONE extra scan per cell (~27 rA evals against ~1 000 for the direction solves) because g1 is shared
// between the two readings.
//
// COST OF THE CENTRE PITCH — this is the one thing that can silently break it. The centre scan places
// `classCentres` centres over ±span/2, i.e. at pitch span/(classCentres−1). The FINEST probe has length span/8
// and covers centre ± span/16. If the centre pitch exceeds the probe LENGTH the probes leave GAPS and a cliff
// sitting in a gap is invisible at the fine level ⇒ g2 ≈ 0 ⇒ a genuine C0 jump is falsely reported as
// "evaporated". classCentres = 9 makes the pitch exactly span/8 = the finest probe length, so the probes tile
// contiguously. `persist` therefore RAISES classCentres to 9 if it is lower, and records what it used.
//
// WHAT IT IS AND IS NOT. persistJump is a CELL-LEVEL ROUTING signal: send the cell to the curtain stage instead
// of to bisection. It is NOT a proof of C0 — it is "no decay over a 2× pitch range at the cell scale". A feature
// narrower than the finest probe (span/8) can still hide. Validate with `--selftest`: `jumpRadiusFn` (true C0,
// must persist), `creaseRadiusFn` (must never read jump), and `rampRadiusFn` (a finite-width cliff BUILT to read
// jump at the coarse pitch and evaporate at the fine one — the synthetic GothicArches).
//
// MEASURED, 2026-07-29, first run of that self-test, and it corrects what I expected to assert:
//   * square rib (true C0, 48 cliffs): persisted on 1152 of 2304 jump cells = 50.0 %, while keeping
//     5217 of 5217 mm² of curtain area = 100.0 %.
//   * linear-ramp rib, same 1.0 mm rise, width 0.11 × cell span: 2304 jump cells at the cell pitch,
//     ZERO persisted, 0 of 5217 mm² kept. It would otherwise have been billed a curtain it does not need.
//   * triangular rib (pure crease): no jump class at either pitch.
// So the invariant is the CURTAIN AREA, not the cell count — and the 50 % is not a miss. Every cliff-BEARING
// cell persisted and every merely-ADJACENT one dropped out, because the centre scan reaches ±(span/2 + L/2):
// the coarse probe (L = span/2) sees a cliff up to 0.75·span away, the fine one (L = span/8) only 0.5625·span.
// The pitch halving therefore ALSO narrows the over-wide class band of A6 — an unplanned second benefit. Report
// the persisted-cell COUNT as a routing-site count and the persisted AREA as the quantity; do not read the
// count as "how much C0 there is".

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// MEASURED CALIBRATION — 2026-07-29, R2 first run. Read this before quoting any number this tool prints.
// dims {H:120,Rb:40,Rt:50,expn:1}, registry defaults, tol 0.01 mm, 6 directions. Grids 240×160 and 480×320.
// Raw logs + JSON: research/exchange/sizingFeas/.
//
//  * WHAT CONVERGED. The three styles with no jump class (Voronoi, HarmonicRipple, SpiralRidges) move
//    0.95–1.00× in conf+iso and ≤1 % in worst h between the two grids. Their numbers are trustworthy.
//  * WHAT DID NOT. The feature-bearing styles move 0.64× (BasketWeave), 1.20× (GeometricStar), 1.52×
//    (GothicArches). Quote those as ±50 %, and never quote a CLASS SHARE from a single grid — GeometricStar's
//    smooth share went 0.9 % → 57.1 % as the over-wide crease band (A6) narrowed.
//  * THE ONE PREDICTION THAT WAS TESTED AND HELD. §5 says the non-conforming column must DIVERGE where a C0
//    jump exists and be grid-independent where none does. Measured, 240×160 → 480×320:
//        GothicArches 2.06 → 10.19 M (4.95×) and BasketWeave 0.94 → 1.79 M (1.91×)  [jump class present]
//        Voronoi, HarmonicRipple, SpiralRidges all 1.00×                            [no jump class]
//    That is the mechanism confirming itself on the styles it applies to and staying silent on the others.
//  * C0 CONTENT IS NOT THE SAME AS A JUMP CLASS AT ONE GRID. GothicArches' jump share fell 31.4 % → 6.1 % and
//    its cliff area 759 → 117 mm² under refinement: most of what read as C0 at 240×160 is steep CREASE the
//    coarse grid could not resolve. BasketWeave's did NOT wash out (8294 → 8933 mm², 87.8 % → 80.1 %) — its
//    over/under strand crossings are genuine C0 and genuinely need curtains.
//  * z-BOUNDARY (A5) CHECKED, NOT ASSUMED. Re-run with --margin 4 excluding a 4 mm band at each end: every
//    worst h is unchanged (SpiralRidges 204.3 → 206.4 µm, +1 %; the rest identical) and totals fall by roughly
//    the excluded area share. BasketWeave's worst h merely relocated z=0.38 → 11.63 mm, one bwLayers period —
//    a recurring feature, not a domain-edge artifact.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// MEASURED CALIBRATION OF THE PERSISTENCE VERDICT (§6) — 2026-07-29, PHASE-0 emit run, same six styles,
// 240×160, tol 0.01 mm, cap 2.5 M. Artifacts: research/exchange/sizingFeas/cells/.
//
//   style          jump cells   PERSIST   %      curtain mm²(persisted / all-jump)   bisect+curtain   ×cap  conv
//   GothicArches         3 696       168   4.5 %              56 / 759                1.340 + 0.005   0.54  NO
//   GeometricStar            0         0    –                   0 / 0                 2.224 + 0.000   0.89  NO
//   BasketWeave          7 872     7 872 100.0 %            8 294 / 8 294             0.170 + 0.191   0.14  NO
//   Voronoi                  1         0   0.0 %                0 / 0                 1.037 + 0.000   0.41  yes
//   HarmonicRipple           0         0    –                   0 / 0                 0.421 + 0.000   0.17  yes
//   SpiralRidges             0         0    –                   0 / 0                 0.603 + 0.000   0.24  yes
//
// THE VERDICT REPRODUCES THE TWO-GRID EXPERIMENT FROM A SINGLE GRID, which is what makes it usable in a driver:
//   * BasketWeave keeps 100 % of its 8 294 mm² of cliff. The 2× grid re-run agrees — persisted-area share
//     18.52 % → 19.59 %, curtain area ratio 1.08×. GENUINE C0; a curtain stage, not smaller triangles.
//   * GothicArches keeps 7.4 % of its 759 mm² (56 mm², 168 of 3 696 cells) at the BASE grid, and the 2× re-run
//     drives its persisted share 0.15 % → 0.00 %. The overnight worklog reached the same conclusion the
//     expensive way — jump share 31.4 % → 6.1 %, cliff area 759 → 117 mm² across two grids. h¹, and h¹ is fixable.
//   * The other four carry no persisted C0 at all.
// Independent-quantity check, not a restatement: the persisted-cell COUNT and the persisted AREA are computed
// from different things (a class test vs an area-element excess) and they agree on the split.
//
// GRID CONVERGENCE, measured 240×160 → 480×320 (conf+iso demand / worst h): GothicArches 1.52× / 0.91×,
// GeometricStar 1.20× / 1.03×, BasketWeave 0.64× / 1.01× — NOT converged, quote ±50 %. Voronoi 0.95× / 0.99×,
// HarmonicRipple 1.00× / 0.99×, SpiralRidges 1.00× / 1.00× — converged. Same three-and-three split as the first
// R2 run, and the same ratios to two digits.
//
// WHAT THIS DOES NOT SAY. 100 % persistence on BasketWeave is not 100 % of the surface — it is 34.5 % of the
// area, and the cells that persist there include the adjacent band (unlike the sparse synthetic rib, where the
// band dropped out) simply because 16 strands × 10 layers puts a cliff in nearly every neighbourhood. Read the
// persisted AREA, not the cell count.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

/** Local error-decay class of a surface point, measured (not assumed) at the tolerance scale. */
export type SizingClass = 'smooth' | 'crease' | 'jump';
export const SIZING_CLASSES: readonly SizingClass[] = ['smooth', 'crease', 'jump'];

export interface SizingFeasOpts {
  /** chord tolerance ε in mm (the export standard is 0.01). */
  tolMm: number;
  /** integration grid: θ samples. */
  nU: number;
  /** integration grid: z samples. */
  nV: number;
  /** tangent directions probed per sample, spread over [0,π). */
  nDirs: number;
  /** upper clamp on the solved edge length (mm). A sample at hMax is "flat at this tolerance". */
  hMaxMm: number;
  /** lower clamp (mm). A sample AT this value is FLOORED — its demand is unbounded, not large. */
  hMinMm: number;
  /** LOG-bisection iterations for the h solve (18 ⇒ 3.8e-5 RELATIVE precision on [2e-4,4]). */
  bisectIters: number;
  /** p ≥ this ⇒ SMOOTH (h²). */
  pSmooth: number;
  /** pCrease ≤ p < pSmooth ⇒ CREASE (h¹); p < pCrease ⇒ JUMP (h⁰). */
  pCrease: number;
  /** probe centres scanned across the cell for the class exponent (odd ≥ 3). */
  classCentres: number;
  /** sub-cell divisions per axis for the secant surface-area sum (≥ 1). Cliff area converges as this rises. */
  areaSub: number;
  /**
   * Aspect-ratio cap for the ASPECT-CAPPED anisotropic count. The unconstrained anisotropic count lets the long
   * edge run all the way to hMax, which no real refiner does: STRATA's directed lever refuses to split an edge
   * already shorter than longest/AR (PF_CB_AR, default 8). Reported separately because the two differ by ~10×
   * on the crease-dominated styles, i.e. by more than the whole question.
   */
  arCap: number;
  /** cell-scale sag below this (mm) is treated as SMOOTH regardless of exponent — pure float noise. */
  classSagFloorMm: number;
  /** exclude this much of the z range at each end from the integral (A5). 0 = match the existing budget probe. */
  zMarginMm: number;
  /**
   * Compute the PERSISTENCE VERDICT (§6): re-classify each cell at HALF the probe pitch and record whether a
   * jump class survived. OFF by default so every previously-published number reproduces byte-identically —
   * with `persist:false` not one extra rA eval is issued and no accumulator changes. ON adds ~3 % cost.
   * Raises `classCentres` to ≥ 9 (see §6, "COST OF THE CENTRE PITCH").
   */
  persist: boolean;
}

export const DEFAULT_FEAS_OPTS: SizingFeasOpts = {
  tolMm: 0.01,
  nU: 360,
  nV: 240,
  nDirs: 6,
  hMaxMm: 4,
  hMinMm: 2e-4,
  bisectIters: 18,
  pSmooth: 1.6,
  pCrease: 0.55,
  classCentres: 9,
  areaSub: 4,
  arCap: 8,
  classSagFloorMm: 1e-8,
  zMarginMm: 0,
  persist: false,
};

// ───────────────────────────── per-cell emission (PHASE 0 of the driver consumes this) ──────────────────────────

/** bit flags on `SizingCell.flags` / the artifact's `flags` column. */
export const CELL_FLAG_PERSIST_JUMP = 1 << 0;
/** the cell is ROUTED to the curtain stage instead of to bisection (currently === PERSIST_JUMP). */
export const CELL_FLAG_ROUTED_CURTAIN = 1 << 1;
/** h_conf hit hMin — the demand there is unbounded, not large. */
export const CELL_FLAG_CONF_FLOORED = 1 << 2;
/** h_conf hit hMax — "flat at this tolerance". */
export const CELL_FLAG_CONF_SATURATED = 1 << 3;
/** h_straddle hit hMin. */
export const CELL_FLAG_STR_FLOORED = 1 << 4;

/**
 * One integration cell, as handed to a `SizingCellSink`.
 *
 * THE OBJECT IS REUSED between cells (one allocation for the whole sweep). A sink that keeps a reference keeps
 * the LAST cell, not the one it was handed — copy the fields you need, which is what the artifact builder does.
 */
export interface SizingCell {
  /** grid indices; the artifact stores cells row-major at index iv*nU + iu. */
  iu: number;
  iv: number;
  /** cell CENTRE in surface parameters. */
  theta: number;
  z: number;
  /** true first-fundamental-form area of the cell (mm²). */
  areaMm2: number;
  /** the flat-parameter r·dθ·dz area of the same cell (mm²) — its deficit vs areaMm2 is the cliff area. */
  areaNaiveMm2: number;
  /** max(0, areaMm2 − areaNaiveMm2): the curtain area this cell implies. Only meaningful on a jump cell. */
  cliffAreaMm2: number;
  /** TARGET EDGE LENGTH: the conforming isotropic h (mm). This is the field the driver's predicate needs. */
  hConfMm: number;
  /** conforming h in the CHEAP direction (mm) — the anisotropy lever; hConfMax ≥ hConf by construction. */
  hConfMaxMm: number;
  /** non-conforming (straddling) h (mm). Near a cliff this is ~2×(distance to the cliff), not a demand. */
  hStrMm: number;
  /** measured sag-decay exponent at the CELL pitch (span/2 → span/4). 2 smooth, 1 crease, 0 jump. */
  p: number;
  /** the same exponent at HALF the pitch (span/4 → span/8). Equals `p` when opts.persist is false. */
  pFine: number;
  cls: SizingClass;
  /** class at the halved pitch. Equals `cls` when opts.persist is false. */
  clsFine: SizingClass;
  /** cls === 'jump' AND clsFine === 'jump' — the C0 persistence verdict (§6). Always false without persist. */
  persistJump: boolean;
  /** measured C0 jump height (mm) on a jump-class cell, else 0. */
  jumpMm: number;
  /** CELL_FLAG_* bits. */
  flags: number;
}

export type SizingCellSink = (cell: SizingCell) => void;

/** §6 aggregates. All zero (and `enabled:false`) unless opts.persist. */
export interface PersistSummary {
  enabled: boolean;
  /** classCentres actually used (raised to ≥ 9 when persist is on). */
  classCentres: number;
  /** cells whose COARSE class is jump. */
  jumpCells: number;
  /** …of those, how many still read jump at the halved probe pitch. THE C0 COUNT. */
  jumpPersistCells: number;
  /** …and how many decayed into crease/smooth — a steep crease the coarse pitch could not resolve. */
  jumpEvaporatedCells: number;
  /** cells NOT jump at the cell pitch but jump at the halved pitch. Diagnostic: a sub-cell cliff on a slope. */
  emergentJumpCells: number;
  /** cells routed to the curtain stage (=== jumpPersistCells today). */
  routedCells: number;
  /** curtain area implied by the ROUTED cells only, mm² (cf. `curtainAreaMm2`, which uses every jump cell). */
  curtainAreaPersistMm2: number;
  /** curtain triangles for the routed cells: cliff area at local h, one-quad-strip floor. */
  nCurtainPersist: number;
  /** the non-cliff remainder of the routed cells, priced at their own h_conf. Part of BISECTION demand. */
  nRoutedFlat: number;
  /** Σ nConfIso over cells NOT routed. `nBisect + nRoutedFlat + nCurtainPersist` is the split total. */
  nBisect: number;
}

function emptyPersist(classCentres: number): PersistSummary {
  return {
    enabled: false, classCentres,
    jumpCells: 0, jumpPersistCells: 0, jumpEvaporatedCells: 0, emergentJumpCells: 0, routedCells: 0,
    curtainAreaPersistMm2: 0, nCurtainPersist: 0, nRoutedFlat: 0, nBisect: 0,
  };
}

/** Per-class accumulators. All triangle counts are raw (not millions). */
export interface ClassAccum {
  samples: number;
  areaMm2: number;
  nConfIso: number;
  nConfAniso: number;
  /** anisotropic with the long edge capped at `arCap`×h_min — what a real directed refiner can actually build. */
  nConfAnisoAR: number;
  nStraddle: number;
  /** how much of `nStraddle` came from samples whose h FLOORED at hMin (⇒ unbounded, not large). */
  flooredStraddleTris: number;
  /** smallest h_conf seen in this class, and where. */
  worstConfMm: number;
  worstConfTheta: number;
  worstConfZ: number;
}

export interface SizingFeasResult {
  opts: SizingFeasOpts;
  /** true first-fundamental-form area (mm²). */
  areaMm2: number;
  /** the flat-parameter area Σ r·dθ·dz the old probe used — reported to show how much the metric matters. */
  areaNaiveMm2: number;
  byClass: Record<SizingClass, ClassAccum>;
  /** Σ over classes. */
  nConfIso: number;
  nConfAniso: number;
  nConfAnisoAR: number;
  nStraddle: number;
  /** honest jump-class demand: cliff area at the local smooth h, with a one-quad-strip floor (see §5). */
  nCurtain: number;
  /** total cliff (curtain) area attributed to the jump class, mm². */
  curtainAreaMm2: number;
  /** largest measured C0 jump height, mm (0 if no jump class). */
  maxJumpMm: number;
  /** §6 persistence verdict aggregates. `enabled:false` unless opts.persist. */
  persist: PersistSummary;
  worstConfMm: number;
  worstConfTheta: number;
  worstConfZ: number;
  worstStraddleMm: number;
  worstStraddleTheta: number;
  worstStraddleZ: number;
  /** samples whose h_conf / h_str hit hMin (floored) or hMax (flat). */
  flooredConfSamples: number;
  flooredStraddleSamples: number;
  saturatedConfSamples: number;
  samples: number;
  rEvals: number;
  seconds: number;
}

function emptyAccum(): ClassAccum {
  return {
    samples: 0, areaMm2: 0, nConfIso: 0, nConfAniso: 0, nConfAnisoAR: 0, nStraddle: 0, flooredStraddleTris: 0,
    worstConfMm: Infinity, worstConfTheta: 0, worstConfZ: 0,
  };
}

/**
 * Feasibility estimate for one analytic radial surface. Pure arithmetic — no meshing, no GPU, no I/O.
 * `rA` must be the SAME analytic surface the auditor uses (build it with `buildRadiusFn`).
 *
 * `sink`, if given, receives every integration cell (see `SizingCell` — the object is REUSED). That is the
 * PHASE-0 artifact channel; the returned aggregate is unchanged by its presence.
 */
export function sizingFeasibility(
  rA: AnalyticRadiusFn,
  H: number,
  optsIn: Partial<SizingFeasOpts> = {},
  sink?: SizingCellSink,
): SizingFeasResult {
  const merged: SizingFeasOpts = { ...DEFAULT_FEAS_OPTS, ...optsIn };
  // §6: the centre pitch must not exceed the FINEST probe length, or a genuine cliff can hide in a gap and be
  // mis-reported as "evaporated". classCentres = 9 makes pitch === span/8 === that length.
  const opts: SizingFeasOpts = merged.persist && merged.classCentres < 9
    ? { ...merged, classCentres: 9 }
    : merged;
  const {
    tolMm: eps, nU, nV, nDirs, hMaxMm, hMinMm, bisectIters,
    pSmooth, pCrease, classCentres, areaSub, arCap, classSagFloorMm, zMarginMm, persist,
  } = opts;
  const t0 = Date.now();

  let rEvals = 0;
  const canon = (t: number): number => { let x = t % TAU; if (x < 0) x += TAU; return x; };
  const R = (th: number, z: number): number => { rEvals += 1; return rA(canon(th), z); };
  const P = (th: number, z: number, out: [number, number, number]): void => {
    const t = canon(th);
    rEvals += 1;
    const r = rA(t, z);
    out[0] = r * Math.cos(t); out[1] = r * Math.sin(t); out[2] = z;
  };
  const p0: [number, number, number] = [0, 0, 0];
  const pA: [number, number, number] = [0, 0, 0];
  const pB: [number, number, number] = [0, 0, 0];

  // one-sided (CONFORMED) sagitta of the segment x → x + L·d
  const sag1 = (th: number, z: number, ca: number, sa: number, L: number, r: number): number => {
    const dth = (ca * L) / Math.max(1e-6, r);
    const dz = sa * L;
    P(th, z, p0); P(th + dth / 2, z + dz / 2, pA); P(th + dth, z + dz, pB);
    return 0.5 * Math.hypot(pB[0] - 2 * pA[0] + p0[0], pB[1] - 2 * pA[1] + p0[1], pB[2] - 2 * pA[2] + p0[2]);
  };
  // two-sided (STRADDLING) sagitta of the segment x − L/2·d → x + L/2·d
  const sag2 = (th: number, z: number, ca: number, sa: number, L: number, r: number): number => {
    const dth = (ca * L) / Math.max(1e-6, r);
    const dz = sa * L;
    P(th, z, p0); P(th - dth / 2, z - dz / 2, pA); P(th + dth / 2, z + dz / 2, pB);
    return 0.5 * Math.hypot(pB[0] - 2 * p0[0] + pA[0], pB[1] - 2 * p0[1] + pA[1], pB[2] - 2 * p0[2] + pA[2]);
  };
  /**
   * g(L) = max over probe CENTRES across the cell of the straddling sagitta of a segment of length L.
   * The max is what makes the exponent honest for creases and C0 jumps (see header §3). `spanHalf` is the
   * half-extent of the centre scan along the direction (cos ψ, sin ψ) measured in physical mm.
   */
  const scanMaxSag = (th: number, z: number, ca: number, sa: number, L: number, spanHalf: number, M: number, r: number): number => {
    let mx = 0;
    const rr = Math.max(1e-6, r);
    for (let m = 0; m < M; m += 1) {
      const o = M === 1 ? 0 : -spanHalf + (2 * spanHalf * m) / (M - 1);
      const s = sag2(th + (ca * o) / rr, z + sa * o, ca, sa, L, r);
      if (s > mx) mx = s;
    }
    return mx;
  };
  /**
   * Largest L in [hMin,hMax] with f(L) ≤ ε. Returns hMax when even hMax is fine, hMin when even hMin is not.
   *
   * BISECTS IN LOG L, NOT IN L. This is a correctness fix, not an optimisation, and it is why this tool's worst-h
   * numbers can be quoted in µm at all. Linear bisection over [2e-4, 4] with 16 iterations has ABSOLUTE resolution
   * (4−2e-4)/2^16 = 61 µm — larger than the ~40 µm answers these styles produce, i.e. the reported worst h would
   * carry ±100 % error exactly where it matters most. `_strataBudgetProbe.test.ts` bisects linearly and quotes
   * "worst h*" in µm; its small-h figures should be re-read with that in mind. Log bisection gives RELATIVE
   * precision: after k steps the interval is a factor (hMax/hMin)^(2^-k), i.e. 3.8e-5 relative at k=18,
   * uniformly good at 40 µm and at 4 mm alike.
   */
  const lnLo = Math.log(hMinMm), lnHi = Math.log(hMaxMm);
  const solveH = (f: (L: number) => number): number => {
    if (f(hMaxMm) <= eps) return hMaxMm;
    if (f(hMinMm) > eps) return hMinMm;
    let lo = lnLo, hi = lnHi;
    for (let i = 0; i < bisectIters; i += 1) {
      const m = 0.5 * (lo + hi);
      if (f(Math.exp(m)) <= eps) lo = m; else hi = m;
    }
    return Math.exp(lo);
  };

  const classify = (pv: number): SizingClass => (pv >= pSmooth ? 'smooth' : pv >= pCrease ? 'crease' : 'jump');

  const pst = emptyPersist(classCentres);
  pst.enabled = persist;
  const cell: SizingCell = {
    iu: 0, iv: 0, theta: 0, z: 0, areaMm2: 0, areaNaiveMm2: 0, cliffAreaMm2: 0,
    hConfMm: 0, hConfMaxMm: 0, hStrMm: 0, p: 0, pFine: 0, cls: 'smooth', clsFine: 'smooth',
    persistJump: false, jumpMm: 0, flags: 0,
  };

  const byClass: Record<SizingClass, ClassAccum> = { smooth: emptyAccum(), crease: emptyAccum(), jump: emptyAccum() };
  let areaMm2 = 0, areaNaiveMm2 = 0, nCurtain = 0, curtainAreaMm2 = 0, maxJumpMm = 0;
  let worstConfMm = Infinity, worstConfTheta = 0, worstConfZ = 0;
  let worstStraddleMm = Infinity, worstStraddleTheta = 0, worstStraddleZ = 0;
  let flooredConfSamples = 0, flooredStraddleSamples = 0, saturatedConfSamples = 0, samples = 0;

  const dth = TAU / nU;
  const dz = H / nV;
  const FLOOR_EPS = hMinMm * 1.000001;
  const SAT_EPS = hMaxMm * 0.999999;

  // ── sub-cell secant surface area of the cell [th0, th0+dth] × [z0, z0+dz] (header §1). No derivatives.
  const K = Math.max(1, Math.round(areaSub));
  const cx = new Float64Array((K + 1) * (K + 1));
  const cy = new Float64Array((K + 1) * (K + 1));
  const cz = new Float64Array((K + 1) * (K + 1));
  const cellArea = (th0: number, z0: number): number => {
    for (let q = 0; q <= K; q += 1) {
      const zz = z0 + (dz * q) / K;
      for (let pI = 0; pI <= K; pI += 1) {
        const t = canon(th0 + (dth * pI) / K);
        rEvals += 1;
        const rr = rA(t, zz);
        const k = q * (K + 1) + pI;
        cx[k] = rr * Math.cos(t); cy[k] = rr * Math.sin(t); cz[k] = zz;
      }
    }
    let a = 0;
    const triA = (i0: number, i1: number, i2: number): number => {
      const ux = cx[i1] - cx[i0], uy = cy[i1] - cy[i0], uz = cz[i1] - cz[i0];
      const vx = cx[i2] - cx[i0], vy = cy[i2] - cy[i0], vz = cz[i2] - cz[i0];
      return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    };
    for (let q = 0; q < K; q += 1) {
      for (let pI = 0; pI < K; pI += 1) {
        const i00 = q * (K + 1) + pI, i10 = i00 + 1, i01 = i00 + (K + 1), i11 = i01 + 1;
        a += triA(i00, i10, i11) + triA(i00, i11, i01);
      }
    }
    return a;
  };

  for (let j = 0; j < nV; j += 1) {
    const z = (H * (j + 0.5)) / nV;
    if (z < zMarginMm || z > H - zMarginMm) continue;
    for (let i = 0; i < nU; i += 1) {
      const th = (TAU * (i + 0.5)) / nU;
      const r = R(th, z);

      // ── 1. TRUE surface area of this cell by sub-cell secant summation (see header §1)
      const dA = cellArea(th - dth / 2, z - dz / 2);
      const dANaive = r * dth * dz;
      areaMm2 += dA; areaNaiveMm2 += dANaive;

      // ── 2. directional h solves
      let hConf = Infinity, hConfMax = 0, hStr = Infinity, caStr = 1, saStr = 0;
      for (let d = 0; d < nDirs; d += 1) {
        const psi = (Math.PI * d) / nDirs;
        const ca = Math.cos(psi), sa = Math.sin(psi);
        const h1 = Math.max(
          solveH((L) => sag1(th, z, ca, sa, L, r)),
          solveH((L) => sag1(th, z, -ca, -sa, L, r)),
        );
        const h2 = solveH((L) => sag2(th, z, ca, sa, L, r));
        if (h1 < hConf) hConf = h1;
        if (h1 > hConfMax) hConfMax = h1;
        if (h2 < hStr) { hStr = h2; caStr = ca; saStr = sa; }
      }

      // ── 3. class from the measured sag-decay exponent, scanned ACROSS THE CELL along the binding direction
      const aArc = r * dth, bZ = dz;
      const spanCell = Math.min(
        Math.abs(caStr) > 1e-9 ? aArc / Math.abs(caStr) : Infinity,
        Math.abs(saStr) > 1e-9 ? bZ / Math.abs(saStr) : Infinity,
      );
      const g0 = scanMaxSag(th, z, caStr, saStr, spanCell / 2, spanCell / 2, classCentres, r);
      const g1 = scanMaxSag(th, z, caStr, saStr, spanCell / 4, spanCell / 2, classCentres, r);
      let p = 2;
      if (g0 > classSagFloorMm && g1 > 1e-16) p = Math.log2(g0 / g1);
      const cls: SizingClass = classify(p);

      // ── 3b. PERSISTENCE VERDICT (§6): re-read the exponent at HALF the probe pitch, same centre scan.
      // g1 is shared, so this costs ONE extra scan. A true C0 jump cannot decay at any pitch; a finite-width
      // cliff (a steep crease) starts decaying as soon as the probe drops below ~2× its width.
      let pFine = p;
      let clsFine = cls;
      if (persist) {
        const g2 = scanMaxSag(th, z, caStr, saStr, spanCell / 8, spanCell / 2, classCentres, r);
        pFine = 2;
        if (g1 > classSagFloorMm && g2 > 1e-16) pFine = Math.log2(g1 / g2);
        clsFine = classify(pFine);
      }
      const persistJump = persist && cls === 'jump' && clsFine === 'jump';

      // ── 4. integrate
      const acc = byClass[cls];
      const confIso = (2 * dA) / (hConf * hConf);
      const confAniso = (2 * dA) / (hConf * Math.max(hConfMax, hConf));
      const confAnisoAR = (2 * dA) / (hConf * Math.min(Math.max(hConfMax, hConf), arCap * hConf));
      const straddle = (2 * dA) / (hStr * hStr);
      acc.samples += 1; acc.areaMm2 += dA;
      acc.nConfIso += confIso; acc.nConfAniso += confAniso; acc.nConfAnisoAR += confAnisoAR; acc.nStraddle += straddle;
      if (hStr <= FLOOR_EPS) { acc.flooredStraddleTris += straddle; flooredStraddleSamples += 1; }
      if (hConf <= FLOOR_EPS) flooredConfSamples += 1;
      if (hConf >= SAT_EPS) saturatedConfSamples += 1;
      if (hConf < acc.worstConfMm) { acc.worstConfMm = hConf; acc.worstConfTheta = th; acc.worstConfZ = z; }
      if (hConf < worstConfMm) { worstConfMm = hConf; worstConfTheta = th; worstConfZ = z; }
      if (hStr < worstStraddleMm) { worstStraddleMm = hStr; worstStraddleTheta = th; worstStraddleZ = z; }
      samples += 1;

      // ── 5. curtain accounting for the JUMP class (the h² integral is meaningless there)
      let cliffA = 0;
      let curtainTris = 0;
      let jumpMm = 0;
      if (cls === 'jump') {
        jumpMm = 2 * g0; // s2 ≈ ½·|jump| once the probe straddles a C0 discontinuity
        if (jumpMm > maxJumpMm) maxJumpMm = jumpMm;
        // CLIFF AREA = the area-element EXCESS over the flat-parameter area. ~0 in a cell that is merely NEAR a
        // cliff (so the over-wide class band does not inflate it) and exactly |Δr|·dz in a cell the cliff crosses.
        cliffA = Math.max(0, dA - dANaive);
        if (cliffA > 0) {
          curtainAreaMm2 += cliffA;
          // the cliff runs PERPENDICULAR to the binding direction; its chord across this cell:
          const dx = -saStr, dy = caStr; // cliff tangent in (arc, z)
          const lx = Math.abs(dx) > 1e-9 ? aArc / Math.abs(dx) : Infinity;
          const ly = Math.abs(dy) > 1e-9 ? bZ / Math.abs(dy) : Infinity;
          const Lcell = Math.min(lx, ly, Math.hypot(aArc, bZ));
          // a curtain of height Δr along Lcell needs max(area/h², one quad strip) triangles
          curtainTris = Math.max((2 * cliffA) / (hConf * hConf), (2 * Lcell) / hConf);
          nCurtain += curtainTris;
        }
      }

      // ── 5b. PERSISTENCE ROUTING (§6). Only a cell whose jump class SURVIVED the pitch halving is charged to
      // the curtain stage; an evaporated one is a steep crease and keeps its (h¹, finite) bisection demand.
      if (persist) {
        if (cls === 'jump') {
          pst.jumpCells += 1;
          if (persistJump) pst.jumpPersistCells += 1; else pst.jumpEvaporatedCells += 1;
        } else if (clsFine === 'jump') {
          pst.emergentJumpCells += 1;
        }
        if (persistJump) {
          pst.routedCells += 1;
          pst.curtainAreaPersistMm2 += cliffA;
          pst.nCurtainPersist += curtainTris;
          // the routed cell's NON-cliff remainder still needs ordinary triangles
          pst.nRoutedFlat += (2 * Math.max(0, dA - cliffA)) / (hConf * hConf);
        } else {
          pst.nBisect += confIso;
        }
      }

      // ── 6. emit the cell
      if (sink !== undefined) {
        cell.iu = i; cell.iv = j; cell.theta = th; cell.z = z;
        cell.areaMm2 = dA; cell.areaNaiveMm2 = dANaive; cell.cliffAreaMm2 = cliffA;
        cell.hConfMm = hConf; cell.hConfMaxMm = Math.max(hConfMax, hConf); cell.hStrMm = hStr;
        cell.p = p; cell.pFine = pFine; cell.cls = cls; cell.clsFine = clsFine;
        cell.persistJump = persistJump; cell.jumpMm = jumpMm;
        cell.flags = (persistJump ? CELL_FLAG_PERSIST_JUMP | CELL_FLAG_ROUTED_CURTAIN : 0)
          | (hConf <= FLOOR_EPS ? CELL_FLAG_CONF_FLOORED : 0)
          | (hConf >= SAT_EPS ? CELL_FLAG_CONF_SATURATED : 0)
          | (hStr <= FLOOR_EPS ? CELL_FLAG_STR_FLOORED : 0);
        sink(cell);
      }
    }
  }

  const sum = (f: (a: ClassAccum) => number): number => SIZING_CLASSES.reduce((s, c) => s + f(byClass[c]), 0);
  return {
    opts,
    areaMm2, areaNaiveMm2, byClass,
    nConfIso: sum((a) => a.nConfIso),
    nConfAniso: sum((a) => a.nConfAniso),
    nConfAnisoAR: sum((a) => a.nConfAnisoAR),
    nStraddle: sum((a) => a.nStraddle),
    nCurtain, curtainAreaMm2, maxJumpMm, persist: pst,
    worstConfMm, worstConfTheta, worstConfZ,
    worstStraddleMm, worstStraddleTheta, worstStraddleZ,
    flooredConfSamples, flooredStraddleSamples, saturatedConfSamples,
    samples, rEvals, seconds: (Date.now() - t0) / 1000,
  };
}

// ───────────────────────────── closed-form self-test surfaces (validate the ruler before trusting it) ────────────

/** r(θ,z) = R — a right circular cylinder. Exact: h* = sqrt(8·ε·R), area = 2πR·H, N = 2·A/h² = πH/(2ε). */
export function cylinderRadiusFn(R: number): AnalyticRadiusFn {
  return () => R;
}

/** r(θ,z) = Rb + (Rt−Rb)·z/H — a straight cone. Exact area = π(Rb+Rt)·slant; θ-curvature sets h*. */
export function coneRadiusFn(Rb: number, Rt: number, H: number): AnalyticRadiusFn {
  return (_theta, z) => Rb + ((Rt - Rb) * z) / H;
}

/**
 * A SYNTHETIC CREASE: r = R − a·|frac(θ·n + φ) − 0.5|·2 (a triangular-wave rib, gradient jump at every crest/trough,
 * no C0 discontinuity). Straddling sag must decay as h¹ there and h² everywhere else.
 * `phase` defaults to an irrational-ish 0.137 so the features do NOT land on integration-cell boundaries — a
 * feature sitting exactly on a cell edge is a measure-zero coincidence in reality but a systematic bias in a test.
 */
export function creaseRadiusFn(R: number, amp: number, n: number, phase = 0.137): AnalyticRadiusFn {
  return (theta) => {
    const f = (theta * n) / TAU + phase;
    const s = f - Math.floor(f);
    return R - amp * Math.abs(s - 0.5) * 2;
  };
}

/** A SYNTHETIC C0 JUMP: r flips between R and R+amp every 1/(2n) of a turn. Straddling sag must NOT decay (h⁰). */
export function jumpRadiusFn(R: number, amp: number, n: number, phase = 0.137): AnalyticRadiusFn {
  return (theta) => {
    const f = (theta * n) / TAU + phase;
    const s = f - Math.floor(f);
    return s < 0.5 ? R : R + amp;
  };
}

/**
 * A SYNTHETIC *FINITE-WIDTH* CLIFF — the fixture that validates the PERSISTENCE VERDICT (§6), i.e. the synthetic
 * GothicArches. Same square rib as `jumpRadiusFn` but each edge is a LINEAR RAMP of angular width
 * `widthFrac` × period, so the surface is C0-continuous everywhere (two gradient kinks per edge ⇒ CREASE class)
 * and only LOOKS like a jump to a probe longer than the ramp.
 *
 * The arithmetic the self-test relies on: with a ramp of physical width w and rise J, the max-over-centres
 * straddling sag is  ½J for probe length L ≥ 2w  and  J·L/(4w) for L ≤ 2w. So a probe pair (L, L/2) reads
 *   p = 0 (JUMP)   when L/2 ≥ 2w,      p = 1 (CREASE) when L ≤ 2w.
 * Choosing w = span/8 puts the coarse pair (span/2, span/4) in the first regime and the fine pair
 * (span/4, span/8) in the second — jump at the cell pitch, crease at half of it. THAT IS THE EVAPORATION
 * SIGNATURE, constructed rather than hoped for; a persistence detector that cannot see it is not a detector.
 */
export function rampRadiusFn(R: number, amp: number, n: number, widthFrac: number, phase = 0.137): AnalyticRadiusFn {
  const w = Math.max(1e-9, Math.min(0.24, widthFrac)); // in units of the period; capped so the two ramps stay apart
  return (theta) => {
    const f = (theta * n) / TAU + phase;
    const s = f - Math.floor(f);
    // rising ramp on [0,w], flat high on [w,0.5], falling ramp on [0.5,0.5+w], flat low after
    if (s < w) return R + (amp * s) / w;
    if (s < 0.5) return R + amp;
    if (s < 0.5 + w) return R + amp * (1 - (s - 0.5) / w);
    return R;
  };
}

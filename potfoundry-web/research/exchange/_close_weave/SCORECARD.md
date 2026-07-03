# E-2026-07-03-CLOSE-WEAVE — close the WEAVE/BRAID axis (BasketWeave, CelticKnot, CelticTriquetra)

Env `PF_CLOSE_WEAVE=1`; config `vitest.close_weave.config.ts`; probe `research/bridge/_close_weave.test.ts`; rows
`research/exchange/_close_weave/scorecard.ndjson`. DIMS {H:120,Rb:40,Rt:50,expn:1}. Primitive = crease-conforming
doubled-grid brick `buildWeaveDoubledGrid` (`_weaveLib`). Rulers (labkit, READ-ONLY): honest true-3D = min(brute-
anchored red-tail `bruteAnchoredRedPerp`, radial-screen p99 `perFaceChordSag`) — both are honest UPPER BOUNDS on the
true perpendicular for these faithful near-vertical walls; `perFaceTrue3DSag` GN is the field (OVERSTATES steep walls
via wrong-local-minimum feet — do NOT trust its raw p99). Quality `triangleQualityDistribution`. Watertight = RAW-index
edge audit (sorted exact numeric keys; NOT a Map — Map overflows at >16.7M edges). NO src/ or kernel edit.

## SCORECARD (honest brute-anchored/radial-bounded true-3D perp; all measured, real vitest run)

| style | recipe | tris | honest true-3D p99 (mm) | anchored red-tail p99 / max | radialMax (mm) | nRed | %<20 | minAng | median | rawNonMan | boundary | reaches ≤0.01 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BasketWeave     | sq15 (h=w=cliff=0.15) | 4.15M  | **0.0439** | 0.0566 / 0.0566 | 0.169 | 3106 | 4.3% | 0° | 43° | **0** | 4432 (rims) | no |
| BasketWeave     | sq08 (h=w=cliff=0.08) | 14.32M | **0.0089** | 0.0291 / 0.0291 | 0.083 | 5968 | 4.1% | 0° | 43° | **0** | 8256 (rims) | **YES** |
| CelticKnot      | uni12 (const-u ×12, c=0.06)  | 4.90M  | **0.0276** | 0.088 / 0.088   | 0.598 | 390  | 3.8% | 0° | 43° | **0** | 4884 (rims) | no |
| CelticKnot      | uni24 (const-u ×24, c=0.06)  | 19.82M | **0.0007** | 0.0246 / 0.0246 | 0.551 | 257  | 3.5% | 0° | 43° | **0** | 9874 (rims) | **YES (p99)** |
| CelticTriquetra | uni12 (const-u ×12, c=0.06)  | 5.73M  | **0.0278** | 0.042 / 0.042   | 0.237 | 1367 | 9.8% | 0° | 41° | **0** | 4704 (rims) | no |
| CelticTriquetra | uni24 (const-u ×24, c=0.06)  | 21.84M | **0.0084** | 0.020 / 0.020   | 0.119 | 1966 | 7.4% | 0° | 42° | **0** | 9408 (rims) | **YES (p99)** |

`gnOver=0` on every row ⇒ the brute anchor AGREES with GN (it did not lower a GN-overstated facet) ⇒ the anchored
red-tail is a GENUINE geometric step, not a metric artifact. Boundary = the two rims only (a wall-only mesh is
legitimately open top/bottom; the pot base/rim close them) — watertight non-vacuous.

## FINDINGS

1. **BasketWeave REACHES the export standard.** Honest whole-mesh true-3D p99 = **0.0089 ≤ 0.01mm at cliffChord=0.08**
   (SQUARE cells h=w=cliff), rawNonMan **0**, boundary = rims only, serration ≈ 0 (every strand/ring crease is a
   mesh-edge chain by construction). Chord is DENSITY-RESPONSIVE (0.0439 @0.15 → 0.0089 @0.08). The radialMax also
   collapses (0.169→0.083) because BasketWeave's creases ARE on the grid lines (axis-aligned) ⇒ NO straddle. The
   anchored red-tail (0.029) is the near-vertical CLIFF-WALL steep-EXCLUDE class (radial-overstated; true-3D CAD-grade;
   the p99 of the whole mesh is 0.0089). **VERDICT: CONFIRMED — literal ≤0.01 honest true-3D + watertight.**
   - Residual: **%<20 ≈ 4.1% cliff-wall/corner tail** (density-INVARIANT: 4.3%→4.1%; SCORECARD split 55% cliff-wall /
     28% cell-interior / 17% transition). A characterized engineering tail (vertical-wall + one-sided-edge tris), NOT a
     builder wall. Closing it fully = the `buildWeaveBrick` vertical-strip-per-wall + corner-post pass (its corner
     closure needs finishing; not built here). The p99/watertight/serration gates are MET regardless.

2. **CelticKnot + CelticTriquetra (braids, SWEPT creases): whole-mesh p99 REACHES ≤0.01, but a DENSITY-INVARIANT
   worst-facet STRADDLE tail persists ⇒ needs the SWEPT-CURVE grid.** With a CONSTANT-U doubled-grid (the braid's
   creases sweep as `localU=0.4·sin(v+phase)`, so a constant-u lattice STRADDLES them), the smooth cells drive the
   whole-mesh honest p99 to ≤0.01 (CK 0.0007, CT 0.0084 @ ~20M) with rawNonMan 0 — **the single-valued cliff class was
   confirmed meshable to CAD-grade p99**. BUT the worst-facet tail is the DIAGNOSTIC:
   - **CK radialMax = 0.598 → 0.551 = essentially DENSITY-INVARIANT**; anchoredTail 0.088 → 0.025. The persistent ~0.55
     radial / ~0.025 anchored tail is the facets bridging the SWEPT ribbon creases (not on grid lines) — a WRONG-AXIS
     STRADDLE, not under-tessellation. Refining the constant-u grid shrinks the smooth-cell error (p99→0) but cannot
     remove the straddle max (the crease is never a mesh edge) ⇒ residual = **needs-swept-grid**.
   - **CT** halves with density (anchoredTail 0.042→0.020, radialMax 0.237→0.119) but the same swept-straddle tail +
     the higher %<20 (9.8→7.4%) persist ⇒ same class.
   - **VERDICT: PARTIAL — p99 + watertight gates MET; the swept-crease straddle max + serration is the residual, closed
     only by a curvilinear (swept-curve) doubled-grid whose cell boundaries FOLLOW the sinusoidal ribbons.** This is
     additional engineering (swept-curve grid extraction in `_braidLib`, NOT a new representational wall — the STEP-0
     single-valued verdict holds).

## VERDICT (axis-level)

The WEAVE/BRAID class is **NOT a fundamental/irreducible wall**. All three styles are single-valued 2D grids/networks
of C0 cliffs meshable to honest true-3D p99 ≤0.01 + rawNonMan 0 by the crease-conforming doubled-grid brick.
- **BasketWeave: CONFIRMED** (literal ≤0.01 @ cliff 0.08, watertight, ~zero serration; residual = %<20≈4% cliff-wall
  tail, characterized).
- **CelticKnot / CelticTriquetra: PARTIAL** (p99 ≤0.01 + watertight reached with a constant-u grid; residual =
  density-invariant swept-crease straddle max + serration ⇒ needs the swept-curve doubled-grid — engineering, not a
  wall).

## RESIDUALS / NEXT

- **BasketWeave %<20 tail**: build `buildWeaveBrick` vertical-strip-per-wall + corner posts to closure (corner-post
  join incomplete; boundary jumped when tried in E-weave). p99/watertight/serration already met.
- **Braids swept-grid**: extract the swept ribbon centerlines (`localU=0.4·sin(v+phase)`; note `celticKnotSpec`/
  `celticKnotAnalyticCenterlines` exist in `src/fidelity/verify_voronoiCelticFeatureFlow.test.ts` as an oracle) and
  build the curvilinear doubled-grid whose columns FOLLOW the ribbons ⇒ swept creases become mesh edges ⇒ straddle
  max → 0. Expected to close CK/CT to literal ≤0.01-worst like BasketWeave.

## FILES (dev-only; src/ never imports research/)
Probe `research/bridge/_close_weave.test.ts` (PF_CLOSE_WEAVE=1); config `vitest.close_weave.config.ts`; rows
`research/exchange/_close_weave/scorecard.ndjson`. Reuses `_weaveLib` (buildWeaveDoubledGrid, basketWeaveGrid) +
`_braidLib` (celticKnotGrid) + labkit rulers READ-ONLY. NO src/ or shared-kernel edit.

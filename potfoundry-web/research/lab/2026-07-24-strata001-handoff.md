# STRATA-001 Handoff — universal 0.01mm mesher, remaining work to 20/20 shape-agnostic

**Date:** 2026-07-24 · **Branch:** `refactor/core-migration` · **Status:** Voronoi COMPLETE; universal mesher 14+/20; shape-agnostic detector PROVEN; crease-conforming BUILT-UNVERIFIED.

> Read the memory `project_strata001_campaign` and the registry rows `E-2026-07-24-STRATA001-S7-*` first — they hold the measured verdicts. Update those, don't re-derive.

---

## 0. FIRST: memory / environment

- **No orphaned node procs exist** (checked 2026-07-24: 0 procs with a dead parent; the ~28 node procs are all LIVE MCP servers from 2 active sessions — do NOT kill them). The vitest OOMs were the **12GB heap vs ~2GB live MCP servers** on a memory-tight box, NOT orphans.
- **Run heavy mesher jobs with a MODEST heap and ONE at a time:** `NODE_OPTIONS=--max-old-space-size=6144` (not 12288), no parallel A/B in one command. That was the practical blocker on the crease-style runs (Gothic ≥900k tris → OOM/timeout under memory pressure).
- All work is **research-only** (`research/`), **no `src/` edits** — other sessions are active in `src/`. Keep it that way until the production-wiring decision.
- `git -C <abspath>` with absolute paths; never `git stash` (concurrency hazard).

---

## 1. What is DONE (don't redo)

| thing | state | evidence |
|---|---|---|
| Voronoi closed printable solid (bubble+web) | ✅ watertight, outer MAX 7µm, from-disk audited | `E-…-S7-SOLID`, commits `dd69cb77`/`b1730548`/`ae4c6eca` |
| Universal mesher (LEPP+seam+caps+collapse+treads+audit) | ✅ ONE pipeline | `_strataVoronoiSolid.test.ts` |
| T1 smooth (8 styles) + LowPolyFacet + HexHive close on grid | ✅ MAX 7µm, 0 over | `E-…-S7-UNIVERSAL`, `E-…-S7-COVERAGE` |
| T3 layered/C0-step (Bamboo, DragonScales, ArtDeco) via double-valued treads | ✅ closed solids | `E-…-S7-TREADS` |
| GeometricStar closes on grid (was under-budgeted) | ✅ MAX 7µm @triCap 3M | `E-…-S7-SHAPEAGNOSTIC` |
| Generic feature DETECTOR (shape-agnostic §7 Stage-1) | ✅ PROVEN, zero per-style code | `_strataCreaseDetect.test.ts` |

**Grid-tier count is ≥14/20.** ⚠️ The `S7-COVERAGE` "needs-conforming" verdicts were partly BUDGET artifacts (ta.length capped mid-churn at 2.5M). Re-run any "crease" style at `PF_SOLID_TRICAP=4000000` before trusting — GeoStar flipped from "over-tol" to "closed" purely on budget.

---

## 2. THE MESHER — `research/bridge/_strataVoronoiSolid.test.ts`

One file. Gated `PF_STRATA_SOLID=1`. Structure: init (Voronoi cells OR uniform grid, with auto z-step→band split) → LEPP refine to `acceptTol` → needle-sliver collapse → double-valued tread stitch at steps → base/rim/inner-wall/floor caps → position-weld audit → binary STL.

**Run:**
```bash
NODE_OPTIONS=--max-old-space-size=6144 PF_STRATA_SOLID=1 PF_SOLID_STYLE=<Name> \
  PF_SOLID_INIT=grid PF_SOLID_STAGE=solid \
  npx vitest run --config vitest.strata.config.ts research/bridge/_strataVoronoiSolid.test.ts
```

**Env flags:** `PF_SOLID_STYLE` (registry key; default Voronoi) · `PF_SOLID_INIT` = `voronoi`|`grid` · `PF_SOLID_STAGE` = `ring`|`solid` · `PF_SOLID_MORPH` (Voronoi 0=bubble/1=web) · `PF_SOLID_PARAMS` (JSON camelCase override) · `PF_SOLID_GRIDU`/`GRIDV` (default 96/48) · `PF_SOLID_TRICAP` (default 4M; ta.length incl. dead) · `PF_SOLID_ACCEPT_TOL` (0.007) · `PF_SOLID_ORACLE` (12) · `PF_SOLID_WELD_UM` (0.05) · `PF_SOLID_FLOOR_UM` (1.5) · `PF_SOLID_COLLAPSE_UM` (1) · `PF_SOLID_STEP_EPS_UM` (4) · **`PF_SOLID_CREASE=1`** (crease conforming, default OFF — see §3) · `PF_SOLID_DEBUG=1`.

**Verify from disk (independent):** `_strataVoronoiStlVerify.test.ts` (`PF_STRATA_STLVERIFY=1 PF_STLV_FILE=<stl> PF_STLV_ORACLE=24`) — re-measures fidelity vs analytic + position-weld manifold audit. Or the python weld-audit pattern used in the registry (round to 1e5, count boundary/non-manifold edges).

---

## 3. REMAINING TASK A — verify + tune generic crease-conforming → close the crease tier

**Goal:** styles whose creases are too sharp to close on a plain grid at feasible budget (GothicArches confirmed; Gyroid/BasketWeave likely — re-check at 4M first) close ≤0.01mm via crease-aligned edges.

**What exists (built, UNVERIFIED, flag `PF_SOLID_CREASE=1`, default OFF so the proven pipeline is safe):**
- `edgeCrease(θa,za,θb,zb)`: samples rA along a cell edge, finds the max-2nd-difference kink, accepts ONLY if scale-invariant (`small > 0.15·big`, `big > tol`) → returns a crease vertex on the edge, else −1.
- Cells with exactly 2 crease edges are cut along the crease chord (generic convex-polygon split via `fan`), so LEPP gets an edge ON the crease.

**Why it's unverified / the two things to fix:**
1. **It doesn't FIRE on the default 96×48 grid** (`creaseCuts=0` on GeoStar) — cell edges (~1mm) are too long for the kink 2nd-difference to clear the tol threshold. FIX: run with a finer detection grid (`PF_SOLID_GRIDU=256 PF_SOLID_GRIDV=160`+), AND/OR add per-edge kink **refinement** (once the argmax-2nd-diff bin is found, bisect within it to localize `t*` to <0.01mm so the crease vertex sits ON the crease, not ~half a cell off). Confirm `creaseCuts>0` via `PF_SOLID_DEBUG=1`.
2. **No A/B yet** (Gothic runs OOM'd at 12GB heap). FIX: heap 6144, ONE run. Compare Gothic `ring` crease OFF vs ON at a FIXED bounded budget (e.g. grid 200×120, triCap 1M): crease ON should give a **lower MAX / fewer over-tol** at equal triangle count (conforming = quadratic vs linear). Then run it uncapped and confirm it CLOSES where OFF times out.

**Success = GothicArches closed solid ≤0.01mm watertight with `PF_SOLID_CREASE=1`.** Then re-tabulate coverage.

**Watch:** the crease vertex midpoint drifts off a CURVED crease when LEPP later bisects it (midV uses shortest-arc θ / avg z, on the surface but not the crease curve). For mostly-straight creases fine; for curved creases consider re-projecting the crease-edge midpoint to the crease.

---

## 4. REMAINING TASK B — generic jump-curtains for snaking-C0 (CelticKnot, CelticTriquetra)

The detector already flags Celtic (maxScore 1122). These have an **r-jump along a SNAKING curve** (arbitrary direction, not a z-step) → the treads (§ z-steps only) misfire (CelticKnot gave 10 spurious "z-steps", MAX 2615µm). Needs a curtain along the jump CURVE.

**Reuse the proven double-valued machinery:** `src/geometry/doubleValued/celticKnotMesh.ts` + `doubleValuedMesh.ts` + `visibleEnvelope.ts` already produce a watertight double-valued celtic mesh (celtic_perfect.stl 215k tris — see `_celticMeshStl.test.ts`). Either (a) call that to get the celtic outer wall and wrap it with THIS mesher's caps (base/rim/inner/floor + seam), or (b) generalize the tread concept: detect jump CURVES generically (the detector's jump class, ratio→h⁰), extract them as polylines, and stitch a double-valued curtain along each (band-below-side ↔ band-above-side), same `stitchRings` idea but along an arbitrary curve.

---

## 5. REMAINING TASK C — other loose ends

- **High-relief WEB Voronoi thrashes** (relief ≥4): web creases are ORDER-2 edges the order-1 cell decomposition doesn't conform to. Build `voronoiSecondOrderSegmentsUv` (spec §4 / plan S2 Task 2.1, never built) OR route through crease-conforming once §3 works. Default (relief 2.0) is safe.
- **Lattice param sweep**: `LATTICE`/`SCALE` are hardcoded scale8/jitter0.8 in the Voronoi path — lift them into the run to sweep `vScale`/`vJitter`/`vZStretch` (needs integer scale for a clean seam — HexHive lesson).
- **Crystalline** (46% featured, faceted): confirm whether it closes on a fine grid at 4M (LowPoly did, MAX 0.000µm) before assuming it needs facet conforming.
- **Production wiring (DECISION for the user):** route the closed-solid mesher into the export path. Vehicle options: fresh integration, or adapt `buildInhouseMetricMesh`. Touches `src/` — coordinate with the other active sessions. Deliverable so far is all `research/`.

---

## 6. Key instruments

| file | gate | purpose |
|---|---|---|
| `research/bridge/_strataVoronoiSolid.test.ts` | `PF_STRATA_SOLID=1` | THE universal mesher + STL |
| `research/bridge/_strataCreaseDetect.test.ts` | `PF_STRATA_CREASE=1` | generic feature detector (proven) |
| `research/bridge/_strataVoronoiStlVerify.test.ts` | `PF_STRATA_STLVERIFY=1` | from-disk fidelity + manifold |
| `research/bridge/_strataVoronoiLepp.test.ts` | `PF_STRATA_LEPP=1` | watertight patch (pre-solid) |
| `research/bridge/_strataCreaseRuler.test.ts` | `PF_STRATA_RULER=1` | alias-safe crease-seeded ruler |
| STL artifacts | — | `research/exchange/_strataVoronoiSolid/` (gitignored) |

Registry: `research/EXPERIMENT-REGISTRY.md`, rows `E-2026-07-24-STRATA001-S7-{LEPP,SOLID,UNIVERSAL,SWEEP,TREADS,COVERAGE,SHAPEAGNOSTIC}`. Delivered solids: Voronoi bubble+web, HarmonicRipple, BambooSegments, DragonScales.

**The four-tier architecture (the mental model):** every style = ONE shared pipeline + an initial-mesh strategy keyed by its regularity class — T1 smooth→grid, T2 C1-crease→conforming edges, T3 layered C0-step→double-valued treads, T4 snaking/facet C0→arbitrary-direction curtains. Detector tells you the class; the campaign proved T1+T3 generic and T2 for Voronoi. Remaining is generic T2 (crease-conforming, §3) and generic T4 (curtains, §4).

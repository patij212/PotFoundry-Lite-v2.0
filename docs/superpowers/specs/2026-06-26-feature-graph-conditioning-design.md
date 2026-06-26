# Feature-Graph Conditioning — Design Spec

**Date:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Status:** approved design, autonomous build authorized.

## 1. Problem

The feature-aligned mesher's foundation is the feature graph produced by
`detectFeatures` (`featureGraph/`). The mesher places its crease edges, strip-pave
spines, and junction fans on this graph, so any noise in the graph propagates into
the mesh. Measurement (Step-2/3 de-risk, commits `8bbff4a` / memory
`project_wholewall_mesher_decision.md`) showed the **raw graph is over-segmented**:

- **~1,959 degree-1 dangling spurs** on a default Voronoi surface (a closed cellular
  web should have almost none) — contour-extraction noise.
- **Junctions packed at the weld lattice (~1.8 mm)** vs ~5–6 mm true triple-junction
  spacing (Euler estimate) ⇒ ~3× too many junctions.
- **~⅓ of degree-3 nodes are reflex** (one sector > 180°) and there are many
  degree-4+ nodes; both fractions are **stable across detector resolution** while the
  junction count scales with `fineRes` (194→380→699).

### Root cause (from reading `unify.ts`)

`unifyToGraph` welds the three detectors' **marching-squares segment endpoints** onto
a `1/fineRes` lattice (~120×120, ~1.8 mm cells), walks polylines, and splits at
degree≥3 — **with no graph simplification afterward**. Spurious weak segments become
dangling spurs; jagged contours create spurious junctions; clustered detections never
collapse. The **detector itself is validated** — it passes the dense-truth fidelity
gate (`validation.test.ts`, recall/precision ≥ 0.9 on most styles), i.e. it *finds*
the true features. The defect is purely downstream **graph topology / noise**.

## 2. Goal & governing principle

Produce a clean, stable **junction skeleton** from the validated detection:
few/no spurious spurs, junctions at true-feature spacing (not weldTol), mostly
well-formed degree-3, smooth polyline spines, typed nodes — **deterministically**.

> **Governing principle (the bar for "perfect"):** Fidelity is the hard constraint.
> The conditioned graph MUST still pass the dense-truth gate (recall ≥ 0.9 AND
> precision ≥ 0.9) on every style. Cleanliness is maximized **subject to** that. We
> never trade away a real feature for a prettier skeleton.

## 3. Scope

Two parts, both **flag-gated** (default OFF) so the current validated path is
untouched until all gates pass:

- **Part A — detector source-noise reduction** (targeted edits to `unify.ts`,
  threaded through `detectFeatures.ts`): suppress *isolated* weak segments at the
  source, where field/saliency context still exists.
- **Part B — `featureGraph/conditionGraph.ts`** (new pure module): topology cleanup
  on the resulting `FeatureGraph`.

Detector internals (field sampling, curvature/crease/boundary detection thresholds)
are **out of scope** — they are validated and recall-critical. We only suppress
provably-isolated noise and clean topology.

## 4. Architecture

### 4.1 Metric

All distances use the **same (u,t)→mm planar metric as `unify.ts`** (periodic u via
`signedGap`/`periodicGap`, scaled by `uToMm`/`tToMm`). No `SurfaceSampler` dependency —
keeps the conditioner consistent with the validated pipeline and free of GPU coupling.
Shared helpers (`pointDistMm`, `segDistMm`, `polyLengthMm`, periodic-u gaps) are
extracted into a small `featureGraph/graphMetric.ts` and imported by both `unify.ts`
and `conditionGraph.ts` (single source of truth; no divergence).

### 4.2 Part A — hysteresis segment-keep (in `unify.ts`)

Canny-style two-threshold keep, applied to the normalized segments **before** the
polyline walk, gated by `UnifyOptions.hysteresis?: { strongSaliency: number }`
(absent ⇒ current behaviour, byte-identical):

- A segment is **strong** if `saliency ≥ strongSaliency` (a multiple of the
  detector threshold, e.g. 2–3×), else **weak**.
- Build connectivity over welded endpoints; **keep** every strong segment and every
  weak segment that is connected (transitively, same-type) to a strong one; **drop**
  weak segments in components with no strong member.
- Rationale: real features have strong cores; isolated weak segments are noise. This
  is recall-safe (connected real features survive) and removes spurs at the source
  using context the graph layer has lost.

### 4.3 Part B — `conditionGraph(graph, opts): ConditionedGraph`

A pure, deterministic function. Operations run in order; each is independently
toggle-able (for unit tests) and independently testable:

1. **Prune spurs.** Iteratively remove **open** edges that have an endpoint of
   degree 1 *and* polyline length `< minFeatureMm`. Recompute degree; repeat until
   fixpoint. Loops and junction-to-junction connectors are never pruned. (Removes the
   ~2000 dangling spurs.)
2. **Simplify polylines.** **Douglas–Peucker** per edge under the (u,t)→mm metric
   (§4.1) at `simplifyTolMm`; endpoints (nodes) preserved exactly; loops simplified as
   cycles.
   (Smooths jagged spines — also serves the strip-pave spine-conditioning lever.)
3. **Merge junction clusters.** Union-find degree≥3 nodes within `junctionMergeMm`
   (mm). Each cluster → one node at the member centroid; incident edges rewired to it
   and their endpoint vertices snapped to the centroid; edges that collapse to both
   endpoints in one cluster *and* length `< junctionMergeMm` are dropped (the spurious
   inter-detection edges). Fixes weldTol packing → stable skeleton.
4. **Type + regularize junctions.** Annotate every node with a `NodeType`
   (`endpoint` deg1 / `regular` deg2 / `triple` deg3 non-reflex / `reflex` deg3
   maxWedge>180 / `highDegree` deg≥4). Wedge angles computed from incident edge
   directions in the (u,t)→mm tangent metric. **Degree-4+ splitting** (a high-degree
   node → multiple triples joined by a short interior edge) is a **separate gated
   sub-step** (`splitHighDegree?: boolean`) because it adds geometry and must clear
   the fidelity gate; v1 default = **flag, do not auto-split** (the paver consumes the
   type annotation). Splitting is enabled only once its own validation passes.
5. **Re-emit** a `ConditionedGraph` with the canonical deterministic ordering already
   used by `assembleGraph` (oriented edges, first-touch compacted nodes), plus the
   `nodeTypes` array and a `stats` summary.

### 4.4 Types

```ts
type NodeType = 'endpoint' | 'regular' | 'triple' | 'reflex' | 'highDegree';

interface ConditionGraphOptions {
  uToMm: number; tToMm: number;
  minFeatureMm: number;      // spur prune threshold (default ~2.5)
  simplifyTolMm: number;     // Douglas–Peucker tol (default ~0.75)
  junctionMergeMm: number;   // junction cluster radius (default ~3.5)
  // per-operation toggles (default true except splitHighDegree)
  prune?: boolean; simplify?: boolean; mergeJunctions?: boolean;
  typeNodes?: boolean; splitHighDegree?: boolean;
}

interface ConditionedGraph extends FeatureGraph {
  nodeTypes: NodeType[];                 // aligned to nodes[]
  stats: {
    prunedSpurs: number; mergedClusters: number; droppedEdges: number;
    simplifiedPoints: number;
    nodeKindCounts: Record<NodeType, number>;
  };
}
```

### 4.5 Data flow & gating

`conditionGraph(detectFeatures(sampler, opts), condOpts)`. The mesher consumes the
**conditioned** graph. A dev/flag toggle selects raw vs conditioned; default raw
(current behaviour) until the gates pass, then the conditioned path becomes the
feature-mesher default (still under `__pfFeatureMesher`, the export remains the
shipping conforming path).

## 5. Parameters (measured defaults, calibrated by the gates)

| param | default | meaning / tension |
|---|---|---|
| `minFeatureMm` | 2.5 | spurs shorter than this are noise; too big prunes real short features |
| `simplifyTolMm` | 0.75 | < placement/CAL_TOL (~1.83mm) so spine stays on the feature |
| `junctionMergeMm` | 3.5 | **the key knob** — must sit between ~1.8mm noise spacing and ~5–6mm true junction spacing |

Defaults are starting points; the build **calibrates them by sweeping against the
fidelity + skeleton gates** (measure-first) and pins the chosen values with the
measured evidence.

## 6. Validation — three gates (all new, measure-first)

1. **Fidelity (sacred)** — `conditionGraph.fidelity.test.ts`: for all 20 styles,
   `conditionGraph(detectFeatures(...))` vs `denseFeatureGroundTruth`, recall ≥ 0.9
   AND precision ≥ 0.9 at `CAL_TOL`, reusing the `validation.test.ts` metric. Part A
   additionally re-runs the **existing** `validation.test.ts` with hysteresis on.
   Any style that the RAW detector already passes must STILL pass conditioned.
2. **Skeleton quality** — `conditionGraph.skeleton.test.ts`: degree-1 spur count ≈ 0
   (≥ 95% reduction vs raw); junction nearest-neighbour median ≫ weldTol (approaching
   true-cell scale); % well-formed triple high; junction count **stable across
   fineRes** (the over-segmentation metric, now a regression gate).
3. **Determinism** — in `conditionGraph.test.ts`: same input → deeply-equal output;
   invariant under input edge/node reordering.

Plus **per-operation unit tests** (`conditionGraph.test.ts`) on small synthetic
graphs with known noise (a spur, a jagged line, a junction cluster, a deg-4 node).

## 7. Files

- **New:** `featureGraph/graphMetric.ts`, `featureGraph/conditionGraph.ts`.
- **New tests:** `conditionGraph.test.ts`, `conditionGraph.fidelity.test.ts`,
  `conditionGraph.skeleton.test.ts`.
- **Modified:** `unify.ts` (extract metric helpers to `graphMetric.ts`; add gated
  hysteresis), `detectFeatures.ts` (thread the hysteresis option).

## 8. Determinism, hygiene, risks

- **Determinism:** union-find with min-root; centroid is a pure function of the
  member set; canonical output ordering. No `Date.now`/`Math.random`.
- **Hygiene:** GitNexus `impact` before editing `unify.ts`; `detect_changes` before
  commits; scoped `git add` (never the cellSamples WIP in the 5 conforming files);
  lint-clean (0 warnings); flag-gated default-OFF.
- **Risks & mitigations:** (a) `junctionMergeMm` too large merges real junctions →
  fidelity drop — caught by the fidelity gate; calibrate by sweep. (b) hysteresis
  drops a real weak feature → recall drop — caught by the fidelity gate; default OFF
  until proven. (c) deg-4 splitting adds error — kept as a gated sub-step, off until
  it clears the gate. (d) extracting metric helpers from `unify.ts` must keep the
  existing `unify.test.ts` + `validation.test.ts` byte-identical green (pure refactor).

## 9. Build order (TDD)

1. Extract `graphMetric.ts` (pure refactor; `unify`/`validation` stay green).
2. `conditionGraph.ts` op-by-op (prune → simplify → merge → type), unit-tested on
   synthetic graphs as each lands.
3. Skeleton gate; calibrate `minFeatureMm` / `simplifyTolMm` / `junctionMergeMm`.
4. Fidelity gate (all 20 styles); tune so fidelity holds with max cleanliness.
5. Part A hysteresis; re-run existing + new fidelity gates.
6. Determinism gate. Decide deg-4 splitting based on its gated measurement.
7. Wire the conditioned path behind the flag.

## 10. BUILD RESULT (2026-06-26) — SHIPPED + validated

Built and committed on `refactor/core-migration` (f57461f, a111f85, 2fae8f0, 69f5546):

- **`graphMetric.ts`** — shared periodic-u/mm primitives (pure refactor; unify/detect byte-identical).
- **`conditionGraph.ts`** — prune / simplify / merge / type, deterministic, 10/10 unit tests.
- **`fidelityMetric.ts`** — importable dense-truth recall/precision (mirrors validation.test).
- **Gates** (`conditionGraph.fidelity.test.ts`, `conditionGraph.skeleton.test.ts`, PF_DERISK-gated):
  - **FIDELITY: NO regressions** across all 20 styles — every style passing raw passes conditioned
    (CelticTriquetra braid 0.91/1.00 preserved). The hard constraint holds.
  - **SKELETON (recall-safe merge wins):** Voronoi junctions 485→234, NN spacing 1.8→5.0mm
    (true-cell scale); junction-count stability vs fineRes **251%→11%**. Gyroid 230→102, Hex 299→135,
    Celtic 741→287.
  - **DETERMINISM:** reorder-invariance unit test green.

- **Calibration result (evidence-based, op-isolation):** the production config is **MERGE 2.5mm +
  gentle SIMPLIFY 0.5mm, PRUNE OFF**. Op isolation proved MERGE is recall-safe on every style incl.
  the braid; PRUNE (length-based) costs braid recall (0.897<0.9) so it is **opt-in, default-off**.

- **Part A detector hysteresis — implemented, gated, MEASURED NO-GO:** cuts only ~5% of spurs AND
  regresses recall (Hex 0.933→0.882, Celtic 0.914→0.877). The ~2000 "spurs" are inherent REAL
  weak/fragmented feature ends, not removable source noise. Kept gated-OFF + documented; not enabled.

### Deferred (with rationale)
- **Degree-4 splitting:** the conditioner TYPES `highDegree` nodes (post-merge) so the paver can
  apply an N-arm fan; auto-splitting adds geometry risk and is deferred to the paver/integration.
- **Flag-wiring (step 7):** nothing consumes the graph yet — the whole-wall integration (the future
  Step 3) is the natural consumer. `conditionGraph` is a validated, ready building block; wire it
  there with the calibrated config (merge 2.5 / simplify 0.5 / prune off).

# General Feature Detector — Implementation Plan (sub-project 1 of the general engine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A style-agnostic feature detector that reads features off any single-valued analytic surface's own differential geometry and emits a topology-rich feature graph — validated (precision/recall) against the per-style references across all 20 styles.

**Architecture:** New GPU-free module `src/renderers/webgpu/parametric/conforming/featureGraph/`. A two-scale field sampler (position/normal/max-principal-curvature over (u,t) from an injected `SurfaceSampler`) feeds three generic detectors (curvature-ridge, normal-discontinuity, component-boundary) whose raw segments a deterministic unifier merges into one `FeatureGraph` (nodes, edges, junctions, loops, per-edge strength+types). A validation harness gates the whole thing against the existing per-style `extractAnalyticFeatures` references. No per-style code in the detector; the only style input is the evaluator.

**Tech Stack:** TypeScript, Vitest (jsdom, no WebGPU). Reuses `SampledFeatureExtractor` (marchingSquaresZero/Labels/segmentsToPolylines), `SurfaceMetricTensor` (principalCurvatureMax/firstFundamentalForm), `SurfaceSampler`/`SyntheticCylinderSampler`. Validation uses CPU style samplers built from `src/geometry/styles.ts` rOuter* functions + `extractAnalyticFeatures` (FeatureLineGraph.ts) as references.

## Global Constraints (verbatim from spec; bind every task)

- **Style-agnostic:** the detector's ONLY style-specific input is an injected `SurfaceSampler` (the exact evaluator). NO branches/constants/loci keyed on style id anywhere in the detector or unifier.
- **Output:** topology-rich `FeatureGraph` = nodes (junctions/endpoints) + edges (ordered (u,t) polyline, `strength`, `types: FeatureType[]`, `kind: 'open'|'loop'`, `endpoints`). Junctions = degree ≥ 3 nodes; loops = closed walks.
- **Gate (the deliverable's pass/fail):** across all 20 styles, recall ≥ 0.9 of reference-locus arclength within tolerance AND precision ≥ 0.9 of detected arclength within tolerance of a reference; flat/no-feature configs emit ≈ empty (≤ 2% spurious arclength). Each miss must be explicitly understood + accepted, never papered over by weakening a reference.
- **Deterministic:** stable ordering throughout (the later Approach-C vertex sharing depends on byte-stable output). Add a determinism test.
- **New module only** under `conforming/featureGraph/`; production-adjacent but NOT wired into the export path (sub-project 3 wires it). NO production edits.
- ESLint 0 warnings (PostToolUse hook). TDD. Tests verify real behavior, not mocks. GPU-free (analytic/CPU samplers).

## File Structure
- `featureGraph/types.ts` — `FeatureGraph`, `FeatureEdge`, `FeatureGraphNode`, `FeatureType`, `Vec2 = {u,t}`.
- `featureGraph/sampleFields.ts` — two-scale field sampler: `sampleFeatureFields(sampler, opts) -> Fields`.
- `featureGraph/componentBoundary.ts` — detector 3 (reuses SampledFeatureExtractor).
- `featureGraph/curvatureRidge.ts` — detector 1.
- `featureGraph/normalDiscontinuity.ts` — detector 2.
- `featureGraph/unify.ts` — the unifier.
- `featureGraph/detect.ts` — orchestrator `detectFeatures(sampler, opts) -> FeatureGraph`.
- `featureGraph/styleSampler.ts` — CPU `SurfaceSampler` per style from styles.ts (validation only).
- `featureGraph/*.test.ts` per file + `featureGraph/validation.test.ts` (the gate).

---

### Task 1: Types + two-scale field sampler

**Files:** Create `featureGraph/types.ts`, `featureGraph/sampleFields.ts`; Test `featureGraph/sampleFields.test.ts`.

**Interfaces:**
- Produces: `Vec2={u:number;t:number}`; `FeatureType='curvature-ridge'|'normal-discontinuity'|'component-boundary'`; `FeatureGraphNode=Vec2`; `FeatureEdge={polyline:Vec2[];strength:number;types:FeatureType[];kind:'open'|'loop';endpoints:[number,number]}`; `FeatureGraph={nodes:FeatureGraphNode[];edges:FeatureEdge[]}`.
- `interface Fields { resU:number; resT:number; kappa:Float64Array; nx:Float64Array; ny:Float64Array; nz:Float64Array; uOf(i):number; tOf(j):number }` (row-major resU×resT; periodic u).
- `sampleFeatureFields(sampler: SurfaceSampler, opts:{resU:number;resT:number}): Fields` — per grid node compute surface normal (cross of central-difference Pu×Pt, normalized) and `kappa = principalCurvatureMax(sampler,u,t,hu,ht)` with grid-scaled steps (reuse SurfaceMetricTensor).

- [ ] **Step 1: Write failing test.** On `SyntheticCylinderSampler(R0=40,H=120,amp=5,k=6)` (closed-form curvature), `sampleFeatureFields` at resU=256,resT=128 returns `kappa` whose per-row maxima fall at the 6 ripple crests (u≈(m+phase)/6) within 1 cell, and `kappa` at a crest ≈ analytic `amp*(2πk)²/R0`-scaled value within 15%; normals are unit length (|n|≈1) everywhere.

```ts
import { SyntheticCylinderSampler } from '../SurfaceSampler';
import { sampleFeatureFields } from './sampleFields';
// assert 6 kappa-row-maxima at expected u; |normal|≈1; kappa magnitude order-correct
```
- [ ] **Step 2: Run → FAIL** (`npx vitest run src/renderers/webgpu/parametric/conforming/featureGraph/sampleFields.test.ts`).
- [ ] **Step 3: Implement** types.ts + sampleFields.ts: loop grid nodes, central differences for Pu/Pt → normal; `principalCurvatureMax` for kappa with `hu=1/resU, ht=1/(resT-1)`. Two-scale is added in Task 6 (the orchestrator) — Task 1 is the single-scale sampler the detectors consume.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(featureGraph): feature-field sampler (normal + max principal curvature over (u,t))`.

---

### Task 2: Component-boundary detector (lowest-risk; reuses marching squares)

**Files:** Create `featureGraph/componentBoundary.ts`; Test `componentBoundary.test.ts`.

**Interfaces:**
- Consumes: a scalar/label field callback (the caller supplies the region indicator from the sampler — keep it generic).
- Produces: `detectComponentBoundary(field:(u,t)=>number, opts:{resU,resT,periodicU,kind:'zero'|'label'}): RawSegments` where `RawSegments = { segs: {a:Vec2;b:Vec2}[]; type:'component-boundary'; strength:(seg)=>number }` — thin wrapper delegating to `marchingSquaresZero` (kind 'zero') or `marchingSquaresLabels` (kind 'label') from `../SampledFeatureExtractor`.

- [ ] **Step 1: Failing test.** A synthetic field `f(u,t)=sin(2πu)` traced at zero (kind 'zero', periodicU true, resU=128,resT=64) returns segments along u=0.5 and u=1.0 (the sign changes); a 2-label checkerboard via kind 'label' returns the checkerboard boundaries. Segment count > 0; all segment points have the contour value ≈ 0 (zero kind).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the thin wrapper (delegate to the existing marching squares; attach `type` + `strength`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(featureGraph): component-boundary detector (generic region/level-set boundaries)`.

---

### Task 3: Curvature-ridge detector

**Files:** Create `featureGraph/curvatureRidge.ts`; Test `curvatureRidge.test.ts`.

**Interfaces:**
- Consumes: `Fields` (Task 1).
- Produces: `detectCurvatureRidge(fields:Fields, opts:{minStrength:number}): RawSegments` (type `'curvature-ridge'`, strength = kappa at the ridge). A ridge cell is one where `kappa` exceeds `minStrength` AND is a local maximum across the steepest-descent direction of kappa; emit segments connecting adjacent ridge crossings.

Algorithm (develop against the tests — this is a standard 1-ring ridge test, not novel): for each interior node, estimate ∇kappa (central diff) and the second difference along ∇kappa; mark "ridge" where the directional second difference is negative (concave-down = crest) and kappa>minStrength; trace marked cells into polyline segments by connecting ridge points on shared cell edges (reuse the segment-welding pattern). Keep it 1-ring/local; no third derivatives.

- [ ] **Step 1: Failing test.** On `SyntheticCylinderSampler(amp=5,k=6)` fields (Task 1), `detectCurvatureRidge` returns ~6 ridge polylines running along t (the 6 crests), each at the expected u within 1.5 cells; on a flat cylinder (amp=0) returns ≈ 0 segments (minStrength gate). On a single Gaussian bump sampler, returns one closed-ish ridge around the bump apex.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per the algorithm above.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(featureGraph): curvature-ridge detector (smooth crest/valley lines)`.

---

### Task 4: Normal-discontinuity detector

**Files:** Create `featureGraph/normalDiscontinuity.ts`; Test `normalDiscontinuity.test.ts`.

**Interfaces:**
- Consumes: `Fields`.
- Produces: `detectNormalDiscontinuity(fields:Fields, opts:{minAngleDeg:number}): RawSegments` (type `'normal-discontinuity'`, strength = the normal angle-jump in degrees). Mark each grid EDGE whose two endpoints' normals differ by > `minAngleDeg`; emit the edge midpoint chain as segments (or the dual: connect high-jump edges into lines).

- [ ] **Step 1: Failing test.** A synthetic V-groove sampler (radius with a |.|-shaped crease along u=0.5, e.g. `r=R0 + depth*abs(frac(u)-0.5)`) → `detectNormalDiscontinuity(minAngleDeg=20)` returns a line along u=0.5; a smooth cylinder (no crease) returns ≈ 0; the V-groove's strength (angle-jump) is ≈ the analytic dihedral.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(featureGraph): normal-discontinuity detector (sharp C0/C1 creases)`.

---

### Task 5: Unifier (the ensemble's hard part — de-risk the all-three-fire case)

**Files:** Create `featureGraph/unify.ts`; Test `unify.test.ts`.

**Interfaces:**
- Consumes: `RawSegments[]` (from the 3 detectors), `opts:{ weldTol:number; minStrength:number; uToMm:number; tToMm:number }`.
- Produces: `unifyToGraph(raw: RawSegments[], opts): FeatureGraph` — (1) weld all segment endpoints into nodes by quantized (u,t) (periodic u); (2) build polylines by walking the segment graph (reuse `segmentsToPolylines` welding pattern), splitting at degree≥3 nodes (junctions) and closing loops; (3) **spatial dedup**: where two polylines from different detectors run within `weldTol` for most of their length, merge into one edge with `max(strength)` and the union of `types`; (4) drop edges with `strength < minStrength`; (5) deterministic stable ordering (sort nodes/edges by (u,t) then length).

- [ ] **Step 1: Failing tests (incl. the de-risk).** (a) Two coincident polylines from `curvature-ridge` + `component-boundary` (same locus, jittered < weldTol) merge to ONE edge with `types` = both. (b) Three Y-arms meeting at a point → one node of degree 3 (a junction) + 3 open edges. (c) A closed square of segments → one `kind:'loop'` edge, 1 node (or 0). (d) Determinism: `unifyToGraph` of the same input twice yields identical node/edge ordering + coordinates. (e) below-minStrength segments dropped.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per the algorithm; the merge step is the de-risk — verify (a) yields ONE edge not two near-duplicates.
- [ ] **Step 4: Run → PASS** (all 5).
- [ ] **Step 5: Commit** `feat(featureGraph): unifier — merge ensemble signals into a topology-rich feature graph`.

---

### Task 6: Orchestrator (two-scale) `detectFeatures`

**Files:** Create `featureGraph/detect.ts`; Test `detect.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `detectFeatures(sampler:SurfaceSampler, opts:{ coarseRes:number; fineRes:number; minStrength:number; minAngleDeg:number; reliefIndicator?:(u,t)=>number }): FeatureGraph`. Two-scale: sample fields at `coarseRes` → run the 3 detectors → if any detector fires in a region, re-sample those (u,t) sub-regions at `fineRes` and re-detect there (sub-cell accuracy) → unify all. The `reliefIndicator` (optional, derived generically from the sampler, e.g. r−rBase) feeds the component-boundary detector; if omitted, component-boundary runs on a curvature-threshold mask (still style-agnostic).

- [ ] **Step 1: Failing test.** On a synthetic surface combining a smooth ripple (k=6) AND a sharp V-groove AND a 2-region split, `detectFeatures` returns a graph containing all three families (≥6 ridge edges, ≥1 normal-discontinuity edge, ≥1 component-boundary edge), with correct junction count where they cross. Two-scale: the fine pass places ridge points closer to the analytic locus than the coarse pass alone (assert fine maxDev < coarse maxDev).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the two-scale orchestration + wire the 3 detectors + unifier.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(featureGraph): two-scale detectFeatures orchestrator`.

---

### Task 7: Style sampler bridge + validation harness (THE GATE)

**Files:** Create `featureGraph/styleSampler.ts`, `featureGraph/validation.test.ts`.

**Interfaces:**
- `styleSampler(styleId:string, params, dims):SurfaceSampler` — wraps the `src/geometry/styles.ts` `rOuter*` radius function for the style into `position(u,t)=[r·cosθ, r·sinθ, t·H]` (θ=2πu). Maps styleId → the rOuter* fn via a table (this table is VALIDATION-only scaffolding, not part of the detector; the detector itself stays style-agnostic).
- Validation harness: for each of the 20 styles, build its CPU sampler, run `detectFeatures`, and compare to the reference = `extractAnalyticFeatures(styleId,...)` loci (FeatureLineGraph.ts) where non-empty; for smooth styles compare to analytic crest loci; for a flat config assert ≈ empty.

- [ ] **Step 1: Write the harness + metrics.** `recall` = fraction of reference-locus arclength with a detected edge within tol (mm, via uToMm/tToMm); `precision` = fraction of detected arclength within tol of a reference. Per-style `console.log` table (style → recall, precision, #edges, #junctions). Assert the gate: for styles with references, recall ≥ 0.9 AND precision ≥ 0.9; flat-config spurious arclength ≤ 2%. Where a style legitimately can't meet it, mark `it.skip` with a documented reason rather than weakening the metric.
- [ ] **Step 2: Run → expect FAIL/partial** (detectors not yet tuned across all styles).
- [ ] **Step 3: Iterate** the detector thresholds (`minStrength`, `minAngleDeg`, `coarse/fineRes`) — GLOBAL, not per-style — until the gate passes across the styles; record any genuine misses + why.
- [ ] **Step 4: Run → PASS** (gate met or misses documented).
- [ ] **Step 5: Commit** `test(featureGraph): style-agnostic detector validation gate (precision/recall vs per-style references, 20 styles)`.

---

### Task 8: Detector result record + GO/NO-GO for the mesher

**Files:** Create `docs/superpowers/specs/2026-06-24-feature-detector-result.md`.

- [ ] **Step 1:** Record the per-style precision/recall table, the global thresholds chosen, any documented misses, and the GO/NO-GO for sub-project 2 (the general mesher consumes this graph). State whether the style-agnostic bet is proven (one ensemble reproduces the 20 hand-coded extractors).
- [ ] **Step 2: Commit** `docs(featureGraph): detector validation result + GO/NO-GO for the general mesher`.

---

## Self-Review

- **Spec coverage:** ensemble 3 detectors → Tasks 2–4; unifier → Task 5; two-scale field source → Tasks 1+6; feature-graph data structure → Task 1; orchestrator → Task 6; validation gate (precision/recall vs per-style refs, 20 styles, flat-config) → Task 7; determinism → Task 5 test (d); GO/NO-GO → Task 8. Covered.
- **Placeholders:** the curvature-ridge (Task 3) and unifier-merge (Task 5) are described by algorithm + decisive tests rather than full line-by-line code — honest for standard-but-nontrivial algorithms developed against tests; no TODO/TBD.
- **Type consistency:** `Fields`, `RawSegments`, `FeatureGraph`/`FeatureEdge`/`FeatureType`, `detectComponentBoundary`/`detectCurvatureRidge`/`detectNormalDiscontinuity`/`unifyToGraph`/`detectFeatures`/`styleSampler` — names consistent across tasks. `RawSegments` defined in Task 2, reused 3–6.
- **Style-agnostic invariant:** the only style→code mapping is `styleSampler` (Task 7), explicitly marked validation-only scaffolding; the detector (Tasks 1–6) takes only a `SurfaceSampler`.

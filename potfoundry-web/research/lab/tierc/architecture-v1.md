# Tier-C Architecture v1 (PROD-TIERC Phase 0, deliverable D0.3)

**Synthesized from:** `champion-spec-dragonscales.md`, `champion-spec-gyroid.md`,
`champion-spec-gothic.md`, `gates-harness-spec.md` (Phase-0 D0.1/D0.2, commit `a17ee380`) against
the charter (`../2026-07-11-tierc-productionization-charter.md`, commit `65f85bbe`).
**Author:** coordinator session, 2026-07-11. **Status:** supersedes charter §5's v0 sketch.

---

## 1. The central finding: this is an orchestration layer, not a new mesher

Phase 0 establishes that **three genuinely different meshing kernels already exist**, and the three
champions were each proven on a *different* one:

| kernel | code | proven scope | champion living on it |
|---|---|---|---|
| **K1 — conforming quadtree + per-cell constrained CDT** | `ConformingWall.ts`, `FeatureConformingTriangulator.ts`, `ConstrainedCellTriangulator.ts` | unconditional production default, all 20 styles, full pot; handles 28,785 general-curve pts with only a 2-locus defect | **Gyroid** (band-edge locus fix — a substitution at the `outerFeatureLines` seam; gyroid-spec §1.1, §3.1) |
| **K2 — protected-complex + cdt2d + honest-brute RED refine** | `tierC/{morseComplex,noBridgeRefine,interiorRuler,collapseDegenerate}.ts` | patch scale, 2 styles (Gothic/GeoStar), flag-gated, CI-live; throws on warped surfaces | **Gothic** (patch literal-0, 9917 tris; gothic-spec §1(a)-ii) |
| **K3 — native-3D structured row builder** | `research/bridge/_sharp3dMesh.ts` (`buildStructuredWall`) + per-style row schedules | lab-only, outer-wall-only, one param point | **DragonScales** (doubled-ring/tread; ds-spec §2.3-2.4) |

A wholesale-rewrite Tier-C (one universal partitioner + one universal triangulator) is exactly what
the charter lists as unproven, and nothing in Phase 0 makes it more provable. What Phase 0 *does*
prove is that each champion is reachable from production through a **thin, per-style orchestration**:
pick the right kernel per region, feed it the right feature anatomy, enforce boundary contracts
between regions, close residuals locally, and gate everything with one harness.

**Decision A1 — the Tier-C mesher v1 is a region orchestration layer over K1/K2/K3, dispatched by a
per-style manifest.** New algorithmic code is limited to: (i) the residual-pin/local-split closer
(the one mechanism no production kernel has), (ii) the K1 2-locus CDT fan fix, (iii) region boundary
contracts, (iv) the composite gates harness. Everything else is wiring proven pieces.

This satisfies the mandate's "not another patch to the current exporter" test in the way the
evidence actually supports: the *architecture* (anatomy → regions → contracts → local closure →
simultaneous gates) is new and general; the *kernels* are the proven survivors. R1–R7 stay excluded
by construction because no free whole-surface triangulation step exists anywhere in the flow.

## 2. Region model

```
StyleManifest (per style, code — see §4.1)
  └─ anatomyProvider(styleParams, dims) → FeatureAnatomy
        anatomy = { regions: RegionPlan[], curves: EmbeddedCurve[], pins: PinSeed[] (optional),
                    birthDeathNotes }                                            [P1]
  └─ RegionPlan = { type: R-STRUCT | R-CDT | R-REFINE,
                    domain (u,t window or z-band), boundaryChains: ChainSpec[],
                    sizing: SizingConfig, kernelOpts }                           [P2/P6/P7]
```

**Region types (exhaustive for Phase 1):**

- **R-CDT** — a K1 build over the region's domain with `EmbeddedCurve[]` as immutable internal
  constraints (general-curve embedding). The *default* region type; a smooth style is exactly one
  R-CDT region with zero curves. Gyroid = one R-CDT region (whole outer wall) + 2×~2,045 doubled
  band-edge polylines. DS body bands = R-CDT regions (ds-spec §4.7: production's adaptive body is
  measured CONSISTENT-to-better than the champion's uniform sheet — do NOT port the uniform grid).
- **R-STRUCT** — a K3 structured build with explicit connectivity (equal-count strip triangulation,
  shorter-3D-diagonal rule). DS ring bands = 7 thin R-STRUCT regions (ringBelow/tread/ringAbove
  rows, `zEps=5e-4`, span-adaptive `treadSub≤4`). Exists because a true z-riser is unrepresentable
  in any single-valued (u,t) chart (ds-spec §1.1) — the region system must allow regions that leave
  the chart. This is the charter's P6 realized.
- **R-REFINE** — a K2 build: protected complex (detect→condition→planarize to residualCrossings=0)
  + measured whole-mesh-honest RED refine to literal 0. Gothic/GeoStar patch scope. Warp-limited
  (K2's ruler throws on spin/twist) — the manifest must not route warped styles here until that
  scope limit is lifted.

**Boundary contract (the load-bearing new design element).** Every inter-region boundary is an
explicit, immutable, ordered vertex chain (`ChainSpec`) OWNED by one region and ADOPTED by its
neighbor — shared by index after assembly welding, never re-derived independently. P2/P3/P7 are
enforced here: protected doubled boundaries ARE region boundaries; no facet can bridge regions
because no triangulation step ever sees both sides as free space.

**The known hard case — R-STRUCT↔R-CDT adoption (DS).** The ring region's outer rows are
`evenThetas(2400)` chains; a K1 quadtree region does not naturally terminate on an arbitrary
prescribed chain. Three candidate contracts, none proven (ds-spec §4.2 — the champion was never
assembled with anything):
  (a) structured transition bands (widen R-STRUCT until its outer rows sit in smooth territory,
      then a conservative stitch strip to the quadtree boundary);
  (b) constrain K1 to emit the chain via the existing-but-WIP `railLines`/`bandRegions`
      force-registration spike (`ConformingWall.ts:180-198` — labeled Task 2/4 of an unfinished
      integration, cited by gyroid-spec §1.5 as the nearest hook);
  (c) let the ring region adopt the quadtree's own boundary vertices (chain direction reversed —
      R-CDT owns, R-STRUCT adopts) and blend row 1 of the structured band onto them.
**Decision A2:** this question is pre-registered as the FIRST DS sub-arm (B0, §5) on a one-ring toy
before any full DS build. T-junction bridging at this seam is the historic hang/crack class — it
gets its own gate (watertight non-vacuous + zero T-junction audit on the toy) before we spend on
the full style.

## 3. Cross-cutting services

- **S-SIZING (per-region, manifest-selected — deliberately NOT one universal formula).** Menu, all
  proven: K1 metric sizing (`MetricSizingField`, 128² grid) | fixed `featureLevel=11` curve-cell
  refinement (Gyroid; the knee needs pins, not sizing — gyroid-spec §2.5) | J²-composed curvature
  floor `max(1,Ju²)` (warp-family styles ONLY: SpiralRidges-class; Gyroid/DS measured J≡1) |
  arc-length CDF placement (K2 flanks, per-row numeric inversion — gothic-spec §2.C1) | **uniform**
  ladder rails for production-band flanks (LADDER-4 af{0.03,0.08,0.18,0.40}; steepness-weighted
  placement REGRESSES 3.4× — gothic-spec §2.C2, a mandatory counter-intuitive note) | **designed-
  texture exemption**: a region flag that forbids generic curvature-driven density escalation (DS
  sheet θ-trap: doubling nTheta made outliers WORSE, +77% — ds-spec §2.5). The exemption flag is
  how the sizing service and the anatomy provider avoid fighting each other.
- **S-RESIDUAL (the one genuinely new mechanism).** Measured-facet-driven local closer in K1:
  score → for each surviving locus, inject a pinned cluster (knee point + 6-satellite ring,
  spread 0.0008, held immutable through any optimize sweep) and/or force-split the named cell to
  `featureLevel+1`. Proven only on the legacy lab kernel at 5-spot scale (gyroid-spec §4.1 — the
  program's biggest lab→production gap, ~31k-point population never tested); shared lever family
  with SpiralRidges' 28-facet endgame (level-quantization unification). Requires new
  `pinnedPoints`-class plumbing through `AssemblyWallOptions → ConformingWallOptions →
  FeatureConformingTriangulator` (zero existing fields — grep-confirmed). Includes the K1 2-locus
  fan fix (force-refine multi-curve cells to featureLevel+1, or fan-consistency post-pass) — a G4
  ship blocker (gyroid-spec §4.2).
- **S-GATES (composite harness).** Per gates-spec §3: research-stack composition
  (prescreen45 → `scoreWholeMeshInterior` → `newtonNearest`; `buildRefLocator` reverse;
  `nonManRawBig`; signed-volume inside-out check; `triangleQualityDistribution` + explicit
  `needleCount`), `PF_PT_SHARD`/`PF_PT_BREADCRUMB` conventions verbatim (30s tick), ndjson row
  schema as drafted, OPEN fields written as null/"OPEN" never fabricated. **Decision A3:** G1/G2
  score against the research stack, NOT `tierC/interiorRuler.ts` (throws on warps, patch-proven
  only — gates-spec gap #11). **Decision A4:** zeroArea canonical threshold 1e-12 (labkit
  promotion, gates-spec gap #1); harness weld tolerance stated per-row, default labkit 1e-4.
- **Assembly (G7).** Phase 1 integrates at the existing seam: the region layer builds the OUTER
  WALL (replacing `buildConformingOuterWall` for the style under test, behind a dev flag);
  inner wall/rim/base/cap/weld remain `WatertightAssembly` unchanged. Full-pot G7 gates run on the
  assembled result for DS/Gyroid/control. Gothic runs patch scope with G7 explicitly N/A-deferred
  (gothic-spec §5 recommendation; the cdt2d u-seam-share design remains Phase-3 scope). The
  region-tag propagation question (gates-spec gap #8) starts with the required read of
  `assembleWatertight` before Phase-1 coding.

## 4. Manifest v1 (minimal, code)

`StyleManifest` exists only as a markdown sketch (zero implementations — gates-spec G6). Phase 1
implements the minimal consumable:

```ts
interface StyleManifest {
  styleId: StyleId;
  truth: { rA: (theta, z) => number; bridgeClass: 'exact'|'hash-int'|'KNOWN-BROKEN' };
  anatomy: (params, dims) => FeatureAnatomy;        // regions+curves+pins (§2)
  ruler: 'radial-newton' | 'ds-composite-v11g' | 'k2-interior';  // per-style verdict instrument
  budget: { maxOuterTris: number; maxFullTris: number };          // measured, per PROD-BATCH
  gates: { g7scope: 'full-pot' | 'patch-NA' };
}
```
Known-broken truth bridges surface as `truthBridgeOk:false` rows (SuperformulaBlossom missing
strength field `types.ts:548`; WaveInterference CPU↔GPU divergence) — never silently scored.

## 5. Phase-1 arm plan (E-2026-07-11-TIERC-HEADTOHEAD)

Four arms, one region layer. Kill rules are the specs' own, cited not re-derived. Full prereg
committed before any scored run; heavy runs wait for the PROD-BATCH drain to release the machine.

- **Arm D — smooth control (FourierBloom, SHIPPED-CLEAN class).** One R-CDT region, zero curves,
  zero pins, standard assembly. PASS = all gates green at tol, tri count within ±5% of production,
  no quality regression. Runs FIRST — it validates the orchestration layer's null case before any
  champion mechanism is in play.
- **Arm A — Gyroid.** A1: manifest anatomy provider feeds doubled band-edge contours through the
  region layer; reproduce gyroid-spec §5.4 checklist (28,785 pts ±, outer 2,242,987 ±5%, stratified
  ~31,114 ±15%, Newton-worst 0.024917, 100% knee-adjacent, coverage max 0.0253 ±10%). A2: 2-locus
  fan fix → nonManRawBig 0 (G4). A3: S-RESIDUAL pins-at-scale — its own sub-prereg; primary design
  = analytic knee pre-seed (single-pass; untested) with worst-sag-recovery as fallback; report
  literal (not stratified) before/after; explicit kill if the population proves to be an edge-class
  (contour-length-distributed) rather than point-class — that outcome redirects to a chord-ladder
  lever, priced separately (gyroid-spec §4.1 fork).
- **Arm B — DragonScales.** B0: boundary-contract toy (one ring, contracts (a)/(b)/(c) of §2) —
  gate: watertight non-vacuous, zero T-junctions, riser serration ≤0.001mm on the embedded chain.
  B1: full outer wall (7 R-STRUCT ring bands + 8 R-CDT body bands) + standard assembly; targets
  ds-spec T1 (ring-band ≤3,300+≤100 tail, max ≤0.05, rate ≤1.0%, wall-coverage-over ≤10%), T4
  (outer ≤4,549,600 and ring-local density measurably DOWN), T5 (nonMan 0, zeroArea 0, %<20°<10%);
  report T2/T3/T6/T7 regardless. **DS "reproduced" = T1∧T4∧T5** (ds-spec kill rule). The 0.0461
  sheet cliff floor is REPORTED as the known frontier, not silently inherited or claimed closed.
- **Arm C — Gothic.** C1: patch scope through the region layer dispatching to K2; reproduce the
  CI gate exactly (u∈[0,0.125], t∈[0.48,0.52], bgArc 0.6, nTheta 512): outliers 0, max ≤0.0101,
  watertight non-vacuous, ≤9,917 tris / ≤7 passes to match; PLUS the quality report the current
  suite omits (`triangleQualityDistribution`, needleCount) — closing gothic-spec gap #1's
  reporting hole is in-scope. C2 (recommended): 2-bay research build literal-0 at ≤30,323 tris
  with %<20° reported against the banked 19.0%/minAngle-0° concession. The 0.117 production-band
  frontier is NAMED as Phase-3-adjacent stretch (requires un-wired `flankBand.ts` + seam-share),
  not a Phase-1 target.

**Phase-1 decision rule (charter, applied):** architecture PROVEN iff A1∧A2 pass + B1 passes
T1∧T4∧T5 + C1 matches the gate + D is clean — all under S-GATES with non-vacuity witnesses green.
Any failure → mechanism-level diagnosis naming the failed contract/kernel/service; iterate or KILL
that arm with the named mechanism. No silent scope-shrink: G2 coverage is measured for ALL arms
(never attempted on Gothic champions before — gothic-spec gap #5 closes here by construction).

## 6. Build list (ranked; S/M/L)

1. [S] labkit `zeroAreaCount` promotion (1e-12) + `needleCount` field + non-vacuity tests.
2. [M] S-GATES composite entry (`gatesHarness` over the _prod_truth composition; row schema per
   gates-spec §3.3) + first benchmark at ~3M-tri reference scale.
3. [M] Manifest v1 (4 styles: control, Gyroid, DS, Gothic) + anatomy providers (Gyroid's wraps
   `_gyroidContourLib` extraction verbatim; DS's wraps `dragonRings`+row schedule; Gothic's wraps
   K2's detect/condition path).
4. [M] Region layer core: RegionPlan/ChainSpec types, dispatch, outer-wall integration seam behind
   a dev flag (default OFF, byte-identical-off proven by the existing rebaseline pattern).
5. [M] B0 boundary-contract toy (the DS risk retirement).
6. [M] K1 2-locus fan fix (A2) — force-refine multi-curve cells or fan post-pass, TDD on the two
   banked deterministic loci.
7. [L] S-RESIDUAL pin plumbing (AssemblyWallOptions→…→FeatureConformingTriangulator) + A3 arm.
8. [M] DS B1 + Gyroid A1 + Gothic C1/C2 + control D runs (mostly harness time, machine-gated).
9. [Deferred to Phase 2/3, named] universal partitioner generality; parameter-envelope sweeps
   (birth/death — zero evidence exists for ANY champion; all specs §4); needle-quality ELEMENT
   research (13 levers refuted; flat-P1 cannot close both fidelity and angle at a zero-width cusp);
   seam-share (cdt2d [0,1]); flankBand production port; W/SFB truth-bridge fixes; memory
   instrumentation (gates-spec gap #4); region-tag propagation through assembly (gap #8).

## 7. Decisions log

| # | decision | basis |
|---|---|---|
| A1 | Orchestration layer over K1/K2/K3, not a new kernel | §1 three-kernel finding |
| A2 | DS boundary contract = pre-registered toy arm B0 before full style | ds-spec §4.2; historic T-junction class |
| A3 | Metrology = research stack for G1/G2 | gates-spec #11; K2 ruler throws on warps |
| A4 | zeroArea 1e-12 canonical; weld tol stated per-row | gates-spec G4 |
| A5 | Gothic Phase-1 scope = patch (+2-bay quality report); 0.117 band = Phase-3 stretch | gothic-spec §5 |
| A6 | DS body regions stay on K1 adaptive; only ring bands are R-STRUCT | ds-spec §4.7 measured comparison |
| A7 | Gyroid integration via manifest anatomy provider, not in-place extractor edit | gyroid-spec §4.3 option (b); Phase 1 proves the architecture |
| A8 | Pins A3 primary design = analytic pre-seed, fallback worst-sag recovery; edge-class outcome pre-named as redirect | gyroid-spec §2.4/§4.1 |
| A9 | Control arm runs first | null-case validation before champion mechanisms |
| A10 | Breadcrumb cadence 30s (the proven number, not the charter's ≤60s paraphrase) | gates-spec §3.5 |

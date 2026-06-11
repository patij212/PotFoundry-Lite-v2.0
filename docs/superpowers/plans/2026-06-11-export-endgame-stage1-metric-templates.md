# Export Endgame — Stage 1: Klincsek DP Templates + Warp-Composed Pullback Metric

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. READ FIRST: `docs/superpowers/specs/2026-06-10-export-metric-meshing-endgame-design.md` (§5 Stage 1), `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-source-extraction.md` (verbatim source + 11 load-bearing facts), `stage0-residuals.md` (gate inputs).

**Goal:** Activate metric-aware triangulation: populate `leaf.efg` from a WARP-COMPOSED pullback sampler (never plain — facts #5/#6), replace the greedy `earClipMaxMinAngle` with a certified Klincsek max-min-angle DP, and mirror the shaped templates into the CDT path's plain branch — measured against the UNDECIMATED crest-band angle tail (the decimator fix `e01086a` already owns slivers).

**Architecture:** One new module (`PullbackMetric.ts`) + surgical edits at the verified seams: PBQ `leaves()` (fact #8), the two earClip call sites + plain-quad diagonal (facts #1/#2), FCT plain branch (fact #10), threading via `ConformingWallOptions`/`AssemblyWallOptions` (fact #7). Runtime metric = finite differences on the composed sampler with PLAIN-sampler grid steps (the proven `classifyCellCeiling` pattern from c206623); closed-form Jacobians live in the TESTS as pins. This is re-baseline epoch 1: B>0 styles change bytes (re-measure + re-archive); B=0 styles must be byte-identical OR every diff enumerated via the provenance channel's EAR_CLIP counts.

**Tech stack:** TypeScript, Vitest, the Stage-0 instruments (`_debugMeshHash`, `diagnoseCrestQuality`, `diagnoseSliverAttribution`, `diagnoseSeamBands`, `diagnoseCellCeiling`), headed-Chromium probes (foreground only, `PF_BASE_URL` explicit).

**Pre-registered Stage-1 gate (write results into stage0-residuals.md §Stage-1):**
- UNDECIMATED band sub-15° (ε=0.5pp), per the residuals table: ≥50% relative reduction on every style currently ≥5% (DragonScales 13.5, BasketWeave 13.3, ArtDeco 12.5, Voronoi 7.6, Crystalline 6.6, Gyroid 6.5, GeometricStar 6.2, CelticKnot 5.2, CelticTriquetra 5.0, FourierBloom 5.0) AND no style worsens by >ε. SpiralRidges band 2.4→≤1.0 and capTop 5.6→≤2.0 (`diagnoseSeamBands` at natural count). Record-and-route residuals to Stage 2/4 if a style misses — the gate FAILS only on regression or on zero aggregate improvement.
- Topo zeros maintained 20/20 (default dims, undecimated); featDrop=0; `diagnoseCdtHealth` inversions/drops still 0.
- B=0 styles byte-identical (hash baseline) OR every diff enumerated: changed style must show EAR_CLIP/FCT_EAR_CLIP provenance counts > 0 with `shapedTemplate` having fired on >2:1-aspect cells only.
- Build wall-clock ≤ +10% vs `authoritative-2026-06.json` default rows. Decoupled chord error within ±0.005mm per style (the DP drops transition-cell centroids — a real sampling change).
- Suite green (352+), typecheck, eslint. Full re-measure ONCE at epoch close; hashes re-archived.

---

### Task 1: PullbackMetric module (composed sampler + derivative accessors + closed-form pins)

**Files:** Create `parametric/conforming/PullbackMetric.ts`, `PullbackMetric.test.ts`.

- [ ] **Step 1 — failing tests.** Cases: (a) `uWarpDerivative`/`tWarpDerivative` return the containing segment slope of the piecewise-linear warp (build a 2-anchor UWarp by hand; assert slopes left/inside/right of anchors; identity → 1 everywhere); (b) `composedOuterSampler` equals plain sampler when all warps identity (positions bit-equal, `gridResolution` forwarded); (c) **closed-form pin**: on `SyntheticCylinderSampler(50,120)` with a synthetic pure-shear helix (`shearRate=s`), FD `firstFundamentalForm(composed, u, t, hu, ht)` matches the closed form `E'=E, F'=−s·E, G'=G+s²E` within 1%; same for a 2-anchor u-warp (`E'=E·φ′²` inside each segment, evaluated at cell centers AWAY from kinks) and a t-warp (`G'=G·ψ′²`, walls); (d) **kink-dyadicity assertion**: every anchor source of a `chooseCreaseGrid`/`chooseCreaseTGrid` result is an exact multiple of 1/2^level (fact #5 — pins the "kinks on cell boundaries" premise).
- [ ] **Step 2 — implement.** `composedOuterSampler(plain, {uWarp, tWarp, helix}): SurfaceSampler` mirroring the application guards EXACTLY (fact #6): `tEff = tWarp ? applyTWarp(tWarp, t) : t`; `uEff = applyUWarp(uWarp, u)` (all surfaces); `uFinal = (helix non-identity && uWarp identity) ? applyHelixWarp(helix, uEff, tEff) : uEff`; `position(u,t) = plain.position(uFinal, tEff)`; forward `gridResolution()` from plain (fact #8 — prevents the DEFAULT_H fallback). Plus the two derivative accessors (segment-slope lookup, periodic for u). Doc comments state the guard map verbatim and why FD-on-composed (not closed-form) is the runtime mechanism.
- [ ] **Step 3 — gates + commit** (`feat(stage1): PullbackMetric — warp-composed sampler + derivative pins`).

### Task 2: efg population in `leaves()` + per-wall metric threading

**Files:** Modify `PeriodicBalancedQuadtree.ts` (retain an `efgSampler`; populate `leaf.efg` in `leaves()` ONLY — never `leafOfCell`, fact #8), `ConformingWall.ts` (`ConformingWallOptions.efgSampler?: SurfaceSampler` → `buildQuadtreeAtScale` → PBQ opts), `WatertightAssembly.ts` (`AssemblyWallOptions.outerEfgSampler?/innerEfgSampler?` → the two `buildConformingWall` call sites, fact #7), `ParametricExportComputer.ts` (build the composed sampler from `creaseChoice.warp`/`creaseTChoice.warp`/`helixChoice.warp` + the PLAIN outer/inner samplers; pass through; gated by `__pfConformingEfg` global, **default ON**), `PeriodicBalancedQuadtree.test.ts`.

- [ ] **Step 1 — failing test:** a PBQ built with an `efgSampler` yields `leaves()` where every leaf carries `efg` with `E≈(2πR)², F≈0, G≈H²` for the plain cylinder (cell-center FD, plain steps); WITHOUT `efgSampler`, leaves carry NO efg (byte-identical legacy — the existing isotropic test in `QuadtreeTriangulator.test.ts` keeps guarding the downstream).
- [ ] **Step 2 — implement.** PBQ: store `opts.efgSampler`; in `leaves()` compute `firstFundamentalForm(efgSampler, uc, tc, this.steps.hu, this.steps.ht)` per leaf (lazy, once per leaves() call). CRITICAL: sizing/refinement keep using the PLAIN `metric` arg — only `leaves()` reads `efgSampler` (spec: sizing stays plain). PEC: compose via Task 1 for the OUTER wall (all three warps) and INNER wall (u-warp + helix per its surfaceId<1.5 t semantics — inner wall IS sheared by its own t per the helix loop; t-warp applies to walls; verify against fact #6 and the actual loops at ~:2509-2560).
- [ ] **Step 3 — gates + 3-style hash spot-check.** At this point shaped templates FIRE wherever `uBias>0` or aspect>gate (fact #1) — B>0 styles change bytes (expected, epoch). B=0 styles: verify SuperformulaBlossom (B=1 at default… check `computeUBias` — most default styles have B≥1 now, so byte-identity holds only for true B=0 + isotropic styles; rely on the enumeration clause: `diagnoseSliverAttribution` byTag EAR_CLIP>0 explains diffs). Run the undecimated band table for 3 worst styles (DragonScales/BasketWeave/ArtDeco via `diagnoseCrestQuality` with `targetTriangles` at natural count) — record before/after. Commit (`feat(stage1): warp-composed efg population + per-wall threading`).

### Task 3: Klincsek max-min-angle DP (replaces the greedy ear loop)

**Files:** Modify `QuadtreeTriangulator.ts` (new `maxMinAngleTriangulation(efg, poly, idx, emit)`; both call sites — singleMid ~:528 and N-mid ~:556 — switch to it; greedy `earClipMaxMinAngle` DELETED, not kept as dead code), `QuadtreeTriangulator.test.ts`.

- [ ] **Step 1 — failing property tests** (extend the existing efg fixtures, fact #9): (a) certified completeness — for randomized convex transition polygons (rectangle + 0..4 mids, k≤12, including COLLINEAR corner-mid-corner runs and a fully-collinear side) × metrics (isotropic, 16:1 anisotropic, sheared F≠0): exactly k−2 triangles, every boundary sub-edge covered exactly once, all CCW in (u,t), zero zero-area emissions — ~2·10⁴ randomized cases (seeded PRNG, no Date/Math.random in workflow contexts — use a fixed-seed LCG); (b) optimality ≥ greedy: DP min-angle ≥ the old greedy's on a corpus of sheared cases (port the old greedy into the TEST file as the comparison oracle); (c) the existing isotropic byte-identity test still passes (DP only fires under the same `shapedTemplate` gate).
- [ ] **Step 2 — implement.** Interval DP over the CCW polygon (Klincsek): `best[i][j] = max over k in (i,j) of min(tri(i,k,j) score, best[i][k], best[k][j])`, score = `triMinAngle3D(efg, …)` with zero-(u,t)-area triangles scored −∞; reconstruct and emit. O(n³) at n≤12 is ≤1.7k triangle evaluations/cell — bound stated in the doc comment. Atomicity: emit only after full reconstruction (all-or-nothing; no partial fans).
- [ ] **Step 3 — gates + commit** (`feat(stage1): Klincsek max-min-angle DP replaces greedy ear-clip (certified coverage)`).

### Task 4: FCT plain-branch mirror (CDT styles' plain cells get the same templates)

**Files:** Modify `FeatureConformingTriangulator.ts` (plain branch :703-724: when `shapedTemplate(leaf.efg, du, dt, uBias)` — import the gate + DP from QuadtreeTriangulator (export them) — use shorter-3D-diagonal for 0-split and the DP for transitions; new `TRI_SOURCE.FCT_EAR_CLIP = 7` tag; sub-flag `__pfConformingShapedCdtCells`, default ON), `QuadtreeTriangulator.ts` (export `shapedTemplate`/`metricLen2`/DP + add tag 7), `featureQualityHarness.test.ts`.

- [ ] **Step 1 — failing test:** the harness's sheared-cylinder feature build with efg-tagged leaves shows `FCT_EAR_CLIP` provenance counts > 0 and a strictly better `pctBelow20` than the untagged build; untagged build byte-identical to pre-change (existing provenance partition tests keep passing with the new tag).
- [ ] **Step 2 — implement + gates + commit** (`feat(stage1): shaped templates mirrored into the CDT plain branch`).

### Task 5: Epoch re-measure + re-baseline + gate verdict

- [ ] **Step 1:** Full 20-style undecimated band table (extend `_baseline_matrix.cjs` invocation with a natural-count target or per-style `PF_TARGET` above natural counts) + `diagnoseSeamBands` (SpiralRidges capTop) + `diagnoseTopoQuality` + featDrop + buildMs + `_debugMeshHash`. Compare against the residuals-doc table per the pre-registered gate above.
- [ ] **Step 2:** TRIS_PER_LEAF=2 budget-calibration re-check (the DP drops transition centroids → fewer tris/leaf; `ConformingWall.ts:181` constant may need re-deriving — measure leaf:triangle ratios before changing anything).
- [ ] **Step 3:** Re-archive `mesh-hashes-default-2026-06.json` (full diff first: every changed style must be explained by EAR_CLIP counts or B>0); append the Stage-1 results section to `stage0-residuals.md`; update the memory file. Commit (`test(stage1): epoch-1 re-measure + re-baseline + gate verdict`).
- [ ] **Step 4:** If the gate verdict leaves ≥5% band residuals anywhere, they route to the Stage-4 escalation ladder (registration-time snap → frozen-metric flips → metric-true Steiners) — do NOT improvise fixes inside this epoch.

## Risks (from the spec, sharpened by extraction)

1. FD-at-kink smearing: cell centers are half-a-cell off the dyadic kinks (fact #5 pin) — but `creaseRefine` cells can be deep; if a deep cell's FD stencil (plain-sampler steps ~1/256) spans a kink, the metric blurs locally. Acceptable (diagonal choice degrades gracefully); the band gate catches real damage.
2. The helix+inner-wall composition semantics (Task 2 Step 2) must be read from the actual loops, not assumed — the inner wall's t differs from outer t in z-mapping.
3. The `shapedTemplate` gate fires on ALL B>0 cells — at default dims most styles have B≥1 post-GATE-B, so this epoch re-baselines nearly everything; the enumeration clause + epoch protocol is the containment.
4. DP cost at deep feature trees: n≤12 polygons ⇒ negligible; assert no polygon exceeds n=16 (defensive throw with cell coords).

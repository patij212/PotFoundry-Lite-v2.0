# Surface-Fidelity Export — Session Handoff (2026-06-13)

A long measurement-and-implementation session. Everything below is **flag-gated
(`surfaceFidelityExact`, default OFF) — zero default-behavior change shipped.**

## What shipped (flag-gated, e2e-validated on real GPU)

| Style | Fix | Status |
|---|---|---|
| **SuperformulaBlossom** | born petals (un-defer) + feature-proximity density | e2e: features 12→19, ~2.1× tris, watertight. Wall p99 0.037 below tol. |
| **ArtDeco** | paired-ring t-step riser (C0 jump) + density | e2e: features 0→16, watertight (bnd=0). Wall (riser bands excl) 0.158mm / p99 0.008. |

Both validated end-to-end via `e2e/_fidelity_flag_validate.cjs` (headed Chromium,
real WebGPU adapter confirmed available here).

## Cross-style B5 baseline (2026-06-14, commit `ba886bd`)

The B5 gate was generalized from 2 styles to all 20 (`e2e/_fidelity_surface_sweep.cjs`,
flag ON, 1M tris, real GPU). **Audit-first partition (measured):**

| Bucket | Styles | Meaning |
|---|---|---|
| **CERTIFIED (6)** | FourierBloom, SpiralRidges, SuperellipseMorph, HarmonicRipple, ArtDeco, RippleInterference | on the true surface AND slicer-clean (chord < 0.3mm) |
| **PARTIAL (4)** | SuperformulaBlossom 0.87, GothicArches 1.46, BambooSegments 2.46, GeometricStar 1.03 | vertices on-surface (ref trusted), **real chord/density gap** — the genuine fidelity TODO |
| **REF-UNTRUSTED (10)** | LowPolyFacet 16.16, WaveInterference 1.19, Crystalline 45.35, DragonScales 8.91, Gyroid 1.50, Voronoi 0.67, BasketWeave 2.00, HexagonalHive 2.00, CelticKnot 2.60, CelticTriquetra 0.14 | `styles.ts` ↔ WGSL **reference drift**, NOT a mesh defect |

**The REF-UNTRUSTED 10 are NOT defects.** The conforming export GPU-evaluates every
vertex EXACTLY at its (u,t) from the WGSL shader (which renders correctly), so a
faithful CPU reference reads vertexMax ≈ f32 floor (≤0.0011mm on the 11 parity-clean
styles). Gyroid/Basket/Hex land EXACTLY on their full relief default (`gmRelief 1.5`,
`bwDepth 2.0`, `hhRelief 2.0`) and Crystalline reads 45mm — impossible as a placement
defect. It is the SFB "BLOCKING-2" trap generalized: `src/geometry/styles.ts`
STYLE_FUNCTIONS (the codebase's own "export-only, may be deprecated" CPU port) has
drifted from the shaders for these 10. The GPU-grid `wallDeviation` oracle can't
adjudicate — it reads 31–63mm on the *clean* CERTIFIED controls (drain/cap radial-bin
artifact); the relief-default match adjudicates (`e2e/_fidelity_surface_confirm.cjs`).

**Honest-refusal mechanism shipped:** `diagnoseSurfaceFidelity` now returns
`referenceTrusted` (`vertexMaxMm ≤ REFERENCE_PARITY_EPS_MM = 0.05`). A naive B5-gate
export refusal trigger (item 2c) would have FALSELY refused these 10 good styles; it
must consult `referenceTrusted` (or use a GPU-truth reference). To B5-certify the 10,
either parity-fix `styles.ts` against the WGSL, or give the gate a GPU-eval reference
(generalize SFB's packed path to a per-(θ,z) GPU sample).

## GPU-truth reference fallback — "trust all 20" (2026-06-14, commit `85cbe7f`)

Chose the GPU-eval reference (lower risk than parity-fixing the deprecated `styles.ts`,
generalizes uniformly). `diagnoseSurfaceFidelity` gained `referenceSource`
`'analytic'|'gpu'|'auto'` (default `'auto'`): keep the EXACT analytic reference where it
is trusted (better on sharp crests), fall back to the **decoupled GPU outer-wall grid**
(`__pfReferenceDenseRes` + bicubic + the tested `sampleTrueRadius` Newton (θ,z)→(u,t)
inversion) where the analytic drifted. `referenceMode` echoes `'gpu-grid'`+`referenceRes`;
`referenceTrusted` is uniform (vertexMax≤eps on whichever ref was used).

**The drift FAILs collapse under GPU truth** (real GPU, sweep + `_fidelity_gpuref_check.cjs`):
WaveInterference 1.19→**CERTIFIED** (vtx 0.0003); Crystalline 45→0.43, LowPoly 16→0.11(@512),
DragonScales 8.9→1.55, Gyroid 1.5→1.23, Voronoi 0.67→0.40, HexHive 2.0→0.075, CelticKnot
2.6→0.78. Confirms the meshes are GPU-faithful; the big numbers were pure reference drift.

**⚠ KEY band-limit finding (refRes test, LowPolyFacet 512→1024):** a band-limited grid
reference does TWO things — it INFLATES vertexMax (smoothed ref vs sharp mesh vertex) AND
**UNDER-STATES the chord** (a smoothed ref sits closer to a flat facet than the true sharp
surface). LowPolyFacet@512 read chord 0.115 (untrusted, vtx 0.068); @1024 vtx dropped to
0.034 (**trusted**) and the TRUE chord surfaced at **0.577** (a real density gap 512 HID).
⇒ **trust the chord ONLY where `referenceTrusted=true`**; for a drift style that means
raising `__pfReferenceDenseRes` until the reference resolves it. `referenceTrusted`
correctly gated this (it read false at 512). Sharp styles may need refRes ≥1024–2048, or
the analytic parity-fix (exact, no band-limit) — the better long-term path for them.

**COMPLETE "trust all 20" partition (best reference per style — analytic where trusted,
else gpu-grid@512/1024):** 15 of 20 now have a TRUSTWORTHY verdict.

| Bucket | Styles | Evidence |
|---|---|---|
| **CERTIFIED (8)** — on true surface + slicer-clean | FourierBloom, SpiralRidges, SuperellipseMorph, HarmonicRipple, WaveInterference, ArtDeco, RippleInterference, **HexagonalHive** | vtx ≈ f32 floor (Hive 0.006@1024), chord < 0.3 |
| **Band-limit / body-clean (2)** — p99 < tol, residual vtx = sharp-edge band-limit (certify at higher refRes) | Voronoi (p99 0.11, vtx 0.18→0.08), Crystalline (p99 0.072, vtx 0.43→0.20) | vtx DROPS with refRes; body below tol |
| **PARTIAL — real chord gap, TRUSTED ref (5)** | SuperformulaBlossom 0.87 (seam), GothicArches 1.46, BambooSegments 2.46, GeometricStar 1.03, LowPolyFacet 0.58 | analytic-exact (4) / gpu@1024 trusted (LowPoly vtx 0.034) |
| **GPU-grid UNRESOLVED (5)** — referenceTrusted=false AND refRes-STABLE (grid can't pin them) | DragonScales (vtx 1.52→1.52, p99 1.29), BasketWeave (1.88, p99 1.45), GyroidManifold (0.63, p99 0.58), CelticKnot (0.65, p99 0.35), CelticTriquetra (1.12, p99 0.25) | refRes 512→1024 barely moves vtx |

**The refRes test is the band-limit/real discriminator:** vtx DROPS with refRes ⇒ band-limit
(mesh fine — HexHive, Voronoi, Crystalline, LowPoly); vtx STABLE ⇒ the grid genuinely can't
represent the style's sharp/fine surface (DragonScales' total invariance is the canary).
**⇒ the last 5 want the ANALYTIC parity-fix (exact, no band-limit), not a finer grid** —
this is where the GPU-grid reference approach hits its limit. (Whether their residual is a
real mesh gap or a grid-vs-mesh inconsistency is unresolved BY the grid; the analytic ref
would settle it.) Probes: `_fidelity_surface_sweep.cjs` (PF_REF_RES, PF_STYLES, PF_DENSE_N,
PF_DIAG_TIMEOUT), `_fidelity_gpuref_check.cjs`. Logs: 512 main sweep + 1024 pass on the 8.

## ANALYTIC PARITY-FIX — done, GPU-verified (2026-06-14, commit `f6ae121`)

The analytic parity-fix (chosen over a finer grid for the unresolved styles) found TWO root
causes — and the GPU verify overturned 2 of the 4 sub-agent inspection-fixes:

- **METRIC theta-recovery bug (the dominant one, `analyticSurfaceGate`):** the B5 metric
  recovered `theta = atan2 ∈ [−π,π]` but the shader places vertices with `theta ∈ [0,TAU)`.
  Styles with theta-SIGN-dependent integer logic (cell parity / column id) sampled the WRONG
  cell on the back half. Wrapping theta to `[0,TAU)` (now unconditional; a no-op on periodic
  styles) FIXED **DragonScales 8.91→0.0001** and **Crystalline →0.0002**, and dropped
  **CelticKnot 2.6→0.42**. The proposed DragonScales "missing clamp" fix was a RED HERRING —
  GPU-verify caught it (vtx unchanged at 8.91 until the wrap).
- **`styles.ts` CPU-port parity (per style):** GyroidManifold lattice mask (ramp-out→ramp-in
  smoothstep) **1.5→0.0004**; CelticTriquetra rim lines (linear→smoothstep) **1.26→0.0001**;
  CelticKnot checkerboard→3-strand braid+Z-buffer rewrite **2.6→0.42** (structurally correct,
  small residual); DragonScales clamp (parity-correct, not load-bearing). Golden fixtures
  regenerated (legacy export + fixtures are the only consumers; production conforming uses
  GpuRidgeSolver/WGSL — detect_changes LOW/0-processes).

**FINAL full-20 partition (commit f6ae121, no regression):** **15/20 EXACT analytic-trusted**
(vtx ≈ f32 floor): 7 CERTIFIED + 8 PARTIAL (SFB 0.84, Gothic 1.45, **Crystalline 0.56**,
**DragonScales 1.57**, Bamboo 2.15, **Gyroid 1.29**, GeoStar 0.98, **CelticTriquetra 1.50**).
3 band-limit-clean (LowPoly/Voronoi/HexHive — nAbove≈0, certify at refRes≥1024). **2 genuine
holdouts: CelticKnot (0.42 — residual braid-port diff, re-diff the weave_density/phase) and
BasketWeave (1.89 — see below).** The actionable export-fidelity list (real chord gaps,
trusted) is now the 8 PARTIALs.

## BasketWeave holdout — ROOT-CAUSED, it is a METRIC discontinuity artifact (2026-06-14, commit `31d2a4d`)

Investigated with `_debugRadialBreakdown` + `e2e/_fidelity_basketweave_probe.cjs` (per
outer-wall vertex: placed radius vs analytic ref at the RECOVERED (atan2,z/H) AND the EXACT
stash (u,t)). Findings (default config — flag on/off identical):
- devRec=2.0 (full bwDepth) but devExact=0.2–0.4 → the placed radius matches the surface at
  the vertex's stash t; only the z/H-recovered eval is full-depth off.
- Δθ=0 (u exact); the worst vertices' `u·strands` = 13,9,1,3,14,10 — ALL INTEGERS = the
  vertical strand-edge creases (`u_twisted∈ℤ`) that CreaseUWarp pins columns onto.
- BasketWeave-specific: Gyroid (no crease-warp) has Δz=0, devRec=devExact≈0.0003.

**ROOT CAUSE: the conforming warp pins vertices EXACTLY onto the weave's over/under
discontinuities (strand edges). There `checker=(floor(u_twisted)+floor(v))%2` is ill-defined;
the GPU (f32) and the CPU reference (f64) round `floor(u_twisted)` to OPPOSITE sides, flipping
the over/under strand → a false full-depth deviation. The mesh vertex is genuinely ON the
surface (one valid side); the reference disagrees. ⇒ NOT a mesh defect — it is the
vertical-crease analog of the u-seam cliff the metric ALREADY excludes.** BasketWeave's TRUE
fidelity is the mid-cell ~0.2–0.4mm (so it really belongs in the trusted-PARTIAL bucket).

**FIX (follow-up, metric-only):** in `radialAnalyticDeviation`, exclude the warp-pinned
crease loci — strand edges `u=(m−phase)/strands` (m=0..strands−1) and layer rings
`t=k/layers` (k=1..layers−1) — with a thin band, exactly as `seamExclU`/`tBands` already do.
That reclassifies BasketWeave from "holdout" to clean (~0.3). The same crease-exclusion may
also help any other warp-pinned style measured at a discontinuity.

## The validated model (use this to classify any style)

- **C0 radius jump** (discontinuity, e.g. ArtDeco step) → **paired-ring riser**:
  two horizontal lines at `t_step ± ε` (ε≈1e-3); the band between IS the vertical
  face (excluded from the `r(u,t)` fidelity metric, like the seam). ε too small
  (3e-4) welds/leaks. A single edge REGRESSES (can't represent a vertical face).
- **C1 crease** (tangent discontinuity, e.g. SFB crests) → **single edge** (insert
  the locus).
- **Smooth** (Gaussian/sin/poly, e.g. BambooSegments nodes, the 5 smooth styles) →
  **density** (no edges).
- **Density lever is only safe with COMPLETE extraction** — partial extraction +
  density REGRESSES (proved on ArtDeco t-step-only).
- Vertex positions are ALREADY exact GPU eval (no "exact-eval" work needed).

## The recipe in code (production, flag-gated)

- Flag: `surfaceFidelityExact` in `PipelineFeatureFlags` (`parametric/contracts.ts`,
  default false) + the `__pfSurfaceFidelityExact` e2e hatch in `resolveFeatureFlags`.
- `ParametricExportComputer.compute` conforming branch (`:~2442, :~2612, :~2764`):
  passes `{ surfaceFidelityExact: flags.surfaceFidelityExact }` to
  `extractAnalyticFeatures`, and sets `featureLevel: flag ? 11 : 7` (the density lever).
- `FeatureLineGraph.extractSuperformulaBlossom` (born petals, `SF_CREST_BORN_MIN_SPAN`)
  and `extractArtDeco` (paired-ring risers, `AD_RISER_HALF_T=1e-3`), gated by
  `ExtractOpts.surfaceFidelityExact` (?? per-style `__pfSfbBornCrests`/`__pfArtDecoSteps`
  dev levers for probes).
- `fidelity/fidelityGate.ts` — the shared gate: `deviationVsTrueSurface(mesh, surface,
  opts)` (config-aware truth, seam + `tBands` riser exclusion), `countFoldedTriangles`,
  `straddleStats`, `minVertexSpacing3D`.

## Open items (prioritized, with entry points)

1. **B5 — absolute-fidelity gate — ✅ DONE (commit 4feb9af, GPU-certified).**
   `windowHook.diagnoseSurfaceFidelity` + `analyticSurfaceGate.radialAnalyticDeviation`
   map the 3D exported mesh back (`theta=atan2(y,x)`, z direct) → `|hypot(x,y) −
   r_analytic|` vs the analytic surface (seam + riser excluded via the pre-existing
   `LAST_CONFORMING_ASSEMBLY_UT` stash). CPU-proven (`verify_b5_analyticMetric`, 5/5)
   and real-GPU-certified (`e2e/_fidelity_surface_validate.cjs`): SFB vertices exact
   (~f32 floor), chordMax 1.93→0.87mm (flag improves); ArtDeco wall 0.1175mm. Spec:
   `2026-06-13-b5-absolute-fidelity-gate.md`.
   **NEW residual it surfaced:** SFB absolute chord **0.87mm ON is still >tol** (born
   petals+density don't fully close at the 1M target → density/budget, item 2). And
   the **STL-bytes round-trip** (re-weld 0.001mm + f32 quantize) is a separate
   follow-up gate (the B5 number is in-memory GPU-f32).
2. **Budget honesty (Task 9) — PARTIALLY DONE + premise corrected (commit 4b6baef).**
   MEASURED (`e2e/_fidelity_density_sweep.cjs`, B5 chord): SFB@1 across featL11/1.6M →
   featL13-maxL14/5.7M — chordMax **STUCK at 0.873mm (irreducible)**; p99 **0.072 →
   0.015** (below tol); >tol frac 4.1% → 0.17%. ⇒ Task-9 budget does **NOT** close
   SFB's 0.873mm (a localized born-crest seam-transition STRADDLE; the 6M cap isn't
   even binding, 5.7M<6M). Density **does** close the pervasive residual.
   - DONE (safe, for capScale>1 *feature-dense* styles): `effectiveMaxSagMm`
     telemetry `capScale·` → `capScale²·qMaxSag` (sag∝edge²); ExportPanel surfaces
     cap-coarsening (`capScale>1`) as a passive fidelity notice (was silent).
   - STILL OPEN: (a) **the 0.873mm born-crest seam-clip straddle** —
     `clipFeaturesToBox` (`ConformingWall`, uMargin≈0.0117) strips the born crest at
     u>0.988 so its seam-end isn't an edge → spanning triangle; fix = extend born
     crests to the seam (watertightness-delicate — the born-crest test proved naive
     seam insertion watertight) OR accept as the out-of-scope seam zone (u>0.95). (b)
     **per-style density-to-tol** (the pervasive residual closes at featL13/maxL14,
     but "density only safe with COMPLETE extraction" — NOT a global featL bump; ArtDeco/
     partials would regress). (c) **B5-gate-driven export fidelity report** (run
     `diagnoseSurfaceFidelity` post-export → honest "tol met / not met" on the result,
     replacing the analytic-sag estimate — red-team's preferred refusal trigger). (d)
     decimation acceptance re-gated on the B5 fidelity, not triangle-quality deltas.
   Entry: `ConformingWall.searchBudgetScale`, `ParametricExportComputer :~2620/:2823`,
   `FeatureLineGraph.clipFeaturesToBox`, `windowHook.diagnoseSurfaceFidelity`.
   **(c) UPDATE (2026-06-14):** the gate now exposes `referenceTrusted` (the honest
   "can I judge this?" signal). The remaining (c) work is wiring it into the export:
   run `diagnoseSurfaceFidelity` post-export → report tol-met/not, but ONLY when
   `referenceTrusted` (else the gate is blind for that style). The 4 genuine PARTIAL
   styles are where (b) per-style density-to-tol actually applies.
3. **BambooSegments rim-node density** (smooth, NOT a riser): the worst (2.256mm) is
   the t=1 rim node bulge — `extractBambooSegments` stops at k=nodeCount-1 and the
   density lever only refines inserted rings. Needs boundary-aware sizing / exact
   curvature at t=1. Probe: `verify_bambooSegments.test.ts`.
4. **ArtDeco chevron** (`R5`, 0.34mm |sin| diagonal C0 corners) — density or a
   diagonal general-curve extractor; fan negligible (0.006mm). Spec:
   `2026-06-13-artdeco-tstep-riser.md`.
5. **Other partials** — SUPERSEDED by the cross-style B5 baseline above. Of the
   `verify_crossStyleEdgeGap` list, only **GeometricStar** (chord 1.03, ref TRUSTED)
   is a genuine actionable partial; **DragonScales/Gyroid/Voronoi/CelticTriquetra are
   REF-UNTRUSTED** (styles.ts↔WGSL drift, NOT a mesh/edge defect — that probe's CPU
   reference is the discredited one). Fix the reference parity before chasing their
   "edge gaps". The 4 real PARTIAL items: SFB, GothicArches, BambooSegments, GeometricStar.
6. **CelticKnot** — CONFIRMED config-suspect by the B5 vertex channel (2.60mm =
   `ckRelief 2.0`+extra; `referenceTrusted: false`). Same class as the other 9
   REF-UNTRUSTED: `styles.ts` ↔ WGSL parity, not a mesh defect.
6b. **REF-UNTRUSTED reference-parity (10 styles)** — to let B5 judge them, EITHER
   parity-fix `src/geometry/styles.ts` STYLE_FUNCTIONS against the WGSL shaders
   (the relief-amplitude/mask mismatch; Gyroid/Basket/Hex are exact-relief cases =
   easiest to diff), OR give `diagnoseSurfaceFidelity` a GPU-eval reference
   (generalize SFB's `sfb-packed` path to a per-(θ,z) GPU sample). The MESH needs no
   change — these render and export correctly.
7. **Flag-flip / UI** — decide when to default `surfaceFidelityExact` on (re-baseline)
   or wire it to a quality-profile toggle.
8. **Smooth high-freq** (FourierBloom etc.) confirmed clean at production density
   (≤0.08mm) — no action.

## Key probes (CPU, `npx vitest run src/fidelity/<name>`)

- `verify_rebaseline_realpath` — the corrected baseline (positions exact; straddle + sizing).
- `verify_edgeVsFlank_adaptive` — edge vs sizing split on the real adaptive mesh.
- `verify_crossStyleEdgeGap` — per-style edge-gap ranking (config-aware, consistency guard).
- `verify_task3_curvatureFloor` — proves analytic sizing is a no-op (Task 3 cut).
- `verify_featureRefineLevel` — the density lever (p99 0.125→0.037).
- `verify_sfbBornPetals`, `verify_artDecoFidelity`, `verify_artDecoDecompose`,
  `verify_artDecoRiser`, `verify_bambooSegments` — the per-style work.
- `fidelityGate.test` — the shared gate.
- e2e: `e2e/_fidelity_flag_validate.cjs` (`PF_STYLE=<style> node ...`, dev server up).

## Docs

- Spec (Rev 3, edges-only): `docs/superpowers/specs/2026-06-13-surface-fidelity-export-design.md`
- Plan (Rev 3): `docs/superpowers/plans/2026-06-13-surface-fidelity-export.md`
- Red-team: `docs/superpowers/specs/2026-06-13-surface-fidelity-redteam.md`
- ArtDeco riser: `docs/superpowers/specs/2026-06-13-artdeco-tstep-riser.md`
- Memory: `project-export-endgame-design` (full running log).

## The 4 audit-first corrections this session (measurement beat the diagnosis)

1. Exact per-vertex eval — **no-op** (production positions already exact).
2. Analytic-curvature sizing — **no-op** (flank already at tol; 4-triangle residual).
3. ArtDeco — dominant is the **C0 t-step (riser)**, NOT fan/chevron (those are 0.17mm).
4. BambooSegments — **smooth (density)**, NOT a C0-step; residual is a rim-node bulge.

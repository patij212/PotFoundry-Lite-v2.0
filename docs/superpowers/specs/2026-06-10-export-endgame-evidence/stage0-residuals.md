# Stage 0 — Measured Residuals, Attribution, and Gate Inputs (2026-06-11)

Authoritative artifact: `potfoundry-web/e2e/baselines/authoritative-2026-06.json` (101 rows: 20 styles × {default, shortWide, tallNarrow, highFlare, noDrain} + SFB@1, production opts incl. the Stage-0 `hasFeatures B≤2` cap, real WebGPU, target 400k, decoupled chord ref 1024). Companion artifacts: `mesh-hashes-default-2026-06.json` (byte-identity tripwire, deterministic), `b-sweep-2026-06.json` (cap verdict), `crest-variance-epsilon-2026-06.json` (ε=0.5pp floor, zero spread ×3 runs).

**Dims config note:** dims mirror `_conforming_dimspace_probe.cjs` exactly (tallNarrow is H480 — harsher than the plan prose's H220). Sliver counts are dims-sensitive: GeometricStar/BambooSegments read 166/291 slivers under the app's own default dims (no `setDimensions` call — the variance/B-sweep config) but 0 under the explicit `{H:120, top_od:140, bottom_od:90, r_drain:10}`; the explicit config is the authoritative one.

---

## ★ HEADLINE — the default-dims "sliver class" is DECIMATION DAMAGE, not triangulation

Direct A/B at default dims (2026-06-11, live WebGPU, same style/dims, only `targetTriangles` differs):

| Style | undecimated (natural) | decimated to 400k |
|---|---|---|
| ArtDeco | 574,620 tris, **sliver=0, maxAspect=27** | 400k, sliver=2107, maxAspect=10⁹ (degenerates) |
| DragonScales | 840,890 tris, **sliver=0, maxAspect=36** | 400k, sliver=2683, maxAspect=401,914 |

**The conforming TRIANGULATION is sliver-free at default dims.** Every default-dims sliver in this matrix (and in the prior "9 styles slivered" finding, which was measured at 400k) is manufactured by the budget decimator (`decimateConforming` / meshoptimizer simplification — no triangle-quality bound). Cross-confirmed by the provenance channel: per-tag sliver buckets read 0 on the undecimated meshes the attribution hook measured. The sub-15° ANGLE residuals (crest bands, uBias anisotropy class) DO pre-exist decimation (≈14% below-15° on undecimated ArtDeco tag-0 ≈ the 13% measured post-decimation) — two distinct defect classes, separated by the Stage-0 instruments exactly as designed.

**Consequences for the program:**
1. **Stage 1's sliver→0 gates at default dims are ALREADY MET by the triangulation.** Stage 1 (Klincsek + warp-composed efg) re-targets the real residual: the sub-15° angle tail (crest bands + anisotropy), measured on UNDECIMATED output.
2. **A new named defect class owns the slivers: the decimator** (cutover plan Task 2.4 territory). Fix direction: quality-bounded simplification (meshoptimizer `simplifyWithAttributes`/error limit, or post-decimation sliver rejection), gated by `sliver=0 ∧ maxAspect<100` on the DECIMATED export. Until fixed, exports at budgets below the natural count ship manufactured slivers — every quality gate must state which mesh (pre- or post-decimation) it measures.
3. The B-sweep's sliver columns (all at 400k) measured decimator behavior as a function of B's input mesh — its TOPOLOGY columns (nonMan) and band columns remain valid; its sliver columns re-attribute to the decimator.

## Default dims (production opts, post-cap) — the goal-vector picture

- `bnd=0, orient=0` on 20/20; `featDrop=0` on 20/20; `inversions=drops=0` on every CDT style measured.
- `nonMan`: **only Voronoi (nm=2)** — the standing Stage-3 target (see refutation below).
- **SFB@1 (the cap's target): ALL ZEROS** — sliver=0, bnd=0, nonMan=0, orient=0, featDrop=0, band 10.7% (was nonMan=3, sliver=2285, band 40.6% pre-cap).
- Slivers at 400k (decimation class, per the headline): ArtDeco 2074, DragonScales 2364, Crystalline 1972, Voronoi 1971, BasketWeave 1628, CelticTriquetra 1480, SpiralRidges 550; 0 elsewhere.
- Crest-band sub-15° residuals (the genuine Stage-1/4 target; ε=0.5pp): DragonScales 13.5, BasketWeave 13.3, ArtDeco 12.5, Voronoi 7.6, Crystalline 6.6, GyroidManifold 6.5, GeometricStar 6.2, CelticKnot 5.2, CelticTriquetra 5.0, FourierBloom 5.0, HexagonalHive 2.9, SpiralRidges 2.4, BambooSegments 0.7, GothicArches ~0.7; 0 on the 6 smooth styles.
- Build times at default: 51–377 s (CelticTriquetra worst) — already above the docs' claims; extremes are far worse.

## SpiralRidges (Stage-5 decision inputs)

- Ceiling map (warp-composed, explicit dims): **minCorner 38.8°, pctBelow15 = 0** — no analytic ceiling anywhere; the residual band 2.4% is fully removable by triangulation choice. **Stage 5 pre-registered verdict: expect NO-OP after Stage 1**; lattice alignment and certified floor likely unneeded.
- Seam bands: u-seam clean (0.1% vs bulk 0.2%); **capTop 5.6% sub-15° vs bulk 0.2% (~25×)** — the helix shear at the t=1 pinned ring is a named, attributable residual for Stage 1/4.

## Periodicity (user-raised concern) — measured verdict

The periodic u-seam is **not** a triangle-quality outlier on any style at default dims (seam ≤ bulk everywhere; e.g. HexagonalHive seam 0% vs bulk 1.3%). At tall-narrow extremes seam bands degrade with the whole mesh (e.g. LowPolyFacet tallNarrow seam 85.9% vs bulk 68.8%) — an extremes-regime effect, not a seam-specific defect class at supported dims. Cap-ring bands are clean except the SpiralRidges capTop above.

## Stage-3 input — the refutation fired

At SFB@1 B=3 (nonMan=3) the fold/drop counters read **inversions=0, drops=0**: the planarize-before-merge/masked-fold-over hypothesis is **REFUTED**. The non-manifold enters through the dedupSide/interior-weld/resolve path (`FeatureConformingTriangulator.ts:743-813`). Stage 3 starts from a fresh minimal repro of THAT mechanism (the `__pfConformingCellDumps` harness is in place); the B≤2 containment holds the line meanwhile.

## Extremes (the staged-DoD call)

- **Short-wide (H40/300/280): catastrophic across all 20 styles** — slivers 690–11,920 (Voronoi worst, +nm=149; CelticTriquetra nm=24; CelticKnot nm=6; BasketWeave nm=6; Hive nm=1; Gyroid nm=2; ArtDeco nm=1; DragonScales nm=1), crest bands 33–99.6% sub-15°, builds 72–512 s. Decimation share unknown (the A/B was default-dims only) — but nonMan is decimation-independent topology damage. NOTE: `featDrop` is null (probe timeout) on 9 feature-heavy short-wide cells — unverified there.
- **CelticKnot short-wide `bnd=6` naked-edge crack: NOT REPRODUCED** (bnd=0 in this matrix; nm=6 remains). The historical crack appears fixed-or-config-dependent; cutover Task 1.1's repro recipe should target nm, not bnd.
- **Tall-narrow (H480) + high-flare: build-pathology class** — 20 cells errored (setStyle/setDims timeouts after page wedge; driver auto-recovered per cell). ArtDeco short-wide alone takes 435 s and wedges the page. Measured cells show hundreds–thousands of (likely decimation-class) slivers and one GeometricStar tallNarrow nm=1, CelticKnot highFlare nm=1.
- **Per the spec's risk #7, the staged-DoD split is now LIVE: default-dims DoD first; the extremes DoD (short-wide topology + build-time class) is its own workstream** (Stage 6 + the budget/sizing levers), not a Stage-1 gate.

## Probe/instrument gaps found while measuring (fix in Stage 1's probe pass)

1. `diagnoseSliverAttribution`/`diagnoseSeamBands`/`diagnoseCdtHealth` were called WITHOUT `targetTriangles` in the matrix driver → they measured the undecimated build while topo/crest measured the 400k decimated one. Accidentally load-bearing (it exposed the decimator), but the driver should pin both meshes explicitly per row.
2. `diagnoseSeamBands` nulls when decimation fires (designed guard) — extend the driver to call it at the natural count.
3. `featDrop` times out (120 s) on feature-heavy short-wide cells.

## Pre-registered Stage-1 gate inputs (per the spec, updated by the headline)

- **Bad-template/angle class (Stage 1 target):** crest-band sub-15° table above, measured UNDECIMATED, ε=0.5pp; plus SpiralRidges capTop 5.6%.
- **Decimator class (new, owns sliver=0 gates):** quality-bounded decimation fix, gate `sliver=0 ∧ maxAspect<100 ∧ bnd=nonMan=0` on the decimated export at default budget, all 20 styles.
- **CDT/topology class (Stage 3):** Voronoi nm=2 at default; dedupSide-path repro for SFB@1-at-B≥3; short-wide nm population (149/24/6/6/2/1/1/1) at extremes.
- **Byte-identity:** `mesh-hashes-default-2026-06.json` remains the tripwire (20/20 deterministic; unchanged by the cap at default).

---

# Stage 1 — Epoch-1 Verdict (2026-06-11, commits cd6af38..294fa5e)

Shipped: PullbackMetric (warp-composed sampler + derivative pins), efg population in leaves() (Task 2, `__pfConformingEfg` default ON), Klincsek max-min-angle DP (Task 3, greedy deleted), FCT plain-branch mirror (Task 4, `__pfConformingShapedCdtCells`, FCT_EAR_CLIP=7), and the epoch-closing **in-metric DP-vs-fan chooser** + metric-reliability guard (294fa5e).

**Two intra-epoch findings (measured, the chooser resolved both):**
1. Arming efg exposed the greedy ear-clip live: zero-area triangles on collinear mid runs (DragonScales 45,331 degenerates) — eliminated by the DP by construction.
2. DP-always REGRESSED fan-favourable styles (LowPolyFacet 0→7.8, GothicArches 0.7→4.4): B>0 forces the shaped path onto metrically-isotropic cells where the centroid fan (an interior Steiner) beats ANY diagonal-only triangulation. The DP is optimal only within its family ⇒ `emitShapedTransition` now scores BOTH templates in the metric and emits the winner (tie→fan). The first-attempted metric-reliability guard (suppress efg when it varies >50% across the cell) did NOT move these styles (their facets are flat ⇒ metric exact) but stays as a defense for genuinely metric-unfaithful cells.

**Final epoch gate (undecimated 2M-target band sub-15°, ε=0.5pp; vs the Stage-0 table):**
| Style | before → after | | Style | before → after |
|---|---|---|---|---|
| Crystalline | 6.6 → **0** | | ArtDeco | 12.5 → **8.0** |
| CelticTriquetra | 5.0 → **0** | | DragonScales | 13.5 → **7.9** |
| SpiralRidges | 2.4 → **0.3** | | BasketWeave | 13.3 → **7.2** |
| GeometricStar | 6.2 → 0.9 | | GyroidManifold | 6.5 → 3.9 |
| FourierBloom | 5.0 → 1.3 | | CelticKnot | 5.2 → 2.9 |
| Voronoi | 7.6 → 1.5 | | HexagonalHive | 2.9 → 3.2 (±ε) |
| SFB@1 (Task-4 probe) | 11.6 → **4.0** | | LowPolyFacet/Gothic/Bamboo/smooth | unchanged (0-level) |

- **No-regression clause: PASS 20/20.** Topology zeros + sliver=0: 20/20. Suite 318→378 tests across the program.
- 50%-relative-reduction criterion: MET on 6 styles (74–100%); ArtDeco (−36%), BasketWeave (−46%), DragonScales (−41%), Gyroid (−40%), CelticKnot (−44%) improved short of 50% → **routed to the Stage-4 escalation ladder** (registration-time snap → frozen-metric flips → metric-true Steiners) per the plan; no improvisation inside the epoch.
- SpiralRidges 0.3 ≤ its 1.0 target → **Stage 5 pre-registered verdict: NO-OP confirmed** (the ceiling map predicted exactly this).
- Hash baseline re-archived at epoch close (every changed style explained by EAR_CLIP/FCT_EAR_CLIP>0 or B≥1 shaped-template arming). TRIS_PER_LEAF recalibration: builds completed within envelopes; deferred to Stage 6 with a note (DP emits k−2 vs fan k on a subset of transition cells — modest).

**Remaining residual classes after epoch 1:** the 5 ladder-routed styles above (worst 8.0); Voronoi nm=2 at default (Stage 3, dedupSide repro); the extremes/build-time class (Stage 6); the UI quality panel still shows legacy targets (cutover plan Phase 2).

# Tier-C Productionization Charter

**Program:** PROD-TIERC — productionize the research lab's proven meshing mechanisms into ONE
region-based Tier-C hybrid mesher for every style and every valid shape.
**Mandated:** 2026-07-11 (user directive, verbatim scope below). **Coordinator:** main session.
**Status:** Phase 0 (design) — opened 2026-07-11 ~00:15 local, while E-2026-07-10-PROD-BATCH
drain v3 finishes the honest all-20 production baseline overnight.

---

## 1. Mandate (canonical, from the user directive)

The objective is **not** to improve the existing quadtree incrementally. The objective is a
production Tier-C hybrid mesher that reproduces the proven lab champions while meeting **all
gates simultaneously**:

- G1 forward surface error ≤ 0.01 mm (every-facet, true-3D basis);
- G2 reverse coverage error ≤ 0.01 mm;
- G3 watertight and consistently oriented;
- G4 zero non-manifold and zero zero-area faces;
- G5 no unacceptable feature bridging;
- G6 practical triangle, memory and export-time budgets;
- G7 correct seam, inner-wall, rim, base and cap assembly.

**Scope:** "all shapes" = every valid shape expressible by PotFoundry's current radial
parametric surface model. Geometry outside that representational scope must be **explicitly
documented** (this replaces the earlier blanket "no exclusion classes" phrasing: the
representational envelope is the boundary; inside it, no exclusions).

**Approach ruling (user):** not a wholesale rewrite. First a head-to-head prototype on three
already-proven champion cases + a smooth control, in one region-based implementation. If it
reproduces all three champions while the control stays clean, watertight and in budget, the
combined architecture is **proven** and generalization proceeds.

---

## 2. Proven design principles (hard constraints — every design decision cites these)

- **P1 Partition by real feature anatomy.** Region decomposition follows the style's actual
  feature structure, not UV convenience.
- **P2 Protect both sides of steep transitions.** Doubled boundaries around the entire
  transition (Gyroid band edges |val|∈{0.135,0.15}; DS doubled rings; plateau/channel pairs)
  — never a single centreline.
- **P3 Never bridge incompatible surface regions.** No-bridge topology is the strongest
  general conclusion of the campaign (Gothic cusps, DS steps, Gyroid bands).
- **P4 Size from final 3D geometry.** 3D arc-length concentration (Gothic graded flank, zero
  patch outliers), sheet-direction density (DS), composed warp Jacobian max(1,Ju²) (SpiralRidges
  81×), analytic curvature floors — never uniform UV spacing.
- **P5 Localized residual insertion, not blanket refinement.** Measured facet error → local
  pins / level splits (Gyroid knee pins; SR final-28 classified same family).
- **P6 Preserve explicit structured connectivity where anatomy is regular.** DS doubled-ring +
  structured sheet beat generic background triangulation materially.
- **P7 Constrained triangulation ONLY inside correctly partitioned regions** with immutable
  protected boundaries. (See R1.)

## 3. Refuted-techniques register (guardrails — do not re-derive these)

- **R1 Free Delaunay over the whole point cloud** — refuted repeatedly: cross-feature chords,
  needles, apex-straddling, feature-recovery regressions. CDT is viable only per-region under P7.
- **R2 Density without topology change** — uniform refinement / tighter chord tolerances /
  global density: wasted millions of tris, didn't move worst error, hit quantized refinement
  floors (quadtree LEVEL QUANTIZATION is the sizing floor — J-margin arm), refined wrong flank.
- **R3 Single feature centreline** — forces bridging on both sides; sometimes dramatically
  worse. Doubled boundaries instead (P2).
- **R4 Feature-graph completeness alone** — Gothic junction: ~complete edge recovery still
  left ~0.09 mm; protected edges necessary, not sufficient (flanks must be sized/graded, P4).
- **R5 Generic smoothing / relaxation / Lawson flips / angle optimization / post-hoc sliver
  cleanup as universal closers** — cannot repair wrong region decomposition or sheet-bridging.
  (Permitted only as in-region polish where topology is already correct.)
- **R6 Independent crest strips** — overlap when crest spacing < strip width; replaced by
  shared crest-to-crest flank bands (recommended, NOT yet comprehensively proven — open risk).
- **R7 Quadtree sizing margins** — level quantization eats sub-level margins (SR +5% arm:
  bit-identical residuals). Sizing ladders must respect level granularity or act locally (P5).

## 4. Champion evidence table (targets for the head-to-head)

| Style/class | Best mechanism | Evidence status |
|---|---|---|
| SpiralRidges | Jacobian-aware quadtree sizing | 81× (2,764→34→28 facet-pts), budget-legal 1.43×; local endgame (pins/level-split) open |
| Gyroid | Doubled band edges + knee pins | −67.6% @ +18.5% tris via existing per-cell CDT; pins + 2-locus CDT fix chipped; production integration incomplete |
| DragonScales | Doubled rings + structured sheet density | Strong style champion; needs composite ruler + production port; ring embedding reclaims 6–8× density waste |
| Gothic patch | Protected crest, no-bridge, arc-length-graded flanks | Literal-zero patch proven |
| Gothic whole mesh | Protected/refined constrained mesh | Fidelity achieved; needle/quality concession OPEN |
| GeometricStar | Whole-mesh protected refinement | Fidelity achieved; finite-area needles OPEN |
| Smooth styles | Existing adaptive production mesh | Already clean (PROD-BATCH: FourierBloom, SuperellipseMorph, HarmonicRipple SHIPPED-CLEAN); Tier-C treatment unnecessary — they are the CONTROL class |

Exact recipes/constants/artifacts: `research/lab/tierc/champion-spec-{dragonscales,gyroid,gothic}.md`
(Phase 0 deliverables).

## 5. Architecture sketch v0 (region-based synthesis)

```
Style params ──► A. FeatureAnatomyProvider (per-style)
                    feature graph + anatomy class: {structured-rings | band-edges |
                    crest-cusp network | smooth} + birth/death events over the envelope
                 B. RegionPartitioner
                    feature-partitioned regions; IMMUTABLE protected doubled boundaries (P2/P3);
                    shared crest-to-crest flank bands for dense networks (R6 successor)
                 C. Per-region meshers
                    C1 structured connectivity (regular anatomy: DS rings/sheets)  [P6]
                    C2 graded flank bands (arc-length-graded, crest-to-crest)      [P4]
                    C3 constrained CDT strictly inside regions                     [P7/R1]
                 D. Surface-metric sizing (shared service)
                    3D arc-length + curvature floors + warp-Jacobian composition   [P4]
                 E. Local residual pass
                    measured facet error → pins / forced local splits              [P5/R2]
                 F. Assembly
                    seam, inner wall, rim, base, cap; weld; orientation            [G7]
                 G. Gates harness (composite ruler, simultaneous)                  [G1–G7]
```

Explicitly OPEN (not yet proven, the prototype exists to test them): universal partitioner;
universal anisotropic triangulation; feature birth/death robustness; simultaneous
fidelity+quality+watertight+budget closure; browser performance; full parameter envelope.

## 6. Phase plan & decision rules

- **Phase 0 — design specs (now, overnight; zero heavy local compute — drain owns the cores).**
  D0.1 champion spec sheets ×3 (exact recipe, constants, artifacts, reproduce-targets, gaps);
  D0.2 gates-harness inventory (assemble composite ruler from proven instruments: newtonNearest
  every-facet forward, buildRefLocator reverse coverage, nonManRawBig watertight, orientation,
  zero-area, needle/aspect metrics, budget accounting, featureGraph bridging detector);
  D0.3 architecture v1 (module boundaries mapped onto existing code: ConformingWall,
  FeatureConformingTriangulator, MetricSizingField, parametric/* stages, labkit).
- **Phase 1 — E-2026-07-11-TIERC-HEADTOHEAD.** One region-based implementation; four cases:
  DragonScales (structured steps), Gyroid (doubled ramps + pins), Gothic (no-bridge cusps),
  smooth control (from the SHIPPED-CLEAN set). Full prereg committed BEFORE the first scored
  run. **Decision rule (user's):** all three champions reproduced + control clean/watertight/
  in-budget ⇒ architecture PROVEN ⇒ Phase 2. Any failure ⇒ mechanism-level diagnosis; iterate
  or KILL with named mechanism, never silent scope-shrink.
- **Phase 2 — generalization.** All 20 styles × parameter envelope (birth/death sweeps),
  triangle-quality closure (retire the needle concession — Gothic/GeoStar), out-of-scope
  geometry documented per mandate.
- **Phase 3 — production integration.** Seam-share resolution, dispatch replacement (retire
  styleId allow-list V12b), browser perf budget, e2e export-fidelity gate as the faithful
  watertight gate, flag-flip criteria, rollback story.

## 7. Baselines & inputs

- **Production baseline:** E-2026-07-10-PROD-BATCH all-20 honest scorecard (drain v3 in flight
  tonight) — the numbers the prototype must beat/close, on REAL captured production artifacts.
- **Champion targets:** DRIVE-ALL-20 terminal lab scorecard (12 literal-0 + 4 certified
  designed-feature + 4 measured-exclude; Gothic band frontier 0.117) + per-style manifest v1
  (`research/lab/2026-07-10-program-consolidation.md`).
- **Known product bugs feeding G-gates:** SuperformulaBlossom CPU-truth default missing
  strength field (`src/geometry/types.ts:548`, TRUTH-BRIDGE-FAILURE row); WaveInterference
  CPU↔GPU divergence (needs its own arm; INTHASH class, 14× larger).

## 8. Ops protocol (hard-won, binding)

Coordinator hosts ALL long-running watchers/runners (agent-hosted watchers died twice).
Agents: single detached stages max, end turns, breadcrumbs on any stage >10 min
(time-gated ≤60s cadence — v3 pattern). AboveNormal priority only; ≥2 cores headroom; max 4
concurrent heavy forks machine-wide (shared budget with any drain/capture in flight). Kill by
PID/cmdline match (TaskStop does not tree-kill). Direct `node node_modules/vitest/vitest.mjs`
invocation (npx cache trap). Pathspec-only commits of own files; never `git add` sweeps.

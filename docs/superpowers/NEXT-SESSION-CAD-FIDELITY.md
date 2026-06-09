# NEXT-SESSION HANDOFF — CAD-Grade Fidelity (true-to-the-mathematical-model export)

**Mission.** Close the gap from "patchy export" to **Grasshopper/Rhino CAD-grade**: an
export mesh that is *true to the mathematical model* — ridge crests faithful (no cuts/
serrations), watertight, sliver-free, performant — for **all** styles across the **full
style-strength range** (not just the defaults). Branch `refactor/core-migration`,
project `potfoundry-web/`. The conforming mesher is the path (flag `conformingMesher` /
`window.__pfConforming`); the legacy path is the production default until cutover.

This file supersedes the GAP-1 short-wide work (DONE this session — see
`NEXT-SESSION-HANDOFF.md` + memory `project_conforming_mesher.md`). The GAP-1 fixes
(commits `39e4b89` fixed-uBias, `9aff0ae` geometric gate) are committed and validated.

---

## 0. THE SYMPTOM that opened this (the user's words)
> "exported SuperformulaBlossom at higher style strengths starts getting cuts and
> serrations in its ridges."

At the **default** `sf_strength=0` SuperformulaBlossom is a plain pot (a clean canary —
why every prior session passed it). The petals — and the serration — only appear as
`sf_strength → 1`. **None of the prior 20/20 / GAP-1 work touched the high-strength
regime.** This is a whole untested dimension: *style strength*.

## 1. ROOT CAUSE — PROVEN this session (measurement-first; trust, spot-check)
The conforming mesher extracts **ZERO feature lines for 8 "smooth-ridge" styles** —
`FeatureLineGraph.ts: SuperformulaBlossom/HarmonicRipple/SuperellipseMorph/FourierBloom/
WaveInterference/RippleInterference/Crystalline/ArtDeco: () => []` — on the code-comment
bet that *"curvature-adaptive meshing alone resolves them."* **That bet HOLDS at gentle
strength but BREAKS at high strength.** The Gielis petal crests are **diagonal, MORPHING
(u,t) curves** (petal count `m = mix(m_base=6, m_top=10, t^m_curve)`, and `n1,n2,n3` also
mix with t — `styles.wgsl`), so an axis-aligned (u,t) quadtree must **staircase** them →
elongated transverse triangles = "serration." Watertight, but NOT model-true.

**MEASURED (e2e `_serration_probe.cjs`, conforming, 400k tris, sf_strength 0→1):**
- `maxAspect3D` climbs **10.7 → 11.2 → 38.4 → 65.5 → 87.6** (toward the 100 sliver bound),
  while topology stays clean (`bnd=nonMan=orient=sliver=0`) — a watertight-but-serrated mesh.
- **It is ALIGNMENT, not density.** Raising the GPU sampler 256→512→1024
  (`__pfConformingDenseRes`) leaves `maxAspect ≈ 87.6` **UNCHANGED** — a finer sampler adds
  triangles but axis-aligned cells still staircase a diagonal crest. So "use a finer
  sampler/sizing grid" (the 128² sizing grid + 256² curvature band-limiting are real
  *secondary* limits) **cannot** fix it; only laying an inserted constraint EDGE along the
  crest makes it a faithful, watertight mesh edge (the mechanism Voronoi/Gyroid/Hex/CelticKnot
  already use to reach sliver=0).

## 2. THE INSTRUMENT GAP (the reason this was invisible) — partially fixed
The **existing sag metric is artifact-dominated and CANNOT measure CAD fidelity**: it reads
`rmsSag=15.8mm / maxSag=35mm` on a *plain* pot (sf_strength=0, ~zero real deviation) — the
drain-cylinder radial-binning artifact — and rmsSag *FALLS* as strength (and serration)
rises. **You cannot fix what you cannot measure.**
- DONE this session (commit `98eaf7c`): `windowHook.setStyleParams` (drive `sf_strength`),
  `metrics.wallDeviation` + `windowHook.diagnoseWallFidelity` — wall-restricted radial
  deviation, drain excluded. It MOVES (`wall p99` 1.60→1.95mm), but it is **whole-wall
  (diluted) — too coarse to isolate the crest-band win.** maxAspect is currently the
  cleanest proxy.
- **STAGE 0 (below) builds the proper crest-band metric — do it FIRST.** Per the proven
  playbook, no fix is accepted without a metric that reads ≈0 on a plain pot and rises
  monotonically with serration.

## 3. THE PROTOTYPE already landed (blueprint STAGE 1-2) — extend it
`FeatureLineGraph.extractSuperformulaBlossom` (+ `SuperformulaCrests.test.ts`, 5 TDD guards):
traces the petal crests as the **zero-set of ∂r/∂θ** (radius extrema = peaks ∪ valleys) via
`marchingSquaresZero(field, 768, 320, periodicU=FALSE)` → `segmentsToPolylines('sf-crest')`,
emitted as `general-curve`. Strength-gated (`< 1e-3 → []`, so the default export is
byte-identical). **Prototype scope = full-height STABLE petals only** (born/forking petals
deferred — see STAGE 3).
- **VALIDATED:** at `sf_strength` 0.5 and 1.0 the mesher now reports **featExp=12,
  featPres=12, featDrop=0** (12 stable petal crests are now real, *tracked* mesh edges) with
  **bnd=nonMan=orient=sliver=0** (watertight) and **byte-identical at strength=0**. The
  morphing crests insert cleanly through the existing `FeatureConformingTriangulator`
  general-curve path — the path is PROVEN viable.
- `maxAspect` stays 87.6 because the **deferred born petals (upper, m>6 region)** retain the
  worst triangle — honest, localized residual. The crest-band metric (STAGE 0) is what will
  show the stable-crest win quantitatively.

## 4. THE VETTED PLAN (design+adversarial workflow, 13 agents — full blueprint in
`docs/superpowers/plans/` if committed, else the workflow result). Approach **A (crest
extraction + insertion)** is the core; B (rotated/aligned cells) REJECTED (axis-aligned
cells have no rotation DOF; rotated cells forfeit the watertight registry); C (finer
sampler/sizing) is a *flank-only support lever*, cannot make a crest-aligned edge.

**STAGE 0 — DONE + VALIDATED (the instrument that gates everything).** Built
`wallChordError` + `extractOuterWallSubmesh` + `sampleTrueRadius` + `findRowExtrema`
(metrics.ts, 10 TDD guards in `serration.test.ts`), `LAST_CONFORMING_OUTER_WALL_MASK`
read-only stash (ParametricExportComputer), and `__pfFidelity.diagnoseSerration` (windowHook).
**KEY DESIGN (corrected by a design+adversarial workflow):** measure RADIAL deviation
`|r − R_true(θ,z)|`, NOT 3D nearest-point (which UNDER-measures a tangential staircase and
is singular where ∂r/∂θ→0 at the crest). `R_true` is recovered by inverting the OUTER
sampler on (ANGLE, HEIGHT) — both monotone/well-conditioned on a near-vertical wall — via
2D Newton (no crest singularity). Crest band = ALL local radius extrema per t-row (peaks AND
valleys), NOT argmax/argmin (which misses m−1 of m petals). Outer-wall-only via the surfaceId
mask (excludes the inner-wall ~thickness phantom). Style-AGNOSTIC (reads the sampler surface).
**MEASURED (SuperformulaBlossom sf_strength sweep, `_serration_probe.cjs`):
serrationScore 0.47→0.76→1.47→2.47→3.35 (0→1) — ≈0 on the plain pot (vs the OLD metric's
rms 1.44mm ≡ 14.4: a 30× cleaner floor), strictly monotone, crestBandRms 0.047→0.335mm,
maxCrest 0.08→9.12mm, loci=20 (all 10 petals' peaks+valleys), topology clean throughout.**
The signal the project lacked is now in hand: no fix is accepted without it.
The original STAGE-0 spec below (3D-nearest GN) is SUPERSEDED by the radial design above:
Upgrade `wallDeviation`/`diagnoseWallFidelity` to measure against the **stashed outer
sampler** (`getLastConformingOuterGrid()` → `new GpuSurfaceSampler(...)`, the exact pattern
`diagnoseFShear` uses) instead of the whole-pot dense reference (which carries the drain
artifact + its own crest chord-cut floor). New `wallChordError(mesh, sampler)`: for each
wall-triangle **interior AND edge-midpoint** sample, Gauss-Newton invert (u,t) against
`sampler.position` (seed u=atan2(y,x)/2π, t=(z−zMin)/(zMax−zMin); 5 iters, keep best),
signed by the surface normal. Restrict to the **OUTER wall** (`allVertArrays[0]` — the inner
wall would inject a ~wall-thickness phantom). Derive the crest band by **empirical
argmax/argmin** of `hypot(x,y)` per t-row (NOT the closed-form `(4k±1)/(4m)` — the
seam_offset=π/m puts it a quarter-petal off). Report `maxDevMm, rmsDevMm, p99DevMm` (wall),
`maxCrestDevMm, crestBandRmsMm` (crest-band), headline **`serrationScore =
crestBandRmsMm / 0.1mm`** (<1 = within CAD tolerance, ≥1 = serrated). GATE: ≈0 at
sf_strength=0, monotone rise 0→1 (the clean signal the project lacks). Pin denseRes=256 for
the measure (raising it changes the mesh under test). Additive WallChordResult — do NOT
touch the pinned `FidelityMetrics` schema.

**STAGE 1 — CPU field mirror (partly done).** `sfRf` mirrors `sf_radius` (verified slots).
ADD a unit test asserting `sfRf` matches the GPU outer-wall radius (from
`getLastConformingOuterGrid`) within f32 tol at default and n2≠n3 — prove the mirror, not the
closed form (the prototype trusts the mirror; verify it).

**STAGE 2 — DONE (stable crests).** See §3. (`featDrop=0`, watertight, byte-identical default.)

**STAGE 3 — born/merge crests (the hard core).** ~4 petal-pairs are BORN at interior (u,t)
points as m:6→10. A constraint ending at a cell-interior point **dangles → T-junction**
(the documented CelticKnot residual; `planarize` only splits in-cell *crossings*, not
endpoints). Watertight-preserving options: extend each born crest **down to the nearest
pinned boundary row** (full-height) OR insert a **closed peak↔valley loop**. GATE: ALL
crests inserted, `bnd=nonMan=orient=sliver=0`, crest-band rms < 0.1mm full-circumference.

**STAGE 4 — curvature support (only if flanks still serrate).** Raise the 128² sizing grid
→256 (`ParametricExportComputer.ts` resU/resT) ± `__pfConformingDenseRes`; treat
sampler-res & FD-step as ONE knob; **cap κ at a chord target** (the n1<1 Gielis tip is a
cusp — unbounded curvature, no fixed point). Watch `budgetMode:'cap'` (it can COARSEN crests
back) and `minEdgeMm=0.2`.

**STAGE 5 — no-regression sweep.** Re-run the 20-style default matrix + GAP-1 short-wide.
GATE: 20/20 default byte-identical, GAP-1 short-wide fixes unbroken, maxAspect on
SuperformulaBlossom@1 falls toward the strength-0 baseline, build 1-6s no timeout.

## 5. THE ONE CROSS-CUTTING TRAP (must respect)
`WatertightAssembly` FORCES `uBias=0` on any wall with feature lines (`hasFeatures →
uBias=0`, because the braid-anisotropy crack isn't fixed for inserted styles). At **default**
dims uBias is already 0 → **no collision** (the prototype is safe). But on **SHORT-WIDE**,
the instant SuperformulaBlossom emits a crest, uBias=0 re-introduces the very slivers GAP-1
just removed. **DO NOT ship the crest fix to short-wide dims until the `hasFeatures→uBias=0`
gate is lifted for non-braid general curves** (task #7 — un-defer uBias for inserted styles).
This unifies the two threads: §task7 (un-defer uBias) must land before §CAD-fidelity composes
with GAP-1 short-wide.

## 6. GENERALIZATION (after SuperformulaBlossom is end-to-end incl. born petals)
The metric (STAGE 0) is style-AGNOSTIC (empirical per-row argmax) — works for all 8 smooth
styles immediately. The extractor is style-SPECIFIC: each needs its own verified CPU radius
mirror + ridge-locus (zero-set of the angular derivative). Do them **one at a time, gated by
the metric** — do NOT batch-wire all 8. Inserted styles (Voronoi/Gyroid/Hex/CelticKnot) and
warp styles (SpiralRidges helical etc.) are orthogonal (separate kinds/paths) — no interaction.

## 7. THE PLAYBOOK (unchanged — non-negotiable)
Measurement-first (reproduce → prove root cause → fix → re-measure; never claim done without
probe output). Strict gating EVERY commit: `npx vitest run src/renderers/webgpu/parametric/
conforming/ src/fidelity/` green; `npm run typecheck` + `npm run lint` (0 warnings); the e2e
topology/serration probe on the touched style + canaries; **no previously-passing style
regresses** and the 20/20 default stays byte-identical. TDD (failing test first, synthetic
where possible). Scoped `git add` of explicit paths — NEVER `git add -A` (the tree has
pre-existing dirty `CLAUDE.md`/`agents.md`/`playwright-report` + untracked `.log`/`.txt` +
scratch `blueprint_extract.txt`/`e2e/_featcheck.cjs`). A clean no-progress tree is acceptable;
a broken/regressing commit is NOT. Use the design+adversarial **Workflow** orchestration for
big architecture calls (it caught periodicU/born-petal/uBias traps this session).

## 8. ENVIRONMENT (these WILL bite — internalize)
- Dev server on **:3001** — `cd potfoundry-web && npm run dev -- --port 3001` (clear
  `node_modules/.vite` if isReady times out). Probes are headless:false Chromium (WebGPU).
- **Background-task cwd resets to repo root** — prefix background e2e with
  `cd /c/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web && …`, and run node
  probes from `potfoundry-web/` (so `@playwright/test` resolves).
- **GitNexus MCP is UNUSABLE** this session (DB version 41 vs build 40 — incompatible, not
  just stale; FTS load fails on every call). The CLAUDE.md-mandated `impact()`/`detect_changes`
  cannot run. Gate via the vitest/e2e/byte-identical suite instead (the established discipline).
- `eval` as an identifier is blocked by a security hook (sampler method is `position()`).

## 9. THE INSTRUMENTS (your ground truth)
- `e2e/_serration_probe.cjs` — `PF_STYLE`/`PF_PARAM`/`PF_VALUES` strength sweep → wall
  deviation + maxAspect + topology; `PF_DENSERES` varies the sampler.
- `window.__pfFidelity.diagnoseWallFidelity` (max/p99/rms wall radial deviation),
  `.diagnoseTopoQuality` (maxAspect/sliver/bnd), `.diagnoseFeatures` (featExp/Pres/Drop —
  the crest-tracking proof), `.setStyleParams({sf_strength})`.
- `_conforming_full_probe.cjs` — full-20 default topology matrix (the byte-identical anchor).

## 10. COMMITTED THIS SESSION (CAD-fidelity)
- `98eaf7c` fidelity instrument (setStyleParams + wallDeviation + serration probe).
- `<crest commit>` extractSuperformulaBlossom + SuperformulaCrests.test.ts + EXTRACTORS wiring
  (STAGE 1-2; featDrop=0, watertight, byte-identical default).

## 11. DEFINITION OF DONE
SuperformulaBlossom (then the other 7 smooth styles, one at a time) at full strength:
`serrationScore < 1` (crest-band rms < 0.1mm) across the WHOLE circumference (stable + born),
`bnd=nonMan=orient=sliver=0`, no default-dim regression, build in the 1-6s envelope. Then the
short-wide composition (after task #7 lifts the uBias gate). Then re-assess cutover.

# NEXT-SESSION HANDOFF — CAD-Grade Parametric Export (autonomous, full-day run)

**You are continuing a multi-session effort to bring PotFoundry's parametric mesh export to Grasshopper/Rhino CAD quality.** The user (Patryk) is away for a full day/night and has granted you authority to handle ALL critical work and decisions autonomously. Work continuously. Don't wait for input — make sound, evidence-backed decisions, commit working increments, and document as you go. He trusts you; honor that with rigor, not recklessness.

Branch: `refactor/core-migration`. Project: `potfoundry-web/` (the active app — NOT the worktree's Python app).

---

## 0. THE GOAL (per generated mesh, all 20 registered styles)
```
sliverCount = 0    boundaryEdges = 0    nonManifoldEdges = 0    orientationMismatches = 0
featuresExpected == featuresPresent    featuresDropped = 0    + no timeouts, CAD-grade fidelity
```

## 1. CURRENT STATE — verified & committed (UPDATED 2026-06-08l; do not re-derive; trust + spot-check)
A from-scratch **watertight-by-construction conforming mesher** replaces the old non-conforming sweep + 1,100-line repair battery. It is behind a flag (`conformingMesher` / `window.__pfConforming`); **the legacy path is untouched** and is the production default until cutover.
- **All 20 styles: `orient=bnd=nonMan=sliver=0`, maxAspect ≤ 50.3, no timeouts.** Full regression: `potfoundry-web/e2e/regress-20-2026-06-08l.log`.
- **20/20 styles at FULL 6/6 at DEFAULT dims** (verified `featuresDropped=0` e2e): the 8 warp-captured + 8 smooth PLUS the 4 general-curve-inserted styles — **HexagonalHive (featExp=4), GyroidManifold (14), CelticKnot (9), Voronoi (206)**. 🎉
- **Voronoi DONE (2026-06-08l):** insertion ENABLED (`VORONOI_INSERTION_ENABLED=true`). The tangent cell-edge T-junction cracks (the old blocker) are FIXED by a **grid-line vertex registry** in `triangulateQuadtreeWithFeatures` (every feature vertex on a shared cell edge is registered keyed by its grid line → both adjacent cells read the IDENTICAL edge-vertex set → symmetric by construction, no tangent crack). The residual (u,t) needles were killed by UN-guarding the edge-snap (the registry now mirrors snapped on-edge vertices to the neighbour, so the old same-level guard is unnecessary — and removing it lets the snap also fix transition-edge needles). e2e: Voronoi sliver=bnd=nonMan=orient=0, featExp=featPres=206, featDrop=0. Hex even improved (maxAspect 46.7→35.7). 211 conforming+fidelity unit tests green.
- **Insertion engine** (`conforming/`): `ConstrainedCellTriangulator` (local cdt2d), `FeatureConformingTriangulator` (`triangulateQuadtreeWithFeatures` — per-cell CDT in feature cells, watertight + T-junction-free by construction via: identical cross-cell crossings, feature-driven refinement, corner-snap + interior weld, per-edge crossing detection for tangents, planarization of braid crossings, canonical min-qk merge of close shared-edge crossings), `SampledFeatureExtractor` (marchingSquaresZero + marchingSquaresLabels + segmentsToPolylines + Douglas-Peucker). 206 unit tests. cdt2d is now a LIVE local dep (not the dead global path).
- Architecture: GPU evaluates the WGSL surface (source of truth); CPU builds topology (metric-warped 2:1-balanced quadtree → periodic seam → uniform shared-ring assembly → topology-preserving crease warps → general-curve local-CDT insertion in the outer wall). Modules in `potfoundry-web/src/renderers/webgpu/parametric/conforming/`.

## 2. FIRST ACTIONS (orient before touching code)
1. **Read project memory `project_conforming_mesher.md` IN FULL** (in `C:\Users\patij212\.claude\projects\C--Users-patij212-Downloads-PotFoundry-Lite-v2-0\memory\`). It has the complete history, every dead-end already tried (don't repeat them), and the precise state. Also skim `project_export_defect_rootcauses.md` (root causes) and `feedback_audit_first.md` (the user rejects un-measured claims).
2. **Read the design**: `docs/superpowers/specs/2026-06-07-cad-grade-parametric-export-design.md`, then `docs/superpowers/plans/2026-06-08-general-feature-insertion.md` (**Plan 4 = your immediate work**). Also plans for foundation/assembly for context.
3. **Verify the environment** (Section 4) — especially that the dev server is up.
4. **Spot-check the baseline**: run the full topology probe (Section 3) and confirm all 20 still 0/0/0/0 before changing anything. This is your regression anchor.

## 3. HOW TO MEASURE (the harnesses — your ground truth)
The fidelity hook is `window.__pfFidelity` (gated by `?fidelity=1`). Probes live in `potfoundry-web/e2e/`. **All probes need the dev server running on :3001 and run from `potfoundry-web/`.**
- **Topology (fast)**: `PF_STYLES=A,B node e2e/_conforming_full_probe.cjs` (sets `__pfConforming`, prints orient/bnd/nonMan/sliver/maxAspect/tris).
- **Features + sag (full)**: `PF_STYLES=A,B node e2e/_conforming_sag_probe.cjs` (adds featExp/Pres/Drop + maxSag/rmsSag).
- **Per-line feature breakdown**: `window.__pfFidelity.diagnoseFeatures()`.
- Legacy comparison/baseline: `e2e/baseline-fresh.log` (legacy), `e2e/final-matrix.log` (conforming, the current proof).
- Full 20-style command (≈20–30 min): see the PF_STYLES list in `final-matrix.log`'s generating run / Section 9.

## 4. ENVIRONMENT GOTCHAS (these WILL bite you — internalize them)
- **Background-task cwd resets to repo root.** ALWAYS prefix background bash with an absolute `cd`: `cd /c/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web && <cmd>`. Foreground cwd is unreliable too — use absolute paths.
- **Dev server**: must be running on :3001. Start: `cd /c/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web && npm run dev -- --port 3001` (background). If probes hang at `isReady`, the cause is a **stale `node_modules/.vite` cache** — `rm -rf node_modules/.vite` then restart (NOT a GPU problem; `navigator.gpu` is fine). The server dies over long runs — re-check/restart it between phases.
- **Probes are headless:false Chromium** (WebGPU needs it) — they pop windows; that's normal. Large meshes (1–4M tris) take 30–90s to measure.
- **GitNexus**: `CLAUDE.md` mandates `gitnexus_impact` before editing existing symbols. The conforming branch in `ParametricExportComputer.ts` is the main one you'll edit — it's an additive, flag-gated branch (impact = LOW, 0 production processes when flag off). Re-index with `npx gitnexus analyze` if it warns stale (heavy, ~10 min; run in background).
- **Lint is strict** (0 warnings = CI fail; a PostToolUse hook runs eslint after each .ts edit). **`eval` as an identifier is blocked by a security hook** (that's why the sampler method is `position()`, not `eval`).
- **The ~31–45mm maxSag is a METRIC ARTIFACT, NOT real export error** — the drain cylinder (r=10) is near-vertical so the sag metric routes it to the radial path and compares to the single-valued R_true (~45mm). The wall is sub-mm; caps are flat (zero real sag). Do NOT chase this as a geometry bug. (Optional: make the metric faithful — Section 6 item 4.)

## 5. THE PROVEN PLAYBOOK (the discipline that made this work — NON-NEGOTIABLE)
1. **Measurement-first, always.** Never claim done without the probe output. The user rejects un-measured claims. Reproduce → prove root cause → fix → re-measure.
2. **Strict gating on EVERY change** (this is why nothing regressed across 32 commits). Only commit a state that passes ALL of: (a) `npx vitest run src/renderers/webgpu/parametric/conforming/ src/fidelity/` all green; (b) `npm run typecheck` + `npm run lint` (0 warnings); (c) `_conforming_full_probe.cjs` over the touched style + canaries — every style still `orient=bnd=nonMan=sliver=0`; (d) the touched style's `featuresDropped` strictly decreases AND **no previously-passing style regresses** (the 16 must stay 6/6). If you can't reach a passing state, `git checkout -- .` and document the finding. **A clean no-progress tree is acceptable; a broken/regressing commit is NOT.**
3. **Canary discipline**: keep clean styles (SuperformulaBlossom + the 8 already-captured) green at every step. If a *structural* change breaks a canary, it's a by-construction violation — fix the construction, **never add a repair/weld pass** (that's the old architecture's mistake).
4. **Delegate to gated subagents, then VERIFY independently.** The pattern that worked: dispatch a `general-purpose` subagent with the task + the HARD GATE spec + "scoped `git add` only (never the pre-existing dirty CLAUDE.md/agents.md/playwright-report)"; it does TDD + runs the gate + commits or reverts; then YOU re-run the probe to confirm. This conserves your context. Ask subagents for CONCISE reports.
5. **TDD**: failing test first (synthetic surfaces via `SyntheticCylinderSampler` — no GPU needed for unit logic), then implement, then GREEN, then the e2e gate.
6. **Commit working increments; `git add` explicit paths** (the tree has pre-existing dirty files + many untracked probe `.txt`/`.log` — never `git add -A`).
7. **Checkpoint to memory** (`project_conforming_mesher.md`) after each milestone, so progress survives context limits. Keep it honest (what's verified vs blind).

## 5b. GAP 1 ROOT CAUSE — PROVEN (2026-06-08l, unit-level, measurement-first)
`conforming/Gap1FoundationAspect.test.ts` (no-GPU) proves it: **a SQUARE (u,t) cell's 3D
triangle aspect ≡ the local metric anisotropy √E/√G, INDEPENDENT of refinement level**
(measured maxCellAspect tracks √E/√G across dims/detail). Sliver field (aspect>100) appears
EXACTLY when √E/√G>~115. Base anisotropy 2πR/√G ≈3 default → ≈22 short-wide; base+relief
crosses 115 for detail/warp/insert, gentle-smooth stays under (matches the e2e table). **A
sizing-field CLAMP cannot fix this (aspect is level-independent → clamp changes count, not
sliver-ness). The ONLY fix is ANISOTROPIC cells (Δu/Δt≈√G/√E)** — the guard's anisoFixAspect=1.73
(≈√3) in every regime confirms EG-balanced cells erase the sliver field. Planned fix: a global
**uBias** (u-exponent = level+B, B≈round(log2(baseAnisotropy))) so cells are 3D-near-square while
the square-split / 2:1-balance / T-junction templates keep working (cell stays "square" in INDEX
space; only the u→coord map gains a constant 2^B factor). nRing then = 2^(pin+B); warps +
insertion need uBias-awareness. Touches all 20 → gate against the full 20-style probe.

**DECIDED SEQUENCING: GAP 2 + Voronoi FIRST → GAP 1 uBias → cutover.** GAP 2 (per-edge
forced-crossing mirror) banks 20/20 AND fixes the twisted/high-flare inserted-style failures
(a 2nd cutover blocker), is contained/lower-risk, and is robust to the later uBias change — so
bank that milestone before the risky foundation rewrite.

**STATUS 2026-06-08l: GAP 2 + Voronoi DONE → 20/20 at default dims (committed).** The grid-line
vertex registry + unguarded edge-snap fixed the tangent T-junction class AND the residual (u,t)
needles. Full 20-style matrix all clean (`e2e/regress-20-2026-06-08l.log`). RE-CHECK whether GAP 2
also fixed the twisted/high-flare INSERTED-style dimspace failures (run `_conforming_dimspace_probe.cjs`
on Hex/Gyroid/Celtic) — the registry should have closed the high-flare bnd cracks; the twisted
slivers may also be gone now. **GAP 1 (uBias anisotropic foundation) is now the SOLE remaining
cutover blocker.**

## 6. THE WORK (priority order; UPDATED 2026-06-08i)

**NOW (priority 1) — finish Voronoi → 20/20.** Extraction is DONE (`extractVoronoi` in FeatureLineGraph; featDrop=0 proven). The blocker is the INSERTION topology crack (bnd>0) at tangent cell-edge transitions: a Voronoi border tangent to a cell edge leaves the cell it doesn't cross-into coarse, so that transition edge gets an inconsistent crossing → T-junction. Diagnosed via the no-GPU repro pattern (extract curves → `assembleWatertight` with a synthetic cylinder sampler → audit boundary edges; the cracks are 3-point triplets on horizontal cell edges = corner/crossing/corner where one cell has the crossing and the neighbour doesn't). Tried + reverted: a `FEATURE_TOUCH_MARGIN` box-expansion in `buildFeatureIntersector` (over-refined → cracked HexagonalHive too). The robust fix is a per-edge forced-crossing pass: when a border crosses/touches a cell edge, register that crossing in BOTH adjacent cells (mirror it across the shared edge) regardless of which cell the curve enters — this is also the deferred fix for the (u,t) needle at curve extrema (DO NOT) §4. Then flip `VORONOI_INSERTION_ENABLED=true` and re-measure (target: bnd=nonMan=orient=sliver=0, featDrop=0).

**Priority 2 — dimension-space hardening (THE cutover blocker — DONE the harness, FOUND 2 gaps).** `__pfFidelity.setDimensions` + `e2e/_conforming_dimspace_probe.cjs` are built; run them. Results (`e2e/dimspace-findings-2026-06-08i.md`): the conforming path is clean at DEFAULT dims but BREAKS at extremes, and the breakage is BROADER than insertion:
  - **Gap 1 — SHORT-WIDE (flat wide dish, H40/OD300): a FOUNDATION limitation, the dominant blocker.** Nearly ALL styles explode (sliver up to 2.9M): warps, inserted, AND high-detail SMOOTH styles (Crystalline 28k, ArtDeco 559k — no warp/insertion!). Only gentle smooth + GeometricStar pass. Root: the square 2:1 quadtree can't make 3D-isotropic cells under extreme metric anisotropy (circumference/height ≈ 23:1) → over-refines into slivers (2–3.5M tris). `minUniformLevel`/`featureLevel` worsen it but are NOT the root (pure curvature-adaptive smooth styles fail too). PRE-EXISTING (the default-dim harness never caught it). Real fix = ANISOTROPIC cells (rectangular/kd splits in the base mesh) or an aspect-aware clamp in `MetricSizingField` / `PeriodicBalancedQuadtree` — a foundation change; gate VERY carefully (touches all 20). Full data: `e2e/dimspace-findings-2026-06-08i.md` + `dimspace-rest-2026-06-08i.log`.
  - **Gap 2 — TWISTED / HIGH-FLARE: only INSERTED styles fail** (warps pass) = the deferred (u,t) needle at curve extrema, amplified by the metric distortion. Same fix as Voronoi (per-edge forced-crossing mirror).

**Then — Plan 4 leftovers (reference):**
1. **Local CDT general insertion** (Plan 4 Mechanism B — the hard core). Insert feature-curve polylines (loops/braids) as constraint edges into ONLY the quadtree cells they pass through, with Steiner points at crossings, keeping each feature-cell's PERIMETER byte-identical to its neighbour (no T-junctions) → watertight by construction. Kernel: `delaunator` + `robust-predicates` (installed). Keep it LOCAL (O(feature-length) cells) — the prior global `cdt2d` attempt was the timeout source; never go global. De-risk first: prototype on ONE HexagonalHive cell, assert perimeter unchanged + interior conforming + constraint-is-an-edge, THEN scale to the full curve, THEN to CelticKnot. Try the topology-preserving vertex-snapping (Plan 4 Mechanism A) first if it's cheaper, but the snapping likely fails for 60° hex edges/crossings — let the gate decide.
2. **Tier-2 sampled extraction** for Voronoi + Gyroid: dense (θ,t) GPU sample → Hessian/eigenvector ridge classifier with gradient-magnitude gating (Gyroid's level-set gradient is analytic → Newton for near-exact loci). Output `FeatureLine` polylines → feed the insertion mechanism from step 1.
3. **Per-style ground-truth feature counts** for any style you capture (extend `extractAnalyticFeatures`), so `featuresDropped` stays meaningful.

**Secondary (do when primary is blocked or done; all optional-but-valuable):**
4. **Faithful global-sag metric** (so CAD-grade fidelity is PROVABLE): route non-wall (drain/inner/base) triangles to nearest-surface (or `min(radial, nearest)`) + densify the reference base/drain. TRANSPARENT + non-masking (verify a deliberately-coarse mesh still shows high sag). This removes the 35mm drain artifact and lets you prove sub-mm everywhere. Don't make it lenient.
5. **Robustness across pot dimensions**: the harness only tests default dims (H120/Rt70/Rb45). Exercise the conforming path at extremes (tall/short, wide/narrow, drain off `rDrain≤0`, high flare `expn`) — find + gate-fix any edge case before cutover.
6. **Triangle-budget polish**: the `budgetMode:'cap'` is wired; tune so users get clean quality at their chosen budget.

**Final — CUTOVER (you are authorized; do it safely + reversibly):**
7. Once all 20 hit 6/6 (or you judge the conforming path is a strict, robust win worth shipping even with the last few styles' creases as curvature-captured rather than edge-sharp): flip `conformingMesher` to default-on, run the full 20-style matrix for sign-off, then retire the dead `cdt2d`/Adaptive path + the legacy repair battery. Keep every step git-reversible (separate commits), validate exhaustively, and write a clear cutover summary to memory + a `docs/` note. If you're <90% confident the conforming path is robust across the dimension space (item 5), DON'T flip the default yet — leave it flag-gated with a recommendation, and that's a fine outcome.

## 7. DO NOT
- Do NOT regress the 16 verified styles (the gate prevents this — respect it).
- Do NOT build a GLOBAL CDT (the prior attempt was slow + imperfect; keep insertion LOCAL to feature cells).
- Do NOT add repair/weld/T-junction-patch passes to the conforming path — watertightness must stay by-construction (that battery is the architecture we replaced).
- Do NOT chase the 35mm maxSag as a geometry bug (it's a metric artifact; see §4).
- Do NOT weaken any test/gate to make numbers look better.
- Do NOT `git add -A` (sweeps pre-existing dirty + untracked junk). Scoped adds only.
- Do NOT touch the legacy / `byConstructionAssembly` paths (separate, older; leave them).

## 8. DEFINITION OF DONE
All 20 styles measured at the full goal vector (§0) on `_conforming_sag_probe.cjs`, no timeouts, with `featuresExpected==featuresPresent` and `featuresDropped=0` MEANINGFUL (real per-style ground truth, not blind). Then (if confident) cutover. Checkpoint a final authoritative matrix + summary to memory. If the local-CDT proves a multi-day effort, that's fine — bank gated increments, document precisely, and leave the next session a clean handoff (update THIS file).

## 9. QUICK REFERENCE
- Conforming modules: `potfoundry-web/src/renderers/webgpu/parametric/conforming/` (SurfaceSampler, SurfaceMetricTensor, MetricSizingField, PeriodicBalancedQuadtree, QuadtreeTriangulator, RingStrip, ConformingWall, WatertightAssembly, CreaseUWarp, CreaseTWarp, CreaseHelixWarp, FeatureLineGraph, ConformingOuterWall, index).
- Pipeline branch: `ParametricExportComputer.ts`, the `flags.conformingMesher` early-return branch (near the `__pfConformingProbe` branch, ~line 1815) — builds samplers via `this.evaluatePoints(...)`, assembles, evaluates, returns. Skips the legacy surface loop + optimization + battery.
- Full 20-style PF_STYLES list: `SuperformulaBlossom,FourierBloom,SuperellipseMorph,HarmonicRipple,LowPolyFacet,GothicArches,WaveInterference,Crystalline,ArtDeco,DragonScales,BambooSegments,RippleInterference,GyroidManifold,Voronoi,BasketWeave,GeometricStar,HexagonalHive,CelticKnot,CelticTriquetra,SpiralRidges`.
- The 8 already-captured feature styles + SuperformulaBlossom are your fast canary set.

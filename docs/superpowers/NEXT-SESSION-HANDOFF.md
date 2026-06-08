# NEXT-SESSION HANDOFF — CAD-Grade Parametric Export (autonomous, full-day run)

**You are continuing a multi-session effort to bring PotFoundry's parametric mesh export to Grasshopper/Rhino CAD quality.** The user (Patryk) is away for a full day/night and has granted you authority to handle ALL critical work and decisions autonomously. Work continuously. Don't wait for input — make sound, evidence-backed decisions, commit working increments, and document as you go. He trusts you; honor that with rigor, not recklessness.

Branch: `refactor/core-migration`. Project: `potfoundry-web/` (the active app — NOT the worktree's Python app).

---

## 0. THE GOAL (per generated mesh, all 20 registered styles)
```
sliverCount = 0    boundaryEdges = 0    nonManifoldEdges = 0    orientationMismatches = 0
featuresExpected == featuresPresent    featuresDropped = 0    + no timeouts, CAD-grade fidelity
```

## 1. CURRENT STATE — verified & committed (do not re-derive; trust + spot-check)
A from-scratch **watertight-by-construction conforming mesher** replaces the old non-conforming sweep + 1,100-line repair battery. It is behind a flag (`conformingMesher` / `window.__pfConforming`); **the legacy path is untouched** and is the production default until cutover.
- **All 20 styles: `orient=bnd=nonMan=sliver=0`, maxAspect ≤ 36, no timeouts** (build 2–6s). Proof: `potfoundry-web/e2e/final-matrix.log`.
- **16/20 styles at FULL 6/6** (incl. verified `featuresDropped=0`): 8 with real captured creases (LowPolyFacet, GothicArches, BasketWeave, SpiralRidges, GeometricStar, DragonScales, BambooSegments, CelticTriquetra) + 8 genuinely smooth (SuperformulaBlossom, FourierBloom, SuperellipseMorph, HarmonicRipple, WaveInterference, RippleInterference, Crystalline, ArtDeco).
- **4 remaining** (topology-perfect but features not captured): **HexagonalHive, CelticKnot, Voronoi, GyroidManifold**. PROVEN (read-only, mathematically) that their crossing/closed-loop/braided creases CANNOT be done by the topology-preserving warp family — they need **local CDT general insertion** (+ Tier-2 sampled extraction for Voronoi/Gyroid).
- Architecture: GPU evaluates the WGSL surface (source of truth = matches the live preview); CPU builds topology (metric-warped 2:1-balanced quadtree → intrinsic periodic seam → uniform shared-ring assembly → topology-preserving crease warps). 14 modules in `potfoundry-web/src/renderers/webgpu/parametric/conforming/`, 180 unit tests.

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

## 6. THE WORK (priority order; you decide the depth/sequencing)
**Primary — get the last 4 styles to 6/6 (Plan 4):**
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

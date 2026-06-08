# NEXT-SESSION HANDOFF — CAD-Grade Parametric Export (autonomous, full-day run)

**You are continuing a multi-session effort to bring PotFoundry's parametric mesh export to Grasshopper/Rhino CAD quality.** The user (Patryk) is away for a full day/night and has granted you authority to handle ALL critical work and decisions autonomously. Work continuously. Don't wait for input — make sound, evidence-backed decisions, commit working increments, and document as you go. He trusts you; honor that with rigor, not recklessness.

Branch: `refactor/core-migration`. Project: `potfoundry-web/` (the active app — NOT the worktree's Python app).

---

## 0. THE GOAL (per generated mesh, all 20 registered styles)
```
sliverCount = 0    boundaryEdges = 0    nonManifoldEdges = 0    orientationMismatches = 0
featuresExpected == featuresPresent    featuresDropped = 0    + no timeouts, CAD-grade fidelity
```

## 1. CURRENT STATE — verified & committed (UPDATED 2026-06-08n; do not re-derive; trust + spot-check)
A from-scratch **watertight-by-construction conforming mesher** replaces the old non-conforming sweep + 1,100-line repair battery. It is behind a flag (`conformingMesher` / `window.__pfConforming`); **the legacy path is untouched** and is the production default until cutover.
- **20/20 at DEFAULT dims** (full 6/6) AND **GAP 1 (dimension-space) PARTLY FIXED.** This session's commits: `4275a6d` GAP 1 root cause proven; `3367c8e` GAP 2+Voronoi→20/20; `1f6a53c` GAP 1 uBias foundation; `a570db9` GAP 1 uBias wired (gated); `1758087` cap-inflation fix; `dfc985d` GAP 1 STEP 3a (feature insertion uBias-aware; inserted styles still DEFERRED). **THE SINGLE UNIFIED REMAINING GAP-1 PIECE = LOCAL/DIRECTIONAL ANISOTROPY** (see §5b NEXT): every style still failing short-wide (Crystalline 55, ArtDeco 3496, Gyroid 95, Voronoi 63, Hex 4 slivers) fails for the SAME reason — a global B that is 0-at-default can't correct cells whose LOCAL √E/√G/2^B is still too high. A per-cell u-only split (independent uLevel/tLevel in the quadtree) fixes them all; it's the biggest remaining change and the path to cutover.
- **GAP 1 (uBias anisotropic foundation):** a global anisotropy bias B makes a level-L leaf span Δu=1/2^(L+B), Δt=1/2^L → 3D-near-square cells on wide/flat pots (the GAP 1 root cause is square cells → √E/√G:1 slivers). B is GATED on the relief-free base shape anisotropy `median(2π·r/√G)` → **B=0 at default for ALL 20 styles (TRUE no-op, byte-identical to the 20/20 matrix — `e2e/regress-20-ubias-default-2026-06-08l.log`)**; only wide/flat pots get B>0. **SHORT-WIDE (H40/OD300) now: warps FIXED** (GothicArches 2.9M→0 slivers, LowPolyFacet 615k→0, BasketWeave 2.1M→0) **+ gentle smooth PASS.** STILL FAIL short-wide: pervasive-relief smooth (Crystalline 28k→55, ArtDeco 559k→3496 — global B caps at 3, their cells need B4-5 everywhere → need LOCAL/directional anisotropy) + the INSERTED styles (deferred B=0: FeatureConformingTriangulator not yet uBias-aware — STEP 3). Other dimspace configs (tall-narrow/no-drain/high-flare/twisted) are B=0 (gate) so UNCHANGED from the GAP-2 dimspace state. **CUTOVER: still NOT ready** (short-wide residuals on ~6 styles + inserted twisted needle). Leave flag-gated. See §6 for the remaining GAP-1 plan.
- **All 20 styles at default: `orient=bnd=nonMan=sliver=0`, maxAspect ≤ 50.3, no timeouts.** Full regression: `potfoundry-web/e2e/regress-20-2026-06-08l.log`.
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

**STATUS 2026-06-08l: GAP 2 + Voronoi DONE → 20/20 at default dims (committed 3367c8e).** Grid-line
vertex registry + unguarded edge-snap fixed the tangent T-junction class AND the residual (u,t)
needles. Full 20-style matrix all clean (`e2e/regress-20-2026-06-08l.log`). Dimspace re-check
(`e2e/dimspace-inserted-2026-06-08l.log`) CONFIRMED GAP 2 closed the high-flare bnd cracks +
tall-narrow cracks; the remaining short-wide/twisted failures are all GAP-1 aspect slivers.

**STATUS 2026-06-08n: GAP 1 uBias FOUNDATION DONE for warps+smooth (commits 1f6a53c, a570db9, 1758087).**
A global anisotropy bias B makes a level-L leaf span Δu=1/2^(L+B), Δt=1/2^L → 3D-near-square cells on
wide/flat pots. **STEP 1 (1f6a53c):** `PeriodicBalancedQuadtree`+`QuadtreeTriangulator` uBias-aware
(root=2^B×1 grid; u-index/wrap via 2^(level+B); t + pin/levelCap unchanged). B=0=PERFECT no-op. 5 unit
tests (`QuadtreeUBias.test.ts`). **STEP 2 (a570db9):** `assembleWatertight.computeUBias` is GATED +
relief-aware: B=0 unless the BASE shape anisotropy `median(2π·r/√G)` > AREF·√2≈4.24 (a genuinely
wide/flat pot); only THEN B=clamp(round(log2(median(√E/√G)/3)),0,4). **The gate on the relief-FREE
base anisotropy is essential — plain median(√E/√G) tripped B=1 at DEFAULT for ripple styles
(HarmonicRipple), changing their mesh. The gate ⇒ TRUE no-op: all 20 byte-identical at default
(`e2e/regress-20-ubias-default-2026-06-08l.log`).** nRingActual from `outer.bottomRing.length`; DEFERS
B=0 when outerFeatureLines present (inserted styles). **STEP 2b (1758087):** `pinBoundaryLevel =
log2(nRing)−uBias` keeps nRing=256 (no cap inflation) — GothicArches short-wide 1.16M→720k tris,
maxAspect 63.5→10.4. **SHORT-WIDE FIXED: GothicArches 2.9M→0, LowPolyFacet 615k→0, BasketWeave 2.1M→0,
gentle smooth PASS.** **STILL FAIL short-wide:** Crystalline 28k→55, ArtDeco 559k→3496 (PERVASIVE
relief — cells √E/√G:1 EVERYWHERE need B4-5, but a 0-at-default B caps at 3 since the default→short-wide
span is only ~3 anisotropy bits) + inserted styles (deferred). Non-short-wide dimspace configs are B=0
(gate) ⇒ unchanged. **NEXT (GAP 1 remaining, priority):**
  (a) **LOCAL/directional anisotropy** — the proper fix for Crystalline/ArtDeco (and the cleanest for
      inserted too): per-cell u-ONLY split where the LOCAL √E/√G/2^B still exceeds the sliver bound. No-op
      at default (default cells don't exceed the bound). Needs independent uLevel/tLevel in the quadtree
      (kd-tree-ish) — the biggest remaining change; do with TDD + the QuadtreeUBias guard.
      (a) IS THE UNIFIED FIX — local √E/√G/2^B > bound is EXACTLY why Crystalline/ArtDeco AND the inserted
      styles (Gyroid 95, Voronoi 63, Hex 4) still sliver short-wide after the global B. Implement it with
      TDD against the QuadtreeUBias guard + the Gap1FoundationAspect guard. After it lands, the residual
      slivers should vanish for all of them.
  (b) **STEP 3a DONE (commit dfc985d): `FeatureConformingTriangulator` IS uBias-aware** (cellSet/neighbour/
      wrap via 2^(level+B); geomOf sizeU/sizeT; ANISOTROPIC cornerSnapU=cornerSnap/2^B vs cornerSnapT,
      per-axis snaps/posTol/resolver; uBias=0 byte-identical, gated by the 6 insertion tests + a new
      anisotropic-loop test). **REMAINING (3b): un-defer inserted styles** — blocked by a residual
      **bnd=6 T-junction crack on CelticKnot's BRAIDS** under anisotropy (Gyroid/Voronoi/Hex were bnd=0;
      only braids crack — the loop unit test has no CROSSINGS so missed it). FIRST repro a CROSSING loop
      (two arcs that cross → planarize Steiner) inserted into an anisotropic quadtree at the UNIT level,
      find the asymmetry (likely the Steiner/registry interaction under sizeU≠sizeT), fix, THEN flip the
      `hasFeatures?0` defer in `assembleWatertight`. NB even with bnd fixed, inserted still need (a) for
      their residual slivers.
  (c) **Twisted** (inserted styles, spinTurns=2.5) = SEPARATE F-shear sub-issue: F≠0 shrinks the cell
      area (EG−F²→0) → slivers; uBias (E/G scaling) doesn't fix shear. Needs metric-ALIGNED (rotated)
      cells. Narrower; defer.
  (d) Then re-run the full dimspace probe (all styles × all configs) → cutover decision.

**STATUS 2026-06-09: LOCAL/DIRECTIONAL ANISOTROPY (5b-a) IMPLEMENTED → CONCLUDED → DISABLED (opt-in).**
The per-cell u-only split was designed (design+adversarial workflow: 4 architects→3 judges→3 skeptics;
the naive design had 13 fatal holes, all patched → vetted blueprint `plans/2026-06-08-gap1-directional-anisotropy-blueprint.md`)
and implemented in full (commits `e17744d`+`60dbb87`: `PeriodicBalancedQuadtree` gains per-leaf `uExtra`/
effective-u-level eUL, both-axis 2:1 balance, registry N-mid transition template; 8 stages,
`Gap1DirectionalRefine.test.ts`, 230 unit tests green, adversarially reviewed — watertight/T-junction-free
under directional cells). **It is a PROVEN true no-op at default (all 20 byte-identical e2e
`e2e/regress-20-directional-default-2026-06-09.log`) BUT the e2e on the REAL short-wide residuals showed it
neither delivers nor is safe, so it is now OFF by default (opt-in `directionalRefine:true`; commit `ba562c4`):**
  - **Crystalline short-wide: 0 splits, sliver=55 unchanged.** Its residual cells are **F-SHEAR** (physW≤physH),
    correctly skipped by the `physW>physH` long-axis guard. The synthetic rippled-cylinder analogue (F≈0) was
    u-long and got fixed — but the REAL GPU surface is F≠0. **The blueprint's "residuals are u-long" efficacy
    assumption was WRONG for the real surfaces.**
  - **ArtDeco short-wide: BUILD TIMEOUT (>180s).** Its cells ARE u-long so the trigger fires, but the both-axis
    eUL-balance cascade EXPLODES (a u-split propagates as a vertical stripe through the whole t-column — the
    exact risk the design review flagged). With directional OFF, ArtDeco short-wide now builds in ~60s
    (`e2e/_shortwide_probe.cjs`: sliver=3639, no hang).
  - **THE KEY KNOWLEDGE WIN:** the residual short-wide slivers (Crystalline 55, ArtDeco ~3639, Gyroid 95,
    Voronoi 63) are **F-SHEAR (EG−F²→0 area collapse), NOT orthogonal anisotropy.** u-only refinement is the
    WRONG TOOL — scaling Δu/Δt cannot un-shear a parallelogram. The real fix is **metric-ALIGNED / ROTATED
    cells** (cells rotated to the eigenvectors of the first fundamental form `[[E,F],[F,G]]`, sides scaled to
    the eigenvalues), the **SAME tool as the twisted case (5b-c)** — they unify. The directional code+tests
    are kept (revive only if a genuinely u-long residual appears AND the cascade is bounded).
  - **NEXT (the unified GAP-1 remaining piece):** rotated/metric-aligned cells. Start measurement-first — a
    TDD guard (mirror `Gap1FoundationAspect.test.ts`) proving F-shear (square aspect high BECAUSE of F; u/t
    scaling can't fix; rotated cell → aspect≈1), THEN orchestrate the rotated-cell architecture design.
  - **CUTOVER: still NOT ready (correct to stay flag-gated)** — short-wide F-shear residuals on ~4-6 styles.

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

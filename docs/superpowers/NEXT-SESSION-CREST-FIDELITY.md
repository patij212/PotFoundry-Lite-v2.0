# NEXT-SESSION HANDOFF — True-to-the-Mathematical-Model Export (crest serration, the last hard problem)

**Branch:** `refactor/core-migration`  **Project:** `potfoundry-web/` (the active app — NOT the worktree's Python app).
**Date written:** 2026-06-10, end of a very long session. Read this in full, then read the memory files it links before touching code.

---

## 0. THE MISSION (what "done" means)

Make the **exported mesh true to the mathematical model at the highest fidelity** — *no visible triangle edges / serrations on a fine print, all sharp features preserved exactly* — for **all 20 styles**, especially the **diagonal/helical/morphing-crest** styles (SpiralRidges, SuperformulaBlossom at high `sf_strength`, and their kin).

**Everything else is already solved and committed** (do NOT redo — see §2): watertightness 20/20, feature preservation (`featDrop=0`), STL/3MF/OBJ writers, UI wiring (Export → conforming + high + 3MF), smooth-surface fidelity, and the min-angle quality pass.

**The ONE remaining defect** (user-reported ground truth, reproduced + localized this session): the real exported `.3mf` of SpiralRidges has **SERRATIONS along the diagonal/helical ridge crests** — a sawtooth of stretched, near-degenerate triangles tracing the crest, even though 96%+ of the mesh is clean (median min-angle 38°).

**DEFINITION OF DONE:** on SpiralRidges + SuperformulaBlossom@`sf_strength=1` (then the other helical/morphing-crest styles), the exported outer-wall mesh has **NO sub-~15° triangles clustered on the crests** (the worst-triangle tail at crests is eliminated, not just the median), VISUALLY confirmed by a min-angle-tinted render (no red along crests) AND by a FAITHFUL chord-error metric (§3), while staying `sliver=bnd=nonMan=orient=0`, `featDrop=0`, and not regressing the 17 already-clean styles. Then re-measure the full matrix and update the UI quality panel to report the REAL conforming numbers.

---

## 1. THE BUG — PRECISE, MEASURED ROOT CAUSE (do not re-derive; trust + spot-check)

Read memory `project_crest_serration_sampler_cap.md` IN FULL first. Summary:

- **It is NOT the sampler resolution.** `ParametricExportComputer.ts:2154` hardcodes the surface sampler at `DENSE_RES_U = 256` (a 256×256 bilinear grid the mesher builds all topology from). The user reasonably suspected this. **MEASURED FALSE** (`e2e/_crest_diag.cjs`, SpiralRidges + SFB at denseRes 256 / 1024 / 2048, deep quadtree maxLevel 13 / sag 0.02 / budget 40M): triangle count ≈flat (940k→990k), **worst min-angle BYTE-IDENTICAL** (SpiralRidges 2.35°, SFB 4.68°) across all sampler resolutions, `%below-20°` flat (3.4→3.3). Raising the sampler does nothing.
- **It is NOT sag / budget / level either.** Those are already profile-driven (commit `9ca22fe`, `:2225-2235`): high → sag 0.05mm, maxLevel 12. Tightening them refines the bulk but leaves the crest-local stretched tail unchanged.
- **The REAL cause = triangle ORIENTATION at the crest.** A diagonal/helical ridge crest IS inserted as a real mesh edge (SpiralRidges `featPres=9`, helical-crease), but the axis-aligned (u,t) grid cells *beside* the diagonal crest get filled (per-cell CDT in `FeatureConformingTriangulator`) with long, thin triangles that span *across* the diagonal — because the refinement is isotropic-in-(u,t) and the crest runs diagonally through square cells. The sharp dihedral is under-resolved *perpendicular* to the crest → sawtooth silhouette. uBias squared cells on AVERAGE (median 38°) but cannot align to a DIAGONAL crest (uBias is axis-aligned anisotropy). **This is the ORIGINAL problem the whole conforming rebuild set out to solve, never closed for diagonal/helical/morphing crests.**
- **VISUAL PROOF:** `e2e/_zoom_probe.cjs` on SpiralRidges at default high → `C:/Users/patij212/AppData/Local/Temp/pf_spiral/SpiralRidges_wide.png`: red (sub-20°) triangles trace the diagonal helical crests; bulk is clean. (Re-generate it Stage 0; the file is scratch.)

---

## 2. WHAT IS ALREADY DONE — COMMITTED, VERIFIED (do NOT redo)

This session's commits on `refactor/core-migration` (newest first; `git log --oneline`):
- `289de23` UI: Export dialog defaults to **conforming + high + 3MF**; preview pipeline-compile timeout 8s→30s (`SceneManager.ts:246` — complex style shaders were blanking the live preview).
- `9ca22fe` **profile-driven export fidelity** — sag/minEdge/maxLevel now follow the quality profile (high=0.05mm). NOTE: its commit message over-claims "facet-free below printer resolution" — TRUE for smooth surfaces, **FALSE for diagonal crests** (this handoff). The code is fine; the claim was based on a reference-dominated metric (§3).
- `6aafe5b` **clean-CAD min-angle via default-dim anisotropy uBias + crease-coverage invariance** — `%below-20°` 33–69%→0.5–9.6% on 15 styles, watertight 20/20, `featDrop=0` 20/20. Real win for the *bulk*; the crest tail is what remains.
- `88c243c` `triangleQualityDistribution` metric + `diagnoseTriangleQuality` hook.
- 8 integration/CI commits (`c7e22eb`…`5835394`): goal-vector CI gate (all 20, no GPU), 3MF/OBJ format-bug fix, conforming flag toggle, `validationSummary`, integrity panel, real-mesh validation, self-intersection, decimation.

Verified solid (live WebGPU, this session): **20/20 watertight + featDrop=0 + 312 unit tests green**. Smooth surfaces are genuinely facet-free. Memory: `project_triangle_quality_gap.md`, `project_export_fidelity.md`, `project_export_cutover_state.md`, `project_conforming_mesher.md`, `project_cad_fidelity.md`.

---

## 3. ★ THE TRAP — BUILD A FAITHFUL INSTRUMENT FIRST (this is why I was fooled) ★

**I shipped a "facet-free / CAD-grade" claim that the user's real export disproved.** The cause: the serration metric (`src/fidelity/metrics.ts wallChordError` / `diagnoseSerration`) measures the mesh against the SAME 256-bilinear sampler used to build it → both staircase identically → ~0 deviation reported → the crest serration is INVISIBLE to the metric. Reference-dominated. The min-angle distribution also under-reports (the worst tail is a small % clustered at crests; median looks great).

**STAGE 0 — MANDATORY, before any fix: build a faithful crest-fidelity instrument** (per the user's measurement-first rule — they REJECT un-measured claims; see `feedback_audit_first.md`). It must read ≈0 on a plain pot and rise with serration. Three faithful signals, ALL required:
1. **VISUAL is ground truth.** Render the REAL exported outer-wall mesh with a per-triangle **min-angle tint** (red < 15–20°) at the crest region (`_zoom_probe.cjs` does this). The user's eyes already validated this; trust it over any scalar.
2. **Crest min-angle tail**, not median: `triangleQualityDistribution` p1/worst + the fraction of sub-15° triangles WITHIN a crest band (mask triangles near the inserted feature lines). Median is misleading.
3. **TRUE chord error** = mesh vs the **analytic surface** (or a reference MUCH finer than the mesh AND independent of the mesh's sampler). The existing `__pfReferenceDenseRes` decouples the reference — but verify it's actually finer than the crest feature, and ideally measure crest-NORMAL deviation, not radial. Do NOT trust any metric whose reference shares the mesh's 256 sampler.

If you propose a fix, you must show it moves THIS instrument (red disappears from the crest render + the sub-15° crest fraction → ~0), not the old reference-dominated number.

---

## 4. THE FIX DIRECTION — crest-aligned (anisotropic) triangulation

The crest needs triangles **fine PERPENDICULAR to the crest** (to resolve the sharp dihedral) and **coarse ALONG it** (it's smooth along its length) — i.e. **anisotropic, crest-aligned** elements. The current mesher is isotropic-in-(u,t) + axis-aligned uBias, which cannot align to a DIAGONAL crest. Candidate approaches (run a design+adversarial Workflow to choose — that pattern caught every prior trap; see §6):

- **A. Crest-local ribbon / ladder (most surgical):** along each inserted diagonal/helical feature polyline, build a thin structured strip of quads/triangles straddling the crest with **rungs perpendicular to the crest tangent**, sized to the cross-crest curvature; transition to the background grid via the existing registry. Keeps the rest of the mesher unchanged. Watertight-by-construction (the ribbon's outer edge is a registered boundary).
- **B. Metric-aligned / rotated cells along the feature (principled, harder):** drive refinement by the surface's **principal-curvature metric** (first/second fundamental form), with cells rotated to the curvature eigenvectors near the crest — the proper "CAD-grade anisotropic mesher" (what Rhino-class meshers do). This is the deferred "rotated cells" thread from the GAP-1 history (`project_conforming_mesher.md`) and the general true-to-model target. Bigger architectural step.
- **C. Curvature-direction-aware CDT in feature cells:** in `FeatureConformingTriangulator`, when a cell is crossed by a feature curve, insert Steiner points / choose diagonals so fill triangles run ALONG the crest, not across it (a quality-constrained, crest-aware CDT). Lighter than B, more than A.

HARD CONSTRAINTS (non-negotiable — the whole architecture exists for them): **watertight + T-junction-free BY CONSTRUCTION** via the grid-line vertex registry (any vertex on a shared cell edge must be an interior-INDEPENDENT, edge-local function so both neighbours derive bit-identical points — see how the crease-coverage fix did it, commit `6aafe5b` / `buildCreaseRefineLines`). **NO repair/weld/T-junction-patch passes** (that battery is what we replaced). Smooth styles must not regress.

Recommended sequence: A first (surgical, fastest to a measurable win), measure with the §3 instrument; if A can't fully kill the tail on morphing crests (SuperformulaBlossom petals change `m` with t), escalate to C, and keep B as the principled north star.

---

## 5. KEY FILES & DEV LEVERS

- **Conforming export config:** `src/renderers/webgpu/ParametricExportComputer.ts` — the `flags.conformingMesher` branch (~`:2085`). `DENSE_RES_U=256` (`:2154`, the sampler — NOT the lever), profile-driven `qMaxSag`/`qMinEdge`/`qMaxLevel` (`:2225-2235`), `conformingBudget` (`:2227`), `assembleWatertight(...)` call (`:2343`). Final vertices ARE GPU-evaluated on the TRUE surface (`evaluatePoints`, ~`:2369`) — positions are exact; the defect is topology/orientation, not position.
- **The triangulation core (where the fix lands):** `src/renderers/webgpu/parametric/conforming/FeatureConformingTriangulator.ts` (per-cell CDT + the grid-line registry), `ConstrainedCellTriangulator.ts`, `PeriodicBalancedQuadtree.ts` (+ the `creaseRefine`/`biasFreeU` mechanism from `6aafe5b`), `MetricSizingField.ts` (sizing — make it anisotropic for B/C), `FeatureLineGraph.ts` (`buildCreaseRefineLines`, the helical/crease loci), `CreaseHelixWarp.ts` (SpiralRidges helix), `WatertightAssembly.ts` (`computeUBias`, assembly).
- **Dev levers (globals; never set in production):** `__pfConformingDenseRes`, `__pfConformingMaxSag`, `__pfConformingMinEdge`, `__pfConformingMaxLevel`, `__pfConformingBudget`, `__pfConformingUBias`, `__pfConformingDirectional`, `__pfReferenceDenseRes` (decoupled metric reference), `__pfConforming` (force the conforming flag on for probes).
- **UI quality panel false metrics (secondary fix):** the export dialog shows min-angle 45° / aspect 3 / surface-error 0.05µm on a visibly-serrated mesh — it's surfacing legacy refinement targets, not the real conforming mesh. Wire it to the actual `validationSummary` + `triangleQualityDistribution`. `src/ui/controls/ExportPanel.tsx:170-211`, `ExportDialog.tsx`.

---

## 6. INSTRUMENTS, ENVIRONMENT, PLAYBOOK

**Probes (scratch, in `potfoundry-web/e2e/`, headed-WebGPU via `@playwright/test` run by node — NOT the MCP playwright):**
- `_zoom_probe.cjs` — min-angle-tint zoom render (red < bar) → THE visual instrument. `PF_STYLES=SpiralRidges node e2e/_zoom_probe.cjs`.
- `_crest_diag.cjs` — denseRes/quality sweep + crest min-angle (the run that disproved the sampler hypothesis).
- `_quality_baseline.cjs` — full-20 topo + quality + feat (the goal-vector matrix).
- `_visual_matrix.cjs` — topo+feat+qual+render per style. `_fidelity_sweep.cjs` — chord error vs quality tiers (note: reference-dominated; rebuild faithful per §3).
- `window.__pfFidelity` (gated `?fidelity=1`): `setStyle`, `setStyleParams({sf_strength})`, `setDimensions`, `diagnoseTopoQuality`, `diagnoseTriangleQuality`, `diagnoseFeatures`, `diagnoseSerration`, `diagnoseWallFidelity`, `_debugOuterMesh(target)`, `isReady`.

**ENVIRONMENT (these WILL bite):**
- Dev server on **:3003** (3001/3002 were stale this session): `cd potfoundry-web && npm run dev -- --port 3001` (it may land on 3003 if 3001 busy; check the log). Clear `node_modules/.vite` if `isReady` hangs.
- Probes are **headless:false** Chromium; do NOT pass `--enable-features=Vulkan` (forces a slow Dawn compile → 8–30s shader timeouts). Just `--enable-unsafe-webgpu`.
- The app pre-compiles style render pipelines on load; complex ones can be slow (raised the budget to 30s). **Style-18 preview-shader hung >30s** in the headed test env — verify whether real (a user-facing preview blank) or a cold-compile artifact.
- Background-task cwd resets to repo root; prefix absolute `cd .../potfoundry-web`. Run node probes from `potfoundry-web/`.
- **GitNexus MCP is unusable** (DB version mismatch) — ignore the "stale index" nags; gate via vitest/e2e/byte-identical instead.
- Headed-browser UI automation of the collapsible EXPORT accordion was flaky — the wiring is code-correct; a human clicking in a normal browser is the reliable path. Don't burn time auto-driving the dialog.

**PLAYBOOK (non-negotiable — `feedback_audit_first.md`):** Measurement-first — reproduce → prove root cause → fix → re-measure; NEVER claim done without probe output (the user rejected my un-measured claim — that's exactly why this handoff exists). Strict gating every commit: `npx vitest run src/renderers/webgpu/parametric/conforming/ src/fidelity/ --test-timeout=30000` green; `npm run typecheck`; `npx eslint <changed> --max-warnings=0`. TDD with synthetic samplers (`SyntheticCylinderSampler`) — the watertight two-cell conformance proof is the load-bearing unit test for any registry change. Scoped `git add` of explicit paths — NEVER `git add -A` (huge untracked scratch tree). No repair passes. Use a design+adversarial **Workflow** for the crest-triangulation architecture call.

---

## 7. SECONDARY TASKS (after the crest fix, or in parallel by a sub-agent)
1. **Quality panel false metrics** (§5) — show the REAL conforming numbers, not legacy targets.
2. **2 high-relief min-angle residuals** — FourierBloom (`%<20°` 24.8%), Crystalline (38.7%): already fire uBias GATE B; need relief-specific handling (likely the same crest-aligned work).
3. **Make DENSE_RES & budget reach 'ultra' from the UI** + confirm the slider visibly changes output (it moves, just not where it matters yet).
4. **CI cutover gates** — promote the goal-vector + a faithful crest-quality gate into CI; then flip `conformingMesher` default-on (`contracts.ts:412`) and retire the legacy battery.
5. **Style-18 preview-shader hang** (§6).
6. **Build-time perf** (the user said LAST): feature-dense styles build 60–236s at high fidelity; tile/decimate/parallelize later.

---

## 8. ★ ENGINEERED OPENING PROMPT FOR THE NEXT SESSION ★ (paste this)

> You are continuing the PotFoundry export effort on branch `refactor/core-migration`, project `potfoundry-web/`. **First action: read `docs/superpowers/NEXT-SESSION-CREST-FIDELITY.md` in full, then the memory files it links (`project_crest_serration_sampler_cap.md` first).** Do not write code until you have.
>
> **Mission:** make the exported mesh TRUE TO THE MATHEMATICAL MODEL at the highest fidelity — no visible triangle serrations on a fine print, all sharp features exact — for the diagonal/helical/morphing-crest styles (SpiralRidges, SuperformulaBlossom@sf_strength=1, and kin). Everything else (watertightness 20/20, features, formats, UI, smooth-surface fidelity) is DONE and committed — do not redo it.
>
> **The defect (measured, do not re-derive):** stretched, near-degenerate triangles tracing the DIAGONAL/HELICAL ridge crests — the axis-aligned (u,t) grid fills beside the inserted diagonal crest edge with triangles stretched ACROSS it. It is NOT the 256² sampler (measured: 256 vs 2048 = no change) and NOT sag/budget. It is triangle ORIENTATION at the crest — the original problem the conforming mesher never closed for diagonal crests.
>
> **Non-negotiable discipline (the previous session shipped a wrong "CAD-grade" claim by trusting a reference-dominated metric — do not repeat this):**
> 1. **STAGE 0 FIRST — build a FAITHFUL instrument before any fix:** a min-angle-tinted render of the REAL exported crest (red < 15°), the sub-15° triangle fraction WITHIN a crest band (not the median), and a TRUE chord error vs the analytic surface (reference independent of the mesh's 256 sampler). Prove it reads ≈0 on a plain pot and lights up red on the SpiralRidges crest. Trust the VISUAL as ground truth.
> 2. Reproduce → prove root cause on the instrument → fix → re-measure. NEVER claim "fixed/CAD-grade/facet-free" without showing the red gone from the crest render. The user rejects un-measured claims.
> 3. Watertight + T-junction-free BY CONSTRUCTION (grid-line registry; interior-independent edge-local shared-edge points — see commit 6aafe5b's `buildCreaseRefineLines`). NO repair/weld passes. Don't regress the 17 clean styles or break any unit test. Scoped `git add` only.
>
> **Fix path:** orient/refine the crest fill triangles ALONG the crest (anisotropic, crest-aligned) — fine perpendicular to the crest, coarse along it. Start with a crest-local ribbon/ladder of perpendicular rungs in `FeatureConformingTriangulator`; escalate to curvature-direction-aware CDT, with metric-aligned (rotated, principal-curvature-driven) cells as the principled north star. **Run a design+adversarial Workflow to choose the architecture before implementing** (that pattern caught every prior trap). TDD with `SyntheticCylinderSampler` + the two-cell watertight conformance proof.
>
> **Done when:** SpiralRidges + SuperformulaBlossom@1 exported outer wall has NO red (sub-15°) triangles on the crests (visual + crest-band metric), still `sliver=bnd=nonMan=orient=0`, `featDrop=0`, 17 clean styles unchanged, 312+ unit tests green. Then re-measure the full 20-style matrix, fix the UI quality panel to report the REAL conforming numbers, and update the memory + this handoff.
>
> Environment: dev server :3003 (`npm run dev -- --port 3001`), probes are headed `@playwright/test` via node from `potfoundry-web/` (NOT MCP playwright; no `--enable-features=Vulkan`). GitNexus MCP is unusable — ignore stale-index nags. Gate: `npx vitest run src/renderers/webgpu/parametric/conforming/ src/fidelity/ --test-timeout=30000` + `npm run typecheck` + scoped eslint.

---

*Honest status at handoff: watertight/feature/format/UI/smooth-surface fidelity = solid and shipped. Diagonal-crest serration = correctly diagnosed (measured), NOT yet fixed — it is the genuine last mile to "true to the mathematical model," and it is real R&D (crest-aligned anisotropic meshing), which is why it is being handed off with a clean, prompt-engineered starting point rather than rushed at the end of a long session.*

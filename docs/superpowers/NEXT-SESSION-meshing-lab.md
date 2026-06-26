# Meshing Research Lab — Next-Session Handoff (2026-06-26)

Built overnight, autonomously. Everything below is committed on `refactor/core-migration` (interleaved with
your concurrent Phase-2 mesher commits — no conflicts; lab files are isolated under `research/`, `.claude/`,
and `docs/`). Read order: this doc → the result doc → the ledger.

## What exists now (and how to use it)

**The lab** (`potfoundry-web/research/`, dev-only — `src/` never imports it):
- **Oracle harness:** `research/oracle/` (Python venv: gmsh 4.13.1 + Triangle 20230923). Setup once:
  `cd research/oracle && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt`.
- **TS bridge:** `research/bridge/` — `runStyle(styleId, dims, ['triangle'|'gmsh'], {tolMm, sizeRes, hMin, hMax, aniso})`
  → `ScoreRow[]`. Builds the per-style analytic `rA` (production-identical), a curvature sizing field
  (iso) or 2nd-fundamental-form metric (`aniso:true` → gmsh BAMG), runs the engine, and **measures with the
  project's own instruments** (`perpendicular3DDeviation` + `triangleQualityDistribution`).
- **Re-run the matrix:** `PF_REBASELINE=1 npx vitest run research/bridge/runAll20.test.ts` then
  `node research/bridge/classify.cjs` (H1/H2/H3 verdicts + table). ~22 min, CPU-only.

**The skills + agent** (`.claude/`): `tessellation-knowledge` (SOTA methods → your files+engines),
`meshing-research` (the measure-first/pre-registration protocol), `oracle-harness` (the driver), and the
`meshing-researcher` agent (dispatch for a self-contained investigation; returns a structured finding).
*Caveat:* the skills are authored, not yet subagent-pressure-tested (a `writing-skills` follow-up).

## The headline finding (see `2026-06-26-rebaseline-sota-vs-ours.md`)

**The in-house mesher's hardest open problem is solved by a transition-free Delaunay mesher — and it does NOT
need anisotropy.** gmsh achieves CAD-grade triangle quality (`%<20°` ≤ 5%) on ALL 5 tangled lattices
(gmsh-iso 0.8–3.8%, gmsh-aniso 0.0–1.7%) where the 2:1-balanced quadtree's transition templates produce the
density-invariant sliver gap. Even **isotropic** gmsh suffices — anisotropy is a triangle-EFFICIENCY lever
(0.06–0.59× the tris), and it can WORSEN quality on isotropically-high-frequency styles by over-stretching.

**Chord (the convergence probe, 3 sweeps):** the ~1mm chord on the tangled lattices is **density-IRREDUCIBLE** —
GyroidManifold chord p99 ≈ 0.93 mm is invariant across hMin (0.005→0.00125), metric resolution (sizeRes
48→192), AND iso density (tol 0.1→0.025), for both gmsh-iso and gmsh-aniso. A size-independent chord ⇒ the
worst facets **straddle a near-C0 relief step** (chord ≈ ½ the step height), not smooth sag — so it's the
project's **straddle / steep-relief accept-class**, needing the per-style `analyticSurfaceGate` crease/straddle
**exclusion** (this run omitted it), NOT more triangles. (Corrects the pre-registration: GyroidManifold is NOT
clean-chord.) Caveat: a lab-vs-production setup difference may also contribute (lab lifts gmsh's (u,t) via the
CPU `rA`; production warps + GPU-evaluates) — reconcile before any chord conclusion. **The quality leg is
exclusion-independent and is the clean, decisive result.**

## The roadmap (the decision this run informs)

**Replace `PeriodicBalancedQuadtree` + transition-fan templates with a transition-free constrained-Delaunay
mesher over the (u,t) domain under the surface metric.**
- **Isotropic-by-default** (gmsh-iso is quality-robust on all 20 — never worsened quality); add anisotropy
  **selectively** for directional styles (lattices) as an efficiency optimization, NOT universally.
- **Kernel:** the existing `metricDelaunayRefine.ts` spike (the synthesis's throwaway) is the prior attempt;
  per the synthesis it "handles smooth but not tangled — needs the true anisotropic in-circle." gmsh's BAMG
  proves the proper anisotropic-in-circle version works. So the build = a Ruppert/Chew quality loop with a
  metric (anisotropic) in-circle, seeded by `projectPointToRadialSurface`, using `cdt2d`/`@kninnug/constrainautor`
  (already shipped, transition-free) + the proven crossing-PSLG planarization. **gmsh is the dev-only reference
  oracle to validate each step against** (this lab).
- **Chord** is a separate sizing concern: fix the band-limited curvature grid (the `curvatureFloor` / denser
  metric), independent of the topology rebuild.

## Sharp de-risk experiments to run next (cheap, lab-only, high-information)
1. **Metric accuracy → chord:** raise the metric `sizeRes` (and/or wire analytic curvature) and confirm chord
   → CAD on the tangled lattices (the sizeRes sweep started this — see the result doc).
2. **`ours` vs SOTA (H2-full):** quantify the quadtree's slivers vs gmsh on the same styles. Concrete entry
   (found): `buildConformingOuterWall(styleSampler(styleId, params, {H,Rt,Rb}), opts)` returns
   `{ vertices:(u,t,0), indices }` — lift + measure exactly like the lab measures an oracle mesh. CAVEATS to
   handle for FAITHFULNESS: (a) supply the production conforming `opts` (maxSag/maxEdge/minEdge/gradeRatio/
   maxLevel/nRing — extracted as named consts in `ParametricExportComputer`); (b) this is the PRE-warp quadtree
   grid — the 2:1 transition templates (hence the slivers) ARE present, but the crease-warp is applied
   downstream in `WatertightAssembly`, so on warped tangled styles the 3D min-angles differ from production
   (apply the warp, or compare in (u,t) space, before drawing a head-to-head number).
3. **In-circle isolation:** does a metric-aware in-circle (vs Euclidean `delaunator`) on the SAME points close
   the quality gap? Isolates "points vs metric-triangulation" for the kernel build.

## Open items / honest status
- The skills need `writing-skills` pressure-testing.
- `.claude/` was untracked; I committed the 4 skill/agent files (the durable deliverable) — `git rm --cached` to revert.
- `ours` (production mesher) is not yet in the matrix (the most decision-relevant follow-up).
- Crease-exclusion-pending styles (‡ in the result doc): chord is an upper bound; quality verdicts unaffected.
- The next big arc (the mesher rebuild) is a DESIGN task — worth a `brainstorming` session with you (it touches
  production, needs GitNexus impact + flag-gating + watertight re-proof).

## Commits (this arc, all pathspec-scoped, byte-identical to production)
Spec/plan: design + Phase-1 plan. Lab: Tasks 0–6 (env, sizing field, exchange, adapters, measure, spike,
anisotropic metric), Task 8 (all-20 runner + classifier), the result doc + scorecard, the chord-convergence
probe. Skills + agent. Pre-registration. See `git log --oneline | grep meshing-lab` and the ledger
`.superpowers/sdd/meshing-lab-progress.md`.

# Meshing Research Lab — Design

**Date:** 2026-06-26
**Branch:** refactor/core-migration
**Status:** Design (approved sections; pending spec review)
**Context / predecessors:**
- `2026-06-15-export-fidelity-arc-SYNTHESIS.md` — the experiment ledger this lab generalizes; its roadmap §4.2 names the open problem ("only a full anisotropic local-metric Delaunay mesher can CAD-grade the 5 tangled styles").
- `2026-06-25-phase2-unified-mesher-design.md` — the current active frontier (whole-wall feature-following); a future *consumer* of this lab.
- `2026-06-24-dense-truth-validation-gate-design.md` — the dense-truth reference this lab reuses as ground truth.

---

## 0. TL;DR

Build a **meshing research lab**: a four-layer stack that turns this project's already-excellent measurement discipline into a compounding, expert, *scientific* capability for tessellation and 3D meshing.

1. **`tessellation-knowledge` skill** — SOTA theory (Delaunay/CDT, Ruppert/Chew, the Riemannian metric, CVT/ODT, quad fields, remeshing) mapped to *this project's* files and to the external engines, with a cited-or-measured epistemic rule.
2. **Oracle harness** — `gmsh` / `Triangle` / `libigl` (Python sidecar) + **Blender QuadriFlow** (via MCP) as ground-truth and prototyping engines, with a precision-safe PLY exchange format and a **one-metric-both-meshes** comparison that reuses the project's existing TS instruments.
3. **`meshing-research` skill** — the research protocol (hypothesis → cheapest discriminator → **pre-registered** falsification criterion → measure → classify → ledger → decide), canonizing the project's conventions, gates, controls, and hard rules.
4. **`meshing-researcher` subagent** — dispatched for deep self-contained arcs; returns a structured finding, not narration.

The lab is **dev-only**: nothing external ships, production stays pure-browser TS/WGSL, and `src/` never imports `research/`. It proves itself by running the **all-20 re-baseline** — the first objective, per-style map of how our mesher stands against the tools we want to rival, and a pre-registered verdict on whether our single hardest open problem is *already solved by an engine we can run today* (gmsh's anisotropic mesher).

**Build order (Approach A — foundation-first):** Phase 1 = harness + bridge + the `meshing-research`/`oracle-harness` skills + a seed `tessellation-knowledge` + the re-baseline run. Phase 2 = grow the knowledge skill from what the re-baseline measured, add the QuadriFlow/anisotropic recipes, ship the subagent.

---

## 1. Goal & motivation

Make this agent a genuine expert in tessellation/3D meshing **on this project**, working like a scientist: hypothesis → instrument → measurement → falsification → theory, with proven external engines as ground truth.

The gap is **not** rigor — the project has a perpendicular-3D chord metric, reference-free min-angle quality, watertight-by-index, per-triangle `TRI_SOURCE` attribution, window-global levers, ~70 GPU probes, and a spec→plan→evidence→synthesis paper trail. The gaps are:

1. **Domain knowledge on tap** — so algorithm choices are reasoned from the state-of-the-art instead of re-derived each session.
2. **Leverage of proven engines** — the project keeps re-deriving in TS/WGSL what Geogram/CGAL/gmsh/Triangle/instant-meshes already ship. The synthesis literally concludes the only remaining path is a "heavy anisotropic Delaunay mesher" — a *solved* problem in gmsh/BAMG.
3. **A codified, compounding research loop** — knowledge is generated faster than it is captured (~70 `_*.cjs` probes + dozens of root `*.txt` dumps); experiments should compound, not scatter.

## 2. The problem this solves (the gap, concretely)

- **Roadmap blocker:** 5 tangled-lattice styles (Gyroid, BasketWeave, CelticKnot, CelticTriquetra, Gothic-upper) are an accepted floor; the synthesis says eliminating them needs a heavy anisotropic mesher nobody has built. **We have never measured whether an existing SOTA engine clears it.** That is a cheap, decisive experiment we cannot currently run.
- **No SOTA reference frame:** we measure our mesher against the *analytic surface* (absolute chord) but never against *what the best tools achieve at the same budget*. We don't know, per style, whether we're near or far from best-in-class.
- **Knowledge attrition:** hard-won lessons (cdt2d non-planar PSLG crash → planarize; refinement creates transitions creates slivers; decimation injects slivers) live in scattered docs/memory, not a single authoritative, self-auditing reference.

## 3. Approach (A — layered, foundation-first) & why

Four capabilities as one stack, delivered in the order that produces a real measured result fastest:

> Build the instrument → take the measurement → let the theory (knowledge skill) be grounded in evidence from *our* surfaces → then scale (subagent).

Rejected alternatives: **knowledge-first** (risk of a beautiful textbook disconnected from our 20 styles; slowest to first result; violates measurement-first) and **harness-only** (doesn't deliver persistent expertise; knowledge doesn't compound; the subagent has nothing to stand on).

## 4. Architecture & on-disk layout

```
┌─ C4: meshing-researcher subagent ──────────────────────┐  dispatched for deep, self-contained arcs
│  ┌─ C3: meshing-research workflow skill ─────────────┐ │  hypothesis → discriminator → measure → ledger
│  │  ┌─ C1: tessellation-knowledge skill ───────────┐ │ │  SOTA theory, mapped to OUR files + engines
│  │  │  ┌─ C2: oracle harness ────────────────────┐ │ │ │  gmsh/Triangle/libigl + Blender ground-truth
│  │  │  │  Python sidecar  ⇄  TS bridge           │ │ │ │
│  │  │  └──────────────────────────────────────────┘ │ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

```
.claude/
  skills/meshing/
    meshing-research/SKILL.md        # C3 — research protocol (ENTRY point)
    oracle-harness/SKILL.md          # C2 — how to drive the engines + Blender
    tessellation-knowledge/SKILL.md  # C1 — SOTA theory (ONE skill to start; splits when large)
  agents/
    meshing-researcher.md            # C4 — the subagent

potfoundry-web/research/
  oracle/                            # C2 Python sidecar (code committed; .venv gitignored)
    requirements.txt                 # gmsh, triangle, libigl, numpy, scipy, trimesh, meshio (pinned)
    oracle.py                        # CLI: surface-in → {engine mesh, metrics} JSON-out
    adapters/
      gmsh_adapter.py
      triangle_adapter.py
      igl_adapter.py
    metrics.py                       # fast in-loop sanity ONLY (never authoritative)
    exchange.py                      # read/write the shared PLY exchange format
    configs/                         # gmsh_iso.json, gmsh_aniso.json, triangle_ruppert.json, ...
  bridge/                            # C2 TS side
    exportForOracle.ts               # probe-side: write {reference.ply, ours.ply, params.json}
    ingestOracleResults.ts           # read oracle mesh + JSON → comparison/report types
    scorecard.ts                     # assemble per-style/per-engine scorecard
  exchange/                          # working data (gitignored; regenerable) — see §6.3
  EXPERIMENT-REGISTRY.md             # living index/ledger over all experiments (generalizes SYNTHESIS)

potfoundry-web/e2e/probes/README.md  # NEW — catalog + naming convention for the ~70 existing _*.cjs
docs/superpowers/specs/.../evidence/ # UNCHANGED — keeps owning per-experiment evidence docs
```

**Light-touch choices (honor preserve-work, avoid churn):**
- Existing evidence docs and ~70 probes are **indexed, not relocated** (a registry + a probe catalog + a forward convention).
- The Python sidecar is **dev-only**, lives beside the `e2e/` probes that feed it, and never enters the Vite build or Cloudflare deploy.

## 5. C1 — `tessellation-knowledge` skill (true expertise)

Curated, decision-oriented. Every topic maps **theory → canonical reference → engine that implements it → our in-house counterpart file → known pitfalls**. Seeded topics (the load-bearing ones for the open problems):

| Topic | Canonical ref | Engine | Our counterpart | Canonized pitfall |
|---|---|---|---|---|
| Delaunay & CDT | Shewchuk (robust predicates), de Berg et al. | Triangle, gmsh | `cdt2d` usage, `ConstrainedCellTriangulator` | cdt2d crashes on non-planar PSLG → planarize |
| Quality refinement | Ruppert, Chew-2 | Triangle, gmsh | `CellQualityRefinement` | refinement *creates* transitions → slivers (exp. 10) |
| Sizing & Riemannian metric | Frey-George, BAMG | gmsh background metric | `SurfaceMetricTensor`, `PullbackMetric`, `MetricSizingField`, `computeUBias` | band-limited curvature grid under-sizes crests |
| CVT / ODT smoothing | Du, Lévy & Liu | gmsh, libigl | *(gap — none)* | — |
| Surface meshing & watertightness | Boissonnat-Oudot | gmsh | `WatertightAssembly`, `PeriodicSeamClosure`, `ConformingOuterWall` | u-seam f32/f64 strand flip |
| Quad & field-aligned | Bommes (MIQ), Jakob (Instant Meshes), QuadriFlow | Blender QuadriFlow | *(gap — none)* | — |
| Remeshing & decimation | Botsch-Kobbelt; Garland-Heckbert (QEM) | libigl, `meshoptimizer` | `decimateConforming` | decimation injects slivers (named defect class) |

**Epistemic-hygiene rule:** every claim is **cited** to a canonical source *or* **tagged `measured-in-project`** with its experiment id. No unsourced assertions. The skill is self-auditing as it grows.

**Seeding (Approach A):** Phase 1 seeds the skeleton + the Delaunay/CDT, quality, metric, and surface/watertight rows from canonical sources + targeted reads of the engine docs (via context7/web). Phase 2 deepens CVT, quad-fields, and remeshing **from what the re-baseline measures**. The two `(gap — none)` rows are explicit: the project has no CVT smoothing and no quad path — the re-baseline will quantify whether they matter.

## 6. C2 — Oracle harness (the technical core)

### 6.1 Engines

| Engine | SOTA capability | Tests which question | Install |
|---|---|---|---|
| **gmsh** | Frontal-Delaunay quality + **anisotropic background-metric fields** (BAMG/MeshAdapt 2D) | the synthesis's central claim | `pip install gmsh` (wheel incl. SDK + Python API) |
| **Triangle** | 2D CDT + Ruppert/Chew quality, min-angle guarantee, robust predicates | transition-free quality CDT | `pip install triangle` |
| **libigl** | isotropic remeshing, principal curvature, LSCM/ARAP | remeshing ceiling; curvature sizing | `pip install libigl` |
| **scipy/Qhull** | Delaunay / Voronoi | Voronoi ground truth | `pip install scipy` |
| **trimesh / meshio** | lossless mesh + attribute I/O | the exchange backbone | `pip install trimesh meshio` |
| **Blender** | **QuadriFlow** field-aligned quad remesh, voxel remesh, render | the "rival Blender/Rhino" **edge-flow** oracle | already live via MCP |

No C++ toolchain present → CGAL/Geogram/instant-meshes (source builds) are out of scope for now; the wheel engines + Blender cover the needed algorithm families.

### 6.2 Two data paths (both scientifically distinct, both valuable)

1. **Mesh-from-surface** (the real SOTA test): export a dense `(u,t,x,y,z)` sampling of the true surface. gmsh/Triangle mesh the **(u,t) parameter rectangle** under the **first-fundamental-form metric** (E,F,G — the pullback metric supplied to gmsh as a per-node anisotropic background field). Each resulting `(u,t)` vertex is **lifted to 3D by bilinear interpolation of the dense reference grid**. This *is* the "heavy anisotropic mesher" the roadmap says we'd have to build — but gmsh already is it, so we measure before building.
2. **Remesh-the-truth** (remeshing/quad test): hand the dense reference mesh to libigl/Blender; they remesh to a comparable budget.

### 6.3 Exchange format (language-neutral, precision-safe)

Binary **PLY** (preserves f32/f64; `meshio` reads/writes with custom vertex attributes; **no implicit re-weld** on I/O so watertight-by-**index** survives). The reference carries `(u,v)` as vertex properties to enable the §6.2 lift.

```
research/exchange/<style>/            # gitignored, regenerable
  reference.ply                       # dense-truth surface: xyz + (u,v) vertex props (ground truth)
  ours.ply                            # our production OUTER-WALL surface patch (the candidate)
  params.json                         # { style, dims, budgetTris, denseN, units, gitSha, mesherFlags }
  oracle/<engine>/<config>/
    mesh.ply                          # the engine's output (lifted to 3D for mesh-from-surface)
    config.json                       # exact engine params + seed + engine version
    engine_metrics.json               # fast in-loop sanity metrics + wall-clock (NOT authoritative)
```

### 6.4 The load-bearing control — one metric, both meshes

The **authoritative** comparison is **TS-side**. The oracle's `mesh.ply` is ingested via `ingestOracleResults.ts` and measured with the project's **existing, CI-trusted instruments** — `perpendicular3DDeviation`, `crestBandTriangleQuality`, and the by-index crack/non-manifold check — against the **same** `reference.ply` as our own mesh. No re-derived metric, no confound, apples-to-apples by construction. Python `metrics.py` exists only for fast in-loop sanity and never decides anything.

### 6.5 Reproducibility (non-negotiable)

Every oracle run records engine version + exact config + seed + input git sha in `config.json`. gmsh RNG seed pinned (`Mesh.RandomSeed`); Triangle is deterministic. Any number in the registry is re-runnable from its directory alone.

### 6.6 Separation of concerns / Blender

Three uncoupled stages: **GPU Playwright probe** produces `reference.ply` + `ours.ply` (real WebGPU `evaluate_vertices` — the faithful-gate lesson; must reach `browser.close()`); **offline engines** consume files; **TS bridge** ingests + measures. Blender is the one *interactive* oracle — driven through the MCP tools by a **recipe** (documented in `oracle-harness/SKILL.md`): import `reference.ply` → QuadriFlow remesh to target face count (and/or voxel remesh) → export `mesh.ply` → render a viewport image for the visual gate. If Blender is not connected, the Blender oracle is skipped and logged (graceful).

### 6.7 CLI contract (`oracle.py` — stateless, file-in/file-out, no network)

```
python oracle.py mesh  --in research/exchange/<style> --engine gmsh --config configs/gmsh_aniso.json
python oracle.py batch --root research/exchange --engine all --match-budget
```
`--match-budget` iterates the engine's size parameter (gmsh `MeshSizeFactor`; Triangle max-area `-a`; QuadriFlow target faces) by binary search until tri-count is within ±10% of `ours` for that style.

## 7. C3 — `meshing-research` skill (how we work)

The protocol, with the **pre-registration** upgrade:

1. **Hypothesis** — one falsifiable statement.
2. **Cheapest discriminator** — the existing lever or oracle that can kill it fastest, *before building anything*. (Rule #1 — the hardest-won lesson: cheap discriminators refuted two hypotheses *and* two built fixes last arc.)
3. **Pre-register the falsification criterion** — write the exact number that confirms/kills it *before running*. Makes post-hoc rationalization impossible.
4. **Run** under standing controls — never vary sampling-res and mesh-density together (denseN confound); measure on real WebGPU; reach `browser.close()`.
5. **Measure** with the shared instruments — one metric, all meshes.
6. **Classify** — confirmed / refuted / no-op.
7. **Record** in `EXPERIMENT-REGISTRY.md`; commit. Refuted results are preserved — they are the most valuable.
8. **Decide** — next experiment, or productionize (flag-gated, byte-identical-off, GitNexus impact, watertight re-proof).

Canonized quick-reference (carried in the skill): the **lever inventory** (`__pfConforming*`: `UniformLevel`, `MaxSag`, `NRing`, `UBias`, `Efg`, `MinEdge`, `MaxLevel`, `Budget`; `__pfSurfaceFidelityExact`; `__pfReferenceDenseRes`/`Bicubic`; `?fidelity=1`); the **gates** (τ(p) curvature-relative chord, θ_min=20°, A_max≈4.76, watertight-by-index, vertex faithfulness ≤ f32 floor); the **controls** ("synthetic proxies validate mechanism + direction, not magnitude — the real-style GPU sweep decides"); **GPU hygiene**; the **hard rules** (§11).

## 8. C4 — `meshing-researcher` subagent

Custom agent at `.claude/agents/meshing-researcher.md`, pre-loaded with the protocol (→ `meshing-research`), pointers to `tessellation-knowledge` + `oracle-harness`, the lever/probe/gate inventory, the exchange contract, and the §11 hard rules.

- **When dispatched:** a deep, self-contained arc (e.g. "test H1 for BasketWeave with gmsh-aniso"; "run the H3 quad sweep across the 5 tangled styles").
- **Returns:** a **structured finding** — `{ hypothesis, discriminator, preRegisteredCriterion, rawNumbers, classification: confirmed|refuted|no-op, recommendation }` — its final message *is* the deliverable, not narration.
- **Tools:** Read/Grep/Glob/Edit/Write, Bash (oracle.py, npm, playwright), Playwright MCP (GPU probes), Blender MCP (QuadriFlow), GitNexus (impact).
- **Parallelism rule:** CPU oracle work fans out safely; **GPU probes serialize** (contention + GPU hygiene). "One agent per engine-config" is fine; "many concurrent GPU probes" is not.

## 9. The proving ground — all-20 re-baseline experiment

The first thing the lab does; exercises all four components and produces a decision-changing result.

**Two questions:**
1. **Calibration** — per style, how does our mesher compare to best-in-class engines on the same instruments at a comparable budget?
2. **The open claim** — for the 5 tangled styles, does any SOTA engine (especially gmsh-aniso, which *already exists*) achieve CAD-grade chord **and** quality where 10 in-house experiments could not? If yes, "we'd have to build a heavy anisotropic mesher" is **refuted** and that algorithm becomes the port target.

**Ground truth = two reference points per style:** `reference.ply` (geometric truth; facet→this = absolute chord) and the best engine's numbers (the SOTA target; "how far behind the best tool are we" — same geometry, different meshing).

**The matrix** — 20 styles × these configs (all measured TS-side vs `reference.ply`):

| Config | Represents |
|---|---|
| `ours` (production, default flags) | the subject |
| `gmsh:frontal-iso` (curvature-sized) | isotropic quality baseline |
| **`gmsh:aniso-metric`** (background metric = pullback E,F,G) | **the SOTA surface-meshing test — key for tangled** |
| `triangle:ruppert` (min-angle 20–30°, in (u,t)) | transition-free quality |
| `blender:quadriflow` (field-aligned quad remesh) | edge-flow / "rival Blender" |

**Controls:**
- **Equal-budget** — each engine iterated to within ±10% of `ours`'s tri-count per style (quality at unequal density is meaningless). Each engine's unconstrained native-best is also recorded.
- **Scope = the outer-wall surface patch**, not the closed solid. `ours.ply` is the wall patch (a probe-side hook dumps it pre-assembly). The metric is interior-crack/non-manifold-freeness + chord + min-angle. Full-solid watertightness stays the separate production gate.

**Pre-registered hypotheses (committed to the registry *before* the run):**
- **H1 (open claim):** *No SOTA engine achieves both chord p99 ≤ τ(p) and %<20° ≤ 5% on the 5 tangled styles at our budget.* **Refuted if** any engine hits both on any tangled style → port that algorithm; roadmap pivots. **Confirmed if** all also fail on all 5 → "accept-floor / build-heavy" becomes quantitatively justified, with *how* the best tools fail measured.
- **H2 (calibration):** *Our mesher is within 2× of the best engine's chord on the 15 tractable styles.* Refuted → low-hanging fruit on styles thought solved.
- **H3 (edge-flow):** *QuadriFlow field-aligned edge-flow materially reduces slivers on tangled styles vs our triangles at equal budget.* Tests the quad / "rival Rhino" direction.

**Protocol (the workflow skill, step by step):** pre-register → GPU probe (`reference.ply` + `ours.ply`) → oracle batch (budget-matched; Blender via MCP) → ingest + measure (shared instruments) → classify vs criteria → record (scorecard + verdicts + configs committed; a SYNTHESIS-style result doc) → decide (verdicts set the next arc).

**Scorecard schema** (`research/exchange/_scorecard.json`, summarized into the registry):
```json
{ "style": "BasketWeave", "budgetTris": 48000,
  "engines": {
    "ours":              { "chordP50": 0.0, "chordP99": 0.0, "pctUnder20deg": 0.0, "worstAngle": 0.0, "tris": 0, "interiorCracks": 0, "ms": 0 },
    "gmsh:aniso-metric": { "chordP50": 0.0, "chordP99": 0.0, "pctUnder20deg": 0.0, "worstAngle": 0.0, "tris": 0, "interiorCracks": 0, "ms": 0 }
  },
  "verdicts": { "H1": "pending", "H2": "pending", "H3": "pending" } }
```

**Deliverable:** the first objective per-style map of where we stand against the tools we want to rival, and a measured verdict on whether the single hardest open problem is already solved by an engine we can run today.

## 10. Testing — the lab must be trustworthy (TDD where it fits)

1. **Exchange round-trip** — known mesh → PLY → back → vertex/face identity preserved, no implicit weld (guards watertight-by-index).
2. **Instrument source-agnosticism** — the TS instruments give identical chord on geometrically-identical meshes regardless of origin (guards one-metric-both-meshes).
3. **Engine smoke tests** — each adapter meshes a flat patch + sphere cap → sane tri-count, chord≈0 on flat (guards "engine actually installed + wired").
4. **Determinism** — same input+config → identical mesh (Triangle; gmsh pinned seed).
5. **Budget-matcher** — iterate-to-target converges within ±10% on a known case.
6. **Production isolation** — a guard test that nothing under `src/` imports `research/`; the lab cannot touch the Vite build or shipped export.

## 11. Standing constraints (honored throughout)

- **Dev-only, flag-gated, byte-identical-when-off.** The lab never alters production export; the GPU probe uses existing diagnostic flags only.
- **Preserve work** — commit WIP/partial with honest status; never `git revert`/`restore` to discard; refuted experiments are kept.
- **Commit hygiene** — scope each `git add` to the task's files; never stage the pre-existing dirty WIP hunks in `ConformingWall.ts` / `WatertightAssembly.ts` / `PeriodicBalancedQuadtree.ts` / `ParametricExportComputer.ts` / `windowHook.ts`.
- **GitNexus** — re-index if stale; `impact({target, direction:'upstream'})` before editing any production symbol; `detect_changes()` before commit; warn on HIGH/CRITICAL. (The lab is additive — low impact — but this binds the moment we port an algorithm into the mesher.)
- **GPU/process hygiene** — probes reach `browser.close()`; reap orphaned chromium + dev-server PID trees; leave the user's Program Files Chrome; serialize GPU probes.
- **Per-task opus review + independent verification; audit by INDEX not position; non-vacuous controls.**
- **Python isolation** — `.venv/` gitignored, `requirements.txt` pinned + committed; one-line setup documented in `oracle-harness/SKILL.md`.
- **Branch** — additive tooling → build on `refactor/core-migration` (or an isolated `lab/meshing-research` worktree; `using-git-worktrees` available).

## 12. Build sequence

**Phase 1 — foundation + proof:**
1. Python sidecar scaffold: `requirements.txt` (pinned) + venv setup + `exchange.py` (PLY r/w with uv attrs, no-weld) + `metrics.py` (sanity). Tests: exchange round-trip, determinism stub.
2. Adapters for the re-baseline matrix: `triangle_adapter.py` (deterministic, simplest first) → `gmsh_adapter.py` (iso, then aniso background metric). Engine smoke tests each. (`igl_adapter.py` + scipy/Voronoi are Phase 2 — not in the proving-ground matrix, so they cannot block the re-baseline.)
3. `oracle.py` CLI + `--match-budget` binary search. Budget-matcher test.
4. TS bridge: `exportForOracle.ts` (probe hook dumping the wall patch + dense reference) + `ingestOracleResults.ts` + `scorecard.ts`. Instrument source-agnosticism test; production-isolation guard.
5. Skills: `meshing-research` + `oracle-harness` (authored per `writing-skills`); seed `tessellation-knowledge` (the four load-bearing rows).
6. Blender QuadriFlow recipe in `oracle-harness/SKILL.md`.
7. **Run the all-20 re-baseline** (§9): pre-register H1/H2/H3 → probe → oracle → measure → classify → registry + result doc.

**Phase 2 — expertise + scale:**
8. Grow `tessellation-knowledge` from the re-baseline's measured findings (split into sub-skills when large); fill the CVT/quad/remeshing rows.
9. Add anisotropic-gmsh and QuadriFlow sweep recipes/configs as first-class.
10. Ship the `meshing-researcher` subagent; validate it by reproducing one re-baseline verdict end-to-end.

## 13. Risks

| Risk | Mitigation |
|---|---|
| A pip wheel fails to install on this Windows/Python 3.11 | Triangle/scipy/trimesh/meshio are pure/portable; gmsh ships Windows wheels; libigl is Phase 2 (not in the proving-ground matrix) so it cannot block the re-baseline. Smoke tests catch any install failure immediately. |
| (u,t)→3D lift via bilinear interp adds error that confounds chord | The dense reference is high-res; quantify lift error on a known analytic patch (sphere cap) in the smoke test; raise denseN if non-negligible. |
| Budget-matching never converges for an engine | Cap iterations; record the closest achieved tri-count + flag the row as "budget-approx" in the scorecard (honest, not silent). |
| gmsh anisotropic field setup is intricate | Start iso (proven simple), add aniso as a separate adapter config; the iso result is already a useful baseline if aniso slips to Phase 2. |
| Blender not connected during a run | Blender oracle skipped + logged; the Python engines still produce a full scorecard. |
| Probe dumping the wall patch needs a new production hook | Prefer an existing diagnostic flag/internal; if a hook is needed it is dev-only + flag-gated + byte-identical-off (§11). |
| GPU degradation from orphaned chromium | Serialize GPU probes; reap per the hygiene rule; let probes reach `browser.close()`. |

## 14. Open questions / future (explicitly out of scope for Phase 1)

- **WASM production path** — deferred by decision (engines are dev-only oracles). Triangle has known WASM builds; revisit only if the re-baseline shows an engine decisively wins and a port is warranted.
- **CGAL / Geogram / instant-meshes (source builds)** — blocked on no C++ toolchain; revisit if a wheel/Windows binary appears or a toolchain is installed.
- **Server-side export** — out of scope (product-architecture change).
- **The targeted arcs the lab enables** — tangled-lattice anisotropic mesher, whole-wall feature-following (Phase 2 mesher) — are *consumers* of this lab, each its own spec→plan cycle.

## 15. Glossary / pointers

- **Chord (perp-3D):** facet→true-surface perpendicular distance; `perpendicular3DDeviation`. CAD-grade = p99 ≤ τ(p).
- **τ(p):** calibrated curvature-relative chord threshold; `src/fidelity/gateThresholds.ts`.
- **Tangled styles:** Gyroid, BasketWeave, CelticKnot, CelticTriquetra, Gothic-upper.
- **Pullback metric:** the surface's first fundamental form (E,F,G) used to mesh the (u,t) domain; `SurfaceMetricTensor`, `PullbackMetric`.
- **Dense-truth reference:** the high-res true-surface mesh used as ground truth; `2026-06-24-dense-truth-validation-gate-design.md`.
- **One-metric-both-meshes:** measure our mesh and every oracle mesh with the identical TS instrument vs the same reference.

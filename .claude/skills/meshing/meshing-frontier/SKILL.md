---
name: meshing-frontier
description: Use when a meshing/tessellation WALL blocks progress (a defect classified EXCLUDE/accept-class, an oracle ceiling, a "can't get there from here"), or when the task is to push a GROUNDBREAKING / novel result rather than test one specific hypothesis. The OPEN-problem / invention mode — upstream of the meshing-research falsification loop.
---

# Meshing Frontier — the open-problem / invention mode (PotFoundry)

## Overview
`meshing-research` CLOSES a hypothesis (falsify fast, measure, classify confirmed/refuted/no-op). That discipline is
why this project never ships a false victory — but it biases toward *closing* questions: hit a wall, label it
EXCLUDE, move on. This skill does the opposite job. It turns a wall INTO the thesis, generates diverse bold
approaches grounded in the literature + the oracles, races them, and picks the one that changes a load-bearing
ASSUMPTION — then hands the winner to `meshing-research` for ruthless validation.

**Core principle:** a wall is not a verdict — it is the most valuable research question in the registry. The frontier
move changes the **REPRESENTATION, the CONSTRAINT MODEL, or the METRIC SPACE — never a scalar lever.** Boldness
upstream, falsification downstream; you may skip neither.

## When to use (vs meshing-research)
| Situation | Skill |
|---|---|
| Wall / EXCLUDE / accept-class / oracle-ceiling / "can't get there from here" | **meshing-frontier** (here) |
| "Push a groundbreaking / novel result", no obvious approach | **meshing-frontier** first (ideate), then research (validate) |
| "Test whether X closes the gap" (a specific hypothesis) | `meshing-research` (falsification loop) |

## The loop
0. **Meta-synthesize the registry FIRST.** Read ALL of `research/EXPERIMENT-REGISTRY.md` (+ `docs/AGENT_CONTEXT_DISTILLED.md` §7). Name the pattern across the WALLS and across the WINS — the unifying pattern is usually the real thesis, and attacking one wall in isolation misses it. (This arc: every wall — u-seam, weave/braid occlusion, arch-apex junction, near-C0 crease, CPU↔GPU hash — was a DISCONTINUITY.) See `research/FRONTIER-THESIS.md` for the current standing thesis; update it.
1. **Frame the wall as the thesis.** State the load-bearing ASSUMPTION that is failing in one sentence (e.g. "we assume a feature is a straight (u,t) constraint chord — false across an occlusion step, so locking one cuts the surface").
2. **Steelman ≥3 fundamentally different approaches.** Each must change a DIFFERENT load-bearing assumption (representation / constraint model / metric space / algorithm class). Each must be GROUNDED — pull the SOTA (`WebSearch`, context7 via ToolSearch, the `tessellation-knowledge` skill, the `oracle-harness` engines). **No approach may be "tune the existing lever"** — that belongs to `meshing-research`, not here.
3. **Race them (idea tournament).** Use a **Workflow**: implement each as the CHEAPEST proxy that still exercises its mechanism, score on a FRONTIER target, judge with an independent panel, synthesize the winner + GRAFT the runners-up's best ideas. Diversity beats one-idea-iterated when the solution space is wide.
4. **Oracles as TEACHERS, not ceilings.** Don't just benchmark gmsh/Blender — MINE their mechanism and transplant it (QuadriFlow cross-field to seed ours; BAMG's metric-point decisions; libigl's intrinsic-Delaunay for the crossing-constraint wall). "The oracle scores 47°, we score 46.5°" is benchmarking, not invention.
5. **Hand the winner to `meshing-research`.** Pre-register a kill-criterion and validate on the real-style GPU sweep with the honest instruments. Ideation was divergent + kill-criterion-exempt; validation is convergent, measured, and honest. A bold idea is a HYPOTHESIS, not a result.
6. **Record** the frontier thesis, the tournament (incl. the losers — negative results narrow the frontier), and the winner in `research/EXPERIMENT-REGISTRY.md`; refresh `research/FRONTIER-THESIS.md`.

## Frontier targets — set a bar the current paradigm CANNOT hit
Invention only happens when the target is infeasible without a new idea. Good frontier targets:
- "make the weave/braid EXCLUDE class CONFORM (true-3D not worse + slivers down)"
- "beat gmsh's triangle count **3×** at equal true-3D fidelity"
- "zero feature-adjacent slivers at **¼** the triangles"
- "one discontinuity-first mechanism handles ALL wall classes (seam / occlusion / junction / crease)"
A *matching* target — "CAD-grade", "watertight", "match gmsh" — is a research target, not a frontier one.

## Guardrails (do NOT trade these away for boldness)
- Ideation may be wrong half the time — fine, BECAUSE the downstream falsification loop is a ruthless net. But you
  MUST run that net. Never ship an unvalidated bold idea as a result.
- Measurement-first still governs VALIDATION; the ideation phase is kill-criterion-exempt ONLY until an approach is chosen.
- Dev-only / flag-gated / byte-identical-off / shared-branch commit hygiene / audit-by-index / GPU hygiene — all still apply (see `meshing-research` + the agent def).
- TRUE-3D-first metric discipline (radial overstates near-vertical 2–27×) still governs every measured claim.

## Red flags — you have slid back into incremental mode
- Attacking one wall without the step-0 registry meta-synthesis.
- An "approach" that only tunes a scalar / an existing `__pfConforming*` lever.
- Only one approach considered; no literature grounding.
- Declaring EXCLUDE/accept without a documented assumption-CHANGE attempt.
- Shipping a bold idea as a result without the `meshing-research` validation pass.

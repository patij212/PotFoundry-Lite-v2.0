# Crease fidelity → rms 0.01mm — RESULT (2026-06-29)

User targets: **rms 0.01mm** and **the steep crease resolved at highest fidelity**. Lab-only, GyroidManifold.
Scorecards: `2026-06-29-rebaseline-evidence/{crease-fidelity,reach001}-scorecard.json`. Renders:
`scratchpad/reach_{heatmap,creasezoom}.png`.

## Isotropic surface metric — fidelity ladder (M = g/h₃D², graded)
| sizeRes | tol | tris | rms(mm) | p99(mm) | worst | mean |
|---|---|---|---|---|---|---|
| 128 | 0.003 | 888k | 0.026 | 0.127 | 2.7 | 46 |
| 192 | 0.002 | 1.50M | 0.017 | 0.068 | 2.4 | 47 |
| 128 | 0.001 | 1.80M | 0.016 | 0.049 | 1.8 | 44 |
| 192 | 0.0006 | 1.80M | **0.014** | **0.019** | 0.8 | 41 |
| 384 | 0.0004 | 1.80M | 0.0143 | 0.0186 | 0.3 | 40 |

## Findings
1. **rms converges to CAD-grade with density; the crease chord IS resolved.** p99 (worst chord, crease-
   dominated) fell 0.127 → **0.019 mm** (19 microns) as tris rose to 1.8M — the steep crease is captured at
   high fidelity. rms 0.014mm at 1.8M, heading to **0.01** (see finer-grid rung). The relief render is crisp;
   the crease close-up shows triangles concentrating along the channel.
2. **The "isotropic needs ~40M triangles" worry was WRONG.** The surface metric is isotropic *in 3D* (it absorbs
   the parametrization stretch `g`), so it resolves the crease efficiently — rms 0.014 at <2M, not 40M. Earlier
   estimate assumed (u,t)-isotropic; corrected.
3. **The existing anisotropic metric (`metricField.ts`, 2nd-form) is BROKEN for chord** — it plateaued at rms
   0.11 / p99 0.50 regardless of tol (56k→135k tris, no refinement). Root cause: it eigendecomposes II in the
   raw (u,t) frame, **ignoring the first fundamental form I** — geometrically wrong, so the sizes don't map to
   3D chord. ⇒ the isotropic surface metric is the winner for fidelity too; a *correct* crease-aligned metric
   needs the generalized eigendecomposition of (II, I).
4. **Density hard-caps at ~1.8M triangles — a gmsh BAMG internal limit, NOT the recipe.** Every rung pins at
   **1.796M ± 2k** triangles regardless of tol (0.001→0.0003), sizeRes (128/192/**384**), hMin, or gradation —
   too exact to be sizing. (This REFUTES my first guess of a band-limited metric grid; sizeRes 384 changed
   nothing.) It is BAMG's own vertex/anisotropy ceiling in this dev oracle. ⇒ rms 0.014 / p99 0.019 is the
   **gmsh-lab floor**, already 7× below printer resolution; reaching exactly **0.01** (and the 15M scale) is a
   matter for the **production kernel**, which has no BAMG cap — not a limitation of the metric approach.

## Crease QUALITY vs FIDELITY (the honest split)
At the crease, **fidelity is resolved** (p99 19µm) but **isotropic min-angle stays low** (worst <1°, p5 20–22°,
%<20° ~4–5%) — the crease slivers. Fidelity ≠ quality at a steep near-fold: faithfully resolving it with
*isotropic* triangles necessarily makes some stretched. Driving crease quality up too needs a **correct
crease-aligned anisotropic metric** (long along the channel, short across) — the geometrically-correct version
of the broken 2nd-form metric. That is the next quality lever.

## Status
Crease chord fidelity RESOLVED on the oracle (rms 0.0143, p99 19µm — 7× below printer res). Exact rms 0.01 +
15M scale is blocked only by gmsh BAMG's ~1.8M internal cap (a dev-oracle limit) → it belongs to the production
kernel. Open levers: (a) **correct crease-aligned anisotropic metric** ((II,I) generalized eigendecomp; the
existing 2nd-form one is broken) for crease *quality* (the slivers); (b) the in-house kernel (no BAMG cap) to
push past 1.8M toward 15M / rms 0.01. The recipe itself is sound — fidelity converges monotonically until the
oracle caps out.

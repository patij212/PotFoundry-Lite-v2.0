# Snaking-C0 — Crest-Crossing Planarization over the Periodic Pot (Design)

**Status:** design, pending user review. Successor to P3b/P3c (commits `e1a08d29..731e0592`).
**Module:** standalone `potfoundry-web/src/geometry/doubleValued/` (NOT production-wired).
**Owner-facing goal:** close the last CelticKnot fidelity gap — the crossing-crest / diamond-corner
facet — to **facet maxChord < 0.01mm EVERYWHERE** on the full periodic pot, watertight, vertex-certified.

## Background — the verified defect (do not re-derive; measured this session)

P3b's visible-envelope clip **composes the full periodic pot watertight** (nonManifold 0, boundaryNonRim
0, seam welded, 108 junctions pinched, one outward component, sheetDev 0). Three independent instruments
+ an analytic proof established that the remaining residual is **structural, not density**, and is NOT a
clip-model gap:

- The worst facet is a **diamond-corner bridge**: the visible **over-strand crest** sheet vertex
  (r ≈ r0+relief) and the **emerging under-strand INNER-edge rail** (r ≈ r0−jump) are both present at the
  corner, but **no vertex sits where the over-crest crease crosses the emerging inner-edge cliff**, so a
  flat CDT facet spans the full ~0.6mm step → ~0.2–0.48mm chord (density-invariant; whack-a-mole across
  corners). The under-strand's OUTER edge is correctly kept + walled — the failure is the INNER edge.
- What does NOT close it (measured, do not retry): pure density (facet is density-invariant); the
  `weldSoftCliffs` / inert-constraint wall variant (P3c: 0.48mm, not watertight); any `occluderAt` /
  visibleEnvelope model change (the model is complete — 0 genuine dropped edges of 33,048).

This is the **M6a mechanism generalised**: M6a proved the crest can be carried as a mesh edge through ONE
isolated crossing (facet 0.0066mm, flag OFF) by dropping the occluded cliffs so the crest crossed free
space. It did NOT compose because at the real diamond CORNER the emerging inner-edge cliff **restarts**
(outside the narrow occlusion gap) and geometrically **crosses** the over-crest crease — an unplanarized
constraint crossing, which is exactly what a CDT cannot resolve without an inserted intersection vertex.

**Open measurement (resolved as Task 1):** the P3b final-review fix (`731e0592`) corrected a real masked
mesher `locusU` mis-lift on the clip path; post-fix the single-column clip `cliffDev` reads ~0.60 where
the pre-fix (masked) pipeline read 0.0004. Whether `cliffDev` at the corner is a second real blocker or
density-reducible is **re-measured on the corrected mesher as the Task-1 RED baseline** — the design does
not assume either; the primary, agreed blocker is the facet.

## Approach — planarize the crest×inner-edge crossing, incremental (chosen)

At each overlap-diamond corner, **insert the shared vertex where the over-strand crest crease crosses the
emerging under-strand inner-edge cliff, and split BOTH constraints at that point**, so the CDT produces
conforming triangles that meet along the crest and the rail instead of one facet bridging them. This is
the literal "crest-crossing planarization" the M6a report and UNIVERSAL-001 roadmap named as the deferred
hard piece. Proven on ONE corner first, then composed over the periodic pot (the isolated-then-compose
methodology that worked for M6a→P3b).

**Why this and not the alternatives:** the defect is a structural constraint-crossing, so the fix must
add structure at the crossing. Walling (Approach C) was measured to fail; per-diamond sub-patches
(Approach B) duplicate the existing junction-pinch machinery. Planarization is the minimal structural
addition that makes the crossing conforming.

**Primary risk (named):** robust constraint-crossing planarization is precisely what crashes `cdt2d` on a
non-planar PSLG (crossing constraints). The planarizer MUST emit a clean planar PSLG — every constraint
intersection becomes a shared vertex, no two constraints cross without one. This repo has solved this
before (see `[[project_cdt_planarization]]`, `[[project_cdt2d_seam_spanner_crash]]`): the fix is
planarization, not a library swap. The one-corner proof (Task 2) exists to de-risk this before composing.

## Architecture / components

Build on the P3b clip + M6a crest infrastructure; add one focused planarization stage. Standalone,
file-disjoint from production.

- **`crestCrossingPlanarize.ts` (new, pure):** given the clipped visible envelope (P3b
  `clipCliffsToVisibleEnvelope`) + the crest creases (`crestCreasesThroughDiamonds`) + the declared
  junctions, compute, per diamond corner, the (u,t) intersection(s) of each over-strand crest crease with
  each emerging under-strand inner-edge cliff arc; return the intersection vertices + the split points on
  both constraints. Deterministic (fixed scan/bisection or closed-form root find; no Date/Math.random).
  One clear responsibility: "where do crest and inner-edge cross, and where must each be split."
- **Consumption in `celticKnotMesh.ts`:** the full-pot clip branch feeds the CDT the **planarized**
  constraint set (crest creases and inner-edge arcs split at their crossings, with the shared
  intersection vertices), instead of the current unplanarized set. Reuse the P3b `buildClippedConstraints`
  helper (from the final-review dedupe) as the seam for injecting the split constraints.
- **Verification unchanged:** `facetChordToTrueSurface` (honest facet gate, straddle-guarded on genuine
  value-jumps only), `certifyAgainstTrueSurface` (independent vertex gate), `auditManifold` +
  production `auditWatertight`. NO new/self-referential reference.

**Interface sketch (refined at implementation):**
```ts
// crestCrossingPlanarize.ts
export interface CrestCrossing { column: number; overStrand: number; underStrand: number; u: number; t: number; }
export interface PlanarizedConstraints { crossings: CrestCrossing[]; /* + split crest/inner-edge segments */ }
export function planarizeCrestCrossings(env, crests, junctions, params, domain): PlanarizedConstraints;
```

## Data flow
clip envelope (P3b) + crest creases (M6a) → `planarizeCrestCrossings` computes crest×inner-edge crossings
→ split constraints + shared vertices → CDT (now a clean planar PSLG at corners) → double-valued mesh
(walls, junction pinch, crest edge) → verify (facet < 0.01 + cert + watertight).

## Measurement-first task outline (each with an explicit gate; full detail in the plan)
1. **RED baseline (corrected mesher).** Measure the post-`731e0592` full-pot + single-column clip:
   facet maxChord + where, cliffDev + which vertices, watertight bounds; reconcile the cliffDev 0.60 vs the
   pre-fix 0.0004 (is cliffDev a second blocker or density-reducible?). Deliverable = the true baseline the
   fix must beat. No production code.
2. **One-corner planarization proof (LOAD-BEARING).** Planarize the crest×inner-edge crossing on ONE
   isolated diamond corner; gate: facet maxChord at that corner **< 0.01mm**, watertight, cert < 0.01,
   `cdt2d` does not crash. If it will not close, STOP and report the measured residual (the crossing
   geometry is the issue, not density). Mirrors M6a's isolated proof.
3. **Compose over the periodic pot.** Apply per-corner planarization across all diamonds/columns +
   the periodic seam; gate: **facet maxChord < 0.01mm EVERYWHERE**, cliffDev < 0.01, nonManifold 0,
   boundary only t-rims, cert < 0.01, production `auditWatertight` agrees.
4. **Deliver.** Re-emit `research/exchange/_p3_celtic/celtic_perfect.stl` (fresh, DEFAULT); log tris +
   facet maxChord + nonManifold + bytes; report.

## Constraints & rules (binding)
- **Standalone:** edit only `src/geometry/doubleValued/`; P1 + production `auditWatertight` read-only; do
  not touch concurrent-agent files (`validatedResidualProgram.ts`, `triangleExactMeanValueScreen.test.ts`,
  `_gothicVoronoiConformingSpike.test.ts`, `_gothicScreenSlackAudit.test.ts`, `potscope/*`).
- **Honest measurement / STOP rule:** facet chord vs the exact analytic surface (`facetChordToTrueSurface`),
  never a self-referential re-mesh; never loosen the < 0.01 gate, cap passes, widen the straddle, or emit a
  non-conforming STL. If a stage will not reach < 0.01, STOP and report the measured, localized residual.
- **Determinism** (no Date/Math.random/DOM); **lint 0-warnings**; module typecheck-clean (no new whole-
  project tsc errors). Coordinate convention `theta=2π·u, z=t·H`.
- **Concurrency:** absolute `git -C` paths, explicit file paths only (never `add -A`/`commit -a`), STL
  untracked (never commit it), never `git stash`; `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Definition of Done
- One diamond corner planarized to facet < 0.01mm, watertight (Task 2, the M6b-successor proof).
- Full pot at DEFAULT: facet maxChord < 0.01mm EVERYWHERE, cliffDev < 0.01, watertight, cert < 0.01,
  production `auditWatertight` agrees; STL re-emitted (Task 3–4).
- All changes isolated under `src/geometry/doubleValued/`; M1–M5 + T2 behavior preserved (clip/planarize
  off ⇒ byte-identical) or intentionally updated + recorded.
- **Follow-up (separate):** production wiring into `assembleWatertight`; the ledgered T2/T3 ride-Minors
  (m3, m5).

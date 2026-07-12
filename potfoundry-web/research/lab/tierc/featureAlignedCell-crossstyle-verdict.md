# featureAlignedCell Cross-Style Eval — the sliver "frontier" is path/style-conditional, not monolithic curved-element

**Arm:** PROD-TIERC Phase-2 accelerator (use-existing-research). **Corrects FIX-PHASE-VERDICT's
"Gothic 19% sliver = curved-element frontier" framing.** Probe:
`research/bridge/_featureAlignedCrossStyle.probe.test.ts`. Prior SFB verdict: commits
`9b8d94f7`/`999f3a0b`/`e7d4e8ab` (2026-06-26, finding lives in commit messages only).

## What featureAlignedCell is + its wiring

Per-cell drop-in for `triangulateConstrainedCell` (production `ConformingWall`/`FeatureConformingTriangulator`
path). For a feature cell with exactly ONE simple boundary-to-boundary constraint chain, it subdivides
the ridge into 3D-arc-length column stations + a perpendicular anisotropic interior grid (all points
interior, boundary set UNCHANGED ⇒ watertight by construction), re-runs the same CDT. Reachable today
behind `globalThis.__pfFeatureAlignedCells` + `__pfConformingRefine` (both default off ⇒ byte-identical),
applied KEEP-BETTER (replaces the plain CDT only if it beats that cell's worst min-angle).

## The code-path correction (load-bearing)

**Production conforming Gothic is at 1.9% <20°, NOT 19%.** The "19%" in FIX-PHASE-VERDICT / the Phase-2
charter traces to a SEPARATE standalone research prototype — the perfect-mesher brute lib
(`_pf_perfectMesherBruteLib.ts`/`buildDirectCrestStrip`, chasing literal-0 whole-mesh fidelity with a
different quadtree/refine policy) — never wired to `src/`, never the 20-style export code. The 19% DOES
apply to the **K2/tierC path** (the one C2 makes true-0.01) as its refine-policy sliver floor (C2-full
measured minAngle 0.8°), but it is NOT a general "Gothic frontier." Two disjoint code paths were
conflated. Each sliver result is path-specific and does not transfer.

## Measured (production conforming path, fL11/uBias=1, triangleQualityDistribution + auditNonManByIndex)

| style | mode | tris | %<20° | %<30° | nonMan | verdict |
|---|---|---|---|---|---|---|
| SuperformulaBlossom | OFF→ON | — | +25-34% WORSE | — | 0 | **REFUTED** (per-cell granularity wrong for diagonal near-corner chains; returns null on the worst too-short ridges, its ~16° clean-edge cap manufactures mild slivers) |
| GothicArches | OFF | 1,044,948 | 1.9% | 7.8% | 0 | baseline already good |
| GothicArches | **ON** | 1,167,114 (+11.7%) | **1.1% (−42% rel)** | **2.6% (−67% rel)** | 0 | **CONFIRMED net-positive, unshipped** — watertight held, worst-angle unchanged |
| DragonScales | OFF | 429,438 | 19.2% | 33.1% | 0 | dominant slivers = FCT_PLAIN_FAN 32,917 + PLAIN_QUAD 14,837 (63%), OUTSIDE feature cells |
| DragonScales | **ON** | 430,113 (+0.2%) | 19.1% (flat) | 33.1% (flat) | 0 | **NO-OP** — graft can't reach DS's dominant sliver class |

Watertight held all cases (nonMan 0). Fidelity not independently re-measured this run (by construction
the graft inserts only exact on-surface interior Steiner points on an unchanged conforming boundary, so
it cannot increase chord sag — but CONFIRM with featureLineChord3D before productionizing).

## Verdict — the sliver frontier is STYLE/TOPOLOGY-CONDITIONAL

- **SuperformulaBlossom:** REFUTED (net negative at production density) — needs railLines (vertices ON
  shared cell edges, a band spanning cells), per e7d4e8ab.
- **GothicArches (production conforming path):** featureAlignedCell is a WIRING/VALIDATION win, NOT a
  curved-element frontier. 1.9%→1.1% for free. Next: a proper CONFIRM (true-3D fidelity re-check + real
  GPU export A/B mirroring e7d4e8ab's rigor) before flipping `__pfFeatureAlignedCells` default-on for
  Gothic specifically.
- **DragonScales:** NO-OP — its ring/body slivers are in the FCT_PLAIN_FAN/PLAIN_QUAD ring-transition
  templates, a DIFFERENT lever (now identified). Redirect there, not featureAlignedCell, not curved
  elements.
- **K2/C2 true-0.01 Gothic's 19%:** a separate question (the refine-to-zero policy floor); featureAlignedCell
  does not operate on that path.

**Correction to the program synthesis:** "the sliver frontier needs curved elements" was too broad. It
is mostly specific, mostly-existing levers (featureAlignedCell for production Gothic; ring-transition
templates for DS; railLines for SFB) — style-and-path-conditional, each needing its own measurement,
which the sliver "frontier" framing had collapsed. The genuine curved-element question narrows to the
K2 literal-0 refine-policy floor, if anywhere.

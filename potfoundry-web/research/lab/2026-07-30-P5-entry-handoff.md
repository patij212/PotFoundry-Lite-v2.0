# P5 ENTRY HANDOFF — junction + LOCUS-STRIP routing. Written 2026-07-30 at the S13 phase boundary.

**Read this first, then the S10-S13 sections of `research/lab/2026-07-29-strata-perf-convergence-worklog.md`
(pre-registrations and results are interleaved there in landing order).** This file is the entry point for
a fresh session; everything it asserts cites where it was measured.

---

## 0. WHY P5, AND WHY ITS SCOPE JUST CHANGED

Every bisection-family lever has now been tried against the visible artifact class and the fidelity tail:

| lever | result | where |
|---|---|---|
| CTLPLUS — more refinement | class WORSE 211 -> 294 | 2026-07-30 |
| S6 — sliver collapse | zero candidates, 100% long-edged | S6 |
| S7 — conforming flip | class WORSE x1.44 | S7 |
| S8 — post-loop cascade | 18,102/18,102 SELF-BLOCK at the cap | S8-PROD2 |
| S9a — conformity at birth | class x0.84, first mover | S9 FINAL |
| **S10 — aligned constrained seed** | **class x0.145 (6.9x), crossings 10,641 -> 963** | S10 |
| S10B — accept halved globally | H2 argmax moved by ZERO | S10B |
| S11 — seam-crack fix | topology closed, census unchanged | S11 |
| S12 — Phase 2 certificate field | H2 argmax moved by ZERO, field PROVABLY on target | S12 |

**S13 (the autopsy) then separated the residual into TWO populations that had been treated as one:**

* **STRANDED** — 5,576 (_S11A) / 6,621 (_S12i2) facets, genuinely S1-refused, sitting AT the AR cap,
  worst 47.245 um and PINNED across every arm. This is the S8 self-block. Needs a primitive that can lay
  anisotropic elements under the cap (the certified-but-unwired M=g/h^2 kernel).
* **ACCEPTED-BLIND** — the H2 argmax carriers. Sub-cap (3-D AR **2.68** and **5.71**), well-shaped,
  **vertex-identical across all four production arms**, and never queued because the driver's own accept
  ruler reads **0.8031 um** and **0.4165 um** on facets that are **37.899 um** and **40.006 um** from the
  surface — **47.2x and 96.1x blind**. **The worst surface error in the mesh lives HERE, not in the
  stranded set.**

**AND THE SCOPE FINDING THAT MUST NOT BE LOST: both worst sites are ON the traced locus graph (2.8 um and
3.1 um from a traced polyline) and OUTSIDE EVERY junction disk (1.951 mm and 16.599 mm from the nearest).**
P5 scoped as "junction routing" would not touch either of the two worst sites in the mesh. **P5 must cover
LOCUS-STRIP segments as well as junction disks.** This costs no new instrument — the tracer already emits
both, per run, in the same artifact.

---

## 1. WHAT ALREADY EXISTS AND WORKS (do not rebuild)

| asset | file | state |
|---|---|---|
| **Locus tracer** | `research/bridge/_strataLocusTrace.ts` | 394 components, 11,083 pts, 6,738.2 mm, 235 junction disks per run. Calls `locateKinkRaw` and nothing else, so a traced locus IS the object SNAP conforms to. |
| **Tracer negative control** | `research/bridge/_strataLocusTraceNegControl.test.ts` (+ `vitest.s10trace.config.ts`) | 6/6. 0.00 um on straight loci, 1.50/5.52 um curved, 48/48 junctions at 0.0 um, 200 um perturbation correctly FAILS, C0-jump surface yields 0 loci with 1,932 exclusions counted. |
| **Aligned constrained seed** | `research/bridge/_strataAlignedSeed.ts` | `PF_CB_ALIGNED_SEED=1`, default OFF. 100% constraint recovery ASSERTED in code (throws otherwise). Watertight since S11: cracks 0, Euler 0. |
| **Loci + disk artifact** | `<tag>.loci.json` beside every aligned STL | P5's direct input: per-disk centre, radius, branch count, min branch angle, evidence spread, loci ids, branch directions with disk-exit points. |
| **Validated class classifier** | `research/bridge/out/diskLocalise.ts` (scratch) | Reproduces the judge's gated back-facing count EXACTLY (959, 1,054, 1,887). Move into `research/tools/` if it is to be relied on. |
| Phase 2 loop | `_phase2Loop.mjs`, `_phase2Audit.test.ts`, `_phase2Loci.ts` | Works; its field provably reached the blind site and could not move it. |

**Standing invariants — every one of them held through S10-S13 and must keep holding:**
flag-OFF md5 `8a59fb37a9115600b13262254380ccb0` at the W1 config; hard gate 12/12 with exact values;
0 determined folds; determined blades 2 (the seed-born pair, declared); worst admitted child AR <= 50;
seam-cracks 0 / Euler 0. Never quote the driver self-report as fidelity. Quote H1 coverage with every
H1 number.

---

## 2. THE TARGET LIST — LOAD-WEIGHTED, AS MEASURED

**Do not weight by disk count.** Measured: z 25-30 carries **35 disks and 42 back-facing facets**, while
z 80-85 carries **17 disks and 411**. Weight by artifact load.

Class localisation, from the validated classifier, stable across four arms and a 1.63x refinement change:

| arm | gated back-facing | **in a junction disk** | share |
|---|---|---|---|
| _S10A | 959 | 589 | **61.4%** |
| _S10B | 1,887 | 1,135 | **60.1%** |
| _S12i2 | 1,054 | 648 | **61.5%** |

**~61% of the visible class sits in 4.039% of the surface, on every arm.** That is the junction-disk case,
and it is strong. The other ~39% is locus-strip material — and, per S13, so are the two worst fidelity
sites. **Route both.**

Disk statistics (235 disks, 1,370.5 mm^2 = 4.039% of the 33,929 mm^2 wall): radius p50 0.350 / p90 2.366 /
max 4.000 mm; min branch angle p10 **18.7 deg**, tightest **15.1 deg**; branch counts 2 -> 111, 4 -> 105,
**>=6 -> 19**. The 19 disks with >=6 branches and the ~15 deg minima are the hard core: at 15.1 deg an
element aligned to one branch is at ~1/sin(15.1) = 3.8x parametric aspect against the next, before any
refinement. That is the anisotropy the AR cap cannot express.

Back-facing z-histogram peaks (_S12i2): z 60-65, 80-85, 95-100, 110-115. Note these do NOT coincide with
the disk-count peaks; that is the point of load-weighting.

**The two named fidelity sites, for the locus-strip arm:**
| site | (theta, z) | true error | driver's ruler | blindness | carrier AR | nearest locus | nearest disk |
|---|---|---|---|---|---|---|---|
| A | 5.637379, 44.16992 | 37.899 um | 0.8031 um | **47.2x** | 5.71 | 2.8 um | 16.599 mm |
| B | 4.062906, 45.38896 | 40.006 um | 0.4165 um | **96.1x** | 2.68 | 3.1 um | 1.951 mm |
Both are sharp **C1 creases** (two-scale ratio 0.25-0.39 vs the 0.62 jump threshold) at every scale probed
from 2 mm down to 0.125 mm — **not C0**, so a curtain is not required and density does converge in the
h^1 sense. The r profile is a V: -630.6 um within 83 um of centre in theta. The carrier spans 1,367-1,550 um
across a feature that turns over in ~80 um.

---

## 3. THE BUILD ORDER (unchanged from the brief except for scope)

**STEP 1 — JUDGE PROVENANCE EXTENSION. Instrument work, fork-independent, do it first.**
A structured patch will legitimately contain facets the blade gate would flag. The gate must therefore
learn provenance WITHOUT losing its teeth:
  * declared-patch regions carry provenance into the audit;
  * the blade gate exempts **ONLY declared facets** and **SHOUTS the exemption count** on every run;
  * an **undeclared** AR>50 facet still FAILS, exactly as today;
  * **negative control, mandatory:** an undeclared over-cap facet must still be counted, and a declared
    region must not silently widen — assert both, expect-nonzero discipline, in the same style as
    `_judgeNegativeControl.test.ts`.
  * Touches `_judgeShape.ts`. The standing rule requires writing down WHY before touching a judge file:
    the reason is that a patch emitter cannot be A/B'd at all if its own geometry trips the gate that
    measures it, and the alternative (loosening the cap) is D51. `_facetTruthLib.ts`, `_sharp3dRef.ts` and
    `_shapeGuard.ts` stay byte-untouched.

**STEP 2 — REGION EXTRACTION.** Top disks by measured back-facing load (start with the X-crossing band,
the 60%-in-disk core), PLUS locus-strip segments around the two named sites. Both come from the same
`<tag>.loci.json`.

**STEP 3 — THE EMITTER.** Deterministic, watertight-stitched into the surrounding mesh. M=g/h^2 kernel if
it composes cheaply; structured fan/strip otherwise — **measured, not assumed**. Stitch precedents in-repo:
ring-strip/curtain stitch, `src/fidelity/bandRemesh/assembleFeatureAligned.ts`, and the seam idiom in
`ConstrainedTriangulator.seam.test.ts`. **Heed the cdt2d spanner lesson** (2026-07-13): no constraint edge
may span the chart, and after a seam weld the theta=0/2pi columns are INTERIOR, not boundary — that exact
confusion cost S10-S11 a 3-edge hole (see the S11 section).

**STEP 4 — A/B vs `_S11A` (the best watertight aligned mesh) or the Phase-B best.** Class target =
**in-disk back-facing** (>5x fall in routed disks is the WIN shape); H1/H2 guards; watertight cracks 0;
full pre-registration with disjoint first-match rows. For the locus-strip arm the target is the named
sites' true error, and the bar should be stated against 37.899 / 40.006 um.

**PHASE D — THE CERTIFICATE.** On the best mesh standing: pooled UNCAPPED H1 (`PF_FT_WORKERS=8`, no
`PF_FT_H1MAX`, ~5 h) + full H2 through the hardened judge. First genuine PASS/FAIL at 10 um on
GothicArches. Either verdict is a result. Quote coverage with everything.

---

## 4. OPS — READ TRAP 11 BEFORE LAUNCHING ANYTHING LONG

The tool's FOREGROUND timeout is **600 s**, shorter than the mesher (758-1,054 s) and the deep audit
(~965 s). A completed BACKGROUND task does **not** wake an idle session — its notification waits for the
next invocation (measured twice: 19 idle minutes each). **The working pattern:** background the job with a
FAILURE SENTINEL, then issue repeated foreground `until <sentinel>; do sleep 45; done` waits at 600 s each,
re-issued immediately on timeout, never ending the turn between them. Zero idle time in S11-S13.

Costs, measured: mesher 758-1,054 s; Part-B deep audit ~965 s; emitting (serial) Phase-2 audit ~1,125 s;
tracer 26-29 s; aligned seed build ~52 s; full autopsy at probe scale ~3 min.

## 5. THE ONE OPEN BUG AND THE ONE OPEN QUESTION

* **OPEN BUG:** none blocking. The seam crack is fixed (S11) and survived a field-driven re-mesh (S12).
* **OPEN QUESTION for the operator, not for an agent:** the accepted-blind population is reachable by
  Phase 2 only at tolScale **8-16** (measured: 4.36x and 8.40x are the thresholds to merely QUEUE the two
  carriers, and tolScale 4 lands at 0.875 um against a 0.8031 um reading — inert by 9%). That is 2-3 more
  outer iterations at ~35 min each, applied globally to all 772+ clusters, to bisect an h^1 crease with a
  47-96x blind ruler. P5 was chosen over it on that arithmetic. **If P5's locus strips also fail, the
  remaining honest option is a different RANKING QUANTITY in the loop** — and the 2026-07-29 R1/R1b arms
  already refuted the obvious substitutes, so that would be new work, not a retry.

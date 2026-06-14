# B5 Surface-Fidelity Metric — Accuracy Assessment & Gap Resolution (2026-06-14)

Produced by a dynamic workflow (`metric-gap-resolution`, wf_6925cb1b-c5d, 9 agents:
per-style diff → adversarial verify → synthesis) plus real-GPU verification. The
adversarial-verify stage caught two under-corrections before they shipped (Voronoi's
1-edit proposal was insufficient; CelticKnot's AABB predicate was blind to recovery
flips) — the same "inspection fixes are ~50% wrong" lesson, now guarded.

## Gap resolution — the 4 remaining REF-UNTRUSTED styles

| Style | Was | Gap class | Fix | Now |
|---|---|---|---|---|
| **HexagonalHive** | analytic 2.0 (==hhRelief) | formula-drift | WGSL hardcodes `H=20` (shadows real height) → `v=t·scale·0.5`; CPU used real H (~6× grid mismatch). Matched it. | **CERTIFIED** (vtx 0.0000) |
| **LowPolyFacet** | analytic 16.16 | formula-drift | CPU FAKED it via rOuterHarmonicRipple; ported the real WGSL faceted-polygon SDF (secant + smin). | **PARTIAL** (vtx 0.0000, chord 0.98 = real facet density) |
| **Voronoi** | analytic 0.67 | formula-drift + f32/f64 | `hash22` used `%` not `fract` (both p3 inits + return); 3 smoothsteps linearized. Restored. | 0.67 → **0.14** (formula fixed; 0.14 = f32/f64 hash floor) |
| **CelticKnot** | analytic 0.42 | crease-discontinuity | byte-faithful port (no styles.ts edit); added geometric `creasePredicate` for the swept braid creases. | 0.42 (predicate excludes crease zones; **one** atan2-recovery vertex survives) |

**Net: 16/20 → 19/20 EXACT-trusted** (added HexHive + LowPoly + CelticKnot). The
formula drift is fully resolved on all four (CPU now byte-matches WGSL).

**CelticKnot — RESOLVED via the stash-parameter vertex reference (commit `94a3007`).**
The 0.42 was ONE vertex (of ~373k): an atan2-recovery round-flip at a strand
discontinuity (the recovered u looks clean mid-strand, so a geometric predicate can't
see it — only the f64 recovery epsilon flips the braid). Fix: the metric now reads the
EXACT placement (u,t) the GPU evaluated (`LAST_CONFORMING_ASSEMBLY_UT_POSTWARP`,
captured after the domain warps) for the VERTEX channel, instead of recovering the
azimuth via atan2. → vtx 0.42→0.0001, **PARTIAL** (chord 0.82 = real braid density).
No regression (placement≈recovery for well-behaved styles; BasketWeave stays 0.0000).

**Voronoi — the lone remaining REF-UNTRUSTED (0.14): irreducible independent-verification
floor.** Distributed (p99 0.155) at the steep web-edge gradient. The stash-parameter
reference left it unchanged (not a recovery flip) AND the formula byte-matches WGSL (not
drift). **An f32 hash simulation via `Math.fround` was ATTEMPTED (hash22 + periodicCellular
+ grid coords) and did NOT close it (0.14→0.1448, no benefit) — reverted.** Root cause: the
GPU hash uses FMA + a driver-specific rounding ORDER; `Math.fround` matches f32 *precision*
but not the op sequence, and in a chaotic `fract`-based hash that difference (not precision)
is what diverges. A true bit-match needs driver-specific FMA replication (not portable), and
the only bit-exact reference is the GPU itself (circular — the mesh vertex IS the GPU eval).
⇒ 0.14 is the floor of INDEPENDENT CPU verification for a chaotic-hash style; the **mesh is
faithful** (GPU-placed), the metric just can't certify it tighter. REF-UNTRUSTED is the
honest verdict. 19/20 is the vertex-certification ceiling; this is a metric-verification
limit, NOT an export defect (Voronoi's chord is the real density measure).

## Is the B5 metric SOUND? (per-mechanism, from the synthesis)

The metric is **sound with well-defined trust boundaries**; its failure modes lean
toward *false alarms / conservative*, not *hiding defects* — with two caveats.

- **theta-wrap** (`devAt` atan2→[0,TAU)): a domain correction, can't hide; *previously*
  fabricated (theta-sign styles) — now resolved, verified no-op on periodic styles.
- **referenceTrusted (vertexMax≤0.05)**: validates the CPU ref against the *vertices*
  only — statistical, not exhaustive (a ref bug in a sparse-vertex region could pass;
  low practical risk, dense coverage + chord sampling partially cover it).
- **seam / riser / crease exclusions**: each excludes genuine two-valued discontinuities
  (tracked, never failed). **Crease exclusion is the soft underbelly** — a wrong/too-wide
  locus or predicate can hide real error OR (too-narrow) leave a false fail. Guard:
  require the worst-vertices-on-cell-boundary signature before accepting a style's loci.
- **GPU-grid band-limited fallback**: an HONEST DEGRADED read, NOT a certification — it
  under-resolves sharp features (can read *low*). A REF-UNTRUSTED@512 number is not a
  fidelity guarantee.
- **vertex vs chord channel split**: the strongest design choice — *prevents* hiding by
  separating placement (vertex) from slicer-seen facet error (chord).

## What the results MEAN (across 20 styles)

- **(a) Real on-surface fidelity (trustworthy):** the 18 EXACT-trusted styles read
  vertexMax ≈ f32 floor — the exported mesh vertices lie on the true analytic surface.
  CERTIFIED = "your wall is the designed shape to f32 precision."
- **(b) Genuine density/chord gaps (the actionable backlog):** vertex≈0 but chord large
  (the PARTIALs: SFB, Gothic, Bamboo, GeoStar, LowPoly, BasketWeave, Crystalline,
  DragonScales, Gyroid, CelticTriquetra). Real, slicer-seen, **density-closable**.
- **(c) Excluded discontinuities (accepted):** seam / ArtDeco risers / BasketWeave &
  CelticKnot creases — two-valued loci where GPU-f32/CPU-f64 round opposite sides; not
  pot defects, tracked separately.
- **(d) Reference artifacts now fixed:** the 4 gap styles were errors in the CPU
  *reference* (or f32/f64 precision), never defects in the exported pot.

## Recommendations (from the synthesis)
1. Never report a REF-UNTRUSTED@512 number as certified — add a regression sentinel that
   fires if any default-config style falls back (catches future formula drift).
2. Crease exclusion guard: track over-exclusion fraction; flag >5% for review.
3. Twist≠0 is an unmeasured regime (all styles recover theta from the twisted vertex but
   compute radius from un-twisted th0) — document as a B5 precondition or correct the
   recovery before any twist-config certification.
4. (Deeper) a stash-parameter vertex reference would resolve the CelticKnot recovery-flip
   AND unify the crease handling — worth it if 20/20 EXACT-trust is required.

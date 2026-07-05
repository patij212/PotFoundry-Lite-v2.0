# Meshing Export-Fidelity Program — Review + Brainstorm Roadmap

**PI review, 2026-07-02.** Inputs: 5 specialist lenses (Fidelity, Performance, Metric, Frontier, Robustness), a devil's-advocate critique, and the arc context. Two load-bearing claims re-verified against source this session:

- `inhouseMetricMesh.ts:422` references `rec` outside its `else`-block scope (`rec` is `const` at line 414; line 417 already uses the correct outer-scope `constraintStats`). Throws `ReferenceError` on `profile:true && constraintEdges`. **Also**: the `recoveryHook` path (line 407) never binds `rec` at all, so the log throws there too. — CONFIRMED.
- `tsconfig.json` has `include: ["src"]`; research/ gets no typecheck. — CONFIRMED.

Everything below respects the standing user rule: **no fix/progress claim without a kill-gated in-project measurement.** Where a bet rests on "unblocked in theory / literature-grounded / reuses shipped M," it is flagged as honesty-risk and its KILL criterion must run *before* the build.

---

## 1. HONEST STATE OF THE PROGRAM

**What is genuinely achieved — and it is real.** The arc solved *fidelity-as-placement* and, more importantly, learned to *measure it honestly*. The in-house metric-Delaunay kernel (M = g/h²) with pinned refined-crest vertices lands crests on the true surface for all 20 styles (featureLineChord3D p99 0.005–0.070 mm — CAD-grade everywhere). The scientific spine is the metric journey: the ruler was wrong **three times** (radial overstates near-vertical relief 2–370×; single-seed GN overstates tangled lattices up to 7×, Gyroid 0.644→0.092; global-nearest perp overstates azimuthal relief, Bamboo 0.54→own-region 0.025), and each error was caught and corrected with an adversarial cross-check. Two measurement artifacts were unmasked (GN wrong-azimuth; `auditNonManByIndex` weld over-count — the "72 nonMan folds" were 1e-4mm welds, raw-index nonMan = 0). The paradigm break is E-SHARP3D-ARTDECO: leaving the single-valued (u,t) sheet and building an *explicit closed-3D object* with tread bands + a native structured wall reached 99.98% ≤0.01 mm vs the actual object — overturning the "irreducible C0 cliff / EXCLUDE" verdict. E-BREADTH showed that framework transfers (DragonScales treads watertight; LowPolyFacet faces literally 0.0000).

**What is dev-only — and this is the fault line every lens confirmed.** *Nothing is productionized.* `src/` imports zero research/ kernel symbols (verified: the single hit is a comment/test). Every CAD-grade number is a throwaway harness artifact behind a `PF_*` env gate. The user's actual export runs the separate legacy/conforming path, which memory flags as defective on ~9/20 styles — **and no one has ever measured what that shipping path delivers today under the corrected ruler.** Worse, the certified kernel *cannot emit the styles it certified*: single-valued (u,t) is blind to treads (ArtDeco/DragonScales needed hand-built explicit references) and structurally incapable of multi-valued weave/braid (over-under = two r at one (u,t)). So the honest headline is not "export is CAD-grade" — it is "we proved, in a harness, that CAD-grade is *reachable* for the subset of styles a shippable kernel would also have to be rebuilt to produce."

**The biggest gap is a decision, not an experiment.** Four of five lenses independently said "nothing ships" and then proposed *more research on the unshipped kernel*. The unasked question — **does the research kernel get ported, or do its lessons get back-ported into the shipping conforming path?** — determines whether the high-effort bets target the right code. Every effort estimate flips on it. Secondary structural gaps: (a) **triangle quality (min-angle) is the one axis no fidelity fix ever touched** — minAngle=0 / %<20 in 2.6–29% on *all 20*, density-*invariant* (BasketWeave worsens at 4.5M), refuted twice as a density problem; (b) the true-3D ruler is still a bounded single-seed search applied *by hand per style* — no self-selecting instrument exists; (c) the shared kernel has **no typecheck and no CI gate**, so a latent `ReferenceError` sits on the exact `profile:true + constraintEdges` config the perf lens wants to run first; (d) the whole 0.01 mm standard rests on the *unmeasured assumption* that sub-0.05 mm residuals are sub-print.

---

## 2. TOP OPPORTUNITIES (de-duplicated; the 36 pooled items collapse to ~7 distinct bets)

Ranked within each bucket by impact/effort. "Why now" is included per item.

### QUALITY

**Q1 — Metric-orthogonal insertion under M (kill the density-invariant sliver tail).** *[Bet B: Fidelity#1 + Frontier#4]* Replace the 2:1-quadtree/Euclidean-Delaunay seed with metric-orthogonal point placement under the existing `buildSurfaceMetricField` M. This is the ONLY axis no fidelity fix touched, and it is density-doubly-refuted (BasketWeave worsens at 4.5M; ours 110–213× denser than gmsh-iso yet ~2° worst-angle vs SOTA 14–20°).
- **First step (KILL-GATED):** On GothicArches + BasketWeave at equal tri budget vs the pin/no-lock build, measure depth-invariant `minAngleDeg` via `triangleQualityDistribution`. **KILL if minAngle stays <5° on either.** Isolated `_metricOrtho.test.ts`, dev-only.
- **Why now:** it is the cheapest of the paradigm bets, stays in (u,t) (dodges self-occlusion), reuses the shipped M — but has NEVER been built in-project (only an invalid gmsh-Algo-11 proxy, which ignores the tensor). Highest honesty-risk of the quality items; run the kill first.

**Q2 — Per-region sliver localization instrument.** *[Metric#6]* Add `triangleQualityByRegion(ut, idx, regionFn)` returning per-region minAngle/%<20/%<10. BREADTH had to hand-write a probe to prove DragonScales' 0.1° minAngle was *entirely* the tunable tread sub-rings (sheet-only 14.1°) — a diagnosis-vs-fundamental distinction the user's audit-first rule demands.
- **First step:** implement it; guard test = reproduce the DragonScales sheet-14.1 vs tread-0.1 split.
- **Why now:** it is the observability that tells you whether Q1's slivers are structural (2:1 fan) or a known-tunable sub-ring — a precondition for interpreting Q1's kill gate honestly. Cheap.

### PERFORMANCE

**P1 — Swap the radial chordSteiner guard for the perpendicular guard.** *[Perf#2]* The split predicate's `chordSag` uses same-(u,t) `liftP` (RADIAL), overstating near-vertical relief 2–370×, so `chordTolMm:0.01` at a near-vertical wall is unreachable and the kernel over-refines toward the budget (BUILD3d, SFB coarse-base confirmed budget-hit-and-regress). `projectPointToRadialSurface(...).dist` is already exported.
- **First step:** add opt-in `chordPerp?:boolean` swapping `chordSag`→perp distance (inhouseMetricMesh.ts ~361-372), byte-identical off; A/B GothicArches tri-count + wall-clock at equal true-3D p99.
- **Why now:** **best effort-to-impact ratio in the whole pool.** One low-effort metric fix cuts tri count, cuts runtime, AND removes the budget-hit pathology that Perf#3's "converging stop rule" treats symptomatically. It attacks the root the other perf item treats as a symptom.

**P2 — Profile the kernel at 3–8M tris; make the outer Delaunay incremental.** *[Perf#1]* `buildInhouseMetricMesh` rebuilds `new Delaunator(scaledCoords())` over the ENTIRE growing point set every round (line 344) + full `computeXYZ` + full split scan. The 5.5h/20-style and 1247s/6-build wall-clocks are unattributed.
- **First step (BLOCKED until F1 lands — see below):** run the existing `profile:true` flag on the SFB@1 best config and GothicArches@3M; commit the per-stage breakdown. If delaunay dominates, prototype incremental insertion (byte-identical-off).
- **Why now:** likely the dominant cost at scale. **BUT its first step uses `profile:true` + `constraintEdges` — the exact config that crashes on the `rec` bug (line 422).** F1 is a hard precondition.

**P3 — Production budget→fidelity curve + converging stop rule.** *[Perf#3 + Perf#5/#6 references]* `maxPoints` defaults to 5M and probes hit 2.5M and REGRESS. Change "split all over-size edges" (line 351) to a worst-sag priority queue so a budget cut degrades gracefully. The SHARP3D residual is already density-linear (0.014 at 2.23M → 0.01 at ~4×) — a curve waiting to be formalized.
- **First step:** instrument GothicArches to emit (triBudget, true-3D p99, wall-ms) at 0.5/1/2/4M via `maxPoints`; fit; pick the knee.
- **Why now:** production needs a *bounded, predictable* export. Note P1 removes much of the over-refinement P3 is compensating for — do P1 first, then P3 is a smaller job.

*(Deferred: Worker/WASM port + streaming STL — Perf#4. Premature: you don't port an unshipped research kernel. Reconsider only after the §4 productionization decision names the target codebase. The conforming path already has tiling/decimation/lockBorders.)*

### NEW RESEARCH

**R1 — Weave/braid escape hatch: multi-layer atlas, measured against the POST-WARP GPU surface.** *[Bet D: Frontier#2 — unique, no other lens touched it]* The ONLY wall class that breaks the single-valued assumption, and 100% unexplored (zero atlas/seam-cut/multi-valued probe in 146 bridge files). Every prior weave verdict was measured against analytic rA, which the registry itself flags WRONG for this class (BasketWeave vertexMax 2.0 mm).
- **First step (KILL-GATED, cheap):** build a weave reference-ingest reading the post-warp GPU (u,t)→3D surface (via `LAST_CONFORMING_ASSEMBLY_UT_POSTWARP`), NOT analytic rA. Re-measure BasketWeave's current single-valued mesh under the honest reference. **KILL the entire atlas bet if the corrected-reference baseline is already <0.05 mm true-3D** (the over-under relief is smaller than believed). Only if it fails, cut into 2 single-valued strand layers and mesh each with the existing kernel.
- **Why now:** cracking even one weave style is a genuine frontier result the current paradigm *cannot* reach — but the kill is nearly free and could dissolve the whole bet. Fix the ruler before building anything.

**R2 — Features-first protected-CDT refiner (break the crossing-chain-completion ceiling).** *[Bet C: Fidelity#3 + Frontier#3]* E-KERNEL-HARDEN refuted "folds" (raw nonMan=0) and localized the real wall: at dense pickets 86→2000+ constraints go UN-EMBEDDED because `recoverAndLockEdges` gives up on long crossing chains. This caps SFB@1 at 0.021 (step 0.08→0.03 REGRESSES via 129→2082 failures) AND blocks the tangled lattices — one shared blocker. gmsh `mesh.embed` proved 100% recovery vs in-house ~90% (a proxy — not a build).
- **First step (KILL-GATED):** on the GothicArches arch-apex patch, build a protected-CDT Ruppert loop over (u,t) with junction protecting-disks + true-extremum-refined loci. **CONFIRM iff apex recovery = 100% AND featureLineChord3D p99 ≤ 0.112 at fewer flips than recover-after.** As a cheaper pre-probe: on the SFB@1 step-0.03 ladder, pre-planarize so every crossing chain is ≤2 edges before recovery; **KILL if failed stays >200** (then it's the stall guard, not planarization).
- **Why now:** it subsumes recovery-ceiling + crest-placement + u-seam in one construction and is the shared blocker behind two families. High effort, high honesty-risk (only proxied via gmsh) — kill-gate it hard.

### NEXT-LEVEL / PRODUCTION

**N1 — Generalize the ArtDeco native-3D win into a "discontinuity-band + shear-conform" engine.** *[Bet A: Fidelity#2 + Frontier#1 — one program, not three]* The 99.98% result is trapped in a hand-built per-style probe (`_sharp3dMesh.buildStructuredWall` + a bespoke sheared-φ = θ+(4π/freq)·t). featureGraph emits loci style-agnostically; what's missing is auto-deriving (a) the connecting-band geometry at each C0 z-step and (b) the shear coordinate.
- **First step (KILL-GATED):** on DragonScales (the one other proven ArtDeco-class style), replace hand-specified rings/shear with values DERIVED from featureGraph's detected C0 z-step rings + dominant feature direction; measure true-3D-vs-closed-object p99 + serration vs the hand-built BREADTH numbers (BVH p99 0.0049). **CONFIRM iff auto-derived ≈ hand-built within 2×.**
- **Why now:** this is the prerequisite for productionizing *any* step/edge style — but it is genuinely HIGH effort (curved/periodic loci like GeometricStar straps are a research program; LowPolyFacet's straight edges launder the difficulty). **Do not fund it as three separate medium tasks.** Its correctness also depends on featureGraph recall/precision, which is itself artifact-prone (memory: a "verified" recall lift was a TOL-coverage artifact, reverted) — audit the detector on the target styles first.

**N2 — Fix `rec` + bring research/ under a typecheck gate.** *[Bet F, part 1: Robustness#1]* Verified bug at line 422; survives because research/ is untyched. One-line fix + a research tsconfig closes the whole class.
- **First step:** change line 422's log to read `constraintStats` (in scope) instead of `rec` (and ensure it's populated on the hook path too); add `tsconfig.research.json` (extends base, `include:["research"]`) + a `typecheck:research` script; run once to surface every other latent research/ type error.
- **Why now:** it is a **precondition for P2** (perf profiling uses `profile:true + constraintEdges`, which crashes today) and for R2/N1 (both use constraintEdges + profiling). Effort: minutes. Do it first.

**N3 — Consolidate the ruler + audit + scorecard into labkit (retire the live traps).** *[Bet E: Fidelity#4 + Fidelity#6 + Metric#1/#2/#3/#6 + Robustness#5 + Frontier#6 — EIGHT pooled items, ONE cheap deliverable]* Fold `perFaceOwnRadialSag` and `auditNonManByRawIndex` into labkit (both currently copy-pasted across ≥6 probe files / live only in `_kernelHardenSfb`). Add a `selectRuler` that routes cliff regions (validated 0.25mm adjacent-step test) to BVH and on-surface to own-region radial. Emit ONE auto-ruler-selected all-20 scorecard {faithful worst-red, %<20, watertight (raw+weld), class}.
- **First step:** port the exact own-region + raw-index logic from `_sfbPushLib`/`_kernelHardenSfb` into `labkit.ts`; guard with a crack-injection control that moves the raw count but not the weld count; then run the one scorecard sweep.
- **Why now:** this makes *the lab* honest and retires two traps a future probe will otherwise re-trip. **But it is ONE afternoon, not eight bets** — the pool inflated measurement work 8×. `certifyExport()` and the auto-`selectRuler` are nice-to-haves on top; the load-bearing 80% is folding the two corrected instruments in.

**N4 — Verify recoveryRobust on Crystalline + diagnose the nonMan=2 hole.** *[Bet F, part 2: Robustness#3 + Fidelity#5 + Frontier#7]* `recoveryRobust` (committed d3ab395) was only ever measured on SFB@1 where it NEVER FIRES; its own scorecard says verify on Crystalline first. Crystalline is simultaneously the ONE mesh non-watertight (nonMan=2) under `guardManifoldAlways` — contradicting the cheatsheet's "universal 20/20." Watertightness is a hard export requirement.
- **First step (KILL-GATED):** localize the 2 non-manifold edges to (u,t) at the helical-ripple discontinuity via instrumented `auditNonManByRawIndex`; A/B `guardManifoldAlways` vs `recoveryRobust:true`. **KILL (guard is not the mechanism) if recoveryRobust does not clear it** — then it's a build-path flip the guard cannot reject.
- **Why now:** the one guard meant to insure watertightness is unproven exactly where it matters, and the one real watertight defect is undiagnosed. Any productionization inherits a 20/20−1 hole.

**N5 — Physical resin print + physical-fidelity measurement.** *[Frontier#5 — mis-ranked in the pool; belongs at the TOP as a gate]* The entire 0.01 mm standard rests on "sub-0.05mm = sub-print," asserted repeatedly with ZERO measurement. If a resin print cannot resolve 0.02 mm, then SFB@1's 0.021→0.01 push and the ArtDeco stair-lip residual are chasing sub-perceptual error — and effort should redirect to productionization.
- **First step:** print the committed 2.23M-tri ArtDeco STL on resin; measure the physical stair-lip edge + a smooth wall vs the heatmap prediction; establish the real printable tolerance as the honest standard.
- **Why now:** it is the ONLY item that questions whether the standard itself matters, and it can *invalidate half the pool*. It should GATE the fidelity bets (Q1/R2/N1 tightening), not sit beside them as "medium."

*(Deferred / cheap-later: whole-mesh trusted anchoring via cached analytic-surface BVH — Metric#5/Robustness#4. Real, but it's an optimization of the ruler; N3 + the physical print re-rank its urgency. Do after N3.)*

---

## 3. THE 3 BIGGEST BETS (paradigm-changers)

The de-dup map shows the pool's "rich opportunity space" is mostly Bets E and F fragmented across four lenses. The genuine paradigm-changers are three:

### BET 1 — The productionization ARCHITECTURE DECISION (not an experiment — a spec)
**Why it's the biggest bet:** every lens says "nothing ships" and then proposes more research on the unshipped kernel. The kernel is single-valued and *cannot* emit weave/treads; the conforming path already ships (defective on ~9/20) and already has tiling/LOD/lockBorders. **The highest-value move is the decision of which codebase becomes production**, because it re-scopes A–G:
- If **back-port lessons into the conforming path**: Q1 (sliver-orthogonal placement) and P1–P3 (perf) become *product* wins on shipping code; R2/R1 stay research; N3/N4/N2 become the CI that protects the *real* export.
- If **port the kernel**: R1 (weave) and N1 (multi-valued/tread emission) become *mandatory blockers* — the kernel cannot ship without them — not nice-to-haves.

**The effort estimate of every other bet flips on this one unasked question.** This is a brainstorm/spec, cheap to produce, and it is the single largest reduction in wasted downstream effort. It must be paired with a *measurement* the arc never took (see §4).

### BET 2 — Metric-orthogonal insertion under M (kill the sliver wall) — *Bet B / Q1*
**Why it's paradigm:** triangle quality is the one axis the entire fidelity arc never touched, it is density-*invariant* (doubly refuted), it is on *every* style, and it has a portable literature-grounded path (Tenkes-Loseille-Alauzet) that reuses the shipped M and stays in (u,t). It is the cheapest of the true paradigm bets. **Honesty-risk:** it has NEVER been built in-project — the "unblocked in theory" reframe after the gmsh-Algo-11 proxy failure is exactly the pattern the user rejects. Fund it ONLY as a kill-gated probe (KILL if minAngle <5° on GothicArches OR BasketWeave). If it clears 12° on both, it is the highest-leverage quality result the program can produce.

### BET 3 — Features-first protected-CDT refiner (break the crossing-chain ceiling) — *Bet C / R2*
**Why it's paradigm:** E-KERNEL-HARDEN *measured* (not asserted) that the real ceiling is un-embedded constraints on long crossing chains — the shared blocker behind BOTH the SFB@1 0.021→0.01 stall AND the tangled-lattice fidelity. It subsumes recovery-ceiling + crest-placement + u-seam in one construction. **Honesty-risk:** proven only by gmsh proxy, never in-house. Kill-gate: apex recovery = 100% AND p99 ≤ 0.112 at fewer flips.

*(Bet A — the ArtDeco native-3D engine — is genuinely paradigm but is HIGH effort masquerading as medium and is contingent on Bet 1's outcome, so it is the #4 bet, not a top-3. The weave atlas R1 is real frontier but its cheap kill may dissolve it; it earns its build budget only after the kill fails.)*

---

## 4. THE SINGLE HIGHEST-LEVERAGE NEXT MOVE

**Measure what the shipping export delivers TODAY, under the corrected ruler — then let that baseline drive the productionization decision (Bet 1).**

The entire arc measured a kernel users never touch. Nobody has measured the *production* output's true-3D fidelity + watertightness + %<20 under the *corrected* instruments. That single baseline is the cheapest possible input with the largest possible reduction in wasted effort: it tells you (a) exactly which of the ~9/20 "defective" styles are truly bad vs ruler-artifacts, (b) whether the gap between shipping-path and research-kernel is small enough to back-port lessons or large enough to force a port, and (c) whether the physical-print tolerance (N5) even matters for the styles users actually export.

**First experiment (concrete, kill-free — it is pure measurement, which is the point):**
1. **Precondition (minutes):** apply N2 — fix `inhouseMetricMesh.ts:422` (`rec`→`constraintStats`, populate on the hook path) and add `tsconfig.research.json`; run `typecheck:research` once. Without this, step 3's profiling config crashes.
2. Run the *legacy/conforming* production export path (`ParametricExportComputer` / the src/ path) on all 20 styles at the default user budget, dumping each mesh (uv/indices or STL).
3. Score each with the consolidated N3 labkit instruments: faithful worst-red (own-region radial vs brute-anchored, auto-selected), whole-mesh p99, %<20 via `triangleQualityDistribution`, watertight via BOTH `auditNonManByIndex` and `auditNonManByRawIndex`.
4. Publish `research/lab/programme-scorecard-production.md`: per style {shipping-path worst-red, %<20, watertight, class} — **the first honest picture of what the product actually delivers.**
5. Diff it against the research-kernel scorecard. The size of the gap *is* the answer to Bet 1: small gap → back-port lessons (Q1/P1–P3 target shipping code); large gap on styles users use → the port case strengthens (R1/N1 become blockers).

This move is cheap, kill-free (it's measurement), unblocks the one decision every effort estimate depends on, and directly honors the user's "measurement before fixes" rule. Do N2 → this baseline → Bet 1 spec, in that order, before committing budget to any Bet 2/3 build.

---

### Appendix — de-duplication map (36 pooled items → 7 bets)
- **A. Native-3D band/shear engine** = Fidelity#2 + Frontier#1 (+ recovery overlap with C)
- **B. Metric-orthogonal sliver kill** = Fidelity#1 + Frontier#4
- **C. Crossing-chain / recovery-ceiling refiner** = Fidelity#3 + Frontier#3
- **D. Weave/braid atlas** = Frontier#2 (unique)
- **E. Labkit ruler/nonMan consolidation + scorecard + certifyExport** = Fidelity#4 + Fidelity#6 + Metric#1 + Metric#2 + Metric#3 + Metric#6 + Robustness#5 + Frontier#6 (8→1)
- **F. Kernel correctness/CI hardening** = Robustness#1 + Robustness#2 + Robustness#3 + Robustness#6 + Perf#1-precondition
- **G. Perf: perp-guard + incremental Delaunay + budget curve** = Perf#1 + Perf#2 + Perf#3 + Perf#5 + Perf#6
- **Deferred:** Worker/WASM+streaming STL (Perf#4), cached-BVH whole-mesh anchor (Metric#5), reference-error certificate (Metric#4)
- **Missing (no lens raised):** the Bet-1 productionization *decision*; a baseline of the *shipping* path; featureGraph recall audit; style-parameter-extreme behavior (all scored at default dims only).

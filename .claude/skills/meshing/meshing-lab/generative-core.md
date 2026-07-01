# Meshing Lab — Generative Core

> The positive/Lakatosian heuristic that runs UPSTREAM of the falsification gate.
> Scored by a DIFFERENT currency — not "is it true?" but "if true, how much does it
> reprice?" — with its OWN budget, never sharing the correctness scoreboard.

## Cluster A — second scoreboard (the positive heuristic)

### A1 Programme Scorecard

Trigger: every CLOSE. Owner: Archivist. Artifact: `research/programme-scorecard.md`.

The Archivist tags every closed finding with its named programme (`chord-metric fidelity`, `conforming mesher`, `surface-metric quality`) and a label:

- **PROGRESSIVE** — the finding predicted and confirmed a novel fact, OR opened a new capability that was not previously measurable.
- **CONSERVATIVE** — the finding confirmed or refuted an existing expectation within the current frame; no novel fact emerged.
- **DEGENERATING** — the finding added an exclusion or exception (an accept-class, a special-case carve-out) with no novel fact to compensate.

The scorecard tracks a rolling novel-facts-vs-exceptions ratio and a trend arrow across the programme's history. **K=3 consecutive non-progressive (CONSERVATIVE or DEGENERATING) findings auto-triggers an Inversion Round** — the PI issues a C2 INVERT ticket on the programme's highest-blast-radius assumption — this is not a kill, it is a prompt to attack the frame. A programme line is shelved only after an honest inversion *also* yields no novel fact.

*Grounded: the 2026-06-15 Stage-1 transcript is a textbook degenerating signature — six consecutive true-but-incremental refutations ending in "accept 5 lattices as a floor," later overturned by crease-density. The scorecard would have triggered an inversion after finding 3.*

### A2 Positive-heuristic gate

Trigger: every hypothesis. Owner: Theorist (fact) + Skeptic (bet). Artifact: hypothesis schema fields `predictedNovelFact` + `surprisalToRival`.

Every hypothesis submitted to the lab must include two required fields alongside the kill-criterion:

- **`predictedNovelFact`** — a concrete, quantified fact the current model does *not* predict: a number, a sign, or a monotonicity that the rival frame would predict differently. A vague directional claim ("it will be better") does not satisfy this field; a specific bound or sign-flip does.
- **`surprisalToRival`** — the Skeptic bets against the predicted novel fact **on record** before any probe runs. A fact no one would bet against (a universally-expected outcome) scores zero surprisal and licenses no lab meeting; the Theorist must sharpen the claim until at least one agent would genuinely bet against it. The Experimentalist tests the *prediction*, not who won the debate.

The gate is enforced by the PI at hypothesis intake: a hypothesis without both fields is returned to the Theorist for sharpening, not dispatched to the Experimentalist.

*Grounded: Lakatos — progressive programmes predict novel facts. The crease-density prediction ("density WILL close the chord if maxLevel lifts past L10") is exactly the forecast the degenerating accept-floor framing never dared make. Had this gate been active, the "irreducible floor" framing would have been forced to produce a discriminating prediction on round one.*

---

## Cluster B — anti-closure

### B1 Anomaly / Surprise Ledger

Trigger: any result >2x off prediction / oracle-vs-kernel gap / expected-change-that-didn't-happen. Owner: Archivist. Artifact: transcript `## SURPRISES`.

A `## SURPRISES` section lives in every lab arc transcript, Archivist-owned. The Experimentalist and Oracle-keeper **must** log any result that clears the magnitude bar:

- a measured outcome >2× off the prediction,
- an oracle-vs-kernel disagreement beyond tolerance,
- or an expected change that did not happen (e.g. a lever that provably should have moved the metric but didn't).

Each logged surprise is an **OPEN ASSET whose priority rises the longer it stays unexplained** — the inverse of a bug-backlog. This priority is visible in the scorecard so high-age surprises are surfaced at every convene.

**The PI cannot mark a question CLOSED while tied unexplained surprises remain.** Each open surprise must be either: (a) explained by the closing hypothesis (explanation archived), or (b) promoted to a new hypothesis row feeding the inversion queue. A surprise is never silently dropped.

The sole exception: a stale surprise may close as **noise**, but only via the Metrologist with a one-line instrument reason *and* a positive test — e.g. "the anomaly was a reference under-statement; confirmed by nRing density-invariance check" — never by lapse of attention.

*Grounded: "256-ref inflated ~2.6×" and the Voronoi/CelticKnot "irreducible hash floor" were surprises closed as noise; the cap-not-floor reframe was frozen as a "floor" across multiple entries before being reopened. B1 would have made the floor assumption an un-closeable debt with rising priority.*

### B2 Close-gate pre-mortem + expiring settlement

Trigger: every CLOSE (a); new instrument ships / tagged assumption challenged (b). Owner: Metrologist (a) + Archivist (b). Artifact: transcript `## CLOSE-GATE RECEIPTS` + `## ASSUMPTIONS TOUCHED`.

Two paired changes to closure:

**(a) Pre-mortem before every CLOSE.** Before a finding is marked CLOSED, the Metrologist posts 3 concrete "here is how this just-trusted ruler could still be lying" failure modes drawn from the known instrument-failure catalogue (band-limited reference, quantization, sampler aliasing, config-blind gate, UV-only test standing in for true-3D). For each failure mode the Metrologist also supplies a **runnable in-probe trap** — a cheap test the PI can execute inline (examples: crossing-count>0 check for planarization; smooth-control<1.3 for the aliasing window-max; brute-force nearest cross-check on the single worst facet). The PI runs the single cheapest trap. Only the finding that survives the trap is CLOSED; the failure-mode list and trap result are archived as a **reference-trust receipt** in `## CLOSE-GATE RECEIPTS`.

**(b) Expiring settlement tags.** Each closed verdict is tagged in the transcript with: the instrument that closed it + the assumptions it relied on. When a **new instrument ships** or a **tagged assumption is challenged** (e.g. a new probe reveals the reference was band-limited), the Archivist auto-flags every verdict dependent on that instrument or assumption as **reopen-eligible**, and surfaces it at the next convene.

**Reopen the Cornerstone slot:** once per N=5 cycles, the Archivist publishes and attacks the single most load-bearing, least-recently-retested belief in the entire registry — not because there is new evidence against it, but because its age is itself a risk.

*Grounded: the crest-serration false-zero (mesh measured against the same band-limited sampler that set the reference); "band-limited grid ref UNDER-states chord"; "GPU-verify overturned 2/4 sub-agent fixes"; the FRONTIER-BET3 false positive (minA 32 CONFIRM on an 8-tri metric-ignored mesh, later killed by smooth-control<1.3). Every one of these would have been caught by a metrologist pre-mortem trap.*

---

## Cluster C — attack the frame

### C1 Standing Oracle Disagreement Bounty

Trigger: rotating schedule, even with no hypothesis open. Owner: Oracle-keeper. Artifact: top-3 divergence report → PROGRESSIVE-candidate hypotheses.

Re-charter of Oracle-keeper from "ground truth on demand" to a **standing adversary whose success metric is finding inputs where an external engine most beats or contradicts the kernel.** On a rotating schedule — even when no hypothesis is currently open — the Oracle-keeper runs an `argmax|kernel − oracle|` search over the style/param space, including configurations the kernel currently passes, and reports the top-3 divergences each cycle with a cross-domain note (e.g. "gmsh solves this by anisotropic metric adaptation — does our pipeline even have that lever?").

Any convention-clean oracle beat becomes a **pre-registered PROGRESSIVE-candidate hypothesis**, injected directly into the hypothesis pile for the next convene.

**Guard:** the Metrologist must rule out units/convention artifacts before any claimed beat is registered. Every claimed beat must pass an equal-footing/equal-target control (same style, same target resolution, same fidelity instrument) plus a reference-trust self-check — specifically the anisotropic-validity gate that caught the silently-dropped BAMG metric (an oracle win on a different optimality criterion is not a contradiction; it must be the same criterion). A beat that fails the guard is logged as a **note**, not a hypothesis.

*Grounded: E-2026-06-26 — gmsh-iso CAD-grades all 5 tangled lattices at 110–213× fewer triangles; this oracle disagreement was found late and by accident. C1 industrializes that reframe by making it a standing scheduled search.*

### C2 Assumption Ledger + scheduled Inversion

Trigger: every 3rd closed question OR a DEGENERATING flag. Owner: Archivist (ledger) + Theorist (inversion). Artifact: `research/assumption-ledger.md`.

`research/assumption-ledger.md`, Archivist-owned. Each row contains:

| field | content |
|---|---|
| assumption | the load-bearing belief, stated as a falsifiable claim |
| who-relies-on-it | which programmes / instruments / findings depend on it |
| measured blast radius | estimate of how many findings are invalidated if negated |
| cheapest flip probe | the cheapest test that would discriminate assumption vs negation |
| last-inverted date | when this assumption was last attacked |
| evidence-for | citations from the registry supporting it |
| REFUTED-flips | documented flip attempts with kill-evidence, so dead ends aren't re-proposed |

Every closed finding **cites an assumption it relied on** (confirming it) or adds a newly-noticed one. On cadence (every 3rd closed question, or when the programme scorecard flags DEGENERATING) the PI issues an **INVERT ticket on argmax(blast-radius × age-since-inverted)**: the Theorist argues the negation *as if true* and must output a **discriminator** — a probe whose two branches produce different numbers on an instrument the Metrologist already trusts — not a rhetorical argument. The discriminator is dispatched to the Experimentalist.

*Grounded: the three historic reframes were assumption inversions — EXCLUDE→extract, irreducible-floor→depth-cap, hMin-is-the-knob→false. The ledger makes the hard core visible and the pre-committed-discriminator column prevents inversion from becoming debate. Honest caveat: the selector (blast-radius × age) solves "which assumption to attack" — a problem the real reframes weren't actually blocked on. Keep this lean; the value is visibility, not ceremony.*

### C3 Rotating Outsider seat + naive-question quota

Trigger: per convene (optional). Owner: Outsider. Artifact: one cross-domain reframe into the hypothesis pile.

The 8th stateless throwaway seat (see roster §3). Seeded each cycle from a **deliberately non-adjacent domain** (SLAM, map-projection, information theory, statistical physics, structural mechanics). One turn, no vote, no probe budget:

- "Restate the current problem as it would appear in your domain."
- "Name one instrument or analogy your field reaches for in this situation."

Output feeds either: (a) the Theorist's hypothesis pile, or (b) the Oracle-keeper's oracle backlog (e.g. "a GIS practitioner would resample with kriging — is there an analogue for our reference field?"). A bad seed costs one cheap turn and dies at the ruler.

**Plus a naive-question quota:** one question per meeting that an expert would call stupid, answered without jargon. This forces the frame to be stated plainly enough that a non-expert could hold it.

Role is **generative-only, no vote** — the Outsider may not block a hypothesis or adjudicate a finding. Its contribution is exclusively additive to the hypothesis pile.

*Adopted as a lottery ticket. Honest caveat: no historical reframe in the PotFoundry registry traces to a cross-domain seed; the Diversity Prediction Theorem's inferential gap is large in highly-specialized numerical settings. Hence generative-only, no vote, one turn.*

---

## Cluster D — anti-mortality

### D1 Adversarial-collaboration close-out

Trigger: PROGRESSIVE / high-blast-radius hypotheses. Owner: Theorist + Skeptic. Artifact: transcript block {agreedRestatement, jointProbeDesign, preCommittedOutcomeMap, mindChangeTrigger}.

For any hypothesis labelled PROGRESSIVE (by A2 surprisal threshold) or carrying high blast radius (affects ≥3 load-bearing assumptions), before the Experimentalist runs anything, the Theorist and Skeptic must jointly post a structured pre-commitment block:

```
agreedRestatement:    each states the other's claim acceptably (both must sign off)
jointProbeDesign:     both agree on one fair test (instrument, controls, sample)
preCommittedOutcomeMap: for every measurable branch of the probe:
                        result X ⇒ conclusion Y (including "this changes my mind")
mindChangeTrigger:    the single number / sign that would flip each party
```

**DISTINCT-prediction certification:** The Skeptic must certify, before the probe runs, that the two frames (the hypothesis and its rival) make **distinct non-vacuous instrument predictions** — i.e. the rival frame would predict a different number on the chosen instrument. A rival frame that predicts the same numbers is rejected as non-diagnostic; the Theorist must sharpen the hypothesis until the two frames diverge. This certification is what makes D1 a gate, not a ritual.

The Archivist stores the pre-commitment block so that post-hoc reinterpretation is detectable (the verdict must be consistent with the pre-committed outcome map). The PI's role shifts from "picks the probe" to "enforces joint ownership + pre-mapped outcomes."

*Grounded (Kahneman–Klein 2009): the radial-defect vs radial-ruler-artifact frames predict the SAME chord but DIFFERENT true-3D numbers — certifying distinct predictions would have named the true-3D probe as decisive on round one instead of after N accept-class dead-ends. D1 is the mechanism that forces this earlier.*

### D2 Champion + steelman-before-refute ordering

Trigger: high-stakes conjectures. Owner: Skeptic (rotates to Champion). Artifact: ordering rule in the meeting loop.

On high-stakes conjectures (PROGRESSIVE by A2 or blast-radius ≥3), the Skeptic rotates into **Champion** for a steelman round before refutation is permitted. The Champion must:

1. State the conjecture in its strongest form (not the form easiest to refute).
2. Name the best evidence or mechanism that would support it — including evidence the Theorist may not have cited.
3. Set the kill-bar commensurately: "show it's wrong **AND** no cheap instrument could rescue it" — a refutation that leaves a plausible cheap rescue open does not clear the bar.

Only after the steelman round does the Skeptic resume the refutation role. This ordering is enforced by the PI as a meeting rule (the PI rejects a refutation that was posted before steelman).

*Grounded: "accept-floor survived round 1" because the cheap rescue (maxLevel++/maxSag−−) was under-pursued. A steelman-first ordering would have surfaced "try lifting the depth cap" as a rescue candidate before the floor was cemented.*

### D3 Exploration tithe + protected minority report

Trigger: ~15–20% of probe cycles; any agent may dissent. Owner: Experimentalist (tithe) + any agent (dissent). Artifact: SURPRISES entries + an un-adjudicated-away dissent with its own budget.

Two paired anti-mortality mechanisms:

**(a) Exploration tithe.** Approximately 15–20% of probe cycles are explicitly **not tied to any registered hypothesis**: the Experimentalist runs labkit on the weirdest / hardest inputs and sweeps parameters *past their normal operating range* — not to test a prediction, but to report "the strangest thing I saw" straight into the Anomaly Ledger (B1). No obligation to resolve, explain, or classify the finding at time of logging. The tithe is **protected as the last budget cut under deadline**, not the first; cutting it is logged as a deliberate tradeoff, not a silent drop.

**(b) Protected minority report.** Any agent may register a **DISSENT** — a belief that the PI's adjudication is wrong or incomplete. The PI is **forbidden to adjudicate away** a registered DISSENT: it must carry its own probe budget and remain open until measurement resolves it. If a dissent clears the A2 repricing bar (predictedNovelFact + surprisalToRival), it is elevated to a full hypothesis with lab resources. For high-stakes forks, the PI must steelman the losing side before closing; a divergent-meeting mode forwards raw agent outputs verbatim (no PI summarization of a live disagreement). Track a dissent hit-rate (dissents that later produced a finding vs. total dissents) across arcs.

*Grounded: pushing maxSag/maxLevel past the assumed L10 floor — a range a hypothesis-servicing economy has no reason to visit — is literally the motion that produced cap-not-floor. An exploration tithe would have made that out-of-range sweep scheduled, not accidental.*

---

## Down-graded (kept minimal)

**Twin-Instrument mandate:** keep ONLY a `delta(twin)` registry column + a "twins-agreed-then-both-wrong" log (catches the band-limited-vacuous-agreement trap, e.g. LowPoly@512 vs @1024 where both instruments understated). Do NOT add the full ceremony. (spec §5 down-graded.)

---

## Copied frontier machinery

> Copied verbatim from `.claude/skills/meshing/meshing-frontier/SKILL.md` so the lab is
> self-contained. Do NOT edit the frontier file; edits belong here.

### What this machinery is for

`meshing-research` CLOSES a hypothesis (falsify fast, measure, classify confirmed/refuted/no-op). That discipline is why this project never ships a false victory — but it biases toward *closing* questions: hit a wall, label it EXCLUDE, move on. This machinery does the opposite job. It turns a wall INTO the thesis, generates diverse bold approaches grounded in the literature + the oracles, races them, and picks the one that changes a load-bearing ASSUMPTION — then hands the winner to `meshing-research` for ruthless validation.

**Core principle:** a wall is not a verdict — it is the most valuable research question in the registry. The frontier move changes the **REPRESENTATION, the CONSTRAINT MODEL, or the METRIC SPACE — never a scalar lever.** Boldness upstream, falsification downstream; you may skip neither.

### The steelman → ground → tournament loop

**Step 0 — Meta-synthesize the registry FIRST.**
Read ALL of `research/EXPERIMENT-REGISTRY.md` (+ `docs/AGENT_CONTEXT_DISTILLED.md` §7). Name the pattern across the WALLS and across the WINS — the unifying pattern is usually the real thesis, and attacking one wall in isolation misses it. (This arc: every wall — u-seam, weave/braid occlusion, arch-apex junction, near-C0 crease, CPU↔GPU hash — was a DISCONTINUITY.) See `research/FRONTIER-THESIS.md` for the current standing thesis; update it.

**Step 1 — Frame the wall as the thesis.**
State the load-bearing ASSUMPTION that is failing in one sentence (e.g. "we assume a feature is a straight (u,t) constraint chord — false across an occlusion step, so locking one cuts the surface").

**Step 2 — Steelman ≥3 fundamentally different approaches.**
Each must change a DIFFERENT load-bearing assumption (representation / constraint model / metric space / algorithm class). Each must be GROUNDED — pull the SOTA (`WebSearch`, context7 via ToolSearch, the `tessellation-knowledge` skill, the `oracle-harness` engines). **No approach may be "tune the existing lever"** — that belongs to `meshing-research`, not here.

**Step 3 — Race them (idea tournament).**
Use a **Workflow**: implement each as the CHEAPEST proxy that still exercises its mechanism, score on a FRONTIER target, judge with an independent panel, synthesize the winner + GRAFT the runners-up's best ideas. Diversity beats one-idea-iterated when the solution space is wide.

**Step 4 — Oracles as TEACHERS, not ceilings.**
Don't just benchmark gmsh/Blender — MINE their mechanism and transplant it (QuadriFlow cross-field to seed ours; BAMG's metric-point decisions; libigl's intrinsic-Delaunay for the crossing-constraint wall). "The oracle scores 47°, we score 46.5°" is benchmarking, not invention.

**Step 5 — Hand the winner to `meshing-research`.**
Pre-register a kill-criterion and validate on the real-style GPU sweep with the honest instruments. Ideation was divergent + kill-criterion-exempt; validation is convergent, measured, and honest. A bold idea is a HYPOTHESIS, not a result.

**Step 6 — Record.**
Record the frontier thesis, the tournament (incl. the losers — negative results narrow the frontier), and the winner in `research/EXPERIMENT-REGISTRY.md`; refresh `research/FRONTIER-THESIS.md`.

### Frontier targets — set a bar the current paradigm CANNOT hit

Invention only happens when the target is infeasible without a new idea. Good frontier targets:
- "make the weave/braid EXCLUDE class CONFORM (true-3D not worse + slivers down)"
- "beat gmsh's triangle count **3×** at equal true-3D fidelity"
- "zero feature-adjacent slivers at **¼** the triangles"
- "one discontinuity-first mechanism handles ALL wall classes (seam / occlusion / junction / crease)"

A *matching* target — "CAD-grade", "watertight", "match gmsh" — is a research target, not a frontier one.

### Guardrails (do NOT trade these away for boldness)

- Ideation may be wrong half the time — fine, BECAUSE the downstream falsification loop is a ruthless net. But you MUST run that net. Never ship an unvalidated bold idea as a result.
- Measurement-first still governs VALIDATION; the ideation phase is kill-criterion-exempt ONLY until an approach is chosen.
- Dev-only / flag-gated / byte-identical-off / shared-branch commit hygiene / audit-by-index / GPU hygiene — all still apply (see `meshing-research` + the agent def).
- TRUE-3D-first metric discipline (radial overstates near-vertical 2–27×) still governs every measured claim.

### Red flags — you have slid back into incremental mode

- Attacking one wall without the step-0 registry meta-synthesis.
- An "approach" that only tunes a scalar / an existing `__pfConforming*` lever.
- Only one approach considered; no literature grounding.
- Declaring EXCLUDE/accept without a documented assumption-CHANGE attempt.
- Shipping a bold idea as a result without the `meshing-research` validation pass.

---

## The combined meeting loop

```
GENERATIVE (own scoreboard/budget) ──► FALSIFICATION (audit-first gate) ──► ANTI-CLOSURE
  Outsider/Theorist propose               Champion steelman (D2)              close-gate pre-mortem (B2a)
  Assumption Ledger inversion (C2)   ►    Skeptic refute + kill-criterion     surprises resolved/promoted (B1)
  Oracle disagreement bounty (C1)         Metrologist certify instrument      Programme label + scorecard (A1)
  positive-heuristic: predictedNovelFact  adversarial-collab pre-commit (D1)  expiring settlement tags (B2b)
    + surprisalToRival bet (A2)           Experimentalist MEASURES ──► PI adjudicates ──► Archivist records
  exploration tithe feeds anomalies (D3)
```

Novelty is generated and scored on the left; correctness is still *only* granted by measurement in the middle; closure is guarded on the right so the raw material of the next reframe isn't sealed away.

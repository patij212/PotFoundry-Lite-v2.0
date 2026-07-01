# The PotFoundry Meshing Lab — a standing adversarial research team

- **Date:** 2026-07-01
- **Status:** DESIGN (awaiting user review → implementation plan)
- **Author:** PI (main loop) + a 17-agent breakthrough-mechanism research pass (wf_7374a0b0-648)
- **Supersedes / extends:** the solo `meshing-researcher` agent + its two modes (`meshing-research`, `meshing-frontier`)

---

## 1. Motivation

Today PotFoundry meshing research runs as **one deep solo researcher** (`meshing-researcher`, opus) dispatched into two modes, plus occasional **stateless fan-out** via `Workflow`. The user wants to move to a **team of scientists working together** to fix four things at once:

1. **Blind spots / groupthink** — one agent talks itself into a conclusion; we want independent adversarial perspectives that genuinely disagree and catch each other's errors.
2. **Throughput / parallelism** — investigations are serial; we want many probes/styles/hypotheses in flight, all measured the same way.
3. **Frontier depth** — the hard open problems need sustained multi-angle collaboration carrying a thesis across many experiments.
4. **Orchestration overhead** — the user is currently the router; the team should self-coordinate via an encoded protocol.

## 2. The core insight (the thing that makes this worth building)

A research team that only *falsifies* produces a pile of **true-but-incremental** findings and never a breakthrough. This was validated against PotFoundry's own registry: **all three historic breakthroughs were REFRAMES that were not yet measurable at conception:**

- *"The ruler is wrong"* — radial chord overstates true-3D 2–370× on near-vertical relief; unfalsifiable until `perpendicular3DDeviation` (the second ruler) was built.
- *"gmsh CAD-grades lattices ours can't"* (E-2026-06-26) — an external frame contradicting the in-house kernel.
- *"The irreducible floor is a depth-cap (L10), not blindness"* / *"steep = exclude → extract"* — assumption inversions with no discriminator until one was invented.

The load-bearing rule *"a measurement always closes it"* would have **strangled every one of these at birth.**

**Resolution — two engines, two scoreboards, one honest gate:**

- A **generative engine** (positive/Lakatosian heuristic) runs *upstream*, judged by a different currency: not *"is it true?"* but *"if true, how much does it reprice?"* It decides **which hypotheses exist** and **which measurement is most diagnostic.** It has its **own budget and its own scoreboard.**
- The existing **falsification engine** (audit-first) still **closes** every hypothesis by measurement, unchanged.
- The two **never share a scoreboard**, so adding novelty-seeking never corrodes honesty.

> **Invariant (unchanged, load-bearing):** No hypothesis is confirmed on argument alone. Debate only decides *which* measurement to run and *whether the instrument is honest*. A measurement always closes it.

The generative engine adds *hypotheses, assumptions-to-invert, and instruments-to-build*; it never marks anything true.

## 3. Roster

**PI / Director = the main Claude loop.** Holds the thesis + memory, spawns specialists via `Agent`, relays between them via `SendMessage` (agents cannot message each other — the PI is the bus), adjudicates, and enforces the protocol. The PI must be the main loop (sub-agents can't cleanly nest-spawn, and the PI carries the cross-arc thesis).

| Role | Model | Job | Touches code? |
|---|---|---|---|
| **Theorist** | opus | Proposes hypotheses/mechanisms from `tessellation-knowledge` + `FRONTIER-THESIS`. Argues the conjecture. | no |
| **Skeptic → Champion (rotates)** | opus | Refutes the claim + owns kill-criteria. **Per high-stakes conjecture, rotates into Champion**: steelman the idea *first*, kill-bar rises with stakes. | no |
| **Metrologist** | opus | Doubts the **measurement**: true-3D vs radial, non-vacuous controls, reference-trust, band-limited under-statement. Owns the close-gate pre-mortem. | reads labkit |
| **Experimentalist** | opus | Runs the cheapest discriminator probe; measures with labkit (true-3D-first). **Reuses the existing `meshing-researcher` agent.** The only role that runs probes. | **yes** |
| **Oracle-keeper** | opus | **Standing disagreement-hunter** (re-chartered): proactively searches for inputs where gmsh/Triangle/Blender most beat/contradict the kernel — including configs we currently pass. | yes (external engines) |
| **Literature scout** | sonnet+web | Grounds bets in real SOTA; **verifies citations**. | no |
| **Archivist** | sonnet | Owns the registry, transcript, and all three ledgers (assumption / anomaly / programme-scorecard). Surfaces reopenable questions, not just closures. | writes registry |
| **Outsider (optional, throwaway)** | sonnet | 8th stateless seat seeded each cycle from a **deliberately wrong domain** (SLAM, map-projection, information theory, statistical physics). One turn, no vote, no probe budget; feeds the hypothesis pile. | no |

**Persistence discipline:** only the debate trio (Theorist / Skeptic-Champion / Metrologist) persists through an argument; Experimentalist, Oracle-keeper, Literature scout, Archivist, Outsider are **on-call**. This controls the token cost of keeping agents alive.

## 4. The falsification engine (existing, unchanged)

Per-hypothesis meeting loop:

1. Theorist states the hypothesis + mechanism.
2. Skeptic refutes / sets the kill-criterion; Metrologist certifies the honest instrument (front-loading the "the ruler was wrong" catch that historically came *late*).
3. PI relays the strongest objection back to Theorist (≤2–3 rounds).
4. PI forces the cheapest discriminator → Experimentalist measures (+ optional parallel Oracle-keeper cross-check = one-metric-both-meshes).
5. PI adjudicates from the numbers → structured finding (`HYPOTHESIS / DISCRIMINATOR / KILL-CRITERION / EVIDENCE / VERDICT / RECOMMENDATION / LEDGER`).
6. Archivist records verdict + transcript.

Stopping rule: after K rounds the PI forces the cheapest discriminator or parks the question as `needs-experiment`. Rhetoric never wins; measurement is the only tiebreaker.

## 5. The generative engine (the 11 organs, in 4 clusters)

Each organ is graded by whether it would have produced a *specific* real PotFoundry reframe faster: 🟢 strongly grounded · 🟡 cheap/conceptually-central, weaker historical link · 🔵 speculative bet (adopted at user request).

### Cluster A — a second scoreboard (the positive heuristic) — *the spine*

- **A1. Programme Scorecard** 🟢 — `research/programme-scorecard.md`. Archivist tags every closed finding with its named programme (`chord-metric fidelity`, `conforming mesher`, `surface-metric quality`) and a label: **PROGRESSIVE** (predicted+confirmed a novel fact / opened a capability) / **CONSERVATIVE** (confirmed/refuted an existing expectation) / **DEGENERATING** (added an exclusion/exception with no novel fact). Rolling novel-facts-vs-exceptions ratio + trend arrow. **K consecutive non-progressive findings auto-triggers an Inversion Round (not a kill).** A line is shelved only after an honest inversion *also* yields no novel fact.
  *Grounded: the 2026-06-15 Stage-1 transcript is a textbook degenerating signature — six consecutive true-but-incremental refutations ending in "accept 5 lattices as a floor," later overturned by crease-density.*

- **A2. Positive-heuristic gate** 🟡 — extend the hypothesis schema with two required fields alongside the kill-criterion: `predictedNovelFact` (a concrete quantified fact the current model does *not* predict — a number, sign, or monotonicity) and `surprisalToRival` (the Skeptic bets against it **on record** before any probe runs; a fact no one would bet against scores zero and licenses no meeting). The Experimentalist tests the *prediction*, not who won the debate.
  *Grounded: Lakatos — progressive programmes predict novel facts. The crease-density prediction ("density WILL close the chord if maxLevel lifts past L10") is exactly the forecast the degenerating accept-floor framing never dared make.*

### Cluster B — anti-closure (stop sealing the raw material of reframes) — *strongest grounding*

- **B1. Anomaly / Surprise Ledger** 🟢 — a `SURPRISES` section in the transcript, Archivist-owned. Experimentalist and Oracle-keeper **must** log any result past a magnitude bar (>2× off prediction, oracle-vs-kernel disagreement beyond tolerance, or an expected change that didn't happen) as an **OPEN ASSET whose priority *rises* the longer it stays unexplained** (inverse of a bug backlog). **The PI cannot mark a question CLOSED while tied unexplained surprises remain** — each must be explained by the closing hypothesis or promoted to a new hypothesis row (feeding the inversion queue). A stale surprise closes as noise **only** via the Metrologist, with a one-line instrument reason + a positive test — never silent dropping.
  *Grounded: "256-ref inflated ~2.6×" and the Voronoi/CelticKnot "irreducible hash floor" were surprises closed as noise; the cap-not-floor reframe was frozen as a "floor" across multiple entries before being reopened.*

- **B2. Close-gate pre-mortem + expiring settlement** 🟢 — two paired changes to closure. **(a)** Before "CLOSED," the Metrologist posts 3 concrete "here is how this just-trusted ruler could still be lying" failure modes (band-limited reference, quantization, sampler aliasing, config-blind gate) **plus a runnable in-probe trap** (crossing-count>0 for planarization; smooth-control<1.3 for the aliasing window-max; brute-force nearest cross-check on worst facets); the PI runs the single cheapest; only survival closes it, with the failure-mode list archived as a reference-trust receipt. **(b)** Each closed verdict is tagged with the instrument + assumptions that closed it; when a **new instrument ships or a tagged assumption is challenged**, the Archivist auto-flags every dependent "settled" result as **reopen-eligible.** Plus a standing "Reopen the Cornerstone" slot: once per N cycles, publish and attack the most load-bearing, least-recently-retested belief.
  *Grounded: the crest-serration false-zero (mesh measured against the same band-limited sampler); "band-limited grid ref UNDER-states chord"; "GPU-verify overturned 2/4 sub-agent fixes"; the FRONTIER-BET3 false positive (minA 32 CONFIRM on an 8-tri metric-ignored mesh, later killed by smooth-control<1.3).*

### Cluster C — attack the *frame*, not the claim (break the monoculture)

- **C1. Standing Oracle Disagreement Bounty** 🟢 (medium cost) — re-charter Oracle-keeper from "ground truth on demand" to a standing adversary whose success metric is **finding inputs where an external engine most beats/contradicts the kernel.** On a rotating schedule even with no hypothesis open, it runs an `argmax|kernel − oracle|` search over the style/param space (including configs we currently pass) and reports the top-3 divergences each cycle with a cross-domain note ("gmsh solves this by anisotropic metric adaptation — does our pipeline even have that lever?"). Any convention-clean beat becomes a pre-registered PROGRESSIVE-candidate. **Guard:** the Metrologist must rule out units/convention artifacts; every claimed beat passes an equal-footing/equal-target control + reference-trust self-check (the aniso-validity gate that caught the silently-dropped BAMG metric).
  *Grounded: E-2026-06-26 — gmsh-iso CAD-grades all 5 tangled lattices at 110–213× fewer triangles; this industrializes that reframe.*

- **C2. Assumption Ledger + scheduled Inversion (TRIZ negate-the-frame)** 🟡 — `research/assumption-ledger.md`, Archivist-owned: each row = {load-bearing assumption, who-relies-on-it, measured blast radius, cheapest flip probe, last-inverted date, evidence-for, REFUTED-flips with kill-evidence}. Every closed finding cites an assumption it relied on or adds a newly-noticed one. On cadence (every 3rd closed question, or when a line is flagged degenerating) the PI issues an **INVERT ticket on argmax(blast-radius × age-since-inverted)**: the Theorist argues the negation as if true and must output a **discriminator** (a probe whose two branches produce different numbers on an instrument the Metrologist already trusts), not an argument.
  *Grounded: EXCLUDE→extract, irreducible-floor→depth-cap, hMin-is-the-knob→false. Honest caveat: the selector solves "which assumption to attack," a problem the flips weren't actually blocked on — keep this lean; the value is making the hard core visible + the pre-committed discriminator column.*

- **C3. Rotating Outsider seat + naive-question quota** 🔵 — the 8th throwaway seat (see roster). One turn: "restate the current problem in your domain and name one instrument/analogy your field reaches for." Output feeds Theorist (hypothesis pile) or Oracle-keeper (oracle backlog, e.g. "a GIS person would resample with kriging — is there an analog for our reference field?"). Plus a naive-question quota: one question per meeting an expert would call stupid, answered without jargon. A bad seed costs one cheap turn and dies at the ruler.
  *Adopted as a lottery ticket. Honest caveat: no historical reframe traces to a cross-domain seed; the Diversity Prediction Theorem's inferential gap is large — hence generative-only, no vote.*

### Cluster D — anti-mortality (keep fragile-but-important ideas alive until measurable)

- **D1. Adversarial-collaboration close-out** 🟢 — for PROGRESSIVE / high-blast-radius hypotheses, before the Experimentalist runs anything, Theorist and Skeptic post: `agreedRestatement` (each states the other's claim acceptably), `jointProbeDesign` (both sign off on one fair test), `preCommittedOutcomeMap` (result X ⇒ conclusion Y for every branch, including "this changes my mind"), `mindChangeTrigger`. **The Skeptic must certify the two frames make DISTINCT non-vacuous instrument predictions** (a rival frame predicting the same numbers is rejected as non-diagnostic). Archivist stores the pre-commitment so post-hoc reinterpretation is detectable. PI shifts from "picks the probe" to "enforces joint ownership + pre-mapped outcomes."
  *Grounded (Kahneman-Klein 2009): the radial-defect vs radial-ruler-artifact frames predict the SAME chord but DIFFERENT true-3D numbers — certifying distinct predictions names the true-3D probe as decisive on round one instead of after N accept-class dead-ends.*

- **D2. Champion + steelman-before-refute ordering** 🟡 — (see roster; folds into the Skeptic's rotation). Steelman round precedes refutation; kill-bar rises with stakes ("show it's wrong AND no cheap instrument could rescue it").
  *Grounded: "accept-floor survived round 1" because the cheap rescue (maxLevel++/maxSag−−) was under-pursued.*

- **D3. Exploration tithe + protected minority report** 🟡 — **(a)** ~15–20% of probe cycles explicitly **not** tied to any registered hypothesis: the Experimentalist runs labkit on the weirdest/hardest inputs and sweeps parameters *past their normal range*, reporting "the strangest thing I saw" straight into the Anomaly Ledger with no obligation to resolve it — protected as the *last* budget cut under deadline, not the first. **(b)** Any agent may register a **DISSENT the PI is forbidden to adjudicate away**; if it clears the repricing bar it carries its own probe budget. For high-stakes forks the PI must steelman the losing side before closing; a divergent meeting mode forwards raw agent outputs verbatim (no PI summarization). Track a dissent hit-rate.
  *Grounded: pushing maxSag/maxLevel past the assumed L10 floor — a range a hypothesis-servicing economy has no reason to visit — is literally the motion that produced cap-not-floor.*

### Down-graded (kept minimal)

- **Twin-Instrument mandate** — your existing "one metric, both meshes" practice already covers this. Keep **only** the cheap `delta(twin)` registry column + a "twins-agreed-then-both-wrong" log (catches the band-limited-vacuous-agreement trap, e.g. LowPoly@512 vs @1024). Do **not** add the full ceremony.

## 6. The combined meeting loop

```
GENERATIVE (own scoreboard/budget) ──► FALSIFICATION (audit-first gate) ──► ANTI-CLOSURE
  Outsider/Theorist propose               Champion steelman (D2)              close-gate pre-mortem (B2a)
  Assumption Ledger inversion (C2)   ►    Skeptic refute + kill-criterion     surprises resolved/promoted (B1)
  Oracle disagreement bounty (C1)         Metrologist certify instrument      Programme label + scorecard (A1)
  positive-heuristic: predictedNovelFact  adversarial-collab pre-commit (D1)  expiring settlement tags (B2b)
    + surprisalToRival bet (A2)           Experimentalist MEASURES ──► PI adjudicates ──► Archivist records
  exploration tithe feeds anomalies (D3)
```

Novelty gets generated and scored on the left; correctness is still *only* granted by measurement in the middle; closure is guarded on the right so the raw material of the next reframe isn't sealed away.

## 7. Persistence & resilience

The environment kills long runs (6+ multi-hour agents lost in the prior arc). Therefore:

- **Durable state = files, not agent memory:** `research/lab/<arc>-transcript.md` (append-only, includes the `SURPRISES` section), `research/assumption-ledger.md`, `research/programme-scorecard.md`, `research/EXPERIMENT-REGISTRY.md`. A killed lab resumes by re-reading these + re-spawning the trio with "here's where we were."
- **Debate is cheap & disposable** (reasoning only). **Heavy measurement** goes through the existing env-gated resumable-probe convention (one probe per question, checkpoint each unit to disk the instant it's computed).
- **Commit hygiene (shared branch):** stage only the lab's exact files (`git add <files>` then `git commit -- <files>`); never `git add -A`; never sweep the concurrent-workstream WIP files.

## 8. Deliverables

- A new **`meshing-lab` skill** = the standing-lab protocol the PI follows: role charters, the combined meeting loop, the audit-first invariant, the generative organs, the ledgers, the transcript convention, the stopping rule.
- **Role charters** live in the skill (debate roles need only Read/Grep/Glob/WebSearch). **Experimentalist reuses `meshing-researcher`**; Oracle-keeper reuses it in oracle mode.
- **Three ledger files** scaffolded under `research/` + one line each in `LAB-CHEATSHEET.md`.
- A **mode-selector**: solo `meshing-researcher` for a cheap sweep; **convene the lab** for a contested finding, a frontier wall, a degenerating programme, or anything you want adversarially trusted.

## 9. Explicitly rejected (recorded so it isn't re-proposed)

**"Instrument-Invention track with protected incubation"** (suspend kill-criteria while building a new ruler) — **CUT** by the adversarial pass. Its premise (audit-first "would have strangled the reframes") is false: `perpendicular3DDeviation` was built cheap *inside* the audit-first loop (byte-identical radial path). Worse, suspending the Skeptic is exactly when new rulers hide artifacts — two registry catches (the Gauss-Newton local-minima *overstatement*; the denseN/nRing confound) survived only because the honest gate was ON. Judging by "repricing potential" instead of falsifiability at *close* time would have shipped both as "instrument wins." The generative engine may *propose* building a ruler and score it by repricing — but the ruler, once built, is still gated by measurement like everything else. **"Build the missing ruler" is a first-class hypothesis, not a license to suspend the gate.**

## 10. Honest grounding gradient

Not all organs are equal. **Strongest (would have produced a specific reframe faster):** Anomaly Ledger (B1), Close-gate pre-mortem + expiring settlement (B2), Programme Scorecard (A1), Oracle Disagreement Bounty (C1), Adversarial-collaboration close-out (D1). **Cheap & conceptually central, weaker historical link:** Positive-heuristic gate (A2), Assumption Ledger (C2), Champion (D2), Exploration tithe (D3). **Speculative bets (user-adopted lottery tickets):** Outsider seat (C3), `delta(twin)` column. The spec keeps all of them per the scope decision, but the plan should sequence the strongly-grounded organs first.

## 11. Tradeoffs & cost controls

- **Cost:** a convened lab is far more token-heavy than one dispatch (multiple opus agents, multi-round, two scoreboards). Controls: lab is **opt-in** for high-stakes questions; **trio-persists / rest-on-call**; the generative engine has its **own bounded budget** separate from probe cycles.
- **PI is still the executor** (message bus). This reduces orchestration *decisions* (the protocol encodes them) but not involvement. A fully autonomous PI-agent is a possible v2 but fights nesting limits.
- **Ceremony risk:** 11 organs is a lot. The transcript + the "own scoreboard, never shared" rule keep novelty-seeking from bloating correctness work; the plan should let organs be toggled per-arc.

## 12. Success criteria (DoD)

1. A convened lab, given a contested question, produces a structured finding **and** at least one scorecard label + one assumption-ledger entry + (if any) a logged surprise — i.e. it feeds both engines.
2. The audit-first invariant holds: no finding is `confirmed` without a measurement; a spot-check of the transcript shows every closure passed the close-gate pre-mortem.
3. A killed lab resumes from the transcript + ledgers with no lost verdicts.
4. On a real arc, the lab surfaces at least one **reopen-eligible** prior closure or one **degenerating-programme** flag the solo agent would have missed — the concrete test that the generative engine earns its cost.

## 13. Open questions for the implementation plan

- Cadence constants (K for auto-invert; N for "Reopen the Cornerstone"; the exploration-tithe %).
- Ledger file formats (markdown tables vs ndjson) — must be append-only and resumable.
- How the `meshing-lab` skill and the existing `meshing-frontier` skill compose (the lab is the multi-agent realization of frontier's steelman→tournament — does frontier become a *phase inside* the lab, or a sibling mode?).
- Whether the Outsider seat and Champion rotation are on by default or opt-in per convene.

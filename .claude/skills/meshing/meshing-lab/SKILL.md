---
name: meshing-lab
description: Use to CONVENE a standing adversarial research team (PI + 7-8 specialists) for a CONTESTED meshing finding, a frontier wall, a DEGENERATING programme, or any result you want adversarially trusted — when a single meshing-researcher dispatch would risk groupthink or miss a reframe. For a cheap mechanical sweep, dispatch the solo meshing-researcher instead.
---

# Meshing Lab — standing adversarial research team

You (the main loop) are the **PI**. Agents cannot message each other — you are the bus:
spawn specialists with `Agent`, keep the debate trio alive with `SendMessage`, relay
between them, adjudicate, and checkpoint everything to the ledgers + transcript.

## When to convene (mode-selector)
- Cheap mechanical measurement sweep → **solo `meshing-researcher`**, not the lab.
- Contested finding / frontier wall / a programme flagged DEGENERATING / "I want this
  adversarially trusted" → **convene the lab.**

## Load first
- `charters.md` — paste-ready role prompts. `generative-core.md` — the 11 organs + the
  copied frontier tournament loop. `research/programme-scorecard.md`,
  `research/assumption-ledger.md`, `research/lab/TRANSCRIPT-TEMPLATE.md` — durable state.
- `research/EXPERIMENT-REGISTRY.md`, `research/LAB-CHEATSHEET.md` — prior results + lab reference.

## Roster

**PI / Director = the main Claude loop.** Holds the thesis + memory, spawns specialists via `Agent`, relays between them via `SendMessage` (agents cannot message each other — the PI is the bus), adjudicates, and enforces the protocol.

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

Debate trio (Theorist / Skeptic / Metrologist) persists; the rest are on-call.

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

Novelty gets generated and scored on the left; correctness is still *only* granted by measurement in the middle; closure is guarded on the right so the raw material of the next reframe isn't sealed away.

Per-hypothesis: Theorist states hypothesis + `predictedNovelFact` → Champion steelman
(D2) → Skeptic refute + kill-criterion + `surprisalToRival` → Metrologist certify
instrument → (D1 pre-commit for high-stakes) → PI forces cheapest discriminator →
Experimentalist measures (+ optional parallel Oracle-keeper) → PI adjudicates → close-gate
pre-mortem (B2a) + resolve tied SURPRISES (B1) → Archivist records + labels (A1).

## The invariant
No hypothesis is confirmed on argument alone. Debate only decides which measurement to
run and whether the instrument is honest. A measurement always closes it.

## Stopping rule
After K≤3 debate rounds the PI forces the cheapest discriminator or parks the question as
`needs-experiment`. Rhetoric never wins; measurement is the only tiebreaker.

## Resilience & commit hygiene
Durable state = files, not agent memory. Debate is cheap/restartable from the transcript;
heavy measurement uses the env-gated resumable-probe convention + per-unit disk checkpoints.
Stage only the lab's exact files (`git add <files>` then `git commit -- <files>`); never
`git add -A`; never sweep the concurrent-workstream WIP.

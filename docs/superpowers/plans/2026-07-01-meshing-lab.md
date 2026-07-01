# Meshing Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `meshing-lab` skill — a standing adversarial research team (PI + 7–8 specialists) that adds a *generative* engine upstream of the existing *falsification* engine, so PotFoundry meshing research produces breakthroughs, not just true-but-incremental findings.

**Architecture:** The deliverable is protocol-as-artifacts: one Skill (`SKILL.md` + two reference files), a set of copy-pasteable role charters, and three durable append-only ledger files under `research/`. The PI (the main Claude loop) convenes the lab by following the skill: it spawns specialists via `Agent`, relays between them via `SendMessage`, runs the generative→falsification→anti-closure meeting loop, and checkpoints all state to the ledgers + transcript so a killed run resumes from disk. No runtime code except one dependency-free ledger-format validator.

**Tech Stack:** Markdown skill/charters/ledgers; Node.js (CJS, no deps) for the ledger validator; the existing `meshing-researcher` agent (reused as Experimentalist/Oracle-keeper); `Agent` + `SendMessage` for orchestration; the existing `labkit` instruments + `EXPERIMENT-REGISTRY.md`.

**Testing note (read first):** These artifacts have no unit-test surface. "Tests" here are (a) **presence/format checks** (grep the artifact for required verbatim text, organ IDs, section headers) and (b) one **live smoke-convene** at the end that runs a real minimal lab and asserts the transcript/ledgers show both engines fired. Do not look for vitest/pytest specs for the markdown tasks.

## Global Constraints

Every task's requirements implicitly include these (copied verbatim from the spec):

- **Dev-only.** All new files live under `.claude/skills/`, `research/`, or `docs/`. `src/` must NEVER import any of them.
- **Shared branch, concurrent workstream.** Stage ONLY the task's exact files: `git add <files>` then `git commit -- <files>`. NEVER `git add -A`. Never touch the concurrent-workstream WIP: `ConformingWall.ts`, `WatertightAssembly.ts`, `PeriodicBalancedQuadtree.ts`, `ParametricExportComputer.ts`, `windowHook.ts`, `featConformGreen.test.ts`, `featureConformingMesh.ts`.
- **`meshing-frontier` is UNTOUCHED.** The lab COPIES its steelman→ground→tournament machinery; the file `.claude/skills/meshing/meshing-frontier/SKILL.md` must have an empty `git diff` at the end of every task.
- **Audit-first invariant preserved.** No generative organ marks anything `confirmed`. Verbatim rule that must appear in `SKILL.md`: *"No hypothesis is confirmed on argument alone. Debate only decides which measurement to run and whether the instrument is honest. A measurement always closes it."*
- **Ledgers append-only + resumable.** Every ledger/transcript file is written so a killed run resumes by re-reading it; new rows/sections are appended, never rewritten in place.
- **Reuse, don't duplicate.** The Experimentalist and Oracle-keeper roles DELEGATE to the existing `meshing-researcher` agent; do not re-implement its instruments or method.
- **Source of truth:** `docs/superpowers/specs/2026-07-01-meshing-lab-design.md` (committed). Section references below (§3, §5, etc.) point into it; transcribe the cited content, don't summarize it away.

---

## File Structure

**Create:**
- `.claude/skills/meshing/meshing-lab/SKILL.md` — entry protocol: mode-selector, roster, combined meeting loop, audit-first invariant, stopping rule, resilience + commit hygiene, pointers to the two reference files + the ledgers.
- `.claude/skills/meshing/meshing-lab/charters.md` — the 8 copy-pasteable role charters the PI pastes into `Agent`/`SendMessage` calls.
- `.claude/skills/meshing/meshing-lab/generative-core.md` — the 11 organs (A1–D3) with {trigger, artifact, owner} + the copied frontier steelman→ground→tournament machinery.
- `research/assumption-ledger.md` — organ C2 scaffold (table + usage header).
- `research/programme-scorecard.md` — organ A1 scaffold (table + labels + auto-invert rule).
- `research/lab/TRANSCRIPT-TEMPLATE.md` — transcript convention incl. the `SURPRISES` section (B1) + close-gate receipt (B2).
- `research/lab/validateLedgers.cjs` — dependency-free Node validator for the three ledger/template files.
- `research/lab/_fixtures/broken-scorecard.md` — a deliberately malformed ledger used to prove the validator is non-vacuous.

**Modify:**
- `research/LAB-CHEATSHEET.md` — add the lab pointer + the solo-vs-convene mode-selector lines.

**Untouched but referenced:** `.claude/agents/meshing-researcher.md`, `.claude/skills/meshing/meshing-frontier/SKILL.md`, `research/EXPERIMENT-REGISTRY.md`, `research/bridge/labkit.ts`.

---

## Task 1: Durable ledgers + transcript template + non-vacuous validator

Build the load-bearing durable state first, with a real automated test, so every later artifact references a validated format.

**Files:**
- Create: `research/assumption-ledger.md`, `research/programme-scorecard.md`, `research/lab/TRANSCRIPT-TEMPLATE.md`, `research/lab/validateLedgers.cjs`, `research/lab/_fixtures/broken-scorecard.md`
- Test: `research/lab/validateLedgers.cjs` (self-run against good files + the broken fixture)

**Interfaces:**
- Produces: three ledger files with fixed required structure; `validateLedgers.cjs` which, run as `node research/lab/validateLedgers.cjs <file...>`, exits `0` if every file has its required headers/columns and `1` otherwise. Required structures:
  - `programme-scorecard.md`: a `## Scorecard` table with header row `| date | programme | finding | label | novel-facts:exceptions | trend |` and a `## Auto-invert rule` section.
  - `assumption-ledger.md`: an `## Assumptions` table with header row `| assumption | relied-on-by | blast-radius | flip-probe | last-inverted | evidence-for | refuted-flips |` and a `## Inversion cadence` section.
  - `TRANSCRIPT-TEMPLATE.md`: must contain the headers `## FINDINGS`, `## SURPRISES`, `## CLOSE-GATE RECEIPTS`, `## ASSUMPTIONS TOUCHED`.

- [ ] **Step 1: Write the three ledger/template files**

`research/programme-scorecard.md`:
```markdown
# Programme Scorecard (organ A1)

> Append-only. Archivist-owned. Every CLOSED finding gets one row. Labels:
> **PROGRESSIVE** (predicted+confirmed a novel fact / opened a capability),
> **CONSERVATIVE** (confirmed/refuted an existing expectation),
> **DEGENERATING** (added an exclusion/exception with no novel fact).

## Scorecard

| date | programme | finding | label | novel-facts:exceptions | trend |
|------|-----------|---------|-------|------------------------|-------|

## Auto-invert rule

K = 3. When a single programme accrues K consecutive non-PROGRESSIVE rows, the PI
MUST issue an Inversion Round (organ C2) on that programme — not a kill. A line is
shelved only after an honest inversion ALSO yields no novel fact.
```

`research/assumption-ledger.md`:
```markdown
# Assumption Ledger (organ C2)

> Append-only. Archivist-owned. Every CLOSED finding cites an assumption it relied
> on (add a row if newly noticed). Inversion targets argmax(blast-radius × age).

## Assumptions

| assumption | relied-on-by | blast-radius | flip-probe | last-inverted | evidence-for | refuted-flips |
|------------|--------------|--------------|------------|---------------|--------------|---------------|

## Inversion cadence

Every 3rd closed question, OR when a programme is flagged DEGENERATING, the PI issues
an INVERT ticket on argmax(blast-radius × age-since-inverted). The Theorist argues the
negation as-if-true and MUST output a discriminator (a probe whose two branches produce
different numbers on an instrument the Metrologist already trusts), not an argument.
A surviving flip is re-dated; a breaking flip is a headline reframe.
```

`research/lab/TRANSCRIPT-TEMPLATE.md`:
```markdown
# Lab Transcript — <arc-name> — <date>

> Append-only durable state. A killed lab resumes by re-reading this + the ledgers.
> Copy this file to research/lab/<arc>-transcript.md at convene time.

## THESIS
<the standing question / frontier thesis this arc pursues>

## FINDINGS
<!-- one block per closed hypothesis: HYPOTHESIS / DISCRIMINATOR / KILL-CRITERION /
     predictedNovelFact / EVIDENCE / VERDICT / RECOMMENDATION / LEDGER -->

## SURPRISES
<!-- organ B1: OPEN ASSETS. Any result >2x off prediction, oracle-vs-kernel gap, or
     expected-change-that-didn't-happen. Priority RISES while unexplained. A question
     cannot close while a tied surprise is open. Columns: date | surprise | tied-to |
     score | status(open/promoted/closed-as-noise+reason) -->

## CLOSE-GATE RECEIPTS
<!-- organ B2a: per close, the Metrologist's 3 "how this ruler could still be lying"
     modes + the cheapest trap run + its result. -->

## ASSUMPTIONS TOUCHED
<!-- organ B2b: instrument + assumptions each finding was closed under, for expiry. -->
```

`research/lab/_fixtures/broken-scorecard.md` (missing the `## Auto-invert rule` section and a mangled header — must FAIL validation):
```markdown
# Broken scorecard fixture (intentionally malformed — used to prove the validator bites)

## Scorecard

| date | programme | WRONG | label |
|------|-----------|-------|-------|
```

- [ ] **Step 2: Write the validator**

`research/lab/validateLedgers.cjs`:
```javascript
#!/usr/bin/env node
// Dependency-free format validator for the meshing-lab durable ledgers.
// Usage: node research/lab/validateLedgers.cjs <file...>
// Exit 0 iff every file matches its required structure; else 1 with a reason.
const fs = require('fs');
const path = require('path');

const RULES = {
  'programme-scorecard.md': [
    /^## Scorecard$/m,
    /\|\s*date\s*\|\s*programme\s*\|\s*finding\s*\|\s*label\s*\|\s*novel-facts:exceptions\s*\|\s*trend\s*\|/m,
    /^## Auto-invert rule$/m,
  ],
  'assumption-ledger.md': [
    /^## Assumptions$/m,
    /\|\s*assumption\s*\|\s*relied-on-by\s*\|\s*blast-radius\s*\|\s*flip-probe\s*\|\s*last-inverted\s*\|\s*evidence-for\s*\|\s*refuted-flips\s*\|/m,
    /^## Inversion cadence$/m,
  ],
  'TRANSCRIPT-TEMPLATE.md': [
    /^## FINDINGS$/m,
    /^## SURPRISES$/m,
    /^## CLOSE-GATE RECEIPTS$/m,
    /^## ASSUMPTIONS TOUCHED$/m,
  ],
};

function ruleFor(file) {
  const base = path.basename(file);
  return RULES[base] || RULES[Object.keys(RULES).find(k => base.endsWith(k))];
}

let ok = true;
for (const file of process.argv.slice(2)) {
  const rules = ruleFor(file);
  if (!rules) { console.error(`SKIP (no rule): ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  const missing = rules.filter(re => !re.test(text));
  if (missing.length) {
    ok = false;
    console.error(`FAIL ${file}: missing ${missing.map(String).join(', ')}`);
  } else {
    console.log(`OK   ${file}`);
  }
}
process.exit(ok ? 0 : 1);
```

- [ ] **Step 3: Run the validator — good files PASS, broken fixture FAILS**

Run:
```bash
node research/lab/validateLedgers.cjs research/programme-scorecard.md research/assumption-ledger.md research/lab/TRANSCRIPT-TEMPLATE.md
```
Expected: three `OK` lines, exit `0`.

Then run against the broken fixture:
```bash
node research/lab/validateLedgers.cjs research/lab/_fixtures/broken-scorecard.md; echo "exit=$?"
```
Expected: a `FAIL` line naming the missing `## Auto-invert rule` + mangled header, and `exit=1`. (This proves the validator is non-vacuous.)

- [ ] **Step 4: Commit**

```bash
git add research/assumption-ledger.md research/programme-scorecard.md research/lab/TRANSCRIPT-TEMPLATE.md research/lab/validateLedgers.cjs research/lab/_fixtures/broken-scorecard.md
git commit -- research/assumption-ledger.md research/programme-scorecard.md research/lab/TRANSCRIPT-TEMPLATE.md research/lab/validateLedgers.cjs research/lab/_fixtures/broken-scorecard.md -m "feat(meshing-lab): durable ledgers + transcript template + non-vacuous validator"
```

---

## Task 2: Role charters

The 8 copy-pasteable charters the PI pastes into `Agent`/`SendMessage`. Each charter is a self-contained prompt.

**Files:**
- Create: `.claude/skills/meshing/meshing-lab/charters.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a file with one `## <Role>` section per role, each containing `**Mandate:**`, `**Inputs:**`, `**Outputs:**`, `**Honesty rule:**` lines. The Experimentalist and Oracle-keeper charters must contain the literal string `meshing-researcher` (they delegate, not re-implement).

- [ ] **Step 1: Write the charters file**

Create `.claude/skills/meshing/meshing-lab/charters.md`. Transcribe the roster + jobs from spec §3 into 8 charter blocks. Each block MUST have the four bold fields. Required content per role (expand each into a paste-ready prompt):

```markdown
# Meshing Lab — Role Charters

> The PI pastes these into `Agent(...)` to spawn a specialist, and into
> `SendMessage(...)` to continue one. Debate trio (Theorist / Skeptic / Metrologist)
> persists through an argument; the rest are on-call. Models per spec §3.

## Theorist  (opus)
**Mandate:** Propose the hypothesis + mechanism; argue the conjecture. Source from `tessellation-knowledge` + `research/FRONTIER-THESIS.md`. When issued an INVERT ticket, argue the negation as-if-true and output a DISCRIMINATOR, not an argument.
**Inputs:** the standing thesis, the assumption-ledger row under attack, the Outsider seed (if any).
**Outputs:** a hypothesis with a required `predictedNovelFact` (a number/sign/monotonicity the current model does NOT predict) — organ A2.
**Honesty rule:** a fact no one would bet against scores zero and licenses no meeting.

## Skeptic → Champion (rotates)  (opus)
**Mandate:** Refute the claim; own the kill-criterion. For high-stakes conjectures, FIRST rotate into Champion — steelman the idea, find its best regime, and only then refute; the kill-bar rises with stakes ("show it's wrong AND no cheap instrument could rescue it"). Post `surprisalToRival` (bet against the predictedNovelFact on record before any probe).
**Inputs:** the Theorist's hypothesis.
**Outputs:** kill-criterion; for organ D1, certification that the two frames make DISTINCT non-vacuous instrument predictions (reject a rival frame that predicts the same numbers as non-diagnostic).
**Honesty rule:** never concede on rhetoric; concede only to a measurement.

## Metrologist  (opus)
**Mandate:** Doubt the MEASUREMENT. Certify the honest instrument (true-3D vs radial, non-vacuous control, reference-trust, band-limited under-statement). Own the close-gate pre-mortem (organ B2a): before any CLOSE, post 3 "how this ruler could still be lying" modes + a runnable trap.
**Inputs:** the proposed discriminator + instrument.
**Outputs:** instrument certification or a veto with the honest alternative; a close-gate receipt.
**Honesty rule:** "the ruler is the last thing to trust." A surprise closes as noise ONLY via you, with a one-line instrument reason + a positive test.

## Experimentalist  (delegates to the `meshing-researcher` agent, opus)
**Mandate:** Run the cheapest discriminator probe; measure with `labkit` (true-3D-first). DELEGATE to the existing `meshing-researcher` agent — do NOT re-implement its instruments or method. Reserve ~15–20% of cycles for the exploration tithe (organ D3): sweep params past normal range, log "the strangest thing I saw" into SURPRISES with no obligation to resolve.
**Inputs:** the pre-registered discriminator + instrument certification.
**Outputs:** measured numbers per mesh at equal budget, instrument named; any surprise logged.
**Honesty rule:** bad-but-honest beats confident-but-unmeasured; checkpoint each unit to disk instantly.

## Oracle-keeper  (delegates to `meshing-researcher` oracle mode, opus)
**Mandate:** STANDING disagreement-hunter (organ C1). Even with no hypothesis open, run an argmax|kernel − oracle| search over the style/param space (incl. configs we currently PASS) via `oracle-harness` (gmsh/Triangle/Blender). Report the top-3 divergences/cycle with a cross-domain note.
**Inputs:** the current kernel outputs; the style/param space.
**Outputs:** top-3 kernel-vs-oracle divergences; each convention-clean beat becomes a PROGRESSIVE-candidate hypothesis.
**Honesty rule:** every claimed beat passes an equal-footing/equal-target control + reference-trust self-check (the aniso-validity gate); the Metrologist rules out units/convention artifacts first.

## Literature scout  (sonnet + WebSearch/WebFetch/context7)
**Mandate:** Ground bets in real SOTA; VERIFY citations (no hallucinated papers).
**Inputs:** the mechanism under debate.
**Outputs:** real citations with a one-line relevance + a verified/unverified flag.
**Honesty rule:** an unverifiable citation is reported as unverified, never smoothed over.

## Archivist  (sonnet)
**Mandate:** Own the registry, transcript, and all three ledgers. Surface REOPENABLE questions (organ B2b expiry), not just closures. Tag every closed finding with programme + label (organ A1) and the instrument+assumptions it closed under.
**Inputs:** the PI's adjudication.
**Outputs:** appended registry row, scorecard row, assumption-ledger row, transcript blocks.
**Honesty rule:** append-only; never silent-drop a surprise.

## Outsider  (sonnet, throwaway, optional per convene)
**Mandate:** Seeded from a DELIBERATELY wrong domain (SLAM / map-projection / information theory / statistical physics / geology / typography). One turn: "restate the current problem in your domain and name one instrument/analogy your field reaches for." No debate rights, no vote, no probe budget.
**Inputs:** the current problem, stated plainly.
**Outputs:** one cross-domain reframe/analogy feeding the Theorist or Oracle-keeper backlog.
**Honesty rule:** generative-only; a bad seed costs one cheap turn and dies at the ruler.
```

- [ ] **Step 2: Verify all 8 roles + delegation present**

Run:
```bash
grep -cE '^## ' .claude/skills/meshing/meshing-lab/charters.md
grep -c 'meshing-researcher' .claude/skills/meshing/meshing-lab/charters.md
grep -c '\*\*Honesty rule:\*\*' .claude/skills/meshing/meshing-lab/charters.md
```
Expected: first ≥ `8` (8 role headers), second ≥ `2` (Experimentalist + Oracle-keeper delegate), third = `8` (every charter has an honesty rule).

- [ ] **Step 3: Confirm frontier untouched**

Run: `git diff --stat .claude/skills/meshing/meshing-frontier/SKILL.md`
Expected: empty output (no changes).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/meshing/meshing-lab/charters.md
git commit -- .claude/skills/meshing/meshing-lab/charters.md -m "feat(meshing-lab): 8 role charters (Experimentalist/Oracle-keeper delegate to meshing-researcher)"
```

---

## Task 3: Generative core — 11 organs + copied frontier machinery

**Files:**
- Create: `.claude/skills/meshing/meshing-lab/generative-core.md`
- Read (to copy from): `.claude/skills/meshing/meshing-frontier/SKILL.md`

**Interfaces:**
- Consumes: the charters (Task 2) by name.
- Produces: a file documenting all 11 organs, each tagged with its ID (`A1`,`A2`,`B1`,`B2`,`C1`,`C2`,`C3`,`D1`,`D2`,`D3`) and a `Trigger:` / `Artifact:` / `Owner:` line, plus a `## Copied frontier machinery` section holding the steelman→ground→tournament loop copied from `meshing-frontier`.

- [ ] **Step 1: Read the frontier machinery to copy**

Run: `cat .claude/skills/meshing/meshing-frontier/SKILL.md`
Identify the steelman → ground(literature/oracles) → tournament section. You will COPY it (verbatim or lightly adapted) into `generative-core.md` — you must NOT edit the frontier file.

- [ ] **Step 2: Write the generative-core file**

Create `.claude/skills/meshing/meshing-lab/generative-core.md`. Transcribe organs A1–D3 from spec §5 (each with its {what, trigger, artifact, owner, grounding}) and paste the copied frontier loop. Structure:

```markdown
# Meshing Lab — Generative Core

> The positive/Lakatosian heuristic that runs UPSTREAM of the falsification gate.
> Scored by a DIFFERENT currency — not "is it true?" but "if true, how much does it
> reprice?" — with its OWN budget, never sharing the correctness scoreboard.

## Cluster A — second scoreboard (the positive heuristic)
### A1 Programme Scorecard
Trigger: every CLOSE. Owner: Archivist. Artifact: `research/programme-scorecard.md`.
<transcribe spec §5 A1: labels PROGRESSIVE/CONSERVATIVE/DEGENERATING; K=3 consecutive
non-progressive → auto Inversion Round, not a kill.>
### A2 Positive-heuristic gate
Trigger: every hypothesis. Owner: Theorist (fact) + Skeptic (bet). Artifact: hypothesis schema fields `predictedNovelFact` + `surprisalToRival`.
<transcribe spec §5 A2.>

## Cluster B — anti-closure
### B1 Anomaly / Surprise Ledger
Trigger: any result >2x off prediction / oracle-vs-kernel gap / expected-change-that-didn't-happen. Owner: Archivist. Artifact: transcript `## SURPRISES`.
<transcribe spec §5 B1: un-closeable debt; priority rises; PI cannot CLOSE a question with a tied open surprise; noise-close only via Metrologist + positive test.>
### B2 Close-gate pre-mortem + expiring settlement
Trigger: every CLOSE (a); new instrument ships / tagged assumption challenged (b). Owner: Metrologist (a) + Archivist (b). Artifact: transcript `## CLOSE-GATE RECEIPTS` + `## ASSUMPTIONS TOUCHED`.
<transcribe spec §5 B2, incl. the "Reopen the Cornerstone" slot.>

## Cluster C — attack the frame
### C1 Standing Oracle Disagreement Bounty
Trigger: rotating schedule, even with no hypothesis open. Owner: Oracle-keeper. Artifact: top-3 divergence report → PROGRESSIVE-candidate hypotheses.
<transcribe spec §5 C1, incl. the aniso-validity/equal-target guard.>
### C2 Assumption Ledger + scheduled Inversion
Trigger: every 3rd closed question OR a DEGENERATING flag. Owner: Archivist (ledger) + Theorist (inversion). Artifact: `research/assumption-ledger.md`.
<transcribe spec §5 C2.>
### C3 Rotating Outsider seat + naive-question quota
Trigger: per convene (optional). Owner: Outsider. Artifact: one cross-domain reframe into the hypothesis pile.
<transcribe spec §5 C3, incl. "generative-only, no vote".>

## Cluster D — anti-mortality
### D1 Adversarial-collaboration close-out
Trigger: PROGRESSIVE / high-blast-radius hypotheses. Owner: Theorist + Skeptic. Artifact: transcript block {agreedRestatement, jointProbeDesign, preCommittedOutcomeMap, mindChangeTrigger}.
<transcribe spec §5 D1, incl. the DISTINCT-prediction certification.>
### D2 Champion + steelman-before-refute ordering
Trigger: high-stakes conjectures. Owner: Skeptic (rotates to Champion). Artifact: ordering rule in the meeting loop.
<transcribe spec §5 D2.>
### D3 Exploration tithe + protected minority report
Trigger: ~15–20% of probe cycles; any agent may dissent. Owner: Experimentalist (tithe) + any agent (dissent). Artifact: SURPRISES entries + an un-adjudicated-away dissent with its own budget.
<transcribe spec §5 D3.>

## Down-graded (kept minimal)
Twin-Instrument: keep ONLY a `delta(twin)` registry column + a "twins-agreed-then-both-wrong" note. Do NOT add the full ceremony. (spec §5 down-graded.)

## Copied frontier machinery
<PASTE the steelman → ground(literature/oracles) → tournament loop copied from
meshing-frontier here — copied, not referenced, so the lab is self-contained and the
frontier skill stays untouched.>
```

- [ ] **Step 3: Verify all 11 organ IDs present + frontier copied + frontier untouched**

Run:
```bash
for id in A1 A2 B1 B2 C1 C2 C3 D1 D2 D3; do grep -q "### $id " .claude/skills/meshing/meshing-lab/generative-core.md && echo "$id ok" || echo "$id MISSING"; done
grep -q '## Copied frontier machinery' .claude/skills/meshing/meshing-lab/generative-core.md && echo "frontier-section ok"
git diff --stat .claude/skills/meshing/meshing-frontier/SKILL.md
```
Expected: ten `ok` lines (A1…D3), `frontier-section ok`, and an EMPTY diff for the frontier file. (Note: `### B2` and `### C2` cover the merged B2/C2 organs.)

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/meshing/meshing-lab/generative-core.md
git commit -- .claude/skills/meshing/meshing-lab/generative-core.md -m "feat(meshing-lab): generative core — 11 organs (A1-D3) + copied frontier tournament loop"
```

---

## Task 4: SKILL.md entry protocol

The skill the PI reads to convene the lab. Ties the roster, meeting loop, invariant, and the two reference files together.

**Files:**
- Create: `.claude/skills/meshing/meshing-lab/SKILL.md`

**Interfaces:**
- Consumes: `charters.md`, `generative-core.md`, the three ledgers (all by path).
- Produces: a skill with YAML frontmatter (`name: meshing-lab`, a `description:` that is the mode-selector), and sections `## Roster`, `## The combined meeting loop`, `## The invariant`, `## Stopping rule`, `## Resilience & commit hygiene`. Must contain the audit-first invariant verbatim (Global Constraints).

- [ ] **Step 1: Write SKILL.md**

Create `.claude/skills/meshing/meshing-lab/SKILL.md`:

```markdown
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
<transcribe the spec §3 roster table (8 rows) verbatim.>
Debate trio (Theorist / Skeptic / Metrologist) persists; the rest are on-call.

## The combined meeting loop
GENERATIVE (own budget/scoreboard) → FALSIFICATION (audit-first gate) → ANTI-CLOSURE.
<transcribe the spec §6 loop diagram + prose. Generative organs propose & score by
"if true, how much does it reprice?"; correctness is granted ONLY by measurement; the
close is guarded by B1/B2/A1 so the next reframe's raw material isn't sealed away.>

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
```

- [ ] **Step 2: Verify frontmatter, invariant, and references**

Run:
```bash
grep -q '^name: meshing-lab$' .claude/skills/meshing/meshing-lab/SKILL.md && echo "name ok"
grep -q 'A measurement always closes it.' .claude/skills/meshing/meshing-lab/SKILL.md && echo "invariant ok"
for f in charters.md generative-core.md; do grep -q "$f" .claude/skills/meshing/meshing-lab/SKILL.md && echo "$f ref ok"; done
for h in '## Roster' '## The combined meeting loop' '## The invariant' '## Stopping rule' '## Resilience'; do grep -q "$h" .claude/skills/meshing/meshing-lab/SKILL.md && echo "ok: $h"; done
```
Expected: `name ok`, `invariant ok`, both `ref ok`, and all five `ok:` headers.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/meshing/meshing-lab/SKILL.md
git commit -- .claude/skills/meshing/meshing-lab/SKILL.md -m "feat(meshing-lab): SKILL.md entry protocol — roster, combined loop, audit-first invariant, mode-selector"
```

---

## Task 5: Cheat-sheet pointer + mode-selector

Make the lab discoverable from the reference the researcher reads first.

**Files:**
- Modify: `research/LAB-CHEATSHEET.md`

**Interfaces:**
- Consumes: the `meshing-lab` skill (by name).
- Produces: a `## Lab (multi-agent)` section in the cheat-sheet with the solo-vs-convene rule.

- [ ] **Step 1: Read the cheat-sheet tail to find an append point**

Run: `tail -n 20 research/LAB-CHEATSHEET.md`
Note the last section so you append cleanly (append-only; don't rewrite existing lines).

- [ ] **Step 2: Append the lab section**

Add to the end of `research/LAB-CHEATSHEET.md`:
```markdown

## Lab (multi-agent) — organ of last resort for contested/frontier work
- **Solo vs convene:** cheap mechanical sweep → dispatch solo `meshing-researcher`.
  Contested finding / frontier wall / DEGENERATING programme / "trust this" → convene the
  `meshing-lab` skill (PI + 7-8 specialists, generative→falsification→anti-closure).
- **Durable state:** `research/programme-scorecard.md` (A1), `research/assumption-ledger.md`
  (C2), `research/lab/<arc>-transcript.md` from `research/lab/TRANSCRIPT-TEMPLATE.md`
  (FINDINGS + SURPRISES + CLOSE-GATE RECEIPTS). Validate format:
  `node research/lab/validateLedgers.cjs <files...>`.
- **Invariant unchanged:** generative organs only propose/score ("if true, how much does it
  reprice?"); a measurement still closes everything.
```

- [ ] **Step 3: Verify**

Run: `grep -q '## Lab (multi-agent)' research/LAB-CHEATSHEET.md && grep -q 'meshing-lab' research/LAB-CHEATSHEET.md && echo "cheat-sheet ok"`
Expected: `cheat-sheet ok`.

- [ ] **Step 4: Commit**

```bash
git add research/LAB-CHEATSHEET.md
git commit -- research/LAB-CHEATSHEET.md -m "docs(meshing-lab): cheat-sheet pointer + solo-vs-convene mode-selector"
```

---

## Task 6: Acceptance — live smoke-convene (the behavioral DoD)

The real end-to-end test: convene a MINIMAL lab on one cheap real meshing question and assert the transcript + ledgers show both engines fired and the invariant held. This is expensive (multi-agent + a real probe) and is intentionally the last task.

**Files:**
- Create: `research/lab/smoke-transcript.md` (copied from the template, filled by the convene)
- Append: `research/programme-scorecard.md`, `research/assumption-ledger.md` (one row each from the smoke run)

**Interfaces:**
- Consumes: the full skill (Tasks 1–5).
- Produces: a completed smoke transcript proving the DoD (spec §12).

- [ ] **Step 1: Pick a cheap, real, contested question**

Choose a question with KNOWN instruments so the probe is cheap, e.g.:
> "Is the residual chord tail on style X density-RESPONSIVE or density-INVARIANT?"
(density-invariance is an existing discriminator; the Metrologist already trusts true-3D
perp deviation.) Write the hypothesis with a `predictedNovelFact` (e.g. "perp p99 drops
below 0.1 if maxLevel lifts past its current cap").

- [ ] **Step 2: Copy the transcript template and convene**

```bash
cp research/lab/TRANSCRIPT-TEMPLATE.md research/lab/smoke-transcript.md
```
As PI, run a reduced convene (trio + one Experimentalist):
1. `Agent` the **Theorist** with its charter + the question → get hypothesis + predictedNovelFact.
2. `Agent` the **Skeptic** → kill-criterion + surprisalToRival bet.
3. `Agent` the **Metrologist** → instrument certification (true-3D, non-vacuous control).
4. Relay one round via `SendMessage` (Theorist ↔ Skeptic).
5. `Agent` the **Experimentalist** (delegating to `meshing-researcher`) with the pre-registered discriminator → measured numbers.
6. PI adjudicates; append to `smoke-transcript.md` the FINDINGS block, any SURPRISES, and a CLOSE-GATE RECEIPT; append one row each to the scorecard + assumption-ledger.

Keep the probe cheap (screen budget ~0.3–0.8M pts per the resilience rule).

- [ ] **Step 3: Assert the DoD (spec §12)**

Run:
```bash
node research/lab/validateLedgers.cjs research/programme-scorecard.md research/assumption-ledger.md research/lab/smoke-transcript.md
grep -q '## SURPRISES' research/lab/smoke-transcript.md && echo "surprises-section ok"
grep -Eiq 'VERDICT: (confirmed|refuted|no-op)' research/lab/smoke-transcript.md && echo "finding ok"
grep -q 'predictedNovelFact' research/lab/smoke-transcript.md && echo "positive-heuristic ok"
```
Expected: validator exits `0`; `surprises-section ok`; `finding ok`; `positive-heuristic ok`. Manually confirm: (a) the finding carries a measurement (no confirm-on-argument), (b) the scorecard row has a label, (c) the assumption-ledger row names the assumption the finding relied on.

- [ ] **Step 4: Commit**

```bash
git add research/lab/smoke-transcript.md research/programme-scorecard.md research/assumption-ledger.md
git commit -- research/lab/smoke-transcript.md research/programme-scorecard.md research/assumption-ledger.md -m "test(meshing-lab): live smoke-convene proves the DoD — both engines fire, invariant holds"
```

---

## Self-Review

**1. Spec coverage:**
- §2 two-engines/one-gate → Task 4 (loop + invariant) + Task 3 (generative core). ✓
- §3 roster (8 roles) → Task 2 charters + Task 4 roster table. ✓
- §4 falsification loop → Task 4 meeting loop. ✓
- §5 all 11 organs → Task 3 (A1–D3) + Task 1 (A1/C2/B1/B2 durable files). ✓
- §6 combined loop → Task 4. ✓
- §7 resilience → Task 1 (append-only files + validator) + Task 4 (resilience section). ✓
- §8 deliverables (skill + charters + generative-core + ledgers + cheat-sheet + reuse meshing-researcher + copy frontier) → Tasks 1–5. ✓
- §9 rejected idea → not built (correct); recorded in spec only. ✓
- §12 DoD → Task 6 smoke-convene. ✓
- §14 frontier untouched → enforced by the `git diff --stat` check in Tasks 2 & 3. ✓

**2. Placeholder scan:** The `<transcribe spec §N …>` markers in Tasks 3–4 point at COMMITTED, complete spec content (not TBDs) and each is scoped to an exact section — the executor copies real text, not inventing it. No "add error handling"/"write tests for the above"/"TODO" patterns. The one runtime file (validator) is shown in full.

**3. Type/name consistency:** organ IDs `A1,A2,B1,B2,C1,C2,C3,D1,D2,D3` identical across Tasks 1/3/4. Ledger column headers in Task 1's files match the validator regexes in Task 1's script byte-for-byte. `validateLedgers.cjs` path identical in Tasks 1/5/6. Charter field names (`**Mandate:**` etc.) consistent. `predictedNovelFact` / `surprisalToRival` spelled identically in Tasks 2/3/4/6.

---

## Execution Handoff

See the offer after this plan is saved.

# Lab Transcript — smoke-gothic-perp-rib — 2026-07-01

> Append-only durable state. A killed lab resumes by re-reading this + the ledgers.
> This is the FIRST live meshing-lab convene (Task 6 acceptance / DoD smoke). Reduced
> roster: PI + Theorist + Skeptic + Metrologist + Experimentalist(=meshing-researcher).

## THESIS
Is the residual chord "red" on steep near-vertical relief a RADIAL-RULER artifact (accept-class,
true-3D CAD-grade) or a GENUINE 3D under-tessellation? Tested on GothicArches arch ribs.

## FINDINGS

### F1 — GothicArches red-rib chord: ruler-artifact hypothesis REFUTED
- **HYPOTHESIS (Theorist):** on the RED rib facets (radial per-face worst-sag > 0.1 mm), perp-3D
  deviation is CAD-grade (perp p99 < 0.02 mm) while radial p99 > 0.10 mm → ratio ≥ 5×, density-INVARIANT
  (i.e. the "red" is the radial ruler lying via 1/cos(θ) amplification on near-vertical ribs).
- **RIVAL A (genuine defect):** perp p99 > 0.10, ratio ≈ 1, perp FALLS under refinement.
- **DISCRIMINATOR:** `perFaceChordSag` (radial) vs `perFaceTrue3DSag` (true-3D perpendicular, same
  `projectPointToRadialSurface` as `perpendicular3DDeviation`) on the SAME GothicArches mesh + SAME
  sample points, subset to red facets. + brute-force nearest twin + a maxSag refinement pass. CPU, no GPU.
- **KILL-CRITERION (pre-registered by Skeptic):** refuted if perp p99 ≥ 0.05 mm, OR radial/perp ratio
  < 3×, OR perp RISES when reference/refinement doubled. (+ foot-point sheet-consistency required or
  the number is disqualified.)
- **predictedNovelFact:** perp p99 < 0.02 & ratio ≥ 5× & density-invariant. (Skeptic bet FOR magnitude,
  AGAINST density-invariance.)
- **EVIDENCE (default GothicArches, tolMm 0.01, hMin 0.05, 816,872 tris; RED = radial faceErr > 0.1mm):**
  - red facets = 10,740 / 816,872. `perFaceChordSag` radial p99 = **0.891 mm** (max 1.418).
  - same red facets, `perFaceTrue3DSag` perp p99 = **0.259 mm** (max 0.712).
  - radial/perp ratio (p99) = **3.44×** — real overstatement, but NOT ≥5×; perp is **13× above** the 0.02 CAD bar.
  - SMOOTH control (HarmonicRipple, 443k tris): 0 red facets; whole-mesh top-decile radial p99 0.0149 vs
    perp p99 0.0161 → ratio **0.92 ≈ 1** ⇒ instrument is NON-vacuous (tracks radial on smooth relief).
  - TWIN (worst 40 red facets, GN vs brute-force dense nearest): max|GN−brute| = **1.6e-9 mm**, 0/40
    disagree >0.01, 0 wrong-sheet, GN p99 0.2556 ≈ brute 0.2556 ⇒ perp foot TRUSTED (no local-minimum / band-limit escape).
  - SHEET-CONSISTENCY: 40/40 feet same sheet (sheetDot sign uniform) ⇒ 0 disqualifications.
  - DENSITY: refined tolMm 0.005 (1.60M tris) red perp p99 = **0.221 mm** (from 0.259) ⇒ density-RESPONSIVE
    (fell, did not rise, not flat). Skeptic's bet WON.
- **VERDICT: refuted** (ruler-artifact hypothesis). Two kill conditions fired: perp p99 0.259 ≥ 0.05 AND
  ratio 3.44 < 5. This is closer to RIVAL A: a GENUINE 3D under-tessellation of the sharp mullion crests
  (~0.26 mm true residual). Radial DOES overstate ~3.4×, but the honest true-3D residual is still ~13× above CAD.
- **RECOMMENDATION:** do NOT classify GothicArches red ribs as accept-class ruler-overstatement. Route to
  the crest-refinement lever (E-2026-06-30-FEAT-CONFORM: feature-conforming + chordTolMm drove true-3D p99
  0.096@1M → 0.082@3M). NEXT experiment: pre-register whether targeted crest conforming drives red-facet perp
  below 0.05 (interim) then 0.02 (CAD) at acceptable tri budget — the observed 0.259→0.221 under blunt 2×
  uniform refine says the direction is right but uniform refinement is too weak.
- **LEDGER:** checkpoints `potfoundry-web/research/exchange/_gperp/ledger.ndjson` (5 units) + `twin_rows.json`
  (40 facets); probe `potfoundry-web/research/bridge/_gothicPerpSmoke.test.ts`. Registry: to be appended by
  the Archivist as E-2026-07-01-GOTHIC-PERP-RIB (not committed in this smoke run).

## SURPRISES

| date | surprise | tied-to | score | status |
|------|----------|---------|-------|--------|
| 2026-07-01 | Perp foot-point is metrologically PERFECT (GN=brute to 1.6e-9 mm, 0/40 wrong-sheet): there is NO measurement escape hatch, so the 0.26 mm true residual is real. GothicArches sharp crests are the ONE steep style whose "red" is a genuine generalization gap, NOT a ruler artifact — contradicting the "steep red ⇒ accept-class ruler overstatement" pattern the registry leaned toward. | F1 + assumption A-STEEP-RULER | high | promoted → assumption-ledger refuted-flip + next-experiment (crest conforming) |

## CLOSE-GATE RECEIPTS

### F1 close-gate (Metrologist pre-mortem — 3 ways the ruler could still lie, + trap result)
- **(a) Wrong-sheet straddle** (foot locks onto near sheet, hides far gap). Trap: sheet-consistency sign check on worst 40. RESULT: 40/40 same sheet, 0 disqualified → PASS (not the escape).
- **(b) Reference-scale masking** (band-limited reference under-states perp). Trap: brute-force twin at 2048×400 dense sample = the densest-reference check. RESULT: GN=brute to 1.6e-9 → perp NOT reference-under-stated → PASS.
- **(c) Red-set gerrymander** (selector silently drops worst facets, fakes p99). Trap: red set = 10,740/816,872 by the fixed radial>0.1 rule, twin drawn from the WORST 40. RESULT: worst-facet p99 (0.2556) ≈ red-set p99 (0.259) → no gerrymander → PASS.
- **Close verdict:** all three traps PASS ⇒ the refutation is trusted; the perp 0.26 mm is not a ruler lie.

## ASSUMPTIONS TOUCHED
- **F1 closed under:** instrument = `perFaceTrue3DSag` / `perpendicular3DDeviation` (radial path byte-identical),
  reference = continuous `rA` analytic closure cross-checked by a 2048×400 brute-force twin (no `__pfReferenceDenseRes`
  grid in this CPU path). Assumption relied on / CHALLENGED: **A-STEEP-RULER** = "steep near-vertical red ⇒ radial
  ruler overstatement ⇒ accept-class (true-3D CAD-grade)". This convene REFUTES it for GothicArches (ratio only 3.44×,
  perp 0.26 mm ≫ CAD). Row appended to `assumption-ledger.md` as a refuted-flip. Expiry: any prior GothicArches
  (and possibly other steep-style) accept-class chord closure that relied on A-STEEP-RULER is now REOPEN-ELIGIBLE.

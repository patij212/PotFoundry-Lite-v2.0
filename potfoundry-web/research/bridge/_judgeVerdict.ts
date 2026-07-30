// research/bridge/_judgeVerdict.ts — THE ONE ENTRY POINT EVERY FIDELITY VERDICT GOES THROUGH.
// RESEARCH ONLY. PURE: no I/O, no globals, no mesh, no rA — so it is unit-testable and cannot drift.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// A3 — WHY A ONE-SIDED AUDIT MUST BE STRUCTURALLY IMPOSSIBLE
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// On 2026-07-29 the STRATA campaign reported a mesh as good all night. The reports were H2-only: PF_FT_H2=1
// with PF_FT_H1 left off for speed. H2 asks whether every surface point has mesh NEAR it, so ADDED geometry
// — a blade protruding from the surface, a folded flap — cannot fail it. When H1 was finally run on the same
// mesh it read 444.881 um witnessed / 612.638 um certified with 7.58 % of audited triangles over tolerance,
// against H2's 15.508 um and the driver's own 4.058 um "PASS".
//
// The file that produced those reports SAYS, in its own header, that neither direction alone suffices. It
// said so while emitting a one-directional verdict, because the emission path did not know about the header.
// PF_FT_H1=0 / PF_FT_H2=0 silently produced a PASS-shaped report. THAT IS THE DEFECT THIS FILE CLOSES:
// a documented rule that the code does not enforce is not a rule, it is a comment.
//
// THE RULE, ENFORCED HERE AND NOWHERE ELSE:
//   * A CLEAN ONE-SIDED RUN IS NOT A VERDICT. It emits an explicit NOT-A-VERDICT banner and no PASS/FAIL line
//     exists anywhere in the report. Single-direction runs remain available as DIAGNOSTICS — they print their
//     measurement, labelled a measurement — but "nothing found in one direction" is not a finding at all,
//     because each direction is structurally blind to a whole class of defect (see the banner below).
//   * FAIL IS SOUND FROM PARTIAL DATA, INCLUDING FROM A SINGLE DIRECTION. A witnessed exceedance is a real
//     exceedance; a failed shape gate is a real defect. Neither can be argued away by auditing more of the
//     mesh OR by auditing the direction that did not run — the missing direction can only ADD defects to the
//     list, never remove one from it. So either kind of evidence produces FAIL however little else ran.
//     *** THAT IS REVIEW FINDING 1 (2026-07-29). *** This file previously returned NOT-A-VERDICT whenever a
//     direction was missing, and printed the failed gates underneath the banner as a "diagnostic": a mesh
//     with 31,842 PROVEN FOLDS, audited one-sided, read "inconclusive". A rule that withholds a verdict it is
//     entitled to emit is the same class of defect as one that emits a verdict it is not.
//   * PASS IS NOT SOUND FROM PARTIAL DATA. It additionally requires BOTH directions to have run, complete
//     coverage in both, and a CERTIFIED upper bound under tolerance. An unseen triangle is not a passing one.
//   * A GATE THAT COULD NOT BE EVALUATED IS NOT A PASSED GATE, AND ZERO GATES EVALUATED IS NOT "ALL GATES
//     PASS" (REVIEW FINDING 2). `applicable: false` blocks PASS, and so does an EMPTY gate list — otherwise a
//     wiring bug that delivers no gates at all reads as a clean bill of health, which is exactly the shape of
//     the failure this file exists to close.
//
// GATES ARE NOT DIRECTION-DEPENDENT and are therefore evaluated unconditionally, on every run, including
// single-direction diagnostics. A shape gate reads the whole mesh; there is no coverage argument to make and
// no flag that turns one off. That is deliberate: the blade defect was a pure shape defect, and it survived
// because no quantity anywhere in the pipeline was a function of facet SHAPE.

/** One hard gate. `count` is the offending population; `expected` is 0 for every gate built so far. */
export interface GateResult {
  id: string;
  title: string;
  /** false = the gate declares itself out of scope for this mesh. NOT APPLICABLE IS NOT A PASS. */
  applicable: boolean;
  count: number;
  expected: number;
  pass: boolean;
  detail: string[];
}

/** What one audit direction measured. Both bounds are in mm. */
export interface DirectionReading {
  ran: boolean;
  /** full coverage: no budget, time or facet cap truncated it */
  complete: boolean;
  /** is `boundMm` a sound UPPER bound on the true max? H1 yes (1-Lipschitz), H2 no (witnessed only). */
  certified: boolean;
  /** sound LOWER bound on the true max — an exceedance here is a real exceedance */
  witnessedMm: number;
  /** sound UPPER bound on the true max, or Infinity when the instrument provides none */
  boundMm: number;
  /** human description of what was covered, printed with every line */
  coverage: string;
}

export const NOT_RUN: DirectionReading = {
  ran: false, complete: false, certified: false, witnessedMm: 0, boundMm: Infinity, coverage: 'NOT RUN',
};

export type Verdict = 'PASS' | 'FAIL' | 'NOT-A-VERDICT';

export interface JudgeInput {
  tolMm: number;
  gates: readonly GateResult[];
  h1: DirectionReading;
  h2: DirectionReading;
}

export interface JudgeOutcome {
  verdict: Verdict;
  /** true only if every gate is applicable AND passed */
  gatesPass: boolean;
  reasons: string[];
  lines: string[];
}

const um = (mm: number): string => (Number.isFinite(mm) ? (mm * 1000).toFixed(3) : 'inf');

/**
 * THE GATE BLOCK. Unconditional — it is printed by every run, one-directional or not, because a shape gate
 * does not depend on which fidelity direction was measured.
 */
export function renderGates(gates: readonly GateResult[]): { lines: string[]; pass: boolean } {
  const lines: string[] = ['', '===== HARD GATES (expected count 0; NOT APPLICABLE is NOT a pass) ====='];
  // AN EMPTY GATE LIST IS A FAILURE, NOT A CLEAN SWEEP (review finding 2). `pass` started at true here, so a
  // caller that assembled no gates — a wiring bug, or a gate block skipped by an early return — printed
  // "GATES: ALL PASS" over zero evaluated gates. Seed it from the list length instead.
  let pass = gates.length > 0;
  if (gates.length === 0) {
    lines.push('  *** NO GATES WERE EVALUATED — the gate list was EMPTY. This is a wiring bug, not a pass. ***');
  }
  for (const g of gates) {
    const state = !g.applicable ? 'NOT APPLICABLE' : g.pass ? 'PASS' : '*** FAIL ***';
    if (!g.applicable || !g.pass) pass = false;
    lines.push(`  [${g.id}] ${state}   count ${g.count} (expected ${g.expected})`, `        ${g.title}`);
    for (const d of g.detail) lines.push(`      ${d}`);
  }
  lines.push(`  GATES: ${pass ? 'ALL PASS' : 'NOT ALL PASSED — see above'}`);
  return { lines, pass };
}

/**
 * THE VERDICT BLOCK. The only place in this pipeline that may print the words PASS or FAIL about fidelity.
 */
export function judge(inp: JudgeInput): JudgeOutcome {
  const { tolMm, gates, h1, h2 } = inp;
  const gatesPass = gates.length > 0 && gates.every((g) => g.applicable && g.pass);
  const failedGates = gates.filter((g) => g.applicable && !g.pass);
  const blockedGates = gates.filter((g) => !g.applicable);
  const bothRan = h1.ran && h2.ran;
  const missing = [!h1.ran ? 'H1 (mesh -> surface)' : '', !h2.ran ? 'H2 (surface -> mesh)' : ''].filter((s) => s !== '');
  const reasons: string[] = [];
  const lines: string[] = ['', '===== VERDICT ====='];

  const measure = (name: string, d: DirectionReading): string[] => {
    if (!d.ran) return [`  ${name}: NOT RUN`];
    return [
      `  ${name}: witnessed ${um(d.witnessedMm)} um`
      + `   ${d.certified ? `certified bound ${um(d.boundMm)} um` : 'NO CERTIFIED BOUND (witnessed only)'}`
      + `   ${d.complete ? 'complete coverage' : '*** INCOMPLETE COVERAGE ***'}`,
      `        ${d.coverage}`,
    ];
  };
  lines.push(...measure('H1  mesh -> surface', h1), ...measure('H2  surface -> mesh', h2));
  lines.push(`  TOL ${um(tolMm)} um   gates: ${gates.length === 0 ? '*** NONE EVALUATED ***' : gatesPass ? 'all pass' : `${failedGates.length} failed, ${blockedGates.length} not applicable`}`);

  // ═══ FAIL IS DECIDED FIRST, AND IT DOES NOT ASK WHICH DIRECTIONS RAN (review finding 1) ═══
  // Every reason collected here is EVIDENCE OF A DEFECT THAT EXISTS, not an absence of evidence:
  //   * a failed shape gate reads the WHOLE mesh and is direction-independent by construction — there is no
  //     coverage argument to make about it and no fidelity direction that could retract it;
  //   * a witnessed exceedance is a real measured point at a real distance — a sound LOWER bound on the max.
  // Running the missing direction can only lengthen this list. Withholding the verdict here is therefore not
  // caution, it is a false "inconclusive" on a mesh that is already known to be defective — measured: the
  // one-sided D51 audit, 31,842 folds, previously reported NOT-A-VERDICT with the failures printed as a
  // footnote. The ONLY thing one-sidedness withholds is PASS.
  for (const g of failedGates) reasons.push(`gate ${g.id} failed: ${g.count} (expected ${g.expected})`);
  if (h1.ran && h1.witnessedMm > tolMm) reasons.push(`H1 witnessed ${um(h1.witnessedMm)} um > TOL ${um(tolMm)} um`);
  if (h2.ran && h2.witnessedMm > tolMm) reasons.push(`H2 witnessed ${um(h2.witnessedMm)} um > TOL ${um(tolMm)} um`);
  if (reasons.length > 0) {
    lines.push('', `  *** FAIL ***   ${reasons.join('; ')}`,
      '  FAIL is sound under partial coverage AND from a single direction: a witnessed exceedance is a real',
      '  exceedance and a failed shape gate is a real defect. Neither can be argued away by auditing more of',
      '  the mesh, or by auditing the direction that did not run.');
    if (!bothRan) {
      lines.push(`  ONE-SIDED: ${missing.join(' and ')} did not run. That withholds a PASS; it does not withhold`,
        '  this FAIL. The missing direction can only ADD defects to the list above, never remove one from it.');
    }
    return { verdict: 'FAIL', gatesPass, reasons, lines };
  }

  if (!bothRan) {
    reasons.push(`only one direction was measured: ${missing.join(' and ')} did not run`);
    lines.push(
      '',
      '  ############################################################################################',
      '  ##  NOT A VERDICT.                                                                        ##',
      `  ##  ${`MISSING: ${missing.join(' and ')}`.padEnd(86)}##`,
      '  ##  Neither direction alone can judge this mesh, and that is measured, not argued:         ##',
      '  ##    * H2 alone CANNOT SEE ADDED GEOMETRY. A blade protruding from the surface covers     ##',
      '  ##      everything it should; H2 asks only whether the surface is covered.                 ##',
      '  ##    * H1 alone CANNOT SEE UNREPRESENTED FEATURES. A facet chording across a ridge lies    ##',
      '  ##      near the ridge base, so every point of it has surface a few microns away.          ##',
      '  ##  On 2026-07-29 an H2-only night reported 15.508 um while H1 read 444.881 um witnessed   ##',
      '  ##  on the same mesh, with 7.58% of audited triangles over tolerance.                      ##',
      '  ##  NO VERDICT IS EMITTED HERE. Re-run with PF_FT_H1=1 PF_FT_H2=1.                        ##',
      '  ############################################################################################',
      '  (The shape gates are direction-independent and ran anyway. A gate FAILURE would have produced a FAIL',
      '   above, before this banner, so reaching this banner means no gate failed.)',
    );
    return { verdict: 'NOT-A-VERDICT', gatesPass, reasons, lines };
  }

  const blockers: string[] = [];
  // `gatesPass` IS THE DECISION, NOT A REPORTING FIELD (review finding 2). It was computed, returned, and
  // never consulted: with an EMPTY `gates` array both `failedGates` and `blockedGates` are empty too, no
  // blocker fired, and the judge emitted PASS having evaluated ZERO gates — in direct contradiction of its
  // own rule that a gate which could not be evaluated is not a passed gate. Drive the blocker off `gatesPass`
  // itself so no future gate state can slip between the two lists.
  if (!gatesPass) {
    if (gates.length === 0) {
      blockers.push('NO GATES WERE EVALUATED — the gate list was EMPTY. Zero gates evaluated is not "all gates pass";'
        + ' it is a wiring bug or a skipped gate block, and it blocks PASS.');
    } else if (blockedGates.length > 0) {
      blockers.push(`gate(s) not evaluable: ${blockedGates.map((g) => g.id).join(', ')}`);
    } else {
      // Unreachable today (an applicable-and-failed gate returns FAIL above), and stated rather than assumed:
      // if it ever fires, the gate bookkeeping and this function have drifted apart.
      blockers.push('the gate set did not pass and no individual gate accounts for it — treat as a wiring bug');
    }
  }
  if (!h1.complete) blockers.push('H1 coverage incomplete (unseen triangles are UNKNOWN, not passing)');
  // ── WHAT `h2.complete` MEANS, AND WHY IT IS NOT PHASE-B EXHAUSTION (review finding 3) ──
  // H2 runs in two phases (_facetTruthLib.surfaceToMeshMax). PHASE A sweeps the ENTIRE audited (theta,z) band
  // on a uniform lattice and ALWAYS COMPLETES — no budget and no clock applies to it, by construction. PHASE B
  // then spends what is left refining worst-first, and `SurfaceToMeshResult.capped` is set in exactly ONE
  // place: inside the phase-B loop. So `capped` means "worst-first refinement was truncated", which is true of
  // essentially every real run. This blocker used to be keyed on it and to SAY so ("H2 refinement truncated by
  // budget"), which made PASS DEAD CODE: no mesh could ever be certified however good it measured, and a
  // criterion nothing can meet stops being a criterion.
  // H2's coverage guarantee is PHASE A COMPLETING OVER THE FULL BAND, at the pitch reported as
  // `structPitchUniform`. That is what callers now key `complete` on (see _strataFacetTruth.test.ts), and the
  // choice is deliberate and weaker than it looks: WE CERTIFY AT A STATED RESOLVING POWER instead of never
  // certifying at all. Phase-B truncation therefore travels in `coverage` — printed on the H2 line above and
  // reprinted inside the PASS block below — so a PASS quoted without its resolving power is a misquote.
  if (!h2.complete) blockers.push('H2 coverage incomplete — the surface was not swept in full (unvisited surface is UNKNOWN, not passing)');
  if (!h1.certified || !(h1.boundMm <= tolMm)) blockers.push(`H1 has no certified bound under TOL (bound ${um(h1.boundMm)} um)`);
  if (blockers.length > 0) {
    reasons.push(...blockers);
    lines.push('',
      '  NOT A VERDICT — nothing over tolerance was found, and that is not the same as PASS:',
      ...blockers.map((b) => `    * ${b}`),
      '  PASS requires complete coverage in both directions and a CERTIFIED bound. An unseen triangle is',
      '  not a passing triangle, and a gate that could not be evaluated is not a passed gate.');
    return { verdict: 'NOT-A-VERDICT', gatesPass, reasons, lines };
  }

  lines.push('', `  PASS   H1 CERTIFIED <= ${um(h1.boundMm)} um, H2 WITNESSED ${um(h2.witnessedMm)} um at the stated resolving power, all ${gates.length} gates pass.`,
    // The resolving power is reprinted INSIDE the PASS block on purpose: this line is the one that gets
    // quoted, and H2's guarantee is phase-A coverage at a stated pitch, never exhaustion (see finding 3).
    `  H2 RESOLVING POWER, INSEPARABLE FROM THIS PASS: ${h2.coverage}`,
    '  H2 REMAINS WITNESSED, NOT CERTIFIED: it is a sound LOWER bound on the true surface->mesh distance,',
    '  so this PASS means "nothing found at that resolving power", not "nothing exists". A certified H2',
    '  needs interval arithmetic on rA and is deliberately deferred.');
  return { verdict: 'PASS', gatesPass, reasons, lines };
}

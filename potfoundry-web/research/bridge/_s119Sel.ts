// _s119Sel.ts — S119: EDGE SELECTION IN THE PARAMETER METRIC. The STRATA-001 fix, as a pure module.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A SEPARATE FILE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `_strataConformBisectL.test.ts` is one 5,900-line closure and nothing inside it can be unit-tested.
// The rule this session changes is three lines of arithmetic and one comparison, so it lives here where
// a test can pin it (`_s119Sel.test.ts`), and the driver imports it. THE IMPORT IS A VALUE IMPORT BUT IS
// REACHABLE ONLY WHEN PF_CB_S119_PARAMSEL IS SET — same discipline as the S23 density field and the S29
// accept-override, and it is what makes flag-OFF byte-identity a property of the CONSTRUCTION rather than
// an assertion. (Proved anyway: research/tools/run-s119-byteid.sh.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MECHANISM, IN ONE PARAGRAPH
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The driver picks WHICH edge of a popped triangle to split by a 3-D quantity — max chord SAG (DIRECTED)
// or longest 3-D edge (LEPP / S4 LONGFALL). Both are lengths in R^3. Across a radius cliff, rA jumps by a
// constant (CelticTriquetra: 1.720469 mm), so the 3-D chord between the two flanks carries that jump as an
// additive term under the square root: halving delta-theta leaves |e|_3D essentially unchanged. The driver
// therefore re-selects the same edge, halving delta-theta each time, and the facet's (theta,z) footprint —
// which is what the emitted triangle actually is, as a graph over the parameter domain — collapses toward
// zero width. That is the DEGENERACY POLE (graphRatio = 3D area / |arc-space area| -> infinity), and it is
// scale-free: more density makes MORE of them, not fewer (S118 measured 0 -> 8.64% -> 17.92%).
//
// The parameter metric restores the property a bisection driver needs: du = rMean*dTheta, dv = dz, so
// splitting an edge at its midpoint DOES halve its length in the metric the footprint is measured in.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE DOES *NOT* DO — and the omission is the design
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// It has no accept test, no refusal, and no threshold. It answers ONLY "given the candidate edges the
// driver has already admitted, in what ORDER should they be tried". The S118 ADMIT gate failed precisely
// by adding a refusal (banning thin footprints strands the real demand a genuine C0 cliff creates, and
// made CelticTriquetra's headline MAX 2.18x WORSE). A reordering cannot strand anything: the driver's
// last-resort loop is untouched, so every edge that could be split before can still be split.
//
// `rMean` is the mean of the two endpoint radii, taken from the coordinates the driver already stores
// (r = hypot(x,y)). ZERO rA evaluations — this selector is strictly CHEAPER than the max-SAG one it
// replaces, which costs an absolute-pitch lattice of rA calls per candidate edge. Same convention as
// research/tools/s118ThinCensus.ts, which measures the arc footprint the same way.

/** The four selection rules S119 can install. `param` is the treatment; the rest are contrast/placebo. */
export type S119SelMode =
  /** TREATMENT: longest edge in the parameter metric (u = rMean*theta, v = z). */
  | 'param'
  /** CONTRAST: longest 3-D edge. Isolates "the parameter METRIC" from "a longest-edge RULE". */
  | 'long3d'
  /** PLACEBO: shortest 3-D edge — an uninformed rule at the same triangle budget. */
  | 'short3d'
  /** PLACEBO: uniformly random among the candidates, from a seeded PRNG so the arm is reproducible. */
  | 'rand';

/**
 * Parse PF_CB_S119_PARAMSEL. Returns null for unset / '' / '0' — the untouched control path.
 *
 * FAIL LOUD on anything else, matching the PF_CB_RANK and PF_CB_DRIVER precedent in the driver: a typo'd
 * mode silently falling back to the default would produce a run tagged as one experiment and driven by
 * another, which is the one confound this session cannot afford.
 */
export function parseS119Sel(raw: string | undefined): S119SelMode | null {
  if (raw === undefined || raw === '' || raw === '0') return null;
  if (raw === '1' || raw === 'param') return 'param';
  if (raw === 'long3d' || raw === 'short3d' || raw === 'rand') return raw;
  throw new Error(
    `PF_CB_S119_PARAMSEL: unknown mode '${raw}' — expected 0 | 1 | param | long3d | short3d | rand`,
  );
}

/**
 * Edge length in the PARAMETER METRIC: |(rMean*dTheta, dz)|.
 *
 * @param ra      radius at endpoint a (mm) = hypot(x_a, y_a)
 * @param rb      radius at endpoint b (mm)
 * @param dTheta  SHORTEST-ARC theta delta a->b (rad) — the driver's `dTh`, already seam-corrected
 * @param dz      z_b - z_a (mm)
 */
export function paramEdgeLen(ra: number, rb: number, dTheta: number, dz: number): number {
  return Math.hypot(((ra + rb) / 2) * dTheta, dz);
}

/**
 * Deterministic 32-bit xorshift. A placebo arm that cannot be re-run is not a control, so `rand` never
 * touches Math.random.
 */
export function makeS119Rng(seed: number): () => number {
  let s = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  return (): number => {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) % 0x1000000) / 0x1000000;
  };
}

/**
 * The ORDER in which the driver should try the candidate edges of one triangle.
 *
 * `cand` is the driver's own admitted candidate list (it has already applied FLOOR_MM and the aspect
 * guard); this returns a PERMUTATION of it and never drops a member — best-first, but the driver still
 * falls through to the next candidate on a refusal exactly as it does today.
 *
 * Ties keep ascending edge index: Array.prototype.sort is stable in V8 and `cand` arrives in ascending
 * order, which reproduces the control's behaviour on a tie rather than shuffling it.
 */
export function s119Order(
  mode: S119SelMode,
  lp: readonly number[],
  l3: readonly number[],
  cand: readonly number[],
  rng: () => number,
): number[] {
  if (mode === 'rand') {
    const out = cand.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }
  const key = (e: number): number => (mode === 'param' ? lp[e] : mode === 'long3d' ? l3[e] : -l3[e]);
  return cand.slice().map((e) => [key(e), e] as [number, number])
    .sort((x, y) => y[0] - x[0])
    .map(([, e]) => e);
}

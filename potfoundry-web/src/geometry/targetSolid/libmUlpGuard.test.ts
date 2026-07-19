/**
 * libmUlpGuard.test.ts — independent platform-libm accuracy guard.
 *
 * The interval screen's outward soundness rests on ONE unguarded platform
 * assumption: every libm-backed node (Math.sin/cos/exp/log/pow/atan2) is widened
 * by exactly `FAST_REL_LIBM = 8·2⁻⁵²` relative (validatedResidualProgram.ts). If
 * the host's libm ever exceeds that relative error, the screen's enclosure can
 * FAIL TO CONTAIN the true value and the certifier can silently OVER-ACCEPT an
 * over-budget triangle.
 *
 * Nothing else checks this: the existing containment tests sample the "truth" with
 * the SAME Math.* the screen uses, so a systematic platform bias cancels on both
 * sides and stays invisible. This test breaks that symmetry — it cross-checks the
 * platform binary64 result against an INDEPENDENT high-precision reference (the
 * same decimal.js kernel the proof layer trusts as its refusal authority,
 * `decimalInterval.ts`, at 100 significant digits with directed rounding). The
 * reference encloses the true value to ~1e-100 relative, i.e. it is effectively
 * exact against the ~1e-16 errors under test.
 *
 * Method, per sample x (or (a,b)):
 *   P    = the platform libm result (binary64) — the value the screen widens.
 *   [lo,hi] = decimal enclosure of the TRUE function value at the exact x.
 *   Because T ∈ [lo,hi] and |P−T| is convex in T, a SOUND upper bound on the
 *   error is max(|P−lo|, |P−hi|); dividing by |P| (the exact multiplier the
 *   screen's `value ± |value|·FAST_REL_LIBM` widening uses) yields a guaranteed
 *   over-estimate of the relative libm error. If that over-estimate is ≤ the
 *   bound, the widening is provably sound at that sample.
 *
 * The assertion FAILS LOUDLY (naming the function + argument + measured ULP) if any
 * platform call exceeds the bound — catching a platform where acceptance could
 * silently over-accept. Runs in the DEFAULT suite: ~900 fast samples, not millions.
 */
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  decimalAtan2,
  decimalCos,
  decimalExp,
  decimalLn,
  decimalPoint,
  decimalPow,
  decimalSin,
  exactFloat64Decimal,
  type DecimalInterval,
} from './decimalInterval';
import { FAST_REL_LIBM } from './validatedResidualProgram';

// Measurement arithmetic well above the 100-digit reference and the ~1e-16 errors
// under test, so neither the endpoint subtraction nor the ratio drops a figure
// that matters. (The reference itself is the accuracy ceiling, at ~1e-100.)
const Measure = Decimal.clone({ precision: 200 });
const ONE_ULP = new Measure(2).pow(-52); // relative libm error unit
const FAST_REL_LIBM_DECIMAL = new Measure(exactFloat64Decimal(FAST_REL_LIBM));

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type LibmProbe =
  | { readonly kind: 'ratio'; readonly relative: Decimal }
  | { readonly kind: 'exact-zero-consistent' }
  | { readonly kind: 'exact-zero-inconsistent' }
  | { readonly kind: 'nonfinite' };

function probeRelativeError(platform: number, truth: DecimalInterval): LibmProbe {
  if (!Number.isFinite(platform)) return { kind: 'nonfinite' };
  const lo = new Measure(truth.lower);
  const hi = new Measure(truth.upper);
  if (platform === 0) {
    // The screen widens 0 to the exact point [0,0]; that is sound only if the true
    // value is 0 too. Below FAST_MIN_MAGNITUDE the screen actually refuses, so this
    // is a belt-and-suspenders check that an exact libm zero coincides with a true
    // zero rather than a value bounded away from it.
    const containsZero = lo.lessThanOrEqualTo(0) && hi.greaterThanOrEqualTo(0);
    return { kind: containsZero ? 'exact-zero-consistent' : 'exact-zero-inconsistent' };
  }
  const p = new Measure(exactFloat64Decimal(platform));
  const errLo = p.minus(lo).abs();
  const errHi = p.minus(hi).abs();
  const maxErr = errLo.greaterThanOrEqualTo(errHi) ? errLo : errHi; // sup over T ∈ [lo,hi]
  const relative = maxErr.dividedBy(p.abs()); // base |P| = the screen's widening multiplier
  return { kind: 'ratio', relative };
}

interface LibmSample {
  readonly platform: number;
  readonly truth: DecimalInterval;
  readonly label: string;
}

function unarySamples(
  fn: (x: number) => number,
  enclose: (interval: DecimalInterval) => DecimalInterval,
  xs: readonly number[]
): LibmSample[] {
  return xs.map((x) => ({
    platform: fn(x),
    truth: enclose(decimalPoint(exactFloat64Decimal(x))),
    label: `x=${x}`,
  }));
}

function binarySamples(
  fn: (a: number, b: number) => number,
  enclose: (a: DecimalInterval, b: DecimalInterval) => DecimalInterval,
  pairs: readonly (readonly [number, number])[]
): LibmSample[] {
  return pairs.map(([a, b]) => ({
    platform: fn(a, b),
    truth: enclose(decimalPoint(exactFloat64Decimal(a)), decimalPoint(exactFloat64Decimal(b))),
    label: `(${a}, ${b})`,
  }));
}

function assertLibmBound(name: string, samples: readonly LibmSample[]): void {
  let worst: Decimal = new Measure(0);
  let worstLabel = '(none)';
  let ratioSamples = 0;
  for (const { platform, truth, label } of samples) {
    const probe = probeRelativeError(platform, truth);
    if (probe.kind === 'nonfinite') continue;
    if (probe.kind === 'exact-zero-inconsistent') {
      expect(
        false,
        `${name} ${label}: platform returned exactly 0 but the true value ∈ ` +
          `[${truth.lower}, ${truth.upper}] excludes 0 — an unsound exact zero`
      ).toBe(true);
      continue;
    }
    if (probe.kind === 'exact-zero-consistent') continue;
    ratioSamples += 1;
    if (probe.relative.greaterThan(worst)) {
      worst = probe.relative;
      worstLabel = label;
    }
  }
  const worstUlp = worst.dividedBy(ONE_ULP).toNumber();
  // eslint-disable-next-line no-console
  console.log(
    `[libm-ulp] ${name}: worst ${worstUlp.toFixed(4)} ULP at ${worstLabel} ` +
      `(${ratioSamples} ratio samples; FAST_REL_LIBM bound = 8 ULP)`
  );
  expect(ratioSamples).toBeGreaterThan(0);
  expect(
    worst.lessThanOrEqualTo(FAST_REL_LIBM_DECIMAL),
    `${name}: worst platform libm relative error ${worstUlp.toFixed(4)} ULP at ` +
      `${worstLabel} EXCEEDS the screen's assumed FAST_REL_LIBM bound (8 ULP) — ` +
      `the interval screen could silently over-accept on this platform`
  ).toBe(true);
}

// ── Representative sample ranges (incl. the ranges the screen actually uses) ──

function trigInputs(): number[] {
  const xs: number[] = [];
  const rng = mulberry32(0x51ac);
  // Near k·π/2 — the sin/cos zeros and extrema (relative-error stress at zeros).
  for (let k = -8; k <= 8; k += 1) {
    const centre = (k * Math.PI) / 2;
    for (const d of [0, 1e-10, -1e-10, 1e-6, -1e-6, 1e-3, -1e-3, 0.1, -0.1]) xs.push(centre + d);
  }
  // A few full periods, uniformly.
  for (let i = 0; i < 80; i += 1) xs.push((rng() - 0.5) * 8 * Math.PI);
  // Large arguments — high petal/ridge counts drive trig args up to ~2π·k.
  for (let i = 0; i < 60; i += 1) xs.push((rng() - 0.5) * 500);
  // Near large multiples of π (argument-reduction stress).
  for (const k of [10, 25, 50, 79]) {
    for (const d of [0, 1e-6, -1e-6, 0.25]) xs.push(k * Math.PI + d);
  }
  return xs;
}

function expInputs(): number[] {
  const xs: number[] = [0, 1, -1, 0.5, -0.5, Math.LN2, -Math.LN2];
  const rng = mulberry32(0x1f2e);
  for (let i = 0; i < 80; i += 1) xs.push((rng() - 0.5) * 80); // [-40, 40]
  for (let i = 0; i < 40; i += 1) xs.push((rng() - 0.5) * 200); // [-100, 100] magnitude spread
  for (let i = 0; i <= 20; i += 1) xs.push(-20 + i * 1.25); // the bell-curve band styles use
  return xs;
}

function lnInputs(): number[] {
  const xs: number[] = [];
  const rng = mulberry32(0x77b1);
  // Powers of two across magnitude — exact, short decimals; positive by construction.
  for (let k = -50; k <= 50; k += 2) xs.push(2 ** k);
  // Near 1 — the zero of ln, where the relative error is most fragile.
  for (const d of [1e-10, -1e-10, 1e-6, -1e-6, 1e-3, -1e-3, 0.1, -0.1]) xs.push(1 + d);
  for (const x of [0.5, 1.5, 2, 3, 7, 10, 100, 1000, Math.E, Math.PI]) xs.push(x);
  for (let i = 0; i < 60; i += 1) xs.push(Math.exp((rng() - 0.5) * 60)); // e^±30, all > 0
  return xs;
}

function powPairs(): [number, number][] {
  const pairs: [number, number][] = [];
  const rng = mulberry32(0x9e37);
  const bases = [0.1, 0.25, 0.5, 0.9, 1.1, 1.5, 2, 3, 7, 10, 100];
  // Cusp / fractional exponents (vertical-tangent cusp at base 0) + integer powers.
  const exps = [0.5, 1 / 3, 2 / 3, 0.25, 1.5, 2, 2.5, 3, -0.5, -1, -2];
  for (const b of bases) for (const e of exps) pairs.push([b, e]);
  for (let i = 0; i < 40; i += 1) {
    pairs.push([Math.exp((rng() - 0.5) * 6), (rng() - 0.5) * 4]); // base∈(0.05,20], exp∈[-2,2]
  }
  return pairs;
}

function atan2Pairs(): [number, number][] {
  const pairs: [number, number][] = [];
  const rng = mulberry32(0x85eb);
  // Decimal atan2 evaluates 8 directed corners per sample, so keep the random
  // sweep modest; the structured near-axis / branch-cut cases below carry the edges.
  for (let i = 0; i < 56; i += 1) pairs.push([(rng() - 0.5) * 20, (rng() - 0.5) * 20]);
  // Near-axis and branch-cut approach (x<0, y→0⁺/0⁻): the ±π principal-angle edges.
  for (const x of [-5, -1, 1, 5]) {
    for (const y of [1e-8, -1e-8, 1e-3, -1e-3]) pairs.push([y, x]);
  }
  for (const y of [1, -1]) for (const x of [1e-8, -1e-8]) pairs.push([y, x]);
  return pairs;
}

describe('platform libm stays within the screen FAST_REL_LIBM assumption', () => {
  it('FAST_REL_LIBM is the documented positive 8·2⁻⁵² relative bound', () => {
    // Drift guard on the constant itself: loosening it here must be a conscious act.
    expect(FAST_REL_LIBM).toBe(8 * 2 ** -52);
    expect(FAST_REL_LIBM).toBeGreaterThan(0);
  });

  it('Math.sin relative error ≤ FAST_REL_LIBM', () => {
    assertLibmBound('Math.sin', unarySamples(Math.sin, decimalSin, trigInputs()));
  });

  it('Math.cos relative error ≤ FAST_REL_LIBM', () => {
    assertLibmBound('Math.cos', unarySamples(Math.cos, decimalCos, trigInputs()));
  });

  it('Math.exp relative error ≤ FAST_REL_LIBM', () => {
    assertLibmBound('Math.exp', unarySamples(Math.exp, decimalExp, expInputs()));
  });

  it('Math.log relative error ≤ FAST_REL_LIBM', () => {
    assertLibmBound('Math.log', unarySamples(Math.log, decimalLn, lnInputs()));
  });

  it('Math.pow relative error ≤ FAST_REL_LIBM', () => {
    assertLibmBound('Math.pow', binarySamples(Math.pow, decimalPow, powPairs()));
  });

  it('Math.atan2 relative error ≤ FAST_REL_LIBM', () => {
    assertLibmBound('Math.atan2', binarySamples(Math.atan2, decimalAtan2, atan2Pairs()));
  });
});

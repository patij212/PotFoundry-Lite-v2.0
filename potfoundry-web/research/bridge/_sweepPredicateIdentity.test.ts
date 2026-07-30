// _sweepPredicateIdentity.test.ts — PINNING TEST for the predicate extraction. RESEARCH ONLY. Gated PF_SWEEP_ID=1.
//
// WHAT THIS EXISTS TO PROVE, and why an md5 could not prove it here.
//
// Parallelising the sweep driver's predicate required `canon` / `dTh` / `edgeSag` / `locateKink` /
// `computeVerdict` to move out of _strataConformBisect.test.ts's closure and into _sweepPredicate.ts, so that
// the driver and the worker threads run ONE body instead of two copies. Those four functions are ALSO on the
// HEAP driver's hot path (`refineDirected` -> edgeSag, `splitEdge` and the locus probe -> locateKink), and the
// heap driver is the CONTROL for every A/B in the STRATA campaign. It must be byte-unchanged.
//
// The obvious check is a heap-driver STL md5 before and after the refactor. That was not available: the sweep
// driver itself was uncommitted working-tree state, so "before" is not recoverable from git, and the file was
// already several hundred lines ahead of HEAD. This test is the direct substitute and is strictly sharper —
// it compares the extracted functions against VERBATIM COPIES of the pre-refactor bodies, on inputs chosen to
// hit the places where a transcription slip would actually show:
//
//   * the theta SEAM (theta=0=2pi), where `dTh` picks the short arc and `edgeSag` lifts with the RAW theta
//     while evaluating rA at the CANONICAL one — the single easiest line to "clean up" into a bug;
//   * C0 loci and their immediate neighbourhoods, where `locateKink`'s bracket-halving and its two-scale class
//     test decide crease-vs-jump on a ratio that a one-ULP difference can flip;
//   * degenerate and near-degenerate edges (identical endpoints, sub-nanometre separation), where `edgeSag`
//     early-returns on eL2 < 1e-24 and `locateKink` early-returns on a flat scan;
//   * out-of-domain theta and z, because this driver's `R` applies NO canonicalisation and NO clamp of its own.
//
// The copies below are the pre-refactor bodies. DO NOT "fix" them to match _sweepPredicate.ts — they are the
// reference, and their job is to fail if _sweepPredicate.ts ever drifts.
import { describe, it, expect } from 'vitest';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import {
  canonTheta, dThRaw, edgeSagRaw, locateKinkRaw, edgeVerdictRaw,
  type SweepPredConst,
} from './_sweepPredicate';

const RUN = process.env.PF_SWEEP_ID === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

// The driver's DEFAULTS, verbatim from _strataConformBisect.test.ts (PF_CB_ESN 8, PF_CB_REF_HS 0.03,
// PF_CB_REF_NMAX 64, PF_CB_KINK_SCAN 16, PF_CB_KINK_HALVINGS 24, PF_CB_KINK_RATIO 0.15,
// PF_CB_JUMP_RATIO 0.62, PF_CB_CONF_UM 0.6).
const K: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.0006,
};

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

// ══════════════ THE PRE-REFACTOR BODIES, COPIED VERBATIM. This block is the reference. ══════════════
interface OrigKink { t: number; big: number; ratio: number; jump: boolean }
interface OrigVerdict { sag: number; kink: OrigKink | null; conformed: boolean; px: number; py: number; pz: number }

/** ORIGINAL `canon` */
const origCanon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };

/** ORIGINAL `dTh`, with the mesh arrays inlined as two scalars */
const origDTh = (tha: number, thb: number): number => {
  let d = thb - tha;
  if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
  return d;
};

/** ORIGINAL `edgeSag`, with vx/vy/vz/vth reads turned into parameters and ES_N/REF_NMAX/REF_HS inlined */
const origEdgeSag = (
  R: (th: number, z: number) => number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  thA: number, thB: number,
): number => {
  let ex = bx - ax; let ey = by - ay; let ez = bz - az;
  const eL2 = ex * ex + ey * ey + ez * ez;
  if (eL2 < 1e-24) return 0;
  const th0 = thA; const d = origDTh(thA, thB); const z0 = az; const dz = bz - az;
  let best = 0;
  const esN = Math.max(K.esN, Math.min(K.refNmax, Math.ceil(Math.sqrt(eL2) / K.refHs)));
  for (let k = 1; k < esN; k += 1) {
    const t = k / esN;
    const th = th0 + d * t; const z = z0 + dz * t;
    const r = R(origCanon(th), z);
    const px = r * Math.cos(th) - ax; const py = r * Math.sin(th) - ay; const pz = z - az;
    const proj = (px * ex + py * ey + pz * ez) / eL2;
    const qx = px - proj * ex; const qy = py - proj * ey; const qz = pz - proj * ez;
    const dist = Math.hypot(qx, qy, qz);
    if (dist > best) best = dist;
  }
  // `ex/ey/ez` were `let` and never reassigned in the original; kept `let` here so this really is a copy.
  ex += 0; ey += 0; ez += 0;
  return best;
};

/** ORIGINAL `locateKink` */
const origLocateKink = (
  R: (th: number, z: number) => number,
  th0: number, z0: number, th1: number, z1: number,
): OrigKink | null => {
  const dth = th1 - th0; const dz = z1 - z0;
  const at = (t: number): number => R(origCanon(th0 + dth * t), z0 + dz * t);
  const N = K.kinkScan;
  const rs = new Float64Array(N + 1);
  for (let k = 0; k <= N; k += 1) rs[k] = at(k / N);
  let bi = -1; let bv = 0;
  for (let k = 1; k < N; k += 1) { const d2 = Math.abs(rs[k + 1] - 2 * rs[k] + rs[k - 1]); if (d2 > bv) { bv = d2; bi = k; } }
  if (bi < 0 || bv <= 0) return null;
  let lo = (bi - 1) / N; let hi = (bi + 1) / N;
  let fLo = rs[bi - 1]; let fHi = rs[bi + 1]; let fMid = rs[bi];
  for (let it = 0; it < K.kinkHalvings; it += 1) {
    const mid = 0.5 * (lo + hi);
    const q1 = 0.5 * (lo + mid); const q3 = 0.5 * (mid + hi);
    const fq1 = at(q1); const fq3 = at(q3);
    const dL = Math.abs(fLo - 2 * fq1 + fMid);
    const dR = Math.abs(fMid - 2 * fq3 + fHi);
    if (dL >= dR) { hi = mid; fHi = fMid; fMid = fq1; } else { lo = mid; fLo = fMid; fMid = fq3; }
  }
  const tStar = 0.5 * (lo + hi);
  const w = 1 / N;
  const c = at(tStar);
  const big = Math.abs(at(tStar + w) - 2 * c + at(tStar - w));
  const small = Math.abs(at(tStar + w / 4) - 2 * c + at(tStar - w / 4));
  if (big <= 1e-12) return null;
  const ratio = small / big;
  if (ratio < K.kinkRatio) return null;
  return { t: tStar, big, ratio, jump: ratio > K.jumpRatio };
};

/** ORIGINAL `crossPoint` + `computeVerdict` (minus `jumpConfirmed`, which was never a measurement) */
const origVerdict = (
  R: (th: number, z: number) => number,
  thA: number, zA: number, xA: number, yA: number,
  thB: number, zB: number, xB: number, yB: number,
): OrigVerdict => {
  const sag = origEdgeSag(R, xA, yA, zA, xB, yB, zB, thA, thB);
  const kink = K.snap ? origLocateKink(R, thA, zA, thA + origDTh(thA, thB), zB) : null;
  if (kink === null) return { sag, kink: null, conformed: true, px: 0, py: 0, pz: 0 };
  // crossPoint: edgeParam(a,b,t*) then one R at the CANONICAL theta
  const th = thA + origDTh(thA, thB) * kink.t; const z = zA + (zB - zA) * kink.t;
  const thc = origCanon(th); const r = R(thc, z);
  const p: [number, number, number] = [r * Math.cos(thc), r * Math.sin(thc), z];
  const conformed = Math.min(
    Math.hypot(xA - p[0], yA - p[1], zA - p[2]),
    Math.hypot(xB - p[0], yB - p[1], zB - p[2]),
  ) <= K.confMm;
  return { sag, kink, conformed, px: p[0], py: p[1], pz: p[2] };
};
// ══════════════════════════════════ end of the reference block ══════════════════════════════════

/** xorshift32 — deterministic, no dependence on Math.random, so a failure is always reproducible. */
function rng(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
    return ((s >>> 0) % 16777216) / 16777216;
  };
}

interface Vert { th: number; z: number; x: number; y: number }

/**
 * Build an adversarial vertex set: a uniform grid (the driver's own initial mesh), a quasi-random cloud, and
 * SEAM CLUSTERS just either side of theta=0 — the pairs whose `dTh` must take the short arc across the wrap.
 */
function vertices(R: (th: number, z: number) => number, rnd: () => number): Vert[] {
  const vs: Vert[] = [];
  const lift = (th: number, z: number): Vert => {
    const c = origCanon(th); const r = R(c, z);
    return { th: c, z, x: r * Math.cos(c), y: r * Math.sin(c) };
  };
  for (let i = 0; i < 24; i += 1) for (let j = 0; j <= 16; j += 1) vs.push(lift((TWO_PI * i) / 24, (H * j) / 16));
  for (let i = 0; i < 600; i += 1) vs.push(lift(TWO_PI * rnd(), H * rnd()));
  for (const eps of [1e-12, 1e-9, 1e-6, 1e-3, 1e-2]) {
    for (let j = 0; j <= 8; j += 1) { vs.push(lift(eps, (H * j) / 8)); vs.push(lift(TWO_PI - eps, (H * j) / 8)); }
  }
  // out-of-domain z: this driver's R does not clamp, and that is part of the surface it has always used
  for (const z of [-3, -1e-9, 0, H, H + 1e-9, H + 3]) for (let i = 0; i < 5; i += 1) vs.push(lift((TWO_PI * i) / 5, z));
  return vs;
}

describe('sweep predicate extraction is arithmetically a no-op', () => {
  it.runIf(RUN)('reproduces the pre-refactor bodies bit-for-bit on every style', () => {
    // Five styles spanning the campaign's classes: crease-dominated, genuine C0, hash-based, faceted, smooth.
    const styles = ['GothicArches', 'BasketWeave', 'Voronoi', 'GeometricStar', 'HarmonicRipple'];
    let compared = 0; let mismatches = 0; let withKink = 0; let jumps = 0; let degenerate = 0; let seamPairs = 0;
    const firstFailures: string[] = [];

    for (const style of styles) {
      const rA = buildRadiusFn(style as StyleId, registryDefaults(style), DIMS);
      const R = (th: number, z: number): number => rA(th, z);
      const rnd = rng(0x5EED_1234 ^ style.length);
      const vs = vertices(R, rnd);

      // Pair every vertex with several partners at very different separations, so both `edgeSag` regimes
      // (esN pinned at the 8 floor for a short edge, at the 64 ceiling for a long one) are exercised.
      for (let i = 0; i < vs.length; i += 1) {
        for (const step of [1, 7, 25, 101, 313]) {
          const j = (i + step) % vs.length;
          const a = vs[i]; const b = vs[j];
          if (Math.abs(origDTh(a.th, b.th)) > Math.PI / 2) seamPairs += 1;

          if (!Object.is(origCanon(a.th), canonTheta(a.th))) { mismatches += 1; firstFailures.push(`canon ${style} ${a.th}`); }
          if (!Object.is(origDTh(a.th, b.th), dThRaw(a.th, b.th))) { mismatches += 1; firstFailures.push(`dTh ${style} ${a.th},${b.th}`); }

          const os = origEdgeSag(R, a.x, a.y, a.z, b.x, b.y, b.z, a.th, b.th);
          const ns = edgeSagRaw(R, a.x, a.y, a.z, b.x, b.y, b.z, a.th, dThRaw(a.th, b.th), K);
          if (!Object.is(os, ns)) { mismatches += 1; if (firstFailures.length < 8) firstFailures.push(`edgeSag ${style} ${os} != ${ns}`); }

          const ok = origLocateKink(R, a.th, a.z, a.th + origDTh(a.th, b.th), b.z);
          const nk = locateKinkRaw(R, a.th, a.z, a.th + dThRaw(a.th, b.th), b.z, K);
          if ((ok === null) !== (nk === null)) { mismatches += 1; if (firstFailures.length < 8) firstFailures.push(`locateKink null-ness ${style}`); }
          else if (ok !== null && nk !== null) {
            withKink += 1;
            if (ok.jump) jumps += 1;
            if (!Object.is(ok.t, nk.t) || !Object.is(ok.big, nk.big) || !Object.is(ok.ratio, nk.ratio) || ok.jump !== nk.jump) {
              mismatches += 1;
              if (firstFailures.length < 8) firstFailures.push(`locateKink ${style} t ${ok.t} != ${nk.t}`);
            }
          }

          const ov = origVerdict(R, a.th, a.z, a.x, a.y, b.th, b.z, b.x, b.y);
          const nv = edgeVerdictRaw(R, a.th, a.z, a.x, a.y, b.th, b.z, b.x, b.y, K);
          if (!Object.is(ov.sag, nv.sag) || ov.conformed !== nv.conformed
            || !Object.is(ov.px, nv.px) || !Object.is(ov.py, nv.py) || !Object.is(ov.pz, nv.pz)
            || (ov.kink === null) !== (nv.kink === null)
            || (ov.kink !== null && nv.kink !== null && !Object.is(ov.kink.t, nv.kink.t))) {
            mismatches += 1;
            if (firstFailures.length < 8) firstFailures.push(`verdict ${style} sag ${ov.sag} != ${nv.sag}`);
          }
          compared += 1;
        }
        // the degenerate case `edgeSag` early-returns on, and the sub-weld separation the driver actually hits
        const a = vs[i];
        if (!Object.is(origEdgeSag(R, a.x, a.y, a.z, a.x, a.y, a.z, a.th, a.th), edgeSagRaw(R, a.x, a.y, a.z, a.x, a.y, a.z, a.th, 0, K))) mismatches += 1;
        degenerate += 1;
      }
    }

    // eslint-disable-next-line no-console
    console.log(`\n  sweep predicate identity: ${compared} edge comparisons across 5 styles`
      + `\n    ${withKink} located a kink (${jumps} jump-class), ${seamPairs} pairs crossed the theta seam, ${degenerate} degenerate edges`
      + `\n    MISMATCHES ${mismatches}${firstFailures.length > 0 ? `\n    first: ${firstFailures.join(' | ')}` : ''}\n`);

    // NON-VACUITY FIRST. A pinning test that compared nothing would pass, and the regimes that matter are the
    // seam and the kink — assert they were actually reached before believing the zero.
    expect(compared).toBeGreaterThan(15000);
    expect(withKink).toBeGreaterThan(1000);
    expect(seamPairs).toBeGreaterThan(100);
    expect(mismatches).toBe(0);
  }, 1_800_000);
});

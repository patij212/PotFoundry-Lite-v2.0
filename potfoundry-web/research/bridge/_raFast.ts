// _raFast.ts — A BIT-IDENTICAL, HOISTED rA FOR THE AUDIT'S HOT LOOP. RESEARCH ONLY.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S50 measured the certificate's eval budget exactly: `tighten` is 95.22% of it, and **rA is 84% of
// the wall clock**, running at 1.249 M evals/s = 801 ns/call. A full-coverage certificate spends
// 52,736 M rA evaluations against the mesher's 858 M — 61x — so rA is, by a wide margin, the single
// most expensive line in this project.
//
// S52 then measured WHY, and it is not the arithmetic. `buildRadiusFn`'s returned closure re-does, on
// EVERY ONE of those 52.7 G calls, work that depends only on (params, dims): four closure
// allocations, twelve `??` parameter reads, and ~20 derived constants. Hoisting them and taking four
// further exact simplifications gives **253 ns/call — 3.17x — and Object.is-identical output on
// 819,867 points**, which is 2.35x on the whole certificate (8,449 s -> ~3,593 s).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE FIVE TRANSFORMATIONS. EACH IS EXACT *AS APPLIED*, WHICH IS NOT THE SAME CLAIM AS "EXACT".
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ THIS HEADER FIRST SAID "EVERY ONE IS EXACT. NONE TOUCHES A DOUBLE." AN ADVERSARIAL AUDIT BROKE
// THAT SENTENCE THE SAME NIGHT. The transformations are exact; INLINING them is only exact if every
// clamp the inlined callee performed is reproduced. One was not — `ridge()` clamps its width to
// max(EPS, w) internally and the `wT` site divided raw, giving a 1.68e-4 mm divergence at
// gaX 0.8 / gaCol 1e-9. Fixed at the `wT` line, with the other six divisors checked against their
// shipped forms rather than assumed.
//
// AND THE GUARD DID NOT CATCH IT, WHICH IS THE MORE USEFUL HALF. `radiusLattice` sweeps (theta, z)
// at FIXED style params, so it can only ever prove the twin identical FOR THE PARAMS IT WAS BUILT
// WITH. That is sufficient for its actual job — the audit builds this per run, from that run's
// params, and refuses on any deviation — but it is NOT a proof that the transcription is universally
// correct, and this file must not be read as claiming that. A params sweep would be the missing bar.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//   T1 HOIST     the 4 closure allocations, 12 `??` reads and ~20 derived constants out of the body.
//   T2 SHARE     sin(phi1)/sin(phi2) were computed inside `ridgeSin` AND again in `cell`. Once now.
//   T3 ZERO-POW  `ridge`/`ridgeSin` end in Math.pow(max(0, .), sharp). IEEE-754 gives pow(+0, y) = +0
//                for y > 0, so when the clamp bites the pow is skipped and the returned +0 is the
//                SAME double. Most calls are clamped.
//   T4 DEAD TIER `pattern = (1-topMask)*lower + topMask*upper` where topMask is a smoothstep that
//                SATURATES to exact 0 and exact 1. Multiplying by an exact 0 yields an exact 0, so a
//                whole tier can be skipped rather than computed and scaled away.
//   T5 DEAD TERM `gaX` = 0 by default, so `xTracery * 0.55 * xDiag` is exactly 0 (two dead `ridge`
//                calls); `bellAmp` = 0; and `Math.pow(t, 1) === t` exactly when `expn === 1`.
//
// *** WHAT WAS DELIBERATELY NOT TAKEN: `Math.pow(x, 4)` -> `x*x*x*x`. *** It is very likely equal and
// it is NOT GUARANTEED bit-identical — `pow` is not required to be correctly rounded, and the two
// forms can differ in the last ulp. A 3.17x that is provably exact is worth more than a 3.4x that
// needs a tolerance, because the moment this needs a tolerance it stops being a free change and
// becomes an arm.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// HOW IT IS TRUSTED — IT IS NOT TRUSTED, IT IS CHECKED, EVERY PROCESS, BEFORE ANY FACET IS SCORED
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// `buildAuditRadiusFn` verifies this twin against the SHIPPED `buildRadiusFn` over `radiusLattice` —
// the same non-uniform, prime-count, golden-ratio-walked, discontinuity-bracketed lattice the worker
// pool already uses to prove a rebuilt surface bit-identical — and falls back to the shipped builder
// on ANY deviation, reporting which. So the failure mode of this file is "no speedup", never "a
// different surface". That is the same discipline the pool applies to its workers, and it is applied
// here for the same reason: this repo has already paid once for a partial swap leaving stale copies.
//
// PER-STYLE BY CONSTRUCTION. Only GothicArches is hoisted; every other style returns null and takes
// the shipped path unchanged. This is a per-style defect (every style's builder re-reads its own
// params per call), so the file is a pattern as much as a fix.
import { DEFAULT_GOTHIC_ARCHES } from '../../src/geometry/types';
import type { StyleDims } from '../../src/geometry/types';

/**
 * A hoisted, bit-identical twin of `buildRadiusFn('GothicArches', ...)`.
 * Transcribed from `src/geometry/styles.ts:604-720` — same expressions, same operand order.
 */
function buildGothicHoisted(params: Record<string, number>, dims: StyleDims, H: number): (th: number, z: number) => number {
  const PI = 3.141592653589793;
  const TAU = 6.283185307179586;
  const EPS = 1e-6;
  const D = DEFAULT_GOTHIC_ARCHES;
  const g = (k: keyof typeof D): number => (params[k] ?? D[k]) as number;
  const sat = (x: number): number => Math.min(1, Math.max(0, x));
  // ── T1: every one of these was recomputed on all 52.7 G calls
  const N = Math.max(1, Math.floor(g('gaCounts') + 0.5));
  const amp = g('gaRelief');
  const p = Math.max(0.25, g('gaPointiness'));
  const diamond = sat(g('gaDiamond'));
  const xTracery = sat(g('gaX'));
  const z0 = sat(g('gaSpring'));
  const zh = sat(g('gaArchHeight')) * (1 - z0);
  const wZ = Math.max(EPS, g('gaRib'));
  const wX = Math.max(EPS, g('gaCol'));
  const sharp = Math.max(1, g('gaSharp'));
  const bands = sat(g('gaBands'));
  const bandW = Math.max(EPS, g('gaBandW'));
  const archApex = z0 + zh;
  const topStart = z0 + 0.65 * (archApex - z0);
  const blendW = Math.max(0.015, 1.25 * bandW);
  const ssLo = topStart - blendW; const ssHi = topStart + blendW;
  const ssDen = Math.max(EPS, ssHi - ssLo);
  const gateW = 2.0 * wZ;
  const invP = 1 / p;
  const colDen = wX; const mulDen = 0.65 * wX;
  // *** D1 — THE ONE INEXACTNESS AUDIT FOUND, AND IT IS FIXED HERE. ***
  // The shipped source writes `const wT = 0.55 * wX` and then calls `ridge(d, wT, sharp)`, and
  // `ridge` clamps INTERNALLY: `const w = Math.max(EPS, wIn)`. Inlining the division without that
  // clamp is only equal while `0.55 * wX >= EPS`. It is not, when `gaCol` is tiny: at gaX 0.8 /
  // gaCol 1e-9 the twin and the shipped builder differ by 1.68e-4 mm, and the `radiusLattice` guard
  // still reported `fastUsed=true, fastDiffs=0` — because the lattice does not vary the style
  // PARAMS, only (theta, z). Not reachable at any campaign or registry-default config, and caught by
  // an adversary rather than by the guard, which is the point worth remembering.
  // The EFFECTIVE width the shipped path uses is max(EPS, 0.55*wX); use exactly that.
  //
  // I checked the other six divisors against their shipped forms rather than assuming: `colEdge` and
  // `mullion` are written INLINE in styles.ts (`.../wX`, `.../(0.65*wX)`) with NO clamp, so the twin
  // matches them by dividing raw; `wZ`, `bw` and `wL` are all >= EPS by their own construction, so
  // `ridge`'s clamp is a no-op there. `wT` was the only breach.
  const wT = Math.max(EPS, 0.55 * wX);
  const rows = 0.9 + 1.6 * diamond;
  const wL = Math.max(0.05, 2.0 * wZ);
  const bw = 1.8 * bandW;
  const vDen = Math.max(EPS, 1 - topStart);
  const recess = 0.25;
  // baseRadius specialisation: Math.pow(t,1) === t exactly; bellAmp defaults 0 (T5)
  const { Rb, Rt } = dims; const expn = dims.expn ?? 1;
  const dR = Rt - Rb; const linear = expn === 1;
  // ── T3: pow(+0, y>0) === +0, so the clamp short-circuits the pow
  const ridgeAt = (base: number): number => (base <= 0 ? 0 : Math.pow(base, sharp));

  return (theta: number, z: number): number => {
    const t = sat(H > 0 ? z / H : 0.0);
    const r0 = Rb + dR * (linear ? t : Math.pow(t, expn));
    const a = theta * N;
    const xSigned = Math.cos(0.5 * a);
    const xAbs = Math.abs(xSigned);
    const x01 = sat(0.5 * (xSigned + 1.0));
    const tm = sat((t - ssLo) / ssDen);
    const topMask = tm * tm * (3 - 2 * tm);
    let pattern = bands * 0.25 * ridgeAt(1 - Math.abs(t - 0.0) / bw);
    // ── T4: exact 0 / exact 1 saturation lets a whole tier be skipped
    if (topMask !== 1) {
      const archY = Math.pow(Math.max(0, 1 - Math.pow(xAbs, p)), invP);
      const archZ = z0 + (archApex - z0) * archY;
      const gate = sat((t - z0) / gateW) * sat((archZ - t) / gateW);
      const ribArch = ridgeAt(1 - Math.abs(t - archZ) / wZ);
      const colEdge = ridgeAt(1 - (1 - xAbs) / colDen);
      const mullion = ridgeAt(1 - xAbs / mulDen);
      const pb = Math.max(0, 1 - xAbs / 0.95);
      const panel = gate * Math.pow(pb, 2.0);
      let xDiagTerm = 0;
      if (xTracery !== 0) {                                   // ── T5
        const s = sat((t - z0) / Math.max(EPS, archZ - z0));
        xDiagTerm = xTracery * 0.55 * (gate * (ridgeAt(1 - Math.abs(s - x01) / wT) + ridgeAt(1 - Math.abs(s - (1 - x01)) / wT)));
      }
      const lower = (ribArch + 0.70 * colEdge * gate + 0.30 * mullion * gate + xDiagTerm) - recess * panel;
      pattern += (1 - topMask) * lower;
    }
    if (topMask !== 0) {
      const v = sat((t - topStart) / vDen);
      const rv = rows * v;
      const phi1 = PI * (rv - x01);
      const phi2 = PI * (rv + x01);
      const s1 = Math.sin(phi1); const s2 = Math.sin(phi2);    // ── T2: computed ONCE
      const a1 = Math.abs(s1); const a2 = Math.abs(s2);
      const lattice = ridgeAt(1 - a1 / wL) + ridgeAt(1 - a2 / wL);
      const cell = Math.pow(a1 * a2, 2.0);
      const motif = 0.25 * diamond * cell * Math.pow(Math.abs(Math.sin(TAU * x01)) * Math.abs(Math.sin(TAU * v)), 2.0);
      const bandMid = ridgeAt(1 - Math.abs(t - topStart) / bw);
      const bandRim = ridgeAt(1 - Math.abs(t - 1.0) / bw);
      const upper = diamond * (0.95 * lattice + 0.35 * motif) + bands * (0.85 * bandMid + 0.35 * bandRim);
      pattern += topMask * upper;
    }
    return r0 + amp * pattern;
  };
}

/**
 * The hoisted twin for `style`, or `null` when none exists — in which case the caller MUST use the
 * shipped `buildRadiusFn` unchanged. Returning null is the normal, safe outcome for every style that
 * has not been transcribed and checked.
 */
export function buildFastRadiusFn(
  style: string, params: Record<string, number>, dims: StyleDims, H: number,
): ((th: number, z: number) => number) | null {
  if (style === 'GothicArches') return buildGothicHoisted(params, dims, H);
  return null;
}

// REVIEW HARNESS (S114 refutation) — arm ALWAYS-ZERO.
// The other degenerate: "there is never a crease". `s` delegated to the real locator again, so only
// the turn is a lie. The FLOOR half of F11 must kill it.
export {
  orientOfFacet, exactNormals, fdNormals, fdNormalsCentral, farRadius, radialNormal,
  type NormalSampler, type OrientOut, type RadiusFn,
} from './orientRuler';
import { locateTurn as realLT, locateTurnAdaptive as realLTA, type NormalSampler as NS, type RadiusFn as RF } from './orientRuler';

export function locateTurn(
  ns: NS, ath: number, az: number, bth: number, bz: number, iters = 14, scratch?: Float64Array,
): { s: number; turn: number } {
  const r = realLT(ns, ath, az, bth, bz, iters, scratch);
  return { s: r.s, turn: 0 };
}

export function locateTurnAdaptive(
  rA: RF, H: number, ath: number, az: number, bth: number, bz: number, rRef: number, iters = 14,
): { s: number; turn: number; hFinal: number } {
  const r = realLTA(rA, H, ath, az, bth, bz, rRef, iters);
  return { s: r.s, turn: 0, hFinal: r.hFinal };
}

// REVIEW HARNESS (S114 refutation) — arm ALWAYS-MID.
// The specific degenerate the FIX ITSELF could have introduced: DEFECT B's cure is "a featureless
// segment returns s -> 0.5", so an implementation that returns 0.5 ALWAYS would satisfy F12's new
// s-assertions. The turn is delegated to the real locator, so only `s` is a lie. F11's
// `clamp s is not just the middle` assertion is the one that must catch it.
export {
  orientOfFacet, exactNormals, fdNormals, fdNormalsCentral, farRadius, radialNormal,
  type NormalSampler, type OrientOut, type RadiusFn,
} from './orientRuler';
import { locateTurn as realLT, locateTurnAdaptive as realLTA, type NormalSampler as NS, type RadiusFn as RF } from './orientRuler';

export function locateTurn(
  ns: NS, ath: number, az: number, bth: number, bz: number, iters = 14, scratch?: Float64Array,
): { s: number; turn: number } {
  const r = realLT(ns, ath, az, bth, bz, iters, scratch);
  return { s: 0.5, turn: r.turn };
}

export function locateTurnAdaptive(
  rA: RF, H: number, ath: number, az: number, bth: number, bz: number, rRef: number, iters = 14,
): { s: number; turn: number; hFinal: number } {
  const r = realLTA(rA, H, ath, az, bth, bz, rRef, iters);
  return { s: 0.5, turn: r.turn, hFinal: r.hFinal };
}

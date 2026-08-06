// REVIEW HARNESS (S114 refutation) — arm ALWAYS-CREASE.
// The degenerate implementation the brief demands the fixtures reject: it reports a LARGE turn
// everywhere. `s` is delegated to the real locator, so this is the STRONGEST form of the degenerate
// answer — it is right about WHERE and lies only about HOW MUCH. If F11/F12 are two-sided, the
// ceiling half must kill it.
export {
  orientOfFacet, exactNormals, fdNormals, fdNormalsCentral, farRadius, radialNormal,
  type NormalSampler, type OrientOut, type RadiusFn,
} from './orientRuler';
import { locateTurn as realLT, locateTurnAdaptive as realLTA, type NormalSampler as NS, type RadiusFn as RF } from './orientRuler';

/** every edge is a crease, at the maximum possible turn */
const BIG = Math.PI;

export function locateTurn(
  ns: NS, ath: number, az: number, bth: number, bz: number, iters = 14, scratch?: Float64Array,
): { s: number; turn: number } {
  const r = realLT(ns, ath, az, bth, bz, iters, scratch);
  return { s: r.s, turn: BIG };
}

export function locateTurnAdaptive(
  rA: RF, H: number, ath: number, az: number, bth: number, bz: number, rRef: number, iters = 14,
): { s: number; turn: number; hFinal: number } {
  const r = realLTA(rA, H, ath, az, bth, bz, rRef, iters);
  return { s: r.s, turn: BIG, hFinal: r.hFinal };
}

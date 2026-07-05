/**
 * detectOpts.ts — the one canonical detector configuration for Tier-C.
 *
 * Mirrors the production call in fidelity/bandRemesh/assembleWithFeatures.ts,
 * minus its reliefIndicator (the component-boundary detector is not needed to
 * sense count-instability or extract the ridge/crease network Tier-C protects).
 * Shared by the dispatch predicate wiring (index.ts) and the Morse
 * protected-complex extractor (morseComplex.ts).
 */

export const TIER_C_DETECT_OPTS = {
  coarseRes: 40,
  fineRes: 120,
  minStrength: 1.0,
  minAngleDeg: 28,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
} as const;

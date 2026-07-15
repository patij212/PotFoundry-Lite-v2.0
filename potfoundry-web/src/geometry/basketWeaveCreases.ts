/**
 * Shared axis-aligned BasketWeave crease truth.
 *
 * The renderer uploads binary32 parameters and WGSL evaluates
 * `v = t * layers * ratio` when vertical gradient is zero. Keeping this
 * derivation in one module prevents conforming feature insertion and fidelity
 * exclusion from silently disagreeing about the same cell boundaries.
 */

const MIN_RATIO_F32 = Math.fround(0.01);

export interface BasketWeaveAxisAlignedCreaseInput {
  strands: number;
  layers: number;
  ratio: number;
  phase: number;
}

export interface BasketWeaveAxisAlignedCreases {
  strandCount: number;
  effectiveLayers: number;
  creaseU: number[];
  creaseT: number[];
}

function requireFinite(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`BasketWeave ${name} must be finite`);
  }
  return Math.fround(value);
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

/**
 * Derive all interior cell boundaries for the axis-aligned weave from the same
 * binary32 values uploaded to WGSL. For non-integral `layers * ratio`, every
 * positive integer k below that product is a real interior boundary.
 */
export function deriveBasketWeaveAxisAlignedCreases(
  input: BasketWeaveAxisAlignedCreaseInput
): BasketWeaveAxisAlignedCreases {
  const strandsF32 = requireFinite('strands', input.strands);
  const layersF32 = requireFinite('layers', input.layers);
  const ratioF32 = requireFinite('ratio', input.ratio);
  const phaseF32 = requireFinite('phase', input.phase);

  const strandCount = Math.max(1, Math.round(strandsF32));
  const layerScale = Math.max(1, layersF32);
  const ratioScale = Math.max(MIN_RATIO_F32, ratioF32);
  const effectiveLayers = Math.fround(layerScale * ratioScale);

  const creaseU = Array.from({ length: strandCount }, (_, m) =>
    wrapUnit((m - phaseF32) / strandCount)
  );
  const creaseT: number[] = [];
  for (let k = 1; k < effectiveLayers; k += 1) {
    creaseT.push(k / effectiveLayers);
  }

  return { strandCount, effectiveLayers, creaseU, creaseT };
}

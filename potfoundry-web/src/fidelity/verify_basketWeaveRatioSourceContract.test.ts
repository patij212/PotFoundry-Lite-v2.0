import { describe, expect, it } from 'vitest';
import stylesWgsl from '../assets/shaders/styles.wgsl?raw';
import { basketWeaveCreaseLoci } from './analyticSurfaceGate';
import { rOuterBasketWeave } from '../geometry/styles';
import { DEFAULT_BASKET_WEAVE, type StyleOptions } from '../geometry/types';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { normalizeStylePayload } from '../styles/runtimeContract';

const H = 80;
const R0 = 30;
const TAU = 2 * Math.PI;
const DIMS = { H, Rt: 40, Rb: 30 };

function basketOptions(bwRatio: number): StyleOptions {
  return {
    ...DEFAULT_BASKET_WEAVE,
    bwRatio,
    bwTwist: 0,
    bwVerticalGrad: 0,
    bwNoise: 0,
  } as StyleOptions;
}

describe('BasketWeave cell-ratio source and consumer contract', () => {
  it('routes the canonical wire value to CPU bwRatio and GPU slot 4', () => {
    const normalized = normalizeStylePayload('BasketWeave', { bw_ratio: 1.7 });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    expect(normalized.value.cpuOptions.bwRatio).toBe(1.7);
    expect(normalized.value.gpuParams[4]).toBe(Math.fround(1.7));
  });

  it('makes ratio geometrically live as vertical cell-spacing scale', () => {
    for (const ratio of [0.5, 1.5, 2]) {
      const ratioOptions = basketOptions(ratio);
      const unitOptions = basketOptions(1);
      for (let zIndex = 1; zIndex <= 12; zIndex += 1) {
        const z = (H * zIndex) / 30;
        if (z * ratio > H) continue;
        for (let thetaIndex = 0; thetaIndex < 48; thetaIndex += 1) {
          const theta = (TAU * (thetaIndex + 0.173)) / 48;
          expect(rOuterBasketWeave(theta, z, R0, H, ratioOptions)).toBeCloseTo(
            rOuterBasketWeave(theta, z * ratio, R0, H, unitOptions),
            12
          );
        }
      }
    }

    let maximumDifference = 0;
    for (let zIndex = 1; zIndex <= 20; zIndex += 1) {
      const z = (H * zIndex) / 21;
      for (let thetaIndex = 0; thetaIndex < 64; thetaIndex += 1) {
        const theta = (TAU * (thetaIndex + 0.211)) / 64;
        maximumDifference = Math.max(
          maximumDifference,
          Math.abs(
            rOuterBasketWeave(theta, z, R0, H, basketOptions(0.5)) -
              rOuterBasketWeave(theta, z, R0, H, basketOptions(1.5))
          )
        );
      }
    }
    expect(maximumDifference).toBeGreaterThan(0.5);
  });

  it('keeps feature insertion and fidelity exclusion on identical ratio-aware loci', () => {
    const scenarios = [
      { layers: 10, ratio: 0.1, expectedT: [] },
      { layers: 5, ratio: 0.5, expectedT: [0.4, 0.8] },
      { layers: 5, ratio: 1, expectedT: [0.2, 0.4, 0.6, 0.8] },
      { layers: 5, ratio: 1.25, expectedT: [0.16, 0.32, 0.48, 0.64, 0.8, 0.96] },
      { layers: 5, ratio: 2, expectedT: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] },
    ];

    for (const { layers, ratio, expectedT } of scenarios) {
      const normalized = normalizeStylePayload('BasketWeave', {
        bw_strands: 8,
        bw_layers: layers,
        bw_ratio: ratio,
        bw_twist: 0,
        bw_vertical_grad: 0,
        bw_phase: 0,
      });
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) continue;

      const packed = Float32Array.from(normalized.value.gpuParams);
      const graph = extractAnalyticFeatures('BasketWeave', packed, DIMS);
      const featureT = graph.lines
        .filter((line) => line.kind === 'horizontal-band')
        .map((line) => line.points[0].t);
      const fidelity = basketWeaveCreaseLoci(packed[0], packed[1], packed[9], packed[4]);

      expect(featureT).toEqual(fidelity.creaseT);
      expect(featureT).toHaveLength(expectedT.length);
      expectedT.forEach((expected, index) => {
        expect(featureT[index]).toBeCloseTo(expected, 7);
      });
    }
  });

  it('pins the ratio clamp and vertical-spacing expression in WGSL source', () => {
    const basketFunction = stylesWgsl.slice(
      stylesWgsl.indexOf('fn style_basket_weave'),
      stylesWgsl.indexOf('// #endregion', stylesWgsl.indexOf('fn style_basket_weave'))
    );
    expect(basketFunction).toContain('let ratio = max(style_param(4u), 0.01);');
    expect(basketFunction).toContain('let v = t * l_eff * ratio;');
    expect(basketFunction).not.toContain('Unused in basic weave');
  });
});

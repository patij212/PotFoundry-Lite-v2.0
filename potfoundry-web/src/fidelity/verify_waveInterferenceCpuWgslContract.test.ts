import { describe, expect, it } from 'vitest';
import stylesWgsl from '../assets/shaders/styles.wgsl?raw';
import { rOuterWaveInterference } from '../geometry/styles';
import type { StyleOptions } from '../geometry/types';
import { normalizeStylePayload } from '../styles/runtimeContract';

const TAU = 2 * Math.PI;
const TAU_F32 = Math.fround(TAU);
const WI_TAU_HI = Math.fround(6.28125);
const WI_TAU_LO = Math.fround(TAU - WI_TAU_HI);
const H = 64;
const R0 = 40;
const PARITY_BUDGET_MM = 0.0025;

const f32 = Math.fround;
const add = (a: number, b: number): number => f32(f32(a) + f32(b));
const sub = (a: number, b: number): number => f32(f32(a) - f32(b));
const mul = (a: number, b: number): number => f32(f32(a) * f32(b));
const div = (a: number, b: number): number => f32(f32(a) / f32(b));

function sinF32(value: number): number {
  return f32(Math.sin(f32(value)));
}

function cosF32(value: number): number {
  return f32(Math.cos(f32(value)));
}

function fmaF32(a: number, b: number, c: number): number {
  return f32(f32(a) * f32(b) + f32(c));
}

function reduceAngleF32(angle: number): number {
  const turns = f32(Math.floor(div(angle, TAU_F32) + 0.5));
  return sub(fmaF32(-turns, WI_TAU_HI, angle), mul(turns, WI_TAU_LO));
}

function multiplyIntegerAngleF32(angle: number, integerFrequency: number): number {
  const approximate = mul(angle, integerFrequency);
  const turns = f32(Math.floor(div(approximate, TAU_F32) + 0.5));
  return sub(fmaF32(angle, integerFrequency, mul(-turns, WI_TAU_HI)), mul(turns, WI_TAU_LO));
}

function cyclesToAngleF32(cycles: number): number {
  const wholeCycles = f32(Math.floor(f32(cycles) + 0.5));
  const fractionalCycles = sub(cycles, wholeCycles);
  return add(mul(fractionalCycles, WI_TAU_HI), mul(fractionalCycles, WI_TAU_LO));
}

/** Independent scalar emulation of styles.wgsl wi_compute_pattern + wrapper. */
function waveInterferenceWgslF32(theta: number, t: number, r0: number, p: Float32Array): number {
  const thetaF32 = f32(theta);
  const th = thetaF32 === TAU_F32 ? 0 : thetaF32;
  const tValue = f32(t);
  const baseFreqRaw = add(6, mul(p[0], 30));
  const baseFreq = f32(Math.floor(add(baseFreqRaw, 0.5)));
  const secOffset = sub(f32(Math.floor(add(mul(p[6], 4), 0.5))), 2);
  const secondaryFreq = add(baseFreq, secOffset);

  const warpFreq = f32(Math.floor(add(add(4, mul(8, p[8])), 0.5)));
  const warpMag = mul(p[7], 0.3);
  const warpArgument = reduceAngleF32(add(multiplyIntegerAngleF32(th, warpFreq), mul(tValue, 5)));
  const warp = mul(warpMag, sinF32(warpArgument));
  const warpedTheta = add(th, warp);
  const spiralV = mul(tValue, add(1, mul(p[5], 4)));

  const p1 = reduceAngleF32(
    add(multiplyIntegerAngleF32(warpedTheta, baseFreq), cyclesToAngleF32(add(spiralV, p[11])))
  );
  const p2Cycles = add(add(mul(spiralV, 1.1), p[11]), div(1.7, TAU_F32));
  const p2 = reduceAngleF32(
    add(multiplyIntegerAngleF32(warpedTheta, secondaryFreq), cyclesToAngleF32(p2Cycles))
  );
  const w1 = sinF32(p1);
  const w2 = sinF32(p2);
  const linear = mul(0.5, add(w1, w2));
  const product = mul(w1, w2);
  const rawPattern = add(mul(sub(1, p[3]), linear), mul(p[3], product));
  const styleArgument = reduceAngleF32(
    add(multiplyIntegerAngleF32(warpedTheta, 3), mul(tValue, 10))
  );
  const styleMod = mul(p[4], cosF32(styleArgument));
  const styledPattern = add(rawPattern, mul(styleMod, 0.2));

  let ridgeInput = add(0.5, mul(0.5, styledPattern));
  const detailFreq = f32(Math.floor(add(mul(baseFreq, 2.5), 0.5)));
  const detailArgument = reduceAngleF32(
    add(multiplyIntegerAngleF32(warpedTheta, detailFreq), mul(tValue, 20))
  );
  const detail = mul(mul(p[2], 0.15), sinF32(detailArgument));
  ridgeInput = add(ridgeInput, detail);
  const contrastExp = add(0.5, mul(p[9], 3));
  let ridge = f32(Math.pow(Math.max(0, Math.min(1, ridgeInput)), contrastExp));

  if (p[10] > f32(0.01)) {
    const distanceToEdge = Math.min(tValue, sub(1, tValue));
    const fadeZone = mul(p[10], 0.3);
    const fade =
      distanceToEdge < fadeZone ? f32(distanceToEdge / Math.max(f32(0.001), fadeZone)) : 1;
    ridge = mul(ridge, fade);
  }

  const displacement = mul(sub(ridge, 0.4), p[1]);
  return Math.max(f32(0.1), add(f32(r0), displacement));
}

function normalizedCase(wireOptions: Readonly<Record<string, number>>): {
  cpu: StyleOptions;
  gpu: Float32Array;
} {
  const normalized = normalizeStylePayload('WaveInterference', wireOptions);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) {
    throw new Error(normalized.errors.map((error) => error.message).join('; '));
  }
  return {
    cpu: normalized.value.cpuOptions as StyleOptions,
    gpu: Float32Array.from(normalized.value.gpuParams),
  };
}

function deterministicCases(): Array<Record<string, number>> {
  const cases: Array<Record<string, number>> = [
    {},
    {
      wi_feature_count: 3,
      wi_relief_depth: 10,
      wi_contour_density: 2,
      wi_moire_strength: 1.5,
      wi_pattern_style: 3,
      wi_helix_pitch: 3,
      wi_pitch_mismatch: 5,
      wi_domain_warp: 3,
      wi_warp_scale: 3,
      wi_ridge_contrast: 2,
      wi_edge_fade: 1,
      wi_phase: 1,
    },
    {
      wi_feature_count: 0.0166666667,
      wi_relief_depth: 9.7,
      wi_contour_density: 1.91,
      wi_moire_strength: 1.47,
      wi_pattern_style: 2.93,
      wi_helix_pitch: 2.89,
      wi_pitch_mismatch: 4.91,
      wi_domain_warp: 2.87,
      wi_warp_scale: 0.0625,
      wi_ridge_contrast: 1.93,
      wi_edge_fade: 0.01,
      wi_phase: 0.99,
    },
  ];

  let state = 0x5eed1234;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const ranges: Array<[string, number]> = [
    ['wi_feature_count', 3],
    ['wi_relief_depth', 10],
    ['wi_contour_density', 2],
    ['wi_moire_strength', 1.5],
    ['wi_pattern_style', 3],
    ['wi_helix_pitch', 3],
    ['wi_pitch_mismatch', 5],
    ['wi_domain_warp', 3],
    ['wi_warp_scale', 3],
    ['wi_ridge_contrast', 2],
    ['wi_edge_fade', 1],
    ['wi_phase', 1],
  ];
  for (let caseIndex = 0; caseIndex < 24; caseIndex += 1) {
    cases.push(Object.fromEntries(ranges.map(([key, maximum]) => [key, random() * maximum])));
  }
  return cases;
}

describe('WaveInterference CPU/WGSL semantic contract', () => {
  it('matches an independent binary32 WGSL emulation below the evaluator budget', () => {
    let maximumErrorMm = 0;
    let worstCase: Record<string, unknown> | undefined;
    for (const wireOptions of deterministicCases()) {
      const { cpu, gpu } = normalizedCase(wireOptions);
      for (let tIndex = 0; tIndex <= 20; tIndex += 1) {
        const t = f32(tIndex / 20);
        for (let thetaIndex = 0; thetaIndex < 64; thetaIndex += 1) {
          const theta = f32((TAU_F32 * (thetaIndex + 0.371)) / 64);
          const cpuRadius = rOuterWaveInterference(theta, t * H, R0, H, cpu);
          const gpuRadius = waveInterferenceWgslF32(theta, t, R0, gpu);
          const errorMm = Math.abs(cpuRadius - gpuRadius);
          if (errorMm > maximumErrorMm) {
            maximumErrorMm = errorMm;
            worstCase = { wireOptions, theta, t, cpuRadius, gpuRadius, errorMm };
          }
        }
      }
    }
    expect(maximumErrorMm, JSON.stringify(worstCase)).toBeLessThanOrEqual(PARITY_BUDGET_MM);
  });

  it('is periodic at the theta seam for valid parameter cases', () => {
    for (const wireOptions of deterministicCases()) {
      const { cpu } = normalizedCase(wireOptions);
      for (let tIndex = 0; tIndex <= 20; tIndex += 1) {
        const z = (tIndex / 20) * H;
        expect(rOuterWaveInterference(0, z, R0, H, cpu)).toBeCloseTo(
          rOuterWaveInterference(TAU, z, R0, H, cpu),
          9
        );
      }
    }
  });

  it('keeps every high-frequency trig input range-reduced and preserves seam semantics', () => {
    const helperStart = stylesWgsl.indexOf('fn wi_compute_pattern');
    const helperEnd = stylesWgsl.indexOf('fn wave_interference_radius', helperStart);
    const helper = stylesWgsl.slice(helperStart, helperEnd);
    const wrapper = stylesWgsl.slice(helperEnd, stylesWgsl.indexOf('// #endregion', helperEnd));

    expect(stylesWgsl).toContain('return fma(-turns, WI_TAU_HI, angle) - turns * WI_TAU_LO;');
    expect(stylesWgsl).toContain(
      'return fma(angle, integer_frequency, -turns * WI_TAU_HI) - turns * WI_TAU_LO;'
    );
    expect(helper).toContain('let warp_arg = wi_reduce_angle(');
    expect(helper).toContain('wi_mul_integer_angle(th, warp_freq) + t_val * 5.0');
    expect(helper).not.toContain('wi_mul_integer_angle(th, warp_freq) + phase');
    expect(helper).toContain('wi_mul_integer_angle(warped_theta, base_freq)');
    expect(helper).toContain('wi_cycles_to_angle(spiral_v + phase)');
    expect(helper).toContain('wi_mul_integer_angle(warped_theta, secondary_freq)');
    expect(helper).toContain('wi_cycles_to_angle(p2_cycles)');
    expect(helper).toContain('wi_mul_integer_angle(warped_theta, style_freq)');
    expect(helper).toContain('wi_mul_integer_angle(warped_theta, detail_freq)');
    expect(helper).not.toContain('sin(warped_theta *');
    expect(helper).not.toContain('cos(warped_theta *');
    expect(wrapper).toContain('let theta_periodic = select(theta, 0.0, theta == TAU);');
    expect(wrapper).toContain('wi_compute_pattern(theta_periodic, t, feature_count');
    expect(wrapper).not.toContain('wi_compute_pattern(-theta');
  });
});

// _gothicProbe.test.ts — AUDIT: is Gothic's stubborn ~1mm MAX-sag locus a TRUE r-jump (C0, needs a curtain) or a
// sharp-but-continuous crease (refineable)? Probe rA directly across the measured MAX locus (z≈37, θ≈2.20) at shrinking
// scales h. JUMP ⇒ |Δr| → const (jump height) as h→0 ⇒ |Δr|/h → ∞. CONTINUOUS ⇒ |Δr| → 0. Gated PF_GOTHIC_PROBE=1.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { STYLE_REGISTRY } from '../../src/styles/registry';

const RUN = process.env.PF_GOTHIC_PROBE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const group of [cfg?.params, cfg?.advancedParams]) {
    if (group === undefined) continue;
    for (const [k, v] of Object.entries(group)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

describe('gothic MAX-locus probe', () => {
  it.runIf(RUN)('classifies the locus: jump vs continuous crease', () => {
    const rA = buildRadiusFn('GothicArches' as StyleId, registryDefaults('GothicArches'), DIMS);
    const zc = Number(process.env.PF_PROBE_Z ?? 37);
    const thLo = Number(process.env.PF_PROBE_THLO ?? 2.0);
    const thHi = Number(process.env.PF_PROBE_THHI ?? 2.4);
    // 1) find the steepest θ at this z (finite-difference gradient scan)
    const N = 400000;
    let maxGrad = 0;
    let maxTh = 0;
    let prev = rA(thLo, zc);
    for (let i = 1; i <= N; i += 1) {
      const th = thLo + ((thHi - thLo) * i) / N;
      const r = rA(th, zc);
      const dth = (thHi - thLo) / N;
      const g = Math.abs(r - prev) / dth;
      if (g > maxGrad) {
        maxGrad = g;
        maxTh = th;
      }
      prev = r;
    }
    // 2) two-sided |Δr| across maxTh at shrinking h — the jump-vs-continuous discriminator
    const rows = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8].map((h) => {
      const dr = Math.abs(rA(maxTh + h, zc) - rA(maxTh - h, zc));
      return `  h=${h.toExponential(0)}  |Δr|=${(dr * 1000).toExponential(3)}µm  |Δr|/h=${(dr / h).toFixed(2)}`;
    });
    // 3) also scan z at the steepest θ to see the feature's z-extent
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `=== GOTHIC PROBE @ z=${zc} ===`,
        `steepest θ=${maxTh.toFixed(6)}  dr/dθ=${maxGrad.toFixed(1)} mm/rad`,
        `two-scale |Δr| across the steepest θ (JUMP ⇒ |Δr| flattens to the jump height; CONTINUOUS ⇒ keeps halving):`,
        ...rows,
        '===============================',
        '',
      ].join('\n')
    );
    expect(Number.isFinite(maxGrad)).toBe(true);
  }, 120_000);
});

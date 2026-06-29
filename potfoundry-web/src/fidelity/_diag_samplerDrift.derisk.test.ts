/**
 * T2 — sampler-vs-truth drift for SuperformulaBlossom.
 *
 * The mesher positions EVERY vertex via sampler.position(u,t). In production +
 * the build harness that sampler is the CPU `styleSampler`, a 512x512 PRE-EVALUATED
 * grid wrapped in GpuSurfaceSampler (BILINEAR interpolation). This test compares
 * that bilinear position against the TRUE analytic radius R(theta,z) on a dense
 * (u,t) grid, ESPECIALLY at the petal-edge cusps (peaks). If the bilinear sampler
 * chords across the sharp convex tips, position(u_peak, t) lands INSIDE the true
 * surface — exactly the user's "vertices not on the surface" report.
 *
 * Run: PF_DERISK=1 npx vitest run src/fidelity/_diag_samplerDrift.derisk.test.ts
 */
import { describe, it, expect } from 'vitest';
import { styleSampler, type StyleId } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';

const H = 120, R0 = 40;
const DIMS = { H, Rt: R0, Rb: R0, expn: 1 };

// Analytic truth port (rOuterSuperformulaBlossom, defaults).
const EPS = 1e-9;
const SF = { sfMBase: 6, sfMTop: 10, sfMCurveExp: 1.2, sfN1: 0.35, sfN1Top: 0.5, sfN2: 0.8, sfN2Top: 1.4, sfN3: 0.8, sfN3Top: 0.8, sfA: 1, sfB: 1 };
function sfv(theta: number, m: number, n1: number, n2: number, n3: number, a: number, b: number): number {
  const c = Math.pow(Math.abs(Math.cos((m * theta) / 4) / Math.max(a, EPS)), n2);
  const s = Math.pow(Math.abs(Math.sin((m * theta) / 4) / Math.max(b, EPS)), n3);
  const denom = Math.pow(c + s, 1 / Math.max(n1, EPS));
  if (denom <= EPS) return 0;
  return Math.min(1 / denom, 4);
}
function Rtrue(u: number, t: number): number {
  const theta = 2 * Math.PI * u;
  const m = SF.sfMBase + (SF.sfMTop - SF.sfMBase) * Math.pow(t, SF.sfMCurveExp);
  const n1 = SF.sfN1 + (SF.sfN1Top - SF.sfN1) * t;
  const n2 = SF.sfN2 + (SF.sfN2Top - SF.sfN2) * t;
  const n3 = SF.sfN3 + (SF.sfN3Top - SF.sfN3) * t;
  const seamOffset = Math.PI / Math.max(m, 1);
  return R0 * (0.9 + 0.35 * sfv(theta + seamOffset, m, n1, n2, n3, SF.sfA, SF.sfB));
}

function pct(a: number[], p: number): number { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

describe.skipIf(!process.env.PF_DERISK)('T2 SFB sampler-vs-analytic drift', () => {
  it('measures bilinear styleSampler radius vs analytic R at peaks/valleys/slopes', () => {
    const s = styleSampler('SuperformulaBlossom' as StyleId, { sf_strength: 1 }, DIMS);

    // Dense scan: for many t rows, find the analytic peaks (local R maxima in u),
    // then sample the bilinear sampler AT the exact peak u and report r_sampler - R_true.
    const Nu = 20000;
    const tRows = [0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9];
    const allDrift: number[] = [], peakDrift: number[] = [], valleyDrift: number[] = [], slopeDrift: number[] = [];
    let worstPeak = { u: 0, t: 0, rs: 0, R: 0, d: 0 };

    for (const t of tRows) {
      // classify each u-sample by local curvature of R(u); evaluate sampler radius there.
      let prev = Rtrue((Nu - 1) / Nu, t), cur = Rtrue(0, t), next: number;
      for (let i = 0; i < Nu; i++) {
        const u = i / Nu;
        next = Rtrue((i + 1) / Nu, t);
        const R = cur;
        const p = s.position(u, t);
        const rs = Math.hypot(p[0], p[1]);
        const d = rs - R; // negative => sampler inside true surface
        allDrift.push(Math.abs(d));
        const isPeak = cur > prev && cur >= next;
        const isValley = cur < prev && cur <= next;
        // "near peak" within a few samples — use second difference magnitude
        const curv = Math.abs(next - 2 * cur + prev) * Nu * Nu / (4 * Math.PI * Math.PI);
        if (isPeak || curv > 300) { peakDrift.push(Math.abs(d)); if (Math.abs(d) > Math.abs(worstPeak.d)) worstPeak = { u, t, rs, R, d }; }
        else if (isValley) valleyDrift.push(Math.abs(d));
        else slopeDrift.push(Math.abs(d));
        prev = cur; cur = next;
      }
    }

    const grid = s.gridResolution?.();
    // eslint-disable-next-line no-console
    console.log(`[T2] styleSampler grid = ${grid?.resU}x${grid?.resT} (bilinear)`);
    // eslint-disable-next-line no-console
    console.log(`[T2] |r_sampler - R_true| (mm):`);
    const stat = (n: string, a: number[]): void => {
      if (!a.length) { /* eslint-disable-next-line no-console */ console.log(`  ${n}: empty`); return; }
      const mean = a.reduce((x, y) => x + y, 0) / a.length;
      // eslint-disable-next-line no-console
      console.log(`  ${n}: n=${a.length} mean=${mean.toFixed(4)} p50=${pct(a, 0.5).toFixed(4)} p90=${pct(a, 0.9).toFixed(4)} p99=${pct(a, 0.99).toFixed(4)} max=${pct(a, 1).toFixed(3)}`);
    };
    stat('ALL          ', allDrift);
    stat('PEAK-region  ', peakDrift);
    stat('VALLEY       ', valleyDrift);
    stat('SLOPE        ', slopeDrift);
    // eslint-disable-next-line no-console
    console.log(`[T2] worst PEAK: u=${worstPeak.u.toFixed(5)} t=${worstPeak.t} r_sampler=${worstPeak.rs.toFixed(3)} R_true=${worstPeak.R.toFixed(3)} drift=${worstPeak.d.toFixed(3)}mm (neg=inside)`);

    // Also: cross-check that a mid-cell sample at a peak is worse than at a grid node.
    // grid node u = round(u*resU)/resU lands ON the evaluated grid → near-zero drift.
    const resU = grid?.resU ?? 512;
    // pick the worst peak's t, find its peak u, sample at node vs mid-cell
    const tp = worstPeak.t, up = worstPeak.u;
    const node = Math.round(up * resU) / resU;
    const pn = s.position(node, tp); const rn = Math.hypot(pn[0], pn[1]);
    // eslint-disable-next-line no-console
    console.log(`[T2] at peak t=${tp}: nearest GRID-NODE u=${node.toFixed(5)} r_sampler=${rn.toFixed(3)} vs R_true(node)=${Rtrue(node, tp).toFixed(3)} drift=${(rn - Rtrue(node, tp)).toFixed(4)}mm  (node should be ~0 ⇒ proves bilinear chord, not formula drift)`);

    expect(allDrift.length).toBeGreaterThan(0);
  }, 120000);
});

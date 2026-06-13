/**
 * verify_snapPeakMiss.test.ts — confirm the worst surface-fidelity error is the
 * SNAP displacing the cusp crest edge off the true peak.
 *
 * verify_worstTriangle found the worst chord triangle (3.39mm) sits 0.164mm
 * laterally from the crest locus — exactly the Stage-2b snap floor (0.1586mm).
 * Hypothesis: the inserted crest vertex is snapped ~0.16mm off the analytic peak;
 * on the near-vertical cusp wall of the outermost petal that lateral miss becomes
 * a multi-mm RADIAL miss of the peak, so the flat triangle is mm below the true
 * crest. This measures the 3D peak-miss vs lateral snap displacement at the worst
 * crest (outer petal, high t) and a benign mid crest for contrast.
 *
 * If the peak-miss at ~0.16mm lateral matches the 3.4mm worst chord, the snap (not
 * density, not the sampler) is the worst-case fidelity driver => fix = EXACT crest
 * placement (no snap), the blueprint Stage-4 along-crest slide.
 *
 * Pure CPU, read-only, no production change.
 */
import { describe, it, expect } from 'vitest';
import { sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const surf = new SfbWallSampler(p);
type V3 = readonly [number, number, number];
const Pp = (u: number, t: number): V3 => surf.position(u, t);
function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}
/** Crest u at height t nearest a target u (the analytic peak locus). */
function crestNear(t: number, uTarget: number): number {
  const m = mOf(t);
  let best = 0.5, bd = 9;
  for (let j = 1; (2 * j - 1) / (2 * m) < 1; j++) { const u = (2 * j - 1) / (2 * m); if (Math.abs(u - uTarget) < bd) { bd = Math.abs(u - uTarget); best = u; } }
  return best;
}

describe('VERIFY snap peak-miss is the worst-case surface-fidelity driver', () => {
  it('measures 3D peak-miss vs lateral snap at the worst crest vs a mid crest', () => {
    const circ = 2 * Math.PI * 75; // mm per unit u (approx, r~75)
    const cases = [
      { name: 'WORST  (outer petal, t=0.949, u~0.974)', t: 0.949, uTarget: 0.974 },
      { name: 'MID    (t=0.250, u~0.518)            ', t: 0.250, uTarget: 0.518 },
    ];
    /* eslint-disable no-console */
    console.log('\n===== SNAP PEAK-MISS: 3D distance from the true peak vs lateral snap =====');
    for (const c of cases) {
      const uc = crestNear(c.t, c.uTarget);
      const peak = Pp(uc, c.t);
      const peakR = Math.hypot(peak[0], peak[1]);
      const row: string[] = [];
      for (const latMm of [0.05, 0.10, 0.16, 0.25]) {
        const du = latMm / circ;
        const off = Pp(uc + du, c.t); // snapped off-peak along u
        const miss3D = Math.hypot(off[0] - peak[0], off[1] - peak[1], off[2] - peak[2]);
        row.push(`lat ${latMm}mm->miss ${miss3D.toFixed(3)}mm`);
      }
      console.log(`  ${c.name} crest u=${uc.toFixed(4)} peakR=${peakR.toFixed(2)}mm rf=${sfRf(uc, c.t, p).toFixed(3)}`);
      console.log(`     ${row.join('  |  ')}`);
    }
    console.log('  => if WORST lat~0.16mm -> miss ~3.4mm, the snap (not density/sampler) is the worst-case driver.');
    console.log('=========================================================================\n');
    /* eslint-enable no-console */
    expect(cases.length).toBe(2);
  });
});

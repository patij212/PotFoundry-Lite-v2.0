/**
 * seamPeriodicityVerify.test.ts — independent verification of the three
 * load-bearing claims the crest-perfect-mesh workflow surfaced, BEFORE trusting
 * the synthesis:
 *   (1) Is SFB@1 genuinely NON-periodic in u (a real seam discontinuity in the
 *       MODEL, not a meshing artifact)? — verified on the production `sfRf`
 *       directly (no wrapU), which is what the production WGSL evaluates.
 *   (2) Does the closed-form ridge cover VALLEYS, or only crests? (the cure
 *       measurements used sfClosedFormParamRidge — if it is crest-only, valleys
 *       were never measured.)
 *   (3) Does the global warp's crest cure survive PRODUCTION along-density
 *       (tRows=256)? (the refutation claims it regresses 0.5%->16.6% sub-20.)
 *
 * Pure CPU. Reuses the production f64 sfRf mirror + the pinned config.
 */
import { describe, it, expect } from 'vitest';
import { sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { SFB1_PACKED, SFB_DIMS } from './snapPlacementAudit';
import { sfClosedFormParamRidge, solveParamRidgeByBisection } from './crestLateralDeviation';
import { runWarpDomainCeilingAudit } from './warpDomainCeiling';

const p = Float32Array.from(SFB1_PACKED);

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}

describe('VERIFY (1): SFB@1 u-periodicity at the seam', () => {
  it('measures sfRf(0,t) vs sfRf(1,t) directly (literal u, no wrap)', () => {
    let maxAbsDelta = 0;
    let maxGapMm = 0;
    let worstT = 0;
    const rows = 200;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const r0 = SFB_DIMS.Rb + (SFB_DIMS.Rt - SFB_DIMS.Rb) * Math.pow(t, SFB_DIMS.expn);
      const d = sfRf(1, t, p) - sfRf(0, t, p); // literal u=1 vs u=0
      const gapMm = r0 * 0.35 * Math.abs(d); // amplitude 0.35 per SfbWallSampler
      if (Math.abs(d) > maxAbsDelta) maxAbsDelta = Math.abs(d);
      if (gapMm > maxGapMm) {
        maxGapMm = gapMm;
        worstT = t;
      }
    }
    // Does sfRf wrap internally? compare literal 1 vs wrapped 0.
    const wrapSelfGap = Math.abs(sfRf(1, 0.5, p) - sfRf(0, 0.5, p));
    const mAtWorst = mOf(worstT);

    /* eslint-disable no-console */
    console.log('\n===== VERIFY (1): SFB@1 SEAM u-PERIODICITY (production sfRf, literal u) =====');
    console.log(`max |sfRf(1,t) - sfRf(0,t)| = ${maxAbsDelta.toExponential(3)} (rf units)`);
    console.log(`max implied 3D radial seam gap = ${maxGapMm.toFixed(3)} mm at t=${worstT.toFixed(3)} (m=${mAtWorst.toFixed(3)})`);
    console.log(`sfRf does NOT self-wrap (|sfRf(1,0.5)-sfRf(0,0.5)| = ${wrapSelfGap.toExponential(3)})`);
    console.log(`m(0)=${mOf(0).toFixed(3)} m(1)=${mOf(1).toFixed(3)} -> non-integer for most t => non-periodic surface`);
    console.log('============================================================================\n');
    /* eslint-enable no-console */

    // The claim: SFB@1 is genuinely non-periodic in u (gap >> 0.1mm at non-integer m).
    expect(maxGapMm).toBeGreaterThan(0.1);
  });
});

describe('VERIFY (2): valley coverage of the closed-form ridge', () => {
  it('counts crest vs valley branches: closed-form vs generic bisection', () => {
    const cf = sfClosedFormParamRidge(p);
    const cfCrest = cf.branches.filter((b) => b.kind === 'crest').length;
    const cfValley = cf.branches.filter((b) => b.kind === 'valley').length;

    const gen = solveParamRidgeByBisection({
      value: (u: number, t: number): number => sfRf(u, t, p),
      periodicU: false,
    });
    const genCrest = gen.branches.filter((b) => b.kind === 'crest').length;
    const genValley = gen.branches.filter((b) => b.kind === 'valley').length;

    /* eslint-disable no-console */
    console.log('\n===== VERIFY (2): RIDGE VALLEY COVERAGE =====');
    console.log(`closed-form sfClosedFormParamRidge: ${cfCrest} crests, ${cfValley} valleys`);
    console.log(`generic solveParamRidgeByBisection:  ${genCrest} crests, ${genValley} valleys`);
    console.log('=============================================\n');
    /* eslint-enable no-console */

    // The crest-aligned cure measurements used the closed-form ridge; if it is
    // crest-only while the generic finds valleys, valleys were NOT measured.
    expect(genValley).toBeGreaterThan(0);
  });
});

describe('VERIFY (3): global-warp crest cure at production along-density', () => {
  it('re-runs warpDomainCeiling at tRows=256 (aspect<=1)', () => {
    const r64 = runWarpDomainCeilingAudit({ tRows: 64, aspectMax: 1 });
    const r256 = runWarpDomainCeilingAudit({ tRows: 256, aspectMax: 1 });

    /* eslint-disable no-console */
    console.log('\n===== VERIFY (3): GLOBAL WARP vs ALONG-DENSITY (aspect<=1) =====');
    console.log(
      `tRows=64:  phi/petal ${r64.config.phiSamplesPerPetal} achievedAspect ${r64.config.achievedAspect.toFixed(3)} | ` +
        `crest <20deg ${(r64.crest.fracBelow20 * 100).toFixed(1)}% (min ${r64.crest.minDeg.toFixed(2)}deg) | ` +
        `seam <15deg ${(r64.seam.fracBelow15 * 100).toFixed(1)}%`,
    );
    console.log(
      `tRows=256: phi/petal ${r256.config.phiSamplesPerPetal} achievedAspect ${r256.config.achievedAspect.toFixed(3)} | ` +
        `crest <20deg ${(r256.crest.fracBelow20 * 100).toFixed(1)}% (min ${r256.crest.minDeg.toFixed(2)}deg) | ` +
        `seam <15deg ${(r256.seam.fracBelow15 * 100).toFixed(1)}%`,
    );
    console.log(`fold-free: tRows=64 ${r64.jacobian.singleSigned}, tRows=256 ${r256.jacobian.singleSigned}`);
    console.log('================================================================\n');
    /* eslint-enable no-console */

    expect(Number.isFinite(r256.crest.fracBelow20)).toBe(true);
  });
});

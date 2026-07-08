/**
 * _junctionProbe.test.ts — DEV-ONLY follow-up probe (E-2026-07-08-TIERC-JUNCTION).
 *
 * The diagnostic showed the protected complex covers only t∈[0.12,0.18] ∪
 * [0.48,0.57] ∪ [0.96,0.99]; the worst multi-bay outliers sit at t≈0.40–0.49
 * (a DEAD zone) on amp>1mm relief. This probe answers the FIX-splitting
 * question: at those worst-outlier (u,t) sites, is the radius profile a SHARP
 * ridge (crease → detector recall gap, fix = protect it) or SMOOTH curvature
 * (→ density, the loop should reduce it)? Reports, per site, the local radius
 * profile across u and t and a discrete second-difference "sharpness".
 *
 * Also: probe the WGSL/CPU Gothic radius directly across the full t at the
 * worst-outlier u to SEE the rib structure the detector should have caught.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { detectFeatures } from '../featureGraph/detectFeatures';
import { TIER_C_DETECT_OPTS } from './detectOpts';

const RUN = process.env.PF_TIERC_JUNCTION === '1';
const OUT = 'research/exchange/_tierc_junction';

describe('Tier-C junction fix-split probe', () => {
  it.skipIf(!RUN)('rib sharpness at the dead-zone outliers', () => {
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 });
    const rAt = (u: number, t: number): number => {
      const [x, y] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
      return Math.hypot(x, y);
    };

    // Worst outlier sites (from run1/outliers.ndjson).
    const sites: Array<[number, number, number]> = [
      [0.0586, 0.4931, 0.677],
      [0.0608, 0.4771, 0.477],
      [0.0579, 0.4374, 0.456],
      [0.0612, 0.4054, 0.449],
      [0.0585, 0.4839, 0.444],
    ];

    const report: Record<string, unknown> = {};
    // u-profile across a rib: sample r(u) at fixed t over ±0.02 in u.
    for (const [u0, t0, dev] of sites) {
      const N = 41;
      const spanU = 0.02;
      const rowU: number[] = [];
      for (let i = 0; i < N; i++) {
        const u = u0 - spanU + (2 * spanU * i) / (N - 1);
        rowU.push(rAt(u, t0));
      }
      const spanT = 0.04;
      const rowT: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = t0 - spanT + (2 * spanT * i) / (N - 1);
        rowT.push(rAt(u0, t));
      }
      // Discrete curvature (2nd diff) magnitude, peak over the window.
      const d2 = (a: number[]): number => {
        let m = 0;
        for (let i = 1; i < a.length - 1; i++) {
          const v = Math.abs(a[i + 1] - 2 * a[i] + a[i - 1]);
          if (v > m) m = v;
        }
        return m;
      };
      report[`site_u${u0}_t${t0}`] = {
        dev,
        rMin: Math.min(...rowU, ...rowT),
        rMax: Math.max(...rowU, ...rowT),
        ampU: Math.max(...rowU) - Math.min(...rowU),
        ampT: Math.max(...rowT) - Math.min(...rowT),
        peakD2_u: d2(rowU),
        peakD2_t: d2(rowT),
        rowU: rowU.map((r) => +r.toFixed(3)),
        rowT: rowT.map((r) => +r.toFixed(3)),
      };
    }

    // Detector coverage: run the SAME detector and report, per detected feature
    // EDGE, its t-extent + type + strength. Does ANY ridge chain enter the dead
    // zone t∈[0.38,0.48]? How many detected samples land there?
    const graph = detectFeatures(sampler, TIER_C_DETECT_OPTS);
    let edgesInDeadZone = 0;
    let samplesInDeadZone = 0;
    let totalSamples = 0;
    const edgeInfo: Array<{ tLo: number; tHi: number; type: string; str: number; n: number }> = [];
    // Per-0.02 t-bin count of DETECTED samples across ALL edges (the coverage map).
    const tbin: Record<string, number> = {};
    for (const e of graph.edges) {
      let lo = 1;
      let hi = 0;
      for (const p of e.polyline) {
        if (p.t < lo) lo = p.t;
        if (p.t > hi) hi = p.t;
        totalSamples++;
        const b = (Math.floor(p.t * 50) / 50).toFixed(2);
        tbin[b] = (tbin[b] || 0) + 1;
        if (p.t >= 0.38 && p.t <= 0.48) samplesInDeadZone++;
      }
      edgeInfo.push({
        tLo: +lo.toFixed(3),
        tHi: +hi.toFixed(3),
        type: e.types.join('+'),
        str: +e.strength.toFixed(2),
        n: e.polyline.length,
      });
      if (lo <= 0.48 && hi >= 0.38) edgesInDeadZone++;
    }
    report.detector = {
      totalEdges: graph.edges.length,
      totalSamples,
      edgesEnteringDeadZone_t038_048: edgesInDeadZone,
      samplesInDeadZone_t038_048: samplesInDeadZone,
      tbin_detected_samples: tbin,
      edges: edgeInfo,
    };

    // ── THRESHOLD SWEEP (cheap detector-only screen for the fix lever) ──
    // Which relaxation recovers mid-wall (dead-zone) recall WITHOUT exploding
    // the chain count (over-detection → planarizer chaos)? Report per config:
    // total detected samples, samples in the dead zone t∈[0.38,0.48], and the
    // per-band t coverage in the multi-bay domain t∈[0.38,0.62].
    const sweep: Array<Record<string, unknown>> = [];
    const configs: Array<{ tag: string; opts: Record<string, unknown> }> = [
      { tag: 'baseline', opts: { ...TIER_C_DETECT_OPTS } },
      { tag: 'minStr0.5', opts: { ...TIER_C_DETECT_OPTS, minStrength: 0.5 } },
      { tag: 'minStr0.25', opts: { ...TIER_C_DETECT_OPTS, minStrength: 0.25 } },
      { tag: 'minStr0.1', opts: { ...TIER_C_DETECT_OPTS, minStrength: 0.1 } },
      { tag: 'ang18', opts: { ...TIER_C_DETECT_OPTS, minAngleDeg: 18 } },
      { tag: 'ang12', opts: { ...TIER_C_DETECT_OPTS, minAngleDeg: 12 } },
      { tag: 'minStr0.25+ang18', opts: { ...TIER_C_DETECT_OPTS, minStrength: 0.25, minAngleDeg: 18 } },
      { tag: 'minStr0.25+fine180', opts: { ...TIER_C_DETECT_OPTS, minStrength: 0.25, fineRes: 180 } },
      { tag: 'minStr0.1+ang12', opts: { ...TIER_C_DETECT_OPTS, minStrength: 0.1, minAngleDeg: 12 } },
    ];
    for (const cfg of configs) {
      const g = detectFeatures(sampler, cfg.opts as never);
      let dz = 0;
      let tot = 0;
      const bands: Record<string, number> = { '0.38-0.44': 0, '0.44-0.50': 0, '0.50-0.56': 0, '0.56-0.62': 0 };
      for (const e of g.edges) {
        for (const p of e.polyline) {
          tot++;
          if (p.t >= 0.38 && p.t <= 0.48) dz++;
          if (p.t >= 0.38 && p.t < 0.44) bands['0.38-0.44']++;
          else if (p.t >= 0.44 && p.t < 0.5) bands['0.44-0.50']++;
          else if (p.t >= 0.5 && p.t < 0.56) bands['0.50-0.56']++;
          else if (p.t >= 0.56 && p.t <= 0.62) bands['0.56-0.62']++;
        }
      }
      sweep.push({ tag: cfg.tag, edges: g.edges.length, totalSamples: tot, deadZoneSamples: dz, bands });
    }
    report.sweep = sweep;

    writeFileSync(`${OUT}/fix_probe.json`, JSON.stringify(report, null, 2));
    // eslint-disable-next-line no-console
    console.log('[fix-probe]', JSON.stringify(report, null, 2));
    expect(sites.length).toBeGreaterThan(0);
  }, 5 * 60 * 1000);
});

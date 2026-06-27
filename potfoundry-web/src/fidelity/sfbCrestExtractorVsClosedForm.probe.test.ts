// PROBE (PF_DERISK) — is the SFB@1 ridge WOBBLE (0.71mm RMS, diagnoseCrestLateralDeviation)
// caused by the production crest EXTRACTOR (marching-squares 768x320 + Douglas-Peucker
// simplify 3e-4) being coarse / off the true ridge? Compares the INSERTED crest line
// (extractAnalyticFeatures, the production path) against the CLOSED-FORM true ridge
// (sfClosedFormParamRidge — the metric's own truth, u*=(2j-1)/(2m(t)), reference err ~0).
// Pure CPU, no GPU. If the extracted crest is coarse / off-locus by ~the wobble, densify/
// closed-form is the cheap fix; if it already matches, the wobble is downstream (mesh).
import { describe, it } from 'vitest';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { sfClosedFormParamRidge } from './crestLateralDeviation';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildStyleParamPayload } from '../utils/styleParams';

const TAU = 2 * Math.PI;
const DIMS = { H: 120, Rt: 40, Rb: 40, expn: 1 };

describe.skipIf(!process.env.PF_DERISK)('SFB crest extractor vs closed-form ridge', () => {
  it('measures inserted-crest density + lateral deviation from the closed-form ridge', () => {
    const [, packedArr] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const packed = Float32Array.from(packedArr);
    const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, DIMS);

    // Production inserted crest lines (general-curves), the EXACT path the export uses.
    const graph = extractAnalyticFeatures(
      'SuperformulaBlossom', packed, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
      { surfaceFidelityExact: true },
    );
    const extracted = graph.lines.filter((l) => l.kind === 'general-curve');

    // Closed-form true ridge branches (the metric's truth).
    const ridge = sfClosedFormParamRidge(packed, { tSamples: 769 });

    const rAt = (u: number, t: number): number => { const [x, y] = sampler.position(u, t); return Math.hypot(x, y); };
    const uWrapDist = (a: number, b: number): number => { let d = Math.abs(a - b) % 1; if (d > 0.5) d = 1 - d; return d; };
    // Interpolate u at t along an ordered (u,t) polyline; null if t out of range.
    const lineUAt = (pts: Array<{ u: number; t: number }>, t: number): number | null => {
      const a = pts[0].t, b = pts[pts.length - 1].t;
      const loT = Math.min(a, b), hiT = Math.max(a, b);
      if (t < loT - 1e-6 || t > hiT + 1e-6) return null;
      let lo = 0, hi = pts.length - 1;
      // pts may be ascending or descending in t — binary search on a monotone copy.
      const asc = b >= a;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; const tm = pts[mid].t; if (asc ? tm <= t : tm >= t) lo = mid; else hi = mid; }
      const w = (t - pts[lo].t) / (pts[hi].t - pts[lo].t || 1e-12);
      return pts[lo].u + (pts[hi].u - pts[lo].u) * w;
    };

    // CREST-ONLY deviation: for each closed-form CREST branch, find the extracted line
    // that best follows it (min median |Δu| over the overlap), then report THAT line's
    // lateral mm deviation (mm ≈ Δu·2π·r). Valleys never best-match a crest ⇒ excluded.
    let worstBranchMaxMm = 0, worstBranchRmsMm = 0, worstLabel = '';
    for (const br of ridge.branches) {
      if (br.kind !== 'crest') continue;
      const tLo = br.points[0].t, tHi = br.points[br.points.length - 1].t;
      const samples: number[] = [];
      for (let i = 0; i <= 50; i++) samples.push(tLo + ((tHi - tLo) * i) / 50);
      let bestLine: typeof extracted[number] | null = null, bestMed = Infinity;
      for (const line of extracted) {
        const ds: number[] = [];
        for (const t of samples) {
          const ue = lineUAt(line.points, t); const ut = lineUAt(br.points, t);
          if (ue === null || ut === null) continue;
          ds.push(uWrapDist(ue, ut));
        }
        if (ds.length < samples.length * 0.5) continue;
        ds.sort((x, y) => x - y); const med = ds[ds.length >> 1];
        if (med < bestMed) { bestMed = med; bestLine = line; }
      }
      if (!bestLine) continue;
      let mx = 0, ss = 0, n2 = 0;
      for (const t of samples) {
        const ue = lineUAt(bestLine.points, t); const ut = lineUAt(br.points, t);
        if (ue === null || ut === null) continue;
        const mm = uWrapDist(ue, ut) * TAU * rAt(ut, t);
        if (mm > mx) mx = mm; ss += mm * mm; n2++;
      }
      const rms = n2 > 0 ? Math.sqrt(ss / n2) : 0;
      if (mx > worstBranchMaxMm) { worstBranchMaxMm = mx; worstLabel = br.label ?? ''; }
      if (rms > worstBranchRmsMm) worstBranchRmsMm = rms;
    }
    const maxMm = worstBranchMaxMm, rmsMm = worstBranchRmsMm;

    // Inserted-line DENSITY: points per crest, and worst chord-cut between consecutive
    // points (the mesh can only follow the ridge as well as this polyline does).
    let minPts = Infinity, maxPts = 0, totalPts = 0, worstChordMm = 0;
    for (const line of extracted) {
      const k = line.points.length;
      minPts = Math.min(minPts, k); maxPts = Math.max(maxPts, k); totalPts += k;
      for (let i = 0; i + 1 < k; i++) {
        const a = line.points[i], b = line.points[i + 1];
        // 3D chord vs the true ridge midpoint: sag of the straight inserted edge.
        const pa = sampler.position(a.u, a.t), pb = sampler.position(b.u, b.t);
        const tm = (a.t + b.t) / 2;
        let uMidTrue = null as number | null, bestd = Infinity;
        for (const br of ridge.branches) { if (br.kind !== 'crest') continue; const ut = lineUAt(br.points, tm); if (ut === null) continue; const d = uWrapDist((a.u + b.u) / 2, ut); if (d < bestd) { bestd = d; uMidTrue = ut; } }
        if (uMidTrue === null) continue;
        const pt = sampler.position(uMidTrue, tm);
        const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, mz = (pa[2] + pb[2]) / 2;
        const sag = Math.hypot(pt[0] - mx, pt[1] - my, pt[2] - mz);
        if (sag > worstChordMm) worstChordMm = sag;
      }
    }
    const closedPts = ridge.branches.map((b) => b.points.length);
    /* eslint-disable no-console */
    console.log(
      `[SFB CREST] extracted lines=${extracted.length} pts/line[min=${minPts} max=${maxPts} avg=${(totalPts / Math.max(1, extracted.length)).toFixed(0)}]`,
    );
    console.log(`  worst-crest inserted-vs-closedform lateral: max=${maxMm.toFixed(3)}mm rms=${rmsMm.toFixed(3)}mm (${worstLabel})`);
    console.log(`  inserted-edge chord-sag vs true ridge: worst=${worstChordMm.toFixed(3)}mm`);
    console.log(`  closed-form branches=${ridge.branches.length} pts each≈${closedPts.slice(0, 6).join(',')}… refErr~0`);
    /* eslint-enable no-console */
  }, 120000);
});

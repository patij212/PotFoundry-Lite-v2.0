// _crestLociDetect.test.ts — DEV-ONLY (env PF_CRESTDET=1). HOTSPOT DIAGNOSIS for E-2026-07-01-CRESTAWARE step 2:
// does denseFeatureGroundTruth even DETECT the (0.5,0.54) horizontal arch feature as a locus? And how densely does
// it cover the BULK-residual crest region (fracU 0.35/0.65)? Samples the truth loci, bins them by (u,t), and reports
// the nearest locus point to (0.5,0.54) + the loci density in a window around it vs a reference detected-crest
// window. No mesh build — pure detection probe (cheap, ~seconds).
import { describe, it, expect } from 'vitest';
import { buildFeatureTruth } from './featureLocalizedFidelity';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;

function nearestLocus(
  lines: Array<{ points: Array<{ u: number; t: number }>; label?: string }>,
  u0: number, t0: number, uToMm: number, tToMm: number,
): { distMm: number; u: number; t: number; label: string } {
  let best = { distMm: Infinity, u: -1, t: -1, label: '' };
  for (const line of lines) {
    for (const p of line.points) {
      let du = p.u - u0; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
      const dt = p.t - t0;
      const dMm = Math.hypot(du * uToMm, dt * tToMm);
      if (dMm < best.distMm) best = { distMm: dMm, u: p.u, t: p.t, label: String(line.label ?? '') };
    }
  }
  return best;
}

// count locus SAMPLE points whose (u,t) lands in a ±windowMm box around (u0,t0).
function lociInWindow(
  lines: Array<{ points: Array<{ u: number; t: number }>; label?: string }>,
  u0: number, t0: number, windowMm: number, uToMm: number, tToMm: number,
): { count: number; byLabel: Record<string, number> } {
  let count = 0; const byLabel: Record<string, number> = {};
  const uw = windowMm / uToMm, tw = windowMm / tToMm;
  for (const line of lines) {
    for (const p of line.points) {
      let du = p.u - u0; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
      if (Math.abs(du) <= uw && Math.abs(p.t - t0) <= tw) {
        count++; const l = String(line.label ?? ''); byLabel[l] = (byLabel[l] ?? 0) + 1;
      }
    }
  }
  return { count, byLabel };
}

describe('crest loci detection near the hotspot', () => {
  it.skipIf(process.env.PF_CRESTDET !== '1')('is (0.5,0.54) detected + bulk crest coverage', () => {
    const truth = buildFeatureTruth('GothicArches' as StyleId, {}, DIMS, TRUTH_RES);
    const uToMm = truth.uToMm, tToMm = truth.tToMm;
    const lines = truth.lines;
    // label histogram
    const labelHist: Record<string, number> = {};
    let totalPts = 0;
    for (const l of lines) { const k = String(l.label ?? ''); labelHist[k] = (labelHist[k] ?? 0) + 1; totalPts += l.points.length; }
    // eslint-disable-next-line no-console
    console.log(`loci: ${lines.length} lines, ${totalPts} points, uToMm=${uToMm.toFixed(2)} labels=${JSON.stringify(labelHist)}`);

    const cellMm = Math.min(uToMm / TRUTH_RES, tToMm / TRUTH_RES); // one truth cell in mm (detection resolution)
    // eslint-disable-next-line no-console
    console.log(`truth cell ~ ${cellMm.toFixed(4)}mm (u) / ${(tToMm / TRUTH_RES).toFixed(4)}mm (t)`);

    // 1) HOTSPOT
    const hs = nearestLocus(lines, 0.50, 0.54, uToMm, tToMm);
    // eslint-disable-next-line no-console
    console.log(`HOTSPOT(0.50,0.54): nearest locus @ (${hs.u.toFixed(4)},${hs.t.toFixed(4)}) label=${hs.label} dist=${hs.distMm.toFixed(4)}mm`);
    const hsWin = lociInWindow(lines, 0.50, 0.54, 1.0, uToMm, tToMm);
    // eslint-disable-next-line no-console
    console.log(`  loci within 1mm of hotspot: ${hsWin.count} ${JSON.stringify(hsWin.byLabel)}`);
    const hsWinTight = lociInWindow(lines, 0.50, 0.54, 0.3, uToMm, tToMm);
    // eslint-disable-next-line no-console
    console.log(`  loci within 0.3mm of hotspot: ${hsWinTight.count} ${JSON.stringify(hsWinTight.byLabel)}`);

    // 2) BULK-residual reference crests (fracU 0.35/0.65 — the aliased-but-detected ridges)
    for (const [u0, t0, name] of [[0.35, 0.30, 'ref(0.35,0.30)'], [0.65, 0.70, 'ref(0.65,0.70)'], [0.20, 0.50, 'ref(0.20,0.50)']] as Array<[number, number, string]>) {
      const r = nearestLocus(lines, u0, t0, uToMm, tToMm);
      const w = lociInWindow(lines, u0, t0, 1.0, uToMm, tToMm);
      // eslint-disable-next-line no-console
      console.log(`${name}: nearest @ (${r.u.toFixed(4)},${r.t.toFixed(4)}) label=${r.label} dist=${r.distMm.toFixed(4)}mm | loci within 1mm: ${w.count}`);
    }
    expect(lines.length).toBeGreaterThan(0);
  }, 5 * 60 * 1000);
});

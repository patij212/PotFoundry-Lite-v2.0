/* eslint-disable no-console */
// _pfBambooSagLaw1D.test.ts — DEV-ONLY (autonomous session 2026-07-23 evening).
// CONFIRM the MAX-vs-p99 sag-law bug in buildBambooTSchedule PURELY IN 1D (no mesh/GPU/projector — milliseconds).
// The body walk samples r''(z) NODALLY at the current row then steps Δt=sqrt(8·tol/|r''|); a node-bulge peak BETWEEN
// rows is strided over → that quad's chord busts tol (the 0.72 MAX) while p99 stays tiny. Here we measure the TRUE
// chord-sag of the θ=0 profile r(0,z) across every consecutive BODY-row interval (tread pairs excluded) and report the
// worst. If sag=0.05 → worst≈0.7 and sag=0.004 → worst≤~0.005, the nodal walk is the confirmed mechanism.
// ALSO tests the FIX (verify-and-bisect the step against the true chord) → worst must be ≤ tol at EVERY tol.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfBambooSagLaw1D.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildBambooTSchedule } from '../../src/renderers/webgpu/parametric/conforming/tierC';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const NODE_COUNT = 5;

// True chord-sag (mm) of the θ=0 profile r(z) across a t-interval [tA,tB]: max perpendicular-ish deviation of r(z)
// from the straight chord joining the two endpoints, sampled densely. (1D radial proxy — the mesh quad's real sag is
// bounded by this since u-columns share these t-rows.)
function chordSag(rP: (z: number) => number, H: number, tA: number, tB: number): number {
  const zA = tA * H, zB = tB * H, rAe = rP(zA), rBe = rP(zB);
  let worst = 0;
  const N = 200;
  for (let i = 1; i < N; i++) {
    const f = i / N, z = zA + (zB - zA) * f;
    const chord = rAe + (rBe - rAe) * f;
    worst = Math.max(worst, Math.abs(rP(z) - chord));
  }
  return worst;
}

describe('BambooSegments body sag-law — 1D MAX-vs-p99 confirmation', () => {
  it('worst body-interval chord-sag vs the requested tol (nodal walk under-bounds MAX)', () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const rP = (z: number): number => rA(0, Math.max(0, Math.min(DIMS.H, z)));
    const edges: number[] = [];
    for (let k = 1; k < NODE_COUNT; k++) edges.push(k / NODE_COUNT);
    const crossesStep = (a: number, b: number): boolean => edges.some((e) => a < e - 1e-6 && b > e + 1e-6);

    for (const tol of [0.1, 0.05, 0.01, 0.004]) {
      const rows = buildBambooTSchedule(DIMS.H, rA, { sagTolMm: tol, nodeCount: NODE_COUNT });
      let worst = 0, worstAt = -1, nBody = 0;
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], b = rows[i + 1];
        if (crossesStep(a, b)) continue; // skip tread-pair / boundary intervals (the C0 riser, measured separately)
        nBody++;
        const s = chordSag(rP, DIMS.H, a, b);
        if (s > worst) { worst = s; worstAt = 0.5 * (a + b); }
      }
      console.log(`[SAG1D] tol=${tol} rows=${rows.length} bodyIntervals=${nBody} worstChord=${worst.toFixed(5)}mm @t≈${worstAt.toFixed(4)} ratio=${(worst / tol).toFixed(1)}× ${worst <= tol * 1.5 ? 'OK' : 'BUSTS'}`);
    }
    expect(true).toBe(true);
  });

  // ── PROTOTYPE THE FIX: verify-and-bisect the body step against the TRUE chord ─────────────────
  // Replace the nodal r''-only step with: start at hMax, halve until the actual chord-sag over [t, t+step] ≤ tol.
  // Bounds MAX (not just p99) at the requested tol, robust to peaks striding between nodal samples. Same ~hMax-clamped
  // row count on the smooth body (the check only bites near the bulge). This is the algorithm to port to production.
  // Mirror the real schedule's STRUCTURE: tread pairs bracket each C0 step; the verify-bisect body walk runs WITHIN each
  // segment [segLo,segHi] bounded by tread rows / 0 / 1, so it never chords across a step (that's the double-valued
  // riser's job). This is exactly what the production edit must do: swap the nodal step for the verify-bisect step,
  // segmented by the tread boundaries that are already in the base set.
  const TREAD_HALF_MM = 0.002;
  function fixedSchedule(H: number, rP: (z: number) => number, tol: number, hMinMm: number, hMaxMm: number, nodeCount: number): number[] {
    const hMin = hMinMm / H, hMax = hMaxMm / H;
    const rows = new Set<number>([0, 1]);
    const stops: number[] = [0, 1];
    for (let k = 1; k < nodeCount; k++) {
      const lo = k / nodeCount - TREAD_HALF_MM / H, hi = k / nodeCount + TREAD_HALF_MM / H;
      rows.add(lo); rows.add(hi); stops.push(lo, hi);
    }
    stops.sort((a, b) => a - b);
    for (let s = 0; s + 1 < stops.length; s++) {
      const segLo = stops[s], segHi = stops[s + 1];
      if (segHi - segLo < 1e-5) continue; // the tread-pair interval itself (brackets the step) — no body rows
      let t = segLo;
      while (t < segHi) {
        let step = Math.min(hMax, segHi - t);
        while (step > hMin && chordSag(rP, H, t, t + step) > tol) step *= 0.5;
        step = Math.max(hMin, Math.min(step, segHi - t));
        t += step;
        if (t < segHi - 1e-9) rows.add(t);
      }
    }
    return [...rows].sort((a, b) => a - b);
  }

  it('FIX (verify-and-bisect) bounds worst body chord ≤ tol at EVERY tol, ~same row count', () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const rP = (z: number): number => rA(0, Math.max(0, Math.min(DIMS.H, z)));
    const edges: number[] = [];
    for (let k = 1; k < NODE_COUNT; k++) edges.push(k / NODE_COUNT);
    const crossesStep = (a: number, b: number): boolean => edges.some((e) => a < e - 1e-6 && b > e + 1e-6);
    for (const tol of [0.1, 0.05, 0.01, 0.004]) {
      const rows = fixedSchedule(DIMS.H, rP, tol, 0.01, 0.12, NODE_COUNT);
      let worst = 0, worstAt = -1;
      for (let i = 0; i + 1 < rows.length; i++) {
        if (crossesStep(rows[i], rows[i + 1])) continue; // the tread-pair riser (bracketed, not chorded)
        const s = chordSag(rP, DIMS.H, rows[i], rows[i + 1]);
        if (s > worst) { worst = s; worstAt = 0.5 * (rows[i] + rows[i + 1]); }
      }
      console.log(`[SAGFIX] tol=${tol} rows=${rows.length} worstChord=${worst.toFixed(5)}mm @t≈${worstAt.toFixed(4)} ratio=${(worst / tol).toFixed(2)}× ${worst <= tol * 1.05 ? 'BOUNDED' : 'STILL-BUSTS'}`);
      expect(worst).toBeLessThanOrEqual(tol * 1.05);
    }
  });
});

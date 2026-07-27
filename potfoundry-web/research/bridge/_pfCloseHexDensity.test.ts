/* eslint-disable no-console */
// _pfCloseHexDensity.test.ts — HexHive wiring gate. The smooth-grid emitter pow2-snaps nU. Agent found HexHive closes
// at nU~3072 (0.0076) but 2048 gives 0.0115 (>0.01). pow2 ⇒ nU is 2048 or 4096. Does deriveSmoothGridDensity pick
// 4096 (closes with margin) or 2048 (0.0115) at the 0.01 emitter-CAD floor? Also check tol=0.003 (cadFidelity default).
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseHexDensity.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { deriveSmoothGridDensity } from '../../src/renderers/webgpu/parametric/conforming/tierC/smoothGrid';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('HexagonalHive — smooth-grid density gate', () => {
  it('nU picked at the export tolerances', () => {
    const rA = buildAnalyticRadiusFn('HexagonalHive', {}, DIMS);
    for (const tol of [0.05, 0.01, 0.005, 0.003]) {
      const { nU, nT } = deriveSmoothGridDensity(rA, DIMS.H, tol);
      console.log(`[HEXDENS] tol=${tol} nU=${nU} nT=${nT} tris≈${((nU * (nT - 1) * 2) / 1e6).toFixed(2)}M ${nU >= 3072 ? 'closes(≥3072)' : 'NU-TOO-LOW'}`);
    }
    // FIX DIRECTION: the 128² probe aliases the sharp hex walls ⇒ under-estimates maxSagU ⇒ nURaw just under 2048 ⇒
    // pow2-snaps DOWN to 2048. A finer probe should raise maxSagU, push nURaw past 2048, and snap to 4096 (closes).
    for (const probeRes of [128, 256, 512, 1024]) {
      const { nU, nT } = deriveSmoothGridDensity(rA, DIMS.H, 0.01, { probeRes });
      console.log(`[HEXFIX] probeRes=${probeRes} @tol0.01 nU=${nU} nT=${nT} ${nU >= 3072 ? 'PICKS-4096-closes' : 'still-2048'}`);
    }
    // The 3 GAP smooth styles (agent: HR 0.01225, SR 0.01667, WI 0.01825 at default 128-probe) — does the finer probe
    // raise their nU too (the ONE fix that closes all four sharp/relief smooth-grid styles)?
    for (const s of ['HarmonicRipple', 'SpiralRidges', 'WaveInterference']) {
      const rA2 = buildAnalyticRadiusFn(s, {}, DIMS);
      const d128 = deriveSmoothGridDensity(rA2, DIMS.H, 0.01);
      const d512 = deriveSmoothGridDensity(rA2, DIMS.H, 0.01, { probeRes: 512 });
      console.log(`[HEXFIX] ${s}@0.01  128→nU${d128.nU}  512→nU${d512.nU}  ${d512.nU > d128.nU ? 'RAISED' : 'same'}`);
    }
    expect(true).toBe(true);
  });
});

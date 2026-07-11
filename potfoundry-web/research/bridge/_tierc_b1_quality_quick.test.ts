import { describe, it, expect } from 'vitest';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { loadB1Bin } from './_tierc_b1_lib';

describe('B1 quick quality', () => {
  it.skipIf(process.env.PF_TIERC_B1_QQ !== '1')('quality both', () => {
    for (const which of ['native', 'corrected'] as const) {
      const { xyz, idx } = loadB1Bin(which);
      const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
      // eslint-disable-next-line no-console
      console.log(`[QQ-${which}] minAngleDeg=${q.minAngleDeg} p5MinAngleDeg=${q.p5MinAngleDeg} pctBelow10=${q.pctBelow10} pctBelow20=${q.pctBelow20} pctBelow30=${q.pctBelow30}`);
    }
    expect(true).toBe(true);
  }, 60000);
});

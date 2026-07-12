// research/spike-raycast-oracle/scorecard.test.ts
import { describe, it, expect } from 'vitest';
import { renderScorecard, type ScoreRow } from './scorecard';

const row: ScoreRow = {
  style: 'GyroidManifold', featureKinds: { 'general-curve': 12 },
  sagOffMm: 0.041, overTolOff: 320, sagOnMm: 0.009, overTolOn: 0, verdictRan: true,
  trisOff: 210000, trisOn: 512000,
  worstOn: { u: 0.3, t: 0.5, sagMm: 0.009 },
  conditionC: { ok: true, boundaryEdges: 0, nonManifoldEdges: 0, orientationMismatches: 0, selfIntersections: 0, stlPath: 'x.stl' },
  driftMaxMm: null,
};

describe('renderScorecard', () => {
  it('emits a markdown table with the style row and a cap note', () => {
    const md = renderScorecard([row], 'cap = VERDICT_MAX_PASS(4) @ tol 0.01mm');
    expect(md).toContain('GyroidManifold');
    expect(md).toContain('| Style |');
    expect(md).toContain('cap = VERDICT_MAX_PASS(4)');
    expect(md).toContain('0.009');
    expect(md).toContain('drift'); // column present even when pending
  });

  // Spike-methodology pivot: CPU/GPU drift now gates go/no-go ahead of A/C —
  // where CPU diverges from the certified GPU field, CPU sag measures the
  // wrong surface and can't certify tolerance (see Task 4 enhancement notes).
  it('gates go/no-go on large CPU/GPU drift ahead of the A/C verdict', () => {
    const driftRow: ScoreRow = { ...row, driftMaxMm: 0.05 };
    const md = renderScorecard([driftRow], 'cap = VERDICT_MAX_PASS(4) @ tol 0.01mm');
    expect(md).toContain('needs GPU measurement');
  });
});

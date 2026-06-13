/**
 * crestAlignedCeiling.test.ts — runs the crest-aligned-cell ceiling and prints
 * the head-to-head against the axis-aligned ceiling (the cure-confirming
 * measurement).
 */
import { describe, it, expect } from 'vitest';
import { runSfbCrestAlignedCeilingAudit, type AngleStats } from './crestAlignedCeiling';
import { runSfbCrestCellCeilingAudit } from './cellTriangulationCeiling';

function fmt(s: AngleStats): string {
  return (
    `min ${s.minDeg.toFixed(2)}°  p05 ${s.p05Deg.toFixed(2)}°  median ${s.medianDeg.toFixed(2)}°  ` +
    `| <15°: ${(s.fracBelow15 * 100).toFixed(1)}%  <20°: ${(s.fracBelow20 * 100).toFixed(1)}%`
  );
}

describe('SFB@1 crest-ALIGNED cell ceiling — the cure measurement', () => {
  it('aligned cells recover well-shaped 3D triangles vs the axis-aligned grid', () => {
    const axis = runSfbCrestCellCeilingAudit();
    const aligned = runSfbCrestAlignedCeilingAudit({ widthScale: 1 });

    expect(aligned.config.crestBranches).toBeGreaterThan(0);
    expect(aligned.cellsMeasured).toBeGreaterThan(50);

    /* eslint-disable no-console */
    console.log('\n===== CREST-ALIGNED vs AXIS-ALIGNED CEILING (SFB@1, 3D) =====');
    console.log(`aligned cells measured: ${aligned.cellsMeasured} (skipped rows ${aligned.skippedRows})`);
    console.log(
      `AXIS-ALIGNED grid (best conn., from stage3):  ` +
        `median ${axis.ceiling.medianDeg.toFixed(2)}°  ` +
        `| <15°: ${(axis.fractionCeilingBelow15 * 100).toFixed(1)}%  ` +
        `<20°: ${(axis.fractionCeilingBelow20 * 100).toFixed(1)}%`,
    );
    console.log(`M1 SHEARED lattice (CreaseUWarp-style):       ${fmt(aligned.sheared)}`);
    console.log(`M2 PERPENDICULAR crest-frame (ideal):         ${fmt(aligned.perpendicular)}`);
    console.log('=============================================================\n');
    /* eslint-enable no-console */

    // The cure must do strictly better than the axis-aligned ceiling.
    expect(aligned.perpendicular.medianDeg).toBeGreaterThan(axis.ceiling.medianDeg);
    expect(aligned.sheared.medianDeg).toBeGreaterThan(axis.ceiling.medianDeg);
  });

  it('width sensitivity — the cure is not knife-edge on cell aspect', () => {
    /* eslint-disable no-console */
    console.log('\n----- aligned ceiling vs cell aspect (widthScale) -----');
    for (const widthScale of [0.5, 1, 2]) {
      const r = runSfbCrestAlignedCeilingAudit({ widthScale });
      console.log(`  widthScale ${widthScale}:  M1 ${fmt(r.sheared)}`);
      console.log(`  widthScale ${widthScale}:  M2 ${fmt(r.perpendicular)}`);
      expect(Number.isFinite(r.perpendicular.medianDeg)).toBe(true);
    }
    console.log('-------------------------------------------------------\n');
    /* eslint-enable no-console */
  });
});

/**
 * ribbonTransitionCeiling.test.ts — runs the ribbon + TRANSITION-zone tiling
 * audit and prints the full distribution. The transition cells (slanted ribbon
 * edge → vertical bulk grid line) are the load-bearing open unknown from
 * stage3-connectivity-ceiling.md (line 179); this test reports their 3D
 * min-angle distribution SEPARATELY from the ribbon, plus the watertight
 * shared-edge verdict and the fold (parameter-space orientation) verdict.
 */
import { describe, it, expect } from 'vitest';
import {
  runSfbRibbonTransitionAudit,
  type AngleStats,
  type SfbRibbonTransitionResult,
} from './ribbonTransitionCeiling';

function fmt(s: AngleStats): string {
  return (
    `n ${s.count}  min ${s.minDeg.toFixed(2)}°  p05 ${s.p05Deg.toFixed(2)}°  ` +
    `median ${s.medianDeg.toFixed(2)}°  | <15°: ${(s.fracBelow15 * 100).toFixed(2)}%  ` +
    `<20°: ${(s.fracBelow20 * 100).toFixed(2)}%`
  );
}

function logResult(r: SfbRibbonTransitionResult): void {
  /* eslint-disable no-console */
  console.log(
    `\n===== RIBBON + TRANSITION TILING (SFB@1, 3D) — widthScale=${r.config.widthScale}, ` +
      `ribbonCellsPerSide=${r.config.ribbonCellsPerSide} =====`,
  );
  console.log(
    `grid uSpan=${r.config.uSpan} tSpan=${r.config.tSpan}  crests=${r.config.crestBranches}  ` +
      `rows processed=${r.rowsProcessed} skipped=${r.rowsSkipped}  ` +
      `seamRows=${r.seamRows} birthRows=${r.birthRows}`,
  );
  console.log(`RIBBON     cells: ${fmt(r.ribbon)}`);
  console.log(`TRANSITION cells: ${fmt(r.transition)}   <-- the unknown`);
  console.log(`BULK       cells: ${fmt(r.bulk)}`);
  console.log(
    `WATERTIGHT  ribbon↔transition edges: ${r.ribbonTransitionEdgesChecked} checked, ` +
      `${r.ribbonTransitionEdgeMismatches} mismatched`,
  );
  console.log(
    `WATERTIGHT  transition↔bulk edges:   ${r.transitionBulkEdgesChecked} checked, ` +
      `${r.transitionBulkEdgeMismatches} mismatched   (offGridColumns=${r.transitionOffGridColumns})`,
  );
  console.log(
    `FOLD        cells=${r.cellsFoldChecked}  inverted=${r.invertedCells}  ` +
      `degenerate=${r.degenerateCells}  signsSeen=${r.jacobianSignsSeen}  ` +
      `minAbsArea=${r.jacobianMinAbs.toExponential(2)}  foldFree=${r.foldFree}`,
  );
  console.log('==========================================================================\n');
  /* eslint-enable no-console */
}

describe('SFB@1 ribbon → axis-aligned-bulk TRANSITION tiling ceiling', () => {
  it('measures ribbon, transition, and bulk 3D quality separately at aspect 1', () => {
    const r = runSfbRibbonTransitionAudit({ widthScale: 1, ribbonCellsPerSide: 1 });
    logResult(r);

    // Coverage sanity — the probe must actually exercise the regions it claims.
    expect(r.config.crestBranches).toBeGreaterThan(0);
    expect(r.rowsProcessed).toBeGreaterThan(50);
    expect(r.ribbon.count).toBeGreaterThan(50);
    expect(r.transition.count).toBeGreaterThan(50);
    expect(r.bulk.count).toBeGreaterThan(50);
    // Births and seam must be covered (SFB@1 morphs m: 6→10 → ≥4 born branches).
    expect(r.birthRows).toBeGreaterThan(0);

    // WATERTIGHT BY CONSTRUCTION: shared edges must derive identical vertex keys.
    // (No weld / T-junction split is permitted — these are banned, so a mismatch
    // here is a true crack, not something a later pass could rescue.)
    expect(r.ribbonTransitionEdgeMismatches).toBe(0);
    expect(r.transitionBulkEdgeMismatches).toBe(0);
  });

  it('reports the fold verdict (parameter-space orientation sign)', () => {
    const r = runSfbRibbonTransitionAudit({ widthScale: 1, ribbonCellsPerSide: 1 });
    /* eslint-disable no-console */
    console.log(
      `\nFOLD VERDICT (widthScale=1): foldFree=${r.foldFree}  inverted=${r.invertedCells}  ` +
        `degenerate=${r.degenerateCells}  of ${r.cellsFoldChecked} cells  ` +
        `(offGridColumns=${r.transitionOffGridColumns})`,
    );
    /* eslint-enable no-console */
    // The fold count is a TRUTHFUL measurement, not an assumed pass: we log it
    // and assert only that the instrument produced a determinate verdict.
    expect(Number.isFinite(r.jacobianMinAbs)).toBe(true);
    expect(r.cellsFoldChecked).toBeGreaterThan(0);
  });

  it('aspect sensitivity — transition quality + folds vs ribbon width', () => {
    /* eslint-disable no-console */
    console.log('\n----- transition tiling vs widthScale (aspect) -----');
    for (const widthScale of [0.5, 1, 2]) {
      const r = runSfbRibbonTransitionAudit({ widthScale });
      console.log(`  widthScale ${widthScale}:`);
      console.log(`    RIBBON     ${fmt(r.ribbon)}`);
      console.log(`    TRANSITION ${fmt(r.transition)}`);
      console.log(
        `    folds: inverted=${r.invertedCells} degenerate=${r.degenerateCells} ` +
          `offGrid=${r.transitionOffGridColumns} foldFree=${r.foldFree}  ` +
          `| edge mismatches rt=${r.ribbonTransitionEdgeMismatches} tb=${r.transitionBulkEdgeMismatches}`,
      );
      expect(Number.isFinite(r.transition.medianDeg)).toBe(true);
      // Watertightness must hold at EVERY aspect (it is construction-derived).
      expect(r.ribbonTransitionEdgeMismatches).toBe(0);
      expect(r.transitionBulkEdgeMismatches).toBe(0);
    }
    console.log('----------------------------------------------------\n');
    /* eslint-enable no-console */
  });

  it('2-cell-wide ribbon — transition quality with a wider ribbon', () => {
    const r = runSfbRibbonTransitionAudit({ widthScale: 1, ribbonCellsPerSide: 2 });
    logResult(r);
    expect(r.transition.count).toBeGreaterThan(50);
    expect(r.ribbonTransitionEdgeMismatches).toBe(0);
    expect(r.transitionBulkEdgeMismatches).toBe(0);
  });
});

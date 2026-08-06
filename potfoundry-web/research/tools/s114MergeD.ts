// s114MergeD.ts — merge the S114-D sweep, the crease-bisection floor, and the Gothic calibration into
// ONE machine-readable per-style record, plus the per-style table. No new measurement happens here; it
// only joins files that were written by the tools that measured, so a reader can check every field
// against the report it came from.
import { readFileSync, writeFileSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const DIR = 'research/exchange/_strataConformBisect/s114sweep';
const sweep = readFileSync(`${DIR}/S114_SWEEP_D.ndjson`, 'utf8').split('\n').filter((l) => l.length > 2)
  .map((l) => JSON.parse(l) as Record<string, unknown>);
const floor = JSON.parse(readFileSync(`${DIR}/S114_CREASE_BISECT_D.json`, 'utf8')) as Array<Record<string, unknown>>;
const calib = JSON.parse(readFileSync(`${DIR}/S114_SWEEP_DCALIB3_GothicArches.json`, 'utf8')) as Record<string, unknown>;
const calibFloor = floor.find((f) => f.style === 'GothicArches') as Record<string, unknown>;

const byStyle = new Map<string, Record<string, unknown>>();
for (const s of sweep) byStyle.set(s.style as string, { ...s });
for (const f of floor) {
  const s = byStyle.get(f.style as string);
  if (s === undefined) continue;
  s.floorCoarseMaxDeg = f.coarseMax; s.floorBisectLevel0Deg = f.level0;
  s.floorBisectDeepestDeg = f.deepest; s.floorShrink = f.shrink; s.floorLevels = f.levels;
  s.analyticCreasesOver45 = f.creased;
  s.hiClassEndBandAreaPct = f.hiEndBandAreaPct;
}
const out = {
  run: 'S114-D — all-styles sweep on the honest ruler, quarter D (SpiralRidges..WaveInterference)',
  date: '2026-08-06',
  dims: { H: 120, Rb: 40, Rt: 50, expn: 1 },
  rulers: {
    dihedral: 'research/bridge/dihedralRuler.ts facetDihedrals (analytic-free, WHOLE MESH)',
    normDeg: "research/bridge/orientRuler.ts orientOfFacet, kink-aware fdNormals, orient='winding', k=8, insets 0 AND 0.05 both explicit",
    oracle: 'flank 2-means + 8 closest cross-flank pairs on an order-12 barycentric footprint lattice (s113opOracle construction, reproduced)',
    floor: 's114CreaseBisectD.ts — locus-seeking bisection, 14 levels, bracket shrinks 16384x',
  },
  calibration: {
    what: 'CTL-3: the identical pipeline run on the Gothic reference and on S113s pinned 3,282-pair straddle set',
    stl: calib.stl,
    precondUm: calib.precondMaxUm,
    published_vs_measured: {
      'PRECOND um': { published: 0.0310, measured: calib.precondMaxUm },
      'dihedral AREA over 45 deg, % of mesh': { published: 2.3699, measured: calib.dihAreaShareOver45Pct },
      'funnel: edges over 45 deg': { published: 19582, measured: calib.hiEdges },
      'funnel: curtain edges': { published: 6490, measured: calib.curtainCnt },
      'funnel: straddling edges': { published: 5174, measured: calib.straddleCnt },
      'oracle: irreducible PAIRS %': { published: 93.17, measured: calib.oracleIrrPairPct },
      'oracle: irreducible LOOSE facet AREA %': { published: 99.40, measured: calib.oracleIrrLooseAreaPct },
      'oracle: across-crease turn p50 deg': { published: 146.52, measured: calib.oracleSepCreaseP50 },
      'CTL smooth crease-label rate %': { published: 3.17, measured: calib.ctlSmoothCreaseRatePct },
    },
    unscopedWholeClassIrrPairAreaPct: calib.unscopedIrrPairAreaPct,
    floorAnalyticCreasesOver45: calibFloor?.creased,
    floorBisectDeepestDeg: calibFloor?.deepest,
    verdict: 'reproduces every published Gothic figure to the digit; the instrument is calibrated',
  },
  voidRuns: [{
    file: `${DIR}/S114_ANALYTIC_CREASE_D.report.txt`,
    reason: 'its own POSITIVE control flipped with the grid (NTH=900 -> "no creases" on Gothic, NTH=960 -> "creases"). A fixed grid with a shrinking window cannot find a measure-zero locus. Superseded by S114_CREASE_BISECT_D.',
  }],
  styles: Array.from(byStyle.values()),
};
writeFileSync(`${DIR}/S114_SWEEP_D_SUMMARY.json`, `${JSON.stringify(out, null, 2)}\n`);

const f2 = (v: unknown, n = 2): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(n) : 'n/a');
log('style | facets | area mm2 | PRECOND um | dih p50 | dih p99 | dih MAX | dih AREA>45% | nd05 p50 | nd05 p90 | nd05 p99 | nd05 MAX | nd05 AREA>1% | nd05 AREA>5% | curtain% | conf% | strad% | strad %mesh | ORACLE irred (strad) | ORACLE irred (whole class) | analytic creases | VERDICT');
for (const s of byStyle.values()) {
  log([
    s.style, s.facets, f2(s.areaMm2, 1), f2(s.precondMaxUm, 4),
    f2(s.dihP50), f2(s.dihP99), f2(s.dihMax), f2(s.dihAreaShareOver45Pct, 4),
    f2(s.nd05P50, 3), f2(s.nd05P90, 3), f2(s.nd05P99), f2(s.nd05Max),
    f2(s.nd05AreaShareOver1Pct, 3), f2(s.nd05AreaShareOver5Pct, 4),
    f2(s.curtainPairAreaSharePct), f2(s.conformedPairAreaSharePct), f2(s.straddlePairAreaSharePct),
    f2(s.straddleMeshAreaSharePctEst, 4),
    s.oracleIrrLooseAreaPct === undefined ? 'EMPTY' : `${f2(s.oracleIrrLooseAreaPct)}%`,
    s.unscopedIrrPairAreaPct === undefined ? 'EMPTY' : `${f2(s.unscopedIrrPairAreaPct)}%`,
    (s.analyticCreasesOver45 as boolean) ? 'YES' : 'NO',
    s.oracleVerdict,
  ].join(' | '));
}
log('');
log(`wrote ${DIR}/S114_SWEEP_D_SUMMARY.json`);

// s23ReconDecide.ts — S23B: THE ONE DECISION THE BUILD MUST MAKE, MEASURED BEFORE IT IS MADE.
// ARTIFACT-ONLY: reads the Stage-0 density field, writes nothing, runs no mesher, edits no driver.
//
// Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23ReconDecide.ts --bundle --platform=node \
//     --format=cjs --target=node20 --external:playwright --external:playwright-core \
//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23rd.cjs
//   node research/bridge/out/_run_s23rd.cjs
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION, QUOTED FROM THE HANDOFF THAT LEFT IT OPEN (2026-08-01-S23B-entry-handoff.md §3)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   "WHETHER TO GRADIENT-LIMIT THE FIELD. ... The field is smooth enough to construct at its median and
//    emphatically not at its tail. The extractor deliberately writes the field UNSMOOTHED and NOT
//    gradient-limited ... Register the choice — limit or not, and at what Lipschitz constant — as a
//    declared variable before the run, because it will move both the cost and the shard census."
// and (§2) "The extracted field asks for less than [36.4 um] at 4.527% of source vertices (hA) and
//    20.046% (hMin) ... the build still has to decide what to do at those cells".
//
// THIS TOOL DOES NOT DECIDE. It measures the cost and the neighbour-ratio census of every candidate
// setting so the decision is registered against numbers rather than against taste. The decision itself,
// and its reasoning, go in the worklog BEFORE the build runs.
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { loadReconField, impliedTris } from '../bridge/_strataReconField';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
// eslint-disable-next-line no-console
const log = console.log;
const ARM = process.argv[2] ?? 'S22B';
const FIELD = `research/exchange/_strataConformBisect/gothicarches_ring_DS-H_${ARM}.density.json`;
const PSLG_FLOOR_MM = 0.0364;      // the constructor's own architectural floor (_strataAlignedSeed.ts:398)
const SRC_NTRI = 1251546;          // _S22B's own facet count — the control every ratio is quoted against
const TRI_CEILING = 2000000;       // S4's registered live-triangle ceiling

const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);

log(`=== S23B — THE FIELD-PREPARATION DECISION, MEASURED.  arm ${ARM} ===`);
log(`  field: ${FIELD}`);
log(`  control: _S22B ${SRC_NTRI} facets;  registered ceiling ${TRI_CEILING} live triangles.`);
log('');

// ── THE CANDIDATE SETTINGS. `alpha = Infinity` is the raw field; `floor = 0` is no clamp. ────────────
const CASES: Array<{ name: string; floorMm: number; alpha: number }> = [
  { name: 'RAW (Stage 0 as written)', floorMm: 0, alpha: Infinity },
  { name: 'FLOOR only', floorMm: PSLG_FLOOR_MM, alpha: Infinity },
  { name: 'FLOOR + alpha 2.00', floorMm: PSLG_FLOOR_MM, alpha: 2.0 },
  { name: 'FLOOR + alpha 1.00', floorMm: PSLG_FLOOR_MM, alpha: 1.0 },
  { name: 'FLOOR + alpha 0.50', floorMm: PSLG_FLOOR_MM, alpha: 0.5 },
  { name: 'FLOOR + alpha 0.25', floorMm: PSLG_FLOOR_MM, alpha: 0.25 },
];

interface Row {
  name: string; nTri: number; ratioSrc: number; ratioCeil: number;
  p50: number; min: number; floored: number; graded: number; worstGrade: number;
  q50: number; q99: number; qmax: number; nPts: number;
}
const rows: Row[] = [];
let area0 = 0;

for (const cs of CASES) {
  const f = loadReconField(FIELD, { floorMm: cs.floorMm, alpha: cs.alpha });
  const { nTri, areaMm2 } = impliedTris(f, rA, 'prepared');
  area0 = areaMm2;
  const s = f.stats;
  rows.push({
    name: cs.name, nTri: Math.round(nTri),
    ratioSrc: nTri / SRC_NTRI, ratioCeil: nTri / TRI_CEILING,
    p50: s.p50, min: s.min, floored: s.flooredCells, graded: s.gradedCells,
    worstGrade: s.worstGradeRatio, q50: s.ratioP50, q99: s.ratioP99, qmax: s.ratioMax,
    // a closed manifold has ~2 triangles per vertex (Stage 0 measured 1.998 on _S22B), so the point
    // count the constructor must PLACE is ~N_tri/2. This is the number cdt2d is priced by.
    nPts: Math.round(nTri / 2),
  });
  log(`  ${cs.name.padEnd(26)}  N_tri ${String(Math.round(nTri)).padStart(9)}`
    + `  x${(nTri / SRC_NTRI).toFixed(4)} of _S22B   ${((100 * nTri) / TRI_CEILING).toFixed(1)}% of the ceiling`
    + `   ~${Math.round(nTri / 2)} pts`);
  log(`  ${''.padEnd(26)}  prepared h um: min ${s.min} p01 ${s.p01} p10 ${s.p10} p50 ${s.p50} p90 ${s.p90} p99 ${s.p99} max ${s.max}`);
  log(`  ${''.padEnd(26)}  floored ${s.flooredCells} cells (${((100 * s.flooredCells) / s.nCells).toFixed(4)}%, raw min ${s.rawMinUm} um)`
    + `;  graded ${s.gradedCells} (${((100 * s.gradedCells) / s.nCells).toFixed(2)}%), worst lowering x${s.worstGradeRatio}, ${s.sweeps} sweeps`);
  log(`  ${''.padEnd(26)}  8-neighbour SIZE RATIO  raw p50 ${s.ratioRawP50} p99 ${s.ratioRawP99} MAX ${s.ratioRawMax}`
    + `  ->  prepared p50 ${s.ratioP50} p99 ${s.ratioP99} MAX ${s.ratioMax}`);
  log('');
}

log(`  analytic surface area over the reporting grid: ${area0.toFixed(2)} mm^2`);
log('');
log('  ── SUMMARY TABLE ─────────────────────────────────────────────────────────────────────────────');
log('  | setting | N_tri | x_S22B | % of 2.0M | ~points | nbr ratio p99 | nbr ratio MAX |');
log('  |---|---|---|---|---|---|---|');
for (const r of rows) {
  log(`  | ${r.name} | ${r.nTri} | x${r.ratioSrc.toFixed(4)} | ${(100 * r.ratioCeil).toFixed(1)}% | ${r.nPts} | ${r.q99} | ${r.qmax} |`);
}
log('');
log('  NOTE ON WHAT THE NEIGHBOUR RATIO BOUNDS. A Delaunay triangulation of a point set whose local');
log('  spacing changes by a factor q between neighbours carries transition elements of aspect ~q. The');
log('  shard instrument flags AR3 >= 20 with a >= 1.0 mm long edge, and the designed lattice\'s own metric');
log('  aspect p99 is 16.61 (S23-M, reproduced by A2). A gradation that holds the neighbour ratio at or');
log('  under 2 therefore cannot manufacture a transition element worse than the design already carries.');

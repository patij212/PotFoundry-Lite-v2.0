// s23ReconProbe.ts — S23B: THE SEED-ONLY CALIBRATION HARNESS. `beta` measured, not asserted.
//
// ARTIFACT-ONLY in the sense that matters: it runs the CONSTRUCTOR and nothing else — no fidelity audit,
// no judge, no STL. It exists because `beta` is registered as "a CALIBRATION, not a design choice: it
// converts a target element size into a packing radius and its value is measured on the low-density probe
// against the predicted point count". Measuring that through the full driver costs ~12 minutes a value
// because the Part-B audit dominates; measuring it here costs the trace ONCE plus one seed build per
// value, because the trace is density-independent and is reused across the sweep.
//
// IT CALLS THE PRODUCTION CODE PATH. `traceLoci` + `buildAlignedSeedRepaired` with the SAME options
// object the driver builds, so a number measured here is a number the arm will reproduce — this is a
// harness around the constructor, not a second copy of it.
//
// Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23ReconProbe.ts --bundle --platform=node \
//     --format=cjs --target=node20 --external:playwright --external:playwright-core \
//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23rp.cjs
//   node research/bridge/out/_run_s23rp.cjs <beta,beta,...> [scale] [rounds]
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { traceLoci, DEFAULT_TRACE_OPTS, type LocusArtifact } from '../bridge/_strataLocusTrace';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS } from '../bridge/_strataAlignedSeed';
import { loadReconField } from '../bridge/_strataReconField';
import type { PatchRegion } from '../bridge/_judgeShape';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const H = 120;
// eslint-disable-next-line no-console
const log = console.log;
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const BETAS = (process.argv[2] ?? '0.83').split(',').map(Number);
const SCALE = Number(process.argv[3] ?? 1);
const ROUNDS = Math.round(Number(process.argv[4] ?? 1));
const CHAIN = (process.argv[5] ?? '0') === '1';
// S23B-R / R1: WHICH FIELD. The scattered field is the corrected artifact and is the default; the 0.25 mm
// grid is reachable on request so the S23B rows in this same table stay reproducible against it.
const FIELD_PATH = process.env.S23_FIELD_PATH ?? `${EX}S22B.density2.json`;
const FIELD_SRC = (process.env.S23_FIELD_SRC ?? 'scatter') as 'scatter' | 'grid';
// the arm's own routed-disk list, verbatim
const IDS = '0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016'.split(',');
const PRED_TRI = 1723299; const PRED_PTS = 861650;      // registered before the build, 2026-08-01

const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const field = loadReconField(FIELD_PATH, { floorMm: 0.0364, alpha: 1.0, source: FIELD_SRC });

const regArt = JSON.parse(readFileSync(`${EX}S21B.regions.json`, 'utf8')) as {
  regions: Array<{ id: number; theta: number; z: number; radiusMm: number }> };
const patchRoute: PatchRegion[] = IDS
  .map((s) => regArt.regions.find((r) => r.id === Number(s)))
  .filter((r): r is { id: number; theta: number; z: number; radiusMm: number } => r !== undefined)
  .sort((a, b) => a.id - b.id)
  .map((r) => ({ id: `D${r.id}`, theta: r.theta, z: r.z, radiusMm: r.radiusMm }));

log(`=== S23B SEED CALIBRATION — beta sweep [${BETAS.join(', ')}] at scale ${SCALE}, rounds ${ROUNDS}, chain-bound ${CHAIN ? 'ON' : 'off'} ===`);
log(`  FIELD: ${FIELD_PATH}   source ${FIELD_SRC.toUpperCase()}`);
log(FIELD_SRC === 'scatter'
  ? `    prepared SCATTERED h um: min ${field.stats.sMin} p10 ${field.stats.sP10} p50 ${field.stats.sP50}`
    + ` p90 ${field.stats.sP90} p99 ${field.stats.sP99} max ${field.stats.sMax}`
  : `    prepared GRID h um: min ${field.stats.min} p10 ${field.stats.p10} p50 ${field.stats.p50}`
    + ` p90 ${field.stats.p90} p99 ${field.stats.p99} max ${field.stats.max}`);
log(`  registered prediction: ${PRED_TRI} triangles / ~${PRED_PTS} placed points (floor 36.4 um, alpha 1.0)`);
log(`  routed disks ${patchRoute.length} of ${IDS.length} requested`);

// THE PREDICATE CONSTANT, transcribed from the driver's own `PRED` at the arm's config
// (_strataConformBisect.test.ts:530 with PF_CB_SNAP=1 and every other knob at its default). A tracer run
// on a different predicate would trace different loci, so this is copied operand-for-operand.
const PRED = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.0006,
};
const t0 = Date.now();
const loci: LocusArtifact = traceLoci(rA, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 400, nv: 280, hRefMm: 0.35 });
log(`  trace 400x280 in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${loci.loci.length} components,`
  + ` ${loci.counts.polylinePts} points, ${loci.counts.totalLengthMm.toFixed(1)} mm  (reused for every beta below)`);
log('');
log('  | beta | points | tris | x pred (tris) | x pred (pts) | infill | chainPts | over-cap | worst AR | worstParAR | recovered | s |');
log('  |---|---|---|---|---|---|---|---|---|---|---|---|');

for (const beta of BETAS) {
  const tB = Date.now();
  let rep;
  try {
    rep = buildAlignedSeedRepaired(rA, loci, {
    ...DEFAULT_SEED_OPTS, H, gu: 200, gv: 140,
    alongMul: 1.0, acrossFrac: 0.35, useField: true,
    acrossAbs: true, acrossMinMm: 0.050, seedARmax: 24, bowFrac: 0,
    patchRoute, patchMaxMm: 1.5, patchSubMax: 16,
    acrossRings: 7, acrossGrade: 1.6, acrossMaxMm: 0.65, turnMul: 9,
    mistraceUm: 0, shapeAR: 50, tolMm: 0.01,
    reconField: {
      floorMm: SCALE * field.floorMm, dxMm: field.dxMm,
      hAt: (th: number, z: number): number => SCALE * field.hAt(th, z),
    },
      reconBeta: beta, reconCand: 3, reconChain: CHAIN,
    }, ROUNDS);
  } catch (err) {
    // S7. A recovery shortfall or a cdt2d throw IS THE RESULT and is reported as a row, not as a crash —
    // a dead process loses the segment counts, which are the only transferable thing the failure carries.
    const msg = String((err as Error).message ?? err).split(/\r?\n/)[0];
    log(`  | ${beta.toFixed(3)} | *** THREW *** | | | | | | | | | ${((Date.now() - tB) / 1000).toFixed(0)} |`);
    log(`         ${msg}`);
    log('         >>> S7 TRIPWIRE: this is INFEASIBLE at this density. Reported and NOT tuned around.');
    continue;
  }
  const s = rep.seed.stats;
  log(`  | ${beta.toFixed(3)} | ${s.points} | ${s.tris} | x${(s.tris / PRED_TRI).toFixed(4)} | x${(s.points / PRED_PTS).toFixed(4)}`
    + ` | ${s.reconPts} | ${s.chainPts} | ${s.overCap} | ${s.worstAR.toFixed(1)} | ${s.worstParAR.toFixed(1)}`
    + ` | ${s.constraintsRecovered}/${s.constraints} | ${((Date.now() - tB) / 1000).toFixed(0)} |`);
  log(`         infill refused: ${s.reconRefusedPt} on point clearance, ${s.reconRefusedSeg} on constraint clearance;`
    + ` boundary densification ${s.reconBoundaryPts}; at-floor candidates ${s.reconFloorHits};`
    + ` candidates ${s.reconCandidates}; chain-along bound at ${s.reconAlongBoundPts} pts;`
    + ` repair rounds ${rep.roundsUsed}, banned ${rep.banned}; degenerate dropped ${s.degenerateDropped}, dropRefused ${s.dropRefused}`);
}
log('\n=== DONE ===');

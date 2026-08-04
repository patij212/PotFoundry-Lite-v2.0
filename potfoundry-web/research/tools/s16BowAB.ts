// s16BowAB.ts — S16 BOW RULE, SEED-ONLY A/B AT THE S47CAV PRODUCTION CONFIGURATION.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// `gothicarches_ring_DS-HT_S47CAV.report.txt` prints, from the driver's OWN `locateKink`:
//
//     seed edges that CROSS a locus: 9,363 of 349,848 (2.676%).
//     The uniform grid at this config had 10,641.
//
// The aligned constrained seed exists for ONE contract — "no edge crosses a locus by construction".
// Measured, it removes 12% of the crossings of the dumb uniform grid it replaced. Refinement then
// inherits ~9.4k crease-crossing edges at generation zero, and no downstream lever can price them
// away (2026-08-02: risk ratio 74x for over-tol given a crossing; 69.7% are ACCEPTED by the plane
// ruler, i.e. never queued at all).
//
// `_strataAlignedSeed.ts:91-98` names a mechanism AND ships the repair for it, default OFF:
//
//     "`alignedSeedCrossings` 963 -> 3,425, because the ring at 50 um is now nearer the locus than
//      the locus's own BOW over the along-span (bow exceeds 50 um on 6.0% of 1,200 um chords).
//      The ring hugs the CHAIN; the chord between two consecutive ring points is straight and the
//      locus between them is not, so where the bow wins, that chord cuts the locus."
//
// S47CAV runs along 1,101 um / across 50.0 um (min AND p50 — the S15 absolute floor binds at 34,197
// chain points) with `PF_CB_ALIGNED_BOW_FRAC` = 0. That is exactly the regime the comment describes,
// with the countermeasure switched off.
//
// The existing `research/bridge/out/s16Probe.ts` asks a version of this question but runs
// DEFAULT_SEED_OPTS on a committed S11A artifact — no S19 rings, no turn rule, no S18 patch emitter,
// no fresh trace. It CANNOT reproduce 9,363 and so cannot answer it. This file transcribes the
// production seed call instead.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// REGISTERED BEFORE ANY NUMBER IS READ
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// H1  (the hypothesis under test) The ring-chord-cuts-the-locus mechanism is the DOMINANT source of
//     the 9,363. Then bowFrac > 0 must reduce `edgesCrossingLocus` materially, and `bowShortenedPts`
//     must be large — the rule has to actually BIND for its effect to be attributable to it.
// H0  (the discriminating alternative) The crossings come from the OTHER seed-stage losses:
//     21,686 decimated chain vertices, 507 degenerate-dropped constraints, 1,559 raw junctions
//     merged to 235, 94 jump-class crossings excluded. Then bowFrac moves `edgesCrossingLocus`
//     little or not at all, whatever `bowShortenedPts` reads, and the repair is elsewhere.
//
// COST SIDE, recorded so a "win" cannot be bought silently: the bow rule shortens the ALONG span, so
// points/tris/constraints RISE. A crossing reduction bought with a large point increase is a
// different trade from one bought cheaply, and both get printed.
//
// GUARD: `overCap` and `worstAR` must not degrade. A seed facet born over the AR cap is FROZEN (S1
// refuses its splits), so buying fewer crossings with more over-cap facets is not a win.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE VALIDITY GATE, AND IT IS NOT OPTIONAL
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The standing lesson in this repo is that committed baselines are NOT reproducible and must not be
// A/B'd against directly (project_strata_baselines_not_reproducible; the S45 runner's own header).
// So arm B0 is the CONTROL — bowFrac 0, everything else transcribed from the S47CAV report header —
// and it must reproduce 9,363 / 349,848. THE PROBE PRINTS PASS/FAIL ON THAT FIRST. If the control
// does not reproduce, every comparison below it is VOID and the run has told us the transcription is
// wrong, which is itself worth knowing before an 1,862 s mesher arm is spent.
//
// Seed-only: no refinement loop, no STL, no fidelity verdict. Minutes, not the ~31 min of a mesh arm.
//
// Usage:  bash research/tools/run-s16-bow-ab.sh          (from potfoundry-web/)
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// RESULT — 2026-08-04. *** THE BOW LEVER IS A NO-GO AT THIS CONFIGURATION. H1 REFUTED. ***
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Control reproduces EXACTLY: crossings 9,363 vs 9,363 (+0), edges 349,992 vs 349,848 (+144, 0.04%
// — the ingestion-weld residual this file predicted), seed structure identical in every field.
//
//   arm            bowFrac   bow-shortened   crossings   Δ vs ctl      tris   overCap  worstAR
//   B0 CONTROL       0.00               0        9,363         —    233,062        3    85.13
//   B1               0.25              54        9,335   -28 (-0.3%) 233,340        3    85.13
//   B2 THE ARM       0.50              16        9,341   -22 (-0.2%) 233,079        3    85.13
//   B3               1.00               2        9,353   -10 (-0.1%) 232,960        3    85.13
//
// THE LEVER BARELY FIRES: 54 of 36,173 chain points at its TIGHTEST setting (0.15%), and moves the
// crossing count 0.3%. It cannot be a material source of the 9,363.
//
// WHY IT CANNOT FIRE, and this is the transferable part: `turnBound` 33,321 of 36,237 chain points.
// S19's PF_CB_ALIGNED_TURN_MUL=9 ALREADY shortens the along spacing at 92% of chain points, so by
// the time the bow clause is consulted the span already fits and there is nothing left to shorten.
//
// ⇒ THE S16 HEADER COMMENT IN _strataAlignedSeed.ts:91-98 IS STALE. Its measured "963 -> 3,425" was
//   taken BEFORE S19 rings and the turn rule existed. Treat every measured claim in that file's
//   header as configuration-scoped until re-measured — this probe is how you re-measure one.
//
// ⇒ H0 IS NOW THE STANDING HYPOTHESIS, UNTESTED: the 9,363 come from the other seed-stage losses,
//   all visible in the control row — 21,686 decimated chain vertices, 1,559 raw junctions merged to
//   235, 507 degenerate-dropped constraints, 94 excluded jump-class loci. See s16BowAB's siblings.
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { traceLoci, DEFAULT_TRACE_OPTS } from '../bridge/_strataLocusTrace';
import { locateKinkRaw, dThRaw } from '../bridge/_sweepPredicate';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS, type AlignedSeed } from '../bridge/_strataAlignedSeed';
import { REGION_SCHEMA, type RegionArtifact } from '../bridge/_strataRegionExtract';
import type { SweepPredConst } from '../bridge/_sweepPredicate';
import type { PatchRegion } from '../bridge/_judgeShape';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;

// ── THE CONTROL'S OWN PUBLISHED NUMBERS (S47CAV report header, lines 39-44) ──────────────────────
const EXPECT_CROSSINGS = 9363;
const EXPECT_EDGES = 349848;
const EXPECT_TRIS = 233062;
const EXPECT_ALONG_UM = 1101;
const EXPECT_ACROSS_P50_UM = 50.0;

// ── transcribed from run-s45-lastchance-ab.sh + the driver's env defaults ────────────────────────
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const STYLE = 'GothicArches';
const GU = 200;                  // PF_CB_GRIDU
const GV = 140;                  // PF_CB_GRIDV
const TOL = 0.01;                // PF_CB_TOL
const SHAPE_AR = 50;             // PF_CB_SHAPE_AR default
const AL_PATCH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json';
const AL_PATCH_TOPN = 0;         // PF_CB_ALIGNED_PATCH_TOPN=0 in the runner
const AL_PATCH_IDS = ('0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,'
  + '1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016').split(',');

// `registryDefaults` TRANSCRIBED VERBATIM from _strataConformBisect.test.ts:126 rather than imported
// from _gpuRankBridge, because the two are different functions and the driver uses THIS one. The
// probe's rA must be the driver's rA or nothing below compares to the report.
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

// PF_CB_* predicate constants at their driver defaults (the runner overrides none of them).
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.6 / 1000,
};

const styleParams = { ...registryDefaults(STYLE) };
const rA = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE DRIVER'S OWN CROSSING DETECTOR, transcribed from _strataConformBisect.test.ts:1398-1414.
//
// THE FIRST RUN OF THIS PROBE READ THE WRONG INSTRUMENT AND THE VALIDITY GATE CAUGHT IT. There are
// TWO crossing counters and they are not interchangeable:
//
//   * `seed.stats.edgesCrossingLocus` — the seed BUILDER's internal check. The driver's own comment
//     at :1394 says why it is the weaker one: "self-referential (it tests against the very chains it
//     placed) and would read LOW on a deliberately mistraced seed". Control read 6,777 / 337,186.
//   * `alignedSeedCrossings` — what the S47CAV header's 9,363 / 349,848 ACTUALLY is: the driver's
//     `locateKink` run against the ANALYTIC surface over every live edge, jump-class excluded and
//     the SNAP_ALPHA band excluded. This is the number every downstream claim is about.
//
// Reproducing 9,363 therefore needs THIS enumeration, not the seed builder's. Transcribed verbatim,
// including both exclusions and the canonical direction (locateKink parameterises t from its FIRST
// endpoint, so an undirected edge must be measured in ONE fixed order — see `canonEdge` at :2624).
//
// CAVEAT, stated rather than hidden: the driver runs this AFTER ingesting the seed into its own
// vertex arrays, which applies a 50 nm position weld. This probe runs it on the seed's own arrays.
// If the weld merges any seed vertices the two enumerations differ slightly — so the gate below
// compares against 9,363 and REPORTS the residual instead of asserting equality.
const SNAP_ALPHA = 0.12; // PF_CB_SNAP_ALPHA default
function driverCrossings(seed: AlignedSeed): { cross: number; tested: number } {
  const th = seed.pts.map(([t]) => t);
  const z = seed.pts.map(([, zz]) => zz);
  const seen = new Set<string>();
  let cross = 0; let tested = 0;
  for (const [a, b, c] of seed.tris) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const lo = p < q ? p : q; const hi = p < q ? q : p;   // canonical lo→hi
      const k0 = `${lo},${hi}`;
      if (seen.has(k0)) continue;
      seen.add(k0); tested += 1;
      const kk = locateKinkRaw(rA, th[lo], z[lo], th[lo] + dThRaw(th[lo], th[hi]), z[hi], PRED);
      if (kk === null || kk.jump) continue;
      if (kk.t <= SNAP_ALPHA || kk.t >= 1 - SNAP_ALPHA) continue;
      cross += 1;
    }
  }
  return { cross, tested };
}

log('===== S16 BOW RULE — SEED-ONLY A/B at the S47CAV configuration =====');
log(`params ${JSON.stringify(styleParams)}`);

// ── ONE trace, shared by every arm. The tracer does not read bowFrac, so re-tracing per arm would
// only add ~24 s each and risk a difference the A/B would then misattribute to the lever. ────────
const tTrace = Date.now();
const art = traceLoci(rA, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 400, nv: 280, hRefMm: 0.35 });
const C = art.counts;
log(`trace 400x280 in ${((Date.now() - tTrace) / 1000).toFixed(0)}s — `
  + `${C.loci} components, ${C.polylinePts} points, ${C.totalLengthMm.toFixed(1)} mm total, `
  + `junctions ${C.junctions} (from ${C.rawJunctions} raw), jump-class excluded ${C.jumpExcluded}`);
log('  S47CAV published: 394 components, 11083 points, 6738.2 mm, junctions 235 (from 1559 raw), jump excluded 94');
if (C.loci !== 394 || C.polylinePts !== 11083 || C.junctions !== 235) {
  log('  *** TRACE DOES NOT MATCH THE PUBLISHED HEADER. The seed rows below cannot reproduce S47CAV; ***');
  log('  *** fix this before reading them — a trace difference would be misattributed to the lever.  ***');
}

// ── the S18 patch route, transcribed from the driver's own construction (test.ts:1217-1236) ──────
const regArt = JSON.parse(readFileSync(AL_PATCH, 'utf8')) as RegionArtifact;
if (regArt.schema !== REGION_SCHEMA) {
  throw new Error(`patch artifact schema ${String(regArt.schema)} != ${REGION_SCHEMA}`);
}
const chosen = new Map<number, { id: number; theta: number; z: number; radiusMm: number }>();
for (const r of regArt.regions.slice(0, Math.max(0, AL_PATCH_TOPN))) chosen.set(r.id, r);
for (const idStr of AL_PATCH_IDS) {
  const r = regArt.regions.find((x) => x.id === Number(idStr));
  if (r === undefined) throw new Error(`PATCH_IDS names disk ${idStr}, absent from ${AL_PATCH}`);
  chosen.set(r.id, r);
}
const patchRoute: PatchRegion[] = [...chosen.values()]
  .sort((a, b) => a.id - b.id)
  .map((r) => ({ id: `D${r.id}`, theta: r.theta, z: r.z, radiusMm: r.radiusMm }));
log(`S18 patch route: ${patchRoute.length} regions declared`);
log('');

// ── THE ARMS. ONE VARIABLE: bowFrac. Everything else is byte-identical across rows. ──────────────
const ARMS: Array<{ name: string; bow: number }> = [
  { name: 'B0 CONTROL  bowFrac 0.00  (= S47CAV)', bow: 0 },
  { name: 'B1          bowFrac 0.25', bow: 0.25 },
  { name: 'B2 THE ARM  bowFrac 0.50', bow: 0.5 },
  { name: 'B3          bowFrac 1.00  (context)', bow: 1.0 },
];

interface Row {
  name: string; bow: number; s: AlignedSeed['stats']; secs: number;
  drv: { cross: number; tested: number };
}
const rows: Row[] = [];

for (const arm of ARMS) {
  const t0 = Date.now();
  let rep: { seed: AlignedSeed; roundsUsed: number; banned: number };
  try {
    rep = buildAlignedSeedRepaired(rA, art, {
      // ── verbatim from _strataConformBisect.test.ts:1322-1346, at the runner's env ──
      ...DEFAULT_SEED_OPTS, H, gu: GU, gv: GV,
      alongMul: 1.0,          // PF_CB_ALIGNED_ALONG default
      acrossFrac: 0.35,       // PF_CB_ALIGNED_ACROSS default
      useField: true,         // PF_CB_ALIGNED_FIELD !== '0'
      acrossAbs: true,        // PF_CB_ALIGNED_ACROSS_ABS=1
      acrossMinMm: 0.050,     // PF_CB_ALIGNED_ACROSS_MIN_UM default 50
      seedARmax: 24,          // PF_CB_ALIGNED_SEED_AR default
      bowFrac: arm.bow,       // ← THE ONLY VARIABLE
      patchRoute, patchMaxMm: 1.5, patchSubMax: 16,
      acrossRings: 7,         // PF_CB_ALIGNED_RINGS=7
      acrossGrade: 1.6,       // PF_CB_ALIGNED_RING_GRADE default
      acrossStrideMax: 4,     // PF_CB_ALIGNED_RING_STRIDE_MAX default
      acrossStructured: false,
      acrossStructuredMode: 'full',
      acrossMaxMm: 0.650,     // PF_CB_ALIGNED_RING_MAX_UM default
      turnMul: 9,             // PF_CB_ALIGNED_TURN_MUL=9
      mistraceUm: 0, shapeAR: SHAPE_AR, tolMm: TOL,
    }, 6);                    // PF_CB_ALIGNED_ROUNDS default
  } catch (e) {
    log(`### ${arm.name}\n    THREW: ${(e as Error).message}\n`);
    continue;
  }
  const s = rep.seed.stats;
  const drv = driverCrossings(rep.seed);
  const secs = (Date.now() - t0) / 1000;
  rows.push({ name: arm.name, bow: arm.bow, s, secs, drv });

  log(`### ${arm.name}   (${secs.toFixed(0)} s, rounds ${rep.roundsUsed}, banned ${rep.banned})`);
  log(`    points ${s.points}  tris ${s.tris}  chainPts ${s.chainPts}  offsetPts ${s.offsetPts}  bg ${s.bgKept}`);
  log(`    constraints ${s.constraints}/${s.constraintsRecovered} recovered  conditioned ${s.constraintsConditioned}`
    + `  decimated ${s.decimated}  degenerate-dropped ${s.degenerateDropped}`);
  log(`    spacing: across min ${(s.acrossMinPlacedMm * 1000).toFixed(1)} / p50 ${(s.acrossP50PlacedMm * 1000).toFixed(1)} um`
    + `   acrossBound ${s.acrossBoundPts}  alongBound ${s.alongBoundPts}  turnBound ${s.turnBoundPts}`);
  log(`    *** BOW-shortened chain points: ${s.bowShortenedPts} ***`);
  log(`    census: overCap ${s.overCap}  worstAR ${s.worstAR.toFixed(2)}  worstParAR ${s.worstParAR.toFixed(1)}`);
  log(`    seed-builder (self-referential, the WEAKER instrument) ${s.edgesCrossingLocus} / ${s.edgesTested}`
    + ` (${((100 * s.edgesCrossingLocus) / Math.max(1, s.edgesTested)).toFixed(3)}%)`);
  log(`    >>> DRIVER detector (locateKink vs the ANALYTIC surface — the S47CAV headline)`
    + ` ${drv.cross} / ${drv.tested} (${((100 * drv.cross) / Math.max(1, drv.tested)).toFixed(3)}%) <<<`);
  log('');
}

// ─────────────────────────── THE VALIDITY GATE, READ FIRST ───────────────────────────
const ctl = rows.find((r) => r.bow === 0);
log('══════════════════════════════ VERDICT ══════════════════════════════');
if (ctl === undefined) {
  log('CONTROL ARM DID NOT BUILD. Every comparison is VOID.');
} else {
  // GATE ON THE DRIVER COUNTER — the seed-builder one is a different instrument and 9,363 is not its
  // number. The seed STRUCTURE is checked separately and exactly; only the crossing enumeration is
  // allowed a residual, for the ingestion-weld reason stated at `driverCrossings`.
  const dX = ctl.drv.cross - EXPECT_CROSSINGS;
  const dE = ctl.drv.tested - EXPECT_EDGES;
  const dT = ctl.s.tris - EXPECT_TRIS;
  const structOk = dT === 0 && ctl.s.points === 116931 && ctl.s.constraints === 12806
    && ctl.s.decimated === 21686 && ctl.s.overCap === 3;
  const crossOk = Math.abs(dX) <= 0.01 * EXPECT_CROSSINGS && Math.abs(dE) <= 0.01 * EXPECT_EDGES;
  log(`CONTROL vs the S47CAV report header:`);
  log(`   SEED STRUCTURE (must be exact):`);
  log(`      points ${ctl.s.points} vs 116931   tris ${ctl.s.tris} vs ${EXPECT_TRIS} (${dT >= 0 ? '+' : ''}${dT})`
    + `   constraints ${ctl.s.constraints} vs 12806   decimated ${ctl.s.decimated} vs 21686   overCap ${ctl.s.overCap} vs 3`);
  log(`      along ~${EXPECT_ALONG_UM} um / across p50 ${(ctl.s.acrossP50PlacedMm * 1000).toFixed(1)} vs ${EXPECT_ACROSS_P50_UM} um`);
  log(`      ⇒ ${structOk ? 'REPRODUCES' : '*** DOES NOT REPRODUCE ***'}`);
  log(`   CROSSINGS, driver detector (≤1% residual allowed — ingestion weld):`);
  log(`      crossings ${ctl.drv.cross} vs ${EXPECT_CROSSINGS}   (${dX >= 0 ? '+' : ''}${dX}`
    + `, ${((100 * dX) / EXPECT_CROSSINGS).toFixed(2)}%)`);
  log(`      edges     ${ctl.drv.tested} vs ${EXPECT_EDGES}   (${dE >= 0 ? '+' : ''}${dE}`
    + `, ${((100 * dE) / EXPECT_EDGES).toFixed(2)}%)`);
  log(`      ⇒ ${crossOk ? 'REPRODUCES' : '*** DOES NOT REPRODUCE ***'}`);
  log(`   for reference, the seed builder's own weaker counter: ${ctl.s.edgesCrossingLocus} / ${ctl.s.edgesTested}`);
  log('');
  log(structOk && crossOk
    ? '⇒ CONTROL REPRODUCES. The comparison below is valid.'
    : '⇒ *** CONTROL DOES NOT REPRODUCE — THE COMPARISON BELOW IS VOID. ***\n'
      + '    Fix the transcription before reading any treatment row. Do NOT quote a delta from this run.');
  log('');
  log('arm                                  crossings      %    Δ vs ctl   bow-short   points     tris   overCap  worstAR');
  for (const r of rows) {
    const pct = (100 * r.drv.cross) / Math.max(1, r.drv.tested);
    const d = r.drv.cross - ctl.drv.cross;
    const rel = ctl.drv.cross === 0 ? 0 : (100 * d) / ctl.drv.cross;
    log(`${r.name.padEnd(36)} ${String(r.drv.cross).padStart(7)} ${pct.toFixed(3).padStart(7)}%`
      + ` ${(d === 0 ? '—' : `${d > 0 ? '+' : ''}${d} (${rel > 0 ? '+' : ''}${rel.toFixed(1)}%)`).padStart(18)}`
      + ` ${String(r.s.bowShortenedPts).padStart(10)} ${String(r.s.points).padStart(9)}`
      + ` ${String(r.s.tris).padStart(8)} ${String(r.s.overCap).padStart(8)} ${r.s.worstAR.toFixed(2).padStart(8)}`);
  }
  log('');
  log('READ IT LIKE THIS:');
  log('  bow-short LARGE and crossings DOWN  ⇒ H1: the ring-chord cut is the dominant source.');
  log('                                        Next: price the point cost, then one mesher arm.');
  log('  bow-short LARGE and crossings FLAT  ⇒ H0: the rule binds but is not the cause. The 9,363');
  log('                                        come from decimation / junction merges / excluded');
  log('                                        jump loci. Repair there, not here.');
  log('  bow-short ~0                        ⇒ the rule never binds at this along/across ratio.');
  log('                                        Neither hypothesis is tested. Check `turnBound` FIRST:');
  log('                                        S19 TURN_MUL already shortens the along span, and where');
  log('                                        it binds the bow has nothing left to shorten. (2026-08-04:');
  log('                                        this is what happened — turnBound 33,321 of 36,237 pts.)');
}

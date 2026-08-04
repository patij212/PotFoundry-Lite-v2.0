// s31H0AB.ts — H0: WHERE THE 9,363 CREASE-CROSSING SEED EDGES ACTUALLY COME FROM.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// STANDING ON
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2026-08-04, commit 181e6962: the BOW lever (`bowFrac`) is a NO-GO — it moves the crossing count
// 0.3% and barely fires (54 of 36,173 chain points), because S19's TURN_MUL=9 already shortens the
// along spacing at 92% of chain points. See research/tools/s16BowAB.ts's RESULT block.
//
// That leaves H0, which s16BowAB registered but did not test: the crossings come from the OTHER
// seed-stage losses, all printed in the S47CAV control row:
//
//     decimated 21,686 chain vertices        ← direction D below
//     junctions 235 clustered from 1,559 raw ← direction J below
//     degenerate-dropped 507 constraints
//     jump-class loci excluded 94
//
// This probe tests the two largest, each as its own single-variable family.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DIRECTION D — DECIMATION.  `chainDecimateMm`, driver env PF_CB_ALIGNED_DECIMATE_UM.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// _strataAlignedSeed.ts:965-976 drops any chain vertex within `chainDecimateMm` of its kept
// predecessor. Default is `minSepMm` = max(weldMm*4, acrossBase*0.5) = 192.6 um at this config, and
// the builder REFUSES a value above minSep — so this knob only goes DOWN (less decimation).
//
// MECHANISM UNDER TEST. Every dropped vertex makes the chain go straight from its neighbours over a
// doubled span. The builder's own comment at :941-944 says this can CREATE crossings ("dropping a
// vertex makes the chain go straight from its neighbours, and that new segment can cross a chain it
// did not cross before" — measured: one constraint of 1,515 unrecoverable, crossed by another that
// decimation had re-introduced). D asks whether that mechanism is material at population scale.
//
// PREDICTION IF D IS THE CAUSE: crossings fall monotonically as chainDecimateMm falls, and
// `decimated` falls with it. Cost: chainPts and tris RISE — the seed gets denser along every chain.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DIRECTION J — JUNCTION CLUSTERING.  `junctionMergeMm`, a TRACE option (default 2.0 mm).
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// MECHANISM UNDER TEST, and it is the one that predicts the OBSERVED LOCATION of the defect. The
// seed consumes junction disks at :1334-1346 to SUPPRESS OFFSET RINGS inside them — inside a disk no
// offset point is placed, so nothing constrains the triangulation there. `radiusMm` grows with the
// cluster's spread, so a LARGER merge radius makes FEWER, BIGGER unconstrained holes, centred
// exactly where loci cross. On GothicArches that is the arch apex — which is where the reported
// micro-serrations are.
//
// PREDICTION IF J IS THE CAUSE: crossings fall as junctionMergeMm falls, and the fall concentrates
// where disks shrink.
//
// ⚠ J HAS A KNOWN FAILURE MODE AT SMALL RADII AND IT IS NOT A COST, IT IS A WRONG ANSWER.
// _strataLocusTrace.ts:116-119: "Un-clustered, the same X reported 917 junctions for 40 true ones".
// A J arm whose junction count EXPLODES is measuring phantom junctions, not real ones, and its
// crossing number must NOT be read as a win. The probe prints junctions/rawJunctions on every J row
// and flags any arm that more than doubles the control's count. Read that flag before the deltas.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// INSTRUMENT AND GATE — inherited from s16BowAB, and it is the validated one
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Crossings are measured with the DRIVER's detector (locateKink vs the ANALYTIC surface, jump-class
// excluded, SNAP_ALPHA band excluded, canonical lo->hi), NOT the seed builder's self-referential
// counter. Those are different instruments and 9,363 is the driver's; s16BowAB's first run voided
// itself on exactly that confusion. Each family's control must reproduce the S47CAV header, and the
// probe prints VOID over the family if it does not.
//
// Seed-stage only. D shares one trace; J re-traces per arm (~18 s each) because the knob IS a trace
// option. Whole run ~25 min against ~31 min for a SINGLE mesher arm.
//
// Usage:  bash research/tools/run-s31-h0-ab.sh          (from potfoundry-web/)
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// RESULT — 2026-08-04. *** BOTH DIRECTIONS REFUTED. THE CROSSING RATE IS AN INVARIANT. ***
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Both controls reproduce S47CAV exactly (9,363 crossings; 116,931 pts / 233,062 tris / 12,806
// constraints / 21,686 decimated / 235 junctions). Both families VALID.
//
//   D  chainDecimateMm   192.6 ctl   96.3        48.2        10.0 um
//      crossings              9,363  11,762     14,160      14,304
//      tris                 233,062 288,238    362,542     406,420
//      RATE                  2.675%  2.718%     2.602%      2.345%
//
//   J  junctionMergeMm     2.00 ctl    1.00        0.50        0.25 mm
//      crossings              9,363   9,197       9,099       9,091
//      junctions                 235     387         620 ⚠       923 ⚠
//      RATE                  2.675%  2.677%      2.711%      2.721%
//
// ⚠ READ THE RATE, NOT THE COUNT — AND THAT IS A DESIGN DEFECT IN THIS PROBE'S OWN TABLE. The Δ
// column reports ABSOLUTE crossings, which is not comparable across arms whose `edgesTested` spans
// 1.74x (D) because the seed itself grows. Normalised, D's apparent "+52.8%" is a FLAT rate and J's
// apparent "-2.8%" is a slightly WORSE one. Print the rate in any successor to this file.
//
// D: turning decimation off grows the seed 1.74x (every retained chain vertex gets its own offset
//    rings) and leaves the rate flat. The builder's :941 warning is real but immaterial at scale.
// J: the absolute fall is bought by a SHRINKING seed; the rate rises. The -2.8% and -2.9% arms both
//    tripped the phantom-junction guard (620 and 923 junctions from the same 1,559 raw crossings —
//    _strataLocusTrace.ts:116's known failure), so neither is a win.
//
// ⇒ TWELVE ARMS ACROSS THREE INDEPENDENT SEED KNOBS (+ bowFrac, commit 181e6962) AND THE RATE WILL
//   NOT LEAVE 2.3-2.7%, through a 1.74x change in seed size and a 3.93x change in junction count.
//   STOP SWEEPING SEED PARAMETERS — this is not a tuning residual.
//
// WHY, answered by the sibling probe `s31CrossLocality.ts` (same day): the crossings are REAL creases
// (ratio spike at 0.25) sitting ON the loci (p50 8.4 um), and 88.4% have EXACTLY ONE endpoint on a
// constraint — edges radiating from a chain vertex that re-cross the curved locus. Splitting one at
// the locus creates a new on-locus vertex whose own edges do the same. The population is a FIXED
// POINT of edge bisection, so no seed knob and no refinement lever can move its rate.
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { traceLoci, DEFAULT_TRACE_OPTS, type LocusArtifact } from '../bridge/_strataLocusTrace';
import { locateKinkRaw, dThRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS, type AlignedSeed } from '../bridge/_strataAlignedSeed';
import { REGION_SCHEMA, type RegionArtifact } from '../bridge/_strataRegionExtract';
import type { PatchRegion } from '../bridge/_judgeShape';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;

// ── S47CAV published control values ──────────────────────────────────────────────────────────────
const EXPECT_CROSSINGS = 9363;
const EXPECT_EDGES = 349848;   // probe reads 349,992 (+0.04%) — the driver's ingestion weld, allowed
const EXPECT_TRIS = 233062;
const EXPECT_POINTS = 116931;
const EXPECT_CONSTRAINTS = 12806;
const EXPECT_DECIMATED = 21686;
const EXPECT_JUNCTIONS = 235;

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const STYLE = 'GothicArches';
const AL_PATCH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json';
const AL_PATCH_IDS = ('0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,'
  + '1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016').split(',');
const SNAP_ALPHA = 0.12;

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

const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.6 / 1000,
};

const styleParams = { ...registryDefaults(STYLE) };
const rA = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);

/** THE DRIVER'S detector, transcribed from _strataConformBisect.test.ts:1398-1414. Validated: the
 *  S47CAV control reproduces 9,363 EXACTLY through this function (s16BowAB, 2026-08-04). */
function driverCrossings(seed: AlignedSeed): { cross: number; tested: number } {
  const th = seed.pts.map(([t]) => t);
  const z = seed.pts.map(([, zz]) => zz);
  const seen = new Set<string>();
  let cross = 0; let tested = 0;
  for (const [a, b, c] of seed.tris) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const lo = p < q ? p : q; const hi = p < q ? q : p;
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

const regArt = JSON.parse(readFileSync(AL_PATCH, 'utf8')) as RegionArtifact;
if (regArt.schema !== REGION_SCHEMA) throw new Error(`patch schema ${String(regArt.schema)} != ${REGION_SCHEMA}`);
const chosen = new Map<number, { id: number; theta: number; z: number; radiusMm: number }>();
for (const idStr of AL_PATCH_IDS) {
  const r = regArt.regions.find((x) => x.id === Number(idStr));
  if (r === undefined) throw new Error(`PATCH_IDS names disk ${idStr}, absent from ${AL_PATCH}`);
  chosen.set(r.id, r);
}
const patchRoute: PatchRegion[] = [...chosen.values()].sort((a, b) => a.id - b.id)
  .map((r) => ({ id: `D${r.id}`, theta: r.theta, z: r.z, radiusMm: r.radiusMm }));

/** the S47CAV seed call, verbatim from _strataConformBisect.test.ts:1322-1346. */
function buildSeed(art: LocusArtifact, over: { chainDecimateMm?: number }): {
  seed: AlignedSeed; roundsUsed: number; banned: number;
} {
  return buildAlignedSeedRepaired(rA, art, {
    ...DEFAULT_SEED_OPTS, H, gu: 200, gv: 140,
    alongMul: 1.0, acrossFrac: 0.35, useField: true,
    acrossAbs: true, acrossMinMm: 0.050, seedARmax: 24, bowFrac: 0,
    patchRoute, patchMaxMm: 1.5, patchSubMax: 16,
    acrossRings: 7, acrossGrade: 1.6, acrossStrideMax: 4,
    acrossStructured: false, acrossStructuredMode: 'full',
    acrossMaxMm: 0.650, turnMul: 9,
    mistraceUm: 0, shapeAR: 50, tolMm: 0.01,
    ...over,
  }, 6);
}

function trace(junctionMergeMm: number): LocusArtifact {
  return traceLoci(rA, {
    ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 400, nv: 280, hRefMm: 0.35, junctionMergeMm,
  });
}

interface Row {
  name: string; lever: string;
  s: AlignedSeed['stats']; drv: { cross: number; tested: number };
  junctions: number; rawJunctions: number; secs: number; isCtl: boolean;
}

function report(row: Row): void {
  const s = row.s;
  log(`### ${row.name}   (${row.secs.toFixed(0)} s)`);
  log(`    points ${s.points}  tris ${s.tris}  chainPts ${s.chainPts}  offsetPts ${s.offsetPts}`
    + `  constraints ${s.constraints}/${s.constraintsRecovered}  decimated ${s.decimated}`
    + `  degenerate-dropped ${s.degenerateDropped}`);
  log(`    junctions ${row.junctions} (from ${row.rawJunctions} raw)`
    + `   census: overCap ${s.overCap}  worstAR ${s.worstAR.toFixed(2)}`);
  log(`    >>> DRIVER crossings ${row.drv.cross} / ${row.drv.tested}`
    + ` (${((100 * row.drv.cross) / Math.max(1, row.drv.tested)).toFixed(3)}%) <<<`);
  log('');
}

function verdict(title: string, rows: Row[], leverHdr: string): void {
  log(`══════════════ ${title} ══════════════`);
  const ctl = rows.find((r) => r.isCtl);
  if (ctl === undefined) { log('CONTROL DID NOT BUILD — family VOID.\n'); return; }
  const structOk = ctl.s.tris === EXPECT_TRIS && ctl.s.points === EXPECT_POINTS
    && ctl.s.constraints === EXPECT_CONSTRAINTS && ctl.s.decimated === EXPECT_DECIMATED
    && ctl.junctions === EXPECT_JUNCTIONS;
  const dX = ctl.drv.cross - EXPECT_CROSSINGS;
  const crossOk = Math.abs(dX) <= 0.01 * EXPECT_CROSSINGS;
  log(`CONTROL vs S47CAV: tris ${ctl.s.tris}/${EXPECT_TRIS}  points ${ctl.s.points}/${EXPECT_POINTS}`
    + `  constraints ${ctl.s.constraints}/${EXPECT_CONSTRAINTS}  decimated ${ctl.s.decimated}/${EXPECT_DECIMATED}`
    + `  junctions ${ctl.junctions}/${EXPECT_JUNCTIONS}  ⇒ ${structOk ? 'REPRODUCES' : '*** NO ***'}`);
  log(`           crossings ${ctl.drv.cross} vs ${EXPECT_CROSSINGS} (${dX >= 0 ? '+' : ''}${dX})`
    + `  ⇒ ${crossOk ? 'REPRODUCES' : '*** NO ***'}`);
  log(structOk && crossOk ? '⇒ VALID.' : '⇒ *** FAMILY VOID — do not quote a delta from these rows. ***');
  log('');
  log(`${leverHdr.padEnd(26)} crossings       Δ vs ctl   decimated  junctions   chainPts     tris  overCap`);
  for (const r of rows) {
    const d = r.drv.cross - ctl.drv.cross;
    const rel = ctl.drv.cross === 0 ? 0 : (100 * d) / ctl.drv.cross;
    const phantom = !r.isCtl && r.junctions > 2 * ctl.junctions ? '  ⚠PHANTOM' : '';
    log(`${r.lever.padEnd(26)} ${String(r.drv.cross).padStart(9)}`
      + ` ${(r.isCtl ? '—' : `${d > 0 ? '+' : ''}${d} (${rel > 0 ? '+' : ''}${rel.toFixed(1)}%)`).padStart(15)}`
      + ` ${String(r.s.decimated).padStart(11)} ${String(r.junctions).padStart(10)}`
      + ` ${String(r.s.chainPts).padStart(10)} ${String(r.s.tris).padStart(8)}`
      + ` ${String(r.s.overCap).padStart(8)}${phantom}`);
  }
  log('');
}

log('===== S31 H0 — WHERE THE 9,363 CREASE-CROSSING SEED EDGES COME FROM =====');
log(`params ${JSON.stringify(styleParams)}`);
log('');

// ═══════════════════ DIRECTION D — DECIMATION (one shared trace) ═══════════════════
log('┌─────────────────────────────────────────────────────────────────────────────┐');
log('│ DIRECTION D — DECIMATION (chainDecimateMm). Trace is SHARED across D arms.   │');
log('└─────────────────────────────────────────────────────────────────────────────┘');
const t0 = Date.now();
const artD = trace(DEFAULT_TRACE_OPTS.junctionMergeMm);
log(`trace (merge ${DEFAULT_TRACE_OPTS.junctionMergeMm} mm) in ${((Date.now() - t0) / 1000).toFixed(0)}s — `
  + `${artD.counts.loci} components, ${artD.counts.polylinePts} points, `
  + `junctions ${artD.counts.junctions} (from ${artD.counts.rawJunctions} raw)`);
log('');

// minSepMm = max(weldMm*4, acrossBase*0.5) = 192.6 um here; the builder REFUSES anything above it.
const D_ARMS: Array<{ name: string; um: number | undefined }> = [
  { name: 'D0 CONTROL  default (= minSep 192.6 um)', um: undefined },
  { name: 'D1          96.3 um  (half)', um: 96.3 },
  { name: 'D2          48.2 um  (quarter)', um: 48.2 },
  { name: 'D3          10.0 um  (near-off)', um: 10.0 },
];
const dRows: Row[] = [];
for (const arm of D_ARMS) {
  const tA = Date.now();
  try {
    const rep = buildSeed(artD, arm.um === undefined ? {} : { chainDecimateMm: arm.um / 1000 });
    const row: Row = {
      name: arm.name, lever: arm.um === undefined ? 'default 192.6 um' : `${arm.um.toFixed(1)} um`,
      s: rep.seed.stats, drv: driverCrossings(rep.seed),
      junctions: artD.counts.junctions, rawJunctions: artD.counts.rawJunctions,
      secs: (Date.now() - tA) / 1000, isCtl: arm.um === undefined,
    };
    dRows.push(row); report(row);
  } catch (e) { log(`### ${arm.name}\n    THREW: ${(e as Error).message}\n`); }
}
verdict('DIRECTION D — DECIMATION', dRows, 'chainDecimateMm');

// ═══════════════════ DIRECTION J — JUNCTION CLUSTERING (re-trace per arm) ═══════════════════
log('┌─────────────────────────────────────────────────────────────────────────────┐');
log('│ DIRECTION J — JUNCTION CLUSTERING (junctionMergeMm). RE-TRACES per arm.      │');
log('│ Junction disks SUPPRESS offset rings (_strataAlignedSeed.ts:1334-1346), so a │');
log('│ bigger merge radius = fewer, BIGGER unconstrained holes at locus crossings.  │');
log('│ ⚠ Small radii produce PHANTOM junctions (trace:116). Read the flag first.    │');
log('└─────────────────────────────────────────────────────────────────────────────┘');
const J_ARMS: Array<{ name: string; mm: number }> = [
  { name: 'J0 CONTROL  2.00 mm (= S47CAV)', mm: 2.0 },
  { name: 'J1          1.00 mm', mm: 1.0 },
  { name: 'J2          0.50 mm', mm: 0.5 },
  { name: 'J3          0.25 mm  (context — expect phantoms)', mm: 0.25 },
];
const jRows: Row[] = [];
for (const arm of J_ARMS) {
  const tA = Date.now();
  try {
    const art = arm.mm === 2.0 ? artD : trace(arm.mm);
    const rep = buildSeed(art, {});
    const row: Row = {
      name: arm.name, lever: `${arm.mm.toFixed(2)} mm`,
      s: rep.seed.stats, drv: driverCrossings(rep.seed),
      junctions: art.counts.junctions, rawJunctions: art.counts.rawJunctions,
      secs: (Date.now() - tA) / 1000, isCtl: arm.mm === 2.0,
    };
    jRows.push(row); report(row);
  } catch (e) { log(`### ${arm.name}\n    THREW: ${(e as Error).message}\n`); }
}
verdict('DIRECTION J — JUNCTION CLUSTERING', jRows, 'junctionMergeMm');

log('READ IT LIKE THIS:');
log('  D crossings fall monotonically with chainDecimateMm  ⇒ decimation is a real source. Price the');
log('    chainPts/tris cost, then ONE mesher arm at the cheapest setting that captures most of it.');
log('  J crossings fall AND junctions stay near 235          ⇒ the suppressed-ring holes are a real');
log('    source, and it is the hypothesis that predicts the observed LOCATION (arch apexes).');
log('  J crossings fall BUT ⚠PHANTOM fires                   ⇒ measuring phantom junctions. NOT a win.');
log('  BOTH flat                                            ⇒ neither is material. The remaining');
log('    candidates are the 507 degenerate-dropped constraints and the 94 excluded jump-class loci,');
log('    and at that point the honest read is that the seed CANNOT carry the contract at this density.');

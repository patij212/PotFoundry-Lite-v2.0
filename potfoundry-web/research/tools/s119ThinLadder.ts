// s119ThinLadder.ts — S119 TASK 2. The SCALE-FREE THIN LADDER, one rung.
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS AND WHAT IT IS NOT
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// It is s118ThinCensus's question asked properly, on a DENSITY LADDER of DRIVER meshes:
//   * ABSOLUTE needle bar   arc minAlt < B um, B SWEPT (0.5 / 1 / 2 / 5)
//   * SCALE-FREE thin bar   arc minAlt / longest arc edge < tau, tau SWEPT (0.005 / 0.01 / 0.02 / 0.05 / 0.10)
//   * DEGENERACY POLES      graphRatio = 3Darea / |arc-space area| >= C, C SWEPT (10 / 30 / 100 / 300 / 1e3 / 1e4)
// and every one of them as COUNT + AREA-share + MAX-PER-FACET, never a bare count and never a bare max.
//
// It READS the STL the driver wrote. It seeds nothing, refines nothing, replaces nothing.
//
// ── FOUR THINGS S118's CENSUS DID NOT DO, AND WHY THEY ARE HERE ─────────────────────────────────────
// 1. NO STRIDE (instrument scar 5). s118ThinCensus took its distributions on a 1-in-37 stride. Every
//    number below — counts, areas, maxima, QUANTILES — is over every facet: quantiles come from a full
//    sort of a per-facet Float64Array. The one bounded scan in the file is the cliff adjudication, and
//    its BOUND and its ADJUDICATION RATE are printed.
// 2. THE CLIFF SPLIT (S119 task 3: STOP SCORING CLIFF FACETS AGAINST THE GRAPH OF rA). `graphRatio`
//    blows up for two unrelated reasons: (a) a WALL facet the driver drove to a degenerate parametric
//    footprint — a real defect; (b) a facet that SPANS the radius jump — a tread / curtain. (b) is not a
//    graph over (theta, z) at all, so a ruler built on that graph has no points inside the jump and
//    convicting it is a category error. Every class is therefore reported split two ways:
//      - dRmm = max|r| - min|r| over the corners, a cheap swept PROXY, exhaustive over the mesh;
//      - and, on the flagged population only, an EXACT adjudication that runs the DRIVER'S OWN C0
//        classifier (`locateKinkRaw` with the driver's kinkScan/kinkHalvings/kinkRatio/jumpRatio) along
//        the facet's three (theta,z) edges against the style's own rA. `jump === true` on any edge means
//        the facet straddles a genuine C0 cliff.
// 3. THE FULL CROSS-TAB. Not one hard-coded tau: the needle class at EVERY bar crossed against the thin
//    class at EVERY tau, in COUNT and in AREA, so "merely small" vs "genuinely degenerate" is a published
//    table rather than one number that happens to be quotable.
// 4. A FIXTURE-VALIDATED CLASSIFIER. The per-facet maths lives in s119LadderLib and is planted-defect
//    tested two-sidedly by research/bridge/_s119LadderValidate.test.ts (6/6).
//
// Emits a human report on stdout and machine-readable JSON (PF_S119_JSON) for the alpha fit.
//
// Usage: node research/bridge/out/_run_s119ThinLadder.cjs
//   env PF_S119_STL(abs, required) PF_S119_TAG PF_S119_JSON(abs) PF_S119_STYLE PF_S119_ADJ(0|1)
import { writeFileSync } from 'node:fs';
import { locateKinkRaw, canonTheta, type SweepPredConst } from '../bridge/_sweepPredicate';
import { buildRadiusFn } from '../bridge/runStyle';
import type { StyleId } from '../../src/styles/registry';
import { classifyFacet } from './s119LadderLib';
import { readMeshF32 } from './s118MeshIo';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STL = envS('PF_S119_STL', '');
const TAG = envS('PF_S119_TAG', 'RUN');
const JSONOUT = envS('PF_S119_JSON', '');
const STYLE = envS('PF_S119_STYLE', 'CelticTriquetra');
const ADJ = envS('PF_S119_ADJ', '1') === '1';
const BARS = envS('PF_S119_BARS', '0.5,1,2,5').split(',').map(Number);
const TAUS = envS('PF_S119_TAUS', '0.005,0.01,0.02,0.05,0.1').split(',').map(Number);
const POLES = envS('PF_S119_POLES', '10,30,100,300,1000,10000').split(',').map(Number);
const DRCUTS = envS('PF_S119_DRCUTS', '0.02,0.1,0.5,1,1.72').split(',').map(Number);
const DRJUMP = envF('PF_S119_DRJUMP_MM', 0.5);
// the adjudicated set: union of the three HEADLINE classes. Loosening these widens the bound, not the rate.
const ADJ_BAR = envF('PF_S119_ADJ_BAR', 2);
const ADJ_TAU = envF('PF_S119_ADJ_TAU', 0.02);
const ADJ_POLE = envF('PF_S119_ADJ_POLE', 100);
if (STL.length === 0) { log('*** PF_S119_STL required ***'); process.exit(2); }

const T0 = Date.now();
log('═════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S119 THIN LADDER — one rung.   tag ${TAG}   style ${STYLE} =====`);
log('═════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh ${STL}`);
log(`EXHAUSTIVE: every facet, no stride, no cap, for every count/area/max/quantile below.`);

const { xyz, nTri } = readMeshF32(STL);

const fArea = new Float64Array(nTri);
const fAlt = new Float64Array(nTri);   // arc min altitude, um
const fThin = new Float64Array(nTri);  // arc minAlt / longest arc edge
const fGR = new Float64Array(nTri);    // graphRatio
const fDR = new Float64Array(nTri);    // radius spread, mm

let area3 = 0;
let minAlt = Infinity; let minThin = Infinity; let maxGR = 0; let nonFinGR = 0;
let minEdgeArc = Infinity; let minEdge3 = Infinity;
let invC = 0; let invA = 0; let maxDR = 0;

for (let f = 0; f < nTri; f += 1) {
  const b = f * 9;
  const g = classifyFacet(
    xyz[b], xyz[b + 1], xyz[b + 2],
    xyz[b + 3], xyz[b + 4], xyz[b + 5],
    xyz[b + 6], xyz[b + 7], xyz[b + 8],
  );
  area3 += g.area;
  fArea[f] = g.area; fAlt[f] = g.minAltUm; fThin[f] = g.thinRatio; fGR[f] = g.graphRatio; fDR[f] = g.dRmm;
  if (g.apsSign < 0) { invC += 1; invA += g.area; }
  if (Number.isFinite(g.graphRatio)) { if (g.graphRatio > maxGR) maxGR = g.graphRatio; } else nonFinGR += 1;
  if (g.dRmm > maxDR) maxDR = g.dRmm;
  if (g.minAltUm < minAlt) minAlt = g.minAltUm;
  if (g.thinRatio < minThin) minThin = g.thinRatio;
  if (g.minArcEdgeMm < minEdgeArc) minEdgeArc = g.minArcEdgeMm;
  if (g.minEdge3Mm < minEdge3) minEdge3 = g.minEdge3Mm;
}

const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(6) : 'n/a');

interface Cls { c: number; a: number; maxA: number; cW: number; aW: number; maxAW: number; cJ: number; aJ: number }
function tally(pred: (f: number) => boolean): Cls {
  let c = 0, a = 0, maxA = 0, cW = 0, aW = 0, maxAW = 0, cJ = 0, aJ = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (!pred(f)) continue;
    c += 1; a += fArea[f]; if (fArea[f] > maxA) maxA = fArea[f];
    if (fDR[f] >= DRJUMP) { cJ += 1; aJ += fArea[f]; } else { cW += 1; aW += fArea[f]; if (fArea[f] > maxAW) maxAW = fArea[f]; }
  }
  return { c, a, maxA, cW, aW, maxAW, cJ, aJ };
}
const row = (label: string, k: Cls): string =>
  `   ${label.padStart(9)}  ${k.c.toLocaleString().padStart(12)}  ${pct(k.c, nTri).padStart(11)}%  ${k.a.toFixed(5).padStart(13)}  ${pct(k.a, area3).padStart(11)}%  ${k.maxA.toExponential(3).padStart(11)}  ${k.cW.toLocaleString().padStart(12)}  ${k.aW.toExponential(3).padStart(10)}  ${k.cJ.toLocaleString().padStart(10)}`;
const HEAD = `   ${'bar'.padStart(9)}  ${'count'.padStart(12)}  ${'%count'.padStart(12)}  ${'area mm2'.padStart(13)}  ${'%MESHarea'.padStart(12)}  ${'maxFacetA'.padStart(11)}  ${'cnt dR<cut'.padStart(12)}  ${'area dR<'.padStart(10)}  ${'cnt dR>='.padStart(10)}`;

const sorted = (src: Float64Array): Float64Array => { const s = Float64Array.from(src); s.sort(); return s; };
const qOf = (s: Float64Array, p: number): number => (s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))]);

log(`facets ${nTri.toLocaleString()}   3D area ${area3.toFixed(4)} mm2   mean facet area ${(area3 / nTri).toExponential(4)} mm2`);
log('');
log(`── (0) RADIUS-SPREAD LADDER (the cheap cliff proxy; the exact adjudication is section 8) ──`);
log(`   max dR over facets ${maxDR.toFixed(6)} mm`);
for (const c of DRCUTS) {
  let n = 0; let a = 0;
  for (let f = 0; f < nTri; f += 1) if (fDR[f] >= c) { n += 1; a += fArea[f]; }
  log(`   dR >= ${c.toString().padStart(6)} mm : ${n.toLocaleString().padStart(12)} facets (${pct(n, nTri).padStart(11)}%)  ${a.toFixed(4).padStart(12)} mm2 = ${pct(a, area3).padStart(11)}% of area`);
}
log(`   >>> the wall/jump split printed in every table below uses dR >= ${DRJUMP} mm <<<`);
log('');

log(`── (1) ABSOLUTE NEEDLE — arc min altitude < B um. A SIZE test: a well-shaped facet crosses it by shrinking. ──`);
log(HEAD);
const ndl = BARS.map((B) => tally((f) => fAlt[f] < B));
BARS.forEach((B, i) => log(row(`${B} um`, ndl[i])));
log('');

log(`── (2) SCALE-FREE THIN — arc minAlt / longest arc edge < tau. A SHAPE test, invariant to size. ──`);
log(`   reference values: EQUILATERAL 0.866, right-isoceles 0.5, the seed grid 0.5.`);
log(HEAD);
const thin = TAUS.map((t) => tally((f) => fThin[f] < t));
TAUS.forEach((t, i) => log(row(`${t}`, thin[i])));
log('');

log(`── (3) DEGENERACY POLES — graphRatio = 3D area / |arc-space area| >= C. ──`);
log(HEAD);
const pole = POLES.map((C) => tally((f) => fGR[f] >= C));
POLES.forEach((C, i) => log(row(`>=${C}`, pole[i])));
log(`   mesh MAX finite graphRatio ${maxGR.toExponential(4)}   arc area EXACTLY 0 (non-finite ratio): ${nonFinGR.toLocaleString()}`);
log('');

log('── (4) CROSS-TABULATION — "merely small" vs "genuinely degenerate", every bar x every tau ──');
log('   Of the facets the ABSOLUTE bar convicts, what share (COUNT and AREA) ALSO fails the scale-free bar?');
log(`   ${'B um'.padStart(6)} ${'tau'.padStart(7)} ${'N(needle)'.padStart(11)} ${'N(&thin)'.padStart(10)} ${'%cnt thin'.padStart(10)} ${'%cnt MERELY SMALL'.padStart(18)} ${'A(needle)'.padStart(12)} ${'A(&thin)'.padStart(12)} ${'%area MERELY SMALL'.padStart(19)}`);
const xtab: Array<{ bar: number; tau: number; nN: number; nT: number; aN: number; aT: number }> = [];
for (const B of BARS) {
  for (const t of TAUS) {
    let nN = 0, aN = 0, nT = 0, aT = 0;
    for (let f = 0; f < nTri; f += 1) {
      if (fAlt[f] >= B) continue;
      nN += 1; aN += fArea[f];
      if (fThin[f] < t) { nT += 1; aT += fArea[f]; }
    }
    xtab.push({ bar: B, tau: t, nN, nT, aN, aT });
    log(`   ${B.toString().padStart(6)} ${t.toString().padStart(7)} ${nN.toLocaleString().padStart(11)} ${nT.toLocaleString().padStart(10)} ${pct(nT, Math.max(1, nN)).padStart(9)}% ${pct(nN - nT, Math.max(1, nN)).padStart(17)}% ${aN.toExponential(4).padStart(12)} ${aT.toExponential(4).padStart(12)} ${pct(aN - aT, Math.max(1e-300, aN)).padStart(18)}%`);
  }
}
log('');

log('── (5) EXHAUSTIVE DISTRIBUTIONS (full sort of every facet; NO stride) ──');
const sAlt = sorted(fAlt); const sThin = sorted(fThin); const sArea = sorted(fArea);
const qs = [0, 0.001, 0.01, 0.1, 0.5, 0.9, 0.99, 0.999];
log(`   ${'quantile'.padStart(9)} ${'minAlt um'.padStart(14)} ${'shape ratio'.padStart(14)} ${'facet area mm2'.padStart(16)}`);
for (const p of qs) log(`   ${p.toString().padStart(9)} ${qOf(sAlt, p).toExponential(5).padStart(14)} ${qOf(sThin, p).toExponential(5).padStart(14)} ${qOf(sArea, p).toExponential(5).padStart(16)}`);
log(`   MESH MIN arc altitude ${minAlt.toExponential(6)} um (${(minAlt * 1000).toFixed(4)} nm)   MESH MIN shape ratio ${minThin.toExponential(6)}`);
log(`   MESH MAX facet area ${sArea[nTri - 1].toExponential(5)} mm2`);
log('');

log('── (6) AREA DISTRIBUTION *OF THE FLAGGED CLASS* — is the needle class the small tail, or is it everywhere? ──');
const clsAreaQ: Record<string, number[]> = {};
for (const [name, pred] of [
  [`needle@${ADJ_BAR}um`, (f: number) => fAlt[f] < ADJ_BAR],
  [`thin@${ADJ_TAU}`, (f: number) => fThin[f] < ADJ_TAU],
  [`pole>=${ADJ_POLE}`, (f: number) => fGR[f] >= ADJ_POLE],
] as Array<[string, (f: number) => boolean]>) {
  const idx: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (pred(f)) idx.push(f);
  if (idx.length === 0) { log(`   ${name}: EMPTY`); clsAreaQ[name] = []; continue; }
  const av = new Float64Array(idx.length); for (let i = 0; i < idx.length; i += 1) av[i] = fArea[idx[i]];
  av.sort();
  const qq = [0, 0.5, 0.99].map((p) => qOf(av, p)).concat([av[av.length - 1]]);
  clsAreaQ[name] = qq;
  log(`   ${name.padEnd(14)} n=${idx.length.toLocaleString().padStart(10)}  facet-area p0 ${qq[0].toExponential(4)}  p50 ${qq[1].toExponential(4)}  p99 ${qq[2].toExponential(4)}  MAX ${qq[3].toExponential(4)}`);
}
log(`   ${'WHOLE MESH'.padEnd(14)} n=${nTri.toLocaleString().padStart(10)}  facet-area p0 ${qOf(sArea, 0).toExponential(4)}  p50 ${qOf(sArea, 0.5).toExponential(4)}  p99 ${qOf(sArea, 0.99).toExponential(4)}  MAX ${sArea[nTri - 1].toExponential(4)}`);
log('');

log('── (7) FOOTPRINT SIGN + SIZE FLOOR ──');
log(`   arc-space FOLDS (apsSign<0): ${invC.toLocaleString()} facets (${pct(invC, nTri)}%), ${invA.toExponential(4)} mm2 = ${pct(invA, area3)}% of area`);
log(`   min ARC edge ${(minEdgeArc * 1000).toExponential(4)} um   min 3D edge ${(minEdge3 * 1000).toExponential(4)} um`);
log(`   f32 coordinate quantum at r=50 mm is 3.8147e-3 um => min 3D edge is ${(minEdge3 * 1000 / 3.8147e-3).toFixed(1)}x the quantum`);
log('');

// ── (8) THE EXACT CLIFF ADJUDICATION ────────────────────────────────────────────────────────────────
interface Adj { set: number; jump: number; kinkOnly: number; none: number; aJump: number; aNone: number; rate: string;
  perClass: Record<string, { n: number; jump: number; a: number; aJump: number }> }
let adj: Adj | null = null;
if (ADJ) {
  const K: SweepPredConst = {
    esN: 12, refHs: 0.05, refNmax: 64,
    kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
    snap: true, confMm: 0.0006,
  };
  const rA = buildRadiusFn(STYLE as StyleId, {}, { H: 120, Rb: 40, Rt: 50, expn: 1 });
  const R = (th: number, z: number): number => rA(th, z);
  const inSet = (f: number): boolean => fAlt[f] < ADJ_BAR || fThin[f] < ADJ_TAU || fGR[f] >= ADJ_POLE;
  const idx: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (inSet(f)) idx.push(f);
  log('── (8) EXACT CLIFF ADJUDICATION — the DRIVER\'S OWN C0 classifier, on the flagged population ──');
  log(`   BOUND (stated, per instrument scar 5): the adjudicated set is the UNION of needle@${ADJ_BAR}um,`);
  log(`   thin@${ADJ_TAU} and pole>=${ADJ_POLE} = ${idx.length.toLocaleString()} facets = ${pct(idx.length, nTri)}% of the mesh.`);
  log(`   Facets OUTSIDE that set are NOT adjudicated. Inside it the scan is EXHAUSTIVE — every facet,`);
  log(`   all three (theta,z) edges, no stride — so the adjudication rate over the set is 100.000000%.`);
  log(`   Classifier: locateKinkRaw(kinkScan 16, kinkHalvings 24, kinkRatio 0.15, jumpRatio 0.62) vs the style's own rA.`);
  const jumpOf = new Uint8Array(nTri);
  let nJ = 0; let nK = 0; let nN = 0; let aJ = 0; let aN = 0;
  for (const f of idx) {
    const b = f * 9;
    const ax = xyz[b], ay = xyz[b + 1], az = xyz[b + 2];
    const bx = xyz[b + 3], by = xyz[b + 4], bz = xyz[b + 5];
    const cx = xyz[b + 6], cy = xyz[b + 7], cz = xyz[b + 8];
    const g = classifyFacet(ax, ay, az, bx, by, bz, cx, cy, cz);
    const P: Array<[number, number, number, number]> = [
      [g.tha, az, g.thb, bz], [g.thb, bz, g.thc, cz], [g.thc, cz, g.tha, az],
    ];
    let jump = false; let kink = false;
    for (const [t0, z0, t1, z1] of P) {
      const k = locateKinkRaw(R, t0, z0, t1, z1, K);
      if (k === null) continue;
      kink = true;
      if (k.jump) { jump = true; break; }
    }
    if (jump) { jumpOf[f] = 1; nJ += 1; aJ += fArea[f]; } else if (kink) { nK += 1; } else { nN += 1; aN += fArea[f]; }
  }
  const perClass: Record<string, { n: number; jump: number; a: number; aJump: number }> = {};
  for (const [name, pred] of [
    [`needle@${ADJ_BAR}um`, (f: number) => fAlt[f] < ADJ_BAR],
    [`thin@${ADJ_TAU}`, (f: number) => fThin[f] < ADJ_TAU],
    [`pole>=${ADJ_POLE}`, (f: number) => fGR[f] >= ADJ_POLE],
  ] as Array<[string, (f: number) => boolean]>) {
    let n = 0; let j = 0; let a = 0; let aj = 0;
    for (let f = 0; f < nTri; f += 1) if (pred(f)) { n += 1; a += fArea[f]; if (jumpOf[f] === 1) { j += 1; aj += fArea[f]; } }
    perClass[name] = { n, jump: j, a, aJump: aj };
  }
  log('');
  log(`   ${'class'.padEnd(16)} ${'N'.padStart(11)} ${'N on a C0 CLIFF'.padStart(16)} ${'%cnt CLIFF'.padStart(11)} ${'area mm2'.padStart(12)} ${'area on CLIFF'.padStart(14)} ${'%area CLIFF'.padStart(12)}`);
  for (const k of Object.keys(perClass)) {
    const v = perClass[k];
    log(`   ${k.padEnd(16)} ${v.n.toLocaleString().padStart(11)} ${v.jump.toLocaleString().padStart(16)} ${pct(v.jump, Math.max(1, v.n)).padStart(10)}% ${v.a.toExponential(4).padStart(12)} ${v.aJump.toExponential(4).padStart(14)} ${pct(v.aJump, Math.max(1e-300, v.a)).padStart(11)}%`);
  }
  log(`   whole adjudicated set: ${nJ.toLocaleString()} on a C0 JUMP, ${nK.toLocaleString()} on a CREASE only, ${nN.toLocaleString()} on NEITHER`);
  log(`   => ${pct(nN, Math.max(1, idx.length))}% of the flagged population sits on a SMOOTH patch: those are the driver's own doing.`);
  adj = { set: idx.length, jump: nJ, kinkOnly: nK, none: nN, aJump: aJ, aNone: aN, rate: '100.000000', perClass };
  log('');
}

if (JSONOUT !== '') {
  const asRec = (ks: number[], cs: Cls[]): Array<Record<string, number>> => ks.map((k, i) => ({
    k, count: cs[i].c, area: cs[i].a, maxFacetArea: cs[i].maxA,
    countWall: cs[i].cW, areaWall: cs[i].aW, maxFacetAreaWall: cs[i].maxAW,
    countJump: cs[i].cJ, areaJump: cs[i].aJ,
  }));
  writeFileSync(JSONOUT, `${JSON.stringify({
    tag: TAG, style: STYLE, stl: STL, nTri, area3, drJumpMm: DRJUMP,
    minAltUm: minAlt, minThin, maxGraphRatio: maxGR, nonFiniteGraphRatio: nonFinGR,
    minEdgeArcMm: minEdgeArc, minEdge3Mm: minEdge3,
    foldCount: invC, foldArea: invA, maxDRmm: maxDR,
    needle: asRec(BARS, ndl), thin: asRec(TAUS, thin), pole: asRec(POLES, pole),
    xtab, classAreaQuantiles: clsAreaQ, adjudication: adj,
    quantiles: { qs, alt: qs.map((p) => qOf(sAlt, p)), thin: qs.map((p) => qOf(sThin, p)), area: qs.map((p) => qOf(sArea, p)) },
  }, null, 1)}\n`);
  log(`json -> ${JSONOUT}`);
}
log(`WALL ${((Date.now() - T0) / 1000).toFixed(1)} s`);
log('S119 THIN LADDER RUNG DONE');

// s114ClaimAudit.ts — ADVERSARIAL VERIFICATION OF THE S112 DRIVER CLAIMS.
//
// Two measurements, each attacking a specific S112 claim. Everything else in the S112 audit is a SOURCE
// READ and needs no tool.
//
// A. THE FLOOR_MM SHADOW (C1). S20's own worklog named "a coverage hole in my wiring" as cause candidate 1
//    and said "I believe this is the one": `consider()` returns at :2807 for any facet whose LONGEST edge
//    is under FLOOR_MM, before the accept-side admission test at :2816. S112 asserts this cannot explain a
//    dead accept-side veto. That is a MEASURABLE claim: `le` is a pure function of the triangle and is
//    NON-INCREASING under bisection, so a LIVE (shipped) facet's max edge is EXACTLY the `le` that every
//    `consider(t)` call on it saw. Census the shipped mesh's max-edge distribution against FLOOR_MM.
//    Reported as COUNT + AREA-SHARE + MAX, never one of them.
//
// B. P2's OPERATIONALISATION (the methodological claim). S112 P2 defines flip/replace-fixable as a PAIR
//    predicate — BOTH facets spreadDeg < 5 AND max normDeg > 10 — and kills the wiring at 0.57% vs a 5%
//    bar. A veto acts on ONE facet. This re-scores the same class with the one-sided predicate and sweeps
//    both thresholds, so "does the pair-AND under-count, and by how much" is answered with numbers.
//    V0 reproduces S112's exact filter as a CONTROL: if V0 does not land on 0.57% the run is VOID.
//
// Usage: bash research/tools/run-s114-claimaudit.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114_STYLE ?? 'GothicArches';
const STL = process.env.PF_S114_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S114_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S114_HI_DEG', 45);
const K = Math.round(envF('PF_S114_K', 8));
const INSET_LO = envF('PF_S114_INSET_LO', 0);
const INSET_HI = envF('PF_S114_INSET_HI', 0.05);
const CURTAIN_RATIO = envF('PF_S114_CURTAIN', 8);
// the driver's own default: `_strataConformBisectL.test.ts:144`  FLOOR_MM = envF('PF_CB_FLOOR_UM',1.5)/1000
const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
const DIMS: StyleDims = { H: envF('PF_S114_H', 120), Rb: envF('PF_S114_RB', 40), Rt: envF('PF_S114_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/claimaudit';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

void ({} as SweepPredConst);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink: NormalSampler = fdNormals(rA, H, 2e-4, 2e-4);

log('===== S114 — ADVERSARIAL AUDIT OF THE S112 DRIVER CLAIMS =====');
log(`style ${STYLE}  tag ${TAG}  hi cut ${HI_DEG} deg  k=${K}  inset LO ${INSET_LO} HI ${INSET_HI}`);
log(`driver FLOOR_MM = ${(FLOOR_MM * 1000).toFixed(3)} um   (_strataConformBisectL.test.ts:144 default)`);
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (brief states 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2   interior edges ${d.interiorEdges}  ${el()}`);
log('');

const q = (v: number[] | Float64Array, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A. THE FLOOR_MM SHADOW — can :2807 explain a dead accept-side veto at :2816?
// ══════════════════════════════════════════════════════════════════════════════════════════════════
log('== A. THE FLOOR_MM SHADOW (C1) ==');
log('   `le` at :2803 is max(3 edge lengths, 3-D mm). It is NON-INCREASING under bisection, so for a');
log('   LIVE facet the shipped max edge IS the `le` every consider(t) call on it evaluated. Any facet');
log('   with le < FLOOR_MM returned at :2807 and was NEVER admission-tested.');
const leArr = new Float64Array(nTri);
let leMin = Infinity; let leMinF = -1;
for (let f = 0; f < nTri; f += 1) {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const le = Math.max(
    Math.hypot(bx - ax, by - ay, bz - az),
    Math.hypot(cx - bx, cy - by, cz - bz),
    Math.hypot(ax - cx, ay - cy, az - cz),
  );
  leArr[f] = le;
  if (le < leMin) { leMin = le; leMinF = f; }
}
log(`  max-edge over ${nTri} shipped facets (um):`);
log(`    MIN ${(leMin * 1000).toFixed(4)} (facet ${leMinF})   p0.1 ${(q(leArr, 0.001) * 1000).toFixed(2)}`
  + `   p1 ${(q(leArr, 0.01) * 1000).toFixed(2)}   p50 ${(q(leArr, 0.5) * 1000).toFixed(2)}`
  + `   p99 ${(q(leArr, 0.99) * 1000).toFixed(2)}   MAX ${(q(leArr, 1) * 1000).toFixed(2)}`);
log('');
log('  FLOOR SWEEP — count + AREA-share + worst le, at each candidate floor:');
const floorRows: Array<Record<string, number | string>> = [];
for (const fum of [1.5, 5, 15, 50, 150, 500, 1500]) {
  const fmm = fum / 1000;
  let n = 0; let ar = 0; let worst = 0;
  for (let f = 0; f < nTri; f += 1) if (leArr[f] < fmm) { n += 1; ar += d.areaMm2[f]; if (leArr[f] > worst) worst = leArr[f]; }
  log(`    floor ${String(fum).padStart(6)} um   n=${String(n).padStart(8)} (${((n / nTri) * 100).toFixed(4).padStart(8)}% by count)`
    + `   AREA ${ar.toFixed(4).padStart(10)} mm2 = ${((ar / meshArea) * 100).toFixed(6).padStart(10)}% of mesh`
    + `   worst le in class ${(worst * 1000).toFixed(3)} um`);
  floorRows.push({ floorUm: fum, n, areaMm2: Number(ar.toFixed(6)), areaPct: Number(((ar / meshArea) * 100).toFixed(6)) });
}
{
  let n = 0; let ar = 0;
  for (let f = 0; f < nTri; f += 1) if (leArr[f] < FLOOR_MM) { n += 1; ar += d.areaMm2[f]; }
  log('');
  log(`  *** AT THE DRIVER'S OWN FLOOR (${(FLOOR_MM * 1000).toFixed(1)} um): ${n} facets = ${((n / nTri) * 100).toFixed(6)}% by count,`
    + ` ${ar.toFixed(6)} mm2 = ${((ar / meshArea) * 100).toFixed(6)}% of mesh area. ***`);
  log(`  The whole shipped mesh sits ${(leMin / FLOOR_MM).toFixed(1)}x above the floor at its THINNEST facet.`);
  log(`  ${n === 0
    ? '=> :2807 shadowed ZERO shipped facets. It cannot explain a dead accept-side veto. C1 CONFIRMED by measurement.'
    : `=> :2807 shadowed ${n} shipped facets; the shadow is REAL and must be priced against the 108 missed.`}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// B. P2 RE-OPERATIONALISED
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const scratch = new Float64Array(12);
function orientOf(f: number, inset: number): { normDeg: number; spreadDeg: number } {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ath = Math.atan2(ay, ax);
  const bth = ath + dThRaw(ath, Math.atan2(by, bx));
  const cth = ath + dThRaw(ath, Math.atan2(cy, cx));
  const o = orientOfFacet(nsKink, ax, ay, az, bx, by, bz, cx, cy, cz, ath, bth, cth, {
    k: K, orient: 'winding', scratch, inset,
  });
  return { normDeg: o.normDeg, spreadDeg: (o.spreadRad * 180) / Math.PI };
}
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const ath = Math.atan2(ay, ax);
  const bth = ath + dThRaw(ath, Math.atan2(by, bx));
  const cth = ath + dThRaw(ath, Math.atan2(cy, cx));
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}

log('== B. P2 RE-OPERATIONALISED (the methodological claim) ==');
type Row = {
  f1: number; f2: number; measDeg: number; curtain: boolean;
  n1: number; n2: number; s1: number; s2: number; normHi: number; normLoI: number; drop: number;
};
const allRows: Row[] = [];
const hiThr = (HI_DEG * Math.PI) / 180;
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const a = orientOf(f1, INSET_HI); const b = orientOf(f2, INSET_HI);
  const aLo = orientOf(f1, INSET_LO); const bLo = orientOf(f2, INSET_LO);
  const g1 = graphRatio(f1); const g2 = graphRatio(f2);
  const normHi = Math.max(a.normDeg, b.normDeg); const normLoI = Math.max(aLo.normDeg, bLo.normDeg);
  allRows.push({
    f1, f2, measDeg: (d.edgeAngRad[e] * 180) / Math.PI, curtain: g1 > CURTAIN_RATIO || g2 > CURTAIN_RATIO,
    n1: a.normDeg, n2: b.normDeg, s1: a.spreadDeg, s2: b.spreadDeg,
    normHi, normLoI, drop: normLoI > 1e-9 ? normHi / normLoI : 1,
  });
}
const rows = allRows.filter((r) => !r.curtain);
log(`  high-dihedral pairs ${allRows.length} (S112 read 19,582)   WALL ${rows.length} (S112 read 13,092)   ${el()}`);

const areaOfPairs = (rs: Row[]): number => {
  const s = new Set<number>();
  for (const r of rs) { s.add(r.f1); s.add(r.f2); }
  let a = 0; for (const f of s) a += d.areaMm2[f];
  return a;
};
const areaOfFacets = (fs: Set<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const wallArea = areaOfPairs(rows);
const visibleArea = areaOfPairs(allRows);
log(`  WALL-class area ${wallArea.toFixed(3)} mm2 = ${((wallArea / meshArea) * 100).toFixed(4)}% of mesh (S112 read 1.7602%)`);
log(`  VISIBLE (wall+curtain) area ${visibleArea.toFixed(3)} mm2 = ${((visibleArea / meshArea) * 100).toFixed(4)}% of mesh`);
log('');

// ── V0 — S112's exact filter, as a CONTROL. If this does not reproduce, everything below is VOID. ──
const v0 = rows.filter((r) => r.s1 < 5 && r.s2 < 5 && r.normHi > 10);
const v0Area = areaOfPairs(v0);
const v0Share = v0Area / wallArea;
log('  ── V0 CONTROL — S112 P2 VERBATIM: pair-AND (s1<5 AND s2<5 AND max normDeg>10), area over the');
log('     UNIQUE FACETS OF QUALIFYING PAIRS, denominator = WALL class area ──');
log(`     n=${v0.length} pairs (S112 read 288)   AREA ${v0Area.toFixed(4)} mm2`
  + `   = ${(v0Share * 100).toFixed(2)}% of wall class (S112 read 0.57%)`
  + `   MAX normDeg ${Math.max(0, ...v0.map((r) => r.normHi)).toFixed(2)} deg`);
const v0Ok = Math.abs(v0Share * 100 - 0.57) <= 0.06 && Math.abs(v0.length - 288) <= 10;
log(`     ${v0Ok ? '[CONTROL PASSES — S112 P2 reproduced. The comparisons below are against the same object.]'
  : '*** CONTROL FAILED — I am not reproducing S112 P2. EVERY NUMBER IN SECTION B IS VOID. ***'}`);
log('');

// ── V1 — the ONE-SIDED, PER-FACET predicate. A veto fires on a facet, not on a pair. ──
const facetOf = new Map<number, { n: number; s: number }>();
for (const r of rows) {
  const a = facetOf.get(r.f1); if (a === undefined || r.n1 > a.n) facetOf.set(r.f1, { n: r.n1, s: r.s1 });
  const b = facetOf.get(r.f2); if (b === undefined || r.n2 > b.n) facetOf.set(r.f2, { n: r.n2, s: r.s2 });
}
log(`  ── V1 — ONE-SIDED, PER-FACET: facets of the wall class with spreadDeg<5 AND normDeg>10 ──`);
log(`     unique wall-class facets ${facetOf.size}`);
const v1Set = new Set<number>();
for (const [f, v] of facetOf) if (v.s < 5 && v.n > 10) v1Set.add(f);
const v1Area = areaOfFacets(v1Set);
log(`     n=${v1Set.size} facets   AREA ${v1Area.toFixed(4)} mm2 = ${((v1Area / wallArea) * 100).toFixed(2)}% of wall class`
  + ` = ${((v1Area / meshArea) * 100).toFixed(4)}% of mesh`
  + `   MAX normDeg ${Math.max(0, ...Array.from(v1Set).map((f) => facetOf.get(f)!.n)).toFixed(2)} deg`);
log(`     *** V1 / V0 = ${(v1Area / Math.max(1e-12, v0Area)).toFixed(2)}x by AREA,`
  + ` ${(v1Set.size / Math.max(1, new Set([...v0.map((r) => r.f1), ...v0.map((r) => r.f2)]).size)).toFixed(2)}x by COUNT ***`);
log('');

// ── V1b — the SAME one-sided predicate but PAIR-scoped, so the only difference from V0 is the AND ──
const v1b = rows.filter((r) => (r.s1 < 5 && r.n1 > 10) || (r.s2 < 5 && r.n2 > 10));
const v1bArea = areaOfPairs(v1b);
log('  ── V1b — pair-OR: at least one facet has spreadDeg<5 AND normDeg>10 (same area rule as V0, so the');
log('     ONLY difference from V0 is the AND-vs-OR) ──');
log(`     n=${v1b.length} pairs   AREA ${v1bArea.toFixed(4)} mm2 = ${((v1bArea / wallArea) * 100).toFixed(2)}% of wall class`
  + `   => V1b / V0 = ${(v1bArea / Math.max(1e-12, v0Area)).toFixed(2)}x by area, ${(v1b.length / Math.max(1, v0.length)).toFixed(2)}x by count`);
log('');

// ── THE MIXED PAIRS: exactly what the AND throws away ──
const mixed = rows.filter((r) => {
  const aFix = r.s1 < 5 && r.n1 > 10; const bFix = r.s2 < 5 && r.n2 > 10;
  const aHi = r.s1 >= 5; const bHi = r.s2 >= 5;
  return (aFix && bHi) || (bFix && aHi);
});
log('  ── THE POPULATION THE PAIR-AND DISCARDS: one facet flat-and-off, its NEIGHBOUR high-spread ──');
log(`     n=${mixed.length} pairs = ${((mixed.length / Math.max(1, rows.length)) * 100).toFixed(2)}% of the wall class by count`);
log(`     AREA (both facets) ${areaOfPairs(mixed).toFixed(4)} mm2 = ${((areaOfPairs(mixed) / wallArea) * 100).toFixed(2)}% of wall class`);
{
  const fixSide = new Set<number>();
  for (const r of mixed) {
    if (r.s1 < 5 && r.n1 > 10 && r.s2 >= 5) fixSide.add(r.f1);
    if (r.s2 < 5 && r.n2 > 10 && r.s1 >= 5) fixSide.add(r.f2);
  }
  log(`     AREA of the FIXABLE SIDE ONLY: ${areaOfFacets(fixSide).toFixed(4)} mm2 = ${((areaOfFacets(fixSide) / wallArea) * 100).toFixed(2)}% of wall class`
    + `   (n=${fixSide.size} facets)`);
}
log('');

// ── THRESHOLD SWEEP — a one-sided bar is satisfied by a degenerate answer; sweep BOTH knobs. ──
log('  ── THRESHOLD SWEEP (V0 pair-AND vs V1 per-facet), area-share of the WALL class ──');
log('     spread<  norm>     V0 n   V0 area%     V1 n   V1 area%   ratio');
for (const sp of [2, 5, 10, 20]) {
  for (const nm of [5, 10, 20]) {
    const a0 = rows.filter((r) => r.s1 < sp && r.s2 < sp && r.normHi > nm);
    const s1set = new Set<number>();
    for (const [f, v] of facetOf) if (v.s < sp && v.n > nm) s1set.add(f);
    const A0 = areaOfPairs(a0); const A1 = areaOfFacets(s1set);
    log(`     ${String(sp).padStart(7)}  ${String(nm).padStart(5)}  ${String(a0.length).padStart(7)}`
      + `  ${((A0 / wallArea) * 100).toFixed(2).padStart(8)}%  ${String(s1set.size).padStart(7)}`
      + `  ${((A1 / wallArea) * 100).toFixed(2).padStart(8)}%  ${(A1 / Math.max(1e-12, A0)).toFixed(2).padStart(6)}x`);
  }
}
log('');

// ── DENOMINATOR CHECK: S112 printed "% of the VISIBLE CLASS" but divided by the WALL class. ──
log('  ── DENOMINATOR CHECK — S112\'s P2 line reads "% of the VISIBLE CLASS by area" but the code divides');
log('     by `rows` = the WALL class (s112AngularDecomp.ts:390, :455-464) ──');
log(`     V0 / WALL    = ${(v0Share * 100).toFixed(2)}%   <- the number S112 quotes`);
log(`     V0 / VISIBLE = ${((v0Area / visibleArea) * 100).toFixed(2)}%   <- what the label says`);
log(`     V0 / MESH    = ${((v0Area / meshArea) * 100).toFixed(4)}%`);
log('');

writeFileSync(`${OUTDIR}/S114_CLAIMAUDIT_${TAG}.json`, JSON.stringify({
  schema: 'pf.s114.claimaudit/1',
  stl: STL, nTri, meshArea, floorMm: FLOOR_MM, leMinUm: leMin * 1000, floorRows,
  pairs: allRows.length, wall: rows.length, wallArea, visibleArea,
  v0: { n: v0.length, area: v0Area, shareWall: v0Share },
  v1: { n: v1Set.size, area: v1Area, shareWall: v1Area / wallArea },
  v1b: { n: v1b.length, area: v1bArea, shareWall: v1bArea / wallArea },
  mixed: { n: mixed.length, area: areaOfPairs(mixed) },
}, null, 1));
log(`done ${el()}`);

// revS115OracleCeilPlaceboWeld.ts — S115 REFUTATION PROBE for s115OracleCeiling.ts stage-4(b).
//
// THE QUESTION: facetDihedrals() welds by EXACT f64 coordinate equality. The PLACEBO arm's new
// midpoints are recomputed independently inside every parent facet from that facet's OWN unwrapped
// theta branch (ta + dThRaw(...)), then pushed through rA/cos/sin. If those bits do not agree between
// the two parents sharing an edge, the midpoint does NOT weld, the child edges across it become
// BOUNDARY edges, and their dihedral is NEVER SCORED — which would silently deflate the placebo's
// >45 AREA share and make the operator look better (or the placebo look better) for free.
//
// This probe reproduces the tool's own sector + subdivide code path byte-for-byte and reports the
// edge topology (interior / boundary / non-manifold) that stage 4(b) never printed for those arms,
// against the exact theoretical value for a correctly welded 1->4 subdivision.
//
// Also: a shape census of the FOLD band (>163.41 deg) facets, to test the campaign claim that folds
// are "degenerate needle pairs" whose repair costs ~0 triangles.

import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import type { StyleId } from '../bridge/runStyle';

const STL = process.env.PF_RVW_STL ?? '';
if (STL.length === 0) { console.log('*** PF_RVW_STL required (ABSOLUTE) ***'); process.exit(2); }
const SECTOR_DIV = Number(process.env.PF_RVW_SECTORDIV ?? '16');
const SECTOR_T0 = Number(process.env.PF_RVW_SECTORT0 ?? '0');
const CEIL = Number(process.env.PF_RVW_CEIL ?? '163.41');
const H = 120; const Rb = 40; const Rt = 50;
const DEG = 180 / Math.PI;

const log = (s: string): void => { console.log(s); };
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

// ── the analytic surface, built EXACTLY as s115OracleCeiling.ts builds it (real registry, real kernel) ──
const STYLE = process.env.PF_RVW_STYLE ?? 'CelticTriquetra';
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { console.log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, { H, Rb, Rt, expn: 1 });
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// ── load ──
const mesh = readMeshFloat64(STL);
const xyz = mesh.xyz as Float64Array;
const nTri = Math.floor(xyz.length / 9);
log(`loaded ${nTri} facets from ${STL}  ${el()}`);

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};

// ── sector selection, identical predicate to the tool ──
const W = (2 * Math.PI) / SECTOR_DIV;
const t0 = SECTOR_T0; const t1 = SECTOR_T0 + W;
const secF: number[] = [];
for (let f = 0; f < nTri; f += 1) {
  const [a, b, c] = th3(f);
  const a0 = canonTheta(a);
  const p1 = a0; const p2 = a0 + (b - a); const p3 = a0 + (c - a);
  if (p1 >= t0 && p1 <= t1 && p2 >= t0 && p2 <= t1 && p3 >= t0 && p3 <= t1) secF.push(f);
}
const secSoup = new Float64Array(secF.length * 9);
for (let i = 0; i < secF.length; i += 1) for (let k = 0; k < 9; k += 1) secSoup[i * 9 + k] = xyz[secF[i] * 9 + k];
log(`sector theta [${t0.toFixed(4)}, ${t1.toFixed(4)}]: ${secF.length} facets  ${el()}`);

// ── subdivide, copied verbatim from s115OracleCeiling.ts ──
function subdivide(soup: Float64Array, reproject: boolean): Float64Array {
  const n = soup.length / 9;
  const out = new Float64Array(n * 4 * 9);
  const PP = new Float64Array(18);
  for (let f = 0; f < n; f += 1) {
    const ax = soup[f * 9]; const ay = soup[f * 9 + 1]; const az = soup[f * 9 + 2];
    const bx = soup[f * 9 + 3]; const by = soup[f * 9 + 4]; const bz = soup[f * 9 + 5];
    const cx = soup[f * 9 + 6]; const cy = soup[f * 9 + 7]; const cz = soup[f * 9 + 8];
    const ta = Math.atan2(ay, ax);
    const tb = ta + dThRaw(ta, Math.atan2(by, bx));
    const tc = ta + dThRaw(ta, Math.atan2(cy, cx));
    const mid = (x1: number, y1: number, z1: number, u1: number, x2: number, y2: number, z2: number, u2: number, o: number): void => {
      if (reproject) {
        const tm = 0.5 * (u1 + u2); const zm = 0.5 * (z1 + z2);
        const r = rA(tm, zm);
        PP[o] = r * Math.cos(tm); PP[o + 1] = r * Math.sin(tm); PP[o + 2] = zm;
      } else { PP[o] = 0.5 * (x1 + x2); PP[o + 1] = 0.5 * (y1 + y2); PP[o + 2] = 0.5 * (z1 + z2); }
    };
    mid(ax, ay, az, ta, bx, by, bz, tb, 0);
    mid(bx, by, bz, tb, cx, cy, cz, tc, 3);
    mid(cx, cy, cz, tc, ax, ay, az, ta, 6);
    const w = (o: number, p: number[]): void => { for (let i = 0; i < 9; i += 1) out[o + i] = p[i]; };
    const base = f * 36;
    w(base, [ax, ay, az, PP[0], PP[1], PP[2], PP[6], PP[7], PP[8]]);
    w(base + 9, [PP[0], PP[1], PP[2], bx, by, bz, PP[3], PP[4], PP[5]]);
    w(base + 18, [PP[6], PP[7], PP[8], PP[3], PP[4], PP[5], cx, cy, cz]);
    w(base + 27, [PP[0], PP[1], PP[2], PP[3], PP[4], PP[5], PP[6], PP[7], PP[8]]);
  }
  return out;
}

interface Topo { tris: number; area: number; interior: number; boundary: number; nonman: number; over45Area: number; over45Count: number; foldArea: number; maxDeg: number; noNbr: number; noNbrArea: number }
function topo(soup: Float64Array): Topo {
  const n = soup.length / 9;
  const dd = facetDihedrals(soup, new Uint32Array(n * 3).map((_, i) => i));
  let area = 0; let o45a = 0; let o45c = 0; let fold = 0; let maxA = 0;
  const deg = new Int32Array(n);
  for (let e = 0; e < dd.edgeF1.length; e += 1) { deg[dd.edgeF1[e]] += 1; deg[dd.edgeF2[e]] += 1; }
  let noNbr = 0; let noNbrArea = 0;
  for (let f = 0; f < n; f += 1) {
    area += dd.areaMm2[f];
    if (dd.perFacetMaxRad[f] > maxA) maxA = dd.perFacetMaxRad[f];
    if (dd.perFacetMaxRad[f] > (45 * Math.PI) / 180) { o45a += dd.areaMm2[f]; o45c += 1; }
    if (dd.perFacetMaxRad[f] > (CEIL * Math.PI) / 180) fold += dd.areaMm2[f];
    if (deg[f] === 0) { noNbr += 1; noNbrArea += dd.areaMm2[f]; }
  }
  return { tris: n, area, interior: dd.interiorEdges, boundary: dd.boundaryEdges, nonman: dd.nonManifoldEdges, over45Area: o45a, over45Count: o45c, foldArea: fold, maxDeg: maxA * DEG, noNbr, noNbrArea };
}
const show = (name: string, t: Topo, baseArea: number, baseShare: number): void => {
  const share = (t.over45Area / t.area) * 100;
  // For a correctly welded closed-ish patch: E = (3F + B)/2, interior = (3F - B)/2.
  const expInt = (3 * t.tris - t.boundary) / 2;
  log(`  ${name.padEnd(16)} tris ${String(t.tris).padStart(9)}  AREA ${t.area.toFixed(3).padStart(10)}  interior ${String(t.interior).padStart(9)}  boundary ${String(t.boundary).padStart(9)}  nonman ${String(t.nonman).padStart(6)}`);
  log(`  ${''.padEnd(16)} >45 AREA ${share.toFixed(4)}%  COUNT ${((t.over45Count / t.tris) * 100).toFixed(4)}%  FOLD ${((t.foldArea / t.area) * 100).toFixed(4)}%  MAX ${t.maxDeg.toFixed(3)} deg  vsBASE ${(share / baseShare).toFixed(4)}x`);
  log(`  ${''.padEnd(16)} *** EDGE-BUDGET CHECK: interior(measured) ${t.interior} vs (3F-B)/2 = ${expInt}  => ${t.interior === expInt ? 'CONSISTENT' : `*** ${((1 - t.interior / expInt) * 100).toFixed(2)}% OF EDGES UNSCORED ***`}`);
  log(`  ${''.padEnd(16)} 3F/2 (a fully welded closed patch would need) ${(1.5 * t.tris).toFixed(0)};  unscored-vs-closed ${(((1.5 * t.tris - t.interior) / (1.5 * t.tris)) * 100).toFixed(3)}%   isolated facets ${t.noNbr} (AREA ${((t.noNbrArea / t.area) * 100).toFixed(4)}%)`);
  void baseArea;
};

log('');
log('══ STAGE A: EDGE TOPOLOGY OF EVERY STAGE-4(b) ARM (the numbers the tool never printed) ══');
const base = topo(secSoup);
const bShare = (base.over45Area / base.area) * 100;
show('BASE(mesh)', base, base.area, bShare);
let cur = secSoup; let curN = secSoup;
for (let lvl = 1; lvl <= 2; lvl += 1) {
  cur = subdivide(cur, true);
  show(`PLACEBO 1->4 ${4 ** lvl}x`, topo(cur), base.area, bShare);
  curN = subdivide(curN, false);
  show(`NULL planar ${4 ** lvl}x`, topo(curN), base.area, bShare);
  log('');
}

// ── STAGE B: how many midpoints actually welded? direct count ──
log('══ STAGE B: DIRECT MIDPOINT-WELD CENSUS (1 level, reproject vs planar) ══');
const censusWeld = (soup: Float64Array, label: string): void => {
  const n = soup.length / 9;
  const seen = new Map<string, number>();
  for (let v = 0; v < n * 3; v += 1) {
    const k = `${soup[v * 3]},${soup[v * 3 + 1]},${soup[v * 3 + 2]}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  let once = 0;
  for (const c of seen.values()) if (c === 1) once += 1;
  log(`  ${label}: ${n} tris, ${n * 3} corners, ${seen.size} DISTINCT exact positions, ${once} appear exactly once`);
};
censusWeld(secSoup, 'BASE          ');
censusWeld(subdivide(secSoup, true), 'PLACEBO 1->4  ');
censusWeld(subdivide(secSoup, false), 'NULL planar   ');

// ── STAGE C: FOLD-BAND SHAPE CENSUS on the WHOLE mesh — is the fold a needle pair? ──
log('');
log('══ STAGE C: WHOLE-MESH FOLD-BAND (>CEIL) SHAPE CENSUS — "folds are degenerate needle pairs"? ══');
{
  const dd = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  const thr = (CEIL * Math.PI) / 180;
  const bar45 = (45 * Math.PI) / 180;
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += dd.areaMm2[f];
  // per-facet min altitude = 2*area/longest edge
  const alt = (f: number): number => {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const L = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    return L > 0 ? (2 * dd.areaMm2[f]) / L : 0;
  };
  const bandAlts: number[] = []; const bandArea: number[] = [];
  let cntFold = 0; let areaFold = 0; let cnt45 = 0; let area45 = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (dd.perFacetMaxRad[f] > bar45) { cnt45 += 1; area45 += dd.areaMm2[f]; }
    if (dd.perFacetMaxRad[f] > thr) { cntFold += 1; areaFold += dd.areaMm2[f]; bandAlts.push(alt(f)); bandArea.push(dd.areaMm2[f]); }
  }
  const qq = (a: number[], p: number): number => { const s = [...a].sort((x, y) => x - y); return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
  log(`  mesh AREA ${meshArea.toFixed(3)} mm2, facets ${nTri}`);
  log(`  >45 class per FACET: COUNT ${cnt45}  AREA ${area45.toFixed(4)} mm2 = ${((area45 / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`  FOLD (>${CEIL}) per FACET: COUNT ${cntFold}  AREA ${areaFold.toFixed(4)} mm2 = ${((areaFold / meshArea) * 100).toFixed(4)}% of mesh = ${((areaFold / area45) * 100).toFixed(4)}% of class area`);
  log(`  mean facet area in FOLD band ${(areaFold / cntFold).toExponential(4)} mm2 vs mesh mean ${(meshArea / nTri).toExponential(4)} mm2  => ${((areaFold / cntFold) / (meshArea / nTri)).toFixed(3)}x the mean facet`);
  log(`  MIN-ALTITUDE of FOLD-band facets (um): p01 ${(qq(bandAlts, 0.01) * 1000).toFixed(3)}  p10 ${(qq(bandAlts, 0.10) * 1000).toFixed(3)}  p50 ${(qq(bandAlts, 0.5) * 1000).toFixed(3)}  p90 ${(qq(bandAlts, 0.9) * 1000).toFixed(3)}  MAX ${(qq(bandAlts, 1) * 1000).toFixed(3)}`);
  // AREA-WEIGHTED: what share of the FOLD band's AREA sits on facets that are NOT needles?
  const NEEDLE_UM = Number(process.env.PF_RVW_NEEDLEUM ?? '10');
  let needleArea = 0; let needleCnt = 0;
  for (let i = 0; i < bandAlts.length; i += 1) if (bandAlts[i] * 1000 < NEEDLE_UM) { needleArea += bandArea[i]; needleCnt += 1; }
  log(`  *** of the FOLD band: ${needleCnt} facets (${((needleCnt / cntFold) * 100).toFixed(2)}% by COUNT) have min-altitude < ${NEEDLE_UM} um,`);
  log(`      but they carry only ${needleArea.toFixed(4)} mm2 = ${((needleArea / areaFold) * 100).toFixed(4)}% OF THE FOLD BAND'S AREA`);
  log(`      => ${(100 - (needleArea / areaFold) * 100).toFixed(4)}% of the fold band's AREA sits on NON-needle facets (${((areaFold - needleArea) / meshArea * 100).toFixed(4)}% of mesh).`);
}
// ── STAGE D: FOLD-EDGE PAIR CENSUS — can a needle-removal operator even REACH these folds? ──
// The headline's forward claim is "FOLD REPAIR at ~0 triangle cost, because folds are degenerate needle
// pairs, not under-resolution". That is a claim about EDGES, not facets: a fold edge is repairable at ~0
// cost only if at least one of its two facets is a needle you can collapse away. Classify every fold
// edge by whether 0, 1 or 2 of its facets are needles, and account by AREA (per FACET, deduplicated).
log('');
log('══ STAGE D: FOLD-EDGE PAIR CENSUS — is a fold edge actually a needle pair? ══');
{
  const dd = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  const thr = (CEIL * Math.PI) / 180;
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += dd.areaMm2[f];
  const altOf = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const L = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    altOf[f] = L > 0 ? (2 * dd.areaMm2[f]) / L : 0;
  }
  for (const NEEDLE_UM of [1, 5, 10, 25, 50]) {
    const nd = (f: number): boolean => altOf[f] * 1000 < NEEDLE_UM;
    let e0 = 0; let e1 = 0; let e2 = 0;
    const touch0 = new Set<number>(); const touch1 = new Set<number>();
    for (let e = 0; e < dd.edgeAngRad.length; e += 1) {
      if (dd.edgeAngRad[e] <= thr) continue;
      const f1 = dd.edgeF1[e]; const f2 = dd.edgeF2[e];
      const k = (nd(f1) ? 1 : 0) + (nd(f2) ? 1 : 0);
      if (k === 0) { e0 += 1; touch0.add(f1); touch0.add(f2); } else if (k === 1) { e1 += 1; } else { e2 += 1; }
      if (k >= 1) { touch1.add(f1); touch1.add(f2); }
    }
    // AREA of facets that ONLY ever appear on needle-free fold edges (unreachable by needle removal)
    let unreachArea = 0; let unreachCnt = 0;
    for (const f of touch0) if (!touch1.has(f)) { unreachArea += dd.areaMm2[f]; unreachCnt += 1; }
    const eT = e0 + e1 + e2;
    log(`  needle bar ${String(NEEDLE_UM).padStart(3)} um: fold EDGES ${eT}  |  0 needles ${e0} (${((e0 / eT) * 100).toFixed(2)}%)  1 needle ${e1} (${((e1 / eT) * 100).toFixed(2)}%)  2 needles ${e2} (${((e2 / eT) * 100).toFixed(2)}%)`);
    log(`     *** UNREACHABLE by any needle-collapse: ${unreachCnt} facets carrying ${unreachArea.toFixed(4)} mm2 = ${((unreachArea / meshArea) * 100).toFixed(4)}% OF MESH (headline prize claims 2.3262%) ***`);
  }
}

log('');
log(`done ${el()}`);

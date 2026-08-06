// s113bLoci.ts — WHAT SHAPE IS THE DEFECT? One curve, or ten thousand accidents?
//
// S113's dump pinned 3,282 straddling crease PAIRS / 6,193 unique facets / 69.826 mm2 = 0.1816% of the
// GothicArches mesh. Refinement provably cannot fix a straddle (fixture H2: the angle is x0.9968 invariant
// over five halvings while a smooth control decays x28.43), so the ONLY remedy is to put a mesh edge ON the
// crease. Whether such an operator is even BUILDABLE depends on facts nobody has measured:
//
//   1. Is the class CONNECTED? A few long ribbons admit a curve-following operator; ten thousand isolated
//      pairs do not.
//   2. Are the components CURVES (in-class degree ~2) or BLOBS (high degree)?
//   3. Where are the loci in (theta, z)? Vertical lines, curves, or scatter?
//   4. Does each pair's SHARED EDGE already lie ALONG the crease (a flip is cheap) or ACROSS it (only a
//      split/remesh can help)?
//   5. How many distinct crease curves are touched, and what fraction of each is covered?
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// MEASUREMENT CHOICES, STATED UP FRONT BECAUSE EACH ONE COULD HAVE BEEN THE ARTEFACT
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// * MEMBERSHIP IS NOT RE-DERIVED. Every facet id comes from S113's NDJSON. The tool re-reads the STL and
//   asserts xyz[f*9..] === tri1/tri2 for all 3,282 rows, so the facet index space is proven identical.
// * THE CREASE LOCUS IS MEASURED, NOT ASSUMED. No loci file, no style knowledge: a kink field is scanned
//   over the fundamental domain with `fdNormals` (the one-sided finite-difference sampler that DOES see a
//   C0 crease; a central difference returns the average of the two sides and is blind to it), and the loci
//   are its connected components. The threshold is SWEPT and the component count printed at each, because a
//   component count that moves with the threshold is not a fact about the surface.
// * THE TANGENT IS A FOOTPRINT PROBE, NOT A TWO-POINT PROBE. Prior work here under-read a curved quantity
//   by 13x with a 2-point probe. The crease tangent is the principal axis of a PCA over ALL crease cells
//   within a radius R of the query, R is SWEPT over 3 scales, and the PCA anisotropy is reported so that
//   crease JUNCTIONS (where no single tangent exists) are separated instead of averaged in.
// * `locateTurnAdaptive` IS USED ONLY AS AN INDEPENDENT CROSS-CHECK, on a subsample, with `turn` gated —
//   its tie-break defect (orientRuler.ts:529) walks a smooth segment to the left end and returns a
//   plausible `s`.
// * TWO CONTROLS, BOTH DIFFED AGAINST THE MEASUREMENT AS PRINTED NUMBERS:
//     C1 SHUFFLED DIRECTIONS at the SAME positions — isolates "the edge is aligned with the crease" from
//        "the mesh's edges happen to point that way". If C1 matches the real distribution, result VOID.
//     C2 RANDOM POSITIONS with the real direction pool — checks the target set really sits on creases and
//        that the tangent estimator is not manufacturing alignment out of nothing.
// * COUNT NEVER ALONE. Every distribution is reported as COUNT + AREA-share + MAX/median together.
//
// Usage: bash research/tools/run-s113b-loci.sh
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { fdNormals, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113B_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113B_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJ = process.env.PF_S113B_NDJ ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const TAG = process.env.PF_S113B_TAG ?? 'GOTH';
const DIMS: StyleDims = { H: envF('PF_S113B_H', 120), Rb: envF('PF_S113B_RB', 40), Rt: envF('PF_S113B_RT', 50), expn: 1 };
const H = DIMS.H;
const RB = DIMS.Rb; const RT = DIMS.Rt;
const SECTORS = Math.round(envF('PF_S113B_SECTORS', 12));      // gaCounts default = 12
const SEC_DEG = 360 / SECTORS;
const NTH = Math.round(envF('PF_S113B_NTH', 600));             // theta cells across ONE sector
const NZ = Math.round(envF('PF_S113B_NZ', 2400));              // z cells over [0, H]
const KINK_DEG = envF('PF_S113B_KINK_DEG', 10);                // primary crease threshold
const OUTDIR = 'research/exchange/_strataConformBisect/loci';

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const D2R = Math.PI / 180; const R2D = 180 / Math.PI;
/** base profile radius; expn = 1 => linear, verified against src/geometry/profile.ts baseRadius. */
const rBase = (z: number): number => RB + (RT - RB) * (z <= 0 ? 0 : z >= H ? 1 : z / H);

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

interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row {
  e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number;
  spread1: number; spread2: number; area1: number; area2: number; gr1: number; gr2: number;
  onEdge: boolean; onSeg: boolean; z: number; thDeg: number; thMod30: number;
  tri1: number[]; tri2: number[]; shared: number[]; locs: Loc[];
}

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
/** MAX by loop, never `Math.max(...arr)` — the spread blows the argument limit on these array sizes. */
const mx = (v: ArrayLike<number>): number => { let m = -Infinity; for (let i = 0; i < v.length; i += 1) if (v[i] > m) m = v[i]; return m; };
const mn = (v: ArrayLike<number>): number => { let m = Infinity; for (let i = 0; i < v.length; i += 1) if (v[i] < m) m = v[i]; return m; };
const nInf = (v: number[]): number => v.filter((x) => !Number.isFinite(x)).length;
/** weighted quantile: pairs of (value, weight). */
const qw = (v: number[], w: number[], p: number): number => {
  const idx = v.map((_, i) => i).filter((i) => Number.isFinite(v[i])).sort((a, b) => v[a] - v[b]);
  let tot = 0; for (const i of idx) tot += w[i];
  let acc = 0;
  for (const i of idx) { acc += w[i]; if (acc >= p * tot) return v[i]; }
  return idx.length === 0 ? NaN : v[idx[idx.length - 1]];
};

mkdirSync(OUTDIR, { recursive: true });
log('===== S113b — THE SHAPE OF THE DEFECT: connectivity, loci, and edge-vs-crease alignment =====');
log(`style ${STYLE}  tag ${TAG}   sectors ${SECTORS}  grid ${NTH} x ${NZ} over one ${SEC_DEG} deg sector x [0,${H}] mm`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P0 — IDENTITY. The set is S113's; prove the index space and the surface are the same ones.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S113 dump read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
log(`mesh ${nTri} facets   (S113 dump: 1142166)`);

const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((s) => s.length > 2).map((s) => JSON.parse(s) as Row);
log(`loaded ${rows.length} pair rows from ${NDJ}   (S113 dump: 3282)`);
{
  let bad = 0; let worstD = 0;
  for (const r of rows) {
    for (const [f, tri] of [[r.f1, r.tri1], [r.f2, r.tri2]] as Array<[number, number[]]>) {
      for (let k = 0; k < 9; k += 1) {
        const d = Math.abs(xyz[f * 9 + k] - tri[k]);
        if (d > worstD) worstD = d;
        if (d !== 0) bad += 1;
      }
    }
  }
  log(`INDEX-SPACE IDENTITY: coords disagreeing with STL[f*9..] = ${bad} / ${rows.length * 18}   max |delta| = ${worstD}`);
  if (bad > 0) { log('*** CONTROL FIRED: the NDJSON facet ids do not address this STL. RUN VOID. ***'); process.exit(5); }
}
// 12-fold periodicity of the SURFACE — the whole per-sector-fold argument in P4/P5 rests on it.
{
  let worst = 0;
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 4000; i += 1) {
    const th = rnd() * 2 * Math.PI; const z = rnd() * H;
    worst = Math.max(worst, Math.abs(rA(th, z) - rA(th + SEC_DEG * D2R, z)));
  }
  log(`SURFACE PERIODICITY: max |rA(th,z) - rA(th+${SEC_DEG}deg,z)| over 4000 random points = ${worst.toExponential(3)} mm`);
  if (worst > 1e-9) { log('*** CONTROL FIRED: the surface is NOT 12-fold periodic; the per-sector fold is invalid. RUN VOID. ***'); process.exit(6); }
}

// unique facets + their true areas (from the STL, cross-checked against the dump's area1/area2)
const uniq: number[] = [];
const uIdx = new Map<number, number>();
for (const r of rows) for (const f of [r.f1, r.f2]) if (!uIdx.has(f)) { uIdx.set(f, uniq.length); uniq.push(f); }
const nU = uniq.length;
const areaOf = (f: number): number => {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const ux = xyz[f * 9 + 3] - ax; const uy = xyz[f * 9 + 4] - ay; const uz = xyz[f * 9 + 5] - az;
  const wx = xyz[f * 9 + 6] - ax; const wy = xyz[f * 9 + 7] - ay; const wz = xyz[f * 9 + 8] - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
const uArea = new Float64Array(nU);
for (let i = 0; i < nU; i += 1) uArea[i] = areaOf(uniq[i]);
let targetArea = 0; for (let i = 0; i < nU; i += 1) targetArea += uArea[i];
let meshArea = 0; for (let f = 0; f < nTri; f += 1) meshArea += areaOf(f);
log(`unique facets ${nU} (S113: 6193)   AREA ${targetArea.toFixed(3)} mm2 = ${((targetArea / meshArea) * 100).toFixed(4)}% of ${meshArea.toFixed(1)} mm2  (S113: 69.826 / 0.1816% / 38453.3)`);
log(`${el()}`);
log('');

// per-facet (theta, z) footprint, unwrapped, and the sector fold
const fTh = new Float64Array(nU * 3);
const fZ = new Float64Array(nU * 3);
const fSector = new Int32Array(nU);
const fLocDeg = new Float64Array(nU * 3);   // theta in the folded [0, SEC_DEG) frame, degrees (may exit slightly)
for (let i = 0; i < nU; i += 1) {
  const f = uniq[i];
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  fTh[i * 3] = a; fTh[i * 3 + 1] = b; fTh[i * 3 + 2] = c;
  fZ[i * 3] = xyz[f * 9 + 2]; fZ[i * 3 + 1] = xyz[f * 9 + 5]; fZ[i * 3 + 2] = xyz[f * 9 + 8];
  const degA = (canonTheta(a) * R2D) % 360;
  const sec = Math.min(SECTORS - 1, Math.floor(degA / SEC_DEG));
  fSector[i] = sec;
  const la = degA - sec * SEC_DEG;
  fLocDeg[i * 3] = la;
  fLocDeg[i * 3 + 1] = la + (b - a) * R2D;
  fLocDeg[i * 3 + 2] = la + (c - a) * R2D;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P1 — ADJACENCY AND CONNECTED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
log('══════ P1 — ADJACENCY OF THE 6,193 TARGET FACETS ══════');
// exact-coordinate weld, restricted to the target facets (an STL writes a shared vertex bit-identically,
// so exact equality is the RIGHT test; a tolerance would merge this project's 0.1 um needle pairs).
const vKey = new Map<string, number>();
const vOfFacet = new Int32Array(nU * 3);
for (let i = 0; i < nU; i += 1) {
  const f = uniq[i];
  for (let k = 0; k < 3; k += 1) {
    const key = `${xyz[f * 9 + k * 3]},${xyz[f * 9 + k * 3 + 1]},${xyz[f * 9 + k * 3 + 2]}`;
    let id = vKey.get(key);
    if (id === undefined) { id = vKey.size; vKey.set(key, id); }
    vOfFacet[i * 3 + k] = id;
  }
}
const nV = vKey.size;
log(`welded vertices among target facets: ${nV}  (${(nU * 3 / nV).toFixed(2)} facet-corners per vertex)`);

const vFacets = new Map<number, number[]>();
for (let i = 0; i < nU; i += 1) for (let k = 0; k < 3; k += 1) {
  const v = vOfFacet[i * 3 + k];
  const l = vFacets.get(v); if (l === undefined) vFacets.set(v, [i]); else l.push(i);
}
// pair -> shared vertex count
const shareCount = new Map<number, number>();
for (const l of vFacets.values()) {
  for (let a = 0; a < l.length; a += 1) for (let b = a + 1; b < l.length; b += 1) {
    const lo = Math.min(l[a], l[b]); const hi = Math.max(l[a], l[b]);
    const key = lo * 8192 + hi;   // nU = 6193 < 8192
    shareCount.set(key, (shareCount.get(key) ?? 0) + 1);
  }
}
let nEdgeAdj = 0; let nVertAdj = 0;
const vertDeg = new Int32Array(nU); const edgeDeg = new Int32Array(nU);
const ufV = new Int32Array(nU); const ufE = new Int32Array(nU);
for (let i = 0; i < nU; i += 1) { ufV[i] = i; ufE[i] = i; }
const find = (uf: Int32Array, x0: number): number => {
  let x = x0; while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x;
};
const union = (uf: Int32Array, a: number, b: number): void => {
  const ra = find(uf, a); const rb = find(uf, b); if (ra !== rb) uf[ra] = rb;
};
for (const [key, cnt] of shareCount) {
  const hi = key % 8192; const lo = (key - hi) / 8192;
  nVertAdj += 1; vertDeg[lo] += 1; vertDeg[hi] += 1; union(ufV, lo, hi);
  if (cnt >= 2) { nEdgeAdj += 1; edgeDeg[lo] += 1; edgeDeg[hi] += 1; union(ufE, lo, hi); }
}
log(`in-class adjacency: EDGE-sharing pairs ${nEdgeAdj}   VERTEX-sharing pairs ${nVertAdj}`);
log(`  (the 3,282 target pairs share an edge BY CONSTRUCTION; EDGE-sharing pairs - 3,282 = ${nEdgeAdj - rows.length} further in-class edge contacts)`);

function components(uf: Int32Array): { comp: Int32Array; sizes: number[]; areas: number[]; nComp: number } {
  const rootId = new Map<number, number>();
  const comp = new Int32Array(nU);
  const sizes: number[] = []; const areas: number[] = [];
  for (let i = 0; i < nU; i += 1) {
    const r = find(uf, i);
    let c = rootId.get(r);
    if (c === undefined) { c = sizes.length; rootId.set(r, c); sizes.push(0); areas.push(0); }
    comp[i] = c; sizes[c] += 1; areas[c] += uArea[i];
  }
  return { comp, sizes, areas, nComp: sizes.length };
}
const CV = components(ufV);
const CE = components(ufE);

function reportComponents(name: string, C: { sizes: number[]; areas: number[]; nComp: number }): void {
  const order = C.sizes.map((_, i) => i).sort((a, b) => C.sizes[b] - C.sizes[a]);
  log(`  ${name}: ${C.nComp} components over ${nU} facets / ${targetArea.toFixed(3)} mm2`);
  const buckets = [1, 2, 3, 5, 9, 17, 33, 65, 129, 257, 513, 1025, 2049, 4097];
  const bc = new Array(buckets.length).fill(0); const ba = new Array(buckets.length).fill(0); const bf = new Array(buckets.length).fill(0);
  for (let c = 0; c < C.nComp; c += 1) {
    let bi = 0; for (let k = 0; k < buckets.length; k += 1) if (C.sizes[c] >= buckets[k]) bi = k;
    bc[bi] += 1; ba[bi] += C.areas[c]; bf[bi] += C.sizes[c];
  }
  log('    size-bucket   nComp    facets   facet%    area mm2   area%');
  for (let k = 0; k < buckets.length; k += 1) {
    if (bc[k] === 0) continue;
    const hiB = k + 1 < buckets.length ? buckets[k + 1] - 1 : C.sizes[order[0]];
    log(`      ${String(buckets[k]).padStart(5)}-${String(hiB).padEnd(5)} ${String(bc[k]).padStart(6)} ${String(bf[k]).padStart(9)} ${((bf[k] / nU) * 100).toFixed(2).padStart(7)}% ${ba[k].toFixed(3).padStart(11)} ${((ba[k] / targetArea) * 100).toFixed(2).padStart(6)}%`);
  }
  const top = order.slice(0, 8).map((c) => `${C.sizes[c]}f/${C.areas[c].toFixed(2)}mm2`);
  log(`    LARGEST 8: ${top.join('  ')}`);
  let cum = 0; let k50 = 0; let k90 = 0;
  for (let i = 0; i < order.length; i += 1) {
    cum += C.areas[order[i]];
    if (k50 === 0 && cum >= 0.5 * targetArea) k50 = i + 1;
    if (k90 === 0 && cum >= 0.9 * targetArea) k90 = i + 1;
  }
  log(`    ${k50} components carry 50% of the target AREA; ${k90} carry 90%.`);
}
reportComponents('VERTEX-connectivity', CV);
reportComponents('EDGE-connectivity  ', CE);
log(`${el()}`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P2 — CURVE OR BLOB?
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
log('══════ P2 — CURVES OR BLOBS? in-class degree and component elongation ══════');
function degHist(name: string, deg: Int32Array, maxD: number): void {
  const cnt = new Array(maxD + 2).fill(0); const ar = new Array(maxD + 2).fill(0);
  for (let i = 0; i < nU; i += 1) { const d = Math.min(maxD + 1, deg[i]); cnt[d] += 1; ar[d] += uArea[i]; }
  const parts: string[] = [];
  for (let d = 0; d <= maxD + 1; d += 1) {
    if (cnt[d] === 0) continue;
    parts.push(`${d}${d === maxD + 1 ? '+' : ''}: ${cnt[d]} (${((cnt[d] / nU) * 100).toFixed(1)}% cnt / ${((ar[d] / targetArea) * 100).toFixed(1)}% area)`);
  }
  const dv: number[] = []; for (let i = 0; i < nU; i += 1) dv.push(deg[i]);
  log(`  ${name}  ${parts.join('   ')}`);
  log(`    p10 ${q(dv, 0.1)}  p50 ${q(dv, 0.5)}  p90 ${q(dv, 0.9)}  MAX ${Math.max(...dv)}   area-weighted p50 ${qw(dv, Array.from(uArea), 0.5)}`);
}
degHist('EDGE-degree  (max 3 possible)', edgeDeg, 3);
degHist('VERTEX-degree               ', vertDeg, 12);

// component elongation: PCA of facet centroids in the (arc, z) plane + BFS graph diameter
const adjV: number[][] = Array.from({ length: nU }, () => []);
for (const key of shareCount.keys()) {
  const hi = key % 8192; const lo = (key - hi) / 8192;
  adjV[lo].push(hi); adjV[hi].push(lo);
}
const cArc = new Float64Array(nU); const cZ = new Float64Array(nU);
for (let i = 0; i < nU; i += 1) {
  const zc = (fZ[i * 3] + fZ[i * 3 + 1] + fZ[i * 3 + 2]) / 3;
  const thc = (fTh[i * 3] + fTh[i * 3 + 1] + fTh[i * 3 + 2]) / 3;
  cZ[i] = zc; cArc[i] = thc * rBase(zc);
}
interface CompGeom { c: number; n: number; area: number; elong: number; dirDeg: number; extMm: number; zLo: number; zHi: number; thSpanDeg: number; diamHops: number; diamMm: number }
const compGeom: CompGeom[] = [];
{
  const members: number[][] = Array.from({ length: CV.nComp }, () => []);
  for (let i = 0; i < nU; i += 1) members[CV.comp[i]].push(i);
  const dist = new Int32Array(nU).fill(-1);
  const queue = new Int32Array(nU);
  const bfs = (src: number): { far: number; hops: number } => {
    let head = 0; let tail = 0; queue[tail] = src; tail += 1; dist[src] = 0;
    let far = src; let best = 0;
    while (head < tail) {
      const u = queue[head]; head += 1;
      if (dist[u] > best) { best = dist[u]; far = u; }
      for (const v of adjV[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; queue[tail] = v; tail += 1; }
    }
    for (let k = 0; k < tail; k += 1) dist[queue[k]] = -1;
    return { far, hops: best };
  };
  for (let c = 0; c < CV.nComp; c += 1) {
    const mem = members[c];
    let sa = 0; let sz = 0;
    // theta unwrap within a component: components are local, but a component can straddle the 0/2pi seam.
    const arc0 = cArc[mem[0]];
    const circ = 2 * Math.PI * rBase(cZ[mem[0]]);
    const aa: number[] = []; const zz: number[] = [];
    for (const i of mem) {
      let a = cArc[i];
      while (a - arc0 > circ / 2) a -= circ;
      while (a - arc0 < -circ / 2) a += circ;
      aa.push(a); zz.push(cZ[i]); sa += a; sz += cZ[i];
    }
    sa /= mem.length; sz /= mem.length;
    let sxx = 0; let sxy = 0; let syy = 0;
    for (let k = 0; k < mem.length; k += 1) { const dx = aa[k] - sa; const dy = zz[k] - sz; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    sxx /= mem.length; sxy /= mem.length; syy /= mem.length;
    const tr = sxx + syy; const det = sxx * syy - sxy * sxy;
    const disc = Math.max(0, tr * tr / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc); const l2 = Math.max(0, tr / 2 - Math.sqrt(disc));
    const ev = Math.abs(sxy) > 1e-18 ? [l1 - syy, sxy] : (sxx >= syy ? [1, 0] : [0, 1]);
    const dirDeg = Math.abs(Math.atan2(ev[1], ev[0]) * R2D);     // 0 = horizontal (constant z), 90 = vertical
    const elong = l2 > 1e-18 ? Math.sqrt(l1 / l2) : Infinity;
    const bfs1 = bfs(mem[0]); const bfs2 = bfs(bfs1.far);
    compGeom.push({
      c, n: mem.length, area: CV.areas[c], elong, dirDeg: dirDeg > 90 ? 180 - dirDeg : dirDeg,
      extMm: 2 * Math.sqrt(Math.max(0, l1)) * Math.sqrt(3), zLo: mn(zz), zHi: mx(zz),
      thSpanDeg: (mx(aa) - mn(aa)) / rBase(sz) * R2D, diamHops: bfs2.hops, diamMm: 0,
    });
  }
}
{
  const big = compGeom.filter((g) => g.n >= 4).sort((a, b) => b.area - a.area);
  let bigArea = 0; for (const g of big) bigArea += g.area;
  log(`  components with >= 4 facets: ${big.length} of ${CV.nComp}, carrying ${bigArea.toFixed(3)} mm2 = ${((bigArea / targetArea) * 100).toFixed(2)}% of the target area`);
  const els = big.map((g) => g.elong); const ws = big.map((g) => g.area);
  log(`  PCA elongation sqrt(l1/l2) of those, area-weighted: p10 ${qw(els, ws, 0.1).toFixed(2)}  p50 ${qw(els, ws, 0.5).toFixed(2)}  p90 ${qw(els, ws, 0.9).toFixed(2)}  MAX ${mx(els).toFixed(2)}`);
  const dirs = big.map((g) => g.dirDeg);
  log(`  principal direction |angle| from the HORIZONTAL in (arc,z), area-weighted: p10 ${qw(dirs, ws, 0.1).toFixed(1)}  p50 ${qw(dirs, ws, 0.5).toFixed(1)}  p90 ${qw(dirs, ws, 0.9).toFixed(1)} deg   (0 = a horizontal ribbon, 90 = a vertical one)`);
  const hops = big.map((g) => g.diamHops); const ratio = big.map((g) => g.diamHops / Math.max(1, Math.sqrt(g.n)));
  log(`  BFS graph DIAMETER (hops), area-weighted: p10 ${qw(hops, ws, 0.1)}  p50 ${qw(hops, ws, 0.5)}  p90 ${qw(hops, ws, 0.9)}  MAX ${mx(hops)}`);
  log(`  diameter / sqrt(n)  (a compact BLOB ~ 1-2, a 1-D RIBBON ~ sqrt(n)): p10 ${qw(ratio, ws, 0.1).toFixed(2)}  p50 ${qw(ratio, ws, 0.5).toFixed(2)}  p90 ${qw(ratio, ws, 0.9).toFixed(2)}`);
  log('  TOP 12 components by area:');
  log('     n   area mm2  elong  dir(deg)  extent mm   z-range mm        th-span deg  diam(hops)');
  for (const g of big.slice(0, 12)) {
    log(`   ${String(g.n).padStart(4)} ${g.area.toFixed(3).padStart(10)} ${g.elong.toFixed(1).padStart(6)} ${g.dirDeg.toFixed(1).padStart(9)} ${g.extMm.toFixed(2).padStart(10)}   ${g.zLo.toFixed(1)}-${g.zHi.toFixed(1)}`.padEnd(78) + `${g.thSpanDeg.toFixed(2).padStart(6)} ${String(g.diamHops).padStart(10)}`);
  }
}
log(`${el()}`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P3 — THE CREASE LOCI, MEASURED. A kink field over one fundamental domain.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
log('══════ P3 — THE CREASE LOCI (measured with fdNormals, no loci file, no style knowledge) ══════');
const dThDeg = SEC_DEG / NTH; const dz = H / NZ;
const arcCell = dThDeg * D2R * rBase(H / 2);
log(`  grid cell = ${dThDeg.toFixed(4)} deg (${arcCell.toFixed(4)} mm arc at mid-height) x ${dz.toFixed(4)} mm in z`);
const hArc = arcCell; const hZ = dz;
log(`  detector: fdNormals one-sided sampler, hArc ${hArc.toFixed(5)} mm, hZ ${hZ.toFixed(5)} mm; indicator = MAX pairwise angle among the 4 one-sided normals`);
// *** THE h-INVARIANCE TEST — THE CORRECTION THAT MAKES THIS A CREASE DETECTOR RATHER THAN A CURVATURE
// DETECTOR. Measured, on this very mesh, in the first run of this tool: at a bare 5-deg threshold the
// "crease set" was dominated by TWO components of 17,436 and 12,272 cells, 0.96 mm and 0.71 mm THICK,
// covering the whole upper tier — and they VANISHED between the 5-deg and 10-deg thresholds. They are not
// creases. A finite-difference kink indicator at step h returns ~h*kappa on a smooth but sharply curved
// patch and the FULL DIHEDRAL, h-independently, on a C0 crease. That is precisely fixture H2's logic
// (angle x0.9968 invariant under five halvings on a straddle, x28.43 decay on a smooth control), applied
// to the surface instead of to the mesh. So the field is scanned at h AND at 4h and a cell is a crease
// cell only when the indicator DOES NOT GROW with the step:
//        kink(h) >= THR   AND   kink(4h) <= INV_MAX * kink(h)
// A smooth high-curvature cell has kink(4h) ~ 4*kink(h) and is rejected.
//
// *** AND A SECOND CORRECTION, ALSO MEASURED HERE, ALSO MINE. The invariance test ALONE shattered the loci
// into 1,212 fragments averaging 2 cells. A one-sided difference taken at perpendicular distance d from a
// locus returns only a FRACTION ~(1 - d/h) of the dihedral, so kink(4h)/kink(h) climbs steeply with d and
// the test survives only |d| < ~0.55h — thinner than a grid cell, so the band breaks up. The fix is NOT a
// looser ratio (that re-admits the curvature) but RIDGE THINNING: h is raised to ONE full cell, and a cell
// is a locus cell only if it is a LOCAL MAXIMUM of kink(h) along theta or along z. At a local maximum d is
// at most half a cell = 0.5h, so a genuine crease still reads >= ~0.5*D there and its ratio stays near 1,
// while smooth curvature still reads ~4. Thinning also guarantees a 1-cell-wide, 8-connected band.
// Threshold AND ratio are both swept and a RESOLUTION CHECK (half grid) is printed, so the answer is
// quoted from a plateau rather than from a chosen number. ***
const sc = new Float64Array(12);
const maxSpread = (nc: number): number => {
  let m = 0;
  for (let a = 0; a < nc; a += 1) for (let b = a + 1; b < nc; b += 1) {
    let d = sc[3 * a] * sc[3 * b] + sc[3 * a + 1] * sc[3 * b + 1] + sc[3 * a + 2] * sc[3 * b + 2];
    d = d > 1 ? 1 : d < -1 ? -1 : d;
    const ang = Math.acos(d);
    if (ang > m) m = ang;
  }
  return m;
};
function scanKink(nth: number, nz: number): { k1: Float32Array; k4: Float32Array } {
  const dTh = SEC_DEG / nth; const dZ = H / nz;
  const hA = dTh * D2R * rBase(H / 2); const hZl = dZ;
  const s1 = fdNormals(rA, H, hA, hZl);
  const s4 = fdNormals(rA, H, 4 * hA, 4 * hZl);
  const k1 = new Float32Array(nth * nz); const k4 = new Float32Array(nth * nz);
  for (let j = 0; j < nz; j += 1) {
    const z = (j + 0.5) * dZ;
    for (let i = 0; i < nth; i += 1) {
      const th = (i + 0.5) * dTh * D2R;
      k1[j * nth + i] = maxSpread(s1(th, z, sc)) * R2D;
      k4[j * nth + i] = maxSpread(s4(th, z, sc)) * R2D;
    }
  }
  return { k1, k4 };
}
/** ridge-thinned locus mask: threshold + LOCAL MAXIMUM along theta or z + h-invariance. */
function creaseMask(k1: Float32Array, k4: Float32Array, nth: number, nz: number, thr: number, invMax: number): Uint8Array {
  const out = new Uint8Array(nth * nz);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nth; i += 1) {
    const s = j * nth + i;
    const v = k1[s];
    if (v < thr) continue;
    if (k4[s] > invMax * v) continue;
    const il = (i - 1 + nth) % nth; const ir = (i + 1) % nth;
    const lmTh = v >= k1[j * nth + il] && v >= k1[j * nth + ir];
    const lmZ = (j === 0 || v >= k1[(j - 1) * nth + i]) && (j === nz - 1 || v >= k1[(j + 1) * nth + i]);
    if (lmTh || lmZ) out[s] = 1;
  }
  return out;
}
let kink = new Float32Array(0); let kink4 = new Float32Array(0);
{
  const tB0 = Date.now();
  const r0 = scanKink(NTH, NZ);
  kink = r0.k1; kink4 = r0.k4;
  log(`  scanned ${NTH * NZ} cells at h AND 4h (${(NTH * NZ * 10 / 1e6).toFixed(1)}M rA evals) in ${((Date.now() - tB0) / 1000).toFixed(1)}s`);
}
const INV_MAX = envF('PF_S113B_INVMAX', 2.0);
{
  const vals: number[] = []; for (let k = 0; k < kink.length; k += 40) vals.push(kink[k]);
  log(`  kink(h) over the domain (every 40th cell, n=${vals.length}): p50 ${q(vals, 0.5).toExponential(2)}  p90 ${q(vals, 0.9).toExponential(2)}  p99 ${q(vals, 0.99).toFixed(3)}  MAX ${mx(vals).toFixed(2)} deg`);
  let n5 = 0; let n5fail = 0; let n45 = 0; let n45fail = 0;
  for (let k = 0; k < kink.length; k += 1) {
    if (kink[k] >= 5) { n5 += 1; if (kink4[k] > INV_MAX * kink[k]) n5fail += 1; }
    if (kink[k] >= 45) { n45 += 1; if (kink4[k] > INV_MAX * kink[k]) n45fail += 1; }
  }
  log(`  *** INSTRUMENT-DEFECT MEASUREMENT (this tool's own first run had it): of the ${n5} cells with kink(h) >= 5 deg,`);
  log(`      ${n5fail} = ${((n5fail / Math.max(1, n5)) * 100).toFixed(1)}% GROW with the step (kink(4h) > ${INV_MAX}x kink(h)) => SMOOTH HIGH CURVATURE, not a crease.`);
  log(`      At a 45-deg threshold only ${n45fail}/${n45} = ${((n45fail / Math.max(1, n45)) * 100).toFixed(1)}% fail. The bare-threshold detector is wrong mostly at LOW thresholds.`);
}

/** components of the crease-cell set at a given threshold + h-invariance; theta wraps, z does not. */
function creaseComponents(thrDeg: number, invMax = INV_MAX): { lab: Int32Array; nComp: number; sizes: number[]; cells: number[][] } {
  const mask = creaseMask(kink, kink4, NTH, NZ, thrDeg, invMax);
  const isC = (s: number): boolean => mask[s] === 1;
  const n = NTH * NZ;
  const lab = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const sizes: number[] = []; const cells: number[][] = [];
  for (let s = 0; s < n; s += 1) {
    if (!isC(s) || lab[s] >= 0) continue;
    const c = sizes.length; sizes.push(0); const list: number[] = [];
    let sp = 0; stack[sp] = s; sp += 1; lab[s] = c;
    while (sp > 0) {
      sp -= 1; const u = stack[sp]; list.push(u); sizes[c] += 1;
      const iu = u % NTH; const ju = (u - iu) / NTH;
      for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) {
        if (di === 0 && dj === 0) continue;
        const jv = ju + dj; if (jv < 0 || jv >= NZ) continue;
        const iv = ((iu + di) % NTH + NTH) % NTH;
        const v = jv * NTH + iv;
        if (lab[v] >= 0 || !isC(v)) continue;
        lab[v] = c; stack[sp] = v; sp += 1;
      }
    }
    cells.push(list);
  }
  return { lab, nComp: sizes.length, sizes, cells };
}
log('  THRESHOLD / INVARIANCE SWEEP, ridge-thinned. Quote from a PLATEAU, never from a chosen number:');
log('     thr deg  invMax   locus cells   components   largest (cells)   total length mm/sector');
const cellPitch = 0.5 * (arcCell + dz);
for (const inv of [1.5, 2.0, 3.0, 1e9]) {
  for (const thr of [5, 10, 20, 45]) {
    const cc = creaseComponents(thr, inv);
    let nc = 0; for (const list of cc.cells) nc += list.length;
    log(`     ${String(thr).padStart(6)}  ${(inv > 1e8 ? 'OFF' : inv.toFixed(1)).padStart(6)}   ${String(nc).padStart(11)}   ${String(cc.nComp).padStart(10)}   ${String(cc.cells.length === 0 ? 0 : mx(cc.sizes)).padStart(15)}   ${(nc * cellPitch).toFixed(1).padStart(22)}`);
  }
}
// RESOLUTION CHECK — a resolved curve must not gain length when the grid is halved.
{
  const nth2 = Math.round(NTH / 2); const nz2 = Math.round(NZ / 2);
  const half = scanKink(nth2, nz2);
  const m2 = creaseMask(half.k1, half.k4, nth2, nz2, KINK_DEG, INV_MAX);
  let n2 = 0; for (let t = 0; t < m2.length; t += 1) n2 += m2[t];
  const len2 = n2 * (arcCell + dz);
  const mFull = creaseMask(kink, kink4, NTH, NZ, KINK_DEG, INV_MAX);
  let nFull = 0; for (let t = 0; t < mFull.length; t += 1) nFull += mFull[t];
  const lenFull = nFull * cellPitch;
  log(`  RESOLUTION CHECK at the primary cuts: full grid ${nFull} cells => ${lenFull.toFixed(1)} mm/sector;  HALF grid ${n2} cells => ${len2.toFixed(1)} mm/sector  (ratio ${(len2 / Math.max(1e-9, lenFull)).toFixed(2)}x; a RESOLVED curve gives ~1)`);
  if (envF('PF_S113B_FINE', 1) > 0) {
    const nth4 = NTH * 2; const nz4 = NZ * 2;
    const fine = scanKink(nth4, nz4);
    const m4 = creaseMask(fine.k1, fine.k4, nth4, nz4, KINK_DEG, INV_MAX);
    let n4 = 0; for (let t = 0; t < m4.length; t += 1) n4 += m4[t];
    const len4 = n4 * 0.5 * cellPitch;
    log(`  RESOLUTION CHECK, DOUBLE grid ${nth4}x${nz4}: ${n4} cells => ${len4.toFixed(1)} mm/sector  (${(len4 / Math.max(1e-9, lenFull)).toFixed(2)}x the full grid)`);
    const rFine = len4 / Math.max(1e-9, lenFull);
    log(`    => full->double moves the length ${rFine.toFixed(2)}x. ${Math.abs(rFine - 1) < 0.05 ? 'CONVERGED at the full grid (the HALF grid over-reads; do not quote it).' : 'NOT CONVERGED — quote the length as an upper bound only.'}`);
  }
}
const CC = creaseComponents(KINK_DEG);
log(`  PRIMARY: kink(h) >= ${KINK_DEG} deg AND kink(4h) <= ${INV_MAX}x kink(h)  =>  ${CC.nComp} crease components in ONE ${SEC_DEG}-deg sector (x${SECTORS} sectors on the pot)`);

// per-crease-component geometry: BFS diameter path length in mm, band thickness, extent
interface CreaseGeom { c: number; cells: number; areaMm2: number; lenMm: number; thickMm: number; thLoDeg: number; thHiDeg: number; zLo: number; zHi: number; dirDeg: number; hopOfCell: Int32Array; maxHop: number; wraps: boolean }
const cellArcAt = (j: number): number => dThDeg * D2R * rBase((j + 0.5) * dz);
const creaseGeom: CreaseGeom[] = [];
{
  const distC = new Int32Array(NTH * NZ).fill(-1);
  const par = new Int32Array(NTH * NZ).fill(-1);
  const queue = new Int32Array(NTH * NZ);
  const bfs = (src: number, list: number[]): { far: number; hops: number } => {
    for (const u of list) { distC[u] = -1; par[u] = -1; }
    let head = 0; let tail = 0; queue[tail] = src; tail += 1; distC[src] = 0;
    let far = src; let best = 0;
    while (head < tail) {
      const u = queue[head]; head += 1;
      if (distC[u] > best) { best = distC[u]; far = u; }
      const iu = u % NTH; const ju = (u - iu) / NTH;
      for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) {
        if (di === 0 && dj === 0) continue;
        const jv = ju + dj; if (jv < 0 || jv >= NZ) continue;
        const iv = ((iu + di) % NTH + NTH) % NTH;
        const v = jv * NTH + iv;
        if (CC.lab[v] !== CC.lab[u] || distC[v] >= 0) continue;
        distC[v] = distC[u] + 1; par[v] = u; queue[tail] = v; tail += 1;
      }
    }
    return { far, hops: best };
  };
  for (let c = 0; c < CC.nComp; c += 1) {
    const list = CC.cells[c];
    const a = bfs(list[0], list); const b = bfs(a.far, list);
    // reconstruct the hop-optimal path and sum its true mm length
    let lenMm = 0; let u = b.far;
    while (par[u] >= 0) {
      const p = par[u];
      const iu = u % NTH; const ju = (u - iu) / NTH; const ip = p % NTH; const jp = (p - ip) / NTH;
      let di = iu - ip; if (di > NTH / 2) di -= NTH; if (di < -NTH / 2) di += NTH;
      lenMm += Math.hypot(di * cellArcAt(ju), (ju - jp) * dz);
      u = p;
    }
    // keep the hop labelling from the FINAL bfs (rooted at a.far) for coverage-along-length
    const hopOfCell = new Int32Array(list.length);
    for (let k = 0; k < list.length; k += 1) hopOfCell[k] = distC[list[k]];
    let areaMm2 = 0; let thLo = 1e9; let thHi = -1e9; let zLo = 1e9; let zHi = -1e9;
    let sA = 0; let sZ = 0;
    for (const s of list) {
      const i = s % NTH; const j = (s - i) / NTH;
      areaMm2 += cellArcAt(j) * dz;
      const td = (i + 0.5) * dThDeg; const zz = (j + 0.5) * dz;
      if (td < thLo) thLo = td; if (td > thHi) thHi = td;
      if (zz < zLo) zLo = zz; if (zz > zHi) zHi = zz;
      sA += td * D2R * rBase(zz); sZ += zz;
    }
    sA /= list.length; sZ /= list.length;
    let sxx = 0; let sxy = 0; let syy = 0;
    for (const s of list) {
      const i = s % NTH; const j = (s - i) / NTH;
      const zz = (j + 0.5) * dz; const dxa = (i + 0.5) * dThDeg * D2R * rBase(zz) - sA; const dyb = zz - sZ;
      sxx += dxa * dxa; sxy += dxa * dyb; syy += dyb * dyb;
    }
    const tr = sxx + syy; const disc = Math.max(0, tr * tr / 4 - (sxx * syy - sxy * sxy));
    const l1 = tr / 2 + Math.sqrt(disc);
    const ev = Math.abs(sxy) > 1e-18 ? [l1 - syy, sxy] : (sxx >= syy ? [1, 0] : [0, 1]);
    let dirDeg = Math.abs(Math.atan2(ev[1], ev[0]) * R2D); if (dirDeg > 90) dirDeg = 180 - dirDeg;
    // WRAP FLAG: a component that closes around theta is a CYCLE, and a double-BFS diameter on a cycle is
    // at most HALF the circumference — so `lenMm` is a LOWER BOUND there and must be labelled, not quoted.
    let wraps = false;
    for (const s of list) {
      const i = s % NTH; if (i !== 0) continue;
      const j = (s - i) / NTH;
      for (let dj = -1; dj <= 1 && !wraps; dj += 1) {
        const jv = j + dj; if (jv < 0 || jv >= NZ) continue;
        if (CC.lab[jv * NTH + (NTH - 1)] === c) wraps = true;
      }
      if (wraps) break;
    }
    creaseGeom.push({
      c, cells: list.length, areaMm2, lenMm, thickMm: lenMm > 1e-9 ? areaMm2 / lenMm : NaN,
      thLoDeg: thLo, thHiDeg: thHi, zLo, zHi, dirDeg, hopOfCell, maxHop: b.hops, wraps,
    });
  }
}
{
  const byLen = creaseGeom.slice().sort((a, b) => b.lenMm - a.lenMm);
  let totLen = 0; for (const g of creaseGeom) totLen += g.lenMm;
  log(`  TOTAL crease length in one sector ${totLen.toFixed(2)} mm  =>  ${(totLen * SECTORS).toFixed(1)} mm on the whole pot`);
  log(`  band thickness (area/length) p50 ${q(creaseGeom.map((g) => g.thickMm), 0.5).toFixed(4)} mm  (1 cell ~ ${arcCell.toFixed(4)} x ${dz.toFixed(4)} mm)`);
  log(`  components that CLOSE around theta (length is then a LOWER bound = half the cycle): ${creaseGeom.filter((g) => g.wraps).length}`);
  log('  TOP 14 crease components by length:');
  log('      id   cells   length mm   thick mm   theta range (deg)     z range (mm)     dir(deg from horiz)  wraps');
  for (const g of byLen.slice(0, 14)) {
    log(`   ${String(g.c).padStart(5)} ${String(g.cells).padStart(7)} ${g.lenMm.toFixed(2).padStart(11)} ${g.thickMm.toFixed(4).padStart(10)}   ${g.thLoDeg.toFixed(2).padStart(6)}-${g.thHiDeg.toFixed(2).padEnd(6)}   ${g.zLo.toFixed(1).padStart(6)}-${g.zHi.toFixed(1).padEnd(6)} ${g.dirDeg.toFixed(1).padStart(10)}  ${g.wraps ? 'YES' : '.'}`);
  }
}
log(`${el()}`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P4 — WHERE THE TARGET SET SITS ON THOSE LOCI
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
log('══════ P4 — THE TARGET SET ON THE LOCI: theta bins, which curves, and coverage ══════');
// independent theta-mod-SEC_DEG histogram, COUNT and AREA
{
  const bc = new Array(12).fill(0); const ba = new Array(12).fill(0);
  for (const r of rows) {
    const b = Math.min(11, Math.floor((r.thMod30 / SEC_DEG) * 12));
    bc[b] += 1; ba[b] += r.area1 + r.area2;
  }
  let tot = 0; for (const v of ba) tot += v;
  log(`  PAIR theta mod ${SEC_DEG} deg, 12 bins  COUNT: ${bc.join(' ')}   (S113 dump: 903 464 226 51 27 26 28 15 42 177 379 944)`);
  log(`                                        AREA%: ${ba.map((v) => ((v / tot) * 100).toFixed(1)).join(' ')}`);
  const edge = bc[0] + bc[1] + bc[10] + bc[11]; const edgeA = ba[0] + ba[1] + ba[10] + ba[11];
  log(`  bins 0,1,10,11 (the sector BOUNDARY): ${edge}/${rows.length} = ${((edge / rows.length) * 100).toFixed(1)}% by count, ${((edgeA / tot) * 100).toFixed(1)}% by pair area`);
}
// rasterize the target footprints into the folded grid, recording which SECTOR covered each cell
const coverAny = new Uint8Array(NTH * NZ);
const coverBySector: Uint8Array[] = Array.from({ length: SECTORS }, () => new Uint8Array(NTH * NZ));
const facetCells: Int32Array[] = new Array(nU);
{
  for (let i = 0; i < nU; i += 1) {
    const t0 = fLocDeg[i * 3]; const t1 = fLocDeg[i * 3 + 1]; const t2 = fLocDeg[i * 3 + 2];
    const z0 = fZ[i * 3]; const z1 = fZ[i * 3 + 1]; const z2 = fZ[i * 3 + 2];
    const iLo = Math.floor(Math.min(t0, t1, t2) / dThDeg) - 1; const iHi = Math.ceil(Math.max(t0, t1, t2) / dThDeg) + 1;
    const jLo = Math.max(0, Math.floor(Math.min(z0, z1, z2) / dz) - 1); const jHi = Math.min(NZ - 1, Math.ceil(Math.max(z0, z1, z2) / dz) + 1);
    const d00 = t1 - t0; const d01 = z1 - z0; const d10 = t2 - t0; const d11 = z2 - z0;
    const det = d00 * d11 - d01 * d10;
    const out: number[] = [];
    if (Math.abs(det) > 1e-18) {
      for (let j = jLo; j <= jHi; j += 1) {
        const zc = (j + 0.5) * dz;
        for (let ii = iLo; ii <= iHi; ii += 1) {
          const tc = (ii + 0.5) * dThDeg;
          const px = tc - t0; const py = zc - z0;
          const u = (px * d11 - py * d10) / det;
          const v = (py * d00 - px * d01) / det;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const iw = ((ii % NTH) + NTH) % NTH;
          const s = j * NTH + iw;
          out.push(s);
          coverAny[s] = 1; coverBySector[fSector[i]][s] = 1;
        }
      }
    }
    facetCells[i] = Int32Array.from(out);
  }
  let nCov = 0; for (let k = 0; k < coverAny.length; k += 1) nCov += coverAny[k];
  log(`  target footprints rasterized: ${nCov} folded cells covered (${((nCov / (NTH * NZ)) * 100).toFixed(2)}% of one sector; the 12 sectors' footprints are OVERLAID here)`);
}
// which crease components do the target facets sit on?
{
  const hitCells = new Int32Array(CC.nComp);
  const hitFacets = new Int32Array(CC.nComp);
  const hitArea = new Float64Array(CC.nComp);
  const perFacetComp: number[][] = new Array(nU);
  for (let i = 0; i < nU; i += 1) {
    const seen = new Set<number>();
    for (const s of facetCells[i]) if (CC.lab[s] >= 0) seen.add(CC.lab[s]);
    perFacetComp[i] = Array.from(seen);
    for (const c of seen) { hitFacets[c] += 1; hitArea[c] += uArea[i]; }
  }
  for (let s = 0; s < NTH * NZ; s += 1) if (coverAny[s] === 1 && CC.lab[s] >= 0) hitCells[CC.lab[s]] += 1;
  let nOnCrease = 0; let areaOnCrease = 0; let nOff = 0; let areaOff = 0;
  for (let i = 0; i < nU; i += 1) {
    if (perFacetComp[i].length > 0) { nOnCrease += 1; areaOnCrease += uArea[i]; } else { nOff += 1; areaOff += uArea[i]; }
  }
  log(`  CROSS-CHECK of S113's crease LABEL against this independent kink map:`);
  log(`    target facets whose footprint contains a crease cell: ${nOnCrease}/${nU} = ${((nOnCrease / nU) * 100).toFixed(1)}% by count, ${((areaOnCrease / targetArea) * 100).toFixed(1)}% by area`);
  log(`    target facets with NO crease cell in the footprint:   ${nOff}/${nU} = ${((nOff / nU) * 100).toFixed(1)}% by count, ${((areaOff / targetArea) * 100).toFixed(1)}% by area (area ${areaOff.toFixed(3)} mm2)`);
  const multi = perFacetComp.filter((a) => a.length >= 2).length;
  log(`    target facets straddling >= 2 DISTINCT crease components: ${multi} = ${((multi / nU) * 100).toFixed(1)}%`);
  const touched = creaseGeom.filter((g) => hitFacets[g.c] > 0);
  let touchedLen = 0; for (const g of touched) touchedLen += g.lenMm;
  let allLen = 0; for (const g of creaseGeom) allLen += g.lenMm;
  log(`  DISTINCT CREASE CURVES TOUCHED: ${touched.length} of ${CC.nComp} in the fundamental domain`);
  log(`    those curves hold ${touchedLen.toFixed(2)} mm of the sector's ${allLen.toFixed(2)} mm of crease = ${((touchedLen / allLen) * 100).toFixed(1)}%`);
  log('  PER-CURVE COVERAGE (folded over all 12 sectors, then per sector):');
  log('      id  length mm   tgt facets   tgt area mm2   cells hit / cells   cover%(folded)   per-SECTOR cover%: p50  MAX   sectors>1%');
  const byArea = touched.slice().sort((a, b) => hitArea[b.c] - hitArea[a.c]);
  const perCurveSectorCov: Array<{ c: number; cov: number[] }> = [];
  for (const g of byArea) {
    const list = CC.cells[g.c];
    // coverage along LENGTH: bin cells by BFS hop from the diameter endpoint; a bin counts as covered
    // if ANY of its cells is covered. Bin width = 1 hop ~ one cell ~ length/maxHop mm.
    const nBins = g.maxHop + 1;
    const binAny = new Uint8Array(nBins);
    const binHas = new Uint8Array(nBins);
    const binSec: Uint8Array[] = Array.from({ length: SECTORS }, () => new Uint8Array(nBins));
    for (let k = 0; k < list.length; k += 1) {
      const hp = g.hopOfCell[k]; if (hp < 0) continue;
      binHas[hp] = 1;
      if (coverAny[list[k]] === 1) binAny[hp] = 1;
      for (let s = 0; s < SECTORS; s += 1) if (coverBySector[s][list[k]] === 1) binSec[s][hp] = 1;
    }
    let hb = 0; let cb = 0; for (let b = 0; b < nBins; b += 1) { if (binHas[b] === 1) { hb += 1; if (binAny[b] === 1) cb += 1; } }
    const secCov: number[] = [];
    for (let s = 0; s < SECTORS; s += 1) {
      let c2 = 0; for (let b = 0; b < nBins; b += 1) if (binHas[b] === 1 && binSec[s][b] === 1) c2 += 1;
      secCov.push(hb > 0 ? c2 / hb : 0);
    }
    perCurveSectorCov.push({ c: g.c, cov: secCov });
    const above = secCov.filter((v) => v > 0.01).length;
    log(`   ${String(g.c).padStart(5)} ${g.lenMm.toFixed(2).padStart(10)} ${String(hitFacets[g.c]).padStart(12)} ${hitArea[g.c].toFixed(3).padStart(14)}   ${String(hitCells[g.c]).padStart(6)} / ${String(g.cells).padEnd(7)} ${((cb / Math.max(1, hb)) * 100).toFixed(1).padStart(13)}%  ${(q(secCov, 0.5) * 100).toFixed(1).padStart(8)}% ${(mx(secCov) * 100).toFixed(1).padStart(6)}% ${String(above).padStart(11)}`);
  }
  writeFileSync(`${OUTDIR}/S113B_CURVECOV_${TAG}.json`, `${JSON.stringify(perCurveSectorCov, null, 1)}\n`);
}
log(`${el()}`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P5 — DOES THE SHARED EDGE RUN ALONG THE CREASE, OR ACROSS IT?
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
log('══════ P5 — SHARED EDGE vs CREASE TANGENT (footprint PCA probe, 3 scales, 2 controls) ══════');
// spatial lookup: for each grid cell, is it a crease cell (CC.lab). Nearest-crease search rings outward.
interface Probe { okDist: boolean; distMm: number; comp: number; tanA: number; tanZ: number; aniso: number; n: number }
function nearestCrease(iq: number, jq: number, maxRings: number): { s: number; distMm: number } | null {
  const zc = (jq + 0.5) * dz; const ac = cellArcAt(jq);
  let best = -1; let bestD = Infinity;
  for (let ring = 0; ring <= maxRings; ring += 1) {
    if (best >= 0 && bestD < (ring - 1) * Math.min(ac, dz)) break;
    for (let dj = -ring; dj <= ring; dj += 1) {
      const jv = jq + dj; if (jv < 0 || jv >= NZ) continue;
      const iStep = Math.abs(dj) === ring ? 1 : 2 * ring;
      for (let di = -ring; di <= ring; di += (iStep === 0 ? 1 : iStep)) {
        const iv = ((iq + di) % NTH + NTH) % NTH;
        const s = jv * NTH + iv;
        if (CC.lab[s] < 0) continue;
        const d = Math.hypot(di * ac, dj * dz);
        if (d < bestD) { bestD = d; best = s; }
      }
    }
  }
  return best < 0 ? null : { s: best, distMm: bestD };
}
function tangentAt(thAbsRad: number, zq: number, R: number): Probe {
  const locDeg = (((thAbsRad * R2D) % SEC_DEG) + SEC_DEG) % SEC_DEG;
  const iq = Math.min(NTH - 1, Math.max(0, Math.floor(locDeg / dThDeg)));
  const jq = Math.min(NZ - 1, Math.max(0, Math.floor(zq / dz)));
  const ac = cellArcAt(jq);
  const near = nearestCrease(iq, jq, Math.ceil(Math.max(R / ac, R / dz)) + 6);
  if (near === null) return { okDist: false, distMm: Infinity, comp: -1, tanA: 0, tanZ: 0, aniso: 0, n: 0 };
  const comp = CC.lab[near.s];
  const di = Math.ceil(R / ac); const dj = Math.ceil(R / dz);
  let sA = 0; let sZ = 0; let n = 0;
  const aa: number[] = []; const zz: number[] = [];
  for (let j = jq - dj; j <= jq + dj; j += 1) {
    if (j < 0 || j >= NZ) continue;
    for (let i = iq - di; i <= iq + di; i += 1) {
      const iv = ((i % NTH) + NTH) % NTH;
      const s = j * NTH + iv;
      if (CC.lab[s] !== comp) continue;
      const A = (i - iq) * ac; const Z = (j - jq) * dz;
      if (Math.hypot(A, Z) > R) continue;
      aa.push(A); zz.push(Z); sA += A; sZ += Z; n += 1;
    }
  }
  if (n < 3) return { okDist: true, distMm: near.distMm, comp, tanA: 0, tanZ: 0, aniso: 0, n };
  sA /= n; sZ /= n;
  let sxx = 0; let sxy = 0; let syy = 0;
  for (let k = 0; k < n; k += 1) { const dx = aa[k] - sA; const dy = zz[k] - sZ; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  sxx /= n; sxy /= n; syy /= n;
  const tr = sxx + syy; const disc = Math.max(0, tr * tr / 4 - (sxx * syy - sxy * sxy));
  const l1 = tr / 2 + Math.sqrt(disc); const l2 = Math.max(0, tr / 2 - Math.sqrt(disc));
  let ex = l1 - syy; let ey = sxy;
  if (Math.abs(sxy) < 1e-18) { ex = sxx >= syy ? 1 : 0; ey = sxx >= syy ? 0 : 1; }
  const L = Math.hypot(ex, ey);
  return { okDist: true, distMm: near.distMm, comp, tanA: ex / L, tanZ: ey / L, aniso: l2 > 1e-18 ? Math.sqrt(l1 / l2) : Infinity, n };
}

// the shared-edge direction of each pair, in the (arc, z) plane
const eDirA = new Float64Array(rows.length); const eDirZ = new Float64Array(rows.length);
const eLen = new Float64Array(rows.length); const eThMid = new Float64Array(rows.length); const eZMid = new Float64Array(rows.length);
const pairArea = new Float64Array(rows.length);
for (let k = 0; k < rows.length; k += 1) {
  const p = rows[k].shared;
  const t1 = Math.atan2(p[1], p[0]); const t2 = t1 + dThRaw(t1, Math.atan2(p[4], p[3]));
  const zm = (p[2] + p[5]) / 2; const rm = rBase(zm);
  const dA = (t2 - t1) * rm; const dZ = p[5] - p[2];
  const L = Math.hypot(dA, dZ);
  eDirA[k] = L > 0 ? dA / L : 1; eDirZ[k] = L > 0 ? dZ / L : 0; eLen[k] = L;
  eThMid[k] = t1 + (t2 - t1) / 2; eZMid[k] = zm;
  pairArea[k] = rows[k].area1 + rows[k].area2;
}
log(`  shared-edge length in the (arc,z) plane: p10 ${q(Array.from(eLen), 0.1).toFixed(4)}  p50 ${q(Array.from(eLen), 0.5).toFixed(4)}  p90 ${q(Array.from(eLen), 0.9).toFixed(4)} mm`);
const medLen = q(Array.from(eLen), 0.5);

let totPairArea = 0; for (let k = 0; k < rows.length; k += 1) totPairArea += pairArea[k];
const ANG_BINS = [15, 30, 45, 60, 75, 90];
/** sel: optional per-pair filter, so a sub-population can be scored on the SAME instrument. */
function angleReport(label: string, ang: number[], w: number[], ok: boolean[], sel?: (k: number) => boolean): void {
  const bc = new Array(ANG_BINS.length).fill(0); const ba = new Array(ANG_BINS.length).fill(0);
  let n = 0; let tw = 0; let nSel = 0; let wSel = 0;
  for (let k = 0; k < ang.length; k += 1) {
    if (sel !== undefined && !sel(k)) continue;
    nSel += 1; wSel += w[k];
    if (!ok[k]) continue;
    n += 1; tw += w[k];
    let b = 0; while (b < ANG_BINS.length - 1 && ang[k] > ANG_BINS[b]) b += 1;
    bc[b] += 1; ba[b] += w[k];
  }
  const vv: number[] = []; const ww: number[] = [];
  for (let k = 0; k < ang.length; k += 1) if (ok[k] && (sel === undefined || sel(k))) { vv.push(ang[k]); ww.push(w[k]); }
  const cnts = bc.map((v, i) => `${i === 0 ? 0 : ANG_BINS[i - 1]}-${ANG_BINS[i]}: ${v} (${((v / Math.max(1, n)) * 100).toFixed(1)}%/${((ba[i] / Math.max(1e-12, tw)) * 100).toFixed(1)}%A)`);
  // *** RESOLVED-AREA SHARE IS PRINTED, NOT JUST RESOLVED COUNT. A ruler that answers on 62% of the pairs
  //     but only 30% of the AREA is answering about the wrong part of the defect. ***
  log(`    ${label}  resolved ${n}/${nSel} pairs = ${((n / Math.max(1, nSel)) * 100).toFixed(1)}% by count, ${tw.toFixed(3)}/${wSel.toFixed(3)} mm2 = ${((tw / Math.max(1e-12, wSel)) * 100).toFixed(1)}% by pair AREA`);
  log(`      ${cnts.join('  ')}`);
  log(`      p10 ${q(vv, 0.1).toFixed(1)}  p50 ${q(vv, 0.5).toFixed(1)}  p90 ${q(vv, 0.9).toFixed(1)}  MAX ${vv.length > 0 ? mx(vv).toFixed(1) : 'n/a'} deg   area-weighted p50 ${qw(vv, ww, 0.5).toFixed(1)} deg`);
}
const RSCALES = [0.5 * medLen, 1.0 * medLen, 2.0 * medLen];
const ANISO_MIN = envF('PF_S113B_ANISO', 2.0);
let primaryAng: number[] = []; let primaryOk: boolean[] = [];
for (const R of RSCALES) {
  const ang: number[] = []; const ok: boolean[] = []; const dist: number[] = []; const aniso: number[] = [];
  for (let k = 0; k < rows.length; k += 1) {
    const pr = tangentAt(eThMid[k], eZMid[k], R);
    dist.push(pr.distMm); aniso.push(pr.aniso);
    if (!pr.okDist || pr.n < 3 || !(pr.aniso >= ANISO_MIN)) { ang.push(NaN); ok.push(false); continue; }
    let d = Math.abs(eDirA[k] * pr.tanA + eDirZ[k] * pr.tanZ);
    d = d > 1 ? 1 : d;
    ang.push(Math.acos(d) * R2D); ok.push(true);
  }
  log(`  R = ${R.toFixed(4)} mm (${(R / medLen).toFixed(1)}x the median shared-edge length), aniso floor ${ANISO_MIN}`);
  log(`    distance from the shared-edge MIDPOINT to the nearest crease cell: p10 ${q(dist, 0.1).toFixed(4)}  p50 ${q(dist, 0.5).toFixed(4)}  p90 ${q(dist, 0.9).toFixed(4)} mm  (= ${(q(dist, 0.5) / medLen).toFixed(3)} median edge lengths); NO crease found inside the search disc: ${nInf(dist)}`);
  log(`    PCA anisotropy sqrt(l1/l2): p10 ${q(aniso, 0.1).toFixed(2)}  p50 ${q(aniso, 0.5).toFixed(2)}  p90 ${q(aniso, 0.9).toFixed(2)}   below the floor (= a JUNCTION, no single tangent): ${aniso.filter((v) => !(v >= ANISO_MIN)).length}`);
  angleReport('EDGE vs CREASE TANGENT', ang, Array.from(pairArea), ok);
  if (Math.abs(R - RSCALES[1]) < 1e-12) { primaryAng = ang; primaryOk = ok; }
}
// ── SUB-POPULATION SPLIT. P1 found that BY AREA the class is isolated pairs and BY COUNT it is ribbons;
//    the two must be scored separately or the area-dominant half is answered for by the count-dominant one.
{
  const compSizeOf = (k: number): number => CV.sizes[CV.comp[uIdx.get(rows[k].f1) as number]];
  log('  BY SUB-POPULATION (same instrument, primary R):');
  angleReport('ISOLATED PAIRS  (vertex-component size == 2)', primaryAng, Array.from(pairArea), primaryOk, (k) => compSizeOf(k) === 2);
  angleReport('SMALL CLUSTERS  (size 3-8)                  ', primaryAng, Array.from(pairArea), primaryOk, (k) => compSizeOf(k) >= 3 && compSizeOf(k) <= 8);
  angleReport('RIBBONS         (size >= 9)                 ', primaryAng, Array.from(pairArea), primaryOk, (k) => compSizeOf(k) >= 9);
}

// ── IS THE CREASE ON THE SHARED EDGE, OR THROUGH THE FACET INTERIORS? ──
// The whole question "flip or split" turns on this and nothing above answers it: a shared edge can lie
// exactly along a crease AND the pair can still straddle a SECOND crease crossing its interior.
{
  let nWithCrease = 0; let areaWithCrease = 0;
  const relDist: number[] = []; const relW: number[] = []; const nComps: number[] = [];
  const farMm: number[] = []; const hMaxMm: number[] = []; const floorRel: number[] = [];
  let nEdgeOnly = 0; let aEdgeOnly = 0; let nInterior = 0; let aInterior = 0; let nNone = 0; let aNone = 0;
  for (let k = 0; k < rows.length; k += 1) {
    const i1 = uIdx.get(rows[k].f1) as number; const i2 = uIdx.get(rows[k].f2) as number;
    let dSec = (fSector[i2] - fSector[i1]) * SEC_DEG;
    if (dSec > 180) dSec -= 360; if (dSec < -180) dSec += 360;
    const T: number[][] = [];
    for (let v = 0; v < 3; v += 1) T.push([fLocDeg[i1 * 3 + v], fZ[i1 * 3 + v]]);
    for (let v = 0; v < 3; v += 1) T.push([fLocDeg[i2 * 3 + v] + dSec, fZ[i2 * 3 + v]]);
    // the two shared vertices, identified by exact coordinate equality inside facet 1
    const P = [rows[k].shared[0], rows[k].shared[1], rows[k].shared[2]];
    const Q = [rows[k].shared[3], rows[k].shared[4], rows[k].shared[5]];
    const idxOf = (p: number[]): number => {
      for (let v = 0; v < 3; v += 1) {
        if (xyz[rows[k].f1 * 9 + v * 3] === p[0] && xyz[rows[k].f1 * 9 + v * 3 + 1] === p[1] && xyz[rows[k].f1 * 9 + v * 3 + 2] === p[2]) return v;
      }
      return -1;
    };
    const vP = idxOf(P); const vQ = idxOf(Q);
    if (vP < 0 || vQ < 0) { relDist.push(NaN); relW.push(pairArea[k]); nComps.push(0); continue; }
    const zm = rows[k].z; const rm = rBase(zm);
    const toMm = (t: number[]): number[] => [t[0] * D2R * rm, t[1]];
    const A = toMm(T[vP]); const B = toMm(T[vQ]);
    const ex = B[0] - A[0]; const ey = B[1] - A[1]; const eL = Math.hypot(ex, ey);
    if (!(eL > 0)) { relDist.push(NaN); relW.push(pairArea[k]); nComps.push(0); continue; }
    const perp = (p: number[]): number => Math.abs((p[0] - A[0]) * ey - (p[1] - A[1]) * ex) / eL;
    // the facets' own extent away from the shared edge = the normalisation
    let hMax = 0;
    for (let v = 0; v < 6; v += 1) { const d = perp(toMm(T[v])); if (d > hMax) hMax = d; }
    // scan the union bbox and collect crease cells inside either triangle
    const tls = [T.slice(0, 3), T.slice(3, 6)];
    let iLo = Infinity; let iHi = -Infinity; let jLo = Infinity; let jHi = -Infinity;
    for (const t of tls) for (const v of t) {
      iLo = Math.min(iLo, Math.floor(v[0] / dThDeg) - 1); iHi = Math.max(iHi, Math.ceil(v[0] / dThDeg) + 1);
      jLo = Math.min(jLo, Math.floor(v[1] / dz) - 1); jHi = Math.max(jHi, Math.ceil(v[1] / dz) + 1);
    }
    jLo = Math.max(0, jLo); jHi = Math.min(NZ - 1, jHi);
    let far = -1; const comps = new Set<number>();
    for (let j = jLo; j <= jHi; j += 1) {
      const zc = (j + 0.5) * dz;
      for (let ii = iLo; ii <= iHi; ii += 1) {
        const tc = (ii + 0.5) * dThDeg;
        let inside = false;
        for (const t of tls) {
          const d00 = t[1][0] - t[0][0]; const d01 = t[1][1] - t[0][1];
          const d10 = t[2][0] - t[0][0]; const d11 = t[2][1] - t[0][1];
          const det = d00 * d11 - d01 * d10; if (Math.abs(det) < 1e-18) continue;
          const px = tc - t[0][0]; const py = zc - t[0][1];
          const u = (px * d11 - py * d10) / det; const v2 = (py * d00 - px * d01) / det;
          if (u >= 0 && v2 >= 0 && u + v2 <= 1) { inside = true; break; }
        }
        if (!inside) continue;
        const s = j * NTH + (((ii % NTH) + NTH) % NTH);
        if (CC.lab[s] < 0) continue;
        comps.add(CC.lab[s]);
        const d = perp(toMm([tc, zc]));
        if (d > far) far = d;
      }
    }
    nComps.push(comps.size);
    if (far < 0) { relDist.push(NaN); relW.push(pairArea[k]); nNone += 1; aNone += pairArea[k]; continue; }
    nWithCrease += 1; areaWithCrease += pairArea[k];
    const rel = hMax > 1e-12 ? far / hMax : NaN;
    relDist.push(rel); relW.push(pairArea[k]);
    farMm.push(far); hMaxMm.push(hMax); floorRel.push(hMax > 1e-12 ? (0.5 * Math.hypot(arcCell, dz)) / hMax : NaN);
    if (rel <= 0.2) { nEdgeOnly += 1; aEdgeOnly += pairArea[k]; } else if (rel >= 0.5) { nInterior += 1; aInterior += pairArea[k]; }
  }
  log('  IS THE CREASE ON THE SHARED EDGE, OR THROUGH THE INTERIOR?  (grid-based; see the resolution floor below)');
  log(`    pairs whose UNION footprint contains a crease cell: ${nWithCrease}/${rows.length} = ${((nWithCrease / rows.length) * 100).toFixed(1)}% by count, ${((areaWithCrease / totPairArea) * 100).toFixed(1)}% by pair area`);
  log(`    normalised reach  (max perpendicular distance of a crease cell from the SHARED EDGE) / (the pair's own reach):`);
  log(`      p10 ${q(relDist, 0.1).toFixed(3)}  p50 ${q(relDist, 0.5).toFixed(3)}  p90 ${q(relDist, 0.9).toFixed(3)}  MAX ${mx(relDist.filter(Number.isFinite)).toFixed(3)}   area-weighted p50 ${qw(relDist, relW, 0.5).toFixed(3)}`);
  log(`      <= 0.2 (crease HUGS the shared edge => a CONFORMED edge, the pair is not a straddle): ${nEdgeOnly} = ${((nEdgeOnly / rows.length) * 100).toFixed(1)}% cnt / ${((aEdgeOnly / totPairArea) * 100).toFixed(1)}% area`);
  log(`      >= 0.5 (crease reaches deep INSIDE => a genuine straddle, only a SPLIT can fix it):     ${nInterior} = ${((nInterior / rows.length) * 100).toFixed(1)}% cnt / ${((aInterior / totPairArea) * 100).toFixed(1)}% area`);
  log(`      no crease cell in the footprint at all:                                                ${nNone} = ${((nNone / rows.length) * 100).toFixed(1)}% cnt / ${((aNone / totPairArea) * 100).toFixed(1)}% area`);
  const c2 = nComps.filter((v) => v >= 2).length;
  log(`    pairs whose footprint touches >= 2 DISTINCT crease components (a JUNCTION; no single aligned edge exists): ${c2} = ${((c2 / rows.length) * 100).toFixed(1)}%`);
  // *** THE RESOLUTION FLOOR OF THE MEASUREMENT ABOVE, PRINTED BESIDE IT. The locus band is one grid cell
  //     wide, so a crease lying EXACTLY on the shared edge still puts cells up to half a cell diagonal
  //     away. If that floor is comparable to the reported reach, the grid route cannot answer the
  //     question and the edge-crossing census below is the one to read. ***
  log(`    reach in mm: p10 ${q(farMm, 0.1).toFixed(4)}  p50 ${q(farMm, 0.5).toFixed(4)}  p90 ${q(farMm, 0.9).toFixed(4)};  the pair's own reach hMax: p50 ${q(hMaxMm, 0.5).toFixed(4)} mm`);
  log(`    QUANTIZATION FLOOR (half a cell diagonal / hMax): p10 ${q(floorRel, 0.1).toFixed(3)}  p50 ${q(floorRel, 0.5).toFixed(3)}  p90 ${q(floorRel, 0.9).toFixed(3)}  <== compare with the reach p50 above`);
}

// ── EDGE-CROSSING CENSUS — the SAME question, resolution-free, on the campaign's own instrument. ──
// S113's dump already carries `locateTurnAdaptive` on ALL SIX facet edges of every pair with its `turn`
// beside it. A crease that runs ALONG the shared edge does not cross the other four; a crease that passes
// through a facet interior MUST cross two of them. That is a topological statement, immune to the grid.
// `turn` is gated at TURN_MIN because the locator's tie-break returns a plausible `s` on a smooth segment.
{
  const TURN_MIN = envF('PF_S113B_TURNMIN', 20);
  let nConf = 0; let aConf = 0; let nCross = 0; let aCross = 0; let nQuiet = 0; let aQuiet = 0;
  const sharedTurns: number[] = []; const crossCounts: number[] = [];
  const sharedIdx1 = new Int32Array(rows.length).fill(-1); const sharedIdx2 = new Int32Array(rows.length).fill(-1);
  for (let k = 0; k < rows.length; k += 1) {
    const r = rows[k];
    const idxOf = (f: number, p: number[]): number => {
      for (let v = 0; v < 3; v += 1) if (xyz[f * 9 + v * 3] === p[0] && xyz[f * 9 + v * 3 + 1] === p[1] && xyz[f * 9 + v * 3 + 2] === p[2]) return v;
      return -1;
    };
    const P = [r.shared[0], r.shared[1], r.shared[2]]; const Q = [r.shared[3], r.shared[4], r.shared[5]];
    const sharedEdgeIdx = (f: number): number => {
      const a = idxOf(f, P); const b = idxOf(f, Q);
      if (a < 0 || b < 0) return -1;
      if ((a + 1) % 3 === b) return a;
      if ((b + 1) % 3 === a) return b;
      return -1;
    };
    const e1 = sharedEdgeIdx(r.f1); const e2 = sharedEdgeIdx(r.f2);
    sharedIdx1[k] = e1; sharedIdx2[k] = e2;
    if (e1 < 0 || e2 < 0) { sharedTurns.push(NaN); crossCounts.push(-1); continue; }
    let sharedTurn = 0; let cross = 0;
    for (const L of r.locs) {
      const isShared = (L.f === r.f1 && L.edge === e1) || (L.f === r.f2 && L.edge === e2);
      if (isShared) { sharedTurn = Math.max(sharedTurn, L.turnDeg); continue; }
      if (L.turnDeg > TURN_MIN) cross += 1;
    }
    sharedTurns.push(sharedTurn); crossCounts.push(cross);
    if (cross === 0 && sharedTurn > TURN_MIN) { nConf += 1; aConf += pairArea[k]; }
    else if (cross > 0) { nCross += 1; aCross += pairArea[k]; }
    else { nQuiet += 1; aQuiet += pairArea[k]; }
  }
  log(`  EDGE-CROSSING CENSUS (locateTurnAdaptive from the dump, turn > ${TURN_MIN} deg):`);
  log(`    turn on the SHARED edge: p10 ${q(sharedTurns, 0.1).toFixed(2)}  p50 ${q(sharedTurns, 0.5).toFixed(2)}  p90 ${q(sharedTurns, 0.9).toFixed(2)}  MAX ${mx(sharedTurns.filter(Number.isFinite)).toFixed(2)} deg`);
  const cc0 = crossCounts.filter((v) => v === 0).length; const cc1 = crossCounts.filter((v) => v === 1).length;
  const cc2 = crossCounts.filter((v) => v === 2).length; const cc3 = crossCounts.filter((v) => v >= 3).length;
  log(`    creased NON-shared edges per pair (of 4): 0: ${cc0}   1: ${cc1}   2: ${cc2}   3+: ${cc3}`);
  {
    let same = 0; let split = 0; let aSame = 0; let aSplit = 0;
    for (let k = 0; k < rows.length; k += 1) {
      if (crossCounts[k] !== 2) continue;
      const r = rows[k];
      let n1 = 0; let n2 = 0;
      for (const L of r.locs) {
        if (!(L.turnDeg > TURN_MIN)) continue;
        const eIdx = L.f === r.f1 ? sharedIdx1[k] : sharedIdx2[k];
        if (L.edge === eIdx) continue;
        if (L.f === r.f1) n1 += 1; else n2 += 1;
      }
      if (n1 === 2 || n2 === 2) { same += 1; aSame += pairArea[k]; } else { split += 1; aSplit += pairArea[k]; }
    }
    log(`      of the ${cc2} pairs with exactly 2: BOTH IN ONE FACET (crease runs PARALLEL, offset into one facet) ${same} = ${((aSame / totPairArea) * 100).toFixed(1)}% area;  ONE IN EACH (crease crosses the shared edge transversally) ${split} = ${((aSplit / totPairArea) * 100).toFixed(1)}% area`);
  }
  log(`    CONFORMED  (crease on the shared edge, crosses NEITHER facet): ${nConf} = ${((nConf / rows.length) * 100).toFixed(1)}% cnt / ${((aConf / totPairArea) * 100).toFixed(1)}% area`);
  log(`    CROSSING   (crease crosses a non-shared edge => enters an interior): ${nCross} = ${((nCross / rows.length) * 100).toFixed(1)}% cnt / ${((aCross / totPairArea) * 100).toFixed(1)}% area`);
  log(`    QUIET      (no edge carries a turn > ${TURN_MIN} deg at all):        ${nQuiet} = ${((nQuiet / rows.length) * 100).toFixed(1)}% cnt / ${((aQuiet / totPairArea) * 100).toFixed(1)}% area`);

  // *** HOW FAR WOULD THE EDGE HAVE TO MOVE? Resolution-free, from the dump's own crossings. ***
  // When a crease crosses BOTH non-shared edges of one facet, the two crossing points define the crease
  // CHORD inside that facet. Two numbers fall straight out and neither touches the grid:
  //   * the chord's ANGLE to the shared edge — an INDEPENDENT check on P5's PCA tangent, and
  //   * the chord's OFFSET from the shared edge — the distance an operator would have to move the edge.
  const chordAng: number[] = []; const offMm: number[] = []; const offRel: number[] = []; const wF: number[] = [];
  let nChord = 0;
  for (let k = 0; k < rows.length; k += 1) {
    const r = rows[k];
    const rm = rBase(r.z);
    for (const [f, aF] of [[r.f1, r.area1], [r.f2, r.area2]] as Array<[number, number]>) {
      const i = uIdx.get(f) as number;
      const idxOf = (pt: number[]): number => {
        for (let v = 0; v < 3; v += 1) if (xyz[f * 9 + v * 3] === pt[0] && xyz[f * 9 + v * 3 + 1] === pt[1] && xyz[f * 9 + v * 3 + 2] === pt[2]) return v;
        return -1;
      };
      const vP = idxOf([r.shared[0], r.shared[1], r.shared[2]]);
      const vQ = idxOf([r.shared[3], r.shared[4], r.shared[5]]);
      if (vP < 0 || vQ < 0) continue;
      const eIdx = (vP + 1) % 3 === vQ ? vP : ((vQ + 1) % 3 === vP ? vQ : -1);
      if (eIdx < 0) continue;
      const V: number[][] = [];
      for (let v = 0; v < 3; v += 1) V.push([fLocDeg[i * 3 + v] * D2R * rm, fZ[i * 3 + v]]);
      const A = V[vP]; const B = V[vQ];
      const ex = B[0] - A[0]; const ey = B[1] - A[1]; const eL = Math.hypot(ex, ey);
      if (!(eL > 0)) continue;
      const perp = (pt: number[]): number => Math.abs((pt[0] - A[0]) * ey - (pt[1] - A[1]) * ex) / eL;
      const hF = perp(V[3 - vP - vQ]);          // the opposite vertex: the facet's own reach
      const hits: number[][] = [];
      for (const L of r.locs) {
        if (L.f !== f || L.edge === eIdx || !(L.turnDeg > TURN_MIN)) continue;
        const a0 = V[L.edge]; const a1 = V[(L.edge + 1) % 3];
        hits.push([a0[0] + (a1[0] - a0[0]) * L.s, a0[1] + (a1[1] - a0[1]) * L.s]);
      }
      if (hits.length !== 2) continue;
      const cx = hits[1][0] - hits[0][0]; const cy = hits[1][1] - hits[0][1];
      const cL = Math.hypot(cx, cy); if (!(cL > 0)) continue;
      let d = Math.abs((cx * ex + cy * ey) / (cL * eL)); d = d > 1 ? 1 : d;
      nChord += 1;
      chordAng.push(Math.acos(d) * R2D);
      const off = 0.5 * (perp(hits[0]) + perp(hits[1]));
      offMm.push(off); offRel.push(hF > 1e-12 ? off / hF : NaN); wF.push(aF);
    }
  }
  {
    let tot = 0; let ends = 0;
    for (const r of rows) for (const L of r.locs) if (L.turnDeg > TURN_MIN) { tot += 1; if (L.s < 1e-3 || L.s > 1 - 1e-3) ends += 1; }
    log(`  *** DEGENERACY CHECK ON THE CHORD BELOW: of ${tot} facet edges carrying a turn > ${TURN_MIN} deg, ${ends} = ${((ends / Math.max(1, tot)) * 100).toFixed(1)}% have s AT AN ENDPOINT. ***`);
    log('      A chord built from endpoint-snapped crossings IS the shared edge, so a 0.000 mm offset there is a');
    log('      DEGENERATE ANSWER, not a measurement. The numbers below are reported only so that is visible; the');
    log('      resolution-free answer is P6.');
  }
  log(`  CREASE CHORD inside a facet (both non-shared edges crossed): ${nChord} facets of ${rows.length * 2} pair-slots`);
  log(`    chord ANGLE to the shared edge: p10 ${q(chordAng, 0.1).toFixed(1)}  p50 ${q(chordAng, 0.5).toFixed(1)}  p90 ${q(chordAng, 0.9).toFixed(1)}  MAX ${mx(chordAng).toFixed(1)} deg   area-weighted p50 ${qw(chordAng, wF, 0.5).toFixed(1)} deg`);
  log(`      (INDEPENDENT of the grid PCA tangent in P5 — compare the two p50s)`);
  log(`    chord OFFSET from the shared edge: p10 ${q(offMm, 0.1).toFixed(5)}  p50 ${q(offMm, 0.5).toFixed(5)}  p90 ${q(offMm, 0.9).toFixed(5)} mm   area-weighted p50 ${qw(offMm, wF, 0.5).toFixed(5)} mm`);
  log(`    offset / the facet's OWN reach:   p10 ${q(offRel, 0.1).toFixed(3)}  p50 ${q(offRel, 0.5).toFixed(3)}  p90 ${q(offRel, 0.9).toFixed(3)}   area-weighted p50 ${qw(offRel, wF, 0.5).toFixed(3)}`);
  const nearEdge = offRel.filter((v) => v <= 0.15).length; const midd = offRel.filter((v) => v > 0.15 && v < 0.85).length;
  let aNear = 0; let aMid = 0; let aT = 0;
  for (let t = 0; t < offRel.length; t += 1) { aT += wF[t]; if (offRel[t] <= 0.15) aNear += wF[t]; else if (offRel[t] < 0.85) aMid += wF[t]; }
  log(`      <= 0.15 (crease effectively ON an existing edge): ${nearEdge} = ${((nearEdge / Math.max(1, nChord)) * 100).toFixed(1)}% cnt / ${((aNear / Math.max(1e-12, aT)) * 100).toFixed(1)}% area`);
  log(`      0.15-0.85 (crease runs through the INTERIOR):     ${midd} = ${((midd / Math.max(1, nChord)) * 100).toFixed(1)}% cnt / ${((aMid / Math.max(1e-12, aT)) * 100).toFixed(1)}% area`);
}

// ── CONTROLS ──
{
  const R = RSCALES[1];
  // C1: SHUFFLED directions at the SAME positions.
  let seed = 987654321;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const perm = Array.from({ length: rows.length }, (_, i) => i);
  for (let i = perm.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const angC1: number[] = []; const okC1: boolean[] = [];
  for (let k = 0; k < rows.length; k += 1) {
    const pr = tangentAt(eThMid[k], eZMid[k], R);
    if (!pr.okDist || pr.n < 3 || !(pr.aniso >= ANISO_MIN)) { angC1.push(NaN); okC1.push(false); continue; }
    const j = perm[k];
    let d = Math.abs(eDirA[j] * pr.tanA + eDirZ[j] * pr.tanZ); d = d > 1 ? 1 : d;
    angC1.push(Math.acos(d) * R2D); okC1.push(true);
  }
  log('  CONTROL C1 — the SAME crease tangents, but the edge directions SHUFFLED between pairs:');
  angleReport('SHUFFLED-DIR CONTROL  ', angC1, Array.from(pairArea), okC1);
  // C2: random wall positions, real direction pool.
  const angC2: number[] = []; const okC2: boolean[] = []; const distC2: number[] = [];
  const zLoT = q(rows.map((r) => r.z), 0.02); const zHiT = q(rows.map((r) => r.z), 0.98);
  for (let k = 0; k < rows.length; k += 1) {
    const th = rnd() * 2 * Math.PI; const zq = zLoT + rnd() * (zHiT - zLoT);
    const pr = tangentAt(th, zq, R);
    distC2.push(pr.distMm);
    if (!pr.okDist || pr.n < 3 || !(pr.aniso >= ANISO_MIN)) { angC2.push(NaN); okC2.push(false); continue; }
    const j = perm[k];
    let d = Math.abs(eDirA[j] * pr.tanA + eDirZ[j] * pr.tanZ); d = d > 1 ? 1 : d;
    angC2.push(Math.acos(d) * R2D); okC2.push(true);
  }
  log(`  CONTROL C2 — RANDOM wall positions in z in [${zLoT.toFixed(1)}, ${zHiT.toFixed(1)}] mm, real direction pool:`);
  log(`    distance to the nearest crease cell: p10 ${q(distC2, 0.1).toFixed(4)}  p50 ${q(distC2, 0.5).toFixed(4)}  p90 ${q(distC2, 0.9).toFixed(4)} mm   (targets' p50 above); NO crease inside the search disc: ${nInf(distC2)}/${distC2.length}`);
  angleReport('RANDOM-POSITION CONTROL', angC2, Array.from(pairArea), okC2);
}
// ── CROSS-CHECK with locateTurnAdaptive (independent instrument, `turn` gated) ──
{
  const R = RSCALES[1];
  const NSUB = Math.round(envF('PF_S113B_NSUB', 400));
  const step = Math.max(1, Math.floor(rows.length / NSUB));
  let nTried = 0; let nBoth = 0; const dAng: number[] = []; const angLT: number[] = [];
  for (let k = 0; k < rows.length; k += step) {
    const pr = tangentAt(eThMid[k], eZMid[k], R);
    if (!pr.okDist || pr.n < 3 || !(pr.aniso >= ANISO_MIN)) continue;
    nTried += 1;
    const zq = eZMid[k]; const rm = rBase(zq);
    // two probe lines offset +-delta ALONG the PCA tangent, each spanning +-W ACROSS it
    const delta = 0.35 * medLen; const W = 1.2 * medLen;
    const nA = -pr.tanZ; const nZ2 = pr.tanA;
    const pts: Array<{ a: number; z: number } | null> = [];
    for (const sgn of [-1, 1]) {
      const cA = sgn * delta * pr.tanA; const cZ2 = sgn * delta * pr.tanZ;
      const aStart = cA - W * nA; const zStart = cZ2 - W * nZ2;
      const aEnd = cA + W * nA; const zEnd = cZ2 + W * nZ2;
      const th0 = eThMid[k] + aStart / rm; const th1 = eThMid[k] + aEnd / rm;
      const lt = locateTurnAdaptive(rA, H, th0, zq + zStart, th1, zq + zEnd, rm, 16);
      if (!(lt.turn * R2D > 10)) { pts.push(null); continue; }
      pts.push({ a: aStart + (aEnd - aStart) * lt.s, z: zStart + (zEnd - zStart) * lt.s });
    }
    if (pts[0] === null || pts[1] === null) continue;
    nBoth += 1;
    const tA = pts[1].a - pts[0].a; const tZ = pts[1].z - pts[0].z;
    const L = Math.hypot(tA, tZ); if (!(L > 0)) continue;
    let d1 = Math.abs((tA / L) * pr.tanA + (tZ / L) * pr.tanZ); d1 = d1 > 1 ? 1 : d1;
    dAng.push(Math.acos(d1) * R2D);
    let d2 = Math.abs(eDirA[k] * (tA / L) + eDirZ[k] * (tZ / L)); d2 = d2 > 1 ? 1 : d2;
    angLT.push(Math.acos(d2) * R2D);
  }
  log(`  CROSS-CHECK — locateTurnAdaptive two-line probe on ${nTried} sampled pairs (turn > 10 deg required on BOTH lines): ${nBoth} usable`);
  if (dAng.length > 0) {
    log(`    |angle(PCA tangent, locateTurn tangent)|: p10 ${q(dAng, 0.1).toFixed(1)}  p50 ${q(dAng, 0.5).toFixed(1)}  p90 ${q(dAng, 0.9).toFixed(1)}  MAX ${mx(dAng).toFixed(1)} deg`);
    log(`    EDGE vs locateTurn tangent: p10 ${q(angLT, 0.1).toFixed(1)}  p50 ${q(angLT, 0.5).toFixed(1)}  p90 ${q(angLT, 0.9).toFixed(1)} deg   (compare the PCA p50 at the same R)`);
  } else {
    log('    UNKNOWN — no usable two-line probes; the cross-check is silent, not confirming.');
  }
}
// per-pair dump for downstream
{
  const R = RSCALES[1];
  const out: string[] = [];
  for (let k = 0; k < rows.length; k += 1) {
    out.push(JSON.stringify({
      e: rows[k].e, f1: rows[k].f1, f2: rows[k].f2,
      compV: CV.comp[uIdx.get(rows[k].f1) as number], compE: CE.comp[uIdx.get(rows[k].f1) as number],
      edgeLen: eLen[k], angDeg: primaryOk[k] ? primaryAng[k] : null, R,
      z: rows[k].z, thMod30: rows[k].thMod30, area: pairArea[k],
    }));
  }
  writeFileSync(`${OUTDIR}/S113B_PAIRS_${TAG}.ndjson`, `${out.join('\n')}\n`);
  log(`  wrote ${OUTDIR}/S113B_PAIRS_${TAG}.ndjson`);
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P6 — IS THE CREASE ALREADY AT THE MESH VERTICES? A resolution-free distance probe.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The grid in P3-P5 has 0.04 mm cells and the median pair only reaches 0.032 mm from its shared edge, so
// the grid CANNOT resolve "on the edge" from "through the interior" — its own quantization floor (p50
// 0.998 of the pair's reach) says so. This probe has no grid at all. The kink indicator at step h reads
// the FULL dihedral while h exceeds the distance d to the locus and COLLAPSES once h < d, so sweeping h
// down brackets d directly. Resolution is limited only by the f32 STL quantization of the vertex itself
// (~2.4e-6 mm at r = 40 mm), which is why the sweep stops at 1e-5 mm.
// Four populations are probed on the SAME instrument so the comparison is a diff of printed values:
//   VERTICES of the target facets / MIDPOINTS of the shared edges / CENTROIDS (control) / random (control).
log('══════ P6 — DISTANCE FROM THE MESH ITSELF TO THE LOCUS (grid-free h-collapse probe) ══════');
{
  const TURN6 = envF('PF_S113B_TURN6', 20);
  const HS = [1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5];
  const samplers = HS.map((h) => fdNormals(rA, H, h, h));
  /** smallest h at which the one-sided normals still disagree by TURN6 => a BRACKET on the distance. */
  const distTo = (th: number, z: number): number => {
    let best = Infinity;
    for (let a = 0; a < HS.length; a += 1) {
      if (maxSpread(samplers[a](th, z, sc)) * R2D >= TURN6) best = HS[a]; else break;
    }
    return best;
  };
  const hist = (name: string, ds: number[], w: number[]): void => {
    const bins = new Array(HS.length + 1).fill(0); const ba = new Array(HS.length + 1).fill(0);
    let tw = 0;
    for (let k = 0; k < ds.length; k += 1) {
      tw += w[k];
      let b = HS.length;                        // "never fired" bucket
      for (let a = 0; a < HS.length; a += 1) if (ds[k] === HS[a]) b = a;
      bins[b] += 1; ba[b] += w[k];
    }
    const parts: string[] = [];
    for (let a = 0; a < HS.length; a += 1) if (bins[a] > 0) parts.push(`<=${HS[a].toExponential(0)}: ${bins[a]} (${((bins[a] / ds.length) * 100).toFixed(1)}%/${((ba[a] / Math.max(1e-12, tw)) * 100).toFixed(1)}%A)`);
    parts.push(`NO LOCUS within 1e-2 mm: ${bins[HS.length]} (${((bins[HS.length] / ds.length) * 100).toFixed(1)}%/${((ba[HS.length] / Math.max(1e-12, tw)) * 100).toFixed(1)}%A)`);
    log(`    ${name}  n=${ds.length}`);
    log(`      ${parts.join('   ')}`);
  };
  // (a) every welded vertex of the target facets, area-weighted by a third of its incident target facets
  const vTh = new Map<number, number[]>();
  const vW = new Float64Array(nV);
  for (let i = 0; i < nU; i += 1) for (let k = 0; k < 3; k += 1) {
    const v = vOfFacet[i * 3 + k];
    vW[v] += uArea[i] / 3;
    if (!vTh.has(v)) vTh.set(v, [fTh[i * 3 + k], fZ[i * 3 + k]]);
  }
  const dV: number[] = []; const wV: number[] = [];
  for (const [v, tz] of vTh) { dV.push(distTo(tz[0], tz[1])); wV.push(vW[v]); }
  hist('TARGET-FACET VERTICES ', dV, wV);
  // (b) shared-edge midpoints  (c) facet centroids  (d) random wall points
  const dM: number[] = []; const wM: number[] = [];
  for (let k = 0; k < rows.length; k += 1) { dM.push(distTo(eThMid[k], eZMid[k])); wM.push(pairArea[k]); }
  hist('SHARED-EDGE MIDPOINTS ', dM, wM);
  const dC: number[] = []; const wC: number[] = [];
  for (let i = 0; i < nU; i += 1) {
    const thc = (fTh[i * 3] + fTh[i * 3 + 1] + fTh[i * 3 + 2]) / 3;
    const zc = (fZ[i * 3] + fZ[i * 3 + 1] + fZ[i * 3 + 2]) / 3;
    dC.push(distTo(thc, zc)); wC.push(uArea[i]);
  }
  hist('FACET CENTROIDS (ctrl)', dC, wC);
  let seed = 2468013579 % 2147483648;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const zLoT = q(rows.map((r) => r.z), 0.02); const zHiT = q(rows.map((r) => r.z), 0.98);
  const dR: number[] = []; const wR: number[] = [];
  for (let k = 0; k < rows.length; k += 1) { dR.push(distTo(rnd() * 2 * Math.PI, zLoT + rnd() * (zHiT - zLoT))); wR.push(1); }
  hist('RANDOM WALL PTS (ctrl)', dR, wR);
  // ── THE SAGITTA. If the two ENDPOINTS of a shared edge sit on the locus but the MIDPOINT does not, the
  //    locus is CURVED and the straight mesh edge cuts the corner. That gap is the whole straddle.
  let nBoth = 0; let nSag = 0; let aSag = 0; let aBoth = 0;
  const sagRel: number[] = []; const sagW: number[] = [];
  for (let k = 0; k < rows.length; k += 1) {
    const pp = rows[k].shared;
    const t1 = Math.atan2(pp[1], pp[0]); const t2 = t1 + dThRaw(t1, Math.atan2(pp[4], pp[3]));
    const d1 = distTo(t1, pp[2]); const d2 = distTo(t2, pp[5]);
    if (!(d1 <= 1e-4 && d2 <= 1e-4)) continue;
    nBoth += 1; aBoth += pairArea[k];
    const dm = dM[k];
    if (dm > 1e-4) { nSag += 1; aSag += pairArea[k]; }
    sagRel.push(Number.isFinite(dm) ? dm : 1e-2); sagW.push(pairArea[k]);
  }
  log(`    SAGITTA TEST — pairs whose shared edge has BOTH endpoints on the locus (<= 1e-4 mm): ${nBoth} = ${((nBoth / rows.length) * 100).toFixed(1)}% cnt / ${((aBoth / totPairArea) * 100).toFixed(1)}% area`);
  log(`      of those, the MIDPOINT is NOT on the locus (> 1e-4 mm): ${nSag} = ${((nSag / Math.max(1, nBoth)) * 100).toFixed(1)}% cnt / ${((aSag / Math.max(1e-12, aBoth)) * 100).toFixed(1)}% area`);
  log(`      midpoint distance bracket for those: p50 ${q(sagRel, 0.5).toExponential(1)}  p90 ${q(sagRel, 0.9).toExponential(1)} mm   (the pair's own reach hMax p50 was printed in P5)`);
}
log(`${el()}`);
log('');
log('===== END S113b =====');

// revS115HarmCT.ts — REVIEWER PASS on S115 "oracle ceiling / the prize" (CelticTriquetra).
//
// LENS: WHAT DID THE ARMS MAKE WORSE, and was it honestly reported?
//
// The S115 run scored every arm with exactly four quantities: >45 AREA share, >45 COUNT share, MAX
// dihedral, and an area ratio. It never measured, on ANY arm:
//   * WELD / TOPOLOGY INTEGRITY  — boundary + non-manifold + inconsistent-winding edge counts. A soup
//     whose new vertices fail the EXACT-equality weld silently loses adjacency, and every per-facet MAX
//     dihedral is then taken over FEWER neighbours ⇒ its >45 share is under-read. `soupStat` computes
//     `interior`/`boundary` and THROWS THEM AWAY (only secBase.boundary is printed).
//   * SLIVERS — min altitude / aspect ratio. S111 named sliver facets as the mechanism that MAKES turn.
//   * INVERSIONS — facet normal (as wound) vs the analytic outward normal. S98's class.
//   * POSITION — |r_mesh − rA| per arm, against the campaign's 0.01 mm standard.
//   * 1-RING COLLATERAL — children that are BAD under a parent that was GOOD (defects CREATED), and the
//     converse. The run quotes placebo/null only as a ratio of aggregate AREA shares.
//
// The NULL arm (1->4, no reprojection) is the perfect control for all of these: its children are
// SIMILAR to the parent (identical shape, identical normal, identical winding), so every difference
// between PLACEBO and NULL in sliver/inversion/topology terms is caused by the REPROJECTION alone.
//
// Nothing under src/ or research/bridge/ is modified. Arms are rebuilt with the same code paths the
// S115 tool uses (sector predicate, subdivide, structured grid) so the numbers are comparable.
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims, RadiusFn } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envL = (n: string, d: string): number[] => (process.env[n] ?? d).split(',').map(Number);

const STYLE = process.env.PF_RH_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_RH_STL ?? '';
const TAG = process.env.PF_RH_TAG ?? 'CT';
const OUTDIR = process.env.PF_RH_OUTDIR ?? 'research/exchange/_strataConformBisect/s115harm';
const DIMS: StyleDims = { H: envF('PF_RH_H', 120), Rb: envF('PF_RH_RB', 40), Rt: envF('PF_RH_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;
const SECTOR_DIV = envI('PF_RH_SECTORDIV', 16);
const SECTOR_T0 = envF('PF_RH_SECTORT0', 0);
const CEIL = envF('PF_RH_CEIL', 163.41);
const HTAB = envL('PF_RH_HTAB', '2e-8,2e-7,2e-6,2e-5,2e-4');
const H_REF = envF('PF_RH_HREF', 2e-7);
const LEVELS = envI('PF_RH_LEVELS', 2);
const DO_GRID = envI('PF_RH_GRID', 1);
const POS_BAR_MM = envF('PF_RH_POSBAR', 0.01);          // the campaign's export standard
const SLIVER_UM = envF('PF_RH_SLIVERUM', 5.94);         // S111's measured sliver altitude
const AR_BAR = envF('PF_RH_ARBAR', 50);                 // the campaign's AR-50 corner

if (STL.length === 0) { log('*** PF_RH_STL is required (ABSOLUTE path). ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
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
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.prototype.slice.call(v).filter(Number.isFinite).sort((a: number, b: number) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f2 = (v: number, n = 3): string => (Number.isFinite(v) ? v.toFixed(n) : '—');

const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const OUT: Record<string, unknown> = { style: STYLE, tag: TAG, stl: STL, dims: DIMS, sectorDiv: SECTOR_DIV, ceil: CEIL };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== REVIEWER S115 — HARM AUDIT OF THE PRIZE ARMS — ${STYLE} (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`sector 1/${SECTOR_DIV} from theta ${SECTOR_T0}   fold ceiling ${CEIL} deg   levels ${LEVELS}   h ref ${H_REF.toExponential(0)}`);
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);

// ── PRECOND, exactly the S115 gate: stride + exhaustive; over-gate facets are excluded from the sector ──
const badFacet = new Uint8Array(nTri);
{
  let worstStride = 0;
  const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) {
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worstStride) worstStride = dd;
    }
  }
  let worstAll = 0; let bad = 0;
  for (let f = 0; f < nTri; f += 1) {
    let w = 0;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > w) w = dd;
    }
    if (w > worstAll) worstAll = w;
    if (w > 0.05) { badFacet[f] = 1; bad += 1; }
  }
  log(`── C1 PRECOND: stride MAX ${(worstStride * 1000).toFixed(4)} um   EXHAUSTIVE MAX ${(worstAll * 1000).toFixed(1)} um   over-gate facets ${bad}  ${el()}`);
  OUT.precond = { strideMaxUm: worstStride * 1000, exhaustiveMaxUm: worstAll * 1000, badFacets: bad };
}

// ── SECTOR, byte-identical predicate to the S115 tool ────────────────────────────────────────────────
const W = (2 * Math.PI) / SECTOR_DIV;
const t0 = SECTOR_T0; const t1 = SECTOR_T0 + W;
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const secF: number[] = [];
for (let f = 0; f < nTri; f += 1) {
  if (badFacet[f] === 1) continue;
  const [a, b, c] = th3(f);
  const a0 = canonTheta(a);
  const p1 = a0; const p2 = a0 + (b - a); const p3 = a0 + (c - a);
  if (p1 >= t0 && p1 <= t1 && p2 >= t0 && p2 <= t1 && p3 >= t0 && p3 <= t1) secF.push(f);
}
const secSoup = new Float64Array(secF.length * 9);
for (let i = 0; i < secF.length; i += 1) for (let k = 0; k < 9; k += 1) secSoup[i * 9 + k] = xyz[secF[i] * 9 + k];
log(`── SECTOR theta [${t0.toFixed(4)}, ${t1.toFixed(4)}]: ${secF.length} facets  ${el()}`);
log('');

/** the S115 tool's `subdivide`, transcribed verbatim so the arms are the same arms. */
function subdivide(soup: Float64Array, reproject: boolean): Float64Array {
  const n = soup.length / 9;
  const out = new Float64Array(n * 4 * 9);
  const P = new Float64Array(18);
  for (let f = 0; f < n; f += 1) {
    const ax = soup[f * 9]; const ay = soup[f * 9 + 1]; const az = soup[f * 9 + 2];
    const bx = soup[f * 9 + 3]; const by = soup[f * 9 + 4]; const bz = soup[f * 9 + 5];
    const cx = soup[f * 9 + 6]; const cy = soup[f * 9 + 7]; const cz = soup[f * 9 + 8];
    const ta = Math.atan2(ay, ax);
    const tb = ta + dThRaw(ta, Math.atan2(by, bx));
    const tc = ta + dThRaw(ta, Math.atan2(cy, cx));
    const mid = (x1: number, y1: number, z1: number, tt1: number, x2: number, y2: number, z2: number, tt2: number, o: number): void => {
      if (reproject) {
        const tm = 0.5 * (tt1 + tt2); const zm = 0.5 * (z1 + z2);
        const r = rA(tm, zm);
        P[o] = r * Math.cos(tm); P[o + 1] = r * Math.sin(tm); P[o + 2] = zm;
      } else { P[o] = 0.5 * (x1 + x2); P[o + 1] = 0.5 * (y1 + y2); P[o + 2] = 0.5 * (z1 + z2); }
    };
    mid(ax, ay, az, ta, bx, by, bz, tb, 0);
    mid(bx, by, bz, tb, cx, cy, cz, tc, 3);
    mid(cx, cy, cz, tc, ax, ay, az, ta, 6);
    const w = (o: number, p: number[]): void => { for (let i = 0; i < 9; i += 1) out[o + i] = p[i]; };
    const base = f * 36;
    w(base, [ax, ay, az, P[0], P[1], P[2], P[6], P[7], P[8]]);
    w(base + 9, [P[0], P[1], P[2], bx, by, bz, P[3], P[4], P[5]]);
    w(base + 18, [P[6], P[7], P[8], P[3], P[4], P[5], cx, cy, cz]);
    w(base + 27, [P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8]]);
  }
  return out;
}

/**
 * WELD SENSITIVITY. `facetDihedrals` welds by EXACT f64 equality — correct for an STL, whose vertices
 * are f32 and bit-identical across facets. But a REPROJECTED midpoint is recomputed inside each parent
 * from that parent's OWN unwrapped theta branch, so the two copies differ in the last ULPs and the weld
 * MISSES the adjacency. Snapping to a 1 pm grid (12 orders below the smallest real vertex separation in
 * this mesh, 0.1 um) restores those and nothing else, so the delta IS the under-read.
 */
function snapSoup(soup: Float64Array, grid: number): Float64Array {
  const out = new Float64Array(soup.length);
  for (let i = 0; i < soup.length; i += 1) out[i] = Math.round(soup[i] / grid) * grid;
  return out;
}

/** analytic OUTWARD normal of the surface of revolution-with-relief, by one-sided FD at step h. */
function analyticNormal(th: number, z: number, h: number, out: Float64Array): void {
  const r0 = rA(th, z);
  const hTh = h / Math.max(1e-9, Math.abs(r0));
  const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  const zLo = Math.max(0, z - h); const zHi = Math.min(H, z + h);
  const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
  const c = Math.cos(th); const s = Math.sin(th);
  let nx = rt * s + r0 * c; let ny = r0 * s - rt * c; let nz = -r0 * rz;
  const L = Math.hypot(nx, ny, nz) || 1;
  nx /= L; ny /= L; nz /= L;
  out[0] = nx; out[1] = ny; out[2] = nz;
}

interface Harm {
  name: string; mult: number; tris: number; areaMm2: number;
  interior: number; boundary: number; nonManifold: number; inconsistent: number;
  over45Area: number; over45Count: number; maxDeg: number;
  bandArea: number[]; bandCount: number[];
  minAltP50Um: number; minAltP01Um: number; minAltMinUm: number;
  sliverCount: number; sliverArea: number; sliverCountSub1: number;
  arP99: number; arMax: number; arOverCount: number; arOverArea: number;
  invCount: Record<string, number>; invArea: Record<string, number>;
  posMaxUm: number; posP99Um: number; posOverCount: number; posOverArea: number;
  perFacetMaxRad: Float64Array; area: Float64Array; inv: Uint8Array; minAlt: Float64Array;
}

function harmStat(name: string, mult: number, soup: Float64Array, hs: number[]): Harm {
  const n = soup.length / 9;
  const idx = new Uint32Array(n * 3);
  for (let i = 0; i < n * 3; i += 1) idx[i] = i;
  const dd = facetDihedrals(soup, idx);
  const edges = [45, 90, 135, CEIL, 180.0000001];
  const bandArea = new Array<number>(edges.length).fill(0);
  const bandCount = new Array<number>(edges.length).fill(0);
  let area = 0; let maxAng = 0; let o45a = 0; let o45c = 0;
  const minAlt = new Float64Array(n); const ar = new Float64Array(n);
  const inv = new Uint8Array(n);
  const invCount: Record<string, number> = {}; const invArea: Record<string, number> = {};
  for (const h of hs) { invCount[String(h)] = 0; invArea[String(h)] = 0; }
  const na = new Float64Array(3);
  let posMax = 0; let posOverC = 0; let posOverA = 0;
  const posSample: number[] = [];
  const posStride = Math.max(1, Math.floor(n / 200000));
  let sliverC = 0; let sliverA = 0; let sliverC1 = 0;
  let arOverC = 0; let arOverA = 0;
  for (let f = 0; f < n; f += 1) {
    const A = dd.areaMm2[f];
    area += A;
    const dg = dd.perFacetMaxRad[f] * DEG;
    if (dg > maxAng) maxAng = dg;
    if (dg > 45) { o45a += A; o45c += 1; }
    for (let i = 0; i < edges.length; i += 1) {
      if (i === 0 ? dg <= edges[0] : dg > edges[i - 1] && dg <= edges[i]) { bandArea[i] += A; bandCount[i] += 1; break; }
    }
    const ax = soup[f * 9]; const ay = soup[f * 9 + 1]; const az = soup[f * 9 + 2];
    const bx = soup[f * 9 + 3]; const by = soup[f * 9 + 4]; const bz = soup[f * 9 + 5];
    const cx = soup[f * 9 + 6]; const cy = soup[f * 9 + 7]; const cz = soup[f * 9 + 8];
    // shape
    const e1 = Math.hypot(bx - ax, by - ay, bz - az);
    const e2 = Math.hypot(cx - bx, cy - by, cz - bz);
    const e3 = Math.hypot(ax - cx, ay - cy, az - cz);
    const Lmax = Math.max(e1, e2, e3);
    const alt = Lmax > 0 ? (2 * A) / Lmax : 0;
    minAlt[f] = alt; ar[f] = alt > 0 ? Lmax / alt : Infinity;
    if (alt * 1000 < SLIVER_UM) { sliverC += 1; sliverA += A; }
    if (alt * 1000 < 1) sliverC1 += 1;
    if (!(ar[f] <= AR_BAR)) { arOverC += 1; arOverA += A; }
    // inversion — facet normal AS WOUND vs the analytic outward normal at the centroid
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    const fx = uy * wz - uz * wy; const fy = uz * wx - ux * wz; const fz = ux * wy - uy * wx;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3; const gz = (az + bz + cz) / 3;
    const gth = Math.atan2(gy, gx);
    for (const h of hs) {
      analyticNormal(gth, gz, h, na);
      const dp = (fx * na[0] + fy * na[1] + fz * na[2]) / fl;
      if (dp < 0) { invCount[String(h)] += 1; invArea[String(h)] += A; if (h === H_REF) inv[f] = 1; }
    }
    // position — every vertex, |r − rA|
    if (f % posStride === 0) {
      let wmax = 0;
      for (let k = 0; k < 3; k += 1) {
        const x = soup[f * 9 + k * 3]; const y = soup[f * 9 + k * 3 + 1]; const z = soup[f * 9 + k * 3 + 2];
        const dv = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        if (dv > wmax) wmax = dv;
      }
      posSample.push(wmax * 1000);
      if (wmax > posMax) posMax = wmax;
      if (wmax > POS_BAR_MM) { posOverC += 1; posOverA += A; }
    }
  }
  const sampled = posSample.length;
  const h: Harm = {
    name, mult, tris: n, areaMm2: area,
    interior: dd.interiorEdges, boundary: dd.boundaryEdges, nonManifold: dd.nonManifoldEdges, inconsistent: dd.inconsistentEdges,
    over45Area: (o45a / area) * 100, over45Count: (o45c / n) * 100, maxDeg: maxAng,
    bandArea: bandArea.map((v) => (v / area) * 100), bandCount: bandCount.map((v) => (v / n) * 100),
    minAltP50Um: q(minAlt, 0.5) * 1000, minAltP01Um: q(minAlt, 0.01) * 1000, minAltMinUm: q(minAlt, 0) * 1000,
    sliverCount: sliverC, sliverArea: (sliverA / area) * 100, sliverCountSub1: sliverC1,
    arP99: q(ar, 0.99), arMax: q(ar, 1), arOverCount: arOverC, arOverArea: (arOverA / area) * 100,
    invCount, invArea,
    posMaxUm: posMax * 1000, posP99Um: q(posSample, 0.99), posOverCount: posOverC, posOverArea: (posOverA / area) * 100,
    perFacetMaxRad: dd.perFacetMaxRad, area: dd.areaMm2, inv, minAlt,
  };
  log(`  [${name} ${mult}x] tris ${n} area ${area.toFixed(3)} ${el()}  (pos sampled ${sampled})`);
  return h;
}

// ── BUILD THE ARMS ───────────────────────────────────────────────────────────────────────────────────
log('── BUILDING ARMS ──');
const arms: Harm[] = [];
const base = harmStat('BASE(mesh)', 1, secSoup, HTAB);
arms.push(base);
const placebo: Harm[] = []; const nulls: Harm[] = [];
{
  let cur = secSoup; let curN = secSoup;
  for (let lvl = 1; lvl <= LEVELS; lvl += 1) {
    cur = subdivide(cur, true);
    const p = harmStat('PLACEBO 1->4', 4 ** lvl, cur, HTAB);
    placebo.push(p); arms.push(p);
    curN = subdivide(curN, false);
    const nn = harmStat('NULL planar', 4 ** lvl, curN, HTAB);
    nulls.push(nn); arms.push(nn);
    if (envI('PF_RH_SNAP', 1) === 1) {
      const snapped = harmStat('PLACEBO snap1pm', 4 ** lvl, snapSoup(cur, 1e-9), [H_REF]);
      arms.push(snapped);
    }
  }
}
if (DO_GRID === 1) {
  // the S115 GRADED arm's own harm profile, at matched count (its nT/nZ formula, uniform lines: the
  // turn-equalised lines need turnDensity; UNIFORM is the strictly-worse structured arm and is enough
  // to answer "do the structured arms have slivers/inversions of their own?").
  const Lsec = W * ((DIMS.Rb + DIMS.Rt) / 2);
  const cells = secF.length / 2;
  const nZ = Math.max(4, Math.round(Math.sqrt(cells / (Lsec / H))));
  const nT = Math.max(4, Math.round(cells / nZ));
  const soup = new Float64Array(2 * nT * nZ * 9);
  let o = 0;
  const P = (th: number, z: number): [number, number, number] => { const r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  for (let i = 0; i < nT; i += 1) {
    for (let j = 0; j < nZ; j += 1) {
      const p00 = P(t0 + ((t1 - t0) * i) / nT, (H * j) / nZ);
      const p10 = P(t0 + ((t1 - t0) * (i + 1)) / nT, (H * j) / nZ);
      const p11 = P(t0 + ((t1 - t0) * (i + 1)) / nT, (H * (j + 1)) / nZ);
      const p01 = P(t0 + ((t1 - t0) * i) / nT, (H * (j + 1)) / nZ);
      for (const tri of [[p00, p10, p11], [p00, p11, p01]]) for (const p of tri) { soup[o] = p[0]; soup[o + 1] = p[1]; soup[o + 2] = p[2]; o += 3; }
    }
  }
  arms.push(harmStat('UNIFORM grid', 1, soup, HTAB));
}
log('');

// ── TABLE 1: TOPOLOGY INTEGRITY — the check `soupStat` computes and discards ─────────────────────────
log('── T1  WELD / TOPOLOGY INTEGRITY (soupStat computes interior+boundary and NEVER PRINTS THEM) ──');
log('   A correctly welded 1->4 subdivision has boundary = 2^level x base boundary. Cross-parent adjacency');
log('   exists ONLY if the shared midpoint is BIT-IDENTICAL in both parents. Lost adjacency ⇒ per-facet MAX');
log('   dihedral is taken over fewer neighbours ⇒ the >45 share is UNDER-READ.');
log('   arm                mult      tris     interior   boundary   nonManif  inconsist   expected boundary   VERDICT');
for (const a of arms) {
  const lvl = Math.round(Math.log2(a.mult) / 2);
  const exp = a.name.includes('PLACEBO') || a.name.includes('NULL') ? base.boundary * 2 ** lvl : NaN;
  const bad = Number.isFinite(exp) && a.boundary > exp * 1.02;
  log(`   ${a.name.padEnd(16)} ${String(a.mult).padStart(4)}x ${String(a.tris).padStart(9)} ${String(a.interior).padStart(11)} ${String(a.boundary).padStart(10)} ${String(a.nonManifold).padStart(10)} ${String(a.inconsistent).padStart(10)}   ${(Number.isFinite(exp) ? String(exp) : '—').padStart(9)}          ${bad ? '*** WELD BROKEN ***' : 'ok'}`);
}
log('');

// ── TABLE 2: THE HEADLINE QUANTITIES, COUNT AND AREA SIDE BY SIDE ───────────────────────────────────
log('── T2  >45 CLASS: AREA vs COUNT, and the ratio the run only ever quoted on AREA ──');
log('   arm                mult    area mm2  areaRatio    >45 AREA%   >45 COUNT%   MAXdeg     fold AREA%   fold COUNT%');
for (const a of arms) {
  log(`   ${a.name.padEnd(16)} ${String(a.mult).padStart(4)}x ${a.areaMm2.toFixed(3).padStart(10)} ${(a.areaMm2 / base.areaMm2).toFixed(4).padStart(10)} ${f2(a.over45Area, 4).padStart(12)}% ${f2(a.over45Count, 4).padStart(11)}% ${f2(a.maxDeg, 3).padStart(9)} ${f2(a.bandArea[4], 4).padStart(12)}% ${f2(a.bandCount[4], 4).padStart(11)}%`);
}
log('');
log('   PLACEBO / NULL, the run\'s own rule ("quote the placebo AGAINST THE NULL") applied to BOTH quantities:');
log('   mult    AREA ratio p/n     COUNT ratio p/n     fold-AREA p/n     fold-COUNT p/n');
for (let i = 0; i < placebo.length; i += 1) {
  const p = placebo[i]; const nn = nulls[i];
  log(`   ${String(p.mult).padStart(4)}x ${f2(p.over45Area / nn.over45Area, 4).padStart(14)} ${f2(p.over45Count / nn.over45Count, 4).padStart(19)} ${f2(p.bandArea[4] / nn.bandArea[4], 4).padStart(17)} ${f2(p.bandCount[4] / nn.bandCount[4], 4).padStart(17)}`);
}
log('');

// ── TABLE 3: SLIVERS + ASPECT ───────────────────────────────────────────────────────────────────────
log('── T3  SLIVERS (never measured on any arm). NULL children are SIMILAR to the parent, so NULL is the');
log(`   exact shape control: any PLACEBO/NULL gap is caused by the reprojection alone. sliver = minAlt < ${SLIVER_UM} um.`);
log('   arm                mult   minAlt p50   p01      MIN um    sliverCOUNT  sliverAREA%  minAlt<1um   AR p99     AR max      AR>50 COUNT  AR>50 AREA%');
for (const a of arms) {
  log(`   ${a.name.padEnd(16)} ${String(a.mult).padStart(4)}x ${f2(a.minAltP50Um, 2).padStart(10)} ${f2(a.minAltP01Um, 4).padStart(9)} ${f2(a.minAltMinUm, 6).padStart(10)} ${String(a.sliverCount).padStart(12)} ${f2(a.sliverArea, 4).padStart(11)}% ${String(a.sliverCountSub1).padStart(11)} ${f2(a.arP99, 2).padStart(10)} ${f2(a.arMax, 1).padStart(11)} ${String(a.arOverCount).padStart(12)} ${f2(a.arOverArea, 4).padStart(11)}%`);
}
log('');

// ── TABLE 4: INVERSIONS, h SWEPT ────────────────────────────────────────────────────────────────────
log('── T4  INVERSIONS — facet normal AS WOUND vs the analytic outward normal at the centroid, h SWEPT.');
log('   NULL preserves every parent normal exactly ⇒ its inverted SHARE must equal BASE\'s. Any PLACEBO excess is created.');
log(`   arm                mult   ${HTAB.map((h) => `inv%COUNT@${h.toExponential(0)}`).join('  ')}`);
for (const a of arms) {
  log(`   ${a.name.padEnd(16)} ${String(a.mult).padStart(4)}x   ${HTAB.map((h) => f2((a.invCount[String(h)] / a.tris) * 100, 4).padStart(14)).join('  ')}`);
}
log(`   arm                mult   ${HTAB.map((h) => `inv%AREA@${h.toExponential(0)} `).join('  ')}`);
for (const a of arms) {
  log(`   ${a.name.padEnd(16)} ${String(a.mult).padStart(4)}x   ${HTAB.map((h) => f2((a.invArea[String(h)] / a.areaMm2) * 100, 4).padStart(14)).join('  ')}`);
}
log('');

// ── TABLE 5: POSITION ───────────────────────────────────────────────────────────────────────────────
log(`── T5  POSITION |r − rA| per arm (the campaign standard is ${POS_BAR_MM} mm = ${POS_BAR_MM * 1000} um) ──`);
log('   arm                mult     MAX um       p99 um    facets over bar   over-bar AREA%');
for (const a of arms) {
  log(`   ${a.name.padEnd(16)} ${String(a.mult).padStart(4)}x ${f2(a.posMaxUm, 2).padStart(11)} ${f2(a.posP99Um, 4).padStart(12)} ${String(a.posOverCount).padStart(17)} ${f2(a.posOverArea, 4).padStart(16)}%`);
}
log('');

// ── TABLE 6: 1-RING COLLATERAL — defects CREATED on a good parent ────────────────────────────────────
log('── T6  1-RING COLLATERAL: children BAD under a GOOD parent (defect CREATED) and the converse (CURED).');
log('   Child->parent is exact: child c of level L belongs to base facet floor(c / 4^L).');
log('   arm             mult   parents  goodParents   CREATED(parent good, >=1 child >45)  count   AREA mm2   %ofArmArea |  CURED(parent bad, all children ok)  count   parentAREA mm2');
const thr45 = (45 * Math.PI) / 180;
for (const a of [...placebo, ...nulls]) {
  const lvl = Math.round(Math.log2(a.mult) / 2);
  const kids = 4 ** lvl;
  let goodP = 0; let created = 0; let createdArea = 0; let cured = 0; let curedArea = 0;
  for (let f = 0; f < base.tris; f += 1) {
    const parentBad = base.perFacetMaxRad[f] > thr45;
    if (!parentBad) goodP += 1;
    let anyBad = false; let badArea = 0;
    for (let k = 0; k < kids; k += 1) {
      const c = f * kids + k;
      if (a.perFacetMaxRad[c] > thr45) { anyBad = true; badArea += a.area[c]; }
    }
    if (!parentBad && anyBad) { created += 1; createdArea += badArea; }
    if (parentBad && !anyBad) { cured += 1; curedArea += base.area[f]; }
  }
  log(`   ${a.name.padEnd(14)} ${String(a.mult).padStart(4)}x ${String(base.tris).padStart(8)} ${String(goodP).padStart(12)} ${String(created).padStart(38)} ${createdArea.toFixed(4).padStart(10)} ${f2((createdArea / a.areaMm2) * 100, 4).padStart(11)}% | ${String(cured).padStart(34)} ${curedArea.toFixed(4).padStart(14)}`);
}
log('');
log('── T7  INVERSIONS CREATED on a NON-inverted parent (h = ref) ──');
for (const a of [...placebo, ...nulls]) {
  const lvl = Math.round(Math.log2(a.mult) / 2);
  const kids = 4 ** lvl;
  let createdInv = 0; let createdInvArea = 0;
  for (let f = 0; f < base.tris; f += 1) {
    if (base.inv[f] === 1) continue;
    for (let k = 0; k < kids; k += 1) {
      const c = f * kids + k;
      if (a.inv[c] === 1) { createdInv += 1; createdInvArea += a.area[c]; }
    }
  }
  log(`   ${a.name.padEnd(14)} ${String(a.mult).padStart(4)}x   inversions created ${String(createdInv).padStart(8)}   AREA ${createdInvArea.toFixed(6)} mm2 = ${f2((createdInvArea / a.areaMm2) * 100, 5)}% of arm`);
}
log('');
log('── T8  SLIVERS CREATED: child minAlt < 1 um under a parent with minAlt > 10 um ──');
for (const a of [...placebo, ...nulls]) {
  const lvl = Math.round(Math.log2(a.mult) / 2);
  const kids = 4 ** lvl;
  let cs = 0;
  for (let f = 0; f < base.tris; f += 1) {
    if (base.minAlt[f] * 1000 <= 10) continue;
    for (let k = 0; k < kids; k += 1) if (a.minAlt[f * kids + k] * 1000 < 1) cs += 1;
  }
  log(`   ${a.name.padEnd(14)} ${String(a.mult).padStart(4)}x   slivers created ${String(cs).padStart(8)}`);
}

OUT.arms = arms.map((a) => ({
  name: a.name, mult: a.mult, tris: a.tris, areaMm2: a.areaMm2, interior: a.interior, boundary: a.boundary,
  nonManifold: a.nonManifold, inconsistent: a.inconsistent, over45Area: a.over45Area, over45Count: a.over45Count,
  maxDeg: a.maxDeg, bandArea: a.bandArea, bandCount: a.bandCount, minAltP50Um: a.minAltP50Um, minAltP01Um: a.minAltP01Um,
  minAltMinUm: a.minAltMinUm, sliverCount: a.sliverCount, sliverArea: a.sliverArea, arP99: a.arP99, arMax: a.arMax,
  arOverCount: a.arOverCount, arOverArea: a.arOverArea, invCount: a.invCount, invArea: a.invArea,
  posMaxUm: a.posMaxUm, posP99Um: a.posP99Um, posOverCount: a.posOverCount, posOverArea: a.posOverArea,
}));
writeFileSync(`${OUTDIR}/REV_S115_HARM_${TAG}.json`, JSON.stringify(OUT, null, 2));
log('');
log(`wrote ${OUTDIR}/REV_S115_HARM_${TAG}.json   done ${el()}`);

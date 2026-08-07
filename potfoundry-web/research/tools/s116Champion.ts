// s116Champion.ts — S116 PHASE 2: THE HEAD-TO-HEAD. WHICH CelticTriquetra MESH IS THE BEST ONE WE HAVE?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The user asked to SEE the best mesh this campaign can currently make. Phase 1 of S116 measured the
// SHIPPING CelticTriquetra mesh to death; it did NOT ask whether a better one already exists on disk.
// It does: three CelticTriquetra meshes were emitted by the same driver family under different flags.
// This tool scores them ON ONE INSTRUMENT, IN ONE PROCESS, so the comparison is of BYTES, not of reports
// written months apart by different code.
//
// PRE-REGISTERED, BEFORE ANY NUMBER WAS SEEN (kill lines; a one-sided bar is vacuous, so each has a
// FLOOR as well as a ceiling):
//   K1  the challenger's over-analytic-ceiling FOLD area, as a share of ITS OWN mesh area, must be at
//       least 2.00x SMALLER than the shipping mesh's. (ceiling)
//   K2  the challenger's honest position defect must not be WORSE than the shipping mesh's by more than
//       1.25x. Measured here by the R1 radial UPPER BOUND (>0.01 mm area share); R3 adjudicates the
//       winner afterwards with s116PosFloor. (floor on accuracy)
//   K3  topology must not regress: non-manifold 0, inconsistent winding 0, and boundary edges must not
//       INCREASE. (floor)
//   K4  the challenger's 3D area must not fall BELOW the analytic band area. A mesh can trivially win
//       K1 by deleting surface; K4 forbids that. (floor)
// A challenger that fails ANY of the four is not crowned, and the failure is reported as the headline.
//
// COST-MATCHED PLACEBO (mandatory — seven operators in this campaign have died on one):
//   P-DECIMATE  the shipping mesh with an UNINFORMED key (splitmix64 of the facet index) dropping
//               exactly enough facets to match the challenger's triangle COUNT. This is the null
//               hypothesis "fold area is just proportional to triangle count". The placebo is
//               GENEROUS: dropping facets destroys interior edges, and a fold needs an interior edge,
//               so decimation mechanically DEFLATES the fold statistic. If the challenger still wins
//               against a placebo tilted in the placebo's favour, the count confound is dead.
//   P-REALALT   celtictriquetra_ring_DS-.stl — a REAL driver mesh with FEWER triangles than the
//               challenger. If "fewer triangles ⇒ fewer folds" were the mechanism, this must beat the
//               challenger. It is scored on exactly the same instrument.
//
// SCARS. Ceiling h is swept (scar 3) exactly as in s116EmitInvariant. Barycentric lattice order k is
// swept on R1 (scar 2). PRECOND is EXHAUSTIVE over every facet corner, never strided (scar 5).
// Orientation normDeg is NOT computed here — it needs orientOfFacet with an explicit inset and its own
// h/k ladders, and that runs in s116ChampOrient.ts on the winner alone.
//
// Usage: bash research/tools/run-s116-champ.sh    env PF_S116_STLS="TAG=abs;TAG=abs;..."
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

const STYLE = envS('PF_S116_STYLE', 'CelticTriquetra');
const OUTDIR = envS('PF_S116_OUTDIR', 'research/exchange/_strataConformBisect/s116');
const TAG = envS('PF_S116_TAG', 'CHAMP');
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S116_BARHI', 0.01);
const BAR_LO = envF('PF_S116_BARLO', 0.001);
const K_R1 = envI('PF_S116_K', 8);
const KSW = envS('PF_S116_KSWEEP', '4,8,16,24').split(',').map(Number);
const KSW_N = envI('PF_S116_KSWEEP_N', 25000);
const H_REF = envF('PF_S116_HFD', 2e-6);
const CEIL_N = envI('PF_S116_CEILN', 1200);
const MC_N = envI('PF_S116_MCN', 400000);
const SPEC = envS('PF_S116_STLS', '');
if (SPEC.length === 0) { log('*** PF_S116_STLS required: "TAG=abspath;TAG=abspath;..." ***'); process.exit(2); }
const MESHES = SPEC.split(';').map((s) => s.trim()).filter((s) => s.length > 0).map((s) => {
  const i = s.indexOf('='); return { tag: s.slice(0, i), path: s.slice(i + 1) };
});
const BASE_TAG = envS('PF_S116_BASE', MESHES[0].tag);
const CHAL_TAG = envS('PF_S116_CHAL', MESHES.length > 1 ? MESHES[1].tag : MESHES[0].tag);

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const qt = (v: number[], p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');

// ── analytic ────────────────────────────────────────────────────────────────────────────────────────
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 PHASE 2 — HEAD-TO-HEAD: WHICH ${STYLE} MESH IS THE BEST ONE WE HAVE? (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=1`);
log(`bars   HI ${BAR_HI} mm   LO ${BAR_LO} mm     R1 lattice k=${K_R1}`);
log(`base   ${BASE_TAG}      challenger ${CHAL_TAG}`);
for (const m of MESHES) log(`   ${m.tag.padEnd(12)} ${m.path}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ANALYTIC CEILING — h SWEPT (scar 3). Same code as s116EmitInvariant so the numbers are comparable.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function ceilingAt(hfd: number, N: number): { gmax: number; deg: number } {
  let gmax = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const th = (2 * Math.PI * (i + 0.5)) / N; const z = (H * (j + 0.5)) / N;
      const r0 = rA(th, z);
      const hT = hfd / Math.max(1e-9, r0);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      let zl = z - hfd; let zh = z + hfd;
      if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
      if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const g = Math.hypot(rt / r0, rz);
      if (g > gmax) gmax = g;
    }
  }
  return { gmax, deg: 2 * Math.atan(gmax) * DEG };
}
log('── ANALYTIC CEILING  CEIL = 2*atan(max|grad r|), h SWEPT (scar 3) ──');
const ceilLadder: Array<{ h: number; gmax: number; deg: number }> = [];
for (const hh of [2e-6, 2e-5, 2e-4, 1e-3]) {
  const c = ceilingAt(hh, 400); ceilLadder.push({ h: hh, ...c });
  log(`   h=${ex(hh)} (400^2)  max|grad r| ${c.gmax.toFixed(4)}  CEIL ${c.deg.toFixed(3)} deg`);
}
const CREF = ceilingAt(H_REF, CEIL_N);
const CEIL_DEG = CREF.deg;
log(`   REFERENCE h=${ex(H_REF)} on ${CEIL_N}^2: max|grad r| ${CREF.gmax.toFixed(4)}  *** CEIL = ${CEIL_DEG.toFixed(3)} deg *** ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ANALYTIC BAND AREA — Monte-Carlo with a FIXED seed, so K4 is reproducible.
// dA = J dtheta dz with J = sqrt(r_th^2 + r^2 (1 + r_z^2)).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let mcArea = 0; let mcSe = 0;
{
  let s = 0x9e3779b97f4a7c15n;
  const rnd = (): number => { s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn; let z = s; z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn; z ^= z >> 31n; return Number(z >> 11n) / 9007199254740992; };
  const hfd = H_REF; let sum = 0; let sum2 = 0;
  for (let i = 0; i < MC_N; i += 1) {
    const th = 2 * Math.PI * rnd(); const z = H * rnd();
    const r0 = rA(th, z);
    const hT = hfd / Math.max(1e-9, r0);
    const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
    let zl = z - hfd; let zh = z + hfd;
    if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
    if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
    const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
    const J = Math.sqrt(rt * rt + r0 * r0 * (1 + rz * rz));
    sum += J; sum2 += J * J;
  }
  const dom = 2 * Math.PI * H;
  const mean = sum / MC_N; const varr = Math.max(0, sum2 / MC_N - mean * mean);
  mcArea = mean * dom; mcSe = dom * Math.sqrt(varr / MC_N);
  log(`── ANALYTIC BAND AREA (Monte-Carlo, fixed seed, n=${MC_N}): ${mcArea.toFixed(3)} +/- ${mcSe.toFixed(3)} mm2 (1 s.e.) ${el()} ──`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PER-MESH SCORE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const latticePts = (k: number): Float64Array => {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
};
const LAT = latticePts(K_R1); const NP = LAT.length / 3;

const DIH_BARS = [45, 90, 150, CEIL_DEG, 170, 175, 178];
const GR_BANDS: Array<[number, number, string]> = [
  [1.0, 1.5, '[1.0,1.5)  flat-ish  '], [1.5, 3, '[1.5,3)    tilted   '], [3, 10, '[3,10)     steep    '],
  [10, 100, '[10,100)   near-edge'], [100, 1e4, '[1e2,1e4)  CURTAIN  '], [1e4, Infinity, '>=1e4      DEGENERATE'],
];

interface Score {
  tag: string; path: string; nTri: number; area3D: number;
  precond: { p50: number; p99: number; max: number; over10: number; over50: number; nC: number; areaOver10: number };
  topo: { interior: number; boundary: number; nonManifold: number; inconsistent: number };
  dih: Array<{ bar: number; count: number; area: number; frac: number; max: number }>;
  needleFracArea: number; needleFracCount: number;
  inverted: { count: number; area: number };
  gr: Array<{ label: string; count: number; area: number; frac: number }>;
  poleArea: number; poleFrac: number;
  r1: { overHI: number; areaHI: number; fracHI: number; overLO: number; areaLO: number; fracLO: number; max: number; p50: number; p90: number; p99: number };
  areaExcess: number; areaExcessPct: number;
}

function scoreMesh(tag: string, path: string, drop: Uint8Array | null, kSweep: boolean): Score {
  const M = readMeshFloat64(path, false);
  let xyz = M.xyz; let nTri = M.nTri;
  if (drop !== null) {
    // uninformed decimation: keep facets where drop[f]===0, repack
    let keep = 0; for (let f = 0; f < nTri; f += 1) if (drop[f] === 0) keep += 1;
    const nx = new Float64Array(keep * 9); let w = 0;
    for (let f = 0; f < nTri; f += 1) if (drop[f] === 0) { nx.set(xyz.subarray(f * 9, f * 9 + 9), w * 9); w += 1; }
    xyz = nx; nTri = keep;
  }
  log(`────────────────────────────────────────────────────────────────────────────────────────────────`);
  log(`── ${tag}  ${path}${drop !== null ? '   [UNINFORMED DECIMATION APPLIED]' : ''}`);
  log(`   facets ${nTri.toLocaleString()} ${el()}`);

  // ---- PRECOND, EXHAUSTIVE over EVERY corner (scar 5) ----
  const pre = { p50: 0, p99: 0, max: 0, over10: 0, over50: 0, nC: nTri * 3, areaOver10: 0 };
  const preFacet = new Float64Array(nTri);
  {
    const devs: number[] = [];
    for (let f = 0; f < nTri; f += 1) {
      const o = f * 9; let w = 0;
      for (let v = 0; v < 3; v += 1) {
        const x = xyz[o + v * 3]; const y = xyz[o + v * 3 + 1]; const z = xyz[o + v * 3 + 2];
        const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)) * 1000;
        if (dd > w) w = dd;
        if (dd > 10) pre.over10 += 1;
        if (dd > 50) pre.over50 += 1;
        if (((f * 3 + v) % 37) === 0) devs.push(dd);
      }
      preFacet[f] = w; if (w > pre.max) pre.max = w;
    }
    devs.sort((a, b) => a - b);
    pre.p50 = qt(devs, 0.5); pre.p99 = qt(devs, 0.99);
  }

  // ---- geometry, R1, parametric footprint ----
  const areaA = new Float64Array(nTri);
  const r1 = new Float64Array(nTri);
  const grA = new Float64Array(nTri);
  const minAltUm = new Float64Array(nTri);
  const apsSign = new Int8Array(nTri);
  let area3D = 0;
  {
    for (let f = 0; f < nTri; f += 1) {
      const o = f * 9;
      const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
      const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
      const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const ar = 0.5 * Math.hypot(nx, ny, nz);
      areaA[f] = ar; area3D += ar;
      // parametric footprint in ARC-LENGTH units
      const tha = Math.atan2(ay, ax);
      const thb = tha + dThRaw(tha, Math.atan2(by, bx));
      const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
      const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
      const ua = tha * rm, ub = thb * rm, uc = thc * rm;
      const aps = 0.5 * ((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
      apsSign[f] = aps > 0 ? 1 : aps < 0 ? -1 : 0;
      const apa = Math.abs(aps);
      grA[f] = apa > 0 ? ar / apa : Infinity;
      const e1 = Math.hypot(ub - ua, bz - az), e2 = Math.hypot(uc - ub, cz - bz), e3 = Math.hypot(ua - uc, az - cz);
      const emax = Math.max(e1, e2, e3);
      minAltUm[f] = emax > 0 ? (2 * apa / emax) * 1000 : 0;
      // R1 over the barycentric lattice
      let w = 0;
      for (let p = 0; p < NP; p += 1) {
        const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
        const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
        const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        if (dd > w) w = dd;
      }
      r1[f] = w;
    }
  }
  for (let f = 0; f < nTri; f += 1) if (preFacet[f] > 10) pre.areaOver10 += areaA[f];

  // ---- SCAR 2: k ladder on R1 (strided) ----
  if (kSweep) {
    log('   SCAR 2 — R1 barycentric lattice order k (strided ladder; the main R1 above is EXHAUSTIVE at k=' + K_R1 + '):');
    log('     k    pts   MAX R1 mm      mean R1 mm     >HI      >LO   (n)');
    const st = Math.max(1, Math.floor(nTri / KSW_N));
    for (const k of KSW) {
      const L = latticePts(k); const np = L.length / 3;
      let mx = 0, sum = 0, n = 0, oh = 0, ol = 0;
      for (let f = 0; f < nTri; f += st) {
        const o = f * 9;
        const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
        const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
        const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
        let w = 0;
        for (let p = 0; p < np; p += 1) {
          const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
          const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
          const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
          if (dd > w) w = dd;
        }
        if (w > mx) mx = w; sum += w; n += 1; if (w > BAR_HI) oh += 1; if (w > BAR_LO) ol += 1;
      }
      log(`   ${String(k).padStart(4)} ${String(np).padStart(6)}  ${ex(mx).padStart(12)}  ${ex(sum / n).padStart(12)}  ${String(oh).padStart(7)}  ${String(ol).padStart(7)}   (${n})`);
    }
  }

  // ---- topology + dihedral ----
  const idx = new Int32Array(nTri * 3);
  for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
  const DR = facetDihedrals(xyz, idx);
  const topo = { interior: DR.interiorEdges, boundary: DR.boundaryEdges, nonManifold: DR.nonManifoldEdges, inconsistent: DR.inconsistentEdges };
  log(`   topology: interior ${topo.interior}  boundary ${topo.boundary}  non-manifold ${topo.nonManifold}  inconsistent-winding ${topo.inconsistent}  ${el()}`);
  log(`   3D area ${area3D.toFixed(3)} mm2   analytic band ${mcArea.toFixed(3)} mm2   EXCESS ${(area3D - mcArea).toFixed(3)} mm2 = ${((area3D - mcArea) / mcArea * 100).toFixed(4)}%`);

  const dihDeg = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) dihDeg[f] = DR.perFacetMaxRad[f] * DEG;

  const dih = DIH_BARS.map((bar) => {
    let count = 0, area = 0, max = 0;
    for (let f = 0; f < nTri; f += 1) if (dihDeg[f] > bar) { count += 1; area += areaA[f]; if (dihDeg[f] > max) max = dihDeg[f]; }
    return { bar, count, area, frac: area / area3D, max };
  });
  log('   ── DIHEDRAL LADDER (COUNT + AREA + MAX, per facet) ──');
  log('      bar deg        count       area mm2     %MESH area     MAX deg');
  for (const d of dih) log(`   ${d.bar.toFixed(2).padStart(11)}  ${String(d.count).padStart(11)}  ${d.area.toFixed(3).padStart(13)}  ${(d.frac * 100).toFixed(4).padStart(12)}%  ${d.max.toFixed(3).padStart(10)}`);

  // needles within the CEIL class
  let needN = 0, needA = 0, clsN = 0, clsA = 0;
  for (let f = 0; f < nTri; f += 1) if (dihDeg[f] > CEIL_DEG) { clsN += 1; clsA += areaA[f]; if (minAltUm[f] < 2) { needN += 1; needA += areaA[f]; } }
  log(`   arc-space NEEDLES (<2 um min altitude) within the >CEIL class: ${needN} (${pct(needN, clsN)}% of class count), area ${needA.toFixed(3)} mm2 = ${pct(needA, clsA)}% of class area`);

  // inverted-footprint class
  let invN = 0, invA = 0;
  for (let f = 0; f < nTri; f += 1) if (apsSign[f] < 0) { invN += 1; invA += areaA[f]; }
  log(`   INVERTED parametric footprint (negative signed area): ${invN} facets (${pct(invN, nTri)}%), area ${invA.toFixed(3)} mm2 = ${pct(invA, area3D)}% OF MESH`);

  // graphRatio bands
  const gr = GR_BANDS.map(([lo, hi, label]) => {
    let count = 0, area = 0;
    for (let f = 0; f < nTri; f += 1) { const g = grA[f]; if (g >= lo && g < hi) { count += 1; area += areaA[f]; } }
    return { label, count, area, frac: area / area3D };
  });
  log('   ── graphRatio DEGENERACY CENSUS (3D area / parametric footprint area) ──');
  log('      band                     count       area mm2    %MESH area');
  for (const g of gr) log(`      ${g.label}  ${String(g.count).padStart(10)}  ${g.area.toFixed(3).padStart(13)}  ${(g.frac * 100).toFixed(4).padStart(11)}%`);
  const poleArea = gr[4].area + gr[5].area;
  log(`      POLE (graphRatio >= 100): ${(gr[4].count + gr[5].count).toLocaleString()} facets, ${poleArea.toFixed(3)} mm2 = ${pct(poleArea, area3D)}% OF MESH`);

  // R1 census
  let overHI = 0, areaHI = 0, overLO = 0, areaLO = 0, r1max = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (r1[f] > BAR_HI) { overHI += 1; areaHI += areaA[f]; }
    if (r1[f] > BAR_LO) { overLO += 1; areaLO += areaA[f]; }
    if (r1[f] > r1max) r1max = r1[f];
  }
  const r1s = Array.from(r1).sort((a, b) => a - b);
  log('   ── R1 RADIAL POSITION (PROVEN UPPER BOUND on the true distance; EXHAUSTIVE, k=' + K_R1 + ') ──');
  log(`      > ${BAR_HI} mm: ${overHI.toLocaleString()} facets (${pct(overHI, nTri)}%)  area ${areaHI.toFixed(3)} mm2 = ${pct(areaHI, area3D)}% OF MESH`);
  log(`      > ${BAR_LO} mm: ${overLO.toLocaleString()} facets (${pct(overLO, nTri)}%)  area ${areaLO.toFixed(3)} mm2 = ${pct(areaLO, area3D)}% OF MESH`);
  log(`      p50 ${ex(qt(r1s, 0.5))}  p90 ${ex(qt(r1s, 0.9))}  p99 ${ex(qt(r1s, 0.99))}  MAX ${ex(r1max)} mm`);

  log(`   PRECOND (EXHAUSTIVE over ${pre.nC.toLocaleString()} corners): p50 ${ex(pre.p50)} p99 ${ex(pre.p99)} um  MAX ${pre.max.toFixed(3)} um   over10um ${pre.over10}  over50um ${pre.over50}   area of affected facets ${pre.areaOver10.toFixed(4)} mm2 (${pct(pre.areaOver10, area3D)}%)`);
  log('');

  return {
    tag, path, nTri, area3D, precond: pre, topo, dih,
    needleFracArea: clsA > 0 ? needA / clsA : 0, needleFracCount: clsN > 0 ? needN / clsN : 0,
    inverted: { count: invN, area: invA }, gr, poleArea, poleFrac: poleArea / area3D,
    r1: { overHI, areaHI, fracHI: areaHI / area3D, overLO, areaLO, fracLO: areaLO / area3D, max: r1max, p50: qt(r1s, 0.5), p90: qt(r1s, 0.9), p99: qt(r1s, 0.99) },
    areaExcess: area3D - mcArea, areaExcessPct: (area3D - mcArea) / mcArea * 100,
  };
}

const scores: Score[] = [];
for (const m of MESHES) scores.push(scoreMesh(m.tag, m.path, null, true));

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// COST-MATCHED PLACEBO — UNINFORMED DECIMATION of the base mesh to the challenger's triangle count
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const base = scores.find((s) => s.tag === BASE_TAG);
const chal = scores.find((s) => s.tag === CHAL_TAG);
let placebo: Score | null = null;
if (base !== undefined && chal !== undefined && chal.nTri < base.nTri) {
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`── COST-MATCHED PLACEBO: drop ${(base.nTri - chal.nTri).toLocaleString()} facets from ${BASE_TAG} by an UNINFORMED key`);
  log(`   (splitmix64 of the facet index — knows NOTHING about geometry). Target count = ${chal.nTri.toLocaleString()} = ${CHAL_TAG}'s.`);
  log('   NOTE the placebo is GENEROUS: deleting facets destroys interior edges, and a fold REQUIRES an');
  log('   interior edge, so decimation mechanically DEFLATES the fold statistic. The challenger must beat');
  log('   a placebo that has been handed an advantage.');
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  const n = base.nTri;
  const keys = new Float64Array(n);
  for (let f = 0; f < n; f += 1) {
    let z = BigInt(f) * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    z ^= z >> 31n;
    keys[f] = Number(z >> 11n) / 9007199254740992;
  }
  const sorted = Array.from(keys).sort((a, b) => a - b);
  const thr = sorted[chal.nTri - 1];
  const drop = new Uint8Array(n);
  let kept = 0;
  for (let f = 0; f < n; f += 1) { if (keys[f] <= thr && kept < chal.nTri) { kept += 1; } else drop[f] = 1; }
  placebo = scoreMesh(`PLACEBO-DEC`, base.path, drop, false);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// VERDICT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   HEAD-TO-HEAD SUMMARY — COUNT + AREA + MAX, never one alone');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
const all: Score[] = placebo === null ? scores : [...scores, placebo];
const ci = DIH_BARS.findIndex((b) => b === CEIL_DEG);
const bi = DIH_BARS.findIndex((b) => b === 175);
log('   mesh            facets     area mm2   areaExc%   >CEIL area%   BLADE area%   POLE area%   INV area%   R1>0.01 area%   R1>0.001 area%   PRECOND max um   bnd  nonmf  incons');
for (const s of all) {
  log(`   ${s.tag.padEnd(13)} ${String(s.nTri).padStart(9)} ${s.area3D.toFixed(1).padStart(11)} ${s.areaExcessPct.toFixed(3).padStart(9)} ${(s.dih[ci].frac * 100).toFixed(4).padStart(13)} ${(s.dih[bi].frac * 100).toFixed(4).padStart(13)} ${(s.poleFrac * 100).toFixed(4).padStart(12)} ${(s.inverted.area / s.area3D * 100).toFixed(4).padStart(11)} ${(s.r1.fracHI * 100).toFixed(4).padStart(15)} ${(s.r1.fracLO * 100).toFixed(4).padStart(16)} ${s.precond.max.toFixed(2).padStart(16)} ${String(s.topo.boundary).padStart(5)} ${String(s.topo.nonManifold).padStart(6)} ${String(s.topo.inconsistent).padStart(7)}`);
}
log('');
if (base !== undefined && chal !== undefined && base.tag !== chal.tag) {
  const k1 = base.dih[ci].frac / chal.dih[ci].frac;
  const k2 = chal.r1.fracHI / base.r1.fracHI;
  const k3 = chal.topo.nonManifold === 0 && chal.topo.inconsistent === 0 && chal.topo.boundary <= base.topo.boundary;
  const k4 = chal.area3D >= mcArea;
  log('── PRE-REGISTERED KILL LINES ──');
  log(`   K1 fold-area ratio (base/challenger, need >= 2.00x):   ${k1.toFixed(3)}x   ${k1 >= 2 ? 'PASS' : '*** FAIL ***'}`);
  log(`   K2 position ratio (challenger/base, need <= 1.25x):    ${k2.toFixed(3)}x   ${k2 <= 1.25 ? 'PASS' : '*** FAIL ***'}`);
  log(`   K3 topology floor (nonmf 0, incons 0, bnd <= base):    nonmf ${chal.topo.nonManifold} incons ${chal.topo.inconsistent} bnd ${chal.topo.boundary} vs ${base.topo.boundary}   ${k3 ? 'PASS' : '*** FAIL ***'}`);
  log(`   K4 area floor (challenger area >= analytic band):      ${chal.area3D.toFixed(1)} vs ${mcArea.toFixed(1)} mm2   ${k4 ? 'PASS' : '*** FAIL ***'}`);
  log(`   VERDICT: ${k1 >= 2 && k2 <= 1.25 && k3 && k4 ? `*** ${chal.tag} IS CROWNED ***` : `*** ${chal.tag} IS NOT CROWNED — a kill line fired ***`}`);
  if (placebo !== null) {
    const pr = base.dih[ci].frac / placebo.dih[ci].frac;
    log('');
    log('── PLACEBO ──');
    log(`   PLACEBO-DEC fold-area ratio vs base: ${pr.toFixed(3)}x   (challenger ${k1.toFixed(3)}x)`);
    log(`   challenger beats the cost-matched uninformed placebo by ${(k1 / pr).toFixed(3)}x on fold area share.`);
  }
}
log('');
writeFileSync(`${OUTDIR}/S116_CHAMPION_${TAG}.json`, JSON.stringify({
  style: STYLE, dims: DIMS, defaults: D, ceilDeg: CEIL_DEG, ceilLadder, mcArea, mcSe, bars: { BAR_HI, BAR_LO }, kR1: K_R1,
  scores: all,
}, null, 1));
log(`json -> ${OUTDIR}/S116_CHAMPION_${TAG}.json  ${el()}`);
log('S116 PHASE 2 HEAD-TO-HEAD DONE');

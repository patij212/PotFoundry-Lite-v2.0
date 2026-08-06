// s113opSplit.ts — OPERATOR 2: TARGETED CONFORM SPLIT AT THE LOCATED CREASE CROSSING.
//
// WHAT THIS DOES. Offline, on the STL, never touching the driver: for every facet of the PINNED S113
// straddle class, find where the analytic crease crosses its boundary with a DENSE BOUNDARY SCAN, insert
// a vertex there SNAPPED ONTO THE ANALYTIC SURFACE, retriangulate, and CASCADE the same insertion into
// every other facet incident to that mesh edge so that no T-junction is created. Then measure the class
// before and after with the SAME instruments, and price the triangles.
//
// PRE-REGISTERED KILL LINE (stated here, in the source, BEFORE any result):
//   PRIMARY   >= 2.0x reduction in the target set's over-45 deg AREA by the ANGULAR ruler
//             (orientOfFacet normDeg, inset 0.05, k=8, winding) measured over the DESCENDANTS of the
//             6,193 pinned facets, at <= 10% triangle-count increase over the WHOLE mesh,
//             with no unreported T-junctions.
//   SECONDARY the same 2.0x on the over-45 deg DIHEDRAL area of the descendants (facetDihedrals).
//             Reported, but NOT the kill line: a conformed crease legitimately KEEPS a >45 deg dihedral —
//             that is the surface genuinely bending (S110 measured 135-157 deg across these footprints).
//             Scoring a conform split by the dihedral bar would score the correct answer as a failure.
//   FLOORS    (a one-sided bar is vacuous — S105): descendant AREA must be conserved to <= 0.5%;
//             every child edge >= FLOOR_MM; no NaN normDeg; child count > parent count where split.
//
// WHY A SPLIT AND NOT DENSITY. Fixture H2 measures a crease straddle under five halvings: the angle is
// invariant (x0.9968) while a smooth control decays x28.43. Refinement provably cannot fix a straddle;
// only putting a mesh edge ON the crease can.
//
// WHY THE DENSE SCAN AND NOT `locateTurnAdaptive`. The dumped `locs` come from locateTurnAdaptive, which
// carries an unpatched tie-break defect (orientRuler.ts:529) that walks a SMOOTH segment to the left end
// and returns a plausible `s`. This tool uses S113-A's dense boundary scan verbatim — the one with the
// bracket-tied step (no H_MIN floor => no collapse) and the re-scan refinement (never probes AT the
// crease) — and it SELF-TESTS it two-sided on closed forms before believing a single crossing.
//
// EVERY NUMBER IS COUNT + AREA + MAX, and every operator number is diffed against a PLACEBO split of the
// same facets at the MIDPOINT of the same edges: same triangle cost, same topology, wrong location. If
// the crease-located split does not beat the placebo, the "conform" story is refuted whatever the raw
// numbers say.
//
// Usage: bash research/tools/run-s113-opsplit.sh
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, radialNormal, type NormalSampler } from '../bridge/orientRuler';
import { aspect3 } from '../bridge/_shapeGuard';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const NDJ = process.env.PF_OPS_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const META = NDJ.replace(/\.ndjson$/, '.meta.json');
const LEG = process.env.PF_OPS_LEGALITY ?? 'research/exchange/_strataConformBisect/straddle/S113A_LEGALITY_GOTH.ndjson';
const STL = process.env.PF_OPS_STL ?? '';
const STYLE = process.env.PF_OPS_STYLE ?? 'GothicArches';
const TAG = process.env.PF_OPS_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_OPS_H', 120), Rb: envF('PF_OPS_RB', 40), Rt: envF('PF_OPS_RT', 50), expn: 1 };
const H = DIMS.H;

// driver bars, verbatim from _strataConformBisectL.test.ts
const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
const SHAPE_AR = envF('PF_CB_SHAPE_AR', 50);

// scanner constants (S113-A's, verbatim)
const GAP_FIND = envF('PF_OPS_GAPFIND', 2);
const REF_ITERS = Math.round(envF('PF_OPS_REFIT', 60));
const H_MIN = envF('PF_OPS_HMIN', 1e-7);
const SCAN_N = Math.round(envF('PF_OPS_N', 256));
const THRS = (process.env.PF_OPS_THRS ?? '5,15,45').split(',').map(Number);
const THR_PRIMARY = envF('PF_OPS_THR', 15);
const BAR_DEG = envF('PF_OPS_BAR', 45);          // the over-45 bar, both rulers
const INSETS = (process.env.PF_OPS_INSETS ?? '0,0.02,0.05').split(',').map(Number);
const INSET_PRIMARY = envF('PF_OPS_INSET', 0.05);
const K = Math.round(envF('PF_OPS_K', 8));
const FULLDIH = (process.env.PF_OPS_FULLDIH ?? '1') === '1';

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
mkdirSync(OUTDIR, { recursive: true });

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const dist = (v: number[], f = 4): string => (v.length === 0 ? '(empty)'
  : `min ${q(v, 0).toFixed(f)} p10 ${q(v, 0.1).toFixed(f)} p50 ${q(v, 0.5).toFixed(f)} p90 ${q(v, 0.9).toFixed(f)} max ${q(v, 0.999999).toFixed(f)}`);
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
function angDeg(px: number, py: number, pz: number, qx: number, qy: number, qz: number, rx: number, ry: number, rz: number): number {
  const ux = qx - px; const uy = qy - py; const uz = qz - pz;
  const wx = rx - px; const wy = ry - py; const wz = rz - pz;
  const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
  return (Math.atan2(Math.hypot(cx, cy, cz), ux * wx + uy * wy + uz * wz) * 180) / Math.PI;
}
const triArea = (t: ArrayLike<number>, o = 0): number => {
  const ux = t[o + 3] - t[o]; const uy = t[o + 4] - t[o + 1]; const uz = t[o + 5] - t[o + 2];
  const wx = t[o + 6] - t[o]; const wy = t[o + 7] - t[o + 1]; const wz = t[o + 8] - t[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
interface TriMetric { minEdge: number; minAngDeg: number; ar: number }
function triMetrics(t: ArrayLike<number>, o = 0): TriMetric {
  const e0 = Math.hypot(t[o + 3] - t[o], t[o + 4] - t[o + 1], t[o + 5] - t[o + 2]);
  const e1 = Math.hypot(t[o + 6] - t[o + 3], t[o + 7] - t[o + 4], t[o + 8] - t[o + 5]);
  const e2 = Math.hypot(t[o] - t[o + 6], t[o + 1] - t[o + 7], t[o + 2] - t[o + 8]);
  return {
    minEdge: Math.min(e0, e1, e2),
    minAngDeg: Math.min(
      angDeg(t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8]),
      angDeg(t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8], t[o], t[o + 1], t[o + 2]),
      angDeg(t[o + 6], t[o + 7], t[o + 8], t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5]),
    ),
    ar: aspect3(t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8]),
  };
}

log('===== S113-OP2 — TARGETED CONFORM SPLIT AT THE LOCATED CREASE CROSSING =====');
log(`ndjson ${NDJ}`);
log(`driver bars: FLOOR_MM ${FLOOR_MM} mm   SHAPE_AR ${SHAPE_AR} (aspect3; equilateral 1.732)`);
log(`scanner: DENSE BOUNDARY SCAN N ${SCAN_N}  gap-find ${GAP_FIND} deg  refine cap ${REF_ITERS}  hMin ${H_MIN} mm`);
log(`crease bar swept ${THRS.join('/')} deg (primary ${THR_PRIMARY});  angular ruler inset swept ${INSETS.join('/')} (primary ${INSET_PRIMARY}), k=${K}, winding`);
log('PRE-REGISTERED KILL LINE: >=2.0x reduction of the DESCENDANTS\' over-45deg normDeg AREA at <=10% whole-mesh triangle increase, T-junctions reported.');
log('');

// ── load the pinned set ─────────────────────────────────────────────────────────────────────────────────
interface Row { e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number; area1: number; area2: number; tri1: number[]; tri2: number[]; z: number }
const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
const meta = JSON.parse(readFileSync(META, 'utf8')) as { meshAreaMm2: number; uniqueFacets: number; targetAreaMm2: number; meshFacets: number; stl: string };
log(`${rows.length} pairs read   (pinned 3282)   ${el()}`);

interface FacetRec { f: number; xyz: number[]; area: number; normHi: number }
const facets = new Map<number, FacetRec>();
let areaMismatch = 0;
for (const r of rows) {
  for (const [f, tri, area] of [[r.f1, r.tri1, r.area1], [r.f2, r.tri2, r.area2]] as Array<[number, number[], number]>) {
    const prev = facets.get(f);
    if (prev === undefined) { facets.set(f, { f, xyz: tri, area, normHi: r.normHi }); continue; }
    prev.normHi = Math.max(prev.normHi, r.normHi);
    if (Math.abs(prev.area - area) > 0) areaMismatch += 1;
  }
}
let classArea = 0;
for (const fr of facets.values()) classArea += fr.area;
const meshArea = meta.meshAreaMm2;
log('── CONTROL 1: the set I am operating on IS the pinned set ──');
log(`  unique facets ${facets.size}  (pinned ${meta.uniqueFacets})   ${facets.size === meta.uniqueFacets ? 'OK' : '*** DRIFT ***'}`);
log(`  class AREA ${classArea.toFixed(4)} mm2 = ${((classArea / meshArea) * 100).toFixed(4)}% of mesh  (pinned ${meta.targetAreaMm2.toFixed(4)} mm2 / 0.1816%)  ${Math.abs(classArea - meta.targetAreaMm2) < 1e-9 ? 'OK' : '*** DRIFT ***'}`);
log(`  repeated-facet area disagreements ${areaMismatch}   (must be 0)`);
const CTRL1 = facets.size === meta.uniqueFacets && Math.abs(classArea - meta.targetAreaMm2) < 1e-9 && areaMismatch === 0;
if (!CTRL1) log('  *** CONTROL 1 FIRED — THE RUN IS VOID. ***');
log('');

// ── the surface, and CONTROL 2 ──────────────────────────────────────────────────────────────────────────
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
if (STL === '') { log('*** no PF_OPS_STL — REFUSING (the operator must run on the mesh, not the dump). ***'); process.exit(4); }
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
let CTRL2 = true;
log('── CONTROL 2: rA is the same surface, and the STL is the same bytes ──');
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`  PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um)`);
  if (nTri !== meta.meshFacets || worst * 1000 > 0.05) { log('  *** PRECOND MISMATCH — params/dims wrong. ***'); CTRL2 = false; }
  let coordBad = 0;
  for (const fr of facets.values()) for (let k = 0; k < 9; k += 1) if (!Object.is(xyz[fr.f * 9 + k], fr.xyz[k])) coordBad += 1;
  log(`  mesh ${nTri} facets (meta ${meta.meshFacets});  ndjson tri coords vs STL: ${coordBad} of ${facets.size * 9} disagree   (must be 0)`);
  if (coordBad !== 0) CTRL2 = false;
}
if (!CTRL2) log('  *** CONTROL 2 FIRED — THE RUN IS VOID. ***');
log('');

// ── THE DENSE BOUNDARY SCANNER (S113-A, verbatim: bracket-tied step, re-scan refinement) ────────────────
const angOf = (p: Float64Array, po: number, r: Float64Array, ro: number): number => {
  let d = p[po] * r[ro] + p[po + 1] * r[ro + 1] + p[po + 2] * r[ro + 2];
  d = d > 1 ? 1 : d < -1 ? -1 : d;
  return (Math.acos(d) * 180) / Math.PI;
};
interface Cross { s: number; turnDeg: number; turnScanDeg: number; brWidthMm: number }
function makeScanner(R: (th: number, z: number) => number): (th0: number, z0: number, th1: number, z1: number, lenMm: number, N: number) => Cross[] {
  const nBuf = new Float64Array(3 * 1030);
  const n0 = new Float64Array(3); const n1 = new Float64Array(3);
  const normalAt = (th: number, z: number, h: number, out: Float64Array, o: number): void => {
    const r0 = R(th, z);
    const hTh = h / Math.max(1e-9, Math.abs(r0));
    const rt = (R(th + hTh, z) - R(th - hTh, z)) / (2 * hTh);
    let zLo = z - h; let zHi = z + h;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * h); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * h); }
    const rz = zHi > zLo ? (R(th, zHi) - R(th, zLo)) / (zHi - zLo) : 0;
    radialNormal(r0, rt, rz, th, out, o);
  };
  return (th0: number, z0: number, th1: number, z1: number, lenMm: number, N: number): Cross[] => {
    const out: Cross[] = [];
    if (!(lenMm > 0)) return out;
    const dth = th1 - th0; const dz = z1 - z0;
    const hScan = Math.max(H_MIN, lenMm / (8 * N));
    for (let k = 0; k <= N; k += 1) normalAt(th0 + dth * (k / N), z0 + dz * (k / N), hScan, nBuf, 3 * k);
    let k0 = -1; let acc = 0;
    const flush = (kEnd: number): void => {
      if (k0 < 0) return;
      let lo = k0 / N; let hi = (kEnd + 1) / N;
      const MM = 16;
      for (let lvl = 0; lvl < REF_ITERS; lvl += 1) {
        const wMm = lenMm * (hi - lo);
        if (!(wMm > 8 * H_MIN) || wMm <= 1e-6) break;
        const h = wMm / (8 * MM);
        for (let k = 0; k <= MM; k += 1) {
          const t = lo + ((hi - lo) * k) / MM;
          normalAt(th0 + dth * t, z0 + dz * t, h, nBuf, 3 * k);
        }
        let bg = -1; let bi = 0;
        for (let k = 0; k < MM; k += 1) { const g = angOf(nBuf, 3 * k, nBuf, 3 * (k + 1)); if (g > bg) { bg = g; bi = k; } }
        const a2 = lo + ((hi - lo) * Math.max(0, bi - 1)) / MM;
        const b2 = lo + ((hi - lo) * Math.min(MM, bi + 2)) / MM;
        lo = a2; hi = b2;
      }
      const w = hi - lo;
      const h = Math.max(H_MIN, (lenMm * w) / 8);
      const tL = lo - w; const tR = hi + w;
      normalAt(th0 + dth * tL, z0 + dz * tL, h, n0, 0);
      normalAt(th0 + dth * tR, z0 + dz * tR, h, n1, 0);
      out.push({ s: 0.5 * (lo + hi), turnDeg: angOf(n0, 0, n1, 0), turnScanDeg: acc, brWidthMm: lenMm * w });
      k0 = -1; acc = 0;
    };
    for (let k = 0; k < N; k += 1) {
      const g = angOf(nBuf, 3 * k, nBuf, 3 * (k + 1));
      if (g > GAP_FIND) { if (k0 < 0) k0 = k; acc += g; } else flush(k - 1);
    }
    flush(N - 1);
    return out;
  };
}

// ── SELF-TEST, two-sided, on closed forms ───────────────────────────────────────────────────────────────
let SELFTEST = true;
{
  log('── SELF-TEST of the dense scanner (two-sided: a crease fixture must find EXACTLY 2, a smooth control 0) ──');
  const R0 = 40; const AMP = 2; const TH0 = 0.3; const W = 0.01;
  const sT = makeScanner((th) => R0 + AMP * Math.max(0, 1 - Math.abs(th - TH0) / W));
  const thA = 0.292; const thB = 0.318; const lenT = R0 * (thB - thA);
  const rawT = sT(thA, 50, thB, 50, lenT, 256);
  const gotT = rawT.filter((c) => c.turnDeg >= 5);
  const sCrest = (TH0 - thA) / (thB - thA); const sClamp = (TH0 + W - thA) / (thB - thA);
  const tCrest = (2 * Math.atan((AMP / W) / (R0 + AMP)) * 180) / Math.PI;
  const tClamp = (Math.atan((AMP / W) / R0) * 180) / Math.PI;
  log(`  TENT expects s ${sCrest.toFixed(5)} turn ${tCrest.toFixed(2)} deg and s ${sClamp.toFixed(5)} turn ${tClamp.toFixed(2)} deg`);
  log(`  TENT got ${rawT.length}: ${rawT.map((c) => `s ${c.s.toFixed(5)} turn ${c.turnDeg.toFixed(3)} br ${c.brWidthMm.toExponential(1)}mm`).join(' | ')}`);
  const okN = gotT.length === 2;
  const okA = okN && Math.abs(gotT[0].s - sCrest) * lenT < 1e-3 && Math.abs(gotT[0].turnDeg - tCrest) < 0.5;
  const okB = okN && Math.abs(gotT[1].s - sClamp) * lenT < 1e-3 && Math.abs(gotT[1].turnDeg - tClamp) < 0.5;
  const sS = makeScanner((th) => R0 + AMP * Math.cos(60 * th));
  const gotS = sS(thA, 50, thB, 50, lenT, 256);
  const overS = gotS.filter((c) => c.turnDeg >= 5);
  log(`  SMOOTH control cos(60 th) (its normal genuinely turns >100 deg here): brackets ${gotS.length}, over the 5 deg bar ${overS.length} (must be 0)`);
  SELFTEST = okN && okA && okB && overS.length === 0;
  log(`  SELF-TEST ${SELFTEST ? 'PASS' : '*** FAILED — THE RUN IS VOID ***'}  (count ${okN}, crest ${okA}, clamp ${okB}, smooth ${overS.length === 0})`);
  log('');
}
const scanEdge = makeScanner(rA);

// ── weld ONLY the target facets' vertices, then find every facet incident to a target EDGE ──────────────
// (a full-mesh weld is not needed: cascade only has to reach the facets sharing a split edge)
const isTarget = new Uint8Array(nTri);
for (const f of facets.keys()) isTarget[f] = 1;
const vKeyBuckets = new Map<number, number[]>();
const canX: number[] = []; const canY: number[] = []; const canZ: number[] = [];
const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
const hashOf = (x: number, y: number, z: number): number => {
  f32[0] = x; f32[1] = y; f32[2] = z;
  return ((u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35)) | 0;
};
const findV = (x: number, y: number, z: number): number => {
  const b = vKeyBuckets.get(hashOf(x, y, z));
  if (b === undefined) return -1;
  for (const c of b) if (canX[c] === x && canY[c] === y && canZ[c] === z) return c;
  return -1;
};
const addV = (x: number, y: number, z: number): number => {
  const h = hashOf(x, y, z);
  const b = vKeyBuckets.get(h);
  if (b !== undefined) { for (const c of b) if (canX[c] === x && canY[c] === y && canZ[c] === z) return c; }
  const id = canX.length; canX.push(x); canY.push(y); canZ.push(z);
  if (b === undefined) vKeyBuckets.set(h, [id]); else b.push(id);
  return id;
};
for (const fr of facets.values()) for (let k = 0; k < 3; k += 1) addV(fr.xyz[k * 3], fr.xyz[k * 3 + 1], fr.xyz[k * 3 + 2]);
log(`target facets ${facets.size} -> ${canX.length} welded vertices  ${el()}`);

const EK = (a: number, b: number): number => (a < b ? a * 2097152 + b : b * 2097152 + a);
// edge -> every (facet, corner) in the WHOLE mesh that uses it
const edgeUse = new Map<number, number[]>();
{
  const vid = new Int32Array(3);
  for (let f = 0; f < nTri; f += 1) {
    let nFound = 0;
    for (let k = 0; k < 3; k += 1) {
      vid[k] = findV(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3 + 2]);
      if (vid[k] >= 0) nFound += 1;
    }
    if (nFound < 2) continue;
    for (let k = 0; k < 3; k += 1) {
      const j = (k + 1) % 3;
      if (vid[k] < 0 || vid[j] < 0) continue;
      const key = EK(vid[k], vid[j]);
      const u = edgeUse.get(key);
      if (u === undefined) edgeUse.set(key, [f * 4 + k]); else u.push(f * 4 + k);
    }
  }
}
log(`edges incident to a target vertex pair: ${edgeUse.size}  ${el()}`);

// the TARGET edges — the ones the operator is allowed to open
interface EdgeRec { key: number; vLo: number; vHi: number; lenMm: number; crosses: Cross[] }
const targetEdges = new Map<number, EdgeRec>();
for (const fr of facets.values()) {
  const t = fr.xyz;
  const v = [0, 1, 2].map((k) => findV(t[k * 3], t[k * 3 + 1], t[k * 3 + 2]));
  for (let k = 0; k < 3; k += 1) {
    const j = (k + 1) % 3;
    const key = EK(v[k], v[j]);
    if (targetEdges.has(key)) continue;
    const lo = Math.min(v[k], v[j]); const hi = Math.max(v[k], v[j]);
    targetEdges.set(key, {
      key, vLo: lo, vHi: hi,
      lenMm: Math.hypot(canX[hi] - canX[lo], canY[hi] - canY[lo], canZ[hi] - canZ[lo]),
      crosses: [],
    });
  }
}
log(`unique target edges ${targetEdges.size}  (6193 facets x 3 corners = ${facets.size * 3} directed)  ${el()}`);

// ── scan every target edge ONCE, in its canonical direction, so both facets get the SAME point ──────────
for (const er of targetEdges.values()) {
  const thL = Math.atan2(canY[er.vLo], canX[er.vLo]);
  const thH = thL + dThRaw(thL, Math.atan2(canY[er.vHi], canX[er.vHi]));
  er.crosses = scanEdge(thL, canZ[er.vLo], thH, canZ[er.vHi], er.lenMm, SCAN_N);
}
log(`dense scan of ${targetEdges.size} canonical edges done  ${el()}`);
{
  const tv: number[] = []; const bw: number[] = [];
  for (const er of targetEdges.values()) for (const c of er.crosses) { tv.push(c.turnDeg); bw.push(c.brWidthMm); }
  log(`  brackets opened ${tv.length};  refined turn deg: ${dist(tv, 3)}`);
  log(`  final bracket width mm: ${dist(bw, 9)}   (8*H_MIN = ${(8 * H_MIN).toExponential(1)}; a collapse would show as 0)`);
  for (const thr of THRS) {
    const n = tv.filter((x) => x >= thr).length;
    log(`  crossings surviving the ${thr} deg bar: ${n}`);
  }
}
log('');

// ── SPLIT POINTS. Snap onto the analytic surface (that is the crease) ───────────────────────────────────
//
// THREE ARMS, BUILT FROM THE SAME ACCEPTED CROSSING SET so they are COST-MATCHED to the triangle:
//   'crease'  the operator: the located crossing, snapped onto rA.
//   'mid'     the PLACEBO: the same edges, the same NUMBER of points per edge, evenly spaced (midpoint for
//             one point), snapped onto rA. Same topology, same triangle cost, WRONG LOCATION.
//   'nosnap'  the operator's location but left ON THE CHORD — isolates the topology change from the
//             position change, because the snap alone moves a vertex up to tens of um onto the surface.
// ⚠ The placebo MUST be built from the ACCEPTED set, not re-derived: my first version re-ran the
// vertex-snap filter against s=0.5, which accepted 6,368 points where the operator accepted 670 — a
// "control" running at 9.5x the triangle cost, i.e. no control at all.
type Arm = 'crease' | 'mid' | 'nosnap';
/** `s` is CANONICAL (measured vLo -> vHi); `sLocal` is filled in per-facet, along that facet's corner direction. */
interface SplitPt { s: number; sLocal: number; x: number; y: number; z: number; cx: number; cy: number; cz: number; turnDeg: number; snapMm: number }
interface Attrition { brackets: number; overBar: number; nearVertex: number; dup: number; kept: number; toVtxMm: number[] }
const attrition: Attrition = { brackets: 0, overBar: 0, nearVertex: 0, dup: 0, kept: 0, toVtxMm: [] };
function buildSplits(thr: number, arm: Arm, att: Attrition | null): Map<number, SplitPt[]> {
  const out = new Map<number, SplitPt[]>();
  for (const er of targetEdges.values()) {
    const accepted: number[] = [];                                   // accepted crossing parameters
    const turns: number[] = [];
    const thL = Math.atan2(canY[er.vLo], canX[er.vLo]);
    const thH = thL + dThRaw(thL, Math.atan2(canY[er.vHi], canX[er.vHi]));
    for (const c of er.crosses) {
      if (att !== null) att.brackets += 1;
      if (!(c.turnDeg >= thr)) continue;
      if (att !== null) { att.overBar += 1; att.toVtxMm.push(Math.min(c.s, 1 - c.s) * er.lenMm); }
      if (c.s * er.lenMm < FLOOR_MM || (1 - c.s) * er.lenMm < FLOOR_MM) { if (att !== null) att.nearVertex += 1; continue; }
      if (accepted.some((p) => Math.abs(p - c.s) * er.lenMm < FLOOR_MM)) { if (att !== null) att.dup += 1; continue; }
      accepted.push(c.s); turns.push(c.turnDeg);
      if (att !== null) att.kept += 1;
    }
    if (accepted.length === 0) continue;
    const ord = accepted.map((_v, i) => i).sort((a, b) => accepted[a] - accepted[b]);
    const m = accepted.length;
    const keep: SplitPt[] = [];
    for (let i = 0; i < m; i += 1) {
      const sUse = arm === 'mid' ? (i + 1) / (m + 1) : accepted[ord[i]];
      const th = thL + sUse * (thH - thL);
      const zz = canZ[er.vLo] + sUse * (canZ[er.vHi] - canZ[er.vLo]);
      const cx = canX[er.vLo] + sUse * (canX[er.vHi] - canX[er.vLo]);
      const cy = canY[er.vLo] + sUse * (canY[er.vHi] - canY[er.vLo]);
      const cz = zz;
      const r = rA(th, zz);
      const px = r * Math.cos(th); const py = r * Math.sin(th);
      const snapMm = Math.hypot(px - cx, py - cy, 0);
      keep.push(arm === 'nosnap'
        ? { s: sUse, sLocal: sUse, x: cx, y: cy, z: cz, cx, cy, cz, turnDeg: turns[ord[i]], snapMm: 0 }
        : { s: sUse, sLocal: sUse, x: px, y: py, z: zz, cx, cy, cz, turnDeg: turns[ord[i]], snapMm });
    }
    out.set(er.key, keep);
  }
  return out;
}

// ── RETRIANGULATION: best-ear clipping of the boundary polygon (triangle + inserted edge points) ────────
//
// ⚠ THE TOPOLOGY IS DECIDED COMBINATORIALLY, IN A REFERENCE EQUILATERAL TRIANGLE; ONLY THE COORDINATES
// COME FROM THE REAL FACET. Non-manifoldness is a COMBINATORIAL property: if the ear clipping runs on a
// polygon that is convex BY CONSTRUCTION, every diagonal it emits is shared by exactly 2 children and
// every boundary sub-edge by 1 child plus the neighbour's matching child, so the mesh cannot leave the
// manifold — whatever the parent's geometry.
//
// TWO VERSIONS OF THIS FUNCTION WERE WRONG BEFORE THIS ONE, AND MY OWN CONTROLS CAUGHT BOTH:
//   v1 projected the SNAPPED points. They bow up to 46 um off the chord, which made the polygon
//      non-convex 23 times; the clipper fell back to a fan and emitted overlapping triangles.
//   v2 projected the CHORD points using the polygon's own Newell normal. That is fine for a healthy
//      parent, but a CASCADE parent is an arbitrary mesh facet and some of them are needles whose
//      Newell normal is numerical noise; the 2-D frame was then garbage and the "convex" ears were
//      arbitrary. Signature: *** non-manifold edges 0 -> 64 *** on the whole-mesh census, and a 180.00
//      deg dihedral appearing where the max had been 179.95.
// The quality-driven ear choice still ranks candidates by the REAL 3-D min angle — that only selects
// WHICH valid triangulation is emitted, never whether it is valid.
//
//   v3 (this one, after the census STILL read non-manifold 0 -> 50): a convex ear is NOT enough. On a
//      facet split on ONE side, the polygon is A,P,B,C and the ear at C is convex and has the BEST 3-D
//      min angle — it is the parent triangle itself. Clipping it lays a diagonal along A-B, i.e. ALONG
//      THE SPLIT SIDE, swallowing P, and leaves the degenerate sliver A,P,B. Both facets sharing that
//      side do it, so the side ends up traversed by 4 children => NON-MANIFOLD. The attribution printed
//      exactly 2 parents per bad edge, which is that mechanism's signature.
//      THE RULE: label every polygon vertex with the original side(s) it lies on (a corner lies on two).
//      An ear (a,b,c) is legal only if a and c share NO side label — a diagonal between two vertices of
//      the same side is collinear with it and must never be drawn. That also subsumes the collinear
//      test. A legal ear always exists for a triangle-with-points-on-its-sides, so the fallback is dead
//      code kept as an assertion.
let fanFallbacks = 0;
const REF_X = [0, 1, 0.5]; const REF_Y = [0, 0, 0.8660254037844386];
function retriangulate(tri: ArrayLike<number>, o: number, ptsPerCorner: SplitPt[][]): number[][] {
  const P: number[][] = []; const X: number[] = []; const Y: number[] = []; const SIDE: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const j = (k + 1) % 3;
    P.push([tri[o + k * 3], tri[o + k * 3 + 1], tri[o + k * 3 + 2]]);
    X.push(REF_X[k]); Y.push(REF_Y[k]);
    SIDE.push((1 << k) | (1 << ((k + 2) % 3)));                     // a corner lies on TWO sides
    for (const p of ptsPerCorner[k]) {
      P.push([p.x, p.y, p.z]);
      X.push(REF_X[k] + p.sLocal * (REF_X[j] - REF_X[k]));
      Y.push(REF_Y[k] + p.sLocal * (REF_Y[j] - REF_Y[k]));
      SIDE.push(1 << k);
    }
  }
  const n = P.length;
  if (n === 3) return [[...P[0], ...P[1], ...P[2]]];
  const idx = P.map((_p, i) => i);
  const out: number[][] = [];
  while (idx.length > 3) {
    let best = -1; let bestQ = -Infinity; let bestCross = -Infinity; let bestCrossI = -1;
    for (let i = 0; i < idx.length; i += 1) {
      const a = idx[(i - 1 + idx.length) % idx.length]; const b = idx[i]; const c = idx[(i + 1) % idx.length];
      const cr = (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
      if ((SIDE[a] & SIDE[c]) !== 0) continue;                       // the diagonal would lie ALONG a side
      if (cr > bestCross) { bestCross = cr; bestCrossI = i; }
      if (!(cr > 0)) continue;
      const t = [...P[a], ...P[b], ...P[c]];
      const qy = triMetrics(t).minAngDeg;
      if (qy > bestQ) { bestQ = qy; best = i; }
    }
    if (best < 0) { best = bestCrossI; fanFallbacks += 1; }
    const a = idx[(best - 1 + idx.length) % idx.length]; const b = idx[best]; const c = idx[(best + 1) % idx.length];
    out.push([...P[a], ...P[b], ...P[c]]);
    idx.splice(best, 1);
  }
  out.push([...P[idx[0]], ...P[idx[1]], ...P[idx[2]]]);
  return out;
}

// ── APPLY: build the whole new mesh, cascading into every facet incident to a split edge ────────────────
interface Applied {
  newXyz: Float64Array; newN: number; parentOf: Int32Array;
  splitFacets: Set<number>; cascadeOnly: Set<number>; tJunctionsNoCascade: number; tJunctionAreaNoCascade: number;
  childrenOf: Map<number, number[][]>; nSplitPts: number; snap: number[];
}
function applySplits(splits: Map<number, SplitPt[]>): Applied {
  // which facets are touched
  const touched = new Map<number, SplitPt[][]>();     // facet -> per-corner point list (in corner direction)
  const vid = new Int32Array(3);
  let tJ = 0;
  const tJFacets = new Set<number>();
  const snap: number[] = [];
  for (const [key, pts] of splits) {
    for (const p of pts) snap.push(p.snapMm);
    const users = edgeUse.get(key) ?? [];
    let nTargetUsers = 0;
    for (const u of users) if (isTarget[u >> 2] === 1) nTargetUsers += 1;
    for (const u of users) {
      const f = u >> 2; const corner = u & 3;
      let rec = touched.get(f);
      if (rec === undefined) { rec = [[], [], []]; touched.set(f, rec); }
      // direction: corner k -> k+1 vs canonical vLo -> vHi
      for (let k = 0; k < 3; k += 1) vid[k] = findV(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3 + 2]);
      const er = targetEdges.get(key) as EdgeRec;
      const forward = vid[corner] === er.vLo;
      // per-facet COPIES: `sLocal` runs along THIS facet's corner direction, and the two facets sharing
      // the edge must receive the points in opposite order but at identical 3-D coordinates.
      rec[corner] = (forward ? pts : pts.slice().reverse()).map((p) => ({ ...p, sLocal: forward ? p.s : 1 - p.s }));
    }
    // T-junctions (HANGING NODES) that WOULD be created if the operator did not cascade: one per inserted
    // point per incident facet that is NOT itself split. Area is over the DISTINCT stranded neighbours.
    for (const u of users) if (isTarget[u >> 2] === 0) { tJ += pts.length; tJFacets.add(u >> 2); }
    if (nTargetUsers === 0) { /* an edge nobody in the class owns — impossible by construction */ }
  }
  const childrenOf = new Map<number, number[][]>();
  let extra = 0;
  for (const [f, per] of touched) {
    const kids = retriangulate(xyz, f * 9, per);
    childrenOf.set(f, kids);
    extra += kids.length - 1;
  }
  const newN = nTri + extra;
  const newXyz = new Float64Array(newN * 9);
  const parentOf = new Int32Array(newN);
  let w = 0;
  for (let f = 0; f < nTri; f += 1) {
    const kids = childrenOf.get(f);
    if (kids === undefined) {
      for (let k = 0; k < 9; k += 1) newXyz[w * 9 + k] = xyz[f * 9 + k];
      parentOf[w] = f; w += 1;
    } else {
      for (const kd of kids) {
        for (let k = 0; k < 9; k += 1) newXyz[w * 9 + k] = kd[k];
        parentOf[w] = f; w += 1;
      }
    }
  }
  const splitFacets = new Set([...touched.keys()].filter((f) => isTarget[f] === 1));
  const cascadeOnly = new Set([...touched.keys()].filter((f) => isTarget[f] === 0));
  let nPts = 0; for (const p of splits.values()) nPts += p.length;
  let tJArea = 0; for (const f of tJFacets) tJArea += triArea(xyz, f * 9);
  return { newXyz, newN: w, parentOf, splitFacets, cascadeOnly, tJunctionsNoCascade: tJ, tJunctionAreaNoCascade: tJArea, childrenOf, nSplitPts: nPts, snap };
}

// ── the ANGULAR ruler ───────────────────────────────────────────────────────────────────────────────────
const nsKink: NormalSampler = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);
function orientOf(t: ArrayLike<number>, o: number, inset: number): { normDeg: number; spreadDeg: number } {
  const a = Math.atan2(t[o + 1], t[o]);
  const b = a + dThRaw(a, Math.atan2(t[o + 4], t[o + 3]));
  const c = a + dThRaw(a, Math.atan2(t[o + 7], t[o + 6]));
  const r = orientOfFacet(nsKink, t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8], a, b, c, { k: K, inset, scratch });
  return { normDeg: r.normDeg, spreadDeg: (r.spreadRad * 180) / Math.PI };
}
interface Agg { n: number; area: number; max: number; totN: number; totArea: number; wMean: number }
const emptyAgg = (): Agg => ({ n: 0, area: 0, max: 0, totN: 0, totArea: 0, wMean: 0 });
const bumpAgg = (g: Agg, deg: number, area: number, bar: number): void => {
  g.totN += 1; g.totArea += area; g.wMean += area * (Number.isFinite(deg) ? deg : 0);
  if (Number.isFinite(deg) && deg > bar) { g.n += 1; g.area += area; }
  if (Number.isFinite(deg) && deg > g.max) g.max = deg;
};
const fmtAgg = (g: Agg, bar: number): string => `over ${bar}deg: ${g.n} facets  ${g.area.toFixed(4)} mm2 = ${((g.area / g.totArea) * 100).toFixed(2)}% of the region (${((g.area / meshArea) * 100).toFixed(4)}% of mesh)   MAX ${g.max.toFixed(2)} deg   region ${g.totN} facets ${g.totArea.toFixed(4)} mm2  area-wtd mean ${(g.wMean / g.totArea).toFixed(2)} deg`;

// ═══ RUN THE OPERATOR at the primary bar ════════════════════════════════════════════════════════════════
log('════ THE OPERATOR — crease bar ' + THR_PRIMARY + ' deg, N ' + SCAN_N + ' ════');
const splits = buildSplits(THR_PRIMARY, 'crease', attrition);
const A = applySplits(splits);
log('  CROSSING ATTRITION (where the operator loses its reach — read this before any ratio):');
log(`    brackets opened by the scan            ${attrition.brackets}`);
log(`    ... over the ${THR_PRIMARY} deg crease bar             ${attrition.overBar}`);
log(`    ... REJECTED, within FLOOR_MM ${FLOOR_MM}mm of a VERTEX  ${attrition.nearVertex}  (${((attrition.nearVertex / Math.max(1, attrition.overBar)) * 100).toFixed(1)}% — the crease already passes through the vertex; there is nothing to split)`);
log(`    ... REJECTED as a duplicate            ${attrition.dup}`);
log(`    ... INSERTED                           ${attrition.kept}`);
log(`    DISTANCE FROM THE CROSSING TO THE NEAREST EDGE ENDPOINT, mm (the whole footprint, not the 1.5um test):`);
log(`      ${dist(attrition.toVtxMm, 6)}`);
{
  const ladder = [0.0005, 0.0015, 0.005, 0.015, 0.05];
  const tot = attrition.toVtxMm.length;
  for (const L of ladder) log(`      within ${(L * 1000).toFixed(1).padStart(5)} um of a vertex: ${String(attrition.toVtxMm.filter((x) => x < L).length).padStart(5)} = ${((attrition.toVtxMm.filter((x) => x < L).length / Math.max(1, tot)) * 100).toFixed(1)}%`);
}
log(`  split points inserted ${A.nSplitPts} on ${splits.size} distinct mesh edges`);
log(`  snap distance (chord -> analytic crease), mm: ${dist(A.snap, 6)}`);
log(`  facets retriangulated: ${A.splitFacets.size} IN the target class + ${A.cascadeOnly.size} CASCADE-ONLY (outside it)`);
{
  let sa = 0; for (const f of A.splitFacets) sa += (facets.get(f) as FacetRec).area;
  let ca = 0; for (const f of A.cascadeOnly) ca += triArea(xyz, f * 9);
  log(`    class facets split:  ${A.splitFacets.size} of ${facets.size} = ${((A.splitFacets.size / facets.size) * 100).toFixed(2)}% by count;  ${sa.toFixed(4)} mm2 = ${((sa / classArea) * 100).toFixed(2)}% of the class AREA`);
  log(`    cascade-only facets: ${A.cascadeOnly.size}  ${ca.toFixed(4)} mm2 = ${((ca / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`    class facets NOT split (no crossing over the bar): ${facets.size - A.splitFacets.size}  ${(classArea - sa).toFixed(4)} mm2 = ${(((classArea - sa) / classArea) * 100).toFixed(2)}% of the class AREA`);
}
log('');
log('── T-JUNCTIONS ──');
log(`  T-junctions the operator WOULD create if it did not cascade: ${A.tJunctionsNoCascade}  (${A.tJunctionAreaNoCascade.toFixed(4)} mm2 of unsplit neighbour)`);
log(`  T-junctions LEFT by this operator: 0 by construction (every facet incident to a split edge is retriangulated) — verified below by the whole-mesh boundary-edge census`);
log(`  ear-clip fan fallbacks (a non-convex polygon; must be 0): ${fanFallbacks}`);
log('');
log('── TRIANGLE COST ──');
log(`  before ${nTri}   after ${A.newN}   +${A.newN - nTri} = +${(((A.newN - nTri) / nTri) * 100).toFixed(4)}% of the WHOLE mesh   (kill line <= 10%)`);
log(`  children per split facet: ${dist([...A.childrenOf.values()].map((k) => k.length), 2)}`);
log('');

// ── PRIMARY MEASUREMENT: the angular ruler, before vs after, on the DESCENDANTS of the target set ───────
log('── PRIMARY: ANGULAR RULER (orientOfFacet normDeg, k=8, winding), target set BEFORE vs its DESCENDANTS AFTER ──');
const beforeAgg = new Map<number, Agg>(); const afterAgg = new Map<number, Agg>();
const beforeDeg = new Map<number, number[]>(); const afterDeg = new Map<number, number[]>();
for (const inset of INSETS) {
  const gb = emptyAgg(); const ga = emptyAgg();
  const db: number[] = []; const da: number[] = [];
  for (const fr of facets.values()) {
    const o = orientOf(fr.xyz, 0, inset);
    bumpAgg(gb, o.normDeg, fr.area, BAR_DEG); db.push(o.normDeg);
    const kids = A.childrenOf.get(fr.f);
    if (kids === undefined) { bumpAgg(ga, o.normDeg, fr.area, BAR_DEG); da.push(o.normDeg); continue; }
    for (const kd of kids) {
      const ok = orientOf(kd, 0, inset);
      bumpAgg(ga, ok.normDeg, triArea(kd), BAR_DEG); da.push(ok.normDeg);
    }
  }
  beforeAgg.set(inset, gb); afterAgg.set(inset, ga); beforeDeg.set(inset, db); afterDeg.set(inset, da);
  log(`  inset ${inset}`);
  log(`    BEFORE ${fmtAgg(gb, BAR_DEG)}`);
  log(`    AFTER  ${fmtAgg(ga, BAR_DEG)}`);
  const rA_ = gb.area / Math.max(1e-12, ga.area);
  log(`    ==> AREA ratio ${rA_.toFixed(3)}x   COUNT ratio ${(gb.n / Math.max(1, ga.n)).toFixed(3)}x   MAX ${gb.max.toFixed(2)} -> ${ga.max.toFixed(2)} deg (${(gb.max / Math.max(1e-9, ga.max)).toFixed(3)}x)`);
  log(`    ${el()}`);
}
log('');

// ── THE SAME RULER RESTRICTED TO THE FACETS THE OPERATOR ACTUALLY TOUCHED ──────────────────────────────
// Diluting a 10%-of-area intervention over the whole class hides both its benefit and its harm. This is
// the operator's effect ON ITS OWN REACH; the whole-class number above is what it is worth to the mesh.
log('── PRIMARY, RESTRICTED TO THE SPLIT CLASS FACETS (the operator\'s own reach), inset ' + INSET_PRIMARY + ' ──');
{
  const gb = emptyAgg(); const ga = emptyAgg();
  for (const f of A.splitFacets) {
    const fr = facets.get(f) as FacetRec;
    bumpAgg(gb, orientOf(fr.xyz, 0, INSET_PRIMARY).normDeg, fr.area, BAR_DEG);
    for (const kd of A.childrenOf.get(f) as number[][]) bumpAgg(ga, orientOf(kd, 0, INSET_PRIMARY).normDeg, triArea(kd), BAR_DEG);
  }
  log(`  BEFORE ${fmtAgg(gb, BAR_DEG)}`);
  log(`  AFTER  ${fmtAgg(ga, BAR_DEG)}`);
  log(`  ==> AREA ratio ${(gb.area / Math.max(1e-12, ga.area)).toFixed(3)}x   COUNT ratio ${(gb.n / Math.max(1, ga.n)).toFixed(3)}x   MAX ${gb.max.toFixed(2)} -> ${ga.max.toFixed(2)} deg`);
}
log('');

// ── the STRADDLE property itself: drop = normDeg(0.05)/normDeg(0) ──────────────────────────────────────
log('── DID THE STRADDLE GO AWAY? drop = normDeg(inset 0.05) / normDeg(inset 0);  straddling := drop>=0.25 AND normDeg(0.05)>10 ──');
{
  let bn = 0; let ba = 0; let an = 0; let aa = 0; let bt = 0; let at = 0;
  for (const fr of facets.values()) {
    const hi = orientOf(fr.xyz, 0, 0.05).normDeg; const lo = orientOf(fr.xyz, 0, 0).normDeg;
    const dr = lo > 1e-9 ? hi / lo : 1;
    bt += fr.area;
    if (dr >= 0.25 && hi > 10) { bn += 1; ba += fr.area; }
    const kids = A.childrenOf.get(fr.f);
    const list = kids === undefined ? [fr.xyz] : kids;
    for (const kd of list) {
      const h2 = orientOf(kd, 0, 0.05).normDeg; const l2 = orientOf(kd, 0, 0).normDeg;
      const d2 = l2 > 1e-9 ? h2 / l2 : 1;
      const ar2 = triArea(kd); at += ar2;
      if (d2 >= 0.25 && h2 > 10) { an += 1; aa += ar2; }
    }
  }
  log(`  BEFORE straddling ${bn} facets  ${ba.toFixed(4)} mm2 = ${((ba / bt) * 100).toFixed(2)}% of the class area`);
  log(`  AFTER  straddling ${an} facets  ${aa.toFixed(4)} mm2 = ${((aa / at) * 100).toFixed(2)}% of the descendant area`);
  log(`  ==> straddling AREA ratio ${(ba / Math.max(1e-12, aa)).toFixed(3)}x   COUNT ratio ${(bn / Math.max(1, an)).toFixed(3)}x   ${el()}`);
}
log('');

// ── CASCADE NEIGHBOURS: a split of a GOOD facet can make it worse. Measure it. ──────────────────────────
log('── CASCADE COLLATERAL: the facets split only because a neighbour was (they are OUTSIDE the class) ──');
{
  const gb = emptyAgg(); const ga = emptyAgg();
  for (const f of A.cascadeOnly) {
    const o = orientOf(xyz, f * 9, INSET_PRIMARY);
    bumpAgg(gb, o.normDeg, triArea(xyz, f * 9), BAR_DEG);
    for (const kd of A.childrenOf.get(f) as number[][]) {
      const ok = orientOf(kd, 0, INSET_PRIMARY);
      bumpAgg(ga, ok.normDeg, triArea(kd), BAR_DEG);
    }
  }
  log(`  BEFORE ${fmtAgg(gb, BAR_DEG)}`);
  log(`  AFTER  ${fmtAgg(ga, BAR_DEG)}`);
  log(`  ==> collateral AREA ${gb.area.toFixed(4)} -> ${ga.area.toFixed(4)} mm2 (${ga.area > gb.area ? 'WORSE' : 'better'});  MAX ${gb.max.toFixed(2)} -> ${ga.max.toFixed(2)} deg`);
}
log('');

// ── CHILD QUALITY ───────────────────────────────────────────────────────────────────────────────────────
log('── CHILD QUALITY (a split that fixes the angle by manufacturing slivers has fixed nothing) ──');
{
  const pm: number[] = []; const pa: number[] = []; const pe: number[] = [];
  const cm: number[] = []; const ca: number[] = []; const ce: number[] = [];
  let arOver = 0; let arOverArea = 0; let edgeUnder = 0; let edgeUnderArea = 0;
  for (const [f, kids] of A.childrenOf) {
    const mp = triMetrics(xyz, f * 9);
    pm.push(mp.minAngDeg); pa.push(mp.ar); pe.push(mp.minEdge);
    for (const kd of kids) {
      const mc = triMetrics(kd);
      cm.push(mc.minAngDeg); ca.push(mc.ar); ce.push(mc.minEdge);
      if (!(mc.ar <= SHAPE_AR)) { arOver += 1; arOverArea += triArea(kd); }
      if (!(mc.minEdge >= FLOOR_MM)) { edgeUnder += 1; edgeUnderArea += triArea(kd); }
    }
  }
  log(`  PARENTS  minAngle deg ${dist(pm, 3)}`);
  log(`  CHILDREN minAngle deg ${dist(cm, 3)}`);
  log(`  PARENTS  aspect3      ${dist(pa, 3)}   (equilateral 1.732, driver bar ${SHAPE_AR})`);
  log(`  CHILDREN aspect3      ${dist(ca, 3)}`);
  log(`  PARENTS  minEdge mm   ${dist(pe, 6)}   (driver floor ${FLOOR_MM})`);
  log(`  CHILDREN minEdge mm   ${dist(ce, 6)}`);
  log(`  children OVER the driver's aspect bar ${SHAPE_AR}: ${arOver}  ${arOverArea.toFixed(5)} mm2`);
  log(`  children UNDER the driver's edge floor ${FLOOR_MM} mm: ${edgeUnder}  ${edgeUnderArea.toFixed(5)} mm2`);
}
log('');

// ── SECONDARY: the DIHEDRAL ruler, whole mesh before and after ─────────────────────────────────────────
let dihBefore: ReturnType<typeof facetDihedrals> | null = null;
let dihAfter: ReturnType<typeof facetDihedrals> | null = null;
if (FULLDIH) {
  log('── SECONDARY: DIHEDRAL RULER (facetDihedrals), whole mesh before and after ──');
  const idBefore = new Uint32Array(nTri * 3); for (let i = 0; i < idBefore.length; i += 1) idBefore[i] = i;
  dihBefore = facetDihedrals(xyz, idBefore);
  log(`  BEFORE  interior ${dihBefore.interiorEdges}  boundary ${dihBefore.boundaryEdges}  non-manifold ${dihBefore.nonManifoldEdges}  inconsistent-winding ${dihBefore.inconsistentEdges}   ${el()}`);
  const idAfter = new Uint32Array(A.newN * 3); for (let i = 0; i < idAfter.length; i += 1) idAfter[i] = i;
  dihAfter = facetDihedrals(A.newXyz.subarray(0, A.newN * 9), idAfter);
  log(`  AFTER   interior ${dihAfter.interiorEdges}  boundary ${dihAfter.boundaryEdges}  non-manifold ${dihAfter.nonManifoldEdges}  inconsistent-winding ${dihAfter.inconsistentEdges}   ${el()}`);
  const dB = dihAfter.boundaryEdges - dihBefore.boundaryEdges;
  log(`  ==> boundary-edge DELTA ${dB >= 0 ? '+' : ''}${dB}   (a T-junction adds 3; ${dB === 0 ? 'ZERO => the cascade closed every one' : `*** ${(dB / 3).toFixed(1)} T-JUNCTIONS LEFT ***`})`);
  const dN = dihAfter.nonManifoldEdges - dihBefore.nonManifoldEdges;
  log(`  ==> non-manifold DELTA ${dN >= 0 ? '+' : ''}${dN}   (must be 0)`);
  if (dN !== 0) {
    // ATTRIBUTION, so a topological failure can never again be a bare number. Rebuild the after-mesh edge
    // census locally and name the parents of every facet on an over-used edge.
    const seen = new Map<string, number[]>();
    const key3 = (i: number, k: number): string => {
      const j = (k + 1) % 3;
      const a = `${A.newXyz[i * 9 + k * 3]},${A.newXyz[i * 9 + k * 3 + 1]},${A.newXyz[i * 9 + k * 3 + 2]}`;
      const b = `${A.newXyz[i * 9 + j * 3]},${A.newXyz[i * 9 + j * 3 + 1]},${A.newXyz[i * 9 + j * 3 + 2]}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    for (let i = 0; i < A.newN; i += 1) {
      if (A.childrenOf.get(A.parentOf[i]) === undefined) continue;                  // only the modified region
      for (let k = 0; k < 3; k += 1) {
        const kk = key3(i, k);
        const u = seen.get(kk); if (u === undefined) seen.set(kk, [i]); else u.push(i);
      }
    }
    let bad = 0; const badParents = new Set<number>();
    for (const [, us] of seen) if (us.length > 2) { bad += 1; for (const i of us) badParents.add(A.parentOf[i]); }
    let nSplitP = 0; let nCascP = 0;
    for (const p of badParents) { if (isTarget[p] === 1) nSplitP += 1; else nCascP += 1; }
    log(`  *** ATTRIBUTION: ${bad} over-used edges inside the modified region, from ${badParents.size} parents (${nSplitP} in-class, ${nCascP} cascade) ***`);
  }
  // whole-mesh over-bar edge census
  const overB = { n: 0, max: 0 }; const overA = { n: 0, max: 0 };
  const barRad = (BAR_DEG * Math.PI) / 180;
  for (let e = 0; e < dihBefore.edgeAngRad.length; e += 1) if (dihBefore.edgeAngRad[e] > barRad) { overB.n += 1; overB.max = Math.max(overB.max, dihBefore.edgeAngRad[e]); }
  for (let e = 0; e < dihAfter.edgeAngRad.length; e += 1) if (dihAfter.edgeAngRad[e] > barRad) { overA.n += 1; overA.max = Math.max(overA.max, dihAfter.edgeAngRad[e]); }
  log(`  WHOLE MESH edges over ${BAR_DEG} deg: ${overB.n} -> ${overA.n}  (max ${((overB.max * 180) / Math.PI).toFixed(2)} -> ${((overA.max * 180) / Math.PI).toFixed(2)} deg)`);
  // descendants only
  const isDesc = new Uint8Array(A.newN);
  for (let i = 0; i < A.newN; i += 1) if (isTarget[A.parentOf[i]] === 1) isDesc[i] = 1;
  const facetOver = new Uint8Array(A.newN);
  for (let e = 0; e < dihAfter.edgeAngRad.length; e += 1) {
    if (!(dihAfter.edgeAngRad[e] > barRad)) continue;
    facetOver[dihAfter.edgeF1[e]] = 1; facetOver[dihAfter.edgeF2[e]] = 1;
  }
  let aN = 0; let aA = 0; let aT = 0; let aMax = 0;
  for (let i = 0; i < A.newN; i += 1) {
    if (isDesc[i] === 0) continue;
    aT += dihAfter.areaMm2[i];
    if (facetOver[i] === 1) { aN += 1; aA += dihAfter.areaMm2[i]; }
    const dd = dihAfter.perFacetMaxRad[i]; if (dd > aMax) aMax = dd;
  }
  let bMax = 0; for (const r of rows) bMax = Math.max(bMax, r.measDeg);
  log(`  DESCENDANTS of the class, facets adjacent to an edge over ${BAR_DEG} deg:`);
  log(`    BEFORE ${facets.size} facets  ${classArea.toFixed(4)} mm2 (100% by construction)  MAX dihedral ${bMax.toFixed(2)} deg`);
  log(`    AFTER  ${aN} facets  ${aA.toFixed(4)} mm2 = ${((aA / aT) * 100).toFixed(2)}% of the ${aT.toFixed(4)} mm2 descendant area   MAX dihedral ${((aMax * 180) / Math.PI).toFixed(2)} deg`);
  log(`    ==> dihedral over-bar AREA ratio ${(classArea / Math.max(1e-12, aA)).toFixed(3)}x  (SECONDARY, not the kill line — a conformed crease legitimately keeps its dihedral)`);
  log('');
}

// ── CONTROL ARMS: cost-matched placebo (midpoint) and no-snap (topology only) ──────────────────────────
const armAgg = (AA: Applied, restrictTo: Set<number> | null): { gb: Agg; ga: Agg } => {
  const gb = emptyAgg(); const ga = emptyAgg();
  for (const fr of facets.values()) {
    if (restrictTo !== null && !restrictTo.has(fr.f)) continue;
    const o = orientOf(fr.xyz, 0, INSET_PRIMARY);
    bumpAgg(gb, o.normDeg, fr.area, BAR_DEG);
    const kids = AA.childrenOf.get(fr.f);
    if (kids === undefined) { bumpAgg(ga, o.normDeg, fr.area, BAR_DEG); continue; }
    for (const kd of kids) bumpAgg(ga, orientOf(kd, 0, INSET_PRIMARY).normDeg, triArea(kd), BAR_DEG);
  }
  return { gb, ga };
};
log('── CONTROL ARMS, COST-MATCHED (same edges, same number of points, different placement) ──');
const opA = afterAgg.get(INSET_PRIMARY) as Agg;
const opB = beforeAgg.get(INSET_PRIMARY) as Agg;
for (const arm of ['mid', 'nosnap'] as Arm[]) {
  const sp = buildSplits(THR_PRIMARY, arm, null);
  const AA = applySplits(sp);
  const { ga } = armAgg(AA, null);
  const { gb: rb, ga: rg } = armAgg(AA, A.splitFacets);
  log(`  ARM ${arm === 'mid' ? 'PLACEBO(midpoint)' : 'NO-SNAP(on the chord)'}: points ${AA.nSplitPts} (operator ${A.nSplitPts}), triangles +${AA.newN - nTri} (operator +${A.newN - nTri})  ${AA.nSplitPts === A.nSplitPts && AA.newN === A.newN ? 'COST-MATCHED' : '*** NOT COST-MATCHED ***'}`);
  log(`    whole class  AFTER ${fmtAgg(ga, BAR_DEG)}`);
  log(`      ==> ratio ${(opB.area / Math.max(1e-12, ga.area)).toFixed(3)}x   vs OPERATOR ${(opB.area / Math.max(1e-12, opA.area)).toFixed(3)}x;  operator-over-arm advantage ${(ga.area / Math.max(1e-12, opA.area)).toFixed(3)}x  (1.00 = the crease location bought nothing)`);
  log(`    split facets only: BEFORE ${rb.area.toFixed(4)} -> ARM ${rg.area.toFixed(4)} mm2 over ${BAR_DEG}deg;  MAX ${rb.max.toFixed(2)} -> ${rg.max.toFixed(2)} deg`);
}
log(`  ${el()}`);
log('');

// ── the crease-bar sensitivity sweep ───────────────────────────────────────────────────────────────────
log('── SENSITIVITY: the crease bar (5 / 15 / 45 deg). Same operator, same measurement, different bar ──');
for (const thr of THRS) {
  const att: Attrition = { brackets: 0, overBar: 0, nearVertex: 0, dup: 0, kept: 0, toVtxMm: [] };
  const sp = thr === THR_PRIMARY ? splits : buildSplits(thr, 'crease', att);
  const AA = thr === THR_PRIMARY ? A : applySplits(sp);
  if (thr === THR_PRIMARY) { att.overBar = attrition.overBar; att.nearVertex = attrition.nearVertex; att.kept = attrition.kept; }
  const { gb, ga } = armAgg(AA, null);
  log(`  bar ${thr} deg: over-bar crossings ${att.overBar} -> vertex-rejected ${att.nearVertex} -> inserted ${att.kept};  class facets split ${AA.splitFacets.size}  cascade ${AA.cascadeOnly.size}  tris +${AA.newN - nTri} (+${(((AA.newN - nTri) / nTri) * 100).toFixed(3)}%)  ` +
      `over-45 AREA ${gb.area.toFixed(4)} -> ${ga.area.toFixed(4)} mm2 (${(gb.area / Math.max(1e-12, ga.area)).toFixed(3)}x)  MAX ${gb.max.toFixed(2)} -> ${ga.max.toFixed(2)} deg  T-junc-if-no-cascade ${AA.tJunctionsNoCascade}`);
}
log(`  ${el()}`);
log('');

// ── cross-tab against S113-A's legality classes, if present ────────────────────────────────────────────
if (existsSync(LEG)) {
  log('── CROSS-TAB against S113-A\'s legality classes (same pinned facets) ──');
  const cls = new Map<number, string>();
  for (const l of readFileSync(LEG, 'utf8').split('\n')) {
    if (l.length < 3) continue;
    const o = JSON.parse(l) as { f: number; cls: string };
    cls.set(o.f, o.cls);
  }
  const tab = new Map<string, { n: number; split: number; area: number; splitArea: number }>();
  for (const fr of facets.values()) {
    const c = cls.get(fr.f) ?? '(absent)';
    const b = tab.get(c) ?? { n: 0, split: 0, area: 0, splitArea: 0 };
    b.n += 1; b.area += fr.area;
    if (A.splitFacets.has(fr.f)) { b.split += 1; b.splitArea += fr.area; }
    tab.set(c, b);
  }
  for (const [c, b] of [...tab.entries()].sort((x, y) => y[1].area - x[1].area)) {
    log(`  ${c.padEnd(16)} ${String(b.n).padStart(5)} facets ${b.area.toFixed(4).padStart(9)} mm2   this operator split ${String(b.split).padStart(5)} of them (${((b.splitArea / b.area) * 100).toFixed(1)}% of their area)`);
  }
  log('');
}

// ── FLOOR ASSERTIONS (a one-sided bar is vacuous) ──────────────────────────────────────────────────────
log('── FLOOR ASSERTIONS ──');
const gbP = beforeAgg.get(INSET_PRIMARY) as Agg; const gaP = afterAgg.get(INSET_PRIMARY) as Agg;
const areaKept = Math.abs(gaP.totArea - gbP.totArea) / gbP.totArea;
let nanCount = 0; for (const dgs of afterDeg.values()) for (const x of dgs) if (!Number.isFinite(x)) nanCount += 1;
const F1 = areaKept <= 0.005;
const F2 = A.newN > nTri;
const F3 = nanCount === 0;
const F4 = FULLDIH && dihBefore !== null && dihAfter !== null ? (dihAfter.boundaryEdges === dihBefore.boundaryEdges && dihAfter.nonManifoldEdges === dihBefore.nonManifoldEdges) : false;
log(`  descendant AREA conserved: ${gbP.totArea.toFixed(4)} -> ${gaP.totArea.toFixed(4)} mm2 (${(areaKept * 100).toFixed(4)}%, must be <= 0.5%)   ${F1 ? 'PASS' : '*** FAIL ***'}`);
log(`  the operator actually did something: ${A.newN - nTri} triangles added   ${F2 ? 'PASS' : '*** FAIL — nothing was split ***'}`);
log(`  no NaN normDeg among descendants: ${nanCount}   ${F3 ? 'PASS' : '*** FAIL ***'}`);
log(`  watertightness unchanged (boundary + non-manifold edge counts): ${F4 ? 'PASS' : FULLDIH ? '*** FAIL ***' : 'NOT RUN (PF_OPS_FULLDIH=0)'}`);
log('');

// ── VERDICT ────────────────────────────────────────────────────────────────────────────────────────────
const ratio = gbP.area / Math.max(1e-12, gaP.area);
const triPct = ((A.newN - nTri) / nTri) * 100;
log('════ VERDICT against the PRE-REGISTERED kill line ════');
log(`  PRIMARY  over-${BAR_DEG}deg normDeg AREA (inset ${INSET_PRIMARY}) ${gbP.area.toFixed(4)} -> ${gaP.area.toFixed(4)} mm2 = ${ratio.toFixed(3)}x   (need >= 2.0x)`);
log(`           COUNT ${gbP.n} -> ${gaP.n};  MAX ${gbP.max.toFixed(2)} -> ${gaP.max.toFixed(2)} deg`);
log(`  COST     +${A.newN - nTri} triangles = +${triPct.toFixed(4)}% of the whole mesh   (need <= 10%)`);
log(`  T-JUNC   ${A.tJunctionsNoCascade} would exist without the cascade; 0 left with it (boundary-edge delta ${FULLDIH && dihBefore !== null && dihAfter !== null ? dihAfter.boundaryEdges - dihBefore.boundaryEdges : 'NOT RUN'})`);
const pass = ratio >= 2 && triPct <= 10 && F1 && F2 && F3;
log(`  ==> ${pass ? 'KILL LINE MET — the split operator survives.' : '*** KILL LINE FIRED — THE SPLIT OPERATOR IS REFUTED ON ITS OWN PRE-REGISTERED TERMS. ***'}`);
log(`  (CONTROL 1 ${CTRL1 ? 'PASS' : 'FIRED'}, CONTROL 2 ${CTRL2 ? 'PASS' : 'FIRED'}, SELF-TEST ${SELFTEST ? 'PASS' : 'FIRED'})`);
log('');

writeFileSync(`${OUTDIR}/S113OP2_SPLIT_${TAG}.summary.json`, `${JSON.stringify({
  style: STYLE, stl: STL, bar: THR_PRIMARY, N: SCAN_N, inset: INSET_PRIMARY, k: K,
  classFacets: facets.size, classAreaMm2: classArea, meshAreaMm2: meshArea,
  splitPts: A.nSplitPts, classSplit: A.splitFacets.size, cascadeOnly: A.cascadeOnly.size,
  triBefore: nTri, triAfter: A.newN, triPct,
  beforeOverArea: gbP.area, afterOverArea: gaP.area, ratio,
  beforeOverN: gbP.n, afterOverN: gaP.n, beforeMax: gbP.max, afterMax: gaP.max,
  tJunctionsNoCascade: A.tJunctionsNoCascade,
  controls: { CTRL1, CTRL2, SELFTEST, F1, F2, F3, F4 },
  pass,
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S113OP2_SPLIT_${TAG}.summary.json`);
log(`done ${el()}`);

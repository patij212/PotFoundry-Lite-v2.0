// revS113SplitReachXStyle.ts — REVIEW PROBE: does S113-OP2's REACH MECHANISM survive on a DIFFERENT MESH?
//
// S113-OP2 refuted the targeted conform split on GothicArches. Its stated MECHANISM is:
//   "90.0% of the crease crossings land within 1.5 um of an EXISTING VERTEX, so the operator can reach
//    only 10.08% of the class area."
// If that is a GothicArches accident, the refutation does not generalise and the split may still be a
// live operator elsewhere. If it reproduces on other driver-produced meshes, the refutation is structural.
//
// WHAT THIS DOES. One instrument, three styles, PRINTED VALUES DIFFED:
//   1. read the STL, rebuild rA from STYLE_REGISTRY defaults + dims, and PRECOND-check the radial residual;
//   2. facetDihedrals over the WHOLE mesh -> the VISIBLE population (per-facet max dihedral > BAR);
//   3. weld those facets, take their unique edges, and run S113-OP2's DENSE BOUNDARY SCANNER VERBATIM;
//   4. report, as COUNT + AREA + MAX everywhere: the distance from every over-bar crease crossing to the
//      nearest edge endpoint, and the REACH — the count and AREA of visible facets that own at least one
//      crossing far enough from both endpoints to be splittable at the driver's FLOOR_MM.
//
// GothicArches is run as the CONTROL: this instrument must reproduce S113-OP2's ~90% on it, or the
// cross-style numbers mean nothing.
//
// SELF-TEST FIRST (two-sided, closed forms): a tent must yield EXACTLY 2 crossings at the closed-form
// positions and turns, a smooth control whose normal genuinely turns >100 deg must yield 0 over the bar.
//
// Usage: bash research/tools/run-rev-s113-reachx.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { radialNormal } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STL = process.env.PF_REVX_STL ?? '';
const STYLE = process.env.PF_REVX_STYLE ?? 'GothicArches';
const TAG = process.env.PF_REVX_TAG ?? 'X';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_REVX_H', 120), Rb: envF('PF_REVX_RB', 40), Rt: envF('PF_REVX_RT', 50), expn: 1 };
const H = DIMS.H;

const FLOOR_MM = envF('PF_REVX_FLOOR_UM', 1.5) / 1000;   // the driver's edge floor, verbatim
const BAR_DEG = envF('PF_REVX_BAR', 45);                 // the dihedral "visible" bar, verbatim
const THR_DEG = envF('PF_REVX_THR', 15);                 // the crease bar, S113-OP2's primary
const SCAN_N = Math.round(envF('PF_REVX_N', 256));
const CAP = Math.round(envF('PF_REVX_CAP', 8000));       // facets scanned (deterministic stride sample)
const GAP_FIND = 2;
const REF_ITERS = 60;
const H_MIN = 1e-7;

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
mkdirSync(OUTDIR, { recursive: true });

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const dist = (v: number[], f = 6): string => (v.length === 0 ? '(empty)'
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
const triArea = (t: ArrayLike<number>, o = 0): number => {
  const ux = t[o + 3] - t[o]; const uy = t[o + 4] - t[o + 1]; const uz = t[o + 5] - t[o + 2];
  const wx = t[o + 6] - t[o]; const wy = t[o + 7] - t[o + 1]; const wz = t[o + 8] - t[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};

log('===== REV-S113-OP2 — DOES THE SPLIT\'S REACH MECHANISM SURVIVE ON A DIFFERENT MESH? =====');
log(`style ${STYLE}   tag ${TAG}   dims H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`stl   ${STL}`);
log(`bars: dihedral VISIBLE > ${BAR_DEG} deg;  crease bar ${THR_DEG} deg;  driver FLOOR_MM ${FLOOR_MM} mm;  scan N ${SCAN_N};  facet cap ${CAP}`);
log('');

// ── the analytic surface, and the PRECOND control ───────────────────────────────────────────────────────
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
if (STL === '') { log('*** no PF_REVX_STL — REFUSING. ***'); process.exit(4); }
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
let PRECOND = true;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log('── CONTROL: PRECOND (rA is this mesh\'s surface) ──');
  log(`  mesh ${nTri} facets;  PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um`);
  if (worst * 1000 > 0.05) { log('  *** PRECOND MISMATCH — params/dims wrong for this STL. THIS STYLE\'S RUN IS VOID. ***'); PRECOND = false; }
  else log('  PRECOND OK (<= 0.05 um)');
}
log('');

// ── the dense boundary scanner — S113-OP2's, VERBATIM ───────────────────────────────────────────────────
const angOf = (p: Float64Array, po: number, r: Float64Array, ro: number): number => {
  let d = p[po] * r[ro] + p[po + 1] * r[ro + 1] + p[po + 2] * r[ro + 2];
  d = d > 1 ? 1 : d < -1 ? -1 : d;
  return (Math.acos(d) * 180) / Math.PI;
};
interface Cross { s: number; turnDeg: number; brWidthMm: number }
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
    let k0 = -1;
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
      out.push({ s: 0.5 * (lo + hi), turnDeg: angOf(n0, 0, n1, 0), brWidthMm: lenMm * w });
      k0 = -1;
    };
    for (let k = 0; k < N; k += 1) {
      const g = angOf(nBuf, 3 * k, nBuf, 3 * (k + 1));
      if (g > GAP_FIND) { if (k0 < 0) k0 = k; } else flush(k - 1);
    }
    flush(N - 1);
    return out;
  };
}

// ── SELF-TEST, two-sided, on closed forms ───────────────────────────────────────────────────────────────
let SELFTEST = true;
{
  log('── SELF-TEST of the dense scanner (a crease fixture must find EXACTLY 2, a smooth control 0) ──');
  const R0 = 40; const AMP = 2; const TH0 = 0.3; const W = 0.01;
  const sT = makeScanner((th) => R0 + AMP * Math.max(0, 1 - Math.abs(th - TH0) / W));
  const thA = 0.292; const thB = 0.318; const lenT = R0 * (thB - thA);
  const rawT = sT(thA, 50, thB, 50, lenT, 256).filter((c) => c.turnDeg >= 5);
  const sCrest = (TH0 - thA) / (thB - thA); const sClamp = (TH0 + W - thA) / (thB - thA);
  const tCrest = (2 * Math.atan((AMP / W) / (R0 + AMP)) * 180) / Math.PI;
  const tClamp = (Math.atan((AMP / W) / R0) * 180) / Math.PI;
  const okN = rawT.length === 2;
  const okA = okN && Math.abs(rawT[0].s - sCrest) * lenT < 1e-3 && Math.abs(rawT[0].turnDeg - tCrest) < 0.5;
  const okB = okN && Math.abs(rawT[1].s - sClamp) * lenT < 1e-3 && Math.abs(rawT[1].turnDeg - tClamp) < 0.5;
  const sS = makeScanner((th) => R0 + AMP * Math.cos(60 * th));
  const overS = sS(thA, 50, thB, 50, lenT, 256).filter((c) => c.turnDeg >= 5);
  log(`  TENT got ${rawT.length} (expect 2): ${rawT.map((c) => `s ${c.s.toFixed(5)} turn ${c.turnDeg.toFixed(3)}`).join(' | ')}`);
  log(`  TENT expects s ${sCrest.toFixed(5)} turn ${tCrest.toFixed(2)} | s ${sClamp.toFixed(5)} turn ${tClamp.toFixed(2)}`);
  log(`  SMOOTH control over the 5 deg bar ${overS.length} (must be 0)`);
  SELFTEST = okN && okA && okB && overS.length === 0;
  log(`  SELF-TEST ${SELFTEST ? 'PASS' : '*** FAILED — THE RUN IS VOID ***'}`);
}
log('');
const scanEdge = makeScanner(rA);

// ── the VISIBLE population: per-facet max dihedral over the bar ─────────────────────────────────────────
log('── THE VISIBLE POPULATION (facetDihedrals, analytic-free) ──');
const idAll = new Uint32Array(nTri * 3); for (let i = 0; i < idAll.length; i += 1) idAll[i] = i;
const dih = facetDihedrals(xyz, idAll);
let meshArea = 0; for (let f = 0; f < nTri; f += 1) meshArea += dih.areaMm2[f];
const barRad = (BAR_DEG * Math.PI) / 180;
const visible: number[] = [];
let visArea = 0; let visMax = 0;
for (let f = 0; f < nTri; f += 1) {
  if (!(dih.perFacetMaxRad[f] > barRad)) continue;
  visible.push(f); visArea += dih.areaMm2[f];
  if (dih.perFacetMaxRad[f] > visMax) visMax = dih.perFacetMaxRad[f];
}
log(`  mesh AREA ${meshArea.toFixed(3)} mm2;  interior ${dih.interiorEdges} boundary ${dih.boundaryEdges} non-manifold ${dih.nonManifoldEdges} inconsistent ${dih.inconsistentEdges}`);
log(`  VISIBLE (dihedral > ${BAR_DEG} deg): COUNT ${visible.length} facets   AREA ${visArea.toFixed(4)} mm2 = ${((visArea / meshArea) * 100).toFixed(4)}% of mesh   MAX ${((visMax * 180) / Math.PI).toFixed(2)} deg   ${el()}`);

// deterministic stride sample so the scan cost is bounded and the sample is not order-biased
const stride = Math.max(1, Math.ceil(visible.length / CAP));
const sample: number[] = []; let sampArea = 0;
for (let i = 0; i < visible.length; i += stride) { sample.push(visible[i]); sampArea += dih.areaMm2[visible[i]]; }
log(`  SAMPLED for the scan: stride ${stride} => COUNT ${sample.length} facets  AREA ${sampArea.toFixed(4)} mm2 = ${((sampArea / visArea) * 100).toFixed(2)}% of the visible area`);
log('');

// ── weld the sampled facets and scan their unique edges ────────────────────────────────────────────────
const canX: number[] = []; const canY: number[] = []; const canZ: number[] = [];
const buckets = new Map<number, number[]>();
const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
const addV = (x: number, y: number, z: number): number => {
  f32[0] = x; f32[1] = y; f32[2] = z;
  const h = ((u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35)) | 0;
  const b = buckets.get(h);
  if (b !== undefined) { for (const c of b) if (canX[c] === x && canY[c] === y && canZ[c] === z) return c; }
  const id = canX.length; canX.push(x); canY.push(y); canZ.push(z);
  if (b === undefined) buckets.set(h, [id]); else b.push(id);
  return id;
};
const facetV: number[][] = [];
for (const f of sample) {
  facetV.push([0, 1, 2].map((k) => addV(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3 + 2])));
}
log(`welded ${canX.length} vertices from ${sample.length} sampled facets  ${el()}`);

const EK = (a: number, b: number): number => (a < b ? a * 33554432 + b : b * 33554432 + a);
interface EdgeRec { vLo: number; vHi: number; lenMm: number; crosses: Cross[] }
const edges = new Map<number, EdgeRec>();
for (const v of facetV) {
  for (let k = 0; k < 3; k += 1) {
    const j = (k + 1) % 3;
    const key = EK(v[k], v[j]);
    if (edges.has(key)) continue;
    const lo = Math.min(v[k], v[j]); const hi = Math.max(v[k], v[j]);
    edges.set(key, { vLo: lo, vHi: hi, lenMm: Math.hypot(canX[hi] - canX[lo], canY[hi] - canY[lo], canZ[hi] - canZ[lo]), crosses: [] });
  }
}
log(`unique edges ${edges.size};  scanning...`);
for (const er of edges.values()) {
  const thL = Math.atan2(canY[er.vLo], canX[er.vLo]);
  const thH = thL + dThRaw(thL, Math.atan2(canY[er.vHi], canX[er.vHi]));
  er.crosses = scanEdge(thL, canZ[er.vLo], thH, canZ[er.vHi], er.lenMm, SCAN_N);
}
log(`scan done  ${el()}`);
log('');

// ── THE MECHANISM: where do the over-bar crossings sit relative to the existing vertices? ───────────────
log(`── THE MECHANISM: distance from each over-${THR_DEG}deg crease crossing to the NEAREST EDGE ENDPOINT ──`);
const toVtx: number[] = [];
let nBrackets = 0; let nOverBar = 0;
const splittableEdges = new Set<number>();
for (const [key, er] of edges) {
  for (const c of er.crosses) {
    nBrackets += 1;
    if (!(c.turnDeg >= THR_DEG)) continue;
    nOverBar += 1;
    const d = Math.min(c.s, 1 - c.s) * er.lenMm;
    toVtx.push(d);
    if (d >= FLOOR_MM) splittableEdges.add(key);
  }
}
log(`  brackets opened ${nBrackets};  over the ${THR_DEG} deg crease bar ${nOverBar}`);
log(`  distance to nearest endpoint, mm: ${dist(toVtx, 6)}`);
const ladder = [0.0005, 0.0015, 0.005, 0.015, 0.05];
for (const L of ladder) {
  const n = toVtx.filter((x) => x < L).length;
  log(`    within ${(L * 1000).toFixed(1).padStart(5)} um of a vertex: ${String(n).padStart(6)} = ${((n / Math.max(1, nOverBar)) * 100).toFixed(1)}%`);
}
log('');

// ── THE REACH: COUNT + AREA + MAX of the visible facets an edge-split operator can actually touch ──────
log('── THE REACH: sampled VISIBLE facets owning at least one SPLITTABLE crossing (>= FLOOR_MM from both endpoints) ──');
let reachN = 0; let reachArea = 0; let reachMax = 0;
let noReachMax = 0;
for (let i = 0; i < sample.length; i += 1) {
  const f = sample[i]; const v = facetV[i];
  let hit = false;
  for (let k = 0; k < 3; k += 1) if (splittableEdges.has(EK(v[k], v[(k + 1) % 3]))) { hit = true; break; }
  const dd = dih.perFacetMaxRad[f];
  if (hit) { reachN += 1; reachArea += dih.areaMm2[f]; if (dd > reachMax) reachMax = dd; }
  else if (dd > noReachMax) noReachMax = dd;
}
log(`  REACHABLE     COUNT ${reachN} facets = ${((reachN / sample.length) * 100).toFixed(2)}% by count;  AREA ${reachArea.toFixed(4)} mm2 = ${((reachArea / sampArea) * 100).toFixed(2)}% of the sampled visible AREA;  MAX dihedral ${((reachMax * 180) / Math.PI).toFixed(2)} deg`);
log(`  UNREACHABLE   COUNT ${sample.length - reachN} facets = ${(((sample.length - reachN) / sample.length) * 100).toFixed(2)}%;  AREA ${(sampArea - reachArea).toFixed(4)} mm2 = ${(((sampArea - reachArea) / sampArea) * 100).toFixed(2)}%;  MAX dihedral ${((noReachMax * 180) / Math.PI).toFixed(2)} deg`);
log('');
log(`  (S113-OP2 read, on GothicArches' pinned 6,193-facet straddle class: 90.0% of crossings within 1.5 um of a vertex, reach 10.08% of the class AREA)`);
log(`  CONTROLS: PRECOND ${PRECOND ? 'PASS' : '*** FIRED — VOID ***'}   SELF-TEST ${SELFTEST ? 'PASS' : '*** FIRED — VOID ***'}`);

writeFileSync(`${OUTDIR}/REVX_REACH_${TAG}.summary.json`, `${JSON.stringify({
  style: STYLE, stl: STL, dims: DIMS, meshFacets: nTri, meshAreaMm2: meshArea,
  visibleN: visible.length, visibleAreaMm2: visArea, sampledN: sample.length, sampledAreaMm2: sampArea, stride,
  overBar: nOverBar, within1p5um: toVtx.filter((x) => x < 0.0015).length,
  within1p5umPct: (toVtx.filter((x) => x < 0.0015).length / Math.max(1, nOverBar)) * 100,
  reachN, reachAreaMm2: reachArea, reachAreaPct: (reachArea / Math.max(1e-12, sampArea)) * 100,
  controls: { PRECOND, SELFTEST },
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/REVX_REACH_${TAG}.summary.json`);
log(`done ${el()}`);

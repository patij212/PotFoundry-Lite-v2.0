// revS116GothVerify.ts — INDEPENDENT REFUTATION PASS on the S116 GothicArches "BEST" mesh claim.
//
// WHAT I AM TESTING, AND WHY.
// The claim's headline 175x rests entirely on ONE statistic: R3, the "honest perpendicular" over-0.01 mm
// AREA. The census that produced it (s116BestGothic.ts:r3Of) does NOT project the facet. It projects
// only PERP_TOP = 4 of the 45 barycentric lattice points, and it picks those 4 by RANKING THEM ON A
// DIFFERENT METRIC — the RADIAL residual R1. The point where the PERPENDICULAR distance is largest need
// not be among the four points where the RADIAL residual is largest, so the reported R3 is a sampled
// LOWER bound on the facet's true perpendicular max. Nothing in the campaign has ever swept that.
//
// Scar 2 (lattice order k) was swept on R1 and shown converged. It was NEVER swept on R3. This tool
// sweeps BOTH the top-K heuristic and the lattice order k, on BOTH arms, with the SAME projector
// (1024x512 topK6) so the only thing that changes is the sampling of the facet.
//
// Also re-verified independently: facet count, 3D area, EXHAUSTIVE precond over every corner, topology
// from the written file via the analytic-free dihedralRuler, and the fold/ceiling census.
//
// env: PF_RV_BEST(abs) PF_RV_BASE(abs) PF_RV_OUT PF_RV_MODE(fast|full) PF_RV_KFULL PF_RV_SUBK
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const DEG = 180 / Math.PI;

const BEST = envS('PF_RV_BEST', '');
const BASE = envS('PF_RV_BASE', '');
const OUT = envS('PF_RV_OUT', 'research/exchange/_strataConformBisect/s116');
const MODE = envS('PF_RV_MODE', 'full');
const KFULL = envI('PF_RV_KFULL', 8);
const SUBK = envI('PF_RV_SUBK', 16);
const BAR_HI = 0.01;
const BAR_LO = 0.001;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>).GothicArches;
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn('GothicArches' as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
// SAME projector configuration the claim used, so the ONLY difference is which points get projected.
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });

const pct = (a: number, b: number): string => (b === 0 ? '  --  ' : ((a / b) * 100).toFixed(6));
const latticePts = (k: number): Float64Array => {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
};

interface Arm {
  tag: string; path: string; nTri: number; xyz: Float64Array;
  area: Float64Array; areaTot: number;
  precMax: number; precP99: number; precOverLo: number; precOverHi: number;
  r1: Float64Array;
}

function loadArm(tag: string, path: string): Arm {
  const t0 = Date.now();
  const m = readMeshFloat64(path, false);
  const nTri = m.nTri;
  const xyz = m.xyz;
  const area = new Float64Array(nTri);
  let areaTot = 0;
  const prec: number[] = [];
  let precMax = 0; let precOverLo = 0; let precOverHi = 0;
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nxv = uy * wz - uz * wy, nyv = uz * wx - ux * wz, nzv = ux * wy - uy * wx;
    area[f] = 0.5 * Math.hypot(nxv, nyv, nzv);
    areaTot += area[f];
    // EXHAUSTIVE PRECOND — every corner of every facet, no dedup, no stride.
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const p1 = Math.abs(Math.hypot(ax, ay) - rA(tha, az));
    const p2 = Math.abs(Math.hypot(bx, by) - rA(thb, bz));
    const p3 = Math.abs(Math.hypot(cx, cy) - rA(thc, cz));
    prec.push(p1, p2, p3);
    const pm = Math.max(p1, p2, p3);
    if (pm > precMax) precMax = pm;
    if (pm > BAR_LO) precOverLo += 1;
    if (pm > BAR_HI) precOverHi += 1;
  }
  const ps = new Float64Array(prec); ps.sort();
  const q = (p: number): number => ps[Math.min(ps.length - 1, Math.floor(ps.length * p))];
  log(`   [${tag}] ${path}`);
  log(`   [${tag}] facets ${nTri}  3D area ${areaTot.toFixed(4)} mm2   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  log(`   [${tag}] PRECOND EXHAUSTIVE over ${ps.length} corners (no stride, no dedup): MAX ${(precMax * 1000).toFixed(4)} um  p99 ${(q(0.99) * 1000).toFixed(4)} um  p50 ${(q(0.5) * 1000).toExponential(3)} um`);
  log(`   [${tag}] facets with a corner over 0.001 mm: ${precOverLo} (${pct(precOverLo, nTri)}%)   over 0.01 mm: ${precOverHi}`);
  return { tag, path, nTri, xyz, area, areaTot, precMax, precP99: q(0.99), precOverLo, precOverHi, r1: new Float64Array(0) };
}

/** R1 = max radial residual over the barycentric lattice. PROVEN upper bound on dist(p, S). */
function r1All(A: Arm, k: number): Float64Array {
  const LAT = latticePts(k); const NP = LAT.length / 3;
  const out = new Float64Array(A.nTri);
  const t0 = Date.now();
  for (let f = 0; f < A.nTri; f += 1) {
    const o = f * 9;
    const ax = A.xyz[o], ay = A.xyz[o + 1], az = A.xyz[o + 2];
    const bx = A.xyz[o + 3], by = A.xyz[o + 4], bz = A.xyz[o + 5];
    const cx = A.xyz[o + 6], cy = A.xyz[o + 7], cz = A.xyz[o + 8];
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > w) w = dd;
    }
    out[f] = w;
  }
  log(`   [${A.tag}] R1 exhaustive k=${k} (${NP} pts/facet): ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return out;
}

/**
 * R3 on one facet.
 * topK <= 0  =>  project EVERY lattice point (the honest max over the lattice).
 * topK  > 0  =>  reproduce the claim: project only the topK points ranked by RADIAL residual.
 */
function r3Facet(A: Arm, f: number, LAT: Float64Array, NP: number, topK: number, dd: Float64Array, ord: Int32Array): { v: number; calls: number } {
  const o = f * 9;
  const ax = A.xyz[o], ay = A.xyz[o + 1], az = A.xyz[o + 2];
  const bx = A.xyz[o + 3], by = A.xyz[o + 4], bz = A.xyz[o + 5];
  const cx = A.xyz[o + 6], cy = A.xyz[o + 7], cz = A.xyz[o + 8];
  const px = (p: number): number => LAT[p * 3] * ax + LAT[p * 3 + 1] * bx + LAT[p * 3 + 2] * cx;
  const py = (p: number): number => LAT[p * 3] * ay + LAT[p * 3 + 1] * by + LAT[p * 3 + 2] * cy;
  const pz = (p: number): number => LAT[p * 3] * az + LAT[p * 3 + 1] * bz + LAT[p * 3 + 2] * cz;
  let best = 0; let calls = 0;
  if (topK <= 0) {
    for (let p = 0; p < NP; p += 1) {
      const d = proj.project(px(p), py(p), pz(p)).dist; calls += 1;
      if (d > best) best = d;
    }
    return { v: best, calls };
  }
  for (let p = 0; p < NP; p += 1) {
    const x = px(p), y = py(p), z = pz(p);
    dd[p] = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
  }
  let nTop = 0;
  for (let p = 0; p < NP; p += 1) {
    const v = dd[p];
    if (nTop < topK) { let i = nTop; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; nTop += 1; }
    else if (v > dd[ord[nTop - 1]]) { let i = nTop - 1; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; }
  }
  for (let ti = 0; ti < nTop; ti += 1) {
    const p = ord[ti];
    const d = proj.project(px(p), py(p), pz(p)).dist; calls += 1;
    if (d > best) best = d;
  }
  return { v: best, calls };
}

interface Tally { n: number; a: number; mx: number }
function tally(v: Float64Array, area: Float64Array, bar: number, mask?: Int32Array): Tally {
  let n = 0; let a = 0; let mx = 0;
  const N = mask === undefined ? v.length : mask.length;
  for (let i = 0; i < N; i += 1) {
    const f = mask === undefined ? i : mask[i];
    if (v[f] > bar) { n += 1; a += area[f]; }
    if (v[f] > mx) mx = v[f];
  }
  return { n, a, mx };
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('  revS116GothVerify — INDEPENDENT re-measurement of the S116 GothicArches "BEST mesh" claim');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`  best ${BEST}`);
log(`  base ${BASE}`);
log(`  mode ${MODE}  kFull ${KFULL}  subK ${SUBK}`);
log('');

const arms: Arm[] = [];
log('── A. FILE / AREA / EXHAUSTIVE PRECOND ──');
if (BEST.length > 0) arms.push(loadArm('BEST', BEST));
if (BASE.length > 0) arms.push(loadArm('BASE', BASE));
log('');

// ── B. TOPOLOGY, straight off the written file, analytic-free ─────────────────────────────────────
log('── B. TOPOLOGY + FOLD CENSUS from the WRITTEN FILE (analytic-free dihedralRuler) ──');
const CEIL_DEG = 168.16035336252628;
const CEIL_RAD = CEIL_DEG / DEG;
const dihOf = new Map<string, { per: Float64Array; res: ReturnType<typeof facetDihedrals> }>();
for (const A of arms) {
  const idx = new Int32Array(A.nTri * 3);
  for (let i = 0; i < A.nTri * 3; i += 1) idx[i] = i;
  const res = facetDihedrals(A.xyz, idx);
  dihOf.set(A.tag, { per: res.perFacetMaxRad, res });
  const per = res.perFacetMaxRad;
  const t45 = tally(per, A.area, 45 / DEG);
  const tC = tally(per, A.area, CEIL_RAD);
  const tB = tally(per, A.area, 175 / DEG);
  log(`   [${A.tag}] interior ${res.interiorEdges}  BOUNDARY ${res.boundaryEdges}  NON-MANIFOLD ${res.nonManifoldEdges}  INCONSISTENT ${res.inconsistentEdges}`);
  log(`   [${A.tag}] >45 deg    COUNT ${t45.n} (${pct(t45.n, A.nTri)}%)  AREA ${t45.a.toFixed(4)} mm2 (${pct(t45.a, A.areaTot)}% of mesh)`);
  log(`   [${A.tag}] >CEIL ${CEIL_DEG.toFixed(3)}  COUNT ${tC.n} (${pct(tC.n, A.nTri)}%)  AREA ${tC.a.toExponential(4)} mm2 (${pct(tC.a, A.areaTot)}% of mesh)`);
  log(`   [${A.tag}] >=175 BLADE COUNT ${tB.n} (${pct(tB.n, A.nTri)}%)  AREA ${tB.a.toExponential(4)} mm2 (${pct(tB.a, A.areaTot)}% of mesh)   dihMAX ${(t45.mx * DEG).toFixed(3)} deg`);
}
log('');

// ── C. POSITION ─────────────────────────────────────────────────────────────────────────────────
log('── C. POSITION — R1 exhaustive, then R3 with the top-K heuristic AND with the FULL lattice ──');
const results: Record<string, unknown> = {};
for (const A of arms) {
  A.r1 = r1All(A, KFULL);
  const LAT = latticePts(KFULL); const NP = LAT.length / 3;
  const dd = new Float64Array(NP); const ord = new Int32Array(NP);
  const cand: number[] = [];
  for (let f = 0; f < A.nTri; f += 1) if (A.r1[f] > BAR_HI) cand.push(f);
  const C = new Int32Array(cand);
  const r1hi = tally(A.r1, A.area, BAR_HI);
  const GRAPH_SLOPE = 9.69587152936877;
  let lbN = 0; let lbA = 0;
  for (let f = 0; f < A.nTri; f += 1) if (A.r1[f] / GRAPH_SLOPE > BAR_HI) { lbN += 1; lbA += A.area[f]; }
  log(`   [${A.tag}] R1 (PROVEN UPPER) >0.01: COUNT ${r1hi.n} (${pct(r1hi.n, A.nTri)}%)  AREA ${r1hi.a.toFixed(4)} (${pct(r1hi.a, A.areaTot)}%)  MAX ${r1hi.mx.toExponential(5)}`);
  log(`   [${A.tag}] R1/sqrt(1+L^2) (PROVEN LOWER) >0.01: COUNT ${lbN}  AREA ${lbA.toFixed(4)}`);
  log(`   [${A.tag}] candidates (R1 > 0.01): ${C.length}`);

  const r3top = new Float64Array(A.nTri);
  const r3full = new Float64Array(A.nTri);
  for (let f = 0; f < A.nTri; f += 1) { r3top[f] = A.r1[f]; r3full[f] = A.r1[f]; }
  let callsT = 0; let callsF = 0;
  const t0 = Date.now();
  for (let i = 0; i < C.length; i += 1) {
    const f = C[i];
    const a = r3Facet(A, f, LAT, NP, 4, dd, ord); r3top[f] = a.v; callsT += a.calls;
    const b = r3Facet(A, f, LAT, NP, 0, dd, ord); r3full[f] = b.v; callsF += b.calls;
    if ((i & 8191) === 8191) log(`      [${A.tag}] ${i + 1}/${C.length}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const tT = tally(r3top, A.area, BAR_HI);
  const tF = tally(r3full, A.area, BAR_HI);
  log(`   [${A.tag}] R3 top-4-by-R1  (THE CLAIM'S RULER)  >0.01: COUNT ${tT.n}  AREA ${tT.a.toExponential(6)} (${pct(tT.a, A.areaTot)}%)  MAX ${tT.mx.toExponential(6)}   ${callsT} proj calls`);
  log(`   [${A.tag}] R3 FULL LATTICE (${NP} pts, honest)  >0.01: COUNT ${tF.n}  AREA ${tF.a.toExponential(6)} (${pct(tF.a, A.areaTot)}%)  MAX ${tF.mx.toExponential(6)}   ${callsF} proj calls`);
  log(`   [${A.tag}] TOP-4 HEURISTIC UNDER-READ: COUNT ${tF.n}/${tT.n} = ${(tF.n / Math.max(1, tT.n)).toFixed(3)}x   AREA ${(tF.a / Math.max(1e-15, tT.a)).toFixed(3)}x   MAX ${(tF.mx / Math.max(1e-15, tT.mx)).toFixed(3)}x`);
  log(`   [${A.tag}] R3 full ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  // SCAR 2 ON R3 — lattice order convergence, never done in the campaign.
  const sub: number[] = [];
  for (let i = 0; i < C.length; i += 1) if (r3full[C[i]] > 0.004) sub.push(C[i]);
  const LADCAP = envI('PF_RV_LADCAP', 20000);
  let S = new Int32Array(sub);
  if (S.length > LADCAP) {
    // declared stride — this is a CONVERGENCE ladder, not the headline census.
    const st = Math.ceil(S.length / LADCAP); const q: number[] = [];
    for (let i = 0; i < sub.length; i += st) q.push(sub[i]);
    S = new Int32Array(q);
    log(`   [${A.tag}] SCAR 2 ladder STRIDED ${st}x -> ${S.length} of ${sub.length} (declared; the headline census above is exhaustive)`);
  }
  log(`   [${A.tag}] SCAR 2 on R3: lattice-order ladder on the ${S.length} facets with R3full > 0.004 mm`);
  for (const k of [4, 8, SUBK]) {
    const L2 = latticePts(k); const N2 = L2.length / 3;
    const d2 = new Float64Array(N2); const o2 = new Int32Array(N2);
    let n = 0; let a = 0; let mx = 0;
    for (let i = 0; i < S.length; i += 1) {
      const f = S[i];
      const v = r3Facet(A, f, L2, N2, 0, d2, o2).v;
      if (v > BAR_HI) { n += 1; a += A.area[f]; }
      if (v > mx) mx = v;
    }
    log(`      k=${String(k).padStart(2)} (${String(N2).padStart(3)} pts)  >0.01 COUNT ${String(n).padStart(6)}  AREA ${a.toExponential(6)}  MAX ${mx.toExponential(6)}`);
  }

  results[A.tag] = {
    path: A.path, nTri: A.nTri, areaTot: A.areaTot,
    precMaxUm: A.precMax * 1000, precOverLo: A.precOverLo, precOverHi: A.precOverHi,
    r1Hi: { n: r1hi.n, a: r1hi.a, mx: r1hi.mx }, lb: { n: lbN, a: lbA },
    r3Top: { n: tT.n, a: tT.a, mx: tT.mx }, r3Full: { n: tF.n, a: tF.a, mx: tF.mx },
  };
  log('');
}

if (arms.length === 2) {
  const b = results.BEST as { r3Top: Tally; r3Full: Tally; nTri: number };
  const s = results.BASE as { r3Top: Tally; r3Full: Tally; nTri: number };
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  log('  THE RATIO, ON BOTH RULERS');
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`   CLAIM'S RULER  (R3 top-4-by-R1):  AREA ${(s.r3Top.a / Math.max(1e-15, b.r3Top.a)).toFixed(3)}x   COUNT ${(s.r3Top.n / Math.max(1, b.r3Top.n)).toFixed(3)}x   MAX ${(s.r3Top.mx / Math.max(1e-15, b.r3Top.mx)).toFixed(3)}x`);
  log(`   HONEST RULER   (R3 full lattice): AREA ${(s.r3Full.a / Math.max(1e-15, b.r3Full.a)).toFixed(3)}x   COUNT ${(s.r3Full.n / Math.max(1, b.r3Full.n)).toFixed(3)}x   MAX ${(s.r3Full.mx / Math.max(1e-15, b.r3Full.mx)).toFixed(3)}x`);
  log(`   triangles ${(b.nTri / s.nTri).toFixed(4)}x`);
}

writeFileSync(`${OUT}/REV_S116_GOTHVERIFY.json`, JSON.stringify(results, null, 1));
log(`json -> ${OUT}/REV_S116_GOTHVERIFY.json`);
log('DONE');

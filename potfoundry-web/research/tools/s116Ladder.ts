// s116Ladder.ts — S116 PART 2: THE SCALING LAW, MEASURED, NOT ASSUMED.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE QUESTION
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// "Chord sag ~ kappa*h^2/8, so 0.01 -> 0.001 is a 10x sag cut => h/3.16 => 10x triangles." That is a
// SMOOTH-SURFACE identity. Neither of these surfaces is smooth: both carry creases and near-vertical
// relief cliffs, and across a crease the chord sag of a flat triangle falls like h^1, not h^2 — which
// changes the 0.01 -> 0.001 bill from 10x to 100x ON THAT SET. So the exponent has to be MEASURED,
// per location, and the bill has to be integrated over the surface with the measured exponent in it.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE METHOD — PRICE THE SURFACE, NOT THE SHIPPING MESH
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// At each of N area-weighted random locations on the analytic surface, build the AXIS-ALIGNED (theta,z)
// QUAD of 3D edge scale h — which is exactly what the shipping generator emits: MetricSizingField feeds
// PeriodicBalancedQuadtree, whose leaves are axis-aligned in the parameter chart — lift its 4 corners
// onto the surface, split it into the 2 triangles, and measure the max radial gap over their interiors.
// Sweep h down a geometric ladder and record the WHOLE residual(h) curve. From that curve:
//
//   h*(tol)   the largest h whose residual is <= tol AND stays <= tol for every smaller h on the ladder
//             (the "and stays" clause matters: residual(h) is not monotone on a bumpy surface, and a
//              bare bisection would happily return an h sitting in a lucky trough above a violation).
//   p         the LOCAL exponent, log(res(h)/res(h/2))/log 2, taken in the small-h regime.
//   N(tol)    = integral of 2/h*(tol)^2 dA, Monte-Carlo'd with the area Jacobian. THE TRIANGLE COUNT.
//
// The exponent then falls straight out of the DATA as log(N_lo/N_hi)/log(10) — no model imposed.
//
// CONTROLS THAT CAN VOID THE RUN:
//   C4 ANALYTIC AREA. The Monte-Carlo Jacobian integral must reproduce the analytic surface area of the
//      sampled band. Printed next to the shipping mesh's own 3D area; the difference is the mesh's
//      EXCESS area (S115 measured +2.5988% on CelticTriquetra and called it garbage).
//   C5 LATTICE ORDER k on the residual (scar 2) — swept; the h* it produces must not move with k.
//   C6 LADDER FLOOR. If h* hits the bottom of the ladder at a location, NO h on the ladder achieves the
//      bar there. Those locations are counted, not silently clamped — they are the "no density fixes
//      this" class and they are the whole reason this tool exists.
//
// Usage: bash research/tools/run-s116-ladder.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S116_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S116_STL ?? '';
const TAG = process.env.PF_S116_TAG ?? 'X';
const OUTDIR = process.env.PF_S116_OUTDIR ?? 'research/exchange/_strataConformBisect/s116';
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S116_BARHI', 0.01);
const BAR_LO = envF('PF_S116_BARLO', 0.001);
const NLOC = envI('PF_S116_NLOC', 200000);
const K = envI('PF_S116_LK', 4);
const KSW = (process.env.PF_S116_LKSWEEP ?? '2,3,4,6,8').split(',').map((s) => Math.round(Number(s)));
const HMAX = envF('PF_S116_HMAX', 8);
const HMIN = envF('PF_S116_HMIN', 2e-4);
const HRAT = envF('PF_S116_HRAT', Math.pow(2, 0.25));
const SEED = envI('PF_S116_SEED', 20260807);
if (STL.length === 0) { log('*** PF_S116_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// ── mesh: only for the band bounds and the area control ──
const M = readMeshFloat64(STL, false);
let zLo = Infinity; let zHi = -Infinity; let meshArea = 0;
for (let f = 0; f < M.nTri; f += 1) {
  const o = f * 9;
  for (let v = 0; v < 3; v += 1) { const z = M.xyz[o + v * 3 + 2]; if (z < zLo) zLo = z; if (z > zHi) zHi = z; }
  const nx = (M.xyz[o + 4] - M.xyz[o + 1]) * (M.xyz[o + 8] - M.xyz[o + 2]) - (M.xyz[o + 5] - M.xyz[o + 2]) * (M.xyz[o + 7] - M.xyz[o + 1]);
  const ny = (M.xyz[o + 5] - M.xyz[o + 2]) * (M.xyz[o + 6] - M.xyz[o]) - (M.xyz[o + 3] - M.xyz[o]) * (M.xyz[o + 8] - M.xyz[o + 2]);
  const nz = (M.xyz[o + 3] - M.xyz[o]) * (M.xyz[o + 7] - M.xyz[o + 1]) - (M.xyz[o + 4] - M.xyz[o + 1]) * (M.xyz[o + 6] - M.xyz[o]);
  meshArea += 0.5 * Math.hypot(nx, ny, nz);
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 PART 2 — THE SCALING LAW, MEASURED — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`shipping mesh: ${M.nTri} facets, 3D area ${meshArea.toFixed(3)} mm2, z band [${zLo.toFixed(4)}, ${zHi.toFixed(4)}]`);
log(`locations ${NLOC}   h ladder ${HMIN} .. ${HMAX} mm ratio ${HRAT.toFixed(5)}   lattice k=${K}   bars ${BAR_HI} / ${BAR_LO} mm`);
log('');

// ── PRNG (deterministic) ──
let s0 = SEED >>> 0;
const rnd = (): number => { s0 ^= s0 << 13; s0 >>>= 0; s0 ^= s0 >>> 17; s0 ^= s0 << 5; s0 >>>= 0; return s0 / 4294967296; };

// ── the h ladder ──
const hs: number[] = [];
for (let h = HMAX; h >= HMIN; h /= HRAT) hs.push(h);
const NH = hs.length;

/** residual of the axis-aligned (theta,z) quad of 3D scale h at (th0,z0): max radial gap over both triangles. */
const latOf = (k: number): Float64Array => {
  const o: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) o.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(o);
};
const LATS = new Map<number, Float64Array>();
for (const k of [...KSW, K]) LATS.set(k, latOf(k));

const P = new Float64Array(12); // 4 corners x3

// SCAR 3 — the finite-difference step. E and G below are FD-derived, so the quad's size depends on the
// step, so h* depends on the step, so THE BILL depends on the step. Swept in C5b before it is trusted.
let HFD_T = envF('PF_S116_HFDT', 1e-5); let HFD_Z = envF('PF_S116_HFDZ', 1e-4);

/**
 * THE QUAD MUST BE SIZED BY THE FIRST FUNDAMENTAL FORM, NOT BY THE PARAMETER CHART.
 *
 * The first version of this tool set dth = h/r, i.e. it made the quad h wide in ARC length. That is
 * wrong wherever the relief is steep: the 3D edge from (th,z) to (th+dth,z) has length
 * sqrt((r*dth)^2 + (dr)^2), and on a 2.5 mm relief cliff dr swamps r*dth, so the "h = 0.1 mm" quad was
 * really a MILLIMETRE across in 3D. The residual was then attributed to the wrong h and h* came out too
 * small on exactly the locations that dominate the bill.
 *
 * PeriodicBalancedQuadtree refines "while its physical extent (sqrt(E)*du wide, sqrt(G)*dt tall at the
 * cell centre) exceeds the MetricSizingField target", so sizing by sqrt(E)/sqrt(G) is not merely more
 * correct in the abstract — it is the SHIPPING generator's own criterion, which is what makes the
 * resulting triangle count a bill for THIS pipeline rather than for an idealised one.
 *   E = |S_th|^2 = r_th^2 + r^2 ,  G = |S_z|^2 = r_z^2 + 1
 */
const quadResidual = (th0: number, z0: number, h: number, k: number): number => {
  const r0 = rA(th0, z0);
  const rt = (rA(th0 + HFD_T, z0) - rA(th0 - HFD_T, z0)) / (2 * HFD_T);
  const rz = (rA(th0, z0 + HFD_Z) - rA(th0, z0 - HFD_Z)) / (2 * HFD_Z);
  const sqE = Math.sqrt(rt * rt + r0 * r0);
  const sqG = Math.sqrt(rz * rz + 1);
  const dth = h / Math.max(1e-9, sqE);
  const th1 = th0 + dth; const z1 = z0 + h / Math.max(1e-9, sqG);
  const ths = [th0, th1, th0, th1]; const zzs = [z0, z0, z1, z1];
  for (let i = 0; i < 4; i += 1) {
    const r = rA(ths[i], zzs[i]);
    P[i * 3] = r * Math.cos(ths[i]); P[i * 3 + 1] = r * Math.sin(ths[i]); P[i * 3 + 2] = zzs[i];
  }
  const L = LATS.get(k) as Float64Array; const np = L.length / 3;
  let worst = 0;
  // triangles (0,1,2) and (1,3,2)
  const tri = [[0, 1, 2], [1, 3, 2]];
  for (const t of tri) {
    const a = t[0] * 3, b = t[1] * 3, c = t[2] * 3;
    for (let p = 0; p < np; p += 1) {
      const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
      const x = w0 * P[a] + w1 * P[b] + w2 * P[c];
      const y = w0 * P[a + 1] + w1 * P[b + 1] + w2 * P[c + 1];
      const z = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    }
  }
  return worst;
};

/** area Jacobian |S_th x S_z| at (th,z), central differences. */
const jac = (th: number, z: number): number => {
  const r = rA(th, z);
  const rt = (rA(th + HFD_T, z) - rA(th - HFD_T, z)) / (2 * HFD_T);
  const rz = (rA(th, z + HFD_Z) - rA(th, z - HFD_Z)) / (2 * HFD_Z);
  // S_th = (rt*cos - r*sin, rt*sin + r*cos, 0); S_z = (rz*cos, rz*sin, 1)
  const c = Math.cos(th), s = Math.sin(th);
  const ax = rt * c - r * s, ay = rt * s + r * c, az = 0;
  const bx = rz * c, by = rz * s, bz = 1;
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// C5 — LATTICE ORDER SWEEP on the residual itself (scar 2)
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── C5 / SCAR 2: LATTICE ORDER k ON THE QUAD RESIDUAL (a small sample, before k is trusted) ──');
log('   k    median h*(0.01) mm   median h*(0.001) mm   mean residual @ h=0.2 mm');
{
  const NS = envI('PF_S116_LKSW_N', 3000);
  const locT = new Float64Array(NS); const locZ = new Float64Array(NS);
  let sk = SEED >>> 0;
  const r2 = (): number => { sk ^= sk << 13; sk >>>= 0; sk ^= sk >>> 17; sk ^= sk << 5; sk >>>= 0; return sk / 4294967296; };
  for (let i = 0; i < NS; i += 1) { locT[i] = r2() * 2 * Math.PI; locZ[i] = zLo + r2() * (zHi - zLo); }
  for (const k of KSW) {
    const hhi: number[] = []; const hlo: number[] = []; let racc = 0;
    for (let i = 0; i < NS; i += 1) {
      let starHi = 0; let starLo = 0; let okHi = true; let okLo = true;
      for (let hi = NH - 1; hi >= 0; hi -= 1) {          // smallest h first
        const res = quadResidual(locT[i], locZ[i], hs[hi], k);
        if (okLo) { if (res <= BAR_LO) starLo = hs[hi]; else okLo = false; }
        if (okHi) { if (res <= BAR_HI) starHi = hs[hi]; else { okHi = false; break; } }
      }
      hhi.push(starHi); hlo.push(starLo);
      racc += quadResidual(locT[i], locZ[i], 0.2, k);
    }
    hhi.sort((a, b) => a - b); hlo.sort((a, b) => a - b);
    log(`   ${String(k).padStart(2)}   ${hhi[Math.floor(NS / 2)].toExponential(4).padStart(17)}   ${hlo[Math.floor(NS / 2)].toExponential(4).padStart(19)}   ${(racc / NS).toExponential(4).padStart(22)}`);
  }
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// C5b / SCAR 3 — THE FINITE-DIFFERENCE STEP. E and G size the quad, so the bill inherits the step.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── C5b / SCAR 3: FINITE-DIFFERENCE STEP (hTheta, hZ) ON h* AND ON THE BILL PROXY ──');
log('   hTheta      hZ        median h*(0.01)   median h*(0.001)   mean 2/h*(0.001)^2 (bill density)');
{
  const NS = envI('PF_S116_FDSW_N', 3000);
  const keepT = HFD_T; const keepZ = HFD_Z;
  const steps: Array<[number, number]> = [[1e-4, 1e-3], [1e-5, 1e-4], [1e-6, 1e-5], [1e-7, 1e-6]];
  for (const [ht, hz] of steps) {
    HFD_T = ht; HFD_Z = hz;
    let sk = SEED >>> 0;
    const r2 = (): number => { sk ^= sk << 13; sk >>>= 0; sk ^= sk >>> 17; sk ^= sk << 5; sk >>>= 0; return sk / 4294967296; };
    const hhi: number[] = []; const hlo: number[] = []; let dens = 0;
    for (let i = 0; i < NS; i += 1) {
      const th = r2() * 2 * Math.PI; const z = zLo + r2() * (zHi - zLo);
      let okHi = true; let okLo = true; let sHi = 0; let sLo = 0;
      for (let hi = NH - 1; hi >= 0; hi -= 1) {
        const res = quadResidual(th, z, hs[hi], K);
        if (okLo) { if (res <= BAR_LO) sLo = hs[hi]; else okLo = false; }
        if (okHi) { if (res <= BAR_HI) sHi = hs[hi]; else okHi = false; }
        if (!okHi && !okLo) break;
      }
      hhi.push(sHi); hlo.push(sLo);
      if (sLo > 0) dens += 2 / (sLo * sLo);
    }
    hhi.sort((a, b) => a - b); hlo.sort((a, b) => a - b);
    log(`   ${ht.toExponential(0).padStart(8)}  ${hz.toExponential(0).padStart(8)}  ${hhi[Math.floor(NS / 2)].toExponential(4).padStart(15)}   ${hlo[Math.floor(NS / 2)].toExponential(4).padStart(16)}   ${(dens / NS).toExponential(4).padStart(28)}`);
  }
  HFD_T = keepT; HFD_Z = keepZ;
  log(`   (production values restored: hTheta ${HFD_T}, hZ ${HFD_Z})`);
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// MAIN — per-location residual(h) curve, h*, local exponent, area Jacobian
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const hStarHi = new Float64Array(NLOC);
const hStarLo = new Float64Array(NLOC);
const expo = new Float64Array(NLOC);
const jj = new Float64Array(NLOC);
let floorHi = 0; let floorLo = 0; let ceilHi = 0;
const CURVE_N = envI('PF_S116_CURVE_N', 20000);   // locations that run the FULL ladder (curve + control)
const CONFIRM = envI('PF_S116_CONFIRM', 8);       // consecutive rungs below the bar before h* is accepted
const tM = Date.now();
let disagreeHi = 0; let disagreeLo = 0; let fullN = 0;
{
  // aggregate residual-vs-h curve (area weighted): the raw scaling law. Only the FULL-ladder subsample
  // contributes, so the curve is unbiased at every h despite the early termination below.
  const curveSum = new Float64Array(NH); const curveMax = new Float64Array(NH); const curveW = new Float64Array(NH);
  for (let i = 0; i < NLOC; i += 1) {
    const th = rnd() * 2 * Math.PI; const z = zLo + rnd() * (zHi - zLo);
    const J = jac(th, z); jj[i] = J;
    const full = i < CURVE_N;

    // ── EARLY-TERMINATING DESCENT (large h first). h* is accepted only after CONFIRM consecutive
    //    rungs below the bar, which is the cheap stand-in for the "and stays below for every smaller
    //    h" clause. The FULL-ladder arm below checks that stand-in rather than assuming it. ──
    let runHi = 0; let runLo = 0; let sHi = -1; let sLo = -1;
    let candHi = 0; let candLo = 0;
    for (let hi = 0; hi < NH; hi += 1) {
      const res = quadResidual(th, z, hs[hi], K);
      if (res <= BAR_HI) { if (runHi === 0) candHi = hs[hi]; runHi += 1; if (runHi >= CONFIRM && sHi < 0) sHi = candHi; } else runHi = 0;
      if (res <= BAR_LO) { if (runLo === 0) candLo = hs[hi]; runLo += 1; if (runLo >= CONFIRM && sLo < 0) sLo = candLo; } else runLo = 0;
      if (!full && sHi >= 0 && sLo >= 0) break;
      if (full) { curveSum[hi] += res * J; curveW[hi] += J; if (res > curveMax[hi]) curveMax[hi] = res; }
    }
    hStarHi[i] = sHi < 0 ? 0 : sHi; hStarLo[i] = sLo < 0 ? 0 : sLo;
    if (hStarHi[i] === 0) floorHi += 1;
    if (hStarLo[i] === 0) floorLo += 1;
    if (hStarHi[i] >= hs[0]) ceilHi += 1;

    if (full) {
      fullN += 1;
      // CONTROL: the strict "largest h below which EVERY smaller ladder rung is under the bar".
      let okHi = true; let okLo = true; let tHi = 0; let tLo = 0;
      for (let hi = NH - 1; hi >= 0; hi -= 1) {
        const res = quadResidual(th, z, hs[hi], K);
        if (okLo) { if (res <= BAR_LO) tLo = hs[hi]; else okLo = false; }
        if (okHi) { if (res <= BAR_HI) tHi = hs[hi]; else okHi = false; }
        if (!okHi && !okLo) break;
      }
      if (Math.abs(Math.log(Math.max(1e-12, hStarHi[i]) / Math.max(1e-12, tHi))) > 1e-9) disagreeHi += 1;
      if (Math.abs(Math.log(Math.max(1e-12, hStarLo[i]) / Math.max(1e-12, tLo))) > 1e-9) disagreeLo += 1;
      // local exponent in the SMALL-h limit: res(2h)/res(h) at the bottom of the ladder
      const rS = quadResidual(th, z, hs[NH - 1], K);
      const rD = quadResidual(th, z, hs[NH - 1] * 2, K);
      expo[i] = (rS > 0 && rD > 0) ? Math.log(rD / rS) / Math.log(2) : NaN;
    } else expo[i] = NaN;
  }
  log(`── MAIN: ${NLOC} area-weighted locations (${fullN} on the FULL ${NH}-rung ladder, rest early-terminated at CONFIRM=${CONFIRM}) in ${((Date.now() - tM) / 1000).toFixed(1)} s ──`);
  log(`   CONTROL: early-terminated h* vs the strict full-ladder h* on the ${fullN} full-ladder locations —`);
  log(`      disagreements: HI ${disagreeHi} (${((disagreeHi / Math.max(1, fullN)) * 100).toFixed(4)}%)   LO ${disagreeLo} (${((disagreeLo / Math.max(1, fullN)) * 100).toFixed(4)}%)`);
  log(`      ${disagreeHi + disagreeLo === 0 ? 'CONTROL HOLDS — CONFIRM=' + String(CONFIRM) + ' reproduces the strict definition exactly on this sample.' : 'CONTROL FIRES — the shortcut is NOT the strict definition; the bill is biased by that fraction.'}`);
  log('');
  log('── THE RAW SCALING LAW: AREA-WEIGHTED MEAN AND MAX RESIDUAL vs h ──');
  log('      h mm        mean res mm     slope(mean)      MAX res mm      slope(MAX)');
  const STEP = Math.max(1, Math.round(Math.log(2) / Math.log(HRAT)));   // print one row per factor of 2
  for (let hi = 0; hi < NH; hi += STEP) {
    const m = curveSum[hi] / curveW[hi];
    const j2 = hi + STEP;
    const mPrev = j2 < NH ? curveSum[j2] / curveW[j2] : NaN;
    const sl = Number.isFinite(mPrev) && mPrev > 0 ? Math.log(m / mPrev) / Math.log(hs[hi] / hs[j2]) : NaN;
    const slM = j2 < NH && curveMax[j2] > 0 ? Math.log(curveMax[hi] / curveMax[j2]) / Math.log(hs[hi] / hs[j2]) : NaN;
    log(`   ${hs[hi].toExponential(3).padStart(10)}   ${m.toExponential(4).padStart(13)}  ${(Number.isFinite(sl) ? sl.toFixed(3) : '  —  ').padStart(13)}   ${curveMax[hi].toExponential(4).padStart(13)}  ${(Number.isFinite(slM) ? slM.toFixed(3) : '  —  ').padStart(13)}`);
  }
  log('   SLOPE READ: 2.0 = smooth chord sag (kappa h^2/8).  1.0 = a CREASE/CLIFF crossing (linear in h).');
  log('   0.0 = the residual is SATURATED at the relief amplitude — h is not the variable there.');
  {
    const e = Array.from(expo.slice(0, fullN)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const qa = (p: number): number => (e.length === 0 ? NaN : e[Math.min(e.length - 1, Math.floor(e.length * p))]);
    log('');
    log(`   SMALL-h LIMIT EXPONENT (res(2h)/res(h) at h=${hs[NH - 1].toExponential(2)} mm, n=${e.length}):`);
    log(`      p01 ${qa(0.01).toFixed(3)}  p10 ${qa(0.1).toFixed(3)}  p50 ${qa(0.5).toFixed(3)}  p90 ${qa(0.9).toFixed(3)}  p99 ${qa(0.99).toFixed(3)}`);
    log('      This is the SMOOTH limit and must be ~2. It is a control on the ruler, not a cost driver:');
    log('      at that h almost nothing straddles a crease.');
  }
}
log('');

// ── C4 area control ──
const jMean = jj.reduce((a, b) => a + b, 0) / NLOC;
const jVar = jj.reduce((a, b) => a + (b - jMean) * (b - jMean), 0) / (NLOC - 1);
const bandArea = ((2 * Math.PI) * (zHi - zLo)) * jMean;
const bandSE = ((2 * Math.PI) * (zHi - zLo)) * Math.sqrt(jVar / NLOC);
log('── C4 AREA CONTROL ──');
log(`   analytic band area (Monte-Carlo, ${NLOC} pts): ${bandArea.toFixed(3)} +/- ${bandSE.toFixed(3)} mm2 (1 s.e.)`);
log(`   shipping mesh 3D area:                        ${meshArea.toFixed(3)} mm2`);
log(`   mesh EXCESS over the analytic surface:        ${(meshArea - bandArea).toFixed(3)} mm2 = ${(((meshArea - bandArea) / bandArea) * 100).toFixed(4)}%  (+/- ${((bandSE / bandArea) * 100).toFixed(4)}%)`);
log('   (Excess area is 3D surface the analytic definition does not contain — it can only come from');
log('    triangles that do not lie on the surface. It is a mesh-made quantity and no density removes it.)');
log('');

// ── h* distribution + the local exponent ──
{
  const sh = hStarHi.slice().sort(); const sl = hStarLo.slice().sort();
  const qq = (v: Float64Array, p: number): number => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  log('── REQUIRED EDGE LENGTH h*(tol), PER LOCATION (area-weighted sample) ──');
  log('   bar         p01          p10          p50          p90          p99      at-ladder-floor');
  log(`   0.01   ${[0.01, 0.1, 0.5, 0.9, 0.99].map((p) => qq(sh, p).toExponential(3).padStart(11)).join('  ')}   ${floorHi} (${((floorHi / NLOC) * 100).toFixed(4)}%)`);
  log(`   0.001  ${[0.01, 0.1, 0.5, 0.9, 0.99].map((p) => qq(sl, p).toExponential(3).padStart(11)).join('  ')}   ${floorLo} (${((floorLo / NLOC) * 100).toFixed(4)}%)`);
  log(`   locations where even h=${HMAX} mm already meets the 0.01 bar (ladder ceiling): ${ceilHi} (${((ceilHi / NLOC) * 100).toFixed(4)}%)`);
  log('');
  // per-location ratio h*(0.01)/h*(0.001)  => the LOCAL exponent p via 10^(1/p)
  const rat: number[] = []; const ploc: number[] = [];
  for (let i = 0; i < NLOC; i += 1) {
    if (hStarHi[i] > 0 && hStarLo[i] > 0) {
      const r = hStarHi[i] / hStarLo[i]; rat.push(r);
      if (r > 1.0001) ploc.push(Math.log(10) / Math.log(r));
    }
  }
  rat.sort((a, b) => a - b); ploc.sort((a, b) => a - b);
  const qa = (v: number[], p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);
  log('── THE MEASURED EXPONENT, PER LOCATION ──');
  log(`   h*(0.01)/h*(0.001):  p10 ${qa(rat, 0.1).toFixed(4)}  p50 ${qa(rat, 0.5).toFixed(4)}  p90 ${qa(rat, 0.9).toFixed(4)}  p99 ${qa(rat, 0.99).toFixed(4)}   (n=${rat.length})`);
  log(`      3.162 = h^2 (smooth).  10.0 = h^1 (crease/cliff).`);
  log(`   implied local exponent p = ln10/ln(ratio):  p10 ${qa(ploc, 0.1).toFixed(4)}  p50 ${qa(ploc, 0.5).toFixed(4)}  p90 ${qa(ploc, 0.9).toFixed(4)}   (n=${ploc.length})`);
  const nH1 = ploc.filter((p) => p < 1.35).length;
  log(`   locations whose LOCAL exponent is <= 1.35 (i.e. crease-like, NOT h^2): ${nH1} (${((nH1 / Math.max(1, ploc.length)) * 100).toFixed(3)}% of resolvable locations)`);
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE BILL — N(tol) = integral 2/h*^2 dA, Monte-Carlo with the area Jacobian
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const domain = (2 * Math.PI) * (zHi - zLo);
const bill = (hst: Float64Array, floorN: number): { n: number; nFloorArea: number } => {
  let acc = 0; let floorA = 0;
  for (let i = 0; i < NLOC; i += 1) {
    const h = hst[i];
    if (h <= 0) { floorA += jj[i]; continue; }   // unresolvable at the ladder floor — excluded, counted
    acc += (2 / (h * h)) * jj[i];
  }
  return { n: (domain * acc) / NLOC, nFloorArea: (domain * floorA) / NLOC };
};
const bHi = bill(hStarHi, floorHi); const bLo = bill(hStarLo, floorLo);

/**
 * BLOCK JACKKNIFE. The integrand 2/h*^2 is heavy-tailed: near a crease h* tracks the distance to the
 * crease, so a handful of samples that land very close carry a large share of the integral. A single
 * point estimate from a heavy-tailed estimator is not a measurement. Split the sample into blocks,
 * report the spread, and report what share of the total the single largest sample carries — if that
 * share is large the estimate is NOT converged and says so.
 */
const blockStats = (hst: Float64Array): { mean: number; sd: number; topShare: number; top10Share: number } => {
  const NB = 8; const per = Math.floor(NLOC / NB); const bs: number[] = [];
  for (let b = 0; b < NB; b += 1) {
    let acc = 0;
    for (let i = b * per; i < (b + 1) * per; i += 1) { const h = hst[i]; if (h > 0) acc += (2 / (h * h)) * jj[i]; }
    bs.push((domain * acc) / per);
  }
  const m = bs.reduce((a, x) => a + x, 0) / NB;
  const sd = Math.sqrt(bs.reduce((a, x) => a + (x - m) * (x - m), 0) / (NB - 1)) / Math.sqrt(NB);
  const contrib: number[] = [];
  let tot = 0;
  for (let i = 0; i < NLOC; i += 1) { const h = hst[i]; if (h > 0) { const c = (2 / (h * h)) * jj[i]; contrib.push(c); tot += c; } }
  contrib.sort((a, b) => b - a);
  return { mean: m, sd, topShare: tot > 0 ? contrib[0] / tot : 0, top10Share: tot > 0 ? contrib.slice(0, 10).reduce((a, x) => a + x, 0) / tot : 0 };
};
const jkHi = blockStats(hStarHi); const jkLo = blockStats(hStarLo);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   THE BILL — TRIANGLES NEEDED, MEASURED (integral of 2/h*^2 dA over the analytic band)');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`   bar 0.01  mm:  ${bHi.n.toExponential(4)} triangles   ( ${(bHi.n / M.nTri).toFixed(2)}x the shipping mesh's ${M.nTri} )`);
log(`   bar 0.001 mm:  ${bLo.n.toExponential(4)} triangles   ( ${(bLo.n / M.nTri).toFixed(2)}x the shipping mesh )`);
log(`   MEASURED GLOBAL EXPONENT  log10(N_0.001 / N_0.01) = ${(Math.log10(bLo.n / bHi.n)).toFixed(4)}`);
log(`      1.000 => the textbook h^2 law (10x triangles per decade of tolerance)`);
log(`      2.000 => an h^1 law (100x triangles per decade)`);
log(`   surface area that NO h on the ladder (down to ${HMIN} mm) can bring under the bar:`);
log(`      0.01 mm bar:  ${bHi.nFloorArea.toFixed(4)} mm2 = ${((bHi.nFloorArea / bandArea) * 100).toFixed(5)}% of the band`);
log(`      0.001 mm bar: ${bLo.nFloorArea.toFixed(4)} mm2 = ${((bLo.nFloorArea / bandArea) * 100).toFixed(5)}% of the band`);
log('   *** Those locations are EXCLUDED from the integrals above, so both counts are LOWER BOUNDS. ***');
log('');
log('── ESTIMATOR CONVERGENCE (8-block jackknife; the integrand 2/h*^2 is heavy-tailed near creases) ──');
log(`   0.01 mm:   ${jkHi.mean.toExponential(4)} +/- ${jkHi.sd.toExponential(3)}  (${((jkHi.sd / jkHi.mean) * 100).toFixed(2)}%)   largest single sample = ${(jkHi.topShare * 100).toFixed(3)}% of the integral, top 10 = ${(jkHi.top10Share * 100).toFixed(3)}%`);
log(`   0.001 mm:  ${jkLo.mean.toExponential(4)} +/- ${jkLo.sd.toExponential(3)}  (${((jkLo.sd / jkLo.mean) * 100).toFixed(2)}%)   largest single sample = ${(jkLo.topShare * 100).toFixed(3)}% of the integral, top 10 = ${(jkLo.top10Share * 100).toFixed(3)}%`);
log('   READ: if the top-10 share is more than a few percent, the integral is dominated by a handful of');
log('   near-crease samples and the count is an ORDER OF MAGNITUDE, not a figure. Reported either way.');
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE PRODUCTION FLOORS. Measured h* against the constants the SHIPPING generator actually enforces.
// ParametricExportComputer.ts: CAD_SAG_MM 0.003, qMinEdge = min(0.2, max(0.04, profileSag*2)) — a HARD
// lower bound on any emitted edge — CAD_MAX_LEVEL 16, CAD_BUDGET_TRIS 16,000,000.
// If a non-trivial share of the surface needs h below qMinEdge, that share is UNREACHABLE on the
// current representation no matter what tolerance the user types, because the quadtree stops there.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const thresholds = [0.2, 0.04, 0.01, 0.002, HMIN];
  const lbl = ['0.2   (qMinEdge, loose profiles)', '0.04  (qMinEdge, CAD profile)', '0.01', '0.002', `${HMIN} (ladder floor)`];
  log('── AREA THAT NEEDS AN EDGE SHORTER THAN THE SHIPPING GENERATOR CAN EMIT ──');
  log('   h threshold                          area needing h < thr @0.01     @0.001');
  for (let ti = 0; ti < thresholds.length; ti += 1) {
    const T = thresholds[ti];
    let aH = 0; let aL = 0; let aTot = 0;
    for (let i = 0; i < NLOC; i += 1) {
      aTot += jj[i];
      if (hStarHi[i] <= 0 || hStarHi[i] < T) aH += jj[i];
      if (hStarLo[i] <= 0 || hStarLo[i] < T) aL += jj[i];
    }
    log(`   ${lbl[ti].padEnd(36)} ${((aH / aTot) * 100).toFixed(5).padStart(12)}%  ${((aL / aTot) * 100).toFixed(5).padStart(12)}%`);
  }
  log('   (qMinEdge is a HARD clamp in MetricSizingField: h = min(maxEdge, max(minEdge, sqrt(8 sag/kappa))).');
  log('    Area in the rows below it cannot be brought under the bar by asking for a tighter tolerance.)');
  log('');
  // what the shipping 16 M cap buys
  const CAP = 16e6;
  const capH = Math.sqrt((2 * bandArea) / CAP);
  log(`   SHIPPING TRIANGLE CAP CAD_BUDGET_TRIS = 1.6e7. Spread uniformly over ${bandArea.toFixed(0)} mm2 that is`);
  log(`   a mean edge of ${capH.toFixed(4)} mm. Fraction of the surface whose h* is BELOW that (i.e. that the cap`);
  log(`   under-resolves even with a perfect sizing field):`);
  for (const [nm, hst] of [['0.01 mm', hStarHi], ['0.001 mm', hStarLo]] as Array<[string, Float64Array]>) {
    let a = 0; let t = 0;
    for (let i = 0; i < NLOC; i += 1) { t += jj[i]; if (hst[i] <= 0 || hst[i] < capH) a += jj[i]; }
    log(`      at ${nm}: ${((a / t) * 100).toFixed(4)}% of the band area`);
  }
  log('');
}

// ── memory / cap check ──
const caps = (n: number, label: string): void => {
  const verts = n / 2;             // a manifold triangulation has ~V = T/2
  log(`   ${label}:  T=${n.toExponential(4)}  V~${verts.toExponential(4)}`);
  log(`      binary STL (50 B/tri):            ${((n * 50) / 1e9).toFixed(3)} GB`);
  log(`      indexed f32 pos + u32 idx (24 B/tri + 12 B/vert): ${((n * 24 + verts * 12) / 1e9).toFixed(3)} GB`);
  log(`      WebGPU index budget @ ~48 B/tri:  ${((n * 48) / 1e9).toFixed(3)} GB`);
  log(`      Node Map cap 2^23 = ${(Math.pow(2, 23)).toExponential(3)} entries: ${verts > Math.pow(2, 23) ? `EXCEEDED ${(verts / Math.pow(2, 23)).toFixed(1)}x` : 'ok'}`);
  log(`      facetDihedrals 2^26 vertex edge-key packing = ${(Math.pow(2, 26)).toExponential(3)}: ${verts > Math.pow(2, 26) ? `EXCEEDED ${(verts / Math.pow(2, 26)).toFixed(1)}x` : 'ok'}`);
  log(`      u32 index space 2^32: ${verts > Math.pow(2, 32) ? `EXCEEDED ${(verts / Math.pow(2, 32)).toFixed(1)}x` : 'ok'}`);
};
log('── MEMORY AND CAPS ──');
caps(M.nTri, 'shipping mesh   ');
caps(bHi.n, 'at 0.01 mm      ');
caps(bLo.n, 'at 0.001 mm     ');
log('');

writeFileSync(`${OUTDIR}/S116_LADDER_${TAG}.json`, JSON.stringify({
  style: STYLE, nTriShip: M.nTri, meshArea, bandArea, zLo, zHi, NLOC, K, HMIN, HMAX,
  nHi: bHi.n, nLo: bLo.n, floorAreaHi: bHi.nFloorArea, floorAreaLo: bLo.nFloorArea,
  floorHi, floorLo, exponent: Math.log10(bLo.n / bHi.n),
}, null, 2));
log(`json -> ${OUTDIR}/S116_LADDER_${TAG}.json`);
log('S116 PART 2 DONE');

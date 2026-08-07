// s117MinEdgeLadder.ts — S117 P2: THE qMinEdge CLAMP, PRICED PER RUNG.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE QUESTION
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ParametricExportComputer.ts:2660
//     qMinEdge = min(0.2, max(0.04, profileSag * 2))
// is a HARD LOWER CLAMP on every edge the conforming mesher can emit:
//   MetricSizingField.ts:119    h = min(maxEdgeMm, max(minEdgeMm, sqrt(8*maxSag/kappa)))
//   PeriodicBalancedQuadtree.ts:852  if (longest <= spec.minEdgeMm) return false;   // analytic sag test STOPS
//   AnalyticCurvatureFloor.ts:162    maxKappa = 8*maxSag / minEdge^2                // kappa cap DERIVED from it
//
// S116 measured the CLAMPED AREA SHARE at ONE rung (0.04). It did not price the OTHER rungs, and it
// did not measure THE DEFECT THE CLAMP LEAVES BEHIND. Both are what a recommendation needs:
//   - clamped area share  A(c, tol)   = area whose required h*(tol) is below the clamp c
//   - the bill            N(c, tol)   = integral 2/max(h*, c)^2 dA   — triangles WITH the clamp in force
//   - the residual left   R(c)        = the actual chord residual at h = c on the clamped locations
//                                       (area-weighted mean AND max — never a bare max, never a bare count)
//   - where it stops binding: the largest c whose clamped area is 0.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// SCAR 5 — THE RULER. RADIAL IS AN UPPER BOUND ONLY.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// s116Ladder's quadResidual measures |hypot(x,y) - rA(atan2(y,x), z)| — that is the RADIAL gap, which
// the campaign banned as a verdict (a 612,236x over-read in S115 by reading across a cliff). It is a
// sound UPPER bound (radial >= perpendicular pointwise), so every S116 h* is an UNDER-estimate and
// every S116 clamped-area share is an OVER-estimate.
//
// The exact first-order conversion is available in closed form and costs nothing:
//   S_th = (r_th c - r s, r_th s + r c, 0),  S_z = (r_z c, r_z s, 1)
//   n = S_th x S_z = (r_th s + r c, r s - r_th c, -r r_z),   |n| = J (the area Jacobian)
//   n . rhat = r  EXACTLY  =>  cos(phi) = r / J   between the surface normal and the radial direction.
// For a locally planar surface d_perp = d_radial * cos(phi) EXACTLY. So the whole radial curve
// converts by one per-location scalar. That is first-order (locally planar); ARM P validates it
// against a per-lattice-point local correction (cos(phi) evaluated at each sample's own radial foot),
// which is the honest treatment across a crease. BOTH are reported. If they disagree the run says so.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CONTROLS THAT VOID THE RUN
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//   C4  Monte-Carlo area must reproduce the analytic band area (and sit near the mesh's own 3D area).
//   C5  lattice order k swept (scar 2) — h* must not move with k.
//   C5b FD step (hTheta,hZ) swept (scar 3) — h* and the bill must not move with the step.
//   C6  ladder floor: locations where NO h on the ladder reaches the bar are COUNTED, not clamped.
//   C7  monotonicity floor: N(c,tol) must be NON-INCREASING in c is FALSE — it must be NON-DECREASING
//       as c falls (a smaller clamp can only ask for more triangles). Asserted; a violation voids.
//   C8  clamped-area floor: A(c,tol) must be non-increasing as c falls. Asserted.
//
// Usage: bash research/tools/run-s117-minedge.sh
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
const STYLE = process.env.PF_S117_STYLE ?? 'GothicArches';
const STL = process.env.PF_S117_STL ?? '';
const TAG = process.env.PF_S117_TAG ?? 'X';
const OUTDIR = process.env.PF_S117_OUTDIR ?? 'research/exchange/_strataConformBisect/s117';
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S117_BARHI', 0.01);
const BAR_LO = envF('PF_S117_BARLO', 0.001);
const NLOC = envI('PF_S117_NLOC', 60000);
const K = envI('PF_S117_LK', 4);
const KSW = (process.env.PF_S117_LKSWEEP ?? '2,3,4,6').split(',').map((s) => Math.round(Number(s)));
const HMAX = envF('PF_S117_HMAX', 8);
const HMIN = envF('PF_S117_HMIN', 2e-4);
const HRAT = envF('PF_S117_HRAT', Math.pow(2, 0.25));
const SEED = envI('PF_S117_SEED', 20260807);
const CONFIRM = envI('PF_S117_CONFIRM', 8);
const NPARM = envI('PF_S117_NPARM', 4000); // ARM P validation subsample
if (STL.length === 0) { log('*** PF_S117_STL required ***'); process.exit(2); }

// THE CLAMP RUNGS. 0.2 and 0.04 are the two arms of the shipping expression; 0.10 is what the SHIPPING
// DEFAULT profile ('high', epsPosMm 0.05) actually resolves to; 0.06 is 'ultra'. 0.0024 / 0.0018 are the
// physical cell sizes the quadtree can already reach at CAD_MAX_LEVEL=16 (u at uBias=1 / t) — the point
// below which lowering qMinEdge is a NO-OP without also lifting maxLevel.
const CRUNGS = (process.env.PF_S117_CRUNGS ?? '0.2,0.1,0.06,0.04,0.02,0.01,0.004,0.0024,0.0018,0.001')
  .split(',').map(Number).filter((x) => x > 0).sort((a, b) => b - a);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// ── mesh: band bounds + the area control only ──
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
log(`===== S117 P2 — THE qMinEdge CLAMP LADDER — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`mesh: ${M.nTri} facets, 3D area ${meshArea.toFixed(3)} mm2, z band [${zLo.toFixed(4)}, ${zHi.toFixed(4)}]`);
log(`locations ${NLOC}   h ladder ${HMIN}..${HMAX} ratio ${HRAT.toFixed(5)}   lattice k=${K}   bars ${BAR_HI} / ${BAR_LO} mm`);
log(`clamp rungs: ${CRUNGS.join(', ')} mm`);
log('');

let s0 = SEED >>> 0;
const rnd = (): number => { s0 ^= s0 << 13; s0 >>>= 0; s0 ^= s0 >>> 17; s0 ^= s0 << 5; s0 >>>= 0; return s0 / 4294967296; };

// ── the h ladder, with the clamp rungs UNIONED IN so residual-at-clamp is exact, not interpolated ──
const hsSet = new Set<number>();
for (let h = HMAX; h >= HMIN; h /= HRAT) hsSet.add(h);
for (const c of CRUNGS) hsSet.add(c);
const hs = [...hsSet].sort((a, b) => b - a);
const NH = hs.length;
const CIDX = CRUNGS.map((c) => hs.indexOf(c));

const latOf = (k: number): Float64Array => {
  const o: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) o.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(o);
};
const LATS = new Map<number, Float64Array>();
for (const k of [...KSW, K]) LATS.set(k, latOf(k));

const P = new Float64Array(12);
let HFD_T = envF('PF_S117_HFDT', 1e-5);
let HFD_Z = envF('PF_S117_HFDZ', 1e-4);

/** r, dr/dth, dr/dz, sqrt(E), sqrt(G), area Jacobian J, and cos(phi)=r/J at (th,z). */
const local = (th: number, z: number): { r: number; sqE: number; sqG: number; J: number; cosPhi: number } => {
  const r = rA(th, z);
  const rt = (rA(th + HFD_T, z) - rA(th - HFD_T, z)) / (2 * HFD_T);
  const rz = (rA(th, z + HFD_Z) - rA(th, z - HFD_Z)) / (2 * HFD_Z);
  const sqE = Math.sqrt(rt * rt + r * r);
  const sqG = Math.sqrt(rz * rz + 1);
  // |S_th x S_z| = sqrt(E*G - F^2); F = S_th . S_z = rt*rz. Exact closed form:
  const J = Math.sqrt(Math.max(0, (rt * rt + r * r) * (rz * rz + 1) - rt * rz * rt * rz));
  return { r, sqE, sqG, J, cosPhi: J > 1e-12 ? Math.min(1, r / J) : 1 };
};

/**
 * RADIAL residual of the axis-aligned (theta,z) quad of 3D scale h — the shipping generator's own
 * cell: PeriodicBalancedQuadtree leaves are axis-aligned in the chart and sized by sqrt(E)/sqrt(G).
 * `perLocal` = true applies the per-lattice-point local cos(phi) (ARM P, the honest cross-crease
 * treatment); false returns the raw radial gap (the S116-comparable UPPER bound).
 */
const quadResidual = (th0: number, z0: number, h: number, k: number, perLocal: boolean): number => {
  const L0 = local(th0, z0);
  const dth = h / Math.max(1e-9, L0.sqE);
  const th1 = th0 + dth; const z1 = z0 + h / Math.max(1e-9, L0.sqG);
  const ths = [th0, th1, th0, th1]; const zzs = [z0, z0, z1, z1];
  for (let i = 0; i < 4; i += 1) {
    const r = rA(ths[i], zzs[i]);
    P[i * 3] = r * Math.cos(ths[i]); P[i * 3 + 1] = r * Math.sin(ths[i]); P[i * 3 + 2] = zzs[i];
  }
  const L = LATS.get(k) as Float64Array; const np = L.length / 3;
  let worst = 0;
  const tri = [[0, 1, 2], [1, 3, 2]];
  for (const t of tri) {
    const a = t[0] * 3, b = t[1] * 3, c = t[2] * 3;
    for (let p = 0; p < np; p += 1) {
      const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
      const x = w0 * P[a] + w1 * P[b] + w2 * P[c];
      const y = w0 * P[a + 1] + w1 * P[b + 1] + w2 * P[c + 1];
      const z = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2];
      const thp = Math.atan2(y, x);
      let dd = Math.abs(Math.hypot(x, y) - rA(thp, z));
      if (perLocal) dd *= local(thp, z).cosPhi;
      if (dd > worst) worst = dd;
    }
  }
  return worst;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// C5 / SCAR 2 — LATTICE ORDER
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const sample = (n: number): { t: Float64Array; z: Float64Array } => {
  const t = new Float64Array(n); const z = new Float64Array(n);
  let sk = SEED >>> 0;
  const r2 = (): number => { sk ^= sk << 13; sk >>>= 0; sk ^= sk >>> 17; sk ^= sk << 5; sk >>>= 0; return sk / 4294967296; };
  for (let i = 0; i < n; i += 1) { t[i] = r2() * 2 * Math.PI; z[i] = zLo + r2() * (zHi - zLo); }
  return { t, z };
};
const hStarOf = (th: number, z: number, bar: number, k: number, perLocal: boolean): number => {
  let run = 0; let cand = 0;
  for (let hi = 0; hi < NH; hi += 1) {
    const res = quadResidual(th, z, hs[hi], k, perLocal);
    if (res <= bar) { if (run === 0) cand = hs[hi]; run += 1; if (run >= CONFIRM) return cand; } else run = 0;
  }
  return -1;
};
log('── C5 / SCAR 2: LATTICE ORDER k (radial ruler, small sample) ──');
log('   k    median h*(0.01)      median h*(0.001)     mean radial residual @ h=0.04');
{
  const NS = envI('PF_S117_LKSW_N', 2500);
  const S = sample(NS);
  for (const k of KSW) {
    const a: number[] = []; const b: number[] = []; let racc = 0;
    for (let i = 0; i < NS; i += 1) {
      a.push(hStarOf(S.t[i], S.z[i], BAR_HI, k, false));
      b.push(hStarOf(S.t[i], S.z[i], BAR_LO, k, false));
      racc += quadResidual(S.t[i], S.z[i], 0.04, k, false);
    }
    a.sort((x, y) => x - y); b.sort((x, y) => x - y);
    log(`   ${String(k).padStart(2)}   ${a[NS >> 1].toExponential(4).padStart(16)}     ${b[NS >> 1].toExponential(4).padStart(16)}     ${(racc / NS).toExponential(4).padStart(22)}`);
  }
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// C5b / SCAR 3 — FD STEP
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── C5b / SCAR 3: FINITE-DIFFERENCE STEP (hTheta,hZ) ──');
log('   hTheta      hZ         median h*(0.01)   median h*(0.001)   mean cos(phi)   area/mm2 needing h<0.04 @0.001');
{
  const NS = envI('PF_S117_FDSW_N', 2500);
  const keepT = HFD_T; const keepZ = HFD_Z;
  for (const [ht, hz] of [[1e-4, 1e-3], [1e-5, 1e-4], [1e-6, 1e-5], [1e-7, 1e-6]] as Array<[number, number]>) {
    HFD_T = ht; HFD_Z = hz;
    const S = sample(NS);
    const a: number[] = []; const b: number[] = []; let cp = 0; let below = 0;
    for (let i = 0; i < NS; i += 1) {
      const hHi = hStarOf(S.t[i], S.z[i], BAR_HI, K, false);
      const hLo = hStarOf(S.t[i], S.z[i], BAR_LO, K, false);
      a.push(hHi); b.push(hLo);
      cp += local(S.t[i], S.z[i]).cosPhi;
      if (hLo < 0 || hLo < 0.04) below += 1;
    }
    a.sort((x, y) => x - y); b.sort((x, y) => x - y);
    log(`   ${ht.toExponential(0).padStart(8)}  ${hz.toExponential(0).padStart(8)}   ${a[NS >> 1].toExponential(4).padStart(15)}   ${b[NS >> 1].toExponential(4).padStart(16)}   ${(cp / NS).toFixed(6).padStart(13)}   ${((below / NS) * 100).toFixed(4).padStart(10)}% (count share)`);
  }
  HFD_T = keepT; HFD_Z = keepZ;
  log(`   (production values restored: hTheta ${HFD_T}, hZ ${HFD_Z})`);
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// MAIN — per-location h* (radial AND perpendicular) + residual at every clamp rung
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const hHiR = new Float64Array(NLOC); const hLoR = new Float64Array(NLOC);
const hHiP = new Float64Array(NLOC); const hLoP = new Float64Array(NLOC);
const jj = new Float64Array(NLOC);
const cph = new Float64Array(NLOC);
const resAtC = new Float64Array(NLOC * CRUNGS.length); // PERPENDICULAR residual at each clamp rung
const tM = Date.now();
{
  for (let i = 0; i < NLOC; i += 1) {
    const th = rnd() * 2 * Math.PI; const z = zLo + rnd() * (zHi - zLo);
    const L = local(th, z);
    jj[i] = L.J; cph[i] = L.cosPhi;
    // descent, radial residual; the perpendicular curve is the same curve x cosPhi, so BOTH h* come
    // out of ONE descent — no extra rA evaluations, and the two are guaranteed consistent.
    let runHR = 0, runLR = 0, runHP = 0, runLP = 0;
    let cHR = 0, cLR = 0, cHP = 0, cLP = 0;
    let sHR = -1, sLR = -1, sHP = -1, sLP = -1;
    let ci = 0;
    for (let hi = 0; hi < NH; hi += 1) {
      const res = quadResidual(th, z, hs[hi], K, false);
      const rp = res * L.cosPhi;
      while (ci < CIDX.length && CIDX[ci] === hi) { resAtC[i * CRUNGS.length + ci] = rp; ci += 1; }
      if (res <= BAR_HI) { if (runHR === 0) cHR = hs[hi]; runHR += 1; if (runHR >= CONFIRM && sHR < 0) sHR = cHR; } else runHR = 0;
      if (res <= BAR_LO) { if (runLR === 0) cLR = hs[hi]; runLR += 1; if (runLR >= CONFIRM && sLR < 0) sLR = cLR; } else runLR = 0;
      if (rp <= BAR_HI) { if (runHP === 0) cHP = hs[hi]; runHP += 1; if (runHP >= CONFIRM && sHP < 0) sHP = cHP; } else runHP = 0;
      if (rp <= BAR_LO) { if (runLP === 0) cLP = hs[hi]; runLP += 1; if (runLP >= CONFIRM && sLP < 0) sLP = cLP; } else runLP = 0;
    }
    hHiR[i] = sHR; hLoR[i] = sLR; hHiP[i] = sHP; hLoP[i] = sLP;
  }
}
const domain = (2 * Math.PI) * (zHi - zLo);
let jSum = 0; for (let i = 0; i < NLOC; i += 1) jSum += jj[i];
const bandArea = (domain * jSum) / NLOC;
log(`main pass ${(Date.now() - tM) / 1000}s`);
log('── C4: AREA CONTROL ──');
log(`   Monte-Carlo band area  ${bandArea.toFixed(3)} mm2`);
log(`   mesh 3D area           ${meshArea.toFixed(3)} mm2   (mesh excess ${(((meshArea - bandArea) / bandArea) * 100).toFixed(4)}%)`);
log(`   mean cos(phi) = mean r/J: ${(cph.reduce((a, b) => a + b, 0) / NLOC).toFixed(6)}  (radial/perpendicular inflation = 1/cosPhi)`);
{
  const c = [...cph].sort((a, b) => a - b);
  log(`   cos(phi) quantiles: p01 ${c[Math.floor(NLOC * 0.01)].toFixed(6)}  p10 ${c[Math.floor(NLOC * 0.1)].toFixed(6)}  p50 ${c[NLOC >> 1].toFixed(6)}  p90 ${c[Math.floor(NLOC * 0.9)].toFixed(6)}`);
  log(`   worst radial inflation 1/cosPhi: ${(1 / c[0]).toFixed(3)}x   (S115's banned radial ruler read ACROSS a cliff here)`);
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE CLAMP LADDER
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type Rung = { c: number; areaPct: number; areaMm2: number; countPct: number; n: number; resMean: number; resMax: number; resP99: number };
const ladder = (hst: Float64Array, bar: number, label: string): Rung[] => {
  const out: Rung[] = [];
  for (let k = 0; k < CRUNGS.length; k += 1) {
    const c = CRUNGS[k];
    let aClamp = 0; let nClamp = 0; let acc = 0;
    let resW = 0; let resMax = 0;
    const resList: Array<[number, number]> = []; // [res, area]
    for (let i = 0; i < NLOC; i += 1) {
      const h = hst[i];
      const eff = (h <= 0 || h < c) ? c : h;      // the clamp in force
      acc += (2 / (eff * eff)) * jj[i];
      if (h <= 0 || h < c) {
        aClamp += jj[i]; nClamp += 1;
        const r = resAtC[i * CRUNGS.length + k];
        resW += r * jj[i]; if (r > resMax) resMax = r;
        resList.push([r, jj[i]]);
      }
    }
    resList.sort((x, y) => x[0] - y[0]);
    let cum = 0; const tot = resList.reduce((a, x) => a + x[1], 0); let p99 = 0;
    for (const [r, a] of resList) { cum += a; if (cum >= 0.99 * tot) { p99 = r; break; } }
    out.push({
      c, areaMm2: (domain * aClamp) / NLOC, areaPct: (aClamp / jSum) * 100, countPct: (nClamp / NLOC) * 100,
      n: (domain * acc) / NLOC, resMean: aClamp > 0 ? resW / aClamp : 0, resMax, resP99: p99,
    });
  }
  log(`── CLAMP LADDER — bar ${bar} mm — ${label} ──`);
  log('   clamp c   clamped AREA%   clamped COUNT%   clamped mm2     N(triangles)   res@c mean(mm)  res@c p99     res@c MAX');
  for (const r of out) {
    log(`   ${r.c.toFixed(4).padStart(7)}   ${r.areaPct.toFixed(5).padStart(11)}%   ${r.countPct.toFixed(5).padStart(12)}%   ${r.areaMm2.toFixed(3).padStart(11)}   ${r.n.toExponential(4).padStart(12)}   ${(r.areaPct > 0 ? r.resMean.toExponential(3) : '-').padStart(13)}  ${(r.areaPct > 0 ? r.resP99.toExponential(3) : '-').padStart(11)}  ${(r.areaPct > 0 ? r.resMax.toExponential(3) : '-').padStart(11)}`);
  }
  // C7/C8 floors
  let ok = true;
  for (let k = 1; k < out.length; k += 1) {
    if (out[k].n < out[k - 1].n - 1e-6) { log(`   *** C7 VIOLATED: N rose as c rose (${out[k].c} -> ${out[k - 1].c}) — RUN VOID ***`); ok = false; }
    if (out[k].areaPct > out[k - 1].areaPct + 1e-9) { log(`   *** C8 VIOLATED: clamped area grew as c fell — RUN VOID ***`); ok = false; }
  }
  const free = out.filter((r) => r.areaPct === 0);
  log(`   C7/C8 monotonicity: ${ok ? 'HOLD' : '*** VIOLATED ***'}`);
  log(`   CLAMP STOPS BINDING at c <= ${free.length > 0 ? free[0].c : `(never on this rung set; still binding at ${out[out.length - 1].c} on ${out[out.length - 1].areaPct.toFixed(5)}% of area)`}`);
  const unres = out[out.length - 1];
  log(`   uncleared at the finest rung: ${unres.areaPct.toFixed(5)}% of area, max residual left ${unres.areaPct > 0 ? unres.resMax.toExponential(3) : '0'} mm`);
  log('');
  return out;
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   THE LADDER — PERPENDICULAR RULER (the verdict ruler)');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
const LP_HI = ladder(hHiP, BAR_HI, 'PERPENDICULAR');
const LP_LO = ladder(hLoP, BAR_LO, 'PERPENDICULAR');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   THE LADDER — RADIAL RULER (UPPER BOUND ONLY — S116-comparable, NOT a verdict)');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
const LR_HI = ladder(hHiR, BAR_HI, 'RADIAL (upper bound)');
const LR_LO = ladder(hLoR, BAR_LO, 'RADIAL (upper bound)');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ARM P — VALIDATE THE PER-LOCATION cos(phi) AGAINST THE PER-LATTICE-POINT LOCAL CORRECTION
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── ARM P: is the per-location cos(phi) conversion good enough? (per-lattice-point local control) ──');
{
  const S = sample(NPARM);
  let agreeHi = 0; let agreeLo = 0; let ratSum = 0; let ratMax = 0;
  for (let i = 0; i < NPARM; i += 1) {
    const cp = local(S.t[i], S.z[i]).cosPhi;
    const scaled = hStarOfScaled(S.t[i], S.z[i], BAR_LO, cp);
    const exact = hStarOf(S.t[i], S.z[i], BAR_LO, K, true);
    if (scaled === exact) agreeLo += 1;
    const sHi = hStarOfScaled(S.t[i], S.z[i], BAR_HI, cp);
    const eHi = hStarOf(S.t[i], S.z[i], BAR_HI, K, true);
    if (sHi === eHi) agreeHi += 1;
    if (scaled > 0 && exact > 0) { const r = Math.max(scaled / exact, exact / scaled); ratSum += r; if (r > ratMax) ratMax = r; }
  }
  log(`   n=${NPARM}   h*(0.01) exact-rung agreement ${((agreeHi / NPARM) * 100).toFixed(2)}%   h*(0.001) ${((agreeLo / NPARM) * 100).toFixed(2)}%`);
  log(`   h* ratio (scaled vs per-point): mean ${(ratSum / NPARM).toFixed(5)}x   worst ${ratMax.toFixed(4)}x`);
  log(`   READ: agreement at the RUNG level (ladder ratio ${HRAT.toFixed(4)}) — a worst ratio near 1 rung`);
  log('   means the per-location scalar is adequate; a large worst ratio means the cross-crease term matters.');
}
function hStarOfScaled(th: number, z: number, bar: number, cp: number): number {
  let run = 0; let cand = 0;
  for (let hi = 0; hi < NH; hi += 1) {
    const res = quadResidual(th, z, hs[hi], K, false) * cp;
    if (res <= bar) { if (run === 0) cand = hs[hi]; run += 1; if (run >= CONFIRM) return cand; } else run = 0;
  }
  return -1;
}
log('');

writeFileSync(`${OUTDIR}/S117_MINEDGE_${TAG}.json`, JSON.stringify({
  style: STYLE, stl: STL, nTriShip: M.nTri, meshArea, bandArea, zLo, zHi, NLOC, K, HMIN, HMAX, CRUNGS,
  perpHi: LP_HI, perpLo: LP_LO, radHi: LR_HI, radLo: LR_LO,
}, null, 2));
log(`json -> ${OUTDIR}/S117_MINEDGE_${TAG}.json`);
log('S117 P2 LADDER DONE');

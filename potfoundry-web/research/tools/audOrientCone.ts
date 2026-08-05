// audOrientCone.ts — AUDIT OF THE ORIENTATION FINDING (S53/S58 `tangExc`). ADVERSARIAL BY DESIGN.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE CLAIM UNDER ATTACK (S50_RULER_FINDINGS SECTION 14)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//   "Voronoi 39.696% of 806,765 facets over a 10 um bar on tangExc (p99 1222.82 um, max 2346.7 um)
//    while the position ruler reports LITERALLY ZERO facets over the same bar."
//   tangExc := sin(normDeg) * facetDiameter, normDeg := angle(facet normal, ANALYTIC surface normal
//   at the facet's PARAMETRIC CENTROID), single central-difference normal, per-facet outward flip
//   against rhat.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// WHY IT IS SUSPECT — the family has a demonstrated failure mode
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// `research/bridge/_judgeNormal.facetNormalCensus` is this repo's EXISTING, CORRECTED facet-normal
// instrument. It was given THREE corrections in July that s53/s58 do not have:
//   (C1) FIVE candidate analytic normals (central + both one-sided differences in each of th and z),
//        MINIMUM deviation taken — so a facet at a crease is judged against the most favourable
//        admissible flank rather than against a central difference that smears across the crease.
//   (C2) THE FOOTPRINT TEST — a facet that SPANS a feature is not judged at its centroid alone. The
//        header records the measurement that forced it: the centroid-only >=90 deg population GROWS
//        with refinement (1,792 @61k tris -> 14,890 @351k) because it is a 1-D locus population ~1/h.
//        `nFeatureSpanBack` is REPORTED, NEVER GATED.
//   (C3) a GLOBAL winding sign from a stride sample, not a per-facet `n . rhat < 0` flip. The header
//        names the per-facet proxy explicitly as unsound on relief: "rhat is the surface normal ONLY
//        where r_theta = r_z = 0 ... the proxy both misses inverted facets on steep flanks and can
//        flag correct ones."
// s49BackFacing was ALREADY caught tonight re-deriving this same instrument minus (C2): 59% of its
// count was `featureSpan`. s53/s58 re-derive it minus (C1), (C2) AND (C3).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED HYPOTHESES AND KILL-CRITERIA — WRITTEN BEFORE THE FIRST RUN
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// H-A (FOOTPRINT / DOUBLE-COUNT). `normDeg` at the centroid double-counts a legitimate chord the same
//     way `featureSpan` did. A facet spanning a crease or a steep wall is REQUIRED to have a normal
//     unequal to the surface normal at any single interior point; the honest excess is the angular
//     distance from the facet normal to the surface's NORMAL CONE over the facet's own footprint,
//     i.e. min over the footprint, not the value at one point.
//     MEASURE: `tangCone` = sin(min over a 15-point barycentric footprint of the 5-candidate
//     deviation) * diam, on the SAME facets.
//     KILL: if Voronoi's over-10um fraction on `tangCone` is >= 0.8 x 39.696% (>= 31.76%), H-A is
//     REFUTED and the finding SURVIVES this attack. If it is < 0.5 x (< 19.85%), the finding is
//     WEAKENED-to-REFUTED as a re-derivation without correction (C1)/(C2).
//
// H-B (tangExc IS NOT THE LENGTH OF ANYTHING). `tangExc` is dimensionally a length but it is a
//     FORMULA, sin(angle) x diameter, not a measured displacement. If the facet's vertices are on the
//     surface and the facet is a near-degenerate cap, its normal is ill-conditioned while NOTHING on
//     the mesh is displaced by 1.2 mm. The product bar (0.01 mm true-3D) is a POSITION bar.
//     MEASURE: for the top-K facets by `tangExc`, the max over a dense barycentric lattice of
//     distRadial (which is a pointwise UPPER BOUND on the true perpendicular distance, so a small
//     value PROVES a small position error) and distPerp at the lattice argmax.
//     KILL: if p50 over the top-K of (trueMaxPerp / tangExc) >= 0.25, the defect is REAL AND
//     POSITIONAL — H-B REFUTED, and the correct reading is that the PLANE ruler is the broken
//     instrument, not that orientation is a new class. If that ratio is < 0.05 AND the p50 of
//     trueMaxRadialUpperBound is < 10 um, then the mesh is INSIDE the product bar in position at
//     exactly the facets the orientation ruler condemns: H-B CONFIRMED, the 39.7% is not a
//     product-relevant defect count.
//
// H-C (THE TWO BARS ARE NOT THE SAME BAR). On a smooth patch the linear interpolant's gradient error
//     is O(h*kappa) and the chord sag is O(h^2*kappa), so tangExc = sin(normDev)*diam = O(h^2*kappa)
//     is the SAME ORDER as the position error with a LARGER CONSTANT. If so, "39.7% over a 10 um
//     tangExc bar vs 0% over a 10 um position bar" is a statement about a constant, not about a class.
//     MEASURE: the distribution of tangExc / posUm over the whole sample, restricted to well-shaped
//     facets (maxAngle < 90 deg) where no straddle story applies.
//     KILL: if the ratio's p50 is in [3, 30] and its IQR spans less than one decade on ALL THREE
//     styles, H-C is CONFIRMED (tangExc is the position ruler times a constant on the bulk).
//
// H-D (THE FLIP). The per-facet `n . rhat < 0` outward flip is a coin toss for a facet whose normal
//     is nearly TANGENTIAL (a steep crease wall — exactly Voronoi's population). A wrong flip turns a
//     deviation x into 180-x. NOTE IN ADVANCE: sin(180-x) = sin(x), so this CANNOT change `tangExc`;
//     it can only change `normDeg` and the "back-facing / pointing into the solid" narrative.
//     MEASURE: normDeg under the per-facet flip vs under the mesh's own consistent winding + one
//     global sign (the `_judgeNormal` convention).
//     KILL: if the >=90 deg population is >= 5x smaller under the global-sign convention, the
//     "back-facing" reading of the >=90 deg tail is an artefact of the flip.
//
// NOTHING HERE MEASURES WHETHER A NORMAL DEFECT MATTERS TO THE PRINTED PART. That is a separate
// question and it is NOT answered by this tool. What this tool answers is whether the NUMBER is what
// it says it is.
//
// Usage:  bash research/tools/run-aud-orient-cone.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { distRadial, distPerp } from '../bridge/_facetTruthLib';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NS = Math.round(envF('PF_AUD_N', 250000));
const TOPK = Math.round(envF('PF_AUD_TOPK', 1500));
const LATN = Math.round(envF('PF_AUD_LATN', 24));
const GATE = envF('PF_AUD_GATE_MM', 0.05);
const BAR = envF('PF_AUD_BAR_UM', 10);
const OUT = 'research/exchange/_strataConformBisect/AUD_ORIENT_CONE.ndjson';
const JOBS: Array<[string, string]> = (process.env.PF_AUD_JOBS
  ?? 'Voronoi=voronoi_ring_D--,LowPolyFacet=lowpolyfacet_ring_D--,GothicArches=gothicarches_ring_DS-HT_S39CTL')
  .split(',').map((s) => { const [a, b] = s.split('='); return [a, b] as [string, string]; });

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
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const RAD = 180 / Math.PI;

log('===== AUD-ORIENT-CONE — adversarial audit of tangExc =====');
log(`N ${NS}  topK ${TOPK}  latticeN ${LATN}  bar ${BAR} um`);
log('');
mkdirSync('research/exchange/_strataConformBisect', { recursive: true });

for (const [style, stem] of JOBS) {
  const path = `research/exchange/_strataConformBisect/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`\n${style}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  const DIMS: StyleDims = { H: envF('PF_AUD_H', 120), Rb: envF('PF_AUD_RB', 40), Rt: envF('PF_AUD_RT', 50), expn: envF('PF_AUD_EXPN', 1) };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const t0 = Date.now();

  log(`\n═════════ ${style}  (${stem}, ${nTri} facets) ═════════`);

  // ── VALIDITY GATE (reproduces s58's, so a divergence here is not silently carried)
  const gres: number[] = [];
  const gstep = Math.max(1, Math.floor((nTri * 3) / 50000));
  for (let i = 0; i < nTri * 3; i += gstep) {
    const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
    gres.push(Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)));
  }
  gres.sort((a, b) => a - b);
  const gp99 = pq(gres, 0.99);
  log(`  GATE vertex-on-surface p50 ${pq(gres, 0.5).toFixed(5)} p99 ${gp99.toFixed(5)} max ${gres[gres.length - 1].toFixed(5)} mm -> ${gp99 <= GATE ? 'TRUSTED' : '*** UNTRUSTED ***'}`);

  // ── the FIVE-CANDIDATE analytic normal, exactly _judgeNormal.bestDot. Returns the MAX dot.
  const hTh = 1e-6; const hZ = 1e-6;
  const bestDot = (th: number, z: number, fx: number, fy: number, fz: number): number => {
    const zc = z < 0 ? 0 : z > H ? H : z;
    const r0 = rA(th, zc);
    const rTp = rA(th + hTh, zc); const rTm = rA(th - hTh, zc);
    const rZp = rA(th, zc + hZ); const rZm = rA(th, zc - hZ);
    const dtF = (rTp - r0) / hTh; const dtB = (r0 - rTm) / hTh; const dtC = (rTp - rTm) / (2 * hTh);
    const dzF = (rZp - r0) / hZ; const dzB = (r0 - rZm) / hZ; const dzC = (rZp - rZm) / (2 * hZ);
    const ct = Math.cos(th); const st = Math.sin(th);
    const cand: Array<[number, number]> = [[dtC, dzC], [dtF, dzF], [dtF, dzB], [dtB, dzF], [dtB, dzB]];
    let best = -1;
    for (const [rt, rz] of cand) {
      const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
      const nl = Math.hypot(nx, ny, nz);
      if (!(nl > 0)) continue;
      const d = (fx * nx + fy * ny + fz * nz) / nl;
      if (d > best) best = d;
    }
    return best;
  };

  // ── stride sample (same construction as s58 so the arms are comparable)
  const step = Math.max(1, Math.floor(nTri / NS));
  const n = Math.floor(nTri / step);
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  for (let k = 0; k < n; k += 1) {
    const o = (k * step) * 9;
    for (let v = 0; v < 3; v += 1) { vx[3 * k + v] = xyz[o + 3 * v]; vy[3 * k + v] = xyz[o + 3 * v + 1]; vz[3 * k + v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(vy[3 * k], vx[3 * k]);
    vth[3 * k] = thA;
    vth[3 * k + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 1], vx[3 * k + 1]));
    vth[3 * k + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 2], vx[3 * k + 2]));
    ta[k] = 3 * k; tb[k] = 3 * k + 1; tc[k] = 3 * k + 2;
  }
  const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy }; const ARG = makeSagArgmax();

  // ── H-D: the mesh's OWN winding sign, from a golden-ratio stride sample (the _judgeNormal convention)
  let windPos = 0; let windTot = 0;
  {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    let s = Math.max(1, Math.round(n * 0.6180339887498949) | 1);
    while (s > 1 && gcd(s, n) !== 1) s += 2;
    if (s >= n) s = 1;
    for (let q = 0; q < Math.min(n, 8192); q += 1) {
      const k = (q * s) % n;
      const ax = vx[3 * k]; const ay = vy[3 * k]; const az = vz[3 * k];
      const bx = vx[3 * k + 1]; const by = vy[3 * k + 1]; const bz = vz[3 * k + 1];
      const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2]; const cz = vz[3 * k + 2];
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
      const thc = (vth[3 * k] + vth[3 * k + 1] + vth[3 * k + 2]) / 3;
      const zc = (az + bz + cz) / 3;
      windTot += 1;
      if (bestDot(thc, zc, nx / nl, ny / nl, nz / nl) > 0) windPos += 1;
    }
  }
  const windFrac = windTot > 0 ? windPos / windTot : 0;
  const windSign = windFrac >= 0.75 ? 1 : windFrac <= 0.25 ? -1 : 0;
  log(`  WINDING: ${(100 * windFrac).toFixed(2)}% of ${windTot} stride facets agree with the analytic outward normal -> sign ${windSign}${windSign === 0 ? '  *** AMBIGUOUS ***' : ''}`);

  // ── the 15-point barycentric footprint (the NORMAL-CONE probe): vertices, edge thirds, centroid, inner
  const BARY: Array<[number, number, number]> = [];
  {
    const M = 4;                                        // 15 points on a degree-4 barycentric lattice
    for (let i = 0; i <= M; i += 1) for (let j = 0; j <= M - i; j += 1) BARY.push([i / M, j / M, 1 - i / M - j / M]);
  }

  const ndS58: number[] = []; const ndCent5: number[] = []; const ndFoot: number[] = []; const ndCone: number[] = [];
  const tgS58: number[] = []; const tgFoot: number[] = []; const tgCone: number[] = [];
  const posArr: number[] = []; const maArr: number[] = []; const diamArr: number[] = [];
  const ratioWell: number[] = [];                        // H-C: tangExc/posUm for maxAngle < 90
  let ge90S58 = 0; let ge90Wind = 0;
  // per-facet records kept for the top-K tail
  const recTg = new Float64Array(n); const recIdx = new Int32Array(n);

  for (let k = 0; k < n; k += 1) {
    const ax = vx[3 * k]; const ay = vy[3 * k]; const az = vz[3 * k];
    const bx = vx[3 * k + 1]; const by = vy[3 * k + 1]; const bz = vz[3 * k + 1];
    const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2]; const cz = vz[3 * k + 2];
    let rx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ry = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let rz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const rl = Math.hypot(rx, ry, rz); if (rl < 1e-18) { recTg[k] = 0; recIdx[k] = k; continue; }
    rx /= rl; ry /= rl; rz /= rl;
    // (a) s58's PER-FACET radial flip
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    const sgnRad = (rx * gx + ry * gy < 0) ? -1 : 1;
    // (b) the mesh's OWN winding with one global sign
    const sgnWind = windSign < 0 ? -1 : 1;

    const thc = (vth[3 * k] + vth[3 * k + 1] + vth[3 * k + 2]) / 3;
    const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));

    // s58's single central-difference normal, its own step convention
    const rr = rA(thc, zc);
    const h1 = 1e-5 / Math.max(1e-6, rr); const h2 = 1e-5;
    const rTh = (rA(thc + h1, zc) - rA(thc - h1, zc)) / (2 * h1);
    const zp = Math.min(H, zc + h2); const zm = Math.max(0, zc - h2);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let sx = rTh * ss + rr * cc; let sy = rr * ss - rTh * cc; let sz = -rr * rZ;
    const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    let d58 = (sgnRad * rx) * sx + (sgnRad * ry) * sy + (sgnRad * rz) * sz;
    d58 = d58 > 1 ? 1 : d58 < -1 ? -1 : d58;
    const a58 = Math.acos(d58) * RAD;

    // the 5-candidate deviation at the centroid, under the GLOBAL winding sign
    const dC5 = bestDot(thc, zc, sgnWind * rx, sgnWind * ry, sgnWind * rz);
    const aC5 = Math.acos(Math.max(-1, Math.min(1, dC5))) * RAD;

    // FOOTPRINT: max dot over {centroid, A, B, C}  ->  min deviation
    let dF = dC5;
    for (let v = 0; v < 3; v += 1) {
      const dv = bestDot(vth[3 * k + v], vz[3 * k + v], sgnWind * rx, sgnWind * ry, sgnWind * rz);
      if (dv > dF) dF = dv;
    }
    const aF = Math.acos(Math.max(-1, Math.min(1, dF))) * RAD;

    // CONE: max dot over the 15-point barycentric footprint
    let dK = dF;
    for (const [wa, wb, wc] of BARY) {
      const th = wa * vth[3 * k] + wb * vth[3 * k + 1] + wc * vth[3 * k + 2];
      const zz = wa * az + wb * bz + wc * cz;
      const dv = bestDot(th, zz, sgnWind * rx, sgnWind * ry, sgnWind * rz);
      if (dv > dK) dK = dv;
    }
    const aK = Math.acos(Math.max(-1, Math.min(1, dK))) * RAD;

    const la = Math.hypot(bx - cx, by - cy, bz - cz);
    const lb = Math.hypot(ax - cx, ay - cy, az - cz);
    const lc = Math.hypot(ax - bx, ay - by, az - bz);
    const diam = Math.max(la, lb, lc);
    const g3 = (p1: number, p2: number, p3: number): number => {
      const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
      return Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * RAD;
    };
    const mA = Math.max(g3(la, lb, lc), g3(lb, lc, la), g3(lc, la, lb));
    const t58 = Math.sin((a58 * Math.PI) / 180) * diam * 1000;
    const tF = Math.sin((aF * Math.PI) / 180) * diam * 1000;
    const tK = Math.sin((aK * Math.PI) / 180) * diam * 1000;
    const pv = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000;

    ndS58.push(a58); ndCent5.push(aC5); ndFoot.push(aF); ndCone.push(aK);
    tgS58.push(t58); tgFoot.push(tF); tgCone.push(tK);
    posArr.push(pv); maArr.push(mA); diamArr.push(diam);
    if (a58 >= 90) ge90S58 += 1;
    if (aC5 >= 90) ge90Wind += 1;
    if (mA < 90 && pv > 1e-9) ratioWell.push(t58 / pv);
    recTg[k] = t58; recIdx[k] = k;
  }

  const over = (a: number[]): number => a.reduce((s, v) => s + (v > BAR ? 1 : 0), 0);
  const oS58 = over(tgS58); const oFoot = over(tgFoot); const oCone = over(tgCone); const oPos = over(posArr);
  const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
  const sS58 = S(tgS58); const sFoot = S(tgFoot); const sCone = S(tgCone); const sPos = S(posArr);
  const snd58 = S(ndS58); const sndC5 = S(ndCent5); const sndF = S(ndFoot); const sndK = S(ndCone);
  const sRat = S(ratioWell);

  log(`  sampled ${ndS58.length} of ${nTri}   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  log('');
  log('  ── H-A: THE FOOTPRINT / NORMAL-CONE CORRECTION ──────────────────────────────────────────');
  log(`  quantity                       p50      p99      max     over-${BAR}um            vs s58`);
  log(`  tangExc  s58 (centroid)   ${pq(sS58, 0.5).toFixed(2).padStart(8)} ${pq(sS58, 0.99).toFixed(2).padStart(8)} ${sS58[sS58.length - 1].toFixed(1).padStart(8)}   ${String(oS58).padStart(7)} (${((100 * oS58) / sS58.length).toFixed(3)}%)   1.000x`);
  log(`  tangExc  +5cand+footprint ${pq(sFoot, 0.5).toFixed(2).padStart(8)} ${pq(sFoot, 0.99).toFixed(2).padStart(8)} ${sFoot[sFoot.length - 1].toFixed(1).padStart(8)}   ${String(oFoot).padStart(7)} (${((100 * oFoot) / sFoot.length).toFixed(3)}%)   ${(oFoot / Math.max(1, oS58)).toFixed(3)}x`);
  log(`  tangExc  +15pt NORMAL CONE${pq(sCone, 0.5).toFixed(2).padStart(8)} ${pq(sCone, 0.99).toFixed(2).padStart(8)} ${sCone[sCone.length - 1].toFixed(1).padStart(8)}   ${String(oCone).padStart(7)} (${((100 * oCone) / sCone.length).toFixed(3)}%)   ${(oCone / Math.max(1, oS58)).toFixed(3)}x`);
  log(`  posUm (driver plane ruler)${pq(sPos, 0.5).toFixed(2).padStart(8)} ${pq(sPos, 0.99).toFixed(2).padStart(8)} ${sPos[sPos.length - 1].toFixed(1).padStart(8)}   ${String(oPos).padStart(7)} (${((100 * oPos) / sPos.length).toFixed(3)}%)`);
  log(`  normDeg  s58 / cent5 / foot / cone   p99 ${pq(snd58, 0.99).toFixed(2)} / ${pq(sndC5, 0.99).toFixed(2)} / ${pq(sndF, 0.99).toFixed(2)} / ${pq(sndK, 0.99).toFixed(2)}   max ${snd58[snd58.length - 1].toFixed(1)} / ${sndC5[sndC5.length - 1].toFixed(1)} / ${sndF[sndF.length - 1].toFixed(1)} / ${sndK[sndK.length - 1].toFixed(1)}`);
  log('');
  log('  ── H-D: THE PER-FACET RADIAL FLIP vs THE MESH\'S OWN WINDING ─────────────────────────────');
  log(`  facets >=90 deg   s58 per-facet radial flip: ${ge90S58} (${((100 * ge90S58) / ndS58.length).toFixed(3)}%)   global winding sign: ${ge90Wind} (${((100 * ge90Wind) / ndS58.length).toFixed(3)}%)   ratio ${(ge90S58 / Math.max(1, ge90Wind)).toFixed(2)}x`);
  log('');
  log('  ── H-C: IS tangExc THE POSITION RULER TIMES A CONSTANT ON WELL-SHAPED FACETS? ───────────');
  log(`  tangExc/posUm on maxAngle<90 (n=${sRat.length})  p10 ${pq(sRat, 0.1).toFixed(2)}  p50 ${pq(sRat, 0.5).toFixed(2)}  p90 ${pq(sRat, 0.9).toFixed(2)}  p99 ${pq(sRat, 0.99).toFixed(2)}`);

  // ── H-B: THE TRUE POSITION ERROR OF THE WORST tangExc FACETS ─────────────────────────────────
  const order = Array.from({ length: n }, (_v, i) => i).sort((p, q) => recTg[q] - recTg[p]).slice(0, Math.min(TOPK, n));
  const trueRad: number[] = []; const truePerp: number[] = []; const ratPerp: number[] = [];
  const capLike: number[] = [];
  const LAT: Array<[number, number, number]> = [];
  for (let i = 0; i <= LATN; i += 1) for (let j = 0; j <= LATN - i; j += 1) LAT.push([i / LATN, j / LATN, 1 - i / LATN - j / LATN]);
  const tTail = Date.now();
  for (const k of order) {
    const az = vz[3 * k]; const bz = vz[3 * k + 1]; const cz = vz[3 * k + 2];
    const ax = vx[3 * k]; const ay = vy[3 * k];
    const bx = vx[3 * k + 1]; const by = vy[3 * k + 1];
    const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2];
    let worst = 0; let wp: [number, number, number] = [ax, ay, az];
    for (const [wa, wb, wc] of LAT) {
      const px = wa * ax + wb * bx + wc * cx; const py = wa * ay + wb * by + wc * cy; const pz = wa * az + wb * bz + wc * cz;
      const d = distRadial(rA, H, px, py, pz);
      if (d > worst) { worst = d; wp = [px, py, pz]; }
    }
    const pr = distPerp(rA, H, wp[0], wp[1], wp[2], { nu: 180, nv: 120 });
    trueRad.push(worst * 1000); truePerp.push(pr.d * 1000);
    ratPerp.push((pr.d * 1000) / Math.max(1e-9, recTg[k]));
    // altitude of the facet = 2*area/diam; a "cap" has altitude << diam
    const la = Math.hypot(bx - cx, by - cy, bz - cz);
    const lb = Math.hypot(ax - cx, ay - cy, az - cz);
    const lc = Math.hypot(ax - bx, ay - by, az - bz);
    const s = (la + lb + lc) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - la) * (s - lb) * (s - lc)));
    capLike.push((2 * area) / Math.max(1e-12, Math.max(la, lb, lc)) * 1000);
  }
  const sRad = S(trueRad); const sPerp = S(truePerp); const sRatP = S(ratPerp); const sAlt = S(capLike);
  const tgTop = S(order.map((k) => recTg[k]));
  log('');
  log(`  ── H-B: THE TRUE POSITION ERROR OF THE TOP-${order.length} FACETS BY tangExc (${((Date.now() - tTail) / 1000).toFixed(1)}s) ──`);
  log(`  tangExc over those facets        p50 ${pq(tgTop, 0.5).toFixed(1)}  p99 ${pq(tgTop, 0.99).toFixed(1)}  max ${tgTop[tgTop.length - 1].toFixed(1)} um`);
  log(`  max-over-facet RADIAL dist (UPPER BOUND on true perp)  p50 ${pq(sRad, 0.5).toFixed(2)}  p99 ${pq(sRad, 0.99).toFixed(2)}  max ${sRad[sRad.length - 1].toFixed(1)} um`);
  log(`  distPerp at the radial argmax    p50 ${pq(sPerp, 0.5).toFixed(2)}  p99 ${pq(sPerp, 0.99).toFixed(2)}  max ${sPerp[sPerp.length - 1].toFixed(1)} um`);
  log(`  *** truePerp / tangExc           p50 ${pq(sRatP, 0.5).toFixed(4)}  p90 ${pq(sRatP, 0.9).toFixed(4)}  max ${sRatP[sRatP.length - 1].toFixed(3)} ***`);
  log(`  facet ALTITUDE (2*area/diam)     p50 ${pq(sAlt, 0.5).toFixed(1)}  p99 ${pq(sAlt, 0.99).toFixed(1)} um   (a "cap" has altitude << diam)`);
  log(`  KILL-CRITERION H-B: >=0.25 => REAL POSITIONAL DEFECT (the plane ruler is what is broken).`);
  log(`                      <0.05 AND radial p50 < ${BAR} um => tangExc is not a displacement.`);

  const rec = {
    style, stem, nTri, sampled: ndS58.length, gateP99: gp99, windFrac, windSign,
    barUm: BAR,
    over: { s58: oS58, foot: oFoot, cone: oCone, pos: oPos },
    overPct: { s58: (100 * oS58) / sS58.length, foot: (100 * oFoot) / sS58.length, cone: (100 * oCone) / sS58.length, pos: (100 * oPos) / sS58.length },
    tang: { s58p99: pq(sS58, 0.99), footp99: pq(sFoot, 0.99), conep99: pq(sCone, 0.99), s58max: sS58[sS58.length - 1], conemax: sCone[sCone.length - 1] },
    nd: { s58p99: pq(snd58, 0.99), c5p99: pq(sndC5, 0.99), footp99: pq(sndF, 0.99), conep99: pq(sndK, 0.99) },
    ge90: { s58: ge90S58, wind: ge90Wind },
    ratioWell: { p10: pq(sRat, 0.1), p50: pq(sRat, 0.5), p90: pq(sRat, 0.9) },
    tail: {
      k: order.length, tgP50: pq(tgTop, 0.5), radP50: pq(sRad, 0.5), radP99: pq(sRad, 0.99), radMax: sRad[sRad.length - 1],
      perpP50: pq(sPerp, 0.5), perpP99: pq(sPerp, 0.99), perpMax: sPerp[sPerp.length - 1],
      ratP50: pq(sRatP, 0.5), ratP90: pq(sRatP, 0.9), altP50: pq(sAlt, 0.5),
    },
    secs: (Date.now() - t0) / 1000,
  };
  appendFileSync(OUT, `${JSON.stringify(rec)}\n`);
  log(`  [checkpoint appended to ${OUT}]`);
}
log('');
log('done');

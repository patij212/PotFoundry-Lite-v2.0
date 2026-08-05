// frontierTaxonomy.ts — WHAT IS THE ORIENTATION DEFECT, ACTUALLY?  (FRONTIER Q1 / Q2 / Q5)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HOLE THIS IS AIMED AT. S91 §0e.1 retired the best mechanistic story: `aspect3 >= 50` holds only
// **4.46% of Voronoi's over-bar AREA**. So ~88% of the defect area is neither high-aspect nor
// hub-adjacent and nobody knows what it is. Every operator tried (flip, cavity DP, collapse, density,
// split placement) is measured dead, so the campaign has an unexplained majority-prevalence defect and
// no lever. A taxonomy is worth more than another lever.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE THREE PRE-REGISTERED HYPOTHESES AND THEIR KILL LINES  (written BEFORE the first run)
//
//  H-A "THE FLOOR".  The over-bar orientation area is dominated by facets whose IRREDUCIBLE floor is
//      already over the bar. Define, for a facet's own parameter footprint, the set N of analytic surface
//      normals sampled over it. NO plane — not the one the mesher chose, not one a flip/collapse/smooth
//      would choose, not even an off-surface one — can have a normal closer to all of N than the CENTRE
//      OF THE SMALLEST ENCLOSING CONE of N. That centre's radius is a hard floor on `normRad` for that
//      footprint. Report it as a chord (`2 sin(coneLB/2) * diam`) in the currency the bar is stated in.
//      *** KILL: if < 50% of over-bar AREA has floorChordLB > bar, then >= 50% of the defect is
//      RECOVERABLE BY RE-ORIENTATION ALONE and H-A is refuted — which would mean Q4 (tangential vertex
//      relaxation against an orientation objective) has real headroom and is worth building. ***
//
//  H-B "THE BAR".  The bar `2 sin(theta/2) * diam <= 10 um` is an ANGLE multiplied by a LENGTH. On a
//      facet with vertices ON the surface, turn ~ d*kappa while sag ~ d^2*kappa/8, so the quantity being
//      barred is ~8x the position sag: a 10 um orientation bar is a **1.25 um position bar** in disguise
//      (S88 measured median o2/w = 6.4-8.4 and called it a bar-calibration effect; this re-derives it per
//      facet and prices it). The physically meaningful statement of an orientation requirement is an
//      ANGLE. *** MEASURE: the AREA-WEIGHTED distribution of `normDeg` over the over-bar population. If
//      its p99 is sub-degree the "defect" is invisible to every consumer that reads a normal. ***
//
//  H-C "THE CHART" (Q5).  If the radial graph over (theta, z) is the constraint, the defect concentrates
//      where the chart is poor: large |r_theta|/r or |r_z|, i.e. near-vertical wall. *** MEASURE: over-bar
//      area share by slope quintile. If the top quintile holds < 40% the chart is not the story. ***
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// INSTRUMENT DISCIPLINE — this project has found FOUR instrument defects, three of them the same shape
// ("a normal sampled at a single centroid is not a facet measure"). So:
//   * every normal quantity here is a SUP OVER AN ORDER-k BARYCENTRIC COVERING (k=8, inset 0.02, the
//     construction S70/S92 published), never a centroid sample. Stated on every line of output.
//   * the covering `normRad` computed by THIS file's inline sampler is CHECKED FACET-BY-FACET against
//     `orientRuler.orientOfFacet(fdNormalsCentral)` on the first PF_FR_XCHECK facets and the max
//     absolute disagreement is printed. If that number is not ~1e-15 nothing below is admissible.
//   * COUNT and AREA are both reported everywhere. Count over-states defect AREA 13-184x in this project
//     and the two disagree in DIRECTION.
//   * `coneLB` is a SOUND LOWER bound on the floor (half the max pairwise angle — any enclosing cone must
//     contain both members of the widest pair). `coneUB` is an ACHIEVED value from Badoiu-Clarkson, hence
//     a sound UPPER bound. The "irreducible" claim uses only coneLB; the "recoverable" claim uses only
//     coneUB. Neither claim is allowed to lean on the other side of the bracket.
//   * every sup here is a LATTICE max, i.e. a LOWER bound on the true sup over the footprint. Said once,
//     applies to normRad, coneLB, coneUB and the position proxies alike, so the RATIOS between them are
//     computed on the same lattice and are not affected.
//
// POSITION PROXY, AND WHAT IT IS NOT. `certifyTriangle` costs 40k-330k rA evals per facet — 3 to 6 orders
// more than this whole census per facet. So position here is a first-order proxy: at each lattice point
// take D = P_facet - P_surface(theta,z) and report |D . n_hat| (perpendicular component; approximates the
// true nearest distance to first order) alongside |D| (an upper bound on it). It is NOT `certifyTriangle`
// and is never called honest position. `frontierCertify.ts` runs the real certificate on a stratified
// sub-sample to calibrate it.
//
// Usage: bash research/tools/run-frontier-taxonomy.sh
//   env: PF_FR_STYLE  PF_FR_STL  PF_FR_TAG  PF_FR_N(60000)  PF_FR_K(8)  PF_FR_INSET(0.02)
//        PF_FR_BAR_UM(10)  PF_FR_XCHECK(2000)  PF_FR_H/RB/RT  PF_FR_NDJSON(1)
import { writeFileSync, mkdirSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormalsCentral, farRadius } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_FR_STYLE ?? 'GothicArches';
const STL = process.env.PF_FR_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_FR_TAG ?? 'S39CTL';
const NSAMP = Math.round(envF('PF_FR_N', 60000));
const K = Math.round(envF('PF_FR_K', 8));
const INSET = envF('PF_FR_INSET', 0.02);
const BAR_UM = envF('PF_FR_BAR_UM', 10);
const XCHECK = Math.round(envF('PF_FR_XCHECK', 2000));
const NDJSON = process.env.PF_FR_NDJSON !== '0';
const DIMS: StyleDims = { H: envF('PF_FR_H', 120), Rb: envF('PF_FR_RB', 40), Rt: envF('PF_FR_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/frontier';
/**
 * FACET SIGN CONVENTION — added after the FOLDED class failed its own falsification test.
 * 'outward' is the campaign's convention (`orientOfFacet({orient:'outward'})`, used by S70/S91/S92):
 * flip the facet normal so its XY part points away from the axis. On a NEARLY-HORIZONTAL facet the XY
 * part is ~0 and that test decides the sign on noise — `frontierFoldCheck.cjs` measures the decision
 * margin at p50 = 0.035 on Voronoi's `normDeg > 90` population, i.e. those facets are not folded, they
 * are horizontal and arbitrarily signed. 'winding' takes the STL's own vertex order, which is the file's
 * statement of which side is out and needs no heuristic.
 */
const ORIENT = process.env.PF_FR_ORIENT === 'winding' ? 'winding' : 'outward';

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

const T0 = Date.now();
mkdirSync(OUTDIR, { recursive: true });
log('===== FRONTIER TAXONOMY — WHAT IS THE ORIENTATION DEFECT MADE OF? =====');
log(`style ${STYLE}   tag ${TAG}   bar ${BAR_UM} um   covering k=${K} inset=${INSET} (${((K + 1) * (K + 2)) / 2} pts/facet)`);
log(`STL ${STL}`);
log('SAMPLING: sup over an order-k barycentric covering. NO centroid samples anywhere in this file.');
log(`FACET SIGN CONVENTION: ${ORIENT}${ORIENT === 'outward' ? '  (the campaign convention — ILL-CONDITIONED on near-horizontal facets)' : '  (the STL winding — no heuristic)'}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz;
const nTri = M.nTri;
log(`mesh ${nTri} facets   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}
const idx = goldenIdx(nTri, NSAMP);
const NS = idx.length;
log(`sample ${NS} facets (${((100 * NS) / nTri).toFixed(3)}% coverage), golden stride`);

// ── the lattice, precomputed once (weights identical to orientOfFacet's, INCLUDING the inset shrink) ──
const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const sc = INSET / 3;
  let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + sc; const b = sh * (j / K) + sc;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}

// per-facet scratch
const nx = new Float64Array(LP); const ny = new Float64Array(LP); const nz = new Float64Array(LP);
const ang = new Float64Array(LP);

// ── outputs ──
const F = {
  area: new Float64Array(NS), diam: new Float64Array(NS), minAng: new Float64Array(NS),
  circR: new Float64Array(NS), rhoP: new Float64Array(NS),
  normDeg: new Float64Array(NS), tangUm: new Float64Array(NS),
  coneLBdeg: new Float64Array(NS), coneUBdeg: new Float64Array(NS),
  spreadDeg: new Float64Array(NS), kinkDeg: new Float64Array(NS), overFracBar: new Float64Array(NS),
  dRadUm: new Float64Array(NS), dPerpUm: new Float64Array(NS), dAbsUm: new Float64Array(NS),
  th: new Float64Array(NS), z: new Float64Array(NS), rr: new Float64Array(NS),
  slopeTh: new Float64Array(NS), slopeZ: new Float64Array(NS),
  // ── THE TURNING TENSOR (third fundamental form III = dN^T dN in the (r*theta, z) chart) ──
  // Q1 established that the defect is the surface TURNING inside a footprint that is too big. The floor
  // for a footprint is the cone aperture, which is `kappa * extent` IN THE DIRECTION OF FASTEST TURNING.
  // An ISOTROPIC refinement pays that price in BOTH directions; an ALIGNED, STRETCHED facet pays it only
  // across the ridge. The available saving is exactly the curvature ANISOTROPY kappaA/kappaB, and it is
  // measurable per facet for 20 extra rA evals. This is the number that decides whether the 10 um
  // orientation bar costs ~10x the triangles or ~1x.
  kapA: new Float64Array(NS), kapB: new Float64Array(NS), misalignDeg: new Float64Array(NS),
};

const HARC = 2e-4; const HZ = 2e-4;
const scratch12 = new Float64Array(12);
const nsCentralRef = fdNormalsCentral(rA, H, HARC, HZ);
let xchkMax = 0; let xchkN = 0;

for (let q = 0; q < NS; q += 1) {
  const o = idx[q] * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];

  // ── shape, 3D ──
  const eA = Math.hypot(bx - cx, by - cy, bz - cz);
  const eB = Math.hypot(ax - cx, ay - cy, az - cz);
  const eC = Math.hypot(ax - bx, ay - by, az - bz);
  const diam = Math.max(eA, eB, eC);
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const area = 0.5 * fl;
  F.area[q] = area; F.diam[q] = diam;
  if (!(fl > 0)) { F.normDeg[q] = NaN; continue; }
  fx /= fl; fy /= fl; fz /= fl;
  if (ORIENT === 'outward') {
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  }
  // min angle from the law of cosines on the shortest edge's opposite vertex
  const s1 = Math.min(eA, eB, eC); const s3 = diam; const s2 = eA + eB + eC - s1 - s3;
  const cosMin = (s2 * s2 + s3 * s3 - s1 * s1) / Math.max(1e-300, 2 * s2 * s3);
  F.minAng[q] = (Math.acos(Math.max(-1, Math.min(1, cosMin))) * 180) / Math.PI;
  F.circR[q] = (eA * eB * eC) / Math.max(1e-300, 4 * area);

  // ── the parameter footprint (unwrapped theta off vertex A's branch, as every campaign probe does) ──
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  F.rhoP[q] = farRadius(rRef * thA, az, rRef * thB, bz, rRef * thC, cz);

  // ── the covering: 5 rA evals per lattice point, from which BOTH the central normal and the four
  //    one-sided combinations are formed (same five evals, so the kink detector is free).
  let best = -1; let sxa = 0; let sya = 0; let sza = 0; let kink = 0;
  let dRadMax = 0; let dPerpMax = 0; let dAbsMax = 0;
  let rC = 0; let rThC = 0; let rZC = 0; let thCen = 0; let zCen = 0;
  for (let p = 0; p < LP; p += 1) {
    const th = wA[p] * thA + wB[p] * thB + wC[p] * thC;
    const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const r0 = rA(th, zz);
    const hTh = HARC / Math.max(1e-9, Math.abs(r0));
    const rP = rA(th + hTh, zz); const rM = rA(th - hTh, zz);
    let zLo = zz - HZ; let zHi = zz + HZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
    const rZp = rA(th, zHi); const rZm = rA(th, zLo);
    const rt = (rP - rM) / (2 * hTh);
    const rz = zHi > zLo ? (rZp - rZm) / (zHi - zLo) : 0;
    const c = Math.cos(th); const s = Math.sin(th);
    let vx = rt * s + r0 * c; let vy = r0 * s - rt * c; let vz = -r0 * rz;
    const L = Math.hypot(vx, vy, vz) || 1; vx /= L; vy /= L; vz /= L;
    nx[p] = vx; ny[p] = vy; nz[p] = vz;
    sxa += vx; sya += vy; sza += vz;
    let d = fx * vx + fy * vy + fz * vz; d = d > 1 ? 1 : d < -1 ? -1 : d;
    const a = Math.acos(d); ang[p] = a;
    if (a > best) best = a;

    // one-sided combinations -> the kink (crease) detector, from the SAME five evals
    const rtF = (rP - r0) / hTh; const rtB = (r0 - rM) / hTh;
    const rzF = zHi > zz ? (rZp - r0) / (zHi - zz) : rz;
    const rzB = zz > zLo ? (r0 - rZm) / (zz - zLo) : rz;
    let mnDot = 1;
    for (let u = 0; u < 4; u += 1) {
      const rtu = u < 2 ? rtF : rtB; const rzu = (u & 1) === 0 ? rzF : rzB;
      let ux = rtu * s + r0 * c; let uy = r0 * s - rtu * c; let uz = -r0 * rzu;
      const LU = Math.hypot(ux, uy, uz) || 1; ux /= LU; uy /= LU; uz /= LU;
      for (let v = 0; v < u; v += 1) {
        const rtv = v < 2 ? rtF : rtB; const rzv = (v & 1) === 0 ? rzF : rzB;
        let wx = rtv * s + r0 * c; let wy = r0 * s - rtv * c; let wz = -r0 * rzv;
        const LV = Math.hypot(wx, wy, wz) || 1; wx /= LV; wy /= LV; wz /= LV;
        const dd = ux * wx + uy * wy + uz * wz;
        if (dd < mnDot) mnDot = dd;
      }
    }
    const kk = Math.acos(Math.max(-1, Math.min(1, mnDot)));
    if (kk > kink) kink = kk;

    // ── position proxy at this lattice point ──
    const px = wA[p] * ax + wB[p] * bx + wC[p] * cx;
    const py = wA[p] * ay + wB[p] * by + wC[p] * cy;
    const pz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const sxp = r0 * c; const syp = r0 * s; const szp = zz;
    const dx = px - sxp; const dy = py - syp; const dz = pz - szp;
    const dAbs = Math.hypot(dx, dy, dz);
    const dPerp = Math.abs(dx * vx + dy * vy + dz * vz);
    const dRad = Math.abs(Math.hypot(px, py) - rA(Math.atan2(py, px), pz));
    if (dAbs > dAbsMax) dAbsMax = dAbs;
    if (dPerp > dPerpMax) dPerpMax = dPerp;
    if (dRad > dRadMax) dRadMax = dRad;
    if (p === 0) { rC = r0; rThC = rt; rZC = rz; thCen = th; zCen = zz; }
  }
  // centroid-ish covariates: use the lattice point nearest the centroid (index of (K/3,K/3) is awkward;
  // the barycentric mean of the whole lattice is the centroid, so use the mean of the vertices instead).
  {
    const th = (thA + thB + thC) / 3; const zz = (az + bz + cz) / 3;
    const r0 = rA(th, zz);
    const hTh = HARC / Math.max(1e-9, Math.abs(r0));
    let zLo = zz - HZ; let zHi = zz + HZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
    rC = r0; thCen = th; zCen = zz;
    rThC = (rA(th + hTh, zz) - rA(th - hTh, zz)) / (2 * hTh);
    rZC = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
  }
  F.th[q] = thCen; F.z[q] = zCen; F.rr[q] = rC;
  F.slopeTh[q] = rThC / Math.max(1e-12, rC); F.slopeZ[q] = rZC;
  {
    // dN in the arclength chart (s = r*theta, z). 4 normal probes = 20 rA evals.
    const EPS = 1e-3;                                  // mm, in BOTH chart directions
    const nAt = (th: number, zz: number, out: Float64Array): void => {
      const r0 = rA(th, zz);
      const hT = HARC / Math.max(1e-9, Math.abs(r0));
      let zl = zz - HZ; let zh = zz + HZ;
      if (zl < 0) { zl = 0; zh = Math.min(H, 2 * HZ); }
      if (zh > H) { zh = H; zl = Math.max(0, H - 2 * HZ); }
      const rt = (rA(th + hT, zz) - rA(th - hT, zz)) / (2 * hT);
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const c2 = Math.cos(th); const s2 = Math.sin(th);
      let ax2 = rt * s2 + r0 * c2; let ay2 = r0 * s2 - rt * c2; let az2 = -r0 * rz;
      const L2 = Math.hypot(ax2, ay2, az2) || 1;
      out[0] = ax2 / L2; out[1] = ay2 / L2; out[2] = az2 / L2;
    };
    const na = new Float64Array(3); const nb = new Float64Array(3);
    const nc2 = new Float64Array(3); const nd = new Float64Array(3);
    const dth = EPS / Math.max(1e-9, rC);
    nAt(thCen + dth, zCen, na); nAt(thCen - dth, zCen, nb);
    const zp2 = Math.min(H, zCen + EPS); const zm2 = Math.max(0, zCen - EPS);
    nAt(thCen, zp2, nc2); nAt(thCen, zm2, nd);
    const dz2 = Math.max(1e-12, zp2 - zm2);
    const us = [(na[0] - nb[0]) / (2 * EPS), (na[1] - nb[1]) / (2 * EPS), (na[2] - nb[2]) / (2 * EPS)];
    const uz = [(nc2[0] - nd[0]) / dz2, (nc2[1] - nd[1]) / dz2, (nc2[2] - nd[2]) / dz2];
    const e11 = us[0] * us[0] + us[1] * us[1] + us[2] * us[2];
    const e12 = us[0] * uz[0] + us[1] * uz[1] + us[2] * uz[2];
    const e22 = uz[0] * uz[0] + uz[1] * uz[1] + uz[2] * uz[2];
    const tr = e11 + e22; const det = e11 * e22 - e12 * e12;
    const disc = Math.sqrt(Math.max(0, 0.25 * tr * tr - det));
    const l1 = 0.5 * tr + disc; const l2 = Math.max(0, 0.5 * tr - disc);
    F.kapA[q] = Math.sqrt(Math.max(0, l1)); F.kapB[q] = Math.sqrt(l2);
    // eigenvector of the SMALL eigenvalue = the direction along which the normal barely turns = the
    // direction a facet may be stretched. Compare it to the facet's own long axis in the same chart.
    let evx = 1; let evy = 0;
    if (Math.abs(e12) > 1e-18) { evx = e12; evy = l2 - e11; } else if (e11 > e22) { evx = 0; evy = 1; }
    const evl = Math.hypot(evx, evy) || 1; evx /= evl; evy /= evl;
    // facet long axis in the (r*theta, z) chart
    const px1 = [rRef * thA, rRef * thB, rRef * thC]; const pz1 = [az, bz, cz];
    let lax = 0; let lay = 0; let lbest = -1;
    for (let u = 0; u < 3; u += 1) {
      const v2 = (u + 1) % 3;
      const dxx = px1[v2] - px1[u]; const dyy = pz1[v2] - pz1[u];
      const ll = dxx * dxx + dyy * dyy;
      if (ll > lbest) { lbest = ll; lax = dxx; lay = dyy; }
    }
    const lal = Math.hypot(lax, lay) || 1; lax /= lal; lay /= lal;
    const cosm = Math.min(1, Math.abs(lax * evx + lay * evy));
    F.misalignDeg[q] = (Math.acos(cosm) * 180) / Math.PI;
  }
  F.normDeg[q] = (best * 180) / Math.PI;
  F.tangUm[q] = 2 * Math.sin(0.5 * best) * diam * 1000;
  F.kinkDeg[q] = (kink * 180) / Math.PI;
  F.dRadUm[q] = dRadMax * 1000; F.dPerpUm[q] = dPerpMax * 1000; F.dAbsUm[q] = dAbsMax * 1000;
  const mlen = Math.hypot(sxa, sya, sza) / LP;
  F.spreadDeg[q] = (2 * Math.acos(Math.min(1, mlen)) * 180) / Math.PI;
  // fraction of the covering over the bar, in the bar's own currency (chord = bar at this diam)
  {
    const aBar = diam > 0 ? 2 * Math.asin(Math.min(1, (BAR_UM / 1000) / (2 * diam))) : Math.PI;
    let over = 0;
    for (let p = 0; p < LP; p += 1) if (ang[p] > aBar) over += 1;
    F.overFracBar[q] = over / LP;
  }

  // ── THE FLOOR: smallest enclosing cone of the sampled normals ──
  // coneLB = half the max pairwise angle. SOUND lower bound: any cone containing both members of the
  // widest pair has half-angle >= half that pair's angle.
  let minDot = 1;
  for (let p = 0; p < LP; p += 1) {
    for (let u = 0; u < p; u += 1) {
      const dd = nx[p] * nx[u] + ny[p] * ny[u] + nz[p] * nz[u];
      if (dd < minDot) minDot = dd;
    }
  }
  const coneLB = 0.5 * Math.acos(Math.max(-1, Math.min(1, minDot)));
  // coneUB = an ACHIEVED enclosing cone (Badoiu-Clarkson core-set iteration seeded at the mean normal).
  let ux = sxa; let uy = sya; let uz = sza;
  {
    const L = Math.hypot(ux, uy, uz) || 1; ux /= L; uy /= L; uz /= L;
    for (let it = 1; it <= 60; it += 1) {
      let far = 0; let fd = 2;
      for (let p = 0; p < LP; p += 1) {
        const dd = nx[p] * ux + ny[p] * uy + nz[p] * uz;
        if (dd < fd) { fd = dd; far = p; }
      }
      const t = 1 / (it + 1);
      ux += t * (nx[far] - ux); uy += t * (ny[far] - uy); uz += t * (nz[far] - uz);
      const L2 = Math.hypot(ux, uy, uz) || 1; ux /= L2; uy /= L2; uz /= L2;
    }
  }
  let coneUBdot = 1;
  for (let p = 0; p < LP; p += 1) {
    const dd = nx[p] * ux + ny[p] * uy + nz[p] * uz;
    if (dd < coneUBdot) coneUBdot = dd;
  }
  const coneUB = Math.acos(Math.max(-1, Math.min(1, coneUBdot)));
  F.coneLBdeg[q] = (coneLB * 180) / Math.PI;
  F.coneUBdeg[q] = (coneUB * 180) / Math.PI;

  // ── cross-check against the published ruler on the first XCHECK facets ──
  if (q < XCHECK) {
    const ref = orientOfFacet(nsCentralRef, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
      { k: K, inset: INSET, orient: ORIENT, scratch: scratch12 });
    const d = Math.abs(ref.normRad - best);
    if (d > xchkMax) xchkMax = d;
    xchkN += 1;
  }
  if ((q + 1) % 20000 === 0) log(`  ${q + 1}/${NS}   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

log('');
log(`CROSS-CHECK vs orientRuler.orientOfFacet(fdNormalsCentral) on ${xchkN} facets: max |dNormRad| = ${xchkMax.toExponential(3)} rad`);
log(xchkMax < 1e-12 ? '  -> AGREES to f64. The inline sampler IS the published covering ruler.'
  : '  *** DISAGREES — nothing below is admissible ***');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const areaAll = F.area.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
const over: number[] = [];
for (let q = 0; q < NS; q += 1) if (Number.isFinite(F.normDeg[q]) && F.tangUm[q] > BAR_UM) over.push(q);
const areaOver = over.reduce((s, q) => s + F.area[q], 0);

const pctA = (v: number): string => `${((100 * v) / Math.max(1e-30, areaOver)).toFixed(2)}%`;
const shareOf = (pred: (q: number) => boolean): { c: number; a: number } => {
  let c = 0; let a = 0;
  for (const q of over) if (pred(q)) { c += 1; a += F.area[q]; }
  return { c, a };
};
/**
 * A share of the over-bar area is only interpretable next to that class's share of ALL area. A class
 * holding 33% of the defect while covering 33% of the mesh explains NOTHING; the statistic that carries
 * information is the ENRICHMENT (defect share / population share). Printed on every row.
 */
const row = (label: string, pred: (q: number) => boolean): void => {
  const s = shareOf(pred);
  let aAll = 0;
  for (let q = 0; q < NS; q += 1) if (Number.isFinite(F.normDeg[q]) && pred(q)) aAll += F.area[q];
  const dShare = s.a / Math.max(1e-30, areaOver);
  const pShare = aAll / Math.max(1e-30, areaAll);
  const enr = pShare > 0 ? dShare / pShare : NaN;
  log(`    ${label.padEnd(52)} cnt ${String(s.c).padStart(6)} (${((100 * s.c) / Math.max(1, over.length)).toFixed(1).padStart(5)}%)  defAREA ${pctA(s.a).padStart(7)}  popAREA ${(100 * pShare).toFixed(2).padStart(6)}%  ENRICH ${Number.isFinite(enr) ? enr.toFixed(2) : '  -  '}`);
};
/** area-weighted quantile over a subset */
function wq(qs: number[], val: (q: number) => number, ps: number[]): number[] {
  const arr = qs.map((q) => [val(q), F.area[q]] as [number, number]).filter((x) => Number.isFinite(x[0]));
  arr.sort((a, b) => a[0] - b[0]);
  const tot = arr.reduce((s, x) => s + x[1], 0);
  const out: number[] = []; let i = 0; let acc = 0;
  for (const p of ps) {
    const target = p * tot;
    while (i < arr.length && acc + arr[i][1] < target) { acc += arr[i][1]; i += 1; }
    out.push(arr[Math.min(i, arr.length - 1)][0]);
  }
  return out;
}
const P = [0.05, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0];
const fmtQ = (v: number[], d = 3): string => v.map((x) => x.toFixed(d)).join('  ');

log('');
log('══════════════════════════════════════════════════════════════════════════════════════════');
log(`  ${STYLE} / ${TAG}   ${NS} facets sampled of ${nTri}`);
log(`  over-bar (tangMm > ${BAR_UM} um):  COUNT ${over.length}/${NS} = ${((100 * over.length) / NS).toFixed(2)}%   AREA ${((100 * areaOver) / areaAll).toFixed(3)}% of sampled area`);
log('══════════════════════════════════════════════════════════════════════════════════════════');

log('');
log('── H-A  THE FLOOR: is the over-bar area IRREDUCIBLE for its own footprint? ──');
log('   floorChordLB = 2 sin(coneLB/2) * diam, coneLB = half the max pairwise normal angle over the');
log('   footprint = a SOUND lower bound on what ANY plane through this footprint can achieve.');
{
  const fl = (q: number): number => 2 * Math.sin(0.5 * (F.coneLBdeg[q] * Math.PI) / 180) * F.diam[q] * 1000;
  const fu = (q: number): number => 2 * Math.sin(0.5 * (F.coneUBdeg[q] * Math.PI) / 180) * F.diam[q] * 1000;
  row('IRREDUCIBLE  floorChordLB  >  bar', (q) => fl(q) > BAR_UM);
  row('RECOVERABLE  floorChordUB  <= bar  (a plane exists)', (q) => fu(q) <= BAR_UM);
  row('  undecided (LB <= bar < UB)', (q) => fl(q) <= BAR_UM && fu(q) > BAR_UM);
  log(`    area-wt quantiles p05/25/50/75/90/99/max of floorChordLB (um): ${fmtQ(wq(over, fl, P), 2)}`);
  log(`    area-wt quantiles of  tangUm                              : ${fmtQ(wq(over, (q) => F.tangUm[q], P), 2)}`);
  log(`    area-wt quantiles of  floorLB / tang  (1 = fully irreducible): ${fmtQ(wq(over, (q) => fl(q) / Math.max(1e-9, F.tangUm[q]), P), 3)}`);
  log(`    area-wt quantiles of  coneUB / normDeg                      : ${fmtQ(wq(over, (q) => F.coneUBdeg[q] / Math.max(1e-9, F.normDeg[q]), P), 3)}`);
}

log('');
log('── H-B  THE BAR: what ANGLE is actually being demanded, and what position bar does it imply? ──');
{
  log(`    area-wt quantiles of the measured sup ANGLE (deg): ${fmtQ(wq(over, (q) => F.normDeg[q], P), 4)}`);
  log(`    area-wt quantiles over ALL sampled facets   (deg): ${fmtQ(wq(Array.from({ length: NS }, (_v, i) => i).filter((q) => Number.isFinite(F.normDeg[q])), (q) => F.normDeg[q], P), 4)}`);
  log(`    area-wt quantiles of diam (mm), over-bar facets  : ${fmtQ(wq(over, (q) => F.diam[q], P), 4)}`);
  const ow = (q: number): number => F.tangUm[q] / Math.max(1e-6, F.dPerpUm[q]);
  log(`    area-wt quantiles of  tangUm / dPerpUm  (theory: 8 for a smooth curvature-limited facet):`);
  log(`      ${fmtQ(wq(over, ow, P), 2)}`);
  log(`    area-wt quantiles of dPerpUm (position PROXY, um) on over-bar facets: ${fmtQ(wq(over, (q) => F.dPerpUm[q], P), 3)}`);
  log(`    area-wt quantiles of dRadUm  (radial, um)                          : ${fmtQ(wq(over, (q) => F.dRadUm[q], P), 3)}`);
  row(`position proxy under bar (dPerp <= ${BAR_UM} um) yet orientation over`, (q) => F.dPerpUm[q] <= BAR_UM);
  row('position proxy under bar/8 (dPerp <= 1.25 um)', (q) => F.dPerpUm[q] <= BAR_UM / 8);
}

log('');
log('── H-C  THE CHART (Q5): does the defect sit where the radial graph is a poor chart? ──');
{
  const slope = (q: number): number => Math.hypot(F.slopeTh[q], F.slopeZ[q]);
  const all = Array.from({ length: NS }, (_v, i) => i).filter((q) => Number.isFinite(F.normDeg[q]));
  log(`    slope = hypot(r_theta/r, r_z)  (0 = the chart is an isometry-ish; large = near-vertical wall)`);
  log('    FIXED buckets (area quintiles are degenerate here: most of the wall sits at the cone taper).');
  const cuts = [0.1, 0.3, 1, 3, 10];
  for (let b = 0; b <= cuts.length; b += 1) {
    const lo = b === 0 ? -1 : cuts[b - 1]; const hi = b === cuts.length ? Infinity : cuts[b];
    row(`slope in (${lo === -1 ? '0' : lo.toFixed(1)}, ${hi === Infinity ? 'inf' : hi.toFixed(1)}]`,
      (q) => slope(q) > lo && slope(q) <= hi);
  }
  log(`    area-wt quantiles of slope, over-bar: ${fmtQ(wq(over, slope, P), 4)}`);
  log(`    area-wt quantiles of slope, ALL     : ${fmtQ(wq(all, slope, P), 4)}`);
}

log('');
log('── THE TAXONOMY: what ARE these facets? (shares of over-bar AREA, non-exclusive) ──');
{
  row('CREASE straddle  kinkDeg > 1 deg', (q) => F.kinkDeg[q] > 1);
  row('TURNING facet    spreadDeg >= normDeg/2', (q) => F.spreadDeg[q] >= 0.5 * F.normDeg[q]);
  row('MIS-ORIENTED     spreadDeg <  normDeg/4  (field nearly constant)', (q) => F.spreadDeg[q] < 0.25 * F.normDeg[q]);
  row('measure-~0 sup   overFracBar < 0.05', (q) => F.overFracBar[q] < 0.05);
  row('sup over most of the facet  overFracBar > 0.5', (q) => F.overFracBar[q] > 0.5);
  row('SLIVER  minAngle < 5 deg', (q) => F.minAng[q] < 5);
  row('SLIVER  minAngle < 15 deg', (q) => F.minAng[q] < 15);
  row('well-shaped  minAngle >= 25 deg', (q) => F.minAng[q] >= 25);
  row('BIG  diam > 1 mm', (q) => F.diam[q] > 1);
  row('SMALL diam <= 0.25 mm', (q) => F.diam[q] <= 0.25);
  log(`    area-wt quantiles of minAngle (deg), over-bar: ${fmtQ(wq(over, (q) => F.minAng[q], P), 2)}`);
  log(`    area-wt quantiles of minAngle (deg), ALL     : ${fmtQ(wq(Array.from({ length: NS }, (_v, i) => i).filter((q) => Number.isFinite(F.normDeg[q])), (q) => F.minAng[q], P), 2)}`);
  log(`    area-wt quantiles of spreadDeg, over-bar     : ${fmtQ(wq(over, (q) => F.spreadDeg[q], P), 4)}`);
  log(`    area-wt quantiles of kinkDeg,   over-bar     : ${fmtQ(wq(over, (q) => F.kinkDeg[q], P), 4)}`);
  log(`    area-wt quantiles of circumradius (mm)       : ${fmtQ(wq(over, (q) => F.circR[q], P), 4)}`);
}

log('');
log('── THE THEORY CHECK (arXiv:1911.03424 / Morvan-Thibert): normal error ~ kappa * R, LINEAR in R ──');
{
  // kappaEff = the footprint's own Gauss-map turning rate, 1/mm: cone aperture over footprint far-radius.
  const kap = (q: number): number => ((F.coneUBdeg[q] * Math.PI) / 180) / Math.max(1e-9, F.rhoP[q]);
  log(`    kappaEff = coneUB(rad) / rho_param(mm),  area-wt quantiles on over-bar (1/mm): ${fmtQ(wq(over, kap, P), 4)}`);
  log(`    predicted chord if normRad == coneUB:  = floorChordUB. ratio measured/predicted:`);
  const pr = (q: number): number => F.normDeg[q] / Math.max(1e-9, F.coneUBdeg[q]);
  log(`      normDeg / coneUB  area-wt quantiles: ${fmtQ(wq(over, pr, P), 3)}`);
}

log('');
log('══ THE FRONTIER NUMBER: WHAT AN ANISOTROPIC, ALIGNED SIZING FIELD WOULD SAVE ══');
log('  III = dN^T dN in the (r*theta, z) arclength chart; kapA >= kapB are its principal turning rates (1/mm).');
log('  A facet clears an aperture bar in EACH principal direction independently, so an ALIGNED facet may be');
log('  stretched by kapA/kapB along the slow direction at the same aperture. That ratio is the triangle');
log('  saving available to an anisotropic metric over isotropic refinement, capped by the aspect ratio a');
log('  mesher will actually emit.');
{
  const aniso = (q: number): number => F.kapA[q] / Math.max(1e-9, F.kapB[q]);
  log(`    kapA (1/mm) area-wt quantiles, over-bar: ${fmtQ(wq(over, (q) => F.kapA[q], P), 4)}`);
  log(`    kapB (1/mm) area-wt quantiles, over-bar: ${fmtQ(wq(over, (q) => F.kapB[q], P), 5)}`);
  log(`    ANISOTROPY kapA/kapB, area-wt quantiles: ${fmtQ(wq(over, aniso, P), 2)}`);
  log(`    facet long-axis MISALIGNMENT vs the slow direction (deg, 0 = already aligned, 90 = worst):`);
  log(`      over-bar: ${fmtQ(wq(over, (q) => F.misalignDeg[q], P), 2)}`);
  log(`      ALL     : ${fmtQ(wq(Array.from({ length: NS }, (_v, i) => i).filter((q) => Number.isFinite(F.normDeg[q])), (q) => F.misalignDeg[q], P), 2)}`);
  // isotropic cost: chord ~ d^2 => shrink by sqrt(chord/bar) => (chord/bar) triangles.
  let isoCost = 0; let anisoCost5 = 0; let anisoCost20 = 0; let aW = 0;
  for (let q = 0; q < NS; q += 1) {
    if (!Number.isFinite(F.normDeg[q])) continue;
    const m = Math.max(1, F.tangUm[q] / BAR_UM);
    const a = aniso(q);
    aW += F.area[q];
    isoCost += m * F.area[q];
    anisoCost5 += Math.max(1, m / Math.min(5, a)) * F.area[q];
    anisoCost20 += Math.max(1, m / Math.min(20, a)) * F.area[q];
  }
  log('');
  log(`    AREA-WEIGHTED TRIANGLE MULTIPLIER to clear the ${BAR_UM} um chord bar (model: chord ~ d^2):`);
  log(`      isotropic refinement          : ${(isoCost / Math.max(1e-30, aW)).toFixed(2)}x`);
  log(`      anisotropic, AR cap  5        : ${(anisoCost5 / Math.max(1e-30, aW)).toFixed(2)}x`);
  log(`      anisotropic, AR cap 20        : ${(anisoCost20 / Math.max(1e-30, aW)).toFixed(2)}x`);
  log('    (the isotropic column is a MODEL; frontierRefine.ts measures the same quantity by actually');
  log('     refining and re-scoring — compare the two before quoting either.)');
}

if (NDJSON) {
  const lines: string[] = [];
  for (let q = 0; q < NS; q += 1) {
    if (!Number.isFinite(F.normDeg[q])) continue;
    lines.push(JSON.stringify({
      i: idx[q], ar: F.area[q], dm: F.diam[q], ma: F.minAng[q], cr: F.circR[q], rp: F.rhoP[q],
      nd: F.normDeg[q], tu: F.tangUm[q], clb: F.coneLBdeg[q], cub: F.coneUBdeg[q],
      sp: F.spreadDeg[q], kk: F.kinkDeg[q], of: F.overFracBar[q],
      dr: F.dRadUm[q], dp: F.dPerpUm[q], da: F.dAbsUm[q],
      th: F.th[q], z: F.z[q], r: F.rr[q], st: F.slopeTh[q], sz: F.slopeZ[q],
      ka: F.kapA[q], kb: F.kapB[q], mis: F.misalignDeg[q],
    }));
  }
  const p = `${OUTDIR}/FR_TAX_${TAG}.ndjson`;
  writeFileSync(p, `${lines.join('\n')}\n`);
  log('');
  log(`per-facet rows -> ${p}  (${lines.length} rows)`);
}
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

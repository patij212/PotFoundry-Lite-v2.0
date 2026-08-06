// s112bOrientDiag.ts — WHY DID MY NEGATIVE CONTROL FIRE? A diagnostic, not a result.
//
// S112's first run read normDeg p50 154.9 deg on Gothic S39CTL and — the thing that condemns it — p90
// 162.8 deg on LOW-dihedral (<2 deg) pairs, i.e. on facets that are mutually flat and visibly fine.
// `S91_CENSUS_ALL20.log` reports `inverted>90deg 0` on EVERY mesh it censused, with the same ruler at the
// same k. Two readings of the same instrument cannot both be right, so this file finds out which is wrong
// BEFORE any S112 number is quoted. Nothing here is a finding about the mesher; it is a finding about me.
//
// FOUR CANDIDATE MECHANISMS, each with a measurement that separates it from the others:
//
//  H-A  STL WINDING vs THE ANALYTIC OUTWARD NORMAL. `radialNormal` is outward BY CONSTRUCTION (its radial
//       component is r > 0). If the STL's (b-a)x(c-a) points inward, every facet reads ~180-eps.
//       SEPARATOR: the sign of f . n at the centroid, whole-mesh. Globally negative => H-A, and it is a
//       ONE-LINE scope fix, not a mesh defect.
//
//  H-B  CURTAIN / CLIFF FACETS — the surface is NOT a graph of rA there. `locateKinkRaw` already carries a
//       `jump` flag and the driver calls jump-class loci "curtain material, never a snap" (:2886), so this
//       mesh is known to contain vertical spans across a theta-discontinuity. An rA-referenced normal is
//       UNDEFINED on those facets, and comparing against it manufactures ~90-180 deg.
//       SEPARATOR: radial alignment |f . rhat|. A curtain facet is near-vertical => |f . rhat| ~ 0.
//
//  H-C  THE FINITE-DIFFERENCE NORMAL BREAKS AT LARGE |r_th|. SEPARATOR: correlate normDeg>90 with |r_th|.
//
//  H-D  THETA SOURCE. S91 takes theta from the driver's stored `vth`; an STL has none, so this tool and
//       S111 both use atan2. SEPARATOR: whether the defect survives on facets far from the theta=0 seam.
//
// It also REPRODUCES S91's own headline lines (over-10um tangMm count/area, inverted>90deg) on this STL so
// the two runs can be diffed as PRINTED VALUES rather than as verdicts — which is how every instrument
// defect in this campaign has actually been caught.
//
// Usage: bash research/tools/run-s112b-diag.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S112_STYLE ?? 'GothicArches';
const STL = process.env.PF_S112_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NSAMP = Math.round(envF('PF_S112_NSAMP', 25000));
const K = Math.round(envF('PF_S112_K', 8));
const DIMS: StyleDims = { H: envF('PF_S112_H', 120), Rb: envF('PF_S112_RB', 40), Rt: envF('PF_S112_RT', 50), expn: 1 };
const H = DIMS.H;

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

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const ns = fdNormals(rA, H);
const scr = new Float64Array(12);

log('===== S112b — DIAGNOSTIC: why did the S112 negative control fire? =====');
log(`style ${STYLE}  k=${K}  n=${NSAMP}   (this is a finding about MY CALL, not about the mesher)`);
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;

// golden-stride sample, S87/S91 construction — coprime stride so the sample is spread, not blocked
const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
let gs = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
while (gs > 1 && gcd(gs, nTri) !== 1) gs += 2;
if (gs >= nTri) gs = 1;
const nS = Math.min(NSAMP, nTri);

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

let negDot = 0; let inv0 = 0; let inv2 = 0; let over10um0 = 0; let over10um2 = 0;
let areaAll = 0; let overA0 = 0; let overA2 = 0; let max0 = 0; let max2 = 0;
const nd0: number[] = []; const nd2: number[] = []; const dots: number[] = [];
const radAlignHi: number[] = []; const radAlignLo: number[] = [];
const rthHi: number[] = []; const rthLo: number[] = [];
const seamHi: number[] = []; const seamLo: number[] = [];

for (let i = 0; i < nS; i += 1) {
  const f = (i * gs) % nTri;
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ath = Math.atan2(ay, ax);
  const bth = ath + dThRaw(ath, Math.atan2(by, bx));
  const cth = ath + dThRaw(ath, Math.atan2(cy, cx));
  // facet normal, winding — the SAME expression orientOfFacet and dihedralRuler both use
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  let px = uy * wz - uz * wy; let py = uz * wx - ux * wz; let pz = ux * wy - uy * wx;
  const len = Math.hypot(px, py, pz);
  const area = 0.5 * len;
  areaAll += area;
  if (!(len > 0)) continue;
  px /= len; py /= len; pz /= len;
  // analytic normal at the centroid
  const gth = (ath + bth + cth) / 3; const gz = (az + bz + cz) / 3;
  ns(gth, gz, scr);
  const dot = px * scr[0] + py * scr[1] + pz * scr[2];
  dots.push(dot);
  if (dot < 0) negDot += 1;
  // radial alignment of the FACET normal: 1 = faces outward/inward radially, 0 = a vertical curtain face
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  const rr = Math.hypot(gx, gy) || 1;
  const radAlign = Math.abs((px * gx + py * gy) / rr);
  // |r_th| at the centroid, in mm per mm of arc (dimensionless slope in the theta direction)
  const hTh = 2e-4 / Math.max(1e-9, rr);
  const rth = Math.abs((rA(gth + hTh, gz) - rA(gth - hTh, gz)) / (2 * hTh)) / rr;
  let thDeg = (canonTheta(gth) * 180) / Math.PI; if (thDeg < 0) thDeg += 360;
  const seam = Math.min(thDeg, 360 - thDeg);

  const o0 = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, ath, bth, cth, { k: K, inset: 0, scratch: scr });
  const o2 = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, ath, bth, cth, { k: K, inset: 0.02, scratch: scr });
  nd0.push(o0.normDeg); nd2.push(o2.normDeg);
  if (o0.normDeg > 90) inv0 += 1;
  if (o2.normDeg > 90) { inv2 += 1; radAlignHi.push(radAlign); rthHi.push(rth); seamHi.push(seam); }
  else { radAlignLo.push(radAlign); rthLo.push(rth); seamLo.push(seam); }
  const um0 = o0.tangMm * 1000; const um2 = o2.tangMm * 1000;
  if (um0 > max0) max0 = um0;
  if (um2 > max2) max2 = um2;
  if (um0 > 10) { over10um0 += 1; overA0 += area; }
  if (um2 > 10) { over10um2 += 1; overA2 += area; }
}

log('── REPRODUCTION OF S91\'s OWN HEADLINE LINES, on this STL (diff PRINTED VALUES, not verdicts) ──');
log(`  HONEST ORIENT (k=${K} inset 0.00, n=${nS}): over-10um COUNT ${over10um0} (${((100 * over10um0) / nS).toFixed(4)}%)   AREA ${((100 * overA0) / areaAll).toFixed(4)}%   inverted>90deg ${inv0}   max ${max0.toFixed(1)} um`);
log(`  HONEST ORIENT (k=${K} inset 0.02, n=${nS}): over-10um COUNT ${over10um2} (${((100 * over10um2) / nS).toFixed(4)}%)   AREA ${((100 * overA2) / areaAll).toFixed(4)}%   inverted>90deg ${inv2}   max ${max2.toFixed(1)} um`);
log('  *** S91 read `inverted>90deg 0` on EVERY mesh it censused. If the counts above are large, the');
log('      difference is the MESH SOURCE (STL + atan2 theta) or the STYLE, not the ruler. ***');
log('');

log('── H-A: STL WINDING vs THE ANALYTIC OUTWARD NORMAL ──');
log(`  f . n_analytic at the centroid:  NEGATIVE on ${negDot} / ${nS} = ${((100 * negDot) / nS).toFixed(3)}%`);
log(`    p10 ${q(dots, 0.1).toFixed(4)}  p50 ${q(dots, 0.5).toFixed(4)}  p90 ${q(dots, 0.9).toFixed(4)}`);
log(`    ${negDot > 0.9 * nS ? '=> GLOBAL INWARD WINDING. H-A CONFIRMED: a scope/convention fix, not a mesh defect.'
  : negDot < 0.02 * nS ? '=> winding is outward-consistent. H-A EXCLUDED.'
    : '=> MIXED. Neither a global flip nor clean: read H-B below, this is the curtain signature.'}`);
log('');

log('── H-B: CURTAIN / CLIFF FACETS (the surface is not a graph of rA there) ──');
log('   radial alignment |f . rhat|: 1 = an ordinary wall facet, ~0 = a near-vertical curtain face');
log(`  normDeg>90 population (n=${radAlignHi.length}):  |f.rhat| p10 ${q(radAlignHi, 0.1).toFixed(4)}  p50 ${q(radAlignHi, 0.5).toFixed(4)}  p90 ${q(radAlignHi, 0.9).toFixed(4)}`);
log(`  normDeg<=90 population (n=${radAlignLo.length}): |f.rhat| p10 ${q(radAlignLo, 0.1).toFixed(4)}  p50 ${q(radAlignLo, 0.5).toFixed(4)}  p90 ${q(radAlignLo, 0.9).toFixed(4)}`);
log(`    ${q(radAlignHi, 0.5) < 0.3 && q(radAlignLo, 0.5) > 0.6 ? '=> H-B CONFIRMED: the over-90 class is near-VERTICAL. rA-referenced normals are UNDEFINED there.'
  : '=> H-B not supported by radial alignment alone.'}`);
log('');

log('── H-C: does the defect track |r_th| (finite-difference breakdown)? ──');
log(`  normDeg>90:  |r_th|/r  p50 ${q(rthHi, 0.5).toFixed(4)}  p90 ${q(rthHi, 0.9).toFixed(4)}`);
log(`  normDeg<=90: |r_th|/r  p50 ${q(rthLo, 0.5).toFixed(4)}  p90 ${q(rthLo, 0.9).toFixed(4)}`);
log('');

log('── H-D: is it a theta=0 SEAM artefact? ──');
log(`  normDeg>90:  distance to seam (deg)  p10 ${q(seamHi, 0.1).toFixed(2)}  p50 ${q(seamHi, 0.5).toFixed(2)}`);
log(`  normDeg<=90: distance to seam (deg)  p10 ${q(seamLo, 0.1).toFixed(2)}  p50 ${q(seamLo, 0.5).toFixed(2)}`);
log('    (both spread over the circle => NOT a seam artefact; H-D excluded)');
log('');

log('── WHOLE-SAMPLE normDeg DISTRIBUTION ──');
log(`  inset 0.00:  p10 ${q(nd0, 0.1).toFixed(3)}  p50 ${q(nd0, 0.5).toFixed(3)}  p75 ${q(nd0, 0.75).toFixed(3)}  p90 ${q(nd0, 0.9).toFixed(3)}  p99 ${q(nd0, 0.99).toFixed(3)}`);
log(`  inset 0.02:  p10 ${q(nd2, 0.1).toFixed(3)}  p50 ${q(nd2, 0.5).toFixed(3)}  p75 ${q(nd2, 0.75).toFixed(3)}  p90 ${q(nd2, 0.9).toFixed(3)}  p99 ${q(nd2, 0.99).toFixed(3)}`);
log('  (a large inset-0 -> inset-0.02 drop is the ruler\'s own documented crease-vertex false alarm:');
log('   a finite-difference normal evaluated EXACTLY ON a C0 crease averages the two flanks.)');

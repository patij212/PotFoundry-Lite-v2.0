// S24 PRE-REGISTRATION PROBE — the S13 ruler autopsy, re-taken on the CURRENT substrate `_S22B`.
//
// WHY THIS RUNS BEFORE THE REGISTRATION AND NOT AFTER IT.
// F2 has to state an expected outer-iteration count, and the only honest source for that number is the
// driver's own accept ruler evaluated ON THE CARRIER the campaign's H2 max sits on. S13 measured
// 0.8031 um / 4.36x (site A) and 0.4165 um / 8.40x (site B) — but those were S12's carriers on the S12
// substrate, and the bisection substrate has moved four arms since (S15's across rule, S19's rings,
// S20/S21B's admission, S22/S22B's de-shard). Quoting S13's 4.36x for `_S22B` would be quoting a number
// measured on a different mesh.
//
// WHAT IT COMPUTES, per site:
//   * the nearest facet in `_S22B`'s STL to the recorded H2 witness point (the CARRIER),
//   * its 3-D aspect ratio and edge lengths (the S1 cap is 50 — sub-cap means SPLITTABLE, never refused),
//   * `sagAdaptiveRaw` at the driver's own REF_HS/NMIN/NMAX — THE ACCEPT RULER, in um,
//   * the blindness factor (true H2 / ruler) and `tolScale_needed = acceptTol / ruler`,
//   * the first power-of-two tolScale >= that, i.e. the ITERATION at which the loop's x2 escalation from
//     2 first queues the facet.
//
// ARTIFACT-ONLY. No mesher run, no audit, no file under src/ and no proven bridge file is touched.
import { readFileSync, existsSync } from 'node:fs';
import { buildRadiusFn } from '../bridge/labkit';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import type { StyleId, StyleDims } from '../../src/geometry/types';
import { canonTheta } from '../bridge/_sweepPredicate';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const rA = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const R = (th: number, z: number): number => rA(canonTheta(th), z);
// eslint-disable-next-line no-console
const log = console.log;

const EX = 'research/exchange/_strataConformBisect/';
const ARM = process.argv[2] ?? 'S22B';
// The driver appends `T` to the flag block when PF_CB_TIGHTEN is on, so a tightened iterate is `DS-HT_` and
// the control is `DS-H_`. Resolve rather than construct — the driver owns the tag.
const STL = ((): string => {
  for (const p of [`${EX}gothicarches_ring_DS-HT_${ARM}.stl`, `${EX}gothicarches_ring_DS-H_${ARM}.stl`]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`no STL for arm ${ARM} under ${EX} (tried DS-HT_ and DS-H_)`);
})();

const ACCEPT_UM = 3.5;              // PF_CB_ACCEPT=0.0035, `_S22B`'s own
const REF_HS = 0.03; const REF_NMIN = 12; const REF_NMAX = 64;   // the driver's own lattice constants

// THE SITES. (th, z, the H2 value the campaign records there). The first is the pinned congruent copy that
// has been the campaign's H2 max since `_S21A` — F1's decisive target.
const SITES: Array<[string, number, number, number]> = [
  ['PINNED congruent copy (the F1 target)', 6.021386, 113.45994, 25.063],
  ['S13 site A (S12 substrate, for continuity)', 5.637379, 44.16992, 37.899],
  ['S13 site B (S12 substrate, for continuity)', 4.062906384574188, 45.388962765957444, 40.006],
];

function ptTri(p: number[], a: number[], b: number[], c: number[]): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d1 = ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2];
  const d2 = ac[0] * ap[0] + ac[1] * ap[1] + ac[2] * ap[2];
  if (d1 <= 0 && d2 <= 0) return Math.hypot(ap[0], ap[1], ap[2]);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = ab[0] * bp[0] + ab[1] * bp[1] + ab[2] * bp[2];
  const d4 = ac[0] * bp[0] + ac[1] * bp[1] + ac[2] * bp[2];
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bp[0], bp[1], bp[2]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return Math.hypot(ap[0] - ab[0] * v, ap[1] - ab[1] * v, ap[2] - ab[2] * v); }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = ab[0] * cp[0] + ab[1] * cp[1] + ab[2] * cp[2];
  const d6 = ac[0] * cp[0] + ac[1] * cp[1] + ac[2] * cp[2];
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cp[0], cp[1], cp[2]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return Math.hypot(ap[0] - ac[0] * w, ap[1] - ac[1] * w, ap[2] - ac[2] * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(bp[0] - (c[0] - b[0]) * w, bp[1] - (c[1] - b[1]) * w, bp[2] - (c[2] - b[2]) * w);
  }
  const den = 1 / (va + vb + vc); const v = vb * den; const w = vc * den;
  return Math.hypot(ap[0] - ab[0] * v - ac[0] * w, ap[1] - ab[1] * v - ac[1] * w, ap[2] - ab[2] * v - ac[2] * w);
}

/**
 * THE SURFACE'S OWN DEMAND at (th,z): the chord length whose SAGITTA against the analytic surface equals
 * `targetUm`. This is the quantity S23-T tabulated as `sag(h) = 10 um  =>  h = 1.7 um` at ITS witness, and
 * the reason it is re-taken here is that the construction road's 36.4 um floor made it decisive there while
 * the bisection driver has no such floor (FLOOR_MM = 1.5 um, weld ~50 nm) — so the same number means a
 * DIFFERENT thing on this road and has to be read on this road's own site.
 * Measured in both surface directions; the binding one is the smaller h.
 */
function sagOfChord(th: number, z: number, dirTh: number, dirZ: number, hMm: number): number {
  // endpoints of a chord of 3-D length ~hMm centred on (th,z), stepped in the (th,z) plane
  const r0 = R(th, z);
  const arcPerTh = r0;                       // d(arc)/d(theta) at this radius
  const n = Math.hypot(dirTh * arcPerTh, dirZ);
  const sTh = (dirTh * arcPerTh) / n; const sZ = dirZ / n;   // unit step in (arc, z)
  const half = hMm / 2;
  const th0 = th - (half * sTh) / arcPerTh; const z0 = z - half * sZ;
  const th1 = th + (half * sTh) / arcPerTh; const z1 = z + half * sZ;
  const P = (t: number, zz: number): number[] => { const r = R(t, zz); return [r * Math.cos(t), r * Math.sin(t), zz]; };
  const A = P(th0, z0); const B = P(th1, z1);
  const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
  const uu = ux * ux + uy * uy + uz * uz;
  let worst = 0;
  const N = 512;
  for (let i = 1; i < N; i += 1) {
    const f = i / N;
    const Q = P(th0 + (th1 - th0) * f, z0 + (z1 - z0) * f);
    const w = ((Q[0] - A[0]) * ux + (Q[1] - A[1]) * uy + (Q[2] - A[2]) * uz) / uu;
    const d = Math.hypot(Q[0] - A[0] - ux * w, Q[1] - A[1] - uy * w, Q[2] - A[2] - uz * w);
    if (d > worst) worst = d;
  }
  return worst * 1000;   // um
}

/** bisect on h so that sagOfChord(h) == targetUm. Returns h in um. */
function demandUm(th: number, z: number, dirTh: number, dirZ: number, targetUm: number): number {
  let lo = 1e-5; let hi = 4;    // mm
  if (sagOfChord(th, z, dirTh, dirZ, hi) < targetUm) return hi * 1000;
  for (let i = 0; i < 60; i += 1) {
    const mid = Math.sqrt(lo * hi);
    if (sagOfChord(th, z, dirTh, dirZ, mid) > targetUm) hi = mid; else lo = mid;
  }
  return Math.sqrt(lo * hi) * 1000;
}

const buf = readFileSync(STL);
const nTri = buf.readUInt32LE(80);
log(`===== S24 PRE-REGISTRATION RULER PROBE =====`);
log(`mesh ${STL}   ${nTri} triangles   acceptTol ${ACCEPT_UM} um   REF_HS ${REF_HS} n in [${REF_NMIN},${REF_NMAX}]`);
log('');

for (const [name, sth, sz, h2um] of SITES) {
  const r = R(sth, sz);
  const P = [r * Math.cos(sth), r * Math.sin(sth), sz];
  let best = Infinity; let bestTri = -1;
  for (let t = 0; t < nTri; t += 1) {
    const o = 84 + t * 50 + 12;
    const ax = buf.readFloatLE(o); const ay = buf.readFloatLE(o + 4); const az = buf.readFloatLE(o + 8);
    // cheap reject on the first vertex before the full point-triangle
    // EXACT reject, not a heuristic: the mesh's longest edge is 2,921 um (the designed lattice's own MAX,
    // S22B derivation), so a facet whose FIRST vertex is > 5 mm from P has no point closer than
    // 5 - 2.921 = 2.079 mm. Rejecting only once `best` is already under 2.0 mm therefore cannot lose the
    // true nearest facet. (Cross-checked: this reads 25.062 um where the Part-B auditor reads 25.063.)
    const dx = ax - P[0]; const dy = ay - P[1]; const dz = az - P[2];
    if (dx * dx + dy * dy + dz * dz > 25 && best < 2.0) continue;
    const A = [ax, ay, az];
    const B = [buf.readFloatLE(o + 12), buf.readFloatLE(o + 16), buf.readFloatLE(o + 20)];
    const C = [buf.readFloatLE(o + 24), buf.readFloatLE(o + 28), buf.readFloatLE(o + 32)];
    const d = ptTri(P, A, B, C);
    if (d < best) { best = d; bestTri = t; }
  }
  const o = 84 + bestTri * 50 + 12;
  const V: number[] = [];
  for (let k = 0; k < 9; k += 1) V.push(buf.readFloatLE(o + k * 4));
  const e = [
    Math.hypot(V[3] - V[0], V[4] - V[1], V[5] - V[2]),
    Math.hypot(V[6] - V[3], V[7] - V[4], V[8] - V[5]),
    Math.hypot(V[0] - V[6], V[1] - V[7], V[2] - V[8]),
  ];
  const s = (e[0] + e[1] + e[2]) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - e[0]) * (s - e[1]) * (s - e[2])));
  const inr = area / Math.max(1e-12, s);
  const ar3 = Math.max(...e) / Math.max(1e-12, 2 * inr);
  // PARAMETRIC aspect, in the (rRef*theta, z) plane at the campaign's own rRef = 45 (the seed's hardcoded
  // reference radius, _strataAlignedSeed.ts:408). Reported beside the 3-D AR because S13's table did, and
  // because the S1 cap is on the 3-D quantity while the census's tail lives on the parametric one.
  const RREF = 45;
  const pth = [0, 3, 6].map((o2) => canonTheta(Math.atan2(V[o2 + 1], V[o2])));
  // unwrap the three thetas onto one branch before differencing
  const base = pth[0];
  const pu = pth.map((t) => { let d = t - base; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return (base + d) * RREF; });
  const pv = [V[2], V[5], V[8]];
  const pe = [
    Math.hypot(pu[1] - pu[0], pv[1] - pv[0]),
    Math.hypot(pu[2] - pu[1], pv[2] - pv[1]),
    Math.hypot(pu[0] - pu[2], pv[0] - pv[2]),
  ];
  const ps = (pe[0] + pe[1] + pe[2]) / 2;
  const pArea = Math.sqrt(Math.max(0, ps * (ps - pe[0]) * (ps - pe[1]) * (ps - pe[2])));
  const parAR = Math.max(...pe) / Math.max(1e-12, 2 * (pArea / Math.max(1e-12, ps)));
  const M: SagMesh = {
    ta: [0], tb: [1], tc: [2],
    vx: [V[0], V[3], V[6]], vy: [V[1], V[4], V[7]], vz: [V[2], V[5], V[8]],
    vth: [canonTheta(Math.atan2(V[1], V[0])), canonTheta(Math.atan2(V[4], V[3])), canonTheta(Math.atan2(V[7], V[6]))],
  };
  const sagRef = sagAdaptiveRaw(R, M, 0, REF_HS, REF_NMIN, REF_NMAX, makeSagArgmax()) * 1000;
  const need = ACCEPT_UM / sagRef;
  // the loop escalates x2 per re-exceedance starting at 2 -> the field APPLIED at outer iteration k is 2^(k-1)
  let k = 1; while (2 ** k < need && k < 12) k += 1;
  log(`--- ${name}   th ${sth} z ${sz} ---`);
  log(`  carrier tri ${bestTri}   witness->carrier ${(best * 1000).toFixed(3)} um`);
  log(`  edges3d ${e.map((x) => (x * 1000).toFixed(1)).join(' / ')} um   area ${area.toFixed(6)} mm^2   3-D AR ${ar3.toFixed(2)} (S1 cap 50)   parAR ${parAR.toFixed(2)}`);
  log(`  carrier vertices: ${[0, 3, 6].map((o2) => `(${V[o2].toFixed(6)},${V[o2 + 1].toFixed(6)},${V[o2 + 2].toFixed(6)})`).join(' ')}`);
  log(`  DRIVER'S ACCEPT RULER (sagAdaptive, plane): ${sagRef.toFixed(4)} um`);
  log(`  recorded H2 there: ${h2um} um   =>  BLINDNESS ${(h2um / sagRef).toFixed(1)}x`);
  log(`  tolScale needed to QUEUE it: ${need.toFixed(2)}x  =>  first power of two that queues it: ${2 ** k}x`);
  log(`  => the field is 2^(k-1) at outer iteration k, so it is first APPLIED at OUTER ITERATION ${k + 1}`);
  const dTh = demandUm(sth, sz, 1, 0, 10);
  const dZ = demandUm(sth, sz, 0, 1, 10);
  const dD = demandUm(sth, sz, 1, 1, 10);
  const bind = Math.min(dTh, dZ, dD);
  log(`  SURFACE'S OWN DEMAND for a 10 um sagitta: theta ${dTh.toFixed(1)} um | z ${dZ.toFixed(1)} um | diag ${dD.toFixed(1)} um`
    + `  =>  BINDING ${bind.toFixed(1)} um`);
  log(`  the carrier's longest edge is ${(Math.max(...e) * 1000).toFixed(1)} um  =>  h must fall x${(Math.max(...e) * 1000 / bind).toFixed(2)}`
    + `  = ${(Math.log2(Math.max(...e) * 1000 / bind)).toFixed(2)} halvings  (local triangle count x${(4 ** Math.log2(Math.max(...e) * 1000 / bind)).toFixed(0)})`);
  log(`  FLOOR_MM (PF_CB_FLOOR_UM default) = 1.5 um: the demand is ${bind < 1.5 ? '*** BELOW THE REFINEMENT FLOOR ***' : `x${(bind / 1.5).toFixed(1)} ABOVE the refinement floor — reachable`}`);
  log('');
}

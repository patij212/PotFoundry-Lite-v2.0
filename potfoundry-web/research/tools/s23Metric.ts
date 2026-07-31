// s23Metric.ts — S23 PREREQUISITE: THE STABLE METRIC KERNEL, TRANSCRIBED AND RE-VALIDATED, PLUS THE
// `arM` CENSUS THAT S23-M's ADDENDUM A1 REGISTERED AS A CENSUS AND A RANKING KEY AND NOT AS A GATE.
// ARTIFACT-ONLY: no mesher run, no driver edit, no `src/` edit, no default flipped.
//
// Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23Metric.ts --bundle --platform=node \
//     --format=cjs --target=node20 --external:playwright --external:playwright-core \
//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23met.cjs
//   node research/bridge/out/_run_s23met.cjs <ARM>
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AND WHAT IT IS ALLOWED TO CONCLUDE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S23-M's Stage 0 filed a MEASURED numerical defect in the certified kernel:
// `src/renderers/webgpu/parametric/conforming/tierC/surfaceMetricField.ts` takes the eigenvector of a
// symmetric 2x2 as `(b, l1 - a)`. On this near-cylindrical wall the first fundamental form is near-diagonal
// (measured `F = -6.1e-14` against `E = 1.7e3`, `G = 1.0`), so `b` is at the rounding floor AND `l1 - a`
// carries ~1e-10 of cancellation against a true value of ~1e-30. Both components are noise and the
// eigenvector comes out as the WRONG AXIS: at th 5.706267 z 14.935075, where `II = diag(-41.1, -9.5e-12)`,
// the kernel reports `kappa2 = -38.06` where the true value is `-9.4e-12`.
//
// S23's placement depends on correct eigenframes, so the verified replacement — DECLARED ADAPTATION 3,
// `M = SUM_i mu_i (I v_i)(I v_i)^T / (v_i^T I v_i)` solved directly from `II v = kappa I v`, with no matrix
// square root and no nested eigen-decomposition — is TRANSCRIBED here from `research/tools/s23mPreflight.ts`
// and RE-VALIDATED against that tool's own identities BEFORE anything uses it:
//   T1a  the defining equation `M v_i = mu_i I v_i`                        must read < 1e-6
//   T3   a metric-equilateral element must read `arM = 1.732`              must read < 1e-6
// `src/` IS NOT TOUCHED AND IS NOT IMPORTED HERE. The defect stays filed against the certified file; this
// arm neither repairs it there nor depends on it.
//
// AND THE STANDING LIMIT, CARRIED VERBATIM FROM S23-M SO IT CANNOT BE LOST: `arM` IS A CENSUS AND A
// RANKING KEY, NEVER AN UNSTRANDING GATE. S23-M measured why — it is strictly MORE severe than `aspect3`
// essentially everywhere, so a gate tight enough to catch the plates refuses vastly more than the AR-50 cap
// and cannot unstrand the stranded set. Nothing in this file refuses anything.
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const H = 120;
const RAD2DEG = 180 / Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const ARM = process.argv[2] ?? 'S22B';
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';

// ── the metric's registered parameters, verbatim from S23-M ───────────────────────────────────────────
const ACCEPT_TOL = 0.0035;
const MET_TOL = ACCEPT_TOL; const MET_HMIN = 0.02; const MET_HMAX = 8;
const FD_UM = Number(process.env.S23_FD_UM ?? 25);
// ── ALT_FLOOR, addendum A3, carried into S23's acceptance ─────────────────────────────────────────────
const F32_ULP = Math.pow(2, -17);
const ALT_K = 100;
const ALT_FLOOR = ALT_K * F32_ULP;
const NORMAL_BOUND_DEG = (Math.sqrt(3) / ALT_K) * RAD2DEG;

type Sym2 = [number, number, number];
type V3 = [number, number, number];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** `_shapeGuard.aspect3`, verbatim: longestEdge * perimeter / (4 * area). Infinity on exact degeneracy. */
function aspect3(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  const L = Math.max(e0, e1, e2);
  return (L * (e0 + e1 + e2)) / (4 * area);
}
/** min altitude = 2*area / longestEdge. The quantity the AR cap was a proxy for (A3). */
function minAlt(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const L = Math.max(e0, e1, e2);
  return L > 0 ? (2 * area) / L : 0;
}
/** the symmetric-2x2 eigen-solver, used ONLY to BUILD T3's probe element — never inside the metric. */
function eigSym2(a: number, b: number, c: number): { l1: number; l2: number; e1: [number, number]; e2: [number, number] } {
  const tr = a + c; const det = a * c - b * b; const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc; const l2 = tr / 2 - disc;
  let ex: number; let ey: number;
  if (Math.abs(b) > 1e-300) {
    ex = b; ey = l1 - a; const el = Math.hypot(ex, ey);
    if (el > 1e-300) { ex /= el; ey /= el; } else { ex = 1; ey = 0; }
  } else if (a >= c) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
  return { l1, l2, e1: [ex, ey], e2: [-ey, ex] };
}

const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const R = (th: number, z: number): number => rA(th, z);
const Sxyz = (th: number, z: number): V3 => { const r = R(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };

let lastFEG: Sym2 = [0, 0, 0]; let lastII: Sym2 = [0, 0, 0];
/**
 * THE ANISO (II,I) CREASE-ALIGNED METRIC IN (theta, z), WITH DECLARED ADAPTATION 3.
 * Transcribed from `research/tools/s23mPreflight.ts` (S23-M Stage 0, verified there three ways and
 * re-verified here by T1a/T3). Two FD steps rather than one, because (theta, z) have different units and
 * the step must be sub-feature in BOTH directions — S13 measured the crease turning over in 83-106 um.
 * `iso` selects the isotropic g/h^2 branch, which S23-M measured is NOT quite the no-op the derivation
 * predicted (ratio p50 1.000020 but p90 1.051, p99 6.58 — the residual is the linearisation).
 */
function metricAt(th: number, z: number, hTh: number, hZ: number, iso: boolean): Sym2 {
  const muMin = 1 / (MET_HMAX * MET_HMAX); const muMax = 1 / (MET_HMIN * MET_HMIN);
  const zz = Math.min(Math.max(z, hZ), H - hZ);
  const c = Sxyz(th, zz);
  const Su = sub3(Sxyz(th + hTh, zz), Sxyz(th - hTh, zz)).map((v) => v / (2 * hTh)) as V3;
  const St = sub3(Sxyz(th, zz + hZ), Sxyz(th, zz - hZ)).map((v) => v / (2 * hZ)) as V3;
  const Suu = sub3(sub3(Sxyz(th + hTh, zz), c), sub3(c, Sxyz(th - hTh, zz))).map((v) => v / (hTh * hTh)) as V3;
  const Stt = sub3(sub3(Sxyz(th, zz + hZ), c), sub3(c, Sxyz(th, zz - hZ))).map((v) => v / (hZ * hZ)) as V3;
  const pp = Sxyz(th + hTh, zz + hZ); const pm = Sxyz(th + hTh, zz - hZ);
  const mp = Sxyz(th - hTh, zz + hZ); const mm = Sxyz(th - hTh, zz - hZ);
  const Sut = [0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm[k]) / (4 * hTh * hZ)) as V3;
  let n: V3 = [Su[1] * St[2] - Su[2] * St[1], Su[2] * St[0] - Su[0] * St[2], Su[0] * St[1] - Su[1] * St[0]];
  const nl = Math.hypot(n[0], n[1], n[2]);
  const E = dot3(Su, Su); const F = dot3(Su, St); const G = dot3(St, St);
  if (!(nl > 1e-30) || !(E * G - F * F > 1e-30)) return [muMin, 0, muMin];
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const L = dot3(Suu, n); const Mn = dot3(Sut, n); const N = dot3(Stt, n);
  lastFEG = [E, F, G]; lastII = [L, Mn, N];
  if (iso) {
    const a = E * G - F * F; const b = -(E * N + G * L - 2 * F * Mn); const cc = L * N - Mn * Mn;
    let kMax = 0;
    if (Math.abs(a) > 1e-30) {
      const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc));
      kMax = Math.max(Math.abs((-b + disc) / (2 * a)), Math.abs((-b - disc) / (2 * a)));
    }
    const hRaw = kMax > 1e-9 ? Math.sqrt((8 * MET_TOL) / kMax) : MET_HMAX;
    const h3 = Math.min(Math.max(hRaw, MET_HMIN), MET_HMAX);
    const inv = 1 / (h3 * h3);
    return [E * inv, F * inv, G * inv];
  }
  // ── DECLARED ADAPTATION 3 — THE SAME OBJECT, COMPUTED STABLY. No matrix square root, no nested eigen.
  const qa = E * G - F * F;
  const qb = -(E * N + G * L - 2 * F * Mn);
  const qc = L * N - Mn * Mn;
  if (!(Math.abs(qa) > 1e-30)) return [muMin, 0, muMin];
  const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
  const qq = -0.5 * (qb + (qb >= 0 ? disc : -disc));
  const k1 = qq !== 0 ? qq / qa : -qb / (2 * qa);
  const k2 = qq !== 0 ? qc / qq : -qb / (2 * qa);
  const mu1 = Math.min(Math.max(Math.abs(k1) / (8 * MET_TOL), muMin), muMax);
  const mu2 = Math.min(Math.max(Math.abs(k2) / (8 * MET_TOL), muMin), muMax);
  // UMBILIC: equal principal curvatures => any I-orthogonal basis reconstructs mu*I, so M = mu*g exactly.
  // This is the branch in which the aniso metric REDUCES TO g/h^2, and it is taken, not approximated.
  if (Math.abs(k1 - k2) <= 1e-12 * (Math.abs(k1) + Math.abs(k2) + 1e-300)) return [mu1 * E, mu1 * F, mu1 * G];
  const out: Sym2 = [0, 0, 0];
  for (const [kk, mu] of [[k1, mu1], [k2, mu2]] as Array<[number, number]>) {
    const p = L - kk * E; const q = Mn - kk * F; const r = N - kk * G;
    let v0: number; let v1: number;
    if (Math.hypot(p, q) >= Math.hypot(q, r)) { v0 = -q; v1 = p; } else { v0 = -r; v1 = q; }
    const vl = Math.hypot(v0, v1);
    if (!(vl > 0)) { v0 = 1; v1 = 0; } else { v0 /= vl; v1 /= vl; }
    const iv0 = E * v0 + F * v1; const iv1 = F * v0 + G * v1;
    const den = E * v0 * v0 + 2 * F * v0 * v1 + G * v1 * v1;
    if (!(den > 0)) continue;
    out[0] += (mu * iv0 * iv0) / den; out[1] += (mu * iv0 * iv1) / den; out[2] += (mu * iv1 * iv1) / den;
  }
  return out;
}
/** Factor M = LtL, map the two parametric edge vectors through L, take aspect3 of the planar triangle. */
function metricAR(
  thA: number, zA: number, thB: number, zB: number, thC: number, zC: number, hTh: number, hZ: number, iso: boolean,
): number {
  const dB1 = dThRaw(thA, thB); const dC1 = dThRaw(thA, thC);
  const thc = thA + (dB1 + dC1) / 3; const zc = (zA + zB + zC) / 3;
  const [m00, m01, m11] = metricAt(canonTheta(thc), zc, hTh, hZ, iso);
  if (!(m00 > 0) || !(m00 * m11 - m01 * m01 > 0)) return Infinity;
  const l00 = Math.sqrt(m00); const l01 = m01 / l00;
  const l11 = Math.sqrt(Math.max(0, m11 - l01 * l01));
  const map = (dth: number, dz: number): [number, number] => [l00 * dth + l01 * dz, l11 * dz];
  const [bx, by] = map(dB1, zB - zA); const [cx, cy] = map(dC1, zC - zA);
  return aspect3(0, 0, 0, bx, by, 0, cx, cy, 0);
}

const hTh = (FD_UM * 1e-3) / rRef; const hZ = FD_UM * 1e-3;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// T1a / T3 — THE PREFLIGHT'S OWN IDENTITIES, RE-RUN HERE BEFORE ANYTHING USES THE KERNEL
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('=== S23 PREREQUISITE — THE STABLE METRIC KERNEL, TRANSCRIBED AND RE-VALIDATED ===');
log(`  aniso (II,I), tol ${(MET_TOL * 1000).toFixed(1)} um  hMin ${MET_HMIN} mm  hMax ${MET_HMAX} mm  FD step ${FD_UM} um (arc and z)`);
log(`  ALT_FLOOR ${(ALT_FLOOR * 1000).toFixed(4)} um = ${ALT_K} x f32 ulp  =>  shipped normal error <= ${NORMAL_BOUND_DEG.toFixed(3)} deg  (addendum A3)`);

log('\n--- T1a: the defining equation  M v_i = mu_i I v_i  (independent of how M was assembled) ---');
let t1aWorst = 0; let t1aN = 0;
for (const th of [0.17, 0.83, 1.3593, 2.41, 3.02, 4.06, 5.706267, 6.02]) {
  for (const z of [7, 14.935075, 23, 44.16992, 61, 76.40, 95, 113.45994]) {
    const M = metricAt(canonTheta(th), z, hTh, hZ, false);
    const [E, F, G] = lastFEG; const [L, Mn, N] = lastII;
    const qa = E * G - F * F; const qb = -(E * N + G * L - 2 * F * Mn); const qc = L * N - Mn * Mn;
    if (!(Math.abs(qa) > 1e-30)) continue;
    const dq = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
    const qq = -0.5 * (qb + (qb >= 0 ? dq : -dq));
    const ks = qq !== 0 ? [qq / qa, qc / qq] : [-qb / (2 * qa), -qb / (2 * qa)];
    for (const kk of ks) {
      const p = L - kk * E; const q = Mn - kk * F; const r = N - kk * G;
      let v0: number; let v1: number;
      if (Math.hypot(p, q) >= Math.hypot(q, r)) { v0 = -q; v1 = p; } else { v0 = -r; v1 = q; }
      const vl = Math.hypot(v0, v1); if (!(vl > 0)) continue;
      v0 /= vl; v1 /= vl;
      const mu = Math.min(Math.max(Math.abs(kk) / (8 * MET_TOL), 1 / (MET_HMAX * MET_HMAX)), 1 / (MET_HMIN * MET_HMIN));
      const mv0 = M[0] * v0 + M[1] * v1; const mv1 = M[1] * v0 + M[2] * v1;
      const iv0 = mu * (E * v0 + F * v1); const iv1 = mu * (F * v0 + G * v1);
      const sc = Math.max(Math.abs(iv0), Math.abs(iv1), 1e-300);
      t1aWorst = Math.max(t1aWorst, Math.max(Math.abs(mv0 - iv0), Math.abs(mv1 - iv1)) / sc);
      t1aN += 1;
    }
  }
}
const T1A = t1aWorst < 1e-6;
log(`  ${t1aN} generalized eigenpairs over 64 probe points   WORST residual ${t1aWorst.toExponential(3)}`
  + `   bar < 1e-6   ${T1A ? '*** SOUND ***' : '*** UNSOUND — STOP ***'}`);

log('\n--- T3: the instrument itself — a METRIC-PERFECT element must read arM = 1.732 ---');
let t3Worst = 0;
for (const th of [0.31, 1.37, 2.9, 4.51, 5.88]) {
  for (const z of [22, 45, 67, 91, 113]) {
    const [m00, m01, m11] = metricAt(th, z, hTh, hZ, false);
    const { l1, l2, e1, e2 } = eigSym2(m00, m01, m11);
    const u1 = [e1[0] / Math.sqrt(l1), e1[1] / Math.sqrt(l1)];
    const u2 = [e2[0] / Math.sqrt(l2), e2[1] / Math.sqrt(l2)];
    const rho = 1e-4;
    const P: Array<[number, number]> = [];
    for (const phi of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
      P.push([rho * (Math.cos(phi) * u1[0] + Math.sin(phi) * u2[0]), rho * (Math.cos(phi) * u1[1] + Math.sin(phi) * u2[1])]);
    }
    const got = metricAR(th + P[0][0], z + P[0][1], th + P[1][0], z + P[1][1], th + P[2][0], z + P[2][1], hTh, hZ, false);
    t3Worst = Math.max(t3Worst, Math.abs(got - Math.sqrt(3)) / Math.sqrt(3));
  }
}
const T3 = t3Worst < 1e-6;
log(`  25 probe points, metric-equilateral element CENTRED on the probe   WORST |arM - 1.732|/1.732 = ${t3Worst.toExponential(3)}`
  + `   bar < 1e-6   ${T3 ? '*** SOUND ***' : '*** UNSOUND — STOP ***'}`);

log('\n--- THE FILED DEFECT, RE-READ ON THE NAMED PROBE (th 5.706267, z 14.935075) ---');
{
  metricAt(canonTheta(5.706267), 14.935075, hTh, hZ, false);
  const [E, F, G] = lastFEG; const [L, Mn, N] = lastII;
  const qa = E * G - F * F; const qb = -(E * N + G * L - 2 * F * Mn); const qc = L * N - Mn * Mn;
  const dq = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
  const qq = -0.5 * (qb + (qb >= 0 ? dq : -dq));
  const k1 = qq / qa; const k2 = qc / qq;
  log(`  I = [E ${E.toExponential(4)}, F ${F.toExponential(3)}, G ${G.toExponential(4)}]`);
  log(`  II = [L ${L.toExponential(4)}, M ${Mn.toExponential(3)}, N ${N.toExponential(3)}]`);
  log(`  kappa1 ${k1.toExponential(4)}   kappa2 ${k2.toExponential(4)}`);
  log('  S23-M recorded the certified src reading kappa2 = -38.06 here where the true value is -9.4e-12.');
  log('  This transcription solves II v = kappa I v directly, so it never forms the ill-conditioned eigenvector.');
}
if (!T1A || !T3) { log('\n*** T1a/T3 FAILED — the kernel is NOT validated. STOP. ***'); process.exit(1); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE `arM` CENSUS — S23-M ADDENDUM A1. CENSUS AND RANKING ONLY. NOTHING IS REFUSED HERE.
// It doubles as the transcription's acceptance test: on `_S22B` it must reproduce S23-M's OWN recorded
// numbers — whole-mesh arM p50 11.58 / p99 239.13, designed-lattice arM p99 16.61, MET_AR 27.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const buf = readFileSync(`${EX}${ARM}.stl`);
const nTri = buf.readUInt32LE(80);
const xyz = new Float64Array(nTri * 9);
{ let o = 84; for (let t = 0; t < nTri; t += 1) { o += 12; for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; } o += 2; } }
log(`\n=== THE arM CENSUS — arm ${ARM}, ${nTri} facets (f32, as shipped) ===`);
const key = new Float32Array(3); const keyBytes = new Uint8Array(key.buffer);
const vmap = new Map<string, number>();
const vxA: number[] = []; const vyA: number[] = []; const vzA: number[] = []; const vthA: number[] = [];
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
function vid(x: number, y: number, z: number): number {
  key[0] = x; key[1] = y; key[2] = z;
  let s = '';
  for (let i = 0; i < 12; i += 1) s += String.fromCharCode(keyBytes[i]);
  const got = vmap.get(s);
  if (got !== undefined) return got;
  const id = vxA.length;
  vxA.push(x); vyA.push(y); vzA.push(z); vthA.push(canonTheta(Math.atan2(y, x)));
  vmap.set(s, id);
  return id;
}
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  ta[t] = vid(xyz[o], xyz[o + 1], xyz[o + 2]);
  tb[t] = vid(xyz[o + 3], xyz[o + 4], xyz[o + 5]);
  tc[t] = vid(xyz[o + 6], xyz[o + 7], xyz[o + 8]);
}
const vx = Float64Array.from(vxA); const vy = Float64Array.from(vyA);
const vz = Float64Array.from(vzA); const vth = Float64Array.from(vthA);
vmap.clear();
log(`  welded ${vx.length} vertices`);

const hSm = 1e-6;
function bestDot(th: number, z: number, fx: number, fy: number, fz: number): number {
  const r0 = R(th, z);
  const rTp = R(th + hSm, z); const rTm = R(th - hSm, z);
  const rZp = R(th, z + hSm); const rZm = R(th, z - hSm);
  const ct = Math.cos(th); const st = Math.sin(th);
  let best = -Infinity;
  for (const [rt, rz] of [
    [(rTp - rTm) / (2 * hSm), (rZp - rZm) / (2 * hSm)],
    [(rTp - r0) / hSm, (rZp - r0) / hSm], [(rTp - r0) / hSm, (r0 - rZm) / hSm],
    [(r0 - rTm) / hSm, (rZp - r0) / hSm], [(r0 - rTm) / hSm, (r0 - rZm) / hSm],
  ]) {
    const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const d = (fx * nx + fy * ny + fz * nz) / nl; if (d > best) best = d;
  }
  return best;
}
const fAR = new Float64Array(nTri); const fArM = new Float64Array(nTri);
const fAlt = new Float64Array(nTri); const fArea = new Float64Array(nTri); const fLong = new Float64Array(nTri);
for (let t = 0; t < nTri; t += 1) {
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  fAR[t] = aspect3(vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[c], vy[c], vz[c]);
  fAlt[t] = minAlt(vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[c], vy[c], vz[c]);
  const e0 = Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
  const e1 = Math.hypot(vx[b] - vx[c], vy[b] - vy[c], vz[b] - vz[c]);
  const e2 = Math.hypot(vx[c] - vx[a], vy[c] - vy[a], vz[c] - vz[a]);
  fLong[t] = Math.max(e0, e1, e2); fArea[t] = 0.5 * fLong[t] * fAlt[t];
  fArM[t] = metricAR(vth[a], vz[a], vth[b], vz[b], vth[c], vz[c], hTh, hZ, false);
}
const pct = (arr: Float64Array | number[], p: number): number => {
  const s = Array.from(arr).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
log(`  aspect3 : p50 ${pct(fAR, 0.5).toFixed(2)}  p90 ${pct(fAR, 0.9).toFixed(2)}  p99 ${pct(fAR, 0.99).toFixed(2)}`);
log(`  arM     : p50 ${pct(fArM, 0.5).toFixed(2)}  p90 ${pct(fArM, 0.9).toFixed(2)}  p99 ${pct(fArM, 0.99).toFixed(2)}`);
log(`  S23-M RECORDED on this same mesh: aspect3 p50 3.40 / p99 39.04;  arM p50 11.58 / p99 239.13`);

// the designed lattice, isolated by S22B's own signature — MET_AR is DERIVED from it, unchanged rule
const latt: number[] = [];
for (let t = 0; t < nTri; t += 1) {
  if (fArea[t] < 0.15 || fLong[t] < 1.0) continue;
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  let nx = (vy[b] - vy[a]) * (vz[c] - vz[a]) - (vz[b] - vz[a]) * (vy[c] - vy[a]);
  let ny = (vz[b] - vz[a]) * (vx[c] - vx[a]) - (vx[b] - vx[a]) * (vz[c] - vz[a]);
  let nz = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vy[b] - vy[a]) * (vx[c] - vx[a]);
  const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
  nx /= nl; ny /= nl; nz /= nl;
  const dB = dThRaw(vth[a], vth[b]); const dC = dThRaw(vth[a], vth[c]);
  const thc = canonTheta(vth[a] + (dB + dC) / 3); const zc = (vz[a] + vz[b] + vz[c]) / 3;
  if (!(Math.acos(Math.max(-1, Math.min(1, bestDot(thc, zc, nx, ny, nz)))) * RAD2DEG < 1)) continue;
  latt.push(t);
}
const lattM = latt.map((t) => fArM[t]).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
const lattP99 = lattM[Math.floor(0.99 * lattM.length)];
const MET_AR = Math.ceil(lattP99 * 1.6);
log(`\n  THE DESIGNED LATTICE (${latt.length} facets): arM p50 ${lattM[Math.floor(0.5 * lattM.length)].toFixed(2)}`
  + `  p99 ${lattP99.toFixed(2)}  MAX ${lattM[lattM.length - 1].toFixed(2)}`);
log(`  MET_AR DERIVED = ceil(1.6 x lattice arM p99) = ${MET_AR}   (S23-M recorded p99 16.61 -> MET_AR 27)`);
{
  const alts = Array.from(fAlt).sort((x, y) => x - y);
  const under = alts.filter((v) => v < ALT_FLOOR).length;
  log(`\n  ALT_FLOOR ${(ALT_FLOOR * 1000).toFixed(4)} um: ${under} of ${nTri} facets already below it`
    + ` (${((100 * under) / nTri).toFixed(4)}%)   (S23-M recorded 162 of 1,251,546 = 0.0129%)`);
}
log('\n  *** arM IS A CENSUS AND A RANKING KEY HERE, NEVER A GATE. Nothing above refuses anything. ***');

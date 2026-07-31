// s23mPreflight.ts — S23-M STAGE 0. THE PREMISE PRE-FLIGHT. ARTIFACT-ONLY: no mesher run, no driver edit.
//
// PROMOTED OUT OF `research/bridge/out/` (which is gitignored) because it produced a campaign-level
// refutation and the record must be reproducible — the P5 handoff's own rule: "move into research/tools/
// if it is to be relied on". Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23mPreflight.ts --bundle --platform=node \n//     --format=cjs --target=node20 --external:playwright --external:playwright-core \n//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23m.cjs
//   node research/bridge/out/_run_s23m.cjs <ARM>        # ARM = S22B | S22C | ...
//   S23M_FD_UM=<um> node research/bridge/out/_run_s23m.cjs S22B    # the registered FD-step sweep
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS ANSWERS, AND WHY IT IS A GO/NO-GO RATHER THAN A DIAGNOSTIC
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The S1 aspect cap (AR3 > 50 refuses the split) is DIRECTION-BLIND, and the record refutes it in both
// directions at once: the PLATES — the class the operator vetoes on — carry 3-D AR 1.8-8.9 and sail under
// it, while the STRANDED demand (4,307 sites, worst 95.473 um) is aligned anisotropy it refuses. S23-M
// proposes to cap MISALIGNMENT instead of magnitude. This tool asks, on the SHIPPED bytes and before any
// driver edit, whether that would actually unblock the population — the bar is registered in
// research/lab/2026-07-29-strata-perf-convergence-worklog.md, section "S23-M ... STAGE 0 REGISTERED".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE THING THAT MUST BE READ BEFORE THE NUMBERS: `M = g/h²` IS SHAPE-BLIND, BY DERIVATION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `h²` is a per-node SCALAR and aspect ratio is scale-invariant (_shapeGuard.ts's own header says so), so
// shape under `M = g/h²` is shape under `g`; and the g-length of a parameter vector is `|J d|`, the
// LINEARISED 3-D length. An isotropic-M shape gate is therefore the CURRENT gate. The direction-aware
// member of the same certified kernel is what this arm needs: `anisoCurvatureMetric`, the crease-aligned
// (II,I) metric, which reduces EXACTLY to g/h² when the two principal curvatures agree. Both branches are
// scored below and the no-op claim is MEASURED, not asserted (check T2).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION, NOT IMPORT — the S-e separation, applied to the metric
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The metric kernel and the shape guard are TRANSCRIBED here operand-for-operand. The certified src copy
// is imported ONCE, in check T1, purely to prove the transcription faithful and report the disagreement —
// that is how S20.1 proved its own `footBack`. Nothing else imports it. `_facetTruthLib`, `_sharp3dRef`,
// `_shapeGuard`, `_judgeNormal` and `_judgeShape` are byte-untouched by this file.
// The two things that ARE imported are the analytic SURFACE (`_facetTruthRA` + the registry defaults) and
// the driver's own accept ruler (`_sagKernel`): measuring a different surface, or a different accept rule,
// would not be an independent instrument — it would be a different experiment.
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { anisoCurvatureMetric as srcAniso } from '../../src/renderers/webgpu/parametric/conforming/tierC/surfaceMetricField';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const H = 120;
const TWO_PI = 2 * Math.PI; const RAD2DEG = 180 / Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const ARM = process.argv[2] ?? 'S22B';
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';

// ── THE DRIVER'S CONSTANTS, verbatim from its own defaults (see _strataConformBisect.test.ts) ─────────
const SHAPE_AR = 50;            // PF_CB_SHAPE_AR
const ACCEPT_TOL = 0.0035;      // mm — acceptTol 3.500 um
const REF_HS = 0.03; const REF_NMIN = 12; const REF_NMAX = 64;
const MID3D_ITERS = 24; const MID3D_MAXSHIFT = 0.25;

// ── S23-M's OWN REGISTERED CONSTANTS ──────────────────────────────────────────────────────────────────
// ALT_FLOOR: derived in the registration from f32 arithmetic. The governing ulp over the shipped
// coordinates is z's (z in [64,128) => 2^-17 = 7.6294e-6 mm; x,y at r 40-50 sit in [32,64) at 3.8147e-6).
// Half-ulp per coordinate gives |d| <= (sqrt3/2)*ulp; two vertices can add, so dPhi <= sqrt3*ulp/a_min.
// With a_min = k*ulp the ulp CANCELS and dPhi <= sqrt3/k rad. Target dPhi <= 1.0 deg => k = 99.24,
// registered at k = 100.
const F32_ULP = Math.pow(2, -17);              // 7.6294e-6 mm — the binding binade (z up to 120 mm)
const ALT_K = 100;
const ALT_FLOOR = ALT_K * F32_ULP;             // 7.6294e-4 mm = 0.7629 um
const NORMAL_BOUND_DEG = (Math.sqrt(3) / ALT_K) * RAD2DEG;
// The metric's own parameters: tol is the DRIVER'S acceptTol, so the metric asks for the chord the accept
// rule asks for. hMin/hMax are the CONVERGE-B config. The FD step is SUB-FEATURE by construction — S13
// measured the crease turning over in 83-106 um, and the src kernel's own default (0.0022 in (u,t) =
// 0.62 mm of arc) would average it away.
const MET_TOL = ACCEPT_TOL; const MET_HMIN = 0.02; const MET_HMAX = 8;
const FD_UM = Number(process.env.S23M_FD_UM ?? 25);   // curvature FD step, um, in ARC and in z

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TRANSCRIBED PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
/** _shapeGuard.aspect3, verbatim: longestEdge * perimeter / (4 * area). Infinity on exact degeneracy. */
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
/** min altitude of a triangle = 2*area / longestEdge. The quantity the AR cap was a proxy for. */
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
/** _shapeGuard.signedAreaParam, verbatim. */
function signedAreaParam(thA: number, zA: number, thB: number, zB: number, thC: number, zC: number): number {
  return dThRaw(thA, thB) * (zC - zA) - (zB - zA) * dThRaw(thA, thC);
}
/** _shapeGuard.chordParam, verbatim — the 3-D midpoint solver the driver places with (PF_CB_MID3D on). */
function chordParam(
  lift: (s: number) => { x: number; y: number; z: number },
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, frac: number, iters: number,
): number {
  let lo = 0; let hi = 1;
  for (let i = 0; i < iters; i += 1) {
    const s = 0.5 * (lo + hi);
    const p = lift(s);
    const dA = Math.hypot(p.x - ax, p.y - ay, p.z - az);
    const dB = Math.hypot(p.x - bx, p.y - by, p.z - bz);
    if ((1 - frac) * dA <= frac * dB) lo = s; else hi = s;
  }
  return 0.5 * (lo + hi);
}

// ── the symmetric-2x2 algebra of the metric kernel, transcribed from tierC/surfaceMetricField.ts ──────
type Sym2 = [number, number, number];
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
function reconstructSym2(l1: number, l2: number, e1: [number, number], e2: [number, number]): Sym2 {
  return [l1 * e1[0] * e1[0] + l2 * e2[0] * e2[0], l1 * e1[0] * e1[1] + l2 * e2[0] * e2[1], l1 * e1[1] * e1[1] + l2 * e2[1] * e2[1]];
}
function powSym2(a: number, b: number, c: number, sign: 0.5 | -0.5): Sym2 {
  const { l1, l2, e1, e2 } = eigSym2(a, b, c);
  const p1 = sign === 0.5 ? Math.sqrt(l1) : 1 / Math.sqrt(l1);
  const p2 = sign === 0.5 ? Math.sqrt(l2) : 1 / Math.sqrt(l2);
  return reconstructSym2(p1, p2, e1, e2);
}
function congruenceSym2(s: Sym2, x: Sym2): Sym2 {
  const [s0, s1, s2] = s; const [x0, x1, x2] = x;
  const t00 = s0 * x0 + s1 * x1; const t01 = s0 * x1 + s1 * x2;
  const t10 = s1 * x0 + s2 * x1; const t11 = s1 * x1 + s2 * x2;
  return [t00 * s0 + t01 * s1, t00 * s1 + t01 * s2, t10 * s1 + t11 * s2];
}

type V3 = [number, number, number];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const R = (th: number, z: number): number => rA(th, z);
const Sxyz = (th: number, z: number): V3 => { const r = R(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };

/**
 * THE ANISO (II,I) CREASE-ALIGNED METRIC, IN (theta, z) COORDINATES.
 *
 * Transcribed from tierC/surfaceMetricField.ts `anisoCurvatureMetric`, with ONE stated adaptation: that
 * function parameterises by (u,t) with theta = u*TAU and z = t*H, so it can carry ONE finite-difference
 * step for both axes. This copy works directly in (theta, z), which have different units, so it carries
 * TWO steps — and it must, because the step has to be sub-feature in BOTH directions to see a crease that
 * turns over in ~80 um of arc. The relation to the certified copy is exact and is asserted in check T1:
 *      M_ut = Jt * M_thz * J,   J = diag(TAU, H).
 * `iso` selects the ISOTROPIC g/h^2 branch instead (h from kappa_MAX, applied equally) — the branch the
 * registration proves is a shape no-op.
 */
let LEGACY_EIG = false;
let lastFEG: Sym2 = [0, 0, 0]; let lastII: Sym2 = [0, 0, 0];
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
    // ISOTROPIC g/h^2: h = sqrt(8*tol/kappa_max), kappa_max the larger |principal| of I^-1 II.
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
  if (LEGACY_EIG) {
    const Ihalf = powSym2(E, F, G, 0.5); const Iinvhalf = powSym2(E, F, G, -0.5);
    const B = congruenceSym2(Iinvhalf, [L, Mn, N]);
    const eb = eigSym2(B[0], B[1], B[2]);
    const mu1 = Math.min(Math.max(Math.abs(eb.l1) / (8 * MET_TOL), muMin), muMax);
    const mu2 = Math.min(Math.max(Math.abs(eb.l2) / (8 * MET_TOL), muMin), muMax);
    return congruenceSym2(Ihalf, reconstructSym2(mu1, mu2, eb.e1, eb.e2));
  }
  // ── DECLARED ADAPTATION 3 — THE SAME OBJECT, COMPUTED STABLY. ─────────────────────────────────────
  // Solving `II v = kappa I v` directly gives, identically,
  //     M = SUM_i mu_i (I v_i)(I v_i)^T / (v_i^T I v_i),
  // with no matrix square root and no nested eigen-decomposition. It is the SAME M — the derivation is
  // in the T1 block — and it is what makes the ruler chart-invariant to machine precision (T1a).
  // WHY IT IS NEEDED, MEASURED AND NOT ASSERTED: the certified `eigSym2` picks the eigenvector as
  // `(b, l1 - a)`, and on a near-diagonal I (F is ~1e-14 on this near-cylindrical wall) BOTH of those are
  // at the rounding floor — `l1 - a` carries ~1e-10 of cancellation error against a true value of ~1e-30.
  // The eigenvector then comes out as the WRONG axis. Measured consequence at th 5.706267 z 14.935075:
  // kappa2 reads -38.06 where II is diag(-41.1, -9.5e-12) and I is diag(1701, 1.007), i.e. the true
  // kappa2 is -9.4e-12. The two principal directions are exchanged and mu2 lands on the wrong clamp.
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
    // columns of (II - kappa I) are orthogonal to v; take the better-conditioned one
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

/**
 * THE METRIC SHAPE QUANTITY. Factor M = LtL (Cholesky of the SPD 2x2), map the triangle's two parametric
 * edge vectors through L, and take `aspect3` of the resulting PLANAR triangle. arM = 1.732 is
 * metric-equilateral (aligned AND correctly sized); where curvature is isotropic arM equals the Euclidean
 * aspect3 by the kernel's own reduction, which is check T2.
 */
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// LOAD THE SHIPPED MESH — f32, the values that left the building (the S20.1 lesson)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const buf = readFileSync(`${EX}${ARM}.stl`);
const nTri = buf.readUInt32LE(80);
const xyz = new Float64Array(nTri * 9);
{ let o = 84; for (let t = 0; t < nTri; t += 1) { o += 12; for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; } o += 2; } }
log(`=== S23-M STAGE 0 — THE PREMISE PRE-FLIGHT.  arm ${ARM}, ${nTri} facets (f32, as shipped) ===`);
log(`  metric: aniso (II,I), tol ${(MET_TOL * 1000).toFixed(1)} um  hMin ${MET_HMIN} mm  hMax ${MET_HMAX} mm  FD step ${FD_UM} um (arc and z)`);
log(`  ALT_FLOOR ${(ALT_FLOOR * 1000).toFixed(4)} um = ${ALT_K} x f32 ulp ${(F32_ULP * 1e6).toFixed(4)} nm  =>  shipped normal error <= ${NORMAL_BOUND_DEG.toFixed(3)} deg`);

// WELD by exact f32 position, exactly as the driver's `addV` welds by 3-D position. The key is the raw
// f32 bit pattern, so two vertices are the same vertex iff the STL says they are.
const key = new Float32Array(3);
const keyBytes = new Uint8Array(key.buffer);
const vmap = new Map<string, number>();
const vx: number[] = []; const vy: number[] = []; const vz: number[] = []; const vth: number[] = [];
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
function vid(x: number, y: number, z: number): number {
  key[0] = x; key[1] = y; key[2] = z;
  let s = '';
  for (let i = 0; i < 12; i += 1) s += String.fromCharCode(keyBytes[i]);
  const got = vmap.get(s);
  if (got !== undefined) return got;
  const id = vx.length;
  vx.push(x); vy.push(y); vz.push(z); vth.push(canonTheta(Math.atan2(y, x)));
  vmap.set(s, id);
  return id;
}
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  ta[t] = vid(xyz[o], xyz[o + 1], xyz[o + 2]);
  tb[t] = vid(xyz[o + 3], xyz[o + 4], xyz[o + 5]);
  tc[t] = vid(xyz[o + 6], xyz[o + 7], xyz[o + 8]);
}
const nV = vx.length;
log(`  welded ${nV} vertices from ${nTri * 3} corners`);
const MESH: SagMesh = { ta, tb, tc, vth, vz, vx, vy };

// edge -> incident triangles (the driver's `edgeMap`, rebuilt from the artifact)
const edgeTris = new Map<number, number[]>();
const eKey = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a);
for (let t = 0; t < nTri; t += 1) {
  for (const [a, b] of [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]] as Array<[number, number]>) {
    const k = eKey(a, b);
    const l = edgeTris.get(k);
    if (l === undefined) edgeTris.set(k, [t]); else l.push(t);
  }
}
log(`  ${edgeTris.size} distinct edges`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// T1 / T2 — THE TRANSCRIPTION CHECKS, RUN BEFORE ANY POPULATION NUMBER IS PRODUCED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n--- T1: the (theta,z) transcription against the CERTIFIED src (u,t) kernel ---');
// THE RELATION IS EXACT AND IT IS A DERIVATION, NOT A HOPE. Solving `II v = kappa I v` gives
//     M = SUM_i mu_i (I v_i)(I v_i)^T / (v_i^T I v_i),
// and under a chart change `d = J d'` (I' = Jt I J, II' = Jt II J) the generalized eigenvectors go
// `v -> J^-1 v` with the SAME kappa, so `M' = Jt M J` identically. The two implementations therefore
// compute ONE object in two charts and may differ only by floating-point conditioning — which is
// genuinely different, because E_ut ~ 7e4 against E_thz ~ 2e3 and G_ut ~ 1.4e4 against G_thz ~ 1.
// SO THE CHECK IS ON THE GATE QUANTITY, NOT ON THE TENSOR: the two must return the same `arM` and,
// above all, the same ADMISSIBILITY VERDICT. That is the S20.1 discipline (108 of 108, exempting none).
{
  const hFD = (FD_UM * 1e-3) / H;                          // one (u,t) step, so both charts sample the SAME points
  const hThC = hFD * TWO_PI; const hZC = hFD * H;
  let worstInv = 0; let worstSrc = 0; let nSrcBad = 0; let nLegacyBad = 0; let n = 0; let seam = 0;
  const step = Math.max(1, Math.floor(nTri / 4000));
  for (let t = 0; t < nTri; t += step) {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    const dB1 = dThRaw(vth[a], vth[b]); const dC1 = dThRaw(vth[a], vth[c]);
    const thc = canonTheta(vth[a] + (dB1 + dC1) / 3); const zc = (vz[a] + vz[b] + vz[c]) / 3;
    // DECLARED ADAPTATION 2, and it is a CORRECTION rather than a difference of opinion: the src kernel
    // clamps `u` to [hFD, 1-hFD] exactly as it clamps `t`. `t` is a real boundary (the ring rims) and the
    // clamp is right there; `u` is PERIODIC — theta = 0 and theta = 2pi are the same material, the driver's
    // own `addV` welds across that seam by 3-D position, and the audit rA canonicalises theta. So this copy
    // clamps z and NOT theta. Seam-adjacent probes are counted and excluded rather than quietly averaged in.
    if (thc < hThC || thc > TWO_PI - hThC) { seam += 1; continue; }
    n += 1;
    // T1a — THE DEFINING EQUATION, CHECKED INDEPENDENTLY OF HOW M WAS ASSEMBLED.
    // M is the metric that assigns metric-length 1/sqrt(mu_i) along the i-th principal direction, i.e.
    //          M v_i = mu_i * I v_i     for the generalized eigenvectors of (II, I).
    // That identity holds only if the two eigenvectors really are I-orthogonal and the assembly is right,
    // so it tests BOTH at once, and it does not reuse the assembly's own arithmetic.
    const inThz = metricAt(thc, zc, hThC, hZC, false);
    const asUt: Sym2 = [inThz[0] * TWO_PI * TWO_PI, inThz[1] * TWO_PI * H, inThz[2] * H * H];
    {
      const [E, F, G] = lastFEG; const [L, Mn, N] = lastII;
      const qa = E * G - F * F; const qb = -(E * N + G * L - 2 * F * Mn); const qc = L * N - Mn * Mn;
      if (Math.abs(qa) > 1e-30) {
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
          const mv0 = inThz[0] * v0 + inThz[1] * v1; const mv1 = inThz[1] * v0 + inThz[2] * v1;
          const iv0 = mu * (E * v0 + F * v1); const iv1 = mu * (F * v0 + G * v1);
          const sc = Math.max(Math.abs(iv0), Math.abs(iv1), 1e-300);
          worstInv = Math.max(worstInv, Math.max(Math.abs(mv0 - iv0), Math.abs(mv1 - iv1)) / sc);
        }
      }
    }
    // T1b — AGREEMENT WITH THE CERTIFIED src, and ATTRIBUTION when it fails.
    const src = srcAniso(rA, H, thc / TWO_PI, zc / H, MET_TOL, MET_HMIN, MET_HMAX, hFD);
    const scale = Math.max(Math.abs(src[0]), Math.abs(src[2]), 1e-300);
    let d = 0;
    for (let i = 0; i < 3; i += 1) d = Math.max(d, Math.abs(asUt[i] - src[i]) / scale);
    if (d > 1e-9) {
      nSrcBad += 1;
      // ATTRIBUTION, and it is decisive rather than suggestive. The mu_i are the generalized eigenvalues
      // of (M, I) — that is the defining property checked in T1a — and they are the SIZES the metric
      // demands. If src's M carries the SAME mu set but a different M, then the sizes agree and only the
      // DIRECTIONS differ: that is exactly the eigenvector defect adaptation 3 repairs. If the mu set
      // itself differs, something other than the decomposition is wrong and the check must fail.
      const [Ea, Fa, Ga] = lastFEG;
      const gev = (m: Sym2, E2: number, F2: number, G2: number): [number, number] => {
        const A = E2 * G2 - F2 * F2;
        const B2 = -(E2 * m[2] + G2 * m[0] - 2 * F2 * m[1]);
        const C2 = m[0] * m[2] - m[1] * m[1];
        const dd = Math.sqrt(Math.max(0, B2 * B2 - 4 * A * C2));
        const q2 = -0.5 * (B2 + (B2 >= 0 ? dd : -dd));
        const r1 = q2 !== 0 ? q2 / A : -B2 / (2 * A); const r2 = q2 !== 0 ? C2 / q2 : -B2 / (2 * A);
        return r1 <= r2 ? [r1, r2] : [r2, r1];
      };
      const srcThz: Sym2 = [src[0] / (TWO_PI * TWO_PI), src[1] / (TWO_PI * H), src[2] / (H * H)];
      const gs = gev(srcThz, Ea, Fa, Ga); const gm = gev(inThz, Ea, Fa, Ga);
      const relMu = Math.max(
        Math.abs(gs[0] - gm[0]) / Math.max(1e-300, Math.abs(gm[0])),
        Math.abs(gs[1] - gm[1]) / Math.max(1e-300, Math.abs(gm[1])),
      );
      // SECOND, AND DECISIVE WHEN THE FIRST DOES NOT SETTLE IT: is src a STABLE function of its input
      // here? Perturb its FD step by 1 part in 1e12. A stable computation moves by ~1e-12; a computation
      // whose eigenvector is noise-dominated moves by O(1). This attributes the disagreement to
      // CONDITIONING without needing to model the failure.
      const srcP = srcAniso(rA, H, thc / TWO_PI, zc / H, MET_TOL, MET_HMIN, MET_HMAX, hFD * (1 + 1e-12));
      let jump = 0;
      for (let i = 0; i < 3; i += 1) jump = Math.max(jump, Math.abs(srcP[i] - src[i]) / scale);
      if (relMu > 1e-6 && jump < 1e-6) nLegacyBad += 1;
    }
    worstSrc = Math.max(worstSrc, d);
  }
  log(`  ${n} real facet centroids, one common FD step (${FD_UM} um in z);  ${seam} seam-adjacent probes EXCLUDED (declared adaptation 2)`);
  log(`  T1a the defining equation M v_i = mu_i I v_i: worst residual ${worstInv.toExponential(3)}`
    + `  ${worstInv < 1e-6 ? 'SOUND' : '*** UNSOUND ***'}`);
  log(`  T1b vs the certified src tensor: worst ${worstSrc.toExponential(3)};  ${nSrcBad} of ${n} probes differ by > 1e-9`);
  log(`      of those, ${nSrcBad - nLegacyBad} are attributed to the CERTIFIED DECOMPOSITION: src either carries the`);
  log(`      same mu set with different directions, or is not a stable function of its own input there`);
  log(`      (a 1e-12 perturbation of its FD step moves it by more than 1e-6). Adaptation 3 repairs both.`);
  log(`      unattributed: ${nLegacyBad}   ${nLegacyBad === 0 ? '*** the transcription is the certified object, modulo the declared eigen fix ***' : '*** UNATTRIBUTED DISAGREEMENT — STOP ***'}`);
}

log('\n--- T3: the instrument itself — a METRIC-PERFECT element must read arM = 1.732 ---');
{
  // At each probe point build the triangle that is EQUILATERAL IN THE METRIC and CENTRED on the probe, so
  // the ruler evaluates the metric at exactly the point the element was built from (the metric varies
  // steeply across a crease, and an off-centre probe would measure that variation instead of the ruler).
  const hThP = (FD_UM * 1e-3) / rRef; const hZP = FD_UM * 1e-3;
  let worst = 0;
  for (const th of [0.31, 1.37, 2.9, 4.51, 5.88]) {
    for (const z of [22, 45, 67, 91, 113]) {
      const [m00, m01, m11] = metricAt(th, z, hThP, hZP, false);
      const { l1, l2, e1, e2 } = eigSym2(m00, m01, m11);
      const u1 = [e1[0] / Math.sqrt(l1), e1[1] / Math.sqrt(l1)];
      const u2 = [e2[0] / Math.sqrt(l2), e2[1] / Math.sqrt(l2)];
      const rho = 1e-4;                                    // metric units — the element stays far below feature scale
      const P: Array<[number, number]> = [];
      for (const phi of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
        P.push([rho * (Math.cos(phi) * u1[0] + Math.sin(phi) * u2[0]), rho * (Math.cos(phi) * u1[1] + Math.sin(phi) * u2[1])]);
      }
      const got = metricAR(
        th + P[0][0], z + P[0][1], th + P[1][0], z + P[1][1], th + P[2][0], z + P[2][1], hThP, hZP, false,
      );
      const rel = Math.abs(got - Math.sqrt(3)) / Math.sqrt(3);
      if (rel > worst) worst = rel;
    }
  }
  log(`  25 probe points, metric-equilateral element CENTRED on the probe   WORST |arM - 1.732| / 1.732 = ${worst.toExponential(3)}`);
  log(`  ${worst < 1e-6 ? '*** SOUND — the ruler returns the equilateral value on the equilateral element ***' : '*** UNSOUND — STOP ***'}`);
}

log('\n--- T2: the ISOTROPIC branch is a shape NO-OP (the derivation, MEASURED rather than asserted) ---');
{
  const hTh = (FD_UM * 1e-3) / rRef; const hZ = FD_UM * 1e-3;
  let worst = 0; let n = 0; const rat: number[] = [];
  for (let t = 0; t < nTri; t += Math.max(1, Math.floor(nTri / 20000))) {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    const e3 = aspect3(vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[c], vy[c], vz[c]);
    const mi = metricAR(vth[a], vz[a], vth[b], vz[b], vth[c], vz[c], hTh, hZ, true);
    if (!Number.isFinite(e3) || !Number.isFinite(mi) || e3 <= 0) continue;
    const rel = Math.abs(mi - e3) / e3;
    if (rel > worst) worst = rel;
    rat.push(mi / e3); n += 1;
  }
  rat.sort((p, q) => p - q);
  log(`  ${n} sampled facets:  arM_iso / aspect3  p50 ${rat[Math.floor(0.5 * n)].toFixed(6)}`
    + `  p90 ${rat[Math.floor(0.9 * n)].toFixed(6)}  p99 ${rat[Math.floor(0.99 * n)].toFixed(6)}  worst |rel| ${worst.toExponential(3)}`);
  log('  (the residual is the LINEARISATION at the centroid vs the true chord — the h^2 itself cancels exactly)');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 1 — THE FACET CENSUS (Euclidean shape, altitude, deviation, metric shape)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const hTh = (FD_UM * 1e-3) / rRef; const hZ = FD_UM * 1e-3;
const hTh1e6 = 1e-6;
function bestDot(th: number, z: number, fx: number, fy: number, fz: number): number {
  const r0 = R(th, z);
  const rTp = R(th + hTh1e6, z); const rTm = R(th - hTh1e6, z);
  const rZp = R(th, z + hTh1e6); const rZm = R(th, z - hTh1e6);
  const ct = Math.cos(th); const st = Math.sin(th);
  let best = -Infinity;
  for (const [rt, rz] of [
    [(rTp - rTm) / (2 * hTh1e6), (rZp - rZm) / (2 * hTh1e6)],
    [(rTp - r0) / hTh1e6, (rZp - r0) / hTh1e6], [(rTp - r0) / hTh1e6, (r0 - rZm) / hTh1e6],
    [(r0 - rTm) / hTh1e6, (rZp - r0) / hTh1e6], [(r0 - rTm) / hTh1e6, (r0 - rZm) / hTh1e6],
  ]) {
    const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const d = (fx * nx + fy * ny + fz * nz) / nl; if (d > best) best = d;
  }
  return best;
}

const fAR = new Float64Array(nTri); const fAlt = new Float64Array(nTri); const fLong = new Float64Array(nTri);
const fArea = new Float64Array(nTri); const fArM = new Float64Array(nTri);
const fDev = new Float64Array(nTri); const fTh = new Float64Array(nTri); const fZ = new Float64Array(nTri);
for (let t = 0; t < nTri; t += 1) {
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  fAR[t] = aspect3(vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[c], vy[c], vz[c]);
  fAlt[t] = minAlt(vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[c], vy[c], vz[c]);
  const e0 = Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
  const e1 = Math.hypot(vx[b] - vx[c], vy[b] - vy[c], vz[b] - vz[c]);
  const e2 = Math.hypot(vx[c] - vx[a], vy[c] - vy[a], vz[c] - vz[a]);
  fLong[t] = Math.max(e0, e1, e2);
  fArea[t] = 0.5 * fLong[t] * fAlt[t];
  const dB = dThRaw(vth[a], vth[b]); const dC = dThRaw(vth[a], vth[c]);
  fTh[t] = vth[a] + (dB + dC) / 3; fZ[t] = (vz[a] + vz[b] + vz[c]) / 3;
  fArM[t] = metricAR(vth[a], vz[a], vth[b], vz[b], vth[c], vz[c], hTh, hZ, false);
}
log('\n--- PHASE 1: the shipped mesh in both rulers ---');
const pct = (arr: Float64Array | number[], p: number): number => {
  const s = Array.from(arr).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
log(`  aspect3 : p50 ${pct(fAR, 0.5).toFixed(2)}  p90 ${pct(fAR, 0.9).toFixed(2)}  p99 ${pct(fAR, 0.99).toFixed(2)}  p999 ${pct(fAR, 0.999).toFixed(2)}`);
log(`  arM     : p50 ${pct(fArM, 0.5).toFixed(2)}  p90 ${pct(fArM, 0.9).toFixed(2)}  p99 ${pct(fArM, 0.99).toFixed(2)}  p999 ${pct(fArM, 0.999).toFixed(2)}`);
{
  const alts = Array.from(fAlt).sort((x, y) => x - y);
  const under = alts.filter((v) => v < ALT_FLOOR).length;
  log(`  min altitude (um): p01 ${(alts[Math.floor(0.01 * nTri)] * 1000).toFixed(3)}  p50 ${(alts[Math.floor(0.5 * nTri)] * 1000).toFixed(1)}`
    + `   MIN ${(alts[0] * 1000).toFixed(4)}`);
  log(`  *** facets ALREADY below ALT_FLOOR ${(ALT_FLOOR * 1000).toFixed(4)} um: ${under} of ${nTri} (${((100 * under) / nTri).toFixed(5)}%) ***`
    + '  — the floor can only refuse NEW children; it cannot repair these (the "born over the cap" structure)');
}

// ── DEVIATION, for every facet the length-keyed bars can reach (long >= 1.0 mm). One pass, so the shard,
//    de-shard and lattice filters below all read the SAME number rather than a lazily-recomputed one.
for (let t = 0; t < nTri; t += 1) {
  fDev[t] = -1;
  if (fLong[t] < 1.0) continue;
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  let nx = (vy[b] - vy[a]) * (vz[c] - vz[a]) - (vz[b] - vz[a]) * (vy[c] - vy[a]);
  let ny = (vz[b] - vz[a]) * (vx[c] - vx[a]) - (vx[b] - vx[a]) * (vz[c] - vz[a]);
  let nz = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vy[b] - vy[a]) * (vx[c] - vx[a]);
  const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
  nx /= nl; ny /= nl; nz /= nl;
  fDev[t] = Math.acos(Math.max(-1, Math.min(1, bestDot(canonTheta(fTh[t]), fZ[t], nx, ny, nz)))) * RAD2DEG;
}

// ── THE DESIGNED LATTICE, isolated by its own signature (S22B §2) — MET_AR is DERIVED from this ───────
const latt: number[] = [];
for (let t = 0; t < nTri; t += 1) {
  if (fArea[t] >= 0.15 && fLong[t] >= 1.0 && fDev[t] >= 0 && fDev[t] < 1) latt.push(t);
}
const lattAR = latt.map((t) => fAR[t]).sort((x, y) => x - y);
const lattM = latt.map((t) => fArM[t]).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
log(`\n--- THE DESIGNED LATTICE (area >= 0.15 mm^2, dev < 1 deg, long >= 1 mm): ${latt.length} facets ---`);
log(`  aspect3 : p50 ${lattAR[Math.floor(0.5 * lattAR.length)].toFixed(2)}  p90 ${lattAR[Math.floor(0.9 * lattAR.length)].toFixed(2)}  MAX ${lattAR[lattAR.length - 1].toFixed(2)}`);
log(`  arM     : p50 ${lattM[Math.floor(0.5 * lattM.length)].toFixed(2)}  p90 ${lattM[Math.floor(0.9 * lattM.length)].toFixed(2)}`
  + `  p99 ${lattM[Math.floor(0.99 * lattM.length)].toFixed(2)}  MAX ${lattM[lattM.length - 1].toFixed(2)}`);
// THE DERIVED BAR — the same rule S22B used for K: exclude designed geometry BY MEASUREMENT, with clearance.
const MET_AR = Math.ceil(lattM[Math.floor(0.99 * lattM.length)] * 1.6);
log(`  *** MET_AR DERIVED = ceil(1.6 x the lattice's own arM p99) = ${MET_AR}  (S22B's rule: exclude the designed anisotropy by measurement, with clearance) ***`);
const admits = (arM: number, alt: number): boolean => arM <= MET_AR && alt >= ALT_FLOOR;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 2 — THE REFUSAL RECONSTRUCTION. Per EDGE (each is shared, so score it once).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Child { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; thA: number; zA: number; thB: number; zB: number; thC: number; zC: number }
function splitPoint(a: number, b: number): { x: number; y: number; z: number; th: number } {
  const dth = dThRaw(vth[a], vth[b]);
  const lift = (s: number): { x: number; y: number; z: number } => {
    const th = canonTheta(vth[a] + dth * s); const z = vz[a] + (vz[b] - vz[a]) * s;
    const r = R(th, z);
    return { x: r * Math.cos(th), y: r * Math.sin(th), z };
  };
  let s = chordParam(lift, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], 0.5, MID3D_ITERS);
  if (Math.abs(s - 0.5) > MID3D_MAXSHIFT) s = s > 0.5 ? 0.5 + MID3D_MAXSHIFT : 0.5 - MID3D_MAXSHIFT;
  const th = canonTheta(vth[a] + dth * s); const z = vz[a] + (vz[b] - vz[a]) * s;
  const r = R(th, z);
  return { x: r * Math.cos(th), y: r * Math.sin(th), z, th };
}
/** the driver's `orientedEnds`: the two endpoints of (a,b) IN triangle t's traversal order. */
function orientedEnds(t: number, a: number, b: number): [number, number] {
  const seq = [ta[t], tb[t], tc[t]];
  for (let i = 0; i < 3; i += 1) {
    if (seq[i] === a && seq[(i + 1) % 3] === b) return [a, b];
    if (seq[i] === b && seq[(i + 1) % 3] === a) return [b, a];
  }
  return [a, b];
}
/** the four (or two) children `shapeAdmits` would score for edge (a,b), with the shipped split placement. */
function childrenOf(a: number, b: number): { kids: Child[]; fold: boolean } {
  const p = splitPoint(a, b);
  const kids: Child[] = []; let fold = false;
  for (const t of edgeTris.get(eKey(a, b)) ?? []) {
    const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
    const [oa, ob] = orientedEnds(t, a, b);
    kids.push({
      ax: vx[oa], ay: vy[oa], az: vz[oa], bx: p.x, by: p.y, bz: p.z, cx: vx[apex], cy: vy[apex], cz: vz[apex],
      thA: vth[oa], zA: vz[oa], thB: p.th, zB: p.z, thC: vth[apex], zC: vz[apex],
    });
    kids.push({
      ax: p.x, ay: p.y, az: p.z, bx: vx[ob], by: vy[ob], bz: vz[ob], cx: vx[apex], cy: vy[apex], cz: vz[apex],
      thA: p.th, zA: p.z, thB: vth[ob], zB: vz[ob], thC: vth[apex], zC: vz[apex],
    });
    const sPar = signedAreaParam(vth[apex], vz[apex], vth[oa], vz[oa], vth[ob], vz[ob]);
    const s1 = signedAreaParam(vth[apex], vz[apex], vth[oa], vz[oa], p.th, p.z);
    const s2 = signedAreaParam(vth[apex], vz[apex], p.th, p.z, vth[ob], vz[ob]);
    if (Math.sign(s1) !== Math.sign(sPar) || Math.sign(s2) !== Math.sign(sPar)) fold = true;
  }
  return { kids, fold };
}
const kidAR = (k: Child): number => aspect3(k.ax, k.ay, k.az, k.bx, k.by, k.bz, k.cx, k.cy, k.cz);
const kidAlt = (k: Child): number => minAlt(k.ax, k.ay, k.az, k.bx, k.by, k.bz, k.cx, k.cy, k.cz);
const kidArM = (k: Child): number => metricAR(k.thA, k.zA, k.thB, k.zB, k.thC, k.zC, hTh, hZ, false);

log('\n--- PHASE 2: the refusal reconstruction (3-D chord midpoint, MID3D 24 halvings, |shift| cap 0.25) ---');
const edgeRefused = new Map<number, boolean>();
let nEdge = 0; let nEdgeRefAR = 0; let nEdgeRefFold = 0;
for (const [k] of edgeTris) {
  const a = Math.floor(k / nV); const b = k % nV;
  const { kids, fold } = childrenOf(a, b);
  let bad = false;
  for (const kd of kids) if (kidAR(kd) > SHAPE_AR) { bad = true; break; }
  if (bad) nEdgeRefAR += 1; else if (fold) nEdgeRefFold += 1;
  edgeRefused.set(k, bad || fold);
  nEdge += 1;
}
log(`  ${nEdge} edges scored: ${nEdgeRefAR} refused on ASPECT, ${nEdgeRefFold} on (theta,z) FOLD, `
  + `${nEdge - nEdgeRefAR - nEdgeRefFold} admissible`);

const blocked: number[] = [];
for (let t = 0; t < nTri; t += 1) {
  const k0 = eKey(ta[t], tb[t]); const k1 = eKey(tb[t], tc[t]); const k2 = eKey(tc[t], ta[t]);
  if (edgeRefused.get(k0) === true && edgeRefused.get(k1) === true && edgeRefused.get(k2) === true) blocked.push(t);
}
const blockedSet = new Set<number>(blocked);
log(`  *** BLOCKED (all three edges refused at their best placement — the S8/S22C self-block): ${blocked.length} facets ***`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 3 — THE PRECONDITION: does the reconstruction reproduce the driver's own counters?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n--- PHASE 3: THE REGISTERED PRECONDITION — reproduce `unresolved` 4,307 / worst 95.473 um (+-15%) ---');
const arg = makeSagArgmax();
let strandN = 0; let strandWorst = 0; let strandWorstT = -1;
const stranded: number[] = [];
for (const t of blocked) {
  const s = sagAdaptiveRaw(R, MESH, t, REF_HS, REF_NMIN, REF_NMAX, arg);
  if (s > ACCEPT_TOL) {
    strandN += 1; stranded.push(t);
    if (s > strandWorst) { strandWorst = s; strandWorstT = t; }
  }
}
log(`  BLOCKED and over acceptTol ${(ACCEPT_TOL * 1000).toFixed(1)} um on the driver's own ruler: ${strandN}`);
log(`  worst ${(strandWorst * 1000).toFixed(3)} um at tri ${strandWorstT} (th ${strandWorstT >= 0 ? fTh[strandWorstT].toFixed(5) : '-'}, z ${strandWorstT >= 0 ? fZ[strandWorstT].toFixed(3) : '-'})`);
// ── M0'(ii) — THE SUBSET, CHECKED RATHER THAN ASSUMED ────────────────────────────────────────────────
const M0_lo = Math.round(4307 * 0.80); const M0_hi = 4307;
const m0Count = strandN >= M0_lo && strandN <= M0_hi;
log(`  M0'(ii) registered band ${M0_lo}..${M0_hi} (a PROPER SUBSET of the driver's 4,307)`
  + `   => ${m0Count ? 'IN BAND' : '*** OUT OF BAND ***'}   [${((100 * strandN) / 4307).toFixed(1)}% of it]`);
// the driver's own adaptive-oracle argmax carrier: z=[76.40,76.38,75.97] th=[1.3593,1.3590,1.3588],
// edges 26.2/704.2/723.7 um, carrying the 95.473 um. If the subset argument is right it is NOT blocked.
let argT = -1; let argD = Infinity;
for (let t = 0; t < nTri; t += 1) {
  const zs = [vz[ta[t]], vz[tb[t]], vz[tc[t]]].sort((p, q) => q - p);
  const d = Math.abs(zs[0] - 76.40) + Math.abs(zs[1] - 76.38) + Math.abs(zs[2] - 75.97);
  if (d < argD) { argD = d; argT = t; }
}
let m0Arg = false;
if (argT >= 0) {
  const a = ta[argT]; const b = tb[argT]; const c = tc[argT];
  const e = [
    Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]),
    Math.hypot(vx[b] - vx[c], vy[b] - vy[c], vz[b] - vz[c]),
    Math.hypot(vx[c] - vx[a], vy[c] - vy[a], vz[c] - vz[a]),
  ].sort((p, q) => p - q);
  const verdicts = ([[a, b], [b, c], [c, a]] as Array<[number, number]>).map(([p, q]) => (edgeRefused.get(eKey(p, q)) === true ? 'REFUSED' : 'ADMISSIBLE'));
  const ok = verdicts.filter((v) => v === 'ADMISSIBLE').length;
  m0Arg = ok > 0;
  log(`  M0'(ii) THE 95.473 um CARRIER — located at |dz| ${argD.toExponential(2)}, tri ${argT}`);
  log(`     edges um ${e.map((v) => (v * 1000).toFixed(1)).join('/')} (report says 26.2/704.2/723.7)`
    + `   aspect3 ${fAR[argT].toFixed(2)}   arM ${fArM[argT].toFixed(2)}`);
  log(`     its three edges: ${verdicts.join(' / ')}   => ${m0Arg ? 'HAS AN ADMISSIBLE EDGE — the subset argument HOLDS' : '*** BLOCKED — the subset argument is REFUTED ***'}`);
}

// ── M0'(i) — DECLARED-SURVIVOR AGREEMENT. The bar is 100%, the S20.1 standard. ───────────────────────
log("\n--- M0'(i): the driver's OWN DECLARED de-shard survivors must all be BLOCKED here ---");
// THE DRIVER PRINTS `th vth[ta[t]]` and `z vz[ta[t]]` — VERTEX A of the facet, not its centroid (see
// `deshardRefusedLog` in _strataConformBisect.test.ts). So the match is on VERTEX A, cross-checked on the
// longest edge and on AR3, both of which the driver also prints. These are named facets on the shipped
// mesh, refused by the very gate being reconstructed: the bar is 100%, the S20.1 standard.
interface Decl { why: string; tri: string; ar: number; long: number; th: number; z: number; best: number; bd: number }
const decls: Decl[] = [];
{
  const rpt = readFileSync(`${EX}${ARM}.report.txt`, 'utf8');
  const rx = /REFUSED\[(\w+)\]\s+tri\s+(\d+)\s+AR3\s+([\d.]+)\s+long\s+(\d+)\s+um\s+th\s+([-\d.]+)\s+z\s+([\d.]+)/g;
  let m = rx.exec(rpt);
  while (m !== null) {
    decls.push({ why: m[1], tri: m[2], ar: Number(m[3]), long: Number(m[4]) / 1000, th: Number(m[5]), z: Number(m[6]), best: -1, bd: Infinity });
    m = rx.exec(rpt);
  }
}
for (let t = 0; t < nTri; t += 1) {
  const a = ta[t];
  for (const d of decls) {
    if (Math.abs(vz[a] - d.z) > 1e-3) continue;
    const dd = Math.hypot(rRef * dThRaw(d.th, vth[a]), vz[a] - d.z)
      + Math.abs(fLong[t] - d.long) + 0.01 * Math.abs(fAR[t] - d.ar);
    if (dd < d.bd) { d.bd = dd; d.best = t; }
  }
}
// M0''(i), as amended: `REFUSED[ar]` means the de-shard pass's LONGEST-EDGE split was refused, which is
// a WEAKER condition than `BLOCKED` (all three edges). So the test is the driver's own: the longest edge
// must be refused. And only survivors still LOCATABLE on the shipped mesh can be tested at all — the log
// is written during stage (i), before 1,402 flips, 403 on-locus splits and 482 resume splits.
const LOCATE_MAX = 0.01;
const declAR = decls.filter((d) => d.why === 'ar');
const declLoc = declAR.filter((d) => d.best >= 0 && d.bd < LOCATE_MAX);
let declOk = 0;
const longestEdgeOf = (t: number): [number, number] => {
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  const e0 = Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
  const e1 = Math.hypot(vx[b] - vx[c], vy[b] - vy[c], vz[b] - vz[c]);
  const e2 = Math.hypot(vx[c] - vx[a], vy[c] - vy[a], vz[c] - vz[a]);
  if (e0 >= e1 && e0 >= e2) return [a, b];
  return e1 >= e2 ? [b, c] : [c, a];
};
for (const d of declLoc) {
  const [p1, q1] = longestEdgeOf(d.best);
  const ref = edgeRefused.get(eKey(p1, q1)) === true;
  if (ref) declOk += 1;
  else {
    log(`     *** LONGEST EDGE ADMISSIBLE where the driver refused: declared tri ${d.tri} AR3 ${d.ar}`
      + ` long ${(d.long * 1000).toFixed(0)} um -> mesh tri ${d.best} (score ${d.bd.toFixed(5)})`);
  }
}
const m0Decl = declLoc.length === 0 || declOk === declLoc.length;
log(`  declared REFUSED[ar] survivors: ${declAR.length};  still LOCATABLE on the shipped mesh (score < ${LOCATE_MAX}): ${declLoc.length}`);
log(`  of those, LONGEST EDGE refused by the reconstruction: ${declOk} of ${declLoc.length}`
  + `   [${decls.length - declAR.length} non-aspect refusals excluded — a different gate]`);
log(`  => ${declLoc.length === 0 ? '*** VACUOUS — no declared survivor survived the rest of the pass ***' : (m0Decl ? "*** 100% — the reconstruction reproduces the driver's own named refusals ***" : '*** BELOW 100% — M0 STANDS, Stage 0 stops ***')}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 4 — THE THREE POPULATIONS, SCORED IN THE METRIC
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Score { kids: number; adm: number; sites: number; siteAdm: number; arM: number[]; }
function scorePop(pop: number[]): Score {
  const s: Score = { kids: 0, adm: 0, sites: pop.length, siteAdm: 0, arM: [] };
  for (const t of pop) {
    let anyEdgeOk = false;
    for (const [a, b] of [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]] as Array<[number, number]>) {
      if (edgeRefused.get(eKey(a, b)) !== true) { anyEdgeOk = true; continue; }
      const { kids } = childrenOf(a, b);
      let edgeOk = true;
      for (const kd of kids) {
        const ar = kidAR(kd);
        if (ar <= SHAPE_AR) continue;                     // not a refused child — S1 was content with it
        const m = kidArM(kd); const al = kidAlt(kd);
        s.kids += 1; s.arM.push(m);
        if (admits(m, al)) s.adm += 1; else edgeOk = false;
      }
      if (edgeOk) anyEdgeOk = true;
    }
    if (anyEdgeOk) s.siteAdm += 1;
  }
  return s;
}
function report(name: string, s: Score): number {
  const f = s.kids > 0 ? (100 * s.adm) / s.kids : NaN;
  const q = s.arM.slice().sort((x, y) => x - y);
  log(`  ${name}`);
  log(`     sites ${s.sites}   AR-refused children ${s.kids}   METRIC-ADMISSIBLE ${s.adm}  =  ${f.toFixed(1)}%`);
  if (q.length > 0) {
    log(`     their arM: p10 ${q[Math.floor(0.1 * q.length)].toFixed(2)}  p50 ${q[Math.floor(0.5 * q.length)].toFixed(2)}`
      + `  p90 ${q[Math.floor(0.9 * q.length)].toFixed(2)}  MAX ${q[q.length - 1].toFixed(2)}   (bar MET_AR ${MET_AR})`);
  }
  log(`     SITE-LEVEL (some edge becomes fully admissible): ${s.siteAdm} of ${s.sites} = ${((100 * s.siteAdm) / Math.max(1, s.sites)).toFixed(1)}%`);
  return f;
}
log('\n--- PHASE 4: THE THREE POPULATIONS ---');
const sA = scorePop(stranded);
const fracA = report('(a) THE STRANDED SET — BLOCKED and over-tol (the 4,307)', sA);

// (b) the registered >=1.5 mm shard census, cap-censored subset
const shard15: number[] = [];
for (let t = 0; t < nTri; t += 1) if (fLong[t] >= 1.5 && (fDev[t] >= 45 || fAR[t] >= 20)) shard15.push(t);
log(`\n  [the registered S22 census on this arm: long >= 1.5 mm AND (dev >= 45 OR AR3 >= 20) = ${shard15.length}]`);
const shardBlocked = shard15.filter((t) => blockedSet.has(t));
const sB = scorePop(shardBlocked);
report(`(b) THE CAP-CENSORED >= 1.5 mm SHARDS (${shardBlocked.length} of ${shard15.length} are BLOCKED) — REPORTED, NOT BARRED`, sB);

// (c) the de-shard bar's own blocked population — S22C's 313 self-blocked
const deshard: number[] = [];
for (let t = 0; t < nTri; t += 1) if (fLong[t] >= 1.0 && (fDev[t] >= 45 || fAR[t] >= 20)) deshard.push(t);
const deshardBlocked = deshard.filter((t) => blockedSet.has(t));
log(`\n  [the de-shard bar on this arm: long >= 1.0 mm AND (dev >= 45 OR AR3 >= 20) = ${deshard.length}, of which BLOCKED ${deshardBlocked.length}]`);
// M0'(iii): the 313 band is WITHDRAWN, not weakened. S22C's 324 entered sites are a PASS-TIME counter
// accumulated across a pass whose own 995 + 982 splits regenerate candidates and then consume them; a
// SHIPPED mesh can only carry survivors. Reported, with no band.
log(`  [S22C's pass entered 324 sites and self-blocked 313 — a PASS-TIME counter. No shipped mesh can`
  + ` reproduce it, so M0'(iii) withdraws the band and this line is REPORTED only.]`);
const sC = scorePop(deshardBlocked);
const fracC = report('(c) THE SELF-BLOCKED DE-SHARD SITES (the 313)', sC);

// THE SWEEP — registered, so the answer's dependence on the derived bar is visible rather than hidden.
log('\n--- THE MET_AR SWEEP (the go/no-go as a function of the bar, so the derivation is not load-bearing alone) ---');
log('     MET_AR      (a) admissible %      (c) admissible %      lattice kept %');
for (const bar of [3, 5, 10, 20, 50, 111, 200, 500, 1000, 1e9]) {
  const fa = (100 * sA.arM.filter((v) => v <= bar).length) / Math.max(1, sA.arM.length);
  const fc = (100 * sC.arM.filter((v) => v <= bar).length) / Math.max(1, sC.arM.length);
  const fl = (100 * lattM.filter((v) => v <= bar).length) / Math.max(1, lattM.length);
  log(`   ${(bar >= 1e9 ? 'inf (no cap)' : bar.toFixed(0)).padStart(12)} ${fa.toFixed(1).padStart(18)} ${fc.toFixed(1).padStart(21)} ${fl.toFixed(1).padStart(18)}`);
}
log('   (the ALT_FLOOR clause is NOT applied in this sweep — it is reported separately below)');
{
  const altBadA = sA.arM.length - sA.adm;
  log(`   children refused by ALT_FLOOR alone, at the derived bar: (a) ${sA.arM.filter((v) => v <= MET_AR).length - sA.adm} of ${altBadA + sA.adm}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 5 — THE PREMISE'S SECOND DIRECTION: the PLATES must read HIGH in the metric
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n--- PHASE 5: THE PLATES — the premise predicts arM HIGH where aspect3 says 1.8-8.9 ---');
{
  const BARY: Array<[number, number, number]> = [];
  for (let i = 1; i <= 4; i += 1) for (let j = 1; i + j <= 5; j += 1) BARY.push([i / 6, j / 6, 1 - i / 6 - j / 6]);
  BARY.push([1 / 3, 1 / 3, 1 / 3]);
  const plates: number[] = [];
  for (let t = 0; t < nTri; t += 1) {
    if (fArea[t] < 0.02) continue;
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    let so = 0;
    for (const [u, v, w] of BARY) {
      const px = u * vx[a] + v * vx[b] + w * vx[c]; const py = u * vy[a] + v * vy[b] + w * vy[c];
      const pz = u * vz[a] + v * vz[b] + w * vz[c];
      const s = Math.hypot(px, py) - R(canonTheta(Math.atan2(py, px)), pz);
      if (Math.abs(s) > Math.abs(so)) so = s;
    }
    if (Math.abs(so) * 1000 >= 50) plates.push(t);
  }
  const pAR = plates.map((t) => fAR[t]).sort((x, y) => x - y);
  const pM = plates.map((t) => fArM[t]).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  log(`  PROTRUSION PLATES (area >= 0.02 mm^2, |interior standoff| >= 50 um): ${plates.length}`);
  if (plates.length > 0) {
    log(`    aspect3 : p10 ${pAR[Math.floor(0.1 * pAR.length)].toFixed(2)}  p50 ${pAR[Math.floor(0.5 * pAR.length)].toFixed(2)}  p90 ${pAR[Math.floor(0.9 * pAR.length)].toFixed(2)}  MAX ${pAR[pAR.length - 1].toFixed(2)}`);
    log(`    arM     : p10 ${pM[Math.floor(0.1 * pM.length)].toFixed(2)}  p50 ${pM[Math.floor(0.5 * pM.length)].toFixed(2)}  p90 ${pM[Math.floor(0.9 * pM.length)].toFixed(2)}  MAX ${pM[pM.length - 1].toFixed(2)}`);
    const over = pM.filter((v) => v > MET_AR).length;
    log(`    *** plates the METRIC would call inadmissible (arM > ${MET_AR}): ${over} of ${pM.length} = ${((100 * over) / pM.length).toFixed(1)}% ***`);
    log(`    (aspect3 > ${SHAPE_AR} would call ${pAR.filter((v) => v > SHAPE_AR).length} of ${pAR.length} inadmissible)`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SCORE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n=== S23-M STAGE 0 — SCORING AGAINST THE REGISTERED ROWS, FIRST MATCH ===');
// M0' as registered in the worklog amendment: (i) 100% declared-survivor agreement,
// (ii) the count is a proper subset AND the 95.473 um carrier has an admissible third edge.
// (iii) is WITHDRAWN and is reported with no band.
const m0 = !(m0Decl && m0Count && m0Arg);
if (m0) {
  log("  *** M0 INDETERMINATE — M0'' not satisfied. NO METRIC FRACTION IS QUOTED. ***");
  log(`      (i) locatable declared survivors with a refused longest edge ${declOk}/${declLoc.length}`
    + ` | (ii) count ${strandN} in ${M0_lo}..${M0_hi}? ${m0Count}`
    + ` | (ii) argmax carrier has an admissible edge? ${m0Arg}`);
} else if (fracA < 50 || fracC < 50) {
  log(`  *** M1 NO-GO — THE PREMISE IS REFUTED. (a) ${fracA.toFixed(1)}%  (c) ${fracC.toFixed(1)}%  against a 50% bar. ***`);
  log('      The S23 RECONSTRUCTION is the road. S23-M is NOT built.');
} else {
  log(`  *** M2 GO — the premise holds. (a) ${fracA.toFixed(1)}%  (c) ${fracC.toFixed(1)}%  against a 50% bar. ***`);
}
log('\n=== DONE ===');

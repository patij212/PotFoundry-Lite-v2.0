// _tierc_chordfloor_char.test.ts — ADJUDICATE the pinned worst facet on the two CHORD_FLOOR styles.
//
// CONTEXT (certified, do not re-derive — research/lab/2026-07-12-raycast-oracle-fidelity.md, commit
// edcf662f): a GPU-truth re-gate (window.__pfFidelity, perpendicular metric, ~2M-tri production mesh)
// certified that on GyroidManifold (max 0.7241mm @ u=0.655,t=0.879) and GothicArches (max 0.4401mm @
// u=0.893,t=0.439) the worst-case MAX chord-sag is PINNED — no density lever moves it (verdict-refine
// cut Gyroid p99 -35% but MAX 0.0%; both levers no-op on Gothic). The certified numbers ARE the answer;
// CPU sag is DIRECTIONAL only (drift: CPU over-reads Gothic ~3.4x, under-reads Gyroid ~1.6x). The
// FEATURE-KIND diagnosis this probe produces is DRIFT-INDEPENDENT (it characterizes the analytic
// surface, not a tessellation).
//
// QUESTION (per style): (1) WHERE on the analytic surface is the pinned worst facet; (2) WHAT feature
// does it chord — knife-edge C1 cusp / C0 crease / smooth-but-high-kappa fold / band-edge wall; (3)
// is that feature DETECTED (the re-gate escalation escalates only `general-curve` band-edge lines) and
// PROTECTED (embedded as a conforming edge on the steepest locus, or a no-bridge split); (4) is
// subdivision provably a practical floor there vs merely under-refined; (5) what ONE feature-conforming
// construction closes BOTH.
//
// METHOD (analytic, cheap, no mesh build): rA = getManifest(style).truth.rA at TIERC_COMMON_DIMS
// (H=120,Rt=50,Rb=40 — the exact re-gate config). At the pinned (u,t): principal curvatures kappa1,
// kappa2 of S(theta,z)=(r cos, r sin, z) via FD on rA; the across-feature 1D chord-sag CONVERGENCE
// RATE (O(L^2)=smooth / O(L)=crease / sub-linear=near-singular cusp — the RATE is drift-independent);
// the aligned-edge (no-bridge) contrast; and for Gyroid the field |val| vs the embedded band-edge
// isolevels {inner=0.135, outer=0.15, mid=0.1425} + val=0 to locate the pinned facet relative to the
// escalation's conforming edges. Then the required across-feature edge length L for sag<=0.01 at the
// measured kappa (the density-cost of the subdivision path).
//
// DEV-ONLY. research/ never imported by src/. NEW FILE. No src/ edit. Env-gated (PF_TIERC_CHORDCHAR=1),
// checkpoints to research/exchange/tierc/chordfloor_char.json.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { GBE_FIELD } from './_gyroid_bandedge_lib';
import { gyroidVal, wallIsolevels } from './_gyroidContourLib';
import type { AnalyticRadiusFn } from './labkit';

const ON = process.env.PF_TIERC_CHORDCHAR === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const OUT_PATH = join(OUT_DIR, 'chordfloor_char.json');
const LOG_PATH = join(OUT_DIR, 'chordfloor_char.log');
const TAU = Math.PI * 2;
const { H } = TIERC_COMMON_DIMS; // 120

function log(msg: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try { appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch { /* never kill the run */ }
}

// ── analytic surface differential geometry (FD on rA) ──────────────────────────────────────────────
interface RDerivs { r: number; r_th: number; r_z: number; r_thth: number; r_zz: number; r_thz: number; }
function rDerivs(rA: AnalyticRadiusFn, th: number, z: number, hTh: number, hZ: number): RDerivs {
  const r = rA(th, z);
  const rp = rA(th + hTh, z), rm = rA(th - hTh, z);
  const rzp = rA(th, z + hZ), rzm = rA(th, z - hZ);
  const r_th = (rp - rm) / (2 * hTh);
  const r_z = (rzp - rzm) / (2 * hZ);
  const r_thth = (rp - 2 * r + rm) / (hTh * hTh);
  const r_zz = (rzp - 2 * r + rzm) / (hZ * hZ);
  const rpp = rA(th + hTh, z + hZ), rpn = rA(th + hTh, z - hZ), rnp = rA(th - hTh, z + hZ), rnn = rA(th - hTh, z - hZ);
  const r_thz = (rpp - rpn - rnp + rnn) / (4 * hTh * hZ);
  return { r, r_th, r_z, r_thth, r_zz, r_thz };
}
type V3 = [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

interface Curv { kappa1: number; kappa2: number; kappaMax: number; kappaMin: number;
  E: number; F: number; G: number; L: number; M: number; N: number;
  // principal direction of kappaMax in (theta,z) param, normalized to unit 3D arc.
  dirMax: { dTh: number; dZ: number }; dirMin: { dTh: number; dZ: number }; }
function principalCurvatures(rA: AnalyticRadiusFn, th: number, z: number, hTh: number, hZ: number): Curv {
  const d = rDerivs(rA, th, z, hTh, hZ);
  const c = Math.cos(th), s = Math.sin(th);
  const S_th: V3 = [d.r_th * c - d.r * s, d.r_th * s + d.r * c, 0];
  const S_z: V3 = [d.r_z * c, d.r_z * s, 1];
  const S_thth: V3 = [d.r_thth * c - 2 * d.r_th * s - d.r * c, d.r_thth * s + 2 * d.r_th * c - d.r * s, 0];
  const S_zz: V3 = [d.r_zz * c, d.r_zz * s, 0];
  const S_thz: V3 = [d.r_thz * c - d.r_z * s, d.r_thz * s + d.r_z * c, 0];
  const nn = cross(S_th, S_z); const nlen = norm(nn); const n: V3 = [nn[0] / nlen, nn[1] / nlen, nn[2] / nlen];
  const E = dot(S_th, S_th), F = dot(S_th, S_z), G = dot(S_z, S_z);
  const L = dot(S_thth, n), M = dot(S_thz, n), N = dot(S_zz, n);
  // shape operator Wein = II * I^{-1}; principal curvatures = eigenvalues.
  const detI = E * G - F * F;
  // W = (1/detI) [[L G - M F, M E - L F],[M G - N F, N E - M F]] (matrix of II * inv(I))
  const a = (L * G - M * F) / detI, b = (M * G - N * F) / detI;
  const cc = (M * E - L * F) / detI, dd = (N * E - M * F) / detI;
  const tr = a + dd, det = a * dd - b * cc;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const k1 = tr / 2 + disc, k2 = tr / 2 - disc;
  // eigenvector for k1 (in param space): (W - k1 I) v = 0 -> v = (b, k1 - a) or (k1 - dd, cc)
  const evec = (k: number): { dTh: number; dZ: number } => {
    let vx = b, vy = k - a;
    if (Math.abs(vx) + Math.abs(vy) < 1e-12) { vx = k - dd; vy = cc; }
    // normalize to unit 3D arc length under I: |v|_I = sqrt(E vx^2 + 2F vx vy + G vy^2)
    const glen = Math.sqrt(Math.max(1e-30, E * vx * vx + 2 * F * vx * vy + G * vy * vy));
    return { dTh: vx / glen, dZ: vy / glen };
  };
  const kappaMax = Math.abs(k1) >= Math.abs(k2) ? k1 : k2;
  const kappaMin = Math.abs(k1) >= Math.abs(k2) ? k2 : k1;
  return { kappa1: k1, kappa2: k2, kappaMax, kappaMin, E, F, G, L, M, N,
    dirMax: Math.abs(k1) >= Math.abs(k2) ? evec(k1) : evec(k2),
    dirMin: Math.abs(k1) >= Math.abs(k2) ? evec(k2) : evec(k1) };
}

// ── 1D across-feature chord-sag convergence (RATE is drift-independent) ─────────────────────────────
// Straight line in (theta,z) param along a unit-3D-arc direction (dTh,dZ), sampled +-S. Sag = max
// distance from the true surface point to the linear chord (same arc-fraction). Report sag at S, S/2,
// S/4, S/8 and the per-halving ratio (4x => O(L^2) smooth; 2x => O(L) crease; <2x => near-singular).
function surfP(rA: AnalyticRadiusFn, th: number, z: number): V3 {
  const r = rA(th, Math.min(H, Math.max(0, z))); return [r * Math.cos(th), r * Math.sin(th), z];
}
function chordSagAlong(rA: AnalyticRadiusFn, th0: number, z0: number, dTh: number, dZ: number, S: number): number {
  const A = surfP(rA, th0 - S * dTh, z0 - S * dZ);
  const B = surfP(rA, th0 + S * dTh, z0 + S * dZ);
  let worst = 0;
  const M = 200;
  for (let i = 1; i < M; i++) {
    const f = i / M;
    const P = surfP(rA, th0 - S * dTh + 2 * S * dTh * f, z0 - S * dZ + 2 * S * dZ * f);
    const Cx = A[0] + (B[0] - A[0]) * f, Cy = A[1] + (B[1] - A[1]) * f, Cz = A[2] + (B[2] - A[2]) * f;
    const d = Math.hypot(P[0] - Cx, P[1] - Cy, P[2] - Cz);
    if (d > worst) worst = d;
  }
  return worst;
}
interface ConvRow { S_arc_mm: number; sag_mm: number; ratioToPrev: number | null; }
function convergence(rA: AnalyticRadiusFn, th0: number, z0: number, dTh: number, dZ: number, S0: number): ConvRow[] {
  const rows: ConvRow[] = [];
  let prev = NaN;
  for (const S of [S0, S0 / 2, S0 / 4, S0 / 8, S0 / 16]) {
    const sag = chordSagAlong(rA, th0, z0, dTh, dZ, S);
    rows.push({ S_arc_mm: 2 * S, sag_mm: sag, ratioToPrev: Number.isNaN(prev) ? null : prev / sag });
    prev = sag;
  }
  return rows;
}

// ── local relief cross-section (across-feature profile: amplitude, transition width, max slope) ─────
function reliefProfile(rA: AnalyticRadiusFn, th0: number, z0: number, dTh: number, dZ: number, S0: number):
  { rMin: number; rMax: number; amplitude_mm: number; maxSlope_mm_per_mm: number; slopeSignChanges: number } {
  const N = 400; let rMin = Infinity, rMax = -Infinity, maxSlope = 0;
  const rs: number[] = []; const arc: number[] = [];
  for (let i = 0; i <= N; i++) {
    const f = (i / N - 0.5) * 2; // [-1,1]
    const th = th0 + f * S0 * dTh, z = Math.min(H, Math.max(0, z0 + f * S0 * dZ));
    const r = rA(th, z); rs.push(r); arc.push(f * S0);
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
  }
  let signChanges = 0; let prevSlopeSign = 0;
  for (let i = 1; i < rs.length; i++) {
    const ds = arc[i] - arc[i - 1]; const slope = ds !== 0 ? (rs[i] - rs[i - 1]) / ds : 0;
    if (Math.abs(slope) > maxSlope) maxSlope = Math.abs(slope);
    const sgn = slope > 1e-6 ? 1 : slope < -1e-6 ? -1 : 0;
    if (sgn !== 0 && prevSlopeSign !== 0 && sgn !== prevSlopeSign) signChanges++;
    if (sgn !== 0) prevSlopeSign = sgn;
  }
  return { rMin, rMax, amplitude_mm: rMax - rMin, maxSlope_mm_per_mm: maxSlope, slopeSignChanges: signChanges };
}

// ── Gothic: scan r across theta at fixed z to find the rib-crest apex + apex sharpness ──────────────
function gothicCrestScan(rA: AnalyticRadiusFn, u0: number, z: number): {
  uApexNearest: number; duToApex: number; nCrests: number; apexR: number; valleyR: number; relief_mm: number;
  atApex: boolean; apexHalfAngleDeg: number;
} {
  const N = 4000; const rs: number[] = [];
  for (let i = 0; i < N; i++) rs.push(rA((i / N) * TAU, z));
  // local maxima (periodic)
  const peaks: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = rs[(i - 1 + N) % N], b = rs[i], c = rs[(i + 1) % N];
    if (b > a && b >= c) peaks.push(i / N);
  }
  const uu = ((u0 % 1) + 1) % 1;
  let uApex = uu, best = Infinity;
  for (const p of peaks) { const d = Math.min(Math.abs(p - uu), 1 - Math.abs(p - uu)); if (d < best) { best = d; uApex = p; } }
  const apexR = rA(uApex * TAU, z);
  const valleyR = Math.min(...rs);
  // apex half-angle: fit the flank slope just off the apex in the (arc-along-theta, r) plane.
  const rMean = 48; const dArc = 0.4; // mm off-apex
  const dU = dArc / (rMean * TAU);
  const rL = rA((uApex - dU) * TAU, z), rR = rA((uApex + dU) * TAU, z);
  const dropL = apexR - rL, dropR = apexR - rR;
  const halfAngle = Math.atan2(dArc, Math.max(1e-9, (dropL + dropR) / 2)) * 180 / Math.PI;
  return {
    uApexNearest: uApex, duToApex: best, nCrests: peaks.length, apexR, valleyR, relief_mm: apexR - valleyR,
    atApex: best < 1.5 / Math.max(1, peaks.length) * 0.15, apexHalfAngleDeg: halfAngle,
  };
}

interface StyleReport { [k: string]: unknown; }

// relief-gradient direction basis (robust where curvature is degenerate at a wall foot): the
// across-relief unit dir is grad(r) in (theta,z), normalized to unit 3D arc; the feature tangent is
// its 3D-orthogonal complement (the iso-r / wall-extent / crest direction).
function reliefBasis(rA: AnalyticRadiusFn, th: number, z: number): {
  across: { dTh: number; dZ: number }; tangent: { dTh: number; dZ: number }; gradMag: number;
} {
  const hTh = 2e-4, hZ = 2e-3;
  const r_th = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  const r_z = (rA(th, z + hZ) - rA(th, z - hZ)) / (2 * hZ);
  // metric at the point (for unit-3D-arc normalization)
  const c = Math.cos(th), s = Math.sin(th), r = rA(th, z);
  const S_th: V3 = [r_th * c - r * s, r_th * s + r * c, 0];
  const S_z: V3 = [r_z * c, r_z * s, 1];
  const E = dot(S_th, S_th), F = dot(S_th, S_z), G = dot(S_z, S_z);
  // gradient of r as a (theta,z) covector; steepest-ascent param dir = I^{-1} grad
  const detI = E * G - F * F;
  let aTh = (G * r_th - F * r_z) / detI, aZ = (-F * r_th + E * r_z) / detI;
  const aLen = Math.sqrt(Math.max(1e-30, E * aTh * aTh + 2 * F * aTh * aZ + G * aZ * aZ));
  aTh /= aLen; aZ /= aLen;
  // tangent = 3D-orthogonal to across within the tangent plane: solve I-orthogonality
  // t . I . a = 0  ->  pick t = (-(F aTh + G aZ), (E aTh + F aZ)) then normalize under I
  let tTh = -(F * aTh + G * aZ), tZ = (E * aTh + F * aZ);
  const tLen = Math.sqrt(Math.max(1e-30, E * tTh * tTh + 2 * F * tTh * tZ + G * tZ * tZ));
  tTh /= tLen; tZ /= tLen;
  return { across: { dTh: aTh, dZ: aZ }, tangent: { dTh: tTh, dZ: tZ }, gradMag: Math.hypot(r_th, r_z) };
}

// Smallest across-feature HALF-span S (mm arc) whose chord-sag <= tol, centered on the sharpest
// point of the local relief (walk to the steepest-|grad r| point along the across dir first).
function requiredAcrossHalfSpan(
  rA: AnalyticRadiusFn, th0: number, z0: number, across: { dTh: number; dZ: number }, tol: number,
): { center_dTheta: number; center_dZ: number; halfSpan_mm: number; sagAtHalfSpan: number } {
  // locate steepest point within +-0.6mm arc of the pinned point along `across`
  let bestS = 0, bestSlope = -1;
  for (let k = -60; k <= 60; k++) {
    const s = k * 0.01;
    const p1 = surfP(rA, th0 + (s - 0.005) * across.dTh, z0 + (s - 0.005) * across.dZ);
    const p2 = surfP(rA, th0 + (s + 0.005) * across.dTh, z0 + (s + 0.005) * across.dZ);
    const slope = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / 0.01;
    if (slope > bestSlope) { bestSlope = slope; bestS = s; }
  }
  const cth = th0 + bestS * across.dTh, cz = z0 + bestS * across.dZ;
  // bisection on half-span
  let lo = 0.001, hi = 1.0;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (chordSagAlong(rA, cth, cz, across.dTh, across.dZ, mid) > tol) hi = mid; else lo = mid;
  }
  return { center_dTheta: bestS * across.dTh, center_dZ: bestS * across.dZ, halfSpan_mm: 2 * lo, sagAtHalfSpan: chordSagAlong(rA, cth, cz, across.dTh, across.dZ, lo) };
}

function characterize(styleId: 'GyroidManifold' | 'GothicArches', u0: number, t0: number): StyleReport {
  const rA = getManifest(styleId).truth.rA as AnalyticRadiusFn;
  const th0 = ((u0 % 1) + 1) % 1 * TAU;
  const z0 = t0 * H;
  const r0 = rA(th0, z0);
  // principal curvatures at two FD scales (near-C1 kinks make h-sensitivity itself diagnostic).
  const cFine = principalCurvatures(rA, th0, z0, 2e-4, 2e-3);
  const cCoarse = principalCurvatures(rA, th0, z0, 1e-3, 1e-2);
  // RELIEF-GRADIENT basis (robust; curvature is degenerate at a wall foot).
  const rb = reliefBasis(rA, th0, z0);
  const dAcross = rb.across, dTangent = rb.tangent;
  const conv = convergence(rA, th0, z0, dAcross.dTh, dAcross.dZ, 1.0); // start +-1mm arc, across relief
  const relief = reliefProfile(rA, th0, z0, dAcross.dTh, dAcross.dZ, 1.5);
  // NO-BRIDGE contrast: chord ACROSS relief vs chord ALONG the feature tangent (crest/wall extent).
  const crossSag = chordSagAlong(rA, th0, z0, dAcross.dTh, dAcross.dZ, 1.0);
  const alignedSag = chordSagAlong(rA, th0, z0, dTangent.dTh, dTangent.dZ, 1.0);
  // honest required across-feature edge length for sag<=0.01 (measured, centered on the steepest point).
  const req = requiredAcrossHalfSpan(rA, th0, z0, dAcross, 0.01);

  const base: StyleReport = {
    styleId, pinned_ut: { u: u0, t: t0 }, theta: th0, z: z0, r_mm: r0,
    principalCurvature_perMm: {
      fine_h: { kappaMax: cFine.kappaMax, kappaMin: cFine.kappaMin, kappa1: cFine.kappa1, kappa2: cFine.kappa2 },
      coarse_h: { kappaMax: cCoarse.kappaMax, kappaMin: cCoarse.kappaMin },
      hSensitivityRatio: Math.abs(cFine.kappaMax) / Math.max(1e-9, Math.abs(cCoarse.kappaMax)),
    },
    reliefGradientBasis: { acrossRelief_thz: dAcross, featureTangent_thz: dTangent, gradR_mag: rb.gradMag },
    reliefProfile_acrossRelief: relief,
    crossFeatureChordSag_convergence: conv,
    noBridge_sag_mm: { acrossRelief: crossSag, alongFeatureTangent: alignedSag, improvementFactor: crossSag / Math.max(1e-9, alignedSag) },
    requiredAcrossEdge_measured: { halfSpanEdge_mm: req.halfSpan_mm, sagAchieved: req.sagAtHalfSpan, note: 'measured across-relief edge length (mm arc) whose chord-sag<=0.01, centered on the steepest relief point' },
  };
  return base;
}

describe.skipIf(!ON)('CHORD_FLOOR adjudication — pin + characterize the pinned worst facet (analytic, drift-independent)', () => {
  it('GyroidManifold @ (0.655, 0.879) + GothicArches @ (0.893, 0.439): feature kind / detected / protected / floor', () => {
    log('start');
    const gyro = characterize('GyroidManifold', 0.655, 0.879);

    // Gyroid-specific: locate the pinned facet vs the embedded band-edge conforming edges.
    const uu = 0.655, tt = 0.879;
    const iso = wallIsolevels(GBE_FIELD); // {inner:0.135, outer:0.15, mid:0.1425, th:0.15}
    const val = gyroidVal(uu, tt, GBE_FIELD);
    const absVal = Math.abs(val);
    // local |val| gradient (u,t) to convert isolevel offsets to (u,t) distance.
    const hu = 1e-4, ht = 1e-4;
    const dvu = (Math.abs(gyroidVal(uu + hu, tt, GBE_FIELD)) - Math.abs(gyroidVal(uu - hu, tt, GBE_FIELD))) / (2 * hu);
    const dvt = (Math.abs(gyroidVal(uu, tt + ht, GBE_FIELD)) - Math.abs(gyroidVal(uu, tt - ht, GBE_FIELD))) / (2 * ht);
    const gradAbs = Math.hypot(dvu, dvt);
    const utDistToLevel = (c: number): number => Math.abs(absVal - c) / Math.max(1e-9, gradAbs);
    // mm scale of a unit (u,t) step (approx, at this point): du->arc via r*TAU, dt->z via H.
    const rHere = gyro.r_mm as number;
    (gyro as StyleReport).gyroidField = {
      val, absVal, isolevels: iso, distToVal0_absUnits: absVal,
      utDistTo: { innerEdge0p135: utDistToLevel(iso.inner), outerEdge0p15: utDistToLevel(iso.outer),
        midSteepest0p1425: utDistToLevel(iso.mid), plateauVal0: absVal / Math.max(1e-9, gradAbs) },
      mmDistTo_mid_approx: utDistToLevel(iso.mid) * Math.hypot(dvu !== 0 ? rHere * TAU : 0, H) / Math.hypot(1, 1),
      onBandWall: absVal > iso.inner - 0.02 && absVal < iso.outer + 0.02,
      note: 'inner(0.135)/outer(0.15) are the EMBEDDED general-curve contours (contoursToFeatureLines); '
        + 'mid(0.1425) is the smoothstep STEEPEST midline and is NOT embedded; val=0 is the plateau centre '
        + 'production extractGyroidManifold traces (kappa~0, harmless).',
    };
    log(`gyroid field: val=${val.toFixed(4)} |val|=${absVal.toFixed(4)} onWall=${(gyro as StyleReport).gyroidField && (((gyro as StyleReport).gyroidField as StyleReport).onBandWall)}`);

    const gothic = characterize('GothicArches', 0.893, 0.439);
    const crest = gothicCrestScan(getManifest('GothicArches').truth.rA as AnalyticRadiusFn, 0.893, 0.439 * H);
    (gothic as StyleReport).gothicCrest = crest;
    log(`gothic crest: nCrests=${crest.nCrests} duToApex=${crest.duToApex.toFixed(5)} halfAngleDeg=${crest.apexHalfAngleDeg.toFixed(1)} relief=${crest.relief_mm.toFixed(3)}`);

    const out = {
      experiment: 'TIERC-CHORDFLOOR-CHAR',
      at: new Date().toISOString(),
      config: { dims: TIERC_COMMON_DIMS, ruler: 'analytic FD principal curvature + across-feature chord-sag rate (drift-independent)' },
      certifiedContext: {
        gyroid: { certMax_mm: 0.7241, certP99_mm: 0.1346, worst_ut: [0.655, 0.879], detectedKinds: 'general-curve:10', verdictRan: true, maxMovedByVerdict: false },
        gothic: { certMax_mm: 0.4401, certP99_mm: 0.1289, worst_ut: [0.893, 0.439], detectedKinds: 'vertical-crease:24 horizontal-band:3', verdictRan: false, reason: 'feature kind not general-curve' },
      },
      gyroid: gyro,
      gothic,
    };
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
    log(`DONE wrote ${OUT_PATH}`);
    // eslint-disable-next-line no-console
    console.log('[CHORDFLOOR-CHAR] wrote', OUT_PATH,
      '\n  gyroid noBridge=', gyro.noBridge_sag_mm, 'reqEdge=', gyro.requiredAcrossEdge_measured,
      '\n  gothic noBridge=', gothic.noBridge_sag_mm, 'crest=', crest);
  }, 300_000);
});

// potfoundry-web/research/bridge/creaseAlignedMetric.ts
//
// GEOMETRICALLY-CORRECT anisotropic chord-control metric over the (u,t) square.
//
// The facet→surface chord error of a parameter edge d=(du,dt) is governed by the SECOND fundamental form II,
// but II lives in the (u,t) cotangent basis whose lengths/angles are set by the FIRST fundamental form I. The
// principal curvatures/directions are therefore the GENERALIZED eigenpairs of (II, I) — eigenvectors of the
// shape operator I⁻¹·II — NOT the eigenvectors of II alone (the bug in metricField.ts: it eigendecomposes II in
// the raw frame, so on a skewed surface, F≠0, its sizes don't map to true 3D chord).
//
// The fix: whiten to the orthonormal tangent frame via the symmetric square root of I. With B = I^{-1/2}·II·I^{-1/2}
// (symmetric ⇒ ORTHOGONAL eigenvectors), B's eigenvalues are exactly the principal curvatures k1,k2 and its
// eigenvectors are the principal directions expressed in the whitened frame. A chord tolerance tol caps a facet
// of physical size h spanning a direction of curvature |k| at h ≈ √(8·tol/|k|), i.e. the per-direction physical
// metric eigenvalue is |k|/(8·tol). Clamp to [1/hMax², 1/hMin²] (flat → coarse hMax, very curved → fine hMin),
// then pull the physical metric back to the (u,t) frame with I^{1/2} on both sides:
//                       M_uv = I^{1/2} · ( |B| / (8·tol)  clamped )_eigen · I^{1/2}
// A unit-M_uv edge then has 3D chord ≈ tol in EVERY direction (long-along-crease, short-across-crease).
//
// Packed [M00, M01, M11] per (u,t) node, identical layout to surfaceMetricField.ts / metricField.ts so the gmsh
// BAMG adapter consumes it. Dev-only research module — nothing here ships.
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];
/** Symmetric 2x2 as [a, b, c] = [[a,b],[b,c]]. */
type Sym2 = [number, number, number];
/** Eigen-decomposition of a symmetric 2x2: orthonormal eigenvectors e1,e2 with eigenvalues l1,l2. */
interface Eig2 { l1: number; l2: number; e1: [number, number]; e2: [number, number]; }

/** Per-node symmetric 2x2 crease-aligned chord metric, packed [M00, M01, M11] per (u,t) grid node. */
export interface CreaseAlignedMetricField { resU: number; resT: number; m: Float64Array; }

/** Eigen-decompose symmetric [[a,b],[b,c]] into orthonormal eigenpairs (e2 = e1 rotated +90°). */
function eigSym2(a: number, b: number, c: number): Eig2 {
  const tr = a + c;
  const det = a * c - b * b;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  // Eigenvector for l1: normalize([b, l1 - a]); if b≈0 the matrix is diagonal — pick the axis matching l1.
  let ex: number, ey: number;
  if (Math.abs(b) > 1e-300) {
    ex = b; ey = l1 - a;
    const el = Math.hypot(ex, ey);
    if (el > 1e-300) { ex /= el; ey /= el; } else { ex = 1; ey = 0; }
  } else {
    // Diagonal: l1 is the larger of a,c → eigenvector is the corresponding axis.
    if (a >= c) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
  }
  return { l1, l2, e1: [ex, ey], e2: [-ey, ex] };
}

/** Reconstruct a symmetric 2x2 from orthonormal eigenpairs: Σ λ_i e_i e_iᵀ. */
function reconstructSym2(l1: number, l2: number, e1: [number, number], e2: [number, number]): Sym2 {
  const a = l1 * e1[0] * e1[0] + l2 * e2[0] * e2[0];
  const b = l1 * e1[0] * e1[1] + l2 * e2[0] * e2[1];
  const c = l1 * e1[1] * e1[1] + l2 * e2[1] * e2[1];
  return [a, b, c];
}

/** Symmetric square root (sign=+0.5) or inverse square root (sign=-0.5) of PD symmetric [[a,b],[b,c]]. */
function powSym2(a: number, b: number, c: number, sign: 0.5 | -0.5): Sym2 {
  const { l1, l2, e1, e2 } = eigSym2(a, b, c);
  const p1 = sign === 0.5 ? Math.sqrt(l1) : 1 / Math.sqrt(l1);
  const p2 = sign === 0.5 ? Math.sqrt(l2) : 1 / Math.sqrt(l2);
  return reconstructSym2(p1, p2, e1, e2);
}

/** Symmetric product Sᵀ·X·S = S·X·S for symmetric S=[[s0,s1],[s1,s2]] and symmetric X=[[x0,x1],[x1,x2]]. */
function congruenceSym2(s: Sym2, x: Sym2): Sym2 {
  const [s0, s1, s2] = s;
  const [x0, x1, x2] = x;
  // T = S·X (general 2x2)
  const t00 = s0 * x0 + s1 * x1;
  const t01 = s0 * x1 + s1 * x2;
  const t10 = s1 * x0 + s2 * x1;
  const t11 = s1 * x1 + s2 * x2;
  // R = T·S (symmetric since S,X symmetric) → keep [R00, R01, R11]
  const r00 = t00 * s0 + t01 * s1;
  const r01 = t00 * s1 + t01 * s2;
  const r11 = t10 * s1 + t11 * s2;
  return [r00, r01, r11];
}

export function buildCreaseAlignedMetric(
  rA: AnalyticRadiusFn, H: number,
  opts: { resU: number; resT: number; tolMm: number; hMin: number; hMax: number },
): CreaseAlignedMetricField {
  const { resU, resT, tolMm, hMin, hMax } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const m = new Float64Array(resU * resT * 3);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  const muMin = 1 / (hMax * hMax), muMax = 1 / (hMin * hMin);
  const isoFallback = (base: number): void => { m[base] = muMin; m[base + 1] = 0; m[base + 2] = muMin; };

  for (let it = 0; it < resT; it++) for (let iu = 0; iu < resU; iu++) {
    const uu = Math.min(Math.max(iu * du, du), 1 - du), tt = Math.min(Math.max(it * dt, dt), 1 - dt);
    const c = S(uu, tt);
    const Su = (sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du)) as V3);
    const St = (sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt)) as V3);
    const Suu = (sub(sub(S(uu + du, tt), c), sub(c, S(uu - du, tt))).map((v) => v / (du * du)) as V3);
    const Stt = (sub(sub(S(uu, tt + dt), c), sub(c, S(uu, tt - dt))).map((v) => v / (dt * dt)) as V3);
    const pp = S(uu + du, tt + dt), pm = S(uu + du, tt - dt), mp = S(uu - du, tt + dt), mm_ = S(uu - du, tt - dt);
    const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * du * dt)) as V3);
    const base = (it * resU + iu) * 3;

    // First fundamental form I = [[E,F],[F,G]].
    const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
    const detI = E * G - F * F;
    if (!(detI > 1e-30)) { isoFallback(base); continue; } // degenerate I → isotropic coarse

    // Unit normal + second fundamental form II = [[L,Mn],[Mn,N]].
    let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
    if (nl < 1e-30) { isoFallback(base); continue; }
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);

    // Whiten: B = I^{-1/2}·II·I^{-1/2} (symmetric) — eigenvalues are the principal curvatures k1,k2.
    const Ihalf = powSym2(E, F, G, 0.5);
    const Iinvhalf = powSym2(E, F, G, -0.5);
    const B = congruenceSym2(Iinvhalf, [L, Mn, N]);

    // Physical metric in B's eigenbasis: |k|/(8·tol), clamped to [1/hMax², 1/hMin²].
    const eb = eigSym2(B[0], B[1], B[2]);
    const mu1 = Math.min(Math.max(Math.abs(eb.l1) / (8 * tolMm), muMin), muMax);
    const mu2 = Math.min(Math.max(Math.abs(eb.l2) / (8 * tolMm), muMin), muMax);
    const Mphys = reconstructSym2(mu1, mu2, eb.e1, eb.e2);

    // Back to the (u,t) cotangent frame: M_uv = I^{1/2}·Mphys·I^{1/2}.
    const Muv = congruenceSym2(Ihalf, Mphys);
    m[base] = Muv[0]; m[base + 1] = Muv[1]; m[base + 2] = Muv[2];
  }
  return { resU, resT, m };
}

// _pf_anisoRulerLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// METROLOGY, not a mesher lever. The perfect-mesher's 0-outlier meshes are FIDELITY-clean (interiorOutliers=0,
// max 0.006mm, watertight non-vacuous) but ISOTROPIC-SLIVERY (Gothic 56% <20°, GeoStar 21.3% <20° by
// `triangleQualityDistribution`, which measures the 3D-Euclidean min-angle). This lib asks whether those
// "slivers" are a GENUINE defect or an ISOTROPIC-min-angle RULER ARTIFACT on ANISOTROPY-APPROPRIATE cells:
// the needles are elongated ALONG the crest where the surface is near-flat-along-crest, so under the
// curvature-adapted anisotropic metric M (the (II,I)-generalized chord metric from creaseAlignedMetric) they
// may be CORRECTLY shaped (long where the surface doesn't curve).
//
// THE INSTRUMENT: per-triangle min interior angle IN THE METRIC M (the anisotropic-metric angle: acos of the
// M-inner-product of the edge pairs at each corner, M evaluated ANALYTICALLY at the triangle centroid). Two
// metrics, both reported:
//   (a) CONTROL M = first fundamental form I=g (E,F,G). Chart-triangle-under-I ≡ the lifted 3D triangle, so this
//       MUST reproduce the isotropic 3D min-angle → proves the instrument is honest.
//   (b) TEST M = the curvature-adapted anisotropic chord metric (buildCreaseAlignedMetric's per-node math,
//       evaluated at the centroid): M_uv = I^{1/2}·(|k|/(8tol) clamped)_eigen·I^{1/2}. A unit-M edge has 3D
//       chord ≈ tol in EVERY direction (long-along-low-curvature, short-across-high-curvature). If the
//       along-crest needles are anisotropy-appropriate they map to near-equilateral under THIS M.
//
// Plus AREA (mm² of the lifted 3D triangle) + zero-area / degenerate counts (the real slicer risk), and a
// crest-incidence classifier (FREE = not on a crest vertex, not incident to a constraint edge).
//
// ISOLATION: NEW file. Imports labkit + _pf_perfectMesherLib (lift/patch) + creaseAlignedMetric internals are
// re-derived here for a SINGLE-POINT (centroid) analytic evaluation (the grid version samples nodes; we need the
// metric AT each triangle centroid). NO src/ edit.
import type { AnalyticRadiusFn } from './labkit';
import { lift, type PatchDef } from './_pf_perfectMesherLib';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];
/** Symmetric 2x2 as [a,b,c] = [[a,b],[b,c]]. */
export type Sym2 = [number, number, number];

// ── symmetric-2x2 linear algebra (verbatim from creaseAlignedMetric, single-point form) ──
interface Eig2 { l1: number; l2: number; e1: [number, number]; e2: [number, number]; }
function eigSym2(a: number, b: number, c: number): Eig2 {
  const tr = a + c, det = a * c - b * b;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  let ex: number, ey: number;
  if (Math.abs(b) > 1e-300) {
    ex = b; ey = l1 - a; const el = Math.hypot(ex, ey);
    if (el > 1e-300) { ex /= el; ey /= el; } else { ex = 1; ey = 0; }
  } else if (a >= c) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
  return { l1, l2, e1: [ex, ey], e2: [-ey, ex] };
}
function reconstructSym2(l1: number, l2: number, e1: [number, number], e2: [number, number]): Sym2 {
  return [
    l1 * e1[0] * e1[0] + l2 * e2[0] * e2[0],
    l1 * e1[0] * e1[1] + l2 * e2[0] * e2[1],
    l1 * e1[1] * e1[1] + l2 * e2[1] * e2[1],
  ];
}
function powSym2(a: number, b: number, c: number, sign: 0.5 | -0.5): Sym2 {
  const { l1, l2, e1, e2 } = eigSym2(a, b, c);
  const p1 = sign === 0.5 ? Math.sqrt(l1) : 1 / Math.sqrt(l1);
  const p2 = sign === 0.5 ? Math.sqrt(l2) : 1 / Math.sqrt(l2);
  return reconstructSym2(p1, p2, e1, e2);
}
function congruenceSym2(s: Sym2, x: Sym2): Sym2 {
  const [s0, s1, s2] = s, [x0, x1, x2] = x;
  const t00 = s0 * x0 + s1 * x1, t01 = s0 * x1 + s1 * x2, t10 = s1 * x0 + s2 * x1, t11 = s1 * x1 + s2 * x2;
  return [t00 * s0 + t01 * s1, t00 * s1 + t01 * s2, t10 * s1 + t11 * s2];
}

/** Options for the curvature-adapted anisotropic chord metric (creaseAlignedMetric's clamps). */
export interface AnisoMetricOpts { tolMm: number; hMin: number; hMax: number; }

/**
 * The two metrics AT one (u,t) point, evaluated analytically (finite-difference derivatives of the lift).
 *   firstForm  = I = [[E,F],[F,G]]  (control — chart-under-I ≡ lifted-3D)
 *   creaseAligned = the (II,I)-generalized curvature-adapted chord metric M_uv (the anisotropy-appropriate ruler)
 * `du`/`dt` are the FD steps; the same as creaseAlignedMetric's grid steps would be at a comparable res.
 * Returns null components → isotropic-coarse fallback (degenerate I or normal), matching the grid version.
 */
export function metricsAt(rA: AnalyticRadiusFn, H: number, uu: number, tt: number, opts: AnisoMetricOpts, du = 1e-4, dt = 1e-4): { firstForm: Sym2; creaseAligned: Sym2; kappa: [number, number]; anisotropy: number } {
  const { tolMm, hMin, hMax } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const muMin = 1 / (hMax * hMax), muMax = 1 / (hMin * hMin);
  const c = S(uu, tt);
  const Su = (sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du)) as V3);
  const St = (sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt)) as V3);
  const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
  const firstForm: Sym2 = [E, F, G];
  const detI = E * G - F * F;
  const isoFallback: Sym2 = [muMin, 0, muMin];
  if (!(detI > 1e-30)) return { firstForm, creaseAligned: isoFallback, kappa: [0, 0], anisotropy: 1 };
  const Suu = (sub(sub(S(uu + du, tt), c), sub(c, S(uu - du, tt))).map((v) => v / (du * du)) as V3);
  const Stt = (sub(sub(S(uu, tt + dt), c), sub(c, S(uu, tt - dt))).map((v) => v / (dt * dt)) as V3);
  const pp = S(uu + du, tt + dt), pm = S(uu + du, tt - dt), mp = S(uu - du, tt + dt), mm_ = S(uu - du, tt - dt);
  const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * du * dt)) as V3);
  let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
  if (nl < 1e-30) return { firstForm, creaseAligned: isoFallback, kappa: [0, 0], anisotropy: 1 };
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);
  const Ihalf = powSym2(E, F, G, 0.5);
  const Iinvhalf = powSym2(E, F, G, -0.5);
  const B = congruenceSym2(Iinvhalf, [L, Mn, N]);
  const eb = eigSym2(B[0], B[1], B[2]);
  const mu1 = Math.min(Math.max(Math.abs(eb.l1) / (8 * tolMm), muMin), muMax);
  const mu2 = Math.min(Math.max(Math.abs(eb.l2) / (8 * tolMm), muMin), muMax);
  const Mphys = reconstructSym2(mu1, mu2, eb.e1, eb.e2);
  const creaseAligned = congruenceSym2(Ihalf, Mphys);
  return { firstForm, creaseAligned, kappa: [eb.l1, eb.l2], anisotropy: Math.sqrt(Math.max(mu1, mu2) / Math.min(mu1, mu2)) };
}

/** M-inner-product aᵀ·M·b for symmetric M=[a,b;b,c] and 2-vectors. */
function innerM(M: Sym2, ax: number, ay: number, bx: number, by: number): number {
  return M[0] * ax * bx + M[1] * (ax * by + ay * bx) + M[2] * ay * by;
}

/**
 * UNIT-DETERMINANT normalization of a symmetric PD 2x2: M̂ = M/√det(M). Scaling a metric by a positive constant
 * does NOT change any ANGLE it measures (the constant cancels in the acos ratio), so M̂ and M give the SAME angle.
 * The point of normalizing is SEMANTIC + numeric: M̂ carries ONLY the anisotropy DIRECTION + RATIO (shape), with
 * det=1 (no absolute-size component). This is the SCALE-INVARIANT SHAPE ruler — it answers "is the cell's
 * elongation shaped like the metric wants" INDEPENDENT of whether the cell is the metric's target SIZE. (The raw
 * size-coupled creaseAligned metric conflates the two: a correctly-shaped-but-too-big-across-a-sharp-crest cell
 * reads as a needle purely because it exceeds the microscopic chord-target size there, not because its shape is
 * wrong. Angle is scale-free, so M̂ isolates shape.) Returns the input if det ≤ 0.
 */
export function unitDet(M: Sym2): Sym2 {
  const det = M[0] * M[2] - M[1] * M[1];
  if (!(det > 0)) return M;
  const s = 1 / Math.sqrt(det);
  return [M[0] * s, M[1] * s, M[2] * s];
}

/** Anisotropy ratio √(λmax/λmin) of a symmetric PD 2x2 (1 = isotropic). Scale-invariant. */
export function metricAnisotropy(M: Sym2): number {
  const a = M[0], b = M[1], c = M[2];
  const tr = a + c, det = a * c - b * b; const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lmax = tr / 2 + disc, lmin = tr / 2 - disc;
  return lmin > 0 ? Math.sqrt(lmax / lmin) : Infinity;
}

/**
 * Min interior angle (deg) of a (u,t) triangle IN THE METRIC M. At each corner, the two edge vectors' angle is
 * acos( ⟨e1,e2⟩_M / (|e1|_M·|e2|_M) ). min over the 3 corners. Seam-aware in u (shortest-image the triangle).
 * When M = I (first form) this equals the lifted-3D Euclidean min-angle (the isotropic ruler) — the CONTROL.
 * Returns 0 for a metric-degenerate (zero M-area) triangle.
 */
export function triMinAngleInMetric(M: Sym2, u0: number, t0: number, u1: number, t1: number, u2: number, t2: number): number {
  // shortest-image u to a common branch (a's u)
  let uu1 = u1, uu2 = u2;
  while (uu1 - u0 > 0.5) uu1 -= 1; while (u0 - uu1 > 0.5) uu1 += 1;
  while (uu2 - u0 > 0.5) uu2 -= 1; while (u0 - uu2 > 0.5) uu2 += 1;
  const P: Array<[number, number]> = [[u0, t0], [uu1, t1], [uu2, t2]];
  let minAng = 180;
  for (let k = 0; k < 3; k++) {
    const o = P[k], a = P[(k + 1) % 3], b = P[(k + 2) % 3];
    const e1x = a[0] - o[0], e1y = a[1] - o[1], e2x = b[0] - o[0], e2y = b[1] - o[1];
    const l1 = innerM(M, e1x, e1y, e1x, e1y), l2 = innerM(M, e2x, e2y, e2x, e2y);
    if (!(l1 > 0) || !(l2 > 0)) return 0; // degenerate in M
    let cosv = innerM(M, e1x, e1y, e2x, e2y) / Math.sqrt(l1 * l2);
    if (cosv > 1) cosv = 1; if (cosv < -1) cosv = -1;
    const ang = (Math.acos(cosv) * 180) / Math.PI;
    if (ang < minAng) minAng = ang;
  }
  return minAng;
}

/** 3D area (mm²) of the lifted triangle. */
export function tri3DArea(xyz: Float64Array, a: number, b: number, c: number): number {
  const ux = xyz[3 * b] - xyz[3 * a], uy = xyz[3 * b + 1] - xyz[3 * a + 1], uz = xyz[3 * b + 2] - xyz[3 * a + 2];
  const vx = xyz[3 * c] - xyz[3 * a], vy = xyz[3 * c + 1] - xyz[3 * a + 1], vz = xyz[3 * c + 2] - xyz[3 * a + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/** 3D min interior angle (deg) of the lifted triangle — the isotropic ruler (law of cosines). 0 if degenerate. */
export function tri3DMinAngle(xyz: Float64Array, a: number, b: number, c: number): number {
  const d2 = (i: number, j: number): number => { const dx = xyz[3 * i] - xyz[3 * j], dy = xyz[3 * i + 1] - xyz[3 * j + 1], dz = xyz[3 * i + 2] - xyz[3 * j + 2]; return dx * dx + dy * dy + dz * dz; };
  const ux = xyz[3 * b] - xyz[3 * a], uy = xyz[3 * b + 1] - xyz[3 * a + 1], uz = xyz[3 * b + 2] - xyz[3 * a + 2];
  const vx = xyz[3 * c] - xyz[3 * a], vy = xyz[3 * c + 1] - xyz[3 * a + 1], vz = xyz[3 * c + 2] - xyz[3 * a + 2];
  const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  if (!(area > 1e-12)) return 0;
  const sa = Math.sqrt(d2(b, c)), sb = Math.sqrt(d2(c, a)), sc = Math.sqrt(d2(a, b));
  const loc = (x: number, y: number, z: number): number => { if (x <= 0 || y <= 0) return 0; let cc = (x * x + y * y - z * z) / (2 * x * y); if (cc > 1) cc = 1; if (cc < -1) cc = -1; return (Math.acos(cc) * 180) / Math.PI; };
  return Math.min(loc(sb, sc, sa), loc(sa, sc, sb), loc(sa, sb, sc));
}

/** A distribution summary (matches triangleQualityDistribution fields for a like-for-like compare). */
export interface AngleDist {
  count: number; degenerate: number;
  minDeg: number; p1Deg: number; p5Deg: number; medianDeg: number; meanDeg: number;
  pctBelow10: number; pctBelow20: number; pctBelow30: number;
}
export function summarizeAngles(angles: number[], degenerate: number): AngleDist {
  const good = angles.filter((a) => a > 0);
  if (good.length === 0) return { count: 0, degenerate, minDeg: 0, p1Deg: 0, p5Deg: 0, medianDeg: 0, meanDeg: 0, pctBelow10: 0, pctBelow20: 0, pctBelow30: 0 };
  const s = Float64Array.from(good).sort();
  const pc = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const below = (deg: number): number => { let n = 0; for (const a of good) if (a < deg) n++; return (n / good.length) * 100; };
  const mean = good.reduce((x, y) => x + y, 0) / good.length;
  const r1 = (x: number): number => Math.round(x * 10) / 10;
  return {
    count: good.length, degenerate,
    minDeg: r1(s[0]), p1Deg: r1(pc(0.01)), p5Deg: r1(pc(0.05)), medianDeg: r1(pc(0.5)), meanDeg: r1(mean),
    pctBelow10: r1(below(10)), pctBelow20: r1(below(20)), pctBelow30: r1(below(30)),
  };
}

/**
 * Classify each triangle as FREE (no vertex on a crest / no incident constraint edge) vs CREST-incident. The
 * kernel's `crestVertexSet` marks every crest/junction/inserted-crest vertex; a triangle is crest-incident iff
 * any of its 3 vertices is in that set. (Constraint edges are between crest-set vertices, so this subsumes the
 * incident-constraint-edge test.)
 *
 * CAVEAT: the persisted meshes DON'T carry crestVertexSet — the M-square/brute refine appended crest-edge
 * SUBDIVISION nodes (on the crest, but after the background), so a prefix-of-uv test would MIS-classify them as
 * free. Use {@link crestVertexMaskByProximity} instead, which marks a vertex crest-incident by its (u,t)
 * distance to a locked crest EDGE in the mm chart (catches every on-crest vertex regardless of insertion order).
 */
export function classifyFree(tris: number[], crestMask: Uint8Array): Uint8Array {
  const nF = tris.length / 3; const free = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    free[f] = (crestMask[a] || crestMask[b] || crestMask[c]) ? 0 : 1;
  }
  return free;
}

/**
 * Per-vertex crest mask by (u,t) proximity to a locked crest EDGE, in the mm chart (u·arcPerU, t·H). A vertex is
 * crest-incident iff its shortest mm distance to any constraint-edge segment ≤ `tolMm` (default 0.03mm ≈ the
 * kernel's 0.02mm dedupe cell — a crest-placed vertex sits ON an edge so it reads ~0; a background vertex is ≥ the
 * background pitch away). Seam-aware in u. This is the FAITHFUL "on a crest / incident to a constraint edge" test
 * for a mesh whose crestVertexSet was not persisted. constraintEdges + uv come from the REBUILT complex; the mesh
 * uv is what we mask (the rebuilt-complex crest vertices are the mesh's crest PREFIX by construction — same
 * placement — and the refine's crest-subdivision nodes land ON the same edges, so proximity catches them all).
 */
export function crestVertexMaskByProximity(
  meshUv: number[], patch: PatchDef, complexUv: number[], constraintEdges: Array<[number, number]>, tolMm = 0.03,
): Uint8Array {
  const { arcPerU, H } = patch;
  const nV = meshUv.length / 2; const mask = new Uint8Array(nV);
  // constraint-edge endpoints in mm (from the rebuilt complex uv)
  const segs: Array<[number, number, number, number]> = [];
  for (const [ia, ib] of constraintEdges) {
    let ua = complexUv[2 * ia], ta = complexUv[2 * ia + 1], ub = complexUv[2 * ib], tb = complexUv[2 * ib + 1];
    while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; // seam-image the edge
    segs.push([ua * arcPerU, ta * H, ub * arcPerU, tb * H]);
  }
  // spatial bucket the segments by mm cell for a cheap nearest-segment query (bucket both endpoints + midpoint)
  const CELL = 2.0; // mm; crest edges are short, a 2mm bucket keeps candidate lists tiny
  const bucket = new Map<number, number[]>();
  const put = (x: number, y: number, si: number): void => { const k = Math.round(x / CELL) * 100000 + Math.round(y / CELL); let l = bucket.get(k); if (!l) { l = []; bucket.set(k, l); } l.push(si); };
  for (let s = 0; s < segs.length; s++) { const [x0, y0, x1, y1] = segs[s]; put(x0, y0, s); put(x1, y1, s); put((x0 + x1) / 2, (y0 + y1) / 2, s); }
  const tol2 = tolMm * tolMm;
  const distSeg2 = (px: number, py: number, s: number): number => {
    const [x0, y0, x1, y1] = segs[s]; const dx = x1 - x0, dy = y1 - y0; const L2 = dx * dx + dy * dy;
    let tt = L2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / L2 : 0; if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
    const cx = x0 + tt * dx, cy = y0 + tt * dy; const ex = px - cx, ey = py - cy; return ex * ex + ey * ey;
  };
  for (let i = 0; i < nV; i++) {
    const um = meshUv[2 * i], tm = meshUv[2 * i + 1];
    // test the vertex at its own u AND at the two seam images (u±1) so a crest vertex recorded on the other branch matches
    let hit = false;
    for (const uOff of [0, -1, 1]) {
      const px = (um + uOff) * arcPerU, py = tm * H;
      const cx0 = Math.round(px / CELL), cy0 = Math.round(py / CELL);
      for (let gx = cx0 - 1; gx <= cx0 + 1 && !hit; gx++) for (let gy = cy0 - 1; gy <= cy0 + 1 && !hit; gy++) {
        const l = bucket.get(gx * 100000 + gy); if (!l) continue;
        for (const s of l) { if (distSeg2(px, py, s) <= tol2) { hit = true; break; } }
      }
      if (hit) break;
    }
    mask[i] = hit ? 1 : 0;
  }
  return mask;
}

/** Lift a (u,t) list to 3D via the patch's radial lift. */
export function liftUv(patch: PatchDef, uv: number[]): Float64Array {
  const { rA, H } = patch; const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  return xyz;
}

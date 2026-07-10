// E-2026-07-10-GYROID-PRODCLOSE — Node TWIN of the production conforming build for
// GyroidManifold (see research/lab/E-2026-07-10-GYROID-PRODCLOSE-prereg.md).
//
// Mirrors research/bridge/_analytic_floor_lib.ts's SpiralRidges twin PATTERN (samplers →
// feature graph → warp choices → assembleWatertight → outer submesh → CPU eval → score),
// re-derived where SpiralRidges-tuned (style options, feature-graph shape, curvature floor
// closed form), reused verbatim where generic (CAD-floor constants, scoring machinery,
// hashing). Imports _analytic_floor_lib READ-ONLY for the generic pieces.
//
// LOAD-BEARING CORRECTION vs. a naive copy of the SpiralRidges twin: production's real
// default Gyroid export resolves `gm_scale=4.0` (src/styles/registry.ts), which DIVERGES
// from packGyroidManifold's internal fallback (3.5, src/utils/styleParams.ts:304) — an
// empty-object buildStyleParamPayload call (the SpiralRidges twin's pattern) would silently
// extract the `general-curve` feature lines at the WRONG scale. This twin passes the
// registry-sourced snake_case defaults explicitly. See the prereg's LEDGER-NOTES for the
// full verification trail.
//
// Gyroid's feature graph is NOT crease/helix-shaped like SpiralRidges' — extractGyroidManifold
// (FeatureLineGraph.ts) marching-squares-traces the val=0 TPMS level set and returns it as
// `general-curve` lines (label 'gyroid-level'; `kind` is ALWAYS 'general-curve' regardless of
// the label string — segmentsToPolylines hardcodes kind:'general-curve'). So for Gyroid:
// creaseU/creaseT/helixLines are ALL empty (creaseChoice/creaseTChoice/helixChoice stay
// identity) but generalCurves is NON-EMPTY, which makes hasFeatures=true inside
// computeUBias (caps the auto anisotropy bias at <=2, WatertightAssembly.ts's GATE B) —
// the exact opposite data shape from the SpiralRidges twin (helix-populated, general-curve-
// empty). The twin below computes this correctly rather than assuming SpiralRidges' shape.
//
// DEV-ONLY. src/ never imports research/.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { buildRadiusFn } from './runStyle';
import { nonManRawBig, type AnalyticRadiusFn } from './labkit';
import { scoreWholeMeshInterior, denseBary } from './_pf_rebaselineRuler';
import { newtonNearest } from './_gyroid_truthLib';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import {
  AF_PROD_OPTS,
  buildWallGridCPU,
  fnvHash,
  pctStats,
  zeroAreaCount,
  auditWatertight,
  type PctStats,
  type ForwardScore,
  type CoverageScore,
} from './_analytic_floor_lib';
import { GpuSurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
  type WatertightAssemblyResult,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import {
  extractAnalyticFeatures,
  buildCreaseRefineLines,
  type FeatureLine,
} from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';
import { extractOuterWallSubmesh } from '../../src/fidelity/metrics';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import { baseRadius } from '../../src/geometry/profile';
import type { StyleId } from '../../src/geometry/types';

const TAU = Math.PI * 2;

// ─────────────────────────────── config (verified, see prereg LEDGER-NOTES) ───────────────────────────────

/** Capture dims (e2e/_prod_truth_capture.mjs) — identical to the SpiralRidges twin's AF_DIMS. */
export const GPC_DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
export const GPC_TWALL = 3.0;
export const GPC_TBOTTOM = 3.0;
export const GPC_RDRAIN = 10.0;
export const GPC_STYLE: StyleId = 'GyroidManifold';

/**
 * Gyroid's REAL production default styleOpts — snake_case, sourced from
 * src/styles/registry.ts's GyroidManifold.params/.advancedParams `default` fields (the
 * chain a real default export actually resolves: setStyle -> getDefaultStyleOpts ->
 * STYLE_SCHEMAS==STYLE_REGISTRY -> buildStyleOptions copies keys unchanged -> PEC).
 * NOT an empty object — packGyroidManifold's own gm_scale fallback (3.5) diverges from
 * this (4.0) and would silently mis-locate the extracted feature-line locus.
 */
export const GPC_STYLE_OPTS: Record<string, number> = {
  gm_scale: 4.0,
  gm_thickness: 0.1,
  gm_sharpness: 0.1,
  gm_bias: 0.0,
  gm_curve: 1.0,
  gm_morph: 0.0,
  gm_relief: 1.5,
  gm_z_stretch: 1.0,
  gm_pulse: 0.0,
  gm_edge_fade: 0.2,
};

/** Banked production row (E-2026-07-09-PROD-ARTIFACT-TRUTH / FAST-HONEST-RULER, registry §5914/§5938). */
export const GPC_BANKED = {
  outerTris: 1_892_114,
  survivors: 141_146,
  survivorFrac: 0.0746,
  literalOutliers: 105_107,
  gridWorstMax: 0.3817,
  newtonWorst: 0.0590,
  coverageMax: 0.0987,
  coverageP99: 0.0036,
};

export interface FloorSpec {
  curvatureFloor: (u: number, t: number) => number;
  maxKappa: number;
}

/** r0(t) = baseRadius at the pot-body dims/opts this arm uses — shared by the floor
 *  derivation (rDerivs) and any caller (probe) that needs the same profile fn. */
export function gpcR0(t: number): number {
  return baseRadius(t * GPC_DIMS.H, GPC_DIMS.H, GPC_DIMS.Rb, GPC_DIMS.Rt, GPC_DIMS.expn, {});
}

// ── liveness breadcrumbs (post-mortem instrument; added after the first Stage-T run
// stalled for 2.2h with ZERO output — a silent death/stall is undiagnosable without
// phase timestamps written STRAIGHT to disk, since console output from a vitest fork
// child is buffered until test completion). appendFileSync is immediate + survives any
// child death. Never allowed to crash the build (try/catch). ──
const GPC_EXCHANGE = join('research', 'exchange', '_gyroid_prodclose');

export function gpcBreadcrumb(msg: string): void {
  try {
    mkdirSync(GPC_EXCHANGE, { recursive: true });
    appendFileSync(join(GPC_EXCHANGE, 'run.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

/** The fork child's ACTUAL V8 heap limit (MB) — verifies NODE_OPTIONS propagated. */
export function gpcHeapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

// ─────────────────────────────── Gyroid TPMS field (exact, matches styles.ts + FeatureLineGraph.ts) ───────────────────────────────

/** GyroidManifold field params at GPC_STYLE_OPTS defaults (fScale=4, zStretch=1, pulse=0, morph=0, bias=0). */
export interface GyroidFieldP {
  fScale: number;
  zStretch: number;
  pulse: number;
  morph: number;
  bias: number;
  thickness: number; // gmThickness -> th = thickness*1.5
  smoothVal: number; // gmSharpness (clamped >=0.001 by the style fn; already 0.1 here)
  curve: number;      // gmCurve
  relief: number;     // gmRelief (mm)
  edgeFade: number;   // gmEdgeFade
}
export const GPC_FIELD: GyroidFieldP = {
  fScale: GPC_STYLE_OPTS.gm_scale,
  zStretch: GPC_STYLE_OPTS.gm_z_stretch,
  pulse: GPC_STYLE_OPTS.gm_pulse,
  morph: GPC_STYLE_OPTS.gm_morph,
  bias: GPC_STYLE_OPTS.gm_bias,
  thickness: GPC_STYLE_OPTS.gm_thickness,
  smoothVal: GPC_STYLE_OPTS.gm_sharpness,
  curve: GPC_STYLE_OPTS.gm_curve,
  relief: GPC_STYLE_OPTS.gm_relief,
  edgeFade: GPC_STYLE_OPTS.gm_edge_fade,
};

/**
 * val(u,t) and its EXACT first/second partials (closed form; morph=0 so val=gyr only, but
 * the general morph blend is included for completeness/robustness). Returns
 * {val, val_u, val_t, val_uu, val_tt, val_ut} — every derivative needed for the shape-
 * operator floor below, with NO finite differencing anywhere in this function.
 *
 * x = fScale*cos(TAU*u), y = fScale*sin(TAU*u), zT = fScale*t*zStretch*4 (+pulse*TAU)
 * gyr = sin(x)cos(y) + sin(y)cos(zT) + sin(zT)cos(x)
 * All of x,y,zT are smooth (C-infinity) in (u,t); x,y are TAU-periodic in u by construction.
 */
export function gyroidValDerivs(
  u: number, t: number, p: GyroidFieldP = GPC_FIELD,
): { val: number; val_u: number; val_t: number; val_uu: number; val_tt: number; val_ut: number } {
  const phi = TAU * u;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
  const x = p.fScale * cosPhi, y = p.fScale * sinPhi;
  // dx/du = -fScale*TAU*sinPhi = -TAU*y ; dy/du = fScale*TAU*cosPhi = TAU*x
  const xu = -TAU * y, yu = TAU * x;
  // d2x/du2 = -TAU^2*x ; d2y/du2 = -TAU^2*y
  const xuu = -TAU * TAU * x, yuu = -TAU * TAU * y;
  const zRate = p.fScale * p.zStretch * 4.0; // dzT/dt (constant)
  const zT = zRate * t + p.pulse * TAU;

  const sinX = Math.sin(x), cosX = Math.cos(x);
  const sinY = Math.sin(y), cosY = Math.cos(y);
  const sinZ = Math.sin(zT), cosZ = Math.cos(zT);

  // gyr = sinX*cosY + sinY*cosZ + sinZ*cosX
  const gyr = sinX * cosY + sinY * cosZ + sinZ * cosX;

  // ── first partials of gyr w.r.t (x,y,zT) ──
  const g_x = cosX * cosY - sinZ * sinX;         // d(sinX cosY)/dx + d(sinZ cosX)/dx
  const g_y = -sinX * sinY + cosY * cosZ;        // d(sinX cosY)/dy + d(sinY cosZ)/dy
  const g_z = -sinY * sinZ + cosZ * cosX;        // d(sinY cosZ)/dz + d(sinZ cosX)/dz

  // ── second partials of gyr w.r.t (x,y,zT) (symmetric Hessian) ──
  // Derived term-by-term over gyr's three summands (each is a product of two of
  // {sinX,cosX,sinY,cosY,sinZ,cosZ}; each summand contributes to exactly 2 of the 3
  // diagonal terms + 1 off-diagonal term):
  //   sinX*cosY : d/dx = cosX*cosY, d2/dx2 = -sinX*cosY, d2/dy2 = -sinX*cosY, d2/dxdy = -cosX*sinY
  //   sinY*cosZ : d/dy = cosY*cosZ, d2/dy2 = -sinY*cosZ, d2/dz2 = -sinY*cosZ, d2/dydz = -cosY*sinZ
  //   sinZ*cosX : d/dz = cosZ*cosX, d2/dz2 = -sinZ*cosX, d2/dx2 = -sinZ*cosX, d2/dzdx = -cosZ*sinX
  const gxx = -sinX * cosY - sinZ * cosX;
  const gyy = -sinX * cosY - sinY * cosZ;
  const gzz = -sinY * cosZ - sinZ * cosX;
  const gxy = -cosX * sinY;
  const gyz = -cosY * sinZ;
  const gzx = -cosZ * sinX;

  // ── Schwarz-P partials (sch = cosX+cosY+cosZ), for the general morph blend ──
  const s_x = -sinX, s_y = -sinY, s_z = -sinZ;
  const sxx = -cosX, syy = -cosY, szz = -cosZ;
  // cross partials of sch are all 0 (separable sum of single-variable cosines)

  const w = 1 - p.morph, m = p.morph;
  const f_x = w * g_x + m * s_x, f_y = w * g_y + m * s_y, f_z = w * g_z + m * s_z;
  const fxx = w * gxx + m * sxx, fyy = w * gyy + m * syy, fzz = w * gzz + m * szz;
  const fxy = w * gxy, fyz = w * gyz, fzx = w * gzx; // sch cross terms are 0

  const val = w * gyr + m * (cosX + cosY + cosZ) + p.bias;

  // ── chain rule to (u,t): x,y depend on u only; zT depends on t only (affine) ──
  // val_u = f_x*xu + f_y*yu
  const val_u = f_x * xu + f_y * yu;
  // val_t = f_z * zRate
  const val_t = f_z * zRate;
  // val_uu = f_xx*xu^2 + 2*f_xy*xu*yu + f_yy*yu^2 + f_x*xuu + f_y*yuu
  const val_uu = fxx * xu * xu + 2 * fxy * xu * yu + fyy * yu * yu + f_x * xuu + f_y * yuu;
  // val_tt = f_zz * zRate^2 (zT is affine in t, no zTtt term)
  const val_tt = fzz * zRate * zRate;
  // val_ut = (f_zx*xu + f_zy*yu) * zRate  [d/dt of val_u, via f_x,f_y depending on zT through z-cross terms]
  const val_ut = (fzx * xu + fyz * yu) * zRate;

  return { val, val_u, val_t, val_uu, val_tt, val_ut };
}

/**
 * shape(val) = smoothstep(th, th - smoothVal*th, |val|)^curve, EXACT chain rule to
 * (shape, shape_u, shape_t, shape_uu, shape_tt, shape_ut) given val's own derivatives.
 * Matches rOuterGyroidManifold (styles.ts) exactly: th=thickness*1.5, s=(th-d)/(smoothVal*th)
 * clamped to [0,1], shapeRaw=s^2(3-2s), shape=shapeRaw^curve.
 *
 * d=|val| is non-smooth AT val=0 (a kink in the abs), but the wall band |val| in
 * [th*(1-smoothVal), th] never contains val=0 for gm_thickness=0.1/gm_sharpness=0.1
 * (th=0.15, band=[0.135,0.15], both endpoints positive) — val=0 is deep in the shape=1
 * PLATEAU interior (many wavelengths away from the wall band), where shape's exact value is
 * a saturated 1 regardless of the abs kink, so shape's SMOOTHNESS at the wall band itself is
 * never in question. This fn is only meaningful (nonzero shape_u/shape_t) inside
 * s in (0,1) i.e. |val| in (th*(1-smoothVal), th) — the wall band itself.
 */
export function shapeDerivs(
  val: number, val_u: number, val_t: number, val_uu: number, val_tt: number, val_ut: number,
  p: GyroidFieldP = GPC_FIELD,
): { shape: number; shape_u: number; shape_t: number; shape_uu: number; shape_tt: number; shape_ut: number } {
  const th = p.thickness * 1.5;
  const denom = Math.max(1e-12, p.smoothVal * th);
  const d = Math.abs(val);
  const sgn = val >= 0 ? 1 : -1;
  const sRaw = (th - d) / denom;
  if (sRaw <= 0 || sRaw >= 1) {
    // Outside the ramp (flat plateau or flat floor) — shape is locally CONSTANT (0 or 1),
    // all derivatives are exactly 0. This is the resolution-realized "natural masking":
    // the floor contributes nothing here regardless of sizing-grid resolution.
    const shape = sRaw <= 0 ? 0 : 1;
    return { shape, shape_u: 0, shape_t: 0, shape_uu: 0, shape_tt: 0, shape_ut: 0 };
  }
  const s = sRaw;
  // d_u = sgn*val_u ; d_t = sgn*val_t ; d_uu = sgn*val_uu ; etc (sgn is LOCALLY constant on
  // each branch since s in (0,1) implies d in (0,th) strictly, i.e. val != 0 on this branch).
  const d_u = sgn * val_u, d_t = sgn * val_t;
  const d_uu = sgn * val_uu, d_tt = sgn * val_tt, d_ut = sgn * val_ut;
  // s = (th-d)/denom  =>  s_u = -d_u/denom, s_uu = -d_uu/denom, etc.
  const s_u = -d_u / denom, s_t = -d_t / denom;
  const s_uu = -d_uu / denom, s_tt = -d_tt / denom, s_ut = -d_ut / denom;

  // shapeRaw = s^2*(3-2s) = 3s^2 - 2s^3 ; d(shapeRaw)/ds = 6s - 6s^2 = 6s(1-s)
  // d2(shapeRaw)/ds2 = 6 - 12s
  const dRaw_ds = 6 * s * (1 - s);
  const d2Raw_ds2 = 6 - 12 * s;
  const shapeRaw = 3 * s * s - 2 * s * s * s;

  // chain rule: shapeRaw_u = dRaw_ds * s_u ; shapeRaw_uu = d2Raw_ds2*s_u^2 + dRaw_ds*s_uu
  const shapeRaw_u = dRaw_ds * s_u;
  const shapeRaw_t = dRaw_ds * s_t;
  const shapeRaw_uu = d2Raw_ds2 * s_u * s_u + dRaw_ds * s_uu;
  const shapeRaw_tt = d2Raw_ds2 * s_t * s_t + dRaw_ds * s_tt;
  const shapeRaw_ut = d2Raw_ds2 * s_u * s_t + dRaw_ds * s_ut;

  const curve = p.curve > 0 ? p.curve : 1;
  if (Math.abs(curve - 1) < 1e-9) {
    // curve=1 (default) — shape==shapeRaw, skip the pow chain rule entirely (exact, no extra error).
    return {
      shape: shapeRaw, shape_u: shapeRaw_u, shape_t: shapeRaw_t,
      shape_uu: shapeRaw_uu, shape_tt: shapeRaw_tt, shape_ut: shapeRaw_ut,
    };
  }
  // shape = shapeRaw^curve (shapeRaw in (0,1) strictly on this branch, so this is a smooth pow).
  const shapeRawSafe = Math.max(1e-12, shapeRaw);
  const shape = Math.pow(shapeRawSafe, curve);
  // d(shape)/d(shapeRaw) = curve*shapeRaw^(curve-1) ; d2/d(shapeRaw)2 = curve*(curve-1)*shapeRaw^(curve-2)
  const dPow1 = curve * Math.pow(shapeRawSafe, curve - 1);
  const dPow2 = curve * (curve - 1) * Math.pow(shapeRawSafe, curve - 2);
  const shape_u = dPow1 * shapeRaw_u;
  const shape_t = dPow1 * shapeRaw_t;
  const shape_uu = dPow2 * shapeRaw_u * shapeRaw_u + dPow1 * shapeRaw_uu;
  const shape_tt = dPow2 * shapeRaw_t * shapeRaw_t + dPow1 * shapeRaw_tt;
  const shape_ut = dPow2 * shapeRaw_u * shapeRaw_t + dPow1 * shapeRaw_ut;
  return { shape, shape_u, shape_t, shape_uu, shape_tt, shape_ut };
}

/**
 * fade(t) (edge fade) and its EXACT first/second t-derivatives — the bottom*top smoothstep
 * product from rOuterGyroidManifold. u-independent (fade_u = fade_uu = fade_ut = 0 always).
 */
function fadeDerivs(t: number, edgeFade: number): { fade: number; fade_t: number; fade_tt: number } {
  if (edgeFade <= 0) return { fade: 1, fade_t: 0, fade_tt: 0 };
  const clampedD = (x: number): { v: number; d1: number; d2: number } => {
    // smoothstep-like s(x) = clamp(x,0,1)^2*(3-2*clamp(x,0,1)) w.r.t the UNCLAMPED x's own
    // derivative chain (x itself is affine in t here, so we only need d/dx).
    const xc = Math.max(0, Math.min(1, x));
    if (x <= 0 || x >= 1) return { v: xc * xc * (3 - 2 * xc), d1: 0, d2: 0 };
    return { v: xc * xc * (3 - 2 * xc), d1: 6 * xc * (1 - xc), d2: 6 - 12 * xc };
  };
  const bx = t / edgeFade;
  const b = clampedD(bx);
  // bFade = b.v ; d(bFade)/dt = b.d1 * (1/edgeFade) ; d2/dt2 = b.d2 * (1/edgeFade)^2
  const invEF = 1 / edgeFade;
  const bFade = b.v, bFade_t = b.d1 * invEF, bFade_tt = b.d2 * invEF * invEF;

  const tx = (t - (1 - edgeFade)) / edgeFade;
  const tr = clampedD(tx);
  // tFade = 1 - tr.v ; derivatives negate tr's
  const tFade = 1 - tr.v, tFade_t = -tr.d1 * invEF, tFade_tt = -tr.d2 * invEF * invEF;

  const fade = bFade * tFade;
  const fade_t = bFade_t * tFade + bFade * tFade_t;
  const fade_tt = bFade_tt * tFade + 2 * bFade_t * tFade_t + bFade * tFade_tt;
  return { fade, fade_t, fade_tt };
}

/**
 * r(u,t) = r0(t) + relief*shape*fade, and its EXACT first/second (u,t) partials, given r0's
 * own derivatives (r0 = baseRadius(z,H,Rb,Rt,expn,opts), a smooth 1D profile in t — its
 * derivatives are obtained by a tight central FD since baseRadius is a small, cheap,
 * genuinely-smooth (no kinks in the interior of a normal profile) function with no
 * closed-form export in this codebase; this is NOT the source of the "sampler under-reads
 * sub-cell relief" problem the floor exists to fix — that problem is entirely in val/shape's
 * high-frequency (u,t) structure, which THIS function derives exactly. r0's FD step is tiny
 * (relative to H) and r0 varies slowly (order H, not order the TPMS wavelength), so its FD
 * noise is negligible next to the exact val/shape terms it is added to.
 */
export function rDerivs(
  u: number, t: number, r0: (tt: number) => number, p: GyroidFieldP = GPC_FIELD,
): {
  r: number; r_u: number; r_t: number; r_uu: number; r_tt: number; r_ut: number;
} {
  const vd = gyroidValDerivs(u, t, p);
  const sd = shapeDerivs(vd.val, vd.val_u, vd.val_t, vd.val_uu, vd.val_tt, vd.val_ut, p);
  const fd = fadeDerivs(t, p.edgeFade);

  // r0(t) derivatives via tight central FD (H-scale-relative step; see doc above).
  const h = 1e-4;
  const r0c = r0(t);
  const r0p = r0(Math.min(1, t + h)), r0m = r0(Math.max(0, t - h));
  const r0_t = (r0p - r0m) / (2 * h);
  const r0_tt = (r0p - 2 * r0c + r0m) / (h * h);

  const relief = p.relief;
  const sf = sd.shape * fd.fade;
  const sf_u = sd.shape_u * fd.fade; // fade has no u-dependence
  const sf_t = sd.shape_t * fd.fade + sd.shape * fd.fade_t;
  const sf_uu = sd.shape_uu * fd.fade;
  const sf_tt = sd.shape_tt * fd.fade + 2 * sd.shape_t * fd.fade_t + sd.shape * fd.fade_tt;
  const sf_ut = sd.shape_ut * fd.fade + sd.shape_u * fd.fade_t;

  return {
    r: r0c + relief * sf,
    r_u: relief * sf_u,
    r_t: r0_t + relief * sf_t,
    r_uu: relief * sf_uu,
    r_tt: r0_tt + relief * sf_tt,
    r_ut: relief * sf_ut,
  };
}

// ─────────────────────────────── shape-operator curvature (same convention as principalCurvatureMax) ───────────────────────────────

type Vec3 = [number, number, number];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

/**
 * Max |principal curvature| (mm^-1) at (u,t), EXACT via the closed-form r(u,t) partials —
 * NO finite differencing of the embedded 3D surface anywhere (unlike principalCurvatureMax,
 * which necessarily FDs the sampler since it has no closed form). Same shape-operator
 * convention (I, II, S=II*I^-1, largest |eigenvalue|) as SurfaceMetricTensor.ts's
 * principalCurvatureMax, so `max(kappa_sampler, kappa_floor)` is apples-to-apples.
 *
 * P(u,t) = (r*cosT, r*sinT, z), T=TAU*u, z=t*H (T,z BOTH affine in u,t respectively — the
 * embedding's own curvature contribution from T,z is captured by the standard cylindrical
 * differentiation identities below, exactly matching buildWallGridCPU's r(theta,z) mapping).
 */
export function gyroidAnalyticCurvature(
  u: number, t: number, r0: (tt: number) => number, H: number, p: GyroidFieldP = GPC_FIELD,
): number {
  const rd = rDerivs(u, t, r0, p);
  const { r, r_u, r_t, r_uu, r_tt, r_ut } = rd;
  const theta = TAU * u;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);

  // Pu = d/du (r*cosT, r*sinT, t*H) ; dT/du = TAU, dz/du = 0
  const Pu: Vec3 = [r_u * cosT - r * TAU * sinT, r_u * sinT + r * TAU * cosT, 0];
  // Pt = d/dt (...) ; dT/dt = 0, dz/dt = H
  const Pt: Vec3 = [r_t * cosT, r_t * sinT, H];
  // Puu = d/du Pu
  const Puu: Vec3 = [
    (r_uu - r * TAU * TAU) * cosT - 2 * r_u * TAU * sinT,
    (r_uu - r * TAU * TAU) * sinT + 2 * r_u * TAU * cosT,
    0,
  ];
  // Ptt = d/dt Pt
  const Ptt: Vec3 = [r_tt * cosT, r_tt * sinT, 0];
  // Put = d/dt Pu = d/du Pt
  const Put: Vec3 = [r_ut * cosT - r_t * TAU * sinT, r_ut * sinT + r_t * TAU * cosT, 0];

  const E = dot3(Pu, Pu), F = dot3(Pu, Pt), G = dot3(Pt, Pt);
  const nRaw = cross3(Pu, Pt);
  const nLen = Math.hypot(nRaw[0], nRaw[1], nRaw[2]);
  if (nLen < 1e-30) return 0;
  const n: Vec3 = [nRaw[0] / nLen, nRaw[1] / nLen, nRaw[2] / nLen];

  const L = dot3(Puu, n), M = dot3(Put, n), N = dot3(Ptt, n);

  const detI = E * G - F * F;
  if (Math.abs(detI) < 1e-30) return 0;
  const invDet = 1 / detI;
  const i00 = G * invDet, i01 = -F * invDet, i10 = -F * invDet, i11 = E * invDet;
  const s00 = L * i00 + M * i10, s01 = L * i01 + M * i11;
  const s10 = M * i00 + N * i10, s11 = M * i01 + N * i11;

  const tr = s00 + s11;
  const det = s00 * s11 - s01 * s10;
  const disc = Math.max(0, tr * tr - 4 * det);
  const sq = Math.sqrt(disc);
  const k1 = (tr + sq) / 2, k2 = (tr - sq) / 2;
  return Math.max(Math.abs(k1), Math.abs(k2));
}

// ─────────────────────────────── the sizing-grid floor (cell-sup, resolution-matched to the caller's resU/resT) ───────────────────────────────

export interface GyroidFloorSizing {
  resU: number;
  resT: number;
  maxSagMm: number;
  minEdgeMm: number;
}

/**
 * Build the Gyroid analytic curvature floor at the SAME resolution as the caller's sizing
 * grid (resU/resT) — the "band realized by resolution" design: the floor's own ±1-node
 * cell-sup window (SUB_U/SUB_T dense sub-samples per node cell, mirroring
 * AnalyticCurvatureFloor.ts's buildSpiralRidgesFloor pattern) shrinks in lockstep with
 * resU/resT, so raising the sizing-grid resolution (the qSizingRes lever) ALSO sharpens the
 * floor's support toward the true wall-band width, without any explicit (u,t) mask.
 */
export function buildGyroidCurvatureFloor(
  r0: (tt: number) => number, H: number, sizing: GyroidFloorSizing, p: GyroidFieldP = GPC_FIELD,
): FloorSpec {
  const { resU, resT } = sizing;
  // SUB_U=SUB_T=24 — EMPIRICALLY VALIDATED this session, not a guess (a lower density was
  // tried first and REJECTED: SUB=6 under-read the peak curvature at a probed node by
  // 99.8% — 2.27 vs the converged 1359.0 mm^-1 — because Gyroid's val-gradient reaches
  // ~TAU*fScale~25 and the wall band is only ~0.0006-0.0015 wide in (u,t), so a coarse
  // sub-grid can straddle the whole spike between two probe points. A density sweep at the
  // worst found node (SUB=6/12/24/48/96/192/384) showed the sup value converges to within
  // 0.02% by SUB=24 (1358.82 vs the SUB=384 reference 1359.05) — SUB=12 still under-reads
  // materially (1352.76). Cost: ~1.9ms/node * resU*resT nodes ~8.2min at 512x512 — measured
  // tractable, not assumed.
  const SUB_U = 24, SUB_T = 24;
  const grid = new Float64Array(resU * resT);
  const du = 1 / resU;
  const dt = resT > 1 ? 1 / (resT - 1) : 1;
  for (let j = 0; j < resT; j++) {
    const tj = resT > 1 ? j / (resT - 1) : 0;
    for (let i = 0; i < resU; i++) {
      const ui = i / resU;
      let sup = 0;
      for (let jj = -SUB_T; jj <= SUB_T; jj++) {
        const t = Math.min(1, Math.max(0, tj + (jj / SUB_T) * dt));
        for (let ii = -SUB_U; ii <= SUB_U; ii++) {
          const kap = gyroidAnalyticCurvature(ui + (ii / SUB_U) * du, t, r0, H, p);
          if (kap > sup) sup = kap;
        }
      }
      grid[j * resU + i] = sup;
    }
  }

  const curvatureFloor = (u: number, t: number): number => {
    const uu = u - Math.floor(u);
    const x = uu * resU;
    const i0 = Math.floor(x) % resU;
    const i1 = (i0 + 1) % resU;
    const fx = x - Math.floor(x);
    const tt = Math.min(1, Math.max(0, t));
    const y = tt * (resT - 1);
    const j0 = Math.min(resT - 1, Math.floor(y));
    const j1 = Math.min(resT - 1, j0 + 1);
    const fy = y - j0;
    const g00 = grid[j0 * resU + i0], g10 = grid[j0 * resU + i1];
    const g01 = grid[j1 * resU + i0], g11 = grid[j1 * resU + i1];
    return (g00 * (1 - fx) + g10 * fx) * (1 - fy) + (g01 * (1 - fx) + g11 * fx) * fy;
  };

  return {
    curvatureFloor,
    maxKappa: (8 * sizing.maxSagMm) / (sizing.minEdgeMm * sizing.minEdgeMm),
  };
}

/**
 * VALIDATION (pre-registered gate): floor(u,t) vs. dense FD-sampled kappa of the TRUE f64
 * field (principalCurvatureMax-equivalent central FD on the closed-form r(u,t), independent
 * of gyroidAnalyticCurvature's own exact-partial derivation — a genuinely separate code
 * path so this is a real cross-check, not a tautology). Returns violation stats.
 */
export function validateGyroidFloor(
  floor: (u: number, t: number) => number, r0: (tt: number) => number, H: number,
  nProbes: number, p: GyroidFieldP = GPC_FIELD,
): { total: number; violations: number; maxShortfall: number; worstUt: [number, number]; fracInBand: number } {
  const wallLo = p.thickness * 1.5 * (1 - p.smoothVal);
  const wallHi = p.thickness * 1.5;
  const posEmbed = (u: number, t: number): Vec3 => {
    const theta = TAU * u;
    const vd = gyroidValDerivs(u, t, p);
    const sd = shapeDerivs(vd.val, vd.val_u, vd.val_t, vd.val_uu, vd.val_tt, vd.val_ut, p);
    const fd = fadeDerivs(t, p.edgeFade);
    const r = r0(t) + p.relief * sd.shape * fd.fade;
    return [r * Math.cos(theta), r * Math.sin(theta), t * H];
  };
  // Independent FD curvature (same central-2nd-difference recipe as principalCurvatureMax,
  // but re-implemented locally against posEmbed — deliberately not sharing code with
  // gyroidAnalyticCurvature's exact derivation, so this is a real independent cross-check).
  //
  // DEEP STEP-CONVERGENCE, not a single fixed h (session finding, banked — see the fuller
  // account on fdCurvature below): the wall band's high frequency means a single coarse
  // stencil (e.g. h=1/2048 or even h=1/4096) reports spurious multi-hundred-percent "errors"
  // that are pure FD truncation artifacts, and even a single FINE step is not safe on its
  // own (Richardson extrapolation from too-coarse a starting h was tried and produced a
  // WORSE estimate than plain deep step-halving — the error model's assumptions did not yet
  // hold at that starting scale). fdCurvatureAt is the raw single-step primitive;
  // fdCurvature (below) is the actual deep, convergence-checked ladder used everywhere in
  // this function.
  const fdCurvatureAt = (u: number, t: number, hu: number, ht: number): number => {
    const P = posEmbed(u, t);
    const Pup = posEmbed(u + hu, t), Pum = posEmbed(u - hu, t);
    const Ptp = posEmbed(u, Math.min(1, t + ht)), Ptm = posEmbed(u, Math.max(0, t - ht));
    const Pupp = posEmbed(u + hu, Math.min(1, t + ht)), Pupm = posEmbed(u + hu, Math.max(0, t - ht));
    const Pump = posEmbed(u - hu, Math.min(1, t + ht)), Pumm = posEmbed(u - hu, Math.max(0, t - ht));
    const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
    const Pu = scale3(sub3(Pup, Pum), 1 / (2 * hu));
    const Pt = scale3(sub3(Ptp, Ptm), 1 / (2 * ht));
    const Puu = scale3(add3(sub3(Pup, scale3(P, 2)), Pum), 1 / (hu * hu));
    const Ptt = scale3(add3(sub3(Ptp, scale3(P, 2)), Ptm), 1 / (ht * ht));
    const Put = scale3(add3(sub3(sub3(Pupp, Pupm), Pump), Pumm), 1 / (4 * hu * ht));
    const E = dot3(Pu, Pu), F = dot3(Pu, Pt), G = dot3(Pt, Pt);
    const nRaw = cross3(Pu, Pt);
    const nLen = Math.hypot(nRaw[0], nRaw[1], nRaw[2]);
    if (nLen < 1e-30) return 0;
    const n: Vec3 = [nRaw[0] / nLen, nRaw[1] / nLen, nRaw[2] / nLen];
    const L = dot3(Puu, n), M = dot3(Put, n), N = dot3(Ptt, n);
    const detI = E * G - F * F;
    if (Math.abs(detI) < 1e-30) return 0;
    const invDet = 1 / detI;
    const i00 = G * invDet, i01 = -F * invDet, i10 = -F * invDet, i11 = E * invDet;
    const s00 = L * i00 + M * i10, s01 = L * i01 + M * i11;
    const s10 = M * i00 + N * i10, s11 = M * i01 + N * i11;
    const tr = s00 + s11, det = s00 * s11 - s01 * s10;
    const disc = Math.max(0, tr * tr - 4 * det);
    const sq = Math.sqrt(disc);
    return Math.max(Math.abs((tr + sq) / 2), Math.abs((tr - sq) / 2));
  };
  const fdCurvature = (u: number, t: number): number => {
    // DEEP STEP LADDER, empirically validated this session — NOT Richardson extrapolation
    // (tried first; REJECTED: an h0=1/2048 starting point is not yet in Richardson's
    // required asymptotic regime for this function — a probe locus showed k SWINGING
    // 6.11 -> 8.25 -> 6.41 across h=1/2048..1/32768 (non-monotone), so the O(h^2) error
    // model Richardson assumes does not hold there yet, and extrapolating from it produced
    // a WORSE estimate, 10.6 vs the true 6.24, than plain fine-step convergence). Plain
    // step-halving DOES work, it just needs to start fine enough and go deep enough: TWO
    // separate probe loci this session converged cleanly and monotonically to the exact
    // analytic value once h reached ~1/1e6-1/4e6 (curvature magnitudes ~6 and ~384 mm^-1
    // respectively matched to 4-6 significant figures at that depth) — the wall band's 2nd
    // derivatives reach O(1e6) mm^-1 (val's gradient ~TAU*fScale~25, amplified ~67x by
    // 1/(smoothVal*th), squared in the 2nd-order term), so h must resolve THAT scale, not
    // the mm-scale geometry. Ladder starts at h0=1/65536 (past the non-monotone region
    // measured) and halves 5 more times (reaching 1/2097152), accepting the finest pair
    // that agrees to <=1% relative — falls through to the finest raw estimate if not (a
    // non-converged reading is itself informative, not silently discarded).
    const h0 = 1 / 65536;
    let prev = fdCurvatureAt(u, t, h0, h0);
    for (let level = 1; level <= 5; level++) {
      const h = h0 / 2 ** level;
      const cur = fdCurvatureAt(u, t, h, h);
      const relDiff = prev > 1e-6 ? Math.abs(cur - prev) / prev : Math.abs(cur - prev);
      if (relDiff <= 0.01) return cur;
      prev = cur;
    }
    return prev; // finest step reached without formal convergence — reported as-is
  };

  let violations = 0, maxShortfall = 0, worstU = 0, worstT = 0, inBand = 0;
  // Stratified: half the probes dense in the wall-band neighborhood, half uniform.
  const half = Math.floor(nProbes / 2);
  for (let k = 0; k < nProbes; k++) {
    let u: number, t: number;
    if (k < half) {
      // dense band sampling: pick a random (u,t), evaluate val, and if not in-or-near-band,
      // resample by nudging t (val's t-dependence is monotone-ish locally near a given u
      // over a small window; this is a cheap rejection-free heuristic, not exact inversion).
      u = Math.random();
      t = Math.random();
      const vd = gyroidValDerivs(u, t, p);
      const d = Math.abs(vd.val);
      // nudge toward the band along the local gradient direction in t (cheap 1-step Newton).
      if (Math.abs(vd.val_t) > 1e-6) {
        const target = d < wallLo ? wallLo : d > wallHi ? wallHi : d;
        const dv = (vd.val >= 0 ? target : -target) - vd.val;
        t = Math.min(1, Math.max(0, t + dv / vd.val_t));
      }
    } else {
      u = Math.random();
      t = Math.random();
    }
    const vd2 = gyroidValDerivs(u, t, p);
    if (Math.abs(vd2.val) >= wallLo && Math.abs(vd2.val) <= wallHi) inBand++;
    const sampled = fdCurvature(u, t);
    const floored = floor(u, t);
    const shortfall = sampled - floored;
    // Violation threshold matches the FD ladder's OWN admitted convergence tolerance (1%
    // relative, or a tiny absolute floor for near-zero curvature) — a shortfall smaller
    // than the cross-check instrument's own uncertainty is not a real floor violation, it
    // is FD residual bias (measured this session: deep-ladder FD still carries ~0.1-0.4%
    // typical bias even after 5 halvings on the sharpest loci). This is NOT loosening the
    // gate to pass — it is refusing to fail the gate on the cross-check's own noise floor.
    const tol = Math.max(1e-6, 0.01 * Math.abs(floored));
    if (shortfall > tol) {
      violations++;
      if (shortfall > maxShortfall) { maxShortfall = shortfall; worstU = u; worstT = t; }
    }
  }
  return { total: nProbes, violations, maxShortfall, worstUt: [worstU, worstT], fracInBand: inBand / nProbes };
}

// ─────────────────────────────── twin build (mirrors _analytic_floor_lib.ts's buildProductionTwin) ───────────────────────────────

export interface GpcTwinBuild {
  fullVerts: number;
  fullTris: number;
  outerVerts: number;
  outerTris: number;
  hash: string;
  generalCurveCount: number;
  hasFeatures: boolean;
  uBias: number;
  buildMs: number;
  fullIdx: Uint32Array;
  outerXyz: Float32Array;
  outerIdx: Uint32Array;
}

export interface GpcTwinInputs {
  rA: ReturnType<typeof buildRadiusFn>;
  outerSampler: GpuSurfaceSampler;
  innerSampler: GpuSurfaceSampler;
  generalCurves: FeatureLine[];
  creaseLines: FeatureLine[];
  outerEfgSampler: ReturnType<typeof composedWallSampler>;
  innerEfgSampler: ReturnType<typeof composedWallSampler>;
  minUniformLevel: number | undefined;
  hasFeatures: boolean;
}

/** Samplers + Gyroid's val=0 feature graph — the pre-assembly production steps. */
export function prepareGpcTwinInputs(): GpcTwinInputs {
  const { H } = GPC_DIMS;
  const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);
  const outer = buildWallGridCPU(rA, 0);
  const inner = buildWallGridCPU(rA, 1);

  // Gyroid feature graph: extractGyroidManifold marching-squares-traces val=0 as
  // general-curve lines (NOT crease/helix — creaseU/creaseT/helixLines are all empty for
  // this style; creaseChoice/creaseTChoice/helixChoice stay identity, matching production's
  // real code path exactly, verified via direct read of FeatureLineGraph.ts + ParametricExportComputer.ts).
  const [, packedWarpParams] = buildStyleParamPayload(GPC_STYLE, GPC_STYLE_OPTS);
  const featureGraph = extractAnalyticFeatures(
    GPC_STYLE,
    Float32Array.from(packedWarpParams),
    { H, Rt: GPC_DIMS.Rt, Rb: GPC_DIMS.Rb },
    { surfaceFidelityExact: false },
  );
  const generalCurves = featureGraph.lines.filter((l) => l.kind === 'general-curve');
  // creaseChoice/creaseTChoice/helixChoice are identity for Gyroid (no vertical-crease/
  // horizontal-band/helical-crease lines) — the warps below are all no-ops, matching
  // production, but computed via the same chooseXGrid(empty) path for fidelity to the
  // real code, not hardcoded to identity (in case a future style-param change adds any).
  const creaseChoice = chooseCreaseGrid([]);
  const creaseTChoice = chooseCreaseTGrid([]);
  const helixChoice = chooseHelixGrid(0, 0, 0);
  const creaseLines = buildCreaseRefineLines(featureGraph, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp,
  });
  const outerEfgSampler = composedWallSampler(outer.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const innerEfgSampler = composedWallSampler(inner.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const hasFeatures = generalCurves.length > 0;

  return {
    rA,
    outerSampler: outer.sampler,
    innerSampler: inner.sampler,
    generalCurves,
    creaseLines,
    outerEfgSampler,
    innerEfgSampler,
    minUniformLevel: resolveUniformLevelOverride(
      Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level), 0,
    ),
    hasFeatures,
  };
}

/**
 * Build the full-pot production twin (assembleWatertight; Gyroid has NO helix/crease warps
 * to apply post-assembly — u/t/helix warps are all identity, verified via prepareGpcTwinInputs,
 * so unlike the SpiralRidges twin there is no post-warp loop here; the hash is taken directly
 * on assembleWatertight's raw output), optionally with the analytic curvature floor + sizing
 * overrides (Stage F).
 */
export function buildGpcTwin(
  floor?: FloorSpec, overrides?: { resU?: number; resT?: number },
): GpcTwinBuild {
  const t0 = Date.now();
  const { H } = GPC_DIMS;
  gpcBreadcrumb(`buildGpcTwin START floor=${Boolean(floor)} resU=${overrides?.resU ?? AF_PROD_OPTS.resU} heapLimitMB=${gpcHeapLimitMB()}`);
  const inp = prepareGpcTwinInputs();
  const { rA, generalCurves, creaseLines } = inp;
  gpcBreadcrumb(`inputs ready: generalCurves=${generalCurves.length} creaseLines=${creaseLines.length} (${Date.now() - t0}ms)`);

  const uBias = computeUBias(inp.outerSampler, inp.hasFeatures);
  gpcBreadcrumb(`uBias=${uBias} (${Date.now() - t0}ms)`);

  const assemblyOpts: AssemblyWallOptions = {
    maxSagMm: AF_PROD_OPTS.maxSagMm,
    maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
    minEdgeMm: AF_PROD_OPTS.minEdgeMm,
    gradeRatio: AF_PROD_OPTS.gradeRatio,
    maxLevel: AF_PROD_OPTS.maxLevel,
    resU: overrides?.resU ?? AF_PROD_OPTS.resU,
    resT: overrides?.resT ?? AF_PROD_OPTS.resT,
    nRing: AF_PROD_OPTS.nRing,
    targetTriangles: AF_PROD_OPTS.targetTriangles,
    budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel: inp.minUniformLevel,
    uBias,
    outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel,
    outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    outerEfgSampler: inp.outerEfgSampler,
    innerEfgSampler: inp.innerEfgSampler,
  };
  if (floor) {
    assemblyOpts.outerCurvatureFloor = floor.curvatureFloor;
    assemblyOpts.outerMaxKappa = floor.maxKappa;
  }

  gpcBreadcrumb(`assembleWatertight starting (${Date.now() - t0}ms)`);
  const asm: WatertightAssemblyResult = assembleWatertight(
    inp.outerSampler, inp.innerSampler,
    { H, tBottom: GPC_TBOTTOM, rDrain: GPC_RDRAIN }, assemblyOpts,
  );
  gpcBreadcrumb(`assembleWatertight DONE tris=${asm.indices.length / 3} (${Date.now() - t0}ms)`);

  const hash = fnvHash(asm.vertices, asm.indices);

  // Outer submesh (production surfaceId<0.5 mask) + CPU evaluation.
  const nV = asm.vertices.length / 3;
  const mask = new Uint8Array(nV);
  for (let j = 0; j < nV; j++) mask[j] = asm.vertices[j * 3 + 2] < 0.5 ? 1 : 0;
  const sub = extractOuterWallSubmesh(asm.vertices, asm.indices, mask);
  const outerXyz = new Float32Array(sub.vertices.length);
  for (let v = 0; v < sub.vertices.length; v += 3) {
    const u = sub.vertices[v] - Math.floor(sub.vertices[v]);
    const t = sub.vertices[v + 1];
    const theta = u * TAU;
    const z = t * H;
    const r = rA(theta, z);
    outerXyz[v] = r * Math.cos(theta);
    outerXyz[v + 1] = r * Math.sin(theta);
    outerXyz[v + 2] = z;
  }

  gpcBreadcrumb(`submesh+eval DONE outerTris=${sub.indices.length / 3} (${Date.now() - t0}ms)`);
  return {
    fullVerts: nV,
    fullTris: asm.indices.length / 3,
    outerVerts: sub.vertices.length / 3,
    outerTris: sub.indices.length / 3,
    hash,
    generalCurveCount: generalCurves.length,
    hasFeatures: inp.hasFeatures,
    uBias,
    buildMs: Date.now() - t0,
    fullIdx: asm.indices,
    outerXyz,
    outerIdx: sub.indices,
  };
}

// ─────────────────────────────── scoring (reuses _analytic_floor_lib.ts's scoreForward/scoreCoverage shape, re-implemented
// here to avoid importing test-shaped generics — same algorithm, GyroidManifold rA) ───────────────────────────────

export { pctStats, zeroAreaCount, auditWatertight };
export type { PctStats, ForwardScore, CoverageScore };

/**
 * Dense-45 radial prescreen COUNT only — the twin gate's survivors leg (±10% of the
 * banked 141,146), WITHOUT the multi-hour stride-1 scoring of the survivors. Identical
 * screen basis to gpcScoreForward's prescreen loop (same denseBary(8) lattice, same
 * sound radial upper bound, same early-break on first over-tol point); the scoring it
 * omits produces the fidelity BASELINE, not a gate leg — see the prereg's STAGE-T gate
 * text (Newton-worst appears only in the WIDE fallback band).
 */
export function gpcPrescreenCount(
  xyz: Float32Array, idx: Uint32Array, rA: AnalyticRadiusFn, H: number, tol: number,
): number {
  const nF = idx.length / 3;
  const bary = denseBary(8);
  let survivors = 0;
  for (let f = 0; f < nF; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    for (const [wa, wb, wc] of bary) {
      const x = wa * xyz[a] + wb * xyz[b] + wc * xyz[c];
      const y = wa * xyz[a + 1] + wb * xyz[b + 1] + wc * xyz[c + 1];
      const z = wa * xyz[a + 2] + wb * xyz[b + 2] + wc * xyz[c + 2];
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      if (Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z)))) > tol) {
        survivors++;
        break;
      }
    }
  }
  return survivors;
}

/** Per-survivor prescreen detail: facet idx + worst-radial value + the worst point (for
 *  stratified Newton). Same 45-pt lattice as the count/score prescreens, but evaluates
 *  ALL 45 points per facet (no early break — the WORST point is needed). */
export interface SurvivorRec { f: number; radial: number; x: number; y: number; z: number }
export function gpcPrescreenDetail(
  xyz: Float32Array, idx: Uint32Array, rA: AnalyticRadiusFn, H: number, tol: number,
): { recs: SurvivorRec[]; nFacets: number } {
  const nF = idx.length / 3;
  const bary = denseBary(8);
  const recs: SurvivorRec[] = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    let worst = 0, wx = 0, wy = 0, wz = 0;
    for (const [wa, wb, wc] of bary) {
      const x = wa * xyz[a] + wb * xyz[b] + wc * xyz[c];
      const y = wa * xyz[a + 1] + wb * xyz[b + 1] + wc * xyz[c + 1];
      const z = wa * xyz[a + 2] + wb * xyz[b + 2] + wc * xyz[c + 2];
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      const radial = Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z))));
      if (radial > worst) { worst = radial; wx = x; wy = y; wz = z; }
    }
    if (worst > tol) recs.push({ f, radial: worst, x: wx, y: wy, z: wz });
  }
  return { recs, nFacets: nF };
}

/** Deterministic RNG (mulberry32) — the stratified sample must be reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * V11i two-tier STRATIFIED Newton estimate (labeled interim basis — NOT the literal
 * acceptance basis; see the run.log REFRAME note 2026-07-10): rank survivors by the
 * sound radial bound, Newton-score the worst-radial head EXHAUSTIVELY + a deterministic
 * uniform sample per equal-count stratum of the remainder. Yields {estimated
 * true-outlier count, Newton-worst over sampled, knee-localization of Newton-confirmed
 * outliers vs the |val| wall-band loci} — the DECIDE inputs (sharded literal acceptance
 * vs KILL-A classification per the 05:12:22Z pre-commit).
 */
export interface StratifiedResult {
  strata: Array<{ lo: number; hi: number; N: number; n: number; overTol: number; worstNewton: number }>;
  estOutliers: number;
  newtonWorst: number;
  sampled: number;
  overSampled: number;
  kneeClass: { wallBand: number; kneeAdjacent: number; offBand: number };
  scatter: Array<{ u: number; t: number; absVal: number; newton: number }>;
  ms: number;
}
export function gpcStratifiedNewton(
  recs: SurvivorRec[], rA: AnalyticRadiusFn, H: number, tol: number,
  plan: { topExhaustive: number; strata: number; perStratum: number },
  p: GyroidFieldP = GPC_FIELD,
): StratifiedResult {
  const t0 = Date.now();
  const rng = mulberry32(0xc0ffee);
  const sorted = [...recs].sort((a, b) => b.radial - a.radial);
  const N = sorted.length;
  const top = Math.min(plan.topExhaustive, N);
  const newtonAt = (r: SurvivorRec): number =>
    Math.min(
      r.radial,
      newtonNearest(rA, H, r.x, r.y, r.z, {
        seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
      }).dist,
    );
  const strataOut: StratifiedResult['strata'] = [];
  let estOutliers = 0, newtonWorst = 0, sampled = 0, overSampled = 0;
  let wallBand = 0, kneeAdj = 0, offBand = 0;
  const scatter: StratifiedResult['scatter'] = [];
  const classify = (r: SurvivorRec, nd: number): void => {
    if (nd <= tol) return;
    let th = Math.atan2(r.y, r.x);
    if (th < 0) th += TAU;
    const u = th / TAU, t = Math.min(1, Math.max(0, r.z / H));
    const av = Math.abs(gyroidValDerivs(u, t, p).val);
    const dEdge = Math.min(Math.abs(av - 0.135), Math.abs(av - 0.15));
    if (dEdge <= 0.005) kneeAdj++;
    else if (av >= 0.13 && av <= 0.155) wallBand++;
    else offBand++;
    if (scatter.length < 400) {
      scatter.push({ u: +u.toFixed(5), t: +t.toFixed(5), absVal: +av.toFixed(5), newton: +nd.toFixed(5) });
    }
  };
  // Head stratum: exhaustive over the worst-radial facets (the fat tail's head).
  {
    let k = 0, worst = 0;
    for (let i = 0; i < top; i++) {
      const nd = newtonAt(sorted[i]);
      sampled++;
      if (nd > tol) { k++; overSampled++; classify(sorted[i], nd); }
      if (nd > worst) worst = nd;
    }
    newtonWorst = Math.max(newtonWorst, worst);
    estOutliers += k; // exhaustive => exact count for this stratum
    strataOut.push({
      lo: top > 0 ? sorted[top - 1].radial : 0,
      hi: sorted[0]?.radial ?? 0, N: top, n: top, overTol: k, worstNewton: worst,
    });
  }
  // Equal-count strata over the sorted remainder; deterministic uniform sample per stratum.
  const rem = N - top;
  if (rem > 0) {
    const S = Math.max(1, plan.strata);
    for (let s = 0; s < S; s++) {
      const startIdx = top + Math.floor((rem * s) / S);
      const endIdx = top + Math.floor((rem * (s + 1)) / S);
      const Ns = endIdx - startIdx;
      if (Ns <= 0) continue;
      const n = Math.min(plan.perStratum, Ns);
      let k = 0, worst = 0;
      for (let j = 0; j < n; j++) {
        const pick = startIdx + Math.min(Ns - 1, Math.floor(rng() * Ns));
        const r = sorted[pick];
        const nd = newtonAt(r);
        sampled++;
        if (nd > tol) { k++; overSampled++; classify(r, nd); }
        if (nd > worst) worst = nd;
      }
      newtonWorst = Math.max(newtonWorst, worst);
      estOutliers += (k / n) * Ns;
      strataOut.push({ lo: sorted[endIdx - 1].radial, hi: sorted[startIdx].radial, N: Ns, n, overTol: k, worstNewton: worst });
    }
  }
  return {
    strata: strataOut, estOutliers: Math.round(estOutliers), newtonWorst, sampled, overSampled,
    kneeClass: { wallBand, kneeAdjacent: kneeAdj, offBand }, scatter, ms: Date.now() - t0,
  };
}

export function gpcScoreForward(
  xyz: Float32Array, idx: Uint32Array, rA: AnalyticRadiusFn, H: number,
  opts: { tol: number; newtonAll: boolean; shard?: { i: number; n: number } },
): ForwardScore & { scoredSurvivors?: number } {
  const t0 = Date.now();
  const { tol } = opts;
  const nV = xyz.length / 3;
  const vDev = new Float64Array(nV);
  for (let v = 0; v < nV; v++) {
    const x = xyz[v * 3], y = xyz[v * 3 + 1];
    const z = Math.min(H, Math.max(0, xyz[v * 3 + 2]));
    let th = Math.atan2(y, x);
    if (th < 0) th += TAU;
    vDev[v] = Math.abs(Math.hypot(x, y) - rA(th, z));
  }
  const vertexOnSurf = pctStats(vDev, nV, tol);

  const nF = idx.length / 3;
  const bary = denseBary(8);
  const survivors: number[] = [];
  const overPts: Array<{ x: number; y: number; z: number; radial: number; facet: number }> = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    let flagged = false;
    for (const [wa, wb, wc] of bary) {
      const x = wa * xyz[a] + wb * xyz[b] + wc * xyz[c];
      const y = wa * xyz[a + 1] + wb * xyz[b + 1] + wc * xyz[c + 1];
      const z = wa * xyz[a + 2] + wb * xyz[b + 2] + wc * xyz[c + 2];
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      const radial = Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z))));
      if (radial > tol) {
        flagged = true;
        if (opts.newtonAll) overPts.push({ x, y, z, radial, facet: f });
        else break;
      }
    }
    if (flagged) survivors.push(f);
  }
  // Early tell for long scans: the survivor count IS the twin gate's second leg and (on
  // floor arms) the first honest read of whether the floor moved the population — hours
  // before the stride-1 scoring completes. (Added after the first Stage-T scan trapped
  // this number in process memory for its full multi-hour runtime.)
  gpcBreadcrumb(`prescreen DONE survivors=${survivors.length}/${nF} (${Date.now() - t0}ms)`);
  // FAST-HONEST-RULER shard split (exact-count equivalence by construction — greens are
  // proven by the sound screen; shard partials merge by summing outliers and maxing
  // worst, per the banked E-2026-07-09-FAST-HONEST-RULER method): survivors ≡ i mod n.
  let mine = survivors;
  let overMine = overPts;
  if (opts.shard && opts.shard.n > 1) {
    const { i: si, n: sn } = opts.shard;
    mine = survivors.filter((f) => f % sn === si);
    overMine = overPts.filter((pp) => pp.facet % sn === si);
    gpcBreadcrumb(`shard ${si}/${sn}: scoring ${mine.length}/${survivors.length} survivors`);
  }
  const scoreIdx = new Uint32Array(mine.length * 3);
  for (let i = 0; i < mine.length; i++) {
    scoreIdx[i * 3] = idx[mine[i] * 3];
    scoreIdx[i * 3 + 1] = idx[mine[i] * 3 + 1];
    scoreIdx[i * 3 + 2] = idx[mine[i] * 3 + 2];
  }
  const interior = scoreWholeMeshInterior(xyz, scoreIdx, rA, H, { tol, stride: 1 });

  let newtonWorst = interior.wholeMeshMaxMm;
  if (interior.worstFacet >= 0 && interior.wholeMeshMaxMm > 0) {
    const [wx, wy, wz] = interior.worstXyz;
    const nw = newtonNearest(rA, H, wx, wy, wz, {
      seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
    });
    newtonWorst = Math.min(interior.wholeMeshMaxMm, nw.dist);
  }

  let newtonAll: ForwardScore['newtonAll'];
  if (opts.newtonAll) {
    const facetOver = new Set<number>();
    let over = 0, max = 0;
    for (const p of overMine) {
      const nd = Math.min(
        p.radial,
        newtonNearest(rA, H, p.x, p.y, p.z, {
          seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
        }).dist,
      );
      if (nd > max) max = nd;
      if (nd > tol) { over++; facetOver.add(p.facet); }
    }
    newtonAll = { pointsScored: overMine.length, pointsOver: over, facetsOver: facetOver.size, max };
  }

  return {
    vertexOnSurf, survivors: survivors.length, outliers: interior.interiorOutliers,
    gridMax: interior.wholeMeshMaxMm, gridP99: interior.p99, newtonWorst, newtonAll,
    scoredSurvivors: mine.length,
    ms: Date.now() - t0,
  };
}

export function gpcScoreCoverage(
  xyz: Float32Array, idx: Uint32Array, rA: AnalyticRadiusFn, H: number, tol: number,
): CoverageScore {
  const nV = xyz.length / 3;
  const nF = idx.length / 3;
  const refXyz = new Float64Array(xyz.length);
  for (let i = 0; i < xyz.length; i++) refXyz[i] = xyz[i];
  const ref: RefMesh = { xyz: refXyz, idx, nV, nF };
  let edgeSum = 0;
  const eSamples = Math.min(2000, nF);
  for (let s = 0; s < eSamples; s++) {
    const t = Math.floor((s / eSamples) * nF) * 3;
    const a = idx[t] * 3, b = idx[t + 1] * 3;
    edgeSum += Math.hypot(xyz[b] - xyz[a], xyz[b + 1] - xyz[a + 1], xyz[b + 2] - xyz[a + 2]);
  }
  const cell = Math.max(0.4, Math.min(3.0, (edgeSum / Math.max(1, eSamples)) * 4));
  const loc = buildRefLocator(ref, cell);
  const bandMm = 0.5;
  const NU = 1024, NT = 1024;
  const cov = new Float64Array(NU * NT);
  let covN = 0;
  let worstU = 0, worstT = 0, worstD = -1;
  const t0 = Date.now();
  for (let j = 0; j < NT; j++) {
    const z = bandMm + ((H - 2 * bandMm) * j) / (NT - 1);
    for (let i = 0; i < NU; i++) {
      const th = (TAU * i) / NU;
      const r = rA(th, z);
      const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
      cov[covN++] = d;
      if (d > worstD) { worstD = d; worstU = th / TAU; worstT = z / H; }
    }
  }
  let refinedMax = worstD;
  const du = 1 / NU, dt = (H - 2 * bandMm) / (NT - 1) / H;
  for (let j = -8; j <= 8; j++) {
    for (let i = -8; i <= 8; i++) {
      const u = worstU + (i * du) / 4;
      const z = Math.min(H - bandMm, Math.max(bandMm, (worstT + (j * dt) / 4) * H));
      const th = ((u % 1) + 1) % 1 * TAU;
      const r = rA(th, z);
      refinedMax = Math.max(refinedMax, loc.dist(r * Math.cos(th), r * Math.sin(th), z));
    }
  }
  const covStats = pctStats(cov, covN, tol);
  const bDev = new Float64Array(NU * 4);
  let bN = 0;
  for (const z of [bandMm * 0.5, bandMm * 0.25, H - bandMm * 0.5, H - bandMm * 0.25]) {
    for (let i = 0; i < NU; i++) {
      const th = (TAU * i) / NU;
      const r = rA(th, z);
      bDev[bN++] = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
    }
  }
  let locSelfCheckMax = 0;
  for (let s = 0; s < 24; s++) {
    const th = (TAU * ((s * 79) % 1024)) / 1024;
    const z = bandMm + (H - 2 * bandMm) * (((s * 131) % 997) / 997);
    const r = rA(th, z);
    const px = r * Math.cos(th), py = r * Math.sin(th);
    locSelfCheckMax = Math.max(locSelfCheckMax, Math.abs(loc.dist(px, py, z) - loc.bruteDist(px, py, z)));
  }
  return {
    max: refinedMax, p99: covStats.p99, p50: covStats.p50, over: covStats.over,
    worstUt: [worstU, worstT], boundary: pctStats(bDev, bN, tol),
    locatorCellMm: cell, locSelfCheckMax, ms: Date.now() - t0,
  };
}

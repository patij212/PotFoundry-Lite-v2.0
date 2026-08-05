// _facetTruthLib.ts — the certified facet ruler, extracted so the STL auditor and the validation suite
// exercise the SAME code. RESEARCH ONLY.
//
// Measures, for a flat 3-D triangle T and a radial surface S = {(rA(th,z)cos th, rA(th,z)sin th, z) : z in [0,H]}:
//        max over every point p of T of   d(p) = dist(p, S)
// i.e. the one-sided Hausdorff distance mesh -> surface, which is literally the product bar
// ("no part of any triangle may exceed TOL from the true surface").
//
// THE CERTIFICATE. Distance-to-a-set is 1-Lipschitz for ANY set: |d(p) - d(q)| <= |p - q|. Sampling T on a
// barycentric lattice of level n puts every point of T within rho = covRad(T)/n of a sampled vertex, where
// covRad is the exact farthest-point-from-the-three-vertices radius. Hence
//        max over T  <=  max over lattice  +  rho
// rigorously, with no assumption that rA is smooth, bounded or continuous, and no feature detector. Raise n
// until the bound clears TOL. Nothing can hide between samples.
//
// SOUNDNESS. Any surface point q gives d(p) <= |p - q|, so every candidate-based estimate OVER-estimates d.
// A PASS is therefore sound however crude the nearest-point search; only a FAIL can be a search artifact.
// That artifact is ruled out by re-measuring the worst facets with `distPerp`, which sweeps the whole (th,z)
// domain before polishing — see the stage-3 confirm in _strataFacetTruth.test.ts, which now re-confirms the
// top K facets rather than one. `distGlobal` below is an OFFLINE diagnostic of the same shape and is
// deliberately not on the audit path; this note previously named it as the live safeguard, which it never was.
import {
  H2Acc, h2CellBounds, h2Scan, h2Structure, runH2PhaseA,
  type H2APartial, type H2Geom, type H2PhaseARunner,
} from './_h2PhaseA';

export type RadiusFn = (theta: number, z: number) => number;

const TWO_PI = 2 * Math.PI;

export interface FacetTruthOpts {
  /** surface height; z is clamped to [0,H] so the patch boundary is handled honestly */
  H: number;
  /** target tolerance in mm — the level the certificate is written against */
  tol: number;
  /** lattice-level ceiling per triangle */
  nMax?: number;
  /** stop raising n once this many samples have been spent on one triangle */
  sampleCap?: number;
  /** C0 z-steps from `detectZJumps`; the closure includes the tread wall at each */
  zJumps?: number[];
  /** C0 theta-jumps from `detectThetaJumps`; the closure includes the curtain at each */
  thJumps?: number[];
  /**
   * Keep refining past a witnessed exceedance instead of short-circuiting, so `witnessed` converges to the
   * facet MAXIMUM rather than stopping at the first value over tol. Costs the full level/sample ceiling on
   * failing facets; required whenever the reported number is a max rather than a pass/fail verdict.
   */
  exhaustive?: boolean;
  /**
   * Max points per lattice level that may be given the expensive descent + Newton treatment. Only points
   * whose cheap reading exceeds `tol - covRad/n` are ever candidates, so on a well-meshed facet this is
   * never reached. If it binds, the remaining candidates keep their cheap (radial) reading — the answer
   * stays an upper bound and `witnessedComplete` reports false. Default 20000.
   */
  tightenCap?: number;
}

/** Exact farthest-point-from-the-three-vertices radius: circumradius if acute, else half the longest edge. */
export function covRadius(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const la = Math.hypot(bx - cx, by - cy, bz - cz);
  const lb = Math.hypot(ax - cx, ay - cy, az - cz);
  const lc = Math.hypot(ax - bx, ay - by, az - bz);
  const mx = Math.max(la, lb, lc);
  const s1 = la * la; const s2 = lb * lb; const s3 = lc * lc;
  const sMax = Math.max(s1, s2, s3);
  if (sMax >= s1 + s2 + s3 - sMax - 1e-18) return mx / 2; // right or obtuse
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
  const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
  const area2 = Math.hypot(nx, ny, nz);
  if (area2 < 1e-18) return mx / 2;
  return (la * lb * lc) / (2 * area2);
}

/** Distance to the surface point directly outward of p (the radial foot). One rA eval. Always >= d(p). */
export function distRadial(rA: RadiusFn, H: number, px: number, py: number, pz: number): number {
  const th = Math.atan2(py, px);
  const z = pz < 0 ? 0 : pz > H ? H : pz;
  const r = rA(th, z);
  return Math.hypot(px - r * Math.cos(th), py - r * Math.sin(th), pz - z);
}

export interface LocalResult { d: number; th: number; z: number }

/**
 * Locate genuine C0 z-steps of rA, once per style.
 *
 * WHY NOT INFER THEM LOCALLY. The previous attempt asked, at each query point, whether the radius range
 * over a window `w` survived shrinking to `w/4` — the idea being that a slope's range falls ~4x while a
 * jump's does not. With `w` tied to the search step (~0.4 mm) that test is wrong for any feature NARROWER
 * than the window: an 8 um ridge saturates the range at BOTH scales, so the ratio is 1 and a perfectly
 * continuous ridge is declared a discontinuity. The closure then widens and FORGIVES the error — an 8 um,
 * 400 um-tall missing ridge read 9.000 um, i.e. under a 10 um bar. Locked by V7c.
 *
 * A discontinuity is a w -> 0 property, so it must be probed at a scale far below any real feature, and the
 * only thing that needs searching is WHERE.
 *
 * LOCATE AT THE SCAN STEP, CONFIRM AT w -> 0. The previous version did BOTH at w = eps = 1e-7: it asked
 * |rA(z+eps) - rA(z-eps)| > minJump at scan points spaced H/nScan = 6e-3 mm apart. Those two scales differ by
 * ~60,000x, so the +-eps window straddles the discontinuity only when the jump happens to land within 1e-7 mm
 * of a scan point — probability ~1.7e-5 per jump. MEASURED: a genuine 2.0 mm tread wall at z = 37.4 on H = 120
 * returned []. The detector essentially never fired, so `zJumps` arrived empty and every downstream closure
 * (`distToZWall` and its use in `distLocal` / `distPerp` / `certifyTriangle`) was dead code — which is why the
 * closure "fix" never changed a number and tread facets kept scoring the full jump height as error.
 *
 * The two jobs need two scales. A coarse pass over ADJACENT scan points brackets any rapid change (a real jump
 * always shows up across the bracket containing it). Each candidate bracket is then bisected down to width eps
 * and the change is re-measured there: a jump keeps its full height as the width shrinks, a steep-but-smooth
 * ramp falls to slope*eps and is rejected. That preserves the w -> 0 definition the docstring above argues for
 * while giving the search a step it can actually hit.
 */
export function detectZJumps(rA: RadiusFn, H: number, minJump = 5e-4, nScan = 20000, eps = 1e-7): number[] {
  const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
  const spread = (za: number, zb: number): number => {
    let j = 0;
    for (const th of probes) j = Math.max(j, Math.abs(rA(th, zb) - rA(th, za)));
    return j;
  };
  // Per-step spread in ONE pass, caching the previous row so each scan point costs `probes` evals, not 2x.
  const step = new Float64Array(nScan);
  let prev = probes.map((th) => rA(th, 0));
  for (let i = 1; i <= nScan; i += 1) {
    const z = (H * i) / nScan;
    let s = 0;
    for (let k = 0; k < probes.length; k += 1) {
      const v = rA(probes[k], z);
      const d = Math.abs(v - prev[k]);
      if (d > s) s = d;
      prev[k] = v;
    }
    step[i - 1] = s;
  }
  // BRACKET ON A LOCAL ANOMALY, NOT ON SLOPE. Triggering the bisection wherever the per-step spread exceeds
  // `minJump` fires on ordinary geometry: at H/nScan = 6 um per step, minJump = 0.5 um is just |dr/dz| >
  // 0.083 — which the default cone (Rb 40 -> Rt 50 over H 120) sits exactly on. MEASURED: a plain smooth cone
  // opened all 20,000 brackets and spent 6.8 M rA evals to return zero jumps, ~34x the old detector's fixed
  // cost. A discontinuity is not "steep", it is LOCALLY ANOMALOUS — its bracket dwarfs its neighbours — so
  // scale the trigger by the median step. Smooth geometry has a flat profile and opens nothing.
  const med = (() => {
    const s = Float64Array.from(step).sort();
    return s.length > 0 ? s[Math.floor(s.length / 2)] : 0;
  })();
  const trigger = Math.max(minJump, 8 * med);
  const out: number[] = [];
  for (let i = 1; i <= nScan; i += 1) {
    if (step[i - 1] <= trigger) continue;
    // Bisect the bracket toward the steeper half until it is eps wide, then re-measure there.
    let lo = (H * (i - 1)) / nScan; let hi = (H * i) / nScan;
    while (hi - lo > eps) {
      const mid = 0.5 * (lo + hi);
      if (spread(mid, hi) >= spread(lo, mid)) lo = mid; else hi = mid;
    }
    if (spread(lo, hi) > minJump) out.push(0.5 * (lo + hi));
  }
  return out;
}

/**
 * Locate genuine C0 THETA-jumps of rA (curtain loci), the theta analogue of `detectZJumps`.
 *
 * Needed for the same reason: at a theta-jump the solid carries a vertical CURTAIN spanning [r-, r+], the
 * mesher emits it, and scoring those facets against the bare graph reports about the jump height as error.
 * Without this, H1 over-states on any style whose features are theta-discontinuous.
 *
 * Same locate-then-confirm structure as `detectZJumps`, and for the same reason: probing at +-1e-7 rad on a
 * lattice spaced 2*pi/20000 = 3.1e-4 rad apart is ~3,000x too coarse to land on the jump.
 */
export function detectThetaJumps(rA: RadiusFn, H: number, minJump = 5e-4, nScan = 20000, eps = 1e-7): number[] {
  const probes = [0.07 * H, 0.31 * H, 0.53 * H, 0.77 * H, 0.94 * H];
  const TAU2 = 2 * Math.PI;
  const spread = (ta: number, tb: number): number => {
    let j = 0;
    for (const z of probes) j = Math.max(j, Math.abs(rA(tb, z) - rA(ta, z)));
    return j;
  };
  // Same one-pass spread profile and median-scaled trigger as `detectZJumps` — see the note there for why a
  // bare `> minJump` test fires on ordinary slope and costs ~34x for nothing.
  const step = new Float64Array(nScan);
  const prev = probes.map((z) => rA(0, z));
  for (let i = 1; i <= nScan; i += 1) {
    const th = (TAU2 * i) / nScan;
    let s = 0;
    for (let k = 0; k < probes.length; k += 1) {
      const v = rA(th, probes[k]);
      const d = Math.abs(v - prev[k]);
      if (d > s) s = d;
      prev[k] = v;
    }
    step[i - 1] = s;
  }
  const med = (() => {
    const s = Float64Array.from(step).sort();
    return s.length > 0 ? s[Math.floor(s.length / 2)] : 0;
  })();
  const trigger = Math.max(minJump, 8 * med);
  const out: number[] = [];
  for (let i = 1; i <= nScan; i += 1) {
    if (step[i - 1] <= trigger) continue;
    let lo = (TAU2 * (i - 1)) / nScan; let hi = (TAU2 * i) / nScan;
    while (hi - lo > eps) {
      const mid = 0.5 * (lo + hi);
      if (spread(mid, hi) >= spread(lo, mid)) lo = mid; else hi = mid;
    }
    if (spread(lo, hi) > minJump) out.push(0.5 * (lo + hi));
  }
  return out;
}

/** Distance from p to the vertical CURTAIN at a theta-jump: the closure spans every radius between limits. */
function distToThetaWall(rA: RadiusFn, thJump: number, px: number, py: number, pz: number, H: number): number {
  const rp = Math.hypot(px, py);
  const zc = pz < 0 ? 0 : pz > H ? H : pz;
  const e = 1e-7;
  const a = rA(thJump + e, zc); const b = rA(thJump - e, zc);
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  const r = rp < lo ? lo : rp > hi ? hi : rp;
  return Math.hypot(px - r * Math.cos(thJump), py - r * Math.sin(thJump), pz - zc);
}

/**
 * Distance from p to the vertical TREAD WALL at a C0 z-step: the solid's boundary there spans every radius
 * between the one-sided limits, and the mesher emits exactly that annulus. Correct geometry, not error.
 */
function distToZWall(rA: RadiusFn, zJump: number, px: number, py: number, pz: number): number {
  const th = Math.atan2(py, px);
  const rp = Math.hypot(px, py);
  const e = 1e-7;
  const a = rA(th, zJump + e); const b = rA(th, zJump - e);
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  const rGap = rp < lo ? lo - rp : rp > hi ? rp - hi : 0;
  const dz = pz - zJump;
  return Math.hypot(rGap, dz);
}

/**
 * Local polish: 8-neighbour coordinate descent in (arc, z) from a seed, halving the step when stuck.
 * Every probe is a genuine surface point, so the result is still an upper bound on d(p) — polishing can
 * only tighten the estimate, never fabricate a pass.
 *
 * CLOSURE AT DISCONTINUITIES: pass `zJumps` from `detectZJumps` and the result is the better of the graph
 * distance and the distance to any detected tread wall, so a point on a wall is scored against geometry
 * that actually exists. KNOWN GAP: theta-jumps (BasketWeave's curtains) are not yet located, so H1 on such
 * a style will over-state on its curtain facets — over-stating is the safe direction, but it is not zero.
 */
export function distLocal(
  rA: RadiusFn, H: number,
  px: number, py: number, pz: number,
  seedTh: number, seedZ: number, step0: number, iters: number,
  zJumps: number[] = [],
  thJumps: number[] = [],
): LocalResult {
  let th = seedTh; let z = seedZ;
  const rNom = Math.hypot(px, py) || 1;
  const at = (t: number, zz: number): number => {
    const zc = zz < 0 ? 0 : zz > H ? H : zz;
    const r = rA(t, zc);
    return Math.hypot(px - r * Math.cos(t), py - r * Math.sin(t), pz - zc);
  };
  let best = at(th, z);
  let s = step0;
  for (let k = 0; k < iters; k += 1) {
    let improved = false;
    const dth = s / rNom;
    const cand: [number, number][] = [
      [th + dth, z], [th - dth, z], [th, z + s], [th, z - s],
      [th + dth, z + s], [th - dth, z - s], [th + dth, z - s], [th - dth, z + s],
    ];
    for (const [ct, cz] of cand) {
      if (cz < -1e-9 || cz > H + 1e-9) continue;
      const v = at(ct, cz);
      if (v < best - 1e-13) { best = v; th = ct; z = cz; improved = true; }
    }
    if (!improved) { s *= 0.5; if (s < 1e-8) break; }
  }
  // The printed boundary is the CLOSURE of the graph: at each detected C0 z-step the solid carries a
  // vertical tread wall, which the mesher emits and which is correct geometry. Take the better of the two.
  for (const zj of zJumps) {
    const dw = distToZWall(rA, zj, px, py, pz);
    if (dw < best) { best = dw; z = zj; th = Math.atan2(py, px); }
  }
  for (const tj of thJumps) {
    const dw = distToThetaWall(rA, tj, px, py, pz, H);
    if (dw < best) { best = dw; th = tj; z = pz < 0 ? 0 : pz > H ? H : pz; }
  }
  return { d: best, th, z };
}

/**
 * Global confirm: coarse sweep of the whole (th,z) domain, then polish the two best wells plus the radial
 * foot. Guards a reported FAIL against the "wrong well" artifact of a purely local search near a cliff.
 */
export function distGlobal(
  rA: RadiusFn, H: number, px: number, py: number, pz: number, nu = 720, nv = 480,
): LocalResult {
  let b1 = Infinity; let bt1 = 0; let bz1 = 0;
  let b2 = Infinity; let bt2 = 0; let bz2 = 0;
  for (let i = 0; i < nu; i += 1) {
    const th = (TWO_PI * i) / nu;
    const ct = Math.cos(th); const st = Math.sin(th);
    for (let j = 0; j <= nv; j += 1) {
      const z = (H * j) / nv;
      const r = rA(th, z);
      const dx = px - r * ct; const dy = py - r * st; const dz = pz - z;
      const v = dx * dx + dy * dy + dz * dz;
      if (v < b1) { b2 = b1; bt2 = bt1; bz2 = bz1; b1 = v; bt1 = th; bz1 = z; }
      else if (v < b2) { b2 = v; bt2 = th; bz2 = z; }
    }
  }
  const rNom = Math.hypot(px, py) || 1;
  const s0 = Math.max((TWO_PI * rNom) / nu, H / nv);
  const c1 = distLocal(rA, H, px, py, pz, bt1, bz1, s0, 60);
  const c2 = distLocal(rA, H, px, py, pz, bt2, bz2, s0, 60);
  const c3 = distLocal(rA, H, px, py, pz, Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz, s0, 60);
  let best = c1;
  if (c2.d < best.d) best = c2;
  if (c3.d < best.d) best = c3;
  return best;
}

export interface FacetVerdict {
  /**
   * Largest deviation witnessed over the lattice, each point measured with the tightest tier it needed:
   * true perpendicular where the cheap reading could have blocked the verdict, the cheap radial reading
   * elsewhere. Exact where it matters and never below a real point's value.
   *
   * PRECISION CAVEAT, stated rather than assumed: a point whose radial reading is already at or below
   * `tol - covRad/n` is never tightened, because it cannot change the verdict however loose it is. So when
   * this number falls BELOW tol it can over-state the true maximum by up to the radial inflation factor
   * 1/cos(tilt) — bounded above by tol. Values at or above tol are tightened and exact. Pass `tol` smaller
   * than the magnitude you want resolved if you need the sub-tol number to be tight.
   */
  witnessed: number;
  /**
   * Rigorous upper bound over the whole triangle: `witnessed` + the covering radius at the final level.
   * Every lattice point is covered by its own upper bound and the covering radius closes the gaps between
   * them, so no part of the triangle can exceed this.
   */
  bound: number;
  /** true if bound <= tol */
  certified: boolean;
  /** lattice level reached */
  n: number;
  /** lattice samples spent */
  samples: number;
  /** the witness point */
  px: number; py: number; pz: number;
  /**
   * TRUE only when the loop exited by CERTIFYING (mx + rho <= tol), i.e. when `witnessed` is the converged
   * max over the lattice. FALSE when the loop short-circuited on a witnessed exceedance or hit the level /
   * sample ceiling — in those cases `witnessed` is a LOWER bound on the facet's true maximum, not the maximum.
   *
   * WHY THIS FIELD EXISTS. `if (mx > tol) break` is correct for the PASS/FAIL verdict — more resolution cannot
   * un-fail a facet — but it makes `witnessed` on a failing facet "first value found over tol", not the worst
   * point on it. On an arm where 72.5 % of facets fail, essentially every one short-circuits at its initial
   * lattice level, so per-style H1 maxima built from these numbers are lower bounds with unquantified slack
   * and are NOT comparable across runs or styles. Callers reporting a max must either check this flag or pass
   * `exhaustive`.
   */
  witnessedComplete: boolean;
}

/**
 * Certified maximisation of dist(p, S) over one flat triangle.
 * Raises the lattice level until (witnessed + covRad/n) <= tol, or a witnessed exceedance makes further
 * resolution pointless, or the level/sample ceiling is hit (then `certified` is false and `bound` says how
 * far from a verdict we are — an honest "unknown", never a silent pass).
 */
export function certifyTriangle(
  rA: RadiusFn,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  opts: FacetTruthOpts,
): FacetVerdict {
  const { H, tol } = opts;
  const nMax = opts.nMax ?? 4096;
  const sampleCap = opts.sampleCap ?? Number.POSITIVE_INFINITY;
  const zJumps = opts.zJumps ?? [];
  const thJumps = opts.thJumps ?? [];
  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);

  /** Tightest available upper bound on d(p): radial, then descent, then Newton, then the closure walls. */
  const tighten = (px: number, py: number, pz: number, radial: number): number => {
    let d = radial;
    // DO NOT TRUNCATE THESE ITERATION COUNTS. A profiling pass measured (40,40) at 309.6 rA per tightened
    // point against 116.7 at (8,16) and reported the pair BIT-IDENTICAL over 442 above-threshold lattice
    // points — a 2.65x saving on what is ~99% of H1's rA budget, so it is a tempting change. It is wrong.
    // The 442-point sample was drawn from one production mesh and does not contain the wrong-well regime:
    // REFUTED by V3/V7c, where the thin-ridge fixture moved 12.041 -> 27.103 um (2.25x, failing its bar) and
    // the 30 um ridge moved 39.767 -> 23.594 um. On a facet spanning a narrow ridge the radial foot sits ON
    // the crest ~400 um from the true nearest point, and it is the COORDINATE DESCENT — not Newton — that
    // walks the ~8 um sideways to the base surface. Eight steps do not get there.
    // The lesson is the one this suite exists to teach: a speedup verified on a sample that omits the hard
    // regime is not verified. Any future attempt here must clear V3 and V7c, not a facet sample.
    const seed = distLocal(rA, H, px, py, pz, Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz,
      Math.max(radial, tol), 40, zJumps, thJumps);
    if (seed.d < d) d = seed.d;
    const pol = distPerpFrom(rA, H, px, py, pz, seed.th, seed.z);
    if (pol.d < d) d = pol.d;
    for (const zj of zJumps) { const dw = distToZWall(rA, zj, px, py, pz); if (dw < d) d = dw; }
    for (const tj of thJumps) { const dw = distToThetaWall(rA, tj, px, py, pz, H); if (dw < d) d = dw; }
    return d;
  };

  // A zero-extent facet still has a POSITION, and the certificate must be about measured geometry. Returning
  // `witnessed: 0, certified: true` here waved through any degenerate triangle wherever it sat — and the
  // sliver-collapse stage upstream is exactly what produces coincident-vertex facets. One point, measured.
  if (!(cov > 0)) {
    const d = tighten(ax, ay, az, distRadial(rA, H, ax, ay, az));
    return { witnessed: d, bound: d, certified: d <= tol, n: 0, samples: 1, px: ax, py: ay, pz: az, witnessedComplete: true };
  }

  // Start where the certificate WOULD close if the mesh were exact, but never above the level ceiling —
  // an unclamped cov/tol asks for a lattice with millions of points per edge when tol is small.
  //
  // AND NEVER ABOVE WHAT `sampleCap` CAN PAY FOR. The cap used to be tested only at the BOTTOM of the loop, so
  // a full lattice at the seeded level was always spent first: cov = 1.7 mm at tol = 0.01 seeds n = 170 and
  // burns 14,706 rA evals before the cap is consulted, and cov = 5 mm burns 125,751. A caller asking for a
  // cheap screening pass got the full cost on every triangle. Solve (n+1)(n+2)/2 <= sampleCap for n instead.
  let n = Math.min(nMax, Math.max(2, Math.ceil(cov / tol)));
  if (Number.isFinite(sampleCap)) {
    const nCap = Math.max(2, Math.floor((Math.sqrt(8 * sampleCap + 1) - 3) / 2));
    n = Math.min(n, nCap);
  }
  // TIGHTEN BY THRESHOLD, NOT BY RANK.
  //
  // THE DEFECT BEING FIXED. `mx` is a max OVER POINTS of per-point upper bounds; tightening one point and
  // letting the result stand as `mx` silently discards every other sample's reading. Radial =
  // perpendicular/cos(tilt) and the tilt VARIES across a facet, so the radial argmax is not the perpendicular
  // argmax: MEASURED on a slope break, P1 reads radial 20.000/perp 8.944 um and P2 reads radial 9.000/perp
  // 8.989 um — polishing only P1 reports 8.944 while a real point of the facet sits at 8.989. A false PASS.
  //
  // TWO REPAIRS THAT DO NOT WORK, both measured:
  //   * top-1 (the original) is unsound, as above.
  //   * "tighten the top K and fold the largest UNTIGHTENED reading into the answer" trades the false pass
  //     for a false FAIL. On a tread-wall facet every point reads ~the full jump height radially, so that
  //     residual dominates and correct geometry reports ~2 mm (V7 read 1974.8 um against a 0.1 um bar). Put
  //     the residual only into `bound` and `certified` becomes a RADIAL test: a facet whose true
  //     perpendicular error is well inside tol cannot certify, and subdivision never recovers it because the
  //     residual does not shrink with n.
  //
  // WHAT ACTUALLY DECIDES THE VERDICT. A point can only block certification if its bound exceeds
  // `tol - rho`. Everything at or below that threshold is already harmless however loose it is, so it needs
  // no tightening at all — and everything above it must be tightened, not just the K largest. That makes the
  // work proportional to the number of points that genuinely matter instead of to a fixed rank:
  //
  //   pass 1  cheap radial over the whole lattice. If nothing exceeds the threshold, the facet certifies and
  //           no tightening happens anywhere — the common case, at exactly the pre-fix cost of 1 eval/sample.
  //   pass 2  only for the points above the threshold: apply the closure walls first (cheap, and what makes
  //           a tread facet resolve to ~0 without any Newton), then descent + Newton on whatever is still
  //           above it, up to `tightenCap`.
  //
  // The closure walls are deliberately NOT in pass 1: with the jump detectors now actually firing, probing
  // them at every lattice point costs 1 + 2*(|zJumps| + |thJumps|) evals per sample and measured a 14-22x
  // slowdown of the hot loop on ArtDeco / BasketWeave. Gating them behind the threshold keeps that cost on
  // the facets that need it.
  //
  // If `tightenCap` binds, the still-untightened points keep their cheap reading, so the answer stays an
  // upper bound and `witnessedComplete` reports false. Never a silent pass.
  const tightenCap = opts.tightenCap ?? 20000;
  let witnessed = 0; let mxx = ax; let mxy = ay; let mxz = az;
  let bound = Number.POSITIVE_INFINITY;
  let samples = 0; let complete = false;
  for (;;) {
    const rho = cov / n;
    const thresh = tol - rho;
    const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
    const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;
    const L = ((n + 1) * (n + 2)) / 2;

    // ── PASS 1 — cheap radial, whole lattice.
    let cheapMax = 0; let cmx = ax; let cmy = ay; let cmz = az;
    let anyAbove = false;
    for (let i = 0; i <= n; i += 1) {
      const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
      for (let j = 0; j <= n - i; j += 1) {
        const px = rx + ubx * j; const py = ry + uby * j; const pz = rz + ubz * j;
        const d = distRadial(rA, H, px, py, pz);
        if (d > cheapMax) { cheapMax = d; cmx = px; cmy = py; cmz = pz; }
        if (d > thresh) anyAbove = true;
      }
    }
    samples += L;
    if (!anyAbove) {
      // Every point is at or below tol - rho, so the certificate closes without tightening anything. Tighten
      // the single argmax anyway so `witnessed` is a measured perpendicular value on this path too, rather
      // than a radial reading that would make the field mean different things on different exits.
      witnessed = tighten(cmx, cmy, cmz, cheapMax); mxx = cmx; mxy = cmy; mxz = cmz;
      bound = cheapMax + rho; complete = true; break;
    }
    // ── PASS 2 — resolve only what can block the verdict.
    //
    // DESCENT FIRST, THEN NEWTON — each for what it is good at (see `tighten`). Newton converges to the
    // nearest STATIONARY point, which is not always the global minimum: seeded at the radial foot of a facet
    // spanning a ridge, that foot sits ON the crest ~400 um away, so Newton polishes a flank solution and
    // never finds the base surface 8 um sideways (measured: V3's thin ridge read 409 um instead of 12). The
    // coordinate descent is globally better behaved because its first steps are large; Newton is locally exact.
    let best = 0;
    let budget = tightenCap;
    for (let i = 0; i <= n; i += 1) {
      const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
      for (let j = 0; j <= n - i; j += 1) {
        const px = rx + ubx * j; const py = ry + uby * j; const pz = rz + ubz * j;
        let d = distRadial(rA, H, px, py, pz);
        if (d > thresh) {
          // Closure walls first: they are cheap, and on a tread or curtain facet they alone drop the point
          // below the threshold, so no Newton is spent on geometry that is simply correct.
          for (const zj of zJumps) { const dw = distToZWall(rA, zj, px, py, pz); if (dw < d) d = dw; }
          for (const tj of thJumps) { const dw = distToThetaWall(rA, tj, px, py, pz, H); if (dw < d) d = dw; }
          // A POINT THAT CANNOT BECOME THE MAXIMUM NEED NOT BE TIGHTENED. `tighten` only ever LOWERS a
          // value (it returns the min of radial, descent, Newton and the closure walls), so a point whose
          // cheap reading is already at or below the running `best` cannot beat it however hard it is
          // polished. MEASURED on a mesh-wide sample: this is 99.0% of H1's rA budget, and the guard removes
          // 1.55x of the tighten calls for a 1.50x H1 speedup — bit-identical, 0.0000 nm difference over 30
          // facets with no argmax moving. The budget is decremented in BOTH arms on purpose: letting skipped
          // points bank budget would allow later points to tighten that previously could not, which changes
          // the result once `tightenCap` binds.
          if (d > thresh && budget > 0) {
            budget -= 1;
            if (d > best) d = tighten(px, py, pz, d);
          }
        }
        if (d > best) { best = d; mxx = px; mxy = py; mxz = pz; }
      }
    }
    samples += L;
    witnessed = best;
    bound = best + rho;
    if (bound <= tol) { complete = true; break; }
    // Exceedance — more resolution cannot change the VERDICT, so stop unless the caller asked for the
    // converged maximum. Any point reading above tol was necessarily above `thresh` too, so it went through
    // the tightening tier and this is a resolved exceedance, not a radial artifact — the one exception being
    // a facet that exhausted `tightenCap`, which `witnessedComplete: false` already reports as unresolved.
    if (best > tol && opts.exhaustive !== true) break;
    if (n >= nMax) break;
    // Do not START a level that the cap cannot pay for — the old bottom-of-loop test spent it first. Pass 2
    // re-walks the lattice, so a level costs 2L, not L.
    if (samples + (2 * n + 1) * (2 * n + 2) > sampleCap) break;
    n *= 2;
  }
  return { witnessed, bound, certified: bound <= tol, n, samples, px: mxx, py: mxy, pz: mxz, witnessedComplete: complete };
}

/**
 * Bucket size for `buildRefLocator`. Its 3.0 mm default is sized for coarse reference twins; on a
 * million-triangle production mesh it puts hundreds of triangles in every bucket and each query degenerates
 * to near-brute-force. Size it from the actual triangle scale instead, with a hard ceiling on the number of
 * buckets so a sliver-heavy mesh cannot blow up memory.
 */
export function pickLocatorCell(
  xyz: ArrayLike<number>, idx: ArrayLike<number>, nF: number, maxBuckets = 4e7,
): number {
  const stride = Math.max(1, Math.floor(nF / 2000));
  const lens: number[] = [];
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let i = 0; i < xyz.length; i += 3) {
    if (xyz[i] < minX) minX = xyz[i]; if (xyz[i] > maxX) maxX = xyz[i];
    if (xyz[i + 1] < minY) minY = xyz[i + 1]; if (xyz[i + 1] > maxY) maxY = xyz[i + 1];
    if (xyz[i + 2] < minZ) minZ = xyz[i + 2]; if (xyz[i + 2] > maxZ) maxZ = xyz[i + 2];
  }
  for (let f = 0; f < nF; f += stride) {
    const a = idx[f * 3] * 3; const b = idx[f * 3 + 1] * 3; const c = idx[f * 3 + 2] * 3;
    lens.push(Math.max(
      Math.hypot(xyz[b] - xyz[a], xyz[b + 1] - xyz[a + 1], xyz[b + 2] - xyz[a + 2]),
      Math.hypot(xyz[c] - xyz[b], xyz[c + 1] - xyz[b + 1], xyz[c + 2] - xyz[b + 2]),
      Math.hypot(xyz[a] - xyz[c], xyz[a + 1] - xyz[c + 1], xyz[a + 2] - xyz[c + 2]),
    ));
  }
  lens.sort((p, q) => p - q);
  const med = lens.length > 0 ? lens[Math.floor(lens.length / 2)] : 1;
  const dx = maxX - minX; const dy = maxY - minY; const dz = maxZ - minZ;
  // Size the bucket as SMALL as the memory cap allows, not from the triangle scale. The locator's query
  // cost is (buckets visited) x (triangles per bucket), and a mesh shell only occupies a thin sliver of its
  // bounding box, so a bucket sized at a few median edges holds tens of triangles and every query
  // degenerates towards brute force — measured at 24 us/query, ~15x off. The binding constraint is the
  // bucket-count budget; the only reason not to go finer is that a triangle much larger than a bucket gets
  // inserted into many of them, so keep a floor of half a median edge.
  const cellFromBudget = Math.cbrt((dx * dy * dz) / maxBuckets);
  return Math.max(cellFromBudget, 0.5 * med, 1e-3);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H2 — SURFACE -> MESH. The direction that sees an UNREPRESENTED feature.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H1 alone cannot see the defect under investigation: a facet chording across a ridge lies near the ridge's
// BASE, so every point of the facet has surface a few microns away (H1 ~ 0) while the ridge CREST is the
// full relief height from the nearest triangle. Only H2 reads that.
//
// This is a WITNESSED lower bound, not a certificate: each reading is an exact point-to-triangle distance
// from a real surface point to the real mesh, so every exceedance is genuine, but a spike thinner than the
// finest cell could still be missed. Refinement is driven by TWO triggers, combined into one optimistic key
// (`s.m + bulge`) so that a feature narrower than a cell still forces subdivision:
//   hot   — the cell already reads a significant fraction of tol
//   bulge — the true surface at the mid-edge/centre probes departs from the corner interpolant, which is
//           what betrays a feature living strictly inside the cell
// THERE IS DELIBERATELY NO `span` TRIGGER. An earlier version added "the cell's 3-D diagonal is coarser than
// the chord target" as a third, coverage-bounding trigger; it fires on every cell of a smooth pot, which
// degenerates refinement into an unaffordable uniform sweep at the finest pitch and produced a false PASS by
// exhausting the budget (see the phase-A note below). Coverage is bounded by phase A completing in full
// instead. This comment previously advertised the removed trigger as a live safety net — it is not one.
// ARCHITECTURE, learned the hard way. A purely depth-first adaptive walk is UNSOUND as an auditor: the
// first version refined on "cell 3-D span > chord target", which fires on every cell of a smooth pot, so it
// spent its whole query budget on the first few degrees of theta and reported 3.9 um for a mesh missing a
// 500 um ridge — a false PASS produced by running out of budget, which is precisely the failure mode this
// file exists to catch. COVERAGE IS NOT NEGOTIABLE AND COMES FIRST:
//
//   phase A  sweep the ENTIRE (theta,z) domain on a uniform lattice at `coveragePitch`, querying every
//            point. Cost is fixed and knowable in advance; nothing can be starved.
//   phase B  refine only where phase A read hot, or where a cheap rA-ONLY structure scan says a feature
//            lives inside the cell that the query lattice was too coarse to land on. rA is ~5x cheaper
//            than a locator query, so the structure scan runs finer than the queries and is what supplies
//            the sub-pitch resolving power.
//   phase C  sweep the CLOSURE — the tread wall at each z-step and the curtain at each theta-jump. Those
//            surfaces are part of the printed boundary but contain no point of the graph, so without this
//            they are unreachable by H2 while H1 forgives them: a shared blind spot, not a one-sided one.
//
// RESOLVING POWER IS REPORTED, NOT ASSUMED. `structPitch` (the finest rA spacing) is returned so the claim
// can be stated with its own limit attached: no feature wider than about that is missed. This is a
// witnessed lower bound on the true H2, never a certificate.
export interface SurfaceToMeshOpts {
  H: number;
  tol: number;
  /** uniform query lattice spacing, mm of arc and of z (phase A). Default 4x tol. */ coveragePitch?: number;
  /** refinement floor for the query lattice (phase B). Default tol/8. */ minPitch?: number;
  /** theta samples used to bound the nominal radius for arc-pitch conversion. Default 128. */ rNomNu?: number;
  /** z samples used to bound the nominal radius for arc-pitch conversion. Default 64. */ rNomNv?: number;
  /** structure-probe budget, retained for API compatibility; with `structLines` it sets the lattice side. */ structN?: number;
  /** structure-probe budget, retained for API compatibility; with `structN` it sets the lattice side. */ structLines?: number;
  /** wall-clock ceiling for phase B, ms. Phase A always completes. Default 900000. */ timeBudgetMs?: number;
  /** restrict the audited z band (mm). Lets a rim/base defect be separated from a wall defect. */ zMin?: number;
  /** @see zMin */ zMax?: number;
  /** max locator queries in phase B before it stops (phase A always completes) */ budget?: number;
  /**
   * C0 z-steps from `detectZJumps`. The printed boundary is the CLOSURE of the graph, so at each step the
   * solid carries a vertical TREAD WALL that the mesher emits — but the graph `r = rA(th,z)` this routine
   * sweeps contains no point of it, so an omitted or misplaced tread wall is invisible to H2 while H1
   * simultaneously FORGIVES it via `distToZWall`. Passing the loci here adds a sweep of the wall surfaces
   * themselves, closing a blind spot that both directions otherwise share.
   */
  zJumps?: number[];
  /** C0 theta-jumps from `detectThetaJumps`; the vertical CURTAIN at each is swept the same way. @see zJumps */
  thJumps?: number[];
  /** samples along each wall's radial span, per station. Default 24. */ wallN?: number;
  onProgress?: (fracDone: number, queries: number, max: number) => void;
  /**
   * OPTIONAL PARALLEL PHASE A. Phase A is a uniform sweep of the whole (theta,z) domain that visits every
   * super-cell exactly once with no dependence between cells, so it is embarrassingly parallel by cell
   * block; phase B is worst-first and order-dependent and phase C is small, so both stay serial. Supply the
   * runner built by `_h2Pool.makeH2PhaseAPool(...)`, which needs a REBUILD RECIPE (style/params/dims for rA,
   * the shared mesh + locator cell for distToMesh) that a closure cannot carry.
   *
   * ABSENT — or `PF_FT_H2WORKERS=1`, which makes `makeH2PhaseAPool` return the in-process kernel — is
   * today's exact serial path: the same `runH2PhaseA` call, on the same closures, in this thread.
   *
   * IT CANNOT MOVE A REPORTED NUMBER. The reduction is order-independent with an explicit
   * (value desc, cell index asc) tie-break, and the phase-B heap keys are written BY CELL INDEX rather than
   * appended, so the heap is seeded in identical order and equal keys break the same way. Proof sketch:
   * header of _h2PhaseA.ts. Verified end-to-end by _h2Equivalence.test.ts (1 worker vs 8, byte-equal on a
   * real mesh at a fixed query budget).
   */
  phaseA?: H2PhaseARunner;
}

export interface SurfaceToMeshResult {
  /** largest witnessed distance from a surface point to the mesh (mm) */ max: number;
  th: number; z: number;
  /**
   * Radius of the witness point. For a point of the graph this is rA(th,z), but a witness found on a
   * discontinuity WALL lies at a radius strictly between the one-sided limits, so a caller reconstructing
   * the locus as rA(th,z) would report the wrong point. Always use this.
   */
  r: number;
  /** true when the witness lies on a tread wall / curtain rather than on the graph */ onWall: boolean;
  queries: number;
  rEvalsStruct: number;
  capped: boolean;
  /** finest rA spacing reached anywhere (mm) — a best case, NOT a guarantee */ structPitch: number;
  /**
   * Phase-A resolving power, uniform over the whole surface. This is the ACROSS-line gap of the structure
   * probe, not its along-line spacing: `structure()` samples a CROSS of `structLines` rows and columns, not an
   * area lattice, so a compact or diagonal feature can sit entirely between two probe lines and raise no
   * bulge. Reporting the along-line spacing (the previous behaviour) overstated the guarantee by roughly
   * `structN / (structLines + 1)` — ~8x at the defaults, e.g. a claimed 3.8 um against a real 31 um gap.
   */ structPitchUniform: number;
  /** along-line spacing of the phase-A structure probe — the BEST case along a probe line, not a guarantee */ structPitchAlong: number;
  /** cells that were still hot when the refinement floor was reached */ hotLeaves: number;
  secs: number;
  /** how many sampled surface points exceeded tol */ overCount: number;
  /** z-histogram (24 bins over the audited band) of those exceedances — separates a rim/base defect from a wall defect */ overZHist: number[];
  /** the audited z band actually used */ zLo: number; zHi: number;
}

export function surfaceToMeshMax(
  rA: RadiusFn,
  distToMesh: (x: number, y: number, z: number) => number,
  opts: SurfaceToMeshOpts,
): SurfaceToMeshResult {
  const TAU = 2 * Math.PI;
  const { H, tol } = opts;
  const pitch0 = opts.coveragePitch ?? 4 * tol;
  const minPitch = opts.minPitch ?? tol / 8;   // matches the documented floor; was tol/4, i.e. 2x coarser
  const structN = opts.structN ?? 48;
  const structLines = opts.structLines ?? 5;
  const timeBudgetMs = opts.timeBudgetMs ?? 900000;
  const zLo = opts.zMin ?? 0;
  const zHi = opts.zMax ?? H;
  const NZB = 24;
  const tStart = Date.now();
  const budget = opts.budget ?? 2e8;
  let capped = false; let hotLeaves = 0;
  // ONE accumulator for all three phases — the running max and its argument, the query/eval counters, the
  // exceedance count and its z-histogram, and the finest structure pitch reached. Phase A may fill it from
  // worker partials (see `opts.phaseA`); phases B and C fold into it directly. Every field is a sum, a min,
  // or a max with an explicit tie-break, which is exactly what makes splitting phase A safe.
  const acc = new H2Acc(NZB);

  // Nominal radius, for converting an arc pitch into a theta pitch.
  //
  // IT MUST BOUND THE WHOLE AUDITED BAND. This was 16 thetas at the single height z = H/2. `scan` uses rNom
  // for every cell, so wherever the true radius EXCEEDS it the arc spacing silently exceeds `coveragePitch`
  // — on a pot flaring to 25 mm at the rim with rNom = 15 mm at mid-height, the rim is swept at 1.67x the
  // stated pitch. That breaks phase A's coverage guarantee ("nothing can be starved"), which is the whole
  // foundation of H2's soundness, on any style whose maximum radius is not at mid-height. Sample the audited
  // (theta, z) band instead, densely enough that a narrow tall lobe cannot hide between probes.
  const rNu = opts.rNomNu ?? 128; const rNv = opts.rNomNv ?? 64;
  let rNom = 0;
  for (let i = 0; i < rNu; i += 1) {
    const th = (TAU * i) / rNu;
    for (let j = 0; j <= rNv; j += 1) rNom = Math.max(rNom, rA(th, zLo + ((zHi - zLo) * j) / rNv));
  }
  if (!(rNom > 0)) rNom = 1;

  /**
   * Cheap rA-only structure probe: the largest departure of the true radius from the cell's bilinear corner
   * interpolant, measured on a lattice `structOver` times finer than the query lattice. This is what betrays
   * a ridge, groove or facet edge living strictly between query samples.
   */
  // A FULL structN x structN lattice per cell is unaffordable: phase B visits millions of cells and a
  // 33x33 scan on each turned the smallest style in the roster into an hour-long run. Scan a CROSS of
  // `structLines` rows and `structLines` columns instead — O(2*L*N) instead of O(N^2), ~7x cheaper at the
  // same along-line pitch. A feature that SPANS the cell (which is exactly the feature-spanning-facet case
  // this instrument exists for) must cross a mid-line, so the cheaper probe loses very little of what
  // matters while making the sweep finish.
  // AN AREA LATTICE, NOT A CROSS — same eval count, 3.7x better in the direction that was worst.
  //
  // The cross of `structLines` rows and columns resolves `cell/structN` ALONG a probe line but leaves a gap
  // of `cell/(structLines+1)` BETWEEN lines: 13.3 um vs 106 um at the harness defaults, and the coarser of
  // the two is the real resolving power because a compact or diagonal feature can sit entirely between the
  // lines, raise no bulge, and leave its cell unrefined. The cross was only ever validated along its lines —
  // every fixture in the validation suite plants a full-height vertical ridge, which necessarily crosses
  // every row.
  //
  // Spending the same evaluations on a cell-centred M x M lattice, M = round(sqrt(2*structLines*(structN+1))),
  // gives `cell/M` in BOTH directions: 22x22 = 484 evals against the cross's 490, and 29 um isotropic against
  // 13.3/106 um anisotropic. Cell-centred offsets (a = (i-0.5)/M) put every point of the cell within
  // cell/(2M) of a sample, so the reported pitch is a genuine area guarantee rather than a per-line one.
  const structM = Math.max(2, Math.round(Math.sqrt(2 * structLines * (structN + 1))));

  // ── PHASE A — COVERAGE. Every super-cell is swept in full at pitch0 before any refinement happens, so
  // no part of the surface can be starved by budget spent elsewhere. Cost is fixed and knowable up front.
  //
  // The refinement TRIGGER cannot be "this cell reads above a fraction of tol": these meshes are built to
  // ~5 um everywhere, so such a trigger fires on the entire surface and refinement degenerates into an
  // (unaffordable) uniform sweep at the finest pitch — the second way this routine produced a false PASS by
  // running out of budget. Refinement is therefore WORST-FIRST over an optimistic key.
  //
  // THE CELL KERNEL LIVES IN _h2PhaseA.ts, and phases B and C below call the SAME `h2Scan` / `h2Structure`.
  // That is not tidiness: phase A can be split across worker threads (`opts.phaseA`), and the only way a
  // pooled sweep is guaranteed to compute what the serial one computed is for there to be exactly one
  // definition of what a cell costs and what it contributes. A second copy here would be free to drift.
  const U = 512; const V = 256;
  const geom: H2Geom = { U, V, zLo, zHi, rNom, pitch0, tol, structM, NZB };
  // With the area lattice the two are the same number: the probe is isotropic, so the along-line figure and
  // the area guarantee coincide. `structPitchAlong` is retained so the report can keep printing both without
  // a shape change, and so the historical series stays readable across this switch.
  const uniformStruct = Math.max((TAU * rNom) / U, (zHi - zLo) / V) / structM;
  const uniformAlong = uniformStruct;
  // The optimistic key of every cell, BY CELL INDEX. `bulge` inside the kernel is how far the true surface
  // departs from the cell's corner interpolant, measured on an rA-only lattice far finer than the query
  // lattice — so a ridge living strictly between query samples raises the key even though no query saw it.
  // rA is much cheaper than a locator query, which is what makes this affordable.
  //
  // AN ARRAY INDEXED BY CELL, NOT SIX PARALLEL PUSH-LISTS. The heap below is seeded by walking this in
  // index order, so the seeding order — and hence the heap's layout, and hence which of two equal keys is
  // popped first — is the same whether the sweep ran on one thread or eight. The other five lists were pure
  // functions of (i,j) and are recomputed by `h2CellBounds`, the same function the kernel used.
  const qKey = new Float64Array(U * V);
  const aPart: H2APartial = opts.phaseA !== undefined
    ? opts.phaseA(geom, qKey, opts.onProgress)
    : (() => {
      let claimed = false;
      return runH2PhaseA(rA, distToMesh, geom, qKey,
        () => { if (claimed) return null; claimed = true; return [0, U * V] as const; },
        // Reproduces the previous per-theta-column progress call exactly: cell (i*V + V-1) is the last cell
        // of column i, so frac = (i+1)/U.
        (k, a) => { if ((k + 1) % V === 0) opts.onProgress?.((k + 1) / (U * V), a.queries, a.max); });
    })();
  acc.queries += aPart.queries; acc.rEvalsStruct += aPart.rEvalsStruct; acc.overCount += aPart.overCount;
  for (let b = 0; b < NZB; b += 1) acc.overZHist[b] += aPart.overZHist[b];
  if (aPart.finestStruct < acc.finestStruct) acc.finestStruct = aPart.finestStruct;
  // `argCell < 0` means no cell ever improved on 0, which is the serial routine's own "never set the
  // argmax" state — so the witness stays at the (0,0,0) default rather than naming an arbitrary cell.
  if (aPart.argCell >= 0 && aPart.max > acc.max) {
    acc.max = aPart.max; acc.mTh = aPart.mTh; acc.mZ = aPart.mZ; acc.mR = aPart.mR; acc.mOnWall = false;
  }

  // The phase-B clock starts HERE, not at entry. Sharing one deadline with phase A meant that on any style
  // whose coverage pass ran long, the very first phase-B iteration was already over budget and refinement
  // never ran at all — the run then reported "truncated" while having done zero worst-first work, which
  // reads as a weaker result than it is and hides that the refinement stage was skipped entirely.
  const tPhaseB = Date.now();
  // ── PHASE B — WORST-FIRST REFINEMENT of whatever budget remains. Binary max-heap over the optimistic
  // key; popping stops as soon as the best remaining key cannot beat the witnessed max, which is both the
  // correct termination and a large saving on well-meshed styles.
  const hKey: number[] = []; const hA0: number[] = []; const hA1: number[] = [];
  const hB0: number[] = []; const hB1: number[] = []; const hP: number[] = [];
  // Plain temporaries, not destructuring swaps. Each `[a[i], a[j]] = [a[j], a[i]]` allocates a temporary
  // array, and this runs in the sift of a heap seeded with U*V = 131,072 cells plus four children per
  // refinement — tens of millions of throwaway allocations in the hottest loop of the auditor, competing
  // with `timeBudgetMs` for whether phase B gets to run at all.
  const swap = (i: number, j: number): void => {
    let t = hKey[i]; hKey[i] = hKey[j]; hKey[j] = t;
    t = hA0[i]; hA0[i] = hA0[j]; hA0[j] = t;
    t = hA1[i]; hA1[i] = hA1[j]; hA1[j] = t;
    t = hB0[i]; hB0[i] = hB0[j]; hB0[j] = t;
    t = hB1[i]; hB1[i] = hB1[j]; hB1[j] = t;
    t = hP[i]; hP[i] = hP[j]; hP[j] = t;
  };
  const push = (k: number, a0: number, a1: number, b0: number, b1: number, p: number): void => {
    hKey.push(k); hA0.push(a0); hA1.push(a1); hB0.push(b0); hB1.push(b1); hP.push(p);
    let i = hKey.length - 1;
    while (i > 0) { const par = (i - 1) >> 1; if (hKey[par] >= hKey[i]) break; swap(par, i); i = par; }
  };
  const pop = (): void => {
    const last = hKey.length - 1;
    swap(0, last);
    hKey.pop(); hA0.pop(); hA1.pop(); hB0.pop(); hB1.pop(); hP.pop();
    let i = 0; const n = hKey.length;
    for (;;) {
      const l = 2 * i + 1; const r = l + 1;
      let b = i;
      if (l < n && hKey[l] > hKey[b]) b = l;
      if (r < n && hKey[r] > hKey[b]) b = r;
      if (b === i) break;
      swap(b, i); i = b;
    }
  };
  // SEEDED IN CELL-INDEX ORDER, which is the order the serial sweep pushed them in. The heap's array layout
  // — and therefore which of two EQUAL keys is popped first — is a function of insertion order, so this loop
  // is the reason a pooled phase A cannot change the refinement sequence.
  for (let i = 0; i < qKey.length; i += 1) {
    const c = h2CellBounds(geom, i);
    push(qKey[i], c.a0, c.a1, c.b0, c.b1, pitch0);
  }
  while (hKey.length > 0) {
    if (acc.queries > budget || Date.now() - tPhaseB > timeBudgetMs) { capped = true; break; }
    const key = hKey[0]; const a0 = hA0[0]; const a1 = hA1[0];
    const b0 = hB0[0]; const b1 = hB1[0]; const pitch = hP[0];
    pop();
    if (key <= acc.max) break;                   // nothing left that could beat what we already witnessed
    if (pitch <= minPitch) { if (key > tol) hotLeaves += 1; continue; }
    const am = 0.5 * (a0 + a1); const bm = 0.5 * (b0 + b1);
    const p = Math.max(minPitch, pitch / 4);
    for (const [c0, c1, d0, d1] of [[a0, am, b0, bm], [am, a1, b0, bm], [a0, am, bm, b1], [am, a1, bm, b1]] as [number, number, number, number][]) {
      const s = h2Scan(acc, rA, distToMesh, geom, c0, c1, d0, d1, p);
      push(s.m + h2Structure(acc, rA, geom, c0, c1, d0, d1), c0, c1, d0, d1, p);
    }
  }
  // ── PHASE C — THE CLOSURE. The graph r = rA(th,z) is not the printed boundary: at a C0 z-step the solid
  // carries a vertical TREAD WALL and at a theta-jump a CURTAIN, spanning every radius between the one-sided
  // limits. Phases A and B sample only the graph, so no query ever lands on a wall — while H1 simultaneously
  // FORGIVES mesh points that lie on one (via distToZWall / distToThetaWall). A mesher that omits a tread
  // wall, or builds it at the wrong radius, is therefore invisible to BOTH directions at once, on exactly
  // the styles the closure exists for (ArtDeco, BasketWeave, DragonScales, BambooSegments, CelticKnot).
  // Sweeping the wall surfaces at the coverage pitch closes that shared blind spot.
  const wallN = opts.wallN ?? 24;
  const eW = 1e-7;
  const wallQuery = (x: number, y: number, z: number, th: number, r: number): void => {
    acc.queries += 1;
    const d = distToMesh(x, y, z);
    if (d > tol) {
      acc.overCount += 1;
      const b = Math.min(NZB - 1, Math.max(0, Math.floor(((z - zLo) / Math.max(1e-9, zHi - zLo)) * NZB)));
      acc.overZHist[b] += 1;
    }
    if (d > acc.max) { acc.max = d; acc.mTh = th; acc.mZ = z; acc.mR = r; acc.mOnWall = true; }
  };
  const nThStations = Math.max(8, Math.ceil((TAU * rNom) / pitch0));
  const nZStations = Math.max(8, Math.ceil((zHi - zLo) / pitch0));
  for (const zj of opts.zJumps ?? []) {
    if (zj < zLo || zj > zHi) continue;
    for (let i = 0; i < nThStations; i += 1) {
      const th = (TAU * i) / nThStations;
      const a = rA(th, Math.min(H, zj + eW)); const b = rA(th, Math.max(0, zj - eW));
      const lo = Math.min(a, b); const hi = Math.max(a, b);
      if (!(hi - lo > 0)) continue;
      for (let k = 0; k <= wallN; k += 1) {
        const r = lo + ((hi - lo) * k) / wallN;
        wallQuery(r * Math.cos(th), r * Math.sin(th), zj, th, r);
      }
    }
  }
  for (const tj of opts.thJumps ?? []) {
    for (let i = 0; i <= nZStations; i += 1) {
      const z = zLo + ((zHi - zLo) * i) / nZStations;
      const a = rA(tj + eW, z); const b = rA(tj - eW, z);
      const lo = Math.min(a, b); const hi = Math.max(a, b);
      if (!(hi - lo > 0)) continue;
      for (let k = 0; k <= wallN; k += 1) {
        const r = lo + ((hi - lo) * k) / wallN;
        wallQuery(r * Math.cos(tj), r * Math.sin(tj), z, tj, r);
      }
    }
  }

  return {
    max: acc.max, th: acc.mTh, z: acc.mZ, r: acc.mR, onWall: acc.mOnWall,
    queries: acc.queries, rEvalsStruct: acc.rEvalsStruct, capped,
    structPitch: Number.isFinite(acc.finestStruct) ? acc.finestStruct : pitch0 / structN,
    structPitchUniform: uniformStruct,
    structPitchAlong: uniformAlong,
    overCount: acc.overCount, overZHist: acc.overZHist, zLo, zHi,
    secs: (Date.now() - tStart) / 1000,
    hotLeaves,
  };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// TRUE PERPENDICULAR DISTANCE — solved, not approximated
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `distRadial` is the RADIAL gap, which equals the perpendicular distance divided by cos(tilt). It
// over-states, and it over-states most on steep geometry — exactly where every failure in this campaign
// lives. `distLocal` only narrows it by coordinate descent, and only fires once a sample already reads
// above tol/4, so anything under ~2.5 um was being reported radially and the certified bound was built from
// inflated values. Neither routine ever CHECKED that the foot it returned was perpendicular to anything.
//
// The closest point on S satisfies orthogonality against both tangents:
//        F(th,z) = [ (p - P)·P_th , (p - P)·P_z ] = 0
// with  P(th,z) = (r cos th, r sin th, z),  r = rA(th,z)
//        P_th   = (r_th cos th - r sin th,  r_th sin th + r cos th,  0)
//        P_z    = (r_z cos th,  r_z sin th,  1)
// Newton on that 2x2 system converges quadratically. It needs only rA and finite differences of it — no
// per-style knowledge, no feature detector, no envelope. That is what makes it shape-agnostic.
//
// SELF-VERIFYING. `ortho` is returned with every measurement: the residual of the orthogonality conditions,
// normalised by |p-P| and the tangent lengths, i.e. the sine of the angle by which the foot deviates from
// perpendicular. A caller can assert on it. Nothing in the previous ruler could tell you whether its answer
// was perpendicular at all.
export interface PerpResult { d: number; th: number; z: number; ortho: number; iters: number; converged: boolean }

/** Surface point and its two tangents at (th,z), with r derivatives by central difference. */
function frame(rA: RadiusFn, H: number, th: number, z: number, hTh: number, hZ: number): {
  P: [number, number, number]; Pth: [number, number, number]; Pz: [number, number, number];
} {
  const zc = z < 0 ? 0 : z > H ? H : z;
  const r = rA(th, zc);
  const rTh = (rA(th + hTh, zc) - rA(th - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(th, zp) - rA(th, zm)) / (zp - zm) : 0;
  const c = Math.cos(th); const s = Math.sin(th);
  return {
    P: [r * c, r * s, zc],
    Pth: [rTh * c - r * s, rTh * s + r * c, 0],
    Pz: [rZ * c, rZ * s, 1],
  };
}

/**
 * True perpendicular distance from p to the radial surface, by damped Newton on the orthogonality
 * conditions, started from the supplied seed. Returns the residual so the caller can verify the foot.
 */
export function distPerpFrom(
  rA: RadiusFn, H: number, px: number, py: number, pz: number,
  seedTh: number, seedZ: number, maxIter = 40,
): PerpResult {
  const rNom = Math.max(1e-6, Math.hypot(px, py));
  const hTh = 1e-5 / rNom;      // ~10 nm of arc — well inside f64, well outside FD noise
  const hZ = 1e-5;
  let th = seedTh; let z = Math.min(H, Math.max(0, seedZ));
  let best = Infinity; let bTh = th; let bZ = z;
  let it = 0; let converged = false;
  for (; it < maxIter; it += 1) {
    const f = frame(rA, H, th, z, hTh, hZ);
    const dx = px - f.P[0]; const dy = py - f.P[1]; const dz = pz - f.P[2];
    const d = Math.hypot(dx, dy, dz);
    if (d < best) { best = d; bTh = th; bZ = z; }
    const F1 = dx * f.Pth[0] + dy * f.Pth[1] + dz * f.Pth[2];
    const F2 = dx * f.Pz[0] + dy * f.Pz[1] + dz * f.Pz[2];
    // numerical 2x2 Jacobian of F — cheaper and far more robust than analytic second derivatives on the
    // hashed / piecewise style functions in this registry
    const e = 1e-6;
    // ONE-SIDED AT THE TOP BOUNDARY. `Math.min(H, z + e)` clamps to H when z === H, so the perturbed frame
    // equalled the base frame: j12 = j22 = 0, det = 0, and the routine broke out on its FIRST iteration and
    // returned the unpolished seed. Every query whose closest approach sits at the rim therefore kept its
    // inflated radial/descent reading — a systematic over-statement on exactly the band the campaign keeps
    // re-flagging as a rim artifact. Step inward instead, as `frame` already does for rZ.
    const ez = z + e <= H ? e : -e;
    const fa = frame(rA, H, th + e / rNom, z, hTh, hZ);
    const fb = frame(rA, H, th, z + ez, hTh, hZ);
    const Fof = (fr: ReturnType<typeof frame>): [number, number] => {
      const ax = px - fr.P[0]; const ay = py - fr.P[1]; const az = pz - fr.P[2];
      return [ax * fr.Pth[0] + ay * fr.Pth[1] + az * fr.Pth[2], ax * fr.Pz[0] + ay * fr.Pz[1] + az * fr.Pz[2]];
    };
    const [F1a, F2a] = Fof(fa); const [F1b, F2b] = Fof(fb);
    const j11 = (F1a - F1) / (e / rNom); const j12 = (F1b - F1) / ez;
    const j21 = (F2a - F2) / (e / rNom); const j22 = (F2b - F2) / ez;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-30) break;
    let dTh = -(j22 * F1 - j12 * F2) / det;
    let dZ = -(-j21 * F1 + j11 * F2) / det;
    // damp: never move more than a tenth of a radian of arc / mm per step, so a bad Jacobian on a kinked
    // style cannot fling the iterate across the pot
    const cap = 0.1;
    const mag = Math.max(Math.abs(dTh) * rNom, Math.abs(dZ));
    if (mag > cap) { const k = cap / mag; dTh *= k; dZ *= k; }
    th += dTh; z = Math.min(H, Math.max(0, z + dZ));
    if (Math.max(Math.abs(dTh) * rNom, Math.abs(dZ)) < 1e-11) { converged = true; it += 1; break; }
  }
  const f = frame(rA, H, bTh, bZ, hTh, hZ);
  const dx = px - f.P[0]; const dy = py - f.P[1]; const dz = pz - f.P[2];
  const d = Math.hypot(dx, dy, dz);
  const lTh = Math.hypot(f.Pth[0], f.Pth[1], f.Pth[2]);
  const lZ = Math.hypot(f.Pz[0], f.Pz[1], f.Pz[2]);
  const ortho = d < 1e-12 ? 0 : Math.max(
    Math.abs(dx * f.Pth[0] + dy * f.Pth[1] + dz * f.Pth[2]) / (d * Math.max(lTh, 1e-12)),
    Math.abs(dx * f.Pz[0] + dy * f.Pz[1] + dz * f.Pz[2]) / (d * Math.max(lZ, 1e-12)),
  );
  return { d, th: bTh, z: bZ, ortho, iters: it, converged };
}

/**
 * THE SEEDING GRID, MEMOISED. `distPerp`'s coarse sweep evaluates rA on a FIXED (theta, z) lattice —
 * th = TAU*i/nu, z = H*j/nv — and NONE of those arguments depend on the query point. Every call was
 * therefore rebuilding the same nu x (nv+1) table of surface points from scratch: 180 x 121 = 21,780
 * rA evaluations per call, ~99% of the function's cost, all of them identical to the previous call's.
 *
 * Cached per (rA identity, H, nu, nv). BIT-IDENTICAL BY CONSTRUCTION, not by test: the same rA is
 * evaluated at the same arguments and the stored double is the one the loop would have computed. The
 * only observable difference is the rA EVAL COUNT, which falls — that is the point, and it is called
 * out here so a lower "M rA evals" in a report is read as this cache and not as a behaviour change.
 *
 * WeakMap on the rA closure so a pooled run's per-worker surfaces do not collide and nothing is
 * retained after a worker's surface is dropped. ~870 kB per (H, nu, nv) at the default.
 *
 * *** AND THIS IS WHAT MAKES STANDING DEFECT #3 AFFORDABLE. *** The default nu=180, nv=120 was
 * MEASURED over-stating by 30.902 um (26%) at tri 690730 — the seed lands in the wrong basin and the
 * descent converges to a local foot, so the reading is an over-estimate. The fix has always been a
 * denser grid and the reason it was never taken is that density multiplied the per-call cost. With
 * the table built once, 360 x 240 costs the same per CALL as 180 x 120 did, and only the one-time
 * build is 4x. Raising the default is a separate, measured decision — this change does not take it,
 * so every existing number reproduces exactly.
 */
export interface PerpSeedGrid { x: Float64Array; y: Float64Array; z: Float64Array; th: Float64Array }
const perpSeedCache = new WeakMap<RadiusFn, Map<string, PerpSeedGrid>>();
/** EXPORTED for the equivalence bar (s45PerpCacheEquiv) only — `distPerp` is the supported entry point. */
export function perpSeedGrid(rA: RadiusFn, H: number, nu: number, nv: number): PerpSeedGrid {
  let byShape = perpSeedCache.get(rA);
  if (byShape === undefined) { byShape = new Map<string, PerpSeedGrid>(); perpSeedCache.set(rA, byShape); }
  const key = `${H}|${nu}|${nv}`;
  const hit = byShape.get(key);
  if (hit !== undefined) return hit;
  const TAU = 2 * Math.PI;
  const n = nu * (nv + 1);
  const g: PerpSeedGrid = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n), th: new Float64Array(n) };
  let k = 0;
  for (let i = 0; i < nu; i += 1) {
    const th = (TAU * i) / nu; const ct = Math.cos(th); const st = Math.sin(th);
    for (let j = 0; j <= nv; j += 1) {
      const z = (H * j) / nv;
      const r = rA(th, z);
      g.x[k] = r * ct; g.y[k] = r * st; g.z[k] = z; g.th[k] = th; k += 1;
    }
  }
  byShape.set(key, g);
  return g;
}

/**
 * Perpendicular distance with global seeding: coarse sweep, then Newton from the best few seeds plus the
 * radial foot, plus any detected discontinuity walls. Returns the best (smallest) result, which is the one
 * that is genuinely perpendicular; every candidate is an upper bound, so taking the min is always correct.
 */
export function distPerp(
  rA: RadiusFn, H: number, px: number, py: number, pz: number,
  opts: { nu?: number; nv?: number; zJumps?: number[]; thJumps?: number[] } = {},
): PerpResult {
  const nu = opts.nu ?? 180; const nv = opts.nv ?? 120;
  const seeds: [number, number][] = [[Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz]];
  let b1 = Infinity; let b2 = Infinity; let s1: [number, number] = seeds[0]; let s2: [number, number] = seeds[0];
  // Same traversal order as the original nested loop (i outer, j inner), so the `<` / `else if` tie-break
  // between two equidistant seeds picks the same pair it always did.
  const g = perpSeedGrid(rA, H, nu, nv);
  for (let k = 0; k < g.x.length; k += 1) {
    const dx = px - g.x[k]; const dy = py - g.y[k]; const dz = pz - g.z[k];
    const v = dx * dx + dy * dy + dz * dz;
    if (v < b1) { b2 = b1; s2 = s1; b1 = v; s1 = [g.th[k], g.z[k]]; } else if (v < b2) { b2 = v; s2 = [g.th[k], g.z[k]]; }
  }
  seeds.push(s1, s2);
  // the descent's answer is a further seed: it is globally better behaved than Newton and costs little
  const dl = distLocal(rA, H, px, py, pz, seeds[0][0], seeds[0][1], Math.max(1, Math.hypot(px, py) * 0.05), 40, opts.zJumps ?? [], opts.thJumps ?? []);
  seeds.push([dl.th, dl.z]);
  let best: PerpResult = { d: Infinity, th: 0, z: 0, ortho: 1, iters: 0, converged: false };
  for (const [sth, sz] of seeds) {
    const r = distPerpFrom(rA, H, px, py, pz, sth, sz);
    if (r.d < best.d) best = r;
  }
  // discontinuity walls are part of the printed boundary; they are flat, so their distance is exact
  for (const zj of opts.zJumps ?? []) {
    const dw = distToZWall(rA, zj, px, py, pz);
    if (dw < best.d) best = { d: dw, th: Math.atan2(py, px), z: zj, ortho: 0, iters: 0, converged: true };
  }
  return best;
}

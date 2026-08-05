// research/bridge/orientRuler.ts — THE ORIENTATION RULER. RESEARCH ONLY.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Every ruler in this pipeline measures a DISTANCE: `sagAdaptive`, `edgeSagRaw`, `sagOfNRaw`, `distRadial`,
// `distPerp`, `certifyTriangle`, H1, H2. S53–S58 measured what that leaves unscored, on three styles:
//
//     style          facets      position p99 / over-10um     ORIENTATION p99 / over-10um
//     Voronoi       806,765       4.90 um /       0 (0.000%)   1222.82 um / 106,751 (39.696%)
//     LowPolyFacet  137,480       4.95 um /       0 (0.000%)     28.48 um /  14,968 (10.887%)
//     GothicArches 1,142,166      3.42 um /      17 (0.006%)     36.05 um /  32,468 (11.371%)
//
// On two of three styles the driver's own ruler reports LITERALLY ZERO facets over the bar while the
// orientation error is over it on 10.9% and 39.7% of them. The class is universal and no instrument in this
// repo scores it. This file is that instrument.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IT MEASURES, AND WHICH SIDE IT IS SOUND ON — STATED FIRST, BECAUSE THAT IS THE WHOLE CONTRACT
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// For a facet T with a constant unit normal `f`, the quantity is
//
//        theta*(T)  =  sup over p in footprint(T) of  angle( f , n_S(p) )            [radians]
//
// where `n_S` is the analytic surface normal and footprint(T) is T's triangle in the (theta, z) parameter
// plane. Two numbers are returned and they bracket it:
//
//   * `normRad`  = max over an order-k barycentric COVERING of the footprint.  A LOWER bound on theta*.
//                  SOUND FOR REFUSALS: `normRad > bar` ⇒ theta* > bar ⇒ the facet is genuinely over.
//                  NOT sound for accepts.
//   * `bound`    = normRad + kappa * cov.  An UPPER bound on theta*, WHEN a valid `kappa` is supplied.
//                  SOUND FOR ACCEPTS: `bound <= bar` ⇒ theta* <= bar.
//                  `kappa` is the Lipschitz constant of the Gauss map with respect to the parameter
//                  distance used by `cov` (see below). It is UNDEFINED at a C0 crease, where the Gauss map
//                  is not Lipschitz at all — so on crease styles there is NO accept-side certificate from
//                  this route, and the honest verdict for a crease-straddling facet is UNDECIDED-or-FAIL,
//                  never ACCEPT. That is stated as a structural fact, not worked around.
//
// This is deliberately the OPPOSITE assignment to the one that sank PF_CB_CERTACCEPT on 2026-08-04, where a
// one-sided bound was allowed to drive the FAILS. Here the one-sided witness drives the FAILS (which is the
// direction it is sound in) and the covering bound drives the ACCEPTS (likewise).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// `cov` IS EXACT, NOT SLACK — AND IT IS MEASURED IN THE METRIC kappa IS DEFINED IN
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The order-k barycentric lattice {(i,j,k-i-j)/k} maps AFFINELY onto the footprint, so it is a regular
// lattice of triangles each SIMILAR to the footprint at scale 1/k. The covering radius of such a lattice is
// therefore exactly rho(T)/k, where rho(T) is the farthest-interior-point radius of T:
//
//        rho(T) = circumradius(T)          if T is acute or right
//               = half the longest edge    if T is obtuse   (the circumcentre leaves the triangle)
//
// The parameter plane is taken with coordinates (rRef * theta, z) — arclength on the base cylinder — so that
// `cov` is a LENGTH in mm and `kappa` is a curvature in 1/mm, i.e. the two factors of `kappa * cov` are in
// the units the product needs. `rRef` defaults to the facet's mean radius.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// FOUR DEFECTS IN THE S55 PROTOTYPE THAT THIS FILE IS DESIGNED NOT TO HAVE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
//  (1) ONE SAMPLE AT THE CENTROID. `s55OrientHeatmap.ts:89` evaluates the surface normal only at the facet
//      centroid. On the exact-cylinder fixture the true sup is Delta/2 and the centroid reads Delta/6 — an
//      ANALYTIC 3.00x under-read, not a statistical one. Here k is a parameter and the order-k lattice
//      always contains the three VERTICES, which is where the sup sits whenever the normal field is
//      monotone across the footprint (every developable/ruled patch, i.e. most of a pot wall).
//  (2) `sin(acos(dot))` IS NOT MONOTONE IN THE ANGLE. It equals sqrt(1 - dot^2), symmetric about 90 deg, so
//      an INVERTED facet (normal 175 deg off) scores the same as a 5-deg-off one: the worst possible
//      orientation defect reads as one of the best. A ruler used as a GUARD must be monotone on [0, pi].
//      Here the primary quantity is the ANGLE itself and the mm form is 2*sin(angle/2)*diam (the Gauss-map
//      chord), which is strictly increasing on [0, pi]. `legacyTangMm` reproduces the s55 expression
//      verbatim FOR CONTINUITY WITH S53–S58 ONLY, and must not be used as a bar.
//  (3) A CENTRAL FINITE DIFFERENCE ACROSS A C0 CREASE RETURNS THE AVERAGE OF THE TWO ONE-SIDED NORMALS —
//      exactly the wrong answer at the one place the whole defect lives (S58: LowPolyFacet is piecewise
//      FLAT, zero curvature, and still 10.9% over the bar; the mechanism is crease STRADDLE). `fdNormals`
//      therefore spends the SAME FIVE rA evaluations as a central difference and forms the FOUR one-sided
//      combinations (fwd/bwd in theta) x (fwd/bwd in z), returning all of them; the caller takes the WORST
//      angle. At a kink the two sides disagree and the ruler sees it; on a smooth patch all four agree to
//      O(h) and it costs nothing. Zero extra evals, strictly more information.
//  (4) `r_z` SILENTLY BECOMES ONE-SIDED AT z=0 AND z=H in the prototype (it clamps zp/zm, halving the step
//      and changing the ruler on the rim rows). Here the h-window is SHIFTED inward instead, so the step is
//      always exactly 2h and one ruler runs everywhere.
//
// THE NORMAL FORMULA. For the radial surface P(theta,z) = (r cos th, r sin th, z),
//      dP/dth x dP/dz = ( r_th sin th + r cos th ,  -r_th cos th + r sin th ,  -r * r_z )
// which points OUTWARD. Derived independently here and checked against `s55OrientHeatmap.ts:97` (agrees).
//
// EVERYTHING HERE IS PURE — no mesh, no globals, no I/O — so `_orientRulerValidate.test.ts` can pin it on
// closed-form fixtures, and every fixture bar is TWO-SIDED so that a truncated or collapsed implementation
// cannot satisfy it. (The 2026-08-05 scar: a hard gate asserted only `perp <= radial`, which a degenerate
// `perp == radial` satisfies while destroying the ruler.)

const TWO_PI = 2 * Math.PI;

/** A radius function r(theta, z) in mm. */
export type RadiusFn = (th: number, z: number) => number;

/**
 * Writes up to `maxCands` candidate unit surface normals at (theta, z) into `out` (3 floats each) and
 * returns how many were written. A smooth/exact sampler writes 1; the kink-aware finite-difference
 * sampler writes up to 4 (the one-sided combinations).
 */
export type NormalSampler = (th: number, z: number, out: Float64Array) => number;

/** Unit normal of a radial surface from (r, r_th, r_z) at theta. Writes 3 floats at `out[o]`. */
export function radialNormal(r: number, rTh: number, rZ: number, th: number, out: Float64Array, o: number): void {
  const c = Math.cos(th); const s = Math.sin(th);
  let nx = rTh * s + r * c;
  let ny = r * s - rTh * c;
  let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz);
  if (L > 0) { nx /= L; ny /= L; nz /= L; } else { nx = c; ny = s; nz = 0; }
  out[o] = nx; out[o + 1] = ny; out[o + 2] = nz;
}

/**
 * The EXACT sampler, for fixtures and for any surface whose derivatives are known in closed form.
 * Always writes exactly one candidate.
 */
export function exactNormals(
  r: RadiusFn, rTh: RadiusFn, rZ: RadiusFn,
): NormalSampler {
  return (th: number, z: number, out: Float64Array): number => {
    radialNormal(r(th, z), rTh(th, z), rZ(th, z), th, out, 0);
    return 1;
  };
}

/**
 * THE KINK-AWARE FINITE-DIFFERENCE SAMPLER — five rA evaluations, four candidate normals.
 *
 * `hArc` is the theta step expressed as an ARC LENGTH in mm (so one constant behaves the same at every
 * radius); `hZ` is the z step in mm. The z window is shifted inward at the domain ends so the step is
 * always exactly 2*hZ (defect (4) above).
 *
 * Returns 4 candidates on a kink and 4 numerically-equal ones on a smooth patch. `dedup` collapses them
 * when they agree to `dedupTol` so the caller's inner loop stays short on smooth meshes.
 */
export function fdNormals(
  rA: RadiusFn, H: number, hArc = 2e-4, hZ = 2e-4, dedupTol = 1e-12,
): NormalSampler {
  return (th: number, z: number, out: Float64Array): number => {
    const r0 = rA(th, z);
    const hTh = hArc / Math.max(1e-9, Math.abs(r0));
    const rP = rA(th + hTh, z); const rM = rA(th - hTh, z);
    let zLo = z - hZ; let zHi = z + hZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * hZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * hZ); }
    const rZp = rA(th, zHi); const rZm = rA(th, zLo);
    const dz = zHi - zLo;
    const rzF = dz > 0 ? (rZp - r0) / Math.max(1e-300, zHi - z) : 0;
    const rzB = dz > 0 ? (r0 - rZm) / Math.max(1e-300, z - zLo) : 0;
    const rtF = (rP - r0) / hTh;
    const rtB = (r0 - rM) / hTh;
    // four one-sided combinations; on a smooth patch they coincide to O(h)
    let n = 0;
    const cands = [[rtF, rzF], [rtF, rzB], [rtB, rzF], [rtB, rzB]];
    for (const [rt, rz] of cands) {
      radialNormal(r0, rt, rz, th, out, 3 * n);
      let dup = false;
      for (let j = 0; j < n; j += 1) {
        const d = 1 - (out[3 * n] * out[3 * j] + out[3 * n + 1] * out[3 * j + 1] + out[3 * n + 2] * out[3 * j + 2]);
        if (d <= dedupTol) { dup = true; break; }
      }
      if (!dup) n += 1;
    }
    return n === 0 ? 1 : n;
  };
}

/** The CENTRAL-difference sampler, i.e. the s55 prototype's normal, kept ONLY so a fixture can fail it. */
export function fdNormalsCentral(rA: RadiusFn, H: number, hArc = 2e-4, hZ = 2e-4): NormalSampler {
  return (th: number, z: number, out: Float64Array): number => {
    const r0 = rA(th, z);
    const hTh = hArc / Math.max(1e-9, Math.abs(r0));
    const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
    let zLo = z - hZ; let zHi = z + hZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * hZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * hZ); }
    const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
    radialNormal(r0, rt, rz, th, out, 0);
    return 1;
  };
}

/**
 * rho(T) — the farthest-interior-point radius of a planar triangle: the circumradius when the triangle is
 * acute or right, half the longest edge when it is obtuse (the circumcentre then lies outside T and the
 * farthest interior point is the midpoint of the longest edge). EXACT; this is not a bound.
 */
export function farRadius(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): number {
  const a = Math.hypot(bx - cx, by - cy);
  const b = Math.hypot(ax - cx, ay - cy);
  const c = Math.hypot(ax - bx, ay - by);
  const L = Math.max(a, b, c);
  const area2 = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  if (!(area2 > 0)) return 0.5 * L;
  // obtuse at the vertex opposite the longest edge  <=>  L^2 > (sum of the other two squares)
  const s = a * a + b * b + c * c - 2 * L * L;      // = (other two squares) - L^2
  if (s < 0) return 0.5 * L;
  return (a * b * c) / (2 * area2);                 // circumradius
}

export interface OrientOpts {
  /** barycentric lattice order; the lattice has (k+1)(k+2)/2 points and always contains the 3 vertices. */
  k?: number;
  /** 'winding' (default, HONEST — an inverted facet reads ~180 deg) or 'outward' (flip toward +r). */
  orient?: 'winding' | 'outward';
  /** Lipschitz constant of the Gauss map w.r.t. the (rRef*theta, z) parameter metric, 1/mm. */
  kappa?: number;
  /** reference radius used to turn theta into an arc length; default = mean vertex radius. */
  rRef?: number;
  /**
   * SHRINK the lattice toward the centroid by this fraction (0 = off, the default).
   *
   * WHY IT EXISTS — measured on fixture F4b. A finite-difference normal sampler evaluated EXACTLY ON a C0
   * crease returns the average of the two one-sided normals (central) or both of them (kink-aware), and a
   * CONFORMED mesh puts its vertices exactly on the crease ON PURPOSE. So a facet lying perfectly flat in
   * one face, with one vertex on the crease, false-alarms at half the dihedral (central) or the full
   * dihedral (kink-aware) — the conforming mesher's best work scored as its worst. Insetting by more than
   * the finite-difference step over the facet's min altitude removes it. Costs a bounded under-read of the
   * corner value, which `cov` is inflated to pay for, so the ACCEPT-side bound stays sound.
   */
  inset?: number;
  /** bar (radians) for `overFrac`; default 5 deg. */
  barRad?: number;
  /** scratch buffer for candidate normals (>= 12 floats); supply one to avoid per-facet allocation. */
  scratch?: Float64Array;
}

export interface OrientOut {
  /** WITNESSED sup of angle(f, n_S) over the lattice, radians. A LOWER bound on the true sup. */
  normRad: number;
  normDeg: number;
  /** 2*sin(normRad/2) * diam, mm — the Gauss-map chord form. STRICTLY INCREASING on [0, pi]. */
  tangMm: number;
  /** sin(normRad) * diam, mm — the S55/S58 expression VERBATIM. NON-MONOTONE. Continuity only. */
  legacyTangMm: number;
  /** exact covering radius of the lattice in the (rRef*theta, z) plane, mm. */
  cov: number;
  /** normRad + kappa*cov when `kappa` was supplied, else NaN. An UPPER bound on the true sup. */
  bound: number;
  /** parameter point where the witness was attained. */
  argTh: number;
  argZ: number;
  /** longest edge of the facet, mm. */
  diam: number;
  /** lattice points visited (rA cost = 5x this for the finite-difference samplers). */
  samples: number;
  /**
   * MAX SPREAD of the candidate normals AT A SINGLE lattice point, radians — i.e. how much the surface's
   * own normal cone opens up somewhere inside this facet. Zero for a smooth patch and for any 1-candidate
   * sampler; equal to the DIHEDRAL for a facet whose footprint contains a C0 crease. This is a CREASE
   * DETECTOR that costs nothing extra, and it is the quantity a placement rule wants: it says "there is a
   * kink in here", independently of whether the facet happens to be aligned with it.
   *
   * ⚠ MEASURED LIMITATION (S70 smoke, LowPolyFacet 137,480 facets): this reads LITERALLY ZERO on a mesh
   * whose orientation p99 is 20 deg, because it only fires when a lattice point lands within `hArc` of the
   * kink — a set of measure ~h. It is an h-DEPENDENT detector and it is NOT the one to use on a real mesh.
   * `spreadRad` below is. Kept because it is exact when it does fire (F4 recovers the dihedral to 1.5e-5).
   */
  kinkRad: number;
  /**
   * NORMAL-FIELD SPREAD over the whole footprint, radians, `2*acos(|mean(n_i)|)` — h-FREE and scale-free.
   *
   * EXACTLY the dihedral for a footprint split 50/50 by a C0 crease; ~0.577*a for a normal field sweeping
   * smoothly through an angle `a`; 0 on a flat patch. This is the quantity that separates the two ways a
   * facet can be wrong — the surface TURNS inside it (spread large: no facet plane can fit, must SPLIT or
   * ALIGN) versus the facet is simply MIS-ORIENTED against a normal field that barely moves (spread small
   * but `normRad` large: a flip or a re-placement fixes it at zero triangle cost). A guard cannot choose
   * its remedy without it. Costs three accumulators and one `acos` per facet.
   */
  spreadRad: number;
  /**
   * MEAN angle over the covering, radians, and the FRACTION of the covering over `barRad`.
   *
   * ⚠ THESE EXIST BECAUSE THE SUP ALONE MISLEADS, AND THE MISLEADING IS NOT SMALL (S71). The sup is
   * attained if ANY point of the footprint is over the bar, so a facet lying 99.99% inside one flat face
   * and clipping a hair of the next one reads the FULL dihedral — identical to a facet that is wrong
   * everywhere. That is why even a PERFECT two-cut at the located crossings could not get a single
   * LowPolyFacet child under 1 deg: the target is measure-zero and any epsilon of misplacement restores
   * the sup. `overFrac` says how much of the facet the sup speaks for, and it is the difference between
   * "this facet is 20 deg wrong" and "this facet is 20 deg wrong on 0.4% of its area".
   *
   * The sup remains the SOUND quantity and is not replaced. These are reported ALONGSIDE it so that a
   * verdict can distinguish a defect from a boundary.
   */
  meanRad: number;
  overFrac: number;
}

/**
 * THE RULER. `ath/bth/cth` must be UNWRAPPED theta (same branch) — use `dThRaw` to unwrap before calling,
 * exactly as the campaign's other whole-mesh probes do.
 */
export function orientOfFacet(
  ns: NormalSampler,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  ath: number, bth: number, cth: number,
  opts: OrientOpts = {},
): OrientOut {
  const k = Math.max(1, Math.round(opts.k ?? 8));
  const scratch = opts.scratch ?? new Float64Array(12);
  // facet normal — WINDING by default
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const diam = Math.max(
    Math.hypot(bx - cx, by - cy, bz - cz),
    Math.hypot(ax - cx, ay - cy, az - cz),
    Math.hypot(ax - bx, ay - by, az - bz),
  );
  if (!(fl > 0)) {
    return {
      normRad: NaN, normDeg: NaN, tangMm: NaN, legacyTangMm: NaN, cov: 0, bound: NaN,
      argTh: ath, argZ: az, diam, samples: 0, kinkRad: NaN, spreadRad: NaN, meanRad: NaN, overFrac: NaN,
    };
  }
  fx /= fl; fy /= fl; fz /= fl;
  if (opts.orient === 'outward') {
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  }
  const rRef = opts.rRef ?? (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  // exact covering radius of the order-k lattice in the (rRef*theta, z) parameter plane, PLUS the corner
  // strip the inset leaves uncovered (bounded by inset * max centroid->vertex distance).
  const inset = Math.max(0, Math.min(0.5, opts.inset ?? 0));
  const pth = [rRef * ath, rRef * bth, rRef * cth]; const pz = [az, bz, cz];
  const gth = (pth[0] + pth[1] + pth[2]) / 3; const gz = (pz[0] + pz[1] + pz[2]) / 3;
  let rVert = 0;
  for (let i = 0; i < 3; i += 1) rVert = Math.max(rVert, Math.hypot(pth[i] - gth, pz[i] - gz));
  const cov = farRadius(pth[0], pz[0], pth[1], pz[1], pth[2], pz[2]) / k + inset * rVert;

  let best = -1; let bestTh = ath; let bestZ = az; let samples = 0; let kink = 0;
  let sx = 0; let sy = 0; let sz = 0; let nAcc = 0;
  const barRad = opts.barRad ?? (5 * Math.PI) / 180;
  let angSum = 0; let overN = 0;
  const sh = 1 - inset; const sc = inset / 3;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = ns(th, z, scratch);
      samples += 1;
      for (let q = 0; q < nc; q += 1) {
        sx += scratch[3 * q]; sy += scratch[3 * q + 1]; sz += scratch[3 * q + 2]; nAcc += 1;
        let d = fx * scratch[3 * q] + fy * scratch[3 * q + 1] + fz * scratch[3 * q + 2];
        d = d > 1 ? 1 : d < -1 ? -1 : d;
        const ang = Math.acos(d);
        angSum += ang; if (ang > barRad) overN += 1;
        if (ang > best) { best = ang; bestTh = th; bestZ = z; }
        for (let p = 0; p < q; p += 1) {
          let dq = scratch[3 * q] * scratch[3 * p] + scratch[3 * q + 1] * scratch[3 * p + 1] + scratch[3 * q + 2] * scratch[3 * p + 2];
          dq = dq > 1 ? 1 : dq < -1 ? -1 : dq;
          const sp = Math.acos(dq);
          if (sp > kink) kink = sp;
        }
      }
    }
  }
  const kappa = opts.kappa;
  return {
    normRad: best,
    normDeg: (best * 180) / Math.PI,
    tangMm: 2 * Math.sin(best / 2) * diam,
    legacyTangMm: Math.sin(best) * diam,
    cov,
    bound: kappa === undefined ? NaN : best + kappa * cov,
    argTh: bestTh,
    argZ: bestZ,
    diam,
    samples,
    kinkRad: kink,
    spreadRad: 2 * Math.acos(Math.min(1, nAcc > 0 ? Math.hypot(sx, sy, sz) / nAcc : 1)),
    meanRad: nAcc > 0 ? angSum / nAcc : 0,
    overFrac: nAcc > 0 ? overN / nAcc : 0,
  };
}

/**
 * LOCATE THE TURN ON AN EDGE — a style-agnostic, analytic crease locator, ~`iters` normal evaluations.
 *
 * The measured failure class is a facet inside which the surface TURNS (S70: 100% of LowPolyFacet's
 * over-1-deg facets have `spreadRad >= normRad/2`). A facet cannot be fixed by refining it — the angle is
 * density-INVARIANT on a turn (S61 H2: x0.9968 over five halvings) — it can only be fixed by putting the
 * mesh edge ON the turn. This is the 1-D primitive that finds where.
 *
 * Bisection on the GAUSS MAP, not on the radius: at each step the sub-interval whose endpoints' normals
 * differ more is kept, so the search converges on the place the normal field turns fastest, which is the
 * crease when there is one and the max-curvature point when there is not. It needs NO loci file, NO feature
 * extractor and NO style knowledge — which is the whole point, because the campaign's conform route needs
 * a per-style `PF_CB_TIGHTEN=...loci.json` and cannot generalise.
 *
 * Returns the parameter s in (0,1) along the (theta, z) segment. `turn` is the total normal change across
 * the FINAL bracket, i.e. how sharp the located feature is; a smooth edge returns a small `turn` and the
 * caller should ignore `s`.
 */
export function locateTurn(
  ns: NormalSampler,
  ath: number, az: number, bth: number, bz: number,
  iters = 14,
  scratch?: Float64Array,
): { s: number; turn: number } {
  const sc = scratch ?? new Float64Array(12);
  const n0 = new Float64Array(3); const n1 = new Float64Array(3); const nm = new Float64Array(3);
  const at = (s: number, out: Float64Array): void => {
    ns(ath + (bth - ath) * s, az + (bz - az) * s, sc);
    out[0] = sc[0]; out[1] = sc[1]; out[2] = sc[2];
  };
  const ang = (p: Float64Array, q: Float64Array): number => {
    let d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    d = d > 1 ? 1 : d < -1 ? -1 : d; return Math.acos(d);
  };
  let lo = 0; let hi = 1;
  at(lo, n0); at(hi, n1);
  for (let i = 0; i < iters; i += 1) {
    const mid = 0.5 * (lo + hi);
    at(mid, nm);
    if (ang(n0, nm) >= ang(nm, n1)) { hi = mid; n1[0] = nm[0]; n1[1] = nm[1]; n1[2] = nm[2]; } else { lo = mid; n0[0] = nm[0]; n0[1] = nm[1]; n0[2] = nm[2]; }
  }
  return { s: 0.5 * (lo + hi), turn: ang(n0, n1) };
}

/** shortest-arc theta delta (the theta = 0 == 2*pi seam), same body as `_sweepPredicate.dThRaw`. */
export function dThShortest(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

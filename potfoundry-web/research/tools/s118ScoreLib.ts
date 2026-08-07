// s118ScoreLib.ts — the two pieces of s118Score that are ALGORITHMS rather than reporting, extracted so
// they can be validated on PLANTED DEFECTS instead of only against a previous run.
//
// A scorecard validated only by reproducing published numbers is validated ONE-SIDED: it proves the tool
// agrees with the old tool on the meshes that exist, and proves nothing about whether it can SEE a defect
// that has never occurred. research/bridge/_s118ScoreValidate.test.ts plants each defect class into a
// hand-built facet and asserts both directions — the defect is detected, and a clean control is not.
//
// s118Score.ts imports BOTH of these; there is exactly one implementation of each.

/** Per-facet arc-space diagnostics: the analytic-free artefact classifiers. */
export interface FacetGeom {
  /** true 3D area, mm2 */
  area: number;
  /** minimum altitude of the facet's ARC-SPACE footprint (u = theta*rmean, v = z), in um */
  minAltUm: number;
  /** sign of the arc-space signed area: -1 is a FOLD (the parametric footprint inverted) */
  apsSign: -1 | 0 | 1;
  /** 3D area / |arc-space area|; a DEGENERACY POLE when this blows up */
  graphRatio: number;
}

/**
 * Arc-space footprint diagnostics for one facet.
 *
 * `tha/thb/thc` must be UNWRAPPED (thb = tha + dThRaw(tha, atan2(by,bx)), likewise thc). Passing raw
 * atan2 values makes any facet straddling the -pi seam read as a giant inverted sliver — that is the
 * single most common way this class of measurement has been got wrong in this campaign.
 */
export function facetGeom(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  tha: number, thb: number, thc: number,
): FacetGeom {
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const area = 0.5 * Math.hypot(nx, ny, nz);
  const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const ua = tha * rm; const ub = thb * rm; const uc = thc * rm;
  const aps = 0.5 * ((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
  const apa = Math.abs(aps);
  const e1 = Math.hypot(ub - ua, bz - az);
  const e2 = Math.hypot(uc - ub, cz - bz);
  const e3 = Math.hypot(ua - uc, az - cz);
  const emax = Math.max(e1, e2, e3);
  return {
    area,
    minAltUm: emax > 0 ? (2 * apa / emax) * 1000 : 0,
    apsSign: aps > 0 ? 1 : aps < 0 ? -1 : 0,
    graphRatio: apa > 0 ? area / apa : Infinity,
  };
}

export interface PerpTally {
  /** facets classified over the HI bar perpendicularly */
  overHiCount: number;
  overHiArea: number;
  /** facets classified over the LO bar perpendicularly (0 when loOn is false) */
  overLoCount: number;
  overLoArea: number;
  /** exact max perpendicular distance over the walked set, at the lattice points */
  max: number;
  /** projector calls actually issued */
  calls: number;
  /** facets that needed at least one projector call */
  facetsTouched: number;
  /** pointwise perpendicular > radial violations. MUST be 0; anything else voids the run. */
  c2Violations: number;
}

export interface PerpScanOpts {
  xyz: ArrayLike<number>;
  /** facet ids to walk, in DESCENDING r1 order (only `fast` exploits the order; `full` ignores it) */
  order: ArrayLike<number>;
  r1: ArrayLike<number>;
  areaA: ArrayLike<number>;
  /** flat barycentric lattice, 3 weights per point */
  lattice: Float64Array;
  rA: (th: number, z: number) => number;
  project: (x: number, y: number, z: number) => number;
  barHi: number;
  barLo: number;
  loOn: boolean;
  mode: 'fast' | 'full';
}

/**
 * Walk `order` and decide, for every facet in it, whether its perpendicular distance to the analytic
 * surface exceeds the bars — plus the exact max over the walked set.
 *
 * `full` computes max-over-all-lattice-points for every facet: the reference arm, and the one whose call
 * count matches the published runs.
 *
 * `fast` applies two reductions that are SOUND because perpendicular <= radial POINTWISE (the radial foot
 * is itself a surface point at the same (theta, z), and the projector seeds Gauss-Newton there and only
 * accepts improvements):
 *   * a lattice point whose radial residual is <= the threshold that currently matters cannot produce a
 *     perpendicular value above it, so it is skipped — PROVEN irrelevant, not sampled away;
 *   * once a facet is known to be over a bar that bar stops mattering, and once the running mesh max
 *     exceeds a facet's radial residual that facet cannot improve the max either.
 * The two modes MUST return identical overHi/overLo/max. Only `calls` may differ.
 */
export function perpScan(o: PerpScanOpts): PerpTally {
  const { xyz, order, r1, areaA, lattice, rA, project, barHi, barLo, loOn, mode } = o;
  const NP = lattice.length / 3;
  let calls = 0; let facetsTouched = 0; let c2 = 0; let best = 0;
  let cHi = 0; let aHi = 0; let cLo = 0; let aLo = 0;
  for (let i = 0; i < order.length; i += 1) {
    const f = order[i];
    const rf = r1[f];
    const b = f * 9;
    const ax = xyz[b], ay = xyz[b + 1], az = xyz[b + 2];
    const bx = xyz[b + 3], by = xyz[b + 4], bz = xyz[b + 5];
    const cx = xyz[b + 6], cy = xyz[b + 7], cz = xyz[b + 8];
    let overHi = false; let overLo = false; let touched = false;
    for (let p = 0; p < NP; p += 1) {
      let tSkip = 0;
      if (mode === 'fast') {
        tSkip = best;
        if (loOn && !overLo && barLo < tSkip) tSkip = barLo;
        if (!overHi && rf > barHi && barHi < tSkip) tSkip = barHi;
        if (rf <= tSkip) break;
      }
      const w0 = lattice[p * 3], w1 = lattice[p * 3 + 1], w2 = lattice[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx;
      const y = w0 * ay + w1 * by + w2 * cy;
      const z = w0 * az + w1 * bz + w2 * cz;
      const rr = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (mode === 'fast' && rr <= tSkip) continue;
      const d = project(x, y, z); calls += 1; touched = true;
      if (d > rr + 1e-9) c2 += 1;
      if (d > best) best = d;
      if (d > barHi) overHi = true;
      if (loOn && d > barLo) overLo = true;
    }
    if (touched) facetsTouched += 1;
    if (overHi) { cHi += 1; aHi += areaA[f]; }
    if (overLo) { cLo += 1; aLo += areaA[f]; }
  }
  return { overHiCount: cHi, overHiArea: aHi, overLoCount: cLo, overLoArea: aLo, max: best, calls, facetsTouched, c2Violations: c2 };
}

/** Flat barycentric lattice of order k: (k+1)(k+2)/2 points, 3 weights each. */
export function latticePts(k: number): Float64Array {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
}

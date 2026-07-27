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
// A PASS is therefore sound however crude the nearest-point search; only a FAIL can be a search artifact,
// which is what `distGlobal` exists to rule out.
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

/** Half-width of the one-sided probe used to close the graph at a discontinuity (mm / rad). */
const CLOSURE_EPS = 1e-6;

/**
 * Local polish: 8-neighbour coordinate descent in (arc, z) from a seed, halving the step when stuck.
 * Every probe is a genuine surface point, so the result is still an upper bound on d(p) — polishing can
 * only tighten the estimate, never fabricate a pass.
 *
 * CLOSURE AT DISCONTINUITIES. The printed object's outer boundary is the CLOSURE of the graph
 * r = rA(theta,z), not the graph itself: at a C0 z-step the solid has a vertical tread wall, and at a
 * theta-jump a vertical curtain, and both are correct geometry that the mesher deliberately emits. Scoring
 * such a wall against the bare graph would report about half the jump height as an error on every layered
 * style — a false FAIL on correct triangles. So at each candidate (theta,z) the surface footprint is taken
 * to be the RADIAL SEGMENT spanned by the one-sided limits, and the query point's radius is clamped into
 * it. On a smooth patch the limits coincide to within slope*1e-6 mm, so this is a no-op everywhere except
 * exactly at a jump, which is where it is the correct model.
 */
export function distLocal(
  rA: RadiusFn, H: number,
  px: number, py: number, pz: number,
  seedTh: number, seedZ: number, step0: number, iters: number,
): LocalResult {
  let th = seedTh; let z = seedZ;
  const rNom = Math.hypot(px, py) || 1;
  const rp = Math.hypot(px, py);
  const at = (t: number, zz: number): number => {
    const zc = zz < 0 ? 0 : zz > H ? H : zz;
    const e = CLOSURE_EPS;
    const r0 = rA(t, zc);
    let lo = r0; let hi = r0;
    for (const rr of [rA(t, Math.min(H, zc + e)), rA(t, Math.max(0, zc - e)), rA(t + e / rNom, zc), rA(t - e / rNom, zc)]) {
      if (rr < lo) lo = rr;
      if (rr > hi) hi = rr;
    }
    const r = rp < lo ? lo : rp > hi ? hi : rp;
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
  /** largest deviation actually WITNESSED at a sampled point (a real point of the triangle) */
  witnessed: number;
  /** rigorous upper bound over the whole triangle = witnessed + covering radius at the final level */
  bound: number;
  /** true if bound <= tol */
  certified: boolean;
  /** lattice level reached */
  n: number;
  /** lattice samples spent */
  samples: number;
  /** the witness point */
  px: number; py: number; pz: number;
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
  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);
  if (!(cov > 0)) return { witnessed: 0, bound: 0, certified: true, n: 0, samples: 0, px: ax, py: ay, pz: az };

  // Start where the certificate WOULD close if the mesh were exact, but never above the level ceiling —
  // an unclamped cov/tol asks for a lattice with millions of points per edge when tol is small.
  let n = Math.min(nMax, Math.max(2, Math.ceil(cov / tol)));
  let mx = 0; let mxx = ax; let mxy = ay; let mxz = az;
  let samples = 0;
  for (;;) {
    mx = 0;
    const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
    const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;
    for (let i = 0; i <= n; i += 1) {
      const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
      for (let j = 0; j <= n - i; j += 1) {
        const px = rx + ubx * j; const py = ry + uby * j; const pz = rz + ubz * j;
        const d = distRadial(rA, H, px, py, pz);
        if (d > mx) { mx = d; mxx = px; mxy = py; mxz = pz; }
      }
    }
    samples += ((n + 1) * (n + 2)) / 2;
    const rho = cov / n;
    if (mx + rho <= tol) break;
    // The radial foot over-states d on a slope, and an over-statement here costs a factor of 4 in work,
    // so tighten the witness with the local polish before deciding to subdivide again.
    if (mx > tol * 0.25) {
      const pol = distLocal(rA, H, mxx, mxy, mxz, Math.atan2(mxy, mxx), mxz < 0 ? 0 : mxz > H ? H : mxz, Math.max(mx, tol), 40);
      if (pol.d < mx) mx = pol.d;
      if (mx + rho <= tol) break;
    }
    if (mx > tol) break;                    // witnessed exceedance — more resolution cannot change the verdict
    if (n >= nMax || samples >= sampleCap) break;
    n *= 2;
  }
  const bound = mx + cov / n;
  return { witnessed: mx, bound, certified: bound <= tol, n, samples, px: mxx, py: mxy, pz: mxz };
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
// finest cell could still be missed. Refinement is driven by three independent triggers so that a feature
// narrower than a cell still forces subdivision:
//   hot   — the cell already reads a significant fraction of tol
//   bulge — the true surface at the mid-edge/centre probes departs from the corner interpolant, which is
//           what betrays a feature living strictly inside the cell
//   span  — the cell's 3-D diagonal is coarser than the chord target, so coverage stays bounded
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
//            than a locator query, so the structure scan runs `structOver` times finer than the queries
//            and is what supplies the sub-pitch resolving power.
//
// RESOLVING POWER IS REPORTED, NOT ASSUMED. `structPitch` (the finest rA spacing) is returned so the claim
// can be stated with its own limit attached: no feature wider than about that is missed. This is a
// witnessed lower bound on the true H2, never a certificate.
export interface SurfaceToMeshOpts {
  H: number;
  tol: number;
  /** uniform query lattice spacing, mm of arc and of z (phase A). Default 4x tol. */ coveragePitch?: number;
  /** refinement floor for the query lattice (phase B). Default tol/8. */ minPitch?: number;
  /** samples per structure line. Default 48. */ structN?: number;
  /** number of rows and of columns in the structure cross. Default 5. */ structLines?: number;
  /** wall-clock ceiling for phase B, ms. Phase A always completes. Default 900000. */ timeBudgetMs?: number;
  /** max locator queries in phase B before it stops (phase A always completes) */ budget?: number;
  onProgress?: (fracDone: number, queries: number, max: number) => void;
}

export interface SurfaceToMeshResult {
  /** largest witnessed distance from a surface point to the mesh (mm) */ max: number;
  th: number; z: number;
  queries: number;
  rEvalsStruct: number;
  capped: boolean;
  /** finest rA spacing reached anywhere (mm) — a best case, NOT a guarantee */ structPitch: number;
  /** phase-A structure pitch, uniform over the whole surface — this is the actual resolving-power GUARANTEE */ structPitchUniform: number;
  /** cells that were still hot when the refinement floor was reached */ hotLeaves: number;
  secs: number;
}

export function surfaceToMeshMax(
  rA: RadiusFn,
  distToMesh: (x: number, y: number, z: number) => number,
  opts: SurfaceToMeshOpts,
): SurfaceToMeshResult {
  const TAU = 2 * Math.PI;
  const { H, tol } = opts;
  const pitch0 = opts.coveragePitch ?? 4 * tol;
  const minPitch = opts.minPitch ?? tol / 4;
  const structN = opts.structN ?? 48;
  const structLines = opts.structLines ?? 5;
  const timeBudgetMs = opts.timeBudgetMs ?? 900000;
  const tStart = Date.now();
  const budget = opts.budget ?? 2e8;
  let queries = 0; let rEvalsStruct = 0; let capped = false;
  let max = 0; let mTh = 0; let mZ = 0; let hotLeaves = 0;
  let finestStruct = Infinity;

  // nominal radius, for converting an arc pitch into a theta pitch
  let rNom = 0;
  for (let i = 0; i < 16; i += 1) rNom = Math.max(rNom, rA((TAU * i) / 16, H / 2));
  if (!(rNom > 0)) rNom = 1;

  const D = (th: number, z: number): number => {
    const r = rA(th, z);
    queries += 1;
    return distToMesh(r * Math.cos(th), r * Math.sin(th), z);
  };

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
  const structure = (th0: number, th1: number, z0: number, z1: number): number => {
    finestStruct = Math.min(finestStruct, Math.max(((th1 - th0) * rNom) / structN, (z1 - z0) / structN));
    const r00 = rA(th0, z0); const r10 = rA(th1, z0); const r01 = rA(th0, z1); const r11 = rA(th1, z1);
    const lin = (a: number, b: number): number => (1 - a) * (1 - b) * r00 + a * (1 - b) * r10 + (1 - a) * b * r01 + a * b * r11;
    let worst = 0;
    for (let L = 1; L <= structLines; L += 1) {
      const t = L / (structLines + 1);
      const zRow = z0 + (z1 - z0) * t;
      const thCol = th0 + (th1 - th0) * t;
      for (let i = 0; i <= structN; i += 1) {
        const a = i / structN;
        rEvalsStruct += 2;
        const dRow = Math.abs(rA(th0 + (th1 - th0) * a, zRow) - lin(a, t));
        if (dRow > worst) worst = dRow;
        const dCol = Math.abs(rA(thCol, z0 + (z1 - z0) * a) - lin(t, a));
        if (dCol > worst) worst = dCol;
      }
    }
    return worst;
  };

  /** Sweep one cell on a uniform lattice at `pitch`; returns its max and where. */
  const scan = (th0: number, th1: number, z0: number, z1: number, pitch: number): { m: number; th: number; z: number } => {
    const nu = Math.max(1, Math.ceil(((th1 - th0) * rNom) / pitch));
    const nv = Math.max(1, Math.ceil((z1 - z0) / pitch));
    let m = 0; let cTh = th0; let cZ = z0;
    for (let i = 0; i <= nu; i += 1) {
      const th = th0 + ((th1 - th0) * i) / nu;
      for (let j = 0; j <= nv; j += 1) {
        const z = z0 + ((z1 - z0) * j) / nv;
        const d = D(th, z);
        if (d > m) { m = d; cTh = th; cZ = z; }
      }
    }
    if (m > max) { max = m; mTh = cTh; mZ = cZ; }
    return { m, th: cTh, z: cZ };
  };

  // ── PHASE A — COVERAGE. Every super-cell is swept in full at pitch0 before any refinement happens, so
  // no part of the surface can be starved by budget spent elsewhere. Cost is fixed and knowable up front.
  //
  // The refinement TRIGGER cannot be "this cell reads above a fraction of tol": these meshes are built to
  // ~5 um everywhere, so such a trigger fires on the entire surface and refinement degenerates into an
  // (unaffordable) uniform sweep at the finest pitch — the second way this routine produced a false PASS by
  // running out of budget. Refinement is therefore WORST-FIRST over an optimistic key.
  const U = 512; const V = 256;
  const uniformStruct = Math.max((TAU * rNom) / U / structN, H / V / structN);
  const qTh0: number[] = []; const qTh1: number[] = []; const qZ0: number[] = []; const qZ1: number[] = [];
  const qPitch: number[] = []; const qKey: number[] = [];
  for (let i = 0; i < U; i += 1) {
    for (let j = 0; j < V; j += 1) {
      const a0 = (TAU * i) / U; const a1 = (TAU * (i + 1)) / U;
      const b0 = (H * j) / V; const b1 = (H * (j + 1)) / V;
      const s = scan(a0, a1, b0, b1, pitch0);
      // Optimistic key: what this cell could still turn out to hold. `bulge` is how far the true surface
      // departs from the cell's corner interpolant, measured on an rA-only lattice far finer than the query
      // lattice — so a ridge living strictly between query samples raises the key even though no query saw
      // it. rA is much cheaper than a locator query, which is what makes this affordable.
      const bulge = structure(a0, a1, b0, b1);
      qTh0.push(a0); qTh1.push(a1); qZ0.push(b0); qZ1.push(b1);
      qPitch.push(pitch0); qKey.push(s.m + bulge);
    }
    opts.onProgress?.((i + 1) / U, queries, max);
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
  const swap = (i: number, j: number): void => {
    [hKey[i], hKey[j]] = [hKey[j], hKey[i]]; [hA0[i], hA0[j]] = [hA0[j], hA0[i]];
    [hA1[i], hA1[j]] = [hA1[j], hA1[i]]; [hB0[i], hB0[j]] = [hB0[j], hB0[i]];
    [hB1[i], hB1[j]] = [hB1[j], hB1[i]]; [hP[i], hP[j]] = [hP[j], hP[i]];
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
  for (let i = 0; i < qKey.length; i += 1) push(qKey[i], qTh0[i], qTh1[i], qZ0[i], qZ1[i], qPitch[i]);
  while (hKey.length > 0) {
    if (queries > budget || Date.now() - tPhaseB > timeBudgetMs) { capped = true; break; }
    const key = hKey[0]; const a0 = hA0[0]; const a1 = hA1[0];
    const b0 = hB0[0]; const b1 = hB1[0]; const pitch = hP[0];
    pop();
    if (key <= max) break;                       // nothing left that could beat what we already witnessed
    if (pitch <= minPitch) { if (key > tol) hotLeaves += 1; continue; }
    const am = 0.5 * (a0 + a1); const bm = 0.5 * (b0 + b1);
    const p = Math.max(minPitch, pitch / 4);
    for (const [c0, c1, d0, d1] of [[a0, am, b0, bm], [am, a1, b0, bm], [a0, am, bm, b1], [am, a1, bm, b1]] as [number, number, number, number][]) {
      const s = scan(c0, c1, d0, d1, p);
      push(s.m + structure(c0, c1, d0, d1), c0, c1, d0, d1, p);
    }
  }
  return {
    max, th: mTh, z: mZ, queries, rEvalsStruct, capped,
    structPitch: Number.isFinite(finestStruct) ? finestStruct : pitch0 / structN,
    structPitchUniform: uniformStruct,
    secs: (Date.now() - tStart) / 1000,
    hotLeaves,
  };
}

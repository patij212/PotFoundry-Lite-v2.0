// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// s29Perp.ts — THE S29 ACCEPT QUANTITY. A TRANSCRIPTION OF THE CERTIFICATE'S PERPENDICULAR RULER.
// RESEARCH ONLY. Nothing under src/, no untouchable, no judge, no mesher kernel.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// ── THE S-e RULE, AND WHY THIS FILE IS A COPY AND NOT AN IMPORT ────────────────────────────────────────
// S-e: "The driver gets its own transcription; `_judgeNormal`, `_judgeShape`, `_facetTruthLib`,
// `_sharp3dRef` and `_shapeGuard` stay byte-untouched, so the instrument that scores the arm is not the
// instrument the arm was built from. A guard and an auditor sharing an implementation cannot disagree;
// these two must be able to."
//
// So the `distPerp` / `distPerpFrom` / `distLocal` / `distRadial` / `covRadius` family below is TRANSCRIBED
// from `research/bridge/_facetTruthLib.ts`. It is NEVER imported. `_facetTruthLib.ts` is not edited by this
// arm and is not read at runtime by it. If this transcription drifts from the certificate, the certificate
// says so 54 minutes later — which is exactly the silent-failure risk the S29 handoff names as this arm's
// largest, and exactly why VALIDATE (below) exists and runs BEFORE anything is wired to this file.
//
// ── WHAT THE ACCEPT RULE IS ─────────────────────────────────────────────────────────────────────────────
//     accept(t)  <=>  blindAccept(t)  AND  ( listed(t) ? s29PerpTriangle(t).bound <= TOL : true )
// The plane ruler still RANKS. This file supplies only the second conjunct, only at listed facets. It has
// no opinion about the heap, about `acceptTol`, or about h-0 routing.
//
// ── THE SEEDING DENSITY IS PART OF THE REGISTRATION, NOT AN IMPLEMENTATION DETAIL ───────────────────────
// `_facetTruthLib.distPerp` seeds its Newton from a 180x120 sweep. D2 MEASURED what that default costs: at
// tri 690730 the default reference read 118.993 um and the refined 2880x1920 sweep pulled it to 88.091 um
// — down 30.902 um (26%), where 0.336 um would have sufficed to decide the gate. IT MOVED BY 92x THE
// DEFICIT. An accept test built on an over-stating ruler demands splits that are not needed: it manufactures
// R1b's weld wall out of seeding error.
//
// REGISTERED, and enforced by `seedGrid` below:
//     local seed pitch  dTheta <= 2*PI/2880 = 2.1817e-3 rad,  dz <= 120/1920 = 0.0625 mm
//     floor 8x8 seeds per candidate facet
//     every reading takes MIN over all seed candidates — `_facetTruthLib`'s own rule: every candidate is an
//     upper bound, so taking the min is always correct.
// `realisedPitch()` reports the worst-case realised pitch so the run can print it, as registered.
//
// ── VALIDATE BEFORE WIRING. THIS FILE CAN FAIL ITS OWN BARS. ────────────────────────────────────────────
//     npx tsx research/tools/s29Perp.ts --validate
// V8/V9/V10 are `_strataFacetTruthValidate.test.ts`'s own published fixtures, transcribed with their
// published expectations. F1/F2 are EXPECT-NONZERO falsifiers: a deliberately mis-seeded ruler and a
// deliberately broken frame MUST fail the same bars the registered ruler passes. A check that asserts a
// zero is worth nothing until something has been seen to make it fire (S28's toothless S5b is the
// precedent this arm refuses to repeat).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

export type RadiusFn = (theta: number, z: number) => number;

const TWO_PI = 2 * Math.PI;

/** REGISTERED seed pitch. Do not loosen these without amending the registration. */
export const S29_DTHETA_MAX = TWO_PI / 2880;   // 2.1817e-3 rad
export const S29_DZ_MAX = 120 / 1920;          // 0.0625 mm
export const S29_SEED_FLOOR = 8;               // per axis, per candidate facet

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// TRANSCRIBED GEOMETRY — verbatim behaviour from `_facetTruthLib.ts`.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────

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

/** Distance from p to the vertical TREAD WALL at a C0 z-step. Correct geometry, not error. */
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

/** Distance from p to the vertical CURTAIN at a theta-jump. */
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
 * Local polish: 8-neighbour coordinate descent in (arc, z) from a seed, halving the step when stuck.
 * Every probe is a genuine surface point, so the result is still an upper bound on d(p).
 *
 * DO NOT TRUNCATE `iters`. `_facetTruthLib`'s own PRECEDENT block: a profiling pass measured (40,40) vs
 * (8,16) as "bit-identical over 442 above-threshold points" and it was WRONG — V3's thin ridge moved
 * 12.041 -> 27.103 um. On a facet spanning a narrow ridge the radial foot sits ON the crest ~400 um from the
 * true nearest point, and it is the COORDINATE DESCENT — not Newton — that walks the ~8 um sideways to the
 * base surface. F1 below is the standing falsifier for exactly this.
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
 * BROKEN-ON-PURPOSE frame, used ONLY by falsifier F2: the r-derivatives are dropped, so the tangents are a
 * CYLINDER's wherever the real surface has slope. Newton then converges to the RADIAL foot instead of the
 * perpendicular one — which is precisely the defect this whole ruler exists to fix, so it is the right
 * break to test against.
 *
 * TWO BREAKS THAT DO NOT WORK, and they are recorded because each looked convincing:
 *  * SIGN-FLIP `Pth`. Algebraically a no-op. F1 -> -F1 negates the first row of the Jacobian and the
 *    determinant with it, and the Newton step comes out IDENTICAL. Measured: all three V9 slopes passed
 *    with the "broken" solver. A falsifier that does not perturb the root set falsifies nothing.
 *  * ANY break at all aimed at V8. The cylinder's radial foot already satisfies the orthogonality system,
 *    so the seed is the answer and no solver runs. See F2's own note.
 */
function frameBroken(rA: RadiusFn, H: number, th: number, z: number, _hTh: number, _hZ: number): {
  P: [number, number, number]; Pth: [number, number, number]; Pz: [number, number, number];
} {
  const zc = z < 0 ? 0 : z > H ? H : z;
  const r = rA(th, zc);
  const c = Math.cos(th); const s = Math.sin(th);
  return { P: [r * c, r * s, zc], Pth: [-r * s, r * c, 0], Pz: [0, 0, 1] };
}

type FrameFn = typeof frame;

/**
 * True perpendicular distance from p to the radial surface, by damped Newton on the orthogonality
 * conditions, started from the supplied seed. Returns the residual so the caller can verify the foot.
 */
export function distPerpFrom(
  rA: RadiusFn, H: number, px: number, py: number, pz: number,
  seedTh: number, seedZ: number, maxIter = 40, frm: FrameFn = frame,
): PerpResult {
  const rNom = Math.max(1e-6, Math.hypot(px, py));
  const hTh = 1e-5 / rNom;      // ~10 nm of arc — well inside f64, well outside FD noise
  const hZ = 1e-5;
  let th = seedTh; let z = Math.min(H, Math.max(0, seedZ));
  let best = Infinity; let bTh = th; let bZ = z;
  let it = 0; let converged = false;
  for (; it < maxIter; it += 1) {
    const f = frm(rA, H, th, z, hTh, hZ);
    const dx = px - f.P[0]; const dy = py - f.P[1]; const dz = pz - f.P[2];
    const d = Math.hypot(dx, dy, dz);
    if (d < best) { best = d; bTh = th; bZ = z; }
    const F1 = dx * f.Pth[0] + dy * f.Pth[1] + dz * f.Pth[2];
    const F2 = dx * f.Pz[0] + dy * f.Pz[1] + dz * f.Pz[2];
    const e = 1e-6;
    // ONE-SIDED AT THE TOP BOUNDARY: `Math.min(H, z+e)` clamps to H when z === H, which zeroes the second
    // Jacobian column, breaks on iteration 1 and returns the unpolished seed — a systematic over-statement
    // on exactly the rim band this campaign keeps re-flagging. Step inward instead.
    const ez = z + e <= H ? e : -e;
    const fa = frm(rA, H, th + e / rNom, z, hTh, hZ);
    const fb = frm(rA, H, th, z + ez, hTh, hZ);
    const Fof = (fr: ReturnType<FrameFn>): [number, number] => {
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
    const cap = 0.1;
    const mag = Math.max(Math.abs(dTh) * rNom, Math.abs(dZ));
    if (mag > cap) { const k = cap / mag; dTh *= k; dZ *= k; }
    th += dTh; z = Math.min(H, Math.max(0, z + dZ));
    if (Math.max(Math.abs(dTh) * rNom, Math.abs(dZ)) < 1e-11) { converged = true; it += 1; break; }
  }
  // The reported foot is always the BEST VISITED point, and every visited point is a genuine surface point,
  // so the answer is an upper bound on d(p) whether or not Newton converged. `ortho` is measured on the
  // TRUE frame even under F2, so a broken solver cannot also fake its own self-check.
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

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE REGISTERED SEEDING.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A (theta,z) window to seed over. `null` means the whole domain. */
export interface SeedWindow { th0: number; th1: number; z0: number; z1: number }

export interface SeedGrid { nu: number; nv: number; th0: number; th1: number; z0: number; z1: number }

/**
 * Choose the seed grid for a window at the REGISTERED pitch. Never coarser than dTheta/dz above; never
 * fewer than S29_SEED_FLOOR per axis. This is the whole of the D2 mitigation and it is one function so it
 * can be tested on its own.
 */
export function seedGrid(H: number, win: SeedWindow | null): SeedGrid {
  const th0 = win ? win.th0 : 0;
  const th1 = win ? win.th1 : TWO_PI;
  const z0 = win ? Math.max(0, win.z0) : 0;
  const z1 = win ? Math.min(H, win.z1) : H;
  const nu = Math.max(S29_SEED_FLOOR, Math.ceil((th1 - th0) / S29_DTHETA_MAX));
  const nv = Math.max(S29_SEED_FLOOR, Math.ceil((z1 - z0) / S29_DZ_MAX));
  return { nu, nv, th0, th1, z0, z1 };
}

/** Worst-case realised pitch of a grid, for the run print the registration asks for. */
export function realisedPitch(g: SeedGrid): { dTheta: number; dz: number } {
  return { dTheta: (g.th1 - g.th0) / g.nu, dz: g.nv > 0 ? (g.z1 - g.z0) / g.nv : 0 };
}

export interface PerpOpts {
  /** Local window to seed over. Omit for the whole domain (the fixture / re-measurement path). */
  win?: SeedWindow | null;
  zJumps?: number[];
  thJumps?: number[];
  /** How many distinct sweep minima to run Newton from. `_facetTruthLib.distPerp` uses 2. */
  nWells?: number;
  /** DIAGNOSTIC ONLY — F1's mis-seed lever. Overrides the registered grid. Never set in production. */
  forceGrid?: { nu: number; nv: number } | null;
  /** DIAGNOSTIC ONLY — F1's mis-seed lever. Drops the coordinate-descent seed. Never set in production. */
  noDescent?: boolean;
  /** DIAGNOSTIC ONLY — F2's broken-solver lever. */
  brokenFrame?: boolean;
}

/**
 * Perpendicular distance at the REGISTERED seed density: sweep the window, then Newton from the best wells
 * plus the radial foot plus the coordinate descent's answer, plus any detected discontinuity walls. Returns
 * the smallest — every candidate is an upper bound, so the min is always correct.
 */
export function s29PerpAt(
  rA: RadiusFn, H: number, px: number, py: number, pz: number, opts: PerpOpts = {},
): PerpResult & { grid: SeedGrid } {
  const g0 = seedGrid(H, opts.win ?? null);
  const g: SeedGrid = opts.forceGrid ? { ...g0, nu: opts.forceGrid.nu, nv: opts.forceGrid.nv } : g0;
  const frm = opts.brokenFrame ? frameBroken : frame;
  const nWells = opts.nWells ?? 2;

  const seeds: [number, number][] = [[Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz]];
  // best `nWells` distinct sweep minima
  const wells: { v: number; th: number; z: number }[] = [];
  const dTh = (g.th1 - g.th0) / g.nu;
  const dZ = g.nv > 0 ? (g.z1 - g.z0) / g.nv : 0;
  for (let i = 0; i <= g.nu; i += 1) {
    // a full-domain sweep must not double-count theta = 0 and theta = 2*PI
    if (!opts.win && i === g.nu) break;
    const th = g.th0 + dTh * i;
    const ct = Math.cos(th); const st = Math.sin(th);
    for (let j = 0; j <= g.nv; j += 1) {
      const z = g.z0 + dZ * j;
      const r = rA(th, z);
      const dx = px - r * ct; const dy = py - r * st; const dz = pz - z;
      const v = dx * dx + dy * dy + dz * dz;
      if (wells.length < nWells) { wells.push({ v, th, z }); wells.sort((a, b) => a.v - b.v); }
      else if (v < wells[wells.length - 1].v) { wells[wells.length - 1] = { v, th, z }; wells.sort((a, b) => a.v - b.v); }
    }
  }
  for (const w of wells) seeds.push([w.th, w.z]);
  if (!opts.noDescent) {
    const dl = distLocal(rA, H, px, py, pz, seeds[0][0], seeds[0][1],
      Math.max(1, Math.hypot(px, py) * 0.05), 40, opts.zJumps ?? [], opts.thJumps ?? []);
    seeds.push([dl.th, dl.z]);
  }
  let best: PerpResult = { d: Infinity, th: 0, z: 0, ortho: 1, iters: 0, converged: false };
  for (const [sth, sz] of seeds) {
    const r = distPerpFrom(rA, H, px, py, pz, sth, sz, 40, frm);
    if (r.d < best.d) best = r;
  }
  for (const zj of opts.zJumps ?? []) {
    const dw = distToZWall(rA, zj, px, py, pz);
    if (dw < best.d) best = { d: dw, th: Math.atan2(py, px), z: zj, ortho: 0, iters: 0, converged: true };
  }
  for (const tj of opts.thJumps ?? []) {
    const dw = distToThetaWall(rA, tj, px, py, pz, H);
    if (dw < best.d) best = { d: dw, th: tj, z: pz < 0 ? 0 : pz > H ? H : pz, ortho: 0, iters: 0, converged: true };
  }
  return { ...best, grid: g };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE ACCEPT QUANTITY OVER A TRIANGLE.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface S29FacetReading {
  /**
   * THE ACCEPT QUANTITY. Largest deviation over the lattice, each point measured with the tightest tier it
   * needed — true perpendicular wherever the cheap radial reading could have exceeded `bar`, the cheap
   * radial reading elsewhere.
   *
   * WHY THIS AND NOT `bound`. The registration's claim is "the accept QUANTITY, not its tolerance": swap
   * the plane-sag quantity for the perpendicular quantity at a stated bar. It is NOT "make the driver run
   * the certificate". `certifyTriangle` reaches its verdict by raising n to 2048 until `witnessed + cov/n`
   * closes; a driver capped at n <= 24 cannot, so `witnessed + cov/n` in a hot path is dominated by the
   * covering term and rejects facets whose true error is a fraction of the bar. MEASURED on T1 below: a
   * chord whose true sagitta is 2.250 um returns bound 21.104 um at n=24. An accept test built on that
   * demands splits that are not needed — which is the over-stating-ruler failure D2 identified and this
   * arm's registration explicitly forbids. `bound` is retained and REPORTED as a diagnostic; it does not
   * gate.
   */
  witnessed: number;
  /** witnessed + covRad/n — `certifyTriangle`'s structure, REPORTED ONLY. See the note on `witnessed`. */
  bound: number;
  n: number;
  samples: number;
  /** rA evaluations spent — the cost the driver is billed for. */
  cost: number;
  /** worst realised seed pitch over the tightened points, for the registered run print */
  worstDTheta: number;
  worstDz: number;
}

export interface S29FacetOpts {
  H: number;
  /**
   * THE ACCEPT BAR, in mm. Doubles as the tightening threshold, and that is EXACT rather than a heuristic:
   * radial >= perpendicular pointwise, so a lattice point whose radial reading is already <= `bar` can
   * never lift the perpendicular max above `bar` and needs no tightening at all. Only points above the bar
   * are tightened. So the ACCEPT DECISION is exact with respect to the lattice, and the common case — a
   * facet that is already fine — costs L radial evaluations and nothing else.
   */
  tol: number;
  nMax?: number;
  sampleCap?: number;
  zJumps?: number[];
  thJumps?: number[];
  /** padding of the seed window beyond the facet's own (theta,z) footprint, in rad / mm */
  padTheta?: number;
  padZ?: number;
}

/**
 * The S29 accept reading for one flat triangle, transcribing `certifyTriangle`'s STRUCTURE:
 *   pass 1  cheap radial over the whole lattice; if nothing can block the verdict, the facet closes.
 *   pass 2  only points above `tol - rho` are tightened — descent, then Newton at the REGISTERED density.
 * `bound = witnessed + covRad/n` is the accept bar, so the driver accepts a listed facet exactly when this
 * transcription would certify it. Points at or below the threshold keep their cheap reading, which can only
 * make `bound` LARGER, so the reading never manufactures a pass.
 *
 * COST DISCIPLINE. `nMax`/`sampleCap` bound one accept test. This is a hot path — the certificate is not.
 */
export function s29PerpTriangle(
  rA: RadiusFn,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  opts: S29FacetOpts,
): S29FacetReading {
  const { H, tol } = opts;
  const nMax = opts.nMax ?? 8;
  const sampleCap = opts.sampleCap ?? 64;
  const zJumps = opts.zJumps ?? [];
  const thJumps = opts.thJumps ?? [];
  const padTheta = opts.padTheta ?? 4 * S29_DTHETA_MAX;
  const padZ = opts.padZ ?? 4 * S29_DZ_MAX;
  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);
  let cost = 0;
  let worstDTheta = 0; let worstDz = 0;

  // The seed window is the facet's own (theta,z) footprint, padded. A facet is a patch of a surface mesh;
  // its perpendicular foot is in or beside its own footprint, and seeding THERE at the registered pitch is
  // both cheaper and strictly finer than the 180x120 global default D2 refuted.
  const ths = [Math.atan2(ay, ax), Math.atan2(by, bx), Math.atan2(cy, cx)];
  // unwrap across the branch cut so a facet straddling theta=PI does not get a 2*PI-wide window
  for (let i = 1; i < 3; i += 1) {
    while (ths[i] - ths[0] > Math.PI) ths[i] -= TWO_PI;
    while (ths[i] - ths[0] < -Math.PI) ths[i] += TWO_PI;
  }
  const win: SeedWindow = {
    th0: Math.min(...ths) - padTheta, th1: Math.max(...ths) + padTheta,
    z0: Math.min(az, bz, cz) - padZ, z1: Math.max(az, bz, cz) + padZ,
  };

  const rad = (px: number, py: number, pz: number): number => { cost += 1; return distRadial(rA, H, px, py, pz); };

  const tighten = (px: number, py: number, pz: number, radial: number): number => {
    let d = radial;
    // DESCENT FIRST, THEN NEWTON — each for what it is good at. Newton converges to the nearest STATIONARY
    // point: seeded at the radial foot of a facet spanning a ridge, that foot sits ON the crest ~400 um
    // away and Newton polishes a flank solution. The descent's first steps are large; Newton is locally
    // exact. F1 is the standing falsifier for dropping either.
    const seed = distLocal(rA, H, px, py, pz, Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz,
      Math.max(radial, tol), 40, zJumps, thJumps);
    if (seed.d < d) d = seed.d;
    const pol = s29PerpAt(rA, H, px, py, pz, { win, zJumps, thJumps });
    if (pol.d < d) d = pol.d;
    const rp = realisedPitch(pol.grid);
    if (rp.dTheta > worstDTheta) worstDTheta = rp.dTheta;
    if (rp.dz > worstDz) worstDz = rp.dz;
    cost += 40 * 9 + (pol.grid.nu + 1) * (pol.grid.nv + 1) + 4 * 40 * 5;
    for (const zj of zJumps) { const dw = distToZWall(rA, zj, px, py, pz); if (dw < d) d = dw; }
    for (const tj of thJumps) { const dw = distToThetaWall(rA, tj, px, py, pz, H); if (dw < d) d = dw; }
    return d;
  };

  if (!(cov > 0)) {
    const d = tighten(ax, ay, az, rad(ax, ay, az));
    return { witnessed: d, bound: d, n: 0, samples: 1, cost, worstDTheta, worstDz };
  }

  let n = Math.min(nMax, Math.max(2, Math.ceil(cov / tol)));
  if (Number.isFinite(sampleCap)) {
    const nCap = Math.max(2, Math.floor((Math.sqrt(8 * sampleCap + 1) - 3) / 2));
    n = Math.min(n, nCap);
  }
  const rho = cov / n;
  // THE BAR ITSELF IS THE THRESHOLD, and the argument is exact: radial >= perpendicular pointwise, so a
  // point at or below `tol` radially cannot lift the perpendicular max above `tol`.
  const thresh = tol;
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
      const d = rad(px, py, pz);
      if (d > cheapMax) { cheapMax = d; cmx = px; cmy = py; cmz = pz; }
      if (d > thresh) anyAbove = true;
    }
  }
  if (!anyAbove) {
    const w = tighten(cmx, cmy, cmz, cheapMax);
    return { witnessed: w, bound: cheapMax + rho, n, samples: L, cost, worstDTheta, worstDz };
  }

  // ── PASS 2 — resolve only what can block the verdict.
  let best = 0;
  for (let i = 0; i <= n; i += 1) {
    const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
    for (let j = 0; j <= n - i; j += 1) {
      const px = rx + ubx * j; const py = ry + uby * j; const pz = rz + ubz * j;
      const d0 = rad(px, py, pz);
      const d = d0 > thresh ? tighten(px, py, pz, d0) : d0;
      if (d > best) best = d;
    }
  }
  return { witnessed: best, bound: best + rho, n, samples: L * 2, cost, worstDTheta, worstDz };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// VALIDATION — RUN THIS BEFORE WIRING ANYTHING TO THIS FILE.
//   npx tsx research/tools/s29Perp.ts --validate
// V8/V9/V10 are `_strataFacetTruthValidate.test.ts`'s own fixtures with its own published expectations.
// F1/F2 are the EXPECT-NONZERO falsifiers: they MUST fail bars the registered ruler passes.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

const FH = 120;
const R0 = 45;
const cylinder: RadiusFn = () => R0;
function ridged(thc: number, half: number, amp: number): RadiusFn {
  return (th: number) => {
    let d = th - thc;
    while (d > Math.PI) d -= TWO_PI;
    while (d < -Math.PI) d += TWO_PI;
    const a = Math.abs(d);
    return a >= half ? R0 : R0 + amp * (1 - a / half);
  };
}

function validate(): number {
  let fails = 0;
  const ok = (pass: boolean, label: string, detail: string): void => {
    if (!pass) fails += 1;
    // eslint-disable-next-line no-console
    console.log(`  ${pass ? 'PASS' : '**FAIL**'}  ${label}  ${detail}`);
  };

  // eslint-disable-next-line no-console
  console.log('=== S29 PERPENDICULAR RULER — TRANSCRIPTION VALIDATION ===');
  // eslint-disable-next-line no-console
  console.log(`REGISTERED SEED PITCH: dTheta <= ${S29_DTHETA_MAX.toExponential(4)} rad`
    + `  dz <= ${S29_DZ_MAX} mm  floor ${S29_SEED_FLOOR}x${S29_SEED_FLOOR}`);
  const gFull = seedGrid(FH, null);
  const pFull = realisedPitch(gFull);
  // eslint-disable-next-line no-console
  console.log(`full-domain grid: ${gFull.nu} x ${gFull.nv}`
    + `  realised dTheta ${pFull.dTheta.toExponential(4)}  dz ${pFull.dz}`);
  ok(pFull.dTheta <= S29_DTHETA_MAX + 1e-15 && pFull.dz <= S29_DZ_MAX + 1e-15,
    'P0 registered pitch honoured', `${gFull.nu}x${gFull.nv}`);

  // ── V8 — cylinder, closed form |r-R|, ortho < 3e-7 (the handoff's own bar).
  // eslint-disable-next-line no-console
  console.log('\nV8 cylinder — d must equal the offset exactly; the foot must be perpendicular');
  for (const off of [0.4, 0.05, 0.004]) {
    const rp = R0 - off; const th = 1.1; const z = 47;
    const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
    const r = s29PerpAt(cylinder, FH, p[0], p[1], p[2]);
    ok(Math.abs(r.d - off) < 1e-7 && r.ortho < 3e-7, `V8 offset ${(off * 1000).toFixed(0)} um`,
      `d ${(r.d * 1000).toFixed(6)} um (want ${(off * 1000).toFixed(3)})  ortho ${r.ortho.toExponential(2)}  iters ${r.iters}`);
  }

  // ── V9 — cone, closed form gap*cos(slope). 294.174 / 268.328 / 212.132 um.
  // eslint-disable-next-line no-console
  console.log('\nV9 sloped cone — radial over-states; perpendicular must read gap*cos(slope)');
  for (const k of [0.2, 0.5, 1.0]) {
    const cone: RadiusFn = (_th, z) => R0 + k * z;
    const th = 0.7; const z = 50; const gap = 0.3;
    const rp = cone(th, z) - gap;
    const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
    const radial = distRadial(cone, FH, p[0], p[1], p[2]);
    const perp = s29PerpAt(cone, FH, p[0], p[1], p[2]);
    const expected = gap / Math.sqrt(1 + k * k);
    ok(Math.abs(perp.d - expected) / expected < 1e-4 && perp.ortho < 1e-5 && radial / perp.d > 1.0,
      `V9 k=${k}`,
      `perp ${(perp.d * 1000).toFixed(3)} um (want ${(expected * 1000).toFixed(3)})  radial ${(radial * 1000).toFixed(3)}  ortho ${perp.ortho.toExponential(2)}`);
  }

  // ── V10 — perpendicular <= radial always, on a feature-bearing surface.
  // eslint-disable-next-line no-console
  console.log('\nV10 ridged surface — perpendicular <= radial is structural; any violation is a solver bug');
  {
    const rA = ridged(1.9, 0.02 / R0, 0.4);
    let worstRatio = 0; let maxOrtho = 0; let viol = 0;
    for (let i = 0; i < 40; i += 1) {
      const th = 1.9 + (i - 20) * 0.0008;
      const z = 40 + i * 0.7;
      const rp = rA(th, z) - 0.05;
      const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
      const radial = distRadial(rA, FH, p[0], p[1], p[2]);
      const perp = s29PerpAt(rA, FH, p[0], p[1], p[2],
        { win: { th0: th - 0.05, th1: th + 0.05, z0: z - 2, z1: z + 2 } });
      if (perp.d > radial + 1e-9) viol += 1;
      worstRatio = Math.max(worstRatio, radial / Math.max(perp.d, 1e-12));
      maxOrtho = Math.max(maxOrtho, perp.ortho);
    }
    ok(viol === 0 && worstRatio > 1.0, 'V10 perp <= radial, 40 probes',
      `violations ${viol}  worst radial/perp ${worstRatio.toFixed(3)}x  worst ortho ${maxOrtho.toExponential(2)}`);
  }

  // ── THE WINDOWED PATH IS THE DRIVER'S PATH. It must agree with the full-domain path on the same fixtures,
  //    or the thing validated above is not the thing that will run.
  // eslint-disable-next-line no-console
  console.log('\nW1 windowed seeding (THE DRIVER\'S ACTUAL PATH) must agree with full-domain seeding');
  {
    let worst = 0;
    for (const k of [0.2, 0.5, 1.0]) {
      const cone: RadiusFn = (_th, z) => R0 + k * z;
      const th = 0.7; const z = 50; const gap = 0.3;
      const rp = cone(th, z) - gap;
      const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
      const full = s29PerpAt(cone, FH, p[0], p[1], p[2]);
      const wind = s29PerpAt(cone, FH, p[0], p[1], p[2],
        { win: { th0: th - 0.01, th1: th + 0.01, z0: z - 0.5, z1: z + 0.5 } });
      worst = Math.max(worst, Math.abs(full.d - wind.d) / full.d);
    }
    ok(worst < 1e-9, 'W1 windowed == full-domain', `worst relative disagreement ${worst.toExponential(2)}`);
  }

  // ── F1 — EXPECT-NONZERO. A DELIBERATELY MIS-SEEDED RULER MUST FAIL WHERE THE REGISTERED ONE PASSES.
  //    This reproduces D2's own finding: a coarse sweep + no descent lands Newton in the wrong well on a
  //    facet spanning a narrow ridge, and the reading OVER-STATES by orders of magnitude.
  // eslint-disable-next-line no-console
  console.log('\nF1 FALSIFIER — mis-seeded ruler (180x120, descent OFF) MUST over-state on a thin ridge');
  {
    const halfUm = 8;
    const rA = ridged(0.5, halfUm / 1000 / R0, 0.4);
    // a point just OUTSIDE the ridge's angular half-width, level with the crest: its true nearest surface
    // point is the base cylinder a few um sideways; the radial foot is ~400 um away on the crest.
    const th = 0.5 + (halfUm / 1000 / R0) * 1.5;
    const z = 60;
    const rp = R0 + 0.4;
    const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
    const good = s29PerpAt(rA, FH, p[0], p[1], p[2],
      { win: { th0: th - 0.01, th1: th + 0.01, z0: z - 1, z1: z + 1 } });
    const bad = s29PerpAt(rA, FH, p[0], p[1], p[2],
      { forceGrid: { nu: 180, nv: 120 }, noDescent: true });
    const ratio = bad.d / Math.max(good.d, 1e-12);
    ok(ratio > 5.0, 'F1 mis-seeded ruler over-states >= 5x',
      `registered ${(good.d * 1000).toFixed(3)} um vs mis-seeded ${(bad.d * 1000).toFixed(3)} um = x${ratio.toFixed(1)}`);
    ok(bad.d >= good.d - 1e-12, 'F1 mis-seed direction is OVER-statement (min over fewer seeds)',
      `bad ${(bad.d * 1000).toFixed(3)} >= good ${(good.d * 1000).toFixed(3)}`);
  }

  // ── F2 — EXPECT-NONZERO. A DELIBERATELY BROKEN NEWTON MUST FAIL A BAR THE REAL ONE PASSES.
  //
  // *** AND THE FIRST THING THIS FALSIFIER MEASURED IS THAT **V8 CANNOT BE THAT BAR**. *** Aimed at V8, a
  // sign-broken frame passed all three offsets. The reason is structural and the V8 fixture says so in its
  // own words — "this is the case that CANNOT distinguish the two rulers": on a cylinder the radial foot
  // ALREADY IS the perpendicular foot, so the seed satisfies the orthogonality system exactly, Newton has
  // nothing to do, and `best` returns the seed however broken the Jacobian is. V8 tests ACCURACY and the
  // self-reported orthogonality. IT DOES NOT TEST THE SOLVER. V9 does — on a slope the radial foot is
  // 300.000 um and the answer is 294.174 um, so the reading is only reachable BY SOLVING.
  // Recorded rather than quietly re-aimed: a bar that cannot fail is exactly what this arm refuses to ship.
  // eslint-disable-next-line no-console
  console.log('\nF2 FALSIFIER — a radial-degenerate Newton frame MUST fail the V9 bar the real one passes');
  {
    // isolate Newton: coarse grid, descent OFF, one well. The registered solver must STILL pass here — that
    // is the control that makes the broken arm's failure attributable to the break and not to the seeding.
    const iso = { forceGrid: { nu: 4, nv: 4 }, noDescent: true, nWells: 1 as number };
    let goodPass = 0; let brokenFails = 0;
    const detail: string[] = [];
    for (const k of [0.2, 0.5, 1.0]) {
      const cone: RadiusFn = (_th, z) => R0 + k * z;
      const th = 0.7; const z = 50; const gap = 0.3;
      const rp = cone(th, z) - gap;
      const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
      const expected = gap / Math.sqrt(1 + k * k);
      const good = s29PerpAt(cone, FH, p[0], p[1], p[2], { ...iso });
      const bad = s29PerpAt(cone, FH, p[0], p[1], p[2], { ...iso, brokenFrame: true });
      if (Math.abs(good.d - expected) / expected < 1e-4) goodPass += 1;
      if (!(Math.abs(bad.d - expected) / expected < 1e-4)) brokenFails += 1;
      detail.push(`k=${k}: ok ${(good.d * 1000).toFixed(3)} / broken ${(bad.d * 1000).toFixed(3)} / want ${(expected * 1000).toFixed(3)}`);
    }
    ok(goodPass === 3, 'F2 control — the REAL solver passes the isolated V9 bar', detail.join('  |  '));
    ok(brokenFails > 0, 'F2 broken solver FAILS that same bar', `${brokenFails} of 3 slopes fail — the bar has teeth`);
  }

  // ── F3 — EXPECT-NONZERO on the ACCEPT PATH ITSELF, not just on the point ruler. A facet whose true
  //    perpendicular error is well over the bar must be REJECTED, and one well under it must be ACCEPTED.
  // eslint-disable-next-line no-console
  console.log('\nF3 FALSIFIER — the accept decision must go BOTH ways on geometry of known error');
  {
    const bar = 0.01; // 10 um, the registered accept bar
    const mk = (dth: number): S29FacetReading => {
      const zA = 40; const zB = 40 + 45 * dth; const t0 = 1.0;
      return s29PerpTriangle(cylinder,
        R0 * Math.cos(t0), R0 * Math.sin(t0), zA,
        R0 * Math.cos(t0 + dth), R0 * Math.sin(t0 + dth), zA,
        R0 * Math.cos(t0 + dth / 2), R0 * Math.sin(t0 + dth / 2), zB,
        { H: FH, tol: bar });
    };
    // sagitta = R(1-cos(dth/2)): dth 0.06 -> 20.25 um (REJECT), dth 0.02 -> 2.25 um (ACCEPT)
    const coarse = mk(0.06); const fine = mk(0.02);
    ok(coarse.witnessed > bar, 'F3 a 20.25 um-sagitta facet is REJECTED',
      `witnessed ${(coarse.witnessed * 1000).toFixed(3)} um > bar ${bar * 1000} um  cost ${coarse.cost}`);
    ok(fine.witnessed <= bar, 'F3 a 2.25 um-sagitta facet is ACCEPTED',
      `witnessed ${(fine.witnessed * 1000).toFixed(3)} um <= bar ${bar * 1000} um  cost ${fine.cost}`);
  }

  // ── T1 — the triangle-level accept quantity, on geometry whose answer is known.
  // eslint-disable-next-line no-console
  console.log('\nT1 s29PerpTriangle — the accept quantity itself, on a chord of known sagitta');
  {
    // A chord across the cylinder subtending dth has sagitta R(1-cos(dth/2)). Put a flat triangle on two
    // surface points and check the reading recovers it.
    const dth = 0.02;
    const zA = 40; const zB = 40.5;
    const t0 = 1.0;
    const va: [number, number, number] = [R0 * Math.cos(t0), R0 * Math.sin(t0), zA];
    const vb: [number, number, number] = [R0 * Math.cos(t0 + dth), R0 * Math.sin(t0 + dth), zA];
    const vc: [number, number, number] = [R0 * Math.cos(t0 + dth / 2), R0 * Math.sin(t0 + dth / 2), zB];
    const sag = R0 * (1 - Math.cos(dth / 2));
    const r = s29PerpTriangle(cylinder, va[0], va[1], va[2], vb[0], vb[1], vb[2], vc[0], vc[1], vc[2],
      { H: FH, tol: 0.01 });
    ok(r.witnessed <= sag + 1e-6 && r.witnessed > sag * 0.4 && r.bound >= r.witnessed,
      'T1 chord sagitta recovered', `witnessed ${(r.witnessed * 1000).toFixed(3)} um vs exact sagitta `
      + `${(sag * 1000).toFixed(3)} um  bound ${(r.bound * 1000).toFixed(3)} (REPORTED ONLY, see the note `
      + `on \`witnessed\`)  n ${r.n}  cost ${r.cost}`);
    ok(r.worstDTheta <= S29_DTHETA_MAX + 1e-15 && r.worstDz <= S29_DZ_MAX + 1e-15,
      'T1 realised seed pitch within the registration',
      `dTheta ${r.worstDTheta.toExponential(4)}  dz ${r.worstDz.toExponential(4)}`);
  }

  // eslint-disable-next-line no-console
  console.log(`\n=== ${fails === 0 ? 'ALL BARS PASS' : `*** ${fails} BAR(S) FAILED ***`} ===`);
  return fails;
}

const argv = typeof process !== 'undefined' ? process.argv.slice(2) : [];
if (argv.includes('--validate')) {
  const f = validate();
  process.exit(f === 0 ? 0 : 1);
}

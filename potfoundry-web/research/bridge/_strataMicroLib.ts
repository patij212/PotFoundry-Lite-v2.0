/**
 * _strataMicroLib.ts — the measurement core of the STRATA fundamental-domain probe.
 *
 * Extracted VERBATIM from `_strataMicro.test.ts` so the single-style deep probe and the 20-style sweep
 * (`_strataMicroSweep.test.ts`) run ONE implementation rather than two that must be kept in sync. Every
 * ruler here is the driver's own extracted kernel imported read-only — `edgeSagRaw`/`locateKinkRaw` from
 * `_sweepPredicate`, `sagAdaptiveRaw` from `_sagKernel`, `aspect3`/`chordParam` from `_shapeGuard` — so
 * there is no transcription to drift.
 *
 * The two controls that make anything here quotable, and both have already caught real errors:
 *   T0  mesh vertices must lie on the rA this file evaluates (they were lifted onto it by construction).
 *   CTL brute-force distance must read ~0 under a point known to be ON the surface.
 * A probe that fails either is measuring a different surface, or cannot find the one it has.
 */
import { certifyTriangle, type RadiusFn } from './_facetTruthLib';
import { edgeSagRaw, locateKinkRaw, canonTheta, dThRaw, type SweepPredConst } from './_sweepPredicate';
import { sagAdaptiveRaw, type SagMesh, type SagArgmax } from './_sagKernel';
import { aspect3, chordParam } from './_shapeGuard';

export const TWO_PI = Math.PI * 2;

export interface Tri {
  x: [number, number, number]; y: [number, number, number]; z: [number, number, number];
  th: [number, number, number];
}

/**
 * ═══ THE PRODUCTION ACCEPT QUANTITY. `sagAdaptive`, NOT `edgeSag`. ═══
 *
 * READ THE RUN HEADER BEFORE CHOOSING A RULER — this probe got it wrong once and the correction is the
 * reason the file says so here. `_S24i2`'s own report line 4 reads:
 *     `rank/accept: PF_CB_RANK=plane — sagAdaptive: INFINITE-PLANE distance, absolute pitch 0.03mm,
 *      n in [12,64]   acceptTol 3.500 um`
 * The HEAP driver — the default, and the one that built every production mesh in this campaign — accepts
 * in `consider()` on `sagAdaptive(t, REF_HS, REF_NMIN, REF_NMAX)` against `localAcceptTol(t)`.
 * `edgeSag`/`triangleNeed` is the SWEEP driver's predicate and is INERT under `PF_CB_DRIVER=heap`.
 *
 * `localAcceptTol` can only TIGHTEN below `acceptTol` (the PF_CB_TIGHTEN field), so testing against the
 * bare 3.5 um is the LOOSEST possible bar: a facet reading under it was accepted under every field.
 *
 * Built on the driver's own extracted kernel `sagAdaptiveRaw` — including the operand order inside
 * `Math.max`, which is what fixes the lattice level `n` — via a one-triangle `SagMesh`.
 */
export function driverAcceptQuantity(
  R: RadiusFn, t: Tri, hSample: number, nMin: number, nMax: number, arg: SagArgmax,
): number {
  const M: SagMesh = {
    ta: [0], tb: [1], tc: [2],
    vth: t.th, vz: t.z, vx: t.x, vy: t.y,
  };
  return sagAdaptiveRaw(R, M, 0, hSample, nMin, nMax, arg);
}

/**
 * The SWEEP driver's predicate, reported as a SECONDARY column only. Kept because the two rulers
 * disagreeing on the same facet is itself a measurement, and because a future sweep-driver arm would be
 * accepted on this one.
 */
export function edgeAcceptQuantity(R: RadiusFn, t: Tri, K: SweepPredConst): number {
  let worst = 0;
  for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
    const s = edgeSagRaw(
      R, t.x[i], t.y[i], t.z[i], t.x[j], t.y[j], t.z[j],
      t.th[i], dThRaw(t.th[i], t.th[j]), K,
    );
    if (s > worst) worst = s;
  }
  return worst;
}

/** Lift a (theta,z) parameter pair onto the surface — the driver's `liftAt`, verbatim in form. */
export function lift(R: RadiusFn, th: number, z: number): { x: number; y: number; z: number } {
  const theta = canonTheta(th);
  const r = R(theta, z);
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), z };
}

export const edgeLen = (t: Tri, i: number): number => {
  const j = (i + 1) % 3;
  return Math.hypot(t.x[j] - t.x[i], t.y[j] - t.y[i], t.z[j] - t.z[i]);
};

/** Longest 3-D edge index of a triangle. */
export function longestEdge(t: Tri): 0 | 1 | 2 {
  let b: 0 | 1 | 2 = 0;
  if (edgeLen(t, 1) > edgeLen(t, b)) b = 1;
  if (edgeLen(t, 2) > edgeLen(t, b)) b = 2;
  return b;
}

/** Split edge `i` of `t` at edge-parameter `s`, lifting the new vertex onto the surface. */
export function splitAt(R: RadiusFn, t: Tri, i: number, s: number): [Tri, Tri] {
  const j = (i + 1) % 3; const k = (i + 2) % 3;
  const thM = t.th[i] + dThRaw(t.th[i], t.th[j]) * s;
  const zM = t.z[i] + (t.z[j] - t.z[i]) * s;
  const m = lift(R, thM, zM);
  const A: Tri = { x: [t.x[i], m.x, t.x[k]], y: [t.y[i], m.y, t.y[k]], z: [t.z[i], m.z, t.z[k]], th: [t.th[i], thM, t.th[k]] };
  const B: Tri = { x: [m.x, t.x[j], t.x[k]], y: [m.y, t.y[j], t.y[k]], z: [m.z, t.z[j], t.z[k]], th: [thM, t.th[j], t.th[k]] };
  return [A, B];
}

export type PlacePolicy = 'param' | 'driver';

/**
 * THE DRIVER'S OWN REFINEMENT DECISION, replicated from `refineDirected` + `splitEdge` + `placeAt`.
 *
 *   'param'   CONTROL ARM. Longest 3-D edge, PARAMETRIC midpoint. The naive bisection — kept so the
 *             driver arm's result can be read against something, because an aspect-ratio explosion under
 *             a naive rule proves nothing about the driver's.
 *   'driver'  DIRECTED edge choice (max `edgeSag` among edges passing `ls[e]*AR >= lMax`), then S4
 *             LONGFALL (prefer the longest edge when the max-sag edge's mid-chord split is the one that
 *             violates the cap), then placement by S3 MID3D `chordParam` — or, when the chosen edge
 *             carries a located kink inside the SNAP band, ON the kink, which is what SNAP exists to do.
 *
 * SCOPE LIMIT, STATED NOT HIDDEN: this sees ONE side of the edge. The real `shapeAdmits` scores the
 * children on BOTH incident triangles, so any refusal counted here is a refusal the real guard also makes,
 * and the real guard makes at least as many. `gateBlocked` is therefore a LOWER bound.
 */
export function driverSplit(
  R: RadiusFn, t: Tri, K: SweepPredConst, arGuard: number, arCap: number, snapAlpha: number,
): { children: [Tri, Tri]; edge: number; placedAt: number; snapped: boolean } {
  const ls = [edgeLen(t, 0), edgeLen(t, 1), edgeLen(t, 2)];
  const lMax = Math.max(ls[0], ls[1], ls[2]);
  const sagOf = (i: number): number => {
    const j = (i + 1) % 3;
    return edgeSagRaw(R, t.x[i], t.y[i], t.z[i], t.x[j], t.y[j], t.z[j], t.th[i], dThRaw(t.th[i], t.th[j]), K);
  };
  const cands: number[] = [];
  for (let e = 0; e < 3; e += 1) if (ls[e] * arGuard >= lMax) cands.push(e);
  if (cands.length === 0) for (let e = 0; e < 3; e += 1) cands.push(e);
  cands.sort((a, b) => sagOf(b) - sagOf(a));
  // S3 MID3D: the parameter whose LIFTED point sits at 3-D chord fraction 0.5.
  const mid3d = (i: number): number => {
    const j = (i + 1) % 3;
    const s = chordParam(
      (u: number) => {
        const th = t.th[i] + dThRaw(t.th[i], t.th[j]) * u;
        const z = t.z[i] + (t.z[j] - t.z[i]) * u;
        const p = lift(R, th, z);
        return { x: p.x, y: p.y, z: p.z, th: canonTheta(th) };
      },
      t.x[i], t.y[i], t.z[i], t.x[j], t.y[j], t.z[j], 0.5, 24,
    );
    return Math.abs(s - 0.5) <= 0.25 ? s : (s > 0.5 ? 0.75 : 0.25);
  };
  const arOfPair = (i: number, s: number): number => {
    const [p, q] = splitAt(R, t, i, s);
    return Math.max(arOf(p), arOf(q));
  };
  // S4 LONGFALL: override DIRECTED only when the max-sag edge's BEST placement violates the cap and the
  // longest edge's does not — Rivara's pair of hypotheses, recovered exactly where they are needed.
  let edge = cands[0];
  if (cands.length > 1) {
    const eL = longestEdge(t);
    if (edge !== eL && arOfPair(edge, mid3d(edge)) > arCap && arOfPair(eL, mid3d(eL)) <= arCap) edge = eL;
  }
  // SNAP: a located crease inside the band is split ON the crease, not at the midpoint.
  const j = (edge + 1) % 3;
  const kink = K.snap
    ? locateKinkRaw(R, t.th[edge], t.z[edge], t.th[edge] + dThRaw(t.th[edge], t.th[j]), t.z[j], K)
    : null;
  const snapped = kink !== null && kink.t > snapAlpha && kink.t < 1 - snapAlpha;
  const s = snapped ? (kink as { t: number }).t : mid3d(edge);
  return { children: splitAt(R, t, edge, s), edge, placedAt: s, snapped };
}

export const arOf = (t: Tri): number => aspect3(t.x[0], t.y[0], t.z[0], t.x[1], t.y[1], t.z[1], t.x[2], t.y[2], t.z[2]);

export interface CascadeResult {
  depth: number; leaves: number; closed: boolean;
  worstBoundUm: number; worstChildAr: number; gateBlocked: number;
  /** worst certified bound (um) at each level — the convergence evidence, not a summary of it */
  trace: number[];
  snaps: number;
}

/**
 * T2 + T3 — THE COUNTERFACTUAL. Bisect until every descendant CERTIFIES at `tol`, or the depth cap is hit.
 * Reports the depth needed, the leaf count (the triangle price of closing this facet), the worst child
 * aspect ratio produced anywhere in the cascade, and how many of the splits the S1 shape gate would have
 * REFUSED at `arCap`. A facet that closes at small depth with every child under the cap is a facet the
 * mechanism could always have fixed and only the accept test protected.
 */
export function cascade(
  R: RadiusFn, root: Tri, tol: number, maxDepth: number, arCap: number,
  zJumps: readonly number[], thJumps: readonly number[],
  policy: PlacePolicy, K: SweepPredConst, arGuard: number, snapAlpha: number, nMax: number,
): CascadeResult {
  const opts = { H, tol, nMax, zJumps, thJumps };
  const cert = (t: Tri): { bound: number } => certifyTriangle(
    R, t.x[0], t.y[0], t.z[0], t.x[1], t.y[1], t.z[1], t.x[2], t.y[2], t.z[2], opts,
  );
  const split = (t: Tri): { children: [Tri, Tri]; snapped: boolean } => {
    if (policy === 'param') {
      const i = longestEdge(t);
      return { children: splitAt(R, t, i, 0.5), snapped: false };
    }
    const d = driverSplit(R, t, K, arGuard, arCap, snapAlpha);
    return { children: d.children, snapped: d.snapped };
  };
  // Each triangle is certified EXACTLY ONCE, when it enters the frontier: the level carries the bound with
  // the triangle so the split pass never re-measures what the test pass already measured.
  let level: { t: Tri; bound: number }[] = [{ t: root, bound: cert(root).bound }];
  let worstChildAr = arOf(root);
  let gateBlocked = 0; let snaps = 0;
  const trace: number[] = [];
  for (let d = 0; d <= maxDepth; d += 1) {
    let worst = 0;
    let openCount = 0;
    for (const e of level) { if (e.bound > worst) worst = e.bound; if (e.bound > tol) openCount += 1; }
    trace.push(worst * 1000);
    if (openCount === 0) {
      return { depth: d, leaves: level.length, closed: true, worstBoundUm: worst * 1000, worstChildAr, gateBlocked, trace, snaps };
    }
    if (d === maxDepth) {
      return { depth: d, leaves: level.length, closed: false, worstBoundUm: worst * 1000, worstChildAr, gateBlocked, trace, snaps };
    }
    const next: { t: Tri; bound: number }[] = [];
    for (const e of level) {
      if (e.bound <= tol) { next.push(e); continue; }
      const r = split(e.t);
      const [p, q] = r.children;
      if (r.snapped) snaps += 1;
      const ap = arOf(p); const aq = arOf(q);
      if (ap > worstChildAr) worstChildAr = ap;
      if (aq > worstChildAr) worstChildAr = aq;
      if (ap > arCap || aq > arCap) gateBlocked += 1;
      next.push({ t: p, bound: cert(p).bound }, { t: q, bound: cert(q).bound });
    }
    level = next;
  }
  return { depth: maxDepth, leaves: level.length, closed: false, worstBoundUm: 0, worstChildAr, gateBlocked, trace, snaps };
}

/**
 * ═══ T4 — THE SURFACE PROBE. THE ONE MEASUREMENT THAT NEEDS NO MESHER AT ALL. ═══
 *
 * Every other test in this file asks what a REFINER would do, and therefore inherits that refiner's bugs
 * (this probe already shipped one: a cascade that oscillates with period 2 because it re-snaps the same
 * locus). This one asks only what the SURFACE is, inside the footprint of a facet that is known to be
 * wrong, and it is the definite-cause test:
 *
 *   1. Find WHERE on the facet the error actually lives — dense barycentric lattice, distance to the
 *      facet's own plane, argmax recorded in barycentric coordinates. Interior, edge, or vertex.
 *   2. Classify the surface AT that point by SCALE INVARIANCE of its own directional second difference,
 *      which is the campaign's own detector (`_strataCreaseDetect`: smooth ~h^2, crease ~h^1, jump ~h^0),
 *      measured in PHYSICAL mm steps so theta and z are comparable.
 *
 * The classification decides the cause and nothing else does:
 *   SMOOTH  D2 falls ~4x per halving  -> ordinary under-resolution. Density closes it. The refiner's
 *                                       accept test is the only thing that let it survive.
 *   CREASE  D2 falls ~2x per halving  -> a C1 kink. Density closes it too, but slowly, and placement ON
 *                                       the crease closes it fast. This is what SNAP is for.
 *   JUMP    D2 flat                   -> C0. No flat triangle chords it at any density. Needs a curtain.
 */
export interface SurfaceProbe {
  maxDevUm: number;
  atBary: [number, number, number];
  onEdge: boolean; nearVertex: boolean;
  theta: number; z: number;
  d2: number[];      // second difference at h, h/2, h/4, h/8 (um), best over directions
  ratios: number[];  // successive fall factors
  cls: 'SMOOTH' | 'CREASE' | 'JUMP' | 'MIXED';
}

export function probeSurface(R: RadiusFn, t: Tri, n: number, h0: number): SurfaceProbe {
  // facet plane
  const ax = t.x[0]; const ay = t.y[0]; const az = t.z[0];
  let nx = (t.y[1] - ay) * (t.z[2] - az) - (t.z[1] - az) * (t.y[2] - ay);
  let ny = (t.z[1] - az) * (t.x[2] - ax) - (t.x[1] - ax) * (t.z[2] - az);
  let nz = (t.x[1] - ax) * (t.y[2] - ay) - (t.y[1] - ay) * (t.x[2] - ax);
  const nl = Math.hypot(nx, ny, nz);
  nx /= nl; ny /= nl; nz /= nl;
  const dB = dThRaw(t.th[0], t.th[1]); const dC = dThRaw(t.th[0], t.th[2]);
  let best = 0; let bw: [number, number, number] = [1, 0, 0]; let bth = t.th[0]; let bz = t.z[0];
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n - i; j += 1) {
      const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
      const theta = t.th[0] + wb * dB + wc * dC;
      const z = wa * t.z[0] + wb * t.z[1] + wc * t.z[2];
      const r = R(canonTheta(theta), z);
      const d = Math.abs((r * Math.cos(theta) - ax) * nx + (r * Math.sin(theta) - ay) * ny + (z - az) * nz);
      if (d > best) { best = d; bw = [wa, wb, wc]; bth = theta; bz = z; }
    }
  }
  // scale-invariance of the directional 2nd difference, in PHYSICAL mm steps (arc length = r*dtheta)
  const r0 = R(canonTheta(bth), bz);
  const dirs: [number, number][] = [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]];
  const d2: number[] = []; const hs = [h0, h0 / 2, h0 / 4, h0 / 8];
  for (const h of hs) {
    let worst = 0;
    for (const [u, v] of dirs) {
      const dth = (u * h) / Math.max(r0, 1e-9); const dz = v * h;
      const rp = R(canonTheta(bth + dth), bz + dz);
      const rm = R(canonTheta(bth - dth), bz - dz);
      const val = Math.abs(rp - 2 * r0 + rm);
      if (val > worst) worst = val;
    }
    d2.push(worst * 1000);
  }
  const ratios = [d2[0] / Math.max(d2[1], 1e-12), d2[1] / Math.max(d2[2], 1e-12), d2[2] / Math.max(d2[3], 1e-12)];
  // classify on the MEDIAN fall factor: ~4 smooth (h^2), ~2 crease (h^1), ~1 flat (h^0)
  const med = [...ratios].sort((a, b) => a - b)[1];
  const cls: SurfaceProbe['cls'] = med >= 3.0 ? 'SMOOTH' : med >= 1.5 ? 'CREASE' : med >= 0.8 ? 'JUMP' : 'MIXED';
  const eps = 1e-9;
  const onEdge = bw[0] < eps || bw[1] < eps || bw[2] < eps;
  const nearVertex = Math.max(bw[0], bw[1], bw[2]) > 1 - 1 / n;
  return { maxDevUm: best * 1000, atBary: bw, onEdge, nearVertex, theta: bth, z: bz, d2, ratios, cls };
}

/**
 * ═══ T5 — THE ADJUDICATOR. BRUTE FORCE, NO SEEDING GRID, NO DESCENT, NO WELL TO GET WRONG. ═══
 *
 * WHY THIS EXISTS, AND IT IS NOT OPTIONAL. T4 measures the facet's departure from its own plane and reads
 * 2.35 um on a facet `certifyTriangle` certifies at 125.26 um — a 55x disagreement between two instruments
 * on ONE facet. Exactly one of these is true and the campaign's whole residual count turns on which:
 *   (A) the plane ruler is BLIND — the surface really is 125 um from part of that triangle; or
 *   (B) `certifyTriangle` OVER-STATES — Phase D named this as a live standing defect, measuring `distPerp`'s
 *       default nu=180/nv=120 seeding grid over-stating by 30.902 um at tri 690730, and flagged EVERY H1
 *       witnessed figure in the series as affected.
 * Asserting either without measuring is how this campaign has burned arms before. So: take the witness
 * point `certifyTriangle` itself returns, and compute dist(p, S) by exhaustive search over (theta, z) —
 * coarse GLOBAL lattice first (the 2026-07-29 adjudication found globalisation moved big facets by ~320 um,
 * so a local-only answer is wrong in the LARGE direction), then four rounds of window refinement.
 *
 * No derivative, no seed, no basin choice. The only error is the lattice pitch, and that is reported.
 */
export function bruteDist(
  R: RadiusFn, px: number, py: number, pz: number, H: number, nTh: number, nZ: number, rounds: number,
  nRef = 32, nStart = 8, useGlobal = true,
): { d: number; th: number; z: number; pitchUm: number } {
  // ── ROUND 0: the GLOBAL scan, and it keeps the best `nStart` SEPARATED cells, not just the best one.
  // A single-start nested search was tried first and the on-surface CONTROL failed it at 14.57 um: this
  // surface has many near-competitive basins (12 arches x ribs), so the globally-best coarse SAMPLE is
  // routinely in a different basin from the true nearest POINT, and a trust region around it converges
  // to the wrong well. Multi-start fixes the mechanism rather than widening the region until it hides.
  const dTh0 = TWO_PI / nTh; const dZ0 = H / nZ;
  // SEED 0 — THE POINT'S OWN PROJECTION. For a point ON the surface this is the exact answer, which is
  // why the on-surface control failed without it: a trust region that shrinks around the globally-best
  // SAMPLE cannot travel to the true minimum when it starts more than two cells away, and near a steep
  // rib the closest sample and the closest point are routinely in different cells. The global starts
  // below still guard against a genuinely closer basin elsewhere; this one guarantees the local answer.
  const cands: { d: number; th: number; z: number }[] = [];
  {
    const thP = canonTheta(Math.atan2(py, px));
    const zP = Math.min(H, Math.max(0, pz));
    const rP = R(thP, zP);
    cands.push({ d: Math.hypot(rP * Math.cos(thP) - px, rP * Math.sin(thP) - py, zP - pz), th: thP, z: zP });
  }
  for (let i = 0; useGlobal && i <= nTh; i += 1) {
    const th = i * dTh0;
    const ct = Math.cos(th); const st = Math.sin(th);
    for (let j = 0; j <= nZ; j += 1) {
      const z = j * dZ0;
      const r = R(canonTheta(th), z);
      const d = Math.hypot(r * ct - px, r * st - py, z - pz);
      if (cands.length < nStart) { cands.push({ d, th, z }); cands.sort((a, b) => a.d - b.d); } else if (d < cands[cands.length - 1].d) {
        // keep starts SEPARATED: a cell adjacent to an incumbent refines to the same basin, so it replaces
        // that incumbent rather than consuming another slot.
        let repl = -1;
        for (let k = 0; k < cands.length; k += 1) {
          if (Math.abs(dThRaw(cands[k].th, th)) <= 3 * dTh0 && Math.abs(cands[k].z - z) <= 3 * dZ0) { repl = k; break; }
        }
        if (repl < 0) repl = cands.length - 1;
        if (d < cands[repl].d) { cands[repl] = { d, th, z }; cands.sort((a, b) => a.d - b.d); }
      }
    }
  }
  let bd = Infinity; let bth = 0; let bz = 0; let finePitch = Infinity;
  for (const c of cands) {
    let thLo = c.th - 2 * dTh0; let thHi = c.th + 2 * dTh0;
    let zLo = Math.max(0, c.z - 2 * dZ0); let zHi = Math.min(H, c.z + 2 * dZ0);
    let ld = c.d; let lth = c.th; let lz = c.z; let dTh = dTh0; let dZ = dZ0;
    for (let round = 0; round < rounds; round += 1) {
      dTh = (thHi - thLo) / nRef; dZ = (zHi - zLo) / nRef;
      for (let i = 0; i <= nRef; i += 1) {
        const th = thLo + i * dTh;
        const ct = Math.cos(th); const st = Math.sin(th);
        for (let j = 0; j <= nRef; j += 1) {
          const z = zLo + j * dZ;
          const r = R(canonTheta(th), z);
          const d = Math.hypot(r * ct - px, r * st - py, z - pz);
          if (d < ld) { ld = d; lth = th; lz = z; }
        }
      }
      thLo = lth - 2 * dTh; thHi = lth + 2 * dTh;
      zLo = Math.max(0, lz - 2 * dZ); zHi = Math.min(H, lz + 2 * dZ);
    }
    if (ld < bd) { bd = ld; bth = lth; bz = lz; finePitch = Math.max(dTh * Math.hypot(px, py), dZ); }
  }
  return { d: bd, th: bth, z: bz, pitchUm: finePitch * 1000 };
}


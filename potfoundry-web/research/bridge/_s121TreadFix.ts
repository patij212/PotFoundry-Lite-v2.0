/**
 * _s121TreadFix.ts — S121 FIX 1: the GUARDED tread emitter.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT `stitchRings` ACTUALLY DOES, AND WHY THE PRE-REGISTERED DIAGNOSIS WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * The driver's tread emitter (_strataConformBisectL.test.ts, `stitchRings`) was described as a "greedy
 * angular zip" in which one ring can run ahead of the other. IT IS NOT. Its walk is
 *
 *     while (ia < na || ib < nb)
 *       if (ia < na && (ib >= nb || a[ia].th <= b[ib].th))  emit (a[ia], a[ia+1], b[ib]),  ia += 1
 *       else                                                emit (a[ia], b[ib+1], b[ib]),  ib += 1
 *
 * i.e. a strict θ-MERGE: it always advances whichever ring is BEHIND IN θ. It already zips in the parameter
 * domain, which was S120's proposed remedy (a). Re-writing the choice function therefore cannot help, and
 * this module does not re-write it — the walk below is that walk, verbatim.
 *
 * THE REAL CAUSE, measured on the shipped baseline (research/tools/s121TreadAnatomy.cjs, EXHAUSTIVE, no
 * stride, celtictriquetra_ring_D--H_S102.stl, 1,282,394 facets):
 *
 *     over-cap facets 714 |  dz p50 8.0032e-3 mm |  ALTITUDE p50 8.5608e-3 mm |  dz < 10 µm on 707 of 714
 *     altitude tracks dz on 409, tracks the radial cliff dr on 0
 *
 * THE ALTITUDE IS THE Z-GAP. The driver holds its wall bands off every detected C0 step by
 * `stepEps` = PF_CB_STEP_EPS_UM/1000 = 4 µm on each side, so the two loops handed to the emitter are
 * 2*stepEps = 8 µm apart in z. EVERY triangle that any triangulation of a strip between two polylines can
 * contain has a RING edge as its base and a vertex of the opposite ring as its apex, so
 *
 *     aspect3  ≈  ring chord / strip height
 *
 * and the cap is exceeded for every chord above SHAPE_AR * 8 µm = 0.4 mm. The driver's own ring pitch at
 * r ≈ 48 with PF_CB_GRIDU=200 is 1.51 mm — 3.8x over — and the 707 are precisely the ring edges the
 * refinement loop never happened to split. NO CHOICE FUNCTION FIXES THIS; the strip itself is degenerate.
 * (It is degenerate because `zSteps` is a SCALAR per step: the wall is cut at that z across ALL θ, including
 * the θ where R is smooth in z and the two loops are radially coincident to within microns. There the
 * "tread annulus" has zero width and is nothing but an 8 µm ribbon.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE FIX
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Two things the emitter lacked, and nothing else:
 *
 *   1. STEINER DENSIFICATION. A ring edge is a BOUNDARY edge of the wall, so exactly ONE wall facet
 *      contains it. Shortening it forces that facet to be re-triangulated. The new points are placed
 *      EXACTLY ON the old edge (linear interpolation) — the only placement that (i) leaves the wall SURFACE
 *      bit-identical as a point set, so no fidelity number can move, and (ii) keeps the mesh watertight; a
 *      point lifted onto the true surface would bend the strip away from the wall's own flat facet and open
 *      a crack. With the split points collinear, the ONLY non-degenerate re-triangulation of the owning
 *      facet is a FAN from its opposite vertex (any triangle of three collinear points is degenerate), so
 *      the fan is forced, not chosen.
 *
 *   2. AN ADMISSION TEST. A fan child of a SLIVER parent can itself exceed the cap, so every child is
 *      admitted individually and any refusal is COUNTED. *** A refusal leaves the tread ear over the cap
 *      and is reported as the RESIDUAL. It never leaves a hole: the strip is emitted over whatever ring the
 *      densification reached, so the band always closes. *** Refusing is the correct call, not a cop-out:
 *      the alternative is to emit a NEW over-cap facet in the WALL in order to remove one from the TREAD,
 *      which trades a defect for a defect on the very metric the fix exists to move.
 *
 * TESTABILITY. `rounds: 0` disables densification and the emitter reduces EXACTLY to the baseline walk —
 * same function, same code path, no second transcription to drift. That is the control arm of the unit test
 * (research/bridge/_s121TreadUnit.test.ts) and the reason the control cannot silently diverge from the
 * treatment.
 */

export type P3 = [number, number, number];
export type Tri3 = [P3, P3, P3];

export interface TreadFixOpts {
  /** the driver's own 3-D aspect cap (PF_CB_SHAPE_AR, 50). */
  shapeAR: number;
  /** the driver's position weld radius (PF_CB_WELD_UM/1000); a Steiner point closer than 4x this is refused. */
  weldMm: number;
  /** hard bound on Steiner points per ring edge; a degenerate strip would otherwise ask without limit. */
  maxK: number;
  /** safety factor on the chord bound, so the emitted ear lands strictly under the cap and not on it. */
  safe: number;
  /** densify/re-zip rounds. 0 ⇒ the BASELINE emitter, bit for bit. */
  rounds: number;
  /**
   * How close (as a fraction of the chord bound) an existing node has to be for a mirrored theta to count as
   * ALREADY MATCHED. Swept, not chosen — see the ladder in _s121TreadUnit.test.ts.
   */
  snapFrac: number;
}

export interface TreadFixStats {
  treads: number;
  steiner: number;
  wallExtra: number;
  refWallAR: number;
  refMaxK: number;
  refWeld: number;
  refMulti: number;
  unowned: number;
  /** rounds whose result did not strictly improve and were UNDONE (the monotone guard firing). */
  rolledBack: number;
  /** mirrored theta's that were treated as ALREADY MATCHED rather than inserted (see splitAtTheta). */
  snapped: number;
  rounds: number;
  earsOver: number;
  earsOverArea: number;
  earsOverMax: number;
  wallOver: number;
  wallOverMax: number;
}

export interface TreadFixResult {
  /** the strip facets, in the emitter's own winding. */
  treads: Tri3[];
  /** fan children beyond the first; the first replaced its parent in `wall` in place. */
  wallExtra: Tri3[];
  stats: TreadFixStats;
}

const TWO_PI = 2 * Math.PI;

/** θ of a point, on [0, 2π). Transcribed from the driver's `ang`. */
export const angOf = (p: P3): number => { const a = Math.atan2(p[1], p[0]); return a < 0 ? a + TWO_PI : a; };

/** _shapeGuard.aspect3 on a P3 triple, operand for operand. */
const ar3 = (A: P3, B: P3, C: P3): number => {
  const e0 = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const e1 = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
  const e2 = Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]);
  const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
  const wx = C[0] - A[0]; const wy = C[1] - A[1]; const wz = C[2] - A[2];
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  return (Math.max(e0, e1, e2) * (e0 + e1 + e2)) / (4 * area);
};

const triArea = (A: P3, B: P3, C: P3): number => {
  const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
  const wx = C[0] - A[0]; const wy = C[1] - A[1]; const wz = C[2] - A[2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};

const lerp3 = (A: P3, B: P3, t: number): P3 => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];

const pk = (p: P3): string => `${p[0]},${p[1]},${p[2]}`;
const ekey = (p: P3, q: P3): string => { const a = pk(p); const b = pk(q); return a < b ? `${a}|${b}` : `${b}|${a}`; };

/** facet index, which of its three edges is the ring edge, and the parameters admitted along q_k → q_{k+1}. */
interface Owner { f: number; k: number; params: number[] }

/** one ring, as a θ-ordered node list plus, per SEGMENT, the owning wall edge and the sub-interval of it. */
interface Ring {
  p: P3[];
  th: number[];
  own: Array<Owner | null>;
  t0: number[];
  t1: number[];
  /** true when the ring runs opposite to the owner's stored q_k → q_{k+1} direction. */
  flip: boolean[];
}

/** [side (0 = ring A advanced, 1 = ring B advanced), base segment index on that ring, apex index on the other]. */
type Ear = [number, number, number];

/**
 * THE θ-MERGE WALK, VERBATIM from the driver's `stitchRings`. Returns the ears instead of emitting them so
 * that the same walk can be scored, re-run after densification, and finally emitted — one walk, not three.
 */
const zip = (ra: Ring, rb: Ring): Ear[] => {
  const na = ra.p.length; const nb = rb.p.length;
  const ears: Ear[] = [];
  if (na === 0 || nb === 0) return ears;
  let ia = 0; let ib = 0;
  while (ia < na || ib < nb) {
    const ath = ra.th[ia % na] + (ia >= na ? TWO_PI : 0);
    const bth = rb.th[ib % nb] + (ib >= nb ? TWO_PI : 0);
    if (ia < na && (ib >= nb || ath <= bth)) { ears.push([0, ia % na, ib % nb]); ia += 1; }
    else { ears.push([1, ib % nb, ia % na]); ib += 1; }
  }
  return ears;
};

/** the ear's emitted triple, in `stitchRings`' own vertex order, so the winding is preserved verbatim. */
const earPts = (ra: Ring, rb: Ring, e: Ear): Tri3 => {
  const [side, i, j] = e;
  const X = side === 0 ? ra : rb; const Y = side === 0 ? rb : ra;
  const nx = X.p.length;
  return side === 0
    ? [X.p[i], X.p[(i + 1) % nx], Y.p[j]]
    : [Y.p[j], X.p[(i + 1) % nx], X.p[i]];
};

/** the ear's BASE (the ring edge it stands on) and its APEX on the opposite ring. */
const earBase = (ra: Ring, rb: Ring, e: Ear): Tri3 => {
  const [side, i, j] = e;
  const X = side === 0 ? ra : rb; const Y = side === 0 ? rb : ra;
  return [X.p[i], X.p[(i + 1) % X.p.length], Y.p[j]];
};

/**
 * The guarded tread emitter.
 *
 * `wall` IS MUTATED IN PLACE: an owning facet is replaced by its fan's first child. The remaining children
 * come back in `wallExtra` so the caller decides where they land in its soup ordering.
 */
export function stitchRingsGuarded(wall: Tri3[], stepLoops: Array<[P3[], P3[]]>, o: TreadFixOpts): TreadFixResult {
  const st: TreadFixStats = {
    treads: 0, steiner: 0, wallExtra: 0, refWallAR: 0, refMaxK: 0, refWeld: 0, refMulti: 0,
    unowned: 0, rolledBack: 0, snapped: 0, rounds: 0, earsOver: 0, earsOverArea: 0, earsOverMax: 0, wallOver: 0, wallOverMax: 0,
  };
  const treads: Tri3[] = [];
  const wallExtra: Tri3[] = [];
  if (stepLoops.length === 0) return { treads, wallExtra, stats: st };

  // ── OWNERSHIP. Keying all wall facets by string would allocate ~3 keys per facet; the tread loops' own z
  // values are collected first (2 per step) and a facet is keyed only when at least two of its vertices sit
  // on one of them. That is a pure filter — a facet with fewer than two vertices on a band z cannot contain
  // a ring edge — and it cuts the keyed population by ~200x on a 1.28 M-facet wall.
  const bandZ = new Set<number>();
  for (const [below, above] of stepLoops) {
    for (const p of below) bandZ.add(p[2]);
    for (const p of above) bandZ.add(p[2]);
  }
  const ownerOf = new Map<string, Owner | null>();   // null ⇒ seen twice ⇒ interior, not a boundary edge
  for (let f = 0; f < wall.length; f += 1) {
    const T = wall[f];
    let hits = 0;
    for (let i = 0; i < 3; i += 1) if (bandZ.has(T[i][2])) hits += 1;
    if (hits < 2) continue;
    for (let i = 0; i < 3; i += 1) {
      const A = T[i]; const B = T[(i + 1) % 3];
      if (!bandZ.has(A[2]) || !bandZ.has(B[2]) || A[2] !== B[2]) continue;
      const k = ekey(A, B);
      ownerOf.set(k, ownerOf.has(k) ? null : { f, k: i, params: [] });
    }
  }
  const facetSplitEdge = new Map<number, number>();

  const mkRing = (loop: P3[]): Ring => {
    const ordered = loop.slice().sort((p, q) => angOf(p) - angOf(q));
    const r: Ring = { p: ordered, th: ordered.map(angOf), own: [], t0: [], t1: [], flip: [] };
    for (let i = 0; i < ordered.length; i += 1) {
      const A = ordered[i]; const B = ordered[(i + 1) % ordered.length];
      const own = ownerOf.get(ekey(A, B)) ?? null;
      if (own === null) st.unowned += 1;
      r.own.push(own); r.t0.push(0); r.t1.push(1);
      r.flip.push(own !== null && pk(wall[own.f][own.k]) !== pk(A));
    }
    return r;
  };

  /** the fan the owning facet becomes for a given admitted parameter set, in the FACET'S OWN winding. */
  const fanOf = (own: Owner, params: number[]): Tri3[] => {
    const T = wall[own.f];
    const A = T[own.k]; const B = T[(own.k + 1) % 3]; const C = T[(own.k + 2) % 3];
    const cut = [0, ...params, 1];
    const out: Tri3[] = [];
    for (let i = 0; i + 1 < cut.length; i += 1) {
      out.push([cut[i] === 0 ? A : lerp3(A, B, cut[i]), cut[i + 1] === 1 ? B : lerp3(A, B, cut[i + 1]), C]);
    }
    return out;
  };

  /**
   * THE ADMISSION TEST. Insert a point at local parameter u on ring segment i, or refuse and say why.
   * Four refusals, all counted, none silent: no owning facet, MAXK, weld clearance, and a fan child that
   * would exceed the cap.
   */
  const insertAt = (r: Ring, i: number, u: number): number => {
    const own = r.own[i];
    if (own === null) return Number.NaN;
    if (own.params.length + 1 > o.maxK - 1) { st.refMaxK += 1; return Number.NaN; }
    const prev = facetSplitEdge.get(own.f);
    if (prev !== undefined && prev !== own.k) { st.refMulti += 1; return Number.NaN; }
    const t = r.t0[i] + u * (r.t1[i] - r.t0[i]);
    const tOwn = r.flip[i] ? 1 - t : t;
    const T = wall[own.f]; const A = T[own.k]; const B = T[(own.k + 1) % 3];
    const eLen3 = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    for (const q of [0, 1, ...own.params]) if (Math.abs(q - tOwn) * eLen3 < 4 * o.weldMm) { st.refWeld += 1; return Number.NaN; }
    const trial = [...own.params, tOwn].sort((x, y) => x - y);
    let worst = 0;
    for (const [X, Y, Z] of fanOf(own, trial)) { const a = ar3(X, Y, Z); if (a > worst) worst = a; }
    if (worst > o.shapeAR) { st.refWallAR += 1; return Number.NaN; }
    own.params = trial;
    facetSplitEdge.set(own.f, own.k);
    st.steiner += 1;
    const P = lerp3(A, B, tOwn);
    const th = angOf(P);
    r.p.splice(i + 1, 0, P); r.th.splice(i + 1, 0, th);
    r.own.splice(i + 1, 0, own); r.flip.splice(i + 1, 0, r.flip[i]);
    r.t0.splice(i + 1, 0, t); r.t1.splice(i + 1, 0, r.t1[i]); r.t1[i] = t;
    return th;
  };

  /**
   * *** THE SEAM. *** A closed ring always has exactly one segment that crosses θ = 0, and a point inserted
   * into THAT segment is spliced to the end of the array while its θ is the smallest in it — which leaves
   * the ring no longer θ-sorted, and `zip`'s merge walk then pairs nodes that are nowhere near each other.
   * MEASURED cost of not handling it (unit fixture, mirroring on, this rotation off): 6 residual facets with
   * altitudes of 0.65-3.6 µm — BELOW the 8 µm strip height, which is geometrically impossible for an honest
   * ear and was the tell that the walk had been corrupted rather than merely under-refined. Worst 748.11,
   * i.e. 2.2x WORSE than the control's 333.64. A cyclic shift back to the minimum θ restores the invariant;
   * every array is shifted by the same offset, so the segment metadata stays attached to its own segment.
   */
  const rotateToMin = (r: Ring): void => {
    const n = r.th.length;
    if (n < 2) return;
    let m = 0;
    for (let i = 1; i < n; i += 1) if (r.th[i] < r.th[m]) m = i;
    if (m === 0) return;
    const rot = <T>(a: T[]): T[] => [...a.slice(m), ...a.slice(0, m)];
    r.p = rot(r.p); r.th = rot(r.th); r.own = rot(r.own);
    r.t0 = rot(r.t0); r.t1 = rot(r.t1); r.flip = rot(r.flip);
  };

  /**
   * *** THE PAIRING — the half of the fix that shortening the base ALONE does not give you. ***
   *
   * MEASURED, on the unit fixture (research/bridge/_s121TreadUnit.test.ts), with densification of the base
   * ring only and no pairing:
   *       over-cap COUNT 174 -> 318,  MAX 333.64 -> 1599.31   (area 1.778 -> 0.085 mm2)
   * i.e. the MAX got 4.8x WORSE. The reason is structural, not a tuning miss: the θ-merge walk stands an ear
   * on a base of one ring with its apex on the other, and shortening the base while the OTHER ring keeps its
   * coarse pitch leaves that apex up to a full opposite-pitch away laterally. The sub-ear then has a tiny
   * base and a full-length longest edge, and aspect3 = L*P/(4A) rises exactly as fast as the base falls.
   *
   * So every point inserted on one ring is mirrored onto the other at the SAME θ, and the two rings become
   * a matched quad strip in which every triangle spans one θ interval and its altitude is the strip height.
   * The mirror point is found by intersecting the ray at that θ with the opposite ring's segment — the point
   * therefore lies exactly ON that segment, which is what keeps the wall surface bit-identical and the mesh
   * watertight, and the SAME admission test applies to it.
   */
  const splitAtTheta = (r: Ring, th: number, snapMm: number): number => {
    const n = r.p.length;
    if (n < 2) return Number.NaN;
    for (let i = 0; i < n; i += 1) {
      const t0 = r.th[i];
      const last = i + 1 === n;
      const t1 = last ? r.th[0] + TWO_PI : r.th[i + 1];
      const x = th < t0 ? th + TWO_PI : th;
      if (!(x > t0 && x < t1)) continue;
      const A = r.p[i]; const B = r.p[(i + 1) % n];
      const nx = -Math.sin(th); const ny = Math.cos(th);
      const den = nx * (B[0] - A[0]) + ny * (B[1] - A[1]);
      if (den === 0) return Number.NaN;
      const u = -(nx * A[0] + ny * A[1]) / den;
      if (!(u > 0 && u < 1)) return Number.NaN;
      // *** SNAP RATHER THAN SLIVER, ON AN ABSOLUTE BAR. *** A mirrored theta can land arbitrarily close to
      // a node that is already there; the sub-segment it would create is then arbitrarily short, which is
      // harmless for the strip but makes the owning WALL facet's fan child a sliver, so the admission test
      // refuses it and the pairing silently fails. MEASURED on the unit fixture with no guard at all: 343
      // `wallAR` refusals and 6 residual ears up to AR 748. A RELATIVE bar (a fraction of the segment) is
      // the wrong instrument and was measured to be so - it snaps points that are still far away in mm on a
      // long segment, leaving the apex stranded (9 residual, MAX unchanged at 748). The bar has to be
      // ABSOLUTE and derived from the SAME chord bound the ear is being held to: if a node is already within
      // a quarter of that bound, the apex offset it leaves is inside the bound's own safety factor and the
      // point is genuinely not needed.
      const A0 = r.p[i]; const B0 = r.p[(i + 1) % n];
      const Pc = lerp3(A0, B0, u);
      const dA = Math.hypot(Pc[0] - A0[0], Pc[1] - A0[1], Pc[2] - A0[2]);
      const dB = Math.hypot(Pc[0] - B0[0], Pc[1] - B0[1], Pc[2] - B0[2]);
      if (Math.min(dA, dB) < snapMm) { st.snapped += 1; return Number.NaN; }
      // *** RETREAT, DO NOT GIVE UP. *** The refusal that actually binds here is `wallAR`: the owning wall
      // facet's fan child would be a sliver because the mirrored point lands close to one end of the ring
      // edge. Abandoning the mirror leaves the ear's apex a FULL opposite-pitch away, which is the worst
      // outcome available; walking the point toward the middle of the segment until the wall admits it
      // leaves the apex off by only as much as the WALL's own shape bound requires. Six halvings, so the
      // retreat is bounded and cheap, and it either lands or reports the refusal it already would have.
      let got = insertAt(r, i, u);
      for (let back = 0; back < 6 && !Number.isFinite(got); back += 1) {
        const uu = u + (0.5 - u) * (1 - 0.5 ** (back + 1));
        if (!(uu > 0 && uu < 1)) break;
        got = insertAt(r, i, uu);
      }
      // `splitAtTheta` is called in a loop and each call re-searches, so restoring the ordering here (rather
      // than once at the end) is both safe and necessary: the NEXT call's search depends on it.
      if (Number.isFinite(got)) rotateToMin(r);
      return got;
    }
    return Number.NaN;
  };

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  // *** THE MONOTONE GUARD. THIS IS THE PART THE FIRST DRIVER-SCALE RUN PROVED IS NOT OPTIONAL. ***
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  // MEASURED, CelticTriquetra, driver arm S121_ONOFF, PF_CB_GRIDU=200 / PF_CB_GRIDV=140 / triCap 2.5 M,
  // against the byte-identical control arm (md5 ca7e8bb3..., the published S102 baseline):
  //       over the cap COUNT 714 -> 456      (1.57x BETTER)
  //       over the cap AREA  3.756327 -> 0.230162 mm2   (16.3x BETTER)
  //       worst 3-D AR       190.93 -> 14842.46         (*** 77.7x WORSE ***)
  //   with 10,481 `wallAR` refusals in the run.
  // The unit fixture reached 0/0/0 and DID NOT TRANSFER. The reason is that the driver's real boundary loops
  // carry very unevenly sized edges: a mirrored theta then lands close to an existing node, the owning wall
  // facet's fan child would be a sliver, the admission test refuses it — and the base on the OTHER ring has
  // already been shortened, so that ear is left with a tiny base and an apex a full opposite-pitch away.
  // aspect3 ~ (b+delta)^2 / (b*h) blows up as b falls. The operator was making the headline metric worse in
  // exactly the population it was built to fix.
  //
  // THE GUARD: a round is COMMITTED only if it strictly improves the step's (max, count, area) over the cap,
  // lexicographically; otherwise the state is rolled back to the best seen and the loop stops. Round 0's
  // state is the BASELINE emitter's, so *** THE EMITTED STRIP CAN NEVER BE WORSE THAN THE BASELINE ON ANY OF
  // THE THREE HEADLINE NUMBERS *** — the worst case is that the fix is inert and the control is reproduced.
  // That is a property of the code, not of a tuning constant.
  interface RingSnap { p: P3[]; th: number[]; own: Array<Owner | null>; t0: number[]; t1: number[]; flip: boolean[] }
  const snapRing = (r: Ring): RingSnap => ({
    p: [...r.p], th: [...r.th], own: [...r.own], t0: [...r.t0], t1: [...r.t1], flip: [...r.flip],
  });
  const putRing = (r: Ring, sn: RingSnap): void => {
    r.p = [...sn.p]; r.th = [...sn.th]; r.own = [...sn.own];
    r.t0 = [...sn.t0]; r.t1 = [...sn.t1]; r.flip = [...sn.flip];
  };
  const snapOwners = (): Map<string, number[]> => {
    const m = new Map<string, number[]>();
    for (const [k, ow] of ownerOf) if (ow !== null) m.set(k, [...ow.params]);
    return m;
  };
  const putOwners = (m: Map<string, number[]>): void => {
    for (const [k, ps] of m) { const ow = ownerOf.get(k); if (ow !== null && ow !== undefined) ow.params = [...ps]; }
  };
  /** the step's over-cap triple, from the walk as it stands. Lower is better, lexicographically. */
  const scoreStep = (ra: Ring, rb: Ring): [number, number, number] => {
    let mx = 0; let n = 0; let a = 0;
    for (const e of zip(ra, rb)) {
      const T3 = earPts(ra, rb, e);
      const v = ar3(T3[0], T3[1], T3[2]);
      if (v > o.shapeAR) { n += 1; a += triArea(T3[0], T3[1], T3[2]); if (v > mx) mx = v; }
    }
    return [mx, n, a];
  };
  const better = (x: [number, number, number], y: [number, number, number]): boolean =>
    (x[0] !== y[0] ? x[0] < y[0] : x[1] !== y[1] ? x[1] < y[1] : x[2] < y[2]);

  for (const [below, above] of stepLoops) {
    const ra = mkRing(below); const rb = mkRing(above);
    let bestScore = scoreStep(ra, rb);
    let bestA = snapRing(ra); let bestB = snapRing(rb);
    let bestOwn = snapOwners(); let bestSplitEdge = new Map(facetSplitEdge);
    for (let round = 0; round < o.rounds; round += 1) {
      st.rounds = Math.max(st.rounds, round + 1);
      // Collect the requests FIRST, then apply them from the highest segment index down, so an insertion
      // never invalidates an index still to be used. The two rings have independent index spaces, so
      // interleaving them in one descending sort is safe: each ring's own requests stay in descending order.
      const req: Array<[number, number, number, number]> = [];   // side, base segment, pieces, snap bar
      const seen = new Set<string>();
      for (const e of zip(ra, rb)) {
        const [B0, B1, apex] = earBase(ra, rb, e);
        if (ar3(B0, B1, apex) <= o.shapeAR) continue;
        const kk = `${e[0]}:${e[1]}`;
        if (seen.has(kk)) continue;
        seen.add(kk);
        const L = Math.hypot(B1[0] - B0[0], B1[1] - B0[1], B1[2] - B0[2]);
        const alt = L > 0 ? (2 * triArea(B0, B1, apex)) / L : 0;
        // THE CHORD BOUND, derived not guessed: for a strip triangle of base L and altitude h the perimeter
        // is at most ~2L, so aspect3 = L*P/(4*A) = L*P/(2*L*h) <= L/h. Ask for the smallest number of pieces
        // that puts L/h under safe*shapeAR.
        const bound = o.safe * o.shapeAR * alt;
        const k = Math.min(o.maxK, Math.max(2, Math.ceil(L / Math.max(1e-12, bound))));
        req.push([e[0], e[1], k, o.snapFrac * bound]);
      }
      if (req.length === 0) break;
      req.sort((p, q) => q[1] - p[1]);
      let applied = 0;
      // PHASE 1 — split the bases. The θ of every point that lands, AND of the base's own two endpoints,
      // goes on the opposite ring's mirror list.
      const mirrorToA: Array<[number, number]> = []; const mirrorToB: Array<[number, number]> = [];
      for (const [side, seg, k, snapMm] of req) {
        const R0 = side === 0 ? ra : rb;
        const mirror = side === 0 ? mirrorToB : mirrorToA;
        mirror.push([R0.th[seg], snapMm], [R0.th[(seg + 1) % R0.p.length], snapMm]);
        for (let j = k - 1; j >= 1; j -= 1) {
          const th = insertAt(R0, seg, j / k);
          if (Number.isFinite(th)) { applied += 1; mirror.push([th, snapMm]); }
        }
      }
      // PHASE 1 held raw segment indices, so the seam repair waits until every one of them has been used.
      rotateToMin(ra); rotateToMin(rb);
      // PHASE 2 — mirror. Done AFTER every base split so no stored segment index is stale; `splitAtTheta`
      // searches the ring as it stands, so the two phases cannot invalidate each other.
      for (const [th, sm] of mirrorToA) if (Number.isFinite(splitAtTheta(ra, th, sm))) applied += 1;
      for (const [th, sm] of mirrorToB) if (Number.isFinite(splitAtTheta(rb, th, sm))) applied += 1;
      // *** COMMIT OR ROLL BACK. *** Scored on the SAME walk that will emit, so the number the guard reads is
      // the number the STL gets. A round that does not strictly improve is undone and the loop stops.
      const sc = scoreStep(ra, rb);
      if (applied === 0 || !better(sc, bestScore)) {
        st.rolledBack += 1;
        putRing(ra, bestA); putRing(rb, bestB); putOwners(bestOwn);
        facetSplitEdge.clear();
        for (const [kf, kv] of bestSplitEdge) facetSplitEdge.set(kf, kv);
        break;
      }
      bestScore = sc; bestA = snapRing(ra); bestB = snapRing(rb);
      bestOwn = snapOwners(); bestSplitEdge = new Map(facetSplitEdge);
    }
    for (const e of zip(ra, rb)) {
      const T3 = earPts(ra, rb, e);
      treads.push(T3); st.treads += 1;
      const a = ar3(T3[0], T3[1], T3[2]);
      if (a > o.shapeAR) {
        st.earsOver += 1;
        st.earsOverArea += triArea(T3[0], T3[1], T3[2]);
        if (a > st.earsOverMax) st.earsOverMax = a;
      }
    }
  }

  // COMMIT THE WALL FANS, last and in one sweep, so `ownerOf`'s facet indices stayed valid throughout. The
  // union of a fan's children is EXACTLY the parent triangle, so the wall SURFACE does not move by one bit
  // and no fidelity number can change; only its triangulation does.
  const seenF = new Set<number>();
  for (const own of ownerOf.values()) {
    if (own === null || own.params.length === 0 || seenF.has(own.f)) continue;
    seenF.add(own.f);
    const fan = fanOf(own, own.params);
    wall[own.f] = fan[0];
    for (let i = 1; i < fan.length; i += 1) wallExtra.push(fan[i]);
    for (const [X, Y, Z] of fan) {
      const a = ar3(X, Y, Z);
      if (a > o.shapeAR) { st.wallOver += 1; if (a > st.wallOverMax) st.wallOverMax = a; }
    }
  }
  st.wallExtra = wallExtra.length;
  return { treads, wallExtra, stats: st };
}

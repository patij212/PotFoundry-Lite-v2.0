// _strataLocusTrace.ts — S10. THE LOCUS TRACER. RESEARCH ONLY; nothing in src/ may import this.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS, AND WHY IT IS NOT A NEW DETECTOR
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The driver locates feature loci POINTWISE: `locateKink` answers "does THIS segment cross a crease, and
// where". Every conformity lever built so far (SNAP, S8's cascade, S9a's gen-0 sweep) is therefore a
// sequence of independent point answers with no notion of the CURVE those points lie on.
//
// This file turns that pointwise oracle into ORDERED POLYLINES: for each connected component of the C0 /
// crease locus set of r(theta,z), an ordered list of (theta,z) samples, plus the JUNCTIONS where components
// meet and a DISK RADIUS at each junction inside which "aligned" is ill-defined.
//
// IT CALLS `locateKinkRaw` AND NOTHING ELSE. Same coarse scan, same bracket-halving bisection, same
// two-scale class test, same KINK_RATIO / JUMP_RATIO constants the driver runs. That is deliberate and it
// is the only reason a traced locus is the same object the driver's SNAP conforms to — a tracer with its
// own detector would produce curves that are "the loci" of a slightly different surface, and a constraint
// placed on the wrong curve is a NEW artifact class, not a fix (see the negative control, layer 1).
//
// JUMP-CLASS IS EXCLUDED, EXACTLY AS THE S9a SWEEP EXCLUDES IT (`if (kk === null || kk.jump) continue;`).
// A C0 jump needs a CURTAIN, not a snap and not an aligned edge; routing it here would place a constraint
// along a discontinuity the seed cannot represent either way. Excluded jump crossings are COUNTED and
// reported, never silently dropped.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE METHOD — SEED BY LATTICE SWEEP, THEN CONTINUATION WITH ADAPTIVE STEP
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
//  A. SEEDING. A theta-periodic lattice (nu x nv). Every lattice edge, horizontal and vertical, is handed to
//     `locateKinkRaw`. This is a COMPLETENESS device, not the trace: continuation started from one hand-
//     picked seed silently misses every component that seed cannot reach, and closed loops are exactly the
//     components a hand-picked seed misses. Cost is (2*nu*nv) kink probes, each ~(kinkScan + 4*kinkHalvings
//     + 5) rA evals.
//  B. CELL LINKING. Within each lattice cell, count crossings on its four edges. Two crossings ⇒ the locus
//     passes through and the segment joining them gives the initial TANGENT. Three or four ⇒ a JUNCTION
//     CANDIDATE (two loci in one cell), recorded and never used as a trace start.
//  C. CONTINUATION. From a seed with a known tangent, march: predict p + h*T, correct by running
//     `locateKinkRaw` on a probe segment through the prediction PERPENDICULAR to T, accept the located
//     crossing. Step h adapts on the TURN ANGLE between consecutive tangents (halve above turnMaxDeg, grow
//     below turnMinDeg) — so a straight locus is traced in few long steps and a corner is resolved finely.
//     A rejected corrector also halves h; h below stepMinMm ends the branch. Both directions are marched
//     from the seed, so an open curve is complete and a closed one detects its own return.
//  D. SEAM. All arithmetic is in UNWRAPPED theta with deltas through `dThRaw`, and every rA evaluation
//     canonicalises through `canonTheta` — the driver's own two-theta discipline (see _sweepPredicate's
//     note: rA at the canonical theta, geometry at the raw one). A polyline therefore runs CONTINUOUSLY
//     across theta=0=2pi and records how many times it did. Consumers that need a cut domain call
//     `splitAtSeam`, which is the ConstrainedTriangulator.handleSeamCrossings idiom: a segment crossing the
//     seam becomes two segments, one ending EXACTLY at the domain max and one starting EXACTLY at the min.
//     THE SEAM RULE IS NOT COSMETIC — a constraint edge that spans the cut domain is the measured cause of
//     the cdt2d `upperIds` crash (research/lab/2026-07-13-cdt2d-seam-spanner-crash-fix.md: 56 spanners
//     produced 2,947 of 2,965 proper crossings on the captured PSLG).
//  E. JUNCTIONS. Pairwise segment intersections between distinct polylines, plus self-intersections, plus
//     the >=3-crossing cells of step B, clustered by proximity. Each junction reports its branch count, the
//     MINIMUM ANGLE between incident branch directions, and a disk radius.
//
// THE DISK RADIUS, STATED SO IT CANNOT BE READ AS A TUNED CONSTANT. Two loci meeting at angle phi separate
// by 2*rho*sin(phi/2) at distance rho from the junction. An element of size h laid along one branch cannot
// avoid the other until that separation exceeds h. So
//        radiusMm = clamp( hRefMm / (2 sin(phi/2)),  hRefMm,  radiusMaxMm )
// with `hRefMm` supplied by the CALLER (the element size it intends to lay) and `minAngleDeg` reported
// alongside, so a consumer with a different h recomputes rather than inherits. phi -> 0 (tangential
// touching) gives an unbounded radius, which is true and is why the clamp exists and is reported.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE METRIC. (theta,z) is not isotropic: at radius r, dtheta of one radian is r mm of arc. Every distance,
// step, probe half-width and tolerance in this file is in MILLIMETRES on the surface, converted per point
// through the LOCAL radius r = rA(theta,z) rather than a fixed reference — the pot's radius runs 40..50 mm
// over the band and a fixed reference would bias the step by ~20% at one end of it.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────

import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst, type SweepRadiusFn } from './_sweepPredicate';

const TWO_PI = Math.PI * 2;

// ───────────────────────────────────────── public shapes ─────────────────────────────────────────

export interface LocusTraceOpts {
  /** z domain height (mm). Loci are traced over z in [0,H]. */
  H: number;
  /** seeding lattice: theta columns (periodic). */
  nu: number;
  /** seeding lattice: z rows. */
  nv: number;
  /** nominal continuation step, mm on the surface. */
  stepMm: number;
  /** adaptive floor / ceiling on the step, mm. */
  stepMinMm: number;
  stepMaxMm: number;
  /** halve the step when the tangent turns more than this between consecutive samples. */
  turnMaxDeg: number;
  /** grow the step when the tangent turns less than this. */
  turnMinDeg: number;
  /** corrector probe half-width as a MULTIPLE of the current step. */
  probeFactor: number;
  /** a corrector whose crossing sits outside +/- this fraction of the probe is rejected (step too long). */
  probeAcceptFrac: number;
  /** loop-closure radius and junction merge radius, mm. */
  closeTolMm: number;
  /** a seed crossing within this distance of a traced polyline is CONSUMED by it, mm. */
  consumeTolMm: number;
  /** safety cap on samples per traced branch. */
  maxPtsPerLocus: number;
  /** drop traced components shorter than this total length, mm (lattice noise). */
  minLengthMm: number;
  /** element size the CONSUMER intends to lay at a junction, mm — sets the disk radius. */
  hRefMm: number;
  /** clamp on the junction disk radius, mm. */
  radiusMaxMm: number;
  /**
   * Junction CLUSTER radius, mm. Raw crossings within this of each other are ONE junction and the reported
   * position is their centroid.
   *
   * WHY THIS IS NOT OPTIONAL, measured on fixture D of the layer-1 control: a single X-crossing produces
   * ~23 raw segment-pair crossings, because near a junction the corrector's probe sees BOTH families and
   * the two traces zig-zag across each other over a ~1 mm neighbourhood. That neighbourhood IS the junction
   * disk — the region where "which locus am I on" has no answer — so collapsing it to its centroid is the
   * correct reading, not a tidy-up. Un-clustered, the same X reported 917 junctions for 40 true ones and
   * the position error ran to 474 um; clustered, it is one junction at the centroid.
   */
  junctionMergeMm: number;
  /** the driver's own kink constants. */
  pred: SweepPredConst;
}

export const DEFAULT_TRACE_OPTS: Omit<LocusTraceOpts, 'H' | 'pred'> = {
  nu: 400,
  nv: 280,
  stepMm: 0.35,
  stepMinMm: 0.02,
  stepMaxMm: 1.2,
  turnMaxDeg: 12,
  turnMinDeg: 3,
  probeFactor: 0.9,
  probeAcceptFrac: 0.85,
  closeTolMm: 0.25,
  consumeTolMm: 0.6,
  maxPtsPerLocus: 20000,
  minLengthMm: 1.0,
  hRefMm: 0.35,
  radiusMaxMm: 4.0,
  junctionMergeMm: 2.0,
};

/** one traced locus component. `pts` are UNWRAPPED (theta,z) in trace order. */
export interface LocusPolyline {
  id: number;
  /** [theta, z] pairs, unwrapped theta (may leave [0,2pi) — that is the seam running continuously). */
  pts: Array<[number, number]>;
  closed: boolean;
  /** total arc length on the surface, mm. */
  lengthMm: number;
  /** how many times the polyline crosses theta = 0 (mod 2pi). */
  seamCrossings: number;
  /** why each end stopped: 'closed' | 'boundary' | 'junction' | 'lost' | 'cap'. */
  endReason: [string, string];
  /** median two-scale ratio of the located kinks (class evidence; jump-class is excluded upstream). */
  ratioMedian: number;
}

export interface LocusJunction {
  id: number;
  theta: number;
  z: number;
  /** number of distinct branch directions meeting here (a clean X is 4, a T is 3). */
  branches: number;
  /** smallest angle between two incident branch directions, degrees. */
  minAngleDeg: number;
  /** disk radius, mm — see the header. */
  radiusMm: number;
  /** whether the clamp bound the radius (phi so small the disk is unbounded in principle). */
  radiusClamped: boolean;
  /** MEASURED scatter of the raw crossings this junction was clustered from, mm. */
  spreadMm: number;
  /** how many raw crossings clustered into this junction. */
  nRaw: number;
  /** ids of the polylines meeting here. */
  lociIds: number[];
  /** how this junction was found: 'cross' (polyline intersection) or 'cell' (>=3-crossing lattice cell). */
  source: string;
}

export interface LocusArtifact {
  schema: string;
  meta: {
    H: number;
    nu: number;
    nv: number;
    stepMm: number;
    hRefMm: number;
    kink: { scan: number; halvings: number; ratio: number; jumpRatio: number };
    rEvals: number;
    wallMs: number;
  };
  counts: {
    latticeProbes: number;
    crossings: number;
    jumpExcluded: number;
    seedsConsumed: number;
    loci: number;
    lociDropped: number;
    junctions: number;
    /** raw crossings BEFORE clustering — the ratio to `junctions` is how much scatter the junctions carry. */
    rawJunctions: number;
    junctionCells: number;
    polylinePts: number;
    totalLengthMm: number;
  };
  loci: LocusPolyline[];
  junctions: LocusJunction[];
}

export const LOCUS_SCHEMA = 'pf.strata.loci/1';

// ───────────────────────────────────────── internals ─────────────────────────────────────────

interface Crossing { th: number; z: number; big: number; ratio: number; used: boolean }

/** metric helper bundle bound to one radius function. */
interface Metric {
  /** mm per radian of theta at (theta,z). */
  scale: (th: number, z: number) => number;
  /** surface distance between two (theta,z) points, mm (small-displacement approximation). */
  dist: (thA: number, zA: number, thB: number, zB: number) => number;
}

function makeMetric(rA: SweepRadiusFn, bump: () => void): Metric {
  const scale = (th: number, z: number): number => { bump(); return Math.max(1e-6, rA(canonTheta(th), z)); };
  return {
    scale,
    dist: (thA, zA, thB, zB) => {
      const r = 0.5 * (scale(thA, zA) + scale(thB, zB));
      const dth = dThRaw(canonTheta(thA), canonTheta(thB));
      const dz = zB - zA;
      return Math.hypot(r * dth, dz);
    },
  };
}

/**
 * Point-to-segment distance in the LOCAL mm metric around the segment.
 *
 * EVERY theta enters as a DELTA FROM `aTh` through `dThRaw`, and a delta beyond +/- pi/2 is refused rather
 * than wrapped. `dThRaw` folds at pi, so a point pi away from the anchor lands on whichever side float noise
 * picks — and a wrapped point reads as NEAR when it is half a turn away. That is the same failure mode as
 * the cdt2d chart spanner, and it was MEASURED here: two ANTIPODAL parallel loci (theta 0.570 and 3.712,
 * exactly pi apart) reported 183 phantom junctions along their whole length before this guard existed.
 */
function ptSegDistMm(
  pTh: number, pZ: number,
  aTh: number, aZ: number, bTh: number, bZ: number,
  rMm: number,
): number {
  const dp = dThRaw(0, pTh - aTh);
  const db = dThRaw(0, bTh - aTh);
  if (Math.abs(dp) > Math.PI / 2 || Math.abs(db) > Math.PI / 2) return Infinity;
  const ax = 0; const ay = aZ;
  const bx = rMm * db; const by = bZ;
  const px = rMm * dp; const py = pZ;
  const ux = bx - ax; const uy = by - ay;
  const l2 = ux * ux + uy * uy;
  if (l2 < 1e-18) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * ux + (py - ay) * uy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * ux), py - (ay + t * uy));
}

/**
 * Segment-segment proper intersection in a LOCAL flat chart around segment 1's first endpoint.
 * Returns the (theta,z) of the crossing, or null. Unwrapped theta throughout.
 */
function segCross(
  a0: [number, number], a1: [number, number],
  b0: [number, number], b1: [number, number],
  rMm: number,
): [number, number] | null {
  // Same anchoring discipline as ptSegDistMm, same reason: a delta past pi/2 is REFUSED, not wrapped.
  // Two segments half a turn apart cannot cross; wrapping them into one chart makes one of them span it.
  const dA1 = dThRaw(0, a1[0] - a0[0]);
  const dB0 = dThRaw(0, b0[0] - a0[0]);
  const dB1 = dThRaw(0, b1[0] - a0[0]);
  const LIM = Math.PI / 2;
  if (Math.abs(dA1) > LIM || Math.abs(dB0) > LIM || Math.abs(dB1) > LIM) return null;
  // cheap axis-aligned rejection before the determinant (this loop is O(segments^2))
  const azLo = Math.min(a0[1], a1[1]); const azHi = Math.max(a0[1], a1[1]);
  const bzLo = Math.min(b0[1], b1[1]); const bzHi = Math.max(b0[1], b1[1]);
  if (bzLo > azHi || bzHi < azLo) return null;
  const axLo = Math.min(0, dA1); const axHi = Math.max(0, dA1);
  const bxLo = Math.min(dB0, dB1); const bxHi = Math.max(dB0, dB1);
  if (bxLo > axHi || bxHi < axLo) return null;
  const p0x = 0; const p0y = a0[1];
  const p1x = rMm * dA1; const p1y = a1[1];
  const q0x = rMm * dB0; const q0y = b0[1];
  const q1x = rMm * dB1; const q1y = b1[1];
  const rx = p1x - p0x; const ry = p1y - p0y;
  const sx = q1x - q0x; const sy = q1y - q0y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((q0x - p0x) * sy - (q0y - p0y) * sx) / den;
  const u = ((q0x - p0x) * ry - (q0y - p0y) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  const th = a0[0] + (a1[0] - a0[0]) * t;
  const z = a0[1] + (a1[1] - a0[1]) * t;
  return [th, z];
}

// ───────────────────────────────────────── the tracer ─────────────────────────────────────────

/**
 * Trace the crease loci of `rA` over (theta in [0,2pi), z in [0,H]).
 *
 * `rA` is called through `canonTheta` on every evaluation, exactly as the driver does; it is NOT wrapped in
 * the driver's counting `R`, so the caller owns eval accounting (`meta.rEvals` is this tracer's own count).
 */
export function traceLoci(rA: SweepRadiusFn, optsIn: LocusTraceOpts): LocusArtifact {
  const t0 = Date.now();
  const o = optsIn;
  const H = o.H;
  let rEvals = 0;
  const bump = (): void => { rEvals += 1; };
  const Rc: SweepRadiusFn = (th, z) => { rEvals += 1; return rA(th, z); };
  const M = makeMetric(rA, bump);

  let latticeProbes = 0;
  let jumpExcluded = 0;

  /** run the driver's locator on a (theta,z) segment; null unless it is an interior NON-JUMP crease. */
  const probe = (thA: number, zA: number, thB: number, zB: number): { t: number; big: number; ratio: number } | null => {
    latticeProbes += 1;
    const k = locateKinkRaw(Rc, thA, zA, thB, zB, o.pred);
    if (k === null) return null;
    if (k.jump) { jumpExcluded += 1; return null; }
    if (!(k.t > 1e-6 && k.t < 1 - 1e-6)) return null;
    return { t: k.t, big: k.big, ratio: k.ratio };
  };

  // ── A. SEEDING LATTICE ────────────────────────────────────────────────────────────────────────
  const dTh = TWO_PI / o.nu;
  const dZ = H / o.nv;
  // hCross[j*nu + i] = crossing on the HORIZONTAL edge from (i,j) to (i+1,j)   (j in 0..nv, i in 0..nu-1)
  // vCross[j*nu + i] = crossing on the VERTICAL   edge from (i,j) to (i,j+1)   (j in 0..nv-1, i in 0..nu-1)
  const hCross: Array<Crossing | null> = new Array<Crossing | null>((o.nv + 1) * o.nu).fill(null);
  const vCross: Array<Crossing | null> = new Array<Crossing | null>(o.nv * o.nu).fill(null);
  for (let j = 0; j <= o.nv; j += 1) {
    const z = (H * j) / o.nv;
    for (let i = 0; i < o.nu; i += 1) {
      const th = dTh * i;
      const c = probe(th, z, th + dTh, z);
      if (c !== null) hCross[j * o.nu + i] = { th: th + dTh * c.t, z, big: c.big, ratio: c.ratio, used: false };
    }
  }
  for (let j = 0; j < o.nv; j += 1) {
    const z = (H * j) / o.nv;
    const z1 = (H * (j + 1)) / o.nv;
    for (let i = 0; i < o.nu; i += 1) {
      const th = dTh * i;
      const c = probe(th, z, th, z1);
      if (c !== null) vCross[j * o.nu + i] = { th, z: z + (z1 - z) * c.t, big: c.big, ratio: c.ratio, used: false };
    }
  }

  // ── B. CELL LINKING ───────────────────────────────────────────────────────────────────────────
  // cell (i,j) has edges: bottom hCross[j][i], top hCross[j+1][i], left vCross[j][i], right vCross[j][i+1]
  interface CellLink { a: Crossing; b: Crossing }
  const cellLinks = new Map<number, CellLink>();
  const junctionCells: Array<{ th: number; z: number }> = [];
  for (let j = 0; j < o.nv; j += 1) {
    for (let i = 0; i < o.nu; i += 1) {
      const i1 = (i + 1) % o.nu;
      const cs: Crossing[] = [];
      const bot = hCross[j * o.nu + i]; if (bot !== null) cs.push(bot);
      const top = hCross[(j + 1) * o.nu + i]; if (top !== null) cs.push(top);
      const lef = vCross[j * o.nu + i]; if (lef !== null) cs.push(lef);
      const rig = vCross[j * o.nu + i1]; if (rig !== null) cs.push(rig);
      if (cs.length === 2) cellLinks.set(j * o.nu + i, { a: cs[0], b: cs[1] });
      else if (cs.length >= 3) {
        let sTh = 0; let sZ = 0;
        for (const c of cs) { sTh += c.th; sZ += c.z; }
        junctionCells.push({ th: sTh / cs.length, z: sZ / cs.length });
      }
    }
  }

  const allSeeds: Crossing[] = [];
  for (const c of hCross) if (c !== null) allSeeds.push(c);
  for (const c of vCross) if (c !== null) allSeeds.push(c);
  // strongest first: a strong locus is traced before a weak one so weak seeds get consumed by the real curve
  allSeeds.sort((a, b) => b.big - a.big);

  /** initial tangent for a seed: the cell link that contains it, as a unit direction in mm-space. */
  const seedTangent = (c: Crossing): [number, number] | null => {
    for (const [, l] of cellLinks) {
      if (l.a === c || l.b === c) {
        const other = l.a === c ? l.b : l.a;
        const r = M.scale(c.th, c.z);
        const dx = r * dThRaw(canonTheta(c.th), canonTheta(other.th));
        const dy = other.z - c.z;
        const n = Math.hypot(dx, dy);
        if (n < 1e-12) return null;
        return [dx / n, dy / n];
      }
    }
    return null;
  };
  // index cellLinks by crossing for O(1) lookup (the loop above is O(cells) per seed otherwise)
  const linkOf = new Map<Crossing, Crossing>();
  for (const [, l] of cellLinks) {
    if (!linkOf.has(l.a)) linkOf.set(l.a, l.b);
    if (!linkOf.has(l.b)) linkOf.set(l.b, l.a);
  }
  const seedTangentFast = (c: Crossing): [number, number] | null => {
    const other = linkOf.get(c);
    if (other === undefined) return seedTangent(c);
    const r = M.scale(c.th, c.z);
    const dx = r * dThRaw(canonTheta(c.th), canonTheta(other.th));
    const dy = other.z - c.z;
    const n = Math.hypot(dx, dy);
    if (n < 1e-12) return null;
    return [dx / n, dy / n];
  };

  // ── C. CONTINUATION ───────────────────────────────────────────────────────────────────────────
  /**
   * One corrector step. Given a predicted point and the marching direction, probe PERPENDICULAR to the
   * direction and return the located crossing, or null.
   */
  const correct = (
    pTh: number, pZ: number, tx: number, ty: number, wMm: number,
  ): { th: number; z: number; ratio: number } | null => {
    const r = M.scale(pTh, pZ);
    const nx = -ty; const ny = tx;                       // unit normal in mm-space
    const aTh = pTh - (wMm * nx) / r; const aZ = pZ - wMm * ny;
    const bTh = pTh + (wMm * nx) / r; const bZ = pZ + wMm * ny;
    if (Math.min(aZ, bZ) < -1e-9 || Math.max(aZ, bZ) > H + 1e-9) {
      // probe would leave the band: clip it and accept a shorter probe rather than mis-locating
      const lo = Math.max(0, Math.min(aZ, bZ)); const hi = Math.min(H, Math.max(aZ, bZ));
      if (hi - lo < 1e-9) return null;
    }
    const c = probe(aTh, aZ, bTh, bZ);
    if (c === null) return null;
    const off = 2 * c.t - 1;                              // -1..1 across the probe
    if (Math.abs(off) > o.probeAcceptFrac) return null;
    return { th: aTh + (bTh - aTh) * c.t, z: aZ + (bZ - aZ) * c.t, ratio: c.ratio };
  };

  const DEG = Math.PI / 180;
  const turnMax = o.turnMaxDeg * DEG;
  const turnMin = o.turnMinDeg * DEG;

  interface Branch { pts: Array<[number, number]>; ratios: number[]; reason: string }

  /** march from (th0,z0) along (tx,ty) until termination; returns the ordered points EXCLUDING the start. */
  const march = (th0: number, z0: number, tx0: number, ty0: number, startTh: number, startZ: number, allowClose: boolean): Branch => {
    const pts: Array<[number, number]> = [];
    const ratios: number[] = [];
    let pTh = th0; let pZ = z0; let tx = tx0; let ty = ty0;
    let h = o.stepMm;
    let reason = 'cap';
    let travelled = 0;
    for (let n = 0; n < o.maxPtsPerLocus; n += 1) {
      let accepted = false;
      let tries = 0;
      while (tries < 8) {
        tries += 1;
        const r = M.scale(pTh, pZ);
        const qTh = pTh + (h * tx) / r; const qZ = pZ + h * ty;
        if (qZ < 0 || qZ > H) {
          // BOUNDARY: bisect along the step for the exact z crossing and stop there.
          const target = qZ < 0 ? 0 : H;
          const f = (s: number): number => pZ + s * (qZ - pZ) - target;
          let lo = 0; let hi = 1;
          if (Math.abs(qZ - pZ) > 1e-15) {
            for (let it = 0; it < 60; it += 1) {
              const m = 0.5 * (lo + hi);
              if (f(0) * f(m) <= 0) hi = m; else lo = m;
            }
          }
          const s = 0.5 * (lo + hi);
          pts.push([pTh + s * (qTh - pTh), target]);
          ratios.push(ratios.length > 0 ? ratios[ratios.length - 1] : 0);
          return { pts, ratios, reason: 'boundary' };
        }
        const c = correct(qTh, qZ, tx, ty, h * o.probeFactor);
        if (c === null) { h *= 0.5; if (h < o.stepMinMm) { reason = 'lost'; break; } continue; }
        const r2 = M.scale(pTh, pZ);
        const dx = r2 * dThRaw(canonTheta(pTh), canonTheta(c.th)); const dy = c.z - pZ;
        const seg = Math.hypot(dx, dy);
        if (seg < 1e-9) { h *= 0.5; if (h < o.stepMinMm) { reason = 'lost'; break; } continue; }
        const ntx = dx / seg; const nty = dy / seg;
        const dot = Math.max(-1, Math.min(1, ntx * tx + nty * ty));
        const turn = Math.acos(dot);
        if (turn > turnMax && h > o.stepMinMm) { h = Math.max(o.stepMinMm, h * 0.5); continue; }
        if (turn > Math.PI / 2) { reason = 'lost'; break; }   // reversal — the corrector jumped to another branch
        // ── LOOP CLOSURE IS A SEGMENT TEST, NOT A POINT TEST. ────────────────────────────────────────
        // MEASURED (layer-1 fixture D, before this fix): closed loci wrapped the pot FIVE times before
        // closing — 1342.9 mm of polyline for a 268 mm loop. The step grows to stepMaxMm on a straight
        // locus, so the marcher STEPS OVER the start point, lands 0.4 mm past it, fails a 0.25 mm
        // point-closure test, and goes round again. A five-fold overlapping polyline then produces
        // hundreds of phantom self-crossings, i.e. hundreds of phantom junctions — which is exactly how
        // a tracer bug becomes a fabricated P5 target list. Test whether the STEP CROSSED the start and
        // snap the final vertex onto it, so the closed polyline is exactly closed.
        if (allowClose && travelled > 4 * o.closeTolMm) {
          const dSeg = ptSegDistMm(startTh, startZ, pTh, pZ, c.th, c.z, M.scale(pTh, pZ));
          if (dSeg < o.closeTolMm) {
            // express the start in the CURRENT unwrapped frame: after k turns the closing vertex is
            // startTh + k*2pi, NOT startTh — pushing the latter would put a 2pi-wide spanner segment at
            // the end of every closed locus, which is the exact edge the seam rule exists to forbid.
            const k = Math.round((c.th - startTh) / TWO_PI);
            pts.push([startTh + k * TWO_PI, startZ]); ratios.push(c.ratio);
            return { pts, ratios, reason: 'closed' };
          }
        }
        pts.push([c.th, c.z]); ratios.push(c.ratio);
        travelled += seg;
        pTh = c.th; pZ = c.z; tx = ntx; ty = nty;
        if (turn < turnMin) h = Math.min(o.stepMaxMm, h * 1.4);
        accepted = true;
        break;
      }
      if (!accepted) { if (reason === 'cap') reason = 'lost'; return { pts, ratios, reason }; }
    }
    return { pts, ratios, reason: 'cap' };
  };

  const loci: LocusPolyline[] = [];
  let lociDropped = 0;
  let seedsConsumed = 0;

  const consumeNear = (poly: Array<[number, number]>): void => {
    for (const s of allSeeds) {
      if (s.used) continue;
      const r = M.scale(s.th, s.z);
      let best = Infinity;
      for (let i = 0; i + 1 < poly.length; i += 1) {
        const d = ptSegDistMm(s.th, s.z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1], r);
        if (d < best) best = d;
        if (best <= o.consumeTolMm) break;
      }
      if (best <= o.consumeTolMm) { s.used = true; seedsConsumed += 1; }
    }
  };

  for (const seed of allSeeds) {
    if (seed.used) continue;
    const T = seedTangentFast(seed);
    if (T === null) { seed.used = true; continue; }
    seed.used = true; seedsConsumed += 1;
    const fwd = march(seed.th, seed.z, T[0], T[1], seed.th, seed.z, true);
    let pts: Array<[number, number]>;
    let ratios: number[];
    let closed = false;
    let endA = 'seed';
    let endB = fwd.reason;
    if (fwd.reason === 'closed') {
      pts = [[seed.th, seed.z], ...fwd.pts];
      ratios = fwd.ratios;
      closed = true;
      endA = 'closed'; endB = 'closed';
    } else {
      const bwd = march(seed.th, seed.z, -T[0], -T[1], seed.th, seed.z, false);
      pts = [...bwd.pts.slice().reverse(), [seed.th, seed.z], ...fwd.pts];
      ratios = [...bwd.ratios, ...fwd.ratios];
      endA = bwd.reason;
    }
    // length + seam crossings
    let lengthMm = 0;
    let seamCrossings = 0;
    for (let i = 0; i + 1 < pts.length; i += 1) {
      lengthMm += M.dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (Math.floor(pts[i][0] / TWO_PI) !== Math.floor(pts[i + 1][0] / TWO_PI)) seamCrossings += 1;
    }
    if (lengthMm < o.minLengthMm || pts.length < 3) { lociDropped += 1; continue; }
    consumeNear(pts);
    const sortedR = ratios.slice().sort((a, b) => a - b);
    loci.push({
      id: loci.length,
      pts,
      closed,
      lengthMm,
      seamCrossings,
      endReason: [endA, endB],
      ratioMedian: sortedR.length === 0 ? 0 : sortedR[Math.floor(sortedR.length / 2)],
    });
  }

  // ── E. JUNCTIONS ──────────────────────────────────────────────────────────────────────────────
  interface RawJn { th: number; z: number; ids: number[]; source: string }
  const raw: RawJn[] = [];
  const rMid = M.scale(0, H / 2);

  for (let a = 0; a < loci.length; a += 1) {
    for (let b = a; b < loci.length; b += 1) {
      const PA = loci[a].pts; const PB = loci[b].pts;
      const nSegB = PB.length - 1;
      const cyc = loci[b].closed;
      for (let i = 0; i + 1 < PA.length; i += 1) {
        // SELF-crossing: only count segments far apart along the curve. Adjacent segments of a polyline
        // routinely "cross" under the flat-chart test at sub-micron scale; that is arithmetic, not topology.
        // A CLOSED polyline's first and last vertices are the SAME point, so the separation must be
        // measured CYCLICALLY — without that, every closed locus reports one phantom junction at its own
        // closure vertex (measured: 6 of them on layer-1 fixture D).
        const jStart = a === b ? i + 8 : 0;
        for (let j = jStart; j + 1 < PB.length; j += 1) {
          if (a === b && cyc && nSegB - (j - i) < 8) continue;
          const x = segCross(PA[i], PA[i + 1], PB[j], PB[j + 1], rMid);
          if (x !== null) raw.push({ th: x[0], z: x[1], ids: a === b ? [a] : [a, b], source: 'cross' });
        }
      }
    }
  }
  for (const jc of junctionCells) {
    // only keep a junction cell that is actually near two DISTINCT traced loci
    const near: number[] = [];
    for (let a = 0; a < loci.length; a += 1) {
      const P = loci[a].pts;
      let best = Infinity;
      for (let i = 0; i + 1 < P.length; i += 1) {
        const d = ptSegDistMm(jc.th, jc.z, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], rMid);
        if (d < best) best = d;
      }
      if (best <= o.consumeTolMm) near.push(a);
    }
    if (near.length >= 2) raw.push({ th: jc.th, z: jc.z, ids: near, source: 'cell' });
  }

  // ── CLUSTER. Single-link agglomeration at `junctionMergeMm`, reported at the CENTROID. See the option's
  // own note: the scatter of raw crossings around one X IS the junction disk, so its centroid is the
  // junction and its extent is evidence about the radius.
  const cN = raw.length;
  const parent = new Int32Array(cN);
  for (let i = 0; i < cN; i += 1) parent[i] = i;
  const find = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; } return r; };
  for (let i = 0; i < cN; i += 1) {
    for (let j = i + 1; j < cN; j += 1) {
      if (find(i) === find(j)) continue;
      if (M.dist(raw[i].th, raw[i].z, raw[j].th, raw[j].z) <= o.junctionMergeMm) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < cN; i += 1) {
    const r = find(i);
    const l = clusters.get(r);
    if (l === undefined) clusters.set(r, [i]); else l.push(i);
  }
  interface Merged { th: number; z: number; ids: Set<number>; source: string; spreadMm: number; nRaw: number }
  const merged: Merged[] = [];
  for (const [, idxs] of clusters) {
    // POSITION comes from the 'cross' raws ALONE when any exist. A polyline intersection is a MEASUREMENT
    // (both curves are traced to sub-micron); a junction CELL is a DETECTION whose position is only good to
    // half a lattice cell (~0.3-0.6 mm here). Averaging the two pulled the reported junction 105 um off
    // the closed-form crossing on layer-1 fixture D — over the 100 um bar, on 16 of 48 junctions.
    // SPREAD still ranges over EVERY raw in the cluster: that is the honest extent of the evidence.
    const ids = new Set<number>();
    let src = 'cell';
    for (const i of idxs) { for (const id of raw[i].ids) ids.add(id); if (raw[i].source === 'cross') src = 'cross'; }
    const posIdx = src === 'cross' ? idxs.filter((i) => raw[i].source === 'cross') : idxs;
    const a0 = raw[posIdx[0]];
    let sx = 0; let sz = 0;
    for (const i of posIdx) {
      sx += rMid * dThRaw(canonTheta(a0.th), canonTheta(raw[i].th));
      sz += raw[i].z;
    }
    const cx = sx / posIdx.length; const cz = sz / posIdx.length;
    const th = a0.th + cx / rMid;
    let spread = 0;
    for (const i of idxs) spread = Math.max(spread, M.dist(th, cz, raw[i].th, raw[i].z));
    merged.push({ th, z: cz, ids, source: src, spreadMm: spread, nRaw: idxs.length });
  }

  // branch directions at each junction: the tangent of every polyline segment passing within radius
  const junctions: LocusJunction[] = [];
  for (const j of merged) {
    const dirs: Array<[number, number]> = [];
    const sampleR = Math.max(o.junctionMergeMm, j.spreadMm * 1.5);
    for (const id of j.ids) {
      const P = loci[id].pts;
      for (let i = 0; i + 1 < P.length; i += 1) {
        const d = ptSegDistMm(j.th, j.z, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], rMid);
        if (d > sampleR) continue;
        const dx = rMid * dThRaw(canonTheta(P[i][0]), canonTheta(P[i + 1][0]));
        const dy = P[i + 1][1] - P[i][1];
        const n = Math.hypot(dx, dy);
        if (n < 1e-12) continue;
        dirs.push([dx / n, dy / n]);
      }
    }
    // reduce to distinct UNDIRECTED directions (mod pi), merging within 15 degrees
    const uniq: Array<[number, number]> = [];
    for (const d of dirs) {
      const dd: [number, number] = d[0] < 0 || (d[0] === 0 && d[1] < 0) ? [-d[0], -d[1]] : [d[0], d[1]];
      let hit = false;
      for (const u of uniq) {
        const c = Math.abs(u[0] * dd[0] + u[1] * dd[1]);
        if (c > Math.cos(15 * DEG)) { hit = true; break; }
      }
      if (!hit) uniq.push(dd);
    }
    let minAng = Math.PI / 2;
    if (uniq.length >= 2) {
      for (let a = 0; a < uniq.length; a += 1) {
        for (let b = a + 1; b < uniq.length; b += 1) {
          const c = Math.max(-1, Math.min(1, Math.abs(uniq[a][0] * uniq[b][0] + uniq[a][1] * uniq[b][1])));
          const ang = Math.acos(c);
          if (ang < minAng) minAng = ang;
        }
      }
    }
    const sinHalf = Math.max(1e-6, Math.sin(minAng / 2));
    // The disk must cover BOTH the angular ill-definition (hRef / 2 sin(phi/2)) and the MEASURED scatter of
    // the raw crossings, which is where the tracer itself could not tell the branches apart.
    const rawR = Math.max(o.hRefMm / (2 * sinHalf), j.spreadMm);
    const radiusMm = Math.max(o.hRefMm, Math.min(o.radiusMaxMm, rawR));
    junctions.push({
      id: junctions.length,
      theta: canonTheta(j.th),
      z: j.z,
      branches: uniq.length * 2,          // an undirected direction is two branches leaving the junction
      minAngleDeg: (minAng / DEG),
      radiusMm,
      radiusClamped: rawR > o.radiusMaxMm,
      spreadMm: j.spreadMm,
      nRaw: j.nRaw,
      lociIds: [...j.ids].sort((x, y) => x - y),
      source: j.source,
    });
  }

  let polylinePts = 0;
  let totalLengthMm = 0;
  for (const l of loci) { polylinePts += l.pts.length; totalLengthMm += l.lengthMm; }

  return {
    schema: LOCUS_SCHEMA,
    meta: {
      H,
      nu: o.nu,
      nv: o.nv,
      stepMm: o.stepMm,
      hRefMm: o.hRefMm,
      kink: { scan: o.pred.kinkScan, halvings: o.pred.kinkHalvings, ratio: o.pred.kinkRatio, jumpRatio: o.pred.jumpRatio },
      rEvals,
      wallMs: Date.now() - t0,
    },
    counts: {
      latticeProbes,
      crossings: allSeeds.length,
      jumpExcluded,
      seedsConsumed,
      loci: loci.length,
      lociDropped,
      junctions: junctions.length,
      rawJunctions: raw.length,
      junctionCells: junctionCells.length,
      polylinePts,
      totalLengthMm,
    },
    loci,
    junctions,
  };
}

// ───────────────────────────────────────── seam utility ─────────────────────────────────────────

/**
 * Cut an UNWRAPPED polyline into pieces that live inside [0, 2pi], inserting a vertex EXACTLY on the seam
 * at every crossing. This is `ConstrainedTriangulator.handleSeamCrossings` in radians: the piece that ends
 * at the seam ends at EXACTLY 2pi (or 0) and the next piece starts at EXACTLY 0 (or 2pi), so a consumer
 * that identifies theta=0 with theta=2pi gets a chain with NO edge spanning the cut domain.
 *
 * THE SPANNER IS THE FAILURE MODE, not a nicety: 2026-07-13 measured 56 chart-spanning constraint edges
 * producing 2,947 of 2,965 proper constraint crossings on the PSLG that crashed cdt2d.
 */
export function splitAtSeam(pts: Array<[number, number]>): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  const wrap = (th: number): number => {
    const w = canonTheta(th);
    return w;
  };
  for (let i = 0; i < pts.length; i += 1) {
    const [th, z] = pts[i];
    if (cur.length === 0) cur.push([wrap(th), z]);
    if (i + 1 >= pts.length) break;
    const [th1, z1] = pts[i + 1];
    const kA = Math.floor(th / TWO_PI);
    const kB = Math.floor(th1 / TWO_PI);
    if (kA === kB) { cur.push([wrap(th1), z1]); continue; }
    // crossing: find the seam parameter
    const boundary = (kB > kA ? kB : kA) * TWO_PI;
    const s = Math.abs(th1 - th) < 1e-18 ? 0.5 : (boundary - th) / (th1 - th);
    const zc = z + (z1 - z) * s;
    const endTh = kB > kA ? TWO_PI : 0;
    const startTh = kB > kA ? 0 : TWO_PI;
    cur.push([endTh, zc]);
    out.push(cur);
    cur = [[startTh, zc], [wrap(th1), z1]];
  }
  if (cur.length >= 2) out.push(cur);
  return out.filter((c) => c.length >= 2);
}

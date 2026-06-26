/**
 * fidelityMetric.ts — arclength-coverage recall/precision of a feature edge set
 * against a dense-truth locus set, in shared (u,t)→mm space (periodic u).
 *
 * This is the SAME metric `validation.test.ts` uses to gate the detector, lifted
 * into an importable module (parameterized by uToMm/tToMm) so the conditioner's
 * fidelity gate measures fidelity identically — the conditioned graph must not
 * regress the detector's recall/precision. (validation.test.ts keeps its inline
 * copy; this module is the shared, reusable form.)
 *
 *   recall    = fraction of TRUTH arclength with a detected edge within `tol` mm
 *   precision = fraction of DETECTED arclength within `tol` mm of a truth locus
 *
 * @module conforming/featureGraph/fidelityMetric
 */

/** A point in (u,t). */
export interface UtPoint {
  u: number;
  t: number;
}

/** A short densified sub-segment: midpoint + mm length. */
interface Sub {
  midU: number;
  midT: number;
  lenMm: number;
}

/** Shortest periodic distance in u ∈ [0,1). */
function uDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/** Distance in mm between two (u,t) points (periodic u). */
function distMm(u1: number, t1: number, u2: number, t2: number, uToMm: number, tToMm: number): number {
  return Math.hypot(uDist(u1, u2) * uToMm, (t1 - t2) * tToMm);
}

/** Densify a polyline of (u,t) points into ~`maxStepMm`-mm sub-segments. */
function densify(
  points: ReadonlyArray<UtPoint>,
  uToMm: number,
  tToMm: number,
  maxStepMm = 1.0,
): Sub[] {
  const subs: Sub[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = distMm(a.u, a.t, b.u, b.t, uToMm, tToMm);
    if (segLen < 1e-9) continue;
    const nSteps = Math.max(1, Math.ceil(segLen / maxStepMm));
    let du = (b.u - a.u) % 1;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    for (let s = 0; s < nSteps; s++) {
      const f0 = s / nSteps;
      const f1 = (s + 1) / nSteps;
      const u0 = a.u + du * f0;
      const u1 = a.u + du * f1;
      const t0 = a.t + (b.t - a.t) * f0;
      const t1 = a.t + (b.t - a.t) * f1;
      subs.push({
        midU: u0 + du * (0.5 / nSteps),
        midT: (t0 + t1) / 2,
        lenMm: distMm(u0, t0, u1, t1, uToMm, tToMm),
      });
    }
  }
  return subs;
}

function totalLen(subs: Sub[]): number {
  let s = 0;
  for (const x of subs) s += x.lenMm;
  return s;
}

/** Uniform spatial bucket index over sub-segments (periodic u). */
class SubIndex {
  private readonly nU: number;
  private readonly buckets = new Map<number, Sub[]>();
  constructor(targets: Sub[], private readonly cellMm: number, private readonly uToMm: number, private readonly tToMm: number) {
    this.nU = Math.max(1, Math.floor(uToMm / cellMm));
    for (const s of targets) {
      const key = this.key(s.midU, s.midT);
      const arr = this.buckets.get(key);
      if (arr) arr.push(s);
      else this.buckets.set(key, [s]);
    }
  }
  private uBucket(u: number): number {
    let b = Math.floor((((u % 1) + 1) % 1) * this.nU);
    if (b >= this.nU) b = this.nU - 1;
    return b;
  }
  private tBucket(t: number): number {
    return Math.floor((t * this.tToMm) / this.cellMm);
  }
  private key(u: number, t: number): number {
    return this.uBucket(u) * 100003 + this.tBucket(t);
  }
  has(u: number, t: number, tol: number): boolean {
    const tb = this.tBucket(t);
    const ub = this.uBucket(u);
    for (let dt = -1; dt <= 1; dt++) {
      for (let du = -1; du <= 1; du++) {
        const ubn = (((ub + du) % this.nU) + this.nU) % this.nU;
        const arr = this.buckets.get(ubn * 100003 + (tb + dt));
        if (!arr) continue;
        for (const tg of arr) {
          if (distMm(u, t, tg.midU, tg.midT, this.uToMm, this.tToMm) <= tol) return true;
        }
      }
    }
    return false;
  }
}

function coveredLen(subs: Sub[], target: SubIndex, tol: number): number {
  let cov = 0;
  for (const s of subs) if (target.has(s.midU, s.midT, tol)) cov += s.lenMm;
  return cov;
}

/** Recall/precision of detected polylines vs truth polylines at tolerance `tolMm`. */
export interface FidelityResult {
  recall: number;
  precision: number;
  truthLenMm: number;
  detLenMm: number;
}

/**
 * @param truthPolys  truth loci, each an ordered (u,t) polyline
 * @param detPolys    detected edges, each an ordered (u,t) polyline
 * @param tolMm       match tolerance (mm) — typically one detector fine cell
 */
export function fidelity(
  truthPolys: ReadonlyArray<ReadonlyArray<UtPoint>>,
  detPolys: ReadonlyArray<ReadonlyArray<UtPoint>>,
  uToMm: number,
  tToMm: number,
  tolMm: number,
): FidelityResult {
  const truthSubs: Sub[] = [];
  for (const p of truthPolys) truthSubs.push(...densify(p, uToMm, tToMm));
  const detSubs: Sub[] = [];
  for (const p of detPolys) detSubs.push(...densify(p, uToMm, tToMm));

  const cell = Math.max(tolMm, 2.5);
  const truthIdx = new SubIndex(truthSubs, cell, uToMm, tToMm);
  const detIdx = new SubIndex(detSubs, cell, uToMm, tToMm);
  const truthLen = totalLen(truthSubs);
  const detLen = totalLen(detSubs);
  return {
    recall: truthLen > 0 ? coveredLen(truthSubs, detIdx, tolMm) / truthLen : 1,
    precision: detLen > 0 ? coveredLen(detSubs, truthIdx, tolMm) / detLen : 1,
    truthLenMm: truthLen,
    detLenMm: detLen,
  };
}

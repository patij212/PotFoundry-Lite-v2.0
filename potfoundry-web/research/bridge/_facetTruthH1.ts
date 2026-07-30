// _facetTruthH1.ts — the H1 walk, extracted so the SERIAL path and every WORKER THREAD run the SAME code.
// RESEARCH ONLY.
//
// H1 is ~98% of the audit cycle (measured ~186 ms/facet, so full coverage of an 885k-facet mesh is ~46 h and
// at the default budget the audit reaches ~0.9% of a mesh). Each `certifyTriangle` call is independent and
// read-only against rA and the mesh, so the work parallelises exactly — but only if parallelising it cannot
// change a reported number. Two properties buy that, and both live here rather than in the caller:
//
//   (1) ONE LOOP BODY. `runH1Walk` is the only place a facet is certified and folded into an accumulator.
//       Serial and pooled differ ONLY in how they claim k-ranges and how they publish the sample budget.
//       `certifyTriangle` is called with the identical argument list either way, so every per-facet
//       certificate is bit-identical and the gate (_strataFacetTruthValidate) is untouched by construction.
//
//   (2) ORDER-INDEPENDENT REDUCTION. Everything the report prints is a sum, a max, or a top-K — all
//       commutative — and the two order-sensitive spots are given an explicit TOTAL order (value desc, then
//       triangle index asc) so equal-valued facets always name the same witness no matter which thread saw
//       them first, or in what order. Without that tie-break the pooled run would be a lottery on ties and
//       "reproduce the exact values" would be unmeetable.
//
// THE WALK ORDER IS PRESERVED EXACTLY. Facet k of the walk is still triangle (k*stride)%nTri with the
// golden-ratio stride chosen by the caller; workers consume that same permutation, just in parallel chunks.
// A capped pooled run is therefore still a low-discrepancy sample of the whole mesh, which is the entire
// reason the stride exists — see the stride comment in _strataFacetTruth.test.ts.
import { certifyTriangle, type FacetVerdict, type RadiusFn } from './_facetTruthLib';

/** Everything a walker needs that is not the mesh, rA, or the claim protocol. Plain JSON — thread-portable. */
export interface H1Job {
  nTri: number;
  /** golden-ratio stride; facet k of the walk is triangle (k*stride)%nTri */
  stride: number;
  /** walk indices [0,kEnd) — nTri normally, less when PF_FT_H1MAX caps the facet count for an exact A/B */
  kEnd: number;
  H: number; tol: number; nMax: number; sampleCap: number;
  zJumps: number[]; thJumps: number[];
  topK: number;
  /** absolute epoch-ms deadline; checked after every facet, in both modes */
  deadlineMs: number;
}

/** One walker's partial result. Every field is reduced commutatively by `mergeH1`. */
export interface H1Partial {
  audited: number; samples: number; rEvals: number;
  worstUB: number; worstUBTri: number;
  nOver: number; nUncert: number; nIncomplete: number;
  /** top-K witnessed values, sorted by the total order below */
  kD: number[]; kTri: number[]; kP: number[];
}

/**
 * THE TOTAL ORDER on facet readings: larger value first, and among exactly equal values the smaller triangle
 * index first. Ties on a float distance are not hypothetical — coincident-vertex facets and untouched
 * flat regions read exactly 0.0 in bulk — and without the index tie-break the winner of a tie is whichever
 * thread happened to get there first.
 */
export function h1Before(d1: number, t1: number, d2: number, t2: number): boolean {
  return d1 > d2 || (d1 === d2 && t1 < t2);
}

/** Running accumulator: sums, an argmax, and a genuine top-K by value. */
export class H1Acc {
  audited = 0; samples = 0;
  worstUB = 0; worstUBTri = -1;
  nOver = 0; nUncert = 0; nIncomplete = 0;
  readonly kD: number[] = []; readonly kTri: number[] = []; readonly kP: number[] = [];
  constructor(private readonly topK: number, private readonly tol: number) {}

  /**
   * A RUNNING TOP-K BY VALUE, not the first K*8 encountered — and now with a deterministic tie-break, see
   * `h1Before`. Costs an insertion into a K-element array.
   */
  pushTop(tri: number, d: number, px: number, py: number, pz: number): void {
    const n = this.kD.length;
    if (n >= this.topK && !h1Before(d, tri, this.kD[n - 1], this.kTri[n - 1])) return;
    let s = n;
    while (s > 0 && h1Before(d, tri, this.kD[s - 1], this.kTri[s - 1])) s -= 1;
    this.kD.splice(s, 0, d); this.kTri.splice(s, 0, tri); this.kP.splice(s * 3, 0, px, py, pz);
    if (this.kD.length > this.topK) { this.kD.pop(); this.kTri.pop(); this.kP.length = this.topK * 3; }
  }

  /**
   * argmax of the certified bound. Strict `>` against the initial 0 exactly as the serial walk always did
   * (so a mesh whose bounds are all 0 still reports "no locus" rather than naming an arbitrary facet), with
   * the index tie-break applying only once a real maximum exists.
   */
  mergeUB(tri: number, bound: number): void {
    if (bound > this.worstUB || (bound === this.worstUB && this.worstUBTri >= 0 && tri < this.worstUBTri)) {
      this.worstUB = bound; this.worstUBTri = tri;
    }
  }

  push(tri: number, v: FacetVerdict): void {
    this.samples += v.samples;
    this.mergeUB(tri, v.bound);
    this.pushTop(tri, v.witnessed, v.px, v.py, v.pz);
    if (v.witnessed > this.tol) this.nOver += 1;
    else if (!v.certified) this.nUncert += 1;
    // `witnessed` is only the CONVERGED facet maximum when the certifier exited by certifying; on a
    // short-circuited or capped facet it is a lower bound with unquantified slack.
    if (!v.witnessedComplete) this.nIncomplete += 1;
    this.audited += 1;
  }

  toPartial(rEvals: number): H1Partial {
    return {
      audited: this.audited, samples: this.samples, rEvals,
      worstUB: this.worstUB, worstUBTri: this.worstUBTri,
      nOver: this.nOver, nUncert: this.nUncert, nIncomplete: this.nIncomplete,
      kD: this.kD.slice(), kTri: this.kTri.slice(), kP: this.kP.slice(),
    };
  }
}

/** Claim the next half-open k-range of the walk, or null when the walk is exhausted or stopped. */
export type ChunkClaim = () => readonly [number, number] | null;
/** Publish the samples one facet cost. Return true to stop the whole walk (global sample budget hit). */
export type SamplePublish = (samples: number) => boolean;

/**
 * Walk the mesh under `claim`, certifying every facet and folding it into an accumulator.
 * Serial passes a claim that yields [0,kEnd) once; a pooled worker passes a claim backed by an atomic cursor.
 */
export function runH1Walk(
  rA: RadiusFn, xyz: Float64Array, job: H1Job, claim: ChunkClaim, publish: SamplePublish, rEvals: () => number,
): H1Partial {
  const acc = new H1Acc(job.topK, job.tol);
  const opts = { H: job.H, tol: job.tol, nMax: job.nMax, sampleCap: job.sampleCap, zJumps: job.zJumps, thJumps: job.thJumps };
  walk: for (;;) {
    const c = claim();
    if (c === null) break;
    for (let k = c[0]; k < c[1]; k += 1) {
      const t = (k * job.stride) % job.nTri;
      const o = t * 9;
      const v = certifyTriangle(rA,
        xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
        opts);
      acc.push(t, v);
      // Stopping early leaves triangles UNSEEN, and an unseen triangle is not a passing triangle — the caller
      // downgrades the verdict to INCOMPLETE whenever `audited < nTri`.
      if (publish(v.samples)) break walk;
      if (Date.now() > job.deadlineMs) break walk;
    }
  }
  return acc.toPartial(rEvals());
}

/** Reduce partials into one result. Pure, commutative, and identical for 1 partial or W. */
export function mergeH1(parts: readonly H1Partial[], topK: number, tol: number): H1Partial {
  const acc = new H1Acc(topK, tol);
  let rEvals = 0;
  for (const p of parts) {
    acc.audited += p.audited; acc.samples += p.samples; rEvals += p.rEvals;
    acc.nOver += p.nOver; acc.nUncert += p.nUncert; acc.nIncomplete += p.nIncomplete;
    if (p.worstUBTri >= 0) acc.mergeUB(p.worstUBTri, p.worstUB);
    for (let i = 0; i < p.kD.length; i += 1) acc.pushTop(p.kTri[i], p.kD[i], p.kP[i * 3], p.kP[i * 3 + 1], p.kP[i * 3 + 2]);
  }
  return acc.toPartial(rEvals);
}

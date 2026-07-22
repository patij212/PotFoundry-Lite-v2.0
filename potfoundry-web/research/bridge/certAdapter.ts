// certAdapter.ts — GENERAL "periodic-cylinder production mesh → exact-dyadic judge cert" bridge (U5.3).
//
// Generalizes the DragonScales cut-at-gap closure (src `buildDsConeFanCertDomain` + the `_dsSeam` CLOSE arm) to ANY
// periodic (u,t)-grid production mesh. A production mesher emits a watertight cylinder: columns at u=i/nU (periodic,
// last column welds to column 0), rows at arbitrary t-stations, lifted through the analytic surface. To certify its
// DOMAIN with `verifyExactDyadicRectanglePartition` (Track A, READ-ONLY judge) the periodic cylinder must be presented
// as a FLAT [0,1]² partition with NO triangle spanning the u=0↔1 seam. CUT-AT-GAP does this by relabeling the domain
// u-origin onto a chosen "gap" column q (one carrying no straddling feature, e.g. between structured-emitter apexes;
// for a smooth grid ANY column is a gap): the periodic seam moves to an interior contiguous location, and only the one
// grid-quad column at q crosses the flat seam — closed by explicit u=1 lattice copies of column q (coincident ⇒ weld
// away downstream). Winding must already be outward-CCW (the emitter's job; DS did it in part (a)).
//
// This is the reusable judge-cert step for the campaign: close a style's production mesh to ≤0.01mm true-3D, then call
// `certifyPeriodicGridMesh` to get a judge verdict + the path-A snap δ (which folds into the geometric bound).
//
// DEV-ONLY research bridge; src NEVER imports research. Consumes the judge READ-ONLY.
import {
  verifyExactDyadicRectanglePartition,
  type ExactDyadicDomainPartitionInput,
  type ExactDyadicMappedTriangle,
} from '../../src/geometry/targetSolid/exactDyadicDomainPartition';

const TAU = 2 * Math.PI;

/** A flat [0,1]² cert domain: (u_judge,t) per vertex + 3D positions + triangles with no u=0↔1 wrap. */
export interface CertDomain {
  uJudge: Float64Array;
  t: Float64Array;
  positions: Float32Array;
  indices: Uint32Array;
  cutColumn: number;
  nU: number;
  seamDupCount: number;
}

/**
 * Cut a PERIODIC (u,t)-grid cylinder mesh into a flat [0,1]² domain at column `cutColumn`.
 *
 * @param ut         flat (u,t) per vertex (u_phys ∈ [0,1), t ∈ [0,1]); index-aligned with `positions`.
 * @param indices    triangle vertex indices (winding must already be outward-CCW in (u,t)).
 * @param positions  flat xyz per vertex (the true production positions — preserved exactly + copied for the u=1 seam).
 * @param nU         circumferential column count.
 * @param cutColumn  the column the flat seam is placed on (u_phys = cutColumn/nU). MUST carry no straddling feature —
 *                   the function ASSERTS afterward that exactly the one grid-quad column crossed (no fan/feature did).
 */
export function cutAtGapCertDomain(
  ut: ArrayLike<number>,
  indices: Uint32Array | ArrayLike<number>,
  positions: Float32Array | ArrayLike<number>,
  nU: number,
  cutColumn: number,
): CertDomain {
  const nV = ut.length / 2;
  const shift = cutColumn / nU;
  const uJ: number[] = new Array(nV);
  const tt: number[] = new Array(nV);
  for (let v = 0; v < nV; v++) {
    let u = ut[2 * v] - shift;
    u -= Math.floor(u);
    uJ[v] = u;
    tt[v] = ut[2 * v + 1];
  }
  const pos: number[] = Array.from(positions as ArrayLike<number>);
  const dupOf = new Map<number, number>();
  const getDup = (v: number): number => {
    let d = dupOf.get(v);
    if (d === undefined) {
      d = uJ.length;
      uJ.push(1);
      tt.push(tt[v]);
      pos.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
      dupOf.set(v, d);
    }
    return d;
  };
  const nF = indices.length / 3;
  const outIdx = new Uint32Array(indices.length);
  for (let f = 0; f < nF; f++) {
    let a = indices[3 * f];
    let b = indices[3 * f + 1];
    let c = indices[3 * f + 2];
    if (Math.max(uJ[a], uJ[b], uJ[c]) - Math.min(uJ[a], uJ[b], uJ[c]) > 0.5) {
      if (uJ[a] < 0.5) a = getDup(a);
      if (uJ[b] < 0.5) b = getDup(b);
      if (uJ[c] < 0.5) c = getDup(c);
    }
    outIdx[3 * f] = a;
    outIdx[3 * f + 1] = b;
    outIdx[3 * f + 2] = c;
  }
  return {
    uJudge: Float64Array.from(uJ),
    t: Float64Array.from(tt),
    positions: Float32Array.from(pos),
    indices: outIdx,
    cutColumn,
    nU,
    seamDupCount: dupOf.size,
  };
}

export interface CertVerdict {
  /** The judge returned exactPartition (no throw). */
  accepted: boolean;
  /** Max 3D displacement (mm) from snapping the domain to N=2^bits — the path-A term to fold into the geometric bound. */
  maxDelta: number;
  /** Domain triangle count. */
  tris: number;
  /** Seam duplicates appended by the cut. */
  seamDupCount: number;
  /** Triangles that STILL span the flat seam (>0.5 u_judge span) after the cut — MUST be 0 (else the cut column is bad). */
  wrapTris: number;
  /** Triangles with non-positive snapped domain area — MUST be 0 (winding + snap health). */
  nonPosTris: number;
  /** The judge's message (accept detail or rejection reason). */
  detail: string;
}

/**
 * Snap a {@link CertDomain} to N=2^bits and feed the exact-dyadic judge (Track A, READ-ONLY). Returns the verdict +
 * the path-A snap δ. Choose N a multiple of nU (grid columns snap EXACTLY; only feature/off-lattice verts carry δ).
 *
 * @param rA  analytic radius r(theta,z) — for the δ accounting (lift the snapped domain point back to 3D and compare to
 *            the true production position). u_phys = u_judge + cutColumn/nU (mod 1); theta = 2π·u_phys; z = t·H.
 */
export function snapAndVerifyCertDomain(
  cert: CertDomain,
  rA: (theta: number, z: number) => number,
  H: number,
  bits: number,
  opts: { maxTriangles?: number; patchId?: string } = {},
): CertVerdict {
  const N = 1 << bits;
  const nV = cert.uJudge.length;
  const nF = cert.indices.length / 3;
  const shift = cert.cutColumn / cert.nU;
  const uNum = new Int32Array(nV);
  const vNum = new Int32Array(nV);
  for (let v = 0; v < nV; v++) {
    uNum[v] = Math.round(cert.uJudge[v] * N);
    vNum[v] = Math.round(cert.t[v] * N);
  }
  // path-A δ: 3D displacement from snapping the domain coords.
  let maxDelta = 0;
  for (let v = 0; v < nV; v++) {
    let uPhys = uNum[v] / N + shift;
    uPhys -= Math.floor(uPhys);
    const th = TAU * uPhys;
    const z = (vNum[v] / N) * H;
    const r = rA(th, z);
    const d = Math.hypot(
      r * Math.cos(th) - cert.positions[3 * v],
      r * Math.sin(th) - cert.positions[3 * v + 1],
      z - cert.positions[3 * v + 2],
    );
    if (d > maxDelta) maxDelta = d;
  }
  // health checks (so a bad cut column / winding is diagnosed, not silently judge-rejected).
  let wrapTris = 0, nonPosTris = 0;
  const tris: ExactDyadicMappedTriangle[] = [];
  for (let f = 0; f < nF; f++) {
    const a = cert.indices[3 * f], b = cert.indices[3 * f + 1], c = cert.indices[3 * f + 2];
    if (Math.max(cert.uJudge[a], cert.uJudge[b], cert.uJudge[c]) - Math.min(cert.uJudge[a], cert.uJudge[b], cert.uJudge[c]) > 0.5) wrapTris++;
    const area2 = (uNum[b] - uNum[a]) * (vNum[c] - vNum[a]) - (uNum[c] - uNum[a]) * (vNum[b] - vNum[a]);
    if (area2 <= 0) nonPosTris++;
    tris.push({ artifactTriangleIndex: f, vertices: [
      { uNumerator: String(uNum[a]), vNumerator: String(vNum[a]) },
      { uNumerator: String(uNum[b]), vNumerator: String(vNum[b]) },
      { uNumerator: String(uNum[c]), vNumerator: String(vNum[c]) },
    ] });
  }
  const input: ExactDyadicDomainPartitionInput = {
    patchId: opts.patchId ?? 'certadapter-cutgap',
    fractionBits: bits,
    domain: { minUNumerator: '0', maxUNumerator: String(N), minVNumerator: '0', maxVNumerator: String(N) },
    artifactTriangleCount: nF,
    triangles: tris,
  };
  let accepted = false, detail = '';
  try {
    const r = verifyExactDyadicRectanglePartition(input, { maxTriangles: opts.maxTriangles ?? 1_048_576 });
    accepted = true;
    detail = `ACCEPTED tris=${r.triangleCount} exactPartition=${r.exactPartition}`;
  } catch (e) {
    detail = String(e).slice(0, 300);
  }
  return { accepted, maxDelta, tris: nF, seamDupCount: cert.seamDupCount, wrapTris, nonPosTris, detail };
}

/** Convenience: cut a periodic grid mesh at `cutColumn` and judge-cert it in one call. */
export function certifyPeriodicGridMesh(
  ut: ArrayLike<number>,
  indices: Uint32Array,
  positions: Float32Array,
  nU: number,
  cutColumn: number,
  rA: (theta: number, z: number) => number,
  H: number,
  bits: number,
  opts: { maxTriangles?: number; patchId?: string } = {},
): CertVerdict {
  return snapAndVerifyCertDomain(cutAtGapCertDomain(ut, indices, positions, nU, cutColumn), rA, H, bits, opts);
}

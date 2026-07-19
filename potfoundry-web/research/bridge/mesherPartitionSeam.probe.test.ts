// mesherPartitionSeam.probe.test.ts — TRACK B / U5.3: SCOPE the mesher→partition certification seam.
//
// DEV-ONLY, env-gated (PF_SEAM), NEW FILE, READ-ONLY of targetSolid (Track A owns it) + the production mesher.
// This is a SCOPING probe, NOT an implementation. It concretizes the interface gap between:
//   (produced) the production conforming mesher's FLOAT64 (u,t) periodic wall, watertight-by-3D-index; and
//   (consumed) the judge `verifyExactDyadicRectanglePartition` — integer numerators over ONE declared denominator
//              N = oddFactor·2^b forming an EXACT rectangle partition (no T-junctions, exact shared edges, positive
//              area, periodic seam welded to bitwise-equal coordinates), each domain triangle ↔ artifact STL triangle.
//
// RED (the seam, dormant): snapping the production float (u,t) to a dyadic lattice and feeding the domain triangles to
// the judge is REJECTED — the periodic u≈1→u≈0 WRAP triangles become full-width overlaps in the flat [0,1] rectangle,
// and sliver facets collapse to zero area. This is the measured statement of WHY production meshes are not certifiable
// as-is. GREEN is Track A's: either (B) a lattice-native emit (refine places every vertex on the declared N-lattice,
// features on k/N, seam evaluated once) OR (A) a snap+repair converter that seam-splits wrap triangles, drops/merges
// zero-area cells, and ACCOUNTS the dyadic-snap correspondence error δ=|vertex3D − target(snappedUV)| into the bound.
//
// Run: PF_SEAM=1 npx vitest run research/bridge/mesherPartitionSeam.probe.test.ts
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildConformingOuterWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingOuterWall';
import {
  verifyExactDyadicRectanglePartition,
  type ExactDyadicDomainPartitionInput,
  type ExactDyadicMappedTriangle,
} from '../../src/geometry/targetSolid/exactDyadicDomainPartition';

const RUN = process.env.PF_SEAM === '1';

describe('mesher→partition seam (U5.3 scope)', () => {
  it.skipIf(!RUN)('production float-UV wall is NOT an exact-dyadic partition (the seam, RED)', () => {
    const B = 16; // dyadic lattice N = 2^16
    const DEN = 1 << B;
    const sampler = styleSampler('GeometricStar', {}, { H: 120, Rb: 40, Rt: 50, expn: 1 });
    // Small wall so the domain-triangle count stays inside the partition proof cap and the probe is fast.
    const wall = buildConformingOuterWall(sampler, {
      maxSagMm: 0.2, maxEdgeMm: 8, minEdgeMm: 0.5, gradeRatio: 2, maxLevel: 5, resU: 33, resT: 17,
    });
    const nV = wall.vertices.length / 3;
    // Snap each vertex's (u,t) ONCE to the dyadic lattice (index-shared ⇒ shared vertices snap identically).
    const uNum = new Int32Array(nV), vNum = new Int32Array(nV);
    for (let i = 0; i < nV; i++) {
      uNum[i] = Math.round(wall.vertices[3 * i] * DEN);
      vNum[i] = Math.round(wall.vertices[3 * i + 1] * DEN);
    }
    const nF = wall.indices.length / 3;
    let wrapTris = 0, zeroAreaAfterSnap = 0;
    const triangles: ExactDyadicMappedTriangle[] = [];
    for (let f = 0; f < nF; f++) {
      const a = wall.indices[3 * f], b = wall.indices[3 * f + 1], c = wall.indices[3 * f + 2];
      const span = Math.max(uNum[a], uNum[b], uNum[c]) - Math.min(uNum[a], uNum[b], uNum[c]);
      if (span > DEN / 2) wrapTris++; // periodic wrap triangle → full-width in a flat rectangle
      const area2 = (uNum[b] - uNum[a]) * (vNum[c] - vNum[a]) - (uNum[c] - uNum[a]) * (vNum[b] - vNum[a]);
      if (area2 === 0) zeroAreaAfterSnap++;
      triangles.push({
        artifactTriangleIndex: f,
        vertices: [
          { uNumerator: String(uNum[a]), vNumerator: String(vNum[a]) },
          { uNumerator: String(uNum[b]), vNumerator: String(vNum[b]) },
          { uNumerator: String(uNum[c]), vNumerator: String(vNum[c]) },
        ],
      });
    }
    const input: ExactDyadicDomainPartitionInput = {
      patchId: 'seamscope-geometricstar',
      fractionBits: B,
      domain: { minUNumerator: '0', maxUNumerator: String(DEN), minVNumerator: '0', maxVNumerator: String(DEN) },
      artifactTriangleCount: nF,
      triangles,
    };
    let rejected = false; let detail = '';
    try {
      const res = verifyExactDyadicRectanglePartition(input) as unknown as { complete?: boolean; valid?: boolean };
      rejected = res.complete === false || res.valid === false;
      detail = JSON.stringify(res).slice(0, 200);
    } catch (e) { rejected = true; detail = String(e).slice(0, 200); }
    // eslint-disable-next-line no-console
    console.log(`[seam] tris=${nF} wrapTris=${wrapTris} zeroAreaAfterSnap=${zeroAreaAfterSnap} rejected=${rejected} :: ${detail}`);
    // THE SEAM: the production float-UV periodic wall is not a valid exact-dyadic flat-rectangle partition.
    // wrapTris>0 (periodic seam not welded/seam-split) OR zeroAreaAfterSnap>0 (slivers collapse) is the concrete gap.
    expect(wrapTris + zeroAreaAfterSnap).toBeGreaterThan(0);
    expect(rejected).toBe(true);
  }, 5 * 60 * 1000);
});

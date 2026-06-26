/**
 * featureStrip.test.ts — the ridge strip-pave primitive (paveRidge).
 *
 * paveRidge productionizes the PROVEN feature-following construction (Step-1 +
 * the featurefollow de-risk): given a feature SPINE (a conditioned-graph edge
 * polyline) on a surface, it paves TWO flank bands that SHARE the spine rail, so
 * the spine becomes a single watertight CREASE EDGE with well-shaped flank rows
 * running parallel to it — the serration-killer. Rows are metric-sized in 3D.
 *
 * This gate proves the construction on a ridge of a rippled cylinder (an exact
 * analytic ridge): the mesh is watertight, the spine crease is shared by exactly
 * two triangles per edge (one per flank), and the flank triangles are well-shaped
 * (no slivers) — density-invariant, like the Step-1 result.
 *
 * @module fidelity/bandRemesh/featureStrip.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { paveRidge } from './featureStrip';
import type { StationPoint } from './stations';

// A rippled cylinder with k=8 ridges; the ridge crests sit at u = j/8.
const R0 = 50;
const H = 100;
const AMP = 6;
const K = 8;
const sampler = new SyntheticCylinderSampler(R0, H, AMP, K);

/** A straight spine up the ridge crest at u=0 (cos(2πk·0)=1 → max radius). */
function ridgeSpine(): StationPoint[] {
  return [
    { u: 0, t: 0.05 },
    { u: 0, t: 0.95 },
  ];
}

/** Worst (min over triangles) 3D min interior angle of a mesh, degrees. */
function worstMinAngle(mesh: Mesh3): number {
  const { positions, indices } = mesh;
  const P = (i: number): [number, number, number] => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const ang = (A: number[], B: number[], C: number[]): number => {
    const d = (p: number[], q: number[]): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const a = d(B, C), b = d(C, A), c = d(A, B);
    const g = (x: number, y: number, o: number): number =>
      x <= 0 || y <= 0 ? 0 : (Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - o * o) / (2 * x * y)))) * 180) / Math.PI;
    return Math.min(g(b, c, a), g(a, c, b), g(a, b, c));
  };
  let worst = Infinity;
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || c === a) continue;
    worst = Math.min(worst, ang(P(a), P(b), P(c)));
  }
  return worst === Infinity ? 0 : worst;
}

describe('paveRidge — watertight ridge strip-pave (shared crease)', () => {
  for (const edgeMm of [3.0, 1.5]) {
    describe(`edgeMm ${edgeMm}`, () => {
      const run = () => paveRidge(ridgeSpine(), sampler, { widthMm: 6, edgeMm });

      it('produces a non-empty two-flank mesh', () => {
        const r = run();
        expect(r.mesh.indices.length).toBeGreaterThan(0);
        expect(r.mesh.indices.length % 3).toBe(0);
        expect(r.spineVertexIds.length).toBeGreaterThan(2);
      });

      it('GATE: watertight — no non-manifold edges, no interior T-junctions', () => {
        const { mesh, openBoundaryVertices } = run();
        const audit = auditWatertight(mesh, { boundaryVertexIndices: openBoundaryVertices });
        expect(audit.nonManifoldEdges).toBe(0);
        expect(audit.tJunctions).toBe(0);
      });

      it('GATE: the spine is a shared CREASE — every spine edge used by exactly 2 triangles', () => {
        const { mesh, spineVertexIds } = run();
        const spineSet = new Set(spineVertexIds);
        const edgeCount = new Map<string, number>();
        const { indices } = mesh;
        for (let k = 0; k < indices.length; k += 3) {
          const tri = [indices[k], indices[k + 1], indices[k + 2]];
          for (const [i, j] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]] as const) {
            const key = i < j ? `${i}:${j}` : `${j}:${i}`;
            edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
          }
        }
        // Consecutive spine vertices form crease edges shared by the two flanks.
        let creaseEdges = 0;
        for (let i = 0; i + 1 < spineVertexIds.length; i++) {
          const a = spineVertexIds[i], b = spineVertexIds[i + 1];
          if (a === b) continue;
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          const c = edgeCount.get(key);
          if (c !== undefined) {
            creaseEdges++;
            expect(c).toBe(2); // one triangle from each flank
          }
        }
        expect(creaseEdges).toBeGreaterThan(0);
        expect(spineSet.size).toBe(spineVertexIds.length); // spine ids unique
      });

      it('feature-following flank quality: worst 3D min-angle is sliver-free (≥20°)', () => {
        const { mesh } = run();
        const q = triangleQuality3D(mesh);
        const worst = worstMinAngle(mesh);
        // eslint-disable-next-line no-console
        console.log(`paveRidge edge=${edgeMm}mm: worstMinAngle=${worst.toFixed(1)}° p50=${q.minAngleP50.toFixed(1)}° aspectMax=${q.aspectMax.toFixed(2)}`);
        expect(worst).toBeGreaterThanOrEqual(20);
        expect(q.pctMinAngleBelow10).toBe(0);
      });
    });
  }

  it('NEGATIVE CONTROL: splitting a shared spine vertex opens a T-junction', () => {
    const { mesh, openBoundaryVertices, spineVertexIds } = paveRidge(ridgeSpine(), sampler, { widthMm: 6, edgeMm: 3 });
    const clean = auditWatertight(mesh, { boundaryVertexIndices: openBoundaryVertices });
    expect(clean.tJunctions).toBe(0);

    // Duplicate one interior spine vertex and repoint the triangles on ONE side.
    const split = spineVertexIds[Math.floor(spineVertexIds.length / 2)];
    const newPositions = new Float32Array(mesh.positions.length + 3);
    newPositions.set(mesh.positions);
    newPositions[mesh.positions.length] = mesh.positions[split * 3];
    newPositions[mesh.positions.length + 1] = mesh.positions[split * 3 + 1];
    newPositions[mesh.positions.length + 2] = mesh.positions[split * 3 + 2];
    const newIdx = mesh.positions.length / 3;
    const newIndices = new Uint32Array(mesh.indices);
    // Repoint the FIRST triangle that references `split` (breaks the shared weld).
    for (let k = 0; k < newIndices.length; k += 3) {
      let touched = false;
      for (let s = 0; s < 3; s++) if (newIndices[k + s] === split) { newIndices[k + s] = newIdx; touched = true; }
      if (touched) break;
    }
    const cracked = auditWatertight({ positions: newPositions, indices: newIndices }, { boundaryVertexIndices: openBoundaryVertices });
    expect(cracked.tJunctions).toBeGreaterThan(0);
  });
});

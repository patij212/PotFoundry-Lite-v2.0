// research/spike-raycast-oracle/conditionC.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateMeshForExport } from '../../src/geometry/exportValidation';
import { detectSelfIntersections } from '../../src/geometry/selfIntersection';
import { generateBinarySTL } from '../../src/geometry/stlExport';
import type { MeshData } from '../../src/geometry/types';

export interface ConditionCReport {
  ok: boolean;
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationMismatches: number;
  selfIntersections: number;
  triangleCount: number;
  stlPath: string;
  errors: string[];
}

export function checkConditionC(
  solid: { pos3D: Float32Array; indices: Uint32Array },
  styleId: string, outDir: string,
): ConditionCReport {
  const mesh: MeshData = {
    vertices: solid.pos3D,
    indices: solid.indices,
    vertexCount: solid.pos3D.length / 3,
    triangleCount: solid.indices.length / 3,
  };
  const report = validateMeshForExport(mesh);
  const si = detectSelfIntersections(mesh);

  mkdirSync(outDir, { recursive: true });
  const stlPath = join(outDir, `${styleId}.stl`);
  const buf = generateBinarySTL(mesh, styleId); // ArrayBuffer; runs winding repair internally
  writeFileSync(stlPath, Buffer.from(buf));

  return {
    ok: report.ok && !si.intersects,
    boundaryEdges: report.boundaryEdges,
    nonManifoldEdges: report.nonManifoldEdges,
    orientationMismatches: report.orientationMismatches,
    selfIntersections: si.count,
    triangleCount: mesh.triangleCount,
    stlPath,
    errors: report.errors,
  };
}

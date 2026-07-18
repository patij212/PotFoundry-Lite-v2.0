// mesh.ts — the growable-mesh helper for the double-valued mesher.

import type { Mesh } from './types';
import type { MeshData } from '../types';

/** A fresh empty mesh with its per-vertex tag arrays initialised. */
export const createMesh = (): Mesh => ({
  positions: [],
  triangles: [],
  vertexOnCliff: [],
  vertexOnRim: [],
  vertexU: [],
  vertexT: [],
  vertexRegion: [],
  vertexCliffSeg: [],
  regionIsRibbon: [],
});

/** Append a vertex; returns its index. Tag arrays are filled by the caller in lockstep. */
export function addVertex(m: Mesh, x: number, y: number, z: number): number {
  const id = m.positions.length / 3;
  m.positions.push(x, y, z);
  return id;
}

/** Append one triangle (three existing vertex indices). */
export const addTriangle = (m: Mesh, a: number, b: number, c: number): void => {
  m.triangles.push(a, b, c);
};

/** Append a quad as two triangles (a,b,c)+(a,c,d) sharing the a-c diagonal. */
export const addQuad = (m: Mesh, a: number, b: number, c: number, d: number): void => {
  m.triangles.push(a, b, c, a, c, d);
};

/** Freeze the growable mesh into the app's typed `MeshData`. */
export function toMeshData(m: Mesh): MeshData {
  return {
    vertices: new Float32Array(m.positions),
    indices: new Uint32Array(m.triangles),
    vertexCount: m.positions.length / 3,
    triangleCount: m.triangles.length / 3,
  };
}

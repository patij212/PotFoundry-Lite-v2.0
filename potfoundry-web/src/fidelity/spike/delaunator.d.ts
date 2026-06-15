// Minimal ambient types for the `delaunator` dependency (no @types package), scoped
// for the throwaway metric-Delaunay spike. Covers only the surface this spike uses.
declare module 'delaunator' {
  export default class Delaunator {
    constructor(coords: ArrayLike<number>);
    readonly triangles: Uint32Array;
    readonly halfedges: Int32Array;
    static from(
      points: ArrayLike<ArrayLike<number>>,
      getX?: (p: ArrayLike<number>) => number,
      getY?: (p: ArrayLike<number>) => number,
    ): Delaunator;
  }
}

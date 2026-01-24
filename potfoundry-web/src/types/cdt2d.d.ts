declare module 'cdt2d' {
    type Point = [number, number];
    type Edge = [number, number];
    /**
     * Constrained Delaunay Triangulation
     * @param points - Array of [x, y] points
     * @param edges - Array of [p1_idx, p2_idx] constraint edges
     * @param options - { exterior: boolean }
     * @returns Array of [p1_idx, p2_idx, p3_idx] triangles
     */
    function cdt2d(points: Point[], edges?: Edge[], options?: { exterior?: boolean }): [number, number, number][];
    export = cdt2d;
}

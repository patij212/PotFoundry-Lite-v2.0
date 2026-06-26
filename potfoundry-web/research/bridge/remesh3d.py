"""
remesh3d.py — DEV-ONLY 3D-direct surface remesher (research lab; nothing ships).

Experiment E-2026-06-26-3D-DIRECT-VS-UV. Reads a DENSE 3D true-surface mesh
(vertices lifted analytically from a fine (u,t) grid — the reference surface) and
remeshes it by REAL 3D-surface criteria to a target triangle count, so the
TS-side instruments (perpendicular3DDeviation + triangleQualityDistribution) can
score it at equal triangle budget against the UV-(u,t)-metric oracles (gmsh).

Two independent 3D-direct methods (different mechanisms, cross-check):
  - cvt : pyacvd surface Centroidal-Voronoi clustering -> uniform well-shaped
          triangles placed ON the surface (the principled "mesh the surface,
          not the flat UV" candidate). Resamples; does NOT keep truth vertices.
  - qem : fast_simplification Garland-Heckbert quadric-error decimation of the
          dense truth -> keeps a subset of the truth vertices, collapses edges by
          surface error. A pure error-driven decimation of the true surface.

CLI (stateless, file-in/file-out, mirrors oracle.py):
  python remesh3d.py --in <dir> --method <cvt|qem> --target-tris <N>
    reads  <dir>/dense.json   {vertices:[x,y,z,...], indices:[i,j,k,...]}
    writes <dir>/remesh_<method>.json {method,vertices,indices,targetTris,ms,version}
"""
import argparse, json, os, sys, time


def _load_dense(path):
    with open(path) as f:
        d = json.load(f)
    import numpy as np
    v = np.asarray(d["vertices"], dtype=np.float64).reshape(-1, 3)
    f3 = np.asarray(d["indices"], dtype=np.int64).reshape(-1, 3)
    return v, f3


def remesh_cvt(v, f3, target_tris):
    """Surface CVT clustering (pyacvd). nclus calibrated to hit target_tris.

    For a 2-manifold patch with boundary, Euler gives tris ~= 2*pts - (boundary+2),
    so pts ~= target_tris/2 is a good first guess; we binary-search nclus once to
    land within ~3% (CVT cluster count != exact output tri count)."""
    import numpy as np
    import pyvista as pv
    import pyacvd

    faces = np.empty((f3.shape[0], 4), dtype=np.int64)
    faces[:, 0] = 3
    faces[:, 1:] = f3
    mesh = pv.PolyData(v, faces.ravel())
    mesh = mesh.clean().triangulate()

    def make(nclus):
        clus = pyacvd.Clustering(mesh)
        # subdivide so every cluster has enough candidate vertices (uniform CVT)
        # dense truth is already fine (>250k tris); 0-1 subdiv suffices.
        clus.cluster(int(nclus))
        rm = clus.create_mesh().triangulate()
        rf = rm.faces.reshape(-1, 4)[:, 1:].astype(np.int64)
        return np.asarray(rm.points, dtype=np.float64), rf

    nclus = max(8, target_tris // 2)
    pts, rf = make(nclus)
    # one proportional correction (CVT tri count is ~monotone in nclus)
    if rf.shape[0] > 0:
        ratio = target_tris / rf.shape[0]
        if abs(ratio - 1.0) > 0.05:
            nclus = max(8, int(round(nclus * ratio)))
            pts, rf = make(nclus)
    return pts, rf


def remesh_qem(v, f3, target_tris):
    """QEM decimation of the dense truth (fast_simplification / Garland-Heckbert)."""
    import numpy as np
    import fast_simplification as fs

    pts, rf = fs.simplify(
        v.astype(np.float32), f3.astype(np.int32),
        target_count=int(target_tris),
    )
    return np.asarray(pts, dtype=np.float64), np.asarray(rf, dtype=np.int64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="indir", required=True)
    ap.add_argument("--method", required=True, choices=["cvt", "qem"])
    ap.add_argument("--target-tris", type=int, required=True)
    args = ap.parse_args()

    v, f3 = _load_dense(os.path.join(args.indir, "dense.json"))
    t0 = time.time()
    if args.method == "cvt":
        pts, rf = remesh_cvt(v, f3, args.target_tris)
        ver = "pyacvd-0.4.0/pyvista-0.48.4"
    else:
        pts, rf = remesh_qem(v, f3, args.target_tris)
        ver = "fast_simplification-0.1.13"
    ms = (time.time() - t0) * 1000.0

    out = {
        "method": args.method,
        "vertices": pts.reshape(-1).tolist(),
        "indices": rf.reshape(-1).astype(int).tolist(),
        "targetTris": args.target_tris,
        "ms": ms,
        "version": ver,
    }
    with open(os.path.join(args.indir, f"remesh_{args.method}.json"), "w") as fp:
        json.dump(out, fp)
    print(f"remesh_{args.method}: {rf.shape[0]} tris (target {args.target_tris}) "
          f"in {ms:.0f}ms [{ver}]")


if __name__ == "__main__":
    main()

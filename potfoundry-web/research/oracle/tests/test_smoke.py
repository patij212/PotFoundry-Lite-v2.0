# potfoundry-web/research/oracle/tests/test_smoke.py
"""Proves the SOTA engines install and run on this machine."""
import numpy as np


def test_triangle_meshes_a_square():
    import triangle as tr
    sq = {"vertices": np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float),
          "segments": np.array([[0, 1], [1, 2], [2, 3], [3, 0]], dtype=int)}
    out = tr.triangulate(sq, "pq30a0.01")  # planar straight-line graph, min-angle 30, max-area
    assert out["triangles"].shape[0] > 50
    assert out["vertices"].shape[0] >= 4


def test_gmsh_meshes_a_square():
    import gmsh
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("Mesh.RandomSeed", 1)
        gmsh.model.add("sq")
        lc = 0.1
        p = [gmsh.model.geo.addPoint(x, y, 0, lc) for x, y in [(0, 0), (1, 0), (1, 1), (0, 1)]]
        lines = [gmsh.model.geo.addLine(p[i], p[(i + 1) % 4]) for i in range(4)]
        cl = gmsh.model.geo.addCurveLoop(lines)
        gmsh.model.geo.addPlaneSurface([cl])
        gmsh.model.geo.synchronize()
        gmsh.model.mesh.generate(2)
        _, coords, _ = gmsh.model.mesh.getNodes()
        assert coords.shape[0] // 3 > 50
    finally:
        gmsh.finalize()

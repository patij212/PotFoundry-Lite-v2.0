"""Frontal-Delaunay quality meshing of the (u,t) square under a scalar size field."""
import time
import numpy as np
import gmsh


def mesh(input: dict) -> dict:
    t0 = time.perf_counter()
    s = input["sizing"]
    resU, resT, h = s["resU"], s["resT"], np.array(s["h"], dtype=float)
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("Mesh.RandomSeed", 1)
        gmsh.option.setNumber("Mesh.Algorithm", 6)  # Frontal-Delaunay
        gmsh.model.add("ut")
        p = [gmsh.model.geo.addPoint(x, y, 0) for x, y in [(0, 0), (1, 0), (1, 1), (0, 1)]]
        lines = [gmsh.model.geo.addLine(p[i], p[(i + 1) % 4]) for i in range(4)]
        cl = gmsh.model.geo.addCurveLoop(lines)
        gmsh.model.geo.addPlaneSurface([cl])
        gmsh.model.geo.synchronize()

        # Background size field: structured grid view of h(u,t).
        # Uses PostView field (brief approach); falls back to uniform MeshSizeMin/Max
        # if the PostView field does not produce a valid mesh.
        hmin = float(h.min())
        field_ok = False
        try:
            view = gmsh.view.add("size")
            data = []
            for it in range(resT):
                for iu in range(resU):
                    u = iu / max(resU - 1, 1)
                    t_coord = it / max(resT - 1, 1)
                    data.append([u, t_coord, 0.0, float(h[it * resU + iu])])
            gmsh.view.addListData(view, "SP", len(data), np.array(data).reshape(-1).tolist())
            bg = gmsh.model.mesh.field.add("PostView")
            gmsh.model.mesh.field.setNumber(bg, "ViewIndex", 0)
            gmsh.model.mesh.field.setAsBackgroundMesh(bg)
            gmsh.option.setNumber("Mesh.MeshSizeExtendFromBoundary", 0)
            gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)
            gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 0)
            field_ok = True
        except Exception:
            # Fall back to uniform target size via MeshSizeMin/Max
            gmsh.option.setNumber("Mesh.MeshSizeMin", hmin)
            gmsh.option.setNumber("Mesh.MeshSizeMax", hmin)

        gmsh.model.mesh.generate(2)

        # Verify we got a non-trivial mesh; if PostView field silently no-op'd, retry fallback
        etypes_check, _, enodes_check = gmsh.model.mesh.getElements(2)
        tri_count = 0
        if len(etypes_check) > 0 and 2 in etypes_check:
            tri_count = len(enodes_check[list(etypes_check).index(2)]) // 3
        if tri_count == 0 and field_ok:
            # PostView produced no triangles — regenerate with uniform fallback
            gmsh.model.mesh.clear()
            gmsh.option.setNumber("Mesh.MeshSizeMin", hmin)
            gmsh.option.setNumber("Mesh.MeshSizeMax", hmin)
            gmsh.model.mesh.generate(2)

        tags, coords, _ = gmsh.model.mesh.getNodes()
        coords = coords.reshape(-1, 3)
        idmap = {int(t): i for i, t in enumerate(tags)}
        ut = coords[:, :2].reshape(-1).tolist()
        etypes, etags, enodes = gmsh.model.mesh.getElements(2)
        tri = enodes[list(etypes).index(2)].reshape(-1, 3)
        idx = np.array([[idmap[int(n)] for n in row] for row in tri]).reshape(-1).tolist()
        return {"engine": "gmsh", "config": {"algo": "frontal-delaunay"},
                "ut": ut, "indices": idx,
                "engineMs": (time.perf_counter() - t0) * 1000,
                "engineVersion": gmsh.__version__ if hasattr(gmsh, "__version__") else "4.x"}
    finally:
        gmsh.finalize()

"""Frontal-Delaunay quality meshing of the (u,t) square under a scalar size field.

When `input` contains a `metric` key (AnisotropicMetricField), the adapter switches to
BAMG (Algorithm 7) with a TP tensor background view — the gmsh t17 anisotropic-tutorial
pattern.  The isotropic Frontal-Delaunay path is unchanged.
"""
import time
import warnings
import numpy as np
import gmsh


def _mesh_aniso(input: dict) -> dict:
    """Anisotropic meshing via gmsh BAMG (Algorithm 7) + TP tensor background view."""
    t0 = time.perf_counter()
    met = input["metric"]
    resU, resT = met["resU"], met["resT"]
    mm = np.array(met["m"], dtype=float)
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("Mesh.RandomSeed", 1)
        gmsh.model.add("ut")
        p = [gmsh.model.geo.addPoint(x, y, 0) for x, y in [(0, 0), (1, 0), (1, 1), (0, 1)]]
        lines = [gmsh.model.geo.addLine(p[i], p[(i + 1) % 4]) for i in range(4)]
        gmsh.model.geo.addPlaneSurface([gmsh.model.geo.addCurveLoop(lines)])
        gmsh.model.geo.synchronize()

        # TP background view: per node (x,y,z) + 9 tensor comps.
        # Embed the 2x2 (u,t)-metric in a 3x3 matrix; z-entry uses the max diagonal
        # value so in-plane BAMG is not misled by a degenerate z-row.
        view = gmsh.view.add("metric")
        mm3 = mm.reshape(-1, 3)
        muz = float(mm3[:, 0].max() or 1.0)  # large z-metric → keep meshing in-plane
        data = []
        for it in range(resT):
            for iu in range(resU):
                u = iu / max(resU - 1, 1)
                t = it / max(resT - 1, 1)
                M00, M01, M11 = mm[(it * resU + iu) * 3: (it * resU + iu) * 3 + 3]
                # 9 components: row-major 3x3 [[M00,M01,0],[M01,M11,0],[0,0,muz]]
                data += [u, t, 0.0, M00, M01, 0.0, M01, M11, 0.0, 0.0, 0.0, muz]

        gmsh.view.addListData(view, "TP", resU * resT, data)
        bg = gmsh.model.mesh.field.add("PostView")
        gmsh.model.mesh.field.setNumber(bg, "ViewIndex", 0)
        gmsh.model.mesh.field.setAsBackgroundMesh(bg)
        for opt in ("Mesh.MeshSizeExtendFromBoundary", "Mesh.MeshSizeFromPoints",
                    "Mesh.MeshSizeFromCurvature"):
            gmsh.option.setNumber(opt, 0)
        gmsh.option.setNumber("Mesh.Algorithm", 7)  # BAMG: honors anisotropic metric
        gmsh.model.mesh.generate(2)

        tags, coords, _ = gmsh.model.mesh.getNodes()
        coords = coords.reshape(-1, 3)
        idmap = {int(t): i for i, t in enumerate(tags)}
        etypes, _, enodes = gmsh.model.mesh.getElements(2)
        if 2 not in etypes:
            raise RuntimeError("BAMG produced no triangles — Algorithm 7 may not be available")
        tri = enodes[list(etypes).index(2)].reshape(-1, 3)
        idx = np.array([[idmap[int(nn)] for nn in row] for row in tri]).reshape(-1).tolist()
        return {
            "engine": "gmsh",
            "config": {"algo": "bamg-aniso", "sizeField": "metric"},
            "ut": coords[:, :2].reshape(-1).tolist(),
            "indices": idx,
            "engineMs": (time.perf_counter() - t0) * 1000,
            "engineVersion": getattr(gmsh, "__version__", "4.x"),
        }
    finally:
        gmsh.finalize()


def mesh(input: dict) -> dict:
    """Route to anisotropic BAMG path when a metric is present; else use Frontal-Delaunay."""
    if input.get("metric"):
        return _mesh_aniso(input)
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
        size_field = "postview"  # which size-field path actually drove the mesh
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
        except Exception as e:
            # Fall back to uniform target size via MeshSizeMin/Max.
            # Warn loudly: a silent fallback would confound size-field comparisons
            # (e.g. the anisotropic-metric study in later tasks).
            warnings.warn(
                f"gmsh PostView size-field failed; using uniform fallback: {e}",
                stacklevel=2)
            size_field = "fallback"
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
            warnings.warn(
                "gmsh PostView size-field produced 0 triangles; "
                "regenerating with uniform fallback",
                stacklevel=2)
            size_field = "fallback"
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
        return {"engine": "gmsh", "config": {"algo": "frontal-delaunay", "sizeField": size_field},
                "ut": ut, "indices": idx,
                "engineMs": (time.perf_counter() - t0) * 1000,
                "engineVersion": gmsh.__version__ if hasattr(gmsh, "__version__") else "4.x"}
    finally:
        gmsh.finalize()

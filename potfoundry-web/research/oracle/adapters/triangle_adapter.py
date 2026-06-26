"""Isotropic quality CDT of the (u,t) unit square (Shewchuk Triangle)."""
import time
import numpy as np
import triangle as tr


def mesh(input: dict) -> dict:
    t0 = time.perf_counter()
    s = input["sizing"]
    hmin = float(min(s["h"]))            # conservative uniform target this Phase-1A step
    max_area = 0.5 * hmin * hmin         # area of an equilateral-ish triangle of edge ~hmin
    pslg = {"vertices": np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float),
            "segments": np.array([[0, 1], [1, 2], [2, 3], [3, 0]], dtype=int)}
    out = tr.triangulate(pslg, f"pq30a{max_area:.8f}")
    ut = out["vertices"].astype(float).reshape(-1).tolist()
    idx = out["triangles"].astype(int).reshape(-1).tolist()
    return {"engine": "triangle", "config": {"minAngle": 30, "maxArea": max_area},
            "ut": ut, "indices": idx, "engineMs": (time.perf_counter() - t0) * 1000,
            "engineVersion": tr.__version__ if hasattr(tr, "__version__") else "unknown"}

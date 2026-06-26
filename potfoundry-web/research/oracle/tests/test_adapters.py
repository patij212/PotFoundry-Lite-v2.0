import numpy as np
from adapters import triangle_adapter, gmsh_adapter

def _square_input(h=0.1):
    res = 4
    return {"style": "Cyl", "H": 120.0, "domain": {"uPeriodic": True},
            "sizing": {"resU": res, "resT": res, "h": [h] * (res * res)}, "ours": None}

def _check(out):
    ut = np.array(out["ut"]).reshape(-1, 2)
    idx = np.array(out["indices"]).reshape(-1, 3)
    assert idx.shape[0] > 20
    assert ut[:, 0].min() >= -1e-9 and ut[:, 0].max() <= 1 + 1e-9
    assert ut[:, 1].min() >= -1e-9 and ut[:, 1].max() <= 1 + 1e-9

def test_triangle_adapter(): _check(triangle_adapter.mesh(_square_input()))
def test_gmsh_adapter():     _check(gmsh_adapter.mesh(_square_input()))

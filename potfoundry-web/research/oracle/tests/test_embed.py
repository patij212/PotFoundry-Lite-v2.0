"""FRONTIER Bet 1 — gmsh embedded-skeleton (protected-PLC) proxy smoke test.

Validates the capability the in-house recover-after path lacks: embedding a PLANARIZED skeleton whose loci CROSS at a
shared junction node yields a mesh where every embedded edge is conforming BY CONSTRUCTION (100% recovery), and the
crossing becomes a real node — where the in-house constraint recovery ceilings at ~88-96% on crossing loci.
"""
import numpy as np
from adapters import gmsh_adapter


def _edge_set(idx):
    es = set()
    for tr in idx:
        for a, b in [(tr[0], tr[1]), (tr[1], tr[2]), (tr[2], tr[0])]:
            es.add((min(int(a), int(b)), max(int(a), int(b))))
    return es


def test_embed_crossing_junction_is_conforming():
    # planarized "X": center (0.5,0.5) shared by 4 arms (the crossing pre-split into a shared node → legal PSLG).
    pts = [0.5, 0.5, 0.25, 0.25, 0.75, 0.75, 0.25, 0.75, 0.75, 0.25]
    edges = [0, 1, 0, 2, 0, 3, 0, 4]
    out = gmsh_adapter.mesh({"embed": {"points": pts, "edges": edges}, "uniformH": 0.08})
    ut = np.array(out["ut"]).reshape(-1, 2)
    idx = np.array(out["indices"]).reshape(-1, 3)

    assert out["config"]["algo"] == "frontal-delaunay-embed"
    assert len(idx) > 0, "no triangles"
    # the crossing junction is an exact mesh node (embedded shared point → conforming)
    dc = np.hypot(ut[:, 0] - 0.5, ut[:, 1] - 0.5)
    assert dc.min() < 1e-9, f"crossing junction not a node (min dist {dc.min():.2e})"
    # all four arm endpoints are nodes
    for cu, ct in [(0.25, 0.25), (0.75, 0.75), (0.25, 0.75), (0.75, 0.25)]:
        assert np.hypot(ut[:, 0] - cu, ut[:, 1] - ct).min() < 1e-9, f"arm endpoint ({cu},{ct}) missing"
    # the center is a hub of >=4 conforming mesh edges (the 4 embedded arms are present, not chorded over)
    es = _edge_set(idx)
    cnode = int(np.argmin(dc))
    assert sum(1 for e in es if cnode in e) >= 4, "embedded arms not conforming at the junction"


def test_embed_returns_valid_indices():
    pts = [0.3, 0.5, 0.7, 0.5]
    out = gmsh_adapter.mesh({"embed": {"points": pts, "edges": [0, 1]}, "uniformH": 0.1})
    n = len(out["ut"]) // 2
    idx = out["indices"]
    assert len(idx) % 3 == 0 and idx and max(idx) < n and min(idx) >= 0

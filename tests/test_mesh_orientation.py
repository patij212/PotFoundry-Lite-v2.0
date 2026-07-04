"""Mesh orientation / export-quality regression tests.

These tests guarantee that every mesh PotFoundry produces is a **consistently
oriented, outward-facing closed manifold** — the property CAD tools such as
Rhino and Grasshopper (and every slicer) require to treat an imported mesh as a
valid closed solid.

Two independent properties are checked for every style and parameter regime:

1. **Consistent winding** — in a closed manifold with coherent orientation,
   each *directed* edge (a, b) appears exactly once; the neighbouring face
   contributes the reverse edge (b, a). Any directed edge that appears more than
   once (or whose reverse is missing) means two adjacent faces disagree on
   winding, i.e. a flipped-normal patch. Rhino reports these as "inconsistent
   normals" and refuses to build a closed solid.

2. **Outward orientation** — the signed volume computed via the divergence
   theorem (sum of v0 . (v1 x v2) / 6) is positive only when face normals point
   *out* of the enclosed material. A negative value means the whole shell is
   wound inside-out.

Historically the drain sub-assembly (the bottom "top slab" and the drain
cylinder wall) was wound against the rest of the shell, producing 2 * n_theta
inconsistent directed edges on the inner_bottom and outer_bottom rings in every
style, and the whole shell was wound inside-out (negative signed volume). These
tests pin both properties down and prevent regressions.
"""

from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES

# A spread of parameter regimes that exercise the seams most likely to flip:
# plain, global twist, mid-height bell, and an off-centre sharp flare.
REGIMES = [
    ("default", {}),
    ("twist", {"spin_turns": 1.5}),
    ("bell", {"bell_amp": 0.3}),
    ("flare", {"flare_center": 0.2, "flare_sharp": 10.0}),
]

COMMON = dict(
    H=120,
    Rt=70,
    Rb=50,
    t_wall=3,
    t_bottom=3,
    r_drain=10,
    expn=1.1,
    n_theta=96,
    n_z=48,
)


def _directed_edges(faces: np.ndarray) -> Counter:
    edges: Counter = Counter()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        edges[(a, b)] += 1
        edges[(b, c)] += 1
        edges[(c, a)] += 1
    return edges


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def _cases():
    for style_name, (fn, _desc) in STYLES.items():
        for regime_name, opts in REGIMES:
            yield style_name, regime_name, fn, opts


@pytest.mark.parametrize(
    "style_name,regime_name,fn,opts",
    list(_cases()),
    ids=[f"{s}-{r}" for s, r, _, _ in _cases()],
)
class TestMeshOrientation:
    def test_winding_is_consistent(self, style_name, regime_name, fn, opts):
        """Every directed edge appears exactly once (coherent orientation)."""
        verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts=opts, **COMMON)
        directed = _directed_edges(faces)
        multiplied = {e: c for e, c in directed.items() if c != 1}
        assert not multiplied, (
            f"{style_name}/{regime_name}: {len(multiplied)} directed edges do not "
            f"appear exactly once — adjacent faces disagree on winding "
            f"(flipped-normal patch)."
        )

    def test_orientation_is_outward(self, style_name, regime_name, fn, opts):
        """Signed volume is positive => normals point outward."""
        verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts=opts, **COMMON)
        vol = _signed_volume(verts, faces)
        assert vol > 0.0, (
            f"{style_name}/{regime_name}: signed volume {vol:.1f} <= 0 — mesh is "
            f"wound inside-out (inward normals)."
        )

"""Export-quality invariants for the pot mesh.

These tests encode what Rhino / Grasshopper (and any solid-modeling kernel)
require to treat an imported mesh as a valid closed solid:

1. **Consistent orientation** — the mesh is an orientable closed manifold:
   every shared edge is traversed in *opposite* directions by its two faces.
   (Watertightness alone — each undirected edge in exactly two faces — does
   not catch folds where two faces wind the shared edge the same way.)

2. **Outward normals / positive signed volume** — the divergence-theorem
   signed volume of the closed mesh is positive, i.e. face normals point out
   of the solid. A negative volume means the imported solid is inside-out.

3. **No degenerate faces** — no zero-area triangles.

These are deterministic geometric properties, independent of resolution and
style, so we sweep all styles at a modest resolution.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

# Two mesh builders ship in the tree: the vectorized core builder (exported as
# the package public API) and the legacy scalar builder still used by the
# Streamlit UI import path (pfui/imports.py). Export-quality invariants must
# hold for BOTH, so we parametrize every test over both code paths.
from potfoundry import build_pot_mesh as core_build_pot_mesh, STYLES
from potfoundry.geometry import build_pot_mesh as legacy_build_pot_mesh

BUILDERS = {
    "core": core_build_pot_mesh,
    "legacy": legacy_build_pot_mesh,
}


def _build(builder, style_name: str, **overrides):
    fn = STYLES[style_name][0]
    params = dict(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=120, n_z=60,
        r_outer_fn=fn, style_opts={},
    )
    params.update(overrides)
    return builder(**params)


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem (sum of signed tetrahedra).

    Positive when face windings give outward-pointing normals.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


ALL_STYLES = list(STYLES.keys())
CASES = [(b, s) for b in BUILDERS for s in ALL_STYLES]
CASE_IDS = [f"{b}-{s}" for b, s in CASES]


@pytest.mark.parametrize("builder_name,style_name", CASES, ids=CASE_IDS)
def test_orientation_is_consistent(builder_name, style_name):
    """Every interior edge is traversed once in each direction.

    For a consistently oriented closed manifold each directed edge (a, b)
    appears exactly once, and its reverse (b, a) appears exactly once.
    """
    verts, faces, _ = _build(BUILDERS[builder_name], style_name)

    directed = Counter()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        directed[(a, b)] += 1
        directed[(b, c)] += 1
        directed[(c, a)] += 1

    bad = [
        e for e, count in directed.items()
        if count != 1 or directed.get((e[1], e[0]), 0) != 1
    ]
    assert not bad, (
        f"{builder_name}/{style_name}: {len(bad)} edges have inconsistent "
        f"winding (mesh is not a consistently-oriented manifold)"
    )


@pytest.mark.parametrize("builder_name,style_name", CASES, ids=CASE_IDS)
def test_signed_volume_is_positive(builder_name, style_name):
    """Face normals point outward (closed solid is not inside-out)."""
    verts, faces, diag = _build(BUILDERS[builder_name], style_name)
    vol = _signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{builder_name}/{style_name}: signed volume is {vol:.1f} (<= 0) — "
        f"mesh normals point inward, solid would import inside-out"
    )
    # The builder also reports it in diagnostics for downstream/UI checks.
    assert diag["signed_volume_mm3"] == pytest.approx(vol, rel=1e-6)


@pytest.mark.parametrize("builder_name,style_name", CASES, ids=CASE_IDS)
def test_no_degenerate_faces(builder_name, style_name):
    """No zero-area triangles (Rhino rejects degenerate faces)."""
    verts, faces, _ = _build(BUILDERS[builder_name], style_name)
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    n_degen = int(np.count_nonzero(areas < 1e-9))
    assert n_degen == 0, (
        f"{builder_name}/{style_name}: {n_degen} degenerate (zero-area) faces"
    )


@pytest.mark.parametrize("builder_name,style_name", CASES, ids=CASE_IDS)
def test_topology_is_clean_torus(builder_name, style_name):
    """Mesh is a clean closed manifold of the expected topology.

    A pot with a drain hole punched through the bottom (connecting the inner
    cavity to the outside) is topologically a torus: genus 1, Euler
    characteristic V - E + F = 0. Any deviation means a spurious crack
    (extra boundary) or a self-overlap (extra handle) crept in — both of which
    a CAD kernel rejects.
    """
    verts, faces, _ = _build(BUILDERS[builder_name], style_name)

    undirected = set()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        for u, v in ((a, b), (b, c), (c, a)):
            undirected.add((u, v) if u < v else (v, u))

    chi = len(verts) - len(undirected) + len(faces)
    genus = (2 - chi) // 2
    assert chi == 0 and genus == 1, (
        f"{builder_name}/{style_name}: expected a genus-1 torus (chi=0), got "
        f"chi={chi}, genus={genus} — topology is not a clean pot-with-drain"
    )

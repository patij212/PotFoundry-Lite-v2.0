"""Mesh orientation utilities (CAD / Rhino / Grasshopper export quality).

A triangle mesh can be perfectly *watertight* (every edge shared by two faces)
yet still import badly into CAD tools because its face **winding** — the order
of a triangle's vertices, which fixes the direction of its normal — is wrong.

Two failure modes matter for export quality:

* **Global inversion** — every normal points *into* the solid. The model loads
  "inside-out": shading is wrong, Boolean/solid operations fail, and the user
  has to manually flip normals.
* **Local inconsistency** — neighbouring faces disagree on orientation, which
  even an automatic "unify normals" pass cannot fully repair.

The pot mesh is built from structured face groups and is oriented correctly by
construction (see :func:`potfoundry.core.geometry.build_pot_mesh`). The helpers
here provide a cheap, fully-vectorised *global* safety net plus the primitives
used by tests to verify orientation invariants.
"""
from __future__ import annotations

import numpy as np

__all__ = ["signed_volume", "ensure_outward"]


def signed_volume(vertices: np.ndarray, faces: np.ndarray) -> float:
    """Divergence-theorem signed volume of a closed triangle mesh.

    Equal to ``(1/6) * sum( v0 . (v1 x v2) )`` over all faces. For a closed
    mesh whose normals all point **outward** this is the positive enclosed
    volume; a globally inverted mesh yields the same magnitude, negated.

    Args:
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3).

    Returns:
        Signed volume (mm^3 if vertices are in mm). Positive => outward normals.
    """
    v0 = vertices[faces[:, 0]]
    v1 = vertices[faces[:, 1]]
    v2 = vertices[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def ensure_outward(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Return faces whose normals point outward (consistent global winding).

    This is an O(M) vectorised guard: it computes the signed volume and, if the
    mesh is globally inverted, reverses every triangle's winding. It does *not*
    repair locally-inconsistent winding — that must be correct by construction;
    use it as a final safety net after assembling a mesh.

    Args:
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3).

    Returns:
        The faces array (unchanged object if already outward, otherwise a new
        column-reversed array).
    """
    if faces.shape[0] == 0:
        return faces
    if signed_volume(vertices, faces) < 0.0:
        return faces[:, ::-1].copy()
    return faces

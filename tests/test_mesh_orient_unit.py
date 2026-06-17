"""Unit tests for the generic mesh orientation utility.

These exercise :func:`orient_outward` directly on tiny hand-built meshes so the
algorithm is pinned independently of the pot mesh builder.
"""
from __future__ import annotations

from collections import Counter

import numpy as np

from potfoundry.core.mesh_orient import orient_outward, signed_volume


# A unit tetrahedron.
_TETRA_VERTS = np.array(
    [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
    ],
    dtype=float,
)
# Faces wound consistently outward (positive signed volume).
_TETRA_FACES_OUT = np.array(
    [
        [0, 2, 1],
        [0, 1, 3],
        [0, 3, 2],
        [1, 2, 3],
    ],
    dtype=int,
)


def _orientation_defects(faces: np.ndarray) -> int:
    directed: Counter = Counter()
    for face in faces:
        for i in range(3):
            directed[(int(face[i]), int(face[(i + 1) % 3]))] += 1
    return sum(1 for c in directed.values() if c != 1)


def test_already_correct_mesh_is_left_outward() -> None:
    out = orient_outward(_TETRA_VERTS, _TETRA_FACES_OUT)
    assert _orientation_defects(out) == 0
    assert signed_volume(_TETRA_VERTS, out) > 0


def test_inside_out_mesh_is_flipped_outward() -> None:
    """A fully-inverted (negative volume) mesh is flipped to positive volume."""
    inverted = _TETRA_FACES_OUT[:, ::-1].copy()
    assert signed_volume(_TETRA_VERTS, inverted) < 0  # precondition

    out = orient_outward(_TETRA_VERTS, inverted)
    assert _orientation_defects(out) == 0
    assert signed_volume(_TETRA_VERTS, out) > 0


def test_single_inconsistent_face_is_repaired() -> None:
    """One face wound against the others is re-wound into coherence."""
    faces = _TETRA_FACES_OUT.copy()
    faces[2] = faces[2][::-1]  # break coherence on one face
    assert _orientation_defects(faces) > 0  # precondition

    out = orient_outward(_TETRA_VERTS, faces)
    assert _orientation_defects(out) == 0
    assert signed_volume(_TETRA_VERTS, out) > 0


def test_face_rows_and_vertex_sets_are_preserved() -> None:
    """Orientation only re-winds faces; it never adds, drops or reorders rows."""
    faces = _TETRA_FACES_OUT.copy()
    faces[1] = faces[1][::-1]
    out = orient_outward(_TETRA_VERTS, faces)

    assert out.shape == faces.shape
    # Each output face is the same vertex set as the corresponding input row.
    for original, rewound in zip(faces, out):
        assert set(original.tolist()) == set(rewound.tolist())


def test_input_faces_not_mutated() -> None:
    faces = _TETRA_FACES_OUT[:, ::-1].copy()
    snapshot = faces.copy()
    orient_outward(_TETRA_VERTS, faces)
    np.testing.assert_array_equal(faces, snapshot)


def test_empty_mesh_is_handled() -> None:
    out = orient_outward(np.zeros((0, 3)), np.zeros((0, 3), dtype=int))
    assert out.shape == (0, 3)

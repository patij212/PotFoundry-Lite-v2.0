"""Face array assembly for pot geometry.

This module handles:
- Assembling all face arrays into a single unified array
- Converting to proper integer type

The faces module combines all the individual face arrays from different
parts of the pot (outer wall, inner wall, rim, drain, etc.) into a single
array for the complete mesh.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt


__all__ = [
    "assemble_faces",
]


def assemble_faces(faces_out_parts: list[npt.NDArray]) -> npt.NDArray[np.int64]:
    """Assemble all face arrays into a single unified array.
    
    Combines face arrays from all mesh components (outer wall, inner wall,
    rim, drain, etc.) into a single contiguous array for the complete mesh.
    
    Args:
        faces_out_parts: List of face arrays to combine
        
    Returns:
        Combined face array with all triangles
    """
    faces_arr = np.vstack(faces_out_parts).astype(int, copy=False)
    return faces_arr

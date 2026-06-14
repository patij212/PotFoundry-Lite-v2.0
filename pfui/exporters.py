from __future__ import annotations
import re
import tempfile
import uuid
from pathlib import Path
from typing import Tuple

# Mesh writers (binary STL recommended; OBJ/3dm for Rhino/Grasshopper)
from .imports import WRITE_STL_BINARY, WRITE_OBJ, WRITE_3DM


def _safe_name(name: str) -> str:
    """Sanitize model name for safe use in filenames."""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:80] or "potfoundry_model"


def export_stl_bytes(name: str, verts, faces) -> Tuple[bytes, str]:
    """Export mesh to binary STL and return as bytes.

    This is the recommended export format - binary STL files are smaller,
    faster to write/read, and universally supported by slicers and CAD tools.

    Args:
        name: Model name (will be sanitized for filename)
        verts: Vertex array (N, 3)
        faces: Face indices (M, 3)

    Returns:
        Tuple of (stl_bytes, safe_filename)

    Raises:
        RuntimeError: If binary STL writer is not available
    """
    safe = _safe_name(name)
    if WRITE_STL_BINARY is None:
        raise RuntimeError("write_stl_binary not available in this build")
    tmp_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.stl"
    # Export as binary STL (recommended format)
    WRITE_STL_BINARY(str(tmp_path), safe, verts, faces)  # type: ignore[misc]
    data = tmp_path.read_bytes()
    try:
        tmp_path.unlink(missing_ok=True)
    except Exception:
        pass
    return data, safe


def export_obj_bytes(name: str, verts, faces) -> Tuple[bytes, str]:
    """Export mesh to Wavefront OBJ and return as bytes.

    OBJ is the most portable Rhino/Grasshopper-friendly mesh format: welded
    topology with smooth vertex normals (non-faceted shading).

    Args:
        name: Model name (will be sanitized for filename)
        verts: Vertex array (N, 3)
        faces: Face indices (M, 3)

    Returns:
        Tuple of (obj_bytes, safe_filename)

    Raises:
        RuntimeError: If OBJ writer is not available
    """
    safe = _safe_name(name)
    if WRITE_OBJ is None:
        raise RuntimeError("write_obj not available in this build")
    tmp_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.obj"
    WRITE_OBJ(str(tmp_path), safe, verts, faces)  # type: ignore[misc]
    data = tmp_path.read_bytes()
    try:
        tmp_path.unlink(missing_ok=True)
    except Exception:
        pass
    return data, safe


def export_3dm_bytes(name: str, verts, faces) -> Tuple[bytes, str]:
    """Export mesh to a native Rhino ``.3dm`` file and return as bytes.

    The gold standard for Rhino/Grasshopper: millimetre units and a valid,
    closed Rhino mesh with vertex normals. Requires the optional ``rhino3dm``
    package.

    Args:
        name: Model name (will be sanitized for filename)
        verts: Vertex array (N, 3)
        faces: Face indices (M, 3)

    Returns:
        Tuple of (threedm_bytes, safe_filename)

    Raises:
        RuntimeError: If the 3dm writer (rhino3dm) is not available
    """
    safe = _safe_name(name)
    if WRITE_3DM is None:
        raise RuntimeError(
            "3dm export requires the optional 'rhino3dm' package "
            "(pip install rhino3dm)"
        )
    tmp_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.3dm"
    WRITE_3DM(str(tmp_path), safe, verts, faces)  # type: ignore[misc]
    data = tmp_path.read_bytes()
    try:
        tmp_path.unlink(missing_ok=True)
    except Exception:
        pass
    return data, safe

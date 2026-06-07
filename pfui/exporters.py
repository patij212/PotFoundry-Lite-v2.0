from __future__ import annotations
import re
import tempfile
import uuid
from pathlib import Path
from typing import Tuple

# Mesh writers: binary STL (slicers) and welded OBJ (Rhino/Grasshopper)
from .imports import WRITE_STL_BINARY, WRITE_OBJ


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
    """Export mesh to a welded Wavefront OBJ and return as bytes.

    OBJ preserves the shared-vertex (indexed) topology of the mesh, so the file
    imports into Rhino / Grasshopper as a welded, watertight, closed mesh — the
    format to use for CAD round-tripping. (Binary STL de-welds every triangle and
    imports as a naked-edge shell, which is fine for slicers but not for CAD.)

    Args:
        name: Model name (will be sanitized for filename and OBJ object name)
        verts: Vertex array (N, 3)
        faces: Face indices (M, 3)

    Returns:
        Tuple of (obj_bytes, safe_name)

    Raises:
        RuntimeError: If the OBJ writer is not available in this build
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

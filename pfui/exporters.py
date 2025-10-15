from __future__ import annotations
import re
import tempfile
import uuid
from pathlib import Path
from typing import Tuple, Any
import numpy.typing as npt
import numpy as np

# Binary STL writer (recommended for all exports)
from .imports import WRITE_STL_BINARY


def _safe_name(name: str) -> str:
    """Sanitize model name for safe use in filenames."""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:80] or "potfoundry_model"


def export_stl_bytes(
    name: str, 
    verts: npt.NDArray[np.float64], 
    faces: npt.NDArray[np.int32]
) -> Tuple[bytes, str]:
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

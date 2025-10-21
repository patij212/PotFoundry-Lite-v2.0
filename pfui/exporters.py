from __future__ import annotations
import re
import tempfile
import uuid
from pathlib import Path
from typing import Tuple, Any, Callable
import numpy.typing as npt
import numpy as np

# Binary STL writer (recommended for all exports)
from .imports import WRITE_STL_BINARY
from typing import Any, Callable


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
    """
    safe = _safe_name(name)

    # wrap the potentially untyped WRITE_STL_BINARY in an annotated callable
    # so mypy can reason about the call-site without an inline "type: ignore"
    writer: Callable[[str, str, Any, Any], None] | None = None
    if callable(WRITE_STL_BINARY):
        writer = WRITE_STL_BINARY  # type: ignore[assignment]

    if writer is None:
        raise RuntimeError("WRITE_STL_BINARY not available")

    tmp_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.stl"
    # Export as binary STL (recommended format). Use a typed Any wrapper so
    # mypy knows the call is intentional when the imported symbol is an
    # untyped C-extension or similarly un-annotated helper.
    writer(str(tmp_path), safe, verts, faces)
    data = tmp_path.read_bytes()
    try:
        tmp_path.unlink(missing_ok=True)
    except Exception:
        pass
    return data, safe

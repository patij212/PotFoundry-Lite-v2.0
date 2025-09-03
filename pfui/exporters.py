from __future__ import annotations
import re
import tempfile
import uuid
from pathlib import Path
from typing import Tuple

from .imports import WRITE_STL_BINARY


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:80] or "potfoundry_model"


def export_stl_bytes(name: str, verts, faces) -> Tuple[bytes, str]:
    safe = _safe_name(name)
    if WRITE_STL_BINARY is None:
        raise RuntimeError("write_stl_binary not available in this build")
    tmp_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.stl"
    WRITE_STL_BINARY(str(tmp_path), safe, verts, faces)  # type: ignore[misc]
    data = tmp_path.read_bytes()
    try:
        tmp_path.unlink(missing_ok=True)
    except Exception:
        pass
    return data, safe
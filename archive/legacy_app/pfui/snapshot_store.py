from __future__ import annotations

import tempfile
import time
import uuid
from pathlib import Path

_PREFIX = "_pf2_snap_"


def save_png_temp(png_bytes: bytes) -> str:
    """Write png bytes to a temp file and return the absolute path.

    The filename is given a repository-specific prefix so we can safely
    clean old files later.
    """
    fn = f"{_PREFIX}{uuid.uuid4().hex}.png"
    p = Path(tempfile.gettempdir()) / fn
    p.write_bytes(png_bytes)
    return str(p)


def read_png_bytes(obj: object | None) -> bytes | None:
    """Return bytes for either raw bytes or a temp-file path.

    Returns None if no data available.
    """
    if obj is None:
        return None
    if isinstance(obj, (bytes, bytearray)):
        return bytes(obj)
    try:
        p = Path(str(obj))
        if p.exists():
            return p.read_bytes()
    except Exception:
        pass
    return None


def remove_png_path(path_like: str | None) -> None:
    """Remove a temp PNG file if it looks like one we created.

    Safe-guards: only remove files that live in tempfile.gettempdir()
    and have our prefix.
    """
    if not path_like:
        return
    try:
        p = Path(path_like)
        td = Path(tempfile.gettempdir())
        if p.exists() and p.parent.samefile(td) and p.name.startswith(_PREFIX):
            p.unlink(missing_ok=True)
    except Exception:
        # Best-effort; don't raise during UI operations
        return


def cleanup_old_tempfiles(max_age_seconds: int = 60 * 60 * 24) -> None:
    """Remove leftover snapshot tempfiles older than max_age_seconds.

    This is a safety net to avoid indefinite tempdir growth.
    """
    td = Path(tempfile.gettempdir())
    now = time.time()
    try:
        for p in td.iterdir():
            if not p.name.startswith(_PREFIX):
                continue
            try:
                mtime = p.stat().st_mtime
                if now - mtime > max_age_seconds:
                    p.unlink(missing_ok=True)
            except Exception:
                continue
    except Exception:
        return

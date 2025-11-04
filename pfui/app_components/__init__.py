"""Modularized app components (transitional package).

This package hosts UI-agnostic helpers extracted from `app.py` to
enable gradual refactoring without breaking imports. Symbols are
imported by `app.py` to preserve backward compatibility.
"""

from __future__ import annotations

from .appearance import render_appearance_settings
from .export_handlers import render_export_widgets
from .preview_controls import render_preview_controls
from .snapshots import render_snapshots
from .utils import (
    _mask_possible_secrets,
    build_mesh_kwargs_for_test,
    resolve_schema_key,
)

__all__ = [
    "build_mesh_kwargs_for_test",
    "resolve_schema_key",
    "_mask_possible_secrets",
    "render_preview_controls",
    "render_export_widgets",
    "render_appearance_settings",
    "render_snapshots",
]

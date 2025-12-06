"""Shim to expose the root `pfui.geometry_bridge` helpers to the preview package.

This file exists so relative imports like ``from .geometry_bridge import ...``
inside ``pfui.preview`` succeed for static analysis and at runtime. It
simply re-exports the bridge helpers from the package root implementation.
"""

from __future__ import annotations

from pfui.geometry_bridge import adapt_r_outer_fn, build_pot_mesh_safe

__all__ = ["adapt_r_outer_fn", "build_pot_mesh_safe"]

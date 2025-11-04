"""Main content rendering for the Interactive Designer tab.

This module contains the main UI rendering logic extracted from app.py
to improve modularity and prepare for Qt desktop migration.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def render_interactive_tab() -> None:
    """Render the main Interactive Designer tab content.
    
    This is a placeholder for future extraction of the main tab rendering
    logic from app.py. The actual implementation remains in app.py for now
    to maintain stability during the incremental refactoring process.
    
    Future work: Extract the complete Interactive tab rendering logic here.
    """
    pass  # Implemented directly in app.py for now


def render_batch_tab() -> None:
    """Render the Batch from YAML tab content.
    
    This function delegates to pfui.batch_tab.render_batch_tab() which
    already contains the batch processing UI logic.
    """
    from pfui.batch_tab import render_batch_tab as _impl
    _impl()


def render_library_tab() -> None:
    """Render the Public Library tab content.
    
    This function delegates to pfui.library_ui.render_library_tab() which
    already contains the library UI logic.
    """
    from pfui.library_ui import render_library_tab as _impl
    _impl()


__all__ = [
    "render_interactive_tab",
    "render_batch_tab",
    "render_library_tab",
]

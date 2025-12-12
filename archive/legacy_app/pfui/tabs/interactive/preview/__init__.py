"""Preview section orchestration for Interactive Designer tab.

This package provides preview rendering functionality. Currently, most logic
remains in the parent preview.py file pending full decomposition.

Planned decomposition modules (see docs/refactoring/PHASE_B_CONTINUATION_HANDOFF.md):
- update_decision.py (partial - created)
- utils.py (created)
- cache_management.py (pending)
- signatures.py (pending)
- array_generation.py (pending)
- mesh_building.py (pending)
- plotly_surface.py (pending)
- plotly_mesh.py (pending)
- png_rendering.py (pending)
"""

from __future__ import annotations

# Re-export the main function from preview_impl module for backward compatibility
# This allows: from pfui.tabs.interactive.preview import render_preview_section
# Once full decomposition is complete, this will import from local modules instead.
from ..preview_impl import render_preview_section

__all__ = ["render_preview_section"]

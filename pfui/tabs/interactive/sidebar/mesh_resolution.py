"""Mesh resolution controls for the Interactive Designer sidebar.

Exposes sliders for preview and export mesh resolution. These values
are stored in session state keys that other modules read:
- `preview_n_theta`, `preview_n_z` for the interactive preview
- `export_n_theta`, `export_n_z` for the export mesh resolution

The sliders use conservative ranges and sensible defaults to avoid
excessive work in the browser while still allowing high-quality exports.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pfui._st import get_effective_st as get_st


def render_mesh_resolution(ss: dict[str, Any], on_change: Callable[[], None] | None = None) -> None:
    """Render mesh resolution sliders in the sidebar.

    Args:
        ss: The Streamlit session state mapping.

    """
    st = get_st()
    st.subheader("Mesh resolution")

    # Preview resolution controls (affect interactive preview)
    preview_n_theta = int(ss.get("preview_n_theta", 168))
    preview_n_z = int(ss.get("preview_n_z", 84))

    preview_n_theta = st.slider(
        "Preview angular samples (n_theta)",
        min_value=24,
        max_value=720,
        value=preview_n_theta,
        step=12,
        help=("Angular sampling for the interactive preview. Lower values are faster; "
              "higher values give a smoother preview."),
        key="preview_n_theta",
        on_change=on_change,
    )

    preview_n_z = st.slider(
        "Preview vertical samples (n_z)",
        min_value=8,
        max_value=360,
        value=preview_n_z,
        step=4,
        help=("Vertical sampling (height) for the interactive preview. "
              "Increase for smoother vertical detail."),
        key="preview_n_z",
        on_change=on_change,
    )

    # Export resolution controls (used when exporting STL)
    export_n_theta = int(ss.get("export_n_theta", preview_n_theta))
    export_n_z = int(ss.get("export_n_z", preview_n_z))

    export_n_theta = st.slider(
        "Export angular samples (n_theta)",
        min_value=48,
        max_value=2048,
        value=export_n_theta,
        step=24,
        help=("Angular sampling used for exports. This controls final mesh fidelity; "
              "higher values increase export time and file size."),
        key="export_n_theta",
        on_change=on_change,
    )

    export_n_z = st.slider(
        "Export vertical samples (n_z)",
        min_value=16,
        max_value=1024,
        value=export_n_z,
        step=4,
        help=("Vertical sampling used for exports. Increase for finer vertical detail."),
        key="export_n_z",
        on_change=on_change,
    )

    # Persist values back to session state mapping (redundant when using key=, but explicit)
    ss["preview_n_theta"] = int(preview_n_theta)
    ss["preview_n_z"] = int(preview_n_z)
    ss["export_n_theta"] = int(export_n_theta)
    ss["export_n_z"] = int(export_n_z)
    # Mirror preview resolution into the legacy keys used elsewhere
    try:
        ss["n_theta"] = int(preview_n_theta)
        ss["n_z"] = int(preview_n_z)
    except Exception:
        pass

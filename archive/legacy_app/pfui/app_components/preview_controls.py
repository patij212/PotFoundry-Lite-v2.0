"""Preview controls UI (mode, debounce, quality presets) extracted from app.py.

Provides a single function `render_preview_controls` which renders the
controls and returns the selected values as a small dict while updating
`st.session_state` for compatibility with the rest of the app.
"""

from __future__ import annotations

from collections.abc import Callable, MutableMapping

# mypy: disable-error-code=attr-defined
from typing import Any, cast

from pfui._st import get_effective_st as get_st


def render_preview_controls(
    *,
    mark_changed: Callable[[], None],
    has_plotly: bool,
) -> dict[str, Any]:
    st = get_st()
    # Treat session_state as a mutable mapping for typing; Streamlit lacks stubs
    ss_map: MutableMapping[str, Any] = st.session_state

    # Clean layout; hide some advanced controls
    c1, c2, c3, c4 = st.columns([1.2, 1.2, 1.2, 1.2])
    # Hide Preview detail control; set to 2.0 by default
    preview_detail = float(ss_map.setdefault("preview_detail", 2.0))

    # Preview mode: manual / auto / debounced
    preview_mode = c1.selectbox(
        "Preview mode",
        options=["manual", "auto", "debounced"],
        index={"manual": 0, "auto": 1, "debounced": 2}.get(
            ss_map.get("preview_mode", "auto"), 1,
        ),
        key="preview_mode",
        help="Choose how previews update: manual (button), automatic, or debounced (wait until inputs settle).",
    )

    # Hide debounce timeout; set default
    ss_map["debounce_timeout"] = float(ss_map.get("debounce_timeout", 0.8))

    # Always enable both Quick and Full previews (no checkboxes)
    interactive_3d = True
    interactive_mesh = True
    # Default engine: Interactive Plotly when available; remove engine selector per request
    ss_map["quick_engine"] = "interactive" if has_plotly else "static"

    # Hide figure size controls; set defaults
    fig_w = float(ss_map.get("fig_w", 7.5))
    fig_h = float(ss_map.get("fig_h", 7.0))
    # Hide DPI control; set to 220
    ss_map["dpi"] = int(ss_map.get("dpi", 220))
    dpi = int(ss_map.get("dpi", 220))

    # Hide view and inner wall controls; use default values
    view_elev = float(ss_map.get("view_elev", 20.0))
    view_azim = float(ss_map.get("view_azim", -60.0))
    show_inner = bool(ss_map.get("show_inner", False))

    st.divider()
    cE1, cE2, cE3 = st.columns([1.2, 1.2, 2.6])
    # Mesh quality moved here with presets
    qc1, qc2, qc3 = st.columns([1.2, 1.2, 1.6])
    prev_preset = ss_map.get("_last_quality_preset", None)
    _quality_raw = ss_map.get("quality_preset", "Medium")
    quality_index = {"Low": 0, "Medium": 1, "High": 2, "Ultra": 3}.get(
        str(_quality_raw), 1,
    )
    preset_name = qc1.selectbox(
        "Quality preset",
        ["Low", "Medium", "High", "Ultra"],
        index=quality_index,
        key="quality_preset",
        help="Select a quality preset; you can still fine-tune nθ/nz after selecting.",
    )
    # Defaults per preset
    preset_defaults = {
        "Low": {"n_theta": 120, "n_z": 48, "quality_up": 1},
        "Medium": {"n_theta": 168, "n_z": 84, "quality_up": 2},
        "High": {"n_theta": 256, "n_z": 128, "quality_up": 2},
        "Ultra": {
            "n_theta": 720,
            "n_z": 720,
            "quality_up": 3,
            "exact_full_preview": True,
            "preview_res_scale": 1.0,
        },
    }
    # Apply preset immediately when changed
    if preset_name != prev_preset and preset_name in preset_defaults:
        d = preset_defaults[preset_name]
        ss_map["n_theta"] = d.get("n_theta", ss_map.get("n_theta", 168))
        ss_map["n_z"] = d.get("n_z", ss_map.get("n_z", 84))
        ss_map["quality_up"] = d.get("quality_up", ss_map.get("quality_up", 2))
        if preset_name == "Ultra":
            ss_map["exact_full_preview"] = d.get("exact_full_preview", True)
            ss_map["preview_res_scale"] = d.get("preview_res_scale", 1.0)
        ss_map["_last_quality_preset"] = preset_name
        try:
            mark_changed()
        except Exception:
            pass
    elif prev_preset is None:
        ss_map["_last_quality_preset"] = preset_name

    n_theta = int(
        qc2.slider(
            "Angular divisions (nθ)",
            96,
            720,
            ss_map.get(
                "n_theta", preset_defaults.get(preset_name, {}).get("n_theta", 168),
            ),
            12,
            key="n_theta",
            on_change=mark_changed,
            help="Higher values increase roundness and detail around the pot. Affects both preview and export.",
        ),
    )
    n_z = int(
        qc3.slider(
            "Vertical divisions (nz)",
            32,
            720,
            ss_map.get("n_z", preset_defaults.get(preset_name, {}).get("n_z", 84)),
            4,
            key="n_z",
            on_change=mark_changed,
            help="Higher values add more rings along height for smoother vertical transitions.",
        ),
    )

    up = cE1.select_slider(
        "Export quality upscale",
        options=[1, 2, 3],
        value=ss_map.get(
            "quality_up", preset_defaults.get(preset_name, {}).get("quality_up", 2),
        ),
        key="quality_up",
        help="Multiplies nθ & nz when generating the STL. Use higher values for ultra-smooth exports.",
    )

    return dict(
        preview_detail=preview_detail,
        preview_mode=preview_mode,
        fig_w=fig_w,
        fig_h=fig_h,
        dpi=dpi,
        view_elev=view_elev,
        view_azim=view_azim,
        show_inner=show_inner,
        n_theta=n_theta,
        n_z=n_z,
        quality_up=up,
        interactive_3d=interactive_3d,
        interactive_mesh=interactive_mesh,
        preset_name=preset_name,
    )


__all__ = [
    "render_preview_controls",
]

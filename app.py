# -*- coding: utf-8 -*-
# pyright: reportGeneralTypeIssues=false
from __future__ import annotations

# File-level ruff suppression: this module intentionally performs runtime
# setup (optional imports, checks) before importing many `pfui` modules to
# avoid importing fragile or heavy modules at interpreter startup. Silencing
# E402 here keeps editor/type-checker noise low while preserving behavior.
# ruff: noqa: E402

import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from typing import cast, Callable, Union
from typing import (
    Any as _ArrayLike,
)  # for broad array-or-scalar typing without optional module issues

import math
import streamlit as st
from pfui.preview import render_preview_png_cached
from datetime import datetime

# --- Optional / graceful Plotly import (interactive preview) ---
try:
    import plotly.graph_objects as go

    HAS_PLOTLY = True
except Exception:
    HAS_PLOTLY = False
    # Annotate as Any so attribute access (Figure, Surface, Mesh3d) doesn't upset type checker
    go = cast(Any, None)

if not HAS_PLOTLY:
    st.info(
        "Plotly is not available. Interactive 3D preview and mesh features are disabled."
    )

# --- PotFoundry UI/engine imports ---
# These imports intentionally occur after some runtime checks/optional imports
# to avoid importing heavy modules (potfoundry/pfui internals) at module
# import time which can trigger editor/type-checker traversal and noisy
# diagnostics. Keep the delayed import but silence ruff E402 with an
# explanatory noqa.
from pfui.imports import STYLES, build_pot_mesh, WRITE_STL_BINARY  # noqa: E402
from pfui.presets import (
    PRESETS,
    _read_user_presets,
    _write_user_presets,
    apply_preset_dict,
)  # noqa: E402
import pfui.schemas as SC  # noqa: E402

# Prefer accessor call to reduce heavy constant binding at module scope in other modules
styles = SC.get_style_schemas()
# Deliberate delayed import of `pfui.state` to avoid importing heavy
# Streamlit/session-related modules at top-level. Documented and allowed.
from pfui.state import (  # noqa: E402
    apply_pending_updates,
    queue_update,
    widget_key,
    reset_style_defaults,
    reset_all_defaults,
)
from pfui.controls import style_controls, twist_controls
from pfui.preview import (
    make_preview_arrays,
    render_profile,
    render_mesh_snapshot_cached,
)
from pfui.health import _design_health, _health_badge, validate_dimensions
from pfui.batch_tab import render_batch_tab
from pfui.units import units_selector
from pfui.snapshot_store import (
    save_png_temp,
    cleanup_old_tempfiles,
    read_png_bytes,
    remove_png_path,
)
from pfui import state_history as Hist
from pfui.deeplink import parse_query_params, apply_state, clear_query_params
from pfui.library_ui import render_library_tab
from potfoundry.integrations.supabase_client import get_singleton_client, SupabaseClient
import time


def build_mesh_kwargs_for_test(Vd, Fd, ss, n_theta, n_z, fig_h):
    """Construct the mesh kwargs used for Plotly Mesh3d rendering.

    This helper mirrors the logic used in the full-preview path but is
    kept isolated so unit tests can exercise the branch that previously
    left `mesh_kwargs` undefined when gradient coloring was active.

    Args:
        Vd: (N,3) vertex array
        Fd: (M,3) face index array
        ss: mapping-like session state (must support .get)
        n_theta, n_z: ints used for title/diagnostics
        fig_h: float, figure height factor used elsewhere

    Returns:
        dict: mesh_kwargs suitable for passing to go.Mesh3d
    """
    import numpy as _np

    use_gradient = bool(ss.get("use_gradient_color", True))
    solid_hex = str(ss.get("solid_color", "#BFC7D5"))
    mesh_colors = []
    if len(Vd) and use_gradient:
        try:
            span_z = float(_np.ptp(Vd[:, 2])) if len(Vd) else 0.0
            z_norm = (Vd[:, 2] - Vd[:, 2].min()) / max(1e-6, span_z)
            # Simplified: always use full-length color mapping for tests
            mesh_colors = build_gradient_colors(
                z_norm,
                ss.get("preview_palette", None),
                [
                    ss.get("preview_grad_c1", "#2850D0"),
                    ss.get("preview_grad_c2", "#5FA8FF"),
                    ss.get("preview_grad_c3", "#E2F3FF"),
                ],
            )
        except Exception:
            mesh_colors = [[200, 200, 230] for _ in range(len(Vd))]
    else:
        mesh_colors = []

    # Build mesh kwargs unconditionally to avoid NameError in all branches
    mesh_kwargs: dict[str, Any] = dict(
        x=Vd[:, 0],
        y=Vd[:, 1],
        z=Vd[:, 2],
        i=Fd[:, 0],
        j=Fd[:, 1],
        k=Fd[:, 2],
        flatshading=bool(ss.get("mesh_flatshading", False)),
        lighting=dict(
            ambient=min(max(float(ss.get("mesh_ambient", 0.35)), 0.0), 1.0),
            diffuse=min(max(float(ss.get("mesh_diffuse", 0.95)), 0.0), 1.0),
            specular=min(max(float(ss.get("mesh_specular", 0.25)), 0.0), 1.0),
            roughness=min(max(float(ss.get("mesh_roughness", 0.7)), 0.0), 1.0),
            fresnel=min(max(float(ss.get("mesh_fresnel", 0.2)), 0.0), 1.0),
        ),
        hoverinfo="skip",
        name="mesh",
        opacity=1.0,
    )

    if use_gradient and len(mesh_colors):
        mesh_kwargs["vertexcolor"] = mesh_colors
    else:
        mesh_kwargs["color"] = solid_hex

    return mesh_kwargs


def _mask_possible_secrets(text: str) -> str:
    """Mask common secret patterns and any known supabase key from st.secrets.

    This is defensive: never reveal raw keys or long hashes in UI text areas.

    Args:
        text: Text potentially containing secrets

    Returns:
        Text with secrets masked/redacted
    """
    try:
        svc_key = None
        if "st" in globals() and st is not None:
            try:
                svc_key = (
                    st.secrets.get("connections", {}).get("supabase", {}).get("key")
                )
            except Exception:
                svc_key = None
        if svc_key and svc_key in text:
            text = text.replace(svc_key, "[REDACTED]")

        # Mask JWT-like tokens
        text = re.sub(
            r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]", text
        )

        # Mask long hex hashes (>=48 hex chars)
        text = re.sub(r"[0-9a-fA-F]{48,}", "[REDACTED_HASH]", text)
    except Exception:
        return text
    return text


# ------------------------------------------------------------
# Boot: apply any queued state changes BEFORE creating widgets
# ------------------------------------------------------------
def _cleanup_stale_media_ids() -> None:
    """Remove values that look like Streamlit media-file ids (hex.png) from
    session_state. These can persist across runs and cause MediaFileStorageError
    when the browser requests a missing id.

    This is defensive and cheap - it only removes strings that exactly match
    a 64-hex-character filename with .png extension or containers that contain
    such strings.
    """
    import re

    pattern = re.compile(r"^[0-9a-f]{64}\.png$")

    def _has_stale(obj: object) -> bool:
        if isinstance(obj, str):
            # treat explicit 64-hex.png ids as stale, and any string that
            # looks like a media path or contains '.png' as potentially stale
            if bool(pattern.match(obj)):
                return True
            if ".png" in obj or "media" in obj.lower():
                return True
            return False
        if isinstance(obj, dict):
            return any(_has_stale(v) for v in obj.values())
        if isinstance(obj, (list, tuple)):
            return any(_has_stale(v) for v in obj)
        if isinstance(obj, (bytes, bytearray)):
            # raw PNG bytes stored in session_state — consider stale
            return True
        return False

    ss = cast(dict[str, Any], st.session_state)
    for k in list(ss.keys()):
        # Don't treat our internal debug containers or the snapshots
        # list as stale even if they contain filenames or paths. These are
        # intentionally persisted across runs. Also preserve last preview
        # artifacts so manual mode can continue showing them.
        if k in (
            "_debug_logs",
            "_snaps",
            "_last_surface_png",
            "_last_surface_fig_json",
            "_last_mesh_png",
            "_last_mesh_fig_json",
            "_preview_stale",
        ):
            try:
                ss.setdefault("_debug_logs", []).append(
                    f"Debug: preserved session key {k}"
                )
            except Exception:
                pass
            continue

        try:
            v = cast(Any, ss.get(str(k)))
        except Exception:
            # If we can't access a key, skip it.
            continue
        try:
            if _has_stale(v):
                try:
                    del ss[k]
                except Exception:
                    # best-effort removal; ignore failures
                    pass
        except Exception:
            # If the predicate throws for an unexpected type, ignore this key.
            continue


# Run cleanup once at import to remove stale Streamlit media ids
try:
    _cleanup_stale_media_ids()
except Exception:
    pass

APP_VERSION = "2.1.0-evo"


def resolve_schema_key(style_name: str) -> str:
    """Resolve a style identifier to a STYLE_SCHEMAS key.

    This is intentionally permissive: if the exact name exists in
    STYLE_SCHEMAS it is returned
    otherwise we attempt a case-insensitive
    match and fall back to the original value.
    """
    styles = SC.get_style_schemas()
    if style_name in styles:
        return style_name
    for k in styles.keys():
        if k.lower() == str(style_name).lower():
            return k
    return style_name


# --- Apply any queued state updates from previous interactions BEFORE
# creating widgets. This ensures queue_update() calls are realized on the
# subsequent run rather than being lost across a rerun.
try:
    # Narrow session state for type-checking and ensure debug log container
    # exists early so boot messages persist
    ss = cast(dict[str, Any], st.session_state)
    if "_debug_logs" not in ss:
        ss["_debug_logs"] = []
    apply_pending_updates()
    ss["_debug_logs"].append("Boot: applied pending updates.")
except Exception:
    # Do not crash the UI on boot; best-effort diagnostics only.
    try:
        ss.setdefault("_debug_logs", []).append("Boot: failed to apply pending updates")
    except Exception:
        pass

# ------------ Page config ------------
try:
    if hasattr(st, "set_page_config"):
        st.set_page_config(page_title="PotFoundry Pro v2", layout="wide")
except Exception:
    pass
try:
    if hasattr(st, "title"):
        st.title("PotFoundry Pro v2 — Designer & Batch")
except Exception:
    pass
try:
    if hasattr(st, "caption"):
        st.caption(f"Build {APP_VERSION}")
except Exception:
    pass
# Undo/Redo buttons and keyboard shortcuts
try:
    c_ur1, c_ur2 = st.columns([1, 1])
    if c_ur1.button("Undo (Ctrl+Z)"):
        Hist.undo()
        st.rerun()
    if c_ur2.button("Redo (Ctrl+Y)"):
        Hist.redo()
        st.rerun()
except Exception:
    pass

# Inject small JS to forward Ctrl+Z / Ctrl+Y to Streamlit buttons (best-effort)
# Inject small JS to forward Ctrl+Z / Ctrl+Y to Streamlit buttons (best-effort)
try:
    if hasattr(st, "markdown"):
        st.markdown(
            """
<script>
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const btn = Array.from(document.querySelectorAll('button')).find(b=>b.innerText && b.innerText.includes('Undo'));
        if (btn) { btn.click()
        e.preventDefault()
        }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        const btn = Array.from(document.querySelectorAll('button')).find(b=>b.innerText && b.innerText.includes('Redo'));
        if (btn) { btn.click()
        e.preventDefault()
        }
    }
});
</script>
""",
            unsafe_allow_html=True,
        )
except Exception:
    pass
# NOTE: don't pop the units guard; let units_selector manage it internally
# st.session_state.pop("_units_widget_rendered_this_run", None)

# ============================================================
# Deep Link Handling (load state from URL query param)
# ============================================================
if "_deeplink_applied" not in st.session_state:
    # Narrow session-state for this block to keep type-checker happy
    ss = cast(dict[str, Any], st.session_state)
    state_from_url = parse_query_params()
    if state_from_url:
        try:
            warnings = apply_state(state_from_url, quiet=True)
            ss["_deeplink_applied"] = True
            clear_query_params()
            if warnings:
                st.info(f"Loaded design from link (with {len(warnings)} adjustments)")
            else:
                st.success("Loaded design from link")
        except Exception as e:
            st.warning(f"Failed to load design from link: {e}")
    ss.setdefault("_deeplink_applied", True)

# ------------ Tabs ------------
# Check if library is configured to show Library tab
_library_client = get_singleton_client()
_has_library = _library_client.is_configured()
_library_read_only = False
try:
    if isinstance(_library_client, SupabaseClient):
        _library_read_only = getattr(_library_client, "read_only", False)
except Exception:
    _library_read_only = False

if _has_library:
    _tab1, _tab2, _tab3 = st.tabs(["Interactive", "Batch from YAML", "Public Library"])
else:
    _tab1, _tab2 = st.tabs(["Interactive", "Batch from YAML"])
    # _tab3 is DeltaGenerator when tabs() returns three elements; when tabs() returns
    # only two we intentionally set it to None. Use cast(Any, None) so mypy won't
    # complain about assigning None to a DeltaGenerator-typed variable.
    _tab3 = cast(Any, None)

# ============================================================
# Tab 1 — Interactive Designer
# ============================================================
with _tab1:
    # ------------------ SIDEBAR (all inputs) ------------------
    with st.sidebar:
        # Narrow the runtime-typed session state to a mapping for type-checker
        ss = cast(dict[str, Any], st.session_state)
        # Units at a fixed, stable location
        units_selector()

        st.header("Model")
        # Timestamp used to implement debounced preview updates
        if "_last_change_ts" not in ss:
            ss["_last_change_ts"] = 0.0

        def _mark_changed() -> None:
            try:
                ss["_last_change_ts"] = time.time()
                # Only mark preview as stale if we're in manual or debounced
                # modes. In auto mode previews update immediately so we
                # shouldn't mark them stale.
                mode = cast(str, ss.get("preview_mode", "manual"))
                if mode in ("manual", "debounced"):
                    ss["_preview_stale"] = True
                else:
                    ss["_preview_stale"] = False
            except Exception:
                pass

        def _on_model_name_change() -> None:
            # If user edits model name manually, mark it and disable auto-name
            # so we don't overwrite the user's change.
            ss["_model_name_user_edited"] = True
            ss["_model_name_auto"] = False

        # Ensure user-edited flag exists (default False)
        if "_model_name_user_edited" not in ss:
            ss["_model_name_user_edited"] = False
        # Ensure an explicit auto-name checkbox state exists. Default to True
        # (auto name enabled) unless the user has edited the name previously.
        if "_model_name_auto" not in ss:
            ss["_model_name_auto"] = not ss["_model_name_user_edited"]
        # Compute an auto name (mirrors Snapshot default) from the last-known
        # style/H in session state so we can present the same auto-updating
        # behaviour without moving the widget in the sidebar.
        # If the session doesn't yet have a chosen style (first load), use
        # the first style from STYLES as the default so the auto-name matches
        # what the selectbox will show once rendered.
        all_styles = sorted(STYLES.keys()) if isinstance(STYLES, dict) else []
        # If no style is set in the session (first run), initialize it so the
        # selectbox and our auto-name use the same initial value.
        if "style" not in ss and all_styles:
            ss["style"] = all_styles[0]
        style_guess = cast(
            Optional[str], ss.get("style", all_styles[0] if all_styles else None)
        )

        def _unwrap_scalar(v: Any) -> Any:
            """If v is a list/tuple, return its first element; otherwise return v.

            Annotated to help static analysis (Pylance) reason about downstream
            conversions.
            """
            if isinstance(v, (list, tuple)):
                try:
                    return v[0]
                except Exception:
                    return v
            return v

        def _to_int_scalar(x: Any) -> int:
            """Coerce x to an int in a defensive, editor-friendly way.

            - Unwrap list/tuple-like containers.
            - If the resulting value is a primitive known to be convertible to
              float (int/float/str/bytes), call float(x) safely and cast to int.
            - Otherwise, attempt best-effort conversions with exception guards.
            """
            try:
                xv = _unwrap_scalar(x)
                if isinstance(xv, (int, float)):
                    return int(xv)
                if isinstance(xv, (str, bytes)):
                    try:
                        return int(float(xv))
                    except Exception:
                        return int(0)
                # Last-resort: attempt float coercion then int
                try:
                    return int(float(xv))
                except Exception:
                    return 0
            except Exception:
                try:
                    return int(x)  # best-effort fallback
                except Exception:
                    return 0

        def _to_float_scalar(x: Any) -> float:
            """Coerce x to a float in a defensive, editor-friendly way.

            - Unwrap list/tuple-like containers.
            - If x is already int/float/str/bytes, call float(x).
            - Otherwise, attempt a best-effort conversion and fall back to 0.0 on error.
            """
            try:
                v = _unwrap_scalar(x)
                if isinstance(v, (int, float)):
                    return float(v)
                if isinstance(v, (str, bytes)):
                    try:
                        return float(v)
                    except Exception:
                        return 0.0
                # Last-resort numeric coercion
                try:
                    return float(v)
                except Exception:
                    return 0.0
            except Exception:
                return 0.0

        H_guess = _to_int_scalar(ss.get("H", 120.0))
        try:
            auto_name_guess = (
                f"{style_guess}_H{int(H_guess)}"
                if style_guess
                else "SpiralRidges_Design"
            )
        except Exception:
            auto_name_guess = cast(Any, ss.get("model_name", "SpiralRidges_Design"))

        # If auto-name checkbox is enabled, make sure the session reflects
        # the automatic name before creating the widget so the input shows it.
        if cast(Any, ss.get("_model_name_auto", True)):
            ss["model_name"] = auto_name_guess
            ss["_model_name_user_edited"] = False

        # Model name input (placed near the top of the sidebar)
        name = st.text_input(
            "Model name",
            value=cast(Any, ss.get("model_name", "SpiralRidges_Design")),
            key="model_name",
            on_change=_on_model_name_change,
        )

        # Small checkbox to let the user toggle automatic naming back on.
        # Its value is stored in `_model_name_auto` and is respected at the
        # start of the run (above) so checking it will immediately restore
        # the auto-generated name.
        auto_label = "Auto-name (follow style/H)"
        st.checkbox(
            auto_label,
            value=cast(Any, ss.get("_model_name_auto", True)),
            key="_model_name_auto",
        )
        prev_style = cast(Optional[str], ss.get("_prev_style", None))
        style_options = sorted(STYLES.keys())
        style_name = st.selectbox("Style family", options=style_options, key="style")
        style_key = resolve_schema_key(style_name)
        # Jeśli styl nie istnieje w STYLE_SCHEMAS, pokaż ostrzeżenie i wybierz domyślny
        if style_key not in styles:
            st.warning(
                f"Style '{style_name}' is not available. Falling back to default style."
            )
            style_name = style_options[0]
            style_key = resolve_schema_key(style_name)
            ss["style"] = style_name
            reset_style_defaults(style_name)
            st.rerun()
        # Automatycznie resetuj kontrolki stylu po zmianie stylu
        if prev_style != style_name:
            ss["_prev_style"] = style_name
            # NIE resetuj stylu i NIE wywołuj st.rerun()
            # reset_style_defaults(style_name)
            # st.rerun()

        # Style caption (if available)
        try:
            st.caption(STYLES[style_name][1])
        except Exception:
            pass

        place_on_ground = st.checkbox(
            "Place model on ground (Z=0)",
            value=True,
            help="Preview-only option that shifts the pot so the lowest vertex sits at Z=0. The exported STL keeps its original origin.",
        )

        st.divider()
        # --- Dimensions Section ---
        with st.expander("Dimensions (mm)", expanded=True):
            H = float(
                st.number_input(
                    "Height",
                    60.0,
                    240.0,
                    _to_float_scalar(ss.get("H", 120.0)),
                    5.0,
                    key="H",
                    help="Overall height of the pot measured from the base to the rim.",
                    on_change=_mark_changed,
                )
            )

            # 'Flare exponent' control removed from Dimensions to avoid duplication.
            # The canonical 'Flare exponent' slider lives under the Profile / Curve section.
            top_od = float(
                st.number_input(
                    "Top OD",
                    60.0,
                    240.0,
                    _to_float_scalar(ss.get("top_od", 140.0)),
                    5.0,
                    key="top_od",
                    help="Outer diameter at the rim (OD = outside diameter).",
                    on_change=_mark_changed,
                )
            )
            bottom_od = float(
                st.number_input(
                    "Bottom OD",
                    40.0,
                    200.0,
                    _to_float_scalar(ss.get("bottom_od", 90.0)),
                    5.0,
                    key="bottom_od",
                    help="Outer diameter at the base. Increase for more stability or reduce for a sleeker profile.",
                    on_change=_mark_changed,
                )
            )
            t_wall = float(
                st.number_input(
                    "Wall thickness",
                    2.0,
                    8.0,
                    _to_float_scalar(ss.get("t_wall", 3.0)),
                    0.5,
                    key="t_wall",
                    help="Thickness of the pot wall. Typical FDM prints work well around 2.5–3.0 mm.",
                    on_change=_mark_changed,
                )
            )
            t_bottom = float(
                st.number_input(
                    "Bottom slab",
                    2.0,
                    10.0,
                    _to_float_scalar(ss.get("t_bottom", 3.0)),
                    0.5,
                    key="t_bottom",
                    help="Thickness of the bottom solid slab. Thicker improves rigidity and weight.",
                    on_change=_mark_changed,
                )
            )
            r_drain = float(
                st.number_input(
                    "Drain hole",
                    3.0,
                    30.0,
                    _to_float_scalar(ss.get("r_drain", 10.0)),
                    1.0,
                    key="r_drain",
                    help="Radius of the drainage hole. Ensure it remains smaller than inner radius at the base.",
                    on_change=_mark_changed,
                )
            )
            Rt, Rb = 0.5 * top_od, 0.5 * bottom_od

            # Inline validation with actionable suggestions
            try:
                _dim_issues = validate_dimensions(
                    H, top_od, bottom_od, t_wall, t_bottom, r_drain
                )
            except Exception:
                _dim_issues = []
            if _dim_issues:
                for i, issue in enumerate(_dim_issues):
                    # Level-specific message
                    if issue.level == "error":
                        st.error(issue.message)
                    elif issue.level == "warn":
                        st.warning(issue.message)
                    else:
                        st.info(issue.message)
                    # Optional Fix button
                    if issue.suggestion:
                        cfx1, cfx2 = st.columns([1, 6])
                        with cfx1:
                            if st.button("Fix", key=f"fix_{issue.field}_{i}"):
                                for k, v in issue.suggestion.items():
                                    try:
                                        ss[k] = v
                                    except Exception:
                                        pass
                                try:
                                    st.rerun()
                                except Exception:
                                    pass
                        with cfx2:
                            st.caption("Apply suggested safe values.")

        # (model_name auto-default logic handled earlier)

        # --- Profile Section ---
        with st.expander("Profile / Curve", expanded=True):
            expn = float(
                st.slider(
                    "Flare exponent",
                    0.7,
                    1.6,
                    _to_float_scalar(ss.get("expn", 1.1)),
                    0.05,
                    key=widget_key(style_key, "expn"),
                    on_change=_mark_changed,
                    help="Controls how quickly the wall expands from base to rim. >1 favors the top, <1 favors the base.",
                )
            )
            # The profile slider uses a style-scoped key and must remain
            # independent from other sliders; do NOT overwrite the canonical
            # session key 'expn' here.
            c1, c2, c3 = st.columns(3)
            # NOTE: widget keys now use style_key (not style_name)
            k1 = widget_key(style_key, "flare_center")
            k2 = widget_key(style_key, "flare_sharp")
            k3 = widget_key(style_key, "bell_amp")
            flare_center = float(
                c1.slider(
                    "Flare center (0–1)",
                    0.1,
                    0.9,
                    _to_float_scalar(ss.get(k1, 0.5)),
                    0.01,
                    key=k1,
                    on_change=_mark_changed,
                    help="Where along the height the flare concentrates. 0=base, 1=top.",
                )
            )
            flare_sharp = float(
                c2.slider(
                    "Flare sharpness",
                    1.0,
                    12.0,
                    _to_float_scalar(ss.get(k2, 6.0)),
                    0.1,
                    key=k2,
                    on_change=_mark_changed,
                    help="Higher values make the flare transition more abrupt.",
                )
            )
            bell_amp = float(
                c3.slider(
                    "Bell amplitude",
                    0.0,
                    0.5,
                    _to_float_scalar(ss.get(k3, 0.0)),
                    0.01,
                    key=k3,
                    on_change=_mark_changed,
                    help="Adds a soft ring-shaped bulge; set to 0 to disable.",
                )
            )
            c4, c5 = st.columns(2)
            k4 = widget_key(style_key, "bell_center")
            k5 = widget_key(style_key, "bell_width")
            bell_center = float(
                c4.slider(
                    "Bell center (0–1)",
                    0.1,
                    0.9,
                    _to_float_scalar(ss.get(k4, 0.5)),
                    0.01,
                    key=k4,
                    on_change=_mark_changed,
                    help="Height position of the bell-shaped bulge.",
                )
            )
            bell_width = float(
                c5.slider(
                    "Bell width",
                    0.05,
                    0.5,
                    _to_float_scalar(ss.get(k5, 0.22)),
                    0.01,
                    key=k5,
                    on_change=_mark_changed,
                    help="Controls how wide the bell bulge spreads.",
                )
            )

        # --- Mesh Quality Section (moved into Preview & Export) ---
        # n_theta and n_z will be configured in the Preview & Export section below

        # (Removed duplicate Appearance & Preview Settings block here — consolidated later in the file)

        # --- Style Options Section (options only) ---
        with st.expander("Style Options", expanded=False):
            ui_opts = style_controls(style_key)
            # Ensure SuperformulaBlossom responds to UI changes by enabling its strength from UI
            if style_name == "SuperformulaBlossom":
                ui_opts.setdefault("sf_strength", 1.0)
            ui_opts.update(
                {
                    "flare_center": flare_center,
                    "flare_sharp": flare_sharp,
                    "bell_amp": bell_amp,
                    "bell_center": bell_center,
                    "bell_width": bell_width,
                }
            )

        # Twist / Spin (restored outside Style Options)
        with st.expander("Twist / Spin", expanded=False):
            ui_opts.update(twist_controls(style_key))

        # Presets (restored outside Style Options)
        with st.expander("Presets", expanded=False):
            pdefs = PRESETS.get(style_name, {})
            if pdefs:
                cols = st.columns(max(3, min(6, len(pdefs))))
                for i, p in enumerate(pdefs.keys()):
                    if cols[i % len(cols)].button(p, key=f"preset_{style_name}_{p}"):
                        pending = {
                            widget_key(style_key, k): v for k, v in pdefs[p].items()
                        }
                        queue_update(pending)
                        st.rerun()
                st.caption("Built-in presets apply style option values.")

            with st.expander("User presets (save/load)"):
                pdata = _read_user_presets()
                names = [
                    p.get("name", f"Preset {i + 1}")
                    for i, p in enumerate(pdata.get("presets", []))
                ]
                cols = st.columns([2, 1, 1, 1])
                sel = cols[0].selectbox(
                    "User presets", options=["<none>"] + names, index=0
                )
                new_name = cols[1].text_input(
                    "New name", value=f"{style_name}_H{int(H)}"
                )

                if cols[2].button("Save new"):
                    preset = {
                        "name": new_name or f"{style_name}_H{int(H)}",
                        "style": style_name,
                        "size": {
                            "height": H,
                            "top_od": top_od,
                            "bottom_od": bottom_od,
                            "wall": t_wall,
                            "bottom": t_bottom,
                            "drain": r_drain,
                            "flare_exp": expn,
                        },
                        "opts": {
                            k: cast(Any, ss.get(widget_key(style_key, k), v["default"]))
                            for k, v in styles.get(style_key, {}).items()
                        },
                    }
                    pdata.setdefault("presets", []).append(preset)
                    if _write_user_presets(pdata):
                        st.success("Preset saved.")
                    else:
                        st.error("Failed to save preset.")

                if cols[3].button("Delete") and sel != "<none>":
                    idx = names.index(sel)
                    del pdata["presets"][idx]
                    if _write_user_presets(pdata):
                        st.success("Preset deleted.")
                    else:
                        st.error("Failed to update presets.")

                if sel != "<none>" and st.button("Apply selected"):
                    idx = names.index(sel)
                    apply_preset_dict(pdata["presets"][idx])
                    st.success("Applied preset.")
                    st.rerun()

        # Reset buttons (restored top-level)
        cL, cR = st.columns(2)
        if cL.button("Reset style to defaults"):
            reset_style_defaults(style_name)
            st.rerun()
        if cR.button("Reset ALL controls"):
            reset_all_defaults(style_name)
            st.rerun()

    # --------------- PREVIEW & EXPORT CONTROLS ---------------
    with st.expander("Preview & Export", expanded=True):
        # Use a locally-typed session mapping to keep the type-checker happy
        ss_map: dict[str, Any] = cast(dict[str, Any], st.session_state)
        # Clean layout; hide some advanced controls
        c1, c2, c3, c4 = st.columns([1.2, 1.2, 1.2, 1.2])
        # Hide Preview detail control; set to 2.0 by default
        preview_detail = float(ss_map.setdefault("preview_detail", 2.0))

        # Preview mode: manual / auto / debounced
        preview_mode = c1.selectbox(
            "Preview mode",
            options=["manual", "auto", "debounced"],
            index={"manual": 0, "auto": 1, "debounced": 2}.get(
                ss_map.get("preview_mode", "auto"), 1
            ),
            key="preview_mode",
            help="Choose how previews update: manual (button), automatic, or debounced (wait until inputs settle).",
        )

        # Hide debounce timeout; set default
        ss_map["debounce_timeout"] = float(ss_map.get("debounce_timeout", 0.8))

        # Backwards compatible flag
        auto_preview = preview_mode == "auto"

        # Always enable both Quick and Full previews (no checkboxes)
        interactive_3d = True
        interactive_mesh = True
        # Default engine: Interactive Plotly when available; remove engine selector per request
        ss_map["quick_engine"] = "interactive" if HAS_PLOTLY else "static"

        # Hide figure size controls; set defaults
        fig_w = float(ss_map.get("fig_w", 7.5))
        fig_h = float(ss_map.get("fig_h", 7.0))  # default height set to 7
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
        # Ensure typed session mapping is available in this nested scope for the type checker
        # Rebind a local typed alias for nested scopes
        ss = cast(dict[str, Any], st.session_state)
        prev_preset = cast(Optional[str], ss_map.get("_last_quality_preset", None))
        _quality_raw = ss_map.get("quality_preset", "Medium")
        quality_index = {"Low": 0, "Medium": 1, "High": 2, "Ultra": 3}.get(
            cast(str, _quality_raw), 1
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
            # Narrow the preset dict for the type-checker
            d = cast(dict[str, Any], preset_defaults[preset_name])
            ss_map["n_theta"] = d.get("n_theta", ss_map.get("n_theta", 168))
            ss_map["n_z"] = d.get("n_z", ss_map.get("n_z", 84))
            ss_map["quality_up"] = d.get("quality_up", ss_map.get("quality_up", 2))
            if preset_name == "Ultra":
                ss_map["exact_full_preview"] = d.get("exact_full_preview", True)
                ss_map["preview_res_scale"] = d.get("preview_res_scale", 1.0)
            ss_map["_last_quality_preset"] = preset_name
            _mark_changed()
        elif prev_preset is None:
            # Initialize last preset on first load
            ss_map["_last_quality_preset"] = preset_name

        n_theta = int(
            qc2.slider(
                "Angular divisions (nθ)",
                96,
                720,
                ss_map.get(
                    "n_theta",
                    cast(dict, preset_defaults)
                    .get(preset_name, {})
                    .get("n_theta", 168),
                ),
                12,
                key="n_theta",
                on_change=_mark_changed,
                help="Higher values increase roundness and detail around the pot. Affects both preview and export.",
            )
        )
        n_z = int(
            qc3.slider(
                "Vertical divisions (nz)",
                32,
                720,
                ss_map.get(
                    "n_z",
                    cast(dict, preset_defaults).get(preset_name, {}).get("n_z", 84),
                ),
                4,
                key="n_z",
                on_change=_mark_changed,
                help="Higher values add more rings along height for smoother vertical transitions.",
            )
        )

        up = cE1.select_slider(
            "Export quality upscale",
            options=[1, 2, 3],
            value=ss_map.get(
                "quality_up",
                cast(dict, preset_defaults).get(preset_name, {}).get("quality_up", 2),
            ),
            key="quality_up",
            help="Multiplies nθ & nz when generating the STL. Use higher values for ultra-smooth exports.",
        )
        # Defensive conversion helpers (_unwrap_scalar/_to_int_scalar/_to_float_scalar)
        # are declared earlier so they can be used by code in this module.

        try:
            a = _unwrap_scalar(n_theta)
            b = _unwrap_scalar(up)
            try:
                prod = float(a) * float(b)
            except Exception:
                try:
                    prod = a * b
                except Exception:
                    prod = a
            n_theta_export = _to_int_scalar(prod)
        except Exception:
            n_theta_export = _to_int_scalar(n_theta * up)  # fallback, best-effort
        try:
            a = _unwrap_scalar(n_z)
            b = _unwrap_scalar(up)
            try:
                prod = float(a) * float(b)
            except Exception:
                try:
                    prod = a * b
                except Exception:
                    prod = a
            n_z_export = _to_int_scalar(prod)
        except Exception:
            n_z_export = _to_int_scalar(n_z * up)  # fallback, best-effort
        do_export = cE2.button("Export STL…", type="primary", key="export_btn")
        # Force static mesh PNG capture (even if only appearance changed)
        if cE2.button(
            "Capture static mesh PNG",
            key="force_mesh_capture",
            help="Regeneruj statyczny obraz siatki niezależnie od tego czy geometria się zmieniła.",
        ):
            ss["_force_mesh_png_capture"] = True
            ss["_preview_stale"] = True
            try:
                st.rerun()
            except Exception:
                pass
        # Cached / regen status indicator
        last_mesh_regen = cast(
            Optional[bool], ss.get("_last_mesh_png_regenerated", None)
        )
        last_mesh_time = cast(Optional[float], ss.get("_last_mesh_png_time_ms", None))
        if last_mesh_regen is not None:
            status = "regenerated" if last_mesh_regen else "cached"
            extra = f" ({last_mesh_time:.0f} ms)" if last_mesh_time is not None else ""
            cE3.caption(f"Mesh PNG: {status}{extra} — auto=off")

        # Offer preview image downloads (PNG, optional SVG) using cached previews
        try:
            surf_png = cast(Optional[bytes], ss.get("_last_surface_png"))
            mesh_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
            # Two compact columns for download buttons if available
            d1, d2 = cE3.columns(2)
            if surf_png:
                d1.download_button(
                    "Download Quick Preview PNG",
                    data=surf_png,
                    file_name=f"{name}_preview_quick.png",
                    mime="image/png",
                )
                # Optional SVG via Plotly if possible
                if HAS_PLOTLY and cast(
                    Optional[dict], ss.get("_last_surface_fig_json")
                ):
                    try:
                        fig = go.Figure(
                            cast(Optional[dict], ss.get("_last_surface_fig_json"))
                        )
                        # Defensive unwrap to avoid passing list/tuple into float()/int()
                        w = max(
                            400, min(900, _to_int_scalar(96 * _unwrap_scalar(fig_h)))
                        )
                        h = max(
                            300, min(800, _to_int_scalar(96 * _unwrap_scalar(fig_h)))
                        )
                        svg_bytes = fig.to_image(format="svg", width=w, height=h)
                        if svg_bytes:
                            d2.download_button(
                                "Download Quick Preview SVG",
                                data=svg_bytes,
                                file_name=f"{name}_preview_quick.svg",
                                mime="image/svg+xml",
                            )
                    except Exception:
                        pass
            if mesh_png:
                cE3.download_button(
                    "Download Full Preview PNG",
                    data=mesh_png,
                    file_name=f"{name}_preview_full.png",
                    mime="image/png",
                )
        except Exception:
            pass

    # ---------------- HEALTH & WARNINGS ----------------
    st.subheader("Design checks")

    badges = _design_health(H, Rt, Rb, t_wall, t_bottom, r_drain)
    cols = st.columns(min(3, max(1, len(badges))))
    for c, b in zip(cols, badges):
        _health_badge(c, b.label, b.status, b.tip)

    # -------------------- PREVIEW ----------------------
    st.subheader("Preview")
    ss = cast(dict[str, Any], st.session_state)

    # Preview update decision: respect preview_mode (auto/manual/debounced)
    should_update_preview = False
    if preview_mode == "auto":
        should_update_preview = True
    else:
        # Render manual update controls (button + caption). The debounced
        # mode will attempt a client-side auto-click, but we also implement a
        # server-side fallback below in case the JS doesn't run in the client.
        col1, col2 = st.columns([3, 1])
        with col1:
            update_clicked = st.button("🔄 Update Preview", type="primary")
            if update_clicked:
                should_update_preview = True
                # Clear cache to force regeneration
                try:
                    st.cache_data.clear()
                except Exception:
                    pass

            if preview_mode == "debounced":
                # Inject a more robust debounce helper that schedules a click
                # on the Update button when inputs stop changing.
                timeout_ms = int(
                    _to_float_scalar(ss.get("debounce_timeout", 0.8)) * 1000
                )
                js = """
<script>
(function(){
  if (window._pf_debounce_installed) return;
  window._pf_debounce_installed = true;
  var timeout = %d;
  var timer = null;
  function findButton(){
    var byText = Array.from(document.querySelectorAll('button')).find(function(b){
      return b.innerText && b.innerText.trim().startsWith('🔄 Update Preview');
    });
    if(byText) return byText;
    var byAttr = Array.from(document.querySelectorAll('button')).find(function(b){
      return (b.getAttribute('data-testid') && b.getAttribute('data-testid').toLowerCase().includes('button')) || (b.className && b.className.toLowerCase().includes('stButton'));
    });
    return byAttr || null;
  }
  function scheduleClick(){
    if(timer) clearTimeout(timer);
    timer = setTimeout(function(){
      var btn = findButton()
      if(btn){ try{ btn.click()
      } catch(e){} }
    }, timeout);
  }
  var observer = new MutationObserver(function(){ scheduleClick()
  })
  observer.observe(document.body, {childList:true, subtree:true, attributes:true});
  ['input','change','mouseup','keyup','pointerup'].forEach(function(ev){ document.addEventListener(ev, scheduleClick, true)
  })
  var finder = setInterval(function(){ if(findButton()) { clearInterval(finder)
  } }, 250)
})();
</script>
""" % (timeout_ms,)
                try:
                    import streamlit.components.v1 as components

                    components.html(js, height=0)
                except Exception:
                    pass
        with col2:
            st.caption("Manual mode" if preview_mode == "manual" else "Debounced mode")
            # Quick utility: allow clearing preview caches if rendering gets stuck
            if st.button("Reset preview cache", key="btn_reset_preview_cache"):
                try:
                    st.cache_data.clear()
                except Exception:
                    pass
                # Clear session-cached arrays and figures
                for k in (
                    "_last_X",
                    "_last_Y",
                    "_last_Z",
                    "_last_mesh_V",
                    "_last_mesh_F",
                    "_last_mesh_fig_json",
                    "_last_surface_fig_json",
                    "_last_mesh_png",
                    "_last_surface_png",
                ):
                    try:
                        if k in ss:
                            del ss[k]
                    except Exception:
                        pass
                ss["_preview_stale"] = True
                st.rerun()

        # Server-side fallback for debounced mode: if enough time has elapsed
        # since the last change, treat it as ready to update even if the
        # client-side click didn't occur.
        if preview_mode == "debounced":
            try:
                last_ts = cast(Any, ss.get("_last_change_ts", None))
                debounce_timeout_seconds = _to_float_scalar(
                    ss.get("debounce_timeout", 0.8)
                )
                # Only update if a change actually occurred (stale flag set)
                if (
                    last_ts is not None
                    and bool(cast(Any, ss.get("_preview_stale", False)))
                    and (time.time() - float(last_ts)) >= debounce_timeout_seconds
                ):
                    should_update_preview = True
            except Exception:
                # best-effort; ignore failures
                pass

    # Style function can handle scalar or vector theta; cast for type-checker
    # Accept scalar float or any array-like for theta input/return to satisfy Pylance without optional numpy typing
    ROuterFn = Callable[
        [Union[float, _ArrayLike], float, float, float, dict], Union[float, _ArrayLike]
    ]
    # Raw style function (may accept scalar or vector theta, and may return scalar or array-like)
    _r_outer_raw = cast(
        ROuterFn, STYLES[style_name][0]
    )  # geometry comes from UI style name

    # Use the centralized adapter (imported from pfui.geometry_bridge) so callers
    # across the codebase get consistent behavior. This also avoids duplicating
    # the adapter logic in multiple places.
    from pfui.geometry_bridge import adapt_r_outer_fn

    r_outer_fn = adapt_r_outer_fn(_r_outer_raw)
    opts = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)

    # Apply interactive preview scaling to keep Full Preview responsive
    # Narrow typing: preview_res_scale is expected to be a float; use a direct cast
    preview_scale = _to_float_scalar(ss.get("preview_res_scale", 1.0))
    target_n_theta = max(16, int(n_theta * preview_detail * preview_scale))
    target_n_z = max(8, int(n_z * preview_detail * preview_scale))
    preview_n_theta = max(16, min(168, target_n_theta))
    preview_n_z = max(8, min(168, target_n_z))
    full_n_theta = max(16, min(1024, target_n_theta))
    full_n_z = max(8, min(1024, target_n_z))

    # Initialize preview cache & stale flag so manual mode can keep showing
    # the last generated preview until the user explicitly updates it.
    # Keep separate caches for surface (fast) and mesh (exact) previews
    ss.setdefault("_last_surface_png", None)
    ss.setdefault("_last_surface_fig_json", None)
    ss.setdefault("_last_mesh_png", None)
    ss.setdefault("_last_mesh_fig_json", None)
    ss.setdefault("_preview_stale", False)

    # Early placeholders so we can render the cached preview when needed.
    preview_placeholder = st.empty()
    mesh_placeholder = st.empty()

    # Predeclare values so type checker knows they exist regardless of branches
    X: Optional[Any] = None
    Y: Optional[Any] = None
    Z: Optional[Any] = None
    mesh_data: Optional[tuple[Any, Any]] = None

    # Only generate preview when allowed (auto mode or Update clicked).
    # In manual mode we must NOT recalculate or render previews automatically.
    preview_exists = False

    # Build signatures to classify changes (geometry vs appearance)
    # Predeclare signature variables with Optional types so assigning None in
    # exception paths doesn't conflict with the tuple types constructed below.
    geom_sig: Optional[
        tuple[float, float, float, float, int, int, str, str, int, int]
    ] = None
    app_sig: Optional[
        tuple[
            Any,
            Any,
            Any,
            Any,
            float,
            float,
            float,
            float,
            float,
            bool,
            float,
            float,
            float,
            float,
            int,
            bool,
        ]
    ] = None
    try:
        geom_sig = (
            float(H),
            float(Rt),
            float(Rb),
            float(expn),
            int(preview_n_theta),
            int(preview_n_z),
            str(style_name),
            str(opts_json),
            int(full_n_theta),
            int(full_n_z),
        )
        app_sig = (
            cast(Any, ss.get("preview_palette")),
            cast(Any, ss.get("preview_grad_c1")),
            cast(Any, ss.get("preview_grad_c2")),
            cast(Any, ss.get("preview_grad_c3")),
            _to_float_scalar(ss.get("mesh_ambient", 0.35)),
            _to_float_scalar(ss.get("mesh_diffuse", 0.95)),
            _to_float_scalar(ss.get("mesh_specular", 0.25)),
            _to_float_scalar(ss.get("mesh_roughness", 0.7)),
            _to_float_scalar(ss.get("mesh_fresnel", 0.2)),
            bool(show_inner),
            float(view_elev),
            float(view_azim),
            float(fig_w),
            float(fig_h),
            int(dpi),
            bool(place_on_ground),
        )
    except Exception:
        geom_sig = None
        app_sig = None

    # Compare with last-run signatures
    last_geom_sig = cast(Optional[tuple], ss.get("_last_preview_geom_sig"))
    last_app_sig = cast(Optional[tuple], ss.get("_last_preview_app_sig"))
    geom_changed = (geom_sig is None) or (geom_sig != last_geom_sig)
    app_changed = (app_sig is None) or (app_sig != last_app_sig)

    # One-shot suppression for non-model reruns (e.g., snapshot pagination)
    if bool(cast(Optional[bool], ss.get("_suppress_preview_once", False))):
        should_update_preview = False
        ss["_suppress_preview_once"] = False

    # In auto mode, skip recompute if both signatures unchanged and we have cached content
    if should_update_preview and preview_mode == "auto":
        cached_any = any(
            [
                cast(Optional[bytes], ss.get("_last_surface_png")),
                cast(Optional[dict], ss.get("_last_surface_fig_json")),
                cast(Optional[bytes], ss.get("_last_mesh_png")),
                cast(Optional[dict], ss.get("_last_mesh_fig_json")),
            ]
        )
        if (
            cached_any
            and not bool(cast(Optional[bool], ss.get("_preview_stale", False)))
            and geom_sig is not None
            and app_sig is not None
            and geom_sig == cast(Optional[tuple], ss.get("_last_preview_geom_sig"))
            and app_sig == cast(Optional[tuple], ss.get("_last_preview_app_sig"))
        ):
            should_update_preview = False
    if should_update_preview:
        t0_total = time.time()
        # Initialize to satisfy type checkers in all code paths
        t0_arrays = 0.0
        t1_arrays = 0.0
        X = None
        Y = None
        Z = None
        mesh_data = None
        try:
            with st.spinner("Computing preview…"):
                t0_arrays = time.time()
                # Reuse cached arrays when geometry unchanged
                if (not geom_changed) and all(
                    k in st.session_state for k in ("_last_X", "_last_Y", "_last_Z")
                ):
                    try:
                        X = cast(Any, ss.get("_last_X"))
                        Y = cast(Any, ss.get("_last_Y"))
                        Z = cast(Any, ss.get("_last_Z"))
                    except Exception:
                        X = Y = Z = None
                if (X is None) or (Y is None) or (Z is None):
                    X, Y, Z = make_preview_arrays(
                        H,
                        Rt,
                        Rb,
                        expn,
                        preview_n_theta,
                        preview_n_z,
                        style_name,
                        opts_json,
                    )
                    # Cache for appearance-only changes
                    try:
                        ss["_last_X"] = X
                        ss["_last_Y"] = Y
                        ss["_last_Z"] = Z
                    except Exception:
                        pass
                t1_arrays = time.time()
                # Build mesh only when geometry/style changed; appearance-only changes reuse previous mesh
                do_mesh_build = bool(interactive_mesh and geom_changed)
                if do_mesh_build:
                    try:
                        t0_mb = time.time()
                        import numpy as _np_mb

                        verts, faces, diag = build_pot_mesh(
                            H=H,
                            Rt=Rt,
                            Rb=Rb,
                            t_wall=t_wall,
                            t_bottom=t_bottom,
                            r_drain=r_drain,
                            # Use preview resolution for interactive mesh to keep UI responsive
                            expn=expn,
                            n_theta=preview_n_theta,
                            n_z=preview_n_z,
                            r_outer_fn=r_outer_fn,
                            style_opts=opts,
                        )
                        Vb = _np_mb.asarray(verts)
                        Fb = _np_mb.asarray(faces)
                        if place_on_ground and len(Vb):
                            Vb[:, 2] -= Vb[:, 2].min()
                        mesh_data = (Vb, Fb)
                        # Cache geometry for reuse when only appearance changes
                        try:
                            ss["_last_mesh_V"] = Vb
                            ss["_last_mesh_F"] = Fb
                        except Exception:
                            pass
                        t1_mb = time.time()
                        try:
                            perf = ss.setdefault("_perf_logs", [])
                            perf.append(f"mesh_build:{(t1_mb - t0_mb) * 1000:.1f}ms")
                            ss["_perf_logs"] = perf[-40:]
                        except Exception:
                            pass
                        # If seam debug samples are present, show them in a collapsible panel
                        try:
                            if (
                                opts.get("lp_debug_seam", False)
                                and isinstance(diag, dict)
                                and "seam_debug_samples" in diag
                            ):
                                with st.expander(
                                    "Seam debug samples (lp_debug_seam)", expanded=False
                                ):
                                    all_groups = diag.get("seam_debug_samples", [])
                                    # all_groups is a list of sample groups; each group may be a list of tuples
                                    for gi, group in enumerate(all_groups):
                                        st.markdown(f"**Sample group {gi + 1}**")
                                        for samp in group:
                                            try:
                                                (
                                                    theta_mid,
                                                    zc,
                                                    r_base_mid,
                                                    Rstart_mid,
                                                ) = samp
                                                delta = r_base_mid - Rstart_mid
                                                st.write(
                                                    f"θ_mid={theta_mid:.3f}, z={zc:.3f}, r_base={r_base_mid:.3f}, R_start={Rstart_mid:.3f}, delta={delta:.6f}"
                                                )
                                            except Exception:
                                                st.write(repr(samp))
                        except Exception as _e_dbg:
                            ss.setdefault("_debug_logs", []).append(
                                f"Seam debug display failed: {_e_dbg}"
                            )
                    except Exception as _e_mb:
                        ss.setdefault("_debug_logs", []).append(
                            f"Mesh build failed (preview): {_e_mb}"
                        )
                else:
                    # Skip mesh build on appearance-only changes; keep previous mesh figure/PNG
                    pass
                # In auto mode we consider the new preview current, so clear stale flag
                if preview_mode == "auto":
                    ss["_preview_stale"] = False
                preview_exists = True
        except Exception as e:
            preview_exists = False
            st.error(f"Preview generation failed: {e}")
        finally:
            try:
                perf = ss.setdefault("_perf_logs", [])
                if preview_exists:
                    perf.append(
                        f"arrays:{(t1_arrays - t0_arrays) * 1000:.1f}ms total_so_far:{(time.time() - t0_total) * 1000:.1f}ms"
                    )
                else:
                    perf.append("arrays:ERROR")
                ss["_perf_logs"] = perf[-40:]
            except Exception:
                pass
            # Remember last successful preview signatures
            try:
                if preview_exists and geom_sig is not None and app_sig is not None:
                    ss["_last_preview_geom_sig"] = geom_sig
                    ss["_last_preview_app_sig"] = app_sig
            except Exception:
                pass

    # If we're NOT updating (manual mode and Update not clicked), show the
    # previously cached preview so the UI remains usable. Only display the
    # 'out-of-date' warning in explicit manual mode when the stale flag is set.
    if not should_update_preview:
        # Cast cached preview artifacts to concrete optionals for the type checker
        last_mesh_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
        last_mesh_json = cast(Optional[dict], ss.get("_last_mesh_fig_json"))
        last_surf_png = cast(Optional[bytes], ss.get("_last_surface_png"))
        last_surf_json = cast(Optional[dict], ss.get("_last_surface_fig_json"))

        stale = bool(cast(Any, ss.get("_preview_stale", False)))
        show_warning = (preview_mode == "manual") and stale

        # Cached display: if Full preview exists, prefer it; otherwise show Quick if available.
        full_exists = bool((HAS_PLOTLY and last_mesh_json) or last_mesh_png)
        quick_exists = bool((HAS_PLOTLY and last_surf_json) or last_surf_png)

        # Show Full if it exists
        if interactive_mesh and full_exists and HAS_PLOTLY and last_mesh_json:
            try:
                f_m = go.Figure(last_mesh_json)
                mesh_placeholder.plotly_chart(
                    f_m, use_container_width=True, config={"displaylogo": False}
                )
            except Exception:
                if last_mesh_png:
                    mesh_placeholder.image(
                        last_mesh_png,
                        caption=(
                            "Full Preview (out of date)"
                            if show_warning
                            else "Full Preview"
                        ),
                        width="stretch",
                    )
        elif interactive_mesh and full_exists and last_mesh_png:
            mesh_placeholder.image(
                last_mesh_png,
                caption=(
                    "Full Preview (out of date)" if show_warning else "Full Preview"
                ),
                width="stretch",
            )

        # Only generate mesh PNGs when Plotly is unavailable (fallback), or when explicitly forced by the user.
        try:
            ss = cast(dict[str, Any], st.session_state)
            force_capture = bool(cast(Any, ss.get("_force_mesh_png_capture", False)))
            # Cap PNG mesh resolution aggressively to keep it cheap
            png_cap_n = _to_int_scalar(ss.get("png_cap_n", 64))

            t0_meshpng = time.time()
            png_bytes = None
            regen = False
            mode = "auto=off"

            if (not HAS_PLOTLY) or force_capture:
                regen = True
                mode = "force" if force_capture else "no_plotly"
                # Clear the flag immediately to avoid repeated regeneration
                if force_capture:
                    ss["_force_mesh_png_capture"] = False
                ak = "|".join(
                    str(cast(Any, ss.get(k, "")))
                    for k in (
                        "preview_palette",
                        "preview_grad_c1",
                        "preview_grad_c2",
                        "preview_grad_c3",
                        "mesh_ambient",
                        "mesh_diffuse",
                        "mesh_specular",
                        "mesh_roughness",
                        "mesh_fresnel",
                    )
                )
                try:
                    if interactive_mesh and (force_capture):
                        # Explicit mesh PNG capture: use snapshot renderer, but at capped mesh resolution
                        from pfui.preview import render_mesh_snapshot_cached

                        png_n_theta = int(max(8, min(png_cap_n, full_n_theta)))
                        png_n_z = int(max(8, min(png_cap_n, full_n_z)))
                        png_bytes = render_mesh_snapshot_cached(
                            H,
                            Rt,
                            Rb,
                            expn,
                            png_n_theta,
                            png_n_z,
                            style_name,
                            opts_json,
                            fig_w,
                            fig_h,
                            dpi,
                            inner_wall=t_wall if show_inner else None,
                            place_on_ground=place_on_ground,
                            view_elev=view_elev,
                            view_azim=view_azim,
                            appearance_key=ak,
                        )
                    else:
                        # Fallback to fast preview PNG (static engine) at capped resolution
                        png_n_theta = int(max(8, min(png_cap_n, preview_n_theta)))
                        png_n_z = int(max(8, min(png_cap_n, preview_n_z)))
                        png_bytes = render_preview_png_cached(
                            H,
                            Rt,
                            Rb,
                            expn,
                            png_n_theta,
                            png_n_z,
                            style_name,
                            opts_json,
                            fig_w,
                            fig_h,
                            dpi,
                            inner_wall=t_wall if show_inner else None,
                            view_elev=view_elev,
                            view_azim=view_azim,
                            return_png=True,
                            appearance_key=ak,
                        )
                except Exception:
                    png_bytes = None

            # Timing log for visibility
            try:
                perf = ss.setdefault("_perf_logs", [])
                elapsed_ms = (time.time() - t0_meshpng) * 1000
                perf.append(f"mesh_png:{elapsed_ms:.1f}ms regen={regen} {mode}")
                ss["_last_mesh_png_regenerated"] = regen
                ss["_last_mesh_png_time_ms"] = elapsed_ms
                ss["_perf_logs"] = perf[-40:]
            except Exception:
                pass
        except Exception:
            pass  # PNG generation is best-effort; failures shouldn't break the app

        # Dynamic placeholder: use a session flag so static analysis won't mark as unreachable
        if bool(cast(Any, ss.get("_quick_preview_disabled", False))):
            # Quick Preview is explicitly disabled by user: replace any previous preview
            try:
                preview_placeholder.info("Quick Preview is disabled")
            except Exception:
                try:
                    preview_placeholder.empty()
                except Exception:
                    pass

    # (No-op now: PNG generation is handled above in the gated block.)
    png_bytes = locals().get("png_bytes", None)

    # Quick Preview (live) — Plotly surface if available, otherwise static PNG fallback
    try:
        if should_update_preview:
            if HAS_PLOTLY and (X is not None) and (Y is not None) and (Z is not None):
                import plotly.graph_objects as go

                t0_surface = time.time()
                # Build colorscale for Quick preview from Appearance & Preview Settings
                ss = cast(dict[str, Any], st.session_state)
                use_grad_q = bool(cast(Any, ss.get("use_gradient_color", True)))
                solid_hex_q = str(cast(Any, ss.get("solid_color", "#BFC7D5")))
                c1_q = str(cast(Any, ss.get("preview_grad_c1", "#2850D0")))
                c2_q = str(cast(Any, ss.get("preview_grad_c2", "#5FA8FF")))
                c3_q = str(cast(Any, ss.get("preview_grad_c3", "#E2F3FF")))
                if use_grad_q:
                    cs_q = [[0.0, c1_q], [0.5, c2_q], [1.0, c3_q]]
                else:
                    cs_q = [[0.0, solid_hex_q], [1.0, solid_hex_q]]
                fig = go.Figure(
                    data=[go.Surface(x=X, y=Y, z=Z, colorscale=cs_q, showscale=False)]
                )
                # Make the Quick preview window twice as tall by default
                height_px = max(360, min(1800, _to_int_scalar(192 * fig_h)))
                try:
                    import numpy as _np_plot

                    rmax = float(_np_plot.max(_np_plot.sqrt(X**2 + Y**2)))
                    zmin = float(Z.min())
                    zmax = float(Z.max())
                except Exception:
                    rmax = max(1.0, _to_float_scalar(ss.get("top_od", 140.0)) * 0.5)
                    zmin, zmax = 0.0, _to_float_scalar(ss.get("H", 120.0))
                if place_on_ground:
                    zmin = 0.0
                xlim = [-rmax, rmax]
                ylim = [-rmax, rmax]
                zlim = [zmin, zmax]
                z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
                # Title includes grid size to make resolution explicit
                nz_q, nt_q = (
                    (Z.shape[0], Z.shape[1])
                    if hasattr(Z, "shape") and len(Z.shape) == 2
                    else (preview_n_z, preview_n_theta)
                )
                fig.update_layout(
                    height=height_px,
                    title=f"Quick preview (grid {nt_q}×{nz_q})",
                    scene=dict(
                        xaxis=dict(visible=False, range=xlim),
                        yaxis=dict(visible=False, range=ylim),
                        zaxis=dict(visible=False, range=zlim),
                        aspectmode="manual",
                        aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
                        camera=dict(
                            up=dict(x=0, y=0, z=1), projection=dict(type="orthographic")
                        ),
                        bgcolor=cast(Any, ss.get("preview_bg_color", "#0F1724")),
                    ),
                    margin=dict(l=0, r=0, t=30, b=0),
                )
                preview_placeholder.plotly_chart(
                    fig, use_container_width=True, config={"displaylogo": False}
                )
                # Persist latest quick preview figure for cached mode
                try:
                    ss["_last_surface_fig_json"] = fig.to_dict()
                except Exception:
                    pass
                try:
                    perf = ss.setdefault("_perf_logs", [])
                    perf.append(
                        f"surface_plotly:{(time.time() - t0_surface) * 1000:.1f}ms"
                    )
                    ss["_perf_logs"] = perf[-40:]
                except Exception:
                    pass
            elif not HAS_PLOTLY:
                # Static fallback when Plotly is unavailable
                ak = "|".join(
                    str(cast(Any, ss.get(k, "")))
                    for k in (
                        "preview_palette",
                        "preview_grad_c1",
                        "preview_grad_c2",
                        "preview_grad_c3",
                        "mesh_ambient",
                        "mesh_diffuse",
                        "mesh_specular",
                        "mesh_roughness",
                        "mesh_fresnel",
                    )
                )
                png_bytes_q = render_preview_png_cached(
                    H,
                    Rt,
                    Rb,
                    expn,
                    preview_n_theta,
                    preview_n_z,
                    style_name,
                    opts_json,
                    fig_w,
                    fig_h,
                    dpi,
                    inner_wall=t_wall if show_inner else None,
                    view_elev=view_elev,
                    view_azim=view_azim,
                    return_png=False,
                    appearance_key=ak,
                )
                if png_bytes_q:
                    preview_placeholder.image(
                        png_bytes_q, caption="Preview", width="stretch"
                    )
    except Exception:
        pass

    # Cache the freshly rendered PNG so manual mode can continue showing
    # the last preview until the user updates again.
    try:
        if png_bytes:
            # we stored png_bytes after choosing mesh vs surface above
            # but if interactive_mesh was false this is from surface
            if interactive_mesh:
                ss["_last_mesh_png"] = png_bytes
            else:
                ss["_last_surface_png"] = png_bytes
            ss["_preview_stale"] = False
    except Exception:
        pass

    # Full Preview (interactive Mesh3d or static fallback). Render only when updating.
    if should_update_preview and interactive_mesh:
        # If Plotly is present, render an interactive Mesh3d. Otherwise render a static PNG fallback.
        if HAS_PLOTLY:
            try:
                t0_mesh = time.time()
                import numpy as np
                from typing import List
                from pfui.colors import build_gradient_colors

                # Honor exact full preview: when enabled, do not reuse preview-res mesh_data
                use_exact_full = bool(cast(Any, ss.get("exact_full_preview", True)))
                V = None
                F = None

                # Reuse earlier mesh build; if missing (e.g., switched modes) build now
                if (
                    (not use_exact_full)
                    and ("mesh_data" in locals())
                    and (mesh_data is not None)
                ):
                    V, F = mesh_data
                else:
                    # If only appearance changed, try to reuse last cached geometry
                    V = None
                    F = None
                    try:
                        V = cast(Any, ss.get("_last_mesh_V"))
                        F = cast(Any, ss.get("_last_mesh_F"))
                    except Exception:
                        V = None
                        F = None
                    # If exact is requested but the cached mesh uses different resolution, rebuild
                    # use_exact_full already set above
                    last_nt = cast(Optional[int], ss.get("_last_mesh_ntheta"))
                    last_nz = cast(Optional[int], ss.get("_last_mesh_nz"))
                    needs_exact_rebuild = bool(
                        use_exact_full and ((last_nt != n_theta) or (last_nz != n_z))
                    )
                    if (
                        (V is None)
                        or (F is None)
                        or geom_changed
                        or needs_exact_rebuild
                    ):
                        # Build mesh geometry depending on exact/preview mode
                        try:
                            import numpy as _np_r

                            use_exact_full = bool(
                                cast(Any, ss.get("exact_full_preview", True))
                            )
                            # When exact is requested, use the user-selected raw sliders (n_theta, n_z)
                            # rather than the scaled/clamped full_n_* values.
                            ntheta = n_theta if use_exact_full else preview_n_theta
                            nz = n_z if use_exact_full else preview_n_z
                            verts2, faces2, _ = build_pot_mesh(
                                H=H,
                                Rt=Rt,
                                Rb=Rb,
                                t_wall=t_wall,
                                t_bottom=t_bottom,
                                r_drain=r_drain,
                                expn=expn,
                                n_theta=ntheta,
                                n_z=nz,
                                r_outer_fn=r_outer_fn,
                                style_opts=opts,
                            )
                            V = _np_r.asarray(verts2)
                            F = _np_r.asarray(faces2)
                            if place_on_ground and len(V):
                                V[:, 2] -= V[:, 2].min()
                            # Persist cache for future appearance-only updates
                            try:
                                ss["_last_mesh_V"] = Vb
                                ss["_last_mesh_F"] = Fb
                                ss["_perf_logs"] = perf[-40:]
                                st.session_state["_last_mesh_nz"] = int(nz)
                            except Exception:
                                pass
                        except Exception:
                            V = np.zeros((0, 3))
                            F = np.zeros((0, 3), dtype=int)

                # Decimation removed per request; always use V,F as built (exact when enabled, preview-res otherwise)
                use_exact_full = bool(cast(Any, ss.get("exact_full_preview", True)))
                use_approx = False

                stride_used = 1
                Vd, Fd = V, F

                # Gradient coloring using user settings based on the final plotted vertices Vd
                use_gradient = bool(cast(Any, ss.get("use_gradient_color", True)))
                solid_hex = str(cast(Any, ss.get("solid_color", "#BFC7D5")))
                if len(Vd) and use_gradient:
                    try:
                        perf = st.session_state.setdefault("_perf_logs", [])
                        perf.append(
                            f"mesh_plot_setup:verts={len(Vd)},faces={len(Fd)},approx={use_approx},stride={stride_used}"
                        )
                        st.session_state["_perf_logs"] = perf[-40:]
                    except Exception:
                        pass
                    span_z = float(np.ptp(Vd[:, 2])) if len(Vd) else 0.0
                    z_norm = (Vd[:, 2] - Vd[:, 2].min()) / max(1e-6, span_z)
                    # Optional: subsample colors to reduce JSON size for very large meshes
                    color_stride = 1
                    try:
                        # Dense meshes benefit from lighter color payload
                        if len(Vd) > 200_000:
                            color_stride = 2
                        if len(Vd) > 500_000:
                            color_stride = 4
                    except Exception:
                        color_stride = 1
                    t0_col = time.time()
                    try:
                        preset = cast(Any, ss.get("preview_palette", "Custom"))
                        custom = [
                            cast(Any, ss.get("preview_grad_c1", "#2850D0")),
                            cast(Any, ss.get("preview_grad_c2", "#5FA8FF")),
                            cast(Any, ss.get("preview_grad_c3", "#E2F3FF")),
                        ]
                        if color_stride > 1:
                            # Build on downsample and expand to full length to cut compute + JSON size
                            from pfui.colors import build_gradient_colors as _bgc

                            z_sub = z_norm[::color_stride]
                            cols_sub = _bgc(
                                z_sub, preset if preset != "Custom" else None, custom
                            )
                            # Repeat each color 'color_stride' times and trim to len(Vd)
                            mesh_colors = [
                                c for c in cols_sub for _ in range(color_stride)
                            ][: len(Vd)]
                            if len(mesh_colors) < len(Vd):
                                mesh_colors.extend(
                                    [cols_sub[-1]] * (len(Vd) - len(mesh_colors))
                                )
                        else:
                            mesh_colors = build_gradient_colors(
                                z_norm, preset if preset != "Custom" else None, custom
                            )
                    except Exception:
                        mesh_colors = [[200, 200, 230] for _ in range(len(Vd))]
                    finally:
                        try:
                            perf = st.session_state.setdefault("_perf_logs", [])
                            perf.append(
                                f"color_map:{(time.time() - t0_col) * 1000:.1f}ms"
                            )
                            st.session_state["_perf_logs"] = perf[-40:]
                        except Exception:
                            pass
                else:
                    mesh_colors = []

                # Build mesh kwargs unconditionally. Previously the dict was
                # only created in the non-gradient branch which could leave it
                # undefined when gradient coloring was enabled, causing a
                # NameError at runtime: "name 'mesh_kwargs' is not defined".
                mesh_kwargs = dict(
                    x=Vd[:, 0],
                    y=Vd[:, 1],
                    z=Vd[:, 2],
                    i=Fd[:, 0],
                    j=Fd[:, 1],
                    k=Fd[:, 2],
                    flatshading=bool(cast(Any, ss.get("mesh_flatshading", False))),
                    lighting=dict(
                        ambient=min(
                            max(_to_float_scalar(ss.get("mesh_ambient", 0.35)), 0.0),
                            1.0,
                        ),
                        diffuse=min(
                            max(_to_float_scalar(ss.get("mesh_diffuse", 0.95)), 0.0),
                            1.0,
                        ),
                        specular=min(
                            max(_to_float_scalar(ss.get("mesh_specular", 0.25)), 0.0),
                            1.0,
                        ),
                        roughness=min(
                            max(_to_float_scalar(ss.get("mesh_roughness", 0.7)), 0.0),
                            1.0,
                        ),
                        fresnel=min(
                            max(_to_float_scalar(ss.get("mesh_fresnel", 0.2)), 0.0), 1.0
                        ),
                    ),
                    hoverinfo="skip",
                    name="mesh",
                    opacity=1.0,
                )
                if use_gradient and len(mesh_colors):
                    mesh_kwargs["vertexcolor"] = mesh_colors
                else:
                    mesh_kwargs["color"] = solid_hex
                fig = go.Figure(data=[go.Mesh3d(**mesh_kwargs)])
                # Make the Full preview window twice as tall by default
                height_px = max(400, min(2000, _to_int_scalar(220 * fig_h)))
                # Symmetric XY extents and ortho projection to avoid elongation
                try:
                    rmax = float(max(abs(V[:, 0]).max(), abs(V[:, 1]).max()))
                    zmin = float(V[:, 2].min())
                    zmax = float(V[:, 2].max())
                except Exception:
                    rmax = max(1.0, _to_float_scalar(ss.get("top_od", 140.0)) * 0.5)
                    zmin, zmax = 0.0, _to_float_scalar(ss.get("H", 120.0))
                xlim = [-rmax, rmax]
                ylim = [-rmax, rmax]
                zlim = [zmin, zmax]
                z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
                # Title includes mesh resolution and face count, and whether exact or approximate was used
                try:
                    nt_used = _to_int_scalar(ss.get("_last_mesh_ntheta", 0)) or (
                        int(V.shape[0]) // max(1, (n_z if n_z else 1))
                    )
                except Exception:
                    nt_used = 0
                try:
                    nz_used = _to_int_scalar(ss.get("_last_mesh_nz", 0)) or (
                        int(V.shape[0]) // max(1, (n_theta if n_theta else 1))
                    )
                except Exception:
                    nz_used = 0
                title_txt = (
                    f"Full preview (triangles {len(Fd):,}, exact={use_exact_full})"
                )
                fig.update_layout(
                    height=height_px,
                    title=title_txt,
                    scene=dict(
                        xaxis=dict(visible=False, range=xlim),
                        yaxis=dict(visible=False, range=ylim),
                        zaxis=dict(visible=False, range=zlim),
                        aspectmode="manual",
                        aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
                        camera=dict(
                            up=dict(x=0, y=0, z=1), projection=dict(type="orthographic")
                        ),
                        bgcolor=cast(Any, ss.get("preview_bg_color", "#0E1117")),
                    ),
                    margin=dict(l=0, r=0, t=30, b=0),
                )
                try:
                    preview_placeholder.empty()
                except Exception:
                    pass
                mesh_placeholder.plotly_chart(
                    fig, use_container_width=True, config={"displaylogo": False}
                )
                t1_mesh = time.time()
                try:
                    perf = st.session_state.setdefault("_perf_logs", [])
                    perf.append(f"mesh_plotly:{(t1_mesh - t0_mesh) * 1000:.1f}ms")
                    st.session_state["_perf_logs"] = perf[-40:]
                except Exception:
                    pass
                # Persist the exact mesh figure so manual mode can show it
                try:
                    st.session_state["_last_mesh_fig_json"] = fig.to_dict()
                except Exception:
                    pass
                # Removed auto/manual mesh PNG capture here; snapshots and publish handle PNG generation explicitly
            except Exception as e:
                # Fallback to last known mesh PNG if available
                try:
                    last_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
                    if last_png:
                        mesh_placeholder.image(
                            last_png,
                            caption="Full Preview (PNG fallback)",
                            width="stretch",
                        )
                    else:
                        mesh_placeholder.info(
                            f"Mesh preview unavailable (no fallback): {e}"
                        )
                except Exception:
                    mesh_placeholder.info(f"Mesh preview unavailable (error): {e}")
        else:
            # Plotly not available: show static PNG
            try:
                current_png = png_bytes or cast(
                    Optional[bytes], ss.get("_last_mesh_png")
                )
                if current_png:
                    mesh_placeholder.image(
                        current_png, caption="Full Preview (static)", width="stretch"
                    )
                else:
                    mesh_placeholder.info("Full preview PNG not available yet.")
            except Exception:
                pass

    # -------------------- METRICS ----------------------
    st.subheader("Estimated metrics")
    try:
        _, faces_m, diag_m = cast(
            tuple[Any, Any, Any],
            build_pot_mesh(
                H=H,
                Rt=Rt,
                Rb=Rb,
                t_wall=t_wall,
                t_bottom=t_bottom,
                r_drain=r_drain,
                expn=expn,
                n_theta=max(48, n_theta // 2),
                n_z=max(24, n_z // 2),
                r_outer_fn=r_outer_fn,
                style_opts=opts,
            ),
        )
        m1, m2, m3 = st.columns(3)
        m1.metric("Triangles", f"{len(faces_m):,}")
        # diag_m may be either a dict of diagnostics or another type returned
        # by the geometry engine in some code paths; guard access with
        # isinstance so mypy knows we're only calling .get on a dict.
        if isinstance(diag_m, dict):
            top_od_val = diag_m.get("estimated_top_od_mm", 0)
            bottom_od_val = diag_m.get("estimated_bottom_od_mm", 0)
        else:
            top_od_val = 0
            bottom_od_val = 0
        m2.metric("Top OD (mm)", f"{top_od_val:.1f}")
        m3.metric("Bottom OD (mm)", f"{bottom_od_val:.1f}")
        # Seam debug samples panel: show readout when user enabled lp_debug_seam
        try:
            if (
                opts.get("lp_debug_seam", False)
                and isinstance(diag_m, dict)
                and "seam_debug_samples" in diag_m
            ):
                with st.expander("Seam debug samples (lp_debug_seam)"):
                    groups = diag_m.get("seam_debug_samples", [])
                    for gi, group in enumerate(groups):
                        st.markdown(f"**Group {gi + 1}**")
                        for samp in group:
                            try:
                                theta_mid, zc, r_base_mid, Rstart_mid = samp
                                delta = r_base_mid - Rstart_mid
                                st.write(
                                    f"θ_mid={theta_mid:.3f}, z={zc:.3f}, r_base={r_base_mid:.3f}, R_start={Rstart_mid:.3f}, delta={delta:.6f}"
                                )
                            except Exception:
                                st.write(repr(samp))
        except Exception:
            pass
    except Exception:
        st.info("Metrics unavailable for this configuration.")

    # -------------------- APPEARANCE / PREVIEW SETTINGS --------------------
    with st.expander("Appearance & Preview Settings"):
        # Initialize session defaults only once
        ss = cast(dict[str, Any], st.session_state)
        if "preview_color_mode" not in ss:
            ss["preview_color_mode"] = "gradient-3"
        if "preview_grad_c1" not in ss:
            ss["preview_grad_c1"] = "#2850D0"  # deep blue
        if "preview_grad_c2" not in ss:
            ss["preview_grad_c2"] = "#5FA8FF"  # mid blue
        if "preview_grad_c3" not in ss:
            ss["preview_grad_c3"] = "#E2F3FF"  # light tint
        if "preview_palette" not in ss:
            ss["preview_palette"] = "Custom"
        if "mesh_ambient" not in ss:
            ss["mesh_ambient"] = 0.50
        if "mesh_diffuse" not in ss:
            ss["mesh_diffuse"] = 1.00
        if "mesh_specular" not in ss:
            ss["mesh_specular"] = 0.40
        if "mesh_roughness" not in ss:
            ss["mesh_roughness"] = 0.45
        if "mesh_fresnel" not in ss:
            ss["mesh_fresnel"] = 0.25
        if "preview_bg_color" not in ss:
            # Slightly brighter blue-gray background that's still dark but more contrasty
            ss["preview_bg_color"] = "#0F1724"
        # Make Warm Sunset the default initial palette for a more exciting start
        if "preview_palette" not in ss:
            ss["preview_palette"] = "Warm Sunset"
        if "preview_grad_c1" not in ss:
            ss["preview_grad_c1"] = "#FF6E40"
        if "preview_grad_c2" not in ss:
            ss["preview_grad_c2"] = "#FFA65A"
        if "preview_grad_c3" not in ss:
            ss["preview_grad_c3"] = "#FFEBA0"

        st.markdown("**Color Mapping**")
        if "use_gradient_color" not in ss:
            ss["use_gradient_color"] = True
        if "solid_color" not in ss:
            ss["solid_color"] = "#BFC7D5"
        # Invert control: expose 'Use solid color' checkbox, update use_gradient_color accordingly
        cols_toggle = st.columns([1, 1])
        with cols_toggle[0]:
            use_solid = st.checkbox(
                "Use solid color",
                value=(not cast(Any, ss.get("use_gradient_color", True))),
                help="When enabled, surfaces and mesh use a single solid color (faster for very large meshes).",
            )
            # Reflect into existing session key expected by rendering paths
            ss["use_gradient_color"] = not use_solid
        with cols_toggle[1]:
            palette = st.selectbox(
                "Palette preset",
                ["Custom", "Classic Blue", "Warm Sunset", "Forest", "Mono Height"],
                key="preview_palette",
                help="Choose a predefined palette or 'Custom' to edit colors manually.",
            )

        if cast(Any, ss.get("use_gradient_color", True)):
            colc1, colc2, colc3 = st.columns(3)
            with colc1:
                preview_grad_c1_val = st.color_picker(
                    "Gradient start", key="preview_grad_c1"
                )
            with colc2:
                preview_grad_c2_val = st.color_picker(
                    "Mid / secondary", key="preview_grad_c2"
                )
            with colc3:
                preview_grad_c3_val = st.color_picker(
                    "Gradient end", key="preview_grad_c3"
                )
        st.color_picker(
            "Solid color", key="solid_color", help="Used when gradient is disabled."
        )

        st.markdown("**Mesh Lighting**")
        if "mesh_flatshading" not in ss:
            ss["mesh_flatshading"] = False
        lc1, lc2, lc3, lc4, lc5, lc6 = st.columns(6)
        with lc1:
            ambient_val = st.slider(
                "Ambient",
                0.0,
                1.0,
                _to_float_scalar(ss.get("mesh_ambient", 0.50)),
                0.01,
                key="mesh_ambient",
            )
        with lc2:
            diffuse_val = st.slider(
                "Diffuse",
                0.0,
                1.0,
                min(max(_to_float_scalar(ss.get("mesh_diffuse", 1.0)), 0.0), 1.0),
                0.01,
                key="mesh_diffuse",
            )
        with lc3:
            specular_val = st.slider(
                "Specular",
                0.0,
                1.0,
                _to_float_scalar(ss.get("mesh_specular", 0.40)),
                0.01,
                key="mesh_specular",
            )
        with lc4:
            roughness_val = st.slider(
                "Roughness",
                0.0,
                1.0,
                _to_float_scalar(ss.get("mesh_roughness", 0.45)),
                0.01,
                key="mesh_roughness",
            )
        with lc5:
            fresnel_val = st.slider(
                "Fresnel",
                0.0,
                1.0,
                _to_float_scalar(ss.get("mesh_fresnel", 0.25)),
                0.01,
                key="mesh_fresnel",
            )
        with lc6:
            st.checkbox(
                "Flat shading",
                value=cast(Any, ss.get("mesh_flatshading", False)),
                key="mesh_flatshading",
                help="Toggle flat shading to better see facet divisions.",
            )

        # Values already stored in st.session_state by Streamlit (via keys). We keep
        # local variables if later logic wants to detect changes without re-reading.

        st.markdown("**Background**")
        preview_bg_val = st.color_picker("Preview background", key="preview_bg_color")

        st.markdown("**Resolution & Quality**")
        if "preview_res_scale" not in ss:
            ss["preview_res_scale"] = 1.0
        if "exact_full_preview" not in ss:
            ss["exact_full_preview"] = True
        if "manual_full_res" not in ss:
            ss["manual_full_res"] = True
        if "preview_dpi" not in ss:
            ss["preview_dpi"] = 110
        rc1, rc2, rc3 = st.columns(3)
        with rc1:
            preview_res_scale_val = st.slider(
                "Preview resolution scale",
                0.2,
                1.0,
                _to_float_scalar(ss.get("preview_res_scale", 1.0)),
                0.05,
                key="preview_res_scale",
                help="Multiplier applied to n_theta/n_z for interactive previews to improve speed.",
            )
        with rc2:
            exact_full_preview_val = st.checkbox(
                "Exact Full Preview",
                value=cast(Any, ss.get("exact_full_preview", True)),
                key="exact_full_preview",
                help="When enabled, the Full preview uses the exact full resolution (n_theta/n_z) with no decimation.",
            )
        with rc3:
            manual_full_res_val = st.checkbox(
                "Manual mode full res",
                value=cast(Any, ss.get("manual_full_res", True)),
                key="manual_full_res",
                help="In manual mode, use full base resolution when generating mesh PNG.",
            )
        preview_dpi_val = st.slider(
            "PNG dpi",
            80,
            220,
            _to_int_scalar(ss.get("preview_dpi", 110)),
            5,
            key="preview_dpi",
            help="Higher DPI for crisper static PNG snapshots.",
        )

        # Decimation threshold removed per user request; Full preview fidelity now driven solely by 'Exact Full Preview'.

        st.caption(
            "Settings are applied immediately to new renders. Existing previews update on next recalculation / Update click (manual mode)."
        )

    # -------------------- SNAPSHOTS --------------------
    with st.expander("Snapshots (compare)"):
        ss = cast(dict[str, Any], st.session_state)
        # Record current snapshots count for debugging (helps trace clears)
        ss.setdefault("_debug_logs", []).append(
            f"Render: _snaps count = {len(cast(Any, ss.get('_snaps', [])))}"
        )
        snaps: List[Dict[str, Any]] = cast(Any, ss.get("_snaps", []))

        # Add Clear All Snapshots button
        if snaps:
            col_clear1, col_clear2 = st.columns([3, 1])
            with col_clear2:
                if st.button("🗑️ Clear All", help="Delete all snapshots"):
                    ss["_snaps"] = []
                    snaps = []
                    cleanup_old_tempfiles()  # Clean up temp files
                    # UI-only change; suppress preview update on next rerun
                    ss["_suppress_preview_once"] = True
                    st.rerun()

        sc1, sc2 = st.columns([2, 1])
        snap_name = sc1.text_input("Snapshot name", value=f"{style_name}_H{int(H)}")
        if sc2.button("Capture"):
            png_path: Optional[str] = None
            # Initialize debug logs in session state if not already present
            if "_debug_logs" not in ss:
                ss["_debug_logs"] = []

            def log_debug(message: str):
                ss.setdefault("_debug_logs", []).append(message)

            try:
                # Delegate snapshot rendering to central cached function which
                # builds the actual triangulated mesh and tries Plotly first.
                opts_json = json.dumps(dict(ui_opts))
                capture_bytes = render_mesh_snapshot_cached(
                    H,
                    Rt,
                    Rb,
                    expn,
                    n_theta,
                    n_z,
                    style_name,
                    opts_json,
                    fig_w,
                    fig_h,
                    dpi,
                    inner_wall=t_wall if show_inner else None,
                    place_on_ground=place_on_ground,
                    view_elev=view_elev,
                    view_azim=view_azim,
                    theme=(
                        "dark" if st.get_option("theme.base") == "dark" else "light"
                    ),
                )

                if capture_bytes:
                    png_path = save_png_temp(capture_bytes)
                    # Ensure method is typed as str (session may contain DeltaGenerator)
                    method = cast(str, ss.get("_last_snapshot_method", ""))
                    st.success(
                        f"✓ Snapshot '{snap_name}' captured successfully! (method: {method})"
                    )
                    ss.setdefault("_debug_logs", []).append(
                        f"Snapshot capture used method: {method}"
                    )
                else:
                    png_path = None
                    st.error(
                        "Failed to generate snapshot image. Ensure Full Preview is enabled and try again."
                    )
            except Exception as e:
                st.error(f"Snapshot capture failed: {e}")
                png_path = None

            log_debug("Updating session state with new snapshot (direct write).")
            new_snaps = snaps + [
                {
                    "name": snap_name,
                    "png": png_path or "",
                    "style_ui": style_name,  # store UI & key
                    "style_key": style_key,
                    "params": {
                        "H": H,
                        "top_od": top_od,
                        "bottom_od": bottom_od,
                        "t_wall": t_wall,
                        "t_bottom": t_bottom,
                        "r_drain": r_drain,
                        "expn": expn,
                        "opts": dict(ui_opts),
                    },
                }
            ]
            # Write directly so the UI reflects the new snapshot without a
            # forced rerun. Keep only the last 6 snapshots.
            ss["_snaps"] = new_snaps[-6:]
            log_debug("Session state updated (direct write).")
            # Re-read into local variable so the current run will render the
            # newly added snapshot immediately (avoids needing st.rerun()).
            snaps = cast(Any, ss.get("_snaps", []))

            # checkpoint the UI state when capturing snapshots
            try:
                Hist.checkpoint(style_name)
            except Exception:
                pass

        # Display debug logs in a text area
        if "_debug_logs" not in ss:
            ss["_debug_logs"] = []
        # Mask any potential secrets before showing debug logs in UI
        masked_logs = [
            _mask_possible_secrets(log_entry)
            for log_entry in cast(Any, ss.get("_debug_logs", []))
        ]
        st.text_area("Debug Logs", value="\n".join(masked_logs), height=300)

        # Re-read snaps to ensure we display the latest list (capture may
        # have mutated st.session_state earlier in this run).
        snaps = cast(Any, ss.get("_snaps", []))

        # Paginate snapshots (3 per page)
        if snaps:
            per_page = 3
            page = _to_int_scalar(ss.get("_snap_page", 0))
            max_page = max(0, math.ceil(len(snaps) / per_page) - 1)
            nav_col1, nav_col2, nav_col3 = st.columns([1, 1, 6])
            if nav_col1.button("◀ Prev"):
                st.session_state["_snap_page"] = max(0, page - 1)
                st.session_state["_suppress_preview_once"] = True
                st.rerun()
            if nav_col2.button("Next ▶"):
                st.session_state["_snap_page"] = min(max_page, page + 1)
                st.session_state["_suppress_preview_once"] = True
                st.rerun()
            nav_col3.caption(
                f"Showing page {page + 1} / {max_page + 1}  — total snapshots: {len(snaps)}"
            )

            start = page * per_page
            end = start + per_page
            for idx, s in enumerate(snaps[start:end], start=start):
                i = idx
                cc1, cc2, cc3 = st.columns([2, 1, 1])
                # show a small preview image if available
                png_bytes_local = None
                try:
                    png_bytes_local = read_png_bytes(s.get("png"))
                except Exception:
                    png_bytes_local = None
                if png_bytes_local:
                    cc1.image(
                        png_bytes_local,
                        caption=f"{i + 1}. {s['name']}",
                        width="stretch",
                    )
                else:
                    cc1.write(f"**{i + 1}. {s['name']}**")
                if cc2.button("Apply", key=f"apply_{i}"):
                    pending = {
                        "H": s["params"]["H"],
                        "top_od": s["params"]["top_od"],
                        "bottom_od": s["params"]["bottom_od"],
                        "t_wall": s["params"]["t_wall"],
                        "t_bottom": s["params"]["t_bottom"],
                        "r_drain": s["params"]["r_drain"],
                        "expn": s["params"]["expn"],
                        "style": s.get(
                            "style_ui", style_name
                        ),  # update visible selectbox
                    }
                    sk = s.get(
                        "style_key", resolve_schema_key(s.get("style_ui", style_name))
                    )
                    for k, v in s["params"]["opts"].items():
                        pending[widget_key(sk, k)] = v
                        try:
                            queue_update(pending)
                            ss.setdefault("_debug_logs", []).append(
                                f"Queued snapshot {i + 1} for apply; rerunning."
                            )
                            # We'll re-render after state applies; avoid an extra preview compute during rerun frame
                            ss["_suppress_preview_once"] = True
                            st.rerun()
                        except Exception:
                            ss.setdefault("_debug_logs", []).append(
                                f"Failed to queue_update snapshot {i + 1}; falling back to direct write."
                            )
                            for _k, _v in pending.items():
                                try:
                                    ss[_k] = _v
                                except Exception:
                                    pass
                if cc3.button("Delete", key=f"del_{i}"):
                    # Remove temp file if present and looks safe
                    try:
                        remove_png_path(s.get("png"))
                    except Exception:
                        pass
                    new_snaps = snaps[:i] + snaps[i + 1 :]
                    ss["_snaps"] = new_snaps
                    ss.setdefault("_debug_logs", []).append(
                        f"Deleted snapshot {i + 1}."
                    )
                    ss["_suppress_preview_once"] = True

    # ---------------------- EXPORT ---------------------
    st.subheader("Export STL")

    # Library publish controls (if configured)
    publish_enabled = False
    publish_title = ""
    publish_tags = []
    publish_license = "CC BY-NC 4.0"
    license_consent = False

    if _has_library and not _library_read_only:
        with st.expander("📚 Publish to Public Library", expanded=False):
            st.markdown(
                "Share your design with the community. Published designs are public and downloadable by anyone."
            )

            publish_enabled = st.checkbox(
                "Enable publishing", value=False, key="publish_enable"
            )

            if publish_enabled:
                # Default title from design name
                default_title = (
                    f"{style_name} pot - {datetime.now().strftime('%Y-%m-%d')}"
                )
                publish_title = st.text_input(
                    "Title *",
                    value=default_title,
                    max_chars=120,
                    help="Short descriptive title (1-120 characters)",
                )

                publish_tags_input = st.text_input(
                    "Tags",
                    value="",
                    help="Comma-separated tags (max 10, alphanumeric + dash/underscore only)",
                )
                publish_tags = [
                    t.strip() for t in publish_tags_input.split(",") if t.strip()
                ]

                publish_license = st.selectbox(
                    "License *",
                    options=[
                        "CC BY-NC 4.0",
                        "CC BY 4.0",
                        "CC BY-SA 4.0",
                        "CC0 1.0",
                        "MIT",
                        "Apache 2.0",
                    ],
                    index=0,
                    help="License for your design. CC BY-NC 4.0 = Attribution, Non-Commercial",
                )

                license_consent = st.checkbox(
                    f"I grant permission to publish this design under {publish_license}",
                    value=False,
                    help="Required: You must agree to publish under the selected license",
                )

                if not license_consent:
                    st.warning("⚠️ You must agree to the license terms to publish")

                # Dedicated Publish button (independent of Export)
                st.session_state["_publish_clicked"] = st.button(
                    "Publish",
                    type="primary",
                    disabled=not (publish_enabled and license_consent),
                )
    elif _has_library and _library_read_only:
        with st.expander("📚 Publish to Public Library", expanded=False):
            st.info(
                "This device is connected to the Public Library in read-only mode (anon key). Browsing works, but publishing is disabled. Provide a service_role key in `.streamlit/secrets.toml` to enable publishing."
            )

    # Handle explicit Publish click (without requiring Export)
    ss = cast(dict[str, Any], st.session_state)
    if cast(Any, ss.get("_publish_clicked")):
        # Narrow publish fields once for the publish flow; these values come from Streamlit widgets
        title_safe: str = str(publish_title or "")
        license_safe: str = str(publish_license or "CC BY-NC 4.0")
        tags_safe: list[str] = list(publish_tags or [])
        try:
            # Build mesh at export resolution (reuse upscale), else fall back to current n_theta/n_z
            up = (
                _to_float_scalar(ss.get("_export_upscale", 1.0))
                if "_export_upscale" in ss
                else 1.0
            )
            # Reuse the already-defined defensive helpers above (no redeclaration)
            try:
                a = _unwrap_scalar(n_theta)
                b = _unwrap_scalar(up)
                try:
                    prod = float(a) * float(b)
                except Exception:
                    try:
                        prod = a * b
                    except Exception:
                        prod = a
                n_theta_pub = _to_int_scalar(prod)
            except Exception:
                n_theta_pub = _to_int_scalar(n_theta * up)
            try:
                a = _unwrap_scalar(n_z)
                b = _unwrap_scalar(up)
                try:
                    prod = float(a) * float(b)
                except Exception:
                    try:
                        prod = a * b
                    except Exception:
                        prod = a
                n_z_pub = _to_int_scalar(prod)
            except Exception:
                n_z_pub = _to_int_scalar(n_z * up)
            verts, faces, _ = build_pot_mesh(
                H=H,
                Rt=Rt,
                Rb=Rb,
                t_wall=t_wall,
                t_bottom=t_bottom,
                r_drain=r_drain,
                expn=expn,
                n_theta=n_theta_pub,
                n_z=n_z_pub,
                r_outer_fn=r_outer_fn,
                style_opts=opts,
            )
            safe = (
                re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or ""))[:80]
                or "potfoundry_model"
            )
            tmp_path = (
                Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.stl"
            )
            if WRITE_STL_BINARY is None:
                raise RuntimeError("write_stl_binary not available in this build")
            WRITE_STL_BINARY(str(tmp_path), safe, verts, faces)
            data = tmp_path.read_bytes()
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

            if publish_enabled and license_consent and _has_library:
                from potfoundry.library import publish_design

                size_dict = {
                    "height": H,
                    "top_od": top_od,
                    "bottom_od": bottom_od,
                    "wall_thickness": t_wall,
                    "bottom_thickness": t_bottom,
                    "drain_radius": r_drain,
                    "flare_exp": expn,
                }
                mesh_dict = {
                    "n_theta": n_theta_pub,
                    "n_z": n_z_pub,
                    "twist": opts.get("twist", 0.0),
                }
                diagnostics_dict = {
                    "triangle_count": len(faces),
                    "vertex_count": len(verts),
                }
                git_commit: Optional[str] = None
                try:
                    import subprocess

                    git_commit = (
                        subprocess.check_output(
                            ["git", "rev-parse", "--short", "HEAD"],
                            cwd=Path(__file__).parent,
                            stderr=subprocess.DEVNULL,
                        )
                        .decode()
                        .strip()
                    )
                except Exception:
                    git_commit = None

                with st.spinner("Publishing to library..."):
                    result = publish_design(
                        stl_bytes=data,
                        style=style_name,
                        size=size_dict,
                        opts=opts,
                        mesh=mesh_dict,
                        diagnostics=diagnostics_dict,
                        license=license_safe,
                        title=title_safe,
                        tags=tags_safe,
                        app_commit=git_commit or "",
                    )
                if result.duplicate:
                    st.info(f"✓ Design already published (ID: {result.id[:8]}...)")
                else:
                    st.success(f"✓ Published! ID: {result.id[:8]}...")
                # Prevent an unnecessary preview recompute on the immediate rerun
                st.session_state["_suppress_preview_once"] = True

        except Exception as e:
            st.error(f"Publish failed: {e}")

    if do_export:
        try:
            from datetime import datetime

            with st.spinner("Exporting STL…"):
                verts, faces, _ = build_pot_mesh(
                    H=H,
                    Rt=Rt,
                    Rb=Rb,
                    t_wall=t_wall,
                    t_bottom=t_bottom,
                    r_drain=r_drain,
                    expn=expn,
                    n_theta=n_theta_export,
                    n_z=n_z_export,
                    r_outer_fn=r_outer_fn,
                    style_opts=opts,
                )
                safe = (
                    re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or ""))[:80]
                    or "potfoundry_model"
                )
                tmp_path = (
                    Path(tempfile.gettempdir())
                    / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.stl"
                )
                if WRITE_STL_BINARY is None:
                    raise RuntimeError("write_stl_binary not available in this build")
                # Export as binary STL (recommended: smaller, faster, universally supported)
                WRITE_STL_BINARY(str(tmp_path), safe, verts, faces)
                data = tmp_path.read_bytes()
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass
            st.success(f"STL ready: {safe}.stl  — triangles: {len(faces):,}")
            st.download_button(
                "Download STL", data=data, file_name=f"{safe}.stl", mime="model/stl"
            )
            # Avoid recomputing preview on the next UI rerun after export
            st.session_state["_suppress_preview_once"] = True

            # Publish to library if enabled
            if publish_enabled and license_consent and _has_library:
                try:
                    from potfoundry.library import publish_design

                    # Prepare size dict
                    size_dict = {
                        "height": H,
                        "top_od": top_od,
                        "bottom_od": bottom_od,
                        "wall_thickness": t_wall,
                        "bottom_thickness": t_bottom,
                        "drain_radius": r_drain,
                        "flare_exp": expn,
                    }

                    # Prepare mesh dict
                    mesh_dict = {
                        "n_theta": n_theta_export,
                        "n_z": n_z_export,
                        "twist": opts.get("twist", 0.0),
                    }

                    # Prepare diagnostics
                    diagnostics_dict = {
                        "triangle_count": len(faces),
                        "vertex_count": len(verts),
                    }

                    # Get git commit (optional)
                    try:
                        import subprocess

                        git_commit = (
                            subprocess.check_output(
                                ["git", "rev-parse", "--short", "HEAD"],
                                cwd=Path(__file__).parent,
                                stderr=subprocess.DEVNULL,
                            )
                            .decode()
                            .strip()
                        )
                    except Exception:
                        git_commit = None

                    # Publish
                    with st.spinner("Publishing to library..."):
                        result = publish_design(
                            stl_bytes=data,
                            style=style_name,
                            size=size_dict,
                            opts=opts,
                            mesh=mesh_dict,
                            diagnostics=diagnostics_dict,
                            license=license_safe,
                            title=title_safe,
                            tags=tags_safe,
                            app_commit=git_commit or "",
                        )

                    if result.duplicate:
                        st.info(f"✓ Design already published (ID: {result.id[:8]}...)")
                    else:
                        st.success(f"✓ Published! ID: {result.id[:8]}...")

                    # Show library link
                    from pfui.deeplink import generate_deep_link

                    state_to_encode = {
                        "style": style_name,
                        "H": H,
                        "top_od": top_od,
                        "bottom_od": bottom_od,
                        "t_wall": t_wall,
                        "t_bottom": t_bottom,
                        "r_drain": r_drain,
                        "expn": expn,
                        "opts": opts,
                    }
                    # Resolve base URL for deep links.
                    # Preference: root app_url (secrets) -> nested app_url -> APP_URL env -> localhost default.
                    base_url = st.secrets.get("app_url", None)
                    if not base_url:
                        try:
                            base_url = (
                                st.secrets.get("connections", {})
                                .get("supabase", {})
                                .get("app_url")
                            )
                        except Exception:
                            base_url = None
                    if not base_url:
                        import os as _os

                        base_url = _os.environ.get("APP_URL")
                    if not base_url:
                        base_url = "http://localhost:8501"
                    deep_link = generate_deep_link(state_to_encode, base_url)

                    # Mask any accidental secrets before showing the link in UI
                    def _mask_possible_secrets(text: str) -> str:
                        try:
                            # Mask exact supabase service key if available in st.secrets
                            svc_key = None
                            if "st" in globals() and st is not None:
                                try:
                                    svc_key = (
                                        st.secrets.get("connections", {})
                                        .get("supabase", {})
                                        .get("key")
                                    )
                                except Exception:
                                    svc_key = None
                            if svc_key and svc_key in text:
                                text = text.replace(svc_key, "[REDACTED]")

                            # Mask JWT-like tokens (three dot-separated parts)
                            text = re.sub(
                                r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
                                "[REDACTED_JWT]",
                                text,
                            )

                            # Mask long hex hashes (e.g., 64-char sha256)
                            text = re.sub(r"[0-9a-fA-F]{48,}", "[REDACTED_HASH]", text)
                        except Exception:
                            # If masking fails, return the original text to avoid hiding useful info
                            return text
                        return text

                    safe_link = _mask_possible_secrets(deep_link)
                    # Show a compact link button and tuck the raw URL into a collapsible section
                    try:
                        st.link_button("Open shared link", url=deep_link)
                    except Exception:
                        st.markdown(f"[Open shared link]({deep_link})")

                    with st.expander("Shareable link (URL)", expanded=False):
                        st.code(safe_link, language=None)

                except Exception as e:
                    st.error(f"Publishing failed: {e}")
                    st.exception(e)

        except Exception as e:
            st.error(f"Export failed: {e}")

    # ----------------- 2D PROFILE ----------------------
    with st.expander("2D radial profile"):
        render_profile(H, Rt, Rb, expn, r_outer_fn, opts, t_wall)

    # --------------- PERFORMANCE (DEV) ----------------
    with st.expander("Performance (dev)"):
        perf_logs = cast(Any, ss.get("_perf_logs", []))
        st.text_area("Recent timings", value="\n".join(perf_logs[-30:]), height=180)
        if st.button("Force clear caches"):
            try:
                st.cache_data.clear()
                st.success("Caches cleared")
            except Exception:
                st.error("Failed to clear caches")

# ============================================================
# Tab 2 — Batch from YAML
# ============================================================

with _tab2:
    render_batch_tab()

# ============================================================
# Tab 3 — Public Library (if configured)
# ============================================================

if _tab3 is not None:
    with _tab3:
        render_library_tab()

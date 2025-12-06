"""Model name input controls with auto-naming functionality."""

from __future__ import annotations

from typing import Any, cast

from pfui._st import get_effective_st as get_st
from pfui.imports import STYLES
from pfui.state import widget_key

from .utils import to_int_scalar


def render_model_name_controls(ss: dict[str, Any]) -> None:
    """Render model name input with auto-naming logic.
    
    Args:
        ss: Session state dictionary

    """
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
    try:
        all_styles = sorted(list(STYLES.keys()))
    except Exception:
        try:
            all_styles = sorted([k for k in STYLES])
        except Exception:
            all_styles = []
    # If no style is set in the session (first run), initialize it so the
    # selectbox and our auto-name use the same initial value.
    if "style" not in ss and all_styles:
        ss["style"] = all_styles[0]
    style_guess = cast(
        "str | None", ss.get("style", all_styles[0] if all_styles else None),
    )

    # Build auto-name from style + height (if available). If H doesn't
    # exist or is a wacky type, we gracefully degrade to a simple guess.
    # We attempt unwrapping lists/tuples and converting to an int in the name.
    H_val_raw = ss.get("H", 100)  # default to 100 if not set
    try:
        H_val = to_int_scalar(H_val_raw)
    except Exception:
        H_val = 100

    # If model_name doesn't exist yet, or if auto-name is enabled, we can
    # safely set or update the auto-generated name.
    computed_auto_name = f"{style_guess or 'pot'}_{H_val}mm" if style_guess else "pot_100mm"

    # If auto-naming is enabled, or if the model name is missing, initialize it
    if "_model_name_auto" not in ss:
        ss["_model_name_auto"] = True
    if ("model_name" not in ss) or (ss.get("_model_name_auto", False) is True):
        ss["model_name"] = computed_auto_name

    st = get_st()
    col1, col2 = st.columns([3, 1])
    with col1:
        st.text_input(
            "Model Name",
            key=widget_key("model_name"),
            on_change=_on_model_name_change,
            help="A descriptive name for your pot model. Used in exports and library.",
        )
    with col2:
        # Small checkbox to re-enable or disable auto-naming
        auto_checked = st.checkbox(
            "Auto",
            value=ss.get("_model_name_auto", True),
            help="Automatically generate model name from style and height",
        )
        # Update auto-name flag in session state
        ss["_model_name_auto"] = auto_checked
        # If user just checked auto-name, reset user-edited flag
        # so future auto-updates take effect
        if auto_checked:
            ss["_model_name_user_edited"] = False
            # Also update the name right now
            ss["model_name"] = computed_auto_name

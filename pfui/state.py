# pfui/state.py
from __future__ import annotations

"""
Purpose
    Session state helpers for the UI layer: widget keys, pending-update queue,
    and default-reset utilities driven by the schema.

Inputs
    Functions accept plain Python types (dicts/str).

Outputs
    Mutations to st.session_state, via a small staging area (_PENDING_KEY).

Guarantees
    - No imports from potfoundry/core/**
    - No file I/O or side effects on import.
    - queue_update/apply_pending_updates use deep-merge semantics.
    - Resets are schema-driven (no hard-coded defaults).

Errors
    - Functions are defensive and avoid raising where not necessary.

Example
    queue_update({"panel": {"open": True}})
    apply_pending_updates()  # merge then clear pending
"""

import importlib  # noqa: E402
from typing import Any, Dict, MutableMapping, cast  # noqa: E402

import streamlit as st  # noqa: E402

# Lazy-load schema constants to avoid importing pfui.schemas at module import time.
STYLE_SCHEMAS: dict = {}
GLOBAL_CONTROLS: dict = {}


def _ensure_schema_globals() -> None:
    global STYLE_SCHEMAS, GLOBAL_CONTROLS
    if not STYLE_SCHEMAS or not GLOBAL_CONTROLS:
        try:
            mod = importlib.import_module("pfui.schemas")
            STYLE_SCHEMAS.update(getattr(mod, "get_style_schemas", lambda: {})() or {})
            GLOBAL_CONTROLS.update(
                getattr(mod, "get_global_controls", lambda: {})() or {}
            )
        except Exception:
            STYLE_SCHEMAS = STYLE_SCHEMAS or {}
            GLOBAL_CONTROLS = GLOBAL_CONTROLS or {}


# ---------- Widget key helper -------------------------------------------------


def widget_key(style: str, field: str) -> str:
    """
    Purpose:
        Build a stable Streamlit widget key for a (style, field) pair.

    Inputs:
        style: str  - style name (UI display label)
        field: str  - parameter key (legacy-keyed in current UI)

    Outputs:
        str - normalized widget key, safe for Streamlit.

    Guarantees:
        - Only [a-z0-9_] in the key after normalization.
    """
    import re

    norm_style = re.sub(r"[^a-zA-Z0-9_]", "_", style).lower()
    return f"opt__{norm_style}_{field}"


# ---------- Pending updates machinery ----------------------------------------

# Exposed as a module attribute so tests can reference it.
_PENDING_KEY: str = "__pending_updates__"


def _deep_merge(
    dst: MutableMapping[str, Any], src: Dict[str, Any]
) -> MutableMapping[str, Any]:
    """
    Purpose:
        Recursively merge src into dst (last-write-wins on leaves).

    Inputs:
        dst, src: dict[str, Any]

    Outputs:
        The mutated dst (also returned for convenience).

    Guarantees:
        - Dict nodes are merged; non-dict leaves are overwritten by src.
        - Works in-place on dst; src is not modified.
    """
    for k, v in src.items():
        if k in dst and isinstance(dst[k], dict) and isinstance(v, dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v
    return dst


def queue_update(updates: Dict[str, Any]) -> None:
    """
    Purpose:
        Queue session_state updates for the next run (before widgets render).

    Inputs:
        updates: dict - nested update dict

    Outputs:
        None (mutates st.session_state[_PENDING_KEY])

    Guarantees:
        - Uses deep-merge so multiple calls compose (no clobbering).
    """
    pending = st.session_state.get(_PENDING_KEY)
    if pending is None:
        st.session_state[_PENDING_KEY] = dict(updates)
    else:
        _deep_merge(pending, updates)


def apply_pending_updates() -> None:
    """
    Purpose:
        Apply any queued updates. Call this BEFORE creating any widgets.

    Inputs:
        None

    Outputs:
        None (merges and clears the pending block)

    Guarantees:
        - Deep-merge into st.session_state.
        - Clears the pending block afterwards.
    """
    updates = st.session_state.pop(_PENDING_KEY, None)
    if updates:
        # st.session_state is a SessionStateProxy; cast to MutableMapping for mypy-friendly merge
        _deep_merge(cast(MutableMapping[str, Any], st.session_state), updates)


# ---------- Reset helpers (DEFERRED writes) ----------------------------------


def _schema_defaults_for_style(style: str) -> Dict[str, Any]:
    """
    Purpose:
        Build a widget-keyed defaults dict for a single style, including
        global controls (legacy-keyed) and that style's per-style controls.

    Outputs:
        Dict[str, Any] mapping widget keys -> default values (or None if absent).
    """
    updates: Dict[str, Any] = {}

    # Global defaults (driven by schema; not hard-coded).
    # IMPORTANT: Do not set a session value if there is no explicit default.
    # Many Streamlit widgets crash when value=None is pre-injected.
    _ensure_schema_globals()
    for gkey, gmeta in GLOBAL_CONTROLS.items():
        if hasattr(gmeta, "get") and "default" in gmeta:
            updates[widget_key(style, gkey)] = gmeta["default"]

    # Per-style defaults (driven by schema).
    schema = STYLE_SCHEMAS.get(style, {})
    for skey, smeta in schema.items():
        if hasattr(smeta, "get") and "default" in smeta:
            updates[widget_key(style, skey)] = smeta["default"]

    return updates


def reset_style_defaults(style: str) -> None:
    """
    Purpose:
        Queue global + per-style defaults for the given style.
        Caller should st.rerun() after calling.

    Inputs:
        style: str - style name present in STYLE_SCHEMAS

    Outputs:
        None (queues widget-keyed defaults)
    """
    queue_update(_schema_defaults_for_style(style))


def reset_style_defaults_for_all_styles() -> None:
    """
    Purpose:
        Queue defaults for all styles in STYLE_SCHEMAS (useful when you want
        initial state for every style's controls before first render).

    Outputs:
        None (queues widget-keyed defaults for each style)
    """
    batched: Dict[str, Any] = {}
    for style in STYLE_SCHEMAS.keys():
        _deep_merge(batched, _schema_defaults_for_style(style))
    queue_update(batched)


def reset_all_defaults(style: str) -> None:
    """
    Purpose:
        Queue global dimension defaults and the style's control defaults.
        Caller should st.rerun() after calling.

    Inputs:
        style: str

    Outputs:
        None (queues dimension + control defaults)

    Note:
        Dimensions are not part of STYLE_SCHEMAS/GLOBAL_CONTROLS, so we keep
        them here explicitly.
    """
    queue_update(
        {
            "H": 120.0,
            "top_od": 140.0,
            "bottom_od": 90.0,
            "t_wall": 3.0,
            "t_bottom": 3.0,
            "r_drain": 10.0,
            "expn": 1.1,
        }
    )
    reset_style_defaults(style)


def ensure_initialized(default_style: str = "HarmonicRipple") -> None:
    """
    Purpose:
        One-line initialization for Streamlit pages.

    Behavior:
        - On first run: queue dimension + schema-driven defaults for the
          provided style and mark session as initialized.
        - Every run: apply any pending updates BEFORE widgets are created.

    Recommended usage (at the very top of a page):

        from pfui.state import ensure_initialized
        ensure_initialized("HarmonicRipple")

    This prevents Streamlit from seeing widget keys with pre-set values
    after the widgets are created (which causes errors / rerun loops).
    """
    if "__ui_initialized__" not in st.session_state:
        # queue defaults once
        reset_all_defaults(default_style)
        st.session_state["__ui_initialized__"] = True
    # ensure any queued updates are applied before widgets are created
    apply_pending_updates()

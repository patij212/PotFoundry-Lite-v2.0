# pfui/state.py

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

from __future__ import annotations

import importlib
from collections.abc import Mapping, MutableMapping
from typing import Any, cast

from pfui._st import get_effective_st as get_st, StreamlitLike
from potfoundry.core.logging import logger

# Lazy-load schema constants to avoid importing pfui.schemas at module import time.
STYLE_SCHEMAS: dict = {}
GLOBAL_CONTROLS: dict = {}


def _ensure_schema_globals() -> None:
    global STYLE_SCHEMAS, GLOBAL_CONTROLS
    if not STYLE_SCHEMAS or not GLOBAL_CONTROLS:
        try:
            mod = importlib.import_module("pfui.schemas")
            STYLE_SCHEMAS.update(getattr(mod, "get_style_schemas", dict)() or {})
            GLOBAL_CONTROLS.update(
                getattr(mod, "get_global_controls", dict)() or {},
            )
        except Exception as e:
            logger.warning(f"Failed to load schema globals: {e}")
            STYLE_SCHEMAS = STYLE_SCHEMAS or {}
            GLOBAL_CONTROLS = GLOBAL_CONTROLS or {}


# ---------- Widget key helper -------------------------------------------------


def widget_key(style: str, field: str | None = None) -> str:
    """Purpose:
        Build a stable Streamlit widget key.

    Behavior:
        - Two-arg form: widget_key(style, field) -> "opt__{style}_{field}"
        - One-arg form:  widget_key(field)       -> "opt__global_{field}"

    Inputs:
        style: str  - style name (UI display label) OR field when using one-arg form
        field: Optional[str] - parameter key; if omitted, the first arg is treated as field

    Outputs:
        str - normalized widget key, safe for Streamlit.

    Guarantees:
        - Only [a-z0-9_] in the key after normalization.

    Notes:
        The one-arg form is used for global controls (e.g., "style", "model_name").
        The two-arg form remains for per-style option keys and existing tests.

    """
    import re

    if field is None:
        # Single-argument form: style param actually carries the field name
        field = style
        norm_style = "global"
    else:
        norm_style = re.sub(r"[^a-zA-Z0-9_]", "_", style).lower()
    norm_field = re.sub(r"[^a-zA-Z0-9_]", "_", field).lower()
    return f"opt__{norm_style}_{norm_field}"


# ---------- Pending updates machinery ----------------------------------------

# Exposed as a module attribute so tests can reference it.
_PENDING_KEY: str = "__pending_updates__"
_WEBGPU_CAMERA_FIELDS: dict[str, str] = {
    "rotX": "webgpu_rotX",
    "rotY": "webgpu_rotY",
    "zoom": "webgpu_zoom",
    "panX": "webgpu_panX",
    "panY": "webgpu_panY",
    "autoRotate": "webgpu_auto_rotate",
}
_WEBGPU_CAMERA_DEFAULTS: dict[str, Any] = {
    "rotX": 0.35,
    "rotY": 0.0,
    "zoom": 1.0,
    "panX": 0.0,
    "panY": 0.0,
    "autoRotate": False,
}
_WEBGPU_CAMERA_SIGNATURE_ORDER: tuple[str, ...] = (
    "autoRotate",
    "rotX",
    "rotY",
    "zoom",
    "panX",
    "panY",
    "cameraNonce",
)


def _deep_merge(
    dst: MutableMapping[str, Any], src: dict[str, Any],
) -> MutableMapping[str, Any]:
    """Purpose:
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


def queue_update(updates: dict[str, Any]) -> None:
    """Purpose:
        Queue session_state updates for the next run (before widgets render).

    Inputs:
        updates: dict - nested update dict

    Outputs:
        None (mutates st.session_state[_PENDING_KEY])

    Guarantees:
        - Uses deep-merge so multiple calls compose (no clobbering).
    """
    # Use dynamic get_st so tests that swap sys.modules['streamlit'] are effective.
    st = get_st()
    pending = get_st().session_state.get(_PENDING_KEY)
    if pending is None:
        st.session_state[_PENDING_KEY] = dict(updates)
    else:
        _deep_merge(pending, updates)


def queue_webgpu_camera_state(payload: Mapping[str, Any]) -> bool:
    """Queue camera updates and report whether auto-rotate toggled."""
    # `st` is not otherwise used; use get_st() directly when necessary.
    pending: dict[str, Any] = {}
    auto_rotate_changed = False
    for field, session_key in _WEBGPU_CAMERA_FIELDS.items():
        value = payload.get(field)
        if field == "autoRotate":
            if isinstance(value, bool):
                pending[session_key] = value
                existing = get_st().session_state.get(session_key)
                auto_rotate_changed = auto_rotate_changed or bool(existing) != value
        elif isinstance(value, (int, float)):
            pending[session_key] = float(value)
    if pending:
        # Avoid queueing redundant camera state updates; compute a signature
        # of the candidate camera snapshot and compare with the last queued
        # signature. This reduces session-state churn during continuous
        # camera movement when values are effectively unchanged.
        current_snapshot = get_webgpu_camera_snapshot(get_st().session_state)
        candidate_snapshot = dict(current_snapshot)
        for field, session_key in _WEBGPU_CAMERA_FIELDS.items():
            if session_key in pending:
                candidate_snapshot[field] = pending[session_key]
        signature = webgpu_camera_signature(candidate_snapshot)
        last_sig = get_st().session_state.get("_webgpu_last_camera_sig")
        if last_sig != signature:
            queue_update(pending)
            get_st().session_state["_webgpu_last_camera_sig"] = signature
    return auto_rotate_changed


def get_webgpu_camera_snapshot(ss: Mapping[str, Any]) -> dict[str, Any]:
    """Return the current WebGPU camera state using session defaults when unset."""
    snapshot: dict[str, Any] = {}
    for field, session_key in _WEBGPU_CAMERA_FIELDS.items():
        default_value = _WEBGPU_CAMERA_DEFAULTS.get(field, 0.0)
        raw_value = ss.get(session_key, default_value)
        if field == "autoRotate":
            snapshot[field] = bool(raw_value)
        else:
            try:
                snapshot[field] = float(raw_value)
            except Exception:
                logger.debug(f"Invalid camera value for {field}: {raw_value}, using default")
                snapshot[field] = float(default_value or 0.0)
    try:
        snapshot["cameraNonce"] = int(float(ss.get("webgpu_camera_nonce", 0) or 0))
    except Exception:
        logger.debug(f"Invalid camera nonce: {ss.get('webgpu_camera_nonce')}, defaulting to 0")
        snapshot["cameraNonce"] = 0
    return snapshot


def webgpu_camera_signature(snapshot: Mapping[str, Any]) -> tuple[Any, ...]:
    """Build a tuple signature for comparing cached WebGPU camera states."""
    return tuple(snapshot.get(field) for field in _WEBGPU_CAMERA_SIGNATURE_ORDER)


def apply_pending_updates() -> None:
    """Purpose:
        Apply any queued updates. Call this BEFORE creating any widgets.

    Inputs:
        None

    Outputs:
        None (merges and clears the pending block)

    Guarantees:
        - Deep-merge into st.session_state.
        - Clears the pending block afterwards.
    """
    # `st` unused - get_st() directly below when needed to maintain typing and dynamic module selection.
    updates = get_st().session_state.pop(_PENDING_KEY, None)
    if updates:
        # session_state is a SessionStateProxy; cast to MutableMapping for mypy-friendly merge
        _deep_merge(get_st().session_state, updates)


# ---------- Reset helpers (DEFERRED writes) ----------------------------------


def _schema_defaults_for_style(style: str) -> dict[str, Any]:
    """Purpose:
        Build a widget-keyed defaults dict for a single style, including
        global controls (legacy-keyed) and that style's per-style controls.

    Outputs:
        Dict[str, Any] mapping widget keys -> default values (or None if absent).
    """
    updates: dict[str, Any] = {}

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
    """Purpose:
        Queue global + per-style defaults for the given style.
        Caller should st.rerun() after calling.

    Inputs:
        style: str - style name present in STYLE_SCHEMAS

    Outputs:
        None (queues widget-keyed defaults)
    """
    queue_update(_schema_defaults_for_style(style))


def reset_style_defaults_for_all_styles() -> None:
    """Purpose:
        Queue defaults for all styles in STYLE_SCHEMAS (useful when you want
        initial state for every style's controls before first render).

    Outputs:
        None (queues widget-keyed defaults for each style)
    """
    batched: dict[str, Any] = {}
    _ensure_schema_globals()
    for style in STYLE_SCHEMAS:
        _deep_merge(batched, _schema_defaults_for_style(style))
    queue_update(batched)


def reset_all_defaults(style: str) -> None:
    """Purpose:
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
        },
    )
    reset_style_defaults(style)


def ensure_initialized(default_style: str = "HarmonicRipple") -> None:
    """Purpose:
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
    st = get_st()
    if "__ui_initialized__" not in st.session_state:
        # queue defaults once
        reset_all_defaults(default_style)
        st.session_state["__ui_initialized__"] = True
        # Initialize camera persistence
        st.session_state["_preview_camera"] = None
    # ensure any queued updates are applied before widgets are created
    apply_pending_updates()


# ---------- Camera persistence helpers --------------------------------------


def get_preview_camera() -> dict[str, Any] | None:
    """Purpose:
        Retrieve the persisted preview camera position.

    Returns:
        Camera dict compatible with Plotly scene.camera or None if not set.

    Example:
        >>> camera = get_preview_camera()
        >>> if camera:
        ...     fig.update_layout(scene=dict(camera=camera))

    """
    return get_st().session_state.get("_preview_camera")


def set_preview_camera(camera: dict[str, Any] | None) -> None:
    """Purpose:
        Store the current preview camera position for persistence across regenerations.

    Args:
        camera: Plotly camera dict with eye, center, up, or None to clear

    Example:
        >>> # From Plotly relayout event
        >>> set_preview_camera({
        ...     'eye': {'x': 1.5, 'y': 1.5, 'z': 1.0},
        ...     'center': {'x': 0, 'y': 0, 'z': 0},
        ...     'up': {'x': 0, 'y': 0, 'z': 1}
        ... })

    """
    get_st().session_state["_preview_camera"] = camera

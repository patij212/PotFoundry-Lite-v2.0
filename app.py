# -*- coding: utf-8 -*-
# pyright: reportGeneralTypeIssues=false
from __future__ import annotations

# File-level ruff suppression: this module intentionally performs runtime
# setup (optional imports, checks) before importing many `pfui` modules to
# avoid importing fragile or heavy modules at interpreter startup. Silencing
# E402 here keeps editor/type-checker noise low while preserving behavior.
# ruff: noqa: E402
from typing import Any, cast

import streamlit as st


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
import pfui.schemas as SC  # noqa: E402

# Prefer accessor call to reduce heavy constant binding at module scope in other modules
styles = SC.get_style_schemas()
# Deliberate delayed import of `pfui.state` to avoid importing heavy
# Streamlit/session-related modules at top-level. Documented and allowed.

from pfui import state_history as Hist
from pfui.batch_tab import render_batch_tab
from pfui.deeplink import apply_state, clear_query_params, parse_query_params
from pfui.interactive_tab import render_interactive_tab
from pfui.library_ui import render_library_tab
from pfui.state import (  # noqa: E402
    apply_pending_updates,
)
from potfoundry.integrations.supabase_client import SupabaseClient, get_singleton_client

## moved to pfui.app_components.utils: _mask_possible_secrets


def build_mesh_kwargs_for_test(Vd, Fd, ss, n_theta, n_z, fig_h):
    """Compatibility shim: expose the original helper in app.py for tests.

    This wrapper delegates to the implementation in
    `pfui.app_components.utils.build_mesh_kwargs_for_test` so callers that
    statically extract the function from `app.py` (tests) continue to work.
    """
    from pfui.app_components.utils import build_mesh_kwargs_for_test as _impl

    return _impl(Vd, Fd, ss, n_theta=n_theta, n_z=n_z, fig_h=fig_h)


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


## moved to pfui.app_components.utils: resolve_schema_key


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
    render_interactive_tab(_has_library=_has_library, _library_read_only=_library_read_only)

with _tab2:
    render_batch_tab()

# ============================================================
# Tab 3 — Public Library (if configured)
# ============================================================

if _tab3 is not None:
    with _tab3:
        render_library_tab()

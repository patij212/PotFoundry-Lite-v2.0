"""Snapshots panel extracted from app.py for modularity.

Renders the Snapshots (compare) UI and manages snapshot capture, listing,
apply/delete actions, and debug logs. Behavior is preserved from the inline
implementation in app.py.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, cast

import streamlit as st

from pfui import state_history as Hist
from pfui.app_components.utils import _mask_possible_secrets, resolve_schema_key
from pfui.preview import render_mesh_snapshot_cached
from pfui.snapshot_store import (
    cleanup_old_tempfiles,
    read_png_bytes,
    remove_png_path,
    save_png_temp,
)
from pfui.state import queue_update, widget_key


def render_snapshots(
    *,
    style_name: str,
    style_key: str,
    H: float,
    top_od: float,
    bottom_od: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    ui_opts: Dict[str, Any],
    n_theta: int,
    n_z: int,
    fig_w: float,
    fig_h: float,
    dpi: int,
    show_inner: bool,
    place_on_ground: bool,
    view_elev: float,
    view_azim: float,
) -> None:
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

        def log_debug(message: str) -> None:
            ss.setdefault("_debug_logs", []).append(message)

        try:
            # Delegate snapshot rendering to central cached function which
            # builds the actual triangulated mesh and tries Plotly first.
            import json

            opts_json = json.dumps(dict(ui_opts))
            capture_bytes = render_mesh_snapshot_cached(
                H,
                top_od * 0.5,
                bottom_od * 0.5,
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
                theme=("dark" if st.get_option("theme.base") == "dark" else "light"),
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
        import math

        per_page = 3
        page = int(cast(Any, ss.get("_snap_page", 0)) or 0)
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
                    png_bytes_local, caption=f"{i + 1}. {s['name']}", width="stretch"
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
                    "style": s.get("style_ui", style_name),  # update visible selectbox
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
                new_snaps2 = snaps[:i] + snaps[i + 1 :]
                ss["_snaps"] = new_snaps2
                ss.setdefault("_debug_logs", []).append(f"Deleted snapshot {i + 1}.")
                ss["_suppress_preview_once"] = True


__all__ = ["render_snapshots"]

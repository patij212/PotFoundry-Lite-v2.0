# pfui/snapshots.py
from __future__ import annotations
from typing import Any, Dict, List
import streamlit as st
from .state import widget_key
from .snapshot_store import save_png_temp, read_png_bytes, remove_png_path


def render_snapshots(png_bytes: bytes | None, style_name: str,
                     H: float, top_od: float, bottom_od: float,
                     t_wall: float, t_bottom: float, r_drain: float,
                     expn: float, opts: Dict[str, Any]) -> None:
    snaps: List[Dict[str, Any]] = st.session_state.get("_snaps", [])
    sc1, sc2, sc3 = st.columns([1, 1, 2])
    snap_name = sc1.text_input("Snapshot name", value=f"{style_name}_H{int(H)}")
    if sc2.button("Capture"):
        png_target = None
        if png_bytes:
            st.write("Debug: png_bytes is available, attempting to save.")
            try:
                png_target = save_png_temp(png_bytes)
            except Exception as e:
                st.write(f"Debug: Failed to save PNG temp file: {e}")
                png_target = None
        else:
            st.write("Debug: png_bytes is None, cannot save snapshot.")

        snap = {
            "name": snap_name,
            "png": png_target,
            "style": style_name,
            "params": {
                "H": H, "top_od": top_od, "bottom_od": bottom_od,
                "t_wall": t_wall, "t_bottom": t_bottom, "r_drain": r_drain,
                "expn": expn, "opts": opts,
            },
        }
        snaps.append(snap)
        st.session_state["_snaps"] = snaps[-6:]
        st.rerun()

    if snaps:
        for i, s in enumerate(snaps):
            st.markdown(f"**{i+1}. {s['name']}**")
            cc1, cc2, cc3 = st.columns([1, 1, 2])
            png_bytes_local = read_png_bytes(s.get("png"))
            if png_bytes_local:
                # replace deprecated use_column_width with use_container_width
                cc1.image(png_bytes_local, caption="preview", use_container_width=True)
            if cc2.button("Apply", key=f"apply_{i}"):
                st.session_state.update({
                    "H": s["params"]["H"],
                    "top_od": s["params"]["top_od"],
                    "bottom_od": s["params"]["bottom_od"],
                    "t_wall": s["params"]["t_wall"],
                    "t_bottom": s["params"]["t_bottom"],
                    "r_drain": s["params"]["r_drain"],
                    "expn": s["params"]["expn"],
                    "style": s["style"],
                })
                for k, v in s["params"]["opts"].items():
                    st.session_state[widget_key(s["style"], k)] = v
                st.rerun()
            if cc3.button("Delete", key=f"del_{i}"):
                # remove temp file if we created one
                try:
                    remove_png_path(s.get("png"))
                except Exception:
                    pass
                del snaps[i]
                st.session_state["_snaps"] = snaps
                st.rerun()

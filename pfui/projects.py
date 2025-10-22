# pfui/projects.py
from __future__ import annotations
import json
import streamlit as st
from typing import Any, Dict
from .state import widget_key

APP_KEY = "PotFoundry Pro v2"


def collect_project(
    style: str, size: Dict[str, float], opts: Dict[str, Any], preview: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "app": APP_KEY,
        "style": style,
        "size": size,
        "opts": opts,
        "preview": preview,
        "schema": 1,
    }


def apply_project(project: Dict[str, Any]) -> None:
    if not isinstance(project, dict) or project.get("app") != APP_KEY:
        raise ValueError("Not a PotFoundry project file")
    style = str(project.get("style", ""))
    if style:
        st.session_state["style"] = style
    size = project.get("size", {}) or {}
    for k, v in size.items():
        st.session_state[k] = v
    opts = project.get("opts", {}) or {}
    for k, v in opts.items():
        if style:
            st.session_state[widget_key(style, k)] = v
    prev = project.get("preview", {}) or {}
    st.session_state["_view_elev"] = float(prev.get("view_elev", 20.0))
    st.session_state["_view_azim"] = float(prev.get("view_azim", -60.0))
    st.session_state["_n_theta"] = int(prev.get("n_theta", 180))
    st.session_state["_n_z"] = int(prev.get("n_z", 90))


def render_project_io(
    style_name: str,
    size: Dict[str, float],
    opts: Dict[str, Any],
    n_theta: int,
    n_z: int,
    view_elev: float,
    view_azim: float,
) -> None:
    import json as _json

    with st.expander("Project — save / load"):
        left, right = st.columns(2)
        if left.button("Download project (.pfproj)"):
            project = collect_project(
                style_name,
                size,
                opts,
                {
                    "n_theta": n_theta,
                    "n_z": n_z,
                    "view_elev": view_elev,
                    "view_azim": view_azim,
                },
            )
            data = _json.dumps(project, indent=2).encode("utf-8")
            st.download_button(
                "Save .pfproj",
                data=data,
                file_name=f"{style_name}_H{int(size.get('height', 0))}.pfproj",
                mime="application/json",
            )
        up = right.file_uploader("Load .pfproj", type=["pfproj", "json"])
        if up is not None:
            try:
                project = json.loads(up.read().decode("utf-8"))
                apply_project(project)
                st.success("Project loaded. Re-rendering…")
                st.rerun()
            except Exception as e:
                st.error(f"Failed to load project: {e}")

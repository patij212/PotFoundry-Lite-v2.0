"""Export functionality module for Interactive Designer tab.

Handles STL export, library publishing, and deep link generation.
"""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, cast

import streamlit as st

from pfui.deeplink import generate_deep_link
from pfui.imports import WRITE_STL_BINARY, build_pot_mesh
from potfoundry.types import StyleOpts


def _mask_possible_secrets(text: str) -> str:
    """Mask sensitive information in text.
    
    Masks Supabase service keys, JWT tokens, and long hex hashes.
    
    Args:
        text: Text that may contain sensitive information
        
    Returns:
        Text with sensitive information masked
    """
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


def _get_git_commit() -> Optional[str]:
    """Get current git commit hash.
    
    Returns:
        Short git commit hash, or None if not available
    """
    try:
        git_commit = (
            subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=Path(__file__).parent,
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
        return git_commit
    except Exception:
        return None


def _get_base_url() -> str:
    """Get base URL for deep links.
    
    Returns:
        Base URL from secrets, environment, or localhost default
    """
    # Preference: root app_url (secrets) -> nested app_url -> APP_URL env -> localhost default
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
        base_url = os.environ.get("APP_URL")
    if not base_url:
        base_url = "http://localhost:8501"
    return base_url


def render_library_publish_controls(
    _has_library: bool,
    _library_read_only: bool,
    style_name: str,
) -> tuple[bool, str, list[str], str, bool]:
    """Render library publishing controls.
    
    Args:
        _has_library: Whether library is configured
        _library_read_only: Whether library is in read-only mode
        style_name: Name of the current style
        
    Returns:
        Tuple of (publish_enabled, publish_title, publish_tags, publish_license, license_consent)
    """
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

    return publish_enabled, publish_title, publish_tags, publish_license, license_consent


def handle_standalone_publish(
    _has_library: bool,
    publish_enabled: bool,
    license_consent: bool,
    publish_title: str,
    publish_license: str,
    publish_tags: list[str],
    style_name: str,
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Any,
    opts: StyleOpts,
    name: str,
    top_od: float,
    bottom_od: float,
) -> None:
    """Handle standalone publish action (without export).
    
    Args:
        _has_library: Whether library is configured
        publish_enabled: Whether publishing is enabled
        license_consent: Whether user consented to license
        publish_title: Title for published design
        publish_license: License for published design
        publish_tags: Tags for published design
        style_name: Name of the current style
        H: Total height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        t_wall: Wall thickness in mm
        t_bottom: Bottom thickness in mm
        r_drain: Drain radius in mm
        expn: Expansion exponent
        n_theta: Angular resolution
        n_z: Vertical resolution
        r_outer_fn: Outer radius style function
        opts: Style options
        name: Design name
        top_od: Top outer diameter
        bottom_od: Bottom outer diameter
    """
    ss = cast(dict[str, Any], st.session_state)
    if not cast(Any, ss.get("_publish_clicked")):
        return

    # Narrow publish fields once for the publish flow
    title_safe: str = str(publish_title or "")
    license_safe: str = str(publish_license or "CC BY-NC 4.0")
    tags_safe: list[str] = list(publish_tags or [])
    
    try:
        # Build mesh at export resolution (reuse upscale), else fall back to current n_theta/n_z
        up_scale = (
            float(ss.get("_export_upscale", 1.0))
            if "_export_upscale" in ss
            else 1.0
        )
        n_theta_pub = int(n_theta * up_scale)
        n_z_pub = int(n_z * up_scale)
        
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
            git_commit = _get_git_commit()

            with st.spinner("Publishing to library..."):
                result = publish_design(
                    stl_bytes=data,
                    style=style_name,
                    size=size_dict,
                    opts=dict(opts),
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


def handle_export(
    do_export: bool,
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta_export: int,
    n_z_export: int,
    r_outer_fn: Any,
    opts: StyleOpts,
    name: str,
    publish_enabled: bool,
    license_consent: bool,
    _has_library: bool,
    publish_title: str,
    publish_license: str,
    publish_tags: list[str],
    style_name: str,
    top_od: float,
    bottom_od: float,
) -> None:
    """Handle STL export and optional library publishing.
    
    Args:
        do_export: Whether to perform export
        H: Total height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        t_wall: Wall thickness in mm
        t_bottom: Bottom thickness in mm
        r_drain: Drain radius in mm
        expn: Expansion exponent
        n_theta_export: Angular resolution for export
        n_z_export: Vertical resolution for export
        r_outer_fn: Outer radius style function
        opts: Style options
        name: Design name
        publish_enabled: Whether publishing is enabled
        license_consent: Whether user consented to license
        _has_library: Whether library is configured
        publish_title: Title for published design
        publish_license: License for published design
        publish_tags: Tags for published design
        style_name: Name of the current style
        top_od: Top outer diameter
        bottom_od: Bottom outer diameter
    """
    if not do_export:
        return

    try:
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
                git_commit = _get_git_commit()

                # Publish
                with st.spinner("Publishing to library..."):
                    result = publish_design(
                        stl_bytes=data,
                        style=style_name,
                        size=size_dict,
                        opts=dict(opts),
                        mesh=mesh_dict,
                        diagnostics=diagnostics_dict,
                        license=publish_license,
                        title=publish_title,
                        tags=publish_tags,
                        app_commit=git_commit or "",
                    )

                if result.duplicate:
                    st.info(f"✓ Design already published (ID: {result.id[:8]}...)")
                else:
                    st.success(f"✓ Published! ID: {result.id[:8]}...")

                # Show library link
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
                base_url = _get_base_url()
                deep_link = generate_deep_link(state_to_encode, base_url)

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


def render_export_section(
    _has_library: bool,
    _library_read_only: bool,
    style_name: str,
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Any,
    opts: StyleOpts,
    name: str,
    top_od: float,
    bottom_od: float,
    do_export: bool,
    n_theta_export: int,
    n_z_export: int,
) -> None:
    """Render complete export section.
    
    Handles STL export, library publishing controls, and deep link generation.
    
    Args:
        _has_library: Whether library is configured
        _library_read_only: Whether library is in read-only mode
        style_name: Name of the current style
        H: Total height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        t_wall: Wall thickness in mm
        t_bottom: Bottom thickness in mm
        r_drain: Drain radius in mm
        expn: Expansion exponent
        n_theta: Angular resolution
        n_z: Vertical resolution
        r_outer_fn: Outer radius style function
        opts: Style options
        name: Design name
        top_od: Top outer diameter
        bottom_od: Bottom outer diameter
        do_export: Whether to perform export
        n_theta_export: Angular resolution for export
        n_z_export: Vertical resolution for export
    """
    st.subheader("Export STL")

    ss = cast(dict[str, Any], st.session_state)

    # Export trigger button (sets a session flag so the rest of the
    # export pipeline can run in the same rerun). This mirrors previous
    # behavior where an Export button kicked the export flow.
    try:
        if st.button("Export STL", key="_export_button"):
            ss["_do_export"] = True
    except Exception:
        ss["_do_export"] = bool(ss.get("_do_export", False))

    # Library publish controls
    publish_enabled, publish_title, publish_tags, publish_license, license_consent = (
        render_library_publish_controls(_has_library, _library_read_only, style_name)
    )

    # Handle standalone publish
    handle_standalone_publish(
        _has_library=_has_library,
        publish_enabled=publish_enabled,
        license_consent=license_consent,
        publish_title=publish_title,
        publish_license=publish_license,
        publish_tags=publish_tags,
        style_name=style_name,
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=t_bottom,
        r_drain=r_drain,
        expn=expn,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=r_outer_fn,
        opts=opts,
        name=name,
        top_od=top_od,
        bottom_od=bottom_od,
    )

    # Handle export
    handle_export(
        do_export=do_export,
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=t_bottom,
        r_drain=r_drain,
        expn=expn,
        n_theta_export=n_theta_export,
        n_z_export=n_z_export,
        r_outer_fn=r_outer_fn,
        opts=opts,
        name=name,
        publish_enabled=publish_enabled,
        license_consent=license_consent,
        _has_library=_has_library,
        publish_title=publish_title,
        publish_license=publish_license,
        publish_tags=publish_tags,
        style_name=style_name,
        top_od=top_od,
        bottom_od=bottom_od,
    )

    # Clear one-shot export flag to avoid repeating export on subsequent reruns
    try:
        if ss.get("_do_export"):
            ss["_do_export"] = False
    except Exception:
        pass

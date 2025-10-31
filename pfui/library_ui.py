"""Library UI tab for browsing and opening published designs."""

from __future__ import annotations

from typing import Any

# Pre-declare `st` so mypy knows it's available and can be annotated as Any when
# streamlit isn't installed. This avoids using `# type: ignore` and keeps runtime
# behavior unchanged.
st: Any = None
HAS_STREAMLIT = False

try:
    import streamlit as st

    HAS_STREAMLIT = True
except ImportError:
    HAS_STREAMLIT = False


def render_library_tab():
    """Render the Public Library browse tab."""
    if not HAS_STREAMLIT or st is None:
        return

    # Local imports (lazy) to avoid heavy import-time dependencies and satisfy ruff
    from potfoundry.integrations.supabase_client import (
        SupabaseClient,
        get_singleton_client,
    )
    from potfoundry.library import list_published

    # Check if library is configured
    client = get_singleton_client()
    if not client.is_configured():
        st.info(
            "📚 Public Library is not configured. "
            "To enable, add Supabase credentials to `.streamlit/secrets.toml`. "
            "See `.streamlit/secrets.template.toml` for details."
        )
        return

    # Inform about read-only mode
    try:
        if isinstance(client, SupabaseClient) and getattr(client, "read_only", False):
            st.warning(
                "Public Library is in read-only mode (anon key). Publishing is disabled on this device."
            )
    except Exception:
        pass

    st.header("Public Library")
    st.markdown(
        "Browse designs published by the community. Download STL files or open them in the editor."
    )
    # Info: show connected Supabase project (host) and access mode for clarity
    try:
        from urllib.parse import urlparse

        host = urlparse(getattr(client, "config").url).netloc.split(".")[0]
        mode = "read-only" if getattr(client, "read_only", False) else "service"
        st.caption(f"Connected to Supabase project: {host} ({mode})")
    except Exception:
        pass

    # Filters
    col1, col2, col3, col4, col5, col6 = st.columns([2, 2, 2, 1, 1, 2])

    with col1:
        search_query = st.text_input(
            "Search", placeholder="Search by title...", label_visibility="collapsed"
        )

    with col2:
        from pfui.imports import STYLES

        style_options = ["All"] + sorted(STYLES.keys())
        style_filter = st.selectbox(
            "Style", style_options, index=0, label_visibility="collapsed"
        )

    with col3:
        tags_input = st.text_input(
            "Tags",
            placeholder="Filter by tags (comma-separated)",
            label_visibility="collapsed",
        )

    with col4:
        sort_options = ["Newest", "Oldest", "Title A-Z"]
        sort_choice = st.selectbox(
            "Sort", sort_options, index=0, label_visibility="collapsed"
        )

    with col5:
        if st.button("↻ Refresh"):
            st.session_state["_library_refresh"] = (
                st.session_state.get("_library_refresh", 0) + 1
            )
            st.rerun()

    with col6:
        auto = st.toggle(
            "Auto-refresh 30s", value=st.session_state.get("_library_auto", False)
        )
        st.session_state["_library_auto"] = auto
        if auto:
            # Lightweight JS-based refresh every 30s
            st.markdown(
                """
                <script>
                if (!window._pf_lib_autorefresh) {
                  window._pf_lib_autorefresh = setInterval(() => { window.location.reload(); }, 30000);
                }
                </script>
                """,
                unsafe_allow_html=True,
            )

    # Parse filters
    style = None if style_filter == "All" else style_filter
    tags = (
        [t.strip() for t in tags_input.split(",") if t.strip()] if tags_input else None
    )
    search = search_query if search_query else None

    # Parse sort
    if sort_choice == "Newest":
        order_by, order_desc = "created_at", True
    elif sort_choice == "Oldest":
        order_by, order_desc = "created_at", False
    else:  # Title A-Z
        order_by, order_desc = "title", False

    # Pagination
    page_size = 24
    if "_library_page" not in st.session_state:
        st.session_state["_library_page"] = 0

    page = st.session_state["_library_page"]
    offset = page * page_size

    # Fetch results
    with st.spinner("Loading designs..."):
        results, has_next = list_published(
            style=style,
            tags=tags,
            search_query=search,
            order_by=order_by,
            order_desc=order_desc,
            offset=offset,
            limit=page_size,
            refresh_counter=st.session_state.get("_library_refresh", 0),
        )

    # Display results
    if not results:
        st.info(
            "No designs found. Try adjusting your filters or publish the first one!"
        )
        return

    # Grid layout (4 columns)
    cols_per_row = 4
    for i in range(0, len(results), cols_per_row):
        cols = st.columns(cols_per_row)
        for j, col in enumerate(cols):
            idx = i + j
            if idx >= len(results):
                break

            design = results[idx]
            with col:
                render_library_card(design)

    # Pagination controls
    st.markdown("---")
    pcol1, pcol2, pcol3 = st.columns([1, 2, 1])

    with pcol1:
        if page > 0:
            if st.button("← Previous"):
                st.session_state["_library_page"] = page - 1
                st.rerun()

    with pcol2:
        st.markdown(
            f"<div style='text-align: center'>Page {page + 1}</div>",
            unsafe_allow_html=True,
        )

    with pcol3:
        if has_next:
            if st.button("Next →"):
                st.session_state["_library_page"] = page + 1
                st.rerun()

    # Prefetch next page thumbnails (best-effort, tiny timeout)
    if has_next:
        try:
            import requests

            next_results, _ = list_published(
                style=style,
                tags=tags,
                search_query=search,
                order_by=order_by,
                order_desc=order_desc,
                offset=offset + page_size,
                limit=min(8, page_size),
                refresh_counter=st.session_state.get("_library_refresh", 0),
            )
            for d in next_results:
                u = d.get("thumb_url")
                if isinstance(u, str) and u:
                    try:
                        requests.get(u, timeout=2)
                    except Exception:
                        pass
        except Exception:
            pass


def render_library_card(design: dict):
    """Render a single library design card.

    Args:
        design: Design record from database
    """
    if not HAS_STREAMLIT or st is None:
        return

    # Thumbnail / animated preview (APNG if available). If unavailable, render a local preview as fallback.
    shown = False
    url = str(design.get("thumb_url") or "")
    if url:
        try:
            st.image(url, width="stretch")
            shown = True
        except Exception:
            shown = False
    if not shown:
        try:
            from pfui.preview import render_preview_png_cached

            style_name = str(design.get("style") or "")
            size = design.get("size", {}) or {}
            mesh = design.get("mesh", {}) or {}
            H = float(size.get("height", 120.0))
            Rt = float(size.get("top_od", 140.0)) / 2.0
            Rb = float(size.get("bottom_od", 90.0)) / 2.0
            expn = float(size.get("flare_exp", 1.1))
            n_theta = int(mesh.get("n_theta", 144))
            n_z = int(mesh.get("n_z", 64))
            import json as _json

            try:
                ak = "|".join(
                    str(st.session_state.get(k, ""))
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
            except Exception:
                ak = ""
            png = render_preview_png_cached(
                H,
                Rt,
                Rb,
                expn,
                n_theta,
                n_z,
                style_name,
                _json.dumps(design.get("opts", {}) or {}),
                4.0,
                4.0,
                120,
                theme="dark",
                show_floor=False,
                appearance_key=ak,
            )
            if png:
                st.image(png, width="stretch")
                shown = True
        except Exception:
            shown = False
    if not shown:
        st.markdown("_No preview available_")
        # Thumbnail: generate local preview for parity with snapshots (faster, consistent)
        try:
            from pfui.preview import render_preview_png_cached

            style_name = str(design.get("style") or "")
            size = design.get("size", {}) or {}
            mesh = design.get("mesh", {}) or {}
            H = float(size.get("height", 120.0))
            Rt = float(size.get("top_od", 140.0)) / 2.0
            Rb = float(size.get("bottom_od", 90.0)) / 2.0
            expn = float(size.get("flare_exp", 1.1))
            n_theta = int(mesh.get("n_theta", 144))
            n_z = int(mesh.get("n_z", 64))
            import json as _json

            try:
                ak = "|".join(
                    str(st.session_state.get(k, ""))
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
            except Exception:
                ak = ""
            png = render_preview_png_cached(
                H,
                Rt,
                Rb,
                expn,
                n_theta,
                n_z,
                style_name,
                _json.dumps(design.get("opts", {}) or {}),
                4.0,
                4.0,
                120,
                theme="dark",
                show_floor=False,
                appearance_key=ak,
            )
            if png:
                st.image(png, width="stretch")
            else:
                raise RuntimeError("no png")
        except Exception:
            # As a last resort, show remote thumbnail if present
            url = str(design.get("thumb_url") or "")
            if url:
                st.image(url, width="stretch")
            else:
                st.markdown("_No preview available_")

    # Title
    st.markdown(f"**{design['title']}**")

    # Style
    st.caption(f"Style: {design['style']}")

    # Tags
    if design.get("tags"):
        tags_str = " ".join([f"`{tag}`" for tag in design["tags"][:5]])
        st.markdown(tags_str)

    # License badge
    license_color = {
        "CC BY-NC 4.0": "orange",
        "CC BY 4.0": "blue",
        "CC BY-SA 4.0": "blue",
        "CC0 1.0": "green",
        "MIT": "green",
        "Apache 2.0": "green",
    }.get(design.get("license", ""), "gray")

    st.markdown(
        f"<span style='color: {license_color}; font-size: 0.8em'>📄 {design.get('license', 'Unknown')}</span>",
        unsafe_allow_html=True,
    )

    # Actions
    col1, col2 = st.columns(2)

    with col1:
        # Prefer a direct link to avoid eager downloading large STL files per card
        try:
            st.link_button("Download", url=design["stl_url"], width="stretch")
        except Exception:
            st.markdown(f"[Download]({design['stl_url']})", unsafe_allow_html=True)

    with col2:
        # Open in editor button (deep link)
        if st.button("Open", key=f"open_{design['id']}"):
            open_design_in_editor(design)


def open_design_in_editor(design: dict):
    """Open design in editor by applying its state.

    Args:
        design: Design record from database
    """
    if not HAS_STREAMLIT or st is None:
        return

    from pfui.deeplink import apply_state
    # Local import for consistency (deep link helpers are light-weight)

    # Extract state from design
    state_to_apply = {
        "style": design["style"],
    }

    # Add size parameters
    size = design.get("size", {})
    if "height" in size:
        state_to_apply["H"] = size["height"]
    if "top_od" in size:
        state_to_apply["top_od"] = size["top_od"]
    if "bottom_od" in size:
        state_to_apply["bottom_od"] = size["bottom_od"]
    if "wall_thickness" in size:
        state_to_apply["t_wall"] = size["wall_thickness"]
    if "bottom_thickness" in size:
        state_to_apply["t_bottom"] = size["bottom_thickness"]
    if "drain_radius" in size:
        state_to_apply["r_drain"] = size["drain_radius"]
    if "flare_exp" in size:
        state_to_apply["expn"] = size["flare_exp"]

    # Add opts
    if "opts" in design:
        state_to_apply["opts"] = design["opts"]

    # Apply state
    apply_state(state_to_apply, quiet=False)

    st.success(f"Loaded design: {design['title']}")
    st.rerun()

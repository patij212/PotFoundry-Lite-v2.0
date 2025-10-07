"""Library UI tab for browsing and opening published designs."""
from __future__ import annotations

from typing import Optional

try:
    import streamlit as st
    HAS_STREAMLIT = True
except ImportError:
    HAS_STREAMLIT = False
    st = None  # type: ignore

from potfoundry.library import list_published
from potfoundry.integrations.supabase_client import get_singleton_client
from pfui.deeplink import generate_deep_link


def render_library_tab():
    """Render the Public Library browse tab."""
    if not HAS_STREAMLIT or st is None:
        return
    
    # Check if library is configured
    client = get_singleton_client()
    if not client.is_configured():
        st.info(
            "📚 Public Library is not configured. "
            "To enable, add Supabase credentials to `.streamlit/secrets.toml`. "
            "See `.streamlit/secrets-example.toml` for details."
        )
        return
    
    st.header("Public Library")
    st.markdown("Browse designs published by the community. Download STL files or open them in the editor.")
    
    # Filters
    col1, col2, col3, col4 = st.columns([2, 2, 2, 1])
    
    with col1:
        search_query = st.text_input("Search", placeholder="Search by title...", label_visibility="collapsed")
    
    with col2:
        from pfui.imports import STYLES
        style_options = ["All"] + sorted(STYLES.keys())
        style_filter = st.selectbox("Style", style_options, index=0, label_visibility="collapsed")
    
    with col3:
        tags_input = st.text_input("Tags", placeholder="Filter by tags (comma-separated)", label_visibility="collapsed")
    
    with col4:
        sort_options = ["Newest", "Oldest", "Title A-Z"]
        sort_choice = st.selectbox("Sort", sort_options, index=0, label_visibility="collapsed")
    
    # Parse filters
    style = None if style_filter == "All" else style_filter
    tags = [t.strip() for t in tags_input.split(",") if t.strip()] if tags_input else None
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
            limit=page_size
        )
    
    # Display results
    if not results:
        st.info("No designs found. Try adjusting your filters or publish the first one!")
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
        st.markdown(f"<div style='text-align: center'>Page {page + 1}</div>", unsafe_allow_html=True)
    
    with pcol3:
        if has_next:
            if st.button("Next →"):
                st.session_state["_library_page"] = page + 1
                st.rerun()


def render_library_card(design: dict):
    """Render a single library design card.
    
    Args:
        design: Design record from database
    """
    if not HAS_STREAMLIT or st is None:
        return
    
    # Thumbnail
    try:
        st.image(design["thumb_url"], use_container_width=True)
    except Exception:
        st.markdown("_No thumbnail_")
    
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
        unsafe_allow_html=True
    )
    
    # Actions
    col1, col2 = st.columns(2)
    
    with col1:
        # Download STL button
        try:
            import requests
            stl_data = requests.get(design["stl_url"], timeout=10).content
            st.download_button(
                "Download",
                data=stl_data,
                file_name=f"{design['id'][:8]}.stl",
                mime="application/octet-stream",
                use_container_width=True,
                key=f"dl_{design['id']}"
            )
        except Exception as e:
            st.button("Download", disabled=True, use_container_width=True, key=f"dl_err_{design['id']}")
    
    with col2:
        # Open in editor button (deep link)
        if st.button("Open", use_container_width=True, key=f"open_{design['id']}"):
            open_design_in_editor(design)


def open_design_in_editor(design: dict):
    """Open design in editor by applying its state.
    
    Args:
        design: Design record from database
    """
    if not HAS_STREAMLIT or st is None:
        return
    
    from pfui.deeplink import apply_state
    
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

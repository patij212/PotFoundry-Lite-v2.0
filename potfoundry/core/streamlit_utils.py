"""Streamlit-specific optimization utilities for PotFoundry.

This module provides utilities to optimize PotFoundry's performance within
Streamlit applications, including progressive rendering and caching decorators.

These utilities are optional and only needed when using PotFoundry with Streamlit.
The core potfoundry library remains UI-agnostic.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np
import numpy.typing as npt

__all__ = [
    "progressive_mesh_preview",
    "create_streamlit_cache_decorator",
    "get_preview_resolution",
    "get_export_resolution",
]


def get_preview_resolution(base_theta: int = 168, base_z: int = 84) -> Tuple[int, int]:
    """Get optimized resolution for fast preview rendering.
    
    Returns a lower resolution suitable for interactive preview that renders
    quickly while still showing the overall pot shape and style.
    
    Args:
        base_theta: Base angular resolution (default: 168)
        base_z: Base vertical resolution (default: 84)
        
    Returns:
        Tuple of (n_theta, n_z) for preview rendering
        
    Note:
        Preview resolution is 1/3 of export resolution for ~10x faster rendering.
        This still produces ~6k triangles, enough for smooth preview.
    """
    # Use 1/3 resolution for preview (10x fewer faces, 10x faster)
    preview_theta = max(56, base_theta // 3)  # Minimum 56 for smooth circles
    preview_z = max(28, base_z // 3)          # Minimum 28 for smooth curves
    return preview_theta, preview_z


def get_export_resolution(quality: str = "standard") -> Tuple[int, int]:
    """Get resolution for STL export based on quality setting.
    
    Args:
        quality: One of "draft", "standard", "high", "ultra"
            - draft: Fast generation, good for testing (~14k triangles)
            - standard: Default quality, good for most prints (~58k triangles)
            - high: High detail for large prints (~230k triangles)
            - ultra: Maximum detail for showcase pieces (~900k triangles)
            
    Returns:
        Tuple of (n_theta, n_z) for export
        
    Raises:
        ValueError: If quality is not recognized
    """
    resolutions = {
        "draft": (84, 42),      # ~14k triangles, ~10ms generation
        "standard": (168, 84),  # ~58k triangles, ~20ms generation (default)
        "high": (336, 168),     # ~230k triangles, ~80ms generation
        "ultra": (672, 336),    # ~900k triangles, ~300ms generation
    }
    
    if quality not in resolutions:
        raise ValueError(
            f"Unknown quality '{quality}'. "
            f"Valid options: {', '.join(resolutions.keys())}"
        )
    
    return resolutions[quality]


def progressive_mesh_preview(
    build_fn: Callable,
    params: Dict[str, Any],
    preview_first: bool = True,
) -> Tuple[npt.NDArray, npt.NDArray, Dict[str, Any], Optional[Tuple]]:
    """Generate mesh with progressive rendering support.
    
    First generates a low-resolution preview mesh quickly, then optionally
    upgrades to full resolution. This provides immediate feedback to the user
    while computing the final mesh in the background.
    
    Args:
        build_fn: Mesh building function (e.g., build_pot_mesh)
        params: Dictionary of parameters to pass to build_fn
        preview_first: If True, generate preview resolution first
        
    Returns:
        Tuple of (vertices, faces, diagnostics, preview_data)
        - If preview_first=True, returns low-res mesh and None for preview_data
        - If preview_first=False, returns full-res mesh and preview as preview_data
        
    Example:
        >>> # Progressive rendering pattern
        >>> preview_params = {**params, 'n_theta': 56, 'n_z': 28}
        >>> verts_preview, faces_preview, diag, _ = progressive_mesh_preview(
        ...     build_pot_mesh, preview_params, preview_first=True
        ... )
        >>> # Show preview to user immediately
        >>> display_preview(verts_preview, faces_preview)
        >>> 
        >>> # Generate full resolution
        >>> verts_full, faces_full, diag, _ = progressive_mesh_preview(
        ...     build_pot_mesh, params, preview_first=False
        ... )
    """
    if preview_first:
        # Get preview resolution from params or use defaults
        n_theta = params.get('n_theta', 168)
        n_z = params.get('n_z', 84)
        preview_theta, preview_z = get_preview_resolution(n_theta, n_z)
        
        # Override resolution for preview
        preview_params = {**params, 'n_theta': preview_theta, 'n_z': preview_z}
        verts, faces, diag = build_fn(**preview_params)
        return verts, faces, diag, None
    else:
        # Generate full resolution
        verts, faces, diag = build_fn(**params)
        return verts, faces, diag, None


def create_streamlit_cache_decorator(ttl: int = 3600, max_entries: int = 8):
    """Create a Streamlit cache decorator for mesh generation.
    
    Creates a configured @st.cache_data decorator optimized for mesh generation.
    This should be applied to wrapper functions that call build_pot_mesh.
    
    Args:
        ttl: Time-to-live in seconds (default: 3600 = 1 hour)
        max_entries: Maximum number of cached results (default: 8)
        
    Returns:
        Decorator function that can be applied to mesh generation functions
        
    Example:
        >>> import streamlit as st
        >>> 
        >>> # Create cached wrapper
        >>> @create_streamlit_cache_decorator(ttl=3600)
        ... def cached_build_pot(H, Rt, Rb, style_name, **style_opts):
        ...     style_fn = STYLES[style_name][0]
        ...     return build_pot_mesh(
        ...         H=H, Rt=Rt, Rb=Rb, r_outer_fn=style_fn,
        ...         style_opts=style_opts, ...
        ...     )
        >>> 
        >>> # Use in Streamlit app
        >>> verts, faces, diag = cached_build_pot(
        ...     H=st.session_state.height,
        ...     Rt=st.session_state.top_radius,
        ...     ...
        ... )
        
    Note:
        This function requires Streamlit to be installed. It returns a no-op
        decorator if Streamlit is not available.
    """
    try:
        import streamlit as st
        
        # Create the decorator with specified settings
        return st.cache_data(
            ttl=ttl,
            max_entries=max_entries,
            show_spinner=False,  # Don't show default spinner
        )
    except ImportError:
        # Streamlit not installed - return identity decorator
        def identity_decorator(func):
            return func
        return identity_decorator


# Example integration code for Streamlit apps
STREAMLIT_INTEGRATION_EXAMPLE = """
# Example: Integrating PotFoundry optimizations in Streamlit

import streamlit as st
from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.streamlit_utils import (
    progressive_mesh_preview,
    create_streamlit_cache_decorator,
    get_preview_resolution,
    get_export_resolution,
)

# Create cached mesh builder
@create_streamlit_cache_decorator(ttl=3600, max_entries=8)
def build_pot_cached(H, Rt, Rb, t_wall, t_bottom, r_drain, 
                     expn, n_theta, n_z, style_name, **style_opts):
    '''Cached mesh generation for instant results on repeated parameters.'''
    style_fn = STYLES[style_name][0]
    return build_pot_mesh(
        H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
        expn=expn, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn,
        style_opts=style_opts
    )

# Progressive rendering approach
def render_pot_preview():
    '''Show fast preview first, then upgrade to full resolution.'''
    
    # Get preview resolution (fast)
    preview_theta, preview_z = get_preview_resolution()
    
    # Generate and show preview immediately
    with st.spinner('Generating preview...'):
        verts, faces, diag = build_pot_cached(
            H=st.session_state.height,
            Rt=st.session_state.top_radius,
            Rb=st.session_state.bottom_radius,
            t_wall=st.session_state.wall_thickness,
            t_bottom=st.session_state.bottom_thickness,
            r_drain=st.session_state.drain_radius,
            expn=st.session_state.flare,
            n_theta=preview_theta,  # Low resolution
            n_z=preview_z,
            style_name=st.session_state.style,
            **st.session_state.style_opts
        )
    
    # Display preview (renders in ~50ms for 6k triangles)
    st.plotly_chart(create_3d_plot(verts, faces), use_container_width=True)
    
    # Add export button with full resolution
    if st.button('Export High-Res STL'):
        export_theta, export_z = get_export_resolution('standard')
        
        with st.spinner('Generating high-resolution mesh for export...'):
            verts, faces, diag = build_pot_cached(
                H=st.session_state.height,
                Rt=st.session_state.top_radius,
                Rb=st.session_state.bottom_radius,
                t_wall=st.session_state.wall_thickness,
                t_bottom=st.session_state.bottom_thickness,
                r_drain=st.session_state.drain_radius,
                expn=st.session_state.flare,
                n_theta=export_theta,  # Full resolution
                n_z=export_z,
                style_name=st.session_state.style,
                **st.session_state.style_opts
            )
        
        # Export to STL
        from potfoundry import write_stl_binary
        import tempfile
        
        # Write to temporary file and read bytes
        with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as tmp:
            write_stl_binary(tmp.name, "Pot", verts, faces)
            tmp_path = tmp.name
        
        with open(tmp_path, 'rb') as f:
            stl_bytes = f.read()
        
        # Clean up
        import os
        os.unlink(tmp_path)
        
        st.download_button(
            label='Download STL',
            data=stl_bytes,
            file_name='pot.stl',
            mime='application/octet-stream'
        )

# Quality selector approach
def render_with_quality_selector():
    '''Let user choose preview vs export quality.'''
    
    quality = st.selectbox(
        'Preview Quality',
        ['draft', 'standard', 'high', 'ultra'],
        index=1,  # Default to 'standard'
        help='Higher quality = more detail but slower generation'
    )
    
    n_theta, n_z = get_export_resolution(quality)
    
    verts, faces, diag = build_pot_cached(
        H=st.session_state.height,
        ...,
        n_theta=n_theta,
        n_z=n_z,
        ...
    )
    
    st.plotly_chart(create_3d_plot(verts, faces))
    st.caption(f'Generated {len(faces):,} triangles at {quality} quality')
"""

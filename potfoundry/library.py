"""Core library publishing functionality.

Handles thumbnail creation, publish workflow, and listing.

Note: Validation, hashing, and rate limiting have been extracted to
potfoundry.library package for better modularity. This module maintains
backward compatibility.
"""

from __future__ import annotations

import gzip
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    # For static analysis, expose streamlit names so type checkers can reason
    # about Streamlit usage in the module without performing a runtime import.
    import streamlit as st

    HAS_STREAMLIT = True
else:
    try:
        import streamlit as st

        HAS_STREAMLIT = True
    except Exception:
        HAS_STREAMLIT = False
        st = None

from potfoundry.integrations.supabase_client import (
    LibraryError,
    NotConfiguredError,
    get_singleton_client,
)

# Import from library package for modularity
from .library import (
    ALLOWED_LICENSES,
    APP_VERSION,
    BLOCKLIST_PATTERNS,
    MAX_STL_SIZE_MB,
    MAX_TAG_LENGTH,
    MAX_TAGS,
    MAX_TITLE_LENGTH,
    MAX_TRIANGLE_COUNT,
    canonical_payload,
    check_rate_limit,
    content_id,
    record_publish,
    validate_license,
    validate_stl_size,
    validate_tags,
    validate_title,
    validate_triangle_count,
)

# Local constant not in library package
GZIP_THRESHOLD_MB = 1


@dataclass
class PublishResult:
    """Result of a publish operation."""

    id: str
    stl_url: str
    thumb_url: str
    meta_url: str
    duplicate: bool
    error: Optional[str] = None








# ============================================================
# Thumbnail Generation
# ============================================================


def make_thumbnail(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    n_theta: int,
    n_z: int,
    style_name: str,
    opts_json: str,
) -> bytes:
    """Generate PNG thumbnail from parameters.

    Uses existing preview rendering infrastructure.

    Args:
        H, Rt, Rb, expn: Geometry parameters
        n_theta, n_z: Mesh quality (use lower values for thumbnail)
        style_name: Style name
        opts_json: JSON-encoded style options

    Returns:
        PNG bytes
    """
    try:
        # Prefer exact mesh snapshot renderer for thumbnails (better colors/appearance parity)
        import json as _json

        from pfui.preview import render_mesh_snapshot_cached

        thumb_theta = max(48, min(144, n_theta))
        thumb_z = max(24, min(64, n_z))
        # appearance key (best-effort) – powoduje przebudowę cache przy zmianie ustawień
        try:
            import streamlit as _st

            ak = "|".join(
                str(_st.session_state.get(k, ""))
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
        png = render_mesh_snapshot_cached(
            H,
            Rt,
            Rb,
            expn,
            thumb_theta,
            thumb_z,
            style_name,
            _json.dumps(_json.loads(opts_json)),
            4.0,
            4.0,
            120,
            inner_wall=None,
            place_on_ground=True,
            view_elev=20.0,
            view_azim=-60.0,
            theme="dark",
            appearance_key=ak,
        )
        if png:
            return png
    except Exception:
        try:
            # Fallback to surface preview without floor grid if mesh renderer is unavailable
            import json as _json

            from pfui.preview import render_preview_png_cached

            thumb_theta = max(48, min(144, n_theta))
            thumb_z = max(24, min(64, n_z))
            png2 = render_preview_png_cached(
                H,
                Rt,
                Rb,
                expn,
                thumb_theta,
                thumb_z,
                style_name,
                _json.dumps(_json.loads(opts_json)),
                4.0,
                4.0,
                120,
                theme="dark",
                show_floor=False,
                show_axes=False,
                appearance_key=ak,
            )
            if png2:
                return png2
        except Exception:
            pass

    # Fallback: tiny 1x1 PNG
    import base64

    return base64.b64decode(
        b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )


# ============================================================
# Publish Workflow
# ============================================================


def publish_design(
    stl_bytes: bytes,
    style: str,
    size: dict,
    opts: dict,
    mesh: dict,
    diagnostics: dict,
    license: str,
    title: str,
    tags: List[str],
    app_commit: Optional[str] = None,
) -> PublishResult:
    """Publish design to public library.

    Args:
        stl_bytes: Binary STL file contents
        style: Style name
        size: Size parameters dict
        opts: Style options dict
        mesh: Mesh quality dict
        diagnostics: Diagnostics dict
        license: License identifier
        title: User-provided title
        tags: User-provided tags list
        app_commit: Git commit SHA (optional)

    Returns:
        PublishResult with URLs and status

    Raises:
        LibraryError: If publish fails
    """
    # Get client
    client = get_singleton_client()
    if not client.is_configured():
        raise NotConfiguredError("Library publishing is not configured")

    # Validate inputs
    valid, error = validate_title(title)
    if not valid:
        raise LibraryError(f"Invalid title: {error}")

    valid, error = validate_tags(tags)
    if not valid:
        raise LibraryError(f"Invalid tags: {error}")

    valid, error = validate_license(license)
    if not valid:
        raise LibraryError(f"Invalid license: {error}")

    valid, error = validate_stl_size(stl_bytes)
    if not valid:
        raise LibraryError(f"Invalid STL: {error}")

    valid, error = validate_triangle_count(diagnostics)
    if not valid:
        raise LibraryError(f"Invalid model: {error}")

    # Check rate limit
    can_publish, error = check_rate_limit()
    if not can_publish:
        raise LibraryError(error)

    # Generate canonical payload and content ID
    payload = canonical_payload(style, size, opts, mesh, diagnostics, license)
    design_id = content_id(payload)

    # Check for duplicate
    try:
        existing = client.select_rows("pots", filters={"id": design_id}, limit=1)
        if existing:
            # Return existing URLs
            row = existing[0]
            return PublishResult(
                id=design_id,
                stl_url=row["stl_url"],
                thumb_url=row["thumb_url"],
                meta_url=row.get(
                    "meta_url",
                    f"{row['stl_url'].rsplit('/', 1)[0]}/../meta/{design_id}.json",
                ),
                duplicate=True,
            )
    except Exception:
        # Continue with new publish if dedup check fails
        pass

    # Compress STL if large
    stl_data = stl_bytes
    stl_path = f"stl/{design_id}.stl"
    stl_content_type = "application/octet-stream"
    stl_gzipped = False

    if len(stl_bytes) > GZIP_THRESHOLD_MB * 1024 * 1024:
        stl_data = gzip.compress(stl_bytes, compresslevel=9)
        stl_path = f"stl/{design_id}.stl.gz"
        stl_gzipped = True

    # Generate thumbnail
    thumb_bytes = make_thumbnail(
        H=size.get("height", 100.0),
        Rt=size.get("top_od", 100.0) / 2,
        Rb=size.get("bottom_od", 100.0) / 2,
        expn=size.get("flare_exp", 1.5),
        n_theta=mesh.get("n_theta", 144),
        n_z=mesh.get("n_z", 64),
        style_name=style,
        opts_json=json.dumps(opts),
    )

    # Upload files
    try:
        stl_url = client.upload_bytes(
            stl_path, stl_data, stl_content_type, gzip=stl_gzipped
        )
        thumb_url = client.upload_bytes(
            f"thumb/{design_id}.png", thumb_bytes, "image/png"
        )

        # Upload metadata JSON
        meta_json = json.dumps(payload, indent=2)
        meta_url = client.upload_bytes(
            f"meta/{design_id}.json", meta_json.encode("utf-8"), "application/json"
        )
    except Exception as e:
        raise LibraryError(f"Upload failed: {e}")

    # Insert database record
    try:
        row = {
            "id": design_id,
            "title": title,
            "style": style,
            "size": size,
            "opts": opts,
            "mesh": mesh,
            "stl_url": stl_url,
            "thumb_url": thumb_url,
            "tags": tags,
            "app_commit": app_commit,
            "diagnostics": diagnostics,
            "license": license,
        }
        client.upsert_row("pots", row)
    except Exception as e:
        raise LibraryError(f"Database insert failed: {e}")

    # Record publish event
    record_publish()

    return PublishResult(
        id=design_id,
        stl_url=stl_url,
        thumb_url=thumb_url,
        meta_url=meta_url,
        duplicate=False,
    )


# ============================================================
# Query / Listing
# ============================================================


def list_published(
    style: Optional[str] = None,
    tags: Optional[List[str]] = None,
    search_query: Optional[str] = None,
    order_by: str = "created_at",
    order_desc: bool = True,
    offset: int = 0,
    limit: int = 24,
    refresh_counter: int = 0,
) -> Tuple[List[dict], bool]:
    """List published designs with filters.

    Args:
        style: Filter by style name (exact match)
        tags: Filter by tags (designs must have at least one)
        search_query: Search in title (case-insensitive substring)
        order_by: Column to sort by
        order_desc: Sort descending if True
        offset: Number of results to skip
        limit: Maximum results to return

    Returns:
        Tuple of (results_list, has_next_page)
    """
    client = get_singleton_client()
    if not client.is_configured():
        return [], False

    # Build filters
    filters: Dict[str, object] = {}
    if style:
        filters["style"] = style
    if tags:
        filters["tags"] = tags
    if search_query:
        filters["title_search"] = search_query

    try:
        # Fetch one extra to check if there's a next page — no Streamlit caching to reflect DB immediately
        results = client.select_rows(
            "pots",
            filters=filters,
            order_by=order_by,
            order_desc=order_desc,
            offset=offset,
            limit=limit + 1,
        )

        has_next = len(results) > limit
        return results[:limit], has_next

    except Exception as e:
        if HAS_STREAMLIT and st is not None:
            st.error(f"Failed to fetch library: {e}")
        return [], False

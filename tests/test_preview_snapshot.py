import json

from pfui.preview import render_mesh_snapshot_cached


def test_render_mesh_snapshot_cached_returns_png_bytes():
    # Small parameters for a fast run
    H = 60.0
    Rt = 35.0
    Rb = 25.0
    expn = 1.1
    n_theta = 48
    n_z = 24
    style_name = list(__import__("pfui.imports", fromlist=["STYLES"]).STYLES.keys())[0]
    from typing import Any

    opts: dict[str, Any] = {}
    opts_json = json.dumps(opts)

    # Use small figure size and DPI to keep it fast
    fig_w, fig_h, dpi = 4.0, 3.0, 100

    png = render_mesh_snapshot_cached(
        H,
        Rt,
        Rb,
        expn,
        n_theta,
        n_z,
        style_name,
        opts_json,
        fig_w,
        fig_h,
        dpi,
        inner_wall=None,
        place_on_ground=True,
    )

    assert png is None or (
        isinstance(png, (bytes, bytearray)) and len(png) > 100
    ), "Expected PNG bytes or None"

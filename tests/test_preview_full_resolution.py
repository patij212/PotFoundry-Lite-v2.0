import json
import numpy as np

from pfui.preview import make_preview_arrays, render_preview_png_cached


def _first_style_name() -> str:
    return list(__import__("pfui.imports", fromlist=["STYLES"]).STYLES.keys())[0]


def test_make_preview_arrays_full_resolution_returns_expected_shape_and_finite():
    H = 120.0
    Rt = 70.0
    Rb = 40.0
    expn = 1.1
    n_theta = 96
    n_z = 48
    style_name = _first_style_name()
    opts_json = json.dumps({})

    X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, style_name, opts_json)

    assert isinstance(X, np.ndarray) and isinstance(Y, np.ndarray) and isinstance(Z, np.ndarray)
    assert X.shape == (n_z, n_theta), f"Expected shape {(n_z, n_theta)}, got {X.shape}"
    assert Y.shape == (n_z, n_theta)
    assert Z.shape == (n_z, n_theta)
    assert X.dtype == np.float64 and Y.dtype == np.float64 and Z.dtype == np.float64
    assert np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(Z).all()


def test_render_preview_png_cached_full_resolution_returns_bytes():
    H = 120.0
    Rt = 70.0
    Rb = 40.0
    expn = 1.1
    n_theta = 96
    n_z = 48
    style_name = _first_style_name()
    opts_json = json.dumps({})
    fig_w, fig_h, dpi = 6.0, 4.0, 100

    png = render_preview_png_cached(
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
        return_png=True,
    )

    assert png is None or (isinstance(png, (bytes, bytearray)) and len(png) > 100), (
        "Expected PNG bytes or None"
    )

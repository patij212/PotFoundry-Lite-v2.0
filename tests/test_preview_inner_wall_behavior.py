import json

import numpy as np

import pfui.preview as preview


def test_render_preview_png_cached_with_numpy_scalar_inner_wall(monkeypatch):
    """Passing a numpy scalar for inner_wall should not raise an exception.
    Historically ambiguous truth-value checks on arrays could crash this path.
    """

    def trivial_style(theta, z, r0, H, opts):
        import numpy as _np

        if isinstance(theta, _np.ndarray):
            return _np.full(theta.shape, float(r0))
        return float(r0)

    monkeypatch.setitem(preview.STYLES, "Trivial", (trivial_style, "adversarial"))

    png = preview.render_preview_png_cached(
        120.0,
        70.0,
        45.0,
        1.1,
        48,
        12,
        "Trivial",
        json.dumps({}),
        3.0,
        2.0,
        72,
        inner_wall=np.float64(2.0),
        return_png=True,
    )

    assert png is None or (isinstance(png, (bytes, bytearray)) and len(png) > 50)


def test_render_preview_png_cached_with_numpy_array_inner_wall(monkeypatch):
    """Passing a 0-d numpy array for inner_wall should not raise an exception.
    If code uses `if inner_wall and inner_wall > 0` with an ndarray this can
    raise a ValueError due to ambiguous truth value.
    """

    def trivial_style(theta, z, r0, H, opts):
        import numpy as _np

        if isinstance(theta, _np.ndarray):
            return _np.full(theta.shape, float(r0))
        return float(r0)

    monkeypatch.setitem(preview.STYLES, "Trivial2", (trivial_style, "adversarial"))

    png = preview.render_preview_png_cached(
        120.0,
        70.0,
        45.0,
        1.1,
        48,
        12,
        "Trivial2",
        json.dumps({}),
        3.0,
        2.0,
        72,
        inner_wall=np.array(2.0),
        return_png=True,
    )

    assert png is None or (isinstance(png, (bytes, bytearray)) and len(png) > 50)

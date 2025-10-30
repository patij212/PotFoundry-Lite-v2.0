import json
import numpy as np
import pfui.preview as preview
import potfoundry.geometry as geom


def _make_opts():
    return {}


def test_vectorized_style_fallback_reported(monkeypatch):
    """If a style doesn't support vectorized calls, preview should fall back
    to per-theta sampling and report the recovery via st.info.
    """
    # Track whether the vectorized call was attempted and whether scalar
    # sampling happened as the fallback.
    state = {"vec_called": 0, "scalar_called": 0}

    def broken_style(theta, z, r0, H, opts):
        import numpy as _np

        if isinstance(theta, _np.ndarray):
            state["vec_called"] += 1
            # Simulate a style that doesn't support vectorized input
            raise ValueError("no vectorized support")
        state["scalar_called"] += 1
        # scalar path: return a reasonable radius slightly under r0
        return float(r0 * 0.9)

    # Inject into the STYLES mapping used by preview for the duration of the test
    monkeypatch.setitem(preview.STYLES, "BrokenVec", (broken_style, "adversarial"))

    opts = _make_opts()
    X, Y, Z = preview.make_preview_arrays(
        120.0,  # H
        70.0,  # Rt
        45.0,  # Rb
        1.1,  # expn
        64,  # n_theta (keeps runtime reasonable)
        16,  # n_z
        "BrokenVec",
        json.dumps(opts),
    )

    # Basic sanity checks on returned arrays
    assert X.dtype == np.float64 and Y.dtype == np.float64 and Z.dtype == np.float64
    assert X.shape[0] == max(12, int(16 * 1.0)) and X.shape[1] == max(24, int(64 * 1.0))
    assert np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(Z).all()

    # Confirm the vectorized attempt occurred and that scalar sampling was used
    assert state["vec_called"] > 0, "expected preview to attempt vectorized style call"
    assert state["scalar_called"] > 0, "expected preview to fall back to scalar sampling"


def test_nonfinite_style_sanitized(monkeypatch):
    """Styles that return NaN/Inf should be sanitized by make_preview_arrays
    so the returned X/Y/Z arrays are finite.
    """

    def nan_style(theta, z, r0, H, opts):
        import numpy as _np

        if isinstance(theta, _np.ndarray):
            return _np.full(theta.shape, _np.nan)
        return float(_np.nan)

    monkeypatch.setitem(preview.STYLES, "NanStyle", (nan_style, "adversarial"))

    opts = _make_opts()
    X, Y, Z = preview.make_preview_arrays(120.0, 70.0, 45.0, 1.1, 48, 12, "NanStyle", json.dumps(opts))

    # All arrays must be finite after sanitization
    assert np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(Z).all()


def test_render_preview_png_cached_with_broken_style(monkeypatch):
    """Ensure the cached PNG renderer can produce a PNG for a style that
    required per-theta fallbacks (i.e., it shouldn't crash silently).
    """

    def broken_style(theta, z, r0, H, opts):
        import numpy as _np

        # force vectorized failure
        if isinstance(theta, _np.ndarray):
            raise ValueError("no vectorized support")
        return float(r0 * 0.95)

    monkeypatch.setitem(preview.STYLES, "BrokenVecPNG", (broken_style, "adversarial"))

    opts = _make_opts()
    png = preview.render_preview_png_cached(
        120.0,
        70.0,
        45.0,
        1.1,
        48,
        12,
        "BrokenVecPNG",
        json.dumps(opts),
        3.0,
        2.0,
        72,
        return_png=True,
    )

    # Should produce PNG bytes (not None) and be non-trivially sized
    assert png is not None and isinstance(png, (bytes, bytearray)) and len(png) > 100

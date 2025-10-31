import json
import numpy as np
from typing import Any
import pfui.preview as preview


def _make_opts():
    return {}


def test_vectorized_failure_but_scalar_success_reports_info(monkeypatch):
    """If a style raises for vectorized input but scalar sampling succeeds,
    preview should still report that it recovered via st.info.
    """
    state: dict[str, Any] = {"vec_called": 0, "scalar_called": 0, "infos": []}

    def broken_style(theta, z, r0, H, opts):
        import numpy as _np

        if isinstance(theta, _np.ndarray):
            state["vec_called"] += 1
            # Simulate failure only for vectorized call
            raise ValueError("no vectorized support")
        state["scalar_called"] += 1
        return float(r0 * 0.95)

    # Patch the style mapping
    monkeypatch.setitem(preview.STYLES, "BrokenVecOnly", (broken_style, "adversarial"))

    # Capture st.info calls from preview module
    def _info(msg):
        state["infos"].append(str(msg))

    monkeypatch.setattr(preview.st, "info", _info)

    opts = _make_opts()
    X, Y, Z = preview.make_preview_arrays(
        120.0,  # H
        70.0,  # Rt
        45.0,  # Rb
        1.1,  # expn
        48,  # n_theta
        12,  # n_z
        "BrokenVecOnly",
        json.dumps(opts),
    )

    # Basic sanity checks
    assert np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(Z).all()
    assert state["vec_called"] > 0
    assert state["scalar_called"] > 0

    # Expect that the preview reported recovery via st.info
    assert state["infos"], "expected st.info to be called for ring fallback recovery"


def test_vectorized_inconsistent_shape_causes_scalar_fallback(monkeypatch):
    """If a vectorized style returns a wrong-shaped array (e.g., 2D or shorter),
    preview should fall back to scalar sampling and produce finite arrays.
    """

    def bad_shape_style(theta, z, r0, H, opts):
        import numpy as _np

        if isinstance(theta, _np.ndarray):
            # Return a 2D array to simulate malformed vectorized output
            return _np.zeros((theta.size, 2))
        return float(r0)

    monkeypatch.setitem(preview.STYLES, "BadShape", (bad_shape_style, "adversarial"))

    opts = _make_opts()
    X, Y, Z = preview.make_preview_arrays(120.0, 70.0, 45.0, 1.1, 40, 10, "BadShape", json.dumps(opts))

    assert X.shape[0] >= 10 and X.shape[1] >= 24
    assert np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(Z).all()

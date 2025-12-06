import json

import numpy as np

from pfui import preview


def test_full_resolution_exact_shape(monkeypatch):
    """A well-behaved vectorized style should produce arrays exactly matching
    the requested (n_z, n_theta) shape at scale 1.0. If the preview logic
    silently falls back to lower resolutions the test will fail.
    """

    def good_style(theta, z, r0, H, opts):
        import numpy as _np

        # return radius equal to r0 for all theta values
        if isinstance(theta, _np.ndarray):
            return _np.full(theta.shape, float(r0))
        return float(r0)

    monkeypatch.setitem(preview.STYLES, "GoodVecAlways", (good_style, "adversarial"))

    n_theta = 64
    n_z = 16
    X, Y, Z = preview.make_preview_arrays(
        120.0, 70.0, 45.0, 1.1, n_theta, n_z, "GoodVecAlways", json.dumps({}),
    )

    assert X.shape == (
        n_z,
        n_theta,
    ), f"expected shape {(n_z, n_theta)} but got {X.shape}"
    assert Y.shape == (n_z, n_theta)
    assert Z.shape == (n_z, n_theta)
    assert np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(Z).all()

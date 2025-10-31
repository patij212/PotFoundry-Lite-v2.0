import json
import random
import numpy as np
import pfui.preview as preview


def _register_style(name, fn, monkeypatch):
    monkeypatch.setitem(preview.STYLES, name, (fn, "fuzz"))


def test_fuzz_many_adversarial_styles(monkeypatch):
    """Generate many adversarial style functions to fuzz preview generation and
    assert core invariants: output shapes match (nz, nt), arrays are finite,
    and Z rows are constant (each row corresponds to a single z value).
    This should surface subtle bugs that only appear under odd style behavior.
    """

    rng = random.Random(12345)
    n_iter = 200
    n_theta = 64
    n_z = 16

    for i in range(n_iter):
        typ = rng.choice(
            [
                "ok",
                "vec_raise",
                "wrong_shape",
                "nan_return",
                "inf_return",
                "object_dtype",
                "negatives",
            ]
        )

        def make_fn(t=typ):
            def fn(theta, z, r0, H, opts):
                import numpy as _np

                if t == "ok":
                    if isinstance(theta, _np.ndarray):
                        return _np.full(theta.shape, float(r0))
                    return float(r0)
                if t == "vec_raise":
                    if isinstance(theta, _np.ndarray):
                        raise RuntimeError("vec fail")
                    return float(r0)
                if t == "wrong_shape":
                    if isinstance(theta, _np.ndarray):
                        return _np.zeros((theta.size - 1,))
                    return float(r0)
                if t == "nan_return":
                    if isinstance(theta, _np.ndarray):
                        return _np.full(theta.shape, _np.nan)
                    return float("nan")
                if t == "inf_return":
                    if isinstance(theta, _np.ndarray):
                        return _np.full(theta.shape, _np.inf)
                    return float("inf")
                if t == "object_dtype":
                    if isinstance(theta, _np.ndarray):
                        return _np.array(
                            [object() for _ in range(theta.size)], dtype=object
                        )
                    return object()
                if t == "negatives":
                    if isinstance(theta, _np.ndarray):
                        return _np.full(theta.shape, -1.0 * float(r0))
                    return -1.0 * float(r0)

            return fn

        name = f"fuzz_{i}_{typ}"
        _register_style(name, make_fn(), monkeypatch)

        X, Y, Z = preview.make_preview_arrays(
            120.0, 70.0, 45.0, 1.1, n_theta, n_z, name, json.dumps({})
        )

        # Shapes: must be 2D arrays with nz rows and >=24 columns (nt may be reduced on fallback)
        assert X.ndim == 2 and Y.ndim == 2 and Z.ndim == 2
        assert X.shape[0] == n_z
        assert Z.shape == X.shape and Y.shape == X.shape

        # Z rows must be constant values (each row corresponds to z-level)
        for row in range(Z.shape[0]):
            row_vals = Z[row, :]
            assert np.allclose(row_vals, row_vals[0]), "Z row not constant"

        # Arrays must be finite
        assert np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(Z).all()

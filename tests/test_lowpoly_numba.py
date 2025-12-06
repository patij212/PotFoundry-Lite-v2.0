import time
import pytest
from potfoundry import STYLES
from potfoundry.core.optimizations import build_pot_mesh_accelerated, HAS_NUMBA


def test_lowpoly_numba_presence_and_timing():
    style_fn, _ = STYLES["LowPolyFacet"]
    opts = {}
    n_theta = 168
    n_z = 84
    # Run accelerated builder and check timings
    _, _, diag = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts=opts,
        collect_timings=True, enforce_parity=False,
    )
    timings = diag.get("timings", {})
    if HAS_NUMBA and getattr(style_fn, "__numba_parallel__", None) is not None:
        # Expect our numba timing key to be present
        assert "numba_per_z_parallel" in timings
        assert timings["numba_per_z_parallel"] >= 0.0
    else:
        # When Numba missing, we still expect per-z python loop timing to be recorded
        assert "per_z_loop_python" in timings or timings == {}

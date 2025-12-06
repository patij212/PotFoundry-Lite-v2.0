from __future__ import annotations

from math import atan, tan


def compute_dv_dh(padded_half_width: float, padded_half_height: float, fov: float, aspect: float) -> tuple[float, float]:
    half_fov_y = fov * 0.5
    half_fov_x = atan(tan(half_fov_y) * aspect)
    d_v = max(1e-6, float(padded_half_height)) / max(tan(half_fov_y), 1e-6)
    d_h = max(1e-6, float(padded_half_width)) / max(tan(half_fov_x), 1e-6)
    return d_v, d_h


def compute_scene_radius(cfg_scene_radius: float | None, computed_max: float) -> float | None:
    if cfg_scene_radius is None:
        return None
    next_scene_radius = max(abs(float(cfg_scene_radius)), computed_max, 1)
    return next_scene_radius


def test_per_axis_dh_dv_behavior():
    fov = 0.8  # a plausible base FOV in radians
    aspect = 16 / 9
    base_w, base_h = 20.0, 10.0
    dV0, dH0 = compute_dv_dh(base_w, base_h, fov, aspect)

    # taller geometry should increase vertical distance dV
    dV1, dH1 = compute_dv_dh(base_w, base_h * 4.0, fov, aspect)
    assert dV1 > dV0
    assert dH1 == dH0

    # wider geometry should increase horizontal distance dH
    dV2, dH2 = compute_dv_dh(base_w * 3.0, base_h, fov, aspect)
    assert dH2 > dH0
    assert dV2 == dV0


def test_scene_radius_gating():
    computed_max = 150.0
    # None provided: gating means we don't compute a next radius
    assert compute_scene_radius(None, computed_max) is None
    # If provided, we clamp and respect the sceneRadius value
    assert compute_scene_radius(60.0, computed_max) == max(60.0, computed_max, 1)
    assert compute_scene_radius(200.0, computed_max) == max(200.0, computed_max, 1)

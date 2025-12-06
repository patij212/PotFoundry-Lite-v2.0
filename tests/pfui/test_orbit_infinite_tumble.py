"""Regression tests for the CAD-style turntable helper.

The tests mirror the logic implemented in ``turntableStep`` (TypeScript) to
ensure pitch clamps safely near ±90° without injecting spurious yaw offsets and
that repeated yaw moves keep the basis in sync with the mathematical yaw angle.
"""
from __future__ import annotations

import math

import pytest

Vec3 = tuple[float, float, float]

WORLD_UP: Vec3 = (0.0, 0.0, 1.0)
PITCH_SOFT_LIMIT = math.pi * 0.5 - 1e-3
EPS = 1e-9


def vec_dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vec_cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def vec_length(v: Vec3) -> float:
    return math.sqrt(max(vec_dot(v, v), 0.0))


def vec_normalize(v: Vec3) -> Vec3:
    length = vec_length(v)
    if length < EPS:
        return (0.0, 0.0, 0.0)
    return (v[0] / length, v[1] / length, v[2] / length)


def rotate_vec(v: Vec3, axis: Vec3, angle: float) -> Vec3:
    axis_norm = vec_normalize(axis)
    if vec_length(axis_norm) < EPS or abs(angle) < 1e-9:
        return v
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    dot_va = vec_dot(axis_norm, v)
    cross_va = vec_cross(axis_norm, v)
    return (
        v[0] * cos_a + cross_va[0] * sin_a + axis_norm[0] * dot_va * (1 - cos_a),
        v[1] * cos_a + cross_va[1] * sin_a + axis_norm[1] * dot_va * (1 - cos_a),
        v[2] * cos_a + cross_va[2] * sin_a + axis_norm[2] * dot_va * (1 - cos_a),
    )


def build_basis_from_forward(forward: Vec3) -> dict[str, Vec3]:
    fwd = vec_normalize(forward)
    if vec_length(fwd) < EPS or not all(math.isfinite(c) for c in fwd):
        fwd = (0.0, -1.0, 0.0)
    right = vec_normalize(vec_cross(WORLD_UP, fwd))
    if vec_length(right) < EPS:
        for candidate in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)):
            right = vec_normalize(vec_cross(candidate, fwd))
            if vec_length(right) >= EPS:
                break
    if vec_length(right) < EPS:
        right = (1.0, 0.0, 0.0)
    up = vec_normalize(vec_cross(fwd, right))
    if vec_length(up) < EPS:
        up = WORLD_UP
    return {"right": right, "up": up, "forward": fwd}


def basis_from_angles(rot_x: float, rot_y: float) -> dict[str, Vec3]:
    cos_pitch = math.cos(rot_x)
    sin_pitch = math.sin(rot_x)
    cos_yaw = math.cos(rot_y)
    sin_yaw = math.sin(rot_y)
    forward = (sin_yaw * cos_pitch, -cos_yaw * cos_pitch, -sin_pitch)
    return build_basis_from_forward(forward)


def rotate_basis_about_axis(basis: dict[str, Vec3], axis: Vec3, angle: float) -> dict[str, Vec3]:
    right = rotate_vec(basis["right"], axis, angle)
    up = rotate_vec(basis["up"], axis, angle)
    forward = rotate_vec(basis["forward"], axis, angle)
    fwd = vec_normalize(forward)
    right_vec = vec_cross(up, fwd)
    if vec_length(right_vec) < EPS:
        right_vec = vec_cross(basis["up"], fwd)
    if vec_length(right_vec) < EPS:
        right_vec = vec_cross(WORLD_UP, fwd)
    right_vec = vec_normalize(right_vec)
    up_vec = vec_cross(fwd, right_vec)
    if vec_length(up_vec) < EPS:
        up_vec = vec_cross(fwd, (1.0, 0.0, 0.0))
    if vec_length(up_vec) < EPS:
        up_vec = WORLD_UP
    else:
        up_len = vec_length(up_vec)
        up_vec = (up_vec[0] / up_len, up_vec[1] / up_len, up_vec[2] / up_len)
    return {"right": right_vec, "up": up_vec, "forward": fwd}


def sync_angles_from_basis(basis: dict[str, Vec3]) -> tuple[float, float]:
    fwd = vec_normalize(basis["forward"])
    pitch = math.asin(max(-1.0, min(1.0, -fwd[2])))
    yaw = math.atan2(fwd[0], -fwd[1])
    return pitch, yaw


def turntable_step(
    basis: dict[str, Vec3],
    d_yaw: float,
    d_pitch: float,
) -> tuple[dict[str, Vec3], float, float]:
    yawed = rotate_basis_about_axis(basis, WORLD_UP, d_yaw)
    pitched = rotate_basis_about_axis(yawed, yawed["right"], d_pitch)
    rot_x, rot_y = sync_angles_from_basis(pitched)
    # Preserve yaw from the yawed basis when clamping pitch to avoid 180° flips
    yawed_x, yawed_y = sync_angles_from_basis(yawed)
    desired_pitch = yawed_x + d_pitch
    should_clamp = desired_pitch > PITCH_SOFT_LIMIT or desired_pitch < -PITCH_SOFT_LIMIT

    if should_clamp:
        rot_x = max(-PITCH_SOFT_LIMIT, min(PITCH_SOFT_LIMIT, desired_pitch))
        rot_y = yawed_y
        pitched = basis_from_angles(rot_x, yawed_y)
    elif rot_x < -PITCH_SOFT_LIMIT:
        rot_x = -PITCH_SOFT_LIMIT
        rot_y = yawed_y
        pitched = basis_from_angles(rot_x, yawed_y)
    return pitched, rot_x, rot_y


def test_pitch_crossing_does_not_inject_yaw_offset() -> None:
    basis = basis_from_angles(math.radians(85.0), 0.0)
    _, rot_x, rot_y = turntable_step(basis, d_yaw=0.0, d_pitch=math.radians(15.0))
    assert rot_y == pytest.approx(0.0, abs=1e-6)
    assert rot_x == pytest.approx(PITCH_SOFT_LIMIT, rel=1e-6)


def test_turntable_tracks_expected_yaw_orientation() -> None:
    basis = basis_from_angles(0.0, 0.0)
    total_yaw = 0.0
    steps = 720
    delta = math.pi / 180  # 1° in radians
    rot_x = 0.0
    rot_y = 0.0
    for _ in range(steps):
        basis, rot_x, rot_y = turntable_step(basis, d_yaw=delta, d_pitch=0.0)
        total_yaw += delta
    expected_yaw = total_yaw % (2 * math.pi)
    expected_forward = (
        math.sin(expected_yaw) * math.cos(rot_x),
        -math.cos(expected_yaw) * math.cos(rot_x),
        -math.sin(rot_x),
    )
    assert basis["forward"][0] == pytest.approx(expected_forward[0], abs=1e-6)
    assert basis["forward"][1] == pytest.approx(expected_forward[1], abs=1e-6)
    assert basis["forward"][2] == pytest.approx(expected_forward[2], abs=1e-6)

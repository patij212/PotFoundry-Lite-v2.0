from __future__ import annotations

import math
from typing import Tuple

Vec3 = Tuple[float, float, float]


def dot(a: Vec3, b: Vec3) -> float:
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]


def length(a: Vec3) -> float:
    return math.sqrt(dot(a, a))


def normalize(a: Vec3) -> Vec3:
    l = length(a) or 1.0
    return (a[0]/l, a[1]/l, a[2]/l)


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])


def rotate_vector_around_axis(v: Vec3, axis: Vec3, angle: float) -> Vec3:
    axis_n = normalize(axis)
    if length(axis_n) < 1e-8 or abs(angle) < 1e-6:
        return v
    cosA = math.cos(angle)
    sinA = math.sin(angle)
    dotVA = dot(axis_n, v)
    crossVA = cross(axis_n, v)
    return (
        v[0]*cosA + crossVA[0]*sinA + axis_n[0]*dotVA*(1-cosA),
        v[1]*cosA + crossVA[1]*sinA + axis_n[1]*dotVA*(1-cosA),
        v[2]*cosA + crossVA[2]*sinA + axis_n[2]*dotVA*(1-cosA),
    )


def rotate_basis_in_place(basis: Tuple[Vec3, Vec3, Vec3] | None, axis: Vec3, angle: float):
    if basis is None or abs(angle) < 1e-6:
        return basis
    forward, up, right = basis[0], basis[1], basis[2]
    normAxis = normalize(axis)
    if length(normAxis) < 1e-6:
        return basis
    forward_r = rotate_vector_around_axis(forward, normAxis, angle)
    up_r = rotate_vector_around_axis(up, normAxis, angle)
    right_r = rotate_vector_around_axis(right, normAxis, angle)
    new_forward = normalize(forward_r)
    corrected_right = normalize(cross(up_r, new_forward))
    if length(corrected_right) < 1e-6:
        corrected_right = normalize(right_r)
    new_up = normalize(cross(corrected_right, new_forward))
    return (new_forward, new_up, corrected_right)


def test_rotate_dx_only_changes_forward():
    # initial basis
    forward = (0.0, -1.0, 0.0)
    up = (0.0, 0.0, 1.0)
    right = cross(up, forward)
    right = normalize(right)
    basis = (forward, up, right)

    dx = 10.0
    dy = 0.0
    sensitivity = 0.005
    rotated_pitch_basis = rotate_basis_in_place(basis, right, dy * sensitivity)
    rotated_yaw_basis = rotate_basis_in_place(rotated_pitch_basis, rotated_pitch_basis[1], dx * sensitivity)
    assert rotated_yaw_basis is not None
    new_forward = rotated_yaw_basis[0]
    # forward Y should have changed significantly
    assert abs(new_forward[1] - forward[1]) > 1e-4


def test_rotate_dy_only_changes_forward():
    forward = (0.0, -1.0, 0.0)
    up = (0.0, 0.0, 1.0)
    right = normalize(cross(up, forward))
    basis = (forward, up, right)
    dx = 0.0
    dy = 10.0
    sensitivity = 0.005
    rotated_pitch_basis = rotate_basis_in_place(basis, right, dy * sensitivity)
    assert rotated_pitch_basis is not None
    new_forward = rotated_pitch_basis[0]
    assert abs(new_forward[2] - forward[2]) > 1e-4


def test_no_unexpected_roll_flips_random_walk():
    # Simulate random rotate steps and ensure no abrupt 180° flips in the right vector
    import random

    forward = (0.0, -1.0, 0.0)
    up = (0.0, 0.0, 1.0)
    right = normalize(cross(up, forward))
    basis = (forward, up, right)
    last_right = basis[2]
    random.seed(0)
    for _ in range(500):
        dx = (random.random() - 0.5) * 40.0
        dy = (random.random() - 0.5) * 20.0
        sensitivity = 0.005
        basis_after_pitch = rotate_basis_in_place(basis, basis[2], dy * sensitivity)
        if basis_after_pitch is None:
            basis_after_pitch = basis
        basis_after_yaw = rotate_basis_in_place(basis_after_pitch, basis_after_pitch[1], dx * sensitivity)
        basis = basis_after_yaw
        # if basis right becomes inverted relative to last_right, that's a flip
        r = basis[2]
        dotprod = r[0]*last_right[0] + r[1]*last_right[1] + r[2]*last_right[2]
        assert dotprod > -0.999, f"Detected near-180deg roll flip: dot={dotprod}"
        last_right = r


def test_angles_sync_from_basis_stays_continuous():
    # Ensure that extracting Euler angles from basis doesn't produce jumps
    forward = (0.0, -1.0, 0.0)
    up = (0.0, 0.0, 1.0)
    right = normalize(cross(up, forward))
    basis = (forward, up, right)
    last_rot_y = 0.0
    random_steps = 500
    import random
    random.seed(1)
    for _ in range(random_steps):
        dx = (random.random() - 0.5) * 20.0
        dy = (random.random() - 0.5) * 10.0
        sensitivity = 0.005
        basis = rotate_basis_in_place(basis, basis[2], dy * sensitivity)
        basis = rotate_basis_in_place(basis, basis[1], dx * sensitivity)
        f = basis[0]
        clamped_pitch = max(-1.0, min(1.0, -f[2]))
        rot_x = math.asin(clamped_pitch)
        rot_y = math.atan2(f[0], -f[1])
        # unwrap near previous value
        delta = rot_y - last_rot_y
        while delta > math.pi:
            delta -= 2.0 * math.pi
        while delta < -math.pi:
            delta += 2.0 * math.pi
        rot_y = last_rot_y + delta
        assert abs(delta) < math.pi * 0.75
        last_rot_y = rot_y


    def test_apply_camera_euler_and_sync_roundtrip():
        import random
        random.seed(2)
        # pick random rotX(rot pitch) and rotY (yaw) and ensure roundtrip
        for _ in range(200):
            rotX = (random.random() - 0.5) * math.pi * 0.9
            rotY = (random.random() - 0.5) * math.pi * 2.0
            # apply camera euler math to generate forward
            cosPitch = math.cos(rotX)
            sinPitch = math.sin(rotX)
            cosYaw = math.cos(rotY)
            sinYaw = math.sin(rotY)
            forward = (sinYaw * cosPitch, -cosYaw * cosPitch, -sinPitch)
            # compute angles back
            clamped_pitch = max(-1.0, min(1.0, -forward[2]))
            computed_rotX = math.asin(clamped_pitch)
            computed_rotY = math.atan2(forward[0], -forward[1])
            # unwrap computed_rotY to be near original rotY
            delta = computed_rotY - rotY
            while delta > math.pi: delta -= 2.0 * math.pi
            while delta < -math.pi: delta += 2.0 * math.pi
            assert abs(delta) < 1e-6
            assert abs(computed_rotX - rotX) < 1e-6

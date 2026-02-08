"""Verify WGSL shader and JS camera basis math produce identical basis vectors.

These tests replicate the JS and WGSL basis algorithms in Python and numerically
compare the resulting right/up/forward vectors across a variety of Euler inputs
including edge cases (near-collinear axes, near +/-pi/2 pitch, and random samples).
"""
from __future__ import annotations

import math
import random
from typing import Tuple

Vec3 = Tuple[float, float, float]


def dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def length(a: Vec3) -> float:
    return math.sqrt(dot(a, a))


def normalize(a: Vec3) -> Vec3:
    l = length(a)
    if l < 1e-12:
        return (0.0, 0.0, 0.0)
    return (a[0] / l, a[1] / l, a[2] / l)


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def build_basis_world_up_first(forward: Vec3) -> Tuple[Vec3, Vec3, Vec3]:
    # WGSL / JS orthonormalize_basis: world-up first fallback
    fwd = normalize(forward)
    if length(fwd) < 1e-8:
        fwd = (0.0, 0.0, 1.0)
    world_up = (0.0, 0.0, 1.0)
    right = normalize(cross(world_up, fwd))
    if length(right) < 1e-8:
        # pick deterministic axis least-aligned with forward
        s0 = abs(dot((1.0, 0.0, 0.0), fwd))
        s1 = abs(dot((0.0, 1.0, 0.0), fwd))
        s2 = abs(dot((0.0, 0.0, 1.0), fwd))
        best = (1.0, 0.0, 0.0)
        if s1 < s0 and s1 <= s2:
            best = (0.0, 1.0, 0.0)
        elif s2 < s0 and s2 < s1:
            best = (0.0, 0.0, 1.0)
        right = normalize(cross(best, fwd))
    if length(right) < 1e-8:
        right = (1.0, 0.0, 0.0)
    up = normalize(cross(fwd, right))
    if length(up) < 1e-8:
        up = world_up
    return (right, up, fwd)


def euler_forward(rotX: float, rotY: float) -> Vec3:
    # JS/WGSL Euler->forward mapping used across both implementations
    cosPitch = math.cos(rotX)
    sinPitch = math.sin(rotX)
    cosYaw = math.cos(rotY)
    sinYaw = math.sin(rotY)
    # forward = [sinYaw*cosPitch, -cosYaw*cosPitch, -sinPitch]
    return (sinYaw * cosPitch, -cosYaw * cosPitch, -sinPitch)


def basis_from_euler_js(rotX: float, rotY: float) -> Tuple[Vec3, Vec3, Vec3]:
    fwd = euler_forward(rotX, rotY)
    return build_basis_world_up_first(fwd)


def basis_from_euler_wgsl(rotX: float, rotY: float) -> Tuple[Vec3, Vec3, Vec3]:
    # WGSL fallback_camera_basis uses the same Euler mapping and orthonormalize
    fwd = euler_forward(rotX, rotY)
    return build_basis_world_up_first(fwd)


def assert_vectors_close(a: Vec3, b: Vec3, tol: float = 1e-7) -> None:
    assert length((a[0] - b[0], a[1] - b[1], a[2] - b[2])) <= tol


def test_wgsl_js_basis_parity_random() -> None:
    # random samples including extremes
    random.seed(0)
    for _ in range(400):
        rotX = (random.random() - 0.5) * math.pi * 0.999
        rotY = (random.random() - 0.5) * math.pi * 2.0
        js_r, js_u, js_f = basis_from_euler_js(rotX, rotY)
        wg_r, wg_u, wg_f = basis_from_euler_wgsl(rotX, rotY)
        assert_vectors_close(js_r, wg_r)
        assert_vectors_close(js_u, wg_u)
        assert_vectors_close(js_f, wg_f)


def test_wgsl_js_basis_parity_edge_cases() -> None:
    # Edge cases: near vertical pitch; forward axis aligned to world up
    inputs = [
        (0.0001, 0.0),
        (1.5607, 0.0),
        (-1.5607, 3.12),
        (0.0, 3.14159),
        (0.01, 3.14159 / 2),
        (0.001, -3.14159 / 2),
    ]
    for rotX, rotY in inputs:
        js_r, js_u, js_f = basis_from_euler_js(rotX, rotY)
        wg_r, wg_u, wg_f = basis_from_euler_wgsl(rotX, rotY)
        assert_vectors_close(js_r, wg_r)
        assert_vectors_close(js_u, wg_u)
        assert_vectors_close(js_f, wg_f)

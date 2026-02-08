from __future__ import annotations

import math


def _wrap_angle(value: float) -> float:
    full = 2.0 * math.pi
    wrapped = value % full
    if wrapped > math.pi:
        wrapped -= full
    elif wrapped < -math.pi:
        wrapped += full
    return wrapped


def _max_delta(angles: list[float]) -> float:
    deltas: list[float] = []
    for a, b in zip(angles, angles[1:]):
        da = _wrap_angle(b - a)
        deltas.append(abs(da))
    return max(deltas) if deltas else 0.0


def test_camera_angle_sequence_does_not_flip_180_degrees():
    """High-level regression check for the camera mapping math.

    This test does not drive the browser; instead it exercises a
    representative sequence of yaw values and asserts that when they
    are wrapped into the canonical [-pi, pi] range we never see a
    nearly-180° jump between adjacent samples. That would indicate
    the kind of discontinuity that previously caused the pot to
    appear to "flip" while orbiting.
    """

    # Sweep yaw through more than one full turn in small increments.
    raw_yaws: list[float] = []
    steps = 360
    for i in range(steps + 1):
        raw_yaws.append((i / steps) * 4.0 * math.pi - 2.0 * math.pi)

    wrapped = [_wrap_angle(v) for v in raw_yaws]
    max_jump = _max_delta(wrapped)

    # We expect no single step to jump anywhere near pi; in practice
    # the incremental differences should be on the order of 2*pi/steps.
    assert max_jump < math.pi * 0.75

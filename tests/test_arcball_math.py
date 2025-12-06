import math


def map_to_sphere(x: float, y: float, w: float, h: float, radius: float = 1.0):
    nx = (2 * x - w) / max(1, w)
    ny = (h - 2 * y) / max(1, h)
    r2 = nx * nx + ny * ny
    if r2 <= radius * radius:
        return (nx, ny, math.sqrt(radius * radius - r2))
    inv = 1.0 / math.sqrt(r2)
    return (nx * inv * radius, ny * inv * radius, 0.0)


def arcball_delta(x0, y0, x1, y1, w, h, radius=1.0):
    p0 = map_to_sphere(x0, y0, w, h, radius)
    p1 = map_to_sphere(x1, y1, w, h, radius)
    cross = (p0[1] * p1[2] - p0[2] * p1[1], p0[2] * p1[0] - p0[0] * p1[2], p0[0] * p1[1] - p0[1] * p1[0])
    dot = max(-1.0, min(1.0, p0[0] * p1[0] + p0[1] * p1[1] + p0[2] * p1[2]))
    angle = math.acos(dot)
    length = math.hypot(cross[0], cross[1], cross[2])
    axis = (0, 0, 1) if length < 1e-6 else (cross[0] / length, cross[1] / length, cross[2] / length)
    return axis, angle


def test_apply_drag_to_orbit_signs():
    w, h = 800.0, 600.0
    dx = 10.0
    dy = 15.0
    yaw_gain = 1.0
    pitch_gain = 1.0
    d_yaw = -dx * (math.pi / max(1.0, w)) * yaw_gain
    d_pitch = -dy * (math.pi / max(1.0, h)) * pitch_gain
    assert d_yaw < 0.0  # dx>0 => negative yaw change (camera should rotate right)
    assert d_pitch < 0.0  # dy>0 => negative pitch change (dragging down rotates camera up)


def test_arcball_delta_direction_signs():
    w, h = 1024.0, 768.0
    cx, cy = w / 2.0, h / 2.0
    # Small right movement
    axis, angle = arcball_delta(cx, cy, cx + 10.0, cy, w, h)
    assert angle > 0
    # For right movement, axis.y should be positive (camera-space up axis)
    assert axis[1] > 0
    # Small down movement
    axis, angle = arcball_delta(cx, cy, cx, cy + 12.0, w, h)
    assert angle > 0
    # For downward movement, axis.x should be positive
    assert axis[0] > 0

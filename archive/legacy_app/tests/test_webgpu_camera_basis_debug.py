from __future__ import annotations

import math


def _is_orthonormal(v: tuple[float, float, float],
                    r: tuple[float, float, float],
                    u: tuple[float, float, float],
                    eps: float = 1e-4) -> bool:
    def dot(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    def length(a: tuple[float, float, float]) -> float:
        return math.sqrt(dot(a, a))

    return (
        abs(length(v) - 1.0) < eps
        and abs(length(r) - 1.0) < eps
        and abs(length(u) - 1.0) < eps
        and abs(dot(v, r)) < eps
        and abs(dot(v, u)) < eps
        and abs(dot(r, u)) < eps
    )


def test_world_up_first_basis_math():
    """Sanity-check that our WORLD_UP-first strategy is mathematically sound.

    This does not reach into the browser; it mirrors the TypeScript logic
    in Python so changes to the TS implementation can be regression-checked
    quickly without Playwright.
    """

    world_up = (0.0, 0.0, 1.0)

    def build_basis(forward: tuple[float, float, float]) -> tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]:
        fx, fy, fz = forward
        fl = math.sqrt(fx * fx + fy * fy + fz * fz) or 1.0
        f = (fx / fl, fy / fl, fz / fl)
        # right = normalize(cross(WORLD_UP, forward))
        rx = world_up[1] * f[2] - world_up[2] * f[1]
        ry = world_up[2] * f[0] - world_up[0] * f[2]
        rz = world_up[0] * f[1] - world_up[1] * f[0]
        rl = math.sqrt(rx * rx + ry * ry + rz * rz)
        if rl < 1e-6:
            # Fallback axis: mirror TS convention
            fb = (1.0, 0.0, 0.0) if abs(f[0]) < 0.9 else (0.0, 1.0, 0.0)
            rx = fb[1] * f[2] - fb[2] * f[1]
            ry = fb[2] * f[0] - fb[0] * f[2]
            rz = fb[0] * f[1] - fb[1] * f[0]
            rl = math.sqrt(rx * rx + ry * ry + rz * rz) or 1.0
        r = (rx / rl, ry / rl, rz / rl)
        # up = normalize(cross(forward, right))
        ux = f[1] * r[2] - f[2] * r[1]
        uy = f[2] * r[0] - f[0] * r[2]
        uz = f[0] * r[1] - f[1] * r[0]
        ul = math.sqrt(ux * ux + uy * uy + uz * uz) or 1.0
        u = (ux / ul, uy / ul, uz / ul)
        return f, r, u

    # Typical forward: looking down -Y from in front of the pot.
    f1, r1, u1 = build_basis((0.0, -1.0, -0.2))
    assert _is_orthonormal(f1, r1, u1)

    # Nearly aligned with world-up: should still produce a sane right/up.
    f2, r2, u2 = build_basis((0.0, 0.0, 1.0))
    assert _is_orthonormal(f2, r2, u2)

    # Oblique direction: no 180-deg ambiguity, still orthonormal.
    f3, r3, u3 = build_basis((0.3, -0.7, 0.5))
    assert _is_orthonormal(f3, r3, u3)

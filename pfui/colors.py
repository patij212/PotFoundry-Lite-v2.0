"""Color and lighting helper utilities for PotFoundry UI.

This module centralizes color palette resolution and gradient mapping logic so it can
be unit‑tested independent of the Streamlit app.
"""

from __future__ import annotations
from typing import List, Optional, Sequence, Tuple, Union, TYPE_CHECKING

if TYPE_CHECKING:
    # numpy typing for static tools only; runtime import is lazy inside functions
    import numpy as np
    import numpy.typing as npt

DEFAULT_CUSTOM_COLORS = ("#2850D0", "#5FA8FF", "#E2F3FF")

# Preset name -> (c1, c2, c3) RGB tuples
_PRESETS = {
    "Classic Blue": ((40, 80, 208), (95, 168, 255), (226, 243, 255)),
    "Warm Sunset": ((255, 110, 64), (255, 166, 90), (255, 235, 160)),
    "Forest": ((30, 90, 40), (70, 140, 80), (200, 230, 200)),
    "Mono Height": ((60, 60, 60), (150, 150, 150), (235, 235, 235)),
}


def hex_to_rgb_tuple(h: str) -> Tuple[int, int, int]:
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    if len(h) != 6:
        return (128, 128, 128)
    try:
        r = int(h[0:2], 16)
        g = int(h[2:4], 16)
        b = int(h[4:6], 16)
        return (r, g, b)
    except Exception:
        return (128, 128, 128)


def interpolate_rgb(
    a: Tuple[int, int, int], b: Tuple[int, int, int], t: float
) -> Tuple[int, int, int]:
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return (
        int(a[0] + (b[0] - a[0]) * t),
        int(a[1] + (b[1] - a[1]) * t),
        int(a[2] + (b[2] - a[2]) * t),
    )


def resolve_palette(
    preset: Optional[str], custom_colors: Optional[Sequence[str]] = None
) -> Tuple[Tuple[int, int, int], Tuple[int, int, int], Tuple[int, int, int]]:
    if preset and preset in _PRESETS:
        return _PRESETS[preset]
    # Fallback to custom or defaults
    if custom_colors and len(custom_colors) >= 3:
        # Build explicit tuples to keep types clear for static checkers
        palette = tuple(hex_to_rgb_tuple(c) for c in custom_colors[:3])
        c1, c2, c3 = palette
        return c1, c2, c3
    d1, d2, d3 = DEFAULT_CUSTOM_COLORS
    return (hex_to_rgb_tuple(d1), hex_to_rgb_tuple(d2), hex_to_rgb_tuple(d3))


def build_gradient_colors(
    z_norm: Optional[Union[Sequence[float], "npt.NDArray[np.float64]"]],
    preset: Optional[str],
    custom_colors: Optional[Sequence[str]] = None,
) -> List[List[int]]:
    """Piecewise 3‑point gradient mapping.

    z_norm: 1D iterable/array of values assumed in [0,1].
    Returns list of [r,g,b].
    """
    # Keep numpy imports local to avoid import-time heavy dependency resolution.
    try:
        import numpy as np  # noqa: F401
    except Exception:  # pragma: no cover
        return [[200, 200, 230] for _ in (z_norm or [])]
    if z_norm is None:
        return []
    c1, c2, c3 = resolve_palette(preset, custom_colors)
    out: List[List[int]] = []
    for zn in z_norm:
        if zn <= 0.5:
            t = 0.0 if zn <= 0 else zn / 0.5
            r, g, b = interpolate_rgb(c1, c2, t)
        else:
            t = (zn - 0.5) / 0.5
            r, g, b = interpolate_rgb(c2, c3, t)
        out.append([r, g, b])
    return out


__all__ = [
    "hex_to_rgb_tuple",
    "interpolate_rgb",
    "resolve_palette",
    "build_gradient_colors",
]

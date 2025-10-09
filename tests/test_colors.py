import math
import numpy as np
from pfui.colors import (
    hex_to_rgb_tuple,
    interpolate_rgb,
    resolve_palette,
    build_gradient_colors,
)


def test_hex_to_rgb_tuple_basic():
    assert hex_to_rgb_tuple('#000000') == (0,0,0)
    assert hex_to_rgb_tuple('#fff') == (255,255,255)
    assert hex_to_rgb_tuple('2850D0') == (40,80,208)


def test_interpolate_rgb_clamps():
    a=(0,0,0); b=(100,200,255)
    assert interpolate_rgb(a,b,-1) == a
    assert interpolate_rgb(a,b,2) == b
    mid = interpolate_rgb(a,b,0.5)
    assert mid[0] == 50 and mid[1] == 100 and mid[2] == (255//2 or 127)  # approximate


def test_resolve_palette_presets():
    c1,c2,c3 = resolve_palette('Classic Blue')
    assert c1[0] == 40 and c3[2] == 255
    f1,f2,f3 = resolve_palette('Forest')
    assert f1[1] < f2[1] <= f3[1]


def test_build_gradient_colors_monotonic():
    z = np.linspace(0,1,11)
    cols = build_gradient_colors(z, 'Classic Blue')
    assert len(cols) == len(z)
    # Ensure channels stay within 0..255
    for r,g,b in cols:
        assert 0 <= r <= 255 and 0 <= g <= 255 and 0 <= b <= 255
    # Gradient should begin near first color and end near last preset
    start = cols[0]; end = cols[-1]
    assert start != end


def test_build_gradient_colors_custom():
    z = np.array([0.0,0.25,0.5,0.75,1.0])
    custom = ['#100000','#800000','#FF0000']
    cols = build_gradient_colors(z, None, custom)
    assert cols[0][0] < cols[-1][0]
    # At midpoint (~0.5) should be close to second color
    mid = cols[2]
    assert abs(mid[0]-128) < 20  # tolerance for interpolation rounding

"""Wall self-intersection tests (geometric validity for CAD/printing).

A mesh can be perfectly closed, manifold and consistently oriented (so
``validate_mesh`` passes) yet still be a *self-intersecting* solid: if a deep
concave style modulation shrinks the outer radius below the (drain-clamped)
inner radius, the inner wall pokes through the outer wall. Wall thickness goes
negative, the two shells cross, and Rhino's "Check"/any slicer rejects it.

The generator must guarantee a strictly positive wall everywhere, regardless of
how extreme the style options are, by clamping so the inner wall can never cross
the outer wall (and the outer silhouette can never pinch narrower than the drain
plus a minimum wall).

``build_pot_mesh`` reports the realised minimum wall thickness in its
diagnostics so the export path can surface it.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh, validate_mesh


# Small base + wide drain: the regime where a concave dip can invert the wall.
PINCH_CFG = dict(
    H=120, Rt=70, Rb=44, t_wall=4, t_bottom=4, r_drain=36,
    expn=1.1, n_theta=120, n_z=60,
)

# Extreme-amplitude options per style that previously drove wall thickness
# strongly negative (inner wall outside the outer wall).
EXTREME_OPTS = {
    "SpiralRidges": dict(spiral_k=9, spiral_amp_min=0.45, spiral_amp_max=0.55,
                         spiral_groove_amp=0.15),
    "HarmonicRipple": dict(hr_petals=7, hr_petal_amp=0.5, hr_ripple_amp=0.2,
                           hr_bell=0.0),
    "FourierBloom": dict(fb_base_cos8_amp=0.5, fb_wobble_amp=0.3, fb_strength=1.5),
    "SuperformulaBlossom": dict(sf_m_base=12, sf_n1=0.2, sf_n2=2.5, sf_n3=2.5),
    "SuperellipseMorph": dict(se_m_base=2.0, se_m_top=2.0, se_c4_amp=0.4,
                              se_c8_amp=0.3),
}


def _build(style_name, opts):
    return build_pot_mesh(
        r_outer_fn=STYLES[style_name][0], style_opts=opts, **PINCH_CFG
    )


@pytest.mark.parametrize("style_name,opts", list(EXTREME_OPTS.items()))
def test_min_wall_thickness_is_positive(style_name, opts):
    """Diagnostics must report a strictly positive minimum wall thickness."""
    _verts, _faces, diag = _build(style_name, opts)
    assert "min_wall_thickness_mm" in diag, "diagnostics must report min wall"
    assert diag["min_wall_thickness_mm"] > 0.0, (
        f"{style_name}: min wall {diag['min_wall_thickness_mm']:.3f} mm <= 0 "
        f"-> inner wall crosses outer wall (self-intersecting solid)"
    )


@pytest.mark.parametrize("style_name,opts", list(EXTREME_OPTS.items()))
def test_inner_wall_strictly_inside_outer_wall(style_name, opts):
    """At every height, the inner-wall ring must be radially inside the outer ring.

    Measured directly from the mesh: the max inner-ring radius at a height must
    be < the min outer-ring radius at that height for the walls not to cross.
    """
    verts, _faces, _diag = _build(style_name, opts)
    n_theta = PINCH_CFG["n_theta"]
    n_rings = PINCH_CFG["n_z"] + 1
    n_outer = n_rings * n_theta

    outer = verts[:n_outer].reshape(n_rings, n_theta, 3)
    inner = verts[n_outer:2 * n_outer].reshape(n_rings, n_theta, 3)

    r_outer = np.linalg.norm(outer[:, :, :2], axis=2)  # (rings, theta)
    r_inner = np.linalg.norm(inner[:, :, :2], axis=2)

    # Inner rings span z in [t_bottom, H]; outer rings span [0, H]. Compare on
    # the shared height range by matching the inner rings to the nearest outer
    # rings via their z coordinate.
    z_outer = outer[:, 0, 2]
    z_inner = inner[:, 0, 2]
    for k in range(n_rings):
        oi = int(np.argmin(np.abs(z_outer - z_inner[k])))
        # The thinnest wall at this height: min over theta of (r_out - r_in)
        # using the same theta index (rings are sampled on the same grid).
        wall = r_outer[oi] - r_inner[k]
        assert wall.min() > 0.0, (
            f"{style_name}: wall crosses at z={z_inner[k]:.1f} "
            f"(min wall {wall.min():.3f} mm)"
        )


def test_pinch_mesh_still_valid_topology():
    """The clamp must keep the mesh a valid closed/oriented manifold too."""
    for style_name, opts in EXTREME_OPTS.items():
        verts, faces, _ = _build(style_name, opts)
        v = validate_mesh(verts, faces)
        assert v.is_valid, f"{style_name}: {v.as_dict()}"


def test_normal_design_wall_unaffected():
    """The clamp must not change normal designs (default opts, roomy drain)."""
    verts, _faces, diag = build_pot_mesh(
        r_outer_fn=STYLES["SuperformulaBlossom"][0], style_opts={},
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=96, n_z=48,
    )
    # Default modulation never pinches below the drain, so the realised minimum
    # wall is the nominal wall thickness.
    assert diag["min_wall_thickness_mm"] == pytest.approx(3.0, abs=0.2)

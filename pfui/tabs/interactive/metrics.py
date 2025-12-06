"""Metrics display module for Interactive Designer tab.

Handles rendering of mesh statistics and diagnostics.
"""
from __future__ import annotations

from typing import Any, cast

from pfui._st import get_effective_st as get_st
from pfui.imports import build_pot_mesh
from potfoundry.types import StyleOpts


def render_metrics_section(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Any,
    opts: StyleOpts,
) -> None:
    """Render estimated metrics section.
    
    Displays mesh statistics including triangle count, top/bottom OD,
    and debug information if enabled.
    
    Args:
        H: Total height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        t_wall: Wall thickness in mm
        t_bottom: Bottom thickness in mm
        r_drain: Drain radius in mm
        expn: Expansion exponent
        n_theta: Angular resolution
        n_z: Vertical resolution
        r_outer_fn: Outer radius style function
        opts: Style options dictionary

    """
    st = get_st()
    st.subheader("Estimated metrics")
    try:
        _, faces_m, diag_m = cast(
            "tuple[Any, Any, Any]",
            build_pot_mesh(
                H=H,
                Rt=Rt,
                Rb=Rb,
                t_wall=t_wall,
                t_bottom=t_bottom,
                r_drain=r_drain,
                expn=expn,
                n_theta=max(48, n_theta // 2),
                n_z=max(24, n_z // 2),
                r_outer_fn=r_outer_fn,
                style_opts=opts,
            ),
        )
        m1, m2, m3 = st.columns(3)
        m1.metric("Triangles", f"{len(faces_m):,}")
        # diag_m may be either a dict of diagnostics or another type returned
        # by the geometry engine in some code paths; guard access with
        # isinstance so mypy knows we're only calling .get on a dict.
        if isinstance(diag_m, dict):
            top_od_val = diag_m.get("estimated_top_od_mm", 0)
            bottom_od_val = diag_m.get("estimated_bottom_od_mm", 0)
        else:
            top_od_val = 0
            bottom_od_val = 0
        m2.metric("Top OD (mm)", f"{top_od_val:.1f}")
        m3.metric("Bottom OD (mm)", f"{bottom_od_val:.1f}")
        # Seam debug samples panel: show readout when user enabled lp_debug_seam
        try:
            if (
                opts.get("lp_debug_seam", False)
                and isinstance(diag_m, dict)
                and "seam_debug_samples" in diag_m
            ):
                with st.expander("Seam debug samples (lp_debug_seam"):
                    groups = diag_m.get("seam_debug_samples", [])
                    for gi, group in enumerate(groups):
                        st.markdown(f"**Group {gi + 1}**")
                        for samp in group:
                            try:
                                theta_mid, zc, r_base_mid, Rstart_mid = samp
                                delta = r_base_mid - Rstart_mid
                                st.write(
                                    f"θ_mid={theta_mid:.3f}, z={zc:.3f}, r_base={r_base_mid:.3f}, R_start={Rstart_mid:.3f}, delta={delta:.6f}",
                                )
                            except Exception:
                                st.write(repr(samp))
        except Exception:
            pass
    except Exception:
        st.info("Metrics unavailable for this configuration.")

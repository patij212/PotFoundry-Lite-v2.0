"""Common lightweight type aliases for PotFoundry.

This module provides a single NDArray alias for NumPy float64 arrays used
across the codebase. Adding a centralized alias makes incremental typing
of geometry functions safer and clearer.
"""

from __future__ import annotations

from typing import TypeAlias

import numpy as np
import numpy.typing as npt

NDArrayFloat: TypeAlias = npt.NDArray[np.float64]


# Lightweight TypedDict for common style/options passed through the UI and
# YAML presets. This is intentionally conservative: fields are NotRequired and
# limited to commonly-accessed keys so we can incrementally tighten typing in
# large geometry functions without changing runtime behavior.
from typing import TypedDict


class StyleOpts(TypedDict, total=False):
    # Low-poly facet (lp_) options
    lp_facets: int
    lp_tiers: int
    lp_amp: float
    lp_facet_dir: str
    lp_bevel: float
    lp_jitter: float
    lp_phase_deg: float
    lp_cut_bot_deg: float
    lp_cut_top_deg: float
    lp_cut_z_window_frac: float
    lp_seam_sampling_boost: int
    lp_outward_mode: bool
    lp_cut_depth_frac_of_facet: float
    lp_edge_cut_mm: float
    lp_edge_cut_sharp: float
    lp_enable_flattening: bool
    lp_disable_straight_flattening: bool
    lp_print_safe_mode: bool
    lp_uniform_ring: bool
    lp_cut_straight_edges: bool
    lp_cut_cap_mm: float
    lp_cut_softness_mm: float
    lp_debug_seam: bool

    # Superformula (sf_) and general style options
    sf_style: str
    sf_strength: float
    sf_m_base: float
    sf_m_top: float
    sf_m_curve_exp: float
    sf_n1: float
    sf_n1_top: float
    sf_n2: float
    sf_n2_top: float
    sf_n3: float
    sf_n3_top: float
    sf_a: float
    sf_b: float

    # Edge-solidify / tame options
    sf_edge_solidify_enable: bool
    sf_edge_solidify_strength: float
    sf_edge_solidify_passes: int
    sf_edge_solidify_sigma_s: float
    sf_edge_solidify_sigma_r: float
    sf_edge_solidify_micro_thresh: float
    sf_edge_solidify_protect_grad: float
    sf_edge_solidify_preserve_q: float
    sf_edge_tame_strength: float

    # Edge-flow / diagnostics knobs commonly used by tooling and UI
    sf_edge_flow_reconstruct_enable: bool
    sf_edge_flow_debug: bool
    sf_edge_flow_mode: str
    sf_edge_flow_verbose_diagnostics: bool
    sf_edge_flow_verbose_write_file: bool
    sf_edge_flow_probe: bool
    sf_edge_flow_probe_zi: int
    sf_edge_flow_valley_z_halfwin: int
    sf_edge_flow_valley_band_cols: int
    sf_edge_flow_valley_band_decay: float
    sf_edge_flow_valley_lock_enable: bool
    sf_edge_flow_quantile: float
    sf_edge_flow_amount: float
    sf_edge_flow_peak_q: float
    sf_edge_flow_max_paths: int
    sf_edge_flow_slopes_max: int
    sf_edge_flow_twist_compensate: bool
    sf_edge_flow_theta_snap: int
    sf_edge_flow_window: int
    sf_edge_flow_paths_band: int
    sf_edge_flow_seam_sample_stride: int
    sf_edge_flow_mode_options: str
    sf_edge_flow_auto_deoffset: bool
    sf_edge_flow_deoffset_max: int
    sf_edge_flow_drain_protect_thresh: float
    sf_edge_flow_pin_to_origin: bool
    sf_edge_flow_anchor_enable: bool
    sf_edge_flow_anchor_radius: int

    # Generic mesh / plumbing options
    t_wall: float
    t_bottom: float
    r_drain: float
    twist: float
    spin_turns: float
    spin_phase_deg: float
    spin_curve_exp: float
    flare_center: float
    flare_sharp: float
    bell_amp: float
    bell_center: float
    bell_width: float

    # Add other commonly used knobs here as needed in subsequent PRs.

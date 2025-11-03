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
    lp_tiers: int
    lp_cut_bot_deg: float
    lp_cut_top_deg: float
    lp_enable_flattening: bool
    lp_facet_dir: str
    lp_debug_seam: bool
    lp_edge_solidify_enable: bool
    sf_edge_flow_reconstruct_enable: bool
    sf_edge_flow_debug: bool
    sf_edge_flow_mode: str
    # Add other commonly used knobs here as needed in subsequent PRs.

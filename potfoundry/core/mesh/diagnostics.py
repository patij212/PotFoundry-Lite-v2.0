"""Mesh diagnostics and quality metrics for pot geometry.

This module handles:
- Clamp ratio calculation (how much of inner wall was clamped due to drain)
- Outer diameter estimation for top and bottom
- Seam debugging information
- Edge flow metrics collection

These diagnostics help validate mesh quality and identify potential issues.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt


__all__ = [
    "calculate_mesh_diagnostics",
]


def calculate_mesh_diagnostics(
    *,
    verts: list[tuple[float, float, float]],
    outer_idx: npt.NDArray[np.int64],
    est_top_od: float | None,
    est_bottom_od: float | None,
    clamp_count: int,
    total_inner_samples: int,
    dbg_outward_picks: int,
    dbg_total_picks: int,
    dbg_samples_collected: list,
    edgeflow_verbose_collector: list | None = None,
) -> dict[str, Any]:
    """Calculate mesh quality diagnostics and metrics.
    
    Computes various diagnostic metrics about the generated mesh:
    - Clamp ratio: fraction of inner wall vertices clamped near drain
    - Estimated outer diameters at top and bottom
    - Seam debugging info (if available)
    - Edge flow verbose data (if collected)
    
    Args:
        verts: List of all mesh vertices
        outer_idx: Index array for outer wall vertices
        est_top_od: Estimated top outer diameter (or None to compute)
        est_bottom_od: Estimated bottom outer diameter (or None to compute)
        clamp_count: Number of inner wall vertices clamped
        total_inner_samples: Total number of inner wall samples
        dbg_outward_picks: Debug counter for outward samples
        dbg_total_picks: Debug counter for total samples
        dbg_samples_collected: Debug samples from style
        edgeflow_verbose_collector: Optional edge flow verbose data
        
    Returns:
        Dictionary of diagnostic metrics
    """
    # Diagnostics (use tracked radii; fall back to scan if missing)
    outer_top = outer_idx[-1]
    outer_bottom = outer_idx[0]
    
    if est_top_od is None:
        pts = np.array([verts[k] for k in outer_top], dtype=float)
        est_top_od = 2.0 * float(np.linalg.norm(pts[:, :2], axis=1).max())
    if est_bottom_od is None:
        pts = np.array([verts[k] for k in outer_bottom], dtype=float)
        est_bottom_od = 2.0 * float(np.linalg.norm(pts[:, :2], axis=1).max())
    
    clamp_ratio = clamp_count / max(1, total_inner_samples)

    diagnostics: dict[str, Any] = dict(
        clamp_ratio_at_bottom=float(clamp_ratio),
        estimated_top_od_mm=float(est_top_od),
        estimated_bottom_od_mm=float(est_bottom_od),
    )
    
    # Seam diagnostics (safe guards: only emit when data was collected)
    if dbg_total_picks > 0:
        diagnostics["seam_outward_ratio"] = float(dbg_outward_picks / dbg_total_picks)
    if len(dbg_samples_collected) > 0:
        # Flatten and present a concise readout: list of sample groups
        diagnostics["seam_debug_samples"] = dbg_samples_collected
    
    # If the edge-flow in-memory collector exists and has content, attach it
    if edgeflow_verbose_collector is not None and len(edgeflow_verbose_collector) > 0:
        diagnostics["edgeflow_verbose"] = edgeflow_verbose_collector
    
    return diagnostics

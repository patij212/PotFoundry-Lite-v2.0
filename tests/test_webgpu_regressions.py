"""Regression tests for the WebGPU preview stack."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from pfui.tabs.interactive.preview_impl import _estimate_scene_bounds

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _load_wgsl() -> str:
    return (PROJECT_ROOT / "pfui" / "preview" / "assets" / "pot_preview.wgsl").read_text(encoding="utf-8")


def test_wgsl_r_base_uses_full_radius() -> None:
    """r_base should feed Rt/Rb directly (no unintended extra 0.5 scale)."""
    wgsl = _load_wgsl()
    snippet_start = wgsl.find("fn r_base")
    assert snippet_start >= 0, "r_base function missing from WGSL shader"
    snippet = wgsl[snippet_start : snippet_start + 200]
    assert "return max(m, 0.5);" in snippet, "r_base must clamp radius instead of halving it"
    assert "* 0.5" not in snippet, "Radius halving regression detected in WGSL shader"


def test_estimate_scene_bounds_respects_vertices() -> None:
    """Scene radius/padding should expand to fit vertices and remain >= min padding."""
    # Build a simple cylindrical shell with radius=80, height=200.
    angles = np.linspace(0.0, 2.0 * np.pi, num=32, endpoint=False)
    zs = np.linspace(-100.0, 100.0, num=4)
    verts = np.array(
        [[80.0 * np.cos(a), 80.0 * np.sin(a), z] for a in angles for z in zs],
        dtype=np.float64,
    )

    radius, padding = _estimate_scene_bounds(verts, fallback_radius=25.0, min_padding=1.05)

    assert radius >= 80.0
    assert padding >= 1.05
    assert padding <= 1.4

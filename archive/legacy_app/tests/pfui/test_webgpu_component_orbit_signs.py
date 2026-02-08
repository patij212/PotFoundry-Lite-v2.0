"""Static checks verify orbit sign handling and commit flip detection are present.

These tests search for the textual presence of the expected sign mapping
and the basis-flip threshold usage in the component source.
"""
from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
COMP_CORE = PROJECT_ROOT / "pfui" / "components" / "webgpu_component" / "frontend" / "src" / "webgpu_core.ts"


def test_invert_orbit_signs_present() -> None:
    src = COMP_CORE.read_text(encoding="utf-8")
    # The applyDragToOrbit uses invertOrbitX/Y to pick +1/-1 multipliers
    assert "invertOrbitX ? +1 : -1" in src
    assert "invertOrbitY ? +1 : -1" in src


def test_commit_flip_detection_present() -> None:
    src = COMP_CORE.read_text(encoding="utf-8")
    # commitDisplayBasisToState should check prior right vector and flip using the threshold
    assert "BASIS_FLIP_DOT_THRESHOLD" in src
    assert "vec3Dot(prevRight, state.displayCamRight)" in src or "vec3Dot(prevRight, state.displayCamRight)" in src

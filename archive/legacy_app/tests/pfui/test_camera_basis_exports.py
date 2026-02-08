"""Ensure arcball math is centralized in camera_basis and imported.

These tests are static checks that look for the exported symbol and
correct import usage in the preview and component source files.
"""
from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CAM_BASIS = PROJECT_ROOT / "pfui" / "components" / "webgpu_component" / "frontend" / "src" / "camera_basis.ts"
COMP_CORE = PROJECT_ROOT / "pfui" / "components" / "webgpu_component" / "frontend" / "src" / "webgpu_core.ts"
PREVIEW = PROJECT_ROOT / "pfui" / "preview" / "assets" / "webgpu_preview.ts"


def test_arcball_exported_in_camera_basis() -> None:
    src = CAM_BASIS.read_text(encoding="utf-8")
    assert "export const arcballDelta" in src


def test_component_and_preview_import_shared_arcball() -> None:
    core = COMP_CORE.read_text(encoding="utf-8")
    preview = PREVIEW.read_text(encoding="utf-8")
    # Expect the helper to be imported/aliased in both files
    assert "arcballDelta as sharedArcballDelta" in core
    assert "arcballDelta as sharedArcballDelta" in preview


def test_camera_axis_helper_used_for_arcball() -> None:
    core = COMP_CORE.read_text(encoding="utf-8")
    preview = PREVIEW.read_text(encoding="utf-8")
    src = CAM_BASIS.read_text(encoding="utf-8")
    assert "export const cameraAxisToWorld" in src
    assert "cameraAxisToWorld as cbCameraAxisToWorld" in core
    assert "cameraAxisToWorld as sharedCameraAxisToWorld" in preview

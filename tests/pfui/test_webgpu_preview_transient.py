"""Static checks for preview transient display-basis logic.

This file contains static tests that assert that the preview's TypeScript
bundle includes the transient display-basis helpers implemented to mirror
the component behavior. These tests do not run browser UI interactions,
they ensure the preview source contains the key functions and symbols.
"""
from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WGSL_SRC = PROJECT_ROOT / "pfui" / "preview" / "assets" / "webgpu_preview.ts"


def test_preview_contains_transient_basis_helpers() -> None:
    """Ensure the preview includes key transient-basis helpers and fields.

    These checks are intentionally static (text checks) because the preview
    TS is compiled by the build pipeline; a richer integration test can be
    added later using Playwright when headless WebGPU is available.
    """
    src = WGSL_SRC.read_text(encoding="utf-8")
    assert "displayCamForward" in src
    assert "displayCamUp" in src
    assert "displayCamRight" in src
    assert "resolveActiveBasis(" in src
    assert "commitDisplayBasisToState(" in src
    assert "applyCameraEuler(" in src
    # Ensure camera emit scheduling avoids broadcasting Euler while display basis present
    assert "if (!force && hasDisplay)" in src or "pendingStaticCameraEmit" in src
    # Emission scheduling & static commit helpers
    assert "pendingStaticCameraEmit" in src
    assert "requestCameraEmitWhenStatic(" in src
    assert "scheduleCameraEmit(" in src
    assert "isCameraStatic(" in src

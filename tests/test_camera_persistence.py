"""Tests for camera persistence feature.

Verifies that camera angles persist across preview regenerations.
"""

from __future__ import annotations

from typing import Any

import pytest


def test_get_default_camera():
    """Test default camera configuration."""
    from pfui.tabs.interactive.preview.camera_capture import get_default_camera

    camera = get_default_camera()

    assert "eye" in camera
    assert "center" in camera
    assert "up" in camera
    assert "projection" in camera

    # Verify structure
    assert camera["eye"]["x"] == 1.25
    assert camera["eye"]["y"] == 1.25
    assert camera["eye"]["z"] == 1.0

    assert camera["center"]["x"] == 0
    assert camera["center"]["y"] == 0
    assert camera["center"]["z"] == 0

    assert camera["up"]["x"] == 0
    assert camera["up"]["y"] == 0
    assert camera["up"]["z"] == 1

    assert camera["projection"]["type"] == "orthographic"


def test_apply_camera_to_scene_with_persisted():
    """Test applying persisted camera to scene config."""
    from pfui.tabs.interactive.preview.camera_capture import apply_camera_to_scene

    # Mock session state with persisted camera
    session_state: dict[str, Any] = {
        "_preview_camera": {
            "eye": {"x": 2.0, "y": 2.0, "z": 1.5},
            "center": {"x": 0, "y": 0, "z": 0.5},
            "up": {"x": 0, "y": 0, "z": 1},
        },
    }

    scene_config = {
        "xaxis": {"visible": False},
        "yaxis": {"visible": False},
    }

    result = apply_camera_to_scene(scene_config, session_state)

    assert "camera" in result
    assert result["camera"]["eye"]["x"] == 2.0
    assert result["camera"]["eye"]["y"] == 2.0
    assert result["camera"]["eye"]["z"] == 1.5


def test_apply_camera_to_scene_without_persisted():
    """Test applying default camera when no persisted camera exists."""
    from pfui.tabs.interactive.preview.camera_capture import apply_camera_to_scene

    # Empty session state
    session_state: dict[str, Any] = {}

    scene_config = {
        "xaxis": {"visible": False},
        "yaxis": {"visible": False},
    }

    result = apply_camera_to_scene(scene_config, session_state)

    assert "camera" in result
    # Should use default camera
    assert result["camera"]["eye"]["x"] == 1.25
    assert result["camera"]["eye"]["y"] == 1.25


def test_state_get_set_preview_camera():
    """Test state module camera helpers."""
    from pfui.state import get_preview_camera, set_preview_camera

    # Need to mock streamlit session_state
    try:
        import streamlit as st

        # Clear any existing camera
        st.session_state["_preview_camera"] = None

        # Initially None
        assert get_preview_camera() is None

        # Set a camera
        test_camera: dict[str, Any] = {
            "eye": {"x": 1.0, "y": 1.0, "z": 1.0},
            "center": {"x": 0, "y": 0, "z": 0},
        }
        set_preview_camera(test_camera)

        # Retrieve it
        retrieved = get_preview_camera()
        assert retrieved is not None
        assert retrieved["eye"]["x"] == 1.0

        # Clear it
        set_preview_camera(None)
        assert get_preview_camera() is None

    except ImportError:
        pytest.skip("Streamlit not available")


def test_camera_persists_across_style_change():
    """Test that camera angle persists when pot style changes."""
    # This is an integration test concept - would need full Streamlit context
    pytest.skip("Integration test - requires full Streamlit app context")


def test_camera_persists_across_dimension_change():
    """Test that camera angle persists when pot dimensions change."""
    # This is an integration test concept - would need full Streamlit context
    pytest.skip("Integration test - requires full Streamlit app context")

from __future__ import annotations

from pfui.app_components.appearance import ensure_appearance_defaults


def test_ensure_appearance_defaults_populates_expected_keys():
    # Arrange: empty session-like mapping
    ss: dict[str, object] = {}

    # Act
    ensure_appearance_defaults(ss)

    # Assert: a representative set of keys and exact default values
    expected = {
        "preview_color_mode": "gradient-3",
        "preview_grad_c1": "#2850D0",
        "preview_grad_c2": "#5FA8FF",
        "preview_grad_c3": "#E2F3FF",
        "preview_palette": "Custom",
        "mesh_ambient": 0.50,
        "mesh_diffuse": 1.00,
        "mesh_specular": 0.40,
        "mesh_roughness": 0.45,
        "mesh_fresnel": 0.25,
        "preview_bg_color": "#0F1724",
        "use_gradient_color": True,
        "solid_color": "#BFC7D5",
        "mesh_flatshading": False,
        "preview_res_scale": 1.0,
        "exact_full_preview": True,
        "manual_full_res": True,
        "preview_dpi": 110,
    }

    for k, v in expected.items():
        assert k in ss, f"missing key: {k}"
        assert ss[k] == v, f"default mismatch for {k}: {ss[k]!r} != {v!r}"

    # Idempotent: calling again should not change values
    before = ss.copy()
    ensure_appearance_defaults(ss)
    assert ss == before

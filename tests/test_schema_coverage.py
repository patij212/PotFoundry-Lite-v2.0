"""
Comprehensive tests for potfoundry/schema.py to improve coverage.

This test file focuses on:
1. Validation rules for all Pydantic models
2. Edge cases and boundary conditions
3. Error handling for invalid configurations
4. Deep merge functionality
5. Migration helpers
"""

import pytest
from pydantic import ValidationError
from potfoundry.schema import (
    MeshQualityModel,
    DefaultsModel,
    PartialDefaultsModel,
    RecipeModel,
    PresetModel,
    ConfigV2,
    deep_merge,
    _coerce_partial_defaults,
)


class TestMeshQualityModel:
    """Test MeshQualityModel validation."""

    def test_mesh_quality_defaults(self):
        """Test default values for mesh quality."""
        mesh = MeshQualityModel()
        assert mesh.n_theta == 168
        assert mesh.n_z == 84

    def test_mesh_quality_custom_values(self):
        """Test custom mesh quality values."""
        mesh = MeshQualityModel(n_theta=200, n_z=100)
        assert mesh.n_theta == 200
        assert mesh.n_z == 100

    def test_mesh_quality_minimum_values(self):
        """Test minimum allowed values."""
        mesh = MeshQualityModel(n_theta=32, n_z=16)
        assert mesh.n_theta == 32
        assert mesh.n_z == 16

    def test_mesh_quality_maximum_values(self):
        """Test maximum allowed values."""
        mesh = MeshQualityModel(n_theta=4096, n_z=4096)
        assert mesh.n_theta == 4096
        assert mesh.n_z == 4096

    def test_mesh_quality_rejects_too_low_theta(self):
        """Test that n_theta below minimum is rejected."""
        with pytest.raises(ValidationError, match="greater than or equal to 32"):
            MeshQualityModel(n_theta=16)

    def test_mesh_quality_rejects_too_high_theta(self):
        """Test that n_theta above maximum is rejected."""
        with pytest.raises(ValidationError, match="less than or equal to 4096"):
            MeshQualityModel(n_theta=5000)

    def test_mesh_quality_rejects_too_low_z(self):
        """Test that n_z below minimum is rejected."""
        with pytest.raises(ValidationError, match="greater than or equal to 16"):
            MeshQualityModel(n_z=8)

    def test_mesh_quality_rejects_too_high_z(self):
        """Test that n_z above maximum is rejected."""
        with pytest.raises(ValidationError, match="less than or equal to 4096"):
            MeshQualityModel(n_z=5000)

    def test_mesh_quality_rejects_extra_fields(self):
        """Test that extra fields are rejected."""
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            MeshQualityModel(n_theta=100, n_z=50, invalid_field="test")


class TestDefaultsModel:
    """Test DefaultsModel validation."""

    def test_defaults_model_defaults(self):
        """Test default values."""
        defaults = DefaultsModel()
        assert defaults.height == 120.0
        assert defaults.top_od == 140.0
        assert defaults.bottom_od == 90.0
        assert defaults.wall == 3.0
        assert defaults.bottom == 3.0
        assert defaults.drain == 10.0
        assert defaults.flare_exp == 1.1

    def test_defaults_model_custom_values(self):
        """Test custom values."""
        defaults = DefaultsModel(
            height=150.0,
            top_od=160.0,
            bottom_od=100.0,
            wall=4.0,
            bottom=4.0,
            drain=12.0,
            flare_exp=1.3,
        )
        assert defaults.height == 150.0
        assert defaults.top_od == 160.0
        assert defaults.bottom_od == 100.0
        assert defaults.wall == 4.0
        assert defaults.bottom == 4.0
        assert defaults.drain == 12.0
        assert defaults.flare_exp == 1.3

    def test_defaults_model_rejects_negative_height(self):
        """Test that negative height is rejected."""
        with pytest.raises(ValidationError, match="Input should be greater than 0"):
            DefaultsModel(height=-10.0)

    def test_defaults_model_rejects_zero_wall(self):
        """Test that zero wall thickness is rejected."""
        with pytest.raises(ValidationError, match="Input should be greater than 0"):
            DefaultsModel(wall=0.0)

    def test_defaults_model_rejects_extra_fields(self):
        """Test that extra fields are rejected."""
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            DefaultsModel(height=100, extra_field="test")


class TestPartialDefaultsModel:
    """Test PartialDefaultsModel validation."""

    def test_partial_defaults_all_none(self):
        """Test partial defaults with all None values."""
        partial = PartialDefaultsModel()
        assert partial.height is None
        assert partial.top_od is None
        assert partial.bottom_od is None
        assert partial.wall is None
        assert partial.bottom is None
        assert partial.drain is None
        assert partial.flare_exp is None

    def test_partial_defaults_some_values(self):
        """Test partial defaults with some values."""
        partial = PartialDefaultsModel(height=150.0, wall=4.0)
        assert partial.height == 150.0
        assert partial.wall == 4.0
        assert partial.top_od is None
        assert partial.bottom_od is None

    def test_partial_defaults_all_values(self):
        """Test partial defaults with all values."""
        partial = PartialDefaultsModel(
            height=150.0,
            top_od=160.0,
            bottom_od=100.0,
            wall=4.0,
            bottom=4.0,
            drain=12.0,
            flare_exp=1.3,
        )
        assert partial.height == 150.0
        assert partial.wall == 4.0

    def test_partial_defaults_rejects_negative_values(self):
        """Test that negative values are rejected."""
        with pytest.raises(ValidationError, match="Input should be greater than 0"):
            PartialDefaultsModel(height=-10.0)


class TestRecipeModel:
    """Test RecipeModel validation."""

    def test_recipe_with_style(self):
        """Test recipe with style specified."""
        recipe = RecipeModel(name="test_pot", style="SuperformulaBlossom")
        assert recipe.name == "test_pot"
        assert recipe.style == "SuperformulaBlossom"
        assert recipe.use is None

    def test_recipe_with_use_preset(self):
        """Test recipe with preset reference."""
        recipe = RecipeModel(name="test_pot", use="my_preset")
        assert recipe.name == "test_pot"
        assert recipe.use == "my_preset"
        assert recipe.style is None

    def test_recipe_with_size_and_opts(self):
        """Test recipe with size and options."""
        recipe = RecipeModel(
            name="custom_pot",
            style="FourierBloom",
            size={"height": 150.0, "wall": 4.0},
            opts={"fb_amp1": 0.1},
        )
        assert recipe.name == "custom_pot"
        assert recipe.size is not None
        assert recipe.opts["fb_amp1"] == 0.1

    def test_recipe_rejects_neither_style_nor_use(self):
        """Test that recipe without style or use is rejected."""
        with pytest.raises(
            ValidationError, match="must provide either 'style' or 'use'"
        ):
            RecipeModel(name="invalid_pot")

    def test_recipe_rejects_both_style_and_use(self):
        """Test that recipe with both style and use is rejected."""
        with pytest.raises(
            ValidationError, match="Provide only one of 'style' or 'use'"
        ):
            RecipeModel(
                name="invalid_pot", style="SuperformulaBlossom", use="my_preset"
            )

    def test_recipe_default_opts_empty(self):
        """Test that opts defaults to empty dict."""
        recipe = RecipeModel(name="test", style="SuperformulaBlossom")
        assert recipe.opts == {}

    def test_recipe_rejects_extra_fields(self):
        """Test that extra fields are rejected."""
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            RecipeModel(name="test", style="SuperformulaBlossom", extra="field")


class TestPresetModel:
    """Test PresetModel validation."""

    def test_preset_basic(self):
        """Test basic preset."""
        preset = PresetModel(style="SuperformulaBlossom")
        assert preset.style == "SuperformulaBlossom"
        assert preset.size is None
        assert preset.opts == {}

    def test_preset_with_size(self):
        """Test preset with size parameters."""
        preset = PresetModel(
            style="FourierBloom", size={"height": 130.0, "top_od": 150.0}
        )
        assert preset.style == "FourierBloom"
        assert preset.size is not None

    def test_preset_with_opts(self):
        """Test preset with style options."""
        preset = PresetModel(style="SpiralRidges", opts={"sr_freq": 15, "sr_amp": 0.12})
        assert preset.opts["sr_freq"] == 15
        assert preset.opts["sr_amp"] == 0.12

    def test_preset_rejects_extra_fields(self):
        """Test that extra fields are rejected."""
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            PresetModel(style="SuperformulaBlossom", invalid="field")


class TestConfigV2:
    """Test ConfigV2 validation."""

    def test_config_v2_minimal(self):
        """Test minimal valid ConfigV2."""
        config = ConfigV2(recipes=[{"name": "test", "style": "SuperformulaBlossom"}])
        assert config.version == 2
        assert config.outdir == "out"
        assert config.save_previews is True
        assert config.make_zip is False
        assert len(config.recipes) == 1

    def test_config_v2_with_defaults(self):
        """Test ConfigV2 uses defaults."""
        config = ConfigV2()
        assert config.mesh.n_theta == 168
        assert config.mesh.n_z == 84
        assert config.defaults.height == 120.0
        assert config.defaults.top_od == 140.0

    def test_config_v2_custom_mesh_quality(self):
        """Test ConfigV2 with custom mesh quality."""
        config = ConfigV2(
            mesh={"n_theta": 200, "n_z": 100},
            recipes=[{"name": "test", "style": "SuperformulaBlossom"}],
        )
        assert config.mesh.n_theta == 200
        assert config.mesh.n_z == 100

    def test_config_v2_custom_defaults(self):
        """Test ConfigV2 with custom defaults."""
        config = ConfigV2(
            defaults={"height": 150.0, "wall": 4.0},
            recipes=[{"name": "test", "style": "SuperformulaBlossom"}],
        )
        assert config.defaults.height == 150.0
        assert config.defaults.wall == 4.0

    def test_config_v2_with_presets(self):
        """Test ConfigV2 with presets."""
        config = ConfigV2(
            presets={
                "tall": {"style": "SuperformulaBlossom", "size": {"height": 180.0}}
            },
            recipes=[{"name": "test", "use": "tall"}],
        )
        assert "tall" in config.presets
        assert config.presets["tall"].style == "SuperformulaBlossom"

    def test_config_v2_with_multiple_recipes(self):
        """Test ConfigV2 with multiple recipes."""
        config = ConfigV2(
            recipes=[
                {"name": "pot1", "style": "SuperformulaBlossom"},
                {"name": "pot2", "style": "FourierBloom"},
                {"name": "pot3", "use": "tall"},
            ],
            presets={"tall": {"style": "SpiralRidges"}},
        )
        assert len(config.recipes) == 3

    def test_config_v2_version_must_be_2(self):
        """Test that version must be 2."""
        # Version defaults to 2
        config = ConfigV2(recipes=[{"name": "test", "style": "SuperformulaBlossom"}])
        assert config.version == 2

        # Explicit version 2 works
        config2 = ConfigV2(
            version=2, recipes=[{"name": "test", "style": "SuperformulaBlossom"}]
        )
        assert config2.version == 2

    def test_config_v2_rejects_wrong_version(self):
        """Test that wrong version is rejected."""
        with pytest.raises(ValidationError, match="Input should be 2"):
            ConfigV2(
                version=1, recipes=[{"name": "test", "style": "SuperformulaBlossom"}]
            )

    def test_config_v2_custom_outdir(self):
        """Test ConfigV2 with custom output directory."""
        config = ConfigV2(
            outdir="custom_output",
            recipes=[{"name": "test", "style": "SuperformulaBlossom"}],
        )
        assert config.outdir == "custom_output"

    def test_config_v2_make_zip_option(self):
        """Test ConfigV2 with make_zip option."""
        config = ConfigV2(
            make_zip=True, recipes=[{"name": "test", "style": "SuperformulaBlossom"}]
        )
        assert config.make_zip is True

    def test_config_v2_save_previews_false(self):
        """Test ConfigV2 with save_previews disabled."""
        config = ConfigV2(
            save_previews=False,
            recipes=[{"name": "test", "style": "SuperformulaBlossom"}],
        )
        assert config.save_previews is False

    def test_config_v2_rejects_extra_fields(self):
        """Test that extra fields are rejected."""
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            ConfigV2(
                recipes=[{"name": "test", "style": "SuperformulaBlossom"}],
                invalid_field="test",
            )


class TestDeepMerge:
    """Test deep_merge utility function."""

    def test_deep_merge_empty_dicts(self):
        """Test merging empty dictionaries."""
        result = deep_merge({}, {})
        assert result == {}

    def test_deep_merge_none_values(self):
        """Test merging with None values."""
        result = deep_merge(None, {"a": 1})
        assert result == {"a": 1}

        result = deep_merge({"a": 1}, None)
        assert result == {"a": 1}

    def test_deep_merge_simple_dicts(self):
        """Test merging simple dictionaries."""
        a = {"x": 1, "y": 2}
        b = {"y": 3, "z": 4}
        result = deep_merge(a, b)
        assert result == {"x": 1, "y": 3, "z": 4}

    def test_deep_merge_nested_dicts(self):
        """Test merging nested dictionaries."""
        a = {"outer": {"inner1": 1, "inner2": 2}}
        b = {"outer": {"inner2": 20, "inner3": 3}}
        result = deep_merge(a, b)
        assert result == {"outer": {"inner1": 1, "inner2": 20, "inner3": 3}}

    def test_deep_merge_deeply_nested(self):
        """Test merging deeply nested dictionaries."""
        a = {"level1": {"level2": {"level3": {"value": 1}}}}
        b = {"level1": {"level2": {"level3": {"value": 2, "new": 3}}}}
        result = deep_merge(a, b)
        assert result["level1"]["level2"]["level3"]["value"] == 2
        assert result["level1"]["level2"]["level3"]["new"] == 3

    def test_deep_merge_overwrites_non_dict(self):
        """Test that non-dict values are overwritten, not merged."""
        a = {"key": "old_value"}
        b = {"key": "new_value"}
        result = deep_merge(a, b)
        assert result == {"key": "new_value"}

    def test_deep_merge_mixed_types(self):
        """Test merging with mixed types."""
        a = {"dict_key": {"nested": 1}, "string_key": "old"}
        b = {"dict_key": {"new_nested": 2}, "string_key": "new"}
        result = deep_merge(a, b)
        assert result["dict_key"]["nested"] == 1
        assert result["dict_key"]["new_nested"] == 2
        assert result["string_key"] == "new"

    def test_deep_merge_preserves_original(self):
        """Test that deep_merge doesn't modify original dicts."""
        a = {"x": 1}
        b = {"y": 2}
        result = deep_merge(a, b)
        assert a == {"x": 1}  # Original unchanged
        assert b == {"y": 2}  # Original unchanged
        assert result == {"x": 1, "y": 2}


class TestCoercePartialDefaults:
    """Test _coerce_partial_defaults helper function."""

    def test_coerce_none_returns_none(self):
        """Test that None input returns None."""
        result = _coerce_partial_defaults(None)
        assert result is None

    def test_coerce_empty_dict_returns_none(self):
        """Test that empty dict returns None."""
        result = _coerce_partial_defaults({})
        assert result is None

    def test_coerce_valid_dict_returns_model(self):
        """Test that valid dict returns PartialDefaultsModel."""
        result = _coerce_partial_defaults({"height": 150.0, "wall": 4.0})
        assert isinstance(result, PartialDefaultsModel)
        assert result.height == 150.0
        assert result.wall == 4.0

    def test_coerce_dict_with_all_fields(self):
        """Test coercing dict with all fields."""
        data = {
            "height": 150.0,
            "top_od": 160.0,
            "bottom_od": 100.0,
            "wall": 4.0,
            "bottom": 4.0,
            "drain": 12.0,
            "flare_exp": 1.3,
        }
        result = _coerce_partial_defaults(data)
        assert result.height == 150.0
        assert result.top_od == 160.0
        assert result.flare_exp == 1.3

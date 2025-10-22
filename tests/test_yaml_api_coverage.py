"""
Comprehensive tests for potfoundry/yaml_api.py to improve coverage (Phase 4).

This test file focuses on:
1. YAML configuration loading and validation
2. Recipe validation and realization
3. Batch processing from YAML
4. Preset resolution and merging
5. Error handling for invalid configurations
"""
import pytest
import tempfile
from pathlib import Path
import yaml
from potfoundry.yaml_api import (
    load_config,
    validate_recipe,
    realize_recipe,
    build_from_yaml,
    Config,
)
from potfoundry.schema import ConfigV2


class TestLoadConfig:
    """Test YAML configuration loading."""
    
    def test_load_config_v2(self):
        """Test loading a version 2 config."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config.yaml"
            config_data = {
                "version": 2,
                "outdir": "output",
                "recipes": [
                    {"name": "test_pot", "style": "SuperformulaBlossom"}
                ]
            }
            config_path.write_text(yaml.dump(config_data))
            
            config = load_config(config_path)
            assert isinstance(config, ConfigV2)
            assert config.version == 2
            assert config.outdir == "output"
            assert len(config.recipes) == 1
    
    def test_load_config_v1_migration(self):
        """Test loading and migrating a version 1 config."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config_v1.yaml"
            config_data = {
                "version": 1,
                "outdir": "out",
                "recipes": [
                    {"name": "pot1", "style": "SuperformulaBlossom"}
                ]
            }
            config_path.write_text(yaml.dump(config_data))
            
            config = load_config(config_path)
            assert isinstance(config, ConfigV2)
            assert config.version == 2  # Migrated
    
    def test_load_config_no_version_defaults_to_v1(self):
        """Test that configs without version default to v1 and migrate."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config_old.yaml"
            config_data = {
                "recipes": [
                    {"name": "old_pot", "style": "FourierBloom"}
                ]
            }
            config_path.write_text(yaml.dump(config_data))
            
            config = load_config(config_path)
            assert isinstance(config, ConfigV2)
            assert config.version == 2
    
    def test_load_config_unsupported_version(self):
        """Test that unsupported version raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config_bad.yaml"
            config_data = {
                "version": 99,
                "recipes": []
            }
            config_path.write_text(yaml.dump(config_data))
            
            with pytest.raises(ValueError, match="Unsupported version 99"):
                load_config(config_path)
    
    def test_load_config_empty_file(self):
        """Test loading empty YAML file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "empty.yaml"
            config_path.write_text("")
            
            # Should handle empty file gracefully
            config = load_config(config_path)
            assert isinstance(config, ConfigV2)


class TestValidateRecipe:
    """Test recipe validation."""
    
    def test_validate_recipe_missing_name(self):
        """Test that recipe without name is invalid."""
        cfg = Config()
        recipe = {"style": "SuperformulaBlossom"}
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) > 0
        assert any("missing" in err.lower() and "name" in err.lower() for err in errors)
    
    def test_validate_recipe_both_style_and_use(self):
        """Test that recipe with both style and use is invalid."""
        cfg = Config()
        recipe = {
            "name": "test",
            "style": "SuperformulaBlossom",
            "use": "preset1"
        }
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) > 0
        assert any("both" in err.lower() for err in errors)
    
    def test_validate_recipe_unknown_preset(self):
        """Test that recipe with unknown preset is invalid."""
        cfg = Config(presets={})
        recipe = {
            "name": "test",
            "use": "nonexistent_preset"
        }
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) > 0
        assert any("unknown preset" in err.lower() for err in errors)
    
    def test_validate_recipe_no_style(self):
        """Test that recipe without style specification is invalid."""
        cfg = Config()
        recipe = {"name": "test"}
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) > 0
        assert any("no style" in err.lower() for err in errors)
    
    def test_validate_recipe_unknown_style(self):
        """Test that recipe with unknown style is invalid."""
        cfg = Config()
        recipe = {
            "name": "test",
            "style": "NonExistentStyle"
        }
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) > 0
        assert any("unknown style" in err.lower() for err in errors)
    
    def test_validate_recipe_invalid_size_parameter(self):
        """Test that invalid size parameter types are caught."""
        cfg = Config()
        recipe = {
            "name": "test",
            "style": "SuperformulaBlossom",
            "size": {"height": "not_a_number"}
        }
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) > 0
        assert any("must be a number" in err.lower() for err in errors)
    
    def test_validate_recipe_valid(self):
        """Test that valid recipe passes validation."""
        cfg = Config()
        recipe = {
            "name": "valid_pot",
            "style": "SuperformulaBlossom",
            "size": {"height": 120, "top_od": 140}
        }
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) == 0


class TestRealizeRecipe:
    """Test recipe realization (merging presets and defaults)."""
    
    def test_realize_recipe_simple(self):
        """Test realizing a simple recipe with just a style."""
        cfg = Config()
        recipe = {
            "name": "simple_pot",
            "style": "SuperformulaBlossom"
        }
        
        name, style, size, opts = realize_recipe(recipe, cfg)
        assert name == "simple_pot"
        assert style == "SuperformulaBlossom"
        assert "height" in size
        assert isinstance(opts, dict)
    
    def test_realize_recipe_with_preset(self):
        """Test realizing a recipe that uses a preset."""
        cfg = Config(
            presets={
                "tall": {
                    "style": "FourierBloom",
                    "size": {"height": 180}
                }
            }
        )
        recipe = {
            "name": "tall_pot",
            "use": "tall"
        }
        
        name, style, size, opts = realize_recipe(recipe, cfg)
        assert name == "tall_pot"
        assert style == "FourierBloom"
        assert size["height"] == 180
    
    def test_realize_recipe_overrides_preset(self):
        """Test that recipe values override preset values."""
        cfg = Config(
            presets={
                "base": {
                    "style": "SuperformulaBlossom",
                    "size": {"height": 100, "wall": 3}
                }
            }
        )
        recipe = {
            "name": "custom",
            "use": "base",
            "size": {"height": 150}  # Override height
        }
        
        name, style, size, opts = realize_recipe(recipe, cfg)
        assert size["height"] == 150  # Overridden
        assert size["wall"] == 3  # From preset
    
    def test_realize_recipe_with_opts(self):
        """Test realizing recipe with style options."""
        cfg = Config()
        recipe = {
            "name": "custom_pot",
            "style": "SuperformulaBlossom",
            "opts": {"sf_m": 7, "petal_amp": 0.15}
        }
        
        name, style, size, opts = realize_recipe(recipe, cfg)
        assert opts["sf_m"] == 7
        assert opts["petal_amp"] == 0.15
    
    def test_realize_recipe_no_style_raises(self):
        """Test that recipe without style after merging raises error."""
        cfg = Config(
            presets={
                "incomplete": {
                    "size": {"height": 100}
                    # Missing style
                }
            }
        )
        recipe = {
            "name": "bad",
            "use": "incomplete"
        }
        
        with pytest.raises(ValueError, match="no style specified"):
            realize_recipe(recipe, cfg)


class TestBuildFromYaml:
    """Test batch building from YAML configuration."""
    
    def test_build_from_yaml_no_recipes(self):
        """Test that config without recipes raises error."""
        cfg = Config(recipes=[])
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            with pytest.raises(SystemExit, match="No recipes found"):
                build_from_yaml(cfg, outdir, do_previews=False, do_zip=False)
    
    def test_build_from_yaml_invalid_recipe(self):
        """Test that invalid recipe raises error."""
        cfg = Config(
            recipes=[
                {"name": "bad", "style": "NonExistentStyle"}
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            with pytest.raises(SystemExit, match="Invalid YAML"):
                build_from_yaml(cfg, outdir, do_previews=False, do_zip=False)
    
    def test_build_from_yaml_single_recipe(self):
        """Test building a single pot from YAML."""
        cfg = Config(
            recipes=[
                {
                    "name": "test_pot",
                    "style": "SuperformulaBlossom",
                    "size": {"height": 100, "top_od": 120, "bottom_od": 80}
                }
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            build_from_yaml(
                cfg, outdir, 
                do_previews=False, 
                do_zip=False,
                write_manifest=False
            )
            
            # Check that STL file was created
            stl_file = outdir / "test_pot.stl"
            assert stl_file.exists()
            assert stl_file.stat().st_size > 0
    
    def test_build_from_yaml_multiple_recipes(self):
        """Test building multiple pots from YAML."""
        cfg = Config(
            recipes=[
                {"name": "pot1", "style": "SuperformulaBlossom"},
                {"name": "pot2", "style": "FourierBloom"},
                {"name": "pot3", "style": "SpiralRidges"}
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            build_from_yaml(
                cfg, outdir,
                do_previews=False,
                do_zip=False,
                write_manifest=False
            )
            
            # Check that all STL files were created
            assert (outdir / "pot1.stl").exists()
            assert (outdir / "pot2.stl").exists()
            assert (outdir / "pot3.stl").exists()
    
    def test_build_from_yaml_only_names_filter(self):
        """Test building only specific recipes using only_names filter."""
        cfg = Config(
            recipes=[
                {"name": "pot1", "style": "SuperformulaBlossom"},
                {"name": "pot2", "style": "FourierBloom"},
                {"name": "pot3", "style": "SpiralRidges"}
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            build_from_yaml(
                cfg, outdir,
                only_names=["pot1", "pot3"],
                do_previews=False,
                do_zip=False,
                write_manifest=False
            )
            
            # Only pot1 and pot3 should be created
            assert (outdir / "pot1.stl").exists()
            assert not (outdir / "pot2.stl").exists()
            assert (outdir / "pot3.stl").exists()
    
    def test_build_from_yaml_with_manifest(self):
        """Test building with manifest file generation."""
        cfg = Config(
            recipes=[
                {"name": "test", "style": "SuperformulaBlossom"}
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            build_from_yaml(
                cfg, outdir,
                do_previews=False,
                do_zip=False,
                write_manifest=True
            )
            
            # Check manifest file was created
            manifest_file = outdir / "manifest.json"
            assert manifest_file.exists()
    
    def test_build_from_yaml_configv2(self):
        """Test that ConfigV2 (Pydantic) is accepted and works."""
        config = ConfigV2(
            recipes=[
                {"name": "pydantic_pot", "style": "HarmonicRipple"}
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            build_from_yaml(
                config, outdir,
                do_previews=False,
                do_zip=False,
                write_manifest=False
            )
            
            assert (outdir / "pydantic_pot.stl").exists()


class TestPresetResolution:
    """Test preset chain resolution and merging."""
    
    def test_preset_with_size_override(self):
        """Test preset size parameters are properly merged."""
        cfg = Config(
            presets={
                "wide": {
                    "style": "SuperformulaBlossom",
                    "size": {"top_od": 200, "bottom_od": 150}
                }
            },
            recipes=[
                {"name": "wide_pot", "use": "wide"}
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            build_from_yaml(
                cfg, outdir,
                do_previews=False,
                do_zip=False,
                write_manifest=False
            )
            
            assert (outdir / "wide_pot.stl").exists()
    
    def test_preset_with_opts(self):
        """Test preset with style-specific options."""
        cfg = Config(
            presets={
                "custom_bloom": {
                    "style": "FourierBloom",
                    "opts": {"fb_amp1": 0.1, "fb_freq1": 8}
                }
            },
            recipes=[
                {"name": "bloom_pot", "use": "custom_bloom"}
            ]
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            outdir = Path(tmpdir) / "out"
            
            build_from_yaml(
                cfg, outdir,
                do_previews=False,
                do_zip=False,
                write_manifest=False
            )
            
            assert (outdir / "bloom_pot.stl").exists()


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_empty_recipe_name(self):
        """Test that empty recipe name is caught."""
        cfg = Config()
        recipe = {"name": "", "style": "SuperformulaBlossom"}
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) > 0
    
    def test_recipe_with_all_size_parameters(self):
        """Test recipe with all possible size parameters."""
        cfg = Config()
        recipe = {
            "name": "complete",
            "style": "SuperellipseMorph",
            "size": {
                "height": 150,
                "top_od": 160,
                "bottom_od": 100,
                "wall": 4,
                "bottom": 4,
                "drain": 12,
                "flare_exp": 1.3
            }
        }
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) == 0
        
        name, style, size, opts = realize_recipe(recipe, cfg)
        assert size["height"] == 150
        assert size["wall"] == 4
        assert size["flare_exp"] == 1.3
    
    def test_mixed_size_parameter_types(self):
        """Test that both int and float size parameters work."""
        cfg = Config()
        recipe = {
            "name": "mixed",
            "style": "SpiralRidges",
            "size": {
                "height": 100,  # int
                "wall": 3.5  # float
            }
        }
        
        errors = validate_recipe(recipe, cfg)
        assert len(errors) == 0

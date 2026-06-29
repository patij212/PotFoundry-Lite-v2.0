from __future__ import annotations

# Flexible imports to support legacy and refactored module layout

def _import_writer():
    try:
        from potfoundry.core.io.stl import write_stl_binary  # type: ignore
        return write_stl_binary
    except Exception:
        try:
            from potfoundry import write_stl_binary  # type: ignore
            return write_stl_binary
        except Exception:  # pragma: no cover
            try:
                from potfoundry.stl import write_stl_binary  # type: ignore
                return write_stl_binary
            except Exception:  # pragma: no cover
                return None  # type: ignore


def _import_obj_writer():
    """Wavefront OBJ writer (Rhino/Grasshopper export). Optional in old builds."""
    try:
        from potfoundry.core.io.obj import write_obj  # type: ignore
        return write_obj
    except Exception:
        try:
            from potfoundry import write_obj  # type: ignore
            return write_obj
        except Exception:  # pragma: no cover
            return None  # type: ignore


def _import_geometry():
    try:
        from potfoundry.core.geometry import STYLES, base_radius, _spin_twist_radians, build_pot_mesh
        return STYLES, base_radius, _spin_twist_radians, build_pot_mesh
    except Exception:
        from potfoundry.geometry import STYLES, base_radius, _spin_twist_radians, build_pot_mesh
        return STYLES, base_radius, _spin_twist_radians, build_pot_mesh


def _import_schema_and_batch():
    validate_recipe = None
    load_config = None
    build_from_yaml = None
    try:
        from potfoundry.core.schema import validate_recipe as _v, load_config as _l  # type: ignore
        validate_recipe, load_config = _v, _l
    except Exception:
        try:
            from potfoundry.yaml_api import load_config as _l  # type: ignore
            load_config = _l
            try:
                from potfoundry.yaml_api import validate_recipe as _v  # type: ignore
                validate_recipe = _v
            except Exception:  # pragma: no cover
                validate_recipe = None  # type: ignore
        except Exception:
            pass
    try:
        from potfoundry.adapters.batch import build_from_yaml as _b  # type: ignore
        build_from_yaml = _b
    except Exception:
        try:
            from potfoundry.yaml_api import build_from_yaml as _b  # type: ignore
            build_from_yaml = _b
        except Exception:
            pass
    return validate_recipe, load_config, build_from_yaml


WRITE_STL_BINARY = _import_writer()
WRITE_OBJ = _import_obj_writer()
STYLES, base_radius, _spin_twist_radians, build_pot_mesh = _import_geometry()
validate_recipe, load_config, build_from_yaml = _import_schema_and_batch()

from __future__ import annotations
from typing import Any, Dict


def dump_recipe_yaml(name: str, style_name: str, H: float, top_od: float, bottom_od: float,
                     t_wall: float, t_bottom: float, r_drain: float, expn: float,
                     opts: Dict[str, Any]) -> str:
    try:
        import yaml as _yaml
    except Exception:
        return "# Install PyYAML to view YAML export snippet.\n"
    recipe = {
        "version": 2,
        "name": name,
        "style": style_name,
        "size": {
            "height": H, "top_od": top_od, "bottom_od": bottom_od,
            "wall": t_wall, "bottom": t_bottom, "drain": r_drain, "flare_exp": expn,
        },
        "opts": opts,
    }
    return _yaml.safe_dump({"recipes": [recipe]}, sort_keys=False)

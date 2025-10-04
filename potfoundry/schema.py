from __future__ import annotations
from typing import Dict, List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, PositiveFloat, conint, field_validator, model_validator

# PF2: Pydantic v2 schema (ConfigV2) + migration helpers

class MeshQualityModel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    n_theta: int = Field(168, ge=32, le=4096)
    n_z: int = Field(84, ge=16, le=4096)

class DefaultsModel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    height: PositiveFloat = 120.0
    top_od: PositiveFloat = 140.0
    bottom_od: PositiveFloat = 90.0
    wall: PositiveFloat = 3.0
    bottom: PositiveFloat = 3.0
    drain: PositiveFloat = 10.0
    flare_exp: PositiveFloat = 1.1

class PartialDefaultsModel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    height: Optional[PositiveFloat] = None
    top_od: Optional[PositiveFloat] = None
    bottom_od: Optional[PositiveFloat] = None
    wall: Optional[PositiveFloat] = None
    bottom: Optional[PositiveFloat] = None
    drain: Optional[PositiveFloat] = None
    flare_exp: Optional[PositiveFloat] = None

class RecipeModel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    style: Optional[str] = None
    use: Optional[str] = None  # reference preset name
    size: Optional[PartialDefaultsModel | dict] = None
    opts: Dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _style_or_use(self):
        # either style or use (preset) must be provided
        if not self.style and not self.use:
            raise ValueError("Recipe must provide either 'style' or 'use' (preset).")
        if self.style and self.use:
            raise ValueError("Provide only one of 'style' or 'use'.")
        return self

class PresetModel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    style: str
    size: Optional[PartialDefaultsModel | dict] = None
    opts: Dict = Field(default_factory=dict)

class ConfigV2(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: Literal[2] = 2
    outdir: str = "out"
    save_previews: bool = True
    make_zip: bool = False
    mesh: MeshQualityModel = Field(default_factory=MeshQualityModel)
    defaults: DefaultsModel = Field(default_factory=DefaultsModel)
    presets: Dict[str, PresetModel] = Field(default_factory=dict)
    recipes: List[RecipeModel] = Field(default_factory=list)


def deep_merge(a: dict, b: dict) -> dict:
    out = dict(a or {})
    for k, v in (b or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out

def _coerce_partial_defaults(d: dict | None) -> PartialDefaultsModel | None:
    if not d:
        return None
    return PartialDefaultsModel(**d)

def migrate_v1_to_v2(raw: dict) -> dict:
    # Accepts your old v1 YAML and returns a dict matching ConfigV2
    mesh = raw.get("mesh", {}) or {}
    defaults = raw.get("defaults", {}) or {}
    presets = raw.get("presets", {}) or {}
    recipes = raw.get("recipes", []) or []

    v2 = {
        "version": 2,
        "outdir": str(raw.get("outdir", "out")),
        "save_previews": bool(raw.get("save_previews", True)),
        "make_zip": bool(raw.get("make_zip", False)),
        "mesh": {
            "n_theta": int(mesh.get("n_theta", 168)),
            "n_z": int(mesh.get("n_z", 84)),
        },
        "defaults": {
            "height": float(defaults.get("height", 120.0)),
            "top_od": float(defaults.get("top_od", 140.0)),
            "bottom_od": float(defaults.get("bottom_od", 90.0)),
            "wall": float(defaults.get("wall", 3.0)),
            "bottom": float(defaults.get("bottom", 3.0)),
            "drain": float(defaults.get("drain", 10.0)),
            "flare_exp": float(defaults.get("flare_exp", 1.1)),
        },
        "presets": {},
        "recipes": [],
    }

    # migrate presets
    for name, p in presets.items():
        v2["presets"][name] = {
            "style": p.get("style"),
            "size": p.get("size") or {},
            "opts": p.get("opts") or {},
        }

    # migrate recipes
    for r in recipes:
        v2["recipes"].append({
            "name": r.get("name"),
            "style": r.get("style"),
            "use": r.get("use"),
            "size": r.get("size") or {},
            "opts": r.get("opts") or {},
        })

    return v2

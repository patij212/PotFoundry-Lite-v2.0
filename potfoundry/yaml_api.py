# PF2: Full migration to binary STL exports
# potfoundry/yaml_api.py (patched for Windows / Python 3.13 dataclass defaults)
#
# All STL exports in this module use write_stl_binary for optimal file size
# and performance. Binary STL is the recommended format for all production use.
from __future__ import annotations

import json
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union, cast

import yaml

# Binary STL writer (recommended for all exports)
from .core.io.stl import atomic_write_bytes, write_stl_binary
from .geometry import (
    STYLES,
    MeshQuality,
    PotDefaults,
    build_pot_mesh,
    save_preview_png,
)
from .schema import ConfigV2, deep_merge, migrate_v1_to_v2


@dataclass
class Config:
    version: int = 1
    outdir: str = "out"
    save_previews: bool = True
    make_zip: bool = False
    mesh: MeshQuality = field(default_factory=MeshQuality)
    defaults: PotDefaults = field(default_factory=PotDefaults)
    presets: Dict[str, dict] = field(
        default_factory=dict
    )  # name -> {style, size, opts}
    recipes: List[dict] = field(
        default_factory=list
    )  # list of {name, style|use, size, opts}


def load_config(path: Path | str) -> ConfigV2:
    # Accept either a Path or a string filename
    if not isinstance(path, Path):
        path = Path(path)
    raw: Dict[str, Any] = yaml.safe_load(path.read_text()) or {}
    # Accept some legacy shorthand keys in the 'defaults' block (tests use H/Rt/Rb etc.)
    from typing import cast

    defaults = cast(Dict[str, Any], raw.get("defaults") or {})
    if isinstance(defaults, dict):
        # map shorthand keys to canonical ConfigV2 names
        key_map = {
            "H": "height",
            "Rt": "top_od",
            "Rb": "bottom_od",
            "t_wall": "wall",
            "t_bottom": "bottom",
            "r_drain": "drain",
            # alternate names
            "expn": "flare_exp",
        }
        if any(k in defaults for k in key_map.keys()):
            new_defaults: Dict[str, Any] = {}
            for k, v in defaults.items():
                nk = key_map.get(k, k)
                new_defaults[nk] = v
            raw["defaults"] = new_defaults

    version = int(raw.get("version", 1))
    if version == 2:
        return ConfigV2.model_validate(raw)
    elif version == 1 or version == 0:
        migrated = migrate_v1_to_v2(raw)
        return ConfigV2.model_validate(migrated)
    else:
        raise ValueError(f"Unsupported version {version}.")


def _normalize_cfg(cfg: Union[ConfigV2, Config]) -> Config:
    """Accept ConfigV2 (Pydantic) or legacy Config dataclass; return legacy Config."""
    try:
        from .schema import ConfigV2

        if isinstance(cfg, ConfigV2):
            # The Pydantic models sometimes contain plain dicts for nested
            # fields in test/legacy scenarios. Cast to Any so that static
            # analysis doesn't treat the subsequent runtime isinstance checks
            # as unreachable (cfg.mesh is annotated as a model in the schema).
            from typing import Any as _Any
            from typing import cast

            cfg_any = cast(_Any, cfg)

            m = cfg_any.mesh
            if isinstance(m, dict):
                mesh = MeshQuality(
                    n_theta=int(m.get("n_theta", 168)), n_z=int(m.get("n_z", 84))
                )
            else:
                mesh = MeshQuality(n_theta=int(m.n_theta), n_z=int(m.n_z))

            d = cfg_any.defaults
            if isinstance(d, dict):
                defaults = PotDefaults(**d)
            else:
                defaults = PotDefaults(**d.model_dump())

            presets = {}
            for k, v in (cfg_any.presets or {}).items():
                if isinstance(v, dict):
                    presets[k] = v
                else:
                    presets[k] = v.model_dump()

            recipes = []
            for r in cfg_any.recipes or []:
                if isinstance(r, dict):
                    recipes.append(r)
                else:
                    recipes.append(r.model_dump())

            return Config(
                version=2,
                outdir=str(cfg_any.outdir),
                save_previews=bool(cfg_any.save_previews),
                make_zip=bool(cfg_any.make_zip),
                mesh=mesh,
                defaults=defaults,
                presets=presets,
                recipes=recipes,
            )
    except Exception:
        pass
    # already legacy Config
    from typing import cast

    return cast(Config, cfg)


def validate_recipe(recipe: Dict[str, Any], cfg: Config) -> List[str]:
    errs: List[str] = []
    r = _normalize_style_alias(recipe or {})
    name = r.get("name")
    if not name or not isinstance(name, str):
        errs.append("Recipe is missing a string 'name'.")
        return errs

    style = r.get("style")
    use = r.get("use")
    if style and use:
        errs.append(f"Recipe '{name}': specify either 'style' or 'use', not both.")
        return errs

    if use:
        p = _resolve_preset_chain(use, cfg.presets or {})
        if not p:
            errs.append(f"Recipe '{name}': unknown preset '{use}'.")
            return errs
        p = _normalize_style_alias(p)
        style = style or p.get("style")

    if not style:
        errs.append(f"Recipe '{name}': no style specified (recipe/preset).")
        return errs
    style = _resolve_style_name(style)
    if style not in STYLES:
        errs.append(f"Recipe '{name}': unknown style '{style}'.")

    size = r.get("size", {}) or {}
    for key in (
        "height",
        "top_od",
        "bottom_od",
        "wall",
        "bottom",
        "drain",
        "flare_exp",
    ):
        if key in size and not isinstance(size[key], (int, float)):
            errs.append(f"Recipe '{name}': size['{key}'] must be a number.")
    return errs


def realize_recipe(
    recipe: Dict[str, Any], cfg: Config
) -> Tuple[str, str, Dict[str, Any], Dict[str, Any]]:
    r = _normalize_style_alias(recipe or {})
    name: str = r["name"]
    base: Dict[str, Any] = dict(style=None, size={}, opts={})

    if r.get("use"):
        pres = _resolve_preset_chain(r["use"], cfg.presets or {})
        pres = _normalize_style_alias(_strip_nones(pres or {}))
        base = deep_merge(base, pres)

    # Overlay recipe values, but DO NOT overwrite preset values with None
    overlay = {}
    for k in ("style", "size", "opts"):
        if k in r and r.get(k) is not None:
            overlay[k] = r.get(k)
    overlay = _strip_nones(overlay)
    base = deep_merge(base, overlay)

    if base["style"] is None:
        raise ValueError(f"Recipe '{name}': no style specified after merging preset.")

    style = _resolve_style_name(base["style"])
    size = deep_merge(asdict(cfg.defaults), _strip_nones(base.get("size") or {}))
    opts = base.get("opts") or {}
    return name, style, size, opts


def build_from_yaml(
    cfg: Union[Config, ConfigV2],
    outdir: Path,
    do_previews: bool = True,
    do_zip: bool = True,
    only_names: Optional[Sequence[str]] = None,
    write_manifest: bool = False,
) -> Dict[str, Any]:
    cfg = _normalize_cfg(cfg)
    if not cfg.recipes:
        raise SystemExit("No recipes found.")
    errs = []
    for r in cfg.recipes:
        r_dict = r if isinstance(r, dict) else getattr(r, "model_dump", lambda: r)()
        errs.extend(validate_recipe(r_dict, cfg))
    if errs:
        raise SystemExit("Invalid YAML:\n- " + "\n- ".join(errs))

    outdir.mkdir(parents=True, exist_ok=True)
    names = set(only_names) if only_names else None

    manifest: Dict[str, Any] = {
        "units": "mm",
        "outdir": str(outdir.resolve()),
        "pots": [],
    }
    for rec in cfg.recipes:
        rec = (
            rec if isinstance(rec, dict) else getattr(rec, "model_dump", lambda: rec)()
        )
        name, style, size, opts = realize_recipe(rec, cfg)
        if names and name not in names:
            continue

        H = float(size["height"])
        Rt = float(size["top_od"]) * 0.5
        Rb = float(size["bottom_od"]) * 0.5
        t_wall = float(size["wall"])
        t_bottom = float(size["bottom"])
        r_drain = float(size["drain"]) * 0.5
        expn = float(size["flare_exp"])
        n_theta = int(cfg.mesh.n_theta)
        n_z = int(cfg.mesh.n_z)

        r_fn, desc = STYLES[style]

        verts, faces, diag = build_pot_mesh(
            H, Rt, Rb, t_wall, t_bottom, r_drain, expn, n_theta, n_z, r_fn, opts
        )

        stl_path = outdir / f"{name}.stl"
        write_stl_binary(stl_path, name, verts, faces)

        if diag["clamp_ratio_at_bottom"] > 0.02:
            print(
                f"[WARN] '{name}': inner radius near drain was clamped in "
                f"{100.0 * diag['clamp_ratio_at_bottom']:.1f}% of inner samples. "
                "Consider increasing bottom_od, decreasing drain, or increasing wall."
            )

        if do_previews:
            png_path = outdir / f"preview_{name}.png"
            save_preview_png(png_path, H, Rt, Rb, expn, n_theta, n_z, r_fn, opts)

        manifest["pots"].append(
            {
                "name": name,
                "style": style,
                "description": desc,
                "size": size,
                "opts": opts,
                "vertices": int(len(verts)),
                "faces": int(len(faces)),
                "diagnostics": diag,
                "stl": str(stl_path.resolve()),
            }
        )
        print(f"[OK] Wrote {stl_path.name}  (V={len(verts)} F={len(faces)})")

    if do_zip and manifest["pots"]:
        zip_path = outdir / "pot_gallery_STLs.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in manifest["pots"]:
                zf.write(p["stl"], Path(p["stl"]).name)
        print(f"[OK] Wrote {zip_path.name}")
        manifest["zip"] = str(zip_path.resolve())

    if write_manifest:
        mpath = outdir / "manifest.json"
        atomic_write_bytes(mpath, json.dumps(manifest, indent=2).encode("utf-8"))
        print(f"[OK] Wrote {mpath.name}")
        manifest["manifest"] = str(mpath.resolve())

    return manifest


def _resolve_preset_chain(preset_name: str, presets: dict) -> dict:
    """Resolve a preset with optional inheritance (preset may have 'use' to extend another)."""
    seen = set()

    current: Optional[str] = preset_name
    merged: dict = {}
    while current:
        if current in seen:
            raise ValueError(f"Preset inheritance loop detected at '{current}'.")
        seen.add(current)
        p = (presets or {}).get(current)
        if not isinstance(p, dict):
            break
        # normalize alias 'type' -> 'style'
        if "type" in p and "style" not in p:
            p = dict(p)
            p["style"] = p.pop("type")
        # merge child over parent
        merged = deep_merge(p, merged)
        current = p.get("use")
    return merged


def _normalize_style_alias(d: dict) -> dict:
    if isinstance(d, dict) and "type" in d and "style" not in d:
        d = dict(d)
        d["style"] = d.pop("type")
    return d


def _strip_nones(obj):
    if isinstance(obj, dict):
        return {k: _strip_nones(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [_strip_nones(v) for v in obj]
    return obj


STYLE_ALIASES = {
    "fluted": "HarmonicRipple",
    "ripple": "HarmonicRipple",
    "flower": "SuperformulaBlossom",
    "blossom": "SuperformulaBlossom",
    "spiral": "SpiralRidges",
    "smooth": "SuperellipseMorph",
}


def _resolve_style_name(name: str) -> str:
    if name in STYLES:
        return name
    return STYLE_ALIASES.get(name, name)

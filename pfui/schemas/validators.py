# pfui/schemas/validators.py - Validation and schema helpers
"""Validation, sanitization, and schema helper functions."""

from __future__ import annotations

import warnings
from typing import Any, cast

from .aliases import ALIASES_BY_STYLE, GLOBAL_ALIASES
from .base import ControlMeta
from .canonical_schemas import CANONICAL_CONTROLS, CANONICAL_STYLE_SCHEMAS
from .global_controls import GLOBAL_CONTROLS
from .style_schemas import STYLE_SCHEMAS

__all__ = [
    "_coerce_one",
    "apply_defaults",
    "get_schema",
    "sanitize_opts",
    "validate_keyset",
    "warn_on_legacy_keys",
]


def get_schema(style: str, *, canonical: bool = False) -> dict[str, ControlMeta]:
    """Return merged schema (globals + per-style), keyed by legacy or canonical names.

    Purpose:
        Feed UI or export with one dict keyed by the desired keyspace.

    Inputs:
        style: str - style name.
        canonical: bool - True returns canonical-keyed schema; False returns legacy-keyed.

    Outputs:
        Dict[str, ControlMeta] - shallow copies of control meta dicts.

    Guarantees:
        - Pure function; does not mutate module-level dicts.
        - Returns empty per-style block if style unknown.

    Errors:
        - None.
    """
    if canonical:
        # CANONICAL_* are Mapping types; cast to the expected Dict[str, ControlMeta]
        block: dict[str, ControlMeta] = cast(
            "dict[str, ControlMeta]", dict(CANONICAL_CONTROLS),
        )
        block.update(
            cast("dict[str, dict[str, Any]]", CANONICAL_STYLE_SCHEMAS).get(style, {}),
        )
    else:
        block = cast("dict[str, ControlMeta]", dict(GLOBAL_CONTROLS))
        block.update(cast("dict[str, dict[str, Any]]", STYLE_SCHEMAS).get(style, {}))
    return block


def apply_defaults(style: str, opts: dict, *, canonical: bool = False) -> dict:
    """Fill missing keys with schema defaults.

    Purpose:
        Make downstream code simpler by ensuring required keys exist.

    Inputs:
        style: str
        opts: dict - partial or full options
        canonical: bool - interpret keys as canonical if True

    Outputs:
        dict - copy with defaults filled.

    Guarantees:
        - Only fills keys present in schema and missing in opts.
        - Does not mutate inputs.

    Errors:
        - None.
    """
    sch = get_schema(style, canonical=canonical)
    out = {**opts}
    for k, meta in sch.items():
        if k not in out and "default" in meta:
            out[k] = meta["default"]
    return out


def _coerce_one(v: Any, meta: ControlMeta) -> object:
    """Coerce a single value to the type declared by meta.

    Purpose:
        Harden user input before using it.

    Inputs:
        v: Any - incoming value
        meta: ControlMeta - control metadata (type/min/max)

    Outputs:
        Any - coerced value

    Guarantees:
        - int/float are coerced via float -> int round for "int".
        - bool accepts common truthy strings.

    Errors:
        - ValueError for invalid numeric coercions.
    """
    t = meta.get("type")
    if t == "int":
        try:
            v = int(round(float(v)))
        except Exception as e:
            raise ValueError(f"expected int, got {v!r}") from e
    elif t == "float":
        try:
            v = float(v)
        except Exception as e:
            raise ValueError(f"expected float, got {v!r}") from e
    elif t == "bool":
        if isinstance(v, str):
            v = v.strip().lower() in {"1", "true", "yes", "on"}
        else:
            v = bool(v)
    elif t == "select":
        # enforce allowed options if provided (accept list or tuple)
        opts = meta.get("options")
        if isinstance(opts, (list, tuple)) and opts:
            if v not in opts:
                raise ValueError(
                    f"invalid option {v!r}; expected one of {list(opts)!r}",
                )
    return v


def sanitize_opts(
    style: str, opts: dict, *, canonical: bool = False,
) -> tuple[dict[str, object], list[str]]:
    """Coerce types, clamp to min/max, and fill defaults.

    Purpose:
        Create safe, engine/preview-ready option dicts.

    Inputs:
        style: str
        opts: dict
        canonical: bool - interpret keys as canonical if True

    Outputs:
        (clean_opts, errors):
            clean_opts: dict - coerced + clamped + defaults-filled
            errors: list[str] - human-friendly conversion errors encountered

    Guarantees:
        - Unknown keys are passed through unchanged.
        - Defaults are applied last.

    Errors:
        - None (errors collected in list instead of raising).
    """
    sch = get_schema(style, canonical=canonical)
    out: dict[str, object] = {}
    errors: list[str] = []

    for k, v in opts.items():
        meta = sch.get(k)
        if not meta:
            out[k] = v  # unknown key: pass through (preserve runtime value)
            continue
        try:
            vv = _coerce_one(v, meta)
            if isinstance(vv, (int, float)):
                minv = meta.get("min")
                maxv = meta.get("max")
                if isinstance(minv, (int, float)):
                    vv = max(vv, minv)
                if isinstance(maxv, (int, float)):
                    vv = min(vv, maxv)
            out[k] = vv
        except Exception as e:
            errors.append(f"{k}: {e}")

    out = apply_defaults(style, out, canonical=canonical)
    return out, errors


def warn_on_legacy_keys(style: str, opts: dict) -> None:
    """Emit a warning for legacy keys that have canonical replacements.

    Purpose:
        Nudge UI developers toward to_canonical(...) at display time.

    Inputs:
        style: str
        opts: dict

    Outputs:
        None

    Guarantees:
        - Emits a Python warning only when legacy keys are present.

    Errors:
        - None.
    """
    alias = ALIASES_BY_STYLE.get(style, {})
    # include both style-specific and global legacy aliases
    legacy_seen = [k for k in opts if (k in alias) or (k in GLOBAL_ALIASES)]
    if legacy_seen:
        warnings.warn(
            "Legacy keys detected: "
            + ", ".join(legacy_seen)
            + ". Prefer canonical names via to_canonical(...).",
            stacklevel=2,
        )


def validate_keyset(style: str, opts: dict, *, canonical: bool = False) -> list[str]:
    """Return unknown keys relative to the schema.

    Purpose:
        Aid linting/tests for user presets and imports.

    Inputs:
        style: str
        opts: dict
        canonical: bool

    Outputs:
        list[str] - keys not present in the schema for the chosen keyspace.

    Guarantees:
        - Pure function.

    Errors:
        - None.
    """
    sch = get_schema(style, canonical=canonical)
    return [k for k in opts if k not in sch]


def compress_opts(
    style: str,
    opts: dict,
    *,
    canonical: bool = True,
    drop_defaults: bool = True,
    round_to: int | None = 4,
) -> dict:
    """Return a compact copy of options for export (e.g., YAML).

    Purpose:
        Keep exports minimal and human-diffable.

    Inputs:
        style: str
        opts: dict
        canonical: bool - interpret as canonical keys if True
        drop_defaults: bool - omit values equal to schema defaults
        round_to: Optional[int] - decimal places for floats, or None to keep exact

    Outputs:
        dict - compacted options

    Guarantees:
        - Only keys present in opts are returned (minus dropped defaults).
        - Unknown keys are preserved.

    Errors:
        - None.
    """
    sch = get_schema(style, canonical=canonical)
    out: dict = {}
    for k, v in opts.items():
        # Round value first (if requested)
        if round_to is not None and isinstance(v, float):
            v = round(v, round_to)
        # Fetch and round default the same way before comparing
        dv = sch.get(k, {}).get("default", None)
        if drop_defaults and dv is not None:
            dv_cmp = (
                round(dv, round_to)
                if (round_to is not None and isinstance(dv, float))
                else dv
            )
            if v == dv_cmp:
                continue
        out[k] = v
    return out


if __name__ == "__main__":
    # Allow running the module directly without side effects (import-safe).
    # Use the private `STYLE_SCHEMAS` here to avoid referencing the
    # public frozen `STYLE_SCHEMAS` before it is built later in the file.
    print("pfui.schemas loaded OK. Styles:", ", ".join(sorted(STYLE_SCHEMAS.keys())))


# =============================================================================


from typing import Any, TypeAlias

"""Type stubs for `pfui.schemas` used by the interactive UI.

These are intentionally minimal and conservative: they declare the
runtime-facing functions used by `pfui.interactive_tab` and related
modules so the static analyzer can reason about signatures.
"""

StyleSchema: TypeAlias = dict[str, Any]
StyleSchemaMapping: TypeAlias = dict[str, StyleSchema]
StyleOpts: TypeAlias = dict[str, Any]

def get_style_schemas() -> StyleSchemaMapping: ...

def to_engine(style: str, opts: StyleOpts | None = ...) -> dict[str, Any]: ...

__all__ = ["StyleOpts", "get_style_schemas", "to_engine"]

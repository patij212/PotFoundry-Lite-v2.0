from __future__ import annotations

from typing import Any


# Thin wrapper around pfui.schemas conversion helpers so callers don't
# need to import schemas directly and to provide a single place to
# extend mapping rules later.
def to_engine(style: str, opts: dict[str, Any]) -> dict[str, Any]:
    from . import schemas

    return schemas.to_engine(style, opts)


def to_canonical(style: str, opts: dict[str, Any]) -> dict[str, Any]:
    from . import schemas

    return schemas.to_canonical(style, opts)

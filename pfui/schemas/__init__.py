"""pfui.schemas package (transitional shim)

This package preserves the original public API by loading and re-exporting
symbols from the legacy module file ``pfui/schemas.py``. This allows us to
gradually split the implementation into submodules without breaking imports
like ``import pfui.schemas as SC``.

Implementation note: we now expose structured submodules (aliases, data,
normalize, validators). For backward compatibility during the transition,
we also load the legacy module to fill in any remaining public names.
"""

from __future__ import annotations

import importlib.util
from .aliases import *  # noqa: F401,F403
from .data import *  # noqa: F401,F403
from .normalize import *  # noqa: F401,F403
from .validators import *  # noqa: F401,F403

# Fallback: if any public symbol is missing from submodules, hydrate from legacy.
def _hydrate_from_legacy() -> None:
    from pathlib import Path
    from types import ModuleType

    pkg_dir = Path(__file__).resolve().parent
    legacy_path = pkg_dir.parent / "schemas.py"
    spec = importlib.util.spec_from_file_location("pfui._schemas_legacy", str(legacy_path))
    if spec and spec.loader:
        mod: ModuleType = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for k, v in mod.__dict__.items():
            # Preserve private helpers (single underscore) for backward compatibility,
            # but avoid importing dunder names.
            if not k.startswith("__") and k not in globals():
                globals()[k] = v


_hydrate_from_legacy()


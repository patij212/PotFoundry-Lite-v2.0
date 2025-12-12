from typing import Any

# Minimal permissive numba stub: treat key symbols as Any so conditional
# assignments and decorator re-exports in the codebase don't cause
# strict signature mismatches for mypy.

njit: Any
jit: Any
prange: Any
types: Any

__all__ = ["jit", "njit", "prange", "types"]

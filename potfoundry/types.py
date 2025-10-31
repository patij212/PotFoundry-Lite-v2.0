"""Common lightweight type aliases for PotFoundry.

This module provides a single NDArray alias for NumPy float64 arrays used
across the codebase. Adding a centralized alias makes incremental typing
of geometry functions safer and clearer.
"""

from __future__ import annotations

from typing import TypeAlias

import numpy as np
import numpy.typing as npt

NDArrayFloat: TypeAlias = npt.NDArray[np.float64]

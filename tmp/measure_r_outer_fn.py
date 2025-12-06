from __future__ import annotations

import time

import numpy as np

from potfoundry.geometry import STYLES

TEST_NT = 168

for name in ["SuperformulaBlossom","FourierBloom","SpiralRidges","SuperellipseMorph","HarmonicRipple"]:
    style_fn = STYLES[name][0]
    thetas = np.linspace(0.0, 2.0*np.pi, TEST_NT, endpoint=False)
    t0 = time.perf_counter()
    out = style_fn(thetas, 0.0, 50.0, 120.0, {})
    dt = time.perf_counter() - t0
    print(f"{name}: dt={dt:.6f}, ndim={np.asarray(out).ndim}, len={np.asarray(out).shape[0]}")

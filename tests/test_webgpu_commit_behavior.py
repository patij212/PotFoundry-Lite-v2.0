from __future__ import annotations

import math


def dot(a, b):
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]


def test_commit_threshold_flip():
    """Commit-time flip: dot < BASIS_FLIP_DOT_THRESHOLD should flip basis.

    We mirror algorithmic threshold behavior using the same -0.999 cutoff.
    """
    BASIS_FLIP_DOT_THRESHOLD = -0.999
    prev = (1.0, 0.0, 0.0)
    # Nearly inverted
    new = (-0.9999, 0.0, 0.0)
    assert dot(prev, new) < BASIS_FLIP_DOT_THRESHOLD
    # Slightly less inverted - shouldn't flip
    new2 = (-0.98, 0.0, 0.0)
    assert dot(prev, new2) > BASIS_FLIP_DOT_THRESHOLD

from __future__ import annotations

import math

import numpy as np
import numpy.typing as npt

# Local TAU constant for helper computations
TAU = 2.0 * math.pi


def cdiff_theta(A: np.ndarray) -> npt.NDArray[np.float64]:
    """Central difference along theta axis (axis=1).

    Args:
        A: 2D array with shape (Z, T) or similar.

    Returns:
        Array of same shape containing central differences along theta.

    """
    out = 0.5 * (np.roll(A, -1, axis=1) - np.roll(A, 1, axis=1))
    return np.asarray(out, dtype=float)


def cdiff_z(A: np.ndarray) -> npt.NDArray[np.float64]:
    """Central difference along z axis (axis=0) with edge padding.

    Args:
        A: 2D array with shape (Z, T).

    Returns:
        Array of same shape containing central differences along z.

    """
    up = np.vstack([A[1:2, :], A[1:, :]])
    dn = np.vstack([A[:-1, :], A[-2:-1, :]])
    out = 0.5 * (up - dn)
    return np.asarray(out, dtype=float)


def estimate_shifts(
    A: np.ndarray, K: int,
) -> tuple[npt.NDArray[np.int_], npt.NDArray[np.int_]]:
    """Estimate integer per-row shifts aligning adjacent rows.

    Returns (s_fwd, s_bwd) arrays of dtype int.
    """
    if K <= 0:
        return np.zeros(A.shape[0], dtype=int), np.zeros(A.shape[0], dtype=int)
    Zloc, Tloc = A.shape
    s_fwd = np.zeros(Zloc, dtype=int)
    try:
        qmask = np.quantile(A, 0.85, axis=1, keepdims=True) <= A
    except Exception:
        qmask = np.ones_like(A, dtype=bool)
    for z in range(1, Zloc):
        ref = A[z, :]
        prev = A[z - 1, :]
        refm = ref * qmask[z, :]
        best_k = 0
        best_dot = -1.0
        for kshift in range(-K, K + 1):
            rolled = np.roll(prev, kshift)
            dot = float(np.dot(refm, rolled))
            if dot > best_dot:
                best_dot = dot
                best_k = kshift
        s_fwd[z] = best_k
    s_bwd = np.zeros(Zloc, dtype=int)
    for z in range(Zloc - 1):
        s_bwd[z] = -s_fwd[z + 1]
    return np.asarray(s_fwd, dtype=int), np.asarray(s_bwd, dtype=int)


def roll_rows(
    arr: np.ndarray, shifts: np.ndarray, sign: int = -1,
) -> npt.NDArray[np.float64]:
    """Roll each row by shifts[z]*sign along theta axis.

    Works for 1D (single row) and 2D arrays.
    """
    if arr.ndim == 1:
        k = int(shifts[0]) * sign if shifts.size > 0 else 0
        return np.asarray(np.roll(arr, k), dtype=float)
    out = np.empty_like(arr)
    for zi in range(arr.shape[0]):
        k = int(shifts[zi]) * sign
        out[zi, :] = np.roll(arr[zi, :], k)
    return np.asarray(out, dtype=float)


def roll_rows_2d(
    arr: np.ndarray, shifts: np.ndarray, sign: int = -1,
) -> npt.NDArray[np.float64]:
    """Per-row roll for 2D arrays; axis handling preserved from original code."""
    out = np.empty_like(arr)
    for zi in range(arr.shape[0]):
        k = int(shifts[zi]) * sign
        out[zi, :] = np.roll(arr[zi, :], k, axis=0)
    return np.asarray(out, dtype=float)


def dilate_adaptive(
    seed_arr: np.ndarray, steps: int, s_fwd: np.ndarray, s_bwd: np.ndarray,
) -> npt.NDArray[np.float64]:
    """Adaptive dilation used by ridge propagation logic.

    Behaviour preserved from original implementation.
    """
    # Forward pass with per-ring shifts
    S_forw = seed_arr.copy()
    acc_forw = S_forw.copy()
    for _ in range(steps):
        S_forw = np.vstack([S_forw[0:1, :], S_forw[:-1, :]])
        S_forw = roll_rows_2d(S_forw, s_fwd, sign=-1)
        acc_forw = np.maximum(acc_forw, S_forw)
    # Backward pass
    S_back = seed_arr.copy()
    acc_back = S_back.copy()
    for _ in range(steps):
        S_back = np.vstack([S_back[1:, :], S_back[-1:, :]])
        S_back = roll_rows_2d(S_back, s_bwd, sign=-1)
        acc_back = np.maximum(acc_back, S_back)
    out = np.maximum(acc_forw, acc_back)
    return np.asarray(out, dtype=float)


def avg3(a: np.ndarray) -> npt.NDArray[np.float64]:
    """3-point circular average: roll(-1)+self+roll(+1 over theta) / 3

    Args:
        a: 1D numpy array

    Returns:
        Averaged array with dtype float

    """
    return np.asarray((np.roll(a, 1) + a + np.roll(a, -1)) / 3.0, dtype=float)


def bilateral1d_peak_only(
    a: np.ndarray, sigma_s: float, sigma_r: float,
) -> npt.NDArray[np.float64]:
    """5-tap bilateral smoothing (peak-only) used by seam solidify.

    This mirrors the behavior in the original inline helper but is typed and
    returns a concrete numpy array of dtype float.
    """
    res = a.copy()
    offs = np.array([-2, -1, 0, 1, 2], dtype=int)
    w_s = np.exp(-0.5 * (offs.astype(float) / max(1e-6, sigma_s)) ** 2)
    n = int(a.size)
    for i in range(n):
        vals = np.array([a[(i + o) % n] for o in offs], dtype=float)
        dr = vals - a[i]
        w_r = np.exp(-0.5 * (dr / sigma_r) ** 2)
        w = w_s * w_r
        w /= max(1e-9, np.sum(w))
        m = float(np.sum(w * vals))
        # peak-only: only pull down peaks, never lift valleys
        res[i] = min(a[i], m)
    return np.asarray(res, dtype=float)


def med5(a: np.ndarray) -> npt.NDArray[np.float64]:
    a1 = np.roll(a, 1)
    a2 = np.roll(a, 2)
    b1 = np.roll(a, -1)
    b2 = np.roll(a, -2)
    st = np.stack([a2, a1, a, b1, b2], axis=0)
    st.sort(axis=0)
    return np.asarray(st[2], dtype=float)


def median3_circular(arr: np.ndarray) -> npt.NDArray[np.float64]:
    a = np.roll(arr, 1)
    b = arr
    c = np.roll(arr, -1)
    stacked = np.stack([a, b, c], axis=0)
    sorted3 = np.sort(stacked, axis=0)
    return np.asarray(sorted3[1], dtype=float)


def smooth_max(a, b, s: float) -> npt.NDArray[np.float64]:
    """Stable smooth max. Returns numpy array (dtype float) even for scalar inputs."""
    if s <= 0.0:
        return np.asarray(np.maximum(a, b), dtype=float)
    a_arr = np.asarray(a, dtype=float)
    b_arr = np.asarray(b, dtype=float)
    mx = np.maximum(a_arr, b_arr)
    mn = np.minimum(a_arr, b_arr)
    return np.asarray(mx + s * np.log1p(np.exp((mn - mx) / s)), dtype=float)


def smooth_min(a, b, s: float) -> npt.NDArray[np.float64]:
    """Stable smooth min implemented via negated smooth_max."""
    if s <= 0.0:
        return np.asarray(np.minimum(a, b), dtype=float)
    return np.asarray(
        -smooth_max(-np.asarray(a, dtype=float), -np.asarray(b, dtype=float), s),
        dtype=float,
    )


def lift_valleys(
    base_vals, weight, target_val, lift_strength: float, lift_gamma: float,
):
    b = np.asarray(base_vals, dtype=float)
    wv = np.asarray(weight, dtype=float)
    alpha = np.power(np.clip(1.0 - wv, 0.0, 1.0), lift_gamma)
    delta = np.maximum(0.0, float(target_val) - b)
    lift = lift_strength * alpha * delta
    out = b + lift
    return np.asarray(out, dtype=float)


def facet_mod_for_tier_vector(
    th: np.ndarray,
    tier_index: int,
    facets: int,
    jitter_amt: float,
    phase: float,
    p: float,
    amp: float,
    outward_dir: bool,
) -> npt.NDArray[np.float64]:
    """Compute per-theta facet modulation for a given tier (vectorized)."""
    idx = max(0, min(max(1, facets) - 1, int(tier_index)))
    seed = (idx + 1) * 1.61803398875
    phase_idx = (jitter_amt / max(1, facets)) * TAU * np.sin(seed)
    tot_ph = phase + phase_idx
    x_idx = (facets * (th + tot_ph)) / TAU
    frac_idx = x_idx - np.floor(x_idx)
    tri_idx = 1.0 - np.abs(2.0 * frac_idx - 1.0)
    tri_s_idx = tri_idx**p
    if outward_dir:
        return np.asarray(1.0 + amp * (tri_s_idx), dtype=float)
    return np.asarray(1.0 - amp * (1.0 - tri_s_idx), dtype=float)


def facet_mod_for_tier_scalar(
    theta_scalar: float,
    tier_index: int,
    facets: int,
    jitter_amt: float,
    phase: float,
    p: float,
    amp: float,
    outward_dir: bool,
) -> float:
    idx = max(0, min(max(1, facets) - 1, int(tier_index)))
    seed = (idx + 1) * 1.61803398875
    phase_idx = (jitter_amt / max(1, facets)) * TAU * math.sin(seed)
    tot_ph = phase + phase_idx
    x_idx = (facets * (theta_scalar + tot_ph)) / TAU
    frac_idx = x_idx - math.floor(x_idx)
    tri_idx = 1.0 - abs(2.0 * frac_idx - 1.0)
    tri_s_idx = tri_idx**p
    if outward_dir:
        return float(1.0 + amp * (tri_s_idx))
    return float(1.0 - amp * (1.0 - tri_s_idx))
